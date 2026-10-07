/**
 * Caption rules (DESIGN.md §4 "Live captions"): measured stats in, caption keys out.
 * Pure; the wording for each key lives in content/copy.ts.
 */

export const CAPTION_RULES = {
  /** No pattern is claimed with fewer landed stocks than this. */
  minLanded: 40,
  /** Spread within ±10% of the baseline counts as "about the same". */
  spreadTolerance: 0.1,
  /**
   * A spread or mood claim must be this many standard errors from the baseline. 4, not 3: captions
   * are re-checked as every stock lands, and at z = 3 a neutral crowd showed a false mood claim on
   * ~0.5% of checks (z = 4: ~0.02%). Strong settings are still detected within 40–80 stocks.
   */
  z: 4,
  /** A mood claim also needs the average shifted by at least this share of the baseline spread. */
  moodEffect: 0.2,
} as const;

export interface CaptionStats {
  /** Landed stocks. */
  landed: number;
  /** Mean final position of landed stocks (in steps). */
  mean: number;
  /** Standard deviation of final positions of landed stocks (in steps). */
  sd: number;
  /** Standard deviation a crowd that ignores yesterday would produce at the same Mood. */
  baselineSd: number;
}

export type SpreadKey = 'needMore' | 'wider' | 'narrower' | 'same' | 'unclear';
export type MoodKey = 'up' | 'down' | null;

export interface Caption {
  spread: SpreadKey;
  mood: MoodKey;
}

export function captionFor(stats: CaptionStats): Caption {
  const { landed, mean, sd, baselineSd } = stats;
  const { minLanded, spreadTolerance, z, moodEffect } = CAPTION_RULES;
  if (landed < minLanded || !Number.isFinite(sd) || !Number.isFinite(mean) || baselineSd <= 0) {
    return { spread: 'needMore', mood: null };
  }

  // The standard error of a sample sd is about sd/√(2N), so the ratio's is about 1/√(2N).
  const ratio = sd / baselineSd;
  const zSpread = Math.abs(ratio - 1) * Math.sqrt(2 * landed);
  let spread: SpreadKey;
  if (Math.abs(ratio - 1) <= spreadTolerance) spread = 'same';
  else if (zSpread > z) spread = ratio > 1 ? 'wider' : 'narrower';
  else spread = 'unclear';

  // Average shift: significant against its own standard error, and large enough to matter.
  const standardError = sd / Math.sqrt(landed);
  const significant = standardError === 0 ? mean !== 0 : Math.abs(mean) / standardError > z;
  const mood: MoodKey = significant && Math.abs(mean) > moodEffect * baselineSd ? (mean > 0 ? 'up' : 'down') : null;
  return { spread, mood };
}
