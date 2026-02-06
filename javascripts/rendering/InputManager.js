import * as THREE from 'three';
import { Events } from '../core/EventBus.js';

/**
 * InputManager
 * Handles Mouse/Touch interaction and Raycasting
 * Decouples input logic from the main Renderer
 */
export class InputManager {
    constructor(renderer, camera, gridMesh, game, eventBus) {
        this.renderer = renderer;
        this.camera = camera;
        this.gridMesh = gridMesh;
        this.game = game;
        this.events = eventBus;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.hoveredInstanceId = -1;
        this.lastHoveredId = -1;

        // Bindings
        this._boundOnMouseMove = (e) => this.onMouseMove(e);
        this._boundOnMouseClick = (e) => this.onMouseClick(e);

        this.attachListeners();
    }

    attachListeners() {
        this.renderer.domElement.addEventListener('pointerdown', this._boundOnMouseClick, false);
        this.renderer.domElement.addEventListener('pointermove', this._boundOnMouseMove, false);
    }

    detachListeners() {
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.removeEventListener('pointerdown', this._boundOnMouseClick);
            this.renderer.domElement.removeEventListener('pointermove', this._boundOnMouseMove);
        }
    }

    update() {
        // Optional: periodic updates if needed, currently event-driven
    }

    onMouseMove(event) {
        if (this.game.gameOver || this.game.victory || this.game.isSpectating) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersection = this.raycaster.intersectObject(this.gridMesh);

        if (intersection.length > 0) {
            this.hoveredInstanceId = intersection[0].instanceId;
        } else {
            this.hoveredInstanceId = -1;
        }
    }

    async onMouseClick(event) {
        if (this.game.gameOver || this.game.victory || this.game.isSpectating) return;

        // Use cached hover if available, otherwise arraycast (robustness)
        if (this.hoveredInstanceId === -1) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersection = this.raycaster.intersectObject(this.gridMesh);
            if (intersection.length > 0) this.hoveredInstanceId = intersection[0].instanceId;
        }

        if (this.hoveredInstanceId !== -1) {
            const instanceId = this.hoveredInstanceId;
            const y = instanceId % this.game.height;
            const x = Math.floor(instanceId / this.game.height);

            if (event.button === 0) { // Left Click
                this.events.emit(Events.CELL_INTERACTION, { x, y, type: 'reveal' });
            } else if (event.button === 2) { // Right Click
                this.events.emit(Events.CELL_INTERACTION, { x, y, type: 'flag' });
            }
        }
    }

    /**
     * Get current hovered ID for visualizer
     */
    getHoveredInstanceId() {
        return this.hoveredInstanceId;
    }
}
