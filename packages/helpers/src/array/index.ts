/**
 * Array helpers (docs/PLAN-HELPERS.md section 2). Every function returns a new array and never mutates
 * its input. Record-producing helpers return null-prototype objects, so no key (including
 * `__proto__`) can reach `Object.prototype`.
 */
import { LimitError, ValidationError } from '../error/index.js';
import { compareNatural, isEmptyKey } from './compare.js';

export { buildTree, flattenTree } from './tree.js';
export type { BuildTreeOptions, BuildTreeResult, FlattenTreeOptions, FlatTreeEntry, TreeNode } from './tree.js';

/** Maximum element count produced by `range`, `times`, and `repeat`. */
export const MAX_GENERATED_LENGTH = 10_000_000;

/** Element comparer: negative, zero, or positive. */
export type Comparer<T> = (a: T, b: T) => number;

const invalid = (code: string, message: string): ValidationError => new ValidationError(code, message);

function assertPositiveInt(n: number, code: string, message: string): void {
  if (!Number.isSafeInteger(n) || n < 1) throw invalid(code, message);
}

function assertLength(n: number): void {
  if (n > MAX_GENERATED_LENGTH) throw new LimitError('HLP_ARRAY_TOO_LARGE', 'The requested array length exceeds the limit.', { details: { limit: MAX_GENERATED_LENGTH } });
}

/** Resolves a possibly negative index; `undefined` when out of range. */
function resolveIndex(length: number, index: number): number | undefined {
  if (!Number.isInteger(index)) return undefined;
  const i = index < 0 ? length + index : index;
  return i >= 0 && i < length ? i : undefined;
}

function requireIndex(length: number, index: number): number {
  const i = resolveIndex(length, index);
  if (i === undefined) throw invalid('HLP_ARRAY_INDEX_OUT_OF_RANGE', 'The index is out of range.');
  return i;
}

// ---------------------------------------------------------------------------
// Grouping and partitioning

/**
 * Splits into chunks of `size`; the last chunk may be shorter.
 * @example
 * chunk([1, 2, 3, 4, 5], 2); // => [[1, 2], [3, 4], [5]]
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  assertPositiveInt(size, 'HLP_ARRAY_INVALID_SIZE', 'Chunk size must be a positive integer.');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Splits into `[matching, rest]`, preserving order.
 * @example
 * partition([1, 2, 3, 4], (n) => n % 2 === 0); // => [[2, 4], [1, 3]]
 */
export function partition<T, S extends T>(items: readonly T[], predicate: (item: T, index: number) => item is S): [S[], Exclude<T, S>[]];
export function partition<T>(items: readonly T[], predicate: (item: T, index: number) => boolean): [T[], T[]];
export function partition<T>(items: readonly T[], predicate: (item: T, index: number) => boolean): [T[], T[]] {
  const yes: T[] = [];
  const no: T[] = [];
  items.forEach((item, i) => (predicate(item, i) ? yes : no).push(item));
  return [yes, no];
}

type ObjectGroupBy = <T, K extends PropertyKey>(items: Iterable<T>, fn: (item: T, index: number) => K) => Partial<Record<K, T[]>>;
type MapGroupBy = <T, K>(items: Iterable<T>, fn: (item: T, index: number) => K) => Map<K, T[]>;

/**
 * Groups into a null-prototype record keyed by `keyFn` (native `Object.groupBy` when present).
 * @example
 * groupBy(['one', 'two', 'three'], (s) => s.length); // => { 3: ['one', 'two'], 5: ['three'] }
 */
export function groupBy<T, K extends PropertyKey>(items: Iterable<T>, keyFn: (item: T, index: number) => K): Partial<Record<K, T[]>> {
  const native = (Object as { groupBy?: ObjectGroupBy }).groupBy;
  if (typeof native === 'function') return native(items, keyFn);
  const out = Object.create(null) as Partial<Record<K, T[]>>;
  let i = 0;
  for (const item of items) {
    const key = keyFn(item, i++);
    const bucket = out[key];
    if (bucket) bucket.push(item);
    else out[key] = [item];
  }
  return out;
}

