/**
 * StatsDatabase - SQLite persistence for multiplayer game statistics
 * 
 * Stores game history, player performances, and aggregate stats.
 * Designed to support 2+ players per game.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Manages SQLite database for multiplayer statistics
 */
export class StatsDatabase {
    /**
     * @param {string} dbPath - Path to SQLite database file
     */
    constructor(dbPath = null) {
        // Default to stats.db in the same directory
        this.dbPath = dbPath || path.join(__dirname, 'stats.db');
        this.db = null;
    }

    /**
     * Initialize database connection and create tables if needed
     */
    init() {
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL'); // Better concurrent access
        this._createTables();
        console.log(`[StatsDatabase] Initialized at ${this.dbPath}`);
    }

    /**
     * Create database schema
     * @private
     */
    _createTables() {
        // Games table - one row per completed game
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                bomb_count INTEGER NOT NULL,
                player_count INTEGER NOT NULL,
                started_at INTEGER NOT NULL,
                ended_at INTEGER NOT NULL,
                duration_seconds INTEGER NOT NULL,
                winner_name TEXT,
                victory INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

        // Game participants - one row per player per game
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS game_players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                player_name TEXT NOT NULL,
                player_number INTEGER NOT NULL,
                score INTEGER NOT NULL DEFAULT 0,
                cells_revealed INTEGER NOT NULL DEFAULT 0,
                empty_cells INTEGER NOT NULL DEFAULT 0,
                numbered_cells INTEGER NOT NULL DEFAULT 0,
                correct_flags INTEGER NOT NULL DEFAULT 0,
                incorrect_flags INTEGER NOT NULL DEFAULT 0,
                eliminated INTEGER NOT NULL DEFAULT 0,
                rank INTEGER NOT NULL,
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
            )
        `);

        // Aggregated player stats - one row per unique player name
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS player_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name TEXT UNIQUE NOT NULL,
                games_played INTEGER NOT NULL DEFAULT 0,
                games_won INTEGER NOT NULL DEFAULT 0,
                total_score INTEGER NOT NULL DEFAULT 0,
                best_score INTEGER NOT NULL DEFAULT 0,
                avg_score REAL NOT NULL DEFAULT 0,
                total_cells_revealed INTEGER NOT NULL DEFAULT 0,
                total_correct_flags INTEGER NOT NULL DEFAULT 0,
                times_eliminated INTEGER NOT NULL DEFAULT 0,
                win_rate REAL NOT NULL DEFAULT 0,
                last_played_at INTEGER,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

        // Create indexes for common queries
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
            CREATE INDEX IF NOT EXISTS idx_game_players_name ON game_players(player_name);
            CREATE INDEX IF NOT EXISTS idx_games_ended_at ON games(ended_at DESC);
            CREATE INDEX IF NOT EXISTS idx_player_stats_wins ON player_stats(games_won DESC);
            CREATE INDEX IF NOT EXISTS idx_player_stats_score ON player_stats(total_score DESC);
        `);
    }

    /**
     * Save a completed game and all player results
     * @param {object} gameRecord - From GameServer.getGameRecord()
     * @returns {number} Game ID
     */
    saveGame(gameRecord) {
        const insertGame = this.db.prepare(`
            INSERT INTO games (width, height, bomb_count, player_count, started_at, ended_at, duration_seconds, winner_name, victory)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertPlayer = this.db.prepare(`
            INSERT INTO game_players (game_id, player_name, player_number, score, cells_revealed, empty_cells, numbered_cells, correct_flags, incorrect_flags, eliminated, rank)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Use a transaction for atomicity
        const saveTransaction = this.db.transaction((record) => {
            // Insert game
            const gameResult = insertGame.run(
                record.width,
                record.height,
                record.bombCount,
                record.players.length,
                Math.floor(record.startedAt / 1000),
                Math.floor(record.endedAt / 1000),
                record.duration,
                record.winner?.name || null,
                record.victory ? 1 : 0
            );

            const gameId = gameResult.lastInsertRowid;

            // Insert each player's results
            // Sort by score to determine rank
            const sortedPlayers = [...record.players].sort((a, b) => b.score - a.score);
            
            for (let i = 0; i < sortedPlayers.length; i++) {
                const p = sortedPlayers[i];
                insertPlayer.run(
                    gameId,
                    p.name,
                    p.number,
                    p.score,
                    p.stats.cellsRevealed,
                    p.stats.emptyCells,
                    p.stats.numberedCells,
                    p.stats.correctFlags,
                    p.stats.incorrectFlags,
                    p.eliminated ? 1 : 0,
                    i + 1 // Rank (1-based)
                );

                // Update aggregate stats for this player
                this._updatePlayerStats(p.name, p, record.winner?.name === p.name);
            }

            return gameId;
        });

        try {
            const gameId = saveTransaction(gameRecord);
            console.log(`[StatsDatabase] Saved game #${gameId} with ${gameRecord.players.length} players`);
            return gameId;
        } catch (err) {
            console.error('[StatsDatabase] Error saving game:', err);
            throw err;
        }
    }

    /**
     * Update aggregate stats for a player
     * @private
     */
    _updatePlayerStats(playerName, playerResult, isWinner) {
        const now = Math.floor(Date.now() / 1000);

        // Try to get existing stats
        const existing = this.db.prepare(`
            SELECT * FROM player_stats WHERE player_name = ?
        `).get(playerName);

        if (existing) {
            // Update existing
            const newGamesPlayed = existing.games_played + 1;
            const newGamesWon = existing.games_won + (isWinner ? 1 : 0);
            const newTotalScore = existing.total_score + playerResult.score;
            const newBestScore = Math.max(existing.best_score, playerResult.score);
            const newAvgScore = newTotalScore / newGamesPlayed;
            const newWinRate = (newGamesWon / newGamesPlayed) * 100;

            this.db.prepare(`
                UPDATE player_stats SET
                    games_played = ?,
                    games_won = ?,
                    total_score = ?,
                    best_score = ?,
                    avg_score = ?,
                    total_cells_revealed = total_cells_revealed + ?,
                    total_correct_flags = total_correct_flags + ?,
                    times_eliminated = times_eliminated + ?,
                    win_rate = ?,
                    last_played_at = ?
                WHERE player_name = ?
            `).run(
                newGamesPlayed,
                newGamesWon,
                newTotalScore,
                newBestScore,
                newAvgScore,
                playerResult.stats.cellsRevealed,
                playerResult.stats.correctFlags,
                playerResult.eliminated ? 1 : 0,
                newWinRate,
                now,
                playerName
            );
        } else {
            // Insert new
            this.db.prepare(`
                INSERT INTO player_stats (player_name, games_played, games_won, total_score, best_score, avg_score, total_cells_revealed, total_correct_flags, times_eliminated, win_rate, last_played_at)
                VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                playerName,
                isWinner ? 1 : 0,
                playerResult.score,
                playerResult.score,
                playerResult.score,
                playerResult.stats.cellsRevealed,
                playerResult.stats.correctFlags,
                playerResult.eliminated ? 1 : 0,
                isWinner ? 100 : 0,
                now
            );
        }
    }

    /**
     * Get leaderboard (top players by wins or score)
     * @param {string} sortBy - 'wins', 'score', 'winRate', 'avgScore'
     * @param {number} limit - Max results
     * @returns {Array} Leaderboard entries
     */
    getLeaderboard(sortBy = 'wins', limit = 10) {
        const orderMap = {
            wins: 'games_won DESC, win_rate DESC',
            score: 'total_score DESC',
            winRate: 'win_rate DESC, games_won DESC',
            avgScore: 'avg_score DESC, games_played DESC',
            bestScore: 'best_score DESC'
        };

        const order = orderMap[sortBy] || orderMap.wins;

        return this.db.prepare(`
            SELECT 
                player_name as name,
                games_played as gamesPlayed,
                games_won as wins,
                total_score as totalScore,
                best_score as bestScore,
                ROUND(avg_score, 1) as avgScore,
                ROUND(win_rate, 1) as winRate,
                total_cells_revealed as cellsRevealed,
                total_correct_flags as correctFlags,
                times_eliminated as timesEliminated,
                last_played_at as lastPlayedAt
            FROM player_stats
            WHERE games_played > 0
            ORDER BY ${order}
            LIMIT ?
        `).all(limit);
    }

    /**
     * Get detailed stats for a specific player
     * @param {string} playerName 
     * @returns {object|null} Player stats or null if not found
     */
    getPlayerStats(playerName) {
        const stats = this.db.prepare(`
            SELECT 
                player_name as name,
                games_played as gamesPlayed,
                games_won as wins,
                total_score as totalScore,
                best_score as bestScore,
                ROUND(avg_score, 1) as avgScore,
                ROUND(win_rate, 1) as winRate,
                total_cells_revealed as cellsRevealed,
                total_correct_flags as correctFlags,
                times_eliminated as timesEliminated,
                last_played_at as lastPlayedAt,
                created_at as firstPlayedAt
            FROM player_stats
            WHERE player_name = ?
        `).get(playerName);

        if (!stats) return null;

        // Also get recent games for this player
        stats.recentGames = this.db.prepare(`
            SELECT 
                g.id,
                g.width,
                g.height,
                g.bomb_count as bombCount,
                g.player_count as playerCount,
                g.duration_seconds as duration,
                g.winner_name as winner,
                g.victory,
                g.ended_at as endedAt,
                gp.score,
                gp.rank,
                gp.eliminated
            FROM game_players gp
            JOIN games g ON g.id = gp.game_id
            WHERE gp.player_name = ?
            ORDER BY g.ended_at DESC
            LIMIT 10
        `).all(playerName);

        return stats;
    }

    /**
     * Get recent games
     * @param {number} limit - Max results
     * @returns {Array} Recent games with player info
     */
    getRecentGames(limit = 20) {
        const games = this.db.prepare(`
            SELECT 
                id,
                width,
                height,
                bomb_count as bombCount,
                player_count as playerCount,
                duration_seconds as duration,
                winner_name as winner,
                victory,
                ended_at as endedAt
            FROM games
            ORDER BY ended_at DESC
            LIMIT ?
        `).all(limit);

        // Get players for each game
        const getPlayers = this.db.prepare(`
            SELECT player_name as name, player_number as number, score, rank, eliminated
            FROM game_players
            WHERE game_id = ?
            ORDER BY rank ASC
        `);

        for (const game of games) {
            game.players = getPlayers.all(game.id);
        }

        return games;
    }

    /**
     * Get global statistics
     * @returns {object} Aggregate stats
     */
    getGlobalStats() {
        const gameStats = this.db.prepare(`
            SELECT 
                COUNT(*) as totalGames,
                SUM(CASE WHEN victory = 1 THEN 1 ELSE 0 END) as gamesWithWinner,
                AVG(duration_seconds) as avgDuration,
                AVG(player_count) as avgPlayers
            FROM games
        `).get();

        const playerStats = this.db.prepare(`
            SELECT COUNT(*) as uniquePlayers
            FROM player_stats
        `).get();

        return {
            totalGames: gameStats.totalGames || 0,
            gamesWithWinner: gameStats.gamesWithWinner || 0,
            avgDuration: Math.round(gameStats.avgDuration || 0),
            avgPlayers: Math.round((gameStats.avgPlayers || 2) * 10) / 10,
            uniquePlayers: playerStats.uniquePlayers || 0
        };
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('[StatsDatabase] Closed');
        }
    }
}

export default StatsDatabase;
