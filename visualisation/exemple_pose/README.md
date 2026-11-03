# Exemple : modifier la pose d'un seul scan

Cet exemple démontre le troisième critère de l'étape 2 : déplacer et tourner
un scan **indépendamment des autres**. Les valeurs sont choisies pour montrer
la manipulation ; elles ne constituent pas un recalage réel de la salle.

## Reproduire dans l'outil

1. Ouvrir `visualisation/index.html` et cliquer sur **Charger mes 6 scans**.
2. Cliquer sur **Ouvrir des poses**, puis choisir `poses_avant.json` dans ce dossier.
   Seuls S1 et S2 sont visibles pour faciliter la comparaison. Toutes les poses
   sont nulles.
3. Dans la fiche **S2** (`scan_20261103_112833_263525.csv`), saisir :

   | Champ | Avant | Après |
   |---|---:|---:|
   | X (m) | 0 | 1,50 |
   | Y (m) | 0 | −0,75 |
   | Angle (°) | 0 | +30 |

4. Le scan orange tourne autour de son origine locale puis est translaté. Son
   origine passe en `(1.50, -0.75)` ; la flèche d'orientation tourne de +30°.
   Le scan bleu S1 reste à `(0,0,0°)` et tous ses points restent inchangés.
5. On peut aussi charger `poses_apres.json` pour obtenir directement ce résultat.
   Les poses de S3 à S6 sont conservées à zéro ; ils restent simplement masqués.
6. Cliquer sur **Cadrer les scans**, **Sauver les poses** et **Exporter PNG** pour
   enregistrer sa propre vue et ses réglages. `points_apres.csv` fournit déjà les
   coordonnées locales et transformées des deux scans visibles de l'exemple.

## Preuve et vérification

`avant_apres.png` compare les points avant/après avec des échelles métriques
identiques. C'est un tracé calculé avec les fonctions du visualiseur, pas une
capture d'écran de son interface. Les deux sources sont des scans réels ; seule
la pose illustrative de S2 change. Les CSV sources restent intacts.

Vérifications effectuées :

- Tous les points locaux des six scans sont identiques avant et après.
- Les coordonnées transformées de S1 sont strictement identiques.
- Seule la pose de S2 devient `(1.5,-0.75,30°)` ; les cinq autres restent nulles.
- Le fichier de poses après modification se recharge avec les mêmes valeurs.

Pour un point de S2, la transformation démontrée est :

```text
X = 1.50 + cos(30°) x − sin(30°) y
Y = −0.75 + sin(30°) x + cos(30°) y
```
