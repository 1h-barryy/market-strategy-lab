/**
 * Fixed-step simulation clock, separate from render frames.
 * Each frame, `advance` runs as many whole fixed steps as real time allows. After a long gap
 * (tab in background, debugger pause) it drops the excess instead of fast-forwarding through it.
 * Data is precomputed by the model, so dropped time only delays playback; it never changes results.
 */
export class Clock {
  private last: number | null = null;
  private accumulator = 0;

  constructor(readonly step = 1 / 60, private readonly maxStepsPerFrame = 8) {}

  advance(nowMs: number, onStep: (dt: number) => void): void {
    if (this.last === null) this.last = nowMs;
    const elapsed = Math.max(0, (nowMs - this.last) / 1000);
    this.last = nowMs;
    this.accumulator = Math.min(this.accumulator + elapsed, this.step * this.maxStepsPerFrame);
    while (this.accumulator >= this.step) {
      onStep(this.step);
      this.accumulator -= this.step;
    }
  }

  /** Forget the last timestamp, e.g. after the loop was stopped. */
  reset(): void {
    this.last = null;
    this.accumulator = 0;
  }
}
