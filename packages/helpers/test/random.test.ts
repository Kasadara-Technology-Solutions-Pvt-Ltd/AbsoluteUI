import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { HelperError, LimitError, ValidationError, isHelperError } from '@absoluteui/helpers/error';
import {
  AMBIGUOUS_CHARACTERS, URL_ALPHABET, createSeededRandom, createUuidV7Generator, generatePassword, isUuid, randomBool, randomBytes, randomFloat, randomId, randomInt,
  randomOtp, randomPick, randomPickWeighted, randomString, sample, shuffle, shuffleInPlace, uuidV4, uuidV7, uuidV7Timestamp,
} from '@absoluteui/helpers/random';

/** Pearson chi-square statistic for observed counts against a uniform expectation. */
function chiSquare(counts: readonly number[], total: number): number {
  const expected = total / counts.length;
  return counts.reduce((a, c) => a + ((c - expected) ** 2) / expected, 0);
}

/** Generous bound: roughly the p = 1e-6 critical value for df ≤ 12 is below 45. */
const CHI_BOUND = 50;

describe('random: integers and floats', () => {
  it('randomInt stays in bounds, including negative and single-value ranges', () => {
    for (let i = 0; i < 2000; i++) {
      const v = randomInt(-3, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(3);
    }
    expect(randomInt(7, 7)).toBe(7);
    const big = randomInt(0, 2 ** 53 - 1);
    expect(Number.isSafeInteger(big)).toBe(true);
    const neg = randomInt(-(2 ** 52), 2 ** 52 - 1);
    expect(neg).toBeGreaterThanOrEqual(-(2 ** 52));
    for (let i = 0; i < 200; i++) {
      const v = randomInt(0, 2 ** 32); // range 2^32 + 1: exercises the two-word path
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(2 ** 32);
    }
  });
  it('randomInt validates', () => {
    expect(() => randomInt(5, 1)).toThrow(ValidationError);
    expect(() => randomInt(0.5, 1)).toThrow(ValidationError);
    expect(() => randomInt(0, 2 ** 53)).toThrow(ValidationError);
    expect(() => randomInt(-(2 ** 53 - 1), 2 ** 53 - 1)).toThrow(ValidationError);
    expect(() => randomInt(Number.NaN, 1)).toThrow(ValidationError);
  });
  it('randomInt is uniform for non-power-of-two ranges (chi-square, 60k draws)', () => {
    for (const [min, max] of [[0, 9], [1, 6], [0, 2], [10, 20]] as const) {
      const n = max - min + 1;
      const counts = new Array<number>(n).fill(0);
      const draws = 60_000;
      for (let i = 0; i < draws; i++) counts[randomInt(min, max) - min]! += 1;
      expect(chiSquare(counts, draws), `${min}..${max}`).toBeLessThan(CHI_BOUND);
    }
  });
  it('randomInt near 2^32 boundary is unbiased (top bit balanced)', () => {
    // Range 3 × 2^30 : a modulo implementation would favour the lower third.
    const size = 3 * 2 ** 30;
    const counts = [0, 0, 0];
    for (let i = 0; i < 30_000; i++) counts[Math.floor(randomInt(0, size - 1) / 2 ** 30)]! += 1;
    expect(chiSquare(counts, 30_000)).toBeLessThan(CHI_BOUND);
  });
  it('randomFloat and randomBool', () => {
    for (let i = 0; i < 2000; i++) {
      const f = randomFloat(-1, 1);
      expect(f).toBeGreaterThanOrEqual(-1);
      expect(f).toBeLessThan(1);
    }
    const f = randomFloat(1, 1 + Number.EPSILON);
    expect(f).toBeGreaterThanOrEqual(1);
    expect(f).toBeLessThan(1 + Number.EPSILON);
    expect(() => randomFloat(1, 1)).toThrow(ValidationError);
    expect(() => randomFloat(0, Infinity)).toThrow(ValidationError);
    expect(() => randomFloat(-Number.MAX_VALUE, Number.MAX_VALUE)).toThrow(ValidationError);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 60_000; i++) buckets[Math.floor(randomFloat() * 10)]! += 1;
    expect(chiSquare(buckets, 60_000)).toBeLessThan(CHI_BOUND);
    expect(randomBool(0)).toBe(false);
    expect(randomBool(1)).toBe(true);
    let t = 0;
    for (let i = 0; i < 20_000; i++) if (randomBool(0.25)) t++;
    expect(t / 20_000).toBeGreaterThan(0.23);
    expect(t / 20_000).toBeLessThan(0.27);
    expect(() => randomBool(1.5)).toThrow(ValidationError);
    expect(() => randomBool(Number.NaN)).toThrow(ValidationError);
  });
  it('randomBytes chunks past 64 KiB', () => {
    const b = randomBytes(200_000);
    expect(b).toHaveLength(200_000);
    // The last chunk must be filled too (all-zero tail would mean it was skipped).
    expect(b.subarray(196_608).some((x) => x !== 0)).toBe(true);
    expect(randomBytes(0)).toHaveLength(0);
    expect(() => randomBytes(-1)).toThrow(ValidationError);
    expect(() => randomBytes(1.5)).toThrow(ValidationError);
    expect(() => randomBytes(17 * 1024 * 1024)).toThrow(LimitError);
  });
});

