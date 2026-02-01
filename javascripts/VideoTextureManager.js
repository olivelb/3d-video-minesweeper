import * as THREE from 'three';

/**
 * VideoTextureManager - Handles video/image texture loading and updates
 * Extracted from Renderer.js for better modularity
 */
export class VideoTextureManager {
    constructor() {
        this.mediaTexture = null;
        this.placeholderTexture = null;
        this.videoTexture = null;
        this.mediaType = 'video';
        this.videoTextureReady = false;
        this.videoCheckInterval = null;
        this._videoEventListeners = [];
    }

    /**
     * Initialize media texture from video or image element
     * @param {HTMLVideoElement|HTMLImageElement} videoElement - The video element
     * @param {HTMLImageElement|null} customImage - Optional custom image element
     * @returns {THREE.Texture} The media texture
     */
    async initializeMediaTexture(videoElement, customImage = null) {
        // Check for custom uploaded image first
        if (customImage?.src && customImage.src !== '' && customImage.src !== window.location.href) {
            return this._initializeImageTexture(customImage);
        }

        if (videoElement) {
            return this._initializeVideoTexture(videoElement);
        }

        return null;
    }

    /**
     * Initialize texture from image element
     * @param {HTMLImageElement} image 
     * @returns {THREE.Texture}
     */
    _initializeImageTexture(image) {
        this.mediaType = 'image';

        if (image.complete && image.naturalWidth > 0) {
            this.mediaTexture = new THREE.Texture(image);
            this.mediaTexture.needsUpdate = true;
        } else {
            this.mediaTexture = new THREE.Texture(image);
            image.onload = () => {
                this.mediaTexture.needsUpdate = true;
            };
        }

        this._applyTextureSettings(this.mediaTexture);
        this.videoTexture = this.mediaTexture;
        return this.mediaTexture;
    }

    /**
     * Initialize texture from video element
     * @param {HTMLVideoElement} video 
     * @returns {THREE.Texture}
     */
    _initializeVideoTexture(video) {
        this.mediaType = 'video';

        const isNetworkStream = video.src && (video.src.startsWith('http') || video.src.startsWith('blob:'));

        if (isNetworkStream) {
            return this._initializeNetworkVideoTexture(video);
        }

        this.mediaTexture = new THREE.VideoTexture(video);
        this._applyTextureSettings(this.mediaTexture);
        this.videoTexture = this.mediaTexture;
        return this.mediaTexture;
    }

    /**
     * Initialize texture for network streaming video with placeholder
     * @param {HTMLVideoElement} video 
     * @returns {THREE.Texture}
     */
    _initializeNetworkVideoTexture(video) {
        // Create high-quality placeholder canvas for loading animation
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        this._placeholderCanvas = canvas;
        this._placeholderCtx = canvas.getContext('2d');
        this._loadingProgress = 0;
        this._loadingStartTime = Date.now();
        this._drawLoadingPlaceholder(0);
        
        this.mediaTexture = new THREE.CanvasTexture(canvas);
        this.mediaTexture.minFilter = THREE.LinearFilter;
        this.mediaTexture.magFilter = THREE.LinearFilter;
        this.placeholderTexture = this.mediaTexture;

        const hasVideoFrames = () => {
            return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
        };

        const switchToVideoTexture = () => {
            if (this.videoTextureReady) return;

            if (this.mediaTexture) {
                this.mediaTexture.dispose();
            }

            this.videoTextureReady = true;
            this._placeholderCanvas = null;
            this._placeholderCtx = null;
            this.mediaTexture = new THREE.VideoTexture(video);
            this._applyTextureSettings(this.mediaTexture);
            this.videoTexture = this.mediaTexture;

            if (this.onTextureReady) {
                this.onTextureReady(this.mediaTexture);
            }
        };

        const onVideoReady = () => {
            if (hasVideoFrames()) {
                switchToVideoTexture();
                video.removeEventListener('loadeddata', onVideoReady);
                video.removeEventListener('canplay', onVideoReady);
                video.removeEventListener('playing', onVideoReady);
                if (this.videoCheckInterval) {
                    clearInterval(this.videoCheckInterval);
                    this.videoCheckInterval = null;
                }
            }
        };
        
        // Track loading progress - use time-based simulation for streaming
        const updateProgress = () => {
            const elapsed = (Date.now() - this._loadingStartTime) / 1000;
            const simulatedProgress = Math.min(95, 100 * (1 - Math.exp(-elapsed / 8)));
            
            let bufferProgress = 0;
            if (video.buffered && video.buffered.length > 0 && video.duration > 0) {
                const buffered = video.buffered.end(video.buffered.length - 1);
                bufferProgress = Math.min(95, (buffered / Math.min(10, video.duration)) * 100);
            }
            
            this.setLoadingProgress(Math.max(simulatedProgress, bufferProgress));
        };

        if (hasVideoFrames()) {
            switchToVideoTexture();
        } else {
            video.addEventListener('loadeddata', onVideoReady);
            video.addEventListener('canplay', onVideoReady);
            video.addEventListener('playing', onVideoReady);

            this.videoCheckInterval = setInterval(() => {
                if (hasVideoFrames()) {
                    onVideoReady();
                }
                // Update progress and animate
                updateProgress();
                this._animateLoadingPlaceholder();
            }, 100);

            setTimeout(() => {
                if (this.videoCheckInterval) {
                    clearInterval(this.videoCheckInterval);
                    this.videoCheckInterval = null;
                }
                if (!this.videoTextureReady && video.readyState >= 2) {
                    switchToVideoTexture();
                }
            }, 10000);
        }

        video.play().catch(() => {});

        return this.mediaTexture;
    }

