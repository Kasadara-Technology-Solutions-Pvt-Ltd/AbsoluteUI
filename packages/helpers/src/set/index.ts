/**
 * Set algebra over arrays and `Set`s (docs/PLAN-HELPERS.md section 2). Results keep first-occurrence order
 * and contain no duplicates. The result type follows the first argument: a `Set` in gives a `Set` out,
 * any other iterable gives an array. Plain functions use SameValueZero (native `Set` methods when
 * available); the `...By` variants compare by a key selector and keep the first item per key.
 */
import { LimitError } from '../error/index.js';

type Collection<T> = Iterable<T>;
type Key<T> = (item: T) => unknown;

/** ES2025 Set methods, feature-detected at call time (not in the ES2023 lib typings). */
interface NativeSetMethods<T> {
  union?: (other: ReadonlySet<T>) => Set<T>;
  intersection?: (other: ReadonlySet<T>) => Set<T>;
  difference?: (other: ReadonlySet<T>) => Set<T>;
  symmetricDifference?: (other: ReadonlySet<T>) => Set<T>;
  isSubsetOf?: (other: ReadonlySet<T>) => boolean;
  isSupersetOf?: (other: ReadonlySet<T>) => boolean;
  isDisjointFrom?: (other: ReadonlySet<T>) => boolean;
}

const native = <T>(s: ReadonlySet<T>): NativeSetMethods<T> => s as ReadonlySet<T> & NativeSetMethods<T>;
const isSet = <T>(v: Collection<T>): v is ReadonlySet<T> => v instanceof Set;
const toSet = <T>(v: Collection<T>): ReadonlySet<T> => (isSet(v) ? v : new Set(v));

function output<T>(first: Collection<unknown>, items: Iterable<T>): T[] | Set<T> {
  return isSet(first) ? new Set(items) : [...items];
}

/** Items of `source` deduplicated by key, first occurrence wins. */
function distinctByKey<T>(source: Iterable<T>, key: Key<T>): Map<unknown, T> {
  const m = new Map<unknown, T>();
  for (const item of source) {
    const k = key(item);
    if (!m.has(k)) m.set(k, item);
  }
  return m;
}

function keySet<T>(source: Iterable<T>, key: Key<T>): Set<unknown> {
  const s = new Set<unknown>();
  for (const item of source) s.add(key(item));
  return s;
}

// ---------------------------------------------------------------------------
// Union

/**
 * Items in either collection, `a` first.
 * @example
 * union([1, 2], [2, 3]); // => [1, 2, 3]
 * union(new Set([1]), [2]); // => new Set([1, 2])
 */
export function union<T>(a: ReadonlySet<T>, b: Collection<T>): Set<T>;
export function union<T>(a: Collection<T>, b: Collection<T>): T[];
export function union<T>(a: Collection<T>, b: Collection<T>): T[] | Set<T> {
  if (isSet(a) && isSet(b)) {
    const fn = native(a).union;
    if (fn) return fn.call(a, b);
  }
  const s = new Set(a);
  for (const x of b) s.add(x);
  return output(a, s);
}

/**
 * Union by key; the first item per key wins.
 * @example
 * unionBy([{ id: 1, v: 'a' }], [{ id: 1, v: 'b' }, { id: 2 }], (x) => x.id); // => [{ id: 1, v: 'a' }, { id: 2 }]
 */
export function unionBy<T>(a: ReadonlySet<T>, b: Collection<T>, key: Key<T>): Set<T>;
export function unionBy<T>(a: Collection<T>, b: Collection<T>, key: Key<T>): T[];
export function unionBy<T>(a: Collection<T>, b: Collection<T>, key: Key<T>): T[] | Set<T> {
  const m = distinctByKey(a, key);
  for (const x of b) {
    const k = key(x);
    if (!m.has(k)) m.set(k, x);
  }
  return output(a, m.values());
}

// ---------------------------------------------------------------------------
// Intersection

/**
 * Items of `a` also in `b`, in `a`'s order.
 * @example
 * intersect([3, 1, 2], [2, 3]); // => [3, 2]
 */
