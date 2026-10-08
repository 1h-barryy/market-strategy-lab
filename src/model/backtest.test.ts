import { describe, expect, it } from 'vitest';
import {
  backtest, bestCell, luckParams, luckScores, newStocksParams, practicePaths, scoreGrid, scoreRule, sharpe, verdictFor,
  LUCK_BATCHES,
} from './backtest';
import { generateBatch, generatePath, type Path, type WorldParams } from './process';
import { FIRST_SCORED_DAY, GRID_SIZE, cellAt, holdsAfter, positions, ruleAt, type Direction, type Rule } from './strategy';

const SIGMA = 0.02;
const world = (rho: number, seed: number, tilt = 0): WorldParams => ({ tilt, sigmaStep: SIGMA, rho, n: 250, seed });

/** A path from an explicit step sequence. */
function pathFrom(steps: number[]): Path {
  const logPrice = new Float64Array(steps.length + 1);
  steps.forEach((s, t) => { logPrice[t + 1] = logPrice[t] + SIGMA * s; });
  return { index: 0, steps: Int8Array.from(steps), logPrice, final: steps.reduce((a, b) => a + b, 0) };
}

/** The full Chapter 3 test for one world: best practice tile → new stocks → luck baseline → verdict. */
function playRound(params: WorldParams, direction: Direction) {
  const practice = practicePaths(generateBatch(params, 2000).paths);
  const grid = scoreGrid(practice, direction, params.sigmaStep);
  const rule = ruleAt(direction, cellAt(bestCell(grid)), params.sigmaStep);
  const fresh = scoreRule(generateBatch(newStocksParams(params), 100).paths, rule);
  return verdictFor(grid[bestCell(grid)], fresh, luckScores(params, rule));
}

describe('betting rules', () => {
  const follow: Rule = { direction: 'follow', lookback: 2, threshold: 0 };
  const against: Rule = { direction: 'against', lookback: 2, threshold: 0 };

  it('follow holds after a rise, against after a fall, and nothing before the lookback', () => {
    const path = pathFrom([1, 1, -1, -1, -1, 1]);
    // Moves over 2 days at the end of days 2..5: +2, 0, −2, −2 steps.
    expect(Array.from(positions(follow, path.logPrice))).toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect(Array.from(positions(against, path.logPrice))).toEqual([0, 0, 0, 0, 0, 1, 1]);
  });

  it('needs the move to beat the threshold strictly, despite floating-point sums', () => {
    // Over 4 days, two ups and two downs are a move of 0 and four ups are exactly 4σ.
    const flat = pathFrom([1, -1, 1, -1, 1]);
    expect(holdsAfter({ direction: 'follow', lookback: 4, threshold: 0 }, flat.logPrice, 4)).toBe(false);
    const run = pathFrom([1, 1, 1, 1, 1]);
    expect(holdsAfter({ direction: 'follow', lookback: 4, threshold: 4 * SIGMA }, run.logPrice, 4)).toBe(false);
    expect(holdsAfter({ direction: 'follow', lookback: 4, threshold: 3.9 * SIGMA }, run.logPrice, 4)).toBe(true);
  });

  it('never looks ahead: changing days after t leaves every decision up to day t + 1 unchanged', () => {
    const base = generatePath(world(0.5, 7), 3);
    for (const rule of [follow, against, ruleAt('follow', { memory: 3, nerve: 2 }, SIGMA), ruleAt('against', { memory: 5, nerve: 1 }, SIGMA)]) {
      for (const t of [10, 70, 180]) {
        const altered = Float64Array.from(base.logPrice);
        for (let u = t + 1; u < altered.length; u++) altered[u] = altered[u - 1] + (u % 3 === 0 ? 5 : -5) * SIGMA;
        const a = positions(rule, base.logPrice).subarray(0, t + 2);
        const b = positions(rule, altered).subarray(0, t + 2);
        expect(Array.from(b)).toEqual(Array.from(a));
      }
    }
  });

  it('builds the grid from Memory and Nerve: k = nerve × σ√N', () => {
    expect(ruleAt('follow', { memory: 0, nerve: 0 }, SIGMA)).toEqual({ direction: 'follow', lookback: 2, threshold: 0 });
    const rule = ruleAt('against', { memory: 4, nerve: 2 }, SIGMA);
    expect(rule.lookback).toBe(32);
    expect(rule.threshold).toBeCloseTo(SIGMA * Math.sqrt(32), 12);
  });
});

