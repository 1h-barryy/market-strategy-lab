import { Emitter } from '../core/events';
import { generateBatch, validateParams, type Batch, type WorldParams } from '../model/process';

/** Paths per batch. The board reveals them in order; ball k is path k. */
export const BATCH_SIZE = 2000;

export const DEFAULT_PARAMS: Readonly<WorldParams> = { tilt: 0, sigmaStep: 0.02, rho: 0, n: 12, seed: 1 };

export interface AppState {
  readonly params: Readonly<WorldParams>;
  /** Generated once per parameter change; consumed by every chapter. */
  readonly batch: Batch;
  readonly chapter: string | null;
}

export function createState(params: WorldParams = DEFAULT_PARAMS): AppState {
  return { params: { ...params }, batch: generateBatch(params, BATCH_SIZE), chapter: null };
}

function sameParams(a: WorldParams, b: WorldParams): boolean {
  return a.tilt === b.tilt && a.sigmaStep === b.sigmaStep && a.rho === b.rho && a.n === b.n && a.seed === b.seed;
}

/** New state with updated parameters and a fresh batch. Throws (leaving `state` untouched) on invalid params. */
export function withParams(state: AppState, changes: Partial<WorldParams>): AppState {
  const params = { ...state.params, ...changes };
  if (sameParams(params, state.params)) return state;
  validateParams(params);
  return { ...state, params, batch: generateBatch(params, BATCH_SIZE) };
}

interface StoreEvents {
  /** Parameters changed and a new batch was generated. */
  batch: AppState;
}

/** Holds the current AppState and announces changes. */
export class Store extends Emitter<StoreEvents> {
  private current: AppState;

  constructor(initial: AppState = createState()) {
    super();
    this.current = initial;
  }

  get state(): AppState {
    return this.current;
  }

  setParams(changes: Partial<WorldParams>): void {
    const next = withParams(this.current, changes);
    if (next === this.current) return;
    this.current = next;
    this.emit('batch', next);
  }

  setChapter(chapter: string): void {
    this.current = { ...this.current, chapter };
  }
}
