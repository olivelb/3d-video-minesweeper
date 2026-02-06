import { networkManager } from '../network/NetworkManager.js';
import { MultiplayerUI } from './MultiplayerUI.js';
import { MenuController } from './MenuController.js';
import { HUDController } from './HUDController.js';
import { Events } from '../core/EventBus.js';

// Configuration: Dedicated server URL (Raspberry Pi)
const DEDICATED_SERVER_URL = window.MINESWEEPER_SERVERS?.raspberryCloud || 'http://192.168.1.232:3001';

export class UIManager {
    constructor(game, renderer, scoreManager, eventBus) {
        console.log('[UIManager] Initializing...');
        this.game = game;
        this.renderer = renderer;
        this.scoreManager = scoreManager;
        this.events = eventBus;

        // UI Components
        this.menuController = new MenuController(eventBus);
        this.hudController = new HUDController(eventBus, scoreManager);

        // Core UI Elements (Leaderboard - to be extracted next)
        this.leaderboardList = document.getElementById('leaderboard-list');
        this.clearScoresBtn = document.getElementById('clear-scores-btn');

        // Initial setup
        this.bindEvents();
        this.updateLeaderboard();
        this.detectGpuTier();

        // New Multiplayer UI Component
        this.multiplayerUI = new MultiplayerUI(networkManager);
        this.multiplayerUI.onGameStart = async (state) => {
            // Force menu hide via controller
            this.menuController.hide();

            // Setup background using MenuController logic
            const bgName = await this.menuController.setupBackground();

            if (this.events) {
                this.events.emit(Events.GAME_START, {
                    width: state.width,
                    height: state.height,
                    bombs: state.bombCount,
                    useHoverHelper: true,
                    noGuessMode: false,
                    bgName: bgName,
                    replayMines: state.minePositions,
                    initialState: state,
                    flagStyle: this.menuController.currentFlagStyle,
                    isMultiplayer: true
                });
            }
        };
        this.multiplayerUI.init();
    }

    bindEvents() {
        // Clear scores
        this.clearScoresBtn?.addEventListener('click', () => this.clearScores());

        // Listen for Game End to reset Multiplayer UI
        this.events.on(Events.GAME_ENDED, () => {
            if (this.multiplayerUI && this.multiplayerUI.connectionStatus === 'online') {
                this.multiplayerUI.resetAfterGame();
            }
            this.menuController.show();
        });
    }

    clearScores() {
        if (confirm('Effacer tous les scores ?')) {
            this.scoreManager.clearAllScores();
            this.updateLeaderboard();
        }
    }

    updateLeaderboard() {
        const scores = this.scoreManager.getAllScores();

        if (!this.leaderboardList) {
            console.warn('[UIManager] leaderboard-list element not found in DOM!');
            return;
        }

        if (scores.length === 0) {
            this.leaderboardList.innerHTML = '<p class="no-scores">Aucun score enregistré</p>';
            return;
        }

        this.leaderboardList.innerHTML = scores.slice(0, 10).map((s, i) => `
            <div class="score-entry">
                <span class="rank">#${i + 1}</span>
                <span class="score-value">${s.score.toLocaleString()}</span>
                <span class="score-details">${s.width}×${s.height} • ${s.time}s</span>
            </div>
        `).join('');
    }

    detectGpuTier() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                console.log('[UIManager] GPU:', renderer);
            }
        }
    }

    setRenderer(renderer) {
        this.renderer = renderer;
        // Flag style is now handled by EventBus in Renderer, but for safety in case of late init:
        if (this.renderer && this.renderer.setFlagStyle) {
            this.renderer.setFlagStyle(this.menuController.currentFlagStyle);
        }
    }

    showMenu() {
        this.menuController.show();
        this.updateLeaderboard();

        // Let MenuController handle video pausing
    }
}
