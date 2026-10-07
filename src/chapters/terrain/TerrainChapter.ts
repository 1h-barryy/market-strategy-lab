import * as THREE from 'three';
import type { AppState } from '../../app/state';
import { copy } from '../../content/copy';
import type { PointerInfo } from '../../core/Input';
import { finalVariance, type WorldParams } from '../../model/process';
import {
  dayHistograms, ghostHistograms, lag1Autocorrelation, momentsByDay, positionsAt, quantile, rowQuantile,
  smoothAcrossDays, smoothShares, varianceRatioTheory,
} from '../../model/stats';
import { CrowdControls } from '../../ui/CrowdControls';
import type { HudAction, ReadoutRow } from '../../ui/HUD';
import { fitDistance, type CameraPose } from '../../world/shared/stage';
import type { Chapter, ChapterContext } from '../types';
import { dayComparison, yearCaption } from './captions';
import { DayControl } from './dayControl';
import { advanceTerrain, canAdvanceTerrain, noteTerrainMoved, startTerrainIntro, terrainFreePlay, type TerrainIntro } from './intro';
import { DAY_SMOOTHING, EXTENT, FIRST_DAY, SMOOTHING, TerrainMapping } from './mapping';
import { TerrainSurfaces, type TerrainData } from './surfaces';
import { Walkers } from './walkers';

const TRANSITION_SECONDS = 1.6;
const INTRO_KEY = 'market-under-stress:terrain-intro-done';
/** Camera direction for the 3/4 elevated view: to the right of and above the board. */
const VIEW_ANGLES = { azimuth: THREE.MathUtils.degToRad(30), elevation: THREE.MathUtils.degToRad(36) };

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

/** Derived numbers for captions and the debug overlay, computed once per batch. */
interface Derived {
  params: WorldParams;
  mean: Float64Array;
  sd: Float64Array;
  lag1: number;
  /** Raw (not normalized) peak shares on each day, for the debug overlay. */
  rawPeak: { terrain: Float64Array; ghost: Float64Array };
  offMapShare: number;
  computeMs: number;
}

/** Chapter 2 — The Terrain: the whole year behind the board. */
export class TerrainChapter implements Chapter {
  readonly id = 'terrain';
  readonly title = copy().terrain.header.title;
  private context!: ChapterContext;
  private active = false;
  private mapping?: TerrainMapping;
  private surfaces?: TerrainSurfaces;
  private walkers?: Walkers;
  private derived?: Derived;
  private dirty = true;
  private day = FIRST_DAY;
  private dayChosen = false;
  private rise = 0;
  private dragging = false;
  private intro: TerrainIntro = terrainFreePlay();
  private introRendered = '';
  private crowd?: CrowdControls;
  private dayControl?: DayControl;
  private readonly floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
  private storeSubscriptions: Array<() => void> = [];
  private unsubscribe: Array<() => void> = [];

  async load(context: ChapterContext): Promise<void> {
    this.context = context;
    this.floorPlane.visible = false;
    context.stage.scene.add(this.floorPlane);
    const onChange = (): void => {
      this.dirty = true;
      if (this.active) this.recompute(true);
    };
    this.storeSubscriptions.push(context.store.on('batch', onChange), context.store.on('boardDays', onChange));
  }

  enter(): void {
    const { hud, input, stage, store } = this.context;
    this.active = true;
    if (this.dirty) this.recompute(false);
    if (!this.dayChosen) this.day = Math.min(store.state.boardDays, this.mapping!.days);
    this.surfaces!.group.visible = this.walkers!.mesh.visible = true;
    this.rise = this.context.reducedMotion() ? 1 : 0;
    this.surfaces!.setRise(this.rise);
    stage.rig.follow((aspect) => this.pose(aspect), TRANSITION_SECONDS);

    const text = copy().terrain;
    hud.setHeader({ eyebrow: copy().header.eyebrow, ...text.header });
    const sigma = store.state.params.sigmaStep;
    hud.setLegendLines([...text.legend, text.asymmetry(TerrainSurfaces.percentAt(-50, sigma), TerrainSurfaces.percentAt(50, sigma))]);
    hud.setDetail(null);
    hud.setNote('');

    this.crowd = new CrowdControls({ setParams: (changes) => this.setCrowd(changes) }, { days: false });
    this.dayControl = new DayControl(this.mapping!.days, (day) => this.chooseDay(day));
    hud.controls.replaceChildren(this.dayControl.element, this.crowd.element);
    this.crowd.sync(store.state.params);
    this.dayControl.set(this.day);

    this.unsubscribe.push(
      input.on('pointerdown', this.onPointerDown),
      input.on('pointerup', () => { this.dragging = false; }),
      input.on('keydown', (event) => { if (event.code === 'KeyD') this.toggleDebug(); }),
    );
    this.setIntro(readFlag(INTRO_KEY) ? terrainFreePlay() : startTerrainIntro());
    this.refreshText();
  }

