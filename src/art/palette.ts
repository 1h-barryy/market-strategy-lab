/**
 * Art palette ported from the art sandbox ("Luminous Quant Instrument", iteration 03).
 *
 * Semantic colors (up, down, neutral, accent, ...) live in world/shared/palette.ts and keep their
 * meanings; their values there are the sandbox's. This file holds the art-only surface colors that
 * carry no data meaning: matte structure and environment.
 */
export const art = {
  plum: 0x29233b,
  ceramic: 0xe9dccd,
  ceramicEdge: 0xc6b9ad,
  sage: 0x8ca8a0,
  sageEdge: 0x718e88,
  lavender: 0x9285ad,
  lavenderEdge: 0x766887,
  mauve: 0xb8a4b9,
  mauveEdge: 0x978597,
  graphite: 0x384247,
  feet: 0x61736f,
  peg: 0xbeb5a7,
  ink: 0xabb8b3,
  rearGuide: 0x718781,
  frontGuard: 0xcce1d9,
  /** Unlit bin signal strip. */
  signalOff: 0x54516a,
  /** Printed label inks. */
  labelInk: '#d5ded7',
  labelInkMuted: '#8ca8a0',
} as const;

/**
 * Sandbox units → project units. The sandbox instrument is 16 rows at a 0.42 row pitch; the
 * project's board rows are ~0.55 apart at the default 12 days, so details scale by 1.3.
 */
export const ART_SCALE = 1.3;

/** Emissive intensities from the sandbox (`luminous(color, intensity)`). */
export const GLOW = {
  /**
   * Balls in flight and other moving data particles. The sandbox used 2.8, which ACES tone mapping
   * turns nearly white at the project's larger ball size; 0.8 keeps the up/down hue in the core and
   * the glow comes from the particle halo (art/halo.ts).
   */
  particle: 0.8,
  /** The source orb at rest (pulses up when a ball is released). */
  source: 1.1,
  sourcePulse: 1.6,
  /** A selection marker (the sandbox's needle tip). */
  selection: 0.8,
  /** Bin signal peak when a ball lands; fades over `signalFade` seconds. */
  signal: 1.1,
  signalFade: 0.85,
} as const;

/** Particle halo: shell radius as a multiple of the particle's, and its brightness. */
export const HALO = { scale: 2.4, strength: 1.2 } as const;
