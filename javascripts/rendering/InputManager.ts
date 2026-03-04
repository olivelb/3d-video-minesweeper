import * as THREE from 'three';
import { Events } from '../core/EventBus.js';
import type { EventBus } from '../core/EventBus.js';
import { worldToGrid } from './GridManager.js';

export class InputManager {
    renderer: THREE.WebGLRenderer;
    camera: THREE.Camera;
    gridMesh: THREE.InstancedMesh;
    game: any;
    events: EventBus;

    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    hoveredInstanceId: number;

    _groundPlane: THREE.Plane;
    _hitPoint: THREE.Vector3;
    _lastMoveTime: number;

    _boundOnMouseMove: (e: PointerEvent) => void;
    _boundOnMouseClick: (e: PointerEvent) => void;
    _boundOnContextMenu: (e: Event) => void;
    _boundOnDblClick: (e: MouseEvent) => void;
    _boundOnAuxClick: (e: MouseEvent) => void;

    constructor(renderer: THREE.WebGLRenderer, camera: THREE.Camera, gridMesh: THREE.InstancedMesh, game: any, eventBus: EventBus) {
        this.renderer = renderer;
        this.camera = camera;
        this.gridMesh = gridMesh;
        this.game = game;
        this.events = eventBus;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredInstanceId = -1;

        // Plane at cube-top height for hover detection
        this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -10);
        this._hitPoint = new THREE.Vector3();
        this._lastMoveTime = 0;

        this._boundOnMouseMove = (e) => this.onMouseMove(e);
        this._boundOnMouseClick = (e) => this.onMouseClick(e);
        this._boundOnContextMenu = (e) => e.preventDefault();
        this._boundOnDblClick = (e) => this.onDblClick(e);
        this._boundOnAuxClick = (e) => { if (e.button === 1) e.preventDefault(); };

        this.attachListeners();
    }

    attachListeners(): void {
        this.renderer.domElement.addEventListener('pointerdown', this._boundOnMouseClick, false);
        this.renderer.domElement.addEventListener('pointermove', this._boundOnMouseMove, false);
        this.renderer.domElement.addEventListener('contextmenu', this._boundOnContextMenu, false);
        this.renderer.domElement.addEventListener('dblclick', this._boundOnDblClick, false);
        this.renderer.domElement.addEventListener('auxclick', this._boundOnAuxClick, false);
    }

    detachListeners(): void {
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.removeEventListener('pointerdown', this._boundOnMouseClick);
            this.renderer.domElement.removeEventListener('pointermove', this._boundOnMouseMove);
            this.renderer.domElement.removeEventListener('contextmenu', this._boundOnContextMenu);
            this.renderer.domElement.removeEventListener('dblclick', this._boundOnDblClick);
            this.renderer.domElement.removeEventListener('auxclick', this._boundOnAuxClick);
        }
    }

    update(): void {
        // Optional: periodic updates if needed, currently event-driven
    }

    /**
     * O(1) grid lookup: ray-plane intersection + math conversion.
     * Replaces the previous O(n) raycasting against all InstancedMesh instances.
     */
    _getGridCellFromMouse(): { x: number; y: number } | null {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        if (!this.raycaster.ray.intersectPlane(this._groundPlane, this._hitPoint)) return null;

        const { x, y } = worldToGrid(this._hitPoint.x, this._hitPoint.z, this.game.width, this.game.height);
        if (x < 0 || x >= this.game.width || y < 0 || y >= this.game.height) return null;
        return { x, y };
    }

    onMouseMove(event: PointerEvent): void {
        if (this.game.gameOver || this.game.victory || this.game.isSpectating || this.game.hintMode) return;

        // Throttle to ~30fps — still perfectly responsive for hover
        const now = performance.now();
        if (now - this._lastMoveTime < 33) return;
        this._lastMoveTime = now;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const cell = this._getGridCellFromMouse();
        if (cell) {
            // Check that the cell is still unrevealed (visible cube)
            if (this.game.visibleGrid[cell.x]?.[cell.y] === -1) {
                this.hoveredInstanceId = cell.x * this.game.height + cell.y;
            } else {
                this.hoveredInstanceId = -1;
            }
        } else {
            this.hoveredInstanceId = -1;
        }
    }

    _getGridCellFromEvent(event: MouseEvent): { x: number; y: number } | null {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        return this._getGridCellFromMouse();
    }

    async onMouseClick(event: PointerEvent): Promise<void> {
        if (this.game.gameOver || this.game.victory || this.game.isSpectating || this.game.hintMode) return;

        const cell = this._getGridCellFromEvent(event);
        if (!cell) return;
        const { x, y } = cell;

        if (event.button === 0) {
            this.events.emit(Events.CELL_INTERACTION, { x, y, type: 'reveal' });
        } else if (event.button === 1) {
            event.preventDefault();
            this.events.emit(Events.CELL_INTERACTION, { x, y, type: 'chord' });
        } else if (event.button === 2) {
            this.events.emit(Events.CELL_INTERACTION, { x, y, type: 'flag' });
        }
    }

    onDblClick(event: MouseEvent): void {
        if (this.game.gameOver || this.game.victory || this.game.isSpectating || this.game.hintMode) return;

        const cell = this._getGridCellFromEvent(event);
        if (!cell) return;
        const { x, y } = cell;

        const value = this.game.visibleGrid[x]?.[y];
        if (value >= 1 && value <= 8) {
            this.events.emit(Events.CELL_INTERACTION, { x, y, type: 'chord' });
        }
    }

    getHoveredInstanceId(): number {
        return this.hoveredInstanceId;
    }
}
