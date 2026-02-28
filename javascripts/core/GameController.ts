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

// ─── Types ──────────────────────────────────────────────────────────────────

interface GameConfig {
    width: number;
    height: number;
    bombs: number;
    useHoverHelper?: boolean;
    noGuessMode?: boolean;
    bgName?: string;
    replayMines?: any;
    initialState?: any;
    isMultiplayer?: boolean;
    flagStyle?: string;
}

interface ClickEntry {
    time: number;
    delta: number;
}

interface ClickAnalytics {
    avgDecisionTime: number;
    maxPause: number;
    clickCount: number;
    hesitations: number;
}

// ─── Class ──────────────────────────────────────────────────────────────────

/**
 * GameController - The Central Brain of the Application
 * Manages game state, initialization, and coordination between components.
 */
export class GameController {
    events: EventBus;
    scoreManager: ScoreManager;
    uiManager: any;      // UIManager — still JS, typed fully in Phase 6
    renderer: any;       // MinesweeperRenderer — still JS, typed fully in Phase 5
    game: MinesweeperGame | null;
    scoreboard: any;     // Scoreboard
    mpLeaderboard: any;  // MultiplayerLeaderboard
    mpController: MultiplayerController;

    clickTimestamps: ClickEntry[];
    isReady: boolean;
    isSpectating: boolean;
    _timerInterval: ReturnType<typeof setInterval> | null;

    constructor() {
        this.events = new EventBus();
        this.scoreManager = new ScoreManager();
        this.uiManager = null;
        this.renderer = null;
        this.game = null;
        this.scoreboard = null;
        this.mpLeaderboard = null;
        this.mpController = new MultiplayerController(this);

        this.clickTimestamps = [];

        this.isReady = false;
        this.isSpectating = false;
        this._timerInterval = null;

        // Expose for debugging/legacy access
        (window as any)._gameController = this;
    }

    init(): void {
        Logger.log('GameController', 'Initializing...');

        this.uiManager = new UIManager(null, null, this.scoreManager, this.events);
        (window as any)._minesweeperUIManager = this.uiManager;

        this.scoreboard = new Scoreboard();
        this.mpLeaderboard = new MultiplayerLeaderboard();

        const mpContainer = document.getElementById('mp-leaderboard-container');
        if (mpContainer) {
            mpContainer.appendChild(this.mpLeaderboard.getElement());
            this.mpLeaderboard.show();
        }

        this.mpController.init();

        this.bindEvents();

        this.setupTimerAndScoreUpdates();

        Logger.log('GameController', 'Initialization complete.');
    }

