# MMM-HC_HP

Module [MagicMirror²](https://magicmirror.builders/) affichant les périodes **Heures Creuses / Heures Pleines** de votre contrat électrique depuis [myelectricaldata](https://www.myelectricaldata.fr/).

---

## Fonctionnalités

- **Badge live** : affiche en temps réel si vous êtes en Heures Creuses (HC) ou Heures Pleines (HP), mis à jour chaque minute sans appel API.
- **Liste complète** : toutes les plages HC et HP du contrat, triées par heure de début.
- **Résilience hors ligne** : continue d'afficher les données depuis le cache local si l'API est indisponible ; une notice discrète indique la date de la dernière synchronisation.

---

## Prérequis

1. Compte [myelectricaldata](https://www.myelectricaldata.fr/) actif avec consentement Enedis activé.
2. **Token** myelectricaldata (chaîne de 54 caractères visible dans votre espace personnel).
3. **PRM / PDL** du point de livraison (14 chiffres, visible sur votre facture ou espace myelectricaldata).
4. Contrat **HPHC** — contrats BASE (tarif unique) non supportés.

---

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/VOTRE_UTILISATEUR/MMM-HC_HP.git
cd MMM-HC_HP
npm install
```

---

## Configuration

Ajoutez le bloc suivant dans votre `config/config.js` :

```javascript
{
  module: "MMM-HC_HP",
  position: "top_left",
  config: {
    token: "VOTRE_TOKEN_MYELECTRICALDATA",
    prm: "12345678901234",
  }
}
```

### Clés de configuration

| Clé              | Type    | Défaut         | Requis | Description                                                      |
|------------------|---------|----------------|--------|------------------------------------------------------------------|
| `token`          | string  | `null`         | ✅     | Token d'authentification myelectricaldata (54 caractères)         |
| `prm`            | string  | `null`         | ✅     | Numéro PRM/PDL à 14 chiffres de votre point de livraison         |
| `updateInterval` | number  | `86400000`     | —      | Intervalle de rafraîchissement API en ms (défaut : 1 fois/jour)   |
| `timeFormat`     | number  | `24`           | —      | Format de l'heure (`12` ou `24`) — réservé pour usage futur       |
| `animationSpeed` | number  | `1000`         | —      | Durée de l'animation de mise à jour du DOM en ms                  |

---

## Fonctionnement technique

- Au démarrage, le module demande les données contractuelles à `node_helper.js`.
- `node_helper.js` vérifie d'abord si le fichier `cache/contract.json` contient des données **du jour** (`toDateString()` equality). Si oui, les données cachées sont utilisées sans appel réseau.
- Sinon, `node_helper.js` appelle `GET https://www.myelectricaldata.fr/contracts/{prm}/cache` avec le header `Authorization: {token}`.
- En cas d'erreur API, si un cache (même périmé) existe, il est utilisé en fallback avec une notice.
- La bascule HC/HP est calculée **côté client** toutes les 60 secondes — aucun appel API supplémentaire.

---

## Résolution des problèmes

| Symptôme                              | Cause probable                         | Solution                                                  |
|---------------------------------------|----------------------------------------|-----------------------------------------------------------|
| `⚠ Token manquant ou invalide`       | Token incorrect ou révoqué             | Régénérez votre token sur myelectricaldata.fr             |
| `⚠ PRM incorrect`                    | PRM/PDL erroné                         | Vérifiez les 14 chiffres sur votre facture                |
| `⚠ Configuration incomplète`         | `token` ou `prm` absent du config      | Ajoutez les deux clés dans `config.js`                    |
| Badge toujours « Chargement… »        | Problème réseau ou API indisponible    | Vérifiez la connexion Internet et les logs MagicMirror    |
| Badge HC/HP incorrect                 | Heure système erronée                  | Vérifiez la timezone du serveur MagicMirror               |
| Données du : [ancienne date]          | API indisponible — fallback sur cache  | Normal ; se met à jour dès que l'API redevient accessible |
| Aucune plage affichée (contrat BASE)  | Contrat sans option HC/HP              | Ce module nécessite un contrat HPHC                       |

---

## Validation avec fixture locale

Pour tester sans appel réseau, copiez la fixture dans le cache :

```bash
cp tests/fixtures/contract-hc.json cache/contract.json
```

MagicMirror affichera les données de la fixture. Le badge HC/HP changera selon l'heure de votre système (HC de 22h à 6h et de 13h à 15h dans la fixture fournie).

---

## Licence

MIT
