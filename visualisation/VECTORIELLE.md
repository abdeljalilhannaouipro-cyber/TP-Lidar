# Étape 5 — Construction d'une carte vectorielle 2D

L'outil réutilise les fonctions de l'étape 4 pour construire et maintenir une
liste de segments à partir de scans positionnés. Cette carte est indépendante
de la grille d'occupation et de l'ensemble modifiable dans l'atelier.

## Utilisation

1. Ouvrir `index.html`, charger les scans et régler leurs poses dans un même
   repère. On peut aussi charger un fichier de poses sauvegardé.
2. Déplier l'**Atelier de segments** pour régler l'extraction, les filtres et les
   seuils de proximité. Le panneau **Carte vectorielle** reprend ces réglages.
3. Choisir les paramètres de nettoyage, puis **Créer / vider la carte**.
   Les paramètres sont figés pour cette carte et enregistrés dans ses exports.
4. Sélectionner un scan et cliquer sur **Intégrer**. Sa pose est appliquée aux
   points ; les segments sont extraits et intégrés à la carte.
5. Intégrer les scans suivants, ou **Intégrer les scans visibles**, dans l'ordre
   de chargement. Les observations proches sont fusionnées. Les segments nouveaux
   sont ajoutés ; les anciens segments traversés peuvent être réduits ou retirés.
6. Choisir **Carte vectorielle** ou **Carte vectorielle + points**. Les compteurs
   indiquent le nombre de primitives, de scans et de confirmations.
7. **Sauver JSON** conserve toute la carte, ses paramètres et son historique.
   **Ouvrir une carte** permet de la reprendre, puis d'ajouter de nouveaux scans.
   **Exporter CSV** écrit les extrémités ; le bouton général **Exporter PNG**
   enregistre la vue actuelle.

**Créer depuis l'atelier** remplace la carte par une copie des segments de
l'étape 4, interprétés comme une géométrie initiale dans le repère courant.
**Copier vers l'atelier** permet d'analyser ou de manipuler une copie de la carte
avec les fonctions de l'étape 4. Les modifications de cette copie n'affectent
pas automatiquement la carte vectorielle.

Les scans déjà intégrés avec la même pose sont ignorés. Si une pose ou les
paramètres de traitement changent, il faut reconstruire la carte pour appliquer
la correction à toutes les observations. Le déplacement des nuages à l'écran
ne déplace pas les primitives déjà enregistrées. Les poses divergentes sont signalées.

## Démarche suivant le document du cours

Référence : « Construction d'une carte vectorielle 2D à partir d'un scan lidar »,
Jonathan Quillès, 2026, fourni pour le TP.

### 1. Modèle de carte

L'environnement est représenté par des **segments**, adaptés aux parois et bords
de meubles observés dans une salle. La carte est initialement vide, ou initialisée
avec les segments de l'atelier. Aucune grille n'est utilisée pour stocker la
géométrie vectorielle.

Une primitive contient :

- un identifiant stable dans la carte ;
- deux extrémités `(x1,y1)` et `(x2,y2)` en mètres ;
- les indices des scans qui la confirment, sans doublon ;
- un compteur de contradictions depuis sa dernière confirmation ;
- l'indice du dernier scan qui l'a confirmée ou traversée.

Ces indices décrivent l'ordre d'intégration, **pas des horodatages physiques**.
Le nombre de confirmations n'est pas une probabilité d'occupation calibrée.
Deux acquisitions distinctes peuvent présenter des erreurs corrélées.

### 2. Acquisition, pose et prétraitement

Les scans sont les CSV réels déjà acquis. Les retours nuls sont exclus à la
lecture. La portée maximale, initialement 12 m, et le seuil d'intensité, initialement
0 (filtre désactivé), sont réglables. Pour un seuil positif, les retours sans
intensité connue sont exclus. Les points rejetés ne produisent pas de rayons
de nettoyage : une mesure invalide ne prouve pas que l'espace est libre.

