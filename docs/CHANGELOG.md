# 📝 Changelog

## v3.5 — March 02, 2026

### 🚀 Massive Architecture Update: TypeScript & Vite

The entire frontend and backend codebase has been successfully migrated to **TypeScript**!

**Key Changes:**
- **Static Typing**: All `javascripts/`, `shared/`, and `server-multiplayer/` components are now strictly typed via TS, replacing JSDoc comments.
- **Vite Bundler**: Migrated from plain browser ES Modules to a modern Vite build pipeline (`npm run dev` / `npm run build`), significantly improving load speeds through aggressive tree-shaking and module bundling (esbuild).
- **Architecture**: The previous Technical Debt regarding TypeScript adoption in `ARCHITECTURE.md` has been resolved.

## v3.4 — Feb 12, 2026

### ✨ New: Explain Hint Feature

Added a new **Explain Hint** mode that shows players *why* a suggested move is safe, available exclusively in **No-Guess mode**.

**How it works:**
- A new **"🔍 EXPLIQUER / EXPLAIN"** button appears next to the hint button in No-Guess mode
- Clicking it runs the solver on the visible game state, finds a safe cell, and displays a strategy-specific explanation:
  - **Basic Counting**: Cell has all mines flagged → remaining neighbors are safe
  - **Basic Deduced**: Solver internally deduced mine locations → cell is safe
  - **Subset Logic**: Comparing constraints between two cells → cell is determined safe
  - **Gaussian Elimination**: Constraint equation system solved → cell is safe
  - **Proof by Contradiction**: Assuming cell is mine leads to impossibility → must be safe
  - **Exhaustive Analysis (Tank)**: Cell is safe in every valid mine configuration
  - **Global Mine Count**: All mines already identified → remaining cells are safe
  - **God Mode Fallback**: Cell is safe (no logical deduction from visible state)
- Constraint cells are highlighted **blue**, the safe cell stays **green**
- Game actions (clicks, flags) are frozen during the explanation; camera controls remain active
- A glassmorphism panel on the left shows the explanation text with an **OK** button to dismiss

**Files changed:**
- `shared/MinesweeperSolver.js` — `getHintWithExplanation()` method (all 6 strategies + godMode fallback)
- `shared/SolverBridge.js` — Pass-through for `getHintWithExplanation()`
- `shared/GameBase.js` — `hintMode` flag + `getHintWithExplanation()` wrapper
- `javascripts/core/EventBus.js` — `REQUEST_HINT_EXPLAIN` / `HINT_EXPLAIN_DISMISS` events
- `javascripts/core/GameController.js` — Event handlers + `_buildExplanation()` + button visibility
- `javascripts/ui/HUDController.js` — Explain button + overlay panel
- `javascripts/rendering/GridManager.js` — `highlightConstraints()` / `clearConstraintHighlights()`
- `javascripts/rendering/Renderer.js` — Pass-through methods
- `javascripts/rendering/InputManager.js` — `hintMode` guards
- `javascripts/i18n.js` — FR/EN translation strings (11 keys each)
- `index.html` — `#hint-explain-btn` button
- `css/style.css` — Overlay + panel styles

### 🐛 Fixes
- Fixed strategy numbering in `isSolvable()`: Tank Solver was mislabeled as "Strategy 4" (duplicate), now correctly "Strategy 5". Global Mine Counting renumbered to "Strategy 6".
