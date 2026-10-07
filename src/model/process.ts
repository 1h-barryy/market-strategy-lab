import { deriveSeed, mulberry32 } from './random';

/** World parameters shared by every chapter (DESIGN.md §3). */
export interface WorldParams {
  /** π = 0.5 + tilt is the stationary probability of an up-step. */
  tilt: number;
  /** Log-price change per step. */
  sigmaStep: number;
  /** Inertia: lag-1 autocorrelation of steps. */
  rho: number;
  /** Steps per path. */
  n: number;
  seed: number;
}

export const PARAM_RANGES = {
  tilt: { min: -0.1, max: 0.1 },
  rho: { min: -0.6, max: 0.9 },
  sigmaStep: { min: 0.001, max: 0.1 },
  n: { min: 1, max: 1000 },
} as const;

/** Tolerance for floating-point range checks (e.g. 0.5 + 0.1). */
const EPS = 1e-9;

export interface TransitionProbs {
  /** Stationary probability of an up-step; also the first step's probability. */
  pi: number;
  /** P(ε_t = +1 | ε_{t−1} = +1) = π + ρ(1 − π) */
  upAfterUp: number;
  /** P(ε_t = +1 | ε_{t−1} = −1) = π(1 − ρ) */
  upAfterDown: number;
}

function assertInRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min - EPS || value > max + EPS) {
    throw new RangeError(`${name} = ${value} is outside [${min}, ${max}].`);
  }
}

export function transitionProbs(tilt: number, rho: number): TransitionProbs {
  assertInRange('tilt', tilt, PARAM_RANGES.tilt.min, PARAM_RANGES.tilt.max);
  assertInRange('rho', rho, PARAM_RANGES.rho.min, PARAM_RANGES.rho.max);
  const pi = 0.5 + tilt;
  const probs = { pi, upAfterUp: pi + rho * (1 - pi), upAfterDown: pi * (1 - rho) };
  // Holds analytically across the whole allowed box; checked so a range change can't slip through.
  for (const [name, p] of Object.entries(probs)) assertInRange(name, p, 0, 1);
  return probs;
}

export function validateParams(params: WorldParams): void {
  transitionProbs(params.tilt, params.rho);
  assertInRange('sigmaStep', params.sigmaStep, PARAM_RANGES.sigmaStep.min, PARAM_RANGES.sigmaStep.max);
  if (!Number.isInteger(params.n)) throw new RangeError(`n = ${params.n} must be an integer.`);
  assertInRange('n', params.n, PARAM_RANGES.n.min, PARAM_RANGES.n.max);
  if (!Number.isInteger(params.seed) || params.seed < 0 || params.seed > 0xffffffff) {
    throw new RangeError(`seed = ${params.seed} must be an integer in [0, 2^32).`);
  }
}

export interface Path {
  /** Batch index; also selects this path's random stream. */
  index: number;
  /** ε_1..ε_n, each +1 or −1. */
  steps: Int8Array;
  /** L_0..L_n with L_0 = 0 and L_t = L_{t−1} + σ_step·ε_t. */
  logPrice: Float64Array;
  /** Final position Σε_t, in steps (−n..n). */
  final: number;
}

export interface Batch {
  params: Readonly<WorldParams>;
  paths: readonly Path[];
}

/** Generates path `index` of the world. Depends only on (params, index). */
export function generatePath(params: WorldParams, index: number): Path {
  validateParams(params);
  const { pi, upAfterUp, upAfterDown } = transitionProbs(params.tilt, params.rho);
  const rng = mulberry32(deriveSeed(params.seed, index));
  const steps = new Int8Array(params.n);
  const logPrice = new Float64Array(params.n + 1);
  let prev = 0;
  let final = 0;
  for (let t = 0; t < params.n; t++) {
    const pUp = prev === 0 ? pi : prev > 0 ? upAfterUp : upAfterDown;
    const step = rng() < pUp ? 1 : -1;
    steps[t] = step;
    final += step;
    logPrice[t + 1] = logPrice[t] + params.sigmaStep * step;
    prev = step;
  }
  return { index, steps, logPrice, final };
}

export function generateBatch(params: WorldParams, count: number): Batch {
  validateParams(params);
  const paths: Path[] = [];
  for (let i = 0; i < count; i++) paths.push(generatePath(params, i));
  return { params: { ...params }, paths };
}

/** S_t = S_0·exp(L_t). */
export function pricePath(path: Path, s0 = 100): Float64Array {
  return path.logPrice.map((l) => s0 * Math.exp(l));
}

/** Theoretical mean of the final position: n(2π − 1). */
export function finalMean(params: Pick<WorldParams, 'tilt' | 'n'>): number {
  return params.n * 2 * params.tilt;
}

/** Theoretical variance of the final position: 4π(1−π)·[n + 2Σ_{k=1}^{n−1}(n−k)ρ^k]. */
export function finalVariance(params: Pick<WorldParams, 'tilt' | 'rho' | 'n'>): number {
  const pi = 0.5 + params.tilt;
  let sum = params.n;
  let rhoK = 1;
  for (let k = 1; k < params.n; k++) {
    rhoK *= params.rho;
    sum += 2 * (params.n - k) * rhoK;
  }
  return 4 * pi * (1 - pi) * sum;
}
