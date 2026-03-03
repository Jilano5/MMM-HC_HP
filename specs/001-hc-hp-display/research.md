# Research : Affichage HC/HP depuis myelectricaldata

**Feature**: 001-hc-hp-display
**Date**: 2026-03-03

---

## R-001 — Endpoint myelectricaldata pour les données contractuelles

**Décision**: Utiliser `GET /contracts/{prm}/cache` (avec Header `Authorization: <token>`)
comme appel principal. Si le cache serveur est absent ou expiré, myelectricaldata redirige
automatiquement vers un appel live Enedis. Le module n'a pas besoin de gérer deux endpoints
séparés — le cache est transparent.

**URL**: `https://www.myelectricaldata.fr/contracts/{usage_point_id}/cache`
**Authentification**: Header `Authorization: <token>` (clé API de 54 caractères)
**Méthode**: GET

**Rationale**: L'endpoint `/cache` est préféré car il :
1. Consomme le quota d'appels Enedis uniquement si le cache serveur est périmé.
2. Répond avec la même structure `ResponseContractRoot` que l'endpoint sans cache.
3. Respecte la constitution (Principe II : utiliser le cache myelectricaldata en priorité).

**Alternatives considérées**:
- `/contracts/{prm}/` sans cache : écarté car il consomme toujours une requête Enedis
  (quota de 50 appels/jour sans cache vs 500 avec cache).
- Endpoint `/identity/` : ne contient pas les données tarifaires HC/HP.

---

## R-002 — Structure de réponse et champ `offpeak_hours`

**Décision**: Le champ `offpeak_hours` de `ResponseContractContracts` contient les plages
HC directement lisibles en chaîne de caractères. Il est parsé côté `node_helper.js`.

**Structure JSON confirmée** (OpenAPI v1.5.15) :
```json
{
  "customer": {
    "customer_id": "string",
    "usage_points": [
      {
        "usage_point": {
          "usage_point_id": "string",
          "usage_point_status": "com",
          "meter_type": "AMM"
        },
        "contracts": {
          "segment": "C5",
          "subscribed_power": "9",
          "last_activation_date": "2021-04-01+02:00",
          "distribution_tariff": "HPHC",
          "offpeak_hours": "HC (22H30-6H30), (13H00-15H00)",
          "contract_status": "ACT",
          "last_distribution_tariff_change_date": "2021-04-01+02:00"
        }
      }
    ]
  }
}
```

**Champ clé**: `customer.usage_points[0].contracts.offpeak_hours`
- Format réel : `"HC (HHhMM-HHhMM[;HHhMM-HHhMM]*)"` — plages séparées par `;` dans un seul bloc `()`
- La robustesse du parser est critique : les variantes de casse (Hh) doivent être gérées.

**Validation du `distribution_tariff`**: Les codes tarifaires `BTINF*` indiquent la présence
ou l'absence d'une différenciation HC/HP :
- Codes terminant par **`DT`** : différenciation HP/HC (`BTINFCUDT`, `BTINFMUDT`, `BTINFLUDT`)
- Codes terminant par **`4`** : différenciation HP/HC + saisonnière (`BTINFCU4`, `BTINFMU4`)
- Codes terminant par **`ST`** : sans différenciation (`BTINFCUST`, `BTINFMUST`, `BTINFLUST`)

Règle de détection : `/DT$|4$/i.test(distributionTariff)`. Si le contrat n'a pas d'option HC/HP,
le module affiche un avertissement et `noHcOption: true` est envoyé au front-end.

**Rationale**: Confirmed from OpenAPI schema `ResponseContractContracts`. Aucun appel
supplémentaire ou parsing d'historique de consommation n'est requis.

**Alternatives considérées**:
- Déduire les plages HC/HP depuis l'historique de consommation (taggé `measure_type`) :
  écarté car complexe, lent, et inutile puisque le champ est fourni directement.
- Laisser l'utilisateur saisir les plages manuellement dans la config : écarté car le champ
  API est disponible et élimine la friction à l'installation.

---

## R-003 — Stratégie de cache local

**Décision**: Fichier JSON `cache/contract.json` dans le répertoire du module.
Structure :
```json
{
  "fetchedAt": "2026-03-03T08:00:00.000Z",
  "prm": "01234567891234",
  "data": { /* réponse brute de l'API */ }
}
```

