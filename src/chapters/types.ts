import type { Store } from '../app/state';
import type { Input } from '../core/Input';
import type { Renderer } from '../core/Renderer';
import type { HUD } from '../ui/HUD';
import type { Stage } from '../world/shared/stage';

/** Services a chapter may use. Chapters never talk to each other; shared data goes through the store. */
export interface ChapterContext {
  renderer: Renderer;
  input: Input;
  store: Store;
  hud: HUD;
  /** The one shared scene, camera and camera rig. Each chapter adds and shows/hides its own objects. */
  stage: Stage;
  /** Ask the app to switch to another chapter. */
  navigate(id: string): void;
  /** True when the user prefers reduced motion. Visual only; must never change results. */
  reducedMotion(): boolean;
}

export interface Chapter {
  readonly id: string;
  readonly title: string;
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
