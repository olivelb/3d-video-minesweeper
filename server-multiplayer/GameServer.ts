/**
 * GameServer - Authoritative game state manager
 * Can run in browser (P2P host) or Node.js (dedicated server)
 */

import { MinesweeperGame } from './Game.js';
import type { Cell } from '../shared/types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GameServerConfig {
    width?: number;
    height?: number;
    bombCount?: number;
    noGuessMode?: boolean;
    maxPlayers?: number;
}

interface PlayerStats {
    cellsRevealed: number;
    emptyCells: number;
    numberedCells: number;
    correctFlags: number;
    incorrectFlags: number;
    flagsPlaced: number;
    joinedAt: number;
    eliminatedAt: number | null;
    finishedAt: number | null;
}

interface Player {
    name: string;
    number: number;
    connected: boolean;
    eliminated: boolean;
    score: number;
    stats: PlayerStats;
}

interface PlayerAction {
    type: 'reveal' | 'flag' | 'chord';
    x: number;
    y: number;
}

interface ScoreboardEntry {
    id: string;
    name: string;
    number: number;
    score: number;
    eliminated: boolean;
    stats: {
        cellsRevealed: number;
        correctFlags: number;
        incorrectFlags: number;
        emptyCells?: number;
        numberedCells?: number;
    };
}

interface EliminationResult {
    eliminated: boolean;
    remainingPlayers: number;
    allEliminated?: boolean;
}

type BroadcastFn = (eventName: string, data: unknown, excludePlayerId?: string) => void;
type SendToFn = (playerId: string, eventName: string, data: unknown) => void;

// ─── Class ──────────────────────────────────────────────────────────────────

export class GameServer {
    width: number;
    height: number;
    bombCount: number;
    noGuessMode: boolean;
    game: MinesweeperGame | null;
    players: Map<string, Player>;
    maxPlayers: number;
    gameStarted: boolean;
    onBroadcast: BroadcastFn | null;
    onSendTo: SendToFn | null;
    actionQueue: Promise<unknown>;

    constructor(config: GameServerConfig = {}) {
        this.width = config.width || 30;
        this.height = config.height || 16;
        this.bombCount = config.bombCount || 99;
        this.noGuessMode = config.noGuessMode || false;

        this.game = null;
        this.players = new Map();
        this.maxPlayers = config.maxPlayers || 2;
        this.gameStarted = false;

        this.onBroadcast = null;
        this.onSendTo = null;

        this.actionQueue = Promise.resolve();
    }

