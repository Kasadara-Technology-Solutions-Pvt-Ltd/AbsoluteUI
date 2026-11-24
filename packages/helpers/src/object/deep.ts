/**
 * Deep path access, merge, clone, freeze and equality.
 * Reads follow own properties only; writes reject unsafe keys on every segment.
 */
import { ValidationError } from '../error/index.js';
import { isArray, isPlainObject } from '../is/index.js';
import { assertSafeKey, hasOwn, isUnsafeKey } from '../internal/keys.js';
import { type AnyRecord, MISSING, at, circular, copyContainer, copyPlain, isContainer, ownEnumerableKeys, ownValue, put } from './internal.js';
import { type Path, type PathSegment, parsePath } from './path.js';

// ---------------------------------------------------------------------------
// Paths

/**
 * Reads a nested own property. Returns `fallback` when the path is missing or resolves to `undefined`.
 * Never traverses into prototypes (`deepGet({}, 'constructor')` is `fallback`).
 * @example deepGet({ a: [{ b: 1 }] }, 'a[0].b') // => 1
 */
export function deepGet(obj: unknown, path: Path, fallback?: unknown): unknown {
  let cur = obj;
  for (const seg of parsePath(path)) {
    cur = ownValue(cur, seg);
    if (cur === MISSING) return fallback;
  }
  return cur === undefined ? fallback : cur;
}

/**
 * True when every segment of the path is an own property.
 * @example deepHas({ a: { b: undefined } }, 'a.b') // => true
 */
export function deepHas(obj: unknown, path: Path): boolean {
  let cur = obj;
  for (const seg of parsePath(path)) {
    cur = ownValue(cur, seg);
    if (cur === MISSING) return false;
  }
  return true;
}

function safeSegments(path: Path): PathSegment[] {
  const segs = parsePath(path);
  for (const s of segs) assertSafeKey(s);
  return segs;
}

const blocked = (): never => {
  throw new ValidationError('HLP_OBJECT_PATH_BLOCKED', 'Cannot write a path through a non-plain object.');
};

function containerFor(cur: unknown, seg: PathSegment): Record<string, unknown> | unknown[] {
  if (isContainer(cur)) return copyContainer(cur);
  if (typeof cur === 'object' && cur !== null) return blocked();
  if (typeof cur === 'function') return blocked();
  return typeof seg === 'number' ? [] : {};
}

/**
 * Returns a copy with the value set at `path`, copying only the containers along the path.
 * Missing or primitive intermediates become `[]` (numeric next segment) or `{}`.
 * Throws `HLP_UNSAFE_KEY` for `__proto__`/`constructor`/`prototype` segments and
 * `HLP_OBJECT_PATH_BLOCKED` when the path crosses a non-plain object (Date, Map, class instance).
 * @example deepSet({}, 'a.list[1]', 'x') // => { a: { list: [undefined, 'x'] } } // index 0 is a hole
 */
export function deepSet<T>(obj: T, path: Path, value: unknown): T {
  const segs = safeSegments(path);
  if (segs.length === 0) return value as T;
  const setAt = (cur: unknown, i: number): unknown => {
    const seg = at(segs, i);
    const container = containerFor(cur, seg) as AnyRecord;
    const child = ownValue(cur, seg);
    container[seg] = i === segs.length - 1 ? value : setAt(child === MISSING ? undefined : child, i + 1);
    return container;
  };
  return setAt(obj, 0) as T;
}

/**
 * Sets the value at `path`, mutating `obj` and creating missing containers. Returns `obj`.
 * @example
 * const o = {};
 * deepSetInPlace(o, 'a.b', 1);
 * o; // => { a: { b: 1 } }
 */
export function deepSetInPlace<T extends object>(obj: T, path: Path, value: unknown): T {
  const segs = safeSegments(path);
  if (segs.length === 0) throw new ValidationError('HLP_OBJECT_INVALID_PATH', 'The property path is not valid.');
  let cur = obj as AnyRecord;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = at(segs, i);
    const next = ownValue(cur, seg);
    if ((typeof next === 'object' && next !== null) || typeof next === 'function') cur = next as AnyRecord;
    else {
      const created: AnyRecord = typeof segs[i + 1] === 'number' ? ([] as unknown as AnyRecord) : {};
      cur[seg] = created;
      cur = created;
    }
  }
  cur[at(segs, segs.length - 1)] = value;
  return obj;
}

