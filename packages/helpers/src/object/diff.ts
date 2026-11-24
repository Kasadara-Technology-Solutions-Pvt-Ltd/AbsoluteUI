/**
 * Structural diff and immutable apply, plus flatten/unflatten.
 */
import { LimitError, ValidationError } from '../error/index.js';
import { isPlainObject } from '../is/index.js';
import { assertSafeKey, hasOwn } from '../internal/keys.js';
import { type AnyRecord, at, circular, copyContainer, isContainer, put } from './internal.js';
import { deepEqual } from './deep.js';
import type { PathSegment } from './path.js';

/** One change produced by `diff`. Paths are segment arrays; `[]` is the root. */
export type DiffChange =
  | { readonly op: 'add'; readonly path: readonly PathSegment[]; readonly value: unknown }
  | { readonly op: 'remove'; readonly path: readonly PathSegment[]; readonly from: unknown }
  | { readonly op: 'replace'; readonly path: readonly PathSegment[]; readonly from: unknown; readonly value: unknown };

/**
 * Lists the changes that turn `a` into `b`. Plain objects and arrays are compared recursively
 * (arrays by index: appended items are `add`s in ascending order, dropped tail items are `remove`s
 * in descending order); other values are compared with `deepEqual` and reported as `replace`.
 * @example diff({ a: 1 }, { a: 2, b: 3 }) // => [{ op: 'replace', path: ['a'], from: 1, value: 2 }, { op: 'add', path: ['b'], value: 3 }]
 */
export function diff(a: unknown, b: unknown): DiffChange[] {
  const out: DiffChange[] = [];
  const stack = new Set<object>();
  const walk = (x: unknown, y: unknown, path: PathSegment[]): void => {
    if (Array.isArray(x) && Array.isArray(y)) {
      if (stack.has(x)) circular();
      stack.add(x);
      const common = Math.min(x.length, y.length);
      for (let i = 0; i < common; i++) walk(x[i], y[i], [...path, i]);
      for (let i = common; i < y.length; i++) out.push({ op: 'add', path: [...path, i], value: y[i] });
      for (let i = x.length - 1; i >= common; i--) out.push({ op: 'remove', path: [...path, i], from: x[i] });
      stack.delete(x);
      return;
    }
    if (isPlainObject(x) && isPlainObject(y)) {
      if (stack.has(x)) circular();
      stack.add(x);
      for (const k of Object.keys(x)) {
        if (hasOwn(y, k)) walk(x[k], y[k], [...path, k]);
        else out.push({ op: 'remove', path: [...path, k], from: x[k] });
      }
      for (const k of Object.keys(y)) if (!hasOwn(x, k)) out.push({ op: 'add', path: [...path, k], value: y[k] });
      stack.delete(x);
      return;
    }
    if (!deepEqual(x, y)) out.push({ op: 'replace', path, from: x, value: y });
  };
  walk(a, b, []);
  return out;
}

const notFound = (): never => {
  throw new ValidationError('HLP_OBJECT_PATH_NOT_FOUND', 'A change refers to a path that does not exist.');
};

/**
 * Applies `diff` changes and returns a new value; the input is never mutated and only
 * containers on changed paths are copied. `add` inserts into arrays (index <= length);
 * `remove` splices arrays. Throws `HLP_OBJECT_PATH_NOT_FOUND` for missing paths and
 * `HLP_UNSAFE_KEY` for unsafe segments.
 * @example applyDiff({ a: 1 }, diff({ a: 1 }, { a: 2 })) // => { a: 2 }
 */
