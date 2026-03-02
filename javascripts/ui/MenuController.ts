
import { Events } from '../core/EventBus.js';
import type { EventBus } from '../core/EventBus.js';
import { Logger } from '../utils/Logger.js';
import { t } from '../i18n.js';

export class MenuController {
    events: EventBus;

    menuOverlay: HTMLElement | null;
    startBtn: HTMLElement | null;
    videoUpload: HTMLInputElement | null;
    videoFilename: HTMLElement | null;
    widthInput: HTMLInputElement | null;
    heightInput: HTMLInputElement | null;
    bombInput: HTMLInputElement | null;
    useWebcamCheckbox: HTMLInputElement | null;
    muteBtn: HTMLElement | null;
    videoElement: HTMLVideoElement | null;
    hoverHelperCheckbox: HTMLInputElement | null;
    noGuessCheckbox: HTMLInputElement | null;
    flagStyleBtn: HTMLElement | null;
    replayBtn: HTMLElement | null;

    customVideoUrl: string | null;
    webcamStream: MediaStream | null;
    isMuted: boolean;
    mediaType: string;
    selectedPresetValue: string | null;
    currentFlagStyle: string;

    constructor(eventBus: EventBus) {
        Logger.log('MenuController', 'Initializing...');
        this.events = eventBus;

        this.menuOverlay = document.getElementById('menu-overlay');
        this.startBtn = document.getElementById('start-btn');
        this.videoUpload = document.getElementById('video-upload') as HTMLInputElement | null;
        this.videoFilename = document.getElementById('video-filename');
        this.widthInput = document.getElementById('grid-width') as HTMLInputElement | null;
        this.heightInput = document.getElementById('grid-height') as HTMLInputElement | null;
        this.bombInput = document.getElementById('bomb-count') as HTMLInputElement | null;
        this.useWebcamCheckbox = document.getElementById('use-webcam') as HTMLInputElement | null;
        this.muteBtn = document.getElementById('mute-btn');
        this.videoElement = document.getElementById('image') as HTMLVideoElement | null;
        this.hoverHelperCheckbox = document.getElementById('hover-helper') as HTMLInputElement | null;
        this.noGuessCheckbox = document.getElementById('no-guess-mode') as HTMLInputElement | null;
        this.flagStyleBtn = document.getElementById('flag-style-btn');
        this.replayBtn = document.getElementById('replay-btn');

        this.customVideoUrl = null;
        this.webcamStream = null;
        this.isMuted = false;
        this.mediaType = 'video';
        this.selectedPresetValue = 'video:images/storm_render.mp4';

        this.currentFlagStyle = localStorage.getItem('flagStyle') || 'particle';
        this.createDifficultyButtons();
        this.checkReplayAvailable();
        this.updateFlagStyleButton();
        this.displayPlayerInfo();
        this.bindEvents();
        this.bindDragAndDropEvents();

        if (this.videoElement) {
            this.videoElement.muted = this.isMuted;
            this.videoElement.volume = 0.5;
        }
    }