/**
 * Returns a copy without the property at `path` (array elements are spliced out).
 * Returns `obj` itself when the path does not exist.
 * @example deepUnset({ a: { b: 1, c: 2 } }, 'a.b') // => { a: { c: 2 } }
 */
export function deepUnset<T>(obj: T, path: Path): T {
  const segs = parsePath(path);
  if (segs.length === 0) throw new ValidationError('HLP_OBJECT_INVALID_PATH', 'The property path is not valid.');
  if (!deepHas(obj, segs)) return obj;
  const unsetAt = (cur: unknown, i: number): unknown => {
    const seg = at(segs, i);
    const container = containerFor(cur, seg);
    if (i === segs.length - 1) {
      if (Array.isArray(container) && typeof seg === 'number') container.splice(seg, 1);
      else Reflect.deleteProperty(container, seg);
    } else put(container, seg, unsetAt(ownValue(cur, seg), i + 1));
    return container;
  };
  return unsetAt(obj, 0) as T;
}

// ---------------------------------------------------------------------------
// Merge

export interface DeepMergeOptions {
  /** How arrays combine. Default `'replace'`. `'union'` appends source items not already present (SameValueZero). */
  readonly arrays?: 'replace' | 'concat' | 'merge-by-index' | 'union';
  /** `'skip'` (default) ignores `undefined` source values; `'overwrite'` writes them. */
  readonly undefinedValues?: 'skip' | 'overwrite';
  /** `'error'` (default) throws `HLP_UNSAFE_KEY` on `__proto__`/`constructor`/`prototype` source keys; `'skip'` drops them. */
  readonly unsafeKeys?: 'error' | 'skip';
}

function merger(options: DeepMergeOptions): (a: unknown, b: unknown) => unknown {
  const { arrays = 'replace', undefinedValues = 'skip', unsafeKeys = 'error' } = options;
  const skipUndef = undefinedValues === 'skip';
  const stack = new Set<object>();
  const enter = (b: object): void => {
    if (stack.has(b)) circular();
    stack.add(b);
  };
  // Fresh copy of source structure (plain objects and arrays), validating keys.
  const fresh = (b: unknown): unknown => merge(undefined, b);
  const merge = (a: unknown, b: unknown): unknown => {
    if (isPlainObject(b)) {
      enter(b);
      const out = isPlainObject(a) ? copyPlain(a) : {};
      for (const k of Object.keys(b)) {
        if (isUnsafeKey(k)) {
          if (unsafeKeys === 'skip') continue;
          assertSafeKey(k);
        }
        const bv = b[k];
        if (bv === undefined && skipUndef) continue;
        out[k] = hasOwn(out, k) ? merge(out[k], bv) : fresh(bv);
      }
      stack.delete(b);
      return out;
    }
    if (isArray(b)) {
      enter(b);
      let out: unknown[];
      if (!isArray(a) || arrays === 'replace') out = b.map(fresh);
      else if (arrays === 'concat') out = [...a, ...b.map(fresh)];
      else if (arrays === 'union') {
        out = [...a];
        const present = new Set<unknown>(a);
        for (const x of b) {
          if (present.has(x)) continue;
          present.add(x);
          out.push(fresh(x));
        }
      } else {
        out = a.slice();
        for (let i = 0; i < b.length; i++) {
          const bv = b[i];
          if (bv === undefined && skipUndef && i < a.length) continue;
          out[i] = i < a.length ? merge(a[i], bv) : fresh(bv);
        }
      }
      stack.delete(b);
      return out;
    }
    return b;
  };
  return merge;
}

/**
 * Deep-merges plain objects into a new object. Only plain objects merge; other values
 * (class instances, dates, maps) replace. Prototypes are never merged or modified.
 * @example deepMerge({ a: { x: 1 } }, { a: { y: 2 } }) // => { a: { x: 1, y: 2 } }
 */
export function deepMerge<A extends object, B extends object>(target: A, source: B, options: DeepMergeOptions = {}): A & B {
  return merger(options)(target, source) as A & B;
}

/**
 * Deep-merges several objects left to right into a new object.
 * @example deepMergeAll([{ a: 1 }, { b: 2 }, { a: 3 }]) // => { a: 3, b: 2 }
 */
