/**
 * Server-side MinesweeperGame.
 *
 * Extends shared GameBase with multiplayer-specific methods:
 * - placeMinesWithSafeZone   (first-click safe placement)
 * - prePlaceMinesForMultiplayer  (pre-deal for shared boards)
 * - revealBombForElimination (show bomb without ending the game)
 */

import { MinesweeperGameBase } from '../shared/GameBase.js';
import type { Grid } from '../shared/types.js';

// ─── Server Game Class ──────────────────────────────────────────────────────

export class MinesweeperGame extends MinesweeperGameBase {

    /**
     * Simple console log when board generation is limited / cancelled.
     */
    override _onGenerationWarning(result: { cancelled?: boolean; warning?: boolean }): void {
        const reason = result.cancelled ? 'interrompue' : 'limitée à 10000 essais';
        console.log(`[GameServer] Board generation: ${reason}`);
    }

    // ── Multiplayer helpers ─────────────────────────────────────────────────

    /**
     * Reveal a bomb without ending the game (for multiplayer player elimination).
     * Marks the cell as value 10 (revealed bomb) instead of 9 (player explosion).
     */
    revealBombForElimination(x: number, y: number): boolean {
        if (!this.mines[x][y]) return false;
        this.visibleGrid[x][y] = 10;
        this.revealedBombs.push({ x, y });

        // Also set the flag so chord-clicking counts this revealed bomb
        if (!this.flags[x][y]) {
            this.flags[x][y] = true;
            this.flagCount++;
        }
        return true;
    }
}
