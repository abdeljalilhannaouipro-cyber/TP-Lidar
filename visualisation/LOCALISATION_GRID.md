# TP 2 - Localisation d'un scan sur une grille

Le panneau **TP 2 · Localisation sur grille** est intégré à `index.html`.
Il propose aussi **Descente de gradient**, **Multi-résolution (pyramide de grilles)**
et **Probabiliste : recuit simulé**. Leur [démarche et évaluation chiffrée](../localisation/grid/OPTIMISATIONS.md)
décrivent les paramètres, les convergences et les échecs. Le gradient possède un
budget d'itérations ; le recuit permet de régler chaînes, tentatives et graine.
Le sélecteur propose **Recherche exhaustive (brute force)** par défaut, ou
**Recherche à trois niveaux**. La [méthode exhaustive et son évaluation](../localisation/grid/BRUTE_FORCE.md)
suivent la section 8.1 du document de scan matching fourni pour le TP.
Le [compte rendu et les résultats chiffrés](../localisation/grid/README.md)
décrivent la méthode, les hypothèses, les tests et les limites.

1. Charger une grille construite sans le scan test, et un scan couvrant cette zone.
2. Sélectionner le scan ; saisir ou copier une pose initiale approximative.
3. Régler les fenêtres (par défaut ±1 m par axe et ±15°).
4. **Estimer la pose**, puis lire score, couverture et avertissements.
5. **Appliquer la pose proposée** pour voir le scan sur la grille ; exporter le JSON.

Le bouton **Exemple : carte de 4 scans + 1 test** prépare un cas réel indépendant
pour l'insertion des impacts : la grille exclut le scan test. Les poses utilisées
restent celles estimées au TP 1, sans vérité terrain physique. L'exemple remplace
la grille courante et masque les autres scans, qui restent disponibles.

Le score n'est pas une probabilité. La recherche exhaustive teste toutes les poses
du domaine discret, sans sous-échantillonner les points. Les pas XY et angulaire
sont réglables ; au-delà de 500 000 poses, la recherche est refusée sans simplification.
La recherche à trois niveaux utilise des pas et un lissage progressivement affinés.
Ces deux recherches restent bornées à la fenêtre initiale. L'estimation ne
modifie aucune carte. Après application, reconstruire les autres cartes si leurs
scans intégrés ont changé de pose. L'export du résultat ne remplace pas la
sauvegarde des poses ou de la grille.
