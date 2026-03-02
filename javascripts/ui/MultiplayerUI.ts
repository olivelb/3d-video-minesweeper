import { Logger } from '../utils/Logger.js';
import { Events } from '../core/EventBus.js';
import type { EventBus } from '../core/EventBus.js';
import { t } from '../i18n.js';

declare const window: Window & { MINESWEEPER_SERVERS?: { raspberryCloud?: string } };

const DEFAULT_SERVER_URL = (window as any).MINESWEEPER_SERVERS?.raspberryCloud || 'http://your-pi-ip:3001';
const CUSTOM_URL_KEY = 'minesweeper_custom_server_url';

export const ConnectionStatus = {
    CHECKING: 'checking',
    ONLINE: 'online',
    OFFLINE: 'offline'
} as const;

export class MultiplayerUI {
    networkManager: any;
    events: EventBus;
    dedicatedServerUrl: string | null;
    connectionStatus: string;
    _eventHandlers: { event: string; callback: (...args: any[]) => void }[];

    serverIndicator: HTMLElement | null;
    serverStatusText: HTMLElement | null;
    connectBtn: HTMLButtonElement | null;
    createBtn: HTMLButtonElement | null;
    joinBtn: HTMLButtonElement | null;

    onGameStart: ((state: any) => Promise<void>) | null;

    configToggle: HTMLElement | null;
    configPanel: HTMLElement | null;
    customUrlInput: HTMLInputElement | null;
    saveConfigBtn: HTMLElement | null;
    resetConfigBtn: HTMLElement | null;

    constructor(networkManager: any, eventBus: EventBus) {
        this.networkManager = networkManager;
        this.events = eventBus;
        this.dedicatedServerUrl = null;
        this.connectionStatus = ConnectionStatus.OFFLINE;
        this._eventHandlers = [];

        this.serverIndicator = document.getElementById('server-indicator');
        this.serverStatusText = document.getElementById('server-status-text');
        this.connectBtn = document.getElementById('btn-connect-server') as HTMLButtonElement | null;
        this.createBtn = document.getElementById('btn-create-game') as HTMLButtonElement | null;
        this.joinBtn = document.getElementById('btn-join-game') as HTMLButtonElement | null;

        this.onGameStart = null;

        this.configToggle = document.getElementById('mp-config-toggle');
        this.configPanel = document.getElementById('mp-config-panel');
        this.customUrlInput = document.getElementById('custom-server-url') as HTMLInputElement | null;
        this.saveConfigBtn = document.getElementById('btn-save-config');
        this.resetConfigBtn = document.getElementById('btn-reset-config');
    }

    init(): void {
        this._bindEvents();
        this.checkServerAvailability();
    }

    _bindEvents(): void {
        this.connectBtn?.addEventListener('click', () => {
            this.connectToServer();
        });

        this.createBtn?.addEventListener('click', () => {
            if (this.createBtn!.disabled) return;
            this.createBtn!.disabled = true;
            this._handleCreateGame();
        });

        document.getElementById('btn-leave-host')?.addEventListener('click', () => {
            this.leaveMultiplayer();
        });

        this.joinBtn?.addEventListener('click', () => {
            if (this.joinBtn!.disabled) return;
            this.joinBtn!.disabled = true;
            this.networkManager.joinGame();
        });

        document.getElementById('btn-leave-guest')?.addEventListener('click', () => {
            this.leaveMultiplayer();
        });

        document.getElementById('btn-cancel-host')?.addEventListener('click', () => {
            this._resetUI();
            this._showHostLobby();
        });

        document.getElementById('btn-start-multiplayer')?.addEventListener('click', () => {
            this.networkManager.startGame();
        });

        this.configToggle?.addEventListener('click', () => {
            this.configPanel?.classList.toggle('hidden');
            if (!this.configPanel?.classList.contains('hidden')) {
                if (this.customUrlInput) {
                    this.customUrlInput.value = localStorage.getItem(CUSTOM_URL_KEY) || '';
                }
            }
        });

        this.saveConfigBtn?.addEventListener('click', () => {
            const url = this.customUrlInput?.value.trim();
            if (url) {
                localStorage.setItem(CUSTOM_URL_KEY, url);
                this.configPanel?.classList.add('hidden');
                this.checkServerAvailability();
            }
        });

        this.resetConfigBtn?.addEventListener('click', () => {
            localStorage.removeItem(CUSTOM_URL_KEY);
            if (this.customUrlInput) this.customUrlInput.value = '';
            this.configPanel?.classList.add('hidden');
            this.checkServerAvailability();
        });
    }

