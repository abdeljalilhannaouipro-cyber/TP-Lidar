# Programme Arduino - ESP32, Mecanum Car V2 et LD06

## Fichier a ouvrir

Ouvrir `ESP32_SLAM_Control/ESP32_SLAM_Control.ino` dans Arduino IDE. Garder le
fichier dans son dossier du meme nom. Ce programme correspond au montage du
cours avec ESP32 classique et Mecanum Car V2, pas a un Arduino Uno ou a toute
carte ESP32 sans adaptation des broches.

Le code ne lance aucune sequence de deplacement au demarrage. Il envoie STOP,
cree le reseau Wi-Fi RobotESP32 et lit le lidar. Un appel /stop doit etre recu
avant les commandes de mouvement. Chaque mouvement est limite a 300 ms ; un
controle FreeRTOS verifie son expiration independamment du traitement HTTP.
Ce controle reste logiciel et ne remplace pas la coupure electrique.

## Installer et televerser

1. Garder les roues soulevees et l'alimentation des moteurs coupee. Brancher
   l'ESP32 au PC avec un cable USB de donnees.
2. Dans Arduino IDE, selectionner **ESP32 Dev Module** pour l'ESP32 classique
   du kit, puis le port COM de cette carte. Le coeur utilise pour la verification
   de syntaxe est **esp32 par Espressif Systems 3.3.12**.
3. Dans **Croquis > Inclure une bibliotheque > Ajouter la bibliotheque .ZIP**,
   ajouter `bibliotheques/LD06.zip` et `bibliotheques/MecanumCar_v2.zip`.
   WiFi et WebServer sont inclus dans le coeur ESP32 : AsyncTCP et
   ESPAsyncWebServer ne sont pas necessaires pour ce sketch.
4. Ouvrir le .ino, cliquer **Verifier**, puis **Televerser**. Le televersement
   remplacera le programme actuellement dans l'ESP32.
5. Ouvrir le moniteur serie a **115200 bauds**. Il doit annoncer l'arret, le
   reseau et l'adresse. Maintenir les roues soulevees pour le premier allumage
   avec les moteurs alimentes et constater qu'elles restent arretees.
6. Connecter le PC au Wi-Fi **RobotESP32**, mot de passe **12345678**. L'adresse
   prevue est **http://192.168.4.1** ; utiliser l'adresse annoncee si elle differe.
7. Ouvrir l'interface `http://127.0.0.1:8766/slam/controle.html`, tester STOP,
   constater l'arret reel puis cocher la case. Commencer par une impulsion de
   **100 ms**, roues soulevees, pour verifier le sens des roues. La duree n'est
   pas une distance ni une vitesse calibree. La rotation dure la moitie du
   temps demande, comme dans les ressources.

Si l'IDE reste sur la connexion au televersement, suivre l'indication BOOT/EN
propre a la carte. Ne pas rebrancher les moteurs au sol pour resoudre une erreur
logicielle. Ne pas utiliser l'ancien exemple ESP32MecanumCar avec sa sequence
automatique au demarrage.

## Broches du montage fourni - a verifier physiquement

| Connexion | ESP32 |
|---|---:|
| SDA du controleur Mecanum | GPIO19 |
| SCL du controleur Mecanum | GPIO21 |
| TX du LD06 vers RX de Serial2 | GPIO33 |
| Entree PWM du lidar | GPIO32 |

Masses communes. UART du lidar : 230400 bauds. Le TX de Serial2 n'est pas relie
au lidar. Le programme reprend l'initialisation HIGH de GPIO32 par la bibliotheque
LD06 ; il n'active pas de PWM periodique de vitesse du lidar.

La commande moteur PWM vaut 60/255 dans ce sketch. Ce n'est pas une vitesse
mesuree ; une valeur faible peut etre insuffisante pour deplacer le chassis.
Verifier le fonctionnement mecanique avant de modifier cette valeur.

## Routes compatibles avec l'interface locale

- `/ping` : repond OK, sans mouvement.
- `/stop` : arrete et repond STOPPED ; autorise les commandes pendant 30 s.
- `/forward`, `/backward`, `/left`, `/right`, `/rotateleft`, `/rotateright` :
  parametre `time` entier de 50 a 300 ms. Pas de cumul de mouvements.
- `/scan` : paquet binaire du cours, 8 + 5N octets, maximum 460 points.
  Un tour trop long ou une capture de plus d'une seconde n'est pas servi.
- `/status` : identite du firmware, etat moteur commande, nombre de points.
- `/pose` : metadonnees d'affichage seulement, pas une odometrie mesuree.

La perte du dernier client Wi-Fi annule l'autorisation et demande l'arret.
Les requetes HTTP et le bouton STOP ne garantissent pas une coupure materielle.
Aucun mode de circulation autonome n'est active par ce programme.

## Validation effectuee

Le sketch, `ld06.cpp` et `MecanumCar_v2.cpp` passent `-fsyntax-only` avec le
compilateur Xtensa ESP32 et les en-tetes du coeur ESP32 3.3.12. Ce controle
valide la syntaxe et les API utilisees, pas l'edition de liens, la memoire finale,
les communications ou le comportement physique du robot.

La construction complete Arduino CLI a ete bloquee par l'acces aux dossiers
package/inventaire dans l'environnement d'execution. Elle reste a effectuer
avec **Verifier** dans l'IDE. Aucun programme n'a ete televerse sur la carte et
aucune commande moteur n'a ete envoyee pendant la preparation.

L'empreinte du sketch et les resultats du controle figurent dans
`ESP32_SLAM_Control/validation.json`.

## Sources

Adaptation des ressources de Jonathan Quilles (2026), archive utilisateur
Ressources-20261104.zip, exemples RobotControl et Mecanum Car V2. Les deux ZIP
de bibliotheques sont copies de cette archive et gardent leurs auteurs.
Documentation du serveur fourni dans le coeur ESP32 :
https://github.com/espressif/arduino-esp32/tree/master/libraries/WebServer
