import { GaussianElimination } from './GaussianElimination.js';

/**
 * MinesweeperSolver - Deterministic solving algorithms for Minesweeper
 * 
 * This module provides logic for solving Minesweeper games without guessing,
 * enabling "No Guess" board generation and intelligent hint systems.
 * 
 * ## Architecture Overview
 * 
 * The solver uses a **multi-strategy approach** with 5 deduction strategies,
 * ordered from fastest to most computationally expensive:
 * 
 * 1. **Basic Rules** - Fast O(n) counting rules for obvious deductions
 * 2. **Subset Logic** - Set-based constraint propagation for overlapping regions
 * 3. **Proof by Contradiction** - Hypothesis testing to rule out possibilities
 * 4. **Tank Solver** - Complete enumeration of valid mine configurations
 * 5. **Global Mine Count** - End-game deduction using total mine count
 * 
 * ## Performance Optimizations
 * 
 * - **Neighbor Cache**: Pre-computed neighbor lists avoid allocation on every query
 * - **Dirty Cell Tracking**: Only re-evaluate cells that may have changed
 * - **Bit-packed Keys**: Cell coordinates packed into single integers for Set operations
 * - **Region Limiting**: Tank solver limited to small regions to avoid exponential blowup
 * 
 * ## Usage Examples
 * 
 * ```javascript
 * // Check if a board is solvable from a starting position
 * const solvable = MinesweeperSolver.isSolvable(game, startX, startY);
 * 
 * // Get a hint for the best next move
 * const hint = MinesweeperSolver.getHint(game);
 * ```
 * 
 * @module MinesweeperSolver
 * @author 3D Minesweeper Team
 */
export class MinesweeperSolver {
    /**
     * Maximum configurations to enumerate before giving up (performance limit).
     * Prevents exponential blowup on large frontier regions.
     * @type {number}
     * @constant
     */
    static MAX_CONFIGURATIONS = 50000;

    /**
     * Maximum frontier region size for tank solver.
     * Regions larger than this are skipped to maintain performance.
     * @type {number}
     * @constant
     */
    static MAX_REGION_SIZE = 15;

    /**
     * Pre-computed neighbor cache for O(1) neighbor lookups.
     * Structure: neighborCache[x][y] = [{x, y}, ...]
     * @type {Array<Array<Array<{x: number, y: number}>>>|null}
     * @private
     */
    static neighborCache = null;

    /**
     * Width of the currently cached grid.
     * @type {number}
     * @private
     */
    static cacheWidth = 0;

    /**
     * Height of the currently cached grid.
     * @type {number}
     * @private
     */
    static cacheHeight = 0;

