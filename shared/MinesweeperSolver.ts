import { GaussianElimination } from './GaussianElimination.js';
import type { Cell, Grid, GameState, HintResult, HintWithExplanation } from './types.js';

// ─── Internal types ─────────────────────────────────────────────────────────

interface BasicRulesResult {
    progress: boolean;
    flagCount: number;
    dirtyCells: Set<number>;
}

interface ContradictionResult {
    progress: boolean;
    flagCount: number;
    changedCell: Cell | null;
}

interface GaussianSolveResult {
    progress: boolean;
    flagCount: number;
    changedCells: Cell[];
}

interface TankSolveResult {
    progress: boolean;
    flagCount: number;
    changedCells: Cell[];
}

interface GlobalMineCountResult {
    progress: boolean;
    flagCount: number;
}

interface RegionConstraint {
    x: number;
    y: number;
    value: number;
    remaining: number;
    cellsInRegion: Cell[];
    cellsInRegionIndices: number[];
    cellsOutside: Cell[];
}

interface ConstraintData {
    x: number;
    y: number;
    hiddenSet: Set<number>;
    hiddenList: Cell[];
    remaining: number;
}

interface ConfigAnalysis {
    definiteMines: Cell[];
    definiteSafes: Cell[];
}

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
 * @module MinesweeperSolver
 * @author 3D Minesweeper Team
 */
export class MinesweeperSolver {
    static MAX_CONFIGURATIONS = 50000;
    static MAX_REGION_SIZE = 15;
    static neighborCache: Cell[][][] | null = null;
    static cacheWidth = 0;
    static cacheHeight = 0;

