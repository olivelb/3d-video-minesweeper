/**
 * VideoManager - Handles video integration from multiple sources
 * 
 * Platform support:
 * - Direct URLs (.mp4, .webm) - Work everywhere, no server needed
 * - Internet Archive - Works on any server (open access)
 * - YouTube/Dailymotion/Vimeo - ONLY work with LOCAL server
 *   Cloud IPs are blocked by these platforms
 */
import { YOUTUBE_SERVER_URL, getServerUrl } from './config.js';

// Supported platforms and their URL patterns
// needsLocalServer: true = only works with local yt-dlp server (blocked on cloud)
const PLATFORMS = {
    direct: {
        name: 'Direct URL',
        icon: '🎬',
        patterns: [
            /\.(mp4|webm|ogg|ogv|m4v)(\?.*)?$/i,
            /^https?:\/\/.*\.(mp4|webm|ogg|ogv|m4v)/i,
            /^blob:/i
        ],
        needsServer: false,
        needsLocalServer: false
    },
    archive: {
        name: 'Internet Archive',
        icon: '📚',
        patterns: [
            /archive\.org/i
        ],
        needsServer: true,
        needsLocalServer: false  // Works on any server
    },
    youtube: {
        name: 'YouTube',
        icon: '📺',
        patterns: [
            /(?:youtube\.com|youtu\.be|music\.youtube\.com)/i
        ],
        needsServer: true,
        needsLocalServer: true  // Cloud IPs are blocked by YouTube
    },
    dailymotion: {
        name: 'Dailymotion',
        icon: '🎥',
        patterns: [
            /(?:dailymotion\.com|dai\.ly)/i
        ],
        needsServer: true,
        needsLocalServer: true  // Only works with local server
    },
    vimeo: {
        name: 'Vimeo',
        icon: '🎞️',
        patterns: [
            /vimeo\.com/i
        ],
        needsServer: true,
        needsLocalServer: true  // Only works with local server
    },
    peertube: {
        name: 'PeerTube',
        icon: '🌐',
        patterns: [
            /\/videos\/watch\//i,
            /\/w\//i
        ],
        needsServer: true,
        needsLocalServer: false  // Open platforms work
    }
};

export class YouTubeManager {
    constructor(options = {}) {
        // Initial value (likely local default)
        this.serverUrl = options.serverUrl || YOUTUBE_SERVER_URL;

        // Asynchronously update to the demonstrated best server
        if (!options.serverUrl) {
            getServerUrl().then(url => {
                if (url !== this.serverUrl) {
                    console.log(`[YouTubeManager] Updating server URL to: ${url}`);
                    this.serverUrl = url;
                    // Trigger a health check with new URL and notify
                    this.checkServerHealth().then(() => this._notifyConnectionStatus());
                } else {
                    // Update listeners even if URL didn't change (might have gone offline/online)
                    this.checkServerHealth().then(() => this._notifyConnectionStatus());
                }
            });
        }

        this.onStatusChange = options.onStatusChange || (() => { });
        this.onError = options.onError || console.error;

        this.currentVideoId = null;
        this.currentVideoInfo = null;
        this.currentPlatform = null;
        this.isLoading = false;
        this.serverOnline = false;
        this.isLocalServer = false;  // Whether we're using local yt-dlp server
        this.serverCapabilities = {}; // What platforms the server can handle

        this.onConnectionStatusChange = null; // Callback for UI updates
    }

    /**
     * Set callback for server connection status changes
     * @param {Function} callback - Function(isOnline, url, isLocal)
     */
    setConnectionStatusListener(callback) {
        this.onConnectionStatusChange = callback;
    }

    /**
     * Internal helper to notify listeners
     */
    _notifyConnectionStatus() {
        if (this.onConnectionStatusChange) {
            this.onConnectionStatusChange(this.serverOnline, this.serverUrl, this.isLocalServer);
        }
    }

    /**
     * Detect which platform a URL belongs to
     * @param {string} url - Video URL
     * @returns {Object|null} Platform info or null
     */
    detectPlatform(url) {
        if (!url) return null;
        url = url.trim();

        for (const [key, platform] of Object.entries(PLATFORMS)) {
            for (const pattern of platform.patterns) {
                if (pattern.test(url)) {
                    return { key, ...platform };
                }
            }
        }
        return null;
    }

    /**
     * Check if URL is a direct video URL (no server needed)
     * @param {string} url 
     * @returns {boolean}
     */
    isDirectUrl(url) {
        const platform = this.detectPlatform(url);
        return platform?.key === 'direct';
    }

