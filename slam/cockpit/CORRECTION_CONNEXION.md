# Correction du faux passage hors ligne

Le retour utilisateur indique que seul le cockpit passe hors ligne et que le Wi-Fi reste connecté. Le message HTTP original n'a pas été fourni : la cause de la première erreur réseau n'est pas confirmée.

Deux défauts constatés dans le code ont été corrigés : toute erreur de commande désactivait la connexion sans vérifier la réponse du robot ; un départ pouvait être tenté pendant un STOP en attente. Les commandes attendent maintenant la fin du STOP. Une erreur HTTP est distinguée d'une absence de réponse. La commande est désactivée après une erreur et son détail reste visible ; un ping en lecture seule est utilisé si STOP ne reçoit aucune réponse HTTP. Un clic bref relâché avant le démarrage des moteurs peut également interrompre le départ, puisque les boutons sont commandés par maintien.

Tests simulés ajoutés : blocage d'un nouveau départ pendant STOP, HTTP 409 sans fausse perte de connexion, STOP refusé explicitement signalé, vraie panne de transport avec échec du ping. Aucun mouvement physique testé. La page déjà ouverte n'a pas été rechargée pour préserver son travail en mémoire. Exporter avant Ctrl+F5.
