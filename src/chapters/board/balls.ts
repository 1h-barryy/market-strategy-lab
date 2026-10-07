import * as THREE from 'three';
import type { Path } from '../../model/process';
import { palette } from '../../world/shared/palette';
import { BoardMapping, type Point } from './mapping';

/** Seconds per phase at speed 1. Playback timing only; the path itself is fixed by the model. */
const TIMING = { entry: 0.3, step: 0.16, fall: 0.35 } as const;

interface Ball {
  /** Release order; also the instance index and the batch path index. */
  index: number;
  path: Path;
  /** upCount[t] = up-steps among the first t steps, i.e. the peg index after t steps. */
  upCount: Int16Array;
  age: number;
  landed: boolean;
  bin: number;
  slot: number;
}

const colorUp = new THREE.Color(palette.up);
const colorDown = new THREE.Color(palette.down);
const colorNeutral = new THREE.Color(palette.neutral);
const colorAccent = new THREE.Color(palette.accent);

/**
 * Balls in flight and in the bins, drawn as one instanced mesh. Ball k is batch path k; every
 * left/right move it makes is that path's step sequence, played back along scripted arcs.
 */
export class Balls {
  readonly mesh: THREE.InstancedMesh;
  /** Landed balls per bin, bottom to top. */
  readonly bins: number[][];
  private readonly balls: Ball[] = [];
  private landedCount = 0;
  private scaleCount = 1;
  private unit: number;
  private landedDirty = false;
  private selected = -1;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly identity = new THREE.Quaternion();

