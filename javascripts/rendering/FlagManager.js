/**
 * FlagManager Module
 * 
 * Manages flag visual representations in the 3D Minesweeper game.
 * Supports two flag styles: particle-based (animated stars) and 
 * 2D flag icons. Handles creation, animation, and cleanup of flags.
 * 
 * @module FlagManager
 * @requires three
 */

import * as THREE from 'three';
import { gridToWorld } from './GridManager.js';

/**
 * Configuration for flag rendering
 * @constant
 */
const FLAG_CONFIG = {
    /** Size of 2D flag plane (matches number textures) */
    FLAG_SIZE: 16,
    /** Height above cube surface */
    FLAG_HEIGHT: 12,
    /** Canvas texture size for flag icon */
    CANVAS_SIZE: 128,
    /** Default flag style */
    DEFAULT_STYLE: 'particle'
};

/**
 * Manages flag visuals for flagged minesweeper cells
 * @class
 */
export class FlagManager {
    /**
     * Create a flag manager
     * @param {THREE.Scene} scene - The Three.js scene
     * @param {Object} particleSystem - Reference to particle system for particle flags
     */
    constructor(scene, particleSystem) {
        /** @type {THREE.Scene} */
        this.scene = scene;
        
        /** @type {Object} Particle system for particle-style flags */
        this.particleSystem = particleSystem;
        
        /** @type {Map<string, Object>} Particle emitters by position key */
        this.flagEmitters = new Map();
        
        /** @type {Map<string, THREE.Mesh>} 2D flag meshes by position key */
        this.flag2DMeshes = new Map();
        
        /** @type {string} Current flag style: 'particle' or '2d' */
        this.flagStyle = FLAG_CONFIG.DEFAULT_STYLE;
        
        /** @type {THREE.PlaneGeometry} Reusable geometry for 2D flags */
        this.flag2DGeometry = null;
        
        /** @type {THREE.MeshBasicMaterial} Reusable material for 2D flags */
        this.flag2DMaterial = null;
        
        /** @type {THREE.CanvasTexture} Texture for 2D flags */
        this.flag2DTexture = null;

        this._createFlag2DAssets();
    }

    /**
     * Create reusable 2D flag geometry and material
     * @private
     */
    _createFlag2DAssets() {
        // Create plane geometry matching number texture size
        this.flag2DGeometry = new THREE.PlaneGeometry(
            FLAG_CONFIG.FLAG_SIZE, 
            FLAG_CONFIG.FLAG_SIZE
        );

        // Create canvas texture for flag icon
        const canvas = document.createElement('canvas');
        canvas.width = FLAG_CONFIG.CANVAS_SIZE;
        canvas.height = FLAG_CONFIG.CANVAS_SIZE;
        const ctx = canvas.getContext('2d');

        this._drawFlagIcon(ctx, FLAG_CONFIG.CANVAS_SIZE);

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
     * Draw flag icon on canvas
     * @private
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} size - Canvas size
     */
    _drawFlagIcon(ctx, size) {
        // Clear with full transparency
        ctx.clearRect(0, 0, size, size);

        // Outer glow effect
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Bold triangular flag
        ctx.fillStyle = '#ff2222';
        ctx.beginPath();
        ctx.moveTo(20, 15);
        ctx.lineTo(108, 45);
        ctx.lineTo(20, 75);
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

        // Pole
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(12, 10, 8, 108);
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(12, 10, 4, 108);
    }

    /**
     * Create a position key for map storage
     * @private
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @returns {string} Position key
     */
    _getKey(x, y) {
        return `${x},${y}`;
    }

    /**
     * Calculate world position for a grid cell
     * @private
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @param {number} gridWidth - Total grid width
     * @param {number} gridHeight - Total grid height
     * @returns {THREE.Vector3} World position
     */
    _getWorldPosition(x, y, gridWidth, gridHeight) {
        const { wx, wz } = gridToWorld(x, y, gridWidth, gridHeight);
        return new THREE.Vector3(wx, 0, wz);
    }

