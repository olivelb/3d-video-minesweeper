# État du Multijoueur Compétitif - Session de Dev

**Dernière mise à jour**: 9 Février 2026  
**Serveur**: Raspberry Pi `raspberrol` @ `your-pi-ip:3001`  
**Déploiement**: PM2 (minesweeper-multiplayer)

## Fonctionnalités Implémentées ✅

1. **Connexion au serveur dédié** - Socket.io stable sur Cloudflare Tunnel.
2. **Lobby Dynamique** - Supporte jusqu'à 8 joueurs simultanément.
3. **Configuration de l'Hôte** - L'hôte peut définir la limite de joueurs (2-8) avant de créer la partie.
4. **Démarrage Manuel** - L'hôte peut lancer la partie dès qu'il y a au moins 2 joueurs, ou attendre que le lobby soit plein.
5. **Liste des Joueurs** - Affichage en temps réel des joueurs connectés avec badges (Hôte, "Moi").
6. **Système d'Élimination** - Un joueur qui clique sur une bombe est éliminé mais la partie continue.
7. **Bombes révélées** - Les bombes cliquées sont affichées avec un visuel distinct pour tous.
8. **Notifications** - Alertes visuelles quand un joueur est éliminé.
9. **Synchronisation Authoritaire** - Le premier clic sécurisé et toutes les actions sont validés par le serveur.
10. **Solveur Gaussien (Bêta)** - Intégration du solveur par élimination de Gauss pour la génération "No Guess" et les indices, côté client et serveur (Raspberry Pi).
11. **Stabilité Serveur** - Limites strictes (150x100, 2000 bombes) pour prévenir les crashs mémoire.
12. **Feedback Génération** - Modal de progression en temps réel pour les générations lentes sur Raspberry Pi.

## Système d'Élimination 🎯

### Comportement quand un joueur clique sur une bombe:
1. Le joueur est marqué comme **éliminé** sur le serveur.
2. Un événement `playerEliminated` est envoyé à tous les clients.
3. Le joueur éliminé voit l'**animation d'explosion** et retourne au **menu après 3 secondes**.
4. Les autres joueurs voient la **bombe révélée** (icône bombe avec X rouge) et une **notification**.
5. La partie **continue** pour les joueurs restants.
6. Le **serveur ne reset PAS** - même si c'est l'hôte qui est éliminé.

### Conditions de fin de partie:
- **Victoire** : Un joueur révèle toutes les cases non-minées → `gameOver { victory: true, winner: name }`.
- **Défaite totale** : Tous les joueurs sont éliminés → `gameOver { victory: false, reason: 'allEliminated' }`.
- Après `gameOver`, le serveur reset automatiquement après 10 secondes (ou quand tout le monde quitte).

## États des cellules (visibleGrid)

| Valeur | Signification |
|--------|---------------|
| -1 | Caché |
| 0 | Révélé, vide |
| 1-8 | Révélé, nombre de mines adjacentes |
| 9 | Explosion (utilisé côté client pour l'animation) |
| 10 | Bombe révélée (joueur éliminé) |

## Bugs Récents Résolus ✅

1. **Auto-start prématuré** - Correction du bug où la partie se lançait à 2 joueurs même si le max était fixé à 4+.
2. **Synchronisation du Lobby** - Utilisation d'un composant `MultiplayerUI.js` dédié pour éviter les duplications de logique dans `UIManager`.
3. **Mise en page Lobby** - Refonte du CSS pour éviter les chevauchements et améliorer la lisibilité de la liste des joueurs.
4. **Quoting Script Déploiement** - Correction des erreurs de parsing PowerShell dans `deploy.ps1`.
5. **Gestionnaire de Score** - Implémentation de `getScores()` pour filtrer le leaderboard correctement.
6. **Reset Multijoueur** - Implémentation d'un reset propre côté client et serveur après chaque partie.
7. **Performance Génération** - Optimisation de la boucle de génération et ajout d'un feedback visuel pour l'attente.

## Internationalisation (i18n) 🌍

Un système i18n complet a été intégré :

- **Module** : `javascripts/i18n.js` — Fournit `t(key, params?)`, `translateDOM()`, `setLang()`, `getLang()`, `getLocale()`, `initLang()`.
- **Langues** : Français (par défaut) et Anglais.
- **Mécanisme** : Attributs `data-i18n` sur le HTML statique + appels `t()` dans le JS dynamique.
- **Switching live** : `setLang()` envoie un `CustomEvent('langchange')` que tous les composants écoutent pour se re-rendre.
- **Couverture** :
  - `index.html` — Menu, HUD, boutons, presets, tooltips, labels.
  - Composants UI — `MenuController`, `MultiplayerUI`, `MultiplayerLeaderboard`, `Scoreboard`, `HUDController`, `LeaderboardController`.
  - `analytics.html` — Toutes les ~65 chaînes (stats, graphiques, tables, badges, alertes). Script converti en `<script type="module">` avec import i18n. Sélecteur FR/EN intégré.
- **Persistance** : Langue stockée dans `localStorage` (`minesweeper_lang`), respectée au rechargement.
- **Date locale** : `getLocale()` retourne `'fr-FR'` ou `'en-US'` pour `toLocaleString()`.

## Fonctionnalités Récemment Complétées ✅

13. **Mode Spectateur** — Les joueurs éliminés peuvent continuer à observer la partie (mode fantôme + bouton "Retour au lobby").
14. **Internationalisation (FR/EN)** — Toutes les pages et composants dynamiques supportent le français et l'anglais avec switching live.
15. **Analytics i18n** — `analytics.html` entièrement internationalisée (~65 clés `an.*`), avec sélecteur de langue intégré et re-rendu complet des graphiques/tables au changement.

## Prochaines Étapes 🚀

1. [ ] Animations de transition plus fluides dans le lobby (slide-with-crossfade CSS).
2. [ ] Système de chat d'avant-partie.
3. [ ] Statistiques de fin de partie détaillées (cases révélées par joueur).

## Notes Techniques

- **Shared Solvers** : Les algorithmes de résolution (MinesweeperSolver, GaussianElimination) sont dans `shared/` et importés par le client et le serveur.
- **Shared States** : Les positions des mines sont générées côté serveur pour garantir l'équité.
- **Autorité** : Le serveur maintient la "visibleGrid" réelle pour prévenir la triche.
- **Sécurité Serveur** : Validation des entrées, sanitization des noms, et rate limiting (10 actions/s, 30 curseurs/s).
- **i18n** : Module `javascripts/i18n.js` avec ~190 clés FR/EN. `data-i18n` sur le DOM statique, `t()` pour le JS dynamique, `langchange` event pour le re-rendu live.