/**
 * Groups into a `Map` (native `Map.groupBy` when present); keys use SameValueZero.
 * @example
 * groupByToMap([{ d: 1 }, { d: 2 }, { d: 1 }], (x) => x.d).get(1)?.length; // => 2
 */
export function groupByToMap<T, K>(items: Iterable<T>, keyFn: (item: T, index: number) => K): Map<K, T[]> {
  const native = (Map as { groupBy?: MapGroupBy }).groupBy;
  if (typeof native === 'function') return native(items, keyFn);
  const out = new Map<K, T[]>();
  let i = 0;
  for (const item of items) {
    const key = keyFn(item, i++);
    const bucket = out.get(key);
    if (bucket) bucket.push(item);
    else out.set(key, [item]);
  }
  return out;
}

/**
 * Indexes items by key into a null-prototype record; later items win.
 * @example
 * keyBy([{ id: 'a' }, { id: 'b' }], (x) => x.id); // => { a: { id: 'a' }, b: { id: 'b' } }
 */
export function keyBy<T, K extends PropertyKey>(items: Iterable<T>, keyFn: (item: T, index: number) => K): Partial<Record<K, T>> {
  const out = Object.create(null) as Partial<Record<K, T>>;
  let i = 0;
  for (const item of items) out[keyFn(item, i++)] = item;
  return out;
}

/**
 * Counts items per key into a null-prototype record.
 * @example
 * countBy(['a', 'bb', 'cc'], (s) => s.length); // => { 1: 1, 2: 2 }
 */