    bindEvents(): void {
        this.events.on(Events.GAME_START, (config: GameConfig) => {
            this.startGame(config);
        });

        this.events.on(Events.GAME_ENDED, () => {
            this.endGame();
        });

        this.events.on(Events.REQUEST_HINT, () => {
            if (networkManager.mode === 'multiplayer') return;
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

            this.game.hintMode = true;

            this.renderer.showHint(hint.x, hint.y, hint.type);
            if (hint.constraintCells?.length > 0) {
                this.renderer.highlightConstraints(hint.constraintCells);
            }

            const explanation = this._buildExplanation(hint);

            if (this.uiManager?.hudController) {
                this.uiManager.hudController.showHintExplanation(explanation, () => {
                    this.events.emit(Events.HINT_EXPLAIN_DISMISS);
                });
            }
        });

        this.events.on(Events.HINT_EXPLAIN_DISMISS, () => {
            if (!this.game) return;
            this.game.hintMode = false;
            if (this.renderer) {
                this.renderer.clearConstraintHighlights();
            }
        });

        this.events.on(Events.REQUEST_RETRY, () => {
            if (!this.game || !this.renderer) return;
            if (this.game.retryLastMove()) {
                this.renderer.resetExplosion();
                if (this.uiManager?.hudController) {
                    this.uiManager.hudController.onRetryUsed();
                }
            }
        });

        this.events.on(Events.CELL_INTERACTION, async ({ x, y, type }: { x: number; y: number; type: string }) => {
            if (!this.game || !this.renderer) return;

            this.trackClick();

            if (networkManager.mode === 'multiplayer') {
                networkManager.sendAction({ type, x, y });
            } else {
                let result: any;
                if (type === 'reveal') {
                    const isFirstClick = this.game.firstClick;
                    let cancelHandler: (() => void) | undefined;
                    if (isFirstClick) {
                        const overlay = document.getElementById('loading-overlay');
                        const details = document.getElementById('loading-details');
                        const cancelBtn = document.getElementById('cancel-gen-btn');
                        if (overlay) overlay.style.display = 'flex';
                        if (details) details.textContent = t('loading.attempt', { current: 0, max: 10000 });

                        if (cancelBtn) {
                            cancelHandler = () => { this.game!.cancelGeneration = true; };
                            cancelBtn.addEventListener('click', cancelHandler, { once: true });
                        }
                    }

                    result = await this.game.reveal(x, y, (attempt: number, max: number) => {
                        const details = document.getElementById('loading-details');
                        if (details) details.textContent = t('loading.attempt', { current: attempt, max });
                    });

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

                if (result) {
                    if (this.renderer.handleGameUpdate) {
                        this.renderer.handleGameUpdate(result);
                    }
                }
            }
        });

        this.events.on(Events.USER_INTERACTION, () => {
            this.trackClick();
        });

        this.events.on(Events.GAME_OVER, (data: any) => {

            if (this.scoreManager) {
                const finalTime = this.game!.getElapsedTime();
                const analytics = this.getClickAnalytics();
                const gameState = {
                    width: this.game!.width,
                    height: this.game!.height,
                    bombs: this.game!.bombCount,
                    time: finalTime,
                    background: this.renderer ? this.renderer.bgName : 'Unknown',
                    clickData: analytics
                };

                if (data.victory) {
                    const options = {
                        noGuessMode: this.game!.noGuessMode,
                        hintCount: this.game!.hintCount,
                        retryCount: this.game!.retryCount
                    };
                    const finalScore = this.scoreManager.calculateScore(
                        gameState.width, gameState.height, gameState.bombs, finalTime, options
                    );
                    this.game!.finalScore = finalScore;

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

                    if (networkManager.mode !== 'multiplayer' && this.uiManager?.hudController) {
                        this.uiManager.hudController.showRetryButton();
                    }
                }
            }
        });
    }

    async startGame(config: GameConfig): Promise<void> {
        Logger.log('GameController', 'Starting game...', config);

        if (this.uiManager && this.uiManager.hudController) {
            this.uiManager.hudController.reset();
            if (!config.isMultiplayer) {
                this.uiManager.hudController.show();
            }
        }

        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }

        this.game = new MinesweeperGame(config.width, config.height, config.bombs);
        this.uiManager.game = this.game;
        this.game.noGuessMode = config.noGuessMode || false;
        this.game.init();

        if (config.replayMines) {
            this.game.setMinesFromPositions(config.replayMines);
        }

        const videoElement = document.getElementById('image') as HTMLVideoElement | null;
        if (videoElement && videoElement.src) {
            if (this.uiManager) {
                videoElement.muted = this.uiManager.isMuted;
            }
            videoElement.play().catch(() => { });
        }

        this.renderer = new MinesweeperRenderer(
            this.game,
            'container',
            config.useHoverHelper,
            config.bgName,
            this.events
        );
        this.uiManager.renderer = this.renderer;

        await this.waitForRendererReady();

        if (config.flagStyle) {
            this.renderer.setFlagStyle(config.flagStyle);
        }

        if (config.initialState) {
            this.mpController.applyStateSync(config.initialState);
            if (this.scoreboard && config.initialState.scores) {
                this.scoreboard.updateScores(config.initialState.scores);
                this.scoreboard.show();
            }
        }

        if (this.uiManager?.hudController) {
            if (!config.isMultiplayer) {
                this.uiManager.hudController.showHintButton();
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

    endGame(): void {
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

        if (networkManager.socket) {
            Logger.log('GameController', 'Disconnecting multiplayer...');
            networkManager.disconnect();
        }
    }

    async waitForRendererReady(): Promise<void> {
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

    setupTimerAndScoreUpdates(): void {
        if (this._timerInterval) clearInterval(this._timerInterval);

        this._timerInterval = setInterval(() => {
            if (this.game && !this.game.gameOver && !this.game.victory && this.game.gameStartTime) {
                const elapsed = Math.floor((Date.now() - this.game.gameStartTime) / 1000);

                if (this.uiManager && this.uiManager.hudController) {
                    this.uiManager.hudController.updateTimer(elapsed);
                }

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

                if (this.uiManager && this.uiManager.hudController) {
                    const flagCount = this.game.flagCount ?? 0;
                    this.uiManager.hudController.updateMineCounter(this.game.bombCount - flagCount);
                }
            }
        }, 100);
    }

    trackClick(): void {
        const now = Date.now();
        if (this.clickTimestamps.length > 0) {
            const delta = now - this.clickTimestamps[this.clickTimestamps.length - 1].time;
            this.clickTimestamps.push({ time: now, delta });
        } else {
            this.clickTimestamps.push({ time: now, delta: 0 });
        }
    }

    getClickAnalytics(): ClickAnalytics {
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

    _buildExplanation(hint: any): string {
        const strategyKeyMap: Record<string, string> = {
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
