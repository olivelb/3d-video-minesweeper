/**
 * MinesweeperGameBase — Shared game logic for client and server.
 *
 * Contains all core Minesweeper rules: grid management, mine placement,
 * flood-fill reveal, flagging, chord clicking, win detection, hints, and retry.
 *
 * Subclass in client (browser) or server (Node.js) to add environment-specific
 * behaviour (UI notifications, multiplayer methods, etc.).
 *
 * @example
 * // Client
 * import { MinesweeperGameBase } from '../../shared/GameBase.js';
 * export class MinesweeperGame extends MinesweeperGameBase { ... }
 *
 * // Server
 * import { MinesweeperGameBase } from '../shared/GameBase.js';
 * export class MinesweeperGame extends MinesweeperGameBase { ... }
 */

import { SolverBridge } from './SolverBridge.js';

// ─── Environment Detection ──────────────────────────────────────────────────

const isBrowser = typeof window !== 'undefined';

const storage = isBrowser ? localStorage : {
    getItem: () => null,
    setItem: () => { },
    removeItem: () => { }
};

// ─── Base Class ─────────────────────────────────────────────────────────────

export class MinesweeperGameBase {
    constructor(width = 30, height = 20, bombCount = 50) {
        this.width = width;
        this.height = height;
        this.bombCount = bombCount;
        this.enableChronometer = true;
        this.noGuessMode = false;

        this.grid = [];           // Number grid (0-8 counts, set after calculateNumbers)
        this.visibleGrid = [];    // -1 = hidden, 0-8 = revealed, 9 = exploded, 10 = revealed bomb
        this.flags = [];          // Boolean flags
        this.mines = [];          // Boolean mine positions

        this.gameOver = false;
        this.victory = false;
        this.firstClick = true;
        this.elapsedTime = 0;
        this.gameStartTime = null;
        this.finalScore = 0;
        this.hintCount = 0;
        this.lastMove = null;
        this.retryCount = 0;
        this.cancelGeneration = false;
    }

    // ─── Initialization ─────────────────────────────────────────────────

    /**
     * Initialise or reset the game state.
     */
    init() {
        this.grid = Array(this.width).fill().map(() => Array(this.height).fill(0));
        this.mines = Array(this.width).fill().map(() => Array(this.height).fill(false));
        this.visibleGrid = Array(this.width).fill().map(() => Array(this.height).fill(-1));
        this.flags = Array(this.width).fill().map(() => Array(this.height).fill(false));
        this.flagCount = 0;
        this.revealedBombs = [];

        this.gameOver = false;
        this.victory = false;
        this.firstClick = true;
        this.elapsedTime = 0;
        this.finalScore = 0;
        this.hintCount = 0;
        this.lastMove = null;
        this.retryCount = 0;
        this.cancelGeneration = false;
        this.gameStartTime = null;
    }

    // ─── Chronometer ────────────────────────────────────────────────────

    /**
     * Start the timer on first click.
     */
    startChronometer() {
        if (this.enableChronometer && !this.gameStartTime) {
            this.gameStartTime = Date.now();
        }
    }

    /**
     * Get elapsed time in seconds.
     */
    getElapsedTime() {
        if (!this.enableChronometer) return 0;
        if (!this.gameStartTime) return 0;
        return Math.floor((Date.now() - this.gameStartTime) / 1000);
    }

    // ─── Mine Placement ─────────────────────────────────────────────────

