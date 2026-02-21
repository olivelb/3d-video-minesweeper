import * as THREE from 'three';

const VERTEX_SHADER = `
uniform float uTime;
uniform float uLifeTime;
uniform float uSizeStart;
uniform float uStopTime;
uniform float uScale;
uniform vec3 uColorStart;
uniform vec3 uColorEnd;

attribute vec3 aVelocity;
attribute float aDelay;

varying vec3 vColor;
varying float vLifeRatio;

void main() {
    float elapsed = uTime / uLifeTime;
    
    // Not yet spawned
    if (elapsed + aDelay < 1.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vLifeRatio = 1.0;
        return;
    }
    
    float ageFract = fract(elapsed + aDelay);
    float cycleStartTime = uTime - (ageFract * uLifeTime);
    
    // Check if it should be stopped (cycle started after stop time)
    if (uStopTime >= 0.0 && cycleStartTime > uStopTime + 0.0001) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vLifeRatio = 1.0;
        return;
    }
    
    vLifeRatio = ageFract;
    
    float age = ageFract * uLifeTime;
    vec3 currentPos = position + aVelocity * age;
    
    vColor = mix(uColorStart, uColorEnd, ageFract);
    
    vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    gl_PointSize = uSizeStart * (uScale / -mvPosition.z);
}
`;

const FRAGMENT_SHADER = `
uniform sampler2D uTexture;
varying vec3 vColor;
varying float vLifeRatio;

void main() {
    if (vLifeRatio >= 1.0) discard;
    vec4 texColor = texture2D(uTexture, gl_PointCoord);
    gl_FragColor = vec4(vColor * texColor.rgb, texColor.a);
}
`;

export class ParticleSystem {
    constructor(scene, textures) {
        this.scene = scene;
        this.textures = textures;
        this.systems = []; // Active particle systems

        this._computeScale();
        this._resizeHandler = () => {
            this._computeScale();
            this.systems.forEach(sys => {
                if (sys.mesh && sys.mesh.material && sys.mesh.material.uniforms.uScale) {
                    sys.mesh.material.uniforms.uScale.value = this.scale;
                }
            });
        };
        window.addEventListener('resize', this._resizeHandler);
    }

    _computeScale() {
        // THREE.PointsMaterial default sizeAttenuation scale
        this.scale = window.innerHeight * 0.5;
    }

    createEmitter(position, type, options = {}) {
        let config = type === 'flag' ? {
            count: 1000,
            texture: this.textures['flag'],
            colorStart: new THREE.Color('yellow'),
            colorEnd: new THREE.Color('red'),
            sizeStart: 10,
            sizeEnd: 0,
            lifeTime: 0.30,
            rate: 15,
            speed: 40,
            spread: 0
        } : { // Fireworks
            count: 3000,
            texture: this.textures['particle'],
            colorStart: new THREE.Color('blue'),
            colorEnd: new THREE.Color('red'),
            sizeStart: 5,
            sizeEnd: 50,
            lifeTime: 2.0,
            rate: 0, // Burst
            speed: 200,
            spread: 100
        };

        if (options) Object.assign(config, options);

        const isBurst = config.rate === 0;

        // Ensure 1:1 identical visual matching for old count/rate behavior
        let actualCount = config.count;
        if (!isBurst) {
            actualCount = Math.min(config.count, Math.floor(config.rate * 60 * config.lifeTime));
            if (actualCount === 0) actualCount = 1; // Failsafe
        }

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(actualCount * 3);
        const velocities = new Float32Array(actualCount * 3);
        const delays = new Float32Array(actualCount);

        for (let i = 0; i < actualCount; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = config.speed * (0.5 + Math.random() * 0.5);

            velocities[i * 3] = speed * Math.sin(phi) * Math.cos(theta);
            velocities[i * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
            velocities[i * 3 + 2] = speed * Math.cos(phi);

            if (isBurst) {
                delays[i] = 1.0;
            } else {
                delays[i] = Math.random();
            }
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('aDelay', new THREE.BufferAttribute(delays, 1));

        const material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0.0 },
                uLifeTime: { value: config.lifeTime },
                uSizeStart: { value: config.sizeStart },
                uStopTime: { value: isBurst ? 0.0 : -1.0 },
                uScale: { value: this.scale },
                uColorStart: { value: config.colorStart },
                uColorEnd: { value: config.colorEnd },
                uTexture: { value: config.texture }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const points = new THREE.Points(geometry, material);
        points.position.copy(position);
        points.frustumCulled = false; // Expanding geometries must bypass simple culling
        this.scene.add(points);

        const system = {
            mesh: points,
            config: config,
            alive: true,
            isBurst: isBurst,
            time: 0.0
        };

        this.systems.push(system);
        return system;
    }

    update(dt) {
        for (let i = this.systems.length - 1; i >= 0; i--) {
            const sys = this.systems[i];

            sys.time += dt;
            sys.mesh.material.uniforms.uTime.value = sys.time;

            if (!sys.alive && sys.mesh.material.uniforms.uStopTime.value === -1.0) {
                sys.mesh.material.uniforms.uStopTime.value = sys.time;
            }

            let shouldDispose = false;

            if (sys.isBurst) {
                if (sys.time > sys.config.lifeTime) {
                    shouldDispose = true;
                }
            } else {
                const stopTime = sys.mesh.material.uniforms.uStopTime.value;
                if (!sys.alive && stopTime >= 0 && sys.time > stopTime + sys.config.lifeTime) {
                    shouldDispose = true;
                }
            }

            if (shouldDispose) {
                this.scene.remove(sys.mesh);
                sys.mesh.geometry.dispose();
                sys.mesh.material.dispose();
                this.systems.splice(i, 1);
            }
        }
    }

    stopAll() {
        this.systems.forEach(sys => sys.alive = false);
    }

    dispose() {
        this.stopAll();
        // Force cleanup
        this.systems.forEach(sys => {
            this.scene.remove(sys.mesh);
            sys.mesh.geometry.dispose();
            sys.mesh.material.dispose();
        });
        this.systems = [];
        window.removeEventListener('resize', this._resizeHandler);
    }
}
