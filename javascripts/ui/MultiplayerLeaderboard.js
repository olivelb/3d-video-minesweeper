/**
 * MultiplayerLeaderboard - UI component for multiplayer statistics
 * 
 * Displays leaderboard, player stats, and recent games from the server.
 * Styled to match the solo leaderboard for consistent UI.
 */

import { t } from '../i18n.js';

export class MultiplayerLeaderboard {
    /**
     * @param {string} serverUrl - Base URL of the multiplayer server
     */
    constructor(serverUrl = null) {
        // defined in MultiplayerUI.js
        const CUSTOM_URL_KEY = 'minesweeper_custom_server_url';
        const customUrl = localStorage.getItem(CUSTOM_URL_KEY);

        this.serverUrl = serverUrl || customUrl || window.MINESWEEPER_SERVERS?.raspberryCloud || 'http://192.168.1.232:3001';
        this.container = null;
        this.statsModal = null;
        this.isServerOnline = false;
        this._createElements();

        // Re-load data when language changes (for parameterized text)
        window.addEventListener('langchange', () => {
            if (this.isServerOnline) this.refresh();
        });
    }

    /**
     * Create DOM elements - styled like the solo leaderboard
     * @private
     */
    _createElements() {
        // Main container - matches .leaderboard-box style
        this.container = document.createElement('div');
        this.container.id = 'mp-leaderboard';
        this.container.className = 'leaderboard-box mp-leaderboard hidden';
        this.container.innerHTML = `
            <h2 data-i18n="mlb.title">${t('mlb.title')}</h2>
            <div class="mp-tabs">
                <button class="mp-tab-btn active" data-sort="wins" data-i18n="mlb.tabWins">${t('mlb.tabWins')}</button>
                <button class="mp-tab-btn" data-sort="score" data-i18n="mlb.tabScore">${t('mlb.tabScore')}</button>
                <button class="mp-tab-btn" data-sort="bestScore" data-i18n="mlb.tabRecord">${t('mlb.tabRecord')}</button>
            </div>
            <div id="mp-leaderboard-list">
                <p class="no-scores" data-i18n="mlb.loading">${t('mlb.loading')}</p>
            </div>
            <button class="mp-recent-btn" data-i18n="mlb.recentGames">${t('mlb.recentGames')}</button>
        `;

        // Stats modal for detailed player info
        this.statsModal = document.createElement('div');
        this.statsModal.id = 'mp-stats-modal';
        this.statsModal.className = 'mp-stats-modal hidden';
        this.statsModal.innerHTML = `
            <div class="mp-stats-content">
                <button class="mp-close-btn">&times;</button>
                <h2 class="mp-stats-title" data-i18n="mlb.stats">${t('mlb.stats')}</h2>
                <div class="mp-stats-body">
                    <!-- Filled dynamically -->
                </div>
            </div>
        `;

        // Add styles
        this._injectStyles();

        // Bind events
        this._bindEvents();

        // Append modal to body
        document.body.appendChild(this.statsModal);
    }

