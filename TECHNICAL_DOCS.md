# Documentation Technique Approfondie

## Architecture Générale

Le projet utilise une architecture **MVC-like** adaptée au web moderne :

```
┌─────────────┐      ┌──────────────┐      ┌───────────────┐
│  index.html │─────▶│   Game.js    │◀────▶│  Renderer.js  │
│   (View)    │      │   (Model)    │      │ (View/Three)  │
└─────────────┘      └──────────────┘      └───────────────┘
      │                      │                       │
      ▼                      │                       │
┌──────────────┐             │                   Instancing
│ YouTubeMgr   │◀────────────┘                   Particles
└──────────────┘
      │
      ▼
┌──────────────┐
│ Proxy Server │ (Node.js/Express)
└──────────────┘
```

---

## 1. `Game.js` – Logique Pure

Gère l'état du jeu **sans aucune dépendance au DOM ou Three.js**.

### Structure de Données

```javascript
class MinesweeperGame {
  width, height, bombCount      // Dimensions et config
  grid[][]                      // 0-8: nombre voisins, 1: mine (avant calcul)
  mines[][]                     // booléen: true si mine
  visibleGrid[][]               // -1: caché, 0-8: révélé, 9: explosé
  flags[][]                     // booléen: drapeau posé
  gameOver, victory, firstClick // États
}
```

### Algorithme de Flood Fill Itératif

**Problème** : La version récursive causait un `RangeError: Maximum call stack size exceeded` sur de grandes grilles (ex: 200×150 avec peu de mines → zones vides massives).

**Solution** : Stack explicite (LIFO) au lieu de la pile d'appels :

```javascript
floodFill(startX, startY, changes) {
  const stack = [[startX, startY]];
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (hors_limites || déjà_visible) continue;
    
    révéler(x, y);
    changes.push({ x, y, value });
    
    if (value === 0) {
      // Ajouter tous les voisins à la stack
      for (dx=-1 to 1) for (dy=-1 to 1)
        stack.push([x+dx, y+dy]);
    }
  }
}
```

**Performance** : Peut gérer 30 000 cases en ~50ms sans récursion.

### Placement Intelligent (Mode No Guess)

