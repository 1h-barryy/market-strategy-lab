import { describe, expect, it, vi } from 'vitest';
import { BATCH_SIZE, DEFAULT_BOARD_DAYS, DEFAULT_PARAMS, PATH_DAYS, Store, createState, withBoardDays, withMystery, withMysteryRevealed, withParams, withoutMystery } from './state';

describe('app state', () => {
  it('starts with the default world and a full batch', () => {
    const state = createState();
    expect(state.params).toEqual(DEFAULT_PARAMS);
    expect(state.batch.paths).toHaveLength(BATCH_SIZE);
    expect(state.batch.params).toEqual(DEFAULT_PARAMS);
    expect(state.batch.paths[0].steps).toHaveLength(PATH_DAYS);
    expect(state.boardDays).toBe(DEFAULT_BOARD_DAYS);
  });

  it('regenerates the batch when parameters change, without mutating the old state', () => {
    const before = createState();
    const after = withParams(before, { rho: 0.5 });
    expect(after.params.rho).toBe(0.5);
    expect(after.batch.params.rho).toBe(0.5);
    expect(before.params.rho).toBe(DEFAULT_PARAMS.rho);
    expect(after.batch).not.toBe(before.batch);
  });

  it('returns the same state when nothing changes', () => {
    const state = createState();
    expect(withParams(state, { rho: DEFAULT_PARAMS.rho })).toBe(state);
  });

  it('rejects invalid parameters and keeps the store unchanged', () => {
    const store = new Store();
    const listener = vi.fn();
    store.on('batch', listener);
    const before = store.state;
    expect(() => store.setParams({ rho: 0.95 })).toThrow(RangeError);
    expect(store.state).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies listeners with the new batch', () => {
    const store = new Store();
    const listener = vi.fn();
    store.on('batch', listener);
    store.setParams({ rho: 0.3 });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].batch.params.rho).toBe(0.3);
  });

  it('changes board days without regenerating the batch', () => {
    const store = new Store();
    const batchListener = vi.fn();
    const daysListener = vi.fn();
    store.on('batch', batchListener);
    store.on('boardDays', daysListener);
    const batch = store.state.batch;
    store.setBoardDays(20);
    expect(store.state.boardDays).toBe(20);
    expect(store.state.batch).toBe(batch);
    expect(batchListener).not.toHaveBeenCalled();
    expect(daysListener).toHaveBeenCalledOnce();
    expect(() => withBoardDays(store.state, 7)).toThrow(RangeError);
    expect(() => withBoardDays(store.state, 25)).toThrow(RangeError);
  });
});

describe('mystery machine', () => {
  const secret = { tilt: 0.02, rho: -0.35, seed: 77 };

  it("switches to the secret settings, keeps the player's own, and restores them at the end", () => {
    const own = withParams(createState(), { tilt: -0.05, rho: 0.4 });
    const mystery = withMystery(own, secret);
    expect(mystery.params).toMatchObject(secret);
    expect(mystery.batch.params).toMatchObject(secret);
    expect(mystery.mystery).toEqual({ own: { tilt: -0.05, rho: 0.4, seed: DEFAULT_PARAMS.seed }, revealed: false });
    const back = withoutMystery(mystery);
    expect(back.params).toEqual(own.params);
    expect(back.mystery).toBeNull();
  });

  it('keeps the original own settings across a new mystery', () => {
    const own = withParams(createState(), { rho: 0.4 });
    const second = withMystery(withMysteryRevealed(withMystery(own, secret)), { tilt: 0, rho: 0, seed: 78 });
    expect(second.mystery).toEqual({ own: { tilt: 0, rho: 0.4, seed: DEFAULT_PARAMS.seed }, revealed: false });
  });

  it('announces the new batch before the mystery change', () => {
    const store = new Store();
    const events: string[] = [];
    store.on('batch', () => events.push('batch'));
    store.on('mystery', (state) => events.push(state.mystery ? (state.mystery.revealed ? 'revealed' : 'started') : 'ended'));
    store.startMystery(secret);
    store.revealMystery();
    store.revealMystery();
    store.endMystery();
    expect(events).toEqual(['batch', 'started', 'revealed', 'batch', 'ended']);
  });
});
