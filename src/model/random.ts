/** A source of uniform numbers in [0, 1). */
export type Rng = () => number;

/** mulberry32: small, fast, 32-bit state; fully determined by its seed. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** MurmurHash3 finalizer: spreads every input bit across the output. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Seed for stream `index` under a base seed. Path i always gets the same stream,
 * no matter how many other paths are generated.
 */
export function deriveSeed(seed: number, index: number): number {
  return fmix32((fmix32(seed >>> 0) + Math.imul(index + 1, 0x9e3779b9)) >>> 0);
}
