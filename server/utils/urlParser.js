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
    
    // Trim whitespace
    url = url.trim();
    
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
