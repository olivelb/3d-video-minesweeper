/**
 * GameServerNode - Node.js wrapper for GameServer with Socket.io
 * New flow: P1 creates game with config, P2 joins
 */

import { GameServer } from './GameServer.js';

export function createGameServer(io, defaultConfig = {}) {
    let gameServer = null;
    let hostSocketId = null;
    const socketToPlayer = new Map(); // socketId -> { id, name, number }

    // Wire up broadcasting
    function setupBroadcasting(gs) {
        gs.onBroadcast = (event, data, excludePlayerId) => {
            if (excludePlayerId) {
                for (const [socketId, player] of socketToPlayer) {
                    if (player.id !== excludePlayerId) {
                        io.to(socketId).emit(event, data);
                    }
                }
            } else {
                io.emit(event, data);
            }
        };
    }

    // Helper to get lobby state
    function getLobbyState() {
        const players = [];
        for (const [socketId, player] of socketToPlayer) {
            players.push({
                id: player.id,
                name: player.name,
                number: player.number,
                isHost: socketId === hostSocketId
            });
        }
        return {
            players,
            gameCreated: gameServer !== null,
            gameStarted: gameServer?.gameStarted || false,
            config: gameServer ? {
                width: gameServer.width,
                height: gameServer.height,
                bombCount: gameServer.bombCount
            } : null
        };
    }

    io.on('connection', (socket) => {
        console.log('[GameServer] Client connected:', socket.id);

        socket.on('join', ({ playerName }) => {
            // Determine player number based on current state
            const isFirstPlayer = socketToPlayer.size === 0;
            const playerNumber = isFirstPlayer ? 1 : 2;

            if (socketToPlayer.size >= 2) {
                socket.emit('error', { message: 'Game is full' });
                socket.disconnect();
                return;
            }

            const player = {
                id: socket.id,
                name: playerName,
                number: playerNumber
            };
            socketToPlayer.set(socket.id, player);

            if (isFirstPlayer) {
                hostSocketId = socket.id;
            }

            socket.emit('welcome', {
                playerId: socket.id,
                playerNumber,
                isHost: isFirstPlayer
            });

            // Send lobby state to everyone
            io.emit('lobbyUpdate', getLobbyState());
            console.log(`[GameServer] Player ${playerNumber} joined: ${playerName}`);
        });

        // Host creates the game with config
        socket.on('createGame', ({ width, height, bombCount }) => {
            if (socket.id !== hostSocketId) {
                socket.emit('error', { message: 'Only host can create game' });
                return;
            }

            console.log(`[GameServer] Host creating game: ${width}x${height}, ${bombCount} bombs`);

            // Create game server with host's config
            gameServer = new GameServer({ width, height, bombCount });
            setupBroadcasting(gameServer);

            // Add host as player 1
            const hostPlayer = socketToPlayer.get(hostSocketId);
            gameServer.addPlayer(hostPlayer.id, hostPlayer.name);

            // Initialize game but DON'T place mines yet (wait for first click)
            gameServer.initGame();
            // Mines will be placed on first reveal action

            console.log('[GameServer] Game created, waiting for first click to place mines');

            // Notify all clients
            io.emit('lobbyUpdate', getLobbyState());
            io.emit('gameCreated', {
                config: { width, height, bombCount }
            });
        });

        // P2 joins the game
        socket.on('joinGame', () => {
            if (!gameServer) {
                socket.emit('error', { message: 'No game to join' });
                return;
            }

            const player = socketToPlayer.get(socket.id);
            if (!player || player.number !== 2) {
                socket.emit('error', { message: 'Invalid player' });
                return;
            }

            // Add P2 to game
            gameServer.addPlayer(player.id, player.name);

            console.log('[GameServer] Player 2 joined, starting game!');

            // Start the game
            gameServer.gameStarted = true;
            gameServer.game.startChronometer();

            // Send game state to all players
            io.emit('gameStart', { state: gameServer.getFullState() });
        });

        socket.on('action', async (action) => {
            console.log('[GameServer] Action received:', action, 'from socket:', socket.id);
            if (!gameServer) {
                console.log('[GameServer] No game server, ignoring action');
                return;
            }
            const player = socketToPlayer.get(socket.id);
            if (player) {
                const result = await gameServer.processAction(player.id, action);

                // If this was the first click that placed mines, send the mine positions to all
                if (result.firstClickMines) {
                    io.emit('minesPlaced', { minePositions: result.firstClickMines });
                }

                // If game ended, reset server after a delay to let clients show animation
                if (result.gameEnded) {
                    console.log('[GameServer] Game ended, will reset server in 5 seconds');
                    setTimeout(() => {
                        resetServer();
                    }, 5000);
                }
            }
        });

        socket.on('cursor', ({ x, y }) => {
            if (!gameServer) return;
            const player = socketToPlayer.get(socket.id);
            if (player) {
                gameServer.updateCursor(player.id, { x, y });
            }
        });

        socket.on('disconnect', () => {
            const player = socketToPlayer.get(socket.id);
            if (player) {
                console.log(`[GameServer] Player ${player.number} disconnected: ${player.name}`);

                if (gameServer) {
                    gameServer.removePlayer(player.id);
                }
                socketToPlayer.delete(socket.id);

                // If host disconnects, reset everything
                if (socket.id === hostSocketId) {
                    console.log('[GameServer] Host disconnected, resetting game');
                    resetServer();
                    // Disconnect remaining players
                    for (const [sid] of socketToPlayer) {
                        io.to(sid).emit('hostLeft');
                    }
                    socketToPlayer.clear();
                } else {
                    // Update lobby for remaining players
                    io.emit('lobbyUpdate', getLobbyState());
                }
            }
        });
    });

    let resetPending = false;

    // Reset server state completely
    function resetServer() {
        if (resetPending) return;
        // If already reset (no game and no players), skip
        if (!gameServer && socketToPlayer.size === 0) return;

        resetPending = true;
        console.log('[GameServer] Full server reset');

        gameServer = null;
        hostSocketId = null;
        // Disconnect all players and clear state
        for (const [sid] of socketToPlayer) {
            io.to(sid).emit('gameEnded');
        }
        socketToPlayer.clear();

        // Release lock after delay
        setTimeout(() => { resetPending = false; }, 1000);
    }

    return { getLobbyState, resetServer };
}
