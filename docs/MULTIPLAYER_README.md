# 🎮 3D Minesweeper - Competitive Multiplayer

> **Branch:** `coop-2player`  
> **Status:** Feature complete, production-tested  
> **Last Updated:** February 2026

## Overview

This branch extends the 3D Video Minesweeper with **real-time competitive multiplayer** functionality. Multiple players compete on the same board - when a player clicks a bomb, they are **eliminated** and the remaining players continue until one wins or all are eliminated.

---

## 🎯 Key Features

### Multiplayer Functionality
- **Competitive Mode** - Multiple players compete on the same board
- **Player Elimination** - Click a bomb = eliminated, but others continue playing
- **Revealed Bombs** - Eliminated player's bomb is shown to others (distinct visual)
- **Elimination Notifications** - "Player X eliminated!" toast message
- **Real-time Synchronization** - Actions are instantly synced across all clients
- **Live Cursor Tracking** - See other players' cursor positions in real-time
- **Lobby System** - Host creates a game, others join when ready

### Elimination System
When a player clicks a bomb:
1. Server marks player as **eliminated**
2. `playerEliminated` event sent to all clients
3. Eliminated player sees **explosion animation** → returns to **menu after 3s**
4. Other players see **revealed bomb** (bomb icon with red X) + notification
5. Game **continues** for remaining players
6. Server does **NOT reset** (even if host is eliminated)

### Win/Lose Conditions
- **Victory**: Reveal all non-mine cells → `gameOver { victory: true }`
- **Total Loss**: All players eliminated → `gameOver { victory: false, reason: 'allEliminated' }`
- After `gameOver`, server resets after 5 seconds

### Architecture Highlights
- **Authoritative Server** - All game logic runs on the server (anti-cheat by design)
- **Action Queue** - Atomic action processing prevents race conditions
- **Dedicated Server Support** - Runs on any Node.js host (tested on Raspberry Pi)
- **Cloud Tunnel Ready** - Works with Cloudflare Tunnel for internet-accessible games

---

## 📁 Project Structure

```
3d-video-minesweeper/
├── index.html                    # Main game interface with multiplayer UI
├── javascripts/
│   ├── main.js                   # Application entry, network coordination
│   ├── Game.js                   # Client-side game logic (solo mode)
│   ├── Renderer.js               # Three.js 3D rendering engine
│   ├── NetworkManager.js         # Socket.io client wrapper
│   ├── UIManager.js              # UI management with multiplayer panels
│   ├── ScoreManager.js           # Score calculation & leaderboard
│   ├── MinesweeperSolver.js      # AI solver for "No Guess" mode
│   └── ...
├── server-multiplayer/
│   ├── server.js                 # Express/Socket.io entry point
│   ├── GameServer.js             # Authoritative game state manager
│   ├── GameServerNode.js         # Socket.io event handling layer
│   ├── Game.js                   # Server-side game logic (headless)
│   ├── MinesweeperSolver.js      # AI solver (server-side copy)
│   ├── package.json              # Server dependencies
│   └── deploy.sh / deploy.ps1   # Deployment scripts
├── ecosystem.config.cjs          # PM2 configuration
└── docs/
    └── MULTIPLAYER_README.md     # This document
```

---

## 🔧 Technical Architecture

### Communication Flow

```
┌─────────────────┐                    ┌─────────────────────┐
│   Player 1      │◄───────────────────│                     │
│   (Browser)     │                    │   Multiplayer       │
│   - NetworkMgr  │───── Socket.io ────│   Server            │
│   - Renderer    │                    │   - GameServerNode  │
└─────────────────┘                    │   - GameServer      │
                                       │   - Game (headless) │
┌─────────────────┐                    │                     │
│   Player 2      │◄───────────────────│                     │
│   (Browser)     │                    └─────────────────────┘
│   - NetworkMgr  │───── Socket.io ────        ▲
│   - Renderer    │                            │
└─────────────────┘                      PM2 / Node.js
```

### Game Session Lifecycle

```
1. LOBBY PHASE
   ├── Player 1 connects → Becomes HOST
   ├── Player 1 configures game (width, height, bombs)
   └── Player 1 clicks "Create Game"

2. WAITING PHASE
   ├── Server creates game instance (mines NOT placed yet)
   └── Host waits for Player 2

3. JOIN PHASE
   ├── Player 2 connects → Becomes GUEST
   ├── Player 2 sees game config
   └── Player 2 clicks "Join Game"

4. GAME PHASE
   ├── Both players see empty board
   ├── First reveal action places mines (safe zone around click)
   ├── All actions go through server, broadcast to both clients
   └── Players see other players' cursors in real-time

5. END PHASE
   ├── Player clicks bomb → Eliminated (others continue)
   ├── Win: All non-mine cells revealed
   ├── Lose: All players eliminated
   ├── 5-second delay after game over
   └── Server resets, remaining clients return to menu
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- A web browser with WebGL support

### Server Setup (Local)

```bash
# Navigate to multiplayer server directory
cd server-multiplayer

# Install dependencies
npm install

# Start server
npm start
# Or with auto-restart on file changes:
npm run dev
```

Server will be available at `http://localhost:3001`

### Server Setup (Raspberry Pi with PM2)

```bash
# Install PM2 globally if not installed
npm install -g pm2

# Start both servers using ecosystem config
pm2 start ecosystem.config.cjs

# View logs
pm2 logs minesweeper-multiplayer
```

