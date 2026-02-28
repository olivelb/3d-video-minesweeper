/**
 * GameServerNode - Node.js wrapper for GameServer with Socket.io
 * New flow: P1 creates game with config, P2 joins
 */

import type { Server, Socket } from 'socket.io';
import { GameServer } from './GameServer.js';
import type { StatsDatabase } from './StatsDatabase.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GameServerConfig {
    width?: number;
    height?: number;
    bombCount?: number;
    maxPlayers?: number;
    noGuessMode?: boolean;
}

interface PlayerInfo {
    id: string;
    name: string;
    number: number;
    eliminated?: boolean;
}

interface RateLimitEntry {
    actions: number;
    lastReset: number;
    cursorCount: number;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createGameServer(
    io: Server,
    defaultConfig: GameServerConfig = {},
    statsDb: StatsDatabase | null = null
): { getLobbyState: () => object; resetServer: () => void } {
    let gameServer: GameServer | null = null;
    let hostSocketId: string | null = null;
    const socketToPlayer = new Map<string, PlayerInfo>();
    const MAX_LOBBY_SIZE = 8;

    // === RATE LIMITING ===
    const rateLimits = new Map<string, RateLimitEntry>();
    const RATE_LIMIT_ACTIONS = 10;
    const RATE_LIMIT_CURSORS = 30;
    const RATE_LIMIT_WINDOW = 1000;

    function checkRateLimit(socketId: string, type: 'actions' | 'cursor' = 'actions'): boolean {
        const now = Date.now();
        let limits = rateLimits.get(socketId);
        if (!limits || now - limits.lastReset > RATE_LIMIT_WINDOW) {
            limits = { actions: 0, lastReset: now, cursorCount: 0 };
            rateLimits.set(socketId, limits);
        }
        if (type === 'cursor') {
            limits.cursorCount++;
            return limits.cursorCount <= RATE_LIMIT_CURSORS;
        }
        limits.actions++;
        return limits.actions <= RATE_LIMIT_ACTIONS;
    }

    function setupBroadcasting(gs: GameServer): void {
        gs.onBroadcast = (event: string, data: unknown, excludePlayerId?: string) => {
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

    function saveGameToDatabase(): void {
        if (!gameServer || !statsDb) return;

        try {
            const gameRecord = gameServer.getGameRecord() as any;
            if (gameRecord.players.length > 0) {
                statsDb.saveGame(gameRecord);
            }
        } catch (err) {
            console.error('[GameServerNode] Error saving game to database:', err);
        }
    }

    function getLobbyState(): object {
        const players: object[] = [];
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
                maxPlayers: gameServer.maxPlayers,
                noGuessMode: gameServer.noGuessMode
            } : null
        };
    }

    io.on('connection', (socket: Socket) => {
        console.log('[GameServer] Client connected:', socket.id);

        socket.on('join', ({ playerName }: { playerName: string }) => {
            const isFirstPlayer = socketToPlayer.size === 0;
            const playerNumber = socketToPlayer.size + 1;

            if (socketToPlayer.size >= MAX_LOBBY_SIZE) {
                socket.emit('error', { message: 'Game is full' });
                socket.disconnect();
                return;
            }

            const player: PlayerInfo = {
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

            io.emit('lobbyUpdate', getLobbyState());
            console.log(`[GameServer] Player ${playerNumber} joined: ${playerName}`);
        });

        socket.on('createGame', ({ width, height, bombCount, maxPlayers, noGuessMode }: {
            width: number; height: number; bombCount: number; maxPlayers: number; noGuessMode: boolean;
        }) => {
            if (socket.id !== hostSocketId) {
                socket.emit('error', { message: 'Only host can create game' });
                return;
            }

            const MAX_WIDTH = 240;
            const MAX_HEIGHT = 120;
            const MAX_BOMBS = 4000;

            if (width > MAX_WIDTH || height > MAX_HEIGHT || bombCount > MAX_BOMBS) {
                socket.emit('error', {
                    message: `Limites dépassées: Max ${MAX_WIDTH}x${MAX_HEIGHT}, ${MAX_BOMBS} bombes`
                });
                return;
            }

            if (noGuessMode) {
                const totalCells = width * height;
                const maxDensityBombs = Math.floor(totalCells * 0.22);
                if (bombCount > maxDensityBombs) {
                    socket.emit('error', {
                        message: `Mode 'No Guess': Densité trop élevée! Max ${maxDensityBombs} bombes.`
                    });
                    return;
                }
            }

            const actualMaxPlayers = Math.min(MAX_LOBBY_SIZE, Math.max(2, parseInt(String(maxPlayers)) || 2));
            console.log(`[GameServer] Host creating game: ${width}x${height}, ${bombCount} bombs, max players: ${actualMaxPlayers}, No Guess: ${noGuessMode}`);

            gameServer = new GameServer({ width, height, bombCount, maxPlayers: actualMaxPlayers, noGuessMode });
            setupBroadcasting(gameServer);

            const hostPlayer = socketToPlayer.get(hostSocketId!)!;
            gameServer.addPlayer(hostPlayer.id, hostPlayer.name);

            gameServer.initGame();

            console.log('[GameServer] Game created, waiting for first click to place mines');

            io.emit('lobbyUpdate', getLobbyState());
            io.emit('gameCreated', {
                config: { width, height, bombCount, maxPlayers: actualMaxPlayers, noGuessMode }
            });
        });

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

            const joinResult = gameServer.addPlayer(player.id, player.name);
            if (!joinResult.success) {
                socket.emit('error', { message: joinResult.error });
                return;
            }

            console.log(`[GameServer] Player ${player.number} joined the game instance: ${player.name}`);

            io.emit('lobbyUpdate', getLobbyState());

            if (gameServer.players.size >= gameServer.maxPlayers) {
                console.log('[GameServer] Max players reached, auto-starting game!');
                startGame();
            }
        });

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

        function startGame(): void {
            if (!gameServer || gameServer.gameStarted) return;

            gameServer.gameStarted = true;
            if (gameServer.game) {
                gameServer.game.startChronometer();
            }

            io.emit('gameStart', { state: gameServer.getFullState() });
        }

        socket.on('action', async (action: { type: string; x: number; y: number }) => {
            if (!checkRateLimit(socket.id, 'actions')) {
                socket.emit('error', { message: 'Rate limit exceeded' });
                return;
            }
            console.log('[GameServer] Action received:', action, 'from socket:', socket.id);
            if (!gameServer) {
                console.log('[GameServer] No game server, ignoring action');
                return;
            }
            const player = socketToPlayer.get(socket.id);
            if (player) {
                const result = await gameServer.processAction(player.id, action as any) as any;

                if (result.playerEliminated && !result.gameEnded) {
                    console.log('[GameServer] Player eliminated:', result.playerEliminated, '- game continues');
                }

                if (result.gameEnded) {
                    console.log('[GameServer] Game ended, saving stats and will reset server in 5 seconds');

                    saveGameToDatabase();

                    setTimeout(() => {
                        resetServer();
                    }, 5000);
                }

                if (result.playerEliminated) {
                    const playerInfo = socketToPlayer.get(socket.id);
                    if (playerInfo) {
                        playerInfo.eliminated = true;
                    }
                }
            }
        });

        socket.on('cursor', ({ x, y }: { x: number; y: number }) => {
            if (!checkRateLimit(socket.id, 'cursor')) return;
            if (!gameServer) return;
            const player = socketToPlayer.get(socket.id);
            if (player) {
                gameServer.updateCursor(player.id, { x, y });
            }
        });

        socket.on('disconnect', () => {
            rateLimits.delete(socket.id);
            const player = socketToPlayer.get(socket.id);
            if (player) {
                console.log(`[GameServer] Player ${player.number} disconnected: ${player.name} (eliminated: ${player.eliminated || false})`);

                if (gameServer && !player.eliminated) {
                    gameServer.removePlayer(player.id);
                }
                socketToPlayer.delete(socket.id);

                if (socket.id === hostSocketId && !player.eliminated) {
                    console.log('[GameServer] Host disconnected unexpectedly, resetting game');
                    resetServer();
                    for (const [sid] of socketToPlayer) {
                        io.to(sid).emit('hostLeft');
                    }
                    socketToPlayer.clear();
                } else if (socket.id === hostSocketId && player.eliminated) {
                    console.log('[GameServer] Eliminated host disconnected, game continues for others');
                } else {
                    io.emit('lobbyUpdate', getLobbyState());
                }
            }
        });
    });

    let resetPending = false;

    function resetServer(): void {
        if (resetPending) return;

        resetPending = true;
        console.log('[GameServer] Full server reset (disconnecting all players)');

        gameServer = null;
        hostSocketId = null;

        io.emit('gameEnded');

        for (const [socketId] of socketToPlayer) {
            io.sockets.sockets.get(socketId)?.disconnect(true);
        }
        socketToPlayer.clear();

        setTimeout(() => { resetPending = false; }, 1000);
    }

    return { getLobbyState, resetServer };
}
