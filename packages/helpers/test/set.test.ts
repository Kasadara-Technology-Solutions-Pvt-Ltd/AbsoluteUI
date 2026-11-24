import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  cartesianProduct, countOccurrences, except, exceptBy, intersect, intersectBy, isDisjoint, isDisjointBy, isSubset, isSubsetBy, isSuperset, isSupersetBy,
  multisetExcept, multisetIntersect, multisetUnion, powerSet, setEquals, setEqualsBy, symmetricDifference, symmetricDifferenceBy, union, unionBy,
} from '@absoluteui/helpers/set';
import { LimitError } from '@absoluteui/helpers/error';
import type { HelperError } from '@absoluteui/helpers/error';

// Naive oracle: first-occurrence order via indexOf, SameValueZero via includes.
const dedupe = <T>(a: readonly T[]): T[] => a.filter((x, i) => a.findIndex((y) => Object.is(x, y) || (x === y)) === i);
const oracle = {
  union: <T>(a: T[], b: T[]): T[] => dedupe([...a, ...b]),
  intersect: <T>(a: T[], b: T[]): T[] => dedupe(a).filter((x) => b.includes(x)),
  except: <T>(a: T[], b: T[]): T[] => dedupe(a).filter((x) => !b.includes(x)),
  symmetric: <T>(a: T[], b: T[]): T[] => [...dedupe(a).filter((x) => !b.includes(x)), ...dedupe(b).filter((x) => !a.includes(x))],
};
const sorted = (a: readonly number[]): number[] => [...a].sort((x, y) => x - y);
const small = fc.array(fc.integer({ min: 0, max: 12 }), { maxLength: 15 });

/** Runs `fn` with the ES2025 Set methods removed, to exercise the fallbacks. */
function withoutNativeSetMethods(fn: () => void): void {
  const names = ['union', 'intersection', 'difference', 'symmetricDifference', 'isSubsetOf', 'isSupersetOf', 'isDisjointFrom'] as const;
  const proto = Set.prototype as unknown as Record<string, unknown>;
  const saved = names.map((n) => [n, Object.getOwnPropertyDescriptor(proto, n)] as const);
  try {
    for (const n of names) Reflect.deleteProperty(proto, n);
    fn();
  } finally {
    for (const [n, d] of saved) if (d) Object.defineProperty(proto, n, d);
  }
}

describe('set operations', () => {
  it('computes basics on arrays in first-occurrence order', () => {
    expect(union([1, 2, 2], [3, 2])).toEqual([1, 2, 3]);
    expect(intersect([3, 1, 2, 3], [2, 3])).toEqual([3, 2]);
    expect(except([1, 2, 3, 1], [2])).toEqual([1, 3]);
    expect(symmetricDifference([1, 2], [2, 3])).toEqual([1, 3]);
    expect(union([NaN], [NaN])).toEqual([NaN]);
    expect(union([], [])).toEqual([]);
  });
  it('returns a Set when the first argument is a Set', () => {
    const r = union(new Set([1]), [2]);
    expect(r).toBeInstanceOf(Set);
    expect([...r]).toEqual([1, 2]);
    expect([...intersect(new Set([3, 1, 2]), new Set([2, 3, 9, 10]))]).toEqual([3, 2]);
    // Larger `a` must still keep a's order (native intersection would follow b).
    expect([...intersect(new Set([1, 2, 3, 4]), new Set([4, 2]))]).toEqual([2, 4]);
    expect([...except(new Set([1, 2]), new Set([2]))]).toEqual([1]);
    expect([...symmetricDifference(new Set([1, 2]), new Set([2, 3]))]).toEqual([1, 3]);
    expect(unionBy(new Set([{ id: 1 }]), [{ id: 1 }], (x) => x.id)).toBeInstanceOf(Set);
  });
  it('supports key selectors keeping the first item per key', () => {
    const a = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 1, v: 'dup' }];
    const b: { id: number; v?: string }[] = [{ id: 1, v: 'x' }, { id: 3, v: 'y' }];
    expect(unionBy(a, b, (x) => x.id).map((x) => x.v)).toEqual(['a', 'b', 'y']);
    expect(intersectBy(a, b, (x) => x.id).map((x) => x.v)).toEqual(['a']);
    expect(exceptBy(a, b, (x) => x.id).map((x) => x.v)).toEqual(['b']);
    expect(symmetricDifferenceBy(a, b, (x) => x.id).map((x) => x.v)).toEqual(['b', 'y']);
    expect(isSubsetBy([{ id: 1 }], b, (x) => x.id)).toBe(true);
    expect(isSupersetBy(b, [{ id: 3 }], (x) => x.id)).toBe(true);
    expect(isDisjointBy([{ id: 9 }], b, (x) => x.id)).toBe(true);
    expect(setEqualsBy([{ id: 1 }, { id: 3 }], b, (x) => x.id)).toBe(true);
    expect(setEqualsBy([{ id: 1 }], b, (x) => x.id)).toBe(false);
    const ci = (s: string): string => s.toLowerCase();
    expect(unionBy(['A', 'b'], ['a', 'C'], ci)).toEqual(['A', 'b', 'C']);
  });
  it('checks relations', () => {
    expect(isSubset([1, 2], [1, 2, 3])).toBe(true);
    expect(isSubset([], [])).toBe(true);
    expect(isSubset([1, 4], new Set([1, 2]))).toBe(false);
    expect(isSuperset([1, 2, 3], [2])).toBe(true);
    expect(isDisjoint([1, 2], [3])).toBe(true);
    expect(isDisjoint(new Set([1, 2]), [2])).toBe(false);
    expect(setEquals([1, 2, 2], new Set([2, 1]))).toBe(true);
    expect(setEquals([1], [1, 2])).toBe(false);
  });
  it('matches the naive oracle with native methods and fallbacks', () => {
    const check = (): void => {
      fc.assert(fc.property(small, small, (a, b) => {
        expect(union(a, b)).toEqual(oracle.union(a, b));
        expect(intersect(a, b)).toEqual(oracle.intersect(a, b));
        expect(except(a, b)).toEqual(oracle.except(a, b));
        expect(symmetricDifference(a, b)).toEqual(oracle.symmetric(a, b));
        const [sa, sb] = [new Set(a), new Set(b)];
        expect([...union(sa, sb)]).toEqual(oracle.union(a, b));
        expect([...intersect(sa, sb)]).toEqual(oracle.intersect(a, b));
        expect([...except(sa, sb)]).toEqual(oracle.except(a, b));
        expect([...symmetricDifference(sa, sb)]).toEqual(oracle.symmetric(a, b));
        expect(isSubset(a, b)).toBe(a.every((x) => b.includes(x)));
        expect(isDisjoint(sa, sb)).toBe(!a.some((x) => b.includes(x)));
        expect(unionBy(a, b, (x) => x)).toEqual(union(a, b));
        expect(intersectBy(a, b, (x) => x)).toEqual(intersect(a, b));
        expect(exceptBy(a, b, (x) => x)).toEqual(except(a, b));
        expect(symmetricDifferenceBy(a, b, (x) => x)).toEqual(symmetricDifference(a, b));
      }));
    };
    check();
    withoutNativeSetMethods(check);
  });
  it('satisfies algebraic laws', () => {
    fc.assert(fc.property(small, small, small, (a, b, c) => {
      const U = union(union(a, b), c);
      // Commutativity (as sets), associativity, idempotence.
      expect(setEquals(union(a, b), union(b, a))).toBe(true);
      expect(setEquals(intersect(a, b), intersect(b, a))).toBe(true);
      expect(union(union(a, b), c)).toEqual(union(a, union(b, c)));
      expect(sorted(intersect(intersect(a, b), c))).toEqual(sorted(intersect(a, intersect(b, c))));
      expect(union(a, a)).toEqual(dedupe(a));
      expect(intersect(a, a)).toEqual(dedupe(a));
      // De Morgan relative to the universe U.
      expect(setEquals(except(U, union(a, b)), intersect(except(U, a), except(U, b)))).toBe(true);
      expect(setEquals(except(U, intersect(a, b)), union(except(U, a), except(U, b)))).toBe(true);
      // Symmetric difference = (a ∪ b) \ (a ∩ b); subset relations.
      expect(setEquals(symmetricDifference(a, b), except(union(a, b), intersect(a, b)))).toBe(true);
      expect(isSubset(intersect(a, b), a)).toBe(true);
      expect(isSuperset(union(a, b), b)).toBe(true);
      expect(isDisjoint(except(a, b), b)).toBe(true);
    }));
  });
});

