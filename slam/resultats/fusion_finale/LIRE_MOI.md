# Nuage final fusionne

Les 507 captures de l export acquisitions_slam_cockpit.json ont ete analysees. Le resultat est un nuage cartesien unique en metres, constitue de 203 captures : les 70 poses de la session originale et 133 poses estimees par recalage global supplementaire. Les 304 captures restantes sont exclues de la fusion faute de correspondance assez sure ; elles restent presentes dans acquisitions_originales.json.

## Fichiers a ouvrir

- scan_final.png : image du resultat, axes a echelle identique en metres.
- scan_final.html : vue interactive autonome, sans installation ni serveur ; zoom, deplacement et filtrage par nombre de scans contribuant a chaque point.
- scan_final.csv : 7013 points du nuage fusionne, colonnes x_m,y_m,observations,distinct_scans.
- scan_final.ply : meme geometrie sous forme de nuage 3D plan (Z=0), unites en metres.
- nuage_fusionne.json : points et parametres de fusion.
- poses_retenues.json : poses et origine de chaque estimation.
- bilan.json : decisions et scores pour les 437 captures sans pose initiale.
- session_originale.json et acquisitions_originales.json : copies des donnees sources, non modifiees.

## Methode

Les poses originales sont conservees. Une reference fixe est construite avec les cellules de 10 cm observees dans au moins huit des 70 scans initiaux. Les autres captures sont recalees independamment sur cette reference : recherche de rotation sur 360 degres par pas de 3 degres et translation par correlation FFT, puis raffinement ICP rigide robuste. Les poses nouvelles ne sont pas enchainees pour eviter une accumulation de derive.

Seuils repris du traitement TP1 : recouvrement bidirectionnel >=45 %, score >=0,45, RMSE des correspondances retenues <=0,12 m, marge sur une autre solution suffisamment distincte >=0,035. Ces seuils ne prouvent ni une pose physique exacte ni l unicite globale de l alignement.

Pour former le nuage final : distances entre 0,20 et 12 m, intensite >=100 ; 72959 observations regroupees dans des voxels de 5 cm, avec la moyenne XY par voxel. Le resultat contient 7013 points ; le nombre de contributions et de scans distincts est conserve. Le nuage est une fusion de mesures effectuees a plusieurs endroits et moments, pas un nouveau tour lidar physique ni une grille d occupation.

## Limites

Les 133 nouvelles poses sont estimees hors ligne. Aucune position mesuree ni incertitude physique connue ne permet de certifier leur exactitude. La scene contient des personnes et des objets susceptibles de bouger. Des points parasites et des contours doubles peuvent subsister. La couverture complete de la salle n est pas demontree. Les captures refusees ne sont pas positionnees arbitrairement dans ce resultat.

## Verification

Reconstruction et validation de la session originale ; comptage des 507 captures, controle des seuils pour toutes les nouvelles poses retenues, comparaison des 7013 points CSV et PLY, controle du script de la vue HTML et de son export CSV. L image a ete inspectee visuellement.

## Reproduction depuis la racine du depot

Les entrees preparees et la reference fixe sont conservees avec les sources. Python necessite NumPy.

```powershell
python slam/fusion_finale.py
python slam/export_fusion_finale.py
powershell -ExecutionPolicy Bypass -File slam/tracer_fusion_finale.ps1
node slam/test_fusion_finale.cjs
```
