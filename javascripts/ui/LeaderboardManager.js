/**
 * LeaderboardManager Module
 * 
 * Manages the display and interaction with leaderboard/high scores UI.
 * Handles fetching, displaying, and formatting score data.
 * 
 * @module LeaderboardManager
 */

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
export class LeaderboardManager {
    /**
     * Create a leaderboard manager
     * @param {Object} scoreManager - Reference to the score manager
     */
    constructor(scoreManager) {
        /** @type {Object} Score manager reference */
        this.scoreManager = scoreManager;
        
        /** @type {HTMLElement|null} Leaderboard content container */
        this.contentEl = document.getElementById('leaderboard-content');
        
        /** @type {HTMLElement|null} Leaderboard panel */
        this.panelEl = document.getElementById('leaderboard-panel');
        
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
        // Show leaderboard button
        document.getElementById('btn-leaderboard')?.addEventListener('click', () => {
            this.show();
        });

        // Close button
        document.getElementById('btn-close-leaderboard')?.addEventListener('click', () => {
            this.hide();
        });

        // Difficulty filter buttons
        document.querySelectorAll('.leaderboard-filter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const difficulty = e.target.dataset.difficulty;
                this._setActiveFilter(e.target);
                this.loadScores(difficulty);
            });
        });

        // Clear scores button
        document.getElementById('btn-clear-scores')?.addEventListener('click', () => {
            this._confirmClearScores();
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
            this._renderEmpty('Score manager non disponible');
            return;
        }

        const scores = this.scoreManager.getScores(difficulty);
        
        if (!scores || scores.length === 0) {
            this._renderEmpty('Aucun score enregistré');
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

        const html = scores.map((score, index) => {
            const rank = this._formatRank(index + 1);
            const time = this._formatTime(score.time);
            const date = this._formatDate(score.date);
            const config = this._formatConfig(score);
            const difficulty = this._formatDifficulty(score);

            return `
                <div class="leaderboard-row ${index < 3 ? 'top-' + (index + 1) : ''}">
                    <span class="rank">${rank}</span>
                    <span class="player-name">${this._escapeHtml(score.name || 'Anonyme')}</span>
                    <span class="score-time">${time}</span>
                    <span class="score-config">${config}</span>
                    <span class="score-difficulty">${difficulty}</span>
                    <span class="score-date">${date}</span>
                </div>
            `;
        }).join('');

        this.contentEl.innerHTML = `
            <div class="leaderboard-header">
                <span class="rank">#</span>
                <span class="player-name">Joueur</span>
                <span class="score-time">Temps</span>
                <span class="score-config">Grille</span>
                <span class="score-difficulty">Difficulté</span>
                <span class="score-date">Date</span>
            </div>
            ${html}
        `;
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
            return d.toLocaleDateString('fr-FR', {
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
            easy: 'Facile',
            medium: 'Moyen',
            hard: 'Difficile',
            custom: 'Personnalisé'
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
        const confirmed = confirm('Êtes-vous sûr de vouloir supprimer tous les scores ?');
        
        if (confirmed && this.scoreManager) {
            this.scoreManager.clearScores();
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
