import { describe, expect, it } from 'vitest';
import { finalVariance, generateBatch, type WorldParams } from '../../model/process';
import { momentsByDay } from '../../model/stats';
import { dayComparison, yearCaption } from './captions';
import { advanceTerrain, canAdvanceTerrain, noteTerrainMoved, startTerrainIntro, terrainFreePlay } from './intro';

const world: WorldParams = { tilt: 0, sigmaStep: 0.02, rho: 0, n: 250, seed: 11 };

function yearStatsFor(params: WorldParams) {
  const paths = generateBatch(params, 2000).paths;
  const { mean, sd } = momentsByDay(paths);
  const ghostSd = Math.sqrt(finalVariance({ ...params, rho: 0 }));
  const offMap = paths.filter((p) => Math.abs(p.final) > 100).length / paths.length;
  return { stocks: 2000, mean: mean[250], sd: sd[250], ghostSd, offMapShare: offMap, daySd: sd, dayMean: mean };
}

describe('year caption', () => {
  it('reads a chasing crowd as opening faster, a reversing one as slower, a neutral one as the same', () => {
    expect(yearCaption(yearStatsFor({ ...world, rho: 0.6 })).spread).toBe('wider');
    expect(yearCaption(yearStatsFor({ ...world, rho: -0.5 })).spread).toBe('narrower');
    expect(yearCaption(yearStatsFor(world)).spread).toBe('same');
  });

  it('adds the mood and the off-map note only when they apply', () => {
    expect(yearCaption(yearStatsFor({ ...world, tilt: 0.05 })).mood).toBe('up');
    expect(yearCaption(yearStatsFor({ ...world, tilt: -0.05 })).mood).toBe('down');
    expect(yearCaption(yearStatsFor(world)).mood).toBeNull();
    expect(yearCaption(yearStatsFor({ ...world, rho: 0.9 })).offMap).toBe(true);
    expect(yearCaption(yearStatsFor(world)).offMap).toBe(false);
  });

  it('keeps the evidence guard', () => {
    expect(yearCaption({ stocks: 10, mean: 0, sd: 40, ghostSd: 15.8, offMapShare: 0 }).spread).toBe('needMore');
  });
});

describe('day caption', () => {
  it('compares each day with the ghost; the first day always matches', () => {
    const stats = yearStatsFor({ ...world, rho: 0.6 });
    const ghostSd = (t: number) => Math.sqrt(finalVariance({ ...world, n: t }));
    const compare = (t: number) => dayComparison({ stocks: 2000, mean: stats.dayMean[t], sd: stats.daySd[t], ghostSd: ghostSd(t) });
    expect(compare(1)).toBe('same');
    expect(compare(120)).toBe('wider');
  });
});

describe('terrain intro', () => {
  it('asks for the day, then for Yesterday, then frees play', () => {
    let state = startTerrainIntro();
    expect(canAdvanceTerrain(state)).toBe(false);
    expect(canAdvanceTerrain(noteTerrainMoved(state, 'herd'))).toBe(false);
    state = noteTerrainMoved(state, 'day');
    expect(canAdvanceTerrain(state)).toBe(true);
    state = advanceTerrain(state);
    expect(state.step).toBe(2);
    expect(canAdvanceTerrain(state)).toBe(false);
    state = advanceTerrain(noteTerrainMoved(state, 'herd'));
    expect(state.step).toBe('free');
    expect(canAdvanceTerrain(terrainFreePlay())).toBe(false);
  });
});
