/**
 * Pipeable LINQ operators (docs/PLAN-HELPERS.md section 2, decision 4). Each export is a standalone,
 * tree-shakeable factory. Intermediate operators return lazy, re-iterable `Iterable`s: nothing runs
 * until a terminal operator (or `for...of`) pulls values, and every iteration re-runs the pipeline.
 */
import { ConflictError, NotFoundError, ValidationError } from '../error/index.js';

/** Lazy transformation of one sequence into another. */
export type Operator<T, U> = (source: Iterable<T>) => Iterable<U>;
/** Consumes a sequence into a value. */
export type Terminal<T, R> = (source: Iterable<T>) => R;
/** Key comparer: negative, zero, or positive. */
export type KeyComparer<K> = (a: K, b: K) => number;
/** Equality test used by `contains` and `sequenceEqual`. */
export type EqualityComparer<T> = (a: T, b: T) => boolean;

const seq = <T>(generator: () => Iterator<T>): Iterable<T> => ({ [Symbol.iterator]: generator });

/** SameValueZero, as used by `Set`, `Map`, and `Array#includes`. */
export const sameValueZero = (a: unknown, b: unknown): boolean => a === b || (a !== a && b !== b);

const noElements = (): NotFoundError => new NotFoundError('HLP_LINQ_NO_ELEMENTS', 'The sequence contains no matching element.');
const multipleElements = (): ConflictError => new ConflictError('HLP_LINQ_MULTIPLE_ELEMENTS', 'The sequence contains more than one matching element.');
const outOfRange = (): NotFoundError => new NotFoundError('HLP_LINQ_INDEX_OUT_OF_RANGE', 'The index is out of range.');

/**
 * Throws `HLP_LINQ_INVALID_ARGUMENT` unless `n` is a non-negative safe integer.
 * @example
 * assertCount(3); // => undefined
 * assertCount(-1); // => throws HLP_LINQ_INVALID_ARGUMENT
 */
export function assertCount(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new ValidationError('HLP_LINQ_INVALID_ARGUMENT', 'Count must be a non-negative integer.');
}

function rank(v: unknown): number {
  if (v === null || v === undefined) return 0;
  switch (typeof v) {
    case 'boolean':
      return 1;
    case 'number':
      return Number.isNaN(v) ? 0 : 2;
    case 'bigint':
      return 2;
    case 'string':
      return 3;
    default:
      if (v instanceof Date) return Number.isNaN(v.getTime()) ? 0 : 4;
      return 5;
  }
}

/**
 * Default key order: nullish/`NaN` first, then booleans, numbers and bigints, strings (code-unit order), dates.
 * @example
 * [3, null, 1].sort(defaultCompare); // => [null, 1, 3]
 */
export function defaultCompare(a: unknown, b: unknown): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0 || ra === 5) return 0;
  if (ra === 4) return (a as Date).getTime() - (b as Date).getTime();
  const x = a as string | number | bigint | boolean;
  const y = b as string | number | bigint | boolean;
  return x === y ? 0 : x < y ? -1 : x > y ? 1 : 0;
}

// ---------------------------------------------------------------------------
// pipe

/**
 * Threads `source` through operators left to right; the last may be a terminal.
 * @example
 * pipe([5, 1, 4], where((n) => n > 1), orderBy((n) => n), toArray()); // => [4, 5]
 */
export function pipe<A>(source: A): A;
export function pipe<A, B>(source: A, op1: (a: A) => B): B;
export function pipe<A, B, C>(source: A, op1: (a: A) => B, op2: (b: B) => C): C;
export function pipe<A, B, C, D>(source: A, op1: (a: A) => B, op2: (b: B) => C, op3: (c: C) => D): D;
export function pipe<A, B, C, D, E>(source: A, op1: (a: A) => B, op2: (b: B) => C, op3: (c: C) => D, op4: (d: D) => E): E;
export function pipe<A, B, C, D, E, F>(source: A, op1: (a: A) => B, op2: (b: B) => C, op3: (c: C) => D, op4: (d: D) => E, op5: (e: E) => F): F;
export function pipe<A, B, C, D, E, F, G>(source: A, op1: (a: A) => B, op2: (b: B) => C, op3: (c: C) => D, op4: (d: D) => E, op5: (e: E) => F, op6: (f: F) => G): G;
export function pipe<A, B, C, D, E, F, G, H>(source: A, op1: (a: A) => B, op2: (b: B) => C, op3: (c: C) => D, op4: (d: D) => E, op5: (e: E) => F, op6: (f: F) => G, op7: (g: G) => H): H;
export function pipe<A, B, C, D, E, F, G, H, I>(source: A, op1: (a: A) => B, op2: (b: B) => C, op3: (c: C) => D, op4: (d: D) => E, op5: (e: E) => F, op6: (f: F) => G, op7: (g: G) => H, op8: (h: H) => I): I;
export function pipe<A, B, C, D, E, F, G, H, I, J>(source: A, op1: (a: A) => B, op2: (b: B) => C, op3: (c: C) => D, op4: (d: D) => E, op5: (e: E) => F, op6: (f: F) => G, op7: (g: G) => H, op8: (h: H) => I, op9: (i: I) => J): J;
export function pipe(source: unknown, ...ops: ((value: unknown) => unknown)[]): unknown;
export function pipe(source: unknown, ...ops: ((value: unknown) => unknown)[]): unknown {
  return ops.reduce((acc, op) => op(acc), source);
}

// ---------------------------------------------------------------------------
// Filtering and projection

/**
 * Keeps items matching `predicate(item, index)`.
 * @example
 * pipe([1, 2, 3], where((n) => n > 1), toArray()); // => [2, 3]
 */
export function where<T, S extends T>(predicate: (item: T, index: number) => item is S): Operator<T, S>;
export function where<T>(predicate: (item: T, index: number) => boolean): Operator<T, T>;
export function where<T>(predicate: (item: T, index: number) => boolean): Operator<T, T> {
  return (source) =>
    seq(function* () {
      let i = 0;
      for (const x of source) if (predicate(x, i++)) yield x;
    });
}

