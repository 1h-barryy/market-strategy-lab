import * as THREE from 'three';
import { BATCH_SIZE, type AppState } from '../../app/state';
import type { KeyInfo, PointerInfo } from '../../core/Input';
import { disposeObject } from '../../core/Renderer';
import { finalMean, finalVariance, type Batch, type Path, type WorldParams } from '../../model/process';
import { binomialPmf, lag1Autocorrelation, mean, variance, varianceRatio, varianceRatioTheory } from '../../model/stats';
import type { ReadoutRow } from '../../ui/HUD';
import type { Chapter, ChapterContext } from '../types';
import { Balls } from './balls';
import { BOARD_LIMITS, DevPanel, type Playback } from './devPanel';
import { BinomialOverlay } from './histogram';
import { BoardMapping, FRAME } from './mapping';
import { createBoard } from './pegs';
import { PriceLine, S0 } from './priceLine';

/**
 * Scene bounds the camera keeps in view. The left margin leaves room for the HUD column so it
 * never covers the board; the price panel sits low on the right, under the dev panel.
 */
const VIEW = { left: -13.5, right: 17.3, bottom: -7.2, top: 9 };
/** Seconds between HUD readout refreshes while balls are landing. */
const READOUT_INTERVAL = 0.25;

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

/** Chapter 1 — The Board: the player builds the market by dropping balls through the pegs. */
export class BoardChapter implements Chapter {
  readonly id = 'board';
  readonly title = 'Chapter 1 · The Board';
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  private context!: ChapterContext;
  private readonly playback: Playback = { releaseRate: 12, speed: 1 };
  private readonly world = new THREE.Group();
  private mapping!: BoardMapping;
  private board?: THREE.Group;
  private balls?: Balls;
  private overlay?: BinomialOverlay;
  private priceLine?: PriceLine;
  private readonly pickPlane = new THREE.Mesh(new THREE.PlaneGeometry(FRAME.width, FRAME.binTop - FRAME.binBottom), new THREE.MeshBasicMaterial());
  private panel?: DevPanel;
  private unsubscribe: Array<() => void> = [];
  private pmf: number[] = [];
  private batchSummary!: Summary;
  private nextPath = 0;
  private releaseCredit = 0;
  private holdingPointer = false;
  private holdingKey = false;
  private selected = -1;
  private readoutTimer = 0;
  private shownLanded = -1;
  private error = '';

  async load(context: ChapterContext): Promise<void> {
    this.context = context;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x30343c, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(-4, 10, 12);
    this.scene.add(key, this.world);
    this.pickPlane.visible = false;
    this.pickPlane.position.set(0, (FRAME.binTop + FRAME.binBottom) / 2, 0);
    this.scene.add(this.pickPlane);
    this.build(context.store.state);
  }

  enter(): void {
    const { hud, input, renderer, store } = this.context;
    hud.setTitle(this.title);
    hud.setHint('Click or hold (or hold Space) to drop balls. Each ball is one price path. Click a landed ball to inspect it. ←/→ tilt · ↑/↓ ρ · R reset · Esc deselect');
    this.panel = new DevPanel(store.state.params, this.playback, {
      setParams: (changes) => this.setParams(changes),
      reset: () => this.reset(),
      dropInstant: (count) => this.dropInstant(count),
    });
    this.unsubscribe.push(
      store.on('batch', (state) => this.build(state)),
      input.on('pointerdown', this.onPointerDown),
      input.on('pointerup', this.onPointerUp),
      input.on('keydown', this.onKeyDown),
      input.on('keyup', this.onKeyUp),
      renderer.onResize((w, h) => this.fitCamera(w, h)),
    );
    this.refreshReadout();
  }

  update(dt: number): void {
    const balls = this.balls!;
    const playDt = dt * this.playback.speed;
    if (this.holdingPointer || this.holdingKey) {
      this.releaseCredit += dt * this.playback.releaseRate;
      while (this.releaseCredit >= 1) {
        this.releaseCredit -= 1;
        this.releaseNext();
      }
    }
    const reduced = this.context.reducedMotion();
    balls.update(playDt, reduced);
    this.syncOverlay();
    this.priceLine!.update(dt, reduced);
    this.readoutTimer += dt;
    if (balls.landed !== this.shownLanded && this.readoutTimer >= READOUT_INTERVAL) this.refreshReadout();
  }

  exit(): void {
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
    this.panel?.dispose();
    this.panel = undefined;
    this.holdingKey = this.holdingPointer = false;
  }

  dispose(): void {
    this.teardownBoard();
    disposeObject(this.scene);
  }

  /** (Re)builds everything that depends on the batch. Any change of parameters resets the board. */
  private build(state: AppState): void {
    this.teardownBoard();
    const { params } = state;
    this.mapping = new BoardMapping(params.n);
    this.board = createBoard(this.mapping);
    this.balls = new Balls(this.mapping, BATCH_SIZE);
    this.overlay = new BinomialOverlay(this.mapping);
    this.overlay.setLabels(params.sigmaStep);
    this.priceLine = new PriceLine(this.mapping);
    this.world.add(this.board, this.balls.mesh, this.overlay.group, this.priceLine.group);
    this.pmf = binomialPmf(params.n, 0.5 + params.tilt);
    this.batchSummary = summarize(state.batch.paths);
    this.nextPath = 0;
    this.releaseCredit = 0;
    this.selected = -1;
    this.shownLanded = -1;
    this.panel?.sync(params);
    this.refreshReadout();
  }

