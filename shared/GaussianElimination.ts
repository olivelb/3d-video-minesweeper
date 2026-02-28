/**
 * Gaussian Elimination Strategy for Minesweeper
 * 
 * Optimized Version:
 * - Uses flat Int32Array for O(1) lookups instead of Map/Set (avoiding allocation overhead).
 * - Implements strict component windowing to split large systems.
 * - Reduces matrix size by only considering relevant variables.
 */

import type { Cell, GaussianResult, GaussianEquation, SolverLike, Grid } from './types.js';

export class GaussianElimination {

    /**
     * Solve the local board state using Gaussian Elimination (High Performance).
     */
    static solve(solver: SolverLike, visibleGrid: Grid<number>, flags: Grid<boolean>, frontier: Cell[]): GaussianResult {
        // Fast exit
        if (frontier.length === 0) return { progress: false, safe: [], mines: [] };

        const width = visibleGrid.length;
        const height = visibleGrid[0].length;

        // 1. Decompose Frontier into Connected Components (Optimized)
        const components = this.getConnectedComponentsOptimized(solver, visibleGrid, frontier, width, height);

        let progress = false;
        let allSafe: Cell[] = [];
        let allMines: Cell[] = [];

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
    static getConnectedComponentsOptimized(
        solver: SolverLike,
        visibleGrid: Grid<number>,
        frontier: Cell[],
        width: number,
        height: number
    ): Cell[][] {
        const components: Cell[][] = [];
        const frontierMap = new Int32Array(width * height).fill(0);

        for (const f of frontier) {
            frontierMap[f.x * height + f.y] = 1; // Mark as frontier
        }

        for (const cell of frontier) {
            const idx = cell.x * height + cell.y;
            if (frontierMap[idx] === 2) continue; // Already visited

            const component: Cell[] = [];
            const queue: Cell[] = [cell];
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

    static solveLargeComponent(
        solver: SolverLike,
        visibleGrid: Grid<number>,
        flags: Grid<boolean>,
        bigComponent: Cell[],
        windowSize: number,
        width: number,
        height: number
    ): GaussianResult {
        // Sort for spatial locality (row-major)
        bigComponent.sort((a, b) => (a.y - b.y) || (a.x - b.x));

        let progress = false;
        let safe: Cell[] = [];
        let mines: Cell[] = [];

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
    static solveComponent(
        solver: SolverLike,
        visibleGrid: Grid<number>,
        flags: Grid<boolean>,
        component: Cell[],
        width: number,
        height: number
    ): GaussianResult {
        // 1. Identify Variables using Index Map
        const varIndexMap = new Int16Array(width * height).fill(-1);
        const variables = component;

        for (let i = 0; i < component.length; i++) {
            const cell = component[i];
            varIndexMap[cell.x * height + cell.y] = i;
        }

        const numVars = component.length;
        if (numVars === 0) return { progress: false, safe: [], mines: [] };

        // 2. Identify Equations (Rows)
        const equations: GaussianEquation[] = [];
        const processedClues = new Uint8Array(width * height);

        for (const cell of component) {
            const neighbors = solver.getCachedNeighbors(cell.x, cell.y);
            for (const n of neighbors) {
                const val = visibleGrid[n.x][n.y];
                if (val > 0) {
                    const clueIdx = n.x * height + n.y;
                    if (processedClues[clueIdx] === 1) continue;
                    processedClues[clueIdx] = 1;

                    // Build equation
                    const eqNeighbors: number[] = [];
                    let flaggedCount = 0;
                    let validEquation = true;

                    const clueNeighbors = solver.getCachedNeighbors(n.x, n.y);
                    for (const cn of clueNeighbors) {
                        if (flags[cn.x][cn.y]) {
                            flaggedCount++;
                        } else if (visibleGrid[cn.x][cn.y] === -1) {
                            const vIdx = varIndexMap[cn.x * height + cn.y];
                            if (vIdx !== -1) {
                                eqNeighbors.push(vIdx);
                            } else {
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

        const matrix: Float32Array[] = new Array(M);
        for (let i = 0; i < M; i++) {
            const row = new Float32Array(N + 1);
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
        const safe: Cell[] = [];
        const mines: Cell[] = [];
        let progress = false;

        for (let i = 0; i < M; i++) {
            const row = matrix[i];

            let minVal = 0;
            let maxVal = 0;
            let hasNonZero = false;
            let target = row[N];

            const varsInRow: number[] = [];

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
                    if (coeff < 0) {
                        if (!this.isMineInList(mines, cell)) mines.push(cell);
                    } else {
                        if (!this.isSafeInList(safe, cell)) safe.push(cell);
                    }
                }
            } else if (Math.abs(target - maxVal) < 0.001) {
                // All positive coeffs are MINES, negative are SAFE
                for (const idx of varsInRow) {
                    const coeff = row[idx];
                    const cell = variables[idx];
                    if (coeff > 0) {
                        if (!this.isMineInList(mines, cell)) mines.push(cell);
                    } else {
                        if (!this.isSafeInList(safe, cell)) safe.push(cell);
                    }
                }
            }
        }

        if (safe.length > 0 || mines.length > 0) progress = true;
        return { progress, safe, mines };
    }

    static isMineInList(list: Cell[], cell: Cell): boolean {
        for (let i = 0; i < list.length; i++) {
            if (list[i].x === cell.x && list[i].y === cell.y) return true;
        }
        return false;
    }

    static isSafeInList(list: Cell[], cell: Cell): boolean {
        for (let i = 0; i < list.length; i++) {
            if (list[i].x === cell.x && list[i].y === cell.y) return true;
        }
        return false;
    }

    // Standard RREF (unchanged logic)
    static computeRREF(matrix: Float32Array[], M: number, N: number): void {
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
