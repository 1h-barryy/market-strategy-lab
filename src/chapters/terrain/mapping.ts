import { BOARD_FRAME, unitsPerStep } from '../../world/shared/layout';

/**
 * The only place where Chapter 2's model data becomes scene geometry (DESIGN.md §5).
 *
 * x: position in steps, on exactly the board's scale (one step = half a bin), so the slice at the
 *    board's last day lines up with its pile. Spans ±EXTENT steps.
 * z: time; day 0 at the back of the board, the last day at the far end.
 * y: height above the floor. Each day's densities are divided by the ghost's peak on that day
 *    (the same factor for terrain and ghost), so the ghost is a constant-height ridge and the
 *    terrain reads lower-and-wider or taller-and-narrower against it. Within a day, shapes are exact.
 */
export const EXTENT = 100;
/** Smoothing of positions, in steps (also removes the odd/even-day zig-zag). */
export const SMOOTHING = 1.5;
/** Smoothing along days: sd = this share of the day (day 250 → 5 days; days below 25 untouched). */
export const DAY_SMOOTHING = 0.02;
/** The surface starts at day 1: day 0 is a single spike at the start. */
export const FIRST_DAY = 1;

export class TerrainMapping {
  /** World units per step. */
  readonly unit: number;
  readonly width: number;
  readonly depth: number;
  /** Height of the ghost ridge. */
  readonly ridge: number;
  readonly floor = BOARD_FRAME.binBottom - 0.15;
  /** z of day 0: just behind the board's backplate. */
  readonly z0 = BOARD_FRAME.back - 0.3;

  constructor(readonly boardDays: number, readonly days: number) {
    this.unit = unitsPerStep(boardDays);
    this.width = 2 * EXTENT * this.unit;
    this.depth = this.width * 0.8;
    this.ridge = this.width * 0.11;
  }

  x(position: number): number {
    return position * this.unit;
  }

  z(day: number): number {
    return this.z0 - (day / this.days) * this.depth;
  }

  /** Height for a density already divided by that day's ghost peak (ghost peak → `ridge`). */
  y(relative: number): number {
    return this.floor + relative * this.ridge;
  }

  /** Off-map ledge height for a share of stocks beyond one edge (100% → three ridges tall). */
  ledgeY(share: number): number {
    return this.floor + share * 3 * this.ridge;
  }

  /** Nearest day for a scene z, clamped to the surface. */
  dayAtZ(z: number): number {
    return Math.min(this.days, Math.max(FIRST_DAY, Math.round(((this.z0 - z) / this.depth) * this.days)));
  }

  /** Vertex index of (day, position) in a surface grid of rows FIRST_DAY..days × columns −EXTENT..EXTENT. */
  vertex(day: number, position: number): number {
    return (day - FIRST_DAY) * (2 * EXTENT + 1) + position + EXTENT;
  }

  get rows(): number {
    return this.days - FIRST_DAY + 1;
  }

  get columns(): number {
    return 2 * EXTENT + 1;
  }

  /**
   * Relative heights for both surfaces: shares[t][x] / ghostPeak[t], rows FIRST_DAY..days.
   * `terrain` and `ghost` are smoothed shares from model/stats (row-major, (days + 1) × columns).
   */
  relativeHeights(terrain: Float64Array, ghost: Float64Array): { terrain: Float32Array; ghost: Float32Array } {
    const cols = this.columns;
    const out = { terrain: new Float32Array(this.rows * cols), ghost: new Float32Array(this.rows * cols) };
    for (let day = FIRST_DAY; day <= this.days; day++) {
      let peak = 0;
      for (let i = 0; i < cols; i++) peak = Math.max(peak, ghost[day * cols + i]);
      const scale = peak > 0 ? 1 / peak : 0;
      for (let i = 0; i < cols; i++) {
        const v = (day - FIRST_DAY) * cols + i;
        out.terrain[v] = terrain[day * cols + i] * scale;
        out.ghost[v] = ghost[day * cols + i] * scale;
      }
    }
    return out;
  }
}
