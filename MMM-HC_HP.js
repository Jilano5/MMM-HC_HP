"use strict";

/* global Module, Log */

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers (front-end, no Node.js require)
// ────────────────────────────────────────────────────────────────────────────

/** Returns "HC" or "HP" for the given Date, handling midnight-crossing blocks. */
function getCurrentType(periods, now) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const p of periods) {
    if (p.type !== "HC") continue;
    const s = p.start.h * 60 + p.start.m;
    const e = p.end.h * 60 + p.end.m;
    if (e <= s) { if (nowMin >= s || nowMin < e) return "HC"; }
    else        { if (nowMin >= s && nowMin < e) return "HC"; }
  }
  return "HP";
}

/** Minutes until the next HC↔HP transition. */
function getNextTransitionMinutes(periods, nowMin, currentType) {
  const hcPeriods = periods.filter(p => p.type === "HC");
  let minDiff = Infinity;
  for (const p of hcPeriods) {
    const s = p.start.h * 60 + p.start.m;
    const e = p.end.h * 60 + p.end.m;
    const target = currentType === "HC" ? e : s;
    const diff = ((target - nowMin) + 1440) % 1440 || 1440;
    if (diff < minDiff) minDiff = diff;
  }
  return minDiff === Infinity ? null : minDiff;
}

/** Format minutes as "Xh MM" (e.g. 150 → "2h 30"). */
function formatCountdown(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}`;
}

/** Format a minute-of-day as "Xh" or "XhYY". */
function formatHour(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Build ordered {start, end, type} segments covering [0, 1440]. */
function buildTimelineSegments(periods) {
  const isHC = new Array(1440).fill(false);
  for (const p of periods.filter(q => q.type === "HC")) {
    const s = p.start.h * 60 + p.start.m;
    const e = p.end.h * 60 + p.end.m;
    if (e <= s) {
      for (let i = s; i < 1440; i++) isHC[i] = true;
      for (let i = 0; i < e; i++) isHC[i] = true;
    } else {
      for (let i = s; i < e; i++) isHC[i] = true;
    }
  }
  const segs = [];
  let cur = isHC[0] ? "HC" : "HP", start = 0;
  for (let i = 1; i <= 1440; i++) {
    const t = i < 1440 ? (isHC[i] ? "HC" : "HP") : null;
    if (t !== cur) { segs.push({ start, end: i, type: cur }); cur = t; start = i; }
  }
  return segs;
}

/** Sorted list of transition minutes (start/end of HC periods), excluding 0 and 1440. */
function getTransitionPoints(periods) {
  const pts = new Set();
  for (const p of periods.filter(q => q.type === "HC")) {
    const s = p.start.h * 60 + p.start.m;
    const e = p.end.h * 60 + p.end.m;
    if (s > 0 && s < 1440) pts.add(s);
    if (e > 0 && e < 1440) pts.add(e);
  }
  return [...pts].sort((a, b) => a - b);
}

// ────────────────────────────────────────────────────────────────────────────
// MagicMirror² Module
// ────────────────────────────────────────────────────────────────────────────

Module.register("MMM-HC_HP", {
  getStyles() {
    return ["MMM-HC_HP.css"];
  },

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

    const { periods, currentType, error, noHcOption } = this._state;

    // ── Error ──
    if (error && periods.length === 0) {
      const errEl = document.createElement("span");
      errEl.classList.add("mmm-hc-hp-error");
      const msgs = {
        401: "⚠ Token manquant ou invalide",
        404: "⚠ PRM incorrect",
        CONFIG: "⚠ Configuration incomplète : 'token' et 'prm' requis",
        TIMEOUT: "⚠ L'API myelectricaldata ne répond pas",
        NETWORK: "⚠ Aucune donnée disponible (erreur réseau)",
        PARSE: "⚠ Erreur de lecture des données contractuelles",
      };
      errEl.textContent = msgs[error.code] || "⚠ Aucune donnée disponible";
      wrapper.appendChild(errEl);
      return wrapper;
    }

    // ── No HC option ──
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
      loading.classList.add("mmm-hc-hp-loading");
      loading.textContent = "Chargement…";
      wrapper.appendChild(loading);
      return wrapper;
    }

    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const isHC = currentType === "HC";

    // ── Status row: dot + emoji + label ──
    const statusRow = document.createElement("div");
    statusRow.classList.add("mmm-hc-hp-status");

    const dot = document.createElement("div");
    dot.classList.add("mmm-hc-hp-dot", isHC ? "mmm-hc-hp-dot--hc" : "mmm-hc-hp-dot--hp");
    statusRow.appendChild(dot);

    const emoji = document.createElement("span");
    emoji.classList.add("mmm-hc-hp-emoji");
    emoji.textContent = isHC ? "🌙" : "☀️";
    statusRow.appendChild(emoji);

    const label = document.createElement("span");
    label.classList.add("mmm-hc-hp-label", isHC ? "mmm-hc-hp-label--hc" : "mmm-hc-hp-label--hp");
    label.textContent = isHC ? "Heure Creuse" : "Heure Pleine";
    statusRow.appendChild(label);

    wrapper.appendChild(statusRow);

    // ── Countdown ──
    const diffMin = getNextTransitionMinutes(periods, nowMin, currentType);
    if (diffMin !== null) {
      const countdown = document.createElement("div");
      countdown.classList.add("mmm-hc-hp-countdown");

      const cdLabel = document.createElement("span");
      cdLabel.classList.add("mmm-hc-hp-countdown__label");
      cdLabel.textContent = isHC ? "↗ Heure Pleine dans" : "↘ Heure Creuse dans";
      countdown.appendChild(cdLabel);

      const cdValue = document.createElement("span");
      cdValue.classList.add("mmm-hc-hp-countdown__value");
      cdValue.textContent = formatCountdown(diffMin);
      countdown.appendChild(cdValue);

      wrapper.appendChild(countdown);
    }

    // ── Day label ──
    const dayLabel = document.createElement("div");
    dayLabel.classList.add("mmm-hc-hp-day-label");
    dayLabel.textContent = "AUJOURD'HUI";
    wrapper.appendChild(dayLabel);

    // ── Timeline bar ──
    const bar = document.createElement("div");
    bar.classList.add("mmm-hc-hp-bar");
    for (const seg of buildTimelineSegments(periods)) {
      const el = document.createElement("div");
      el.classList.add("mmm-hc-hp-bar__seg", `mmm-hc-hp-bar__seg--${seg.type.toLowerCase()}`);
      el.style.width = `${((seg.end - seg.start) / 1440 * 100).toFixed(3)}%`;
      bar.appendChild(el);
    }
    wrapper.appendChild(bar);

    // ── Transition labels + ticks ──
    const pts = getTransitionPoints(periods);
    if (pts.length > 0) {
      const labelsRow = document.createElement("div");
      labelsRow.classList.add("mmm-hc-hp-ticks__labels");
      const ticksRow = document.createElement("div");
      ticksRow.classList.add("mmm-hc-hp-ticks__marks");

      for (const pt of pts) {
        const pct = `${(pt / 1440 * 100).toFixed(3)}%`;

        const lbl = document.createElement("span");
        lbl.classList.add("mmm-hc-hp-ticks__hour");
        lbl.style.left = pct;
        lbl.textContent = formatHour(pt);
        labelsRow.appendChild(lbl);

        const tick = document.createElement("div");
        tick.classList.add("mmm-hc-hp-ticks__mark");
        tick.style.left = pct;
        ticksRow.appendChild(tick);
      }

      wrapper.appendChild(labelsRow);
      wrapper.appendChild(ticksRow);
    }

    return wrapper;
  },
});
