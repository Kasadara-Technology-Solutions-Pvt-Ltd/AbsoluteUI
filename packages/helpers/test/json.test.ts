import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applyJsonPatch, applyMergePatch, canonicalJson, createJsonPatch, createMergePatch, formatPointer, getByPointer, hasPointer, isValidJson, jsonByteSize,
  parseJsonOrThrow, parseNdjson, parsePointer, prettyJson, removeByPointer, safeJsonParse, safeJsonStringify, setByPointer, stringifyNdjson, tryApplyJsonPatch,
} from '@absoluteui/helpers/json';
import { HelperError } from '@absoluteui/helpers/error';
import { deepEqual } from '@absoluteui/helpers/object';

const polluted = (): boolean => ({} as Record<string, unknown>).polluted !== undefined;
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof HelperError ? e.code : 'non-helper-error';
  }
  return undefined;
};
const safeKey = fc.string().filter((k) => !['__proto__', 'constructor', 'prototype'].includes(k));
const json = fc.letrec((tie) => ({
  value: fc.oneof({ depthSize: 'small' }, fc.constant(null), fc.boolean(), fc.integer(), fc.double({ noNaN: true, noDefaultInfinity: true }), fc.string(), fc.array(tie('value'), { maxLength: 4 }), fc.dictionary(safeKey, tie('value'), { maxKeys: 4, noNullPrototype: true })),
})).value;

describe('json: safeJsonParse', () => {
  it('parses valid JSON and reports syntax errors without echoing input', () => {
    expect(safeJsonParse('{"a":[1,true,null]}')).toEqual({ ok: true, value: { a: [1, true, null] } });
    const r = safeJsonParse('{"secret-token": oops}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('HLP_JSON_SYNTAX');
      expect(r.error.message).not.toContain('secret');
      expect(r.error.cause).toBeUndefined();
    }
    expect(safeJsonParse(42).ok).toBe(false);
    expect(isValidJson('[1,2]')).toBe(true);
    expect(isValidJson('[1,2')).toBe(false);
    expect(code(() => parseJsonOrThrow('nope'))).toBe('HLP_JSON_SYNTAX');
  });
  it('enforces length, depth and key limits', () => {
    const err = (t: string, o = {}): string | undefined => {
      const r = safeJsonParse(t, o);
      return r.ok ? undefined : r.error.code;
    };
    expect(err('"abcdef"', { maxLength: 5 })).toBe('HLP_JSON_TOO_LONG');
    expect(err('['.repeat(300) + ']'.repeat(300))).toBe('HLP_JSON_TOO_DEEP');
    expect(err('[[[1]]]', { maxDepth: 2 })).toBe('HLP_JSON_TOO_DEEP');
    expect(err('[[1]]', { maxDepth: 2 })).toBeUndefined();
    expect(err('["[[[[[[", {"k":"{{{{{"}]', { maxDepth: 2 })).toBeUndefined();
    expect(err('{"a":1,"b":2,"c":3}', { maxKeys: 2 })).toBe('HLP_JSON_TOO_MANY_KEYS');
    const t = performance.now();
    expect(err('['.repeat(5_000_000))).toBe('HLP_JSON_TOO_DEEP');
    expect(performance.now() - t).toBeLessThan(500);
  });
  it('rejects or strips prototype-pollution keys at any depth (including escaped forms)', () => {
    for (const t of ['{"__proto__":{"polluted":1}}', '{"a":[{"constructor":{"prototype":{"polluted":1}}}]}', '{"\\u005f_proto__":{"polluted":1}}', '{"prototype":1}']) {
      const r = safeJsonParse(t);
      expect(r.ok ? undefined : r.error.code, t).toBe('HLP_JSON_UNSAFE_KEY');
    }
    const s = safeJsonParse('{"a":1,"__proto__":{"polluted":1},"n":{"constructor":2,"b":3}}', { unsafeKeys: 'strip' });
    expect(s).toEqual({ ok: true, value: { a: 1, n: { b: 3 } } });
    expect(polluted()).toBe(false);
  });
  it('revives dates and composes revivers', () => {
    const r = parseJsonOrThrow('{"at":"2026-09-29T10:15:30.123+05:30","day":"2026-09-29","bad":"2026-02-30T00:00:00Z","n":2}', {
      dates: true,
      reviver: [(k, v) => (k === 'n' ? (v as number) * 10 : v), (k, v) => (k === 'drop' ? undefined : v)],
    }) as Record<string, unknown>;
    expect(r.at).toBeInstanceOf(Date);
    expect((r.at as Date).toISOString()).toBe('2026-09-29T04:45:30.123Z');
    expect(r.day).toBe('2026-09-29');
    expect(r.bad).toBe('2026-02-30T00:00:00Z');
    expect(r.n).toBe(20);
    expect(parseJsonOrThrow('{"drop":1,"k":2}', { reviver: (k, v) => (k === 'drop' ? undefined : v) })).toEqual({ k: 2 });
    const bad = safeJsonParse('1', { reviver: () => { throw new Error('x'); } });
    expect(bad.ok ? '' : bad.error.code).toBe('HLP_JSON_REVIVER');
  });
  it('validates shape with a guard', () => {
    const isNums = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number');
    const r = safeJsonParse('[1,2]', { validate: isNums });
    expect(r.ok && r.value[1]).toBe(2);
    const bad = safeJsonParse('["x"]', { validate: isNums });
    expect(bad.ok ? '' : bad.error.code).toBe('HLP_JSON_SHAPE');
  });
});

