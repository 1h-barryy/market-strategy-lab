/**
 * The only place where model data becomes Chapter 1 scene coordinates.
 *
 * Board: n rows of pegs, n + 1 bins, fixed overall size (geometry never depends on σ_step).
 * A ball that has taken t steps with k up-steps sits on peg (t, k); an up-step moves it half a
 * peg spacing right, a down-step half a spacing left. After n steps it enters bin k.
 *
 * Price panel (right of the board): x = time 0..n, y = log-price, so a constant step size is a
 * constant height change and S_t = S_0·exp(L_t) is labeled on a log scale.
 */

export interface Point {
  x: number;
  y: number;
}

/** Fixed board frame in scene units. */
export const FRAME = {
  width: 10,
  pegTop: 7,
  pegBottom: 0.4,
  binTop: 0,
  binBottom: -5.5,
  /** Where balls appear before falling onto the first peg. */
  dropHeight: 8.4,
  price: { left: 7, right: 15, top: 2.5, bottom: -5.5 },
} as const;

/** Share of the bin height the tallest stack (or overlay point) may use. */
const STACK_FILL = 0.92;

export class BoardMapping {
  /** Horizontal distance between neighbouring bins (= one up-step minus one down-step). */
  readonly dx: number;
  /** Vertical distance between peg rows. */
  readonly dy: number;
  readonly ballRadius: number;
  readonly pegRadius: number;
  /** Height of the arc between pegs. */
  readonly hop: number;

  constructor(readonly n: number) {
    this.dx = FRAME.width / (n + 1);
    this.dy = (FRAME.pegTop - FRAME.pegBottom) / n;
    const cell = Math.min(this.dx, this.dy);
    this.ballRadius = cell * 0.28;
    this.pegRadius = cell * 0.11;
    this.hop = this.dy * 0.4;
  }

  /** Center of peg j (0..row) in row 0..n−1. */
  peg(row: number, j: number): Point {
    return { x: (j - row / 2) * this.dx, y: FRAME.pegTop - (row + 0.5) * this.dy };
  }

  /** Ball after t steps with k up-steps: resting on peg (t, k), or at the mouth of bin k when t = n. */
  ballAt(t: number, k: number): Point {
    if (t >= this.n) return { x: this.binX(k), y: FRAME.binTop };
    const peg = this.peg(t, k);
    return { x: peg.x, y: peg.y + this.pegRadius + this.ballRadius };
  }

  dropStart(): Point {
    return { x: 0, y: FRAME.dropHeight };
  }

  /** Center x of bin k (k up-steps, final position 2k − n). */
  binX(k: number): number {
    return (k - this.n / 2) * this.dx;
  }

  /** Bin under scene x, or −1 if outside the board. */
  binAtX(x: number): number {
    const k = Math.round(x / this.dx + this.n / 2);
    return k >= 0 && k <= this.n && Math.abs(x - this.binX(k)) <= this.dx / 2 ? k : -1;
  }

  /**
   * Height of one landed ball in a stack. The bins share one scale: the larger of the tallest
   * stack and the tallest overlay value must fit, so stack height stays proportional to count.
   */
  stackUnit(scaleCount: number): number {
    const fit = ((FRAME.binTop - FRAME.binBottom) * STACK_FILL) / Math.max(1, scaleCount);
    return Math.min(2 * this.ballRadius, fit);
  }

  /** Center of the ball at position `slot` (0 = bottom) of a stack. */
  stackY(slot: number, unit: number): number {
    return FRAME.binBottom + (slot + 0.5) * unit;
  }

  /** Stack slot under scene y, or −1 below the floor. */
  slotAtY(y: number, unit: number): number {
    return y < FRAME.binBottom ? -1 : Math.floor((y - FRAME.binBottom) / unit);
  }

  /** Height for an (expected) count on the same scale as the stacks. */
  countY(count: number, unit: number): number {
    return FRAME.binBottom + count * unit;
  }

  /** Log-return of bin k, in log units: σ_step·(2k − n). */
  binLogReturn(k: number, sigmaStep: number): number {
    return sigmaStep * (2 * k - this.n);
  }

  /** Price panel x for step t. */
  priceX(t: number): number {
    const { left, right } = FRAME.price;
    return left + (t / this.n) * (right - left);
  }

  /** Price panel y for log-price L, with ±halfRange filling the panel. */
  priceY(logPrice: number, halfRange: number): number {
    const { top, bottom } = FRAME.price;
    return (top + bottom) / 2 + (logPrice / halfRange) * ((top - bottom) / 2);
  }
}
