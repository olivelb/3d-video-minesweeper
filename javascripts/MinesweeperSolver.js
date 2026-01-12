/**
 * MinesweeperSolver - Logic for solving Minesweeper games
 * Can be used for "No Guess" board generation and hints.
 */
export class MinesweeperSolver {
    /**
     * Checks if a board is solvable from a starting point without guessing.
     * @param {MinesweeperGame} game 
     * @param {number} startX 
     * @param {number} startY 
     * @returns {boolean}
     */
    static isSolvable(game, startX, startY) {
        // Clone game state for simulation
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
        while (progress) {
            progress = false;

            // 1. Basic Rule: If (number on cell) == (number of neighbors flagged), all other neighbors are safe.
            // 2. Basic Rule: If (number on cell) == (number of hidden neighbors), all hidden neighbors are mines.
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    const val = visibleGrid[x][y];
                    if (val > 0) {
                        const neighbors = this.getNeighbors(x, y, width, height);
                        const hidden = neighbors.filter(n => visibleGrid[n.x][n.y] === -1 && !flags[n.x][n.y]);
                        const flagged = neighbors.filter(n => flags[n.x][n.y]);

                        // Rule 2: All hidden neighbors must be mines
                        if (val === hidden.length + flagged.length && hidden.length > 0) {
                            hidden.forEach(n => {
                                flags[n.x][n.y] = true;
                            });
                            progress = true;
                        }

                        // Rule 1: All other neighbors are safe
                        if (val === flagged.length && hidden.length > 0) {
                            hidden.forEach(n => {
                                this.simulateReveal(grid, visibleGrid, flags, width, height, n.x, n.y);
                            });
                            progress = true;
                        }
                    }
                }
            }

            // 3. Advanced Rule: Set Reduction / Subset Logic
            // If the neighbors of cell A are a subset of the neighbors of cell B:
            // The mines required in (B \ A) is (B.val - A.val)
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    const valA = visibleGrid[x][y];
                    if (valA <= 0) continue;

                    const neighborsA = this.getNeighbors(x, y, width, height);
                    const hiddenA = neighborsA.filter(n => visibleGrid[n.x][n.y] === -1 && !flags[n.x][n.y]);
                    const flaggedA = neighborsA.filter(n => flags[n.x][n.y]);
                    const remainingA = valA - flaggedA.length;

                    if (hiddenA.length === 0) continue;

                    // Compare with another nearby revealed cell B
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

                            if (hiddenB.length === 0) continue;

                            // Check if hiddenA is a subset of hiddenB
                            const isSubset = hiddenA.every(na => hiddenB.some(nb => na.x === nb.x && na.y === nb.y));
                            if (isSubset && hiddenA.length < hiddenB.length) {
                                const diff = hiddenB.filter(nb => !hiddenA.some(na => na.x === nb.x && na.y === nb.y));
                                const diffMines = remainingB - remainingA;

                                if (diffMines === 0) {
                                    // All cells in the difference are safe
                                    diff.forEach(n => {
                                        this.simulateReveal(grid, visibleGrid, flags, width, height, n.x, n.y);
                                    });
                                    progress = true;
                                } else if (diffMines === diff.length) {
                                    // All cells in the difference are mines
                                    diff.forEach(n => {
                                        flags[n.x][n.y] = true;
                                    });
                                    progress = true;
                                }
                            }
                        }
                    }
                }
            }

            // 4. Global Mine Counting Rule
            let totalHiddenCells = [];
            let totalFlagsCount = 0;
            for (let gx = 0; gx < width; gx++) {
                for (let gy = 0; gy < height; gy++) {
                    if (visibleGrid[gx][gy] === -1 && !flags[gx][gy]) totalHiddenCells.push({ x: gx, y: gy });
                    if (flags[gx][gy]) totalFlagsCount++;
                }
            }
            const remainingMinesCount = bombCount - totalFlagsCount;
            if (totalHiddenCells.length > 0) {
                if (remainingMinesCount === totalHiddenCells.length) {
                    totalHiddenCells.forEach(n => { flags[n.x][n.y] = true; });
                    progress = true;
                } else if (remainingMinesCount === 0) {
                    totalHiddenCells.forEach(n => {
                        this.simulateReveal(grid, visibleGrid, flags, width, height, n.x, n.y);
                    });
                    progress = true;
                }
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
