/**
 * NetworkManager - Handles dedicated server connections
 * Simplified version - only supports Socket.io server mode
 */

export class NetworkManager {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.playerNumber = null;
        this.isHost = false;
        this._isMultiplayer = false; // Explicit flag for multiplayer mode

        // Event callbacks
        this.onConnected = null;
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onGameReady = null;
        this.onGameUpdate = null;
        this.onGameOver = null;
        this.onCursorUpdate = null;
        this.onError = null;
        this.onStateSync = null;
        this.onLobbyUpdate = null;
        this.onGameStart = null;
        this.onGameCreated = null;
        this.onHostLeft = null;
        this.onPlayerEliminated = null; // New: player elimination in multiplayer
    }

    // True when in multiplayer mode
    get mode() {
        return this._isMultiplayer ? 'multiplayer' : null;
    }

    /**
     * Connect to the dedicated server
     * @param {string} serverUrl - The server URL (e.g., 'http://192.168.1.232:3002')
     * @param {string} playerName - This player's display name
     */
    async connectToServer(serverUrl, playerName) {
        // Dynamically load socket.io client if not loaded
        if (typeof io === 'undefined') {
            await this._loadSocketIO(serverUrl);
        }

        return new Promise((resolve, reject) => {
            console.log('[NetworkManager] Connecting to:', serverUrl);
            this.socket = io(serverUrl, {
                // Let Socket.io negotiate the best transport (WebSocket vs Polling)
            });

            this.socket.on('connect', () => {
                console.log('[NetworkManager] Connected to server! ID:', this.socket.id);
                this.socket.emit('join', { playerName });
            });

            this.socket.on('welcome', (data) => {
                this.playerId = data.playerId;
                this.playerNumber = data.playerNumber;
                this.isHost = data.isHost;
                console.log('[NetworkManager] Joined as player', this.playerNumber, this.isHost ? '(host)' : '');
                if (this.onConnected) this.onConnected(data);
                resolve(data);
            });

            this.socket.on('stateSync', (data) => {
                if (this.onStateSync) this.onStateSync(data.state);
            });

            this.socket.on('lobbyUpdate', (data) => {
                if (this.onLobbyUpdate) this.onLobbyUpdate(data);
            });

            this.socket.on('gameCreated', (data) => {
                if (this.onGameCreated) this.onGameCreated(data);
            });

            this.socket.on('gameStart', (data) => {
                if (this.onGameStart) this.onGameStart(data.state);
            });

            this.socket.on('hostLeft', () => {
                if (this.onHostLeft) this.onHostLeft();
            });

            this.socket.on('playerJoined', (data) => {
                if (this.onPlayerJoined) this.onPlayerJoined(data);
            });

            this.socket.on('playerLeft', (data) => {
                if (this.onPlayerLeft) this.onPlayerLeft(data);
            });

            this.socket.on('gameReady', (data) => {
                if (this.onGameReady) this.onGameReady(data);
            });

            this.socket.on('gameUpdate', (data) => {
                if (this.onGameUpdate) this.onGameUpdate(data);
            });

            this.socket.on('gameOver', (data) => {
                if (this.onGameOver) this.onGameOver(data);
            });

            this.socket.on('playerEliminated', (data) => {
                console.log('[NetworkManager] Player eliminated:', data.playerName);
                if (this.onPlayerEliminated) this.onPlayerEliminated(data);
            });

            this.socket.on('minesPlaced', (data) => {
                console.log('[NetworkManager] Received minesPlaced:', data.minePositions?.length, 'mines');
                if (this.onMinesPlaced) this.onMinesPlaced(data.minePositions);
            });

            this.socket.on('gameEnded', () => {
                console.log('[NetworkManager] Game session ended by server');
                if (this.onGameEnded) this.onGameEnded();
            });

            this.socket.on('cursorUpdate', (data) => {
                if (this.onCursorUpdate) this.onCursorUpdate(data);
            });

            this.socket.on('error', (data) => {
                if (this.onError) this.onError(data.message);
                reject(new Error(data.message));
            });

            this.socket.on('connect_error', (err) => {
                console.error('[NetworkManager] Connection error:', err);
                if (this.onError) this.onError('Connexion échouée');
                reject(err);
            });
        });
    }

    /**
     * Dynamically load Socket.io client library
     */
    async _loadSocketIO(serverUrl) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${serverUrl}/socket.io/socket.io.js`;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Socket.io'));
            document.head.appendChild(script);
        });
    }

    /**
     * Host creates a game with config
     */
    createGame(width, height, bombCount) {
        if (this.socket) {
            this.socket.emit('createGame', { width, height, bombCount });
        }
    }

    /**
     * Player 2 joins the created game
     */
    joinGame() {
        if (this.socket) {
            this.socket.emit('joinGame');
        }
    }

    /**
     * Send an action to the server
     * @param {object} action - { type: 'reveal'|'flag', x, y }
     */
    sendAction(action) {
        if (this.socket) {
            console.log('[NetworkManager] Sending action:', action);
            this.socket.emit('action', action);
        } else {
            console.warn('[NetworkManager] No socket, cannot send action');
        }
    }

    /**
     * Send cursor position update
     */
    sendCursor(x, y) {
        if (this.socket) {
            this.socket.emit('cursor', { x, y });
        }
    }

    /**
     * Disconnect and cleanup
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.playerId = null;
        this.playerNumber = null;
        this.isHost = false;
        this._isMultiplayer = false;
    }
}

// Singleton export
export const networkManager = new NetworkManager();
