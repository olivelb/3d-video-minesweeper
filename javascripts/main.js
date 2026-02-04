/**
 * Main Application Entry Point
 * Handles game initialization, UI coordination, and multiplayer networking
 */

import { MinesweeperGame } from './core/Game.js';
import { MinesweeperRenderer } from './rendering/Renderer.js';
import { ScoreManager } from './managers/ScoreManager.js';
import { UIManager } from './ui/UIManager.js';
import { Scoreboard } from './ui/Scoreboard.js';
import { networkManager } from './network/NetworkManager.js';

// Global state
let game = null;
let renderer = null;
const scoreManager = new ScoreManager();
let uiManager = null;
let scoreboard = null;

/**
 * Initialize the application
 */
function init() {
    uiManager = new UIManager(null, null, scoreManager);
    window._minesweeperUIManager = uiManager;

    // Initialize scoreboard for multiplayer
    scoreboard = new Scoreboard();

    setupNetworkCallbacks();

    uiManager.onStartGame = (width, height, bombs, useHoverHelper, noGuessMode, bgName, replayMines, initialState) => {
        startGame(width, height, bombs, useHoverHelper, noGuessMode, bgName, replayMines, initialState);
    };

    setupTimerAndScoreUpdates();
}

/**
 * Start a new game session
 */
async function startGame(width, height, bombs, useHoverHelper, noGuessMode, bgName, replayMines = null, initialState = null) {
    if (renderer) {
        renderer.dispose();
        renderer = null;
    }

    game = new MinesweeperGame(width, height, bombs);
    game.noGuessMode = noGuessMode;
    game.init();

    if (replayMines) {
        game.setMinesFromPositions(replayMines);
    }

    const videoElement = document.getElementById('image');
    if (videoElement && videoElement.src) {
        if (uiManager) {
            videoElement.muted = uiManager.isMuted;
        }
        videoElement.play().catch(() => { });
    }

    renderer = new MinesweeperRenderer(game, 'container', scoreManager, useHoverHelper, bgName);

    // Wait for renderer to fully initialize before applying state sync
    // This ensures gridMesh and other resources are ready
    await new Promise(resolve => {
        const checkReady = () => {
            if (renderer && renderer.gridMesh) {
                resolve();
            } else {
                setTimeout(checkReady, 50);
            }
        };
        checkReady();
    });

    // If we have an initial state (multiplayer join), apply it immediately
    if (initialState) {
        applyStateSync(initialState);
        
        // Show scoreboard in multiplayer mode
        if (scoreboard && initialState.scores) {
            scoreboard.updateScores(initialState.scores);
            scoreboard.show();
        }
    }

    setupGameControls();
    setupRendererCallbacks();
}

/**
 * Setup game control buttons (hint, retry)
 */
function setupGameControls() {
    const hintBtn = document.getElementById('hint-btn');
    hintBtn.style.display = 'inline-flex';
    hintBtn.onclick = () => {
        const hint = game.getHint();
        if (hint) {
            renderer.showHint(hint.x, hint.y, hint.type);
        } else {
            hintBtn.classList.add('no-hint');
            setTimeout(() => hintBtn.classList.remove('no-hint'), 500);
        }
    };

    const retryBtn = document.getElementById('retry-btn');
    retryBtn.onclick = () => {
        if (game.retryLastMove()) {
            renderer.resetExplosion();
            retryBtn.style.display = 'none';
            document.getElementById('hint-btn').style.display = 'block';
        }
    };
}

/**
 * Setup renderer callbacks
 */
function setupRendererCallbacks() {
    uiManager.setRenderer(renderer);

    setTimeout(() => {
        if (renderer.soundManager) {
            renderer.soundManager.resumeContext();
            renderer.soundManager.setMute(uiManager.isMuted);
        }
    }, 100);

    renderer.onGameEnd = () => {
        document.getElementById('hint-btn').style.display = 'none';
        document.getElementById('retry-btn').style.display = 'none';
        renderer.dispose();
        renderer = null;
        game = null;
        uiManager.showMenu();
    };
}

/**
 * Setup timer and score display updates
 */
function setupTimerAndScoreUpdates() {
    setInterval(() => {
        if (game && renderer) {
            const timerDisplay = document.getElementById('timer-display');
            const scoreDisplay = document.getElementById('score-display');
            const hintDisplay = document.getElementById('hint-display');

            if (game.gameStartTime) {
                const time = game.getElapsedTime();
                timerDisplay.textContent = `⏱️ ${Math.floor(time / 60).toString().padStart(2, '0')}:${(time % 60).toString().padStart(2, '0')}`;
                timerDisplay.classList.add('active');

                const score = scoreManager.calculateScore(game.width, game.height, game.bombCount, time, {
                    noGuessMode: game.noGuessMode,
                    hintCount: game.hintCount,
                    retryCount: game.retryCount
                });
                scoreDisplay.textContent = `🏆 Score: ${score.toLocaleString()}`;
                scoreDisplay.classList.add('active');

                hintDisplay.textContent = `🧩 Indices: ${game.hintCount}`;
                hintDisplay.classList.toggle('active', game.hintCount > 0);

                const retryBtn = document.getElementById('retry-btn');
                retryBtn.style.display = (game.gameOver && game.lastMove) ? 'block' : 'none';
            } else {
                timerDisplay.classList.remove('active');
                scoreDisplay.classList.remove('active');
                hintDisplay.classList.remove('active');
            }
        }
    }, 100);
}

