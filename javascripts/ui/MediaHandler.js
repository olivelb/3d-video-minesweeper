/**
 * MediaHandler Module
 * 
 * Handles media source management for the 3D Minesweeper game.
 * Manages video uploads, image uploads (including HEIC conversion),
 * webcam access, and background presets.
 * 
 * @module MediaHandler
 */

/**
 * Supported media types
 * @constant
 * @enum {string}
 */
export const MediaType = {
    VIDEO: 'video',
    IMAGE: 'image',
    WEBCAM: 'webcam'
};

/**
 * Media handler for background sources
 * @class
 */
export class MediaHandler {
    /**
     * Create a media handler
     * @param {HTMLVideoElement} videoElement - Video element for playback
     */
    constructor(videoElement) {
        /** @type {HTMLVideoElement} Video element for media playback */
        this.videoElement = videoElement;
        
        /** @type {string|null} Custom video URL from file upload */
        this.customVideoUrl = null;
        
        /** @type {MediaStream|null} Webcam stream reference */
        this.webcamStream = null;
        
        /** @type {string} Current media type */
        this.mediaType = MediaType.VIDEO;
        
        /** @type {HTMLImageElement|null} Image element for static images */
        this.imageElement = null;
        
        /** @type {boolean} Whether audio is muted */
        this.isMuted = false;
        
        /** @type {string|null} Selected preset value */
        this.selectedPreset = null;
    }

    /**
     * Set up media from the current configuration
     * @param {Object} options - Setup options
     * @param {boolean} [options.useWebcam] - Whether to use webcam
     * @returns {Promise<string>} Background name for analytics
     */
    async setupBackground(options = {}) {
        const { useWebcam = false } = options;

        // Try webcam first if requested
        if (useWebcam) {
            try {
                return await this._setupWebcam();
            } catch (e) {
                console.warn('Webcam failed, using default:', e);
            }
        }

        // Custom uploaded file
        if (this.customVideoUrl) {
            return this._setupCustomVideo();
        }

        // Preset
        if (this.selectedPreset) {
            return this._setupPreset();
        }

        return 'Default';
    }

    /**
     * Setup webcam as media source
     * @private
     * @returns {Promise<string>} Background name
     */
    async _setupWebcam() {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        this.webcamStream = stream;
        this.videoElement.srcObject = stream;
        await this.videoElement.play();
        this.mediaType = MediaType.WEBCAM;
        return 'Webcam';
    }

    /**
     * Setup custom uploaded video
     * @private
     * @returns {string} Background name
     */
    _setupCustomVideo() {
        this.videoElement.src = this.customVideoUrl;
        this.videoElement.muted = this.isMuted;
        this.videoElement.play().catch(() => {});
        this.mediaType = MediaType.VIDEO;
        return 'Custom Upload';
    }

    /**
     * Setup preset background
     * @private
     * @returns {string} Background name
     */
    _setupPreset() {
        const [type, path] = this.selectedPreset.split(':');
        
        if (type === 'video') {
            this.videoElement.src = path;
            this.videoElement.muted = this.isMuted;
            this.videoElement.play().catch(() => {});
            this.mediaType = MediaType.VIDEO;
        } else if (type === 'image') {
            const img = document.getElementById('custom-image-source');
            if (img) {
                img.src = path;
                this.imageElement = img;
                this.mediaType = MediaType.IMAGE;
            }
        }
        
        return path.split('/').pop();
    }

    /**
     * Handle file upload (video or image)
     * @param {File} file - Uploaded file
     * @returns {Promise<void>}
     */
    async handleFileUpload(file) {
        const url = URL.createObjectURL(file);

        if (file.type.startsWith('video/')) {
            this.customVideoUrl = url;
            this.mediaType = MediaType.VIDEO;
            return { type: MediaType.VIDEO, name: file.name };
        }
        
        if (file.type.startsWith('image/') || this._isHeicFile(file)) {
            return await this._handleImageUpload(file, url);
        }
        
        return null;
    }

    /**
     * Check if file is HEIC format
     * @private
     * @param {File} file - File to check
     * @returns {boolean}
     */
    _isHeicFile(file) {
        return file.name.match(/\.(heic|heif)$/i) !== null;
    }

    /**
     * Handle image upload with HEIC conversion support
     * @private
     * @param {File} file - Image file
     * @param {string} url - Object URL
     * @returns {Promise<Object>} Upload result
     */
    async _handleImageUpload(file, url) {
        const img = document.getElementById('custom-image-source');
        if (!img) return null;

        // Convert HEIC if needed
        if (this._isHeicFile(file) && window.heic2any) {
            try {
                const blob = await window.heic2any({ 
                    blob: file, 
                    toType: 'image/jpeg' 
                });
                url = URL.createObjectURL(blob);
            } catch (e) {
                console.error('HEIC conversion failed:', e);
            }
        }

        img.src = url;
        this.imageElement = img;
        this.mediaType = MediaType.IMAGE;
        this.customVideoUrl = null;
        
        return { type: MediaType.IMAGE, name: file.name };
    }

    /**
     * Process a dropped file
     * @param {File} file - Dropped file
     * @returns {Promise<Object|null>} Upload result
     */
    async processDroppedFile(file) {
        const isMedia = file.type.startsWith('video/') || 
                        file.type.startsWith('image/') ||
                        this._isHeicFile(file);
        
        if (isMedia) {
            return await this.handleFileUpload(file);
        }
        
        return null;
    }

    /**
     * Set selected preset
     * @param {string} value - Preset value (e.g., 'video:path/to/video.mp4')
     */
    setPreset(value) {
        this.selectedPreset = value;
        this.customVideoUrl = null;
    }

    /**
     * Toggle audio mute state
     * @returns {boolean} New mute state
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.videoElement) {
            this.videoElement.muted = this.isMuted;
        }
        return this.isMuted;
    }

    /**
     * Set mute state
     * @param {boolean} muted - Mute state
     */
    setMute(muted) {
        this.isMuted = muted;
        if (this.videoElement) {
            this.videoElement.muted = muted;
        }
    }

    /**
     * Stop webcam if active
     */
    stopWebcam() {
        if (this.webcamStream) {
            this.webcamStream.getTracks().forEach(track => track.stop());
            this.webcamStream = null;
            this.videoElement.srcObject = null;
        }
    }

    /**
     * Stop all media playback
     */
    stopAll() {
        this.stopWebcam();
        if (this.videoElement) {
            this.videoElement.pause();
        }
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.stopAll();
        if (this.customVideoUrl) {
            URL.revokeObjectURL(this.customVideoUrl);
        }
    }
}
