import { describe, expect, it } from 'vitest';
import { finalVariance, generateBatch, type WorldParams } from '../../model/process';
import { mean, variance } from '../../model/stats';
import { CAPTION_RULES, captionFor, type CaptionStats } from './captions';

const base: CaptionStats = { landed: 100, mean: 0, sd: 3.46, baselineSd: 3.46 };

describe('caption rules: spread', () => {
  it('asks for more stocks below the minimum, and never claims a mood then', () => {
    expect(captionFor({ ...base, landed: CAPTION_RULES.minLanded - 1, sd: 9, mean: 5 })).toEqual({ spread: 'needMore', mood: null });
    expect(captionFor({ ...base, landed: 0, sd: Number.NaN, mean: Number.NaN })).toEqual({ spread: 'needMore', mood: null });
  });

  it('says "same" within ±10% of the baseline', () => {
    expect(captionFor({ ...base, sd: 3.46 * 1.09 }).spread).toBe('same');
    expect(captionFor({ ...base, sd: 3.46 * 0.91 }).spread).toBe('same');
  });

  it('says "wider" / "narrower" for a large, significant difference', () => {
    expect(captionFor({ ...base, sd: 3.46 * 1.8 }).spread).toBe('wider');
    expect(captionFor({ ...base, sd: 3.46 * 0.6 }).spread).toBe('narrower');
  });

  it('says "unclear" when the difference is large but not yet significant', () => {
    // N = 40: 1/√80 ≈ 0.11, so a 15% difference is only ~1.3 standard errors.
    expect(captionFor({ ...base, landed: 40, sd: 3.46 * 1.15 }).spread).toBe('unclear');
    // The same difference with many stocks is a clear claim.
    expect(captionFor({ ...base, landed: 2000, sd: 3.46 * 1.15 }).spread).toBe('wider');
  });
});

describe('caption rules: mood', () => {
  it('claims up/down only for a significant, sizeable shift', () => {
    expect(captionFor({ ...base, mean: 2.4 }).mood).toBe('up');
    expect(captionFor({ ...base, mean: -2.4 }).mood).toBe('down');
    // Significant (2000 stocks) but tiny: below 0.2 × baseline sd.
    expect(captionFor({ ...base, landed: 2000, mean: 0.5 }).mood).toBeNull();
    // Sizeable but noisy: 0.9 / (3.46/√40) ≈ 1.6 standard errors.
    expect(captionFor({ ...base, landed: 40, mean: 0.9 }).mood).toBeNull();
  });

  it('reports spread and mood independently', () => {
    expect(captionFor({ ...base, sd: 3.46 * 1.8, mean: -3 })).toEqual({ spread: 'wider', mood: 'down' });
  });
});

describe('caption rules on simulated stocks', () => {
  const statsFor = (params: WorldParams, count: number): CaptionStats => {
    const finals = generateBatch(params, count).paths.map((p) => p.final);
    return {
      landed: count,
      mean: mean(finals),
      sd: Math.sqrt(variance(finals)),
      baselineSd: Math.sqrt(finalVariance({ ...params, rho: 0 })),
    };
  };
  const world: WorldParams = { tilt: 0, sigmaStep: 0.02, rho: 0, n: 12, seed: 1 };

  it('detects chasing and reversing crowds from 100 stocks', () => {
    expect(captionFor(statsFor({ ...world, rho: 0.6 }, 100)).spread).toBe('wider');
    expect(captionFor(statsFor({ ...world, rho: -0.5 }, 100)).spread).toBe('narrower');
  });

  it('detects mood from 100 stocks, without inventing a spread pattern', () => {
    const up = captionFor(statsFor({ ...world, tilt: 0.1 }, 100));
    expect(up.mood).toBe('up');
    expect(['same', 'unclear']).toContain(up.spread);
    expect(captionFor(statsFor({ ...world, tilt: -0.1 }, 100)).mood).toBe('down');
  });

  it('rarely claims a pattern for a neutral crowd (false positives < 0.1% over 1,000 seeds)', () => {
    // Any single sample can be unusual (seed 20 with 80 stocks is ~4.1 standard errors off),
    // so this bounds the rate instead of demanding zero on hand-picked seeds.
    let checks = 0;
    let spreadClaims = 0;
    let moodClaims = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      for (const count of [40, 80, 200]) {
        const caption = captionFor(statsFor({ ...world, seed }, count));
        checks++;
        if (caption.spread === 'wider' || caption.spread === 'narrower') spreadClaims++;
        if (caption.mood) moodClaims++;
      }
    }
    expect(spreadClaims / checks).toBeLessThan(0.001);
    expect(moodClaims / checks).toBeLessThan(0.001);
  }, 30_000);
});
