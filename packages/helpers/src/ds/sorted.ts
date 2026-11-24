import { AvlTree } from './avl.js';
import { naturalCompare, type Comparer } from './internal.js';

/** Bound inclusion for range queries: `'[]'` both ends (default), `'[)'`, `'(]'`, `'()'`. */
export type RangeBounds = '[]' | '[)' | '(]' | '()';

/**
 * Map ordered by key on a balanced (AVL) tree with a custom comparer.
 * Complexity: `get`, `set`, `has`, `delete`, `floor`, `ceiling`, `lower`, `higher`, `first`, `last` O(log n);
 * `between` O(log n + k); full iteration O(n). Modifying the map while iterating throws
 * `HLP_DS_CONCURRENT_MODIFICATION` (updating an existing key's value is allowed).
 * @example
 * const m = new SortedMap<number, string>([[3, 'c'], [1, 'a']]);
 * m.set(2, 'b');
 * [...m.keys()];        // => [1, 2, 3]
 * m.floor(2.5);         // => [2, 'b']
 * [...m.between(2, 3)]; // => [[2, 'b'], [3, 'c']]
 */
export class SortedMap<K, V> implements Iterable<[K, V]> {
  readonly #tree: AvlTree<K, V>;

  constructor(entries?: Iterable<readonly [K, V]>, comparer: Comparer<K> = naturalCompare) {
    this.#tree = new AvlTree<K, V>(comparer);
    if (entries) for (const [k, v] of entries) this.#tree.insert(k, v);
  }

  /** Number of entries. O(1). */
  get size(): number {
    return this.#tree.size;
  }

  /** Value for `key`. O(log n). */
  get(key: K): V | undefined {
    return this.#tree.find(key)?.value;
  }

  /** True when `key` is present. O(log n). */
  has(key: K): boolean {
    return this.#tree.find(key) !== undefined;
  }

  /** Inserts or replaces. O(log n). */
  set(key: K, value: V): this {
    this.#tree.insert(key, value);
    return this;
  }

  /** Removes `key`. O(log n). */
  delete(key: K): boolean {
    return this.#tree.delete(key) !== undefined;
  }

  /** Removes every entry. */
  clear(): void {
    this.#tree.clear();
  }