La transformation rigide de l'étape 2 convertit les points locaux dans le repère
de carte. La construction utilise les poses fournies ; elle **ne réalise pas
une localisation ou une optimisation SLAM automatique**. L'exemple de données
réelles utilise une pose estimée séparément, documentée et non considérée comme
une mesure de référence.

### 3. Extraction des primitives

La fonction `LidarSegments.extract` de l'étape 4 est réutilisée. Elle sépare les
ruptures entre points successifs, ajuste les supports par PCA orthogonale, puis
scinde les groupes qui dépassent le résidu maximal.

Paramètres initiaux : écart de rupture **0,30 m**, résidu **0,05 m**, minimum
**5 points**, longueur minimale **0,15 m**. Les objets courbes sont approximés
par des segments ; les cercles et les arcs ne sont pas reconnus dans cette version.

### 4. Ajout et fusion

Pour chaque segment extrait, comparer les primitives existantes avec
`LidarSegments.proximity`. La proximité exige à la fois un angle de supports
≤ **8°** et une distance entre segments finis ≤ **0,12 m** par défaut.

Sans correspondance, le segment devient une nouvelle primitive. Sinon,
`LidarSegments.merge` ajuste un support aux quatre extrémités et conserve les
projections extrêmes. Le processus continue tant que d'autres primitives proches
peuvent être absorbées. Les fragments proches d'un même scan peuvent aussi fusionner.

Les confirmations sont stockées comme un ensemble d'indices de scans : plusieurs
fragments du même scan ne comptent donc pas comme plusieurs acquisitions. Une
confirmation remet le compteur de contradictions à zéro. Les extrémités sont
pondérées également ; ce n'est pas une régression de tous les points originaux.
La fusion est séquentielle et dépend de l'ordre des scans et des segments.

### 5. Gestion des absences et réduction des anciennes primitives

Le nettoyage, activé par défaut, peut être désactivé. Il concerne uniquement
les **anciennes primitives non soutenues par un segment du nouveau scan**.
Les primitives nouvelles ne sont pas nettoyées par leurs propres rayons.

Pour chaque point accepté, former le rayon entre la pose du lidar et son impact.
`LidarSegments.intersection` vérifie le croisement avec l'ancien segment :

1. Le point doit appartenir au rayon et être strictement intérieur à la primitive.
2. Il doit être au-delà de l'origine du rayon et à plus de **0,15 m avant l'impact**.
   Cette marge protège les surfaces proches de la mesure de retour.
3. Au moins **3 directions distinctes** doivent corroborer la traversée. Les
   directions sont regroupées en classes de 0,25° pour ne pas compter plusieurs
   copies d'un même rayon comme des observations différentes.

Une primitive satisfaisant ces critères reçoit **une contradiction par scan**,
pas une par point. La traversée médiane le long de la primitive est retenue,
puis `LidarSegments.cutLongest` réduit le segment une seule fois en conservant
le plus long côté. Les règles de l'étape 4 restent applicables : pas de découpage
des supports colinéaires ou aux extrémités ; à égalité à **1e-9 m** près, conserver
le côté du premier point. Le parallélisme utilise **1e-12** sur le sinus entre
directions normalisées.

Après **3 scans contradictoires depuis la dernière confirmation**, la primitive
est retirée. Un fragment devenu plus court que la longueur minimale est également
retiré. Un scan qui ne voit pas cette zone ne prouve rien : il ne crée ni
contradiction ni effacement. Ce mécanisme n'est pas un vieillissement temporel.

L'ordre interne est : extraire les nouveaux segments, repérer les confirmations,
nettoyer les anciens éléments non soutenus, puis ajouter/fusionner les observations.
Le calcul est préparé sur une copie ; une erreur ne laisse pas de carte à moitié
modifiée. L'intégration groupée de l'interface est également atomique.

### 6. Mise à jour continue et exports

La carte conserve son historique de scans et ses paramètres. Elle peut être
sauvegardée, rechargée et complétée dans le même repère. Les couleurs indiquent :

