import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { SoundManager } from './SoundManager.js';
import { ParticleSystem } from './ParticleSystem.js';

export class MinesweeperRenderer {
    constructor(game, containerId, scoreManager = null, useHoverHelper = true, bgName = 'Unknown') {
        this.game = game;
        this.container = document.getElementById(containerId);
        this.scoreManager = scoreManager;
        this.useHoverHelper = useHoverHelper;
        this.bgName = bgName;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.soundManager = null;
        this.particleSystem = null;

        this.gridMesh = null;
        this.dummy = new THREE.Object3D();
        this.textGroup = new THREE.Group();

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredInstanceId = -1;

        this.textures = {};
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

        // Click timing analytics
        this.clickTimestamps = [];
        this.lastClickTime = 0;

        // Bound event listeners for proper removal
        this._boundOnMouseMove = (e) => this.onMouseMove(e);
        this._boundOnMouseClick = (e) => this.onMouseClick(e);
        this._boundOnWindowResize = () => this.onWindowResize();
        this._videoEventListeners = [];

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

        await this.loadResources();

        this.particleSystem = new ParticleSystem(this.scene, this.textures);

        // Create reusable 3D flag geometry and material
        this.create3DFlagAssets();

        this.createGrid();

        window.addEventListener('resize', this._boundOnWindowResize, false);
        this.renderer.domElement.addEventListener('pointerdown', this._boundOnMouseClick, false);
        this.renderer.domElement.addEventListener('pointermove', this._boundOnMouseMove, false);
        this.renderer.setAnimationLoop(() => this.animate());
    }