export function countBy<T, K extends PropertyKey>(items: Iterable<T>, keyFn: (item: T, index: number) => K): Partial<Record<K, number>> {
  const out = Object.create(null) as Partial<Record<K, number>>;
  let i = 0;
  for (const item of items) {
    const key = keyFn(item, i++);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zipping and flattening

/**
 * Combines arrays element-wise into tuples; stops at the shortest array.
 * @example
 * zip([1, 2, 3], ['a', 'b']); // => [[1, 'a'], [2, 'b']]
 */
export function zip<const T extends readonly (readonly unknown[])[]>(...arrays: T): { -readonly [K in keyof T]: T[K][number] }[] {
  if (arrays.length === 0) return [];
  const len = Math.min(...arrays.map((a) => a.length));
  const out: unknown[][] = [];
  for (let i = 0; i < len; i++) out.push(arrays.map((a) => a[i]));
  return out as { -readonly [K in keyof T]: T[K][number] }[];
}

/**
 * Combines two arrays element-wise with `fn`; stops at the shorter array.
 * @example
 * zipWith([1, 2], [10, 20], (a, b) => a + b); // => [11, 22]
 */
export function zipWith<A, B, R>(a: readonly A[], b: readonly B[], fn: (a: A, b: B, index: number) => R): R[] {
  const len = Math.min(a.length, b.length);
  const out: R[] = [];
  for (let i = 0; i < len; i++) out.push(fn(a[i] as A, b[i] as B, i));
  return out;
}

/**
 * Inverse of `zip`: splits tuples into one array per position (width of the longest row).
 * @example
 * unzip([[1, 'a'], [2, 'b']] as [number, string][]); // => [[1, 2], ['a', 'b']]
 */
export function unzip<const T extends readonly unknown[]>(rows: readonly T[]): { -readonly [K in keyof T]: T[K][] } {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const out: unknown[][] = Array.from({ length: width }, () => []);
  for (const row of rows) for (let j = 0; j < width; j++) out[j]?.push(row[j]);
  return out as { -readonly [K in keyof T]: T[K][] };
}

/**
 * Flattens nested arrays up to `depth` (default 1).
 * @example
 * flatten([1, [2, [3]]]); // => [1, 2, [3]]
 */
export function flatten<A extends readonly unknown[], D extends number = 1>(items: A, depth?: D): FlatArray<A, D>[] {
  const d = depth ?? 1;
  if (!(d === Infinity || (Number.isInteger(d) && d >= 0))) throw invalid('HLP_ARRAY_INVALID_DEPTH', 'Depth must be a non-negative integer.');
  return items.flat(d) as FlatArray<A, D>[];
}

/**
 * Flattens all nesting levels.
 * @example
 * flattenDeep([1, [2, [3, [4]]]]); // => [1, 2, 3, 4]
 */
export function flattenDeep<A extends readonly unknown[]>(items: A): FlatArray<A, 20>[] {
  return items.flat(Infinity) as FlatArray<A, 20>[];
}

/**
 * Removes `null`, `undefined`, and `false` (keeps `0`, `''`, and `NaN`).
 * @example
 * compact([0, null, 'a', false, undefined]); // => [0, 'a']
 */
export function compact<T>(items: readonly T[]): Exclude<T, null | undefined | false>[] {
  return items.filter((x): x is Exclude<T, null | undefined | false> => x !== null && x !== undefined && x !== false);
}

/**
 * Removes duplicates (SameValueZero), keeping first occurrences.
 * @example
 * uniq([1, 2, 1, NaN, NaN]); // => [1, 2, NaN]
 */
export function uniq<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/**
 * Removes items with a duplicate key, keeping first occurrences.
 * @example
 * uniqBy([{ id: 1 }, { id: 1 }, { id: 2 }], (x) => x.id); // => [{ id: 1 }, { id: 2 }]
 */
export function uniqBy<T>(items: readonly T[], keyFn: (item: T) => unknown): T[] {
  const seen = new Set<unknown>();
  const out: T[] = [];
  for (const item of items) {
    const k = keyFn(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sorting and searching

/** One sort key: a selector with direction, null placement, and string ordering. */
export interface SortKey<T> {
  readonly by: (item: T) => unknown;
  /** Default `'asc'`. */
  readonly order?: 'asc' | 'desc';
  /** Placement of empty keys (nullish, `NaN`, invalid dates), independent of `order`. Default `'last'`. */
  readonly nulls?: 'first' | 'last';
  /** String collation for this key; overrides `SortByOptions.collator`. */
  readonly collator?: Intl.Collator;
  /** Custom comparer for non-empty keys; overrides collation. */
  readonly compare?: Comparer<unknown>;
}

export interface SortByOptions {
  /** Collator for string keys. Strings compare by code unit when neither this nor `locale` is set. */
  readonly collator?: Intl.Collator;
  /** Locale for a cached `Intl.Collator` (used when `collator` is absent). */
  readonly locale?: string | readonly string[];
  /** Default null placement for keys without their own. Default `'last'`. */
  readonly nulls?: 'first' | 'last';
}

const collators = new Map<string, Intl.Collator>();
function cachedCollator(locale: string | readonly string[]): Intl.Collator {
  const id = typeof locale === 'string' ? locale : locale.join(',');
  let c = collators.get(id);
  if (!c) {
    if (collators.size >= 32) collators.clear();
    c = new Intl.Collator(typeof locale === 'string' ? locale : [...locale]);
    collators.set(id, c);
  }
  return c;
}

/**
 * Stable multi-key sort. Keys are evaluated once per item.
 * @example
 * const people = [{ name: 'Ada', dept: 'Vertrieb', salary: 50 }, { name: 'Ben', dept: 'Ärzte', salary: 40 }, { name: 'Cy', dept: 'Vertrieb', salary: 70 }];
 * sortBy(people, [{ by: (p) => p.dept }, { by: (p) => p.salary, order: 'desc' }], { locale: 'de' }).map((p) => p.name); // => ['Ben', 'Cy', 'Ada']
 */
export function sortBy<T>(items: readonly T[], keys: ((item: T) => unknown) | SortKey<T> | readonly (((item: T) => unknown) | SortKey<T>)[], options: SortByOptions = {}): T[] {
  const list = (Array.isArray(keys) ? keys : [keys]) as readonly (((item: T) => unknown) | SortKey<T>)[];
  const defaultCollator = options.collator ?? (options.locale === undefined ? undefined : cachedCollator(options.locale));
  const specs = list.map((k) => {
    const key: SortKey<T> = typeof k === 'function' ? { by: k } : k;
    const dir = key.order === 'desc' ? -1 : 1;
    const nullsFirst = (key.nulls ?? options.nulls ?? 'last') === 'first';
    const collator = key.collator ?? defaultCollator;
    const cmp = key.compare;
    const values = items.map((item) => key.by(item));
    return { dir, nullsFirst, collator, cmp, values };
  });
  const idx = items.map((_, i) => i);
  idx.sort((i, j) => {
    for (const s of specs) {
      const a = s.values[i];
      const b = s.values[j];
      const ea = isEmptyKey(a);
      const eb = isEmptyKey(b);
      if (ea || eb) {
        if (ea && eb) continue;
        return ea === s.nullsFirst ? -1 : 1;
      }
      const c = s.cmp ? s.cmp(a, b) : compareNatural(a, b, s.collator);
      if (c !== 0) return c * s.dir;
    }
    return i - j;
  });
  return idx.map((i) => items[i] as T);
}

/**
 * Index of `target` in a sorted array, or `~insertionPoint` (negative) when absent.
 * @example
 * binarySearch([1, 3, 5], 3); // => 1
 * ~binarySearch([1, 3, 5], 4); // => 2
 */
export function binarySearch<T>(sorted: readonly T[], target: T, compare: Comparer<T> = compareNatural): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const c = compare(sorted[mid] as T, target);
    if (c === 0) return mid;
    if (c < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return ~lo;
}

/**
 * First index whose element is not less than `target`.
 * @example
 * lowerBound([1, 2, 2, 3], 2); // => 1
 */
export function lowerBound<T>(sorted: readonly T[], target: T, compare: Comparer<T> = compareNatural): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compare(sorted[mid] as T, target) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * First index whose element is greater than `target`.
 * @example
 * upperBound([1, 2, 2, 3], 2); // => 3
 */
export function upperBound<T>(sorted: readonly T[], target: T, compare: Comparer<T> = compareNatural): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compare(sorted[mid] as T, target) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Keeps the best `n` items in a bounded heap of indexes: O(len log n); ties keep earlier items. */
function selectBest<T>(items: readonly T[], n: number, better: Comparer<T>): T[] {
  if (!Number.isSafeInteger(n) || n < 0) throw invalid('HLP_ARRAY_INVALID_COUNT', 'Count must be a non-negative integer.');
  if (n === 0) return [];
  // `beats(x, y)`: item x ranks ahead of item y. The heap root is the weakest kept item.
  const beats = (x: number, y: number): boolean => {
    const c = better(items[x] as T, items[y] as T);
    return c < 0 || (c === 0 && x < y);
  };
  const heap: number[] = [];
  const at = (i: number): number => heap[i] ?? 0;
  const siftDown = (i: number): void => {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let w = i;
      if (l < heap.length && beats(at(w), at(l))) w = l;
      if (r < heap.length && beats(at(w), at(r))) w = r;
      if (w === i) return;
      const t = at(w);
      heap[w] = at(i);
      heap[i] = t;
      i = w;
    }
  };
  for (let x = 0; x < items.length; x++) {
    if (heap.length < n) {
      let i = heap.push(x) - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!beats(at(p), at(i))) break;
        const t = at(p);
        heap[p] = at(i);
        heap[i] = t;
        i = p;
      }
    } else if (beats(x, at(0))) {
      heap[0] = x;
      siftDown(0);
    }
  }
  return heap.sort((x, y) => (beats(x, y) ? -1 : 1)).map((i) => items[i] as T);
}

/**
 * The `n` largest items, largest first (stable for ties). O(len log n).
 * @example
 * topN([5, 1, 9, 3], 2); // => [9, 5]
 * const users = [{ name: 'Ada', score: 7 }, { name: 'Ben', score: 9 }, { name: 'Cy', score: 4 }];
 * topN(users, 2, (a, b) => a.score - b.score).map((u) => u.name); // => ['Ben', 'Ada']
 */
export function topN<T>(items: readonly T[], n: number, compare: Comparer<T> = compareNatural): T[] {
  return selectBest(items, n, (a, b) => compare(b, a));
}

/**
 * The `n` smallest items, smallest first (stable for ties). O(len log n).
 * @example
 * bottomN([5, 1, 9, 3], 2); // => [1, 3]
 */
export function bottomN<T>(items: readonly T[], n: number, compare: Comparer<T> = compareNatural): T[] {
  return selectBest(items, n, compare);
}

// ---------------------------------------------------------------------------
// Immutable edits

/**
 * Moves the item at `from` to `to` (negative indexes count from the end).
 * @example
 * move(['a', 'b', 'c'], 0, 2); // => ['b', 'c', 'a']
 */
export function move<T>(items: readonly T[], from: number, to: number): T[] {
  const f = requireIndex(items.length, from);
  const t = requireIndex(items.length, to);
  const out = items.slice();
  const [item] = out.splice(f, 1) as [T];
  out.splice(t, 0, item);
  return out;
}

/**
 * Inserts items before `index` (`index === length` appends; negative counts from the end).
 * @example
 * insertAt([1, 4], 1, 2, 3); // => [1, 2, 3, 4]
 */
export function insertAt<T>(items: readonly T[], index: number, ...values: T[]): T[] {
  const i = index === items.length ? index : requireIndex(items.length, index);
  return [...items.slice(0, i), ...values, ...items.slice(i)];
}

/**
 * Removes `count` items starting at `index` (negative counts from the end).
 * @example
 * removeAt([1, 2, 3, 4], 1, 2); // => [1, 4]
 */
export function removeAt<T>(items: readonly T[], index: number, count = 1): T[] {
  const i = requireIndex(items.length, index);
  if (!Number.isSafeInteger(count) || count < 0) throw invalid('HLP_ARRAY_INVALID_COUNT', 'Count must be a non-negative integer.');
  return items.toSpliced(i, count);
}

/**
 * Replaces the item at `index` (negative counts from the end).
 * @example
 * replaceAt([1, 2, 3], -1, 9); // => [1, 2, 9]
 */
export function replaceAt<T>(items: readonly T[], index: number, value: T): T[] {
  return items.with(requireIndex(items.length, index), value);
}

/**
 * Swaps two items.
 * @example
 * swap([1, 2, 3], 0, 2); // => [3, 2, 1]
 */
export function swap<T>(items: readonly T[], i: number, j: number): T[] {
  const a = requireIndex(items.length, i);
  const b = requireIndex(items.length, j);
  const out = items.slice();
  [out[a], out[b]] = [items[b] as T, items[a] as T];
  return out;
}

/**
 * Removes every item equal to `item`, or appends it when absent.
 * @example
 * toggleItem([1, 2], 2); // => [1]
 * toggleItem([1, 2], 3); // => [1, 2, 3]
 */
export function toggleItem<T>(items: readonly T[], item: T, equals: (a: T, b: T) => boolean = Object.is): T[] {
  const rest = items.filter((x) => !equals(x, item));
  return rest.length === items.length ? [...items, item] : rest;
}

/**
 * Replaces the first item with the same key, or appends.
 * @example
 * upsertBy([{ id: 1, v: 'a' }], { id: 1, v: 'b' }, (x) => x.id); // => [{ id: 1, v: 'b' }]
 */
export function upsertBy<T>(items: readonly T[], item: T, keyFn: (item: T) => unknown): T[] {
  const key = keyFn(item);
  const i = items.findIndex((x) => Object.is(keyFn(x), key));
  return i < 0 ? [...items, item] : items.with(i, item);
}

/**
 * Rotates by `n` positions: positive moves items toward the end, negative toward the start.
 * @example
 * rotate([1, 2, 3, 4], 1); // => [4, 1, 2, 3]
 * rotate([1, 2, 3, 4], -1); // => [2, 3, 4, 1]
 */
export function rotate<T>(items: readonly T[], n: number): T[] {
  const len = items.length;
  if (!Number.isInteger(n)) throw invalid('HLP_ARRAY_INVALID_COUNT', 'Rotation must be an integer.');
  if (len === 0) return [];
  const k = (((-n) % len) + len) % len;
  return [...items.slice(k), ...items.slice(0, k)];
}

/**
 * Splits into `[before, fromIndex]` (negative counts from the end; out of range clamps).
 * @example
 * splitAt([1, 2, 3], 1); // => [[1], [2, 3]]
 */
export function splitAt<T>(items: readonly T[], index: number): [T[], T[]] {
  return [items.slice(0, index), items.slice(index)];
}

/**
 * Inserts `separator` between items.
 * @example
 * intersperse(['a', 'b', 'c'], ','); // => ['a', ',', 'b', ',', 'c']
 */
export function intersperse<T, S>(items: readonly T[], separator: S): (T | S)[] {
  const out: (T | S)[] = [];
  items.forEach((x, i) => {
    if (i > 0) out.push(separator);
    out.push(x);
  });
  return out;
}

/**
 * Leading items while `predicate` holds.
 * @example
 * takeWhile([1, 2, 5, 1], (n) => n < 3); // => [1, 2]
 */
export function takeWhile<T>(items: readonly T[], predicate: (item: T, index: number) => boolean): T[] {
  const i = items.findIndex((x, j) => !predicate(x, j));
  return i < 0 ? items.slice() : items.slice(0, i);
}

/**
 * Items after the leading run where `predicate` holds.
 * @example
 * dropWhile([1, 2, 5, 1], (n) => n < 3); // => [5, 1]
 */
export function dropWhile<T>(items: readonly T[], predicate: (item: T, index: number) => boolean): T[] {
  const i = items.findIndex((x, j) => !predicate(x, j));
  return i < 0 ? [] : items.slice(i);
}

// ---------------------------------------------------------------------------
// Generation and windows

/**
 * Numbers from `start` (inclusive) to `end` (exclusive) by `step`. `range(n)` is `0..n-1`.
 * Throws `HLP_ARRAY_INVALID_RANGE` for non-finite input or a zero step, and `HLP_ARRAY_TOO_LARGE` above `MAX_GENERATED_LENGTH`.
 * @example
 * range(3); // => [0, 1, 2]
 * range(10, 0, -5); // => [10, 5]
 * range(0, 1, 0.25); // => [0, 0.25, 0.5, 0.75]
 */
export function range(start: number, end?: number, step?: number): number[] {
  const [from, to] = end === undefined ? [0, start] : [start, end];
  const by = step ?? (to >= from ? 1 : -1);
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(by) || by === 0) throw invalid('HLP_ARRAY_INVALID_RANGE', 'Range bounds and step must be finite and the step non-zero.');
  const count = Math.max(0, Math.ceil((to - from) / by));
  assertLength(count);
  return Array.from({ length: count }, (_, i) => from + i * by);
}

/**
 * Calls `fn` `count` times and collects the results.
 * @example
 * times(3, (i) => i * 2); // => [0, 2, 4]
 */
export function times<T>(count: number, fn: (index: number) => T): T[] {
  if (!Number.isSafeInteger(count) || count < 0) throw invalid('HLP_ARRAY_INVALID_COUNT', 'Count must be a non-negative integer.');
  assertLength(count);
  return Array.from({ length: count }, (_, i) => fn(i));
}

/**
 * An array of `count` copies of `value`.
 * @example
 * repeat('x', 3); // => ['x', 'x', 'x']
 */
export function repeat<T>(value: T, count: number): T[] {
  return times(count, () => value);
}

/**
 * Sliding windows of `size`, advancing by `step`; only full windows are returned.
 * @example
 * windowed([1, 2, 3, 4], 2); // => [[1, 2], [2, 3], [3, 4]]
 * windowed([1, 2, 3, 4, 5], 2, 2); // => [[1, 2], [3, 4]]
 */
export function windowed<T>(items: readonly T[], size: number, step = 1): T[][] {
  assertPositiveInt(size, 'HLP_ARRAY_INVALID_SIZE', 'Window size must be a positive integer.');
  assertPositiveInt(step, 'HLP_ARRAY_INVALID_SIZE', 'Window step must be a positive integer.');
  const out: T[][] = [];
  for (let i = 0; i + size <= items.length; i += step) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Adjacent pairs.
 * @example
 * pairwise([1, 2, 3]); // => [[1, 2], [2, 3]]
 */
export function pairwise<T>(items: readonly T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 1; i < items.length; i++) out.push([items[i - 1] as T, items[i] as T]);
  return out;
}

/** One page of a list. */
export interface Page<T> {
  readonly items: T[];
  readonly total: number;
  /** 1-based page number as requested. */
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
}

/**
 * Slices one 1-based page. Pages past the end have no items.
 * @example
 * paginate(range(25), 3, 10); // => { items: [20, 21, 22, 23, 24], total: 25, page: 3, pageSize: 10, pageCount: 3, hasNext: false, hasPrev: true }
 */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  assertPositiveInt(page, 'HLP_ARRAY_INVALID_PAGE', 'Page must be a positive integer.');
  assertPositiveInt(pageSize, 'HLP_ARRAY_INVALID_PAGE', 'Page size must be a positive integer.');
  const total = items.length;
  const pageCount = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page, pageSize, pageCount, hasNext: page < pageCount, hasPrev: page > 1 };
}

