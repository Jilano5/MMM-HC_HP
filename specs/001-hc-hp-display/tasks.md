---
description: "Task list for MMM-OffPeakHours-France — Affichage HC/HP depuis myelectricaldata"
---

# Tasks : Affichage HC/HP depuis myelectricaldata

**Input**: Design documents from `specs/001-hc-hp-display/`
**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅

**Tests**: Non demandés explicitement — aucune tâche TDD générée. Validation via fixture
manuelle (`tests/fixtures/contract-hc.json`) selon quickstart.md.

## Format : `[ID] [P?] [Story?] Description`

- **[P]** : Exécutable en parallèle (fichiers différents, pas de dépendance non résolue)
- **[Story]** : Story utilisateur cible ([US1], [US2], [US3])

---

## Phase 1 : Setup

**Objectif** : Initialisation du projet — structure de fichiers, métadonnées, config outillage.

- [x] T001 Créer la structure de fichiers du module selon plan.md : `MMM-OffPeakHours-France.js`, `node_helper.js`, `MMM-OffPeakHours-France.css`, `package.json`, `.eslintrc.js`, `.gitignore`, `tests/fixtures/`, `cache/` (gitignored)
- [x] T002 [P] Rédiger `package.json` avec les métadonnées MagicMirror² (`name`, `version`, `description`, `main: "MMM-OffPeakHours-France.js"`, `author`, `license`) et la dépendance `node-fetch@^2`
- [x] T003 [P] Créer `.eslintrc.js` avec les règles ESLint pour Node.js CommonJS (`node_helper.js`) et ES6 navigateur (`MMM-OffPeakHours-France.js`) — interdire `console.log` au profit de `Log.*`
- [x] T004 [P] Créer `.gitignore` incluant `cache/contract.json` et `node_modules/`
- [x] T005 [P] Créer `tests/fixtures/contract-hc.json` — fixture anonymisée avec deux plages HC (`"HC (22H00-6H00), (13H00-15H00)"`) et `distribution_tariff: "HPHC"`, enveloppée dans la structure `CacheEntry` (`fetchedAt`, `prm`, `data`) définie dans data-model.md
- [x] T006 [P] Créer le squelette de `MMM-OffPeakHours-France.css` avec les sélecteurs vides : `.MMM-OffPeakHours-France`, `.MMM-offpeakhours-badge`, `.MMM-offpeakhours-badge--hc`, `.MMM-offpeakhours-badge--hp`, `.MMM-offpeakhours-list`, `.MMM-offpeakhours-list__item`, `.MMM-offpeakhours-cache-notice`, `.MMM-offpeakhours-error`

**Checkpoint** : Structure complète créée, `npm install` passe sans erreur.

---

## Phase 2 : Fondation (prérequis bloquants)

**Objectif** : Infrastructure IPC et client API partagés — DOIT être complète avant toute user story.

⚠️ **CRITIQUE** : Aucune user story ne peut démarrer avant la fin de cette phase.

- [x] T007 Scaffolder `node_helper.js` avec `NodeHelper.create({ socketNotificationReceived(notification, payload) {} })` — stub `HCHP_FETCH_CONTRACT` loggué via `Log.log` ; importer `node-fetch`, `fs`, `path`
- [x] T008 Scaffolder `MMM-OffPeakHours-France.js` avec `Module.register("MMM-OffPeakHours-France", { defaults: { updateInterval: 86400000, timeFormat: 24, animationSpeed: 1000 }, start() {}, getDom() { return document.createElement("div"); }, socketNotificationReceived(notification, payload) {} })` ; initialiser l'état interne `this._state = { periods: [], fetchedAt: null, fromCache: false, error: null, currentType: null }`
- [x] T009 [P] Implémenter la fonction `fetchContract(prm, token)` dans `node_helper.js` — appel `GET https://www.myelectricaldata.fr/contracts/{prm}/cache` avec header `Authorization: {token}`, timeout de 10 s via `AbortController`, renvoi du JSON parsé ; mapper les codes HTTP 401, 404, 429, 5xx vers des objets d'erreur `{ message, code }` avec token redacté dans les logs (`Log.error`) selon research.md R-007
- [x] T010 Implémenter le chemin d'erreur IPC dans `node_helper.js` (`this.sendSocketNotification("HCHP_ERROR", { message, code })`) et la réception dans `MMM-OffPeakHours-France.js` (`socketNotificationReceived` → stocker `this._state.error`, appeler `this.updateDom()`)

