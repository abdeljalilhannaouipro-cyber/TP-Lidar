# Fusion SLAM avec les captures du 10 novembre 2026

Les exports contiennent **975 captures uniques** : 507 précédentes et 468 nouvelles. Les copies présentes dans plusieurs exports sont détectées par le SHA-256 du CSV. Le fichier `acquisitions_reunies.json` contient tous les scans bruts et peut être importé dans Mission Lidar. Les exports originaux du 10 novembre et leurs empreintes sont conservés dans `sources/` et `sources.json`.

La carte commune conserve les 203 poses précédentes et intègre 17 nouveaux scans : **220 captures, 7 804 points** après regroupement en voxels de 5 cm. Les 451 nouveaux scans qui échouent au contrôle et les 304 anciens refus restent dans les données brutes. Les deux sessions locales du 10 novembre sont conservées avec leurs origines propres.

- [Vue interactive autonome](scan_final.html) et [image de la carte](scan_final.png).
- [Points CSV en mètres](scan_final.csv) et [nuage PLY](scan_final.ply).
- [Bilan des nouveaux recalages](bilan.json) et [poses retenues](poses_retenues.json).

Le traitement réutilise la référence fixe de la fusion précédente : recherche sur 360° et translation par corrélation FFT, puis raffinement ICP. Une pose est retenue si le score et les deux recouvrements atteignent 0,45, le RMSE des correspondances retenues ne dépasse pas 0,12 m et l'écart à une solution concurrente atteint 0,035. Ces seuils ne certifient ni la pose physique exacte ni la couverture de toute la salle.

Depuis la racine du dépôt, avec Python, NumPy et Node.js :

```powershell
python slam/ajouter_captures_20261110.py
python slam/test_fusion_20261110.py
& ./slam/tracer_fusion_finale.ps1 -Folder ./slam/resultats/fusion_20261110
```