describe('json: stringify', () => {
  it('handles cycles, bigint, Map, Set, Date, Error', () => {
    const o: Record<string, unknown> = { n: 10n, m: new Map([['k', 1]]), s: new Set([1, 2]), d: new Date(0), e: Object.assign(new Error('boom'), { code: 'E1' }) };
    o.self = o;
    const shared = { x: 1 };
    o.pair = [shared, shared];
    expect(JSON.parse(safeJsonStringify(o) ?? '')).toEqual({ n: '10', m: [['k', 1]], s: [1, 2], d: '1970-01-01T00:00:00.000Z', e: { name: 'Error', message: 'boom', code: 'E1' }, self: '[Circular]', pair: [{ x: 1 }, { x: 1 }] });
    expect(code(() => safeJsonStringify(o, { circular: 'error' }))).toBe('HLP_JSON_CIRCULAR');
    expect(code(() => safeJsonStringify(1n, { bigint: 'error' }))).toBe('HLP_JSON_BIGINT');
    expect(safeJsonStringify({ m: new Map([['a', 1]]) }, { map: 'object' })).toBe('{"m":{"a":1}}');
    expect(safeJsonStringify(new Date(5), { date: 'epoch' })).toBe('5');
    expect(safeJsonStringify(new Error('m'), { error: 'message' })).toBe('"m"');
    expect(safeJsonStringify(new Uint8Array([1, 2]))).toBe('[1,2]');
    expect(safeJsonStringify(undefined)).toBeUndefined();
    expect(safeJsonStringify({ a: 1 }, { indent: 2 })).toBe('{\n  "a": 1\n}');
    expect(code(() => safeJsonStringify('x'.repeat(20), { maxLength: 10 }))).toBe('HLP_JSON_TOO_LONG');
    expect(safeJsonStringify(JSON.parse('{"__proto__":{"a":1}}'))).toBe('{"__proto__":{"a":1}}');
    expect(polluted()).toBe(false);
  });
  it('produces canonical JSON', () => {
    expect(canonicalJson({ b: 1, a: [true, 1e21, -0, 'é'], c: undefined })).toBe('{"a":[true,1e+21,0,"é"],"b":1}');
    expect(canonicalJson({ '€': 1, '\r': 2, '1': 3, '😀': 4 })).toBe('{"\\r":2,"1":3,"€":1,"😀":4}');
    expect(canonicalJson([undefined, () => 1])).toBe('[null,null]');
    expect(canonicalJson({ d: new Date(0) })).toBe('{"d":"1970-01-01T00:00:00.000Z"}');
    for (const bad of [NaN, Infinity, 1n, undefined]) expect(code(() => canonicalJson(bad))).toBe('HLP_JSON_NOT_SERIALIZABLE');
    const c: Record<string, unknown> = {};
    c.c = c;
    expect(code(() => canonicalJson(c))).toBe('HLP_JSON_CIRCULAR');
  });
  it('canonical JSON is independent of key order and parses back (property)', () => {
    fc.assert(fc.property(json, (v) => {
      const s = canonicalJson(v);
      expect(canonicalJson(JSON.parse(s))).toBe(s);
      expect(deepEqual(JSON.parse(s), v)).toBe(true);
    }));
  });
  it('pretty and byte size', () => {
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(jsonByteSize({ s: 'é' })).toBe(10);
    expect(jsonByteSize('😀')).toBe(6);
    expect(jsonByteSize(undefined)).toBe(0);
    fc.assert(fc.property(fc.string({ unit: 'binary' }), (s) => {
      expect(jsonByteSize(s)).toBe(new TextEncoder().encode(JSON.stringify(s)).length);
    }));
  });
});

