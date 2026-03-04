import * as THREE from 'three';
import { SoundManager } from '../audio/SoundManager.js';
import { ParticleSystem } from './ParticleSystem.js';
import { BlackHoleEffect } from './BlackHoleEffect.js';
import { MediaTextureManager } from './MediaTextureManager.js';
import { InputManager } from './InputManager.js';
import { GridManager, gridToWorld } from './GridManager.js';
import { FlagManager } from './FlagManager.js';
import { CameraController } from './CameraController.js';
import { EndGameEffects } from './EndGameEffects.js';
import { Events } from '../core/EventBus.js';
import type { EventBus } from '../core/EventBus.js';
import { Logger } from '../utils/Logger.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const RENDERER_CONFIG = {
    BG_COLOR: 0x1f1f1f,
    REASSEMBLY_DURATION: 1.6,
    REASSEMBLY_DELAY: 1500,
    ELIMINATION_DURATION: 3200,
    ELIMINATION_EMITTER_COUNT: 5,
    ELIMINATION_PARTICLE_COUNT: 50,
    ELIMINATION_PARTICLE_SPEED: 100,
    ELIMINATION_PARTICLE_SPEED_VARIANCE: 50,
    ELIMINATION_PARTICLE_LIFETIME: 1.5,
    EXPLOSION_ROTATION_SPEED: 10,
    EXPLOSION_TRANSLATION_SPEED: 200,
    GHOST_FOG_COLOR: 0x1a1a1a,
    GHOST_FOG_DENSITY: 0.001,
    GHOST_LIGHT_FACTOR: 0.85,
    HINT_PARTICLE_HEIGHT: 20
};

export class MinesweeperRenderer {
    game: any;
    container: HTMLElement | null;
    useHoverHelper: boolean;
    bgName: string;
    events: EventBus | null;

    scene: THREE.Scene | null;
    soundManager: SoundManager | null;
    particleSystem: ParticleSystem | null;
    blackHoleEffect: BlackHoleEffect | null;

    mediaManager: MediaTextureManager;
    cameraController: CameraController | null;
    gridManager: GridManager | null;
    flagManager: FlagManager | null;
    endGameEffects: EndGameEffects | null;
    inputManager: InputManager | null;

    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    controls: any;

    textures: Record<string | number, THREE.Texture>;
    font: any;
    mediaTexture: THREE.Texture | null;
    mediaType: string | null;
    videoTexture: THREE.Texture | null;

    textGroup: THREE.Group;
    dummy: THREE.Object3D;

    // Explosion / reassembly state
    isExploding: boolean;
    explosionTime: number;
    isReassembling: boolean;
    reassemblyProgress: number;
    reassemblyDuration: number;
    reassemblyStartPositions: any[];
    reassemblyStartRotations: any[];

    _defaultPos: THREE.Vector3;
    _defaultRot: THREE.Euler;
    _defaultScale: THREE.Vector3;
    _quatHelper: THREE.Quaternion;
    _eulerHelper: THREE.Euler;
    _hintColorSafe: THREE.Color;
    _hintColorMine: THREE.Color;
    _hintPos: THREE.Vector3;

    onGameEnd: (() => void) | null;
    _boundOnWindowResize: () => void;
    _lastFrameTime: number | undefined;

    // Post-processing
    composer: EffectComposer | null;
    renderPass: RenderPass | null;
    distortionPass: ShaderPass | null;
    outputPass: OutputPass | null;

    // Explosion flat arrays
    _explPos: Float32Array | null;
    _explRot: Float32Array | null;
    _explScaleVisible: Uint8Array | null;
    _preExpPos: Float32Array | null;
    _preExpRot: Float32Array | null;
    _preExpScale: Float32Array | null;
    _reassemblyStartPos: Float32Array | null;
    _reassemblyStartRot: Float32Array | null;
    _reassemblyStartScale: Float32Array | null;
    _reassemblyLights: THREE.Light[] | null;

    handleGameUpdate: (result: any) => void;

