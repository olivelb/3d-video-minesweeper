/**
 * CameraController Module
 * 
 * Handles camera initialization, intro animations, and orbit controls.
 * Provides smooth camera transitions and cinematic intro sequences
 * for the 3D Minesweeper experience.
 * 
 * @module CameraController
 * @requires three
 * @requires three/addons/controls/OrbitControls
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Camera controller for managing 3D viewport navigation
 * @class
 */
export class CameraController {
    /**
     * Create a camera controller
     * @param {THREE.WebGLRenderer} renderer - The WebGL renderer
     * @param {number} gridWidth - Game grid width for positioning calculations
     * @param {number} gridHeight - Game grid height for positioning calculations
     */
    constructor(renderer, gridWidth, gridHeight) {
        /** @type {THREE.PerspectiveCamera} Main perspective camera */
        this.camera = new THREE.PerspectiveCamera(
            60,                                              // FOV
            window.innerWidth / window.innerHeight,          // Aspect ratio
            1,                                               // Near clipping plane
            5000                                             // Far clipping plane
        );

        /** @type {THREE.Vector3} Target position for intro animation */
        this.targetPosition = new THREE.Vector3();
        
        /** @type {OrbitControls} Orbit controls for user interaction */
        this.controls = null;
        
        /** @type {boolean} Whether intro animation is active */
        this.isIntroAnimating = true;
        
        /** @type {number} Time elapsed during intro animation */
        this.introTime = 0;

        this._initializePosition(gridWidth, gridHeight);
        this._initializeControls(renderer);
    }

    /**
     * Set initial camera position based on grid dimensions
     * @private
     * @param {number} gridWidth - Grid width
     * @param {number} gridHeight - Grid height
     */
    _initializePosition(gridWidth, gridHeight) {
        // Calculate optimal viewing distance based on grid size
        const targetDescend = gridHeight * 25;
        this.targetPosition.set(0, targetDescend, gridHeight * 20);
        
        // Start camera far away for dramatic intro
        this.camera.position.set(0, 1000, 1000);
    }

    /**
     * Initialize orbit controls
     * @private
     * @param {THREE.WebGLRenderer} renderer - The WebGL renderer
     */
    _initializeControls(renderer) {
        this.controls = new OrbitControls(this.camera, renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enabled = false; // Disabled during intro animation
    }

    /**
     * Update camera each frame
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        if (this.isIntroAnimating) {
            this._updateIntroAnimation(deltaTime);
        } else {
            this.controls.update();
        }
    }

    /**
     * Update intro animation
     * @private
     * @param {number} deltaTime - Time since last frame
     */
    _updateIntroAnimation(deltaTime) {
        this.introTime += deltaTime;
        
        // Smooth lerp towards target position
        this.camera.position.lerp(this.targetPosition, 0.05);
        this.camera.lookAt(new THREE.Vector3(0, 0, 0));

        // End intro when camera is close enough and minimum time has passed
        const distanceToTarget = this.camera.position.distanceTo(this.targetPosition);
        if (distanceToTarget < 10 && this.introTime > 1.0) {
            this.isIntroAnimating = false;
            this.controls.enabled = true;
        }
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }

    /**
     * Get current camera direction
     * @returns {THREE.Vector3} Normalized direction vector
     */
    getDirection() {
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        return direction;
    }

    /**
     * Reset camera to initial intro state
     * @param {number} gridWidth - Grid width
     * @param {number} gridHeight - Grid height
     */
    reset(gridWidth, gridHeight) {
        this._initializePosition(gridWidth, gridHeight);
        this.isIntroAnimating = true;
        this.introTime = 0;
        this.controls.enabled = false;
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.controls) {
            this.controls.dispose();
        }
    }
}
