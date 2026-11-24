import { ValidationError } from '../error/index.js';

/** Node handle returned by `LinkedList`; links are read-only to callers. */
export interface LinkedListNode<T> {
  value: T;
  readonly prev: LinkedListNode<T> | undefined;
  readonly next: LinkedListNode<T> | undefined;
}

class Node<T> implements LinkedListNode<T> {
  prev: Node<T> | undefined = undefined;
  next: Node<T> | undefined = undefined;
  owner: LinkedList<T> | undefined;
  constructor(public value: T, owner: LinkedList<T>) {
    this.owner = owner;
  }
}

/**
 * Doubly linked list with node handles for O(1) insertion and removal anywhere.
 * Complexity: `push`, `pop`, `shift`, `unshift`, `insertAfter`, `insertBefore`, `remove` O(1);
 * `find`, `reverse`, iteration O(n).
 * @example
 * const list = new LinkedList([1, 3]);
 * const one = list.find((v) => v === 1)!;
 * list.insertAfter(one, 2);
 * list.toArray(); // => [1, 2, 3]
 */
export class LinkedList<T> implements Iterable<T> {
  #head: Node<T> | undefined;
  #tail: Node<T> | undefined;
  #size = 0;

  constructor(items?: Iterable<T>) {
    if (items) for (const item of items) this.push(item);
  }

  /** Number of nodes. O(1). */
  get size(): number {
    return this.#size;
  }

  /** First node. */
  get head(): LinkedListNode<T> | undefined {
    return this.#head;
  }

  /** Last node. */
  get tail(): LinkedListNode<T> | undefined {
    return this.#tail;
  }

  /** True when empty. */
  isEmpty(): boolean {
    return this.#size === 0;
  }

  /** Appends `value`; returns its node. O(1). */
  push(value: T): LinkedListNode<T> {
    const node = new Node(value, this);
    this.#linkAfter(this.#tail, node);
    return node;
  }

  /** Prepends `value`; returns its node. O(1). */
  unshift(value: T): LinkedListNode<T> {
    const node = new Node(value, this);
    this.#linkAfter(undefined, node);
    return node;
  }

  /** Removes the last value. O(1). */
  pop(): T | undefined {
    const node = this.#tail;
    if (!node) return undefined;
    this.#unlink(node);
    return node.value;
  }

  /** Removes the first value. O(1). */
  shift(): T | undefined {
    const node = this.#head;
    if (!node) return undefined;
    this.#unlink(node);
    return node.value;
  }

  /** Inserts `value` after `node` (which must belong to this list). O(1). */
  insertAfter(node: LinkedListNode<T>, value: T): LinkedListNode<T> {
    const anchor = this.#own(node);
    const created = new Node(value, this);
    this.#linkAfter(anchor, created);
    return created;
  }

  /** Inserts `value` before `node` (which must belong to this list). O(1). */
  insertBefore(node: LinkedListNode<T>, value: T): LinkedListNode<T> {
    const anchor = this.#own(node);
    const created = new Node(value, this);
    this.#linkAfter(anchor.prev, created);
    return created;
  }

  /** Removes `node` (which must belong to this list); returns its value. O(1). */
  remove(node: LinkedListNode<T>): T {
    const own = this.#own(node);
    this.#unlink(own);
    return own.value;
  }

  /** First node whose value satisfies `predicate`. O(n). */
  find(predicate: (value: T) => boolean): LinkedListNode<T> | undefined {
    for (let n = this.#head; n; n = n.next) if (predicate(n.value)) return n;
    return undefined;
  }

  /** Reverses the list in place. O(n). */
  reverse(): this {
    let n = this.#head;
    while (n) {
      const next = n.next;
      n.next = n.prev;
      n.prev = next;
      n = next;
    }
    [this.#head, this.#tail] = [this.#tail, this.#head];
    return this;
  }

  /** Removes every node (detached handles become invalid). O(n). */
  clear(): void {
    for (let n = this.#head; n; ) {
      const next = n.next;
      n.owner = undefined;
      n.prev = n.next = undefined;
      n = next;
    }
    this.#head = this.#tail = undefined;
    this.#size = 0;
  }

  /** Values head to tail. O(n). */
  toArray(): T[] {
    return [...this];
  }

  /** Iterates node handles head to tail. */
  *nodes(): Generator<LinkedListNode<T>> {
    for (let n = this.#head; n; n = n.next) yield n;
  }

  /** Iterates values head to tail. */
  *[Symbol.iterator](): Iterator<T> {
    for (let n = this.#head; n; n = n.next) yield n.value;
  }

  #own(node: LinkedListNode<T>): Node<T> {
    if (!(node instanceof Node) || node.owner !== this) throw new ValidationError('HLP_DS_FOREIGN_NODE', 'The node does not belong to this list.');
    return node as Node<T>;
  }

  #linkAfter(prev: Node<T> | undefined, node: Node<T>): void {
    const next = prev ? prev.next : this.#head;
    node.prev = prev;
    node.next = next;
    if (prev) prev.next = node;
    else this.#head = node;
    if (next) next.prev = node;
    else this.#tail = node;
    this.#size++;
  }

  #unlink(node: Node<T>): void {
    if (node.prev) node.prev.next = node.next;
    else this.#head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.#tail = node.prev;
    node.prev = node.next = undefined;
    node.owner = undefined;
    this.#size--;
  }
}
