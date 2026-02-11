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
 * Configuration for camera behaviour
 * @constant
 */
const CAMERA_CONFIG = {
    /** Vertical field of view (degrees) */
    FOV: 60,
    /** Near clipping plane */
    NEAR: 1,
    /** Far clipping plane */
    FAR: 5000,
    /** Damping factor for orbit controls */
    DAMPING: 0.05,
    /** Lerp speed for intro animation */
    INTRO_LERP: 0.05,
    /** Minimum distance to target before intro ends */
    INTRO_END_DISTANCE: 10,
    /** Minimum elapsed time before intro can end (s) */
    INTRO_MIN_TIME: 1.0,
    /** Height multiplier for target camera position */
    TARGET_HEIGHT_FACTOR: 25,
    /** Depth multiplier for target camera position */
    TARGET_DEPTH_FACTOR: 20,
    /** Initial camera start position */
    START_POSITION: { x: 0, y: 1000, z: 1000 }
};

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
            CAMERA_CONFIG.FOV,
            window.innerWidth / window.innerHeight,
            CAMERA_CONFIG.NEAR,
            CAMERA_CONFIG.FAR
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
        const targetDescend = gridHeight * CAMERA_CONFIG.TARGET_HEIGHT_FACTOR;
        this.targetPosition.set(0, targetDescend, gridHeight * CAMERA_CONFIG.TARGET_DEPTH_FACTOR);
        
        // Start camera far away for dramatic intro
        const sp = CAMERA_CONFIG.START_POSITION;
        this.camera.position.set(sp.x, sp.y, sp.z);
    }

    /**
     * Initialize orbit controls
     * @private
     * @param {THREE.WebGLRenderer} renderer - The WebGL renderer
     */
    _initializeControls(renderer) {
        this.controls = new OrbitControls(this.camera, renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = CAMERA_CONFIG.DAMPING;
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
        this.camera.position.lerp(this.targetPosition, CAMERA_CONFIG.INTRO_LERP);
        this.camera.lookAt(new THREE.Vector3(0, 0, 0));

        // End intro when camera is close enough and minimum time has passed
        const distanceToTarget = this.camera.position.distanceTo(this.targetPosition);
        if (distanceToTarget < CAMERA_CONFIG.INTRO_END_DISTANCE && this.introTime > CAMERA_CONFIG.INTRO_MIN_TIME) {
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
     * Clean up resources
     */
    dispose() {
        if (this.controls) {
            this.controls.dispose();
        }
    }
}
