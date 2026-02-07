/**
 * Simple Event Bus for decoupled communication
 */
export class EventBus {
    constructor() {
        this.listeners = {};
    }

    /**
     * Subscribe to an event
     * @param {string} event 
     * @param {Function} callback 
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event 
     * @param {Function} callback 
     */
    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    /**
     * Emit an event with data
     * @param {string} event 
     * @param {any} data 
     */
    emit(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => callback(data));
    }
}

/**
 * Global Event Constants
 */
export const Events = {
    // Game Lifecycle
    GAME_START: 'game:start',           // { width, height, bombs, ... }
    GAME_OVER: 'game:over',             // { victory: boolean, reason: string }
    GAME_READY: 'game:ready',           // Renderer is ready
    GAME_ENDED: 'game:ended',           // Session ended (return to menu)
    NET_GAME_READY: 'net_game_ready',           // Game initialized (waiting for start)
    NET_GAME_START: 'net_game_start',           // Game started (timer running)
    NET_GENERATING_GRID: 'net_generating_grid', // Server is generating grid
    NET_GAME_UPDATE: 'net_game_update',         // Action results
    NET_GAME_OVER: 'net_game_over',             // Game concluded (return to menu)

    // User Actions
    REQUEST_HINT: 'action:hint',        // User clicked "Besoin d'aide"
    REQUEST_RETRY: 'action:retry',      // User clicked "Reessayer"
    REQUEST_MUTE: 'action:mute',        // User toggled mute
    TOGGLE_MUTE: 'ui:toggle_mute',      // User toggled mute (new event)

    // UI Events
    UI_SHOW_MENU: 'ui:show_menu',       // Return to menu
    UI_UPDATE_SCORE: 'ui:update_score', // New score

    // Multiplayer Events
    MP_CONNECTED: 'mp:connected',
    MP_STATE_SYNC: 'mp:state_sync',
    SPECTATOR_MODE_START: 'mp:spectator_start',
    NET_LOBBY_UPDATE: 'net:lobby_update',

    // Network Events (Socket.io mapping)
    NET_GAME_CREATED: 'net:game_created',
    NET_GAME_START: 'net:game_start',
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
    CELL_INTERACTION: 'input:cell_interaction', // { x, y, type: 'reveal'|'flag' }

    // Analytics
    USER_INTERACTION: 'analytics:interaction'
};
