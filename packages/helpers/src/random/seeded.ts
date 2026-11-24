/**
 * Deterministic PRNG for tests, demos and reproducible sampling. NOT cryptographically secure:
 * never use it for ids, tokens, passwords or anything an attacker could benefit from predicting.
 */
import { ValidationError } from '../error/index.js';
import { fisherYates, rangeSize, uniformBelow, unitFloat, type U32Source } from './core.js';

/** Seeded, NON-cryptographic generator returned by `createSeededRandom`. */
export interface SeededRandom {
  /** Float in `[0, 1)` with 53 bits. */
  next(): number;
  /** Raw 32-bit unsigned output. */
  nextUint32(): number;
  /** Unbiased integer in `[min, max]` (inclusive, up to 2^53 values). */
  int(min: number, max: number): number;
  /** Float in `[min, max)`. Default `[0, 1)`. */
  float(min?: number, max?: number): number;
  /** `true` with the given probability (default 0.5). */
  bool(probability?: number): boolean;
  /** Uniform element or `undefined` for an empty array. */
  pick<T>(items: readonly T[]): T | undefined;
  /** Shuffled copy. */
  shuffle<T>(items: readonly T[]): T[];
}

function splitmix32(state: number): () => number {
  let s = state >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

function seedWord(seed: number | string): number {
  if (typeof seed === 'string') {
    let h = 0x811c9dc5; // FNV-1a over UTF-16 code units
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
    return h >>> 0;
  }
  if (!Number.isFinite(seed)) throw new ValidationError('HLP_RANDOM_SEED', 'The seed must be a finite number or a string.');
  const hi = Math.floor(seed / 4_294_967_296);
  return (seed >>> 0) ^ splitmix32(hi >>> 0)();
}

/**
 * xoshiro128** generator seeded through splitmix32 from a number or string.
 * NOT for security: output is predictable from the seed or a few outputs.
 * @example
 * const a = createSeededRandom('demo');
 * const b = createSeededRandom('demo');
 * a.int(1, 6) === b.int(1, 6); // => true // same seed, same sequence
 * a.shuffle([1, 2, 3, 4, 5]); // => [5, 2, 4, 1, 3] // identical on every run for this seed
 */
export function createSeededRandom(seed: number | string): SeededRandom {
  const sm = splitmix32(seedWord(seed));
  let a = sm();
  let b = sm();
  let c = sm();
  let d = sm();
  if ((a | b | c | d) === 0) a = 1; // the all-zero state is a fixed point
  const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));
  const nextUint32: U32Source = () => {
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return result;
  };
  return {
    next: () => unitFloat(nextUint32),
    nextUint32,
    int: (min, max) => min + uniformBelow(nextUint32, rangeSize(min, max)),
    float: (min = 0, max = 1) => {
      if (!Number.isFinite(min) || !Number.isFinite(max) || !(min < max)) throw new ValidationError('HLP_RANDOM_RANGE', 'Expected finite bounds with min < max.');
      for (;;) {
        const v = min + unitFloat(nextUint32) * (max - min);
        if (v < max) return v;
      }
    },
    bool: (probability = 0.5) => {
      if (!(probability >= 0 && probability <= 1)) throw new ValidationError('HLP_RANDOM_PROBABILITY', 'The probability must be between 0 and 1.');
      return unitFloat(nextUint32) < probability;
    },
    pick: <T>(items: readonly T[]) => (items.length ? items[uniformBelow(nextUint32, items.length)] : undefined),
    shuffle: <T>(items: readonly T[]) => fisherYates(items.slice(), nextUint32),
  };
}
