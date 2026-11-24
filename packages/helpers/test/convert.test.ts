import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  coerce, coerceFields, parseIntStrict, toArray, toBigInt, toBoolean, toDate, toDateOrThrow, toInteger, toIntegerOrThrow, toMap, toNumber, toNumberOrThrow,
  toPlainObject, toSafeInteger, toSet, toStringSafe,
} from '@absoluteui/helpers/convert';
import { HelperError, ValidationError } from '@absoluteui/helpers/error';

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof HelperError ? e.code : 'non-helper-error';
  }
  return undefined;
};

describe('convert: numbers', () => {
  it('accepts numeric strings strictly', () => {
    expect(toNumber('42')).toBe(42);
    expect(toNumber(' -1.5e3 ')).toBe(-1500);
    expect(toNumber('+.5')).toBe(0.5);
    expect(toNumber('5.')).toBe(5);
    expect(toNumber('1E-2')).toBe(0.01);
    expect(toNumber(String.fromCharCode(0x2212) + '3')).toBe(-3);
    expect(toNumber(7n)).toBe(7);
    for (const bad of ['', '   ', '12abc', 'abc', '0x10', '1_000', '1e', '.', '--1', 'Infinity', 'NaN', NaN, Infinity, true, null, undefined, {}, [], 2n ** 60n, '1e400', '1'.repeat(1001)]) {
      expect(toNumber(bad), typeof bad).toBeUndefined();
    }
  });
  it('parses locale-formatted numbers', () => {
    expect(toNumber('1.234,5', { locale: 'de' })).toBe(1234.5);
    expect(toNumber('1,234.5', { locale: 'en-US' })).toBe(1234.5);
    const fr = new Intl.NumberFormat('fr').format(-1234.5);
    expect(toNumber(fr, { locale: 'fr' })).toBe(-1234.5);
    expect(toNumber('1 234,5', { locale: 'fr' })).toBe(1234.5);
    const ar = new Intl.NumberFormat('ar-EG').format(-123.5);
    expect(toNumber(ar, { locale: 'ar-EG' })).toBe(-123.5);
    expect(toNumber('12abc', { locale: 'de' })).toBeUndefined();
  });
  it('agrees with Number for any finite double text (property)', () => {
    fc.assert(fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (d) => {
      expect(toNumber(String(d))).toBe(d === 0 ? 0 : d);
    }));
  });
  it('integers with rounding modes', () => {
    expect(toInteger('42')).toBe(42);
    expect(toInteger(1.5)).toBeUndefined();
    expect(toInteger('-2.7', { rounding: 'trunc' })).toBe(-2);
    expect(toInteger(-2.5, { rounding: 'floor' })).toBe(-3);
    expect(toInteger(2.1, { rounding: 'ceil' })).toBe(3);
    expect(toInteger(-2.5, { rounding: 'round' })).toBe(-3);
    expect(toInteger(2.5, { rounding: 'round' })).toBe(3);
    expect([0.5, 1.5, 2.5, -2.5].map((n) => toInteger(n, { rounding: 'half-even' }))).toEqual([0, 2, 2, -2]);
    expect(Object.is(toInteger(-0.2, { rounding: 'trunc' }), 0)).toBe(true);
    expect(toSafeInteger('9007199254740993')).toBeUndefined();
    expect(toSafeInteger('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
    expect(toBigInt(' -12345678901234567890 ')).toBe(-12345678901234567890n);
    expect(toBigInt(5)).toBe(5n);
    expect(toBigInt(1.5)).toBeUndefined();
    expect(toBigInt('1e3')).toBeUndefined();
    expect(toBigInt('')).toBeUndefined();
  });
  it('parseIntStrict', () => {
    expect(parseIntStrict('ff', 16)).toBe(255);
    expect(parseIntStrict('-101', 2)).toBe(-5);
    expect(parseIntStrict('Zz', 36)).toBe(1295);
    for (const bad of ['12px', ' 12', '', '-', '1.5', '0x1f', '9'.repeat(20)]) expect(parseIntStrict(bad), bad).toBeUndefined();
    expect(parseIntStrict('2', 2)).toBeUndefined();
    expect(Object.is(parseIntStrict('-0'), 0)).toBe(true);
    expect(code(() => parseIntStrict('1', 37))).toBe('HLP_CONVERT_RADIX');
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 2, max: 36 }), (n, r) => {
      expect(parseIntStrict(n.toString(r), r)).toBe(n);
    }));
  });
  it('OrThrow variants throw ValidationError without echoing input', () => {
    expect(toNumberOrThrow('3')).toBe(3);
    expect(toIntegerOrThrow('7')).toBe(7);
    try {
      toNumberOrThrow('secret-abc');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).code).toBe('HLP_CONVERT_NUMBER');
      expect((e as Error).message).not.toContain('secret');
    }
    expect(code(() => toIntegerOrThrow('1.5'))).toBe('HLP_CONVERT_INTEGER');
    expect(code(() => toDateOrThrow('01/02/2026'))).toBe('HLP_CONVERT_DATE');
  });
});

