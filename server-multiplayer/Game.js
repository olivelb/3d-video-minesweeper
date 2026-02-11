/**
 * Server-side MinesweeperGame.
 *
 * Extends shared GameBase with multiplayer-specific methods:
 * - placeMinesWithSafeZone   (first-click safe placement)
 * - prePlaceMinesForMultiplayer  (pre-deal for shared boards)
 * - revealBombForElimination (show bomb without ending the game)
 */

import { MinesweeperGameBase } from '../shared/GameBase.js';

// ─── Server Game Class ──────────────────────────────────────────────────────

export class MinesweeperGame extends MinesweeperGameBase {

    /**
     * Simple console log when board generation is limited / cancelled.
     *
     * @override
     * @param {{cancelled?: boolean, warning?: boolean}} result
     */
    _onGenerationWarning(result) {
        const reason = result.cancelled ? 'interrompue' : 'limitée à 10000 essais';
        console.log(`[GameServer] Board generation: ${reason}`);
    }

    // ── Multiplayer helpers ─────────────────────────────────────────────────

    /**
     * Place mines with a 3×3 safe zone around the first click position.
     * @param {number} safeX
     * @param {number} safeY
     */
    placeMinesWithSafeZone(safeX, safeY) {
        this.mines = Array(this.width).fill().map(() => Array(this.height).fill(false));
        this.grid  = Array(this.width).fill().map(() => Array(this.height).fill(0));

        let minesPlaced = 0;
        let placementAttempts = 0;
        const safeRadius = 1;

        while (minesPlaced < this.bombCount && placementAttempts < 100000) {
            placementAttempts++;
            const x = Math.floor(Math.random() * this.width);
            const y = Math.floor(Math.random() * this.height);

            if (Math.abs(x - safeX) <= safeRadius && Math.abs(y - safeY) <= safeRadius) continue;

            if (!this.mines[x][y]) {
                this.mines[x][y] = true;
                this.grid[x][y] = 1;
                minesPlaced++;
            }
        }

        this.calculateNumbers();
        console.log(`[Game] Placed ${minesPlaced} mines with safe zone around (${safeX}, ${safeY})`);
    }

    /**
     * Pre-place mines for multiplayer (no safe zone).
     * Called by server before game starts so all players share the same board.
     */
    prePlaceMinesForMultiplayer() {
        this.mines = Array(this.width).fill().map(() => Array(this.height).fill(false));
        this.grid  = Array(this.width).fill().map(() => Array(this.height).fill(0));

        let minesPlaced = 0;
        let placementAttempts = 0;

        while (minesPlaced < this.bombCount && placementAttempts < 100000) {
            placementAttempts++;
            const x = Math.floor(Math.random() * this.width);
            const y = Math.floor(Math.random() * this.height);

            if (!this.mines[x][y]) {
                this.mines[x][y] = true;
                this.grid[x][y] = 1;
                minesPlaced++;
            }
        }

        this.calculateNumbers();
        this.firstClick = false;
        console.log(`[Game] Pre-placed ${minesPlaced} mines for multiplayer`);
    }

    /**
     * Reveal a bomb without ending the game (for multiplayer player elimination).
     * Marks the cell as value 10 (revealed bomb) instead of 9 (player explosion).
     * @param {number} x
     * @param {number} y
     * @returns {boolean} true if a bomb was actually revealed
     */
    revealBombForElimination(x, y) {
        if (!this.mines[x][y]) return false;
        this.visibleGrid[x][y] = 10;
        this.revealedBombs.push({ x, y });
        return true;
    }
}
