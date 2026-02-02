/**
 * MinesweeperSolver - Logic for solving Minesweeper games
 * Can be used for "No Guess" board generation and hints.
 * 
 * Enhanced with Tank Solver for complex patterns.
 * Optimized for large grids with cached neighbors and incremental updates.
 */
export class MinesweeperSolver {
    // Maximum configurations to enumerate before giving up (performance limit)
    static MAX_CONFIGURATIONS = 50000;

    // Maximum frontier region size for tank solver
    static MAX_REGION_SIZE = 15;

    // Pre-computed neighbor cache: neighborCache[x][y] = [{x, y}, ...]
    static neighborCache = null;
    static cacheWidth = 0;
    static cacheHeight = 0;

    /**
     * Initialize or retrieve the neighbor cache for given dimensions.
     * This avoids creating new arrays on every getNeighbors() call.
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
     * Get cached neighbors - O(1) lookup instead of creating new arrays
     */
    static getCachedNeighbors(x, y) {
        return this.neighborCache[x][y];
    }

    /**
     * Create a cell key for Set operations (bit-packed for performance)
     */
    static cellKey(x, y) {
        return (x << 16) | y;
    }

    /**
     * Decode a cell key back to coordinates
     */
    static decodeKey(key) {
        return { x: key >> 16, y: key & 0xFFFF };
    }

    /**
     * Checks if a board is solvable from a starting point without guessing.
     * Uses multiple deduction strategies including Tank Solver for complex patterns.
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

            // Strategy 3: Proof by contradiction (expensive - limit frontier size)
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

            // Strategy 4: Tank Solver (very expensive - use sparingly)
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

            // Strategy 5: Global mine counting
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
     * Strategy 1: Basic counting rules - Only process dirty cells, use cached neighbors
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
     * Strategy 2: Subset logic - Use Sets for O(1) membership tests
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
     * Strategy 3: Proof by contradiction with frontier limit and faster propagation
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
     * Faster contradiction check with localized propagation using sparse representation
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
     * Strategy 4: Tank Solver with flag count tracking
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
     * Get frontier cells using cached neighbors
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
     * Group frontier cells into connected regions using bit-packed keys and cached neighbors
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
     * Get region constraints with pre-computed indices
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
     * Count total flags on the board
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
     * Enumerate configurations using pre-computed indices
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
     * Count bits set in a number
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
     * Check if a configuration satisfies all constraints
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
     * Analyze configurations to find cells that are always mine or always safe
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
     * Strategy 5: Global mine counting using tracked flag count
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
     * Finds a hint for the current game state (God Mode / Best Move).
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
