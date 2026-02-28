/**
 * Core type definitions for 3D Video Minesweeper.
 * 
 * Shared between client, server, and solver modules.
 */

// ─── Geometry ───────────────────────────────────────────────────────────────

/** A cell coordinate on the grid. */
export interface Cell {
    x: number;
    y: number;
}

// ─── Grid Types ─────────────────────────────────────────────────────────────

/**
 * Cell visibility values:
 * - `-1` = hidden
 * - `0..8` = revealed (neighbour mine count)
 * - `9` = exploded mine
 * - `10` = revealed bomb (multiplayer death-flag)
 */
export type CellValue = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** 2D column-major grid of numbers (grid[x][y]). */
export type Grid<T = number> = T[][];

// ─── Game State ─────────────────────────────────────────────────────────────

/** Core game state properties used by the solver. */
export interface GameState {
    width: number;
    height: number;
    bombCount: number;
    grid: Grid<number>;
    visibleGrid: Grid<number>;
    mines: Grid<boolean>;
    flags: Grid<boolean>;
    flagCount: number;
    gameOver: boolean;
    victory: boolean;
    firstClick: boolean;
}

// ─── Results ────────────────────────────────────────────────────────────────

/** A single cell change from a reveal/chord action. */
export interface CellChange {
    x: number;
    y: number;
    value: number;
}

/** Result of a game action (reveal, flag, chord). */
export interface ActionResult {
    type: 'reveal' | 'explode' | 'win' | 'flag' | 'none' | 'revealedBomb';
    changes?: CellChange[];
    x?: number;
    y?: number;
    active?: boolean;
}

/** Result of mine placement. */
export type PlaceMinesResult = true | { cancelled: boolean } | { warning: boolean };

// ─── Solver ─────────────────────────────────────────────────────────────────

/** Hint result from the solver. */
export interface HintResult {
    x: number;
    y: number;
    score: number;
    type?: string;
}

/** Hint result with explanation data. */
export interface HintWithExplanation extends HintResult {
    strategy?: string;
    constraintCells?: Cell[];
    explanationData?: Record<string, unknown>;
}

/** Result from Gaussian Elimination. */
export interface GaussianResult {
    progress: boolean;
    safe: Cell[];
    mines: Cell[];
}

// ─── Solver internals ───────────────────────────────────────────────────────

/** Equation for the Gaussian Elimination matrix. */
export interface GaussianEquation {
    neighbors: number[];
    target: number;
}

/** Solver class interface (static methods consumed by SolverBridge). */
export interface SolverLike {
    getCachedNeighbors(x: number, y: number): Cell[];
    initNeighborCache(width: number, height: number): Cell[][][];
    cellKey(x: number, y: number): number;
    decodeKey(key: number): Cell;
}
