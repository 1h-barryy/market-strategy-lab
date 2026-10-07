import { describe, expect, it } from 'vitest';
import { advance, canAdvance, freePlay, locks, noteMoved, startIntro } from './intro';

describe('guided intro', () => {
  it('locks Mood and Yesterday in step 1, Yesterday in step 2, nothing later', () => {
    expect(locks(1)).toEqual({ mood: true, herd: true });
    expect(locks(2)).toEqual({ mood: false, herd: true });
    expect(locks(3)).toEqual({ mood: false, herd: false });
    expect(locks('free')).toEqual({ mood: false, herd: false });
  });

  it('offers Next after enough stocks, then after each new control is tried', () => {
    let state = startIntro();
    expect(canAdvance(state, 39)).toBe(false);
    expect(canAdvance(state, 40)).toBe(true);
    state = advance(state);
    expect(state.step).toBe(2);
    expect(canAdvance(noteMoved(state, 'herd'), 0)).toBe(false);
    state = noteMoved(state, 'mood');
    expect(canAdvance(state, 0)).toBe(true);
    state = advance(state);
    expect(canAdvance(state, 0)).toBe(false);
    state = advance(noteMoved(state, 'herd'));
    expect(state.step).toBe('free');
    expect(canAdvance(freePlay(), 1000)).toBe(false);
  });
});
