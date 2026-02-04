/**
 * TextureManager Module
 * 
 * Centralized texture loading and management for the 3D Minesweeper game.
 * Handles loading of number textures, particle textures, video/image media,
 * and provides a loading placeholder system with animated progress indicators.
 * 
 * @module TextureManager
 * @requires three
 */

import * as THREE from 'three';

/**
 * Configuration constants for texture management
 * @constant
 */
const TEXTURE_CONFIG = {
    /** Number of digit textures (1-8 for minesweeper) */
    DIGIT_COUNT: 8,
    /** Path prefix for digit textures */
    DIGIT_PATH_PREFIX: 'images/j',
    /** File extension for textures */
    TEXTURE_EXTENSION: '.png',
    /** Placeholder canvas dimensions */
    PLACEHOLDER_SIZE: 512
};

/**
 * Manages all textures for the 3D minesweeper renderer
 * @class
 */
export class TextureManager {
    /**
     * Create a texture manager
     */
    constructor() {
        /** @type {THREE.TextureLoader} Shared texture loader instance */
        this.textureLoader = new THREE.TextureLoader();
        
        /** @type {Object.<string, THREE.Texture>} Loaded textures by key */
        this.textures = {};
        
        /** @type {THREE.Texture|null} Current media texture (video/image) */
        this.mediaTexture = null;
        
        /** @type {string} Type of media: 'video', 'image', or 'webcam' */
        this.mediaType = 'video';
        
        /** @type {boolean} Whether video texture is ready to display */
        this.videoTextureReady = false;
        
        /** @type {THREE.Texture|null} Placeholder texture during loading */
        this.placeholderTexture = null;

        // Loading animation state
        /** @private @type {HTMLCanvasElement|null} */
        this._placeholderCanvas = null;
        /** @private @type {CanvasRenderingContext2D|null} */
        this._placeholderCtx = null;
        /** @private @type {number} */
        this._loadingProgress = 0;
        /** @private @type {number} */
        this._loadingStartTime = 0;

        /** @private @type {Array} Video event listeners for cleanup */
        this._videoEventListeners = [];
        
        /** @private @type {number|null} Interval ID for video readiness check */
        this._videoCheckInterval = null;
    }

    /**
     * Load all game textures
     * @returns {Promise<void>}
     */
    async loadGameTextures() {
        // Load number textures (1-8)
        for (let i = 1; i <= TEXTURE_CONFIG.DIGIT_COUNT; i++) {
            const path = `${TEXTURE_CONFIG.DIGIT_PATH_PREFIX}${i}${TEXTURE_CONFIG.TEXTURE_EXTENSION}`;
            this.textures[i] = this.textureLoader.load(path);
        }

        // Load particle and flag textures
        this.textures['flag'] = this.textureLoader.load('images/star.png');
        this.textures['particle'] = this.textureLoader.load('images/flare.png');
    }

    /**
     * Initialize media texture from video or image element
     * @param {HTMLVideoElement|HTMLImageElement} element - Media source element
     * @param {Object} [options] - Configuration options
     * @param {Object} [options.loadingState] - Pre-existing loading state from UI
     * @returns {Promise<THREE.Texture>}
     */
    async initializeMediaTexture(element, options = {}) {
        const { loadingState = null } = options;

        // Check for custom uploaded image
        const customImage = document.getElementById('custom-image-source');
        if (this._isValidImageSource(customImage)) {
            return this._createImageTexture(customImage);
        }

        // Handle video element
        if (element instanceof HTMLVideoElement) {
            return this._createVideoTexture(element, loadingState);
        }

        // Fallback: create texture from provided element
        this.mediaTexture = new THREE.Texture(element);
        this._applyTextureSettings(this.mediaTexture);
        this.mediaTexture.needsUpdate = true;
        return this.mediaTexture;
    }

    /**
     * Check if image source is valid for use
     * @private
     * @param {HTMLImageElement} img - Image element to check
     * @returns {boolean}
     */
    _isValidImageSource(img) {
        return img && 
               img.src && 
               img.src !== '' && 
               img.src !== window.location.href;
    }

    /**
     * Create texture from an image element
     * @private
     * @param {HTMLImageElement} img - Image element
     * @returns {THREE.Texture}
     */
    _createImageTexture(img) {
        this.mediaType = 'image';
        
        if (img.complete && img.naturalWidth > 0) {
            this.mediaTexture = new THREE.Texture(img);
            this.mediaTexture.needsUpdate = true;
        } else {
            this.mediaTexture = new THREE.Texture(img);
            img.onload = () => {
                this.mediaTexture.needsUpdate = true;
            };
        }
        
        this._applyTextureSettings(this.mediaTexture);
        return this.mediaTexture;
    }

