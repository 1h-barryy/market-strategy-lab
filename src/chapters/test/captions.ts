import { copy, type RevealKey } from '../../content/copy';
import type { VerdictResult } from '../../model/backtest';
import type { Rule } from '../../model/strategy';
import { levelOf, rhoToSlider, tiltToSlider } from '../../ui/CrowdControls';

/**
 * Chapter 3 text rules (DESIGN.md §6.4): pure functions from results to player text, in the same
 * style as Chapters 1 and 2. No model symbols reach the player.
 */

/** Table caption: does any rule in this direction earn on the practice table? */
export function tableCaption(scores: ArrayLike<number>): 'noneEarn' | 'someEarn' {
  for (let i = 0; i < scores.length; i++) if (scores[i] > 0) return 'someEarn';
  return 'noneEarn';
}

/** The price move a rule waits for, as a positive fraction (a rise for Follow, a fall for Against); null = any move. */
export function nerveMove(rule: Rule): number | null {
  if (rule.threshold === 0) return null;
  return rule.direction === 'follow' ? Math.expm1(rule.threshold) : -Math.expm1(-rule.threshold);
}

const percent = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`;

/** The rule in plain words: a summary line and one sentence. */
export function ruleText(rule: Rule): { summary: string; sentence: string } {
  const text = copy().test;
  const follow = rule.direction === 'follow';
  const move = nerveMove(rule);
  return {
    summary: text.rule.summary(follow ? text.direction.follow : text.direction.against, rule.lookback),
    sentence: text.rule.sentence(follow, rule.lookback, move === null ? null : percent(move)),
  };
}

/** How often a rule bets, in words; the never-bets case has its own sentence. */
export function betsText(heldShare: number): string {
  const text = copy().test.rule;
  if (heldShare === 0) return text.neverBets;
  return text.betsShare(heldShare < 0.01 ? 'under 1%' : `${Math.round(heldShare * 100)}%`);
}

/** Verdict title and its one- or two-sentence explanation. A rule that never bets on new stocks gets its own. */
export function explainVerdict(result: VerdictResult, total: number, neverBets: boolean): { title: string; text: string } {
  const text = copy().test;
  if (neverBets && result.verdict === 'justLuck') return { title: text.verdict.neverBets, text: text.explain.neverBets };
  switch (result.verdict) {
    case 'sawThrough': return { title: text.verdict.sawThrough, text: text.explain.sawThrough(result.beaten, total) };
    case 'fooledYourself': return { title: text.verdict.fooledYourself, text: text.explain.fooledYourself(result.practiceBeaten, result.beaten, total) };
    case 'justLuck': return { title: text.verdict.justLuck, text: text.explain.justLuck(result.beaten, total) };
  }
}

/** Mood and Yesterday in the same words the sliders use. */
export function crowdWords(tilt: number, rho: number): { mood: string; yesterday: string } {
  const { mood, herd } = copy().controls;
  const m = tiltToSlider(tilt);
  const y = rhoToSlider(rho);
  return { mood: mood.value(m < 0 ? -1 : 1, levelOf(m)), yesterday: herd.value(y < 0 ? -1 : 1, levelOf(y)) };
}

/** The reveal: the real settings and whether the verdict matched them. */
export function revealText(tilt: number, rho: number, outcome: RevealKey): { settings: string; outcome: string } {
  const text = copy().test.mystery;
  const words = crowdWords(tilt, rho);
  return { settings: text.settings(words.mood, words.yesterday), outcome: text.outcome[outcome](words.yesterday) };
}
