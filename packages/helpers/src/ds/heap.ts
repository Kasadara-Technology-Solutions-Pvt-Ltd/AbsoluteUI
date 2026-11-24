import { naturalCompare, type Comparer } from './internal.js';

/**
 * Array-backed binary min-heap ordered by `comparer` (pass a reversed comparer for a max-heap).
 * Complexity: `push`, `pop`, `replace` O(log n); `peek` O(1); construction from an iterable O(n);
 * `remove` O(n). Iteration order is the internal heap order; use `drain()` for sorted order.
 * @example
 * const h = new BinaryHeap([5, 1, 3]);
 * h.pop(); // => 1
 * const byPriority = new BinaryHeap<{ p: number }>([], (a, b) => a.p - b.p);
 */
export class BinaryHeap<T> implements Iterable<T> {
  #items: T[];
  readonly #cmp: Comparer<T>;

  constructor(items?: Iterable<T>, comparer: Comparer<T> = naturalCompare) {
    this.#cmp = comparer;
    this.#items = items ? [...items] : [];
    for (let i = (this.#items.length >> 1) - 1; i >= 0; i--) this.#down(i);
  }

  /** Builds a heap from `items` in O(n). */
  static from<T>(items: Iterable<T>, comparer: Comparer<T> = naturalCompare): BinaryHeap<T> {
    return new BinaryHeap(items, comparer);
  }

  /** Number of items. O(1). */
  get size(): number {
    return this.#items.length;
  }

  /** True when empty. */
  isEmpty(): boolean {
    return this.#items.length === 0;
  }

  /** Adds `item`. O(log n). */
  push(item: T): this {
    this.#items.push(item);
    this.#up(this.#items.length - 1);
    return this;
  }

  /** Smallest item without removing it. O(1). */
  peek(): T | undefined {
    return this.#items[0];
  }

  /** Removes and returns the smallest item. O(log n). */
  pop(): T | undefined {
    const items = this.#items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop() as T;
    if (items.length > 0) {
      items[0] = last;
      this.#down(0);
    }
    return top;
  }

  /** Pops the smallest item and pushes `item` in one sift. Returns the popped item (undefined if it was empty). O(log n). */
  replace(item: T): T | undefined {
    const items = this.#items;
    if (items.length === 0) {
      items.push(item);
      return undefined;
    }
    const top = items[0];
    items[0] = item;
    this.#down(0);
    return top;
  }

  /** Removes the first item equal to `item` (by `equals`, default `Object.is`). O(n). */
  remove(item: T, equals: (a: T, b: T) => boolean = Object.is): boolean {
    const items = this.#items;
    const i = items.findIndex((x) => equals(x, item));
    if (i < 0) return false;
    const last = items.pop() as T;
    if (i < items.length) {
      items[i] = last;
      this.#down(i);
      this.#up(i);
    }
    return true;
  }

  /** Removes every item. */
  clear(): void {
    this.#items = [];
  }

  /** Items in internal heap order (not sorted). O(n). */
  toArray(): T[] {
    return this.#items.slice();
  }

  /** Items in ascending order without modifying the heap. O(n log n). */
  toSortedArray(): T[] {
    return this.#items.slice().sort(this.#cmp);
  }

  /** Pops every item in ascending order, emptying the heap. */
  *drain(): Generator<T> {
    while (this.#items.length > 0) yield this.pop() as T;
  }

  /** Iterates in internal heap order without removing. */
  [Symbol.iterator](): Iterator<T> {
    return this.#items.slice()[Symbol.iterator]();
  }

  #up(index: number): void {
    const items = this.#items;
    const item = items[index] as T;
    let i = index;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const parent = items[p] as T;
      if (this.#cmp(item, parent) >= 0) break;
      items[i] = parent;
      i = p;
    }
    items[i] = item;
  }

  #down(index: number): void {
    const items = this.#items;
    const n = items.length;
    const item = items[index] as T;
    let i = index;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      let c = l;
      if (r < n && this.#cmp(items[r] as T, items[l] as T) < 0) c = r;
      const child = items[c] as T;
      if (this.#cmp(child, item) >= 0) break;
      items[i] = child;
      i = c;
    }
    items[i] = item;
  }
}

/**
 * Priority queue (alias of `BinaryHeap`): lowest value per `comparer` comes out first.
 * @example
 * const pq = new PriorityQueue<[number, string]>([], (a, b) => a[0] - b[0]);
 * pq.push([2, 'b']).push([1, 'a']);
 * pq.pop(); // => [1, 'a']
 */
export class PriorityQueue<T> extends BinaryHeap<T> {}
