import * as THREE from 'three';
import { Events } from '../core/EventBus.js';
import { worldToGrid } from './GridManager.js';

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

        // Ground plane for reliable grid coordinate resolution —
        // revealed cells are scaled to 0 in the InstancedMesh and can't be
        // raycasted, so we raycast this invisible plane instead.
        // Plane sits at Y = 10 (top surface of 20×20×20 cubes after -PI/2
        // rotation). THREE.Plane constant: n·p + c = 0 → c = -10.
        this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -10);

        // Reusable Vector3 for hit-point calculation (avoid per-click alloc)
        this._hitPoint = new THREE.Vector3();

        // Bindings
        this._boundOnMouseMove = (e) => this.onMouseMove(e);
        this._boundOnMouseClick = (e) => this.onMouseClick(e);
        this._boundOnContextMenu = (e) => e.preventDefault();
        this._boundOnDblClick = (e) => this.onDblClick(e);
        this._boundOnAuxClick = (e) => { if (e.button === 1) e.preventDefault(); };

        this.attachListeners();
    }

    attachListeners() {
        this.renderer.domElement.addEventListener('pointerdown', this._boundOnMouseClick, false);
        this.renderer.domElement.addEventListener('pointermove', this._boundOnMouseMove, false);
        this.renderer.domElement.addEventListener('contextmenu', this._boundOnContextMenu, false);
        this.renderer.domElement.addEventListener('dblclick', this._boundOnDblClick, false);
        this.renderer.domElement.addEventListener('auxclick', this._boundOnAuxClick, false);
    }

    detachListeners() {
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.removeEventListener('pointerdown', this._boundOnMouseClick);
            this.renderer.domElement.removeEventListener('pointermove', this._boundOnMouseMove);
            this.renderer.domElement.removeEventListener('contextmenu', this._boundOnContextMenu);
            this.renderer.domElement.removeEventListener('dblclick', this._boundOnDblClick);
            this.renderer.domElement.removeEventListener('auxclick', this._boundOnAuxClick);
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

    /**
     * Get grid cell (x, y) from a mouse/pointer event by raycasting a ground
     * plane at Y=10 (top surface of cubes).  This works regardless of whether
     * the cell is still visible in the InstancedMesh (revealed cells are
     * scaled to 0).
     * @returns {{ x: number, y: number } | null}
     */
    _getGridCellFromEvent(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const hitPoint = this._hitPoint;
        if (!this.raycaster.ray.intersectPlane(this._groundPlane, hitPoint)) return null;

        // Grid formula: wx = -(width*half) + x*spacing,  wz = (height*half) - y*spacing
        const { x, y } = worldToGrid(hitPoint.x, hitPoint.z, this.game.width, this.game.height);

        if (x < 0 || x >= this.game.width || y < 0 || y >= this.game.height) return null;
        return { x, y };
    }

    async onMouseClick(event) {
        if (this.game.gameOver || this.game.victory || this.game.isSpectating) return;

        const cell = this._getGridCellFromEvent(event);
        if (!cell) return;
        const { x, y } = cell;

        if (event.button === 0) { // Left Click
            this.events.emit(Events.CELL_INTERACTION, { x, y, type: 'reveal' });
        } else if (event.button === 1) { // Middle Click — Chord
            event.preventDefault();
            this.events.emit(Events.CELL_INTERACTION, { x, y, type: 'chord' });
        } else if (event.button === 2) { // Right Click
            this.events.emit(Events.CELL_INTERACTION, { x, y, type: 'flag' });
        }
    }

    /**
     * Double-click on a revealed numbered cell triggers chord.
     */
    onDblClick(event) {
        if (this.game.gameOver || this.game.victory || this.game.isSpectating) return;

        const cell = this._getGridCellFromEvent(event);
        if (!cell) return;
        const { x, y } = cell;

        // Only chord on revealed numbered cells (1-8)
        const value = this.game.visibleGrid[x]?.[y];
        if (value >= 1 && value <= 8) {
            this.events.emit(Events.CELL_INTERACTION, { x, y, type: 'chord' });
        }
    }

    /**
     * Get current hovered ID for visualizer
     */
    getHoveredInstanceId() {
        return this.hoveredInstanceId;
    }
}
