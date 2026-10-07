import { BOARD_DAYS } from '../app/state';
import { copy, type Level, type SliderText } from '../content/copy';
import { PARAM_RANGES, type WorldParams } from '../model/process';

/** Sliders run −100..100 with the neutral setting at 0, whatever the parameter's range. */
const SLIDER_MAX = 100;

/** Slider position → tilt, linear over [−0.1, 0.1]. */
export function sliderToTilt(position: number): number {
  return round3((position / SLIDER_MAX) * PARAM_RANGES.tilt.max);
}

export function tiltToSlider(tilt: number): number {
  return Math.round((tilt / PARAM_RANGES.tilt.max) * SLIDER_MAX);
}

/**
 * Slider position → ρ. The range [−0.6, 0.9] is asymmetric, so each half is scaled separately to
 * keep "Ignores it" (ρ = 0) at the center of the track.
 */
export function sliderToRho(position: number): number {
  const fraction = position / SLIDER_MAX;
  return round3(fraction < 0 ? -fraction * PARAM_RANGES.rho.min : fraction * PARAM_RANGES.rho.max);
}

export function rhoToSlider(rho: number): number {
  return Math.round((rho < 0 ? rho / -PARAM_RANGES.rho.min : rho / PARAM_RANGES.rho.max) * SLIDER_MAX);
}

/** How far from neutral a slider is, in words-sized steps: 0 neutral, 1 a little, 2 clearly, 3 strongly. */
export function levelOf(position: number): Level {
  const fraction = Math.abs(position) / SLIDER_MAX;
  return fraction < 0.1 ? 0 : fraction < 0.4 ? 1 : fraction < 0.75 ? 2 : 3;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000 || 0;
}

export interface ControlHandlers {
  /** World changes; `n` means the board's days. */
  setParams(changes: Partial<WorldParams>): void;
  /** Present → a "Start over" button is shown. */
  reset?: () => void;
}

export interface ControlOptions {
  /** Show the Days stepper (Chapter 1 only). */
  days: boolean;
}

interface Slider {
  input: HTMLInputElement;
  value: HTMLElement;
  lock: HTMLElement;
  text: SliderText;
}

/** Player controls for the crowd: Mood, Yesterday (internally herd/ρ) and optionally Days. No numbers except days. */
export class CrowdControls {
  readonly element = document.createElement('div');
  private readonly mood: Slider;
  private readonly herd: Slider;
  private readonly daysValue: HTMLElement;
  private n = 0;
  /** Slider changes waiting for the next frame: a drag regenerates the batch at most once per frame. */
  private pending: Partial<WorldParams> = {};
  private frame = 0;

  constructor(private readonly handlers: ControlHandlers, options: ControlOptions) {
    const text = copy().controls;
    this.element.className = 'board-controls crowd-controls';
    this.mood = this.slider('mood', text.mood, (position) => this.schedule({ tilt: sliderToTilt(position) }));
    this.herd = this.slider('herd', text.herd, (position) => this.schedule({ rho: sliderToRho(position) }));

    const days = document.createElement('div');
    days.className = 'control days';
    days.innerHTML = '<span class="control-label"></span><div class="stepper"><button type="button" class="fewer">−</button><output></output><button type="button" class="more">+</button></div>';
    days.querySelector('.control-label')!.textContent = text.days.label;
    this.daysValue = days.querySelector('output')!;
    const fewer = days.querySelector<HTMLButtonElement>('.fewer')!;
    const more = days.querySelector<HTMLButtonElement>('.more')!;
    fewer.setAttribute('aria-label', text.days.fewer);
    more.setAttribute('aria-label', text.days.more);
    fewer.addEventListener('click', () => this.stepDays(-1));
    more.addEventListener('click', () => this.stepDays(1));

    this.element.append(this.mood.input.closest('.control')!, this.herd.input.closest('.control')!);
    if (options.days) this.element.append(days);
    if (handlers.reset) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'reset link';
      reset.textContent = text.reset;
      reset.addEventListener('click', () => handlers.reset?.());
      this.element.append(reset);
    }
  }

  /** Reflect the current world (after keyboard, debug panel or intro changes). */
  sync(params: WorldParams): void {
    // A drag in progress wins over an older value coming back from the store.
    if (this.frame) return;
    this.setSlider(this.mood, tiltToSlider(params.tilt));
    this.setSlider(this.herd, rhoToSlider(params.rho));
    this.n = params.n;
    this.daysValue.textContent = copy().controls.days.value(params.n);
  }

  setLocked(locks: { mood: boolean; herd: boolean }): void {
    for (const [slider, locked] of [[this.mood, locks.mood], [this.herd, locks.herd]] as const) {
      slider.input.disabled = locked;
      slider.lock.hidden = !locked;
      slider.input.closest('.control')!.classList.toggle('locked', locked);
    }
  }

  private schedule(changes: Partial<WorldParams>): void {
    Object.assign(this.pending, changes);
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const pending = this.pending;
      this.pending = {};
      this.handlers.setParams(pending);
    });
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.element.remove();
  }

  private stepDays(delta: number): void {
    const n = Math.min(BOARD_DAYS.max, Math.max(BOARD_DAYS.min, this.n + delta));
    if (n !== this.n) this.handlers.setParams({ n });
  }

  private slider(id: string, text: SliderText, onInput: (position: number) => void): Slider {
    const control = document.createElement('div');
    control.className = `control ${id}`;
    control.innerHTML = `
      <label class="control-label" for="control-${id}"></label>
      <p class="control-subtitle"></p>
      <input id="control-${id}" type="range" min="${-SLIDER_MAX}" max="${SLIDER_MAX}" step="1" />
      <div class="ends"><span class="left"></span><span class="center"></span><span class="right"></span></div>
      <p class="control-value"></p>
      <p class="control-lock"></p>`;
    control.querySelector('.control-label')!.textContent = text.label;
    control.querySelector('.control-subtitle')!.textContent = text.subtitle;
    control.querySelector('.left')!.textContent = text.left;
    control.querySelector('.center')!.textContent = text.center;
    control.querySelector('.right')!.textContent = text.right;
    const lock = control.querySelector<HTMLElement>('.control-lock')!;
    lock.textContent = copy().controls.locked;
    lock.hidden = true;
    const input = control.querySelector('input')!;
    const slider = { input, value: control.querySelector<HTMLElement>('.control-value')!, lock, text };
    input.addEventListener('input', () => {
      this.describe(slider);
      onInput(input.valueAsNumber);
    });
    return slider;
  }

  private setSlider(slider: Slider, position: number): void {
    slider.input.value = String(position);
    this.describe(slider);
  }

  private describe(slider: Slider): void {
    const position = slider.input.valueAsNumber;
    const words = slider.text.value(position < 0 ? -1 : 1, levelOf(position));
    slider.value.textContent = words;
    slider.input.setAttribute('aria-valuetext', words);
  }
}
