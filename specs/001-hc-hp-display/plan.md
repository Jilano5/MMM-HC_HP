# Implementation Plan : Affichage HC/HP depuis myelectricaldata

**Branch**: `001-hc-hp-display` | **Date**: 2026-03-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-hc-hp-display/spec.md`

## Summary

Module MagicMirror² affichant en temps réel les plages horaires HC/HP issues du contrat
électrique de l'utilisateur (via myelectricaldata) et la tarification courante (HC ou HP),
mise à jour à la minute côté front-end. Les données contractuelles sont récupérées depuis
l'endpoint `/contracts/{prm}/cache` (au plus une fois par jour) et stockées localement
dans un fichier JSON pour garantir le fonctionnement hors ligne.

## Technical Context

**Language/Version**: Node.js v24 LTS (node_helper — CommonJS) + ES6 navigateur
(MMM-OffPeakHours-France.js — module MagicMirror)
**Primary Dependencies**: `node-fetch` v2 (CommonJS) pour les appels HTTP dans node_helper ;
aucun framework front-end (DOM helpers MagicMirror natifs uniquement)
**Storage**: Fichier JSON local `cache/contract.json` (chemin dans le répertoire du module)
**Testing**: ESLint + tests manuels sur fixture JSON anonymisée (`tests/fixtures/`)
**Target Platform**: MagicMirror² ≥ 2.20 — Linux (Raspberry Pi OS / Debian), Node.js fourni
par MagicMirror
**Project Type**: MagicMirror module (plugin)
**Performance Goals**: Rendu DOM < 100 ms ; timeout appel API ≤ 10 s
**Constraints**: ≤ 1 appel API distant par jour calendaire ; fonctionnement hors ligne ≥ 24 h ;
token jamais exposé dans les logs, l'UI ou les fichiers commités
**Scale/Scope**: Installation mono-utilisateur, compteur unique (1 PRM)

## Constitution Check

*GATE : Must pass before Phase 0 research. Re-check after Phase 1 design.*

**I. MagicMirror Module Convention** ✅
- `MMM-OffPeakHours-France.js` : module principal (front-end), `Module.register(...)` présent, DOM
  exclusivement dans `getDom()`.
- `node_helper.js` : tous les appels API et la gestion du cache y sont confinés.
- `MMM-OffPeakHours-France.css` : seul fichier de styles, aucun style inline.
- `package.json` : métadonnées conformes à la convention MagicMirror².

**II. API Isolation — myelectricaldata Only** ✅
- Endpoint unique : `GET /contracts/{prm}/cache` (fallback `/contracts/{prm}/` si cache
  absent côté serveur).
- Token lu exclusivement depuis la config MagicMirror ; jamais loggué.
- Aucun appel Enedis direct, aucun scraping, aucun proxy tiers.

**III. Configuration-Driven Behaviour** ✅
- Clés requises : `token`, `prm`.
- Clés optionnelles avec `defaults` : `updateInterval` (86 400 000 ms), `timeFormat` (24),
  `animationSpeed` (1000).
- Aucune modification du code source pour changer le comportement.

**IV. Graceful Degradation & Error Visibility** ✅
- Cache local consulté avant tout appel distant ; fallback sur cache si appel échoue.
- Badge « Dernière synchro : … » affiché si données issues du cache.
- Message explicite si aucune donnée disponible.
- `Log.error` avec redaction du token sur toute erreur API.

**V. Simplicity & YAGNI** ✅
- Un seul module, aucun paquet externe au-delà de `node-fetch` v2.
- Pas de build step ; code lisible directement.

**VI. Display Contract — HC/HP Ranges & Current Tarification** ✅
- Deux zones d'affichage simultanées : badge HC/HP courant + liste des plages.
- `setInterval(60 000)` côté front-end pour réévaluation de la période courante.

**Post-design re-check** : ✅ aucune violation constatée après Phase 1.

## Project Structure

### Documentation (this feature)

```text
specs/001-hc-hp-display/
├── plan.md          # Ce fichier
├── research.md      # Phase 0
├── data-model.md    # Phase 1
├── quickstart.md    # Phase 1
├── contracts/       # Phase 1
│   └── myelectricaldata-contracts.md
└── tasks.md         # Phase 2 (/speckit.tasks — non créé ici)
```

### Source Code (repository root)

```text
MMM-OffPeakHours-France.js          # Module MagicMirror (front-end, ES6)
node_helper.js        # Helper serveur (CommonJS) — appels API + cache
MMM-OffPeakHours-France.css         # Styles du module
package.json          # Métadonnées du module

cache/
└── contract.json     # Cache local (gitignored)

tests/
└── fixtures/
    └── contract-hc.json   # Fixture anonymisée pour tests manuels

.eslintrc.js          # Configuration ESLint
.gitignore            # Inclut cache/contract.json et config.js
CHANGELOG.md
README.md
```

**Structure Decision**: Module MagicMirror autonome à la racine du dépôt, conforme à la
structure standard des modules MagicMirror² (pas de sous-répertoires `src/`). La répartition
front-end / serveur est assurée par la séparation `MMM-OffPeakHours-France.js` / `node_helper.js` imposée
par le framework.
