export class UIManager {
    constructor(game, renderer, scoreManager) {
        this.game = game;
        this.renderer = renderer;
        this.scoreManager = scoreManager;

        // UI Elements
        this.menuOverlay = document.getElementById('menu-overlay');
        this.startBtn = document.getElementById('start-btn');
        this.videoUpload = document.getElementById('video-upload');
        this.videoFilename = document.getElementById('video-filename');
        this.widthInput = document.getElementById('grid-width');
        this.heightInput = document.getElementById('grid-height');
        this.bombInput = document.getElementById('bomb-count');
        this.useWebcamCheckbox = document.getElementById('use-webcam');
        this.clearScoresBtn = document.getElementById('clear-scores-btn');
        this.muteBtn = document.getElementById('mute-btn');
        this.leaderboardList = document.getElementById('leaderboard-list');
        this.videoElement = document.getElementById('image');
        this.hoverHelperCheckbox = document.getElementById('hover-helper');
        this.noGuessCheckbox = document.getElementById('no-guess-mode');
        this.hintBtn = document.getElementById('hint-btn');

        // Difficulty Presets
        this.createDifficultyButtons();

        // State
        this.customVideoUrl = null;
        this.webcamStream = null;
        this.isMuted = true;

        this.bindEvents();
        this.updateLeaderboard();
        this.detectGpuTier();
    }

    createDifficultyButtons() {
        const container = document.querySelector('.menu-box');
        if (!container) return;

        const presetContainer = document.createElement('div');
        presetContainer.className = 'preset-container';
        presetContainer.style.marginBottom = '20px';
        presetContainer.style.display = 'flex';
        presetContainer.style.gap = '10px';
        presetContainer.style.justifyContent = 'center';

        const presets = [
            { name: 'Easy', w: 10, h: 10, b: 10 },
            { name: 'Medium', w: 16, h: 16, b: 40 },
            { name: 'Hard', w: 30, h: 16, b: 99 }
        ];

        presets.forEach(p => {
            const btn = document.createElement('button');
            btn.textContent = p.name;
            btn.className = 'preset-btn';
            btn.style.padding = '8px 16px';
            btn.style.borderRadius = '8px';
            btn.style.border = '1px solid rgba(255,255,255,0.3)';
            btn.style.background = 'rgba(255,255,255,0.1)';
            btn.style.color = 'white';
            btn.style.cursor = 'pointer';
            btn.style.transition = 'all 0.2s';

            btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,0.2)';
            btn.onmouseout = () => btn.style.background = 'rgba(255,255,255,0.1)';

            btn.onclick = () => {
                this.widthInput.value = p.w;
                this.heightInput.value = p.h;
                this.bombInput.value = p.b;
                // Highlight effect
                btn.style.background = 'rgba(255,255,255,0.4)';
                setTimeout(() => btn.style.background = 'rgba(255,255,255,0.1)', 200);
            };
            presetContainer.appendChild(btn);
        });

