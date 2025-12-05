# Démineur 3D Modernisé

Une version modernisée et optimisée du jeu de Démineur en 3D, utilisant les dernières technologies WebGL via Three.js r160.

## Fonctionnalités

### Gameplay
- **Grilles Configurables** : Dimensions de 10×10 à 200×150 (auto-adaptées à votre GPU)
- **Détection GPU** : Limite dynamique basée sur la carte graphique détectée (RTX/RX/M-series: 200×150, Medium: 140×100, Low: 100×80)
- **Placement Intelligent** : Les mines ne sont jamais sous le premier clic ni dans les cases adjacentes
- **Flood Fill Optimisé** : Algorithme itératif (non-récursif) pour éviter les stack overflows sur les grandes grilles
- **Fin de Partie Fluide** : 5 secondes de caméra libre après victoire/défaite avant retour au menu

### Visuels
- **Moteur 3D Performant** : `InstancedMesh` pour rendre jusqu'à 30 000 cubes avec un seul draw call
- **Texture Vidéo** : Vidéo par défaut, upload local, ou flux webcam mappé sur toute la grille via shader custom
- **Particules** : Drapeaux animés (émetteurs continus) et feux d'artifice sur victoire (bursts)
- **Texte 3D Billboard** : Messages "YOU WIN"/"YOU LOST" toujours face caméra
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
- **Après Victoire/Défaite** : Caméra libre pendant 5s puis retour auto au menu

## Configuration Menu

- **Largeur/Hauteur** : Dimensions de la grille (limitées selon GPU détecté)
- **Bombes** : Nombre de mines (min 1)
- **Vidéo de fond** :
  - Fichier local (MP4/WEBM/OGG) avec audio
  - Webcam en direct (vidéo + audio si autorisé)
  - Défaut: `storm_render.mp4`

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
│   ├── Renderer.js        # Moteur Three.js (instances, particules, texte)
│   └── [legacy files]     # Anciens fichiers conservés pour référence
└── images/
    ├── storm_render.mp4   # Vidéo par défaut
    ├── j1.png - j8.png    # Textures numéros
    ├── star.png           # Texture drapeau
    └── flare.png          # Texture particule
```

## Améliorations Futures Possibles

- **Audio** : Effets sonores (clic, explosion, victoire)
- **Modes de Jeu** : Challenge chronométré, mode puzzle, graines partageables
- **Accessibilité** : Thèmes daltoniens, contrôles clavier, police ajustable
- **Optimisations** : LOD adaptatif, mode light sans particules
- **Social** : Leaderboards, replays, achievements
- **VR/AR** : Support WebXR pour immersion totale
