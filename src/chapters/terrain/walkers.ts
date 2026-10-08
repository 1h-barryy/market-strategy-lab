import * as THREE from 'three';
import type { Path } from '../../model/process';
import { addGlowAttribute, luminousInstanced } from '../../art/materials';
import { GLOW } from '../../art/palette';
import { palette } from '../../world/shared/palette';
import { EXTENT, type TerrainMapping } from './mapping';

/** Days per second a walker covers, and the pause at the far end before it starts again. */
const PACE = { daysPerSecond: 30, pause: 1.2 } as const;

const colorUp = new THREE.Color(palette.up);
const colorDown = new THREE.Color(palette.down);

/**
 * A few stocks walking their own 250-day paths across the terrain as glowing points (path i of the
 * batch, i = 0..count−1). Color = the move they are making, as on the board. Hidden while off the map.
 */
export class Walkers {
  readonly mesh: THREE.InstancedMesh;
  private time = 0;
  private paths: readonly Path[] = [];
  private readonly matrix = new THREE.Matrix4();

  constructor(private readonly mapping: TerrainMapping, private readonly count = 5) {
    const radius = mapping.unit * 1.6;
    // Moving data glows in its own color (art sandbox `luminous`).
    const geometry = new THREE.SphereGeometry(radius, 12, 8);
    addGlowAttribute(geometry, count, GLOW.particle);
    this.mesh = new THREE.InstancedMesh(geometry, luminousInstanced(), count);
    this.mesh.name = 'Walkers';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  setPaths(paths: readonly Path[]): void {
    this.paths = paths.slice(0, this.count);
    this.mesh.count = this.paths.length;
  }

  /** Places each walker on the surface; `heightAt` gives the local surface height under it. */
  update(dt: number, heightAt: (day: number, position: number) => number, floor: number): void {
    const m = this.mapping;
    const cycle = m.days / PACE.daysPerSecond + PACE.pause;
    this.time = (this.time + dt) % cycle;
    this.paths.forEach((path, i) => {
      // Stagger the walkers so they don't move in lockstep.
      const day = Math.min(m.days, ((this.time + (i * cycle) / this.count) % cycle) * PACE.daysPerSecond);
      const whole = Math.floor(day);
      let position = 0;
      for (let t = 0; t < whole; t++) position += path.steps[t];
      const step = path.steps[Math.min(whole, path.steps.length - 1)];
      const exact = position + (day - whole) * (whole < path.steps.length ? step : 0);
      const visible = Math.abs(exact) <= EXTENT;
      const y = floor + heightAt(day, exact) + m.unit * 1.6;
      this.matrix.makeTranslation(m.x(exact), y, m.z(day));
      if (!visible) this.matrix.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, step > 0 ? colorUp : colorDown);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}
