/**
 * Comparison and control-flow helpers (docs/PLAN-HELPERS.md section 2 `compare`): comparer builders,
 * natural ordering, ranges, coalescing, pattern matching and predicate combinators.
 */
import { deepEqual } from '../object/index.js';

/** Standard comparator: negative, zero or positive. */
export type Comparer<T> = (a: T, b: T) => number;

/** Where `null`/`undefined` (and invalid numbers/dates) sort. */
export type NullsOrder = 'first' | 'last';

export interface CompareOptions {
  /** Default `'last'`. Applies regardless of direction. */
  readonly nulls?: NullsOrder;
  /** Collator for strings; default is UTF-16 code unit order. */
  readonly collator?: Intl.Collator;
}

export interface ByOptions extends CompareOptions {
  /** Default `'asc'`. */
  readonly direction?: 'asc' | 'desc';
}

const sign = (n: number): number => (n < 0 ? -1 : n > 0 ? 1 : 0);

/** Rank of a value's type for mixed-type ordering; -1 marks "null-like". */
function rank(v: unknown): number {
  if (v === null || v === undefined) return -1;
  switch (typeof v) {
    case 'boolean':
      return 1;
    case 'number':
      return Number.isNaN(v) ? -1 : 2;
    case 'bigint':
      return 2;
    case 'string':
      return 3;
    default:
      if (v instanceof Date) return Number.isNaN(v.getTime()) ? -1 : 4;
      return 5;
  }
}

/** Core ascending comparison; nulls handled by the caller. */
function compareDefined(a: unknown, b: unknown, collator: Intl.Collator | undefined): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'string' && typeof b === 'string') return collator ? sign(collator.compare(a, b)) : a < b ? -1 : a > b ? 1 : 0;
  if (a instanceof Date && b instanceof Date) return sign(a.getTime() - b.getTime());
  if ((typeof a === 'number' || typeof a === 'bigint') && (typeof b === 'number' || typeof b === 'bigint')) return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return 0;
}

function withNulls(a: unknown, b: unknown, nulls: NullsOrder, core: () => number): number {
  const na = rank(a) === -1;
  const nb = rank(b) === -1;
  if (na || nb) {
    if (na && nb) {
      // null before undefined, NaN/invalid dates last among null-likes.
      const w = (v: unknown): number => (v === null ? 0 : v === undefined ? 1 : 2);
      return sign(w(a) - w(b));
    }
    return (na ? -1 : 1) * (nulls === 'first' ? 1 : -1);
  }
  return core();
}

/**
 * Compares numbers, bigints, strings, dates and booleans ascending; mixed types order
 * boolean < number/bigint < string < date < other. Null-like values (`null`, `undefined`,
 * `NaN`, invalid dates) go last by default.
 * @example [3, null, 1].sort(compareValues) // => [1, 3, null]
 */
export function compareValues(a: unknown, b: unknown, options: CompareOptions = {}): number {
  const { nulls = 'last', collator } = options;
  return withNulls(a, b, nulls, () => compareDefined(a, b, collator));
}

/**
 * Builds a comparer from a key selector. Nulls stay where `nulls` says in either direction.
 * @example
 * const people = [{ name: 'Ada', age: 36 }, { name: 'Ben', age: 41 }, { name: 'Cy', age: 29 }];
 * people.sort(by((p) => p.age, { direction: 'desc' })).map((p) => p.name); // => ['Ben', 'Ada', 'Cy']
 */
export function by<T>(selector: (item: T) => unknown, options: ByOptions = {}): Comparer<T> {
  const { direction = 'asc', nulls = 'last', collator } = options;
  const dir = direction === 'desc' ? -1 : 1;
  return (x, y) => {
    const a = selector(x);
    const b = selector(y);
    return withNulls(a, b, nulls, () => dir * compareDefined(a, b, collator));
  };
}

