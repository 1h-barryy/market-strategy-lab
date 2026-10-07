/** One readout line. Cells are plain text; the first row passed is treated as the header. */
export type ReadoutRow = readonly string[];

/** Minimal overlay on top of the full-screen canvas: title, hint, a numeric readout and a status line. */
export class HUD {
  readonly viewport: HTMLElement;
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly readout: HTMLTableElement;
  private readonly detail: HTMLElement;
  private readonly status: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="viewport"></div>
      <div class="hud">
        <header class="hud-title"><p class="eyebrow">MARKET UNDER STRESS · P0</p><h1></h1><p class="hint"></p></header>
        <section class="hud-readout" aria-label="Measured statistics">
          <table></table>
          <pre class="detail"></pre>
          <p class="status" role="status" aria-live="polite"></p>
        </section>
      </div>`;
    this.viewport = root.querySelector<HTMLElement>('.viewport')!;
    this.title = root.querySelector<HTMLElement>('h1')!;
    this.hint = root.querySelector<HTMLElement>('.hint')!;
    this.readout = root.querySelector('table')!;
    this.detail = root.querySelector<HTMLElement>('.detail')!;
    this.status = root.querySelector<HTMLElement>('.status')!;
  }

  setTitle(title: string): void {
    this.title.textContent = title;
  }

  setHint(hint: string): void {
    this.hint.textContent = hint;
  }

  setReadout(rows: readonly ReadoutRow[]): void {
    this.readout.replaceChildren(...rows.map((cells, r) => {
      const tr = document.createElement('tr');
      for (const text of cells) {
        const cell = document.createElement(r === 0 ? 'th' : 'td');
        cell.textContent = text;
        tr.append(cell);
      }
      return tr;
    }));
  }

  /** Free-form monospace block below the table (e.g. the inspected ball). */
  setDetail(text: string): void {
    this.detail.textContent = text;
    this.detail.hidden = text === '';
  }

  setStatus(text: string, isError = false): void {
    this.status.textContent = text;
    this.status.classList.toggle('error', isError);
  }

  showWorldError(): void {
    this.viewport.innerHTML = '<p class="world-error" role="status">3D VIEW UNAVAILABLE<br><span>WebGL could not start. Reload to retry.</span></p>';
  }
}
