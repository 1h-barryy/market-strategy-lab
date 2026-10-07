import * as THREE from 'three';
import { palette } from './palette';

/** Where the camera is and what it looks at. */
export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** A chapter's view, recomputed when the window's aspect ratio changes. */
export type PoseForAspect = (aspect: number) => CameraPose;

const smoothstep = (u: number): number => u * u * (3 - 2 * u);

/**
 * Moves the shared camera between chapter views with an eased glide. Visual only: it never
 * affects results. Under reduced motion it jumps.
 */
export class CameraRig {
  private poseFor: PoseForAspect | null = null;
  private readonly from: CameraPose = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  private readonly current: CameraPose = { position: new THREE.Vector3(0, 0, 30), target: new THREE.Vector3() };
  private progress = 1;
  private duration = 1;
  private aspect = 1;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** True while a move is in progress. */
  get moving(): boolean {
    return this.progress < 1;
  }

  /** Glide to a chapter's view over `seconds` (0 = jump). */
  follow(poseFor: PoseForAspect, seconds: number): void {
    this.poseFor = poseFor;
    this.from.position.copy(this.current.position);
    this.from.target.copy(this.current.target);
    this.duration = Math.max(seconds, 1e-6);
    this.progress = seconds > 0 ? 0 : 1;
    this.apply();
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.apply();
  }

  update(dt: number, reducedMotion: boolean): void {
    if (this.progress >= 1) return;
    this.progress = reducedMotion ? 1 : Math.min(1, this.progress + dt / this.duration);
    this.apply();
  }

  private apply(): void {
    if (!this.poseFor) return;
    const goal = this.poseFor(this.aspect);
    const u = smoothstep(this.progress);
    this.current.position.lerpVectors(this.from.position, goal.position, u);
    this.current.target.lerpVectors(this.from.target, goal.target, u);
    this.camera.position.copy(this.current.position);
    this.camera.lookAt(this.current.target);
  }
}

/** The one scene, camera and lighting shared by every chapter (DESIGN.md §7). */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 800);
  readonly rig = new CameraRig(this.camera);

  constructor() {
    this.scene.background = new THREE.Color(palette.background);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x30343c, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(-4, 10, 12);
    this.scene.add(key);
  }
}

/** Camera distance that fits a width × height rectangle at the given aspect and vertical fov. */
export function fitDistance(width: number, height: number, aspect: number, fovDegrees: number): number {
  const halfFov = THREE.MathUtils.degToRad(fovDegrees / 2);
  return Math.max(height / 2 / Math.tan(halfFov), width / 2 / (Math.tan(halfFov) * aspect));
}
