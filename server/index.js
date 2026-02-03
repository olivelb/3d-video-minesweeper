import express from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import youtubeRoutes from './routes/youtube.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Trust proxy - required for Koyeb/cloud platforms that use reverse proxies
// This allows express-rate-limit to correctly identify users via X-Forwarded-For
app.set('trust proxy', 1);

// Handle uncaught exceptions - don't crash
process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT EXCEPTION]', error.message);
    console.error(error.stack);
    // Don't exit, try to keep running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
    // Don't exit, try to keep running
});

// Prevent process from exiting unexpectedly
process.on('exit', (code) => {
    console.error(`[EXIT] Process exiting with code: ${code}`);
});

process.on('SIGINT', () => {
    console.log('[SIGINT] Received SIGINT - ignoring');
    // Don't exit - this is often sent incorrectly
});

process.on('SIGTERM', () => {
    console.log('[SIGTERM] Received SIGTERM');
    process.exit(0);
});

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Server type is local (Raspberry Pi/Home Server)
// This enables YouTube/Dailymotion support which is often blocked on datacenter IPs
const serverType = process.env.SERVER_TYPE || 'local';

// Health check - before CORS to allow all origins
// Also returns server capabilities so client knows what's supported
app.get('/health', (req, res) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'no-cache'
    });
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        serverType: serverType,
        capabilities: {
            // YouTube/Dailymotion/Vimeo require local server (cloud IPs are blocked)
            // Plan C (Invidious) is too unstable for production use
            youtube: serverType === 'local',
            dailymotion: serverType === 'local',
            vimeo: serverType === 'local',
            archive: true,  // Internet Archive works everywhere
            peertube: true, // Open platforms work
            direct: true    // Direct URLs always work
        }
    });
});

app.use(corsMiddleware);
app.use(rateLimiter);

// Parse JSON bodies with size limit to prevent DoS
app.use(express.json({ limit: '10kb' }));

// Parse URL-encoded bodies with size limit
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// YouTube routes
app.use('/api/youtube', youtubeRoutes);

// Error handling
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Server running on port ${PORT} (0.0.0.0)`);
});
