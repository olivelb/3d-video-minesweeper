# Système d'Analyse de Sensibilité aux Médias

## Document Technique - Version 1.1

**Objectif** : Ce document décrit le fonctionnement technique complet du système d'analyse comportementale intégré au Démineur 3D. L'objectif est de détecter si un joueur est affecté émotionnellement ou cognitivement par une image ou vidéo qu'il a uploadée, en comparant ses performances avec et sans ce média.

**Date de publication** : Février 2026  
**Auteur** : Équipe Démineur 3D

---

## Table des Matières

1. [Collecte des Données](#1-collecte-des-données)
2. [Métriques de Timing des Clics](#2-métriques-de-timing-des-clics)
3. [Structure des Données](#3-structure-des-données)
4. [Calculs Statistiques](#4-calculs-statistiques)
5. [Algorithme de Détection de Sensibilité](#5-algorithme-de-détection-de-sensibilité)
6. [Comparaison Préréglages vs Uploads](#6-comparaison-préréglages-vs-uploads)
7. [Visualisations](#7-visualisations)
8. [Flux de Données Complet](#8-flux-de-données-complet)
9. [Exemple Pratique Annoté](#9-exemple-pratique-annoté)
10. [Limitations et Biais Potentiels](#10-limitations-et-biais-potentiels)
11. [Anonymisation et Confidentialité](#11-anonymisation-et-confidentialité)
12. [Fichiers Source et Export](#12-fichiers-source-et-export)

---

## 1. Collecte des Données

### 1.1 Événements de Jeu

Chaque partie génère des événements stockés dans `localStorage` sous la clé `minesweeper3d_analytics`.

| Type | Déclencheur | Données capturées |
|------|-------------|-------------------|
| `start` | Clic sur "JOUER" | background, difficulty, bombs, date |
| `win` | Toutes les cases non-minées révélées | background, difficulty, bombs, time, **clickData**, date |
| `loss` | Clic sur une mine | background, difficulty, bombs, time, **clickData**, date |

> **Note importante** : Les analyses comportementales fonctionnent pour **les victoires ET les défaites**. Toutes les métriques de timing sont collectées indépendamment du résultat de la partie.

### 1.2 Classification des Médias

Le champ `background` identifie le fond d'écran utilisé :

```
Préréglage : "Orage", "Marbre", "Néon", etc.
Upload :     "Custom: monimage.jpg", "Custom: mavideo.mp4"
Webcam :     "Webcam"
```

**Fonction de classification** (`analytics.html`) :
```javascript
function isCustomUpload(bg) {
    if (!bg) return false;
    return bg.startsWith('Custom:') || bg === 'Webcam';
}
```

Cette fonction détermine si un fond est un **upload personnalisé** (potentiellement émotionnel) ou un **préréglage neutre** (référence de baseline).

---

## 2. Métriques de Timing des Clics

### 2.1 Collecte en Temps Réel

À chaque action du joueur (révéler une case ou poser un drapeau), le système capture le timing :

```javascript
// Renderer.js - handleGameUpdate()
const now = Date.now();
if (this.lastClickTime > 0) {
    const delta = now - this.lastClickTime;
    this.clickTimestamps.push({
        time: now,           // Timestamp absolu (ms depuis epoch)
        delta: delta,        // Intervalle depuis le dernier clic (ms)
        type: result.type    // 'reveal', 'flag', 'win', 'explode'
    });
}
this.lastClickTime = now;
```

### 2.2 Calcul des Métriques Agrégées

À la fin de chaque partie, `getClickAnalytics()` produit un résumé :

```javascript
// Renderer.js - getClickAnalytics()
getClickAnalytics() {
    if (this.clickTimestamps.length === 0) {
        return { avgDecisionTime: 0, maxPause: 0, clickCount: 0, hesitations: 0 };
    }
    
    const deltas = this.clickTimestamps.map(c => c.delta);
    const avgDecisionTime = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
    const maxPause = Math.max(...deltas);
    const hesitations = deltas.filter(d => d > 5000).length;
    
    return {
        avgDecisionTime: avgDecisionTime,
        maxPause: maxPause,
        clickCount: this.clickTimestamps.length,
        hesitations: hesitations
    };
}
```

### 2.3 Définition des Métriques

| Métrique | Symbole | Formule | Unité | Interprétation |
|----------|---------|---------|-------|----------------|
| **Temps de décision moyen** | `avgDecisionTime` | Σ(Δtᵢ) / n | ms | Vitesse moyenne de réaction |
| **Pause maximale** | `maxPause` | max(Δtᵢ) | ms | Plus longue hésitation |
| **Nombre de clics** | `clickCount` | n | count | Volume d'actions |
| **Hésitations** | `hesitations` | count(Δtᵢ > 5000) | count | Pauses > 5 secondes |

> **Définition formelle** : Soit Δtᵢ = tᵢ - tᵢ₋₁ l'intervalle entre le clic i et le clic précédent.

---

## 3. Structure des Données

### 3.1 Format d'un Événement Complet

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

### 3.2 Contraintes de Stockage

- **Maximum** : 200 événements (FIFO - les plus anciens sont supprimés)
- **Emplacement** : `localStorage` du navigateur uniquement
- **Persistance** : Survit à la fermeture du navigateur, mais pas au vidage du cache

---

## 4. Calculs Statistiques

### 4.1 Calcul du Baseline (Groupe Contrôle)

Le **baseline** représente la performance "normale" du joueur, calculée **uniquement** à partir des parties jouées avec des préréglages (fonds neutres).

```javascript
// analytics.html - renderSensitivityAnalysis()
const events = getAnalytics().filter(e => e.type !== 'start');
const presetEvents = events.filter(e => !isCustomUpload(e.background));

// ═══════════════════════════════════════════════════════════════════
// BASELINE TAUX DE VICTOIRE
// ═══════════════════════════════════════════════════════════════════
const presetWins = presetEvents.filter(e => e.type === 'win').length;
const presetTotal = presetEvents.length;

const baselineWinRate = presetTotal > 0 
    ? (presetWins / presetTotal) * 100 
    : 50;  // Valeur par défaut si aucune donnée

// ═══════════════════════════════════════════════════════════════════
// BASELINE TEMPS DE DÉCISION
// ═══════════════════════════════════════════════════════════════════
const presetWithClickData = presetEvents.filter(e => e.clickData);
const totalDecisionTime = presetWithClickData.reduce(
    (sum, e) => sum + (e.clickData.avgDecisionTime || 0), 
    0
);

const baselineDecisionTime = presetWithClickData.length > 0
    ? totalDecisionTime / presetWithClickData.length
    : 0;
```

**Formules mathématiques :**

$$\text{baselineWinRate} = \frac{\text{count}(type = \text{'win'} \mid \neg\text{isCustom})}{\text{count}(\neg\text{isCustom})} \times 100$$

$$\text{baselineDecisionTime} = \frac{\sum_{i \in \text{preset}} \text{avgDecisionTime}_i}{\text{count}(\text{preset with clickData})}$$

### 4.2 Calcul des Métriques par Upload

Pour chaque fichier uploadé distinct, on calcule ses métriques spécifiques :

```javascript
customUploads.forEach(upload => {
    const uploadEvents = events.filter(e => e.background === upload);
    
    // ═══════════════════════════════════════════════════════════════
    // TAUX DE VICTOIRE POUR CET UPLOAD
    // ═══════════════════════════════════════════════════════════════
    const wins = uploadEvents.filter(e => e.type === 'win').length;
    const total = uploadEvents.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    
    // ═══════════════════════════════════════════════════════════════
    // TEMPS DE DÉCISION MOYEN POUR CET UPLOAD
    // ═══════════════════════════════════════════════════════════════
    const uploadWithClickData = uploadEvents.filter(e => e.clickData);
    const avgDecision = uploadWithClickData.length > 0
        ? uploadWithClickData.reduce((s, e) => s + (e.clickData.avgDecisionTime || 0), 0)
          / uploadWithClickData.length
        : 0;
    
    // ═══════════════════════════════════════════════════════════════
    // MÉTRIQUES COMPORTEMENTALES AGRÉGÉES
    // ═══════════════════════════════════════════════════════════════
    const totalHesitations = uploadWithClickData.reduce(
        (s, e) => s + (e.clickData.hesitations || 0), 0
    );
    
    const maxPause = uploadWithClickData.length > 0
        ? Math.max(...uploadWithClickData.map(e => e.clickData.maxPause || 0))
        : 0;
});
```

### 4.3 Calcul des Écarts

Les écarts mesurent la déviation par rapport au baseline :

```javascript
// ═══════════════════════════════════════════════════════════════════
// ÉCART DE TAUX DE VICTOIRE (en points de pourcentage)
// ═══════════════════════════════════════════════════════════════════
const winRateDiff = baselineWinRate - winRate;
// Exemple: 70% (baseline) - 40% (upload) = 30 points d'écart

// ═══════════════════════════════════════════════════════════════════
// ÉCART DE TEMPS DE DÉCISION (en pourcentage relatif)
// ═══════════════════════════════════════════════════════════════════
const decisionDiff = ((avgDecision - baselineDecisionTime) / baselineDecisionTime) * 100;
// Exemple: (3000ms - 2000ms) / 2000ms × 100 = +50% plus lent
```

**Formules mathématiques :**

$$\text{winRateDiff} = \text{baselineWinRate} - \text{uploadWinRate}$$

$$\text{decisionDiff} = \frac{\text{uploadDecisionTime} - \text{baselineDecisionTime}}{\text{baselineDecisionTime}} \times 100$$

> ⚠️ **Note** : `decisionDiff` est une **variation relative** (pourcentage de changement), tandis que `winRateDiff` est une **différence absolue** (points de pourcentage). Cette distinction est importante pour l'interprétation.

---

## 5. Algorithme de Détection de Sensibilité

### 5.1 Classification par Seuils

L'algorithme utilise une logique de seuils multiples avec opérateur **OU** :

```javascript
let severityClass = '';
let severityLabel = '';

if (winRateDiff > 30 || decisionDiff > 50) {
    severityClass = 'danger';
    severityLabel = t('an.sensitivityHigh');   // 🚨 Sensibilité Élevée / High Sensitivity
} else if (winRateDiff > 15 || decisionDiff > 25) {
    severityClass = 'warning';
    severityLabel = t('an.sensitivityMedium'); // ⚠️ Sensibilité Modérée / Moderate Sensitivity
} else {
    severityLabel = t('an.sensitivityNormal'); // ✅ Normal
}
```

### 5.2 Tableau des Seuils

| Niveau | Condition (OU logique) | Signification |
|--------|------------------------|---------------|
| 🚨 **Sensibilité Élevée** | `winRateDiff > 30` OU `decisionDiff > 50` | Impact émotionnel majeur détecté |
| ⚠️ **Sensibilité Modérée** | `winRateDiff > 15` OU `decisionDiff > 25` | Distraction notable |
| ✅ **Normal** | `winRateDiff ≤ 15` ET `decisionDiff ≤ 25` | Pas d'anomalie |

### 5.3 Indicateurs Comportementaux Secondaires

Des badges supplémentaires sont affichés selon des critères spécifiques :

| Indicateur | Condition | Badge | Calcul |
|------------|-----------|-------|--------|
| Hésitation fréquente | `totalHesitations > 5` | ⚠️ | Somme des pauses >5s sur toutes les parties avec cet upload |
| Distraction majeure | `maxPause > 30000` | 🚨 | Plus longue pause jamais observée avec cet upload |
| Attachement possible | `total > 10` | ⚠️ | Nombre de parties jouées avec cet upload malgré les difficultés |

```javascript
// Badges conditionnels dans l'affichage (utilise t() pour l'i18n)
${totalHesitations > 5 ? `<span class="anomaly-badge medium">${t('an.frequentHesitation')}</span>` : ''}
${maxPause > 30000 ? `<span class="anomaly-badge high">${t('an.majorDistraction')}</span>` : ''}
${total > 10 ? `<span class="anomaly-badge medium">${t('an.possibleAttachment')}</span>` : ''}
```

---

## 6. Comparaison Préréglages vs Uploads

### 6.1 Tableau Comparatif Global

Le système génère un tableau comparant l'ensemble des parties "préréglages" vs "uploads" :

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

### 6.2 Règles de Détection pour le Tableau

```javascript
// ═══════════════════════════════════════════════════════════════════
// RÈGLE 1 : Écart significatif de taux de victoire
// ═══════════════════════════════════════════════════════════════════
if (customWinRate < presetWinRate - 15) {
    label = t('an.gapSignificant'); // ⚠️ Écart significatif / Significant gap
}
// Déclencheur: L'upload fait baisser le taux de >15 points

// ═══════════════════════════════════════════════════════════════════
// RÈGLE 2 : Hésitation détectée
// ═══════════════════════════════════════════════════════════════════
if (customAvgTime > presetAvgTime * 1.3) {
    label = t('an.hesitationDetected'); // ⚠️ Hésitation détectée / Hesitation detected
}
// Déclencheur: Plus de 30% plus lent avec les uploads

// ═══════════════════════════════════════════════════════════════════
// RÈGLE 3 : Distraction possible
// ═══════════════════════════════════════════════════════════════════
if (customHesitations > presetHesitations * 2) {
    label = t('an.distractionPossible'); // ⚠️ Distraction possible / Possible distraction
}
// Déclencheur: 2× plus de pauses longues avec les uploads
```

---

## 7. Visualisations

### 7.1 Graphique Taux de Victoire par Fond

- **Type** : Barres verticales
- **Axe X** : Noms des fonds (préréglages + uploads)
- **Axe Y** : Taux de victoire (0-100%)
- **Couleurs** : Bleu pour préréglages, Rose pour uploads personnalisés

### 7.2 Graphique Temps de Décision par Fond

- **Type** : Barres verticales
- **Axe X** : Noms des fonds
- **Axe Y** : Temps moyen en secondes
- **Interprétation** : Des barres plus hautes indiquent plus d'hésitation

### 7.3 Graphique Hésitations par Fond

- **Type** : Barres verticales
- **Couleurs** : Vert pour préréglages, Rouge pour uploads
- **Données** : Total cumulé des pauses >5s par fond

### 7.4 Répartition des Uploads (Doughnut)

- **Type** : Graphique circulaire
- **Données** : Nombre de parties par upload personnalisé
- **Objectif** : Identifier l'attachement à certains fichiers

---

## 8. Flux de Données Complet

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FLUX DE COLLECTE                                    │
└─────────────────────────────────────────────────────────────────────────────────┘

    [Joueur clique "JOUER"]
            │
            ▼
    ┌───────────────────┐
    │ UIManager.js      │
    │ handleStart()     │──────► trackGameEvent({ type: 'start', background, ... })
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
    │ triggerExplosion()│──────► trackGameEvent({ type: 'win'/'loss', clickData })
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
    │ isCustomUpload()  │──────► Sépare préréglages vs uploads
    └───────────────────┘
            │
            ├─────────────────────────────────────┐
            ▼                                     ▼
    ┌───────────────────┐             ┌───────────────────┐
    │ Préréglages       │             │ Uploads Custom    │
    │ (baseline)        │             │                   │
    │                   │             │                   │
    │ • winRate         │◄── Compare ─┤ • winRate         │
    │ • avgDecision     │             │ • avgDecision     │
    │ • hesitations     │             │ • hesitations     │
    └───────────────────┘             └───────────────────┘
            │                                     │
            └─────────────────┬───────────────────┘
                              ▼
                  ┌───────────────────┐
                  │ Calcul des écarts │
                  │ • winRateDiff     │
                  │ • decisionDiff    │
                  └───────────────────┘
                              │
                              ▼
                  ┌───────────────────┐
                  │ Classification    │
                  │ 🚨 / ⚠️ / ✅       │
                  └───────────────────┘
                              │
                              ▼
                  ┌───────────────────┐
                  │ Rendu visuel      │
                  │ analytics.html    │
                  └───────────────────┘
```

---

## 9. Exemple Pratique Annoté

### Scénario

Un joueur effectue 30 parties au total :
- 20 parties avec le préréglage "Marbre"
- 10 parties avec une photo personnelle uploadée

### Données Brutes

**Préréglage "Marbre" (20 parties) :**
- Victoires : 14 (70%)
- Temps de décision moyen : 1500 ms
- Hésitations totales : 2

**Upload "Custom: photo.jpg" (10 parties) :**
- Victoires : 3 (30%)
- Temps de décision moyen : 3200 ms
- Hésitations totales : 7

### Calculs Pas à Pas

```
═══════════════════════════════════════════════════════════════════════
ÉTAPE 1 : Calcul du Baseline
═══════════════════════════════════════════════════════════════════════

baselineWinRate = 14 / 20 × 100 = 70%
baselineDecisionTime = 1500 ms

═══════════════════════════════════════════════════════════════════════
ÉTAPE 2 : Calcul des Métriques Upload
═══════════════════════════════════════════════════════════════════════

uploadWinRate = 3 / 10 × 100 = 30%
uploadDecisionTime = 3200 ms

═══════════════════════════════════════════════════════════════════════
ÉTAPE 3 : Calcul des Écarts
═══════════════════════════════════════════════════════════════════════

winRateDiff = 70 - 30 = 40 points
              ↳ > 30 → 🚨 SEUIL ÉLEVÉ ATTEINT

decisionDiff = (3200 - 1500) / 1500 × 100 = 113%
               ↳ > 50% → 🚨 SEUIL ÉLEVÉ ATTEINT

═══════════════════════════════════════════════════════════════════════
ÉTAPE 4 : Classification
═══════════════════════════════════════════════════════════════════════

Condition: winRateDiff > 30 OU decisionDiff > 50
           40 > 30 ✓        113 > 50 ✓

Résultat: 🚨 Sensibilité Élevée
```

### Interprétation

Le joueur présente des signes clairs de distraction ou d'impact émotionnel :

| Indicateur | Valeur | Interprétation |
|------------|--------|----------------|
| Performance | -40 points | Bien en dessous du niveau habituel |
| Réactivité | +113% temps | Temps de réflexion plus que doublé |
| Hésitations | 7 vs 2 (3.5×) | Beaucoup plus de pauses longues |

---

## 10. Limitations et Biais Potentiels

### 10.1 Limitations Techniques

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| **Données locales uniquement** | Pas de comparaison entre joueurs | Chaque joueur est son propre contrôle |
| **Pas de tracking intra-partie** | Seul le résumé est stocké | Suffisant pour l'analyse macro |
| **Maximum 200 événements** | Historique limité | Les données récentes sont plus pertinentes |

### 10.2 Biais Méthodologiques

⚠️ **Ces biais doivent être considérés lors de l'interprétation :**

| Biais | Description | Impact sur les résultats |
|-------|-------------|-------------------------|
| **Biais de sélection** | Les joueurs choisissent quand uploader | Les uploads peuvent coïncider avec des états émotionnels |
| **Effet de nouveauté** | Un nouveau fond peut distraire temporairement | Faux positifs possibles au début |
| **Biais de difficulté** | Les parties ne sont pas de même difficulté | Comparer des grilles 8×8 et 30×16 est problématique |
| **Fatigue du joueur** | Performance variable selon l'heure | Non contrôlé actuellement |
| **Baseline insuffisant** | Peu de parties préréglées = baseline instable | Besoin minimum : ~10+ parties préréglées |

### 10.3 Ce Que le Système NE Détecte PAS

- ❌ Le **contenu** de l'image (pas d'analyse visuelle)
- ❌ L'**intention** du joueur (curiosité vs attachement)
- ❌ Les **causes externes** (interruptions, multitâche)
- ❌ La **significativité statistique** (pas de tests p-value)

### 10.4 Recommandations pour Améliorer la Validité

1. **Baseline minimum** : Attendre au moins 10 parties préréglées avant d'interpréter
2. **Consistance** : Comparer des parties de difficulté similaire
3. **Répétition** : Un résultat isolé n'est pas significatif
4. **Contexte** : Considérer les facteurs externes

---

## 11. Anonymisation et Confidentialité

### 11.1 Identification Anonyme

Chaque joueur reçoit un identifiant unique généré aléatoirement :

```javascript
// ScoreManager.js
id = 'p_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
// Exemple: "p_abc123xyz1j8qz5"
```

### 11.2 Pseudonymes Automatiques

Un "codename" lisible est généré à partir du hash de l'ID :

```javascript
// Combinaison déterministe : adjectif + nom + numéro
// Exemples: "Neon Tiger #742", "Cyber Fox #218", "Shadow Wizard #901"
```

### 11.3 Données Collectées vs Non Collectées

| ✅ Collecté | ❌ Non Collecté |
|------------|-----------------|
| Timestamps des clics | Nom réel |
| Temps de décision | Adresse email |
| Résultat de partie | Adresse IP |
| Nom du fichier uploadé | Contenu du fichier |
| Métriques de performance | Données de navigation |

### 11.4 Stockage Local Uniquement

- **Aucune transmission réseau** : Toutes les données restent dans `localStorage`
- **Aucun serveur externe** : Pas de backend, pas d'API
- **Contrôle utilisateur** : Bouton "Effacer les données" disponible
- **Portée limitée** : Données accessibles uniquement sur le même navigateur

### 11.5 Conformité RGPD

Le système respecte les principes de minimisation des données :
- Pas de données personnelles identifiables
- Consentement implicite (données purement locales)
- Droit à l'effacement via interface dédiée

---

## 12. Fichiers Source et Export

### 12.1 Fichiers du Système

| Fichier | Rôle |
|---------|------|
| `Renderer.js` | Collecte des timestamps, calcul de `clickData` |
| `ScoreManager.js` | Stockage des événements, génération des IDs |
| `UIManager.js` | Extraction du nom du background |
| `i18n.js` | Traductions FR/EN des labels analytiques (~65 clés `an.*`) |
| `analytics.html` | Chargement, calculs, visualisation (ES module, importe i18n.js) |

### 12.2 Export CSV

Le bouton "Exporter CSV" génère un fichier avec les colonnes :

```csv
date,type,background,isCustomUpload,difficulty,bombs,time,avgDecisionTime,hesitations,maxPause,playerId,codename
```

Ce fichier peut être analysé dans Excel, Python (pandas), R, ou tout autre outil statistique.

---

## Annexe : Résumé des Formules

| Métrique | Formule |
|----------|---------|
| Taux de victoire | `wins / total × 100` |
| Temps de décision moyen | `Σ(avgDecisionTime) / n` |
| Écart taux de victoire | `baselineWinRate - uploadWinRate` |
| Écart temps (%) | `(upload - baseline) / baseline × 100` |
| Seuil Élevé | `winRateDiff > 30 OR decisionDiff > 50` |
| Seuil Modéré | `winRateDiff > 15 OR decisionDiff > 25` |

---

## Note : Internationalisation (v1.1)

Depuis février 2026, `analytics.html` est entièrement internationalisée :

- Le `<script>` est désormais un **module ES** (`<script type="module">`) qui importe `t()`, `translateDOM()`, `setLang()`, `getLang()`, `getLocale()` depuis `javascripts/i18n.js`.
- Tous les labels visibles utilisent `t('an.*')` au lieu de chaînes hardcodées.
- Les dates dans l'historique utilisent `getLocale()` (retourne `'fr-FR'` ou `'en-US'`) au lieu de `'fr-FR'` hardcodé.
- Un bouton **FR / EN** est intégré dans le header de la page.
- Au changement de langue, tous les graphiques (Chart.js) et les tables HTML sont entièrement re-rendus via un listener sur l'événement `langchange`.
- Les ~65 clés de traduction sont préfixées `an.*` dans le dictionnaire i18n.

---

*Document mis à jour le 9 février 2026*