  constructor(private readonly mapping: BoardMapping, capacity: number) {
    const geometry = new THREE.SphereGeometry(1, 16, 12);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0, emissive: 0x000000 });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.name = 'Balls';
    this.mesh.count = 0;
    // Instances move every frame; a cached bounding sphere would cull them wrongly.
    this.mesh.frustumCulled = false;
    this.bins = Array.from({ length: mapping.n + 1 }, () => []);
    this.unit = mapping.stackUnit(1);
  }

  get released(): number {
    return this.balls.length;
  }

  get landed(): number {
    return this.landedCount;
  }

  get inFlight(): number {
    return this.balls.length - this.landedCount;
  }

  /** Paths of all landed balls, in release order. */
  landedPaths(): Path[] {
    return this.balls.filter((b) => b.landed).map((b) => b.path);
  }

  /** Bin counts of landed balls. */
  counts(): number[] {
    return this.bins.map((bin) => bin.length);
  }

  /** Current stack height unit, shared with the analytic overlay. */
  get stackUnit(): number {
    return this.unit;
  }

  release(path: Path, instant = false): void {
    if (this.balls.length >= this.mesh.instanceMatrix.count) throw new RangeError('Ball capacity exceeded.');
    const upCount = new Int16Array(path.steps.length + 1);
    for (let t = 0; t < path.steps.length; t++) upCount[t + 1] = upCount[t] + (path.steps[t] > 0 ? 1 : 0);
    const ball: Ball = { index: this.balls.length, path, upCount, age: 0, landed: false, bin: upCount[path.steps.length], slot: -1 };
    this.balls.push(ball);
    this.mesh.count = this.balls.length;
    if (instant) this.land(ball);
  }

  /**
   * Keep the stack scale at least as tall as `expectedMax` (the overlay's tallest value), so
   * stacks and overlay always share one scale.
   */
  setScaleFloor(expectedMax: number): void {
    const scaleCount = Math.max(1, expectedMax, ...this.bins.map((b) => b.length));
    if (scaleCount === this.scaleCount) return;
    this.scaleCount = scaleCount;
    this.unit = this.mapping.stackUnit(scaleCount);
    this.landedDirty = true;
  }

  /** Advance flights by dt seconds of playback (already multiplied by speed). */
  update(dt: number, reducedMotion: boolean): void {
    const n = this.mapping.n;
    const duration = TIMING.entry + n * TIMING.step + TIMING.fall;
    for (let i = 0; i < this.balls.length; i++) {
      const ball = this.balls[i];
      if (ball.landed) continue;
      ball.age += dt;
      if (ball.age >= duration) this.land(ball);
      else this.writeFlying(i, ball, reducedMotion);
    }
    this.flush();
  }

  /** Re-lays every landed ball if the stack scale changed, and uploads instance data. */
  flush(): void {
    if (this.landedDirty) {
      for (let i = 0; i < this.balls.length; i++) if (this.balls[i].landed) this.writeLanded(i, this.balls[i]);
      this.landedDirty = false;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Ball index at a landed position, or −1. */
  ballAt(bin: number, slot: number): number {
    const stack = this.bins[bin];
    // Allow one slot of slack above the top so the top ball is easy to hit.
    if (!stack?.length || slot < 0 || slot > stack.length) return -1;
    return stack[Math.min(slot, stack.length - 1)];
  }

  path(index: number): Path | undefined {
    return this.balls[index]?.path;
  }

  select(index: number): void {
    const previous = this.selected;
    this.selected = index;
    for (const i of [previous, index]) {
      const ball = this.balls[i];
      if (ball?.landed) this.writeLanded(i, ball);
    }
    this.flush();
  }

  private land(ball: Ball): void {
    ball.landed = true;
    ball.slot = this.bins[ball.bin].length;
    this.bins[ball.bin].push(ball.index);
    this.landedCount++;
    if (this.bins[ball.bin].length > this.scaleCount) {
      this.scaleCount = this.bins[ball.bin].length;
      this.unit = this.mapping.stackUnit(this.scaleCount);
      this.landedDirty = true;
    }
    this.writeLanded(ball.index, ball);
  }

  private writeLanded(index: number, ball: Ball): void {
    const r = this.mapping.ballRadius;
    const isSelected = index === this.selected;
    const xz = isSelected ? r * 1.6 : r;
    this.position.set(this.mapping.binX(ball.bin), this.mapping.stackY(ball.slot, this.unit), isSelected ? 0.05 : 0);
    // Stacks compress as counts grow: each ball becomes a coin exactly one stack unit tall.
    this.scale.set(xz, Math.min(r, this.unit / 2), xz);
    this.mesh.setMatrixAt(index, this.matrix.compose(this.position, this.identity, this.scale));
    const final = ball.path.final;
    this.mesh.setColorAt(index, isSelected ? colorAccent : final > 0 ? colorUp : final < 0 ? colorDown : colorNeutral);
  }

  private writeFlying(index: number, ball: Ball, reducedMotion: boolean): void {
    const m = this.mapping;
    const r = m.ballRadius;
    let p: Point;
    let squash = 1;
    let color = colorNeutral;
    const tStep = ball.age - TIMING.entry;
    const n = m.n;
    if (tStep < 0) {
      const u = ball.age / TIMING.entry;
      const from = m.dropStart();
      const to = m.ballAt(0, 0);
      p = { x: to.x, y: from.y + (to.y - from.y) * u * u };
    } else if (tStep < n * TIMING.step) {
      const t = Math.floor(tStep / TIMING.step);
      const u = tStep / TIMING.step - t;
      const from = m.ballAt(t, ball.upCount[t]);
      const to = m.ballAt(t + 1, ball.upCount[t + 1]);
      const arc = reducedMotion ? 0 : m.hop * 4 * u * (1 - u);
      p = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u + arc };
      if (!reducedMotion && u < 0.15) squash = 0.75 + (0.25 * u) / 0.15;
      color = ball.path.steps[t] > 0 ? colorUp : colorDown;
    } else {
      const u = (tStep - n * TIMING.step) / TIMING.fall;
      const from = m.ballAt(n, ball.bin);
      const to = m.stackY(this.bins[ball.bin].length, this.unit);
      p = { x: from.x, y: from.y + (to - from.y) * u * u };
      color = ball.path.steps[n - 1] > 0 ? colorUp : colorDown;
    }
    this.position.set(p.x, p.y, 0.02);
    this.scale.set(r / Math.sqrt(squash), r * squash, r / Math.sqrt(squash));
    this.mesh.setMatrixAt(index, this.matrix.compose(this.position, this.identity, this.scale));
    this.mesh.setColorAt(index, color);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
