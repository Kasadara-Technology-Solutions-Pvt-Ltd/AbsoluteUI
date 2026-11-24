import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  Enumerable, aggregate, all, any, append, average, chunk, concat, contains, count, defaultIfEmpty, distinct, distinctBy, elementAt, elementAtOrDefault, empty,
  except, exceptBy, first, firstOrDefault, forEach, from, groupBy, groupJoin, intersect, intersectBy, join, last, lastOrDefault, leftJoin, max, maxBy, min,
  minBy, orderBy, orderByDescending, pipe, prepend, range, repeat, reverse, select, selectMany, sequenceEqual, single, singleOrDefault, skip, skipLast,
  skipWhile, sum, take, takeLast, takeWhile, thenBy, thenByDescending, toArray, toDictionary, toLookup, toMap, toSet, union, unionBy, where, whereType, zip,
} from '@absoluteui/helpers/linq';
import { HelperError } from '@absoluteui/helpers/error';

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof HelperError ? e.code : 'non-helper-error';
  }
  return undefined;
};

/** Re-iterable source that counts how many items have been pulled. */
function counting<T>(items: readonly T[]): Iterable<T> & { pulled: number } {
  const src = {
    pulled: 0,
    *[Symbol.iterator](): Generator<T> {
      for (const x of items) {
        src.pulled++;
        yield x;
      }
    },
  };
  return src;
}

function* naturals(): Generator<number> {
  for (let i = 0; ; i++) yield i;
}

interface Person { name: string; dept: string | null; age: number }
const people: Person[] = [
  { name: 'Ann', dept: 'HR', age: 40 },
  { name: 'Bob', dept: 'IT', age: 30 },
  { name: 'Cid', dept: 'HR', age: 30 },
  { name: 'Dee', dept: null, age: 25 },
];

describe('laziness and re-iteration', () => {
  it('evaluates nothing before a terminal and stops early with take', () => {
    const src = counting([1, 2, 3, 4, 5, 6]);
    let mapped = 0;
    const q = from(src).where((n) => n % 2 === 0).select((n) => (mapped++, n * 10)).take(2);
    expect(src.pulled).toBe(0);
    expect(mapped).toBe(0);
    expect(q.toArray()).toEqual([20, 40]);
    expect(src.pulled).toBe(4);
    expect(mapped).toBe(2);
    const p = pipe(src, where((n: number) => n > 0), take(1));
    src.pulled = 0;
    expect(src.pulled).toBe(0);
    expect([...p]).toEqual([1]);
    expect(src.pulled).toBe(1);
  });
  it('re-runs the pipeline on each iteration', () => {
    const src = counting([3, 1, 2]);
    const q = from(src).orderBy((n) => n).select((n) => n * 2);
    expect(src.pulled).toBe(0);
    expect(q.toArray()).toEqual([2, 4, 6]);
    expect(q.toArray()).toEqual([2, 4, 6]);
    expect(src.pulled).toBe(6);
    expect([...q]).toEqual([2, 4, 6]);
  });
  it('works on infinite sequences where the operator allows', () => {
    expect(from(naturals()).where((n) => n % 3 === 0).skip(1).take(3).toArray()).toEqual([3, 6, 9]);
    expect(from(naturals()).first((n) => n > 100)).toBe(101);
    expect(from(naturals()).any((n) => n === 5)).toBe(true);
    expect(from(naturals()).takeWhile((n) => n < 3).toArray()).toEqual([0, 1, 2]);
    expect(from(naturals()).zip(['a', 'b']).toArray()).toEqual([[0, 'a'], [1, 'b']]);
    expect(from(naturals()).chunk(2).take(2).toArray()).toEqual([[0, 1], [2, 3]]);
    expect(from(naturals()).sequenceEqual([0, 1, 5])).toBe(false);
  });
  it('closes the source iterator when stopping early', () => {
    let closed = 0;
    const src: Iterable<number> = {
      [Symbol.iterator]() {
        let i = 0;
        return { next: () => ({ done: false, value: i++ }), return: () => (closed++, { done: true, value: undefined }) };
      },
    };
    expect(from(src).take(2).toArray()).toEqual([0, 1]);
    expect(from(src).zip([1]).count()).toBe(1);
    expect(closed).toBe(2);
  });
});

