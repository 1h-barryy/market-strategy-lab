import { describe, expect, it } from 'vitest';
import type { VerdictResult } from '../../model/backtest';
import { mulberry32 } from '../../model/random';
import { ruleAt } from '../../model/strategy';
import { betsText, crowdWords, explainVerdict, nerveMove, revealText, ruleText, tableCaption } from './captions';
import { advanceTest, canAdvanceTest, noteTest, startTestIntro, testFreePlay } from './intro';
import { MYSTERY_HABITS, MYSTERY_MOODS, pickMystery, revealOutcome } from './mystery';

const result = (verdict: VerdictResult['verdict'], beaten = 120, practiceBeaten = 199): VerdictResult => ({ verdict, p95: 0.16, beaten, practiceBeaten });

describe('Chapter 3 captions', () => {
  it('says whether any tile earned on the practice table', () => {
    expect(tableCaption([-0.2, 0, -1])).toBe('noneEarn');
    expect(tableCaption([-0.2, 0.01, -1])).toBe('someEarn');
  });

  it('describes a rule in plain words, with the move as a price change', () => {
    const follow = ruleAt('follow', { memory: 2, nerve: 2 }, 0.02); // 8 days, k = 0.02·√8
    expect(nerveMove(follow)).toBeCloseTo(Math.expm1(0.02 * Math.sqrt(8)), 12);
    expect(ruleText(follow)).toEqual({
      summary: 'Follow the move · Memory: 8 days',
      sentence: 'Look back 8 days. If the stock rose more than 5.8%, hold it the next day.',
    });
    const against = ruleAt('against', { memory: 0, nerve: 0 }, 0.02);
    expect(nerveMove(against)).toBeNull();
    expect(ruleText(against).sentence).toBe('Look back 2 days. If the stock fell at all, hold it the next day.');
    // A fall of k in log terms is a smaller price drop than a rise of k is a gain.
    const big = ruleAt('against', { memory: 5, nerve: 5 }, 0.02);
    expect(nerveMove(big)!).toBeLessThan(Math.expm1(big.threshold));
  });

  it('says how often a rule bets, and when it never does', () => {
    expect(betsText(0)).toMatch(/never bets/);
    expect(betsText(0.004)).toMatch(/under 1%/);
    expect(betsText(0.426)).toMatch(/43% of days/);
  });

  it('explains each verdict with the counts behind it', () => {
    expect(explainVerdict(result('sawThrough', 199), 200, false)).toMatchObject({ title: 'You saw through the machine' });
    expect(explainVerdict(result('sawThrough', 199), 200, false).text).toMatch(/beat 199 of 200/);
    const fooled = explainVerdict(result('fooledYourself', 120, 197), 200, false);
    expect(fooled.title).toBe('You fooled yourself');
    expect(fooled.text).toMatch(/beat 197 of 200 luck crowds, but on new stocks only 120/);
    expect(explainVerdict(result('justLuck', 80), 200, false)).toMatchObject({ title: 'Just luck' });
    expect(explainVerdict(result('justLuck', 0), 200, true).title).toMatch(/never bets/);
  });

  it('names the crowd in the sliders’ words', () => {
    expect(crowdWords(0, 0)).toEqual({ mood: 'Calm', yesterday: 'Ignores yesterday' });
    expect(crowdWords(0.03, 0.5)).toEqual({ mood: 'A little optimistic', yesterday: 'Chases it' });
    expect(crowdWords(-0.02, -0.15)).toEqual({ mood: 'A little panicked', yesterday: 'Turns against it a little' });
  });
});

describe('mystery machine', () => {
  it('picks Mood from the moderate range and Yesterday from the five habits, including none', () => {
    const rng = mulberry32(4);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const secret = pickMystery(rng);
      expect(MYSTERY_MOODS).toContain(secret.tilt);
      expect(MYSTERY_HABITS).toContain(secret.rho);
      expect(Number.isInteger(secret.seed)).toBe(true);
      seen.add(secret.rho);
    }
    expect(seen.size).toBe(MYSTERY_HABITS.length);
  });

  it('uses habits whose slider words are the five promised ones', () => {
    expect(MYSTERY_HABITS.map((rho) => crowdWords(0, rho).yesterday)).toEqual([
      'Turns against it', 'Turns against it a little', 'Ignores yesterday', 'Chases it a little', 'Chases it',
    ]);
    for (const tilt of MYSTERY_MOODS) expect(crowdWords(tilt, 0).mood).toMatch(/^(Calm|A little)/);
  });

  it('judges the verdict against the real machine', () => {
    expect(revealOutcome('sawThrough', 'follow', 0.5)).toBe('found');
    expect(revealOutcome('sawThrough', 'against', -0.35)).toBe('found');
    expect(revealOutcome('sawThrough', 'follow', 0)).toBe('falseAlarm');
    expect(revealOutcome('sawThrough', 'against', 0.2)).toBe('falseAlarm');
    expect(revealOutcome('justLuck', 'follow', 0)).toBe('nothingThere');
    expect(revealOutcome('fooledYourself', 'against', 0)).toBe('nothingThere');
    expect(revealOutcome('justLuck', 'follow', 0.2)).toBe('missed');
    expect(revealOutcome('fooledYourself', 'follow', -0.15)).toBe('missedWrongWay');
  });

  it('reveals the settings in player words', () => {
    expect(revealText(0, -0.35, 'missed')).toEqual({
      settings: 'Mood: Calm. Yesterday: Turns against it.',
      outcome: "There was a habit (turns against it), but your test didn't catch it.",
    });
  });
});

describe('Chapter 3 intro', () => {
  it('advances after a tile is picked, then after a verdict', () => {
    let state = startTestIntro();
    expect(canAdvanceTest(state)).toBe(false);
    state = noteTest(state, 'judged');
    expect(canAdvanceTest(state)).toBe(false);
    state = noteTest(state, 'chose');
    expect(canAdvanceTest(state)).toBe(true);
    state = advanceTest(state);
    expect(state.step).toBe(2);
    expect(canAdvanceTest(state)).toBe(false);
    state = noteTest(state, 'judged');
    expect(advanceTest(state).step).toBe('free');
    expect(canAdvanceTest(testFreePlay())).toBe(false);
  });
});
