import type { Path } from './process';

/** Counts of final positions; bin k = number of up-steps (0..n), i.e. final = 2k − n. */
export function finalHistogram(paths: readonly Path[], n: number): number[] {
  const counts = new Array<number>(n + 1).fill(0);
  for (const path of paths) {
    if (path.steps.length !== n) throw new RangeError(`Path ${path.index} has ${path.steps.length} steps, expected ${n}.`);
    counts[(path.final + n) / 2]++;
  }
  return counts;
}

/** Binomial(n, p) pmf over k = 0..n, computed in log space so large n stays finite. */
export function binomialPmf(n: number, p: number): number[] {
  if (p <= 0 || p >= 1) return Array.from({ length: n + 1 }, (_, k) => (k === (p <= 0 ? 0 : n) ? 1 : 0));
  const pmf: number[] = [];
  let logChoose = 0;
  for (let k = 0; k <= n; k++) {
    if (k > 0) logChoose += Math.log(n - k + 1) - Math.log(k);
    pmf.push(Math.exp(logChoose + k * Math.log(p) + (n - k) * Math.log(1 - p)));
  }
  return pmf;
}

export function mean(values: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

/** Population variance (divides by the count). */
export function variance(values: ArrayLike<number>): number {
  const m = mean(values);
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += (values[i] - m) ** 2;
  return sum / values.length;
}

/** Mean step across all steps of all paths. */
export function meanStep(paths: readonly Path[]): number {
  let sum = 0;
  let count = 0;
  for (const path of paths) {
    for (const step of path.steps) sum += step;
    count += path.steps.length;
  }
  return sum / count;
}

/**
 * Lag-1 autocorrelation of steps, pooled across paths. Pairs never span two paths.
 * Returns NaN when there is not enough data (or all steps are equal).
 */
export function lag1Autocorrelation(paths: readonly Path[]): number {
  const m = meanStep(paths);
  let num = 0;
  let pairs = 0;
  let den = 0;
  let count = 0;
  for (const { steps } of paths) {
    for (let t = 0; t < steps.length; t++) {
      den += (steps[t] - m) ** 2;
      count++;
      if (t > 0) {
        num += (steps[t] - m) * (steps[t - 1] - m);
        pairs++;
      }
    }
  }
  if (pairs === 0 || den === 0) return NaN;
  return num / pairs / (den / count);
}

/**
 * Variance ratio VR(q) (DESIGN.md §3.3): every path is cut into non-overlapping q-step blocks;
 * the sample variance of all pooled block sums is divided by q times the variance of all single steps.
 * Returns NaN if there are fewer than two blocks.
 */
export function varianceRatio(paths: readonly Path[], q: number): number {
  const blocks: number[] = [];
  const singles: number[] = [];
  for (const { steps } of paths) {
    for (const step of steps) singles.push(step);
    for (let start = 0; start + q <= steps.length; start += q) {
      let sum = 0;
      for (let t = start; t < start + q; t++) sum += steps[t];
      blocks.push(sum);
    }
  }
  if (blocks.length < 2) return NaN;
  const stepVar = variance(singles);
  return stepVar === 0 ? NaN : variance(blocks) / (q * stepVar);
}

/** Theoretical VR(q) = 1 + 2Σ_{k=1}^{q−1}(1 − k/q)ρ^k; holds for any drift because corr(lag k) = ρ^k. */
export function varianceRatioTheory(q: number, rho: number): number {
  let sum = 1;
  let rhoK = 1;
  for (let k = 1; k < q; k++) {
    rhoK *= rho;
    sum += 2 * (1 - k / q) * rhoK;
  }
  return sum;
}

/**
 * Positions of every path on every day, binned per integer position in [−extent, extent].
 * Row t (0..days) holds day t; mass beyond either edge is kept in `below` / `above`, never dropped.
 * For a simulated batch, values are stock counts; for the exact ghost, probabilities (total = 1).
 */
export interface DayHistograms {
  days: number;
  extent: number;
  /** Positions per row: 2·extent + 1. */
  width: number;
  /** Row-major (days + 1) × width. */
  values: Float64Array;
  below: Float64Array;
  above: Float64Array;
  /** Sum of each row including below/above (stock count, or 1 for probabilities). */
  total: number;
}

function emptyHistograms(days: number, extent: number, total: number): DayHistograms {
  const width = 2 * extent + 1;
  return {
    days, extent, width, total,
    values: new Float64Array((days + 1) * width),
    below: new Float64Array(days + 1),
    above: new Float64Array(days + 1),
  };
}

function addAt(h: DayHistograms, day: number, position: number, amount: number): void {
  if (position < -h.extent) h.below[day] += amount;
  else if (position > h.extent) h.above[day] += amount;
  else h.values[day * h.width + position + h.extent] += amount;
}

/** Histograms of a batch, one row per day from 0 to the paths' length. */
export function dayHistograms(paths: readonly Path[], extent: number): DayHistograms {
  const days = paths[0]?.steps.length ?? 0;
  const h = emptyHistograms(days, extent, paths.length);
  for (const { steps } of paths) {
    if (steps.length !== days) throw new RangeError('All paths must have the same length.');
    let x = 0;
    addAt(h, 0, 0, 1);
    for (let t = 0; t < days; t++) {
      x += steps[t];
      addAt(h, t + 1, x, 1);
    }
  }
  return h;
}

/** Exact histograms of the ghost (ρ = 0, up-probability p): day t is 2·Binomial(t, p) − t. */
export function ghostHistograms(days: number, p: number, extent: number): DayHistograms {
  const h = emptyHistograms(days, extent, 1);
  for (let t = 0; t <= days; t++) {
    binomialPmf(t, p).forEach((mass, k) => addAt(h, t, 2 * k - t, mass));
  }
  return h;
}

/**
 * Gaussian smoothing along positions (sd `sigma` steps), turned into shares of all stocks.
 * Each position's mass is spread over its neighbours with weights renormalized at the edges, so
 * every row of the result plus below/above shares still sums to exactly 1. It also removes the
 * odd/even zig-zag (on day t only positions with t's parity are occupied).
 */
export function smoothShares(h: DayHistograms, sigma: number): Float64Array {
  const radius = Math.max(1, Math.ceil(4 * sigma));
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-0.5 * ((i - radius) / sigma) ** 2));
  const out = new Float64Array(h.values.length);
  for (let t = 0; t <= h.days; t++) {
    const row = t * h.width;
    for (let j = 0; j < h.width; j++) {
      const mass = h.values[row + j] / h.total;
      if (mass === 0) continue;
      const lo = Math.max(0, j - radius);
      const hi = Math.min(h.width - 1, j + radius);
      let norm = 0;
      for (let i = lo; i <= hi; i++) norm += kernel[i - j + radius];
      for (let i = lo; i <= hi; i++) out[row + i] += (mass * kernel[i - j + radius]) / norm;
    }
  }
  return out;
}