  update(dt: number): void {
    const reduced = this.context.reducedMotion();
    if (this.rise < 1) {
      this.rise = reduced ? 1 : Math.min(1, this.rise + dt / TRANSITION_SECONDS);
      this.surfaces!.setRise(this.rise * this.rise * (3 - 2 * this.rise));
    }
    this.surfaces!.update(dt, reduced);
    this.walkers!.update(dt, (day, position) => this.surfaces!.heightAt(day, position) * this.surfaces!.riseScale, this.mapping!.floor);
    if (this.dragging) this.scrubToPointer();
  }

  exit(): void {
    this.active = false;
    this.dragging = false;
    this.surfaces!.group.visible = this.walkers!.mesh.visible = false;
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
    this.crowd?.dispose();
    this.crowd = undefined;
    this.dayControl?.element.remove();
    this.dayControl = undefined;
    this.introRendered = '';
  }

  dispose(): void {
    this.storeSubscriptions.forEach((off) => off());
    this.surfaces?.dispose();
    this.walkers?.dispose();
    this.floorPlane.geometry.dispose();
    (this.floorPlane.material as THREE.Material).dispose();
    this.floorPlane.removeFromParent();
  }

  /** Recomputes everything from the current batch; rebuilds geometry only if the board's scale changed. */
  private recompute(animate: boolean): void {
    const started = performance.now();
    const state: AppState = this.context.store.state;
    const { params, batch, boardDays } = state;
    const days = params.n;
    if (!this.mapping || this.mapping.boardDays !== boardDays || this.mapping.days !== days) {
      this.surfaces?.dispose();
      this.walkers?.dispose();
      this.mapping = new TerrainMapping(boardDays, days);
      this.surfaces = new TerrainSurfaces(this.mapping, params.sigmaStep);
      this.walkers = new Walkers(this.mapping);
      this.surfaces.group.visible = this.walkers.mesh.visible = this.active;
      this.context.stage.scene.add(this.surfaces.group, this.walkers.mesh);
      this.floorPlane.scale.set(this.mapping.width * 1.2, 1, this.mapping.depth * 1.2);
      this.floorPlane.position.set(0, this.mapping.floor, this.mapping.z(days / 2));
      animate = false;
    }
    const m = this.mapping;
    const pi = 0.5 + params.tilt;
    const live = dayHistograms(batch.paths, EXTENT);
    const ghost = ghostHistograms(days, pi, EXTENT);
    const liveShares = smoothAcrossDays(smoothShares(live, SMOOTHING), days, m.columns, DAY_SMOOTHING);
    const ghostShares = smoothAcrossDays(smoothShares(ghost, SMOOTHING), days, m.columns, DAY_SMOOTHING);
    const heights = m.relativeHeights(liveShares, ghostShares);
    const quartiles = {
      terrain: [new Float64Array(days + 1), new Float64Array(days + 1)] as [Float64Array, Float64Array],
      ghost: [new Float64Array(days + 1), new Float64Array(days + 1)] as [Float64Array, Float64Array],
    };
    const rawPeak = { terrain: new Float64Array(days + 1), ghost: new Float64Array(days + 1) };
    for (let t = 0; t <= days; t++) {
      // Lines follow the drawn (smoothed) surfaces; captions use exact quartiles of stock positions.
      const liveBelow = live.below[t] / live.total;
      quartiles.terrain[0][t] = rowQuantile(liveShares, t, m.columns, liveBelow, 0.25);
      quartiles.terrain[1][t] = rowQuantile(liveShares, t, m.columns, liveBelow, 0.75);
      quartiles.ghost[0][t] = rowQuantile(ghostShares, t, m.columns, ghost.below[t], 0.25);
      quartiles.ghost[1][t] = rowQuantile(ghostShares, t, m.columns, ghost.below[t], 0.75);
      for (let i = 0; i < m.columns; i++) {
        rawPeak.terrain[t] = Math.max(rawPeak.terrain[t], liveShares[t * m.columns + i]);
        rawPeak.ghost[t] = Math.max(rawPeak.ghost[t], ghostShares[t * m.columns + i]);
      }
    }
    const data: TerrainData = {
      terrain: heights.terrain,
      ghost: heights.ghost,
      below: live.below.map((count) => count / live.total),
      above: live.above.map((count) => count / live.total),
      quartiles,
    };
    this.surfaces!.setAxisLabels(params.sigmaStep);
    this.surfaces!.setData(data, animate);
    this.walkers!.setPaths(batch.paths);
    const { mean, sd } = momentsByDay(batch.paths);
    this.derived = {
      params,
      mean,
      sd,
      lag1: lag1Autocorrelation(batch.paths),
      rawPeak,
      offMapShare: data.below[days] + data.above[days],
      computeMs: performance.now() - started,
    };
    this.dirty = false;
    if (this.active) {
      this.crowd?.sync(params);
      this.refreshText();
    }
  }

