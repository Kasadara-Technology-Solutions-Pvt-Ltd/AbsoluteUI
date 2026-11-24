import { assertCapacity, assertTtl } from './internal.js';

/** Why a cache dropped an entry on its own. */
export type EvictionReason = 'capacity' | 'expired';

export interface LRUCacheOptions<K, V> {
  /** Maximum entries. Default 1000. */
  readonly maxSize?: number;
  /** Default time to live per entry in ms. Expiry is lazy (checked on access or `prune`). */
  readonly ttlMs?: number;
  /** Called when an entry is evicted for capacity or found expired. Not called on `delete`/`clear`. */
  readonly onEvict?: (key: K, value: V, reason: EvictionReason) => void;
  /** Clock in ms, injectable for tests. Default `Date.now`. */
  readonly now?: () => number;
}

interface Timed<V> {
  value: V;
  expires: number;
}

/**
 * Least-recently-used cache on an insertion-ordered `Map`.
 * Complexity: `get`, `set`, `has`, `peek`, `delete` O(1); `prune` and iteration O(n).
 * Iteration runs least to most recently used and skips expired entries.
 * @example
 * const c = new LRUCache<string, number>({ maxSize: 2 });
 * c.set('a', 1).set('b', 2);
 * c.get('a');
 * c.set('c', 3); // evicts 'b'
 */
export class LRUCache<K, V> implements Iterable<[K, V]> {
  readonly maxSize: number;
  readonly #map = new Map<K, Timed<V>>();
  readonly #ttl: number | undefined;
  readonly #onEvict: ((key: K, value: V, reason: EvictionReason) => void) | undefined;
  readonly #now: () => number;

  constructor(options: LRUCacheOptions<K, V> = {}) {
    this.maxSize = options.maxSize ?? 1000;
    assertCapacity(this.maxSize);
    if (options.ttlMs !== undefined) assertTtl(options.ttlMs);
    this.#ttl = options.ttlMs;
    this.#onEvict = options.onEvict;
    this.#now = options.now ?? Date.now;
  }

  /** Stored entries, possibly including expired ones not yet pruned. O(1). */
  get size(): number {
    return this.#map.size;
  }

  /** Value for `key`, marking it most recently used. O(1). */
  get(key: K): V | undefined {
    const e = this.#live(key);
    if (!e) return undefined;
    this.#map.delete(key);
    this.#map.set(key, e);
    return e.value;
  }

  /** Value for `key` without changing recency. O(1). */
  peek(key: K): V | undefined {
    return this.#live(key)?.value;
  }

  /** True when `key` is present and not expired; does not change recency. O(1). */
  has(key: K): boolean {
    return this.#live(key) !== undefined;
  }

  /** Stores `value` as most recently used; `ttlMs` overrides the default for this entry. O(1). */
  set(key: K, value: V, options: { readonly ttlMs?: number } = {}): this {
    const ttl = options.ttlMs ?? this.#ttl;
    if (options.ttlMs !== undefined) assertTtl(options.ttlMs);
    this.#map.delete(key);
    this.#map.set(key, { value, expires: ttl === undefined ? Infinity : this.#now() + ttl });
    while (this.#map.size > this.maxSize) {
      const first = this.#map.entries().next();
      if (first.done) break;
      const [k, e] = first.value;
      this.#map.delete(k);
      this.#onEvict?.(k, e.value, e.expires <= this.#now() ? 'expired' : 'capacity');
    }
    return this;
  }

  /** Removes `key`. O(1). */
  delete(key: K): boolean {
    return this.#map.delete(key);
  }

  /** Removes every entry. */
  clear(): void {
    this.#map.clear();
  }

