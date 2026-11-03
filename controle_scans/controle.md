# Contrôle des captures longues — 3 novembre 2026

## Résultat

**Les fichiers bruts de 1061 et 956 points ne doivent pas être considérés comme
des scans propres d'un seul tour.** Ils présentent une couverture angulaire
répétée et une inversion anormale de progression des angles. Les indices continus
ne suffisent donc pas à valider la délimitation d'un tour.

| Capture | Points bruts | Passage de zéro interne | Autre anomalie |
|---|---:|---|---|
| 11:37:14 | 1061 | indices 604 → 605 : 0,23° → 358,74° | indices 412 → 413 : 35,31° → 150,44°, retour de 115,13° |
| 11:42:51 | 956 | indices 498 → 499 : 0,30° → 359,57° | indices 332 → 333 : 98,80° → 130,57°, retour de 31,77° |

La somme des incréments angulaires ramenés dans [-180°,180°[ vaut respectivement
−718,83° et −719,39°, au lieu d'environ −360° pour les captures normales.
Les inversions supplémentaires empêchent cependant d'interpréter simplement
chaque fichier comme deux tours physiques propres et consécutifs.

## Séquences extraites

Les secondes séquences, après le passage de zéro interne, sont monotones et
proches d'un tour complet. Elles sont extraites dans de **nouveaux fichiers** :

| Fichier dérivé | Indices d'origine conservés | Points | Premier → dernier angle | Étendue | Plus grand pas | Écart de fermeture |
|---|---|---:|---|---:|---:|---:|
| `scan_20261103_113714_728775_tour2.csv` | 605 à 1060 | 456 | 358,74° → 0,67° | 358,07° | 1,57° | 1,93° |
| `scan_20261103_114251_824188_tour2.csv` | 499 à 955 | 457 | 359,57° → 0,24° | 359,33° | 1,60° | 0,67° |

La colonne `point_index` recommence à zéro dans chaque copie. La colonne ajoutée
`source_point_index` conserve l'indice d'origine. Toutes les valeurs de mesure
sont recopiées sans interpolation ni correction. Les CSV bruts restent inchangés.

Ces copies sont **cohérentes angulairement avec un balayage quasi complet** :
progression monotone, pas ≤ 3°, étendue ≥ 357°, premier angle > 357° et dernier
angle < 3°. Les quatre autres captures du jour montrent une progression monotone
avec une étendue d'environ 359,7°. Les seuils proposés permettent les petits
intervalles non échantillonnés ; ils ne constituent pas une spécification du capteur.

## Délimitation par la bibliothèque

La bibliothèque de l'archive `Ressources-20261102.zip`, fichier
`LD06/src/ld06.cpp`, détecte une baisse de l'angle physique pour repérer un
nouveau tour. Dans `computeData()` (lignes 117–128 de cette version), elle ne
permute les tampons que si l'étendue depuis le début dépasse 340°. Une inversion
anormale ou une perte de paquets peut perturber cette logique. `printScanCSV()`
imprime ensuite les indices du tampon et une ligne vide, sans horodatage ni
identifiant de rotation par point.

Cette observation fournit une explication possible de l'accumulation de données,
mais **la cause matérielle ou logicielle exacte n'est pas établie** avec les seuls
CSV. Il n'est pas possible de vérifier les CRC des paquets d'origine, les temps
de rotation, l'absence de mouvements du capteur ou une éventuelle perte UART.

## Utilisation pour la suite du TP

Conserver les deux bruts pour la traçabilité, mais utiliser les copies `_tour2`
pour les prochaines visualisations et opérations de cartographie. Il s'agit de
sous-ensembles des captures existantes, pas de nouvelles acquisitions.

L'alignement provisoire précédemment exporté utilise encore les fichiers longs
bruts : **il n'a pas été recalculé par ce contrôle** et devra être revérifié avec
les copies nettoyées. Pour les prochaines captures, vérifier aussi la progression
des angles, et pas seulement les indices ou une ligne vide séparatrice.
