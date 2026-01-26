import express from 'express';
// Use yt-dlp service which is more reliable than ytdl-core
import { getVideoInfo, createVideoStream, validateVideo, getStreamFormat, getDirectUrl } from '../services/ytdlpService.js';
import { extractVideoId } from '../utils/urlParser.js';
import { streamLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

/**
 * GET /api/youtube/validate?url=...
 * Validate a YouTube URL and check if it can be streamed
 */
router.get('/validate', async (req, res, next) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ 
                valid: false, 
                error: 'URL parameter required',
                code: 'MISSING_URL'
            });
        }
        
        const result = await validateVideo(url);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/youtube/info?url=...
 * Get detailed video metadata
 */
router.get('/info', async (req, res, next) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL parameter required' });
        }
        
        const info = await getVideoInfo(url);
        res.json(info);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/youtube/stream?v=VIDEO_ID&q=quality
 * Stream video content - main endpoint for video texture
 */
router.get('/stream', streamLimiter, async (req, res, next) => {
    try {
        const videoId = req.query.v || extractVideoId(req.query.url);
        const quality = req.query.q || 'auto';
        
        if (!videoId) {
            return res.status(400).json({ 
                error: 'Video ID required. Use ?v=VIDEO_ID or ?url=YOUTUBE_URL',
                code: 'MISSING_VIDEO_ID'
            });
        }
        
        console.log(`[STREAM] Starting stream for video: ${videoId}, quality: ${quality}`);
        
        // Get format info for headers
        let formatInfo;
        try {
            formatInfo = await getStreamFormat(videoId, quality);
            console.log(`[STREAM] Format info:`, formatInfo);
        } catch (e) {
            console.warn('[STREAM] Could not get format info:', e.message);
        }
        
        // Determine content type - prefer mp4
        const contentType = formatInfo?.container === 'webm' ? 'video/webm' : 'video/mp4';
        
        // Set response headers for video streaming
        // DON'T set Content-Length - we're streaming and size may vary
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Transfer-Encoding', 'chunked');
        
        // Create the stream using yt-dlp
        const { stream, process: ytdlpProc } = createVideoStream(videoId, quality);
        
        let bytesSent = 0;
        let hasStarted = false;
        
        stream.on('data', (chunk) => {
            if (!hasStarted) {
                hasStarted = true;
                console.log(`[STREAM] First chunk received for ${videoId}`);
            }
            bytesSent += chunk.length;
        });
        
        stream.on('error', (error) => {
            console.error(`[STREAM ERROR] ${videoId}:`, error.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream failed', message: error.message });
            } else {
                res.end();
            }
        });
        
        stream.on('end', () => {
            console.log(`[STREAM] Completed ${videoId}: ${(bytesSent / 1024 / 1024).toFixed(2)} MB sent`);
        });
        
        // Pipe to response
        stream.pipe(res);
        
        // Clean up on client disconnect
        req.on('close', () => {
            console.log(`[STREAM] Client disconnected for ${videoId}`);
            if (ytdlpProc && !ytdlpProc.killed) {
                ytdlpProc.kill();
            }
        });
        
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/youtube/direct?v=VIDEO_ID&q=quality
 * Get direct video URL that the browser can load directly
 * This avoids proxy overhead but URLs expire after some time
 */
router.get('/direct', async (req, res, next) => {
    try {
        const videoId = req.query.v || extractVideoId(req.query.url);
        const quality = req.query.q || 'auto';
        
        if (!videoId) {
            return res.status(400).json({ 
                error: 'Video ID required',
                code: 'MISSING_VIDEO_ID'
            });
        }
        
        console.log(`[DIRECT] Getting direct URL for video: ${videoId}, quality: ${quality}`);
        
        const result = await getDirectUrl(videoId, quality);
        console.log(`[DIRECT] Got result, sending response...`);
        
        const response = {
            videoId,
            url: result.url,
            format: result.format,
            // URLs typically expire in ~6 hours
            expiresIn: '~6 hours'
        };
        
        console.log(`[DIRECT] Response object created, url length: ${result.url?.length}`);
        res.json(response);
        console.log(`[DIRECT] Response sent successfully`);
        
    } catch (error) {
        console.error(`[DIRECT] Error:`, error);
        next(error);
    }
});

/**
 * GET /api/youtube/thumbnail?v=VIDEO_ID
 * Get video thumbnail (redirects to YouTube CDN)
 */
router.get('/thumbnail', (req, res) => {
    const videoId = req.query.v || extractVideoId(req.query.url);
    if (!videoId) {
        return res.status(400).json({ error: 'Video ID required' });
    }
    
    // Use high quality thumbnail
    const quality = req.query.q || 'mq'; // mq, hq, sd, maxres
    const qualityMap = {
        'mq': 'mqdefault',
        'hq': 'hqdefault', 
        'sd': 'sddefault',
        'maxres': 'maxresdefault'
    };
    
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/${qualityMap[quality] || 'mqdefault'}.jpg`;
    res.redirect(thumbnailUrl);
});

/**
 * GET /api/youtube/formats?v=VIDEO_ID
 * Get available formats for a video (for debugging/advanced use)
 */
router.get('/formats', async (req, res, next) => {
    try {
        const videoId = req.query.v || extractVideoId(req.query.url);
        if (!videoId) {
            return res.status(400).json({ error: 'Video ID required' });
        }
        
        const info = await getVideoInfo(videoId);
        res.json({
            videoId: info.videoId,
            title: info.title,
            availableQualities: info.availableQualities
        });
    } catch (error) {
        next(error);
    }
});

export default router;
