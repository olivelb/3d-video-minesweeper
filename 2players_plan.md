# 2-Player Co-op Minesweeper - Hybrid Implementation Plan

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Git Strategy](#git-strategy)
4. [Phase 1: Make Game.js Headless-Compatible](#phase-1-make-gamejs-headless-compatible)
5. [Phase 2: Create GameServer Module](#phase-2-create-gameserver-module)
6. [Phase 3: WebRTC Peer-to-Peer Mode](#phase-3-webrtc-peer-to-peer-mode)
7. [Phase 4: Socket.io Dedicated Server Mode](#phase-4-socketio-dedicated-server-mode)
8. [Phase 5: UI Changes](#phase-5-ui-changes)
9. [Phase 6: Testing](#phase-6-testing)
10. [File Summary](#file-summary)

---

## Overview

This plan implements a **hybrid architecture** for 2-player cooperative Minesweeper:

- **Mode A (Peer-to-Peer):** Player 1's browser hosts the game. Player 2 connects via WebRTC. No server needed.
- **Mode B (Dedicated Server):** A RasPi (or cloud instance) runs the game server. Both players connect via WebSockets.

The same `GameServer` module powers both modes. Start with Mode A, upgrade to Mode B later if needed.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SHARED CODE                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ GameServer.js                                               │    │
│  │ - Holds MinesweeperGame instance                            │    │
│  │ - Processes actions (reveal, flag)                          │    │
│  │ - Broadcasts state changes                                  │    │
│  │ - NO DOM, NO window, NO document                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
          ▼                                       ▼
┌─────────────────────┐                 ┌─────────────────────┐
│ MODE A: P2P         │                 │ MODE B: DEDICATED   │
│ (Browser-hosted)    │                 │ (RasPi/Cloud)       │
│                     │                 │                     │
│ Player 1 Browser:   │                 │ Server:             │
│ - Runs GameServer   │                 │ - Runs GameServer   │
│ - WebRTC Host       │                 │ - Socket.io         │
│                     │                 │                     │
│ Player 2 Browser:   │                 │ Players:            │
│ - WebRTC Client     │                 │ - Socket.io clients │
└─────────────────────┘                 └─────────────────────┘
```

---

## Git Strategy

### Step 1: Create a new branch
```bash
cd c:\Users\user\Documents\GitHub\3d-video-minesweeper
git checkout -b coop-2player
git push -u origin coop-2player
```

### Step 2: Make commits after each phase
After completing each phase, commit with a descriptive message:
```bash
git add .
git commit -m "Phase X: Description"
git push
```

---

## Phase 1: Make Game.js Headless-Compatible

**Goal:** Ensure `MinesweeperGame` class can run in Node.js (no browser APIs).

### Step 1.1: Audit Game.js for browser dependencies

Open `javascripts/Game.js` and search for:
- `window`
- `document`
- `localStorage`
- `alert`
- `console` (this is fine, Node has it)

**Current issues found:**
- Line 144: `localStorage.setItem(...)` — Needs conditional check
- Line 196: `alert(...)` — Needs to be removed or made optional
- Line 294: `localStorage.removeItem(...)` — Needs conditional check

### Step 1.2: Add environment detection

At the top of `javascripts/Game.js`, add:

```javascript
// Environment detection
const isBrowser = typeof window !== 'undefined';
const storage = isBrowser ? localStorage : { 
    getItem: () => null, 
    setItem: () => {}, 
    removeItem: () => {} 
};
```

### Step 1.3: Replace localStorage calls

Replace all `localStorage` with `storage`:

- Line 144: `localStorage.setItem(...)` → `storage.setItem(...)`
- Line 294: `localStorage.removeItem(...)` → `storage.removeItem(...)`

### Step 1.4: Remove or conditionalize alert()

At line 196, replace:
```javascript
alert(`Note : La génération a été ${reason}. La grille n'est pas garantie 100% logique.`);
```

With:
```javascript
if (isBrowser && typeof alert === 'function') {
    alert(`Note : La génération a été ${reason}. La grille n'est pas garantie 100% logique.`);
}
// In headless mode, just log it
console.log(`[GameServer] Board generation: ${reason}`);
```

### Step 1.5: Test in Node.js

Create a test file `test-headless.mjs`:

```javascript
import { MinesweeperGame } from './javascripts/Game.js';

const game = new MinesweeperGame(10, 10, 10);
game.init();
console.log('Game created:', game.width, 'x', game.height);
console.log('Test passed!');
```

Run:
```bash
node test-headless.mjs
```

Expected output:
```
Game created: 10 x 10
Test passed!
```

Delete `test-headless.mjs` after testing.

### Step 1.6: Commit
```bash
git add javascripts/Game.js
git commit -m "Phase 1: Make Game.js headless-compatible"
```

---

## Phase 2: Create GameServer Module

**Goal:** Create a reusable module that manages game state and player actions.

### Step 2.1: Create the file

Create `javascripts/GameServer.js`:

```javascript
/**
 * GameServer - Authoritative game state manager
 * Can run in browser (P2P host) or Node.js (dedicated server)
 */

import { MinesweeperGame } from './Game.js';

export class GameServer {
    constructor(config = {}) {
        this.width = config.width || 30;
        this.height = config.height || 16;
        this.bombCount = config.bombCount || 99;
        this.noGuessMode = config.noGuessMode || false;
        
        this.game = null;
        this.players = new Map(); // id -> { name, connected }
        this.maxPlayers = config.maxPlayers || 2;
        this.gameStarted = false;
        
        // Callbacks for network layer to implement
        this.onBroadcast = null;  // (eventName, data) => void
        this.onSendTo = null;     // (playerId, eventName, data) => void
    }

    /**
     * Add a player to the game
     * @param {string} playerId - Unique identifier
     * @param {string} playerName - Display name
     * @returns {object} { success, error?, playerNumber? }
     */
    addPlayer(playerId, playerName) {
        if (this.players.size >= this.maxPlayers) {
            return { success: false, error: 'Game is full' };
        }
        if (this.players.has(playerId)) {
            return { success: false, error: 'Already joined' };
        }
        
        const playerNumber = this.players.size + 1;
        this.players.set(playerId, { 
            name: playerName, 
            number: playerNumber,
            connected: true 
        });
        
        // Notify all players
        if (this.onBroadcast) {
            this.onBroadcast('playerJoined', { 
                playerId, 
                playerName, 
                playerNumber,
                totalPlayers: this.players.size 
            });
        }
        
        return { success: true, playerNumber };
    }

    /**
     * Remove a player
     * @param {string} playerId 
     */
    removePlayer(playerId) {
        if (!this.players.has(playerId)) return;
        
        const player = this.players.get(playerId);
        this.players.delete(playerId);
        
        if (this.onBroadcast) {
            this.onBroadcast('playerLeft', { 
                playerId, 
                playerName: player.name 
            });
        }
    }

    /**
     * Initialize the game board
     * Called when host decides to start, or automatically when 2 players join
     */
    initGame() {
        this.game = new MinesweeperGame(this.width, this.height, this.bombCount);
        this.game.noGuessMode = this.noGuessMode;
        this.game.init();
        this.gameStarted = false; // Will be true after first click
        
        if (this.onBroadcast) {
            this.onBroadcast('gameReady', {
                width: this.width,
                height: this.height,
                bombCount: this.bombCount
            });
        }
    }

    /**
     * Process a player action
     * @param {string} playerId - Who did it
     * @param {object} action - { type: 'reveal'|'flag', x, y }
     * @returns {object} Result to broadcast
     */
    async processAction(playerId, action) {
        if (!this.game) {
            return { success: false, error: 'Game not initialized' };
        }
        if (!this.players.has(playerId)) {
            return { success: false, error: 'Unknown player' };
        }
        
        const player = this.players.get(playerId);
        const { type, x, y } = action;
        
        let result;
        
        if (type === 'reveal') {
            result = await this.game.reveal(x, y);
        } else if (type === 'flag') {
            result = this.game.toggleFlag(x, y);
        } else {
            return { success: false, error: 'Unknown action type' };
        }
        
        if (!this.gameStarted && result.type !== 'none') {
            this.gameStarted = true;
        }
        
        // Broadcast the result
        const update = {
            actor: {
                id: playerId,
                name: player.name,
                number: player.number
            },
            action: { type, x, y },
            result: result
        };
        
        if (this.onBroadcast) {
            this.onBroadcast('gameUpdate', update);
        }
        
        // Check for game over
        if (result.type === 'explode') {
            if (this.onBroadcast) {
                this.onBroadcast('gameOver', { 
                    victory: false, 
                    triggeredBy: player.name 
                });
            }
        } else if (result.type === 'win') {
            if (this.onBroadcast) {
                this.onBroadcast('gameOver', { 
                    victory: true,
                    time: this.game.getElapsedTime()
                });
            }
        }
        
        return { success: true, result };
    }

    /**
     * Get the current full game state (for late joiners or reconnects)
     * @returns {object} Complete state snapshot
     */
    getFullState() {
        if (!this.game) return null;
        
        return {
            width: this.width,
            height: this.height,
            bombCount: this.bombCount,
            visibleGrid: this.game.visibleGrid,
            flags: this.game.flags,
            gameOver: this.game.gameOver,
            victory: this.game.victory,
            elapsedTime: this.game.getElapsedTime(),
            players: Array.from(this.players.entries()).map(([id, p]) => ({
                id,
                name: p.name,
                number: p.number
            }))
        };
    }

    /**
     * Handle cursor position update (just relay, no storage)
     * @param {string} playerId 
     * @param {object} position - { x, y }
     */
    updateCursor(playerId, position) {
        if (!this.players.has(playerId)) return;
        
        const player = this.players.get(playerId);
        
        // Broadcast to OTHER players only
        if (this.onBroadcast) {
            this.onBroadcast('cursorUpdate', {
                playerId,
                playerNumber: player.number,
                x: position.x,
                y: position.y
            }, playerId); // Exclude sender
        }
    }
}
```

### Step 2.2: Test GameServer locally

Create `test-gameserver.mjs`:

```javascript
import { GameServer } from './javascripts/GameServer.js';

const server = new GameServer({ width: 10, height: 10, bombCount: 10 });

// Mock broadcast
server.onBroadcast = (event, data) => {
    console.log(`[BROADCAST] ${event}:`, JSON.stringify(data).substring(0, 100));
};

// Add players
console.log('Adding player 1:', server.addPlayer('p1', 'Alice'));
console.log('Adding player 2:', server.addPlayer('p2', 'Bob'));
console.log('Adding player 3 (should fail):', server.addPlayer('p3', 'Charlie'));

// Init game
server.initGame();

// Simulate action
server.processAction('p1', { type: 'reveal', x: 5, y: 5 }).then(result => {
    console.log('Action result:', result.success);
    console.log('Test passed!');
});
```

Run:
```bash
node test-gameserver.mjs
```

Delete test file after success.

### Step 2.3: Commit
```bash
git add javascripts/GameServer.js
git commit -m "Phase 2: Create GameServer module"
```

---

## Phase 3: WebRTC Peer-to-Peer Mode

**Goal:** Player 1's browser hosts the game. Player 2 connects directly via WebRTC.

### Step 3.1: Install PeerJS (simplifies WebRTC)

We'll use PeerJS CDN (no npm needed for client).

In `index.html`, add before other scripts:

```html
<script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script>
```

### Step 3.2: Create NetworkManager.js

Create `javascripts/NetworkManager.js`:

```javascript
/**
 * NetworkManager - Handles P2P and Server connections
 * Abstracts the transport layer so Game.js doesn't care how it's connected
 */

import { GameServer } from './GameServer.js';

export class NetworkManager {
    constructor() {
        this.mode = null;           // 'host' | 'client' | 'dedicated'
        this.peer = null;           // PeerJS instance
        this.connections = [];      // DataConnections to other players
        this.gameServer = null;     // Only exists if hosting
        this.playerId = null;
        this.playerNumber = null;
        
        // Event callbacks (set by Game.js or main.js)
        this.onConnected = null;        // () => void
        this.onPlayerJoined = null;     // (playerInfo) => void
        this.onPlayerLeft = null;       // (playerInfo) => void
        this.onGameReady = null;        // (config) => void
        this.onGameUpdate = null;       // (update) => void
        this.onGameOver = null;         // (result) => void
        this.onCursorUpdate = null;     // (cursor) => void
        this.onError = null;            // (error) => void
        this.onStateSync = null;        // (fullState) => void
    }

    /**
     * HOST MODE: Create a game and wait for players
     * @param {string} playerName - Host's display name
     * @param {object} gameConfig - { width, height, bombCount, noGuessMode }
     * @returns {Promise<string>} The room code (PeerJS ID)
     */
    async hostGame(playerName, gameConfig) {
        this.mode = 'host';
        
        // Create GameServer
        this.gameServer = new GameServer(gameConfig);
        this.gameServer.onBroadcast = (event, data, excludeId) => {
            this._broadcastToClients(event, data, excludeId);
        };
        
        // Create PeerJS connection
        return new Promise((resolve, reject) => {
            // Generate a short room code
            const roomCode = this._generateRoomCode();
            
            this.peer = new Peer(roomCode, {
                debug: 1
            });
            
            this.peer.on('open', (id) => {
                console.log('[NetworkManager] Hosting as:', id);
                
                // Add self as player 1
                this.playerId = 'host';
                const result = this.gameServer.addPlayer(this.playerId, playerName);
                this.playerNumber = result.playerNumber;
                
                // Initialize the game board
                this.gameServer.initGame();
                
                resolve(id);
            });
            
            this.peer.on('connection', (conn) => {
                this._handleIncomingConnection(conn);
            });
            
            this.peer.on('error', (err) => {
                console.error('[NetworkManager] Peer error:', err);
                if (this.onError) this.onError(err.message);
                reject(err);
            });
        });
    }

    /**
     * CLIENT MODE: Join an existing game
     * @param {string} roomCode - The host's PeerJS ID
     * @param {string} playerName - This player's display name
     */
    async joinGame(roomCode, playerName) {
        this.mode = 'client';
        
        return new Promise((resolve, reject) => {
            this.peer = new Peer({
                debug: 1
            });
            
            this.peer.on('open', () => {
                console.log('[NetworkManager] Connecting to:', roomCode);
                
                const conn = this.peer.connect(roomCode, { reliable: true });
                
                conn.on('open', () => {
                    console.log('[NetworkManager] Connected to host');
                    this.connections.push(conn);
                    
                    // Send join request
                    conn.send({ type: 'join', playerName });
                    
                    // Handle messages from host
                    conn.on('data', (data) => {
                        this._handleMessage(data);
                    });
                    
                    if (this.onConnected) this.onConnected();
                    resolve();
                });
                
                conn.on('error', (err) => {
                    console.error('[NetworkManager] Connection error:', err);
                    if (this.onError) this.onError('Connection failed');
                    reject(err);
                });
            });
            
            this.peer.on('error', (err) => {
                console.error('[NetworkManager] Peer error:', err);
                if (this.onError) this.onError(err.message);
                reject(err);
            });
        });
    }

    /**
     * DEDICATED SERVER MODE: Connect to a Socket.io server
     * @param {string} serverUrl - The server URL (e.g., 'http://192.168.1.100:3002')
     * @param {string} playerName - This player's display name
     */
    async connectToServer(serverUrl, playerName) {
        this.mode = 'dedicated';
        
        // Dynamically load socket.io client if not loaded
        if (typeof io === 'undefined') {
            await this._loadSocketIO(serverUrl);
        }
        
        return new Promise((resolve, reject) => {
            this.socket = io(serverUrl, {
                transports: ['websocket', 'polling']
            });
            
            this.socket.on('connect', () => {
                console.log('[NetworkManager] Connected to dedicated server');
                this.socket.emit('join', { playerName });
            });
            
            this.socket.on('welcome', (data) => {
                this.playerId = data.playerId;
                this.playerNumber = data.playerNumber;
                console.log('[NetworkManager] Joined as player', this.playerNumber);
                if (this.onConnected) this.onConnected();
                resolve();
            });
            
            this.socket.on('stateSync', (data) => {
                if (this.onStateSync) this.onStateSync(data.state);
            });
            
            this.socket.on('playerJoined', (data) => {
                if (this.onPlayerJoined) this.onPlayerJoined(data);
            });
            
            this.socket.on('playerLeft', (data) => {
                if (this.onPlayerLeft) this.onPlayerLeft(data);
            });
            
            this.socket.on('gameReady', (data) => {
                if (this.onGameReady) this.onGameReady(data);
            });
            
            this.socket.on('gameUpdate', (data) => {
                if (this.onGameUpdate) this.onGameUpdate(data);
            });
            
            this.socket.on('gameOver', (data) => {
                if (this.onGameOver) this.onGameOver(data);
            });
            
            this.socket.on('cursorUpdate', (data) => {
                if (this.onCursorUpdate) this.onCursorUpdate(data);
            });
            
            this.socket.on('error', (data) => {
                if (this.onError) this.onError(data.message);
                reject(new Error(data.message));
            });
            
            this.socket.on('connect_error', (err) => {
                console.error('[NetworkManager] Server connection error:', err);
                if (this.onError) this.onError('Connection failed');
                reject(err);
            });
        });
    }
    
    /**
     * Dynamically load Socket.io client library
     */
    async _loadSocketIO(serverUrl) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${serverUrl}/socket.io/socket.io.js`;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Socket.io'));
            document.head.appendChild(script);
        });
    }

    /**
     * Send an action to the server (host or dedicated)
     * @param {object} action - { type: 'reveal'|'flag', x, y }
     */
    sendAction(action) {
        if (this.mode === 'host') {
            // Process locally
            this.gameServer.processAction(this.playerId, action);
        } else if (this.mode === 'dedicated') {
            // Send to Socket.io server
            if (this.socket) {
                this.socket.emit('action', action);
            }
        } else {
            // Send to P2P host
            if (this.connections.length > 0) {
                this.connections[0].send({ type: 'action', action });
            }
        }
    }

    /**
     * Send cursor position update
     * @param {number} x 
     * @param {number} y 
     */
    sendCursor(x, y) {
        if (this.mode === 'host') {
            // Broadcast to clients
            this._broadcastToClients('cursorUpdate', { 
                playerId: this.playerId, 
                playerNumber: this.playerNumber,
                x, y 
            });
        } else if (this.mode === 'dedicated') {
            // Send to Socket.io server
            if (this.socket) {
                this.socket.emit('cursor', { x, y });
            }
        } else {
            // Send to P2P host
            if (this.connections.length > 0) {
                this.connections[0].send({ type: 'cursor', x, y });
            }
        }
    }

    /**
     * Disconnect and cleanup
     */
    disconnect() {
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.connections = [];
        this.gameServer = null;
        this.mode = null;
    }

    // ─────────────────────────────────────────────────────────────
    // PRIVATE METHODS
    // ─────────────────────────────────────────────────────────────

    _generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    _handleIncomingConnection(conn) {
        console.log('[NetworkManager] Incoming connection');
        
        conn.on('open', () => {
            this.connections.push(conn);
        });
        
        conn.on('data', (data) => {
            this._handleClientMessage(conn, data);
        });
        
        conn.on('close', () => {
            // Remove from connections
            const idx = this.connections.indexOf(conn);
            if (idx !== -1) {
                this.connections.splice(idx, 1);
            }
            // Remove from game
            if (conn.playerId && this.gameServer) {
                this.gameServer.removePlayer(conn.playerId);
            }
        });
    }

    _handleClientMessage(conn, data) {
        // Host receives message from a client
        
        if (data.type === 'join') {
            const playerId = 'player_' + Date.now();
            conn.playerId = playerId;
            
            const result = this.gameServer.addPlayer(playerId, data.playerName);
            
            if (result.success) {
                // Send welcome with player info
                conn.send({ 
                    type: 'welcome', 
                    playerId, 
                    playerNumber: result.playerNumber 
                });
                
                // Send full game state
                conn.send({ 
                    type: 'stateSync', 
                    state: this.gameServer.getFullState() 
                });
            } else {
                conn.send({ type: 'error', message: result.error });
                conn.close();
            }
        }
        else if (data.type === 'action') {
            this.gameServer.processAction(conn.playerId, data.action);
        }
        else if (data.type === 'cursor') {
            this.gameServer.updateCursor(conn.playerId, { x: data.x, y: data.y });
        }
    }

    _handleMessage(data) {
        // Client receives message from host
        
        if (data.type === 'welcome') {
            this.playerId = data.playerId;
            this.playerNumber = data.playerNumber;
            console.log('[NetworkManager] Joined as player', this.playerNumber);
        }
        else if (data.type === 'stateSync') {
            if (this.onStateSync) this.onStateSync(data.state);
        }
        else if (data.type === 'playerJoined') {
            if (this.onPlayerJoined) this.onPlayerJoined(data);
        }
        else if (data.type === 'playerLeft') {
            if (this.onPlayerLeft) this.onPlayerLeft(data);
        }
        else if (data.type === 'gameReady') {
            if (this.onGameReady) this.onGameReady(data);
        }
        else if (data.type === 'gameUpdate') {
            if (this.onGameUpdate) this.onGameUpdate(data);
        }
        else if (data.type === 'gameOver') {
            if (this.onGameOver) this.onGameOver(data);
        }
        else if (data.type === 'cursorUpdate') {
            if (this.onCursorUpdate) this.onCursorUpdate(data);
        }
        else if (data.type === 'error') {
            if (this.onError) this.onError(data.message);
        }
    }

    _broadcastToClients(eventName, data, excludeId = null) {
        const message = { type: eventName, ...data };
        
        for (const conn of this.connections) {
            if (excludeId && conn.playerId === excludeId) continue;
            conn.send(message);
        }
        
        // Also trigger local callbacks if host
        if (this.mode === 'host') {
            this._handleMessage({ type: eventName, ...data });
        }
    }
}

// Singleton export
export const networkManager = new NetworkManager();
```

### Step 3.3: Commit
```bash
git add javascripts/NetworkManager.js index.html
git commit -m "Phase 3: Add WebRTC P2P NetworkManager"
```

---

## Phase 4: Socket.io Dedicated Server Mode

**Goal:** Run the same GameServer on RasPi with Socket.io transport.

### Step 4.1: Update server/package.json

Add socket.io dependency:

```json
{
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "socket.io": "^4.7.4"
  }
}
```

Run:
```bash
cd server
npm install socket.io
```

### Step 4.2: Create server/GameServerNode.js

This wraps GameServer for Node.js + Socket.io:

```javascript
/**
 * GameServerNode - Node.js wrapper for GameServer with Socket.io
 */

import { GameServer } from '../javascripts/GameServer.js';

export function createGameServer(io, config = {}) {
    const gameServer = new GameServer(config);
    const socketToPlayerId = new Map();
    
    // Wire up broadcasting
    gameServer.onBroadcast = (event, data, excludePlayerId) => {
        if (excludePlayerId) {
            // Find the socket to exclude
            for (const [socketId, playerId] of socketToPlayerId) {
                if (playerId !== excludePlayerId) {
                    io.to(socketId).emit(event, data);
                }
            }
        } else {
            io.emit(event, data);
        }
    };
    
    io.on('connection', (socket) => {
        console.log('[GameServer] Client connected:', socket.id);
        
        socket.on('join', ({ playerName }) => {
            const playerId = socket.id;
            socketToPlayerId.set(socket.id, playerId);
            
            const result = gameServer.addPlayer(playerId, playerName);
            
            if (result.success) {
                socket.emit('welcome', { playerId, playerNumber: result.playerNumber });
                socket.emit('stateSync', { state: gameServer.getFullState() });
                
                // Auto-init game when first player joins
                if (gameServer.players.size === 1 && !gameServer.game) {
                    gameServer.initGame();
                }
            } else {
                socket.emit('error', { message: result.error });
                socket.disconnect();
            }
        });
        
        socket.on('action', async (action) => {
            const playerId = socketToPlayerId.get(socket.id);
            if (playerId) {
                await gameServer.processAction(playerId, action);
            }
        });
        
        socket.on('cursor', ({ x, y }) => {
            const playerId = socketToPlayerId.get(socket.id);
            if (playerId) {
                gameServer.updateCursor(playerId, { x, y });
            }
        });
        
        socket.on('disconnect', () => {
            const playerId = socketToPlayerId.get(socket.id);
            if (playerId) {
                gameServer.removePlayer(playerId);
                socketToPlayerId.delete(socket.id);
            }
            console.log('[GameServer] Client disconnected:', socket.id);
        });
    });
    
    return gameServer;
}
```

### Step 4.3: Create server/multiplayer.js (entry point)

Create a new entry point for the multiplayer server:

```javascript
/**
 * Multiplayer Server Entry Point
 * Run with: node multiplayer.js
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { createGameServer } from './GameServerNode.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*', // Configure properly for production
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.MULTIPLAYER_PORT || 3002;

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', mode: 'multiplayer' });
});

// Create game server
const gameConfig = {
    width: parseInt(process.env.GAME_WIDTH) || 30,
    height: parseInt(process.env.GAME_HEIGHT) || 16,
    bombCount: parseInt(process.env.GAME_BOMBS) || 99,
    maxPlayers: 2
};

createGameServer(io, gameConfig);

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Multiplayer server running on port ${PORT}`);
    console.log(`   Board: ${gameConfig.width}x${gameConfig.height}, ${gameConfig.bombCount} bombs`);
});
```

### Step 4.4: Update server/package.json scripts

```json
{
  "scripts": {
    "start": "node index.js",
    "start:multiplayer": "node multiplayer.js",
    "dev": "node --watch index.js",
    "dev:multiplayer": "node --watch multiplayer.js"
  }
}
```

### Step 4.5: Commit
```bash
git add server/
git commit -m "Phase 4: Add Socket.io dedicated server mode"
```

---

## Phase 5: UI Changes

**Goal:** Add lobby UI for hosting/joining games, show partner cursor, **auto-detect server availability**.

### Step 5.1: Update index.html

Add a connection panel in the UI. Find the settings/menu area and add:

```html
<!-- Multiplayer Panel (add in the menu/settings area) -->
<div id="multiplayer-panel" class="panel">
    <h3>Multijoueur</h3>
    
    <!-- Server Status (auto-detected on page load) -->
    <div id="mp-server-status">
        <span id="server-indicator">●</span>
        <span id="server-status-text">Vérification du serveur...</span>
    </div>
    
    <!-- Mode Selection (changes based on server availability) -->
    <div id="mp-mode-select">
        <!-- These buttons are shown/hidden based on server status -->
        <button id="btn-use-server" class="hidden primary">Jouer via Serveur</button>
        <button id="btn-host">Créer partie P2P</button>
        <button id="btn-join">Rejoindre P2P</button>
    </div>
    
    <!-- P2P Host Panel -->
    <div id="mp-host" class="hidden">
        <input type="text" id="host-name" placeholder="Votre pseudo" value="Joueur 1">
        <button id="btn-start-host">Démarrer</button>
        <div id="room-code" class="hidden">
            Code: <span id="room-code-value"></span>
            <button id="btn-copy-code">Copier</button>
        </div>
    </div>
    
    <!-- P2P Join Panel -->
    <div id="mp-join" class="hidden">
        <input type="text" id="join-code" placeholder="Code (ex: AB12)" maxlength="4">
        <input type="text" id="join-name" placeholder="Votre pseudo" value="Joueur 2">
        <button id="btn-connect">Connexion</button>
    </div>
    
    <!-- Dedicated Server Panel (only shown when server is online) -->
    <div id="mp-dedicated" class="hidden">
        <p>Serveur: <strong id="server-url-display"></strong></p>
        <input type="text" id="server-name" placeholder="Votre pseudo" value="Joueur">
        <button id="btn-connect-server">Connexion au serveur</button>
    </div>
    
    <!-- Connection Status -->
    <div id="mp-status" class="hidden">
        <div id="connection-status">En attente...</div>
        <div id="players-list"></div>
    </div>
</div>
```

### Step 5.2: Add CSS for multiplayer panel

In `css/style.css`, add:

```css
/* Multiplayer Panel */
#multiplayer-panel {
    margin-top: 20px;
    padding: 15px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
}

#multiplayer-panel h3 {
    margin-top: 0;
    color: #4CAF50;
}

#multiplayer-panel button {
    margin: 5px;
    padding: 8px 16px;
    cursor: pointer;
}

#multiplayer-panel button.primary {
    background: #4CAF50;
    color: white;
    font-weight: bold;
    border: none;
}

#multiplayer-panel input {
    margin: 5px;
    padding: 8px;
    width: 150px;
}

#room-code-value {
    font-size: 24px;
    font-weight: bold;
    color: #FFD700;
    letter-spacing: 4px;
}

