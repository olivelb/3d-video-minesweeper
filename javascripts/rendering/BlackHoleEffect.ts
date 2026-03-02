import * as THREE from 'three';
import shockwaveVertexShader from './shaders/shockwave.vert.glsl.js';
import shockwaveFragmentShader from './shaders/shockwave.frag.glsl.js';

export const SHOCKWAVE_CONFIG = {
    SPEED: 20.0,
    FREQUENCY: 80.0,
    STRENGTH: 0.0015,
    LIFETIME: 1.0
};

const SHOCKWAVE_SHADER = {
    uniforms: {
        'tDiffuse': { value: null as THREE.Texture | null },
        'uCenter': { value: new THREE.Vector2(0.5, 0.5) },
        'uAspect': { value: 1.0 },
        'uTime': { value: 0.0 },
        'uLifeTime': { value: SHOCKWAVE_CONFIG.LIFETIME },
        'uSpeed': { value: SHOCKWAVE_CONFIG.SPEED },
        'uFrequency': { value: SHOCKWAVE_CONFIG.FREQUENCY },
        'uStrength': { value: SHOCKWAVE_CONFIG.STRENGTH }
    },
    vertexShader: shockwaveVertexShader,
    fragmentShader: shockwaveFragmentShader
};

interface ShockwaveEffect {
    center: THREE.Vector2;
    age: number;
    lifeTime: number;
    alive: boolean;
}

export class BlackHoleEffect {
    camera: THREE.Camera;
    effects: ShockwaveEffect[];
    shaderParams: Record<string, { value: any }>;
    passMaterial: any;

    constructor(scene: THREE.Scene, camera: THREE.Camera) {
        this.camera = camera;
        this.effects = [];
        this.shaderParams = THREE.UniformsUtils.clone(SHOCKWAVE_SHADER.uniforms);
        this.passMaterial = null;
    }

    getShader() {
        return {
            uniforms: this.shaderParams,
            vertexShader: SHOCKWAVE_SHADER.vertexShader,
            fragmentShader: SHOCKWAVE_SHADER.fragmentShader
        };
    }

    setPass(shaderPass: any): void {
        this.passMaterial = shaderPass.material;
    }

    trigger(position: THREE.Vector3, color: THREE.Color, lifeTime = SHOCKWAVE_CONFIG.LIFETIME): void {
        const screenPos = position.clone();
        screenPos.y = 5;
        screenPos.project(this.camera);

        const uvX = (screenPos.x + 1) / 2;
        const uvY = (screenPos.y + 1) / 2;

        this.effects.push({
            center: new THREE.Vector2(uvX, uvY),
            age: 0.0,
            lifeTime: lifeTime,
            alive: true
        });

        if (this.passMaterial) {
            this.passMaterial.uniforms.uCenter.value.set(uvX, uvY);
            this.passMaterial.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
            this.passMaterial.uniforms.uLifeTime.value = lifeTime;
        }
    }

    update(dt: number): void {
        if (!this.passMaterial) return;
        if (this.effects.length === 0) return;

        const effect = this.effects[0];
        effect.age += dt;

        this.passMaterial.uniforms.uTime.value = effect.age;

        if (effect.age >= effect.lifeTime) {
            this.effects.shift();
        }
    }

    isActive(): boolean {
        return this.effects.length > 0;
    }

    dispose(): void {
        this.effects = [];
    }
}
