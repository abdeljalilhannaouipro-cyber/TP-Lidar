# Étape 4 — Extraction et manipulation de segments

Cette étape ajoute un atelier de géométrie au visualiseur. Elle couvre les six
fonctions demandées ; la construction continue d'une carte vectorielle reste
l'étape 5 et n'est pas annoncée comme réalisée ici.

## Utiliser l'atelier

1. Ouvrir `index.html` dans Chrome ou Edge, puis **Charger mes 6 scans** ou ses
   propres CSV. Régler les poses avant d'extraire les segments.
2. Dans **Atelier de segments**, choisir les seuils et cliquer sur **Extraire
   du scan sélectionné** ou **Extraire des scans visibles**. L'extraction remplace
   l'ensemble de segments précédent. Elle ne modifie ni les scans ni la grille.
3. La vue **Points + segments** superpose le résultat aux mesures. La vue
   **Segments** affiche uniquement les segments, dans le même repère métrique.
4. Choisir deux segments distincts **A** et **B** dans les listes. A est accentué
   en rouge, B en bleu. Le point `a` est la première extrémité, remplie ; `b` est
   la seconde, creuse. Cet ordre intervient dans la règle d'égalité du découpage.
5. **Angle, proximité et intersection** affiche les angles, la distance minimale,
   la décision de proximité et le point d'intersection éventuel.
6. **Fusionner A + B** remplace les deux segments par un seul s'ils passent les
   deux critères. Sinon, un message explique le refus et rien n'est modifié.
7. **Découper A par B** ne modifie que A et conserve son plus long côté. B reste
   inchangé. Un message indique pourquoi un découpage a lieu ou est refusé.
