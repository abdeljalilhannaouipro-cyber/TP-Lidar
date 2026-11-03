# TP — Jour 1 : lidar LD06 et cartographie

Application pédagogique Python : affichage de plusieurs scans, poses indépendantes,
grille probabiliste, extraction et manipulation de segments et carte vectorielle.
Les scans réels fournis sont conservés dans le dépôt.

## Lancer

Python 3.10 ou plus récent avec Tkinter (inclus dans l'installation Python Windows).
Aucune dépendance `pip` pour l'application et les tests.

```powershell
python app.py
python -m unittest -v
```

Alternative sans fenêtre (exports CSV et aperçu SVG ouvrable dans un navigateur) :

```powershell
python export_maps.py --scan "scan_20261102_170547_135900.csv" --scan "scan_20261102_170743_662993 (1).csv" --output exports
```

Pour des poses connues, ajouter une option `--pose "x,y,theta_deg"` par scan,
dans le même ordre. Sans cette option, les origines sont toutes nulles ; l'aperçu
n'est donc pas une carte de salle recalée. Pour mettre à jour un export existant,
ajouter `--base-grid chemin/occupation.csv` et seulement des scans nouveaux ; la
résolution est alors celle de la grille chargée. Le SVG montre uniquement les
nouveaux scans et leurs segments à gauche, la grille mise à jour à droite.

L'import de Tkinter est disponible dans l'environnement de développement, mais
l'initialisation de Tcl/Tk y échoue (`init.tcl`). L'ouverture et le rendu de la
fenêtre ne sont donc pas validés ici. Si cette erreur apparaît aussi sur votre
poste, réparer l'installation Python avec le composant Tcl/Tk, ou utiliser
`export_maps.py`. Les calculs et exports ne dépendent pas de Tcl/Tk.

1. **Charger scans** : sélectionner les CSV bruts, par exemple le scan `170547`
   et le scan `170743 (1)`. Chaque scan possède une couleur et une origine fléchée.
2. Régler **x, y en mètres, θ en degrés**, puis **Appliquer**. L'angle positif de
   pose tourne dans le sens trigonométrique. Les poses initiales sont nulles :
   elles ne constituent pas un recalage automatique ni une mesure de la salle.
3. Choisir **Points**, **Occupation** ou **Segments**. Après un déplacement, les
   cartes sont reconstruites pour éviter d'accumuler des traces des anciennes poses.
4. **Sauver poses** / **Charger poses** : JSON associé aux empreintes des scans.
   Charger d'abord les scans avant leurs poses.
5. **Exporter cartes** : `points.csv` en mètres, `occupation.csv`, `segments.csv`.
6. Pour mettre à jour une carte existante : dans une nouvelle session, **Charger
   grille**, garder sa résolution, charger seulement les nouveaux scans, régler
   leurs poses puis exporter. Réintroduire des scans déjà intégrés compterait
   leurs observations une seconde fois.

Les deux fichiers `scan_20261102_170743_662993 (1).csv` et `(2).csv` sont identiques
(SHA-256 identique). L'interface refuse donc leur double chargement. Il s'agit de
**deux scans uniques**, pas de trois acquisitions indépendantes.
`scans_aligned_3_20261102.csv` est un ancien fichier fusionné : il reste archivé,
mais l'outil exige les bruts pour conserver une pose indépendante par scan.

## 1. Extraction des données réelles

Les CSV fournis contiennent `point_index,angle_deg,dist_mm,intensity` et deux
colonnes cartésiennes supplémentaires. L'analyse utilise les mesures polaires,
et non les positions déjà alignées. Aucun scan synthétique ne remplace les données
réelles de l'étudiant. Les tests utilisent également quelques géométries synthétiques
pour vérifier des propriétés connues.

Le dossier `acquisition` propose un sketch ESP32 et un enregistreur série :

```powershell
python -m pip install pyserial
python acquisition/capture.py COM5 --output scans --count 3
```

Installer séparément la bibliothèque Arduino **LD06 de Robot-Maker** utilisée
par le montage existant, ouvrir `acquisition/LD06_capture/LD06_capture.ino`,
compiler et téléverser sur l'ESP32. Le code reprend les broches du sketch local :
TX du lidar vers RX GPIO33, commande moteur GPIO32, UART lidar 230400 bauds,
USB 115200 bauds. Vérifier alimentation, masse commune et câblage à partir de la
documentation matérielle du cours avant de brancher. Fermer le moniteur série
avant l'enregistrement. `COM5` est un exemple à remplacer.

Le protocole est explicite : `BEGIN_SCAN`, en-tête CSV, mesures,
`END_SCAN`. L'enregistreur attend un scan complet, abandonne un scan corrompu et
enregistre un fichier horodaté. Il signale l'absence de scan valide après 30 s.
Une temporisation réduit le débit de sortie ; elle peut faire perdre des rotations
entre acquisitions. Ce dispositif vise des scans statiques, pas un flux SLAM continu.

**Validation à réaliser sur matériel** : compilation avec la version exacte de
la bibliothèque du cours, réception série, absence de pertes, orientation réelle
du capteur et comparaison de distances avec une mesure dans la salle. Le matériel
n'a pas été utilisé pour développer cette version : aucune nouvelle acquisition
ni validation physique n'est revendiquée.

## 2. Visualisation et changement de pose

Le repère de carte est direct : x vers la droite, y vers le haut. Les données
fournies utilisent des angles LD06 horaires : leurs colonnes `x_lib_mm,y_lib_mm`
confirment approximativement `x=r cos(α)`, `y=−r sin(α)` (arrondies au millimètre).
Les distances sont converties une seule fois de mm en m. Les distances nulles ou
négatives sont ignorées ; des valeurs non numériques/non finies déclenchent une erreur.

Une pose `(tx,ty,θ)` transforme un point local selon :

```text
X = tx + cos(θ) x − sin(θ) y
Y = ty + sin(θ) x + cos(θ) y
```

Le canevas inverse uniquement l'axe vertical pour l'affichage à l'écran.
Les seuils géométriques et les exports restent dans le repère métrique.
Le réglage est manuel : observer les murs et recouvrements, déplacer les scans,
puis sauvegarder les poses retenues. Sans poses mesurées ou recalage, la justesse
métrique globale de la salle ne peut pas être établie.

## 3. Carte d'occupation

`Grid(resolution)` crée une grille ; `grid.update(points, pose)` l'alimente.
`Grid.load(path)` recharge une grille exportée pour les mises à jour suivantes.

1. Transformer chaque impact avec la pose du capteur.
2. Indexer une cellule par `(floor(X/résolution), floor(Y/résolution))` : les
   coordonnées négatives sont donc traitées correctement.
3. Parcourir chaque rayon, de l'origine de pose à l'impact, par DDA.
   Toutes les cellules traversées sont libres, sauf la dernière, occupée.
   Aux coins exacts, le parcours avance diagonalement : les cellules seulement
   touchées en un point ne reçoivent pas de mise à jour.
4. Réunir les cellules du scan : au plus une contribution par cellule et par scan.
   Une cellule impactée est prioritaire sur une cellule traversée dans ce même scan.
5. Mettre à jour la log-vraisemblance : `L += −0.4` pour libre, `L += +0.85`
   pour occupé, puis borner `L` dans `[-4,+4]`. Le prior inconnu est `L=0`.
6. Calculer `p(occupé)=1/(1+exp(−L))`. Blanc : libre ; noir : occupé ; gris : inconnu.

Ces poids sont des choix pédagogiques, pas une calibration expérimentale du LD06.
La résolution initiale est 10 cm ; l'interface accepte de 2 cm à 1 m. La structure
est un dictionnaire de cellules observées : pas de limites fixes de carte et pas
d'allocation d'une vaste grille entièrement inconnue. Une cellule absente a p=0.5.
L'export indique indices entiers, résolution, log-odds et probabilité ; le centre
d'une cellule `(i,j)` est `((i+0.5)r,(j+0.5)r)` en mètres.

Hypothèses : scène statique, pose constante pendant un tour, distances positives
traitées comme de vrais impacts. Les retours de portée maximale ne sont pas
distingués des obstacles faute d'indicateur dédié dans les CSV. Pas de modèle
d'épaisseur du faisceau, de vieillissement, ni de correction de distorsion de mouvement.
Les très grands jeux de données demanderaient une limite de portée et une
optimisation du rendu. Les mesures d'intensité sont conservées dans les sources,
mais aucun seuil arbitraire n'est appliqué ici.

## 4. Segments et cas limites

Les fonctions publiques sont dans `lidar.py` ; elles s'utilisent indépendamment
de l'interface.

| Fonction | Rôle |
|---|---|
| `extract(points)` | Extraction de segments dans un scan ordonné |
| `angle(s,t)` | Angle non orienté des supports, entre 0 et π/2 |
| `close(s,t)` | Proximité angulaire ET spatiale |
| `merge(s,t)` | Fusion de deux segments proches par ajustement orthogonal |
| `intersection(s,t)` | Intersection ponctuelle appartenant aux deux segments |
| `cut_longest(s,cutter)` | Conserve le plus long côté du segment coupé |

Extraction : séparer les points consécutifs distants de plus de 30 cm ; ajuster
une droite par PCA 2D ; scinder au point d'erreur orthogonale maximale si elle
dépasse 4 cm ; recommencer. Conserver au moins 5 points et 15 cm par segment.
Ces seuils doivent être adaptés au bruit et à la densité des scans. La jonction
entre dernier et premier point du tour n'est pas fusionnée à cette étape.

Proximité : angle ≤ 8° et distance minimale entre segments finis ≤ 12 cm.
Le sens des extrémités n'influence pas l'angle. Fusion : ajuster une droite aux
quatre extrémités puis les projeter pour obtenir les nouvelles bornes.
L'approximation pondère les extrémités également ; ce n'est pas une fusion
statistique de tous les points d'origine.

Découpage : résoudre les paramètres d'intersection et exiger leur appartenance
aux deux segments. Un croisement des droites supports hors de l'un des segments
ne suffit pas. Une intersection à l'extrémité du segment coupé ne le modifie pas ;
l'extrémité du segment coupeur est autorisée si elle traverse l'intérieur du premier.
Les supports parallèles ou colinéaires ne provoquent pas de découpage.

Tolérances : **EPS=1e-9 m** sur les longueurs, **1e-12** sur le sinus de l'angle
entre directions unitaires pour reconnaître le parallélisme. Aucune tolérance
ne dépend implicitement de la longueur d'un segment. Si les deux côtés sont
égaux à EPS près, garder celui contenant **le premier point** du segment d'origine.
Un segment de longueur ≤ EPS ne se découpe pas ; son angle est indéfini et
`angle` lève une erreur. Les tests couvrent ces choix, y compris le sens inversé.

## 5. Carte vectorielle

Pour chaque scan dans l'ordre de chargement : transformer les points, extraire
les segments, puis appeler `update_vector(carte_existante, nouveaux_segments)`.
Fusionner itérativement les candidats proches jusqu'à stabilisation ; intégrer
les segments non fusionnés ; traiter ensuite les intersections entre paires en
appliquant le découpage au plus long côté à chaque segment, à partir de la paire
avant découpage. Les segments représentent des parois, pas des polygones fermés.

Cette construction simple dépend de l'ordre des scans et des segments. La règle
« garder le plus long côté » peut supprimer une branche réelle d'un mur : elle
répond à l'exercice mais ne constitue pas une reconstruction topologique complète.
La proximité à elle seule ne garantit pas que deux surfaces physiques sont identiques.
Les améliorations possibles sont un historique des observations, une pondération
par le nombre de points, une durée de vie et un recalage automatique ; elles ne
sont pas annoncées comme implémentées.

## Validation et travail restant avant rendu

`python -m unittest -v` vérifie géométrie, découpage, transformations, parcours
de rayons, occupation libre/occupée/inconnue, saturation, sauvegarde/rechargement
et traitement d'un véritable scan fourni. Les cas géométriques limites demandés
sont explicitement testés. Les tests ne prouvent pas l'exactitude d'une carte de salle.

Les deux documents « Construction d'une grid map 2D à partir d'un scan lidar »
et « Construction d'une carte vectorielle 2D à partir d'un scan lidar » du portail
EIGSI n'ont pas pu être consultés depuis cet environnement. La méthode ci-dessus
est donc documentée comme une implémentation autonome et **ne revendique pas
une conformité vérifiée à ces documents**. Avant rendu, joindre/lire ces documents,
comparer les étapes attendues, réaliser le réglage des poses et ajouter les captures
de la salle obtenues avec les données réelles et les observations personnelles.

Le rapport doit distinguer les mesures effectuées par l'étudiant, les algorithmes
proposés ici et leurs validations. Ne pas présenter des poses nulles comme un
recalage final ou les copies de fichier comme des acquisitions supplémentaires.
