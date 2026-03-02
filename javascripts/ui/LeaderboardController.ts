import { t, getLocale } from '../i18n.js';
import type { ScoreManager } from '../managers/ScoreManager.js';

const DIFFICULTY_PRESETS: Record<string, { width: number; height: number; bombs: number }> = {
    easy: { width: 8, height: 8, bombs: 10 },
    medium: { width: 16, height: 16, bombs: 40 },
    hard: { width: 30, height: 16, bombs: 99 }
};

export class LeaderboardController {
    scoreManager: ScoreManager;
    contentEl: HTMLElement | null;
    panelEl: HTMLElement | null;
    currentFilter: string;

    constructor(scoreManager: ScoreManager) {
        this.scoreManager = scoreManager;
        this.contentEl = document.getElementById('leaderboard-list');
        this.panelEl = document.querySelector('.leaderboard-box');
        this.currentFilter = 'all';
    }

    init(): void {
        this._bindEvents();
    }

    _bindEvents(): void {
        const clearBtn = document.getElementById('clear-scores-btn') || document.getElementById('btn-clear-scores');
        clearBtn?.addEventListener('click', () => {
            this._confirmClearScores();
        });

        document.querySelectorAll('.leaderboard-filter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const difficulty = target.dataset.difficulty;
                this._setActiveFilter(target);
                this.loadScores(difficulty);
            });
        });
    }

    show(): void {
        this.panelEl?.classList.remove('hidden');
        this.loadScores(this.currentFilter);
    }

    hide(): void {
        this.panelEl?.classList.add('hidden');
    }

    toggle(): void {
        if (this.panelEl?.classList.contains('hidden')) {
            this.show();
        } else {
            this.hide();
        }
    }

    loadScores(difficulty = 'all'): void {
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

    _renderScores(scores: any[]): void {
        if (!this.contentEl) return;

        const html = scores.slice(0, 10).map((score, index) => {
            const rank = index + 1;
            const time = this._formatTime(score.time);
            const config = `${score.width}×${score.height}`;

            return `
                <div class="score-entry">
                    <span class="rank">#${rank}</span>
                    <span class="score-value">${score.score.toLocaleString()}</span>
                    <span class="score-details">${config} • ${time}s</span>
                </div>
            `;
        }).join('');

        this.contentEl.innerHTML = html;
    }

    _renderEmpty(message: string): void {
        if (!this.contentEl) return;
        this.contentEl.innerHTML = `
            <div class="leaderboard-empty">
                <p>${message}</p>
            </div>
        `;
    }

    _formatRank(rank: number): string {
        switch (rank) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            default: return `${rank}`;
        }
    }

    _formatTime(seconds: number): string {
        if (typeof seconds !== 'number' || isNaN(seconds)) {
            return '--:--';
        }
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    _formatDate(date: string | number): string {
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

    _formatConfig(score: any): string {
        const { width, height, bombs } = score;
        if (!width || !height) return '-';
        return `${width}×${height} (${bombs || '?'}💣)`;
    }

    _formatDifficulty(score: any): string {
        const { width, height, bombs } = score;
        for (const [name, preset] of Object.entries(DIFFICULTY_PRESETS)) {
            if (preset.width === width && preset.height === height && preset.bombs === bombs) {
                return this._getDifficultyLabel(name);
            }
        }
        return 'Custom';
    }

    _getDifficultyLabel(difficulty: string): string {
        const labels: Record<string, string> = {
            easy: t('lb.easy'),
            medium: t('lb.medium'),
            hard: t('lb.hard'),
            custom: t('lb.custom')
        };
        return labels[difficulty] || difficulty;
    }

    _setActiveFilter(activeBtn: HTMLElement): void {
        document.querySelectorAll('.leaderboard-filter').forEach(btn => {
            btn.classList.remove('active');
        });
        activeBtn.classList.add('active');
    }

    _confirmClearScores(): void {
        const confirmed = confirm(t('lb.clearConfirm'));
        if (confirmed && this.scoreManager) {
            this.scoreManager.clearAllScores();
            this.loadScores(this.currentFilter);
        }
    }

    _escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    addScore(scoreData: any): void {
        if (this.scoreManager) {
            this.scoreManager.saveScore(scoreData);
            if (!this.panelEl?.classList.contains('hidden')) {
                this.loadScores(this.currentFilter);
            }
        }
    }
}