  /** Smallest entry. O(log n). */
  first(): [K, V] | undefined {
    return pair(this.#tree.min());
  }

  /** Largest entry. O(log n). */
  last(): [K, V] | undefined {
    return pair(this.#tree.max());
  }

  /** Greatest entry with key <= `key`. O(log n). */
  floor(key: K): [K, V] | undefined {
    return pair(this.#tree.below(key, true));
  }

  /** Least entry with key >= `key`. O(log n). */
  ceiling(key: K): [K, V] | undefined {
    return pair(this.#tree.above(key, true));
  }

  /** Greatest entry with key < `key`. O(log n). */
  lower(key: K): [K, V] | undefined {
    return pair(this.#tree.below(key, false));
  }

  /** Least entry with key > `key`. O(log n). */
  higher(key: K): [K, V] | undefined {
    return pair(this.#tree.above(key, false));
  }

  /** Removes and returns the smallest entry. O(log n). */
  shift(): [K, V] | undefined {
    const n = this.#tree.min();
    if (!n) return undefined;
    this.#tree.delete(n.key);
    return [n.key, n.value];
  }

  /** Removes and returns the largest entry. O(log n). */
  pop(): [K, V] | undefined {
    const n = this.#tree.max();
    if (!n) return undefined;
    this.#tree.delete(n.key);
    return [n.key, n.value];
  }

  /** Entries with `lo`..`hi` keys in ascending order. O(log n + k). */
  *between(lo: K, hi: K, bounds: RangeBounds = '[]'): Generator<[K, V]> {
    const cmp = this.#tree.cmp;
    const hiExclusive = bounds.endsWith(')');
    for (const n of this.#tree.ascending({ key: lo, exclusive: bounds.startsWith('(') })) {
      const c = cmp(n.key, hi);
      if (c > 0 || (c === 0 && hiExclusive)) return;
      yield [n.key, n.value];
    }
  }

  /** Keys in ascending order. */
  *keys(): Generator<K> {
    for (const n of this.#tree.ascending()) yield n.key;
  }

  /** Values in ascending key order. */
  *values(): Generator<V> {
    for (const n of this.#tree.ascending()) yield n.value;
  }

  /** Entries in ascending key order. */
  entries(): Generator<[K, V]> {
    return this[Symbol.iterator]();
  }

  /** Entries in descending key order. */
  *reversed(): Generator<[K, V]> {
    for (const n of this.#tree.descending()) yield [n.key, n.value];
  }

  /** Entries in ascending key order. O(n). */
  toArray(): [K, V][] {
    return [...this];
  }

  /** Iterates entries in ascending key order. */
  *[Symbol.iterator](): Generator<[K, V]> {
    for (const n of this.#tree.ascending()) yield [n.key, n.value];
  }
}

function pair<K, V>(n: { key: K; value: V } | undefined): [K, V] | undefined {
  return n ? [n.key, n.value] : undefined;
}

/**
 * Set ordered by a custom comparer on a balanced (AVL) tree.
 * Complexity: `add`, `has`, `delete`, `floor`, `ceiling`, `first`, `last` O(log n); `between` O(log n + k).
 * @example
 * const s = new SortedSet(['pear', 'apple']);
 * s.add('fig');
 * s.toArray();       // => ['apple', 'fig', 'pear']
 * s.ceiling('b');    // => 'fig'
 */
export class SortedSet<T> implements Iterable<T> {
  readonly #tree: AvlTree<T, undefined>;

  constructor(items?: Iterable<T>, comparer: Comparer<T> = naturalCompare) {
    this.#tree = new AvlTree<T, undefined>(comparer);
    if (items) for (const item of items) this.#tree.insert(item, undefined);
  }

  /** Number of items. O(1). */
  get size(): number {
    return this.#tree.size;
  }

  /** Adds `item` (no-op when an equal item exists). O(log n). */
  add(item: T): this {
    if (!this.#tree.find(item)) this.#tree.insert(item, undefined);
    return this;
  }

  /** True when an equal item exists. O(log n). */
  has(item: T): boolean {
    return this.#tree.find(item) !== undefined;
  }

  /** Removes `item`. O(log n). */
  delete(item: T): boolean {
    return this.#tree.delete(item) !== undefined;
  }

  /** Removes every item. */
  clear(): void {
    this.#tree.clear();
  }

  /** Smallest item. O(log n). */
  first(): T | undefined {
    return this.#tree.min()?.key;
  }

  /** Largest item. O(log n). */
  last(): T | undefined {
    return this.#tree.max()?.key;
  }

  /** Greatest item <= `item`. O(log n). */
  floor(item: T): T | undefined {
    return this.#tree.below(item, true)?.key;
  }

  /** Least item >= `item`. O(log n). */
  ceiling(item: T): T | undefined {
    return this.#tree.above(item, true)?.key;
  }

  /** Greatest item < `item`. O(log n). */
  lower(item: T): T | undefined {
    return this.#tree.below(item, false)?.key;
  }

  /** Least item > `item`. O(log n). */
  higher(item: T): T | undefined {
    return this.#tree.above(item, false)?.key;
  }

  /** Items between `lo` and `hi` in ascending order. O(log n + k). */
  *between(lo: T, hi: T, bounds: RangeBounds = '[]'): Generator<T> {
    const cmp = this.#tree.cmp;
    const hiExclusive = bounds.endsWith(')');
    for (const n of this.#tree.ascending({ key: lo, exclusive: bounds.startsWith('(') })) {
      const c = cmp(n.key, hi);
      if (c > 0 || (c === 0 && hiExclusive)) return;
      yield n.key;
    }
  }

  /** Items in descending order. */
  *reversed(): Generator<T> {
    for (const n of this.#tree.descending()) yield n.key;
  }

  /** Items in ascending order. O(n). */
  toArray(): T[] {
    return [...this];
  }

  /** Iterates items in ascending order. */
  *[Symbol.iterator](): Generator<T> {
    for (const n of this.#tree.ascending()) yield n.key;
  }
}
