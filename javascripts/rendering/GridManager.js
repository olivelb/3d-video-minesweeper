/**
 * GridManager Module
 * 
 * Manages the 3D grid of cubes that represent the minesweeper board.
 * Handles cube instancing, visual updates for revealed cells, hover effects,
 * and explosion animations. Uses THREE.js InstancedMesh for performance.
 * 
 * @module GridManager
 * @requires three
 */

import * as THREE from 'three';

/**
 * Configuration for grid rendering
 * @constant
 */
export const GRID_CONFIG = {
    /** Size of each cube */
    CUBE_SIZE: 20,
    /** Spacing between cubes */
    CUBE_SPACING: 22,
    /** Number plane size */
    NUMBER_PLANE_SIZE: 16,
    /** Height of number planes above grid */
    NUMBER_HEIGHT: 11
};

/**
 * Convert grid coordinates to world position.
 * Centralises the formula so it isn't duplicated across modules.
 * @param {number} x - Grid column
 * @param {number} y - Grid row
 * @param {number} gridWidth  - Total grid width  (game.width)
 * @param {number} gridHeight - Total grid height (game.height)
 * @returns {{wx: number, wz: number}}
 */
export function gridToWorld(x, y, gridWidth, gridHeight) {
    const half = GRID_CONFIG.CUBE_SPACING / 2;     // 11
    return {
        wx: -(gridWidth * half) + x * GRID_CONFIG.CUBE_SPACING,
        wz: (gridHeight * half) - y * GRID_CONFIG.CUBE_SPACING
    };
}

/**
 * Convert world position back to grid coordinates (inverse of gridToWorld).
 * @param {number} wx - World X
 * @param {number} wz - World Z
 * @param {number} gridWidth
 * @param {number} gridHeight
 * @returns {{x: number, y: number}}
 */
export function worldToGrid(wx, wz, gridWidth, gridHeight) {
    const half = GRID_CONFIG.CUBE_SPACING / 2;
    return {
        x: Math.round((wx + gridWidth * half) / GRID_CONFIG.CUBE_SPACING),
        y: Math.round((gridHeight * half - wz) / GRID_CONFIG.CUBE_SPACING)
    };
}

/**
 * Manages the instanced mesh grid for minesweeper
 * @class
 */
export class GridManager {
    /**
     * Create a grid manager
     * @param {THREE.Scene} scene - The Three.js scene
     * @param {Object} game - Game state object
     * @param {THREE.Texture} mediaTexture - Media texture for cube front face
     * @param {Object} textures - Number textures (1-8)
     */
    constructor(scene, game, mediaTexture, textures) {
        /** @type {THREE.Scene} */
        this.scene = scene;

        /** @type {Object} Game state reference */
        this.game = game;

        /** @type {THREE.Texture} Media texture for cube faces */
        this.mediaTexture = mediaTexture;

        /** @type {Object} Number textures */
        this.textures = textures;

        /** @type {THREE.InstancedMesh} The main grid mesh */
        this.gridMesh = null;

        /** @type {THREE.Object3D} Dummy object for matrix calculations */
        this.dummy = new THREE.Object3D();

        /** @type {Array<THREE.Mesh>} Number meshes for revealed cells */
        this.numberMeshes = [];

        /** @type {Array<Object>} Explosion velocity vectors per instance */
        this.explosionVectors = [];

        /** @type {number} Last hovered instance ID */
        this.lastHoveredId = -1;

        /** @type {boolean} Whether explosion is active */
        this.isExploding = false;

        /** @type {number} Explosion animation time */
        this.explosionTime = 0;

        /** Reusable color for hover highlight (avoids per-frame allocation) */
        this._hoverColor = new THREE.Color();

        /** Active animated hints */
        this.activeHints = [];

        this._createGrid();
    }

    /**
     * Create the instanced mesh grid
     * @private
     */
    _createGrid() {
        const geometry = new THREE.BoxGeometry(
            GRID_CONFIG.CUBE_SIZE,
            GRID_CONFIG.CUBE_SIZE,
            GRID_CONFIG.CUBE_SIZE
        );

        const materials = this._createMaterials();
        const instanceCount = this.game.width * this.game.height;

        this.gridMesh = new THREE.InstancedMesh(geometry, materials, instanceCount);

        const aGridPos = new Float32Array(instanceCount * 2);

        this._initializeInstances(aGridPos);

        this.gridMesh.geometry.setAttribute(
            'aGridPos',
            new THREE.InstancedBufferAttribute(aGridPos, 2)
        );

        this.scene.add(this.gridMesh);
    }

