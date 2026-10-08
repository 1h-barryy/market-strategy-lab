/** Chapter 3 intro (DESIGN.md §6.4): pick a tile → prove it → free play. Nothing is locked. */
export type TestStep = 1 | 2 | 'free';

export interface TestIntro {
  step: TestStep;
  /** The player picked a tile during step 1. */
  chose: boolean;
  /** The player got a verdict during step 2. */
  judged: boolean;
}

export const startTestIntro = (): TestIntro => ({ step: 1, chose: false, judged: false });
export const testFreePlay = (): TestIntro => ({ step: 'free', chose: false, judged: false });

export function canAdvanceTest(state: TestIntro): boolean {
  return state.step === 1 ? state.chose : state.step === 2 ? state.judged : false;
}

export function advanceTest(state: TestIntro): TestIntro {
  return { ...state, step: state.step === 1 ? 2 : 'free' };
}

/** Records what the player did; only counts for the step that asks for it. */
export function noteTest(state: TestIntro, event: 'chose' | 'judged'): TestIntro {
  if (event === 'chose' && state.step === 1 && !state.chose) return { ...state, chose: true };
  if (event === 'judged' && state.step === 2 && !state.judged) return { ...state, judged: true };
  return state;
}