    async loadResources() {
        const textureLoader = new THREE.TextureLoader();
        const fontLoader = new FontLoader();

        for (let i = 1; i <= 8; i++) {
            this.textures[i] = textureLoader.load(`images/j${i}.png`);
        }
        this.textures['flag'] = textureLoader.load('images/star.png');
        this.textures['particle'] = textureLoader.load('images/flare.png');

        // Initialize media texture - check for custom uploaded image first, then fall back to video
        const customImage = document.getElementById('custom-image-source');
        const video = document.getElementById('image');

        if (customImage && customImage.src && customImage.src !== '' && customImage.src !== window.location.href) {
            // User uploaded an image before starting the game
            this.mediaType = 'image';
            // Wait for image to load if needed
            if (customImage.complete && customImage.naturalWidth > 0) {
                this.mediaTexture = new THREE.Texture(customImage);
                this.mediaTexture.needsUpdate = true;
            } else {
                // Image not loaded yet, create texture and update when loaded
                this.mediaTexture = new THREE.Texture(customImage);
                customImage.onload = () => {
                    this.mediaTexture.needsUpdate = true;
                };
            }
        } else if (video) {
            // Default to video texture
            this.mediaType = 'video';

            // Check if this is a streaming video (network source)
            // Includes: Localhost proxy, Koyeb proxy, Direct YouTube (googlevideo), and generic HTTPS
            const isNetworkStream = video.src && (video.src.startsWith('http') || video.src.startsWith('blob:'));

            if (isNetworkStream) {
                // Check if UIManager already has loading state (video pre-buffered)
                const uiManager = window._minesweeperUIManager;
                const loadingState = uiManager?.getVideoLoadingState?.() || null;
                
                // Only skip placeholder if video has ACTUAL visible frames (dimensions > 0)
                const videoHasFrames = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
                
                if (videoHasFrames) {
                    // Video already has frames - use it directly
                    this.mediaTexture = new THREE.VideoTexture(video);
                    this.mediaTexture.minFilter = THREE.LinearFilter;
                    this.mediaTexture.magFilter = THREE.LinearFilter;
                    this.mediaTexture.colorSpace = THREE.SRGBColorSpace;
                    this.videoTextureReady = true;
                    this.videoTexture = this.mediaTexture;
                    this.setupVideoTextureUpdater(video);
                    video.play().catch(() => {});
                } else {
                    // Create a high-quality placeholder canvas for loading animation
                    const canvas = document.createElement('canvas');
                    canvas.width = 512;
                    canvas.height = 512;
                    this._placeholderCanvas = canvas;
                    this._placeholderCtx = canvas.getContext('2d');
                    
                    // Continue from UIManager's progress if available
                    this._loadingProgress = loadingState?.progress || 0;
                    this._loadingStartTime = loadingState?.startTime || Date.now();
                    this._drawLoadingPlaceholder(this._loadingProgress);
                    this.mediaTexture = new THREE.CanvasTexture(canvas);
                    this.mediaTexture.minFilter = THREE.LinearFilter;
                    this.mediaTexture.magFilter = THREE.LinearFilter;
                    this.placeholderTexture = this.mediaTexture;

                    // Function to check if video has ACTUAL visible frames
                    const hasVideoFrames = () => {
                        // Must have both data (readyState >= 2) AND dimensions
                        return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
                    };

                    // When video is ready with actual frames, switch to video texture
                    const switchToVideoTexture = () => {
                        if (this.videoTextureReady) return; // Already switched

                        // Dispose placeholder texture immediately
                        if (this.mediaTexture) {
                            this.mediaTexture.dispose();
                        }
                        this._placeholderCanvas = null;
                        this._placeholderCtx = null;

                        this.videoTextureReady = true;
                        this.mediaTexture = new THREE.VideoTexture(video);
                        this.mediaTexture.minFilter = THREE.LinearFilter;
                        this.mediaTexture.magFilter = THREE.LinearFilter;
                        this.mediaTexture.colorSpace = THREE.SRGBColorSpace;
                        this.videoTexture = this.mediaTexture;
                        this.setupVideoTextureUpdater(video);
                        this.updateCubeMaterial();
                    };

                    const onVideoReady = () => {
                        if (hasVideoFrames()) {
                            switchToVideoTexture();
                            video.removeEventListener('loadeddata', onVideoReady);
                            video.removeEventListener('canplay', onVideoReady);
                            video.removeEventListener('playing', onVideoReady);
                            if (this.videoCheckInterval) {
                                clearInterval(this.videoCheckInterval);
                                this.videoCheckInterval = null;
                            }
                        }
                    };
                    
                    // Track loading progress - realistic curve for ~12s total (11s extraction + streaming)
                    const updateProgress = () => {
                        const elapsed = (Date.now() - this._loadingStartTime) / 1000;
                        // Realistic curve: 50% at 5s, 80% at 10s, 95% at 12s
                        const simulatedProgress = Math.min(95, 100 * (1 - Math.exp(-elapsed / 5)));
                        
                        // Also check actual buffer if available
                        let bufferProgress = 0;
                        if (video.buffered && video.buffered.length > 0 && video.duration > 0) {
                            const buffered = video.buffered.end(video.buffered.length - 1);
                            bufferProgress = Math.min(95, (buffered / Math.min(10, video.duration)) * 100);
                        }
                        
                        // Use the higher of simulated or actual
                        this.setLoadingProgress(Math.max(simulatedProgress, bufferProgress));
                    };

                    // Check if already ready (for replay with same video)
                    if (hasVideoFrames()) {
                        switchToVideoTexture();
                    } else {
                        // Listen for events
                        video.addEventListener('loadeddata', onVideoReady);
                        video.addEventListener('canplay', onVideoReady);
                        video.addEventListener('playing', onVideoReady);

                        // Also poll periodically in case events are missed (some browsers/streams)
                        this.videoCheckInterval = setInterval(() => {
                            if (hasVideoFrames()) {
                                onVideoReady();
                            }
                            // Update progress and animate
                            updateProgress();
                            this._animateLoadingPlaceholder();
                        }, 100);

                        // Timeout after 15 seconds - realistic for yt-dlp extraction
                        setTimeout(() => {
                            if (this.videoCheckInterval) {
                                clearInterval(this.videoCheckInterval);
                                this.videoCheckInterval = null;
                            }
                            // Force switch if video has ANY data
                            if (!this.videoTextureReady && video.readyState >= 1) {
                                switchToVideoTexture();
                            }
                        }, 15000);
                    }

                    // Try to play
                    video.play().catch(() => { });
                } // End of placeholder else block
            } else {
                this.mediaTexture = new THREE.VideoTexture(video);
            }
        }

        if (this.mediaTexture) {
            this.mediaTexture.minFilter = THREE.LinearFilter;
            this.mediaTexture.magFilter = THREE.LinearFilter;
            this.mediaTexture.colorSpace = THREE.SRGBColorSpace;
        }
        // Keep reference for backwards compatibility
        this.videoTexture = this.mediaTexture;

        return new Promise((resolve) => {
            fontLoader.load('https://unpkg.com/three@0.160.0/examples/fonts/optimer_bold.typeface.json', (font) => {
                this.font = font;
                resolve();
            });
        });
    }

    /**
     * Wait for video element to have enough data to start playing
     * @param {HTMLVideoElement} video
     * @returns {Promise<void>}
     */
    waitForVideoReady(video) {
        return new Promise((resolve) => {
            // If video already has data, resolve immediately
            if (video.readyState >= 2) { // HAVE_CURRENT_DATA or higher
                resolve();
                return;
            }

            const onCanPlay = () => {
                video.removeEventListener('canplay', onCanPlay);
                video.removeEventListener('loadeddata', onCanPlay);
                video.removeEventListener('error', onError);
                resolve();
            };

            const onError = () => {
                video.removeEventListener('canplay', onCanPlay);
                video.removeEventListener('loadeddata', onCanPlay);
                video.removeEventListener('error', onError);
                console.warn('Video failed to load, continuing anyway');
                resolve();
            };

            video.addEventListener('canplay', onCanPlay);
            video.addEventListener('loadeddata', onCanPlay);
            video.addEventListener('error', onError);

            // Timeout after 10 seconds
            setTimeout(() => {
                video.removeEventListener('canplay', onCanPlay);
                video.removeEventListener('loadeddata', onCanPlay);
                video.removeEventListener('error', onError);
                console.warn('Video load timeout, continuing anyway');
                resolve();
            }, 10000);
        });
    }

