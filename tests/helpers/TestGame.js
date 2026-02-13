/**
 * TestGame — Subclass of GameBase for deterministic testing.
 *
 * Bypasses the SolverBridge dependency by providing helpers to set up
 * boards with known mine positions, making tests fully reproducible.
 */

import { MinesweeperGameBase } from '../../shared/GameBase.js';

export class TestGame extends MinesweeperGameBase {
    /**
     * Create a test game with a deterministic board layout.
     *
     * @param {number} width
     * @param {number} height
     * @param {Array<{x: number, y: number}>} minePositions
     */
    constructor(width, height, minePositions = []) {
        super(width, height, minePositions.length);
        this.init();
        if (minePositions.length > 0) {
            this.setMinesFromPositions(minePositions);
        }
    }

    /**
     * Directly reveal a cell without going through `reveal()` async flow.
     * For setting up board states before testing other methods.
     * @param {number} x
     * @param {number} y
     */
    directReveal(x, y) {
        if (this.mines[x][y]) return;
        const changes = [];
        this.floodFill(x, y, changes);
        return changes;
    }

    /**
     * Reveal multiple cells at once.
     * @param {Array<[number, number]>} cells - Array of [x, y] pairs
     */
    revealCells(cells) {
        const allChanges = [];
        for (const [x, y] of cells) {
            const changes = this.directReveal(x, y);
            if (changes) allChanges.push(...changes);
        }
        return allChanges;
    }

    /**
     * Place a flag directly (bypassing gameOver/victory checks).
     * @param {number} x
     * @param {number} y
     */
    placeFlag(x, y) {
        if (!this.flags[x][y]) {
            this.flags[x][y] = true;
            this.flagCount++;
        }
    }

    /**
     * Print the board to stdout for debugging.
     */
    debugPrint() {
        console.log(`\n  Board ${this.width}×${this.height} (${this.bombCount} mines):`);
        for (let y = 0; y < this.height; y++) {
            let row = '  ';
            for (let x = 0; x < this.width; x++) {
                if (this.mines[x][y]) {
                    row += ' *';
                } else {
                    row += ` ${this.grid[x][y]}`;
                }
            }
            console.log(row);
        }
        console.log('  Visible:');
        for (let y = 0; y < this.height; y++) {
            let row = '  ';
            for (let x = 0; x < this.width; x++) {
                const v = this.visibleGrid[x][y];
                if (v === -1) row += ' .';
                else if (v === 9) row += ' X';
                else row += ` ${v}`;
            }
            console.log(row);
        }
    }
}

/**
 * Create common board layouts for testing.
 */
export const Boards = {
    /**
     * 5×5 board with 3 mines in known positions.
     *
     *   0 1 0 0 0
     *   1 2 1 1 0
     *   * 2 * 1 0
     *   1 2 1 1 0
     *   0 1 0 0 0
     *
     * Mines at (0,2) and (2,2).
     * Wait — let me recalculate. Mines at (0,2), (2,2):
     *
     * That's 2 mines. Let me define 3 mines for more interesting tests.
     * Mines at (0,2), (2,2), (4,0)
     */
    small_5x5() {
        return new TestGame(5, 5, [
            { x: 0, y: 2 },
            { x: 2, y: 2 },
            { x: 4, y: 0 },
        ]);
    },

    /**
     * 3×3 board with 1 mine in center.
     *
     *  1 1 1
     *  1 * 1
     *  1 1 1
     */
    tiny_center_mine() {
        return new TestGame(3, 3, [{ x: 1, y: 1 }]);
    },

    /**
     * 3×3 board with no mines.
     */
    empty_3x3() {
        return new TestGame(3, 3, []);
    },

    /**
     * 4×4 board with 2 mines in a corner.
     *
     * Mines at (0,0) and (1,0).
     */
    corner_mines() {
        return new TestGame(4, 4, [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
        ]);
    },

    /**
     * 8×8 board with 10 mines (standard beginner-like).
     * Known mine positions for reproducibility.
     */
    standard_8x8() {
        return new TestGame(8, 8, [
            { x: 0, y: 0 }, { x: 3, y: 1 }, { x: 7, y: 2 },
            { x: 1, y: 3 }, { x: 5, y: 3 }, { x: 2, y: 5 },
            { x: 6, y: 5 }, { x: 0, y: 7 }, { x: 4, y: 7 },
            { x: 7, y: 7 },
        ]);
    },

    /**
     * 5×5 board with only 1 mine at (0,0).
     * Almost all cells are safe — good for testing win conditions.
     */
    almost_won() {
        return new TestGame(5, 5, [{ x: 0, y: 0 }]);
    },
};
