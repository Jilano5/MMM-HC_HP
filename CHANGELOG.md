# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [1.0.0] - 2026-03-03

### Ajouté

- **US1 — Indicateur de tarification courante (P1)** : badge visuel indiquant en temps réel si la tarification est Heures Creuses (HC) ou Heures Pleines (HP). Bascule automatique toutes les 60 secondes sans appel API supplémentaire. Prise en charge des plages HC à cheval sur minuit (ex: 22h→6h).
- **US2 — Liste complète des plages HC/HP (P2)** : affichage de toutes les plages du contrat (plages HC issues de `offpeak_hours` + plages HP calculées comme complément sur 24h), triées par heure de début.
- **US3 — Résilience hors ligne (P3)** : cache local `cache/contract.json` contenant les données du jour. En cas d'indisponibilité de l'API, le module utilise le cache en fallback. Une notice discrète affiche la date de la dernière synchronisation quand les données viennent du cache.
- Parsing robuste du champ `offpeak_hours` : regex tolérant les variantes de casse (Hh), minutes omises, espaces variables, plages multiples.
- Gestion des erreurs API : codes 401 (token invalide), 404 (PRM incorrect), 429/5xx (erreur serveur), timeout 10 s, erreur réseau.
- Rafraîchissement API limité à 1 fois par jour (comparaison `toDateString()`).
