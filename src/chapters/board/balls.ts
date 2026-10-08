import * as THREE from 'three';
import type { Path } from '../../model/process';
import { CHANNEL, CONTACT_SHARE, SOURCE_PULSE_SECONDS } from '../../art/instrument';
import { addGlowAttribute, luminousInstanced, pulseMaterial, trailMaterial } from '../../art/materials';
import { ART_SCALE, GLOW } from '../../art/palette';
import { palette } from '../../world/shared/palette';
import { BoardMapping, type Point } from './mapping';

/** Seconds per phase at speed 1. Playback timing only; the path itself is fixed by the model. */
const TIMING = { entry: 0.3, step: 0.16, fall: 0.35 } as const;

/**
 * Trail: dots at earlier moments of the same ball, each colored by the move it was making then.
 * 4 dots × 0.12 s cover the last ~3 days, so a chasing crowd leaves one-colored streaks and a
 * reversing crowd leaves alternating dots. It shows the ball's own history, never other balls.
 */
const TRAIL = { dots: 4, spacing: 0.12, capacity: 1600 } as const;

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

interface Pose extends Point {
  squash: number;
  color: THREE.Color;
}

const colorUp = new THREE.Color(palette.up);
const colorDown = new THREE.Color(palette.down);
const colorNeutral = new THREE.Color(palette.neutral);
const colorAccent = new THREE.Color(palette.accent);
const colorBackground = new THREE.Color(palette.background);

/**
 * Balls in flight and in the bins, drawn as one instanced mesh, plus their trails. Ball k is batch
 * path k; every left/right move it makes is that path's step sequence, played back along arcs.
 */
export class Balls {
  readonly group = new THREE.Group();
  readonly mesh: THREE.InstancedMesh;
  private readonly trail: THREE.InstancedMesh;
  /** Contact pulses: a ring on the peg a ball is touching (art sandbox). */
  private readonly rings: THREE.InstancedMesh;
  private readonly glow: THREE.InstancedBufferAttribute;
  /** 0..1 glow of the source while a ball is just released. Visual only. */
  sourcePulse = 0;
  /** Called when a ball lands during playback, with its bin and landed color. Visual only. */
  onLand?: (bin: number, color: THREE.Color) => void;
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
  private readonly tint = new THREE.Color();

  constructor(private readonly mapping: BoardMapping, capacity: number) {
    const geometry = new THREE.SphereGeometry(1, 16, 12);
    // Balls glow while falling and rest matte once landed (art sandbox: emission belongs to moving data).
    this.glow = addGlowAttribute(geometry, capacity);
    this.mesh = new THREE.InstancedMesh(geometry, luminousInstanced(0.35), capacity);
    this.mesh.name = 'Balls';
    this.trail = new THREE.InstancedMesh(geometry.clone().deleteAttribute('instanceGlow'), trailMaterial(), TRAIL.capacity);
    this.trail.name = 'BallTrails';
    const ring = new THREE.TorusGeometry(mapping.pegRadius + 0.019 * ART_SCALE, 0.009 * ART_SCALE, 6, 16);
    this.rings = new THREE.InstancedMesh(ring, pulseMaterial(), TRAIL.capacity);
    this.rings.name = 'ContactPulses';
    for (const mesh of [this.mesh, this.trail, this.rings]) {
      mesh.count = 0;
      // Instances move every frame; a cached bounding sphere would cull them wrongly.
      mesh.frustumCulled = false;
    }
    this.group.add(this.mesh, this.trail, this.rings);
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
    const duration = TIMING.entry + this.mapping.n * TIMING.step + TIMING.fall;
    let dots = 0;
    let rings = 0;
    this.sourcePulse = 0;
    for (const ball of this.balls) {
      if (ball.landed) continue;
      ball.age += dt;
      if (ball.age >= duration) {
        this.land(ball);
        this.onLand?.(ball.bin, this.landedColor(ball));
        continue;
      }
      if (ball.age < SOURCE_PULSE_SECONDS) this.sourcePulse = Math.max(this.sourcePulse, Math.sin((Math.PI * ball.age) / SOURCE_PULSE_SECONDS));
      const tStep = (ball.age - TIMING.entry) / TIMING.step;
      if (!reducedMotion && tStep >= 0 && tStep < this.mapping.n && tStep % 1 < CONTACT_SHARE && rings < TRAIL.capacity) {
        const t = Math.floor(tStep);
        const peg = this.mapping.peg(t, ball.upCount[t]);
        this.position.set(peg.x, peg.y, CHANNEL.frontZ + 0.024 * ART_SCALE);
        this.rings.setMatrixAt(rings, this.matrix.makeTranslation(this.position));
        this.rings.setColorAt(rings++, ball.path.steps[t] > 0 ? colorUp : colorDown);
      }
      this.writePose(this.mesh, ball.index, this.pose(ball, ball.age, reducedMotion), 1);
      for (let i = 1; i <= TRAIL.dots && dots < TRAIL.capacity; i++) {
        const age = ball.age - i * TRAIL.spacing;
        if (age < TIMING.entry) break;
        const pose = this.pose(ball, age, reducedMotion);
        pose.color = this.tint.copy(pose.color).lerp(colorBackground, 0.18 * i);
        this.writePose(this.trail, dots++, pose, 0.7 - 0.1 * i);
      }
    }
    this.trail.count = dots;
    this.rings.count = rings;
    this.flush();
  }

