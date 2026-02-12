
import { Events } from '../core/EventBus.js';
import { Logger } from '../utils/Logger.js';
import { t } from '../i18n.js';

export class HUDController {
    constructor(eventBus, scoreManager) {
        Logger.log('HUDController', 'Initializing...');
        this.events = eventBus;
        this.scoreManager = scoreManager;

        // UI Elements
        this.timerEl = document.getElementById('timer-display');
        this.scoreEl = document.getElementById('score-display');
        this.minesEl = document.getElementById('mines-display');
        this.hintBtn = document.getElementById('hint-btn');
        this.retryBtn = document.getElementById('retry-btn');
        this.hintExplainBtn = document.getElementById('hint-explain-btn');
        this.hintDisplay = document.getElementById('hint-display');
        this.notificationEl = document.getElementById('game-notification');

        this.bindEvents();
    }

    bindEvents() {
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

    reset() {
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

    show() {
        if (this.timerEl) this.timerEl.classList.add('active');
        if (this.scoreEl) this.scoreEl.classList.add('active');
        if (this.minesEl) this.minesEl.classList.add('active');
    }

    hide() {
        if (this.timerEl) this.timerEl.classList.remove('active');
        if (this.scoreEl) this.scoreEl.classList.remove('active');
        if (this.minesEl) this.minesEl.classList.remove('active');
        if (this.hintDisplay) this.hintDisplay.classList.remove('active');
    }

    updateTimer(elapsedSeconds) {
        if (this.timerEl && this.scoreManager) {
            this.timerEl.innerText = t('hud.timer', { time: this.scoreManager.formatTime(elapsedSeconds) });
        }
    }

    updateScore(score) {
        if (this.scoreEl) {
            this.scoreEl.innerText = t('hud.score', { score: score });
        }
    }

    updateMineCounter(remaining) {
        if (this.minesEl) {
            this.minesEl.innerText = t('hud.mines', { count: remaining });
        }
    }

    showHint(message) {
        if (this.hintDisplay) {
            this.hintDisplay.innerText = message;
            this.hintDisplay.classList.add('active');

            // Auto hide after 3 seconds
            setTimeout(() => {
                this.hintDisplay.classList.remove('active');
            }, 3000);
        }
    }

    showRetryButton() {
        if (this.retryBtn) this.retryBtn.style.display = 'inline-flex';
        if (this.hintBtn) this.hintBtn.style.display = 'none';
    }

    hideRetryButton() {
        if (this.retryBtn) this.retryBtn.style.display = 'none';
    }

    showHintButton() {
        if (this.hintBtn) this.hintBtn.style.display = 'inline-flex';
    }

    hideHintButton() {
        if (this.hintBtn) this.hintBtn.style.display = 'none';
    }

    showHintExplainButton() {
        if (this.hintExplainBtn) this.hintExplainBtn.style.display = 'inline-flex';
    }

    hideHintExplainButton() {
        if (this.hintExplainBtn) this.hintExplainBtn.style.display = 'none';
    }

    showNoHintFeedback() {
        if (this.hintBtn) {
            this.hintBtn.classList.add('no-hint');
            setTimeout(() => this.hintBtn.classList.remove('no-hint'), 500);
        }
    }

    onRetryUsed() {
        this.hideRetryButton();
        this.showHintButton();
    }

    /**
     * Show the hint explanation overlay with glassmorphism panel.
     * @param {string} text - Explanation text
     * @param {Function} onDismiss - Callback when OK is clicked
     */
    showHintExplanation(text, onDismiss) {
        this.dismissHintExplanation(); // clean up any existing overlay

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

        // Trigger animation after a frame
        requestAnimationFrame(() => overlay.classList.add('visible'));

        this._hintOverlay = overlay;
    }

    /**
     * Remove the hint explanation overlay if present.
     */
    dismissHintExplanation() {
        if (this._hintOverlay) {
            this._hintOverlay.remove();
            this._hintOverlay = null;
        }
    }

    /**
     * Show an in-game notification toast (replaces alert())
     * @param {string} message - The message to display
     * @param {string} type - 'warning' or 'error'
     * @param {number} duration - Duration in ms (default 5000)
     */
    showNotification(message, type = 'warning', duration = 5000) {
        if (!this.notificationEl) return;

        this.notificationEl.textContent = message;
        this.notificationEl.classList.remove('error');
        if (type === 'error') this.notificationEl.classList.add('error');

        this.notificationEl.classList.add('visible');

        if (this._notifTimeout) clearTimeout(this._notifTimeout);
        this._notifTimeout = setTimeout(() => {
            this.notificationEl.classList.remove('visible');
        }, duration);
    }
}
