/**
 * GameServerNode - Node.js wrapper for GameServer with Socket.io
 * New flow: P1 creates game with config, P2 joins
 */

import { GameServer } from './GameServer.js';

export function createGameServer(io, defaultConfig = {}, statsDb = null) {
    let gameServer = null;
    let hostSocketId = null;
    const socketToPlayer = new Map(); // socketId -> { id, name, number }
    const MAX_LOBBY_SIZE = 8;

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

    /**
     * Save game to database when it ends
     */
    function saveGameToDatabase() {
        if (!gameServer || !statsDb) return;

        try {
            const gameRecord = gameServer.getGameRecord();
            if (gameRecord.players.length > 0) {
                statsDb.saveGame(gameRecord);
            }
        } catch (err) {
            console.error('[GameServerNode] Error saving game to database:', err);
        }
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
                bombCount: gameServer.bombCount,
                maxPlayers: gameServer.maxPlayers
            } : null
        };
    }

    io.on('connection', (socket) => {
        console.log('[GameServer] Client connected:', socket.id);

        socket.on('join', ({ playerName }) => {
            // Determine player number based on current state
            const isFirstPlayer = socketToPlayer.size === 0;
            const playerNumber = socketToPlayer.size + 1;

            if (socketToPlayer.size >= MAX_LOBBY_SIZE) {
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
        socket.on('createGame', ({ width, height, bombCount, maxPlayers }) => {
            if (socket.id !== hostSocketId) {
                socket.emit('error', { message: 'Only host can create game' });
                return;
            }

            const actualMaxPlayers = Math.min(MAX_LOBBY_SIZE, Math.max(2, parseInt(maxPlayers) || 2));
            console.log(`[GameServer] Host creating game: ${width}x${height}, ${bombCount} bombs, max players: ${actualMaxPlayers}`);

            // Create game server with host's config
            gameServer = new GameServer({ width, height, bombCount, maxPlayers: actualMaxPlayers });
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
                config: { width, height, bombCount, maxPlayers: actualMaxPlayers }
            });
        });

        // Guest joins the game
        socket.on('joinGame', () => {
            if (!gameServer) {
                socket.emit('error', { message: 'No game to join' });
                return;
            }

            const player = socketToPlayer.get(socket.id);
            if (!player) {
                socket.emit('error', { message: 'Invalid player' });
                return;
            }

            // Add player to game
            const joinResult = gameServer.addPlayer(player.id, player.name);
            if (!joinResult.success) {
                socket.emit('error', { message: joinResult.error });
                return;
            }

            console.log(`[GameServer] Player ${player.number} joined the game instance: ${player.name}`);

            // Notify everyone of the new player in the game instance
            io.emit('lobbyUpdate', getLobbyState());

            // Auto-start if max players reached
            if (gameServer.players.size >= gameServer.maxPlayers) {
                console.log('[GameServer] Max players reached, auto-starting game!');
                startGame();
            }
        });

        // Host starts the game manually
        socket.on('startGame', () => {
            if (socket.id !== hostSocketId) {
                socket.emit('error', { message: 'Only host can start the game' });
                return;
            }

            if (!gameServer) {
                socket.emit('error', { message: 'Game not created' });
                return;
            }

            if (gameServer.players.size < 2) {
                socket.emit('error', { message: 'At least 2 players required' });
                return;
            }

            console.log('[GameServer] Host starting game!');
            startGame();
        });

        function startGame() {
            if (!gameServer || gameServer.gameStarted) return;

            // Start the game
            gameServer.gameStarted = true;
            if (gameServer.game) {
                gameServer.game.startChronometer();
            }

            // Send game state to all players
            io.emit('gameStart', { state: gameServer.getFullState() });
        }

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

                // If a player was eliminated (but game continues), disconnect just that player after delay
                if (result.playerEliminated && !result.gameEnded) {
                    console.log('[GameServer] Player eliminated:', result.playerEliminated, '- game continues');
                    // The eliminated player will return to menu via playerEliminated event
                    // No server reset needed - game continues for others
                }

                // If game fully ended (winner determined or all eliminated), save stats and reset server after delay
                if (result.gameEnded) {
                    console.log('[GameServer] Game ended, saving stats and will reset server in 5 seconds');

                    // Save game to database
                    saveGameToDatabase();

                    setTimeout(() => {
                        resetServer();
                    }, 5000);
                }

                // Track eliminated players so we don't reset when they disconnect
                if (result.playerEliminated) {
                    const playerInfo = socketToPlayer.get(socket.id);
                    if (playerInfo) {
                        playerInfo.eliminated = true;
                    }
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
                console.log(`[GameServer] Player ${player.number} disconnected: ${player.name} (eliminated: ${player.eliminated || false})`);

                // Only remove from game server if NOT eliminated
                // (eliminated players stay in scoreboard for final results)
                if (gameServer && !player.eliminated) {
                    gameServer.removePlayer(player.id);
                }
                socketToPlayer.delete(socket.id);

                // If host disconnects AND was NOT eliminated, reset everything
                // (eliminated players disconnecting is expected and shouldn't end the game)
                if (socket.id === hostSocketId && !player.eliminated) {
                    console.log('[GameServer] Host disconnected unexpectedly, resetting game');
                    resetServer();
                    // Disconnect remaining players
                    for (const [sid] of socketToPlayer) {
                        io.to(sid).emit('hostLeft');
                    }
                    socketToPlayer.clear();
                } else if (socket.id === hostSocketId && player.eliminated) {
                    console.log('[GameServer] Eliminated host disconnected, game continues for others');
                    // Don't reset - game continues
                } else {
                    // Update lobby for remaining players
                    io.emit('lobbyUpdate', getLobbyState());
                }
            }
        });
    });

    let resetPending = false;

    // Reset server state completely
    // Reset server game instance but KEEP players connected
    function resetServer() {
        if (resetPending) return;

        resetPending = true;
        console.log('[GameServer] Game instance reset (keeping lobby)');

        gameServer = null;
        // hostSocketId remains the same if they didn't leave

        // Notify players that game ended and lobby is open again
        io.emit('gameEnded');
        io.emit('lobbyUpdate', getLobbyState());

        // Release lock after delay
        setTimeout(() => { resetPending = false; }, 1000);
    }

    return { getLobbyState, resetServer };
}
