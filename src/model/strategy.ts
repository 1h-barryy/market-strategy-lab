/**
 * Betting rules (DESIGN.md §6.1): long/flat only. A rule looks at a stock's log-return over the last
 * N days (Memory) and holds the stock for the next day if that move is beyond k (Nerve).
 * Follow: hold after a rise of more than k. Against: hold after a fall of more than k.
 */

export type Direction = 'follow' | 'against';

export interface Rule {
  direction: Direction;
  /** Memory: N, days of history the rule looks at. */
  lookback: number;
  /** Nerve: k, the log-return the move must exceed (rise for follow, fall for against). */
  threshold: number;
}

/** Grid rows: Memory N in days. */
export const LOOKBACKS = [2, 4, 8, 16, 32, 64] as const;
/** Grid columns: Nerve as multiples of a typical N-day move, σ_step·√N. */
export const NERVES = [0, 0.5, 1, 1.5, 2, 2.5] as const;
export const GRID_SIZE = LOOKBACKS.length * NERVES.length;

/**
 * First day every rule is scored on: the first day whose position the longest Memory can decide
 * (it needs days 1..64 to decide day 65). All rules share these days so tiles compare like for like.
 */
export const FIRST_SCORED_DAY = LOOKBACKS[LOOKBACKS.length - 1] + 1;

/**
 * Moves are sums of ±σ_step steps, so a move "equal" to the threshold can come out a hair above
 * or below it in floating point. A move must beat the threshold by more than this to count.
 */
const EPS = 1e-9;

export interface GridCell {
  memory: number;
  nerve: number;
}

export function cellIndex(cell: GridCell): number {
  return cell.memory * NERVES.length + cell.nerve;
}

export function cellAt(index: number): GridCell {
  return { memory: Math.floor(index / NERVES.length), nerve: index % NERVES.length };
}

/** The rule in grid cell (memory, nerve) for a given direction and step size. */
export function ruleAt(direction: Direction, cell: GridCell, sigmaStep: number): Rule {
  const lookback = LOOKBACKS[cell.memory];
  return { direction, lookback, threshold: NERVES[cell.nerve] * sigmaStep * Math.sqrt(lookback) };
}

/** True if a move (log-return over the lookback) triggers the rule. */
export function triggers(rule: Rule, move: number): boolean {
  return rule.direction === 'follow' ? move > rule.threshold + EPS : move < -rule.threshold - EPS;
}

/**
 * Whether the rule holds the stock during day t + 1, decided at the end of day t from
 * logPrice[t − N..t] only. False until N days of history exist.
 */
export function holdsAfter(rule: Rule, logPrice: ArrayLike<number>, t: number): boolean {
  if (t < rule.lookback || t >= logPrice.length) return false;
  return triggers(rule, logPrice[t] - logPrice[t - rule.lookback]);
}

/** positions[t] = 1 if the stock is held during day t (t = 1..n), else 0; positions[0] = 0. */
export function positions(rule: Rule, logPrice: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(logPrice.length);
  for (let t = 1; t < logPrice.length; t++) out[t] = holdsAfter(rule, logPrice, t - 1) ? 1 : 0;
  return out;
}