    /**
     * Extract unique identifier from URL based on platform
     * @param {string} url - URL to parse
     * @returns {string|null} ID or null if invalid
     */
    extractId(url) {
        if (!url) return null;
        url = url.trim();

        const platform = this.detectPlatform(url);
        if (!platform) return null;

        if (platform.key === 'youtube') {
            const patterns = [
                /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
                /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
                /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
                /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
                /(?:music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
                /^.*(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([a-zA-Z0-9_-]{11}).*$/
            ];
            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match && match[1]?.length === 11) return match[1];
            }
            if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
        }

        if (platform.key === 'dailymotion') {
            const match = url.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/);
            return match ? match[1] : null;
        }

        if (platform.key === 'archive') {
            const match = url.match(/archive\.org\/details\/([^\/\s\?#]+)/);
            return match ? match[1] : null;
        }

        if (platform.key === 'vimeo') {
            const match = url.match(/vimeo\.com\/(\d+)/);
            return match ? match[1] : null;
        }

        return null;
    }

    /** Legacy alias */
    extractVideoId(url) {
        return this.extractId(url);
    }

    /**
     * Check if server is available and get its capabilities
     * @returns {Promise<boolean>} True if server is online
     */
    async checkServerHealth() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${this.serverUrl}/health`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            this.serverOnline = response.ok;

            // Get server capabilities if available
            if (response.ok) {
                try {
                    const data = await response.json();
                    this.serverCapabilities = data.capabilities || {};
                    // Trust serverType but also verify URL pattern (fixes issues if server thinks it's cloud due to env vars)
                    this.isLocalServer = data.serverType === 'local' ||
                        this.serverUrl.includes('localhost') ||
                        this.serverUrl.includes('127.0.0.1');
                } catch (e) {
                    // Fallback: check URL pattern
                    this.isLocalServer = this.serverUrl.includes('localhost') ||
                        this.serverUrl.includes('127.0.0.1');
                    this.serverCapabilities = {};
                }
            }

            return response.ok;
        } catch (error) {
            this.serverOnline = false;
            this.isLocalServer = false;
            this.serverCapabilities = {};
            return false;
        }
    }

    /**
     * Check if a platform is supported with current server
     * @param {Object} platform - Platform info
     * @returns {boolean} True if platform is supported
     */
    isPlatformSupported(platform) {
        if (!platform) return false;

        // Direct URLs always work
        if (!platform.needsServer) return true;

        // If server reports capabilities, use them
        if (this.serverCapabilities && this.serverCapabilities[platform.key] !== undefined) {
            return this.serverCapabilities[platform.key] && this.serverOnline;
        }

        // Fallback: if platform needs local server, check if we have one
        if (platform.needsLocalServer && !this.isLocalServer) {
            return false;
        }

        // Otherwise, just need any server online
        return this.serverOnline;
    }

    /**
     * Validate any video URL
     * @param {string} url - Video URL to validate
     * @returns {Promise<Object>} Validation result
     */
    async validateUrl(url) {
        const platform = this.detectPlatform(url);

        if (!platform) {
            return { valid: false, error: 'Format de lien non reconnu' };
        }

        // Direct URLs are always valid if they look like video files
        if (platform.key === 'direct') {
            return { valid: true, platform: platform.name };
        }

        // Check if platform is supported with current server
        if (!this.isPlatformSupported(platform)) {
            if (platform.needsLocalServer) {
                return {
                    valid: false,
                    error: `${platform.name} nécessite un serveur local. Utilisez un lien direct (.mp4) ou Internet Archive.`,
                    needsLocalServer: true
                };
            }
            return { valid: false, error: 'Serveur non disponible' };
        }

        // For YouTube, check video ID format
        if (platform.key === 'youtube') {
            const videoId = this.extractVideoId(url);
            if (!videoId) {
                return { valid: false, error: 'Format de lien YouTube invalide' };
            }
        }

        // For server-based platforms, try to validate via server
        if (platform.needsServer && this.serverOnline) {
            try {
                const response = await fetch(
                    `${this.serverUrl}/api/youtube/validate?url=${encodeURIComponent(url)}`
                );

                if (!response.ok) {
                    const error = await response.json();
                    return { valid: false, error: error.error || 'Validation failed' };
                }

                return await response.json();
            } catch (error) {
                return { valid: false, error: 'Serveur non disponible' };
            }
        }

        return { valid: true, platform: platform.name };
    }

    /**
     * Get video information - handles direct URLs and server-based platforms
     * @param {string} url - Video URL
     * @returns {Promise<Object>} Video information
     */
    async getVideoInfo(url) {
        const platform = this.detectPlatform(url);
        this.currentPlatform = platform;

        // Handle direct video URLs (no server needed!)
        if (platform?.key === 'direct') {
            return this.getDirectVideoInfo(url);
        }

        // Handle server-based platforms
        try {
            this.onStatusChange('loading', `Chargement depuis ${platform?.name || 'la source'}...`);

            const response = await fetch(
                `${this.serverUrl}/api/youtube/info?url=${encodeURIComponent(url)}`
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Échec du chargement');
            }

            this.currentVideoInfo = await response.json();
            // Store the original URL for non-YouTube platforms
            this.currentVideoInfo.originalUrl = url;
            this.currentVideoId = this.currentVideoInfo.videoId;

            this.onStatusChange('ready', this.currentVideoInfo.title);
            return this.currentVideoInfo;

        } catch (error) {
            this.onStatusChange('error', error.message);
            this.onError(error);
            throw error;
        }
    }

    /**
     * Get video info from a direct URL (no server needed)
     * @param {string} url - Direct video URL
     * @returns {Promise<Object>} Video information
     */
    async getDirectVideoInfo(url) {
        this.onStatusChange('loading', 'Vérification du lien direct...');

        try {
            // Try to get video metadata via HEAD request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Vidéo inaccessible (${response.status})`);
            }

