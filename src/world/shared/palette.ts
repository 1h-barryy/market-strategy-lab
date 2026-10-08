/**
 * The one place colors are defined (DESIGN.md §8: color is semantic).
 * Values are the art sandbox's (art/palette.ts, iteration 03); the art pass changed the values,
 * not the meanings.
 */
export const palette = {
  background: 0x29233b,
  /** Matte solids: board, pegs, bin walls. */
  board: 0x384247,
  peg: 0xbeb5a7,
  /** Up-steps, momentum, gains. */
  up: 0xffad78,
  /** Down-steps, mean reversion, losses. */
  down: 0x6dceef,
  /** Probability density / "how likely" (analytic overlay, flat outcomes). */
  neutral: 0xfff5e8,
  /** The player's choice (inspected ball). */
  accent: 0xc5acff,
  /** Secondary lines: axes, reference levels. */
  guide: 0xabb8b3,
} as const;

export function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
