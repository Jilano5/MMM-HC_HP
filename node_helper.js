"use strict";


const NodeHelper = require("node_helper");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// ────────────────────────────────────────────────────────────────────────────
// Pure functions (exported for manual testing)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Derive HP periods as the 24-hour complement of HC periods.
 * Handles midnight-crossing HC blocks.
 * @param {Array} hcPeriods
 * @returns {Array}
 */
function deriveHpPeriods(hcPeriods) {
  const isHC = new Array(1440).fill(false);
  for (const p of hcPeriods) {
    const startMin = p.start.h * 60 + p.start.m;
    const endMin = p.end.h * 60 + p.end.m;
    if (endMin <= startMin) {
      // Midnight-crossing
      for (let i = startMin; i < 1440; i++) isHC[i] = true;
      for (let i = 0; i < endMin; i++) isHC[i] = true;
    } else {
      for (let i = startMin; i < endMin; i++) isHC[i] = true;
    }
  }

  const hpPeriods = [];
  let inHP = false;
  let blockStart = 0;
  for (let i = 0; i <= 1440; i++) {
    const isHp = i < 1440 ? !isHC[i] : false;
    if (isHp && !inHP) { inHP = true; blockStart = i; }
    if (!isHp && inHP) {
      inHP = false;
      const sh = Math.floor(blockStart / 60);
      const sm = blockStart % 60;
      const eh = Math.floor(i / 60);
      const em = i % 60;
      const displayEh = eh === 24 ? 0 : eh;
      const label = `${String(sh).padStart(2, "0")}h${String(sm).padStart(2, "0")} → ${String(displayEh).padStart(2, "0")}h${String(em).padStart(2, "0")}`;
      hpPeriods.push({
        type: "HP",
        start: { h: sh, m: sm },
        end: { h: displayEh, m: em },
        label,
      });
    }
  }
  return hpPeriods;
}

/**
 * Parse the offpeak_hours string from the contract API.
 * Expected format: "HC (HH[H]MM-HH[H]MM[;HH[H]MM-HH[H]MM]*)" — e.g. "HC (0H32-6H32;15H02-17H02)"
 * Multiple HC ranges are separated by semicolons inside a single parenthesis block.
 * Returns HC periods + derived HP periods, sorted by start time.
 * If distribution_tariff !== "HPHC", returns empty array with noHcOption: true.
 *
 * @param {string} offpeakHoursStr  e.g. "HC (0H32-6H32;15H02-17H02)"
 * @param {string} distributionTariff  e.g. "HPHC" | "BASE"
 * @returns {{ periods: Array, noHcOption: boolean }}
 */
function parsePeriods(offpeakHoursStr, distributionTariff) {
  if (distributionTariff !== "HPHC") {
    console.warn("[MMM-HC_HP] distribution_tariff is not HPHC — no HC/HP option on this contract.");
    return { periods: [], noHcOption: true };
  }

  // Extract the content inside the HC (...) block
  const outerMatch = /HC\s*\(([^)]+)\)/i.exec(offpeakHoursStr);
  if (!outerMatch) {
    console.warn(`[MMM-HC_HP] offpeak_hours format unrecognized: "${offpeakHoursStr}"`);
    return { periods: [], noHcOption: false };
  }

  // Each segment: e.g. "0H32-6H32"
  const segmentRegex = /(\d{1,2})[Hh](\d{2})-(\d{1,2})[Hh](\d{2})/;
  const hcPeriods = [];
  for (const seg of outerMatch[1].split(";")) {
    const match = segmentRegex.exec(seg.trim());
    if (!match) continue;
    const startH = parseInt(match[1], 10);
    const startM = parseInt(match[2], 10);
    const endH = parseInt(match[3], 10);
    const endM = parseInt(match[4], 10);
    const label = `${String(startH).padStart(2, "0")}h${String(startM).padStart(2, "0")} → ${String(endH).padStart(2, "0")}h${String(endM).padStart(2, "0")}`;
    hcPeriods.push({ type: "HC", start: { h: startH, m: startM }, end: { h: endH, m: endM }, label });
  }

  const hpPeriods = deriveHpPeriods(hcPeriods);
  const periods = [...hcPeriods, ...hpPeriods].sort(
    (a, b) => (a.start.h * 60 + a.start.m) - (b.start.h * 60 + b.start.m)
  );
  return { periods, noHcOption: false };
}

/**
 * Fetch contract data from myelectricaldata REST API.
 * Maps HTTP error codes to user-friendly error objects.
 * Token is never logged in clear text.
 *
 * @param {string} prm  14-digit usage point ID
 * @param {string} token  myelectricaldata auth token
 * @returns {Promise<{data?: object, error?: {message: string, code: number|string}}>}
 */