/** Mean and standard deviation of positions on every day 0..days. */
export function momentsByDay(paths: readonly Path[]): { mean: Float64Array; sd: Float64Array } {
  const days = paths[0]?.steps.length ?? 0;
  const sum = new Float64Array(days + 1);
  const sumSq = new Float64Array(days + 1);
  for (const { steps } of paths) {
    let x = 0;
    for (let t = 0; t < days; t++) {
      x += steps[t];
      sum[t + 1] += x;
      sumSq[t + 1] += x * x;
    }
  }
  const n = paths.length;
  const mean = sum.map((s) => s / n);
  const sd = sumSq.map((s, t) => Math.sqrt(Math.max(0, s / n - mean[t] ** 2)));
  return { mean, sd };
}

/** Every path's position after `day` days. */
export function positionsAt(paths: readonly Path[], day: number): Float64Array {
  return Float64Array.from(paths, ({ steps }) => {
    let x = 0;
    for (let t = 0; t < day; t++) x += steps[t];
    return x;
  });
}

/** Quantile q of values (linear interpolation between order statistics). */
export function quantile(values: ArrayLike<number>, q: number): number {
  const sorted = Float64Array.from(values).sort();
  if (sorted.length === 0) return NaN;
  const at = q * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** Smallest position x on day t of the ghost with P(X ≤ x) ≥ q, where X = 2·Binomial(t, p) − t. */
export function ghostQuantile(t: number, p: number, q: number): number {
  let cumulative = 0;
  const pmf = binomialPmf(t, p);
  for (let k = 0; k <= t; k++) {
    cumulative += pmf[k];
    if (cumulative >= q - 1e-12) return 2 * k - t;
  }
  return t;
}
