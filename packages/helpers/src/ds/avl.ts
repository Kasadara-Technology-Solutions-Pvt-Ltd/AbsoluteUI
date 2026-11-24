/**
 * Internal AVL tree used by `SortedMap`, `SortedSet`, and `IntervalTree`.
 * Height is at most ~1.44|log2(n), so the recursive insert/delete depth stays tiny (< 64 for any
 * array-sized input); traversals are iterative.
 */
import { concurrentModification, type Comparer } from './internal.js';

export class AvlNode<K, V> {
  left: AvlNode<K, V> | undefined = undefined;
  right: AvlNode<K, V> | undefined = undefined;
  height = 1;
  /** Augmented value maintained by the tree's `augment` hook (IntervalTree: max end). */
  aug = 0;
  constructor(
    public key: K,
    public value: V,
  ) {}
}

const h = <K, V>(n: AvlNode<K, V> | undefined): number => (n ? n.height : 0);

export class AvlTree<K, V> {
  root: AvlNode<K, V> | undefined = undefined;
  size = 0;
  /** Incremented on structural change; iterators use it to detect concurrent modification. */
  version = 0;
  readonly cmp: Comparer<K>;
  readonly #augment: ((node: AvlNode<K, V>) => void) | undefined;
  #removed: AvlNode<K, V> | undefined;

  constructor(cmp: Comparer<K>, augment?: (node: AvlNode<K, V>) => void) {
    this.cmp = cmp;
    this.#augment = augment;
  }

  find(key: K): AvlNode<K, V> | undefined {
    let n = this.root;
    while (n) {
      const c = this.cmp(key, n.key);
      if (c === 0) return n;
      n = c < 0 ? n.left : n.right;
    }
    return undefined;
  }

  /** Inserts or replaces; returns true when a new node was added. */
  insert(key: K, value: V): boolean {
    const before = this.size;
    this.root = this.#insert(this.root, key, value);
    if (this.size !== before) this.version++;
    return this.size !== before;
  }

  /** Removes `key`; returns the removed node. */
  delete(key: K): AvlNode<K, V> | undefined {
    this.root = this.#delete(this.root, key);
    const removed = this.#removed;
    this.#removed = undefined;
    if (removed) {
      this.size--;
      this.version++;
    }
    return removed;
  }

  clear(): void {
    this.root = undefined;
    this.size = 0;
    this.version++;
  }

  min(): AvlNode<K, V> | undefined {
    let n = this.root;
    while (n?.left) n = n.left;
    return n;
  }

  max(): AvlNode<K, V> | undefined {
    let n = this.root;
    while (n?.right) n = n.right;
    return n;
  }

  /** Greatest node with key < `key` (or <= when `inclusive`). */
  below(key: K, inclusive: boolean): AvlNode<K, V> | undefined {
    let n = this.root;
    let best: AvlNode<K, V> | undefined;
    while (n) {
      const c = this.cmp(n.key, key);
      if (c < 0 || (inclusive && c === 0)) {
        best = n;
        if (c === 0) return n;
        n = n.right;
      } else n = n.left;
    }
    return best;
  }

  /** Least node with key > `key` (or >= when `inclusive`). */
  above(key: K, inclusive: boolean): AvlNode<K, V> | undefined {
    let n = this.root;
    let best: AvlNode<K, V> | undefined;
    while (n) {
      const c = this.cmp(n.key, key);
      if (c > 0 || (inclusive && c === 0)) {
        best = n;
        if (c === 0) return n;
        n = n.left;
      } else n = n.right;
    }
    return best;
  }

