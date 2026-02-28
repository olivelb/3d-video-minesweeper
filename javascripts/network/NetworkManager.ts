/**
 * NetworkManager - Handles dedicated server connections
 * Simplified version - only supports Socket.io server mode
 */

import { Logger } from '../utils/Logger.js';
import { Events } from '../core/EventBus.js';
import type { EventBus } from '../core/EventBus.js';

declare const io: any;

interface WelcomeData {
    playerId: string;
    playerNumber: number;
    isHost: boolean;
}

export class NetworkManager {
    socket: any;
    playerId: string | null;
    playerNumber: number | null;
    isHost: boolean;
    _isMultiplayer: boolean;
    eventBus: EventBus | null;

    constructor() {
        this.socket = null;
        this.playerId = null;
        this.playerNumber = null;
        this.isHost = false;
        this._isMultiplayer = false;
        this.eventBus = null;
    }

    setEventBus(eventBus: EventBus): void {
        this.eventBus = eventBus;
    }

    get mode(): 'multiplayer' | null {
        return this._isMultiplayer ? 'multiplayer' : null;
    }

    async connectToServer(serverUrl: string, playerName: string): Promise<WelcomeData> {
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

            this.socket.on('welcome', (data: WelcomeData) => {
                this.playerId = data.playerId;
                this.playerNumber = data.playerNumber;
                this.isHost = data.isHost;
                this._isMultiplayer = true;
                Logger.log('NetworkManager', 'Joined as player', this.playerNumber, this.isHost ? '(host)' : '');

                if (this.eventBus) this.eventBus.emit(Events.MP_CONNECTED, data);
                resolve(data);
            });

            this.socket.on('stateSync', (data: any) => {
                if (this.eventBus) this.eventBus.emit(Events.MP_STATE_SYNC, data.state);
            });

            this.socket.on('lobbyUpdate', (data: any) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_LOBBY_UPDATE, data);
            });

            this.socket.on('gameCreated', (data: any) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_GAME_CREATED, data);
            });

            this.socket.on('gameStart', (data: any) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_GAME_START, data.state);
            });

            this.socket.on('hostLeft', () => {
                if (this.eventBus) this.eventBus.emit(Events.NET_HOST_LEFT);
            });

            this.socket.on('playerJoined', (data: any) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_PLAYER_JOINED, data);
            });

            this.socket.on('playerLeft', (data: any) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_PLAYER_LEFT, data);
            });

            this.socket.on('gameReady', (data: any) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_GAME_READY, data);
            });

            this.socket.on('gameUpdate', (data: any) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_GAME_UPDATE, data);
            });

            this.socket.on('gameOver', (data: any) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_GAME_OVER, data);
            });

            this.socket.on('playerEliminated', (data: any) => {
                Logger.log('NetworkManager', 'Player eliminated:', data.playerName);
                if (this.eventBus) this.eventBus.emit(Events.NET_PLAYER_ELIMINATED, data);
            });

            this.socket.on('minesPlaced', (data: any) => {
                Logger.log('NetworkManager', 'Received minesPlaced:', data.minePositions?.length, 'mines');
                if (this.eventBus) this.eventBus.emit(Events.NET_MINES_PLACED, data.minePositions);
            });

            this.socket.on('generatingGrid', (data: any) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_GENERATING_GRID, data);
            });

            this.socket.on('gameEnded', () => {
                Logger.log('NetworkManager', 'Game session ended by server');
                if (this.eventBus) this.eventBus.emit(Events.GAME_ENDED);
            });

            this.socket.on('error', (data: any) => {
                if (this.eventBus) this.eventBus.emit(Events.NET_ERROR, data.message);
                reject(new Error(data.message));
            });

            this.socket.on('connect_error', (err: Error) => {
                Logger.error('NetworkManager', 'Connection error:', err);
                if (this.eventBus) this.eventBus.emit(Events.NET_ERROR, 'Connexion échouée');
                reject(err);
            });
        });
    }

    async _loadSocketIO(serverUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${serverUrl}/socket.io/socket.io.js`;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Socket.io'));
            document.head.appendChild(script);
        });
    }

    createGame(width: number, height: number, bombCount: number, maxPlayers: number, noGuessMode = false): void {
        if (this.socket) {
            this.socket.emit('createGame', { width, height, bombCount, maxPlayers, noGuessMode });
        }
    }

    startGame(): void {
        if (this.socket) {
            this.socket.emit('startGame');
        }
    }

    joinGame(): void {
        if (this.socket) {
            this.socket.emit('joinGame');
        }
    }

    sendAction(action: { type: string; x: number; y: number }): void {
        if (this.socket) {
            Logger.log('NetworkManager', 'Sending action:', action);
            this.socket.emit('action', action);
        } else {
            Logger.warn('NetworkManager', 'No socket, cannot send action');
        }
    }

    disconnect(): void {
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