describe('random: collections', () => {
  it('randomPick and weighted pick', () => {
    expect(randomPick<number>([])).toBeUndefined();
    expect(randomPick(['only'])).toBe('only');
    const items = ['a', 'b', 'c'] as const;
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 30_000; i++) counts[randomPickWeighted(items, [1, 0, 3])!] += 1;
    expect(counts.b).toBe(0);
    expect(counts.a / 30_000).toBeGreaterThan(0.23);
    expect(counts.a / 30_000).toBeLessThan(0.27);
    expect(randomPickWeighted<number>([], [])).toBeUndefined();
    expect(randomPickWeighted(['x', 'y'], [0, 1e-300])).toBe('y');
    expect(() => randomPickWeighted(['a'], [1, 2])).toThrow(ValidationError);
    expect(() => randomPickWeighted(['a', 'b'], [0, 0])).toThrow(ValidationError);
    expect(() => randomPickWeighted(['a'], [-1])).toThrow(ValidationError);
    expect(() => randomPickWeighted(['a'], [Number.NaN])).toThrow(ValidationError);
    expect(() => randomPickWeighted(['a', 'b'], [Number.MAX_VALUE, Number.MAX_VALUE])).toThrow(ValidationError);
  });
  it('sample draws distinct elements without mutating input', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const copy = src.slice();
    const s = sample(src, 4);
    expect(s).toHaveLength(4);
    expect(new Set(s).size).toBe(4);
    for (const x of s) expect(src).toContain(x);
    expect(src).toEqual(copy);
    expect(sample(src, 0)).toEqual([]);
    expect(sample(src, 10).sort((a, b) => a - b)).toEqual(copy);
    expect(() => sample(src, 11)).toThrow(ValidationError);
    expect(() => sample(src, -1)).toThrow(ValidationError);
  });
  it('shuffle returns a permutation; shuffleInPlace mutates', () => {
    const src = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffle(src);
    expect(out).not.toBe(src);
    expect(src).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(out.slice().sort((a, b) => a - b)).toEqual(src);
    const arr = [1, 2, 3];
    expect(shuffleInPlace(arr)).toBe(arr);
    expect(shuffle([])).toEqual([]);
  });
  it('shuffle is unbiased: all 6 permutations of 3 are equally likely', () => {
    const counts = new Map<string, number>();
    const draws = 60_000;
    for (let i = 0; i < draws; i++) {
      const k = shuffle([1, 2, 3]).join('');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    expect(chiSquare([...counts.values()], draws)).toBeLessThan(CHI_BOUND);
  });
});

