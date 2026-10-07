import * as THREE from 'three';
import { copy } from '../../content/copy';
import { pricePath, type Path } from '../../model/process';
import { palette } from '../../world/shared/palette';
import { label } from './histogram';
import { BoardMapping, FRAME } from './mapping';

/** Seconds for the price line to unroll. */
const UNROLL_SECONDS = 0.8;
export const S0 = 100;

const colorUp = new THREE.Color(palette.up);
const colorDown = new THREE.Color(palette.down);

/**
 * The inspected ball: its route through the pegs on the board, and its price S_t over t on the
 * panel beside the board. Segment color = step direction (warm up, cool down).
 */
export class PriceLine {
  readonly group = new THREE.Group();
  private readonly frame: THREE.LineSegments;
  private readonly line: THREE.LineSegments;
  private readonly trace: THREE.Line;
  private readonly labels = new THREE.Group();
  private readonly empty = label(copy().stock.empty, 'scene-label strong');
  private progress = 1;
  private n: number;
  /** True when the selected path needed a wider scale than the default ±3 sd. */
  scaleExtended = false;

  constructor(private readonly mapping: BoardMapping) {
    this.group.name = 'PriceLine';
    this.n = mapping.n;
    const { left, right, top, bottom } = FRAME.price;
    const frameGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(left, bottom, 0), new THREE.Vector3(left, top, 0),
      new THREE.Vector3(left, bottom, 0), new THREE.Vector3(right, bottom, 0),
      new THREE.Vector3(left, mapping.priceY(0, 1), 0), new THREE.Vector3(right, mapping.priceY(0, 1), 0),
    ]);
    this.frame = new THREE.LineSegments(frameGeometry, new THREE.LineBasicMaterial({ color: palette.guide }));

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.n * 2 * 3), 3));
    lineGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.n * 2 * 3), 3));
    this.line = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ vertexColors: true }));

    const traceGeometry = new THREE.BufferGeometry();
    traceGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((this.n + 1) * 3), 3));
    this.trace = new THREE.Line(traceGeometry, new THREE.LineBasicMaterial({ color: palette.accent }));
    this.line.frustumCulled = this.trace.frustumCulled = false;

    const caption = label(copy().stock.panelCaption(this.n));
    caption.position.set((left + right) / 2, top + 0.5, 0);
    this.empty.position.set((left + right) / 2, mapping.priceY(0, 1) + 1, 0);
    this.group.add(this.frame, this.line, this.trace, this.labels, caption, this.empty);
    this.clear();
  }

  /** Shows `path`. `typicalHalfRange` is the default log-price half-range (shared by all balls). */
  show(path: Path, sigmaStep: number, typicalHalfRange: number): void {
    const m = this.mapping;
    const prices = pricePath(path, S0);
    let maxAbs = 0;
    for (const l of path.logPrice) maxAbs = Math.max(maxAbs, Math.abs(l));
    this.scaleExtended = maxAbs > typicalHalfRange;
    const half = Math.max(typicalHalfRange, maxAbs * 1.05, sigmaStep);

    const position = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const color = this.line.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let t = 0; t < this.n; t++) {
      const c = path.steps[t] > 0 ? colorUp : colorDown;
      position.setXYZ(2 * t, m.priceX(t), m.priceY(path.logPrice[t], half), 0.05);
      position.setXYZ(2 * t + 1, m.priceX(t + 1), m.priceY(path.logPrice[t + 1], half), 0.05);
      color.setXYZ(2 * t, c.r, c.g, c.b);
      color.setXYZ(2 * t + 1, c.r, c.g, c.b);
    }
    position.needsUpdate = color.needsUpdate = true;

    const tracePosition = this.trace.geometry.getAttribute('position') as THREE.BufferAttribute;
    let k = 0;
    for (let t = 0; t <= this.n; t++) {
      const p = m.ballAt(t, k);
      tracePosition.setXYZ(t, p.x, p.y, 0.08);
      if (t < this.n && path.steps[t] > 0) k++;
    }
    tracePosition.needsUpdate = true;

    this.setAxisLabels(half, prices[this.n]);
    this.progress = 0;
    this.line.visible = this.trace.visible = true;
    this.empty.visible = false;
    this.applyProgress();
  }

  clear(): void {
    this.line.visible = this.trace.visible = false;
    this.empty.visible = true;
    this.scaleExtended = false;
    this.setAxisLabels(null, null);
  }

  update(dt: number, reducedMotion: boolean): void {
    if (this.progress >= 1) return;
    this.progress = reducedMotion ? 1 : Math.min(1, this.progress + dt / UNROLL_SECONDS);
    this.applyProgress();
  }

  private applyProgress(): void {
    const steps = Math.ceil(this.progress * this.n);
    this.line.geometry.setDrawRange(0, steps * 2);
    this.trace.geometry.setDrawRange(0, steps + 1);
  }

  private setAxisLabels(half: number | null, final: number | null): void {
    this.labels.clear();
    const m = this.mapping;
    const { left, right, bottom } = FRAME.price;
    const add = (text: string, x: number, y: number, strong = false): void => {
      const item = label(text, strong ? 'scene-label strong' : 'scene-label');
      item.position.set(x, y, 0);
      this.labels.add(item);
    };
    const text = copy().stock;
    add(text.price(S0), left - 0.7, m.priceY(0, 1));
    add(text.day(0), left, bottom - 0.4);
    add(text.day(this.n), right, bottom - 0.4);
    if (half !== null) {
      add(text.price(S0 * Math.exp(half)), left - 0.7, m.priceY(half, half));
      add(text.price(S0 * Math.exp(-half)), left - 0.7, m.priceY(-half, half));
    }
    if (final !== null && half !== null) add(text.price(final), right + 0.8, m.priceY(Math.log(final / S0), half), true);
  }

  dispose(): void {
    this.labels.clear();
    this.group.traverse((object) => {
      if (object instanceof THREE.Line) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
    this.group.clear();
  }
}
