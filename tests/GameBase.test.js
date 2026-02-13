/**
 * GameBase.test.js — Comprehensive tests for MinesweeperGameBase.
 *
 * Covers: init, calculateNumbers, floodFill, reveal, toggleFlag,
 *         chord, checkWin, retryLastMove, serialization, edge cases.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npm test  or  npm run test:gamebase
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TestGame, Boards } from './helpers/TestGame.js';

// ═════════════════════════════════════════════════════════════════════════════
// 1. INITIALIZATION
// ═════════════════════════════════════════════════════════════════════════════

describe('Initialization', () => {
    it('should create grids with correct dimensions', () => {
        const game = new TestGame(10, 8, []);
        assert.equal(game.width, 10);
        assert.equal(game.height, 8);
        assert.equal(game.grid.length, 10);
        assert.equal(game.grid[0].length, 8);
        assert.equal(game.visibleGrid.length, 10);
        assert.equal(game.mines.length, 10);
        assert.equal(game.flags.length, 10);
    });

    it('should initialize all cells as hidden (-1)', () => {
        const game = new TestGame(5, 5, []);
        for (let x = 0; x < 5; x++) {
            for (let y = 0; y < 5; y++) {
                assert.equal(game.visibleGrid[x][y], -1, `Cell (${x},${y}) should be hidden`);
            }
        }
    });

    it('should initialize with no flags', () => {
        const game = new TestGame(5, 5, [{ x: 0, y: 0 }]);
        assert.equal(game.flagCount, 0);
        for (let x = 0; x < 5; x++) {
            for (let y = 0; y < 5; y++) {
                assert.equal(game.flags[x][y], false);
            }
        }
    });

    it('should start in a clean state', () => {
        const game = new TestGame(5, 5, []);
        assert.equal(game.gameOver, false);
        assert.equal(game.victory, false);
        assert.equal(game.hintCount, 0);
        assert.equal(game.retryCount, 0);
        assert.equal(game.lastMove, null);
    });

    it('should set firstClick to false after setMinesFromPositions', () => {
        const game = new TestGame(3, 3, [{ x: 1, y: 1 }]);
        assert.equal(game.firstClick, false);
    });

    it('should handle init() reset correctly', () => {
        const game = Boards.tiny_center_mine();
        game.directReveal(0, 0);
        game.gameOver = true;
        game.victory = true;
        game.hintCount = 5;

        game.init();
        assert.equal(game.gameOver, false);
        assert.equal(game.victory, false);
        assert.equal(game.hintCount, 0);
        assert.equal(game.firstClick, true);
        assert.equal(game.visibleGrid[0][0], -1, 'After reset, all cells hidden');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. CALCULATE NUMBERS
// ═════════════════════════════════════════════════════════════════════════════

describe('calculateNumbers', () => {
    it('should compute 0 for cells far from mines', () => {
        const game = Boards.small_5x5();
        // (4,4) is far from mines at (0,2),(2,2),(4,0)
        assert.equal(game.grid[4][4], 0);
        assert.equal(game.grid[3][4], 0);
    });

    it('should compute correct counts for center mine (3×3)', () => {
        const game = Boards.tiny_center_mine();
        // All 8 neighbors of center mine should be 1
        const expected = [
            [1, 1, 1],
            [1, 0, 1],  // center is mine, grid value is overridden by mines check
            [1, 1, 1],
        ];
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                if (game.mines[x][y]) continue;
                assert.equal(game.grid[x][y], expected[x][y],
                    `Cell (${x},${y}) should be ${expected[x][y]}`);
            }
        }
    });

    it('should compute 0 for board with no mines', () => {
        const game = Boards.empty_3x3();
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                assert.equal(game.grid[x][y], 0);
            }
        }
    });

    it('should compute correct counts for adjacent mines', () => {
        const game = Boards.corner_mines();
        // Mines at (0,0) and (1,0)
        // (0,1) borders both mines → count 2
        assert.equal(game.grid[0][1], 2, 'Cell (0,1) borders 2 mines');
        // (1,1) borders both mines → count 2
        assert.equal(game.grid[1][1], 2, 'Cell (1,1) borders 2 mines');
        // (2,0) borders only (1,0) → count 1
        assert.equal(game.grid[2][0], 1, 'Cell (2,0) borders 1 mine');
        // (2,1) borders only (1,0) → count 1
        assert.equal(game.grid[2][1], 1, 'Cell (2,1) borders 1 mine');
        // (3,0) borders nothing → count 0
        assert.equal(game.grid[3][0], 0, 'Cell (3,0) borders 0 mines');
    });

    it('should not modify mine cells in grid', () => {
        // After calculateNumbers, mine cells keep whatever value they had;
        // the method skips them with `continue`.
        const game = new TestGame(3, 3, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
        // Mine cells are skipped in calculateNumbers, so their grid value
        // comes from setMinesFromPositions which sets grid[x][y] = 1 for mines
        // then calculateNumbers skips them. The value stays 1 (from placement).
        assert.equal(game.mines[0][0], true);
        assert.equal(game.mines[1][0], true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. FLOOD FILL
// ═════════════════════════════════════════════════════════════════════════════

describe('floodFill', () => {
    it('should reveal a single numbered cell and stop', () => {
        const game = Boards.tiny_center_mine();
        const changes = [];
        game.floodFill(0, 0, changes);

        assert.equal(changes.length, 1, 'Only one cell revealed');
        assert.deepEqual(changes[0], { x: 0, y: 0, value: 1 });
        assert.equal(game.visibleGrid[0][0], 1);
    });

    it('should cascade through all zero-cells', () => {
        const game = Boards.empty_3x3();
        const changes = [];
        game.floodFill(1, 1, changes);

        // All 9 cells should be revealed (all zeros)
        assert.equal(changes.length, 9, 'All 9 cells revealed on empty board');
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                assert.equal(game.visibleGrid[x][y], 0,
                    `Cell (${x},${y}) should be revealed as 0`);
            }
        }
    });

    it('should not reveal flagged cells', () => {
        const game = Boards.empty_3x3();
        game.placeFlag(2, 2);

        const changes = [];
        game.floodFill(0, 0, changes);

        assert.equal(changes.length, 8, 'Flagged cell skipped');
        assert.equal(game.visibleGrid[2][2], -1, 'Flagged cell remains hidden');
    });

    it('should not reveal already-revealed cells', () => {
        const game = Boards.empty_3x3();
        const changes1 = [];
        game.floodFill(0, 0, changes1);

        const changes2 = [];
        game.floodFill(0, 0, changes2);
        assert.equal(changes2.length, 0, 'No new cells revealed on second call');
    });

    it('should cascade through zeros and stop at numbers', () => {
        const game = Boards.small_5x5();
        // Mines at (0,2), (2,2), (4,0)
        // Bottom-right area (3,3)-(4,4) should be safe zeros
        const changes = [];
        game.floodFill(4, 4, changes);

        // Should cascade from (4,4) through the zero region
        assert.ok(changes.length > 1, 'Should cascade through multiple cells');

        // All revealed cells should have correct values
        for (const change of changes) {
            assert.equal(game.visibleGrid[change.x][change.y], change.value);
            assert.equal(game.mines[change.x][change.y], false, 'No mine cells revealed');
        }
    });

    it('should handle out-of-bounds start gracefully', () => {
        const game = Boards.empty_3x3();
        const changes = [];
        // The stack starts with the OOB coord but the bounds check skips it
        game.floodFill(-1, -1, changes);
        assert.equal(changes.length, 0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. REVEAL (async, bypasses first-click logic)
// ═════════════════════════════════════════════════════════════════════════════

describe('reveal (non-first-click)', () => {
    it('should reveal a safe cell', async () => {
        const game = Boards.tiny_center_mine();
        const result = await game.reveal(0, 0);

        assert.equal(result.type, 'reveal');
        assert.ok(result.changes.length >= 1);
        assert.equal(game.visibleGrid[0][0], 1);
    });

    it('should explode on mine cell', async () => {
        const game = Boards.tiny_center_mine();
        const result = await game.reveal(1, 1);

        assert.equal(result.type, 'explode');
        assert.equal(result.x, 1);
        assert.equal(result.y, 1);
        assert.equal(game.gameOver, true);
        assert.equal(game.visibleGrid[1][1], 9);
    });

    it('should save lastMove on explosion', async () => {
        const game = Boards.tiny_center_mine();
        await game.reveal(1, 1);

        assert.deepEqual(game.lastMove, { x: 1, y: 1 });
    });

    it('should not reveal flagged cell', async () => {
        const game = Boards.tiny_center_mine();
        game.placeFlag(0, 0);
        const result = await game.reveal(0, 0);

        assert.equal(result.type, 'none');
        assert.equal(game.visibleGrid[0][0], -1);
    });

    it('should not reveal already-revealed cell', async () => {
        const game = Boards.tiny_center_mine();
        await game.reveal(0, 0);
        const result = await game.reveal(0, 0);

        assert.equal(result.type, 'none');
    });

    it('should not act after game over', async () => {
        const game = Boards.tiny_center_mine();
        await game.reveal(1, 1); // explode
        const result = await game.reveal(0, 0);

        assert.equal(result.type, 'none');
    });

    it('should not act after victory', async () => {
        const game = Boards.tiny_center_mine();
        game.victory = true;
        const result = await game.reveal(0, 0);

        assert.equal(result.type, 'none');
    });

    it('should detect win when all safe cells revealed', async () => {
        const game = Boards.tiny_center_mine();
        // Reveal all 8 safe cells (mine is at center)
        const safeCells = [
            [0, 0], [1, 0], [2, 0],
            [0, 1], [2, 1],
            [0, 2], [1, 2], [2, 2],
        ];
        let lastResult;
        for (const [x, y] of safeCells) {
            lastResult = await game.reveal(x, y);
        }

        assert.equal(lastResult.type, 'win');
        assert.equal(game.victory, true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. FLAG TOGGLING
// ═════════════════════════════════════════════════════════════════════════════

describe('toggleFlag', () => {
    it('should place a flag on hidden cell', () => {
        const game = Boards.tiny_center_mine();
        const result = game.toggleFlag(1, 1);

        assert.equal(result.type, 'flag');
        assert.equal(result.active, true);
        assert.equal(result.x, 1);
        assert.equal(result.y, 1);
        assert.equal(game.flags[1][1], true);
        assert.equal(game.flagCount, 1);
    });

    it('should remove a flag on second toggle', () => {
        const game = Boards.tiny_center_mine();
        game.toggleFlag(1, 1);
        const result = game.toggleFlag(1, 1);

        assert.equal(result.type, 'flag');
        assert.equal(result.active, false);
        assert.equal(game.flags[1][1], false);
        assert.equal(game.flagCount, 0);
    });

    it('should not flag a revealed cell', () => {
        const game = Boards.tiny_center_mine();
        game.directReveal(0, 0);
        const result = game.toggleFlag(0, 0);

        assert.equal(result.type, 'none');
        assert.equal(game.flags[0][0], false);
    });

    it('should not flag after game over', () => {
        const game = Boards.tiny_center_mine();
        game.gameOver = true;
        const result = game.toggleFlag(0, 0);

        assert.equal(result.type, 'none');
    });

    it('should not flag after victory', () => {
        const game = Boards.tiny_center_mine();
        game.victory = true;
        const result = game.toggleFlag(0, 0);

        assert.equal(result.type, 'none');
    });

    it('should track flagCount correctly with multiple flags', () => {
        const game = Boards.small_5x5();
        game.toggleFlag(0, 0);
        game.toggleFlag(1, 0);
        game.toggleFlag(2, 0);
        assert.equal(game.flagCount, 3);

        game.toggleFlag(1, 0); // remove
        assert.equal(game.flagCount, 2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. CHORD CLICK
// ═════════════════════════════════════════════════════════════════════════════

describe('chord', () => {
    it('should do nothing on hidden cell', () => {
        const game = Boards.tiny_center_mine();
        const result = game.chord(0, 0);
        assert.equal(result.type, 'none');
    });

    it('should do nothing if flag count does not match number', () => {
        const game = Boards.tiny_center_mine();
        game.directReveal(0, 0); // reveals cell with value 1
        // No flags placed yet, so 0 flags ≠ 1
        const result = game.chord(0, 0);
        assert.equal(result.type, 'none');
    });

    it('should reveal neighbors when flag count matches (correct flags)', () => {
        const game = Boards.tiny_center_mine();
        // Reveal corner (0,0) — value is 1
        game.directReveal(0, 0);
        // Flag the mine correctly
        game.placeFlag(1, 1);

        const result = game.chord(0, 0);
        // On this small board, chording might reveal all remaining safe cells, leading to a win.
        assert.ok(result.type === 'reveal' || result.type === 'win', 'Should either reveal neighbors or win');
        assert.ok(result.changes.length > 0, 'Should reveal at least one neighbor');

        // (1,0) and (0,1) should now be revealed
        assert.notEqual(game.visibleGrid[1][0], -1, '(1,0) should be revealed');
        assert.notEqual(game.visibleGrid[0][1], -1, '(0,1) should be revealed');
    });

    it('should explode on chord with misplaced flag', () => {
        const game = Boards.corner_mines();
        // Mines at (0,0) and (1,0)
        // Reveal (2,0) — value is 1
        game.directReveal(2, 0);
        // Incorrectly flag (2,1) as mine (it's not a mine)
        game.placeFlag(2, 1);

        // Now chord on (2,0): flags==1, value==1, should try to reveal neighbors
        // (1,0) IS a mine and is NOT flagged → explode
        const result = game.chord(2, 0);
        assert.equal(result.type, 'explode');
        assert.equal(game.gameOver, true);
    });

    it('should detect win via chord', () => {
        const game = Boards.tiny_center_mine();
        // Reveal all corners and edges except via chord
        // Reveal (0,0) first (value 1)
        game.directReveal(0, 0);
        // Reveal the other cells that are not adjacent to (0,0) chord area
        game.directReveal(2, 0);
        game.directReveal(0, 2);
        game.directReveal(2, 2);
        game.directReveal(1, 0);
        game.directReveal(0, 1);
        game.directReveal(2, 1);

        // Only (1,2) is left unrevealed (plus the mine at (1,1))
        // Flag the mine
        game.placeFlag(1, 1);

        // Chord on (0,2) which is value 1, has 1 adjacent flag
        const result = game.chord(0, 2);
        // (1,2) should be revealed → all safe cells revealed → win
        assert.equal(result.type, 'win');
        assert.equal(game.victory, true);
    });

    it('should not chord on zero-value cell', () => {
        const game = Boards.empty_3x3();
        game.directReveal(1, 1); // reveals everything (all zeros)
        const result = game.chord(1, 1);
        assert.equal(result.type, 'none');
    });

    it('should not chord when game is over', () => {
        const game = Boards.tiny_center_mine();
        game.gameOver = true;
        const result = game.chord(0, 0);
        assert.equal(result.type, 'none');
    });

    it('should return none if chord reveals nothing new', () => {
        const game = Boards.tiny_center_mine();
        // Reveal everything around (0,0) first
        game.directReveal(0, 0);
        game.directReveal(1, 0);
        game.directReveal(0, 1);
        game.placeFlag(1, 1); // flag the mine

        // All neighbors of (0,0) are either revealed or flagged
        const result = game.chord(0, 0);
        assert.equal(result.type, 'none');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. WIN DETECTION
// ═════════════════════════════════════════════════════════════════════════════

describe('checkWin', () => {
    it('should return false on fresh board', () => {
        const game = Boards.tiny_center_mine();
        assert.equal(game.checkWin(), false);
    });

    it('should return false when only some cells revealed', () => {
        const game = Boards.tiny_center_mine();
        game.directReveal(0, 0);
        assert.equal(game.checkWin(), false);
    });

    it('should return true when all non-mine cells revealed', () => {
        const game = Boards.tiny_center_mine();
        // Reveal all 8 safe cells
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                if (!game.mines[x][y]) {
                    game.directReveal(x, y);
                }
            }
        }
        assert.equal(game.checkWin(), true);
    });

    it('should return true for empty board (no mines) when all revealed', () => {
        const game = Boards.empty_3x3();
        game.directReveal(0, 0); // cascades to all 9 cells
        assert.equal(game.checkWin(), true);
    });

    it('should not count exploded cells as revealed', () => {
        const game = Boards.tiny_center_mine();
        // Reveal all safe cells except one
        game.directReveal(0, 0);
        game.directReveal(2, 0);
        game.directReveal(0, 2);
        game.directReveal(2, 2);
        game.directReveal(1, 0);
        game.directReveal(0, 1);
        game.directReveal(2, 1);
        // (1,2) is not yet revealed

        // Mark mine as exploded (value 9)
        game.visibleGrid[1][1] = 9;

        assert.equal(game.checkWin(), false, 'Exploded mine should not count');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. RETRY
// ═════════════════════════════════════════════════════════════════════════════

describe('retryLastMove', () => {
    it('should undo the last explosion', async () => {
        const game = Boards.tiny_center_mine();
        await game.reveal(1, 1); // explode

        assert.equal(game.gameOver, true);
        assert.equal(game.visibleGrid[1][1], 9);

        const success = game.retryLastMove();
        assert.equal(success, true);
        assert.equal(game.gameOver, false);
        assert.equal(game.visibleGrid[1][1], -1, 'Cell should be hidden again');
        assert.equal(game.retryCount, 1);
        assert.equal(game.lastMove, null);
    });

    it('should not retry on non-game-over state', () => {
        const game = Boards.tiny_center_mine();
        const success = game.retryLastMove();
        assert.equal(success, false);
    });

    it('should not retry without lastMove', () => {
        const game = Boards.tiny_center_mine();
        game.gameOver = true;
        game.lastMove = null;

        const success = game.retryLastMove();
        assert.equal(success, false);
    });

    it('should increment retryCount on each retry', async () => {
        const game = Boards.tiny_center_mine();

        // First explosion
        await game.reveal(1, 1);
        game.retryLastMove();
        assert.equal(game.retryCount, 1);

        // Second explosion
        await game.reveal(1, 1);
        game.retryLastMove();
        assert.equal(game.retryCount, 2);
    });

    it('should allow play to continue after retry', async () => {
        const game = Boards.tiny_center_mine();
        await game.reveal(1, 1); // explode
        game.retryLastMove();

        // Should now be able to reveal safe cell
        const result = await game.reveal(0, 0);
        assert.equal(result.type, 'reveal');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. SERIALIZATION
// ═════════════════════════════════════════════════════════════════════════════

describe('Serialization', () => {
    it('should get mine positions correctly', () => {
        const mines = [{ x: 0, y: 2 }, { x: 2, y: 2 }, { x: 4, y: 0 }];
        const game = new TestGame(5, 5, mines);

        const positions = game.getMinePositions();
        assert.equal(positions.length, 3);

        // Sort both for comparison
        const sortFn = (a, b) => a.x - b.x || a.y - b.y;
        assert.deepEqual(positions.sort(sortFn), mines.sort(sortFn));
    });

    it('should restore mines from positions', () => {
        const game = new TestGame(5, 5, []);
        const positions = [{ x: 1, y: 1 }, { x: 3, y: 3 }];
        game.setMinesFromPositions(positions);

        assert.equal(game.mines[1][1], true);
        assert.equal(game.mines[3][3], true);
        assert.equal(game.bombCount, 0); // bombCount stays at original
        assert.equal(game.firstClick, false);
    });

    it('should recalculate numbers after restoring mines', () => {
        const game = new TestGame(3, 3, []);
        game.setMinesFromPositions([{ x: 1, y: 1 }]);

        // All neighbors should be 1
        assert.equal(game.grid[0][0], 1);
        assert.equal(game.grid[2][2], 1);
        assert.equal(game.grid[1][0], 1);
    });

    it('should round-trip mine positions perfectly', () => {
        const original = Boards.standard_8x8();
        const positions = original.getMinePositions();

        const restored = new TestGame(8, 8, []);
        restored.setMinesFromPositions(positions);

        // Grids should match
        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 8; y++) {
                assert.equal(restored.mines[x][y], original.mines[x][y],
                    `Mine mismatch at (${x},${y})`);
                assert.equal(restored.grid[x][y], original.grid[x][y],
                    `Grid mismatch at (${x},${y})`);
            }
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. CHRONOMETER
// ═════════════════════════════════════════════════════════════════════════════

describe('Chronometer', () => {
    it('should return 0 when not started', () => {
        const game = new TestGame(3, 3, []);
        assert.equal(game.getElapsedTime(), 0);
    });

    it('should return 0 when chronometer disabled', () => {
        const game = new TestGame(3, 3, []);
        game.enableChronometer = false;
        game.startChronometer();
        assert.equal(game.getElapsedTime(), 0);
    });

    it('should start timer only once', () => {
        const game = new TestGame(3, 3, []);
        game.startChronometer();
        const time1 = game.gameStartTime;

        game.startChronometer();
        assert.equal(game.gameStartTime, time1, 'Second call should not reset timer');
    });

    it('should return elapsed time in seconds', async () => {
        const game = new TestGame(3, 3, []);
        game.startChronometer();

        // Manually set start time 2 seconds ago
        game.gameStartTime = Date.now() - 2500;
        assert.equal(game.getElapsedTime(), 2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

describe('Edge Cases', () => {
    it('should handle 1×1 board with no mines', () => {
        const game = new TestGame(1, 1, []);
        game.directReveal(0, 0);
        assert.equal(game.checkWin(), true);
    });

    it('should handle 1×1 board with mine (instant loss)', async () => {
        const game = new TestGame(1, 1, [{ x: 0, y: 0 }]);
        const result = await game.reveal(0, 0);
        assert.equal(result.type, 'explode');
    });

    it('should handle large board dimensions', () => {
        const game = new TestGame(50, 50, [{ x: 25, y: 25 }]);
        assert.equal(game.width, 50);
        assert.equal(game.height, 50);
        assert.equal(game.grid[25][25], 1); // mine cell
        assert.equal(game.grid[0][0], 0);     // far from mine
    });

    it('should handle board where all cells except one are mines', () => {
        const mines = [];
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                if (x !== 1 || y !== 1) mines.push({ x, y });
            }
        }
        const game = new TestGame(3, 3, mines); // 8 mines, 1 safe
        game.directReveal(1, 1); // the only safe cell
        assert.equal(game.grid[1][1], 8, 'Center surrounded by 8 mines');
        assert.equal(game.checkWin(), true);
    });

    it('should handle flag on mine and card reveal around', async () => {
        const game = Boards.corner_mines();
        // Mines at (0,0) and (1,0)
        game.placeFlag(0, 0);
        game.placeFlag(1, 0);

        // Reveal cell (0,1) which has value 2
        const result = await game.reveal(0, 1);
        assert.equal(result.type, 'reveal');
        assert.equal(game.visibleGrid[0][1], 2);
    });

    it('should properly handle chord at board edges', () => {
        const game = Boards.corner_mines();
        // Mines at (0,0) and (1,0)
        // Reveal (0,1) — value 2
        game.directReveal(0, 1);
        // Flag both mines
        game.placeFlag(0, 0);
        game.placeFlag(1, 0);

        // Chord on (0,1) should reveal (1,1)
        const result = game.chord(0, 1);
        assert.ok(['reveal', 'win'].includes(result.type), `Expected reveal or win, got ${result.type}`);
        assert.notEqual(game.visibleGrid[1][1], -1);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. COMPLEX GAME SCENARIOS
// ═════════════════════════════════════════════════════════════════════════════

describe('Game Scenarios', () => {
    it('should play a full game to victory (flag + chord)', async () => {
        const game = Boards.almost_won();
        // Mine only at (0,0), 5×5 board

        // Reveal a safe cell far from mine
        const r1 = await game.reveal(4, 4);
        // It might win immediately depending on cascade
        assert.ok(['reveal', 'win'].includes(r1.type));

        // The flood fill from (4,4) should cascade through most zeros
        // Check if we've won yet
        if (!game.victory) {
            // Reveal remaining hidden safe cells
            for (let x = 0; x < 5; x++) {
                for (let y = 0; y < 5; y++) {
                    if (game.visibleGrid[x][y] === -1 && !game.mines[x][y]) {
                        await game.reveal(x, y);
                    }
                }
            }
        }

        assert.equal(game.victory, true);
    });

    it('should handle reveal → chord → win sequence', () => {
        // 3×3 with mine at (2,2)
        const game = new TestGame(3, 3, [{ x: 2, y: 2 }]);

        // Reveal (0,0) — value 0, cascades through zeros
        game.directReveal(0, 0);

        // After cascade, (1,1) should be revealed with value 1
        assert.equal(game.visibleGrid[1][1], 1);

        // Flag the mine
        game.placeFlag(2, 2);

        // Chord on (1,1) — should reveal remaining cells
        const result = game.chord(1, 1);

        // Check if won
        if (result.type === 'win') {
            assert.equal(game.victory, true);
        } else {
            // Might need more reveals depending on cascade, or none if already revealed
            assert.ok(['reveal', 'none'].includes(result.type), `Expected reveal or none, got ${result.type}`);
        }
    });

    it('should handle multiple retries and eventual win', async () => {
        const game = Boards.tiny_center_mine();

        // Hit mine
        await game.reveal(1, 1);
        assert.equal(game.gameOver, true);

        // Retry
        game.retryLastMove();
        assert.equal(game.retryCount, 1);

        // Now reveal all safe cells
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                if (!game.mines[x][y] && game.visibleGrid[x][y] === -1) {
                    await game.reveal(x, y);
                }
            }
        }
        assert.equal(game.victory, true);
        assert.equal(game.retryCount, 1);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. FIRST CLICK PATH
// ═════════════════════════════════════════════════════════════════════════════

describe('reveal (first click)', () => {
    it('should place mines and auto-reveal 3×3 safe zone on first click', async () => {
        // Use a fresh game where firstClick is true (no setMinesFromPositions)
        const game = new TestGame(8, 8, []); // no mines yet
        game.bombCount = 5;
        game.firstClick = true;

        const result = await game.reveal(4, 4);

        // After first click, mines should be placed and first click zone revealed
        assert.equal(game.firstClick, false, 'firstClick should be false after reveal');
        assert.ok(['reveal', 'win'].includes(result.type), `Expected reveal or win, got ${result.type}`);
        assert.ok(result.changes.length > 0, 'Should reveal cells');

        // The clicked cell and its neighbors should be revealed (3×3 zone)
        assert.notEqual(game.visibleGrid[4][4], -1, 'Clicked cell should be revealed');

        // No mine should be in the safe zone around (4,4)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const nx = 4 + dx, ny = 4 + dy;
                if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
                    assert.equal(game.mines[nx][ny], false,
                        `Cell (${nx},${ny}) in safe zone should not be a mine`);
                }
            }
        }
    });

    it('should start the chronometer on first click', async () => {
        const game = new TestGame(5, 5, []);
        game.bombCount = 2;
        game.firstClick = true;

        assert.equal(game.gameStartTime, null, 'Timer not started before first click');

        await game.reveal(2, 2);

        assert.ok(game.gameStartTime !== null, 'Timer should be started after first click');
    });

    it('should handle cancelled generation via _onGenerationWarning', async () => {
        const game = new TestGame(5, 5, []);
        game.bombCount = 2;
        game.firstClick = true;
        // cancelGeneration is checked inside the placeMines loop,
        // which only iterates when noGuessMode is true
        game.noGuessMode = true;

        let warningCalled = false;
        game._onGenerationWarning = (result) => {
            warningCalled = true;
            assert.ok(result.cancelled, 'Should pass cancelled result');
        };

        // Use onProgress callback to set cancel flag during placeMines execution
        // (placeMines resets the flag at the start, so we must set it mid-loop)
        await game.reveal(2, 2, (attempts) => {
            if (attempts >= 10) {
                game.cancelGeneration = true;
            }
        });
        assert.equal(warningCalled, true, '_onGenerationWarning should be called');
    });

    it('should win immediately if board has 0 mines', async () => {
        const game = new TestGame(3, 3, []);
        game.bombCount = 0;
        game.firstClick = true;

        const result = await game.reveal(1, 1);

        // With 0 mines, all cells are safe. The 3×3 zone flood fill reveals everything = win.
        assert.equal(result.type, 'win');
        assert.equal(game.victory, true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. bombCount CONSISTENCY
// ═════════════════════════════════════════════════════════════════════════════

describe('bombCount consistency', () => {
    it('should set bombCount equal to minePositions.length in TestGame', () => {
        const game = new TestGame(5, 5, [
            { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }
        ]);
        assert.equal(game.bombCount, 3, 'bombCount should match mine positions');
    });

    it('should set bombCount to 0 for empty mine list', () => {
        const game = new TestGame(3, 3, []);
        assert.equal(game.bombCount, 0);
    });

    it('should use bombCount correctly in checkWin', () => {
        // 3×3, 2 mines. Need to reveal 9-2=7 cells to win.
        const game = new TestGame(3, 3, [{ x: 0, y: 0 }, { x: 2, y: 2 }]);
        assert.equal(game.bombCount, 2);

        // Reveal all 7 safe cells
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                if (!game.mines[x][y]) {
                    game.directReveal(x, y);
                }
            }
        }
        assert.equal(game.checkWin(), true);
    });
});
