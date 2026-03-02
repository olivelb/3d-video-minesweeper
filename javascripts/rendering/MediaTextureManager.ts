import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import type { Font } from 'three/addons/loaders/FontLoader.js';
import { Logger } from '../utils/Logger.js';

export class MediaTextureManager {
    textures: Record<string | number, THREE.Texture>;
    mediaTexture: THREE.Texture | null;
    placeholderTexture: THREE.Texture | null;
    videoElement: HTMLVideoElement | null;
    videoCheckInterval: ReturnType<typeof setInterval> | null;
    font: Font | null;

    constructor() {
        this.textures = {};
        this.mediaTexture = null;
        this.placeholderTexture = null;
        this.videoElement = null;
        this.videoCheckInterval = null;
        this.font = null;
    }

    async loadResources(bgName: string): Promise<void> {
        const loader = new THREE.TextureLoader();

        for (let i = 1; i <= 8; i++) {
            this.textures[i] = await this.loadTexture(loader, `images/j${i}.png`);
        }

        this.textures['flag'] = await this.loadTexture(loader, 'images/star.png');
        this.textures['particle'] = await this.loadTexture(loader, 'images/flare.png');
        this.textures['bomb'] = this._createBombTexture();
        this.textures['deathFlag'] = this._createDeathFlagTexture();

        const customImage = document.getElementById('custom-image-source') as HTMLImageElement | null;
        const video = document.getElementById('image') as HTMLVideoElement | HTMLImageElement | null;

        if (customImage && customImage.src && customImage.src !== '' && customImage.src !== window.location.href) {
            this.mediaTexture = new THREE.Texture(customImage);
            this.mediaTexture.minFilter = THREE.LinearFilter;
            this.mediaTexture.magFilter = THREE.LinearFilter;
            this.mediaTexture.colorSpace = THREE.SRGBColorSpace;
            this.mediaTexture.needsUpdate = true;

            customImage.onload = () => {
                this.mediaTexture!.needsUpdate = true;
            };
            this.videoElement = null;

        } else if (video) {
            this.videoElement = video as HTMLVideoElement;

            if (video.tagName === 'VIDEO') {
                this.mediaTexture = new THREE.VideoTexture(video as HTMLVideoElement);
                this.mediaTexture.minFilter = THREE.LinearFilter;
                this.mediaTexture.magFilter = THREE.LinearFilter;
                this.mediaTexture.format = THREE.RGBAFormat;
                this.mediaTexture.colorSpace = THREE.SRGBColorSpace;

                if ((video as HTMLVideoElement).paused) {
                    (video as HTMLVideoElement).play().catch(() => {
                        Logger.log('MediaManager', 'Waiting for user interaction to play video');
                    });
                }
            } else {
                this.mediaTexture = new THREE.Texture(video as HTMLImageElement);
                this.mediaTexture.minFilter = THREE.LinearFilter;
                this.mediaTexture.magFilter = THREE.LinearFilter;
                this.mediaTexture.colorSpace = THREE.SRGBColorSpace;
                this.mediaTexture.needsUpdate = true;

                video.onload = () => {
                    this.mediaTexture!.needsUpdate = true;
                };
            }
        }

        this.font = await this.loadFont('https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json');

        Logger.log('MediaManager', 'Resources loaded');
    }

