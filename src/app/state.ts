export interface StrategySettings {
  fastMA: number;
  slowMA: number;
  exposure: number;
}

export interface AppState {
  settings: StrategySettings;
  status: 'SYSTEM READY' | 'BACKTEST ENGINE NOT CONNECTED';
}

export function createInitialState(): AppState {
  return {
    settings: { fastMA: 10, slowMA: 50, exposure: 50 },
    status: 'SYSTEM READY',
  };
}

// Phase 1 only records the requested settings; no model or results exist yet.
export function requestTest(state: AppState, settings: StrategySettings): AppState {
  return { ...state, settings: { ...settings }, status: 'BACKTEST ENGINE NOT CONNECTED' };
}
