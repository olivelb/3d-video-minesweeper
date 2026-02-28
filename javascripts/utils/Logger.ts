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
    static whitelist: string[] = [];

    static setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (enabled) {
            console.log('[Logger] Logging enabled');
        }
    }

    static log(tag: string, ...args: unknown[]): void {
        if (!this.enabled) return;
        if (this.whitelist.length > 0 && !this.whitelist.includes(tag)) return;

        console.log(`[${tag}]`, ...args);
    }

    static warn(tag: string, ...args: unknown[]): void {
        console.warn(`[${tag}]`, ...args);
    }

    static error(tag: string, ...args: unknown[]): void {
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
