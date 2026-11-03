# Étape 2 — Visualisation des nuages de points

## Ouvrir l'outil

Ouvrir **`index.html` dans Chrome ou Edge** par un double-clic. Aucun serveur,
compte, accès série, installation Python ou connexion Internet n'est nécessaire.
Conserver dans le même dossier `index.html`, `core.js`, `viewer.js` et `examples.js`.
Les données restent dans la mémoire du navigateur jusqu'à la fermeture de la page.
Sauvegarder les poses avant de quitter pour ne pas perdre les réglages.

## Utilisation

1. Cliquer sur **Charger mes 6 scans**, ou **Charger des CSV** pour choisir plusieurs
   fichiers réels. Chaque scan possède une couleur et une origine fléchée.
   Les doublons de données sont ignorés.
2. Modifier **X**, **Y** (mètres) et **Angle** (degrés) dans la fiche d'un scan.
   Le nuage est mis à jour immédiatement, indépendamment des autres scans.
   La réglette permet également de tourner le scan. Un angle positif tourne
   dans le sens trigonométrique, autour de l'origine locale du lidar.
3. Pour le déplacement à la souris, sélectionner une fiche puis choisir
   **Glisser pour → déplacer le scan sélectionné**. Glisser sur la carte.
   En mode « déplacer la vue », seule la caméra bouge ; les poses restent intactes.
4. Pour les raccourcis, cliquer sur la carte ou sur le titre d'une fiche : les
   flèches déplacent le scan sélectionné de 10 cm (Maj : 50 cm), Q/E le tournent
   de −1°/+1°. Les raccourcis ne remplacent pas la saisie dans les champs.
5. Cocher/décocher un scan pour l'afficher/masquer. Régler l'opacité pour mieux
   comparer les recouvrements. « Remettre à zéro » concerne uniquement sa pose.
6. **Cadrer les scans** adapte la vue aux scans visibles. La molette et les
   boutons +/− règlent le zoom. La grille indique les distances métriques.
7. **Sauver les poses** produit un JSON. Pour le restaurer, charger d'abord les
   mêmes scans, puis **Ouvrir des poses**. Le nom et une empreinte des points
   servent à vérifier la correspondance ; ce n'est pas une signature de sécurité.
8. **Exporter les points** produit un CSV contenant les coordonnées locales et
   transformées des scans visibles. **Exporter PNG** enregistre la vue actuelle,
   avec légende, origines et grille. Les CSV sources restent inchangés.

## Données et choix techniques

Les six jeux embarqués sont les captures réelles du 3 novembre. Les blocs longs
de 11:37 et 11:42 sont remplacés par les fichiers contrôlés `_tour2` de 456 et
457 points. Le bouton charge donc **2737 points valides** ; quatre retours de
distance nulle sont exclus. Les données originales restent archivées ailleurs
dans le dépôt. Aucun recalage automatique n'est exécuté par cet outil : toutes
les poses initiales valent `(0,0,0°)` et les ajustements sont manuels.

Le lecteur accepte les CSV LD06 `angle_deg,dist_mm`, les noms d'en-tête Arduino
`Angle(°),Distance(mm)` et les distances métriques `distance_m` / `r_m`.
Si `x_lib_mm,y_lib_mm` ou `x(mm),y(mm)` sont présents, leurs valeurs sont utilisées
et converties de mm en m. Les colonnes métriques `x_rel_m,y_rel_m` sont aussi
acceptées. La base utilisée est indiquée dans chaque fiche.

Pour un CSV uniquement polaire, l'outil calcule `x=r cos(α)` et, par défaut,
`y=−r sin(α)`, ce qui reproduit la convention des colonnes cartésiennes des fichiers
fournis. Le sélecteur permet d'utiliser `y=r sin(α)` pour un CSV antihoraire.
Ce réglage s'applique **aux prochains chargements polaires**, pas aux fichiers
déjà chargés ni à ceux disposant de leurs propres coordonnées cartésiennes.
Vérifier le sens avec un obstacle connu avant de mélanger des exports de sources
différentes. La bibliothèque du cours applique déjà ses propres conventions.

Une pose `(tx,ty,θ)` applique, sans modifier les points locaux :

```text
X = tx + cos(θ) x − sin(θ) y
Y = ty + sin(θ) x + cos(θ) y
```

L'angle est converti de degrés en radians pour le calcul. L'écran inverse ensuite
uniquement l'axe vertical ; le repère de carte garde X vers la droite et Y vers
le haut. Une même échelle est utilisée pour les deux axes.

Le rendu utilise Canvas 2D, adapté à quelques milliers de points sans dépendance
externe. Chaque scan possède son propre objet de pose. Les erreurs de lecture
sont signalées ; les valeurs non finies et les CSV fusionnés sont refusés.
Un passage angulaire interne par zéro déclenche un avertissement de contrôle,
sans prétendre prouver à lui seul qu'un scan est invalide.

## Vérification

Avec Node.js installé :

```powershell
node visualisation/test_core.cjs
```

Les contrôles couvrent les unités, la conversion polaire et ses deux sens,
la rotation/translation, l'indépendance des poses, les six vrais scans, les données
invalides, les exports et le rechargement des poses. Les tests ne valident pas
l'exactitude du recalage manuel d'une salle.

Résultat dans l'environnement de développement : **10 contrôles réussis** et
aperçu servi avec une réponse HTTP 200. La vérification graphique automatisée
n'a pas pu être menée à terme ici ; les interactions et le rendu restent à
confirmer dans le navigateur du poste utilisateur.

Cette étape ne construit ni grille d'occupation ni carte vectorielle.