    _handleCreateGame(): void {
        const widthInput = document.getElementById('grid-width') as HTMLInputElement | null;
        const heightInput = document.getElementById('grid-height') as HTMLInputElement | null;
        const bombInput = document.getElementById('bomb-count') as HTMLInputElement | null;
        const maxPlayersInput = document.getElementById('mp-max-players') as HTMLInputElement | null;

        const MAX_WIDTH = 220;
        const MAX_HEIGHT = 120;
        const MAX_BOMBS = 4000;

        let w = parseInt(widthInput?.value || '') || 30;
        let h = parseInt(heightInput?.value || '') || 20;
        let b = parseInt(bombInput?.value || '') || 50;

        if (w > MAX_WIDTH || h > MAX_HEIGHT || b > MAX_BOMBS) {
            alert(t('mp.serverLimit', { maxW: MAX_WIDTH, maxH: MAX_HEIGHT, maxB: MAX_BOMBS }));
            w = Math.min(w, MAX_WIDTH);
            h = Math.min(h, MAX_HEIGHT);
            b = Math.min(b, MAX_BOMBS);

            if (widthInput) widthInput.value = String(w);
            if (heightInput) heightInput.value = String(h);
            if (bombInput) bombInput.value = String(b);
            return;
        }

        const mp = parseInt(maxPlayersInput?.value || '') || 2;
        const noGuess = (document.getElementById('no-guess-mode') as HTMLInputElement)?.checked || false;

        if (noGuess) {
            const totalCells = w * h;
            const maxDensityBombs = Math.floor(totalCells * 0.22);
            if (b > maxDensityBombs) {
                alert(t('mp.densityLimit', { max: maxDensityBombs }));
                b = Math.min(b, maxDensityBombs);
                if (bombInput) bombInput.value = String(b);
                return;
            }
        }

        this.networkManager.createGame(w, h, b, mp, noGuess);
        this._showHostWaiting();
    }

