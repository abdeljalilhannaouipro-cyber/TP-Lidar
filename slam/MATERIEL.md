> **Mise à jour après identification du câblage réel :** le robot photographié utilise huit commandes moteur directes. Les anciens programmes moteur I²C cités plus bas sont des versions historiques incompatibles avec ce montage et ne doivent pas être utilisés dessus. Pour poursuivre le TP3, utiliser **TP3_Lidar_USB** et le [parcours guidé](PARCOURS_SALLE.md), sans commande de mouvement. La calibration des quatre roues reste distincte du SLAM.

# ESP32 et Mecanum Car V2 - préparer l'acquisition réelle

**Programme adapté :** `firmware/ESP32_SLAM_Control/ESP32_SLAM_Control.ino` reprend les routes du cours avec WebServer, STOP au démarrage et impulsions limitées à 300 ms. Voir son README et sa validation : contrôle de syntaxe ESP32 réussi, construction complète et essai matériel encore à effectuer. La copie du programme original ci-dessous reste intacte.

## Le code du véhicule est fourni

L'archive `Ressources-20261104.zip` contient :

```text
RESSOURCES/Tools/RobotControl/ESP32RobotControl/ESP32RobotControl.ino
RESSOURCES/Tools/RobotControl/RobotControl.html
RESSOURCES/MecanumCarV2/Libraries/MecanumCar_v2.zip
RESSOURCES/LD06/Librairie/LD06.zip
```

Une copie intacte du programme ESP32 est dans
`firmware/ESP32RobotControl/ESP32RobotControl.ino`. La provenance et l'empreinte
SHA-256 sont dans `firmware/provenance.json`. Ce programme n'a pas été compilé
ou téléversé pendant cette étape et ne doit pas être présenté comme validé sur
le véhicule. Si le firmware présent fonctionne déjà, ne pas le remplacer sans
besoin. Le réseau `RobotESP32` a été signalé visible par l'utilisateur.

## Connexion Wi-Fi avant tout téléversement

1. Immobiliser le robot. Connecter le PC au réseau **RobotESP32**.
2. Le mot de passe dans le programme fourni est **12345678**. Choisir de rester
   connecté si le PC indique que ce réseau n'a pas Internet.
3. L'adresse prévue est **http://192.168.4.1**. Une requête `/ping` ne déplace
   pas le robot ; `/scan` ne fait que lire une capture. Le firmware réellement
   installé peut différer du programme fourni.
4. Ouvrir l'outil SLAM sur localhost, panneau acquisition, puis lire les scans
   Wi-Fi à cette adresse. Autoriser l'accès local si le navigateur le demande.
5. Vérifier d'abord le nombre de points, le tour complet et l'orientation, sans
   mouvement. Exporter la première capture pour audit.

Les appels `/ping` et `/scan` essayés depuis la session n'ont pas répondu avant
connexion du PC au réseau robot. Aucun appel moteur n'a été envoyé.

## Si le programme doit être installé

Ouvrir le `.ino` dans Arduino IDE. Le dossier et le fichier portent le même
nom `ESP32RobotControl`. Les inclusions attendues sont `WiFi`, `AsyncTCP`,
`ESPAsyncWebServer`, `ld06` et `MecanumCar_v2`. Les deux bibliothèques du matériel
sont dans l'archive du cours ; suivre son document « Programmer un ESP32 avec
l'IDE Arduino.md » pour sélectionner la carte et le port réellement raccordés.

Les ressources indiquent les connexions suivantes, à vérifier sur le montage :

| Signal | ESP32 |
|---|---:|
| SDA du contrôleur Mecanum | GPIO19 |
| SCL du contrôleur Mecanum | GPIO21 |
| TX du LD06 vers RX de Serial2 | GPIO33 |
| Entrée de commande PWM du LD06 | GPIO32 |

Masses communes. L'UART lidar est à 230400 bauds, le port USB de diagnostic à
115200. Ne pas confondre l'exemple moteur `ESP32MecanumCar.ino`, qui lance une
séquence de mouvements au démarrage, avec `ESP32RobotControl.ino`, qui appelle
`stopRobot()` à l'initialisation et attend des requêtes.

Le téléchargement remplace le programme en mémoire. La préparation de fichiers
n'a pas modifié le firmware installé, la configuration Wi-Fi du PC ou les moteurs.

## Première validation motrice, ensuite seulement

L'outil RobotControl du cours permet des commandes courtes et `/stop`.
Avant le premier essai, vérifier le câblage et placer les roues sans contact
avec le sol. Vérifier l'arrêt puis le sens des roues. Les commandes avant,
arrière et rotations doivent être associées au repère du lidar sur le montage.
La durée d'une commande n'est pas une distance parcourue.

L'arrêt logiciel dépend de la liaison et du programme ; garder accessible la
coupure d'alimentation. Une validation au sol, à faible vitesse dans une zone
dégagée, précède toute exploration automatique. Le code SLAM livré ici ne lance
aucune commande motrice et ne contient pas de pilote autonome activable.
