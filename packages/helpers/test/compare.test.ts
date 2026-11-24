import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  allPass, anyPass, between, by, coalesce, coalesceBlank, compareValues, complement, composeComparers, cond, equals, ifElse, inRange, isAscending, isDescending,
  isEqualBy, match, maxOf, minOf, naturalCompare, nonePass, onePass, reverseComparer, thenBy, unless, when,
} from '@absoluteui/helpers/compare';

describe('compare: comparers', () => {
  it('compares typed values with nulls last', () => {
    expect([3, null, 1, NaN, 2].sort(compareValues)).toEqual([1, 2, 3, null, NaN]);
    expect(compareValues(undefined, NaN)).toBe(-1);
    expect(compareValues(null, undefined)).toBe(-1);
    expect(compareValues(undefined, 1)).toBe(1);
    expect([3, null, 1].sort((a, b) => compareValues(a, b, { nulls: 'first' }))).toEqual([null, 1, 3]);
    expect(compareValues('b', 'a')).toBe(1);
    expect(compareValues(new Date(1), new Date(2))).toBe(-1);
    expect(compareValues(10n, 9)).toBe(1);
    expect(compareValues(false, true)).toBe(-1);
    expect(compareValues(2**53, 2n ** 53n)).toBe(0);
    expect(['b', 1, true, new Date(0)].sort(compareValues)).toEqual([true, 1, 'b', new Date(0)]);
    const de = new Intl.Collator('de');
    expect(['z', 'ä', 'a'].sort((a, b) => compareValues(a, b, { collator: de }))).toEqual(['a', 'ä', 'z']);
  });
  it('is a total preorder on mixed values (property)', () => {
    const v = fc.oneof(fc.integer(), fc.double(), fc.string(), fc.boolean(), fc.constant(null), fc.constant(undefined), fc.bigInt(), fc.date());
    fc.assert(fc.property(v, v, v, (a, b, c) => {
      expect(Math.sign(compareValues(a, b))).toBe(-Math.sign(compareValues(b, a)) || 0);
      if (compareValues(a, b) <= 0 && compareValues(b, c) <= 0) expect(compareValues(a, c)).toBeLessThanOrEqual(0);
    }));
  });
  it('builds, chains, composes and reverses comparers', () => {
    const rows = [{ n: 'b', a: 2 }, { n: 'a', a: 2 }, { n: 'c', a: null }, { n: 'd', a: 1 }];
    expect(rows.slice().sort(by((r) => r.a, { direction: 'desc' })).map((r) => r.n)).toEqual(['b', 'a', 'd', 'c']);
    expect(rows.slice().sort(thenBy(by((r) => r.a), (r) => r.n)).map((r) => r.n)).toEqual(['d', 'a', 'b', 'c']);
    expect(rows.slice().sort(composeComparers(by((r) => r.a, { nulls: 'first' }), by((r) => r.n, { direction: 'desc' }))).map((r) => r.n)).toEqual(['c', 'd', 'b', 'a']);
    expect([1, 3, 2].sort(reverseComparer(compareValues))).toEqual([3, 2, 1]);
    expect(reverseComparer(compareValues)(1, 1)).toBe(0);
  });
  it('natural compare is numeric-aware', () => {
    expect(['file10', 'file2', 'file1'].sort(naturalCompare)).toEqual(['file1', 'file2', 'file10']);
    expect(naturalCompare('a', 'A', { sensitivity: 'base' })).toBe(0);
    expect(naturalCompare('ä', 'z', { locale: 'sv' })).toBe(1);
  });
  it('min/max and order checks', () => {
    expect(minOf([3, 1, 2])).toBe(1);
    expect(maxOf(['file2', 'file10'], naturalCompare)).toBe('file10');
    expect(minOf<number>([])).toBeUndefined();
    expect(minOf([{ k: 1, id: 'a' }, { k: 1, id: 'b' }], by((x) => x.k))?.id).toBe('a');
    expect(isAscending([1, 2, 2, 3])).toBe(true);
    expect(isAscending([1, 2, 2], { strict: true })).toBe(false);
    expect(isDescending([3, 2, 1], { strict: true })).toBe(true);
    expect(isAscending([])).toBe(true);
    fc.assert(fc.property(fc.array(fc.integer()), (arr) => {
      expect(isAscending(arr.slice().sort(compareValues))).toBe(true);
    }));
  });
});