    /**
     * Set up periodic texture updates for streaming video sources
     * @param {HTMLVideoElement} video
     */
    setupVideoTextureUpdater(video) {
        // Force texture updates when video time updates
        const onTimeUpdate = () => {
            if (this.mediaTexture) {
                this.mediaTexture.needsUpdate = true;
            }
        };
        video.addEventListener('timeupdate', onTimeUpdate);
        this._videoEventListeners.push({ element: video, type: 'timeupdate', listener: onTimeUpdate });

        // Also update on play
        const onPlay = () => {
            if (this.mediaTexture) {
                this.mediaTexture.needsUpdate = true;
            }
        };
        video.addEventListener('play', onPlay);
        this._videoEventListeners.push({ element: video, type: 'play', listener: onPlay });
    }

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
        const bgGrad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w * 0.7);
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
        const videoMaterial = new THREE.MeshBasicMaterial({ map: this.mediaTexture });

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

    onMouseMove(event) {
        if (this.game.gameOver || this.game.victory) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersection = this.raycaster.intersectObject(this.gridMesh);

        if (intersection.length > 0) {
            this.hoveredInstanceId = intersection[0].instanceId;
        } else {
            this.hoveredInstanceId = -1;
        }
    }

    async onMouseClick(event) {
        if (this.game.gameOver || this.game.victory) return;

        // Use cached hover if available, otherwise arraycast
        if (this.hoveredInstanceId === -1) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersection = this.raycaster.intersectObject(this.gridMesh);
            if (intersection.length > 0) this.hoveredInstanceId = intersection[0].instanceId;
        }

        if (this.hoveredInstanceId !== -1) {
            const instanceId = this.hoveredInstanceId;
            const y = instanceId % this.game.height;
            const x = Math.floor(instanceId / this.game.height);

            if (event.button === 0) {
                // Handling Async Reveal with UI
                if (this.game.firstClick && this.game.noGuessMode) {
                    const loadingOverlay = document.getElementById('loading-overlay');
                    const loadingDetails = document.getElementById('loading-details');
                    const cancelBtn = document.getElementById('cancel-gen-btn');

                    loadingOverlay.style.display = 'flex';
                    loadingDetails.textContent = "Initialisation...";

                    const onProgress = (attempt, max) => {
                        loadingDetails.textContent = `Tentative ${attempt} / ${max}`;
                    };

                    // Wire up cancel button
                    const cancelHandler = () => {
                        this.game.cancelGeneration = true;
                    };
                    cancelBtn.onclick = cancelHandler;

                    try {
                        const result = await this.game.reveal(x, y, onProgress);
                        this.handleGameUpdate(result);
                    } catch (e) {
                        console.error("Error during generation", e);
                    } finally {
                        loadingOverlay.style.display = 'none';
                        cancelBtn.onclick = null; // cleanup
                    }
                } else {
                    // Standard click (fast)
                    const result = await this.game.reveal(x, y);
                    this.handleGameUpdate(result);
                }
            } else if (event.button === 2) {
                const result = this.game.toggleFlag(x, y);
                this.handleGameUpdate(result);
            }
        }
    }

    handleGameUpdate(result) {
        // Track click timing for analytics
        const now = Date.now();

        // For the first click, use gameStartTime if available, otherwise use a default
        if (this.lastClickTime === 0) {
            // First click - calculate delta from game start time
            const startTime = this.game.gameStartTime || now;
            const delta = now - startTime;
            // Only record if it's a meaningful decision time (at least 100ms)
            if (delta >= 100) {
                this.clickTimestamps.push({
                    time: now,
                    delta: delta,
                    type: result.type
                });
            }
        } else {
            const delta = now - this.lastClickTime;
            this.clickTimestamps.push({
                time: now,
                delta: delta,
                type: result.type
            });
        }
        this.lastClickTime = now;

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

        if (value > 0) {
            const planeGeo = new THREE.PlaneGeometry(16, 16);
            const material = new THREE.MeshBasicMaterial({
                map: this.textures[value],
                transparent: true,
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(planeGeo, material);
            mesh.position.set(
                -(this.game.width * 10) + x * 22,
                10,
                (this.game.height * 10) - y * 22
            );
            mesh.rotation.x = -Math.PI / 2;
            this.scene.add(mesh);
            this.numberMeshes.push(mesh);
        }
    }

    /**
     * Create reusable 2D flag geometry and material (same size as numbers: 16x16)
     */
    create3DFlagAssets() {
        // 2D horizontal plane, same size as number textures
        this.flag2DGeometry = new THREE.PlaneGeometry(16, 16);

        // Create a canvas texture for the flag icon - bold stylized design
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Clear with full transparency
        ctx.clearRect(0, 0, 128, 128);

        // Outer glow effect (makes it visible on any background)
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Bold triangular flag - large and visible
        ctx.fillStyle = '#ff2222';
        ctx.beginPath();
        ctx.moveTo(20, 15);      // Top-left of flag
        ctx.lineTo(108, 45);     // Right point
        ctx.lineTo(20, 75);      // Bottom-left of flag
        ctx.closePath();
        ctx.fill();

        // Inner highlight
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ff6666';
        ctx.beginPath();
        ctx.moveTo(25, 25);
        ctx.lineTo(75, 42);
        ctx.lineTo(25, 55);
        ctx.closePath();
        ctx.fill();

        // Bold white border for visibility
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(20, 15);
        ctx.lineTo(108, 45);
        ctx.lineTo(20, 75);
        ctx.closePath();
        ctx.stroke();

        // Pole - thick and visible
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(12, 10, 8, 108);
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(12, 10, 4, 108);

        this.flag2DTexture = new THREE.CanvasTexture(canvas);
        this.flag2DTexture.minFilter = THREE.LinearFilter;
        this.flag2DTexture.magFilter = THREE.LinearFilter;
        this.flag2DMaterial = new THREE.MeshBasicMaterial({
            map: this.flag2DTexture,
            transparent: true,
            opacity: 1.0,
            depthTest: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
    }

    /**
     * Create a single 2D flag mesh at a given position
     */
    create3DFlag(position, x, y) {
        const mesh = new THREE.Mesh(this.flag2DGeometry, this.flag2DMaterial);
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
     * Toggle flag visual style between particle and 3D
     * Can be called during gameplay
     */
    toggleFlagStyle() {
        // Switch style
        this.flagStyle = this.flagStyle === 'particle' ? '3d' : 'particle';

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

        // Track loss analytics
        if (this.scoreManager) {
            this.scoreManager.trackGameEvent({
                type: 'loss',
                background: this.bgName,
                width: this.game.width,
                height: this.game.height,
                bombs: this.game.bombCount,
                time: this.game.getElapsedTime(),
                clickData: this.getClickAnalytics()
            });
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
        this.game.victory = true;
        // Win sound removed - only video sound

        if (this.scoreManager) {
            const finalTime = this.game.getElapsedTime();
            const options = {
                noGuessMode: this.game.noGuessMode,
                hintCount: this.game.hintCount,
                retryCount: this.game.retryCount
            };
            const finalScore = this.scoreManager.calculateScore(
                this.game.width, this.game.height, this.game.bombCount, finalTime, options
            );
            this.game.finalScore = finalScore;
            this.scoreManager.saveScore({
                width: this.game.width,
                height: this.game.height,
                bombs: this.game.bombCount,
                time: finalTime,
                score: finalScore,
                noGuessMode: this.game.noGuessMode,
                hintCount: this.game.hintCount,
                retryCount: this.game.retryCount,
                background: this.bgName
            });

            // Track win analytics
            this.scoreManager.trackGameEvent({
                type: 'win',
                background: this.bgName,
                width: this.game.width,
                height: this.game.height,
                bombs: this.game.bombCount,
                time: finalTime,
                clickData: this.getClickAnalytics()
            });
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

        // Hover Effect
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
            if (this.endGameTime > 300 && this.onGameEnd) {
                this.onGameEnd();
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

        // Clean up video check interval
        if (this.videoCheckInterval) {
            clearInterval(this.videoCheckInterval);
            this.videoCheckInterval = null;
        }

        // Dispose all managed textures
        Object.values(this.textures).forEach(tex => {
            if (tex) tex.dispose();
        });
        if (this.mediaTexture) this.mediaTexture.dispose();
        if (this.flag2DTexture) this.flag2DTexture.dispose();
        if (this.placeholderTexture) this.placeholderTexture.dispose();

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

        // Remove video element listeners
        this._videoEventListeners.forEach(({ element, type, listener }) => {
            element.removeEventListener(type, listener);
        });
        this._videoEventListeners = [];

        // Remove renderer element listeners
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.removeEventListener('pointerdown', this._boundOnMouseClick);
            this.renderer.domElement.removeEventListener('pointermove', this._boundOnMouseMove);
        }
    }
}
