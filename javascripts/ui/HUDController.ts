
import { Events } from '../core/EventBus.js';
import type { EventBus } from '../core/EventBus.js';
import { Logger } from '../utils/Logger.js';
import { t } from '../i18n.js';
import type { ScoreManager } from '../managers/ScoreManager.js';

export class HUDController {
    events: EventBus;
    scoreManager: ScoreManager;

    timerEl: HTMLElement | null;
    scoreEl: HTMLElement | null;
    minesEl: HTMLElement | null;
    hintBtn: HTMLElement | null;
    retryBtn: HTMLElement | null;
    hintExplainBtn: HTMLElement | null;
    hintDisplay: HTMLElement | null;
    notificationEl: HTMLElement | null;

    _hintOverlay: HTMLElement | null;
    _notifTimeout: ReturnType<typeof setTimeout> | null;

    constructor(eventBus: EventBus, scoreManager: ScoreManager) {
        Logger.log('HUDController', 'Initializing...');
        this.events = eventBus;
        this.scoreManager = scoreManager;

        this.timerEl = document.getElementById('timer-display');
        this.scoreEl = document.getElementById('score-display');
        this.minesEl = document.getElementById('mines-display');
        this.hintBtn = document.getElementById('hint-btn');
        this.retryBtn = document.getElementById('retry-btn');
        this.hintExplainBtn = document.getElementById('hint-explain-btn');
        this.hintDisplay = document.getElementById('hint-display');
        this.notificationEl = document.getElementById('game-notification');

        this._hintOverlay = null;
        this._notifTimeout = null;

        this.bindEvents();
    }

    bindEvents(): void {
        if (this.hintBtn) {
            this.hintBtn.addEventListener('click', () => {
                this.events.emit(Events.REQUEST_HINT);
            });
        }

        if (this.retryBtn) {
            this.retryBtn.addEventListener('click', () => {
                this.events.emit(Events.REQUEST_RETRY);
            });
        }

        if (this.hintExplainBtn) {
            this.hintExplainBtn.addEventListener('click', () => {
                this.events.emit(Events.REQUEST_HINT_EXPLAIN);
            });
        }
    }

    reset(): void {
        if (this.timerEl) {
            this.timerEl.innerText = t('hud.timer', { time: '00:00' });
            this.timerEl.classList.remove('active');
        }
        if (this.scoreEl) {
            this.scoreEl.innerText = t('hud.score', { score: 0 });
            this.scoreEl.classList.remove('active');
        }
        if (this.minesEl) {
            this.minesEl.innerText = t('hud.mines', { count: 0 });
            this.minesEl.classList.remove('active');
        }
        if (this.hintDisplay) {
            this.hintDisplay.innerText = '';
            this.hintDisplay.classList.remove('active');
        }

        this.hideRetryButton();
        this.showHintButton();
        this.dismissHintExplanation();
    }

    show(): void {
        if (this.timerEl) this.timerEl.classList.add('active');
        if (this.scoreEl) this.scoreEl.classList.add('active');
        if (this.minesEl) this.minesEl.classList.add('active');
    }

    hide(): void {
        if (this.timerEl) this.timerEl.classList.remove('active');
        if (this.scoreEl) this.scoreEl.classList.remove('active');
        if (this.minesEl) this.minesEl.classList.remove('active');
        if (this.hintDisplay) this.hintDisplay.classList.remove('active');
    }

    updateTimer(elapsedSeconds: number): void {
        if (this.timerEl && this.scoreManager) {
            this.timerEl.innerText = t('hud.timer', { time: this.scoreManager.formatTime(elapsedSeconds) });
        }
    }

    updateScore(score: number): void {
        if (this.scoreEl) {
            this.scoreEl.innerText = t('hud.score', { score: score });
        }
    }

    updateMineCounter(remaining: number): void {
        if (this.minesEl) {
            this.minesEl.innerText = t('hud.mines', { count: remaining });
        }
    }

    showHint(message: string): void {
        if (this.hintDisplay) {
            this.hintDisplay.innerText = message;
            this.hintDisplay.classList.add('active');

            setTimeout(() => {
                this.hintDisplay!.classList.remove('active');
            }, 3000);
        }
    }

    showRetryButton(): void {
        if (this.retryBtn) (this.retryBtn as HTMLElement).style.display = 'inline-flex';
        if (this.hintBtn) (this.hintBtn as HTMLElement).style.display = 'none';
    }

    hideRetryButton(): void {
        if (this.retryBtn) (this.retryBtn as HTMLElement).style.display = 'none';
    }

    showHintButton(): void {
        if (this.hintBtn) (this.hintBtn as HTMLElement).style.display = 'inline-flex';
    }

    hideHintButton(): void {
        if (this.hintBtn) (this.hintBtn as HTMLElement).style.display = 'none';
    }

    showHintExplainButton(): void {
        if (this.hintExplainBtn) (this.hintExplainBtn as HTMLElement).style.display = 'inline-flex';
    }

    hideHintExplainButton(): void {
        if (this.hintExplainBtn) (this.hintExplainBtn as HTMLElement).style.display = 'none';
    }

    showNoHintFeedback(): void {
        if (this.hintBtn) {
            this.hintBtn.classList.add('no-hint');
            setTimeout(() => this.hintBtn!.classList.remove('no-hint'), 500);
        }
    }

    onRetryUsed(): void {
        this.hideRetryButton();
        this.showHintButton();
    }

    showHintExplanation(text: string, onDismiss: () => void): void {
        this.dismissHintExplanation();

        const overlay = document.createElement('div');
        overlay.id = 'hint-explain-overlay';

        const panel = document.createElement('div');
        panel.className = 'hint-explain-panel';

        const textEl = document.createElement('p');
        textEl.className = 'hint-explain-text';
        textEl.textContent = text;

        const okBtn = document.createElement('button');
        okBtn.className = 'hint-explain-ok';
        okBtn.textContent = t('hud.hintExplainOk');
        okBtn.addEventListener('click', () => {
            this.dismissHintExplanation();
            if (onDismiss) onDismiss();
        });

        panel.appendChild(textEl);
        panel.appendChild(okBtn);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.classList.add('visible'));
        this._hintOverlay = overlay;
    }

    dismissHintExplanation(): void {
        if (this._hintOverlay) {
            this._hintOverlay.remove();
            this._hintOverlay = null;
        }
    }

    showNotification(message: string, type = 'warning', duration = 5000): void {
        if (!this.notificationEl) return;

        this.notificationEl.textContent = message;
        this.notificationEl.classList.remove('error');
        if (type === 'error') this.notificationEl.classList.add('error');

        this.notificationEl.classList.add('visible');

        if (this._notifTimeout) clearTimeout(this._notifTimeout);
        this._notifTimeout = setTimeout(() => {
            this.notificationEl!.classList.remove('visible');
        }, duration);
    }
}
