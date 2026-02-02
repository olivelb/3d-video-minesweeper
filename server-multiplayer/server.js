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

dotenv.config();

const app = express();

// Enable CORS for all routes
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3002;

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', mode: 'multiplayer', uptime: process.uptime() });
});

// Create game server
const gameConfig = {
    width: parseInt(process.env.GAME_WIDTH) || 30,
    height: parseInt(process.env.GAME_HEIGHT) || 16,
    bombCount: parseInt(process.env.GAME_BOMBS) || 99,
    maxPlayers: 2
};

createGameServer(io, gameConfig);

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Multiplayer server running on port ${PORT}`);
    console.log(`   Board: ${gameConfig.width}x${gameConfig.height}, ${gameConfig.bombCount} bombs`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
});