/**
 * Keeps items passing a type guard (the `OfType` equivalent).
 * @example
 * pipe([1, 'a', 2], whereType((x): x is number => typeof x === 'number'), toArray()); // => [1, 2]
 */
export function whereType<T, S extends T>(guard: (item: T) => item is S): Operator<T, S> {
  return (source) =>
    seq(function* () {
      for (const x of source) if (guard(x)) yield x;
    });
}

/**
 * Maps items with `selector(item, index)`.
 * @example
 * pipe([1, 2], select((n, i) => n * 10 + i), toArray()); // => [10, 21]
 */
export function select<T, U>(selector: (item: T, index: number) => U): Operator<T, U> {
  return (source) =>
    seq(function* () {
      let i = 0;
      for (const x of source) yield selector(x, i++);
    });
}

/**
 * Maps each item to a sequence and flattens, optionally projecting `(item, child)`.
 * @example
 * pipe([[1, 2], [3]], selectMany((a) => a), toArray()); // => [1, 2, 3]
 */
export function selectMany<T, U>(selector: (item: T, index: number) => Iterable<U>): Operator<T, U>;
export function selectMany<T, U, R>(selector: (item: T, index: number) => Iterable<U>, resultSelector: (item: T, child: U) => R): Operator<T, R>;
export function selectMany<T, U, R>(selector: (item: T, index: number) => Iterable<U>, resultSelector?: (item: T, child: U) => R): Operator<T, U | R> {
  return (source) =>
    seq(function* () {
      let i = 0;
      for (const x of source) for (const c of selector(x, i++)) yield resultSelector ? resultSelector(x, c) : c;
    });
}

// ---------------------------------------------------------------------------
// Ordering

interface SortSpec<T> {
  // Method syntax keeps `OrderedSequence<T>` covariant in `T`.
  key(item: T): unknown;
  readonly compare: KeyComparer<unknown>;
  readonly desc: boolean;
}

/**
 * A deferred, stable sort. Iterating materializes and sorts the source (keys computed once per item);
 * `thenBy`/`thenByDescending` add tie-breakers without re-sorting eagerly.
 * @example
 * const people = [{ name: 'Ravi', age: 41 }, { name: 'Ada', age: 36 }, { name: 'Ben', age: 36 }];
 * [...orderBy((p: { name: string; age: number }) => p.age)(people).thenBy((p) => p.name)].map((p) => p.name); // => ['Ada', 'Ben', 'Ravi']
 */
export class OrderedSequence<T> implements Iterable<T> {
  readonly #source: Iterable<T>;
  readonly #specs: readonly SortSpec<T>[];

  /** @internal Use `orderBy`/`orderByDescending`. */
  constructor(source: Iterable<T>, specs: readonly SortSpec<T>[]) {
    this.#source = source;
    this.#specs = specs;
  }