describe('pipeable operators', () => {
  it('composes with pipe and infers types', () => {
    const r: string[] = pipe([5, 1, 4, 2], where((n) => n > 1), orderBy((n) => n), select((n, i) => `${i}:${n}`), toArray());
    expect(r).toEqual(['0:2', '1:4', '2:5']);
    const total: number = pipe(people, select((p) => p.age), sum());
    expect(total).toBe(125);
    expect(pipe([1, 'a', 2, null], whereType((x): x is number => typeof x === 'number'), toArray())).toEqual([1, 2]);
    expect(pipe(people, orderBy((p) => p.age), thenByDescending((p) => p.name), select((p) => p.name), toArray())).toEqual(['Dee', 'Cid', 'Bob', 'Ann']);
    expect(pipe(people, orderByDescending((p) => p.age), thenBy((p) => p.name), first()).name).toBe('Ann');
    expect(pipe([[1, 2], [3]], selectMany((a) => a), toArray())).toEqual([1, 2, 3]);
    expect(pipe(['ab', 'c'], selectMany((s) => s, (s, ch) => `${s}/${ch}`), toArray())).toEqual(['ab/a', 'ab/b', 'c/c']);
    expect(pipe([1, 2, 3], count())).toBe(3);
    expect(pipe(new Set([1, 2]), count())).toBe(2);
    expect(pipe([1, 2, 3], count((n) => n > 1))).toBe(2);
    expect(pipe(people, select((p) => p.name), toSet()).size).toBe(4);
    expect(pipe([1, 2, 3], take(0), toArray())).toEqual([]);
  });
  it('groups, joins and looks up', () => {
    const groups = pipe(people, groupBy((p) => p.dept), select((g) => [g.key, g.items.map((p) => p.name)] as const), toArray());
    expect(groups).toEqual([['HR', ['Ann', 'Cid']], ['IT', ['Bob']], [null, ['Dee']]]);
    expect(pipe(people, groupBy((p) => p.age, (p) => p.name, (k, names) => `${k}:${names.join('')}`), toArray())).toEqual(['40:Ann', '30:BobCid', '25:Dee']);
    const depts = [{ id: 'HR', title: 'People' }, { id: 'IT', title: 'Tech' }, { id: 'FIN', title: 'Money' }];
    expect(pipe(people, join(depts, (p) => p.dept, (d) => d.id, (p, d) => `${p.name}@${d.title}`), toArray())).toEqual(['Ann@People', 'Bob@Tech', 'Cid@People']);
    expect(pipe(people, leftJoin(depts, (p) => p.dept, (d) => d.id, (p, d) => d?.title ?? '-'), toArray())).toEqual(['People', 'Tech', 'People', '-']);
    expect(pipe(depts, groupJoin(people, (d) => d.id, (p) => p.dept, (d, ps) => `${d.id}:${ps.length}`), toArray())).toEqual(['HR:2', 'IT:1', 'FIN:0']);
    const lookup = pipe(people, toLookup((p) => p.dept, (p) => p.name));
    expect(lookup.get('HR')).toEqual(['Ann', 'Cid']);
    expect(lookup.get('none')).toEqual([]);
    expect(lookup.size).toBe(3);
    expect(lookup.has(null)).toBe(true);
    expect([...lookup].map((g) => g.key)).toEqual(['HR', 'IT', null]);
  });
  it('builds maps and rejects duplicate keys', () => {
    expect(pipe(people, toMap((p) => p.name, (p) => p.age)).get('Bob')).toBe(30);
    expect(pipe(people, toDictionary((p) => p.name)).get('Ann')).toBe(people[0]);
    expect(code(() => pipe(people, toMap((p) => p.dept)))).toBe('HLP_LINQ_DUPLICATE_KEY');
    const m = pipe([{ k: '__proto__' }], toMap((x) => x.k));
    expect(m.get('__proto__')).toEqual({ k: '__proto__' });
    expect(({} as Record<string, unknown>).k).toBeUndefined();
  });
  it('supports set operators, partitioning and composition', () => {
    expect(pipe([1, 1, 2], distinct(), toArray())).toEqual([1, 2]);
    expect(pipe(people, distinctBy((p) => p.age), select((p) => p.name), toArray())).toEqual(['Ann', 'Bob', 'Dee']);
    expect(pipe([1, 2], union([2, 3]), toArray())).toEqual([1, 2, 3]);
    expect(pipe([{ id: 1 }], unionBy([{ id: 1 }, { id: 2 }], (x) => x.id), count())).toBe(2);
    expect(pipe([1, 2, 3, 2], intersect([2, 3]), toArray())).toEqual([2, 3]);
    expect(pipe([{ id: 1 }, { id: 2 }], intersectBy([{ id: 2 }], (x) => x.id), toArray())).toEqual([{ id: 2 }]);
    expect(pipe([1, 2, 3, 1], except([2]), toArray())).toEqual([1, 3]);
    expect(pipe([{ id: 1 }, { id: 2 }], exceptBy([{ id: 2 }], (x) => x.id), toArray())).toEqual([{ id: 1 }]);
    expect(pipe([1], concat([2]), append(3), prepend(0), toArray())).toEqual([0, 1, 2, 3]);
    expect(pipe([1, 2, 3], zip(['a', 'b'], (n, s) => `${s}${n}`), toArray())).toEqual(['a1', 'b2']);
    expect(pipe([] as number[], defaultIfEmpty(0), toArray())).toEqual([0]);
    expect(pipe([1], defaultIfEmpty(0), toArray())).toEqual([1]);
    expect(pipe([1, 2, 3], chunk(2), toArray())).toEqual([[1, 2], [3]]);
    expect(pipe([1, 2, 3], reverse(), toArray())).toEqual([3, 2, 1]);
    expect(pipe([1, 2, 3, 4], skip(1), skipLast(1), toArray())).toEqual([2, 3]);
    expect(pipe([1, 2, 3, 4], takeLast(2), toArray())).toEqual([3, 4]);
    expect(pipe([1, 2, 3], takeLast(0), toArray())).toEqual([]);
    expect(pipe([1, 2, 3], skipLast(0), toArray())).toEqual([1, 2, 3]);
    expect(pipe([1, 2, 5, 1], skipWhile((n) => n < 3), toArray())).toEqual([5, 1]);
    expect(pipe([1, 2, 5, 1], takeWhile((n) => n < 3), toArray())).toEqual([1, 2]);
    for (const bad of [() => take(-1), () => skip(1.5), () => takeLast(NaN), () => skipLast(-2), () => chunk(0)]) expect(code(bad)).toBe('HLP_LINQ_INVALID_ARGUMENT');
  });
  it('accesses elements with HelperError codes', () => {
    expect(pipe([1, 2, 3], first((n) => n > 1))).toBe(2);
    expect(code(() => pipe([], first()))).toBe('HLP_LINQ_NO_ELEMENTS');
    expect(pipe([1], firstOrDefault((n) => n > 5))).toBeUndefined();
    expect(pipe([] as number[], firstOrDefault(undefined, -1))).toBe(-1);
    expect(pipe([1, 2, 3], last((n) => n < 3))).toBe(2);
    expect(code(() => pipe([1], last((n) => n > 1)))).toBe('HLP_LINQ_NO_ELEMENTS');
    expect(pipe([] as number[], lastOrDefault(undefined, 7))).toBe(7);
    expect(pipe([undefined], lastOrDefault(undefined, 7))).toBeUndefined();
    expect(pipe([1, 2], single((n) => n > 1))).toBe(2);
    expect(code(() => pipe([1, 2], single()))).toBe('HLP_LINQ_MULTIPLE_ELEMENTS');
    expect(code(() => pipe([], single()))).toBe('HLP_LINQ_NO_ELEMENTS');
    expect(pipe([] as number[], singleOrDefault())).toBeUndefined();
    expect(code(() => pipe([1, 1], singleOrDefault()))).toBe('HLP_LINQ_MULTIPLE_ELEMENTS');
    expect(pipe([1, 2, 3], elementAt(-1))).toBe(3);
    expect(pipe(new Set([1, 2, 3]), elementAt(1))).toBe(2);
    expect(pipe(new Set([1, 2, 3]), elementAt(-3))).toBe(1);
    expect(code(() => pipe([1], elementAt(1)))).toBe('HLP_LINQ_INDEX_OUT_OF_RANGE');
    expect(code(() => pipe([1], elementAt(0.5)))).toBe('HLP_LINQ_INDEX_OUT_OF_RANGE');
    expect(pipe([1], elementAtOrDefault(5, 0))).toBe(0);
    expect(pipe(naturals(), elementAt(10))).toBe(10);
  });
  it('quantifies and aggregates', () => {
    expect(pipe([1, 2], any())).toBe(true);
    expect(pipe([], any())).toBe(false);
    expect(pipe([], all(() => false))).toBe(true);
    expect(pipe([1, NaN], contains(NaN))).toBe(true);
    expect(pipe([{ a: 1 }], contains({ a: 1 }, (x, y) => x.a === y.a))).toBe(true);
    expect(pipe([1, 2], sequenceEqual(new Set([1, 2])))).toBe(true);
    expect(pipe([1, 2], sequenceEqual([1]))).toBe(false);
    expect(pipe([1], sequenceEqual([1, 2]))).toBe(false);
    expect(pipe([], sum())).toBe(0);
    expect(pipe(people, sum((p) => p.age))).toBe(125);
    expect(pipe([0.1, 0.2, 0.3], sum())).toBe(0.6);
    expect(pipe([1, 2, 3], average())).toBe(2);
    expect(code(() => pipe([], average()))).toBe('HLP_LINQ_NO_ELEMENTS');
    expect(pipe([3, null, 1, 2], min())).toBe(1);
    expect(pipe([3, 1, NaN, 2], max())).toBe(3);
    expect(pipe(people, min((p) => p.name))).toBe('Ann');
    expect(pipe(people, max((p) => p.name, (a, b) => b.localeCompare(a)))).toBe('Ann');
    expect(code(() => pipe([null], min()))).toBe('HLP_LINQ_NO_ELEMENTS');
    expect(pipe(people, minBy((p) => p.age))?.name).toBe('Dee');
    expect(pipe(people, maxBy((p) => p.dept))?.name).toBe('Bob');
    expect(pipe(people, minBy((p) => p.age === 30 ? 0 : 1))?.name).toBe('Bob');
    expect(pipe([] as Person[], maxBy((p) => p.age))).toBeUndefined();
    expect(pipe([1, 2, 3], aggregate((a, b) => a + b))).toBe(6);
    expect(pipe([1, 2, 3], aggregate('', (s, n) => `${s}${n}`))).toBe('123');
    expect(pipe([1, 2], aggregate(0, (a, n) => a + n, (a) => a * 10))).toBe(30);
    expect(code(() => pipe([], aggregate((a: number, b: number) => a + b)))).toBe('HLP_LINQ_NO_ELEMENTS');
    const seen: number[] = [];
    pipe([5, 6], forEach((n, i) => seen.push(n, i)));
    expect(seen).toEqual([5, 0, 6, 1]);
  });
});

