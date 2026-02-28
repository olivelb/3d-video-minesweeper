/**
 * Lightweight i18n (internationalization) module.
 * 
 * Provides `t(key, params?)` for translating strings and
 * `translateDOM()` for scanning HTML `data-i18n` attributes.
 * 
 * Supported languages: French (fr), English (en)
 * 
 * @module i18n
 */

// ─── Types ──────────────────────────────────────────────────────────────────

type LangCode = 'fr' | 'en';
type TranslationDict = Record<string, string>;
type TranslationMap = Record<LangCode, TranslationDict>;

// ─────────────────────────────────────────────
//  Translations
// ─────────────────────────────────────────────

const translations: TranslationMap = {
    fr: {
        // ── Page ──
        'page.title': 'Démineur 3D - Multijoueur',
        'page.heading': 'Démineur 3D',

        // ── Menu ──
        'menu.title': 'Configuration',
        'menu.width': 'Largeur',
        'menu.height': 'Hauteur',
        'menu.bombs': 'Bombes',
        'menu.media': 'Média de fond',
        'menu.uploadBtn': 'Ou importer un fichier...',
        'menu.uploadPlaceholder': 'Utilise le préréglage ci-dessus',
        'menu.webcam': 'Utiliser la webcam',
        'menu.webcamHint': 'Si la webcam est refusée ou absente, on revient à la vidéo par défaut.',
        'menu.hoverHelper': 'Aide au survol',
        'menu.noGuess': 'Sans hasard (No Guess)',
        'menu.play': 'JOUER (Solo)',
        'menu.replay': '🔄 REJOUER LA GRILLE',
        'menu.instructions': 'Clic Gauche: Révéler | Clic Droit: Drapeau | Double-Clic: Chord',

        // ── Preset backgrounds ──
        'bg.storm': 'Orage',
        'bg.stormTitle': 'Orage (Vidéo)',
        'bg.marble': 'Marbre',
        'bg.marbleTitle': 'Marbre Gris',
        'bg.metal': 'Métal',
        'bg.metalTitle': 'Métal Sombre',
        'bg.wood': 'Bois',
        'bg.woodTitle': 'Bois Clair',
        'bg.grid': 'Grille',
        'bg.carbon': 'Carbone',
        'bg.space': 'Espace',
        'bg.spaceTitle': 'Nébuleuse',
        'bg.crystal': 'Cristal',
        'bg.neon': 'Néon',
        'bg.fluid': 'Fluide',

        // ── Difficulty presets ──
        'diff.beginner': 'Débutant',
        'diff.intermediate': 'Intermédiaire',
        'diff.expert': 'Expert',
        'diff.giant': 'Géant',
        'diff.tooltip': '{w}×{h}, {b} bombes',

        // ── HUD ──
        'hud.timer': '⏱️ {time}',
        'hud.score': '🏆 Score: {score}',
        'hud.mines': '💣 Mines: {count}',
        'hud.hints': '🧩 Indices: {count}',
        'hud.hintBtn': '🧩 BESOIN D\'AIDE',
        'hud.hintBtnTitle': 'Obtenir un indice logique',
        'hud.hintExplainBtn': '🔍 EXPLIQUER',
        'hud.hintExplainBtnTitle': 'Expliquer pourquoi ce coup est sûr',
        'hud.hintExplainOk': 'OK',
        'hint.basicSafe': 'La case ({cx},{cy}) affiche {n} — ses {flags} voisins minés sont déjà signalés → les cases cachées restantes sont sûres.',
        'hint.basicDeduced': 'En analysant la case ({cx},{cy}) (valeur {n}), le solveur a déduit l\'emplacement de toutes les mines voisines → cette case est sûre.',
        'hint.subset': 'Logique d\'ensemble : La case ({ax},{ay}) [valeur {valA}] et la case ({bx},{by}) [valeur {valB}] partagent des voisins. En comparant leurs contraintes → cette case est déterminée sûre.',
        'hint.gaussian': 'Élimination de Gauss : Le système d\'équations de contraintes a été résolu → cette case est déterminée sûre.',
        'hint.contradiction': 'Preuve par contradiction : Si on suppose que la case ({cx},{cy}) est une mine, cela mène à une impossibilité → cette case est forcément sûre.',
        'hint.tank': 'Analyse exhaustive : Parmi les {configs} configurations valides de mines, cette case est sûre dans chacune d\'entre elles.',
        'hint.globalCount': 'Comptage global : Toutes les mines sont déjà identifiées → les cases restantes sont forcément sûres.',
        'hint.godMode': 'Cette case est sûre. (Aucune déduction logique trouvée depuis l\'état visible)',
        'hud.retryBtn': '🔁 REESSAYER',
        'hud.retryBtnTitle': 'Recommencer au dernier coup sûr',
        'hud.muteOn': '🔊 ON',
        'hud.muteOff': '🔇 OFF',
        'hud.muteBtnTitle': 'Désactiver le son',
        'hud.flagStars': '⭐ ÉTOILES',
        'hud.flagFlags': '🚩 DRAPEAUX',
        'hud.flagBtnTitle': 'Basculer vers les drapeaux 3D',
        'hud.player': '👤 Joueur: {name}',
        'hud.notifGenWarning': 'La génération a été {reason}. La grille n\'est pas garantie 100% logique.',
        'hud.notifGenCancelled': 'interrompue',
        'hud.notifGenLimited': 'limitée à {max} essais',

        // ── Multiplayer ──
        'mp.title': 'Multijoueur',
        'mp.checking': 'Vérification du serveur...',
        'mp.online': 'Serveur disponible',
        'mp.offline': 'Serveur hors ligne',
        'mp.unavailable': 'Serveur non disponible',
        'mp.connectFailed': 'Connexion au serveur échouée',
        'mp.connect': 'Connexion',
        'mp.playerPlaceholder': 'Votre pseudo',
        'mp.playerDefault': 'Joueur',
        'mp.configToggle': '⚙️ Configurer le serveur',
        'mp.configLabel': 'URL du serveur (Tunnel Cloudflare / IP):',
        'mp.configPlaceholder': 'https://votre-id.trycloudflare.com',
        'mp.configSave': 'Enregistrer',
        'mp.configReset': 'Défaut',
        'mp.createTitle': '🎮 Créer une partie',
        'mp.maxPlayers': 'Nombre de joueurs (2-8)',
        'mp.createBtn': 'Créer la partie',
        'mp.leave': 'Quitter',
        'mp.waiting': '⏳ En attente des joueurs...',
        'mp.startBtn': 'Démarrer la partie',
        'mp.cancelBtn': 'Annuler',
        'mp.joinTitle': '🎮 Rejoindre',
        'mp.guestWaiting': '⏳ En attente que l\'hôte crée la partie...',
        'mp.guestReady': 'Partie prête !',
        'mp.joinBtn': 'Rejoindre la partie',
        'mp.hostLeft': 'L\'hôte a quitté la partie',
        'mp.hostBadge': 'HÔTE',
        'mp.serverLimit': 'Les dimensions maximales sont {maxW}x{maxH} avec {maxB} bombes pour la stabilité du serveur.',
        'mp.densityLimit': 'Mode \'No Guess\': Densité trop élevée! Max {max} bombes (22%).',
        'mp.configSummary': '{w}×{h} • {b} 💣 (Max: {max} joueurs)',
        'mp.generatingGrid': 'Calcul de la grille... ({attempt})',
        'mp.eliminated': 'ÉLIMINÉ',
        'mp.spectatorMode': 'Mode Spectateur Actif',
        'mp.spectatorLeave': 'QUITTER LA PARTIE',
        'mp.playerEliminated': '{name} a été éliminé!',
        'mp.eliminatedMsg': 'a été éliminé!',

        // ── Loading ──
        'loading.title': 'Génération de la grille...',
        'loading.text': 'Recherche d\'une configuration valide...',
        'loading.attempt': 'Tentative {current} / {max}',
        'loading.cancel': 'ARRÊTER',

        // ── Leaderboard ──
        'lb.title': '🏆 Meilleurs Scores',
        'lb.empty': 'Aucun score enregistré',
        'lb.clear': 'Effacer les scores',
        'lb.analytics': '📊 Analytiques',
        'lb.clearConfirm': 'Êtes-vous sûr de vouloir supprimer tous les scores ?',
        'lb.noScoreManager': 'Score manager non disponible',
        'lb.easy': 'Facile',
        'lb.medium': 'Moyen',
        'lb.hard': 'Difficile',
        'lb.custom': 'Personnalisé',

        // ── Multiplayer Leaderboard ──
        'mlb.title': '🎮 Multijoueur',
        'mlb.tabWins': 'Victoires',
        'mlb.tabScore': 'Score',
        'mlb.tabRecord': 'Record',
        'mlb.loading': 'Chargement...',
        'mlb.recentGames': '📜 Parties récentes',
        'mlb.recentGamesTitle': '📜 Parties Récentes',
        'mlb.stats': 'Statistiques',
        'mlb.serverError': 'Erreur serveur',
        'mlb.noGames': 'Aucune partie enregistrée',
        'mlb.playerNotFound': 'Joueur non trouvé',
        'mlb.sectionPerf': 'Performance',
        'mlb.sectionScores': 'Scores',
        'mlb.sectionStats': 'Statistiques',
        'mlb.wins': 'Victoires',
        'mlb.games': 'Parties',
        'mlb.winRate': 'Win Rate',
        'mlb.record': 'Record',
        'mlb.average': 'Moyenne',
        'mlb.total': 'Total',
        'mlb.cells': 'Cellules',
        'mlb.correctFlags': 'Drapeaux ✓',
        'mlb.eliminated': '💀 Éliminé',
        'mlb.recentSection': 'Parties récentes',
        'mlb.winsDetail': '{wins}V / {games} parties · {rate}%',

        // ── Scoreboard ──
        'sb.title': '🏆 Scores',
        'sb.resultsTitle': 'Partie Terminée',
        'sb.rank': '#',
        'sb.player': 'Joueur',
        'sb.score': 'Score',
        'sb.cells': 'Cellules',
        'sb.flags': 'Drapeaux ✓',
        'sb.menuBtn': 'Menu',
        'sb.winner': '🏆 {name} gagne!',
        'sb.allEliminated': '💀 Tous éliminés!',
        'sb.gameOver': '💥 Partie terminée',

        // ── 3D Text ──
        'game.win': 'BRAVO',
        'game.loss': 'PERDU',

        // ── Analytics ──
        'an.pageTitle': 'Démineur 3D - Analytics',
        'an.back': '← Retour au jeu',
        'an.title': '📊 Analytics Dashboard',
        'an.subtitle': 'Analyse comportementale et détection de sensibilité aux médias',
        'an.tabGeneral': '📈 Vue Générale',
        'an.tabSensitivity': '🧠 Analyse de Sensibilité',
        'an.tabHistory': '📜 Historique',
        'an.totalGames': 'Parties Totales',
        'an.globalRate': 'Taux Global',
        'an.customGames': 'Parties Custom',
        'an.customRate': 'Taux Custom',
        'an.avgDecision': 'Décision Moy.',
        'an.winRateByBg': '🎯 Taux de Victoire par Fond',
        'an.avgDecisionTime': '⏱️ Temps de Décision Moyen',
        'an.presetVsCustom': '📊 Comparaison Préréglages vs Uploads Personnalisés',
        'an.anomalyTitle': '🔍 Détection d\'Anomalies sur Fichiers Uploadés',
        'an.anomalyDesc': 'Cette analyse détecte si un fichier uploadé (image/vidéo personnelle) affecte négativement vos performances par rapport à votre niveau habituel. Des signes de distraction, hésitation ou attachement émotionnel sont recherchés.',
        'an.behavioralTitle': '📉 Indicateurs Comportementaux',
        'an.historyTitle': '📜 Historique Complet des Parties',
        'an.exportCsv': '📥 Exporter CSV',
        'an.clearData': '🗑️ Effacer les données',
        'an.clearConfirm': 'Effacer toutes les données analytics?',
        'an.noData': 'Aucune donnée.',
        'an.noCustom': 'Aucun fichier personnalisé détecté. Uploadez une image ou vidéo pour commencer l\'analyse.',
        'an.noHistory': 'Aucun historique disponible.',
        'an.noUpload': 'Aucun upload',
        'an.winRateLabel': 'Taux de Victoire (%)',
        'an.decisionLabel': 'Temps de Décision (s)',
        'an.hesitationLabel': 'Hésitations (pauses >5s)',
        'an.hesitationByBg': 'Hésitations par Fond',
        'an.customDistribution': 'Répartition Uploads Personnalisés',
        'an.colMetric': 'Métrique',
        'an.colPresets': 'Préréglages',
        'an.colCustom': 'Uploads Personnalisés',
        'an.colAnalysis': 'Analyse',
        'an.gamesPlayed': 'Parties jouées',
        'an.winRate': 'Taux de victoire',
        'an.decisionTime': 'Temps de décision moyen',
        'an.longPauses': 'Pauses longues (>5s)',
        'an.gapSignificant': '⚠️ Écart significatif',
        'an.gapModerate': '➖ Écart modéré',
        'an.gapNormal': '✅ Normal',
        'an.hesitationDetected': '⚠️ Hésitation détectée',
        'an.distractionPossible': '⚠️ Distraction possible',
        'an.sensitivityHigh': '🚨 Sensibilité Élevée',
        'an.sensitivityMedium': '⚠️ Sensibilité Modérée',
        'an.sensitivityNormal': '✅ Normal',
        'an.longestPause': 'Plus longue pause',
        'an.repeatedUse': 'Utilisations répétées',
        'an.pausesDetected': 'Pauses longues détectées',
        'an.frequentHesitation': 'Hésitation fréquente',
        'an.majorDistraction': 'Distraction majeure',
        'an.possibleAttachment': 'Attachement possible',
        'an.vsBaseline': '-{diff}% vs baseline',
        'an.slowerPct': '+{diff}% plus lent',
        'an.colDate': 'Date',
        'an.colResult': 'Résultat',
        'an.colBg': 'Fond',
        'an.colDifficulty': 'Difficulté',
        'an.colTime': 'Temps',
        'an.colAvgDecision': 'Décision Moy.',
        'an.colHesitations': 'Hésitations',
        'an.win': '🏆 Victoire',
        'an.loss': '💥 Défaite',
    },

    en: {
        // ── Page ──
        'page.title': '3D Minesweeper - Multiplayer',
        'page.heading': '3D Minesweeper',

        // ── Menu ──
        'menu.title': 'Configuration',
        'menu.width': 'Width',
        'menu.height': 'Height',
        'menu.bombs': 'Bombs',
        'menu.media': 'Background media',
        'menu.uploadBtn': 'Or import a file...',
        'menu.uploadPlaceholder': 'Using preset above',
        'menu.webcam': 'Use webcam',
        'menu.webcamHint': 'If the webcam is denied or unavailable, the default preset is used.',
        'menu.hoverHelper': 'Hover helper',
        'menu.noGuess': 'No Guess mode',
        'menu.play': 'PLAY (Solo)',
        'menu.replay': '🔄 REPLAY GRID',
        'menu.instructions': 'Left Click: Reveal | Right Click: Flag | Double-Click: Chord',

        // ── Preset backgrounds ──
        'bg.storm': 'Storm',
        'bg.stormTitle': 'Storm (Video)',
        'bg.marble': 'Marble',
        'bg.marbleTitle': 'Grey Marble',
        'bg.metal': 'Metal',
        'bg.metalTitle': 'Dark Metal',
        'bg.wood': 'Wood',
        'bg.woodTitle': 'Light Wood',
        'bg.grid': 'Grid',
        'bg.carbon': 'Carbon',
        'bg.space': 'Space',
        'bg.spaceTitle': 'Nebula',
        'bg.crystal': 'Crystal',
        'bg.neon': 'Neon',
        'bg.fluid': 'Fluid',

        // ── Difficulty presets ──
        'diff.beginner': 'Beginner',
        'diff.intermediate': 'Intermediate',
        'diff.expert': 'Expert',
        'diff.giant': 'Giant',
        'diff.tooltip': '{w}×{h}, {b} bombs',

        // ── HUD ──
        'hud.timer': '⏱️ {time}',
        'hud.score': '🏆 Score: {score}',
        'hud.mines': '💣 Mines: {count}',
        'hud.hints': '🧩 Hints: {count}',
        'hud.hintBtn': '🧩 NEED HELP',
        'hud.hintBtnTitle': 'Get a logic-based hint',
        'hud.hintExplainBtn': '🔍 EXPLAIN',
        'hud.hintExplainBtnTitle': 'Explain why this move is safe',
        'hud.hintExplainOk': 'OK',
        'hint.basicSafe': 'Cell ({cx},{cy}) shows {n} — its {flags} mined neighbors are already flagged → remaining hidden neighbors are safe.',
        'hint.basicDeduced': 'By analyzing cell ({cx},{cy}) (value {n}), the solver deduced all neighboring mines → this cell is safe.',
        'hint.subset': 'Subset logic: Cell ({ax},{ay}) [value {valA}] and cell ({bx},{by}) [value {valB}] share neighbors. Comparing their constraints → this cell is determined safe.',
        'hint.gaussian': 'Gaussian elimination: The constraint equation system was solved → this cell is determined safe.',
        'hint.contradiction': 'Proof by contradiction: Assuming cell ({cx},{cy}) is a mine leads to an impossibility → this cell must be safe.',
        'hint.tank': 'Exhaustive analysis: Among {configs} valid mine configurations, this cell is safe in every one of them.',
        'hint.globalCount': 'Global count: All mines are already identified → remaining cells are necessarily safe.',
        'hint.godMode': 'This cell is safe. (No logical deduction found from visible state)',
        'hud.retryBtn': '🔁 RETRY',
        'hud.retryBtnTitle': 'Restart from last safe move',
        'hud.muteOn': '🔊 ON',
        'hud.muteOff': '🔇 OFF',
        'hud.muteBtnTitle': 'Toggle sound',
        'hud.flagStars': '⭐ STARS',
        'hud.flagFlags': '🚩 FLAGS',
        'hud.flagBtnTitle': 'Switch to 3D flags',
        'hud.player': '👤 Player: {name}',
        'hud.notifGenWarning': 'Generation was {reason}. The grid is not guaranteed 100% logical.',
        'hud.notifGenCancelled': 'cancelled',
        'hud.notifGenLimited': 'limited to {max} attempts',

        // ── Multiplayer ──
        'mp.title': 'Multiplayer',
        'mp.checking': 'Checking server...',
        'mp.online': 'Server available',
        'mp.offline': 'Server offline',
        'mp.unavailable': 'Server unavailable',
        'mp.connectFailed': 'Connection to server failed',
        'mp.connect': 'Connect',
        'mp.playerPlaceholder': 'Your nickname',
        'mp.playerDefault': 'Player',
        'mp.configToggle': '⚙️ Configure server',
        'mp.configLabel': 'Server URL (Cloudflare Tunnel / IP):',
        'mp.configPlaceholder': 'https://your-id.trycloudflare.com',
        'mp.configSave': 'Save',
        'mp.configReset': 'Default',
        'mp.createTitle': '🎮 Create a game',
        'mp.maxPlayers': 'Number of players (2-8)',
        'mp.createBtn': 'Create game',
        'mp.leave': 'Leave',
        'mp.waiting': '⏳ Waiting for players...',
        'mp.startBtn': 'Start game',
        'mp.cancelBtn': 'Cancel',
        'mp.joinTitle': '🎮 Join',
        'mp.guestWaiting': '⏳ Waiting for the host to create a game...',
        'mp.guestReady': 'Game ready!',
        'mp.joinBtn': 'Join game',
        'mp.hostLeft': 'The host has left the game',
        'mp.hostBadge': 'HOST',
        'mp.serverLimit': 'Max dimensions are {maxW}x{maxH} with {maxB} bombs for server stability.',
        'mp.densityLimit': 'No Guess mode: Density too high! Max {max} bombs (22%).',
        'mp.configSummary': '{w}×{h} • {b} 💣 (Max: {max} players)',
        'mp.generatingGrid': 'Computing grid... ({attempt})',
        'mp.eliminated': 'ELIMINATED',
        'mp.spectatorMode': 'Spectator Mode Active',
        'mp.spectatorLeave': 'LEAVE GAME',
        'mp.playerEliminated': '{name} was eliminated!',
        'mp.eliminatedMsg': 'was eliminated!',

        // ── Loading ──
        'loading.title': 'Generating grid...',
        'loading.text': 'Searching for a valid configuration...',
        'loading.attempt': 'Attempt {current} / {max}',
        'loading.cancel': 'STOP',

        // ── Leaderboard ──
        'lb.title': '🏆 High Scores',
        'lb.empty': 'No scores recorded',
        'lb.clear': 'Clear scores',
        'lb.analytics': '📊 Analytics',
        'lb.clearConfirm': 'Are you sure you want to delete all scores?',
        'lb.noScoreManager': 'Score manager unavailable',
        'lb.easy': 'Easy',
        'lb.medium': 'Medium',
        'lb.hard': 'Hard',
        'lb.custom': 'Custom',

        // ── Multiplayer Leaderboard ──
        'mlb.title': '🎮 Multiplayer',
        'mlb.tabWins': 'Wins',
        'mlb.tabScore': 'Score',
        'mlb.tabRecord': 'Record',
        'mlb.loading': 'Loading...',
        'mlb.recentGames': '📜 Recent games',
        'mlb.recentGamesTitle': '📜 Recent Games',
        'mlb.stats': 'Statistics',
        'mlb.serverError': 'Server error',
        'mlb.noGames': 'No games recorded',
        'mlb.playerNotFound': 'Player not found',
        'mlb.sectionPerf': 'Performance',
        'mlb.sectionScores': 'Scores',
        'mlb.sectionStats': 'Statistics',
        'mlb.wins': 'Wins',
        'mlb.games': 'Games',
        'mlb.winRate': 'Win Rate',
        'mlb.record': 'Record',
        'mlb.average': 'Average',
        'mlb.total': 'Total',
        'mlb.cells': 'Cells',
        'mlb.correctFlags': 'Correct Flags',
        'mlb.eliminated': '💀 Eliminated',
        'mlb.recentSection': 'Recent games',
        'mlb.winsDetail': '{wins}W / {games} games · {rate}%',

        // ── Scoreboard ──
        'sb.title': '🏆 Scores',
        'sb.resultsTitle': 'Game Over',
        'sb.rank': '#',
        'sb.player': 'Player',
        'sb.score': 'Score',
        'sb.cells': 'Cells',
        'sb.flags': 'Correct Flags',
        'sb.menuBtn': 'Menu',
        'sb.winner': '🏆 {name} wins!',
        'sb.allEliminated': '💀 All eliminated!',
        'sb.gameOver': '💥 Game over',

        // ── 3D Text ──
        'game.win': 'BRAVO',
        'game.loss': 'GAME OVER',

        // ── Analytics ──
        'an.pageTitle': '3D Minesweeper - Analytics',
        'an.back': '← Back to game',
        'an.title': '📊 Analytics Dashboard',
        'an.subtitle': 'Behavioral analysis and media sensitivity detection',
        'an.tabGeneral': '📈 Overview',
        'an.tabSensitivity': '🧠 Sensitivity Analysis',
        'an.tabHistory': '📜 History',
        'an.totalGames': 'Total Games',
        'an.globalRate': 'Global Rate',
        'an.customGames': 'Custom Games',
        'an.customRate': 'Custom Rate',
        'an.avgDecision': 'Avg. Decision',
        'an.winRateByBg': '🎯 Win Rate by Background',
        'an.avgDecisionTime': '⏱️ Average Decision Time',
        'an.presetVsCustom': '📊 Presets vs Custom Uploads Comparison',
        'an.anomalyTitle': '🔍 Anomaly Detection on Uploaded Files',
        'an.anomalyDesc': 'This analysis detects whether an uploaded file (personal image/video) negatively affects your performance compared to your usual level. Signs of distraction, hesitation or emotional attachment are sought.',
        'an.behavioralTitle': '📉 Behavioral Indicators',
        'an.historyTitle': '📜 Full Game History',
        'an.exportCsv': '📥 Export CSV',
        'an.clearData': '🗑️ Clear data',
        'an.clearConfirm': 'Clear all analytics data?',
        'an.noData': 'No data.',
        'an.noCustom': 'No custom file detected. Upload an image or video to begin the analysis.',
        'an.noHistory': 'No history available.',
        'an.noUpload': 'No upload',
        'an.winRateLabel': 'Win Rate (%)',
        'an.decisionLabel': 'Decision Time (s)',
        'an.hesitationLabel': 'Hesitations (pauses >5s)',
        'an.hesitationByBg': 'Hesitations by Background',
        'an.customDistribution': 'Custom Uploads Distribution',
        'an.colMetric': 'Metric',
        'an.colPresets': 'Presets',
        'an.colCustom': 'Custom Uploads',
        'an.colAnalysis': 'Analysis',
        'an.gamesPlayed': 'Games played',
        'an.winRate': 'Win rate',
        'an.decisionTime': 'Average decision time',
        'an.longPauses': 'Long pauses (>5s)',
        'an.gapSignificant': '⚠️ Significant gap',
        'an.gapModerate': '➖ Moderate gap',
        'an.gapNormal': '✅ Normal',
        'an.hesitationDetected': '⚠️ Hesitation detected',
        'an.distractionPossible': '⚠️ Possible distraction',
        'an.sensitivityHigh': '🚨 High Sensitivity',
        'an.sensitivityMedium': '⚠️ Moderate Sensitivity',
        'an.sensitivityNormal': '✅ Normal',
        'an.longestPause': 'Longest pause',
        'an.repeatedUse': 'Repeated uses',
        'an.pausesDetected': 'Long pauses detected',
        'an.frequentHesitation': 'Frequent hesitation',
        'an.majorDistraction': 'Major distraction',
        'an.possibleAttachment': 'Possible attachment',
        'an.vsBaseline': '-{diff}% vs baseline',
        'an.slowerPct': '+{diff}% slower',
        'an.colDate': 'Date',
        'an.colResult': 'Result',
        'an.colBg': 'Background',
        'an.colDifficulty': 'Difficulty',
        'an.colTime': 'Time',
        'an.colAvgDecision': 'Avg. Decision',
        'an.colHesitations': 'Hesitations',
        'an.win': '🏆 Victory',
        'an.loss': '💥 Defeat',
    }
};

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────