    static initNeighborCache(width: number, height: number): Cell[][][] {
        if (this.neighborCache && this.cacheWidth === width && this.cacheHeight === height) {
            return this.neighborCache;
        }

        this.neighborCache = new Array(width);
        for (let x = 0; x < width; x++) {
            this.neighborCache[x] = new Array(height);
            for (let y = 0; y < height; y++) {
                const neighbors: Cell[] = [];
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

    static getCachedNeighbors(x: number, y: number): Cell[] {
        return this.neighborCache![x][y];
    }

    static cellKey(x: number, y: number): number {
        return (x << 16) | y;
    }

    static decodeKey(key: number): Cell {
        return { x: key >> 16, y: key & 0xFFFF };
    }

    static isSolvable(game: GameState, startX: number, startY: number): boolean {
        const grid = game.grid;
        const width = game.width;
        const height = game.height;
        const bombCount = game.bombCount;

        this.initNeighborCache(width, height);

        const visibleGrid: Grid<number> = Array(width).fill(null).map(() => Array(height).fill(-1));
        const flags: Grid<boolean> = Array(width).fill(null).map(() => Array(height).fill(false));

        let flagCount = 0;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                this.simulateReveal(grid, visibleGrid, flags, width, height, startX + dx, startY + dy);
            }
        }

        let progress = true;
        let iterations = 0;
        const maxIterations = width * height * 2;

        let dirtyCells = new Set<number>();
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

            const basicResult = this.applyBasicRules(grid, visibleGrid, flags, width, height, dirtyCells, flagCount);
            if (basicResult.progress) {
                progress = true;
                flagCount = basicResult.flagCount;
                dirtyCells = basicResult.dirtyCells;
                continue;
            }

            const subsetResult = this.applySubsetLogic(grid, visibleGrid, flags, width, height, dirtyCells, flagCount);
            if (subsetResult.progress) {
                progress = true;
                flagCount = subsetResult.flagCount;
                dirtyCells = subsetResult.dirtyCells;
                continue;
            }

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

            const globalResult = this.applyGlobalMineCount(grid, visibleGrid, flags, width, height, bombCount, flagCount);
            if (globalResult.progress) {
                progress = true;
                flagCount = globalResult.flagCount;
                continue;
            }
        }

        let revealedCount = 0;
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (visibleGrid[x][y] !== -1) revealedCount++;
            }
        }

        return revealedCount === (width * height - bombCount);
    }

    static applyBasicRules(
        grid: Grid<number>,
        visibleGrid: Grid<number>,
        flags: Grid<boolean>,
        width: number,
        height: number,
        dirtyCells: Set<number>,
        flagCount: number
    ): BasicRulesResult {
        let progress = false;
        const newDirtyCells = new Set<number>();
        const processedCells = new Set<number>();

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
            const hiddenCells: Cell[] = [];

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

    static applySubsetLogic(
        grid: Grid<number>,
        visibleGrid: Grid<number>,
        flags: Grid<boolean>,
        width: number,
        height: number,
        dirtyCells: Set<number>,
        flagCount: number
    ): BasicRulesResult {
        let progress = false;
        const newDirtyCells = new Set<number>();

        const constraintCells = new Set<number>();
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

        const cellData = new Map<number, ConstraintData>();
        for (const key of constraintCells) {
            const { x, y } = this.decodeKey(key);
            const val = visibleGrid[x][y];
            if (val <= 0) continue;

            const neighbors = this.getCachedNeighbors(x, y);
            const hiddenSet = new Set<number>();
            const hiddenList: Cell[] = [];
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
                            if (!dataB.hiddenSet.has(k)) {
                                isSubset = false;
                                break;
                            }
                        }

                        if (isSubset) {
                            const diff: Cell[] = [];
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

    static solveByContradiction(
        grid: Grid<number>,
        visibleGrid: Grid<number>,
        flags: Grid<boolean>,
        width: number,
        height: number,
        flagCount: number
    ): ContradictionResult {
        const frontier = this.getFrontier(visibleGrid, flags, width, height);
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

    static checkContradiction(
        visibleGrid: Grid<number>,
        flags: Grid<boolean>,
        width: number,
        height: number,
        assumptionCell: Cell,
        assumeMine: boolean
    ): boolean {
        const simFlags = new Map<number, boolean>();
        const simRevealed = new Map<number, boolean>();

        const getFlag = (x: number, y: number): boolean => {
            const k = this.cellKey(x, y);
            return simFlags.has(k) ? simFlags.get(k)! : flags[x][y];
        };
        const setFlag = (x: number, y: number) => simFlags.set(this.cellKey(x, y), true);
        const isAssumedSafe = (x: number, y: number) => simRevealed.has(this.cellKey(x, y));
        const setAssumedSafe = (x: number, y: number) => simRevealed.set(this.cellKey(x, y), true);

        if (assumeMine) {
            setFlag(assumptionCell.x, assumptionCell.y);
        } else {
            setAssumedSafe(assumptionCell.x, assumptionCell.y);
        }

        let changed = true;
        let iterations = 0;
        const maxIterations = 20;

        const toCheck = new Set<number>();
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
                const hiddenCells: Cell[] = [];

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

    static solveByGaussianElimination(
        grid: Grid<number>,
        visibleGrid: Grid<number>,
        flags: Grid<boolean>,
        width: number,
        height: number,
        flagCount: number
    ): GaussianSolveResult {
        const frontier = this.getFrontier(visibleGrid, flags, width, height);
        if (frontier.length === 0) return { progress: false, flagCount, changedCells: [] };

        const result = GaussianElimination.solve(this, visibleGrid, flags, frontier);

        let progress = false;
        const changedCells: Cell[] = [];

        if (result.progress) {
            progress = true;

            for (const cell of result.mines) {
                if (!flags[cell.x][cell.y]) {
                    flags[cell.x][cell.y] = true;
                    flagCount++;
                    changedCells.push(cell);
                }
            }

            for (const cell of result.safe) {
                if (visibleGrid[cell.x][cell.y] === -1) {
                    this.simulateReveal(grid, visibleGrid, flags, width, height, cell.x, cell.y);
                    changedCells.push(cell);
                }
            }
        }

        return { progress, flagCount, changedCells };
    }

    static tankSolver(
        grid: Grid<number>,
        visibleGrid: Grid<number>,
        flags: Grid<boolean>,
        width: number,
        height: number,
        bombCount: number,
        flagCount: number
    ): TankSolveResult {
        const frontier = this.getFrontier(visibleGrid, flags, width, height);
        if (frontier.length === 0) return { progress: false, flagCount, changedCells: [] };

        const regions = this.groupFrontierRegions(frontier, visibleGrid, width, height);
        regions.sort((a, b) => a.length - b.length);

        const changedCells: Cell[] = [];

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

    static getFrontier(visibleGrid: Grid<number>, flags: Grid<boolean>, width: number, height: number): Cell[] {
        const frontier: Cell[] = [];
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

    static groupFrontierRegions(frontier: Cell[], visibleGrid: Grid<number>, width: number, height: number): Cell[][] {
        if (frontier.length === 0) return [];

        const regions: Cell[][] = [];
        const visited = new Set<number>();

        const frontierSet = new Set<number>();
        for (const f of frontier) {
            frontierSet.add(this.cellKey(f.x, f.y));
        }

        for (const startCell of frontier) {
            const startKey = this.cellKey(startCell.x, startCell.y);
            if (visited.has(startKey)) continue;

            const region: Cell[] = [];
            const queue: Cell[] = [startCell];
            const queueSet = new Set<number>([startKey]);

            while (queue.length > 0) {
                const cell = queue.shift()!;
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

    static getRegionConstraints(
        region: Cell[],
        visibleGrid: Grid<number>,
        flags: Grid<boolean>,
        width: number,
        height: number
    ): RegionConstraint[] {
        const constraintSet = new Set<number>();
        const constraints: RegionConstraint[] = [];

        const regionSet = new Set<number>();
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
                    const cellsInRegion: Cell[] = [];
                    const cellsInRegionIndices: number[] = [];
                    const cellsOutside: Cell[] = [];

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

    static countFlags(flags: Grid<boolean>, width: number, height: number): number {
        let count = 0;
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (flags[x][y]) count++;
            }
        }
        return count;
    }

    static enumerateConfigurations(region: Cell[], constraints: RegionConstraint[], maxMines: number): boolean[][] {
        const validConfigs: boolean[][] = [];
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
                const config: boolean[] = [];
                for (let i = 0; i < region.length; i++) {
                    config.push(((mask >> i) & 1) ? true : false);
                }
                validConfigs.push(config);
            }
        }

        return validConfigs;
    }

    static countBits(n: number): number {
        let count = 0;
        while (n) {
            count += n & 1;
            n >>= 1;
        }
        return count;
    }

    static isValidConfiguration(region: Cell[], config: boolean[], constraints: RegionConstraint[]): boolean {
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

    static analyzeConfigurations(region: Cell[], validConfigs: boolean[][]): ConfigAnalysis {
        const definiteMines: Cell[] = [];
        const definiteSafes: Cell[] = [];

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

    static applyGlobalMineCount(
        grid: Grid<number>,
        visibleGrid: Grid<number>,
        flags: Grid<boolean>,
        width: number,
        height: number,
        bombCount: number,
        flagCount: number
    ): GlobalMineCountResult {
        const totalHiddenCells: Cell[] = [];

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

    static getHintWithExplanation(game: GameState): HintWithExplanation | null {
        const { width, height, visibleGrid, flags, grid, bombCount } = game;
        this.initNeighborCache(width, height);

        const vgCopy: Grid<number> = Array(width).fill(null).map((_, x) => [...visibleGrid[x]]);
        const fCopy: Grid<boolean> = Array(width).fill(null).map((_, x) => [...flags[x]]);

        let flagCount = 0;
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (fCopy[x][y]) flagCount++;
            }
        }

        let dirtyCells = new Set<number>();
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
        {
            const processedCells = new Set<number>();
            for (const key of dirtyCells) {
                const { x, y } = this.decodeKey(key);
                if (x < 0 || x >= width || y < 0 || y >= height) continue;
                const val = vgCopy[x][y];
                if (val <= 0) continue;
                if (processedCells.has(key)) continue;
                processedCells.add(key);

                const neighbors = this.getCachedNeighbors(x, y);
                let flaggedCount = 0;
                const hiddenCells: Cell[] = [];

                for (const n of neighbors) {
                    if (fCopy[n.x][n.y]) {
                        flaggedCount++;
                    } else if (vgCopy[n.x][n.y] === -1) {
                        hiddenCells.push(n);
                    }
                }

                if (hiddenCells.length === 0) continue;

                if (val === hiddenCells.length + flaggedCount) {
                    continue;
                }

                if (val === flaggedCount && hiddenCells.length > 0) {
                    const target = hiddenCells[0];
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

                for (const key of dirtyCells) {
                    const { x, y } = this.decodeKey(key);
                    if (x < 0 || x >= width || y < 0 || y >= height) continue;
                    const val = vgCopy[x][y];
                    if (val <= 0) continue;

                    const neighbors = this.getCachedNeighbors(x, y);
                    let fc = 0;
                    const hidden: Cell[] = [];
                    for (const n of neighbors) {
                        if (fCopy[n.x][n.y]) fc++;
                        else if (vgCopy[n.x][n.y] === -1) hidden.push(n);
                    }

                    if (hidden.length > 0 && val === fc) {
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
            const constraintCells = new Set<number>();
            for (const key of dirtyCells) {
                const { x, y } = this.decodeKey(key);
                if (x < 0 || x >= width || y < 0 || y >= height) continue;
                if (vgCopy[x][y] > 0) constraintCells.add(key);
                for (const n of this.getCachedNeighbors(x, y)) {
                    if (vgCopy[n.x][n.y] > 0) constraintCells.add(this.cellKey(n.x, n.y));
                }
            }

            const cellData = new Map<number, ConstraintData>();
            for (const key of constraintCells) {
                const { x, y } = this.decodeKey(key);
                const val = vgCopy[x][y];
                if (val <= 0) continue;

                const neighbors = this.getCachedNeighbors(x, y);
                const hiddenSet = new Set<number>();
                const hiddenList: Cell[] = [];
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
                                const diff: Cell[] = [];
                                for (const n of dataB.hiddenList) {
                                    if (!dataA.hiddenSet.has(this.cellKey(n.x, n.y))) diff.push(n);
                                }
                                const diffMines = dataB.remaining - dataA.remaining;

                                if (diffMines === 0 && diff.length > 0) {
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
                        const cCells: Cell[] = [];
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
                if (this.checkContradiction(vgCopy, fCopy, width, height, cell, true)) {
                    if (visibleGrid[cell.x][cell.y] === -1 && !flags[cell.x][cell.y]) {
                        const cCells: Cell[] = [];
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
            const totalHidden: Cell[] = [];
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

    static getHint(game: GameState): HintResult | null {
        const { width, height, visibleGrid, flags, mines, grid: gridNumbers } = game;

        this.initNeighborCache(width, height);

        let safeFrontier: HintResult[] = [];

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

        let safeIsland: HintResult[] = [];
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

    static simulateReveal(
        grid: Grid<number>,
        visibleGrid: Grid<number>,
        flags: Grid<boolean>,
        width: number,
        height: number,
        startX: number,
        startY: number
    ): void {
        const stack: [number, number][] = [[startX, startY]];
        while (stack.length > 0) {
            const [x, y] = stack.pop()!;
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

    static getNeighbors(x: number, y: number, width: number, height: number): Cell[] {
        const neighbors: Cell[] = [];
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
