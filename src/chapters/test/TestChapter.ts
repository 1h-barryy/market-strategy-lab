import * as THREE from 'three';
import { copy } from '../../content/copy';
import type { KeyInfo, PointerInfo } from '../../core/Input';
import {
  LUCK_BATCHES, NEW_STOCKS, backtest, luckScore, newStocksParams, practicePaths, scoreGrid, verdictFor,
  type BacktestResult, type VerdictResult,
} from '../../model/backtest';
import { generateBatch, type WorldParams } from '../../model/process';
import { deriveSeed, mulberry32 } from '../../model/random';
import { LOOKBACKS, NERVES, cellAt, cellIndex, ruleAt, type Direction, type Rule } from '../../model/strategy';
import type { HudAction, ReadoutRow } from '../../ui/HUD';
import { fitDistance, type CameraPose } from '../../world/shared/stage';
import type { Chapter, ChapterContext } from '../types';
import { betsText, explainVerdict, revealText, ruleText, tableCaption } from './captions';
import { advanceTest, canAdvanceTest, noteTest, startTestIntro, testFreePlay, type TestIntro } from './intro';
import { LuckPile } from './luckPile';
import { FLOOR, PILE, TABLE } from './mapping';
import { pickMystery, revealOutcome } from './mystery';
import { TestPanel, type PanelView, type StepState } from './panel';
import { BettingTable } from './table';

const TRANSITION_SECONDS = 1.6;
const INTRO_KEY = 'market-under-stress:test-intro-done';
/** Milliseconds of luck batches (~0.5 ms each) per fixed step, so 200 finish quickly without stalling a frame. */
const LUCK_BUDGET_MS = 6;
/** Scene bounds the camera keeps in view: the table, the luck pile, and room on the left for the HUD. */
const VIEW = { left: -19, right: PILE.right + 4, height: 17, z: TABLE.z - 1 };
const ELEVATION = THREE.MathUtils.degToRad(42);

const fmt = (value: number, digits = 2): string => (Number.isFinite(value) ? value.toFixed(digits) : '—');

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // Storage unavailable: the intro simply shows again next time.
  }
}

/** A luck baseline in progress or finished, for one rule on one machine. */
interface LuckRun {
  scores: Float64Array;
  next: number;
  started: number;
  ms: number;
}

/** Chapter 3 — The Test: bet on the crowd's habits, then prove it wasn't luck. */
export class TestChapter implements Chapter {
  readonly id = 'test';
  readonly title = copy().test.header.title;
  private context!: ChapterContext;
  private active = false;
  private dirty = true;
  private table?: BettingTable;
  private pile?: LuckPile;
  private panel?: TestPanel;
  private direction: Direction = 'follow';
  /** Practice scores per direction for the current machine. */
  private grids: Partial<Record<Direction, Float64Array>> = {};
  private params!: WorldParams;
  private selected = -1;
  private practice: BacktestResult | null = null;
  private fresh: BacktestResult | null = null;
  private luck: LuckRun | null = null;
  private result: VerdictResult | null = null;
  /** The reveal, fixed when "Reveal the machine" is pressed. */
  private reveal: { settings: string; outcome: string } | null = null;
  private intro: TestIntro = testFreePlay();
  private introRendered = '';
  /** Session seed for mystery picks: each pick is reproducible from it and the pick count (debug overlay). */
  private readonly mysterySeed = Date.now() >>> 0;
  private mysteryCount = 0;
  private gridMs = 0;
  private storeSubscriptions: Array<() => void> = [];
  private unsubscribe: Array<() => void> = [];

  async load(context: ChapterContext): Promise<void> {
    this.context = context;
    this.table = new BettingTable();
    this.pile = new LuckPile();
    this.table.group.visible = this.pile.group.visible = false;
    context.stage.scene.add(this.table.group, this.pile.group);
    this.storeSubscriptions.push(
      context.store.on('batch', () => {
        this.dirty = true;
        if (this.active) this.recompute(true);
      }),
      context.store.on('mystery', (state) => {
        if (!state.mystery) this.reveal = null;
        this.refresh();
      }),
    );
  }

