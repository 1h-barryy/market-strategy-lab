import * as THREE from 'three';
import { Emitter } from './events';

export interface PointerInfo {
  /** Normalized device coordinates in [−1, 1]. */
  ndc: THREE.Vector2;
  button: number;
}

export interface KeyInfo {
  key: string;
  code: string;
  repeat: boolean;
}

interface InputEvents {
  pointerdown: PointerInfo;
  pointerup: PointerInfo;
  keydown: KeyInfo;
  keyup: KeyInfo;
}

/** Pointer events on the canvas and keyboard events on the window, plus raycast picking. */
export class Input extends Emitter<InputEvents> {
  readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();

  constructor(private readonly element: HTMLElement) {
    super();
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** Objects under the current pointer, nearest first. */
  pick(camera: THREE.Camera, objects: THREE.Object3D[], recursive = false): THREE.Intersection[] {
    this.raycaster.setFromCamera(this.pointer, camera);
    return this.raycaster.intersectObjects(objects, recursive);
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.element.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.updatePointer(event);
    this.emit('pointerdown', { ndc: this.pointer.clone(), button: event.button });
  };

  private onPointerMove = (event: PointerEvent): void => this.updatePointer(event);

  private onPointerUp = (event: PointerEvent): void => {
    this.emit('pointerup', { ndc: this.pointer.clone(), button: event.button });
  };

  private static fromForm(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    return !!target && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName));
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (Input.fromForm(event) || event.metaKey || event.ctrlKey || event.altKey) return;
    this.emit('keydown', { key: event.key, code: event.code, repeat: event.repeat });
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.emit('keyup', { key: event.key, code: event.code, repeat: false });
  };

  /** Releasing focus counts as releasing everything, so a held key or button can't get stuck. */
  private onBlur = (): void => {
    this.emit('pointerup', { ndc: this.pointer.clone(), button: 0 });
    this.emit('keyup', { key: ' ', code: 'Space', repeat: false });
  };

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.clear();
  }
}
