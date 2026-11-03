# Nouvelle série de scans réels — 3 novembre 2026

Onze acquisitions ont été déclenchées après le signal « prêt » de l'opérateur,
entre 13:36 et 13:55, heure de Paris. Les CSV bruts sont conservés, ainsi que les
tracés PNG et les rapports de contrôle angulaire. Les acquisitions ont été lues
sur COM3 à 115200 bauds depuis le programme ESP32/LD06 déjà utilisé.

## Fichiers à utiliser

Pour la cartographie, utiliser **un seul fichier par acquisition**, celui indiqué
par `validated_file` dans `manifest.json`. Ne pas charger simultanément le brut
long et sa copie `_tour_controle` : ils représentent la même acquisition.

| N° | Heure | Suffixe du fichier brut | Points bruts | Points retenus | Distances positives | Séquence à utiliser |
|---|---|---|---:|---:|---:|---|
| 1 | 13:36:28 | `133628_543217` | 456 | 456 | 456 | Brut |
| 2 | 13:38:45 | `133845_500246` | 456 | 456 | 456 | Brut |
| 3 | 13:41:10 | `134110_737612` | 457 | 457 | 457 | Brut |
| 4 | 13:46:22 | `134622_010623` | 456 | 456 | 454 | Brut |
| 5 | 13:49:30 | `134930_813109` | 456 | 456 | 452 | Brut |
| 6 | 13:50:38 | `135038_480202` | 455 | 455 | 455 | Brut |
| 7 | 13:51:34 | `135134_531993` | 1063 | 457 | 457 | Copie `_tour_controle` |
| 8 | 13:52:32 | `135232_589873` | 1026 | 457 | 457 | Copie `_tour_controle` |
| 9 | 13:53:47 | `135347_223669` | 456 | 456 | 456 | Brut |
| 10 | 13:54:48 | `135448_962801` | 987 | 457 | 457 | Copie `_tour_controle` |
| 11 | 13:55:40 | `135540_914531` | 456 | 456 | 451 | Brut |

Les noms commencent par `scan_20261103_` et se terminent par `.csv`.
Les bruts contiennent **6724 mesures** au total. Les séquences retenues contiennent
**5019 mesures**, dont **5008 distances positives** et **11 distances nulles**.
Les retours nuls restent dans les CSV mais ne sont pas tracés comme des obstacles.

## Contrôles effectués

- Continuité des indices de points et cohérence du nombre de colonnes.
- Angles finis dans [0°,360°] et distances finies.
- Séquence retenue monotone dans le sens observé pour le programme utilisé.
- Début >357°, fin <3°, étendue ≥357°, pas angulaire entre mesures ≤3°.
- Absence de passage interne supplémentaire par zéro dans la séquence retenue.

Pour les captures 7, 8 et 10, le bloc brut ne correspondait pas à une séquence
unique propre. Une séquence quasi complète et monotone a été extraite dans un
fichier séparé, sans modifier les mesures. `source_point_index` conserve les
indices du bloc d'origine ; `point_index` est renuméroté depuis zéro dans la copie.
Chaque fichier `_controle.json` décrit les limites retenues et les résultats.

Ces contrôles valident la cohérence angulaire, **pas la précision des distances,
la durée physique du tour ni l'immobilité réelle du capteur**. Les horaires sont
ceux de la sauvegarde sur le PC, pas des horodatages matériels par point.

## Poses et utilisation

Les déplacements et rotations entre les positions n'ont pas été renseignés par
l'opérateur. Aucune pose physique mesurée n'est donc attribuée à cette série.
La première position peut définir un repère local arbitraire ; les suivantes
devront être réglées ou estimées avant fusion des cartes.

Dans le visualiseur, utiliser **Charger des CSV** et sélectionner les onze fichiers
contrôlés indiqués par le manifeste. Le bouton des six scans préchargés correspond
encore à l'ancienne série ; cette nouvelle série ne la remplace pas automatiquement.
Chaque image PNG correspond aux points cartésiens du fichier contrôlé associé,
en mètres, avec l'origine locale du lidar indiquée en rouge.
