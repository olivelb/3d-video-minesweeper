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
- **Moteur 3D Performant** : `InstancedMesh` pour rendre jusqu'à 30 000 cubes avec un seul draw call
- **Texture Vidéo** : Vidéo par défaut, upload local, ou flux webcam mappé sur toute la grille via shader custom
- **Drapeaux Configurables** : Basculez en jeu entre particules scintillantes (par défaut) et drapeaux 2D stylisés plus reposants pour les yeux
- **Particules** : Drapeaux animés (émetteurs continus) et feux d'artifice sur victoire (bursts)
- **Texte 3D Billboard** : Messages "BRAVO !"/"PERDU !" toujours face caméra
- **Explosion Dynamique** : Cubes qui volent en éclats avec rotation et trajectoires aléatoires

### Technique
- **Code Moderne** : ES6+ Modules, Classes, Async/Await
- **Architecture MVC** : Séparation stricte entre logique (`Game.js`) et rendu (`Renderer.js`)
- **Zero Build** : Pas de bundler, modules ES natifs chargés depuis CDN
- **Gestion Mémoire** : Disposal propre des géométries/matériaux et révocation des blob URLs

## Installation & Lancement

1. Ce projet ne nécessite pas de compilation.
2. Il utilise des **ES Modules** → nécessite un serveur HTTP local (CORS):
   - Python: `python -m http.server`
   - Node: `npx serve`
   - VS Code: Extension "Live Server"
3. Ouvrez `index.html` dans votre navigateur.

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
- **Hover Helper** : Activez l'animation de pulsation lors du survol.
- **Vidéo de fond** :
  - Fichier local (MP4/WEBM/OGG) avec audio.
  - Webcam en direct (vidéo + audio si autorisé).
  - Défaut: `storm_render.mp4`.

## Architecture Fichiers

```
/
├── index.html              # Point d'entrée + logique menu
├── README.md               # Ce fichier
├── TECHNICAL_DOCS.md       # Documentation technique approfondie
├── implementation_plan.md  # Plan de refactoring (historique)
├── css/
│   └── style.css          # Styles glassmorphism modernes
├── javascripts/
│   ├── Game.js            # Logique de jeu (mines, flood fill, flags)
│   ├── MinesweeperSolver.js # IA de résolution & validation No Guess
│   ├── Renderer.js        # Moteur Three.js (instances, particules, texte)
│   ├── ScoreManager.js    # Calcul des scores et LEADERBOARD
│   └── SoundManager.js    # Gestion des ressources audio
└── images/
    ├── storm_render.mp4   # Vidéo par défaut
    ├── j1.png - j8.png    # Textures numéros
    ├── star.png           # Texture drapeau
    └── flare.png          # Texture particule
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
