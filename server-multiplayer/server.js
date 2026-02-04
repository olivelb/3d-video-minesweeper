/**
 * Multiplayer Server Entry Point for Raspberry Pi
 * Run with: node server.js
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { createGameServer } from './GameServerNode.js';
import { StatsDatabase } from './StatsDatabase.js';

dotenv.config();

const app = express();

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

io.on('connection', (socket) => {
    console.log('[Socket.io] New connection attempt:', socket.id, 'from origin:', socket.handshake.headers.origin);
});

const PORT = process.env.PORT || 3001;

// Initialize stats database
const statsDb = new StatsDatabase();
statsDb.init();

// Health check
app.get('/health', (req, res) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'no-cache'
    });
    res.json({ status: 'ok', mode: 'multiplayer', uptime: process.uptime() });
});

// ============ Stats API Endpoints ============

/**
 * GET /api/leaderboard
 * Query params: sortBy (wins|score|winRate|avgScore|bestScore), limit (default 10)
 */
app.get('/api/leaderboard', (req, res) => {
    try {
        const sortBy = req.query.sortBy || 'wins';
        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = statsDb.getLeaderboard(sortBy, limit);
        res.json({ success: true, leaderboard });
    } catch (err) {
        console.error('[API] Leaderboard error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/stats/:playerName
 * Get detailed stats for a specific player
 */
app.get('/api/stats/:playerName', (req, res) => {
    try {
        const playerName = decodeURIComponent(req.params.playerName);
        const stats = statsDb.getPlayerStats(playerName);
        if (stats) {
            res.json({ success: true, stats });
        } else {
            res.status(404).json({ success: false, error: 'Player not found' });
        }
    } catch (err) {
        console.error('[API] Player stats error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/recent-games
 * Query params: limit (default 20)
 */
app.get('/api/recent-games', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const games = statsDb.getRecentGames(limit);
        res.json({ success: true, games });
    } catch (err) {
        console.error('[API] Recent games error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/global-stats
 * Get aggregate statistics
 */
app.get('/api/global-stats', (req, res) => {
    try {
        const stats = statsDb.getGlobalStats();
        res.json({ success: true, stats });
    } catch (err) {
        console.error('[API] Global stats error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Create game server with database reference
const gameConfig = {
    width: parseInt(process.env.GAME_WIDTH) || 30,
    height: parseInt(process.env.GAME_HEIGHT) || 16,
    bombCount: parseInt(process.env.GAME_BOMBS) || 99,
    maxPlayers: 2
};

createGameServer(io, gameConfig, statsDb);

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Multiplayer server running on port ${PORT}`);
    console.log(`   Board: ${gameConfig.width}x${gameConfig.height}, ${gameConfig.bombCount} bombs`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
    console.log(`   Stats API: http://localhost:${PORT}/api/leaderboard`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\\nShutting down...');
    statsDb.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\\nTerminating...');
    statsDb.close();
    process.exit(0);
});
