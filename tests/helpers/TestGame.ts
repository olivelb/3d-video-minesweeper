/**
 * TestGame — Subclass of GameBase for deterministic testing.
 *
 * Bypasses the SolverBridge dependency by providing helpers to set up
 * boards with known mine positions, making tests fully reproducible.
 */

import { MinesweeperGameBase } from '../../shared/GameBase.js';

interface CellChange {
    x: number;
    y: number;
    value: number;
}

interface MinePosition {
    x: number;
    y: number;
}

export class TestGame extends MinesweeperGameBase {
    constructor(width: number, height: number, minePositions: MinePosition[] = []) {
        super(width, height, minePositions.length);
        this.init();
        if (minePositions.length > 0) {
            this.setMinesFromPositions(minePositions);
        }
    }

    directReveal(x: number, y: number): CellChange[] | undefined {
        if (this.mines[x][y]) return;
        const changes: CellChange[] = [];
        this.floodFill(x, y, changes);
        return changes;
    }

    revealCells(cells: [number, number][]): CellChange[] {
        const allChanges: CellChange[] = [];
        for (const [x, y] of cells) {
            const changes = this.directReveal(x, y);
            if (changes) allChanges.push(...changes);
        }
        return allChanges;
    }

    placeFlag(x: number, y: number): void {
        if (!this.flags[x][y]) {
            this.flags[x][y] = true;
            this.flagCount++;
        }
    }

    debugPrint(): void {
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

export const Boards = {
    small_5x5(): TestGame {
        return new TestGame(5, 5, [
            { x: 0, y: 2 },
            { x: 2, y: 2 },
            { x: 4, y: 0 },
        ]);
    },

    tiny_center_mine(): TestGame {
        return new TestGame(3, 3, [{ x: 1, y: 1 }]);
    },

    empty_3x3(): TestGame {
        return new TestGame(3, 3, []);
    },

    corner_mines(): TestGame {
        return new TestGame(4, 4, [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
        ]);
    },

    standard_8x8(): TestGame {
        return new TestGame(8, 8, [
            { x: 0, y: 0 }, { x: 3, y: 1 }, { x: 7, y: 2 },
            { x: 1, y: 3 }, { x: 5, y: 3 }, { x: 2, y: 5 },
            { x: 6, y: 5 }, { x: 0, y: 7 }, { x: 4, y: 7 },
            { x: 7, y: 7 },
        ]);
    },

    almost_won(): TestGame {
        return new TestGame(5, 5, [{ x: 0, y: 0 }]);
    },
};
