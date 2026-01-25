# Système d'Analyse de Sensibilité aux Médias

## Vue d'Ensemble

Ce document décrit le fonctionnement technique du système d'analyse comportementale intégré au Démineur 3D. L'objectif est de détecter si un joueur est affecté émotionnellement ou cognitivement par une image ou vidéo qu'il a uploadée.

---

## 1. Collecte des Données

### 1.1 Événements de Jeu

Chaque partie génère des événements stockés dans `localStorage` sous la clé `minesweeper3d_analytics`.

**Événements enregistrés :**

| Type | Déclencheur | Données capturées |
|------|-------------|-------------------|
| `start` | Clic sur "JOUER" | background, difficulty, bombs, date |
| `win` | Partie gagnée | background, difficulty, bombs, time, clickData, date |
| `loss` | Clic sur une mine | background, difficulty, bombs, time, clickData, date |

### 1.2 Identification du Média

Le champ `background` contient le nom du fond d'écran utilisé :

```
Préréglage : "Orage", "Marbre", "Néon", etc.
Upload :     "Custom: monimage.jpg", "Custom: mavideo.mp4"
Webcam :     "Webcam"
```

**Fonction de détection (analytics.html) :**
```javascript
function isCustomUpload(bg) {
    if (!bg) return false;
    return bg.startsWith('Custom:') || bg === 'Webcam';
}
```

---

## 2. Suivi du Timing des Clics

### 2.1 Collecte (Renderer.js)

À chaque action du joueur (révéler une case, poser un drapeau), le système enregistre :

```javascript
// Dans handleGameUpdate()
const now = Date.now();
if (this.lastClickTime > 0) {
    const delta = now - this.lastClickTime;
    this.clickTimestamps.push({
        time: now,           // Timestamp absolu
        delta: delta,        // Temps depuis le dernier clic (ms)
        type: result.type    // 'reveal', 'flag', 'win', 'explode'
    });
}
this.lastClickTime = now;
```

### 2.2 Calcul des Métriques (Renderer.js)

À la fin de chaque partie, `getClickAnalytics()` calcule :

```javascript
getClickAnalytics() {
    const deltas = this.clickTimestamps.map(c => c.delta);
    
    return {
        avgDecisionTime: deltas.reduce((a, b) => a + b, 0) / deltas.length,
        maxPause: Math.max(...deltas),
        clickCount: this.clickTimestamps.length,
        hesitations: deltas.filter(d => d > 5000).length  // Pauses > 5 secondes
    };
}
```

| Métrique | Formule | Unité |
|----------|---------|-------|
| `avgDecisionTime` | Σ(delta) / n | millisecondes |
| `maxPause` | max(delta) | millisecondes |
| `clickCount` | n | nombre |
| `hesitations` | count(delta > 5000) | nombre |

---

## 3. Structure des Données Stockées

### 3.1 Format d'un Événement

```json
{
    "type": "loss",
    "playerId": "p_abc123xyz456",
    "codename": "Neon Tiger #742",
    "background": "Custom: photo_personnelle.jpg",
    "difficulty": "16x16",
    "bombs": 40,
    "time": 87,
    "clickData": {
        "avgDecisionTime": 2340,
        "maxPause": 12500,
        "clickCount": 34,
        "hesitations": 3
    },
    "date": "2026-01-25T00:45:12.000Z"
}
```

### 3.2 Limites de Stockage

- Maximum 200 événements conservés (les plus anciens sont supprimés)
- Données stockées localement dans le navigateur uniquement

---

## 4. Calculs de l'Analyse de Sensibilité

### 4.1 Calcul du Baseline (Référence)

Le baseline est calculé à partir des parties jouées avec des **préréglages uniquement** :

```javascript
const presetEvents = events.filter(e => !isCustomUpload(e.background));

// Taux de victoire baseline
const baselineWinRate = (presetEvents.filter(e => e.type === 'win').length / presetEvents.length) * 100;

// Temps de décision baseline
const baselineDecisionTime = presetEvents
    .filter(e => e.clickData)
    .reduce((sum, e) => sum + e.clickData.avgDecisionTime, 0) 
    / presetEvents.filter(e => e.clickData).length;
```

