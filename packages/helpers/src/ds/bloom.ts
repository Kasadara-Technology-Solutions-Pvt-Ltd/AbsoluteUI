import { LimitError, ValidationError } from '../error/index.js';

/** Largest filter: 2^31 bits (256 MiB). */
const MAX_BITS = 2 ** 31;

export interface BloomFilterOptions<T> {
  /** Expected number of distinct items (sizes the filter). */
  readonly expectedItems: number;
  /** Target false-positive rate in (0, 1). Default 0.01. */
  readonly falsePositiveRate?: number;
  /**
   * Converts an item to hashable input. Default: strings as is; numbers, bigints, and booleans via `String`;
   * `Uint8Array` as bytes. Other types throw `HLP_DS_BLOOM_UNSUPPORTED` without a custom `key`.
   */
  readonly key?: (item: T) => string | Uint8Array;
}

let encoder: TextEncoder | undefined;

function fnv1a(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193);
  return h >>> 0;
}

function murmur3(bytes: Uint8Array, seed: number): number {
  let h = seed >>> 0;
  const n = bytes.length;
  const blocks = n & ~3;
  for (let i = 0; i < blocks; i += 4) {
    let k = (bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8) | ((bytes[i + 2] ?? 0) << 16) | ((bytes[i + 3] ?? 0) << 24);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  let k = 0;
  const rem = n & 3;
  if (rem === 3) k ^= (bytes[blocks + 2] ?? 0) << 16;
  if (rem >= 2) k ^= (bytes[blocks + 1] ?? 0) << 8;
  if (rem >= 1) {
    k ^= bytes[blocks] ?? 0;
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
  }
  h ^= n;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function defaultKey(item: unknown): string | Uint8Array {
  if (typeof item === 'string') return item;
  if (typeof item === 'number' || typeof item === 'bigint' || typeof item === 'boolean') return String(item);
  if (item instanceof Uint8Array) return item;
  throw new ValidationError('HLP_DS_BLOOM_UNSUPPORTED', 'Provide a key function for this item type.');
}

/**
 * Probabilistic set membership: `has` may return false positives at about the configured rate, never
 * false negatives. Sized from expected items and target rate; hashing is FNV-1a and MurmurHash3
 * combined by double hashing (not cryptographic; do not use against adversarial inputs for security decisions).
 * Complexity: `add`, `has` O(k) with k hash functions; memory m bits.
 * Not iterable: a Bloom filter cannot list its items.
 * @example
 * const seen = new BloomFilter<string>({ expectedItems: 10_000, falsePositiveRate: 0.001 });
 * seen.add('alice@example.com');
 * seen.has('alice@example.com'); // => true
 * seen.has('bob@example.com');   // => false // almost certainly
 */
export class BloomFilter<T = string> {
  /** Number of bits (m). */
  readonly bits: number;
  /** Number of hash functions (k). */
  readonly hashCount: number;
  readonly #words: Uint32Array;
  readonly #key: (item: T) => string | Uint8Array;
  #added = 0;

  constructor(options: BloomFilterOptions<T>) {
    const n = options.expectedItems;
    const p = options.falsePositiveRate ?? 0.01;
    if (!Number.isSafeInteger(n) || n < 1) throw new ValidationError('HLP_DS_BLOOM_INVALID', 'expectedItems must be a positive integer.');
    if (!(p > 0 && p < 1)) throw new ValidationError('HLP_DS_BLOOM_INVALID', 'falsePositiveRate must be between 0 and 1.');
    const m = Math.ceil((-n * Math.log(p)) / Math.LN2 ** 2);
    if (m > MAX_BITS) throw new LimitError('HLP_DS_BLOOM_TOO_LARGE', 'The requested Bloom filter exceeds the size limit.');
    this.bits = Math.max(32, m);
    this.hashCount = Math.max(1, Math.round((this.bits / n) * Math.LN2));
    this.#words = new Uint32Array(Math.ceil(this.bits / 32));
    this.#key = options.key ?? defaultKey;
  }

  /** Number of `add` calls (including repeats). */
  get size(): number {
    return this.#added;
  }

  /** Adds `item`. O(k). */
  add(item: T): this {
    const [h1, h2] = this.#hashes(item);
    for (let i = 0; i < this.hashCount; i++) {
      const bit = (h1 + i * h2) % this.bits;
      const w = bit >>> 5;
      this.#words[w] = ((this.#words[w] ?? 0) | (1 << (bit & 31))) >>> 0;
    }
    this.#added++;
    return this;
  }

  /** False when `item` was definitely never added; true when it probably was. O(k). */
  has(item: T): boolean {
    const [h1, h2] = this.#hashes(item);
    for (let i = 0; i < this.hashCount; i++) {
      const bit = (h1 + i * h2) % this.bits;
      if (((this.#words[bit >>> 5] ?? 0) & (1 << (bit & 31))) === 0) return false;
    }
    return true;
  }

  /** Estimated current false-positive rate from the fill ratio. */
  estimatedFalsePositiveRate(): number {
    let set = 0;
    for (const w of this.#words) {
      let v = w;
      while (v !== 0) {
        v &= v - 1;
        set++;
      }
    }
    return (set / this.bits) ** this.hashCount;
  }

  /** Resets every bit. */
  clear(): void {
    this.#words.fill(0);
    this.#added = 0;
  }

  #hashes(item: T): [number, number] {
    const k = this.#key(item);
    encoder ??= new TextEncoder();
    const bytes = typeof k === 'string' ? encoder.encode(k) : k;
    return [fnv1a(bytes), (murmur3(bytes, 0x9747b28c) | 1) >>> 0];
  }
}
