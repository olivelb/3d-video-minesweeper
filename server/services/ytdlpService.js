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

// Reliable Invidious instances for Plan C (Cloud YouTube bypass)
const INVIDIOUS_INSTANCES = [
    'https://invidious.fdn.fr',
    'https://yewtu.be',
    'https://vid.puffyan.us',
    'https://invidious.projectsegfau.lt',
    'https://invidious.privacydev.net',
    'https://inv.nadeko.net',
    'https://invidious.jing.rocks',
    'https://yt.artemislena.eu',
    'https://iv.ggtyler.dev',
    'https://invidious.drg.li',
    'https://inv.tux.pizza'
];

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

    // Detect if we're running on cloud (Koyeb/Heroku/Railway/Render)
    const isCloudServer = process.env.KOYEB_APP_ID ||
        process.env.RAILWAY_ENVIRONMENT ||
        process.env.RENDER_EXTERNAL_URL ||
        process.env.HEROKU_APP_ID;

    // Use Android client API only for direct YouTube access (Local)
    // On Cloud, we use Invidious URLs so this argument is irrelevant/harmful
    if (!isCloudServer) {
        args.push('--extractor-args', 'youtube:player_client=android');
    }
    // Only add cookies if the file exists and was written successfully
    // Cookies are generally not needed for Invidious, but kept for local execution
    if (hasCookies && fs.existsSync(COOKIES_PATH)) {
        args.push('--cookies', COOKIES_PATH);
    }

    return args;
}

/**
 * Determine the best URL to use for yt-dlp
 * On Cloud: Transforms YouTube URLs to Invidious URLs to bypass IP blocks
 * On Local: Uses original YouTube URLs
 * @param {string} videoIdOrUrl - The video ID or URL
 * @returns {string} The resolved URL to pass to yt-dlp
 */
