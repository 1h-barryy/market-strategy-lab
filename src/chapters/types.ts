import type * as THREE from 'three';
import type { Store } from '../app/state';
import type { Input } from '../core/Input';
import type { Renderer } from '../core/Renderer';
import type { HUD } from '../ui/HUD';

/** Services a chapter may use. Chapters never talk to each other; shared data goes through the store. */
export interface ChapterContext {
  renderer: Renderer;
  input: Input;
  store: Store;
  hud: HUD;
  /** True when the user prefers reduced motion. Visual only; must never change results. */
  reducedMotion(): boolean;
}

export interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  /** One-time setup (geometry, assets). Called before the first `enter`. */
  load(context: ChapterContext): Promise<void>;
  /** Becomes the active chapter: subscribe to input/state, show HUD. */
  enter(): void;
  /** One fixed simulation step of `dt` seconds. */
  update(dt: number): void;
  /** Stops being active: unsubscribe, leave state as is. */
  exit(): void;
  /** Frees GPU resources; the chapter is not used again. */
  dispose(): void;
}
