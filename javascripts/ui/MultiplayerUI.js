/**
 * MultiplayerUI Module
 * 
 * Handles the multiplayer user interface elements, including
 * server connection status, lobby management, and host/guest flows.
 * 
 * @module MultiplayerUI
 */

import { Logger } from '../utils/Logger.js';

/**
 * Default server URL for multiplayer connections
 * @constant
 */
const DEFAULT_SERVER_URL = window.MINESWEEPER_SERVERS?.raspberryCloud || 'http://192.168.1.232:3001';

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
    constructor(networkManager) {
        /** @type {Object} Network manager reference */
        this.networkManager = networkManager;

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

        const w = parseInt(widthInput?.value) || 30;
        const h = parseInt(heightInput?.value) || 20;
        const b = parseInt(bombInput?.value) || 50;
        const mp = parseInt(maxPlayersInput?.value) || 2;

        this.networkManager.createGame(w, h, b, mp);
        this._showHostWaiting();
    }

    /**
     * Check server availability
     * @returns {Promise<boolean>} Whether server is available
     */
    async checkServerAvailability() {
        this._updateStatus(ConnectionStatus.CHECKING, 'Vérification du serveur...');

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(`${DEFAULT_SERVER_URL}/health`, {
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (response.ok) {
                this._updateStatus(ConnectionStatus.ONLINE, 'Serveur disponible');
                this.dedicatedServerUrl = DEFAULT_SERVER_URL;
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
        this.networkManager.onLobbyUpdate = (lobbyState) => {
            Logger.log('MultiplayerUI', 'Lobby update:', lobbyState);
            this._handleLobbyUpdate(lobbyState);
        };

        // Game created (host sees waiting message)
        this.networkManager.onGameCreated = (data) => {
            Logger.log('MultiplayerUI', 'Game created:', data);
        };

        // Game starts
        this.networkManager.onGameStart = async (state) => {
            Logger.log('MultiplayerUI', 'Game starting:', state);
            this.networkManager._isMultiplayer = true;
            if (this.onGameStart) {
                await this.onGameStart(state);
            }
        };

        // Host left
        this.networkManager.onHostLeft = () => {
            alert('L\'hôte a quitté la partie');
            this.leaveMultiplayer();
        };
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