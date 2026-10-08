import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { copy } from '../../content/copy';
import { palette } from '../../world/shared/palette';
import { EXTENT, FIRST_DAY, TerrainMapping } from './mapping';

/** Everything the terrain draws, already computed from the model. */
export interface TerrainData {
  /** Relative heights (see mapping.ts), rows FIRST_DAY..days × columns. */
  terrain: Float32Array;
  ghost: Float32Array;
  /** Share of stocks beyond the left / right edge, per day 0..days. */
  below: Float64Array;
  above: Float64Array;
  /** Middle-half bounds per day 0..days, in steps (terrain from the batch, ghost exact). */
  quartiles: { terrain: [Float64Array, Float64Array]; ghost: [Float64Array, Float64Array] };
}

/** Days between the ghost's dashed ribs. */
const RIB_EVERY = 10;
/** Terrain color: dark floor where no stocks are, luminous where the density is at the ghost's peak. */
const LOW = new THREE.Color(palette.board);
const HIGH = new THREE.Color(palette.neutral);

/** Seconds for the surfaces to ease into a new shape after a crowd change (drawing only). */
const MORPH_SECONDS = 0.35;

function label(text: string, className = 'scene-label'): CSS2DObject {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return new CSS2DObject(element);
}

function gridGeometry(rows: number, columns: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rows * columns * 3), 3));
  const index: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < columns - 1; c++) {
      const a = r * columns + c;
      const b = a + columns;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  geometry.setIndex(index);
  return geometry;
}

function lineGeometry(points: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points * 3), 3));
  return geometry;
}

/**
 * Terrain and ghost surfaces, off-map ledges, floor lines, the chosen day's slice and the labels.
 * All live in `riser`, which sits on the floor so the whole terrain can rise from it on entry.
 */
export class TerrainSurfaces {
  readonly group = new THREE.Group();
  private readonly riser = new THREE.Group();
  private readonly terrain: THREE.Mesh;
  private readonly ghost: THREE.Mesh;
  private readonly ledges: [THREE.Mesh, THREE.Mesh];
  private readonly floorLines: THREE.Line[];
  private readonly sliceTerrain: THREE.Line;
  private readonly sliceGhost: THREE.Line;
  private readonly ribs: THREE.LineSegments;
  private readonly labels = new THREE.Group();
  private readonly offMapLabels: [CSS2DObject, CSS2DObject];
  private readonly current: { terrain: Float32Array; ghost: Float32Array };
  private from: { terrain: Float32Array; ghost: Float32Array };
  private target: { terrain: Float32Array; ghost: Float32Array };
  private morph = 1;
  private day = FIRST_DAY;
  private data?: TerrainData;

