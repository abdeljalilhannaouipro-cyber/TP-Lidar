# Mission Lidar — nouvelle interface locale

## Lancer avec un seul fichier

Exécuter Lancer_Mission_SLAM.py avec Python 3 (aucun paquet supplémentaire requis). Le programme ouvre http://127.0.0.1:8767/ et sert les fichiers depuis sa mémoire. Laisser le programme ouvert pendant le pilotage. Le fichier contient l'interface, le moteur SLAM, 300 captures réelles et la session de 70 scans acceptés. Il ne dépend pas du dossier du projet. Fermer avec Ctrl+C dans la fenêtre du serveur.

Si un double-clic ouvre l'éditeur, lancer depuis PowerShell :
python "C:/Users/User1/Documents/Codex/2026-11-03/co/outputs/Lancer_Mission_SLAM.py"

## Connexion et commandes

Le PC doit être connecté au Wi-Fi RobotESP32, mot de passe 12345678, en acceptant l'absence d'Internet. Le robot utilise le firmware Robot_Cockpit, version interface tp3-cockpit-v1. Ce firmware conserve les moteurs du dernier code fourni : A={5,19,2,16}, B={18,21,4,17}, AVANT={-1,+1,+1,-1}. Il doit déjà être téléversé ; les anciens firmwares qui n'ont pas /interface_version sont refusés pour éviter une confusion de protocoles. Le firmware compatible est inclus dans Mission_SLAM.zip, avec ses pilotes LD06.

Cliquer Connecter : le serveur PC lit la version et demande STOP, sans mouvement. Le scan Wi-Fi démarre automatiquement après cette connexion. Vérifier physiquement l'arrêt puis cocher Activer les déplacements. Les huit boutons et le clavier utilisent les routes du programme : ↑/↓ avancer/reculer, ←/→ pivoter, A/D pivoter, Q/E glisser, Espace/Échap STOP. Maintenir pour bouger, relâcher pour arrêter. Le premier essai se fait roues dégagées sur un support stable, coupure accessible.

La logique de déplacement reste celle du programme fourni, avec démarrage échelonné et arrêt automatique ; aucune vitesse métrique n'est inventée. Les commandes sont numérotées. Un départ attend la fin du STOP précédent. La perte de focus désactive les commandes et demande STOP.

## Ce qui change pour Failed to fetch

Le navigateur échange seulement avec le serveur localhost, qui relaie les requêtes vers 192.168.4.1. Il n'a plus à demander lui-même l'accès à une autre origine réseau. Le relais renvoie l'état HTTP du robot ou une erreur explicite avec l'adresse réseau du PC quand le robot ne répond pas. Une erreur du robot ne se confond pas avec une réponse du relais : l'en-tête X-Robot-Reachable les distingue. Ce mécanisme ne remplace pas une connexion réelle du PC au Wi-Fi du robot et ne répare pas une panne d'alimentation ou un redémarrage matériel.

Le relais est limité à l'interface locale, à l'adresse fixe du robot et à une liste de routes. Les commandes nécessitent une clé aléatoire générée au lancement ; aucune commande de mouvement n'est envoyée au chargement. L'accès à des hôtes/origines non locaux est refusé. Il n'y a pas de service cloud, d'envoi de scans à un tiers ni d'exploration automatique.

## Scan live, carte et position

La petite vue affiche le dernier scan reçu dans le repère du lidar. Elle indique EN ATTENTE si aucune donnée récente n'est disponible. Elle ne montre jamais de données simulées comme s'il s'agissait d'un flux réel. Le firmware actuel lit le lidar à l'arrêt : durant le mouvement la vue attend un nouveau scan, puis reprend après stabilisation.

La grande carte affiche seulement les scans et poses acceptés. La flèche représente la dernière pose validée, jamais une position calculée à partir du temps moteur. La carte initiale est une session historique, partielle : 70 scans intégrés et 230 autres captures sans pose globale validée. Choisir une capture brute l'affiche isolément avec la mention de position globale inconnue.

Pour une nouvelle acquisition : exporter la session actuelle, Nouvelle carte, puis cocher Localiser et intégrer les scans reçus. Déplacer de 10 à 20 cm, attendre quelques secondes et vérifier qu'une nouvelle pose est acceptée avant de poursuivre. Au premier refus, rester immobile. La carte passe en pause mais les captures brutes peuvent continuer. Les seuils du SLAM ne sont pas abaissés pour forcer une fusion.

Session JSON, captures brutes et image PNG sont exportables. Sauvegarder avant fermeture ou rechargement ; il n'y a pas de sauvegarde automatique du travail en cours. La limite est de 1000 captures dans cette interface. Le mode USB exige le firmware CSV et un port série libre ; le firmware Robot_Cockpit émet des diagnostics USB et fournit ses scans par Wi-Fi.

## Validation

Tests de l'interface : données réelles initiales, sélection des captures, huit commandes, activation explicite, STOP prioritaire, commandes anciennes, attente de STOP, erreurs réseau/HTTP et affichage du dernier scan. Tests du relais : actifs intégrés, absence de mouvement au chargement, clé locale, routes/paramètres limités, HTTP 409 préservé, échec réseau explicite et refus des hôtes/origines étrangers. Le faux robot de test ne commande aucun matériel.

La carte et le diagnostic réseau ont été inspectés dans le navigateur. Le scan live et le mouvement de cette nouvelle interface n'ont pas encore été validés physiquement avec le robot connecté. La localisation reste locale, sans odométrie et sans fermeture de boucle ; la couverture complète de la salle et la précision métrique ne sont pas certifiées.