  /** Lands every ball still in flight at once (e.g. when the board stops being the active chapter). */
  landAll(): void {
    for (const ball of this.balls) if (!ball.landed) this.land(ball);
    this.trail.count = this.rings.count = 0;
    this.sourcePulse = 0;
    this.flush();
  }

  /** Re-lays every landed ball if the stack scale changed, and uploads instance data. */
  flush(): void {
    if (this.landedDirty) {
      for (const ball of this.balls) if (ball.landed) this.writeLanded(ball);
      this.landedDirty = false;
    }
    this.glow.needsUpdate = true;
    for (const mesh of [this.mesh, this.trail, this.rings]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
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
      if (ball?.landed) this.writeLanded(ball);
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
    this.writeLanded(ball);
  }

  private writeLanded(ball: Ball): void {
    const r = this.mapping.ballRadius;
    const isSelected = ball.index === this.selected;
    const xz = isSelected ? r * 1.6 : r;
    this.position.set(this.mapping.binX(ball.bin), this.mapping.stackY(ball.slot, this.unit), isSelected ? 0.05 : 0);
    // Stacks compress as counts grow: each ball becomes a coin exactly one stack unit tall.
    this.scale.set(xz, Math.min(r, this.unit / 2), xz);
    this.mesh.setMatrixAt(ball.index, this.matrix.compose(this.position, this.identity, this.scale));
    this.mesh.setColorAt(ball.index, isSelected ? colorAccent : this.landedColor(ball));
    this.glow.setX(ball.index, isSelected ? GLOW.selection : 0);
  }

  /** Landed color: up or down overall. */
  private landedColor(ball: Ball): THREE.Color {
    const final = ball.path.final;
    return final > 0 ? colorUp : final < 0 ? colorDown : colorNeutral;
  }

  /** Where a flying ball is at `age`, and its color: the direction of the move it is making. */
  private pose(ball: Ball, age: number, flat: boolean): Pose {
    const m = this.mapping;
    const n = m.n;
    const tStep = age - TIMING.entry;
    if (tStep < 0) {
      const u = age / TIMING.entry;
      const from = m.dropStart();
      const to = m.ballAt(0, 0);
      return { x: to.x, y: from.y + (to.y - from.y) * u * u, squash: 1, color: colorNeutral };
    }
    if (tStep < n * TIMING.step) {
      const t = Math.floor(tStep / TIMING.step);
      const u = tStep / TIMING.step - t;
      const from = m.ballAt(t, ball.upCount[t]);
      const to = m.ballAt(t + 1, ball.upCount[t + 1]);
      const arc = flat ? 0 : m.hop * 4 * u * (1 - u);
      const squash = !flat && u < 0.15 ? 0.75 + (0.25 * u) / 0.15 : 1;
      const color = ball.path.steps[t] > 0 ? colorUp : colorDown;
      return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u + arc, squash, color };
    }
    const u = (tStep - n * TIMING.step) / TIMING.fall;
    const from = m.ballAt(n, ball.bin);
    const to = m.stackY(this.bins[ball.bin].length, this.unit);
    return { x: from.x, y: from.y + (to - from.y) * u * u, squash: 1, color: ball.path.steps[n - 1] > 0 ? colorUp : colorDown };
  }

  private writePose(mesh: THREE.InstancedMesh, index: number, pose: Pose, size: number): void {
    const r = this.mapping.ballRadius * size;
    this.position.set(pose.x, pose.y, mesh === this.trail ? 0.01 : 0.02);
    this.scale.set(r / Math.sqrt(pose.squash), r * pose.squash, r / Math.sqrt(pose.squash));
    mesh.setMatrixAt(index, this.matrix.compose(this.position, this.identity, this.scale));
    mesh.setColorAt(index, pose.color);
    if (mesh === this.mesh) this.glow.setX(index, GLOW.particle);
  }

  dispose(): void {
    for (const mesh of [this.mesh, this.trail, this.rings]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
  }
}
