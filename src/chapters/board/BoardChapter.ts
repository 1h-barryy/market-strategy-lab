import * as THREE from 'three';
import { BATCH_SIZE, type AppState } from '../../app/state';
import { copy } from '../../content/copy';
import type { KeyInfo, PointerInfo } from '../../core/Input';
import { disposeObject } from '../../core/Renderer';
import { finalMean, finalVariance, prefixPath, type Path, type WorldParams } from '../../model/process';
import { binomialPmf, lag1Autocorrelation, mean, variance, varianceRatio, varianceRatioTheory } from '../../model/stats';
import type { HudAction, ReadoutRow } from '../../ui/HUD';
import type { Chapter, ChapterContext } from '../types';
import { Balls } from './balls';
import { captionFor } from '../../model/evidence';
import { CrowdControls } from '../../ui/CrowdControls';
import { fitDistance, type CameraPose } from '../../world/shared/stage';
import { BOARD_LIMITS, DevPanel, type Playback } from './devPanel';
import { BinomialOverlay } from './histogram';
import { advance, canAdvance, freePlay, locks, noteMoved, startIntro, type IntroState } from './intro';
import { BoardMapping, FRAME } from './mapping';
import type { Instrument } from '../../art/instrument';
import { createBoard } from './pegs';
import { PriceLine, S0 } from './priceLine';

/**
 * Scene bounds the camera keeps in view. The left margin leaves room for the HUD column so it
 * never covers the board; the price panel sits low on the right.
 */
const VIEW = { left: -13.5, right: 17.3, bottom: -7.2, top: 9 };
/** Seconds between HUD refreshes while balls are landing. */
const READOUT_INTERVAL = 0.25;
/** Seconds for the camera to glide between the board and other chapters. */
const TRANSITION_SECONDS = 1.6;
/** Remembers that the intro was finished or skipped (per browser; a convenience only). */
const INTRO_KEY = 'market-under-stress:intro-done';

interface Summary {
  mean: number;
  sd: number;
  lag1: number;
  vr4: number;
  vr8: number;
}

function summarize(paths: readonly Path[]): Summary {
  const finals = paths.map((p) => p.final);
  return {
    mean: finals.length ? mean(finals) : NaN,
    sd: finals.length ? Math.sqrt(variance(finals)) : NaN,
    lag1: lag1Autocorrelation(paths),
    vr4: varianceRatio(paths, 4),
    vr8: varianceRatio(paths, 8),
  };
}

const fmt = (value: number, digits = 2): string => (Number.isFinite(value) ? value.toFixed(digits) : '—');
const signed = (value: number, digits = 2): string => (value > 0 ? '+' : '') + fmt(value, digits);

/** Front view of the board, fitted to the window. */
function boardPose(aspect: number): CameraPose {
  const distance = fitDistance(VIEW.right - VIEW.left, VIEW.top - VIEW.bottom, aspect, 35) * 1.05;
  const cx = (VIEW.left + VIEW.right) / 2;
  const cy = (VIEW.top + VIEW.bottom) / 2;
  return { position: new THREE.Vector3(cx, cy, distance), target: new THREE.Vector3(cx, cy, 0) };
}

