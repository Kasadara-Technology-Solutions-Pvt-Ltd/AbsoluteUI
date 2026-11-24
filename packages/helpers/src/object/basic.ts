/**
 * Shallow object transforms. All return new objects, read own enumerable string keys only,
 * and never write through the `__proto__` setter. Keys derived from values or callbacks are
 * checked with `assertSafeKey` (throws `HLP_UNSAFE_KEY`).
 */
import { ValidationError } from '../error/index.js';
import { isPlainObject } from '../is/index.js';
import { assertSafeKey, hasOwn } from '../internal/keys.js';
import { circular, put } from './internal.js';

/**
 * Keeps the listed own keys.
 * @example pick({ a: 1, b: 2 }, ['a']) // => { a: 1 }
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {};
  for (const k of keys) if (hasOwn(obj, k)) put(out, k, obj[k]);
  return out as Pick<T, K>;
}

/**
 * Drops the listed keys.
 * @example omit({ a: 1, b: 2 }, ['a']) // => { b: 2 }
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const drop = new Set<PropertyKey>(keys);
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (!drop.has(k)) put(out, k, v);
  return out as Omit<T, K>;
}

/**
 * Keeps entries whose value and key pass `predicate`.
 * @example pickBy({ a: 1, b: null }, (v) => v !== null) // => { a: 1 }
 */
export function pickBy<T extends object>(obj: T, predicate: (value: T[keyof T], key: keyof T & string) => boolean): Partial<T> {
  const out = {};
  for (const [k, v] of Object.entries(obj) as [keyof T & string, T[keyof T]][]) if (predicate(v, k)) put(out, k, v);
  return out;
}

/**
 * Drops entries whose value and key pass `predicate`.
 * @example omitBy({ a: 1, b: null }, (v) => v === null) // => { a: 1 }
 */
export function omitBy<T extends object>(obj: T, predicate: (value: T[keyof T], key: keyof T & string) => boolean): Partial<T> {
  return pickBy(obj, (v, k) => !predicate(v, k));
}

/**
 * Renames keys with `fn`. Later entries win on collisions.
 * @example mapKeys({ a: 1 }, (_, k) => k.toUpperCase()) // => { A: 1 }
 */
export function mapKeys<T extends object, K extends PropertyKey>(obj: T, fn: (value: T[keyof T], key: keyof T & string) => K): Record<K, T[keyof T]> {
  const out = {} as Record<K, T[keyof T]>;
  for (const [k, v] of Object.entries(obj) as [keyof T & string, T[keyof T]][]) {
    const nk = fn(v, k);
    assertSafeKey(nk);
    out[nk] = v;
  }
  return out;
}

/**
 * Transforms values, keeping keys.
 * @example mapValues({ a: 1 }, (v) => v * 2) // => { a: 2 }
 */
export function mapValues<T extends object, R>(obj: T, fn: (value: T[keyof T], key: keyof T & string) => R): Record<keyof T & string, R> {
  const out = {} as Record<keyof T & string, R>;
  for (const [k, v] of Object.entries(obj) as [keyof T & string, T[keyof T]][]) put(out, k, fn(v, k));
  return out;
}

/**
 * Transforms entries; return `[newKey, newValue]`.
 * @example mapEntries({ a: 1 }, ([k, v]) => [`${k}!`, v + 1]) // => { 'a!': 2 }
 */
export function mapEntries<T extends object, K extends PropertyKey, V>(obj: T, fn: (entry: [keyof T & string, T[keyof T]]) => readonly [K, V]): Record<K, V> {
  const out = {} as Record<K, V>;
  for (const entry of Object.entries(obj) as [keyof T & string, T[keyof T]][]) {
    const [k, v] = fn(entry);
    assertSafeKey(k);
    out[k] = v;
  }
  return out;
}

/**
 * Keeps entries whose key passes `predicate`.
 * @example filterKeys({ a: 1, _b: 2 }, (k) => !k.startsWith('_')) // => { a: 1 }
 */
export function filterKeys<T extends object>(obj: T, predicate: (key: keyof T & string) => boolean): Partial<T> {
  return pickBy(obj, (_, k) => predicate(k));
}

/**
 * Keeps entries whose value passes `predicate`.
 * @example filterValues({ a: 1, b: 0 }, Boolean) // => { a: 1 }
 */
