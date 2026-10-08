import type { CrowdSettings } from '../../app/state';
import type { RevealKey } from '../../content/copy';
import type { Verdict } from '../../model/backtest';
import type { Rng } from '../../model/random';
import type { Direction } from '../../model/strategy';

/**
 * Mystery machine (DESIGN.md §6.3). Mood comes from a moderate range (Calm to a little either way);
 * Yesterday from five habits that match the slider's words: turns against it, a little against,
 * ignores it, a little chasing, chases it. "Ignores it" is included so sometimes there is nothing to find.
 */
export const MYSTERY_MOODS = [-0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03] as const;
export const MYSTERY_HABITS = [-0.35, -0.15, 0, 0.2, 0.5] as const;

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(rng() * items.length))];

/** A secret crowd, with its own seed so the board drops new stocks. */
export function pickMystery(rng: Rng): CrowdSettings {
  return { tilt: pick(rng, MYSTERY_MOODS), rho: pick(rng, MYSTERY_HABITS), seed: Math.floor(rng() * 0xffffffff) };
}

/**
 * Did the verdict match the real machine? A rule can only use a habit it bets on: Follow needs a
 * crowd that chases (ρ > 0), Against one that turns against yesterday (ρ < 0).
 */
export function revealOutcome(verdict: Verdict, direction: Direction, rho: number): RevealKey {
  const habit = rho > 0 ? 'follow' : rho < 0 ? 'against' : null;
  if (verdict === 'sawThrough') return habit === direction ? 'found' : 'falseAlarm';
  if (habit === null) return 'nothingThere';
  return habit === direction ? 'missed' : 'missedWrongWay';
}