    loadTexture(loader: THREE.TextureLoader, url: string): Promise<THREE.Texture> {
        return new Promise((resolve) => {
            loader.load(url, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                resolve(tex);
            }, undefined, () => {
                console.warn(`Failed to load ${url}`);
                resolve(null as any);
            });
        });
    }

    loadFont(url: string): Promise<Font | null> {
        return new Promise((resolve) => {
            const loader = new FontLoader();
            loader.load(url, (font) => {
                resolve(font);
            }, undefined, () => {
                console.warn(`Failed to load font ${url}`);
                resolve(null);
            });
        });
    }

    getBackgroundTexture(): THREE.Texture {
        if (this.mediaTexture) return this.mediaTexture;
        return this.placeholderTexture || new THREE.Texture();
    }

    _createBombTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;

        ctx.clearRect(0, 0, 128, 128);

        const cx = 64, cy = 64;
        const radius = 35;

        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 20;

        ctx.fillStyle = '#222222';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#222222';
        const spikeCount = 8;
        for (let i = 0; i < spikeCount; i++) {
            const angle = (i / spikeCount) * Math.PI * 2 - Math.PI / 2;
            const spikeLength = 18;
            const spikeWidth = 8;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(-spikeWidth / 2, -radius + 5);
            ctx.lineTo(0, -radius - spikeLength);
            ctx.lineTo(spikeWidth / 2, -radius + 5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        const grad = ctx.createRadialGradient(cx - 10, cy - 10, 0, cx, cy, radius);
        grad.addColorStop(0, 'rgba(100, 100, 100, 0.6)');
        grad.addColorStop(0.5, 'rgba(50, 50, 50, 0.3)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#444444';
        ctx.beginPath();
        ctx.arc(cx, cy - radius + 8, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy - radius + 2);
        ctx.quadraticCurveTo(cx + 15, cy - radius - 15, cx + 5, cy - radius - 25);
        ctx.stroke();

        ctx.fillStyle = '#ffaa00';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cx + 5, cy - radius - 25, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(30, 30);
        ctx.lineTo(98, 98);
        ctx.moveTo(98, 30);
        ctx.lineTo(30, 98);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, 30);
        ctx.lineTo(98, 98);
        ctx.moveTo(98, 30);
        ctx.lineTo(30, 98);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    }

    _createDeathFlagTexture(): THREE.CanvasTexture {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        ctx.clearRect(0, 0, size, size);

        ctx.save();
        ctx.translate(64, 64);
        ctx.rotate(Math.PI / 4);
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#cc0000';
        ctx.fillRect(-40, -40, 80, 80);
        ctx.shadowBlur = 0;
        const dGrad = ctx.createLinearGradient(-40, -40, 40, 40);
        dGrad.addColorStop(0, '#ff2222');
        dGrad.addColorStop(0.5, '#cc0000');
        dGrad.addColorStop(1, '#880000');
        ctx.fillStyle = dGrad;
        ctx.fillRect(-36, -36, 72, 72);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 3;
        ctx.strokeRect(-38, -38, 76, 76);
        ctx.restore();

        const sx = 64, sy = 52;

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(sx, sy - 2, 22, Math.PI, 0, false);
        ctx.lineTo(sx + 22, sy + 8);
        ctx.quadraticCurveTo(sx + 22, sy + 18, sx + 12, sy + 18);
        ctx.lineTo(sx - 12, sy + 18);
        ctx.quadraticCurveTo(sx - 22, sy + 18, sx - 22, sy + 8);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.fillStyle = '#cc0000';
        ctx.beginPath();
        ctx.ellipse(sx - 9, sy, 7, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(sx + 9, sy, 7, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.ellipse(sx - 9, sy, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(sx + 9, sy, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#880000';
        ctx.beginPath();
        ctx.moveTo(sx, sy + 6);
        ctx.lineTo(sx - 3, sy + 11);
        ctx.lineTo(sx + 3, sy + 11);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#880000';
        ctx.lineWidth = 1.5;
        for (let i = -2; i <= 2; i++) {
            const tx = sx + i * 5;
            ctx.beginPath();
            ctx.moveTo(tx, sy + 13);
            ctx.lineTo(tx, sy + 18);
            ctx.stroke();
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(88, 68, 3, 40);
        ctx.fillStyle = '#ffcc00';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(91, 68);
        ctx.lineTo(114, 78);
        ctx.lineTo(91, 88);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(28, 72);
        ctx.lineTo(100, 32);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(100, 72);
        ctx.lineTo(28, 32);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    }

    dispose(): void {
        Object.values(this.textures).forEach(t => t?.dispose());
        if (this.mediaTexture) this.mediaTexture.dispose();
        if (this.placeholderTexture) this.placeholderTexture.dispose();
        if (this.videoCheckInterval) clearInterval(this.videoCheckInterval);
    }
}
