import { Logger } from '../utils/Logger.js';
import { networkManager } from '../network/NetworkManager.js';
import { MultiplayerUI } from './MultiplayerUI.js';
import { MenuController } from './MenuController.js';
import { HUDController } from './HUDController.js';
import { LeaderboardController } from './LeaderboardController.js';
import { Events } from '../core/EventBus.js';
import type { EventBus } from '../core/EventBus.js';
import type { ScoreManager } from '../managers/ScoreManager.js';

declare const window: Window & { MINESWEEPER_SERVERS?: { raspberryCloud?: string } };

const DEDICATED_SERVER_URL = (window as any).MINESWEEPER_SERVERS?.raspberryCloud || 'http://YOUR_SERVER_IP:3001';

export class UIManager {
    game: any;
    renderer: any;
    scoreManager: ScoreManager;
    events: EventBus;
    menuController: MenuController;
    hudController: HUDController;
    leaderboardController: LeaderboardController;
    multiplayerUI: MultiplayerUI;
    isMuted: boolean;

    constructor(game: any, renderer: any, scoreManager: ScoreManager, eventBus: EventBus) {
        Logger.log('UIManager', 'Initializing...');
        this.game = game;
        this.renderer = renderer;
        this.scoreManager = scoreManager;
        this.events = eventBus;
        this.isMuted = false;

        this.menuController = new MenuController(eventBus);
        this.hudController = new HUDController(eventBus, scoreManager);
        this.leaderboardController = new LeaderboardController(scoreManager);
        this.leaderboardController.init();

        this.bindEvents();
        this.leaderboardController.loadScores();
        this.detectGpuTier();

        this.multiplayerUI = new MultiplayerUI(networkManager, this.events);
        this.multiplayerUI.onGameStart = async (state: any) => {
            this.menuController.hide();
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

    bindEvents(): void {
        this.events.on(Events.GAME_ENDED, () => {
            if (this.multiplayerUI && this.multiplayerUI.connectionStatus === 'online') {
                this.multiplayerUI.resetAfterGame();
            }
            (document.getElementById('loading-overlay') as HTMLElement).style.display = 'none';
            this.menuController.show();
            this.leaderboardController.loadScores();
        });
    }

    detectGpuTier(): void {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
        if (gl) {
            const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                Logger.log('UIManager', 'GPU:', renderer);
            }
        }
    }

    setRenderer(renderer: any): void {
        this.renderer = renderer;
        if (this.renderer && this.renderer.setFlagStyle) {
            this.renderer.setFlagStyle(this.menuController.currentFlagStyle);
        }
    }

    showMenu(): void {
        this.menuController.show();
        this.leaderboardController.loadScores();
    }
}
