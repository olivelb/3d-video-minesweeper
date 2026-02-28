/**
 * Simple Event Bus for decoupled communication
 */

type EventCallback = (data?: any) => void;

export class EventBus {
    listeners: Record<string, EventCallback[]>;

    constructor() {
        this.listeners = {};
    }

    on(event: string, callback: EventCallback): void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event: string, callback: EventCallback): void {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event: string, data?: unknown): void {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (err) {
                console.error(`[EventBus] Error in listener for '${event}':`, err);
            }
        });
    }
}

/**
 * Global Event Constants
 */
export const Events = {
    // Game Lifecycle
    GAME_START: 'game:start',
    GAME_OVER: 'game:over',
    GAME_READY: 'game:ready',
    GAME_ENDED: 'game:ended',

    // User Actions
    REQUEST_HINT: 'action:hint',
    REQUEST_HINT_EXPLAIN: 'action:hint_explain',
    HINT_EXPLAIN_DISMISS: 'action:hint_explain_dismiss',
    REQUEST_RETRY: 'action:retry',
    TOGGLE_MUTE: 'ui:toggle_mute',
    FLAG_STYLE_CHANGED: 'ui:flag_style_changed',

    // UI Events
    UI_SHOW_MENU: 'ui:show_menu',
    UI_UPDATE_SCORE: 'ui:update_score',

    // Multiplayer Events
    MP_CONNECTED: 'mp:connected',
    MP_STATE_SYNC: 'mp:state_sync',
    SPECTATOR_MODE_START: 'mp:spectator_start',
    NET_LOBBY_UPDATE: 'net:lobby_update',

    // Network Events (Socket.io mapping)
    NET_GAME_CREATED: 'net:game_created',
    NET_GAME_START: 'net:game_start',
    NET_GENERATING_GRID: 'net:generating_grid',
    NET_HOST_LEFT: 'net:host_left',
    NET_PLAYER_JOINED: 'net:player_joined',
    NET_PLAYER_LEFT: 'net:player_left',
    NET_GAME_READY: 'net:game_ready',
    NET_GAME_UPDATE: 'net:game_update',
    NET_GAME_OVER: 'net:game_over',
    NET_PLAYER_ELIMINATED: 'net:player_eliminated',
    NET_MINES_PLACED: 'net:mines_placed',
    NET_ERROR: 'net:error',

    // Input Events
    CELL_INTERACTION: 'input:cell_interaction',

    // Analytics
    USER_INTERACTION: 'analytics:interaction'
} as const;
