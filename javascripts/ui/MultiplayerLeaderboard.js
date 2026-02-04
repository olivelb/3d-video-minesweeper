/**
 * MultiplayerLeaderboard - UI component for multiplayer statistics
 * 
 * Displays leaderboard, player stats, and recent games from the server.
 */

export class MultiplayerLeaderboard {
    /**
     * @param {string} serverUrl - Base URL of the multiplayer server
     */
    constructor(serverUrl = null) {
        this.serverUrl = serverUrl || window.MINESWEEPER_SERVERS?.raspberryCloud || 'http://192.168.1.232:3001';
        this.container = null;
        this.statsModal = null;
        this._createElements();
    }

    /**
     * Create DOM elements
     * @private
     */
    _createElements() {
        // Main container for leaderboard
        this.container = document.createElement('div');
        this.container.id = 'mp-leaderboard';
        this.container.className = 'mp-leaderboard hidden';
        this.container.innerHTML = `
            <div class="mp-leaderboard-header">
                <h3>🎮 Classement Multijoueur</h3>
                <button class="refresh-btn" title="Actualiser">🔄</button>
            </div>
            <div class="mp-leaderboard-tabs">
                <button class="tab-btn active" data-sort="wins">Victoires</button>
                <button class="tab-btn" data-sort="score">Score Total</button>
                <button class="tab-btn" data-sort="bestScore">Meilleur Score</button>
            </div>
            <div class="mp-leaderboard-content">
                <div class="leaderboard-loading">Chargement...</div>
            </div>
            <div class="mp-leaderboard-footer">
                <button class="recent-games-btn">📜 Parties récentes</button>
            </div>
        `;

        // Stats modal for detailed player info
        this.statsModal = document.createElement('div');
        this.statsModal.id = 'mp-stats-modal';
        this.statsModal.className = 'mp-stats-modal hidden';
        this.statsModal.innerHTML = `
            <div class="mp-stats-content">
                <button class="close-btn">&times;</button>
                <h2 class="stats-title">Statistiques</h2>
                <div class="stats-body">
                    <!-- Filled dynamically -->
                </div>
            </div>
        `;

        // Add styles
        this._injectStyles();

        // Bind events
        this._bindEvents();

        // Append to body (hidden initially)
        document.body.appendChild(this.statsModal);
    }

