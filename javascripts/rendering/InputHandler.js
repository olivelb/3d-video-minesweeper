/**
 * InputHandler Module
 * 
 * Handles mouse and touch input for the 3D Minesweeper game.
 * Manages raycasting to detect which cell the user is interacting with,
 * tracks hover state, and dispatches click events.
 * 
 * @module InputHandler
 * @requires three
 */

import * as THREE from 'three';

/**
 * Input handler for minesweeper grid interactions
 * @class
 */
export class InputHandler {
    /**
     * Create an input handler
     * @param {THREE.Camera} camera - The camera for raycasting
     * @param {THREE.WebGLRenderer} renderer - The renderer (for DOM element)
     * @param {THREE.InstancedMesh} gridMesh - The grid mesh to raycast against
     * @param {Object} game - Game state object
     */
    constructor(camera, renderer, gridMesh, game) {
        /** @type {THREE.Camera} */
        this.camera = camera;
        
        /** @type {THREE.WebGLRenderer} */
        this.renderer = renderer;
        
        /** @type {THREE.InstancedMesh} */
        this.gridMesh = gridMesh;
        
        /** @type {Object} Game state reference */
        this.game = game;
        
        /** @type {THREE.Raycaster} Raycaster for mouse picking */
        this.raycaster = new THREE.Raycaster();
        
        /** @type {THREE.Vector2} Normalized mouse position */
        this.mouse = new THREE.Vector2();
        
        /** @type {number} Currently hovered instance ID (-1 = none) */
        this.hoveredInstanceId = -1;

        // Bound event handlers for cleanup
        /** @private */
        this._boundOnMouseMove = (e) => this._onMouseMove(e);
        /** @private */
        this._boundOnMouseClick = (e) => this._onMouseClick(e);

        // Callbacks
        /** @type {Function|null} Called when a cell is revealed */
        this.onReveal = null;
        /** @type {Function|null} Called when a cell is flagged */
        this.onFlag = null;
        /** @type {Function|null} Called when cursor moves over grid */
        this.onCursorMove = null;

        this._bindEvents();
    }

    /**
     * Bind event listeners
     * @private
     */
    _bindEvents() {
        this.renderer.domElement.addEventListener(
            'pointermove', 
            this._boundOnMouseMove, 
            false
        );
        this.renderer.domElement.addEventListener(
            'pointerdown', 
            this._boundOnMouseClick, 
            false
        );
    }

    /**
     * Handle mouse move events
     * @private
     * @param {PointerEvent} event - Mouse event
     */
    _onMouseMove(event) {
        if (this.game.gameOver || this.game.victory) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersection = this.raycaster.intersectObject(this.gridMesh);

        if (intersection.length > 0) {
            this.hoveredInstanceId = intersection[0].instanceId;

            // Notify cursor move
            if (this.onCursorMove) {
                const y = this.hoveredInstanceId % this.game.height;
                const x = Math.floor(this.hoveredInstanceId / this.game.height);
                this.onCursorMove(x, y);
            }
        } else {
            this.hoveredInstanceId = -1;
        }
    }

    /**
     * Handle mouse click events
     * @private
     * @param {PointerEvent} event - Mouse event
     */
    _onMouseClick(event) {
        if (this.game.gameOver || this.game.victory) return;

        // Use cached hover if available, otherwise raycast
        if (this.hoveredInstanceId === -1) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersection = this.raycaster.intersectObject(this.gridMesh);
            if (intersection.length > 0) {
                this.hoveredInstanceId = intersection[0].instanceId;
            }
        }

        if (this.hoveredInstanceId !== -1) {
            const instanceId = this.hoveredInstanceId;
            const y = instanceId % this.game.height;
            const x = Math.floor(instanceId / this.game.height);

            if (event.button === 0 && this.onReveal) {
                // Left click - reveal
                this.onReveal(x, y);
            } else if (event.button === 2 && this.onFlag) {
                // Right click - flag
                this.onFlag(x, y);
            }
        }
    }

    /**
     * Get currently hovered cell coordinates
     * @returns {Object|null} { x, y } or null if nothing hovered
     */
    getHoveredCell() {
        if (this.hoveredInstanceId === -1) return null;
        
        const y = this.hoveredInstanceId % this.game.height;
        const x = Math.floor(this.hoveredInstanceId / this.game.height);
        return { x, y };
    }

    /**
     * Get hovered instance ID
     * @returns {number} Instance ID or -1
     */
    getHoveredInstanceId() {
        return this.hoveredInstanceId;
    }

    /**
     * Update grid mesh reference (if grid is recreated)
     * @param {THREE.InstancedMesh} gridMesh - New grid mesh
     */
    setGridMesh(gridMesh) {
        this.gridMesh = gridMesh;
    }

    /**
     * Clean up event listeners
     */
    dispose() {
        this.renderer.domElement.removeEventListener(
            'pointermove', 
            this._boundOnMouseMove
        );
        this.renderer.domElement.removeEventListener(
            'pointerdown', 
            this._boundOnMouseClick
        );
    }
}
