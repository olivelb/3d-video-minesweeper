/**
 * WASM Solver — Equivalence Test & Benchmark
 * 
 * Tests that the WASM solver produces identical results to the JS solver,
 * then benchmarks both backends on the same boards.
 * 
 * Usage: node --experimental-vm-modules shared/solver-wasm/test/equivalence.mjs
 */

import { MinesweeperSolver } from '../../MinesweeperSolver.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── WASM Loading ───────────────────────────────────────────────────────────

async function loadWasm() {
    const wasmJsPath = join(__dirname, '..', 'pkg', 'solver_wasm.js');
    const wasmBinPath = join(__dirname, '..', 'pkg', 'solver_wasm_bg.wasm');

    // On Windows, dynamic import() requires file:// URLs
    const { pathToFileURL } = await import('url');
    const mod = await import(pathToFileURL(wasmJsPath).href);
    const wasmBytes = await readFile(wasmBinPath);
    await mod.default(wasmBytes);
    return mod;
}

// ─── Board Generation (same as Game.js) ─────────────────────────────────────

function generateBoard(width, height, bombCount, safeX, safeY, safeRadius = 1) {
    const mines = Array(width).fill().map(() => Array(height).fill(false));
    const grid = Array(width).fill().map(() => Array(height).fill(0));

    let minesPlaced = 0;
    let placementAttempts = 0;

    while (minesPlaced < bombCount && placementAttempts < 100000) {
        placementAttempts++;
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);

        if (Math.abs(x - safeX) <= safeRadius && Math.abs(y - safeY) <= safeRadius) continue;
        if (mines[x][y]) continue;

        mines[x][y] = true;
        minesPlaced++;
    }

    // Calculate numbers
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            if (mines[x][y]) { grid[x][y] = -1; continue; } // mine marker for grid
            let count = 0;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height && mines[nx][ny]) count++;
                }
            }
            grid[x][y] = count;
        }
    }

    return { width, height, grid, mines, bombCount };
}

// ─── Flatten helpers ────────────────────────────────────────────────────────

function flatten2D(arr2d, width, height, TypedArrayCtor) {
    const flat = new TypedArrayCtor(width * height);
    for (let x = 0; x < width; x++) {
        const offset = x * height;
        for (let y = 0; y < height; y++) {
            flat[offset + y] = arr2d[x][y];
        }
    }
    return flat;
}

function flattenBool2D(arr2d, width, height) {
    const flat = new Uint8Array(width * height);
    for (let x = 0; x < width; x++) {
        const offset = x * height;
        for (let y = 0; y < height; y++) {
            flat[offset + y] = arr2d[x][y] ? 1 : 0;
        }
    }
    return flat;
}

// ─── Equivalence Tests ──────────────────────────────────────────────────────

