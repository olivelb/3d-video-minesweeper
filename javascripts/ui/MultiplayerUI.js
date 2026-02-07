/**
 * MultiplayerUI Module
 * 
 * Handles the multiplayer user interface elements, including
 * server connection status, lobby management, and host/guest flows.
 * 
 * @module MultiplayerUI
 */

import { Logger } from '../utils/Logger.js';
import { Events } from '../core/EventBus.js';

/**
 * Default server URL for multiplayer connections
 * @constant
 */
const DEFAULT_SERVER_URL = window.MINESWEEPER_SERVERS?.raspberryCloud || 'http://your-pi-ip:3001';
const CUSTOM_URL_KEY = 'minesweeper_custom_server_url';

/**
 * Connection status states
 * @constant
 * @enum {string}
 */
export const ConnectionStatus = {
    CHECKING: 'checking',
    ONLINE: 'online',
    OFFLINE: 'offline'
};

/**
 * Manages multiplayer UI state and interactions
 * @class
 */
export class MultiplayerUI {
    /**
     * Create a multiplayer UI manager
     * @param {Object} networkManager - Reference to the network manager
     */
    constructor(networkManager, eventBus) {
        /** @type {Object} Network manager reference */
        this.networkManager = networkManager;
        this.events = eventBus;

        /** @type {string|null} Dedicated server URL if available */
        this.dedicatedServerUrl = null;

        /** @type {string} Current connection status */
        this.connectionStatus = ConnectionStatus.OFFLINE;

        // DOM element references
        /** @type {HTMLElement|null} */
        this.serverIndicator = document.getElementById('server-indicator');
        /** @type {HTMLElement|null} */
        this.serverStatusText = document.getElementById('server-status-text');
        /** @type {HTMLElement|null} */
        this.connectBtn = document.getElementById('btn-connect-server');
        /** @type {HTMLElement|null} */
        this.createBtn = document.getElementById('btn-create-game');
        /** @type {HTMLElement|null} */
        this.joinBtn = document.getElementById('btn-join-game');

        // Callbacks
        /** @type {Function|null} Called when game should start */
        this.onGameStart = null;

        // Configuration UI references
        this.configToggle = document.getElementById('mp-config-toggle');
        this.configPanel = document.getElementById('mp-config-panel');
        this.customUrlInput = document.getElementById('custom-server-url');
        this.saveConfigBtn = document.getElementById('btn-save-config');
        this.resetConfigBtn = document.getElementById('btn-reset-config');
    }

    /**
     * Initialize multiplayer UI
     */
    init() {
        this._bindEvents();
        this.checkServerAvailability();
    }

    /**
     * Bind UI event handlers
     * @private
     */
    _bindEvents() {
        // Connect button
        this.connectBtn?.addEventListener('click', () => {
            this.connectToServer();
        });

        // Create game (host)
        this.createBtn?.addEventListener('click', () => {
            if (this.createBtn.disabled) return;
            this.createBtn.disabled = true;
            this._handleCreateGame();
        });

        // Leave host
        document.getElementById('btn-leave-host')?.addEventListener('click', () => {
            this.leaveMultiplayer();
        });

        // Join game (guest)
        this.joinBtn?.addEventListener('click', () => {
            if (this.joinBtn.disabled) return;
            this.joinBtn.disabled = true;
            this.networkManager.joinGame();
        });

        // Leave guest
        document.getElementById('btn-leave-guest')?.addEventListener('click', () => {
            this.leaveMultiplayer();
        });

        // Cancel host (before creation)
        document.getElementById('btn-cancel-host')?.addEventListener('click', () => {
            this._resetUI();
            this._showHostLobby();
        });

        // Start game (for host)
        document.getElementById('btn-start-multiplayer')?.addEventListener('click', () => {
            this.networkManager.startGame();
        });

        // Config Toggle
        this.configToggle?.addEventListener('click', () => {
            this.configPanel?.classList.toggle('hidden');
            if (!this.configPanel?.classList.contains('hidden')) {
                if (this.customUrlInput) {
                    this.customUrlInput.value = localStorage.getItem(CUSTOM_URL_KEY) || '';
                }
            }
        });

        // Save Config
        this.saveConfigBtn?.addEventListener('click', () => {
            const url = this.customUrlInput?.value.trim();
            if (url) {
                localStorage.setItem(CUSTOM_URL_KEY, url);
                this.configPanel?.classList.add('hidden');
                this.checkServerAvailability();
            }
        });

        // Reset Config
        this.resetConfigBtn?.addEventListener('click', () => {
            localStorage.removeItem(CUSTOM_URL_KEY);
            if (this.customUrlInput) this.customUrlInput.value = '';
            this.configPanel?.classList.add('hidden');
            this.checkServerAvailability();
        });
    }

