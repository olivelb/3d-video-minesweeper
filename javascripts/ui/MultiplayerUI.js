/**
 * MultiplayerUI Module
 * 
 * Handles the multiplayer user interface elements, including
 * server connection status, lobby management, and host/guest flows.
 * 
 * @module MultiplayerUI
 */

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
    }

    /**
     * Handle create game action
     * @private
     */
    _handleCreateGame() {
        const widthInput = document.getElementById('grid-width');
        const heightInput = document.getElementById('grid-height');
        const bombInput = document.getElementById('bomb-count');

        const w = parseInt(widthInput?.value) || 30;
        const h = parseInt(heightInput?.value) || 20;
        const b = parseInt(bombInput?.value) || 50;

        this.networkManager.createGame(w, h, b);
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
            console.error('[MultiplayerUI] Connection error:', err);
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
            console.log('[MultiplayerUI] Lobby update:', lobbyState);
            this._handleLobbyUpdate(lobbyState);
        };

        // Game created (host sees waiting message)
        this.networkManager.onGameCreated = (data) => {
            console.log('[MultiplayerUI] Game created:', data);
        };

        // Game starts
        this.networkManager.onGameStart = async (state) => {
            console.log('[MultiplayerUI] Game starting:', state);
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
        // If game is created and we're the guest, show join button
        if (lobbyState.gameCreated && !this.networkManager.isHost) {
            document.getElementById('guest-waiting')?.classList.add('hidden');
            document.getElementById('guest-ready')?.classList.remove('hidden');

            const cfg = lobbyState.config;
            const configEl = document.getElementById('guest-config');
            if (configEl && cfg) {
                configEl.textContent = `Partie: ${cfg.width}×${cfg.height} avec ${cfg.bombCount} 💣`;
            }
        }
    }

    /**
     * Leave multiplayer session
     */
    leaveMultiplayer() {
        this.networkManager.disconnect();
        this._resetUI();
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

        document.getElementById('host-actions')?.classList.remove('hidden');
        document.getElementById('host-waiting')?.classList.add('hidden');
        document.getElementById('guest-waiting')?.classList.remove('hidden');
        document.getElementById('guest-ready')?.classList.add('hidden');
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
        document.getElementById('host-actions')?.classList.remove('hidden');
        document.getElementById('host-waiting')?.classList.add('hidden');
    }

    /**
     * Show host waiting state
     * @private
     */
    _showHostWaiting() {
        document.getElementById('host-actions')?.classList.add('hidden');
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
}
