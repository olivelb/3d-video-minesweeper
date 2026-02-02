# 3D Minesweeper - Multiplayer Server

A dedicated server for 2-player cooperative Minesweeper.

## Requirements

- Node.js 18+
- npm

## Quick Start

1. **Copy this folder to your Raspberry Pi:**
   ```bash
   scp -r server-multiplayer/ olivier@raspberrol.local:~/minesweeper-server/
   ```

2. **SSH into your Raspberry Pi:**
   ```bash
   ssh olivier@raspberrol.local
   ```

3. **Install dependencies:**
   ```bash
   cd ~/minesweeper-server
   npm install
   ```

4. **Configure (optional):**
   ```bash
   cp .env.example .env
   nano .env  # Edit settings if needed
   ```

5. **Run the server:**
   ```bash
   npm start
   ```

## Configuration

Edit `.env` to configure:
- `PORT` - Server port (default: 3002)
- `GAME_WIDTH` - Grid width (default: 30)
- `GAME_HEIGHT` - Grid height (default: 16)
- `GAME_BOMBS` - Number of mines (default: 99)

## Run as a Service (systemd)

1. Create the service file:
   ```bash
   sudo nano /etc/systemd/system/minesweeper.service
   ```

2. Add this content:
   ```ini
   [Unit]
   Description=Minesweeper Multiplayer Server
   After=network.target

   [Service]
   Type=simple
   User=olivier
   WorkingDirectory=/home/olivier/minesweeper-server
   ExecStart=/usr/bin/node server.js
   Restart=on-failure
   RestartSec=10
   StandardOutput=syslog
   StandardError=syslog
   SyslogIdentifier=minesweeper

   [Install]
   WantedBy=multi-user.target
   ```

3. Enable and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable minesweeper
   sudo systemctl start minesweeper
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