    /**
     * Handle create game action
     * @private
     */
    _handleCreateGame() {
        const widthInput = document.getElementById('grid-width');
        const heightInput = document.getElementById('grid-height');
        const bombInput = document.getElementById('bomb-count');
        const maxPlayersInput = document.getElementById('mp-max-players');

        const MAX_WIDTH = 150;
        const MAX_HEIGHT = 100;
        const MAX_BOMBS = 2000;

        let w = parseInt(widthInput?.value) || 30;
        let h = parseInt(heightInput?.value) || 20;
        let b = parseInt(bombInput?.value) || 50;

        // Validation check
        if (w > MAX_WIDTH || h > MAX_HEIGHT || b > MAX_BOMBS) {
            alert(`Les dimensions maximales sont ${MAX_WIDTH}x${MAX_HEIGHT} avec ${MAX_BOMBS} bombes pour la stabilité du serveur.`);
            w = Math.min(w, MAX_WIDTH);
            h = Math.min(h, MAX_HEIGHT);
            b = Math.min(b, MAX_BOMBS);

            // Update inputs
            if (widthInput) widthInput.value = w;
            if (heightInput) heightInput.value = h;
            if (bombInput) bombInput.value = b;

            return; // Stop to let user see corrected values
        }

        const mp = parseInt(maxPlayersInput?.value) || 2;
        const noGuess = document.getElementById('no-guess-mode')?.checked || false;

        this.networkManager.createGame(w, h, b, mp, noGuess);
        this._showHostWaiting();
    }