describe('fluent Enumerable', () => {
  it('exposes the full surface', () => {
    const q = from(people);
    expect(q).toBeInstanceOf(Enumerable);
    expect(from(q)).toBe(q);
    expect(q.where((p) => p.age >= 30).select((p) => p.name).toArray()).toEqual(['Ann', 'Bob', 'Cid']);
    expect(q.orderBy((p) => p.dept).thenBy((p) => p.name).select((p) => p.name).toArray()).toEqual(['Dee', 'Ann', 'Cid', 'Bob']);
    expect(q.orderByDescending((p) => p.age).thenByDescending((p) => p.name).first().name).toBe('Ann');
    const g = q.groupBy((p) => p.dept).toArray();
    expect(g[0]?.key).toBe('HR');
    expect(g[0]?.count()).toBe(2);
    expect(g[0]?.select((p) => p.name).toArray()).toEqual(['Ann', 'Cid']);
    expect(q.groupBy((p) => p.dept, (p) => p.age).select((x) => x.sum()).toArray()).toEqual([70, 30, 25]);
    expect(q.groupBy((p) => p.dept, (p) => p.age, (k, ages) => `${String(k)}=${ages.max()}`).toArray()).toEqual(['HR=40', 'IT=30', 'null=25']);
    const depts = [{ id: 'HR' }, { id: 'IT' }];
    expect(from(depts).groupJoin(people, (d) => d.id, (p) => p.dept, (d, ps) => ps.select((p) => p.name).toArray().join()).toArray()).toEqual(['Ann,Cid', 'Bob']);
    expect(q.join(depts, (p) => p.dept, (d) => d.id, (p) => p.name).count()).toBe(3);
    expect(q.leftJoin(depts, (p) => p.dept, (d) => d.id, (p, d) => d === undefined).count((x) => x)).toBe(1);
    expect(q.select((p) => p.age).distinct().toArray()).toEqual([40, 30, 25]);
    expect(q.distinctBy((p) => p.dept).count()).toBe(3);
    expect(from([1, 2]).union([2, 3]).unionBy([4], (x) => x).intersect([1, 3, 4]).intersectBy([3, 4], (x) => x).except([4]).exceptBy([9], (x) => x).toArray()).toEqual([3]);
    expect(from([1]).concat([2]).append(3).prepend(0).reverse().toArray()).toEqual([3, 2, 1, 0]);
    expect(from([1, 2]).zip(['a']).toArray()).toEqual([[1, 'a']]);
    expect(from([1, 2]).zip([3, 4], (a, b) => a * b).toArray()).toEqual([3, 8]);
    expect(from([] as number[]).defaultIfEmpty(9).single()).toBe(9);
    expect(from([1, 2, 3, 4, 5]).skip(1).skipWhile((n) => n < 3).skipLast(1).takeLast(1).toArray()).toEqual([4]);
    expect(from([1, 2, 3]).take(2).takeWhile((n) => n < 2).toArray()).toEqual([1]);
    expect(from([1, 2, 3]).chunk(2).toArray()).toEqual([[1, 2], [3]]);
    expect(from([[1], [2, 3]]).selectMany((a) => a).sum()).toBe(6);
    expect(from(['a', 'bc']).selectMany((s) => s, (s, c) => `${s.length}${c}`).toArray()).toEqual(['1a', '2b', '2c']);
    expect(from([1, 'x']).whereType((x): x is string => typeof x === 'string').single()).toBe('x');
    expect(from([1, 2, 3]).where((n) => n > 5).firstOrDefault()).toBeUndefined();
    expect(from([1, 2, 3]).firstOrDefault((n) => n > 5, 0)).toBe(0);
    expect(from([1, 2, 3]).last()).toBe(3);
    expect(from([1, 2, 3]).lastOrDefault((n) => n > 5, -1)).toBe(-1);
    expect(from([1, 2, 3]).singleOrDefault((n) => n > 2)).toBe(3);
    expect(from([1, 2, 3]).elementAt(1)).toBe(2);
    expect(from([1, 2, 3]).elementAtOrDefault(-9)).toBeUndefined();
    expect(from([1, 2, 3]).any((n) => n > 2)).toBe(true);
    expect(from([1, 2, 3]).all((n) => n > 2)).toBe(false);
    expect(from([1, 2, 3]).contains(2)).toBe(true);
    expect(from([1, 2, 3]).sequenceEqual([1, 2, 3])).toBe(true);
    expect(from([1, 2, 3]).average()).toBe(2);
    expect(q.average((p) => p.age)).toBe(31.25);
    expect(q.sum((p) => p.age)).toBe(125);
    expect(from([2, 1]).min()).toBe(1);
    expect(from([2, 1]).max()).toBe(2);
    expect(q.min((p) => p.age)).toBe(25);
    expect(q.max((p) => p.age)).toBe(40);
    expect(q.minBy((p) => p.age)?.name).toBe('Dee');
    expect(q.maxBy((p) => p.age)?.name).toBe('Ann');
    expect(from([1, 2, 3]).aggregate((a, b) => a * b)).toBe(6);
    expect(from([1, 2, 3]).aggregate(10, (a, b) => a + b)).toBe(16);
    expect(from([1, 2, 3]).aggregate(0, (a, b) => a + b, (a) => `${a}`)).toBe('6');
    expect(from([1, 1]).toSet().size).toBe(1);
    expect(q.toMap((p) => p.name).size).toBe(4);
    expect(q.toMap((p) => p.name, (p) => p.age).get('Dee')).toBe(25);
    expect(q.toDictionary((p) => p.name, (p) => p.dept).get('Dee')).toBeNull();
    expect(q.toLookup((p) => p.age).get(30)).toHaveLength(2);
    expect(q.toLookup((p) => p.age, (p) => p.name).get(30)).toEqual(['Bob', 'Cid']);
    expect(q.pipe(where((p: Person) => p.age > 35), count())).toBe(1);
    let n = 0;
    q.forEach(() => n++);
    expect(n).toBe(4);
  });
  it('is covariant in its element type', () => {
    const e: Enumerable<unknown> = from([1]);
    const o: Enumerable<number | string> = from([1]).orderBy((n) => n);
    expect([...e, ...o]).toEqual([1, 1]);
  });
  it('provides static helpers', () => {
    expect(range(1, 3).toArray()).toEqual([1, 2, 3]);
    expect(range(0, 0).toArray()).toEqual([]);
    expect(repeat('x', 2).toArray()).toEqual(['x', 'x']);
    expect(empty<number>().count()).toBe(0);
    expect(range(0, Number.MAX_SAFE_INTEGER).where((i) => i % 1000 === 999).first()).toBe(999);
    expect(code(() => range(0, -1))).toBe('HLP_LINQ_INVALID_ARGUMENT');
    expect(code(() => range(NaN, 1))).toBe('HLP_LINQ_INVALID_ARGUMENT');
    expect(code(() => repeat(1, 1.5))).toBe('HLP_LINQ_INVALID_ARGUMENT');
    const r = range(0, 3);
    expect([...r, ...r]).toEqual([0, 1, 2, 0, 1, 2]);
  });
  it('orders stably with nulls first and custom comparers', () => {
    const rows = [{ k: 'b', i: 0 }, { k: null, i: 1 }, { k: 'a', i: 2 }, { k: 'b', i: 3 }, { k: undefined, i: 4 }];
    expect(from(rows).orderBy((r) => r.k).select((r) => r.i).toArray()).toEqual([1, 4, 2, 0, 3]);
    expect(from(rows).orderByDescending((r) => r.k).select((r) => r.i).toArray()).toEqual([0, 3, 2, 1, 4]);
    const collator = new Intl.Collator('sv');
    expect(from(['ö', 'z', 'a']).orderBy((s) => s, collator.compare).toArray()).toEqual(['a', 'z', 'ö']);
    expect(from(['ö', 'z', 'a']).orderBy((s) => s, new Intl.Collator('de').compare).toArray()).toEqual(['a', 'ö', 'z']);
  });
});

