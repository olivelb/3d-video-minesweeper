import { spawn, execSync } from 'child_process';
import { extractVideoId, getYouTubeUrl } from '../utils/urlParser.js';

// Quality format strings for yt-dlp
// Use combined video+audio formats for browser playback WITH SOUND
// Prioritize H.264 (avc1) codecs for maximum browser compatibility
// "best" selects pre-muxed video+audio, "bestvideo+bestaudio" would require ffmpeg remuxing
const QUALITY_FORMATS = {
    // Combined formats (video+audio) - these have sound
    low: 'best[height<=360][vcodec^=avc1][ext=mp4]/best[height<=360][ext=mp4]/best[height<=360]/worst[ext=mp4]/worst',
    medium: 'best[height<=480][vcodec^=avc1][ext=mp4]/best[height<=480][ext=mp4]/best[height<=480]/best[height<=360]',
    high: 'best[height<=720][vcodec^=avc1][ext=mp4]/best[height<=720][ext=mp4]/best[height<=720]/best[height<=480]',
    highest: 'best[height<=1080][vcodec^=avc1][ext=mp4]/best[height<=1080][ext=mp4]/best[height<=1080]/best',
    // auto uses best available combined format for compatibility
    auto: 'best[vcodec^=avc1][ext=mp4]/best[ext=mp4]/best'
};

// Find yt-dlp executable path
let YT_DLP_PATH = 'yt-dlp';
try {
    if (process.platform === 'win32') {
        YT_DLP_PATH = execSync('where yt-dlp', { encoding: 'utf8' }).trim().split('\n')[0];
    } else {
        YT_DLP_PATH = execSync('which yt-dlp', { encoding: 'utf8' }).trim();
    }
    console.log(`[yt-dlp] Found at: ${YT_DLP_PATH}`);
} catch (e) {
    console.warn('[yt-dlp] Could not find yt-dlp, using default path');
}

/**
 * Execute yt-dlp command and return output
 * @param {string[]} args - Command line arguments
 * @returns {Promise<string>} stdout output
 */