    /**
     * Draw the loading placeholder with progress indicator
     * @param {number} progress - Loading progress 0-100
     */
    _drawLoadingPlaceholder(progress) {
        if (!this._placeholderCtx) return;
        
        const ctx = this._placeholderCtx;
        const w = 512, h = 512;
        
        // Dark background with subtle gradient
        const time = Date.now() / 1000;
        const bgGrad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w * 0.7);
        bgGrad.addColorStop(0, '#2a2a4e');
        bgGrad.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
        
        // Animated color wave
        const waveGrad = ctx.createLinearGradient(0, 0, w, h);
        const hue1 = (time * 20) % 360;
        waveGrad.addColorStop(0, `hsla(${hue1}, 60%, 20%, 0.3)`);
        waveGrad.addColorStop(0.5, `hsla(${(hue1 + 40) % 360}, 60%, 15%, 0.2)`);
        waveGrad.addColorStop(1, `hsla(${(hue1 + 80) % 360}, 60%, 20%, 0.3)`);
        ctx.fillStyle = waveGrad;
        ctx.fillRect(0, 0, w, h);
        
        // Large spinning ring
        const cx = w / 2;
        const cy = h * 0.38;
        const radius = 60;
        
        ctx.shadowColor = '#f093fb';
        ctx.shadowBlur = 20;
        
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Progress arc
        const progressAngle = (progress / 100) * Math.PI * 2;
        if (progress > 0) {
            const progGrad = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
            progGrad.addColorStop(0, '#f093fb');
            progGrad.addColorStop(1, '#f5576c');
            ctx.strokeStyle = progGrad;
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + progressAngle);
            ctx.stroke();
        }
        
        // Spinning highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, time * 4, time * 4 + Math.PI * 0.3);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
        
        // Percentage in center
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(progress)}%`, cx, cy);
        
        // Progress bar
        const barY = h * 0.65;
        const barH = 16;
        const barW = w * 0.6;
        const barX = (w - barW) / 2;
        const barRadius = 8;
        
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, barRadius);
        ctx.fill();
        
        const fillW = Math.max(barRadius * 2, barW * (progress / 100));
        if (progress > 0) {
            const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
            fillGrad.addColorStop(0, '#f093fb');
            fillGrad.addColorStop(1, '#f5576c');
            ctx.fillStyle = fillGrad;
            ctx.beginPath();
            ctx.roundRect(barX, barY, fillW, barH, barRadius);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.roundRect(barX, barY, fillW, barH / 2, [barRadius, barRadius, 0, 0]);
            ctx.fill();
        }
        
        // Loading text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('Chargement vidéo...', w / 2, barY - 20);
        
        // Animated dots
        const dots = Math.floor(time * 2) % 4;
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '24px Arial';
        ctx.fillText('.'.repeat(dots), w / 2 + 120, barY - 20);
    }

    /**
     * Animate the loading placeholder
     */
    _animateLoadingPlaceholder() {
        if (!this._placeholderCtx || this.videoTextureReady) return;
        
        this._drawLoadingPlaceholder(this._loadingProgress);
        
        if (this.mediaTexture && this.mediaTexture.isCanvasTexture) {
            this.mediaTexture.needsUpdate = true;
        }
    }

    /**
     * Set loading progress externally
     * @param {number} progress - 0-100
     */
    setLoadingProgress(progress) {
        this._loadingProgress = Math.max(0, Math.min(100, progress));
        this._animateLoadingPlaceholder();
    }

    /**
     * Apply common texture settings
     * @param {THREE.Texture} texture 
     */
    _applyTextureSettings(texture) {
        if (!texture) return;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
    }

    /**
     * Update media texture dynamically
     * @param {string} type - 'video' or 'image'
     * @param {HTMLVideoElement|HTMLImageElement} source 
     */
    updateMediaTexture(type, source) {
        if (!source) return;

        if (this.mediaTexture) {
            this.mediaTexture.dispose();
        }

        this.mediaType = type;

        if (type === 'image') {
            this.mediaTexture = new THREE.Texture(source);
            this.mediaTexture.needsUpdate = true;
        } else {
            this.mediaTexture = new THREE.VideoTexture(source);
            const isNetworkStream = source.src && (source.src.startsWith('http') || source.src.startsWith('blob:'));
            if (isNetworkStream) {
                this.setupVideoTextureUpdater(source);
            }
        }

        this._applyTextureSettings(this.mediaTexture);
        this.videoTexture = this.mediaTexture;

        if (this.onTextureReady) {
            this.onTextureReady(this.mediaTexture);
        }

        return this.mediaTexture;
    }

    /**
     * Set up periodic texture updates for streaming video
     * @param {HTMLVideoElement} video 
     */
    setupVideoTextureUpdater(video) {
        const onTimeUpdate = () => {
            if (this.mediaTexture) {
                this.mediaTexture.needsUpdate = true;
            }
        };
        video.addEventListener('timeupdate', onTimeUpdate);
        this._videoEventListeners.push({ element: video, type: 'timeupdate', listener: onTimeUpdate });

        const onPlay = () => {
            if (this.mediaTexture) {
                this.mediaTexture.needsUpdate = true;
            }
        };
        video.addEventListener('play', onPlay);
        this._videoEventListeners.push({ element: video, type: 'play', listener: onPlay });
    }

    /**
     * Wait for video to be ready to play
     * @param {HTMLVideoElement} video 
     * @returns {Promise<void>}
     */
    waitForVideoReady(video) {
        return new Promise((resolve) => {
            if (video.readyState >= 2) {
                resolve();
                return;
            }

            const onCanPlay = () => {
                video.removeEventListener('canplay', onCanPlay);
                video.removeEventListener('loadeddata', onCanPlay);
                video.removeEventListener('error', onError);
                resolve();
            };

            const onError = () => {
                video.removeEventListener('canplay', onCanPlay);
                video.removeEventListener('loadeddata', onCanPlay);
                video.removeEventListener('error', onError);
                console.warn('Video failed to load, continuing anyway');
                resolve();
            };

            video.addEventListener('canplay', onCanPlay);
            video.addEventListener('loadeddata', onCanPlay);
            video.addEventListener('error', onError);

            setTimeout(() => {
                video.removeEventListener('canplay', onCanPlay);
                video.removeEventListener('loadeddata', onCanPlay);
                video.removeEventListener('error', onError);
                console.warn('Video load timeout, continuing anyway');
                resolve();
            }, 10000);
        });
    }

    /**
     * Set callback for when texture is ready
     * @param {Function} callback 
     */
    setOnTextureReady(callback) {
        this.onTextureReady = callback;
    }

    /**
     * Dispose all textures and clean up event listeners
     */
    dispose() {
        if (this.videoCheckInterval) {
            clearInterval(this.videoCheckInterval);
            this.videoCheckInterval = null;
        }

        for (const { element, type, listener } of this._videoEventListeners) {
            element.removeEventListener(type, listener);
        }
        this._videoEventListeners = [];

        if (this.mediaTexture) {
            this.mediaTexture.dispose();
            this.mediaTexture = null;
        }

        if (this.placeholderTexture && this.placeholderTexture !== this.mediaTexture) {
            this.placeholderTexture.dispose();
            this.placeholderTexture = null;
        }

        this.videoTexture = null;
    }
}
