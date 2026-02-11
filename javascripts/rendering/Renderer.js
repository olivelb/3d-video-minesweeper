import * as THREE from 'three';
import { SoundManager } from '../audio/SoundManager.js';
import { ParticleSystem } from './ParticleSystem.js';
import { MediaTextureManager } from './MediaTextureManager.js';
import { InputManager } from './InputManager.js';
import { GridManager, gridToWorld } from './GridManager.js';
import { FlagManager } from './FlagManager.js';
import { CameraController } from './CameraController.js';
import { EndGameEffects } from './EndGameEffects.js';
import { Events } from '../core/EventBus.js';
import { Logger } from '../utils/Logger.js';

/**
 * Configuration for renderer behaviour & timing
 * @constant
 */
const RENDERER_CONFIG = {
    /** Background scene colour */
    BG_COLOR: 0x1f1f1f,
    /** Duration of the reassembly animation (s) */
    REASSEMBLY_DURATION: 1.6,
    /** Delay before reassembly starts after elimination explosion (ms) */
    REASSEMBLY_DELAY: 1500,
    /** Total elimination sequence duration before ghost mode (ms) */
    ELIMINATION_DURATION: 3200,
    /** Number of particle emitters per elimination explosion */
    ELIMINATION_EMITTER_COUNT: 5,
    /** Particles per emitter during elimination */
    ELIMINATION_PARTICLE_COUNT: 50,
    /** Base speed of elimination particles */
    ELIMINATION_PARTICLE_SPEED: 100,
    /** Random speed variation for elimination particles */
    ELIMINATION_PARTICLE_SPEED_VARIANCE: 50,
    /** Lifetime of elimination particles (s) */
    ELIMINATION_PARTICLE_LIFETIME: 1.5,
    /** Explosion rotation speed multiplier (per frame) */
    EXPLOSION_ROTATION_SPEED: 10,
    /** Explosion translation speed multiplier (per frame) */
    EXPLOSION_TRANSLATION_SPEED: 200,
    /** Ghost-mode fog colour */
    GHOST_FOG_COLOR: 0x1a1a1a,
    /** Ghost-mode fog density */
    GHOST_FOG_DENSITY: 0.001,
    /** Ghost-mode light intensity multiplier */
    GHOST_LIGHT_FACTOR: 0.85,
    /** Y position for hint particle emitters */
    HINT_PARTICLE_HEIGHT: 20
};

export class MinesweeperRenderer {
    constructor(game, containerId, useHoverHelper = true, bgName = 'Unknown', eventBus = null) {
        this.game = game;
        this.container = document.getElementById(containerId);
        this.useHoverHelper = useHoverHelper;
        this.bgName = bgName;
        this.events = eventBus;

        if (this.events) {
            this.events.on(Events.SPECTATOR_MODE_START, () => this.enableGhostMode());
            this.events.on(Events.GAME_START, () => this.disableGhostMode());
            this.events.on(Events.TOGGLE_MUTE, (isMuted) => {
                if (this.soundManager) this.soundManager.setMute(isMuted);
            });
            this.events.on(Events.FLAG_STYLE_CHANGED, (style) => {
                if (this.flagManager) this.setFlagStyle(style);
            });
        }

        this.scene = null;
        this.soundManager = null;
        this.particleSystem = null;

        // Managers (initialized in init())
        this.mediaManager = new MediaTextureManager();
        this.cameraController = null;
        this.gridManager = null;
        this.flagManager = null;
        this.endGameEffects = null;
        this.inputManager = null;

        // Convenience aliases (set after manager creation)
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.textGroup = new THREE.Group();
        this.dummy = new THREE.Object3D();

        // Explosion / reassembly state (kept in Renderer — too interleaved to delegate)
        this.isExploding = false;
        this.explosionTime = 0;
        this.isReassembling = false;
        this.reassemblyProgress = 0;
        this.reassemblyDuration = RENDERER_CONFIG.REASSEMBLY_DURATION;
        this.reassemblyStartPositions = [];
        this.reassemblyStartRotations = [];

        // Reusable fallback objects for reassembly (avoid per-cell-per-frame alloc)
        this._defaultPos = new THREE.Vector3(0, 0, 0);
        this._defaultRot = new THREE.Euler(-Math.PI / 2, 0, 0);
        this._defaultScale = new THREE.Vector3(1, 1, 1);

        this.onGameEnd = null;

        this._boundOnWindowResize = () => this.onWindowResize();

        this.init();
    }

