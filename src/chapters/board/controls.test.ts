import { describe, expect, it } from 'vitest';
import { transitionProbs } from '../../model/process';
import { levelOf, rhoToSlider, sliderToRho, sliderToTilt, tiltToSlider } from './controls';
import { advance, canAdvance, freePlay, locks, noteMoved, startIntro } from './intro';

describe('slider mapping', () => {
  it('puts the neutral setting at the center and the range ends at the track ends', () => {
    expect(sliderToRho(0)).toBe(0);
    expect(sliderToRho(-100)).toBe(-0.6);
    expect(sliderToRho(100)).toBe(0.9);
    expect(sliderToTilt(0)).toBe(0);
    expect(sliderToTilt(-100)).toBe(-0.1);
    expect(sliderToTilt(100)).toBe(0.1);
  });

  it('round-trips every slider position and stays inside the model range', () => {
    for (let position = -100; position <= 100; position++) {
      expect(rhoToSlider(sliderToRho(position))).toBe(position);
      expect(tiltToSlider(sliderToTilt(position))).toBe(position);
      expect(() => transitionProbs(sliderToTilt(position), sliderToRho(position))).not.toThrow();
    }
  });

  it('names the level of a setting in four steps', () => {
    expect([0, 9, 10, 39, 40, 74, 75, 100].map(levelOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(levelOf(-80)).toBe(3);
  });
});

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
