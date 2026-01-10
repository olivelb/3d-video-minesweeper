/**
 * ScoreManager - Gère les scores et le classement
 * Utilise localStorage pour la persistance
 */
export class ScoreManager {
    constructor() {
        this.storageKey = 'minesweeper3d_scores';
    }

    /**
     * Calcule le score basé sur la difficulté et le temps
     * @param {number} width - Largeur de la grille
     * @param {number} height - Hauteur de la grille
     * @param {number} bombs - Nombre de bombes
     * @param {number} timeSeconds - Temps en secondes
     * @returns {number} Score calculé
     */
    calculateScore(width, height, bombs, timeSeconds) {
        // Facteur de difficulté: grille * densité de bombes
        const gridSize = width * height;
        const bombDensity = bombs / gridSize;
        const difficultyFactor = gridSize * bombDensity * 10;
        
        // Bonus de vitesse: plus rapide = meilleur score
        // Base de 10000 points, moins le temps (secondes)
        const timeBonus = Math.max(0, 10000 - timeSeconds * 10);
        
        // Score final = difficulté * 100 + bonus temps
        const finalScore = Math.floor(difficultyFactor * 100 + timeBonus);
        
        return finalScore;
    }

    /**
     * Sauvegarde un nouveau score
     * @param {Object} scoreData - { width, height, bombs, time, score, date }
     */
    saveScore(scoreData) {
        const scores = this.getAllScores();
        scores.push({
            width: scoreData.width,
            height: scoreData.height,
            bombs: scoreData.bombs,
            time: scoreData.time,
            score: scoreData.score,
            date: scoreData.date || new Date().toISOString()
        });
        
        // Trier par score décroissant
        scores.sort((a, b) => b.score - a.score);
        
        // Garder seulement les 50 meilleurs scores
        const topScores = scores.slice(0, 50);
        
        localStorage.setItem(this.storageKey, JSON.stringify(topScores));
        
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
