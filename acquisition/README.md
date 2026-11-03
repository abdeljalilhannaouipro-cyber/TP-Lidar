# Acquisition et contrôle des scans LD06

Ce dossier conserve les outils utilisés pour la nouvelle série. Il ne lance
aucune acquisition automatiquement à l'ouverture du visualiseur.

- `ESP32_LD06_Test/ESP32_LD06_Test.ino` : programme fourni par l'étudiant depuis
  les ressources du cours. Son en-tête et son attribution sont conservés.
- `capture_scan.ps1` : lecture d'un bloc CSV depuis le port USB et sauvegarde
  horodatée. La sortie principale donne le chemin du fichier brut.
- `valider_scan.py` : contrôle des indices et de la progression des angles ;
  extraction séparée d'une séquence quasi complète si le bloc contient plusieurs
  passages. Les bruts ne sont pas écrasés.

Le sketch utilise la bibliothèque LD06 du cours, fournie séparément dans les
ressources (archive consultée : version 1.0.0). La compilation et le téléversement
se font avec Arduino IDE ; la version exacte installée sur la carte n'a pas été
relevée. La liaison lidar/ESP32 est configurée à 230400 bauds ; la liaison USB
ESP32/PC l'est à 115200 bauds. Les broches prévues sont GPIO33 pour RX lidar et
GPIO32 pour la commande moteur, avec masse commune.

## Déclencher une acquisition

Placer le lidar, le maintenir immobile et fermer le moniteur série ou tout autre
outil qui utilise le même port. Dans PowerShell, depuis la racine du dépôt :

```powershell
$fichier = & .\acquisition\capture_scan.ps1 -PortName COM3 -OutputDirectory scans_a_traiter
python acquisition/valider_scan.py $fichier
```

Remplacer COM3 si le port du poste est différent. Le script de capture utilise
les classes série de .NET, sans `pyserial`. Le contrôle Python utilise seulement
la bibliothèque standard. Les horaires de fichier sont en heure de Paris ; ils
correspondent à la sauvegarde, pas à une datation matérielle de chaque point.

La capture attend le début d'un bloc d'indice zéro et une fin de bloc, puis
vérifie les indices et colonnes. Elle échoue au bout de 20 secondes sans bloc
complet. **La continuité des indices seule ne valide pas un tour physique** :
exécuter le contrôle angulaire avant de retenir le fichier pour la cartographie.

Le contrôle retient une séquence de plus de 100 points, débutant au-delà de 357°,
finissant en dessous de 3°, couvrant au moins 357° et progressant de façon monotone
avec des pas ≤3°. Ces seuils correspondent au programme et aux acquisitions
utilisés ; ils ne remplacent pas le protocole matériel ou une mesure d'immobilité.
Une copie extraite porte `source_point_index` pour conserver sa provenance.

Le manifeste créé dans le dossier de capture indique les fichiers à utiliser.
Ne pas charger ensemble un brut long et sa copie contrôlée. Les notes de pose
du manifeste sont des rappels à compléter par l'opérateur, pas des mesures.
