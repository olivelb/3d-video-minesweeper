import { EventBus, Events } from '../core/EventBus.js';
import { networkManager } from './NetworkManager.js';
import { Logger } from '../utils/Logger.js';

/**
 * MultiplayerController
 * Handles all logic directly related to Socket.io and Multiplayer Sync.
 * Decouples networking logic from the main GameController.
 */
export class MultiplayerController {
    /**
     * @param {import('../core/GameController.js').GameController} gameController 
     */
    constructor(gameController) {
        this.gc = gameController;
        this.events = gameController.events;
    }

    init() {
        Logger.log('MultiplayerController', 'Initializing...');

        // Ensure networkManager uses the shared EventBus
        networkManager.setEventBus(this.events);

        this.bindEvents();
    }

    bindEvents() {
        this.events.on(Events.MP_CONNECTED, (data) => {
            Logger.log('Network', 'Connected');
            if (this.gc.scoreboard && data.playerId) {
                this.gc.scoreboard.setLocalPlayer(data.playerId);
            }
        });

        this.events.on(Events.NET_PLAYER_JOINED, (data) => Logger.log('Network', 'Player joined:', data));
        this.events.on(Events.NET_PLAYER_LEFT, (data) => Logger.log('Network', 'Player left:', data));
        this.events.on(Events.NET_GAME_READY, (config) => Logger.log('Network', 'Game ready:', config));

        this.events.on(Events.MP_STATE_SYNC, async (state) => {
            if (!this.gc.game) {
                // Join running game
                this.gc.startGame({
                    width: state.width,
                    height: state.height,
                    bombs: state.bombCount,
                    useHoverHelper: true,
                    noGuessMode: false,
                    bgName: 'Multiplayer',
                    replayMines: state.minePositions,
                    initialState: state,
                    isMultiplayer: true
                });
            } else {
                this.applyStateSync(state);
            }

            if (state.scores && this.gc.scoreboard) {
                this.gc.scoreboard.updateScores(state.scores);
                this.gc.scoreboard.show();
            }
        });

        this.events.on(Events.NET_GAME_UPDATE, (update) => {
            if (!this.gc.game || !this.gc.renderer) return;

            const result = update.result;
            if (result.type === 'reveal' || result.type === 'win') {
                result.changes.forEach(c => {
                    this.gc.game.visibleGrid[c.x][c.y] = c.value;
                    this.gc.renderer.updateCellVisual(c.x, c.y, c.value);
                });
                if (result.type === 'win' && !this.gc.game.victory) {
                    this.gc.game.victory = true;
                    this.gc.renderer.triggerWin();
                }
            } else if (result.type === 'revealedBomb') {
                // Apply any pre-explosion reveals
                if (result.changes && result.changes.length > 0) {
                    result.changes.forEach(c => {
                        this.gc.game.visibleGrid[c.x][c.y] = c.value;
                        this.gc.renderer.updateCellVisual(c.x, c.y, c.value);
                    });
                }
                this.gc.game.visibleGrid[result.x][result.y] = 10;

                if (!this.gc.game.flags[result.x][result.y]) {
                    this.gc.game.flags[result.x][result.y] = true;
                    this.gc.game.flagCount++;
                }
                this.gc.renderer.showDeathFlag(result.x, result.y);
            } else if (result.type === 'explode' && !this.gc.game.gameOver) {
                this.gc.game.gameOver = true;
                this.gc.game.visibleGrid[update.action.x][update.action.y] = 9;
                this.gc.renderer.triggerExplosion();
            } else if (result.type === 'flag') {
                this.gc.game.flags[result.x][result.y] = result.active;
                this.gc.renderer.updateFlagVisual(result.x, result.y, result.active);
            }

            if (update.scores && this.gc.scoreboard) {
                this.gc.scoreboard.updateScores(update.scores);
            }
        });

        this.events.on(Events.NET_PLAYER_ELIMINATED, (data) => {
            if (data.playerId === networkManager.playerId) {
                if (data.remainingPlayers > 0) {
                    Logger.log('GameController', 'Local player eliminated. Playing sequence before Spectator Mode.');

                    if (this.gc.renderer) {
                        this.gc.renderer.playEliminationSequence(data.bombX, data.bombY);
                    }

                    setTimeout(() => {
                        this.gc.isSpectating = true;
                        if (this.gc.game) this.gc.game.isSpectating = true;

                        if (this.gc.renderer) {
                            this.gc.renderer.enableGhostMode();
                        }

                        this.events.emit(Events.SPECTATOR_MODE_START);
                    }, 3000);
                }
            } else {
                if (this.gc.uiManager && this.gc.uiManager.multiplayerUI) {
                    this.gc.uiManager.multiplayerUI.showEliminationNotification(data.playerName);
                }
                if (this.gc.renderer) {
                    this.gc.renderer.showDeathFlag(data.bombX, data.bombY);
                }
            }
        });

        this.events.on(Events.NET_GAME_OVER, (data) => {
            if (!this.gc.game) return;

            if (data.victory) {
                if (!this.gc.game.victory) {
                    this.gc.game.victory = true;
                    this.gc.renderer.triggerWin();
                }
            } else if (!data.victory && !this.gc.game.gameOver) {
                this.gc.game.gameOver = true;
                this.gc.renderer.triggerExplosion();
            }

            setTimeout(() => {
                if (this.gc.scoreboard && data.finalScores) {
                    this.gc.scoreboard.hide();
                    this.gc.scoreboard.showResults(data, () => {
                        this.events.emit(Events.GAME_ENDED);
                        if (this.gc.scoreboard) this.gc.scoreboard.hideResults();
                    });
                }
            }, 3000);
        });

        this.events.on(Events.NET_MINES_PLACED, (minePositions) => {
            if (this.gc.game) this.gc.game.setMinesFromPositions(minePositions);
        });
    }

    /**
     * Apply full state sync (Multiplayer)
     * Pulled from GameController to centralize net-state updates
     */
    applyStateSync(state) {
        if (!this.gc.game || !state.grid) return;
        Logger.log('MultiplayerController', 'Syncing state...');

        for (let x = 0; x < this.gc.game.width; x++) {
            for (let y = 0; y < this.gc.game.height; y++) {
                const cellValue = state.grid[x][y];
                if (cellValue !== -1 && cellValue !== 9) {
                    this.gc.game.visibleGrid[x][y] = cellValue;
                    if (cellValue === 10) {
                        if (!this.gc.game.flags[x][y]) {
                            this.gc.game.flags[x][y] = true;
                            this.gc.game.flagCount++;
                        }
                        if (this.gc.renderer) this.gc.renderer.showDeathFlag(x, y);
                    } else {
                        if (this.gc.renderer) this.gc.renderer.updateCellVisual(x, y, cellValue);
                    }
                }

                if (state.flags && state.flags[x][y]) {
                    this.gc.game.flags[x][y] = true;
                    if (this.gc.renderer) this.gc.renderer.updateFlagVisual(x, y, true);
                }
            }
        }

        if (state.minePositions) {
            this.gc.game.setMinesFromPositions(state.minePositions);
        }
    }
}