describe('score', () => {
  it('is mean / sample sd × √250 on a known series', () => {
    // Mean 0.02; sample sd of [0.01, 0.03, 0.01, 0.03] = √(4 × 0.0001 / 3).
    const expected = (0.02 / Math.sqrt(0.0004 / 3)) * Math.sqrt(250);
    expect(sharpe([0.01, 0.03, 0.01, 0.03])).toBeCloseTo(expected, 10);
    expect(sharpe([0.01, 0.03, 0.01, 0.03], 1)).toBeCloseTo(0.02 / Math.sqrt(0.0004 / 3), 10);
  });

  it('is 0 for a rule that never bets', () => {
    const paths = generateBatch(world(0, 3), 20).paths;
    const never: Rule = { direction: 'follow', lookback: 2, threshold: 10 * SIGMA };
    expect(backtest(paths, never)).toEqual({ score: 0, heldShare: 0 });
  });

  it('pools hand-checked returns over the scored days only', () => {
    // Up every day: follow-the-move holds every scored day and earns +σ each day; no variation → 0.
    const up = pathFrom(Array(100).fill(1));
    expect(backtest([up], { direction: 'follow', lookback: 2, threshold: 0 })).toEqual({ score: 0, heldShare: 1 });
    // Alternate a held up-day and a flat day from day FIRST_SCORED_DAY on: returns σ, 0, σ, 0, ...
    const steps = Array.from({ length: 100 }, (_, t) => (t % 2 === 0 ? 1 : -1));
    const zigzag = pathFrom(steps);
    const rule: Rule = { direction: 'against', lookback: 1, threshold: 0 };
    const returns: number[] = [];
    for (let t = FIRST_SCORED_DAY; t <= 100; t++) returns.push(holdsAfter(rule, zigzag.logPrice, t - 1) ? zigzag.logPrice[t] - zigzag.logPrice[t - 1] : 0);
    expect(scoreRule([zigzag], rule)).toBeCloseTo(sharpe(returns), 12);
  });

  it('scores all 36 tiles in cell order', () => {
    const paths = generateBatch(world(0.3, 5), 50).paths;
    const grid = scoreGrid(paths, 'follow', SIGMA);
    expect(grid.length).toBe(GRID_SIZE);
    expect(grid[14]).toBe(scoreRule(paths, ruleAt('follow', cellAt(14), SIGMA)));
  });
});

describe('batches', () => {
  it('practice is the first 100 stocks of the shared batch', () => {
    const shared = generateBatch(world(0.2, 9), 2000).paths;
    const practice = practicePaths(shared);
    expect(practice.length).toBe(100);
    expect(practice[99]).toBe(shared[99]);
  });

  it('new stocks and luck batches have their own seeds; luck keeps Mood and drops Yesterday', () => {
    const params = world(0.4, 9, 0.05);
    const fresh = newStocksParams(params);
    expect(fresh).toMatchObject({ tilt: 0.05, rho: 0.4, sigmaStep: SIGMA });
    expect(fresh.seed).not.toBe(params.seed);
    const luck = [0, 1].map((b) => luckParams(params, b));
    expect(luck[0]).toMatchObject({ tilt: 0.05, rho: 0, sigmaStep: SIGMA });
    expect(new Set([params.seed, fresh.seed, luck[0].seed, luck[1].seed]).size).toBe(4);
  });
});

describe('verdict', () => {
  const luck = Array.from({ length: 200 }, (_, i) => i / 100); // 0.00 .. 1.99; p95 = 1.8905

  it('saw through when new stocks beat p95, whatever practice did', () => {
    expect(verdictFor(0, 1.95, luck).verdict).toBe('sawThrough');
    expect(verdictFor(3, 1.95, luck)).toMatchObject({ verdict: 'sawThrough', beaten: 195, practiceBeaten: 200 });
  });

  it('fooled yourself when only practice beat p95', () => {
    expect(verdictFor(3, 1.5, luck).verdict).toBe('fooledYourself');
  });

  it('just luck otherwise, including a score exactly at p95', () => {
    expect(verdictFor(1, 1.5, luck).verdict).toBe('justLuck');
    const { p95 } = verdictFor(0, 0, luck);
    expect(p95).toBeCloseTo(1.8905, 10);
    expect(verdictFor(p95, p95, luck).verdict).toBe('justLuck');
  });
});

describe('the test, end to end', () => {
  it(`with ρ = 0, "saw through" happens about 5% of the time or less (${LUCK_BATCHES} luck batches each)`, () => {
    let passed = 0;
    let trials = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const direction of ['follow', 'against'] as const) {
        trials++;
        if (playRound(world(0, seed * 101, seed % 3 === 0 ? 0.03 : 0), direction).verdict === 'sawThrough') passed++;
      }
    }
    // Under the null, new stocks and luck batches are exchangeable, so P(pass) ≈ 5%: 2 of 40 expected.
    expect(passed / trials).toBeLessThanOrEqual(0.1);
  }, 60_000);

  it('with ρ = 0.6 and Follow the move, the best rule usually passes', () => {
    const verdicts = [1, 2, 3, 4, 5].map((seed) => playRound(world(0.6, seed), 'follow').verdict);
    expect(verdicts.filter((v) => v === 'sawThrough').length).toBeGreaterThanOrEqual(4);
  }, 30_000);

  it('with ρ = −0.5, Against usually passes and Follow does not', () => {
    const seeds = [1, 2, 3, 4, 5];
    const against = seeds.map((seed) => playRound(world(-0.5, seed), 'against').verdict);
    const follow = seeds.map((seed) => playRound(world(-0.5, seed), 'follow').verdict);
    expect(against.filter((v) => v === 'sawThrough').length).toBeGreaterThanOrEqual(4);
    expect(follow.filter((v) => v === 'sawThrough').length).toBeLessThanOrEqual(1);
  }, 30_000);
});
