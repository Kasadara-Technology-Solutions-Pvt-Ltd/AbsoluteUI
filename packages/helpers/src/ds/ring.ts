import { ValidationError } from '../error/index.js';
import { assertCapacity } from './internal.js';

const MIN_CAPACITY = 8;

/** Growable power-of-two ring buffer shared by `Deque` and `Queue`. */
class Ring<T> {
  buf: (T | undefined)[] = new Array<T | undefined>(MIN_CAPACITY);
  head = 0;
  length = 0;

  get mask(): number {
    return this.buf.length - 1;
  }

  grow(): void {
    const old = this.buf;
    const next = new Array<T | undefined>(old.length * 2);
    for (let i = 0; i < this.length; i++) next[i] = old[(this.head + i) & this.mask];
    this.buf = next;
    this.head = 0;
  }

  pushBack(item: T): void {
    if (this.length === this.buf.length) this.grow();
    this.buf[(this.head + this.length) & this.mask] = item;
    this.length++;
  }

  pushFront(item: T): void {
    if (this.length === this.buf.length) this.grow();
    this.head = (this.head - 1) & this.mask;
    this.buf[this.head] = item;
    this.length++;
  }

  popFront(): T | undefined {
    if (this.length === 0) return undefined;
    const item = this.buf[this.head];
    this.buf[this.head] = undefined;
    this.head = (this.head + 1) & this.mask;
    this.length--;
    return item;
  }

  popBack(): T | undefined {
    if (this.length === 0) return undefined;
    const i = (this.head + this.length - 1) & this.mask;
    const item = this.buf[i];
    this.buf[i] = undefined;
    this.length--;
    return item;
  }

  at(index: number): T | undefined {
    const i = index < 0 ? this.length + index : index;
    if (!Number.isInteger(i) || i < 0 || i >= this.length) return undefined;
    return this.buf[(this.head + i) & this.mask];
  }

  clear(): void {
    this.buf = new Array<T | undefined>(MIN_CAPACITY);
    this.head = 0;
    this.length = 0;
  }

  *values(): Generator<T> {
    for (let i = 0; i < this.length; i++) yield this.buf[(this.head + i) & this.mask] as T;
  }
}

/**
 * Double-ended queue on a growable ring buffer.
 * Complexity: `push`, `pop`, `shift`, `unshift`, `at` O(1) amortized; iteration O(n).
 * @example
 * const d = new Deque<number>();
 * d.push(2); d.unshift(1);
 * d.shift(); // => 1
 * d.pop();   // => 2
 */
export class Deque<T> implements Iterable<T> {
  readonly #ring = new Ring<T>();

  constructor(items?: Iterable<T>) {
    if (items) for (const item of items) this.#ring.pushBack(item);
  }

  /** Number of items. O(1). */
  get size(): number {
    return this.#ring.length;
  }

  /** True when empty. O(1). */
  isEmpty(): boolean {
    return this.#ring.length === 0;
  }

  /** Adds to the back. O(1) amortized. */
  push(item: T): this {
    this.#ring.pushBack(item);
    return this;
  }

  /** Adds to the front. O(1) amortized. */
  unshift(item: T): this {
    this.#ring.pushFront(item);
    return this;
  }

  /** Removes from the back. O(1). */
  pop(): T | undefined {
    return this.#ring.popBack();
  }

  /** Removes from the front. O(1). */
  shift(): T | undefined {
    return this.#ring.popFront();
  }

  /** Front item. O(1). */
  peekFront(): T | undefined {
    return this.#ring.at(0);
  }

  /** Back item. O(1). */
  peekBack(): T | undefined {
    return this.#ring.at(-1);
  }

  /** Item at `index` from the front; negative indexes count from the back. O(1). */
  at(index: number): T | undefined {
    return this.#ring.at(index);
  }

  /** Removes every item. O(1). */
  clear(): void {
    this.#ring.clear();
  }

  /** Items front to back. O(n). */
  toArray(): T[] {
    return [...this.#ring.values()];
  }

  /** Iterates front to back. */
  [Symbol.iterator](): Iterator<T> {
    return this.#ring.values();
  }
}

/**
 * FIFO queue on a growable ring buffer (no O(n) `Array#shift`).
 * Complexity: `enqueue`, `dequeue`, `peek` O(1) amortized; iteration O(n).
 * @example
 * const q = new Queue(['a']);
 * q.enqueue('b');
 * q.dequeue(); // => 'a'
 */
export class Queue<T> implements Iterable<T> {
  readonly #ring = new Ring<T>();