describe('json: pointer (RFC 6901 §5)', () => {
  const doc = { foo: ['bar', 'baz'], '': 0, 'a/b': 1, 'c%d': 2, 'e^f': 3, 'g|h': 4, 'i\\j': 5, 'k"l': 6, ' ': 7, 'm~n': 8 };
  const cases: [string, string, unknown][] = [
    ['', '#', doc], ['/foo', '#/foo', ['bar', 'baz']], ['/foo/0', '#/foo/0', 'bar'], ['/', '#/', 0], ['/a~1b', '#/a~1b', 1], ['/c%d', '#/c%25d', 2],
    ['/e^f', '#/e%5Ef', 3], ['/g|h', '#/g%7Ch', 4], ['/i\\j', '#/i%5Cj', 5], ['/k"l', '#/k%22l', 6], ['/ ', '#/%20', 7], ['/m~0n', '#/m~0n', 8],
  ];
  it('evaluates the RFC examples in string and fragment form', () => {
    for (const [p, f, v] of cases) {
      expect(getByPointer(doc, p), p).toEqual(v);
      expect(getByPointer(doc, f), f).toEqual(v);
      expect(formatPointer(parsePointer(p))).toBe(p);
      expect(parsePointer(formatPointer(parsePointer(f), { fragment: true }))).toEqual(parsePointer(f));
    }
  });
  it('rejects invalid pointers and does not read prototypes', () => {
    for (const bad of ['foo', '/a~2', '/a~', '#%E0%A4%A']) expect(code(() => parsePointer(bad)), bad).toBe('HLP_JSON_POINTER_INVALID');
    expect(parsePointer('/~01')).toEqual(['~1']);
    expect(getByPointer({ a: [1] }, '/a/01')).toBeUndefined();
    expect(getByPointer({ a: [1] }, '/a/-')).toBeUndefined();
    expect(getByPointer({}, '/constructor')).toBeUndefined();
    expect(hasPointer({ a: null }, '/a')).toBe(true);
    expect(hasPointer({}, '/toString')).toBe(false);
  });
  it('sets and removes immutably with safe keys', () => {
    const src = { a: [1], b: { c: 1 } };
    expect(setByPointer(src, '/a/-', 2)).toEqual({ a: [1, 2], b: { c: 1 } });
    expect(setByPointer(src, '/a/0', 9)).toEqual({ a: [9], b: { c: 1 } });
    expect(setByPointer(src, '/b/d', 2)).toEqual({ a: [1], b: { c: 1, d: 2 } });
    expect(setByPointer(src, '', 1)).toBe(1);
    expect(removeByPointer(src, '/a/0')).toEqual({ a: [], b: { c: 1 } });
    expect(src).toEqual({ a: [1], b: { c: 1 } });
    expect(code(() => setByPointer(src, '/x/y', 1))).toBe('HLP_JSON_POINTER_NOT_FOUND');
    expect(code(() => setByPointer(src, '/a/5', 1))).toBe('HLP_JSON_POINTER_NOT_FOUND');
    expect(code(() => removeByPointer(src, '/nope'))).toBe('HLP_JSON_POINTER_NOT_FOUND');
    expect(code(() => setByPointer({}, '/__proto__/polluted', 1))).toBe('HLP_UNSAFE_KEY');
    expect(code(() => setByPointer({}, '/constructor', 1))).toBe('HLP_UNSAFE_KEY');
    expect(polluted()).toBe(false);
  });
});

