/**
 * YouTubeManager - Handles YouTube video integration via proxy server
 * This module manages the communication with the backend YouTube proxy
 * and provides methods to load, validate, and stream YouTube videos.
 */
import { YOUTUBE_SERVER_URL } from './config.js';

export class YouTubeManager {
    constructor(options = {}) {
        this.serverUrl = options.serverUrl || YOUTUBE_SERVER_URL;
        this.onStatusChange = options.onStatusChange || (() => {});
        this.onError = options.onError || console.error;
        
        this.currentVideoId = null;
        this.currentVideoInfo = null;
        this.isLoading = false;
        this.serverOnline = false;
    }
    
    /**
     * Extract video ID from YouTube URL
     * @param {string} url - YouTube URL or video ID
     * @returns {string|null} Video ID or null if invalid
     */
    extractVideoId(url) {
        if (!url) return null;
        
        url = url.trim();
        
        // Already just an ID (11 characters)
        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
            return url;
        }
        
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
            if (match && match[1]?.length === 11) {
                return match[1];
            }
        }
        return null;
    }
    
    /**
     * Check if server is available
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
            return response.ok;
        } catch (error) {
            this.serverOnline = false;
            return false;
        }
    }
    
    /**
     * Validate YouTube URL via server
     * @param {string} url - YouTube URL to validate
     * @returns {Promise<Object>} Validation result
     */
    async validateUrl(url) {
        const videoId = this.extractVideoId(url);
        if (!videoId) {
            return { valid: false, error: 'Format de lien YouTube invalide' };
        }
        
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
    
    /**
     * Get video information from the server
     * @param {string} url - YouTube URL
     * @returns {Promise<Object>} Video information
     */
    async getVideoInfo(url) {
        try {
            this.onStatusChange('loading', 'Chargement des informations...');
            
            const response = await fetch(
                `${this.serverUrl}/api/youtube/info?url=${encodeURIComponent(url)}`
            );
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Échec du chargement');
            }
            
            this.currentVideoInfo = await response.json();
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
     * Get the stream URL for a video (proxied through server)
     * @param {string} videoId - Video ID (optional, uses current if not provided)
     * @param {string} quality - Quality preset (auto, low, medium, high)
     * @returns {string|null} Stream URL
     */
    getStreamUrl(videoId = null, quality = 'auto') {
        const id = videoId || this.currentVideoId;
        if (!id) return null;
        return `${this.serverUrl}/api/youtube/stream?v=${id}&q=${quality}`;
    }
    
    /**
     * Get the direct URL for a video (bypasses proxy, fetches from YouTube CDN)
     * This is preferred because it supports Range requests for seeking
     * @param {string} videoId - Video ID (optional, uses current if not provided) 
     * @param {string} quality - Quality preset (auto, low, medium, high)
     * @returns {Promise<string|null>} Direct video URL
     */
    async getDirectUrl(videoId = null, quality = 'auto') {
        const id = videoId || this.currentVideoId;
        if (!id) return null;
        
        try {
            const response = await fetch(
                `${this.serverUrl}/api/youtube/direct?v=${id}&q=${quality}`
            );
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || 'Failed to get direct URL');
            }
            
            const data = await response.json();
            console.log('[YouTubeManager] Got direct URL:', data.format);
            return data.url;
        } catch (error) {
            console.error('[YouTubeManager] Failed to get direct URL:', error);
            // Fall back to stream URL
            return this.getStreamUrl(videoId, quality);
        }
    }
    
    /**
     * Get thumbnail URL for a video
     * @param {string} videoId - Video ID (optional)
     * @returns {string|null} Thumbnail URL
     */
    getThumbnailUrl(videoId = null) {
        const id = videoId || this.currentVideoId;
        if (!id) return null;
        return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
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
            
            // Set video source to stream URL
            const streamUrl = this.getStreamUrl(null, quality);
            
            return new Promise((resolve, reject) => {
                const onCanPlay = () => {
                    cleanup();
                    this.isLoading = false;
                    this.onStatusChange('playing', this.currentVideoInfo.title);
                    resolve(true);
                };
                
                const onError = (e) => {
                    cleanup();
                    this.isLoading = false;
                    const error = new Error('Échec du chargement du flux vidéo');
                    this.onStatusChange('error', error.message);
                    reject(error);
                };
                
                const onLoadedData = () => {
                    // Video has loaded some data, we can start playing
                    videoElement.play().catch(() => {});
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
