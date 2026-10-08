import { generateBatch, type Path, type WorldParams } from './process';
import { deriveSeed } from './random';
import { quantile } from './stats';
import { FIRST_SCORED_DAY, GRID_SIZE, cellAt, ruleAt, triggers, type Direction, type Rule } from './strategy';

/**
 * Backtests (DESIGN.md §6.1): a rule's per-day return is position × that day's log-return, pooled
 * over every stock and scored day of a batch. Score = Sharpe of those returns × √250.
 */

export const DAYS_PER_YEAR = 250;
export const PRACTICE_STOCKS = 100;
export const NEW_STOCKS = 100;
export const LUCK_BATCHES = 200;
export const LUCK_STOCKS = 100;
/** Share of the luck baseline a score must beat. */
export const LUCK_QUANTILE = 0.95;

/** Stream tags under the world seed, so new stocks and luck batches never reuse the shared batch's paths. */
const NEW_STOCKS_STREAM = 0x5eed_0001;
const LUCK_STREAM = 0x5eed_1000;

/** Running sums of per-day strategy returns. */
export interface Moments {
  count: number;
  sum: number;
  sumSq: number;
}

const emptyMoments = (): Moments => ({ count: 0, sum: 0, sumSq: 0 });

/** Annualized Sharpe from pooled moments; 0 when there is no variation (e.g. a rule that never bets, or a constant return). */
export function sharpeFromMoments(m: Moments, daysPerYear = DAYS_PER_YEAR): number {
  if (m.count < 2) return 0;
  const mean = m.sum / m.count;
  const variance = (m.sumSq - m.count * mean * mean) / (m.count - 1);
  // sumSq − n·mean² cancels: a constant series leaves rounding noise of ~1e-16·mean², not 0.
  if (!(variance > 1e-10 * mean * mean) || variance < 1e-30) return 0;
  return (mean / Math.sqrt(variance)) * Math.sqrt(daysPerYear);
}

/** Annualized Sharpe of a series of per-day returns: mean / sample sd × √daysPerYear. */
export function sharpe(returns: ArrayLike<number>, daysPerYear = DAYS_PER_YEAR): number {
  const m = emptyMoments();
  for (let i = 0; i < returns.length; i++) addReturn(m, returns[i]);
  return sharpeFromMoments(m, daysPerYear);
}

function addReturn(m: Moments, r: number): void {
  m.count++;
  m.sum += r;
  m.sumSq += r * r;
}

/** Adds one path's scored days (FIRST_SCORED_DAY..n) for a rule. Flat days count as 0 returns. Returns days held. */
function accumulate(m: Moments, rule: Rule, logPrice: Float64Array): number {
  const N = rule.lookback;
  let held = 0;
  for (let t = FIRST_SCORED_DAY - 1; t < logPrice.length - 1; t++) {
    // Decided at the end of day t from days t − N..t; earns day t + 1.
    if (triggers(rule, logPrice[t] - logPrice[t - N])) {
      held++;
      addReturn(m, logPrice[t + 1] - logPrice[t]);
    } else {
      addReturn(m, 0);
    }
  }
  return held;
}

export interface BacktestResult {
  score: number;
  /** Share of scored stock-days the rule held the stock (0 = it never bets). */
  heldShare: number;
}

/** Pooled score of one rule over a batch of paths, and how often it bet. */
export function backtest(paths: readonly Path[], rule: Rule): BacktestResult {
  const m = emptyMoments();
  let held = 0;
  for (const path of paths) held += accumulate(m, rule, path.logPrice);
  return { score: sharpeFromMoments(m), heldShare: m.count ? held / m.count : 0 };
}

export function scoreRule(paths: readonly Path[], rule: Rule): number {
  return backtest(paths, rule).score;
}

/** Scores of all 36 rules for one direction; index = memory × 6 + nerve (see cellIndex). */
export function scoreGrid(paths: readonly Path[], direction: Direction, sigmaStep: number): Float64Array {
  const scores = new Float64Array(GRID_SIZE);
  for (let i = 0; i < GRID_SIZE; i++) scores[i] = scoreRule(paths, ruleAt(direction, cellAt(i), sigmaStep));
  return scores;
}

/** Practice table: the first stocks of the shared batch, the ones the board drops first. */
export function practicePaths(batch: readonly Path[], count = PRACTICE_STOCKS): readonly Path[] {
  return batch.slice(0, count);
}

/** Same machine, fresh seed. */
export function newStocksParams(params: WorldParams): WorldParams {
  return { ...params, seed: deriveSeed(params.seed, NEW_STOCKS_STREAM) };
}

/** Luck batch b: same Mood (π) and σ_step, a crowd that ignores yesterday (ρ = 0), its own seed. */
export function luckParams(params: WorldParams, b: number): WorldParams {
  return { ...params, rho: 0, seed: deriveSeed(params.seed, LUCK_STREAM + b) };
}

/** Score of a rule on luck batch b. Separate so callers can spread the 200 batches over frames. */
export function luckScore(params: WorldParams, rule: Rule, b: number, stocks = LUCK_STOCKS): number {
  return scoreRule(generateBatch(luckParams(params, b), stocks).paths, rule);
}

export function luckScores(params: WorldParams, rule: Rule, batches = LUCK_BATCHES, stocks = LUCK_STOCKS): Float64Array {
  const scores = new Float64Array(batches);
  for (let b = 0; b < batches; b++) scores[b] = luckScore(params, rule, b, stocks);
  return scores;
}

export type Verdict = 'sawThrough' | 'fooledYourself' | 'justLuck';

export interface VerdictResult {
  verdict: Verdict;
  /** 95th percentile of the luck baseline. */
  p95: number;
  /** How many luck scores the new-stocks score beat (strictly). */
  beaten: number;
  /** How many luck scores the practice score beat (strictly). */
  practiceBeaten: number;
}

/** Saw through: new > p95. Fooled yourself: practice > p95, new ≤ p95. Just luck: otherwise. */
export function verdictFor(practice: number, fresh: number, luck: ArrayLike<number>): VerdictResult {
  const p95 = quantile(luck, LUCK_QUANTILE);
  let beaten = 0;
  let practiceBeaten = 0;
  for (let i = 0; i < luck.length; i++) {
    if (fresh > luck[i]) beaten++;
    if (practice > luck[i]) practiceBeaten++;
  }
  const verdict: Verdict = fresh > p95 ? 'sawThrough' : practice > p95 ? 'fooledYourself' : 'justLuck';
  return { verdict, p95, beaten, practiceBeaten };
}

/** Index of the highest score (first on ties). */
export function bestCell(scores: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  return best;
}