  private teardownBoard(): void {
    if (this.board) disposeObject(this.board);
    this.balls?.dispose();
    this.overlay?.dispose();
    this.priceLine?.dispose();
    this.world.clear();
  }

  private get batch(): Batch {
    return this.context.store.state.batch;
  }

  private setParams(changes: Partial<WorldParams>): void {
    try {
      this.error = '';
      this.context.store.setParams(changes);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.panel?.sync(this.context.store.state.params);
      this.refreshReadout();
    }
  }

  /** Replays the same batch from ball 0. New balls need a new seed. */
  private reset(): void {
    this.build(this.context.store.state);
  }

  private releaseNext(instant = false): boolean {
    if (this.nextPath >= this.batch.paths.length) {
      this.holdingPointer = this.holdingKey = false;
      return false;
    }
    this.balls!.release(this.batch.paths[this.nextPath++], instant);
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
    const hit = this.context.input.pick(this.camera, [this.pickPlane])[0];
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
      this.setParams({ [key]: value });
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
      case 'Escape': this.select(-1); break;
    }
  };

  private onKeyUp = (event: KeyInfo): void => {
    if (event.code === 'Space') this.holdingKey = false;
  };

  private select(index: number): void {
    this.selected = index;
    this.balls!.select(index);
    const path = index >= 0 ? this.balls!.path(index) : undefined;
    if (path) {
      const { params } = this.context.store.state;
      this.priceLine!.show(path, params.sigmaStep, 3 * params.sigmaStep * Math.sqrt(finalVariance(params)));
    } else {
      this.priceLine!.clear();
    }
    this.refreshReadout();
  }

  private refreshReadout(): void {
    const { hud, store } = this.context;
    const { params } = store.state;
    const balls = this.balls!;
    this.readoutTimer = 0;
    this.shownLanded = balls.landed;
    const landed = summarize(balls.landedPaths());
    const batch = this.batchSummary;
    const pi = 0.5 + params.tilt;
    const rows: ReadoutRow[] = [
      ['', 'landed', 'batch', 'theory'],
      ['balls', String(balls.landed), String(this.batch.paths.length), ''],
      ['mean final (steps)', signed(landed.mean), signed(batch.mean), signed(finalMean(params))],
      ['sd final (steps)', fmt(landed.sd), fmt(batch.sd), fmt(Math.sqrt(finalVariance(params)))],
      ['  sd if ρ = 0', '', '', fmt(2 * Math.sqrt(params.n * pi * (1 - pi)))],
      ['lag-1 autocorr', signed(landed.lag1), signed(batch.lag1), signed(params.rho)],
      ['VR(4)', fmt(landed.vr4), fmt(batch.vr4), fmt(varianceRatioTheory(4, params.rho))],
      ['VR(8)', fmt(landed.vr8), fmt(batch.vr8), fmt(varianceRatioTheory(8, params.rho))],
    ];
    hud.setReadout(rows);
    hud.setDetail(this.describeSelected(params));
    const world = `π ${fmt(pi, 3)} · ρ ${signed(params.rho)} · σ ${fmt(params.sigmaStep, 3)} · n ${params.n} · seed ${params.seed}`;
    const notes = [world];
    if (balls.inFlight > 0) notes.push(`${balls.inFlight} in flight`);
    if (this.nextPath >= this.batch.paths.length) notes.push('batch used up: R replays it, a new seed draws new balls');
    hud.setStatus(this.error ? `${this.error}\n${world}` : notes.join(' · '), this.error !== '');
  }

  private describeSelected(params: WorldParams): string {
    const path = this.selected >= 0 ? this.balls!.path(this.selected) : undefined;
    if (!path) return '';
    const arrows = Array.from(path.steps, (s) => (s > 0 ? '↗' : '↘')).join('');
    let longest = 0;
    let run = 0;
    for (let t = 0; t < path.steps.length; t++) {
      run = t > 0 && path.steps[t] === path.steps[t - 1] ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    const ups = path.steps.reduce((sum, s) => sum + (s > 0 ? 1 : 0), 0);
    const logReturn = params.sigmaStep * path.final;
    const lines = [
      `ball #${path.index}  ${arrows}`,
      `final ${signed(path.final, 0)} steps · log-return ${signed(logReturn * 100, 1)}% · S_n ${(S0 * Math.exp(logReturn)).toFixed(2)}`,
      `up-steps ${ups}/${path.steps.length} · longest run ${longest}`,
    ];
    if (this.priceLine?.scaleExtended) lines.push('price scale widened beyond ±3 sd to fit this path');
    return lines.join('\n');
  }

  private fitCamera(width: number, height: number): void {
    const aspect = width / height;
    this.camera.aspect = aspect;
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const w = VIEW.right - VIEW.left;
    const h = VIEW.top - VIEW.bottom;
    const distance = Math.max(h / 2 / Math.tan(halfFov), w / 2 / (Math.tan(halfFov) * aspect)) * 1.05;
    const cx = (VIEW.left + VIEW.right) / 2;
    const cy = (VIEW.top + VIEW.bottom) / 2;
    this.camera.position.set(cx, cy, distance);
    this.camera.lookAt(cx, cy, 0);
    this.camera.updateProjectionMatrix();
  }
}