  private setCrowd(changes: Partial<WorldParams>): void {
    const { params } = this.context.store.state;
    if (changes.rho !== undefined && changes.rho !== params.rho) this.setIntro(noteTerrainMoved(this.intro, 'herd'));
    try {
      this.context.store.setParams(changes);
    } catch (error) {
      this.context.hud.setStatus(error instanceof Error ? error.message : String(error), true);
      this.crowd?.sync(this.context.store.state.params);
    }
  }

  private chooseDay(day: number): void {
    const clamped = Math.min(this.mapping!.days, Math.max(FIRST_DAY, Math.round(day)));
    this.dayChosen = true;
    this.setIntro(noteTerrainMoved(this.intro, 'day'));
    if (clamped === this.day) return;
    this.day = clamped;
    this.surfaces!.setDay(clamped);
    this.dayControl?.set(clamped);
    this.refreshText();
  }

  private onPointerDown = (event: PointerInfo): void => {
    if (event.button !== 0) return;
    if (this.scrubToPointer()) this.dragging = true;
  };

  /** Sets the day from where the pointer meets the terrain's floor; false if it misses. */
  private scrubToPointer(): boolean {
    const hit = this.context.input.pick(this.context.stage.camera, [this.floorPlane])[0];
    if (!hit) return false;
    this.chooseDay(this.mapping!.dayAtZ(hit.point.z));
    return true;
  }

  private toggleDebug(): void {
    const { hud } = this.context;
    hud.setDebugVisible(!hud.debugVisible);
    this.refreshText();
  }

  private setIntro(state: TerrainIntro): void {
    if (state === this.intro && this.introRendered) return;
    this.intro = state;
    if (state.step === 'free') writeFlag(INTRO_KEY, true);
    this.renderIntro();
  }

  private renderIntro(): void {
    if (!this.active) return;
    const ready = canAdvanceTerrain(this.intro);
    const key = `${this.intro.step}:${ready}`;
    if (key === this.introRendered) return;
    this.introRendered = key;
    const text = copy();
    const back: HudAction = { label: text.terrain.intro.back, kind: 'link', onClick: () => this.context.navigate('board') };
    if (this.intro.step === 'free') {
      this.context.hud.setIntro(text.terrain.intro.free.lines, [back, { label: text.intro.replay, kind: 'link', onClick: () => this.replayIntro() }]);
      return;
    }
    const actions: HudAction[] = [];
    if (ready) actions.push({ label: text.intro.next, kind: 'primary', onClick: () => this.setIntro(advanceTerrain(this.intro)) });
    actions.push({ label: text.intro.skip, kind: 'link', onClick: () => this.setIntro(terrainFreePlay()) }, back);
    this.context.hud.setIntro(text.terrain.intro.steps[this.intro.step - 1].lines, actions);
  }

  private replayIntro(): void {
    writeFlag(INTRO_KEY, false);
    this.setIntro(startTerrainIntro());
  }

