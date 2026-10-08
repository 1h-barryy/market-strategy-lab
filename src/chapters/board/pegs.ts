import { Instrument } from '../../art/instrument';
import { BoardMapping } from './mapping';

/**
 * Static board, rebuilt when n changes: the art system's instrument (art/instrument.ts) — guides,
 * rails, capped pegs, row tabs, source funnel, tray, bin pockets, separators and signal strips.
 */
export function createBoard(mapping: BoardMapping): Instrument {
  return new Instrument(mapping);
}