    /**
     * Add or remove a flag at the specified position
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @param {boolean} active - Whether flag should be active
     * @param {number} gridWidth - Total grid width
     * @param {number} gridHeight - Total grid height
     */
    updateFlag(x, y, active, gridWidth, gridHeight) {
        const key = this._getKey(x, y);
        const pos = this._getWorldPosition(x, y, gridWidth, gridHeight);

        if (active) {
            this._addFlag(key, pos, x, y);
        } else {
            this._removeFlag(key);
        }
    }

    /**
     * Add a flag at the specified position
     * @private
     * @param {string} key - Position key
     * @param {THREE.Vector3} pos - World position
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     */
    _addFlag(key, pos, x, y) {
        if (this.flagStyle === 'particle') {
            // Particle effect style
            pos.y = 20;
            const emitter = this.particleSystem.createEmitter(pos, 'flag');
            this.flagEmitters.set(key, emitter);
        } else {
            // 2D flag icon style
            const flag = this._create2DFlag(pos, x, y);
            this.scene.add(flag);
            this.flag2DMeshes.set(key, flag);
        }
    }

    /**
     * Create a 2D flag mesh
     * @private
     * @param {THREE.Vector3} position - Base position
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @returns {THREE.Mesh} Flag mesh
     */
    _create2DFlag(position, x, y) {
        const mesh = new THREE.Mesh(this.flag2DGeometry, this.flag2DMaterial);
        mesh.position.copy(position);
        mesh.position.y = FLAG_CONFIG.FLAG_HEIGHT;
        mesh.rotation.x = -Math.PI / 2; // Horizontal like numbers
        mesh.userData.gridX = x;
        mesh.userData.gridY = y;
        mesh.userData.baseY = FLAG_CONFIG.FLAG_HEIGHT;
        mesh.renderOrder = 1; // Render after cubes
        return mesh;
    }

    /**
     * Remove a flag at the specified key
     * @private
     * @param {string} key - Position key
     */
    _removeFlag(key) {
        // Remove particle emitter if exists
        if (this.flagEmitters.has(key)) {
            const emitter = this.flagEmitters.get(key);
            emitter.alive = false;
            this.flagEmitters.delete(key);
        }
        
        // Remove 2D flag if exists
        if (this.flag2DMeshes.has(key)) {
            const flag = this.flag2DMeshes.get(key);
            this.scene.remove(flag);
            this.flag2DMeshes.delete(key);
        }
    }

    /**
     * Set flag visual style
     * @param {string} style - 'particle' or '2d'
     * @param {Object} game - Game object to read flag state from
     * @returns {string} The new style
     */
    setStyle(style, game) {
        this.flagStyle = style;

        // Collect current flag positions
        const activeFlags = [];
        for (let x = 0; x < game.width; x++) {
            for (let y = 0; y < game.height; y++) {
                if (game.flags[x][y]) {
                    activeFlags.push({ x, y });
                }
            }
        }

        // Clear all current visuals
        this.clearAll();

        // Recreate with new style
        for (const { x, y } of activeFlags) {
            this.updateFlag(x, y, true, game.width, game.height);
        }

        return this.flagStyle;
    }

    /**
     * Animate flags (called each frame)
     * @param {number} hoveredX - Hovered cell X, or -1 if none
     * @param {number} hoveredY - Hovered cell Y, or -1 if none
     */
    animate(hoveredX, hoveredY) {
        if (this.flagStyle === 'particle') return;

        const time = Date.now() / 1000;
        const pulse = Math.sin(time * 10);

        this.flag2DMeshes.forEach(flag => {
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
    }

    /**
     * Clear all flags
     */
    clearAll() {
        this.flagEmitters.forEach(emitter => emitter.alive = false);
        this.flagEmitters.clear();

        this.flag2DMeshes.forEach(flag => this.scene.remove(flag));
        this.flag2DMeshes.clear();
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.clearAll();

        if (this.flag2DGeometry) {
            this.flag2DGeometry.dispose();
        }
        if (this.flag2DMaterial) {
            this.flag2DMaterial.dispose();
        }
        if (this.flag2DTexture) {
            this.flag2DTexture.dispose();
        }
    }
}
