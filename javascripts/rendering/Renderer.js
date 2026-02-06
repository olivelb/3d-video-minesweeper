import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { SoundManager } from '../audio/SoundManager.js';
import { ParticleSystem } from './ParticleSystem.js';
import { MediaTextureManager } from './MediaTextureManager.js';
import { InputManager } from './InputManager.js';
import { networkManager } from '../network/NetworkManager.js';
import { Events } from '../core/EventBus.js';

export class MinesweeperRenderer {
    constructor(game, containerId, useHoverHelper = true, bgName = 'Unknown', eventBus = null) {
        this.game = game;
        this.container = document.getElementById(containerId);
        // this.scoreManager removed (logic moved to GameController)
        this.useHoverHelper = useHoverHelper;
        this.bgName = bgName;
        this.events = eventBus;

        if (this.events) {
            this.events.on(Events.TOGGLE_MUTE, (isMuted) => {
                if (this.soundManager) this.soundManager.setMute(isMuted);
            });
            this.events.on(Events.FLAG_STYLE_CHANGED, (style) => {
                this.setFlagStyle(style);
            });
        }

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.soundManager = null;
        this.particleSystem = null;

        this.particleSystem = null;

        this.gridMesh = null;
        this.dummy = new THREE.Object3D();
        this.textGroup = new THREE.Group();

        // New Managers
        this.mediaManager = new MediaTextureManager();
        this.inputManager = null; // Initialized after scene creation

        this.flagEmitters = new Map();
        this.flag3DMeshes = new Map(); // For 3D flag models
        this.numberMeshes = [];

        // Flag style: 'particle' (bright/blinking) or '3d' (calm 3D model)
        this.flagStyle = 'particle';

        this.isExploding = false;
        this.explosionTime = 0;
        this.explosionVectors = [];
        this.endTextMesh = null;
        this.endGameTime = 0;
        this.onGameEnd = null;

        // Animation visuals
        this.cameraTargetPos = new THREE.Vector3();
        this.isIntroAnimating = true;
        this.introTime = 0;

        // State for direct instance animation
        this.lastHoveredId = -1;

        // Partner cursor (multiplayer)
        this.partnerCursor = null;

        this._boundOnWindowResize = () => this.onWindowResize();

        this.init();
    }

