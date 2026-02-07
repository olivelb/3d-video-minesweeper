/**
 * Gaussian Elimination Strategy for Minesweeper
 * 
 * Optimized Version:
 * - Uses flat Int32Array for O(1) lookups instead of Map/Set (avoiding allocation overhead).
 * - Implements strict component windowing to split large systems.
 * - Reduces matrix size by only considering relevant variables.
 */
export class GaussianElimination {

    /**
     * Solve the local board state using Gaussian Elimination (High Performance).
     */
    static solve(solver, visibleGrid, flags, frontier) {
        // Fast exit
        if (frontier.length === 0) return { progress: false, safe: [], mines: [] };

        const width = visibleGrid.length;
        const height = visibleGrid[0].length;

        // 1. Decompose Frontier into Connected Components (Optimized)
        const components = this.getConnectedComponentsOptimized(solver, visibleGrid, frontier, width, height);

        let progress = false;
        let allSafe = [];
        let allMines = [];

        // 2. Solve each component independently
        for (const component of components) {
            // STRICT LIMIT: Break large components into windows of 45-60 variables.
            // This ensures <10ms solve time per chunk.
            const MAX_COMPONENT_SIZE = 50;

            if (component.length > MAX_COMPONENT_SIZE) {
                const results = this.solveLargeComponent(solver, visibleGrid, flags, component, MAX_COMPONENT_SIZE, width, height);
                if (results.progress) {
                    progress = true;
                    // Deduplicate results carefully
                    for (const s of results.safe) {
                        if (!this.isSafeInList(allSafe, s)) allSafe.push(s);
                    }
                    for (const m of results.mines) {
                        if (!this.isMineInList(allMines, m)) allMines.push(m);
                    }
                }
            } else {
                const result = this.solveComponent(solver, visibleGrid, flags, component, width, height);
                if (result.progress) {
                    progress = true;
                    // Deduplicate
                    for (const s of result.safe) {
                        if (!this.isSafeInList(allSafe, s)) allSafe.push(s);
                    }
                    for (const m of result.mines) {
                        if (!this.isMineInList(allMines, m)) allMines.push(m);
                    }
                }
            }
        }

        return { progress, safe: allSafe, mines: allMines };
    }

    /**
     * Optimized Component Search using a flat visited array.
     * Avoids Map/Set allocations. O(N) where N is affected area size.
     */
    static getConnectedComponentsOptimized(solver, visibleGrid, frontier, width, height) {
        const components = [];
        // Flattened visited array: 0 = unvisited, 1 = visited
        // Index = x * height + y (column-major to match visibleGrid[x][y]?) 
        // Wait, cellKey(x,y) uses bit packing usually, but here we need array index.
        // Let's use y * width + x for standard row-major, or x * height + y.
        // visibleGrid is [x][y], so let's stick to that structure if easy.
        // Actually, just use a 1D array of size width*height.
        const visited = new Uint8Array(width * height);

        // Mark all non-frontier cells as "visited" or just check frontier membership?
        // Better: iterate frontier. If not visited, start BFS.

        // To check quickly if a neighbor is in frontier, we need a lookup.
        // Re-use the visited array? No, visited tracks BFS progress.
        // We need a "isFrontier" lookup. 
        // 0 = not frontier, 1 = in frontier, 2 = visited in BFS
        const frontierMap = new Int32Array(width * height).fill(0);

        for (const f of frontier) {
            frontierMap[f.x * height + f.y] = 1; // Mark as frontier
        }

        for (const cell of frontier) {
            const idx = cell.x * height + cell.y;
            if (frontierMap[idx] === 2) continue; // Already visited

            const component = [];
            const queue = [cell];
            frontierMap[idx] = 2; // Mark visited
            component.push(cell);

            // BFS
            let head = 0;
            while (head < queue.length) {
                const current = queue[head++];

                // Get clues adjacent to this hidden cell
                const clues = solver.getCachedNeighbors(current.x, current.y);

                for (const clue of clues) {
                    if (visibleGrid[clue.x][clue.y] > 0) {
                        // This neighbor is a clue. get its hidden neighbors.
                        const hiddenNeighbors = solver.getCachedNeighbors(clue.x, clue.y);
                        for (const hidden of hiddenNeighbors) {
                            const hIdx = hidden.x * height + hidden.y;
                            // Check if this hidden cell is in frontier and not visited
                            if (frontierMap[hIdx] === 1) {
                                frontierMap[hIdx] = 2; // Mark visited
                                queue.push(hidden);
                                component.push(hidden);
                            }
                        }
                    }
                }
            }
            components.push(component);
        }

        return components;
    }