describe('random: UUIDs', () => {
  it('v4 format and version bits (native and fallback)', () => {
    for (let i = 0; i < 100; i++) expect(isUuid(uuidV4(), 4)).toBe(true);
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      for (let i = 0; i < 100; i++) {
        const u = uuidV4();
        expect(u).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
      }
    } finally {
      delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
    expect(typeof crypto.randomUUID).toBe('function');
  });
  it('v7 embeds the timestamp, version and variant', () => {
    const ts = 1_700_000_000_123;
    const u = uuidV7(ts);
    expect(isUuid(u, 7)).toBe(true);
    expect(u[14]).toBe('7');
    expect('89ab').toContain(u[19]);
    expect(uuidV7Timestamp(u)).toBe(ts);
    expect(uuidV7Timestamp(uuidV4())).toBeUndefined();
    expect(uuidV7(0).startsWith('00000000-0000-7')).toBe(true);
    expect(uuidV7(2 ** 48 - 1).startsWith('ffffffff-ffff-7')).toBe(true);
    expect(() => uuidV7(-1)).toThrow(ValidationError);
    expect(() => uuidV7(2 ** 48)).toThrow(ValidationError);
    expect(() => uuidV7(1.5)).toThrow(ValidationError);
  });
  it('v7 ordering across milliseconds and monotonic generator within one', () => {
    expect(uuidV7(1000) < uuidV7(1001)).toBe(true);
    let now = 5_000;
    const next = createUuidV7Generator(() => now);
    const ids: string[] = [];
    for (let i = 0; i < 10_000; i++) ids.push(next()); // overflows the 12-bit counter → advances ms
    now = 4_000; // clock goes backwards
    ids.push(next(), next());
    now = 1_000_000;
    ids.push(next());
    for (let i = 1; i < ids.length; i++) expect(ids[i - 1]! < ids[i]!).toBe(true);
    for (const id of ids) expect(isUuid(id, 7)).toBe(true);
  });
  it('isUuid', () => {
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isUuid('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF')).toBe(true);
    expect(isUuid('00000000-0000-0000-0000-000000000000', 4)).toBe(false);
    expect(isUuid('3B241101-E2BB-4255-8CAF-4136C566A962', 4)).toBe(true);
    expect(isUuid('3b241101-e2bb-4255-8caf-4136c566a962', 7)).toBe(false);
    expect(isUuid('3b241101-e2bb-4255-7caf-4136c566a962')).toBe(false); // variant
    expect(isUuid('3b241101-e2bb-9255-8caf-4136c566a962')).toBe(false); // version 9
    expect(isUuid('3b241101e2bb42558caf4136c566a962')).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid('a'.repeat(100_000))).toBe(false);
  });
});

