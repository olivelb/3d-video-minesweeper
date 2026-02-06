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

    // Analytics
    USER_INTERACTION: 'analytics:interaction'
};
