/**
 * World-space layout shared by chapters that must line up (DESIGN.md §5): the board stands at
 * z = 0 facing the viewer, and the terrain lies behind it on the same position axis.
 */
export const BOARD_FRAME = {
  width: 10,
  pegTop: 7,
  pegBottom: 0.4,
  binTop: 0,
  binBottom: -5.5,
  /** Where balls appear before falling onto the first peg. */
  dropHeight: 8.4,
  price: { left: 7, right: 15, top: 2.5, bottom: -5.5 },
  /** Back face of the backplate. */
  back: -0.6,
} as const;

/**
 * World units per step of position (up minus down days), for a board showing `boardDays` days:
 * bins are FRAME.width / (days + 1) apart and one step is half a bin.
 */
export function unitsPerStep(boardDays: number): number {
  return BOARD_FRAME.width / (boardDays + 1) / 2;
}