.hidden {
    display: none !important;
}

/* Server Status Indicator */
#mp-server-status {
    padding: 8px 12px;
    margin-bottom: 10px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
}

#server-indicator {
    font-size: 12px;
    margin-right: 8px;
}

#server-indicator.online {
    color: #4CAF50;
}

#server-indicator.offline {
    color: #F44336;
}

#server-indicator.checking {
    color: #FFC107;
    animation: blink 1s infinite;
}

@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
}

/* Partner cursor */
.partner-cursor {
    position: absolute;
    width: 20px;
    height: 20px;
    border: 3px solid #FF4081;
    border-radius: 50%;
    pointer-events: none;
    transform: translate(-50%, -50%);
    animation: pulse 1s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.2); }
}

#connection-status {
    padding: 10px;
    margin: 10px 0;
    border-radius: 4px;
}

#connection-status.connected {
    background: rgba(76, 175, 80, 0.3);
    color: #4CAF50;
}

#connection-status.waiting {
    background: rgba(255, 193, 7, 0.3);
    color: #FFC107;
}

#connection-status.error {
    background: rgba(244, 67, 54, 0.3);
    color: #F44336;
}
```

### Step 5.3: Modify UIManager.js to handle multiplayer

Add to `javascripts/UIManager.js`:

```javascript
// Add these methods to UIManager class

