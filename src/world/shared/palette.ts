/**
 * The one place colors are defined (DESIGN.md §8: color is semantic).
 * Values are the art sandbox's (art/palette.ts, iteration 03); the art pass changed the values,
 * not the meanings.
 */
export const palette = {
  background: 0x0b1220,
  /** Matte solids: board, pegs, bin walls. */
  board: 0x223446,
  peg: 0xa5b8c8,
  /** Up-steps, momentum, gains. */
  up: 0x48ddb1,
  /** Down-steps, mean reversion, losses. */
  down: 0xff7088,
  /** Probability density / "how likely" (analytic overlay, flat outcomes). */
  neutral: 0xe4eef5,
  /** The player's choice (inspected ball). */
  accent: 0x8193ff,
  /** Secondary lines: axes, reference levels. */
  guide: 0x6e8ba3,
} as const;

export function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
