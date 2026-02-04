import * as THREE from 'three';

/**
 * Manages game audio using Web Audio API and Three.js Audio.
 * Uses procedural synthesis to avoid external asset dependencies for now.
 */
export class SoundManager {
    constructor(camera) {
        this.camera = camera;
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);

        this.audioContext = this.listener.context;
        this.isMuted = false;

        // Volume master
        this.masterVolume = 0.5;
        this.listener.setMasterVolume(this.masterVolume);
    }

    setMute(muted) {
        this.isMuted = muted;
        this.listener.setMasterVolume(muted ? 0 : this.masterVolume);
    }

    resumeContext() {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    play(soundName) {
        if (this.isMuted) return;
        this.resumeContext();

        switch (soundName) {
            case 'click':
                this.playTone(800, 'square', 0.05, 0.1);
                break;
            case 'flag':
                this.playTone(600, 'sine', 0.1, 0.1);
                break;
            case 'explosion':
                this.playNoise(0.5); // White noise burst
                break;
            case 'win':
                this.playWinFanfare();
                break;
            case 'hover':
                this.playTone(200, 'sine', 0.01, 0.05); // Very short blip
                break;
        }
    }

    /**
     * Simple tone generator
     */
    playTone(freq, type, duration, volume = 0.1) {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.audioContext.currentTime);

        gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.listener.getInput()); // Connect to Three.js listener

        osc.start();
        osc.stop(this.audioContext.currentTime + duration);
    }

    /**
     * Noise generator for explosions
     */
    playNoise(duration) {
        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.5, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        noise.connect(gain);
        gain.connect(this.listener.getInput());

        noise.start();
    }

    /**
     * Arpeggio for victory
     */
    playWinFanfare() {
        const now = this.audioContext.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            osc.frequency.value = freq;
            osc.type = 'square';

            const start = now + i * 0.1;
            const duration = 0.2;

            gain.gain.setValueAtTime(0.1, start);
            gain.gain.exponentialRampToValueAtTime(0.01, start + duration);

            osc.connect(gain);
            gain.connect(this.listener.getInput());

            osc.start(start);
            osc.stop(start + duration);
        });
    }
}
