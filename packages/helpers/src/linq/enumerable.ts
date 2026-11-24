/**
 * Fluent LINQ wrapper over the pipeable operators. An `Enumerable` is itself iterable, lazy, and
 * re-iterable as long as its source is (arrays, `Set`s, and other enumerables are; a bare generator
 * object is single-use).
 */
import { ValidationError } from '../error/index.js';
import * as op from './operators.js';
import type { EqualityComparer, KeyComparer, Lookup, OrderedSequence } from './operators.js';

type Predicate<T> = (item: T, index: number) => boolean;

/**
 * Lazy, re-iterable sequence with the .NET LINQ surface.
 * @example
 * const big = from([1, 2, 3]).where((n) => n > 1);
 * [...big]; // => [2, 3]
 * big.count(); // => 2 // re-iterable
 */
export class Enumerable<T> implements Iterable<T> {
  readonly #source: Iterable<T>;

  /** @internal Use `from`. */
  constructor(source: Iterable<T>) {
    this.#source = source;
  }

  [Symbol.iterator](): Iterator<T> {
    return this.#source[Symbol.iterator]();
  }

  /** Threads this sequence through pipeable operators; the last may be a terminal. */
  pipe<A>(op1: (source: Iterable<T>) => A): A;
  pipe<A, B>(op1: (source: Iterable<T>) => A, op2: (a: A) => B): B;
  pipe<A, B, C>(op1: (source: Iterable<T>) => A, op2: (a: A) => B, op3: (b: B) => C): C;
  pipe<A, B, C, D>(op1: (source: Iterable<T>) => A, op2: (a: A) => B, op3: (b: B) => C, op4: (c: C) => D): D;
  pipe(...ops: ((value: never) => unknown)[]): unknown {
    return ops.reduce<unknown>((acc, fn) => (fn as (value: unknown) => unknown)(acc), this.#source);
  }

  #to<U>(fn: (source: Iterable<T>) => Iterable<U>): Enumerable<U> {
    return new Enumerable(fn(this.#source));
  }

  // Filtering and projection --------------------------------------------------

  /** Keeps items matching `predicate(item, index)`. */
  where<S extends T>(predicate: (item: T, index: number) => item is S): Enumerable<S>;
  where(predicate: Predicate<T>): Enumerable<T>;
  where(predicate: Predicate<T>): Enumerable<T> {
    return this.#to(op.where(predicate));
  }

  /** Keeps items passing a type guard (`OfType`). */
  whereType<S extends T>(guard: (item: T) => item is S): Enumerable<S> {
    return this.#to(op.whereType(guard));
  }

  /** Maps items with `selector(item, index)`. */
  select<U>(selector: (item: T, index: number) => U): Enumerable<U> {
    return this.#to(op.select(selector));
  }

  /** Maps to sequences and flattens, optionally projecting `(item, child)`. */
  selectMany<U>(selector: (item: T, index: number) => Iterable<U>): Enumerable<U>;
  selectMany<U, R>(selector: (item: T, index: number) => Iterable<U>, result: (item: T, child: U) => R): Enumerable<R>;
  selectMany<U, R>(selector: (item: T, index: number) => Iterable<U>, result?: (item: T, child: U) => R): Enumerable<U | R> {
    return result ? this.#to<U | R>(op.selectMany(selector, result)) : this.#to<U | R>(op.selectMany(selector));
  }

  // Ordering ----------------------------------------------------------------

  /** Stable ascending sort by key; deferred until iterated. */
  orderBy<K>(key: (item: T) => K, compare?: KeyComparer<K>): OrderedEnumerable<T> {
    return new OrderedEnumerable(op.orderBy(key, compare)(this.#source));
  }

  /** Stable descending sort by key; deferred until iterated. */
  orderByDescending<K>(key: (item: T) => K, compare?: KeyComparer<K>): OrderedEnumerable<T> {
    return new OrderedEnumerable(op.orderByDescending(key, compare)(this.#source));
  }

  /** Reverses the sequence. */
  reverse(): Enumerable<T> {
    return this.#to(op.reverse());
  }

  // Grouping and joins --------------------------------------------------------

  /** Groups by key; each group is an `Enumerable` with a `key`. */
  groupBy<K>(key: (item: T) => K): Enumerable<EnumerableGrouping<K, T>>;
  groupBy<K, E>(key: (item: T) => K, element: (item: T) => E): Enumerable<EnumerableGrouping<K, E>>;
  groupBy<K, E, R>(key: (item: T) => K, element: (item: T) => E, result: (key: K, items: Enumerable<E>) => R): Enumerable<R>;
  groupBy<K, E, R>(key: (item: T) => K, element?: (item: T) => E, result?: (key: K, items: Enumerable<E>) => R): Enumerable<unknown> {
    const el = element ?? ((x: T): unknown => x);
    const groups = op.groupBy(key, el)(this.#source);
    return new Enumerable<unknown>(op.select((g: op.Grouping<K, unknown>) => (result ? result(g.key, new Enumerable(g.items as readonly E[])) : new EnumerableGrouping(g.key, g.items)))(groups));
  }

  /** Inner equi-join (nullish keys never match). */
  join<U, K, R>(inner: Iterable<U>, outerKey: (item: T) => K, innerKey: (item: U) => K, result: (outer: T, inner: U) => R): Enumerable<R> {
    return this.#to(op.join(inner, outerKey, innerKey, result));
  }

  /** Pairs each item with an `Enumerable` of matching inner items. */
  groupJoin<U, K, R>(inner: Iterable<U>, outerKey: (item: T) => K, innerKey: (item: U) => K, result: (outer: T, inners: Enumerable<U>) => R): Enumerable<R> {
    return this.#to(op.groupJoin(inner, outerKey, innerKey, (o: T, inners: readonly U[]) => result(o, new Enumerable(inners))));
  }

  /** Left outer join; `inner` is `undefined` when nothing matches. */
  leftJoin<U, K, R>(inner: Iterable<U>, outerKey: (item: T) => K, innerKey: (item: U) => K, result: (outer: T, inner: U | undefined) => R): Enumerable<R> {
    return this.#to(op.leftJoin(inner, outerKey, innerKey, result));
  }

  // Set operators -------------------------------------------------------------

  /** Removes duplicates (SameValueZero). */
  distinct(): Enumerable<T> {
    return this.#to(op.distinct());
  }

  /** Removes items with a duplicate key. */
  distinctBy(key: (item: T) => unknown): Enumerable<T> {
    return this.#to(op.distinctBy(key));
  }

  /** Distinct union with `other`. */
  union(other: Iterable<T>): Enumerable<T> {
    return this.#to(op.union(other));
  }

  /** Union by key. */
  unionBy(other: Iterable<T>, key: (item: T) => unknown): Enumerable<T> {
    return this.#to(op.unionBy(other, key));
  }

  /** Distinct items also in `other`. */
  intersect(other: Iterable<T>): Enumerable<T> {
    return this.#to(op.intersect(other));
  }

  /** Items whose key occurs in `other` (selector applied to both). */
  intersectBy(other: Iterable<T>, key: (item: T) => unknown): Enumerable<T> {
    return this.#to(op.intersectBy(other, key));
  }

  /** Distinct items not in `other`. */
  except(other: Iterable<T>): Enumerable<T> {
    return this.#to(op.except(other));
  }

  /** Items whose key does not occur in `other`. */
  exceptBy(other: Iterable<T>, key: (item: T) => unknown): Enumerable<T> {
    return this.#to(op.exceptBy(other, key));
  }

  // Composition and partitioning -------------------------------------------------

  /** Appends `other`. */
  concat(other: Iterable<T>): Enumerable<T> {
    return this.#to(op.concat(other));
  }

  /** Pairs position-wise with `other`. */
  zip<U>(other: Iterable<U>): Enumerable<[T, U]>;
  zip<U, R>(other: Iterable<U>, result: (a: T, b: U) => R): Enumerable<R>;
  zip<U, R>(other: Iterable<U>, result?: (a: T, b: U) => R): Enumerable<[T, U] | R> {
    return result ? this.#to<[T, U] | R>(op.zip(other, result)) : this.#to<[T, U] | R>(op.zip(other));
  }

  /** Adds an item at the end. */
  append(item: T): Enumerable<T> {
    return this.#to(op.append(item));
  }

  /** Adds an item at the start. */
  prepend(item: T): Enumerable<T> {
    return this.#to(op.prepend(item));
  }

  /** Yields `value` alone when empty. */
  defaultIfEmpty(value: T): Enumerable<T> {
    return this.#to(op.defaultIfEmpty(value));
  }

  /** Splits into arrays of `size`. */
  chunk(size: number): Enumerable<T[]> {
    return this.#to(op.chunk(size));
  }

  /** First `count` items; stops pulling early. */
  take(count: number): Enumerable<T> {
    return this.#to(op.take(count));
  }

  /** Leading items while `predicate` holds. */
  takeWhile(predicate: Predicate<T>): Enumerable<T> {
    return this.#to(op.takeWhile(predicate));
  }

  /** Last `count` items. */
  takeLast(count: number): Enumerable<T> {
    return this.#to(op.takeLast(count));
  }

  /** Skips `count` items. */
  skip(count: number): Enumerable<T> {
    return this.#to(op.skip(count));
  }

  /** Skips leading items while `predicate` holds. */
  skipWhile(predicate: Predicate<T>): Enumerable<T> {
    return this.#to(op.skipWhile(predicate));
  }

  /** Skips the last `count` items. */
  skipLast(count: number): Enumerable<T> {
    return this.#to(op.skipLast(count));
  }

  // Element access -------------------------------------------------------------

  /** First matching item; throws `HLP_LINQ_NO_ELEMENTS`. */
  first(predicate?: Predicate<T>): T {
    return op.first(predicate)(this.#source);
  }

  /** First matching item or `defaultValue`. */
  firstOrDefault(predicate?: Predicate<T>): T | undefined;
  firstOrDefault<D>(predicate: Predicate<T> | undefined, defaultValue: D): T | D;
  firstOrDefault<D>(predicate?: Predicate<T>, defaultValue?: D): T | D | undefined {
    return op.firstOrDefault(predicate, defaultValue)(this.#source);
  }

  /** Last matching item; throws `HLP_LINQ_NO_ELEMENTS`. */
  last(predicate?: Predicate<T>): T {
    return op.last(predicate)(this.#source);
  }

  /** Last matching item or `defaultValue`. */
  lastOrDefault(predicate?: Predicate<T>): T | undefined;
  lastOrDefault<D>(predicate: Predicate<T> | undefined, defaultValue: D): T | D;
  lastOrDefault<D>(predicate?: Predicate<T>, defaultValue?: D): T | D | undefined {
    return op.lastOrDefault(predicate, defaultValue)(this.#source);
  }

  /** The only matching item; throws `HLP_LINQ_NO_ELEMENTS` / `HLP_LINQ_MULTIPLE_ELEMENTS`. */
  single(predicate?: Predicate<T>): T {
    return op.single(predicate)(this.#source);
  }

  /** The only matching item or `defaultValue`; throws `HLP_LINQ_MULTIPLE_ELEMENTS` for several. */
  singleOrDefault(predicate?: Predicate<T>): T | undefined;
  singleOrDefault<D>(predicate: Predicate<T> | undefined, defaultValue: D): T | D;
  singleOrDefault<D>(predicate?: Predicate<T>, defaultValue?: D): T | D | undefined {
    return op.singleOrDefault(predicate, defaultValue)(this.#source);
  }

  /** Item at `index` (negative from the end); throws `HLP_LINQ_INDEX_OUT_OF_RANGE`. */
  elementAt(index: number): T {
    return op.elementAt<T>(index)(this.#source);
  }

  /** Item at `index` or `defaultValue`. */
  elementAtOrDefault(index: number): T | undefined;
  elementAtOrDefault<D>(index: number, defaultValue: D): T | D;
  elementAtOrDefault<D>(index: number, defaultValue?: D): T | D | undefined {
    return op.elementAtOrDefault<T, D | undefined>(index, defaultValue)(this.#source);
  }

  // Quantifiers ----------------------------------------------------------------

  /** True when any item matches (or the sequence is non-empty). */
  any(predicate?: Predicate<T>): boolean {
    return op.any(predicate)(this.#source);
  }

  /** True when every item matches. */
  all(predicate: Predicate<T>): boolean {
    return op.all(predicate)(this.#source);
  }

  /** True when the sequence contains `value`. */
  contains(value: T, equals?: EqualityComparer<T>): boolean {
    return op.contains(value, equals)(this.#source);
  }

  /** True when both sequences are equal item by item. */
  sequenceEqual(other: Iterable<T>, equals?: EqualityComparer<T>): boolean {
    return op.sequenceEqual(other, equals)(this.#source);
  }

  // Aggregation ------------------------------------------------------------------

  /** Number of matching items. */
  count(predicate?: Predicate<T>): number {
    return op.count(predicate)(this.#source);
  }

  /** Compensated sum (0 when empty). */
  sum(this: Enumerable<number>): number;
  // eslint-disable-next-line @typescript-eslint/unified-signatures -- the `this` overload only applies to numeric sequences
  sum(selector: (item: T, index: number) => number): number;
  sum(selector?: (item: T, index: number) => number): number {
    return selector ? op.sum(selector)(this.#source) : op.sum()(this.#source as Iterable<unknown> as Iterable<number>);
  }

  /** Mean; throws `HLP_LINQ_NO_ELEMENTS` when empty. */
  average(this: Enumerable<number>): number;
  // eslint-disable-next-line @typescript-eslint/unified-signatures -- the `this` overload only applies to numeric sequences
  average(selector: (item: T, index: number) => number): number;
  average(selector?: (item: T, index: number) => number): number {
    return selector ? op.average(selector)(this.#source) : op.average()(this.#source as Iterable<unknown> as Iterable<number>);
  }

  /** Smallest value (nullish ignored); throws `HLP_LINQ_NO_ELEMENTS`. */
  min(): T;
  min<R>(selector: (item: T, index: number) => R, compare?: KeyComparer<R>): R;
  min<R>(selector?: (item: T, index: number) => R, compare?: KeyComparer<R>): T | R {
    return selector ? op.min(selector, compare)(this.#source) : op.min<T>()(this.#source);
  }

  /** Largest value (nullish ignored); throws `HLP_LINQ_NO_ELEMENTS`. */
  max(): T;
  max<R>(selector: (item: T, index: number) => R, compare?: KeyComparer<R>): R;
  max<R>(selector?: (item: T, index: number) => R, compare?: KeyComparer<R>): T | R {
    return selector ? op.max(selector, compare)(this.#source) : op.max<T>()(this.#source);
  }

  /** Item with the smallest key, or `undefined`. */
  minBy<K>(key: (item: T) => K, compare?: KeyComparer<K>): T | undefined {
    return op.minBy(key, compare)(this.#source);
  }

  /** Item with the largest key, or `undefined`. */
  maxBy<K>(key: (item: T) => K, compare?: KeyComparer<K>): T | undefined {
    return op.maxBy(key, compare)(this.#source);
  }

  /** Folds the sequence (see the pipeable `aggregate`). */
  aggregate(fn: (acc: T, item: T, index: number) => T): T;
  aggregate<A>(seed: A, fn: (acc: A, item: T, index: number) => A): A;
  aggregate<A, R>(seed: A, fn: (acc: A, item: T, index: number) => A, result: (acc: A) => R): R;
  aggregate(...args: unknown[]): unknown {
    return (op.aggregate as (...a: unknown[]) => op.Terminal<T, unknown>)(...args)(this.#source);
  }

  // Materialization ------------------------------------------------------------

  /** Collects into an array. */
  toArray(): T[] {
    return [...this.#source];
  }

  /** Collects into a `Set`. */
  toSet(): Set<T> {
    return new Set(this.#source);
  }

  /** Collects into a `Map`; throws `HLP_LINQ_DUPLICATE_KEY`. */
  toMap<K>(key: (item: T) => K): Map<K, T>;
  toMap<K, V>(key: (item: T) => K, value: (item: T) => V): Map<K, V>;
  toMap<K, V>(key: (item: T) => K, value?: (item: T) => V): Map<K, T | V> {
    return value ? op.toMap(key, value)(this.#source) : op.toMap(key)(this.#source);
  }

  /** Alias of `toMap`. */
  toDictionary<K>(key: (item: T) => K): Map<K, T>;
  toDictionary<K, V>(key: (item: T) => K, value: (item: T) => V): Map<K, V>;
  toDictionary<K, V>(key: (item: T) => K, value?: (item: T) => V): Map<K, T | V> {
    return value ? op.toMap(key, value)(this.#source) : op.toMap(key)(this.#source);
  }

  /** Collects into a `Lookup` (key -> values). */
  toLookup<K>(key: (item: T) => K): Lookup<K, T>;
  toLookup<K, V>(key: (item: T) => K, value: (item: T) => V): Lookup<K, V>;
  toLookup<K, V>(key: (item: T) => K, value?: (item: T) => V): Lookup<K, T | V> {
    return value ? op.toLookup(key, value)(this.#source) : op.toLookup(key)(this.#source);
  }

  /** Runs `action(item, index)` for every item. */
  forEach(action: (item: T, index: number) => void): void {
    op.forEach(action)(this.#source);
  }
}

/**
 * Result of `orderBy`/`orderByDescending`; the only type exposing `thenBy`.
 * @example
 * const rows = [{ dept: 'IT', salary: 50 }, { dept: 'HR', salary: 40 }, { dept: 'IT', salary: 70 }];
 * from(rows).orderBy((r) => r.dept).thenByDescending((r) => r.salary).select((r) => r.salary).toArray(); // => [40, 70, 50]
 */
export class OrderedEnumerable<T> extends Enumerable<T> {
  readonly #ordered: OrderedSequence<T>;

  /** @internal */
  constructor(ordered: OrderedSequence<T>) {
    super(ordered);
    this.#ordered = ordered;
  }

  /** Adds an ascending tie-breaker. */
  thenBy<K>(key: (item: T) => K, compare?: KeyComparer<K>): OrderedEnumerable<T> {
    return new OrderedEnumerable(this.#ordered.thenBy(key, compare));
  }

  /** Adds a descending tie-breaker. */
  thenByDescending<K>(key: (item: T) => K, compare?: KeyComparer<K>): OrderedEnumerable<T> {
    return new OrderedEnumerable(this.#ordered.thenByDescending(key, compare));
  }
}

/**
 * A group from `Enumerable#groupBy`: an `Enumerable` of the members with their `key`.
 * @example
 * const users = [{ name: 'Ada', dept: 'HR' }, { name: 'Ben', dept: 'IT' }, { name: 'Cy', dept: 'HR' }];
 * from(users).groupBy((u) => u.dept).select((g) => ({ dept: g.key, n: g.count() })).toArray(); // => [{ dept: 'HR', n: 2 }, { dept: 'IT', n: 1 }]
 */
export class EnumerableGrouping<K, T> extends Enumerable<T> {
  readonly key: K;

  /** @internal */
  constructor(key: K, items: readonly T[]) {
    super(items);
    this.key = key;
  }
}

/**
 * Wraps any iterable in a lazy, fluent `Enumerable`.
 * @example
 * const users = [
 *   { name: 'Ben', email: 'ben@x.io', active: true },
 *   { name: 'Cy', email: 'cy@x.io', active: false },
 *   { name: 'Ada', email: 'ada@x.io', active: true },
 * ];
 * from(users).where((u) => u.active).orderBy((u) => u.name).select((u) => u.email).toArray(); // => ['ada@x.io', 'ben@x.io']
 */
export function from<T>(source: Iterable<T>): Enumerable<T> {
  return source instanceof Enumerable ? (source as Enumerable<T>) : new Enumerable(source);
}

/**
 * `count` consecutive integers from `start` (lazy).
 * @example
 * range(1, 3).toArray(); // => [1, 2, 3]
 */
export function range(start: number, count: number): Enumerable<number> {
  op.assertCount(count);
  if (!Number.isFinite(start)) throw new ValidationError('HLP_LINQ_INVALID_ARGUMENT', 'Range start must be finite.');
  return new Enumerable({
    *[Symbol.iterator]() {
      for (let i = 0; i < count; i++) yield start + i;
    },
  });
}

/**
 * `value` repeated `count` times (lazy).
 * @example
 * repeat('x', 2).toArray(); // => ['x', 'x']
 */
export function repeat<T>(value: T, count: number): Enumerable<T> {
  op.assertCount(count);
  return new Enumerable({
    *[Symbol.iterator]() {
      for (let i = 0; i < count; i++) yield value;
    },
  });
}

/**
 * An empty sequence.
 * @example
 * empty<number>().count(); // => 0
 */
export function empty<T>(): Enumerable<T> {
  return new Enumerable<T>([]);
}