export function applyDiff<T>(obj: T, changes: readonly DiffChange[]): T {
  const copied = new WeakSet<object>();
  const own = (v: unknown): Record<string, unknown> | unknown[] => {
    if (!isContainer(v)) return notFound();
    if (copied.has(v)) return v;
    const c = copyContainer(v);
    copied.add(c);
    return c;
  };
  let root: unknown = obj;
  for (const change of changes) {
    const path = change.path as readonly unknown[];
    if (!Array.isArray(path)) throw new ValidationError('HLP_OBJECT_DIFF_INVALID', 'A change is not valid.');
    for (const seg of path) {
      if (typeof seg !== 'string' && (typeof seg !== 'number' || !Number.isSafeInteger(seg) || seg < 0)) throw new ValidationError('HLP_OBJECT_DIFF_INVALID', 'A change is not valid.');
      assertSafeKey(seg);
    }
    const segs = path as readonly PathSegment[];
    if (segs.length === 0) {
      root = change.op === 'remove' ? undefined : change.value;
      continue;
    }
    root = own(root);
    let parent = root as AnyRecord;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = at(segs, i);
      if (!hasOwn(parent, seg)) notFound();
      const child = own(parent[seg]);
      parent[seg] = child;
      parent = child as AnyRecord;
    }
    const last = at(segs, segs.length - 1);
    const isArr = Array.isArray(parent) && typeof last === 'number';
    const arr = parent as unknown as unknown[];
    switch (change.op) {
      case 'add':
        if (isArr) {
          if ((last) > arr.length) notFound();
          arr.splice(last, 0, change.value);
        } else parent[last] = change.value;
        break;
      case 'remove':
        if (!hasOwn(parent, last)) notFound();
        if (isArr) arr.splice(last, 1);
        else Reflect.deleteProperty(parent, last);
        break;
      case 'replace':
        if (!hasOwn(parent, last)) notFound();
        parent[last] = change.value;
        break;
      default:
        throw new ValidationError('HLP_OBJECT_DIFF_INVALID', 'A change is not valid.');
    }
  }
  return root as T;
}

// ---------------------------------------------------------------------------
// Flatten

export interface FlattenOptions {
  /** Key separator. Default `'.'`. */
  readonly separator?: string;
  /** Flatten arrays with index keys (`a.0`). Default true; false keeps arrays as values. */
  readonly arrays?: boolean;
}

/**
 * Flattens nested plain objects (and arrays) to one level with joined keys.
 * Empty objects and arrays are kept as values so `unflattenObject` restores them.
 * @example flattenObject({ a: { b: 1, c: [2] } }) // => { 'a.b': 1, 'a.c.0': 2 }
 */
export function flattenObject(obj: object, options: FlattenOptions = {}): Record<string, unknown> {
  const { separator = '.', arrays = true } = options;
  const out: Record<string, unknown> = {};
  const stack = new Set<object>();
  const walk = (v: unknown, prefix: string | undefined): void => {
    const nest = isPlainObject(v) || (arrays && Array.isArray(v));
    if (!nest || (prefix !== undefined && Object.keys(v).length === 0)) {
      if (prefix !== undefined) put(out, prefix, nest ? (Array.isArray(v) ? [] : {}) : v);
      return;
    }
    if (stack.has(v)) circular();
    stack.add(v);
    for (const k of Object.keys(v)) walk((v as Record<string, unknown>)[k], prefix === undefined ? k : `${prefix}${separator}${k}`);
    stack.delete(v);
  };
  walk(obj, undefined);
  return out;
}

export interface UnflattenOptions {
  /** Key separator. Default `'.'`. */
  readonly separator?: string;
  /** Canonical digit segments create arrays. Default true. */
  readonly arrays?: boolean;
  /** Largest array index accepted (larger throws `HLP_OBJECT_ARRAY_INDEX_LIMIT`). Default 10000. */
  readonly maxArrayIndex?: number;
}

const DIGITS = /^(?:0|[1-9]\d{0,14})$/;

/**
 * Rebuilds nested objects from joined keys. Every segment is checked with `assertSafeKey`,
 * so `{ '__proto__.x': 1 }` throws `HLP_UNSAFE_KEY`. Later keys win on conflicts.
 * @example unflattenObject({ 'a.b': 1, 'a.c.0': 2 }) // => { a: { b: 1, c: [2] } }
 */
export function unflattenObject(flat: Readonly<Record<string, unknown>>, options: UnflattenOptions = {}): Record<string, unknown> {
  const { separator = '.', arrays = true, maxArrayIndex = 10_000 } = options;
  if (separator === '') throw new ValidationError('HLP_OBJECT_INVALID_SEPARATOR', 'The separator must not be empty.');
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const segs: PathSegment[] = key.split(separator).map((s) => {
      assertSafeKey(s);
      if (!arrays || !DIGITS.test(s)) return s;
      const n = Number(s);
      if (n > maxArrayIndex) throw new LimitError('HLP_OBJECT_ARRAY_INDEX_LIMIT', 'An array index exceeds the limit.');
      return n;
    });
    let parent: AnyRecord = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = at(segs, i);
      const next = at(segs, i + 1);
      let child = hasOwn(parent, seg) ? parent[seg] : undefined;
      if (Array.isArray(child) && typeof next === 'string') child = Object.assign({}, child);
      else if (!isContainer(child)) child = typeof next === 'number' ? [] : {};
      parent[seg] = child;
      parent = child as AnyRecord;
    }
    parent[at(segs, segs.length - 1)] = value;
  }
  return root;
}