export function intersect<T>(a: ReadonlySet<T>, b: Collection<T>): Set<T>;
export function intersect<T>(a: Collection<T>, b: Collection<T>): T[];
export function intersect<T>(a: Collection<T>, b: Collection<T>): T[] | Set<T> {
  // Native `intersection` iterates the smaller set, so it keeps `a`'s order only when `a` is not larger.
  if (isSet(a) && isSet(b) && a.size <= b.size) {
    const fn = native(a).intersection;
    if (fn) return fn.call(a, b);
  }
  const bs = toSet(b);
  return output(a, [...new Set(a)].filter((x) => bs.has(x)));
}

/**
 * Items of `a` whose key occurs in `b`, deduplicated by key.
 * @example
 * intersectBy([{ id: 1 }, { id: 2 }], [{ id: 2 }], (x) => x.id); // => [{ id: 2 }]
 */
export function intersectBy<T>(a: ReadonlySet<T>, b: Collection<T>, key: Key<T>): Set<T>;
export function intersectBy<T>(a: Collection<T>, b: Collection<T>, key: Key<T>): T[];
export function intersectBy<T>(a: Collection<T>, b: Collection<T>, key: Key<T>): T[] | Set<T> {
  const bk = keySet(b, key);
  return output(a, [...distinctByKey(a, key)].filter(([k]) => bk.has(k)).map(([, v]) => v));
}

// ---------------------------------------------------------------------------
// Difference

/**
 * Items of `a` not in `b` (set difference).
 * @example
 * except([1, 2, 3], [2]); // => [1, 3]
 */
export function except<T>(a: ReadonlySet<T>, b: Collection<T>): Set<T>;
export function except<T>(a: Collection<T>, b: Collection<T>): T[];
export function except<T>(a: Collection<T>, b: Collection<T>): T[] | Set<T> {
  if (isSet(a) && isSet(b)) {
    const fn = native(a).difference;
    if (fn) return fn.call(a, b);
  }
  const bs = toSet(b);
  return output(a, [...new Set(a)].filter((x) => !bs.has(x)));
}

/**
 * Items of `a` whose key does not occur in `b`, deduplicated by key.
 * @example
 * exceptBy([{ id: 1 }, { id: 2 }], [{ id: 2 }], (x) => x.id); // => [{ id: 1 }]
 */
export function exceptBy<T>(a: ReadonlySet<T>, b: Collection<T>, key: Key<T>): Set<T>;
export function exceptBy<T>(a: Collection<T>, b: Collection<T>, key: Key<T>): T[];
export function exceptBy<T>(a: Collection<T>, b: Collection<T>, key: Key<T>): T[] | Set<T> {
  const bk = keySet(b, key);
  return output(a, [...distinctByKey(a, key)].filter(([k]) => !bk.has(k)).map(([, v]) => v));
}

/**
 * Items in exactly one collection: `a`'s first, then `b`'s.
 * @example
 * symmetricDifference([1, 2], [2, 3]); // => [1, 3]
 */
export function symmetricDifference<T>(a: ReadonlySet<T>, b: Collection<T>): Set<T>;
export function symmetricDifference<T>(a: Collection<T>, b: Collection<T>): T[];
export function symmetricDifference<T>(a: Collection<T>, b: Collection<T>): T[] | Set<T> {
  if (isSet(a) && isSet(b)) {
    const fn = native(a).symmetricDifference;
    if (fn) return fn.call(a, b);
  }
  const as = toSet(a);
  const bs = toSet(b);
  return output(a, [...[...as].filter((x) => !bs.has(x)), ...[...bs].filter((x) => !as.has(x))]);
}

/**
 * Symmetric difference by key.
 * @example
 * symmetricDifferenceBy([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }], (x) => x.id); // => [{ id: 1 }, { id: 3 }]
 */
export function symmetricDifferenceBy<T>(a: ReadonlySet<T>, b: Collection<T>, key: Key<T>): Set<T>;
export function symmetricDifferenceBy<T>(a: Collection<T>, b: Collection<T>, key: Key<T>): T[];
export function symmetricDifferenceBy<T>(a: Collection<T>, b: Collection<T>, key: Key<T>): T[] | Set<T> {
  const am = distinctByKey(a, key);
  const bm = distinctByKey(b, key);
  const out: T[] = [];
  for (const [k, v] of am) if (!bm.has(k)) out.push(v);
  for (const [k, v] of bm) if (!am.has(k)) out.push(v);
  return output(a, out);
}

