import * as THREE from 'three';
import { gridToWorld } from './GridManager.js';
import type { ParticleSystem } from './ParticleSystem.js';

const FLAG_CONFIG = {
    FLAG_SIZE: 16,
    FLAG_HEIGHT: 12,
    CANVAS_SIZE: 128,
    DEFAULT_STYLE: 'particle' as const
};

export class FlagManager {
    scene: THREE.Scene;
    particleSystem: ParticleSystem;
    flagEmitters: Map<number, any>;
    flag2DMeshes: Map<number, THREE.Mesh>;
    flagStyle: string;
    flag2DGeometry: THREE.PlaneGeometry | null;
    flag2DMaterial: THREE.MeshBasicMaterial | null;
    flag2DTexture: THREE.CanvasTexture | null;
    _prevHoveredKey: number;

    constructor(scene: THREE.Scene, particleSystem: ParticleSystem) {
        this.scene = scene;
        this.particleSystem = particleSystem;
        this.flagEmitters = new Map();
        this.flag2DMeshes = new Map();
        this.flagStyle = FLAG_CONFIG.DEFAULT_STYLE;
        this.flag2DGeometry = null;
        this.flag2DMaterial = null;
        this.flag2DTexture = null;
        this._prevHoveredKey = -1;
        this._createFlag2DAssets();
    }

    _createFlag2DAssets(): void {
        this.flag2DGeometry = new THREE.PlaneGeometry(FLAG_CONFIG.FLAG_SIZE, FLAG_CONFIG.FLAG_SIZE);

        const canvas = document.createElement('canvas');
        canvas.width = FLAG_CONFIG.CANVAS_SIZE;
        canvas.height = FLAG_CONFIG.CANVAS_SIZE;
        const ctx = canvas.getContext('2d')!;

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

    _drawFlagIcon(ctx: CanvasRenderingContext2D, size: number): void {
        ctx.clearRect(0, 0, size, size);

        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        ctx.fillStyle = '#ff2222';
        ctx.beginPath();
        ctx.moveTo(20, 15);
        ctx.lineTo(108, 45);
        ctx.lineTo(20, 75);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ff6666';
        ctx.beginPath();
        ctx.moveTo(25, 25);
        ctx.lineTo(75, 42);
        ctx.lineTo(25, 55);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(20, 15);
        ctx.lineTo(108, 45);
        ctx.lineTo(20, 75);
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(12, 10, 8, 108);
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(12, 10, 4, 108);
    }

    _getKey(x: number, y: number): number {
        return x * 100000 + y;
    }

    _getWorldPosition(x: number, y: number, gridWidth: number, gridHeight: number): THREE.Vector3 {
        const { wx, wz } = gridToWorld(x, y, gridWidth, gridHeight);
        return new THREE.Vector3(wx, 0, wz);
    }

    updateFlag(x: number, y: number, active: boolean, gridWidth: number, gridHeight: number): void {
        const key = this._getKey(x, y);
        const pos = this._getWorldPosition(x, y, gridWidth, gridHeight);

        if (active) {
            this._addFlag(key, pos, x, y);
        } else {
            this._removeFlag(key);
        }
    }

    _addFlag(key: number, pos: THREE.Vector3, x: number, y: number): void {
        if (this.flagStyle === 'particle') {
            pos.y = 20;
            const emitter = this.particleSystem.createEmitter(pos, 'flag');
            this.flagEmitters.set(key, emitter);
        } else {
            const flag = this._create2DFlag(pos, x, y);
            this.scene.add(flag);
            this.flag2DMeshes.set(key, flag);
        }
    }

    _create2DFlag(position: THREE.Vector3, x: number, y: number): THREE.Mesh {
        const mesh = new THREE.Mesh(this.flag2DGeometry!, this.flag2DMaterial!);
        mesh.position.copy(position);
        mesh.position.y = FLAG_CONFIG.FLAG_HEIGHT;
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData.gridX = x;
        mesh.userData.gridY = y;
        mesh.userData.baseY = FLAG_CONFIG.FLAG_HEIGHT;
        mesh.renderOrder = 1;
        return mesh;
    }

    _removeFlag(key: number): void {
        if (this.flagEmitters.has(key)) {
            const emitter = this.flagEmitters.get(key);
            emitter.alive = false;
            this.flagEmitters.delete(key);
        }

        if (this.flag2DMeshes.has(key)) {
            const flag = this.flag2DMeshes.get(key)!;
            this.scene.remove(flag);
            this.flag2DMeshes.delete(key);
        }
    }

    setStyle(style: string, game: any): string {
        this.flagStyle = style;

        const activeFlags: { x: number; y: number }[] = [];
        for (let x = 0; x < game.width; x++) {
            for (let y = 0; y < game.height; y++) {
                if (game.flags[x][y]) {
                    activeFlags.push({ x, y });
                }
            }
        }

        this.clearAll();

        for (const { x, y } of activeFlags) {
            this.updateFlag(x, y, true, game.width, game.height);
        }

        return this.flagStyle;
    }

    animate(hoveredX: number, hoveredY: number): void {
        if (this.flagStyle === 'particle') return;

        const hoveredKey = (hoveredX >= 0 && hoveredY >= 0)
            ? this._getKey(hoveredX, hoveredY)
            : -1;

        // Reset previous hovered flag (if different from current)
        if (this._prevHoveredKey !== -1 && this._prevHoveredKey !== hoveredKey) {
            const prev = this.flag2DMeshes.get(this._prevHoveredKey);
            if (prev) {
                prev.scale.set(1, 1, 1);
                prev.position.y = prev.userData.baseY;
            }
        }

        // Animate current hovered flag
        if (hoveredKey !== -1) {
            const flag = this.flag2DMeshes.get(hoveredKey);
            if (flag) {
                const time = Date.now() / 1000;
                const pulse = Math.sin(time * 10);
                const scale = 1.0 + pulse * 0.15;
                flag.scale.set(scale, scale, 1);
                flag.position.y = flag.userData.baseY + pulse * 2;
            }
        }

        this._prevHoveredKey = hoveredKey;
    }

    clearAll(): void {
        this.flagEmitters.forEach(emitter => emitter.alive = false);
        this.flagEmitters.clear();

        this.flag2DMeshes.forEach(flag => this.scene.remove(flag));
        this.flag2DMeshes.clear();
    }

    dispose(): void {
        this.clearAll();

        if (this.flag2DGeometry) this.flag2DGeometry.dispose();
        if (this.flag2DMaterial) this.flag2DMaterial.dispose();
        if (this.flag2DTexture) this.flag2DTexture.dispose();
    }
}