  enter(): void {
    const { hud, input, stage } = this.context;
    this.active = true;
    if (this.dirty) this.recompute(false);
    this.table!.group.visible = this.pile!.group.visible = true;
    stage.rig.follow((aspect) => this.pose(aspect), TRANSITION_SECONDS);

    const text = copy().test;
    hud.setHeader({ eyebrow: copy().header.eyebrow, ...text.header });
    hud.setLegendLines(text.legend);
    hud.setDetail(null);
    hud.setNote('');
    this.panel = new TestPanel({
      direction: (direction) => this.setDirection(direction),
      step: () => this.step(),
      startMystery: () => this.startMystery(),
      reveal: () => this.revealMachine(),
      endMystery: () => this.context.store.endMystery(),
    });
    hud.controls.replaceChildren(this.panel.element);
    this.unsubscribe.push(input.on('pointerdown', this.onPointerDown), input.on('keydown', this.onKeyDown));
    this.setIntro(readFlag(INTRO_KEY) ? testFreePlay() : startTestIntro());
    this.refresh();
  }

  update(dt: number): void {
    const reduced = this.context.reducedMotion();
    this.table!.update(dt, reduced);
    if (this.luck && this.luck.next < LUCK_BATCHES) this.advanceLuck();
    const wasDone = this.pile!.done;
    this.pile!.update(dt, reduced);
    if (!wasDone && this.pile!.done) this.onVerdictShown();
  }

  exit(): void {
    this.active = false;
    this.table!.group.visible = this.pile!.group.visible = false;
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
    this.panel?.dispose();
    this.panel = undefined;
    this.introRendered = '';
  }

  dispose(): void {
    this.storeSubscriptions.forEach((off) => off());
    this.table?.dispose();
    this.pile?.dispose();
  }

  /** Practice scores for both directions from the current machine; any test in progress starts over. */
  private recompute(animate: boolean): void {
    const started = performance.now();
    const { params, batch } = this.context.store.state;
    this.params = params;
    const practice = practicePaths(batch.paths);
    this.grids = {
      follow: scoreGrid(practice, 'follow', params.sigmaStep),
      against: scoreGrid(practice, 'against', params.sigmaStep),
    };
    this.gridMs = performance.now() - started;
    this.dirty = false;
    this.table!.setScores(this.grids[this.direction]!, animate);
    this.resetTest();
  }

  private get rule(): Rule | null {
    return this.selected < 0 ? null : ruleAt(this.direction, cellAt(this.selected), this.params.sigmaStep);
  }

  /** Forget new-stocks and luck results (new rule, direction or machine). The chosen tile stays. */
  private resetTest(): void {
    this.fresh = null;
    this.luck = null;
    this.result = null;
    this.pile!.clear();
    const rule = this.rule;
    this.practice = rule ? backtest(practicePaths(this.context.store.state.batch.paths), rule) : null;
    this.table!.select(this.selected, this.practice ? copy().test.scores.value(this.practice.score) : '');
    this.refresh();
  }

  private select(index: number): void {
    if (index === this.selected) return;
    this.selected = index;
    this.setIntro(noteTest(this.intro, 'chose'));
    this.resetTest();
  }

  private setDirection(direction: Direction): void {
    if (direction === this.direction) return;
    this.direction = direction;
    this.table!.setScores(this.grids[direction]!, true);
    this.resetTest();
  }

  private get stepState(): StepState {
    if (!this.rule) return 'none';
    if (!this.fresh) return 'test';
    if (!this.luck) return 'luck';
    if (!this.result || !this.pile!.done) return 'checking';
    return 'done';
  }

