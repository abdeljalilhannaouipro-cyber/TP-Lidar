# TP — Jour 1, étape 4 : extraction et manipulation de segments

L'[atelier de segments](visualisation/index.html) transforme les scans positionnés
en segments, puis permet de calculer leurs angles, tester leur proximité en angle
et en position, fusionner deux segments proches, calculer leur intersection et
découper le premier en conservant le plus long côté.

La [démarche complète](visualisation/SEGMENTS.md) explique les choix techniques,
les paramètres, les hypothèses, les difficultés, les formats et les limites.

Le découpage exige une intersection sur les deux segments et à l'intérieur de A.
Les extrémités de A et les supports colinéaires ne provoquent pas de découpage.
À égalité de longueurs à **1e-9 m** près, le côté du premier point de A est conservé.
Le parallélisme est testé sur les directions unitaires avec un seuil sans unité
de **1e-12** sur le sinus de l'angle.

L'[exemple réel et les exemples géométriques](visualisation/exemple_segments/README.md)
présentent les images et fichiers rechargeables. Le scan de 11:39 fournit
**28 segments pour 457 points**, avec les paramètres documentés. Le nombre dépend
des seuils et ne représente pas un décompte d'objets physiques.

**38 contrôles dédiés aux segments** couvrent les cas limites, en plus des
27 contrôles précédents. Le raccordement des commandes a été exercé dans un DOM
minimal ; cela ne constitue pas une vérification visuelle complète du navigateur.
Cette étape fournit les primitives et les opérations ; la carte vectorielle
continue du point 5 reste à développer séparément.