describe('json: patch (RFC 6902 Appendix A)', () => {
  const cases: [string, unknown, unknown[], unknown][] = [
    ['A.1', { foo: 'bar' }, [{ op: 'add', path: '/baz', value: 'qux' }], { baz: 'qux', foo: 'bar' }],
    ['A.2', { foo: ['bar', 'baz'] }, [{ op: 'add', path: '/foo/1', value: 'qux' }], { foo: ['bar', 'qux', 'baz'] }],
    ['A.3', { baz: 'qux', foo: 'bar' }, [{ op: 'remove', path: '/baz' }], { foo: 'bar' }],
    ['A.4', { foo: ['bar', 'qux', 'baz'] }, [{ op: 'remove', path: '/foo/1' }], { foo: ['bar', 'baz'] }],
    ['A.5', { baz: 'qux', foo: 'bar' }, [{ op: 'replace', path: '/baz', value: 'boo' }], { baz: 'boo', foo: 'bar' }],
    ['A.6', { foo: { bar: 'baz', waldo: 'fred' }, qux: { corge: 'grault' } }, [{ op: 'move', from: '/foo/waldo', path: '/qux/thud' }], { foo: { bar: 'baz' }, qux: { corge: 'grault', thud: 'fred' } }],
    ['A.7', { foo: ['all', 'grass', 'cows', 'eat'] }, [{ op: 'move', from: '/foo/1', path: '/foo/3' }], { foo: ['all', 'cows', 'eat', 'grass'] }],
    ['A.8', { baz: 'qux', foo: ['a', 2, 'c'] }, [{ op: 'test', path: '/baz', value: 'qux' }, { op: 'test', path: '/foo/1', value: 2 }], { baz: 'qux', foo: ['a', 2, 'c'] }],
    ['A.10', { foo: 'bar' }, [{ op: 'add', path: '/child', value: { grandchild: {} } }], { foo: 'bar', child: { grandchild: {} } }],
    ['A.11', { foo: 'bar' }, [{ op: 'add', path: '/baz', value: 'qux', xyz: 123 }], { foo: 'bar', baz: 'qux' }],
    ['A.14', { '/': 9, '~1': 10 }, [{ op: 'test', path: '/~01', value: 10 }], { '/': 9, '~1': 10 }],
    ['A.16', { foo: ['bar'] }, [{ op: 'add', path: '/foo/-', value: ['abc', 'def'] }], { foo: ['bar', ['abc', 'def']] }],
  ];
  it('applies the RFC examples', () => {
    for (const [name, doc, patch, expected] of cases) {
      const before = structuredClone(doc);
      expect(applyJsonPatch(doc, patch), name).toEqual(expected);
      expect(doc, name).toEqual(before);
    }
  });
  it('fails the RFC error examples atomically', () => {
    expect(code(() => applyJsonPatch({ baz: 'qux' }, [{ op: 'test', path: '/baz', value: 'bar' }]))).toBe('HLP_JSON_PATCH_TEST_FAILED');
    expect(code(() => applyJsonPatch({ foo: 'bar' }, [{ op: 'add', path: '/baz/bat', value: 'qux' }]))).toBe('HLP_JSON_PATCH_PATH_NOT_FOUND');
    expect(code(() => applyJsonPatch({ '/': 9, '~1': 10 }, [{ op: 'test', path: '/~01', value: '10' }]))).toBe('HLP_JSON_PATCH_TEST_FAILED');
    const doc = { a: 1, l: [1] };
    const r = tryApplyJsonPatch(doc, [{ op: 'replace', path: '/a', value: 2 }, { op: 'add', path: '/l/1', value: 2 }, { op: 'remove', path: '/missing' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.details).toEqual({ operation: 2 });
    expect(doc).toEqual({ a: 1, l: [1] });
  });
  it('validates operations and blocks pollution', () => {
    for (const bad of [[{ op: 'nope', path: '/a' }], [{ op: 'add', path: 'a', value: 1 }], [{ op: 'add', path: '/a' }], [{ op: 'move', path: '/a' }], [1], [{ op: 'move', from: '/a', path: '/a/b' }], [{ op: 'remove', path: '' }]]) {
      expect(code(() => applyJsonPatch({ a: { b: 1 } }, bad)), JSON.stringify(bad)).toBe('HLP_JSON_PATCH_INVALID');
    }
    expect(code(() => applyJsonPatch({}, [{ op: 'add', path: '/__proto__/polluted', value: 1 }]))).toBe('HLP_UNSAFE_KEY');
    expect(code(() => applyJsonPatch({}, [{ op: 'add', path: '/constructor', value: {} }]))).toBe('HLP_UNSAFE_KEY');
    expect(code(() => applyJsonPatch({}, [{ op: 'add', path: '/__proto__', value: { polluted: 1 } }]))).toBe('HLP_UNSAFE_KEY');
    expect(code(() => applyJsonPatch({}, Array.from({ length: 5 }, () => ({ op: 'test', path: '', value: {} })), { maxOperations: 4 }))).toBe('HLP_JSON_PATCH_TOO_LARGE');
    expect(polluted()).toBe(false);
  });
  it('copy does not alias locations', () => {
    const out = applyJsonPatch({ a: { x: 1 } }, [{ op: 'add', path: '/a/y', value: 2 }, { op: 'copy', from: '/a', path: '/b' }, { op: 'add', path: '/b/z', value: 3 }]);
    expect(out).toEqual({ a: { x: 1, y: 2 }, b: { x: 1, y: 2, z: 3 } });
    expect(applyJsonPatch({ a: 1 }, [{ op: 'move', from: '/a', path: '/a' }])).toEqual({ a: 1 });
    expect(applyJsonPatch({ a: 1 }, [{ op: 'replace', path: '', value: [1] }])).toEqual([1]);
  });
  it('round-trips: apply(a, create(a, b)) equals b (property)', () => {
    fc.assert(fc.property(json, json, (a, b) => {
      const snapshot = structuredClone(a);
      expect(deepEqual(applyJsonPatch(a, createJsonPatch(a, b)), b)).toBe(true);
      expect(a).toEqual(snapshot);
    }), { numRuns: 300 });
  });
});

describe('json: merge patch (RFC 7396 Appendix A)', () => {
  const cases: [unknown, unknown, unknown][] = [
    [{ a: 'b' }, { a: 'c' }, { a: 'c' }], [{ a: 'b' }, { b: 'c' }, { a: 'b', b: 'c' }], [{ a: 'b' }, { a: null }, {}], [{ a: 'b', b: 'c' }, { a: null }, { b: 'c' }],
    [{ a: ['b'] }, { a: 'c' }, { a: 'c' }], [{ a: 'c' }, { a: ['b'] }, { a: ['b'] }], [{ a: { b: 'c' } }, { a: { b: 'd', c: null } }, { a: { b: 'd' } }],
    [{ a: [{ b: 'c' }] }, { a: [1] }, { a: [1] }], [['a', 'b'], ['c', 'd'], ['c', 'd']], [{ a: 'b' }, ['c'], ['c']], [{ a: 'foo' }, null, null],
    [{ a: 'foo' }, 'bar', 'bar'], [{ e: null }, { a: 1 }, { e: null, a: 1 }], [[1, 2], { a: 'b', c: null }, { a: 'b' }], [{}, { a: { bb: { ccc: null } } }, { a: { bb: {} } }],
  ];
  it('applies the RFC examples immutably', () => {
    for (const [target, patch, expected] of cases) {
      const before = structuredClone(target);
      expect(applyMergePatch(target, patch)).toEqual(expected);
      expect(target).toEqual(before);
    }
  });
  it('blocks pollution', () => {
    expect(code(() => applyMergePatch({}, JSON.parse('{"__proto__":{"polluted":1}}')))).toBe('HLP_UNSAFE_KEY');
    expect(code(() => applyMergePatch({}, { a: { constructor: { prototype: { polluted: 1 } } } }))).toBe('HLP_UNSAFE_KEY');
    expect(polluted()).toBe(false);
  });
  it('round-trips for documents without nulls (property)', () => {
    const noNull = fc.letrec((tie) => ({
      value: fc.oneof({ depthSize: 'small' }, fc.boolean(), fc.integer(), fc.string(), fc.array(tie('value'), { maxLength: 3 }), fc.dictionary(safeKey, tie('value'), { maxKeys: 4, noNullPrototype: true })),
    })).value;
    fc.assert(fc.property(noNull, noNull, (a, b) => {
      expect(applyMergePatch(a, createMergePatch(a, b))).toEqual(b);
    }));
  });
});

describe('json: ndjson', () => {
  it('parses and stringifies', () => {
    expect(parseNdjson('{"a":1}\r\n\n  \n[2]\n3')).toEqual({ ok: true, value: [{ a: 1 }, [2], 3] });
    expect(parseNdjson('')).toEqual({ ok: true, value: [] });
    expect(stringifyNdjson([{ a: 1 }, 'x\ny', 2n])).toBe('{"a":1}\n"x\\ny"\n"2"\n');
    expect(code(() => stringifyNdjson([undefined]))).toBe('HLP_JSON_NOT_SERIALIZABLE');
    const vals = [{ a: 1 }, [1, 'two'], null, 'x'];
    expect(parseNdjson(stringifyNdjson(vals))).toEqual({ ok: true, value: vals });
  });
  it('reports line numbers, never content, and enforces limits', () => {
    const r = parseNdjson('{"a":1}\n{"password":"hunter2"\n3');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('HLP_JSON_SYNTAX');
      expect(r.error.details).toEqual({ line: 2 });
      expect(r.error.message).not.toContain('hunter2');
    }
    const seen: number[] = [];
    expect(parseNdjson('1\nbad\n{"__proto__":1}\n4', { onError: 'skip', onLineError: (line) => seen.push(line) })).toEqual({ ok: true, value: [1, 4] });
    expect(seen).toEqual([2, 3]);
    const lim = parseNdjson('1\n2\n3', { maxLines: 2 });
    expect(lim.ok ? '' : lim.error.code).toBe('HLP_JSON_TOO_MANY_LINES');
    const long = parseNdjson('"aaaaaaaaaa"', { maxLineLength: 5 });
    expect(long.ok ? '' : long.error.code).toBe('HLP_JSON_TOO_LONG');
  });
});
