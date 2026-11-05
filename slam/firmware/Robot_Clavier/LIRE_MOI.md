# Robot Lidar v3 — pilotage et scan live

Ce dossier contient le programme ESP32, son interface intégrée, le pilote Mecanum Car V2 et le pilote LD06 fournis avec les ressources du cours. Tous les fichiers doivent rester ensemble dans le dossier **Robot_Clavier**. Aucun téléchargement de bibliothèque Mecanum ou LD06 n'est nécessaire.

## Installer

1. Extraire **Robot_Lidar_Live.zip** dans un nouveau dossier. Ouvrir **Robot_Clavier/Robot_Clavier.ino** dans Arduino IDE. Ne pas copier uniquement le texte du sketch.
2. Choisir **ESP32 Dev Module** et le port USB, puis téléverser. Le paquet ESP32 pour Arduino doit être installé ; les vérifications utilisent le core 3.3.12.
3. Pour le premier essai, soulever les roues et garder la coupure d'alimentation accessible. Alimenter les moteurs et le lidar avec le câblage du kit.
4. Connecter le PC au Wi-Fi **RobotESP32**, mot de passe **12345678**. Accepter de rester connecté sans Internet. Le PC doit recevoir une adresse **192.168.4.x**. Une adresse 10.23.x.x correspond à l'autre réseau observé et ne donne pas accès au robot.
5. Ouvrir **http://192.168.4.1/** dans Edge ou Chrome. Le titre doit être **Robot · Lidar live**. Cliquer **Connecter le robot et afficher le scan**.

La page est stockée sur l'ESP32 : aucun serveur local sur le PC ni accès Internet ne sont nécessaires. Garder une seule interface de commande ouverte.

## Utilisation

- Maintenir les flèches pour avancer, reculer ou glisser latéralement.
- Maintenir **Q/E** pour tourner.
- Les boutons à l'écran fonctionnent par maintien du clic ou du doigt.
- Relâcher demande l'arrêt ; **Espace**, **Échap** et le bouton rouge demandent également STOP.
- La puissance commence à **80/255**, valeur par défaut du pilote du kit. L'augmenter progressivement, roues levées, si nécessaire (limite 160/255).
- Le scan s'actualise environ toutes les 300 ms, selon le débit Wi-Fi. Choisir un rayon de 3, 6 ou 12 mètres.

Les points sont exprimés en mètres dans le repère du lidar (X vers 0°, Y vers 90°). Un scan périmé est grisé et explicitement signalé. Aucune donnée simulée n'est affichée. Le scan live n'est pas une carte SLAM : aucune pose n'est inventée pendant les déplacements.

## Câblage attendu d'après les ressources du kit

| Fonction | ESP32 |
|---|---|
| Carte moteur SDA | GPIO19 |
| Carte moteur SCL | GPIO21 |
| Carte moteur I2C | adresse 0x30 |
| LD06 TX | GPIO33 (RX2) |
| LD06 entrée de commande | GPIO32 |
| Masse | commune aux éléments du kit |
| Liaison série LD06 | 230400 bauds |
| Moniteur série USB | 115200 bauds |

Ne pas modifier le câblage sous tension. Respecter les tensions d'alimentation du kit.

## Diagnostiquer les deux parties séparément

- **Site inaccessible** : vérifier le Wi-Fi RobotESP32, l'IP du PC 192.168.4.x, le téléversement et l'alimentation de l'ESP32. La perte d'Internet sur ce réseau local est normale.
- **Carte moteur absente** : le test I2C à l'adresse 0x30 n'a pas reçu d'acquittement. Vérifier alimentation, masse et SDA/SCL ; le scan live reste accessible.
- **Carte détectée et commande reçue mais roues immobiles** : la carte répond, mais cette réponse ne mesure pas le mouvement. Vérifier la batterie, l'interrupteur moteur, les connexions et la puissance PWM. Il faut un essai physique pour conclure.
- **Aucun scan récent** : vérifier alimentation et rotation du LD06, TX vers GPIO33 et masse commune. Les diagnostics indiquent le nombre de tours valides et les erreurs CRC.
- **Ancienne interface** : le programme actuellement téléversé n'est pas cette version ; vérifier le fichier ouvert, le port et le téléversement.

## Fonctionnement et validation

Le navigateur renouvelle une commande maintenue toutes les 120 ms. Un watchdog moteur indépendant demande l'arrêt après 400 ms sans renouvellement, même pendant une lecture lidar ou une requête HTTP. STOP et les commandes portent une séquence : une ancienne commande arrivée après STOP est refusée. Aucune commande de mouvement au démarrage ni lors de la connexion.

Le LD06 est lu dans une tâche séparée ; le dernier tour complet validé CRC est publié sous verrou. Le réseau transmet une copie du scan pour éviter de bloquer l'acquisition. Le format binaire /scan conserve l'en-tête du cours ; les six octets de pose valent zéro et ne représentent pas une odométrie.

Les tests hors matériel couvrent les commandes, le watchdog, les sessions, les acquittements, les scans périmés, le décodage et les paquets invalides. La syntaxe a été vérifiée avec le compilateur et les en-têtes ESP32 3.3.12. Cela ne remplace pas une compilation complète dans Arduino IDE, le téléversement et un essai sur ce robot. Cette nouvelle version n'a pas encore été vérifiée physiquement.

Sources des pilotes : ressources pédagogiques fournies par l'utilisateur ; mentions d'origine conservées dans les fichiers. La page embarquée interface.h est générée depuis slam/controle.html et slam/controle.js avec slam/package_controle.py. Les sources sont distribuées sans BOM pour éviter l'erreur U0000feff.
