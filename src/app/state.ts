import { Emitter } from '../core/events';
import { generateBatch, validateParams, type Batch, type WorldParams } from '../model/process';

/** Paths per batch. The board reveals them in order; ball k is path k. */
export const BATCH_SIZE = 2000;

/** Every stock's path is one trading year (DESIGN.md §3.2). */
export const PATH_DAYS = 250;

/** Days the board shows by default (the first n_board days of each path). */
export const DEFAULT_BOARD_DAYS = 12;
export const BOARD_DAYS = { min: 8, max: 24 } as const;

export const DEFAULT_PARAMS: Readonly<WorldParams> = { tilt: 0, sigmaStep: 0.02, rho: 0, n: PATH_DAYS, seed: 1 };

/** The crowd settings a mystery machine hides (DESIGN.md §6.3). */
export type CrowdSettings = Pick<WorldParams, 'tilt' | 'rho' | 'seed'>;

/** An active mystery machine. The secret settings are the current params; the player's own are kept here. */
export interface Mystery {
  /** The player's own machine, restored when the mystery ends. */
  readonly own: Readonly<CrowdSettings>;
  readonly revealed: boolean;
}

export interface AppState {
  readonly params: Readonly<WorldParams>;
  /** Generated once per parameter change; consumed by every chapter. */
  readonly batch: Batch;
  /** How many of the 250 days the board shows. Changing it never regenerates the batch. */
  readonly boardDays: number;
  readonly chapter: string | null;
  /** Non-null while a mystery machine is active: crowd controls are hidden in every chapter. */
  readonly mystery: Mystery | null;
}

export function createState(params: WorldParams = DEFAULT_PARAMS, boardDays = DEFAULT_BOARD_DAYS): AppState {
  return { params: { ...params }, batch: generateBatch(params, BATCH_SIZE), boardDays, chapter: null, mystery: null };
}

function sameParams(a: WorldParams, b: WorldParams): boolean {
  return a.tilt === b.tilt && a.sigmaStep === b.sigmaStep && a.rho === b.rho && a.n === b.n && a.seed === b.seed;
}

/** New state with a different board length; the batch is untouched. */
export function withBoardDays(state: AppState, days: number): AppState {
  if (!Number.isInteger(days) || days < BOARD_DAYS.min || days > BOARD_DAYS.max || days > state.params.n) {
    throw new RangeError(`Board days ${days} must be an integer in [${BOARD_DAYS.min}, ${Math.min(BOARD_DAYS.max, state.params.n)}].`);
  }
  return days === state.boardDays ? state : { ...state, boardDays: days };
}

/** New state with updated parameters and a fresh batch. Throws (leaving `state` untouched) on invalid params. */
export function withParams(state: AppState, changes: Partial<WorldParams>): AppState {
  const params = { ...state.params, ...changes };
  if (sameParams(params, state.params)) return state;
  validateParams(params);
  return { ...state, params, batch: generateBatch(params, BATCH_SIZE) };
}

/** Starts (or replaces) a mystery machine with secret settings; the player's own settings are kept once. */
export function withMystery(state: AppState, secret: CrowdSettings): AppState {
  const { tilt, rho, seed } = state.params;
  const own = state.mystery?.own ?? { tilt, rho, seed };
  return { ...withParams(state, secret), mystery: { own, revealed: false } };
}

export function withMysteryRevealed(state: AppState): AppState {
  return state.mystery && !state.mystery.revealed ? { ...state, mystery: { ...state.mystery, revealed: true } } : state;
}

/** Ends the mystery and restores the player's own machine. */
export function withoutMystery(state: AppState): AppState {
  if (!state.mystery) return state;
  return { ...withParams(state, state.mystery.own), mystery: null };
}

interface StoreEvents {
  /** Parameters changed and a new batch was generated. */
  batch: AppState;
  /** The board's number of days changed (same batch). */
  boardDays: AppState;
  /** A mystery machine started, was revealed or ended. */
  mystery: AppState;
}

/** Holds the current AppState and announces changes. */
export class Store extends Emitter<StoreEvents> {
  private current: AppState;
  /** Milliseconds the last batch regeneration took (debug overlay). */
  lastRegenMs = 0;

  constructor(initial: AppState = createState()) {
    super();
    this.current = initial;
  }

  get state(): AppState {
    return this.current;
  }

  setParams(changes: Partial<WorldParams>): void {
    const started = performance.now();
    const next = withParams(this.current, changes);
    if (next !== this.current) this.lastRegenMs = performance.now() - started;
    if (next === this.current) return;
    this.current = next;
    this.emit('batch', next);
  }

  setBoardDays(days: number): void {
    const next = withBoardDays(this.current, days);
    if (next === this.current) return;
    this.current = next;
    this.emit('boardDays', next);
  }

  startMystery(secret: CrowdSettings): void {
    this.replace(withMystery(this.current, secret));
  }

  revealMystery(): void {
    this.replace(withMysteryRevealed(this.current));
  }

  endMystery(): void {
    this.replace(withoutMystery(this.current));
  }

  /** Announces a new batch (if the params changed) before the mystery change. */
  private replace(next: AppState): void {
    if (next === this.current) return;
    const batchChanged = next.batch !== this.current.batch;
    this.current = next;
    if (batchChanged) this.emit('batch', next);
    this.emit('mystery', next);
  }

  setChapter(chapter: string): void {
    this.current = { ...this.current, chapter };
  }
}