        // Insert before inputs
        const firstInput = container.querySelector('.input-group');
        container.insertBefore(presetContainer, firstInput);
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.handleStart());
        this.clearScoresBtn.addEventListener('click', () => this.handleClearScores());

        this.videoUpload.addEventListener('change', (e) => this.handleVideoUpload(e));
        this.useWebcamCheckbox.addEventListener('change', (e) => this.handleWebcamToggle(e));

        this.muteBtn.addEventListener('click', () => this.toggleMute());
    }

    async handleStart() {
        const MIN_DIM = 10;
        const MAX_W = parseInt(this.widthInput.max, 10) || 60;
        const MAX_H = parseInt(this.heightInput.max, 10) || 60;

        let width = parseInt(this.widthInput.value) || 30;
        let height = parseInt(this.heightInput.value) || 20;
        width = Math.min(Math.max(width, MIN_DIM), MAX_W);
        height = Math.min(Math.max(height, MIN_DIM), MAX_H);

        this.widthInput.value = width;
        this.heightInput.value = height;

        const bombs = parseInt(this.bombInput.value) || 50;

        // Configuration de la source vidéo
        if (this.videoUpload.files && this.videoUpload.files[0]) {
            this.stopWebcam();
            this.videoElement.muted = false;
        } else if (this.useWebcamCheckbox.checked) {
            const ok = await this.startWebcam();
            if (!ok) {
                this.useWebcamCheckbox.checked = false;
                this.resetToDefaultVideo();
            }
        } else {
            this.stopWebcam();
            this.resetToDefaultVideo();
        }

        this.videoElement.play().catch(e => console.warn("Auto-lecture bloquée:", e));
        this.menuOverlay.style.display = 'none';

        if (this.onStartGame) {
            const useHoverHelper = this.hoverHelperCheckbox ? this.hoverHelperCheckbox.checked : true;
            const noGuessMode = this.noGuessCheckbox ? this.noGuessCheckbox.checked : false;
            this.onStartGame(width, height, bombs, useHoverHelper, noGuessMode);
        }
    }

    resetToDefaultVideo() {
        if (this.customVideoUrl) {
            URL.revokeObjectURL(this.customVideoUrl);
            this.customVideoUrl = null;
        }
        this.videoElement.crossOrigin = '';
        this.videoElement.src = 'images/storm_render.mp4';
        this.videoElement.load();
        this.videoFilename.textContent = 'Default: storm_render.mp4';
        this.videoFilename.classList.remove('custom-video');
        this.videoElement.muted = false;
        this.videoElement.removeAttribute('muted');
    }

    handleVideoUpload(e) {
        const file = e.target.files[0];
        if (file) {
            this.stopWebcam();
            this.useWebcamCheckbox.checked = false;
            if (this.customVideoUrl) {
                URL.revokeObjectURL(this.customVideoUrl);
            }
            this.customVideoUrl = URL.createObjectURL(file);
            this.videoElement.src = this.customVideoUrl;
            this.videoElement.load();
            this.videoFilename.textContent = file.name;
            this.videoFilename.classList.add('custom-video');
            this.videoElement.muted = false;
            this.videoElement.removeAttribute('muted');
        }
    }

    async startWebcam() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
            this.webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            this.videoElement.srcObject = this.webcamStream;
            this.videoElement.muted = false;
            this.videoElement.removeAttribute('muted');
            this.videoFilename.textContent = 'Webcam active';
            this.videoFilename.classList.add('custom-video');
            return true;
        } catch (err) {
            console.warn('Webcam unavailable:', err);
            this.stopWebcam();
            return false;
        }
    }

    stopWebcam() {
        if (this.webcamStream) {
            this.webcamStream.getTracks().forEach(t => t.stop());
            this.webcamStream = null;
        }
        if (this.videoElement.srcObject) {
            this.videoElement.srcObject = null;
        }
    }

    handleWebcamToggle(e) {
        if (e.target.checked) {
            this.videoUpload.value = '';
            if (this.customVideoUrl) {
                URL.revokeObjectURL(this.customVideoUrl);
                this.customVideoUrl = null;
            }
            this.startWebcam().then(ok => {
                if (!ok) e.target.checked = false;
            });
        } else {
            this.stopWebcam();
            this.videoFilename.textContent = 'Default: storm_render.mp4';
            this.videoFilename.classList.remove('custom-video');
        }
    }

    handleClearScores() {
        if (confirm('Are you sure you want to clear all scores?')) {
            this.scoreManager.clearAllScores();
            this.updateLeaderboard();
        }
    }

    updateLeaderboard() {
        const topScores = this.scoreManager.getTopScores(10);

        if (topScores.length === 0) {
            this.leaderboardList.innerHTML = '<p class="no-scores">No scores recorded</p>';
            return;
        }

        this.leaderboardList.innerHTML = topScores.map((score, index) => `
            <div class="score-entry">
                <div class="score-rank">#${index + 1}</div>
                <div class="score-info">
                    <div class="score-value">${score.score.toLocaleString()} pts</div>
                    <div class="score-details">${score.width}x${score.height} | ${score.bombs} 💣 | ${this.scoreManager.formatTime(score.time)}</div>
                </div>
            </div>
        `).join('');
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.muteBtn.textContent = this.isMuted ? '🔇 OFF' : '🔊 ON';
        if (this.renderer && this.renderer.soundManager) {
            this.renderer.soundManager.setMute(this.isMuted);
        }
    }

    showMenu() {
        this.menuOverlay.style.display = 'flex';
        this.hintBtn.style.display = 'none';
        this.updateLeaderboard();
    }

    detectGpuTier() {
        const gl = document.createElement('canvas').getContext('webgl');
        if (!gl) return;

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
        const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : '';
        const id = `${vendor} ${renderer}`.toLowerCase();

        const highPatterns = /(rtx 3|rtx 4|rx 6|rx 7|m1|m2|m3|m4)/;
        let tier = 'medium';
        if (highPatterns.test(id)) tier = 'high';

        const lowPatterns = /(intel\s+(hd|uhd|iris))/;
        if (lowPatterns.test(id)) tier = 'low';

        const LIMITS = {
            high: { maxW: 200, maxH: 150 },
            medium: { maxW: 140, maxH: 100 },
            low: { maxW: 100, maxH: 80 }
        };
        const { maxW, maxH } = LIMITS[tier] || LIMITS.medium;

        this.widthInput.max = maxW;
        this.heightInput.max = maxH;
    }

    setRenderer(renderer) {
        this.renderer = renderer;
        // Sync mute state
        if (this.renderer && this.renderer.soundManager) {
            this.renderer.soundManager.setMute(this.isMuted);
        }
    }
}
