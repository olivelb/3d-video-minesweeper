# 🏗️ Technical Architecture & Module Hierarchy

> **Version:** 2.0 (Feb 2026)
> **Status:** Active Refactoring

This document provides a technical overview of the **3D Video Minesweeper** codebase, its module hierarchy, and data flow.

---

### 1. File & Module Hierarchy

This graph represents the physical organization of the codebase and the primary responsibility of each module.

![Module Hierarchy](./diagrams/module_hierarchy.png)

### 2. Event System & State Propagation

The application uses two primary event systems: **Socket.io** for network and **EventBus** for local decoupling.

![Sequence Flow](./diagrams/sequence_flow.png)

### 3. Detailed Class Responsibilities (UML)

![Class Structure](./diagrams/class_structure.png)

### 4. Multiplayer State Machine

Detailed lifecycle of a multiplayer session.

![State Machine](./diagrams/state_machine.png)

### 1. Core (`javascripts/core/`)
*   **`GameController.js`**: The central orchestrator. It connects the Game Logic, UI, Renderer, and Network via **EventBus**. It listens for `CELL_INTERACTION` and `NET_*` events to drive the game state.
*   **`Game.js`**: Pure game logic (Grid state, Rules, Win/Loss conditions). No DOM/WebGL references.
*   **`EventBus.js`**: Pub/Sub system for decoupled communication (e.g., `Events.GAME_OVER`, `Events.NET_GAME_START`).

### 2. Rendering (`javascripts/rendering/`)
*   **`Renderer.js`**: The Three.js entry point. Manages the Scene, Camera, and Loop.
    *   *Refactoring Note*: Still contains some legacy logic for Grid creation that should be moved to `GridManager`.
*   **`GridManager.js`**: Handles the logic for the 3D Grid (`InstancedMesh`), cell visibility, and hover effects.
*   **`InputManager.js`**: Handles Raycasting. **Decoupled**: Emits `CELL_INTERACTION` events instead of calling logic directly.
*   **`MediaTextureManager.js`**: Manages loading of Textures, Videos, and Fonts.
*   **`FlagManager.js`**: Manages 3D Flag instances and particle effects for flags.

### 3. Managers (`javascripts/managers/`)
*   **`ScoreManager.js`**: complex logic for Scoring, High Scores (LocalStorage), and **Click Analytics**.
*   **`UIManager.js`**: Manages HTML overlays (Menu, HUD, Modals) and DOM event listeners.

### 4. Network (`javascripts/network/`)
*   **`NetworkManager.js`**: Singleton wrapper around `Socket.io-client`. **Decoupled**: Emits `NET_*` events to `EventBus` instead of accepting callbacks.

---

## 🔄 Data Flow

### 1. Local Single Player
1.  **Input**: User clicks canvas -> `InputManager` detects intersection.
2.  **Event**: `InputManager` emits `CELL_INTERACTION` ({ x, y, type }).
3.  **Logic**: `GameController` hears event -> calls `Game.reveal(x,y)`.
4.  **Result**: `Game` returns a `Result` object.
5.  **Update**: `GameController` passes result to `Renderer` -> visuals update.

### 2. Multiplayer (Coop/Vs)
1.  **Input**: User clicks -> `InputManager` emits `CELL_INTERACTION`.
2.  **Orchestrator**: `GameController` detects multiplayer mode -> calls `NetworkManager.sendAction`.
3.  **Network**: `NetworkManager` emits socket event.
4.  **Server**: Authoritative `Game.js` processes move.
5.  **Broadcast**: Server emits `gameUpdate` to clients.
6.  **Client Listen**: `NetworkManager` emits `NET_GAME_UPDATE` to `EventBus`.
7.  **Update**: `GameController` hears event -> updates local `Game` -> updates `Renderer`.

---

## 🛠 Technical Debt & Future Refactoring

### 1. Grid Logic Split
Currently, the responsibility for the Grid is split between `Renderer.js` (initial creation) and `GridManager.js` (updates).
*   **Goal**: Move ALL grid instantiation and management into `GridManager.js`.

### 2. Renderer size
`Renderer.js` is large (>1000 lines).
*   **Goal**: Extract `SceneSetup` (Lights, Camera, Skybox) into a helper class.

### 3. TypeScript
The project uses extensive JSDoc, but migrating to TypeScript would strictly enforce the interfaces between `GameController` and its Sub-Managers.
