/** One readout line. Cells are plain text; the first row passed is treated as the header. */
export type ReadoutRow = readonly string[];

export interface HudAction {
  label: string;
  onClick: () => void;
  /** 'primary' is a filled button, 'link' a text button. */
  kind: 'primary' | 'link';
}

/**
 * Overlay on top of the full-screen canvas. Player column on the left: header, intro, caption,
 * chapter controls, inspected detail. A debug section (exact readouts) is hidden by default.
 * Holds no strings of its own; chapters pass text from content/copy.ts.
 */
export class HUD {
  readonly viewport: HTMLElement;
  /** Container a chapter fills with its own controls. */
  readonly controls: HTMLElement;
  private readonly root: HTMLElement;
  private readonly el: Record<'eyebrow' | 'title' | 'tagline' | 'hint' | 'legend' | 'intro' | 'introText' | 'introActions' | 'caption' | 'note' | 'detail' | 'debug' | 'status', HTMLElement>;
  private readonly readout: HTMLTableElement;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="viewport"></div>
      <div class="hud">
        <header class="hud-title">
          <p class="eyebrow"></p><h1></h1><p class="tagline"></p>
          <p class="hint"></p><p class="legend"></p>
        </header>
        <section class="panel intro" hidden><div class="intro-text"></div><div class="actions"></div></section>
        <section class="panel caption-box"><p class="caption" role="status" aria-live="polite"></p><p class="note"></p></section>
        <section class="controls-slot"></section>
        <section class="panel detail" hidden></section>
      </div>
      <section class="hud-debug" hidden aria-label="Debug readout">
        <table></table>
        <p class="status"></p>
      </section>`;
    const q = (selector: string): HTMLElement => root.querySelector<HTMLElement>(selector)!;
    this.viewport = q('.viewport');
    this.controls = q('.controls-slot');
    this.readout = root.querySelector('table')!;
    this.el = {
      eyebrow: q('.eyebrow'), title: q('h1'), tagline: q('.tagline'), hint: q('.hint'), legend: q('.legend'),
      intro: q('.intro'), introText: q('.intro-text'), introActions: q('.intro .actions'),
      caption: q('.caption'), note: q('.note'), detail: q('.detail'), debug: q('.hud-debug'), status: q('.status'),
    };
  }

  setHeader(header: { eyebrow: string; title: string; tagline: string; hint: string }): void {
    this.el.eyebrow.textContent = header.eyebrow;
    this.el.title.textContent = header.title;
    this.el.tagline.textContent = header.tagline;
    this.el.hint.textContent = header.hint;
  }

  /** Color legend: prefix, then a warm and a cool swatch with their words. */
  setLegend(prefix: string, up: string, down: string): void {
    const swatch = (className: string, text: string): HTMLElement[] => {
      const dot = document.createElement('span');
      dot.className = `swatch ${className}`;
      dot.setAttribute('aria-hidden', 'true');
      const word = document.createElement('span');
      word.textContent = text;
      return [dot, word];
    };
    this.el.legend.replaceChildren(document.createTextNode(`${prefix} `), ...swatch('up', up), document.createTextNode(' '), ...swatch('down', down));
  }

  /** Plain-text legend, one line each (replaces the color legend). */
  setLegendLines(lines: readonly string[]): void {
    this.el.legend.replaceChildren(...lines.map((line) => {
      const span = document.createElement('span');
      span.className = 'legend-line';
      span.textContent = line;
      return span;
    }));
  }

  /** Intro or free-play text with its buttons; `null` hides the box. */
  setIntro(lines: readonly string[] | null, actions: readonly HudAction[] = []): void {
    this.el.intro.hidden = lines === null;
    this.el.introText.replaceChildren(...(lines ?? []).map((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      return p;
    }));
    this.el.introActions.replaceChildren(...actions.map((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = action.kind;
      button.textContent = action.label;
      button.addEventListener('click', action.onClick);
      return button;
    }));
  }

  setCaption(text: string): void {
    if (this.el.caption.textContent !== text) this.el.caption.textContent = text;
  }

  /** Secondary player message (e.g. out of stocks); empty hides it. */
  setNote(text: string): void {
    this.el.note.textContent = text;
  }

  /** Inspected item: a title line and detail lines; `null` hides it. */
  setDetail(detail: { title: string; lines: readonly string[] } | null): void {
    this.el.detail.hidden = detail === null;
    if (!detail) return;
    const title = document.createElement('h2');
    title.textContent = detail.title;
    this.el.detail.replaceChildren(title, ...detail.lines.map((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      return p;
    }));
  }

  get debugVisible(): boolean {
    return !this.el.debug.hidden;
  }

  setDebugVisible(visible: boolean): void {
    this.el.debug.hidden = !visible;
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

  /** Debug status line (model terms, errors). */
  setStatus(text: string, isError = false): void {
    this.el.status.textContent = text;
    this.el.status.classList.toggle('error', isError);
  }

  showWorldError(title: string, detail: string): void {
    const message = document.createElement('p');
    message.className = 'world-error';
    message.setAttribute('role', 'status');
    const sub = document.createElement('span');
    sub.textContent = detail;
    message.append(title, document.createElement('br'), sub);
    this.viewport.replaceChildren(message);
    this.root.querySelector('.hud')?.classList.add('no-world');
  }
}
