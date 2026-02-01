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
        // Create placeholder texture
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, 64, 64);
        this.mediaTexture = new THREE.CanvasTexture(canvas);
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