describe('combinatorics', () => {
  it('builds cartesian products with a limit', () => {
    expect(cartesianProduct([[1, 2], ['a', 'b']])).toEqual([[1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']]);
    expect(cartesianProduct([[1, 2], []])).toEqual([]);
    expect(cartesianProduct([])).toEqual([]);
    expect(cartesianProduct([new Set([1]), 'xy'])).toEqual([[1, 'x'], [1, 'y']]);
    const big = Array.from({ length: 1000 }, (_, i) => i);
    expect(() => cartesianProduct([big, big, big])).toThrow(LimitError);
    try {
      cartesianProduct([big, big], { maxSize: 10 });
    } catch (e) {
      expect((e as HelperError).code).toBe('HLP_SET_PRODUCT_TOO_LARGE');
    }
    fc.assert(fc.property(fc.array(small, { maxLength: 4 }), (lists) => {
      const r = cartesianProduct(lists);
      expect(r).toHaveLength(lists.length ? lists.reduce((n, l) => n * l.length, 1) : 0);
    }));
  });
  it('builds power sets with a limit', () => {
    expect(powerSet(['a', 'b'])).toEqual([[], ['a'], ['b'], ['a', 'b']]);
    expect(powerSet(['a', 'a'])).toEqual([[], ['a']]);
    expect(powerSet(new Set(Array.from({ length: 10 }, (_, i) => i)))).toHaveLength(1024);
    expect(() => powerSet(Array.from({ length: 21 }, (_, i) => i))).toThrow(LimitError);
    expect(() => powerSet(Array.from({ length: 31 }, (_, i) => i), { maxItems: 100 })).toThrow(LimitError);
  });
  it('counts and combines multisets', () => {
    expect([...countOccurrences(['a', 'b', 'a'])]).toEqual([['a', 2], ['b', 1]]);
    expect(multisetUnion([1, 1, 2], [1, 2, 2])).toEqual([1, 1, 2, 2]);
    expect(multisetIntersect([1, 1, 2], [1, 3])).toEqual([1]);
    expect(multisetExcept([1, 1, 2], [1])).toEqual([1, 2]);
    fc.assert(fc.property(small, small, (a, b) => {
      const total = (xs: number[]): number => xs.length;
      expect(total(multisetUnion(a, b)) + total(multisetIntersect(a, b))).toBe(a.length + b.length);
      expect(total(multisetExcept(a, b)) + total(multisetIntersect(a, b))).toBe(a.length);
    }));
  });
});