    constructor(game: any, containerId: string, useHoverHelper = true, bgName = 'Unknown', eventBus: EventBus | null = null) {
        this.game = game;
        this.container = document.getElementById(containerId);
        this.useHoverHelper = useHoverHelper;
        this.bgName = bgName;
        this.events = eventBus;

        if (this.events) {
            this.events.on(Events.SPECTATOR_MODE_START, () => this.enableGhostMode());
            this.events.on(Events.GAME_START, () => this.disableGhostMode());
            this.events.on(Events.TOGGLE_MUTE, (isMuted: boolean) => {
                if (this.soundManager) this.soundManager.setMute(isMuted);
            });
            this.events.on(Events.FLAG_STYLE_CHANGED, (style: string) => {
                if (this.flagManager) this.setFlagStyle(style);
            });
        }

        this.scene = null;
        this.soundManager = null;
        this.particleSystem = null;
        this.blackHoleEffect = null;

        this.mediaManager = new MediaTextureManager();
        this.cameraController = null;
        this.gridManager = null;
        this.flagManager = null;
        this.endGameEffects = null;
        this.inputManager = null;

        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.textures = {};
        this.font = null;
        this.mediaTexture = null;
        this.mediaType = null;
        this.videoTexture = null;

        this.textGroup = new THREE.Group();
        this.dummy = new THREE.Object3D();

        this.isExploding = false;
        this.explosionTime = 0;
        this.isReassembling = false;
        this.reassemblyProgress = 0;
        this.reassemblyDuration = RENDERER_CONFIG.REASSEMBLY_DURATION;
        this.reassemblyStartPositions = [];
        this.reassemblyStartRotations = [];

        this._defaultPos = new THREE.Vector3(0, 0, 0);
        this._defaultRot = new THREE.Euler(-Math.PI / 2, 0, 0);
        this._defaultScale = new THREE.Vector3(1, 1, 1);
        this._quatHelper = new THREE.Quaternion();
        this._eulerHelper = new THREE.Euler();
        this._hintColorSafe = new THREE.Color(0x00ff00);
        this._hintColorMine = new THREE.Color(0xff0000);
        this._hintPos = new THREE.Vector3();

        this.onGameEnd = null;
        this._boundOnWindowResize = () => this.onWindowResize();

        this.composer = null;
        this.renderPass = null;
        this.distortionPass = null;
        this.outputPass = null;

        this._explPos = null;
        this._explRot = null;
        this._explScaleVisible = null;
        this._preExpPos = null;
        this._preExpRot = null;
        this._preExpScale = null;
        this._reassemblyStartPos = null;
        this._reassemblyStartRot = null;
        this._reassemblyStartScale = null;
        this._reassemblyLights = null;

        this.handleGameUpdate = (result: any) => this._handleGameUpdate(result);

        this.init();
    }

    async init(): Promise<void> {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(RENDERER_CONFIG.BG_COLOR);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container!.appendChild(this.renderer.domElement);

        this.cameraController = new CameraController(this.renderer, this.game.width, this.game.height);
        this.camera = this.cameraController.camera;
        this.controls = this.cameraController.controls;

        this.soundManager = new SoundManager(this.camera);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);
        this.scene.add(this.textGroup);

        await this.mediaManager.loadResources(this.bgName);
        this.textures = this.mediaManager.textures;
        this.font = this.mediaManager.font;

        this.particleSystem = new ParticleSystem(this.scene, this.textures);
        this.blackHoleEffect = new BlackHoleEffect(this.scene, this.camera);

        this.gridManager = new GridManager(this.scene, this.game, this.mediaManager.getBackgroundTexture(), this.textures);
        this.flagManager = new FlagManager(this.scene, this.particleSystem);
        this.endGameEffects = new EndGameEffects(this.scene, this.camera, this.particleSystem, this.font);
        this.endGameEffects.onAutoReturn = () => {
            if (this.events) this.events.emit(Events.GAME_ENDED);
            if (this.onGameEnd) this.onGameEnd();
        };

        this.inputManager = new InputManager(this.renderer, this.camera, this.gridManager.gridMesh!, this.game, this.events!);
        (this.renderer as any).handleGameUpdate = (result: any) => this._handleGameUpdate(result);

