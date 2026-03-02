/**
 * SolverBridge — Unified solver interface with WASM acceleration and JS fallback.
 * 
 * Lazy-loads the WASM solver module. If WASM is unavailable (e.g. older browser,
 * Node.js without WASM support), falls back to the original JS MinesweeperSolver.
 */

import { MinesweeperSolver } from './MinesweeperSolver.js';
import type { GameState, Grid, HintResult, HintWithExplanation } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WasmModule {
    default(options: { module_or_path: URL | ArrayBufferLike }): Promise<void>;
    ping(): string;
    isSolvable(width: number, height: number, grid: Int8Array, mines: Uint8Array, startX: number, startY: number): boolean;
    getHint(width: number, height: number, grid: Int8Array, visible: Int8Array, flags: Uint8Array, mines: Uint8Array): HintResult | null;
    calculateNumbers(width: number, height: number, mines: Uint8Array): Int8Array;
    generateSolvableBoard(
        width: number, height: number, bombCount: number,
        safeX: number, safeY: number, safeRadius: number, maxAttempts: number
    ): { success: boolean; attempts: number; grid: Int8Array; mines: Uint8Array };
}

interface GenerateSolvableBoardResult {
    success: boolean;
    attempts: number;
    grid: Grid<number>;
    mines: Grid<boolean>;
}

// ─── State ──────────────────────────────────────────────────────────────────

let wasmModule: WasmModule | null = null;
let wasmReady = false;
let initPromise: Promise<{ backend: string }> | null = null;

// ─── 2D ↔ Flat Conversion Helpers ──────────────────────────────────────────

type TypedArrayConstructor = typeof Int8Array | typeof Uint8Array;

function flatten2D<T extends Int8Array | Uint8Array>(
    arr2d: Grid<number>,
    width: number,
    height: number,
    TypedArrayCtor: { new(length: number): T }
): T {
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

function flattenBool2D(arr2d: Grid<boolean>, width: number, height: number): Uint8Array {
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

function unflatten2D(flat: Int8Array | Uint8Array | number[], width: number, height: number): Grid<number> {
    const arr2d: Grid<number> = new Array(width);
    for (let x = 0; x < width; x++) {
        arr2d[x] = new Array(height);
        const offset = x * height;
        for (let y = 0; y < height; y++) {
            arr2d[x][y] = flat[offset + y];
        }
    }
    return arr2d;
}

function unflattenBool2D(flat: Uint8Array | number[], width: number, height: number): Grid<boolean> {
    const arr2d: Grid<boolean> = new Array(width);
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

async function loadWasm(): Promise<boolean> {
    try {
        const isBrowser = typeof window !== 'undefined';
        const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

        if (isBrowser) {
            const wasmUrl = new URL('./solver-wasm/pkg/solver_wasm.js', import.meta.url);
            const mod = await import(wasmUrl.href);

            const wasmBinaryUrl = new URL('./solver-wasm/pkg/solver_wasm_bg.wasm', import.meta.url);
            await mod.default({ module_or_path: wasmBinaryUrl });
            wasmModule = mod;
        } else if (isNode) {
            // Dynamic imports for Node.js-only modules (avoids compile-time errors in browser)
            const urlMod = await import(/* @vite-ignore */ 'url');
            const pathMod = await import(/* @vite-ignore */ 'path');
            const fsMod = await import(/* @vite-ignore */ 'fs/promises');

            const __dirname = pathMod.dirname(urlMod.fileURLToPath(import.meta.url));
            const wasmJsPath = pathMod.join(__dirname, 'solver-wasm', 'pkg', 'solver_wasm.js');
            const wasmBinPath = pathMod.join(__dirname, 'solver-wasm', 'pkg', 'solver_wasm_bg.wasm');

            const mod = await import(/* @vite-ignore */ wasmJsPath);
            const wasmBytes = await fsMod.readFile(wasmBinPath);
            await mod.default({ module_or_path: wasmBytes });
            wasmModule = mod;
        }

        if (wasmModule && wasmModule.ping) {
            const pong = wasmModule.ping();
            if (pong === 'WASM solver ready') {
                return true;
            }
        }
        return false;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[SolverBridge] WASM loading failed, using JS fallback:', msg);
        return false;
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export class SolverBridge {

    static async init(): Promise<{ backend: string }> {
        if (initPromise) return initPromise;

        initPromise = (async () => {
            wasmReady = await loadWasm();
            const backend = wasmReady ? 'wasm' : 'js';
            console.log(`[SolverBridge] Using ${backend} backend`);
            return { backend };
        })();

        return initPromise;
    }

    static get isWasm(): boolean {
        return wasmReady;
    }

    static isSolvable(game: GameState, startX: number, startY: number): boolean {
        if (wasmReady) {
            const { width, height, grid, mines } = game;
            const gridFlat = flatten2D(grid, width, height, Int8Array);
            const minesFlat = flattenBool2D(mines, width, height);
            return wasmModule!.isSolvable(width, height, gridFlat, minesFlat, startX, startY);
        }
        return MinesweeperSolver.isSolvable(game, startX, startY);
    }

    static generateSolvableBoard(
        width: number,
        height: number,
        bombCount: number,
        safeX: number,
        safeY: number,
        safeRadius: number,
        maxAttempts: number
    ): GenerateSolvableBoardResult | null {
        if (!wasmReady) return null;

        const result = wasmModule!.generateSolvableBoard(
            width, height, bombCount, safeX, safeY, safeRadius, maxAttempts
        );

        return {
            success: result.success,
            attempts: result.attempts,
            grid: unflatten2D(result.grid, width, height),
            mines: unflattenBool2D(result.mines, width, height),
        };
    }

    static getHint(game: GameState): HintResult | null {
        if (wasmReady) {
            const { width, height, grid, visibleGrid, flags, mines } = game;
            const gridFlat = flatten2D(grid, width, height, Int8Array);
            const visibleFlat = flatten2D(visibleGrid, width, height, Int8Array);
            const flagsFlat = flattenBool2D(flags, width, height);
            const minesFlat = flattenBool2D(mines, width, height);
            return wasmModule!.getHint(width, height, gridFlat, visibleFlat, flagsFlat, minesFlat);
        }
        return MinesweeperSolver.getHint(game);
    }

    static calculateNumbers(width: number, height: number, mines: Grid<boolean>): Grid<number> {
        if (wasmReady) {
            const minesFlat = flattenBool2D(mines, width, height);
            const resultFlat = wasmModule!.calculateNumbers(width, height, minesFlat);
            return unflatten2D(resultFlat, width, height);
        }
        // JS fallback
        const grid: Grid<number> = Array(width).fill(null).map(() => Array(height).fill(0));
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

    static getHintWithExplanation(game: GameState): HintWithExplanation | null {
        return MinesweeperSolver.getHintWithExplanation(game);
    }
}
