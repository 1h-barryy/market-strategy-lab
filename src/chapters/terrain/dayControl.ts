import { copy } from '../../content/copy';
import { FIRST_DAY } from './mapping';

/** The Day slider (Chapter 2): picks which day's slice is highlighted. */
export class DayControl {
  readonly element = document.createElement('div');
  private readonly input: HTMLInputElement;
  private readonly value: HTMLElement;

  constructor(private readonly days: number, onChange: (day: number) => void) {
    const text = copy().terrain.day;
    this.element.className = 'board-controls day-control';
    this.element.innerHTML = `
      <div class="control">
        <label class="control-label" for="control-day"></label>
        <p class="control-subtitle"></p>
        <input id="control-day" type="range" min="${FIRST_DAY}" max="${days}" step="1" />
        <div class="ends"><span class="left"></span><span class="center"></span><span class="right"></span></div>
        <p class="control-value"></p>
      </div>`;
    this.element.querySelector('.control-label')!.textContent = text.label;
    this.element.querySelector('.control-subtitle')!.textContent = text.subtitle;
    this.element.querySelector('.left')!.textContent = text.left;
    this.element.querySelector('.right')!.textContent = text.right;
    this.input = this.element.querySelector('input')!;
    this.value = this.element.querySelector('.control-value')!;
    this.input.addEventListener('input', () => {
      this.describe();
      onChange(this.input.valueAsNumber);
    });
  }

  set(day: number): void {
    this.input.value = String(day);
    this.describe();
  }

  private describe(): void {
    const words = copy().terrain.day.value(this.input.valueAsNumber, this.days);
    this.value.textContent = words;
    this.input.setAttribute('aria-valuetext', words);
  }
}
