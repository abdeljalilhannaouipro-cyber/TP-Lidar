# TP — Jour 1, étape 5 : carte vectorielle 2D

La carte vectorielle représente les parois et obstacles linéaires par des
segments `(x1,y1,x2,y2)` en mètres. Elle réutilise les fonctions développées à
l'étape 4 pour l'extraction, les angles, la proximité, la fusion, l'intersection
et le découpage.

À chaque nouveau scan positionné, les mesures sont filtrées et transformées dans
le repère de carte. Les segments sont extraits ; les éléments proches sont
fusionnés et les nouvelles primitives sont ajoutées. L'historique indique les
scans qui confirment chaque primitive.

Un ancien segment non confirmé, traversé par plusieurs rayons suffisamment
avant leurs impacts, peut être réduit avec la règle du plus long côté. Après
plusieurs scans contradictoires, il est retiré. Les seuils, tolérances, hypothèses
et limites sont détaillés dans le [compte rendu technique](visualisation/VECTORIELLE.md),
en suivant les six étapes du document du cours.

L'[exemple réel](visualisation/exemple_vectorielle/README.md) utilise les scans
contrôlés de 11:37 et 11:39 : la carte passe de **23 à 30 primitives**, dont
**17 confirmées par les deux scans**. Elle est sauvegardée puis rechargée entre
les intégrations. La deuxième pose est estimée, pas mesurée ; il s'agit d'une
carte locale partielle, pas d'une reconstruction globale validée des six scans.

Le nettoyage n'est pas déclenché sur cette paire réelle. Un exemple synthétique
séparé montre sa réduction et son retrait progressifs, sans les présenter comme
une observation de disparition physique d'un obstacle.

La version comprend les exports JSON, CSV et PNG, un générateur d'exemple et
**25 contrôles dédiés à la carte vectorielle**, soit **92 contrôles au total**
avec les étapes précédentes. Les images représentent les primitives calculées.
Les commandes ont aussi été vérifiées dans un DOM minimal ; la validation
graphique de l'interface dans le navigateur reste distincte de ces contrôles.