  /** Adds an ascending tie-breaker key. */
  thenBy<K>(key: (item: T) => K, compare?: KeyComparer<K>): OrderedSequence<T> {
    return new OrderedSequence(this.#source, [...this.#specs, spec(key, compare, false)]);
  }

  /** Adds a descending tie-breaker key. */
  thenByDescending<K>(key: (item: T) => K, compare?: KeyComparer<K>): OrderedSequence<T> {
    return new OrderedSequence(this.#source, [...this.#specs, spec(key, compare, true)]);
  }

  *[Symbol.iterator](): Iterator<T> {
    const items = [...this.#source];
    const specs = this.#specs;
    const columns = specs.map((sp) => ({ sp, keys: items.map((x) => sp.key(x)) }));
    const idx = items.map((_, i) => i);
    idx.sort((i, j) => {
      for (const { sp, keys } of columns) {
        const c = sp.compare(keys[i], keys[j]);
        if (c !== 0) return sp.desc ? -c : c;
      }
      return i - j;
    });
    for (const i of idx) yield items[i] as T;
  }
}

function spec<T, K>(key: (item: T) => K, compare: KeyComparer<K> | undefined, desc: boolean): SortSpec<T> {
  return { key, compare: (compare ?? defaultCompare) as KeyComparer<unknown>, desc };
}

/**
 * Stable ascending sort by key (deferred until iterated).
 * @example
 * const people = [{ first: 'Ben', last: 'Kay' }, { first: 'Ada', last: 'Lee' }, { first: 'Al', last: 'Kay' }];
 * pipe(people, orderBy((p) => p.last), thenBy((p) => p.first), toArray()).map((p) => p.first); // => ['Al', 'Ben', 'Ada']
 */
export function orderBy<T, K>(key: (item: T) => K, compare?: KeyComparer<K>): (source: Iterable<T>) => OrderedSequence<T> {
  return (source) => new OrderedSequence(source, [spec(key, compare, false)]);
}

/**
 * Stable descending sort by key (deferred until iterated).
 * @example
 * pipe([1, 3, 2], orderByDescending((n) => n), toArray()); // => [3, 2, 1]
 */
export function orderByDescending<T, K>(key: (item: T) => K, compare?: KeyComparer<K>): (source: Iterable<T>) => OrderedSequence<T> {
  return (source) => new OrderedSequence(source, [spec(key, compare, true)]);
}

/**
 * Ascending tie-breaker; only applies to an `orderBy` result.
 * @example
 * const rows = [{ a: 2, b: 1 }, { a: 1, b: 2 }, { a: 1, b: 1 }];
 * pipe(rows, orderBy((r) => r.a), thenBy((r) => r.b), toArray()); // => [{ a: 1, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 1 }]
 */
export function thenBy<T, K>(key: (item: T) => K, compare?: KeyComparer<K>): (source: OrderedSequence<T>) => OrderedSequence<T> {
  return (source) => source.thenBy(key, compare);
}

/**
 * Descending tie-breaker; only applies to an `orderBy` result.
 * @example
 * const rows = [{ a: 2, b: 1 }, { a: 1, b: 1 }, { a: 1, b: 2 }];
 * pipe(rows, orderBy((r) => r.a), thenByDescending((r) => r.b), toArray()); // => [{ a: 1, b: 2 }, { a: 1, b: 1 }, { a: 2, b: 1 }]
 */
export function thenByDescending<T, K>(key: (item: T) => K, compare?: KeyComparer<K>): (source: OrderedSequence<T>) => OrderedSequence<T> {
  return (source) => source.thenByDescending(key, compare);
}

/**
 * Reverses the sequence (materializes when iterated).
 * @example
 * pipe([1, 2, 3], reverse(), toArray()); // => [3, 2, 1]
 */
export function reverse<T>(): Operator<T, T> {
  return (source) =>
    seq(function* () {
      const items = [...source];
      for (let i = items.length - 1; i >= 0; i--) yield items[i] as T;
    });
}

// ---------------------------------------------------------------------------
// Grouping and joins

/**
 * A group of items sharing `key`. Re-iterable.
 * @example
 * const words = ['apple', 'avocado', 'banana'];
 * const groups = pipe(words, groupBy((w) => w.charAt(0)), toArray());
 * groups.map((g) => [g.key, g.items]); // => [['a', ['apple', 'avocado']], ['b', ['banana']]]
 */
export class Grouping<K, T> implements Iterable<T> {
  readonly key: K;
  readonly items: readonly T[];
  /** @internal */
  constructor(key: K, items: readonly T[]) {
    this.key = key;
    this.items = items;
  }
  [Symbol.iterator](): Iterator<T> {
    return this.items[Symbol.iterator]();
  }
}

function buckets<T, K, E>(source: Iterable<T>, key: (item: T) => K, element: (item: T) => E): Map<K, E[]> {
  const m = new Map<K, E[]>();
  for (const x of source) {
    const k = key(x);
    const b = m.get(k);
    if (b) b.push(element(x));
    else m.set(k, [element(x)]);
  }
  return m;
}

/**
 * Groups by key (SameValueZero) in first-key order; materializes when iterated.
 * @example
 * pipe(['a', 'bb', 'cc'], groupBy((s) => s.length), select((g) => [g.key, g.items.length]), toArray()); // => [[1, 1], [2, 2]]
 */
export function groupBy<T, K>(key: (item: T) => K): Operator<T, Grouping<K, T>>;
export function groupBy<T, K, E>(key: (item: T) => K, element: (item: T) => E): Operator<T, Grouping<K, E>>;
export function groupBy<T, K, E, R>(key: (item: T) => K, element: (item: T) => E, result: (key: K, items: readonly E[]) => R): Operator<T, R>;
export function groupBy<T, K, E, R>(key: (item: T) => K, element?: (item: T) => E, result?: (key: K, items: readonly E[]) => R): Operator<T, unknown> {
  const el = element ?? ((x: T): unknown => x);
  return (source) =>
    seq(function* () {
      for (const [k, items] of buckets(source, key, el)) yield result ? result(k, items as E[]) : new Grouping(k, items);
    });
}

/**
 * Read-only multi-map from `toLookup`. Missing keys give an empty array.
 * @example
 * const users = [{ name: 'Ada', dept: 'HR' }, { name: 'Ben', dept: 'IT' }, { name: 'Cy', dept: 'HR' }];
 * const byDept = pipe(users, toLookup((u) => u.dept));
 * byDept.get('HR').map((u) => u.name); // => ['Ada', 'Cy']
 * byDept.get('Sales'); // => []
 */
export class Lookup<K, V> implements Iterable<Grouping<K, V>> {
  readonly #map: Map<K, V[]>;
  /** @internal */
  constructor(map: Map<K, V[]>) {
    this.#map = map;
  }
  /** Number of distinct keys. */
  get size(): number {
    return this.#map.size;
  }
  /** True when `key` has at least one value. */
  has(key: K): boolean {
    return this.#map.has(key);
  }
  /** Values for `key` (empty when absent). */
  get(key: K): readonly V[] {
    return this.#map.get(key) ?? [];
  }
  *[Symbol.iterator](): Iterator<Grouping<K, V>> {
    for (const [k, v] of this.#map) yield new Grouping(k, v);
  }
}

function innerLookup<U, K>(inner: Iterable<U>, key: (item: U) => K): Map<K, U[]> {
  const m = new Map<K, U[]>();
  for (const x of inner) {
    const k = key(x);
    if (k === null || k === undefined) continue;
    const b = m.get(k);
    if (b) b.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/**
 * Inner equi-join; nullish keys never match. The inner sequence is read once per iteration.
 * @example
 * const customers = [{ id: 1, name: 'Acme' }, { id: 2, name: 'Globex' }];
 * const orders = [{ id: 10, customerId: 2 }, { id: 11, customerId: 3 }];
 * pipe(orders, join(customers, (o) => o.customerId, (c) => c.id, (o, c) => ({ ...o, name: c.name })), toArray()); // => [{ id: 10, customerId: 2, name: 'Globex' }]
 */
export function join<T, U, K, R>(inner: Iterable<U>, outerKey: (item: T) => K, innerKey: (item: U) => K, result: (outer: T, inner: U) => R): Operator<T, R> {
  return (source) =>
    seq(function* () {
      const m = innerLookup(inner, innerKey);
      for (const o of source) {
        const k = outerKey(o);
        if (k === null || k === undefined) continue;
        for (const i of m.get(k) ?? []) yield result(o, i);
      }
    });
}

/**
 * Pairs each outer item with all matching inner items (possibly none).
 * @example
 * const customers = [{ id: 1, name: 'Acme' }, { id: 2, name: 'Globex' }];
 * const orders = [{ id: 10, customerId: 2 }, { id: 12, customerId: 2 }];
 * pipe(customers, groupJoin(orders, (c) => c.id, (o) => o.customerId, (c, os) => ({ name: c.name, n: os.length })), toArray()); // => [{ name: 'Acme', n: 0 }, { name: 'Globex', n: 2 }]
 */
export function groupJoin<T, U, K, R>(inner: Iterable<U>, outerKey: (item: T) => K, innerKey: (item: U) => K, result: (outer: T, inners: readonly U[]) => R): Operator<T, R> {
  return (source) =>
    seq(function* () {
      const m = innerLookup(inner, innerKey);
      for (const o of source) {
        const k = outerKey(o);
        yield result(o, k === null || k === undefined ? [] : (m.get(k) ?? []));
      }
    });
}

/**
 * Left outer join: every outer item appears at least once, with `undefined` when nothing matches.
 * @example
 * const depts = [{ id: 'HR', name: 'Human Resources' }];
 * const employees = [{ name: 'Ada', deptId: 'HR' }, { name: 'Ben', deptId: 'IT' }];
 * pipe(employees, leftJoin(depts, (e) => e.deptId, (d) => d.id, (e, d) => [e.name, d?.name]), toArray()); // => [['Ada', 'Human Resources'], ['Ben', undefined]]
 */
export function leftJoin<T, U, K, R>(inner: Iterable<U>, outerKey: (item: T) => K, innerKey: (item: U) => K, result: (outer: T, inner: U | undefined) => R): Operator<T, R> {
  return (source) =>
    seq(function* () {
      const m = innerLookup(inner, innerKey);
      for (const o of source) {
        const k = outerKey(o);
        const matches = k === null || k === undefined ? undefined : m.get(k);
        if (matches) for (const i of matches) yield result(o, i);
        else yield result(o, undefined);
      }
    });
}

// ---------------------------------------------------------------------------
// Set operators (lazy over the source; the other sequence is read when iteration starts)

/**
 * Removes duplicates (SameValueZero), keeping first occurrences.
 * @example
 * pipe([1, 1, 2], distinct(), toArray()); // => [1, 2]
 */
export function distinct<T>(): Operator<T, T> {
  return distinctBy((x: T) => x);
}

/**
 * Removes items with a duplicate key, keeping first occurrences.
 * @example
 * const users = [{ id: 1, email: 'ada@x.io' }, { id: 2, email: 'ben@x.io' }, { id: 3, email: 'ada@x.io' }];
 * pipe(users, distinctBy((u) => u.email), toArray()).map((u) => u.id); // => [1, 2]
 */
export function distinctBy<T>(key: (item: T) => unknown): Operator<T, T> {
  return (source) =>
    seq(function* () {
      const seen = new Set<unknown>();
      for (const x of source) {
        const k = key(x);
        if (!seen.has(k)) {
          seen.add(k);
          yield x;
        }
      }
    });
}

/**
 * Distinct items of the source followed by new items of `other`.
 * @example
 * pipe([1, 2], union([2, 3]), toArray()); // => [1, 2, 3]
 */
export function union<T>(other: Iterable<T>): Operator<T, T> {
  return unionBy(other, (x: T) => x);
}

/**
 * Union by key; the first item per key wins.
 * @example
 * const a = [{ id: 1, v: 'a' }, { id: 2, v: 'a' }];
 * const b = [{ id: 2, v: 'b' }, { id: 3, v: 'b' }];
 * pipe(a, unionBy(b, (x) => x.id), toArray()); // => [{ id: 1, v: 'a' }, { id: 2, v: 'a' }, { id: 3, v: 'b' }]
 */
export function unionBy<T>(other: Iterable<T>, key: (item: T) => unknown): Operator<T, T> {
  return (source) => distinctBy(key)(concat(other)(source));
}

/**
 * Distinct items of the source that also occur in `other`.
 * @example
 * pipe([1, 2, 3, 2], intersect([2, 3]), toArray()); // => [2, 3]
 */
export function intersect<T>(other: Iterable<T>): Operator<T, T> {
  return intersectBy(other, (x: T) => x);
}

/**
 * Items whose key occurs among the keys of `other` (the key selector applies to both sequences), distinct by key.
 * @example
 * const a = [{ id: 1, v: 'a' }, { id: 2, v: 'a' }];
 * const b = [{ id: 2, v: 'b' }, { id: 3, v: 'b' }];
 * pipe(a, intersectBy(b, (x) => x.id), toArray()); // => [{ id: 2, v: 'a' }]
 */
export function intersectBy<T>(other: Iterable<T>, key: (item: T) => unknown): Operator<T, T> {
  return (source) =>
    seq(function* () {
      const keys = new Set<unknown>();
      for (const x of other) keys.add(key(x));
      for (const x of source) {
        const k = key(x);
        if (keys.delete(k)) yield x;
      }
    });
}

/**
 * Distinct items of the source that do not occur in `other`.
 * @example
 * pipe([1, 2, 3, 1], except([2]), toArray()); // => [1, 3]
 */
export function except<T>(other: Iterable<T>): Operator<T, T> {
  return exceptBy(other, (x: T) => x);
}

/**
 * Items whose key does not occur among the keys of `other`, distinct by key.
 * @example
 * const a = [{ id: 1, v: 'a' }, { id: 2, v: 'a' }];
 * const b = [{ id: 2, v: 'b' }, { id: 3, v: 'b' }];
 * pipe(a, exceptBy(b, (x) => x.id), toArray()); // => [{ id: 1, v: 'a' }]
 */
export function exceptBy<T>(other: Iterable<T>, key: (item: T) => unknown): Operator<T, T> {
  return (source) =>
    seq(function* () {
      const keys = new Set<unknown>();
      for (const x of other) keys.add(key(x));
      for (const x of source) {
        const k = key(x);
        if (!keys.has(k)) {
          keys.add(k);
          yield x;
        }
      }
    });
}

// ---------------------------------------------------------------------------
// Composition

/**
 * Appends another sequence.
 * @example
 * pipe([1], concat([2, 3]), toArray()); // => [1, 2, 3]
 */
export function concat<T>(other: Iterable<T>): Operator<T, T> {
  return (source) =>
    seq(function* () {
      yield* source;
      yield* other;
    });
}

/**
 * Pairs items with `other` position-wise, stopping at the shorter sequence.
 * @example
 * pipe([1, 2, 3], zip(['a', 'b']), toArray()); // => [[1, 'a'], [2, 'b']]
 */
export function zip<T, U>(other: Iterable<U>): Operator<T, [T, U]>;
export function zip<T, U, R>(other: Iterable<U>, result: (a: T, b: U) => R): Operator<T, R>;
export function zip<T, U, R>(other: Iterable<U>, result?: (a: T, b: U) => R): Operator<T, [T, U] | R> {
  return (source) =>
    seq(function* () {
      const ia = source[Symbol.iterator]();
      const ib = other[Symbol.iterator]();
      try {
        for (;;) {
          const a = ia.next();
          if (a.done === true) return;
          const b = ib.next();
          if (b.done === true) return;
          yield result ? result(a.value, b.value) : [a.value, b.value];
        }
      } finally {
        ia.return?.();
        ib.return?.();
      }
    });
}

/**
 * Adds an item at the end.
 * @example
 * pipe([1], append(2), toArray()); // => [1, 2]
 */
export function append<T>(item: T): Operator<T, T> {
  return (source) =>
    seq(function* () {
      yield* source;
      yield item;
    });
}

/**
 * Adds an item at the start.
 * @example
 * pipe([2], prepend(1), toArray()); // => [1, 2]
 */
export function prepend<T>(item: T): Operator<T, T> {
  return (source) =>
    seq(function* () {
      yield item;
      yield* source;
    });
}

/**
 * Yields `value` alone when the source is empty.
 * @example
 * pipe([], defaultIfEmpty(0), toArray()); // => [0]
 */
export function defaultIfEmpty<T>(value: T): Operator<T, T> {
  return (source) =>
    seq(function* () {
      let any = false;
      for (const x of source) {
        any = true;
        yield x;
      }
      if (!any) yield value;
    });
}

/**
 * Splits into arrays of `size` (the last may be shorter).
 * @example
 * pipe([1, 2, 3], chunk(2), toArray()); // => [[1, 2], [3]]
 */
export function chunk<T>(size: number): Operator<T, T[]> {
  if (!Number.isSafeInteger(size) || size < 1) throw new ValidationError('HLP_LINQ_INVALID_ARGUMENT', 'Chunk size must be a positive integer.');
  return (source) =>
    seq(function* () {
      let buf: T[] = [];
      for (const x of source) {
        buf.push(x);
        if (buf.length === size) {
          yield buf;
          buf = [];
        }
      }
      if (buf.length) yield buf;
    });
}

// ---------------------------------------------------------------------------
// Partitioning

/**
 * Takes the first `count` items and stops pulling from the source.
 * @example
 * function* naturals(): Generator<number> {
 *   for (let n = 0; ; n++) yield n;
 * }
 * pipe(naturals(), take(3), toArray()); // => [0, 1, 2]
 */
export function take<T>(count: number): Operator<T, T> {
  assertCount(count);
  return (source) =>
    seq(function* () {
      if (count === 0) return;
      let n = 0;
      for (const x of source) {
        yield x;
        if (++n >= count) return;
      }
    });
}

/**
 * Takes leading items while `predicate(item, index)` holds.
 * @example
 * pipe([1, 2, 5, 1], takeWhile((n) => n < 3), toArray()); // => [1, 2]
 */
export function takeWhile<T>(predicate: (item: T, index: number) => boolean): Operator<T, T> {
  return (source) =>
    seq(function* () {
      let i = 0;
      for (const x of source) {
        if (!predicate(x, i++)) return;
        yield x;
      }
    });
}

/**
 * Takes the last `count` items (buffers `count` items).
 * @example
 * pipe([1, 2, 3], takeLast(2), toArray()); // => [2, 3]
 */
export function takeLast<T>(count: number): Operator<T, T> {
  assertCount(count);
  return (source) =>
    seq(function* () {
      if (count === 0) return;
      const ring: T[] = [];
      let start = 0;
      for (const x of source) {
        if (ring.length < count) ring.push(x);
        else {
          ring[start] = x;
          start = (start + 1) % count;
        }
      }
      for (let i = 0; i < ring.length; i++) yield ring[(start + i) % ring.length] as T;
    });
}

/**
 * Skips the first `count` items.
 * @example
 * pipe([1, 2, 3], skip(1), toArray()); // => [2, 3]
 */
export function skip<T>(count: number): Operator<T, T> {
  assertCount(count);
  return (source) =>
    seq(function* () {
      let n = 0;
      for (const x of source) if (n++ >= count) yield x;
    });
}

/**
 * Skips leading items while `predicate(item, index)` holds.
 * @example
 * pipe([1, 2, 5, 1], skipWhile((n) => n < 3), toArray()); // => [5, 1]
 */
export function skipWhile<T>(predicate: (item: T, index: number) => boolean): Operator<T, T> {
  return (source) =>
    seq(function* () {
      let skipping = true;
      let i = 0;
      for (const x of source) {
        if (skipping && predicate(x, i++)) continue;
        skipping = false;
        yield x;
      }
    });
}

/**
 * Skips the last `count` items (buffers `count` items).
 * @example
 * pipe([1, 2, 3], skipLast(1), toArray()); // => [1, 2]
 */
export function skipLast<T>(count: number): Operator<T, T> {
  assertCount(count);
  return (source) =>
    seq(function* () {
      if (count === 0) {
        yield* source;
        return;
      }
      const ring: T[] = [];
      let head = 0;
      for (const x of source) {
        if (ring.length < count) {
          ring.push(x);
          continue;
        }
        yield ring[head] as T;
        ring[head] = x;
        head = (head + 1) % count;
      }
    });
}

// ---------------------------------------------------------------------------
// Terminals: materialization

/**
 * Collects into an array.
 * @example
 * pipe(new Set([1, 2]), toArray()); // => [1, 2]
 */
export function toArray<T>(): Terminal<T, T[]> {
  return (source) => [...source];
}

/**
 * Collects into a `Set`.
 * @example
 * pipe([1, 1, 2], toSet()); // => new Set([1, 2])
 */
export function toSet<T>(): Terminal<T, Set<T>> {
  return (source) => new Set(source);
}

/**
 * Collects into a `Map`; throws `HLP_LINQ_DUPLICATE_KEY` on a repeated key.
 * @example
 * const users = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Ben' }];
 * const names = pipe(users, toMap((u) => u.id, (u) => u.name));
 * names.get(2); // => 'Ben'
 * pipe([...users, { id: 1, name: 'Cy' }], toMap((u) => u.id)); // => throws HLP_LINQ_DUPLICATE_KEY
 */
export function toMap<T, K>(key: (item: T) => K): Terminal<T, Map<K, T>>;
export function toMap<T, K, V>(key: (item: T) => K, value: (item: T) => V): Terminal<T, Map<K, V>>;
export function toMap<T, K, V>(key: (item: T) => K, value?: (item: T) => V): Terminal<T, Map<K, T | V>> {
  return (source) => {
    const m = new Map<K, T | V>();
    for (const x of source) {
      const k = key(x);
      if (m.has(k)) throw new ConflictError('HLP_LINQ_DUPLICATE_KEY', 'The sequence produced a duplicate key.');
      m.set(k, value ? value(x) : x);
    }
    return m;
  };
}

/**
 * Alias of `toMap` (the .NET `ToDictionary` name).
 * @example
 * const users = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Ben' }];
 * pipe(users, toDictionary((u) => u.id)).get(1); // => { id: 1, name: 'Ada' }
 */
export const toDictionary: typeof toMap = toMap;

/**
 * Collects into a `Lookup` (key -> values), keys in first-occurrence order.
 * @example
 * const users = [{ name: 'Ada', dept: 'HR' }, { name: 'Ben', dept: 'IT' }, { name: 'Cy', dept: 'HR' }];
 * pipe(users, toLookup((u) => u.dept)).get('HR').length; // => 2
 */
export function toLookup<T, K>(key: (item: T) => K): Terminal<T, Lookup<K, T>>;
export function toLookup<T, K, V>(key: (item: T) => K, value: (item: T) => V): Terminal<T, Lookup<K, V>>;
export function toLookup<T, K, V>(key: (item: T) => K, value?: (item: T) => V): Terminal<T, Lookup<K, T | V>> {
  return (source) => new Lookup(buckets<T, K, T | V>(source, key, value ?? ((x) => x)));
}

/**
 * Runs `action(item, index)` for every item.
 * @example
 * let total = 0;
 * pipe([1, 2], forEach((n) => { total += n; }));
 * total; // => 3
 */
export function forEach<T>(action: (item: T, index: number) => void): Terminal<T, void> {
  return (source) => {
    let i = 0;
    for (const x of source) action(x, i++);
  };
}

// ---------------------------------------------------------------------------
// Terminals: element access

type Predicate<T> = (item: T, index: number) => boolean;
const always = (): boolean => true;

/**
 * First matching item; throws `HLP_LINQ_NO_ELEMENTS` when none.
 * @example
 * pipe([1, 2, 3], first((n) => n > 1)); // => 2
 */
export function first<T>(predicate: Predicate<T> = always): Terminal<T, T> {
  return (source) => {
    let i = 0;
    for (const x of source) if (predicate(x, i++)) return x;
    throw noElements();
  };
}

/**
 * First matching item, or `defaultValue` (default `undefined`).
 * @example
 * pipe([1], firstOrDefault((n) => n > 5)); // => undefined
 * pipe([1], firstOrDefault(undefined, 0)); // => 1
 */
export function firstOrDefault<T>(predicate?: Predicate<T>): Terminal<T, T | undefined>;
export function firstOrDefault<T, D>(predicate: Predicate<T> | undefined, defaultValue: D): Terminal<T, T | D>;
export function firstOrDefault<T, D>(predicate: Predicate<T> = always, defaultValue?: D): Terminal<T, T | D | undefined> {
  return (source) => {
    let i = 0;
    for (const x of source) if (predicate(x, i++)) return x;
    return defaultValue;
  };
}

function findLast<T>(source: Iterable<T>, predicate: Predicate<T>): { found: boolean; value: T | undefined } {
  let found = false;
  let value: T | undefined;
  let i = 0;
  for (const x of source) {
    if (predicate(x, i++)) {
      found = true;
      value = x;
    }
  }
  return { found, value };
}

/**
 * Last matching item; throws `HLP_LINQ_NO_ELEMENTS` when none.
 * @example
 * pipe([1, 2, 3], last()); // => 3
 */
export function last<T>(predicate: Predicate<T> = always): Terminal<T, T> {
  return (source) => {
    const r = findLast(source, predicate);
    if (!r.found) throw noElements();
    return r.value as T;
  };
}

/**
 * Last matching item, or `defaultValue` (default `undefined`).
 * @example
 * pipe([], lastOrDefault()); // => undefined
 */
export function lastOrDefault<T>(predicate?: Predicate<T>): Terminal<T, T | undefined>;
export function lastOrDefault<T, D>(predicate: Predicate<T> | undefined, defaultValue: D): Terminal<T, T | D>;
export function lastOrDefault<T, D>(predicate: Predicate<T> = always, defaultValue?: D): Terminal<T, T | D | undefined> {
  return (source) => {
    const r = findLast(source, predicate);
    return r.found ? r.value : defaultValue;
  };
}

function findSingle<T>(source: Iterable<T>, predicate: Predicate<T>): { found: boolean; value: T | undefined } {
  let found = false;
  let value: T | undefined;
  let i = 0;
  for (const x of source) {
    if (!predicate(x, i++)) continue;
    if (found) throw multipleElements();
    found = true;
    value = x;
  }
  return { found, value };
}

/**
 * The only matching item; throws `HLP_LINQ_NO_ELEMENTS` or `HLP_LINQ_MULTIPLE_ELEMENTS`.
 * @example
 * pipe([1, 2], single((n) => n > 1)); // => 2
 */
export function single<T>(predicate: Predicate<T> = always): Terminal<T, T> {
  return (source) => {
    const r = findSingle(source, predicate);
    if (!r.found) throw noElements();
    return r.value as T;
  };
}

/**
 * The only matching item or `defaultValue`; still throws `HLP_LINQ_MULTIPLE_ELEMENTS` for several.
 * @example
 * pipe([], singleOrDefault()); // => undefined
 */
export function singleOrDefault<T>(predicate?: Predicate<T>): Terminal<T, T | undefined>;
export function singleOrDefault<T, D>(predicate: Predicate<T> | undefined, defaultValue: D): Terminal<T, T | D>;
export function singleOrDefault<T, D>(predicate: Predicate<T> = always, defaultValue?: D): Terminal<T, T | D | undefined> {
  return (source) => {
    const r = findSingle(source, predicate);
    return r.found ? r.value : defaultValue;
  };
}

function at<T>(source: Iterable<T>, index: number): { found: boolean; value: T | undefined } {
  if (!Number.isSafeInteger(index)) return { found: false, value: undefined };
  if (Array.isArray(source) || index < 0) {
    const arr: readonly T[] = Array.isArray(source) ? (source as readonly T[]) : [...source];
    const i = index < 0 ? arr.length + index : index;
    return i >= 0 && i < arr.length ? { found: true, value: arr[i] } : { found: false, value: undefined };
  }
  let i = 0;
  for (const x of source) if (i++ === index) return { found: true, value: x };
  return { found: false, value: undefined };
}

/**
 * Item at `index` (negative counts from the end); throws `HLP_LINQ_INDEX_OUT_OF_RANGE`.
 * @example
 * pipe([1, 2, 3], elementAt(-1)); // => 3
 */
export function elementAt<T>(index: number): Terminal<T, T> {
  return (source) => {
    const r = at(source, index);
    if (!r.found) throw outOfRange();
    return r.value as T;
  };
}

/**
 * Item at `index` (negative counts from the end), or `defaultValue`.
 * @example
 * pipe([1], elementAtOrDefault(5)); // => undefined
 */
export function elementAtOrDefault<T>(index: number): Terminal<T, T | undefined>;
export function elementAtOrDefault<T, D>(index: number, defaultValue: D): Terminal<T, T | D>;
export function elementAtOrDefault<T, D>(index: number, defaultValue?: D): Terminal<T, T | D | undefined> {
  return (source) => {
    const r = at(source, index);
    return r.found ? r.value : defaultValue;
  };
}

// ---------------------------------------------------------------------------
// Terminals: quantifiers

/**
 * True when any item matches (or the sequence is non-empty); stops at the first match.
 * @example
 * pipe([1, 2], any((n) => n > 1)); // => true
 */
export function any<T>(predicate: Predicate<T> = always): Terminal<T, boolean> {
  return (source) => {
    let i = 0;
    for (const x of source) if (predicate(x, i++)) return true;
    return false;
  };
}

/**
 * True when every item matches (true for empty); stops at the first failure.
 * @example
 * pipe([1, 2], all((n) => n > 0)); // => true
 */
export function all<T>(predicate: Predicate<T>): Terminal<T, boolean> {
  return (source) => {
    let i = 0;
    for (const x of source) if (!predicate(x, i++)) return false;
    return true;
  };
}

/**
 * True when the sequence contains `value` (SameValueZero by default).
 * @example
 * pipe([1, NaN], contains(NaN)); // => true
 */
export function contains<T>(value: T, equals: EqualityComparer<T> = sameValueZero): Terminal<T, boolean> {
  return (source) => {
    for (const x of source) if (equals(x, value)) return true;
    return false;
  };
}

/**
 * True when both sequences have equal items in the same order.
 * @example
 * pipe([1, 2], sequenceEqual(new Set([1, 2]))); // => true
 */
export function sequenceEqual<T>(other: Iterable<T>, equals: EqualityComparer<T> = sameValueZero): Terminal<T, boolean> {
  return (source) => {
    const ia = source[Symbol.iterator]();
    const ib = other[Symbol.iterator]();
    try {
      for (;;) {
        const a = ia.next();
        const b = ib.next();
        if (a.done === true || b.done === true) return a.done === b.done;
        if (!equals(a.value, b.value)) return false;
      }
    } finally {
      ia.return?.();
      ib.return?.();
    }
  };
}

// ---------------------------------------------------------------------------
// Terminals: aggregation

/**
 * Number of matching items (O(1) for arrays, `Set`s and `Map`s without a predicate).
 * @example
 * pipe([1, 2, 3], count((n) => n > 1)); // => 2
 */
export function count<T>(predicate?: Predicate<T>): Terminal<T, number> {
  return (source) => {
    if (!predicate) {
      if (Array.isArray(source)) return source.length;
      if (source instanceof Set || source instanceof Map) return source.size;
    }
    const p = predicate ?? always;
    let n = 0;
    let i = 0;
    for (const x of source) if (p(x, i++)) n++;
    return n;
  };
}

function neumaier(values: Iterable<number>): { sum: number; n: number } {
  let sum = 0;
  let c = 0;
  let n = 0;
  for (const v of values) {
    const t = sum + v;
    c += Math.abs(sum) >= Math.abs(v) ? sum - t + v : v - t + sum;
    sum = t;
    n++;
  }
  return { sum: sum + c, n };
}

function project<T, R>(source: Iterable<T>, selector: (item: T, index: number) => R): Iterable<R> {
  return select(selector)(source);
}

/**
 * Compensated sum (0 for empty).
 * @example
 * pipe([1, 2, 3], sum()); // => 6
 * const orders = [{ id: 1, total: 120 }, { id: 2, total: 80.5 }];
 * pipe(orders, sum((o) => o.total)); // => 200.5
 */
export function sum(): Terminal<number, number>;
export function sum<T>(selector: (item: T, index: number) => number): Terminal<T, number>;
export function sum<T>(selector?: (item: T, index: number) => number): Terminal<T, number> {
  return (source) => neumaier(selector ? project(source, selector) : (source as Iterable<unknown> as Iterable<number>)).sum;
}

/**
 * Arithmetic mean; throws `HLP_LINQ_NO_ELEMENTS` for empty input.
 * @example
 * pipe([1, 2, 3], average()); // => 2
 */
export function average(): Terminal<number, number>;
export function average<T>(selector: (item: T, index: number) => number): Terminal<T, number>;
export function average<T>(selector?: (item: T, index: number) => number): Terminal<T, number> {
  return (source) => {
    const r = neumaier(selector ? project(source, selector) : (source as Iterable<unknown> as Iterable<number>));
    if (r.n === 0) throw noElements();
    return r.sum / r.n;
  };
}

function extreme<R>(values: Iterable<R>, sign: 1 | -1, compare: KeyComparer<R>): R {
  let found = false;
  let best: R | undefined;
  for (const v of values) {
    if (rank(v) === 0) continue;
    if (!found || compare(v, best as R) * sign < 0) {
      best = v;
      found = true;
    }
  }
  if (!found) throw noElements();
  return best as R;
}

/**
 * Smallest value (nullish and `NaN` ignored); throws `HLP_LINQ_NO_ELEMENTS` when none remain.
 * @example
 * pipe([3, 1, 2], min()); // => 1
 * const users = [{ name: 'Ada', age: 36 }, { name: 'Ben', age: 29 }];
 * pipe(users, min((u) => u.age)); // => 29
 */
export function min<T>(): Terminal<T, T>;
export function min<T, R>(selector: (item: T, index: number) => R, compare?: KeyComparer<R>): Terminal<T, R>;
export function min<T, R>(selector?: (item: T, index: number) => R, compare: KeyComparer<R> = defaultCompare): Terminal<T, T | R> {
  return (source) => (selector ? extreme(project(source, selector), 1, compare) : extreme(source, 1, defaultCompare));
}

/**
 * Largest value (nullish and `NaN` ignored); throws `HLP_LINQ_NO_ELEMENTS` when none remain.
 * @example
 * pipe([3, 1, 2], max()); // => 3
 */
export function max<T>(): Terminal<T, T>;
export function max<T, R>(selector: (item: T, index: number) => R, compare?: KeyComparer<R>): Terminal<T, R>;
export function max<T, R>(selector?: (item: T, index: number) => R, compare: KeyComparer<R> = defaultCompare): Terminal<T, T | R> {
  return (source) => (selector ? extreme(project(source, selector), -1, compare) : extreme(source, -1, defaultCompare));
}

function extremeBy<T, K>(source: Iterable<T>, key: (item: T) => K, compare: KeyComparer<K>, sign: 1 | -1): T | undefined {
  let found = false;
  let best: T | undefined;
  let bestKey: K | undefined;
  for (const x of source) {
    const k = key(x);
    if (rank(k) === 0) continue;
    if (!found || compare(k, bestKey as K) * sign < 0) {
      best = x;
      bestKey = k;
      found = true;
    }
  }
  return best;
}

/**
 * Item with the smallest key (first on ties, nullish keys ignored), or `undefined`.
 * @example
 * const users = [{ name: 'Ada', age: 36 }, { name: 'Ben', age: 29 }];
 * pipe(users, minBy((u) => u.age)); // => { name: 'Ben', age: 29 }
 */
export function minBy<T, K>(key: (item: T) => K, compare: KeyComparer<K> = defaultCompare): Terminal<T, T | undefined> {
  return (source) => extremeBy(source, key, compare, 1);
}

/**
 * Item with the largest key (first on ties, nullish keys ignored), or `undefined`.
 * @example
 * const users = [{ name: 'Ada', age: 36 }, { name: 'Ben', age: 29 }];
 * pipe(users, maxBy((u) => u.age)); // => { name: 'Ada', age: 36 }
 */
export function maxBy<T, K>(key: (item: T) => K, compare: KeyComparer<K> = defaultCompare): Terminal<T, T | undefined> {
  return (source) => extremeBy(source, key, compare, -1);
}

/**
 * Folds the sequence. Without a seed the first item seeds the fold (throws `HLP_LINQ_NO_ELEMENTS` when empty).
 * @example
 * pipe([1, 2, 3], aggregate((a, b) => a + b)); // => 6
 * pipe([1, 2, 3], aggregate('', (s, n) => s + n)); // => '123'
 * pipe([1, 2], aggregate(0, (a, n) => a + n, (a) => a * 10)); // => 30
 */
export function aggregate<T>(fn: (acc: T, item: T, index: number) => T): Terminal<T, T>;
export function aggregate<T, A>(seed: A, fn: (acc: A, item: T, index: number) => A): Terminal<T, A>;
export function aggregate<T, A, R>(seed: A, fn: (acc: A, item: T, index: number) => A, result: (acc: A) => R): Terminal<T, R>;
export function aggregate(...args: unknown[]): Terminal<unknown, unknown> {
  type Fold = (acc: unknown, item: unknown, index: number) => unknown;
  return (source) => {
    if (args.length === 1) {
      const fn = args[0] as Fold;
      const it = source[Symbol.iterator]();
      const head = it.next();
      if (head.done === true) throw noElements();
      let acc: unknown = head.value;
      let i = 1;
      for (let r = it.next(); r.done !== true; r = it.next()) acc = fn(acc, r.value, i++);
      return acc;
    }
    const fn = args[1] as Fold;
    let acc = args[0];
    let i = 0;
    for (const x of source) acc = fn(acc, x, i++);
    return args.length > 2 ? (args[2] as (a: unknown) => unknown)(acc) : acc;
  };
}
