# Quickstart : MMM-OffPeakHours-France

**Feature**: 001-hc-hp-display | **Date**: 2026-03-03

---

## Prérequis

- MagicMirror² ≥ 2.20 installé et fonctionnel.
- Node.js LTS (fourni par MagicMirror).
- Un compte myelectricaldata avec consentement Enedis actif :
  → https://www.myelectricaldata.fr (cliquer « J'accède à mon espace client Enedis »).
- Votre token myelectricaldata (54 caractères).
- Votre numéro PRM/PDL (14 chiffres, visible sur votre facture EDF ou dans votre espace
  Enedis).

---

## 1. Cloner le module dans MagicMirror

```bash
cd ~/MagicMirror/modules
git clone https://github.com/<votre-fork>/MMM-OffPeakHours-France.git
cd MMM-OffPeakHours-France
npm install
```

---

## 2. Configurer le module

Dans `~/MagicMirror/config/config.js`, ajouter dans le tableau `modules` :

```js
{
  module: "MMM-OffPeakHours-France",
  position: "top_right",  // À adapter selon votre layout
  config: {
    token: "VOTRE_TOKEN_MYELECTRICALDATA",   // REQUIS — 54 caractères
    prm: "VOTRE_PRM_14_CHIFFRES",            // REQUIS — ex. 01234567891234

    // Optionnel — valeurs par défaut :
    updateInterval: 86400000,  // 24h en ms (minimum 3 600 000)
    timeFormat: 24,            // 12 ou 24
    animationSpeed: 1000       // ms
  }
}
```

> ⚠️ `config.js` contient votre token. Vérifiez qu'il est listé dans `.gitignore`
> avant de pousser votre configuration sur un dépôt public.

---

## 3. Lancer MagicMirror

```bash
cd ~/MagicMirror
npm start
```

Le module effectue un premier appel à myelectricaldata au démarrage. Les données sont
mises en cache dans `modules/MMM-OffPeakHours-France/cache/contract.json`.

---

## 4. Valider l'affichage

Au démarrage, le module affiche :

- **Badge HC/HP** : indique la tarification courante (ex. « ⚡ Heures Pleines »).
- **Liste des plages** : tous les créneaux HC et HP de votre contrat.
- **Aucun badge d'erreur** : si tout est configuré correctement.

Si le badge affiche « Token manquant » ou « PRM incorrect » → vérifier les valeurs dans
`config.js` et consulter les logs MagicMirror (`npm start` affiche les logs dans le terminal).

---

## 5. Tester avec la fixture (sans appel API)

Pour valider le parsing et l'affichage sans connexion à myelectricaldata :

1. Copier la fixture dans le cache :
   ```bash
   mkdir -p modules/MMM-OffPeakHours-France/cache
   cp modules/MMM-OffPeakHours-France/tests/fixtures/contract-hc.json \
      modules/MMM-OffPeakHours-France/cache/contract.json
   ```

2. Éditer `cache/contract.json` et ajouter `fetchedAt` à la date du jour :
   ```json
   {
     "fetchedAt": "2026-03-03T08:00:00.000Z",
     "prm": "00000000000000",
     "data": { /* contenu de la fixture */ }
   }
   ```

3. Lancer MagicMirror → le module charge le cache et n'effectue aucun appel réseau.

---

## 6. Vérifier la réévaluation automatique (SC-002)

L'indicateur HC/HP se met à jour à la minute. Pour tester rapidement :

1. Identifier une plage HC de votre contrat (ex. 22h00).
2. Attendre que l'horloge du système atteigne ce moment (ou modifier temporairement
   l'heure système dans un environnement de test).
3. Vérifier que le badge bascule sans rechargement de page.

---

## Structure des fichiers après installation

```text
modules/MMM-OffPeakHours-France/
├── MMM-OffPeakHours-France.js          # Module front-end
├── MMM-OffPeakHours-France.css         # Styles
├── node_helper.js        # Helper serveur (API + cache)
├── package.json
├── .eslintrc.js
├── .gitignore
├── CHANGELOG.md
├── README.md
├── cache/
│   └── contract.json     # Cache créé automatiquement (gitignored)
└── tests/
    └── fixtures/
        └── contract-hc.json
```

---

## Résolution des problèmes courants

| Symptôme | Cause probable | Action |
|----------|---------------|--------|
| Badge « Token manquant » | `token` absent ou vide dans config | Vérifier `config.js` |
| Badge « PRM incorrect » | `prm` erroné ou sans consentement actif | Vérifier sur myelectricaldata.fr |
| Badge « Quota dépassé » | Trop d'appels le même jour | Attendre le lendemain ou utiliser le cache |
| Affichage « HC toute la journée » | Contrat sans option HC/HP | Vérifier `distribution_tariff` dans le cache |
| Module vide | Première utilisation hors ligne | Connecter le Raspberry Pi et redémarrer MM |
