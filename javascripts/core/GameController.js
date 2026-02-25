import { MinesweeperGame } from '../core/Game.js';
import { MinesweeperRenderer } from '../rendering/Renderer.js';
import { ScoreManager } from '../managers/ScoreManager.js';
import { UIManager } from '../ui/UIManager.js';
import { Scoreboard } from '../ui/Scoreboard.js';
import { MultiplayerLeaderboard } from '../ui/MultiplayerLeaderboard.js';
import { networkManager } from '../network/NetworkManager.js';
import { MultiplayerController } from '../network/MultiplayerController.js';
import { EventBus, Events } from './EventBus.js';

import { Logger } from '../utils/Logger.js';
import { t } from '../i18n.js';

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
        this.mpController = new MultiplayerController(this);

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
        this.mpController.init();

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

        // Hint Explain Request (No Guess mode only)
        this.events.on(Events.REQUEST_HINT_EXPLAIN, () => {
            if (networkManager.mode === 'multiplayer') return;
            if (!this.game || !this.renderer) return;
            if (!this.game.noGuessMode) return;

            const hint = this.game.getHintWithExplanation();
            if (!hint) {
                if (this.uiManager?.hudController) {
                    this.uiManager.hudController.showNoHintFeedback();
                }
                return;
            }

            // Freeze game actions
            this.game.hintMode = true;

            // Visual: highlight hinted cell (green) + constraint cells (blue)
            this.renderer.showHint(hint.x, hint.y, hint.type);
            if (hint.constraintCells?.length > 0) {
                this.renderer.highlightConstraints(hint.constraintCells);
            }

            // Build explanation text
            const explanation = this._buildExplanation(hint);

            // Show overlay with OK button
            if (this.uiManager?.hudController) {
                this.uiManager.hudController.showHintExplanation(explanation, () => {
                    this.events.emit(Events.HINT_EXPLAIN_DISMISS);
                });
            }
        });

        // Hint Explain Dismiss
        this.events.on(Events.HINT_EXPLAIN_DISMISS, () => {
            if (!this.game) return;
            this.game.hintMode = false;
            if (this.renderer) {
                this.renderer.clearConstraintHighlights();
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
                    // Show loading overlay on first click (grid generation may take time in no-guess mode)
                    const isFirstClick = this.game.firstClick;
                    let cancelHandler;
                    if (isFirstClick) {
                        const overlay = document.getElementById('loading-overlay');
                        const details = document.getElementById('loading-details');
                        const cancelBtn = document.getElementById('cancel-gen-btn');
                        if (overlay) overlay.style.display = 'flex';
                        if (details) details.textContent = t('loading.attempt', { current: 0, max: 10000 });

                        // Wire cancel button
                        if (cancelBtn) {
                            cancelHandler = () => { this.game.cancelGeneration = true; };
                            cancelBtn.addEventListener('click', cancelHandler, { once: true });
                        }
                    }

                    result = await this.game.reveal(x, y, (attempt, max) => {
                        const details = document.getElementById('loading-details');
                        if (details) details.textContent = t('loading.attempt', { current: attempt, max });
                    });

                    // Hide loading overlay after generation completes
                    if (isFirstClick) {
                        const overlay = document.getElementById('loading-overlay');
                        const cancelBtn = document.getElementById('cancel-gen-btn');
                        if (overlay) overlay.style.display = 'none';
                        if (cancelBtn && cancelHandler) {
                            cancelBtn.removeEventListener('click', cancelHandler);
                        }
                    }
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

        // Network Events Binding (now handled via MultiplayerController)
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
            this.mpController.applyStateSync(config.initialState);
            if (this.scoreboard && config.initialState.scores) {
                this.scoreboard.updateScores(config.initialState.scores);
                this.scoreboard.show();
            }
        }

        // Show Controls
        if (this.uiManager?.hudController) {
            if (!config.isMultiplayer) {
                this.uiManager.hudController.showHintButton();
                // Show explain button only in No Guess mode
                if (config.noGuessMode) {
                    this.uiManager.hudController.showHintExplainButton();
                } else {
                    this.uiManager.hudController.hideHintExplainButton();
                }
            } else {
                this.uiManager.hudController.hideHintButton();
                this.uiManager.hudController.hideHintExplainButton();
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
     * Setup UI Timer updates
     */
    setupTimerAndScoreUpdates() {
        // Clear any existing interval to prevent stacking
        if (this._timerInterval) clearInterval(this._timerInterval);

        this._timerInterval = setInterval(() => {
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

    /**
     * Build a human-readable explanation string from a hint result.
     * Maps strategy names to i18n keys and fills in the explanation data.
     * @param {Object} hint - Result from getHintWithExplanation()
     * @returns {string}
     * @private
     */
    _buildExplanation(hint) {
        const strategyKeyMap = {
            basic: 'hint.basicSafe',
            basicDeduced: 'hint.basicDeduced',
            subset: 'hint.subset',
            gaussian: 'hint.gaussian',
            contradiction: 'hint.contradiction',
            tank: 'hint.tank',
            globalCount: 'hint.globalCount',
            godMode: 'hint.godMode'
        };

        const key = strategyKeyMap[hint.strategy] || 'hint.godMode';
        return t(key, hint.explanationData || {});
    }
}
