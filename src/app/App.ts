import { WorldArt } from '../art';
import { BoardChapter } from '../chapters/board/BoardChapter';
import { TerrainChapter } from '../chapters/terrain/TerrainChapter';
import { TestChapter } from '../chapters/test/TestChapter';
import type { ChapterContext } from '../chapters/types';
import { ChapterManager } from '../core/ChapterManager';
import { Clock } from '../core/Clock';
import { Input } from '../core/Input';
import { Renderer } from '../core/Renderer';
import { copy } from '../content/copy';
import { HUD } from '../ui/HUD';
import { cssColor, palette } from '../world/shared/palette';
import { Stage } from '../world/shared/stage';
import { Store } from './state';

/** Wires state, renderer, clock, input, HUD and chapters together, and runs the frame loop. */
export class App {
  private readonly hud: HUD;
  private readonly store = new Store();
  private readonly clock = new Clock();
  private readonly stage = new Stage();
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private renderer?: Renderer;
  private world?: WorldArt;
  private input?: Input;
  private chapters?: ChapterManager;

  constructor(private readonly root: HTMLElement) {
    applyPalette();
    this.hud = new HUD(root);
    this.hud.setHeader(copy().header);
    try {
      this.renderer = new Renderer(this.hud.viewport, () => this.fail());
    } catch (error) {
      console.warn('Unable to initialize the 3D viewport.', error);
      this.fail();
      return;
    }
    this.world = new WorldArt(this.stage.scene, this.renderer.webgl);
    this.input = new Input(this.renderer.canvas);
    this.renderer.onResize((width, height) => this.stage.rig.setAspect(width / height));
    const context: ChapterContext = {
      renderer: this.renderer,
      input: this.input,
      store: this.store,
      hud: this.hud,
      reducedMotion: () => this.motion.matches,
      stage: this.stage,
      navigate: (id) => {
        this.chapters?.goTo(id).catch((error: unknown) => {
          console.error(error);
          this.hud.setStatus(`Failed to open chapter: ${String(error)}`, true);
        });
      },
    };
    this.chapters = new ChapterManager(context);
    this.chapters.register(new BoardChapter());
    this.chapters.register(new TerrainChapter());
    this.chapters.register(new TestChapter());
    this.chapters.goTo('board').then(
      () => this.renderer?.setLoop(this.frame),
      (error: unknown) => {
        console.error(error);
        this.hud.setStatus(`Failed to start: ${String(error)}`, true);
        this.hud.setDebugVisible(true);
      },
    );
  }

  private frame = (time: number): void => {
    if (!this.chapters) return;
    this.clock.advance(time, (dt) => {
      this.chapters!.update(dt);
      this.stage.rig.update(dt, this.motion.matches);
    });
    this.world?.update(this.stage.camera);
    this.chapters.render();
  };

  private fail(): void {
    this.chapters?.dispose();
    this.chapters = undefined;
    this.input?.dispose();
    this.hud.showWorldError(copy().errors.noWebgl, copy().errors.noWebglDetail);
  }

  dispose(): void {
    this.renderer?.setLoop(null);
    this.chapters?.dispose();
    this.input?.dispose();
    this.world?.dispose();
    this.renderer?.dispose();
    this.store.clear();
    this.root.replaceChildren();
  }
}

/** Mirrors the semantic palette into CSS variables so HUD and scene share one source. */
function applyPalette(): void {
  const style = document.documentElement.style;
  style.setProperty('--bg', cssColor(palette.background));
  style.setProperty('--up', cssColor(palette.up));
  style.setProperty('--down', cssColor(palette.down));
  style.setProperty('--neutral', cssColor(palette.neutral));
  style.setProperty('--accent', cssColor(palette.accent));
}