function resolveTargetUrl(videoIdOrUrl) {
    // Detect if we're running on cloud (Koyeb/Heroku/Railway/Render)
    const isCloudServer = process.env.KOYEB_APP_ID ||
        process.env.RAILWAY_ENVIRONMENT ||
        process.env.RENDER_EXTERNAL_URL ||
        process.env.HEROKU_APP_ID;

    let fullUrl;
    let isYoutube = false;

    // Check if it's a YouTube URL or ID
    if (videoIdOrUrl.includes('://')) {
        fullUrl = videoIdOrUrl;
        isYoutube = fullUrl.includes('youtube.com') || fullUrl.includes('youtu.be');
    } else {
        // It's an ID, assume YouTube
        isYoutube = true;
        fullUrl = getYouTubeUrl(videoIdOrUrl);
    }

    // If we are on cloud AND it is YouTube, rewrite to Invidious
    if (isCloudServer && isYoutube) {
        const videoId = extractVideoId(fullUrl) || videoIdOrUrl;
        if (videoId && !videoId.includes('://')) {
            const instance = INVIDIOUS_INSTANCES[Math.floor(Math.random() * INVIDIOUS_INSTANCES.length)];
            const invidiousUrl = `${instance}/watch?v=${videoId}`;
            console.log(`[yt-dlp] ☁️ Cloud detected: Rewriting YouTube URL -> ${invidiousUrl}`);
            return invidiousUrl;
        }
    }

    return fullUrl;
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
    // auto uses 720p combined format (good balance of quality and compatibility)
    auto: 'best[height<=720][vcodec!=none][acodec!=none][ext=mp4]/best[height<=720][vcodec!=none][acodec!=none]'
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
 * Try to fetch video info from Invidious API (Plan C)
 * @param {string} videoId 
 */
async function fetchInvidiousInfo(videoId) {
    // Shuffle instances to distribute load and find working one
    const instances = [...INVIDIOUS_INSTANCES].sort(() => Math.random() - 0.5);

    for (const instance of instances) {
        try {
            console.log(`[Invidious API] Trying ${instance}...`);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout

            const response = await fetch(`${instance}/api/v1/videos/${videoId}`, {
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (response.ok) {
                // Critical check: Ensure response is actually JSON and not an HTML error page
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    console.warn(`[Invidious API] Invalid content-type ${contentType} from ${instance}`);
                    continue;
                }

                try {
                    const data = await response.json();
                    if (data.error) {
                        console.warn(`[Invidious API] API Error from ${instance}: ${data.error}`);
                        continue;
                    }

                    console.log(`[Invidious API] ✅ Success with ${instance}`);
                    return data;
                } catch (jsonError) {
                    console.warn(`[Invidious API] JSON Parse error from ${instance}: ${jsonError.message}`);
                    continue;
                }
            } else {
                console.warn(`[Invidious API] HTTP ${response.status} from ${instance}`);
            }
        } catch (e) {
            console.warn(`[Invidious API] Error with ${instance}: ${e.message}`);
        }
    }
    throw new Error('All Invidious instances failed to return video info.');
}

/**
 * Get video information using yt-dlp (or Invidious API on Cloud)
 * Supports YouTube, Vimeo, Dailymotion, and many other platforms
 * @param {string} urlOrId - Video URL or YouTube video ID
 * @returns {Promise<Object>} Video information
 */
export async function getVideoInfo(urlOrId) {
    // Detect if we're running on cloud (Koyeb/Heroku/Railway/Render)
    const isCloudServer = process.env.KOYEB_APP_ID ||
        process.env.RAILWAY_ENVIRONMENT ||
        process.env.RENDER_EXTERNAL_URL ||
        process.env.HEROKU_APP_ID;

    // Check if it's strictly a YouTube video (URL or ID)
    let isYoutube = !urlOrId.includes('://') || urlOrId.includes('youtube.com') || urlOrId.includes('youtu.be');
    let videoId = extractVideoId(urlOrId) || (isYoutube && !urlOrId.includes('://') ? urlOrId : null);

    // PLAN C: If Cloud + YouTube -> Direct Invidious API call (Bypass yt-dlp)
    if (isCloudServer && isYoutube && videoId) {
        try {
            console.log(`[Plan C] ☁️ Cloud detected. Fetching info via Invidious API for ${videoId}...`);
            const data = await fetchInvidiousInfo(videoId);

            // Map Invidious JSON to our format
            return {
                videoId: data.videoId,
                title: data.title,
                author: data.author,
                channelUrl: data.authorUrl,
                duration: data.lengthSeconds,
                thumbnail: data.videoThumbnails?.[0]?.url || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
                isLive: data.liveNow,
                isPrivate: false,
                viewCount: data.viewCount,
                platform: 'youtube', // processed via invidious
                originalUrl: `https://www.youtube.com/watch?v=${videoId}`,
                availableQualities: (data.formatStreams || []).map(f => ({
                    quality: f.resolution || 'unknown',
                    itag: f.itag,
                    container: f.container,
                    fps: f.fps,
                    width: parseInt(f.size?.split('x')[0] || 0),
                    height: parseInt(f.size?.split('x')[1] || 0),
                    url: f.url // We have the direct URL here!
                }))
            };
        } catch (e) {
            console.error(`[Plan C] Failed: ${e.message}. Falling back to yt-dlp...`);
            // Fallback to normal flow if Invidious API fails entirely
        }
    }

    // Normal Flow (Local or Non-YouTube)
    const targetUrl = resolveTargetUrl(urlOrId);

    // Extract ID if not already present (reuse variable from above)
    if (!videoId) {
        if (urlOrId.includes('://')) {
            videoId = extractVideoId(urlOrId) || urlOrId;
        } else {
            videoId = extractVideoId(urlOrId);
        }
    }

    try {
        const commonArgs = getCommonArgs();
        const args = [
            '--dump-json',
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
            originalUrl: targetUrl,
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
    const targetUrl = resolveTargetUrl(videoIdOrUrl);

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
 * Create a video stream using yt-dlp stdout (or curl via Plan C)
 * Supports any URL that yt-dlp can handle
 * @param {string} videoIdOrUrl - YouTube video ID or full URL
 * @param {string} quality - Quality preset
 * @returns {Promise<Object>} Object with stream and format info
 */
export async function createVideoStream(videoIdOrUrl, quality = 'auto') {
    // Detect if we're running on cloud
    const isCloudServer = process.env.KOYEB_APP_ID ||
        process.env.RAILWAY_ENVIRONMENT ||
        process.env.RENDER_EXTERNAL_URL ||
        process.env.HEROKU_APP_ID;

    let videoId = extractVideoId(videoIdOrUrl);
    const isYoutube = !videoIdOrUrl.includes('://') || videoIdOrUrl.includes('youtube') || videoIdOrUrl.includes('youtu.be');

    // PLAN C: Cloud + YouTube -> Get URL via API and stream with curl
    if (isCloudServer && isYoutube && videoId) {
        try {
            console.log(`[Plan C] ☁️ Stream requested for ${videoId}. resolving direct URL via Invidious...`);
            const info = await fetchInvidiousInfo(videoId);

            // Find best format (mp4, 720p or 360p)
            // Filter formats that have a URL
            const formats = (info.formatStreams || []).filter(f => f.url);

            // Sort by resolution (naive) or use quality preference
            // quality: 'low' (360), 'medium' (480), 'high' (720), 'highest' (1080)
            let targetHeight = 360;
            if (quality === 'medium') targetHeight = 480;
            if (quality === 'high') targetHeight = 720;
            if (quality === 'highest') targetHeight = 1080;

            // Find closest match
            const bestFormat = formats.reduce((prev, curr) => {
                const prevH = parseInt(prev.size?.split('x')[1] || 0);
                const currH = parseInt(curr.size?.split('x')[1] || 0);
                return (Math.abs(currH - targetHeight) < Math.abs(prevH - targetHeight)) ? curr : prev;
            }, formats[0]);

            if (bestFormat && bestFormat.url) {
                console.log(`[Plan C] Streaming via curl from: ${bestFormat.url.substring(0, 50)}...`);

                const proc = spawn('curl', ['-L', bestFormat.url, '--no-buffer'], {
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                // Log curl errors for debugging
                proc.stderr.on('data', (chunk) => {
                    console.warn(`[Plan C curl stderr] ${chunk.toString().trim()}`);
                });

                return {
                    stream: proc.stdout,
                    process: proc
                };
            }
        } catch (e) {
            console.error(`[Plan C] Stream setup failed: ${e.message}. Fallback to yt-dlp.`);
        }
    }

    // Normal Flow (Fallback or Local)
    const targetUrl = resolveTargetUrl(videoIdOrUrl);
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