    static solveLargeComponent(solver, visibleGrid, flags, bigComponent, windowSize, width, height) {
        // Sort for spatial locality (row-major)
        bigComponent.sort((a, b) => (a.y - b.y) || (a.x - b.x));

        let progress = false;
        let safe = [];
        let mines = [];

        // Sliding window with overlap
        const step = Math.floor(windowSize / 2);

        for (let i = 0; i < bigComponent.length; i += step) {
            const chunk = bigComponent.slice(i, i + windowSize);
            if (chunk.length === 0) break;

            const result = this.solveComponent(solver, visibleGrid, flags, chunk, width, height);

            if (result.progress) {
                progress = true;
                for (const s of result.safe) {
                    if (!this.isSafeInList(safe, s)) safe.push(s);
                }
                for (const m of result.mines) {
                    if (!this.isMineInList(mines, m)) mines.push(m);
                }
            }
        }

        return { progress, safe, mines };
    }

    /**
     * Solves a single connected component.
     * Uses flat index mapping for O(1) variable lookup.
     */
    static solveComponent(solver, visibleGrid, flags, component, width, height) {
        // 1. Identify Variables using Index Map
        // Map (x,y) -> column index 0..N-1
        // Use Int16Array for index map (allows up to 32k variables, plenty, and -1)
        const varIndexMap = new Int16Array(width * height).fill(-1);
        const variables = component; // Access via component[i]

        for (let i = 0; i < component.length; i++) {
            const cell = component[i];
            varIndexMap[cell.x * height + cell.y] = i;
        }

        const numVars = component.length;
        if (numVars === 0) return { progress: false, safe: [], mines: [] };

        // 2. Identify Equations (Rows)
        // Check only clues adjacent to at least one variable
        // To avoid duplicates, track processed clues.
        const equations = [];
        // Bitset or array for processed clues?
        // Clues are at (x,y). Use same flat index.
        const processedClues = new Uint8Array(width * height); // 0 or 1

        for (const cell of component) {
            const neighbors = solver.getCachedNeighbors(cell.x, cell.y);
            for (const n of neighbors) {
                // n is a potential clue
                const val = visibleGrid[n.x][n.y];
                if (val > 0) {
                    const clueIdx = n.x * height + n.y;
                    if (processedClues[clueIdx] === 1) continue;
                    processedClues[clueIdx] = 1;

                    // Build equation
                    const eqNeighbors = []; // indices of variables
                    let flaggedCount = 0;
                    let validEquation = true;

                    const clueNeighbors = solver.getCachedNeighbors(n.x, n.y);
                    for (const cn of clueNeighbors) {
                        if (flags[cn.x][cn.y]) {
                            flaggedCount++;
                        } else if (visibleGrid[cn.x][cn.y] === -1) {
                            // Is this hidden neighbor a variable in our system?
                            const vIdx = varIndexMap[cn.x * height + cn.y];
                            if (vIdx !== -1) {
                                eqNeighbors.push(vIdx);
                            } else {
                                // Neighbor is hidden but NOT in our component/window.
                                // We cannot use this clue accurately.
                                validEquation = false;
                                break;
                            }
                        }
                    }

                    if (validEquation) {
                        equations.push({
                            neighbors: eqNeighbors,
                            target: val - flaggedCount
                        });
                    }
                }
            }
        }

        if (equations.length === 0) return { progress: false, safe: [], mines: [] };

        // 3. Construct Matrix
        const M = equations.length;
        const N = numVars;

        // Flattened matrix M * (N+1)
        // Or array of TypedArrays? Array of Float32Array is good.
        // Or single Float32Array. Let's use Array of Float32Array for row swapping convenience.
        const matrix = new Array(M);
        for (let i = 0; i < M; i++) {
            const row = new Float32Array(N + 1); // init 0
            const eq = equations[i];
            for (let k = 0; k < eq.neighbors.length; k++) {
                row[eq.neighbors[k]] = 1;
            }
            row[N] = eq.target;
            matrix[i] = row;
        }

        // 4. Gaussian Elimination
        this.computeRREF(matrix, M, N);

        // 5. Reasoning
        const safe = [];
        const mines = [];
        let progress = false;

        for (let i = 0; i < M; i++) {
            const row = matrix[i];

            // Optimization: check if row is empty/zero quickly?
            // Just scan.
            let minVal = 0;
            let maxVal = 0;
            // Collect vars with non-zero coeff
            // We can reuse a pre-allocated array if we want, but local is fine for now.

            // Actually, we need to scan the row to find coeffs
            // For N=50, this loop is tiny.
            let hasNonZero = false;
            let target = row[N];

            // Variables in this row
            // We can store them as {index, coeff} objects or just iterate indices
            const varsInRow = []; // indices

            for (let j = 0; j < N; j++) {
                const coeff = row[j];
                if (Math.abs(coeff) > 0.001) {
                    hasNonZero = true;
                    if (coeff > 0) maxVal += coeff;
                    else minVal += coeff;
                    varsInRow.push(j);
                }
            }

            if (!hasNonZero) continue;

            if (Math.abs(target - minVal) < 0.001) {
                // All negative coeffs are MINES, positive are SAFE
                for (const idx of varsInRow) {
                    const coeff = row[idx];
                    const cell = variables[idx];
                    if (coeff < 0) { // Mine
                        if (!this.isMineInList(mines, cell)) mines.push(cell);
                    } else { // Safe
                        if (!this.isSafeInList(safe, cell)) safe.push(cell);
                    }
                }
            } else if (Math.abs(target - maxVal) < 0.001) {
                // All positive coeffs are MINES, negative are SAFE
                for (const idx of varsInRow) {
                    const coeff = row[idx];
                    const cell = variables[idx];
                    if (coeff > 0) { // Mine
                        if (!this.isMineInList(mines, cell)) mines.push(cell);
                    } else { // Safe
                        if (!this.isSafeInList(safe, cell)) safe.push(cell);
                    }
                }
            }
        }

        if (safe.length > 0 || mines.length > 0) progress = true;
        return { progress, safe, mines };
    }

