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
    AUTO_RETURN_FRAMES: 300,
    /** Number of fireworks on win */
    FIREWORK_COUNT: 20
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
        
        /** @type {Function|null} Callback when auto-return triggers */
        this.onAutoReturn = null;
    }

    /**
     * Show end game text
     * @param {string} message - Message to display ('BRAVO' or 'PERDU')
     * @param {number} color - Text color as hex
     */
    showText(message, color) {
        // Clean up existing text
        if (this.textMesh) {
            this.scene.remove(this.textMesh);
            if (this.textMesh.geometry) this.textMesh.geometry.dispose();
            if (this.textMesh.material) this.textMesh.material.dispose();
        }

        // Create text geometry
        const geometry = new TextGeometry(message, {
            font: this.font,
            size: EFFECT_CONFIG.TEXT_SIZE,
            height: EFFECT_CONFIG.TEXT_DEPTH,
            curveSegments: 4,
            bevelEnabled: true,
            bevelThickness: 2,
            bevelSize: 1.5,
            bevelSegments: 3
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

        // Create mesh
        const material = new THREE.MeshBasicMaterial({ color: color });
        this.textMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.textMesh);
    }

    /**
     * Trigger win effects
     */
    triggerWin() {
        this.showText(t('game.win'), 0x00ff00);
        this._createFireworks();
    }

    /**
     * Trigger loss effects
     */
    triggerLoss() {
        this.showText(t('game.loss'), 0xff0000);
    }

    /**
     * Create firework particle effects
     * @private
     */
    _createFireworks() {
        for (let i = 0; i < EFFECT_CONFIG.FIREWORK_COUNT; i++) {
            const pos = new THREE.Vector3(
                (Math.random() - 0.5) * 200,
                (Math.random() - 0.5) * 100,
                (Math.random() - 0.5) * 200
            );
            
            const colorStart = new THREE.Color(
                Math.random(), 
                Math.random(), 
                Math.random()
            );
            const colorEnd = new THREE.Color(
                Math.random(), 
                Math.random(), 
                Math.random()
            );

            this.particleSystem.createEmitter(pos, 'firework', {
                colorStart,
                colorEnd,
                lifeTime: 2.0 + Math.random() * 3.0
            });
        }
    }

    /**
     * Update each frame (billboard text, auto-return timer)
     * @param {boolean} gameEnded - Whether game has ended
     */
    update(gameEnded) {
        // Billboard text to face camera
        if (this.textMesh) {
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            this.textMesh.position.copy(this.camera.position)
                .add(direction.multiplyScalar(EFFECT_CONFIG.TEXT_DISTANCE));
            this.textMesh.quaternion.copy(this.camera.quaternion);
        }

        // Auto-return timer
        if (gameEnded) {
            this.endGameTime++;
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
        
        if (this.textMesh) {
            this.scene.remove(this.textMesh);
            if (this.textMesh.geometry) this.textMesh.geometry.dispose();
            if (this.textMesh.material) this.textMesh.material.dispose();
            this.textMesh = null;
        }
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.reset();
        this.onAutoReturn = null;
    }
}
