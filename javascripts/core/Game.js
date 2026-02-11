/**
 * Client-side MinesweeperGame.
 *
 * Extends shared GameBase with browser-specific behaviour:
 * - i18n-aware generation warning notifications via HUD toast
 */

import { MinesweeperGameBase } from '../../shared/GameBase.js';

// ─── Lazy i18n (browser only) ───────────────────────────────────────────────

let _t = null;
if (typeof window !== 'undefined') {
    import('../i18n.js').then(m => { _t = m.t; }).catch(() => { });
}

// ─── Client Game Class ──────────────────────────────────────────────────────

export class MinesweeperGame extends MinesweeperGameBase {

    /**
     * Show a translated toast notification when board generation
     * was cancelled or hit the max-attempt limit.
     *
     * @override
     * @param {{cancelled?: boolean, warning?: boolean}} result
     */
    _onGenerationWarning(result) {
        const reason = result.cancelled
            ? (_t ? _t('hud.notifGenCancelled') : 'interrompue')
            : (_t ? _t('hud.notifGenLimited', { max: 10000 }) : 'limitée à 10000 essais');

        const msg = _t
            ? _t('hud.notifGenWarning', { reason })
            : `Note : La génération a été ${reason}. La grille n'est pas garantie 100% logique.`;

        // Toast via HUD controller
        if (typeof window !== 'undefined' && window._gameController?.uiManager?.hudController) {
            window._gameController.uiManager.hudController.showNotification(msg, 'warning');
        }

        console.log(`[Game] Board generation: ${reason}`);
    }
}