  constructor(readonly mapping: TerrainMapping, sigmaStep: number) {
    const m = mapping;
    this.group.name = 'Terrain';
    this.riser.position.y = m.floor;
    this.group.add(this.riser);
    const size = m.rows * m.columns;
    this.current = { terrain: new Float32Array(size), ghost: new Float32Array(size) };
    this.from = { terrain: new Float32Array(size), ghost: new Float32Array(size) };
    this.target = { terrain: new Float32Array(size), ghost: new Float32Array(size) };

    const terrainGeometry = gridGeometry(m.rows, m.columns);
    terrainGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.rows * m.columns * 3), 3));
    this.terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }));
    this.ghost = new THREE.Mesh(gridGeometry(m.rows, m.columns), new THREE.MeshBasicMaterial({ color: palette.neutral, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
    this.terrain.name = 'TerrainSurface';
    this.terrain.castShadow = this.terrain.receiveShadow = true;
    this.ghost.name = 'GhostSurface';
    this.ghost.renderOrder = 1;

    const ledgeMaterial = new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    this.ledges = [new THREE.Mesh(gridGeometry(m.days + 1, 2), ledgeMaterial), new THREE.Mesh(gridGeometry(m.days + 1, 2), ledgeMaterial)];

    const solid = new THREE.LineBasicMaterial({ color: palette.neutral });
    const dashed = new THREE.LineDashedMaterial({ color: palette.neutral, dashSize: m.unit * 3, gapSize: m.unit * 2, transparent: true, opacity: 0.7 });
    this.floorLines = [solid, solid, dashed, dashed].map((material) => new THREE.Line(lineGeometry(m.days + 1), material));
    this.sliceTerrain = new THREE.Line(lineGeometry(m.columns), new THREE.LineBasicMaterial({ color: palette.accent }));
    this.sliceGhost = new THREE.Line(lineGeometry(m.columns), dashed);
    const ribCount = Math.floor(m.days / RIB_EVERY);
    this.ribs = new THREE.LineSegments(lineGeometry(ribCount * (m.columns - 1) * 2), new THREE.LineDashedMaterial({ color: palette.neutral, dashSize: m.unit * 2, gapSize: m.unit * 1.5, transparent: true, opacity: 0.55 }));

    for (const object of [this.terrain, this.ghost, this.ribs, ...this.ledges, ...this.floorLines, this.sliceTerrain, this.sliceGhost]) {
      object.frustumCulled = false;
      this.riser.add(object);
    }

    const text = copy().terrain;
    this.offMapLabels = [label(text.labels.offMap), label(text.labels.offMap)];
    this.offMapLabels.forEach((item, i) => item.position.set(m.x((i === 0 ? -1 : 1) * (EXTENT + 6)), m.ridge * 0.4, m.z(m.days * 0.6)));
    this.labels.add(...this.offMapLabels);
    this.setAxisLabels(sigmaStep);
    this.riser.add(this.labels);
  }

  /** The labelled % change at ±distance steps, e.g. for the asymmetry note. */
  static percentAt(position: number, sigmaStep: number): string {
    return copy().board.percent(Math.expm1(sigmaStep * position));
  }

  setAxisLabels(sigmaStep: number): void {
    const m = this.mapping;
    const text = copy().terrain.labels;
    this.labels.children.filter((child) => !this.offMapLabels.includes(child as CSS2DObject)).forEach((child) => child.removeFromParent());
    // 0 is labelled by the board right in front of it.
    for (const position of [-100, -50, -25, 25, 50, 100]) {
      const item = label(TerrainSurfaces.percentAt(position, sigmaStep));
      item.position.set(m.x(position), -0.4, m.z(0) + 0.6);
      this.labels.add(item);
    }
    for (const day of [0, Math.round(m.days / 2), m.days]) {
      const item = label(text.day(day));
      item.position.set(m.x(EXTENT) + 4, 0, m.z(day));
      this.labels.add(item);
    }
    const ghost = label(text.ghost, 'scene-label strong');
    ghost.position.set(m.x(0), m.ridge + 1.2, m.z(m.days));
    this.labels.add(ghost);
  }

  /** New model output. `animate` eases the surfaces from their current shape. */
  setData(data: TerrainData, animate: boolean): void {
    this.data = data;
    this.from = { terrain: this.current.terrain.slice(), ghost: this.current.ghost.slice() };
    this.target = { terrain: data.terrain, ghost: data.ghost };
    this.morph = animate ? 0 : 1;
    if (!animate) this.writeSurfaces(1);
    this.writeLedges();
    this.writeFloorLines();
    this.setDay(this.day);
  }

  /** How far the terrain has risen from the floor (0 → flat, 1 → full height). */
  setRise(value: number): void {
    this.riser.scale.y = Math.max(1e-3, value);
  }

  get riseScale(): number {
    return this.riser.scale.y;
  }

  /** Milliseconds the last morph frame took to rewrite the surfaces (debug overlay). */
  lastMorphMs = 0;

  update(dt: number, reducedMotion: boolean): void {
    if (this.morph >= 1) return;
    const started = performance.now();
    this.morph = reducedMotion ? 1 : Math.min(1, this.morph + dt / MORPH_SECONDS);
    this.writeSurfaces(this.morph);
    this.writeFloorLines();
    this.setDay(this.day);
    this.lastMorphMs = performance.now() - started;
  }

  /** Terrain surface height (local, above the floor) at a day and a position in steps. */
  heightAt(day: number, position: number): number {
    const m = this.mapping;
    const p = Math.round(position);
    if (Math.abs(p) > EXTENT || day < FIRST_DAY) return 0;
    return this.current.terrain[m.vertex(Math.min(m.days, Math.round(day)), p)] * m.ridge;
  }

  setDay(day: number): void {
    this.day = day;
    const m = this.mapping;
    const write = (line: THREE.Line, heights: Float32Array, lift: number): void => {
      const position = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let p = -EXTENT; p <= EXTENT; p++) {
        position.setXYZ(p + EXTENT, m.x(p), heights[m.vertex(day, p)] * m.ridge + lift, m.z(day));
      }
      position.needsUpdate = true;
      line.computeLineDistances();
    };
    write(this.sliceTerrain, this.current.terrain, 0.06);
    write(this.sliceGhost, this.current.ghost, 0.1);
  }

  private writeSurfaces(u: number): void {
    const m = this.mapping;
    for (const key of ['terrain', 'ghost'] as const) {
      const heights = this.current[key];
      const from = this.from[key];
      const to = this.target[key];
      for (let i = 0; i < heights.length; i++) heights[i] = from[i] + (to[i] - from[i]) * u;
      const mesh = key === 'terrain' ? this.terrain : this.ghost;
      const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let day = FIRST_DAY; day <= m.days; day++) {
        const z = m.z(day);
        for (let p = -EXTENT; p <= EXTENT; p++) {
          const v = m.vertex(day, p);
          position.setXYZ(v, m.x(p), heights[v] * m.ridge, z);
        }
      }
      position.needsUpdate = true;
      if (key === 'terrain') {
        mesh.geometry.computeVertexNormals();
        const color = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        const c = new THREE.Color();
        for (let v = 0; v < heights.length; v++) {
          c.copy(LOW).lerp(HIGH, Math.min(1, Math.sqrt(Math.max(0, heights[v]))));
          color.setXYZ(v, c.r, c.g, c.b);
        }
        color.needsUpdate = true;
      }
    }
    this.writeRibs();
  }

  /** The ghost drawn as dashed cross-sections every RIB_EVERY days. */
  private writeRibs(): void {
    const m = this.mapping;
    const position = this.ribs.geometry.getAttribute('position') as THREE.BufferAttribute;
    let i = 0;
    for (let day = RIB_EVERY; day <= m.days; day += RIB_EVERY) {
      const z = m.z(day);
      for (let p = -EXTENT; p < EXTENT; p++) {
        const a = this.current.ghost[m.vertex(day, p)];
        const b = this.current.ghost[m.vertex(day, p + 1)];
        // Only where the ghost has height; on the empty floor the ribs would just be clutter.
        const keep = Math.max(a, b) > 0.03;
        position.setXYZ(i++, m.x(p), keep ? a * m.ridge + 0.02 : -1, z);
        position.setXYZ(i++, m.x(keep ? p + 1 : p), keep ? b * m.ridge + 0.02 : -1, z);
      }
    }
    position.needsUpdate = true;
    this.ribs.computeLineDistances();
  }

  private writeLedges(): void {
    const m = this.mapping;
    const data = this.data!;
    this.ledges.forEach((ledge, side) => {
      const shares = side === 0 ? data.below : data.above;
      const x = m.x((side === 0 ? -1 : 1) * (EXTENT + 1));
      const position = ledge.geometry.getAttribute('position') as THREE.BufferAttribute;
      let max = 0;
      for (let day = 0; day <= m.days; day++) {
        position.setXYZ(day * 2, x, 0, m.z(day));
        position.setXYZ(day * 2 + 1, x, m.ledgeY(shares[day]) - m.floor, m.z(day));
        max = Math.max(max, shares[day]);
      }
      position.needsUpdate = true;
      ledge.visible = max > 0.001;
      this.offMapLabels[side].visible = max > 0.005;
    });
  }

  /**
   * Middle-half lines, riding on their surface (terrain lines on the terrain, ghost lines on the
   * ghost) so the valley's hills don't hide them.
   */
  private writeFloorLines(): void {
    const m = this.mapping;
    const { quartiles } = this.data!;
    const series = [quartiles.terrain[0], quartiles.terrain[1], quartiles.ghost[0], quartiles.ghost[1]];
    this.floorLines.forEach((line, i) => {
      const heights = i < 2 ? this.current.terrain : this.current.ghost;
      const position = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let day = 0; day <= m.days; day++) {
        const p = Math.max(-EXTENT, Math.min(EXTENT, series[i][day]));
        const lo = Math.floor(p);
        const hi = Math.min(EXTENT, lo + 1);
        const f = p - lo;
        const h = day >= FIRST_DAY ? (heights[m.vertex(day, lo)] * (1 - f) + heights[m.vertex(day, hi)] * f) * m.ridge : 0;
        position.setXYZ(day, m.x(p), h + 0.08, m.z(day));
      }
      position.needsUpdate = true;
      line.computeLineDistances();
    });
  }

  dispose(): void {
    this.labels.clear();
    this.riser.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
    this.group.removeFromParent();
  }
}
