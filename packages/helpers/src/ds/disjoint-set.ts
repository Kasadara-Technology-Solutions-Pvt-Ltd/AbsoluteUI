/**
 * Union-find with path compression and union by rank.
 * Complexity: `add`, `find`, `union`, `connected`, `sizeOf` O(α(n)) amortized (effectively constant);
 * `sets` O(n). `find` is iterative.
 * @example
 * const ds = new DisjointSet(['a', 'b', 'c']);
 * ds.union('a', 'b');
 * ds.connected('a', 'b'); // => true
 * ds.setCount;            // => 2
 */
export class DisjointSet<T> implements Iterable<T> {
  readonly #parent = new Map<T, T>();
  readonly #rank = new Map<T, number>();
  readonly #sizes = new Map<T, number>();
  #sets = 0;

  constructor(items?: Iterable<T>) {
    if (items) for (const item of items) this.add(item);
  }

  /** Number of elements. O(1). */
  get size(): number {
    return this.#parent.size;
  }

  /** Number of disjoint sets. O(1). */
  get setCount(): number {
    return this.#sets;
  }

  /** Adds `item` as a singleton set if absent. */
  add(item: T): this {
    if (!this.#parent.has(item)) {
      this.#parent.set(item, item);
      this.#rank.set(item, 0);
      this.#sizes.set(item, 1);
      this.#sets++;
    }
    return this;
  }

  /** True when `item` has been added. */
  has(item: T): boolean {
    return this.#parent.has(item);
  }

  /** Representative of `item`'s set, or `undefined` when absent. */
  find(item: T): T | undefined {
    if (!this.#parent.has(item)) return undefined;
    let root = item;
    for (let p = this.#parent.get(root) as T; p !== root; p = this.#parent.get(root) as T) root = p;
    // Path compression.
    for (let x = item; x !== root; ) {
      const next = this.#parent.get(x) as T;
      this.#parent.set(x, root);
      x = next;
    }
    return root;
  }

  /** Merges the sets of `a` and `b` (adding either if absent). Returns false when already joined. */
  union(a: T, b: T): boolean {
    this.add(a).add(b);
    const ra = this.find(a) as T;
    const rb = this.find(b) as T;
    if (ra === rb) return false;
    const rankA = this.#rank.get(ra) ?? 0;
    const rankB = this.#rank.get(rb) ?? 0;
    const [big, small] = rankA >= rankB ? [ra, rb] : [rb, ra];
    this.#parent.set(small, big);
    if (rankA === rankB) this.#rank.set(big, rankA + 1);
    this.#sizes.set(big, (this.#sizes.get(big) ?? 0) + (this.#sizes.get(small) ?? 0));
    this.#sizes.delete(small);
    this.#sets--;
    return true;
  }

  /** True when `a` and `b` are in the same set. */
  connected(a: T, b: T): boolean {
    return this.#parent.has(a) && this.#parent.has(b) && this.find(a) === this.find(b);
  }

  /** Size of `item`'s set (0 when absent). */
  sizeOf(item: T): number {
    if (!this.#parent.has(item)) return 0;
    return this.#sizes.get(this.find(item) as T) ?? 0;
  }

  /** Every set as an array, in first-seen order. O(n). */
  sets(): T[][] {
    const groups = new Map<T, T[]>();
    for (const item of this.#parent.keys()) {
      const r = this.find(item) as T;
      const g = groups.get(r);
      if (g) g.push(item);
      else groups.set(r, [item]);
    }
    return [...groups.values()];
  }

  /** Removes every element. */
  clear(): void {
    this.#parent.clear();
    this.#rank.clear();
    this.#sizes.clear();
    this.#sets = 0;
  }

  /** Elements in insertion order. */
  toArray(): T[] {
    return [...this.#parent.keys()];
  }

  /** Iterates elements in insertion order. */
  [Symbol.iterator](): Iterator<T> {
    return this.#parent.keys();
  }
}
