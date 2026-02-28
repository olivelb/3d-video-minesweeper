/**
 * MinesweeperGameBase — Shared game logic for client and server.
 *
 * Contains all core Minesweeper rules: grid management, mine placement,
 * flood-fill reveal, flagging, chord clicking, win detection, hints, and retry.
 *
 * Subclass in client (browser) or server (Node.js) to add environment-specific
 * behaviour (UI notifications, multiplayer methods, etc.).
 */

import { SolverBridge } from './SolverBridge.js';
import type { Cell, Grid, ActionResult, PlaceMinesResult, HintResult, HintWithExplanation } from './types.js';

// ─── Environment Detection ──────────────────────────────────────────────────

const isBrowser = typeof window !== 'undefined';

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

const storage: StorageLike = isBrowser ? localStorage : {
    getItem: () => null,
    setItem: () => { },
    removeItem: () => { }
};

// ─── Base Class ─────────────────────────────────────────────────────────────

export class MinesweeperGameBase {
    width: number;
    height: number;
    bombCount: number;
    enableChronometer: boolean;
    noGuessMode: boolean;

    grid: Grid<number>;
    visibleGrid: Grid<number>;
    flags: Grid<boolean>;
    mines: Grid<boolean>;

    gameOver: boolean;
    victory: boolean;
    firstClick: boolean;
    elapsedTime: number;
    gameStartTime: number | null;
    finalScore: number;
    hintCount: number;
    hintMode: boolean;
    lastMove: Cell | null;
    retryCount: number;
    cancelGeneration: boolean;
    flagCount: number;
    revealedCount: number;
    revealedBombs: Cell[];

    // Extra properties used by multiplayer / UI
    isSpectating?: boolean;

    constructor(width = 30, height = 20, bombCount = 50) {
        this.width = width;
        this.height = height;
        this.bombCount = bombCount;
        this.enableChronometer = true;
        this.noGuessMode = false;

        this.grid = [];
        this.visibleGrid = [];
        this.flags = [];
        this.mines = [];

        this.gameOver = false;
        this.victory = false;
        this.firstClick = true;
        this.elapsedTime = 0;
        this.gameStartTime = null;
        this.finalScore = 0;
        this.hintCount = 0;
        this.hintMode = false;
        this.lastMove = null;
        this.retryCount = 0;
        this.cancelGeneration = false;
        this.flagCount = 0;
        this.revealedCount = 0;
        this.revealedBombs = [];
    }

    // ─── Initialization ─────────────────────────────────────────────────

    init(): void {
        this.grid = Array(this.width).fill(null).map(() => Array(this.height).fill(0));
        this.mines = Array(this.width).fill(null).map(() => Array(this.height).fill(false));
        this.visibleGrid = Array(this.width).fill(null).map(() => Array(this.height).fill(-1));
        this.flags = Array(this.width).fill(null).map(() => Array(this.height).fill(false));
        this.flagCount = 0;
        this.revealedCount = 0;
        this.revealedBombs = [];

        this.gameOver = false;
        this.victory = false;
        this.firstClick = true;
        this.elapsedTime = 0;
        this.finalScore = 0;
        this.hintCount = 0;
        this.hintMode = false;
        this.lastMove = null;
        this.retryCount = 0;
        this.cancelGeneration = false;
        this.gameStartTime = null;
    }

    // ─── Chronometer ────────────────────────────────────────────────────

    startChronometer(): void {
        if (this.enableChronometer && !this.gameStartTime) {
            this.gameStartTime = Date.now();
        }
    }

    getElapsedTime(): number {
        if (!this.enableChronometer) return 0;
        if (!this.gameStartTime) return 0;
        return Math.floor((Date.now() - this.gameStartTime) / 1000);
    }

    // ─── Mine Placement ─────────────────────────────────────────────────

