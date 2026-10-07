import { describe, expect, it } from 'vitest';
import { createInitialState, requestTest } from './state';

describe('Phase 1 run request', () => {
  it('records edited settings and reports the missing engine without changing the previous state', () => {
    const original = createInitialState();
    const settings = { fastMA: 15, slowMA: 60, exposure: 75 };
    const next = requestTest(original, settings);
    expect(next).toEqual({ settings, status: 'BACKTEST ENGINE NOT CONNECTED' });
    expect(original).toEqual({
      settings: { fastMA: 10, slowMA: 50, exposure: 50 }, status: 'SYSTEM READY',
    });
    settings.exposure = 0;
    expect(next.settings.exposure).toBe(75);
  });

  it('keeps repeated requests in the disconnected state', () => {
    const initial = createInitialState();
    const first = requestTest(initial, initial.settings);
    expect(requestTest(first, first.settings)).toEqual(first);
  });
});