describe('compare: values', () => {
  it('equals, between, inRange, coalesce', () => {
    expect(equals(NaN, NaN)).toBe(true);
    expect(equals(0, -0)).toBe(true);
    expect(equals({ a: 1 }, { a: 1 })).toBe(false);
    expect(equals({ a: [1] }, { a: [1] }, { deep: true })).toBe(true);
    expect(between(5, 1, 5)).toBe(true);
    expect(between(5, 1, 5, { inclusive: 'left' })).toBe(false);
    expect(between(1, 1, 5, { inclusive: false })).toBe(false);
    expect(between('m', 'a', 'z')).toBe(true);
    expect(between(new Date(5), new Date(0), new Date(10))).toBe(true);
    expect(between(null, 0, 1)).toBe(false);
    expect(inRange(3, 0, 3)).toBe(false);
    expect(inRange(0, 0, 3)).toBe(true);
    expect(coalesce(undefined, null, 0, 1)).toBe(0);
    expect(coalesce<number | null | undefined>(null, undefined)).toBeUndefined();
    expect(coalesceBlank('  ', null, '', 'x')).toBe('x');
    expect(isEqualBy((u: { id: number }) => u.id)({ id: 1 }, { id: 1 })).toBe(true);
  });
});

describe('compare: control flow', () => {
  it('match returns the first matching case lazily', () => {
    const label = (s: number): string => match<number, string>(s).with(200, () => 'ok').with((x) => x >= 500, () => 'server').otherwise(() => 'other');
    expect([200, 503, 404].map(label)).toEqual(['ok', 'server', 'other']);
    let evaluated = false;
    match(1).with(1, () => 'a').with(() => { evaluated = true; return true; }, () => 'b').otherwise(() => 'c');
    expect(evaluated).toBe(false);
    const isStr = (v: unknown): v is string => typeof v === 'string';
    expect(match<unknown, number>('abc').with(isStr, (s) => s.length).otherwise(() => -1)).toBe(3);
    expect(match(NaN).with(NaN, () => 'nan').otherwise(() => 'no')).toBe('nan');
  });
  it('when/unless/cond/ifElse', () => {
    expect([1, -2].map(when((n: number) => n < 0, (n) => -n))).toEqual([1, 2]);
    expect(unless((s: string) => s.endsWith('/'), (s) => `${s}/`)('a')).toBe('a/');
    const grade = cond<number, string>([[(n) => n >= 90, () => 'A'], [(n) => n >= 80, () => 'B']], () => 'C');
    expect([95, 85, 10].map(grade)).toEqual(['A', 'B', 'C']);
    expect(cond<number, string>([[(n) => n > 0, () => 'pos']])(-1)).toBeUndefined();
    expect(ifElse((n: number) => n % 2 === 0, () => 'even', () => 'odd')(3)).toBe('odd');
  });
  it('predicate combinators', () => {
    const pos = (n: number): boolean => n > 0;
    const small = (n: number): boolean => n < 10;
    expect(allPass([pos, small])(5)).toBe(true);
    expect(allPass<number>([])(5)).toBe(true);
    expect(anyPass([pos, small])(-1)).toBe(true);
    expect(anyPass<number>([])(1)).toBe(false);
    expect(nonePass([pos])(-1)).toBe(true);
    expect(onePass([pos, small])(20)).toBe(true);
    expect(onePass([pos, small])(5)).toBe(false);
    expect([1, 2].filter(complement((n: number) => n % 2 === 0))).toEqual([1]);
  });
});