    /**
     * Create texture from a video element with loading placeholder
     * @private
     * @param {HTMLVideoElement} video - Video element
     * @param {Object|null} loadingState - Pre-existing loading state
     * @returns {Promise<THREE.Texture>}
     */
    async _createVideoTexture(video, loadingState) {
        this.mediaType = 'video';
        const isNetworkStream = this._isNetworkStream(video);

        if (isNetworkStream) {
            return this._handleNetworkVideo(video, loadingState);
        }

        // Local video - create direct texture
        this.mediaTexture = new THREE.VideoTexture(video);
        this._applyTextureSettings(this.mediaTexture);
        this.videoTextureReady = true;
        return this.mediaTexture;
    }

    /**
     * Check if video source is from network
     * @private
     * @param {HTMLVideoElement} video - Video element
     * @returns {boolean}
     */
    _isNetworkStream(video) {
        return video.src && (
            video.src.startsWith('http') || 
            video.src.startsWith('blob:')
        );
    }

    /**
     * Handle network video with loading placeholder
     * @private
     * @param {HTMLVideoElement} video - Video element
     * @param {Object|null} loadingState - Pre-existing loading state
     * @returns {THREE.Texture}
     */
    _handleNetworkVideo(video, loadingState) {
        const videoHasFrames = this._videoHasFrames(video);

        if (videoHasFrames) {
            return this._createDirectVideoTexture(video);
        }

        // Create placeholder while video loads
        this._createLoadingPlaceholder(loadingState);
        this._setupVideoReadinessDetection(video);

        video.play().catch(() => { });
        return this.mediaTexture;
    }

    /**
     * Check if video has actual visible frames
     * @private
     * @param {HTMLVideoElement} video - Video element
     * @returns {boolean}
     */
    _videoHasFrames(video) {
        return video.readyState >= 2 && 
               video.videoWidth > 0 && 
               video.videoHeight > 0;
    }

    /**
     * Create direct video texture when video is ready
     * @private
     * @param {HTMLVideoElement} video - Video element
     * @returns {THREE.VideoTexture}
     */
    _createDirectVideoTexture(video) {
        this.mediaTexture = new THREE.VideoTexture(video);
        this._applyTextureSettings(this.mediaTexture);
        this.videoTextureReady = true;
        this._setupVideoTextureUpdater(video);
        video.play().catch(() => { });
        return this.mediaTexture;
    }

    /**
     * Create animated loading placeholder
     * @private
     * @param {Object|null} loadingState - Pre-existing loading state
     */
    _createLoadingPlaceholder(loadingState) {
        const canvas = document.createElement('canvas');
        canvas.width = TEXTURE_CONFIG.PLACEHOLDER_SIZE;
        canvas.height = TEXTURE_CONFIG.PLACEHOLDER_SIZE;
        
        this._placeholderCanvas = canvas;
        this._placeholderCtx = canvas.getContext('2d');
        this._loadingProgress = loadingState?.progress || 0;
        this._loadingStartTime = loadingState?.startTime || Date.now();
        
        this._drawLoadingPlaceholder();
        
        this.mediaTexture = new THREE.CanvasTexture(canvas);
        this._applyTextureSettings(this.mediaTexture);
        this.placeholderTexture = this.mediaTexture;
    }

    /**
     * Setup detection for when video becomes ready
     * @private
     * @param {HTMLVideoElement} video - Video element
     */
    _setupVideoReadinessDetection(video) {
        const switchToVideoTexture = () => {
            if (this.videoTextureReady) return;
            
            // Dispose placeholder
            if (this.mediaTexture) {
                this.mediaTexture.dispose();
            }
            this._placeholderCanvas = null;
            this._placeholderCtx = null;

            this.videoTextureReady = true;
            this.mediaTexture = new THREE.VideoTexture(video);
            this._applyTextureSettings(this.mediaTexture);
            this._setupVideoTextureUpdater(video);
            
            // Notify listeners if callback registered
            if (this.onTextureReady) {
                this.onTextureReady(this.mediaTexture);
            }
        };

        const onVideoReady = () => {
            if (this._videoHasFrames(video)) {
                switchToVideoTexture();
                this._cleanupVideoListeners(video);
            }
        };

        // Listen for video readiness events
        video.addEventListener('loadeddata', onVideoReady);
        video.addEventListener('canplay', onVideoReady);
        video.addEventListener('playing', onVideoReady);
        
        this._videoEventListeners.push(
            { element: video, type: 'loadeddata', listener: onVideoReady },
            { element: video, type: 'canplay', listener: onVideoReady },
            { element: video, type: 'playing', listener: onVideoReady }
        );

        // Poll periodically as backup
        this._videoCheckInterval = setInterval(() => {
            if (this._videoHasFrames(video)) {
                onVideoReady();
            }
            this._updateLoadingProgress(video);
            this._animateLoadingPlaceholder();
        }, 100);

        // Timeout after 15 seconds
        setTimeout(() => {
            if (!this.videoTextureReady && video.readyState >= 1) {
                switchToVideoTexture();
            }
            this._cleanupVideoListeners(video);
        }, 15000);
    }

