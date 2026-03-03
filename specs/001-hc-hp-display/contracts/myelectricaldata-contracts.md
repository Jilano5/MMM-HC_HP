# Contract : myelectricaldata — Données Contractuelles

**Feature**: 001-hc-hp-display | **Date**: 2026-03-03

---

## Endpoint utilisé

```
GET https://www.myelectricaldata.fr/contracts/{usage_point_id}/cache
```

### Authentification

```
Header: Authorization: <token>
```

Le token (54 caractères) est fourni par myelectricaldata lors de l'enregistrement du
consentement Enedis. Il est lu depuis `config.js` dans `node_helper.js` et ne transite
jamais vers le front-end.

### Paramètre de chemin

| Paramètre        | Type   | Description                                    |
|------------------|--------|------------------------------------------------|
| `usage_point_id` | string | PRM/PDL à 14 chiffres (zéros préfixes inclus)  |

### Réponse 200 OK

```json
{
  "customer": {
    "customer_id": "string",
    "usage_points": [
      {
        "usage_point": {
          "usage_point_id": "string",
          "usage_point_status": "string",
          "meter_type": "string"
        },
        "contracts": {
          "segment": "string",
          "subscribed_power": "string",
          "last_activation_date": "string",
          "distribution_tariff": "BTINFCUDT",  // see tariff codes below
          "offpeak_hours": "string",
          "contract_status": "string",
          "last_distribution_tariff_change_date": "string"
        }
      }
    ]
  }
}
```

### Champ critique : `distribution_tariff`

Détermine si le contrat dispose d'une différenciation HC/HP. Les codes se décomposent en :

| Code        | Description                                         | HC/HP ? |
|-------------|-----------------------------------------------------|---------|
| `BTINFCUST` | Courte utilisation sans différenciation temporelle  | ❌       |
| `BTINFCUDT` | Courte utilisation avec différenciation HP/HC       | ✅       |
| `BTINFMUST` | Moyenne utilisation sans différenciation temporelle | ❌       |
| `BTINFMUDT` | Moyenne utilisation avec différenciation HP/HC      | ✅       |
| `BTINFLUST` | Longue utilisation sans différenciation temporelle  | ❌       |
| `BTINFLUDT` | Longue utilisation avec différenciation HP/HC       | ✅       |
| `BTINFCU4`  | Courte utilisation HP/HC + saisonnière              | ✅       |
| `BTINFMU4`  | Moyenne utilisation HP/HC + saisonnière             | ✅       |

**Règle de détection HC/HP** : le code se termine par `DT` ou `4`.
```js
const hasHcHp = /DT$|4$/i.test(distributionTariff);
```

---

### Champ critique : `offpeak_hours`

Contient les plages HC (Heures Creuses) du contrat. La valeur est une chaîne libre dont
le format suit le pattern :

```
HC (HHhMM-HHhMM[;HHhMM-HHhMM]*)
```

Les plages multiples sont séparées par un **point-virgule** (`;`) à l'intérieur d'un seul
bloc de parenthèses.

Exemples observés :
- `"HC (22H00-06H00)"` — une plage HC
- `"HC (0H32-6H32;15H02-17H02)"` — deux plages HC
- `"HC (22H00-06H00;13H00-15H00)"` — deux plages HC (minuit-crossing + journée)

Stratégie de parsing (dans `node_helper.js`) :
1. Extraire le contenu du bloc `HC (…)` : `/HC\s*\(([^)]+)\)/i`
2. Découper par `;`
3. Parser chaque segment : `/(\d{1,2})[Hh](\d{2})-(\d{1,2})[Hh](\d{2})/`

### Réponses d'erreur

| Code | Signification                         | Action du module                         |
|------|---------------------------------------|------------------------------------------|
| 401  | Token invalide ou révoqué             | Badge « Token manquant » + log           |
| 404  | PRM introuvable dans myelectricaldata | Badge « PRM incorrect » + log            |
| 429  | Quota d'appels dépassé               | Fallback cache + log                     |
| 5xx  | Erreur serveur myelectricaldata       | Fallback cache + log                     |

---

## Contrat interne : node_helper ↔ MMM-OffPeakHours-France.js

Communication via l'API `sendSocketNotification` / `socketNotificationReceived` de
MagicMirror².

### Front → Helper : `HCHP_FETCH_CONTRACT`

Envoyé par `MMM-OffPeakHours-France.js` au démarrage (`start()`) et à chaque tick `updateInterval`.

```js
// Payload
{
  prm: string,   // Valeur de config.prm
  token: string  // Valeur de config.token
}
```

### Helper → Front : `HCHP_CONTRACT_DATA`

Envoyé par `node_helper.js` après fetch réussi (API ou cache).

```js
// Payload
{
  periods: [
    {
      type: "HC" | "HP",
      start: { h: number, m: number },
      end:   { h: number, m: number },
      label: string   // ex. "22h00 → 06h00"
    }
    // ...
  ],
  fetchedAt: string,   // ISO 8601 UTC
  fromCache: boolean   // true si données issues du fichier cache local
}
```

### Helper → Front : `HCHP_ERROR`

Envoyé par `node_helper.js` en cas d'erreur sans fallback possible.

```js
// Payload
{
  message: string,  // Message lisible, token redacté
  code: number | null  // Code HTTP si applicable
}
```

---

## Fixture de test

Fichier : `tests/fixtures/contract-hc.json`

```json
{
  "customer": {
    "customer_id": "00000000000000",
    "usage_points": [
      {
        "usage_point": {
          "usage_point_id": "00000000000000",
          "usage_point_status": "com",
          "meter_type": "AMM"
        },
        "contracts": {
          "segment": "C5",
          "subscribed_power": "9",
          "last_activation_date": "2021-04-01+02:00",
          "distribution_tariff": "HPHC",
          "offpeak_hours": "HC (22H00-6H00), (13H00-15H00)",
          "contract_status": "ACT",
          "last_distribution_tariff_change_date": "2021-04-01+02:00"
        }
      }
    ]
  }
}
```
