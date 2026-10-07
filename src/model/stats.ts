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