    /**
     * Create materials for cube faces
     * @private
     * @returns {Array<THREE.MeshBasicMaterial>} Array of 6 materials
     */
    _createMaterials() {
        // Video material for front face with custom shader
        const videoMaterial = new THREE.MeshBasicMaterial({
            map: this.mediaTexture
        });

        videoMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uGridSize = {
                value: new THREE.Vector2(this.game.width, this.game.height)
            };
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

        // Create materials array - white materials for sides (instance color makes them black)
        const materials = [
            new THREE.MeshBasicMaterial({ color: 0xffffff }), // Right
            new THREE.MeshBasicMaterial({ color: 0xffffff }), // Left
            new THREE.MeshBasicMaterial({ color: 0xffffff }), // Top
            new THREE.MeshBasicMaterial({ color: 0xffffff }), // Bottom
            videoMaterial,                                      // Front (video)
            new THREE.MeshBasicMaterial({ color: 0xffffff })  // Back
        ];

        return materials;
    }

    /**
     * Initialize instance matrices and colors
     * @private
     * @param {Float32Array} aGridPos - Grid position attribute array
     */
    _initializeInstances(aGridPos) {
        let i = 0;

        for (let x = 0; x < this.game.width; x++) {
            for (let y = 0; y < this.game.height; y++) {
                // Set position
                const { wx, wz } = gridToWorld(x, y, this.game.width, this.game.height);
                this.dummy.position.set(wx, 0, wz);
                this.dummy.rotation.x = -Math.PI / 2;
                this.dummy.updateMatrix();
                this.gridMesh.setMatrixAt(i, this.dummy.matrix);

                // Set initial color (black = no addition to white material)
                this.gridMesh.setColorAt(i, new THREE.Color(0x000000));

                // Store grid position for UV mapping
                aGridPos[i * 2] = x;
                aGridPos[i * 2 + 1] = y;

                // Initialize random explosion vector
                this.explosionVectors[i] = {
                    dx: 0.05 * (0.5 - Math.random()),
                    dy: 0.05 * (0.5 - Math.random())
                };

                i++;
            }
        }
    }

    /**
     * Update a cell's visual state when revealed
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @param {number} value - Cell value (0-8, or 10 for bomb)
     */
    updateCellVisual(x, y, value) {
        const index = x * this.game.height + y;

        // Hide the cube
        this.gridMesh.getMatrixAt(index, this.dummy.matrix);
        this.dummy.matrix.decompose(
            this.dummy.position,
            this.dummy.quaternion,
            this.dummy.scale
        );
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.gridMesh.setMatrixAt(index, this.dummy.matrix);
        this.gridMesh.instanceMatrix.needsUpdate = true;

        // Bomb display
        if (value === 10) {
            this._createBombMesh(x, y);
        } else if (value > 0 && value <= 8) {
            this._createNumberMesh(x, y, value);
        }
    }

    /**
     * Create a bomb mesh for a revealed mine cell
     * @private
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     */
    _createBombMesh(x, y) {
        const planeGeo = new THREE.PlaneGeometry(18, 18);
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
        const { wx, wz } = gridToWorld(x, y, this.game.width, this.game.height);
        mesh.position.set(wx, GRID_CONFIG.NUMBER_HEIGHT, wz);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 2;
        this.scene.add(mesh);
        this.numberMeshes.push(mesh);
    }

    /**
     * Create a death-flag mesh for a cell where another player was eliminated.
     * Shows a skull+flag icon so it's clear this is a flagged mine.
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     */
    createDeathFlagMesh(x, y) {
        const index = x * this.game.height + y;

        // Hide the cube (same as updateCellVisual)
        this.gridMesh.getMatrixAt(index, this.dummy.matrix);
        this.dummy.matrix.decompose(
            this.dummy.position,
            this.dummy.quaternion,
            this.dummy.scale
        );
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.gridMesh.setMatrixAt(index, this.dummy.matrix);
        this.gridMesh.instanceMatrix.needsUpdate = true;

        const planeGeo = new THREE.PlaneGeometry(18, 18);
        const material = new THREE.MeshBasicMaterial({
            map: this.textures['deathFlag'],
            transparent: true,
            opacity: 1.0,
            depthWrite: true,
            depthTest: true,
            side: THREE.DoubleSide,
            alphaTest: 0.1
        });
        const dfMesh = new THREE.Mesh(planeGeo, material);
        const df = gridToWorld(x, y, this.game.width, this.game.height);
        dfMesh.position.set(df.wx, GRID_CONFIG.NUMBER_HEIGHT, df.wz);
        dfMesh.rotation.x = -Math.PI / 2;
        dfMesh.renderOrder = 2;
        this.scene.add(dfMesh);
        this.numberMeshes.push(dfMesh);
    }

