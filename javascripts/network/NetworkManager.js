/**
 * NetworkManager - Handles dedicated server connections
 * Simplified version - only supports Socket.io server mode
 */

// NetworkManager.js
import { Logger } from '../utils/Logger.js';
// Import Events to use constants
import { Events } from '../core/EventBus.js';

export class NetworkManager {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.playerNumber = null;
        this.isHost = false;
        this._isMultiplayer = false;

        this.eventBus = null; // Injected via setEventBus
    }

    setEventBus(eventBus) {
        this.eventBus = eventBus;
    }

    // True when in multiplayer mode
    get mode() {
        return this._isMultiplayer ? 'multiplayer' : null;
    }

    /**
     * Connect to the dedicated server
     * @param {string} serverUrl - The server URL
     * @param {string} playerName - This player's display name
     */
    async connectToServer(serverUrl, playerName) {
        // Dynamically load socket.io client if not loaded
        if (typeof io === 'undefined') {
            await this._loadSocketIO(serverUrl);
        }

        return new Promise((resolve, reject) => {
            Logger.log('NetworkManager', 'Connecting to:', serverUrl);
            this.socket = io(serverUrl);

            this.socket.on('connect', () => {
                Logger.log('NetworkManager', 'Connected to server! ID:', this.socket.id);
                this.socket.emit('join', { playerName });
            });

            this.socket.on('welcome', (data) => {
                this.playerId = data.playerId;
                this.playerNumber = data.playerNumber;
                this.isHost = data.isHost;
                this._isMultiplayer = true;
                Logger.log('NetworkManager', 'Joined as player', this.playerNumber, this.isHost ? '(host)' : '');

                if (this.eventBus) this.eventBus.emit(Events.MP_CONNECTED, data);
                resolve(data);
            });

            this.socket.on('stateSync', (data) => {
                if (this.eventBus) this.eventBus.emit(Events.MP_STATE_SYNC, data.state);
            });

            this.socket.on('lobbyUpdate', (data) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_LOBBY_UPDATE, data);
            });

            this.socket.on('gameCreated', (data) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_GAME_CREATED, data);
            });

            this.socket.on('gameStart', (data) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_GAME_START, data.state);
            });

            this.socket.on('hostLeft', () => {
                if (this.eventBus) this.eventBus.emit(Events.NET_HOST_LEFT);
            });

            this.socket.on('playerJoined', (data) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_PLAYER_JOINED, data);
            });

            this.socket.on('playerLeft', (data) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_PLAYER_LEFT, data);
            });

            this.socket.on('gameReady', (data) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_GAME_READY, data);
            });

            this.socket.on('gameUpdate', (data) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_GAME_UPDATE, data);
            });

            this.socket.on('gameOver', (data) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_GAME_OVER, data);
            });

            this.socket.on('playerEliminated', (data) => {
                Logger.log('NetworkManager', 'Player eliminated:', data.playerName);
                if (this.eventBus) this.eventBus.emit(Events.NET_PLAYER_ELIMINATED, data);
            });

            this.socket.on('minesPlaced', (data) => {
                Logger.log('NetworkManager', 'Received minesPlaced:', data.minePositions?.length, 'mines');
                if (this.eventBus) this.eventBus.emit(Events.NET_MINES_PLACED, data.minePositions);
            });

            this.socket.on('gameEnded', () => {
                Logger.log('NetworkManager', 'Game session ended by server');
                if (this.eventBus) this.eventBus.emit(Events.GAME_ENDED);
            });

            this.socket.on('error', (data) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_ERROR, data.message);
                reject(new Error(data.message));
            });

            this.socket.on('connect_error', (err) => {
                Logger.error('NetworkManager', 'Connection error:', err);
                if (this.eventBus) this.eventBus.emit(Events.NET_ERROR, 'Connexion échouée');
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
    createGame(width, height, bombCount, maxPlayers) {
        if (this.socket) {
            this.socket.emit('createGame', { width, height, bombCount, maxPlayers });
        }
    }

    /**
     * Host starts the game manually
     */
    startGame() {
        if (this.socket) {
            this.socket.emit('startGame');
        }
    }

    /**
     * Player joins the created game
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
            Logger.log('NetworkManager', 'Sending action:', action);
            this.socket.emit('action', action);
        } else {
            Logger.warn('NetworkManager', 'No socket, cannot send action');
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
