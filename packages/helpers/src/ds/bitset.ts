import { ValidationError } from '../error/index.js';

/** Largest supported bit index + 1 (2^31 bits = 256 MiB). */
const MAX_BITS = 2 ** 31;

function popcount(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24);
}

function assertIndex(i: number): void {
  if (!Number.isInteger(i) || i < 0 || i >= MAX_BITS) throw new ValidationError('HLP_DS_INVALID_INDEX', 'Bit index must be a non-negative integer below 2^31.');
}

/**
 * Growable bit set on a `Uint32Array`. `size` is the number of set bits.
 * Complexity: `set`, `clear(i)`, `has`, `toggle` O(1) amortized; `count`, set algebra, iteration O(words).
 * @example
 * const b = new BitSet();
 * b.set(3).set(64);
 * b.has(3);         // => true
 * [...b];           // => [3, 64]
 * b.union(BitSet.from([1])).toArray(); // => [1, 3, 64]
 */
export class BitSet implements Iterable<number> {
  #words: Uint32Array;

  constructor(capacity = 32) {
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > MAX_BITS) throw new ValidationError('HLP_DS_INVALID_CAPACITY', 'Capacity must be an integer between 0 and 2^31.');
    this.#words = new Uint32Array(Math.max(1, Math.ceil(capacity / 32)));
  }

  /** Builds a bit set with the given indexes set. */
  static from(indexes: Iterable<number>): BitSet {
    const b = new BitSet();
    for (const i of indexes) b.set(i);
    return b;
  }

  /** Allocated bits (grows on demand). */
  get capacity(): number {
    return this.#words.length * 32;
  }

  /** Number of set bits. O(words). */
  get size(): number {
    return this.count();
  }

  /** Sets bit `index`. */
  set(index: number): this {
    assertIndex(index);
    this.#ensure(index);
    const w = index >>> 5;
    this.#words[w] = ((this.#words[w] ?? 0) | (1 << (index & 31))) >>> 0;
    return this;
  }

  /** Clears bit `index`, or every bit when called without an index. */
  clear(index?: number): this {
    if (index === undefined) {
      this.#words.fill(0);
      return this;
    }
    assertIndex(index);
    const w = index >>> 5;
    if (w < this.#words.length) this.#words[w] = ((this.#words[w] ?? 0) & ~(1 << (index & 31))) >>> 0;
    return this;
  }

  /** True when bit `index` is set. */
  has(index: number): boolean {
    if (!Number.isInteger(index) || index < 0) return false;
    const w = index >>> 5;
    return w < this.#words.length && ((this.#words[w] ?? 0) & (1 << (index & 31))) !== 0;
  }

  /** Flips bit `index`; returns its new state. */
  toggle(index: number): boolean {
    if (this.has(index)) {
      this.clear(index);
      return false;
    }
    this.set(index);
    return true;
  }

  /** Number of set bits (popcount). O(words). */
  count(): number {
    let n = 0;
    for (const w of this.#words) n += popcount(w);
    return n;
  }

  /** New set with bits in either. */
  union(other: BitSet): BitSet {
    return this.#combine(other, (a, b) => a | b);
  }

  /** New set with bits in both. */
  intersect(other: BitSet): BitSet {
    return this.#combine(other, (a, b) => a & b);
  }

  /** New set with bits in this but not `other`. */
  difference(other: BitSet): BitSet {
    return this.#combine(other, (a, b) => a & ~b);
  }

  /** New set with bits in exactly one. */
  xor(other: BitSet): BitSet {
    return this.#combine(other, (a, b) => a ^ b);
  }

  /** True when both have the same set bits. */
  equals(other: BitSet): boolean {
    const a = this.#words;
    const b = other.#words;
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
    return true;
  }

  /** Independent copy. */
  clone(): BitSet {
    const b = new BitSet(0);
    b.#words = this.#words.slice();
    return b;
  }

  /** Set bit indexes in ascending order. */
  toArray(): number[] {
    return [...this];
  }

  /** Iterates set bit indexes in ascending order. */
  *[Symbol.iterator](): Iterator<number> {
    const words = this.#words;
    for (let w = 0; w < words.length; w++) {
      let bits = words[w] ?? 0;
      while (bits !== 0) {
        const low = bits & -bits;
        yield w * 32 + (31 - Math.clz32(low));
        bits = (bits ^ low) >>> 0;
      }
    }
  }

  #ensure(index: number): void {
    const need = (index >>> 5) + 1;
    if (need <= this.#words.length) return;
    const next = new Uint32Array(Math.min(Math.max(need, this.#words.length * 2), MAX_BITS / 32));
    next.set(this.#words);
    this.#words = next;
  }

  #combine(other: BitSet, op: (a: number, b: number) => number): BitSet {
    const a = this.#words;
    const b = other.#words;
    const out = new BitSet(0);
    const words = new Uint32Array(Math.max(a.length, b.length));
    for (let i = 0; i < words.length; i++) words[i] = op(a[i] ?? 0, b[i] ?? 0) >>> 0;
    out.#words = words;
    return out;
  }
}
