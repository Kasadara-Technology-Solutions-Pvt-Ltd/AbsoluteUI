import { ValidationError } from '../error/index.js';
import { AvlTree, type AvlNode } from './avl.js';

/** A stored interval; the object identity is the handle for `remove`. */
export interface IntervalEntry<T> {
  readonly start: number;
  readonly end: number;
  readonly value: T;
}

interface Key<T> extends IntervalEntry<T> {
  readonly seq: number;
}

export interface IntervalTreeOptions {
  /**
   * `'[]'` (default): closed intervals; touching intervals overlap.
   * `'[)'`: half-open, as for bookings: `[9, 10)` and `[10, 11)` do not overlap; empty intervals match nothing.
   */
  readonly bounds?: '[]' | '[)';
}

const compareKeys = <T>(a: Key<T>, b: Key<T>): number => a.start - b.start || a.end - b.end || a.seq - b.seq;

/**
 * Augmented AVL interval tree (each node keeps the max `end` in its subtree).
 * Complexity: `insert`, `remove` O(log n); `search`, `searchPoint` O(log n + k); iteration O(n).
 * Results come back ordered by `start`, then `end`, then insertion order.
 * @example
 * const t = new IntervalTree<string>({ bounds: '[)' });
 * t.insert(9, 10, 'standup');
 * t.insert(10, 11, 'review');
 * t.search(9.5, 10).map((e) => e.value); // => ['standup']
 * t.searchPoint(10).map((e) => e.value);  // => ['review']
 */
export class IntervalTree<T> implements Iterable<IntervalEntry<T>> {
  readonly bounds: '[]' | '[)';
  readonly #tree = new AvlTree<Key<T>, undefined>(compareKeys, (n) => {
    n.aug = Math.max(n.key.end, n.left ? n.left.aug : -Infinity, n.right ? n.right.aug : -Infinity);
  });
  #seq = 0;

  constructor(options: IntervalTreeOptions = {}) {
    this.bounds = options.bounds ?? '[]';
  }

  /** Number of intervals. O(1). */
  get size(): number {
    return this.#tree.size;
  }

  /** Adds `[start, end]` carrying `value`; duplicates are allowed. Returns the entry handle. O(log n). */
  insert(start: number, end: number, value: T): IntervalEntry<T> {
    assertInterval(start, end);
    const key: Key<T> = { start, end, value, seq: this.#seq++ };
    this.#tree.insert(key, undefined);
    return key;
  }

  /** Removes the entry returned by `insert`. O(log n). */
  remove(entry: IntervalEntry<T>): boolean {
    if (!isKey(entry)) return false;
    const n = this.#tree.find(entry);
    if (n?.key !== entry) return false;
    this.#tree.delete(entry);
    return true;
  }

  /** Removes the first interval with exactly `start`, `end`, and `value` (`Object.is`). O(log n + k). */
  delete(start: number, end: number, value: T): boolean {
    for (const n of this.#tree.ascending({ key: { start, end, value, seq: -Infinity }, exclusive: false })) {
      if (n.key.start !== start || n.key.end !== end) return false;
      if (Object.is(n.key.value, value)) {
        this.#tree.delete(n.key);
        return true;
      }
    }
    return false;
  }

  /** Intervals overlapping `[start, end]` (or `[start, end)` in half-open mode). O(log n + k). */
  search(start: number, end: number): IntervalEntry<T>[] {
    assertInterval(start, end);
    const half = this.bounds === '[)';
    return this.#collect(start, end, half, half);
  }

  /** Intervals containing `point`. O(log n + k). */
  searchPoint(point: number): IntervalEntry<T>[] {
    if (Number.isNaN(point)) throw new ValidationError('HLP_DS_INVALID_INTERVAL', 'The point must be a number.');
    return this.#collect(point, point, this.bounds === '[)', false);
  }

  /** True when any interval overlaps `[start, end]`. O(log n). */
  overlaps(start: number, end: number): boolean {
    assertInterval(start, end);
    const half = this.bounds === '[)';
    return this.#collect(start, end, half, half, 1).length > 0;
  }

  /** Removes every interval. */
  clear(): void {
    this.#tree.clear();
  }

  /** Every entry ordered by start. O(n). */
  toArray(): IntervalEntry<T>[] {
    return [...this];
  }

  /** Iterates entries ordered by start. */
  *[Symbol.iterator](): Iterator<IntervalEntry<T>> {
    for (const n of this.#tree.ascending()) yield n.key;
  }

  /**
   * Pruned in-order walk. A node matches when `end > qs` (`>=` unless `lowStrict`) and
   * `start < qe` (`<=` unless `highStrict`). Subtrees whose max end fails the first test are skipped;
   * the walk stops at the first start failing the second.
   */
  #collect(qs: number, qe: number, lowStrict: boolean, highStrict: boolean, limit = Infinity): IntervalEntry<T>[] {
    const out: IntervalEntry<T>[] = [];
    const endOk = (e: number): boolean => (lowStrict ? e > qs : e >= qs);
    const stack: AvlNode<Key<T>, undefined>[] = [];
    let n = this.#tree.root;
    while (stack.length > 0 || n) {
      while (n && endOk(n.aug)) {
        stack.push(n);
        n = n.left;
      }
      const top = stack.pop();
      if (!top) break;
      const s = top.key.start;
      if (highStrict ? s >= qe : s > qe) break;
      if (endOk(top.key.end)) {
        out.push(top.key);
        if (out.length >= limit) break;
      }
      n = top.right;
    }
    return out;
  }
}

function isKey<T>(entry: IntervalEntry<T>): entry is Key<T> {
  return typeof (entry as Partial<Key<T>>).seq === 'number';
}

function assertInterval(start: number, end: number): void {
  if (Number.isNaN(start) || Number.isNaN(end) || typeof start !== 'number' || typeof end !== 'number' || start > end) {
    throw new ValidationError('HLP_DS_INVALID_INTERVAL', 'An interval needs numeric bounds with start <= end.');
  }
}
