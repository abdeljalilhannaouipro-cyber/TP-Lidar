# Étape 3 — Construction et mise à jour d'une grid map 2D

Un [exemple complet avec deux scans réels](exemple_mise_a_jour/README.md) présente
la sauvegarde, le rechargement et la mise à jour d'une carte existante, avec les
matrices avant/après, des images et un script de reproduction.

## Utilisation

Ouvrir `index.html` dans Chrome ou Edge. Le panneau **Grille d'occupation** est
ajouté au visualiseur des étapes précédentes.

1. Charger les scans, régler leurs poses ou ouvrir un fichier de poses sauvegardé.
   Une pose nulle est une origine de référence, pas un recalage automatique.
2. Régler la résolution, la largeur, la hauteur et l'origine inférieure gauche
   de la grille. Valeurs initiales : **30 × 30 m**, **0,10 m/cellule** et origine
   **(-15,-15) m**, soit **300 × 300 cellules**.
3. Cliquer sur **Créer / vider la grille** : toute la carte est inconnue.
4. Sélectionner la fiche d'un scan, puis **Intégrer le scan sélectionné** pour
   construire la carte à partir de ce scan et de sa pose.
5. Sélectionner un autre scan correctement positionné et l'intégrer : la même
   carte est mise à jour. **Intégrer les scans visibles** traite tous les scans
   cochés dans leur ordre de chargement. Les doublons déjà intégrés sont ignorés.
6. Choisir la vue **Grille** ou **Grille + points**. Les compteurs indiquent le
   nombre de cellules libres, occupées et inconnues. En vue Grille seule, les
   origines affichées sont les poses utilisées lors de l'intégration.
7. **Sauver JSON** conserve les cellules, dimensions, résolution et poses des scans
   intégrés. Pour reprendre une carte existante, cliquer sur **Ouvrir une grille**,
   charger les nouveaux scans, régler leurs poses puis les intégrer.
8. **Exporter CSV** produit la matrice ; **Exporter PNG** enregistre la vue actuelle.

Une grille conserve les observations faites avec les poses de l'instant où les
scans ont été intégrés. Modifier une pose après intégration ne déplace pas les
cellules déjà marquées. L'outil signale cette différence et refuse une seconde
intégration du même scan avec une autre pose. Pour corriger la carte, **recréer la
grille et réintégrer les scans** après correction des poses. Masquer ou retirer un
scan de la vue n'efface pas son historique dans la grille.

## Démarche suivant le document du cours

Référence : « Construction d'une grid map 2D à partir d'un scan Lidar », fourni
par l'étudiant, © Jonathan Quillès, 2026. Les cinq étapes sont appliquées ainsi :

| Étape du document | Implémentation |
|---|---|
| 1. Définir la grille et son état initial | Matrice `Uint8Array`, dimensions configurables, initialisation inconnue |
| 2. Convertir les points et appliquer la pose | Lecture métrique existante, transformation rigide de chaque impact, indices par plancher |
| 3. Mettre à jour les cellules traversées | Parcours de Bresenham entre cellule du lidar et cellule de fin du rayon |
| 4. Marquer la cellule d'impact | Impact à l'intérieur de la carte marqué occupé, priorité sur les traversées du même scan |
| 5. Mise à jour continue et nettoyage | Intégration de nouveaux scans ; une nouvelle traversée peut effacer un ancien obstacle |

### 1. Définition de la carte

Le modèle est volontairement simple, **à trois états catégoriels** :

- `0` : libre, affiché en blanc ;
- `127` : inconnu, affiché en gris ;
- `255` : occupé, affiché en bleu très sombre.

Ce ne sont **pas des probabilités calibrées** : 127 désigne l'inconnu et non une
confiance accumulée. Le document autorise le marquage direct. Une résolution de
10 cm est un choix pédagogique modifiable. Des cellules plus petites améliorent
le détail mais augmentent la mémoire et rendent le bruit plus visible.

La largeur et la hauteur sont arrondies vers le haut à un nombre entier de
cellules. Leur taille effective figure dans la carte sauvegardée. Limite choisie
pour le navigateur : 1 000 000 cellules ; résolution de 0,02 à 2 m.

### 2. Passage au repère de carte et filtrage

Le lecteur des scans fournit les points locaux en mètres. Il conserve la
convention cartésienne des fichiers sources ; le sens de l'angle polaire est
réglable pour les CSV qui ne contiennent pas leurs propres coordonnées XY.
La pose applique :

```text
X = tx + cos(theta) x - sin(theta) y
Y = ty + sin(theta) x + cos(theta) y
i = floor((X - origineX) / resolution)
j = floor((Y - origineY) / resolution)
```

Theta est exprimé en degrés dans l'interface, puis converti en radians. Le
plancher traite aussi les coordonnées négatives. Le domaine est fermé à gauche
et en bas, ouvert à droite et en haut. L'export JSON stocke les lignes depuis
le bas ; l'export CSV les écrit depuis le haut et documente cette convention.

