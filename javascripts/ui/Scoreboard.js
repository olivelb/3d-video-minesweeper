/**
 * Scoreboard Component
 * 
 * Displays real-time player scores during multiplayer games
 * and shows final results at game end.
 */

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
                <span class="scoreboard-title">🏆 Scores</span>
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
                    <h2 class="results-title">Partie Terminée</h2>
                    <div class="results-winner"></div>
                </div>
                <div class="results-table-container">
                    <table class="results-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Joueur</th>
                                <th>Score</th>
                                <th>Cellules</th>
                                <th>Drapeaux ✓</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
                <div class="results-actions">
                    <button class="results-btn" id="results-menu-btn">Menu</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.resultsModal);

        // Inject styles
        this._injectStyles();
    }

    /**
     * Inject CSS styles for scoreboard
     * @private
     */
    _injectStyles() {
        if (document.getElementById('scoreboard-styles')) return;

        const style = document.createElement('style');
        style.id = 'scoreboard-styles';
        style.textContent = `
            /* In-game Scoreboard */
            .scoreboard {
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, rgba(30, 30, 40, 0.95), rgba(20, 20, 30, 0.95));
                border: 1px solid rgba(100, 100, 150, 0.3);
                border-radius: 12px;
                padding: 12px 16px;
                min-width: 180px;
                z-index: 1000;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(10px);
                font-family: 'Segoe UI', Arial, sans-serif;
                transition: opacity 0.3s ease, transform 0.3s ease;
            }

            .scoreboard.hidden {
                opacity: 0;
                transform: translateX(20px);
                pointer-events: none;
            }

            .scoreboard-header {
                display: flex;
                align-items: center;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(100, 100, 150, 0.2);
            }

            .scoreboard-title {
                font-size: 14px;
                font-weight: 600;
                color: #ffd700;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            }

            .scoreboard-players {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .scoreboard-player {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 10px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 6px;
                transition: all 0.3s ease;
            }

            .scoreboard-player.local {
                background: rgba(100, 150, 255, 0.15);
                border: 1px solid rgba(100, 150, 255, 0.3);
            }

            .scoreboard-player.eliminated {
                opacity: 0.5;
                text-decoration: line-through;
            }

            .scoreboard-player.leading {
                background: rgba(255, 215, 0, 0.15);
                border: 1px solid rgba(255, 215, 0, 0.3);
            }

            .player-name {
                font-size: 13px;
                color: #ffffff;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .player-number {
                font-size: 10px;
                background: rgba(255, 255, 255, 0.2);
                padding: 2px 6px;
                border-radius: 4px;
                color: #aaaaaa;
            }

            .player-score {
                font-size: 14px;
                font-weight: bold;
                color: #4ade80;
                text-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
            }

            .scoreboard-player.eliminated .player-score {
                color: #888888;
                text-shadow: none;
            }

            /* Results Modal */
            .results-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
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
                background: linear-gradient(135deg, rgba(30, 30, 50, 0.98), rgba(20, 20, 40, 0.98));
                border: 1px solid rgba(100, 100, 150, 0.4);
                border-radius: 16px;
                padding: 30px 40px;
                min-width: 400px;
                max-width: 600px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            }

            .results-header {
                text-align: center;
                margin-bottom: 25px;
            }

            .results-title {
                font-size: 28px;
                color: #ffffff;
                margin: 0 0 15px 0;
            }

            .results-winner {
                font-size: 20px;
                color: #ffd700;
                text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
            }

            .results-winner.defeat {
                color: #ff6b6b;
                text-shadow: 0 0 20px rgba(255, 107, 107, 0.5);
            }

            .results-table-container {
                margin-bottom: 25px;
            }

            .results-table {
                width: 100%;
                border-collapse: collapse;
            }

            .results-table th,
            .results-table td {
                padding: 12px 15px;
                text-align: left;
                border-bottom: 1px solid rgba(100, 100, 150, 0.2);
            }

            .results-table th {
                color: #aaaaaa;
                font-weight: 500;
                font-size: 12px;
                text-transform: uppercase;
            }

            .results-table td {
                color: #ffffff;
                font-size: 14px;
            }

            .results-table tr.winner td {
                color: #ffd700;
                font-weight: bold;
            }

            .results-table tr.eliminated td {
                color: #888888;
                text-decoration: line-through;
            }

            .results-table .rank {
                font-weight: bold;
                width: 30px;
            }

            .results-table .score {
                color: #4ade80;
                font-weight: bold;
            }

            .results-table tr.eliminated .score {
                color: #888888;
            }

            .results-actions {
                display: flex;
                justify-content: center;
                gap: 15px;
            }

            .results-btn {
                padding: 12px 30px;
                font-size: 16px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                font-weight: 600;
            }

            .results-btn:hover {
                transform: translateY(-2px);
            }

            #results-menu-btn {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
            }

            #results-menu-btn:hover {
                box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
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
            winnerDiv.innerHTML = `🏆 ${this._escapeHtml(winnerName)} gagne!`;
        } else if (reason === 'allEliminated') {
            winnerDiv.className = 'results-winner defeat';
            winnerDiv.innerHTML = `💀 Tous éliminés!`;
        } else {
            winnerDiv.className = 'results-winner defeat';
            winnerDiv.innerHTML = `💥 Partie terminée`;
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