    addPlayer(playerId: string, playerName: string): { success: boolean; error?: string; playerNumber?: number } {
        if (this.players.size >= this.maxPlayers) {
            return { success: false, error: 'Game is full' };
        }
        if (this.players.has(playerId)) {
            return { success: false, error: 'Already joined' };
        }

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

    removePlayer(playerId: string): void {
        if (!this.players.has(playerId)) return;

        const player = this.players.get(playerId)!;
        this.players.delete(playerId);

        if (this.onBroadcast) {
            this.onBroadcast('playerLeft', {
                playerId,
                playerName: player.name
            });
        }
    }

    initGame(): void {
        this.game = new MinesweeperGame(this.width, this.height, this.bombCount);
        this.game.noGuessMode = this.noGuessMode;
        this.game.init();
        this.gameStarted = false;

        if (this.onBroadcast) {
            this.onBroadcast('gameReady', {
                width: this.width,
                height: this.height,
                bombCount: this.bombCount
            });
        }
    }

    async processAction(playerId: string, action: PlayerAction): Promise<unknown> {
        return this.actionQueue = this.actionQueue.then(async () => {
            return await this._internalProcessAction(playerId, action);
        }).catch(err => {
            console.error('[GameServer] Error processing action:', err);
            return { success: false, error: (err as Error).message };
        });
    }

    async _internalProcessAction(playerId: string, action: PlayerAction): Promise<unknown> {
        if (!this.game) {
            return { success: false, error: 'Game not initialized' };
        }
        if (this.game.gameOver || this.game.victory) {
            return { success: false, error: 'Game already ended' };
        }
        if (!this.players.has(playerId)) {
            return { success: false, error: 'Unknown player' };
        }
        if (this.isPlayerEliminated(playerId)) {
            return { success: false, error: 'Player already eliminated' };
        }

        const player = this.players.get(playerId)!;
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

        let result: any;
        let firstClickMines: Cell[] | null = null;

        // Handle first click - place mines safely
        if (type === 'reveal' && this.game.firstClick) {
            console.log(`[GameServer] First click at (${x}, ${y}), placing mines with safe zone`);

            if (this.onBroadcast) {
                this.onBroadcast('generatingGrid', { attempt: 0, max: 10000 });
            }

            let placementResult: any;
            try {
                placementResult = await this.game.placeMines(x, y, (attempt: number, max: number) => {
                    if (this.onBroadcast) {
                        this.onBroadcast('generatingGrid', { attempt, max });
                    }
                });
            } catch (err) {
                console.error('[GameServer] Mine placement failed:', err);
                if (this.onBroadcast) {
                    this.onBroadcast('generatingGrid', { attempt: -1, max: 0, error: true });
                }
                return { success: false, error: 'Mine placement failed: ' + (err as Error).message };
            }

            if (placementResult && placementResult.cancelled) {
                if (this.onBroadcast) {
                    this.onBroadcast('generatingGrid', { attempt: -1, max: 0, error: true });
                }
                return { success: false, error: 'Generation cancelled' };
            }
            firstClickMines = this.game.getMinePositions();
            this.game.firstClick = false;
            this.game.startChronometer();
        }

        if (type === 'reveal') {
            result = await this.game.reveal(x, y);
            if (result.type === 'reveal' && result.changes) {
                this._updateRevealStats(playerId, result.changes);
            }
        } else if (type === 'flag') {
            result = this.game.toggleFlag(x, y);
            if (result.type === 'flag') {
                this._updateFlagStats(playerId, x, y, result.active);
            }
        } else if (type === 'chord') {
            result = this.game.chord(x, y);
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
            const mineX = result.x;
            const mineY = result.y;

            this.game.revealBombForElimination(mineX, mineY);
            this.game.gameOver = false;

            const eliminationResult = this.eliminatePlayer(playerId);

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

            if (eliminationResult.allEliminated) {
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
            this._calculateFinalFlagScores();
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

    getFullState(): object | null {
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
            minePositions: [],
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

    updateCursor(playerId: string, position: { x: number; y: number }): void {
        if (!this.players.has(playerId)) return;

        const player = this.players.get(playerId)!;

        if (this.onBroadcast) {
            this.onBroadcast('cursorUpdate', {
                playerId,
                playerNumber: player.number,
                x: position.x,
                y: position.y
            }, playerId);
        }
    }

    getActivePlayerCount(): number {
        let count = 0;
        for (const player of this.players.values()) {
            if (!player.eliminated) count++;
        }
        return count;
    }

    eliminatePlayer(playerId: string): EliminationResult {
        if (!this.players.has(playerId)) {
            return { eliminated: false, remainingPlayers: this.getActivePlayerCount() };
        }

        const player = this.players.get(playerId)!;
        player.eliminated = true;
        player.stats.eliminatedAt = Date.now();

        const remainingPlayers = this.getActivePlayerCount();

        if (remainingPlayers === 0) {
            return {
                eliminated: true,
                remainingPlayers,
                allEliminated: true
            };
        }

        return { eliminated: true, remainingPlayers };
    }

    isPlayerEliminated(playerId: string): boolean {
        const player = this.players.get(playerId);
        return player ? player.eliminated : true;
    }

    // ============================================
    // SCORING SYSTEM
    // ============================================

    static SCORING = {
        EMPTY_CELL: 1,
        NUMBERED_MULTIPLIER: 1,
        CORRECT_FLAG: 10,
        INCORRECT_FLAG: -5,
        WIN_BONUS: 100,
        TIME_BONUS_MAX: 300,
        TIME_BONUS_DURATION: 300
    };

    static sanitizeName(name: string): string {
        if (typeof name !== 'string') return 'Joueur';
        let clean = name.replace(/<[^>]*>/g, '');
        clean = clean.replace(/[\x00-\x1F\x7F]/g, '');
        clean = clean.trim().substring(0, 30);
        return clean || 'Joueur';
    }

    _updateRevealStats(playerId: string, changes: { x: number; y: number; value: number }[]): void {
        const player = this.players.get(playerId);
        if (!player || player.eliminated) return;

        let pointsEarned = 0;

        for (const cell of changes) {
            player.stats.cellsRevealed++;

            if (cell.value === 0) {
                player.stats.emptyCells++;
                pointsEarned += GameServer.SCORING.EMPTY_CELL;
            } else if (cell.value >= 1 && cell.value <= 8) {
                player.stats.numberedCells++;
                pointsEarned += cell.value * GameServer.SCORING.NUMBERED_MULTIPLIER;
            }
        }

        player.score += pointsEarned;
    }

    _updateFlagStats(playerId: string, x: number, y: number, active: boolean): void {
        const player = this.players.get(playerId);
        if (!player || player.eliminated) return;

        if (active) {
            player.stats.flagsPlaced++;
        } else {
            player.stats.flagsPlaced--;
        }
    }

    _calculateFinalFlagScores(): void {
        if (!this.game) return;

        for (const [playerId, player] of this.players) {
            let correctFlags = 0;
            let incorrectFlags = 0;

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

    _applyWinnerBonus(playerId: string): void {
        const player = this.players.get(playerId);
        if (!player) return;

        player.stats.finishedAt = Date.now();

        player.score += GameServer.SCORING.WIN_BONUS;

        const elapsed = this.game!.getElapsedTime();
        const timeBonus = Math.max(0, GameServer.SCORING.TIME_BONUS_MAX - elapsed);
        player.score += timeBonus;

        console.log(`[GameServer] Winner ${player.name}: +${GameServer.SCORING.WIN_BONUS} win + ${timeBonus} time = ${player.score} total`);
    }

    getScoreboard(): ScoreboardEntry[] {
        const scoreboard: ScoreboardEntry[] = [];

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

        scoreboard.sort((a, b) => b.score - a.score);
        return scoreboard;
    }

    getGameRecord(): object {
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