async function fetchContract(prm, token) {
  const url = `https://www.myelectricaldata.fr/contracts/${prm}/cache`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: { "Authorization": token },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorMap = {
        401: { message: "Token manquant ou invalide", code: 401 },
        404: { message: "PRM incorrect ou inconnu", code: 404 },
        429: { message: "Trop de requêtes — réessayez plus tard", code: 429 },
      };
      const err = errorMap[response.status] || {
        message: `Erreur serveur (${response.status})`,
        code: response.status,
      };
      console.error(`[MMM-HC_HP] API error ${response.status} — token [REDACTED]`);
      return { error: err };
    }

    const data = await response.json();
    return { data };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") {
      console.error("[MMM-HC_HP] API timeout after 10 s");
      return { error: { message: "L'API myelectricaldata ne répond pas (timeout 10 s)", code: "TIMEOUT" } };
    }
    console.error("[MMM-HC_HP] Network error:", e.message);
    return { error: { message: `Erreur réseau : ${e.message}`, code: "NETWORK" } };
  }
}

/**
 * Return true if the cache entry was fetched today (same calendar day).
 * @param {object|null} entry  CacheEntry | null
 * @returns {boolean}
 */
function isCacheFresh(entry) {
  if (!entry || !entry.fetchedAt) return false;
  return new Date(entry.fetchedAt).toDateString() === new Date().toDateString();
}

// ────────────────────────────────────────────────────────────────────────────
// NodeHelper
// ────────────────────────────────────────────────────────────────────────────

module.exports = NodeHelper.create({

  start() {
    this.cacheFilePath = path.join(__dirname, "cache", "contract.json");
    console.log("[MMM-HC_HP] node_helper started");
  },

  // ── Cache I/O ──────────────────────────────────────────────────────────────

  readCache(prm) {
    try {
      if (!fs.existsSync(this.cacheFilePath)) return null;
      const raw = fs.readFileSync(this.cacheFilePath, "utf8");
      const entry = JSON.parse(raw);
      if (!entry.fetchedAt || !entry.data || entry.prm !== prm) {
        console.warn("[MMM-HC_HP] Cache invalid or PRM mismatch — ignoring");
        return null;
      }
      return entry;
    } catch (e) {
      console.error("[MMM-HC_HP] readCache error:", e.message);
      return null;
    }
  },

  writeCache(prm, data) {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const entry = { fetchedAt: new Date().toISOString(), prm, data };
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(entry, null, 2), "utf8");
    } catch (e) {
      console.error("[MMM-HC_HP] writeCache error:", e.message);
    }
  },

  // ── Helper: parse contract and notify front-end ────────────────────────────

  _sendContractData(contractData, fetchedAt, fromCache) {
    try {
      const usagePoint = contractData.customer.usage_points[0];
      const contracts = usagePoint.contracts;
      const { periods, noHcOption } = parsePeriods(
        contracts.offpeak_hours || "",
        contracts.distribution_tariff || ""
      );
      this.sendSocketNotification("HCHP_CONTRACT_DATA", {
        periods,
        fetchedAt,
        fromCache,
        noHcOption,
      });
    } catch (e) {
      console.error("[MMM-HC_HP] Error parsing contract data:", e.message);
      this.sendSocketNotification("HCHP_ERROR", {
        message: "Erreur de lecture des données contractuelles",
        code: "PARSE",
      });
    }
  },

  // ── IPC handler ────────────────────────────────────────────────────────────

  async socketNotificationReceived(notification, payload) {
    if (notification !== "HCHP_FETCH_CONTRACT") {
      console.log(`[MMM-HC_HP] Unhandled notification: ${notification}`);
      return;
    }

    const { prm, token } = payload;

    // 1. Try fresh cache
    const cached = this.readCache(prm);
    if (isCacheFresh(cached)) {
      console.log("[MMM-HC_HP] Serving from fresh cache");
      this._sendContractData(cached.data, cached.fetchedAt, true);
      return;
    }

    // 2. Fetch from API
    console.log("[MMM-HC_HP] Fetching from API for PRM [REDACTED]");
    const result = await fetchContract(prm, token);

    if (result.error) {
      // Fallback to stale cache if available
      if (cached) {
        console.warn(`[MMM-HC_HP] API error (${result.error.code}), falling back to stale cache`);
        this._sendContractData(cached.data, cached.fetchedAt, true);
      } else {
        this.sendSocketNotification("HCHP_ERROR", result.error);
      }
      return;
    }

    // 3. Persist cache and notify
    this.writeCache(prm, result.data);
    this._sendContractData(result.data, new Date().toISOString(), false);
  },
});