/**
 * Apply state synchronization from server
 */
function applyStateSync(state) {
    if (!game || !state || !renderer || !renderer.gridMesh) return;

    game.visibleGrid = state.visibleGrid.map(row => [...row]);
    game.flags = state.flags.map(row => [...row]);
    game.gameOver = state.gameOver;
    game.victory = state.victory;

    renderer.numberMeshes.forEach(mesh => {
        renderer.scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
            if (mesh.material.map) mesh.material.map.dispose();
            mesh.material.dispose();
        }
    });
    renderer.numberMeshes = [];

    for (let x = 0; x < game.width; x++) {
        for (let y = 0; y < game.height; y++) {
            const index = x * game.height + y;
            renderer.dummy.position.set(-(game.width * 10) + x * 22, 0, (game.height * 10) - y * 22);
            renderer.dummy.rotation.set(-Math.PI / 2, 0, 0);
            renderer.dummy.scale.set(game.visibleGrid[x][y] !== -1 ? 0 : 1, game.visibleGrid[x][y] !== -1 ? 0 : 1, game.visibleGrid[x][y] !== -1 ? 0 : 1);
            renderer.dummy.updateMatrix();
            renderer.gridMesh.setMatrixAt(index, renderer.dummy.matrix);
        }
    }
    renderer.gridMesh.instanceMatrix.needsUpdate = true;

    for (let x = 0; x < game.width; x++) {
        for (let y = 0; y < game.height; y++) {
            const val = game.visibleGrid[x][y];
            if (val !== -1 && val > 0 && val <= 8) {
                // Number cells (1-8)
                const planeGeo = new THREE.PlaneGeometry(16, 16);
                const material = new THREE.MeshBasicMaterial({
                    map: renderer.textures[val],
                    transparent: true, opacity: 1.0, depthWrite: true, depthTest: true,
                    side: THREE.DoubleSide, alphaTest: 0.1
                });
                const mesh = new THREE.Mesh(planeGeo, material);
                mesh.position.set(-(game.width * 10) + x * 22, 11, (game.height * 10) - y * 22);
                mesh.rotation.x = -Math.PI / 2;
                mesh.renderOrder = 1;
                renderer.scene.add(mesh);
                renderer.numberMeshes.push(mesh);
            } else if (val === 10) {
                // Revealed bomb (from eliminated player)
                const planeGeo = new THREE.PlaneGeometry(18, 18);
                const material = new THREE.MeshBasicMaterial({
                    map: renderer.textures['bomb'],
                    transparent: true, opacity: 1.0, depthWrite: true, depthTest: true,
                    side: THREE.DoubleSide, alphaTest: 0.1
                });
                const mesh = new THREE.Mesh(planeGeo, material);
                mesh.position.set(-(game.width * 10) + x * 22, 11, (game.height * 10) - y * 22);
                mesh.rotation.x = -Math.PI / 2;
                mesh.renderOrder = 2;
                renderer.scene.add(mesh);
                renderer.numberMeshes.push(mesh);
            }
            if (game.flags[x][y]) renderer.updateFlagVisual(x, y, true);
        }
    }
}

/**
 * Setup all network event callbacks
 */
