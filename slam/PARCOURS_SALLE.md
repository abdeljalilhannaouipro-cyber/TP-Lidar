# TP3 — finir la localisation et la cartographie de la salle

## État vérifié

La boucle TP1 + TP2 existe : valider le scan, estimer sa pose sur la carte précédente, contrôler le résultat, puis mettre à jour la grille seulement si la pose est acceptée. Les tests moteur SLAM et acquisition passent. Aucun mouvement autonome n'est nécessaire pour le minimum du TP3.

Les résultats déjà enregistrés montrent 33/33 scans acceptés en simulation (erreurs moyennes 0,0672 m et 0,0724° sur cette scène) et 2/2 pour la paire réelle A/B. La suite historique des 19 scans accepte seulement le premier sans aide : elle n'est pas un parcours continu exploitable en l'état. La couverture complète de la salle n'est pas établie. Ne pas annoncer une carte complète à partir de ces résultats.

## Acquisition guidée avec le câblage réel

Le montage photographié utilise huit GPIO moteur directs, et non le contrôleur I2C présumé initialement. Le programme TP3_Lidar_USB maintient ces huit sorties à zéro et fournit des scans CSV sur USB. Il ne remplace pas la calibration des roues pour le bonus de pilotage.

1. Extraire TP3_Lidar_USB.zip et ouvrir TP3_Lidar_USB/TP3_Lidar_USB.ino. Garder tous les fichiers ensemble. Alimentation moteur coupée pendant le téléversement ; ESP32 Dev Module et port USB du robot.
2. Le câblage lidar attendu est TX vers GPIO33, commande de rotation vers GPIO32, alimentation adaptée et masse commune. GPIO26 doit rester non connecté : c'est le TX UART inutilisé, explicitement choisi pour ne pas réutiliser GPIO17, câblé à un moteur. Vérifier hors tension que GPIO26 est libre avant ce programme.
3. Vérifier d'abord roues soulevées que les roues restent arrêtées. Alimenter le lidar suivant le montage du kit ; si l'alimentation des moteurs est séparable, la laisser coupée. Ne pas poursuivre si une roue démarre seule.
4. Fermer le moniteur série Arduino et tout autre outil utilisant COM3.
5. Dans Edge ou Chrome, ouvrir http://127.0.0.1:8766/slam/ . Si le serveur est arrêté, ouvrir un terminal dans le dossier TP3-SLAM et exécuter : python -m http.server 8766 --bind 127.0.0.1
6. Créer une carte vide. Dans Acquisition en direct, cliquer Connecter le lidar USB et choisir le port du robot (COM3 était le port détecté). Cocher Localiser et intégrer les scans reçus une fois le premier tour valide reçu.
7. Garder le lidar à hauteur et orientation de montage constantes. Déplacer manuellement le châssis par petites étapes, environ 20 cm ou quelques degrés, puis rester immobile quelques secondes pour chaque observation. L'USB impose de rester à portée du câble : ne pas tirer sur le câble. Pour un parcours plus long, utiliser une rallonge adaptée ou une acquisition Wi-Fi à préparer après validation de ce mode.
8. Observer les murs et les zones derrière les obstacles depuis plusieurs points. Faire le tour accessible de l'îlot central et revenir près du départ. Un retour visuel ne constitue pas une fermeture de boucle optimisée.
9. Si un scan est refusé, arrêter le déplacement et contrôler la dernière position acceptée. Ne pas abaisser les seuils pour forcer la fusion. Exporter avant de fermer la page et avant 300 captures distinctes.

## Fichiers à conserver

- Session JSON : scans acceptés, poses estimées et décisions.
- Acquisitions brutes JSON : inclut les scans reçus mais non intégrés.
- Grille JSON : cellules inconnues, libres et occupées.
- Carte PNG : figure du résultat.
- Notes de parcours : zones visitées, hauteur du lidar, objets mobiles et angles morts.

## Quand déclarer la carte complète ?

Après contrôle des murs périphériques observés, des zones accessibles, des angles morts, des doubles contours et des refus de localisation. Les zones non vues restent inconnues. La taille de stockage 40 × 40 m et le pourcentage global de cellules connues ne mesurent pas la couverture de la classe. En l'absence de mesures indépendantes, on peut évaluer une cohérence visuelle et documenter les limites, sans prétendre à une exactitude métrique garantie.

Le relevé réel, les exports finaux et leur inspection restent à effectuer avec l'utilisateur. La compilation des sources ESP32 et les tests simulés ne valident ni le câblage électrique ni une acquisition physique de ce nouveau programme.