Les distances nulles/négatives sont exclues à la lecture. Avant la grille,
la portée maximale est réglable (12 m par défaut) et le seuil d'intensité est
réglable (0 par défaut : pas de filtre de qualité). Pour un seuil positif, les
mesures sans intensité connue sont exclues. Les mesures rejetées ne libèrent
aucune cellule : une mesure invalide ne prouve pas l'absence d'obstacle.
Les valeurs non finies sont refusées. La portée est évaluée sur la distance
cartésienne locale, supposée centrée sur le lidar comme dans les scans fournis.

### 3. Cellules libres

Le rayon part de **l'origine de la pose du scan**, et non systématiquement de
`(0,0)`. Bresenham énumère les cellules entre origine et impact. Toutes deviennent
libres à l'exception de l'impact intérieur. Le parcours est discret ; ce n'est
pas un modèle d'épaisseur physique du faisceau ni un supercover de toutes les
cellules qu'une droite mathématique peut toucher.

Le lidar doit être dans la grille, faute de quoi le scan est refusé. Si l'impact
est hors grille, le rayon est limité au bord : seules les cellules accessibles
deviennent libres, **sans obstacle fictif sur le bord**. Agrandir la carte reste
nécessaire pour enregistrer l'obstacle hors zone.

### 4. Cellules d'impact

Les cellules libres et occupées sont réunies par scan. Les impacts ont priorité
sur les traversées dans ce scan, ce qui évite que l'ordre des points efface un
autre impact de la même acquisition. Une cellule d'impact est occupée même si
elle est aussi la cellule de l'origine, pour un retour très proche.

### 5. Mise à jour de la carte

Les scans sont intégrés dans l'ordre choisi. Une observation du nouveau scan
remplace directement l'ancien état de chaque cellule concernée. Ainsi, une
cellule anciennement occupée et désormais traversée redevient libre. Les cellules
non observées gardent leur état. Le résultat dépend donc de l'ordre des scans.

Les fonctions peuvent être utilisées séparément de l'interface :

```javascript
const grid = new LidarGrid.Grid({resolution: .1, width: 30, height: 30, x: -15, y: -15});
grid.integrate(scan1, LidarCore.transform);  // scan1.points et scan1.pose
const saved = grid.save();
const existing = LidarGrid.Grid.load(saved);
existing.integrate(scan2, LidarCore.transform); // mise à jour d'une carte existante
```

Les opérations préparent les observations avant de modifier la carte. Une erreur
de point ne laisse pas une mise à jour partielle. L'intégration de plusieurs
scans dans l'interface est également préparée sur une copie puis appliquée si
tous les scans sont acceptés.

## Formats d'export

- **JSON** : format versionné `tp-lidar-grid-v1`, résolution en mètres, origine,
  dimensions entières `nx,ny`, cellules en ordre `j*nx+i`, et historique des poses.
  C'est le format à utiliser pour rouvrir et mettre à jour la carte.
- **CSV** : deux lignes de commentaires `#` précisent états, origine, résolution,
  dimensions et ordre des lignes, puis matrice écrite du haut vers le bas.
  Le CSV est un export de consultation, pas le format d'import de l'outil.
- **PNG** : rendu de la vue choisie, avec échelle métrique et origines.

## Difficultés, hypothèses et limites

La qualité de la carte dépend d'abord des poses. Le recalage automatique
provisoire précédent contenait des correspondances ambiguës ; il ne doit pas
être utilisé comme vérité terrain. L'outil intègre les poses fournies manuellement,
sans ajouter de scan matching automatique à cette étape.

On suppose le lidar immobile pendant chaque balayage et l'environnement
suffisamment stable. Un retour positif accepté est traité comme un impact réel ;
le format source ne distingue pas explicitement un retour sans obstacle à portée
maximale. Les personnes, réflexions et pertes de mesures peuvent créer des artefacts.

Cette première version ne comprend pas d'accumulation probabiliste, vieillissement
temporel ou lissage spatial. Ces améliorations proposées par le document pourront
être ajoutées ensuite. Le marquage direct est plus simple à expliquer et vérifier,
mais une seule observation erronée peut modifier une cellule.

## Tests

```powershell
node visualisation/test_core.cjs
node visualisation/test_grid.cjs
```

Les 17 contrôles de grille couvrent les indices, Bresenham dans tous les octants,
les poses, les traversées, les impacts, les bords, les filtres, les doublons,
l'effacement d'un ancien obstacle, les exports et le rechargement d'une carte
avant mise à jour. Un test utilise le scan réel contrôlé de 11:37 et vérifie une
carte non vide ainsi que la fidélité de sauvegarde/rechargement. Les 10 contrôles
de l'étape 2 restent exécutés pour détecter les régressions.

Une vérification supplémentaire exécute les gestionnaires réels de la page dans
un DOM minimal : création de grille, intégration, gestion des doublons, refus
d'une pose modifiée, rechargement puis nouvelle intégration. Ce contrôle valide
le raccordement des commandes au calcul, pas le rendu graphique du navigateur.
Le PNG de l'[`exemple réel`](exemple_grille/README.md) a été inspecté ; c'est un
rendu de la matrice calculée, pas une capture de l'interface.
