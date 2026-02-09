/**
 * LeaderboardController Module
 * 
 * Manages the display and interaction with leaderboard/high scores UI.
 * Handles fetching, displaying, and formatting score data.
 * 
 * @module LeaderboardController
 */

import { t, getLocale } from '../i18n.js';

/**
 * Default difficulty configurations
 * @constant
 */
const DIFFICULTY_PRESETS = {
    easy: { width: 8, height: 8, bombs: 10 },
    medium: { width: 16, height: 16, bombs: 40 },
    hard: { width: 30, height: 16, bombs: 99 }
};

/**
 * Manages leaderboard display and interactions
 * @class
 */
export class LeaderboardController {
    /**
     * Create a leaderboard manager
     * @param {Object} scoreManager - Reference to the score manager
     */
    constructor(scoreManager) {
        /** @type {Object} Score manager reference */
        this.scoreManager = scoreManager;

        /** @type {HTMLElement|null} Leaderboard content container */
        this.contentEl = document.getElementById('leaderboard-list');

        /** @type {HTMLElement|null} Leaderboard panel */
        this.panelEl = document.querySelector('.leaderboard-box');

        /** @type {string} Currently selected difficulty filter */
        this.currentFilter = 'all';
    }

    /**
     * Initialize the leaderboard manager
     */
    init() {
        this._bindEvents();
    }

    /**
     * Bind UI event handlers
     * @private
     */
    _bindEvents() {
        // Clear scores button
        const clearBtn = document.getElementById('clear-scores-btn') || document.getElementById('btn-clear-scores');
        clearBtn?.addEventListener('click', () => {
            this._confirmClearScores();
        });

        // If filter buttons exist (legacy or future), bind them
        document.querySelectorAll('.leaderboard-filter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const difficulty = e.target.dataset.difficulty;
                this._setActiveFilter(e.target);
                this.loadScores(difficulty);
            });
        });
    }

    /**
     * Show the leaderboard panel
     */
    show() {
        this.panelEl?.classList.remove('hidden');
        this.loadScores(this.currentFilter);
    }

    /**
     * Hide the leaderboard panel
     */
    hide() {
        this.panelEl?.classList.add('hidden');
    }

    /**
     * Toggle leaderboard visibility
     */
    toggle() {
        if (this.panelEl?.classList.contains('hidden')) {
            this.show();
        } else {
            this.hide();
        }
    }

    /**
     * Load and display scores
     * @param {string} difficulty - Difficulty filter ('all', 'easy', 'medium', 'hard', 'custom')
     */
    loadScores(difficulty = 'all') {
        this.currentFilter = difficulty;

        if (!this.scoreManager) {
            this._renderEmpty(t('lb.noScoreManager'));
            return;
        }

        const scores = this.scoreManager.getScores(difficulty);

        if (!scores || scores.length === 0) {
            this._renderEmpty(t('lb.empty'));
            return;
        }

        this._renderScores(scores);
    }

    /**
     * Render scores to the content element
     * @private
     * @param {Array} scores - Array of score objects
     */
    _renderScores(scores) {
        if (!this.contentEl) return;

        const html = scores.slice(0, 10).map((score, index) => {
            const rank = index + 1; // Simplified rank
            const time = this._formatTime(score.time); // Keep formatting helper
            const config = `${score.width}×${score.height}`; // Simplified config

            // Use the structure from UIManager.js to maintain styling
            return `
                <div class="score-entry">
                    <span class="rank">#${rank}</span>
                    <span class="score-value">${score.score.toLocaleString()}</span>
                    <span class="score-details">${config} • ${time}s</span>
                </div>
            `;
        }).join('');

        // No header needed for the simple list style in index.html
        this.contentEl.innerHTML = html;
    }

    /**
     * Render empty state message
     * @private
     * @param {string} message - Message to display
     */
    _renderEmpty(message) {
        if (!this.contentEl) return;

        this.contentEl.innerHTML = `
            <div class="leaderboard-empty">
                <p>${message}</p>
            </div>
        `;
    }

    /**
     * Format rank with medal emoji for top 3
     * @private
     * @param {number} rank - Rank number
     * @returns {string} Formatted rank
     */
    _formatRank(rank) {
        switch (rank) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            default: return `${rank}`;
        }
    }

    /**
     * Format time in seconds to MM:SS format
     * @private
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string
     */
    _formatTime(seconds) {
        if (typeof seconds !== 'number' || isNaN(seconds)) {
            return '--:--';
        }
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Format date to localized string
     * @private
     * @param {string|number} date - Date value
     * @returns {string} Formatted date string
     */
    _formatDate(date) {
        if (!date) return '-';

        try {
            const d = new Date(date);
            return d.toLocaleDateString(getLocale(), {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit'
            });
        } catch {
            return '-';
        }
    }

    /**
     * Format grid configuration
     * @private
     * @param {Object} score - Score object with width, height, bombs
     * @returns {string} Formatted configuration string
     */
    _formatConfig(score) {
        const { width, height, bombs } = score;
        if (!width || !height) return '-';
        return `${width}×${height} (${bombs || '?'}💣)`;
    }

    /**
     * Determine and format difficulty level
     * @private
     * @param {Object} score - Score object
     * @returns {string} Difficulty label
     */
    _formatDifficulty(score) {
        const { width, height, bombs } = score;

        // Check against presets
        for (const [name, preset] of Object.entries(DIFFICULTY_PRESETS)) {
            if (preset.width === width &&
                preset.height === height &&
                preset.bombs === bombs) {
                return this._getDifficultyLabel(name);
            }
        }

        return 'Custom';
    }

    /**
     * Get localized difficulty label
     * @private
     * @param {string} difficulty - Difficulty key
     * @returns {string} Localized label
     */
    _getDifficultyLabel(difficulty) {
        const labels = {
            easy: t('lb.easy'),
            medium: t('lb.medium'),
            hard: t('lb.hard'),
            custom: t('lb.custom')
        };
        return labels[difficulty] || difficulty;
    }

    /**
     * Set active filter button
     * @private
     * @param {HTMLElement} activeBtn - The button to set as active
     */
    _setActiveFilter(activeBtn) {
        document.querySelectorAll('.leaderboard-filter').forEach(btn => {
            btn.classList.remove('active');
        });
        activeBtn.classList.add('active');
    }

    /**
     * Confirm and clear all scores
     * @private
     */
    _confirmClearScores() {
        const confirmed = confirm(t('lb.clearConfirm'));

        if (confirmed && this.scoreManager) {
            this.scoreManager.clearAllScores();
            this.loadScores(this.currentFilter);
        }
    }

    /**
     * Escape HTML to prevent XSS
     * @private
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Add a new score and refresh display
     * @param {Object} scoreData - Score data to add
     */
    addScore(scoreData) {
        if (this.scoreManager) {
            this.scoreManager.addScore(scoreData);

            // Refresh if panel is visible
            if (!this.panelEl?.classList.contains('hidden')) {
                this.loadScores(this.currentFilter);
            }
        }
    }
}
