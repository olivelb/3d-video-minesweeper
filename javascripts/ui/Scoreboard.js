/**
 * Scoreboard Component
 * 
 * Displays real-time player scores during multiplayer games
 * and shows final results at game end.
 */

import { t } from '../i18n.js';

export class Scoreboard {
    constructor() {
        this.container = null;
        this.resultsModal = null;
        this.players = [];
        this.localPlayerId = null;
        
        this._createElements();
    }

    /**
     * Create DOM elements for scoreboard
     * @private
     */
    _createElements() {
        // In-game floating scoreboard
        this.container = document.createElement('div');
        this.container.id = 'multiplayer-scoreboard';
        this.container.className = 'scoreboard hidden';
        this.container.innerHTML = `
            <div class="scoreboard-header">
                <span class="scoreboard-title" data-i18n="sb.title">${t('sb.title')}</span>
            </div>
            <div class="scoreboard-players"></div>
        `;
        document.body.appendChild(this.container);

        // End-game results modal
        this.resultsModal = document.createElement('div');
        this.resultsModal.id = 'game-results-modal';
        this.resultsModal.className = 'results-modal hidden';
        this.resultsModal.innerHTML = `
            <div class="results-content">
                <div class="results-header">
                    <h2 class="results-title" data-i18n="sb.resultsTitle">${t('sb.resultsTitle')}</h2>
                    <div class="results-winner"></div>
                </div>
                <div class="results-table-container">
                    <table class="results-table">
                        <thead>
                            <tr>
                                <th data-i18n="sb.rank">${t('sb.rank')}</th>
                                <th data-i18n="sb.player">${t('sb.player')}</th>
                                <th data-i18n="sb.score">${t('sb.score')}</th>
                                <th data-i18n="sb.cells">${t('sb.cells')}</th>
                                <th data-i18n="sb.flags">${t('sb.flags')}</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
                <div class="results-actions">
                    <button class="results-btn" id="results-menu-btn" data-i18n="sb.menuBtn">${t('sb.menuBtn')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.resultsModal);

        // Inject styles
        this._injectStyles();
    }

    /**
     * Inject CSS styles for scoreboard - matches solo game style
     * @private
     */
    _injectStyles() {
        if (document.getElementById('scoreboard-styles')) return;

        const style = document.createElement('style');
        style.id = 'scoreboard-styles';
        style.textContent = `
            /* In-game Scoreboard - Glass morphism style like solo leaderboard */
            .scoreboard {
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(255, 255, 255, 0.08);
                backdrop-filter: blur(25px);
                -webkit-backdrop-filter: blur(25px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 20px;
                padding: 18px 22px;
                min-width: 200px;
                z-index: 1000;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .scoreboard.hidden {
                opacity: 0;
                transform: translateX(20px);
                pointer-events: none;
            }

            .scoreboard-header {
                display: flex;
                align-items: center;
                margin-bottom: 14px;
                padding-bottom: 10px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            .scoreboard-title {
                font-size: 1em;
                font-weight: 800;
                background: linear-gradient(135deg, #ffd700 0%, #ffae00 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }

            .scoreboard-players {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .scoreboard-player {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 14px;
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .scoreboard-player:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(255, 255, 255, 0.2);
            }

            .scoreboard-player.local {
                background: rgba(79, 172, 254, 0.15);
                border: 1px solid rgba(79, 172, 254, 0.3);
            }

            .scoreboard-player.eliminated {
                opacity: 0.5;
            }

            .scoreboard-player.eliminated .player-name {
                text-decoration: line-through;
            }

            .scoreboard-player.leading {
                background: rgba(255, 215, 0, 0.12);
                border: 1px solid rgba(255, 215, 0, 0.3);
            }

            .player-name {
                font-size: 0.9em;
                font-weight: 600;
                color: #ffffff;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .player-number {
                font-size: 0.7em;
                font-weight: 700;
                background: rgba(255, 255, 255, 0.15);
                padding: 3px 8px;
                border-radius: 6px;
                color: rgba(255, 255, 255, 0.7);
            }

            .player-score {
                font-size: 1.1em;
                font-weight: 800;
                color: #4facfe;
            }

            .scoreboard-player.leading .player-score {
                color: #ffd700;
            }

            .scoreboard-player.eliminated .player-score {
                color: rgba(255, 255, 255, 0.4);
            }

            /* Results Modal - Glass morphism style like menu-box */
            .results-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, rgba(26, 28, 44, 0.95) 0%, rgba(74, 25, 44, 0.95) 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                opacity: 1;
                transition: opacity 0.3s ease;
            }

            .results-modal.hidden {
                opacity: 0;
                pointer-events: none;
            }

            .results-content {
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(25px);
                -webkit-backdrop-filter: blur(25px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 24px;
                padding: 35px 45px;
                min-width: 450px;
                max-width: 600px;
                box-shadow:
                    0 25px 50px -12px rgba(0, 0, 0, 0.5),
                    inset 0 1px 1px rgba(255, 255, 255, 0.2);
                animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
            }

            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(20px) scale(0.98);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            .results-header {
                text-align: center;
                margin-bottom: 30px;
            }

            .results-title {
                font-size: 1.8em;
                font-weight: 800;
                letter-spacing: -0.02em;
                background: linear-gradient(135deg, #fff 0%, rgba(255, 255, 255, 0.7) 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                margin: 0 0 15px 0;
            }

            .results-winner {
                font-size: 1.3em;
                font-weight: 700;
                background: linear-gradient(135deg, #ffd700 0%, #ffae00 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }

            .results-winner.defeat {
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }

            .results-table-container {
                margin-bottom: 30px;
                background: rgba(0, 0, 0, 0.15);
                border-radius: 16px;
                padding: 5px;
            }

            .results-table {
                width: 100%;
                border-collapse: collapse;
            }

            .results-table th,
            .results-table td {
                padding: 14px 16px;
                text-align: left;
            }

            .results-table th {
                color: rgba(255, 255, 255, 0.5);
                font-weight: 600;
                font-size: 0.75em;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            .results-table td {
                color: #ffffff;
                font-size: 0.95em;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }

            .results-table tr:last-child td {
                border-bottom: none;
            }

            .results-table tr.winner {
                background: rgba(255, 215, 0, 0.1);
            }

            .results-table tr.winner td {
                color: #ffd700;
                font-weight: 700;
            }

            .results-table tr.eliminated {
                opacity: 0.6;
            }

            .results-table tr.eliminated td {
                text-decoration: line-through;
            }

            .results-table .rank {
                font-weight: 800;
                width: 40px;
            }

            .results-table tr.winner .rank {
                color: #ffd700;
            }

            .results-table .score {
                color: #4facfe;
                font-weight: 700;
            }

            .results-table tr.winner .score {
                color: #ffd700;
            }

            .results-table tr.eliminated .score {
                color: rgba(255, 255, 255, 0.4);
            }

            .results-actions {
                display: flex;
                justify-content: center;
                gap: 15px;
            }

            .results-btn {
                padding: 14px 35px;
                font-size: 1em;
                font-weight: 700;
                border: none;
                border-radius: 14px;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                text-transform: uppercase;
                letter-spacing: 1px;
                position: relative;
                overflow: hidden;
            }

            .results-btn::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
                transition: left 0.5s ease;
            }

            .results-btn:hover::before {
                left: 100%;
            }

            .results-btn:hover {
                transform: translateY(-3px);
            }

            #results-menu-btn {
                background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                color: white;
                box-shadow:
                    0 10px 30px rgba(245, 87, 108, 0.4),
                    inset 0 1px 0 rgba(255, 255, 255, 0.3);
            }

            #results-menu-btn:hover {
                box-shadow:
                    0 15px 40px rgba(245, 87, 108, 0.5),
                    inset 0 1px 0 rgba(255, 255, 255, 0.4);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Set the local player ID for highlighting
     * @param {string} playerId 
     */
    setLocalPlayer(playerId) {
        this.localPlayerId = playerId;
    }

    /**
     * Show the scoreboard
     */
    show() {
        this.container.classList.remove('hidden');
    }

    /**
     * Hide the scoreboard
     */
    hide() {
        this.container.classList.add('hidden');
    }

    /**
     * Update scoreboard with current scores
     * @param {Array} scores - Array of { id, name, number, score, eliminated }
     */
    updateScores(scores) {
        if (!scores || scores.length === 0) return;

        this.players = scores;
        const playersContainer = this.container.querySelector('.scoreboard-players');
        
        // Find leading score (among non-eliminated)
        const activeScores = scores.filter(p => !p.eliminated).map(p => p.score);
        const leadingScore = Math.max(...activeScores, 0);

        playersContainer.innerHTML = scores.map(player => {
            const isLocal = player.id === this.localPlayerId;
            const isLeading = !player.eliminated && player.score === leadingScore && player.score > 0;
            
            const classes = [
                'scoreboard-player',
                isLocal ? 'local' : '',
                player.eliminated ? 'eliminated' : '',
                isLeading ? 'leading' : ''
            ].filter(Boolean).join(' ');

            return `
                <div class="${classes}">
                    <span class="player-name">
                        <span class="player-number">P${player.number}</span>
                        ${this._escapeHtml(player.name)}
                        ${player.eliminated ? ' 💀' : ''}
                    </span>
                    <span class="player-score">${player.score}</span>
                </div>
            `;
        }).join('');
    }

    /**
     * Show end-game results modal
     * @param {object} data - { victory, winner, finalScores, duration }
     * @param {Function} onMenuClick - Callback when menu button clicked
     */
    showResults(data, onMenuClick) {
        const { victory, winnerId, winnerName, finalScores, duration, reason } = data;

        // Update winner text
        const winnerDiv = this.resultsModal.querySelector('.results-winner');
        if (victory && winnerName) {
            winnerDiv.className = 'results-winner';
            winnerDiv.innerHTML = t('sb.winner', { name: this._escapeHtml(winnerName) });
        } else if (reason === 'allEliminated') {
            winnerDiv.className = 'results-winner defeat';
            winnerDiv.innerHTML = t('sb.allEliminated');
        } else {
            winnerDiv.className = 'results-winner defeat';
            winnerDiv.innerHTML = t('sb.gameOver');
        }

        // Update results table
        const tbody = this.resultsModal.querySelector('.results-table tbody');
        tbody.innerHTML = finalScores.map((player, index) => {
            const isWinner = player.id === winnerId;
            const rowClass = isWinner ? 'winner' : (player.eliminated ? 'eliminated' : '');
            
            return `
                <tr class="${rowClass}">
                    <td class="rank">${index + 1}</td>
                    <td>${this._escapeHtml(player.name)} ${isWinner ? '🏆' : ''}</td>
                    <td class="score">${player.score}</td>
                    <td>${player.stats?.cellsRevealed || 0}</td>
                    <td>${player.stats?.correctFlags || 0}</td>
                </tr>
            `;
        }).join('');

        // Wire up menu button
        const menuBtn = this.resultsModal.querySelector('#results-menu-btn');
        menuBtn.onclick = () => {
            this.hideResults();
            if (onMenuClick) onMenuClick();
        };

        // Show modal
        this.resultsModal.classList.remove('hidden');
    }

    /**
     * Hide results modal
     */
    hideResults() {
        this.resultsModal.classList.add('hidden');
    }

    /**
     * Clean up and remove elements
     */
    dispose() {
        this.container?.remove();
        this.resultsModal?.remove();
    }

    /**
     * Escape HTML to prevent XSS
     * @private
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
