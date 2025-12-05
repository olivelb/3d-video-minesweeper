import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

export class MinesweeperRenderer {
    constructor(game, containerId) {
        this.game = game;
        this.container = document.getElementById(containerId);

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.gridMesh = null;
        this.dummy = new THREE.Object3D(); // Pour manipuler les matrices des instances
        this.textGroup = new THREE.Group(); // Groupe pour le texte rotatif

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.textures = {};
        this.particles = []; // Liste des systèmes de particules actifs
        this.flagEmitters = new Map(); // Map<key, ParticleSystem> pour les drapeaux
        this.numberMeshes = [];

        this.isExploding = false;
        this.explosionTime = 0;
        this.explosionVectors = []; // Stocke dx, dy pour chaque cube
        this.endTextMesh = null; // Text mesh for win/lose message
        this.endGameTime = 0; // Timer for auto-return to menu
        this.onGameEnd = null; // Callback when game ends and should return to menu

        this.init();
    }

    async init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1f1f1f);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);
        this.camera.position.set(0, this.game.height * 25, this.game.height * 20);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);
        this.scene.add(this.textGroup); // Ajouter le groupe de texte à la scène

        await this.loadResources();
        this.createGrid();

        window.addEventListener('resize', () => this.onWindowResize(), false);
        this.renderer.domElement.addEventListener('pointerdown', (e) => this.onMouseClick(e), false);
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

        const video = document.getElementById('image');
        if (video) {
            this.videoTexture = new THREE.VideoTexture(video);
            this.videoTexture.minFilter = THREE.LinearFilter;
            this.videoTexture.magFilter = THREE.LinearFilter;
            this.videoTexture.colorSpace = THREE.SRGBColorSpace;
        }

        return new Promise((resolve) => {
            fontLoader.load('https://unpkg.com/three@0.160.0/examples/fonts/optimer_bold.typeface.json', (font) => {
                this.font = font;
                resolve();
            });
        });
    }

    createGrid() {
        const geometry = new THREE.BoxGeometry(20, 20, 20);
        const videoMaterial = new THREE.MeshBasicMaterial({ map: this.videoTexture });

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
        };

        const materials = [
            new THREE.MeshBasicMaterial({ color: 0x000000 }),
            new THREE.MeshBasicMaterial({ color: 0x000000 }),
            new THREE.MeshBasicMaterial({ color: 0x000000 }),
            new THREE.MeshBasicMaterial({ color: 0x000000 }),
            videoMaterial,
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        ];

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
                this.gridMesh.setColorAt(i, new THREE.Color(0xffffff));

                aGridPos[i * 2] = x;
                aGridPos[i * 2 + 1] = y;

                // Pré-calcul des vecteurs d'explosion comme dans l'original
                // object.dx = 0.05 * (0.5 - Math.random());
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

    onMouseClick(event) {
        // After game ends, don't handle clicks - let user explore freely
        if (this.game.gameOver || this.game.victory) {
            return;
        }

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersection = this.raycaster.intersectObject(this.gridMesh);

        if (intersection.length > 0) {
            const instanceId = intersection[0].instanceId;
            const y = instanceId % this.game.height;
            const x = Math.floor(instanceId / this.game.height);

            if (event.button === 0) {
                const result = this.game.reveal(x, y);
                this.handleGameUpdate(result);
            } else if (event.button === 2) {
                const result = this.game.toggleFlag(x, y);
                this.handleGameUpdate(result);
            }
        }
    }

    handleGameUpdate(result) {
        if (result.type === 'reveal' || result.type === 'win') {
            result.changes.forEach(change => {
                this.updateCellVisual(change.x, change.y, change.value);
            });
            if (result.type === 'win') this.triggerWin();
        } else if (result.type === 'explode') {
            this.triggerExplosion();
        } else if (result.type === 'flag') {
            this.updateFlagVisual(result.x, result.y, result.active);
        }
    }

    updateCellVisual(x, y, value) {
        const index = x * this.game.height + y;
        this.gridMesh.getMatrixAt(index, this.dummy.matrix);
        this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.gridMesh.setMatrixAt(index, this.dummy.matrix);
        this.gridMesh.instanceMatrix.needsUpdate = true;

        // Retirer le drapeau si présent (cas où on révèle une case flaggée par erreur ou victoire)
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

    updateFlagVisual(x, y, active) {
        const key = `${x},${y}`;
        if (active) {
            // Créer un émetteur de particules (Fountain) comme l'original
            const pos = new THREE.Vector3(
                -(this.game.width * 10) + x * 22,
                20,
                (this.game.height * 10) - y * 22
            );
            const emitter = this.createParticleEmitter(pos, 'flag');
            this.flagEmitters.set(key, emitter);
        } else {
            if (this.flagEmitters.has(key)) {
                const emitter = this.flagEmitters.get(key);
                emitter.alive = false; // Arrêter d'émettre
                this.flagEmitters.delete(key);
            }
        }
    }

    createParticleEmitter(position, type, options = {}) {
        // Configuration basée sur l'original
        let config = type === 'flag' ? {
            count: 1000,
            texture: this.textures['flag'],
            colorStart: new THREE.Color('yellow'),
            colorEnd: new THREE.Color('red'),
            sizeStart: 10,
            sizeEnd: 0,
            lifeTime: 0.5, // maxAge 0.1 dans original mais un peu court
            rate: 10, // particules par frame
            speed: 50,
            spread: 0
        } : { // Fireworks
            count: 3000,
            texture: this.textures['particle'],
            colorStart: new THREE.Color('blue'),
            colorEnd: new THREE.Color('red'),
            sizeStart: 5,
            sizeEnd: 50,
            lifeTime: 2.0,
            rate: 0, // Burst
            speed: 200,
            spread: 100
        };

        // Appliquer les options personnalisées
        if (options) {
            Object.assign(config, options);
        }

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(config.count * 3);
        const colors = new Float32Array(config.count * 3);
        const sizes = new Float32Array(config.count);

        // UserData pour la simulation
        const velocities = new Float32Array(config.count * 3);
        const ages = new Float32Array(config.count);
        const lives = new Float32Array(config.count); // 1 = vivant, 0 = mort

        // Initialize all particles off-screen with zero colors to prevent bright point at origin
        for (let i = 0; i < config.count; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = -10000; // Far below the scene
            positions[i * 3 + 2] = 0;
            // Set colors to 0 (black/invisible with additive blending)
            colors[i * 3] = 0;
            colors[i * 3 + 1] = 0;
            colors[i * 3 + 2] = 0;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            map: config.texture,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            size: config.sizeStart
        });

        // Shader modification pour supporter la taille par vertex si besoin, 
        // mais PointsMaterial standard utilise 'size' uniforme ou 'size' attribute si activé ?
        // Three.js PointsMaterial ne supporte pas size attribute par défaut sans shader modif.
        // On va faire simple : taille uniforme ou on accepte que ça ne change pas trop.
        // Pour faire "exactement" comme l'original (taille qui change), il faudrait un ShaderMaterial custom.
        // On va utiliser une taille moyenne pour l'instant pour simplifier sans Shader complexe.
        material.size = config.sizeStart;

        const points = new THREE.Points(geometry, material);
        this.scene.add(points);

        const system = {
            mesh: points,
            config: config,
            velocities: velocities,
            ages: ages,
            lives: lives,
            activeCount: 0,
            alive: true, // Si l'émetteur est actif
            origin: position.clone() // Stocker la position d'origine pour l'émission continue
        };

        // Initialiser tout à "mort"
        for (let i = 0; i < config.count; i++) lives[i] = 0;

        // Si c'est un burst (Fireworks), on lance tout tout de suite
        if (type !== 'flag') {
            for (let i = 0; i < config.count; i++) {
                this.spawnParticle(system, i, position);
            }
        }

        this.particles.push(system);
        return system;
    }

    spawnParticle(system, index, origin) {
        const positions = system.mesh.geometry.attributes.position.array;
        const velocities = system.velocities;
        const lives = system.lives;
        const ages = system.ages;

        lives[index] = 1;
        ages[index] = 0;

        // Position
        positions[index * 3] = origin.x;
        positions[index * 3 + 1] = origin.y;
        positions[index * 3 + 2] = origin.z;

        // Vitesse aléatoire sphérique
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = system.config.speed * (0.5 + Math.random() * 0.5);

        velocities[index * 3] = speed * Math.sin(phi) * Math.cos(theta);
        velocities[index * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
        velocities[index * 3 + 2] = speed * Math.cos(phi);
    }

    triggerExplosion() {
        this.isExploding = true;
        this.showText("YOU LOST", 0xff0000);
        this.numberMeshes.forEach(mesh => mesh.visible = false);
        this.flagEmitters.forEach(emitter => emitter.alive = false);
    }

    triggerWin() {
        this.game.victory = true;
        this.showText("YOU WIN", 0x00ff00);

        // Cacher la grille et les nombres
        this.gridMesh.visible = false;
        this.numberMeshes.forEach(mesh => mesh.visible = false);
        this.flagEmitters.forEach(emitter => emitter.alive = false);

        // 20 Feux d'artifice variés comme l'original
        for (let i = 0; i < 20; i++) {
            const pos = new THREE.Vector3(
                (Math.random() - 0.5) * 200,
                (Math.random() - 0.5) * 100,
                (Math.random() - 0.5) * 200
            );

            // Couleurs aléatoires
            const colorStart = new THREE.Color(Math.random(), Math.random(), Math.random());
            const colorEnd = new THREE.Color(Math.random(), Math.random(), Math.random());
            const lifeTime = 2.0 + Math.random() * 8.0; // De 2 à 10 secondes

            this.createParticleEmitter(pos, 'firework', {
                colorStart, colorEnd, lifeTime
            });
        }
    }

    showText(message, color) {
        const geometry = new TextGeometry(message, {
            font: this.font,
            size: 70, // Taille originale
            height: 20,
            curveSegments: 4,
            bevelEnabled: true,
            bevelThickness: 2,
            bevelSize: 1.5,
            bevelSegments: 3
        });

        geometry.computeBoundingBox();
        const centerOffsetX = - 0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x);
        const centerOffsetY = - 0.5 * (geometry.boundingBox.max.y - geometry.boundingBox.min.y);
        geometry.translate(centerOffsetX, centerOffsetY, 0);

        const material = new THREE.MeshBasicMaterial({ color: color });
        const mesh = new THREE.Mesh(geometry, material);

        // Store the mesh for camera-facing updates
        this.endTextMesh = mesh;
        this.scene.add(mesh);
    }

    animate() {
        const dt = 0.016;
        this.controls.update();

        // Make end text face the camera (billboard effect)
        if (this.endTextMesh) {
            // Position text in front of camera at a fixed distance
            const distance = 400;
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            
            this.endTextMesh.position.copy(this.camera.position).add(direction.multiplyScalar(distance));
            this.endTextMesh.quaternion.copy(this.camera.quaternion);
        }

        // Gestion des particules
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const sys = this.particles[i];
            const positions = sys.mesh.geometry.attributes.position.array;
            const colors = sys.mesh.geometry.attributes.color.array;

            let activeParticles = 0;

            // Emission continue pour les drapeaux
            if (sys.alive && sys.config.rate > 0) {
                let spawned = 0;
                for (let k = 0; k < sys.lives.length && spawned < sys.config.rate; k++) {
                    if (sys.lives[k] === 0) {
                        // Utiliser l'origine stockée dans le système
                        if (sys.origin) {
                            this.spawnParticle(sys, k, sys.origin);
                            spawned++;
                        }
                    }
                }
            }

            for (let j = 0; j < sys.config.count; j++) {
                if (sys.lives[j] > 0) {
                    activeParticles++;
                    sys.ages[j] += dt;

                    if (sys.ages[j] > sys.config.lifeTime) {
                        sys.lives[j] = 0;
                        // Hide particle by moving off-screen and setting color to 0
                        positions[j * 3] = 0; positions[j * 3 + 1] = -10000; positions[j * 3 + 2] = 0;
                        colors[j * 3] = 0; colors[j * 3 + 1] = 0; colors[j * 3 + 2] = 0;
                        continue;
                    }

                    // Physique
                    positions[j * 3] += sys.velocities[j * 3] * dt;
                    positions[j * 3 + 1] += sys.velocities[j * 3 + 1] * dt;
                    positions[j * 3 + 2] += sys.velocities[j * 3 + 2] * dt;

                    // Couleur (Lerp)
                    const lifeRatio = sys.ages[j] / sys.config.lifeTime;
                    const color = sys.config.colorStart.clone().lerp(sys.config.colorEnd, lifeRatio);
                    colors[j * 3] = color.r;
                    colors[j * 3 + 1] = color.g;
                    colors[j * 3 + 2] = color.b;
                }
            }

            sys.mesh.geometry.attributes.position.needsUpdate = true;
            sys.mesh.geometry.attributes.color.needsUpdate = true;

            // Supprimer le système si tout est mort et plus d'émission
            if (!sys.alive && activeParticles === 0) {
                this.scene.remove(sys.mesh);
                this.particles.splice(i, 1);
            }
        }

        // Explosion des cubes (Logique originale)
        if (this.isExploding) {
            this.explosionTime++;
            for (let i = 0; i < this.game.width * this.game.height; i++) {
                this.gridMesh.getMatrixAt(i, this.dummy.matrix);
                this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

                // Si le cube est visible (scale > 0)
                if (this.dummy.scale.x > 0.1) {
                    const vec = this.explosionVectors[i];

                    // Formules originales
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

        // Auto-return to menu after 5 seconds (300 frames at ~60fps)
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
        // Stop the animation loop
        this.renderer.setAnimationLoop(null);
        
        // Dispose of geometries and materials
        this.scene.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(m => m.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
        
        // Remove renderer DOM element
        this.renderer.dispose();
        this.container.innerHTML = '';
    }
}
