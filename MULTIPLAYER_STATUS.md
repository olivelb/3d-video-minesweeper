# État du Multijoueur Compétitif - Session de Dev

**Date**: 4 Février 2026  
**Serveur**: Raspberry Pi @ 192.168.1.232:3001  
**Déploiement**: PM2 (minesweeper-multiplayer)

## Fonctionnalités Implémentées ✅

1. **Connexion au serveur dédié** - Socket.io fonctionne
2. **Flux P1 crée / P2 rejoint** - Fonctionne 
3. **Premier clic sécurisé** - Les mines sont placées après le premier clic avec zone de sécurité 3x3
4. **Synchronisation des actions** - `gameUpdate` envoyé à tous après chaque action
5. **Système d'élimination** - Un joueur qui clique sur une bombe est éliminé mais la partie continue pour les autres
6. **Bombes révélées** - Les bombes cliquées sont affichées avec un visuel distinct (bombe avec X rouge)
7. **Notifications** - Message "X a été éliminé!" affiché aux joueurs restants
8. **Fin de partie** - `gameOver` envoyé quand tous les joueurs sont éliminés ou quand un joueur gagne
9. **Retour au menu** - Le joueur éliminé retourne au menu, le serveur reset quand tous sont éliminés

## Système d'Élimination 🎯

### Comportement quand un joueur clique sur une bombe:
1. Le joueur est marqué comme **éliminé** sur le serveur
2. Un événement `playerEliminated` est envoyé à tous les clients
3. Le joueur éliminé voit l'**animation d'explosion** et retourne au **menu après 3 secondes**
4. Les autres joueurs voient la **bombe révélée** (icône bombe avec X rouge) et une **notification**
5. La partie **continue** pour les joueurs restants
6. Le **serveur ne reset PAS** - même si c'est l'hôte qui est éliminé

### Conditions de fin de partie:
- **Victoire** : Un joueur révèle toutes les cases non-minées → `gameOver { victory: true }`
- **Défaite totale** : Tous les joueurs sont éliminés → `gameOver { victory: false, reason: 'allEliminated' }`
- Après `gameOver`, le serveur reset après 5 secondes

## États des cellules (visibleGrid)

| Valeur | Signification |
|--------|---------------|
| -1 | Caché |
| 0 | Révélé, vide |
| 1-8 | Révélé, nombre de mines adjacentes |
| 9 | Explosion (utilisé côté client pour l'animation) |
| 10 | Bombe révélée (joueur éliminé) |

## Bugs Résolus ✅

1. **Double envoi d'événements** - Listeners initialisés une seule fois
2. **Race condition reset** - Flag `resetPending` + vérification d'état
3. **Hôte éliminé = fin de partie** - L'hôte éliminé ne reset plus le serveur
4. **Victoire auto du dernier joueur** - Supprimé, le joueur doit gagner en complétant la grille

## Nouveaux Événements Socket.io

| Événement | Direction | Payload | Description |
|-----------|-----------|---------|-------------|
| `playerEliminated` | Server→Client | `{ playerId, playerName, playerNumber, bombX, bombY, remainingPlayers }` | Un joueur a cliqué sur une bombe |
| `gameUpdate` (type: revealedBomb) | Server→Client | `{ result: { type: 'revealedBomb', x, y } }` | Bombe révélée suite à élimination |

## Prochaines Étapes

1. [ ] Test complet du flux multi-joueurs (>2 joueurs)
2. [ ] UI de score/classement en temps réel
3. [ ] Mode spectateur pour joueurs éliminés (optionnel)
4. [ ] Animation de particules pour l'élimination

## Notes

- Le mode coopératif original a été transformé en mode **compétitif** avec élimination
- Le visuel de bombe révélée est créé dynamiquement via Canvas (pas d'image externe)
- L'animation d'explosion du joueur éliminé dure 3 secondes avant retour au menu