    async checkServerAvailability(): Promise<boolean> {
        this._updateStatus(ConnectionStatus.CHECKING, t('mp.checking'));

        const customUrl = localStorage.getItem(CUSTOM_URL_KEY);
        const serverUrl = customUrl || DEFAULT_SERVER_URL;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(`${serverUrl}/health`, {
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (response.ok) {
                this._updateStatus(ConnectionStatus.ONLINE, t('mp.online'));
                this.dedicatedServerUrl = serverUrl;
                if (this.connectBtn) this.connectBtn.disabled = false;
                return true;
            }
            throw new Error('Server error');
        } catch (err) {
            this._updateStatus(ConnectionStatus.OFFLINE, t('mp.offline'));
            this.dedicatedServerUrl = null;
            if (this.connectBtn) this.connectBtn.disabled = true;
            return false;
        }
    }

    _updateStatus(status: string, text: string): void {
        this.connectionStatus = status;
        if (this.serverIndicator) {
            this.serverIndicator.className = status;
        }
        if (this.serverStatusText) {
            this.serverStatusText.textContent = text;
        }
    }

    async connectToServer(): Promise<any> {
        const playerName = (document.getElementById('server-name') as HTMLInputElement)?.value || t('mp.playerDefault');

        if (!this.dedicatedServerUrl) {
            alert(t('mp.unavailable'));
            return null;
        }

        try {
            this._setupNetworkHandlers();

            const welcomeData = await this.networkManager.connectToServer(
                this.dedicatedServerUrl,
                playerName
            );

            this._hideConnectPanel();

            if (this.networkManager.isHost) {
                this._showHostLobby();
            } else {
                this._showGuestLobby();
            }

            const hintBtn = document.getElementById('hint-btn');
            if (hintBtn) (hintBtn as HTMLElement).style.display = 'none';

            return welcomeData;
        } catch (err) {
            Logger.error('MultiplayerUI', 'Connection error:', err);
            alert(t('mp.connectFailed'));
            return null;
        }
    }

    _setupNetworkHandlers(): void {
        this._cleanupNetworkHandlers();

        const on = (event: string, callback: (...args: any[]) => void) => {
            this.events.on(event, callback);
            this._eventHandlers.push({ event, callback });
        };

        on(Events.NET_LOBBY_UPDATE, (lobbyState: any) => {
            Logger.log('MultiplayerUI', 'Lobby update:', lobbyState);
            this._handleLobbyUpdate(lobbyState);
        });

        on(Events.NET_GAME_CREATED, (data: any) => {
            Logger.log('MultiplayerUI', 'Game created:', data);
        });

        on(Events.NET_GAME_START, async (state: any) => {
            Logger.log('MultiplayerUI', 'Game starting:', state);
            if (this.onGameStart) {
                await this.onGameStart(state);
            }
        });

        on(Events.NET_HOST_LEFT, () => {
            alert(t('mp.hostLeft'));
            this.leaveMultiplayer();
        });

        on(Events.SPECTATOR_MODE_START, () => {
            this._showSpectatorOverlay();
        });

        on(Events.NET_GENERATING_GRID, (data: any) => {
            const overlay = document.getElementById('loading-overlay');
            if (data.error) {
                if (overlay) overlay.style.display = 'none';
                return;
            }
            if (overlay) {
                overlay.style.display = 'flex';
                const details = document.getElementById('loading-details');
                if (details) details.textContent = t('mp.generatingGrid', { attempt: data.attempt });
            }
        });

        on(Events.NET_GAME_UPDATE, () => {
            (document.getElementById('loading-overlay') as HTMLElement).style.display = 'none';
        });
        on(Events.NET_MINES_PLACED, () => {
            (document.getElementById('loading-overlay') as HTMLElement).style.display = 'none';
        });
    }

    _cleanupNetworkHandlers(): void {
        for (const { event, callback } of this._eventHandlers) {
            this.events.off(event, callback);
        }
        this._eventHandlers = [];
    }

    _showSpectatorOverlay(): void {
        if (document.getElementById('spectator-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'spectator-overlay';
        overlay.className = 'spectator-overlay';
        overlay.innerHTML = `
            <div class="spectator-content">
                <div class="spectator-status">
                    <span class="skull">💀</span>
                    <div class="status-texts">
                        <h3>${t('mp.eliminated')}</h3>
                        <p>${t('mp.spectatorMode')}</p>
                    </div>
                </div>
                <button id="btn-quit-spectator" class="quit-btn">${t('mp.spectatorLeave')}</button>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.classList.add('ghost-mode');

        document.getElementById('btn-quit-spectator')?.addEventListener('click', () => {
            overlay.remove();
            document.body.classList.remove('ghost-mode');
            this.leaveMultiplayer();
            if (this.events) {
                this.events.emit(Events.GAME_ENDED);
            }
        });
    }

    _handleLobbyUpdate(lobbyState: any): void {
        Logger.log('MultiplayerUI', 'Rendering lobby:', lobbyState);
        const { players, gameCreated, config } = lobbyState;

        const listId = this.networkManager.isHost ? 'host-player-list' : 'guest-player-list';
        this._renderPlayerList(players, listId);

        if (this.networkManager.isHost) {
            const startBtn = document.getElementById('btn-start-multiplayer');
            if (startBtn) {
                if (players.length >= 2) {
                    startBtn.classList.remove('hidden');
                } else {
                    startBtn.classList.add('hidden');
                }
            }
        }

        if (gameCreated && !this.networkManager.isHost) {
            document.getElementById('guest-waiting')?.classList.add('hidden');
            document.getElementById('guest-ready')?.classList.remove('hidden');

            const configEl = document.getElementById('guest-config');
            if (configEl && config) {
                configEl.textContent = t('mp.configSummary', { w: config.width, h: config.height, b: config.bombCount, max: config.maxPlayers });
            }
        }
    }

    _renderPlayerList(players: any[], listElementId: string): void {
        const listEl = document.getElementById(listElementId);
        if (!listEl) return;

        listEl.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            li.className = 'player-item';
            if (p.id === this.networkManager.playerId) li.classList.add('is-me');

            li.innerHTML = `
                <span class="player-number">#${p.number}</span>
                <span class="player-name">${this._escapeHtml(p.name)}</span>
                ${p.isHost ? `<span class="player-badge host">${t('mp.hostBadge')}</span>` : ''}
            `;
            listEl.appendChild(li);
        });
    }

    _escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    leaveMultiplayer(): void {
        this._cleanupNetworkHandlers();
        this.networkManager.disconnect();
        this._resetUI();
    }

    resetAfterGame(): void {
        this.leaveMultiplayer();
        const overlay = document.getElementById('spectator-overlay');
        if (overlay) overlay.remove();
        document.body.classList.remove('ghost-mode');
    }

    _resetUI(): void {
        document.getElementById('mp-host-lobby')?.classList.add('hidden');
        document.getElementById('mp-guest-lobby')?.classList.add('hidden');
        document.getElementById('mp-connect')?.classList.remove('hidden');

        if (this.createBtn) this.createBtn.disabled = false;
        if (this.joinBtn) this.joinBtn.disabled = false;

        document.getElementById('host-setup')?.classList.remove('hidden');
        document.getElementById('host-waiting')?.classList.add('hidden');
        document.getElementById('guest-waiting')?.classList.remove('hidden');
        document.getElementById('guest-ready')?.classList.add('hidden');

        const hostList = document.getElementById('host-player-list');
        if (hostList) hostList.innerHTML = '';
        const guestList = document.getElementById('guest-player-list');
        if (guestList) guestList.innerHTML = '';

        const hintBtn = document.getElementById('hint-btn');
        if (hintBtn) (hintBtn as HTMLElement).style.display = '';
    }

    _hideConnectPanel(): void {
        document.getElementById('mp-connect')?.classList.add('hidden');
    }

    _showHostLobby(): void {
        document.getElementById('mp-host-lobby')?.classList.remove('hidden');
        document.getElementById('mp-guest-lobby')?.classList.add('hidden');
        if (this.createBtn) this.createBtn.disabled = false;

        document.getElementById('host-setup')?.classList.remove('hidden');
        document.getElementById('host-waiting')?.classList.add('hidden');
    }

    _showHostWaiting(): void {
        document.getElementById('host-setup')?.classList.add('hidden');
        document.getElementById('host-waiting')?.classList.remove('hidden');
    }

    _showGuestLobby(): void {
        document.getElementById('mp-guest-lobby')?.classList.remove('hidden');
        document.getElementById('mp-host-lobby')?.classList.add('hidden');
        if (this.joinBtn) this.joinBtn.disabled = false;
    }

    showEliminationNotification(playerName: string): void {
        const notification = document.createElement('div');
        notification.className = 'elimination-notification';
        notification.innerHTML = `
            <div class="elimination-icon">💀</div>
            <div class="elimination-text">
                <span class="elimination-name">${playerName}</span>
                <span class="elimination-msg">${t('mp.eliminatedMsg')}</span>
            </div>
        `;

        notification.style.cssText = `
            position: fixed;
            top: 20%;
            left: 50%;
            transform: translateX(-50%) translateY(-20px);
            background: linear-gradient(135deg, rgba(180, 40, 40, 0.95), rgba(120, 20, 20, 0.95));
            border: 2px solid #ff4444;
            border-radius: 12px;
            padding: 20px 40px;
            display: flex;
            align-items: center;
            gap: 15px;
            z-index: 10000;
            box-shadow: 0 8px 32px rgba(255, 0, 0, 0.4), 0 0 60px rgba(255, 0, 0, 0.2);
            opacity: 0;
            animation: eliminationSlideIn 0.5s ease forwards;
            font-family: 'Arial', sans-serif;
        `;

        const icon = notification.querySelector('.elimination-icon') as HTMLElement;
        icon.style.cssText = `
            font-size: 48px;
            animation: eliminationPulse 0.5s ease infinite alternate;
        `;

        const textDiv = notification.querySelector('.elimination-text') as HTMLElement;
        textDiv.style.cssText = `
            display: flex;
            flex-direction: column;
            color: white;
        `;

        const nameSpan = notification.querySelector('.elimination-name') as HTMLElement;
        nameSpan.style.cssText = `
            font-size: 24px;
            font-weight: bold;
            color: #ffcccc;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        `;

        const msgSpan = notification.querySelector('.elimination-msg') as HTMLElement;
        msgSpan.style.cssText = `
            font-size: 18px;
            color: #ffffff;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes eliminationSlideIn {
                0% { opacity: 0; transform: translateX(-50%) translateY(-40px) scale(0.8); }
                100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
            }
            @keyframes eliminationSlideOut {
                0% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                100% { opacity: 0; transform: translateX(-50%) translateY(-40px) scale(0.8); }
            }
            @keyframes eliminationPulse {
                0% { transform: scale(1); }
                100% { transform: scale(1.1); }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'eliminationSlideOut 0.5s ease forwards';
            setTimeout(() => {
                notification.remove();
                style.remove();
            }, 500);
        }, 3000);
    }
}