// ---------------------------------------------------------------------------
// Relations

/**
 * True when every item of `a` is in `b`.
 * @example
 * isSubset([1, 2], [1, 2, 3]); // => true
 */
export function isSubset<T>(a: Collection<T>, b: Collection<T>): boolean {
  const as = toSet(a);
  const bs = toSet(b);
  const fn = native(as).isSubsetOf;
  if (fn) return fn.call(as, bs);
  if (as.size > bs.size) return false;
  for (const x of as) if (!bs.has(x)) return false;
  return true;
}

/**
 * True when every key of `a` occurs in `b`.
 * @example
 * isSubsetBy([{ id: 1 }], [{ id: 1 }, { id: 2 }], (x) => x.id); // => true
 */
export function isSubsetBy<T>(a: Collection<T>, b: Collection<T>, key: Key<T>): boolean {
  const bk = keySet(b, key);
  for (const x of a) if (!bk.has(key(x))) return false;
  return true;
}

/**
 * True when every item of `b` is in `a`.
 * @example
 * isSuperset([1, 2, 3], [2]); // => true
 */
export function isSuperset<T>(a: Collection<T>, b: Collection<T>): boolean {
  return isSubset(b, a);
}

/**
 * True when every key of `b` occurs in `a`.
 * @example
 * isSupersetBy([{ id: 1 }, { id: 2 }], [{ id: 2 }], (x) => x.id); // => true
 */
export function isSupersetBy<T>(a: Collection<T>, b: Collection<T>, key: Key<T>): boolean {
  return isSubsetBy(b, a, key);
}

/**
 * True when the collections share no item.
 * @example
 * isDisjoint([1, 2], [3]); // => true
 */
export function isDisjoint<T>(a: Collection<T>, b: Collection<T>): boolean {
  const as = toSet(a);
  const bs = toSet(b);
  const fn = native(as).isDisjointFrom;
  if (fn) return fn.call(as, bs);
  const [small, big] = as.size <= bs.size ? [as, bs] : [bs, as];
  for (const x of small) if (big.has(x)) return false;
  return true;
}

/**
 * True when the collections share no key.
 * @example
 * isDisjointBy([{ id: 1 }], [{ id: 2 }], (x) => x.id); // => true
 */
export function isDisjointBy<T>(a: Collection<T>, b: Collection<T>, key: Key<T>): boolean {
  const bk = keySet(b, key);
  for (const x of a) if (bk.has(key(x))) return false;
  return true;
}

/**
 * True when both contain the same distinct items (order and duplicates ignored).
 * @example
 * setEquals([1, 2, 2], new Set([2, 1])); // => true
 */
export function setEquals<T>(a: Collection<T>, b: Collection<T>): boolean {
  const as = toSet(a);
  const bs = toSet(b);
  return as.size === bs.size && isSubset(as, bs);
}

/**
 * True when both contain the same distinct keys.
 * @example
 * setEqualsBy([{ id: 1 }], [{ id: 1 }, { id: 1 }], (x) => x.id); // => true
 */