// Configuration: Set your dedicated server URL here
// Can also be loaded from a config file or environment
const DEDICATED_SERVER_URL = 'http://raspberrol.local:3002'; // Or your RasPi IP

async initMultiplayerUI() {
    // First, check if dedicated server is available
    await this.checkServerAvailability();
    
    // Mode selection buttons
    document.getElementById('btn-host')?.addEventListener('click', () => {
        this.showPanel('mp-host');
    });
    
    document.getElementById('btn-join')?.addEventListener('click', () => {
        this.showPanel('mp-join');
    });
    
    document.getElementById('btn-use-server')?.addEventListener('click', () => {
        this.showPanel('mp-dedicated');
    });
    
    // Host actions
    document.getElementById('btn-start-host')?.addEventListener('click', () => {
        this.startHosting();
    });
    
    // Join P2P actions
    document.getElementById('btn-connect')?.addEventListener('click', () => {
        this.joinGame();
    });
    
    // Join dedicated server
    document.getElementById('btn-connect-server')?.addEventListener('click', () => {
        this.joinDedicatedServer();
    });
    
    // Copy code button
    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
        const code = document.getElementById('room-code-value').textContent;
        navigator.clipboard.writeText(code);
    });
}

/**
 * Check if the dedicated server is online
 * Updates the UI to show server status and available options
 */
