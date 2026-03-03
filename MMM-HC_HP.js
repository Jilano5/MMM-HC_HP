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

    // ── Loading ──
    if (periods.length === 0) {
      const loading = document.createElement("span");
      loading.textContent = "Chargement…";
      wrapper.appendChild(loading);
      return wrapper;
    }

    // ── Badge: current tarification (US1) ──
    if (!noHcOption) {
      const badge = document.createElement("div");
      badge.classList.add("mmm-hc-hp-badge");
      if (currentType === "HC") {
        badge.classList.add("mmm-hc-hp-badge--hc");
        badge.textContent = "⚡ Heures Creuses";
      } else {
        badge.classList.add("mmm-hc-hp-badge--hp");
        badge.textContent = "⚡ Heures Pleines";
      }
      wrapper.appendChild(badge);
    }

    // ── List: all HC/HP periods (US2) ──
    const list = document.createElement("ul");
    list.classList.add("mmm-hc-hp-list");
    for (const p of periods) {
      const item = document.createElement("li");
      item.classList.add(
        "mmm-hc-hp-list__item",
        `mmm-hc-hp-list__item--${p.type.toLowerCase()}`
      );
      item.textContent = `${p.type}  ${p.label}`;
      list.appendChild(item);
    }
    wrapper.appendChild(list);

    // ── Cache notice (US3) ──
    if (fromCache && fetchedAt) {
      const notice = document.createElement("span");
      notice.classList.add("mmm-hc-hp-cache-notice");
      const date = new Date(fetchedAt);
      const formatted = date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      notice.textContent = `Données du : ${formatted}`;
      wrapper.appendChild(notice);
    }

    return wrapper;
  },
});