    /**
     * Clean up video readiness listeners
     * @private
     * @param {HTMLVideoElement} video - Video element
     */
    _cleanupVideoListeners(video) {
        if (this._videoCheckInterval) {
            clearInterval(this._videoCheckInterval);
            this._videoCheckInterval = null;
        }
        
        // Keep texture update listeners, just remove readiness detection
    }

    /**
     * Setup periodic texture updates for streaming video
     * @private
     * @param {HTMLVideoElement} video - Video element
     */
    _setupVideoTextureUpdater(video) {
        const onTimeUpdate = () => {
            if (this.mediaTexture) {
                this.mediaTexture.needsUpdate = true;
            }
        };
        
        const onPlay = () => {
            if (this.mediaTexture) {
                this.mediaTexture.needsUpdate = true;
            }
        };
        
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('play', onPlay);
        
        this._videoEventListeners.push(
            { element: video, type: 'timeupdate', listener: onTimeUpdate },
            { element: video, type: 'play', listener: onPlay }
        );
    }

    /**
     * Apply common texture settings
     * @private
     * @param {THREE.Texture} texture - Texture to configure
     */
    _applyTextureSettings(texture) {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
    }

    /**
     * Update loading progress based on video state
     * @private
     * @param {HTMLVideoElement} video - Video element
     */
    _updateLoadingProgress(video) {
        const elapsed = (Date.now() - this._loadingStartTime) / 1000;
        // Realistic curve: 50% at 5s, 80% at 10s, 95% at 12s
        const simulatedProgress = Math.min(95, 100 * (1 - Math.exp(-elapsed / 5)));

        let bufferProgress = 0;
        if (video.buffered && video.buffered.length > 0 && video.duration > 0) {
            const buffered = video.buffered.end(video.buffered.length - 1);
            bufferProgress = Math.min(95, (buffered / Math.min(10, video.duration)) * 100);
        }

        this._loadingProgress = Math.max(simulatedProgress, bufferProgress);
    }

    /**
     * Set loading progress externally
     * @param {number} progress - Progress value 0-100
     */
    setLoadingProgress(progress) {
        this._loadingProgress = Math.max(0, Math.min(100, progress));
        this._animateLoadingPlaceholder();
    }

    /**
     * Draw animated loading placeholder
     * @private
     */
    _drawLoadingPlaceholder() {
        if (!this._placeholderCtx) return;

        const ctx = this._placeholderCtx;
        const w = TEXTURE_CONFIG.PLACEHOLDER_SIZE;
        const h = TEXTURE_CONFIG.PLACEHOLDER_SIZE;
        const progress = this._loadingProgress;
        const time = Date.now() / 1000;

        // Dark gradient background
        const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
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

        // Spinning ring
        const cx = w / 2;
        const cy = h * 0.38;
        const radius = 60;

        ctx.shadowColor = '#f093fb';
        ctx.shadowBlur = 20;

        // Background circle
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

        // Percentage text
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
        }

        // Loading text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Arial';
        ctx.fillText('Chargement vidéo...', w / 2, barY - 20);

        // Animated dots
        const dots = Math.floor(time * 2) % 4;
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '24px Arial';
        ctx.fillText('.'.repeat(dots), w / 2 + 120, barY - 20);
    }

    /**
     * Animate the loading placeholder
     * @private
     */
    _animateLoadingPlaceholder() {
        if (!this._placeholderCtx || this.videoTextureReady) return;
        
        this._drawLoadingPlaceholder();
        
        if (this.mediaTexture && this.mediaTexture.isCanvasTexture) {
            this.mediaTexture.needsUpdate = true;
        }
    }

    /**
     * Update media texture dynamically
     * @param {string} type - 'video' or 'image'
     * @param {HTMLVideoElement|HTMLImageElement} source - Media source
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
            if (this._isNetworkStream(source)) {
                this._setupVideoTextureUpdater(source);
            }
        }

        this._applyTextureSettings(this.mediaTexture);
        return this.mediaTexture;
    }

    /**
     * Get texture by key
     * @param {string|number} key - Texture identifier
     * @returns {THREE.Texture|null}
     */
    getTexture(key) {
        return this.textures[key] || null;
    }

    /**
     * Get current media texture
     * @returns {THREE.Texture|null}
     */
    getMediaTexture() {
        return this.mediaTexture;
    }

    /**
     * Clean up all resources
     */
    dispose() {
        // Clear intervals
        if (this._videoCheckInterval) {
            clearInterval(this._videoCheckInterval);
        }

        // Remove event listeners
        this._videoEventListeners.forEach(({ element, type, listener }) => {
            element.removeEventListener(type, listener);
        });
        this._videoEventListeners = [];

        // Dispose textures
        Object.values(this.textures).forEach(tex => {
            if (tex) tex.dispose();
        });

        if (this.mediaTexture) this.mediaTexture.dispose();
        if (this.placeholderTexture) this.placeholderTexture.dispose();

        this.textures = {};
        this.mediaTexture = null;
        this.placeholderTexture = null;
    }
}
