/**
 * Gaussian Elimination Strategy for Minesweeper
 * 
 * Solves systems of linear equations to find safe cells and mines.
 * Represents the board state as a matrix equation Ax = b, where:
 * - x is the vector of hidden cells (0=safe, 1=mine)
 * - A is the adjacency matrix (1 if cell j is neighbor of clue i)
 * - b is the vector of effective clue values (clue - flagged neighbors)
 * 
 * This strategy is more powerful than simple subset logic but faster than
 * full combinatorial enumeration (Tank Solver) for connected regions.
 */
export class GaussianElimination {

    /**
     * Solve the local board state using Gaussian Elimination.
     * 
     * @param {Object} solver - Reference to MinesweeperSolver for utils (w/h, accessing neighbors)
     * @param {Array<Array<number>>} visibleGrid - The current visible state
     * @param {Array<Array<boolean>>} flags - The current flags
     * @param {Array<{x:number, y:number}>} frontier - List of hidden cells on the boundary
     * @returns {{progress: boolean, safe: Array<{x:number, y:number}>, mines: Array<{x:number, y:number}>}}
     */
    static solve(solver, visibleGrid, flags, frontier) {
        const width = visibleGrid.length;
        const height = visibleGrid[0].length;

        // 1. Identify Variables (Columns)
        // Map each frontier cell to a column index
        const variableMap = new Map(); // key -> colIndex
        const variables = []; // colIndex -> {x, y}

        frontier.forEach((cell, index) => {
            const key = solver.cellKey(cell.x, cell.y);
            variableMap.set(key, index);
            variables.push(cell);
        });

        const numVars = variables.length;
        if (numVars === 0) return { progress: false, safe: [], mines: [] };

        // 2. Identify Equations (Rows)
        // Find all revealed numbered cells adjacent to the frontier
        const equations = [];
        const processedClues = new Set();

        for (const cell of frontier) {
            const neighbors = solver.getCachedNeighbors(cell.x, cell.y);
            for (const n of neighbors) {
                const val = visibleGrid[n.x][n.y];
                const key = solver.cellKey(n.x, n.y);

                if (val > 0 && !processedClues.has(key)) {
                    processedClues.add(key);

                    // Build equation for this clue
                    const equation = {
                        clueVal: val,
                        neighbors: [],
                        key: key
                    };

                    const clueNeighbors = solver.getCachedNeighbors(n.x, n.y);
                    let flaggedCount = 0;

                    for (const cn of clueNeighbors) {
                        if (flags[cn.x][cn.y]) {
                            flaggedCount++;
                        } else if (visibleGrid[cn.x][cn.y] === -1) {
                            // It's a hidden neighbor (variable)
                            const varKey = solver.cellKey(cn.x, cn.y);
                            if (variableMap.has(varKey)) {
                                equation.neighbors.push(variableMap.get(varKey));
                            }
                        }
                    }

                    // Effective value = clue - confirmed mines
                    equation.target = val - flaggedCount;
                    equations.push(equation);
                }
            }
        }

        if (equations.length === 0) return { progress: false, safe: [], mines: [] };

        // 3. Construct Matrix
        // Expanded matrix: [A | b] where A is coefficients, b is target values
        // We use a Float32Array or simple array. Simple array of arrays is easier for now.
        // matrix[row][col]

        const M = equations.length;
        const N = numVars;
        const matrix = [];

        for (let i = 0; i < M; i++) {
            const row = new Float32Array(N + 1); // +1 for the augmented constant column (b)
            const eq = equations[i];

            for (const colIndex of eq.neighbors) {
                row[colIndex] = 1;
            }
            row[N] = eq.target;
            matrix.push(row);
        }

        // 4. Gaussian Elimination (RREF)
        this.computeRREF(matrix, M, N);

        // 5. Reasoning / Deduction
        const safe = [];
        const mines = [];
        let progress = false;

        for (let i = 0; i < M; i++) {
            const row = matrix[i];

            // Collect variables with non-zero coefficients in this row
            // In RREF (or near RREF), we look for rows where we can make a definitive statement.
            // Since our vars are binary (0/1), we can deduce if:
            // Sum(coeffs) == target (where coeffs are positive) -> All vars are 1
            // Sum(|coeffs|) == 0 -> All vars are 0 (should be handled by standard RREF 0=0)
            // 
            // However, after Gaussian elimination, coefficients might be non-1 or negative.
            // We need to interpret the linear combination.
            //
            // Simple approach for binary variables:
            // Look for rows like: 1*A + 1*B ... = Target
            // If Target == 0, then A=0, B=0...
            // If Target == Sum of coeffs, then A=1, B=1...
            //
            // But with Gaussian elimination we might get partial rows.
            // Actually, for Minesweeper, we can use a slightly more robust check:
            // Calculate minimum possible sum and maximum possible sum for the row.
            // minSum = sum of all negative coefficients (assuming those vars are 1)
            // maxSum = sum of all positive coefficients (assuming those vars are 1)
            //
            // Wait, logic:
            // Left side L = c1*x1 + c2*x2 ...
            // We know x_i is in [0, 1].
            // Minimal value of L is sum(c_i where c_i < 0)
            // Maximal value of L is sum(c_i where c_i > 0)
            // Target T must be achieved.
            //
            // If T == MinVal, then all vars with c_i < 0 MUST be 1, and all with c_i > 0 MUST be 0.
            // If T == MaxVal, then all vars with c_i > 0 MUST be 1, and all with c_i < 0 MUST be 0.

            let minVal = 0;
            let maxVal = 0;
            const varsInRow = [];

            for (let j = 0; j < N; j++) {
                const coeff = row[j];
                if (Math.abs(coeff) > 0.001) { // Floating point epsilon
                    varsInRow.push({ index: j, coeff: coeff });
                    if (coeff > 0) maxVal += coeff;
                    else minVal += coeff;
                }
            }

            const target = row[N];

            // Check for inconsistencies (impossible configuration) - usually means assumption wrong, 
            // but here we are just solving, so we assume valid board.

            // Check lower bound exact match
            if (Math.abs(target - minVal) < 0.001) {
                // To reach minimum value, all negative coeffs must be 1 (Mines), positive must be 0 (Safe)
                for (const v of varsInRow) {
                    const cell = variables[v.index];
                    if (v.coeff < 0) {
                        // Mine
                        if (!this.isMineInList(mines, cell)) mines.push(cell);
                    } else {
                        // Safe
                        if (!this.isSafeInList(safe, cell)) safe.push(cell);
                    }
                }
            }

            // Check upper bound exact match
            else if (Math.abs(target - maxVal) < 0.001) {
                // To reach maximum value, all positive coeffs must be 1 (Mines), negative must be 0 (Safe)
                for (const v of varsInRow) {
                    const cell = variables[v.index];
                    if (v.coeff > 0) {
                        // Mine
                        if (!this.isMineInList(mines, cell)) mines.push(cell);
                    } else {
                        // Safe
                        if (!this.isSafeInList(safe, cell)) safe.push(cell);
                    }
                }
            }
        }

        if (safe.length > 0 || mines.length > 0) {
            progress = true;
        }

        return { progress, safe, mines };
    }

