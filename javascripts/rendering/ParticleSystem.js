import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene, textures) {
        this.scene = scene;
        this.textures = textures;
        this.systems = []; // Active particle systems
        // Reusable color object to avoid GC pressure in update loop
        this._tempColor = new THREE.Color();
    }

    createEmitter(position, type, options = {}) {
        let config = type === 'flag' ? {
            count: 1000,
            texture: this.textures['flag'],
            colorStart: new THREE.Color('yellow'),
            colorEnd: new THREE.Color('red'),
            sizeStart: 10,
            sizeEnd: 0,
            lifeTime: 0.3,
            rate: 10,
            speed: 50,
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

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(config.count * 3);
        const colors = new Float32Array(config.count * 3);

        // Simulation data
        const velocities = new Float32Array(config.count * 3);
        const ages = new Float32Array(config.count);
        const lives = new Float32Array(config.count); // 1 = alive, 0 = dead

        // Init off-screen
        for (let i = 0; i < config.count; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = -10000;
            positions[i * 3 + 2] = 0;
            lives[i] = 0;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            map: config.texture,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            size: config.sizeStart
        });

        const points = new THREE.Points(geometry, material);
        this.scene.add(points);

        const system = {
            mesh: points,
            config: config,
            velocities: velocities,
            ages: ages,
            lives: lives,
            alive: true,
            origin: position.clone()
        };

        // Burst immediately if rate is 0
        if (config.rate === 0) {
            for (let i = 0; i < config.count; i++) {
                this.spawnParticle(system, i, position);
            }
        }

        this.systems.push(system);
        return system;
    }

    spawnParticle(system, index, origin) {
        const positions = system.mesh.geometry.attributes.position.array;
        const velocities = system.velocities;

        system.lives[index] = 1;
        system.ages[index] = 0;

        positions[index * 3] = origin.x;
        positions[index * 3 + 1] = origin.y;
        positions[index * 3 + 2] = origin.z;

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = system.config.speed * (0.5 + Math.random() * 0.5);

        velocities[index * 3] = speed * Math.sin(phi) * Math.cos(theta);
        velocities[index * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
        velocities[index * 3 + 2] = speed * Math.cos(phi);
    }

    update(dt) {
        for (let i = this.systems.length - 1; i >= 0; i--) {
            const sys = this.systems[i];
            const positions = sys.mesh.geometry.attributes.position.array;
            const colors = sys.mesh.geometry.attributes.color.array;
            let activeParticles = 0;

            // Emission
            if (sys.alive && sys.config.rate > 0) {
                let spawned = 0;
                for (let k = 0; k < sys.lives.length && spawned < sys.config.rate; k++) {
                    if (sys.lives[k] === 0) {
                        this.spawnParticle(sys, k, sys.origin);
                        spawned++;
                    }
                }
            }

            // Update particles
            for (let j = 0; j < sys.config.count; j++) {
                if (sys.lives[j] > 0) {
                    activeParticles++;
                    sys.ages[j] += dt;

                    if (sys.ages[j] > sys.config.lifeTime) {
                        sys.lives[j] = 0;
                        positions[j * 3] = 0; positions[j * 3 + 1] = -10000; positions[j * 3 + 2] = 0;
                        continue;
                    }

                    // Physics
                    positions[j * 3] += sys.velocities[j * 3] * dt;
                    positions[j * 3 + 1] += sys.velocities[j * 3 + 1] * dt;
                    positions[j * 3 + 2] += sys.velocities[j * 3 + 2] * dt;

                    // Color Lerp (reuse temp object to avoid GC pressure)
                    const lifeRatio = sys.ages[j] / sys.config.lifeTime;
                    this._tempColor.copy(sys.config.colorStart).lerp(sys.config.colorEnd, lifeRatio);
                    colors[j * 3] = this._tempColor.r;
                    colors[j * 3 + 1] = this._tempColor.g;
                    colors[j * 3 + 2] = this._tempColor.b;
                }
            }

            sys.mesh.geometry.attributes.position.needsUpdate = true;
            sys.mesh.geometry.attributes.color.needsUpdate = true;

            if (!sys.alive && activeParticles === 0) {
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
    }
}
