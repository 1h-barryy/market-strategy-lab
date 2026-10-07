import type { Chapter, ChapterContext } from '../chapters/types';

/** Owns the registered chapters and which one is active. All chapters share one stage; the camera rig is the transition. */
export class ChapterManager {
  private readonly chapters = new Map<string, Chapter>();
  private readonly loaded = new Set<string>();
  private current: Chapter | null = null;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly context: ChapterContext) {}

  register(chapter: Chapter): void {
    if (this.chapters.has(chapter.id)) throw new Error(`Chapter "${chapter.id}" is already registered.`);
    this.chapters.set(chapter.id, chapter);
  }

  get active(): Chapter | null {
    return this.current;
  }

  /** Switches chapters; calls are queued so overlapping requests can't interleave. */
  goTo(id: string): Promise<void> {
    this.pending = this.pending.then(async () => {
      const next = this.chapters.get(id);
      if (!next) throw new Error(`Unknown chapter "${id}".`);
      if (next === this.current) return;
      if (!this.loaded.has(id)) {
        await next.load(this.context);
        this.loaded.add(id);
      }
      this.current?.exit();
      this.current = next;
      this.context.store.setChapter(id);
      next.enter();
    });
    return this.pending;
  }

  update(dt: number): void {
    this.current?.update(dt);
  }

  render(): void {
    this.context.renderer.render(this.context.stage.scene, this.context.stage.camera);
  }

  dispose(): void {
    this.current?.exit();
    this.current = null;
    for (const id of this.loaded) this.chapters.get(id)?.dispose();
    this.loaded.clear();
  }
}
