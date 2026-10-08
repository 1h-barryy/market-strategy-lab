import * as THREE from 'three';
import type { BoardMapping } from '../chapters/board/mapping';
import { disposeObject } from '../core/Renderer';
import { BOARD_FRAME as FRAME } from '../world/shared/layout';
import { palette } from '../world/shared/palette';
import { addMesh, box, printedLabel, rod, roundedBox } from './geometry';
import { instrumentMaterials, luminous } from './materials';
import { ART_SCALE as S, GLOW, art } from './palette';

/**
 * The channel the balls run in: a translucent rear guide and a glass front guard, as in the
 * sandbox. Balls, overlay and route lines all sit between them (z ≈ 0 … 0.3).
 */
export const CHANNEL = { rearZ: -0.4, frontZ: 0.4 } as const;

/** Seconds of the source pulse after a release (sandbox: 0.38). */
export const SOURCE_PULSE_SECONDS = 0.38;
/** Share of each step during which a ball touches its peg and the contact ring shows (sandbox 0.12 / 0.52 s). */
export const CONTACT_SHARE = 0.23;

const FLOOR = FRAME.binBottom - 0.15;

/**
 * The sandbox's Luminous Quant Instrument, fitted to the project's board (n rows, n + 1 bins,
 * tall bins for stacks): tapered rear guide and glass front guard, ceramic and sage rails, side
 * walls and clips, capped cylindrical pegs, row calibration tabs along the edge, a source funnel
 * with a glowing orb, a graphite tray, bin pockets with separators and per-bin signal strips.
 * Geometry comes from the board mapping; nothing here affects where balls go.
 */
export class Instrument extends THREE.Group {
  private readonly materials = instrumentMaterials();
  private readonly signals: THREE.MeshStandardMaterial[] = [];
  private readonly signalAge: number[] = [];
  private readonly sourceLight: THREE.PointLight;
  private readonly off = new THREE.Color(art.signalOff);

  constructor(private readonly mapping: BoardMapping) {
    super();
    this.name = 'Board';
    const m = this.materials;
    const { n, dx, dy } = mapping;
    const { rearZ, frontZ } = CHANNEL;
    const topY = FRAME.pegTop - 0.5 * dy;
    const guideTop = topY + 1.26 * dy;
    const topHalf = Math.max(0.45, 0.95 * dx);
    const bottomHalf = FRAME.width / 2 + 0.12;
    const halfWidthAt = (y: number): number =>
      y <= FRAME.binTop ? bottomHalf : topHalf + ((guideTop - y) / (guideTop - FRAME.binTop)) * (bottomHalf - topHalf);
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // Rear guide and front guard: one continuous channel, tapered over the pegs, straight down the bins.
    const outline = new THREE.Shape();
    outline.moveTo(-topHalf, guideTop);
    outline.lineTo(-bottomHalf, FRAME.binTop);
    outline.lineTo(-bottomHalf, FRAME.binBottom);
    outline.lineTo(bottomHalf, FRAME.binBottom);
    outline.lineTo(bottomHalf, FRAME.binTop);
    outline.lineTo(topHalf, guideTop);
    outline.closePath();
    const plate = 0.025 * S;
    for (const [z, material] of [[rearZ, m.rear], [frontZ, m.front]] as const) {
      const guide = addMesh(this, new THREE.ExtrudeGeometry(outline, { depth: plate, bevelEnabled: false, steps: 1 }), material, 0, 0, z - plate / 2);
      guide.castShadow = guide.receiveShadow = false;
      guide.renderOrder = z > 0 ? 5 : -2;
    }

    for (const sign of [-1, 1]) {
      const top = v(sign * topHalf, guideTop, 0);
      const knee = v(sign * bottomHalf, FRAME.binTop, 0);
      const foot = v(sign * bottomHalf, FRAME.binBottom, 0);
      // Ceramic rear rail plus a thinner sage front rail make the depth legible.
      for (const [z, radius, material] of [[rearZ, 0.062 * S, m.ceramic], [frontZ, 0.036 * S, m.sage]] as const) {
        rod(this, top.clone().setZ(z), knee.clone().setZ(z), radius, material);
        rod(this, knee.clone().setZ(z), foot.clone().setZ(z), radius, material);
      }
      const t = 0.018 * S;
      const wall = new THREE.Shape();
      wall.moveTo(top.x - t, top.y);
      wall.lineTo(knee.x - t, knee.y);
      wall.lineTo(foot.x - t, foot.y);
      wall.lineTo(foot.x + t, foot.y);
      wall.lineTo(knee.x + t, knee.y);
      wall.lineTo(top.x + t, top.y);
      wall.closePath();
      addMesh(this, new THREE.ExtrudeGeometry(wall, { depth: frontZ - rearZ, bevelEnabled: false }), m.sage, 0, 0, rearZ);
      // Edge clips at the sandbox's four heights along the guide.
      for (const share of [0.109, 0.358, 0.608, 0.857]) {
        const y = FRAME.binBottom + share * (guideTop - FRAME.binBottom);
        box(this, [0.14 * S, 0.085 * S, frontZ - rearZ + 0.14], [sign * halfWidthAt(y), y, 0], m.graphite, 0.018 * S);
      }
    }
    for (const z of [rearZ - 0.06 * S, frontZ + 0.06 * S]) box(this, [2 * topHalf + 0.1, 0.07 * S, 0.05 * S], [0, guideTop, z], m.sage, 0.016 * S);

    // Pegs span the channel; each carries a small sage cap on the front.
    const pegCount = (n * (n + 1)) / 2;
    const length = frontZ - rearZ - 0.02;
    const pegs = new THREE.InstancedMesh(new THREE.CylinderGeometry(mapping.pegRadius, mapping.pegRadius, length, 12), m.peg, pegCount);
    const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(mapping.pegRadius * 0.52, mapping.pegRadius * 0.52, 0.012 * S, 10), m.sage, pegCount);
    pegs.name = 'Pegs';
    const dummy = new THREE.Object3D();
    dummy.rotation.x = Math.PI / 2;
    let i = 0;
    for (let row = 0; row < n; row++) {
      for (let j = 0; j <= row; j++) {
        const { x, y } = mapping.peg(row, j);
        dummy.position.set(x, y, 0);
        dummy.updateMatrix();
        pegs.setMatrixAt(i, dummy.matrix);
        dummy.position.z = frontZ - 0.02;
        dummy.updateMatrix();
        caps.setMatrixAt(i++, dummy.matrix);
      }
    }
    pegs.castShadow = pegs.receiveShadow = true;
    this.add(pegs, caps);

