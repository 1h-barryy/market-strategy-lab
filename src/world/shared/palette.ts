/**
 * The one place colors are defined (DESIGN.md §8: color is semantic).
 * P0 placeholder values; the art pass changes the values, not the meanings.
 */
export const palette = {
  background: 0x14161c,
  /** Matte solids: board, pegs, bin walls. */
  board: 0x2a2e38,
  peg: 0x8a8f9c,
  /** Up-steps, momentum, gains. */
  up: 0xffa94d,
  /** Down-steps, mean reversion, losses. */
  down: 0x4dabf7,
  /** Probability density / "how likely" (analytic overlay, flat outcomes). */
  neutral: 0xf1f3f5,
  /** The player's choice (inspected ball). */
  accent: 0xe64980,
  /** Secondary lines: axes, reference levels. */
  guide: 0x5c6370,
} as const;

export function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
