import { describe, expect, it, vi } from 'vitest';
import { BATCH_SIZE, DEFAULT_PARAMS, Store, createState, withParams } from './state';

describe('app state', () => {
  it('starts with the default world and a full batch', () => {
    const state = createState();
    expect(state.params).toEqual(DEFAULT_PARAMS);
    expect(state.batch.paths).toHaveLength(BATCH_SIZE);
    expect(state.batch.params).toEqual(DEFAULT_PARAMS);
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
    store.setParams({ n: 20 });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].batch.paths[0].steps).toHaveLength(20);
  });
});
