import { describe, expect, it } from 'vitest';
import { finalVariance, generateBatch, type WorldParams } from './process';
import {
  dayHistograms, ghostHistograms, ghostQuantile, momentsByDay, positionsAt, quantile, smoothShares, varianceRatioTheory,
} from './stats';

const world: WorldParams = { tilt: 0, sigmaStep: 0.02, rho: 0, n: 250, seed: 2468 };
const rowSum = (values: Float64Array, width: number, t: number): number => {
  let sum = 0;
  for (let i = 0; i < width; i++) sum += values[t * width + i];
  return sum;
};

describe('per-day histograms', () => {
  const batch = generateBatch({ ...world, rho: 0.9 }, 500);
  const h = dayHistograms(batch.paths, 100);

  it('counts every stock on every day, including those off the map', () => {
    for (const t of [0, 1, 50, 250]) {
      expect(rowSum(h.values, h.width, t) + h.below[t] + h.above[t]).toBe(500);
    }
    // At "Chases it hard" some stocks are beyond ±100 steps by day 250.
    expect(h.below[250] + h.above[250]).toBeGreaterThan(0);
  });

  it('smoothed shares plus off-map shares sum to 1 on every day', () => {
    const shares = smoothShares(h, 1.5);
    for (let t = 0; t <= 250; t += 25) {
      expect(rowSum(shares, h.width, t) + (h.below[t] + h.above[t]) / h.total).toBeCloseTo(1, 12);
    }
  });

  it('agrees with positionsAt and momentsByDay', () => {
    const positions = positionsAt(batch.paths, 120);
    const { mean } = momentsByDay(batch.paths);
    expect(mean[120]).toBeCloseTo(positions.reduce((a, b) => a + b, 0) / positions.length, 10);
  });
});

describe('ghost (exact, ρ = 0)', () => {
  for (const tilt of [0, 0.08]) {
    it(`has mean t(2π − 1) and variance 4tπ(1 − π) at tilt ${tilt}`, () => {
      const pi = 0.5 + tilt;
      const g = ghostHistograms(250, pi, 250);
      for (const t of [1, 10, 250]) {
        let m = 0;
        let m2 = 0;
        for (let i = 0; i < g.width; i++) {
          const x = i - g.extent;
          m += x * g.values[t * g.width + i];
          m2 += x * x * g.values[t * g.width + i];
        }
        expect(m).toBeCloseTo(t * (2 * pi - 1), 9);
        expect(m2 - m * m).toBeCloseTo(4 * t * pi * (1 - pi), 8);
      }
    });
  }

  it('keeps mass beyond the edges in below/above', () => {
    const g = ghostHistograms(250, 0.6, 30);
    expect(rowSum(g.values, g.width, 250) + g.below[250] + g.above[250]).toBeCloseTo(1, 12);
    // Mean +50 steps, sd 15.5: P(X > 30) ≈ 0.89.
    expect(g.above[250]).toBeCloseTo(0.89, 2);
  });

  it('quantiles bracket the middle half', () => {
    expect(ghostQuantile(4, 0.5, 0.25)).toBe(-2);
    expect(ghostQuantile(4, 0.5, 0.75)).toBe(2);
    expect(ghostQuantile(1, 0.5, 0.5)).toBe(-1);
  });
});

describe('spread over the year', () => {
  it('at ρ = 0, the spread on day t matches theory', () => {
    const { sd } = momentsByDay(generateBatch(world, 2000).paths);
    for (const t of [10, 50, 250]) {
      expect(sd[t] / Math.sqrt(finalVariance({ ...world, n: t }))).toBeCloseTo(1, 1);
    }
  });

  for (const rho of [-0.5, 0.3, 0.6]) {
    it(`spread growth matches variance-ratio theory at ρ = ${rho}`, () => {
      // Pooled over 10 seeds (20,000 stocks): one seed's variance estimate scatters ~3%, and an
      // unlucky seed can sit 4 standard errors out; pooling brings the error to ~1%.
      const stepVar = 4 * 0.55 * 0.45;
      const seeds = 10;
      const pooled = new Float64Array(251);
      for (let seed = 1; seed <= seeds; seed++) {
        const { sd } = momentsByDay(generateBatch({ ...world, rho, tilt: 0.05, seed }, 2000).paths);
        sd.forEach((value, t) => { pooled[t] += value ** 2 / seeds; });
      }
      for (const t of [10, 50, 250]) {
        const measured = pooled[t] / (t * stepVar);
        expect(Math.abs(measured / varianceRatioTheory(t, rho) - 1)).toBeLessThan(0.05);
      }
    });
  }

  it('quantile interpolates between order statistics', () => {
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(quantile([5], 0.25)).toBe(5);
  });
});
