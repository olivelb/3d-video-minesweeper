import express from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import youtubeRoutes from './routes/youtube.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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

// Detect if we're running on a cloud platform (Koyeb, etc.) or locally
const isCloudServer = process.env.PORT || process.env.KOYEB_APP_ID || 
                      process.env.RAILWAY_ENVIRONMENT || process.env.RENDER_EXTERNAL_URL ||
                      process.env.FLY_APP_NAME;
const serverType = isCloudServer ? 'cloud' : 'local';

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
            // Cloud servers have yt-dlp but YouTube/Dailymotion block cloud IPs
            // Only local servers can reliably access these platforms
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

// Parse JSON bodies
app.use(express.json());

// YouTube routes
app.use('/api/youtube', youtubeRoutes);

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`🎮 Server running on port ${PORT}`);
});
