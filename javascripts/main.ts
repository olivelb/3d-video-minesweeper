/**
 * Main Application Entry Point
 * Handles game initialization via GameController
 */

import { GameController } from './core/GameController.js';
import { initLang, setLang, getLang } from './i18n.js';
import { SolverBridge } from '../shared/SolverBridge.js';

// Pre-load WASM solver in background (non-blocking, falls back to JS)
SolverBridge.init().catch(() => { });

// Initialize the Game Controller
const gameController = new GameController();

// Boot the application
window.addEventListener('DOMContentLoaded', () => {
    // Initialize i18n (detects browser language, translates DOM)
    initLang();

    // Language switcher buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
        const el = btn as HTMLElement;
        // Mark the current language as active
        el.classList.toggle('active', el.dataset.lang === getLang());
        el.addEventListener('click', () => {
            document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
            setLang(el.dataset.lang!);
        });
    });

    gameController.init();
});