    /**
     * Initialize or retrieve the neighbor cache for given dimensions.
     * 
     * This optimization avoids creating new arrays on every getNeighbors() call,
     * significantly improving performance for repeated neighbor lookups.
     * The cache is invalidated and rebuilt when grid dimensions change.
     * 
     * @param {number} width - Grid width in cells
     * @param {number} height - Grid height in cells
     * @returns {Array<Array<Array<{x: number, y: number}>>>} The neighbor cache array
     */
    static initNeighborCache(width, height) {
        if (this.neighborCache && this.cacheWidth === width && this.cacheHeight === height) {
            return this.neighborCache;
        }

        this.neighborCache = new Array(width);
        for (let x = 0; x < width; x++) {
            this.neighborCache[x] = new Array(height);
            for (let y = 0; y < height; y++) {
                const neighbors = [];
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            neighbors.push({ x: nx, y: ny });
                        }
                    }
                }
                this.neighborCache[x][y] = neighbors;
            }
        }
        this.cacheWidth = width;
        this.cacheHeight = height;
        return this.neighborCache;
    }

    /**
     * Get cached neighbors for a cell - O(1) lookup instead of O(8) array creation.
     * 
     * @param {number} x - Cell X coordinate
     * @param {number} y - Cell Y coordinate
     * @returns {Array<{x: number, y: number}>} Array of neighboring cell coordinates
     */
    static getCachedNeighbors(x, y) {
        return this.neighborCache[x][y];
    }

    /**
     * Create a cell key for Set operations using bit-packing for performance.
     * 
     * Combines x and y coordinates into a single 32-bit integer,
     * enabling faster Set/Map operations compared to string keys.
     * 
     * @param {number} x - Cell X coordinate (must fit in 16 bits)
     * @param {number} y - Cell Y coordinate (must fit in 16 bits)
     * @returns {number} Bit-packed cell key
     */
    static cellKey(x, y) {
        return (x << 16) | y;
    }

    /**
     * Decode a cell key back to x,y coordinates.
     * 
     * @param {number} key - Bit-packed cell key
     * @returns {{x: number, y: number}} Cell coordinates
     */
    static decodeKey(key) {
        return { x: key >> 16, y: key & 0xFFFF };
    }

    /**
     * Checks if a board is solvable from a starting point without guessing.
     * 
     * This is the main entry point for the "No Guess" mode board validation.
     * Uses multiple deduction strategies in order of computational cost:
     * 
     * 1. **Basic Rules**: Fast counting-based deductions
     * 2. **Subset Logic**: Set intersection/difference analysis
     * 3. **Proof by Contradiction**: Hypothesis testing
     * 4. **Tank Solver**: Complete configuration enumeration
     * 5. **Global Mine Count**: End-game deduction
     * 
     * The algorithm simulates revealing the starting cell and its 3x3 neighborhood,
     * then iteratively applies strategies until no more progress can be made.
     * 
     * @param {Object} game - Game state object containing grid, dimensions, and bomb count
     * @param {number} startX - X coordinate of starting cell
     * @param {number} startY - Y coordinate of starting cell
     * @returns {boolean} True if the board can be solved without guessing
     */
    static isSolvable(game, startX, startY) {
        const grid = game.grid;
        const width = game.width;
        const height = game.height;
        const bombCount = game.bombCount;

        // Initialize neighbor cache once per grid size
        this.initNeighborCache(width, height);

        const visibleGrid = Array(width).fill().map(() => Array(height).fill(-1));
        const flags = Array(width).fill().map(() => Array(height).fill(false));

        // Track flag count incrementally instead of counting each time
        let flagCount = 0;

        // Start by revealing the first cell and its neighbors (the 3x3 safe zone)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                this.simulateReveal(grid, visibleGrid, flags, width, height, startX + dx, startY + dy);
            }
        }

        let progress = true;
        let iterations = 0;
        const maxIterations = width * height * 2;

        // Track dirty cells - cells that may have changed and need re-evaluation
        let dirtyCells = new Set();
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (visibleGrid[x][y] !== -1) {
                    dirtyCells.add(this.cellKey(x, y));
                    for (const n of this.getCachedNeighbors(x, y)) {
                        dirtyCells.add(this.cellKey(n.x, n.y));
                    }
                }
            }
        }

        while (progress && iterations < maxIterations) {
            progress = false;
            iterations++;

            // Strategy 1: Basic counting rules (fast, run first)
            const basicResult = this.applyBasicRules(grid, visibleGrid, flags, width, height, dirtyCells, flagCount);
            if (basicResult.progress) {
                progress = true;
                flagCount = basicResult.flagCount;
                dirtyCells = basicResult.dirtyCells;
                continue;
            }

            // Strategy 2: Subset logic (moderately expensive)
            const subsetResult = this.applySubsetLogic(grid, visibleGrid, flags, width, height, dirtyCells, flagCount);
            if (subsetResult.progress) {
                progress = true;
                flagCount = subsetResult.flagCount;
                dirtyCells = subsetResult.dirtyCells;
                continue;
            }

            // Strategy 3: Gaussian Elimination (Matrix Solver) - MOVED UP
            // Solves complex coupled systems that subset logic misses. Run before expensive contradiction checks.
            const gaussianResult = this.solveByGaussianElimination(grid, visibleGrid, flags, width, height, flagCount);
            if (gaussianResult.progress) {
                progress = true;
                flagCount = gaussianResult.flagCount;
                for (const cell of gaussianResult.changedCells || []) {
                    dirtyCells.add(this.cellKey(cell.x, cell.y));
                    for (const n of this.getCachedNeighbors(cell.x, cell.y)) {
                        dirtyCells.add(this.cellKey(n.x, n.y));
                    }
                }
                continue;
            }

            // Strategy 4: Proof by contradiction (expensive - limit frontier size)
            const contradictionResult = this.solveByContradiction(grid, visibleGrid, flags, width, height, flagCount);
            if (contradictionResult.progress) {
                progress = true;
                flagCount = contradictionResult.flagCount;
                if (contradictionResult.changedCell) {
                    const cc = contradictionResult.changedCell;
                    dirtyCells.add(this.cellKey(cc.x, cc.y));
                    for (const n of this.getCachedNeighbors(cc.x, cc.y)) {
                        dirtyCells.add(this.cellKey(n.x, n.y));
                    }
                }
                continue;
            }


            // Strategy 5: Tank Solver (very expensive - use sparingly)
            const tankResult = this.tankSolver(grid, visibleGrid, flags, width, height, bombCount, flagCount);
            if (tankResult.progress) {
                progress = true;
                flagCount = tankResult.flagCount;
                for (const cell of tankResult.changedCells || []) {
                    dirtyCells.add(this.cellKey(cell.x, cell.y));
                    for (const n of this.getCachedNeighbors(cell.x, cell.y)) {
                        dirtyCells.add(this.cellKey(n.x, n.y));
                    }
                }
                continue;
            }

            // Strategy 6: Global mine counting
            const globalResult = this.applyGlobalMineCount(grid, visibleGrid, flags, width, height, bombCount, flagCount);
            if (globalResult.progress) {
                progress = true;
                flagCount = globalResult.flagCount;
                continue;
            }
        }

        // Check if all non-mine cells are revealed
        let revealedCount = 0;
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (visibleGrid[x][y] !== -1) revealedCount++;
            }
        }

        return revealedCount === (width * height - bombCount);
    }

    /**
     * Strategy 1: Basic counting rules - Fast deduction using mine counts.
     * 
     * ## Algorithm
     * For each revealed numbered cell:
     * - If `number == flaggedNeighbors + hiddenNeighbors`, all hidden are mines
     * - If `number == flaggedNeighbors`, all hidden are safe
     * 
     * ## Optimization
     * Only processes "dirty" cells that may have changed since last iteration,
     * using cached neighbors for O(1) lookups.
     * 
     * @param {Array<Array<number>>} grid - The actual grid values (with mine positions)
     * @param {Array<Array<number>>} visibleGrid - What the player can see (-1 = hidden)
     * @param {Array<Array<boolean>>} flags - Flag placement state
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @param {Set<number>} dirtyCells - Set of cell keys that need re-evaluation
     * @param {number} flagCount - Current number of flags placed
     * @returns {{progress: boolean, flagCount: number, dirtyCells: Set<number>}} Result object
     */
    static applyBasicRules(grid, visibleGrid, flags, width, height, dirtyCells, flagCount) {
        let progress = false;
        const newDirtyCells = new Set();
        const processedCells = new Set();

        for (const key of dirtyCells) {
            const { x, y } = this.decodeKey(key);
            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            const val = visibleGrid[x][y];
            if (val <= 0) continue;
            if (processedCells.has(key)) continue;
            processedCells.add(key);

            const neighbors = this.getCachedNeighbors(x, y);
            let hiddenCount = 0;
            let flaggedCount = 0;
            const hiddenCells = [];

            for (const n of neighbors) {
                if (flags[n.x][n.y]) {
                    flaggedCount++;
                } else if (visibleGrid[n.x][n.y] === -1) {
                    hiddenCount++;
                    hiddenCells.push(n);
                }
            }

            if (hiddenCount === 0) continue;

            if (val === hiddenCount + flaggedCount) {
                for (const n of hiddenCells) {
                    if (!flags[n.x][n.y]) {
                        flags[n.x][n.y] = true;
                        flagCount++;
                        for (const nn of this.getCachedNeighbors(n.x, n.y)) {
                            newDirtyCells.add(this.cellKey(nn.x, nn.y));
                        }
                    }
                }
                progress = true;
            } else if (val === flaggedCount) {
                for (const n of hiddenCells) {
                    this.simulateReveal(grid, visibleGrid, flags, width, height, n.x, n.y);
                    for (const nn of this.getCachedNeighbors(n.x, n.y)) {
                        newDirtyCells.add(this.cellKey(nn.x, nn.y));
                    }
                }
                progress = true;
            }
        }

        return { progress, flagCount, dirtyCells: progress ? newDirtyCells : dirtyCells };
    }

    /**
     * Strategy 2: Subset logic using constraint propagation.
     * 
     * ## Algorithm
     * Compares pairs of numbered cells to find subset relationships:
     * - If cell A's hidden neighbors ⊂ cell B's hidden neighbors
     * - Then we can deduce information about B's exclusive cells
     * 
     * For example:
     * - Cell A needs 2 mines among {C1, C2}
     * - Cell B needs 3 mines among {C1, C2, C3}
     * - Since A ⊂ B, C3 must have exactly (3-2)=1 mine → C3 is a mine
     * 
     * ## Optimization
     * Uses Set operations for O(1) membership tests and only checks
     * cells within a 5x5 region of each constraint cell.
     * 
     * @param {Array<Array<number>>} grid - The actual grid values
     * @param {Array<Array<number>>} visibleGrid - Visible state (-1 = hidden)
     * @param {Array<Array<boolean>>} flags - Flag placement state
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @param {Set<number>} dirtyCells - Cells that need re-evaluation
     * @param {number} flagCount - Current flag count
     * @returns {{progress: boolean, flagCount: number, dirtyCells: Set<number>}} Result
     */
    static applySubsetLogic(grid, visibleGrid, flags, width, height, dirtyCells, flagCount) {
        let progress = false;
        const newDirtyCells = new Set();

        // Build a list of constraint cells to check (only near dirty cells)
        const constraintCells = new Set();
        for (const key of dirtyCells) {
            const { x, y } = this.decodeKey(key);
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            if (visibleGrid[x][y] > 0) {
                constraintCells.add(key);
            }
            for (const n of this.getCachedNeighbors(x, y)) {
                if (visibleGrid[n.x][n.y] > 0) {
                    constraintCells.add(this.cellKey(n.x, n.y));
                }
            }
        }

        // Pre-compute hidden sets for constraint cells
        const cellData = new Map();
        for (const key of constraintCells) {
            const { x, y } = this.decodeKey(key);
            const val = visibleGrid[x][y];
            if (val <= 0) continue;

            const neighbors = this.getCachedNeighbors(x, y);
            const hiddenSet = new Set();
            const hiddenList = [];
            let flaggedCount = 0;

            for (const n of neighbors) {
                if (flags[n.x][n.y]) {
                    flaggedCount++;
                } else if (visibleGrid[n.x][n.y] === -1) {
                    const nKey = this.cellKey(n.x, n.y);
                    hiddenSet.add(nKey);
                    hiddenList.push(n);
                }
            }

            if (hiddenList.length === 0) continue;
            const remaining = val - flaggedCount;
            if (remaining < 0) continue;

            cellData.set(key, { x, y, hiddenSet, hiddenList, remaining });
        }

        // Compare pairs using Set operations
        for (const [keyA, dataA] of cellData) {
            if (dataA.hiddenList.length === 0) continue;

            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = dataA.x + dx;
                    const ny = dataA.y + dy;
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                    const keyB = this.cellKey(nx, ny);
                    const dataB = cellData.get(keyB);
                    if (!dataB || dataB.hiddenList.length === 0) continue;

                    // Check if A ⊂ B using Set operations
                    if (dataA.hiddenSet.size < dataB.hiddenSet.size) {
                        let isSubset = true;
                        for (const k of dataA.hiddenSet) {
                            if (!dataB.hiddenSet.has(k)) {
                                isSubset = false;
                                break;
                            }
                        }

                        if (isSubset) {
                            const diff = [];
                            for (const n of dataB.hiddenList) {
                                if (!dataA.hiddenSet.has(this.cellKey(n.x, n.y))) {
                                    diff.push(n);
                                }
                            }

                            const diffMines = dataB.remaining - dataA.remaining;

                            if (diffMines === 0 && diff.length > 0) {
                                for (const n of diff) {
                                    this.simulateReveal(grid, visibleGrid, flags, width, height, n.x, n.y);
                                    for (const nn of this.getCachedNeighbors(n.x, n.y)) {
                                        newDirtyCells.add(this.cellKey(nn.x, nn.y));
                                    }
                                }
                                progress = true;
                            } else if (diffMines === diff.length && diff.length > 0) {
                                for (const n of diff) {
                                    if (!flags[n.x][n.y]) {
                                        flags[n.x][n.y] = true;
                                        flagCount++;
                                        for (const nn of this.getCachedNeighbors(n.x, n.y)) {
                                            newDirtyCells.add(this.cellKey(nn.x, nn.y));
                                        }
                                    }
                                }
                                progress = true;
                            }

                            if (progress) {
                                return { progress, flagCount, dirtyCells: newDirtyCells };
                            }
                        }
                    }
                }
            }
        }

        return { progress, flagCount, dirtyCells };
    }

    /**
     * Strategy 3: Proof by contradiction - Hypothesis testing.
     * 
     * ## Algorithm
     * For each frontier cell (hidden cell adjacent to revealed numbers):
     * 1. Assume the cell IS a mine → propagate consequences
     * 2. If contradiction found → cell must be SAFE
     * 3. Assume the cell is NOT a mine → propagate consequences
     * 4. If contradiction found → cell must be a MINE
     * 
     * A contradiction occurs when:
     * - A numbered cell has more flagged neighbors than its value
     * - A numbered cell cannot possibly satisfy its constraint
     * 
     * ## Optimization
     * Limits frontier processing to 50 cells to avoid exponential blowup.
     * Uses sparse representation for simulated state changes.
     * 
     * @param {Array<Array<number>>} grid - The actual grid values
     * @param {Array<Array<number>>} visibleGrid - Visible state
     * @param {Array<Array<boolean>>} flags - Flag placement state
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @param {number} flagCount - Current flag count
     * @returns {{progress: boolean, flagCount: number, changedCell: Object|null}} Result
     */
    static solveByContradiction(grid, visibleGrid, flags, width, height, flagCount) {
        const frontier = this.getFrontier(visibleGrid, flags, width, height);

        // Limit frontier processing to avoid exponential blowup at game start
        const maxFrontierToCheck = Math.min(frontier.length, 50);

        for (let i = 0; i < maxFrontierToCheck; i++) {
            const cell = frontier[i];

            if (this.checkContradiction(visibleGrid, flags, width, height, cell, true)) {
                this.simulateReveal(grid, visibleGrid, flags, width, height, cell.x, cell.y);
                return { progress: true, flagCount, changedCell: cell };
            }

            if (this.checkContradiction(visibleGrid, flags, width, height, cell, false)) {
                flags[cell.x][cell.y] = true;
                return { progress: true, flagCount: flagCount + 1, changedCell: cell };
            }
        }
        return { progress: false, flagCount, changedCell: null };
    }

    /**
     * Faster contradiction check with localized propagation using sparse representation.
     * 
     * Simulates the consequences of assuming a cell is/isn't a mine,
     * looking for logical contradictions that would invalidate the assumption.
     * 
     * @param {Array<Array<number>>} visibleGrid - Visible state
     * @param {Array<Array<boolean>>} flags - Flag placement state
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @param {{x: number, y: number}} assumptionCell - Cell to test
     * @param {boolean} assumeMine - True to test "cell is mine", false for "cell is safe"
     * @returns {boolean} True if the assumption leads to a contradiction
     * @private
     */
    static checkContradiction(visibleGrid, flags, width, height, assumptionCell, assumeMine) {
        const simFlags = new Map();
        const simRevealed = new Map();

        const getFlag = (x, y) => {
            const k = this.cellKey(x, y);
            return simFlags.has(k) ? simFlags.get(k) : flags[x][y];
        };
        const setFlag = (x, y) => simFlags.set(this.cellKey(x, y), true);
        const isAssumedSafe = (x, y) => simRevealed.has(this.cellKey(x, y));
        const setAssumedSafe = (x, y) => simRevealed.set(this.cellKey(x, y), true);

        if (assumeMine) {
            setFlag(assumptionCell.x, assumptionCell.y);
        } else {
            setAssumedSafe(assumptionCell.x, assumptionCell.y);
        }

        let changed = true;
        let iterations = 0;
        const maxIterations = 20;

        const toCheck = new Set();
        for (const n of this.getCachedNeighbors(assumptionCell.x, assumptionCell.y)) {
            toCheck.add(this.cellKey(n.x, n.y));
        }

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            const currentCheck = [...toCheck];
            toCheck.clear();

            for (const key of currentCheck) {
                const { x, y } = this.decodeKey(key);
                const val = visibleGrid[x][y];
                if (val <= 0) continue;

                const neighbors = this.getCachedNeighbors(x, y);
                let hiddenCount = 0;
                let flaggedCount = 0;
                const hiddenCells = [];

                for (const n of neighbors) {
                    if (getFlag(n.x, n.y)) {
                        flaggedCount++;
                    } else if (visibleGrid[n.x][n.y] === -1 && !isAssumedSafe(n.x, n.y)) {
                        hiddenCount++;
                        hiddenCells.push(n);
                    }
                }

                if (flaggedCount > val) return true;
                if (flaggedCount + hiddenCount < val) return true;

                if (hiddenCount > 0) {
                    if (flaggedCount === val) {
                        for (const n of hiddenCells) {
                            if (!isAssumedSafe(n.x, n.y)) {
                                setAssumedSafe(n.x, n.y);
                                changed = true;
                                for (const nn of this.getCachedNeighbors(n.x, n.y)) {
                                    toCheck.add(this.cellKey(nn.x, nn.y));
                                }
                            }
                        }
                    } else if (flaggedCount + hiddenCount === val) {
                        for (const n of hiddenCells) {
                            if (!getFlag(n.x, n.y)) {
                                setFlag(n.x, n.y);
                                changed = true;
                                for (const nn of this.getCachedNeighbors(n.x, n.y)) {
                                    toCheck.add(this.cellKey(nn.x, nn.y));
                                }
                            }
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * Strategy 3.5: Gaussian Elimination - Matrix based solving.
     * 
     * Uses the GaussianElimination helper to solve the frontier as a system of linear equations.
     * Ax = b, where x are hidden cells (0/1), A is connectivity, b is effective clues.
     * 
     * @param {Array<Array<number>>} grid - The actual grid
     * @param {Array<Array<number>>} visibleGrid - Visible state
     * @param {Array<Array<boolean>>} flags - Flags
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @param {number} flagCount - Current flag count
     * @returns {{progress: boolean, flagCount: number, changedCells: Array}}
     */
    static solveByGaussianElimination(grid, visibleGrid, flags, width, height, flagCount) {
        // Only run if there is a frontier
        const frontier = this.getFrontier(visibleGrid, flags, width, height);
        if (frontier.length === 0) return { progress: false, flagCount, changedCells: [] };

        // Use the helper class
        const result = GaussianElimination.solve(this, visibleGrid, flags, frontier);

        let progress = false;
        const changedCells = [];

        if (result.progress) {
            progress = true;

            // Apply Mines
            for (const cell of result.mines) {
                if (!flags[cell.x][cell.y]) {
                    flags[cell.x][cell.y] = true;
                    flagCount++;
                    changedCells.push(cell);
                }
            }

            // Apply Safes
            for (const cell of result.safe) {
                if (visibleGrid[cell.x][cell.y] === -1) {
                    this.simulateReveal(grid, visibleGrid, flags, width, height, cell.x, cell.y);
                    changedCells.push(cell);
                }
            }
        }

        return { progress, flagCount, changedCells };
    }


    /**
     * Strategy 4: Tank Solver - Complete configuration enumeration.
     * 
     * ## Algorithm
     * Named after the classic Minesweeper solving algorithm:
     * 1. Identify the frontier (hidden cells adjacent to numbers)
     * 2. Group frontier into connected regions
     * 3. For each region, enumerate ALL valid mine configurations
     * 4. Analyze configurations to find cells that are ALWAYS mine or ALWAYS safe
     * 
     * ## Example
     * If a region has 3 cells and 5 valid configurations:
     * - Config 1: [mine, safe, mine]
     * - Config 2: [mine, safe, mine]
     * - Config 3: [mine, safe, mine]
     * - Config 4: [mine, safe, mine]
     * - Config 5: [mine, safe, mine]
     * Then cell 1 is definitely a mine, cell 2 is definitely safe.
     * 
     * ## Optimization
     * - Regions larger than MAX_REGION_SIZE are skipped
     * - Uses bit-masking for fast configuration enumeration
     * - Pre-computes constraint indices to avoid repeated lookups
     * 
     * @param {Array<Array<number>>} grid - The actual grid values
     * @param {Array<Array<number>>} visibleGrid - Visible state
     * @param {Array<Array<boolean>>} flags - Flag placement state
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @param {number} bombCount - Total mines on the board
     * @param {number} flagCount - Current flag count
     * @returns {{progress: boolean, flagCount: number, changedCells: Array}} Result
     */
    static tankSolver(grid, visibleGrid, flags, width, height, bombCount, flagCount) {
        const frontier = this.getFrontier(visibleGrid, flags, width, height);
        if (frontier.length === 0) return { progress: false, flagCount, changedCells: [] };

        const regions = this.groupFrontierRegions(frontier, visibleGrid, width, height);
        regions.sort((a, b) => a.length - b.length);

        const changedCells = [];

        for (const region of regions) {
            if (region.length > this.MAX_REGION_SIZE) continue;

            const constraints = this.getRegionConstraints(region, visibleGrid, flags, width, height);
            if (constraints.length === 0) continue;

            const remainingMines = bombCount - flagCount;

            const validConfigs = this.enumerateConfigurations(region, constraints, remainingMines);
            if (validConfigs.length === 0) continue;

            const { definiteMines, definiteSafes } = this.analyzeConfigurations(region, validConfigs);

            let progress = false;

            for (const cell of definiteMines) {
                if (!flags[cell.x][cell.y]) {
                    flags[cell.x][cell.y] = true;
                    flagCount++;
                    changedCells.push(cell);
                    progress = true;
                }
            }

            for (const cell of definiteSafes) {
                if (visibleGrid[cell.x][cell.y] === -1) {
                    this.simulateReveal(grid, visibleGrid, flags, width, height, cell.x, cell.y);
                    changedCells.push(cell);
                    progress = true;
                }
            }

            if (progress) return { progress: true, flagCount, changedCells };
        }

        return { progress: false, flagCount, changedCells };
    }

    /**
     * Get all frontier cells (hidden cells adjacent to revealed numbers).
     * 
     * The frontier represents the "edge" of what's been revealed,
     * where deductions can be made based on adjacent constraints.
     * 
     * @param {Array<Array<number>>} visibleGrid - Visible state
     * @param {Array<Array<boolean>>} flags - Flag placement state
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @returns {Array<{x: number, y: number}>} Array of frontier cell coordinates
     * @private
     */
    static getFrontier(visibleGrid, flags, width, height) {
        const frontier = [];
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (visibleGrid[x][y] === -1 && !flags[x][y]) {
                    const neighbors = this.getCachedNeighbors(x, y);
                    for (const n of neighbors) {
                        if (visibleGrid[n.x][n.y] > 0) {
                            frontier.push({ x, y });
                            break;
                        }
                    }
                }
            }
        }
        return frontier;
    }

    /**
     * Group frontier cells into connected regions.
     * 
     * Two frontier cells are in the same region if they share a constraint
     * (i.e., they're both neighbors of the same revealed numbered cell).
     * Solving regions independently is more efficient than solving the entire frontier.
     * 
     * Uses BFS to flood-fill connected components, with bit-packed keys
     * for efficient Set operations.
     * 
     * @param {Array<{x: number, y: number}>} frontier - All frontier cells
     * @param {Array<Array<number>>} visibleGrid - Visible state
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @returns {Array<Array<{x: number, y: number}>>} Array of region arrays
     * @private
     */
    static groupFrontierRegions(frontier, visibleGrid, width, height) {
        if (frontier.length === 0) return [];

        const regions = [];
        const visited = new Set();

        const frontierSet = new Set();
        for (const f of frontier) {
            frontierSet.add(this.cellKey(f.x, f.y));
        }

        for (const startCell of frontier) {
            const startKey = this.cellKey(startCell.x, startCell.y);
            if (visited.has(startKey)) continue;

            const region = [];
            const queue = [startCell];
            const queueSet = new Set([startKey]);

            while (queue.length > 0) {
                const cell = queue.shift();
                const cellKey = this.cellKey(cell.x, cell.y);
                queueSet.delete(cellKey);

                if (visited.has(cellKey)) continue;
                visited.add(cellKey);
                region.push(cell);

                const cellNeighbors = this.getCachedNeighbors(cell.x, cell.y);

                for (const constraint of cellNeighbors) {
                    if (visibleGrid[constraint.x][constraint.y] <= 0) continue;

                    const constraintNeighbors = this.getCachedNeighbors(constraint.x, constraint.y);
                    for (const n of constraintNeighbors) {
                        const nKey = this.cellKey(n.x, n.y);
                        if (!visited.has(nKey) && !queueSet.has(nKey) && frontierSet.has(nKey)) {
                            queue.push(n);
                            queueSet.add(nKey);
                        }
                    }
                }
            }

            if (region.length > 0) {
                regions.push(region);
            }
        }

        return regions;
    }

    /**
     * Get constraints for a frontier region.
     * 
     * A constraint is a revealed numbered cell that borders the region.
     * Each constraint specifies how many mines must be among its hidden neighbors.
     * 
     * @param {Array<{x: number, y: number}>} region - Region cells
     * @param {Array<Array<number>>} visibleGrid - Visible state
     * @param {Array<Array<boolean>>} flags - Flag placement state
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @returns {Array<Object>} Constraint objects with cell info and mine requirements
     * @private
     */
    static getRegionConstraints(region, visibleGrid, flags, width, height) {
        const constraintSet = new Set();
        const constraints = [];

        const regionSet = new Set();
        for (const r of region) {
            regionSet.add(this.cellKey(r.x, r.y));
        }

        for (const cell of region) {
            const neighbors = this.getCachedNeighbors(cell.x, cell.y);
            for (const n of neighbors) {
                const key = this.cellKey(n.x, n.y);
                if (visibleGrid[n.x][n.y] > 0 && !constraintSet.has(key)) {
                    constraintSet.add(key);

                    const constraintNeighbors = this.getCachedNeighbors(n.x, n.y);
                    let flaggedCount = 0;
                    const cellsInRegion = [];
                    const cellsInRegionIndices = [];
                    const cellsOutside = [];

                    for (const cn of constraintNeighbors) {
                        if (flags[cn.x][cn.y]) {
                            flaggedCount++;
                        } else if (visibleGrid[cn.x][cn.y] === -1) {
                            const cnKey = this.cellKey(cn.x, cn.y);
                            if (regionSet.has(cnKey)) {
                                cellsInRegion.push(cn);
                                for (let i = 0; i < region.length; i++) {
                                    if (region[i].x === cn.x && region[i].y === cn.y) {
                                        cellsInRegionIndices.push(i);
                                        break;
                                    }
                                }
                            } else {
                                cellsOutside.push(cn);
                            }
                        }
                    }

                    constraints.push({
                        x: n.x,
                        y: n.y,
                        value: visibleGrid[n.x][n.y],
                        remaining: visibleGrid[n.x][n.y] - flaggedCount,
                        cellsInRegion,
                        cellsInRegionIndices,
                        cellsOutside
                    });
                }
            }
        }

        return constraints;
    }

    /**
     * Count total flags on the board by scanning all cells.
     * 
     * @param {Array<Array<boolean>>} flags - Flag placement state
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @returns {number} Total number of flags placed
     * @private
     */
    static countFlags(flags, width, height) {
        let count = 0;
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (flags[x][y]) count++;
            }
        }
        return count;
    }

    /**
     * Enumerate all valid mine configurations for a region.
     * 
     * Uses bit-masking to efficiently iterate through all 2^n possible
     * configurations, where n is the region size. Each configuration
     * is validated against all constraints.
     * 
     * @param {Array<{x: number, y: number}>} region - Region cells
     * @param {Array<Object>} constraints - Constraint objects
     * @param {number} maxMines - Maximum mines allowed (remaining unflagged)
     * @returns {Array<Array<boolean>>} Array of valid configurations
     * @private
     */
    static enumerateConfigurations(region, constraints, maxMines) {
        const validConfigs = [];
        const totalCombinations = 1 << region.length;

        if (totalCombinations > this.MAX_CONFIGURATIONS) {
            return [];
        }

        const constraintData = constraints.map(c => ({
            indices: c.cellsInRegionIndices || [],
            remaining: c.remaining,
            outsideCount: c.cellsOutside.length
        }));

        for (let mask = 0; mask < totalCombinations; mask++) {
            const mineCount = this.countBits(mask);
            if (mineCount > maxMines) continue;

            let valid = true;
            for (const cd of constraintData) {
                let minesInRegion = 0;
                for (const idx of cd.indices) {
                    if ((mask >> idx) & 1) minesInRegion++;
                }
                const minesNeededOutside = cd.remaining - minesInRegion;
                if (minesNeededOutside < 0 || minesNeededOutside > cd.outsideCount) {
                    valid = false;
                    break;
                }
            }

            if (valid) {
                const config = [];
                for (let i = 0; i < region.length; i++) {
                    config.push((mask >> i) & 1 ? true : false);
                }
                validConfigs.push(config);
            }
        }

        return validConfigs;
    }

    /**
     * Count the number of bits set to 1 in an integer (population count).
     * Used for efficient mine counting in bit-masked configurations.
     * 
     * @param {number} n - Integer to count bits in
     * @returns {number} Number of 1 bits
     * @private
     */
    static countBits(n) {
        let count = 0;
        while (n) {
            count += n & 1;
            n >>= 1;
        }
        return count;
    }

    /**
     * Check if a configuration satisfies all constraints.
     * 
     * For each constraint, verifies that the mine count in the region
     * plus potential mines outside the region equals the constraint value.
     * 
     * @param {Array<{x: number, y: number}>} region - Region cells
     * @param {Array<boolean>} config - Configuration (true = mine)
     * @param {Array<Object>} constraints - Constraint objects
     * @returns {boolean} True if configuration is valid
     * @private
     */
    static isValidConfiguration(region, config, constraints) {
        for (const constraint of constraints) {
            let minesInRegion = 0;
            for (let i = 0; i < region.length; i++) {
                if (config[i] && constraint.cellsInRegion.some(c => c.x === region[i].x && c.y === region[i].y)) {
                    minesInRegion++;
                }
            }

            const minesNeededOutside = constraint.remaining - minesInRegion;

            if (minesNeededOutside < 0 || minesNeededOutside > constraint.cellsOutside.length) {
                return false;
            }
        }

        return true;
    }

    /**
     * Analyze configurations to find cells that are always mine or always safe.
     * 
     * Iterates through all valid configurations and checks each cell position:
     * - If a cell is a mine in ALL configurations → definitely a mine
     * - If a cell is safe in ALL configurations → definitely safe
     * 
     * @param {Array<{x: number, y: number}>} region - Region cells
     * @param {Array<Array<boolean>>} validConfigs - Array of valid configurations
     * @returns {{definiteMines: Array, definiteSafes: Array}} Cells with certain outcomes
     * @private
     */
    static analyzeConfigurations(region, validConfigs) {
        const definiteMines = [];
        const definiteSafes = [];

        for (let i = 0; i < region.length; i++) {
            let alwaysMine = true;
            let alwaysSafe = true;

            for (const config of validConfigs) {
                if (!config[i]) alwaysMine = false;
                if (config[i]) alwaysSafe = false;
            }

            if (alwaysMine) definiteMines.push(region[i]);
            if (alwaysSafe) definiteSafes.push(region[i]);
        }

        return { definiteMines, definiteSafes };
    }

    /**
     * Strategy 5: Global mine counting - End-game deduction.
     * 
     * ## Algorithm
     * Uses the total mine count to make deductions when:
     * - If remaining mines == remaining hidden cells → all hidden are mines
     * - If remaining mines == 0 → all hidden are safe
     * 
     * This strategy is powerful at the end of the game when most cells
     * are revealed and the remaining count is known precisely.
     * 
     * @param {Array<Array<number>>} grid - The actual grid values
     * @param {Array<Array<number>>} visibleGrid - Visible state
     * @param {Array<Array<boolean>>} flags - Flag placement state
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @param {number} bombCount - Total mines on the board
     * @param {number} flagCount - Current flag count
     * @returns {{progress: boolean, flagCount: number}} Result
     */
    static applyGlobalMineCount(grid, visibleGrid, flags, width, height, bombCount, flagCount) {
        const totalHiddenCells = [];

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (visibleGrid[x][y] === -1 && !flags[x][y]) {
                    totalHiddenCells.push({ x, y });
                }
            }
        }

        const remainingMinesCount = bombCount - flagCount;
        let progress = false;

        if (totalHiddenCells.length > 0) {
            if (remainingMinesCount === totalHiddenCells.length) {
                for (const n of totalHiddenCells) {
                    flags[n.x][n.y] = true;
                    flagCount++;
                }
                progress = true;
            } else if (remainingMinesCount === 0) {
                for (const n of totalHiddenCells) {
                    this.simulateReveal(grid, visibleGrid, flags, width, height, n.x, n.y);
                }
                progress = true;
            }
        }

        return { progress, flagCount };
    }

    /**
     * Get a hint with a detailed explanation of WHY the move is safe.
     * 
     * Runs solver strategies on a deep copy of the current visible state
     * and intercepts the first safe cell found. Returns the cell along
     * with which strategy found it and which constraint cells justify
     * the deduction.
     * 
     * Only meaningful in No Guess mode with a solvable grid, since the
     * solver strategies are designed to find cells that are logically
     * provable from the visible state.
     * 
     * @param {Object} game - Game state object
     * @returns {{x, y, score, type, strategy, constraintCells, explanationData}|null}
     */
    static getHintWithExplanation(game) {
        const { width, height, visibleGrid, flags, grid, bombCount } = game;
        this.initNeighborCache(width, height);

        // Deep-copy visible state so strategies don't mutate the real game
        const vgCopy = Array(width).fill(null).map((_, x) => [...visibleGrid[x]]);
        const fCopy = Array(width).fill(null).map((_, x) => [...flags[x]]);

        // Count current player flags
        let flagCount = 0;
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (fCopy[x][y]) flagCount++;
            }
        }

        // Build initial dirty cells from all currently visible numbered cells
        let dirtyCells = new Set();
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (vgCopy[x][y] > 0) {
                    dirtyCells.add(this.cellKey(x, y));
                    for (const n of this.getCachedNeighbors(x, y)) {
                        dirtyCells.add(this.cellKey(n.x, n.y));
                    }
                }
            }
        }

        // ── Strategy 1: Basic counting rules ──────────────────────────
        // Instead of calling applyBasicRules (which modifies state silently),
        // we scan for the basic rule pattern and return the first safe cell.
        {
            const processedCells = new Set();
            for (const key of dirtyCells) {
                const { x, y } = this.decodeKey(key);
                if (x < 0 || x >= width || y < 0 || y >= height) continue;
                const val = vgCopy[x][y];
                if (val <= 0) continue;
                if (processedCells.has(key)) continue;
                processedCells.add(key);

                const neighbors = this.getCachedNeighbors(x, y);
                let flaggedCount = 0;
                const hiddenCells = [];

                for (const n of neighbors) {
                    if (fCopy[n.x][n.y]) {
                        flaggedCount++;
                    } else if (vgCopy[n.x][n.y] === -1) {
                        hiddenCells.push(n);
                    }
                }

                if (hiddenCells.length === 0) continue;

                // All hidden neighbors are mines → flag them (no safe cell yet,
                // but may unlock safe cells in subsequent basic rule checks)
                if (val === hiddenCells.length + flaggedCount) {
                    // Don't return this — it flags mines, not safe cells.
                    // We'll handle this after trying safe-cell patterns first.
                    continue;
                }

                // All remaining mines accounted for → hidden neighbors are SAFE
                if (val === flaggedCount && hiddenCells.length > 0) {
                    const target = hiddenCells[0]; // pick the first safe cell
                    return {
                        x: target.x, y: target.y,
                        score: 1, type: 'safe',
                        strategy: 'basic',
                        constraintCells: [{ x, y }],
                        explanationData: {
                            cx: x + 1, cy: y + 1, n: val, flags: flaggedCount
                        }
                    };
                }
            }
        }

        // Try flagging mines via basic rules first, then re-check for safe cells
        {
            const basicResult = this.applyBasicRules(grid, vgCopy, fCopy, width, height, dirtyCells, flagCount);
            if (basicResult.progress) {
                flagCount = basicResult.flagCount;
                dirtyCells = basicResult.dirtyCells;

                // Re-scan for safe cells after flags were placed
                for (const key of dirtyCells) {
                    const { x, y } = this.decodeKey(key);
                    if (x < 0 || x >= width || y < 0 || y >= height) continue;
                    const val = vgCopy[x][y];
                    if (val <= 0) continue;

                    const neighbors = this.getCachedNeighbors(x, y);
                    let fc = 0;
                    const hidden = [];
                    for (const n of neighbors) {
                        if (fCopy[n.x][n.y]) fc++;
                        else if (vgCopy[n.x][n.y] === -1) hidden.push(n);
                    }

                    if (hidden.length > 0 && val === fc) {
                        // Filter to only cells that are actually still hidden in the REAL game
                        const realTarget = hidden.find(
                            c => visibleGrid[c.x][c.y] === -1 && !flags[c.x][c.y]
                        );
                        if (realTarget) {
                            return {
                                x: realTarget.x, y: realTarget.y,
                                score: 1, type: 'safe',
                                strategy: 'basicDeduced',
                                constraintCells: [{ x, y }],
                                explanationData: { cx: x + 1, cy: y + 1, n: val }
                            };
                        }
                    }
                }
            }
        }

        // ── Strategy 2: Subset logic ──────────────────────────────────
        {
            // Build constraint data for subset analysis
            const constraintCells = new Set();
            for (const key of dirtyCells) {
                const { x, y } = this.decodeKey(key);
                if (x < 0 || x >= width || y < 0 || y >= height) continue;
                if (vgCopy[x][y] > 0) constraintCells.add(key);
                for (const n of this.getCachedNeighbors(x, y)) {
                    if (vgCopy[n.x][n.y] > 0) constraintCells.add(this.cellKey(n.x, n.y));
                }
            }

            const cellData = new Map();
            for (const key of constraintCells) {
                const { x, y } = this.decodeKey(key);
                const val = vgCopy[x][y];
                if (val <= 0) continue;

                const neighbors = this.getCachedNeighbors(x, y);
                const hiddenSet = new Set();
                const hiddenList = [];
                let fc = 0;

                for (const n of neighbors) {
                    if (fCopy[n.x][n.y]) fc++;
                    else if (vgCopy[n.x][n.y] === -1) {
                        hiddenSet.add(this.cellKey(n.x, n.y));
                        hiddenList.push(n);
                    }
                }
                if (hiddenList.length === 0) continue;
                const remaining = val - fc;
                if (remaining < 0) continue;
                cellData.set(key, { x, y, hiddenSet, hiddenList, remaining });
            }

            for (const [keyA, dataA] of cellData) {
                if (dataA.hiddenList.length === 0) continue;
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dy = -2; dy <= 2; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = dataA.x + dx;
                        const ny = dataA.y + dy;
                        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                        const keyB = this.cellKey(nx, ny);
                        const dataB = cellData.get(keyB);
                        if (!dataB || dataB.hiddenList.length === 0) continue;

                        if (dataA.hiddenSet.size < dataB.hiddenSet.size) {
                            let isSubset = true;
                            for (const k of dataA.hiddenSet) {
                                if (!dataB.hiddenSet.has(k)) { isSubset = false; break; }
                            }
                            if (isSubset) {
                                const diff = [];
                                for (const n of dataB.hiddenList) {
                                    if (!dataA.hiddenSet.has(this.cellKey(n.x, n.y))) diff.push(n);
                                }
                                const diffMines = dataB.remaining - dataA.remaining;

                                if (diffMines === 0 && diff.length > 0) {
                                    // diff cells are all safe
                                    const realTarget = diff.find(
                                        c => visibleGrid[c.x][c.y] === -1 && !flags[c.x][c.y]
                                    );
                                    if (realTarget) {
                                        return {
                                            x: realTarget.x, y: realTarget.y,
                                            score: 1, type: 'safe',
                                            strategy: 'subset',
                                            constraintCells: [
                                                { x: dataA.x, y: dataA.y },
                                                { x: dataB.x, y: dataB.y }
                                            ],
                                            explanationData: {
                                                ax: dataA.x + 1, ay: dataA.y + 1,
                                                bx: dataB.x + 1, by: dataB.y + 1,
                                                valA: vgCopy[dataA.x][dataA.y],
                                                valB: vgCopy[dataB.x][dataB.y]
                                            }
                                        };
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Strategy 3: Gaussian Elimination ──────────────────────────
        {
            const frontier = this.getFrontier(vgCopy, fCopy, width, height);
            if (frontier.length > 0) {
                const result = GaussianElimination.solve(this, vgCopy, fCopy, frontier);
                if (result.progress && result.safe.length > 0) {
                    const realTarget = result.safe.find(
                        c => visibleGrid[c.x][c.y] === -1 && !flags[c.x][c.y]
                    );
                    if (realTarget) {
                        // Collect constraint cells: numbered cells adjacent to the safe cell
                        const cCells = [];
                        for (const n of this.getCachedNeighbors(realTarget.x, realTarget.y)) {
                            if (vgCopy[n.x][n.y] > 0) cCells.push({ x: n.x, y: n.y });
                        }
                        return {
                            x: realTarget.x, y: realTarget.y,
                            score: 1, type: 'safe',
                            strategy: 'gaussian',
                            constraintCells: cCells,
                            explanationData: { count: result.safe.length }
                        };
                    }
                }
                // Apply gaussian changes to copies for subsequent strategies
                if (result.progress) {
                    for (const cell of result.mines) {
                        if (!fCopy[cell.x][cell.y]) { fCopy[cell.x][cell.y] = true; flagCount++; }
                    }
                    for (const cell of result.safe) {
                        if (vgCopy[cell.x][cell.y] === -1) {
                            this.simulateReveal(grid, vgCopy, fCopy, width, height, cell.x, cell.y);
                        }
                    }
                }
            }
        }

        // ── Strategy 4: Proof by Contradiction ────────────────────────
        {
            const frontier = this.getFrontier(vgCopy, fCopy, width, height);
            const maxCheck = Math.min(frontier.length, 50);
            for (let i = 0; i < maxCheck; i++) {
                const cell = frontier[i];
                // If assuming "mine" leads to contradiction → cell is safe
                if (this.checkContradiction(vgCopy, fCopy, width, height, cell, true)) {
                    if (visibleGrid[cell.x][cell.y] === -1 && !flags[cell.x][cell.y]) {
                        const cCells = [];
                        for (const n of this.getCachedNeighbors(cell.x, cell.y)) {
                            if (vgCopy[n.x][n.y] > 0) cCells.push({ x: n.x, y: n.y });
                        }
                        return {
                            x: cell.x, y: cell.y,
                            score: 1, type: 'safe',
                            strategy: 'contradiction',
                            constraintCells: cCells,
                            explanationData: { cx: cell.x + 1, cy: cell.y + 1 }
                        };
                    }
                }
            }
        }

        // ── Strategy 5: Tank Solver ───────────────────────────────────
        {
            const frontier = this.getFrontier(vgCopy, fCopy, width, height);
            if (frontier.length > 0) {
                const regions = this.groupFrontierRegions(frontier, vgCopy, width, height);
                regions.sort((a, b) => a.length - b.length);

                for (const region of regions) {
                    if (region.length > this.MAX_REGION_SIZE) continue;
                    const constraints = this.getRegionConstraints(region, vgCopy, fCopy, width, height);
                    if (constraints.length === 0) continue;

                    const remainingMines = bombCount - flagCount;
                    const validConfigs = this.enumerateConfigurations(region, constraints, remainingMines);
                    if (validConfigs.length === 0) continue;

                    const { definiteSafes } = this.analyzeConfigurations(region, validConfigs);
                    if (definiteSafes.length > 0) {
                        const realTarget = definiteSafes.find(
                            c => visibleGrid[c.x][c.y] === -1 && !flags[c.x][c.y]
                        );
                        if (realTarget) {
                            const cCells = constraints.map(c => ({ x: c.x, y: c.y }));
                            return {
                                x: realTarget.x, y: realTarget.y,
                                score: 1, type: 'safe',
                                strategy: 'tank',
                                constraintCells: cCells,
                                explanationData: { configs: validConfigs.length }
                            };
                        }
                    }
                }
            }
        }

        // ── Strategy 6: Global Mine Count ─────────────────────────────
        {
            const totalHidden = [];
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    if (vgCopy[x][y] === -1 && !fCopy[x][y]) totalHidden.push({ x, y });
                }
            }
            const remainingMines = bombCount - flagCount;
            if (totalHidden.length > 0 && remainingMines === 0) {
                const realTarget = totalHidden.find(
                    c => visibleGrid[c.x][c.y] === -1 && !flags[c.x][c.y]
                );
                if (realTarget) {
                    return {
                        x: realTarget.x, y: realTarget.y,
                        score: 1, type: 'safe',
                        strategy: 'globalCount',
                        constraintCells: [],
                        explanationData: { remaining: 0 }
                    };
                }
            }
        }

        // ── Fallback: God Mode hint with no explanation ───────────────
        const godHint = this.getHint(game);
        if (godHint) {
            return {
                ...godHint,
                strategy: 'godMode',
                constraintCells: [],
                explanationData: {}
            };
        }

        return null;
    }

    /**
     * Finds a hint for the current game state (God Mode / Best Move).
     * 
     * Returns the "best" safe cell to reveal, prioritizing:
     * 1. Safe cells on the frontier (adjacent to revealed cells)
     * 2. Cells with more revealed neighbors (more useful information)
     * 3. Zero cells (will trigger cascade reveals)
     * 4. Any remaining safe cell as fallback
     * 
     * @param {Object} game - Game state object with grid, visible state, and mine positions
     * @returns {{x: number, y: number, score: number, type: string}|null} Hint or null if none found
     */
    static getHint(game) {
        const { width, height, visibleGrid, flags, mines, grid: gridNumbers } = game;

        // Initialize cache for hint if not already done
        this.initNeighborCache(width, height);

        let safeFrontier = [];

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (visibleGrid[x][y] === -1 && !flags[x][y] && !mines[x][y]) {
                    const checkNeighbors = this.getCachedNeighbors(x, y);
                    const revealedNeighbors = checkNeighbors.filter(n => visibleGrid[n.x][n.y] > -1);

                    if (revealedNeighbors.length > 0) {
                        let score = revealedNeighbors.length;
                        if (gridNumbers[x][y] === 0) score += 10;
                        safeFrontier.push({ x, y, score, type: 'safe' });
                    }
                }
            }
        }

        if (safeFrontier.length > 0) {
            return safeFrontier.sort((a, b) => b.score - a.score)[0];
        }

        let safeIsland = [];
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (visibleGrid[x][y] === -1 && !flags[x][y] && !mines[x][y]) {
                    let score = gridNumbers[x][y] === 0 ? 10 : 0;
                    safeIsland.push({ x, y, score, type: 'safe' });
                }
            }
        }

        if (safeIsland.length > 0) {
            return safeIsland.sort((a, b) => b.score - a.score)[0];
        }

        return null;
    }

    /**
     * Simulate revealing a cell and cascade for zeros.
     * 
     * Updates the visibleGrid to reflect what would happen if the cell
     * at (startX, startY) was clicked. If the cell is a zero, recursively
     * reveals all connected zeros and their neighbors (flood fill).
     * 
     * Uses an iterative stack-based approach to avoid recursion depth issues.
     * 
     * @param {Array<Array<number>>} grid - The actual grid values
     * @param {Array<Array<number>>} visibleGrid - Visible state to update
     * @param {Array<Array<boolean>>} flags - Flag placement state
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @param {number} startX - X coordinate to reveal
     * @param {number} startY - Y coordinate to reveal
     * @private
     */
    static simulateReveal(grid, visibleGrid, flags, width, height, startX, startY) {
        const stack = [[startX, startY]];
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            if (visibleGrid[x][y] !== -1 || flags[x][y]) continue;

            const val = grid[x][y];
            visibleGrid[x][y] = val;

            if (val === 0) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx !== 0 || dy !== 0) {
                            stack.push([x + dx, y + dy]);
                        }
                    }
                }
            }
        }
    }

    /**
     * Get neighboring cell coordinates for a given position.
     * 
     * Returns all 8 adjacent cells (including diagonals) that are
     * within the grid boundaries. Unlike getCachedNeighbors, this
     * creates a new array and should be used sparingly.
     * 
     * @param {number} x - Cell X coordinate
     * @param {number} y - Cell Y coordinate
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @returns {Array<{x: number, y: number}>} Array of neighbor coordinates
     */
    static getNeighbors(x, y, width, height) {
        const neighbors = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    neighbors.push({ x: nx, y: ny });
                }
            }
        }
        return neighbors;
    }
}