describe('random: ids, strings, passwords', () => {
  it('randomId uses the URL-safe alphabet by default', () => {
    expect(new Set(URL_ALPHABET).size).toBe(64);
    const id = randomId();
    expect(id).toHaveLength(21);
    expect(id).toMatch(/^[\w-]+$/);
    expect(randomId(0)).toBe('');
    expect(randomId(10_000)).toHaveLength(10_000);
    expect(randomId(8, 'ab')).toMatch(/^[ab]{8}$/);
    expect(Array.from(randomId(5, '😀🎉'))).toHaveLength(5);
    expect(() => randomId(5, 'a')).toThrow(ValidationError);
    expect(() => randomId(5, 'aab')).toThrow(ValidationError);
    expect(() => randomId(-1)).toThrow(ValidationError);
    expect(() => randomId(70_000)).toThrow(LimitError);
  });
  it('randomId is unbiased for alphabets that are not a power of two', () => {
    const alphabet = 'abcdefghij'; // 10 chars: mask 15 with rejection
    const counts = new Array<number>(10).fill(0);
    const s = randomId(60_000, alphabet);
    for (const ch of s) counts[alphabet.indexOf(ch)]! += 1;
    expect(chiSquare(counts, 60_000)).toBeLessThan(CHI_BOUND);
  });
  it('randomString charsets', () => {
    expect(randomString(32, { charset: 'hex' })).toMatch(/^[\da-f]{32}$/);
    expect(randomString(32, { charset: 'numeric' })).toMatch(/^\d{32}$/);
    expect(randomString(32, { charset: 'alpha' })).toMatch(/^[a-z]{32}$/i);
    expect(randomString(32)).toMatch(/^[\da-z]{32}$/i);
    expect(randomString(16, { alphabet: 'xyz' })).toMatch(/^[xyz]{16}$/);
  });
  it('generatePassword guarantees each class', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(16);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[^a-z\d]/i);
    }
    const p = generatePassword({ length: 40, symbols: false, excludeAmbiguous: true, minEach: 5 });
    expect(p).toHaveLength(40);
    expect(p).toMatch(/^[a-z\d]+$/i);
    for (const ch of AMBIGUOUS_CHARACTERS) expect(p.includes(ch)).toBe(false);
    expect((p.match(/\d/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(generatePassword({ length: 8, lower: false, upper: false, digits: false, symbols: '#$' })).toMatch(/^[#$]{8}$/);
    expect(() => generatePassword({ length: 3 })).toThrow(ValidationError);
    expect(() => generatePassword({ lower: false, upper: false, digits: false, symbols: false })).toThrow(ValidationError);
    expect(() => generatePassword({ length: 5, minEach: 2 })).toThrow(ValidationError);
    expect(() => generatePassword({ symbols: '' })).toThrow(ValidationError);
  });
  it('randomOtp', () => {
    expect(randomOtp()).toMatch(/^\d{6}$/);
    expect(randomOtp(8)).toMatch(/^\d{8}$/);
    expect(() => randomOtp(3)).toThrow(ValidationError);
    expect(() => randomOtp(13)).toThrow(ValidationError);
  });
});

describe('random: seeded PRNG (non-crypto)', () => {
  it('is deterministic per seed', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const c = createSeededRandom(43);
    const sa = Array.from({ length: 20 }, () => a.nextUint32());
    const sb = Array.from({ length: 20 }, () => b.nextUint32());
    const sc = Array.from({ length: 20 }, () => c.nextUint32());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    expect(createSeededRandom('demo').shuffle([1, 2, 3, 4, 5, 6])).toEqual(createSeededRandom('demo').shuffle([1, 2, 3, 4, 5, 6]));
    expect(createSeededRandom('demo').next()).not.toBe(createSeededRandom('demp').next());
    expect(createSeededRandom(2 ** 40).nextUint32()).not.toBe(createSeededRandom(0).nextUint32());
    expect(() => createSeededRandom(Number.NaN)).toThrow(ValidationError);
  });
  it('produces well-distributed values within bounds', () => {
    const r = createSeededRandom('dist');
    const counts = new Array<number>(7).fill(0);
    for (let i = 0; i < 70_000; i++) counts[r.int(0, 6)]! += 1;
    expect(chiSquare(counts, 70_000)).toBeLessThan(CHI_BOUND);
    for (let i = 0; i < 1000; i++) {
      const f = r.float(5, 6);
      expect(f).toBeGreaterThanOrEqual(5);
      expect(f).toBeLessThan(6);
      const n = r.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
    expect(r.pick<number>([])).toBeUndefined();
    expect(['x', 'y']).toContain(r.pick(['x', 'y']));
    expect(typeof r.bool()).toBe('boolean');
    expect(() => r.int(2, 1)).toThrow(ValidationError);
    expect(() => r.float(1, 1)).toThrow(ValidationError);
  });
  it('property: seeded int stays in range for arbitrary bounds', () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: -1e6, max: 1e6 }), fc.integer({ min: 0, max: 1e6 }), (seed, min, span) => {
      const v = createSeededRandom(seed).int(min, min + span);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(min + span);
    }));
  });
});

describe('random: missing crypto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('throws HLP_RANDOM_UNAVAILABLE', () => {
    vi.stubGlobal('crypto', undefined);
    let caught: unknown;
    try {
      randomInt(1, 2);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HelperError);
    expect(isHelperError(caught, 'HLP_RANDOM_UNAVAILABLE')).toBe(true);
    expect(() => uuidV4()).toThrow(HelperError);
    // The seeded generator does not need crypto.
    expect(createSeededRandom(1).int(1, 3)).toBeGreaterThanOrEqual(1);
  });
});
