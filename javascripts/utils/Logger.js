/**
 * Logger Utility
 * Wraps console methods to allow enabling/disabling logs globally.
 * 
 * Usage:
 * import { Logger } from '../utils/Logger.js';
 * Logger.log('Component', 'Message', data);
 */

export class Logger {
    static enabled = false;
    static whitelist = []; // If set, only log tags in this list

    /**
     * Enable or disable logging
     * @param {boolean} enabled 
     */
    static setEnabled(enabled) {
        this.enabled = enabled;
        if (enabled) {
            console.log('[Logger] Logging enabled');
        }
    }

    /**
     * Log a message if logging is enabled
     * @param {string} tag - Component or context name
     * @param {...any} args - Message and data
     */
    static log(tag, ...args) {
        if (!this.enabled) return;
        if (this.whitelist.length > 0 && !this.whitelist.includes(tag)) return;

        console.log(`[${tag}]`, ...args);
    }

    /**
     * Log a warning (always shown by default, or debatable?)
     * For now, we'll respect the global flag but maybe warnings should stay?
     * Usually warnings are important. Let's keep warnings always visible
     * unless explicitly suppressed?
     * Actually, for a "clean console", we might want to suppress verbose warnings too.
     * Let's stick to the flag for now, but maybe allow crucial ones.
     */
    static warn(tag, ...args) {
        console.warn(`[${tag}]`, ...args);
    }

    /**
     * Log an error (always shown)
     * @param {string} tag 
     * @param {...any} args 
     */
    static error(tag, ...args) {
        console.error(`[${tag}]`, ...args);
    }
}

// Auto-enable if URL has ?debug=true or localStorage has 'debug_mode'
if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const storedDebug = localStorage.getItem('minesweeper_debug');

    if (urlParams.has('debug') || storedDebug === 'true') {
        Logger.setEnabled(true);
    }
}