Si le mode **No Guess** est activé, la grille est régénérée (jusqu'à 500 fois) jusqu'à ce que `MinesweeperSolver.isSolvable` confirme que la grille peut être complétée entièrement sans jamais deviner (probabilité 0%).

### Premier Clic Amélioré
Pour offrir une meilleure expérience, le premier clic ne se contente pas de ne pas être une mine ; il révèle systématiquement un carré de **3x3** autour du clic (ou plus via flood fill si des zéros sont présents).

---

## 2. `MinesweeperSolver.js` – IA & Validation

Ce module implémente les règles de déduction logique du Démineur.

### 2.1 Algorithmes de Résolution
1.  **Règles de Base** : Décompte des mines voisines vs cases cachées.
2.  **Subset Logic (Set Reduction)** : Analyse des intersections de voisinages. Si les cases cachées entourant un nombre A sont incluses dans celles d'un nombre B, on peut déduire des informations sur la zone "différence".
3.  **Global Mine Counting** : Utilise le nombre total de mines restantes pour conclure sur les dernières cases du jeu.

### 2.2 Système d'Aide (Best Next Move)
Contrairement à une aide basée uniquement sur la logique, le système **"BESOIN D'AIDE"** utilise un mode "Expert" (God Mode) pondéré :
- Il identifie toutes les cases **sûres** (en consultant la grille réelle).
- Il calcule un **score d'intérêt** pour chaque case :
    - `+10 points` si la case est un "0" (dévoilement massif).
    - `+N points` proportionnellement au nombre de voisins déjà révélés (priorise la progression sur le "front" de jeu).
- Il retourne la case ayant le score le plus élevé.

---

## 3. `Renderer.js` – Moteur 3D

### 2.1 Optimisation : InstancedMesh

**Problème** : Créer 30 000 `THREE.Mesh` individuels = 30 000 draw calls → 5 FPS.

**Solution** : Un seul `InstancedMesh` = 1 draw call → 60 FPS constant.

```javascript
// Création
const geometry = new THREE.BoxGeometry(20, 20, 20);
const gridMesh = new THREE.InstancedMesh(
  geometry, 
  materials, 
  width * height  // 30 000 instances
);

// Manipulation d'une instance
dummy.position.set(x, y, z);
dummy.scale.set(sx, sy, sz);
dummy.updateMatrix();
gridMesh.setMatrixAt(instanceId, dummy.matrix);
gridMesh.instanceMatrix.needsUpdate = true;

// Cacher un cube (case révélée)
dummy.scale.set(0, 0, 0);  // ← Invisible mais pas supprimé
```

### 2.2 Shader Custom – Video Mapping Global

**Objectif** : Que la vidéo s'affiche comme un écran géant sur toute la grille, pas répétée sur chaque cube.

**Technique** : Modifier le vertex shader du `MeshBasicMaterial` via `onBeforeCompile` :

```javascript
videoMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uGridSize = { value: new Vector2(width, height) };
  
  shader.vertexShader = `
    attribute vec2 aGridPos;  // Position (x,y) dans la grille
    uniform vec2 uGridSize;
    ${shader.vertexShader}
  `.replace(
    '#include <uv_vertex>',
    `#include <uv_vertex>
     vMapUv = (uv + aGridPos) / uGridSize;`  // UV global
  );
};

// Injection de l'attribut par instance
geometry.setAttribute('aGridPos', 
  new THREE.InstancedBufferAttribute(gridPosArray, 2));
```

**Résultat** : Chaque cube affiche la portion correcte de la vidéo selon sa position (x,y).

### 2.3 Système de Particules Moderne

Remplacement de l'ancienne lib `SPE` par `THREE.Points` natif avec logique manuelle.

#### Structure
```javascript
{
  mesh: THREE.Points,
  config: { count, texture, colors, speed, lifeTime, rate },
  velocities: Float32Array,  // vx, vy, vz par particule
  ages: Float32Array,        // âge en secondes
  lives: Float32Array,       // 1=vivant, 0=mort
  alive: boolean,            // émetteur actif?
  origin: Vector3            // position d'émission
}
```

#### Émission Continue (Drapeaux Particules)
```javascript
if (sys.alive && sys.config.rate > 0) {
  for (k=0; k<count && spawned<rate; k++) {
    if (lives[k] === 0) spawnParticle(sys, k, origin);
  }
}
```

#### Émission Burst (Feux d'Artifice)
```javascript
for (i=0; i<count; i++) spawnParticle(sys, i, origin);
sys.alive = false;  // Pas de réémission
```

#### Animation (chaque frame)
```javascript
ages[j] += dt;
if (ages[j] > lifeTime) {
  lives[j] = 0;
  positions[j*3+1] = -10000;  // Cacher sous la scène
  colors[j*3] = colors[j*3+1] = colors[j*3+2] = 0;  // Noir = invisible avec additive
}
positions[j*3] += velocities[j*3] * dt;  // Mouvement
```

**Fix Bright Point** : Initialiser les positions à `y=-10000` et colors à `0` évite le point lumineux au centre.

### 2.4 Système de Drapeaux Dual-Mode

Le système de drapeaux supporte deux modes visuels, commutables en jeu via un bouton.

#### Mode Particules (par défaut)
- Utilise le système de particules avec `AdditiveBlending`
- Particules jaune-rouge scintillantes
- Visuellement impressionnant mais peut fatiguer les yeux sur de longues sessions

#### Mode 2D (calme)
```javascript
// Géométrie plane identique aux numéros
this.flag2DGeometry = new THREE.PlaneGeometry(16, 16);

// Texture canvas avec design stylisé
const canvas = document.createElement('canvas');
ctx.fillStyle = '#ff2222';        // Fanion rouge
ctx.strokeStyle = '#ffffff';       // Bordure blanche
ctx.shadowColor = '#ff0000';       // Lueur rouge
ctx.shadowBlur = 15;
// ... dessin du fanion triangulaire et du mât

this.flag2DMaterial = new THREE.MeshBasicMaterial({
  map: new THREE.CanvasTexture(canvas),
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide
});
```

#### Animation au Survol
Les drapeaux 2D réagissent au survol de leur cube parent :
```javascript
if (flag.userData.gridX === hoveredX && flag.userData.gridY === hoveredY) {
  const pulse = Math.sin(Date.now() * 0.01);
  const scale = 1.0 + pulse * 0.15;
  flag.scale.set(scale, scale, 1);
  flag.position.y = flag.userData.baseY + pulse * 2;
}
```

#### Basculement Runtime
```javascript
toggleFlagStyle() {
  this.flagStyle = this.flagStyle === 'particle' ? '3d' : 'particle';
  
  // Collecter les drapeaux actifs depuis l'état du jeu
  const activeFlags = [];
  for (let x = 0; x < this.game.width; x++) {
    for (let y = 0; y < this.game.height; y++) {
      if (this.game.flags[x][y]) activeFlags.push({ x, y });
    }
  }
  
  // Nettoyer les deux types de visuels
  this.flagEmitters.forEach(e => e.alive = false);
  this.flagEmitters.clear();
  this.flag3DMeshes.forEach(f => this.scene.remove(f));
  this.flag3DMeshes.clear();
  
  // Recréer avec le nouveau style
  for (const { x, y } of activeFlags) {
    this.updateFlagVisual(x, y, true);
  }
}
```

### 2.5 Texte 3D Billboard

**Problème Initial** : Texte tournait sur lui-même (`textGroup.rotation.y += 0.01`), illisible.

**Solution** : Calcul de position face caméra chaque frame :

```javascript
if (endTextMesh) {
  const distance = 400;
  const direction = new Vector3();
  camera.getWorldDirection(direction);
  
  endTextMesh.position.copy(camera.position)
    .add(direction.multiplyScalar(distance));
  endTextMesh.quaternion.copy(camera.quaternion);
}
```

### 2.6 Raycasting & Interaction

Le `Raycaster` de Three.js supporte nativement `InstancedMesh` :

```javascript
raycaster.setFromCamera(mouse, camera);
const hits = raycaster.intersectObject(gridMesh);

if (hits.length > 0) {
  const instanceId = hits[0].instanceId;
  const y = instanceId % height;
  const x = Math.floor(instanceId / height);
  
  if (button === 0) game.reveal(x, y);
  if (button === 2) game.toggleFlag(x, y);
}
```

---

## 3. Détection GPU & Limites Adaptatives

**Objectif** : Éviter les crashs/lags sur GPUs faibles.

```javascript
const detectGpuTier = () => {
  const gl = canvas.getContext('webgl');
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  
  if (/(rtx 3|rtx 4|rx 6|rx 7|m1|m2|m3|m4)/.test(renderer)) return 'high';
  if (/(intel\s+(hd|uhd|iris))/.test(renderer)) return 'low';
  return 'medium';
};

const LIMITS = {
  high: { maxW: 200, maxH: 150 },   // 30 000 cubes
  medium: { maxW: 140, maxH: 100 }, // 14 000 cubes
  low: { maxW: 100, maxH: 80 }      // 8 000 cubes
};
```

**Validation Runtime** : Les valeurs sont clampées au démarrage et répercutées dans les inputs.

---

## 4. Sources Vidéo & Streaming

Le projet supporte désormais une large gamme de sources vidéo, gérées par le `YouTubeManager.js`.

### 4.1 Streaming via Proxy
Comme les plateformes comme YouTube ou Dailymotion interdisent l'accès direct aux flux (CORS), le projet utilise un **Serveur Proxy Node.js**.
- **YouTubeManager** : Extrait les IDs et communique avec le proxy.
- **Proxy Server** : Récupère l'URL du flux brut via `yt-dlp`.

### 4.2 Optimisation UX Turbo
- **Miniature Instantanée** : Affichage via les CDNs officiels (Google/Archive.org).
- **Aperçu Temps Réel** : Une vidéo de prévisualisation se charge dans le menu.

### 4.3 Détection de Serveur Auto
Le fichier `config.js` teste plusieurs points d'entrée (Localhost 8000, 3001, etc.).

### 4.4 Webcam et Fichiers Locaux
- **Webcam** : `navigator.mediaDevices.getUserMedia` avec flux audio.
- **Fichiers Locaux** : Création de `Blob URLs` révoqués proprement.

---

## 5. Gestion Mémoire & Disposal

```javascript
dispose() {
  renderer.setAnimationLoop(null);  // Stop RAF
  
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) 
        obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  });
  
  renderer.dispose();
  container.innerHTML = '';
  
  if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
  if (customVideoUrl) URL.revokeObjectURL(customVideoUrl);
}

---

## 6. `ScoreManager.js` – Leaderboard & Pénalités

### 6.1 Algorithme de Score
Le score est calculé selon la formule :
`Score = (Dimension x Bombes) / Temps`

### 6.2 Pénalités (Fair-play)
Pour maintenir l'équité du leaderboard :
- **Mode No Guess** : Une réduction globale de **25%** est appliquée car la chance n'est plus un facteur.
- **Indices** : Chaque utilisation du système "BESOIN D'AIDE" retire **500 points** du score final (minimum 0).

---

## Performances Mesurées

| Grille      | Cubes  | Draw Calls | FPS (RTX 4070) | FPS (Intel UHD) |
|-------------|--------|------------|----------------|-----------------|
| 30×20       | 600    | 1          | 60             | 60              |
| 100×80      | 8 000  | 1          | 60             | 55-60           |
| 200×150     | 30 000 | 1          | 60             | 30-40 (limite)  |

**Budget GPU** : ~0.5ms par frame (1 draw call instanced) + 2-3ms particules + 1ms post-processing.

---

## Pistes d'Amélioration

### Court Terme
- **Audio** : Web Audio API pour effets spatialisés
- **Compute Shaders** : Flood fill sur GPU via WebGPU
- **Frustum Culling** : Ne rendre que les cubes visibles (utile pour >50k)

### Moyen Terme
- **LOD** : Réduire la complexité géométrique des cubes lointains
- **Octree** : Accélérer le raycasting pour grilles >100k
- **Web Workers** : Déporter Game.js dans un worker

### Long Terme
- **WebGPU** : Compute shaders pour génération procédurale de grilles géantes
- **Networking** : Multiplayer via WebRTC + état partagé
- **WebXR** : Mode VR avec interactions gaze/controller