- **Vert** : primitive soutenue par au moins deux scans distincts ;
- **Violet** : une seule observation ou géométrie initiale ;
- **Orange** : contradictions enregistrées, en attente d'une confirmation ou d'un retrait.

Le **JSON** versionné `tp-lidar-vector-map-v1` conserve les primitives, leurs
identifiants, les confirmations, les contradictions, les poses et les paramètres.
Le **CSV** contient un commentaire `#`, puis quatre coordonnées métriques par
ligne : `x1,y1,x2,y2`, conformément à la représentation géométrique simple du cours.
Ce CSV n'est pas le format de reprise ; utiliser le JSON pour conserver l'historique.

## Exemple réel et résultat

L'[exemple reproductible](exemple_vectorielle/README.md) utilise deux scans réels
contrôlés, de **456 et 457 points**, dans un repère local. Il démontre la création,
la sauvegarde/relecture, l'ajout du scan suivant et la fusion des observations :

- après le premier scan : **23 primitives** issues de 27 segments extraits ;
- après le second scan : **30 primitives**, dont **17 confirmées par les deux scans** ;
- seconde intégration : **28 segments extraits** et **21 opérations de fusion**.

Le nombre d'opérations de fusion n'est pas le nombre de murs : une primitive
peut participer à plusieurs fusions. Les deux scans réels ne provoquent pas de
contradiction suffisamment soutenue pour déclencher le nettoyage. Celui-ci est
démontré séparément par un exemple synthétique, identifié comme tel.

Ce résultat est une **carte locale partielle**, pas une carte globale validée
des six captures de la salle. Les autres scans peuvent être intégrés dans l'outil
une fois leurs poses réglées correctement. Les anciennes estimations globales
présentaient des ambiguïtés ; elles ne sont pas appliquées comme vérité terrain.

## Hypothèses, difficultés et limites

- Les poses doivent être cohérentes et le lidar immobile pendant chaque balayage.
- Les seuils d'extraction et de fusion doivent être adaptés à la scène et au bruit.
- La proximité géométrique ne garantit pas que deux surfaces sont le même objet.
- Les erreurs de pose ou les réflexions peuvent créer de faux segments ou de
  fausses contradictions ; les garde-fous limitent ce risque sans le supprimer.
- Garder le plus long côté supprime volontairement l'autre : cette règle peut
  éliminer une portion réelle de mur et ne préserve pas toute la topologie.
- Les segments peuvent conserver des petits trous et chevauchements. Il n'y a
  ni fermeture automatique de polygones, ni reconnaissance de portes, ni garantie
  de continuité des murs.
- Pas de cercles, d'arcs, de vieillissement temporel ou de confiance probabiliste.
- La version pédagogique limite une carte à **3000 primitives** et une acquisition
  à **10000 points** ; elle privilégie la lisibilité du calcul aux très grandes cartes.

## Fonctions et validation

```javascript
const {VectorMap} = require('./visualisation/vector-map.js');
const carte = new VectorMap();
carte.integrate(scan1);       // réutilise extraction, proximité et fusion
const reprise = VectorMap.load(carte.save());
reprise.integrate(scan2);     // complète et nettoie la carte existante
```

```powershell
node visualisation/test_core.cjs
node visualisation/test_grid.cjs
node visualisation/test_segments.cjs
node visualisation/test_vector.cjs
```

**90 contrôles réussis** : 10 pour le lecteur/poses, 17 pour la grille, 38 pour
les segments et 25 pour la carte vectorielle. Les contrôles de carte couvrent
fusion, confirmations distinctes, doublons, changement de pose, rayons traversants,
marge d'impact, colinéarité, extrémités, réduction, retrait, rechargement et données réelles.

Les gestionnaires de l'interface sont aussi exercés dans un DOM minimal :
création, intégration, reprise, rejet de pose changée et copie vers l'atelier.
Ce contrôle ne remplace pas une vérification graphique complète du navigateur.
Les images fournies sont des rendus des primitives calculées, inspectés visuellement.