// ---------------------------------------------------------------------------
// Access and aggregates

/**
 * First item, or `undefined`.
 * @example
 * first([1, 2]); // => 1
 */
export function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

/**
 * Last item, or `undefined`.
 * @example
 * last([1, 2]); // => 2
 */
export function last<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1];
}

/**
 * Item at `index` (negative counts from the end), or `undefined`.
 * @example
 * nth([1, 2, 3], -2); // => 2
 */
export function nth<T>(items: readonly T[], index: number): T | undefined {
  const i = resolveIndex(items.length, index);
  return i === undefined ? undefined : items[i];
}

/**
 * Sum of `fn` over items with compensated (Neumaier) summation.
 * @example
 * sumBy([{ n: 1e100 }, { n: 1 }, { n: -1e100 }], (x) => x.n); // => 1 // plain addition gives 0
 */
export function sumBy<T>(items: readonly T[], fn: (item: T, index: number) => number): number {
  let sum = 0;
  let c = 0;
  items.forEach((item, i) => {
    const v = fn(item, i);
    const t = sum + v;
    c += Math.abs(sum) >= Math.abs(v) ? sum - t + v : v - t + sum;
    sum = t;
  });
  return sum + c;
}

/**
 * Mean of `fn` over items, or `undefined` for an empty array.
 * @example
 * averageBy([{ n: 2 }, { n: 4 }], (x) => x.n); // => 3
 */
