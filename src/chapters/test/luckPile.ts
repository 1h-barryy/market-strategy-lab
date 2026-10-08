import * as THREE from 'three';
import { copy } from '../../content/copy';
import { disposeObject } from '../../core/Renderer';
import { LUCK_BATCHES } from '../../model/backtest';
import { palette } from '../../world/shared/palette';
import { label } from '../board/histogram';
import { FLOOR, PILE, pileBinX, pileLayout, pileX, type PileLayout } from './mapping';

/** Playback timing (seconds). Visual only: the scores are computed before anything drops. */
const TIMING = { spread: 2, fall: 0.55, pause: 0.5, playerFall: 0.8 } as const;
const DROP_FROM = FLOOR + PILE.height + 0.8;
/** The pile leans back about its base so it faces the elevated camera instead of looking squashed. */
const LEAN = THREE.MathUtils.degToRad(28);

interface Drop {
  x: number;
  y: number;
  delay: number;
}

/** Round step (1, 2 or 5 × 10^k) for about `count` ticks over `span`. */
function niceStep(span: number, count: number): number {
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10) * power;
}

/**
 * The luck baseline as a pile (DESIGN.md §6.2): 200 scores of the player's rule on crowds with no
 * habits drop into bins, then the player's new-stocks score drops as one accent ball, next to a
 * dashed marker at the 95th percentile.
 */
export class LuckPile {
  readonly group = new THREE.Group();
  private readonly balls: THREE.InstancedMesh;
  private readonly you: THREE.Mesh;
  private readonly marker: THREE.Line;
  private readonly labels = new THREE.Group();
  private drops: Drop[] = [];
  private player: Drop = { x: 0, y: 0, delay: 0 };
  private radius = 0.1;
  private youRadius = 0.2;
  private time = 0;
  private finish = 0;
  private readonly matrix = new THREE.Matrix4();

