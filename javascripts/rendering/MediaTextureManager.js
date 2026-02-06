import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { Logger } from '../utils/Logger.js';

/**
 * MediaTextureManager
 * Handles loading and management of all textures (Numbers, Flags, Backgrounds)
 * Extracts this logic from the main Renderer to clean up the code.
 */
export class MediaTextureManager {
    constructor() {
        this.textures = {};
        this.mediaTexture = null;
        this.placeholderTexture = null;
        this.videoElement = null;
        this.videoCheckInterval = null;
        this._videoEventListeners = [];

        // Flag assets
        this.flag2DGeometry = null;
        this.flag2DMaterial = null;
        this.flag2DTexture = null;
        this.font = null;
    }

    /**
     * Load all necessary resources
     * @param {string} bgName - Name of the background to load
     * @returns {Promise<void>}
     */
    async loadResources(bgName) {
        const loader = new THREE.TextureLoader();

        // Load numbers 1-8
        for (let i = 1; i <= 8; i++) {
            this.textures[i] = await this.loadTexture(loader, `images/j${i}.png`);
        }

        // Load other assets
        this.textures['flag'] = await this.loadTexture(loader, 'images/star.png');
        this.textures['particle'] = await this.loadTexture(loader, 'images/flare.png');

        // Generate bomb texture programmatically
        this.textures['bomb'] = this._createBombTexture();

        // VIDEO / BACKGROUND MANAGEMENT
        const customImage = document.getElementById('custom-image-source');
        const video = document.getElementById('image');

        // Setup Placeholder (we don't have a placeholder image, so we skip it or could generate one)
        // this.placeholderTexture = await this.loadTexture(loader, 'images/placeholder.jpg'); 

        // Priority 1: User uploaded custom image
        if (customImage && customImage.src && customImage.src !== '' && customImage.src !== window.location.href) {
            this.mediaTexture = new THREE.Texture(customImage);
            this.mediaTexture.minFilter = THREE.LinearFilter;
            this.mediaTexture.magFilter = THREE.LinearFilter;
            this.mediaTexture.colorSpace = THREE.SRGBColorSpace;
            this.mediaTexture.needsUpdate = true;

            // Watch for updates (if user drags/drops a new one)
            customImage.onload = () => {
                this.mediaTexture.needsUpdate = true;
            };
            this.videoElement = null;

        } else if (video) {
            // Priority 2: Default Video Background / Custom Video
            this.videoElement = video;

            // If it's a video file (mp4), use VideoTexture
            if (video.tagName === 'VIDEO') {
                this.mediaTexture = new THREE.VideoTexture(video);
                this.mediaTexture.minFilter = THREE.LinearFilter;
                this.mediaTexture.magFilter = THREE.LinearFilter;
                this.mediaTexture.format = THREE.RGBAFormat;
                this.mediaTexture.colorSpace = THREE.SRGBColorSpace;

                // Ensure connection to video play (user interaction needed)
                if (video.paused) {
                    video.play().catch(e => {
                        console.log("Waiting for user interaction to play video");
                    });
                }
            } else {
                // It's an IMG
                this.mediaTexture = new THREE.Texture(video);
                this.mediaTexture.minFilter = THREE.LinearFilter;
                this.mediaTexture.magFilter = THREE.LinearFilter;
                this.mediaTexture.colorSpace = THREE.SRGBColorSpace;
                this.mediaTexture.needsUpdate = true;

                // For images, we might need to update if source changes
                video.onload = () => {
                    this.mediaTexture.needsUpdate = true;
                };
            }
        }

        // Create the 3D flag assets now that we are initialized
        this.create3DFlagAssets();

        // Load Font
        this.font = await this.loadFont('https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json');

        Logger.log('MediaManager', 'Resources loaded');
    }

