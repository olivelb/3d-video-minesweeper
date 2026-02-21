/**
 * Shockwave Effect Module 
 * 
 * Manages the shockwave visual effect used for hints.
 * Generates an expanding ripple wave ring that dynamically distorts the screen
 * using a Post-Processing ShaderPass.
 * 
 * @module BlackHoleEffect
 * @requires three
 */
import * as THREE from 'three';
import shockwaveVertexShader from './shaders/shockwave.vert.glsl.js';
import shockwaveFragmentShader from './shaders/shockwave.frag.glsl.js';

export const SHOCKWAVE_CONFIG = {
    // How fast the ripple expands outward
    SPEED: 20.0,
    // How many rings the ripple has rings 
    FREQUENCY: 80.0,
    // The visual intensity/distortion amount of the refraction (very low for realistic glass)
    STRENGTH: 0.0015,
    // Duration of the effect in seconds
    LIFETIME: 1.0
};

const SHOCKWAVE_SHADER = {
    uniforms: {
        'tDiffuse': { value: null },
        'uCenter': { value: new THREE.Vector2(0.5, 0.5) },
        'uAspect': { value: 1.0 },
        'uTime': { value: 0.0 },
        'uLifeTime': { value: SHOCKWAVE_CONFIG.LIFETIME },
        'uActive': { value: 0.0 },
        'uSpeed': { value: SHOCKWAVE_CONFIG.SPEED },
        'uFrequency': { value: SHOCKWAVE_CONFIG.FREQUENCY },
        'uStrength': { value: SHOCKWAVE_CONFIG.STRENGTH }
    },

    vertexShader: shockwaveVertexShader,
    fragmentShader: shockwaveFragmentShader
};

export class BlackHoleEffect {
    constructor(scene, camera) {
        this.camera = camera;
        this.effects = [];
        this.shaderParams = THREE.UniformsUtils.clone(SHOCKWAVE_SHADER.uniforms);
        this.passMaterial = null; // Will be set by Renderer
    }

    getShader() {
        return {
            uniforms: this.shaderParams,
            vertexShader: SHOCKWAVE_SHADER.vertexShader,
            fragmentShader: SHOCKWAVE_SHADER.fragmentShader
        };
    }

    setPass(shaderPass) {
        this.passMaterial = shaderPass.material;
    }
    trigger(position, color, lifeTime = SHOCKWAVE_CONFIG.LIFETIME) {
        // Project 3D world position to 2D Screen UV coordinates
        const screenPos = position.clone();
        screenPos.y = 5; // Raise slightly above grid
        screenPos.project(this.camera);

        // (-1 to 1) -> (0 to 1)
        const uvX = (screenPos.x + 1) / 2;
        const uvY = (screenPos.y + 1) / 2;

        this.effects.push({
            center: new THREE.Vector2(uvX, uvY),
            age: 0.0,
            lifeTime: lifeTime,
            alive: true
        });

        // Activate shader on the exact material instance used by Composer
        if (this.passMaterial) {
            this.passMaterial.uniforms.uActive.value = 1.0;
            this.passMaterial.uniforms.uCenter.value.set(uvX, uvY);
            this.passMaterial.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
            this.passMaterial.uniforms.uLifeTime.value = lifeTime;
        }
    }

    update(dt) {
        if (!this.passMaterial) return;

        if (this.effects.length === 0) {
            this.passMaterial.uniforms.uActive.value = 0.0;
            return;
        }

        // We only cleanly support one screen-space ripple at a time for simplicity
        const effect = this.effects[0];
        effect.age += dt;

        this.passMaterial.uniforms.uTime.value = effect.age;

        if (effect.age >= effect.lifeTime) {
            this.effects.shift();
            if (this.effects.length === 0) {
                this.passMaterial.uniforms.uActive.value = 0.0;
            }
        }
    }

    isActive() {
        return this.effects.length > 0;
    }

    dispose() {
        this.effects = [];
        if (this.passMaterial) this.passMaterial.uniforms.uActive.value = 0.0;
    }
}
