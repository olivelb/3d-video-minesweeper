# 📋 Multiplayer Implementation Plan & Technical Details

> **Document Version:** 2.0  
> **Branch:** `competitive-multiplayer`  
> **Purpose:** Deep technical reference for maintainers and developers
> **Mode:** Competitive elimination - click bomb = eliminated, others continue

---

## 📐 Architecture Deep Dive

### Component Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │   main.js    │◄───│  UIManager   │◄───│      index.html  │   │
│  │              │    │              │    │   (DOM + Events) │   │
│  └──────┬───────┘    └──────────────┘    └──────────────────┘   │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │    Game.js   │◄───│  Renderer.js │───►│  NetworkManager  │   │
│  │  (local/UI)  │    │   (Three.js) │    │  (Socket.io)     │   │
│  └──────────────┘    └──────────────┘    └────────┬─────────┘   │
│                                                    │             │
└────────────────────────────────────────────────────┼─────────────┘
                                                     │
                              WebSocket / Long-Polling
                                                     │
┌────────────────────────────────────────────────────┼─────────────┐
│                         SERVER (Node.js)           │             │
├────────────────────────────────────────────────────┼─────────────┤
│                                                    ▼             │
│  ┌──────────────┐    ┌──────────────────────────────────────┐   │
│  │  server.js   │───►│          GameServerNode.js           │   │
│  │  (Express)   │    │        (Socket.io Event Handler)     │   │
│  └──────────────┘    └─────────────────┬────────────────────┘   │
│                                        │                         │
│                                        ▼                         │
│                      ┌──────────────────────────────────────┐   │
│                      │           GameServer.js              │   │
│                      │      (Authoritative Game State)      │   │
│                      └─────────────────┬────────────────────┘   │
│                                        │                         │
│                                        ▼                         │
│                      ┌──────────────────────────────────────┐   │
│                      │             Game.js                  │   │
│                      │       (Headless Minesweeper)         │   │
│                      └──────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow Specifications

### 1. Connection Flow

```
PLAYER         BROWSER              NETWORK              SERVER
  │                │                    │                   │
  │──Click Connect─► │                   │                   │
  │                │──loadSocketIO()───►│                   │
  │                │◄──socket.io.js─────│                   │
  │                │                    │                   │
  │                │──io.connect()─────►│───TCP Handshake──►│
  │                │                    │◄──ACK─────────────│
  │                │◄──'connect'────────│                   │
  │                │──emit('join')─────►│──'join'──────────►│
  │                │                    │                   │──addPlayer()
  │                │◄──'welcome'────────│◄─'welcome'────────│
  │                │◄──'lobbyUpdate'────│◄─'lobbyUpdate'────│
  │◄──UI Updated───│                    │                   │
```

### 2. Game Creation Flow (Host)

```
HOST           NetworkManager          Server              GameServer
  │                 │                     │                    │
  │──createGame()──►│                     │                    │
  │                 │──emit('createGame')─►│                   │
  │                 │                     │──new GameServer()──►│
  │                 │                     │                    │──initGame()
  │                 │                     │◄─────ready─────────│
  │                 │◄──'gameCreated'─────│                    │
  │                 │◄──'lobbyUpdate'─────│                    │
  │◄──Show Waiting──│                     │                    │
```

### 3. Game Start Flow (Host Control)

```
GUEST          NetworkManager          Server              GameServer
  │                 │                     │                    │
  │──joinGame()────►│                     │                    │
  │                 │──emit('joinGame')───►│                   │
  │                 │                     │──addPlayer(PX)────►│
  │                 │                     │◄──'lobbyUpdate'────│
  │                 │◄──'lobbyUpdate'─────│──broadcast to all──│
  │◄──Update Lobby──│                     │                    │
  │                 │                     │                    │
HOST              │                     │                    │
  │──startGame()───►│                     │                    │
  │                 │──emit('startGame')──►│                   │
  │                 │                     │──gameStarted=true──►│
  │                 │                     │──getFullState()───►│
  │                 │◄──'gameStart'───────│──broadcast to all──│
  │◄──startGame()───│                     │                    │
```

### 4. Action Processing Flow

