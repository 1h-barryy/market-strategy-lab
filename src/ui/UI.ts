import type { AppState, StrategySettings } from '../app/state';

export class UI {
  readonly viewport: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly fast: HTMLInputElement;
  private readonly slow: HTMLInputElement;
  private readonly exposure: HTMLSelectElement;
  private readonly status: HTMLElement;

  constructor(root: HTMLElement, initial: AppState, onRun: (settings: StrategySettings) => void) {
    root.innerHTML = `
      <main class="lab">
        <header class="header">
          <div><p class="eyebrow">MARKET UNDER STRESS</p><h1>Strategy Lab<span class="phase">PHASE 01</span></h1></div>
          <div class="ready"><span class="status-dot"></span>SYSTEM READY</div>
        </header>
        <div class="workspace">
          <section class="chamber" aria-label="Three-dimensional test chamber">
            <div class="chamber-heading"><span class="eyebrow">01 / TEST CHAMBER</span><span class="tag">PROTOTYPE</span></div>
            <div class="viewport"></div>
            <div class="chamber-caption"><span>MARKET CORE / STANDBY</span><span>PROCEDURAL SCENE · NO MARKET DATA</span></div>
          </section>
          <aside class="strategy" aria-labelledby="strategy-title">
            <p class="eyebrow">02 / CONFIGURATION</p><h2 id="strategy-title">Strategy</h2>
            <p class="muted intro">Set the parameters for your trading rule.</p>
            <form>
              <label for="fast-ma">Fast MA <span>SHORT WINDOW</span></label>
              <div class="input-wrap"><input id="fast-ma" name="fastMA" type="number" min="5" max="30" step="1" required /><span>periods</span></div>
              <label for="slow-ma">Slow MA <span>LONG WINDOW</span></label>
              <div class="input-wrap"><input id="slow-ma" name="slowMA" type="number" min="20" max="120" step="1" required /><span>periods</span></div>
              <label for="exposure">Exposure <span>ENTRY ALLOCATION</span></label>
              <select id="exposure" name="exposure"><option value="0">0%</option><option value="25">25%</option><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option></select>
              <button type="submit">RUN TEST <span aria-hidden="true">↗</span></button>
              <p class="muted engine-note">Interface prototype. The backtest engine is not connected.</p>
            </form>
          </aside>
        </div>
        <section class="results" aria-labelledby="results-title">
          <div class="results-heading"><h2 id="results-title" class="eyebrow">03 / RESULTS</h2><span class="muted">Awaiting engine integration</span></div>
          <div class="metrics">
            <div class="metric"><span>RETURN</span><strong>--</strong></div>
            <div class="metric"><span>MAX DRAWDOWN</span><strong>--</strong></div>
            <div class="metric"><span>SURVIVAL RATE</span><strong>--</strong></div>
            <div class="metric"><span>BUY &amp; HOLD</span><strong>--</strong></div>
            <div class="metric run-status"><span>RUN STATUS</span><p role="status" aria-live="polite" id="run-status"></p></div>
          </div>
        </section>
        <footer>MARKET UNDER STRESS <span>STRATEGY LAB / APPLICATION SKELETON</span></footer>
      </main>`;
    this.viewport = root.querySelector<HTMLElement>('.viewport')!;
    this.form = root.querySelector('form')!;
    this.fast = root.querySelector('#fast-ma')!;
    this.slow = root.querySelector('#slow-ma')!;
    this.exposure = root.querySelector('#exposure')!;
    this.status = root.querySelector('#run-status')!;
    this.fast.value = String(initial.settings.fastMA);
    this.slow.value = String(initial.settings.slowMA);
    this.exposure.value = String(initial.settings.exposure);
    this.form.addEventListener('input', this.validateWindows);
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.validateWindows();
      if (!this.form.reportValidity()) return;
      onRun({ fastMA: this.fast.valueAsNumber, slowMA: this.slow.valueAsNumber, exposure: Number(this.exposure.value) });
    });
    this.render(initial);
  }

  private validateWindows = (): void => {
    this.slow.setCustomValidity(this.fast.valueAsNumber >= this.slow.valueAsNumber
      ? 'Slow MA must be greater than Fast MA.' : '');
  };

  render(state: AppState): void {
    this.status.textContent = state.status;
  }

  showWorldError(): void {
    this.viewport.innerHTML = '<p class="world-error" role="status">3D VIEW UNAVAILABLE<br><span>WebGL could not start. Strategy controls remain available.</span></p>';
  }
}