### 4.2 Calcul des Écarts

Pour chaque fichier uploadé, on calcule :

```javascript
// Écart de taux de victoire
const winRateDiff = baselineWinRate - uploadWinRate;
// Exemple: 70% (baseline) - 40% (upload) = 30% d'écart

// Écart de temps de décision (en pourcentage)
const decisionDiff = ((uploadDecisionTime - baselineDecisionTime) / baselineDecisionTime) * 100;
// Exemple: (3000ms - 2000ms) / 2000ms * 100 = 50% plus lent
```

### 4.3 Seuils de Détection

| Niveau | Critères | Interprétation |
|--------|----------|----------------|
| 🚨 **Sensibilité Élevée** | winRateDiff > 30% OU decisionDiff > 50% | Impact émotionnel majeur |
| ⚠️ **Sensibilité Modérée** | winRateDiff > 15% OU decisionDiff > 25% | Distraction notable |
| ✅ **Normal** | winRateDiff ≤ 15% ET decisionDiff ≤ 25% | Pas d'anomalie détectée |

### 4.4 Indicateurs Comportementaux Supplémentaires

| Indicateur | Condition | Badge |
|------------|-----------|-------|
| Hésitation fréquente | hesitations > 5 | ⚠️ |
| Distraction majeure | maxPause > 30000ms (30s) | 🚨 |
| Attachement possible | utilisations > 10 malgré faible performance | ⚠️ |

---

## 5. Comparaison Préréglages vs Uploads

### 5.1 Tableau de Comparaison

Le système génère un tableau comparatif automatique :

```
┌──────────────────────────┬────────────────┬────────────────────────┬──────────────────┐
│ Métrique                 │ Préréglages    │ Uploads Personnalisés  │ Analyse          │
├──────────────────────────┼────────────────┼────────────────────────┼──────────────────┤
│ Parties jouées           │ 45             │ 12                     │ -                │
│ Taux de victoire         │ 67%            │ 33%                    │ ⚠️ Écart signif. │
│ Temps de décision moyen  │ 1.8s           │ 3.2s                   │ ⚠️ Hésitation    │
│ Pauses longues (>5s)     │ 4              │ 11                     │ ⚠️ Distraction   │
└──────────────────────────┴────────────────┴────────────────────────┴──────────────────┘
```

### 5.2 Règles de Détection

```javascript
// Écart significatif de taux de victoire
if (customWinRate < presetWinRate - 15) {
    label = '⚠️ Écart significatif';
}

// Hésitation détectée
if (customAvgTime > presetAvgTime * 1.3) {  // 30% plus lent
    label = '⚠️ Hésitation détectée';
}

// Distraction possible
if (customHesitations > presetHesitations * 2) {  // 2x plus de pauses
    label = '⚠️ Distraction possible';
}
```

---

## 6. Flux de Données Complet

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FLUX DE COLLECTE                                    │
└─────────────────────────────────────────────────────────────────────────────────┘

    [Joueur clique "JOUER"]
            │
            ▼
    ┌───────────────────┐
    │ UIManager.js      │
    │ handleStart()     │──────► trackGameEvent({ type: 'start', background: 'Custom: photo.jpg', ... })
    └───────────────────┘
            │
            ▼
    ┌───────────────────┐
    │ Renderer.js       │
    │ Partie en cours   │
    │                   │
    │ handleGameUpdate()│──────► clickTimestamps.push({ time, delta, type })
    │      ↓            │        (à chaque clic)
    │      ↓            │
    │ triggerWin() ou   │
    │ triggerExplosion()│──────► trackGameEvent({ type: 'win'/'loss', clickData: getClickAnalytics(), ... })
    └───────────────────┘
            │
            ▼
    ┌───────────────────┐
    │ ScoreManager.js   │
    │ trackGameEvent()  │──────► localStorage.setItem('minesweeper3d_analytics', ...)
    └───────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FLUX D'ANALYSE                                      │
