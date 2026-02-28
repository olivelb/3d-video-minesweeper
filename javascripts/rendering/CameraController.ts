import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CAMERA_CONFIG = {
    FOV: 60,
    NEAR: 1,
    FAR: 5000,
    DAMPING: 0.05,
    INTRO_LERP: 0.05,
    INTRO_END_DISTANCE: 10,
    INTRO_MIN_TIME: 1.0,
    TARGET_HEIGHT_FACTOR: 25,
    TARGET_DEPTH_FACTOR: 20,
    START_POSITION: { x: 0, y: 1000, z: 1000 }
};

export class CameraController {
    camera: THREE.PerspectiveCamera;
    targetPosition: THREE.Vector3;
    controls: OrbitControls | null;
    isIntroAnimating: boolean;
    introTime: number;
    _lookAtTarget: THREE.Vector3;

    constructor(renderer: THREE.WebGLRenderer, gridWidth: number, gridHeight: number) {
        this.camera = new THREE.PerspectiveCamera(
            CAMERA_CONFIG.FOV,
            window.innerWidth / window.innerHeight,
            CAMERA_CONFIG.NEAR,
            CAMERA_CONFIG.FAR
        );

        this.targetPosition = new THREE.Vector3();
        this.controls = null;
        this.isIntroAnimating = true;
        this.introTime = 0;
        this._lookAtTarget = new THREE.Vector3(0, 0, 0);

        this._initializePosition(gridWidth, gridHeight);
        this._initializeControls(renderer);
    }

    _initializePosition(gridWidth: number, gridHeight: number): void {
        const targetDescend = gridHeight * CAMERA_CONFIG.TARGET_HEIGHT_FACTOR;
        this.targetPosition.set(0, targetDescend, gridHeight * CAMERA_CONFIG.TARGET_DEPTH_FACTOR);

        const sp = CAMERA_CONFIG.START_POSITION;
        this.camera.position.set(sp.x, sp.y, sp.z);
    }

    _initializeControls(renderer: THREE.WebGLRenderer): void {
        this.controls = new OrbitControls(this.camera, renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = CAMERA_CONFIG.DAMPING;
        this.controls.enabled = false;
    }

    update(deltaTime: number): void {
        if (this.isIntroAnimating) {
            this._updateIntroAnimation(deltaTime);
        } else {
            this.controls!.update();
        }
    }

    _updateIntroAnimation(deltaTime: number): void {
        this.introTime += deltaTime;

        this.camera.position.lerp(this.targetPosition, CAMERA_CONFIG.INTRO_LERP);
        this.camera.lookAt(this._lookAtTarget);

        const distanceToTarget = this.camera.position.distanceTo(this.targetPosition);
        if (distanceToTarget < CAMERA_CONFIG.INTRO_END_DISTANCE && this.introTime > CAMERA_CONFIG.INTRO_MIN_TIME) {
            this.isIntroAnimating = false;
            this.controls!.enabled = true;
        }
    }

    onWindowResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }

    dispose(): void {
        if (this.controls) {
            this.controls.dispose();
        }
    }
}
