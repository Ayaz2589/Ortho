// Deterministic seeded PRNG for the coverage-corpus generator (spec 026).
//
// The corpus must be byte-identical across runs and machines, and the
// constitution forbids asserting against the real clock or non-seeded
// randomness. `mulberry32` is a tiny, dependency-free integer-hash PRNG; a
// string-hashed `sub(label)` derives an INDEPENDENT stream from the ORIGINAL
// seed (not the mutated state), so scenarios can be added, removed, or reordered
// without perturbing each other's output. No `Math.random`, ever.

export interface Prng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number
  /** Uniform integer in [min, max] inclusive. */
  range(min: number, max: number): number
  /** Pick one element uniformly. */
  pick<T>(arr: readonly T[]): T
  /** True with probability p (default 0.5). */
  bool(p?: number): boolean
  /** An independent child stream keyed by `label`, stable regardless of draws. */
  sub(label: string): Prng
}

/** xfnv1a string hash → 32-bit unsigned. Used to derive sub-stream seeds. */
function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number): Prng {
  const rootSeed = seed >>> 0
  let a = rootSeed
  const next = (): number => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive)
  return {
    next,
    int,
    range: (min, max) => min + int(max - min + 1),
    pick: (arr) => arr[int(arr.length)],
    bool: (p = 0.5) => next() < p,
    sub: (label) => mulberry32((rootSeed ^ hashString(label)) >>> 0),
  }
}
