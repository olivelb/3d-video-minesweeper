/**
 * Main Application Entry Point
 * Handles game initialization via GameController
 */

import { GameController } from './core/GameController.js';
import { initLang, setLang, getLang } from './i18n.js';

// Initialize the Game Controller
const gameController = new GameController();

// Boot the application
window.addEventListener('DOMContentLoaded', () => {
    // Initialize i18n (detects browser language, translates DOM)
    initLang();

    // Language switcher buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
        // Mark the current language as active
        btn.classList.toggle('active', btn.dataset.lang === getLang());
        btn.addEventListener('click', () => {
            document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setLang(btn.dataset.lang);
        });
    });

    gameController.init();
});