export function averageBy<T>(items: readonly T[], fn: (item: T, index: number) => number): number | undefined {
  return items.length === 0 ? undefined : sumBy(items, fn) / items.length;
}

function extremeBy<T>(items: readonly T[], fn: (item: T) => unknown, sign: 1 | -1): T | undefined {
  let best: T | undefined;
  let bestKey: unknown;
  let found = false;
  for (const item of items) {
    const k = fn(item);
    if (isEmptyKey(k)) continue;
    if (!found || compareNatural(k, bestKey) * sign < 0) {
      best = item;
      bestKey = k;
      found = true;
    }
  }
  return best;
}

/**
 * Item with the smallest key (first on ties; empty keys ignored), or `undefined`.
 * @example
 * minBy([{ n: 2 }, { n: 1 }], (x) => x.n); // => { n: 1 }
 */
export function minBy<T>(items: readonly T[], fn: (item: T) => unknown): T | undefined {
  return extremeBy(items, fn, 1);
}

/**
 * Item with the largest key (first on ties; empty keys ignored), or `undefined`.
 * @example
 * maxBy([{ n: 2 }, { n: 1 }], (x) => x.n); // => { n: 2 }
 */
export function maxBy<T>(items: readonly T[], fn: (item: T) => unknown): T | undefined {
  return extremeBy(items, fn, -1);
}

/**
 * Shallow element-wise equality (default `Object.is`).
 * @example
 * arraysEqual([1, 2], [1, 2]); // => true
 */
export function arraysEqual<T>(a: readonly T[], b: readonly T[], equals: (x: T, y: T) => boolean = Object.is): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!equals(a[i] as T, b[i] as T)) return false;
  return true;
}
