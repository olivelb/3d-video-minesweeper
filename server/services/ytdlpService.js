import { spawn, execSync } from 'child_process';
import { extractVideoId, getYouTubeUrl } from '../utils/urlParser.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import http from 'http';

// Setup cookies handling
const COOKIES_PATH = path.join(os.tmpdir(), 'youtube_cookies.txt');
let hasCookies = false;

// Simple in-memory cache
const urlCache = new Map();
const CACHE_TTL = 3600 * 1000; // 1 hour

// Initialize cookies from environment variable if present
if (process.env.YOUTUBE_COOKIES) {
    try {
        let cookieContent = process.env.YOUTUBE_COOKIES.trim();

        // Check if it's Base64 encoded (doesn't start with # and is likely base64)
        if (!cookieContent.startsWith('#') && !cookieContent.includes('\n')) {
            try {
                const decoded = Buffer.from(cookieContent, 'base64').toString('utf-8');
                if (decoded.includes('Netscape')) {
                    cookieContent = decoded;
                    console.log('[yt-dlp] 📦 Detected Base64 cookies, decoding...');
                }
            } catch (e) {
                // Not base64, continue with plain text
            }
        }

        // Clean up formatting issues that might occur with copy-pasting into env vars
        cookieContent = cookieContent.replace(/\\n/g, '\n');

        fs.writeFileSync(COOKIES_PATH, cookieContent);
        hasCookies = true;
        console.log('[yt-dlp] ✅ Cookies loaded and verified');
    } catch (error) {
        console.error('[yt-dlp] ❌ Failed to process cookies:', error.message);
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
        '--force-ipv4',
        // Use Android client API which is less strict about bot detection
        '--extractor-args', 'youtube:player_client=android'
    ];

    // Only add cookies if the file exists and was written successfully
    if (hasCookies && fs.existsSync(COOKIES_PATH)) {
        args.push('--cookies', COOKIES_PATH);
    }

    return args;
}

/**
 * Resolve video ID or URL to a full URL
 * @param {string} videoIdOrUrl - The video ID or URL
 * @returns {string} The resolved URL
 */
function resolveTargetUrl(videoIdOrUrl) {
    // If it's already a URL, return as-is
    if (videoIdOrUrl.includes('://')) {
        return videoIdOrUrl;
    }
    // Otherwise, assume it's a YouTube ID
    return getYouTubeUrl(videoIdOrUrl);
}