**Checkpoint** : `node_helper.js` et `MMM-OffPeakHours-France.js` chargent sans erreur dans MagicMirror (le module affiche un div vide, les logs montrent le stub IPC).

---

## Phase 3 : User Story 1 — Indicateur de tarification courante (Priority: P1) 🎯 MVP

**Objectif** : L'utilisateur voit en un coup d'œil si la tarification est HC ou HP ; le badge
bascule automatiquement à chaque changement de période.

**Test indépendant** : Configurer avec la fixture, vérifier l'affichage HC/HP ; modifier l'heure
système à 22h00 et vérifier le basculement en ≤ 60 s.

### Implémentation de User Story 1

- [x] T011 [P] [US1] Implémenter `parsePeriods(offpeakHoursStr)` dans `node_helper.js` — regex `/\((\d{1,2})[Hh](\d{0,2})-(\d{1,2})[Hh](\d{0,2})\)/g` sur le champ `offpeak_hours`, retourner un tableau `Period[]` `{ type: "HC", start: {h, m}, end: {h, m}, label }` ; si `distribution_tariff !== "HPHC"` retourner tableau vide avec flag `noHcOption: true` (research.md R-004)
- [x] T012 [P] [US1] Implémenter `getCurrentType(periods, now)` dans `MMM-OffPeakHours-France.js` — convertir `now` en minutes depuis minuit, itérer les plages HC, gérer le chevauchement minuit (`end < start`), retourner `"HC"` ou `"HP"` (research.md R-005)
- [x] T013 [US1] Câbler `node_helper.js` : dans le handler `HCHP_FETCH_CONTRACT`, appeler `fetchContract()`, passer `offpeak_hours` et `distribution_tariff` à `parsePeriods()`, puis envoyer `this.sendSocketNotification("HCHP_CONTRACT_DATA", { periods, fetchedAt: new Date().toISOString(), fromCache: false })` (contract IPC R-006)
- [x] T014 [US1] Câbler `MMM-OffPeakHours-France.js` : dans `socketNotificationReceived("HCHP_CONTRACT_DATA")`, stocker `periods`, `fetchedAt`, `fromCache` dans `this._state`, calculer `currentType` via `getCurrentType()`, appeler `this.updateDom(this.config.animationSpeed)`
- [x] T015 [US1] Implémenter `getDom()` dans `MMM-OffPeakHours-France.js` — section badge : élément `.MMM-offpeakhours-badge` avec texte « ⚡ Heures Creuses » ou « ⚡ Heures Pleines », classes CSS `.MMM-offpeakhours-badge--hc` / `--hp` selon `this._state.currentType` ; afficher « Chargement… » si `periods` vide et pas d'erreur
- [x] T016 [US1] Ajouter `setInterval(() => { this._state.currentType = getCurrentType(this._state.periods, new Date()); this.updateDom(0); }, 60000)` dans `start()` de `MMM-OffPeakHours-France.js` ; envoyer `HCHP_FETCH_CONTRACT` au démarrage
- [x] T017 [US1] Styliser le badge HP/HC dans `MMM-OffPeakHours-France.css` : `.MMM-offpeakhours-badge--hc` en bleu (`#1565c0`, police bold) ; `.MMM-offpeakhours-badge--hp` en orange (`#e65100`, police bold) ; taille de police ≥ 1.4em ; padding genereux pour lisibilité à distance

**Checkpoint** : Module affiché dans MagicMirror avec badge HC ou HP correct selon l'heure. Vérifier `tests/fixtures/contract-hc.json` en cache (cf. quickstart.md §5).

---

## Phase 4 : User Story 2 — Liste complète des plages HC/HP (Priority: P2)

**Objectif** : Toutes les plages HC et HP du contrat sont affichées simultanément sous le badge.

**Test indépendant** : Avec la fixture deux-plages-HC, vérifier que deux créneaux HC et les créneaux HP dérivés s'affichent dans l'ordre chronologique.

