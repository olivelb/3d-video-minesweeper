import * as THREE from 'three';
import { Events } from '../core/EventBus.js';
import { networkManager } from '../network/NetworkManager.js';

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

            // Cursor sync removed
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
                if (networkManager.mode) {
                    networkManager.sendAction({ type: 'reveal', x, y });
                } else {
                    // Analytics
                    if (this.events) this.events.emit(Events.USER_INTERACTION);

                    // Direct Action
                    const result = await this.game.reveal(x, y);
                    this.handleGameResult(result);
                }
            } else if (event.button === 2) { // Right Click
                if (networkManager.mode) {
                    networkManager.sendAction({ type: 'flag', x, y });
                } else {
                    if (this.events) this.events.emit(Events.USER_INTERACTION);
                    const result = this.game.toggleFlag(x, y);
                    this.handleGameResult(result);
                }
            }
        }
    }

    /**
     * Dispatch game updates to Renderer (via callback or event)
     * For now, we'll emit an event that the Renderer listens to, OR 
     * call a method on the renderer if we pass it in. 
     * To keep it decoupled, let's emit a local processing event or call a direct callback.
     * 
     * Actually, since Renderer owns InputManager, Renderer can pass a "onGameAction" callback.
     * But for now, let's assume Renderer exposes 'handleGameUpdate' public method.
     */
    handleGameResult(result) {
        // We need to trigger visual updates
        // To avoid circular dependency or weird coupling, we can use the EventBus 
        // OR simply rely on the fact that Renderer passed 'game' and we modified it.
        // But Renderer needs to know WHAT changed to update visuals efficiently.

        // Option A: EventBus (cleanest)
        // this.events.emit('game:update', result);

        // Option B: Direct callback (fastest)
        // The Renderer likely has `handleGameUpdate(result)`
        if (this.renderer.handleGameUpdate) {
            this.renderer.handleGameUpdate(result);
        }
    }

    /**
     * Get current hovered ID for visualizer
     */
    getHoveredInstanceId() {
        return this.hoveredInstanceId;
    }
}