```
PLAYER         Renderer          NetworkManager        Server           GameServer
  │               │                    │                  │                  │
  │──Click Cell──►│                    │                  │                  │
  │               │──sendAction()─────►│                  │                  │
  │               │                    │──emit('action')─►│                  │
  │               │                    │                  │──processAction()─►│
  │               │                    │                  │                  │──await queue
  │               │                    │                  │                  │──game.reveal()
  │               │                    │                  │◄──{result}───────│
  │               │                    │◄─'gameUpdate'────│──broadcast───────│
  │               │◄──onGameUpdate()───│                  │                  │
  │◄──Visual Update│                   │                  │                  │
```

---

## 🧩 Module Specifications

### NetworkManager.js

**Purpose:** Abstracts Socket.io communication from the rest of the application.

**Key Properties:**
```javascript
socket: Socket        // Active Socket.io connection
playerId: string      // This client's unique ID
playerNumber: number  // 1 (host) or 2 (guest)
isHost: boolean       // True if this client created the game
_isMultiplayer: bool  // Explicit multiplayer mode flag
```

**Key Methods:**
```javascript
connectToServer(url, playerName) → Promise<WelcomeData>
createGame(width, height, bombCount) → void
joinGame() → void
sendAction({ type, x, y }) → void
sendCursor(x, y) → void
disconnect() → void
```

**Event Callbacks:**
```javascript
onConnected(data)      // Welcome received
onLobbyUpdate(state)   // Lobby state changed
onGameStart(state)     // Game begins
onGameUpdate(update)   // Action result received
onGameOver(data)       // Win/loss
onCursorUpdate(cursor) // Partner cursor moved
onMinesPlaced(mines)   // First click placed mines
onGameEnded()          // Session complete
onHostLeft()           // Host disconnected
onError(message)       // Error occurred
```

---

### GameServer.js

**Purpose:** Authoritative game state manager, decoupled from network layer.

**Key Properties:**
```javascript
game: MinesweeperGame    // The actual game instance
players: Map<id, Player> // Connected players
gameStarted: boolean     // Game in progress
actionQueue: Promise     // Serializes action processing
```

**Key Methods:**
```javascript
addPlayer(playerId, playerName) → { success, error?, playerNumber? }
removePlayer(playerId) → void
initGame() → void                      // Creates game, doesn't place mines
processAction(playerId, action) → Promise<Result>
getFullState() → GameState             // For late joiners
updateCursor(playerId, position) → void
```

**Broadcasting Interface:**
```javascript
// Set by GameServerNode to enable broadcasting
onBroadcast(eventName, data, excludePlayerId?)
```

---

### GameServerNode.js

**Purpose:** Wires GameServer to Socket.io events.

**Key Responsibilities:**
1. Handle socket connections/disconnections
2. Manage player-to-socket mapping
3. Route socket events to GameServer methods
4. Implement server reset logic

**Socket Event Handlers:**
```javascript
'join'       → Assign player number, add to lobby
'createGame' → Host creates GameServer with config
'joinGame'   → Guest joins, triggers game start
'action'     → Delegate to gameServer.processAction()
'cursor'     → Delegate to gameServer.updateCursor()
'disconnect' → Cleanup, potentially reset server
```

---

### Game.js (Server Version)

**Purpose:** Headless minesweeper logic that runs on Node.js.

**Key Differences from Client:**
- Uses mock `localStorage` for Node.js environment
- No DOM dependencies
- Environment detection via `isBrowser`

**Key Methods:**
```javascript
init()                    // Reset game state
placeMines(x, y)          // Async, respects safe zone
reveal(x, y)              // Returns { type, changes }
toggleFlag(x, y)          // Returns { type, x, y, active }
checkWin()                // Boolean
getMinePositions()        // For state sync
setMinesFromPositions()   // For replays
```

---

## 🔒 Concurrency & Race Condition Prevention

### Problem: Simultaneous Actions
Two players clicking at the same time could cause inconsistent state.

### Solution: Action Queue
```javascript
// GameServer.js
this.actionQueue = Promise.resolve();

async processAction(playerId, action) {
    return this.actionQueue = this.actionQueue.then(async () => {
        return await this._internalProcessAction(playerId, action);
    }).catch(err => {
        console.error('[GameServer] Error:', err);
        return { success: false, error: err.message };
    });
}
```

This ensures:
1. Each action completes before the next starts
2. No partial state updates
3. Consistent game state across all clients

---

### Problem: State Sync Before Renderer Ready
Clients could receive state sync before `gridMesh` is initialized.

### Solution: Async Wait Pattern
```javascript
// main.js - startGame()
await new Promise(resolve => {
    const checkReady = () => {
        if (renderer && renderer.gridMesh) {
            resolve();
        } else {
            setTimeout(checkReady, 50);
        }
    };
    checkReady();
});

// Now safe to apply state
if (initialState) {
    applyStateSync(initialState);
}
```