  constructor() {
    this.group.name = 'LuckPile';
    const backplate = new THREE.Mesh(
      new THREE.PlaneGeometry(PILE.right - PILE.left + 1.2, PILE.height + 1.4),
      new THREE.MeshStandardMaterial({ color: palette.board, roughness: 0.95 }),
    );
    backplate.position.set((PILE.left + PILE.right) / 2, FLOOR + (PILE.height + 1.4) / 2 - 0.2, PILE.z - 0.4);
    const axis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(PILE.left, FLOOR, PILE.z), new THREE.Vector3(PILE.right, FLOOR, PILE.z)]),
      new THREE.LineBasicMaterial({ color: palette.guide }),
    );
    const sphere = new THREE.SphereGeometry(1, 14, 10);
    this.balls = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ color: palette.neutral, roughness: 0.4 }), LUCK_BATCHES);
    this.balls.count = 0;
    this.balls.frustumCulled = false;
    this.you = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ color: palette.accent, emissive: palette.accent, emissiveIntensity: 0.35, roughness: 0.35 }));
    this.marker = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, FLOOR, PILE.z + 0.05), new THREE.Vector3(0, FLOOR + PILE.height, PILE.z + 0.05)]),
      new THREE.LineDashedMaterial({ color: palette.neutral, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.8 }),
    );
    this.marker.computeLineDistances();
    // Built in world coordinates inside `inner`; the outer group pivots on the pile's base line.
    const inner = new THREE.Group();
    inner.position.set(0, -FLOOR, -PILE.z);
    inner.add(backplate, axis, this.balls, this.you, this.marker, this.labels);
    this.group.position.set(0, FLOOR, PILE.z);
    this.group.rotation.x = -LEAN;
    this.group.add(inner);
    this.clear();
  }

  /** True once the player's ball has landed (or nothing is showing). */
  get done(): boolean {
    return this.time >= this.finish;
  }

  clear(): void {
    this.drops = [];
    this.balls.count = 0;
    this.you.visible = this.marker.visible = false;
    this.labels.clear();
    this.time = this.finish = 0;
    const caption = label(copy().test.pile.caption, 'scene-label');
    caption.position.set((PILE.left + PILE.right) / 2, FLOOR - 0.95, PILE.z);
    this.labels.add(caption);
  }

  /** Lays out the luck scores and the player's score and starts the drop (instant under reduced motion). */
  show(luck: ArrayLike<number>, player: number, p95: number, reducedMotion: boolean): void {
    this.clear();
    const layout = pileLayout(luck, player);
    const binWidth = (PILE.right - PILE.left) / layout.bins;
    const unit = Math.min(binWidth * 0.9, (PILE.height * 0.85) / Math.max(1, ...layout.counts));
    this.radius = unit / 2;
    this.youRadius = Math.max(unit * 0.8, 0.22);
    const filled = new Int32Array(layout.bins);
    this.drops = Array.from(layout.binOf, (bin, i) => ({
      x: pileBinX(layout, bin),
      y: FLOOR + (filled[bin]++ + 0.5) * unit,
      delay: (i / luck.length) * TIMING.spread,
    }));
    const text = copy().test.pile;
    const score = copy().test.scores.value(player);
    let youLabel: string;
    if (typeof layout.player === 'number') {
      this.player = { x: pileBinX(layout, layout.player), y: FLOOR + layout.counts[layout.player] * unit + this.youRadius, delay: TIMING.spread + TIMING.pause };
      youLabel = text.you(score);
    } else {
      const x = layout.player === 'right' ? PILE.right + 0.5 : PILE.left - 0.5;
      this.player = { x, y: FLOOR + this.youRadius, delay: TIMING.spread + TIMING.pause };
      youLabel = text.offChart(score);
    }
    this.finish = this.player.delay + TIMING.playerFall;
    this.time = reducedMotion ? this.finish : 0;

    const you = label(youLabel, 'scene-label strong you-label');
    you.position.set(this.player.x, this.player.y + this.youRadius + 0.5, PILE.z);
    you.visible = false;
    you.userData.you = true;
    this.labels.add(you);
    this.marker.position.x = pileX(layout, p95);
    const p95Label = label(text.p95, 'scene-label p95-label');
    p95Label.position.set(this.marker.position.x, FLOOR + PILE.height + 0.3, PILE.z);
    this.labels.add(p95Label);
    this.addTicks(layout);
    this.marker.visible = true;
    this.apply();
  }

  private addTicks(layout: PileLayout): void {
    const lo = layout.lo;
    const hi = layout.lo + layout.width * layout.bins;
    const step = niceStep(hi - lo, 4);
    for (let value = Math.ceil(lo / step) * step; value <= hi + 1e-9; value += step) {
      const tick = label(copy().test.scores.value(Math.abs(value) < step / 1e6 ? 0 : value), 'scene-label');
      tick.position.set(pileX(layout, value), FLOOR - 0.45, PILE.z);
      this.labels.add(tick);
    }
  }

  update(dt: number, reducedMotion: boolean): void {
    if (this.done) return;
    this.time = reducedMotion ? this.finish : Math.min(this.finish, this.time + dt);
    this.apply();
  }

  private apply(): void {
    let count = 0;
    for (const drop of this.drops) {
      const u = (this.time - drop.delay) / TIMING.fall;
      if (u < 0) continue;
      const y = u >= 1 ? drop.y : DROP_FROM + (drop.y - DROP_FROM) * u * u;
      this.matrix.makeScale(this.radius, this.radius, this.radius).setPosition(drop.x, y, PILE.z);
      this.balls.setMatrixAt(count++, this.matrix);
    }
    this.balls.count = count;
    this.balls.instanceMatrix.needsUpdate = true;
    const u = (this.time - this.player.delay) / TIMING.playerFall;
    this.you.visible = u >= 0 && this.drops.length > 0;
    if (this.you.visible) {
      const k = Math.min(1, u);
      this.you.position.set(this.player.x, DROP_FROM + (this.player.y - DROP_FROM) * k * k, PILE.z + 0.1);
      this.you.scale.setScalar(this.youRadius);
    }
    for (const item of this.labels.children) if (item.userData.you) item.visible = this.done && this.drops.length > 0;
  }

  dispose(): void {
    this.labels.clear();
    disposeObject(this.group);
    this.group.removeFromParent();
  }
}
