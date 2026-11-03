# TP — Jour 1, étape 3 : construction d'une carte d'occupation 2D

## 1. Définition de la grille

Le modèle retenu comporte trois états : **inconnu (127), libre (0) et occupé
(255)**. La carte est initialement inconnue : une zone non observée n'est pas
nécessairement libre. Ces valeurs sont des états catégoriels, pas des
probabilités calibrées.

La résolution par défaut est de **10 cm par cellule**. C'est un compromis entre
le niveau de détail, la mémoire utilisée et la sensibilité au bruit. La largeur,
la hauteur et l'origine inférieure gauche sont configurables. L'outil démarre
avec une zone de 30 × 30 m, soit 300 × 300 cellules, centrée sur l'origine.

## 2. Transformation du scan selon sa pose

Les coordonnées locales du scan sont exprimées en mètres. Si le CSV contient
déjà les coordonnées cartésiennes du lidar, elles sont utilisées après conversion
des unités. Sinon, elles sont calculées à partir de l'angle et de la distance,
avec le sens angulaire approprié au fichier.

Chaque point est transformé selon la pose du lidar :

```text
X = x_pose + cos(theta) × x_local − sin(theta) × y_local
Y = y_pose + sin(theta) × x_local + cos(theta) × y_local
```

L'angle saisi en degrés est converti en radians pour le calcul. Les indices de
grille sont ensuite obtenus par :

```text
i = floor((X − origine_X) / resolution)
j = floor((Y − origine_Y) / resolution)
```

Le plancher permet notamment de traiter correctement les coordonnées négatives.
La difficulté est de conserver les mêmes unités et conventions de repère pour
tous les scans. L'axe vertical n'est inversé que lors de l'affichage à l'écran.

## 3. Identification des cellules libres

Pour chaque mesure, l'algorithme de **Bresenham** parcourt les cellules entre
la position du lidar et l'impact. Les cellules précédant l'impact deviennent
libres, puisque le faisceau les a traversées sans rencontrer d'obstacle.

Le rayon part de l'origine définie par la pose du scan, pas nécessairement de
`(0,0)`. Si l'impact est hors carte, le rayon est limité au bord : seules les
cellules traversées deviennent libres, sans créer d'obstacle fictif au bord.
Une origine de lidar hors grille est refusée ; il faut agrandir ou repositionner
la carte. Bresenham est un parcours discret, sans modèle d'épaisseur du faisceau.

## 4. Identification des cellules occupées

La cellule contenant un impact intérieur à la carte est marquée occupée.
Les cellules libres et les impacts sont d'abord regroupés pour tout le scan.
Dans ce même scan, un impact a priorité sur une traversée : l'ordre des points
ne peut ainsi pas effacer un obstacle détecté par une autre mesure du scan.

Ce modèle suppose qu'un retour positif accepté représente un obstacle réel.
Les réflexions, les surfaces difficiles et les obstacles mobiles peuvent
néanmoins produire des mesures trompeuses.

## 5. Mise à jour d'une carte existante

La grille est sauvegardable en JSON avec ses paramètres, ses cellules et
l'historique des scans intégrés. Après rechargement, un nouveau scan et sa pose
peuvent être intégrés à cette même carte.

Une cellule anciennement occupée redevient libre si une nouvelle observation la
traverse sans impact dans cette cellule. Une nouvelle cellule d'impact devient
occupée. Les cellules non observées restent inchangées. Le modèle utilise la
dernière observation par scan : l'ordre des acquisitions influence donc le résultat.

Un scan déjà intégré avec la même pose et les mêmes filtres est ignoré pour
éviter les doublons. Si sa pose change, il faut reconstruire la carte avec les
poses corrigées ; déplacer un nuage à l'écran ne déplace pas les cellules déjà
enregistrées. L'interface signale cette situation.

## Hypothèses et filtrage

- Le lidar est supposé immobile pendant chaque balayage.
- Les poses doivent être suffisamment cohérentes dans un même repère.
- Les distances nulles ou négatives sont exclues.
- Les valeurs non finies sont refusées.
- La portée maximale est réglable, à 12 m par défaut.
- Un seuil d'intensité est disponible ; sa valeur initiale de zéro désactive ce
  filtrage. Si un seuil positif est demandé, les points sans intensité sont exclus.
- Une mesure rejetée ne libère aucune cellule : elle ne prouve pas l'absence
  d'obstacle.

## Difficultés et limites

Les principales difficultés sont la cohérence des unités et des repères, les
coordonnées négatives, les frontières de carte et les erreurs de pose. Une mauvaise
superposition des scans crée des obstacles dédoublés ou mal placés. Le recalage
automatique provisoire réalisé auparavant ne constitue pas une vérité terrain.

Le marquage direct reste sensible au bruit : une seule observation peut changer
l'état d'une cellule. Une cellule redevenue libre ne prouve donc pas à elle seule
qu'un obstacle physique a disparu. La discrétisation et les petites erreurs de
pose peuvent aussi expliquer ce changement.

Cette première version ne comporte ni accumulation probabiliste, ni vieillissement
temporel, ni lissage spatial. Ces améliorations proposées par le cours pourront
être ajoutées après validation du fonctionnement simple. La grille est limitée
à un million de cellules pour maîtriser la mémoire et le temps de rendu.

## Validation sur des scans réels

L'[exemple de mise à jour](visualisation/exemple_mise_a_jour/README.md) utilise
deux captures réelles, de 456 et 457 points. La première carte est sauvegardée,
rechargée dans un nouvel objet, puis mise à jour avec le second scan.

| État | Avant | Après |
|---|---:|---:|
| Libre | 3612 | 3884 |
| Occupé | 264 | 308 |
| Inconnu | 36124 | 35808 |
| Total | 40000 | 40000 |

Au total, **390 cellules changent d'état**. La pose du second scan est estimée,
pas mesurée. Les matrices, poses et images avant/après sont conservées avec
l'exemple. Le [guide technique](visualisation/GRID.md) détaille l'utilisation,
les formats d'export et les choix d'implémentation.

Les **27 contrôles** couvrent la lecture des scans, les transformations, les
rayons, les bords, les impacts, les filtres, les doublons et la mise à jour après
rechargement. Un contrôle supplémentaire exerce les commandes de la page dans
un DOM minimal ; il ne remplace pas une vérification visuelle du navigateur.

## Référence

Document fourni pour le TP : « Construction d'une grid map 2D à partir d'un scan
Lidar », Jonathan Quillès, 2026. L'implémentation suit ses étapes : définition de
la grille, transformation des mesures, mise à jour des cellules traversées,
marquage des impacts et intégration des scans suivants.