async checkServerAvailability() {
    const indicator = document.getElementById('server-indicator');
    const statusText = document.getElementById('server-status-text');
    const serverButton = document.getElementById('btn-use-server');
    const serverUrlDisplay = document.getElementById('server-url-display');
    
    // Set checking state
    indicator.className = 'checking';
    statusText.textContent = 'Vérification du serveur...';
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(`${DEDICATED_SERVER_URL}/health`, {
            signal: controller.signal
        });
        clearTimeout(timeout);
        
        if (response.ok) {
            // Server is online
            indicator.className = 'online';
            statusText.textContent = 'Serveur disponible';
            serverButton.classList.remove('hidden');
            serverUrlDisplay.textContent = DEDICATED_SERVER_URL;
            this.dedicatedServerUrl = DEDICATED_SERVER_URL;
        } else {
            throw new Error('Server returned error');
        }
    } catch (err) {
        // Server is offline or unreachable
        indicator.className = 'offline';
        statusText.textContent = 'Serveur hors ligne (P2P uniquement)';
        serverButton.classList.add('hidden');
        this.dedicatedServerUrl = null;
    }
}

showPanel(panelId) {
    ['mp-host', 'mp-join', 'mp-dedicated'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });
    document.getElementById(panelId)?.classList.remove('hidden');
}