  /** Removes expired entries now; returns how many were removed. O(n). */
  prune(): number {
    const now = this.#now();
    let removed = 0;
    for (const [k, e] of [...this.#map]) {
      if (e.expires <= now) {
        this.#map.delete(k);
        removed++;
        this.#onEvict?.(k, e.value, 'expired');
      }
    }
    return removed;
  }

  /** Live keys, least to most recently used. */
  *keys(): Generator<K> {
    for (const [k] of this) yield k;
  }

  /** Live values, least to most recently used. */
  *values(): Generator<V> {
    for (const [, v] of this) yield v;
  }

  /** Live entries, least to most recently used. O(n). */
  toArray(): [K, V][] {
    return [...this];
  }

  /** Iterates live entries, least to most recently used. */
  *[Symbol.iterator](): Iterator<[K, V]> {
    const now = this.#now();
    for (const [k, e] of [...this.#map]) if (e.expires > now) yield [k, e.value];
  }

  #live(key: K): Timed<V> | undefined {
    const e = this.#map.get(key);
    if (!e) return undefined;
    if (e.expires <= this.#now()) {
      this.#map.delete(key);
      this.#onEvict?.(key, e.value, 'expired');
      return undefined;
    }
    return e;
  }
}

// ---------------------------------------------------------------------------
// LFU

interface FreqNode<K> {
  freq: number;
  keys: Set<K>;
  prev: FreqNode<K> | undefined;
  next: FreqNode<K> | undefined;
}

interface LfuEntry<K, V> {
  value: V;
  node: FreqNode<K>;
}

export interface LFUCacheOptions<K, V> {
  /** Maximum entries (required). */
  readonly maxSize: number;
  /** Called when an entry is evicted for capacity. */
  readonly onEvict?: (key: K, value: V) => void;
}

/**
 * Least-frequently-used cache with O(1) operations (frequency buckets in a linked list;
 * ties broken by least recent use within a bucket).
 * Complexity: `get`, `set`, `has`, `peek`, `delete` O(1); iteration O(n).
 * @example
 * const c = new LFUCache<string, number>({ maxSize: 2 });
 * c.set('a', 1).set('b', 2);
 * c.get('a'); c.get('a');
 * c.set('c', 3); // evicts 'b' (used least)
 */
export class LFUCache<K, V> implements Iterable<[K, V]> {
  readonly maxSize: number;
  readonly #map = new Map<K, LfuEntry<K, V>>();
  /** Sentinel; `head.next` is the lowest frequency bucket. */
  readonly #head: FreqNode<K> = { freq: 0, keys: new Set(), prev: undefined, next: undefined };
  readonly #onEvict: ((key: K, value: V) => void) | undefined;

  constructor(options: LFUCacheOptions<K, V>) {
    assertCapacity(options.maxSize);
    this.maxSize = options.maxSize;
    this.#onEvict = options.onEvict;
  }

  /** Number of entries. O(1). */
  get size(): number {
    return this.#map.size;
  }

  /** Value for `key`, incrementing its use count. O(1). */
  get(key: K): V | undefined {
    const e = this.#map.get(key);
    if (!e) return undefined;
    this.#touch(key, e);
    return e.value;
  }

  /** Value without counting a use. O(1). */
  peek(key: K): V | undefined {
    return this.#map.get(key)?.value;
  }

  /** True when `key` is present. O(1). */
  has(key: K): boolean {
    return this.#map.has(key);
  }

  /** Use count for `key` (0 when absent). O(1). */
  frequency(key: K): number {
    return this.#map.get(key)?.node.freq ?? 0;
  }

  /** Stores `value`; updating an existing key counts as a use. O(1). */
  set(key: K, value: V): this {
    const existing = this.#map.get(key);
    if (existing) {
      existing.value = value;
      this.#touch(key, existing);
      return this;
    }
    if (this.#map.size >= this.maxSize) this.#evict();
    let node = this.#head.next;
    if (node?.freq !== 1) node = this.#insertAfter(this.#head, 1);
    node.keys.add(key);
    this.#map.set(key, { value, node });
    return this;
  }

  /** Removes `key`. O(1). */
  delete(key: K): boolean {
    const e = this.#map.get(key);
    if (!e) return false;
    this.#map.delete(key);
    e.node.keys.delete(key);
    if (e.node.keys.size === 0) this.#removeNode(e.node);
    return true;
  }

  /** Removes every entry. */
  clear(): void {
    this.#map.clear();
    this.#head.next = undefined;
  }

  /** Entries from least to most frequently used. O(n). */
  toArray(): [K, V][] {
    return [...this];
  }

  /** Iterates entries from least to most frequently used. */
  *[Symbol.iterator](): Iterator<[K, V]> {
    const out: [K, V][] = [];
    for (let n = this.#head.next; n; n = n.next) for (const k of n.keys) {
      const e = this.#map.get(k);
      if (e) out.push([k, e.value]);
    }
    yield* out;
  }

  #touch(key: K, e: LfuEntry<K, V>): void {
    const node = e.node;
    let next = node.next;
    if (next?.freq !== node.freq + 1) next = this.#insertAfter(node, node.freq + 1);
    node.keys.delete(key);
    next.keys.add(key);
    e.node = next;
    if (node.keys.size === 0) this.#removeNode(node);
  }

  #evict(): void {
    const node = this.#head.next;
    if (!node) return;
    const first = node.keys.values().next();
    if (first.done) return;
    const key = first.value;
    const e = this.#map.get(key);
    this.delete(key);
    if (e) this.#onEvict?.(key, e.value);
  }

  #insertAfter(prev: FreqNode<K>, freq: number): FreqNode<K> {
    const node: FreqNode<K> = { freq, keys: new Set(), prev, next: prev.next };
    if (prev.next) prev.next.prev = node;
    prev.next = node;
    return node;
  }

