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

        // Queue to handle actions sequentially
        this.actionQueue = Promise.resolve();
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
        // Queue the action to ensure atomicity
        return this.actionQueue = this.actionQueue.then(async () => {
            return await this._internalProcessAction(playerId, action);
        }).catch(err => {
            console.error('[GameServer] Error processing action:', err);
            return { success: false, error: err.message };
        });
    }

    async _internalProcessAction(playerId, action) {
        if (!this.game) {
            return { success: false, error: 'Game not initialized' };
        }
        if (this.game.gameOver || this.game.victory) {
            return { success: false, error: 'Game already ended' };
        }
        if (!this.players.has(playerId)) {
            return { success: false, error: 'Unknown player' };
        }

        const player = this.players.get(playerId);
        const { type, x, y } = action;

        let result;
        let firstClickMines = null;

        // Handle first click - place mines safely
        if (type === 'reveal' && this.game.firstClick) {
            console.log(`[GameServer] First click at (${x}, ${y}), placing mines with safe zone`);
            const placementResult = await this.game.placeMines(x, y);
            if (placementResult && placementResult.cancelled) {
                return { success: false, error: 'Generation cancelled' };
            }
            firstClickMines = this.game.getMinePositions();
            this.game.firstClick = false;
            this.game.startChronometer();
        }

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
            return { success: true, result, firstClickMines, gameEnded: true };
        } else if (result.type === 'win') {
            if (this.onBroadcast) {
                this.onBroadcast('gameOver', {
                    victory: true,
                    time: this.game.getElapsedTime()
                });
            }
            return { success: true, result, firstClickMines, gameEnded: true };
        }

        return { success: true, result, firstClickMines };
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
            minePositions: this.game.getMinePositions(),
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