export function filterValues<T extends object>(obj: T, predicate: (value: T[keyof T]) => boolean): Partial<T> {
  return pickBy(obj, (v) => predicate(v));
}

function keyText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  throw new ValidationError('HLP_OBJECT_INVALID_KEY', 'The value cannot be used as an object key.');
}

/**
 * Swaps keys and values (values must be strings, numbers, booleans or bigints). Later keys win.
 * @example invert({ a: 'x', b: 'y' }) // => { x: 'a', y: 'b' }
 */
export function invert(obj: Readonly<Record<string, string | number | boolean | bigint>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = keyText(v);
    assertSafeKey(nk);
    out[nk] = k;
  }
  return out;
}

/**
 * Groups keys by a value-derived key.
 * @example invertBy({ a: 1, b: 2, c: 1 }) // => { '1': ['a', 'c'], '2': ['b'] }
 */
export function invertBy<T extends object>(obj: T, fn: (value: T[keyof T]) => unknown = (v) => v): Record<string, (keyof T & string)[]> {
  const out: Record<string, (keyof T & string)[]> = {};
  for (const [k, v] of Object.entries(obj) as [keyof T & string, T[keyof T]][]) {
    const nk = keyText(fn(v));
    assertSafeKey(nk);
    (out[nk] ??= []).push(k);
  }
  return out;
}

/**
 * Renames keys by a mapping; unmapped keys are kept. Later entries win on collisions.
 * @example renameKeys({ first: 'A' }, { first: 'givenName' }) // => { givenName: 'A' }
 */
export function renameKeys(obj: object, mapping: Readonly<Record<string, string>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = hasOwn(mapping, k) ? mapping[k] ?? k : k;
    if (nk !== k) assertSafeKey(nk);
    put(out, nk, v);
  }
  return out;
}

export interface CompactObjectOptions {
  /** `'nullish'` (default) removes `null`/`undefined`; `'undefined'` only `undefined`; `'empty'` also `''`, `[]`, `{}`. */
  readonly remove?: 'nullish' | 'undefined' | 'empty';
  /** Recurse into plain objects and arrays (array elements are compacted, never removed). */
  readonly deep?: boolean;
}

/**
 * Removes nullish (or empty) values.
 * @example compactObject({ a: 1, b: null, c: undefined }) // => { a: 1 }
 */
export function compactObject<T extends object>(obj: T, options: CompactObjectOptions = {}): Partial<T> {
  const { remove = 'nullish', deep = false } = options;
  const stack = new Set<object>();
  const drop = (v: unknown): boolean => {
    if (v === undefined) return true;
    if (remove === 'undefined') return false;
    if (v === null) return true;
    if (remove !== 'empty') return false;
    if (v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    return isPlainObject(v) && Object.keys(v).length === 0;
  };
  const walk = (v: unknown): unknown => {
    if (!deep || (!Array.isArray(v) && !isPlainObject(v))) return v;
    if (stack.has(v)) circular();
    stack.add(v);
    let out: unknown;
    if (Array.isArray(v)) out = v.map(walk);
    else {
      const o = {};
      for (const [k, x] of Object.entries(v)) {
        const w = walk(x);
        if (!drop(w)) put(o, k, w);
      }
      out = o;
    }
    stack.delete(v);
    return out;
  };
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const w = walk(v);
    if (!drop(w)) put(out, k, w);
  }
  return out;
}

/**
 * Fills keys that are missing or `undefined` from the sources, in order.
 * @example defaults({ a: 1, b: undefined }, { b: 2, c: 3 }) // => { a: 1, b: 2, c: 3 }
 */
export function defaults<T extends object, S extends object>(obj: T, ...sources: readonly S[]): T & Partial<S> {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) put(out, k, v);
  for (const src of sources) {
    for (const [k, v] of Object.entries(src)) if (!hasOwn(out, k) || out[k] === undefined) put(out, k, v);
  }
  return out as T & Partial<S>;
}

/** `Object.keys` typed as the object's string keys. @example typedKeys({ a: 1 }) // => ['a'] */
export function typedKeys<T extends object>(obj: T): (keyof T & string)[] {
  return Object.keys(obj) as (keyof T & string)[];
}

/** `Object.values` typed. @example typedValues({ a: 1 }) // => [1] */
export function typedValues<T extends object>(obj: T): T[keyof T][] {
  return Object.values(obj) as T[keyof T][];
}