  /** Year caption, day caption and the debug overlay. */
  private refreshText(): void {
    if (!this.active || !this.derived) return;
    const { hud, store } = this.context;
    const d = this.derived;
    const { params } = d;
    const days = params.n;
    const stocks = store.state.batch.paths.length;
    const text = copy().terrain;
    const ghostSd = (t: number): number => Math.sqrt(finalVariance({ ...params, rho: 0, n: t }));

    const year = yearCaption({ stocks, mean: d.mean[days], sd: d.sd[days], ghostSd: ghostSd(days), offMapShare: d.offMapShare });
    const yearLine = [
      year.spread === 'needMore' ? text.year.needMore : text.year[year.spread],
      year.mood === 'up' ? text.year.moodUp : year.mood === 'down' ? text.year.moodDown : '',
    ].filter(Boolean).join(' ');

    const positions = positionsAt(store.state.batch.paths, this.day);
    const percent = (steps: number): string => copy().board.percent(Math.expm1(params.sigmaStep * steps));
    const comparison = dayComparison({ stocks, mean: d.mean[this.day], sd: d.sd[this.day], ghostSd: ghostSd(this.day) });
    const dayLine = [
      text.dayCaption.middleHalf(this.day, percent(quantile(positions, 0.25)), percent(quantile(positions, 0.75))),
      comparison === 'needMore' ? '' : text.dayCaption[comparison],
    ].filter(Boolean).join(' ');

    hud.setCaption(`${yearLine}\n${dayLine}`);
    hud.setNote(year.offMap ? text.year.offMap : '');
    this.renderIntro();

    // Debug layer: exact values in model terms (raw density kept here; the surface is normalized per day).
    const pi = 0.5 + params.tilt;
    const stepVar = 4 * pi * (1 - pi);
    const vr = (q: number): string => fmt(d.sd[q] ** 2 / (q * stepVar));
    const rows: ReadoutRow[] = [
      ['', 'measured', 'theory', 'ghost'],
      [`sd day ${days} (steps)`, fmt(d.sd[days]), fmt(Math.sqrt(finalVariance(params))), fmt(ghostSd(days))],
      [`sd day ${this.day}`, fmt(d.sd[this.day]), fmt(Math.sqrt(finalVariance({ ...params, n: this.day }))), fmt(ghostSd(this.day))],
      ['VR(10) from spread', vr(10), fmt(varianceRatioTheory(10, params.rho)), '1.00'],
      ['VR(50) from spread', vr(50), fmt(varianceRatioTheory(50, params.rho)), '1.00'],
      [`VR(${days}) from spread`, vr(days), fmt(varianceRatioTheory(days, params.rho)), '1.00'],
      ['lag-1 autocorr', fmt(d.lag1), fmt(params.rho), '0.00'],
      [`raw peak share day ${this.day}`, fmt(d.rawPeak.terrain[this.day], 4), '', fmt(d.rawPeak.ghost[this.day], 4)],
      [`off map day ${days}`, `${fmt(d.offMapShare * 100, 1)}%`, '', ''],
    ];
    hud.setReadout(rows);
    hud.setStatus([
      `π ${fmt(pi, 3)} · ρ ${fmt(params.rho)} · σ ${fmt(params.sigmaStep, 3)} · ${stocks} stocks × ${days} days · seed ${params.seed}`,
      `caption ${year.spread}${year.mood ? ` + ${year.mood}` : ''} · day ${comparison}`,
      `batch regen ${fmt(store.lastRegenMs, 1)} ms · terrain compute ${fmt(d.computeMs, 1)} ms · morph frame ${fmt(this.surfaces!.lastMorphMs, 1)} ms`,
    ].join('\n'));
  }

  /** 3/4 elevated view from the front right, fitted to the terrain and the board. */
  private pose(aspect: number): CameraPose {
    const m = this.mapping!;
    const target = new THREE.Vector3(-m.width * 0.1, m.floor + m.ridge * 0.2, m.z(m.days * 0.45));
    const distance = fitDistance(m.width * 1.75, m.depth * 1.2, aspect, 35);
    const { azimuth, elevation } = VIEW_ANGLES;
    const offset = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
    return { position: target.clone().addScaledVector(offset, distance), target };
  }
}