└─────────────────────────────────────────────────────────────────────────────────┘

    [Utilisateur ouvre analytics.html]
            │
            ▼
    ┌───────────────────┐
    │ getAnalytics()    │──────► Charge les données de localStorage
    └───────────────────┘
            │
            ▼
    ┌───────────────────┐
    │ isCustomUpload()  │──────► Filtre les entrées "Custom:*" et "Webcam"
    └───────────────────┘
            │
            ├──────────────────────────────────────────────┐
            ▼                                              ▼
    ┌───────────────────┐                      ┌───────────────────┐
    │ Préréglages       │                      │ Uploads Custom    │
    │ (baseline)        │                      │                   │
    │                   │                      │                   │
    │ • winRate         │◄─── Comparaison ───► │ • winRate         │
    │ • avgDecision     │                      │ • avgDecision     │
    │ • hesitations     │                      │ • hesitations     │
    └───────────────────┘                      └───────────────────┘
            │                                              │
            └──────────────────┬───────────────────────────┘
                               ▼
                    ┌───────────────────┐
                    │ Calcul des écarts │
                    │ winRateDiff       │
                    │ decisionDiff      │
                    └───────────────────┘
                               │
                               ▼
                    ┌───────────────────┐
                    │ Classification    │
                    │ 🚨 / ⚠️ / ✅      │
                    └───────────────────┘
                               │
                               ▼
                    ┌───────────────────┐
                    │ Affichage         │
                    │ analytics.html    │
                    └───────────────────┘
```

---

## 7. Exemple Pratique

### Scénario

1. Un joueur joue 20 parties avec le préréglage "Marbre" → Gagne 14 (70%)
2. Il uploade une photo personnelle et joue 10 parties → Gagne 3 (30%)

### Calculs

```
Baseline (Marbre) :
  - Taux de victoire: 70%
  - Temps de décision moyen: 1500ms
  - Hésitations: 2

Upload (photo perso) :
  - Taux de victoire: 30%
  - Temps de décision moyen: 3200ms
  - Hésitations: 7

Écarts :
  - winRateDiff = 70 - 30 = 40% → > 30% → 🚨 ÉLEVÉ
  - decisionDiff = (3200 - 1500) / 1500 * 100 = 113% → > 50% → 🚨 ÉLEVÉ

Résultat : 🚨 Sensibilité Élevée
```

### Interprétation

Le joueur présente des signes clairs de distraction ou d'impact émotionnel lié à cette image :
- Performance 40% en dessous de son niveau habituel
- Temps de réflexion plus que doublé
- 3.5x plus d'hésitations longues

---

## 8. Limitations Connues

1. **Données locales uniquement** : Pas de comparaison entre joueurs
2. **Pas de tracking durant le jeu** : Seul le résumé est stocké, pas la trace complète
3. **Baseline minimum requis** : Besoin d'au moins 5 parties sur préréglages pour un baseline fiable
4. **Pas de détection de contenu** : L'analyse porte sur le comportement, pas sur l'image elle-même

---

## 9. Fichiers Impliqués

| Fichier | Rôle |
|---------|------|
| `Renderer.js` | Collecte des timestamps de clics, calcul des métriques |
| `ScoreManager.js` | Stockage des événements, génération du playerId |
| `UIManager.js` | Extraction du nom du background, déclenchement des événements |
| `analytics.html` | Chargement, calculs statistiques, visualisation |

---

## 10. Export des Données

Le bouton "Exporter CSV" génère un fichier avec les colonnes :

```csv
date,type,background,isCustomUpload,difficulty,bombs,time,avgDecisionTime,hesitations,maxPause,playerId,codename
```

Ce fichier peut être analysé dans Excel, Python (pandas), R, ou tout autre outil statistique pour des analyses plus poussées.