    /**
     * Inject CSS styles - matching solo leaderboard aesthetic
     * @private
     */
    _injectStyles() {
        if (document.getElementById('mp-leaderboard-styles')) return;

        const style = document.createElement('style');
        style.id = 'mp-leaderboard-styles';
        style.textContent = `
            /* Multiplayer Leaderboard - matches solo leaderboard */
            .mp-leaderboard {
                margin-top: 20px;
            }

            .mp-leaderboard.hidden {
                display: none;
            }

            .mp-leaderboard h2 {
                background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }

            .mp-tabs {
                display: flex;
                gap: 6px;
                margin-bottom: 14px;
                padding: 4px;
                background: rgba(0, 0, 0, 0.15);
                border-radius: 12px;
            }

            .mp-tab-btn {
                flex: 1;
                padding: 8px 10px;
                background: transparent;
                border: 1px solid transparent;
                border-radius: 10px;
                color: rgba(255, 255, 255, 0.5);
                cursor: pointer;
                font-size: 0.8em;
                font-weight: 600;
                font-family: inherit;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .mp-tab-btn:hover {
                color: rgba(255, 255, 255, 0.8);
                background: rgba(255, 255, 255, 0.05);
            }

            .mp-tab-btn.active {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.2);
                color: #fff;
            }

            #mp-leaderboard-list {
                margin-bottom: 14px;
            }

            /* Score entries - matches solo .score-entry */
            .mp-score-entry {
                background: rgba(255, 255, 255, 0.03);
                padding: 12px 16px;
                margin: 8px 0;
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                cursor: pointer;
            }

            .mp-score-entry:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(255, 255, 255, 0.2);
                transform: translateX(8px);
            }

            .mp-score-rank {
                font-weight: 800;
                font-size: 1.15em;
                min-width: 28px;
            }

            .mp-score-rank.rank-1 { color: #ffd700; }
            .mp-score-rank.rank-2 { color: #c0c0c0; }
            .mp-score-rank.rank-3 { color: #cd7f32; }
            .mp-score-rank:not(.rank-1):not(.rank-2):not(.rank-3) { color: rgba(255, 255, 255, 0.5); }

            .mp-score-info {
                flex: 1;
                text-align: left;
                margin: 0 12px;
            }

            .mp-score-name {
                font-weight: 600;
                color: #fff;
            }

            .mp-score-details {
                font-size: 0.85em;
                opacity: 0.7;
                margin-top: 2px;
            }

            .mp-score-value {
                font-weight: 700;
                font-size: 1.1em;
                color: #4facfe;
            }

            .mp-recent-btn {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: rgba(255, 255, 255, 0.7);
                padding: 10px 20px;
                border-radius: 10px;
                cursor: pointer;
                font-size: 0.9em;
                font-family: inherit;
                transition: all 0.3s ease;
                width: 100%;
            }

            .mp-recent-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.2);
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
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(25px);
                -webkit-backdrop-filter: blur(25px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 24px;
                padding: 30px;
                max-width: 480px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                position: relative;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            }

            .mp-close-btn {
                position: absolute;
                top: 15px;
                right: 20px;
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.6);
                font-size: 28px;
                cursor: pointer;
                padding: 0;
                line-height: 1;
                transition: color 0.2s;
            }

            .mp-close-btn:hover {
                color: #fff;
            }

            .mp-stats-title {
                margin: 0 0 25px 0;
                background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                font-size: 1.6em;
                font-weight: 800;
            }

            .mp-stats-body {
                color: #fff;
            }

            .mp-stats-section {
                margin-bottom: 20px;
            }

            .mp-stats-section h4 {
                margin: 0 0 12px 0;
                color: rgba(255, 255, 255, 0.5);
                font-size: 0.75em;
                text-transform: uppercase;
                letter-spacing: 0.1em;
            }

            .mp-stats-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
            }

            .mp-stat-box {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                padding: 14px;
                text-align: center;
            }

            .mp-stat-box .value {
                font-size: 1.6em;
                font-weight: 800;
                color: #fff;
            }

            .mp-stat-box .label {
                font-size: 0.75em;
                color: rgba(255, 255, 255, 0.5);
                margin-top: 4px;
            }

            .mp-stat-box.highlight .value {
                color: #ffd700;
            }

            .mp-recent-list {
                max-height: 250px;
                overflow-y: auto;
            }

            .mp-recent-item {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 10px;
                padding: 10px 14px;
                margin-bottom: 8px;
            }

            .mp-recent-header {
                display: flex;
                justify-content: space-between;
                font-size: 0.85em;
                color: rgba(255, 255, 255, 0.5);
                margin-bottom: 6px;
            }

            .mp-recent-players {
                display: flex;
                gap: 12px;
                font-size: 0.9em;
            }

            .mp-recent-player {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .mp-recent-player.winner { color: #4f4; }
            .mp-recent-player.eliminated { color: #f66; }
            .mp-recent-player.normal { color: rgba(255, 255, 255, 0.7); }

            .mp-loading {
                text-align: center;
                padding: 20px;
                color: rgba(255, 255, 255, 0.5);
            }

            .mp-error {
                text-align: center;
                padding: 20px;
                color: #f88;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Bind event handlers
     * @private
     */
    _bindEvents() {
        // Tab buttons
        this.container.querySelectorAll('.mp-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.container.querySelectorAll('.mp-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadLeaderboard(btn.dataset.sort);
            });
        });

        // Recent games button
        this.container.querySelector('.mp-recent-btn').addEventListener('click', () => {
            this.showRecentGames();
        });

        // Close modal
        this.statsModal.querySelector('.mp-close-btn').addEventListener('click', () => {
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
     * Check if server is online before showing
     * @returns {Promise<boolean>}
     */
    async checkServerStatus() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(`${this.serverUrl}/health`, {
                signal: controller.signal
            });
            clearTimeout(timeout);

            this.isServerOnline = response.ok;
            return this.isServerOnline;
        } catch (err) {
            this.isServerOnline = false;
            return false;
        }
    }

    /**
     * Show the leaderboard (only if server is online)
     */
    async show() {
        const isOnline = await this.checkServerStatus();

        if (isOnline) {
            this.container.classList.remove('hidden');
            this.loadLeaderboard();
        } else {
            // Hide if server is offline
            this.container.classList.add('hidden');
        }
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
        const activeTab = this.container.querySelector('.mp-tab-btn.active');
        this.loadLeaderboard(activeTab?.dataset.sort || 'wins');
    }

    /**
     * Load leaderboard data from server
     * @param {string} sortBy - wins, score, bestScore
     */
    async loadLeaderboard(sortBy = 'wins') {
        const list = this.container.querySelector('#mp-leaderboard-list');
        list.innerHTML = '<p class="mp-loading">' + t('mlb.loading') + '</p>';

        try {
            const response = await fetch(`${this.serverUrl}/api/leaderboard?sortBy=${sortBy}&limit=10`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || t('mlb.serverError'));
            }

            if (data.leaderboard.length === 0) {
                list.innerHTML = '<p class="no-scores">' + t('mlb.noGames') + '</p>';
                return;
            }

            list.innerHTML = data.leaderboard.map((p, i) => `
                <div class="mp-score-entry" data-player="${this._escapeHtml(p.name)}">
                    <span class="mp-score-rank rank-${i + 1}">${i + 1}</span>
                    <div class="mp-score-info">
                        <div class="mp-score-name">${this._escapeHtml(p.name)}</div>
                        <div class="mp-score-details">${t('mlb.winsDetail', { wins: p.wins, games: p.gamesPlayed, rate: p.winRate })}</div>
                    </div>
                    <span class="mp-score-value">${this._formatMainStat(p, sortBy)}</span>
                </div>
            `).join('');

            // Click on player to see stats
            list.querySelectorAll('.mp-score-entry').forEach(entry => {
                entry.addEventListener('click', () => {
                    this.showPlayerStats(entry.dataset.player);
                });
            });

        } catch (err) {
            console.error('[MultiplayerLeaderboard] Load error:', err);
            list.innerHTML = `<p class="mp-error">${err.message}</p>`;
        }
    }

    /**
     * Format main stat value based on sort
     * @private
     */
    _formatMainStat(player, sortBy) {
        switch (sortBy) {
            case 'wins': return player.wins;
            case 'score': return player.totalScore.toLocaleString();
            case 'bestScore': return player.bestScore.toLocaleString();
            default: return player.wins;
        }
    }

    /**
     * Show detailed stats for a player
     * @param {string} playerName 
     */
    async showPlayerStats(playerName) {
        const body = this.statsModal.querySelector('.mp-stats-body');
        body.innerHTML = '<p class="mp-loading">' + t('mlb.loading') + '</p>';
        this.statsModal.querySelector('.mp-stats-title').textContent = playerName;
        this.statsModal.classList.remove('hidden');

        try {
            const response = await fetch(`${this.serverUrl}/api/stats/${encodeURIComponent(playerName)}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || t('mlb.playerNotFound'));
            }

            const s = data.stats;
            body.innerHTML = `
                <div class="mp-stats-section">
                    <h4>${t('mlb.sectionPerf')}</h4>
                    <div class="mp-stats-grid">
                        <div class="mp-stat-box highlight">
                            <div class="value">${s.wins}</div>
                            <div class="label">${t('mlb.wins')}</div>
                        </div>
                        <div class="mp-stat-box">
                            <div class="value">${s.gamesPlayed}</div>
                            <div class="label">${t('mlb.games')}</div>
                        </div>
                        <div class="mp-stat-box">
                            <div class="value">${s.winRate}%</div>
                            <div class="label">${t('mlb.winRate')}</div>
                        </div>
                    </div>
                </div>
                <div class="mp-stats-section">
                    <h4>${t('mlb.sectionScores')}</h4>
                    <div class="mp-stats-grid">
                        <div class="mp-stat-box highlight">
                            <div class="value">${s.bestScore.toLocaleString()}</div>
                            <div class="label">${t('mlb.record')}</div>
                        </div>
                        <div class="mp-stat-box">
                            <div class="value">${s.avgScore.toLocaleString()}</div>
                            <div class="label">${t('mlb.average')}</div>
                        </div>
                        <div class="mp-stat-box">
                            <div class="value">${s.totalScore.toLocaleString()}</div>
                            <div class="label">${t('mlb.total')}</div>
                        </div>
                    </div>
                </div>
                <div class="mp-stats-section">
                    <h4>${t('mlb.sectionStats')}</h4>
                    <div class="mp-stats-grid">
                        <div class="mp-stat-box">
                            <div class="value">${s.cellsRevealed.toLocaleString()}</div>
                            <div class="label">${t('mlb.cells')}</div>
                        </div>
                        <div class="mp-stat-box">
                            <div class="value">${s.correctFlags}</div>
                            <div class="label">${t('mlb.correctFlags')}</div>
                        </div>
                        <div class="mp-stat-box">
                            <div class="value">${s.timesEliminated}</div>
                            <div class="label">${t('mlb.eliminated')}</div>
                        </div>
                    </div>
                </div>
                ${s.recentGames?.length > 0 ? `
                <div class="mp-stats-section">
                    <h4>${t('mlb.recentSection')}</h4>
                    <div class="mp-recent-list">
                        ${s.recentGames.map(g => `
                            <div class="mp-recent-item">
                                <div class="mp-recent-header">
                                    <span>${g.width}×${g.height} · ${g.bombCount}💣</span>
                                    <span>${this._formatDuration(g.duration)}</span>
                                </div>
                                <div class="mp-recent-players">
                                    <span class="mp-recent-player ${g.rank === 1 ? 'winner' : (g.eliminated ? 'eliminated' : 'normal')}">
                                        ${g.rank === 1 ? '🏆' : (g.eliminated ? '💀' : '#' + g.rank)} ${g.score} pts
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            `;

        } catch (err) {
            console.error('[MultiplayerLeaderboard] Stats error:', err);
            body.innerHTML = `<p class="mp-error">${err.message}</p>`;
        }
    }

    /**
     * Show recent games modal
     */
    async showRecentGames() {
        const body = this.statsModal.querySelector('.mp-stats-body');
        body.innerHTML = '<p class="mp-loading">' + t('mlb.loading') + '</p>';
        this.statsModal.querySelector('.mp-stats-title').textContent = t('mlb.recentGamesTitle');
        this.statsModal.classList.remove('hidden');

        try {
            const response = await fetch(`${this.serverUrl}/api/recent-games?limit=20`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || t('mlb.serverError'));
            }

            if (data.games.length === 0) {
                body.innerHTML = '<p class="no-scores">' + t('mlb.noGames') + '</p>';
                return;
            }

            body.innerHTML = `
                <div class="mp-recent-list" style="max-height: 400px;">
                    ${data.games.map(g => `
                        <div class="mp-recent-item">
                            <div class="mp-recent-header">
                                <span>${g.width}×${g.height} · ${g.bombCount}💣 · ${g.playerCount}👥</span>
                                <span>${this._formatDuration(g.duration)}</span>
                            </div>
                            <div class="mp-recent-players">
                                ${g.players.map(p => `
                                    <span class="mp-recent-player ${p.rank === 1 ? 'winner' : (p.eliminated ? 'eliminated' : 'normal')}">
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
            body.innerHTML = `<p class="mp-error">${err.message}</p>`;
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