**Règle de staleness**: Le cache est considéré comme frais si
`new Date(fetchedAt).toDateString() === new Date().toDateString()` (comparaison en heure
locale). Un seul appel distant par jour calendaire.

**Rationale**: 
- Simple à implémenter, lisible, inspectsble manuellement.
- Survit aux redémarrages de MagicMirror.
- Gitignored pour ne pas commettre de données personnelles.

**Erreur de lecture du cache**: Si `cache/contract.json` est absent, vide ou JSON invalide,
le helper effectue un appel distant immédiat. En cas d'échec de l'appel distant, le module
affiche le message d'absence de données (FR-009).

**Alternatives considérées**:
- SQLite : surdimensionné pour un seul enregistrement.
- Variable en mémoire uniquement : ne survit pas aux redémarrages.
- Cache MagicMirror natif (`this.sendSocketNotification`) : ne persiste pas sur disque.

---

## R-004 — Parser des plages `offpeak_hours`

**Décision**: Regex multi-passes pour extraire toutes les plages HC depuis le champ.

**Format réel confirmé** (format API myelectricaldata) :
- `"HC (22H00-06H00)"` — une plage HC
- `"HC (0H32-6H32;15H02-17H02)"` — deux plages HC séparées par `;`
- `"HC (22H00-06H00;13H00-15H00)"` — minuit-crossing + plage journée

**Stratégie de parsing** :
1. Extraire le bloc interne avec `/HC\s*\(([^)]+)\)/i`
2. Découper par `;` pour obtenir les segments individuels
3. Parser chaque segment avec `/(\d{1,2})[Hh](\d{2})-(\d{1,2})[Hh](\d{2})/`

Les minutes sont toujours sur 2 chiffres dans le format réel (ex: `0H32` et non `0H0`).

**Output normalisé**: tableau d'objets `{ start: {h, m}, end: {h, m}, type: "HC" }`.
Les plages HP sont déduites comme complémentaire sur 24h.

**Rationale**: Pas de dépendance externe, robuste au format réel confirmé.

---

## R-005 — Réévaluation client-side de la période courante

**Décision**: `setInterval` de 60 000 ms dans `getDom()` / méthode MagicMirror
`this.updateDom(animationSpeed)` après chaque tick.

**Algorithme**:
1. Obtenir l'heure locale courante → `{h, m}` en minutes depuis minuit (`currentMin`).
2. Pour chaque plage HC : convertir `start` et `end` en minutes depuis minuit.
3. Gestion du chevauchement minuit : si `end < start` (ex. 22h→6h), la plage HC couvre
   `[startMin, 1440)` ∪ `[0, endMin)`.
4. Si `currentMin` appartient à une plage HC → afficher « Heures Creuses ».
5. Sinon → afficher « Heures Pleines ».

**Aucun appel API** : l'intervalle client-side opère uniquement sur les données déjà parsées
et transmises depuis `node_helper.js` via `sendSocketNotification`.

**Rationale**: Satisfait FR-002 et SC-002 (bascule en ≤ 60 s) sans charge réseau.

---

## R-006 — Communication node_helper ↔ module front-end

**Décision**: API MagicMirror standard :

| Direction | Notification | Payload |
|-----------|-------------|---------|
| Front → Helper | `HCHP_FETCH_CONTRACT` | `{ prm, token }` |
| Helper → Front | `HCHP_CONTRACT_DATA` | `{ periods: [...], fetchedAt, fromCache }` |
| Helper → Front | `HCHP_ERROR` | `{ message, code }` |

`periods` est le tableau parsé `[{ start, end, type }]` prêt à l'emploi côté front.
Le helper ne renvoie jamais le token au front-end.

**Rationale**: Séparation claire des responsabilités. Le front-end ne connaît ni le token,
ni les détails d'implémentation du cache.

---

## R-007 — Gestion des erreurs HTTP

| Code HTTP | Comportement |
|-----------|-------------|
| 401 | Log `"Token invalide ou expiré"` + affiche badge « Token manquant » |
| 404 | Log `"PRM introuvable"` + affiche badge « PRM incorrect » |
| 429 | Log `"Quota dépassé"` + utilise cache si disponible |
| 5xx / réseau | Log erreur + utilise cache si disponible |
| Timeout (> 10 s) | Idem 5xx |

Tous les logs utilisent `Log.error` MagicMirror ; le token est remplacé par `[REDACTED]`.
