import * as THREE from 'three';

/**
 * FlagRenderer - Handles flag visuals (particle and 3D flag modes)
 * Extracted from Renderer.js for better modularity
 */
export class FlagRenderer {
    /**
     * @param {THREE.Scene} scene - The Three.js scene
     * @param {Object} textures - Loaded textures object
     * @param {ParticleSystem} particleSystem - The particle system instance
     */
    constructor(scene, textures, particleSystem) {
        this.scene = scene;
        this.textures = textures;
        this.particleSystem = particleSystem;
        
        this.flagEmitters = new Map();
        this.flag3DMeshes = new Map();
        
        // Flag style: 'particle' (bright/blinking) or '3d' (calm 3D model)
        this.flagStyle = 'particle';
        
        // Create reusable flag assets
        this._create3DFlagAssets();
    }

    /**
     * Create reusable 2D flag geometry and material
     */
    _create3DFlagAssets() {
        // 2D horizontal plane, same size as number textures (16x16)
        this.flag2DGeometry = new THREE.PlaneGeometry(16, 16);

        // Create a canvas texture for the flag icon
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Clear with full transparency
        ctx.clearRect(0, 0, 128, 128);

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

        // Bold white border
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
     * @param {THREE.Vector3} position 
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @returns {THREE.Mesh}
     */
    create3DFlag(position, x, y) {
        const mesh = new THREE.Mesh(this.flag2DGeometry, this.flag2DMaterial);
        mesh.position.copy(position);
        mesh.position.y = 12;
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData.gridX = x;
        mesh.userData.gridY = y;
        mesh.userData.baseY = 12;
        mesh.renderOrder = 1;
        return mesh;
    }

    /**
     * Update flag visual at a specific grid position
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @param {boolean} active - Whether flag should be shown
     * @param {number} gridWidth - Grid width for position calculation
     * @param {number} gridHeight - Grid height for position calculation
     */
    updateFlagVisual(x, y, active, gridWidth, gridHeight) {
        const key = `${x},${y}`;
        const pos = new THREE.Vector3(
            -(gridWidth * 10) + x * 22,
            0,
            (gridHeight * 10) - y * 22
        );

        if (active) {
            if (this.flagStyle === 'particle') {
                pos.y = 20;
                const emitter = this.particleSystem.createEmitter(pos, 'flag');
                this.flagEmitters.set(key, emitter);
            } else {
                const flag = this.create3DFlag(pos, x, y);
                this.scene.add(flag);
                this.flag3DMeshes.set(key, flag);
            }
        } else {
            this._removeFlag(key);
        }
    }

    /**
     * Remove flag visual at a specific key
     * @param {string} key 
     */
    _removeFlag(key) {
        if (this.flagEmitters.has(key)) {
            const emitter = this.flagEmitters.get(key);
            emitter.alive = false;
            this.flagEmitters.delete(key);
        }
        if (this.flag3DMeshes.has(key)) {
            const flag = this.flag3DMeshes.get(key);
            this.scene.remove(flag);
            this.flag3DMeshes.delete(key);
        }
    }

    /**
     * Toggle flag visual style between particle and 3D
     * @param {Object} game - Game instance with flags array
     */
    toggleFlagStyle(game) {
        this.flagStyle = this.flagStyle === 'particle' ? '3d' : 'particle';

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
        this.flagEmitters.forEach(emitter => emitter.alive = false);
        this.flagEmitters.clear();

        this.flag3DMeshes.forEach(flag => this.scene.remove(flag));
        this.flag3DMeshes.clear();

        // Re-create with new style
        for (const { x, y } of activeFlags) {
            this.updateFlagVisual(x, y, true, game.width, game.height);
        }

        return this.flagStyle;
    }

    /**
     * Get current flag style
     * @returns {string} 'particle' or '3d'
     */
    getStyle() {
        return this.flagStyle;
    }

    /**
     * Animate 3D flags (subtle hovering motion)
     * @param {number} time - Current time for animation
     */
    animate(time) {
        this.flag3DMeshes.forEach((flag) => {
            flag.position.y = flag.userData.baseY + Math.sin(time * 2 + flag.userData.gridX) * 1;
        });
    }

    /**
     * Clear all flags
     */
    clearAll() {
        this.flagEmitters.forEach(emitter => emitter.alive = false);
        this.flagEmitters.clear();

        this.flag3DMeshes.forEach(flag => this.scene.remove(flag));
        this.flag3DMeshes.clear();
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.clearAll();

        if (this.flag2DGeometry) {
            this.flag2DGeometry.dispose();
        }
        if (this.flag2DTexture) {
            this.flag2DTexture.dispose();
        }
        if (this.flag2DMaterial) {
            this.flag2DMaterial.dispose();
        }
    }
}
