/**
 * Automatic quality fallback for the art system. Visual only and invisible to the player: no
 * controls, it never changes what is simulated or shown, only how sharp shadows and bloom are.
 *
 * After a warm-up, it averages frame times over a short window. If frames are slow, it steps down
 * one level (smaller shadow map, lower-resolution bloom) and measures again; it stops at the first
 * window that is fast enough, or at the lowest level.
 */
export interface QualityLevel {
  /** Key light shadow map size (texels per side). */
  shadowMap: number;
  /** Bloom resolution as a share of the canvas. */
  bloomScale: number;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { shadowMap: 2048, bloomScale: 1 },
  { shadowMap: 1024, bloomScale: 0.5 },
  { shadowMap: 512, bloomScale: 0.25 },
];

export const QUALITY_SAMPLING = {
  /** Seconds ignored at the start of each window (shader compiles, first uploads, new shadow map). */
  warmup: 1.5,
  /** Seconds averaged after the warm-up. */
  window: 3,
  /** Average frame time (ms) above which quality steps down (~36 fps). */
  slowFrameMs: 28,
  /** A gap longer than this (hidden tab, chapter load) restarts the window instead of counting. */
  maxGapMs: 250,
} as const;

export class QualityGovernor {
  private levelIndex = 0;
  private windowStart = -1;
  private last = -1;
  private total = 0;
  private frames = 0;
  private settled = false;

  constructor(private readonly apply: (level: QualityLevel, index: number) => void) {}

  get level(): number {
    return this.levelIndex;
  }

  /** Call once per rendered frame with the frame's timestamp (ms). */
  sample(time: number, visible = typeof document === 'undefined' || document.visibilityState === 'visible'): void {
    if (this.settled) return;
    if (!visible) {
      this.last = -1;
      return;
    }
    const gap = this.last < 0 ? Infinity : time - this.last;
    this.last = time;
    if (gap > QUALITY_SAMPLING.maxGapMs) {
      this.restart(time);
      return;
    }
    const elapsed = (time - this.windowStart) / 1000;
    if (elapsed < QUALITY_SAMPLING.warmup) return;
    this.total += gap;
    this.frames++;
    if (elapsed < QUALITY_SAMPLING.warmup + QUALITY_SAMPLING.window) return;
    const average = this.total / this.frames;
    if (average <= QUALITY_SAMPLING.slowFrameMs || this.levelIndex >= QUALITY_LEVELS.length - 1) {
      this.settled = true;
      return;
    }
    this.levelIndex++;
    this.apply(QUALITY_LEVELS[this.levelIndex], this.levelIndex);
    this.restart(time);
  }

  private restart(time: number): void {
    this.windowStart = time;
    this.total = 0;
    this.frames = 0;
  }
}
