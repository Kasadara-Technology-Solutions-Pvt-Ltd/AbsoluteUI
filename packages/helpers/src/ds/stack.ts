/**
 * Array-backed LIFO stack.
 * Complexity: `push`, `pop`, `peek` O(1) amortized; iteration O(n).
 * @example
 * const s = new Stack([1, 2]);
 * s.push(3);
 * s.pop(); // => 3
 */
export class Stack<T> implements Iterable<T> {
  #items: T[] = [];

  constructor(items?: Iterable<T>) {
    if (items) for (const item of items) this.#items.push(item);
  }

  /** Number of items. O(1). */
  get size(): number {
    return this.#items.length;
  }

  /** True when empty. O(1). */
  isEmpty(): boolean {
    return this.#items.length === 0;
  }

  /** Pushes `item` on top. O(1) amortized. */
  push(item: T): this {
    this.#items.push(item);
    return this;
  }

  /** Removes and returns the top item. O(1). */
  pop(): T | undefined {
    return this.#items.pop();
  }

  /** Returns the top item without removing it. O(1). */
  peek(): T | undefined {
    return this.#items[this.#items.length - 1];
  }

  /** Removes every item. O(1). */
  clear(): void {
    this.#items = [];
  }

  /** Items in pop order (top first). O(n). */
  toArray(): T[] {
    return this.#items.slice().reverse();
  }

  /** Iterates in pop order (top first) without removing. */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = this.#items.length - 1; i >= 0; i--) yield this.#items[i] as T;
  }
}
