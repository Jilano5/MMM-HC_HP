# Feature Specification : Affichage HC/HP depuis myelectricaldata

**Feature Branch**: `001-hc-hp-display`
**Created**: 2026-03-03
**Status**: Draft
**Input**: Module MagicMirror affichant les plages HC/HP du contrat myelectricaldata, avec cache local journalier et indicateur de tarification courante mis à jour à la minute.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Indicateur de tarification courante (Priority: P1)

Un utilisateur passe devant son miroir connecté. En un coup d'œil — sans aucune interaction — il
sait si l'électricité est actuellement facturée en Heures Creuses (HC) ou en Heures Pleines (HP).
L'indicateur se met à jour automatiquement à chaque changement de période : il n'a jamais besoin
de rafraîchir quoi que ce soit.

**Why this priority**: C'est la raison d'être principale du module. Sans cet indicateur, le module
n'apporte aucune valeur opérationnelle immédiate.

**Independent Test**: Avec uniquement cette fonctionnalité active, configurer le module avec un
token valide et un PRM valide, puis vérifier que le miroir affiche « Heures Creuses » ou
« Heures Pleines » en accord avec l'heure réelle. Faire tourner l'horloge jusqu'à un changement
de période et vérifier la mise à jour automatique.

**Acceptance Scenarios**:

1. **Given** le module est installé et configuré avec un token et un PRM valides, **When** un utilisateur regarde le miroir à 14h00 (période HP), **Then** le module affiche un indicateur clair « Heures Pleines » mis en évidence visuellement.
2. **Given** le module est actif et affiche « Heures Pleines », **When** l'horloge atteint le début d'une plage HC (par exemple 22h00), **Then** l'indicateur bascule automatiquement sur « Heures Creuses » sans intervention de l'utilisateur.
3. **Given** le module est actif, **When** une minute s'écoule, **Then** l'indicateur est réévalué et reste cohérent avec l'heure courante.

---

### User Story 2 — Liste complète des plages HC/HP du contrat (Priority: P2)

Un utilisateur souhaite connaître tous les créneaux horaires HC et HP définis dans son contrat
électrique. Il consulte son miroir et voit la liste exhaustive des plages (ex. : HC 22h00–06h00,
HC 12h00–14h00) sans avoir à ouvrir une application ou un document.

**Why this priority**: Complémentaire à l'indicateur courant : savoir QUAND les périodes changent
permet à l'utilisateur d'anticiper et d'organiser sa consommation. Dépend de la même donnée de
contrat que la story 1, donc naturellement P2.

**Independent Test**: Avec le contrat chargé, vérifier que toutes les plages horaires HC et HP
retournées par les données du contrat sont affichées, dans l'ordre chronologique, avec les heures
de début et de fin clairement lisibles.

**Acceptance Scenarios**:

1. **Given** le contrat contient deux plages HC (22h00–06h00 et 12h00–14h00), **When** l'utilisateur regarde le module, **Then** les deux plages HC et la plage HP implicite (06h00–12h00, 14h00–22h00) sont affichées avec leurs horaires exacts.
2. **Given** les données du contrat ont été mises en cache, **When** l'utilisateur regarde le module le lendemain sans connexion réseau, **Then** les mêmes plages HC/HP sont toujours affichées.
3. **Given** le contrat est affiché, **When** un utilisateur compare les créneaux affichés avec son contrat papier, **Then** les horaires correspondent exactement.

---

### User Story 3 — Résilience en cas d'indisponibilité du service distant (Priority: P3)

Un utilisateur dont la connexion internet est coupée (ou dont le service myelectricaldata est
temporairement indisponible) peut néanmoins continuer à utiliser le module. Les données du contrat
restent affichées et l'indicateur de tarification courante continue de fonctionner correctement.

**Why this priority**: La valeur principale vient des stories 1 et 2 ; la résilience est une
exigence de qualité qui ne bloque pas la mise en service mais est critique pour la fiabilité
quotidienne.

**Independent Test**: Après une première synchronisation réussie, couper l'accès réseau. Vérifier
que le module affiche toujours les plages HC/HP, que l'indicateur de tarification courante change
correctement à chaque transition de période, et qu'un avertissement visuel signale que les données
ne sont pas récentes.

**Acceptance Scenarios**:

1. **Given** le module a déjà synchronisé les données du contrat, **When** la connexion réseau est coupée, **Then** le module continue d'afficher les plages HC/HP et l'indicateur de tarification basés sur les dernières données reçues.
2. **Given** le module fonctionne hors ligne depuis moins de 24 heures, **When** un utilisateur regarde le miroir, **Then** un avertissement discret indique la date et l'heure de la dernière synchronisation réussie.
3. **Given** aucune donnée n'a jamais été synchronisée (première utilisation sans réseau), **When** l'utilisateur regarde le miroir, **Then** le module affiche un message clair indiquant qu'aucune donnée n'est disponible et que la configuration est requise.