  #removeNode(node: FreqNode<K>): void {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    node.prev = node.next = undefined;
  }
}

// ---------------------------------------------------------------------------
// TTL

export interface TTLCacheOptions<K, V> {
  /** Default time to live in ms (required). */
  readonly ttlMs: number;
  /** Optional capacity; the oldest inserted entry is evicted first. */
  readonly maxSize?: number;
  /** Called when an entry expires (on access or `prune`) or is evicted for capacity. */
  readonly onEvict?: (key: K, value: V, reason: EvictionReason) => void;
  /** Clock in ms, injectable for tests. Default `Date.now`. */
  readonly now?: () => number;
}

/**
 * Cache whose entries expire after a per-entry time to live. Expiry is lazy; call `prune()`
 * periodically to reclaim memory. Access does not refresh the TTL (use `touch`).
 * Complexity: `get`, `set`, `has`, `delete`, `touch` O(1); `prune` and iteration O(n).
 * @example
 * const c = new TTLCache<string, string>({ ttlMs: 60_000 });
 * c.set('token', 'abc', { ttlMs: 5_000 });
 * c.get('token'); // 'abc' until 5 s later
 */
export class TTLCache<K, V> implements Iterable<[K, V]> {
  readonly #map = new Map<K, Timed<V>>();
  readonly #ttl: number;
  readonly #max: number | undefined;
  readonly #onEvict: ((key: K, value: V, reason: EvictionReason) => void) | undefined;
  readonly #now: () => number;

  constructor(options: TTLCacheOptions<K, V>) {
    assertTtl(options.ttlMs);
    if (options.maxSize !== undefined) assertCapacity(options.maxSize);
    this.#ttl = options.ttlMs;
    this.#max = options.maxSize;
    this.#onEvict = options.onEvict;
    this.#now = options.now ?? Date.now;
  }

  /** Stored entries, possibly including expired ones not yet pruned. */
  get size(): number {
    return this.#map.size;
  }

  /** Stores `value` with `ttlMs` (default from options). O(1). */
  set(key: K, value: V, options: { readonly ttlMs?: number } = {}): this {
    const ttl = options.ttlMs ?? this.#ttl;
    assertTtl(ttl);
    this.#map.delete(key);
    this.#map.set(key, { value, expires: this.#now() + ttl });
    if (this.#max !== undefined) {
      while (this.#map.size > this.#max) {
        const first = this.#map.entries().next();
        if (first.done) break;
        const [k, e] = first.value;
        this.#map.delete(k);
        this.#onEvict?.(k, e.value, 'capacity');
      }
    }
    return this;
  }

  /** Live value for `key`. O(1). */
  get(key: K): V | undefined {
    return this.#live(key)?.value;
  }

  /** True when `key` is present and not expired. O(1). */
  has(key: K): boolean {
    return this.#live(key) !== undefined;
  }

  /** Milliseconds until `key` expires, or `undefined` when absent. */
  ttlRemaining(key: K): number | undefined {
    const e = this.#live(key);
    return e ? e.expires - this.#now() : undefined;
  }

  /** Restarts the TTL of a live entry; returns false when absent. */
  touch(key: K, ttlMs: number = this.#ttl): boolean {
    assertTtl(ttlMs);
    const e = this.#live(key);
    if (!e) return false;
    e.expires = this.#now() + ttlMs;
    return true;
  }

  /** Removes `key`. */
  delete(key: K): boolean {
    return this.#map.delete(key);
  }

  /** Removes every entry. */
  clear(): void {
    this.#map.clear();
  }

  /** Removes expired entries now; returns how many were removed. O(n). */
  prune(): number {
    const now = this.#now();
    let removed = 0;
    for (const [k, e] of [...this.#map]) {
      if (e.expires <= now) {
        this.#map.delete(k);
        removed++;
        this.#onEvict?.(k, e.value, 'expired');
      }
    }
    return removed;
  }

  /** Live entries in insertion order. */
  toArray(): [K, V][] {
    return [...this];
  }

  /** Iterates live entries in insertion order. */
  *[Symbol.iterator](): Iterator<[K, V]> {
    const now = this.#now();
    for (const [k, e] of [...this.#map]) if (e.expires > now) yield [k, e.value];
  }

  #live(key: K): Timed<V> | undefined {
    const e = this.#map.get(key);
    if (!e) return undefined;
    if (e.expires <= this.#now()) {
      this.#map.delete(key);
      this.#onEvict?.(key, e.value, 'expired');
      return undefined;
    }
    return e;
  }
}