### Client Setup
Simply open `index.html` in a browser. The multiplayer panel will automatically check server availability.

To configure the server URL, modify `window.MINESWEEPER_SERVERS` in `index.html`:

```javascript
window.MINESWEEPER_SERVERS = {
    raspberryCloud: 'https://your-tunnel-url.trycloudflare.com'
};
```

---

## 📡 Network Protocol

### Socket.io Events

#### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join` | `{ playerName }` | Connect and join lobby |
| `createGame` | `{ width, height, bombCount }` | Host creates game configuration |
| `joinGame` | `{}` | Guest joins the created game |
| `action` | `{ type, x, y }` | Game action (reveal/flag) |
| `cursor` | `{ x, y }` | Cursor position update |

#### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `welcome` | `{ playerId, playerNumber, isHost }` | Connection confirmed |
| `lobbyUpdate` | `{ players, gameCreated, config }` | Lobby state changed |
| `gameCreated` | `{ config }` | Game created by host |
| `gameStart` | `{ state }` | Game begins, includes mine positions |
| `gameUpdate` | `{ actor, action, result }` | Action result broadcast |
| `minesPlaced` | `{ minePositions }` | First click triggered mine placement |
| `playerEliminated` | `{ playerId, playerName, playerNumber, bombX, bombY, remainingPlayers }` | Player clicked a bomb |
| `gameOver` | `{ victory, winnerId?, winnerName?, reason? }` | Game ended (win or all eliminated) |
| `cursorUpdate` | `{ playerId, playerNumber, x, y }` | Other player cursor moved |
| `hostLeft` | `{}` | Host disconnected (before elimination) |
| `gameEnded` | `{}` | Session complete, return to menu |

### Result Types in gameUpdate
| Type | Description |
|------|-------------|
| `reveal` | Normal cell reveal with changes array |
| `flag` | Flag toggled at position |
| `win` | All non-mine cells revealed |
| `revealedBomb` | Bomb revealed (player eliminated) |

### Cell Values (visibleGrid)
| Value | Meaning |
|-------|---------|
| -1 | Hidden |
| 0 | Revealed, empty |
| 1-8 | Revealed, adjacent mine count |
| 9 | Explosion (client animation) |
| 10 | Revealed bomb (player eliminated) |

---

## 🎮 Game State Synchronization

### Initial State Sync
When Player 2 joins, they receive the full game state:

```javascript
{
    width: 30,
    height: 16,
    bombCount: 99,
    visibleGrid: [...],  // Current revealed state
    flags: [...],        // Current flag positions
    gameOver: false,
    victory: false,
    elapsedTime: 45,
    minePositions: [...], // All mine locations
    revealedBombs: [...], // Bombs revealed by eliminated players
    players: [
        { id: "socket-1", name: "Player 1", number: 1, eliminated: false },
        { id: "socket-2", name: "Player 2", number: 2, eliminated: false }
    ]
}
```

### Action Processing
All actions are processed atomically on the server:

```javascript
// GameServer.js - Action queue ensures atomic processing
async processAction(playerId, action) {
    return this.actionQueue = this.actionQueue.then(async () => {
        return await this._internalProcessAction(playerId, action);
    });
}
```

---

## 🎨 UI Components

### Multiplayer Panel (in `index.html`)
```html
<div id="multiplayer-panel">
    <!-- Server Status -->
    <div id="mp-server-status">
        <span id="server-indicator">●</span>
        <span id="server-status-text">Checking server...</span>
    </div>

    <!-- Connect Form -->
    <div id="mp-connect">
        <input id="server-name" placeholder="Your name">
        <button id="btn-connect-server">Connect</button>
    </div>

    <!-- Host Lobby -->
    <div id="mp-host-lobby" class="hidden">
        <button id="btn-create-game">Create Game</button>
    </div>

    <!-- Guest Lobby -->
    <div id="mp-guest-lobby" class="hidden">
        <button id="btn-join-game">Join Game</button>
    </div>
</div>
```

### Partner Cursor Visualization
The partner's cursor is displayed as a CSS-styled overlay that follows their grid position in real-time.

---

## 🔒 Security Considerations

1. **Server Authority** - All game logic runs on the server; clients cannot cheat
2. **Input Validation** - Server validates all actions before processing
3. **Connection Limits** - Maximum 2 players per game session
4. **Action Gating** - Players cannot act after game ends

---

## 📊 Performance Notes

- **Socket.io Fallback** - Automatically uses WebSocket when available, falls back to polling
- **Cursor Throttling** - Consider throttling cursor updates for high-latency connections
- **State Sync Size** - Full state sync is only sent on join; incremental updates during play

---

## 🐛 Known Issues & Workarounds

1. **Race Condition on Join** - Fixed with `actionQueue` promise chain
2. **Double End-Game Text** - Fixed by tracking explosion/victory state
3. **Renderer Not Ready** - Fixed with async wait for `gridMesh` before state sync
4. **Host Elimination Ended Game** - Fixed by tracking `eliminated` status on disconnect

---

## 🚧 Future Improvements

- **Spectator Mode** - Eliminated players can watch remaining players
- **Player Score Board** - Real-time leaderboard showing player progress
- **More than 2 Players** - Support for 3+ players in a single game
- **Reconnection** - Allow eliminated players to rejoin as spectators

See `IMPLEMENTATION_PLAN_MULTIPLAYER.md` for detailed improvement ideas and roadmap.

---

## 📝 License

This project is open source. See the main repository for license details.
