/**
 * ScoreManager - Gère les scores et le classement
 * Utilise localStorage pour la persistance
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScoreOptions {
    noGuessMode?: boolean;
    hintCount?: number;
    retryCount?: number;
}

interface ScoreData {
    width: number;
    height: number;
    bombs: number;
    time: number;
    score: number;
    noGuessMode?: boolean;
    hintCount?: number;
    retryCount?: number;
    background?: string;
    date?: string;
}

interface ScoreEntry extends ScoreData {
    playerId: string;
    codename: string;
}

interface GameEvent {
    type: 'start' | 'loss' | 'win';
    background?: string;
    width: number;
    height: number;
    bombs: number;
    time?: number;
    clickData?: unknown;
}

interface AnalyticsEntry {
    playerId: string;
    codename: string;
    type: string;
    background: string;
    difficulty: string;
    bombs: number;
    time: number;
    clickData: unknown;
    date: string;
}

interface DifficultyPreset {
    width: number;
    height: number;
    bombs: number;
}

// ─── Class ──────────────────────────────────────────────────────────────────

export class ScoreManager {
    storageKey: string;
    analyticsKey: string;
    playerIdKey: string;
    playerId: string;
    playerCodename: string;

    constructor() {
        this.storageKey = 'minesweeper3d_scores';
        this.analyticsKey = 'minesweeper3d_analytics';
        this.playerIdKey = 'minesweeper3d_player_id';
        this.playerId = '';
        this.playerCodename = '';
        this.initPlayer();
    }

    initPlayer(): void {
        let id = localStorage.getItem(this.playerIdKey);
        if (!id) {
            id = 'p_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
            localStorage.setItem(this.playerIdKey, id);
        }
        this.playerId = id;
        this.playerCodename = this.generateCodename(id);
    }

    generateCodename(id: string): string {
        const adjectives = ["Neon", "Cyber", "Mega", "Shadow", "Delta", "Star", "Turbo", "Ghost", "Alpha", "Omega"];
        const nouns = ["Tiger", "Droid", "Fox", "Falcon", "Ghost", "Runner", "Pixel", "Wizard", "Titan", "Core"];

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

    getPlayerInfo(): { id: string; codename: string } {
        return {
            id: this.playerId,
            codename: this.playerCodename
        };
    }

    calculateScore(width: number, height: number, bombs: number, timeSeconds: number, options: ScoreOptions = {}): number {
        const { noGuessMode = false, hintCount = 0, retryCount = 0 } = options;

        const gridSize = width * height;
        const bombDensity = bombs / gridSize;
        const difficultyFactor = gridSize * bombDensity * 1000;

        let finalScore = difficultyFactor - timeSeconds * 10;

        if (noGuessMode) finalScore *= 0.75;

        for (let i = 1; i < hintCount; i++) {
            finalScore -= 1500 + (i - 1) * 1000;
        }

        for (let i = 0; i < retryCount; i++) {
            finalScore -= 5000;
            finalScore *= 0.75;
        }

        return Math.floor(Math.max(0, finalScore));
    }

    saveScore(scoreData: ScoreData): ScoreEntry[] {
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

        scores.sort((a, b) => b.score - a.score);

        const topScores = scores.slice(0, 50);

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(topScores));
        } catch (e) {
            console.error('[ScoreManager] Failed to save to localStorage:', e);
        }

        return topScores;
    }

    getAllScores(): ScoreEntry[] {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.warn("Erreur lors de la lecture des scores:", e);
            return [];
        }
    }

    getTopScores(limit = 10): ScoreEntry[] {
        const scores = this.getAllScores();
        return scores.slice(0, limit);
    }

    getScores(difficulty = 'all'): ScoreEntry[] {
        const scores = this.getAllScores();
        if (difficulty === 'all') return scores;

        const presets: Record<string, DifficultyPreset> = {
            easy: { width: 8, height: 8, bombs: 10 },
            medium: { width: 16, height: 16, bombs: 40 },
            hard: { width: 30, height: 16, bombs: 99 }
        };

        const preset = presets[difficulty];
        if (!preset) return scores;

        return scores.filter(s =>
            s.width === preset.width &&
            s.height === preset.height &&
            s.bombs === preset.bombs
        );
    }

    formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    clearAllScores(): void {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.analyticsKey);
    }

    trackGameEvent(eventData: GameEvent): void {
        try {
            const history = this.getAnalytics();
            history.push({
                playerId: this.playerId,
                codename: this.playerCodename,
                type: eventData.type,
                background: eventData.background || 'Unknown',
                difficulty: `${eventData.width}x${eventData.height}`,
                bombs: eventData.bombs,
                time: eventData.time || 0,
                clickData: eventData.clickData || null,
                date: new Date().toISOString()
            });
            localStorage.setItem(this.analyticsKey, JSON.stringify(history.slice(-200)));
        } catch (e) {
            console.warn("Erreur d'analytics:", e);
        }
    }

    getAnalytics(): AnalyticsEntry[] {
        try {
            const data = localStorage.getItem(this.analyticsKey);
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    }

    isTopScore(score: number): boolean {
        const topScores = this.getTopScores(10);
        if (topScores.length < 10) return true;
        return score > topScores[topScores.length - 1].score;
    }
}