    static isMineInList(list, cell) {
        // With small lists, linear scan is fast.
        // Can optimize using Set/Map but overhead might not be worth it for < 10 items.
        for (let i = 0; i < list.length; i++) {
            if (list[i].x === cell.x && list[i].y === cell.y) return true;
        }
        return false;
    }

    static isSafeInList(list, cell) {
        for (let i = 0; i < list.length; i++) {
            if (list[i].x === cell.x && list[i].y === cell.y) return true;
        }
        return false;
    }

    // Standard RREF (unchanged logic)
    static computeRREF(matrix, M, N) {
        let lead = 0;
        for (let r = 0; r < M; r++) {
            if (N <= lead) return;
            let i = r;
            while (matrix[i][lead] === 0) {
                i++;
                if (M === i) {
                    i = r;
                    lead++;
                    if (N === lead) return;
                }
            }
            if (i !== r) {
                const temp = matrix[i];
                matrix[i] = matrix[r];
                matrix[r] = temp;
            }
            let val = matrix[r][lead];
            if (Math.abs(val) < 0.000001) {
                lead++;
                r--;
                continue;
            }
            for (let j = 0; j <= N; j++) {
                matrix[r][j] /= val;
            }
            for (let k = 0; k < M; k++) {
                if (k !== r) {
                    val = matrix[k][lead];
                    if (Math.abs(val) > 0.000001) {
                        for (let j = 0; j <= N; j++) {
                            matrix[k][j] -= val * matrix[r][j];
                        }
                    }
                }
            }
            lead++;
        }
    }
}
