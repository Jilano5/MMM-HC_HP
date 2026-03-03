"use strict";

/* global Module, Log */

// ────────────────────────────────────────────────────────────────────────────
// Pure helper (front-end, no Node.js require)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Determine whether the current time falls in an HC or HP period.
 * Handles midnight-crossing HC blocks (e.g. 22h→6h).
 *
 * @param {Array}  periods  Period[] from node_helper
 * @param {Date}   now
 * @returns {"HC"|"HP"}
 */
function getCurrentType(periods, now) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const p of periods) {
    if (p.type !== "HC") continue;
    const startMin = p.start.h * 60 + p.start.m;
    const endMin = p.end.h * 60 + p.end.m;
    if (endMin <= startMin) {
      // Midnight-crossing HC block
      if (nowMin >= startMin || nowMin < endMin) return "HC";
    } else {
      if (nowMin >= startMin && nowMin < endMin) return "HC";
    }
  }
  return "HP";
}

// ────────────────────────────────────────────────────────────────────────────
// MagicMirror² Module
// ────────────────────────────────────────────────────────────────────────────

Module.register("MMM-HC_HP", {
  defaults: {
    /** myelectricaldata auth token (54-char string) — REQUIRED */
    token: null,
    /** 14-digit usage-point ID (PRM/PDL) — REQUIRED */
    prm: null,
    /** How often to refresh from API (ms). Default: once per day */
    updateInterval: 86400000,
    /** 12 or 24 (unused by current label format, reserved for future use) */
    timeFormat: 24,
    /** DOM update animation speed (ms) */
    animationSpeed: 1000,
  },

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start() {
    this._state = {
      periods: [],
      fetchedAt: null,
      fromCache: false,
      error: null,
      currentType: null,
      noHcOption: false,
    };

    if (!this.config.token || !this.config.prm) {
      Log.error("[MMM-HC_HP] 'token' and 'prm' are required in config.");
      this._state.error = {
        message: "Configuration incomplète : 'token' et 'prm' requis",
        code: "CONFIG",
      };
      this.updateDom();
      return;
    }

    // Request contract data from node_helper on start
    this.sendSocketNotification("HCHP_FETCH_CONTRACT", {
      prm: this.config.prm,
      token: this.config.token,
    });

    // Update live tarification badge every minute — no API call
    setInterval(() => {
      if (this._state.periods.length > 0) {
        this._state.currentType = getCurrentType(this._state.periods, new Date());
        this.updateDom(0);
      }
    }, 60000);
  },

  // ── IPC ───────────────────────────────────────────────────────────────────

  socketNotificationReceived(notification, payload) {
    if (notification === "HCHP_CONTRACT_DATA") {
      this._state.periods = payload.periods || [];
      this._state.fetchedAt = payload.fetchedAt;
      this._state.fromCache = payload.fromCache;
      this._state.noHcOption = payload.noHcOption || false;
      this._state.error = null;
      this._state.currentType = getCurrentType(this._state.periods, new Date());
      this.updateDom(this.config.animationSpeed);
    } else if (notification === "HCHP_ERROR") {
      this._state.error = payload;
      this.updateDom(this.config.animationSpeed);
    }
  },

  // ── DOM ───────────────────────────────────────────────────────────────────

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.classList.add("MMM-HC_HP");

    const { periods, currentType, fetchedAt, fromCache, error, noHcOption } = this._state;

    // ── Error (no data) ──
    if (error && periods.length === 0) {
      const errEl = document.createElement("span");
      errEl.classList.add("mmm-hc-hp-error");
      const errorMessages = {
        401: "⚠ Token manquant ou invalide — vérifiez votre configuration",
        404: "⚠ PRM incorrect — vérifiez votre configuration",
        CONFIG: "⚠ Configuration incomplète : 'token' et 'prm' requis",
        TIMEOUT: "⚠ L'API myelectricaldata ne répond pas",
        NETWORK: "⚠ Aucune donnée disponible (erreur réseau)",
        PARSE: "⚠ Erreur de lecture des données contractuelles",
      };
      errEl.textContent = errorMessages[error.code] || "⚠ Aucune donnée disponible";
      wrapper.appendChild(errEl);
      return wrapper;
    }

    // ── No HC/HP option on contract ──
    if (noHcOption) {
      const el = document.createElement("span");
      el.classList.add("mmm-hc-hp-error");
      el.textContent = "⚠ Ce contrat n'a pas d'option HC/HP";
      wrapper.appendChild(el);
      return wrapper;
    }

    // ── Loading ──
    if (periods.length === 0) {
      const loading = document.createElement("span");
      loading.textContent = "Chargement…";
      wrapper.appendChild(loading);
      return wrapper;
    }

    // ── Badge pill: current tarification (Option A) ──
    const badge = document.createElement("div");
    badge.classList.add("mmm-hc-hp-badge");
    badge.classList.add(currentType === "HC" ? "mmm-hc-hp-badge--hc" : "mmm-hc-hp-badge--hp");
    badge.textContent = currentType === "HC" ? "⚡ Heures Creuses" : "⚡ Heures Pleines";
    wrapper.appendChild(badge);

    // ── Timeline 24h (Option C) ──
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const cursorPct = (nowMin / 1440 * 100).toFixed(2);

    const timeline = document.createElement("div");
    timeline.classList.add("mmm-hc-hp-timeline");

    const bar = document.createElement("div");
    bar.classList.add("mmm-hc-hp-timeline__bar");

    // Render one segment div per period (handle midnight-crossing HC)
    for (const p of periods) {
      const sMin = p.start.h * 60 + p.start.m;
      const eMin = p.end.h * 60 + p.end.m;
      const cls = `mmm-hc-hp-timeline__seg--${p.type.toLowerCase()}`;

      const segs = (p.type === "HC" && eMin <= sMin)
        ? [[sMin, 1440], [0, eMin]]
        : [[sMin, eMin]];

      for (const [s, e] of segs) {
        if (s === e) continue;
        const seg = document.createElement("div");
        seg.classList.add("mmm-hc-hp-timeline__seg", cls);
        seg.style.left = `${(s / 1440 * 100).toFixed(2)}%`;
        seg.style.width = `${((e - s) / 1440 * 100).toFixed(2)}%`;
        bar.appendChild(seg);
      }
    }

    // NOW cursor
    const cursor = document.createElement("div");
    cursor.classList.add("mmm-hc-hp-timeline__cursor");
    cursor.style.left = `${cursorPct}%`;
    bar.appendChild(cursor);

    timeline.appendChild(bar);

    // Hour labels: 0h 6h 12h 18h 24h
    const labels = document.createElement("div");
    labels.classList.add("mmm-hc-hp-timeline__labels");
    for (const l of ["0h", "6h", "12h", "18h", "24h"]) {
      const span = document.createElement("span");
      span.textContent = l;
      labels.appendChild(span);
    }
    timeline.appendChild(labels);
    wrapper.appendChild(timeline);

    // ── Cache notice ──
    if (fromCache && fetchedAt) {
      const notice = document.createElement("span");
      notice.classList.add("mmm-hc-hp-cache-notice");
      notice.textContent = new Date(fetchedAt).toLocaleDateString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      wrapper.appendChild(notice);
    }

    return wrapper;
  },
});
