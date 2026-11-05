# Atelier Lidar — cockpit du TP3

Interface locale regroupant carte d'occupation, scans, dernière pose estimée, journal SLAM et commandes clavier/boutons.

## Ouvrir

Le serveur du projet fonctionne sur le PC : http://127.0.0.1:8766/slam/cockpit/ . Pour utiliser le ZIP sur un autre emplacement, extraire Cockpit_TP3.zip, ouvrir un terminal dans le dossier Cockpit_TP3 et exécuter `python -m http.server 8770 --bind 127.0.0.1`, puis ouvrir http://127.0.0.1:8770/slam/cockpit/ dans Edge ou Chrome. Ne pas ouvrir index.html par double-clic : le worker et les données doivent être servis par HTTP.

## Données initiales et position

Les données intégrées sont les exports réels de l'utilisateur : 300 captures brutes et la session de 70 scans acceptés, avec un refus au scan 71. Aucun trajet fictif n'a été ajouté. La flèche verte indique la dernière pose validée dans le repère de cette session, pas la position actuelle garantie du robot. Les autres captures peuvent être sélectionnées dans la liste ; elles s'affichent dans leur repère propre, sans pose globale inventée. La couverture complète de la salle n'est pas démontrée.

La pose évolue seulement après localisation et acceptation d'un nouveau scan. Les commandes moteur ne fournissent aucune odométrie. Un calcul SLAM dans un Web Worker laisse le fil d'interface disponible pour les commandes et STOP.

## Piloter avec le code Arduino fourni

1. Exporter la session en cours de l'ancien outil avant tout changement ou fermeture. Les données chargées dans ce cockpit existent aussi dans ses fichiers data.
2. Extraire Robot_Cockpit.zip et ouvrir Robot_Cockpit/Robot_Cockpit.ino. Garder ld06.h, ld06.cpp et ld06crc.h dans le même dossier. ESP32 Dev Module, core ESP32 3.x, port du robot. Alimentation moteur coupée pendant le téléversement.
3. Brochage repris du dernier code fourni par l'utilisateur : A={5,19,2,16}, B={18,21,4,17}, AVANT={-1,+1,+1,-1}. Il remplace les hypothèses précédentes. La correspondance des positions physiques de M1 à M4 est toujours décrite comme provisoire dans la source ; vérifier chaque direction roues soulevées avant de poser le robot au sol.
4. LD06 : RX33, commande GPIO32, 230400 bauds. GPIO26 est affecté au TX inutilisé et doit rester non connecté, afin d'éviter le TX par défaut GPIO17 déjà utilisé par un moteur. Masses communes et alimentation du kit à vérifier hors tension.
5. Connecter le PC au Wi-Fi RobotESP32, mot de passe 12345678. Ce réseau n'a pas besoin d'Internet ; le serveur local reste accessible.
6. Dans le cockpit, cliquer Connecter. Il vérifie la version du programme et la réponse à STOP. Contrôler visuellement l'arrêt, puis cocher Activer les déplacements.
7. Maintenir une touche ou un bouton : ↑/↓ avancer/reculer, ←/→ tourner, A/D tourner, Q/E glisser latéralement. Relâcher, Espace ou Échap demande STOP. Quitter la fenêtre désactive les commandes et demande l'arrêt.

La logique validée fournie est conservée : pause 50 ms, démarrage échelonné des quatre moteurs à 75 ms, maintien final 375 ms, durée totale nominale 650 ms. Le navigateur répète une commande maintenue toutes les 750 ms. Aucun réglage de vitesse fictif n'est affiché : ce programme commande des niveaux HIGH/LOW.

Le firmware fourni corrige les guillemets du texte collé, autorise les lectures CORS depuis localhost, refuse les commandes réseau arrivées dans le désordre et traite l'arrêt temporisé dans une tâche séparée du serveur. L'ancienne page embarquée est remplacée par un lien vers le cockpit. Le cockpit refuse l'activation moteur avec une ancienne version, afin de ne pas mélanger les protocoles.

## Scans en direct et nouvelle carte

- Le mode USB lit le firmware CSV TP3_Lidar_USB à 115200 bauds : fermer le moniteur Arduino avant de choisir COM3. Le firmware Robot_Cockpit émet des messages de diagnostic sur USB, pas le CSV d'acquisition ; utiliser son Wi-Fi pour les scans.
- Le mode Wi-Fi lit /scan du firmware Robot_Cockpit. Il attend l'arrêt et une seconde de stabilité. Le firmware ignore les premiers tours après un mouvement et refuse les scans périmés.
- Pour cartographier depuis un nouvel emplacement, exporter la carte actuelle puis cliquer Nouvelle carte. Cocher Localiser et intégrer les scans après connexion du lidar. Le premier scan définit le repère ; ne pas présenter la pose de l'ancienne session comme un point de départ mesuré.
- Le lidar ne mesure pas pendant les impulsions moteur de cette version : déplacer, arrêter, attendre le scan et vérifier l'acceptation. Au premier refus la carte se met en pause ; les données brutes continuent d'être conservées.
- Limite de 1000 captures : exporter avant de l'atteindre. Exporter session et captures avant de fermer/recharger la page. Il n'y a pas de sauvegarde persistante automatique du travail en cours.

## Exports

Enregistrer : session SLAM vérifiable avec scans acceptés, poses, grille et historique. Exporter les captures : tous les scans bruts conservés, y compris sans pose. Exporter PNG : image de la vue choisie. Ouvrir une session : vérifie que la carte correspond aux scans et aux poses. Ajouter des scans : accepte l'export JSON brut ou des CSV.

## Validation et limites

Tests simulés du cockpit : 300 captures réelles chargées, 70 scans localisés, scans non localisés isolés, activation explicite des commandes, huit touches/boutons, STOP pendant une requête en attente, ordre croissant des requêtes, perte de focus et incompatibilité de firmware.
Tests du moteur repris : brochage, six motifs, démarrage échelonné des quatre moteurs, arrêt à 650 ms, arrêt pendant le démarrage et séquences anciennes refusées. Les sources Arduino et LD06 ont été compilées en objets avec le compilateur et les en-têtes ESP32 core 3.3.12. Ce n'est pas une édition de liens Arduino complète ni un téléversement ou une vérification physique de cette nouvelle version.

La carte initiale et la sélection d'une capture non localisée ont été vérifiées dans le navigateur. Aucune commande de mouvement n'a été envoyée au robot pendant le développement. Un acquittement logiciel ne prouve pas la rotation ou l'arrêt physique des roues. Il n'y a ni autonomie, ni odométrie, ni fermeture de boucle globale, ni garantie d'exactitude physique des poses.