describe('convert: dates and booleans', () => {
  it('accepts ISO 8601 only', () => {
    expect(toDate('2026-09-29T10:00:00Z')?.toISOString()).toBe('2026-09-29T10:00:00.000Z');
    expect(toDate('2026-09-29T10:00:00.5+05:30')?.toISOString()).toBe('2026-09-29T04:30:00.500Z');
    expect(toDate('2026-09-29')?.toISOString()).toBe('2026-09-29T00:00:00.000Z');
    expect(toDate('0005-01-01')?.getUTCFullYear()).toBe(5);
    expect(toDate('+010000-01-01T00:00Z')?.getUTCFullYear()).toBe(10000);
    const local = toDate('2026-09-29T10:15');
    expect([local?.getFullYear(), local?.getMonth(), local?.getDate(), local?.getHours(), local?.getMinutes()]).toEqual([2026, 8, 29, 10, 15]);
    for (const bad of ['01/02/2026', '2026-02-30', '2026-13-01', '2026-9-29', '2026-09-29 10:00', '2026-09-29T24:00', '20260929', 'Tue Sep 29 2026', '', '2026-09-29T10:00+25:00', '-000000-01-01']) {
      expect(toDate(bad), bad).toBeUndefined();
    }
    const d = new Date(5);
    expect(toDate(d)).not.toBe(d);
    expect(toDate(d)?.getTime()).toBe(5);
    expect(toDate(new Date(NaN))).toBeUndefined();
    expect(toDate(0)?.getTime()).toBe(0);
    expect(toDate(9e15)).toBeUndefined();
    expect(toDate(NaN)).toBeUndefined();
  });
  it('ISO round-trips through toISOString (property)', () => {
    fc.assert(fc.property(fc.date({ min: new Date('0001-01-01T00:00:00Z'), max: new Date('9999-12-31T23:59:59Z'), noInvalidDate: true }), (d) => {
      expect(toDate(d.toISOString())?.getTime()).toBe(d.getTime());
    }));
  });
  it('rejects pathological date text quickly', () => {
    const t = performance.now();
    for (let i = 0; i < 1000; i++) toDate('2026-09-29T10:00:00.' + '1'.repeat(30));
    expect(performance.now() - t).toBeLessThan(200);
  });
  it('toBoolean delegates to parseBoolean', () => {
    expect(toBoolean('off')).toBe(false);
    expect(toBoolean('yes', { strict: true })).toBeUndefined();
  });
});