    static isMineInList(list, cell) {
        // Simple linear scan is fine for small lists returned per batch
        return list.some(c => c.x === cell.x && c.y === cell.y);
    }

    static isSafeInList(list, cell) {
        return list.some(c => c.x === cell.x && c.y === cell.y);
    }

    /**
     * Computes Reduced Row Echelon Form (RREF) in place.
     * Uses Gaussian elimination with partial pivoting.
     * 
     * @param {Array<Float32Array>} matrix - Mx(N+1) augmented matrix
     * @param {number} M - Rows
     * @param {number} N - Columns (variables)
     */
    static computeRREF(matrix, M, N) {
        let lead = 0;
        for (let r = 0; r < M; r++) {
            if (N <= lead) return;

            let i = r;
            // Find pivot
            while (matrix[i][lead] === 0) {
                i++;
                if (M === i) {
                    i = r;
                    lead++;
                    if (N === lead) return;
                }
            }

            // Swap rows i and r
            if (i !== r) {
                const temp = matrix[i];
                matrix[i] = matrix[r];
                matrix[r] = temp;
            }

            // Normalize pivot row
            let val = matrix[r][lead];
            // If val is close to 0 (should be handled by while loop, but check epsilon)
            if (Math.abs(val) < 0.000001) {
                lead++;
                r--; // Retry this row with next column
                continue;
            }

            for (let j = 0; j <= N; j++) {
                matrix[r][j] /= val;
            }

            // Eliminate other rows
            for (let i = 0; i < M; i++) {
                if (i !== r) {
                    val = matrix[i][lead];
                    if (Math.abs(val) > 0.000001) { // Only subtract if there's a coefficient
                        for (let j = 0; j <= N; j++) {
                            matrix[i][j] -= val * matrix[r][j];
                        }
                    }
                }
            }
            lead++;
        }
    }
}
