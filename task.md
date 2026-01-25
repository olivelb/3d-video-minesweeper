# Task: Persistance Média, Profils Anonymes et Analytics de Performance

## Objectif
- Résoudre les bugs de persistance des images/vidéos de fond.
- Implémenter un système de suivi des joueurs respectueux de la vie privée (anonymisation).
- Analyser l'impact de l'environnement visuel (webcam, vidéos dynamiques) sur les performances de jeu (HCI/Psychologie cognitive).

## État d'Avancement : ✅ TERMINÉ

### 1. Correction du Système Média (UIManager.js)
- [x] **Reset Forcé** : Correction du bug où l'image uploadée restait affichée après avoir changé pour un préréglage.
- [x] **Gestion des États** : Nettoyage automatique des inputs fichiers et des URLs d'objets lors du retour au menu.
- [x] **Feedback Visuel** : Nettoyage automatique des surbrillances des préréglages lors de l'utilisation de la webcam ou d'un upload personnalisé.

### 2. Profils Joueurs Anonymes (ScoreManager.js)
- [x] **ID Persistant** : Génération d'un `playerId` unique stocké localement dans le navigateur.
- [x] **Noms de Code** : Système de génération de noms de code (ex: `Neon Tiger #123`) basé sur un hash de l'ID pour l'anonymat.
- [x] **Affichage UI** : Ajout d'un badge "Joueur" dans le menu principal pour l'identité de session.

### 3. Analytics de Performance (ScoreManager.js & Renderer.js)
- [x] **Suivi d'Événements** : Enregistrement automatique des débuts de partie, victoires et défaites.
- [x] **Corrélation Média** : Capture systématique du nom du fond d'écran utilisé pour chaque événement.
- [x] **Données de Jeu** : Stockage du temps, de la difficulté et du nombre de bombes pour analyse statistique ultérieure.

### 4. Interface Leaderboard (UIManager.js & style.css)
- [x] **Détails Étendus** : Affichage du nom de code du joueur et du fond d'écran utilisé sur chaque entrée du leaderboard.
- [x] **Nouveaux Styles** : Ajout de styles CSS pour les informations de fond et de joueur dans la liste des scores.
- [x] **Synchronisation** : Passage du `bgName` entre le `UIManager` et le `Renderer` à chaque lancement de partie.

## Conclusion
Le projet dispose désormais d'une infrastructure solide pour tester l'impact psychologique des médias numériques sur la concentration des joueurs. Le système est 100% local, anonyme et garantit une expérience utilisateur fluide sans bugs visuels de persistance.