async startHosting() {
    const playerName = document.getElementById('host-name').value || 'Host';
    const config = this.getGameConfig(); // Get width/height/bombs from existing UI
    
    try {
        const roomCode = await networkManager.hostGame(playerName, config);
        document.getElementById('room-code-value').textContent = roomCode;
        document.getElementById('room-code').classList.remove('hidden');
        this.updateConnectionStatus('waiting', `En attente de joueur... Code: ${roomCode}`);
    } catch (err) {
        this.updateConnectionStatus('error', 'Erreur: ' + err.message);
    }
}

async joinGame() {
    const roomCode = document.getElementById('join-code').value.toUpperCase();
    const playerName = document.getElementById('join-name').value || 'Guest';
    
    if (!roomCode || roomCode.length !== 4) {
        this.updateConnectionStatus('error', 'Code invalide');
        return;
    }
    
    try {
        await networkManager.joinGame(roomCode, playerName);
        this.updateConnectionStatus('connected', 'Connecté!');
    } catch (err) {
        this.updateConnectionStatus('error', 'Connexion échouée');
    }
}

async joinDedicatedServer() {
    const playerName = document.getElementById('server-name').value || 'Joueur';
    
    if (!this.dedicatedServerUrl) {
        this.updateConnectionStatus('error', 'Serveur non disponible');
        return;
    }
    
    try {
        await networkManager.connectToServer(this.dedicatedServerUrl, playerName);
        this.updateConnectionStatus('connected', 'Connecté au serveur!');
    } catch (err) {
        this.updateConnectionStatus('error', 'Connexion au serveur échouée');
    }
}