    async init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(RENDERER_CONFIG.BG_COLOR);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Camera (via CameraController)
        this.cameraController = new CameraController(this.renderer, this.game.width, this.game.height);
        this.camera = this.cameraController.camera;
        this.controls = this.cameraController.controls;

        this.soundManager = new SoundManager(this.camera);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);
        this.scene.add(this.textGroup);

        // Load resources via MediaTextureManager
        await this.mediaManager.loadResources(this.bgName);
        this.textures = this.mediaManager.textures;
        this.font = this.mediaManager.font;

        this.particleSystem = new ParticleSystem(this.scene, this.textures);

        // Grid (via GridManager)
        this.gridManager = new GridManager(this.scene, this.game, this.mediaManager.getBackgroundTexture(), this.textures);

        // Flags (via FlagManager)
        this.flagManager = new FlagManager(this.scene, this.particleSystem);

        // End-game effects (via EndGameEffects)
        this.endGameEffects = new EndGameEffects(this.scene, this.camera, this.particleSystem, this.font);
        this.endGameEffects.onAutoReturn = () => {
            if (this.events) this.events.emit(Events.GAME_ENDED);
            if (this.onGameEnd) this.onGameEnd();
        };

        // Input
        this.inputManager = new InputManager(this.renderer, this.camera, this.gridManager.gridMesh, this.game, this.events);
        this.renderer.handleGameUpdate = (result) => this.handleGameUpdate(result);

        window.addEventListener('resize', this._boundOnWindowResize, false);
        this.renderer.setAnimationLoop(() => this.animate());
    }

    // ─────────────────────────────────────────────
    //  Media / Texture Management
    // ─────────────────────────────────────────────

    /** @returns {THREE.InstancedMesh|null} Convenience getter for external callers */
    get gridMesh() {
        return this.gridManager?.gridMesh ?? null;
    }

    updateMediaTexture(type, source) {
        if (!source) return;

        if (this.mediaTexture) {
            this.mediaTexture.dispose();
        }

        this.mediaType = type;

        if (type === 'image') {
            this.mediaTexture = new THREE.Texture(source);
            this.mediaTexture.needsUpdate = true;
        } else {
            this.mediaTexture = new THREE.VideoTexture(source);
        }

        this.mediaTexture.minFilter = THREE.LinearFilter;
        this.mediaTexture.magFilter = THREE.LinearFilter;
        this.mediaTexture.colorSpace = THREE.SRGBColorSpace;

        if (this.gridManager) {
            this.gridManager.updateMediaTexture(this.mediaTexture);
        }

        // Backwards compatibility alias
        this.videoTexture = this.mediaTexture;
    }

    // ─────────────────────────────────────────────
    //  Grid / Cell Delegates
    // ─────────────────────────────────────────────

    updateSelectionBox(instanceId) {
        this.gridManager.updateHover(instanceId, this.useHoverHelper);
    }

    resetInstance(instanceId) {
        this.gridManager.resetInstance(instanceId);
    }

    handleGameUpdate(result) {
        if (result.type === 'reveal' || result.type === 'win') {
            result.changes.forEach(change => {
                this.updateCellVisual(change.x, change.y, change.value);
            });
            if (result.type === 'win') this.triggerWin();
        } else if (result.type === 'explode') {
            // Apply any pre-explosion changes (from chord revealing safe cells before hitting mine)
            if (result.changes && result.changes.length > 0) {
                result.changes.forEach(change => {
                    this.updateCellVisual(change.x, change.y, change.value);
                });
            }
            this.triggerExplosion();
        } else if (result.type === 'flag') {
            this.updateFlagVisual(result.x, result.y, result.active);
        }
    }

    showHint(x, y, type) {
        this.gridManager.showHint(x, y, type);

        // Particle effect on hint cell
        const color = type === 'safe' ? new THREE.Color(0x00ff00) : new THREE.Color(0xff0000);
        const { wx, wz } = gridToWorld(x, y, this.game.width, this.game.height);
        const pos = new THREE.Vector3(wx, RENDERER_CONFIG.HINT_PARTICLE_HEIGHT, wz);
        this.particleSystem.createEmitter(pos, 'hint', {
            colorStart: color,
            colorEnd: new THREE.Color(0xffffff),
            lifeTime: 1.0
        });
    }

    updateCellVisual(x, y, value) {
        this.gridManager.updateCellVisual(x, y, value);
        this.flagManager.updateFlag(x, y, false, this.game.width, this.game.height);
    }

    /**
     * Show a death-flag on a cell where another player was eliminated.
     * Hides the cube, places the skull+flag texture, and removes any
     * existing flag particle/icon so there isn't a visual double-up.
     */
    showDeathFlag(x, y) {
        // Remove any existing flag visual for this cell
        this.flagManager.updateFlag(x, y, false, this.game.width, this.game.height);
        // Place the death-flag mesh (skull + flag icon)
        this.gridManager.createDeathFlagMesh(x, y);
    }

    // ─────────────────────────────────────────────
    //  Flag Delegates
    // ─────────────────────────────────────────────

    updateFlagVisual(x, y, active) {
        this.flagManager.updateFlag(x, y, active, this.game.width, this.game.height);
    }

    setFlagStyle(style) {
        return this.flagManager.setStyle(style, this.game);
    }

    // ─────────────────────────────────────────────
    //  Explosion / Win / End-Game
    // ─────────────────────────────────────────────

    triggerExplosion(isSpectating = false) {
        if (this.isExploding) return;

        if (!isSpectating) {
            this.endGameEffects.triggerLoss();
            this.isExploding = true;
            this.particleSystem.stopAll();
            this.flagManager.clearAll();
            this.gridManager.triggerExplosion();
        } else {
            Logger.log('Renderer', 'Soft explosion for Spectator Mode');
        }

        if (this.events) {
            this.events.emit(Events.GAME_OVER, { victory: false });
        }
    }

    triggerWin() {
        if (this.game.victory && this.endGameEffects.textMesh) return;
        this.game.victory = true;

        if (this.events) {
            this.events.emit(Events.GAME_OVER, { victory: true });
        }

        this.endGameEffects.triggerWin();
        this.gridManager.hide();
        this.particleSystem.stopAll();
        this.flagManager.clearAll();
    }

    showText(message, color) {
        this.endGameEffects.showText(message, color);
    }

    /**
     * Play the elimination sequence for multiplayer.
     * Triggers a global explosion that reverses itself (reassembles) before spectator mode.
     * @param {number} x - Bomb x coordinate
     * @param {number} y - Bomb y coordinate
     */
    playEliminationSequence(x, y) {
        const { wx, wz } = gridToWorld(x, y, this.game.width, this.game.height);
        const pos = new THREE.Vector3(wx, 0, wz);

        // Local feedback — particle explosions
        for (let i = 0; i < RENDERER_CONFIG.ELIMINATION_EMITTER_COUNT; i++) {
            this.particleSystem.createEmitter(pos, 'explosion', {
                count: RENDERER_CONFIG.ELIMINATION_PARTICLE_COUNT,
                speed: RENDERER_CONFIG.ELIMINATION_PARTICLE_SPEED + Math.random() * RENDERER_CONFIG.ELIMINATION_PARTICLE_SPEED_VARIANCE,
                lifeTime: RENDERER_CONFIG.ELIMINATION_PARTICLE_LIFETIME,
                colorStart: new THREE.Color(0xff0000),
                colorEnd: new THREE.Color(0x222222)
            });
        }
        this.updateCellVisual(x, y, 9);

        // Global transient explosion
        this.gridManager.numberMeshes.forEach(mesh => mesh.visible = false);
        this.flagManager.clearAll();

        // Save pre-explosion state so reassembly can lerp back to exact positions
        this.preExplosionState = [];
        const gridMeshPre = this.gridManager.gridMesh;
        for (let i = 0; i < this.game.width * this.game.height; i++) {
            gridMeshPre.getMatrixAt(i, this.dummy.matrix);
            this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
            this.preExplosionState[i] = {
                position: this.dummy.position.clone(),
                rotation: this.dummy.rotation.clone(),
                scale: this.dummy.scale.clone()
            };
        }

        this.isExploding = true;
        this.explosionTime = 0;
        this.isReassembling = false;

        // Schedule reassembly
        setTimeout(() => {
            this.isExploding = false;
            this.isReassembling = true;
            this.reassemblyProgress = 0.0;
            this.reassemblyDuration = RENDERER_CONFIG.REASSEMBLY_DURATION;

            this.reassemblyStartPositions = [];
            this.reassemblyStartRotations = [];
            this.reassemblyStartScales = [];

            const gridMesh = this.gridManager.gridMesh;
            for (let i = 0; i < this.game.width * this.game.height; i++) {
                gridMesh.getMatrixAt(i, this.dummy.matrix);
                this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
                this.reassemblyStartPositions[i] = this.dummy.position.clone();
                this.reassemblyStartRotations[i] = this.dummy.rotation.clone();
                this.reassemblyStartScales[i] = this.dummy.scale.clone();
            }

            this.scene.traverse(obj => {
                if (obj.isLight && obj.userData.originalIntensity === undefined) {
                    obj.userData.originalIntensity = obj.intensity;
                }
            });

            // Cache light references for _animateReassembly (avoid scene.traverse per frame)
            this._reassemblyLights = [];
            this.scene.traverse(obj => {
                if (obj.isLight && obj.userData.originalIntensity !== undefined) {
                    this._reassemblyLights.push(obj);
                }
            });

            // Pre-create fog so _animateReassembly only updates density
            this.scene.fog = new THREE.FogExp2(RENDERER_CONFIG.GHOST_FOG_COLOR, 0);
        }, RENDERER_CONFIG.REASSEMBLY_DELAY);

        // Schedule completion
        setTimeout(() => {
            this.isReassembling = false;
            this.resetExplosion();
            this.enableGhostMode();
            this.gridManager.numberMeshes.forEach(mesh => mesh.visible = true);
        }, RENDERER_CONFIG.ELIMINATION_DURATION);
    }

    enableGhostMode() {
        Logger.log('Renderer', 'Enabling Ghost Mode visuals');
        this.scene.fog = new THREE.FogExp2(RENDERER_CONFIG.GHOST_FOG_COLOR, RENDERER_CONFIG.GHOST_FOG_DENSITY);
        this.scene.traverse(obj => {
            if (obj.isLight) {
                obj.userData.originalIntensity = obj.intensity;
                obj.intensity *= RENDERER_CONFIG.GHOST_LIGHT_FACTOR;
            }
        });
    }

    disableGhostMode() {
        this.scene.fog = null;
        this.scene.traverse(obj => {
            if (obj.isLight && obj.userData.originalIntensity !== undefined) {
                obj.intensity = obj.userData.originalIntensity;
            }
        });
    }

    resetExplosion() {
        this.isExploding = false;
        this.isReassembling = false;
        this.explosionTime = 0;

        this.endGameEffects.reset();
        this.gridManager.resetExplosion();

        // Re-create active flags
        this.flagManager.clearAll();
        for (let x = 0; x < this.game.width; x++) {
            for (let y = 0; y < this.game.height; y++) {
                if (this.game.flags[x][y]) {
                    this.updateFlagVisual(x, y, true);
                }
            }
        }
    }

    // ─────────────────────────────────────────────
    //  Animation Loop
    // ─────────────────────────────────────────────

    animate() {
        const now = performance.now();
        const dt = this._lastFrameTime ? Math.min((now - this._lastFrameTime) / 1000, 0.1) : 0.016;
        this._lastFrameTime = now;

        // Camera (intro animation or orbit controls)
        this.cameraController.update(dt);

        // Particles
        this.particleSystem.update(dt);

        // Flag animation (hover pulse on 2D flags)
        const hoveredInstanceId = this.inputManager ? this.inputManager.getHoveredInstanceId() : -1;
        if (hoveredInstanceId !== -1) {
            const hoveredY = hoveredInstanceId % this.game.height;
            const hoveredX = Math.floor(hoveredInstanceId / this.game.height);
            this.flagManager.animate(hoveredX, hoveredY);
        } else {
            this.flagManager.animate(-1, -1);
        }

        // Hover selection effect
        this.updateSelectionBox(hoveredInstanceId);

        // End-game text billboard + auto-return timer
        this.endGameEffects.update(this.game.gameOver || this.game.victory);

        // Explosion animation (outward)
        if (this.isExploding) {
            this.explosionTime++;
            const gridMesh = this.gridManager.gridMesh;
            const explosionVectors = this.gridManager.explosionVectors;
            for (let i = 0; i < this.game.width * this.game.height; i++) {
                gridMesh.getMatrixAt(i, this.dummy.matrix);
                this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
                if (this.dummy.scale.x > 0.1) {
                    const vec = explosionVectors[i];
                    this.dummy.rotation.x += RENDERER_CONFIG.EXPLOSION_ROTATION_SPEED * vec.dx;
                    this.dummy.rotation.y += RENDERER_CONFIG.EXPLOSION_ROTATION_SPEED * vec.dy;
                    this.dummy.position.x += RENDERER_CONFIG.EXPLOSION_TRANSLATION_SPEED * vec.dx;
                    this.dummy.position.y += RENDERER_CONFIG.EXPLOSION_TRANSLATION_SPEED * vec.dy;
                    this.dummy.updateMatrix();
                    gridMesh.setMatrixAt(i, this.dummy.matrix);
                }
            }
            gridMesh.instanceMatrix.needsUpdate = true;
        }

        // Reassembly animation (inward with easing & ghost transition)
        if (this.isReassembling) {
            this._animateReassembly(dt);
        }

        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Animate the reassembly of cubes after elimination explosion
     * @private
     */
    _animateReassembly(dt) {
        this.reassemblyProgress += dt / this.reassemblyDuration;
        if (this.reassemblyProgress > 1.0) this.reassemblyProgress = 1.0;

        const t = this.reassemblyProgress;
        const easeFactor = t * t * t * t * t * t; // Ease-in exponential (t^6)

        // Synchronize fog (reuse existing fog object — just update density)
        if (this.scene.fog) {
            this.scene.fog.density = RENDERER_CONFIG.GHOST_FOG_DENSITY * easeFactor;
        }

        // Synchronize lights (use cached references instead of scene.traverse)
        const currentLightFactor = 1.0 - ((1.0 - RENDERER_CONFIG.GHOST_LIGHT_FACTOR) * easeFactor);
        const lights = this._reassemblyLights;
        if (lights) {
            for (let i = 0; i < lights.length; i++) {
                lights[i].intensity = lights[i].userData.originalIntensity * currentLightFactor;
            }
        }

        const gridMesh = this.gridManager.gridMesh;

        for (let i = 0; i < this.game.width * this.game.height; i++) {
            // Use saved pre-explosion state as target (exact original positions)
            const target = this.preExplosionState?.[i];
            const targetPos = target?.position ?? this._defaultPos;
            const targetRot = target?.rotation ?? this._defaultRot;
            const targetScale = target?.scale ?? this._defaultScale;

            const startPos = this.reassemblyStartPositions?.[i] ?? targetPos;
            const startRot = this.reassemblyStartRotations?.[i] ?? targetRot;
            const startScale = this.reassemblyStartScales?.[i] ?? targetScale;

            this.dummy.position.lerpVectors(startPos, targetPos, easeFactor);
            this.dummy.rotation.set(
                startRot.x + (targetRot.x - startRot.x) * easeFactor,
                startRot.y + (targetRot.y - startRot.y) * easeFactor,
                startRot.z + (targetRot.z - startRot.z) * easeFactor
            );
            this.dummy.scale.lerpVectors(startScale, targetScale, easeFactor);

            this.dummy.updateMatrix();
            gridMesh.setMatrixAt(i, this.dummy.matrix);
        }
        gridMesh.instanceMatrix.needsUpdate = true;
    }

    // ─────────────────────────────────────────────
    //  Resize / Cleanup
    // ─────────────────────────────────────────────

    onWindowResize() {
        this.cameraController.onWindowResize();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    dispose() {
        this.onGameEnd = null;
        this.renderer.setAnimationLoop(null);

        if (this.particleSystem) this.particleSystem.dispose();
        if (this.mediaManager) this.mediaManager.dispose();
        if (this.inputManager) this.inputManager.detachListeners();
        if (this.gridManager) this.gridManager.dispose();
        if (this.flagManager) this.flagManager.dispose();
        if (this.cameraController) this.cameraController.dispose();
        if (this.endGameEffects) this.endGameEffects.dispose();

        this.scene.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(m => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                } else {
                    if (object.material.map) object.material.map.dispose();
                    object.material.dispose();
                }
            }
        });

        this.renderer.dispose();
        if (this.container) {
            this.container.innerHTML = '';
        }

        window.removeEventListener('resize', this._boundOnWindowResize);
    }
}