    /**
     * Create a number mesh for a revealed cell
     * @private
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @param {number} value - Cell value (1-8)
     */
    _createNumberMesh(x, y, value) {
        const planeGeo = new THREE.PlaneGeometry(
            GRID_CONFIG.NUMBER_PLANE_SIZE,
            GRID_CONFIG.NUMBER_PLANE_SIZE
        );

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
        const { wx, wz } = gridToWorld(x, y, this.game.width, this.game.height);
        mesh.position.set(wx, GRID_CONFIG.NUMBER_HEIGHT, wz);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 1;

        this.scene.add(mesh);
        this.numberMeshes.push(mesh);
    }

    /**
     * Update hover effect on an instance
     * @param {number} instanceId - Hovered instance ID, or -1 for none
     * @param {boolean} useHoverHelper - Whether hover effects are enabled
     */
    updateHover(instanceId, useHoverHelper) {
        // Reset last hovered if changed
        if (this.lastHoveredId !== instanceId && this.lastHoveredId !== -1) {
            this.resetInstance(this.lastHoveredId);
        }

        if (useHoverHelper && instanceId !== -1 && !this.isExploding && !this.game.victory) {
            this.gridMesh.getMatrixAt(instanceId, this.dummy.matrix);
            this.dummy.matrix.decompose(
                this.dummy.position,
                this.dummy.quaternion,
                this.dummy.scale
            );

            if (this.dummy.scale.x > 0.1) {
                const pulse = Math.sin(Date.now() * 0.01);
                const scale = 1.0 + pulse * 0.1;
                this.dummy.scale.set(scale, scale, scale);
                this.dummy.updateMatrix();
                this.gridMesh.setMatrixAt(instanceId, this.dummy.matrix);

                // Add highlight color
                const colorVal = (pulse + 1.0) * 0.2;
                this.gridMesh.setColorAt(
                    instanceId,
                    this._hoverColor.setRGB(colorVal, colorVal, colorVal)
                );

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

    /**
     * Reset an instance to its default state
     * @param {number} instanceId - Instance to reset
     */
    resetInstance(instanceId) {
        const y = instanceId % this.game.height;
        const x = Math.floor(instanceId / this.game.height);

        // Check if revealed
        if (this.game.visibleGrid[x][y] !== -1) {
            this.dummy.scale.set(0, 0, 0);
        } else {
            this.dummy.scale.set(1, 1, 1);
        }

        const { wx, wz } = gridToWorld(x, y, this.game.width, this.game.height);
        this.dummy.position.set(wx, 0, wz);
        this.dummy.rotation.x = -Math.PI / 2;
        this.dummy.rotation.y = 0;
        this.dummy.rotation.z = 0;
        this.dummy.updateMatrix();

        this.gridMesh.setMatrixAt(instanceId, this.dummy.matrix);
        this.gridMesh.setColorAt(instanceId, new THREE.Color(0x000000));
        this.gridMesh.instanceMatrix.needsUpdate = true;
        this.gridMesh.instanceColor.needsUpdate = true;
    }

    /**
     * Reset all instances to default state
     */
    resetAllInstances() {
        for (let i = 0; i < this.game.width * this.game.height; i++) {
            this.resetInstance(i);
        }
    }

    /**
     * Show hint effect on a cell
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @param {string} type - 'safe' or 'mine'
     */
    showHint(x, y, type) {
        const index = x * this.game.height + y;
        const color = type === 'safe'
            ? new THREE.Color(0x00ff00)
            : new THREE.Color(0xff0000);

        const originalColor = new THREE.Color(0x000000);
        this.gridMesh.setColorAt(index, color);
        this.gridMesh.instanceColor.needsUpdate = true;

        // Add to active hints for animation
        this.activeHints.push({
            index: index,
            x: x,
            y: y,
            age: 0,
            lifeTime: 2.5, // Extended duration (long fade out)
            startColor: color.clone(),
            endColor: originalColor.clone()
        });
    }

    /**
     * Update animations for active hints and other instance effects
     * @param {number} dt 
     */
    updateAnimations(dt) {
        if (this.activeHints.length === 0) return;

        let needsUpdate = false;
        const colorLerp = new THREE.Color();

        for (let i = this.activeHints.length - 1; i >= 0; i--) {
            const hint = this.activeHints[i];

            // If the UI is waiting for the player to read the hint explanation, we freeze the color at the start
            if (this.game.hintMode) {
                hint.age = 0;
            } else {
                hint.age += dt;
            }

            const progress = Math.min(hint.age / hint.lifeTime, 1.0);

            // Lerp color
            colorLerp.copy(hint.startColor).lerp(hint.endColor, progress);
            this.gridMesh.setColorAt(hint.index, colorLerp);
            needsUpdate = true;

            // Remove if finished
            if (progress >= 1.0) {
                // To be completely safe, ensure it stays black if not revealed
                if (this.game.visibleGrid[hint.x][hint.y] !== -1 || this.game.gameOver || this.game.victory || this.game.hintMode) {
                    // It shouldn't be black if the game state changed it, but we enforce endColor just in case it is still untouched
                }
                this.activeHints.splice(i, 1);
            }
        }

        if (needsUpdate) {
            this.gridMesh.instanceColor.needsUpdate = true;
        }
    }

    /**
     * Highlight constraint cells (blue) for hint explanation.
     * @param {Array<{x: number, y: number}>} cells - Constraint cells
     */
    highlightConstraints(cells) {
        this._constraintHighlights = [];
        const blue = new THREE.Color(0x4488ff);
        for (const { x, y } of cells) {
            const index = x * this.game.height + y;
            this._constraintHighlights.push(index);
            this.gridMesh.setColorAt(index, blue);
        }
        this.gridMesh.instanceColor.needsUpdate = true;
    }

    /**
     * Clear constraint highlights, restoring original colors.
     */
    clearConstraintHighlights() {
        if (!this._constraintHighlights) return;
        const black = new THREE.Color(0x000000);
        for (const index of this._constraintHighlights) {
            this.gridMesh.setColorAt(index, black);
        }
        this.gridMesh.instanceColor.needsUpdate = true;
        this._constraintHighlights = null;
    }

    /**
     * Start explosion animation
     */
    triggerExplosion() {
        this.isExploding = true;
        this.explosionTime = 0;
        this.numberMeshes.forEach(mesh => mesh.visible = false);
    }

    /**
     * Reset explosion state
     */
    resetExplosion() {
        this.isExploding = false;
        this.explosionTime = 0;
        this.numberMeshes.forEach(mesh => mesh.visible = true);
        this.resetAllInstances();
    }

    /**
     * Update media texture (when switching sources)
     * @param {THREE.Texture} texture - New media texture
     */
    updateMediaTexture(texture) {
        if (this.gridMesh && this.gridMesh.material && Array.isArray(this.gridMesh.material)) {
            const videoMaterialIndex = 4; // Front face
            this.gridMesh.material[videoMaterialIndex].map = texture;
            this.gridMesh.material[videoMaterialIndex].needsUpdate = true;
        }
    }

    /**
     * Get grid cell coordinates from instance ID
     * @param {number} instanceId - Instance ID
     * @returns {Object} { x, y } coordinates
     */
    getCoordinatesFromInstance(instanceId) {
        const y = instanceId % this.game.height;
        const x = Math.floor(instanceId / this.game.height);
        return { x, y };
    }

    /**
     * Get instance ID from grid coordinates
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @returns {number} Instance ID
     */
    getInstanceFromCoordinates(x, y) {
        return x * this.game.height + y;
    }

    /**
     * Hide the entire grid (for win animation)
     */
    hide() {
        this.gridMesh.visible = false;
        this.numberMeshes.forEach(mesh => mesh.visible = false);
    }

    /**
     * Show the grid
     */
    show() {
        this.gridMesh.visible = true;
        this.numberMeshes.forEach(mesh => mesh.visible = true);
    }

    /**
     * Clean up resources
     */
    dispose() {
        // Dispose number meshes
        this.numberMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (mesh.material.map) mesh.material.map.dispose();
                mesh.material.dispose();
            }
        });
        this.numberMeshes = [];

        // Dispose grid mesh
        if (this.gridMesh) {
            this.scene.remove(this.gridMesh);
            if (this.gridMesh.geometry) this.gridMesh.geometry.dispose();
            if (Array.isArray(this.gridMesh.material)) {
                this.gridMesh.material.forEach(m => {
                    if (m.map) m.map.dispose();
                    m.dispose();
                });
            }
        }
    }
}
