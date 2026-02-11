/**
 * SolverBridge — Unified solver interface with WASM acceleration and JS fallback.
 * 
 * Lazy-loads the WASM solver module. If WASM is unavailable (e.g. older browser,
 * Node.js without WASM support), falls back to the original JS MinesweeperSolver.
 * 
 * ## API
 * 
 * ```javascript
 * import { SolverBridge } from './SolverBridge.js';
 * 
 * // Initialize (call once at startup)
 * await SolverBridge.init();
 * 
 * // Same API as MinesweeperSolver
 * const solvable = SolverBridge.isSolvable(game, startX, startY);
 * const hint = SolverBridge.getHint(game);
 * ```
 */

import { MinesweeperSolver } from './MinesweeperSolver.js';

// ─── State ──────────────────────────────────────────────────────────────────

let wasmModule = null;
let wasmReady = false;
let initPromise = null;

// ─── 2D ↔ Flat Conversion Helpers ──────────────────────────────────────────

/**
 * Flatten a 2D column-major array to a typed array.
 * JS `arr[x][y]` → flat `out[x * height + y]`.
 * 
 * @param {Array<Array<*>>} arr2d - 2D array [width][height]
 * @param {number} width
 * @param {number} height
 * @param {Function} TypedArrayCtor - Int8Array or Uint8Array
 * @returns {Int8Array|Uint8Array}
 */
function flatten2D(arr2d, width, height, TypedArrayCtor) {
    const flat = new TypedArrayCtor(width * height);
    for (let x = 0; x < width; x++) {
        const col = arr2d[x];
        const offset = x * height;
        for (let y = 0; y < height; y++) {
            flat[offset + y] = col[y];
        }
    }
    return flat;
}

/**
 * Flatten a boolean 2D array to Uint8Array (true→1, false→0).
 */
function flattenBool2D(arr2d, width, height) {
    const flat = new Uint8Array(width * height);
    for (let x = 0; x < width; x++) {
        const col = arr2d[x];
        const offset = x * height;
        for (let y = 0; y < height; y++) {
            flat[offset + y] = col[y] ? 1 : 0;
        }
    }
    return flat;
}

/**
 * Unflatten a typed array back to 2D column-major.
 * flat `arr[x * height + y]` → JS `out[x][y]`.
 */
function unflatten2D(flat, width, height) {
    const arr2d = new Array(width);
    for (let x = 0; x < width; x++) {
        arr2d[x] = new Array(height);
        const offset = x * height;
        for (let y = 0; y < height; y++) {
            arr2d[x][y] = flat[offset + y];
        }
    }
    return arr2d;
}

/**
 * Unflatten Uint8Array to boolean 2D array.
 */
function unflattenBool2D(flat, width, height) {
    const arr2d = new Array(width);
    for (let x = 0; x < width; x++) {
        arr2d[x] = new Array(height);
        const offset = x * height;
        for (let y = 0; y < height; y++) {
            arr2d[x][y] = flat[offset + y] !== 0;
        }
    }
    return arr2d;
}

// ─── WASM Loader ────────────────────────────────────────────────────────────

/**
 * Attempt to load the WASM module.
 * Works in both browser (ES module import) and Node.js environments.
 * 
 * @returns {Promise<boolean>} true if WASM loaded successfully
 */
