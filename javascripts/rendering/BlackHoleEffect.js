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

    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uCenter;
        uniform float uAspect;
        uniform float uTime;
        uniform float uLifeTime;
        uniform float uActive;
        uniform float uSpeed;
        uniform float uFrequency;
        uniform float uStrength;
        varying vec2 vUv;

        void main() {
            if (uActive < 0.5) {
                gl_FragColor = texture2D(tDiffuse, vUv);
                return;
            }

            float progress = uTime / uLifeTime;
            
            // Correct for aspect ratio to keep the ripple perfectly circular
            vec2 p = vUv - uCenter;
            p.x *= uAspect;
            
            float dist = length(p);
            
            // Create an expanding ring for the ripple
            // -----------------------------------------
            // distance-based dampening (closer to center = stronger, further = weaker)
            // progress-based dampening (fades out as it ages)
            float dampening = smoothstep(0.0, 0.1, dist) * smoothstep(1.0, 0.8, progress);
            
            // The core ripple math: multiple concentric waves radiating outward
            // dist * frequency - uTime * speed
            // Higher frequency = more rings
            float frequency = uFrequency;
            float speed = uSpeed; 
            
            // Only show ripple where the "wavefront" has reached
            // The wave expands at roughly 1.5 radius over 1.0 lifeTime
            float waveFront = progress * 1.5;
            float waveMask = smoothstep(waveFront + 0.1, waveFront - 0.1, dist);
            
            // Calculate raw sine wave distortion
            // Decays by 1/dist to simulate energy spread
            float rawWave = sin(dist * frequency - uTime * speed) / (dist + 0.1);
            
            // Base strength of the refraction (very low for realistic glass/water)
            // Apply exponential time-damping so amplitude drops from STRENGTH to 0 over LIFETIME
            float timeDamping = pow(1.0 - progress, 2.0); // quadratic decay
            float strength = uStrength * timeDamping;
            
            // Final distortion amount
            float waveEffect = rawWave * dampening * waveMask * strength;
            
            // Distort UV radially
            vec2 dir = normalize(p);
            dir.x /= uAspect; // Re-adjust aspect ratio for the UV distortion addition
            
            // Calculate distorted UV
            vec2 distortedUv = vUv + dir * waveEffect;
            
            // Handle edges smoothly (mirroring instead of clamping to avoid black bars)
            if(distortedUv.x < 0.0) distortedUv.x = -distortedUv.x;
            if(distortedUv.x > 1.0) distortedUv.x = 2.0 - distortedUv.x;
            if(distortedUv.y < 0.0) distortedUv.y = -distortedUv.y;
            if(distortedUv.y > 1.0) distortedUv.y = 2.0 - distortedUv.y;
            
            // Sample the scene texture at the distorted UV
            // We output PURE texture color, NO added highlights to prevent grey/white bands
            vec4 texColor = texture2D(tDiffuse, distortedUv);
            
            gl_FragColor = texColor;
        }
    `
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