    /**
     * Check server availability
     * @returns {Promise<boolean>} Whether server is available
     */
    async checkServerAvailability() {
        this._updateStatus(ConnectionStatus.CHECKING, 'Vérification du serveur...');

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
                this._updateStatus(ConnectionStatus.ONLINE, 'Serveur disponible');
                this.dedicatedServerUrl = serverUrl;
                if (this.connectBtn) this.connectBtn.disabled = false;
                return true;
            }
            throw new Error('Server error');
        } catch (err) {
            this._updateStatus(ConnectionStatus.OFFLINE, 'Serveur hors ligne');
            this.dedicatedServerUrl = null;
            if (this.connectBtn) this.connectBtn.disabled = true;
            return false;
        }
    }

    /**
     * Update connection status display
     * @private
     * @param {string} status - Connection status
     * @param {string} text - Status text to display
     */
    _updateStatus(status, text) {
        this.connectionStatus = status;
        if (this.serverIndicator) {
            this.serverIndicator.className = status;
        }
        if (this.serverStatusText) {
            this.serverStatusText.textContent = text;
        }
    }

    /**
     * Connect to multiplayer server
     * @returns {Promise<Object>} Connection data
     */
    async connectToServer() {
        const playerName = document.getElementById('server-name')?.value || 'Joueur';

        if (!this.dedicatedServerUrl) {
            alert('Serveur non disponible');
            return null;
        }

        try {
            // Setup handlers before connecting
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

            return welcomeData;
        } catch (err) {
            Logger.error('MultiplayerUI', 'Connection error:', err);
            alert('Connexion au serveur échouée');
            return null;
        }
    }

    /**
     * Setup network event handlers
     * @private
     */
    _setupNetworkHandlers() {
        // Lobby updates
        this.events.on(Events.NET_LOBBY_UPDATE, (lobbyState) => {
            Logger.log('MultiplayerUI', 'Lobby update:', lobbyState);
            this._handleLobbyUpdate(lobbyState);
        });

        // Game created (host sees waiting message)
        this.events.on(Events.NET_GAME_CREATED, (data) => {
            Logger.log('MultiplayerUI', 'Game created:', data);
        });

        // Game starts
        this.events.on(Events.NET_GAME_START, async (state) => {
            Logger.log('MultiplayerUI', 'Game starting:', state);
            // networkManager._isMultiplayer is already true from connection
            if (this.onGameStart) {
                await this.onGameStart(state);
            }
        });

        // Host left
        this.events.on(Events.NET_HOST_LEFT, () => {
            alert('L\'hôte a quitté la partie');
            this.leaveMultiplayer();
        });

        // Spectator Mode
        this.events.on(Events.SPECTATOR_MODE_START, () => {
            this._showSpectatorOverlay();
        });
    }

    /**
     * Show spectator overlay when eliminated
     * @private
     */
    _showSpectatorOverlay() {
        if (document.getElementById('spectator-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'spectator-overlay';
        overlay.className = 'spectator-overlay';
        overlay.innerHTML = `
            <div class="spectator-content">
                <div class="spectator-status">
                    <span class="skull">💀</span>
                    <div class="status-texts">
                        <h3>ÉLIMINÉ</h3>
                        <p>Mode Spectateur Actif</p>
                    </div>
                </div>
                <button id="btn-quit-spectator" class="quit-btn">QUITTER LA PARTIE</button>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.classList.add('ghost-mode');

        document.getElementById('btn-quit-spectator')?.addEventListener('click', () => {
            overlay.remove();
            document.body.classList.remove('ghost-mode');
            this.leaveMultiplayer();
            // Force return to menu via EventBus
            if (this.events) {
                this.events.emit(Events.GAME_ENDED);
            }
        });
    }

    /**
     * Handle lobby state update
     * @private
     * @param {Object} lobbyState - Lobby state from server
     */
    _handleLobbyUpdate(lobbyState) {
        Logger.log('MultiplayerUI', 'Rendering lobby:', lobbyState);
        const { players, gameCreated, config } = lobbyState;

        // Render player list for host or guest
        const listId = this.networkManager.isHost ? 'host-player-list' : 'guest-player-list';
        this._renderPlayerList(players, listId);

        // Show start button for host if >= 2 players
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

        // If game is created and we're the guest, show join button
        if (gameCreated && !this.networkManager.isHost) {
            document.getElementById('guest-waiting')?.classList.add('hidden');
            document.getElementById('guest-ready')?.classList.remove('hidden');

            const configEl = document.getElementById('guest-config');
            if (configEl && config) {
                configEl.textContent = `${config.width}×${config.height} • ${config.bombCount} 💣 (Max: ${config.maxPlayers} joueurs)`;
            }
        }
    }

    /**
     * Render the list of players in the lobby
     * @private
     * @param {Array} players - List of player objects
     * @param {string} listElementId - ID of the UL element
     */
    _renderPlayerList(players, listElementId) {
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
                ${p.isHost ? '<span class="player-badge host">HÔTE</span>' : ''}
            `;
            listEl.appendChild(li);
        });
    }

    /**
     * Escape HTML special characters
     * @private
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Leave multiplayer session
     */
    leaveMultiplayer() {
        this.networkManager.disconnect();
        this._resetUI();
    }

    /**
     * Reset UI after a game ends (keep connection but reset views)
     */
    /**
     * Reset UI after a game ends (disconnect and return to start)
     */
    resetAfterGame() {
        this.leaveMultiplayer();
        const overlay = document.getElementById('spectator-overlay');
        if (overlay) overlay.remove();
        document.body.classList.remove('ghost-mode');
    }

    /**
     * Reset UI to initial state
     * @private
     */
    _resetUI() {
        document.getElementById('mp-host-lobby')?.classList.add('hidden');
        document.getElementById('mp-guest-lobby')?.classList.add('hidden');
        document.getElementById('mp-connect')?.classList.remove('hidden');

        if (this.createBtn) this.createBtn.disabled = false;
        if (this.joinBtn) this.joinBtn.disabled = false;

        document.getElementById('host-setup')?.classList.remove('hidden');
        document.getElementById('host-waiting')?.classList.add('hidden');
        document.getElementById('guest-waiting')?.classList.remove('hidden');
        document.getElementById('guest-ready')?.classList.add('hidden');

        // Clear lists
        const hostList = document.getElementById('host-player-list');
        if (hostList) hostList.innerHTML = '';
        const guestList = document.getElementById('guest-player-list');
        if (guestList) guestList.innerHTML = '';
    }

    /**
     * Hide connect panel
     * @private
     */
    _hideConnectPanel() {
        document.getElementById('mp-connect')?.classList.add('hidden');
    }

    /**
     * Show host lobby
     * @private
     */
    _showHostLobby() {
        document.getElementById('mp-host-lobby')?.classList.remove('hidden');
        document.getElementById('mp-guest-lobby')?.classList.add('hidden');
        if (this.createBtn) this.createBtn.disabled = false;

        // Always show setup form initially or on reset
        document.getElementById('host-setup')?.classList.remove('hidden');
        document.getElementById('host-waiting')?.classList.add('hidden');
    }

    /**
     * Show host waiting state
     * @private
     */
    _showHostWaiting() {
        document.getElementById('host-setup')?.classList.add('hidden');
        document.getElementById('host-waiting')?.classList.remove('hidden');
    }

    /**
     * Show guest lobby
     * @private
     */
    _showGuestLobby() {
        document.getElementById('mp-guest-lobby')?.classList.remove('hidden');
        document.getElementById('mp-host-lobby')?.classList.add('hidden');
        if (this.joinBtn) this.joinBtn.disabled = false;
    }

    /**
     * Show elimination notification when another player is eliminated
     * @param {string} playerName - Name of the eliminated player
     */
    showEliminationNotification(playerName) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'elimination-notification';
        notification.innerHTML = `
            <div class="elimination-icon">💀</div>
            <div class="elimination-text">
                <span class="elimination-name">${playerName}</span>
                <span class="elimination-msg">a été éliminé!</span>
            </div>
        `;

        // Add styles inline for immediate effect
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

        const icon = notification.querySelector('.elimination-icon');
        icon.style.cssText = `
            font-size: 48px;
            animation: eliminationPulse 0.5s ease infinite alternate;
        `;

        const textDiv = notification.querySelector('.elimination-text');
        textDiv.style.cssText = `
            display: flex;
            flex-direction: column;
            color: white;
        `;

        const nameSpan = notification.querySelector('.elimination-name');
        nameSpan.style.cssText = `
            font-size: 24px;
            font-weight: bold;
            color: #ffcccc;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        `;

        const msgSpan = notification.querySelector('.elimination-msg');
        msgSpan.style.cssText = `
            font-size: 18px;
            color: #ffffff;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        `;

        // Add keyframe animations
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

        // Remove after 3 seconds with fade out
        setTimeout(() => {
            notification.style.animation = 'eliminationSlideOut 0.5s ease forwards';
            setTimeout(() => {
                notification.remove();
                style.remove();
            }, 500);
        }, 3000);
    }
}