describe('oracle properties', () => {
  const ints = fc.array(fc.integer({ min: -20, max: 20 }), { maxLength: 30 });
  it('matches native array equivalents', () => {
    fc.assert(fc.property(ints, ints, fc.nat({ max: 35 }), fc.integer({ min: -5, max: 5 }), (a, b, n, t) => {
      const q = from(a);
      expect(q.where((x) => x > t).toArray()).toEqual(a.filter((x) => x > t));
      expect(q.select((x, i) => x * i).toArray()).toEqual(a.map((x, i) => x * i));
      expect(q.take(n).toArray()).toEqual(a.slice(0, n));
      expect(q.skip(n).toArray()).toEqual(a.slice(n));
      expect(q.takeLast(n).toArray()).toEqual(n === 0 ? [] : a.slice(-n));
      expect(q.skipLast(n).toArray()).toEqual(a.slice(0, Math.max(0, a.length - n)));
      expect(q.reverse().toArray()).toEqual(a.toReversed());
      expect(q.orderBy((x) => Math.abs(x)).toArray()).toEqual(a.toSorted((x, y) => Math.abs(x) - Math.abs(y)));
      expect(q.orderByDescending((x) => x % 3).thenBy((x) => x).toArray()).toEqual(a.toSorted((x, y) => (y % 3) - (x % 3) || x - y));
      expect(q.distinct().toArray()).toEqual([...new Set(a)]);
      expect(q.concat(b).toArray()).toEqual([...a, ...b]);
      expect(q.union(b).toArray()).toEqual([...new Set([...a, ...b])]);
      expect(q.intersect(b).toArray()).toEqual([...new Set(a)].filter((x) => b.includes(x)));
      expect(q.except(b).toArray()).toEqual([...new Set(a)].filter((x) => !b.includes(x)));
      expect(q.chunk(Math.max(1, n)).selectMany((c) => c).toArray()).toEqual(a);
      expect(q.count((x) => x > t)).toBe(a.filter((x) => x > t).length);
      expect(q.sum()).toBe(a.reduce((s, x) => s + x, 0));
      expect(q.any((x) => x === t)).toBe(a.includes(t));
      expect(q.all((x) => x !== t)).toBe(!a.includes(t));
      expect(q.firstOrDefault((x) => x > t)).toBe(a.find((x) => x > t));
      expect(q.lastOrDefault((x) => x > t)).toBe(a.findLast((x) => x > t));
      expect(q.skipWhile((x) => x < t).toArray()).toEqual(a.slice(a.findIndex((x) => x >= t) === -1 ? a.length : a.findIndex((x) => x >= t)));
      expect(q.aggregate(0, (s, x) => s * 2 + x)).toBe(a.reduce((s, x) => s * 2 + x, 0));
      if (a.length) {
        expect(q.min()).toBe(Math.min(...a));
        expect(q.max()).toBe(Math.max(...a));
      }
      const groups = q.groupBy((x) => x % 4).select((g) => [g.key, g.toArray()] as const).toArray();
      const oracleGroups = new Map<number, number[]>();
      for (const x of a) oracleGroups.set(x % 4, [...(oracleGroups.get(x % 4) ?? []), x]);
      expect(new Map(groups)).toEqual(oracleGroups);
      expect(q.zip(b).toArray()).toEqual(a.slice(0, Math.min(a.length, b.length)).map((x, i) => [x, b[i]]));
    }));
  });
  it('pipeable and fluent forms agree', () => {
    fc.assert(fc.property(ints, (a) => {
      expect(pipe(a, where((x) => x % 2 === 0), orderBy((x) => -x), select((x) => x + 1), toArray())).toEqual(
        from(a).where((x) => x % 2 === 0).orderBy((x) => -x).select((x) => x + 1).toArray(),
      );
    }));
  });
});