export function setEqualsBy<T>(a: Collection<T>, b: Collection<T>, key: Key<T>): boolean {
  const ak = keySet(a, key);
  const bk = keySet(b, key);
  if (ak.size !== bk.size) return false;
  for (const k of ak) if (!bk.has(k)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Combinatorics

/** Default maximum number of tuples from `cartesianProduct`. */
export const MAX_CARTESIAN_SIZE = 1_000_000;
/** Default maximum distinct input size for `powerSet` (2^20 subsets). */
export const MAX_POWER_SET_ITEMS = 20;

export interface CartesianProductOptions {
  /** Maximum number of result tuples. Default `MAX_CARTESIAN_SIZE`. */
  readonly maxSize?: number;
}

/**
 * All tuples picking one item from each list, first list varying slowest.
 * Throws `HLP_SET_PRODUCT_TOO_LARGE` above `maxSize`.
 * @example
 * cartesianProduct([[1, 2], ['a', 'b']]); // => [[1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']]
 */
export function cartesianProduct<const T extends readonly unknown[]>(lists: { readonly [K in keyof T]: Iterable<T[K]> }, options: CartesianProductOptions = {}): { -readonly [K in keyof T]: T[K] }[] {
  const max = options.maxSize ?? MAX_CARTESIAN_SIZE;
  const arrays = (lists as readonly Iterable<unknown>[]).map((l) => [...l]);
  if (arrays.length === 0) return [];
  const size = arrays.reduce((n, a) => n * a.length, 1);
  if (size > max) throw new LimitError('HLP_SET_PRODUCT_TOO_LARGE', 'The cartesian product exceeds the size limit.', { details: { limit: max } });
  const out: unknown[][] = [];
  const idx: number[] = arrays.map(() => 0);
  for (let n = 0; n < size; n++) {
    out.push(arrays.map((a, i) => a[idx[i] ?? 0]));
    for (let i = arrays.length - 1; i >= 0; i--) {
      const next = (idx[i] ?? 0) + 1;
      if (next < (arrays[i]?.length ?? 0)) {
        idx[i] = next;
        break;
      }
      idx[i] = 0;
    }
  }
  return out as { -readonly [K in keyof T]: T[K] }[];
}

export interface PowerSetOptions {
  /** Maximum distinct input items. Default `MAX_POWER_SET_ITEMS`. */
  readonly maxItems?: number;
}

/**
 * Every subset of the distinct items, ordered by binary counting (`[]` first).
 * Throws `HLP_SET_POWERSET_TOO_LARGE` when the input has more than `maxItems` distinct items.
 * @example
 * powerSet(['a', 'b']); // => [[], ['a'], ['b'], ['a', 'b']]
 */
export function powerSet<T>(items: Collection<T>, options: PowerSetOptions = {}): T[][] {
  const max = Math.min(options.maxItems ?? MAX_POWER_SET_ITEMS, 30);
  const list = [...new Set(items)];
  if (list.length > max) throw new LimitError('HLP_SET_POWERSET_TOO_LARGE', 'The power set input exceeds the item limit.', { details: { limit: max } });
  const total = 2 ** list.length;
  const out: T[][] = [];
  for (let mask = 0; mask < total; mask++) out.push(list.filter((_, i) => (mask & (1 << i)) !== 0));
  return out;
}

// ---------------------------------------------------------------------------
// Multisets

/**
 * Occurrence count per item (SameValueZero), in first-occurrence order.
 * @example
 * countOccurrences(['a', 'b', 'a']); // => new Map([['a', 2], ['b', 1]])
 */
export function countOccurrences<T>(items: Collection<T>): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

function expand<T>(counts: Map<T, number>): T[] {
  const out: T[] = [];
  for (const [x, n] of counts) for (let i = 0; i < n; i++) out.push(x);
  return out;
}

/**
 * Multiset union: each item appears max(count in a, count in b) times, grouped in first-occurrence order.
 * @example
 * multisetUnion([1, 1, 2], [1, 2, 2]); // => [1, 1, 2, 2]
 */
export function multisetUnion<T>(a: Collection<T>, b: Collection<T>): T[] {
  const ca = countOccurrences(a);
  for (const [x, n] of countOccurrences(b)) ca.set(x, Math.max(ca.get(x) ?? 0, n));
  return expand(ca);
}

/**
 * Multiset intersection: each item appears min(count in a, count in b) times.
 * @example
 * multisetIntersect([1, 1, 2], [1, 3]); // => [1]
 */
export function multisetIntersect<T>(a: Collection<T>, b: Collection<T>): T[] {
  const cb = countOccurrences(b);
  const out = new Map<T, number>();
  for (const [x, n] of countOccurrences(a)) {
    const m = Math.min(n, cb.get(x) ?? 0);
    if (m > 0) out.set(x, m);
  }
  return expand(out);
}

/**
 * Multiset difference: each item appears max(0, count in a - count in b) times.
 * @example
 * multisetExcept([1, 1, 2], [1]); // => [1, 2]
 */
export function multisetExcept<T>(a: Collection<T>, b: Collection<T>): T[] {
  const cb = countOccurrences(b);
  const out = new Map<T, number>();
  for (const [x, n] of countOccurrences(a)) {
    const m = n - (cb.get(x) ?? 0);
    if (m > 0) out.set(x, m);
  }
  return expand(out);
}
