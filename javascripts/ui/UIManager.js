import { networkManager } from '../network/NetworkManager.js';
import { MultiplayerUI } from './MultiplayerUI.js';
import { Events } from '../core/EventBus.js';

// Configuration: Dedicated server URL (Raspberry Pi)
const DEDICATED_SERVER_URL = window.MINESWEEPER_SERVERS?.raspberryCloud || 'http://192.168.1.232:3001';

export class UIManager {
    constructor(game, renderer, scoreManager, eventBus) {
        this.game = game;
        this.renderer = renderer;
        this.scoreManager = scoreManager;
        this.events = eventBus;

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
        if (this.videoElement) {
            this.videoElement.muted = this.isMuted;
            this.videoElement.volume = 0.5; // Match SoundManager default
        }
        this.hoverHelperCheckbox = document.getElementById('hover-helper');
        this.noGuessCheckbox = document.getElementById('no-guess-mode');
        this.hintBtn = document.getElementById('hint-btn');
        this.flagStyleBtn = document.getElementById('flag-style-btn');
        this.replayBtn = document.getElementById('replay-btn');
        this.inGameRetryBtn = document.getElementById('retry-btn');

        // Difficulty Presets
        this.createDifficultyButtons();

        // Check for saved grid and show replay button
        this.checkReplayAvailable();

        // State
        this.customVideoUrl = null;
        this.webcamStream = null;
        this.isMuted = false;
        this.mediaType = 'video';
        this.imageElement = null;
        this.dedicatedServerUrl = null;
        this.isReady = false;

        this.bindEvents();
        this.updateLeaderboard();
        this.currentFlagStyle = localStorage.getItem('flagStyle') || 'particle';
        this.selectedPresetValue = 'video:images/storm_render.mp4';
        this.updateFlagStyleButton();
        this.detectGpuTier();
        this.displayPlayerInfo();
        this.bindDragAndDropEvents();

        // New Multiplayer UI Component
        this.multiplayerUI = new MultiplayerUI(networkManager);
        this.multiplayerUI.onGameStart = async (state) => {
            const bgResult = await this.setupBackground();
            this.menuOverlay.style.display = 'none';

            if (this.events) {
                this.events.emit(Events.GAME_START, {
                    width: state.width,
                    height: state.height,
                    bombs: state.bombCount,
                    useHoverHelper: true,
                    noGuessMode: false,
                    bgName: bgResult,
                    replayMines: state.minePositions,
                    initialState: state
                });
            }

            if (this.onStartGame) {
                this.onStartGame(state.width, state.height, state.bombCount, true, false, bgResult, state.minePositions, state);
            }
        };
        this.multiplayerUI.init();
    }

