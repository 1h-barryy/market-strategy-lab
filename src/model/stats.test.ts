import { describe, expect, it } from 'vitest';
import { generateBatch, type Path, type WorldParams } from './process';
import { binomialPmf, finalHistogram, lag1Autocorrelation, varianceRatio, varianceRatioTheory } from './stats';

const base: WorldParams = { tilt: 0, sigmaStep: 0.01, rho: 0, n: 64, seed: 777 };

function pathFrom(steps: number[], index = 0): Path {
  const logPrice = new Float64Array(steps.length + 1);
  steps.forEach((s, t) => { logPrice[t + 1] = logPrice[t] + s; });
  return { index, steps: Int8Array.from(steps), logPrice, final: steps.reduce((a, b) => a + b, 0) };
}

/** Pearson chi-square against expected probabilities, merging tail bins until each expects ≥ 5. */
function chiSquare(observed: number[], probs: number[], total: number): { stat: number; df: number } {
  const cells: Array<{ o: number; e: number }> = [];
  let o = 0;
  let e = 0;
  for (let k = 0; k < observed.length; k++) {
    o += observed[k];
    e += probs[k] * total;
    if (e >= 5) { cells.push({ o, e }); o = 0; e = 0; }
  }
  if (cells.length && (o || e)) { cells[cells.length - 1].o += o; cells[cells.length - 1].e += e; }
  return { stat: cells.reduce((s, c) => s + (c.o - c.e) ** 2 / c.e, 0), df: cells.length - 1 };
}

describe('histogram and binomial', () => {
  it('bins final positions by number of up-steps', () => {
    const paths = [pathFrom([1, 1, 1]), pathFrom([1, -1, 1]), pathFrom([-1, -1, -1])];
    expect(finalHistogram(paths, 3)).toEqual([1, 0, 1, 1]);
  });

  it('computes a pmf that sums to 1 with the right mean', () => {
    const pmf = binomialPmf(20, 0.6);
    expect(pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(pmf.reduce((s, p, k) => s + p * k, 0)).toBeCloseTo(12, 10);
    expect(binomialPmf(4, 0.5)).toEqual([1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16].map((x) => expect.closeTo(x, 12)));
  });

  // χ² critical values at α = 0.001 (generous: the seed is fixed, so this checks the model, not luck).
  const chi2Crit999: Record<number, number> = { 10: 29.59, 11: 31.26, 12: 32.91, 13: 34.53, 14: 36.12, 15: 37.7 };

  for (const tilt of [0, 0.1, -0.06]) {
    it(`ρ = 0, tilt = ${tilt}: final histogram matches Binomial(n, π)`, () => {
      const n = 16;
      const count = 10_000;
      const batch = generateBatch({ ...base, tilt, n, seed: 4242 }, count);
      const { stat, df } = chiSquare(finalHistogram(batch.paths, n), binomialPmf(n, 0.5 + tilt), count);
      expect(chi2Crit999[df]).toBeDefined();
      expect(stat).toBeLessThan(chi2Crit999[df]);
    });
  }
});

describe('lag-1 autocorrelation', () => {
  it('handles a hand-made alternating sequence', () => {
    // Steps alternate perfectly, mean 0 → autocorrelation −1 (per pair, scaled by pairs/count).
    expect(lag1Autocorrelation([pathFrom([1, -1, 1, -1, 1, -1])])).toBeCloseTo(-1, 12);
    expect(lag1Autocorrelation([])).toBeNaN();
  });

  for (const tilt of [0, 0.08]) {
    for (const rho of [-0.5, 0, 0.3, 0.6]) {
      it(`≈ ρ for ρ = ${rho}, tilt = ${tilt}`, () => {
        const batch = generateBatch({ ...base, tilt, rho, n: 50, seed: 31337 }, 5_000);
        expect(Math.abs(lag1Autocorrelation(batch.paths) - rho)).toBeLessThan(0.02);
      });
    }
  }
});

describe('variance ratio', () => {
  it('has the expected theoretical values', () => {
    expect(varianceRatioTheory(4, 0)).toBe(1);
    expect(varianceRatioTheory(2, 0.5)).toBeCloseTo(1.5, 12);
    // Large-q limit (1 + ρ)/(1 − ρ).
    expect(varianceRatioTheory(5000, 0.3)).toBeCloseTo(1.3 / 0.7, 2);
  });

  it('returns NaN when there are not enough blocks', () => {
    expect(varianceRatio([pathFrom([1, -1, 1])], 4)).toBeNaN();
  });

  for (const tilt of [0, 0.08]) {
    for (const rho of [-0.5, 0, 0.3, 0.6]) {
      for (const q of [2, 4, 8]) {
        it(`measured VR(${q}) matches theory for ρ = ${rho}, tilt = ${tilt}`, () => {
          const batch = generateBatch({ ...base, tilt, rho, seed: 8080 }, 5_000);
          const theory = varianceRatioTheory(q, rho);
          expect(Math.abs(varianceRatio(batch.paths, q) / theory - 1)).toBeLessThan(0.05);
        });
      }
    }
  }
});
