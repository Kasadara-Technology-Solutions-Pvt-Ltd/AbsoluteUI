import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { IntervalTree, SortedMap, SortedSet, type IntervalEntry } from '@absoluteui/helpers/ds';
import { HelperError, ValidationError } from '@absoluteui/helpers/error';

const num = (a: number, b: number): number => a - b;

describe('SortedMap', () => {
  it('matches a sorted-array oracle under random operations (property)', () => {
    const op = fc.tuple(fc.constantFrom('set', 'delete', 'get', 'floor', 'ceiling', 'lower', 'higher', 'between', 'shift', 'pop'), fc.integer({ min: -50, max: 50 }), fc.integer({ min: -50, max: 50 }));
    fc.assert(
      fc.property(fc.array(op, { maxLength: 400 }), (ops) => {
        const m = new SortedMap<number, number>();
        const oracle = new Map<number, number>();
        const keys = (): number[] => [...oracle.keys()].sort(num);
        for (const [o, a, b] of ops) {
          switch (o) {
            case 'set': m.set(a, b); oracle.set(a, b); break;
            case 'delete': expect(m.delete(a)).toBe(oracle.delete(a)); break;
            case 'get': expect(m.get(a)).toBe(oracle.get(a)); break;
            case 'floor': expect(m.floor(a)?.[0]).toBe(keys().filter((k) => k <= a).at(-1)); break;
            case 'ceiling': expect(m.ceiling(a)?.[0]).toBe(keys().find((k) => k >= a)); break;
            case 'lower': expect(m.lower(a)?.[0]).toBe(keys().filter((k) => k < a).at(-1)); break;
            case 'higher': expect(m.higher(a)?.[0]).toBe(keys().find((k) => k > a)); break;
            case 'between': {
              const [lo, hi] = a <= b ? [a, b] : [b, a];
              expect([...m.between(lo, hi)].map(([k]) => k)).toEqual(keys().filter((k) => k >= lo && k <= hi));
              expect([...m.between(lo, hi, '()')].map(([k]) => k)).toEqual(keys().filter((k) => k > lo && k < hi));
              break;
            }
            case 'shift': {
              const k = keys()[0];
              expect(m.shift()?.[0]).toBe(k);
              if (k !== undefined) oracle.delete(k);
              break;
            }
            case 'pop': {
              const k = keys().at(-1);
              expect(m.pop()?.[0]).toBe(k);
              if (k !== undefined) oracle.delete(k);
              break;
            }
          }
        }
        expect([...m.keys()]).toEqual(keys());
        expect([...m.values()]).toEqual(keys().map((k) => oracle.get(k)));
        expect([...m.reversed()].map(([k]) => k)).toEqual(keys().reverse());
        expect(m.size).toBe(oracle.size);
        expect(m.first()?.[0]).toBe(keys()[0]);
        expect(m.last()?.[0]).toBe(keys().at(-1));
      }),
      { numRuns: 200 },
    );
  });

  it('stays O(log n): 200k sorted inserts and deletes finish fast without stack overflow', () => {
    const m = new SortedMap<number, number>();
    const t0 = performance.now();
    for (let i = 0; i < 200_000; i++) m.set(i, i);
    for (let i = 0; i < 200_000; i += 2) m.delete(i);
    expect(m.size).toBe(100_000);
    expect(m.first()?.[0]).toBe(1);
    expect(m.floor(1000)?.[0]).toBe(999);
    let count = 0;
    for (const [k] of m) count += k > 0 ? 1 : 0;
    expect(count).toBe(100_000);
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it('supports custom comparers, bounds, and entries()', () => {
    const m = new SortedMap<string, number>([['b', 2], ['A', 1], ['c', 3]], (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    expect([...m.entries()].map(([k]) => k)).toEqual(['A', 'b', 'c']);
    expect(m.has('a')).toBe(true);
    expect([...m.between('a', 'c', '[)')].map(([k]) => k)).toEqual(['A', 'b']);
    expect([...m.between('a', 'c', '(]')].map(([k]) => k)).toEqual(['b', 'c']);
    expect(m.toArray()).toHaveLength(3);
    m.clear();
    expect(m.first()).toBeUndefined();
    expect(m.shift()).toBeUndefined();
    expect(m.pop()).toBeUndefined();
  });

  it('throws on structural modification during iteration but allows value updates', () => {
    const m = new SortedMap<number, string>([[1, 'a'], [2, 'b'], [3, 'c']]);
    for (const [k] of m) m.set(k, 'x');
    expect([...m.values()]).toEqual(['x', 'x', 'x']);
    expect(() => {
      for (const [k] of m) m.delete(k);
    }).toThrow(HelperError);
  });

  it('rejects mixed key types without a comparer', () => {
    const m = new SortedMap<unknown, number>([[1, 1]]);
    expect(() => m.set('1', 2)).toThrow(ValidationError);
  });
});

describe('SortedSet', () => {
  it('orders, dedupes, and answers range queries', () => {
    const s = new SortedSet(['pear', 'apple', 'fig', 'apple']);
    expect(s.size).toBe(3);
    expect(s.toArray()).toEqual(['apple', 'fig', 'pear']);
    expect(s.ceiling('b')).toBe('fig');
    expect(s.floor('g')).toBe('fig');
    expect(s.lower('fig')).toBe('apple');
    expect(s.higher('fig')).toBe('pear');
    expect(s.first()).toBe('apple');
    expect(s.last()).toBe('pear');
    expect([...s.between('b', 'z')]).toEqual(['fig', 'pear']);
    expect([...s.between('apple', 'pear', '()')]).toEqual(['fig']);
    expect([...s.reversed()]).toEqual(['pear', 'fig', 'apple']);
    s.add('fig');
    expect(s.size).toBe(3);
    expect(s.delete('fig')).toBe(true);
    expect(s.has('fig')).toBe(false);
    s.clear();
    expect([...s]).toEqual([]);
  });

  it('equals a sorted unique array (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), fc.array(fc.integer()), (adds, dels) => {
        const s = new SortedSet<number>(adds, num);
        for (const d of dels) s.delete(d);
        const model = [...new Set(adds)].filter((x) => !dels.includes(x)).sort(num);
        expect(s.toArray()).toEqual(model);
      }),
    );
  });
});

