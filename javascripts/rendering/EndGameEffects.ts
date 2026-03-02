import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { t } from '../i18n.js';
import type { Font } from 'three/addons/loaders/FontLoader.js';
import type { ParticleSystem } from './ParticleSystem.js';

const EFFECT_CONFIG = {
    TEXT_SIZE: 70,
    TEXT_DEPTH: 20,
    TEXT_DISTANCE: 400,
    AUTO_RETURN_FRAMES: 600,
    FIREWORK_COUNT: 5
};

interface SecondaryExplosion {
    frame: number;
    pos: THREE.Vector3;
    color: THREE.Color;
}

export class EndGameEffects {
    scene: THREE.Scene;
    camera: THREE.Camera;
    particleSystem: ParticleSystem;
    font: Font;
    textMesh: THREE.Mesh | null;
    textLightGroup: THREE.Group | null;
    endGameTime: number;
    fireworksActive: boolean;
    secondaryQueue: SecondaryExplosion[];
    onAutoReturn: (() => void) | null;
    _direction: THREE.Vector3;

    constructor(scene: THREE.Scene, camera: THREE.Camera, particleSystem: ParticleSystem, font: Font) {
        this.scene = scene;
        this.camera = camera;
        this.particleSystem = particleSystem;
        this.font = font;
        this.textMesh = null;
        this.textLightGroup = null;
        this.endGameTime = 0;
        this.fireworksActive = false;
        this.secondaryQueue = [];
        this.onAutoReturn = null;
        this._direction = new THREE.Vector3();
    }

    showText(message: string, color: number): void {
        this.reset();

        const geometry = new TextGeometry(message, {
            font: this.font,
            size: EFFECT_CONFIG.TEXT_SIZE,
            depth: EFFECT_CONFIG.TEXT_DEPTH,
            curveSegments: 8,
            bevelEnabled: true,
            bevelThickness: 4,
            bevelSize: 2,
            bevelSegments: 5
        });

        geometry.computeBoundingBox();
        const centerOffsetX = -0.5 * (
            geometry.boundingBox!.max.x - geometry.boundingBox!.min.x
        );
        const centerOffsetY = -0.5 * (
            geometry.boundingBox!.max.y - geometry.boundingBox!.min.y
        );
        geometry.translate(centerOffsetX, centerOffsetY, 0);
        geometry.computeVertexNormals();

        const baseColor = new THREE.Color(color);
        const darkColor = baseColor.clone().multiplyScalar(0.4);

        const materials = [
            new THREE.MeshStandardMaterial({
                color: baseColor,
                roughness: 0.2,
                metalness: 0.8,
                emissive: baseColor.clone().multiplyScalar(0.1)
            }),
            new THREE.MeshStandardMaterial({
                color: darkColor,
                roughness: 0.6,
                metalness: 0.5
            })
        ];

        this.textMesh = new THREE.Mesh(geometry, materials);

        this.textLightGroup = new THREE.Group();

        const keyLight = new THREE.PointLight(0xffffff, 2.0, 0);
        keyLight.position.set(200, 200, 200);
        this.textLightGroup.add(keyLight);

        const rimLight = new THREE.PointLight(baseColor, 3.0, 0);
        rimLight.position.set(-200, -200, -100);
        this.textLightGroup.add(rimLight);

        const textAmbient = new THREE.AmbientLight(0xffffff, 0.4);
        this.textLightGroup.add(textAmbient);

        this.textMesh.add(this.textLightGroup);
        this.scene.add(this.textMesh);
    }

    triggerWin(): void {
        this.showText(t('game.win'), 0x00ff00);
        this.fireworksActive = true;
        this.secondaryQueue = [];

        for (let i = 0; i < EFFECT_CONFIG.FIREWORK_COUNT; i++) {
            this._spawnExplosion('primary');
        }
    }

    triggerLoss(): void {
        this.showText(t('game.loss'), 0xff0000);
        this.fireworksActive = false;
        this.secondaryQueue = [];
    }

    _spawnExplosion(type: string, basePos: THREE.Vector3 | null = null, baseColor: THREE.Color | null = null): void {
        const isPrimary = type === 'primary';

        let pos: THREE.Vector3;
        if (basePos) {
            pos = new THREE.Vector3(
                basePos.x + (Math.random() - 0.5) * 150,
                basePos.y + (Math.random() - 0.5) * 150,
                basePos.z + (Math.random() - 0.5) * 150
            );
        } else {
            pos = new THREE.Vector3(
                (Math.random() - 0.5) * 400,
                (Math.random() - 0.5) * 300 + 100,
                (Math.random() - 0.5) * 400
            );
        }

        let colorStart: THREE.Color, colorEnd: THREE.Color;
        if (baseColor) {
            colorStart = baseColor.clone();
            colorStart.offsetHSL((Math.random() - 0.5) * 0.2, 0, 0);
            colorEnd = new THREE.Color(Math.random(), Math.random(), Math.random());
        } else {
            colorStart = new THREE.Color(Math.random(), Math.random(), Math.random());
            colorEnd = new THREE.Color(Math.random(), Math.random(), Math.random());
        }

        const count = isPrimary ? 8000 : 3000;
        const sizeStart = isPrimary ? 16 : 10;
        const speed = isPrimary ? 700 : 400;
        const lifeTime = isPrimary ? 2.5 + Math.random() : 1.5 + Math.random();

        this.particleSystem.createEmitter(pos, 'firework', {
            count, sizeStart, colorStart, colorEnd, lifeTime, speed
        });

        if (isPrimary && Math.random() < 0.8 && this.endGameTime < EFFECT_CONFIG.AUTO_RETURN_FRAMES - 100) {
            const numSecondaries = 2 + Math.floor(Math.random() * 4);
            for (let i = 0; i < numSecondaries; i++) {
                const delayFrames = 30 + Math.floor(Math.random() * 60);
                this.secondaryQueue.push({
                    frame: this.endGameTime + delayFrames,
                    pos: pos,
                    color: colorStart
                });
            }
        }
    }

    update(gameEnded: boolean): void {
        if (this.textMesh) {
            const direction = this._direction;
            this.camera.getWorldDirection(direction);
            this.textMesh.position.copy(this.camera.position)
                .add(direction.multiplyScalar(EFFECT_CONFIG.TEXT_DISTANCE));
            this.textMesh.quaternion.copy(this.camera.quaternion);
        }

        if (gameEnded) {
            this.endGameTime++;

            if (this.fireworksActive) {
                if (Math.random() < 0.04 && this.endGameTime < EFFECT_CONFIG.AUTO_RETURN_FRAMES - 80) {
                    this._spawnExplosion('primary');
                }

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

    reset(): void {
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

    dispose(): void {
        this.reset();
        this.onAutoReturn = null;
    }
}
