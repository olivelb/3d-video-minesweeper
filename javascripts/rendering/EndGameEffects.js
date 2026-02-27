/**
 * EndGameEffects Module
 * 
 * Manages end-game visual effects including win/lose text displays,
 * firework particle effects on victory, and auto-return timing.
 * 
 * @module EndGameEffects
 * @requires three
 * @requires three/addons/geometries/TextGeometry
 */

import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { t } from '../i18n.js';

/**
 * Configuration for end game effects
 * @constant
 */
const EFFECT_CONFIG = {
    /** Text size for end messages */
    TEXT_SIZE: 70,
    /** Text depth */
    TEXT_DEPTH: 20,
    /** Distance from camera to text */
    TEXT_DISTANCE: 400,
    /** Frames before auto-returning to menu */
    AUTO_RETURN_FRAMES: 600,
    /** Number of initial firework emitters on win */
    FIREWORK_COUNT: 5
};

/**
 * Manages end-game visual effects
 * @class
 */
export class EndGameEffects {
    /**
     * Create end game effects manager
     * @param {THREE.Scene} scene - The Three.js scene
     * @param {THREE.Camera} camera - The camera (for billboard text)
     * @param {Object} particleSystem - Particle system for fireworks
     * @param {Object} font - Loaded THREE.js font
     */
    constructor(scene, camera, particleSystem, font) {
        /** @type {THREE.Scene} */
        this.scene = scene;

        /** @type {THREE.Camera} */
        this.camera = camera;

        /** @type {Object} Particle system reference */
        this.particleSystem = particleSystem;

        /** @type {Object} Loaded font for text geometry */
        this.font = font;

        /** @type {THREE.Mesh|null} Current end text mesh */
        this.textMesh = null;

        /** @type {number} Frames since game ended */
        this.endGameTime = 0;

        /** @type {boolean} Are fireworks active */
        this.fireworksActive = false;

        /** @type {Array<Object>} Queue for chained explosions */
        this.secondaryQueue = [];

        /** @type {Function|null} Callback when auto-return triggers */
        this.onAutoReturn = null;

        /** Reusable direction vector (avoids per-frame allocation) */
        this._direction = new THREE.Vector3();
    }

    /**
     * Show end game text
     * @param {string} message - Message to display ('BRAVO' or 'PERDU')
     * @param {number} color - Text color as hex
     */
    showText(message, color) {
        // Clean up existing text properly and DRY
        this.reset();

        // Create text geometry
        const geometry = new TextGeometry(message, {
            font: this.font,
            size: EFFECT_CONFIG.TEXT_SIZE,
            height: EFFECT_CONFIG.TEXT_DEPTH,
            curveSegments: 8, // Increased for smoother lighting highlights
            bevelEnabled: true,
            bevelThickness: 4,
            bevelSize: 2,
            bevelSegments: 5 // Smoother edges
        });

        // Center the geometry
        geometry.computeBoundingBox();
        const centerOffsetX = -0.5 * (
            geometry.boundingBox.max.x - geometry.boundingBox.min.x
        );
        const centerOffsetY = -0.5 * (
            geometry.boundingBox.max.y - geometry.boundingBox.min.y
        );
        geometry.translate(centerOffsetX, centerOffsetY, 0);

        // Required for MeshStandardMaterial lighting to work well
        geometry.computeVertexNormals();

        const baseColor = new THREE.Color(color);
        const darkColor = baseColor.clone().multiplyScalar(0.4);

        // Create dual materials for a striking 3D pop effect
        const materials = [
            // Index 0: Front faces (shiny, slightly emissive)
            new THREE.MeshStandardMaterial({
                color: baseColor,
                roughness: 0.2,
                metalness: 0.8,
                emissive: baseColor.clone().multiplyScalar(0.1)
            }),
            // Index 1: Side/bevel faces (darker, matte)
            new THREE.MeshStandardMaterial({
                color: darkColor,
                roughness: 0.6,
                metalness: 0.5
            })
        ];

        this.textMesh = new THREE.Mesh(geometry, materials);

        // Add robust local lighting to the text directly
        this.textLightGroup = new THREE.Group();

        const keyLight = new THREE.PointLight(0xffffff, 2.0, 0);
        keyLight.position.set(200, 200, 200);
        this.textLightGroup.add(keyLight);

        const rimLight = new THREE.PointLight(baseColor, 3.0, 0);
        rimLight.position.set(-200, -200, -100);
        this.textLightGroup.add(rimLight);

        const textAmbient = new THREE.AmbientLight(0xffffff, 0.4);
        this.textLightGroup.add(textAmbient);

        // This makes lights follow the text natively
        this.textMesh.add(this.textLightGroup);

        this.scene.add(this.textMesh);
    }

