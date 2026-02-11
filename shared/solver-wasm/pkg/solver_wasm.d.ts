/* tslint:disable */
/* eslint-disable */

/**
 * Calculate neighbor mine counts for all cells.
 */
export function calculateNumbers(width: number, height: number, mines_flat: Uint8Array): Int8Array;

/**
 * Generate a solvable board (No-Guess mode).
 * Returns JS object: `{ success: bool, attempts: u32, grid: Int8Array, mines: Uint8Array }`
 */
export function generateSolvableBoard(width: number, height: number, bomb_count: number, safe_x: number, safe_y: number, safe_radius: number, max_attempts: number): any;

/**
 * Get a hint (best safe cell to reveal).
 * Returns JS object `{ x, y, score }` or `null`.
 */
export function getHint(width: number, height: number, grid_flat: Int8Array, visible_flat: Int8Array, flags_flat: Uint8Array, mines_flat: Uint8Array): any;

/**
 * Check if a board is solvable without guessing.
 */
export function isSolvable(width: number, height: number, grid_flat: Int8Array, mines_flat: Uint8Array, start_x: number, start_y: number): boolean;

/**
 * Ping function to verify WASM is loaded.
 */
export function ping(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly calculateNumbers: (a: number, b: number, c: number, d: number) => any;
    readonly generateSolvableBoard: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
    readonly getHint: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => any;
    readonly isSolvable: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly ping: () => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