export function deepMergeAll(objects: readonly object[], options: DeepMergeOptions = {}): Record<string, unknown> {
  const merge = merger(options);
  let acc: unknown = {};
  for (const o of objects) acc = merge(acc, o);
  return acc as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Clone

type TypedArray = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array | BigInt64Array | BigUint64Array;

export interface DeepCloneOptions {
  /**
   * `'auto'` (default) uses `structuredClone` when available and falls back to a manual clone
   * for values it cannot clone (functions, symbols). Like the platform, class instances then become
   * plain objects. `'manual'` always uses the manual clone, which keeps prototypes and symbol keys.
   */
  readonly strategy?: 'auto' | 'manual';
}

function manualClone(value: unknown, seen: Map<object, unknown>): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const hit = seen.get(value);
  if (hit !== undefined) return hit;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) {
    const r = new RegExp(value.source, value.flags);
    r.lastIndex = value.lastIndex;
    return r;
  }
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (value instanceof DataView) return new DataView(value.buffer.slice(0), value.byteOffset, value.byteLength);
  if (ArrayBuffer.isView(value)) return (value as TypedArray).slice();
  if (value instanceof Map) {
    const m = new Map<unknown, unknown>();
    seen.set(value, m);
    for (const [k, v] of value as Map<unknown, unknown>) m.set(manualClone(k, seen), manualClone(v, seen));
    return m;
  }
  if (value instanceof Set) {
    const s = new Set<unknown>();
    seen.set(value, s);
    for (const v of value as Set<unknown>) s.add(manualClone(v, seen));
    return s;
  }
  if (value instanceof Number || value instanceof String || value instanceof Boolean) return Object(value.valueOf()) as object;
  if (Array.isArray(value)) {
    const arr: unknown[] = new Array<unknown>(value.length);
    seen.set(value, arr);
    for (let i = 0; i < value.length; i++) if (i in value) arr[i] = manualClone(value[i], seen);
    return arr;
  }
  const out = Object.create(Object.getPrototypeOf(value) as object | null) as object;
  seen.set(value, out);
  if (value instanceof Error) {
    put(out, 'message', value.message);
    if (value.stack !== undefined) Object.defineProperty(out, 'stack', { value: value.stack, writable: true, configurable: true });
  }
  for (const k of ownEnumerableKeys(value)) put(out, k, manualClone((value as AnyRecord)[k], seen));
  return out;
}

/**
 * Deep copy supporting Date, RegExp, Map, Set, ArrayBuffer, typed arrays, DataView and cycles.
 * Functions are copied by reference.
 * @example const b = deepClone({ d: new Date(0), s: new Set([1]) });
 */
export function deepClone<T>(value: T, options: DeepCloneOptions = {}): T {
  if (typeof value !== 'object' || value === null) return value;
  if ((options.strategy ?? 'auto') === 'auto' && typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Not cloneable by the platform (functions, symbols, ...): fall back to the manual clone.
    }
  }
  return manualClone(value, new Map()) as T;
}

// ---------------------------------------------------------------------------
// Freeze

/** Recursively readonly view of `T`. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyMap<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlySet<infer U>
      ? ReadonlySet<DeepReadonly<U>>
      : T extends object
        ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
        : T;

/**
 * Freezes `value` and everything reachable through own properties, map/set entries (cycle-safe).
 * Typed arrays cannot be frozen and are left as is. Mutates (freezes) the input and returns it.
 * @example
 * const cfg = deepFreeze({ a: { b: 1 } });
 * Object.isFrozen(cfg.a); // => true // assigning cfg.a.b throws in strict mode
 */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): void => {
    if ((typeof v !== 'object' && typeof v !== 'function') || v === null || seen.has(v)) return;
    seen.add(v);
    if (ArrayBuffer.isView(v)) return;
    if (v instanceof Map) for (const [k, x] of v as Map<unknown, unknown>) {
      walk(k);
      walk(x);
    }
    else if (v instanceof Set) for (const x of v as Set<unknown>) walk(x);
    Object.freeze(v);
    for (const k of Reflect.ownKeys(v)) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (d && 'value' in d) walk(d.value);
    }
  };
  walk(value);
  return value as DeepReadonly<T>;
}

// ---------------------------------------------------------------------------
// Equality

export interface DeepEqualOptions {
  /** Treat `+0` and `-0` as different (`Object.is`). Default false. `NaN` always equals `NaN`. */
  readonly distinguishZero?: boolean;
}

/**
 * Structural equality: key-order independent; handles NaN, Date, RegExp, Map, Set,
 * ArrayBuffer, typed arrays, DataView, boxed primitives, errors and cycles.
 * Objects must share a prototype.
 * @example deepEqual({ a: [1, { b: NaN }] }, { a: [1, { b: NaN }] }) // => true
 */
