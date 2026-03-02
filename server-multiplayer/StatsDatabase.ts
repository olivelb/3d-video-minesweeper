/**
 * StatsDatabase - SQLite persistence for multiplayer game statistics
 * 
 * Stores game history, player performances, and aggregate stats.
 * Designed to support 2+ players per game.
 */

import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlayerResult {
    name: string;
    number: number;
    score: number;
    eliminated: boolean;
    stats: {
        cellsRevealed: number;
        emptyCells: number;
        numberedCells: number;
        correctFlags: number;
        incorrectFlags: number;
    };
}

export interface GameRecord {
    width: number;
    height: number;
    bombCount: number;
    players: PlayerResult[];
    winner: { name: string; number?: number } | null;
    victory: boolean;
    startedAt: number;
    endedAt: number;
    duration: number;
}

interface LeaderboardEntry {
    name: string;
    gamesPlayed: number;
    wins: number;
    totalScore: number;
    bestScore: number;
    avgScore: number;
    winRate: number;
    cellsRevealed: number;
    correctFlags: number;
    timesEliminated: number;
    lastPlayedAt: number;
}

interface PlayerStats extends LeaderboardEntry {
    firstPlayedAt: number;
    recentGames?: GameSummary[];
}

interface GameSummary {
    id: number;
    width: number;
    height: number;
    bombCount: number;
    playerCount: number;
    duration: number;
    winner: string | null;
    victory: number;
    endedAt: number;
    players?: { name: string; number: number; score: number; rank: number; eliminated: number }[];
    score?: number;
    rank?: number;
    eliminated?: number;
}

interface GlobalStats {
    totalGames: number;
    gamesWithWinner: number;
    avgDuration: number;
    avgPlayers: number;
    uniquePlayers: number;
}

/**
 * Manages SQLite database for multiplayer statistics
 */
export class StatsDatabase {
    dbPath: string;
    db: BetterSqlite3.Database | null;

    constructor(dbPath: string | null = null) {
        this.dbPath = dbPath || path.join(__dirname, 'stats.db');
        this.db = null;
    }

    init(): void {
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');
        this._createTables();
        console.log(`[StatsDatabase] Initialized at ${this.dbPath}`);
    }