    bindEvents(): void {
        this.startBtn?.addEventListener('click', () => this.handleStartClick());
        this.videoUpload?.addEventListener('change', (e) => this.handleMediaUpload(e));
        this.useWebcamCheckbox?.addEventListener('change', () => this.handleWebcamToggle());
        this.muteBtn?.addEventListener('click', () => this.toggleMute());
        this.flagStyleBtn?.addEventListener('click', () => this.toggleFlagStyle());
        this.replayBtn?.addEventListener('click', () => this.handleReplay());

        document.querySelectorAll('#background-presets-container .preset-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('#background-presets-container .preset-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                this.selectedPresetValue = (item as HTMLElement).dataset.value || null;
                this.customVideoUrl = null;
                if (this.videoFilename) this.videoFilename.textContent = t('menu.uploadPlaceholder');
            });
        });
    }

    createDifficultyButtons(): void {
        const container = document.querySelector('.menu-box h2');
        if (!container) return;
        if (document.querySelector('.difficulty-presets')) return;

        const presetContainer = document.createElement('div');
        presetContainer.className = 'difficulty-presets';

        const presets = [
            { key: 'diff.beginner', width: 9, height: 9, bombs: 10 },
            { key: 'diff.intermediate', width: 16, height: 16, bombs: 40 },
            { key: 'diff.expert', width: 30, height: 16, bombs: 99 },
            { key: 'diff.giant', width: 50, height: 30, bombs: 250 }
        ];

        presets.forEach(preset => {
            const btn = document.createElement('button');
            btn.className = 'preset-btn';
            btn.dataset.i18n = preset.key;
            btn.textContent = t(preset.key);
            btn.dataset.presetW = String(preset.width);
            btn.dataset.presetH = String(preset.height);
            btn.dataset.presetB = String(preset.bombs);
            btn.title = t('diff.tooltip', { w: preset.width, h: preset.height, b: preset.bombs });
            btn.onclick = () => {
                this.widthInput!.value = String(preset.width);
                this.heightInput!.value = String(preset.height);
                this.bombInput!.value = String(preset.bombs);
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
            presetContainer.appendChild(btn);
        });

        container.after(presetContainer);

        window.addEventListener('langchange', () => {
            presetContainer.querySelectorAll('.preset-btn').forEach((btn) => {
                const el = btn as HTMLElement;
                btn.setAttribute('title', t('diff.tooltip', {
                    w: el.dataset.presetW || '',
                    h: el.dataset.presetH || '',
                    b: el.dataset.presetB || ''
                }));
            });
        });
    }

    checkReplayAvailable(): void {
        const savedData = localStorage.getItem('minesweeper3d_last_grid');
        if (savedData && this.replayBtn) {
            (this.replayBtn as HTMLElement).style.display = 'inline-block';
        }
    }

    displayPlayerInfo(): void {
        if (document.getElementById('player-info-display')) return;
        const playerInfo = document.querySelector('#ui-container > p:first-of-type');
        if (!playerInfo) return;

        const playerName = localStorage.getItem('playerName') || this.generatePlayerName();
        localStorage.setItem('playerName', playerName);

        const playerDisplay = document.createElement('p');
        playerDisplay.id = 'player-info-display';
        playerDisplay.style.cssText = 'margin-top: 5px; font-size: 0.8em; opacity: 0.8;';
        playerDisplay.innerHTML = `👤 ${t('hud.player', { name: playerName })}`;
        playerInfo.after(playerDisplay);
    }

    generatePlayerName(): string {
        const adjectives = ['Swift', 'Brave', 'Clever', 'Lucky', 'Mighty', 'Shadow', 'Golden', 'Silver', 'Crystal', 'Omega'];
        const nouns = ['Wolf', 'Eagle', 'Tiger', 'Dragon', 'Phoenix', 'Knight', 'Mage', 'Hunter', 'Core', 'Star'];
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const num = Math.floor(Math.random() * 1000);
        return `${adj} ${noun} #${num}`;
    }

    bindDragAndDropEvents(): void {
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
            const files = (e as DragEvent).dataTransfer?.files;
            if (files && files.length > 0) {
                this.processDroppedFile(files[0]);
            }
        });
    }

    processDroppedFile(file: File): void {
        if (file.type.startsWith('video/') || file.type.startsWith('image/') ||
            file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
            const input = this.videoUpload!;
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change'));
        }
    }

    async handleStartClick(): Promise<void> {
        const MAX_WIDTH = 150;
        const MAX_HEIGHT = 100;
        const MAX_BOMBS = 2000;

        let width = parseInt(this.widthInput!.value) || 30;
        let height = parseInt(this.heightInput!.value) || 20;
        let bombs = parseInt(this.bombInput!.value) || 50;

        width = Math.min(Math.max(10, width), MAX_WIDTH);
        height = Math.min(Math.max(10, height), MAX_HEIGHT);
        bombs = Math.min(Math.max(1, bombs), MAX_BOMBS);
        bombs = Math.min(bombs, (width * height) - 9);

        this.widthInput!.value = String(width);
        this.heightInput!.value = String(height);
        this.bombInput!.value = String(bombs);
        const noGuessMode = this.noGuessCheckbox?.checked || false;
        const useHoverHelper = this.hoverHelperCheckbox?.checked ?? true;

        const bgResult = await this.setupBackground();
        this.hide();

        this.events.emit(Events.GAME_START, {
            width, height, bombs, useHoverHelper, noGuessMode,
            bgName: bgResult,
            flagStyle: this.currentFlagStyle
        });
    }

    async setupBackground(): Promise<string> {
        const img = document.getElementById('custom-image-source') as HTMLImageElement | null;

        if (this.useWebcamCheckbox?.checked) {
            try {
                if (img) img.removeAttribute('src');
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                this.webcamStream = stream;
                this.videoElement!.srcObject = stream;
                this.videoElement!.removeAttribute('src');
                await this.videoElement!.play();
                this.mediaType = 'webcam';
                return 'Webcam';
            } catch (e) {
                Logger.warn('MenuController', 'Webcam failed, using default');
            }
        }

        if (this.customVideoUrl) {
            if (img) img.removeAttribute('src');
            this.videoElement!.srcObject = null;
            this.videoElement!.src = this.customVideoUrl;
            this.videoElement!.muted = this.isMuted;
            await this.videoElement!.play().catch(() => { });
            return 'Custom Upload';
        }

        if (this.mediaType === 'image' && !this.selectedPresetValue && img && img.src !== '' && img.src !== window.location.href) {
            if (this.videoElement) {
                this.videoElement.pause();
                this.videoElement.removeAttribute('src');
                this.videoElement.srcObject = null;
                this.videoElement.load();
            }
            return 'Custom Image';
        }

        if (this.selectedPresetValue) {
            const [type, path] = this.selectedPresetValue.split(':');
            if (type === 'video') {
                if (img) img.removeAttribute('src');
                this.videoElement!.srcObject = null;
                this.videoElement!.src = path;
                this.videoElement!.muted = this.isMuted;
                await this.videoElement!.play().catch(() => { });
                this.mediaType = 'video';
            } else if (type === 'image') {
                if (img) {
                    img.src = path;
                    this.mediaType = 'image';
                }
                if (this.videoElement) {
                    this.videoElement.pause();
                    this.videoElement.removeAttribute('src');
                    this.videoElement.srcObject = null;
                    this.videoElement.load();
                }
            }
            return path.split('/').pop()!;
        }

        return 'Default';
    }

    handleMediaUpload(event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);

        if (file.type.startsWith('video/')) {
            this.customVideoUrl = url;
            this.mediaType = 'video';
            if (this.videoFilename) this.videoFilename.textContent = file.name;
        } else if (file.type.startsWith('image/') || file.name.match(/\.(heic|heif)$/i)) {
            this.handleImageUpload(file, url);
        }

        this.selectedPresetValue = null;
        document.querySelectorAll('#background-presets-container .preset-item').forEach(i => i.classList.remove('active'));
    }

    async handleImageUpload(file: File, url: string): Promise<void> {
        const img = document.getElementById('custom-image-source') as HTMLImageElement | null;
        if (!img) return;

        if (file.name.match(/\.(heic|heif)$/i) && (window as any).heic2any) {
            try {
                const blob = await (window as any).heic2any({ blob: file, toType: 'image/jpeg' });
                url = URL.createObjectURL(blob);
            } catch (e) {
                Logger.error('MenuController', 'HEIC conversion failed:', e);
            }
        }

        img.src = url;
        this.mediaType = 'image';
        this.customVideoUrl = null;
        if (this.videoFilename) this.videoFilename.textContent = file.name;
    }

    handleWebcamToggle(): void {
        if (!this.useWebcamCheckbox?.checked && this.webcamStream) {
            this.webcamStream.getTracks().forEach(track => track.stop());
            this.webcamStream = null;
            this.videoElement!.srcObject = null;
        }
    }

    handleReplay(): void {
        const savedData = localStorage.getItem('minesweeper3d_last_grid');
        if (savedData) {
            const data = JSON.parse(savedData);

            this.widthInput!.value = data.width;
            this.heightInput!.value = data.height;
            this.bombInput!.value = data.bombCount;

            this.hide();

            this.events.emit(Events.GAME_START, {
                width: data.width,
                height: data.height,
                bombs: data.bombCount,
                useHoverHelper: true,
                noGuessMode: data.noGuessMode ?? false,
                bgName: 'Replay',
                replayMines: data.minePositions
            });
        }
    }

    toggleMute(): void {
        this.isMuted = !this.isMuted;
        const key = this.isMuted ? 'hud.muteOff' : 'hud.muteOn';
        this.muteBtn!.textContent = t(key);
        (this.muteBtn! as HTMLElement).dataset.i18n = key;

        if (this.videoElement) {
            this.videoElement.muted = this.isMuted;
        }

        this.events.emit(Events.TOGGLE_MUTE, this.isMuted);
    }

    toggleFlagStyle(): void {
        this.currentFlagStyle = this.currentFlagStyle === 'particle' ? '3d' : 'particle';
        localStorage.setItem('flagStyle', this.currentFlagStyle);
        this.updateFlagStyleButton();
        this.events.emit(Events.FLAG_STYLE_CHANGED, this.currentFlagStyle);
    }

    updateFlagStyleButton(): void {
        if (this.flagStyleBtn) {
            const key = this.currentFlagStyle === 'particle' ? 'hud.flagStars' : 'hud.flagFlags';
            this.flagStyleBtn.textContent = t(key);
            (this.flagStyleBtn as HTMLElement).dataset.i18n = key;
        }
    }

    show(): void {
        this.menuOverlay!.style.display = 'flex';
        this.checkReplayAvailable();
        if (this.videoElement) {
            this.videoElement.pause();
        }
    }

    hide(): void {
        this.menuOverlay!.style.display = 'none';
    }
}