async function loadWasm() {
    try {
        // Detect environment
        const isBrowser = typeof window !== 'undefined';
        const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

        if (isBrowser) {
            // Browser: dynamic import of the generated ES module
            const wasmUrl = new URL('./solver-wasm/pkg/solver_wasm.js', import.meta.url);
            const mod = await import(wasmUrl.href);

            // Initialize the WASM module
            const wasmBinaryUrl = new URL('./solver-wasm/pkg/solver_wasm_bg.wasm', import.meta.url);
            await mod.default({ module_or_path: wasmBinaryUrl });
            wasmModule = mod;
        } else if (isNode) {
            // Node.js: use file system path
            const { fileURLToPath } = await import('url');
            const { dirname, join } = await import('path');
            const { readFile } = await import('fs/promises');

            const __dirname = dirname(fileURLToPath(import.meta.url));
            const wasmJsPath = join(__dirname, 'solver-wasm', 'pkg', 'solver_wasm.js');
            const wasmBinPath = join(__dirname, 'solver-wasm', 'pkg', 'solver_wasm_bg.wasm');

            const mod = await import(wasmJsPath);
            const wasmBytes = await readFile(wasmBinPath);
            await mod.default({ module_or_path: wasmBytes });
            wasmModule = mod;
        }

        // Quick smoke test
        if (wasmModule && wasmModule.ping) {
            const pong = wasmModule.ping();
            if (pong === 'WASM solver ready') {
                return true;
            }
        }
        return false;
    } catch (err) {
        console.warn('[SolverBridge] WASM loading failed, using JS fallback:', err.message);
        return false;
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export class SolverBridge {

    /**
     * Initialize the solver bridge. Attempts to load WASM, falls back to JS.
     * Safe to call multiple times (subsequent calls return the same promise).
     * 
     * @returns {Promise<{backend: string}>} Which backend is active: 'wasm' or 'js'
     */
    static async init() {
        if (initPromise) return initPromise;

        initPromise = (async () => {
            wasmReady = await loadWasm();
            const backend = wasmReady ? 'wasm' : 'js';
            console.log(`[SolverBridge] Using ${backend} backend`);
            return { backend };
        })();

        return initPromise;
    }

    /**
     * Check if the WASM backend is active.
     * @returns {boolean}
     */
    static get isWasm() {
        return wasmReady;
    }

    /**
     * Check if a board is solvable without guessing.
     * Drop-in replacement for `MinesweeperSolver.isSolvable(game, startX, startY)`.
     * 
     * @param {Object} game - Game state object
     * @param {number} startX
     * @param {number} startY
     * @returns {boolean}
     */
    static isSolvable(game, startX, startY) {
        if (wasmReady) {
            const { width, height, grid, mines } = game;
            const gridFlat = flatten2D(grid, width, height, Int8Array);
            const minesFlat = flattenBool2D(mines, width, height);
            return wasmModule.isSolvable(width, height, gridFlat, minesFlat, startX, startY);
        }
        return MinesweeperSolver.isSolvable(game, startX, startY);
    }

    /**
     * Generate a solvable board entirely inside WASM.
     * This replaces the entire `do { placeMines(); } while (!isSolvable())` loop.
     * 
     * Only available when WASM is active. Returns null if WASM is not ready
     * (caller should use the traditional JS loop as fallback).
     * 
     * @param {number} width
     * @param {number} height
     * @param {number} bombCount
     * @param {number} safeX
     * @param {number} safeY
     * @param {number} safeRadius - typically 1
     * @param {number} maxAttempts
     * @returns {{ success: boolean, attempts: number, grid: Array<Array<number>>, mines: Array<Array<boolean>> } | null}
     */
    static generateSolvableBoard(width, height, bombCount, safeX, safeY, safeRadius, maxAttempts) {
        if (!wasmReady) return null;

        const result = wasmModule.generateSolvableBoard(
            width, height, bombCount, safeX, safeY, safeRadius, maxAttempts
        );

        return {
            success: result.success,
            attempts: result.attempts,
            grid: unflatten2D(result.grid, width, height),
            mines: unflattenBool2D(result.mines, width, height),
        };
    }

    /**
     * Get a hint for the current game state.
     * Drop-in replacement for `MinesweeperSolver.getHint(game)`.
     * 
     * @param {Object} game - Game state object
     * @returns {{ x: number, y: number, score: number } | null}
     */
    static getHint(game) {
        if (wasmReady) {
            const { width, height, grid, visibleGrid, flags, mines } = game;
            const gridFlat = flatten2D(grid, width, height, Int8Array);
            const visibleFlat = flatten2D(visibleGrid, width, height, Int8Array);
            const flagsFlat = flattenBool2D(flags, width, height);
            const minesFlat = flattenBool2D(mines, width, height);
            return wasmModule.getHint(width, height, gridFlat, visibleFlat, flagsFlat, minesFlat);
        }
        return MinesweeperSolver.getHint(game);
    }

    /**
     * Calculate neighbor mine counts (useful after mine placement).
     * 
     * @param {number} width
     * @param {number} height
     * @param {Array<Array<boolean>>} mines - 2D mine positions
     * @returns {Array<Array<number>>} 2D grid with counts 0-8
     */
    static calculateNumbers(width, height, mines) {
        if (wasmReady) {
            const minesFlat = flattenBool2D(mines, width, height);
            const resultFlat = wasmModule.calculateNumbers(width, height, minesFlat);
            return unflatten2D(resultFlat, width, height);
        }
        // JS fallback: inline calculation (same as Game.calculateNumbers)
        const grid = Array(width).fill().map(() => Array(height).fill(0));
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (mines[x][y]) continue;
                let count = 0;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height && mines[nx][ny]) {
                            count++;
                        }
                    }
                }
                grid[x][y] = count;
            }
        }
        return grid;
    }
}
