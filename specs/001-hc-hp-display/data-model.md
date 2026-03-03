# Data Model : Affichage HC/HP

**Feature**: 001-hc-hp-display | **Date**: 2026-03-03

---

## Entités

### 1. `ContractResponse` — Réponse brute de l'API

Objet JSON tel que retourné par `GET /contracts/{prm}/cache`.
Stocké tel quel dans `cache/contract.json` sous la clé `data`.

```js
{
  customer: {
    customer_id: string,          // Identifiant client Enedis (opaque)
    usage_points: [               // Toujours 1 élément pour ce module
      {
        usage_point: {
          usage_point_id: string, // PRM/PDL (14 chiffres)
          usage_point_status: string, // "com"
          meter_type: string      // "AMM" pour Linky
        },
        contracts: {
          segment: string,                        // ex. "C5"
          subscribed_power: string,               // ex. "9" (kVA)
          last_activation_date: string,           // ISO date
          distribution_tariff: string,            // "HPHC" | "BASE" | "EJP" | "TEMPO"
          offpeak_hours: string,                  // ex. "HC (22H00-6H00), (13H00-15H00)"
          contract_status: string,                // "ACT"
          last_distribution_tariff_change_date: string
        }
      }
    ]
  }
}
```

**Validation rules**:
- Si `distribution_tariff !== "HPHC"` → considérer qu'il n'y a pas de plages HC, afficher
  un avertissement `"Tarif sans option HC/HP"`.
- Si `offpeak_hours` est vide ou absent → même comportement que ci-dessus.
- Les données brutes sont transmises **intégralement** dans le cache local pour être
  réitérables sans appel API.

---

### 2. `CacheEntry` — Entrée du cache local

Contenu de `cache/contract.json`.

```js
{
  fetchedAt: string,   // ISO 8601 UTC — ex. "2026-03-03T08:00:00.000Z"
  prm: string,         // PRM de l'utilisateur (pour vérification de cohérence)
  data: ContractResponse  // Réponse brute intégrale
}
```

**Validation rules**:
- Le fichier doit être du JSON valide. En cas d'erreur de parse → traiter comme absent.
- `fetchedAt` doit être une date parseable. En cas d'erreur → traiter comme périmé.
- `prm` doit correspondre à la config courante. En cas de divergence → invalider le cache
  et refetcher (l'utilisateur a changé de PRM).

**Staleness check** (dans node_helper.js) :
```js
function isCacheFresh(entry) {
  if (!entry || !entry.fetchedAt) return false;
  const cached = new Date(entry.fetchedAt);
  const now = new Date();
  return cached.toDateString() === now.toDateString(); // heure locale
}
```

---

### 3. `Period` — Plage tarifaire parsée

Objet intermédiaire produit par le parser `offpeak_hours`.
C'est la structure transmise du helper au front-end.

```js
{
  type: "HC" | "HP",  // Type de tarification
  start: {
    h: number,        // Heure de début (0–23)
    m: number         // Minutes de début (0–59)
  },
  end: {
    h: number,        // Heure de fin (0–23)
    m: number         // Minutes de fin (0–59)
  },
  label: string       // ex. "22h00 → 06h00" — formaté selon timeFormat config
}
```

**Règle de dérivation des plages HP**: Les plages HP sont le complément des plages HC sur
24h. Le parser produit d'abord toutes les plages HC, puis calcule les intervalles HP.

**Règle de chevauchement minuit**: Une plage HC dont `end < start` (ex. 22h→6h) est traitée
comme deux demi-plages internes au calcul de la période courante mais reste affichée comme
une plage unique (`22h00 → 06h00`) dans l'UI.

---

### 4. `ModuleState` — État du module front-end (en mémoire uniquement)

Structure maintenue dans l'objet module MagicMirror, non persistée.

```js
{
  periods: Period[],     // Plages parsées (HC + HP), vide avant premier fetch
  fetchedAt: string,     // ISO date — pour affichage "Dernière synchro"
  fromCache: boolean,    // true si données issues du cache local
  error: string | null,  // Message d'erreur en cours, null si OK
  currentType: "HC" | "HP" | null  // Calculé chaque minute client-side
}
```

---

## État des transitions

```
                   ┌─────────────────────────────────────┐
                   │         Module chargé                │
                   └───────────────┬─────────────────────┘
                                   │
              ┌────────────────────▼──────────────────────┐
              │  Config présente ?                         │
              │  token + prm définis ?                     │
              └───┬─────────────────────────┬─────────────┘
                  │ Non                     │ Oui
        ┌─────────▼──────┐      ┌──────────▼──────────────┐
        │ Affiche :      │      │  Cache local frais ?     │
        │ "Token manquant"│      └──────┬──────────┬────────┘
        └────────────────┘             │ Oui       │ Non
                               ┌───────▼──────┐ ┌─▼──────────────┐
                               │ Charge cache │ │  Appel API     │
                               │ → parse      │ │  myelectrical  │
                               └──────┬───────┘ └──┬─────────────┘
                                      │             │
                                      │         ┌───▼──────────────┐
                                      │         │ Succès ?          │
                                      │         └──┬────────┬───────┘
                                      │            │ Oui    │ Non
                                      │       ┌────▼───┐  ┌─▼────────────┐
                                      │       │ Sauve  │  │ Cache dispo? │
                                      │       │ cache  │  └──┬──────┬────┘
                                      │       └────┬───┘     │Oui   │Non
                                      │            │      ┌───▼──┐ ┌▼─────────────┐
                                      └────────────┘      │Use   │ │ "Aucune      │
                                                          │cache │ │  donnée      │
                                              ┌───────────┘badge │ │  disponible" │
                                              │           └──────┘ └──────────────┘
                                    ┌─────────▼─────────────────────────┐
                                    │  Affiche plages HC/HP + badge     │
                                    │  setInterval(60s) → updateDom()   │
                                    └───────────────────────────────────┘
```