/** `Object.entries` typed. @example typedEntries({ a: 1 }) // => [['a', 1]] */
export function typedEntries<T extends object>(obj: T): [keyof T & string, T[keyof T]][] {
  return Object.entries(obj) as [keyof T & string, T[keyof T]][];
}

/**
 * `Object.fromEntries` typed (defines own data properties; never calls the `__proto__` setter).
 * @example typedFromEntries([['a', 1]] as const) // => { a: 1 }
 */
export function typedFromEntries<K extends PropertyKey, V>(entries: Iterable<readonly [K, V]>): Record<K, V> {
  return Object.fromEntries(entries) as Record<K, V>;
}

/**
 * One-level equality with `Object.is` for arrays and objects (own enumerable string keys).
 * @example isShallowEqual({ a: 1 }, { a: 1 }) // => true
 */
export function isShallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!hasOwn(b, k) || !Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

/**
 * Own property value, or `undefined` (never reads inherited properties).
 * @example getOwn({}, 'toString') // => undefined
 */
export function getOwn(obj: unknown, key: PropertyKey): unknown {
  if ((typeof obj !== 'object' && typeof obj !== 'function') || obj === null) return undefined;
  return hasOwn(obj, key) ? (obj as Record<PropertyKey, unknown>)[key] : undefined;
}

/**
 * Element count: length of arrays/strings, size of maps/sets, own enumerable keys of objects, 0 for nullish.
 * @example size({ a: 1, b: 2 }) // => 2
 */
export function size(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string' || Array.isArray(value)) return value.length;
  if (value instanceof Map || value instanceof Set) return value.size;
  if (typeof value === 'object') return Object.keys(value).length;
  return 0;
}

/**
 * Counts values by a derived key (defaults to the value itself).
 * @example countValuesBy({ a: 'x', b: 'y', c: 'x' }) // => { x: 2, y: 1 }
 */
export function countValuesBy<T extends object>(obj: T, fn: (value: T[keyof T]) => unknown = (v) => v): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of Object.values(obj) as T[keyof T][]) {
    const k = keyText(fn(v));
    assertSafeKey(k);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export interface SortKeysOptions {
  /** Sort nested plain objects (including those inside arrays). Default false. */
  readonly recursive?: boolean;
  /** Key comparator. Default: UTF-16 code unit order. */
  readonly compare?: (a: string, b: string) => number;
}

/**
 * Returns a copy with keys inserted in sorted order (for canonical output). Note that JavaScript
 * always enumerates integer-like keys first, in ascending numeric order.
 * @example Object.keys(sortKeys({ b: 1, a: 2 })) // => ['a', 'b']
 */
export function sortKeys<T extends object>(obj: T, options: SortKeysOptions = {}): T {
  const { recursive = false, compare } = options;
  const stack = new Set<object>();
  const sortObj = (o: object): Record<string, unknown> => {
    if (stack.has(o)) circular();
    stack.add(o);
    const keys = Object.keys(o);
    if (compare) keys.sort(compare);
    else keys.sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) put(out, k, recursive ? walk((o as Record<string, unknown>)[k]) : (o as Record<string, unknown>)[k]);
    stack.delete(o);
    return out;
  };
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      if (stack.has(v)) circular();
      stack.add(v);
      const out = v.map(walk);
      stack.delete(v);
      return out;
    }
    return isPlainObject(v) ? sortObj(v) : v;
  };
  return sortObj(obj) as T;
}

/**
 * Own enumerable string-keyed entries as a `Map`.
 * @example objectToMap({ a: 1 }).get('a') // => 1
 */
export function objectToMap<V>(obj: Readonly<Record<string, V>>): Map<string, V> {
  return new Map(Object.entries(obj));
}

/**
 * Converts a `Map` with string/number keys to a plain object. Throws `HLP_OBJECT_INVALID_KEY`
 * for other key types and `HLP_UNSAFE_KEY` for `__proto__`/`constructor`/`prototype`.
 * @example mapToObject(new Map([['a', 1]])) // => { a: 1 }
 */
export function mapToObject<V>(map: ReadonlyMap<unknown, V>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [k, v] of map) {
    if (typeof k !== 'string' && typeof k !== 'number') throw new ValidationError('HLP_OBJECT_INVALID_KEY', 'The value cannot be used as an object key.');
    const key = String(k);
    assertSafeKey(key);
    out[key] = v;
  }
  return out;
}
