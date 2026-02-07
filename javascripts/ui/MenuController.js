
import { Events } from '../core/EventBus.js';
import { Logger } from '../utils/Logger.js';

export class MenuController {
    constructor(eventBus) {
        Logger.log('MenuController', 'Initializing...');
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
        this.muteBtn = document.getElementById('mute-btn');
        this.videoElement = document.getElementById('image');
        this.hoverHelperCheckbox = document.getElementById('hover-helper');
        this.noGuessCheckbox = document.getElementById('no-guess-mode');
        this.flagStyleBtn = document.getElementById('flag-style-btn');
        this.replayBtn = document.getElementById('replay-btn');

        // State
        this.customVideoUrl = null;
        this.webcamStream = null;
        this.isMuted = false;
        this.mediaType = 'video';
        this.selectedPresetValue = 'video:images/storm_render.mp4';

        // Initial Config
        this.currentFlagStyle = localStorage.getItem('flagStyle') || 'particle';
        this.createDifficultyButtons();
        this.checkReplayAvailable();
        this.updateFlagStyleButton();
        this.displayPlayerInfo();
        this.bindEvents();
        this.bindDragAndDropEvents();

        // Sync initial mute state
        if (this.videoElement) {
            this.videoElement.muted = this.isMuted;
            this.videoElement.volume = 0.5;
        }
    }

    bindEvents() {
        // Start game
        this.startBtn?.addEventListener('click', () => this.handleStartClick());

        // Video/Image upload
        this.videoUpload?.addEventListener('change', (e) => this.handleMediaUpload(e));

        // Webcam toggle
        this.useWebcamCheckbox?.addEventListener('change', () => this.handleWebcamToggle());

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

        // Listen for internal events if needed
        // this.events.on(Events.GAME_OVER, () => this.show()); // Handled by GameController delay -> GAME_ENDED
    }

    createDifficultyButtons() {
        const container = document.querySelector('.menu-box h2');
        if (!container) return;

        // Prevent duplicate creation
        if (document.querySelector('.difficulty-presets')) return;

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
        // Prevent duplicate creation
        if (document.getElementById('player-info-display')) return;

        const playerInfo = document.querySelector('#ui-container > p:first-of-type');
        if (!playerInfo) return;

        const playerName = localStorage.getItem('playerName') || this.generatePlayerName();
        localStorage.setItem('playerName', playerName);

        const playerDisplay = document.createElement('p');
        playerDisplay.id = 'player-info-display';
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
        // Enforce limits (safe for server solver)
        const MAX_WIDTH = 150;
        const MAX_HEIGHT = 100;
        const MAX_BOMBS = 2000;

        let width = parseInt(this.widthInput.value) || 30;
        let height = parseInt(this.heightInput.value) || 20;
        let bombs = parseInt(this.bombInput.value) || 50;

        // Clamp values
        width = Math.min(Math.max(10, width), MAX_WIDTH);
        height = Math.min(Math.max(10, height), MAX_HEIGHT);
        bombs = Math.min(Math.max(1, bombs), MAX_BOMBS);

        // Ensure bombs don't exceed grid size - 9 (leave space for first click)
        bombs = Math.min(bombs, (width * height) - 9);

        // Update inputs to reflect clamped values
        this.widthInput.value = width;
        this.heightInput.value = height;
        this.bombInput.value = bombs;
        const noGuessMode = this.noGuessCheckbox?.checked || false;
        const useHoverHelper = this.hoverHelperCheckbox?.checked ?? true;

        // Setup background
        const bgResult = await this.setupBackground();

        // Hide menu
        this.hide();

        // Emit Game Start
        this.events.emit(Events.GAME_START, {
            width, height, bombs, useHoverHelper, noGuessMode,
            bgName: bgResult,
            flagStyle: this.currentFlagStyle
        });
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
                Logger.warn('MenuController', 'Webcam failed, using default');
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
                Logger.error('MenuController', 'HEIC conversion failed:', e);
            }
        }

        img.src = url;
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

            this.hide();

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
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.muteBtn.textContent = this.isMuted ? '🔇 OFF' : '🔊 ON';

        if (this.videoElement) {
            this.videoElement.muted = this.isMuted;
        }

        // Emit global mute event if needed, or handling locally for now is okay
        // But UIManager usually notified Renderer. Let's just emit an event or accessing via globals is dirty.
        // Better: Emit an event to EventBus.
        this.events.emit(Events.TOGGLE_MUTE, this.isMuted);
    }

    toggleFlagStyle() {
        this.currentFlagStyle = this.currentFlagStyle === 'particle' ? '3d' : 'particle';
        localStorage.setItem('flagStyle', this.currentFlagStyle);
        this.updateFlagStyleButton();
        this.events.emit(Events.FLAG_STYLE_CHANGED, this.currentFlagStyle);
    }

    updateFlagStyleButton() {
        if (this.flagStyleBtn) {
            this.flagStyleBtn.textContent = this.currentFlagStyle === 'particle' ? '⭐ ÉTOILES' : '🚩 DRAPEAUX';
        }
    }

    show() {
        this.menuOverlay.style.display = 'flex';
        this.checkReplayAvailable();

        // Stop video/sound when in menu
        if (this.videoElement) {
            this.videoElement.pause();
        }
    }

    hide() {
        this.menuOverlay.style.display = 'none';
    }
}
