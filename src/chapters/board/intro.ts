import { CAPTION_RULES } from './captions';

/** Guided intro (DESIGN.md §4): premise → Mood → Yesterday → free play. */
export type IntroStep = 1 | 2 | 3 | 'free';

export interface IntroState {
  step: IntroStep;
  /** The player has moved Mood during step 2. */
  moodMoved: boolean;
  /** The player has moved Yesterday during step 3. */
  herdMoved: boolean;
}

export function startIntro(): IntroState {
  return { step: 1, moodMoved: false, herdMoved: false };
}

export function freePlay(): IntroState {
  return { step: 'free', moodMoved: false, herdMoved: false };
}

/** Which controls are locked at neutral in a step. */
export function locks(step: IntroStep): { mood: boolean; herd: boolean } {
  return { mood: step === 1, herd: step === 1 || step === 2 };
}

/** Whether the Next button is offered: enough stocks for a caption, or the new control tried. */
export function canAdvance(state: IntroState, landed: number): boolean {
  switch (state.step) {
    case 1: return landed >= CAPTION_RULES.minLanded;
    case 2: return state.moodMoved;
    case 3: return state.herdMoved;
    default: return false;
  }
}

export function advance(state: IntroState): IntroState {
  const next: IntroStep = state.step === 1 ? 2 : state.step === 2 ? 3 : 'free';
  return { ...state, step: next };
}

/** Records that the player moved a control; only counts for the step that introduces it. */
export function noteMoved(state: IntroState, control: 'mood' | 'herd'): IntroState {
  if (control === 'mood' && state.step === 2) return { ...state, moodMoved: true };
  if (control === 'herd' && state.step === 3) return { ...state, herdMoved: true };
  return state;
}
