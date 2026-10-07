import { captionFor, type MoodKey, type SpreadKey } from '../../model/evidence';

/** Share of stocks beyond either map edge on day 250 above which the off-map note shows. */
export const OFF_MAP_NOTE = 0.01;

export interface YearStats {
  stocks: number;
  /** Mean and sd of positions on the last day (steps). */
  mean: number;
  sd: number;
  /** The ghost's sd on the last day (ρ = 0, same Mood). */
  ghostSd: number;
  /** Share of stocks beyond either edge of the map on the last day. */
  offMapShare: number;
}

export interface YearCaption {
  spread: SpreadKey;
  mood: MoodKey;
  offMap: boolean;
}

/** Year caption (DESIGN.md §5): the last day's spread vs. the ghost, with Chapter 1's evidence rules. */
export function yearCaption(stats: YearStats): YearCaption {
  const { spread, mood } = captionFor({ landed: stats.stocks, mean: stats.mean, sd: stats.sd, baselineSd: stats.ghostSd });
  return { spread, mood, offMap: stats.offMapShare > OFF_MAP_NOTE };
}

export interface DayStats {
  stocks: number;
  mean: number;
  sd: number;
  ghostSd: number;
}

/** Day caption comparison: that day's spread vs. the ghost's, under the same rules. */
export function dayComparison(stats: DayStats): SpreadKey {
  return captionFor({ landed: stats.stocks, mean: stats.mean, sd: stats.sd, baselineSd: stats.ghostSd }).spread;
}