  /**
   * In-order nodes starting at the first key >= `lo` (> when `loExclusive`); all nodes when `lo` is omitted.
   * Iterative; O(log n) to start, O(1) amortized per step.
   */
  *ascending(lo?: { readonly key: K; readonly exclusive: boolean }): Generator<AvlNode<K, V>> {
    const stack: AvlNode<K, V>[] = [];
    let n = this.root;
    while (n) {
      if (lo === undefined) {
        stack.push(n);
        n = n.left;
        continue;
      }
      const c = this.cmp(n.key, lo.key);
      if (c > 0 || (c === 0 && !lo.exclusive)) {
        stack.push(n);
        n = n.left;
      } else n = n.right;
    }
    const version = this.version;
    for (let top = stack.pop(); top; top = stack.pop()) {
      yield top;
      if (version !== this.version) throw concurrentModification();
      for (let m = top.right; m; m = m.left) stack.push(m);
    }
  }

  /** Reverse in-order nodes starting at the last key <= `hi` (< when exclusive). */
  *descending(hi?: { readonly key: K; readonly exclusive: boolean }): Generator<AvlNode<K, V>> {
    const stack: AvlNode<K, V>[] = [];
    let n = this.root;
    while (n) {
      if (hi === undefined) {
        stack.push(n);
        n = n.right;
        continue;
      }
      const c = this.cmp(n.key, hi.key);
      if (c < 0 || (c === 0 && !hi.exclusive)) {
        stack.push(n);
        n = n.right;
      } else n = n.left;
    }
    const version = this.version;
    for (let top = stack.pop(); top; top = stack.pop()) {
      yield top;
      if (version !== this.version) throw concurrentModification();
      for (let m = top.left; m; m = m.right) stack.push(m);
    }
  }

  #fix(n: AvlNode<K, V>): void {
    n.height = 1 + Math.max(h(n.left), h(n.right));
    this.#augment?.(n);
  }

  #rotateRight(n: AvlNode<K, V>): AvlNode<K, V> {
    const l = n.left;
    if (!l) return n;
    n.left = l.right;
    l.right = n;
    this.#fix(n);
    this.#fix(l);
    return l;
  }

  #rotateLeft(n: AvlNode<K, V>): AvlNode<K, V> {
    const r = n.right;
    if (!r) return n;
    n.right = r.left;
    r.left = n;
    this.#fix(n);
    this.#fix(r);
    return r;
  }

  #balance(n: AvlNode<K, V>): AvlNode<K, V> {
    this.#fix(n);
    const bf = h(n.left) - h(n.right);
    if (bf > 1 && n.left) {
      if (h(n.left.left) < h(n.left.right)) n.left = this.#rotateLeft(n.left);
      return this.#rotateRight(n);
    }
    if (bf < -1 && n.right) {
      if (h(n.right.right) < h(n.right.left)) n.right = this.#rotateRight(n.right);
      return this.#rotateLeft(n);
    }
    return n;
  }

  #insert(n: AvlNode<K, V> | undefined, key: K, value: V): AvlNode<K, V> {
    if (!n) {
      this.size++;
      const created = new AvlNode(key, value);
      this.#augment?.(created);
      return created;
    }
    const c = this.cmp(key, n.key);
    if (c < 0) n.left = this.#insert(n.left, key, value);
    else if (c > 0) n.right = this.#insert(n.right, key, value);
    else {
      n.value = value;
      this.#augment?.(n);
      return n;
    }
    return this.#balance(n);
  }

  #delete(n: AvlNode<K, V> | undefined, key: K): AvlNode<K, V> | undefined {
    if (!n) return undefined;
    const c = this.cmp(key, n.key);
    if (c < 0) n.left = this.#delete(n.left, key);
    else if (c > 0) n.right = this.#delete(n.right, key);
    else {
      this.#removed = n;
      if (!n.left) return n.right;
      if (!n.right) return n.left;
      let m = n.right;
      while (m.left) m = m.left;
      const right = this.#deleteMin(n.right);
      m.left = n.left;
      m.right = right;
      return this.#balance(m);
    }
    return this.#balance(n);
  }

  #deleteMin(n: AvlNode<K, V>): AvlNode<K, V> | undefined {
    if (!n.left) return n.right;
    n.left = this.#deleteMin(n.left);
    return this.#balance(n);
  }
}
