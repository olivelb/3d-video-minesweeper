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
        this.flagStyleBtn = document.getElementById('flag-style-btn');
        this.replayBtn = document.getElementById('replay-btn');

        // YouTube Elements
        this.youtubeUrl = document.getElementById('youtube-url');
        this.youtubeLoadBtn = document.getElementById('youtube-load-btn');
        this.youtubeStatus = document.getElementById('youtube-status');
        this.youtubePreview = document.getElementById('youtube-preview');
        this.youtubeThumbnail = document.getElementById('youtube-thumbnail');
        this.youtubeTitle = document.getElementById('youtube-title');
        this.youtubeDuration = document.getElementById('youtube-duration');
        this.youtubeClearBtn = document.getElementById('youtube-clear-btn');
        this.youtubeQuality = document.getElementById('youtube-quality');
        this.youtubeQualityContainer = document.getElementById('youtube-quality-container');
        this.youtubeServerStatus = document.getElementById('youtube-server-status');

        // Difficulty Presets
        this.createDifficultyButtons();

        // Check for saved grid and show replay button
        this.checkReplayAvailable();

        // State
        this.customVideoUrl = null;
        this.webcamStream = null;
        this.isMuted = false;  // Sound ON by default - video starts muted for autoplay but unmutes after user interaction
        this.mediaType = 'video'; // 'video' | 'image' | 'webcam' | 'youtube'
        this.imageElement = null; // For storing loaded image
        this.youtubeManager = null;
        this.youtubeVideoInfo = null;

        this.bindEvents();
        this.updateLeaderboard();
        this.currentFlagStyle = 'particle';
        this.selectedPresetValue = 'video:images/storm_render.mp4';
        this.updateFlagStyleButton();
        this.detectGpuTier();
        this.displayPlayerInfo();
        
        // Initialize YouTube manager
        this.initYouTubeManager();
    }

    /**
     * Initialize YouTube Manager for video streaming
     */
    async initYouTubeManager() {
        try {
            const { YouTubeManager } = await import('./YouTubeManager.js');
            
            this.youtubeManager = new YouTubeManager({
                serverUrl: 'http://localhost:3001',
                onStatusChange: (status, message) => this.updateYouTubeStatus(status, message),
                onError: (error) => console.error('YouTube Error:', error)
            });
            
            this.bindYouTubeEvents();
            this.checkYouTubeServer();
            
        } catch (error) {
            console.warn('YouTube manager not available:', error);
            this.hideYouTubeSection();
        }
    }

    /**
     * Bind YouTube-related event listeners
     */
    bindYouTubeEvents() {
        if (!this.youtubeLoadBtn) return;
        
        // Load button click
        this.youtubeLoadBtn.addEventListener('click', () => this.handleYouTubeLoad());
        
        // Enter key in input
        this.youtubeUrl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleYouTubeLoad();
        });
        
        // Paste detection for auto-validation
        this.youtubeUrl.addEventListener('paste', () => {
            setTimeout(() => {
                const url = this.youtubeUrl.value.trim();
                if (url && this.youtubeManager?.extractVideoId(url)) {
                    this.updateYouTubeStatus('', '');
                }
            }, 100);
        });
        
        // Input change - clear status on edit
        this.youtubeUrl.addEventListener('input', () => {
            if (this.youtubeVideoInfo) {
                // User is editing after a video was loaded
                this.updateYouTubeStatus('', '');
            }
        });
        
        // Clear button
        if (this.youtubeClearBtn) {
            this.youtubeClearBtn.addEventListener('click', () => this.clearYouTube());
        }
    }

    /**
     * Check if YouTube proxy server is available
     */
    async checkYouTubeServer() {
        if (!this.youtubeManager || !this.youtubeServerStatus) return;
        
        const statusDot = this.youtubeServerStatus.querySelector('.status-dot');
        const statusText = this.youtubeServerStatus.querySelector('.status-text');
        
        statusDot.className = 'status-dot checking';
        statusText.textContent = 'Vérification du serveur...';
        
        const isOnline = await this.youtubeManager.checkServerHealth();
        
        if (isOnline) {
            statusDot.className = 'status-dot online';
            statusText.textContent = 'Serveur YouTube connecté';
            if (this.youtubeLoadBtn) this.youtubeLoadBtn.disabled = false;
        } else {
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'Serveur hors ligne - Lancez: cd server && npm start';
            if (this.youtubeLoadBtn) this.youtubeLoadBtn.disabled = true;
        }
    }

    /**
     * Handle YouTube URL load button click
     */
    async handleYouTubeLoad() {
        const url = this.youtubeUrl.value.trim();
        if (!url) {
            this.updateYouTubeStatus('error', 'Veuillez entrer un lien YouTube');
            return;
        }
        
        // Validate URL format first
        const videoId = this.youtubeManager.extractVideoId(url);
        if (!videoId) {
            this.updateYouTubeStatus('error', 'Format de lien YouTube invalide');
            return;
        }
        
        this.youtubeLoadBtn.disabled = true;
        this.youtubeLoadBtn.classList.add('loading');
        
        try {
            // Get video info from server
            const info = await this.youtubeManager.getVideoInfo(url);
            
            // Show preview
            this.showYouTubePreview(info);
            
            // Clear other media selections
            this.stopWebcam();
            this.useWebcamCheckbox.checked = false;
            this.clearPresetHighlights();
            this.videoUpload.value = '';
            this.videoFilename.textContent = 'YouTube sélectionné';
            this.videoFilename.classList.add('custom-video');
            
            // Set media type
            this.mediaType = 'youtube';
            this.youtubeVideoInfo = info;
            
            // PRE-LOAD: Start loading the video immediately so it's ready when game starts
            const quality = this.youtubeQuality?.value || 'low';
            const streamUrl = this.youtubeManager.getStreamUrl(info.videoId, quality);
            this.videoElement.src = streamUrl;
            this.videoElement.crossOrigin = 'anonymous';
            this.videoElement.muted = true;
            this.videoElement.loop = true;
            this.videoElement.preload = 'auto';
            this.videoElement.load();
            console.log('[YouTube] Pre-loading video:', streamUrl);
            
            this.updateYouTubeStatus('success', 'Vidéo en chargement... Vous pouvez démarrer!');
            
        } catch (error) {
            this.updateYouTubeStatus('error', error.message);
        } finally {
            this.youtubeLoadBtn.disabled = false;
            this.youtubeLoadBtn.classList.remove('loading');
            // Re-check server status
            this.checkYouTubeServer();
        }
    }

    /**
     * Show YouTube video preview
     */
    showYouTubePreview(info) {
        if (!this.youtubePreview) return;
        
        this.youtubeThumbnail.src = this.youtubeManager.getThumbnailUrl(info.videoId);
        this.youtubeTitle.textContent = info.title;
        this.youtubeDuration.textContent = this.youtubeManager.formatDuration(info.duration);
        this.youtubePreview.style.display = 'flex';
        this.youtubeQualityContainer.style.display = 'flex';
    }

    /**
     * Update YouTube status message
     */
    updateYouTubeStatus(status, message) {
        if (!this.youtubeStatus) return;
        
        this.youtubeStatus.className = `youtube-status ${status}`;
        this.youtubeStatus.textContent = message;
    }

    /**
     * Clear YouTube selection
     */
    clearYouTube() {
        this.youtubeUrl.value = '';
        if (this.youtubePreview) this.youtubePreview.style.display = 'none';
        if (this.youtubeQualityContainer) this.youtubeQualityContainer.style.display = 'none';
        if (this.youtubeStatus) {
            this.youtubeStatus.textContent = '';
            this.youtubeStatus.className = 'youtube-status';
        }
        this.youtubeVideoInfo = null;
        
        // Reset to video type and reselect default preset
        this.mediaType = 'video';
        this.videoFilename.textContent = 'Utilise le préréglage sélectionné';
        this.videoFilename.classList.remove('custom-video');
        
        const defaultPreset = document.querySelector('.preset-item[data-value="video:images/storm_render.mp4"]');
        if (defaultPreset) {
            defaultPreset.click();
        }
    }

    /**
     * Hide YouTube section if server not available
     */
    hideYouTubeSection() {
        const section = document.getElementById('youtube-section');
        if (section) {
            section.style.display = 'none';
        }
    }

    displayPlayerInfo() {
        const playerInfo = this.scoreManager.getPlayerInfo();
        const container = document.getElementById('ui-container');
        if (container) {
            let playerBadge = document.getElementById('player-badge');
            if (!playerBadge) {
                playerBadge = document.createElement('div');
                playerBadge.id = 'player-badge';
                playerBadge.style.fontSize = '0.8em';
                playerBadge.style.opacity = '0.7';
                playerBadge.style.marginTop = '5px';
                container.appendChild(playerBadge);
            }
            playerBadge.textContent = `👤 Joueur: ${playerInfo.codename}`;
        }
    }

    getBackgroundName() {
        if (this.mediaType === 'youtube' && this.youtubeVideoInfo) {
            return `YouTube: ${this.youtubeVideoInfo.title.substring(0, 30)}...`;
        }
        if (this.useWebcamCheckbox.checked) return 'Webcam';
        if (this.customVideoUrl) {
            const fileName = this.videoFilename.textContent;
            return `Custom: ${fileName}`;
        }
        // Extract name from preset value (e.g., "video:images/storm_render.mp4")
        const activePreset = document.querySelector('.preset-item.active');
        return activePreset ? activePreset.querySelector('span').textContent : 'Default';
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
            btn.style.padding = '6px 12px';
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
        const firstDirectChild = container.querySelector('.input-row, .input-group');
        if (firstDirectChild) {
            container.insertBefore(presetContainer, firstDirectChild);
        } else {
            container.appendChild(presetContainer);
        }
    }

    /**
     * Check if a saved grid exists and show/hide replay button accordingly
     */
    checkReplayAvailable() {
        const savedGrid = localStorage.getItem('minesweeper3d_last_grid');
        if (savedGrid && this.replayBtn) {
            this.replayBtn.style.display = 'block';
        } else if (this.replayBtn) {
            this.replayBtn.style.display = 'none';
        }
    }

    /**
     * Handle replay button click - start game with saved mine positions
     */
    handleReplay() {
        const savedGrid = localStorage.getItem('minesweeper3d_last_grid');
        if (!savedGrid) return;

        const gridData = JSON.parse(savedGrid);

        // Update input fields to reflect replay grid settings
        this.widthInput.value = gridData.width;
        this.heightInput.value = gridData.height;
        this.bombInput.value = gridData.bombCount;
        if (this.noGuessCheckbox) {
            this.noGuessCheckbox.checked = gridData.noGuessMode;
        }

        // Hide menu
        this.menuOverlay.style.display = 'none';

        // Track replay analytics
        const bgName = this.getBackgroundName();
        this.scoreManager.trackGameEvent({
            type: 'replay',
            background: bgName,
            width: gridData.width,
            height: gridData.height,
            bombs: gridData.bombCount
        });

        // Start game with replay data
        if (this.onStartGame) {
            const useHoverHelper = this.hoverHelperCheckbox ? this.hoverHelperCheckbox.checked : true;
            this.onStartGame(
                gridData.width,
                gridData.height,
                gridData.bombCount,
                useHoverHelper,
                gridData.noGuessMode,
                bgName,
                gridData.minePositions // Pass mine positions for replay
            );
        }
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.handleStart());
        this.clearScoresBtn.addEventListener('click', () => this.handleClearScores());

        // Replay button
        if (this.replayBtn) {
            this.replayBtn.addEventListener('click', () => this.handleReplay());
        }

        this.videoUpload.addEventListener('change', (e) => this.handleVideoUpload(e));
        this.useWebcamCheckbox.addEventListener('change', (e) => this.handleWebcamToggle(e));

        // Visual Preset Selector Logic
        const presetItems = document.querySelectorAll('.preset-item');
        presetItems.forEach(item => {
            // Ensure videos are playing
            const v = item.querySelector('video');
            if (v) v.play().catch(() => { });

            item.addEventListener('click', () => {
                // Update UI: Remove active from others, add to this
                presetItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                // Update selected value
                this.selectedPresetValue = item.dataset.value;

                // When clicking a preset, we want to clear any custom upload/webcam
                this.stopWebcam();
                this.useWebcamCheckbox.checked = false;
                this.videoUpload.value = ''; // Important: clear the file input

                // Always reset to the selected preset (clearing custom URLs)
                this.resetToDefaultVideo();
            });
        });

        this.muteBtn.addEventListener('click', () => this.toggleMute());

        // Flag style toggle (particle ↔ 3D)
        if (this.flagStyleBtn) {
            this.flagStyleBtn.addEventListener('click', () => this.toggleFlagStyle());
        }
    }

    toggleFlagStyle() {
        this.currentFlagStyle = this.currentFlagStyle === 'particle' ? '3d' : 'particle';
        if (this.renderer) {
            this.renderer.flagStyle = this.currentFlagStyle;
            // Force refresh of existing flags
            this.refreshFlags();
        }
        this.updateFlagStyleButton();
    }

    updateFlagStyleButton() {
        if (!this.flagStyleBtn) return;
        this.flagStyleBtn.textContent = this.currentFlagStyle === 'particle' ? '⭐ ÉTOILES' : '🚩 DRAPEAUX';
        this.flagStyleBtn.title = this.currentFlagStyle === 'particle' ? 'Basculer vers les drapeaux 3D' : 'Basculer vers les étoiles scintillantes';
    }

    refreshFlags() {
        if (!this.renderer) return;

        // Collect current flag positions
        const activeFlags = [];
        for (let x = 0; x < this.renderer.game.width; x++) {
            for (let y = 0; y < this.renderer.game.height; y++) {
                if (this.renderer.game.flags[x][y]) {
                    activeFlags.push({ x, y });
                }
            }
        }

        // Clear all current visuals
        this.renderer.flagEmitters.forEach(emitter => emitter.alive = false);
        this.renderer.flagEmitters.clear();

        this.renderer.flag3DMeshes.forEach(flag => this.renderer.scene.remove(flag));
        this.renderer.flag3DMeshes.clear();

        // Recreate with new style
        for (const { x, y } of activeFlags) {
            this.renderer.updateFlagVisual(x, y, true);
        }
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
        if (this.mediaType === 'youtube' && this.youtubeVideoInfo) {
            // YouTube video - already pre-loaded when user selected it
            this.stopWebcam();
            
            // Check if we need to update quality
            const quality = this.youtubeQuality?.value || 'low';
            const expectedUrl = this.youtubeManager.getStreamUrl(this.youtubeVideoInfo.videoId, quality);
            
            // Only reload if quality changed
            if (this.videoElement.src !== expectedUrl) {
                this.videoElement.src = expectedUrl;
                this.videoElement.crossOrigin = 'anonymous';
                this.videoElement.muted = true;
                this.videoElement.loop = true;
                this.videoElement.load();
            }
            
            // DON'T wait - start game immediately, video will load in background
            // The renderer will handle showing a placeholder until video is ready
            // Start muted, then unmute after play succeeds (user interaction allows it)
            this.videoElement.play().then(() => {
                // User has interacted, now we can unmute if sound is enabled
                if (!this.isMuted) {
                    this.videoElement.muted = false;
                }
            }).catch(() => {});
        } else if (this.videoUpload.files && this.videoUpload.files[0]) {
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
            // Don't force reset here if we already have a valid custom URL or preset loaded
            // But we do want to ensure sound is on if it's a video
            if (this.mediaType === 'video') {
                this.videoElement.muted = false;
            }
        }

        // Only try to play if it is a video (webcam or file or youtube)
        if (this.mediaType !== 'image') {
            this.videoElement.play().catch(e => console.warn("Auto-lecture bloquée:", e));
        }

        this.menuOverlay.style.display = 'none';

        // Track game start analytics
        const bgName = this.getBackgroundName();
        this.scoreManager.trackGameEvent({
            type: 'start',
            background: bgName,
            width: width,
            height: height,
            bombs: bombs
        });

        if (this.onStartGame) {
            const useHoverHelper = this.hoverHelperCheckbox ? this.hoverHelperCheckbox.checked : true;
            const noGuessMode = this.noGuessCheckbox ? this.noGuessCheckbox.checked : false;
            this.onStartGame(width, height, bombs, useHoverHelper, noGuessMode, bgName);
        }
    }


    resetToDefaultVideo() {
        if (this.customVideoUrl) {
            URL.revokeObjectURL(this.customVideoUrl);
            this.customVideoUrl = null;
        }

        const [type, path] = this.selectedPresetValue.split(':');

        this.videoFilename.textContent = 'Utilise le préréglage sélectionné';
        this.videoFilename.classList.remove('custom-video');
        this.videoUpload.value = ''; // Ensure file input is cleared
        
        // Clear YouTube state if switching away
        if (this.youtubeVideoInfo) {
            this.clearYouTube();
        }

        if (type === 'video') {
            this.mediaType = 'video';
            this.imageElement = null; // Clear any image
            const customImageElement = document.getElementById('custom-image-source');
            if (customImageElement) customImageElement.src = '';

            this.videoElement.crossOrigin = '';
            this.videoElement.src = path;
            this.videoElement.load();
            this.videoElement.muted = false;
            this.videoElement.removeAttribute('muted');

            // Notify renderer
            if (this.renderer && this.renderer.updateMediaTexture) {
                this.renderer.updateMediaTexture('video', this.videoElement);
            }
        } else {
            this.mediaType = 'image';
            this.videoElement.pause();

            // Update hidden img source
            const customImageElement = document.getElementById('custom-image-source');
            if (customImageElement) customImageElement.src = path;

            // Load new image
            const img = new Image();
            img.onload = () => {
                this.imageElement = img;
                if (this.renderer && this.renderer.updateMediaTexture) {
                    this.renderer.updateMediaTexture('image', img);
                }
            };
            img.src = path;
        }
    }

    handleVideoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        this.stopWebcam();
        this.useWebcamCheckbox.checked = false;
        this.clearPresetHighlights();
        // Clear YouTube when uploading a file
        if (this.youtubeVideoInfo) {
            this.clearYouTube();
        }
        if (this.customVideoUrl) {
            URL.revokeObjectURL(this.customVideoUrl);
        }
        this.customVideoUrl = URL.createObjectURL(file);

        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');

        if (isImage) {
            this.handleImageFile(file);
        } else if (isVideo) {
            this.handleVideoFile(file);
        }
    }


    handleImageFile(file) {
        this.mediaType = 'image';
        const customImageElement = document.getElementById('custom-image-source');
        if (customImageElement) {
            customImageElement.src = this.customVideoUrl;
        }
        const img = new Image();
        img.onload = () => {
            this.imageElement = img;
            if (this.renderer && this.renderer.updateMediaTexture) {
                this.renderer.updateMediaTexture('image', img);
            }
        };
        img.src = this.customVideoUrl;
        this.videoFilename.textContent = file.name;
        this.videoFilename.classList.add('custom-video');
        this.videoElement.pause();
    }

    handleVideoFile(file) {
        this.mediaType = 'video';
        this.imageElement = null;
        const customImageElement = document.getElementById('custom-image-source');
        if (customImageElement) {
            customImageElement.src = '';
        }
        this.videoElement.src = this.customVideoUrl;
        this.videoElement.load();
        this.videoFilename.textContent = file.name;
        this.videoFilename.classList.add('custom-video');
        this.videoElement.muted = false;
        this.videoElement.removeAttribute('muted');
        if (this.renderer && this.renderer.updateMediaTexture) {
            this.renderer.updateMediaTexture('video', this.videoElement);
        }
    }

    async startWebcam() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
            this.webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            this.videoElement.srcObject = this.webcamStream;
            this.videoElement.muted = false;
            this.videoElement.removeAttribute('muted');
            this.mediaType = 'webcam';
            this.imageElement = null;
            this.videoFilename.textContent = 'Webcam active';
            this.videoFilename.classList.add('custom-video');
            // Notify renderer if it exists
            if (this.renderer && this.renderer.updateMediaTexture) {
                this.renderer.updateMediaTexture('video', this.videoElement);
            }
            return true;
        } catch (err) {
            console.warn('Webcam unavailable:', err);
            this.stopWebcam();
            return false;
        }
    }

    /**
     * Wait for video element to be ready to play
     * @param {HTMLVideoElement} video
     * @returns {Promise<void>}
     */
    waitForVideoReady(video) {
        return new Promise((resolve) => {
            // If video already has enough data, resolve immediately
            if (video.readyState >= 3) { // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA
                video.play().catch(() => {});
                resolve();
                return;
            }
            
            const onCanPlay = () => {
                cleanup();
                video.play().catch(() => {});
                resolve();
            };
            
            const onError = (e) => {
                cleanup();
                console.warn('Video error while waiting:', e);
                resolve(); // Continue anyway
            };
            
            const cleanup = () => {
                video.removeEventListener('canplay', onCanPlay);
                video.removeEventListener('canplaythrough', onCanPlay);
                video.removeEventListener('loadeddata', onCanPlay);
                video.removeEventListener('error', onError);
            };
            
            video.addEventListener('canplay', onCanPlay);
            video.addEventListener('canplaythrough', onCanPlay);
            video.addEventListener('loadeddata', onCanPlay);
            video.addEventListener('error', onError);
            
            // Timeout after 15 seconds
            setTimeout(() => {
                cleanup();
                console.warn('Video load timeout, starting anyway');
                video.play().catch(() => {});
                resolve();
            }, 15000);
        });
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
            this.clearPresetHighlights();
            if (this.customVideoUrl) {
                URL.revokeObjectURL(this.customVideoUrl);
                this.customVideoUrl = null;
            }
            this.startWebcam().then(ok => {
                if (!ok) e.target.checked = false;
            });
        } else {
            this.stopWebcam();
            this.resetToDefaultVideo(); // Revert to selected preset
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

        this.leaderboardList.innerHTML = topScores.map((score, index) => {
            const noGuessBadge = score.noGuessMode ? '<span class="score-badge ng">Logique</span>' : '';
            const hintsBadge = score.hintCount > 0 ? `<span class="score-badge hints">${score.hintCount} 💡</span>` : '';

            return `
                <div class="score-entry">
                    <div class="score-rank">#${index + 1}</div>
                    <div class="score-info">
                        <div class="score-value">
                            ${score.score.toLocaleString()} pts
                            ${noGuessBadge}
                            ${hintsBadge}
                        </div>
                        <div class="score-details">
                            ${score.width}x${score.height} | ${score.bombs} 💣 | ${this.scoreManager.formatTime(score.time)}
                            <br>
                            <span class="score-bg-info">🖼️ ${score.background || 'Défaut'}</span>
                            <span class="score-player-info">👤 ${score.codename || 'Anonyme'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.muteBtn.textContent = this.isMuted ? '🔇 OFF' : '🔊 ON';
        this.muteBtn.title = this.isMuted ? 'Activer le son' : 'Désactiver le son';
        
        // Also mute/unmute the video element for YouTube/video audio
        if (this.videoElement) {
            this.videoElement.muted = this.isMuted;
        }
        
        if (this.renderer && this.renderer.soundManager) {
            this.renderer.soundManager.setMute(this.isMuted);
        }
    }

    showMenu() {
        this.menuOverlay.style.display = 'flex';
        this.hintBtn.style.display = 'none';
        this.renderer = null; // Clear disposed renderer
        
        // Stop video playback when returning to menu
        if (this.videoElement) {
            this.videoElement.pause();
            // For YouTube streams, clear the src to stop the server stream
            // But keep the video info so we can restart with the same video
            if (this.mediaType === 'youtube') {
                this.videoElement.src = '';
                this.videoElement.load();
            }
        }
        
        this.checkReplayAvailable(); // Refresh replay button visibility
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
        if (this.renderer) {
            // Apply current style to new renderer
            this.renderer.flagStyle = this.currentFlagStyle;
            if (this.renderer.soundManager) {
                this.renderer.soundManager.setMute(this.isMuted);
            }
        }
    }

    clearPresetHighlights() {
        document.querySelectorAll('.preset-item').forEach(i => i.classList.remove('active'));
    }
}
