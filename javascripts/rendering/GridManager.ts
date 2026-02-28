import * as THREE from 'three';

export const GRID_CONFIG = {
    CUBE_SIZE: 20,
    CUBE_SPACING: 22,
    NUMBER_PLANE_SIZE: 16,
    NUMBER_HEIGHT: 11
};

export function gridToWorld(x: number, y: number, gridWidth: number, gridHeight: number): { wx: number; wz: number } {
    const half = GRID_CONFIG.CUBE_SPACING / 2;
    return {
        wx: -(gridWidth * half) + x * GRID_CONFIG.CUBE_SPACING,
        wz: (gridHeight * half) - y * GRID_CONFIG.CUBE_SPACING
    };
}

export function worldToGrid(wx: number, wz: number, gridWidth: number, gridHeight: number): { x: number; y: number } {
    const half = GRID_CONFIG.CUBE_SPACING / 2;
    return {
        x: Math.round((wx + gridWidth * half) / GRID_CONFIG.CUBE_SPACING),
        y: Math.round((gridHeight * half - wz) / GRID_CONFIG.CUBE_SPACING)
    };
}

interface ExplosionVector {
    dx: number;
    dy: number;
}

interface ActiveHint {
    index: number;
    x: number;
    y: number;
    age: number;
    lifeTime: number;
    startColor: THREE.Color;
    endColor: THREE.Color;
}

export class GridManager {
    scene: THREE.Scene;
    game: any;
    mediaTexture: THREE.Texture;
    textures: Record<string | number, THREE.Texture>;
    gridMesh: THREE.InstancedMesh | null;
    dummy: THREE.Object3D;
    numberMeshes: THREE.Mesh[];
    explosionVectors: ExplosionVector[];
    lastHoveredId: number;
    isExploding: boolean;
    explosionTime: number;
    _hoverColor: THREE.Color;
    _blackColor: THREE.Color;
    _colorLerp: THREE.Color;
    activeHints: ActiveHint[];
    _constraintHighlights: number[] | null;

    constructor(scene: THREE.Scene, game: any, mediaTexture: THREE.Texture, textures: Record<string | number, THREE.Texture>) {
        this.scene = scene;
        this.game = game;
        this.mediaTexture = mediaTexture;
        this.textures = textures;
        this.gridMesh = null;
        this.dummy = new THREE.Object3D();
        this.numberMeshes = [];
        this.explosionVectors = [];
        this.lastHoveredId = -1;
        this.isExploding = false;
        this.explosionTime = 0;
        this._hoverColor = new THREE.Color();
        this._blackColor = new THREE.Color(0x000000);
        this._colorLerp = new THREE.Color();
        this.activeHints = [];
        this._constraintHighlights = null;
        this._createGrid();
    }

