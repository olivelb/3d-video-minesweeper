# 3D Minesweeper - Multiplayer Server

A dedicated server for competitive multiplayer Minesweeper with player elimination.

## Features

- **Competitive Mode** - Multiple players compete on the same board
- **Player Elimination** - Click a bomb = eliminated, others continue
- **Revealed Bombs** - Eliminated player's bomb is shown to others
- **No Auto-Win** - Last player standing must still complete the grid to win
- **Authoritative Server** - All game logic runs server-side (anti-cheat)

## Requirements

- Node.js 18+
- npm

## Quick Start

1. **Install dependencies:**
   ```bash
   cd server-multiplayer
   npm install
   ```

2. **Run the server:**
   ```bash
   npm start
   ```

Server will be available at `http://localhost:3001`

## Deployment to Raspberry Pi

Use the deployment script from the project root:

```powershell
# PowerShell (Windows)
.\.github\skills\raspberry-pi-manager\deploy.ps1
```

Or manually:

```bash
# Compress
wsl tar --exclude="node_modules" -czf deploy-multiplayer.tar.gz server-multiplayer/

# Transfer
scp -i ~/.ssh/id_minesweeper deploy-multiplayer.tar.gz olivier@raspberrol:~/minesweeper/

# Extract and restart
ssh -i ~/.ssh/id_minesweeper olivier@raspberrol "cd ~/minesweeper && tar -xzf deploy-multiplayer.tar.gz && cd server-multiplayer && npm install --production && pm2 restart minesweeper-multiplayer"
```

## Game Flow

```
1. Player 1 connects → HOST
2. Host creates game with config (width, height, bombs)
3. Player 2+ connects → GUEST
4. Guests join the game
5. First click places mines (with safe zone)
6. Players take turns revealing/flagging cells
7. Player clicks bomb → ELIMINATED (returns to menu)
8. Other players see revealed bomb + notification
9. Game continues until:
   - A player wins (all non-mine cells revealed)
   - All players eliminated
10. Server resets after 5 seconds
```

## Socket.io Events

### Client → Server
- `join` - Connect with player name
- `createGame` - Host creates game config
- `joinGame` - Guest joins the game
- `action` - Reveal or flag a cell
- `cursor` - Update cursor position

### Server → Client
- `welcome` - Connection confirmed
- `gameStart` - Game begins
- `gameUpdate` - Cell revealed/flagged
- `playerEliminated` - Player clicked a bomb
- `gameOver` - Game ended (win or all eliminated)
- `gameEnded` - Return to menu

## Configuration

Environment variables (or edit `server.js`):
- `PORT` - Server port (default: 3001)
- Default grid: 30x16 with 99 bombs

## PM2 Commands

```bash
# Status
pm2 status

# Logs
pm2 logs minesweeper-multiplayer --lines 50

# Restart
pm2 restart minesweeper-multiplayer

# Stop
pm2 stop minesweeper-multiplayer
```

4. Check status:
   ```bash
   sudo systemctl status minesweeper
   ```

5. View logs:
   ```bash
   journalctl -u minesweeper -f
   ```

## Endpoints

- `GET /health` - Server health check
- WebSocket via Socket.io for game communication

## Files

- `server.js` - Main entry point
- `GameServerNode.js` - Socket.io wrapper
- `GameServer.js` - Game state manager
- `Game.js` - Core Minesweeper game logic
- `MinesweeperSolver.js` - Solver for No-Guess mode