    // Row calibration follows the tapered edge: a graphite tab, a sage tick and the row number.
    for (let row = 0; row < n; row++) {
      const y = mapping.peg(row, 0).y;
      const x = -halfWidthAt(y);
      box(this, [0.41 * S, Math.min(0.16 * S, dy * 0.8), 0.032 * S], [x - 0.2 * S, y, frontZ - 0.01], m.graphite, 0.018 * S);
      box(this, [0.08 * S, 0.015 * S, 0.025 * S], [x - 0.04 * S, y, frontZ + 0.015], m.sage, 0.003);
      printedLabel(this, String(row + 1).padStart(2, '0'), x - 0.25 * S, y, frontZ + 0.03, 0.21 * S, Math.min(0.125 * S, dy * 0.6));
    }
    // A faint dashed center line on the rear guide.
    const dashes: number[] = [];
    for (let y = FRAME.binTop + 0.15; y < guideTop - 0.1; y += 0.2 * S) dashes.push(y);
    const dashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012 * S, 0.068 * S, 0.01), m.ink, dashes.length);
    dashes.forEach((y, k) => dashMesh.setMatrixAt(k, new THREE.Matrix4().makeTranslation(0, y, rearZ + 0.02 * S)));
    this.add(dashMesh);

    // Emitter: an open reservoir and a short throat down to the guide, with a glowing source orb.
    const sourceY = FRAME.dropHeight;
    const funnelMaterial = m.ceramic.clone();
    funnelMaterial.side = THREE.DoubleSide;
    addMesh(this, new THREE.CylinderGeometry(0.34 * S, 0.12 * S, 0.4 * S, 10, 1, true), funnelMaterial, 0, sourceY + 0.16 * S, 0);
    const collar = addMesh(this, new THREE.TorusGeometry(0.335 * S, 0.036 * S, 8, 24), m.sage, 0, sourceY + 0.36 * S, 0);
    collar.rotation.x = Math.PI / 2;
    const source = addMesh(this, new THREE.SphereGeometry(0.085 * S, 12, 10), m.source, 0, sourceY + 0.04 * S, 0);
    source.castShadow = false;
    const throatTop = sourceY - 0.04 * S;
    for (const sign of [-1, 1]) box(this, [0.035 * S, throatTop - guideTop, 0.43 * S], [sign * 0.14 * S, (throatTop + guideTop) / 2, 0], m.sage, 0.012 * S);
    this.sourceLight = new THREE.PointLight(palette.up, 0.7 * S * S, 2.1 * S);
    this.sourceLight.position.set(0, sourceY + 0.02 * S, 0.3 * S);
    this.add(this.sourceLight);

    // Bins: a graphite tray, alternating pocket floors, separators, a rear wall and a low front lip.
    const tray = box(this, [FRAME.width + 1.0 * S, 0.15, 1.34 * S], [0, FLOOR + 0.075, 0.04 * S], m.graphite, 0.06);
    tray.name = 'Floor';
    const trayFront = 0.04 * S + 0.67 * S;
    const wallHeight = FRAME.binTop - FRAME.binBottom;
    const floors = [new THREE.InstancedMesh(roundedBox([dx * 0.96, 0.03, frontZ - rearZ], 0.01), m.feet, n + 1), new THREE.InstancedMesh(roundedBox([dx * 0.96, 0.03, frontZ - rearZ], 0.01), m.sage, n + 1)];
    const lips = new THREE.InstancedMesh(roundedBox([dx * 0.96, 0.055 * S, 0.07 * S], 0.014 * S), m.ceramic, n + 1);
    const counts = [0, 0];
    const matrix = new THREE.Matrix4();
    for (let k = 0; k <= n; k++) {
      const x = mapping.binX(k);
      floors[k % 2].setMatrixAt(counts[k % 2]++, matrix.makeTranslation(x, FRAME.binBottom - 0.014, 0));
      lips.setMatrixAt(k, matrix.makeTranslation(x, FRAME.binBottom + 0.0275 * S, frontZ - 0.05));
      const signal = luminous(palette.accent, 0);
      signal.color.copy(this.off);
      const strip = addMesh(this, new THREE.BoxGeometry(dx * 0.48, 0.017 * S * 2, 0.012 * S), signal, x, FLOOR + 0.075, trayFront + 0.01);
      strip.castShadow = false;
      this.signals.push(signal);
      this.signalAge.push(Infinity);
    }
    floors.forEach((mesh, k) => {
      mesh.count = counts[k];
      mesh.receiveShadow = true;
    });
    lips.castShadow = lips.receiveShadow = true;
    const separators = new THREE.InstancedMesh(roundedBox([0.031 * S, wallHeight, frontZ - rearZ], 0.01), m.sage, n + 2);
    separators.name = 'BinWalls';
    for (let k = 0; k <= n + 1; k++) separators.setMatrixAt(k, matrix.makeTranslation(mapping.binX(k) - dx / 2, FRAME.binBottom + wallHeight / 2, 0));
    separators.castShadow = separators.receiveShadow = true;
    this.add(...floors, lips, separators);
    box(this, [FRAME.width, wallHeight, 0.045 * S], [0, FRAME.binBottom + wallHeight / 2, rearZ + 0.03], m.feet, 0.014 * S);
  }

  /** Frees geometry, materials and the printed labels' textures. */
  dispose(): void {
    this.traverse((object) => {
      if (object instanceof THREE.Mesh) (object.material as THREE.MeshBasicMaterial).map?.dispose();
    });
    disposeObject(this);
  }

  /** Lights bin `bin`'s signal strip in the landed stock's color; it fades as in the sandbox. */
  flash(bin: number, color: THREE.Color): void {
    const signal = this.signals[bin];
    if (!signal) return;
    signal.color.copy(color);
    signal.emissive.copy(color);
    this.signalAge[bin] = 0;
  }

  /** Signal fades and the source pulse (0..1, from balls just released). Visual only. */
  update(dt: number, sourcePulse: number): void {
    this.signals.forEach((signal, k) => {
      if (this.signalAge[k] === Infinity) return;
      this.signalAge[k] += dt;
      const level = GLOW.signal * (1 - this.signalAge[k] / GLOW.signalFade);
      if (level <= 0) {
        this.signalAge[k] = Infinity;
        signal.emissiveIntensity = 0;
        signal.color.copy(this.off);
      } else {
        signal.emissiveIntensity = level;
      }
    });
    this.materials.source.emissiveIntensity = GLOW.source + sourcePulse * GLOW.sourcePulse;
    this.sourceLight.intensity = (0.3 + sourcePulse * 0.75) * S * S;
  }
}
