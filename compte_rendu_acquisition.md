# TP — Jour 1 : acquisition des données lidar

## Matériel et configuration

Les acquisitions ont été réalisées le **3 novembre 2026** avec un lidar **LD06**,
relié à une carte **ESP32** connectée au PC Windows par USB. Le programme utilisé
est `ESP32_LD06_Test.ino`, avec la bibliothèque LD06 fournie dans les ressources
du cours. Le modèle exact de carte et les versions de la bibliothèque et du cœur
ESP32 restent à relever pour rendre la configuration reproductible.

Le câblage prévu par le programme et les ressources est le suivant :

| Liaison | Connexion |
|---|---|
| TX du LD06 | GPIO33 de l'ESP32, réception de `Serial2` |
| Commande PWM du LD06 | GPIO32, initialisée à l'état haut par la bibliothèque |
| Masse | Masse commune entre le lidar et l'ESP32 |
| Alimentation du LD06 | 5 V selon les ressources ; source d'alimentation réelle à préciser |
| ESP32 vers PC | USB, port détecté **COM3** |

Ces connexions correspondent à la configuration logicielle ; le câblage physique
n'a pas été inspecté directement. La liaison **LD06 → ESP32** fonctionne à
**230400 bauds**, en **8N1**. La liaison **ESP32 → PC** est réglée à
**115200 bauds**, également en **8N1**.

## Procédure suivie

1. Consulter les ressources LD06 et le programme d'exemple fourni.
2. Brancher l'ESP32 au PC et repérer le port série COM3.
3. Libérer le port série en fermant les autres outils susceptibles de l'utiliser.
4. Demander de maintenir le lidar immobile pendant chaque acquisition ; après
   mise en place de la procédure, attendre le signal « ready » de l'opérateur.
5. Lire les lignes CSV transmises par le programme. Attendre un indice de point
   égal à zéro, puis enregistrer jusqu'au séparateur de fin de scan ou au début
   du bloc suivant. Vérifier la continuité des indices et le nombre de colonnes.
6. Sauvegarder chaque acquisition dans un fichier horodaté distinct, sans écraser
   les précédents. Les horaires ci-dessous sont ceux du PC, en heure de Paris,
   et correspondent à l'enregistrement, pas à un horodatage matériel du lidar.

Les fichiers contiennent `point_index`, `angle_deg`, `dist_mm`, `intensity`,
`x_lib_mm` et `y_lib_mm`. Les mesures polaires nécessaires au TP sont **l'angle
en degrés et la distance en millimètres**. Les coordonnées cartésiennes fournies
par la bibliothèque sont conservées comme données supplémentaires.

## Jeux de données enregistrés

Les noms commencent par `scan_20261103_` et se terminent par `.csv`.

| Suffixe du fichier | Heure | Mesures | Distances nulles |
|---|---|---:|---:|
| `112700_205708` | 11:27:00 | 457 | 3 |
| `112833_263525` | 11:28:33 | 457 | 0 |
| `113456_758311` | 11:34:56 | 457 | 1 |
| `113714_728775` | 11:37:14 | 1061 | 0 |
| `113903_422823` | 11:39:03 | 457 | 0 |
| `114251_824188` | 11:42:51 | 956 | 0 |

Au total, **3845 mesures** sont conservées, dont **4 distances nulles**. Ces
retours invalides restent dans les fichiers bruts mais sont exclus des tracés
et de l'alignement. Les essais répétés sont conservés et identifiés ; ils ne sont
pas tous assimilés à des acquisitions réalisées après un déplacement maîtrisé.

## Positions approximatives des acquisitions

Les positions et orientations physiques dans la salle n'ont pas été mesurées
ni consignées pendant les acquisitions. Il n'est donc pas possible de fournir
des positions expérimentales vérifiées à partir du seul journal disponible.

À titre indicatif, l'alignement automatique ultérieur donne les poses suivantes,
**dans un repère arbitraire fixé à la première capture**, en mètres et degrés :

| Heure | x estimé (m) | y estimé (m) | Orientation estimée (°) |
|---|---:|---:|---:|
| 11:27:00 | 0,00 | 0,00 | 0,0 |
| 11:28:33 | -1,98 | -0,80 | 99,2 |
| 11:34:56 | -0,52 | -0,11 | -0,5 |
| 11:37:14 | -0,75 | 0,05 | -74,3 |
| 11:39:03 | -0,70 | 0,09 | -75,1 |
| 11:42:51 | -3,80 | 2,16 | 7,3 |

Ces valeurs sont des **estimations de recalage**, pas des relevés sur place.
Certaines correspondances sont ambiguës ; les poses doivent être comparées aux
déplacements réellement effectués avant d'être utilisées comme référence.
Les détails figurent dans `alignment_today/poses_and_quality.json`.

## Vérifications et limites

Les six CSV sont présents dans le dépôt GitHub TP-Lidar ; leur présence a été
vérifiée au commit `f3100fb`. Les indices des points ont été contrôlés lors de
l'enregistrement. Un nuage de points permet ensuite un contrôle visuel de la scène.

La continuité des indices ne prouve toutefois pas qu'un bloc correspond exactement
à une rotation physique. Les captures de **1061 et 956 points**, plus longues
que les autres, demandent un contrôle des angles et de la délimitation des tours.
Elles sont conservées sans être annoncées comme des tours uniques validés.
L'immobilité du capteur, les erreurs de distance et les effets d'occlusion n'ont
pas fait l'objet d'une mesure indépendante. Pour les prochaines acquisitions,
noter la position, l'orientation approximative et les conditions de chaque essai.
