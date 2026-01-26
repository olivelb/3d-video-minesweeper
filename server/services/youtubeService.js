import ytdl from '@distube/ytdl-core';
import { extractVideoId, getYouTubeUrl } from '../utils/urlParser.js';

// Create an agent with cookies to help bypass some restrictions
const agent = ytdl.createAgent();

// Quality presets optimized for texture use (video only, no audio needed)
// Using specific itags for MP4 format which is more compatible with browsers
const QUALITY_PRESETS = {
    low: { quality: '134', filter: 'videoonly' },      // 360p MP4
    medium: { quality: '135', filter: 'videoonly' },   // 480p MP4
    high: { quality: '136', filter: 'videoonly' },     // 720p MP4
    highest: { quality: '137', filter: 'videoonly' },  // 1080p MP4
    auto: { quality: 'lowestvideo', filter: (format) => format.container === 'mp4' && format.hasVideo && !format.hasAudio }
};

/**
 * Get video information
 * @param {string} urlOrId - YouTube URL or video ID
 * @returns {Promise<Object>} Video information
 */
export async function getVideoInfo(urlOrId) {
    const videoId = extractVideoId(urlOrId);
    if (!videoId) {
        throw new Error('Invalid YouTube URL or video ID');
    }
    
    const fullUrl = getYouTubeUrl(videoId);
    
    try {
        const info = await ytdl.getInfo(fullUrl, { agent });
        
        // Get available video-only formats
        const videoFormats = info.formats
            .filter(f => f.hasVideo && !f.hasAudio)
            .map(f => ({
                quality: f.qualityLabel,
                itag: f.itag,
                container: f.container,
                fps: f.fps,
                width: f.width,
                height: f.height,
                url: f.url // Include URL for direct streaming
            }))
            .sort((a, b) => (b.height || 0) - (a.height || 0));
        
        return {
            videoId,
            title: info.videoDetails.title,
            author: info.videoDetails.author.name,
            channelUrl: info.videoDetails.author.channel_url,
            duration: parseInt(info.videoDetails.lengthSeconds, 10),
            thumbnail: info.videoDetails.thumbnails?.slice(-1)[0]?.url || 
                       `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            isLive: info.videoDetails.isLiveContent,
            isPrivate: info.videoDetails.isPrivate,
            viewCount: parseInt(info.videoDetails.viewCount, 10) || 0,
            availableQualities: videoFormats,
            formats: info.formats // Keep full formats for direct URL access
        };
    } catch (error) {
        console.error(`Failed to get video info for ${videoId}:`, error.message);
        throw error;
    }
}

/**
 * Create a video stream
 * @param {string} videoId - YouTube video ID
 * @param {string} quality - Quality preset (low, medium, high, auto)
 * @returns {ReadableStream} Video stream
 */
export function createVideoStream(videoId, quality = 'auto') {
    const url = getYouTubeUrl(videoId);
    const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.auto;
    
    // For 'auto' quality, use a custom filter to get MP4 video-only format
    const options = {
        highWaterMark: 1 << 25,  // 32MB buffer for smooth streaming
        agent, // Use the agent with cookies
    };
    
    if (typeof preset.filter === 'function') {
        // Custom filter function for auto mode
        options.filter = preset.filter;
        options.quality = preset.quality;
    } else {
        // Use preset quality and filter
        options.quality = preset.quality;
        options.filter = preset.filter;
    }
    
    console.log(`[STREAM] Creating stream for ${videoId} with quality: ${quality}`);
    
    return ytdl(url, options);
}

/**
 * Get the best format info for streaming
 * @param {string} videoId - YouTube video ID
 * @param {string} quality - Quality preset
 * @returns {Promise<Object>} Format information
 */
export async function getStreamFormat(videoId, quality = 'auto') {
    const url = getYouTubeUrl(videoId);
    const info = await ytdl.getInfo(url, { agent });
    const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.auto;
    
    let format;
    try {
        if (typeof preset.filter === 'function') {
            format = ytdl.chooseFormat(info.formats, {
                quality: preset.quality,
                filter: preset.filter
            });
        } else {
            format = ytdl.chooseFormat(info.formats, {
                quality: preset.quality,
                filter: preset.filter
            });
        }
    } catch (e) {
        // Fallback: find any MP4 video-only format
        format = info.formats.find(f => f.container === 'mp4' && f.hasVideo && !f.hasAudio);
        if (!format) {
            format = info.formats.find(f => f.hasVideo && !f.hasAudio);
        }
    }
    
    if (!format) {
        throw new Error('No suitable video format found');
    }
    
    return {
        itag: format.itag,
        mimeType: format.mimeType || 'video/mp4',
        contentLength: format.contentLength,
        quality: format.qualityLabel,
        fps: format.fps,
        container: format.container
    };
}

/**
 * Validate if video is accessible and suitable for streaming
 * @param {string} urlOrId - YouTube URL or video ID
 * @returns {Promise<Object>} Validation result
 */
export async function validateVideo(urlOrId) {
    try {
        const info = await getVideoInfo(urlOrId);
        
        // Check for live streams (not supported)
        if (info.isLive) {
            return {
                valid: false,
                error: 'Live streams are not supported',
                code: 'LIVE_STREAM'
            };
        }
        
        // Check for very long videos (> 30 minutes might cause issues)
        const isLong = info.duration > 1800;
        
        return {
            valid: true,
            videoId: info.videoId,
            title: info.title,
            author: info.author,
            duration: info.duration,
            thumbnail: info.thumbnail,
            isLong,
            warning: isLong ? 'Long videos may take time to load and use more bandwidth' : null
        };
    } catch (error) {
        return {
            valid: false,
            error: error.message,
            code: 'VALIDATION_FAILED'
        };
    }
}
