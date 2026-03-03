<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0 (MINOR — new display principle added, cache strategy added,
  updateInterval revised, API name corrected to myelectricaldata)
Modified principles:
  II: "myelectridata" → "myelectricaldata" (correct service name); cache usage mandated
  III: updateInterval default changed from 3 600 000 ms (1 h) to 86 400 000 ms (24 h);
       removed displayPeriods (superseded by principle VI)
Added sections/principles:
  VI. Display Contract — HC/HP ranges + current tarification indicator (new principle)
Templates requiring updates:
  ✅ .specify/memory/constitution.md — this file
  ✅ .specify/templates/plan-template.md — generic; no change needed
  ✅ .specify/templates/spec-template.md — generic; no change needed
  ✅ .specify/templates/tasks-template.md — generic; no change needed
Follow-up TODOs: none
-->

# MMM-OffPeakHours-France Constitution

## Core Principles

### I. MagicMirror Module Convention (NON-NEGOTIABLE)

The project MUST follow the official MagicMirror² module structure at all times:
- The module entry point MUST be `MMM-OffPeakHours-France.js` (main module file, front-end).
- A `node_helper.js` MUST handle all server-side logic including API calls to myelectricaldata.
- A `package.json` MUST declare metadata consistent with `MagicMirror` module conventions.
- CSS customisation MUST live in `MMM-OffPeakHours-France.css` only; no inline styles injected via JS.
- The module MUST register itself via `Module.register("MMM-OffPeakHours-France", {...})`.
- No direct DOM manipulation outside the `getDom()` method.

### II. API Isolation — myelectricaldata Only

All data retrieval MUST go through the myelectricaldata REST API exclusively:
- The `node_helper.js` MUST authenticate using the user-supplied `token` config key; the token
  MUST never be hard-coded or committed to the repository.
- The only data consumed from the API MUST be the HC/HP schedule extracted from the user's
  active contract (endpoint `/v1/contrat` or the nearest equivalent).
- The module MUST use myelectricaldata's server-side cache: the cached contract data endpoint
  MUST be preferred over a live read when the cache is available; a live call MUST only be
  triggered when no valid cache entry exists for the current day.
- Any future data source addition MUST be treated as a MINOR constitutional amendment.
- No scraping, no direct Enedis API calls, no third-party proxies.

### III. Configuration-Driven Behaviour

User-facing behaviour MUST be fully configurable via the `config` block in `config.js`:
- Required config keys: `token` (myelectricaldata API token), `prm` (PRM/PDL meter identifier).
- Optional config keys:
  - `updateInterval` (milliseconds, default 86 400 000 — 24 h; MUST NOT be set below 3 600 000).
  - `timeFormat` (12 or 24, default 24).
  - `animationSpeed` (ms, default 1000).
- The module MUST provide sensible defaults for every optional key via `defaults`.
- Changing any config key MUST NOT require modifying module source files.

### IV. Graceful Degradation & Error Visibility

The module MUST remain functional and informative even when the API is unavailable:
- On fetch failure the display MUST show the last known schedule with a "last updated" timestamp
  and an error badge — it MUST NOT show a blank panel.
- API errors MUST be logged to the MagicMirror logger (`Log.error`) with the HTTP status code
  and a human-readable message; raw tokens MUST be redacted from logs.
- Network timeouts MUST be enforced (≤ 10 s per request) to avoid blocking the node helper.
- If no data has ever been fetched the module MUST display a clear "Chargement…" or
  "Token manquant" message as appropriate.

### V. Simplicity & YAGNI

The module MUST solve one problem: display HC/HP ranges and the current tarification from the
user's myelectricaldata contract. No feature MUST be added without a concrete user need:
- The codebase MUST stay as a single MagicMirror module (no sub-package, no external daemon).
- Dependencies beyond what MagicMirror provides (`node-fetch` or built-in `https`) MUST be
  justified and minimal.
- Code MUST be readable without a build step — plain ES6 in the front-end module file, CommonJS
  in `node_helper.js`.

### VI. Display Contract — HC/HP Ranges & Current Tarification

The module display MUST always show two distinct pieces of information:
1. **HC/HP time ranges**: all daily Heures Creuses and Heures Pleines slots defined in the
   contract, listed with their start and end times (e.g., « HC 22h00 → 06h00 »).
2. **Current tarification indicator**: a clearly highlighted badge or label showing whether the
   current moment falls in Heures Creuses or Heures Pleines, updated in real time (re-evaluated
   every minute client-side without an API call).
- The two display areas MUST be visually distinct (different colours or icons).
- The current-tarification indicator MUST update automatically using `setInterval` on the
  front-end; no new API call is needed for this update.
- Both pieces of information MUST be present simultaneously on screen at all times.

## Technical Constraints

**Runtime**: Node.js LTS (as bundled with MagicMirror²), browser-side ES6.

**Dependencies**: `node-fetch` (or Node.js built-in `https`) for API calls in `node_helper.js`;
no front-end framework (MagicMirror's built-in DOM helpers only).

**Target Platform**: MagicMirror² running on Raspberry Pi / Linux; module MUST work
with MagicMirror version ≥ 2.20.

**API Contract**: myelectricaldata REST API (`https://api.myelectricaldata.fr`) — authentication
via Bearer token; HC/HP schedule retrieved from the contract endpoint using the cached data path
when available. Response MUST be parsed defensively (unknown keys ignored, missing fields default
gracefully).

**Refresh Strategy**: Contract data is refreshed at most once every 24 hours. The `node_helper.js`
MUST persist the last fetch timestamp and the raw contract payload to a local JSON file (path
configurable, default `modules/MMM-OffPeakHours-France/cache/contract.json`). On module startup and on each
`updateInterval` tick, the helper MUST check whether the cached file is from the current calendar
day (local time); only if the cache is absent or stale is a live API call issued.

**Security**: The user's myelectricaldata token is sensitive. It MUST be read exclusively from
`config.js` (which MUST be in `.gitignore`); it MUST never appear in logs, UI, or committed files.

**Internationalisation**: Display labels MUST be French by default (« Heures Creuses »,
« Heures Pleines »); an optional `language` config key MAY be added in a later MINOR amendment.

## Development Workflow

1. **Branch naming**: `feat/<short-description>` for features, `fix/<short-description>` for
   bug fixes, `docs/<short-description>` for documentation.
2. **Manual testing gate**: Any PR MUST be tested against a live or mock myelectricaldata response
   before merge; a sample anonymised fixture MUST be committed under `tests/fixtures/`.
3. **Linting**: ESLint MUST be configured and pass with zero errors before merge; the ruleset
   MUST be stored in `.eslintrc.js` at the repository root.
4. **Changelog**: Every merged PR MUST add an entry to `CHANGELOG.md` following Keep a Changelog
   format.
5. **README**: `README.md` MUST always document all supported config keys with type, default, and
   description; it MUST be updated in the same PR that adds or changes a config key.

## Governance

This constitution supersedes all other conventions in the repository. Any amendment MUST:
1. Increment `CONSTITUTION_VERSION` following semantic versioning
   (MAJOR: principle removal/redefinition, MINOR: new principle/section, PATCH: wording/typo).
2. Record the rationale in the Sync Impact Report comment at the top of this file.
3. Be reflected in dependent templates (plan, spec, tasks) before the amendment is merged.

All PRs and code reviews MUST verify compliance with principles I–VI. A checklist item
confirming "Constitution Check passed" MUST appear in each PR description.

**Version**: 1.1.0 | **Ratified**: 2026-03-03 | **Last Amended**: 2026-03-03