### Implémentation de User Story 2

- [x] T018 [P] [US2] Étendre `parsePeriods()` dans `node_helper.js` — calculer les plages HP comme complément des plages HC sur 24h ; normaliser les labels (`"22h00 → 06h00"` selon `config.timeFormat`) ; trier le tableau `Period[]` par `start.h` croissant avant envoi
- [x] T019 [US2] Étendre `getDom()` dans `MMM-OffPeakHours-France.js` — section liste `.MMM-offpeakhours-list` : itérer `this._state.periods`, créer un `.MMM-offpeakhours-list__item` par plage avec le label `type + " " + label`, appliquer classe `--hc` ou `--hp` selon le type ; la liste est rendue **sous** le badge
- [x] T020 [US2] Styliser la liste dans `MMM-OffPeakHours-France.css` : `.MMM-offpeakhours-list__item--hc` fond bleu clair / texte sombre ; `.MMM-offpeakhours-list__item--hp` fond orange clair / texte sombre ; espacement vertical entre items ; largeur max 100% du module

**Checkpoint** : Badge + liste affichés simultanément. Aucun défilement requis pour ≤ 6 plages (SC-003).

---

## Phase 5 : User Story 3 — Résilience hors ligne (Priority: P3)

**Objectif** : Le module continue de fonctionner avec les données en cache quand l'API est
indisponible ; un avertissement discret indique l'origine des données.

**Test indépendant** : Couper le réseau après une première synchronisation, redémarrer MagicMirror, vérifier l'affichage avec badge « Dernière synchro » et fonctionnement du basculement HC/HP.

### Implémentation de User Story 3

- [x] T021 [P] [US3] Implémenter `readCache(cacheFilePath, prm)` dans `node_helper.js` — lire et parser `cache/contract.json` ; valider le JSON, la date `fetchedAt`, la cohérence du PRM ; retourner `null` si invalide/absent selon les règles data-model.md §CacheEntry
- [x] T022 [P] [US3] Implémenter `writeCache(cacheFilePath, prm, data)` dans `node_helper.js` — créer le dossier `cache/` si absent, écrire `{ fetchedAt, prm, data }` en JSON ; gérer les erreurs d'écriture disque via `Log.error`
- [x] T023 [US3] Câbler la logique cache dans le handler `HCHP_FETCH_CONTRACT` de `node_helper.js` : (1) appeler `readCache()`, (2) si `isCacheFresh(entry)` → parser et envoyer avec `fromCache: true`, (3) sinon → appeler API, si succès écrire cache et envoyer avec `fromCache: false`, si échec → si cache dispo envoyer avec `fromCache: true`, sinon envoyer `HCHP_ERROR` (research.md R-003)
- [x] T024 [US3] Implémenter `getDom()` dans `MMM-OffPeakHours-France.js` — section cache notice : si `this._state.fromCache === true`, afficher `.MMM-offpeakhours-cache-notice` avec « Données du : [date formatée de fetchedAt] » sous la liste
- [x] T025 [US3] Implémenter `getDom()` dans `MMM-OffPeakHours-France.js` — section erreur : si `this._state.error !== null` et `periods` vide, afficher `.MMM-offpeakhours-error` avec le message approprié (`"⚠ Token manquant — vérifiez votre configuration"` pour 401, `"⚠ PRM incorrect"` pour 404, `"⚠ Aucune donnée disponible"` générique) — FR-009
- [x] T026 [US3] Styliser les nouveaux éléments dans `MMM-OffPeakHours-France.css` : `.MMM-offpeakhours-cache-notice` en gris clair, police ≤ 0.8em, italique ; `.MMM-offpeakhours-error` en rouge clair, police 1em, icône ⚠ visible

**Checkpoint** : Tester avec fixture en cache + `fetch` simulé en erreur (désactiver réseau). Vérifier SC-004 (fonctionnement ≥ 24 h hors ligne).

---

## Phase Finale : Polish & Cross-cutting

**Objectif** : Qualité, documentation, conformité constitution.

