import { copy, type VerdictKey } from '../../content/copy';
import type { Direction } from '../../model/strategy';

export interface PanelHandlers {
  direction(direction: Direction): void;
  /** The one step button: test on new stocks, then check against luck. */
  step(): void;
  startMystery(): void;
  reveal(): void;
  endMystery(): void;
}

export type StepState = 'none' | 'test' | 'luck' | 'checking' | 'done';

export interface PanelView {
  direction: Direction;
  rule: { summary: string; sentence: string; bets: string } | null;
  practice: string | null;
  fresh: string | null;
  step: StepState;
  verdict: { title: string; text: string; kind: VerdictKey | 'neverBets' } | null;
  mystery: 'off' | 'active' | 'revealed';
  canReveal: boolean;
  reveal: { settings: string; outcome: string } | null;
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  element.addEventListener('click', onClick);
  return element;
}

function paragraph(className: string): HTMLParagraphElement {
  const element = document.createElement('p');
  element.className = className;
  return element;
}

/**
 * Chapter 3 controls (DESIGN.md §6.2–6.3): direction toggle, the chosen rule in words, practice
 * and new-stocks scores, the step button, the verdict, and the mystery machine. Elements are built
 * once and updated in place so keyboard focus survives each step.
 */
export class TestPanel {
  readonly element = document.createElement('div');
  private readonly toggles: Record<Direction, HTMLButtonElement>;
  private readonly ruleBox = document.createElement('div');
  private readonly ruleSummary = paragraph('rule-summary');
  private readonly ruleSentence = paragraph('rule-sentence');
  private readonly ruleBets = paragraph('rule-bets');
  private readonly pickHint = paragraph('control-subtitle');
  private readonly practice = document.createElement('dd');
  private readonly fresh = document.createElement('dd');
  private readonly stepButton: HTMLButtonElement;
  private readonly verdict = document.createElement('div');
  private readonly mysteryText = paragraph('mystery-text');
  private readonly revealBox = document.createElement('div');
  private readonly revealSettings = paragraph('reveal-settings');
  private readonly revealOutcome = paragraph('reveal-outcome');
  private readonly mysteryButtons: Record<'start' | 'reveal' | 'again' | 'back', HTMLButtonElement>;
  private readonly mysteryHint = paragraph('control-subtitle');

  constructor(handlers: PanelHandlers) {
    const text = copy().test;
    this.element.className = 'test-controls';

    const main = document.createElement('div');
    main.className = 'board-controls test-panel';
    const direction = document.createElement('div');
    direction.className = 'control';
    const directionLabel = document.createElement('span');
    directionLabel.className = 'control-label';
    directionLabel.textContent = text.direction.label;
    const group = document.createElement('div');
    group.className = 'toggle';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', text.direction.label);
    const toggle = (value: Direction, title: string, hint: string): HTMLButtonElement => {
      const element = button('toggle-option', '', () => handlers.direction(value));
      const strong = document.createElement('strong');
      strong.textContent = title;
      const small = document.createElement('small');
      small.textContent = hint;
      element.append(strong, small);
      return element;
    };
    this.toggles = {
      follow: toggle('follow', text.direction.follow, text.direction.followHint),
      against: toggle('against', text.direction.against, text.direction.againstHint),
    };
    group.append(this.toggles.follow, this.toggles.against);
    direction.append(directionLabel, group);

    this.ruleBox.className = 'rule';
    const heading = document.createElement('h2');
    heading.textContent = text.rule.heading;
    this.pickHint.textContent = text.captions.pick;
    this.ruleBox.append(heading, this.pickHint, this.ruleSummary, this.ruleSentence, this.ruleBets);

    const scores = document.createElement('dl');
    scores.className = 'scores';
    for (const [label, value] of [[text.scores.practice, this.practice], [text.scores.fresh, this.fresh]] as const) {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = label;
      row.append(dt, value);
      scores.append(row);
    }
    const help = paragraph('control-subtitle');
    help.textContent = text.scores.help;

    this.stepButton = button('primary', '', () => handlers.step());
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(this.stepButton);
    this.verdict.className = 'verdict';
    this.verdict.setAttribute('role', 'status');
    this.verdict.setAttribute('aria-live', 'polite');
    main.append(direction, this.ruleBox, scores, help, actions, this.verdict);

    const mystery = document.createElement('div');
    mystery.className = 'board-controls mystery-panel';
    this.revealBox.className = 'reveal';
    const revealTitle = document.createElement('h2');
    revealTitle.textContent = text.mystery.revealedTitle;
    this.revealBox.append(revealTitle, this.revealSettings, this.revealOutcome);
    this.mysteryButtons = {
      start: button('primary', text.mystery.start, () => handlers.startMystery()),
      reveal: button('primary', text.mystery.reveal, () => handlers.reveal()),
      again: button('primary', text.mystery.newMystery, () => handlers.startMystery()),
      back: button('link', text.mystery.backToMine, () => handlers.endMystery()),
    };
    const mysteryActions = document.createElement('div');
    mysteryActions.className = 'actions';
    mysteryActions.append(...Object.values(this.mysteryButtons));
    mystery.append(this.mysteryText, this.revealBox, mysteryActions, this.mysteryHint);
    this.element.append(main, mystery);
  }

  render(view: PanelView): void {
    const text = copy().test;
    for (const [value, element] of Object.entries(this.toggles) as [Direction, HTMLButtonElement][]) {
      element.setAttribute('aria-pressed', String(view.direction === value));
    }
    this.pickHint.hidden = view.rule !== null;
    for (const element of [this.ruleSummary, this.ruleSentence, this.ruleBets]) element.hidden = view.rule === null;
    if (view.rule) {
      this.ruleSummary.textContent = view.rule.summary;
      this.ruleSentence.textContent = view.rule.sentence;
      this.ruleBets.textContent = view.rule.bets;
    }
    this.practice.textContent = view.practice ?? text.scores.pending;
    this.fresh.textContent = view.fresh ?? text.scores.pending;

    const step = view.step;
    this.stepButton.hidden = step === 'none' || step === 'done';
    this.stepButton.disabled = step === 'checking';
    this.stepButton.textContent = step === 'luck' ? text.actions.luck : step === 'checking' ? text.actions.checking : text.actions.test;

    this.verdict.hidden = view.verdict === null;
    if (view.verdict) {
      const title = document.createElement('h2');
      title.textContent = view.verdict.title;
      const body = document.createElement('p');
      body.textContent = view.verdict.text;
      this.verdict.replaceChildren(title, body);
      this.verdict.dataset.kind = view.verdict.kind;
    }

    const { mystery } = view;
    this.mysteryText.textContent = mystery === 'off' ? text.mystery.startHint : text.mystery.active;
    this.mysteryText.hidden = mystery === 'revealed';
    this.revealBox.hidden = mystery !== 'revealed' || view.reveal === null;
    if (view.reveal) {
      this.revealSettings.textContent = view.reveal.settings;
      this.revealOutcome.textContent = view.reveal.outcome;
    }
    this.mysteryButtons.start.hidden = mystery !== 'off';
    this.mysteryButtons.reveal.hidden = mystery !== 'active';
    this.mysteryButtons.reveal.disabled = !view.canReveal;
    this.mysteryButtons.again.hidden = mystery !== 'revealed';
    this.mysteryButtons.back.hidden = mystery === 'off';
    this.mysteryHint.hidden = mystery !== 'active' || view.canReveal;
    this.mysteryHint.textContent = text.mystery.revealHint;
  }

  dispose(): void {
    this.element.remove();
  }
}