---

## 🔧 Configuration Options

### Server Environment Variables

```bash
PORT=3001                    # Server port
GAME_WIDTH=30               # Default grid width
GAME_HEIGHT=16              # Default grid height
GAME_BOMBS=99               # Default bomb count
NODE_ENV=production         # Environment mode
```

### Client Configuration

```javascript
// In index.html
window.MINESWEEPER_SERVERS = {
    raspberryCloud: 'https://your-tunnel.trycloudflare.com'
};

// In UIManager.js
const DEDICATED_SERVER_URL = 
    window.MINESWEEPER_SERVERS?.raspberryCloud || 
    'http://192.168.1.232:3001';
```

---

## 🧪 Testing Considerations

### Manual Testing Checklist

- [ ] Host creates game, guest joins
- [ ] First click places mines for both players
- [ ] Actions sync correctly (reveal, flag)
- [ ] Partner cursor visible
- [ ] Win condition triggers for both
- [ ] Loss condition triggers for both
- [ ] Host disconnect resets guest
- [ ] Guest disconnect doesn't affect host
- [ ] Server reset after game end
- [ ] Reconnection after server restart

### Automated Testing Ideas

1. **Unit Tests**
   - GameServer action processing
   - Game.js reveal/flag logic
   - Action queue serialization

2. **Integration Tests**
   - Multiple Socket.io connections
   - State synchronization
   - Concurrent action handling

3. **E2E Tests**
   - Full game flow with two browsers
   - Disconnect/reconnect scenarios

---

## 📈 Performance Metrics

### Observed Latencies (LAN)

| Action | Typical Latency |
|--------|-----------------|
| Connection | 50-150ms |
| Action Round-trip | 10-30ms |
| Cursor Update | 5-15ms |
| State Sync | 20-50ms |

### Server Resource Usage (Raspberry Pi 3)

- **Memory:** ~50MB for Node.js process
- **CPU:** <5% idle, spikes to ~15% during action processing
- **Network:** <1KB/s during active play

---

## 🐛 Debugging Tips

### Enable Verbose Logging

```javascript
// GameServerNode.js
console.log('[GameServer] Action received:', action, 'from:', socket.id);
console.log('[GameServer] Action result:', result);

// main.js
console.log('[Main] gameUpdate received:', update);
console.log('[Main] Processing result type:', result.type);
```

### Common Issues

1. **"No game server, ignoring action"**
   - Game hasn't been created yet
   - Check host created game before guest joined

2. **"Invalid player"**
   - Socket ID doesn't match registered players
   - Check player joining flow

3. **Visual desync between players**
   - Usually fixed by action queue
   - Check state sync on join

4. **Partner cursor not visible**
   - Ensure `networkManager.mode` returns truthy
   - Check CSS for `.partner-cursor`

---

## 🚀 Deployment Guide

### Option 1: PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start using ecosystem file
pm2 start ecosystem.config.cjs

# Save process list for auto-restart
pm2 save
pm2 startup
```

### Option 2: Cloudflare Tunnel

```bash
# Install cloudflared
# https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

# Quick tunnel (temporary URL)
cloudflared tunnel --url http://localhost:3001

# Save the generated URL to your client config
```

### Option 3: Docker (Future)

```dockerfile
# Future Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server-multiplayer/package*.json ./
RUN npm ci --production
COPY server-multiplayer/ ./
EXPOSE 3001
CMD ["node", "server.js"]
```

---

## 📝 Changelog

### v2.2 (Current)
- **Performance Optimization**: Gaussian Elimination solver for faster grid generation.
- **Generation Feedback**: Live progress modal for slow generations on Raspberry Pi.
- **Improved Stability**: Throttled event loop yielding to prevent UI freezes.

### v2.1
- **Host-defined max players (2-8)**
- **Manual Game Start**: Host can start whenever ≥2 players are present
- **MultiplayerUI Component**: Improved modularity and UI stability
- **Lobby Styling**: Better synchronization and player list display

### v2.0
- **Competitive mode with player elimination**
- Click a bomb = eliminated, other players continue
- Revealed bombs visible to all (cell value 10)
- No auto-win: last player must complete grid
- `playerEliminated` event for notifications
- Host elimination no longer ends game for others

### v1.0
---

*Document maintained by the 3D Minesweeper team*
