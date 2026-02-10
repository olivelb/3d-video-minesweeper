import { MinesweeperGame } from '../core/Game.js';
import { MinesweeperRenderer } from '../rendering/Renderer.js';
import { ScoreManager } from '../managers/ScoreManager.js';
import { UIManager } from '../ui/UIManager.js';
import { Scoreboard } from '../ui/Scoreboard.js';
import { MultiplayerLeaderboard } from '../ui/MultiplayerLeaderboard.js';
import { networkManager } from '../network/NetworkManager.js';
import { EventBus, Events } from './EventBus.js';

import { Logger } from '../utils/Logger.js';

/**
 * GameController - The Central Brain of the Application
 * Manages game state, initialization, and coordination between components.
 */
export class GameController {
    constructor() {
        // Core Components
        this.events = new EventBus();
        this.scoreManager = new ScoreManager();
        this.uiManager = null;
        this.renderer = null;
        this.game = null;
        this.scoreboard = null;
        this.mpLeaderboard = null;

        // Analytics
        this.clickTimestamps = [];

        // Configuration
        this.isReady = false;
        this.isSpectating = false;

        // Expose for debugging/legacy access
        window._gameController = this;
    }

    /**
     * Initialize the application
     */
    init() {
        Logger.log('GameController', 'Initializing...');

        // Initialize UI Manager
        this.uiManager = new UIManager(null, null, this.scoreManager, this.events);
        window._minesweeperUIManager = this.uiManager; // Keep for legacy CSS references if any

        // Initialize Scoreboard & Leaderboard
        this.scoreboard = new Scoreboard();
        this.mpLeaderboard = new MultiplayerLeaderboard();

        const mpContainer = document.getElementById('mp-leaderboard-container');
        if (mpContainer) {
            mpContainer.appendChild(this.mpLeaderboard.getElement());
            this.mpLeaderboard.show();
        }

        // Initialize Network Manager with EventBus
        networkManager.setEventBus(this.events);

        // Bind Global Events
        this.bindEvents();

        // Start UI Timer system
        this.setupTimerAndScoreUpdates();

        Logger.log('GameController', 'Initialization complete.');
    }

