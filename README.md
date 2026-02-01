# Démineur 3D Modernisé

Une version modernisée et optimisée du jeu de Démineur en 3D, utilisant les dernières technologies WebGL via Three.js r160.

## 🎮 Play Now

- **GitHub Pages**: [https://yourusername.github.io/3d-video-minesweeper](https://yourusername.github.io/3d-video-minesweeper)
- **Local**: Clone and serve with any HTTP server

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
- **Architecture Modulaire** : Séparation logique (`Game.js`), rendu (`Renderer.js` + modules), streaming (`YouTubeManager.js`).
- **Détection Auto** : Le jeu détecte automatiquement l'environnement (local vs GitHub Pages) et se connecte au bon serveur.

---

## Quick Start

### Option 1: Play Online (GitHub Pages)
Just visit the GitHub Pages URL. Video streaming requires a running proxy server.

### Option 2: Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/3d-video-minesweeper.git
cd 3d-video-minesweeper

# Setup local config (optional, for custom server URLs)
cp servers-local.json.example servers-local.json

# Start the proxy server
cd server
npm install
npm start

# Serve the frontend (in another terminal)
cd ..
npx serve .
```

Open `http://localhost:3000` in your browser.

---

## Documentation

| Document | Description |
|----------|-------------|
| [TECHNICAL_DOCS.md](TECHNICAL_DOCS.md) | Deep dive into the architecture, algorithms, and rendering pipeline |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Complete deployment guide for local, Raspberry Pi, and GitHub Pages |
| [CHANGELOG.md](CHANGELOG.md) | Version history and changes |
| [SENSITIVITY_ANALYSIS.md](SENSITIVITY_ANALYSIS.md) | Analysis of gameplay parameters |
| [server/README.md](server/README.md) | Proxy server setup and API documentation |

---

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

---

## Architecture

```
/
├── index.html              # Main interface and game loop
├── server/                 # Proxy Server (Node.js/Express on Raspberry Pi)
├── css/
│   └── style.css           # Glassmorphism design
├── javascripts/
│   ├── config.js           # 🆕 Environment detection & server config
│   ├── Game.js             # Pure game logic (no DOM/Three.js)
│   ├── Renderer.js         # Three.js orchestration
│   ├── GridRenderer.js     # 🆕 Instanced mesh grid cells
│   ├── FlagRenderer.js     # 🆕 Flag visuals (particle/3D)
│   ├── VideoTextureManager.js # 🆕 Video/image texture loading
│   ├── YouTubeManager.js   # Video streaming coordination
│   ├── MinesweeperSolver.js# AI solver (cleaned & optimized)
│   ├── ScoreManager.js     # Profiles, scores, analytics
│   └── UIManager.js        # DOM interactions
├── servers-local.json.example # Template for local config
└── images/                 # Assets (textures, default video)
```

🆕 = New or significantly modified in v2.0

---

## Configuration

The game auto-detects its environment:

| Environment | Detection | Server Priority |
|-------------|-----------|-----------------|
| **Local** | localhost, 127.0.0.1, file:// | localhost → LAN → Cloud |
| **GitHub Pages** | *.github.io | Cloud only |
| **Other hosted** | Other domains | All servers |

### Custom Server Configuration

For local development, create `servers-local.json`:
```json
{
    "local": "http://localhost:3001",
    "raspberryLocal": "http://raspberrol:3001",
    "raspberryLAN": "http://192.168.1.232:3001",
    "raspberryCloud": "https://your-tunnel.trycloudflare.com"
}
```

For GitHub Pages, set in `index.html` before other scripts:
```html
<script>
  window.MINESWEEPER_SERVERS = {
    raspberryCloud: 'https://your-tunnel.trycloudflare.com'
  };
</script>
```

---

## Améliorations Futures

- **Modes de Jeu** : Challenge chronométré, mode puzzle.
- **Accessibilité** : Thèmes daltoniens, contrôles clavier.
- **Optimisations** : LOD adaptatif pour grilles > 100k.
- **Social** : Seeds de grilles partageables pour défier des amis.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.

### v2.0 – Professional Optimization
- 🔒 Security hardening (URL validation, CORS, no hardcoded secrets)
- 🧹 Code cleanup (~370 lines removed from solver)
- 🏗️ Modular architecture (3 new rendering modules)
- ⚙️ Auto-configuration for local vs cloud environments
- 📝 Comprehensive documentation

### v1.1 – Configurable Flag Style
- Flag style toggle (particles vs 2D)
- Stylized 2D flags with hover animation
- Fixed flag cleanup on game end
