import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { palette } from '../../world/shared/palette';
import { BoardMapping, FRAME } from './mapping';

export function label(text: string, className = 'scene-label'): CSS2DObject {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return new CSS2DObject(element);
}

/**
 * Analytic ρ = 0 overlay: expected count per bin, Binomial(n, π) × landed balls, on the stacks' scale.
 * Drawn as a short bar over each bin joined by a thin polyline. Also labels bins with log-returns.
 */
export class BinomialOverlay {
  readonly group = new THREE.Group();
  private readonly ticks: THREE.LineSegments;
  private readonly curve: THREE.Line;
  private readonly labels = new THREE.Group();

  constructor(private readonly mapping: BoardMapping) {
    this.group.name = 'BinomialOverlay';
    const bins = mapping.n + 1;
    const material = new THREE.LineBasicMaterial({ color: palette.neutral, transparent: true, opacity: 0.9 });
    const tickGeometry = new THREE.BufferGeometry();
    tickGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bins * 2 * 3), 3));
    this.ticks = new THREE.LineSegments(tickGeometry, material);
    const curveGeometry = new THREE.BufferGeometry();
    curveGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bins * 3), 3));
    this.curve = new THREE.Line(curveGeometry, new THREE.LineBasicMaterial({ color: palette.neutral, transparent: true, opacity: 0.35 }));
    this.ticks.frustumCulled = this.curve.frustumCulled = false;
    this.group.add(this.ticks, this.curve, this.labels);
    this.group.visible = false;
  }

  /** Expected counts per bin and the stack unit they are drawn with. */
  update(expected: readonly number[], unit: number): void {
    const m = this.mapping;
    const ticks = this.ticks.geometry.getAttribute('position') as THREE.BufferAttribute;
    const curve = this.curve.geometry.getAttribute('position') as THREE.BufferAttribute;
    const half = m.dx * 0.42;
    expected.forEach((count, k) => {
      const x = m.binX(k);
      const y = m.countY(count, unit);
      ticks.setXYZ(2 * k, x - half, y, 0.1);
      ticks.setXYZ(2 * k + 1, x + half, y, 0.1);
      curve.setXYZ(k, x, y, 0.1);
    });
    ticks.needsUpdate = curve.needsUpdate = true;
    this.group.visible = expected.some((c) => c > 0);
  }

  /** Log-return labels under the bins (at most ~7, always including the center). */
  setLabels(sigmaStep: number): void {
    this.labels.clear();
    const n = this.mapping.n;
    const every = Math.max(1, Math.ceil((n + 1) / 7));
    for (let k = n % 2 === 0 ? (n / 2) % every : 0; k <= n; k += every) {
      const pct = this.mapping.binLogReturn(k, sigmaStep) * 100;
      const item = label(`${pct > 0 ? '+' : ''}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`);
      item.position.set(this.mapping.binX(k), FRAME.binBottom - 0.45, 0);
      this.labels.add(item);
    }
    const caption = label('final log-return per bin', 'scene-label');
    caption.position.set(0, FRAME.binBottom - 0.95, 0);
    this.labels.add(caption);
  }

  dispose(): void {
    this.labels.clear();
    this.ticks.geometry.dispose();
    this.curve.geometry.dispose();
    (this.ticks.material as THREE.Material).dispose();
    (this.curve.material as THREE.Material).dispose();
  }
}
