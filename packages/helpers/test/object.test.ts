import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applyDiff, compactObject, countValuesBy, deepClone, deepEqual, deepFreeze, deepGet, deepHas, deepMerge, deepMergeAll, deepSet, deepSetInPlace,
  deepUnset, defaults, diff, filterKeys, filterValues, flattenObject, formatPath, getOwn, invert, invertBy, isShallowEqual, mapEntries, mapKeys,
  mapToObject, mapValues, objectToMap, omit, omitBy, parsePath, pick, pickBy, renameKeys, size, sortKeys, typedEntries, typedFromEntries, typedKeys,
  typedValues, unflattenObject,
} from '@absoluteui/helpers/object';
import { HelperError } from '@absoluteui/helpers/error';

const polluted = (): boolean => ({} as Record<string, unknown>).polluted !== undefined || (Object.prototype as unknown as Record<string, unknown>).polluted !== undefined;
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof HelperError ? e.code : 'non-helper-error';
  }
  return undefined;
};

/** JSON-like values without keys that would be ambiguous for flatten (digit keys, separators). */
// Unsafe keys are rejected by design (tested separately); fast-check generates `__proto__` as a key now and then.
const safeKey = fc.string().filter((k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype');
const jsonValue = fc.letrec((tie) => ({
  value: fc.oneof({ depthSize: 'small' }, fc.constant(null), fc.boolean(), fc.integer(), fc.string(), fc.array(tie('value'), { maxLength: 4 }), fc.dictionary(safeKey, tie('value'), { maxKeys: 4 })),
})).value;

describe('object: paths', () => {
  it('parses dotted, bracketed and quoted paths', () => {
    expect(parsePath('a.b[0].c')).toEqual(['a', 'b', 0, 'c']);
    expect(parsePath('a.0.b')).toEqual(['a', 0, 'b']);
    expect(parsePath('["x.y"][\'q\\\'z\']')).toEqual(['x.y', "q'z"]);
    expect(parsePath('')).toEqual([]);
    expect(parsePath(['a', 1])).toEqual(['a', 1]);
    expect(parsePath('a.01')).toEqual(['a', '01']);
    for (const bad of ['a..b', '.a', 'a.', 'a[', 'a[x]', 'a[01]', 'a]b', 'a.[0]', 'a[0]b', '["x]']) expect(code(() => parsePath(bad)), bad).toBe('HLP_OBJECT_INVALID_PATH');
    expect(code(() => parsePath([-1]))).toBe('HLP_OBJECT_INVALID_PATH');
    expect(code(() => parsePath('a'.repeat(5000)))).toBe('HLP_OBJECT_PATH_TOO_LONG');
  });
  it('formatPath round-trips through parsePath', () => {
    fc.assert(fc.property(fc.array(fc.oneof(fc.string(), fc.nat())), (segs) => {
      expect(parsePath(formatPath(segs))).toEqual(segs);
    }));
  });
  it('parses pathological input in linear time', () => {
    const t = performance.now();
    for (const p of ['['.repeat(4000), '["' + '\\'.repeat(4000), 'a.'.repeat(2000), '[0]'.repeat(1300)]) code(() => parsePath(p));
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe('object: deep get/set/has/unset', () => {
  it('reads own properties only', () => {
    const o = { a: [{ b: 1 }], n: null, u: undefined };
    expect(deepGet(o, 'a[0].b')).toBe(1);
    expect(deepGet(o, 'a.0.b')).toBe(1);
    expect(deepGet(o, 'a[1].b', 'fb')).toBe('fb');
    expect(deepGet(o, 'u', 'fb')).toBe('fb');
    expect(deepGet(o, 'n')).toBeNull();
    expect(deepGet({}, 'constructor')).toBeUndefined();
    expect(deepGet({}, '__proto__.toString')).toBeUndefined();
    expect(deepGet('abc', 'length')).toBeUndefined();
    expect(deepHas(o, 'u')).toBe(true);
    expect(deepHas(o, 'a[0].c')).toBe(false);
    expect(deepHas({}, 'toString')).toBe(false);
  });
  it('sets immutably, copying only the path', () => {
    const src = { a: { b: 1 }, other: { x: 1 } };
    const out = deepSet(src, 'a.c', 2);
    expect(out).toEqual({ a: { b: 1, c: 2 }, other: { x: 1 } });
    expect(src).toEqual({ a: { b: 1 }, other: { x: 1 } });
    expect(out.other).toBe(src.other);
    expect(deepSet({}, 'list[1].x', 'v')).toEqual({ list: [undefined, { x: 'v' }] });
    expect(Array.isArray((deepSet({}, 'a.0', 1) as { a: unknown }).a)).toBe(true);
    expect(deepSet({ a: 5 }, 'a.b', 1)).toEqual({ a: { b: 1 } });
    expect(deepSet(1, [], 'root')).toBe('root');
    expect(code(() => deepSet({ d: new Date() }, 'd.x', 1))).toBe('HLP_OBJECT_PATH_BLOCKED');
    const nullProto = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1 });
    expect(Object.getPrototypeOf(deepSet(nullProto, 'b', 2))).toBeNull();
  });
  it('sets in place and unsets', () => {
    const o: Record<string, unknown> = {};
    expect(deepSetInPlace(o, 'a.b[0]', 1)).toBe(o);
    expect(o).toEqual({ a: { b: [1] } });
    const src = { a: { b: 1, c: 2 }, l: [1, 2, 3] };
    expect(deepUnset(src, 'a.b')).toEqual({ a: { c: 2 }, l: [1, 2, 3] });
    expect(deepUnset(src, 'l[1]')).toEqual({ a: { b: 1, c: 2 }, l: [1, 3] });
    expect(deepUnset(src, 'x.y')).toBe(src);
    expect(src.a).toEqual({ b: 1, c: 2 });
  });
  it('rejects prototype pollution on every write path', () => {
    for (const p of ['__proto__.polluted', 'a.__proto__.polluted', 'constructor.prototype.polluted', ['__proto__', 'polluted'], 'a["__proto__"].polluted', 'prototype']) {
      expect(code(() => deepSet({}, p, 1))).toBe('HLP_UNSAFE_KEY');
      expect(code(() => deepSetInPlace({}, p, 1))).toBe('HLP_UNSAFE_KEY');
    }
    expect(polluted()).toBe(false);
  });
});

describe('object: merge', () => {
  it('merges plain objects into a new object', () => {
    const a = { x: { y: 1, arr: [1, 2] }, keep: true };
    const b = { x: { z: 2, arr: [3] }, u: undefined };
    const m = deepMerge(a, b);
    expect(m).toEqual({ x: { y: 1, z: 2, arr: [3] }, keep: true });
    expect(a.x).toEqual({ y: 1, arr: [1, 2] });
    expect(deepMerge(a, b, { undefinedValues: 'overwrite' })).toHaveProperty('u', undefined);
    expect(deepMerge({ l: [1, 2] }, { l: [2, 3] }, { arrays: 'concat' }).l).toEqual([1, 2, 2, 3]);
    expect(deepMerge({ l: [1, 2] }, { l: [2, 3] }, { arrays: 'union' }).l).toEqual([1, 2, 3]);
    expect(deepMerge({ l: [{ a: 1 }, 5] }, { l: [{ b: 2 }] }, { arrays: 'merge-by-index' }).l).toEqual([{ a: 1, b: 2 }, 5]);
    const d = new Date(0);
    expect(deepMerge({ d: { x: 1 } }, { d }).d).toBe(d);
    expect(deepMergeAll([{ a: 1 }, { b: 2 }, { a: 3 }])).toEqual({ a: 3, b: 2 });
  });
  it('copies source structure rather than aliasing it', () => {
    const src = { n: { deep: [1] } };
    const m = deepMerge({}, src);
    expect(m.n).not.toBe(src.n);
    expect(m.n.deep).not.toBe(src.n.deep);
  });
  it('rejects or skips unsafe keys, including nested JSON payloads', () => {
    const payload = JSON.parse('{"a":{"__proto__":{"polluted":1}},"__proto__":{"polluted":2}}') as object;
    expect(code(() => deepMerge({}, payload))).toBe('HLP_UNSAFE_KEY');
    expect(code(() => deepMerge({}, JSON.parse('{"constructor":{"prototype":{"polluted":1}}}') as object))).toBe('HLP_UNSAFE_KEY');
    const m = deepMerge({}, payload, { unsafeKeys: 'skip' });
    expect(Object.keys(m)).toEqual(['a']);
    expect(Object.getPrototypeOf((m as { a: object }).a)).toBe(Object.prototype);
    expect(polluted()).toBe(false);
  });
  it('detects cycles in sources', () => {
    const c: Record<string, unknown> = {};
    c.self = c;
    expect(code(() => deepMerge({}, c))).toBe('HLP_OBJECT_CIRCULAR');
  });
});

describe('object: clone, freeze, equal', () => {
  it('clones complex values with cycles', () => {
    const src: Record<string, unknown> = { d: new Date(5), r: /x/gi, m: new Map([[{ k: 1 }, new Set([1])]]), t: new Float64Array([1.5, NaN]), b: new Uint8Array([1, 2]).buffer };
    src.self = src;
    for (const strategy of ['auto', 'manual'] as const) {
      const c = deepClone(src, { strategy });
      expect(c).not.toBe(src);
      expect(c.self).toBe(c);
      expect(c.d).not.toBe(src.d);
      expect(deepEqual(c, src)).toBe(true);
    }
  });
  it('falls back to manual clone for functions and keeps prototypes in manual mode', () => {
    class P { constructor(public v: number) {} get twice(): number { return this.v * 2; } }
    const fn = (): number => 1;
    const c = deepClone({ fn, p: new P(2) });
    expect(c.fn).toBe(fn);
    expect(c.p).toBeInstanceOf(P);
    expect(deepClone({ p: new P(3) }, { strategy: 'manual' }).p.twice).toBe(6);
    const payload = JSON.parse('{"__proto__":{"polluted":1}}') as object;
    const auto = deepClone(payload);
    expect(Object.getPrototypeOf(auto)).toBe(Object.prototype);
    const pc = deepClone(payload, { strategy: 'manual' });
    expect(Object.getPrototypeOf(pc)).toBe(Object.prototype);
    expect(Object.keys(pc)).toEqual(['__proto__']);
    expect(polluted()).toBe(false);
  });
  it('freezes deeply and tolerates cycles and typed arrays', () => {
    const o: Record<string, unknown> = { a: { b: [1, { c: 2 }] }, t: new Uint8Array(2) };
    o.self = o;
    const f = deepFreeze(o);
    expect(Object.isFrozen(f)).toBe(true);
    expect(Object.isFrozen((o.a as { b: unknown[] }).b[1])).toBe(true);
  });
  it('compares structurally', () => {
    expect(deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(0, -0)).toBe(true);
    expect(deepEqual(0, -0, { distinguishZero: true })).toBe(false);
    expect(deepEqual([0], [-0], { distinguishZero: true })).toBe(false);
    expect(deepEqual(new Date(1), new Date(1))).toBe(true);
    expect(deepEqual(new Date(NaN), new Date(NaN))).toBe(true);
    expect(deepEqual(/a/g, /a/i)).toBe(false);
    expect(deepEqual(new Map([[{ k: 1 }, 'v']]), new Map([[{ k: 1 }, 'v']]))).toBe(true);
    expect(deepEqual(new Map([[{ k: 1 }, 'v']]), new Map([[{ k: 1 }, 'w']]))).toBe(false);
    expect(deepEqual(new Set([{ a: 1 }, { a: 2 }]), new Set([{ a: 2 }, { a: 1 }]))).toBe(true);
    expect(deepEqual(new Set([{ a: 1 }, { a: 1 }]), new Set([{ a: 1 }, { a: 2 }]))).toBe(false);
    expect(deepEqual(new Float32Array([NaN]), new Float32Array([NaN]))).toBe(true);
    expect(deepEqual(new Uint8Array([1]), new Int8Array([1]))).toBe(false);
    expect(deepEqual({ a: 1 }, Object.assign(Object.create(null) as object, { a: 1 }))).toBe(false);
    expect(deepEqual({ a: undefined }, {})).toBe(false);
    expect(deepEqual([1, 2], { 0: 1, 1: 2, length: 2 })).toBe(false);
    const x: Record<string, unknown> = { v: 1 };
    x.self = x;
    const y: Record<string, unknown> = { v: 1 };
    y.self = y;
    expect(deepEqual(x, y)).toBe(true);
    y.v = 2;
    expect(deepEqual(x, y)).toBe(false);
  });
  it('deepEqual agrees with deepClone (property)', () => {
    fc.assert(fc.property(fc.anything({ withDate: true, withMap: true, withSet: true, withTypedArray: true, withBigInt: true, withNullPrototype: true }), (v) => {
      expect(deepEqual(deepClone(v, { strategy: 'manual' }), v)).toBe(true);
    }));
  });
});

describe('object: diff/applyDiff', () => {
  it('produces and applies changes', () => {
    const a = { x: 1, l: [1, 2, 3], o: { k: 'v' } };
    const b = { x: 2, l: [1], o: { k: 'v', n: true } };
    const changes = diff(a, b);
    expect(changes).toContainEqual({ op: 'replace', path: ['x'], from: 1, value: 2 });
    expect(changes).toContainEqual({ op: 'remove', path: ['l', 2], from: 3 });
    expect(changes).toContainEqual({ op: 'add', path: ['o', 'n'], value: true });
    expect(applyDiff(a, changes)).toEqual(b);
    expect(a).toEqual({ x: 1, l: [1, 2, 3], o: { k: 'v' } });
    expect(diff(1, 2)).toEqual([{ op: 'replace', path: [], from: 1, value: 2 }]);
    expect(applyDiff({ l: [1, 3] }, [{ op: 'add', path: ['l', 1], value: 2 }])).toEqual({ l: [1, 2, 3] });
  });
  it('rejects bad and unsafe changes', () => {
    expect(code(() => applyDiff({}, [{ op: 'remove', path: ['nope'], from: 1 }]))).toBe('HLP_OBJECT_PATH_NOT_FOUND');
    expect(code(() => applyDiff({}, [{ op: 'add', path: ['__proto__', 'polluted'], value: 1 }]))).toBe('HLP_UNSAFE_KEY');
    expect(code(() => applyDiff({}, [{ op: 'add', path: ['constructor'], value: 1 }]))).toBe('HLP_UNSAFE_KEY');
    expect(polluted()).toBe(false);
  });
  it('round-trips: applyDiff(a, diff(a, b)) equals b (property)', () => {
    fc.assert(fc.property(jsonValue, jsonValue, (a, b) => {
      const snapshot = structuredClone(a);
      expect(applyDiff(a, diff(a, b))).toEqual(b);
      expect(a).toEqual(snapshot);
    }), { numRuns: 300 });
  });
});

describe('object: flatten/unflatten', () => {
  it('flattens and unflattens', () => {
    const o = { a: { b: 1, c: [2, { d: 3 }] }, e: {}, f: [] };
    const flat = flattenObject(o);
    expect(flat).toEqual({ 'a.b': 1, 'a.c.0': 2, 'a.c.1.d': 3, e: {}, f: [] });
    expect(unflattenObject(flat)).toEqual(o);
    expect(flattenObject({ a: [1] }, { arrays: false, separator: '/' })).toEqual({ a: [1] });
    expect(flattenObject({ a: { b: 1 } }, { separator: '/' })).toEqual({ 'a/b': 1 });
    expect(unflattenObject({ 'a.0': 1, 'a.x': 2 })).toEqual({ a: { 0: 1, x: 2 } });
    expect(unflattenObject({ 'a.0': 1 }, { arrays: false })).toEqual({ a: { 0: 1 } });
  });
  it('is pollution safe and bounded', () => {
    for (const k of ['__proto__.polluted', 'constructor.prototype.polluted', 'a.__proto__.polluted']) expect(code(() => unflattenObject({ [k]: 1 }))).toBe('HLP_UNSAFE_KEY');
    const payload = JSON.parse('{"__proto__":{"polluted":1}}') as Record<string, unknown>;
    expect(code(() => unflattenObject(payload))).toBe('HLP_UNSAFE_KEY');
    expect(code(() => unflattenObject({ 'a.99999999': 1 }))).toBe('HLP_OBJECT_ARRAY_INDEX_LIMIT');
    const c: Record<string, unknown> = {};
    c.c = c;
    expect(code(() => flattenObject(c))).toBe('HLP_OBJECT_CIRCULAR');
    expect(polluted()).toBe(false);
  });
  it('round-trips objects with identifier keys (property)', () => {
    const key = fc.stringMatching(/^[a-z]{1,5}$/);
    const tree = fc.letrec((tie) => ({ node: fc.dictionary(key, fc.oneof({ depthSize: 'small' }, fc.integer(), fc.string(), tie('node')), { minKeys: 1, maxKeys: 4 }) })).node;
    fc.assert(fc.property(tree, (o) => {
      expect(unflattenObject(flattenObject(o))).toEqual(o);
    }));
  });
});

describe('object: shallow helpers', () => {
  const o = { a: 1, b: 2, c: null as number | null };
  it('pick/omit/by', () => {
    expect(pick(o, ['a', 'c'])).toEqual({ a: 1, c: null });
    expect(omit(o, ['a'])).toEqual({ b: 2, c: null });
    expect(pickBy(o, (v) => v !== null)).toEqual({ a: 1, b: 2 });
    expect(omitBy(o, (v) => v === null)).toEqual({ a: 1, b: 2 });
    expect(filterKeys(o, (k) => k !== 'b')).toEqual({ a: 1, c: null });
    expect(filterValues(o, (v) => v === 2)).toEqual({ b: 2 });
    const empty: { toString?: unknown } = {};
    expect(pick(empty, ['toString'])).toEqual({});
  });
  it('keeps own __proto__ data without changing prototypes', () => {
    const payload = JSON.parse('{"__proto__":{"polluted":1},"a":1}') as Record<string, unknown>;
    for (const r of [omit(payload, ['a']), pickBy(payload, () => true), mapValues(payload, (v) => v), defaults({}, payload)]) {
      expect(Object.getPrototypeOf(r)).toBe(Object.prototype);
      expect(Object.keys(r)).toContain('__proto__');
    }
    expect(polluted()).toBe(false);
  });
  it('map/invert/rename reject unsafe derived keys', () => {
    expect(mapKeys(o, (_, k) => k.toUpperCase())).toEqual({ A: 1, B: 2, C: null });
    expect(mapValues({ a: 1 }, (v) => v * 2)).toEqual({ a: 2 });
    expect(mapEntries({ a: 1 }, ([k, v]) => [`${k}!`, v + 1])).toEqual({ 'a!': 2 });
    expect(invert({ a: 'x', b: 'y' })).toEqual({ x: 'a', y: 'b' });
    expect(invertBy({ a: 1, b: 2, c: 1 })).toEqual({ 1: ['a', 'c'], 2: ['b'] });
    expect(renameKeys({ first: 'A', x: 1 }, { first: 'givenName' })).toEqual({ givenName: 'A', x: 1 });
    expect(code(() => mapKeys({ a: 1 }, () => '__proto__'))).toBe('HLP_UNSAFE_KEY');
    expect(code(() => invert({ a: '__proto__' }))).toBe('HLP_UNSAFE_KEY');
    expect(code(() => renameKeys({ a: 1 }, { a: 'constructor' }))).toBe('HLP_UNSAFE_KEY');
    expect(code(() => mapToObject(new Map([['__proto__', 1]])))).toBe('HLP_UNSAFE_KEY');
    expect(code(() => countValuesBy({ a: 'prototype' }))).toBe('HLP_UNSAFE_KEY');
    expect(polluted()).toBe(false);
  });
  it('compact, defaults, typed, misc', () => {
    expect(compactObject({ a: 1, b: null, c: undefined, d: '' })).toEqual({ a: 1, d: '' });
    expect(compactObject({ a: null, b: undefined }, { remove: 'undefined' })).toEqual({ a: null });
    expect(compactObject({ a: '', b: [], c: {}, d: { e: null } }, { remove: 'empty', deep: true })).toEqual({});
    expect(compactObject({ l: [{ a: null, b: 1 }] }, { deep: true })).toEqual({ l: [{ b: 1 }] });
    expect(defaults({ a: 1, b: undefined }, { b: 2, c: 3 }, { c: 4 })).toEqual({ a: 1, b: 2, c: 3 });
    expect(typedKeys({ a: 1 })).toEqual(['a']);
    expect(typedValues({ a: 1 })).toEqual([1]);
    expect(typedEntries({ a: 1 })).toEqual([['a', 1]]);
    expect(typedFromEntries([['a', 1]] as const)).toEqual({ a: 1 });
    expect(isShallowEqual({ a: 1, n: NaN }, { a: 1, n: NaN })).toBe(true);
    expect(isShallowEqual({ a: {} }, { a: {} })).toBe(false);
    expect(isShallowEqual([1, 2], [1, 2])).toBe(true);
    expect(getOwn({}, 'toString')).toBeUndefined();
    expect(getOwn({ a: 1 }, 'a')).toBe(1);
    expect([size({ a: 1 }), size([1, 2]), size(new Set([1])), size(null), size('abc')]).toEqual([1, 2, 1, 0, 3]);
    expect(countValuesBy({ a: 'x', b: 'y', c: 'x' })).toEqual({ x: 2, y: 1 });
    expect(Object.keys(sortKeys({ b: 1, a: { d: 1, c: 2 } }, { recursive: true }).a)).toEqual(['c', 'd']);
    expect(Object.keys(sortKeys({ b: 1, a: { d: 1, c: 2 } }).a)).toEqual(['d', 'c']);
    expect(Object.keys(sortKeys({ a: 1, b: 2 }, { compare: (x, y) => y.localeCompare(x) }))).toEqual(['b', 'a']);
    expect(objectToMap({ a: 1 }).get('a')).toBe(1);
    expect(mapToObject(new Map<unknown, number>([['a', 1], [2, 2]]))).toEqual({ a: 1, 2: 2 });
    expect(code(() => mapToObject(new Map([[{}, 1]])))).toBe('HLP_OBJECT_INVALID_KEY');
  });
});