  constructor(items?: Iterable<T>) {
    if (items) for (const item of items) this.#ring.pushBack(item);
  }

  /** Number of items. O(1). */
  get size(): number {
    return this.#ring.length;
  }

  /** True when empty. O(1). */
  isEmpty(): boolean {
    return this.#ring.length === 0;
  }

  /** Adds to the back. O(1) amortized. */
  enqueue(item: T): this {
    this.#ring.pushBack(item);
    return this;
  }

  /** Removes from the front. O(1). */
  dequeue(): T | undefined {
    return this.#ring.popFront();
  }

  /** Front item without removing it. O(1). */
  peek(): T | undefined {
    return this.#ring.at(0);
  }

  /** Removes every item. O(1). */
  clear(): void {
    this.#ring.clear();
  }

  /** Items front to back. O(n). */
  toArray(): T[] {
    return [...this.#ring.values()];
  }

  /** Iterates front to back without removing. */
  [Symbol.iterator](): Iterator<T> {
    return this.#ring.values();
  }
}

/**
 * Fixed-capacity buffer that overwrites the oldest item when full (logs, sliding windows, undo history).
 * Complexity: `push`, `shift`, `pop`, `at` O(1); iteration O(n).
 * @example
 * const b = new CircularBuffer<number>(2);
 * b.push(1); b.push(2); b.push(3); // evicts 1
 * b.toArray(); // => [2, 3]
 */
export class CircularBuffer<T> implements Iterable<T> {
  readonly #buf: (T | undefined)[];
  #head = 0;
  #length = 0;

  constructor(capacity: number) {
    assertCapacity(capacity);
    if (capacity > 2 ** 30) throw new ValidationError('HLP_DS_INVALID_CAPACITY', 'Capacity is too large.');
    this.#buf = new Array<T | undefined>(capacity);
  }

  /** Maximum number of items. */
  get capacity(): number {
    return this.#buf.length;
  }

  /** Number of items. O(1). */
  get size(): number {
    return this.#length;
  }

  /** True when `size === capacity`. */
  isFull(): boolean {
    return this.#length === this.#buf.length;
  }

  /** True when empty. */
  isEmpty(): boolean {
    return this.#length === 0;
  }

  /** Appends `item`; when full, overwrites and returns the oldest item. O(1). */
  push(item: T): T | undefined {
    const cap = this.#buf.length;
    if (this.#length < cap) {
      this.#buf[(this.#head + this.#length) % cap] = item;
      this.#length++;
      return undefined;
    }
    const evicted = this.#buf[this.#head];
    this.#buf[this.#head] = item;
    this.#head = (this.#head + 1) % cap;
    return evicted;
  }

  /** Removes and returns the oldest item. O(1). */
  shift(): T | undefined {
    if (this.#length === 0) return undefined;
    const item = this.#buf[this.#head];
    this.#buf[this.#head] = undefined;
    this.#head = (this.#head + 1) % this.#buf.length;
    this.#length--;
    return item;
  }

  /** Removes and returns the newest item. O(1). */
  pop(): T | undefined {
    if (this.#length === 0) return undefined;
    const i = (this.#head + this.#length - 1) % this.#buf.length;
    const item = this.#buf[i];
    this.#buf[i] = undefined;
    this.#length--;
    return item;
  }

  /** Item at `index` (0 = oldest); negative indexes count from the newest. O(1). */
  at(index: number): T | undefined {
    const i = index < 0 ? this.#length + index : index;
    if (!Number.isInteger(i) || i < 0 || i >= this.#length) return undefined;
    return this.#buf[(this.#head + i) % this.#buf.length];
  }

  /** Removes every item. O(capacity). */
  clear(): void {
    this.#buf.fill(undefined);
    this.#head = 0;
    this.#length = 0;
  }

  /** Items oldest to newest. O(n). */
  toArray(): T[] {
    return [...this];
  }

  /** Iterates oldest to newest. */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.#length; i++) yield this.#buf[(this.#head + i) % this.#buf.length] as T;
  }
}