function setupNetworkCallbacks() {
    networkManager.onConnected = (data) => {
        console.log('[Main] Connected to server');
        // Set local player ID for scoreboard highlighting
        if (scoreboard && data.playerId) {
            scoreboard.setLocalPlayer(data.playerId);
        }
    };
    networkManager.onPlayerJoined = (data) => console.log('[Main] Player joined:', data);
    networkManager.onPlayerLeft = (data) => console.log('[Main] Player left:', data);
    networkManager.onGameReady = (config) => console.log('[Main] Game ready:', config);

    networkManager.onStateSync = async (state) => {
        if (!state) return;

        if (!game || !renderer) {
            // This case handles joining an already running game via onStateSync message
            // (if not already handled by onGameStart)
            startGame(state.width, state.height, state.bombCount, true, false, 'Multiplayer', state.minePositions, state);
        } else {
            applyStateSync(state);
        }
        
        // Update scoreboard with initial scores
        if (state.scores && scoreboard) {
            scoreboard.updateScores(state.scores);
            scoreboard.show();
        }
    };

    networkManager.onGameUpdate = (update) => {
        console.log('[Main] gameUpdate received:', update);
        if (!game || !renderer) {
            console.log('[Main] No game/renderer, ignoring update');
            return;
        }
        const result = update.result;
        console.log('[Main] Processing result type:', result.type, 'changes:', result.changes?.length);
        if (result.type === 'reveal' || result.type === 'win') {
            // Update local game state AND visuals
            result.changes.forEach(c => {
                game.visibleGrid[c.x][c.y] = c.value; // Update game state
                renderer.updateCellVisual(c.x, c.y, c.value);
            });
            if (result.type === 'win' && !game.victory) { game.victory = true; renderer.triggerWin(); }
        } else if (result.type === 'revealedBomb') {
            // Another player clicked a bomb - show the revealed bomb visual
            game.visibleGrid[result.x][result.y] = 10; // Mark as revealed bomb
            renderer.updateCellVisual(result.x, result.y, 10);
        } else if (result.type === 'explode' && !game.gameOver) {
            // Legacy: full game over explosion (should not happen in new multiplayer)
            game.gameOver = true;
            game.visibleGrid[update.action.x][update.action.y] = 9; // Mark explosion
            renderer.triggerExplosion();
        } else if (result.type === 'flag') {
            game.flags[result.x][result.y] = result.active;
            renderer.updateFlagVisual(result.x, result.y, result.active);
        }
        
        // Update scoreboard with new scores
        if (update.scores && scoreboard) {
            scoreboard.updateScores(update.scores);
        }
    };

    // Handle player elimination in multiplayer
    networkManager.onPlayerEliminated = (data) => {
        console.log('[Main] Player eliminated:', data.playerName, 'isMe:', data.playerId === networkManager.playerId);
        
        if (data.playerId === networkManager.playerId) {
            // I was eliminated - show explosion effect and return to menu
            if (game) game.gameOver = true;
            if (renderer) renderer.triggerExplosion();
            
            // Hide scoreboard for eliminated player
            if (scoreboard) scoreboard.hide();
            
            // Return to menu after the explosion animation
            setTimeout(() => {
                console.log('[Main] Eliminated player returning to menu');
                networkManager.disconnect();
                if (renderer) {
                    renderer.dispose();
                    renderer = null;
                }
                game = null;
                uiManager.showMenu();
                // Reset multiplayer panel
                document.getElementById('mp-connect').classList.remove('hidden');
                document.getElementById('mp-host-lobby').classList.add('hidden');
                document.getElementById('mp-guest-lobby').classList.add('hidden');
                document.getElementById('host-waiting').classList.add('hidden');
                document.getElementById('host-actions').classList.remove('hidden');
                document.getElementById('guest-waiting').classList.remove('hidden');
                document.getElementById('guest-ready').classList.add('hidden');
            }, 3000); // 3 seconds for explosion animation
        } else {
            // Another player was eliminated - show notification
            if (uiManager.multiplayerUI) {
                uiManager.multiplayerUI.showEliminationNotification(data.playerName);
            }
        }
    };

    networkManager.onGameOver = (data) => {
        if (!game) return;
        console.log('[Main] Game Over received:', data);
        
        if (data.victory) {
            // Check if I'm the winner
            const isMyWin = data.winnerId === networkManager.playerId;
            
            if (!game.victory) {
                game.victory = true;
                renderer.triggerWin();
            }
            
            // Show winner notification for others
            if (!isMyWin && data.winnerName) {
                console.log(`[Main] ${data.winnerName} won! Reason: ${data.reason}`);
            }
        } else if (!data.victory && !game.gameOver) {
            // Everyone lost (all eliminated)
            game.gameOver = true;
            renderer.triggerExplosion();
        }
        
        // Show results modal with final scores after animation
        setTimeout(() => {
            if (scoreboard && data.finalScores) {
                scoreboard.hide(); // Hide in-game scoreboard
                scoreboard.showResults(data, () => {
                    // Menu button callback - handled by onGameEnded
                });
            }
        }, 2000);
        
        // Server will send gameEnded after delay, which will return to menu
    };

    networkManager.onMinesPlaced = (minePositions) => {
        if (!game || !minePositions) return;
        console.log('[Main] Mines placed:', minePositions.length, 'mines');
        game.setMinesFromPositions(minePositions);
    };

    // Server tells us the game session is over, return to menu
    networkManager.onGameEnded = () => {
        console.log('[Main] Game ended, returning to menu');
        networkManager.disconnect();
        
        // Hide scoreboard and results
        if (scoreboard) {
            scoreboard.hide();
            scoreboard.hideResults();
        }
        
        if (renderer) {
            renderer.dispose();
            renderer = null;
        }
        game = null;
        uiManager.showMenu();
        // Reset multiplayer panel to initial state completely
        document.getElementById('mp-connect').classList.remove('hidden');
        document.getElementById('mp-host-lobby').classList.add('hidden');
        document.getElementById('mp-guest-lobby').classList.add('hidden');
        // Reset host lobby internal state
        document.getElementById('host-waiting').classList.add('hidden');
        document.getElementById('host-actions').classList.remove('hidden');
        // Reset guest lobby internal state
        document.getElementById('guest-waiting').classList.remove('hidden');
        document.getElementById('guest-ready').classList.add('hidden');
    };

    networkManager.onCursorUpdate = (cursor) => {
        if (renderer && cursor.playerNumber !== networkManager.playerNumber) {
            renderer.updatePartnerCursor(cursor.x, cursor.y);
        }
    };

    networkManager.onError = (error) => {
        console.error('[Main] Network error:', error);
        alert('Erreur réseau: ' + error);
    };
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