    /**
     * Helper to load texture with promise
     */
    loadTexture(loader, url) {
        return new Promise((resolve) => {
            loader.load(url, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                resolve(tex);
            }, undefined, () => {
                console.warn(`Failed to load ${url}`);
                resolve(null);
            });
        });
    }

    /**
     * Helper to load font with promise
     */
    loadFont(url) {
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

    /**
     * Get the active background texture (Video/Image or Placeholder)
     * @returns {THREE.Texture}
     */
    getBackgroundTexture() {
        if (this.mediaTexture) return this.mediaTexture;
        return this.placeholderTexture || new THREE.Texture(); // Return empty texture if nothing
    }

    /**
     * Update texture if needed (for video/canvas)
     */
    update() {
        // VideoTextures update automatically in Three.js usually
    }

    /**
     * Create reusable 2D flag geometry and material (same size as numbers: 16x16)
     */
    create3DFlagAssets() {
        // 2D horizontal plane, same size as number textures
        this.flag2DGeometry = new THREE.PlaneGeometry(16, 16);

        // Create a canvas texture for the flag icon - bold stylized design
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Clear with full transparency
        ctx.clearRect(0, 0, 128, 128);

        // Outer glow effect (makes it visible on any background)
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Bold triangular flag - large and visible
        ctx.fillStyle = '#ff2222';
        ctx.beginPath();
        ctx.moveTo(20, 15);      // Top-left of flag
        ctx.lineTo(108, 45);     // Right point
        ctx.lineTo(20, 75);      // Bottom-left of flag
        ctx.closePath();
        ctx.fill();

        // Inner highlight
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ff6666';
        ctx.beginPath();
        ctx.moveTo(25, 25);
        ctx.lineTo(75, 42);
        ctx.lineTo(25, 55);
        ctx.closePath();
        ctx.fill();

        // Bold white border for visibility
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(20, 15);
        ctx.lineTo(108, 45);
        ctx.lineTo(20, 75);
        ctx.closePath();
        ctx.stroke();

        // Pole - thick and visible
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(12, 10, 8, 108);
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(12, 10, 4, 108);

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

    /**
     * Create a bomb texture for revealed bombs (values 10)
     * Copied from original Renderer.js
     * @returns {THREE.CanvasTexture}
     */
    _createBombTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Clear with transparency
        ctx.clearRect(0, 0, 128, 128);

        // Draw bomb body (black circle with spikes)
        const cx = 64, cy = 64;
        const radius = 35;

        // Outer glow (red/orange danger glow)
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 20;

        // Main bomb body
        ctx.fillStyle = '#222222';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // Spikes
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

        // Inner highlight (gives 3D effect)
        const grad = ctx.createRadialGradient(cx - 10, cy - 10, 0, cx, cy, radius);
        grad.addColorStop(0, 'rgba(100, 100, 100, 0.6)');
        grad.addColorStop(0.5, 'rgba(50, 50, 50, 0.3)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
        ctx.fill();

        // Fuse hole
        ctx.fillStyle = '#444444';
        ctx.beginPath();
        ctx.arc(cx, cy - radius + 8, 6, 0, Math.PI * 2);
        ctx.fill();

        // Fuse
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy - radius + 2);
        ctx.quadraticCurveTo(cx + 15, cy - radius - 15, cx + 5, cy - radius - 25);
        ctx.stroke();

        // Spark at fuse tip
        ctx.fillStyle = '#ffaa00';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cx + 5, cy - radius - 25, 5, 0, Math.PI * 2);
        ctx.fill();

        // Red X overlay to indicate "revealed/dead" bomb
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

        // White border on X for visibility
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

    dispose() {
        Object.values(this.textures).forEach(t => t?.dispose());
        if (this.mediaTexture) this.mediaTexture.dispose();
        if (this.placeholderTexture) this.placeholderTexture.dispose();
        if (this.flag2DTexture) this.flag2DTexture.dispose();
        if (this.flag2DMaterial) this.flag2DMaterial.dispose();
        if (this.flag2DGeometry) this.flag2DGeometry.dispose();

        if (this.videoCheckInterval) clearInterval(this.videoCheckInterval);

        this._videoEventListeners.forEach(l => {
            l.element.removeEventListener(l.type, l.listener);
        });
    }
}
