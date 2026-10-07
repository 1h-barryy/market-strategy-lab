/** Chapter 2 intro (DESIGN.md §5): the year → the ghost → free play. Nothing is locked. */
export type TerrainStep = 1 | 2 | 'free';

export interface TerrainIntro {
  step: TerrainStep;
  dayMoved: boolean;
  herdMoved: boolean;
}

export const startTerrainIntro = (): TerrainIntro => ({ step: 1, dayMoved: false, herdMoved: false });
export const terrainFreePlay = (): TerrainIntro => ({ step: 'free', dayMoved: false, herdMoved: false });

export function canAdvanceTerrain(state: TerrainIntro): boolean {
  return state.step === 1 ? state.dayMoved : state.step === 2 ? state.herdMoved : false;
}

export function advanceTerrain(state: TerrainIntro): TerrainIntro {
  return { ...state, step: state.step === 1 ? 2 : 'free' };
}

/** Records that the player moved a control; only counts for the step that asks for it. */
export function noteTerrainMoved(state: TerrainIntro, control: 'day' | 'herd'): TerrainIntro {
  if (control === 'day' && state.step === 1 && !state.dayMoved) return { ...state, dayMoved: true };
  if (control === 'herd' && state.step === 2 && !state.herdMoved) return { ...state, herdMoved: true };
  return state;
}