    _createTables(): void {
        this.db!.exec(`
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

        this.db!.exec(`
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

        this.db!.exec(`
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

        this.db!.exec(`
            CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
            CREATE INDEX IF NOT EXISTS idx_game_players_name ON game_players(player_name);
            CREATE INDEX IF NOT EXISTS idx_games_ended_at ON games(ended_at DESC);
            CREATE INDEX IF NOT EXISTS idx_player_stats_wins ON player_stats(games_won DESC);
            CREATE INDEX IF NOT EXISTS idx_player_stats_score ON player_stats(total_score DESC);
        `);
    }

    saveGame(gameRecord: GameRecord): number | bigint {
        const insertGame = this.db!.prepare(`
            INSERT INTO games (width, height, bomb_count, player_count, started_at, ended_at, duration_seconds, winner_name, victory)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertPlayer = this.db!.prepare(`
            INSERT INTO game_players (game_id, player_name, player_number, score, cells_revealed, empty_cells, numbered_cells, correct_flags, incorrect_flags, eliminated, rank)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const saveTransaction = this.db!.transaction((record: GameRecord) => {
            const nameCount: Record<string, number> = {};
            record.players.forEach(p => {
                nameCount[p.name] = (nameCount[p.name] || 0) + 1;
            });

            const getUniqueName = (player: { name: string; number?: number }): string => {
                if (nameCount[player.name] > 1) {
                    return `${player.name} (P${player.number})`;
                }
                return player.name;
            };

            const winnerUniqueName = record.winner ? getUniqueName(
                record.players.find(p => p.name === record.winner!.name &&
                    (!record.winner!.number || p.number === record.winner!.number)) || record.winner
            ) : null;

            const gameResult = insertGame.run(
                record.width,
                record.height,
                record.bombCount,
                record.players.length,
                Math.floor(record.startedAt / 1000),
                Math.floor(record.endedAt / 1000),
                record.duration,
                winnerUniqueName,
                record.victory ? 1 : 0
            );

            const gameId = gameResult.lastInsertRowid;

            const sortedPlayers = [...record.players].sort((a, b) => b.score - a.score);

            for (let i = 0; i < sortedPlayers.length; i++) {
                const p = sortedPlayers[i];
                const uniqueName = getUniqueName(p);

                insertPlayer.run(
                    gameId,
                    uniqueName,
                    p.number,
                    p.score,
                    p.stats.cellsRevealed,
                    p.stats.emptyCells,
                    p.stats.numberedCells,
                    p.stats.correctFlags,
                    p.stats.incorrectFlags,
                    p.eliminated ? 1 : 0,
                    i + 1
                );

                this._updatePlayerStats(uniqueName, p, winnerUniqueName === uniqueName);
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

    _updatePlayerStats(playerName: string, playerResult: PlayerResult, isWinner: boolean): void {
        const now = Math.floor(Date.now() / 1000);

        const existing = this.db!.prepare(`
            SELECT * FROM player_stats WHERE player_name = ?
        `).get(playerName) as Record<string, number> | undefined;

        if (existing) {
            const newGamesPlayed = existing.games_played + 1;
            const newGamesWon = existing.games_won + (isWinner ? 1 : 0);
            const newTotalScore = existing.total_score + playerResult.score;
            const newBestScore = Math.max(existing.best_score, playerResult.score);
            const newAvgScore = newTotalScore / newGamesPlayed;
            const newWinRate = (newGamesWon / newGamesPlayed) * 100;

            this.db!.prepare(`
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
            this.db!.prepare(`
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

    getLeaderboard(sortBy = 'wins', limit = 10): LeaderboardEntry[] {
        const orderMap: Record<string, string> = {
            wins: 'games_won DESC, win_rate DESC',
            score: 'total_score DESC',
            winRate: 'win_rate DESC, games_won DESC',
            avgScore: 'avg_score DESC, games_played DESC',
            bestScore: 'best_score DESC'
        };

        const order = orderMap[sortBy] || orderMap.wins;

        return this.db!.prepare(`
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
        `).all(limit) as LeaderboardEntry[];
    }

    getPlayerStats(playerName: string): PlayerStats | null {
        const stats = this.db!.prepare(`
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
        `).get(playerName) as PlayerStats | undefined;

        if (!stats) return null;

        stats.recentGames = this.db!.prepare(`
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
        `).all(playerName) as GameSummary[];

        return stats;
    }

    getRecentGames(limit = 20): GameSummary[] {
        const games = this.db!.prepare(`
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
        `).all(limit) as GameSummary[];

        const getPlayers = this.db!.prepare(`
            SELECT player_name as name, player_number as number, score, rank, eliminated
            FROM game_players
            WHERE game_id = ?
            ORDER BY rank ASC
        `);

        for (const game of games) {
            game.players = getPlayers.all(game.id) as GameSummary['players'];
        }

        return games;
    }

    getGlobalStats(): GlobalStats {
        const gameStats = this.db!.prepare(`
            SELECT 
                COUNT(*) as totalGames,
                SUM(CASE WHEN victory = 1 THEN 1 ELSE 0 END) as gamesWithWinner,
                AVG(duration_seconds) as avgDuration,
                AVG(player_count) as avgPlayers
            FROM games
        `).get() as Record<string, number>;

        const playerStats = this.db!.prepare(`
            SELECT COUNT(*) as uniquePlayers
            FROM player_stats
        `).get() as Record<string, number>;

        return {
            totalGames: gameStats.totalGames || 0,
            gamesWithWinner: gameStats.gamesWithWinner || 0,
            avgDuration: Math.round(gameStats.avgDuration || 0),
            avgPlayers: Math.round((gameStats.avgPlayers || 2) * 10) / 10,
            uniquePlayers: playerStats.uniquePlayers || 0
        };
    }

    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('[StatsDatabase] Closed');
        }
    }
}

export default StatsDatabase;