describe('IntervalTree', () => {
  const brute = (items: IntervalEntry<number>[], qs: number, qe: number, half: boolean): number[] =>
    items.filter((i) => (half ? i.start < qe && i.end > qs : i.start <= qe && i.end >= qs)).map((i) => i.value).sort(num);
  const brutePoint = (items: IntervalEntry<number>[], p: number, half: boolean): number[] =>
    items.filter((i) => (half ? i.start <= p && i.end > p : i.start <= p && i.end >= p)).map((i) => i.value).sort(num);

  it('matches brute force under random inserts, removes, and queries (property)', () => {
    const interval = fc.tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 30 }));
    fc.assert(
      fc.property(fc.constantFrom<'[]' | '[)'>('[]', '[)'), fc.array(interval, { maxLength: 120 }), fc.array(fc.nat(), { maxLength: 40 }), fc.array(interval, { maxLength: 30 }), (bounds, adds, removes, queries) => {
        const t = new IntervalTree<number>({ bounds });
        let live: IntervalEntry<number>[] = adds.map(([s, len], i) => t.insert(s, s + len, i));
        for (const r of removes) {
          if (live.length === 0) break;
          const victim = live[r % live.length]!;
          expect(t.remove(victim)).toBe(true);
          expect(t.remove(victim)).toBe(false);
          live = live.filter((e) => e !== victim);
        }
        expect(t.size).toBe(live.length);
        const half = bounds === '[)';
        for (const [s, len] of queries) {
          const got = t.search(s, s + len);
          expect(got.map((e) => e.value).sort(num)).toEqual(brute(live, s, s + len, half));
          for (let i = 1; i < got.length; i++) expect(got[i]!.start).toBeGreaterThanOrEqual(got[i - 1]!.start);
          expect(t.searchPoint(s).map((e) => e.value).sort(num)).toEqual(brutePoint(live, s, half));
          expect(t.overlaps(s, s + len)).toBe(brute(live, s, s + len, half).length > 0);
        }
        expect(t.toArray().map((e) => e.start)).toEqual(live.map((e) => e.start).sort(num));
      }),
      { numRuns: 150 },
    );
  });

  it('models back-to-back bookings in half-open mode', () => {
    const t = new IntervalTree<string>({ bounds: '[)' });
    t.insert(9, 10, 'standup');
    t.insert(10, 11, 'review');
    expect(t.search(9.5, 10).map((e) => e.value)).toEqual(['standup']);
    expect(t.searchPoint(10).map((e) => e.value)).toEqual(['review']);
    expect(t.overlaps(11, 12)).toBe(false);
    const closed = new IntervalTree<string>();
    closed.insert(9, 10, 'a');
    closed.insert(10, 11, 'b');
    expect(closed.searchPoint(10).map((e) => e.value)).toEqual(['a', 'b']);
  });

  it('deletes by value, handles infinities and duplicates, validates input', () => {
    const t = new IntervalTree<string>();
    t.insert(0, Infinity, 'open');
    t.insert(-Infinity, 5, 'past');
    t.insert(1, 2, 'x');
    t.insert(1, 2, 'x');
    expect(t.searchPoint(1e9).map((e) => e.value)).toEqual(['open']);
    expect(t.search(1, 1)).toHaveLength(4);
    expect(t.delete(1, 2, 'x')).toBe(true);
    expect(t.delete(1, 2, 'nope')).toBe(false);
    expect(t.size).toBe(3);
    expect(() => t.insert(2, 1, 'bad')).toThrow(ValidationError);
    expect(() => t.insert(Number.NaN, 1, 'bad')).toThrow(ValidationError);
    expect(() => t.searchPoint(Number.NaN)).toThrow(ValidationError);
    expect(t.remove({ start: 0, end: 1, value: 'forged' })).toBe(false);
    t.clear();
    expect([...t]).toEqual([]);
  });

  it('handles 100k intervals in O(log n + k)', () => {
    const t = new IntervalTree<number>();
    for (let i = 0; i < 100_000; i++) t.insert(i, i + 5, i);
    const t0 = performance.now();
    for (let q = 0; q < 10_000; q++) expect(t.searchPoint(q * 7).length).toBeLessThanOrEqual(6);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
