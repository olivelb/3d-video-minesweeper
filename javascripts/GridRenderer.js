import * as THREE from 'three';

/**
 * GridRenderer - Handles the instanced mesh grid for cells
 * Extracted from Renderer.js for better modularity
 */
export class GridRenderer {
    /**
     * @param {THREE.Scene} scene - The Three.js scene
     * @param {Object} textures - Loaded textures object
     * @param {THREE.Texture} mediaTexture - Video/image texture
     */
    constructor(scene, textures, mediaTexture) {
        this.scene = scene;
        this.textures = textures;
        this.mediaTexture = mediaTexture;
        
        this.gridMesh = null;
        this.dummy = new THREE.Object3D();
        
        // Explosion state
        this.isExploding = false;
        this.explosionTime = 0;
        this.explosionVectors = [];
    }

    /**
     * Create the instanced mesh grid
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @param {number[][]} visibleGrid - Visibility state array
     */
    createGrid(width, height, visibleGrid) {
        const gridSize = 20;
        const gap = 2;
        const totalCells = width * height;

        // Create materials for cube faces
        const materials = [
            new THREE.MeshBasicMaterial({ color: 0x404040 }), // Right
            new THREE.MeshBasicMaterial({ color: 0x404040 }), // Left
            new THREE.MeshBasicMaterial({ color: 0x555555 }), // Top
            new THREE.MeshBasicMaterial({ color: 0x2a2a2a }), // Bottom
            new THREE.MeshBasicMaterial({ map: this.mediaTexture }), // Front (video)
            new THREE.MeshBasicMaterial({ color: 0x333333 })  // Back
        ];

        const geometry = new THREE.BoxGeometry(gridSize, gridSize, gridSize);

        // Set unique UVs for video face
        const uvAttr = geometry.attributes.uv;
        const positions = geometry.attributes.position;
        const faceVertexCount = 6; // 2 triangles per face = 6 vertices

        for (let i = 0; i < totalCells; i++) {
            const col = i % width;
            const row = Math.floor(i / width);
            const u0 = col / width;
            const u1 = (col + 1) / width;
            const v0 = 1 - (row + 1) / height;
            const v1 = 1 - row / height;

            // Front face is face index 4 (vertices 24-29 in BufferGeometry)
            const frontFaceStart = 4 * faceVertexCount;
        }

        this.gridMesh = new THREE.InstancedMesh(geometry, materials, totalCells);
        this.gridMesh.receiveShadow = true;

        // Position instances
        let instanceId = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                this.dummy.position.set(
                    -(width * (gridSize + gap) / 2) + x * (gridSize + gap),
                    0,
                    (height * (gridSize + gap) / 2) - y * (gridSize + gap)
                );
                this.dummy.scale.set(1, 1, 1);
                this.dummy.rotation.set(0, 0, 0);
                this.dummy.updateMatrix();
                this.gridMesh.setMatrixAt(instanceId, this.dummy.matrix);
                instanceId++;
            }
        }

        this.gridMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(this.gridMesh);

        return this.gridMesh;
    }

    /**
     * Update material texture (for video texture switching)
     * @param {THREE.Texture} texture 
     */
    updateMediaTexture(texture) {
        this.mediaTexture = texture;
        if (this.gridMesh?.material && Array.isArray(this.gridMesh.material)) {
            const videoMaterialIndex = 4; // Front face
            this.gridMesh.material[videoMaterialIndex].map = texture;
            this.gridMesh.material[videoMaterialIndex].needsUpdate = true;
        }
    }

    /**
     * Update a single cell instance
     * @param {number} instanceId 
     * @param {THREE.Vector3} position 
     * @param {THREE.Vector3} scale 
     * @param {THREE.Euler} rotation 
     */
    updateInstance(instanceId, position = null, scale = null, rotation = null) {
        this.gridMesh.getMatrixAt(instanceId, this.dummy.matrix);
        this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

        if (position) this.dummy.position.copy(position);
        if (scale) this.dummy.scale.copy(scale);
        if (rotation) this.dummy.rotation.copy(rotation);

        this.dummy.updateMatrix();
        this.gridMesh.setMatrixAt(instanceId, this.dummy.matrix);
        this.gridMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Scale a cell (for hover effects)
     * @param {number} instanceId 
     * @param {number} scaleValue 
     */
    scaleInstance(instanceId, scaleValue) {
        this.gridMesh.getMatrixAt(instanceId, this.dummy.matrix);
        this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
        this.dummy.scale.setScalar(scaleValue);
        this.dummy.updateMatrix();
        this.gridMesh.setMatrixAt(instanceId, this.dummy.matrix);
        this.gridMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Start explosion animation
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     */
    startExplosion(width, height) {
        this.isExploding = true;
        this.explosionTime = 0;
        this.explosionVectors = [];

        const totalCells = width * height;
        for (let i = 0; i < totalCells; i++) {
            this.explosionVectors.push(new THREE.Vector3(
                (Math.random() - 0.5) * 10,
                Math.random() * 20 + 5,
                (Math.random() - 0.5) * 10
            ));
        }
    }

    /**
     * Animate explosion
     * @param {number} delta - Time delta
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @returns {boolean} True if still exploding
     */
    animateExplosion(delta, width, height) {
        if (!this.isExploding) return false;

        this.explosionTime += delta;
        const gravity = -30;
        const totalCells = width * height;

        for (let i = 0; i < totalCells; i++) {
            this.gridMesh.getMatrixAt(i, this.dummy.matrix);
            this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

            const vel = this.explosionVectors[i];
            this.dummy.position.x += vel.x * delta;
            this.dummy.position.y += vel.y * delta;
            this.dummy.position.z += vel.z * delta;
            vel.y += gravity * delta;

            this.dummy.rotation.x += delta * 2;
            this.dummy.rotation.z += delta * 2;

            this.dummy.updateMatrix();
            this.gridMesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.gridMesh.instanceMatrix.needsUpdate = true;
        return true;
    }

    /**
     * Get grid mesh for raycasting
     * @returns {THREE.InstancedMesh}
     */
    getMesh() {
        return this.gridMesh;
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this.gridMesh) {
            this.gridMesh.geometry.dispose();
            if (Array.isArray(this.gridMesh.material)) {
                this.gridMesh.material.forEach(m => m.dispose());
            } else {
                this.gridMesh.material.dispose();
            }
            this.scene.remove(this.gridMesh);
            this.gridMesh = null;
        }
    }
}