const STORAGE_KEY = 'minesweeper_lang';
const SUPPORTED_LANGS: LangCode[] = ['fr', 'en'];
const DEFAULT_LANG: LangCode = 'fr';

let currentLang: LangCode = DEFAULT_LANG;

// ─────────────────────────────────────────────
//  Core API
// ─────────────────────────────────────────────

/**
 * Translate a key, optionally interpolating parameters.
 */
export function t(key: string, params?: Record<string, string | number>): string {
    const dict = translations[currentLang] || translations[DEFAULT_LANG];
    let str: string | undefined = dict[key];
    if (str === undefined) {
        str = translations[DEFAULT_LANG][key];
    }
    if (str === undefined) return key;

    if (params) {
        for (const [k, v] of Object.entries(params)) {
            str = str.replaceAll(`{${k}}`, String(v));
        }
    }
    return str;
}

/**
 * Get the current language code.
 */
export function getLang(): LangCode {
    return currentLang;
}

/**
 * Get the locale string for date/number formatting.
 */
export function getLocale(): string {
    return currentLang === 'fr' ? 'fr-FR' : 'en-US';
}

/**
 * Set the active language and re-translate the DOM.
 */
export function setLang(lang: string): void {
    if (!SUPPORTED_LANGS.includes(lang as LangCode)) return;
    currentLang = lang as LangCode;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
    document.documentElement.lang = lang;
    document.title = t('page.title');
    translateDOM();
    window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

/**
 * Scan the DOM for elements with `data-i18n` attributes and update their text.
 */
export function translateDOM(): void {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t((el as HTMLElement).dataset.i18n!);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        (el as HTMLInputElement).placeholder = t((el as HTMLElement).dataset.i18nPlaceholder!);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        (el as HTMLElement).title = t((el as HTMLElement).dataset.i18nTitle!);
    });
    document.querySelectorAll('[data-i18n-value]').forEach(el => {
        (el as HTMLInputElement).value = t((el as HTMLElement).dataset.i18nValue!);
    });
}

// ─────────────────────────────────────────────
//  Initialization
// ─────────────────────────────────────────────

/**
 * Initialize language from localStorage or browser preference.
 */
export function initLang(): void {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && SUPPORTED_LANGS.includes(stored as LangCode)) {
            currentLang = stored as LangCode;
            document.documentElement.lang = currentLang;
            document.title = t('page.title');
            translateDOM();
            return;
        }
    } catch (e) { /* ignore */ }

    const browserLang = (navigator.language || '').slice(0, 2).toLowerCase();
    if (SUPPORTED_LANGS.includes(browserLang as LangCode)) {
        currentLang = browserLang as LangCode;
    } else {
        currentLang = DEFAULT_LANG;
    }

    document.documentElement.lang = currentLang;
    document.title = t('page.title');
    translateDOM();
}