// Quality format strings for yt-dlp
// Use combined video+audio formats for browser playback WITH SOUND
// Prioritize H.264 (avc1) codecs for maximum browser compatibility
// "best" selects pre-muxed video+audio, "bestvideo+bestaudio" would require ffmpeg remuxing
// Use pre-muxed formats (vcodec!=none and acodec!=none) for direct streaming to stdout
// Merging separate streams (DASH) to stdout is often problematic/impossible in real-time
const QUALITY_FORMATS = {
    // Combined formats (video+audio) - these have sound and don't require merging
    lowest: 'worst[ext=mp4]/worst',  // Fastest possible - smallest file
    low: 'best[height<=360][vcodec!=none][acodec!=none][ext=mp4]/best[height<=360][vcodec!=none][acodec!=none]',
    medium: 'best[height<=480][vcodec!=none][acodec!=none][ext=mp4]/best[height<=480][vcodec!=none][acodec!=none]',
    high: 'best[height<=720][vcodec!=none][acodec!=none][ext=mp4]/best[height<=720][vcodec!=none][acodec!=none]',
    highest: 'best[height<=1080][vcodec!=none][acodec!=none][ext=mp4]/best[height<=1080][vcodec!=none][acodec!=none]',
    // Auto: Use 480p for good quality - Pi bandwidth is sufficient
    auto: 'best[height<=480][vcodec!=none][acodec!=none][ext=mp4]/best[height<=480][ext=mp4]/best[height<=360][ext=mp4]/worst'
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
            windowsHide: true,
            env: { ...process.env, LC_ALL: 'en_US.UTF-8' } // Force English for error parsing
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
    const targetUrl = resolveTargetUrl(urlOrId);
    const videoId = extractVideoId(urlOrId) || urlOrId;

    // Check cache
    if (urlCache.has(videoId)) {
        const cached = urlCache.get(videoId);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log(`[Cache] Hit for ${videoId}`);
            return cached.data;
        }
    }

    try {
        const commonArgs = getCommonArgs();
        const formatStr = QUALITY_FORMATS['auto'] || QUALITY_FORMATS['medium'];
        const args = [
            '--dump-json',
            '-f', formatStr, // Get the format we'll use for streaming
            ...commonArgs,
            targetUrl
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

        const result = {
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
            originalUrl: targetUrl,
            availableQualities: videoFormats
        };

        // Cache the result
        urlCache.set(videoId, { timestamp: Date.now(), data: result });
        
        // PRE-WARM: Cache the direct URL from this response (no extra yt-dlp call!)
        // The --dump-json output includes .url when a format is selected
        if (info.url) {
            const directCacheKey = `direct_${urlOrId}_auto`;
            const directResult = {
                videoId: resolvedId,
                url: info.url,
                format: {
                    itag: info.format_id,
                    mimeType: info.ext ? `video/${info.ext}` : 'video/mp4',
                    contentLength: info.filesize || info.filesize_approx,
                    quality: info.format_note || (info.height ? `${info.height}p` : 'unknown'),
                    fps: info.fps,
                    container: info.ext,
                    width: info.width,
                    height: info.height
                },
                expiresIn: '~6 hours'
            };
            urlCache.set(directCacheKey, { timestamp: Date.now(), data: directResult });
            console.log(`[PreWarm] Direct URL cached from info response for ${videoId}`);
        }
        
        return result;
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
    const targetUrl = resolveTargetUrl(videoIdOrUrl);

    // Direct URL cache key includes quality
    const cacheKey = `direct_${videoIdOrUrl}_${quality}`;
    if (urlCache.has(cacheKey)) {
        const cached = urlCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
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
            targetUrl
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

        urlCache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;

    } catch (error) {
        throw error;
    }
}

/**
 * Create a video stream using yt-dlp stdout
 * Supports any URL that yt-dlp can handle
 * @param {string} videoIdOrUrl - YouTube video ID or full URL
 * @param {string} quality - Quality preset
 * @returns {Object} Object with stream and process
 */
export function createVideoStream(videoIdOrUrl, quality = 'auto') {
    const targetUrl = resolveTargetUrl(videoIdOrUrl);
    const formatSpec = QUALITY_FORMATS[quality] || QUALITY_FORMATS.auto;
    const commonArgs = getCommonArgs();

    // Setup args for FAST streaming - prioritize speed over quality
    const args = [
        '-f', formatSpec,
        '-o', '-',  // Output to stdout
        // AGGRESSIVE speed optimizations
        '--buffer-size', '4K',      // Tiny buffer = data flows immediately
        '--no-part',                 // Don't wait for segments
        '--no-mtime',                // Skip file time ops
        '--no-cache-dir',            // No disk cache overhead
        '--socket-timeout', '10',    // Fail fast on slow connections
        // Minimal retries for speed
        '--retries', '1',
        '--fragment-retries', '1',
        '--extractor-retries', '1',
        ...commonArgs,
        targetUrl
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
 * Create a FAST video stream using cached direct URL (no yt-dlp delay!)
 * Falls back to yt-dlp streaming if no cached URL available
 * @param {string} videoIdOrUrl - YouTube video ID or full URL
 * @param {string} quality - Quality preset
 * @returns {Promise<Object>} Object with stream and cleanup function
 */
export async function createFastVideoStream(videoIdOrUrl, quality = 'auto') {
    // Check if we have a cached direct URL
    const cacheKey = `direct_${videoIdOrUrl}_${quality}`;
    const cached = urlCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        console.log(`[FastStream] Using cached direct URL for instant streaming`);
        const directUrl = cached.data.url;
        
        return new Promise((resolve, reject) => {
            const protocol = directUrl.startsWith('https') ? https : http;
            const request = protocol.get(directUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }, (response) => {
                // Handle redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    console.log(`[FastStream] Following redirect...`);
                    const redirectProtocol = response.headers.location.startsWith('https') ? https : http;
                    redirectProtocol.get(response.headers.location, (redirectResponse) => {
                        resolve({
                            stream: redirectResponse,
                            contentType: redirectResponse.headers['content-type'] || 'video/mp4',
                            contentLength: redirectResponse.headers['content-length'],
                            cleanup: () => { request.destroy(); }
                        });
                    }).on('error', reject);
                    return;
                }
                
                if (response.statusCode !== 200) {
                    console.warn(`[FastStream] Direct URL returned ${response.statusCode}, falling back to yt-dlp`);
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }
                
                resolve({
                    stream: response,
                    contentType: response.headers['content-type'] || 'video/mp4',
                    contentLength: response.headers['content-length'],
                    cleanup: () => { request.destroy(); }
                });
            });
            
            request.on('error', (err) => {
                console.warn(`[FastStream] Direct fetch failed: ${err.message}, falling back to yt-dlp`);
                reject(err);
            });
            
            // Timeout for direct connection
            request.setTimeout(5000, () => {
                request.destroy();
                reject(new Error('Direct URL timeout'));
            });
        });
    }
    
    // No cached URL - fall back to yt-dlp (slower but works)
    console.log(`[FastStream] No cached URL, falling back to yt-dlp streaming`);
    const { stream, process: proc } = createVideoStream(videoIdOrUrl, quality);
    return {
        stream,
        contentType: 'video/mp4',
        cleanup: () => { proc.kill('SIGTERM'); }
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
    const targetUrl = resolveTargetUrl(videoIdOrUrl);

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
            targetUrl
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
