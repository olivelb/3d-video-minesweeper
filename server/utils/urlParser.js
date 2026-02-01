/**
 * Extract YouTube video ID from various URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://music.youtube.com/watch?v=VIDEO_ID
 * - Plain VIDEO_ID (11 characters)
 */
export function extractVideoId(url) {
    if (!url) return null;
    
    // Trim whitespace and sanitize
    url = sanitizeUrl(url);
    if (!url) return null;
    
    // Already just an ID (11 characters, alphanumeric + _ and -)
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
        return url;
    }
    
    const patterns = [
        // Standard watch URL
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
        // Short URL
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        // Embed URL
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        // Old embed URL
        /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
        // Shorts URL
        /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        // YouTube Music
        /(?:music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
        // Generic pattern (fallback)
        /^.*(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([a-zA-Z0-9_-]{11}).*$/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1] && match[1].length === 11) {
            return match[1];
        }
    }
    
    return null;
}

/**
 * Check if a string is a valid YouTube URL or video ID
 */
export function isValidYouTubeUrl(url) {
    return extractVideoId(url) !== null;
}

/**
 * Get the full YouTube URL from a video ID
 */
export function getYouTubeUrl(videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Sanitize and validate URL input to prevent injection attacks
 * @param {string} url - The URL to sanitize
 * @returns {string|null} Sanitized URL or null if invalid
 */
export function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    
    // Trim and limit length (prevent DoS with huge strings)
    url = url.trim().slice(0, 2048);
    
    // Remove null bytes and control characters
    url = url.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Check for dangerous protocols
    const lowerUrl = url.toLowerCase();
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
    if (dangerousProtocols.some(proto => lowerUrl.startsWith(proto))) {
        return null;
    }
    
    // Only allow http/https or no protocol (treated as video ID)
    if (url.includes('://') && !lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://')) {
        return null;
    }
    
    return url;
}

/**
 * Validate URL is from an allowed video platform
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is from allowed platform
 */
export function isAllowedPlatform(url) {
    if (!url) return false;
    
    const sanitized = sanitizeUrl(url);
    if (!sanitized) return false;
    
    // If it's just an ID (no protocol), treat as YouTube
    if (!sanitized.includes('://')) {
        return /^[a-zA-Z0-9_-]{11}$/.test(sanitized);
    }
    
    // Allowed video platform domains
    const allowedDomains = [
        'youtube.com',
        'www.youtube.com',
        'youtu.be',
        'music.youtube.com',
        'vimeo.com',
        'www.vimeo.com',
        'player.vimeo.com',
        'dailymotion.com',
        'www.dailymotion.com',
        'archive.org',
        'www.archive.org'
    ];
    
    try {
        const urlObj = new URL(sanitized);
        const hostname = urlObj.hostname.toLowerCase();
        
        // Check exact match or subdomain match for PeerTube instances
        if (allowedDomains.includes(hostname)) {
            return true;
        }
        
        // Allow PeerTube instances (they often have unique domains)
        // but require https for security
        if (urlObj.protocol === 'https:' && 
            (urlObj.pathname.includes('/videos/watch/') || 
             urlObj.pathname.includes('/w/'))) {
            return true;
        }
        
        return false;
    } catch {
        return false;
    }
}