updateConnectionStatus(status, message) {
    const el = document.getElementById('connection-status');
    if (el) {
        el.textContent = message;
        el.className = status;
    }
    document.getElementById('mp-status')?.classList.remove('hidden');
}
```

### Step 5.4: Modify Game.js to use NetworkManager

Add multiplayer hooks to `Game.js`:

Find where `reveal()` is called on click (likely in Renderer.js or a click handler).

Add a check:
```javascript
// Before calling game.reveal() directly, check if multiplayer
if (networkManager.mode) {
    // Multiplayer: send to network
    networkManager.sendAction({ type: 'reveal', x, y });
} else {
    // Single player: execute locally
    const result = await this.game.reveal(x, y);
    this.handleRevealResult(result);
}
```

Similarly for flags.

### Step 5.5: Add partner cursor to Renderer.js

Add to `Renderer.js`:

```javascript
// Add a partner cursor element
createPartnerCursor() {
    this.partnerCursor = document.createElement('div');
    this.partnerCursor.className = 'partner-cursor hidden';
    this.partnerCursor.id = 'partner-cursor';
    document.body.appendChild(this.partnerCursor);
}

updatePartnerCursor(x, y) {
    if (!this.partnerCursor) this.createPartnerCursor();
    
    // Convert grid coordinates to screen position
    // This depends on your 3D rendering setup
    const screenPos = this.gridToScreen(x, y);
    
    if (screenPos) {
        this.partnerCursor.style.left = screenPos.x + 'px';
        this.partnerCursor.style.top = screenPos.y + 'px';
        this.partnerCursor.classList.remove('hidden');
    }
}

