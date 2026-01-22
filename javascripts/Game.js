import { MinesweeperSolver } from './MinesweeperSolver.js';

/**
 * Logique du jeu Démineur
 * Gère la grille, le placement des mines et les règles du jeu.
 */
export class MinesweeperGame {
    constructor(width = 30, height = 20, bombCount = 50) {
        this.width = width;
        this.height = height;
        this.bombCount = bombCount;
        this.enableChronometer = true;
        this.noGuessMode = false;

        this.grid = []; // Stocke l'état des bombes (0: vide, 1: bombe)
        this.visibleGrid = []; // Stocke l'état visible (-1: caché, 0-8: nombre, 9: bombe explosée)
        this.flags = []; // Stocke les drapeaux
        this.mines = []; // Booléen isMine

        this.gameOver = false;
        this.victory = false;
        this.firstClick = true;
        this.elapsedTime = 0; // Time in seconds
        this.gameStartTime = null; // Timestamp when game starts
        this.finalScore = 0; // Score final à la victoire
        this.hintCount = 0; // Nombre d'indices utilisés
        this.lastMove = null; // Stocke {x, y} du dernier coup (pour retry)
        this.retryCount = 0; // Nombre de retries effectués
    }

    /**
     * Initialise ou réinitialise la partie
     */
    init() {
        this.grid = Array(this.width).fill().map(() => Array(this.height).fill(0));
        this.mines = Array(this.width).fill().map(() => Array(this.height).fill(false));
        this.visibleGrid = Array(this.width).fill().map(() => Array(this.height).fill(-1));
        this.flags = Array(this.width).fill().map(() => Array(this.height).fill(false));

        this.gameOver = false;
        this.victory = false;
        this.firstClick = true;
        this.elapsedTime = 0;
        this.finalScore = 0;
        this.hintCount = 0;
        this.lastMove = null;
        this.retryCount = 0;
        this.gameStartTime = null;

        // Note: On place les mines au premier clic pour éviter de perdre tout de suite
        console.log("Jeu initialisé");
    }

    /**
     * Démarre le chronomètre au premier clic
     */
    startChronometer() {
        if (this.enableChronometer && !this.gameStartTime) {
            this.gameStartTime = Date.now();
        }
    }

    /**
     * Obtient le temps écoulé en secondes
     */
    getElapsedTime() {
        if (!this.enableChronometer) return 0;
        if (!this.gameStartTime) return 0;
        return Math.floor((Date.now() - this.gameStartTime) / 1000);
    }

    /**
     * Place les mines aléatoirement en respectant les contraintes de sécurité et de résolvabilité.
     * @param {number} safeX - Coordonnée X du premier clic
     * @param {number} safeY - Coordonnée Y du premier clic
     */
    placeMines(safeX, safeY) {
        let attempts = 0;
        const maxAttempts = 2000;
        // In No Guess mode, use a larger safe zone (radius 2 aka 5x5) to increase probability of a good opening
        const safeRadius = this.noGuessMode ? 2 : 1;

        do {
            this.mines = Array(this.width).fill().map(() => Array(this.height).fill(false));
            this.grid = Array(this.width).fill().map(() => Array(this.height).fill(0));

            let minesPlaced = 0;
            // Safety break to prevent infinite loops if board is too small for mines + safezone
            let placementAttempts = 0;

            while (minesPlaced < this.bombCount && placementAttempts < 100000) {
                placementAttempts++;
                const x = Math.floor(Math.random() * this.width);
                const y = Math.floor(Math.random() * this.height);

                // Check exclusion zone
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

        } while (!MinesweeperSolver.isSolvable(this, safeX, safeY) && attempts < maxAttempts);

        if (this.noGuessMode && attempts >= maxAttempts) {
            console.warn(`Impossible de générer une grille 100% logique après ${maxAttempts} tentatives.`);
            alert("Note : Le générateur n'a pas pu garantir une grille 100% logique avec ces paramètres. Il est possible que vous deviez deviner.");
        }
    }

    /**
     * Calcule les nombres pour chaque case (nombre de mines voisines)
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

    /**
     * Gère un clic gauche sur une case
     * @param {number} x 
     * @param {number} y 
     * @returns {Object} Résultat de l'action { type: 'reveal'|'explode'|'none', changes: [] }
     */
    reveal(x, y) {
        if (this.gameOver || this.victory || this.flags[x][y] || this.visibleGrid[x][y] !== -1) {
            return { type: 'none', changes: [] };
        }

        if (this.firstClick) {
            this.placeMines(x, y);
            this.firstClick = false;
            this.startChronometer();

            // Auto-reveal the 3x3 safe area around the first click
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
     * Algorithme de remplissage pour dévoiler les cases vides (iterative version to avoid stack overflow)
     */
    floodFill(startX, startY, changes) {
        const stack = [[startX, startY]];

        while (stack.length > 0) {
            const [x, y] = stack.pop();

            // Skip if out of bounds
            if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
            // Skip if already visible or flagged
            if (this.visibleGrid[x][y] !== -1 || this.flags[x][y]) continue;

            const val = this.grid[x][y];
            this.visibleGrid[x][y] = val;
            changes.push({ x, y, value: val });

            // If empty cell, add all neighbors to stack
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

    /**
     * Gère un clic droit (drapeau)
     */
    toggleFlag(x, y) {
        if (this.gameOver || this.victory || this.visibleGrid[x][y] !== -1) {
            return { type: 'none' };
        }

        this.flags[x][y] = !this.flags[x][y];
        return { type: 'flag', x, y, active: this.flags[x][y] };
    }

    checkWin() {
        let revealedCount = 0;
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                if (this.visibleGrid[x][y] !== -1) {
                    revealedCount++;
                }
            }
        }
        return revealedCount === (this.width * this.height - this.bombCount);
    }

    /**
     * Obtient un indice pour le joueur
     */
    getHint() {
        if (this.gameOver || this.victory) return null;

        const hint = MinesweeperSolver.getHint(this);
        if (hint) {
            this.hintCount++;
        }
        return hint;
    }

    /**
     * Annule le dernier coup (qui a fait perdre)
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
}
