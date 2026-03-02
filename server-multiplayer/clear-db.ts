/**
 * clear-db.ts
 * Script to clear all stats from the SQLite database
 * 
 * Usage: npx tsx clear-db.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'stats.db');

try {
    console.log(`[ClearDB] Connecting to database at ${dbPath}...`);
    const db = new Database(dbPath);

    console.log('[ClearDB] Clearing tables...');

    const clearTransaction = db.transaction(() => {
        const res1 = db.prepare('DELETE FROM game_players').run();
        console.log(`  - Deleted ${res1.changes} rows from game_players`);

        const res2 = db.prepare('DELETE FROM games').run();
        console.log(`  - Deleted ${res2.changes} rows from games`);

        const res3 = db.prepare('DELETE FROM player_stats').run();
        console.log(`  - Deleted ${res3.changes} rows from player_stats`);

        db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('games', 'game_players', 'player_stats')").run();
    });

    clearTransaction();

    console.log('[ClearDB] 🧹 Database cleared successfully!');

    console.log('[ClearDB] Vacuuming database...');
    db.exec('VACUUM');

    db.close();
    console.log('[ClearDB] Done.');

} catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ClearDB] Error:', msg);
    process.exit(1);
}