    async init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1f1f1f);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);

        // Intro Position
        const targetDesc = this.game.height * 25;
        this.cameraTargetPos.set(0, targetDesc, this.game.height * 20);
        this.camera.position.set(0, 1000, 1000); // Start far away

        this.soundManager = new SoundManager(this.camera);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.enabled = false; // Disable during intro

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);
        this.scene.add(this.textGroup);

        // LOAD RESOURCES via Manager
        await this.mediaManager.loadResources(this.bgName);
        // Expose textures for ParticleSystem
        this.textures = this.mediaManager.textures;

        this.particleSystem = new ParticleSystem(this.scene, this.textures);

        // Create reusable 3D flag geometry and material via Manager
        this.mediaManager.create3DFlagAssets();

        this.createGrid();

        // Initialize Input Manager
        this.inputManager = new InputManager(this.renderer, this.camera, this.gridMesh, this.game, this.events);
        // Monkey-patch renderer to handle updates from input manager
        this.renderer.handleGameUpdate = (result) => this.handleGameUpdate(result);

        window.addEventListener('resize', this._boundOnWindowResize, false);
        this.renderer.setAnimationLoop(() => this.animate());
    }

    // Media loading logic removed - delegated to MediaTextureManager

    /**
     * Update the grid mesh cube material with the current media texture
     * Called when switching from placeholder to video texture
     */
    updateCubeMaterial() {
        if (this.gridMesh && this.gridMesh.material && Array.isArray(this.gridMesh.material)) {
            const videoMaterialIndex = 4; // Front face
            this.gridMesh.material[videoMaterialIndex].map = this.mediaTexture;
            this.gridMesh.material[videoMaterialIndex].needsUpdate = true;
        }
    }

    /**
     * Draw the loading placeholder with progress indicator on cubes
     * @param {number} progress - Loading progress 0-100
     */
    _drawLoadingPlaceholder(progress) {
        if (!this._placeholderCtx) return;

        const ctx = this._placeholderCtx;
        const w = 512, h = 512;
        const scale = 4; // Scale factor from 128 to 512

        // Dark background with subtle gradient
        const time = Date.now() / 1000;
        const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
        bgGrad.addColorStop(0, '#2a2a4e');
        bgGrad.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Animated color wave in background
        const waveGrad = ctx.createLinearGradient(0, 0, w, h);
        const hue1 = (time * 20) % 360;
        waveGrad.addColorStop(0, `hsla(${hue1}, 60%, 20%, 0.3)`);
        waveGrad.addColorStop(0.5, `hsla(${(hue1 + 40) % 360}, 60%, 15%, 0.2)`);
        waveGrad.addColorStop(1, `hsla(${(hue1 + 80) % 360}, 60%, 20%, 0.3)`);
        ctx.fillStyle = waveGrad;
        ctx.fillRect(0, 0, w, h);

        // Large spinning ring
        const cx = w / 2;
        const cy = h * 0.38;
        const radius = 60 * scale / 4;

        // Outer glow
        ctx.shadowColor = '#f093fb';
        ctx.shadowBlur = 20;

        // Background circle
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Progress arc (shows actual progress)
        const progressAngle = (progress / 100) * Math.PI * 2;
        if (progress > 0) {
            const progGrad = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
            progGrad.addColorStop(0, '#f093fb');
            progGrad.addColorStop(1, '#f5576c');
            ctx.strokeStyle = progGrad;
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + progressAngle);
            ctx.stroke();
        }

        // Spinning highlight arc
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, time * 4, time * 4 + Math.PI * 0.3);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Percentage in center of ring
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${48}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(progress)}%`, cx, cy);

        // Progress bar below
        const barY = h * 0.65;
        const barH = 16;
        const barW = w * 0.6;
        const barX = (w - barW) / 2;
        const barRadius = 8;

        // Bar background
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, barRadius);
        ctx.fill();

        // Bar fill
        const fillW = Math.max(barRadius * 2, barW * (progress / 100));
        if (progress > 0) {
            const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
            fillGrad.addColorStop(0, '#f093fb');
            fillGrad.addColorStop(1, '#f5576c');
            ctx.fillStyle = fillGrad;
            ctx.beginPath();
            ctx.roundRect(barX, barY, fillW, barH, barRadius);
            ctx.fill();

            // Shine effect on bar
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.roundRect(barX, barY, fillW, barH / 2, [barRadius, barRadius, 0, 0]);
            ctx.fill();
        }

        // Loading text
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${28}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('Chargement vidéo...', w / 2, barY - 20);

        // Animated dots
        const dots = Math.floor(time * 2) % 4;
        ctx.fillStyle = '#aaaaaa';
        ctx.font = `${24}px Arial`;
        ctx.fillText('.'.repeat(dots), w / 2 + 120, barY - 20);
    }

    /**
     * Animate the loading placeholder
     */
    _animateLoadingPlaceholder() {
        if (!this._placeholderCtx || this.videoTextureReady) return;

        this._drawLoadingPlaceholder(this._loadingProgress);

        if (this.mediaTexture && this.mediaTexture.isCanvasTexture) {
            this.mediaTexture.needsUpdate = true;
        }
    }

    /**
     * Create a bomb texture for revealed bombs (when a player is eliminated)
     * @returns {THREE.CanvasTexture}
     */
    _createBombTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Clear with transparency
        ctx.clearRect(0, 0, 128, 128);

        // Draw bomb body (black circle with spikes)
        const cx = 64, cy = 64;
        const radius = 35;

        // Outer glow (red/orange danger glow)
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 20;

        // Main bomb body
        ctx.fillStyle = '#222222';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // Spikes
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#222222';
        const spikeCount = 8;
        for (let i = 0; i < spikeCount; i++) {
            const angle = (i / spikeCount) * Math.PI * 2 - Math.PI / 2;
            const spikeLength = 18;
            const spikeWidth = 8;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(-spikeWidth / 2, -radius + 5);
            ctx.lineTo(0, -radius - spikeLength);
            ctx.lineTo(spikeWidth / 2, -radius + 5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // Inner highlight (gives 3D effect)
        const grad = ctx.createRadialGradient(cx - 10, cy - 10, 0, cx, cy, radius);
        grad.addColorStop(0, 'rgba(100, 100, 100, 0.6)');
        grad.addColorStop(0.5, 'rgba(50, 50, 50, 0.3)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
        ctx.fill();

        // Fuse hole
        ctx.fillStyle = '#444444';
        ctx.beginPath();
        ctx.arc(cx, cy - radius + 8, 6, 0, Math.PI * 2);
        ctx.fill();

        // Fuse
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy - radius + 2);
        ctx.quadraticCurveTo(cx + 15, cy - radius - 15, cx + 5, cy - radius - 25);
        ctx.stroke();

        // Spark at fuse tip
        ctx.fillStyle = '#ffaa00';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cx + 5, cy - radius - 25, 5, 0, Math.PI * 2);
        ctx.fill();

        // Red X overlay to indicate "revealed/dead" bomb
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(30, 30);
        ctx.lineTo(98, 98);
        ctx.moveTo(98, 30);
        ctx.lineTo(30, 98);
        ctx.stroke();

        // White border on X for visibility
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, 30);
        ctx.lineTo(98, 98);
        ctx.moveTo(98, 30);
        ctx.lineTo(30, 98);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    }

    /**
     * Set loading progress externally (called by UIManager)
     * @param {number} progress - 0-100
     */
    setLoadingProgress(progress) {
        this._loadingProgress = Math.max(0, Math.min(100, progress));
        this._animateLoadingPlaceholder();
    }

    /**
     * Update the media texture dynamically (for switching between video and image)
     * @param {string} type - 'video' or 'image'
     * @param {HTMLVideoElement|HTMLImageElement} source - The media source element
     */
    updateMediaTexture(type, source) {
        if (!source) return;

        // Dispose old texture to free memory
        if (this.mediaTexture) {
            this.mediaTexture.dispose();
        }

        this.mediaType = type;

        if (type === 'image') {
            // Create a standard texture from the image
            this.mediaTexture = new THREE.Texture(source);
            this.mediaTexture.needsUpdate = true;
        } else {
            // Create a video texture
            this.mediaTexture = new THREE.VideoTexture(source);

            // Check if this is a streaming video (network source)
            const isNetworkStream = source.src && (source.src.startsWith('http') || source.src.startsWith('blob:'));
            if (isNetworkStream) {
                this.setupVideoTextureUpdater(source);
            }
        }

        // Apply common settings
        this.mediaTexture.minFilter = THREE.LinearFilter;
        this.mediaTexture.magFilter = THREE.LinearFilter;
        this.mediaTexture.colorSpace = THREE.SRGBColorSpace;

        // Update the material on the grid mesh (face index 4 is the front face with the video material)
        if (this.gridMesh && this.gridMesh.material && Array.isArray(this.gridMesh.material)) {
            const videoMaterialIndex = 4; // Front face
            this.gridMesh.material[videoMaterialIndex].map = this.mediaTexture;
            this.gridMesh.material[videoMaterialIndex].needsUpdate = true;
        }

        // Keep backwards compatibility reference
        this.videoTexture = this.mediaTexture;
    }

    createGrid() {
        const geometry = new THREE.BoxGeometry(20, 20, 20);
        // Use texture from manager
        const videoMaterial = new THREE.MeshBasicMaterial({ map: this.mediaManager.getBackgroundTexture() });

        videoMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uGridSize = { value: new THREE.Vector2(this.game.width, this.game.height) };
            shader.vertexShader = `
                attribute vec2 aGridPos;
                uniform vec2 uGridSize;
                ${shader.vertexShader}
            `.replace(
                '#include <uv_vertex>',
                `
                #include <uv_vertex>
                vMapUv = (uv + aGridPos) / uGridSize;
                `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `
                #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
                    #ifdef USE_INSTANCING_COLOR
                        diffuseColor.rgb += vInstanceColor;
                    #else
                        diffuseColor.rgb += vColor;
                    #endif
                #endif
                `
            );
        };

        const materials = [
            new THREE.MeshBasicMaterial({ color: 0x000000 }), // Sides (black by default)
            new THREE.MeshBasicMaterial({ color: 0x000000 }),
            new THREE.MeshBasicMaterial({ color: 0x000000 }),
            new THREE.MeshBasicMaterial({ color: 0x000000 }),
            videoMaterial,                                    // Front (uses additive instance color)
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        ];

        // We use the same material for sides but with additive colors to make them glow on hover
        // Wait, if sides are MeshBasicMaterial(0x000000), they won't show anything even with vInstanceColor 
        // because color_fragment does Multiplication by default in standard MeshBasic.
        // Let's make sides white materials too and handle them additively in another way or just use one material?
        // Actually, let's keep it simple: 
        // Materials 0-3, 5 are pure white materials. 
        // Instance color 0x000000 makes them black. 
        // Instance color highlight makes them glow.
        for (let j = 0; j < 6; j++) {
            if (j !== 4) {
                materials[j] = new THREE.MeshBasicMaterial({ color: 0xffffff });
            }
        }

        this.gridMesh = new THREE.InstancedMesh(geometry, materials, this.game.width * this.game.height);
        const aGridPos = new Float32Array(this.game.width * this.game.height * 2);

        let i = 0;
        for (let x = 0; x < this.game.width; x++) {
            for (let y = 0; y < this.game.height; y++) {
                this.dummy.position.set(
                    -(this.game.width * 10) + x * 22,
                    0,
                    (this.game.height * 10) - y * 22
                );
                this.dummy.rotation.x = -Math.PI / 2;
                this.dummy.updateMatrix();
                this.gridMesh.setMatrixAt(i, this.dummy.matrix);
                this.gridMesh.setColorAt(i, new THREE.Color(0x000000)); // Black = Original (no addition)

                aGridPos[i * 2] = x;
                aGridPos[i * 2 + 1] = y;

                this.explosionVectors[i] = {
                    dx: 0.05 * (0.5 - Math.random()),
                    dy: 0.05 * (0.5 - Math.random())
                };
                i++;
            }
        }

        this.gridMesh.geometry.setAttribute('aGridPos', new THREE.InstancedBufferAttribute(aGridPos, 2));
        this.scene.add(this.gridMesh);
    }

    createSelectionBox() {
        const geometry = new THREE.BoxGeometry(22, 22, 22);
        const edges = new THREE.EdgesGeometry(geometry);
        this.selectionBox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffff00 }));
        this.selectionBox.visible = false;
        this.scene.add(this.selectionBox);
    }

    updateSelectionBox(instanceId) {
        // Reset last hovered if changed
        if (this.lastHoveredId !== instanceId && this.lastHoveredId !== -1) {
            this.resetInstance(this.lastHoveredId);
        }

        if (this.useHoverHelper && instanceId !== -1 && !this.isExploding && !this.game.victory) {
            this.gridMesh.getMatrixAt(instanceId, this.dummy.matrix);
            this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

            if (this.dummy.scale.x > 0.1) {
                const pulse = Math.sin(Date.now() * 0.01);
                const s = 1.0 + pulse * 0.1;
                this.dummy.scale.set(s, s, s);
                this.dummy.updateMatrix();
                this.gridMesh.setMatrixAt(instanceId, this.dummy.matrix);

                // Whiter color on hover
                const colorVal = (pulse + 1.0) * 0.2; // Add modest highlight (0 to 0.4)
                this.gridMesh.setColorAt(instanceId, new THREE.Color(colorVal, colorVal, colorVal));

                this.gridMesh.instanceMatrix.needsUpdate = true;
                this.gridMesh.instanceColor.needsUpdate = true;
                this.lastHoveredId = instanceId;
                return;
            }
        }

        if (instanceId === -1) {
            this.lastHoveredId = -1;
        }
    }

    resetInstance(instanceId) {
        const y = instanceId % this.game.height;
        const x = Math.floor(instanceId / this.game.height);

        // Check if revealed
        if (this.game.visibleGrid[x][y] !== -1) {
            this.dummy.scale.set(0, 0, 0);
        } else {
            this.dummy.scale.set(1, 1, 1);
        }

        this.dummy.position.set(
            -(this.game.width * 10) + x * 22,
            0,
            (this.game.height * 10) - y * 22
        );
        this.dummy.rotation.x = -Math.PI / 2;
        this.dummy.rotation.y = 0;
        this.dummy.rotation.z = 0;
        this.dummy.updateMatrix();
        this.gridMesh.setMatrixAt(instanceId, this.dummy.matrix);
        this.gridMesh.setColorAt(instanceId, new THREE.Color(0x000000)); // Back to no addition
        this.gridMesh.instanceMatrix.needsUpdate = true;
        this.gridMesh.instanceColor.needsUpdate = true;
    }

    // onMouseMove removed - delegated to InputManager

    // Partner cursor methods removed

    handleGameUpdate(result) {
        if (result.type === 'reveal' || result.type === 'win') {
            result.changes.forEach(change => {
                this.updateCellVisual(change.x, change.y, change.value);
            });
            // Click sound removed - only video sound
            if (result.type === 'win') this.triggerWin();
        } else if (result.type === 'explode') {
            // Explosion sound removed - only video sound
            this.triggerExplosion();
        } else if (result.type === 'flag') {
            // Flag sound removed - only video sound
            this.updateFlagVisual(result.x, result.y, result.active);
        }
    }

    /**
     * Affiche un indice visuel sur une case
     * @param {number} x 
     * @param {number} y 
     * @param {string} type 'safe'|'mine'
     */
    showHint(x, y, type) {
        const index = x * this.game.height + y;
        const color = type === 'safe' ? new THREE.Color(0x00ff00) : new THREE.Color(0xff0000);

        // Brief pulse effect
        const originalColor = new THREE.Color(0x000000);
        this.gridMesh.setColorAt(index, color);
        this.gridMesh.instanceColor.needsUpdate = true;

        // Restore color after a short delay if not revealed
        setTimeout(() => {
            if (this.game.visibleGrid[x][y] === -1 && !this.game.gameOver && !this.game.victory) {
                this.gridMesh.setColorAt(index, originalColor);
                this.gridMesh.instanceColor.needsUpdate = true;
            }
        }, 1500);

        // Sound effect
        if (this.soundManager) {
            // Hint sound removed - only video sound
        }

        // Particle effect
        const pos = new THREE.Vector3(
            -(this.game.width * 10) + x * 22,
            20,
            (this.game.height * 10) - y * 22
        );
        this.particleSystem.createEmitter(pos, 'hint', {
            colorStart: color,
            colorEnd: new THREE.Color(0xffffff),
            lifeTime: 1.0
        });
    }

    updateCellVisual(x, y, value) {
        const index = x * this.game.height + y;
        this.gridMesh.getMatrixAt(index, this.dummy.matrix);
        this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
        this.dummy.scale.set(0, 0, 0); // Hide cube
        this.dummy.updateMatrix();
        this.gridMesh.setMatrixAt(index, this.dummy.matrix);
        this.gridMesh.instanceMatrix.needsUpdate = true;

        this.updateFlagVisual(x, y, false);

        // Handle revealed bomb (value 10) - from eliminated player in multiplayer
        if (value === 10) {
            const planeGeo = new THREE.PlaneGeometry(18, 18); // Slightly larger than numbers
            const material = new THREE.MeshBasicMaterial({
                map: this.textures['bomb'],
                transparent: true,
                opacity: 1.0,
                depthWrite: true,
                depthTest: true,
                side: THREE.DoubleSide,
                alphaTest: 0.1
            });
            const mesh = new THREE.Mesh(planeGeo, material);
            mesh.position.set(
                -(this.game.width * 10) + x * 22,
                11,
                (this.game.height * 10) - y * 22
            );
            mesh.rotation.x = -Math.PI / 2;
            mesh.renderOrder = 2; // Render on top
            this.scene.add(mesh);
            this.numberMeshes.push(mesh);
            return;
        }

        if (value > 0 && value <= 8) {
            const planeGeo = new THREE.PlaneGeometry(16, 16);
            const material = new THREE.MeshBasicMaterial({
                map: this.textures[value],
                transparent: true,
                opacity: 1.0,
                depthWrite: true,
                depthTest: true,
                side: THREE.DoubleSide,
                alphaTest: 0.1
            });
            const mesh = new THREE.Mesh(planeGeo, material);
            mesh.position.set(
                -(this.game.width * 10) + x * 22,
                11, // Slightly higher to prevent z-fighting
                (this.game.height * 10) - y * 22
            );
            mesh.rotation.x = -Math.PI / 2;
            mesh.renderOrder = 1; // Render after cubes
            this.scene.add(mesh);
            this.numberMeshes.push(mesh);
        }
    }

    // create3DFlagAssets removed - logic to be moved to MediaTextureManager

    /**
     * Create a single 2D flag mesh at a given position
     */
    create3DFlag(position, x, y) {
        const mesh = new THREE.Mesh(
            this.mediaManager.flag2DGeometry,
            this.mediaManager.flag2DMaterial
        );
        mesh.position.copy(position);
        mesh.position.y = 12; // Slightly above cube surface
        mesh.rotation.x = -Math.PI / 2; // Horizontal like numbers
        mesh.userData.gridX = x;
        mesh.userData.gridY = y;
        mesh.userData.baseY = 12;
        mesh.renderOrder = 1; // Render after cubes
        return mesh;
    }

    updateFlagVisual(x, y, active) {
        const key = `${x},${y}`;
        const pos = new THREE.Vector3(
            -(this.game.width * 10) + x * 22,
            0,
            (this.game.height * 10) - y * 22
        );

        if (active) {
            if (this.flagStyle === 'particle') {
                // Original particle effect
                pos.y = 20;
                const emitter = this.particleSystem.createEmitter(pos, 'flag');
                this.flagEmitters.set(key, emitter);
            } else {
                // 2D flag model
                const flag = this.create3DFlag(pos, x, y);
                this.scene.add(flag);
                this.flag3DMeshes.set(key, flag);
            }
        } else {
            // Remove particle emitter if exists
            if (this.flagEmitters.has(key)) {
                const emitter = this.flagEmitters.get(key);
                emitter.alive = false;
                this.flagEmitters.delete(key);
            }
            // Remove 3D flag if exists
            if (this.flag3DMeshes.has(key)) {
                const flag = this.flag3DMeshes.get(key);
                this.scene.remove(flag);
                this.flag3DMeshes.delete(key);
            }
        }
    }

    /**
     * Set flag visual style between particle and 3D
     * @param {string} style - 'particle' or '3d'
     */
    setFlagStyle(style) {
        // Update style
        this.flagStyle = style;

        // Collect current flag positions from game state
        const activeFlags = [];
        for (let x = 0; x < this.game.width; x++) {
            for (let y = 0; y < this.game.height; y++) {
                if (this.game.flags[x][y]) {
                    activeFlags.push({ x, y });
                }
            }
        }

        // Clear all current visuals
        this.flagEmitters.forEach(emitter => emitter.alive = false);
        this.flagEmitters.clear();

        this.flag3DMeshes.forEach(flag => this.scene.remove(flag));
        this.flag3DMeshes.clear();

        // Recreate with new style
        for (const { x, y } of activeFlags) {
            this.updateFlagVisual(x, y, true);
        }

        return this.flagStyle;
    }

    triggerExplosion() {
        if (this.isExploding) return;
        this.isExploding = true;
        this.showText("PERDU", 0xff0000);
        this.numberMeshes.forEach(mesh => mesh.visible = false);
        this.particleSystem.stopAll();

        // Clear all flags (particle and 2D)
        this.flagEmitters.forEach(emitter => emitter.alive = false);
        this.flagEmitters.clear();
        this.flag3DMeshes.forEach(flag => this.scene.remove(flag));
        this.flag3DMeshes.clear();

        // Hide UIs
        this.updateUIOverlay(false);

        // Notify GameController
        if (this.events) {
            this.events.emit(Events.GAME_OVER, { victory: false });
        }
    }

    /**
     * Réinitialise l'état visuel après un retry
     */
    resetExplosion() {
        this.isExploding = false;
        this.explosionTime = 0;
        this.endGameTime = 0; // Fix: reset the auto-return timer

        if (this.endTextMesh) {
            this.scene.remove(this.endTextMesh);
            this.endTextMesh.geometry.dispose();
            this.endTextMesh.material.dispose();
            this.endTextMesh = null;
        }

        // Show number planes again
        this.numberMeshes.forEach(mesh => {
            mesh.visible = true;
        });

        // Re-create flags
        this.flagEmitters.forEach(emitter => {
            emitter.alive = false;
        });
        this.flagEmitters.clear();

        this.flag3DMeshes.forEach(flag => this.scene.remove(flag));
        this.flag3DMeshes.clear();

        for (let x = 0; x < this.game.width; x++) {
            for (let y = 0; y < this.game.height; y++) {
                if (this.game.flags[x][y]) {
                    this.updateFlagVisual(x, y, true);
                }
            }
        }

        this.updateUIOverlay(true);

        // Reset all grid instances to their correct state
        for (let i = 0; i < this.game.width * this.game.height; i++) {
            this.resetInstance(i);
        }
    }

    triggerWin() {
        if (this.game.victory && this.endTextMesh) return; // Already triggered
        this.game.victory = true;
        // Win sound removed - only video sound

        // Notify GameController
        if (this.events) {
            this.events.emit(Events.GAME_OVER, { victory: true });
        }

        this.showText("BRAVO", 0x00ff00);
        this.gridMesh.visible = false;
        this.numberMeshes.forEach(mesh => mesh.visible = false);
        this.particleSystem.stopAll();

        // Clear all flags (particle and 2D)
        this.flagEmitters.forEach(emitter => emitter.alive = false);
        this.flagEmitters.clear();
        this.flag3DMeshes.forEach(flag => this.scene.remove(flag));
        this.flag3DMeshes.clear();

        this.updateUIOverlay(false);

        // Fireworks
        for (let i = 0; i < 20; i++) {
            const pos = new THREE.Vector3(
                (Math.random() - 0.5) * 200,
                (Math.random() - 0.5) * 100,
                (Math.random() - 0.5) * 200
            );
            const colorStart = new THREE.Color(Math.random(), Math.random(), Math.random());
            const colorEnd = new THREE.Color(Math.random(), Math.random(), Math.random());

            this.particleSystem.createEmitter(pos, 'firework', {
                colorStart, colorEnd, lifeTime: 2.0 + Math.random() * 3.0
            });
        }
    }

    /**
     * Calculate click timing analytics for deep analysis
     * @returns {Object} Click timing metrics
     */
    getClickAnalytics() {
        if (this.clickTimestamps.length === 0) {
            return { avgDecisionTime: 0, maxPause: 0, clickCount: 0, hesitations: 0 };
        }

        const deltas = this.clickTimestamps.map(c => c.delta);
        const avgDecisionTime = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
        const maxPause = Math.max(...deltas);

        // Count "hesitations" - pauses longer than 5 seconds
        const hesitations = deltas.filter(d => d > 5000).length;

        return {
            avgDecisionTime: avgDecisionTime,
            maxPause: maxPause,
            clickCount: this.clickTimestamps.length,
            hesitations: hesitations
        };
    }

    updateUIOverlay(active) {
        // UI overlay updates are handled by external calls to UIManager, 
        // but Renderer might trigger some state changes.
        // For standard DOM elements managed by UIManager, we let the Game loop or UIManager handle polling.
        // We just hide the Renderer specific things here if needed.
    }

    showText(message, color) {
        if (this.endTextMesh) {
            this.scene.remove(this.endTextMesh);
            if (this.endTextMesh.geometry) this.endTextMesh.geometry.dispose();
            if (this.endTextMesh.material) this.endTextMesh.material.dispose();
        }

        const geometry = new TextGeometry(message, {
            font: this.font,
            size: 70, height: 20, curveSegments: 4,
            bevelEnabled: true, bevelThickness: 2, bevelSize: 1.5, bevelSegments: 3
        });
        geometry.computeBoundingBox();
        const centerOffsetX = - 0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x);
        const centerOffsetY = - 0.5 * (geometry.boundingBox.max.y - geometry.boundingBox.min.y);
        geometry.translate(centerOffsetX, centerOffsetY, 0);

        const material = new THREE.MeshBasicMaterial({ color: color });
        const mesh = new THREE.Mesh(geometry, material);
        this.endTextMesh = mesh;
        this.scene.add(mesh);
    }

    animate() {
        const dt = 0.016;

        // Camera Intro
        if (this.isIntroAnimating) {
            this.introTime += dt;
            this.camera.position.lerp(this.cameraTargetPos, 0.05);
            this.camera.lookAt(new THREE.Vector3(0, 0, 0));
            if (this.camera.position.distanceTo(this.cameraTargetPos) < 10 && this.introTime > 1.0) {
                this.isIntroAnimating = false;
                this.controls.enabled = true;
            }
        } else {
            this.controls.update();
        }

        // Particle System
        this.particleSystem.update(dt);

        // Animate 2D flags when cube is hovered
        if (this.hoveredInstanceId !== -1 && this.flagStyle !== 'particle') {
            const hoveredY = this.hoveredInstanceId % this.game.height;
            const hoveredX = Math.floor(this.hoveredInstanceId / this.game.height);
            const pulse = Math.sin(Date.now() * 0.01);

            this.flag3DMeshes.forEach(flag => {
                if (flag.userData.gridX === hoveredX && flag.userData.gridY === hoveredY) {
                    // Pulse the flag on hovered cube
                    const scale = 1.0 + pulse * 0.15;
                    flag.scale.set(scale, scale, 1);
                    flag.position.y = flag.userData.baseY + pulse * 2;
                } else {
                    // Reset other flags
                    flag.scale.set(1, 1, 1);
                    flag.position.y = flag.userData.baseY;
                }
            });
        } else if (this.flagStyle !== 'particle') {
            // Reset all flags when nothing hovered
            this.flag3DMeshes.forEach(flag => {
                flag.scale.set(1, 1, 1);
                flag.position.y = flag.userData.baseY;
            });
        }

        // Hover Effect - Use InputManager's hovered ID
        this.hoveredInstanceId = this.inputManager ? this.inputManager.getHoveredInstanceId() : -1;
        this.updateSelectionBox(this.hoveredInstanceId);

        // End Text Billboard
        if (this.endTextMesh) {
            const distance = 400;
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            this.endTextMesh.position.copy(this.camera.position).add(direction.multiplyScalar(distance));
            this.endTextMesh.quaternion.copy(this.camera.quaternion);
        }

        // Explosion Animation
        if (this.isExploding) {
            this.explosionTime++;
            for (let i = 0; i < this.game.width * this.game.height; i++) {
                this.gridMesh.getMatrixAt(i, this.dummy.matrix);
                this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
                if (this.dummy.scale.x > 0.1) {
                    const vec = this.explosionVectors[i];
                    this.dummy.rotation.x += 10 * vec.dx;
                    this.dummy.rotation.y += 10 * vec.dy;
                    this.dummy.position.x += 200 * vec.dx;
                    this.dummy.position.y += 200 * vec.dy;
                    this.dummy.updateMatrix();
                    this.gridMesh.setMatrixAt(i, this.dummy.matrix);
                }
            }
            this.gridMesh.instanceMatrix.needsUpdate = true;
        }

        // Auto-return
        if (this.game.gameOver || this.game.victory) {
            this.endGameTime++;
            if (this.endGameTime > 300) {
                if (this.events) {
                    this.events.emit(Events.GAME_ENDED);
                }

                // Legacy fallback
                if (this.onGameEnd) {
                    this.onGameEnd();
                }
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    dispose() {
        this.onGameEnd = null;
        this.renderer.setAnimationLoop(null);
        if (this.particleSystem) {
            this.particleSystem.dispose();
        }

        // Dispose Managers
        if (this.mediaManager) this.mediaManager.dispose();
        if (this.inputManager) this.inputManager.detachListeners();

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

        // Remove window listeners
        window.removeEventListener('resize', this._boundOnWindowResize);

        if (this.partnerCursor && this.partnerCursor.parentNode) {
            this.partnerCursor.parentNode.removeChild(this.partnerCursor);
            this.partnerCursor = null;
        }
    }
}
