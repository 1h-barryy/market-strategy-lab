import type { Chapter, ChapterContext } from '../types';

/** Chapter 2 — The Terrain. Stub until the terrain is built. */
export class TerrainChapter implements Chapter {
  readonly id = 'terrain';
  readonly title = 'Chapter 2 · The Terrain';
  private context!: ChapterContext;

  async load(context: ChapterContext): Promise<void> {
    this.context = context;
  }

  enter(): void {
    this.context.hud.setIntro(['The terrain is not built yet.'], [{ label: '← Back to the board', kind: 'link', onClick: () => this.context.navigate('board') }]);
  }

  update(): void {}
  exit(): void {}
  dispose(): void {}
}