    /**
     * Bind core application events
     */
    bindEvents() {
        // Game Start
        this.events.on(Events.GAME_START, (config) => {
            this.startGame(config);
        });

        // Game End (Return to Menu)
        this.events.on(Events.GAME_ENDED, () => {
            this.endGame();
        });

        // Hint Request
        this.events.on(Events.REQUEST_HINT, () => {
            if (networkManager.mode === 'multiplayer') return; // Disable hints in multiplayer
            if (!this.game || !this.renderer) return;
            const hint = this.game.getHint();
            if (hint) {
                this.renderer.showHint(hint.x, hint.y, hint.type);
            } else {
                if (this.uiManager?.hudController) {
                    this.uiManager.hudController.showNoHintFeedback();
                }
            }
        });

        // Retry Request
        this.events.on(Events.REQUEST_RETRY, () => {
            if (!this.game || !this.renderer) return;
            if (this.game.retryLastMove()) {
                this.renderer.resetExplosion();
                if (this.uiManager?.hudController) {
                    this.uiManager.hudController.onRetryUsed();
                }
            }
        });

        // Input Interaction (Decoupled)
        this.events.on(Events.CELL_INTERACTION, async ({ x, y, type }) => {
            if (!this.game || !this.renderer) return;

            // Analytics
            this.trackClick();

            if (networkManager.mode === 'multiplayer') {
                networkManager.sendAction({ type, x, y });
            } else {
                // Local Logic
                let result;
                if (type === 'reveal') {
                    result = await this.game.reveal(x, y);
                } else if (type === 'flag') {
                    result = this.game.toggleFlag(x, y);
                } else if (type === 'chord') {
                    result = this.game.chord(x, y);
                }

                // Update Visuals via Renderer
                if (result) {
                    // Reuse the existing renderer method for handling results
                    if (this.renderer.handleGameUpdate) {
                        this.renderer.handleGameUpdate(result);
                    }
                }
            }
        });

        // Analytics Interaction (Legacy/Generic)
        this.events.on(Events.USER_INTERACTION, () => {
            this.trackClick();
        });

        // Game Over Logic (Score & Analytics)
        this.events.on(Events.GAME_OVER, (data) => {

            if (this.scoreManager) {
                const finalTime = this.game.getElapsedTime();
                const analytics = this.getClickAnalytics();
                const gameState = {
                    width: this.game.width,
                    height: this.game.height,
                    bombs: this.game.bombCount,
                    time: finalTime,
                    background: this.renderer ? this.renderer.bgName : 'Unknown',
                    clickData: analytics
                };

                if (data.victory) {
                    const options = {
                        noGuessMode: this.game.noGuessMode,
                        hintCount: this.game.hintCount,
                        retryCount: this.game.retryCount
                    };
                    const finalScore = this.scoreManager.calculateScore(
                        gameState.width, gameState.height, gameState.bombs, finalTime, options
                    );
                    this.game.finalScore = finalScore;

                    this.scoreManager.saveScore({
                        ...gameState,
                        score: finalScore,
                        noGuessMode: options.noGuessMode,
                        hintCount: options.hintCount,
                        retryCount: options.retryCount
                    });

                    this.scoreManager.trackGameEvent({
                        type: 'win',
                        ...gameState
                    });
                } else {
                    this.scoreManager.trackGameEvent({
                        type: 'loss',
                        ...gameState
                    });

                    // Show retry button only in solo mode
                    if (networkManager.mode !== 'multiplayer' && this.uiManager?.hudController) {
                        this.uiManager.hudController.showRetryButton();
                    }
                }
            }
        });

        // =================================================================
        // Network Events Binding
        // =================================================================

        this.events.on(Events.MP_CONNECTED, (data) => {
            Logger.log('Network', 'Connected');
            if (this.scoreboard && data.playerId) {
                this.scoreboard.setLocalPlayer(data.playerId);
            }
        });

        this.events.on(Events.NET_PLAYER_JOINED, (data) => Logger.log('Network', 'Player joined:', data));
        this.events.on(Events.NET_PLAYER_LEFT, (data) => Logger.log('Network', 'Player left:', data));
        this.events.on(Events.NET_GAME_READY, (config) => Logger.log('Network', 'Game ready:', config));

        this.events.on(Events.MP_STATE_SYNC, async (state) => {
            if (!this.game) {
                // Join running game
                this.startGame({
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

            if (state.scores && this.scoreboard) {
                this.scoreboard.updateScores(state.scores);
                this.scoreboard.show();
            }
        });



        this.events.on(Events.NET_GAME_UPDATE, (update) => {
            if (!this.game || !this.renderer) return;

            const result = update.result;
            if (result.type === 'reveal' || result.type === 'win') {
                result.changes.forEach(c => {
                    this.game.visibleGrid[c.x][c.y] = c.value;
                    this.renderer.updateCellVisual(c.x, c.y, c.value);
                });
                if (result.type === 'win' && !this.game.victory) {
                    this.game.victory = true;
                    this.renderer.triggerWin();
                }
            } else if (result.type === 'revealedBomb') {
                // Apply any pre-explosion reveals (e.g., chord revealed safe cells before hitting a mine)
                if (result.changes && result.changes.length > 0) {
                    result.changes.forEach(c => {
                        this.game.visibleGrid[c.x][c.y] = c.value;
                        this.renderer.updateCellVisual(c.x, c.y, c.value);
                    });
                }
                this.game.visibleGrid[result.x][result.y] = 10;
                this.renderer.updateCellVisual(result.x, result.y, 10);
            } else if (result.type === 'explode' && !this.game.gameOver) {
                this.game.gameOver = true;
                this.game.visibleGrid[update.action.x][update.action.y] = 9;
                this.renderer.triggerExplosion();
            } else if (result.type === 'flag') {
                this.game.flags[result.x][result.y] = result.active;
                this.renderer.updateFlagVisual(result.x, result.y, result.active);
            }

            if (update.scores && this.scoreboard) {
                this.scoreboard.updateScores(update.scores);
            }
        });

        this.events.on(Events.NET_PLAYER_ELIMINATED, (data) => {
            if (data.playerId === networkManager.playerId) {
                if (data.remainingPlayers > 0) {
                    Logger.log('GameController', 'Local player eliminated. Playing sequence before Spectator Mode.');

                    // 1. Play immediate elimination effect (visuals only)
                    if (this.renderer) {
                        this.renderer.playEliminationSequence(data.bombX, data.bombY);
                    }

                    // 2. Wait 3 seconds, THEN enter Spectator Mode
                    setTimeout(() => {
                        this.isSpectating = true;
                        if (this.game) this.game.isSpectating = true;

                        // Spectator mode visuals (fog, dim lights)
                        if (this.renderer) {
                            this.renderer.enableGhostMode();
                            // We don't call triggerExplosion(true) anymore because we handled the "death" visually already
                        }

                        this.events.emit(Events.SPECTATOR_MODE_START);
                    }, 3000);

                } else {
                    Logger.log('GameController', 'Local player was the last one eliminated. Normal Game Over.');
                    // If last player, standard game over flow handles it
                }
            } else {
                if (this.uiManager.multiplayerUI) {
                    this.uiManager.multiplayerUI.showEliminationNotification(data.playerName);
                }

                // Show the bomb that killed them (if we can see it)
                if (this.renderer) {
                    // data.bombX/Y are passed from server
                    this.renderer.updateCellVisual(data.bombX, data.bombY, 10); // 10 = Revealed Bomb
                }
            }
        });

        this.events.on(Events.NET_GAME_OVER, (data) => {
            if (!this.game) return;

            if (data.victory) {
                if (!this.game.victory) {
                    this.game.victory = true;
                    this.renderer.triggerWin();
                }
            } else if (!data.victory && !this.game.gameOver) {
                this.game.gameOver = true;
                this.renderer.triggerExplosion();
            }

            setTimeout(() => {
                if (this.scoreboard && data.finalScores) {
                    this.scoreboard.hide();
                    this.scoreboard.showResults(data, () => {
                        this.events.emit(Events.GAME_ENDED);
                        if (this.scoreboard) this.scoreboard.hideResults();
                    });
                }
            }, 3000);
        });

        this.events.on(Events.NET_MINES_PLACED, (minePositions) => {
            if (this.game) this.game.setMinesFromPositions(minePositions);
        });
    }

    /**
     * Start a new game session
     * @param {Object} config - Game configuration
     */
    async startGame(config) {
        Logger.log('GameController', 'Starting game...', config);

        // Reset UI via HUD Controller (Only for Solo Mode)
        if (this.uiManager && this.uiManager.hudController) {
            this.uiManager.hudController.reset();
            if (!config.isMultiplayer) {
                this.uiManager.hudController.show();
            }
        }

        // Clean up existing renderer if any
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }

        // Initialize Game Logic
        this.game = new MinesweeperGame(config.width, config.height, config.bombs);
        this.uiManager.game = this.game; // Update UIManager reference
        this.game.noGuessMode = config.noGuessMode;
        this.game.init();

        if (config.replayMines) {
            this.game.setMinesFromPositions(config.replayMines);
        }

        // Setup Video Background audio
        const videoElement = document.getElementById('image');
        if (videoElement && videoElement.src) {
            if (this.uiManager) {
                videoElement.muted = this.uiManager.isMuted;
            }
            videoElement.play().catch(() => { });
        }

        // Initialize Renderer
        this.renderer = new MinesweeperRenderer(
            this.game,
            'container',
            config.useHoverHelper,
            config.bgName,
            this.events
        );
        this.uiManager.renderer = this.renderer; // Update reference

        // Wait for Renderer Readiness (The Fix for setTimeout)
        await this.waitForRendererReady();

        // Set flag style if provided (must be after renderer is ready so flagManager exists)
        if (config.flagStyle) {
            this.renderer.setFlagStyle(config.flagStyle);
        }

        // Apply initial state if provided (Multiplayer Join)
        if (config.initialState) {
            this.applyStateSync(config.initialState);
            if (this.scoreboard && config.initialState.scores) {
                this.scoreboard.updateScores(config.initialState.scores);
                this.scoreboard.show();
            }
        }

        // Show Controls
        if (this.uiManager?.hudController) {
            if (!config.isMultiplayer) {
                this.uiManager.hudController.showHintButton();
            } else {
                this.uiManager.hudController.hideHintButton();
            }
        }
    }

    /**
     * End current game session
     */
    endGame() {
        Logger.log('GameController', 'Ending game...');

        if (this.uiManager?.hudController) {
            this.uiManager.hudController.hideHintButton();
            this.uiManager.hudController.hideRetryButton();
        }

        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        this.game = null;
        this.uiManager.showMenu();

        // Multiplayer cleanup
        if (networkManager.socket) {
            Logger.log('GameController', 'Disconnecting multiplayer...');
            networkManager.disconnect();
            // UI reset is handled by UIManager listening to GAME_ENDED
        }
    }

    /**
     * Wait for renderer to be fully initialized
     */
    async waitForRendererReady() {
        if (!this.renderer) return;

        return new Promise(resolve => {
            const checkReady = () => {
                if (this.renderer && this.renderer.gridMesh) {
                    resolve();
                } else {
                    requestAnimationFrame(checkReady);
                }
            };
            checkReady();
        });
    }

    /**
     * Apply full state sync (Multiplayer)
     */
    applyStateSync(state) {
        if (!this.game || !state.grid) return;
        Logger.log('GameController', 'Syncing state...');

        // Restore grid
        for (let x = 0; x < this.game.width; x++) {
            for (let y = 0; y < this.game.height; y++) {
                const cellValue = state.grid[x][y];
                // Only update if revealed
                if (cellValue !== -1 && cellValue !== 9) {
                    this.game.visibleGrid[x][y] = cellValue;
                    if (this.renderer) this.renderer.updateCellVisual(x, y, cellValue);
                }
                // Flags
                if (state.flags && state.flags[x][y]) {
                    this.game.flags[x][y] = true;
                    if (this.renderer) this.renderer.updateFlagVisual(x, y, true);
                }
            }
        }
        // Bombs/Mines if provided
        if (state.minePositions) {
            this.game.setMinesFromPositions(state.minePositions);
        }
    }

    /**
     * Setup UI Timer updates
     */
    setupTimerAndScoreUpdates() {
        setInterval(() => {
            if (this.game && !this.game.gameOver && !this.game.victory && this.game.gameStartTime) {
                const elapsed = Math.floor((Date.now() - this.game.gameStartTime) / 1000);

                if (this.uiManager && this.uiManager.hudController) {
                    this.uiManager.hudController.updateTimer(elapsed);
                }

                // Update score
                if (this.scoreManager) {
                    const currentScore = this.scoreManager.calculateScore(
                        this.game.width,
                        this.game.height,
                        this.game.bombCount,
                        elapsed,
                        {
                            noGuessMode: this.game.noGuessMode,
                            hintCount: this.game.hintCount,
                            retryCount: this.game.retryCount
                        }
                    );

                    if (this.uiManager && this.uiManager.hudController) {
                        this.uiManager.hudController.updateScore(currentScore);
                    }
                }

                // Update mine counter (use tracked flagCount — no grid iteration)
                if (this.uiManager && this.uiManager.hudController) {
                    const flagCount = this.game.flagCount ?? 0;
                    this.uiManager.hudController.updateMineCounter(this.game.bombCount - flagCount);
                }
            }
        }, 100);
    }

    /**
     * Track a click event for analytics
     */
    trackClick() {
        const now = Date.now();
        if (this.clickTimestamps.length > 0) {
            const delta = now - this.clickTimestamps[this.clickTimestamps.length - 1].time;
            this.clickTimestamps.push({ time: now, delta: delta });
        } else {
            this.clickTimestamps.push({ time: now, delta: 0 });
        }
    }

    /**
     * Calculate click timing analytics
     * @returns {Object} Click timing metrics
     */
    getClickAnalytics() {
        if (this.clickTimestamps.length === 0) {
            return { avgDecisionTime: 0, maxPause: 0, clickCount: 0, hesitations: 0 };
        }

        const deltas = this.clickTimestamps.map(c => c.delta);
        const avgDecisionTime = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
        const maxPause = Math.max(...deltas);
        const hesitations = deltas.filter(d => d > 5000).length;

        return {
            avgDecisionTime,
            maxPause,
            clickCount: this.clickTimestamps.length,
            hesitations
        };
    }
}