    async placeMines(
        safeX: number,
        safeY: number,
        onProgress?: (attempts: number, maxAttempts: number) => void
    ): Promise<PlaceMinesResult> {
        let attempts = 0;
        const maxAttempts = 10000;
        const safeRadius = this.noGuessMode ? 2 : 1;
        this.cancelGeneration = false;

        do {
            if (this.cancelGeneration) {
                return { cancelled: true };
            }

            if (attempts > 0 && attempts % 10 === 0) {
                if (onProgress) onProgress(attempts, maxAttempts);
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            this.mines = Array(this.width).fill(null).map(() => Array(this.height).fill(false));
            this.grid = Array(this.width).fill(null).map(() => Array(this.height).fill(0));

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

    calculateNumbers(): void {
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

    async reveal(
        x: number,
        y: number,
        onProgress?: (attempts: number, maxAttempts: number) => void
    ): Promise<ActionResult> {
        if (this.gameOver || this.victory || this.flags[x][y] || this.visibleGrid[x][y] !== -1) {
            return { type: 'none', changes: [] };
        }

        if (this.firstClick) {
            const success = await this.placeMines(x, y, onProgress);

            if (typeof success === 'object' && ('cancelled' in success || 'warning' in success)) {
                this._onGenerationWarning(success as { cancelled?: boolean; warning?: boolean });
            }

            this.firstClick = false;
            this.startChronometer();

            const changes: { x: number; y: number; value: number }[] = [];
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
            this.visibleGrid[x][y] = 9;
            return { type: 'explode', x, y };
        }

        const changes: { x: number; y: number; value: number }[] = [];
        this.floodFill(x, y, changes);

        if (this.checkWin()) {
            this.victory = true;
            return { type: 'win', changes };
        }

        return { type: 'reveal', changes };
    }

    _onGenerationWarning(result: { cancelled?: boolean; warning?: boolean }): void {
        const reason = result.cancelled ? 'cancelled' : 'max attempts reached';
        console.log(`[Game] Board generation: ${reason}`);
    }

    floodFill(startX: number, startY: number, changes: { x: number; y: number; value: number }[]): void {
        const stack = [startX * this.height + startY];

        while (stack.length > 0) {
            const encoded = stack.pop()!;
            const x = (encoded / this.height) | 0;
            const y = encoded % this.height;

            if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
            if (this.visibleGrid[x][y] !== -1 || this.flags[x][y]) continue;

            const val = this.grid[x][y];
            this.visibleGrid[x][y] = val;
            this.revealedCount++;
            changes.push({ x, y, value: val });

            if (val === 0) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx !== 0 || dy !== 0) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                                stack.push(nx * this.height + ny);
                            }
                        }
                    }
                }
            }
        }
    }

    // ─── Flagging ───────────────────────────────────────────────────────

    toggleFlag(x: number, y: number): ActionResult {
        if (this.gameOver || this.victory || this.visibleGrid[x][y] !== -1) {
            return { type: 'none' };
        }

        this.flags[x][y] = !this.flags[x][y];
        this.flagCount += this.flags[x][y] ? 1 : -1;
        return { type: 'flag', x, y, active: this.flags[x][y] };
    }

    // ─── Chord ──────────────────────────────────────────────────────────

    chord(x: number, y: number): ActionResult {
        if (this.gameOver || this.victory) return { type: 'none', changes: [] };

        const value = this.visibleGrid[x][y];
        if (value <= 0 || value > 8) return { type: 'none', changes: [] };

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

        const changes: { x: number; y: number; value: number }[] = [];
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

    checkWin(): boolean {
        const isWin = this.revealedCount === (this.width * this.height - this.bombCount);
        if (isWin) {
            storage.removeItem('minesweeper3d_last_grid');
        }
        return isWin;
    }

    // ─── Hint ───────────────────────────────────────────────────────────

    getHint(): HintResult | null {
        if (this.gameOver || this.victory) return null;

        const hint = SolverBridge.getHint(this);
        if (hint) {
            this.hintCount++;
        }
        return hint;
    }

    getHintWithExplanation(): HintWithExplanation | null {
        if (this.gameOver || this.victory) return null;

        const hint = SolverBridge.getHintWithExplanation(this);
        if (hint) {
            this.hintCount++;
        }
        return hint;
    }

    // ─── Retry ──────────────────────────────────────────────────────────

    retryLastMove(): boolean {
        if (!this.gameOver || !this.lastMove) return false;

        const { x, y } = this.lastMove;
        this.visibleGrid[x][y] = -1;
        this.gameOver = false;
        this.retryCount++;
        this.lastMove = null;
        return true;
    }

    // ─── Serialization ──────────────────────────────────────────────────

    getMinePositions(): Cell[] {
        const positions: Cell[] = [];
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                if (this.mines[x][y]) {
                    positions.push({ x, y });
                }
            }
        }
        return positions;
    }

    setMinesFromPositions(positions: Cell[]): void {
        positions.forEach(({ x, y }) => {
            this.mines[x][y] = true;
            this.grid[x][y] = 1;
        });
        this.calculateNumbers();
        this.firstClick = false;
    }
}
