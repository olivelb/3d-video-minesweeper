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
app.use(corsMiddleware);
app.use(rateLimiter);

// Parse JSON bodies
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    console.log('[HEALTH] Health check requested');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// YouTube routes
app.use('/api/youtube', youtubeRoutes);

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`🎮 YouTube Proxy Server running on http://localhost:${PORT}`);
    console.log(`📺 Stream endpoint: http://localhost:${PORT}/api/youtube/stream?v=VIDEO_ID`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});