- [x] T027 [P] Rédiger `README.md` — sections : Description, Installation (`npm install`), Configuration (tableau de toutes les clés avec type / défaut / description), Prérequis myelectricaldata, Exemples de config, Résolution des problèmes (reprendre tableau quickstart.md §7) — FR-005 constitution
- [x] T028 [P] Rédiger `CHANGELOG.md` — entrée initiale `## [1.0.0] - 2026-03-03` listant les trois user stories livrées
- [x] T029 Passer ESLint sur `MMM-OffPeakHours-France.js` et `node_helper.js` (`npx eslint MMM-OffPeakHours-France.js node_helper.js`) et corriger toutes les erreurs jusqu'à zéro warning
- [x] T030 Valider le quickstart.md — suivre §1 à §6 sur une installation MagicMirror réelle ou VM : installation, fixture en cache, affichage badge + liste, simulation de basculement ; corriger le quickstart si écart constaté

---

## Dépendances & Ordre d'Exécution

### Dépendances entre phases

- **Phase 1 (Setup)** : aucune dépendance — démarrer immédiatement
- **Phase 2 (Fondation)** : dépend de Phase 1 — **bloque toutes les user stories**
- **Phase 3 (US1 — P1)** : dépend de Phase 2 — aucune dépendance vers US2/US3
- **Phase 4 (US2 — P2)** : dépend de Phase 2 — intègre US1 (badge existant conservé)
- **Phase 5 (US3 — P3)** : dépend de Phase 2 — intègre US1+US2 (cache alimente le même flux)
- **Phase Finale** : dépend de toutes les user stories désirées

### Dépendances inter-stories

- **US1 → US2** : T018 étend `parsePeriods()` écrit en T011 — séquencer US1 complet avant US2.
- **US1 → US3** : T023 câble le cache dans le handler créé en T013 — séquencer T013 avant T023.
- **US2 et US3** peuvent avancer en parallèle une fois US1 terminé.

### Ordre intra-phase obligatoire

| Phase | Ordre contraint |
|-------|----------------|
| Phase 2 | T007 → T008 → T009, T010 (T009 et T010 en parallèle après T008) |
| Phase 3 | T011, T012 en parallèle → T013 → T014 → T015 → T016 → T017 |
| Phase 4 | T018 → T019 → T020 |
| Phase 5 | T021, T022 en parallèle → T023 → T024, T025 en parallèle → T026 |

---

## Opportunités Parallèles

### Phase 1 — toutes les tâches marquées [P] simultanément

```
T002 package.json
T003 .eslintrc.js    } → lancer ensemble après T001
T004 .gitignore
T005 fixture JSON
T006 CSS squelette
```

### Phase 3 — lancement simultané

```
T011 parsePeriods()   } → en parallèle (fichiers différents)
T012 getCurrentType() }
```

### Phase 5 — lancement simultané

```
T021 readCache()  } → en parallèle (même fichier, fonctions indépendantes)
T022 writeCache() }

T024 fromCache display  } → en parallèle après T023
T025 error display      }
```

---

## Stratégie d'Implémentation

### MVP — User Story 1 uniquement (badge HC/HP)

1. Compléter Phase 1 (Setup)
2. Compléter Phase 2 (Fondation)
3. Compléter Phase 3 (US1 — T011 à T017)
4. **STOP & VALIDER** : badge HC/HP correct + basculement auto ≤ 60 s
5. Déployer si satisfaisant

### Livraison incrémentale

1. Phase 1 + 2 → infrastructure prête
2. Phase 3 → MVP (badge) → valider indépendamment
3. Phase 4 → liste des plages → valider indépendamment
4. Phase 5 → résilience → valider indépendamment (couper réseau)
5. Phase Finale → polish & release

---

## Récapitulatif

| Phase | Tâches | Stories | Parallèles |
|-------|--------|---------|------------|
| 1 — Setup | T001–T006 | — | T002–T006 |
| 2 — Fondation | T007–T010 | — | T009 |
| 3 — US1 (P1) 🎯 | T011–T017 | US1 | T011, T012 |
| 4 — US2 (P2) | T018–T020 | US2 | — |
| 5 — US3 (P3) | T021–T026 | US3 | T021+T022, T024+T025 |
| Final — Polish | T027–T030 | — | T027, T028 |
| **Total** | **30 tâches** | **3 stories** | **10 opportunités** |