        const pixelRatio = this.renderer.getPixelRatio();
        const renderTarget = new THREE.WebGLRenderTarget(
            window.innerWidth * pixelRatio,
            window.innerHeight * pixelRatio, {
            samples: 2,
            type: THREE.HalfFloatType
        });
        this.composer = new EffectComposer(this.renderer, renderTarget);
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        this.distortionPass = new ShaderPass(this.blackHoleEffect.getShader());
        this.distortionPass.enabled = false;
        this.distortionPass.needsSwap = true;
        this.composer.addPass(this.distortionPass);
        this.blackHoleEffect.setPass(this.distortionPass);

        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);

        window.addEventListener('resize', this._boundOnWindowResize, false);
        this.renderer.setAnimationLoop(() => this.animate());
    }

    get gridMesh(): THREE.InstancedMesh | null {
        return this.gridManager?.gridMesh ?? null;
    }

    updateMediaTexture(type: string, source: HTMLVideoElement | HTMLImageElement): void {
        if (!source) return;

        if (this.mediaTexture) {
            this.mediaTexture.dispose();
        }

        this.mediaType = type;

        if (type === 'image') {
            this.mediaTexture = new THREE.Texture(source as HTMLImageElement);
            this.mediaTexture.needsUpdate = true;
        } else {
            this.mediaTexture = new THREE.VideoTexture(source as HTMLVideoElement);
        }

        this.mediaTexture.minFilter = THREE.LinearFilter;
        this.mediaTexture.magFilter = THREE.LinearFilter;
        this.mediaTexture.colorSpace = THREE.SRGBColorSpace;

        if (this.gridManager) {
            this.gridManager.updateMediaTexture(this.mediaTexture);
        }

        this.videoTexture = this.mediaTexture;
    }

    updateSelectionBox(instanceId: number): void {
        this.gridManager!.updateHover(instanceId, this.useHoverHelper);
    }

    resetInstance(instanceId: number): void {
        this.gridManager!.resetInstance(instanceId);
    }

    _handleGameUpdate(result: any): void {
        if (result.type === 'reveal' || result.type === 'win') {
            const changes = result.changes;
            for (let i = 0; i < changes.length; i++) {
                this.updateCellVisual(changes[i].x, changes[i].y, changes[i].value);
            }
            // Single GPU upload after all cells processed
            this.gridManager!.flushInstanceMatrix();
            if (result.type === 'win') this.triggerWin();
        } else if (result.type === 'explode') {
            if (result.changes && result.changes.length > 0) {
                const changes = result.changes;
                for (let i = 0; i < changes.length; i++) {
                    this.updateCellVisual(changes[i].x, changes[i].y, changes[i].value);
                }
                this.gridManager!.flushInstanceMatrix();
            }
            this.triggerExplosion();
        } else if (result.type === 'flag') {
            this.updateFlagVisual(result.x, result.y, result.active);
        }
    }

    showHint(x: number, y: number, type: string): void {
        this.gridManager!.showHint(x, y, type);

        const color = type === 'safe' ? this._hintColorSafe : this._hintColorMine;
        const { wx, wz } = gridToWorld(x, y, this.game.width, this.game.height);
        this._hintPos.set(wx, RENDERER_CONFIG.HINT_PARTICLE_HEIGHT, wz);

        this.blackHoleEffect!.trigger(this._hintPos, color);
    }

    highlightConstraints(cells: { x: number; y: number }[]): void {
        this.gridManager!.highlightConstraints(cells);
    }

    clearConstraintHighlights(): void {
        this.gridManager!.clearConstraintHighlights();
    }

    updateCellVisual(x: number, y: number, value: number): void {
        this.gridManager!.updateCellVisual(x, y, value);
        this.flagManager!.updateFlag(x, y, false, this.game.width, this.game.height);
    }

    showDeathFlag(x: number, y: number): void {
        this.flagManager!.updateFlag(x, y, false, this.game.width, this.game.height);
        this.gridManager!.createDeathFlagMesh(x, y);
    }

    updateFlagVisual(x: number, y: number, active: boolean): void {
        this.flagManager!.updateFlag(x, y, active, this.game.width, this.game.height);
    }

    setFlagStyle(style: string): string {
        return this.flagManager!.setStyle(style, this.game);
    }

    triggerExplosion(isSpectating = false): void {
        if (this.isExploding) return;

        if (!isSpectating) {
            this.endGameEffects!.triggerLoss();
            this.isExploding = true;
            this.explosionTime = 0;
            this.particleSystem!.stopAll();
            this.flagManager!.clearAll();
            this.gridManager!.triggerExplosion();

            const cellCount = this.game.width * this.game.height;
            this._explPos = new Float32Array(cellCount * 3);
            this._explRot = new Float32Array(cellCount * 3);
            this._explScaleVisible = new Uint8Array(cellCount);

            const gridMesh = this.gridManager!.gridMesh!;
            for (let i = 0; i < cellCount; i++) {
                gridMesh.getMatrixAt(i, this.dummy.matrix);
                this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
                const i3 = i * 3;
                this._explPos[i3] = this.dummy.position.x;
                this._explPos[i3 + 1] = this.dummy.position.y;
                this._explPos[i3 + 2] = this.dummy.position.z;
                this._explRot[i3] = this.dummy.rotation.x;
                this._explRot[i3 + 1] = this.dummy.rotation.y;
                this._explRot[i3 + 2] = this.dummy.rotation.z;
                this._explScaleVisible[i] = this.dummy.scale.x > 0.1 ? 1 : 0;
            }
        } else {
            Logger.log('Renderer', 'Soft explosion for Spectator Mode');
        }

        if (this.events) {
            this.events.emit(Events.GAME_OVER, { victory: false });
        }
    }

    triggerWin(): void {
        if (this.game.victory && this.endGameEffects!.textMesh) return;
        this.game.victory = true;

        if (this.events) {
            this.events.emit(Events.GAME_OVER, { victory: true });
        }

        this.endGameEffects!.triggerWin();
        this.gridManager!.hide();
        this.particleSystem!.stopAll();
        this.flagManager!.clearAll();
    }

    showText(message: string, color: number): void {
        this.endGameEffects!.showText(message, color);
    }

    playEliminationSequence(x: number, y: number): void {
        const { wx, wz } = gridToWorld(x, y, this.game.width, this.game.height);
        const pos = new THREE.Vector3(wx, 0, wz);

        for (let i = 0; i < RENDERER_CONFIG.ELIMINATION_EMITTER_COUNT; i++) {
            this.particleSystem!.createEmitter(pos, 'explosion', {
                count: RENDERER_CONFIG.ELIMINATION_PARTICLE_COUNT,
                speed: RENDERER_CONFIG.ELIMINATION_PARTICLE_SPEED + Math.random() * RENDERER_CONFIG.ELIMINATION_PARTICLE_SPEED_VARIANCE,
                lifeTime: RENDERER_CONFIG.ELIMINATION_PARTICLE_LIFETIME,
                colorStart: new THREE.Color(0xff0000),
                colorEnd: new THREE.Color(0x222222)
            });
        }
        this.updateCellVisual(x, y, 9);

        this.gridManager!.numberMeshes.forEach(mesh => mesh.visible = false);
        this.flagManager!.clearAll();

        const cellCount = this.game.width * this.game.height;
        this._preExpPos = new Float32Array(cellCount * 3);
        this._preExpRot = new Float32Array(cellCount * 3);
        this._preExpScale = new Float32Array(cellCount * 3);
        this._explPos = new Float32Array(cellCount * 3);
        this._explRot = new Float32Array(cellCount * 3);
        this._explScaleVisible = new Uint8Array(cellCount);

        const gridMeshPre = this.gridManager!.gridMesh!;
        for (let i = 0; i < cellCount; i++) {
            gridMeshPre.getMatrixAt(i, this.dummy.matrix);
            this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
            const i3 = i * 3;
            this._preExpPos[i3] = this.dummy.position.x;
            this._preExpPos[i3 + 1] = this.dummy.position.y;
            this._preExpPos[i3 + 2] = this.dummy.position.z;
            this._preExpRot[i3] = this.dummy.rotation.x;
            this._preExpRot[i3 + 1] = this.dummy.rotation.y;
            this._preExpRot[i3 + 2] = this.dummy.rotation.z;
            this._preExpScale[i3] = this.dummy.scale.x;
            this._preExpScale[i3 + 1] = this.dummy.scale.y;
            this._preExpScale[i3 + 2] = this.dummy.scale.z;
            this._explPos[i3] = this.dummy.position.x;
            this._explPos[i3 + 1] = this.dummy.position.y;
            this._explPos[i3 + 2] = this.dummy.position.z;
            this._explRot[i3] = this.dummy.rotation.x;
            this._explRot[i3 + 1] = this.dummy.rotation.y;
            this._explRot[i3 + 2] = this.dummy.rotation.z;
            this._explScaleVisible[i] = this.dummy.scale.x > 0.1 ? 1 : 0;
        }

        this.isExploding = true;
        this.explosionTime = 0;
        this.isReassembling = false;

        setTimeout(() => {
            this.isExploding = false;
            this.isReassembling = true;
            this.reassemblyProgress = 0.0;
            this.reassemblyDuration = RENDERER_CONFIG.REASSEMBLY_DURATION;

            this._reassemblyStartPos = new Float32Array(this._explPos!);
            this._reassemblyStartRot = new Float32Array(this._explRot!);
            this._reassemblyStartScale = new Float32Array(this._preExpScale!);

            this.scene!.traverse((obj: any) => {
                if (obj.isLight && obj.userData.originalIntensity === undefined) {
                    obj.userData.originalIntensity = obj.intensity;
                }
            });

            this._reassemblyLights = [];
            this.scene!.traverse((obj: any) => {
                if (obj.isLight && obj.userData.originalIntensity !== undefined) {
                    this._reassemblyLights!.push(obj);
                }
            });

            this.scene!.fog = new THREE.FogExp2(RENDERER_CONFIG.GHOST_FOG_COLOR, 0);
        }, RENDERER_CONFIG.REASSEMBLY_DELAY);

        setTimeout(() => {
            this.isReassembling = false;
            this.resetExplosion();
            this.enableGhostMode();
            this.gridManager!.numberMeshes.forEach(mesh => mesh.visible = true);
        }, RENDERER_CONFIG.ELIMINATION_DURATION);
    }

    enableGhostMode(): void {
        Logger.log('Renderer', 'Enabling Ghost Mode visuals');
        this.scene!.fog = new THREE.FogExp2(RENDERER_CONFIG.GHOST_FOG_COLOR, RENDERER_CONFIG.GHOST_FOG_DENSITY);
        this.scene!.traverse((obj: any) => {
            if (obj.isLight) {
                if (obj.userData.originalIntensity === undefined) {
                    obj.userData.originalIntensity = obj.intensity;
                }
                obj.intensity = obj.userData.originalIntensity * RENDERER_CONFIG.GHOST_LIGHT_FACTOR;
            }
        });
    }

    disableGhostMode(): void {
        this.scene!.fog = null;
        this.scene!.traverse((obj: any) => {
            if (obj.isLight && obj.userData.originalIntensity !== undefined) {
                obj.intensity = obj.userData.originalIntensity;
            }
        });
    }

    resetExplosion(): void {
        this.isExploding = false;
        this.isReassembling = false;
        this.explosionTime = 0;

        this.endGameEffects!.reset();
        this.gridManager!.resetExplosion();

        this.flagManager!.clearAll();
        for (let x = 0; x < this.game.width; x++) {
            for (let y = 0; y < this.game.height; y++) {
                if (this.game.flags[x][y]) {
                    this.updateFlagVisual(x, y, true);
                }
            }
        }
    }

    animate(): void {
        const now = performance.now();
        const dt = this._lastFrameTime ? Math.min((now - this._lastFrameTime) / 1000, 0.1) : 0.016;
        this._lastFrameTime = now;

        this.cameraController!.update(dt);

        this.particleSystem!.update(dt);
        this.blackHoleEffect!.update(dt);
        this.gridManager!.updateAnimations(dt);

        const hoveredInstanceId = this.inputManager ? this.inputManager.getHoveredInstanceId() : -1;
        if (hoveredInstanceId !== -1) {
            const hoveredY = hoveredInstanceId % this.game.height;
            const hoveredX = Math.floor(hoveredInstanceId / this.game.height);
            this.flagManager!.animate(hoveredX, hoveredY);
        } else {
            this.flagManager!.animate(-1, -1);
        }
        this.updateSelectionBox(hoveredInstanceId);

        this.endGameEffects!.update(this.game.gameOver || this.game.victory);

        if (this.isExploding) {
            this.explosionTime++;
            const gridMesh = this.gridManager!.gridMesh!;
            const explosionVectors = this.gridManager!.explosionVectors;
            const cellCount = this.game.width * this.game.height;
            const pos = this._explPos!;
            const rot = this._explRot!;
            const vis = this._explScaleVisible!;

            for (let i = 0; i < cellCount; i++) {
                if (!vis[i]) continue;
                const i3 = i * 3;
                const vec = explosionVectors[i];
                rot[i3] += RENDERER_CONFIG.EXPLOSION_ROTATION_SPEED * vec.dx;
                rot[i3 + 1] += RENDERER_CONFIG.EXPLOSION_ROTATION_SPEED * vec.dy;
                pos[i3] += RENDERER_CONFIG.EXPLOSION_TRANSLATION_SPEED * vec.dx;
                pos[i3 + 1] += RENDERER_CONFIG.EXPLOSION_TRANSLATION_SPEED * vec.dy;

                this._eulerHelper.set(rot[i3], rot[i3 + 1], rot[i3 + 2]);
                this._quatHelper.setFromEuler(this._eulerHelper);
                this.dummy.position.set(pos[i3], pos[i3 + 1], pos[i3 + 2]);
                this.dummy.quaternion.copy(this._quatHelper);
                this.dummy.scale.set(1, 1, 1);
                this.dummy.updateMatrix();
                gridMesh.setMatrixAt(i, this.dummy.matrix);
            }
            gridMesh.instanceMatrix.needsUpdate = true;
        }

        if (this.isReassembling) {
            this._animateReassembly(dt);
        }

        if (this.blackHoleEffect && this.blackHoleEffect.isActive()) {
            this.distortionPass!.enabled = true;
            this.composer!.render();
        } else {
            if (this.distortionPass) this.distortionPass.enabled = false;
            this.renderer!.render(this.scene!, this.camera!);
        }
    }

    _animateReassembly(dt: number): void {
        this.reassemblyProgress += dt / this.reassemblyDuration;
        if (this.reassemblyProgress > 1.0) this.reassemblyProgress = 1.0;

        const t = this.reassemblyProgress;
        const easeFactor = t * t * t * t * t * t;

        if (this.scene!.fog) {
            (this.scene!.fog as THREE.FogExp2).density = RENDERER_CONFIG.GHOST_FOG_DENSITY * easeFactor;
        }

        const currentLightFactor = 1.0 - ((1.0 - RENDERER_CONFIG.GHOST_LIGHT_FACTOR) * easeFactor);
        const lights = this._reassemblyLights;
        if (lights) {
            for (let i = 0; i < lights.length; i++) {
                (lights[i] as any).intensity = (lights[i] as any).userData.originalIntensity * currentLightFactor;
            }
        }

        const gridMesh = this.gridManager!.gridMesh!;
        const cellCount = this.game.width * this.game.height;
        const startPos = this._reassemblyStartPos!;
        const startRot = this._reassemblyStartRot!;
        const targetPos = this._preExpPos!;
        const targetRot = this._preExpRot!;
        const targetScale = this._preExpScale!;

        for (let i = 0; i < cellCount; i++) {
            const i3 = i * 3;

            this.dummy.position.set(
                startPos[i3] + (targetPos[i3] - startPos[i3]) * easeFactor,
                startPos[i3 + 1] + (targetPos[i3 + 1] - startPos[i3 + 1]) * easeFactor,
                startPos[i3 + 2] + (targetPos[i3 + 2] - startPos[i3 + 2]) * easeFactor
            );

            this.dummy.rotation.set(
                startRot[i3] + (targetRot[i3] - startRot[i3]) * easeFactor,
                startRot[i3 + 1] + (targetRot[i3 + 1] - startRot[i3 + 1]) * easeFactor,
                startRot[i3 + 2] + (targetRot[i3 + 2] - startRot[i3 + 2]) * easeFactor
            );

            this.dummy.scale.set(
                targetScale[i3] * easeFactor + (1.0 - easeFactor),
                targetScale[i3 + 1] * easeFactor + (1.0 - easeFactor),
                targetScale[i3 + 2] * easeFactor + (1.0 - easeFactor)
            );

            this.dummy.updateMatrix();
            gridMesh.setMatrixAt(i, this.dummy.matrix);
        }
        gridMesh.instanceMatrix.needsUpdate = true;
    }

    onWindowResize(): void {
        this.cameraController!.onWindowResize();
        this.renderer!.setSize(window.innerWidth, window.innerHeight);
        if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    dispose(): void {
        this.onGameEnd = null;
        this.renderer!.setAnimationLoop(null);

        if (this.composer) {
            this.renderPass!.dispose();
            if (this.distortionPass) this.distortionPass.dispose();
            if (this.outputPass) this.outputPass.dispose();
        }
        if (this.particleSystem) this.particleSystem.dispose();
        if (this.blackHoleEffect) this.blackHoleEffect.dispose();
        if (this.mediaManager) this.mediaManager.dispose();
        if (this.inputManager) this.inputManager.detachListeners();
        if (this.gridManager) this.gridManager.dispose();
        if (this.flagManager) this.flagManager.dispose();
        if (this.cameraController) this.cameraController.dispose();
        if (this.endGameEffects) this.endGameEffects.dispose();

        this.scene!.traverse((object: any) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach((m: any) => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                } else {
                    if (object.material.map) object.material.map.dispose();
                    object.material.dispose();
                }
            }
        });

        this.renderer!.dispose();
        if (this.container) {
            this.container.innerHTML = '';
        }

        window.removeEventListener('resize', this._boundOnWindowResize);
    }
}
