import * as THREE from 'three';
import { roundedBox } from '../../art/geometry';
import { matte as matteMaterial } from '../../art/materials';
import { copy } from '../../content/copy';
import { disposeObject } from '../../core/Renderer';
import { GRID_SIZE, LOOKBACKS, NERVES, cellAt } from '../../model/strategy';
import { palette } from '../../world/shared/palette';
import { label } from '../board/histogram';
import { FLOOR, TABLE, scoreScale, tableHalfWidth, tableTop, tileGlow, tileHeight, tileX, tileZ } from './mapping';

/** Seconds for tiles to settle on new heights. Visual only. */
const EASE_SECONDS = 0.5;

const matte = new THREE.Color(palette.board).multiplyScalar(1.5);
const warm = new THREE.Color(palette.up);
const cool = new THREE.Color(palette.down);

/**
 * The betting table (DESIGN.md §6.2): 36 tiles, one per rule. Height and glow are the rule's
 * practice score; the player's chosen tile carries the accent outline and its score.
 */
export class BettingTable {
  readonly group = new THREE.Group();
  /** Tile meshes, index = grid cell index; picked by the chapter. */
  readonly tiles: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly heights = new Float32Array(GRID_SIZE);
  private readonly targets = new Float32Array(GRID_SIZE);
  private readonly outline: THREE.LineSegments;
  private readonly scoreLabel = label('', 'scene-label strong tile-score');
  private selected = -1;

  constructor() {
    this.group.name = 'BettingTable';
    const halfWidth = tableHalfWidth;
    // A graphite tray like the instrument's (art sandbox: rounded, matte).
    const slab = new THREE.Mesh(roundedBox([halfWidth * 2, TABLE.slab, halfWidth * 2], 0.09), matteMaterial(palette.board));
    slab.castShadow = slab.receiveShadow = true;
    slab.position.set(TABLE.x, FLOOR + TABLE.slab / 2, TABLE.z);
    this.group.add(slab);

    const geometry = new THREE.BoxGeometry(TABLE.tile, 1, TABLE.tile).translate(0, 0.5, 0);
    for (let i = 0; i < GRID_SIZE; i++) {
      const { memory, nerve } = cellAt(i);
      const tile = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: matte, roughness: 0.55 }));
      tile.position.set(tileX(nerve), tableTop, tileZ(memory));
      tile.userData.cell = i;
      tile.castShadow = tile.receiveShadow = true;
      this.heights[i] = this.targets[i] = TABLE.base;
      tile.scale.y = TABLE.base;
      this.tiles.push(tile);
      this.group.add(tile);
    }

    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(TABLE.tile + 0.12, 1, TABLE.tile + 0.12).translate(0, 0.5, 0));
    this.outline = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: palette.accent }));
    this.outline.visible = false;
    this.scoreLabel.visible = false;
    this.group.add(this.outline, this.scoreLabel);
    this.addLabels();
  }

  private addLabels(): void {
    const text = copy().test.table;
    const left = TABLE.x - tableHalfWidth - 0.2;
    const front = TABLE.z + tableHalfWidth + 0.35;
    LOOKBACKS.forEach((days, memory) => {
      const item = label(text.days(days), 'scene-label table-label');
      item.center.set(1, 0.5);
      item.position.set(left, tableTop, tileZ(memory));
      this.group.add(item);
    });
    NERVES.forEach((multiple, nerve) => {
      const item = label(text.nerveValue(multiple), 'scene-label table-label');
      item.position.set(tileX(nerve), FLOOR, front);
      this.group.add(item);
    });
    const memory = label(text.memory, 'scene-label strong table-label');
    memory.center.set(1, 0.5);
    memory.position.set(left, tableTop, tileZ(LOOKBACKS.length - 1) - TABLE.pitch);
    const nerve = label(text.nerve, 'scene-label strong table-label');
    nerve.position.set(TABLE.x, FLOOR, front + 0.8);
    this.group.add(memory, nerve);
  }

  /** New practice scores (one direction). Heights ease to them unless `animate` is false. */
  setScores(scores: ArrayLike<number>, animate: boolean): void {
    const scale = scoreScale(scores);
    for (let i = 0; i < GRID_SIZE; i++) {
      const score = scores[i];
      this.targets[i] = tileHeight(score, scale);
      if (!animate) this.heights[i] = this.targets[i];
      const glow = tileGlow(score, scale);
      const material = this.tiles[i].material;
      const tint = score >= 0 ? warm : cool;
      material.color.copy(matte).lerp(tint, 0.25 + 0.6 * glow);
      material.emissive.copy(tint).multiplyScalar(glow * 0.55);
    }
    this.apply();
  }

  /** Accent outline and score label on the chosen tile; -1 clears. */
  select(index: number, scoreText = ''): void {
    this.selected = index;
    this.outline.visible = this.scoreLabel.visible = index >= 0;
    this.scoreLabel.element.textContent = scoreText;
    this.apply();
  }

  update(dt: number, reducedMotion: boolean): void {
    let moving = false;
    const k = reducedMotion ? 1 : Math.min(1, dt * (4 / EASE_SECONDS));
    for (let i = 0; i < GRID_SIZE; i++) {
      const gap = this.targets[i] - this.heights[i];
      if (Math.abs(gap) < 1e-4) continue;
      this.heights[i] += gap * k;
      moving = true;
    }
    if (moving) this.apply();
  }

  private apply(): void {
    for (let i = 0; i < GRID_SIZE; i++) this.tiles[i].scale.y = this.heights[i];
    if (this.selected < 0) return;
    const tile = this.tiles[this.selected];
    this.outline.position.copy(tile.position);
    this.outline.scale.y = this.heights[this.selected] + 0.04;
    this.scoreLabel.position.set(tile.position.x, tile.position.y + this.heights[this.selected] + 0.45, tile.position.z);
  }

  dispose(): void {
    disposeObject(this.group);
    // Removing the labels (direct children) also removes their DOM elements.
    this.group.clear();
    this.group.removeFromParent();
  }
}
