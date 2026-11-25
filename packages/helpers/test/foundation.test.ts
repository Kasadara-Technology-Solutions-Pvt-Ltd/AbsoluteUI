import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { HelperError, HttpError, ValidationError, deserializeError, fieldErrors, serializeError, toError, tryCatch, combineResults, ok, err } from '@absoluteui/helpers/error';
import { isEmpty, isPlainObject, isIterable, isOneOf, assertString } from '@absoluteui/helpers/is';
import { addDays, formatPlainDate, fromEpochDay, isoWeekday, parsePlainDate, plainDate, toEpochDay, daysBetween, plainDateFromInstant } from '../src/date/plain-date.js';
import { assertSafeKey } from '../src/internal/keys.js';

describe('error', () => {
  it('serializes and round-trips without stacks by default', () => {
    const e = new HttpError('HLP_HTTP', 'Failed.', { status: 503, cause: new ValidationError('HLP_V', 'Bad.', { fields: { a: 'Required.' } }) });
    const s = serializeError(e);
    expect(s).toMatchObject({ name: 'HttpError', status: 503, code: 'HLP_HTTP', cause: { code: 'HLP_V', fields: { a: 'Required.' } } });
    expect(s.stack).toBeUndefined();
    const back = deserializeError(JSON.parse(JSON.stringify(s)));
    expect(back).toBeInstanceOf(HttpError);
    expect(back instanceof HttpError ? back.status : undefined).toBe(503);
  });
  it('normalizes non-errors and captures throws', () => {
    expect(toError('x')).toBeInstanceOf(HelperError);
    const r = tryCatch(() => { throw new Error('boom'); });
    expect(r.ok).toBe(false);
    expect(combineResults([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(combineResults([ok(1), err('e')])).toEqual(err('e'));
  });
  it('builds field error maps', () => {
    expect(fieldErrors([new ValidationError('V', 'x', { fields: { email: 'Invalid.' } }), new Error('Server down.')])).toEqual({ email: 'Invalid.', _form: 'Server down.' });
  });
});

describe('is', () => {
  it('guards', () => {
    expect(isEmpty({})).toBe(true);
    expect(isEmpty(0)).toBe(false);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isIterable('ab')).toBe(true);
    expect(isOneOf('a', ['a', 'b'] as const)).toBe(true);
    expect(() => { assertString(1); }).toThrow(ValidationError);
  });
  it('blocks unsafe keys', () => {
    expect(() => { assertSafeKey('__proto__'); }).toThrow();
  });
});

describe('plain-date', () => {
  it('epoch day round-trips against Date for any day', () => {
    fc.assert(fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), (n) => {
      const d = fromEpochDay(n);
      const js = new Date(n * 86_400_000);
      expect([d.year, d.month, d.day]).toEqual([js.getUTCFullYear(), js.getUTCMonth() + 1, js.getUTCDate()]);
      expect(toEpochDay(d)).toBe(n);
      expect(isoWeekday(d)).toBe(((js.getUTCDay() + 6) % 7) + 1);
    }));
  });
  it('parses strictly', () => {
    expect(parsePlainDate('2024-02-29')).toEqual(plainDate(2024, 2, 29));
    for (const bad of ['2023-02-29', '2026-9-29', '2026-09-29T00:00', ' 2026-09-29', '20260929']) expect(parsePlainDate(bad)).toBeUndefined();
    expect(formatPlainDate(plainDate(-5, 1, 1))).toBe('-000005-01-01');
    expect(addDays('2026-12-31', 1)).toEqual(plainDate(2027, 1, 1));
    expect(daysBetween('2026-01-01', '2025-12-25')).toBe(-7);
  });
  it('reads the date of an instant in a zone', () => {
    const ms = Date.UTC(2026, 0, 1, 20, 0);
    expect(plainDateFromInstant(ms, 'Asia/Kolkata')).toEqual(plainDate(2026, 1, 2));
    expect(plainDateFromInstant(ms, 'America/New_York')).toEqual(plainDate(2026, 1, 1));
  });
});