            const contentType = response.headers.get('content-type') || '';
            const contentLength = response.headers.get('content-length');

            // Check if it's actually a video
            if (!contentType.includes('video') && !url.match(/\.(mp4|webm|ogg|ogv|m4v)(\?.*)?$/i)) {
                throw new Error('Le lien ne pointe pas vers une vidéo');
            }

            // Extract filename from URL
            const urlPath = new URL(url).pathname;
            const filename = decodeURIComponent(urlPath.split('/').pop() || 'Vidéo externe');

            this.currentVideoInfo = {
                videoId: url, // Use URL as ID for direct videos
                title: filename.replace(/\.[^.]+$/, ''), // Remove extension
                author: 'Lien direct',
                duration: 0, // Unknown
                thumbnail: null,
                isLive: false,
                isDirect: true,
                directUrl: url,
                contentType,
                contentLength: contentLength ? parseInt(contentLength) : null
            };

            this.currentVideoId = url;
            this.onStatusChange('ready', `🎬 ${this.currentVideoInfo.title}`);

            return this.currentVideoInfo;

        } catch (error) {
            // If HEAD fails (CORS), still try to use the URL
            console.warn('HEAD request failed, attempting to use URL directly:', error.message);

            const urlPath = new URL(url).pathname;
            const filename = decodeURIComponent(urlPath.split('/').pop() || 'Vidéo externe');

            this.currentVideoInfo = {
                videoId: url,
                title: filename.replace(/\.[^.]+$/, ''),
                author: 'Lien direct',
                duration: 0,
                thumbnail: null,
                isLive: false,
                isDirect: true,
                directUrl: url
            };

            this.currentVideoId = url;
            this.onStatusChange('ready', `🎬 ${this.currentVideoInfo.title}`);

            return this.currentVideoInfo;
        }
    }

    /**
     * Get the stream URL for a video
     * For direct URLs, returns the URL directly
     * For platforms, proxies through server
     * @param {string} videoId - Video ID or direct URL
     * @param {string} quality - Quality preset (auto, low, medium, high)
     * @returns {string|null} Stream URL
     */
    getStreamUrl(videoId = null, quality = 'auto') {
        const id = videoId || this.currentVideoId;
        if (!id) return null;

        // If it's a direct URL, return it as-is
        if (this.currentVideoInfo?.isDirect || this.isDirectUrl(id)) {
            return id;
        }

        // For non-YouTube platforms (Vimeo, Dailymotion, etc.), pass the full URL
        const platform = this.currentPlatform;
        if (platform && platform.key !== 'youtube') {
            // Use the original URL stored in currentVideoInfo or reconstruct from currentVideoId
            const fullUrl = this.currentVideoInfo?.originalUrl || id;
            return `${this.serverUrl}/api/youtube/stream?url=${encodeURIComponent(fullUrl)}&q=${quality}`;
        }

        // For YouTube, use the video ID
        return `${this.serverUrl}/api/youtube/stream?v=${id}&q=${quality}`;
    }

    /**
     * Get the direct URL for a video (bypasses proxy, fetches from YouTube CDN)
     * For direct URLs, returns the URL directly
     * @param {string} videoId - Video ID (optional, uses current if not provided) 
     * @param {string} quality - Quality preset (auto, low, medium, high)
     * @returns {Promise<string|null>} Direct video URL
     */
    async getDirectUrl(videoId = null, quality = 'auto') {
        const id = videoId || this.currentVideoId;
        if (!id) return null;

        // If it's already a direct URL, return it
        if (this.currentVideoInfo?.isDirect || this.isDirectUrl(id)) {
            return id;
        }

        try {
            const response = await fetch(
                `${this.serverUrl}/api/youtube/direct?v=${id}&q=${quality}`
            );

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || 'Failed to get direct URL');
            }

            const data = await response.json();
            return data.url;
        } catch (error) {
            // Fall back to stream URL
            return this.getStreamUrl(videoId, quality);
        }
    }

    /**
     * Get thumbnail URL for a video
     * @param {string} videoId - Video ID (optional)
     * @param {string} platformKey - Platform key (optional, e.g. 'youtube', 'archive')
     * @returns {string|null} Thumbnail URL
     */
    getThumbnailUrl(videoId = null, platformKey = null) {
        const id = videoId || this.currentVideoId;
        if (!id) return null;

        // Determine platform key
        const key = platformKey || this.currentPlatform?.key || 'youtube';

        if (key === 'youtube') {
            return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
        } else if (key === 'dailymotion') {
            return `https://www.dailymotion.com/thumbnail/video/${id}`;
        } else if (key === 'archive') {
            return `https://archive.org/services/img/${id}`;
        } else if (key === 'vimeo') {
            return null;
        }

        return null;
    }

    /**
     * Load video into a video element
     * @param {HTMLVideoElement} videoElement - Target video element
     * @param {string} url - YouTube URL
     * @param {string} quality - Quality preset
     * @returns {Promise<boolean>} True if successful
     */
    async loadVideo(videoElement, url, quality = 'auto') {
        if (this.isLoading) {
            console.warn('Already loading a video');
            return false;
        }

        this.isLoading = true;
        this.onStatusChange('loading', 'Chargement de la vidéo...');

        try {
            // Get video info first
            await this.getVideoInfo(url);

            // Check if video is suitable
            if (this.currentVideoInfo.isLive) {
                throw new Error('Les streams en direct ne sont pas supportés');
            }

            // TRY DIRECT URL FIRST (Performance Optimization)
            // This avoids routing video traffic through the Pi
            let streamUrl;
            try {
                console.log('[YouTubeManager] Attempting to resolve direct URL...');
                streamUrl = await this.getDirectUrl(null, quality);
                console.log('[YouTubeManager] Using direct URL:', streamUrl.substring(0, 50) + '...');
            } catch (e) {
                console.warn('[YouTubeManager] Direct URL failed, falling back to proxy:', e);
                streamUrl = this.getStreamUrl(null, quality);
            }

            return new Promise((resolve, reject) => {
                const onCanPlay = () => {
                    cleanup();
                    this.isLoading = false;
                    this.onStatusChange('playing', this.currentVideoInfo.title);
                    resolve(true);
                };

                const onError = (e) => {
                    // If Direct URL fails (CORS or 403), we could try falling back to proxy here
                    // But for now, just report error
                    console.error('[YouTubeManager] Video Error:', videoElement.error);
                    cleanup();
                    this.isLoading = false;
                    const error = new Error('Échec du chargement du flux vidéo');
                    this.onStatusChange('error', error.message);
                    reject(error);
                };

                const onLoadedData = () => {
                    // Video has loaded some data, we can start playing
                    videoElement.play().catch(() => { });
                };

                const cleanup = () => {
                    videoElement.removeEventListener('canplay', onCanPlay);
                    videoElement.removeEventListener('error', onError);
                    videoElement.removeEventListener('loadeddata', onLoadedData);
                };

                videoElement.addEventListener('canplay', onCanPlay);
                videoElement.addEventListener('error', onError);
                videoElement.addEventListener('loadeddata', onLoadedData);

                // Set source and load
                videoElement.src = streamUrl;
                videoElement.crossOrigin = 'anonymous';
                videoElement.load();

                // Timeout after 30 seconds
                setTimeout(() => {
                    if (this.isLoading) {
                        cleanup();
                        this.isLoading = false;
                        const error = new Error('Délai d\'attente dépassé');
                        this.onStatusChange('error', error.message);
                        reject(error);
                    }
                }, 30000);
            });

        } catch (error) {
            this.isLoading = false;
            this.onStatusChange('error', error.message);
            throw error;
        }
    }

    /**
     * Clear current video state
     */
    clear() {
        this.currentVideoId = null;
        this.currentVideoInfo = null;
        this.isLoading = false;
    }

    /**
     * Format duration in seconds to MM:SS or HH:MM:SS
     * @param {number} seconds - Duration in seconds
     * @returns {string} Formatted duration
     */
    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';

        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}
