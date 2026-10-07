import { describe, expect, it } from 'vitest';
import {
  PARAM_RANGES, finalMean, finalVariance, generateBatch, generatePath, pricePath, transitionProbs, type WorldParams,
} from './process';
import { mean, meanStep, variance } from './stats';

const base: WorldParams = { tilt: 0, sigmaStep: 0.01, rho: 0, n: 16, seed: 12345 };

describe('reproducibility', () => {
  it('gives an identical batch for the same seed', () => {
    const a = generateBatch(base, 200);
    const b = generateBatch(base, 200);
    expect(a.paths.map((p) => Array.from(p.steps))).toEqual(b.paths.map((p) => Array.from(p.steps)));
  });

  it('gives a different batch for a different seed', () => {
    const a = generateBatch(base, 200);
    const b = generateBatch({ ...base, seed: 54321 }, 200);
    expect(a.paths.map((p) => Array.from(p.steps))).not.toEqual(b.paths.map((p) => Array.from(p.steps)));
  });

  it('makes path i independent of batch size', () => {
    const small = generateBatch(base, 10);
    const large = generateBatch(base, 500);
    expect(Array.from(large.paths[7].steps)).toEqual(Array.from(small.paths[7].steps));
    expect(Array.from(generatePath(base, 7).steps)).toEqual(Array.from(small.paths[7].steps));
  });
});

describe('transition probabilities', () => {
  it('matches the formulas: P(+|+) = π + ρ(1 − π), P(+|−) = π(1 − ρ)', () => {
    const { pi, upAfterUp, upAfterDown } = transitionProbs(0.1, 0.9);
    expect(pi).toBeCloseTo(0.6, 12);
    expect(upAfterUp).toBeCloseTo(0.96, 12);
    expect(upAfterDown).toBeCloseTo(0.06, 12);
    // The difference of the two conditional probabilities is the lag-1 autocorrelation.
    expect(upAfterUp - upAfterDown).toBeCloseTo(0.9, 12);
  });

  it('stays inside [0, 1] at every corner of the allowed range', () => {
    for (const tilt of [PARAM_RANGES.tilt.min, 0, PARAM_RANGES.tilt.max]) {
      for (const rho of [PARAM_RANGES.rho.min, 0, PARAM_RANGES.rho.max]) {
        const probs = transitionProbs(tilt, rho);
        for (const p of [probs.pi, probs.upAfterUp, probs.upAfterDown]) {
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1);
        }
        // Corner batches generate without error and contain only ±1 steps.
        const batch = generateBatch({ ...base, tilt, rho }, 50);
        for (const path of batch.paths) for (const s of path.steps) expect(Math.abs(s)).toBe(1);
      }
    }
  });

  it('rejects parameters outside the allowed range', () => {
    expect(() => transitionProbs(0.11, 0)).toThrow(RangeError);
    expect(() => transitionProbs(0, 0.95)).toThrow(RangeError);
    expect(() => transitionProbs(0, -0.7)).toThrow(RangeError);
    expect(() => generateBatch({ ...base, n: 2.5 }, 1)).toThrow(RangeError);
    expect(() => generateBatch({ ...base, seed: -1 }, 1)).toThrow(RangeError);
    expect(() => generateBatch({ ...base, rho: Number.NaN }, 1)).toThrow(RangeError);
  });
});

describe('price', () => {
  it('accumulates log-price from steps and exponentiates it', () => {
    const path = generatePath({ ...base, sigmaStep: 0.02 }, 3);
    let l = 0;
    for (let t = 0; t < path.steps.length; t++) {
      l += 0.02 * path.steps[t];
      expect(path.logPrice[t + 1]).toBeCloseTo(l, 12);
    }
    expect(path.final).toBe(path.steps.reduce((a, b) => a + b, 0));
    const prices = pricePath(path, 100);
    expect(prices[0]).toBe(100);
    expect(prices[path.steps.length]).toBeCloseTo(100 * Math.exp(0.02 * path.final), 9);
  });
});

describe('drift is independent of inertia', () => {
  for (const rho of [-0.6, 0, 0.5, 0.9]) {
    it(`mean step ≈ 2π − 1 at tilt 0.1, ρ = ${rho}`, () => {
      const batch = generateBatch({ ...base, tilt: 0.1, rho, n: 100, seed: 2024 }, 10_000);
      expect(meanStep(batch.paths)).toBeCloseTo(0.2, 1);
      expect(Math.abs(meanStep(batch.paths) - 0.2)).toBeLessThan(0.02);
    });
  }

  it('matches the theoretical mean and variance of the final position', () => {
    for (const [tilt, rho] of [[0.05, 0.6], [-0.08, -0.4], [0, 0]] as const) {
      const params = { ...base, tilt, rho, n: 24, seed: 99 };
      const finals = generateBatch(params, 20_000).paths.map((p) => p.final);
      const sd = Math.sqrt(finalVariance(params));
      expect(Math.abs(mean(finals) - finalMean(params))).toBeLessThan(0.05 * sd + 0.05);
      expect(Math.sqrt(variance(finals)) / sd).toBeGreaterThan(0.97);
      expect(Math.sqrt(variance(finals)) / sd).toBeLessThan(1.03);
    }
  });
});
