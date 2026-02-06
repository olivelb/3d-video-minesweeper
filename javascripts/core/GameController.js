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

        // Setup Network Callbacks (Moved from main.js)
        this.setupNetworkCallbacks();

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
                this.renderer.resetExplosion();
                if (this.uiManager?.hudController) {
                    this.uiManager.hudController.onRetryUsed();
                }
            }
        });

        // Analytics Interaction
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
                }
            }
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

        // Set flag style if provided
        if (config.flagStyle) {
            this.renderer.setFlagStyle(config.flagStyle);
        }

        // Wait for Renderer Readiness (The Fix for setTimeout)
        await this.waitForRendererReady();

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
            this.uiManager.hudController.showHintButton();
        }

        // Setup legacy renderer interactions (to be refactored in Phase 3)
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
        if (networkManager.isConnected) {
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
     * Setup Network Callbacks
     */
    setupNetworkCallbacks() {
        networkManager.onConnected = (data) => {
            Logger.log('Network', 'Connected');
            if (this.scoreboard && data.playerId) {
                this.scoreboard.setLocalPlayer(data.playerId);
            }
        };

        networkManager.onPlayerJoined = (data) => Logger.log('Network', 'Player joined:', data);
        networkManager.onPlayerLeft = (data) => Logger.log('Network', 'Player left:', data);
        networkManager.onGameReady = (config) => Logger.log('Network', 'Game ready:', config);

        networkManager.onStateSync = async (state) => {
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
                    initialState: state
                });
            } else {
                this.applyStateSync(state);
            }

            if (state.scores && this.scoreboard) {
                this.scoreboard.updateScores(state.scores);
                this.scoreboard.show();
            }
        };

        networkManager.onGameUpdate = (update) => {
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
        };

        networkManager.onPlayerEliminated = (data) => {
            if (data.playerId === networkManager.playerId) {
                if (this.game) this.game.gameOver = true;
                if (this.renderer) this.renderer.triggerExplosion();
            } else {
                if (this.uiManager.multiplayerUI) {
                    this.uiManager.multiplayerUI.showEliminationNotification(data.playerName);
                }
            }
        };

        networkManager.onGameOver = (data) => {
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
                        // GameController.js
                        this.events.emit(Events.GAME_ENDED);
                        if (this.scoreboard) this.scoreboard.hideResults();
                    });
                }
            }, 3000);
        };

        networkManager.onMinesPlaced = (minePositions) => {
            if (this.game) this.game.setMinesFromPositions(minePositions);
        };

        networkManager.onGameEnded = () => {
            this.endGame();
        };
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
