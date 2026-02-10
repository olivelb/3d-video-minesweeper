/**
 * ScoreManager - Gère les scores et le classement
 * Utilise localStorage pour la persistance
 */
export class ScoreManager {
    constructor() {
        this.storageKey = 'minesweeper3d_scores';
        this.analyticsKey = 'minesweeper3d_analytics';
        this.playerIdKey = 'minesweeper3d_player_id';
        this.initPlayer();
    }

    initPlayer() {
        let id = localStorage.getItem(this.playerIdKey);
        if (!id) {
            id = 'p_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
            localStorage.setItem(this.playerIdKey, id);
        }
        this.playerId = id;
        this.playerCodename = this.generateCodename(id);
    }

    generateCodename(id) {
        const adjectives = ["Neon", "Cyber", "Mega", "Shadow", "Delta", "Star", "Turbo", "Ghost", "Alpha", "Omega"];
        const nouns = ["Tiger", "Droid", "Fox", "Falcon", "Ghost", "Runner", "Pixel", "Wizard", "Titan", "Core"];

        // Use hash of ID to pick indices consistently
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = ((hash << 5) - hash) + id.charCodeAt(i);
            hash |= 0;
        }
        const adjIdx = Math.abs(hash) % adjectives.length;
        const nounIdx = Math.abs(hash * 31) % nouns.length;
        const suffix = Math.abs(hash) % 1000;

        return `${adjectives[adjIdx]} ${nouns[nounIdx]} #${suffix}`;
    }

    getPlayerInfo() {
        return {
            id: this.playerId,
            codename: this.playerCodename
        };
    }

    /**
     * Calcule le score basé sur la difficulté et le temps
     * @param {number} width - Largeur de la grille
     * @param {number} height - Hauteur de la grille
     * @param {number} bombs - Nombre de bombes
     * @param {number} timeSeconds - Temps en secondes
     * @returns {number} Score calculé
     */
    calculateScore(width, height, bombs, timeSeconds, options = {}) {
        const { noGuessMode = false, hintCount = 0, retryCount = 0 } = options;

        const gridSize = width * height;
        const bombDensity = bombs / gridSize;
        const difficultyFactor = gridSize * bombDensity * 1000;

        // Le score est le facteur de difficulté moins le temps passé (en secondes)
        // L'avantage de score est déjà donné par la difficulté (nombre de bombes)
        let finalScore = difficultyFactor - timeSeconds * 10;

        // Pénalité Mode No Guess (-25%) car la chance est éliminée
        if (noGuessMode) finalScore *= 0.75;

        // Hints: first hint is free, then progressive cost (-1500, -2500, -3500, ...)
        for (let i = 1; i < hintCount; i++) {
            finalScore -= 1500 + (i - 1) * 1000;
        }

        // Pénalité par retry (-5000 pts + -25% score total par retry)
        for (let i = 0; i < retryCount; i++) {
            finalScore -= 5000;
            finalScore *= 0.75;
        }

        return Math.floor(Math.max(0, finalScore));
    }

    /**
     * Sauvegarde un nouveau score
     * @param {Object} scoreData - { width, height, bombs, time, score, date }
     */
    saveScore(scoreData) {
        const scores = this.getAllScores();
        scores.push({
            playerId: this.playerId,
            codename: this.playerCodename,
            width: scoreData.width,
            height: scoreData.height,
            bombs: scoreData.bombs,
            time: scoreData.time,
            score: scoreData.score,
            noGuessMode: scoreData.noGuessMode || false,
            hintCount: scoreData.hintCount || 0,
            retryCount: scoreData.retryCount || 0,
            background: scoreData.background || 'Unknown',
            date: scoreData.date || new Date().toISOString()
        });

        // Trier par score décroissant
        scores.sort((a, b) => b.score - a.score);

        // Garder seulement les 50 meilleurs scores
        const topScores = scores.slice(0, 50);

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(topScores));
        } catch (e) {
            console.error('[ScoreManager] Failed to save to localStorage:', e);
        }

        return topScores;
    }

    /**
     * Récupère tous les scores
     * @returns {Array} Liste des scores
     */
    getAllScores() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.warn("Erreur lors de la lecture des scores:", e);
            return [];
        }
    }

    /**
     * Récupère le top N des scores
     * @param {number} limit - Nombre de scores à retourner
     * @returns {Array} Top N scores
     */
    getTopScores(limit = 10) {
        const scores = this.getAllScores();
        return scores.slice(0, limit);
    }

    /**
     * Récupère les scores, éventuellement filtrés par difficulté
     * @param {string} difficulty - Filtre ('all', 'easy', 'medium', 'hard')
     * @returns {Array} Liste des scores filtrée
     */
    getScores(difficulty = 'all') {
        const scores = this.getAllScores();
        if (difficulty === 'all') return scores;

        const presets = {
            easy: { width: 8, height: 8, bombs: 10 },
            medium: { width: 16, height: 16, bombs: 40 },
            hard: { width: 30, height: 16, bombs: 99 }
        };

        const preset = presets[difficulty];
        if (!preset) return scores; // Custom or unknown

        return scores.filter(s =>
            s.width === preset.width &&
            s.height === preset.height &&
            s.bombs === preset.bombs
        );
    }

    /**
     * Formate le temps en MM:SS
     * @param {number} seconds - Temps en secondes
     * @returns {string} Temps formaté
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Efface tous les scores
     */
    clearAllScores() {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.analyticsKey);
    }

    /**
     * Enregistre le début d'une partie ou une défaite pour les statistiques
     */
    trackGameEvent(eventData) {
        try {
            const history = this.getAnalytics();
            history.push({
                playerId: this.playerId,
                codename: this.playerCodename,
                type: eventData.type, // 'start', 'loss', 'win'
                background: eventData.background || 'Unknown',
                difficulty: `${eventData.width}x${eventData.height}`,
                bombs: eventData.bombs,
                time: eventData.time || 0,
                clickData: eventData.clickData || null,
                date: new Date().toISOString()
            });
            // On garde les 200 derniers événements pour ne pas saturer le storage
            localStorage.setItem(this.analyticsKey, JSON.stringify(history.slice(-200)));
        } catch (e) {
            console.warn("Erreur d'analytics:", e);
        }
    }

    getAnalytics() {
        try {
            const data = localStorage.getItem(this.analyticsKey);
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    }

    /**
     * Détermine si un score fait partie du top 10
     * @param {number} score - Score à vérifier
     * @returns {boolean} true si dans le top 10
     */
    isTopScore(score) {
        const topScores = this.getTopScores(10);
        if (topScores.length < 10) return true;
        return score > topScores[topScores.length - 1].score;
    }
}