    /**
     * Inject CSS styles
     * @private
     */
    _injectStyles() {
        if (document.getElementById('mp-leaderboard-styles')) return;

        const style = document.createElement('style');
        style.id = 'mp-leaderboard-styles';
        style.textContent = `
            .mp-leaderboard {
                background: rgba(20, 20, 40, 0.95);
                border: 1px solid rgba(100, 100, 150, 0.3);
                border-radius: 12px;
                padding: 15px;
                margin-top: 20px;
                max-width: 400px;
                font-family: 'Segoe UI', Arial, sans-serif;
            }

            .mp-leaderboard.hidden {
                display: none;
            }

            .mp-leaderboard-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }

            .mp-leaderboard-header h3 {
                margin: 0;
                color: #ffd700;
                font-size: 16px;
            }

            .mp-leaderboard .refresh-btn {
                background: none;
                border: none;
                font-size: 16px;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
                transition: background 0.2s;
            }

            .mp-leaderboard .refresh-btn:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .mp-leaderboard-tabs {
                display: flex;
                gap: 5px;
                margin-bottom: 10px;
            }

            .mp-leaderboard .tab-btn {
                flex: 1;
                padding: 6px 8px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(100, 100, 150, 0.2);
                border-radius: 6px;
                color: #aaa;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .mp-leaderboard .tab-btn:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .mp-leaderboard .tab-btn.active {
                background: rgba(100, 150, 255, 0.2);
                border-color: rgba(100, 150, 255, 0.4);
                color: #fff;
            }

            .mp-leaderboard-content {
                min-height: 100px;
            }

            .leaderboard-loading {
                text-align: center;
                padding: 20px;
                color: #888;
            }

            .leaderboard-error {
                text-align: center;
                padding: 20px;
                color: #f88;
            }

            .leaderboard-empty {
                text-align: center;
                padding: 20px;
                color: #888;
                font-style: italic;
            }

            .leaderboard-table {
                width: 100%;
                border-collapse: collapse;
            }

            .leaderboard-table th {
                text-align: left;
                padding: 6px 8px;
                color: #888;
                font-weight: normal;
                font-size: 11px;
                border-bottom: 1px solid rgba(100, 100, 150, 0.2);
            }

            .leaderboard-table td {
                padding: 8px;
                font-size: 13px;
                border-bottom: 1px solid rgba(100, 100, 150, 0.1);
            }

            .leaderboard-table tr:hover {
                background: rgba(255, 255, 255, 0.05);
                cursor: pointer;
            }

            .leaderboard-table .rank {
                width: 30px;
                color: #888;
            }

            .leaderboard-table .rank-1 { color: #ffd700; }
            .leaderboard-table .rank-2 { color: #c0c0c0; }
            .leaderboard-table .rank-3 { color: #cd7f32; }

            .leaderboard-table .name {
                color: #fff;
            }

            .leaderboard-table .stat {
                text-align: right;
                color: #aaa;
            }

            .leaderboard-table .wins {
                color: #4f4;
            }

            .mp-leaderboard-footer {
                margin-top: 10px;
                text-align: center;
            }

            .mp-leaderboard .recent-games-btn {
                padding: 8px 16px;
                background: rgba(100, 100, 150, 0.2);
                border: 1px solid rgba(100, 100, 150, 0.3);
                border-radius: 6px;
                color: #aaa;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .mp-leaderboard .recent-games-btn:hover {
                background: rgba(100, 100, 150, 0.3);
                color: #fff;
            }

            /* Stats Modal */
            .mp-stats-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
                opacity: 1;
                transition: opacity 0.3s;
            }

            .mp-stats-modal.hidden {
                opacity: 0;
                pointer-events: none;
            }

            .mp-stats-content {
                background: linear-gradient(135deg, rgba(30, 30, 60, 0.98), rgba(20, 20, 40, 0.98));
                border: 1px solid rgba(100, 100, 150, 0.4);
                border-radius: 16px;
                padding: 25px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                position: relative;
            }

            .mp-stats-content .close-btn {
                position: absolute;
                top: 15px;
                right: 15px;
                background: none;
                border: none;
                color: #888;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                line-height: 1;
            }

            .mp-stats-content .close-btn:hover {
                color: #fff;
            }

            .stats-title {
                margin: 0 0 20px 0;
                color: #ffd700;
                font-size: 20px;
            }

            .stats-body {
                color: #ddd;
            }

            .stats-section {
                margin-bottom: 20px;
            }

            .stats-section h4 {
                margin: 0 0 10px 0;
                color: #888;
                font-size: 12px;
                text-transform: uppercase;
            }

            .stats-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
            }

            .stat-box {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                padding: 12px;
                text-align: center;
            }

            .stat-box .value {
                font-size: 24px;
                font-weight: bold;
                color: #fff;
            }

            .stat-box .label {
                font-size: 11px;
                color: #888;
                margin-top: 4px;
            }

            .stat-box.highlight .value {
                color: #ffd700;
            }

            .recent-games-list {
                max-height: 200px;
                overflow-y: auto;
            }

            .recent-game-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 10px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 6px;
                margin-bottom: 5px;
            }

            .recent-game-item .game-info {
                color: #888;
                font-size: 12px;
            }

            .recent-game-item .game-result {
                font-weight: bold;
            }

            .recent-game-item .game-result.win {
                color: #4f4;
            }

            .recent-game-item .game-result.loss {
                color: #f44;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Bind event handlers
     * @private
     */
    _bindEvents() {
        // Refresh button
        this.container.querySelector('.refresh-btn').addEventListener('click', () => {
            this.refresh();
        });

        // Tab buttons
        this.container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadLeaderboard(btn.dataset.sort);
            });
        });

        // Recent games button
        this.container.querySelector('.recent-games-btn').addEventListener('click', () => {
            this.showRecentGames();
        });

        // Close modal
        this.statsModal.querySelector('.close-btn').addEventListener('click', () => {
            this.statsModal.classList.add('hidden');
        });

        // Close modal on backdrop click
        this.statsModal.addEventListener('click', (e) => {
            if (e.target === this.statsModal) {
                this.statsModal.classList.add('hidden');
            }
        });
    }

    /**
     * Get DOM element to insert into page
     * @returns {HTMLElement}
     */
    getElement() {
        return this.container;
    }

    /**
     * Show the leaderboard
     */
    show() {
        this.container.classList.remove('hidden');
        this.loadLeaderboard();
    }

    /**
     * Hide the leaderboard
     */
    hide() {
        this.container.classList.add('hidden');
    }

    /**
     * Refresh current view
     */
    refresh() {
        const activeTab = this.container.querySelector('.tab-btn.active');
        this.loadLeaderboard(activeTab?.dataset.sort || 'wins');
    }

    /**
     * Load leaderboard data from server
     * @param {string} sortBy - wins, score, bestScore, winRate, avgScore
     */
    async loadLeaderboard(sortBy = 'wins') {
        const content = this.container.querySelector('.mp-leaderboard-content');
        content.innerHTML = '<div class="leaderboard-loading">Chargement...</div>';

        try {
            const response = await fetch(`${this.serverUrl}/api/leaderboard?sortBy=${sortBy}&limit=10`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Unknown error');
            }

            if (data.leaderboard.length === 0) {
                content.innerHTML = '<div class="leaderboard-empty">Aucune partie jouée</div>';
                return;
            }

            const sortLabel = {
                wins: 'Victoires',
                score: 'Score Total',
                bestScore: 'Meilleur',
                winRate: 'Win %',
                avgScore: 'Moyenne'
            }[sortBy] || 'Stat';

            content.innerHTML = `
                <table class="leaderboard-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Joueur</th>
                            <th style="text-align:right">${sortLabel}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.leaderboard.map((p, i) => `
                            <tr data-player="${this._escapeHtml(p.name)}">
                                <td class="rank rank-${i + 1}">${i + 1}</td>
                                <td class="name">${this._escapeHtml(p.name)}</td>
                                <td class="stat ${sortBy === 'wins' ? 'wins' : ''}">${this._formatStat(p, sortBy)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            // Click on player row to see stats
            content.querySelectorAll('tr[data-player]').forEach(row => {
                row.addEventListener('click', () => {
                    this.showPlayerStats(row.dataset.player);
                });
            });

        } catch (err) {
            console.error('[MultiplayerLeaderboard] Load error:', err);
            content.innerHTML = `<div class="leaderboard-error">Erreur: ${err.message}</div>`;
        }
    }

    /**
     * Format stat value for display
     * @private
     */
    _formatStat(player, sortBy) {
        switch (sortBy) {
            case 'wins': return `${player.wins} (${player.gamesPlayed} parties)`;
            case 'score': return player.totalScore.toLocaleString();
            case 'bestScore': return player.bestScore.toLocaleString();
            case 'winRate': return `${player.winRate}%`;
            case 'avgScore': return player.avgScore.toLocaleString();
            default: return player.wins;
        }
    }

    /**
     * Show detailed stats for a player
     * @param {string} playerName 
     */
    async showPlayerStats(playerName) {
        const body = this.statsModal.querySelector('.stats-body');
        body.innerHTML = '<div class="leaderboard-loading">Chargement...</div>';
        this.statsModal.querySelector('.stats-title').textContent = playerName;
        this.statsModal.classList.remove('hidden');

        try {
            const response = await fetch(`${this.serverUrl}/api/stats/${encodeURIComponent(playerName)}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Player not found');
            }

            const s = data.stats;
            body.innerHTML = `
                <div class="stats-section">
                    <h4>Performance</h4>
                    <div class="stats-grid">
                        <div class="stat-box highlight">
                            <div class="value">${s.wins}</div>
                            <div class="label">Victoires</div>
                        </div>
                        <div class="stat-box">
                            <div class="value">${s.gamesPlayed}</div>
                            <div class="label">Parties</div>
                        </div>
                        <div class="stat-box">
                            <div class="value">${s.winRate}%</div>
                            <div class="label">Win Rate</div>
                        </div>
                    </div>
                </div>
                <div class="stats-section">
                    <h4>Scores</h4>
                    <div class="stats-grid">
                        <div class="stat-box highlight">
                            <div class="value">${s.bestScore.toLocaleString()}</div>
                            <div class="label">Meilleur</div>
                        </div>
                        <div class="stat-box">
                            <div class="value">${s.avgScore.toLocaleString()}</div>
                            <div class="label">Moyenne</div>
                        </div>
                        <div class="stat-box">
                            <div class="value">${s.totalScore.toLocaleString()}</div>
                            <div class="label">Total</div>
                        </div>
                    </div>
                </div>
                <div class="stats-section">
                    <h4>Statistiques de jeu</h4>
                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="value">${s.cellsRevealed.toLocaleString()}</div>
                            <div class="label">Cellules</div>
                        </div>
                        <div class="stat-box">
                            <div class="value">${s.correctFlags}</div>
                            <div class="label">Drapeaux ✓</div>
                        </div>
                        <div class="stat-box">
                            <div class="value">${s.timesEliminated}</div>
                            <div class="label">Éliminations</div>
                        </div>
                    </div>
                </div>
                ${s.recentGames?.length > 0 ? `
                <div class="stats-section">
                    <h4>Parties récentes</h4>
                    <div class="recent-games-list">
                        ${s.recentGames.map(g => `
                            <div class="recent-game-item">
                                <span class="game-info">${g.width}×${g.height} · ${g.bombCount}💣 · ${this._formatDuration(g.duration)}</span>
                                <span class="game-result ${g.rank === 1 ? 'win' : 'loss'}">
                                    ${g.rank === 1 ? '🏆 ' + g.score : (g.eliminated ? '💀 ' : '#' + g.rank + ' ')}${g.score}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            `;

        } catch (err) {
            console.error('[MultiplayerLeaderboard] Stats error:', err);
            body.innerHTML = `<div class="leaderboard-error">Erreur: ${err.message}</div>`;
        }
    }

    /**
     * Show recent games
     */
    async showRecentGames() {
        const body = this.statsModal.querySelector('.stats-body');
        body.innerHTML = '<div class="leaderboard-loading">Chargement...</div>';
        this.statsModal.querySelector('.stats-title').textContent = '📜 Parties Récentes';
        this.statsModal.classList.remove('hidden');

        try {
            const response = await fetch(`${this.serverUrl}/api/recent-games?limit=20`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Unknown error');
            }

            if (data.games.length === 0) {
                body.innerHTML = '<div class="leaderboard-empty">Aucune partie enregistrée</div>';
                return;
            }

            body.innerHTML = `
                <div class="recent-games-list" style="max-height: 400px;">
                    ${data.games.map(g => `
                        <div class="recent-game-item" style="flex-direction: column; align-items: flex-start;">
                            <div style="display: flex; justify-content: space-between; width: 100%;">
                                <span class="game-info">${g.width}×${g.height} · ${g.bombCount}💣 · ${g.playerCount} joueurs</span>
                                <span class="game-info">${this._formatDuration(g.duration)}</span>
                            </div>
                            <div style="display: flex; gap: 10px; margin-top: 5px;">
                                ${g.players.map(p => `
                                    <span style="color: ${p.rank === 1 ? '#4f4' : (p.eliminated ? '#f44' : '#aaa')}">
                                        ${p.rank === 1 ? '🏆' : (p.eliminated ? '💀' : '')} ${this._escapeHtml(p.name)}: ${p.score}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

        } catch (err) {
            console.error('[MultiplayerLeaderboard] Recent games error:', err);
            body.innerHTML = `<div class="leaderboard-error">Erreur: ${err.message}</div>`;
        }
    }

    /**
     * Format duration in seconds to mm:ss
     * @private
     */
    _formatDuration(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * Escape HTML to prevent XSS
     * @private
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

export default MultiplayerLeaderboard;
