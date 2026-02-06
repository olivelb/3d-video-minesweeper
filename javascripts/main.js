/**
 * Main Application Entry Point
 * Handles game initialization via GameController
 */

import { GameController } from './core/GameController.js';

// Initialize the Game Controller
const gameController = new GameController();

// Boot the application
window.addEventListener('DOMContentLoaded', () => {
    gameController.init();
});
