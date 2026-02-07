
import { GaussianElimination } from './GaussianElimination.js';

// Mock Solver
const MockSolver = {
    cellKey: (x, y) => (x << 16) | y,
    getCachedNeighbors: (x, y) => {
        const neighbors = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                // Simple bounds check for our test grid 3x2
                if (nx >= 0 && nx < 3 && ny >= 0 && ny < 2) {
                    neighbors.push({ x: nx, y: ny });
                }
            }
        }
        return neighbors;
    }
};

function runTest() {
    console.log("Running Gaussian Elimination Test: 1-2-1 Pattern");

    // Grid 3x2
    // Hidden: (0,0), (1,0), (2,0) -> A, B, C
    // Clues:  (0,1)=1, (1,1)=2, (2,1)=1

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

    const frontier = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 }
    ];

    console.log("Input Frontier:", frontier);

    const result = GaussianElimination.solve(MockSolver, visibleGrid, flags, frontier);

    console.log("Result:", JSON.stringify(result, null, 2));

    // Verification
    // Expect: Mines: A(0,0), C(2,0). Safe: B(1,0).
    // Note: In 1-2-1, A and C are mines, B is safe.

    const isMineA = result.mines.some(c => c.x === 0 && c.y === 0);
    const isMineC = result.mines.some(c => c.x === 2 && c.y === 0);
    const isSafeB = result.safe.some(c => c.x === 1 && c.y === 0);

    if (isMineA && isMineC && isSafeB) {
        console.log("SUCCESS: Correctly solved 1-2-1 pattern.");
    } else {
        console.error("FAILURE: Did not solve correctly.");
    }
}

runTest();