  /** "Test it on new stocks", then "Check against luck". */
  private step(): void {
    const rule = this.rule;
    if (!rule) return;
    if (!this.fresh) {
      this.fresh = backtest(generateBatch(newStocksParams(this.params), NEW_STOCKS).paths, rule);
    } else if (!this.luck) {
      this.luck = { scores: new Float64Array(LUCK_BATCHES), next: 0, started: performance.now(), ms: 0 };
    }
    this.refresh();
  }

  /** Runs a few luck batches; when all are in, the verdict is known and the pile starts dropping. */
  private advanceLuck(): void {
    const luck = this.luck!;
    const rule = this.rule!;
    const until = performance.now() + LUCK_BUDGET_MS;
    do {
      luck.scores[luck.next] = luckScore(this.params, rule, luck.next);
      luck.next++;
    } while (luck.next < LUCK_BATCHES && performance.now() < until);
    if (luck.next < LUCK_BATCHES) return;
    luck.ms = performance.now() - luck.started;
    this.result = verdictFor(this.practice!.score, this.fresh!.score, luck.scores);
    this.pile!.show(luck.scores, this.fresh!.score, this.result.p95, this.context.reducedMotion());
    if (this.pile!.done) this.onVerdictShown();
    else this.refresh();
  }

  private onVerdictShown(): void {
    if (this.result) this.setIntro(noteTest(this.intro, 'judged'));
    this.refresh();
  }

  private startMystery(): void {
    const rng = mulberry32(deriveSeed(this.mysterySeed, this.mysteryCount++));
    this.reveal = null;
    this.context.store.startMystery(pickMystery(rng));
  }

  private revealMachine(): void {
    if (!this.result || !this.context.store.state.mystery) return;
    const { tilt, rho } = this.params;
    this.reveal = revealText(tilt, rho, revealOutcome(this.result.verdict, this.direction, rho));
    this.context.store.revealMystery();
  }

  private onPointerDown = (event: PointerInfo): void => {
    if (event.button !== 0) return;
    const hit = this.context.input.pick(this.context.stage.camera, this.table!.tiles)[0];
    if (hit) this.select(hit.object.userData.cell as number);
  };

  private onKeyDown = (event: KeyInfo): void => {
    const current = this.selected < 0 ? null : cellAt(this.selected);
    const move = (memory: number, nerve: number): void => {
      const cell = current
        ? { memory: Math.min(LOOKBACKS.length - 1, Math.max(0, current.memory + memory)), nerve: Math.min(NERVES.length - 1, Math.max(0, current.nerve + nerve)) }
        : { memory: 0, nerve: 0 };
      this.select(cellIndex(cell));
    };
    switch (event.code) {
      case 'ArrowLeft': move(0, -1); break;
      case 'ArrowRight': move(0, 1); break;
      case 'ArrowUp': move(1, 0); break;
      case 'ArrowDown': move(-1, 0); break;
      case 'KeyD': this.toggleDebug(); break;
    }
  };

  private toggleDebug(): void {
    const { hud } = this.context;
    hud.setDebugVisible(!hud.debugVisible);
    this.refresh();
  }

  private setIntro(state: TestIntro): void {
    if (state === this.intro && this.introRendered) return;
    this.intro = state;
    if (state.step === 'free') writeFlag(INTRO_KEY, true);
    this.renderIntro();
  }

  private renderIntro(): void {
    if (!this.active) return;
    const ready = canAdvanceTest(this.intro);
    const key = `${this.intro.step}:${ready}`;
    if (key === this.introRendered) return;
    this.introRendered = key;
    const text = copy();
    const back: HudAction[] = [
      { label: text.test.intro.backToTerrain, kind: 'link', onClick: () => this.context.navigate('terrain') },
      { label: text.test.intro.backToBoard, kind: 'link', onClick: () => this.context.navigate('board') },
    ];
    if (this.intro.step === 'free') {
      this.context.hud.setIntro(text.test.intro.free.lines, [...back, { label: text.intro.replay, kind: 'link', onClick: () => this.replayIntro() }]);
      return;
    }
    const actions: HudAction[] = [];
    if (ready) actions.push({ label: text.intro.next, kind: 'primary', onClick: () => this.setIntro(advanceTest(this.intro)) });
    actions.push({ label: text.intro.skip, kind: 'link', onClick: () => this.setIntro(testFreePlay()) }, ...back);
    this.context.hud.setIntro(text.test.intro.steps[this.intro.step - 1].lines, actions);
  }