---

### Edge Cases

- Que se passe-t-il si le token myelectricaldata configuré est invalide ou expiré ?
- Que se passe-t-il si le PRM fourni ne correspond à aucun contrat dans myelectricaldata ?
- Que se passe-t-il si le contrat ne définit aucune plage HC (tarif de base sans option HC/HP) ?
- Comment le module gère-t-il les changements d'heure (passage heure d'été / heure d'hiver) ?
- Que se passe-t-il si le fichier de cache est corrompu ou illisible ?
- Que se passe-t-il si l'heure locale du miroir est incorrecte ?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le module DOIT afficher en permanence un indicateur visuel indiquant si la
  tarification courante est en Heures Creuses ou en Heures Pleines.
- **FR-002**: L'indicateur de tarification courante DOIT être réévalué automatiquement au moins
  une fois par minute sans déclencher d'appel au service distant.
- **FR-003**: Le module DOIT afficher la liste complète des plages horaires HC et HP telles que
  définies dans le contrat de l'utilisateur, avec les heures de début et de fin de chaque plage.
- **FR-004**: Les données du contrat DOIVENT être récupérées depuis myelectricaldata au plus une
  fois par jour calendaire.
- **FR-005**: Le module DOIT conserver localement les dernières données de contrat reçues afin de
  continuer à fonctionner en l'absence de connexion au service distant.
- **FR-006**: En cas d'impossibilité de joindre le service distant, le module DOIT signaler
  visuellement que les données affichées proviennent du cache, en indiquant leur date de dernière
  mise à jour.
- **FR-007**: Le module DOIT requérir deux paramètres de configuration obligatoires : un token
  d'accès au service myelectricaldata et un identifiant de compteur (PRM/PDL).
- **FR-008**: Tout comportement configurable (fréquence de rafraîchissement, format horaire,
  vitesse d'animation) DOIT pouvoir être ajusté exclusivement via la configuration, sans
  modification du code source du module.
- **FR-009**: Si aucune donnée n'est disponible (ni en cache, ni via le service distant), le
  module DOIT afficher un message explicite invitant l'utilisateur à vérifier sa configuration.

### Key Entities

- **Contrat HC/HP** : Représente le contrat d'électricité actif d'un utilisateur. Contient
  l'ensemble des plages horaires HC et HP applicables chaque jour (heure de début, heure de fin,
  type de période). Valable pour un identifiant de compteur (PRM/PDL) donné.
- **Période tarifaire** : Un créneau horaire continu caractérisé par un type (HC ou HP), une
  heure de début et une heure de fin. Plusieurs périodes forment l'ensemble d'une journée.
- **Cache local** : Copie persistante du contrat HC/HP la plus récente, associée à un horodatage
  de récupération. Permet le fonctionnement hors ligne et limite les appels au service distant.
- **Tarification courante** : Résultat de l'évaluation, à un instant donné, du type de période
  tarifaire en vigueur (HC ou HP) selon les plages du contrat et l'heure locale.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un utilisateur peut lire le type de tarification courant (HC ou HP) en moins de
  trois secondes après avoir regardé le miroir, sans aucune interaction.
- **SC-002**: L'indicateur de tarification bascule automatiquement au plus 60 secondes après le
  début d'une nouvelle période tarifaire.
- **SC-003**: Toutes les plages HC/HP définies dans le contrat sont affichées simultanément et
  lisibles d'un seul regard (pas de défilement requis pour un contrat standard ≤ 6 plages).
- **SC-004**: Après une première configuration réussie, le module continue de fonctionner
  correctement pendant au moins 24 heures en l'absence totale de connexion réseau.
- **SC-005**: La récupération des données du contrat n'est déclenchée qu'une seule fois par jour
  calendaire ; un utilisateur ne génère pas plus d'un appel sortant par jour vers le service
  distant.

## Assumptions

- Le service myelectricaldata fournit les plages HC/HP du contrat dans une réponse structurée
  consultable via un token et un PRM.
- Le contrat de l'utilisateur inclut une option tarifaire HC/HP (tarification à deux périodes) ;
  les contrats à tarif de base (sans HC/HP) afficheront uniquement la tarification HP et un
  avertissement.
- Les plages HC/HP sont les mêmes tous les jours de la semaine (week-ends inclus) — hypothèse
  valable pour la majorité des contrats Tempo exclu ; les contrats Tempo feront l'objet d'une
  spécification séparée.
- L'heure locale du système hébergeant MagicMirror est correctement configurée et synchronisée.