describe('convert: strings and collections', () => {
  it('toStringSafe never yields [object Object]', () => {
    const cyc: Record<string, unknown> = { a: 1n };
    cyc.self = cyc;
    expect(toStringSafe({ a: 1n })).toBe('{"a":"1"}');
    expect(toStringSafe(cyc)).toBe('{"a":"1","self":"[Circular]"}');
    expect(toStringSafe(Symbol('x'))).toBe('Symbol(x)');
    expect(toStringSafe(-0)).toBe('0');
    expect(toStringSafe(null)).toBe('');
    expect(toStringSafe(undefined)).toBe('');
    expect(toStringSafe(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
    expect(toStringSafe(new Error('boom'))).toBe('Error: boom');
    expect(toStringSafe(/a/g)).toBe('/a/g');
    expect(toStringSafe(new Map([['k', 1]]))).toBe('[["k",1]]');
    expect(toStringSafe(new Set([1]))).toBe('[1]');
    function named(): void { /* noop */ }
    expect(toStringSafe(named)).toBe('[Function: named]');
    class P { toString(): string { return 'P!'; } }
    expect(toStringSafe(new P())).toBe('P!');
    class Q { x = 1; }
    expect(toStringSafe(new Q())).toBe('{"x":1}');
    expect(toStringSafe(Object.create(null) as object)).toBe('{}');
    fc.assert(fc.property(fc.anything({ withBigInt: true, withMap: true, withSet: true, withDate: true, withNullPrototype: true }), (v) => {
      expect(toStringSafe(v)).not.toContain('[object ');
    }));
  });
  it('toArray/toSet/toMap/toPlainObject', () => {
    const arr = [1, 2];
    expect(toArray(arr)).not.toBe(arr);
    expect(toArray(arr)).toEqual([1, 2]);
    expect(toArray(null)).toEqual([]);
    expect(toArray('ab')).toEqual(['ab']);
    expect(toArray(new Set([1, 2]))).toEqual([1, 2]);
    expect(toArray(new Map([['a', 1]]))).toEqual([['a', 1]]);
    expect(toArray(5)).toEqual([5]);
    expect(toArray((function* g() { yield 1; yield 2; })())).toEqual([1, 2]);
    expect([...toSet([1, 1, 2])]).toEqual([1, 2]);
    expect(toSet(undefined).size).toBe(0);
    expect(toMap({ a: 1 })?.get('a')).toBe(1);
    expect(toMap([['k', 2]] as const)?.get('k')).toBe(2);
    expect(toMap(null)?.size).toBe(0);
    expect(toMap([1, 2] as unknown)).toBeUndefined();
    expect(toMap(5 as unknown)).toBeUndefined();
    expect(toPlainObject(new Map([['a', 1]]))).toEqual({ a: 1 });
    expect(toPlainObject([['a', 1]] as unknown)).toEqual({ a: 1 });
    expect(toPlainObject([1, 2] as unknown)).toBeUndefined();
    expect(toPlainObject(new Set([['a', 1]]))).toEqual({ a: 1 });
    expect(toPlainObject(new Map([['__proto__', { polluted: 1 }]]))).toBeUndefined();
    expect(toPlainObject(new Map([[{}, 1]]))).toBeUndefined();
    const fromJson = toPlainObject(JSON.parse('{"__proto__":{"polluted":1}}'));
    expect(Object.getPrototypeOf(fromJson)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    class C { a = 1; }
    expect(toPlainObject(new C())).toEqual({ a: 1 });
    expect(toPlainObject(5)).toBeUndefined();
  });
});

describe('convert: coerce', () => {
  it('coerces single values', () => {
    expect(coerce('42', 'integer')).toBe(42);
    expect(coerce('x', 'number')).toBeUndefined();
    expect(coerce('yes', 'boolean')).toBe(true);
    expect(coerce(5, 'string')).toBe('5');
    expect(coerce({}, 'string')).toBeUndefined();
    expect(coerce('2026-01-01', 'date')?.getTime()).toBe(Date.UTC(2026, 0, 1));
    expect(coerce('9', 'bigint')).toBe(9n);
    expect(coerce(1, 'array')).toEqual([1]);
    expect(coerce('9007199254740993', 'safe-integer')).toBeUndefined();
  });
  it('coerces records with field errors', () => {
    const r = coerceFields({ age: '42', active: 'yes', note: ' ' }, { age: 'integer', active: 'boolean', note: { kind: 'string', optional: true } });
    expect(r).toEqual({ ok: true, value: { age: 42, active: true, note: undefined } });
    const bad = coerceFields({ age: 'old', extra: 1 }, { age: 'integer', active: 'boolean' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe('HLP_CONVERT_FIELDS');
      expect(bad.error.fields).toEqual({ age: 'Expected integer.', active: 'Required.' });
    }
    const inherited = coerceFields(Object.create({ age: '1' }) as object, { age: 'integer' });
    expect(inherited.ok).toBe(false);
    expect(code(() => coerceFields({}, { __proto__: 'string' } as unknown as Record<string, 'string'>))).toBeUndefined();
    expect(code(() => coerceFields({}, JSON.parse('{"__proto__":"string"}') as Record<string, 'string'>))).toBe('HLP_UNSAFE_KEY');
  });
});
