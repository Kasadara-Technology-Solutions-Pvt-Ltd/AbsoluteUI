import { ConflictError } from '../error/index.js';

export interface MultiMapOptions {
  /** Keep each value at most once per key (Set semantics, SameValueZero). Default false (array, duplicates kept). */
  readonly unique?: boolean;
}

/**
 * Map from a key to many values. `size` counts values; `keyCount` counts keys.
 * Complexity: `add`, `get`, `has`, `delete` O(1); `hasEntry`, `deleteEntry` O(1) with `unique`, O(values of key) otherwise.
 * @example
 * const m = new MultiMap<string, number>();
 * m.add('a', 1).add('a', 2).add('b', 3);
 * m.get('a'); // => [1, 2]
 * m.size;     // => 3
 */
export class MultiMap<K, V> implements Iterable<[K, V]> {
  readonly unique: boolean;
  readonly #map = new Map<K, V[] | Set<V>>();
  #size = 0;

  constructor(entries?: Iterable<readonly [K, V]>, options: MultiMapOptions = {}) {
    this.unique = options.unique ?? false;
    if (entries) for (const [k, v] of entries) this.add(k, v);
  }

  /** Total number of values. O(1). */
  get size(): number {
    return this.#size;
  }

  /** Number of keys. O(1). */
  get keyCount(): number {
    return this.#map.size;
  }

  /** Adds `value` under `key` (ignored when `unique` and already present). */
  add(key: K, value: V): this {
    let bucket = this.#map.get(key);
    if (!bucket) {
      bucket = this.unique ? new Set<V>() : [];
      this.#map.set(key, bucket);
    }
    if (bucket instanceof Set) {
      if (bucket.has(value)) return this;
      bucket.add(value);
    } else bucket.push(value);
    this.#size++;
    return this;
  }

  /** Values under `key` (a copy; empty when absent). */
  get(key: K): V[] {
    const b = this.#map.get(key);
    return b ? [...b] : [];
  }

  /** True when `key` has at least one value. */
  has(key: K): boolean {
    return this.#map.has(key);
  }

  /** True when `value` is stored under `key`. */
  hasEntry(key: K, value: V): boolean {
    const b = this.#map.get(key);
    return b instanceof Set ? b.has(value) : (b?.includes(value) ?? false);
  }

  /** Removes `key` and all its values. */
  delete(key: K): boolean {
    const b = this.#map.get(key);
    if (!b) return false;
    this.#size -= b instanceof Set ? b.size : b.length;
    return this.#map.delete(key);
  }

  /** Removes one occurrence of `value` under `key`. */
  deleteEntry(key: K, value: V): boolean {
    const b = this.#map.get(key);
    if (!b) return false;
    if (b instanceof Set) {
      if (!b.delete(value)) return false;
    } else {
      const i = b.indexOf(value);
      if (i < 0) return false;
      b.splice(i, 1);
    }
    this.#size--;
    if ((b instanceof Set ? b.size : b.length) === 0) this.#map.delete(key);
    return true;
  }

  /** Removes everything. */
  clear(): void {
    this.#map.clear();
    this.#size = 0;
  }

  /** Keys in insertion order. */
  keys(): IterableIterator<K> {
    return this.#map.keys();
  }

  /** `[key, values]` groups in insertion order. */
  *groups(): Generator<[K, V[]]> {
    for (const [k, b] of this.#map) yield [k, [...b]];
  }

  /** Flattened `[key, value]` pairs. */
  toArray(): [K, V][] {
    return [...this];
  }

  /** Iterates flattened `[key, value]` pairs. */
  *[Symbol.iterator](): Iterator<[K, V]> {
    for (const [k, b] of this.#map) for (const v of b) yield [k, v];
  }
}

/**
 * Two-way map with unique keys and unique values.
 * Complexity: every operation O(1).
 * @example
 * const codes = new BiMap([['IN', 'India']]);
 * codes.getKey('India');       // => 'IN'
 * codes.set('FR', 'India');    // => throws HLP_DS_BIMAP_DUPLICATE_VALUE
 */
export class BiMap<K, V> implements Iterable<[K, V]> {
  readonly #fwd = new Map<K, V>();
  readonly #rev = new Map<V, K>();

  constructor(entries?: Iterable<readonly [K, V]>) {
    if (entries) for (const [k, v] of entries) this.set(k, v);
  }

  /** Number of pairs. */
  get size(): number {
    return this.#fwd.size;
  }

  /**
   * Maps `key` to `value`, replacing the key's previous value. Throws `HLP_DS_BIMAP_DUPLICATE_VALUE`
   * when `value` already belongs to another key (use `forceSet` to steal it).
   */
  set(key: K, value: V): this {
    const owner = this.#rev.get(value);
    if (this.#rev.has(value) && owner !== key) throw new ConflictError('HLP_DS_BIMAP_DUPLICATE_VALUE', 'The value is already mapped to another key.');
    return this.forceSet(key, value);
  }

  /** Maps `key` to `value`, removing any pair that used either. */
  forceSet(key: K, value: V): this {
    this.delete(key);
    this.deleteValue(value);
    this.#fwd.set(key, value);
    this.#rev.set(value, key);
    return this;
  }

  /** Value for `key`. */
  get(key: K): V | undefined {
    return this.#fwd.get(key);
  }

  /** Key for `value`. */
  getKey(value: V): K | undefined {
    return this.#rev.get(value);
  }

  /** True when `key` exists. */
  has(key: K): boolean {
    return this.#fwd.has(key);
  }

  /** True when `value` exists. */
  hasValue(value: V): boolean {
    return this.#rev.has(value);
  }

  /** Removes the pair with `key`. */
  delete(key: K): boolean {
    if (!this.#fwd.has(key)) return false;
    this.#rev.delete(this.#fwd.get(key) as V);
    this.#fwd.delete(key);
    return true;
  }

  /** Removes the pair with `value`. */
  deleteValue(value: V): boolean {
    if (!this.#rev.has(value)) return false;
    this.#fwd.delete(this.#rev.get(value) as K);
    this.#rev.delete(value);
    return true;
  }

  /** New `BiMap` with keys and values swapped. */
  inverse(): BiMap<V, K> {
    return new BiMap<V, K>(this.#rev);
  }

  /** Removes every pair. */
  clear(): void {
    this.#fwd.clear();
    this.#rev.clear();
  }

  /** Keys in insertion order. */
  keys(): IterableIterator<K> {
    return this.#fwd.keys();
  }

  /** Values in insertion order. */
  values(): IterableIterator<V> {
    return this.#fwd.values();
  }

  /** Pairs in insertion order. */
  toArray(): [K, V][] {
    return [...this.#fwd];
  }

  /** Iterates pairs in insertion order. */
  [Symbol.iterator](): Iterator<[K, V]> {
    return this.#fwd.entries();
  }
}
