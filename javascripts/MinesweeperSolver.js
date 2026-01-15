/**
 * MinesweeperSolver - Logic for solving Minesweeper games
 * Can be used for "No Guess" board generation and hints.
 * 
 * Enhanced with Tank Solver for complex patterns.
 */
export class MinesweeperSolver {
    // Maximum configurations to enumerate before giving up (performance limit)
    static MAX_CONFIGURATIONS = 50000;

    // Maximum frontier region size for tank solver
    static MAX_REGION_SIZE = 20;

    /**
     * Checks if a board is solvable from a starting point without guessing.
     * Uses multiple deduction strategies including Tank Solver for complex patterns.
     * @param {MinesweeperGame} game 
     * @param {number} startX 
     * @param {number} startY 
     * @returns {boolean}
     */
    static isSolvable(game, startX, startY) {
        const grid = game.grid;
        const width = game.width;
        const height = game.height;
        const bombCount = game.bombCount;

        const visibleGrid = Array(width).fill().map(() => Array(height).fill(-1));
        const flags = Array(width).fill().map(() => Array(height).fill(false));

        // Start by revealing the first cell and its neighbors (the 3x3 safe zone)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                this.simulateReveal(grid, visibleGrid, flags, width, height, startX + dx, startY + dy);
            }
        }

        let progress = true;
        let iterations = 0;
        const maxIterations = width * height * 2; // Prevent infinite loops

        while (progress && iterations < maxIterations) {
            progress = false;
            iterations++;

            // Strategy 1: Basic counting rules
            if (this.applyBasicRules(grid, visibleGrid, flags, width, height)) {
                progress = true;
                continue;
            }

            // Strategy 2: Subset logic (set reduction)
            if (this.applySubsetLogic(grid, visibleGrid, flags, width, height)) {
                progress = true;
                continue;
            }

            // Strategy 3: Proof by contradiction
            if (this.solveByContradiction(grid, visibleGrid, flags, width, height)) {
                progress = true;
                continue;
            }

            // Strategy 4: Tank Solver (full configuration enumeration)
            if (this.tankSolver(grid, visibleGrid, flags, width, height, bombCount)) {
                progress = true;
                continue;
            }

            // Strategy 5: Global mine counting
            if (this.applyGlobalMineCount(grid, visibleGrid, flags, width, height, bombCount)) {
                progress = true;
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
     * Strategy 1: Basic counting rules
     * - If number == flagged neighbors, all hidden neighbors are safe
     * - If number == flagged + hidden neighbors, all hidden are mines
     */
    static applyBasicRules(grid, visibleGrid, flags, width, height) {
        let progress = false;

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                const val = visibleGrid[x][y];
                if (val <= 0) continue;

                const neighbors = this.getNeighbors(x, y, width, height);
                const hidden = neighbors.filter(n => visibleGrid[n.x][n.y] === -1 && !flags[n.x][n.y]);
                const flagged = neighbors.filter(n => flags[n.x][n.y]);

                if (hidden.length === 0) continue;

                // All hidden neighbors must be mines
                if (val === hidden.length + flagged.length) {
                    hidden.forEach(n => { flags[n.x][n.y] = true; });
                    progress = true;
                }

                // All hidden neighbors are safe
                if (val === flagged.length) {
                    hidden.forEach(n => {
                        this.simulateReveal(grid, visibleGrid, flags, width, height, n.x, n.y);
                    });
                    progress = true;
                }
            }
        }

        return progress;
    }

    /**
     * Strategy 2: Subset logic (set reduction)
     * If neighbors of A ⊂ neighbors of B, deduce from the difference
     */
    static applySubsetLogic(grid, visibleGrid, flags, width, height) {
        let progress = false;

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                const valA = visibleGrid[x][y];
                if (valA <= 0) continue;

                const neighborsA = this.getNeighbors(x, y, width, height);
                const hiddenA = neighborsA.filter(n => visibleGrid[n.x][n.y] === -1 && !flags[n.x][n.y]);
                const flaggedA = neighborsA.filter(n => flags[n.x][n.y]);
                const remainingA = valA - flaggedA.length;

                if (hiddenA.length === 0 || remainingA < 0) continue;

                // Compare with nearby revealed cells
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dy = -2; dy <= 2; dy++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx < 0 || nx >= width || ny < 0 || ny >= height || (dx === 0 && dy === 0)) continue;

                        const valB = visibleGrid[nx][ny];
                        if (valB <= 0) continue;

                        const neighborsB = this.getNeighbors(nx, ny, width, height);
                        const hiddenB = neighborsB.filter(n => visibleGrid[n.x][n.y] === -1 && !flags[n.x][n.y]);
                        const flaggedB = neighborsB.filter(n => flags[n.x][n.y]);
                        const remainingB = valB - flaggedB.length;

                        if (hiddenB.length === 0 || remainingB < 0) continue;

                        // Check if hiddenA ⊂ hiddenB
                        const isSubset = hiddenA.every(na => hiddenB.some(nb => na.x === nb.x && na.y === nb.y));
                        if (isSubset && hiddenA.length < hiddenB.length) {
                            const diff = hiddenB.filter(nb => !hiddenA.some(na => na.x === nb.x && na.y === nb.y));
                            const diffMines = remainingB - remainingA;

                            if (diffMines === 0 && diff.length > 0) {
                                // All cells in difference are safe
                                diff.forEach(n => {
                                    this.simulateReveal(grid, visibleGrid, flags, width, height, n.x, n.y);
                                });
                                progress = true;
                            } else if (diffMines === diff.length && diff.length > 0) {
                                // All cells in difference are mines
                                diff.forEach(n => { flags[n.x][n.y] = true; });
                                progress = true;
                            }
                        }
                    }
                }
            }
        }

        return progress;
    }

    /**
     * Strategy 4: Tank Solver - Full configuration enumeration
     * For complex patterns that can't be solved by local rules.
     * Groups frontier cells into regions and enumerates valid configurations.
     */
    static tankSolver(grid, visibleGrid, flags, width, height, bombCount) {
        // Get the frontier (hidden cells adjacent to revealed numbers)
        const frontier = this.getFrontier(visibleGrid, flags, width, height);
        if (frontier.length === 0) return false;

        // Group frontier into connected regions
        const regions = this.groupFrontierRegions(frontier, visibleGrid, width, height);

        let progress = false;

        for (const region of regions) {
            // Skip regions that are too large (exponential complexity)
            if (region.length > this.MAX_REGION_SIZE) continue;

            // Get constraints for this region
            const constraints = this.getRegionConstraints(region, visibleGrid, flags, width, height);
            if (constraints.length === 0) continue;

            // Calculate remaining mines globally and in region
            const totalFlags = this.countFlags(flags, width, height);
            const remainingMines = bombCount - totalFlags;

            // Enumerate valid configurations
            const validConfigs = this.enumerateConfigurations(region, constraints, remainingMines);

            if (validConfigs.length === 0) continue;

            // Analyze configurations to find definite mines/safes
            const { definiteMines, definiteSafes } = this.analyzeConfigurations(region, validConfigs);

            // Apply definite mines
            for (const cell of definiteMines) {
                if (!flags[cell.x][cell.y]) {
                    flags[cell.x][cell.y] = true;
                    progress = true;
                }
            }

            // Apply definite safes
            for (const cell of definiteSafes) {
                if (visibleGrid[cell.x][cell.y] === -1) {
                    this.simulateReveal(grid, visibleGrid, flags, width, height, cell.x, cell.y);
                    progress = true;
                }
            }

            if (progress) return true;
        }

        return progress;
    }

    /**
     * Get frontier cells (hidden, unflagged, adjacent to revealed numbers)
     */
    static getFrontier(visibleGrid, flags, width, height) {
        const frontier = [];
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (visibleGrid[x][y] === -1 && !flags[x][y]) {
                    const neighbors = this.getNeighbors(x, y, width, height);
                    if (neighbors.some(n => visibleGrid[n.x][n.y] > 0)) {
                        frontier.push({ x, y });
                    }
                }
            }
        }
        return frontier;
    }

    /**
     * Group frontier cells into connected regions based on shared constraints
     */
    static groupFrontierRegions(frontier, visibleGrid, width, height) {
        if (frontier.length === 0) return [];

        const regions = [];
        const visited = new Set();

        for (const startCell of frontier) {
            const key = `${startCell.x},${startCell.y}`;
            if (visited.has(key)) continue;

            // BFS to find connected region
            const region = [];
            const queue = [startCell];

            while (queue.length > 0) {
                const cell = queue.shift();
                const cellKey = `${cell.x},${cell.y}`;
                if (visited.has(cellKey)) continue;
                visited.add(cellKey);
                region.push(cell);

                // Find other frontier cells that share a constraint (adjacent to same number)
                const cellNeighbors = this.getNeighbors(cell.x, cell.y, width, height);
                const constraintCells = cellNeighbors.filter(n => visibleGrid[n.x][n.y] > 0);

                for (const constraint of constraintCells) {
                    // Find other frontier cells adjacent to this constraint
                    const constraintNeighbors = this.getNeighbors(constraint.x, constraint.y, width, height);
                    for (const n of constraintNeighbors) {
                        const nKey = `${n.x},${n.y}`;
                        if (!visited.has(nKey) && frontier.some(f => f.x === n.x && f.y === n.y)) {
                            queue.push(n);
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
     * Get all constraints (revealed number cells) that affect a region
     */
    static getRegionConstraints(region, visibleGrid, flags, width, height) {
        const constraintSet = new Set();
        const constraints = [];

        for (const cell of region) {
            const neighbors = this.getNeighbors(cell.x, cell.y, width, height);
            for (const n of neighbors) {
                const key = `${n.x},${n.y}`;
                if (visibleGrid[n.x][n.y] > 0 && !constraintSet.has(key)) {
                    constraintSet.add(key);

                    const constraintNeighbors = this.getNeighbors(n.x, n.y, width, height);
                    const flaggedCount = constraintNeighbors.filter(cn => flags[cn.x][cn.y]).length;
                    const hiddenInRegion = constraintNeighbors.filter(cn =>
                        region.some(r => r.x === cn.x && r.y === cn.y)
                    );
                    const hiddenOutsideRegion = constraintNeighbors.filter(cn =>
                        visibleGrid[cn.x][cn.y] === -1 && !flags[cn.x][cn.y] &&
                        !region.some(r => r.x === cn.x && r.y === cn.y)
                    );

                    constraints.push({
                        x: n.x,
                        y: n.y,
                        value: visibleGrid[n.x][n.y],
                        remaining: visibleGrid[n.x][n.y] - flaggedCount,
                        cellsInRegion: hiddenInRegion,
                        cellsOutside: hiddenOutsideRegion
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
     * Enumerate all valid mine configurations for a region
     */
    static enumerateConfigurations(region, constraints, maxMines) {
        const validConfigs = [];
        const totalCombinations = 1 << region.length;

        // Early exit if too many combinations
        if (totalCombinations > this.MAX_CONFIGURATIONS) {
            return [];
        }

        for (let mask = 0; mask < totalCombinations; mask++) {
            // Count mines in this configuration
            const mineCount = this.countBits(mask);

            // Skip if more mines than remaining
            if (mineCount > maxMines) continue;

            // Build configuration
            const config = [];
            for (let i = 0; i < region.length; i++) {
                config.push((mask >> i) & 1 ? true : false);
            }

            // Check if configuration satisfies all constraints
            if (this.isValidConfiguration(region, config, constraints)) {
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
            // Count mines in region cells adjacent to this constraint
            let minesInRegion = 0;
            for (let i = 0; i < region.length; i++) {
                if (config[i] && constraint.cellsInRegion.some(c => c.x === region[i].x && c.y === region[i].y)) {
                    minesInRegion++;
                }
            }

            // Mines needed = remaining - mines in region cells
            const minesNeededOutside = constraint.remaining - minesInRegion;

            // Check validity: minesNeededOutside must be between 0 and cells outside
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
     * Strategy 5: Global mine counting
     * Uses the total mine count to deduce remaining cells
     */
    static applyGlobalMineCount(grid, visibleGrid, flags, width, height, bombCount) {
        let totalHiddenCells = [];
        let totalFlagsCount = 0;

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (visibleGrid[x][y] === -1 && !flags[x][y]) {
                    totalHiddenCells.push({ x, y });
                }
                if (flags[x][y]) totalFlagsCount++;
            }
        }

        const remainingMinesCount = bombCount - totalFlagsCount;
        let progress = false;

        if (totalHiddenCells.length > 0) {
            if (remainingMinesCount === totalHiddenCells.length) {
                // All remaining hidden cells are mines
                totalHiddenCells.forEach(n => { flags[n.x][n.y] = true; });
                progress = true;
            } else if (remainingMinesCount === 0) {
                // All remaining hidden cells are safe
                totalHiddenCells.forEach(n => {
                    this.simulateReveal(grid, visibleGrid, flags, width, height, n.x, n.y);
                });
                progress = true;
            }
        }

        return progress;
    }

    /**
     * Finds a hint for the current game state (God Mode / Best Move).
     * @param {MinesweeperGame} game 
     * @returns {Object|null} { x, y, score, type: 'safe' }
     */
    static getHint(game) {
        const { width, height, visibleGrid, flags, mines, grid: gridNumbers } = game;

        // 1. Identify "Frontier" cells (hidden cells adjacent to revealed cells)
        let safeFrontier = [];

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                // Focus on hidden, unflagged, and guaranteed SAFE cells
                if (visibleGrid[x][y] === -1 && !flags[x][y] && !mines[x][y]) {

                    const checkNeighbors = this.getNeighbors(x, y, width, height);
                    const revealedNeighbors = checkNeighbors.filter(n => visibleGrid[n.x][n.y] > -1);

                    if (revealedNeighbors.length > 0) {
                        // Scoring: Favor 0s (open big areas) and high connectivity
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

        // 2. Fallback: Any safe hidden cell (preferring 0s)
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
     * Strategy 3: Proof by contradiction
     * Tries to solve by assuming a state and checking for contradictions.
     */
    static solveByContradiction(grid, visibleGrid, flags, width, height) {
        const frontier = this.getFrontier(visibleGrid, flags, width, height);

        for (const cell of frontier) {
            // 1. Hypothesis: Cell is a MINE
            // If this leads to contradiction, it MUST be SAFE.
            if (this.checkDeepContradiction(visibleGrid, flags, width, height, cell, true)) {
                this.simulateReveal(grid, visibleGrid, flags, width, height, cell.x, cell.y);
                return true;
            }

            // 2. Hypothesis: Cell is SAFE
            // If this leads to contradiction, it MUST be a MINE.
            if (this.checkDeepContradiction(visibleGrid, flags, width, height, cell, false)) {
                flags[cell.x][cell.y] = true;
                return true;
            }
        }
        return false;
    }

    /**
     * Simulates a state (Mine or Safe) and propagates basic rules.
     * Returns true if a contradiction is found.
     * Enhanced with deeper propagation and subset logic.
     */
    static checkDeepContradiction(visibleGrid, flags, width, height, assumptionCell, assumeMine) {
        // Clone state (Deep copy required)
        const simGrid = visibleGrid.map(row => [...row]);
        const simFlags = flags.map(row => [...row]);

        if (assumeMine) {
            simFlags[assumptionCell.x][assumptionCell.y] = true;
        } else {
            // Mark as 'Assumed Safe' (Revealed but unknown value)
            simGrid[assumptionCell.x][assumptionCell.y] = -2;
        }

        // Propagate with multiple iterations for deeper analysis
        let changed = true;
        let iterations = 0;
        const maxIterations = width * height;

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    const val = simGrid[x][y];
                    if (val < 0) continue; // Skip hidden or assumed safe

                    const neighbors = this.getNeighbors(x, y, width, height);
                    const hidden = neighbors.filter(n => simGrid[n.x][n.y] === -1 && !simFlags[n.x][n.y]);
                    const assumedSafe = neighbors.filter(n => simGrid[n.x][n.y] === -2);
                    const flagged = neighbors.filter(n => simFlags[n.x][n.y]);

                    // Check for Contradictions
                    if (flagged.length > val) return true; // Too many mines
                    if (flagged.length + hidden.length < val) return true; // Not enough cells for mines

                    // Propagate Implications
                    if (hidden.length > 0) {
                        // All mines satisfied → rest are safe
                        if (flagged.length === val) {
                            hidden.forEach(n => { simGrid[n.x][n.y] = -2; });
                            changed = true;
                        }
                        // Remaining cells = remaining mines → all are mines
                        else if (flagged.length + hidden.length === val) {
                            hidden.forEach(n => { simFlags[n.x][n.y] = true; });
                            changed = true;
                        }
                    }
                }
            }

            // Also apply subset logic within simulation
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    const valA = simGrid[x][y];
                    if (valA <= 0) continue;

                    const neighborsA = this.getNeighbors(x, y, width, height);
                    const hiddenA = neighborsA.filter(n => simGrid[n.x][n.y] === -1 && !simFlags[n.x][n.y]);
                    const flaggedA = neighborsA.filter(n => simFlags[n.x][n.y]);
                    const remainingA = valA - flaggedA.length;

                    if (hiddenA.length === 0) continue;

                    for (let dx = -2; dx <= 2; dx++) {
                        for (let dy = -2; dy <= 2; dy++) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx < 0 || nx >= width || ny < 0 || ny >= height || (dx === 0 && dy === 0)) continue;

                            const valB = simGrid[nx][ny];
                            if (valB <= 0) continue;

                            const neighborsB = this.getNeighbors(nx, ny, width, height);
                            const hiddenB = neighborsB.filter(n => simGrid[n.x][n.y] === -1 && !simFlags[n.x][n.y]);
                            const flaggedB = neighborsB.filter(n => simFlags[n.x][n.y]);
                            const remainingB = valB - flaggedB.length;

                            if (hiddenB.length === 0) continue;

                            const isSubset = hiddenA.every(na => hiddenB.some(nb => na.x === nb.x && na.y === nb.y));
                            if (isSubset && hiddenA.length < hiddenB.length) {
                                const diff = hiddenB.filter(nb => !hiddenA.some(na => na.x === nb.x && na.y === nb.y));
                                const diffMines = remainingB - remainingA;

                                // Check for contradiction
                                if (diffMines < 0 || diffMines > diff.length) {
                                    return true;
                                }

                                if (diffMines === 0) {
                                    diff.forEach(n => { simGrid[n.x][n.y] = -2; });
                                    changed = true;
                                } else if (diffMines === diff.length) {
                                    diff.forEach(n => { simFlags[n.x][n.y] = true; });
                                    changed = true;
                                }
                            }
                        }
                    }
                }
            }
        }

        return false;
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
