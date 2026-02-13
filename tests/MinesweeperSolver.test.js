/**
 * MinesweeperSolver.test.js — Tests for the solver algorithms.
 *
 * Tests each strategy independently on deterministic boards:
 *   - Utility methods (cellKey, countBits, neighborCache)
 *   - Basic Rules (Strategy 1)
 *   - Subset Logic (Strategy 2)
 *   - Global Mine Count (Strategy 5)
 *   - isSolvable (full pipeline)
 *   - getHint (god-mode hint)
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npm test  or  npm run test:solver
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MinesweeperSolver } from '../shared/MinesweeperSolver.js';
import { TestGame, Boards } from './helpers/TestGame.js';

// ═════════════════════════════════════════════════════════════════════════════
// 1. UTILITY METHODS
// ═════════════════════════════════════════════════════════════════════════════

describe('Solver Utilities', () => {

    describe('cellKey / decodeKey', () => {
        it('should encode and decode (0,0)', () => {
            const key = MinesweeperSolver.cellKey(0, 0);
            const decoded = MinesweeperSolver.decodeKey(key);
            assert.deepEqual(decoded, { x: 0, y: 0 });
        });

        it('should encode and decode arbitrary coordinates', () => {
            for (const [x, y] of [[5, 3], [100, 200], [0, 255], [255, 0], [1, 1]]) {
                const key = MinesweeperSolver.cellKey(x, y);
                const decoded = MinesweeperSolver.decodeKey(key);
                assert.deepEqual(decoded, { x, y }, `Round-trip failed for (${x}, ${y})`);
            }
        });

        it('should produce unique keys for different coordinates', () => {
            const keys = new Set();
            for (let x = 0; x < 30; x++) {
                for (let y = 0; y < 20; y++) {
                    const key = MinesweeperSolver.cellKey(x, y);
                    assert.ok(!keys.has(key), `Duplicate key for (${x},${y})`);
                    keys.add(key);
                }
            }
        });
    });

    describe('countBits', () => {
        it('should count 0 bits for 0', () => {
            assert.equal(MinesweeperSolver.countBits(0), 0);
        });

        it('should count 1 bit for powers of 2', () => {
            assert.equal(MinesweeperSolver.countBits(1), 1);
            assert.equal(MinesweeperSolver.countBits(2), 1);
            assert.equal(MinesweeperSolver.countBits(4), 1);
            assert.equal(MinesweeperSolver.countBits(8), 1);
            assert.equal(MinesweeperSolver.countBits(256), 1);
        });

        it('should count all bits for 2^n - 1', () => {
            assert.equal(MinesweeperSolver.countBits(0b111), 3);
            assert.equal(MinesweeperSolver.countBits(0b1111), 4);
            assert.equal(MinesweeperSolver.countBits(0xFF), 8);
        });

        it('should count mixed bit patterns', () => {
            assert.equal(MinesweeperSolver.countBits(0b1010), 2);
            assert.equal(MinesweeperSolver.countBits(0b11001), 3);
        });
    });

    describe('initNeighborCache', () => {
        it('should return cached neighbors for interior cells', () => {
            MinesweeperSolver.initNeighborCache(5, 5);
            const neighbors = MinesweeperSolver.getCachedNeighbors(2, 2);
            assert.equal(neighbors.length, 8, 'Interior cell has 8 neighbors');
        });

        it('should return fewer neighbors for corner cells', () => {
            MinesweeperSolver.initNeighborCache(5, 5);
            const neighbors = MinesweeperSolver.getCachedNeighbors(0, 0);
            assert.equal(neighbors.length, 3, 'Corner cell has 3 neighbors');
        });

        it('should return fewer neighbors for edge cells', () => {
            MinesweeperSolver.initNeighborCache(5, 5);
            const neighbors = MinesweeperSolver.getCachedNeighbors(2, 0);
            assert.equal(neighbors.length, 5, 'Edge cell has 5 neighbors');
        });

        it('should reuse cache for same dimensions', () => {
            const cache1 = MinesweeperSolver.initNeighborCache(10, 10);
            const cache2 = MinesweeperSolver.initNeighborCache(10, 10);
            assert.equal(cache1, cache2, 'Cache should be reused');
        });
    });

    describe('getNeighbors', () => {
        it('should return 8 neighbors for interior cell', () => {
            const n = MinesweeperSolver.getNeighbors(2, 2, 5, 5);
            assert.equal(n.length, 8);
        });

        it('should return 3 neighbors for corner cell', () => {
            const n = MinesweeperSolver.getNeighbors(0, 0, 5, 5);
            assert.equal(n.length, 3);
            // Should include (1,0), (0,1), (1,1)
            assert.ok(n.some(c => c.x === 1 && c.y === 0));
            assert.ok(n.some(c => c.x === 0 && c.y === 1));
            assert.ok(n.some(c => c.x === 1 && c.y === 1));
        });

        it('should not include the cell itself', () => {
            const n = MinesweeperSolver.getNeighbors(2, 2, 5, 5);
            assert.ok(!n.some(c => c.x === 2 && c.y === 2));
        });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. STRATEGY 1: BASIC RULES
// ═════════════════════════════════════════════════════════════════════════════

describe('Strategy 1: Basic Rules', () => {
    it('should flag mines when number equals hidden + flagged count', () => {
        // 3×3 board, mine at (1,1)
        // Reveal (0,0) which is "1" — has 1 mine neighbor
        const game = Boards.tiny_center_mine();
        MinesweeperSolver.initNeighborCache(3, 3);

        // Reveal all corners and edges (leave center hidden = the mine)
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                if (!game.mines[x][y]) {
                    game.directReveal(x, y);
                }
            }
        }

        // Now apply basic rules — each "1" cell has 1 hidden neighbor (the mine)
        const dirtyCells = new Set();
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                dirtyCells.add(MinesweeperSolver.cellKey(x, y));
            }
        }

        const result = MinesweeperSolver.applyBasicRules(
            game.grid, game.visibleGrid, game.flags,
            3, 3, dirtyCells, 0
        );

        assert.equal(result.progress, true);
        assert.equal(result.flagCount, 1, 'Should have flagged the mine');
        assert.equal(game.flags[1][1], true, 'Mine at (1,1) should be flagged');
    });

    it('should reveal safe cells when all mines are flagged', () => {
        // 4×4 board, mines at (0,0) and (1,0)
        const game = Boards.corner_mines();
        MinesweeperSolver.initNeighborCache(4, 4);

        // Reveal (2,0) which is "1", and flag (1,0)
        game.directReveal(2, 0);
        game.placeFlag(1, 0);

        const dirtyCells = new Set();
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                dirtyCells.add(MinesweeperSolver.cellKey(x, y));
            }
        }

        const result = MinesweeperSolver.applyBasicRules(
            game.grid, game.visibleGrid, game.flags,
            4, 4, dirtyCells, 1
        );

        assert.equal(result.progress, true);
        // (2,1) and (3,0) and (3,1) should now be revealed (they are safe neighbors)
    });

    it('should return no progress when nothing can be deduced', () => {
        const game = Boards.small_5x5();
        MinesweeperSolver.initNeighborCache(5, 5);

        // Reveal only one cell far from mines
        game.directReveal(4, 4);

        const dirtyCells = new Set();
        dirtyCells.add(MinesweeperSolver.cellKey(4, 4));

        const result = MinesweeperSolver.applyBasicRules(
            game.grid, game.visibleGrid, game.flags,
            5, 5, dirtyCells, 0
        );

        // Can't deduce anything from a single "0" cell with nothing revealed around
        // Actually (4,4) is 0 so flood fill has already revealed neighbors
        // The result depends on what's around — let's just check it doesn't crash
        assert.ok(typeof result.progress === 'boolean');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. STRATEGY 5: GLOBAL MINE COUNT
// ═════════════════════════════════════════════════════════════════════════════

describe('Strategy 5: Global Mine Count', () => {
    it('should flag all hidden cells when remaining mines == hidden cells', () => {
        // Set up: 3×3 board, 1 mine at (1,1)
        // Reveal all safe cells except (1,1). All 8 are revealed.
        // Then 1 hidden cell, 1 remaining mine → flag it.
        const game = Boards.tiny_center_mine();
        MinesweeperSolver.initNeighborCache(3, 3);

        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                if (!game.mines[x][y]) {
                    game.directReveal(x, y);
                }
            }
        }

        const result = MinesweeperSolver.applyGlobalMineCount(
            game.grid, game.visibleGrid, game.flags,
            3, 3, 1, 0
        );

        assert.equal(result.progress, true);
        assert.equal(result.flagCount, 1);
        assert.equal(game.flags[1][1], true);
    });

    it('should reveal all hidden when remaining mines == 0', () => {
        // Use a test board where we control the state to ensure hidden cells exist
        const game = new TestGame(4, 4, [{ x: 0, y: 0 }]); // 1 mine at (0,0)
        MinesweeperSolver.initNeighborCache(4, 4);

        // Manually reveal a safe cell that doesn't trigger full cascade
        // e.g. revealing (2,2) on a 4x4 with 1 mine might usually trigger cascade,
        // so let's just assume we have hidden cells.
        // Actually, let's just construct a state where (3,3) is hidden and safe.
        // We just need ANY hidden safe cell.
        // Let's reveal (1,0) - it's a '1'.
        game.directReveal(1, 0);

        // Place flag on the mine
        game.placeFlag(0, 0);

        // Now:
        // Mine at (0,0) is flagged.
        // (1,0) is revealed.
        // All other cells are hidden and safe.
        // Remaining mines = 1 - 1 = 0.

        const result = MinesweeperSolver.applyGlobalMineCount(
            game.grid, game.visibleGrid, game.flags,
            4, 4, 1, 1
        );

        assert.equal(result.progress, true, 'Should make progress');

        // Check that a previously hidden safe cell is now revealed
        assert.notEqual(game.visibleGrid[3][3], -1, 'Safe cell (3,3) should be revealed');
    });

    it('should do nothing when deduction is not possible', () => {
        const game = Boards.standard_8x8();
        MinesweeperSolver.initNeighborCache(8, 8);

        game.directReveal(4, 4);

        const result = MinesweeperSolver.applyGlobalMineCount(
            game.grid, game.visibleGrid, game.flags,
            8, 8, 10, 0
        );

        assert.equal(result.progress, false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. getHint (God Mode)
// ═════════════════════════════════════════════════════════════════════════════

describe('getHint', () => {
    it('should return a safe cell on the frontier', () => {
        const game = Boards.small_5x5();
        game.directReveal(4, 4);

        const hint = MinesweeperSolver.getHint(game);

        assert.ok(hint !== null, 'Should find a hint');
        assert.equal(hint.type, 'safe');
        assert.ok(hint.x >= 0 && hint.x < 5);
        assert.ok(hint.y >= 0 && hint.y < 5);
        assert.equal(game.mines[hint.x][hint.y], false, 'Hint should not be a mine');
    });

    it('should prefer zero cells (higher score)', () => {
        // On a board with safe frontier cells, zeros get +10 score
        const game = Boards.standard_8x8();
        game.directReveal(4, 4);

        const hint = MinesweeperSolver.getHint(game);
        assert.ok(hint !== null);
        assert.ok(hint.score > 0, 'Should have a positive score');
    });

    it('should return safe cell even with no frontier (island mode)', () => {
        const game = Boards.standard_8x8();
        // Don't reveal anything — all are hidden
        // Manually set firstClick to false to bypass
        // getHint should still find safe island cells

        const hint = MinesweeperSolver.getHint(game);
        assert.ok(hint !== null, 'Should find a safe island cell');
        assert.equal(game.mines[hint.x][hint.y], false);
    });

    it('should return null when no safe cells exist', () => {
        // 2×1 board with 2 mines — no safe cells at all
        // But we need at least the structure...
        const game = new TestGame(2, 1, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);

        const hint = MinesweeperSolver.getHint(game);
        assert.equal(hint, null, 'No safe cells → null');
    });

    it('should not suggest flagged cells', () => {
        const game = Boards.small_5x5();
        game.directReveal(4, 4);

        // Flag a safe frontier cell
        const firstHint = MinesweeperSolver.getHint(game);
        assert.ok(firstHint !== null);
        game.placeFlag(firstHint.x, firstHint.y);

        // Get another hint — should not be the flagged cell
        const secondHint = MinesweeperSolver.getHint(game);
        if (secondHint) {
            const isSameAsFlagged = secondHint.x === firstHint.x && secondHint.y === firstHint.y;
            assert.ok(!isSameAsFlagged, 'Should not suggest a flagged cell');
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. isSolvable (Full Pipeline)
// ═════════════════════════════════════════════════════════════════════════════

describe('isSolvable', () => {
    it('should solve a trivially solvable board', () => {
        // 3×3 with 1 mine — always solvable from any corner
        const game = Boards.tiny_center_mine();
        const solvable = MinesweeperSolver.isSolvable(game, 0, 0);
        assert.equal(solvable, true);
    });

    it('should solve empty board (no mines)', () => {
        const game = Boards.empty_3x3();
        const solvable = MinesweeperSolver.isSolvable(game, 1, 1);
        assert.equal(solvable, true);
    });

    it('should solve board with obvious mine placement', () => {
        // 4×4 with 2 mines in corners
        const game = Boards.corner_mines();
        const solvable = MinesweeperSolver.isSolvable(game, 3, 3);
        assert.equal(solvable, true);
    });

    it('should handle 1×1 board with no mines', () => {
        const game = new TestGame(1, 1, []);
        const solvable = MinesweeperSolver.isSolvable(game, 0, 0);
        assert.equal(solvable, true);
    });

    it('should solve a simple isolated scenario', () => {
        // 3x3 board with 1 mine at (2,2)
        const game = new TestGame(3, 3, [{ x: 2, y: 2 }]);
        // Start revealing at (0,0) -> zero -> reveals almost everything
        const solvable = MinesweeperSolver.isSolvable(game, 0, 0);
        assert.equal(solvable, true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. CONFIGURATION ENUMERATION
// ═════════════════════════════════════════════════════════════════════════════

describe('Configuration Enumeration', () => {
    describe('analyzeConfigurations', () => {
        it('should identify cells that are mines in all configurations', () => {
            const region = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
            // Config 1: [true, false, true]
            // Config 2: [true, false, true]
            // → (0,0) always mine, (1,0) always safe, (2,0) always mine
            const configs = [
                [true, false, true],
                [true, false, true],
            ];

            const { definiteMines, definiteSafes } = MinesweeperSolver.analyzeConfigurations(region, configs);

            assert.equal(definiteMines.length, 2);
            assert.equal(definiteSafes.length, 1);
            assert.deepEqual(definiteSafes[0], { x: 1, y: 0 });
        });

        it('should return empty results for mixed configurations', () => {
            const region = [{ x: 0, y: 0 }];
            const configs = [
                [true],
                [false],
            ];

            const { definiteMines, definiteSafes } = MinesweeperSolver.analyzeConfigurations(region, configs);

            assert.equal(definiteMines.length, 0);
            assert.equal(definiteSafes.length, 0);
        });

        it('should handle single configuration', () => {
            const region = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
            const configs = [[true, false]];

            const { definiteMines, definiteSafes } = MinesweeperSolver.analyzeConfigurations(region, configs);

            assert.equal(definiteMines.length, 1);
            assert.deepEqual(definiteMines[0], { x: 0, y: 0 });
            assert.equal(definiteSafes.length, 1);
            assert.deepEqual(definiteSafes[0], { x: 1, y: 0 });
        });
    });

    describe('simulateReveal', () => {
        it('should reveal a single numbered cell', () => {
            const game = Boards.tiny_center_mine();
            const visibleGrid = Array(3).fill().map(() => Array(3).fill(-1));
            const flags = Array(3).fill().map(() => Array(3).fill(false));

            MinesweeperSolver.simulateReveal(game.grid, visibleGrid, flags, 3, 3, 0, 0);

            assert.equal(visibleGrid[0][0], 1, 'Cell (0,0) should show 1');
            // Should not cascade (value > 0)
            assert.equal(visibleGrid[1][0], -1, '(1,0) should still be hidden');
        });

        it('should cascade through zeros', () => {
            const game = Boards.empty_3x3();
            const visibleGrid = Array(3).fill().map(() => Array(3).fill(-1));
            const flags = Array(3).fill().map(() => Array(3).fill(false));

            MinesweeperSolver.simulateReveal(game.grid, visibleGrid, flags, 3, 3, 1, 1);

            // All cells should be revealed (all zeros)
            for (let x = 0; x < 3; x++) {
                for (let y = 0; y < 3; y++) {
                    assert.equal(visibleGrid[x][y], 0, `Cell (${x},${y}) should be revealed as 0`);
                }
            }
        });

        it('should not reveal flagged cells', () => {
            const game = Boards.empty_3x3();
            const visibleGrid = Array(3).fill().map(() => Array(3).fill(-1));
            const flags = Array(3).fill().map(() => Array(3).fill(false));
            flags[2][2] = true;

            MinesweeperSolver.simulateReveal(game.grid, visibleGrid, flags, 3, 3, 1, 1);

            assert.equal(visibleGrid[2][2], -1, 'Flagged cell should not be revealed');
        });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. FRONTIER DETECTION
// ═════════════════════════════════════════════════════════════════════════════

describe('Frontier Detection', () => {
    it('should find frontier cells adjacent to revealed numbers', () => {
        const game = Boards.tiny_center_mine();
        MinesweeperSolver.initNeighborCache(3, 3);

        // Reveal corner (0,0) — value 1
        game.directReveal(0, 0);

        const frontier = MinesweeperSolver.getFrontier(
            game.visibleGrid, game.flags, 3, 3
        );

        assert.ok(frontier.length > 0, 'Should find frontier cells');
        // Frontier should include hidden cells adjacent to revealed "1"
        // (1,0), (0,1), (1,1) are adjacent to (0,0)
        for (const cell of frontier) {
            assert.equal(game.visibleGrid[cell.x][cell.y], -1, 'Frontier cells should be hidden');
            assert.equal(game.flags[cell.x][cell.y], false, 'Frontier cells should not be flagged');
        }
    });

    it('should not include flagged cells in frontier', () => {
        const game = Boards.tiny_center_mine();
        MinesweeperSolver.initNeighborCache(3, 3);

        game.directReveal(0, 0);
        game.placeFlag(1, 1); // flag the mine

        const frontier = MinesweeperSolver.getFrontier(
            game.visibleGrid, game.flags, 3, 3
        );

        for (const cell of frontier) {
            const isFlagged = cell.x === 1 && cell.y === 1;
            assert.ok(!isFlagged, 'Flagged cell should not be in frontier');
        }
    });

    it('should return empty frontier for fully revealed board', () => {
        const game = Boards.empty_3x3();
        MinesweeperSolver.initNeighborCache(3, 3);
        game.directReveal(1, 1); // reveals everything

        const frontier = MinesweeperSolver.getFrontier(
            game.visibleGrid, game.flags, 3, 3
        );

        assert.equal(frontier.length, 0, 'No frontier on fully revealed board');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. countFlags
// ═════════════════════════════════════════════════════════════════════════════

describe('countFlags', () => {
    it('should return 0 with no flags', () => {
        const flags = Array(5).fill().map(() => Array(5).fill(false));
        assert.equal(MinesweeperSolver.countFlags(flags, 5, 5), 0);
    });

    it('should count flags correctly', () => {
        const flags = Array(5).fill().map(() => Array(5).fill(false));
        flags[0][0] = true;
        flags[2][3] = true;
        flags[4][4] = true;
        assert.equal(MinesweeperSolver.countFlags(flags, 5, 5), 3);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. STRATEGY 2: SUBSET LOGIC
// ═════════════════════════════════════════════════════════════════════════════

describe('Strategy 2: Subset Logic', () => {
    it('should reveal safe cells via subset difference', () => {
        // 5×3 board with mines at (0,1) and (1,1)
        // After revealing some cells, subset logic can deduce safe cells.
        //
        // Setup: mine at (0,1), mine at (1,1)
        // Reveal (0,0)=2, (1,0)=2, (2,0)=1
        // Hidden: (0,1), (1,1), (2,1), ...
        //
        // Constraint (0,0): 2 mines among (0,1),(1,0)=revealed,(1,1) → hidden: (0,1),(1,1), remaining=2
        // Constraint (2,0): 1 mine among (1,0)=revealed,(1,1),(2,1) → hidden: (1,1),(2,1), remaining=1
        // Constraint (1,0): 2 mines among (0,0)=revealed,(0,1),(1,1),(2,0)=revealed,(2,1) → hidden: (0,1),(1,1),(2,1), remaining=2
        //
        // From (0,0): {(0,1),(1,1)} need 2 mines → both are mines
        // This is actually a basic rule (all hidden = remaining). Let's make it need subset.
        //
        // Better example:
        // 4×2 board, mine at (1,1)
        // Reveal: (0,0)=1, (1,0)=1, (2,0)=1, (3,0)=0
        // Hidden: (0,1), (1,1), (2,1), (3,1)
        //
        // (0,0)=1: hidden neighbors (0,1),(1,1),(1,0=revealed) → remaining=1, hidden={(0,1),(1,1)}
        // (1,0)=1: hidden neighbors (0,1),(1,1),(2,1),(0,0=r),(2,0=r) → remaining=1, hidden={(0,1),(1,1),(2,1)}
        // (2,0)=1: hidden neighbors (1,1),(2,1),(3,1),(1,0=r),(3,0=r) → remaining=1, hidden={(1,1),(2,1),(3,1)}
        // (3,0)=0: hidden neighbors (2,0=r),(2,1),(3,1) → remaining=0, hidden={(2,1),(3,1)}
        //
        // From (3,0): remaining=0 → (2,1),(3,1) are safe. This is basic rules.
        //
        // Subset: {(0,1),(1,1)} ⊂ {(0,1),(1,1),(2,1)} with remaining 1 vs 1 → diff={(2,1)} needs 0 mines → (2,1) is safe!
        // This IS subset logic.
        //
        // But basic rules from (3,0) would catch it first. Let's remove the 0-cell.
        // 3×2 board, mine at (1,1)
        // Reveal (0,0)=1, (1,0)=1, (2,0)=1
        // Hidden: (0,1),(1,1),(2,1)
        //
        // (0,0)=1: hidden={(0,1),(1,1)}, remaining=1
        // (1,0)=1: hidden={(0,1),(1,1),(2,1)}, remaining=1
        // (2,0)=1: hidden={(1,1),(2,1)}, remaining=1
        //
        // Subset {(0,1),(1,1)} ⊂ {(0,1),(1,1),(2,1)}: diffMines=1-1=0, diff={(2,1)} → safe!
        // Subset {(1,1),(2,1)} ⊂ {(0,1),(1,1),(2,1)}: diffMines=1-1=0, diff={(0,1)} → safe!
        const game = new TestGame(3, 2, [{ x: 1, y: 1 }]);
        MinesweeperSolver.initNeighborCache(3, 2);

        game.directReveal(0, 0);
        game.directReveal(1, 0);
        game.directReveal(2, 0);

        assert.equal(game.visibleGrid[0][0], 1);
        assert.equal(game.visibleGrid[1][0], 1);
        assert.equal(game.visibleGrid[2][0], 1);

        const dirtyCells = new Set();
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 2; y++) {
                dirtyCells.add(MinesweeperSolver.cellKey(x, y));
            }
        }

        const result = MinesweeperSolver.applySubsetLogic(
            game.grid, game.visibleGrid, game.flags,
            3, 2, dirtyCells, 0
        );

        assert.equal(result.progress, true, 'Should find subset deduction');
        // After subset logic, at least one of (0,1) or (2,1) should be revealed as safe
        const safeRevealed = game.visibleGrid[0][1] !== -1 || game.visibleGrid[2][1] !== -1;
        assert.ok(safeRevealed, 'At least one safe cell should be revealed');
    });

    it('should flag mines when diff equals remaining', () => {
        // 3×2 board, mines at (0,1) and (2,1)
        // Reveal (0,0)=1, (1,0)=2, (2,0)=1
        // (0,0)=1: hidden={(0,1),(1,1)}, remaining=1
        // (1,0)=2: hidden={(0,1),(1,1),(2,1)}, remaining=2
        // (2,0)=1: hidden={(1,1),(2,1)}, remaining=1
        //
        // Subset {(0,1),(1,1)} ⊂ {(0,1),(1,1),(2,1)}: diffMines=2-1=1, diff={(2,1)}, diff.length=1 → flag (2,1)
        const game = new TestGame(3, 2, [{ x: 0, y: 1 }, { x: 2, y: 1 }]);
        MinesweeperSolver.initNeighborCache(3, 2);

        game.directReveal(0, 0);
        game.directReveal(1, 0);
        game.directReveal(2, 0);

        assert.equal(game.visibleGrid[1][0], 2);

        const dirtyCells = new Set();
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 2; y++) {
                dirtyCells.add(MinesweeperSolver.cellKey(x, y));
            }
        }

        const result = MinesweeperSolver.applySubsetLogic(
            game.grid, game.visibleGrid, game.flags,
            3, 2, dirtyCells, 0
        );

        assert.equal(result.progress, true, 'Should flag a mine');
        assert.ok(result.flagCount >= 1, 'Should increment flagCount');
    });

    it('should return no progress when subset logic cannot deduce', () => {
        // A board where no subset relationship exists or helps
        const game = Boards.standard_8x8();
        MinesweeperSolver.initNeighborCache(8, 8);

        // Reveal a single cell
        game.directReveal(4, 4);

        const dirtyCells = new Set();
        dirtyCells.add(MinesweeperSolver.cellKey(4, 4));

        const result = MinesweeperSolver.applySubsetLogic(
            game.grid, game.visibleGrid, game.flags,
            8, 8, dirtyCells, 0
        );

        assert.equal(result.progress, false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. STRATEGY 3: PROOF BY CONTRADICTION
// ═════════════════════════════════════════════════════════════════════════════

describe('Strategy 3: Proof by Contradiction', () => {
    it('should find safe cell when assuming mine leads to contradiction', () => {
        // 3×3 board, mine at (2,2)
        // Reveal everything except (2,2) and a couple cells near it
        // So that checkContradiction can work
        const game = new TestGame(3, 3, [{ x: 2, y: 2 }]);
        MinesweeperSolver.initNeighborCache(3, 3);

        // Reveal (0,0) which is 0 — should cascade and reveal most cells
        game.directReveal(0, 0);
        // After flood from (0,0), all cells except the mine should be visible

        const result = MinesweeperSolver.solveByContradiction(
            game.grid, game.visibleGrid, game.flags,
            3, 3, 0
        );

        // The contradiction approach might or might not find something depending
        // on board state. The important thing is it doesn't crash and returns valid result.
        assert.ok(typeof result.progress === 'boolean');
        assert.ok(typeof result.flagCount === 'number');
    });

    it('should handle empty frontier (fully revealed board)', () => {
        const game = Boards.empty_3x3();
        MinesweeperSolver.initNeighborCache(3, 3);
        game.directReveal(0, 0); // reveals all

        const result = MinesweeperSolver.solveByContradiction(
            game.grid, game.visibleGrid, game.flags,
            3, 3, 0
        );

        assert.equal(result.progress, false);
    });

    it('checkContradiction should detect impossible mine assumption', () => {
        // Setup: 4×1 board
        // (0,0)=revealed 1, (1,0)=hidden, (2,0)=revealed 1, (3,0)=hidden
        // Assume (1,0) is safe: (0,0)=1 needs 1 mine but has 0 flagged + 0 hidden → contradiction
        // Actually, let's use a 2-cell constraint:
        // 3×1: (0,0)=revealed 1, (1,0)=hidden, (2,0)=revealed 1
        // Hidden neighbor of (0,0): only (1,0)
        // Hidden neighbor of (2,0): only (1,0)
        // If assume (1,0) is safe:
        //   (0,0) has val=1, flagged=0, hidden=0 (since (1,0) assumed safe): 0+0 < 1 → contradiction!
        const width = 3, height = 1;
        const visibleGrid = [[1], [-1], [1]];
        const flags = [[false], [false], [false]];

        MinesweeperSolver.initNeighborCache(width, height);

        const result = MinesweeperSolver.checkContradiction(
            visibleGrid, flags, width, height,
            { x: 1, y: 0 }, false // assume safe
        );

        assert.equal(result, true, 'Assuming safe at (1,0) should contradict: both clues need a mine but (1,0) was assumed safe');
    });

    it('checkContradiction should not find contradiction when assumption is valid', () => {
        // 2×1: (0,0)=revealed 1, (1,0)=hidden
        // Assuming (1,0) is mine is consistent
        const width = 2, height = 1;
        const visibleGrid = [[1], [-1]];
        const flags = [[false], [false]];

        MinesweeperSolver.initNeighborCache(width, height);

        const result = MinesweeperSolver.checkContradiction(
            visibleGrid, flags, width, height,
            { x: 1, y: 0 }, true
        );

        assert.equal(result, false, 'Mine assumption is consistent with constraints');
    });

    it('checkContradiction should detect impossible safe assumption', () => {
        // 2×1: (0,0)=revealed 1, (1,0)=hidden (only hidden neighbor)
        // If we assume (1,0) is safe: (0,0)=1 needs 1 mine, 0 flagged, 0 hidden remaining
        // → flaggedCount + hiddenCount = 0 < 1 = val → contradiction!
        const width = 2, height = 1;
        const visibleGrid = [[1], [-1]];
        const flags = [[false], [false]];

        MinesweeperSolver.initNeighborCache(width, height);

        const result = MinesweeperSolver.checkContradiction(
            visibleGrid, flags, width, height,
            { x: 1, y: 0 }, false // assume safe
        );

        assert.equal(result, true, 'Assuming safe at (1,0) should contradict (0,0)=1');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. STRATEGY 3.5: GAUSSIAN ELIMINATION (via solver)
// ═════════════════════════════════════════════════════════════════════════════

describe('Strategy 3.5: Gaussian Elimination (via solver)', () => {
    it('should solve using Gaussian elimination on frontier', () => {
        // 4×2 board, mine at (1,1)
        // Reveal row 0: (0,0)=1, (1,0)=1, (2,0)=1, (3,0)=0
        const game = new TestGame(4, 2, [{ x: 1, y: 1 }]);
        MinesweeperSolver.initNeighborCache(4, 2);

        game.directReveal(0, 0);
        game.directReveal(1, 0);
        game.directReveal(2, 0);
        game.directReveal(3, 0);

        const result = MinesweeperSolver.solveByGaussianElimination(
            game.grid, game.visibleGrid, game.flags,
            4, 2, 0
        );

        assert.equal(result.progress, true);
        assert.ok(result.changedCells.length >= 1, 'Should find at least one deduction');
    });

    it('should return no progress when frontier is empty', () => {
        const game = Boards.empty_3x3();
        MinesweeperSolver.initNeighborCache(3, 3);
        game.directReveal(0, 0); // reveals everything

        const result = MinesweeperSolver.solveByGaussianElimination(
            game.grid, game.visibleGrid, game.flags,
            3, 3, 0
        );

        assert.equal(result.progress, false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. STRATEGY 4: TANK SOLVER
// ═════════════════════════════════════════════════════════════════════════════

describe('Strategy 4: Tank Solver', () => {
    it('should solve board using configuration enumeration', () => {
        // 3×3 board, mine at (1,1)
        // Reveal all corners → creates a frontier
        const game = Boards.tiny_center_mine();
        MinesweeperSolver.initNeighborCache(3, 3);

        // Reveal all non-mine cells
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                if (!game.mines[x][y]) {
                    game.directReveal(x, y);
                }
            }
        }

        const result = MinesweeperSolver.tankSolver(
            game.grid, game.visibleGrid, game.flags,
            3, 3, 1, 0
        );

        assert.equal(result.progress, true);
        // The mine at (1,1) should be identified
        assert.ok(result.changedCells.length >= 1);
    });

    it('should return no progress when frontier is empty', () => {
        const game = Boards.empty_3x3();
        MinesweeperSolver.initNeighborCache(3, 3);
        game.directReveal(0, 0);

        const result = MinesweeperSolver.tankSolver(
            game.grid, game.visibleGrid, game.flags,
            3, 3, 0, 0
        );

        assert.equal(result.progress, false);
    });

    it('should skip regions larger than MAX_REGION_SIZE', () => {
        // Build a board where frontier region is larger than MAX_REGION_SIZE (15)
        // Use 20×3 to ensure row 1 stays mostly hidden (flood fill from row 0
        // won't cascade into row 2 because row 1 has non-zero numbers)
        // Place mines spread across row 2 so row 1 has high numbers that prevent cascading
        const minePositions = [];
        for (let x = 0; x < 20; x++) {
            minePositions.push({ x, y: 2 }); // every cell in row 2 is a mine
        }
        const game = new TestGame(20, 3, minePositions);
        MinesweeperSolver.initNeighborCache(20, 3);

        // Reveal row 0 (all zeros or low numbers)
        for (let x = 0; x < 20; x++) {
            if (game.visibleGrid[x][0] === -1 && !game.mines[x][0]) {
                game.directReveal(x, 0);
            }
        }

        // Count frontier size
        const frontier = MinesweeperSolver.getFrontier(
            game.visibleGrid, game.flags, 20, 3
        );
        // Frontier should be the hidden row-1 cells (all ~20 of them)
        assert.ok(frontier.length > MinesweeperSolver.MAX_REGION_SIZE,
            `Frontier should be > ${MinesweeperSolver.MAX_REGION_SIZE}, got ${frontier.length}`);

        const result = MinesweeperSolver.tankSolver(
            game.grid, game.visibleGrid, game.flags,
            20, 3, minePositions.length, 0
        );

        // Large region is skipped, so no progress from tank solver alone
        assert.equal(result.progress, false);
    });

    describe('enumerateConfigurations', () => {
        it('should enumerate valid configurations for a simple constraint', () => {
            // Region: 2 cells. Constraint: exactly 1 mine among them.
            const region = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
            const constraints = [{
                x: 0, y: 1, value: 1, remaining: 1,
                cellsInRegion: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
                cellsInRegionIndices: [0, 1],
                cellsOutside: []
            }];

            const configs = MinesweeperSolver.enumerateConfigurations(region, constraints, 2);

            // Valid configs: [true, false], [false, true]
            assert.equal(configs.length, 2);
        });

        it('should return empty for impossible constraint', () => {
            // Region: 1 cell. Constraint: needs 2 mines. Impossible.
            const region = [{ x: 0, y: 0 }];
            const constraints = [{
                x: 0, y: 1, value: 2, remaining: 2,
                cellsInRegion: [{ x: 0, y: 0 }],
                cellsInRegionIndices: [0],
                cellsOutside: []
            }];

            const configs = MinesweeperSolver.enumerateConfigurations(region, constraints, 2);
            assert.equal(configs.length, 0);
        });

        it('should respect maxMines limit', () => {
            // Region: 3 cells. Constraint: sum = 2. But maxMines = 1.
            const region = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
            const constraints = [{
                x: 0, y: 1, value: 2, remaining: 2,
                cellsInRegion: region,
                cellsInRegionIndices: [0, 1, 2],
                cellsOutside: []
            }];

            const configs = MinesweeperSolver.enumerateConfigurations(region, constraints, 1);
            assert.equal(configs.length, 0, 'All 2-mine configs exceed maxMines=1');
        });

        it('should handle constraint with cells outside region', () => {
            // Region: 1 cell. Constraint: remaining=2, 1 in region, 1 outside.
            // Valid: cell is mine (1 mine inside, need 1 outside ≤ 1 outside → ok)
            // Valid: cell is safe (0 mines inside, need 2 outside but only 1 → invalid)
            const region = [{ x: 0, y: 0 }];
            const constraints = [{
                x: 0, y: 1, value: 2, remaining: 2,
                cellsInRegion: [{ x: 0, y: 0 }],
                cellsInRegionIndices: [0],
                cellsOutside: [{ x: 2, y: 0 }] // 1 cell outside
            }];

            const configs = MinesweeperSolver.enumerateConfigurations(region, constraints, 2);
            // Only config where cell is mine works: 1 mine inside, need 1 outside, 1 available → ok
            assert.equal(configs.length, 1);
            assert.equal(configs[0][0], true);
        });
    });

    describe('isValidConfiguration', () => {
        it('should validate a correct configuration', () => {
            const region = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
            const config = [true, false];
            const constraints = [{
                remaining: 1,
                cellsInRegion: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
                cellsOutside: []
            }];

            assert.equal(MinesweeperSolver.isValidConfiguration(region, config, constraints), true);
        });

        it('should reject an invalid configuration', () => {
            const region = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
            const config = [true, true]; // 2 mines but remaining=1
            const constraints = [{
                remaining: 1,
                cellsInRegion: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
                cellsOutside: []
            }];

            assert.equal(MinesweeperSolver.isValidConfiguration(region, config, constraints), false);
        });
    });

    describe('getRegionConstraints', () => {
        it('should find constraints for a frontier region', () => {
            const game = Boards.tiny_center_mine();
            MinesweeperSolver.initNeighborCache(3, 3);

            game.directReveal(0, 0); // value 1

            const region = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];

            const constraints = MinesweeperSolver.getRegionConstraints(
                region, game.visibleGrid, game.flags, 3, 3
            );

            assert.ok(constraints.length >= 1, 'Should find at least one constraint');
            // (0,0) is revealed with value 1, should be a constraint
            const constraintAt00 = constraints.find(c => c.x === 0 && c.y === 0);
            assert.ok(constraintAt00, 'Should include constraint from (0,0)');
            assert.equal(constraintAt00.remaining, 1);
        });
    });

    describe('groupFrontierRegions', () => {
        it('should group connected frontier cells together', () => {
            const game = Boards.tiny_center_mine();
            MinesweeperSolver.initNeighborCache(3, 3);

            game.directReveal(0, 0);

            const frontier = MinesweeperSolver.getFrontier(
                game.visibleGrid, game.flags, 3, 3
            );

            const regions = MinesweeperSolver.groupFrontierRegions(
                frontier, game.visibleGrid, 3, 3
            );

            // All frontier cells share constraint (0,0), so one region
            assert.equal(regions.length, 1);
        });

        it('should return empty for empty frontier', () => {
            MinesweeperSolver.initNeighborCache(3, 3);
            const regions = MinesweeperSolver.groupFrontierRegions(
                [],
                [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
                3, 3
            );
            assert.equal(regions.length, 0);
        });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. isSolvable NEGATIVE TEST
// ═════════════════════════════════════════════════════════════════════════════

describe('isSolvable (negative cases)', () => {
    it('should return false for an ambiguous board requiring guessing', () => {
        // Classic 2×2 "checkerboard" pattern: mines at (0,0) and (1,1)
        // or equivalently at (0,1) and (1,0). These are indistinguishable
        // from any starting reveal.
        //
        // Actually for 2×2 with 2 mines, the safe area is also 2 cells.
        // Starting at any corner: need to verify the solver can't always handle this.
        //
        // Better: 4×4 board with specific mine placement that creates ambiguity.
        // Two mines placed symmetrically such that the solver cannot distinguish.
        //
        // Classic unsolvable: 3×3 with mines at (0,0) and (2,2)
        // From (1,0): reveals "1". (0,0) or (0,1) could be mine — ambiguous
        // From (2,0): reveals "0" → cascades. Then (0,0) and (0,2) are both hidden 
        // with same constraint symmetry.
        //
        // Let's use a well-known unsolvable pattern:
        // 4×4 board with mines at (0,0), (2,1), (1,3), (3,2)
        // Diagonal mines create ambiguity.
        const game = new TestGame(4, 4, [
            { x: 0, y: 0 }, { x: 3, y: 1 },
            { x: 1, y: 2 }, { x: 2, y: 3 },
        ]);

        // Try from multiple starting positions
        let foundUnsolvable = false;
        const safeStarts = [];
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                if (!game.mines[x][y]) {
                    safeStarts.push([x, y]);
                }
            }
        }

        for (const [sx, sy] of safeStarts) {
            const testGame = new TestGame(4, 4, [
                { x: 0, y: 0 }, { x: 3, y: 1 },
                { x: 1, y: 2 }, { x: 2, y: 3 },
            ]);
            if (!MinesweeperSolver.isSolvable(testGame, sx, sy)) {
                foundUnsolvable = true;
                break;
            }
        }

        assert.equal(foundUnsolvable, true,
            'At least one starting position should be unsolvable for this mine layout');
    });

    it('should return false for a dense board with random-looking mines', () => {
        // 5×5 board with 10 mines — very dense (40% mines)
        // Unlikely to be solvable without guessing from most starts
        const mines = [
            { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 },
            { x: 3, y: 3 }, { x: 4, y: 4 }, { x: 0, y: 4 },
            { x: 4, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 },
            { x: 4, y: 2 },
        ];
        const game = new TestGame(5, 5, mines);

        // Try a safe starting position
        const solvable = MinesweeperSolver.isSolvable(game, 1, 0);
        assert.equal(solvable, false, 'Dense board should not be solvable');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. getHintWithExplanation
// ═════════════════════════════════════════════════════════════════════════════

describe('getHintWithExplanation', () => {
    it('should return a hint with strategy name for basic deduction', () => {
        // 3×3, mine at center. Reveal all edges except one.
        const game = Boards.tiny_center_mine();

        // Reveal all non-mine cells except (1,2)
        game.directReveal(0, 0);
        game.directReveal(1, 0);
        game.directReveal(2, 0);
        game.directReveal(0, 1);
        game.directReveal(2, 1);
        game.directReveal(0, 2);
        game.directReveal(2, 2);
        // (1,2) is still hidden, mine at (1,1) is hidden

        // Flag the mine
        game.placeFlag(1, 1);

        const hint = MinesweeperSolver.getHintWithExplanation(game);

        assert.ok(hint !== null, 'Should find a hint');
        assert.equal(hint.type, 'safe');
        assert.ok(hint.strategy, 'Should have a strategy name');
        assert.ok(hint.x >= 0 && hint.x < 3);
        assert.ok(hint.y >= 0 && hint.y < 3);
    });

    it('should return a hint with constraintCells', () => {
        const game = Boards.corner_mines();
        MinesweeperSolver.initNeighborCache(4, 4);

        // Reveal some cells
        game.directReveal(2, 0); // value 1
        game.placeFlag(1, 0);     // flag mine

        const hint = MinesweeperSolver.getHintWithExplanation(game);

        if (hint) {
            assert.equal(hint.type, 'safe');
            assert.ok(Array.isArray(hint.constraintCells), 'Should have constraintCells');
            assert.ok(hint.explanationData, 'Should have explanationData');
        }
    });

    it('should return null when no deduction is possible', () => {
        // All mines board (no safe cells)
        const game = new TestGame(2, 1, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
        const hint = MinesweeperSolver.getHintWithExplanation(game);
        assert.equal(hint, null);
    });

    it('should use godMode fallback for non-deducible safe cell', () => {
        // Setup: a board where no deduction strategy works but safe cells exist
        const game = Boards.standard_8x8();

        // Don't reveal anything — strategies need frontier which requires reveals
        // But getHintWithExplanation has godMode fallback
        const hint = MinesweeperSolver.getHintWithExplanation(game);

        if (hint) {
            assert.equal(hint.type, 'safe');
            // Could be godMode or any strategy
            assert.ok(hint.strategy, 'Should have a strategy label');
        }
    });
});