    _createGrid(): void {
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

    _createMaterials(): THREE.MeshBasicMaterial[] {
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

        const materials = [
            new THREE.MeshBasicMaterial({ color: 0xffffff }),
            new THREE.MeshBasicMaterial({ color: 0xffffff }),
            new THREE.MeshBasicMaterial({ color: 0xffffff }),
            new THREE.MeshBasicMaterial({ color: 0xffffff }),
            videoMaterial,
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        ];

        return materials;
    }

    _initializeInstances(aGridPos: Float32Array): void {
        let i = 0;

        for (let x = 0; x < this.game.width; x++) {
            for (let y = 0; y < this.game.height; y++) {
                const { wx, wz } = gridToWorld(x, y, this.game.width, this.game.height);
                this.dummy.position.set(wx, 0, wz);
                this.dummy.rotation.x = -Math.PI / 2;
                this.dummy.updateMatrix();
                this.gridMesh!.setMatrixAt(i, this.dummy.matrix);
                this.gridMesh!.setColorAt(i, new THREE.Color(0x000000));

                aGridPos[i * 2] = x;
                aGridPos[i * 2 + 1] = y;

                this.explosionVectors[i] = {
                    dx: 0.05 * (0.5 - Math.random()),
                    dy: 0.05 * (0.5 - Math.random())
                };

                i++;
            }
        }
    }

    updateCellVisual(x: number, y: number, value: number): void {
        const index = x * this.game.height + y;
        this._hideInstance(index);

        if (value === 10) {
            this._createOverlayMesh(x, y, this.textures['bomb'], 18, 2);
        } else if (value > 0 && value <= 8) {
            this._createOverlayMesh(x, y, this.textures[value], GRID_CONFIG.NUMBER_PLANE_SIZE, 1);
        }
    }

    createDeathFlagMesh(x: number, y: number): void {
        const index = x * this.game.height + y;
        this._hideInstance(index);
        this._createOverlayMesh(x, y, this.textures['deathFlag'], 18, 2);
    }

    _hideInstance(index: number): void {
        this.gridMesh!.getMatrixAt(index, this.dummy.matrix);
        this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.gridMesh!.setMatrixAt(index, this.dummy.matrix);
        this.gridMesh!.instanceMatrix.needsUpdate = true;
    }

    _createOverlayMesh(x: number, y: number, texture: THREE.Texture, size: number, renderOrder: number): void {
        const planeGeo = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
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
        mesh.renderOrder = renderOrder;
        this.scene.add(mesh);
        this.numberMeshes.push(mesh);
    }

    updateHover(instanceId: number, useHoverHelper: boolean): void {
        if (this.lastHoveredId !== instanceId && this.lastHoveredId !== -1) {
            this.resetInstance(this.lastHoveredId);
        }

        if (useHoverHelper && instanceId !== -1 && !this.isExploding && !this.game.victory) {
            this.gridMesh!.getMatrixAt(instanceId, this.dummy.matrix);
            this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

            if (this.dummy.scale.x > 0.1) {
                const pulse = Math.sin(Date.now() * 0.01);
                const scale = 1.0 + pulse * 0.1;
                this.dummy.scale.set(scale, scale, scale);
                this.dummy.updateMatrix();
                this.gridMesh!.setMatrixAt(instanceId, this.dummy.matrix);

                const colorVal = (pulse + 1.0) * 0.2;
                this.gridMesh!.setColorAt(
                    instanceId,
                    this._hoverColor.setRGB(colorVal, colorVal, colorVal)
                );

                this.gridMesh!.instanceMatrix.needsUpdate = true;
                this.gridMesh!.instanceColor!.needsUpdate = true;
                this.lastHoveredId = instanceId;
                return;
            }
        }

        if (instanceId === -1) {
            this.lastHoveredId = -1;
        }
    }

    resetInstance(instanceId: number): void {
        const y = instanceId % this.game.height;
        const x = Math.floor(instanceId / this.game.height);

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

        this.gridMesh!.setMatrixAt(instanceId, this.dummy.matrix);
        this.gridMesh!.setColorAt(instanceId, this._blackColor);
        this.gridMesh!.instanceMatrix.needsUpdate = true;
        this.gridMesh!.instanceColor!.needsUpdate = true;
    }

    resetAllInstances(): void {
        for (let i = 0; i < this.game.width * this.game.height; i++) {
            this.resetInstance(i);
        }
    }

    showHint(x: number, y: number, type: string): void {
        const index = x * this.game.height + y;
        const color = type === 'safe'
            ? new THREE.Color(0x00ff00)
            : new THREE.Color(0xff0000);

        const originalColor = new THREE.Color(0x000000);
        this.gridMesh!.setColorAt(index, color);
        this.gridMesh!.instanceColor!.needsUpdate = true;

        this.activeHints.push({
            index, x, y,
            age: 0,
            lifeTime: 2.5,
            startColor: color.clone(),
            endColor: originalColor.clone()
        });
    }

    updateAnimations(dt: number): void {
        if (this.activeHints.length === 0) return;

        let needsUpdate = false;
        const colorLerp = this._colorLerp;

        for (let i = this.activeHints.length - 1; i >= 0; i--) {
            const hint = this.activeHints[i];

            if (this.game.hintMode) {
                hint.age = 0;
            } else {
                hint.age += dt;
            }

            const progress = Math.min(hint.age / hint.lifeTime, 1.0);
            colorLerp.copy(hint.startColor).lerp(hint.endColor, progress);
            this.gridMesh!.setColorAt(hint.index, colorLerp);
            needsUpdate = true;

            if (progress >= 1.0) {
                this.activeHints.splice(i, 1);
            }
        }

        if (needsUpdate) {
            this.gridMesh!.instanceColor!.needsUpdate = true;
        }
    }

    highlightConstraints(cells: { x: number; y: number }[]): void {
        this._constraintHighlights = [];
        const blue = new THREE.Color(0x4488ff);
        for (const { x, y } of cells) {
            const index = x * this.game.height + y;
            this._constraintHighlights.push(index);
            this.gridMesh!.setColorAt(index, blue);
        }
        this.gridMesh!.instanceColor!.needsUpdate = true;
    }

    clearConstraintHighlights(): void {
        if (!this._constraintHighlights) return;
        const black = new THREE.Color(0x000000);
        for (const index of this._constraintHighlights) {
            this.gridMesh!.setColorAt(index, black);
        }
        this.gridMesh!.instanceColor!.needsUpdate = true;
        this._constraintHighlights = null;
    }

    triggerExplosion(): void {
        this.isExploding = true;
        this.explosionTime = 0;
        this.numberMeshes.forEach(mesh => mesh.visible = false);
    }

    resetExplosion(): void {
        this.isExploding = false;
        this.explosionTime = 0;
        this.numberMeshes.forEach(mesh => mesh.visible = true);
        this.resetAllInstances();
    }

    updateMediaTexture(texture: THREE.Texture): void {
        if (this.gridMesh && this.gridMesh.material && Array.isArray(this.gridMesh.material)) {
            const videoMaterialIndex = 4;
            (this.gridMesh.material[videoMaterialIndex] as THREE.MeshBasicMaterial).map = texture;
            (this.gridMesh.material[videoMaterialIndex] as THREE.MeshBasicMaterial).needsUpdate = true;
        }
    }

    getCoordinatesFromInstance(instanceId: number): { x: number; y: number } {
        const y = instanceId % this.game.height;
        const x = Math.floor(instanceId / this.game.height);
        return { x, y };
    }

    getInstanceFromCoordinates(x: number, y: number): number {
        return x * this.game.height + y;
    }

    hide(): void {
        this.gridMesh!.visible = false;
        this.numberMeshes.forEach(mesh => mesh.visible = false);
    }

    show(): void {
        this.gridMesh!.visible = true;
        this.numberMeshes.forEach(mesh => mesh.visible = true);
    }

    dispose(): void {
        this.numberMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if ((mesh.material as THREE.MeshBasicMaterial).map) (mesh.material as THREE.MeshBasicMaterial).map!.dispose();
                (mesh.material as THREE.Material).dispose();
            }
        });
        this.numberMeshes = [];

        if (this.gridMesh) {
            this.scene.remove(this.gridMesh);
            if (this.gridMesh.geometry) this.gridMesh.geometry.dispose();
            if (Array.isArray(this.gridMesh.material)) {
                this.gridMesh.material.forEach(m => {
                    if ((m as THREE.MeshBasicMaterial).map) (m as THREE.MeshBasicMaterial).map!.dispose();
                    m.dispose();
                });
            }
        }
    }
}
