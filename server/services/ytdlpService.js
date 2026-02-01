import { spawn, execSync } from 'child_process';
import { extractVideoId, getYouTubeUrl } from '../utils/urlParser.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Setup cookies handling
const COOKIES_PATH = path.join(os.tmpdir(), 'youtube_cookies.txt');
let hasCookies = false;

// Initialize cookies from environment variable if present
if (process.env.YOUTUBE_COOKIES) {
    try {
        // Clean up formatting issues that might occur with copy-pasting into env vars
        const cookieContent = process.env.YOUTUBE_COOKIES.replace(/\\n/g, '\n');
        fs.writeFileSync(COOKIES_PATH, cookieContent);
        hasCookies = true;
        console.log('[yt-dlp] ✅ Cookies loaded from environment variable');
    } catch (error) {
        console.error('[yt-dlp] ❌ Failed to write cookies file:', error.message);
    }
}

/**
 * Get common arguments for yt-dlp including cookies if available
 * @returns {string[]} Array of arguments
 */
function getCommonArgs() {
    const args = [
        '--no-playlist',
        '--no-warnings',
        '--no-check-certificates',
        '--geo-bypass',
        '--force-ipv4'
    ];

    if (hasCookies) {
        args.push('--cookies', COOKIES_PATH);
    }

    return args;
}

// Quality format strings for yt-dlp
// Use combined video+audio formats for browser playback WITH SOUND
// Prioritize H.264 (avc1) codecs for maximum browser compatibility
// "best" selects pre-muxed video+audio, "bestvideo+bestaudio" would require ffmpeg remuxing
// Use pre-muxed formats (vcodec!=none and acodec!=none) for direct streaming to stdout
// Merging separate streams (DASH) to stdout is often problematic/impossible in real-time
const QUALITY_FORMATS = {
    // Combined formats (video+audio) - these have sound and don't require merging
    low: 'best[height<=360][vcodec!=none][acodec!=none][ext=mp4]/best[height<=360][vcodec!=none][acodec!=none]',
    medium: 'best[height<=480][vcodec!=none][acodec!=none][ext=mp4]/best[height<=480][vcodec!=none][acodec!=none]',
    high: 'best[height<=720][vcodec!=none][acodec!=none][ext=mp4]/best[height<=720][vcodec!=none][acodec!=none]',
    highest: 'best[height<=1080][vcodec!=none][acodec!=none][ext=mp4]/best[height<=1080][vcodec!=none][acodec!=none]',
    // auto uses best available combined format (format 18/360p is most reliable for streaming)
    auto: 'best[height<=360][vcodec!=none][acodec!=none][ext=mp4]/best[vcodec!=none][acodec!=none][ext=mp4]/best'
};

// Find yt-dlp executable path
let YT_DLP_PATH = 'yt-dlp';
try {
    if (process.platform === 'win32') {
        YT_DLP_PATH = execSync('where yt-dlp', { encoding: 'utf8' }).trim().split('\n')[0];
    } else {
        YT_DLP_PATH = execSync('which yt-dlp', { encoding: 'utf8' }).trim();
    }
} catch (e) {
    // Use default yt-dlp path
}

/**
 * Execute yt-dlp command and return output
 * @param {string[]} args - Command line arguments
 * @returns {Promise<string>} stdout output
 */
function execYtdlp(args) {
    return new Promise((resolve, reject) => {
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
        const commonArgs = getCommonArgs();
        const args = [
            '--dump-json',
            ...commonArgs,
            fullUrl
        ];

        const output = await execYtdlp(args);

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

    try {
        // Get URL and basic format info in one call using --print
        const commonArgs = getCommonArgs();
        const args = [
            '-f', formatSpec,
            '--print', 'url',
            '--print', 'ext',
            '--print', 'format_id',
            '--print', 'width',
            '--print', 'height',
            '--print', 'fps',
            '--print', 'filesize_approx',
            ...commonArgs,
            fullUrl
        ];

        const output = await execYtdlp(args);

        const lines = output.trim().split('\n');
        const url = lines[0];
        const ext = lines[1] || 'mp4';
        const formatId = lines[2] || 'unknown';
        const width = parseInt(lines[3]) || 0;
        const height = parseInt(lines[4]) || 0;
        const fps = parseInt(lines[5]) || 0;
        const filesize = parseInt(lines[6]) || 0;

        return {
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
    } catch (error) {
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
    const commonArgs = getCommonArgs();

    // Setup args respecting potential cookies
    const args = [
        '-f', formatSpec,
        '-o', '-',  // Output to stdout
        // Standard retries options
        '--retries', '3',
        '--fragment-retries', '3',
        '--extractor-retries', '3',
        ...commonArgs,
        fullUrl
    ];

    const proc = spawn(YT_DLP_PATH, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderrData = '';

    proc.stderr.on('data', (data) => {
        stderrData += data.toString();
    });

    proc.on('error', (err) => {
        console.error(`[yt-dlp] Error: ${err.message}`);
    });

    proc.on('close', (code) => {
        if (code !== 0 && stderrData) {
            console.error(`[yt-dlp] Exit ${code}: ${stderrData.slice(0, 200)}`);
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
        const commonArgs = getCommonArgs();
        const args = [
            '-f', formatSpec,
            '--print', 'ext',
            '--print', 'format_id',
            '--print', 'width',
            '--print', 'height',
            '--print', 'fps',
            '--print', 'filesize_approx',
            ...commonArgs,
            fullUrl
        ];

        const output = await execYtdlp(args);

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
