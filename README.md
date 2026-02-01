# Démineur 3D Modernisé

Une version modernisée et optimisée du jeu de Démineur en 3D, utilisant les dernières technologies WebGL via Three.js r160.

## Fonctionnalités

### Gameplay
- **Grilles Configurables** : Dimensions de 10×10 à 200×150 (auto-adaptées à votre GPU).
- **Mode "Pas de Hasard" (No Guess)** : Garantit que la grille est 100% résolvable par la logique pure sans jamais devoir deviner.
- **Aide Intelligente (BESOIN D'AIDE)** : Un système expert qui analyse la grille en temps réel pour suggérer le meilleur coup stratégique suivant.
- **Premier Clic Optimisé** : En mode No Guess, le premier clic révèle automatiquement une zone de 3x3 pour un départ fluide.
- **Système de Score & Pénalités** : Le score est influencé par la difficulté, mais aussi par l'utilisation d'aides (pénalité par indice et réduction globale pour le mode No Guess).
- **Détection GPU** : Ajustement automatique des limites de la grille selon la puissance de votre matériel.

### Visuels
- **Moteur 3D Performant** : `InstancedMesh` pour rendre jusqu'à 30 000 cubes avec un seul draw call.
- **Dynamic Backgrounds** : Vidéo par défaut, upload local, webcam, ou **Streaming (YouTube, Dailymotion, Archive.org)** mappé via shader custom.
- **Aperçu Instantané** : Miniature vidéo dynamique dans le menu avec pré-chargement intelligent (UX Turbo).
- **Drapeaux Configurables** : Basculez entre particules scintillantes et drapeaux 2D stylisés.
- **Explosion Dynamique** : Cubes qui volent en éclats avec trajectoires aléatoires.

### Technique
- **Stack Moderne** : Three.js r160, Proxy Server Node/Express pour le streaming.
- **Architecture MVC** : Séparation logique (`Game.js`), rendu (`Renderer.js`) et streaming (`YouTubeManager.js`).
- **Détection Auto** : Le jeu détecte et se connecte automatiquement au meilleur serveur disponible (Local vs Cloud).

Le projet nécessite un serveur proxy pour le streaming vidéo extérieur :

### 1. Lancer le Serveur Proxy
```bash
cd server
npm install
npm start
```
*Le serveur tourne par défaut sur `http://localhost:3001`.*

### 2. Lancer le Jeu (Client)
Utilisez un serveur HTTP local (Python, Node serve, ou Live Server) pour ouvrir `index.html`.
*Le client se connectera automatiquement au proxy local.*

## Contrôles

- **Clic Gauche** : Révéler une case
- **Clic Droit** : Placer/Retirer un drapeau
- **Molette / Glisser** : Zoomer et orbiter autour de la grille
- **🧩 BESOIN D'AIDE** : Suggère le prochain meilleur coup (point vert = sûr, animation pulsée).
- **🚩✨ / 🚩🎯** : Bascule entre drapeaux particules (brillants) et drapeaux 2D (calmes pour les yeux).
- **Après Victoire/Défaite** : Caméra libre pendant 5s puis retour auto au menu.

## Configuration Menu

- **Grille & Bombes** : Ajustez la difficulté selon vos préférences.
- **Mode Pas de Hasard** : Activez pour garantir une résolution 100% logique.
- **Lien Direct / YouTube** : Collez une URL et cliquez sur ▶ pour voir l'aperçu instantané.
- **Statut Serveur** : Un indicateur visuel (vert/rouge) montre l'état de la connexion au proxy.
- **Hover Helper** : Activez l'animation de pulsation lors du survol.

## Architecture Fichiers

```
/
├── index.html              # Interface, menu et loop principal
├── server/                 # Serveur Proxy (Node.js/Express)
├── css/
│   └── style.css           # Design Glassmorphism
├── javascripts/
│   ├── Game.js             # Logique de jeu
│   ├── Renderer.js         # Moteur de rendu Three.js
│   ├── YouTubeManager.js   # Gestionnaire de streaming
│   ├── config.js           # Configuration et détection serveur
│   ├── MinesweeperSolver.js# IA de résolution
│   └── ScoreManager.js     # Profils, Scores et Analytics
└── images/                 # Assets (Textures, Vidéos)
```

## Améliorations Futures Possibles

- **Modes de Jeu** : Challenge chronométré, mode puzzle.
- **Accessibilité** : Thèmes daltoniens, contrôles clavier.
- **Optimisations** : LOD adaptatif pour grilles > 100k.
- **Social** : Seeds de grilles partageables pour défier des amis.

---

## Changelog Récent

### v1.1 – Style de Drapeaux Configurable
- Ajout d'un bouton en jeu pour basculer entre drapeaux particules et drapeaux 2D
- Les drapeaux 2D sont stylisés (fanion rouge avec bordure blanche) et moins agressifs visuellement
- Animation des drapeaux lors du survol de leur cube
- Correction : les drapeaux disparaissent correctement lors de la victoire/défaite