export function deepEqual(a: unknown, b: unknown, options: DeepEqualOptions = {}): boolean {
  const zero = options.distinguishZero ?? false;
  const active = new Map<object, Set<object>>();
  const num = (x: number, y: number): boolean => (x === y ? !zero || Object.is(x, y) : Number.isNaN(x) && Number.isNaN(y));
  const bytes = (x: ArrayBufferView, y: ArrayBufferView): boolean => {
    if (x.byteLength !== y.byteLength) return false;
    const ux = new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    const uy = new Uint8Array(y.buffer, y.byteOffset, y.byteLength);
    for (let i = 0; i < ux.length; i++) if (ux[i] !== uy[i]) return false;
    return true;
  };
  const eq = (x: unknown, y: unknown): boolean => {
    if (typeof x === 'number' && typeof y === 'number') return num(x, y);
    if (x === y) return true;
    if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) return false;
    if (Object.getPrototypeOf(x) !== Object.getPrototypeOf(y)) return false;
    let pairs = active.get(x);
    if (pairs?.has(y)) return true;
    if (!pairs) {
      pairs = new Set();
      active.set(x, pairs);
    }
    pairs.add(y);
    const result = compare(x, y);
    pairs.delete(y);
    return result;
  };
  const findMatch = (x: unknown, pool: readonly unknown[], used: Set<number>, test: (i: number) => boolean): boolean => {
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i) || !eq(x, pool[i]) || !test(i)) continue;
      used.add(i);
      return true;
    }
    return false;
  };
  const compare = (x: object, y: object): boolean => {
    if (x instanceof Date) return num(x.getTime(), (y as Date).getTime());
    if (x instanceof RegExp) return x.source === (y as RegExp).source && x.flags === (y as RegExp).flags;
    if (x instanceof Number || x instanceof String || x instanceof Boolean) return eq(x.valueOf(), (y as typeof x).valueOf());
    if (x instanceof ArrayBuffer) return bytes(new Uint8Array(x), new Uint8Array(y as ArrayBuffer));
    if (x instanceof DataView) return bytes(x, y as DataView);
    if (ArrayBuffer.isView(x)) {
      const tx = x as TypedArray;
      const ty = y as TypedArray;
      if (tx.length !== ty.length) return false;
      for (let i = 0; i < tx.length; i++) {
        const ex = tx[i];
        const ey = ty[i];
        if (typeof ex === 'number' && typeof ey === 'number' ? !num(ex, ey) : ex !== ey) return false;
      }
      return true;
    }
    if (Array.isArray(x)) {
      const ya = y as unknown[];
      if (x.length !== ya.length) return false;
      for (let i = 0; i < x.length; i++) if (!eq(x[i], ya[i])) return false;
      return true;
    }
    if (x instanceof Map) {
      const ym = y as Map<unknown, unknown>;
      if (x.size !== ym.size) return false;
      let pending: [unknown, unknown][] | undefined;
      for (const [k, v] of x as Map<unknown, unknown>) {
        if (ym.has(k) && (typeof k !== 'object' || k === null)) {
          if (!eq(v, ym.get(k))) return false;
        } else if (typeof k === 'object' && k !== null) (pending ??= []).push([k, v]);
        else return false;
      }
      if (pending) {
        const pool = [...ym].filter(([k]) => typeof k === 'object' && k !== null);
        const keys = pool.map(([k]) => k);
        const used = new Set<number>();
        for (const [k, v] of pending) if (!findMatch(k, keys, used, (i) => eq(v, pool[i]?.[1]))) return false;
      }
      return true;
    }
    if (x instanceof Set) {
      const ys = y as Set<unknown>;
      if (x.size !== ys.size) return false;
      const pending: unknown[] = [];
      for (const v of x as Set<unknown>) {
        if (ys.has(v)) continue;
        if (typeof v !== 'object' || v === null) return false;
        pending.push(v);
      }
      if (pending.length) {
        const pool = [...ys].filter((v) => typeof v === 'object' && v !== null && !(x as Set<unknown>).has(v));
        const used = new Set<number>();
        for (const v of pending) if (!findMatch(v, pool, used, () => true)) return false;
      }
      return true;
    }
    if (x instanceof Error && (x.name !== (y as Error).name || x.message !== (y as Error).message)) return false;
    const kx = ownEnumerableKeys(x);
    const ky = ownEnumerableKeys(y);
    if (kx.length !== ky.length) return false;
    for (const k of kx) if (!Object.prototype.propertyIsEnumerable.call(y, k) || !eq((x as AnyRecord)[k], (y as AnyRecord)[k])) return false;
    return true;
  };
  return eq(a, b);
}
