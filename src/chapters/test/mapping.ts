import { LOOKBACKS, NERVES } from '../../model/strategy';
import { BOARD_FRAME } from '../../world/shared/layout';

/**
 * The only place where Chapter 3's results become scene geometry (DESIGN.md §6.2).
 *
 * The betting table lies on the floor in front of the board: Nerve runs left to right (columns),
 * Memory from front (2 days) to back (64 days). The luck pile stands upright to the table's right,
 * facing the viewer like the board.
 */
export const FLOOR = BOARD_FRAME.binBottom - 0.15;

export const TABLE = {
  x: 0,
  z: 9,
  /** Distance between tile centers. */
  pitch: 1.35,
  tile: 1.1,
  /** Slab under the tiles. */
  slab: 0.3,
  /** Height of a tile scoring 0 (and of every losing tile). */
  base: 0.12,
  /** Extra height of the best-scoring tile. */
  rise: 2.6,
} as const;

export const PILE = { left: 7.2, right: 17.2, z: 9, height: 5.4, bins: 16 } as const;

export const tileX = (nerve: number): number => TABLE.x + (nerve - (NERVES.length - 1) / 2) * TABLE.pitch;
export const tileZ = (memory: number): number => TABLE.z + ((LOOKBACKS.length - 1) / 2 - memory) * TABLE.pitch;
export const tableTop = FLOOR + TABLE.slab;
export const tableHalfWidth = (NERVES.length * TABLE.pitch) / 2 + 0.3;

/**
 * Score that reaches full tile height: the best |score| on this table, but never below 1. The floor
 * keeps a crowd with no habits (scores around ±0.2) looking flat instead of blowing noise up to
 * full height; above it, tiles compare within the table and the panel shows exact scores.
 */
export function scoreScale(scores: ArrayLike<number>): number {
  let max = 1;
  for (let i = 0; i < scores.length; i++) max = Math.max(max, Math.abs(scores[i]));
  return max;
}

/** Tile height: losing tiles stay flat, earning ones rise in proportion to their score. */
export function tileHeight(score: number, scale: number): number {
  return TABLE.base + (Math.max(0, score) / scale) * TABLE.rise;
}

/** Glow 0..1 from the size of the score, for both earning (warm) and losing (cool) tiles. */
export function tileGlow(score: number, scale: number): number {
  return Math.min(1, Math.abs(score) / scale);
}

export interface PileLayout {
  /** Score at the left edge of bin 0. */
  lo: number;
  width: number;
  bins: number;
  /** Bin of each luck score. */
  binOf: Int32Array;
  counts: Int32Array;
  /** Bin of the player's score, or which side it is off the chart. */
  player: number | 'left' | 'right';
}

/** How far beyond the luck scores (in bins) the chart stretches to keep the player's score on it. */
const STRETCH = 6;

/**
 * Bins for the luck pile: sized by the luck scores, so their shape stays readable; stretched to
 * include the player's score when it is close, otherwise the player's ball sits off the chart's edge.
 */
export function pileLayout(luck: ArrayLike<number>, player: number, target = PILE.bins): PileLayout {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < luck.length; i++) {
    min = Math.min(min, luck[i]);
    max = Math.max(max, luck[i]);
  }
  if (!Number.isFinite(min)) min = max = 0;
  const span = max - min;
  const width = span > 1e-9 ? span / (target - 2) : 0.02;
  let lo = span > 1e-9 ? min - width : min - (width * target) / 2;
  let bins = target;
  let side: 'left' | 'right' | null = null;
  const at = Math.floor((player - lo) / width);
  if (at < 0) {
    if (at >= -STRETCH) { lo += at * width; bins -= at; } else side = 'left';
  } else if (at >= bins) {
    if (at < bins + STRETCH) bins = at + 1; else side = 'right';
  }
  const binOf = new Int32Array(luck.length);
  const counts = new Int32Array(bins);
  for (let i = 0; i < luck.length; i++) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor((luck[i] - lo) / width)));
    binOf[i] = b;
    counts[b]++;
  }
  const playerBin = side ?? Math.min(bins - 1, Math.max(0, Math.floor((player - lo) / width)));
  return { lo, width, bins, binOf, counts, player: playerBin };
}

/** World x of a score on the pile's axis. */
export function pileX(layout: PileLayout, score: number): number {
  return PILE.left + ((score - layout.lo) / (layout.width * layout.bins)) * (PILE.right - PILE.left);
}

export function pileBinX(layout: PileLayout, bin: number): number {
  return pileX(layout, layout.lo + (bin + 0.5) * layout.width);
}