function execYtdlp(args) {
    return new Promise((resolve, reject) => {
        console.log(`[yt-dlp] Running: ${YT_DLP_PATH} ${args.join(' ')}`);
        
        const proc = spawn(YT_DLP_PATH, args, {
            windowsHide: true
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        proc.on('close', (code) => {
            if (code === 0) {
                resolve(stdout.trim());
            } else {
                reject(new Error(stderr || `yt-dlp exited with code ${code}`));
            }
        });
        
        proc.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Get video information using yt-dlp
 * Supports YouTube, Vimeo, Dailymotion, and many other platforms
 * @param {string} urlOrId - Video URL or YouTube video ID
 * @returns {Promise<Object>} Video information
 */
export async function getVideoInfo(urlOrId) {
    // Determine if it's a YouTube ID or a full URL
    let fullUrl;
    let videoId;
    
    // If it looks like a URL (has ://)
    if (urlOrId.includes('://')) {
        fullUrl = urlOrId;
        // Try to extract YouTube ID if it's a YouTube URL
        videoId = extractVideoId(urlOrId) || urlOrId;
    } else {
        // Assume it's a YouTube video ID
        videoId = extractVideoId(urlOrId);
        if (!videoId) {
            throw new Error('Invalid YouTube URL or video ID');
        }
        fullUrl = getYouTubeUrl(videoId);
    }
    
    try {
        console.log(`[yt-dlp] Getting info for ${fullUrl}`);
        const output = await execYtdlp([
            '--dump-json',
            '--no-playlist',
            '--no-warnings',
            '--force-ipv4',
            '--geo-bypass',
            '--no-check-certificates',
            fullUrl
        ]);
        
        const info = JSON.parse(output);
        
        // Use yt-dlp's ID or the URL itself as the identifier
        const resolvedId = info.id || videoId;
        
        // Get available video-only formats (limit to essential fields)
        const videoFormats = (info.formats || [])
            .filter(f => f.vcodec !== 'none' && f.acodec === 'none')
            .slice(0, 10) // Limit to 10 formats
            .map(f => ({
                quality: f.format_note || (f.height ? `${f.height}p` : 'unknown'),
                itag: f.format_id,
                container: f.ext,
                fps: f.fps,
                width: f.width,
                height: f.height
            }))
            .sort((a, b) => (b.height || 0) - (a.height || 0));
        
        console.log(`[yt-dlp] Got info for ${resolvedId}: "${info.title}" (${info.extractor})`);
        
        return {
            videoId: resolvedId,
            title: info.title,
            author: info.uploader || info.channel || info.creator || 'Unknown',
            channelUrl: info.channel_url || info.uploader_url,
            duration: info.duration || 0,
            thumbnail: info.thumbnail,
            isLive: info.is_live || false,
            isPrivate: false,
            viewCount: info.view_count || 0,
            platform: info.extractor || 'unknown',
            originalUrl: fullUrl,
            availableQualities: videoFormats
        };
    } catch (error) {
        console.error(`[yt-dlp] Failed to get video info for ${fullUrl}:`, error.message);
        throw error;
    }
}

/**
 * Get direct video URL using yt-dlp
 * Supports any URL that yt-dlp can handle
 * @param {string} videoIdOrUrl - YouTube video ID or full URL
 * @param {string} quality - Quality preset (low, medium, high, auto)
 * @returns {Promise<Object>} Stream URL and format info
 */
export async function getDirectUrl(videoIdOrUrl, quality = 'auto') {
    // Determine if it's a URL or a YouTube ID
    let fullUrl;
    if (videoIdOrUrl.includes('://')) {
        fullUrl = videoIdOrUrl;
    } else {
        fullUrl = getYouTubeUrl(videoIdOrUrl);
    }
    
    const formatSpec = QUALITY_FORMATS[quality] || QUALITY_FORMATS.auto;
    
    console.log(`[yt-dlp] Getting direct URL for ${fullUrl} with format: ${formatSpec}`);
    
    try {
        // Get URL and basic format info in one call using --print
        const output = await execYtdlp([
            '-f', formatSpec,
            '--print', 'url',
            '--print', 'ext',
            '--print', 'format_id',
            '--print', 'width',
            '--print', 'height',
            '--print', 'fps',
            '--print', 'filesize_approx',
            '--no-playlist',
            '--no-warnings',
            '--force-ipv4',
            '--geo-bypass',
            '--no-check-certificates',
            fullUrl
        ]);
        
        console.log(`[yt-dlp] Raw output received, length: ${output.length}`);
        
        const lines = output.trim().split('\n');
        console.log(`[yt-dlp] Parsed ${lines.length} lines`);
        
        const url = lines[0];
        const ext = lines[1] || 'mp4';
        const formatId = lines[2] || 'unknown';
        const width = parseInt(lines[3]) || 0;
        const height = parseInt(lines[4]) || 0;
        const fps = parseInt(lines[5]) || 0;
        const filesize = parseInt(lines[6]) || 0;
        
        console.log(`[yt-dlp] Got direct URL for ${videoId}: ${width}x${height} ${ext}`);
        
        const result = {
            url,
            format: {
                itag: formatId,
                mimeType: `video/${ext}`,
                contentLength: filesize,
                quality: height ? `${height}p` : 'unknown',
                fps,
                container: ext,
                width,
                height
            }
        };
        
        console.log(`[yt-dlp] Returning result object`);
        return result;
    } catch (error) {
        console.error(`[yt-dlp] Failed to get direct URL for ${videoId}:`, error.message);
        throw error;
    }
}

/**
 * Create a video stream using yt-dlp stdout
 * Supports any URL that yt-dlp can handle
 * @param {string} videoIdOrUrl - YouTube video ID or full URL
 * @param {string} quality - Quality preset
 * @returns {Object} Object with stream and format info
 */
export function createVideoStream(videoIdOrUrl, quality = 'auto') {
    // Determine if it's a URL or a YouTube ID
    let fullUrl;
    if (videoIdOrUrl.includes('://')) {
        fullUrl = videoIdOrUrl;
    } else {
        fullUrl = getYouTubeUrl(videoIdOrUrl);
    }
    
    const formatSpec = QUALITY_FORMATS[quality] || QUALITY_FORMATS.auto;
    
    console.log(`[yt-dlp STREAM] Creating stream for ${fullUrl} with format: ${formatSpec}`);
    
    const proc = spawn(YT_DLP_PATH, [
        '-f', formatSpec,
        '-o', '-',  // Output to stdout
        '--no-playlist',
        '--no-warnings',
        // Options to avoid errors and improve reliability
        '--retries', '3',
        '--fragment-retries', '3',
        '--extractor-retries', '3',
        '--force-ipv4',
        '--no-check-certificates',
        '--geo-bypass',
        fullUrl
    ], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stderrData = '';
    
    proc.stderr.on('data', (data) => {
        stderrData += data.toString();
        console.error(`[yt-dlp STDERR] ${data.toString().trim()}`);
    });
    
    proc.on('error', (err) => {
        console.error(`[yt-dlp PROC ERROR] ${err.message}`);
    });
    
    proc.on('close', (code) => {
        console.log(`[yt-dlp] Process exited with code ${code}`);
        if (code !== 0 && stderrData) {
            console.error(`[yt-dlp] Error output: ${stderrData}`);
        }
    });
    
    return {
        stream: proc.stdout,
        process: proc
    };
}

/**
 * Get the format info for streaming
 * Supports any URL that yt-dlp can handle
 * @param {string} videoIdOrUrl - YouTube video ID or full URL
 * @param {string} quality - Quality preset
 * @returns {Promise<Object>} Format information
 */
export async function getStreamFormat(videoIdOrUrl, quality = 'auto') {
    // Determine if it's a URL or a YouTube ID
    let fullUrl;
    if (videoIdOrUrl.includes('://')) {
        fullUrl = videoIdOrUrl;
    } else {
        fullUrl = getYouTubeUrl(videoIdOrUrl);
    }
    
    const formatSpec = QUALITY_FORMATS[quality] || QUALITY_FORMATS.auto;
    
    try {
        // Use --print to get specific fields instead of full JSON
        const output = await execYtdlp([
            '-f', formatSpec,
            '--print', 'ext',
            '--print', 'format_id',
            '--print', 'width',
            '--print', 'height',
            '--print', 'fps',
            '--print', 'filesize_approx',
            '--no-playlist',
            '--no-warnings',
            '--force-ipv4',
            '--geo-bypass',
            '--no-check-certificates',
            fullUrl
        ]);
        
        const lines = output.trim().split('\n');
        const ext = lines[0] || 'mp4';
        const formatId = lines[1] || 'unknown';
        const width = parseInt(lines[2]) || 0;
        const height = parseInt(lines[3]) || 0;
        const fps = parseInt(lines[4]) || 0;
        const filesize = parseInt(lines[5]) || 0;
        
        return {
            itag: formatId,
            mimeType: `video/${ext}`,
            contentLength: filesize,
            quality: height ? `${height}p` : 'unknown',
            fps,
            container: ext,
            width,
            height
        };
    } catch (error) {
        console.error(`[yt-dlp] Failed to get format info for ${fullUrl}:`, error.message);
        throw error;
    }
}

/**
 * Validate if video is accessible
 * @param {string} urlOrId - YouTube URL or video ID
 * @returns {Promise<Object>} Validation result
 */
export async function validateVideo(urlOrId) {
    try {
        const info = await getVideoInfo(urlOrId);
        
        return {
            valid: true,
            videoId: info.videoId,
            title: info.title,
            duration: info.duration,
            isLive: info.isLive
        };
    } catch (error) {
        return {
            valid: false,
            error: error.message
        };
    }
}
