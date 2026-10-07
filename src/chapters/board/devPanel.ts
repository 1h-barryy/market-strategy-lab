import GUI from 'lil-gui';
import type { WorldParams } from '../../model/process';

/** Board-only limits for P0 (the model accepts a wider range of n). */
export const BOARD_LIMITS = {
  rho: { min: -0.6, max: 0.9, step: 0.05 },
  tilt: { min: -0.1, max: 0.1, step: 0.005 },
  sigmaStep: { min: 0.005, max: 0.05, step: 0.001 },
  n: { min: 8, max: 24, step: 1 },
} as const;

export interface Playback {
  /** Balls per second while holding. */
  releaseRate: number;
  /** Playback speed multiplier. */
  speed: number;
}

export interface PanelActions {
  setParams(changes: Partial<WorldParams>): void;
  reset(): void;
  dropInstant(count: number): void;
}

/** P0 developer panel. Temporary: DESIGN.md §8 replaces it with in-world controls. */
export class DevPanel {
  private readonly gui = new GUI({ title: 'Board (dev panel)' });
  private readonly values: WorldParams;

  constructor(params: WorldParams, playback: Playback, actions: PanelActions) {
    this.values = { ...params };
    const world = this.gui.addFolder('World');
    const change = (key: keyof WorldParams) => (value: number) => actions.setParams({ [key]: value });
    world.add(this.values, 'rho', BOARD_LIMITS.rho.min, BOARD_LIMITS.rho.max, BOARD_LIMITS.rho.step).name('ρ inertia').onChange(change('rho'));
    world.add(this.values, 'tilt', BOARD_LIMITS.tilt.min, BOARD_LIMITS.tilt.max, BOARD_LIMITS.tilt.step).name('tilt (π − 0.5)').onChange(change('tilt'));
    world.add(this.values, 'sigmaStep', BOARD_LIMITS.sigmaStep.min, BOARD_LIMITS.sigmaStep.max, BOARD_LIMITS.sigmaStep.step).name('σ step').onChange(change('sigmaStep'));
    world.add(this.values, 'n', BOARD_LIMITS.n.min, BOARD_LIMITS.n.max, BOARD_LIMITS.n.step).name('n rows').onChange(change('n'));
    world.add(this.values, 'seed', 0, 999_999, 1).name('seed').onFinishChange(change('seed'));
    world.add({ newSeed: () => actions.setParams({ seed: Math.floor(Math.random() * 1_000_000) }) }, 'newSeed').name('new seed');

    const balls = this.gui.addFolder('Balls');
    balls.add(playback, 'releaseRate', 1, 60, 1).name('release / s');
    balls.add(playback, 'speed', 0.25, 4, 0.25).name('speed');
    balls.add({ drop: () => actions.dropInstant(200) }, 'drop').name('drop 200 instantly');
    balls.add({ reset: () => actions.reset() }, 'reset').name('reset board (R)');
  }

  /** Reflect parameters changed elsewhere (keyboard, rejected input). */
  sync(params: WorldParams): void {
    Object.assign(this.values, params);
    for (const controller of this.gui.controllersRecursive()) controller.updateDisplay();
  }

  dispose(): void {
    this.gui.destroy();
  }
}