    /**
     * Place mines randomly, respecting a safe zone and (optionally) no-guess solvability.
     *
     * Uses a JS loop with per-attempt WASM-accelerated isSolvable() calls, yielding
     * every 10 attempts so both the browser UI and Node.js event loop remain responsive.
     *
     * @param {number} safeX - First-click X
     * @param {number} safeY - First-click Y
     * @param {Function} [onProgress] - Called with (attempts, maxAttempts) every 10 iterations
     * @returns {Promise<true|{cancelled:boolean}|{warning:boolean}>}
     */
    async placeMines(safeX, safeY, onProgress) {
        let attempts = 0;
        const maxAttempts = 10000;
        // No Guess mode uses a 5×5 safe zone (radius 2) for better openings
        const safeRadius = this.noGuessMode ? 2 : 1;
        this.cancelGeneration = false;

        do {
            if (this.cancelGeneration) {
                return { cancelled: true };
            }

            // Yield every 10 attempts for UI/event-loop responsiveness
            if (attempts > 0 && attempts % 10 === 0) {
                if (onProgress) onProgress(attempts, maxAttempts);
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            this.mines = Array(this.width).fill().map(() => Array(this.height).fill(false));
            this.grid = Array(this.width).fill().map(() => Array(this.height).fill(0));

            let minesPlaced = 0;
            let placementAttempts = 0;

            while (minesPlaced < this.bombCount && placementAttempts < 100000) {
                placementAttempts++;
                const x = Math.floor(Math.random() * this.width);
                const y = Math.floor(Math.random() * this.height);

                if (Math.abs(x - safeX) <= safeRadius && Math.abs(y - safeY) <= safeRadius) {
                    continue;
                }

                if (!this.mines[x][y]) {
                    this.mines[x][y] = true;
                    this.grid[x][y] = 1;
                    minesPlaced++;
                }
            }
            this.calculateNumbers();

            attempts++;
            if (!this.noGuessMode) break;

        } while (!SolverBridge.isSolvable(this, safeX, safeY) && attempts < maxAttempts);

        if (this.noGuessMode && attempts >= maxAttempts) {
            return { warning: true };
        }

        // Save grid for potential replay on loss
        const gridData = {
            width: this.width,
            height: this.height,
            bombCount: this.bombCount,
            noGuessMode: this.noGuessMode || false,
            minePositions: this.getMinePositions()
        };
        storage.setItem('minesweeper3d_last_grid', JSON.stringify(gridData));

        return true;
    }

    /**
     * Calculate neighbour mine counts (0-8) for every non-mine cell.
     */
    calculateNumbers() {
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                if (this.mines[x][y]) continue;

                let count = 0;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height && this.mines[nx][ny]) {
                            count++;
                        }
                    }
                }
                this.grid[x][y] = count;
            }
        }
    }

    // ─── Revealing ──────────────────────────────────────────────────────

    /**
     * Reveal a cell (left click).
     *
     * On first click: places mines, auto-reveals the 3×3 safe zone.
     * If generation was cancelled or hit the max-attempt limit,
     * delegates to `_onGenerationWarning()` (overridden by subclass).
     *
     * @param {number} x
     * @param {number} y
     * @param {Function} [onProgress] - Forwarded to placeMines
     * @returns {Promise<{type: string, changes?: Array, x?: number, y?: number}>}
     */
    async reveal(x, y, onProgress) {
        if (this.gameOver || this.victory || this.flags[x][y] || this.visibleGrid[x][y] !== -1) {
            return { type: 'none', changes: [] };
        }

        if (this.firstClick) {
            const success = await this.placeMines(x, y, onProgress);

            if (success.cancelled || success.warning) {
                this._onGenerationWarning(success);
            }

            this.firstClick = false;
            this.startChronometer();

            // Auto-reveal the 3×3 safe area around the first click
            const changes = [];
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                        this.floodFill(nx, ny, changes);
                    }
                }
            }

            if (this.checkWin()) {
                this.victory = true;
                return { type: 'win', changes };
            }
            return { type: 'reveal', changes };
        }

        if (this.mines[x][y]) {
            this.gameOver = true;
            this.lastMove = { x, y };
            this.visibleGrid[x][y] = 9; // 9 = Explosion
            return { type: 'explode', x, y };
        }

        const changes = [];
        this.floodFill(x, y, changes);

        if (this.checkWin()) {
            this.victory = true;
            return { type: 'win', changes };
        }

        return { type: 'reveal', changes };
    }

    /**
     * Hook called when board generation was cancelled or hit the max-attempt limit.
     * Override in subclasses to show environment-specific notifications.
     *
     * @param {{cancelled?: boolean, warning?: boolean}} result
     */
    _onGenerationWarning(result) {
        const reason = result.cancelled ? 'cancelled' : 'max attempts reached';
        console.log(`[Game] Board generation: ${reason}`);
    }

    /**
     * Iterative flood-fill starting from (startX, startY).
     * Reveals cells and cascades through empty (0-value) cells.
     */
    floodFill(startX, startY, changes) {
        const stack = [[startX, startY]];

        while (stack.length > 0) {
            const [x, y] = stack.pop();

            if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
            if (this.visibleGrid[x][y] !== -1 || this.flags[x][y]) continue;

            const val = this.grid[x][y];
            this.visibleGrid[x][y] = val;
            changes.push({ x, y, value: val });

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

    // ─── Flagging ───────────────────────────────────────────────────────

    /**
     * Toggle a flag on/off (right click).
     */
    toggleFlag(x, y) {
        if (this.gameOver || this.victory || this.visibleGrid[x][y] !== -1) {
            return { type: 'none' };
        }

        this.flags[x][y] = !this.flags[x][y];
        this.flagCount += this.flags[x][y] ? 1 : -1;
        return { type: 'flag', x, y, active: this.flags[x][y] };
    }

    // ─── Chord ──────────────────────────────────────────────────────────

    /**
     * Chord click: if a revealed numbered cell has the correct adjacent flag count,
     * reveal all non-flagged neighbours. Misplaced flags cause an explosion.
     */
    chord(x, y) {
        if (this.gameOver || this.victory) return { type: 'none', changes: [] };

        const value = this.visibleGrid[x][y];
        if (value <= 0 || value > 8) return { type: 'none', changes: [] };

        // Count adjacent flags
        let adjacentFlags = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height && this.flags[nx][ny]) {
                    adjacentFlags++;
                }
            }
        }

        if (adjacentFlags !== value) return { type: 'none', changes: [] };

        // Reveal all non-flagged, non-revealed neighbours
        const changes = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
                if (this.flags[nx][ny] || this.visibleGrid[nx][ny] !== -1) continue;

                if (this.mines[nx][ny]) {
                    this.gameOver = true;
                    this.lastMove = { x: nx, y: ny };
                    this.visibleGrid[nx][ny] = 9;
                    return { type: 'explode', x: nx, y: ny, changes };
                }

                this.floodFill(nx, ny, changes);
            }
        }

        if (changes.length === 0) return { type: 'none', changes: [] };

        if (this.checkWin()) {
            this.victory = true;
            return { type: 'win', changes };
        }

        return { type: 'reveal', changes };
    }

    // ─── Win Detection ──────────────────────────────────────────────────

    checkWin() {
        let revealedCount = 0;
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                if (this.visibleGrid[x][y] !== -1) {
                    revealedCount++;
                }
            }
        }
        const isWin = revealedCount === (this.width * this.height - this.bombCount);
        if (isWin) {
            storage.removeItem('minesweeper3d_last_grid');
        }
        return isWin;
    }

    // ─── Hint ───────────────────────────────────────────────────────────

    /**
     * Get a solver hint (best safe cell to reveal).
     */
    getHint() {
        if (this.gameOver || this.victory) return null;

        const hint = SolverBridge.getHint(this);
        if (hint) {
            this.hintCount++;
        }
        return hint;
    }

    // ─── Retry ──────────────────────────────────────────────────────────

    /**
     * Undo the last losing move so the player can continue.
     */
    retryLastMove() {
        if (!this.gameOver || !this.lastMove) return false;

        const { x, y } = this.lastMove;
        this.visibleGrid[x][y] = -1;
        this.gameOver = false;
        this.retryCount++;
        this.lastMove = null;
        return true;
    }

    // ─── Serialization ──────────────────────────────────────────────────

    /**
     * Get all mine positions (for save / replay).
     * @returns {Array<{x: number, y: number}>}
     */
    getMinePositions() {
        const positions = [];
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                if (this.mines[x][y]) {
                    positions.push({ x, y });
                }
            }
        }
        return positions;
    }

    /**
     * Restore mines from saved positions (for replay).
     * @param {Array<{x: number, y: number}>} positions
     */
    setMinesFromPositions(positions) {
        positions.forEach(({ x, y }) => {
            this.mines[x][y] = true;
            this.grid[x][y] = 1;
        });
        this.calculateNumbers();
        this.firstClick = false;
    }
}