8. **Annuler la dernière opération** restaure l'état précédent des segments
   (jusqu'à 20 modifications conservées pendant la session).
9. **Sauver JSON** conserve les segments et leurs poses sources ; **Ouvrir des
   segments** recharge cet état. **Exporter CSV** écrit leurs extrémités en mètres.
   Le bouton général **Exporter PNG** enregistre la vue actuelle.

Il est aussi possible d'ajouter un segment par ses quatre coordonnées et de
charger les exemples géométriques intégrés : croisement intérieur, égalité,
extrémité, supports croisés hors de B, colinéarité, extrémité de B intérieure à A
et fusion de segments proches. Ce sont des cas synthétiques explicitement séparés
des acquisitions réelles.

Les segments sont des copies dans le repère global **au moment de l'extraction**.
Si une pose est ensuite modifiée, un avertissement demande de réextraire les
segments pour les comparer aux scans déplacés. Déplacer le nuage à l'écran ne
déplace pas automatiquement les segments déjà manipulés.

## 1. Transformer le nuage en segments

La démarche suit les étapes de segmentation et de régression proposées dans
le document « Construction d'une carte vectorielle 2D à partir d'un scan lidar »
(Jonathan Quillès, 2026), fourni pour le TP.

Les points locaux sont exprimés en mètres, filtrés par portée et éventuellement
par intensité, puis transformés avec la pose du scan. Leur ordre d'acquisition
est conservé. La portée maximale initiale est 12 m ; le seuil d'intensité initial
de 0 désactive ce filtre. Si un seuil positif est demandé, les mesures sans
intensité connue sont exclues. Les retours nuls sont déjà exclus par le lecteur.

Les points successifs distants de plus de **0,30 m** sont séparés en groupes.
Chaque groupe est ajusté par une droite de **moindres carrés orthogonaux (PCA 2D)**.
Si un point est à plus de **0,05 m** de la droite, le groupe est scindé au point
intérieur le plus éloigné de la corde premier–dernier point, puis les sous-groupes
sont retraités. Pour un groupe dont la corde est dégénérée, la droite PCA sert
de référence de découpage. Une pile explicite évite la récursion profonde.

Une droite acceptée donne un segment dont les bornes sont les projections
extrêmes des points sur son support. On conserve au moins **5 points** et
**0,15 m** de longueur. Les fragments trop courts sont écartés. L'erreur maximale
des points du groupe à la droite ajustée est contrôlée avant acceptation.

Les seuils sont pédagogiques et réglables. Ils limitent les petits artefacts,
mais peuvent aussi supprimer des objets fins ou fragmenter un mur. Les derniers
et premiers points d'un tour ne sont pas réunis automatiquement. Une courbe peut
être approximée par plusieurs segments ; aucun cercle n'est reconnu ici.

## 2. Angle entre deux segments

Chaque segment non dégénéré possède une direction unitaire. L'angle principal
est celui des **supports non orientés**, entre **0° et 90°**. Il est indépendant
du sens des extrémités : deux segments colinéaires parcourus en sens opposés ont
un angle de support nul.

L'outil affiche aussi l'angle des directions `a → b`, entre **0° et 180°**, pour
éviter toute ambiguïté. Un segment de longueur inférieure ou égale à la tolérance
n'a pas de direction exploitable : le calcul d'angle le refuse.

## 3. Proximité angulaire et spatiale

Les deux conditions doivent être satisfaites :

- angle des supports ≤ **8°** par défaut ;
- distance minimale entre les **segments finis** ≤ **0,12 m** par défaut.

Si les segments se croisent ou se recouvrent, la distance est nulle. Sinon,
on calcule la plus petite des distances de chaque extrémité à l'autre segment,
en limitant la projection aux bornes du segment. Deux murs parallèles éloignés
ou deux segments perpendiculaires qui se croisent ne sont donc pas « proches »
selon les deux critères simultanément.

Ces critères ne prouvent pas que deux observations décrivent le même objet.
Des seuils trop grands peuvent fusionner des parois distinctes.

## 4. Fusion

La fusion est refusée si la proximité angulaire ou spatiale échoue. Sinon,
une droite PCA est ajustée aux quatre extrémités. Les projections extrêmes
définissent le nouveau segment ; le sens de la première entrée A est conservé.

Les quatre extrémités ont le même poids. Ce choix simple ne pondère ni le nombre
de points des observations initiales, ni leur incertitude. La fusion peut combler
un petit intervalle et décaler légèrement les supports. Les deux entrées ne sont
pas modifiées par la fonction de calcul ; l'interface les remplace explicitement
par le résultat et permet d'annuler.

## 5. Intersection sur les deux segments

On résout l'intersection des supports, puis on vérifie la position du point
sur **chacun des segments finis**. Le croisement des droites au-delà de l'une
des extrémités ne constitue pas une intersection valide des segments.

La fonction distingue : point unique, absence d'intersection, parallélisme,
colinéarité et dégénérescence. Pour des supports colinéaires, elle renseigne
l'éventuel intervalle de recouvrement, mais ne prétend pas fournir un point
d'intersection unique.

## 6. Découpage en conservant le plus long côté

Pour couper **A par B**, les règles sont appliquées dans cet ordre :

1. Refuser un découpage pour des segments dégénérés ou des supports colinéaires.
2. Exiger un point d'intersection appartenant aux deux segments, à la tolérance
   numérique près.
3. Exiger que ce point soit **strictement intérieur à A** : sa distance à chacune
   des extrémités de A doit dépasser la tolérance linéaire.
4. Mesurer les deux côtés de A et conserver le plus long.
5. Si la différence de longueurs est inférieure ou égale à la tolérance, conserver
   le côté contenant **le premier point `a` du segment A avant découpage**.

Une intersection à une extrémité de A ne change rien. Une extrémité de B peut en
revanche provoquer le découpage si elle est à l'intérieur de A. B reste inchangé.
La conservation du plus long côté supprime volontairement l'autre côté : c'est
la règle de l'exercice, pas une garantie de préservation de toute la géométrie.

### Tolérances numériques

- **EPS = 1e-9 m** pour les longueurs, les appartenances aux segments et l'égalité
  des côtés. À moins de EPS d'une extrémité, le point est traité comme à l'extrémité.
- **1e-12 sur la valeur absolue du sinus de l'angle** entre directions unitaires
  pour reconnaître des supports parallèles. Ce seuil est sans unité et ne dépend
  pas de la longueur brute des segments.

Ces tolérances traitent les erreurs d'arrondi. Elles ne représentent **pas**
le bruit du lidar, qui est pris en compte par les seuils métriques d'extraction
et de proximité, beaucoup plus grands.

## Fonctions réutilisables

`segments.js` fonctionne dans le navigateur et avec Node.js, sans dépendance :

```javascript
const S = require('./visualisation/segments.js');
const A = S.segment([0, 0], [4, 0]);
const B = S.segment([1, -1], [1, 1]);
S.angleDeg(A, B);             // 90 degrés
S.proximity(A, B);            // angle + distance + décision
S.intersection(A, B);         // point [1, 0]
S.cutLongest(A, B).segment;   // de [1, 0] à [4, 0]
// S.merge(A, B) est refusé : angle trop grand.
```

`extract(points, options)`, `merge(A,B,seuils)`, `save(items)`, `load(json)` et
`csv(items)` complètent cette API. Les fichiers JSON sont versionnés
`tp-lidar-segments-v1`. Les CSV contiennent `label,x1_m,y1_m,x2_m,y2_m,length_m`.

## Résultats et tests

Sur le scan réel de **11:39:03**, à pose locale nulle, les paramètres initiaux
donnent **28 segments pour 457 points**. L'extraction indépendante des six scans
contrôlés donne **154 segments** au total ; cela ne signifie pas 154 murs distincts.
Les doublons entre scans ne sont pas automatiquement fusionnés à cette étape.

Les [exemples rechargeables](exemple_segments/README.md) comprennent l'extraction
réelle, le découpage avant/après et les résultats des cas limites. Les images
montrent les calculs, pas des captures de l'interface.

```powershell
node visualisation/test_core.cjs
node visualisation/test_grid.cjs
node visualisation/test_segments.cjs
```

Résultat : **10 + 17 + 38 = 65 contrôles réussis**. Les contrôles de segments
couvrent notamment les extrémités de A et B, les intersections hors segment,
la colinéarité, l'égalité exacte, l'égalité à EPS près, le sens inversé du premier
segment, les segments dégénérés, l'absence de mutation du coupeur et les scans réels.

Un contrôle supplémentaire exécute les gestionnaires de l'interface dans un DOM
minimal : extraction réelle, découpage, B inchangé, annulation, cas sans changement,
égalité, fusion et rechargement JSON. Ce contrôle n'est pas une validation visuelle
du navigateur. Les images calculées de l'extraction et du découpage sont inspectées.
