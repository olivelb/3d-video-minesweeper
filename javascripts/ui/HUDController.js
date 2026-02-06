
import { Events } from '../core/EventBus.js';
import { Logger } from '../utils/Logger.js';

export class HUDController {
    constructor(eventBus, scoreManager) {
        Logger.log('HUDController', 'Initializing...');
        this.events = eventBus;
        this.scoreManager = scoreManager;

        // UI Elements
        this.timerEl = document.getElementById('timer-display');
        this.scoreEl = document.getElementById('score-display');
        this.hintBtn = document.getElementById('hint-btn');
        this.retryBtn = document.getElementById('retry-btn');
        this.hintDisplay = document.getElementById('hint-display');

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
    }

    reset() {
        if (this.timerEl) {
            this.timerEl.innerText = '⏱️ 00:00';
            this.timerEl.classList.remove('active');
        }
        if (this.scoreEl) {
            this.scoreEl.innerText = '🏆 Score: 0';
            this.scoreEl.classList.remove('active');
        }
        if (this.hintDisplay) {
            this.hintDisplay.innerText = '';
            this.hintDisplay.classList.remove('active');
        }

        this.hideRetryButton();
        this.showHintButton();
    }

    show() {
        if (this.timerEl) this.timerEl.classList.add('active');
        if (this.scoreEl) this.scoreEl.classList.add('active');
    }

    hide() {
        if (this.timerEl) this.timerEl.classList.remove('active');
        if (this.scoreEl) this.scoreEl.classList.remove('active');
        if (this.hintDisplay) this.hintDisplay.classList.remove('active');
    }

    updateTimer(elapsedSeconds) {
        if (this.timerEl && this.scoreManager) {
            this.timerEl.innerText = '⏱️ ' + this.scoreManager.formatTime(elapsedSeconds);
        }
    }

    updateScore(score) {
        if (this.scoreEl) {
            this.scoreEl.innerText = '🏆 Score: ' + score;
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
}