    createDifficultyButtons() {
        const container = document.querySelector('.menu-box h2');
        if (!container) return;

        const presetContainer = document.createElement('div');
        presetContainer.className = 'difficulty-presets';

        const presets = [
            { name: 'Débutant', width: 9, height: 9, bombs: 10 },
            { name: 'Intermédiaire', width: 16, height: 16, bombs: 40 },
            { name: 'Expert', width: 30, height: 16, bombs: 99 },
            { name: 'Géant', width: 50, height: 30, bombs: 250 }
        ];

        presets.forEach(preset => {
            const btn = document.createElement('button');
            btn.className = 'preset-btn';
            btn.textContent = preset.name;
            btn.title = `${preset.width}×${preset.height}, ${preset.bombs} bombes`;
            btn.onclick = () => {
                this.widthInput.value = preset.width;
                this.heightInput.value = preset.height;
                this.bombInput.value = preset.bombs;
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
            presetContainer.appendChild(btn);
        });

        container.after(presetContainer);
    }

    checkReplayAvailable() {
        const savedMines = localStorage.getItem('lastMinePositions');
        const savedConfig = localStorage.getItem('lastGameConfig');

        if (savedMines && savedConfig && this.replayBtn) {
            this.replayBtn.style.display = 'inline-block';
        }
    }

    displayPlayerInfo() {
        const playerInfo = document.querySelector('#ui-container > p:first-of-type');
        if (!playerInfo) return;

        const playerName = localStorage.getItem('playerName') || this.generatePlayerName();
        localStorage.setItem('playerName', playerName);

        const playerDisplay = document.createElement('p');
        playerDisplay.style.cssText = 'margin-top: 5px; font-size: 0.8em; opacity: 0.8;';
        playerDisplay.innerHTML = `👤 Joueur: ${playerName}`;
        playerInfo.after(playerDisplay);
    }

    generatePlayerName() {
        const adjectives = ['Swift', 'Brave', 'Clever', 'Lucky', 'Mighty', 'Shadow', 'Golden', 'Silver', 'Crystal', 'Omega'];
        const nouns = ['Wolf', 'Eagle', 'Tiger', 'Dragon', 'Phoenix', 'Knight', 'Mage', 'Hunter', 'Core', 'Star'];
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const num = Math.floor(Math.random() * 1000);
        return `${adj} ${noun} #${num}`;
    }

    bindEvents() {
        // Start solo game
        this.startBtn?.addEventListener('click', () => this.handleStartClick());

        // Video/Image upload
        this.videoUpload?.addEventListener('change', (e) => this.handleMediaUpload(e));

        // Webcam toggle
        this.useWebcamCheckbox?.addEventListener('change', () => this.handleWebcamToggle());

        // Clear scores
        this.clearScoresBtn?.addEventListener('click', () => this.clearScores());

        // Mute toggle
        this.muteBtn?.addEventListener('click', () => this.toggleMute());

        // Flag style toggle
        this.flagStyleBtn?.addEventListener('click', () => this.toggleFlagStyle());

        // Replay button
        this.replayBtn?.addEventListener('click', () => this.handleReplay());

        // Background preset clicks
        document.querySelectorAll('#background-presets-container .preset-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('#background-presets-container .preset-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                this.selectedPresetValue = item.dataset.value;
                this.customVideoUrl = null;
                this.videoFilename.textContent = 'Utilise le préréglage ci-dessus';
            });
        });

        // In-game controls
        this.hintBtn?.addEventListener('click', () => {
            if (this.events) this.events.emit(Events.REQUEST_HINT);
        });

        this.inGameRetryBtn?.addEventListener('click', () => {
            if (this.events) this.events.emit(Events.REQUEST_RETRY);
        });
    }

    bindDragAndDropEvents() {
        const dropZone = document.querySelector('.menu-box');
        if (!dropZone) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        dropZone.addEventListener('dragenter', () => dropZone.classList.add('drag-over'));
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            dropZone.classList.remove('drag-over');
            const files = e.dataTransfer?.files;
            if (files?.length > 0) {
                this.processDroppedFile(files[0]);
            }
        });
    }

    processDroppedFile(file) {
        if (file.type.startsWith('video/') || file.type.startsWith('image/') ||
            file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
            const input = this.videoUpload;
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change'));
        }
    }

    async handleStartClick() {
        const width = parseInt(this.widthInput.value) || 30;
        const height = parseInt(this.heightInput.value) || 20;
        const bombs = parseInt(this.bombInput.value) || 50;
        const noGuessMode = this.noGuessCheckbox?.checked || false;
        const useHoverHelper = this.hoverHelperCheckbox?.checked ?? true;

        // Setup background
        const bgResult = await this.setupBackground();

        // Hide menu and start
        this.menuOverlay.style.display = 'none';

        if (this.events) {
            this.events.emit(Events.GAME_START, {
                width, height, bombs, useHoverHelper, noGuessMode, bgName: bgResult
            });
        }

        // Legacy fallback (can remove after full migration)
        if (this.onStartGame) {
            this.onStartGame(width, height, bombs, useHoverHelper, noGuessMode, bgResult);
        }
    }

    async setupBackground() {
        // Webcam
        if (this.useWebcamCheckbox?.checked) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                this.webcamStream = stream;
                this.videoElement.srcObject = stream;
                await this.videoElement.play();
                this.mediaType = 'webcam';
                return 'Webcam';
            } catch (e) {
                console.warn('Webcam failed, using default');
            }
        }

        // Custom uploaded file
        if (this.customVideoUrl) {
            this.videoElement.src = this.customVideoUrl;
            this.videoElement.muted = this.isMuted;
            await this.videoElement.play().catch(() => { });
            return 'Custom Upload';
        }

        // Preset
        if (this.selectedPresetValue) {
            const [type, path] = this.selectedPresetValue.split(':');
            if (type === 'video') {
                this.videoElement.src = path;
                this.videoElement.muted = this.isMuted;
                await this.videoElement.play().catch(() => { });
                this.mediaType = 'video';
            } else if (type === 'image') {
                const img = document.getElementById('custom-image-source');
                if (img) {
                    img.src = path;
                    this.imageElement = img;
                    this.mediaType = 'image';
                }
            }
            return path.split('/').pop();
        }

        return 'Default';
    }

    handleMediaUpload(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);

        if (file.type.startsWith('video/')) {
            this.customVideoUrl = url;
            this.mediaType = 'video';
            this.videoFilename.textContent = file.name;
        } else if (file.type.startsWith('image/') || file.name.match(/\.(heic|heif)$/i)) {
            this.handleImageUpload(file, url);
        }

        document.querySelectorAll('#background-presets-container .preset-item').forEach(i => i.classList.remove('active'));
    }

    async handleImageUpload(file, url) {
        const img = document.getElementById('custom-image-source');
        if (!img) return;

        if (file.name.match(/\.(heic|heif)$/i) && window.heic2any) {
            try {
                const blob = await heic2any({ blob: file, toType: 'image/jpeg' });
                url = URL.createObjectURL(blob);
            } catch (e) {
                console.error('HEIC conversion failed:', e);
            }
        }

        img.src = url;
        this.imageElement = img;
        this.mediaType = 'image';
        this.customVideoUrl = null;
        this.videoFilename.textContent = file.name;
    }

    handleWebcamToggle() {
        if (!this.useWebcamCheckbox?.checked && this.webcamStream) {
            this.webcamStream.getTracks().forEach(track => track.stop());
            this.webcamStream = null;
            this.videoElement.srcObject = null;
        }
    }

    handleReplay() {
        const savedMines = localStorage.getItem('lastMinePositions');
        const savedConfig = localStorage.getItem('lastGameConfig');

        if (savedMines && savedConfig) {
            const mines = JSON.parse(savedMines);
            const config = JSON.parse(savedConfig);

            this.widthInput.value = config.width;
            this.heightInput.value = config.height;
            this.bombInput.value = config.bombs;

            this.menuOverlay.style.display = 'none';

            if (this.events) {
                this.events.emit(Events.GAME_START, {
                    width: config.width,
                    height: config.height,
                    bombs: config.bombs,
                    useHoverHelper: config.hoverHelper ?? true,
                    noGuessMode: config.noGuess ?? false,
                    bgName: config.bgName || 'Replay',
                    replayMines: mines
                });
            }

            if (this.onStartGame) {
                this.onStartGame(
                    config.width,
                    config.height,
                    config.bombs,
                    config.hoverHelper ?? true,
                    config.noGuess ?? false,
                    config.bgName || 'Replay',
                    mines
                );
            }
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.muteBtn.textContent = this.isMuted ? '🔇 OFF' : '🔊 ON';

        if (this.videoElement) {
            this.videoElement.muted = this.isMuted;
        }

        if (this.renderer?.soundManager) {
            this.renderer.soundManager.setMute(this.isMuted);
        }
    }

    toggleFlagStyle() {
        this.currentFlagStyle = this.currentFlagStyle === 'particle' ? '3d' : 'particle';
        localStorage.setItem('flagStyle', this.currentFlagStyle);
        this.updateFlagStyleButton();
        if (this.renderer?.setFlagStyle) {
            this.renderer.setFlagStyle(this.currentFlagStyle);
        }
    }

    updateFlagStyleButton() {
        if (this.flagStyleBtn) {
            this.flagStyleBtn.textContent = this.currentFlagStyle === 'particle' ? '⭐ ÉTOILES' : '🚩 DRAPEAUX';
        }
    }

    clearScores() {
        if (confirm('Effacer tous les scores ?')) {
            this.scoreManager.clearScores();
            this.updateLeaderboard();
        }
    }

    updateLeaderboard() {
        const scores = this.scoreManager.getAllScores();
        if (!this.leaderboardList) return;

        if (scores.length === 0) {
            this.leaderboardList.innerHTML = '<p class="no-scores">Aucun score enregistré</p>';
            return;
        }

        this.leaderboardList.innerHTML = scores.slice(0, 10).map((s, i) => `
            <div class="score-entry">
                <span class="rank">#${i + 1}</span>
                <span class="score-value">${s.score.toLocaleString()}</span>
                <span class="score-details">${s.width}×${s.height} • ${s.time}s</span>
            </div>
        `).join('');
    }

    detectGpuTier() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                console.log('[UIManager] GPU:', renderer);
            }
        }
    }

    setRenderer(renderer) {
        this.renderer = renderer;
        if (this.renderer && this.renderer.setFlagStyle) {
            this.renderer.setFlagStyle(this.currentFlagStyle);
        }
    }

    showMenu() {
        this.menuOverlay.style.display = 'flex';
        this.updateLeaderboard();
        this.checkReplayAvailable();

        // Stop video playback and sound when returning to menu
        if (this.videoElement) {
            this.videoElement.pause();
        }
    }
}
