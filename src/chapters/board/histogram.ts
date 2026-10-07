import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { copy } from '../../content/copy';
import { palette } from '../../world/shared/palette';
import { BoardMapping, FRAME } from './mapping';

export function label(text: string, className = 'scene-label'): CSS2DObject {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return new CSS2DObject(element);
}

/**
 * Analytic ρ = 0 overlay ("If the crowd ignored yesterday"): expected count per bin,
 * Binomial(n, π) × landed balls, on the stacks' scale. Drawn as a short bar over each bin joined by
 * a thin polyline, with a legend at its peak. Also labels bins with % price change.
 */
export class BinomialOverlay {
  readonly group = new THREE.Group();
  /** The overlay itself; hidden until stocks land. Bin labels sit outside it and always show. */
  private readonly lines = new THREE.Group();
  private readonly ticks: THREE.LineSegments;
  private readonly curve: THREE.Line;
  private readonly labels = new THREE.Group();
  private readonly legend = label(copy().board.outline, 'scene-label strong outline-label');

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
    this.lines.add(this.ticks, this.curve, this.legend);
    this.lines.visible = false;
    this.group.add(this.lines, this.labels);
  }

  /** Whether the outline's text label shows (hidden while another chapter is active). */
  showLegend = true;

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
    this.lines.visible = expected.some((c) => c > 0);
    const peak = expected.indexOf(Math.max(...expected));
    this.legend.position.set(m.binX(peak) + m.dx * 0.5, m.countY(expected[peak], unit) + 0.35, 0.1);
    this.legend.visible = this.lines.visible && this.showLegend;
  }

  /** % price-change labels under the bins (at most ~7, always including the center). */
  setLabels(sigmaStep: number): void {
    this.labels.clear();
    const n = this.mapping.n;
    const text = copy().board;
    const every = Math.max(1, Math.ceil((n + 1) / 7));
    for (let k = n % 2 === 0 ? (n / 2) % every : 0; k <= n; k += every) {
      const item = label(text.percent(this.mapping.binPriceChange(k, sigmaStep)));
      item.position.set(this.mapping.binX(k), FRAME.binBottom - 0.45, 0);
      this.labels.add(item);
    }
    const caption = label(text.binsCaption(n), 'scene-label');
    caption.position.set(0, FRAME.binBottom - 0.95, 0);
    this.labels.add(caption);
  }

  dispose(): void {
    this.labels.clear();
    this.legend.removeFromParent();
    this.ticks.geometry.dispose();
    this.curve.geometry.dispose();
    (this.ticks.material as THREE.Material).dispose();
    (this.curve.material as THREE.Material).dispose();
  }
}