async function runEquivalenceTests(wasm) {
    console.log('\n═══════════════════════════════════════════════');
    console.log('  EQUIVALENCE TESTS: JS vs WASM');
    console.log('═══════════════════════════════════════════════\n');

    const configs = [
        { width: 9, height: 9, bombs: 10, label: '9×9 Beginner' },
        { width: 16, height: 16, bombs: 40, label: '16×16 Intermediate' },
        { width: 30, height: 16, bombs: 99, label: '30×16 Expert' },
    ];

    let total = 0, passed = 0, failed = 0;
    const boardsPerConfig = 50;

    for (const cfg of configs) {
        console.log(`\n── ${cfg.label} (${boardsPerConfig} boards) ──`);
        let match = 0, mismatch = 0;

        for (let i = 0; i < boardsPerConfig; i++) {
            const safeX = Math.floor(cfg.width / 2);
            const safeY = Math.floor(cfg.height / 2);
            const board = generateBoard(cfg.width, cfg.height, cfg.bombs, safeX, safeY);

            // Create game-like object for JS solver
            const gameObj = {
                width: cfg.width,
                height: cfg.height,
                grid: board.grid,
                mines: board.mines,
                bombCount: cfg.bombs,
                visibleGrid: Array(cfg.width).fill().map(() => Array(cfg.height).fill(-1)),
                flags: Array(cfg.width).fill().map(() => Array(cfg.height).fill(false)),
            };

            // JS solver
            const jsResult = MinesweeperSolver.isSolvable(gameObj, safeX, safeY);

            // WASM solver
            const gridFlat = flatten2D(board.grid, cfg.width, cfg.height, Int8Array);
            const minesFlat = flattenBool2D(board.mines, cfg.width, cfg.height);
            const wasmResult = wasm.isSolvable(cfg.width, cfg.height, gridFlat, minesFlat, safeX, safeY);

            total++;
            if (jsResult === wasmResult) {
                match++;
                passed++;
            } else {
                mismatch++;
                failed++;
                console.log(`  ✗ Board ${i}: JS=${jsResult}, WASM=${wasmResult}`);
            }
        }

        const rate = ((match / boardsPerConfig) * 100).toFixed(1);
        const icon = mismatch === 0 ? '✓' : '✗';
        console.log(`  ${icon} ${match}/${boardsPerConfig} match (${rate}%)`);
    }

    console.log(`\n── Summary ──`);
    console.log(`  Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
    return failed === 0;
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

async function runBenchmarks(wasm) {
    console.log('\n═══════════════════════════════════════════════');
    console.log('  PERFORMANCE BENCHMARKS');
    console.log('═══════════════════════════════════════════════\n');

    const configs = [
        { width: 9, height: 9, bombs: 10, iterations: 200, label: 'Beginner 9×9' },
        { width: 16, height: 16, bombs: 40, iterations: 50, label: 'Intermediate 16×16' },
        { width: 30, height: 16, bombs: 99, iterations: 20, label: 'Expert 30×16' },
    ];

    for (const cfg of configs) {
        console.log(`\n── ${cfg.label} (${cfg.iterations} isSolvable calls) ──`);

        // Pre-generate boards
        const safeX = Math.floor(cfg.width / 2);
        const safeY = Math.floor(cfg.height / 2);
        const boards = [];
        for (let i = 0; i < cfg.iterations; i++) {
            boards.push(generateBoard(cfg.width, cfg.height, cfg.bombs, safeX, safeY));
        }

        // Pre-flatten for WASM
        const flatBoards = boards.map(b => ({
            gridFlat: flatten2D(b.grid, cfg.width, cfg.height, Int8Array),
            minesFlat: flattenBool2D(b.mines, cfg.width, cfg.height),
        }));

        // Benchmark JS
        const jsStart = performance.now();
        let jsSolvable = 0;
        for (let i = 0; i < cfg.iterations; i++) {
            const gameObj = {
                width: cfg.width, height: cfg.height,
                grid: boards[i].grid, mines: boards[i].mines, bombCount: cfg.bombs,
                visibleGrid: Array(cfg.width).fill().map(() => Array(cfg.height).fill(-1)),
                flags: Array(cfg.width).fill().map(() => Array(cfg.height).fill(false)),
            };
            if (MinesweeperSolver.isSolvable(gameObj, safeX, safeY)) jsSolvable++;
        }
        const jsTime = performance.now() - jsStart;

        // Benchmark WASM
        const wasmStart = performance.now();
        let wasmSolvable = 0;
        for (let i = 0; i < cfg.iterations; i++) {
            if (wasm.isSolvable(cfg.width, cfg.height, flatBoards[i].gridFlat, flatBoards[i].minesFlat, safeX, safeY)) {
                wasmSolvable++;
            }
        }
        const wasmTime = performance.now() - wasmStart;

        const speedup = (jsTime / wasmTime).toFixed(2);
        const jsAvg = (jsTime / cfg.iterations).toFixed(2);
        const wasmAvg = (wasmTime / cfg.iterations).toFixed(2);

        console.log(`  JS:   ${jsTime.toFixed(0)}ms total, ${jsAvg}ms/board (${jsSolvable} solvable)`);
        console.log(`  WASM: ${wasmTime.toFixed(0)}ms total, ${wasmAvg}ms/board (${wasmSolvable} solvable)`);
        console.log(`  Speedup: ${speedup}×`);
    }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
    console.log('Loading WASM module...');
    const wasm = await loadWasm();
    console.log(`WASM loaded: ${wasm.ping()}\n`);

    const allPassed = await runEquivalenceTests(wasm);
    await runBenchmarks(wasm);

    console.log('\n═══════════════════════════════════════════════');
    if (allPassed) {
        console.log('  ✓ ALL TESTS PASSED');
    } else {
        console.log('  ✗ SOME TESTS FAILED');
        process.exit(1);
    }
    console.log('═══════════════════════════════════════════════\n');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