hidePartnerCursor() {
    if (this.partnerCursor) {
        this.partnerCursor.classList.add('hidden');
    }
}
```

### Step 5.6: Commit
```bash
git add index.html css/style.css javascripts/
git commit -m "Phase 5: Add multiplayer UI"
```

---

## Phase 6: Testing

### Step 6.1: Test P2P mode locally

1. Open `index.html` in browser (use a local server like `python -m http.server`)
2. Click "Créer une partie", enter name, click "Démarrer"
3. Note the 4-letter room code
4. Open a second browser tab
5. Click "Rejoindre", enter the same code, click "Connexion"
6. Both should see "Connecté"
7. Play the game - actions should sync

### Step 6.2: Test dedicated server mode

1. On RasPi:
   ```bash
   cd server
   npm install
   npm run start:multiplayer
   ```
2. Note the RasPi's IP address (e.g., 192.168.1.100)
3. On two computers, open the game
4. Click "Serveur dédié", enter `http://192.168.1.100:3002`, click connect
5. Both should see the same game

### Step 6.3: Test edge cases

- [ ] Player 2 disconnects mid-game
- [ ] Both players click same cell simultaneously  
- [ ] Network latency simulation (Chrome DevTools throttling)
- [ ] Very large grid (50x30) performance

---

## File Summary

| Action | File | Description |
|--------|------|-------------|
| Modify | `javascripts/Game.js` | Add environment detection, replace localStorage |
| Add | `javascripts/GameServer.js` | Shared authoritative game logic |
| Add | `javascripts/NetworkManager.js` | P2P and Socket.io client |
| Add | `server/GameServerNode.js` | Socket.io wrapper for GameServer |
| Add | `server/multiplayer.js` | Dedicated server entry point |
| Modify | `server/package.json` | Add socket.io dependency |
| Modify | `javascripts/UIManager.js` | Multiplayer panel logic |
| Modify | `javascripts/Renderer.js` | Partner cursor display |
| Modify | `index.html` | Multiplayer UI panel |
| Modify | `css/style.css` | Multiplayer styles |

---

## Scaling Notes (Future)

To support 3+ players later:
1. Change `maxPlayers` in GameServer config
2. Assign unique colors to each player
3. Add player list UI showing all connected players
4. Update cursor rendering to show multiple cursors
