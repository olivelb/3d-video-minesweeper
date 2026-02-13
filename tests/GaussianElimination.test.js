/**
 * GaussianElimination.test.js — Comprehensive tests for GaussianElimination.
 *
 * Covers: isSafeInList, isMineInList, computeRREF, solveComponent,
 *         solveLargeComponent, getConnectedComponentsOptimized, solve (integration).
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GaussianElimination } from '../shared/GaussianElimination.js';
import { MinesweeperSolver } from '../shared/MinesweeperSolver.js';

// ═════════════════════════════════════════════════════════════════════════════
// 1. UTILITY METHODS
// ═════════════════════════════════════════════════════════════════════════════

describe('GaussianElimination', () => {

    describe('Utility Methods', () => {
        it('should correctly identify if a cell is in the safe list', () => {
            const list = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
            assert.equal(GaussianElimination.isSafeInList(list, { x: 1, y: 1 }), true);
            assert.equal(GaussianElimination.isSafeInList(list, { x: 3, y: 3 }), false);
            assert.equal(GaussianElimination.isSafeInList(list, { x: 2, y: 2 }), true);
        });

        it('should correctly identify if a cell is in the mine list', () => {
            const list = [{ x: 0, y: 5 }, { x: 10, y: 10 }];
            assert.equal(GaussianElimination.isMineInList(list, { x: 0, y: 5 }), true);
            assert.equal(GaussianElimination.isMineInList(list, { x: 0, y: 0 }), false);
        });

        it('should return false for empty lists', () => {
            assert.equal(GaussianElimination.isSafeInList([], { x: 0, y: 0 }), false);
            assert.equal(GaussianElimination.isMineInList([], { x: 0, y: 0 }), false);
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 2. computeRREF
    // ═════════════════════════════════════════════════════════════════════

    describe('computeRREF', () => {
        it('should reduce identity system to RREF', () => {
            // System: x0 = 1, x1 = 0
            const matrix = [
                new Float32Array([1, 0, 1]),
                new Float32Array([0, 1, 0]),
            ];
            GaussianElimination.computeRREF(matrix, 2, 2);

            assert.ok(Math.abs(matrix[0][0] - 1) < 0.001);
            assert.ok(Math.abs(matrix[0][1] - 0) < 0.001);
            assert.ok(Math.abs(matrix[0][2] - 1) < 0.001);
            assert.ok(Math.abs(matrix[1][0] - 0) < 0.001);
            assert.ok(Math.abs(matrix[1][1] - 1) < 0.001);
            assert.ok(Math.abs(matrix[1][2] - 0) < 0.001);
        });

        it('should reduce a simple 2-variable system', () => {
            // x0 + x1 = 1, x0 = 1
            // Expected RREF: x0 = 1, x1 = 0
            const matrix = [
                new Float32Array([1, 1, 1]),
                new Float32Array([1, 0, 1]),
            ];
            GaussianElimination.computeRREF(matrix, 2, 2);

            assert.ok(Math.abs(matrix[0][0] - 1) < 0.001);
            assert.ok(Math.abs(matrix[0][2] - 1) < 0.001);
            assert.ok(Math.abs(matrix[1][1] - 1) < 0.001);
            assert.ok(Math.abs(matrix[1][2] - 0) < 0.001);
        });

        it('should handle underdetermined system (more vars than equations)', () => {
            // x0 + x1 + x2 = 1 (one equation, three unknowns)
            const matrix = [
                new Float32Array([1, 1, 1, 1]),
            ];
            GaussianElimination.computeRREF(matrix, 1, 3);

            assert.ok(Math.abs(matrix[0][0] - 1) < 0.001);
            assert.ok(Math.abs(matrix[0][3] - 1) < 0.001);
        });

        it('should handle overdetermined consistent system', () => {
            // x0 = 1, x0 = 1 (redundant)
            const matrix = [
                new Float32Array([1, 1]),
                new Float32Array([1, 1]),
            ];
            GaussianElimination.computeRREF(matrix, 2, 1);

            assert.ok(Math.abs(matrix[0][0] - 1) < 0.001);
            assert.ok(Math.abs(matrix[0][1] - 1) < 0.001);
            // Second row should be zeroed out
            assert.ok(Math.abs(matrix[1][0]) < 0.001);
            assert.ok(Math.abs(matrix[1][1]) < 0.001);
        });

        it('should handle row swapping during elimination', () => {
            // First row starts with 0, requires swap
            // 0*x0 + 1*x1 = 1
            // 1*x0 + 1*x1 = 1
            // RREF: x0 = 0, x1 = 1
            const matrix = [
                new Float32Array([0, 1, 1]),
                new Float32Array([1, 1, 1]),
            ];
            GaussianElimination.computeRREF(matrix, 2, 2);

            assert.ok(Math.abs(matrix[0][0] - 1) < 0.001);
            assert.ok(Math.abs(matrix[0][2] - 0) < 0.001, `Expected x0 = 0, got ${matrix[0][2]}`);
            assert.ok(Math.abs(matrix[1][1] - 1) < 0.001);
            assert.ok(Math.abs(matrix[1][2] - 1) < 0.001, `Expected x1 = 1, got ${matrix[1][2]}`);
        });

        it('should produce difference rows useful for subset deduction', () => {
            // x0 + x1 = 1
            // x0 + x1 + x2 = 1
            // RREF should yield: x0 + x1 = 1, x2 = 0
            const matrix = [
                new Float32Array([1, 1, 0, 1]),
                new Float32Array([1, 1, 1, 1]),
            ];
            GaussianElimination.computeRREF(matrix, 2, 3);

            assert.ok(Math.abs(matrix[1][2] - 1) < 0.001);
            assert.ok(Math.abs(matrix[1][3] - 0) < 0.001);
        });

        it('should handle 3×3 system with unique solution', () => {
            // x0 + x1 = 1
            // x1 + x2 = 1
            // x0 + x2 = 0
            // Solution: x0 = 0, x1 = 1, x2 = 0
            const matrix = [
                new Float32Array([1, 1, 0, 1]),
                new Float32Array([0, 1, 1, 1]),
                new Float32Array([1, 0, 1, 0]),
            ];
            GaussianElimination.computeRREF(matrix, 3, 3);

            assert.ok(Math.abs(matrix[0][3] - 0) < 0.001, `x0 should be 0, got ${matrix[0][3]}`);
            assert.ok(Math.abs(matrix[1][3] - 1) < 0.001, `x1 should be 1, got ${matrix[1][3]}`);
            assert.ok(Math.abs(matrix[2][3] - 0) < 0.001, `x2 should be 0, got ${matrix[2][3]}`);
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 3. solveComponent
    // ═════════════════════════════════════════════════════════════════════

    describe('solveComponent', () => {
        it('should identify a definite mine from a single equation', () => {
            // 3×1 board: revealed "1" at (0,0), hidden (1,0)
            // (0,0) neighbors in 3×1: only (1,0)
            // Equation: x(1,0) = 1 → mine
            const width = 3, height = 1;
            const visibleGrid = [[1], [-1], [0]];
            const flags = [[false], [false], [false]];
            const component = [{ x: 1, y: 0 }];

            MinesweeperSolver.initNeighborCache(width, height);
            const result = GaussianElimination.solveComponent(
                MinesweeperSolver, visibleGrid, flags, component, width, height
            );

            assert.equal(result.progress, true);
            assert.equal(result.mines.length, 1);
            assert.deepEqual(result.mines[0], { x: 1, y: 0 });
        });

        it('should identify safe cells when mine count is satisfied', () => {
            // 3×3: revealed (0,0)=1, (1,0)=1, flag at (0,1)
            // Hidden (1,1) adjacent to both "1"s, both have 1 flag already
            // → (1,1) must be safe
            const width = 3, height = 3;
            const visibleGrid = [
                [1, -1, -1],
                [1, -1, -1],
                [-1, -1, -1],
            ];
            const flags = [
                [false, true, false],
                [false, false, false],
                [false, false, false],
            ];
            const component = [{ x: 1, y: 1 }];

            MinesweeperSolver.initNeighborCache(width, height);
            const result = GaussianElimination.solveComponent(
                MinesweeperSolver, visibleGrid, flags, component, width, height
            );

            assert.equal(result.progress, true);
            assert.equal(result.safe.length, 1);
            assert.deepEqual(result.safe[0], { x: 1, y: 1 });
        });

        it('should return no progress for underdetermined system', () => {
            // 3×3, revealed (1,1)=1
            // 8 hidden neighbors, 1 equation → can't deduce anything
            const width = 3, height = 3;
            const visibleGrid = [
                [-1, -1, -1],
                [-1, 1, -1],
                [-1, -1, -1],
            ];
            const flags = Array(3).fill(null).map(() => [false, false, false]);
            const component = [
                { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
                { x: 0, y: 1 }, { x: 2, y: 1 },
                { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
            ];

            MinesweeperSolver.initNeighborCache(width, height);
            const result = GaussianElimination.solveComponent(
                MinesweeperSolver, visibleGrid, flags, component, width, height
            );

            assert.equal(result.progress, false);
        });

        it('should handle empty component', () => {
            MinesweeperSolver.initNeighborCache(3, 3);
            const result = GaussianElimination.solveComponent(
                MinesweeperSolver,
                [[-1, -1, -1], [-1, -1, -1], [-1, -1, -1]],
                [[false, false, false], [false, false, false], [false, false, false]],
                [],
                3, 3
            );
            assert.equal(result.progress, false);
        });

        it('should solve a 2-variable system with 2 independent equations', () => {
            // 4×1 board: revealed (0,0)=1, revealed (3,0)=1
            // Hidden: (1,0), (2,0)
            // Equation from (0,0): x(1,0) = 1
            // Equation from (3,0): x(2,0) = 1
            // → Both are mines
            const width = 4, height = 1;
            const visibleGrid = [[1], [-1], [-1], [1]];
            const flags = [[false], [false], [false], [false]];
            const component = [{ x: 1, y: 0 }, { x: 2, y: 0 }];

            MinesweeperSolver.initNeighborCache(width, height);
            const result = GaussianElimination.solveComponent(
                MinesweeperSolver, visibleGrid, flags, component, width, height
            );

            assert.equal(result.progress, true);
            assert.equal(result.mines.length, 2);
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 4. getConnectedComponentsOptimized
    // ═════════════════════════════════════════════════════════════════════

    describe('getConnectedComponentsOptimized', () => {
        it('should group adjacent frontier cells into one component', () => {
            // 5×3: All of row 0 revealed with numbers, hidden cells in row 1
            // The frontier cells share constraints (same numbered cell neighbors)
            // Setup: use a real game for correct neighbor relationships
            const width = 5, height = 3;
            const visibleGrid = [
                [0, -1, -1],
                [1, -1, -1],
                [1, -1, -1],
                [1, -1, -1],
                [0, -1, -1],
            ];

            MinesweeperSolver.initNeighborCache(width, height);
            // Frontier: (1,1) and (2,1) are both neighbors of clue (1,0) and (2,0)
            const frontier = [{ x: 1, y: 1 }, { x: 2, y: 1 }];

            const components = GaussianElimination.getConnectedComponentsOptimized(
                MinesweeperSolver, visibleGrid, frontier, width, height
            );

            assert.equal(components.length, 1, 'Connected frontier cells should be in one component');
            assert.equal(components[0].length, 2);
        });

        it('should split disconnected frontier cells into separate components', () => {
            // 7×1: "1" h "0" "0" "0" "1" h
            const width = 7, height = 1;
            const visibleGrid = [[1], [-1], [0], [0], [0], [1], [-1]];

            MinesweeperSolver.initNeighborCache(width, height);
            const frontier = [{ x: 1, y: 0 }, { x: 6, y: 0 }];

            const components = GaussianElimination.getConnectedComponentsOptimized(
                MinesweeperSolver, visibleGrid, frontier, width, height
            );

            assert.equal(components.length, 2);
            assert.equal(components[0].length, 1);
            assert.equal(components[1].length, 1);
        });

        it('should return empty array for empty frontier', () => {
            MinesweeperSolver.initNeighborCache(3, 3);
            const components = GaussianElimination.getConnectedComponentsOptimized(
                MinesweeperSolver,
                [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
                [],
                3, 3
            );
            assert.equal(components.length, 0);
        });

        it('should handle single cell frontier', () => {
            const width = 3, height = 1;
            const visibleGrid = [[1], [-1], [0]];

            MinesweeperSolver.initNeighborCache(width, height);
            const frontier = [{ x: 1, y: 0 }];

            const components = GaussianElimination.getConnectedComponentsOptimized(
                MinesweeperSolver, visibleGrid, frontier, width, height
            );

            assert.equal(components.length, 1);
            assert.equal(components[0].length, 1);
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 5. solveLargeComponent
    // ═════════════════════════════════════════════════════════════════════

    describe('solveLargeComponent', () => {
        it('should handle a component larger than window size', () => {
            // 10×1: "1" hidden×8 "1"
            const width = 10, height = 1;
            const visibleGrid = [[1], [-1], [-1], [-1], [-1], [-1], [-1], [-1], [-1], [1]];
            const flags = Array(10).fill(null).map(() => [false]);

            const bigComponent = [];
            for (let x = 1; x <= 8; x++) bigComponent.push({ x, y: 0 });

            MinesweeperSolver.initNeighborCache(width, height);

            const result = GaussianElimination.solveLargeComponent(
                MinesweeperSolver, visibleGrid, flags, bigComponent, 4, width, height
            );

            assert.equal(result.progress, true);
            assert.ok(result.mines.length >= 1, 'Should find at least one mine');
        });

        it('should deduplicate results from overlapping windows', () => {
            const width = 8, height = 1;
            const visibleGrid = [[1], [-1], [-1], [-1], [-1], [-1], [-1], [1]];
            const flags = Array(8).fill(null).map(() => [false]);

            const bigComponent = [];
            for (let x = 1; x <= 6; x++) bigComponent.push({ x, y: 0 });

            MinesweeperSolver.initNeighborCache(width, height);

            const result = GaussianElimination.solveLargeComponent(
                MinesweeperSolver, visibleGrid, flags, bigComponent, 3, width, height
            );

            const mineKeys = result.mines.map(c => `${c.x},${c.y}`);
            assert.equal(mineKeys.length, new Set(mineKeys).size, 'No duplicate mines');
            const safeKeys = result.safe.map(c => `${c.x},${c.y}`);
            assert.equal(safeKeys.length, new Set(safeKeys).size, 'No duplicate safes');
        });
    });

    // ═════════════════════════════════════════════════════════════════════
    // 6. solve (integration)
    // ═════════════════════════════════════════════════════════════════════

    describe('solve (integration)', () => {
        it('should solve a simple 1-variable equation (x0 = 1)', () => {
            const width = 2, height = 2;
            const visibleGrid = [[1, -1], [-1, -1]];
            const flags = [[false, false], [false, false]];
            const frontier = [{ x: 0, y: 1 }];

            const solverMock = {
                getCachedNeighbors: (x, y) => {
                    if (x === 0 && y === 0) return [{ x: 0, y: 1 }];
                    if (x === 0 && y === 1) return [{ x: 0, y: 0 }];
                    return [];
                }
            };

            const result = GaussianElimination.solve(solverMock, visibleGrid, flags, frontier);

            assert.equal(result.progress, true);
            assert.equal(result.mines.length, 1);
            assert.deepEqual(result.mines[0], { x: 0, y: 1 });
            assert.equal(result.safe.length, 0);
        });

        it('should return no progress for empty frontier', () => {
            const result = GaussianElimination.solve(
                MinesweeperSolver, [[0]], [[false]], []
            );
            assert.equal(result.progress, false);
            assert.equal(result.safe.length, 0);
            assert.equal(result.mines.length, 0);
        });

        it('should solve a board with two separate components', () => {
            // 7×1: "1" h "0" "0" "0" "1" h
            const width = 7, height = 1;
            const visibleGrid = [[1], [-1], [0], [0], [0], [1], [-1]];
            const flags = Array(7).fill(null).map(() => [false]);

            MinesweeperSolver.initNeighborCache(width, height);

            const frontier = MinesweeperSolver.getFrontier(visibleGrid, flags, width, height);
            const result = GaussianElimination.solve(MinesweeperSolver, visibleGrid, flags, frontier);

            assert.equal(result.progress, true);
            assert.equal(result.mines.length, 2);
        });

        it('should find safe cells using constraint difference', () => {
            // 4×2 board:
            // Col 0: (0,0)=1, (0,1)=hidden
            // Col 1: (1,0)=1, (1,1)=hidden
            // Col 2: (2,0)=1, (2,1)=hidden
            // Col 3: (3,0)=0, (3,1)=hidden
            //
            // Equations (for 1D height=2 neighbors):
            // (0,0)=1: neighbors include (0,1), (1,0) [revealed], (1,1) → hidden: (0,1), (1,1)
            // (1,0)=1: neighbors include (0,0) [r], (0,1), (1,1), (2,0) [r], (2,1) → hidden: (0,1), (1,1), (2,1)
            // (2,0)=1: neighbors include (1,0) [r], (1,1), (2,1), (3,0) [r], (3,1) → hidden: (1,1), (2,1), (3,1)
            // x01 + x11 = 1
            // x01 + x11 + x21 = 1
            // x11 + x21 + x31 = 1
            // From eq1-eq2: x21 = 0 (safe)
            // From eq1: x01 + x11 = 1 (underdetermined alone)
            // From eq2-eq3: x01 - x31 = 0 → x01 = x31
            const width = 4, height = 2;
            const visibleGrid = [
                [1, -1],
                [1, -1],
                [1, -1],
                [0, -1],
            ];
            const flags = Array(4).fill(null).map(() => [false, false]);

            MinesweeperSolver.initNeighborCache(width, height);
            const frontier = MinesweeperSolver.getFrontier(visibleGrid, flags, width, height);

            const result = GaussianElimination.solve(MinesweeperSolver, visibleGrid, flags, frontier);

            assert.equal(result.progress, true);
            assert.ok(result.mines.length + result.safe.length >= 1, 'Should find at least one deduction');
        });

        it('should handle frontier with no adjacent clues gracefully', () => {
            const width = 3, height = 3;
            const visibleGrid = Array(3).fill(null).map(() => [-1, -1, -1]);
            const flags = Array(3).fill(null).map(() => [false, false, false]);
            // An orphan frontier cell with no adjacent clue
            // getFrontier would not return this, but test direct call
            const frontier = [{ x: 1, y: 1 }];

            MinesweeperSolver.initNeighborCache(width, height);
            const result = GaussianElimination.solve(MinesweeperSolver, visibleGrid, flags, frontier);

            assert.equal(result.progress, false);
        });
    });
});
