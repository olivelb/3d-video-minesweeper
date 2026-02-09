
import { MinesweeperSolver } from '../shared/MinesweeperSolver.js';

// Setup a mock game object
const mockGame = {
    width: 3,
    height: 2,
    bombCount: 2,
    grid: [
        [1, 1], // (0,0) Mine, (0,1) 1
        [1, 2], // (1,0) Safe, (1,1) 2
        [1, 1]  // (2,0) Mine, (2,1) 1
    ]
};

// 1-2-1 Pattern
// Hidden: (0,0), (1,0), (2,0) -> A, B, C
// Clues:  (0,1)=1, (1,1)=2, (2,1)=1

function runTest() {
    console.log("Running Server Gaussian Elimination Test: 1-2-1 Pattern");

    // The solver takes (game, startX, startY).
    // isSolvable() simulates a game from scratch.
    // To test *just* the Gaussian step, we'd need to mock internal state, 
    // but MinesweeperSolver.isSolvable runs the whole simulation.
    // If Gaussian works, it should solve this pattern without guessing.
    // If it fails (and falls back to Tank), it might still solve it, but we want to confirm Gaussian usage.
    //
    // However, MinesweeperSolver.isSolvable returns a boolean.
    // To explicitly test Gaussian, let's spy on the method or just trust the logic if isSolvable returns true
    // for a pattern that requires advanced logic (or just verify the code compiles and runs).

    // Actually, let's verify by calling the method directly like in the client test.
    // We need to construct the state manually.

    const width = 3;
    const height = 2;
    const visibleGrid = Array(width).fill().map(() => Array(height).fill(0));
    const flags = Array(width).fill().map(() => Array(height).fill(false));

    // Setup Clues
    visibleGrid[0][1] = 1;
    visibleGrid[1][1] = 2;
    visibleGrid[2][1] = 1;

    // Setup Hidden
    visibleGrid[0][0] = -1;
    visibleGrid[1][0] = -1;
    visibleGrid[2][0] = -1;

    console.log("Testing MinesweeperSolver.solveByGaussianElimination directly...");

    // We need to init the cache first
    MinesweeperSolver.initNeighborCache(width, height);

    try {
        const result = MinesweeperSolver.solveByGaussianElimination(mockGame.grid, visibleGrid, flags, width, height, 0);
        console.log("Result:", JSON.stringify(result, null, 2));

        const isMineA = result.changedCells.some(c => c.x === 0 && c.y === 0); // Mine (Flagged)
        const isMineC = result.changedCells.some(c => c.x === 2 && c.y === 0); // Mine (Flagged)
        const isSafeB = result.changedCells.some(c => c.x === 1 && c.y === 0); // Safe (Revealed)

        // Note: result.changedCells contains both mines and safes changes.
        // We know A and C should be flags, B should be reveal.

        if (result.progress && result.changedCells.length === 3) {
            console.log("SUCCESS: Server Solver identified all 3 moves.");
        } else {
            console.error("FAILURE: Did not identify all moves.");
        }

    } catch (e) {
        console.error("ERROR during execution:", e);
    }
}

runTest();