/**
 * Adds a key-selector tie-breaker to a comparer (use `composeComparers` to chain comparers).
 * @example
 * const rows = [{ first: 'Ben', last: 'Kay' }, { first: 'Ada', last: 'Lee' }, { first: 'Al', last: 'Kay' }];
 * rows.sort(thenBy(by((r) => r.last), (r) => r.first)).map((r) => r.first); // => ['Al', 'Ben', 'Ada']
 */
export function thenBy<T>(primary: Comparer<T>, selector: (item: T) => unknown, options: ByOptions = {}): Comparer<T> {
  const secondary = by(selector, options);
  return (a, b) => primary(a, b) || secondary(a, b);
}

/**
 * Combines comparers: the first non-zero result wins.
 * @example
 * const rows = [{ dept: 'IT', salary: 50 }, { dept: 'HR', salary: 40 }, { dept: 'IT', salary: 70 }];
 * rows.sort(composeComparers(by((r) => r.dept), by((r) => r.salary, { direction: 'desc' }))).map((r) => r.salary); // => [40, 70, 50]
 */
export function composeComparers<T>(...comparers: readonly Comparer<T>[]): Comparer<T> {
  return (a, b) => {
    for (const c of comparers) {
      const r = c(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };
}

/**
 * Reverses a comparer.
 * @example [1, 3, 2].sort(reverseComparer(compareValues)) // => [3, 2, 1]
 */
export function reverseComparer<T>(comparer: Comparer<T>): Comparer<T> {
  return (a, b) => -comparer(a, b) || 0;
}

const collators = new Map<string, Intl.Collator>();

function naturalCollator(locale: string | readonly string[] | undefined, sensitivity: Intl.CollatorOptions['sensitivity']): Intl.Collator {
  const key = `${Array.isArray(locale) ? locale.join(',') : String(locale ?? '')}|${sensitivity ?? ''}`;
  let c = collators.get(key);
  if (!c) {
    if (collators.size >= 32) collators.clear();
    c = new Intl.Collator(locale as string | string[] | undefined, { numeric: true, ...(sensitivity ? { sensitivity } : {}) });
    collators.set(key, c);
  }
  return c;
}

export interface NaturalCompareOptions {
  readonly locale?: string | readonly string[];
  /** Default: the collator's default (`'variant'`). Use `'base'` to ignore case and accents. */
  readonly sensitivity?: Intl.CollatorOptions['sensitivity'];
}

/**
 * Numeric-aware, locale-aware string comparison (`Intl.Collator` with `numeric: true`, cached).
 * @example ['file10', 'file2'].sort(naturalCompare) // => ['file2', 'file10']
 */
export function naturalCompare(a: string, b: string, options: NaturalCompareOptions = {}): number {
  return sign(naturalCollator(options.locale, options.sensitivity).compare(a, b));
}

/**
 * Equality: SameValueZero by default, structural with `{ deep: true }` (see `deepEqual`).
 * @example equals({ a: 1 }, { a: 1 }, { deep: true }) // => true
 */
export function equals(a: unknown, b: unknown, options: { readonly deep?: boolean } = {}): boolean {
  if (options.deep) return deepEqual(a, b);
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}

export interface BetweenOptions extends CompareOptions {
  /** Which bounds are included. Default `'both'`; `true` = `'both'`, `false` = `'none'`. */
  readonly inclusive?: 'both' | 'none' | 'left' | 'right' | boolean;
}

/**
 * True when `value` lies between `min` and `max` (numbers, bigints, strings, dates).
 * Null-like values are never between.
 * @example between(5, 1, 5) // => true
 * @example between(5, 1, 5, { inclusive: 'left' }) // => false
 */
export function between<T>(value: T, min: T, max: T, options: BetweenOptions = {}): boolean {
  const inc = options.inclusive ?? 'both';
  const mode = inc === true ? 'both' : inc === false ? 'none' : inc;
  if (rank(value) === -1 || rank(min) === -1 || rank(max) === -1) return false;
  const lo = compareDefined(value, min, options.collator);
  const hi = compareDefined(value, max, options.collator);
  const leftOk = mode === 'both' || mode === 'left' ? lo >= 0 : lo > 0;
  const rightOk = mode === 'both' || mode === 'right' ? hi <= 0 : hi < 0;
  return leftOk && rightOk;
}

/**
 * Half-open numeric range test `start <= value < end`.
 * @example inRange(3, 0, 3) // => false
 */
export function inRange(value: number, start: number, end: number): boolean {
  return value >= start && value < end;
}

/**
 * First value that is not `null`/`undefined`.
 * @example coalesce(undefined, null, 0, 1) // => 0
 */
export function coalesce<T>(...values: readonly T[]): NonNullable<T> | undefined {
  for (const v of values) if (v !== null && v !== undefined) return v;
  return undefined;
}

/**
 * First value that is not nullish and not a blank (whitespace-only) string.
 * @example coalesceBlank('  ', null, 'x') // => 'x'
 */
export function coalesceBlank<T>(...values: readonly T[]): NonNullable<T> | undefined {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    return v;
  }
  return undefined;
}

/** Fluent matcher returned by `match`. */
export interface Matcher<T, R> {
  /** Adds a case: a predicate (functions are always predicates) or a literal compared with SameValueZero. */
  with<U extends T>(predicate: (value: T) => value is U, handler: (value: U) => R): Matcher<T, R>;
  with(test: ((value: T) => boolean) | T, handler: (value: T) => R): Matcher<T, R>;
  /** Result of the first matching case, else of `handler`. */
  otherwise(handler: (value: T) => R): R;
}

/**
 * Minimal pattern matching; the first matching case wins and later cases are not evaluated.
 * @example
 * const label = (status: number): string =>
 *   match<number, string>(status).with(200, () => 'ok').with((s) => s >= 500, () => 'server').otherwise(() => 'other');
 * label(200); // => 'ok'
 * label(503); // => 'server'
 * label(404); // => 'other'
 */
export function match<T, R = unknown>(value: T): Matcher<T, R> {
  let done = false;
  let result: R | undefined;
  const m: Matcher<T, R> = {
    with(test: unknown, handler: (value: never) => R): Matcher<T, R> {
      if (done) return m;
      const hit = typeof test === 'function' ? Boolean((test as (v: T) => unknown)(value)) : equals(test, value);
      if (hit) {
        done = true;
        result = (handler as (v: T) => R)(value);
      }
      return m;
    },
    otherwise(handler: (value: T) => R): R {
      return done ? (result as R) : handler(value);
    },
  };
  return m;
}

/**
 * Returns a function that applies `fn` when `predicate` holds, else returns the input.
 * @example [1, -2].map(when((n: number) => n < 0, (n) => -n)) // => [1, 2]
 */
export function when<T, R>(predicate: (value: T) => boolean, fn: (value: T) => R): (value: T) => T | R {
  return (value) => (predicate(value) ? fn(value) : value);
}

/**
 * Returns a function that applies `fn` unless `predicate` holds.
 * @example unless((s: string) => s.endsWith('/'), (s) => `${s}/`)('a') // => 'a/'
 */
export function unless<T, R>(predicate: (value: T) => boolean, fn: (value: T) => R): (value: T) => T | R {
  return (value) => (predicate(value) ? value : fn(value));
}

/**
 * Returns a function that runs the handler of the first passing predicate, else `fallback` (or `undefined`).
 * @example const grade = cond([[(n: number) => n >= 90, () => 'A'], [(n) => n >= 80, () => 'B']], () => 'C');
 */
export function cond<T, R>(pairs: readonly (readonly [(value: T) => boolean, (value: T) => R])[], fallback?: (value: T) => R): (value: T) => R | undefined {
  return (value) => {
    for (const [p, fn] of pairs) if (p(value)) return fn(value);
    return fallback?.(value);
  };
}

/**
 * Returns a function choosing between two branches.
 * @example ifElse((n: number) => n % 2 === 0, () => 'even', () => 'odd')(3) // => 'odd'
 */
export function ifElse<T, A, B>(predicate: (value: T) => boolean, onTrue: (value: T) => A, onFalse: (value: T) => B): (value: T) => A | B {
  return (value) => (predicate(value) ? onTrue(value) : onFalse(value));
}

/**
 * Equality on a selected key (SameValueZero, or deep with `{ deep: true }`).
 * @example isEqualBy((u: { id: number }) => u.id)({ id: 1 }, { id: 1 }) // => true
 */
export function isEqualBy<T>(selector: (value: T) => unknown, options: { readonly deep?: boolean } = {}): (a: T, b: T) => boolean {
  return (a, b) => equals(selector(a), selector(b), options);
}

/**
 * Smallest item by comparer (first wins on ties), or `undefined` when empty.
 * @example minOf([3, 1, 2]) // => 1
 */
export function minOf<T>(items: Iterable<T>, comparer: Comparer<T> = compareValues): T | undefined {
  let best: T | undefined;
  let has = false;
  for (const x of items) {
    if (!has || comparer(x, best as T) < 0) {
      best = x;
      has = true;
    }
  }
  return best;
}

/**
 * Largest item by comparer (first wins on ties), or `undefined` when empty.
 * @example maxOf(['b', 'a'], naturalCompare) // => 'b'
 */
export function maxOf<T>(items: Iterable<T>, comparer: Comparer<T> = compareValues): T | undefined {
  return minOf(items, (a, b) => comparer(b, a));
}

/**
 * Predicate that passes when all predicates pass (short-circuit; empty -> true).
 * @example allPass([(n: number) => n > 0, (n) => n < 10])(5) // => true
 */
export function allPass<T>(predicates: readonly ((value: T) => boolean)[]): (value: T) => boolean {
  return (value) => predicates.every((p) => p(value));
}

/**
 * Predicate that passes when any predicate passes (empty -> false).
 * @example anyPass([(n: number) => n < 0, (n) => n > 10])(11) // => true
 */
export function anyPass<T>(predicates: readonly ((value: T) => boolean)[]): (value: T) => boolean {
  return (value) => predicates.some((p) => p(value));
}

/**
 * Predicate that passes when no predicate passes.
 * @example nonePass([(s: string) => s === ''])('x') // => true
 */
export function nonePass<T>(predicates: readonly ((value: T) => boolean)[]): (value: T) => boolean {
  return (value) => !predicates.some((p) => p(value));
}

/**
 * Predicate that passes when exactly one predicate passes (n-ary xor on predicates).
 * @example onePass([(n: number) => n > 0, (n) => n > 5])(3) // => true
 */
export function onePass<T>(predicates: readonly ((value: T) => boolean)[]): (value: T) => boolean {
  return (value) => {
    let n = 0;
    for (const p of predicates) if (p(value) && ++n > 1) return false;
    return n === 1;
  };
}

/**
 * Negates a predicate.
 * @example [1, 2].filter(complement((n: number) => n % 2 === 0)) // => [1]
 */
export function complement<A extends unknown[]>(predicate: (...args: A) => boolean): (...args: A) => boolean {
  return (...args) => !predicate(...args);
}

export interface OrderCheckOptions<T> {
  /** Default `compareValues`. */
  readonly comparer?: Comparer<T>;
  /** Require strictly increasing/decreasing values (no equal neighbours). Default false. */
  readonly strict?: boolean;
}

/**
 * True when the array is in ascending order.
 * @example isAscending([1, 2, 2, 3]) // => true
 */
export function isAscending<T>(items: readonly T[], options: OrderCheckOptions<T> = {}): boolean {
  const { comparer = compareValues, strict = false } = options;
  for (let i = 1; i < items.length; i++) {
    const r = comparer(items[i - 1] as T, items[i] as T);
    if (r > 0 || (strict && r === 0)) return false;
  }
  return true;
}

/**
 * True when the array is in descending order.
 * @example isDescending([3, 2, 1], { strict: true }) // => true
 */
export function isDescending<T>(items: readonly T[], options: OrderCheckOptions<T> = {}): boolean {
  const { comparer = compareValues, strict = false } = options;
  return isAscending(items, { comparer: (a, b) => comparer(b, a), strict });
}
