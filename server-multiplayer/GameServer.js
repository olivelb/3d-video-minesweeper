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

        // Sanitize player name to prevent XSS and injection
        const sanitizedName = GameServer.sanitizeName(playerName);

        const playerNumber = this.players.size + 1;
        this.players.set(playerId, {
            name: sanitizedName,
            number: playerNumber,
            connected: true,
            eliminated: false,
            score: 0,
            stats: {
                cellsRevealed: 0,
                emptyCells: 0,
                numberedCells: 0,
                correctFlags: 0,
                incorrectFlags: 0,
                flagsPlaced: 0,
                joinedAt: Date.now(),
                eliminatedAt: null,
                finishedAt: null
            }
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
     * @param {object} action - { type: 'reveal'|'flag'|'chord', x, y }
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
        // Check if this player is already eliminated
        if (this.isPlayerEliminated(playerId)) {
            return { success: false, error: 'Player already eliminated' };
        }

        const player = this.players.get(playerId);
        const { type, x, y } = action;

        // === INPUT VALIDATION ===
        if (type !== 'reveal' && type !== 'flag' && type !== 'chord') {
            return { success: false, error: 'Invalid action type' };
        }
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
            return { success: false, error: 'Coordinates must be integers' };
        }
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return { success: false, error: 'Coordinates out of bounds' };
        }

        let result;
        let firstClickMines = null;

        // Handle first click - place mines safely
        if (type === 'reveal' && this.game.firstClick) {
            console.log(`[GameServer] First click at (${x}, ${y}), placing mines with safe zone`);

            // Broadcast initial generation start
            if (this.onBroadcast) {
                this.onBroadcast('generatingGrid', { attempt: 0, max: 10000 });
            }

            const placementResult = await this.game.placeMines(x, y, (attempt, max) => {
                // Throttle progress updates: Let Game.js control frequency (every 10 attempts)
                if (this.onBroadcast) {
                    this.onBroadcast('generatingGrid', { attempt, max });
                }
            });

            if (placementResult && placementResult.cancelled) {
                return { success: false, error: 'Generation cancelled' };
            }
            firstClickMines = this.game.getMinePositions();
            this.game.firstClick = false;
            this.game.startChronometer();
        }

        if (type === 'reveal') {
            result = await this.game.reveal(x, y);
            // Update player stats for revealed cells
            if (result.type === 'reveal' && result.changes) {
                this._updateRevealStats(playerId, result.changes);
            }
        } else if (type === 'flag') {
            result = this.game.toggleFlag(x, y);
            // Update player stats for flags
            if (result.type === 'flag') {
                this._updateFlagStats(playerId, x, y, result.active);
            }
        } else if (type === 'chord') {
            result = this.game.chord(x, y);
            // Update player stats for revealed cells from chord
            // (covers both successful chord AND explosion with pre-explosion reveals)
            if (result.changes && result.changes.length > 0) {
                this._updateRevealStats(playerId, result.changes);
            }
        } else {
            return { success: false, error: 'Unknown action type' };
        }

        if (!this.gameStarted && result.type !== 'none') {
            this.gameStarted = true;
        }

        // Handle explosion - player elimination in multiplayer
        if (result.type === 'explode') {
            // The mine coordinates are in result.x, result.y (may differ from
            // action x,y when the explosion comes from a chord click)
            const mineX = result.x;
            const mineY = result.y;

            // Mark the bomb as revealed (value 10) instead of explosion (value 9)
            this.game.revealBombForElimination(mineX, mineY);
            // Reset gameOver flag since game continues for other players
            this.game.gameOver = false;

            // Eliminate this player (freezes their score)
            const eliminationResult = this.eliminatePlayer(playerId);

            // Broadcast the revealed bomb to all players
            // Include any pre-explosion changes (cells revealed by chord before hitting the mine)
            const update = {
                actor: {
                    id: playerId,
                    name: player.name,
                    number: player.number
                },
                action: { type, x, y },
                result: { type: 'revealedBomb', x: mineX, y: mineY, changes: result.changes || [] },
                scores: this.getScoreboard()
            };

            if (this.onBroadcast) {
                this.onBroadcast('gameUpdate', update);
            }

            // Send playerEliminated event
            if (this.onBroadcast) {
                this.onBroadcast('playerEliminated', {
                    playerId,
                    playerName: player.name,
                    playerNumber: player.number,
                    finalScore: player.score,
                    bombX: mineX,
                    bombY: mineY,
                    remainingPlayers: eliminationResult.remainingPlayers
                });
            }

            // Check if all players eliminated (everyone loses)
            if (eliminationResult.allEliminated) {
                // Calculate flag scores at game end
                this._calculateFinalFlagScores();

                if (this.onBroadcast) {
                    this.onBroadcast('gameOver', {
                        victory: false,
                        reason: 'allEliminated',
                        finalScores: this.getScoreboard()
                    });
                }
                return { success: true, result, firstClickMines, gameEnded: true, playerEliminated: playerId };
            }

            // Game continues for remaining players - they win by completing the grid
            return { success: true, result, firstClickMines, playerEliminated: playerId };
        }

        // Broadcast the result for non-explosion actions
        const update = {
            actor: {
                id: playerId,
                name: player.name,
                number: player.number
            },
            action: { type, x, y },
            result: result,
            scores: this.getScoreboard()
        };

        if (this.onBroadcast) {
            this.onBroadcast('gameUpdate', update);
        }

        // Check for win
        if (result.type === 'win') {
            // Calculate final flag scores for all players
            this._calculateFinalFlagScores();

            // Apply winner bonus
            this._applyWinnerBonus(playerId);

            if (this.onBroadcast) {
                this.onBroadcast('gameOver', {
                    victory: true,
                    winnerId: playerId,
                    winnerName: player.name,
                    winnerNumber: player.number,
                    time: this.game.getElapsedTime(),
                    reason: 'completed',
                    finalScores: this.getScoreboard()
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
            minePositions: [], // Anti-Cheat: Never send mine positions
            revealedBombs: this.game.revealedBombs || [],
            scores: this.getScoreboard(),
            players: Array.from(this.players.entries()).map(([id, p]) => ({
                id,
                name: p.name,
                number: p.number,
                eliminated: p.eliminated || false,
                score: p.score || 0,
                stats: p.stats || {}
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

    /**
     * Get count of active (non-eliminated) players
     * @returns {number}
     */
    getActivePlayerCount() {
        let count = 0;
        for (const player of this.players.values()) {
            if (!player.eliminated) count++;
        }
        return count;
    }

    /**
     * Eliminate a player (they clicked a bomb)
     * @param {string} playerId
     * @returns {object} { eliminated: boolean, remainingPlayers: number, allEliminated?: boolean }
     */
    eliminatePlayer(playerId) {
        if (!this.players.has(playerId)) {
            return { eliminated: false, remainingPlayers: this.getActivePlayerCount() };
        }

        const player = this.players.get(playerId);
        player.eliminated = true;
        player.stats.eliminatedAt = Date.now();
        // Score is frozen at current value (no bonus)

        const remainingPlayers = this.getActivePlayerCount();

        // Check if all players eliminated - game over with no winner
        if (remainingPlayers === 0) {
            return {
                eliminated: true,
                remainingPlayers,
                allEliminated: true
            };
        }

        // Game continues - remaining players must complete the grid to win
        // No automatic winner just for being last standing
        return { eliminated: true, remainingPlayers };
    }

    /**
     * Check if a player is eliminated
     * @param {string} playerId
     * @returns {boolean}
     */
    isPlayerEliminated(playerId) {
        const player = this.players.get(playerId);
        return player ? player.eliminated : true;
    }

    // ============================================
    // SCORING SYSTEM
    // ============================================

    /**
     * Scoring constants
     */
    static SCORING = {
        EMPTY_CELL: 1,           // Points for revealing empty cell
        NUMBERED_MULTIPLIER: 1,  // Points per number value (e.g., "3" = 3 pts)
        CORRECT_FLAG: 10,        // Points for flag on mine
        INCORRECT_FLAG: -5,      // Penalty for wrong flag removed
        WIN_BONUS: 100,          // Flat bonus for winning
        TIME_BONUS_MAX: 300,     // Max time bonus (at 0 seconds)
        TIME_BONUS_DURATION: 300 // Seconds until time bonus reaches 0
    };

    /**
     * Sanitize a player name to prevent XSS and injection attacks.
     * Strips HTML tags, limits length, and removes control characters.
     * @param {string} name - Raw player name
     * @returns {string} Sanitized name
     */
    static sanitizeName(name) {
        if (typeof name !== 'string') return 'Joueur';
        // Strip HTML tags
        let clean = name.replace(/<[^>]*>/g, '');
        // Remove control characters
        clean = clean.replace(/[\x00-\x1F\x7F]/g, '');
        // Trim and limit length
        clean = clean.trim().substring(0, 30);
        // Fallback if empty
        return clean || 'Joueur';
    }

    /**
     * Update player stats when cells are revealed
     * @param {string} playerId 
     * @param {Array} changes - Array of { x, y, value } revealed cells
     */
    _updateRevealStats(playerId, changes) {
        const player = this.players.get(playerId);
        if (!player || player.eliminated) return;

        let pointsEarned = 0;

        for (const cell of changes) {
            player.stats.cellsRevealed++;

            if (cell.value === 0) {
                // Empty cell
                player.stats.emptyCells++;
                pointsEarned += GameServer.SCORING.EMPTY_CELL;
            } else if (cell.value >= 1 && cell.value <= 8) {
                // Numbered cell - points equal to number
                player.stats.numberedCells++;
                pointsEarned += cell.value * GameServer.SCORING.NUMBERED_MULTIPLIER;
            }
        }

        player.score += pointsEarned;
    }

    /**
     * Update player stats when flag is placed/removed
     * NOTE: Flag scores are NOT calculated during gameplay to prevent cheating
     * (player could tell if flag is correct by watching score change)
     * Flag scores are calculated at game end via _calculateFinalFlagScores()
     * @param {string} playerId 
     * @param {number} x 
     * @param {number} y 
     * @param {boolean} active - true if flag placed, false if removed
     */
    _updateFlagStats(playerId, x, y, active) {
        const player = this.players.get(playerId);
        if (!player || player.eliminated) return;

        // Just track the action, don't reveal if correct (would be cheating!)
        if (active) {
            player.stats.flagsPlaced++;
        } else {
            player.stats.flagsPlaced--;
        }
    }

    /**
     * Calculate final flag scores for all players at game end
     * Called when game ends (win or all eliminated)
     */
    _calculateFinalFlagScores() {
        if (!this.game) return;

        for (const [playerId, player] of this.players) {
            let correctFlags = 0;
            let incorrectFlags = 0;

            // Count flags for this calculation (check all flags on the board)
            // We need to track which player placed which flag - for now, 
            // we use the shared flag grid and divide equally or use stats
            // Actually, let's count from the current flag state
            for (let x = 0; x < this.width; x++) {
                for (let y = 0; y < this.height; y++) {
                    if (this.game.flags[x][y]) {
                        if (this.game.mines[x][y]) {
                            correctFlags++;
                        } else {
                            incorrectFlags++;
                        }
                    }
                }
            }

            // In 2-player mode, we can't easily track who placed which flag
            // For now, award flag points based on flagsPlaced ratio
            // TODO: Track individual flag ownership for proper scoring
            const totalFlagsPlaced = Array.from(this.players.values())
                .reduce((sum, p) => sum + Math.max(0, p.stats.flagsPlaced), 0);

            if (totalFlagsPlaced > 0 && player.stats.flagsPlaced > 0) {
                const playerRatio = player.stats.flagsPlaced / totalFlagsPlaced;
                const playerCorrect = Math.round(correctFlags * playerRatio);
                const playerIncorrect = Math.round(incorrectFlags * playerRatio);

                player.stats.correctFlags = playerCorrect;
                player.stats.incorrectFlags = playerIncorrect;

                const flagPoints = (playerCorrect * GameServer.SCORING.CORRECT_FLAG) +
                    (playerIncorrect * GameServer.SCORING.INCORRECT_FLAG);
                player.score += flagPoints;

                console.log(`[GameServer] Final flag scores for ${player.name}: ${playerCorrect} correct, ${playerIncorrect} incorrect = ${flagPoints} pts`);
            }
        }
    }

    /**
     * Apply winner bonus (flat + time)
     * @param {string} playerId 
     */
    _applyWinnerBonus(playerId) {
        const player = this.players.get(playerId);
        if (!player) return;

        player.stats.finishedAt = Date.now();

        // Flat win bonus
        player.score += GameServer.SCORING.WIN_BONUS;

        // Time bonus: max(0, 300 - elapsed)
        const elapsed = this.game.getElapsedTime();
        const timeBonus = Math.max(0, GameServer.SCORING.TIME_BONUS_MAX - elapsed);
        player.score += timeBonus;

        console.log(`[GameServer] Winner ${player.name}: +${GameServer.SCORING.WIN_BONUS} win + ${timeBonus} time = ${player.score} total`);
    }

    /**
     * Get current scoreboard sorted by score descending
     * @returns {Array} [{ id, name, number, score, eliminated, stats }]
     */
    getScoreboard() {
        const scoreboard = [];

        for (const [id, player] of this.players) {
            scoreboard.push({
                id,
                name: player.name,
                number: player.number,
                score: player.score,
                eliminated: player.eliminated,
                stats: {
                    cellsRevealed: player.stats.cellsRevealed,
                    correctFlags: player.stats.correctFlags,
                    incorrectFlags: player.stats.incorrectFlags
                }
            });
        }

        // Sort by score descending
        scoreboard.sort((a, b) => b.score - a.score);

        return scoreboard;
    }

    /**
     * Get complete game record for persistence
     * @returns {object} Full game data matching StatsDatabase schema
     */
    getGameRecord() {
        const scoreboard = this.getScoreboard();
        const winner = scoreboard.find(p => !p.eliminated) || null;
        const victory = this.game?.victory || false;

        return {
            gameId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            width: this.width,
            height: this.height,
            bombCount: this.bombCount,
            startedAt: this.game?.gameStartTime || Date.now(),
            endedAt: Date.now(),
            duration: this.game?.getElapsedTime() || 0,
            victory: victory,
            winner: winner ? {
                id: winner.id,
                name: winner.name,
                score: winner.score
            } : null,
            players: scoreboard.map((p, index) => ({
                id: p.id,
                name: p.name,
                number: p.number,
                score: p.score,
                eliminated: p.eliminated,
                stats: {
                    cellsRevealed: p.stats?.cellsRevealed || 0,
                    emptyCells: p.stats?.emptyCells || 0,
                    numberedCells: p.stats?.numberedCells || 0,
                    correctFlags: p.stats?.correctFlags || 0,
                    incorrectFlags: p.stats?.incorrectFlags || 0
                },
                rank: index + 1
            }))
        };
    }
}
