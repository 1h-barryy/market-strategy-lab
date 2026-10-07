import { describe, expect, it } from 'vitest';
import { transitionProbs } from '../model/process';
import { levelOf, rhoToSlider, sliderToRho, sliderToTilt, tiltToSlider } from './CrowdControls';

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