function readIntroDone(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

function writeIntroDone(done: boolean): void {
  try {
    if (done) localStorage.setItem(INTRO_KEY, '1');
    else localStorage.removeItem(INTRO_KEY);
  } catch {
    // Storage unavailable: the intro simply shows again next time.
  }
}

/** Chapter 1 — The Board: the player sets the crowd and drops stocks through the days. */
export class BoardChapter implements Chapter {
  readonly id = 'board';
  readonly title = copy().header.title;
  private context!: ChapterContext;
  /** Only the active chapter writes to the HUD; the board keeps its pile in sync while inactive. */
  private active = false;
  private storeSubscriptions: Array<() => void> = [];
  private readonly playback: Playback = { releaseRate: 12, speed: 1 };
  private readonly world = new THREE.Group();
  private mapping!: BoardMapping;
  private board?: Instrument;
  private balls?: Balls;
  private overlay?: BinomialOverlay;
  private priceLine?: PriceLine;
  private readonly pickPlane = new THREE.Mesh(new THREE.PlaneGeometry(FRAME.width, FRAME.binTop - FRAME.binBottom), new THREE.MeshBasicMaterial());
  private panel?: DevPanel;
  private controls?: CrowdControls;
  private intro: IntroState = freePlay();
  private introRendered = '';
  private unsubscribe: Array<() => void> = [];
  private pmf: number[] = [];
  /** What the board shows: the world params with n = board days, and each path cut to those days. */
  private view!: { params: WorldParams; paths: readonly Path[] };
  private batchSummary!: Summary;
  private nextPath = 0;
  private releaseCredit = 0;
  private holdingPointer = false;
  private holdingKey = false;
  private selected = -1;
  private readoutTimer = 0;
  private shownLanded = -1;
  private error = '';
  private firstEnter = true;

  async load(context: ChapterContext): Promise<void> {
    this.context = context;
    this.world.name = 'BoardChapter';
    this.pickPlane.visible = false;
    this.pickPlane.position.set(0, (FRAME.binTop + FRAME.binBottom) / 2, 0);
    context.stage.scene.add(this.world, this.pickPlane);
    // Subscribed for the chapter's whole life: the pile stays in sync with the world even while
    // another chapter (the terrain behind it) is active.
    this.storeSubscriptions.push(
      context.store.on('batch', (state) => this.build(state, this.balls?.landed ?? 0)),
      context.store.on('boardDays', (state) => this.build(state, this.balls?.landed ?? 0)),
    );
    this.build(context.store.state, 0);
  }

  enter(): void {
    const { hud, input, stage } = this.context;
    this.active = true;
    stage.rig.follow(boardPose, this.firstEnter ? 0 : TRANSITION_SECONDS);
    this.firstEnter = false;
    this.priceLine!.group.visible = true;
    this.overlay!.showLegend = true;
    const text = copy();
    hud.setHeader(text.header);
    hud.setLegend(text.legend.prefix, text.legend.up, text.legend.down);
    this.panel = new DevPanel(this.view.params, this.playback, {
      setParams: (changes) => this.setParams(changes),
      reset: () => this.reset(),
      dropInstant: (count) => this.dropInstant(count),
    });
    this.panel.setVisible(hud.debugVisible);
    this.controls = new CrowdControls({ setParams: (changes) => this.playerSetParams(changes), reset: () => this.reset() }, { days: true });
    hud.controls.replaceChildren(this.controls.element);
    this.controls.sync(this.view.params);
    this.controls.setMystery(this.context.store.state.mystery !== null);
    this.unsubscribe.push(
      input.on('pointerdown', this.onPointerDown),
      input.on('pointerup', this.onPointerUp),
      input.on('keydown', this.onKeyDown),
      input.on('keyup', this.onKeyUp),
    );
    if (readIntroDone()) this.setIntro(freePlay());
    else this.replayIntro();
    this.refreshReadout();
  }

  update(dt: number): void {
    const balls = this.balls!;
    if (this.holdingPointer || this.holdingKey) {
      this.releaseCredit += dt * this.playback.releaseRate;
      while (this.releaseCredit >= 1) {
        this.releaseCredit -= 1;
        this.releaseNext();
      }
    }
    const reduced = this.context.reducedMotion();
    balls.update(dt * this.playback.speed, reduced);
    this.board!.update(dt, balls.sourcePulse);
    this.syncOverlay();
    this.priceLine!.update(dt, reduced);
    this.readoutTimer += dt;
    if (balls.landed !== this.shownLanded && this.readoutTimer >= READOUT_INTERVAL) this.refreshReadout();
  }

  exit(): void {
    this.active = false;
    // Stocks still falling land at once, so the pile is complete while the terrain is on screen.
    this.balls?.landAll();
    this.syncOverlay();
    this.select(-1);
    this.overlay!.showLegend = false;
    this.syncOverlay();
    this.priceLine!.group.visible = false;
    this.introRendered = '';
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
    this.panel?.dispose();
    this.panel = undefined;
    this.controls?.dispose();
    this.controls = undefined;
    this.holdingKey = this.holdingPointer = false;
  }

  dispose(): void {
    this.storeSubscriptions.forEach((off) => off());
    this.storeSubscriptions = [];
    this.teardownBoard();
    disposeObject(this.pickPlane);
    this.world.removeFromParent();
    this.pickPlane.removeFromParent();
  }

  /**
   * (Re)builds everything that depends on the batch. `refill` stocks are landed instantly from the
   * new batch, so changing the crowd reshapes the pile at the same size (every stock on the board
   * always comes from the current settings). Stocks in flight are dropped.
   */
  private build(state: AppState, refill: number): void {
    this.teardownBoard();
    const params = { ...state.params, n: state.boardDays };
    this.view = { params, paths: state.batch.paths.map((path) => prefixPath(path, state.boardDays)) };
    this.mapping = new BoardMapping(params.n);
    this.board = createBoard(this.mapping);
    this.balls = new Balls(this.mapping, BATCH_SIZE);
    const board = this.board;
    this.balls.onLand = (bin, color) => board.flash(bin, color);
    this.overlay = new BinomialOverlay(this.mapping);
    this.overlay.setLabels(params.sigmaStep);
    this.priceLine = new PriceLine(this.mapping);
    this.priceLine.group.visible = this.active;
    this.overlay.showLegend = this.active;
    this.world.add(this.board, this.balls.group, this.overlay.group, this.priceLine.group);
    this.pmf = binomialPmf(params.n, 0.5 + params.tilt);
    this.batchSummary = summarize(this.view.paths);
    this.nextPath = 0;
    this.releaseCredit = 0;
    this.selected = -1;
    this.shownLanded = -1;
    this.panel?.sync(params);
    this.controls?.sync(params);
    if (refill > 0) this.dropInstant(refill);
    else this.refreshReadout();
  }

  private teardownBoard(): void {
    this.board?.dispose();
    this.balls?.dispose();
    this.overlay?.dispose();
    this.priceLine?.dispose();
    this.world.clear();
  }

  private get paths(): readonly Path[] {
    return this.view.paths;
  }

  /** World changes go to the store; `n` here means the board's days, which never touch the batch. */
  private setParams(changes: Partial<WorldParams>): void {
    try {
      this.error = '';
      const { n, ...world } = changes;
      if (n !== undefined) this.context.store.setBoardDays(n);
      this.context.store.setParams(world);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.panel?.sync(this.view.params);
      this.controls?.sync(this.view.params);
      this.refreshReadout();
    }
  }

  /** Player-facing changes respect the intro's locks and a mystery machine, and count as "tried this control". */
  private playerSetParams(changes: Partial<WorldParams>): void {
    const locked = locks(this.intro.step);
    const mystery = this.context.store.state.mystery !== null;
    const allowed = { ...changes };
    if (locked.mood || mystery) delete allowed.tilt;
    if (locked.herd || mystery) delete allowed.rho;
    const { params } = this.context.store.state;
    let intro = this.intro;
    if (allowed.tilt !== undefined && allowed.tilt !== params.tilt) intro = noteMoved(intro, 'mood');
    if (allowed.rho !== undefined && allowed.rho !== params.rho) intro = noteMoved(intro, 'herd');
    this.setParams(allowed);
    this.controls?.sync(this.view.params);
    if (intro !== this.intro) this.setIntro(intro);
  }

  /** Clears the board; the same stocks will fall again. New stocks need a new seed (debug). */
  private reset(): void {
    this.build(this.context.store.state, 0);
  }

  private replayIntro(): void {
    writeIntroDone(false);
    this.setParams({ tilt: 0, rho: 0 });
    this.reset();
    this.setIntro(startIntro());
  }

  private setIntro(state: IntroState): void {
    this.intro = state;
    if (state.step === 'free') writeIntroDone(true);
    this.controls?.setLocked(locks(state.step));
    this.renderIntro();
  }

  private renderIntro(): void {
    if (!this.active) return;
    const ready = canAdvance(this.intro, this.balls?.landed ?? 0);
    const mystery = this.context.store.state.mystery !== null;
    const key = `${this.intro.step}:${ready}:${mystery}`;
    if (key === this.introRendered) return;
    this.introRendered = key;
    const text = copy().intro;
    if (this.intro.step === 'free' && mystery) {
      const test = copy().test;
      this.context.hud.setIntro(test.mystery.chapterLines, [
        { label: test.mystery.backToTest, kind: 'primary', onClick: () => this.context.navigate('test') },
        { label: text.continueToTerrain, kind: 'link', onClick: () => this.context.navigate('terrain') },
      ]);
      return;
    }
    if (this.intro.step === 'free') {
      this.context.hud.setIntro(text.free.lines, [
        { label: text.continueToTerrain, kind: 'primary', onClick: () => this.context.navigate('terrain') },
        { label: text.replay, kind: 'link', onClick: () => this.replayIntro() },
      ]);
      return;
    }
    const actions: HudAction[] = [];
    if (ready) actions.push({ label: text.next, kind: 'primary', onClick: () => this.setIntro(advance(this.intro)) });
    actions.push({ label: text.skip, kind: 'link', onClick: () => this.setIntro(freePlay()) });
    this.context.hud.setIntro(text.steps[this.intro.step - 1].lines, actions);
  }

  private releaseNext(instant = false): boolean {
    if (this.nextPath >= this.paths.length) {
      this.holdingPointer = this.holdingKey = false;
      return false;
    }
    this.balls!.release(this.paths[this.nextPath++], instant);
    return true;
  }

  private dropInstant(count: number): void {
    for (let i = 0; i < count && this.releaseNext(true); i++);
    this.balls!.flush();
    this.syncOverlay();
    this.refreshReadout();
  }

  /** Overlay = Binomial(n, π) × landed balls; stacks and overlay share one height scale. */
  private syncOverlay(): void {
    const balls = this.balls!;
    const expected = this.pmf.map((p) => p * balls.landed);
    balls.setScaleFloor(Math.max(...expected));
    balls.flush();
    this.overlay!.update(expected, balls.stackUnit);
  }

  private onPointerDown = (event: PointerInfo): void => {
    if (event.button !== 0) return;
    const hit = this.context.input.pick(this.context.stage.camera, [this.pickPlane])[0];
    if (hit) {
      const bin = this.mapping.binAtX(hit.point.x);
      const index = bin < 0 ? -1 : this.balls!.ballAt(bin, this.mapping.slotAtY(hit.point.y, this.balls!.stackUnit));
      if (index >= 0) {
        this.select(index);
        return;
      }
    }
    this.holdingPointer = true;
    this.releaseCredit = 0;
    this.releaseNext();
  };

  private onPointerUp = (): void => {
    this.holdingPointer = false;
  };

  private onKeyDown = (event: KeyInfo): void => {
    const { params } = this.context.store.state;
    const nudge = (key: 'tilt' | 'rho', delta: number): void => {
      const { min, max } = BOARD_LIMITS[key];
      const value = Math.round(Math.min(max, Math.max(min, params[key] + delta)) * 1000) / 1000;
      this.playerSetParams({ [key]: value });
    };
    switch (event.code) {
      case 'Space':
        if (!event.repeat && !this.holdingKey) {
          this.holdingKey = true;
          this.releaseCredit = 0;
          this.releaseNext();
        }
        break;
      case 'ArrowLeft': nudge('tilt', -0.01); break;
      case 'ArrowRight': nudge('tilt', 0.01); break;
      case 'ArrowUp': nudge('rho', 0.1); break;
      case 'ArrowDown': nudge('rho', -0.1); break;
      case 'KeyR': this.reset(); break;
      case 'KeyD': this.toggleDebug(); break;
      case 'Escape': this.select(-1); break;
    }
  };

  private onKeyUp = (event: KeyInfo): void => {
    if (event.code === 'Space') this.holdingKey = false;
  };

  private toggleDebug(): void {
    const visible = !this.context.hud.debugVisible;
    this.context.hud.setDebugVisible(visible);
    this.panel?.setVisible(visible);
  }

  private select(index: number): void {
    this.selected = index;
    this.balls!.select(index);
    const path = index >= 0 ? this.balls!.path(index) : undefined;
    if (path) {
      const { params } = this.view;
      this.priceLine!.show(path, params.sigmaStep, 3 * params.sigmaStep * Math.sqrt(finalVariance(params)));
    } else {
      this.priceLine!.clear();
    }
    this.refreshReadout();
  }

  private refreshReadout(): void {
    if (!this.active) return;
    const { hud } = this.context;
    const { params } = this.view;
    const balls = this.balls!;
    this.readoutTimer = 0;
    this.shownLanded = balls.landed;
    const landed = summarize(balls.landedPaths());
    const text = copy();

    // Player layer: caption, note, inspected stock.
    const baselineSd = Math.sqrt(finalVariance({ ...params, rho: 0 }));
    const caption = captionFor({ landed: balls.landed, mean: landed.mean, sd: landed.sd, baselineSd });
    const captions = text.captions;
    const spread = caption.spread === 'needMore' ? captions.needMore(balls.landed)
      : caption.spread === 'same' && this.intro.step === 1 ? captions.bell
        : captions[caption.spread];
    const mood = caption.mood === 'up' ? captions.moodUp : caption.mood === 'down' ? captions.moodDown : '';
    hud.setCaption(mood ? `${spread} ${mood}` : spread);
    hud.setNote(this.nextPath >= this.paths.length ? captions.outOfStocks : '');
    hud.setDetail(this.describeSelected(params));
    this.renderIntro();

    // Debug layer: exact readouts in model terms.
    const batch = this.batchSummary;
    const pi = 0.5 + params.tilt;
    const rows: ReadoutRow[] = [
      ['', 'landed', 'batch', 'theory'],
      ['balls', String(balls.landed), String(this.paths.length), ''],
      ['mean final (steps)', signed(landed.mean), signed(batch.mean), signed(finalMean(params))],
      ['sd final (steps)', fmt(landed.sd), fmt(batch.sd), fmt(Math.sqrt(finalVariance(params)))],
      ['  sd if ρ = 0', '', '', fmt(baselineSd)],
      ['lag-1 autocorr', signed(landed.lag1), signed(batch.lag1), signed(params.rho)],
      ['VR(4)', fmt(landed.vr4), fmt(batch.vr4), fmt(varianceRatioTheory(4, params.rho))],
      ['VR(8)', fmt(landed.vr8), fmt(batch.vr8), fmt(varianceRatioTheory(8, params.rho))],
    ];
    hud.setReadout(rows);
    const world = `π ${fmt(pi, 3)} · ρ ${signed(params.rho)} · σ ${fmt(params.sigmaStep, 3)} · board days ${params.n} of ${this.context.store.state.params.n} · seed ${params.seed}`;
    const notes = [world, `caption ${caption.spread}${caption.mood ? ` + ${caption.mood}` : ''}`];
    if (balls.inFlight > 0) notes.push(`${balls.inFlight} in flight`);
    if (this.selected >= 0) notes.push(`ball #${this.selected}`);
    if (this.priceLine?.scaleExtended) notes.push('price scale widened beyond ±3 sd');
    hud.setStatus(this.error ? `${this.error}\n${world}` : notes.join(' · '), this.error !== '');
  }

  private describeSelected(params: WorldParams): { title: string; lines: string[] } | null {
    const path = this.selected >= 0 ? this.balls!.path(this.selected) : undefined;
    if (!path) return null;
    let longest = 0;
    let longestUp = true;
    let run = 0;
    for (let t = 0; t < path.steps.length; t++) {
      run = t > 0 && path.steps[t] === path.steps[t - 1] ? run + 1 : 1;
      if (run > longest) {
        longest = run;
        longestUp = path.steps[t] > 0;
      }
    }
    const end = S0 * Math.exp(params.sigmaStep * path.final);
    const text = copy().stock;
    return {
      title: text.title(path.steps.length),
      lines: [text.summary(S0, end, end / S0 - 1), text.streak(longest, longestUp)],
    };
  }

}