  private replayIntro(): void {
    writeFlag(INTRO_KEY, false);
    this.setIntro(startTestIntro());
  }

  /** Panel, caption and debug overlay from the current state. */
  private refresh(): void {
    if (!this.active || !this.panel) return;
    const { hud, store } = this.context;
    const text = copy().test;
    const rule = this.rule;
    const step = this.stepState;
    const shown = step === 'done' ? this.result : null;
    const mystery = store.state.mystery;
    const verdict = shown ? explainVerdict(shown, LUCK_BATCHES, this.fresh!.heldShare === 0) : null;
    const view: PanelView = {
      direction: this.direction,
      rule: rule && this.practice ? { ...ruleText(rule), bets: betsText(this.practice.heldShare) } : null,
      practice: this.practice ? text.scores.value(this.practice.score) : null,
      fresh: this.fresh ? text.scores.value(this.fresh.score) : null,
      step,
      verdict: verdict && shown ? { ...verdict, kind: this.fresh!.heldShare === 0 && shown.verdict === 'justLuck' ? 'neverBets' : shown.verdict } : null,
      mystery: !mystery ? 'off' : mystery.revealed ? 'revealed' : 'active',
      canReveal: shown !== null,
      reveal: this.reveal,
    };
    this.panel.render(view);

    hud.setCaption(step === 'luck' ? text.captions.tested
      : step === 'checking' ? text.captions.checking
        : text.captions[tableCaption(this.grids[this.direction] ?? [])]);
    this.renderIntro();

    // Debug layer: exact values in model terms.
    const params = this.params;
    const r = this.result;
    const rows: ReadoutRow[] = [
      ['', 'score', 'held'],
      ['practice (100)', this.practice ? fmt(this.practice.score, 3) : '—', this.practice ? fmt(this.practice.heldShare, 3) : '—'],
      ['new stocks (100)', this.fresh ? fmt(this.fresh.score, 3) : '—', this.fresh ? fmt(this.fresh.heldShare, 3) : '—'],
      ['luck p95', r ? fmt(r.p95, 3) : '—', ''],
      ['beaten (new / practice)', r ? `${r.beaten} / ${r.practiceBeaten}` : '—', ''],
    ];
    hud.setReadout(rows);
    const own = mystery ? ` · mystery #${this.mysteryCount} (own ρ ${fmt(mystery.own.rho)}, π ${fmt(0.5 + mystery.own.tilt, 3)})` : '';
    hud.setStatus([
      `π ${fmt(0.5 + params.tilt, 3)} · ρ ${fmt(params.rho)} · σ ${fmt(params.sigmaStep, 3)} · seed ${params.seed}${own}`,
      rule ? `rule ${rule.direction} N=${rule.lookback} k=${fmt(rule.threshold, 4)} · verdict ${r?.verdict ?? '—'}` : 'no rule',
      `grid ${fmt(this.gridMs, 1)} ms · luck ${this.luck ? `${this.luck.next}/${LUCK_BATCHES}${this.luck.ms ? ` in ${fmt(this.luck.ms, 0)} ms` : ''}` : '—'} · mystery seed ${this.mysterySeed}`,
    ].join('\n'));
  }

  /** Elevated front view of the table and the luck pile, with the board standing behind them. */
  private pose(aspect: number): CameraPose {
    const width = VIEW.right - VIEW.left;
    const target = new THREE.Vector3((VIEW.left + VIEW.right) / 2, FLOOR + 1.5, VIEW.z);
    const distance = fitDistance(width, VIEW.height, aspect, 35);
    const offset = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
    return { position: target.clone().addScaledVector(offset, distance), target };
  }
}