    /**
     * Trigger win effects
     */
    triggerWin() {
        this.showText(t('game.win'), 0x00ff00);
        this.fireworksActive = true;
        this.secondaryQueue = [];

        // Initial big blast
        for (let i = 0; i < EFFECT_CONFIG.FIREWORK_COUNT; i++) {
            this._spawnExplosion('primary');
        }
    }

    /**
     * Trigger loss effects
     */
    triggerLoss() {
        this.showText(t('game.loss'), 0xff0000);
        this.fireworksActive = false;
        this.secondaryQueue = [];
    }

    /**
     * Create firework particle effects
     * @param {string} type - 'primary' or 'secondary'
     * @private
     */
    _spawnExplosion(type, basePos = null, baseColor = null) {
        const isPrimary = type === 'primary';

        let pos;
        if (basePos) {
            pos = new THREE.Vector3(
                basePos.x + (Math.random() - 0.5) * 150,
                basePos.y + (Math.random() - 0.5) * 150,
                basePos.z + (Math.random() - 0.5) * 150
            );
        } else {
            pos = new THREE.Vector3(
                (Math.random() - 0.5) * 400,
                (Math.random() - 0.5) * 300 + 100, // Bias upwards
                (Math.random() - 0.5) * 400
            );
        }

        let colorStart, colorEnd;
        if (baseColor) {
            // Slight color variation for secondary explosions
            colorStart = baseColor.clone();
            colorStart.offsetHSL((Math.random() - 0.5) * 0.2, 0, 0);
            colorEnd = new THREE.Color(Math.random(), Math.random(), Math.random());
        } else {
            colorStart = new THREE.Color(Math.random(), Math.random(), Math.random());
            colorEnd = new THREE.Color(Math.random(), Math.random(), Math.random());
        }

        // Make the final sequence much grander
        const count = isPrimary ? 8000 : 3000;
        const sizeStart = isPrimary ? 16 : 10;
        const speed = isPrimary ? 700 : 400; // Much faster burst
        const lifeTime = isPrimary ? 2.5 + Math.random() : 1.5 + Math.random();

        this.particleSystem.createEmitter(pos, 'firework', {
            count,
            sizeStart,
            colorStart,
            colorEnd,
            lifeTime,
            speed
        });

        // Chance to spawn chained secondary explosions
        if (isPrimary && Math.random() < 0.8 && this.endGameTime < EFFECT_CONFIG.AUTO_RETURN_FRAMES - 100) {
            const numSecondaries = 2 + Math.floor(Math.random() * 4);
            for (let i = 0; i < numSecondaries; i++) {
                // Wait between 30 (0.5s) to 90 (1.5s) frames
                const delayFrames = 30 + Math.floor(Math.random() * 60);
                this.secondaryQueue.push({
                    frame: this.endGameTime + delayFrames,
                    pos: pos,
                    color: colorStart
                });
            }
        }
    }

    /**
     * Update each frame (billboard text, auto-return timer)
     * @param {boolean} gameEnded - Whether game has ended
     */
    update(gameEnded) {
        // Billboard text to face camera
        if (this.textMesh) {
            const direction = this._direction;
            this.camera.getWorldDirection(direction);
            this.textMesh.position.copy(this.camera.position)
                .add(direction.multiplyScalar(EFFECT_CONFIG.TEXT_DISTANCE));
            this.textMesh.quaternion.copy(this.camera.quaternion);
        }

        // Auto-return timer and fireworks sequence
        if (gameEnded) {
            this.endGameTime++;

            if (this.fireworksActive) {
                // Randomly spawn new primary fireworks throughout the finale
                if (Math.random() < 0.04 && this.endGameTime < EFFECT_CONFIG.AUTO_RETURN_FRAMES - 80) {
                    this._spawnExplosion('primary');
                }

                // Process queued secondary explosions
                for (let i = this.secondaryQueue.length - 1; i >= 0; i--) {
                    if (this.endGameTime >= this.secondaryQueue[i].frame) {
                        const expl = this.secondaryQueue[i];
                        this._spawnExplosion('secondary', expl.pos, expl.color);
                        this.secondaryQueue.splice(i, 1);
                    }
                }
            }

            if (this.endGameTime > EFFECT_CONFIG.AUTO_RETURN_FRAMES && this.onAutoReturn) {
                this.onAutoReturn();
            }
        }
    }

    /**
     * Reset end game state
     */
    reset() {
        this.endGameTime = 0;
        this.fireworksActive = false;
        this.secondaryQueue = [];

        if (this.textMesh) {
            this.scene.remove(this.textMesh);
            if (this.textMesh.geometry) this.textMesh.geometry.dispose();
            if (this.textMesh.material) {
                if (Array.isArray(this.textMesh.material)) {
                    this.textMesh.material.forEach(m => m.dispose());
                } else {
                    this.textMesh.material.dispose();
                }
            }
            this.textMesh = null;
        }

        this.textLightGroup = null;
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.reset();
        this.onAutoReturn = null;
    }
}
