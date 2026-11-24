import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  arraysEqual, averageBy, binarySearch, bottomN, buildTree, chunk, compact, countBy, dropWhile, first, flatten, flattenDeep, flattenTree, groupBy, groupByToMap,
  insertAt, intersperse, keyBy, last, lowerBound, maxBy, minBy, move, nth, paginate, pairwise, partition, range, removeAt, repeat, replaceAt, rotate, sortBy,
  splitAt, sumBy, swap, takeWhile, times, toggleItem, topN, uniq, uniqBy, unzip, upperBound, upsertBy, windowed, zip, zipWith, MAX_GENERATED_LENGTH,
} from '@absoluteui/helpers/array';
import type { TreeNode } from '@absoluteui/helpers/array';
import { HelperError, LimitError, ValidationError } from '@absoluteui/helpers/error';

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof HelperError ? e.code : 'non-helper-error';
  }
  return undefined;
};

describe('grouping', () => {
  it('chunks and partitions', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    for (const bad of [0, -1, 1.5, NaN, Infinity]) expect(code(() => chunk([1], bad))).toBe('HLP_ARRAY_INVALID_SIZE');
    const [even, odd] = partition([1, 2, 3, 4], (n) => n % 2 === 0);
    expect([even, odd]).toEqual([[2, 4], [1, 3]]);
    const [strs, nums] = partition<string | number, string>(['a', 1, 'b'], (x): x is string => typeof x === 'string');
    expect(strs.join('')).toBe('ab');
    expect(nums).toEqual([1]);
  });
  it('chunk flattens back to the input', () => {
    fc.assert(fc.property(fc.array(fc.integer()), fc.integer({ min: 1, max: 10 }), (a, n) => {
      const c = chunk(a, n);
      expect(c.flat()).toEqual(a);
      expect(c.every((x, i) => (i < c.length - 1 ? x.length === n : x.length >= 1 && x.length <= n))).toBe(true);
    }));
  });
  it('groups with native and fallback paths into null-prototype records', () => {
    const g = groupBy(['one', 'two', 'three'], (s) => s.length);
    expect(Object.getPrototypeOf(g)).toBeNull();
    expect({ ...g }).toEqual({ 3: ['one', 'two'], 5: ['three'] });
    const native = (Object as { groupBy?: unknown }).groupBy;
    try {
      delete (Object as { groupBy?: unknown }).groupBy;
      const f = groupBy(['a', 'bb', 'c'], (s) => s.length);
      expect(Object.getPrototypeOf(f)).toBeNull();
      expect({ ...f }).toEqual({ 1: ['a', 'c'], 2: ['bb'] });
      const p = groupBy([1, 2], () => '__proto__');
      expect(Object.getPrototypeOf(p)).toBeNull();
      expect(({} as Record<string, unknown>)['0']).toBeUndefined();
    } finally {
      (Object as { groupBy?: unknown }).groupBy = native;
    }
    expect(groupByToMap([{ d: 1 }, { d: 2 }, { d: 1 }], (x) => x.d).get(1)?.length).toBe(2);
    const nativeMap = (Map as { groupBy?: unknown }).groupBy;
    try {
      delete (Map as { groupBy?: unknown }).groupBy;
      expect([...groupByToMap([NaN, NaN, 1], (x) => x).keys()]).toEqual([NaN, 1]);
    } finally {
      (Map as { groupBy?: unknown }).groupBy = nativeMap;
    }
  });
  it('keyBy and countBy are prototype-pollution safe', () => {
    const k = keyBy([{ id: '__proto__', v: 1 }, { id: 'constructor', v: 2 }], (x) => x.id);
    expect(Object.getPrototypeOf(k)).toBeNull();
    expect(k.__proto__?.v).toBe(1);
    expect(({} as { v?: unknown }).v).toBeUndefined();
    const c = countBy(['__proto__', '__proto__', 'x'], (s) => s);
    expect(c.__proto__).toBe(2);
    expect(Object.prototype).not.toHaveProperty('x');
    expect(keyBy([{ id: 'a', v: 1 }, { id: 'a', v: 2 }], (x) => x.id).a?.v).toBe(2);
  });
});

describe('zip and flatten', () => {
  it('zips to the shortest and unzips', () => {
    expect(zip([1, 2, 3], ['a', 'b'])).toEqual([[1, 'a'], [2, 'b']]);
    expect(zip()).toEqual([]);
    expect(zipWith([1, 2], [10, 20, 30], (a, b, i) => a + b + i)).toEqual([11, 23]);
    expect(unzip([[1, 'a'], [2, 'b']] as [number, string][])).toEqual([[1, 2], ['a', 'b']]);
    expect(unzip([])).toEqual([]);
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer(), fc.string())), (rows) => {
      const cols = unzip(rows);
      if (rows.length) expect(zip(...cols)).toEqual(rows);
    }));
  });
  it('flattens by depth and compacts', () => {
    expect(flatten([1, [2, [3]]])).toEqual([1, 2, [3]]);
    expect(flatten([1, [2, [3]]], 0)).toEqual([1, [2, [3]]]);
    expect(flattenDeep([1, [2, [3, [4]]]])).toEqual([1, 2, 3, 4]);
    expect(code(() => flatten([], -1))).toBe('HLP_ARRAY_INVALID_DEPTH');
    expect(compact([0, null, 'a', false, undefined, '', NaN])).toEqual([0, 'a', '', NaN]);
    expect(uniq([1, 2, 1, NaN, NaN])).toEqual([1, 2, NaN]);
    expect(uniqBy([{ id: 1, v: 'a' }, { id: 1, v: 'b' }, { id: 2, v: 'c' }], (x) => x.id).map((x) => x.v)).toEqual(['a', 'c']);
  });
});

describe('sortBy', () => {
  const people = [
    { name: 'Émile', dept: 'b', salary: 3 },
    { name: 'zoe', dept: 'a', salary: 1 },
    { name: 'Adam', dept: 'b', salary: 3 },
    { name: 'bob', dept: null, salary: 2 },
  ];
  it('sorts by multiple keys with direction and nulls', () => {
    const r = sortBy(people, [{ by: (p) => p.dept }, { by: (p) => p.salary, order: 'desc' }]);
    expect(r.map((p) => p.name)).toEqual(['zoe', 'Émile', 'Adam', 'bob']);
    expect(sortBy(people, { by: (p) => p.dept, nulls: 'first' })[0]?.name).toBe('bob');
    expect(sortBy(people, { by: (p) => p.dept, order: 'desc' }).map((p) => p.name)).toEqual(['Émile', 'Adam', 'zoe', 'bob']);
    expect(people[0]?.name).toBe('Émile');
  });
  it('uses a collator for strings when asked', () => {
    expect(sortBy(people, (p) => p.name).map((p) => p.name)).toEqual(['Adam', 'bob', 'zoe', 'Émile']);
    expect(sortBy(people, (p) => p.name, { locale: 'en' }).map((p) => p.name)).toEqual(['Adam', 'bob', 'Émile', 'zoe']);
    const numeric = new Intl.Collator('en', { numeric: true });
    expect(sortBy(['a10', 'a2', 'a1'], { by: (s) => s, collator: numeric })).toEqual(['a1', 'a2', 'a10']);
    expect(sortBy([new Date(2020, 1, 1), new Date(2019, 1, 1), new Date(NaN)], (d) => d).map((d) => d.getFullYear())).toEqual([2019, 2020, NaN]);
  });
  it('matches a stable native sort and evaluates keys once per item', () => {
    fc.assert(fc.property(fc.array(fc.record({ a: fc.integer({ min: 0, max: 3 }), b: fc.integer() })), (rows) => {
      let calls = 0;
      const r = sortBy(rows, [{ by: (x) => (calls++, x.a) }, { by: (x) => x.b, order: 'desc' }]);
      expect(calls).toBe(rows.length);
      expect(r).toEqual(rows.toSorted((x, y) => x.a - y.a || y.b - x.b));
    }));
  });
});

describe('searching and selection', () => {
  it('binary searches and bounds', () => {
    expect(binarySearch([1, 3, 5], 3)).toBe(1);
    expect(~binarySearch([1, 3, 5], 4)).toBe(2);
    expect(~binarySearch([], 4)).toBe(0);
    expect(lowerBound([1, 2, 2, 3], 2)).toBe(1);
    expect(upperBound([1, 2, 2, 3], 2)).toBe(3);
    const objs = [{ v: 1 }, { v: 4 }];
    expect(lowerBound(objs, { v: 3 }, (a, b) => a.v - b.v)).toBe(1);
    fc.assert(fc.property(fc.array(fc.integer({ min: -20, max: 20 })), fc.integer({ min: -25, max: 25 }), (raw, t) => {
      const a = raw.toSorted((x, y) => x - y);
      expect(lowerBound(a, t)).toBe(a.findIndex((x) => x >= t) === -1 ? a.length : a.findIndex((x) => x >= t));
      expect(upperBound(a, t)).toBe(a.findIndex((x) => x > t) === -1 ? a.length : a.findIndex((x) => x > t));
      const i = binarySearch(a, t);
      if (i >= 0) expect(a[i]).toBe(t);
      else expect(~i).toBe(lowerBound(a, t));
    }));
  });
  it('topN/bottomN equal a stable sort slice', () => {
    expect(topN([5, 1, 9, 3], 2)).toEqual([9, 5]);
    expect(bottomN([5, 1, 9, 3], 2)).toEqual([1, 3]);
    expect(topN([1], 5)).toEqual([1]);
    expect(topN([1, 2], 0)).toEqual([]);
    expect(code(() => topN([1], -1))).toBe('HLP_ARRAY_INVALID_COUNT');
    fc.assert(fc.property(fc.array(fc.record({ k: fc.integer({ min: 0, max: 5 }), id: fc.nat() })), fc.nat({ max: 12 }), (rows, n) => {
      const cmp = (a: { k: number }, b: { k: number }): number => a.k - b.k;
      expect(topN(rows, n, cmp)).toEqual(rows.toSorted((a, b) => b.k - a.k).slice(0, n));
      expect(bottomN(rows, n, cmp)).toEqual(rows.toSorted(cmp).slice(0, n));
    }));
  });
  it('aggregates by selector', () => {
    const rows = [{ n: 2 }, { n: 1 }, { n: 1 }, { n: 3 }];
    expect(minBy(rows, (x) => x.n)).toBe(rows[1]);
    expect(maxBy(rows, (x) => x.n)).toBe(rows[3]);
    expect(minBy([] as number[], (x) => x)).toBeUndefined();
    expect(maxBy([{ n: null }, { n: 1 }], (x) => x.n)).toEqual({ n: 1 });
    expect(sumBy(rows, (x) => x.n)).toBe(7);
    expect(sumBy(Array.from({ length: 10 }, () => 0.1), (x) => x)).toBe(1);
    expect(sumBy([1e100, 1, -1e100], (x) => x)).toBe(1);
    expect(averageBy(rows, (x) => x.n)).toBe(1.75);
    expect(averageBy([], (x: number) => x)).toBeUndefined();
  });
});

describe('immutable edits', () => {
  const src = Object.freeze([1, 2, 3, 4]);
  it('edits without mutating', () => {
    expect(move(src, 0, 2)).toEqual([2, 3, 1, 4]);
    expect(move(src, -1, 0)).toEqual([4, 1, 2, 3]);
    expect(insertAt(src, 1, 9, 8)).toEqual([1, 9, 8, 2, 3, 4]);
    expect(insertAt(src, 4, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(removeAt(src, 1, 2)).toEqual([1, 4]);
    expect(removeAt(src, -1)).toEqual([1, 2, 3]);
    expect(replaceAt(src, -1, 9)).toEqual([1, 2, 3, 9]);
    expect(swap(src, 0, 3)).toEqual([4, 2, 3, 1]);
    expect(toggleItem(src, 2)).toEqual([1, 3, 4]);
    expect(toggleItem(src, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(upsertBy([{ id: 1, v: 'a' }], { id: 1, v: 'b' }, (x) => x.id)).toEqual([{ id: 1, v: 'b' }]);
    expect(upsertBy([{ id: 1, v: 'a' }], { id: 2, v: 'b' }, (x) => x.id)).toHaveLength(2);
    expect(rotate(src, 1)).toEqual([4, 1, 2, 3]);
    expect(rotate(src, -1)).toEqual([2, 3, 4, 1]);
    expect(rotate(src, 6)).toEqual([3, 4, 1, 2]);
    expect(rotate([], 3)).toEqual([]);
    expect(splitAt(src, 1)).toEqual([[1], [2, 3, 4]]);
    expect(intersperse(['a', 'b', 'c'], ',')).toEqual(['a', ',', 'b', ',', 'c']);
    expect(takeWhile(src, (n) => n < 3)).toEqual([1, 2]);
    expect(dropWhile(src, (n) => n < 3)).toEqual([3, 4]);
    expect(dropWhile(src, () => true)).toEqual([]);
    expect(src).toEqual([1, 2, 3, 4]);
  });
  it('rejects out-of-range indexes', () => {
    for (const fn of [() => move(src, 4, 0), () => insertAt(src, 5, 1), () => removeAt(src, 9), () => replaceAt(src, -5, 0), () => swap(src, 0, 1.5), () => replaceAt([], 0, 1)]) {
      expect(code(fn)).toBe('HLP_ARRAY_INDEX_OUT_OF_RANGE');
    }
    expect(code(() => removeAt(src, 0, -1))).toBe('HLP_ARRAY_INVALID_COUNT');
  });
  it('move is a permutation and rotate composes', () => {
    fc.assert(fc.property(fc.array(fc.integer(), { minLength: 1 }), fc.nat(), fc.nat(), fc.integer({ min: -50, max: 50 }), (a, f, t, k) => {
      const m = move(a, f % a.length, t % a.length);
      expect(m.toSorted()).toEqual(a.toSorted());
      expect(m[t % a.length]).toBe(a[f % a.length]);
      expect(rotate(rotate(a, k), -k)).toEqual(a);
    }));
  });
  it('accesses by position', () => {
    expect(first([1, 2])).toBe(1);
    expect(last([1, 2])).toBe(2);
    expect(first([] as number[])).toBeUndefined();
    expect(nth([1, 2, 3], -2)).toBe(2);
    expect(nth([1, 2, 3], 3)).toBeUndefined();
    expect(nth([1, 2, 3], 0.5)).toBeUndefined();
    expect(arraysEqual([1, NaN], [1, NaN])).toBe(true);
    expect(arraysEqual([1], [1, 2])).toBe(false);
    expect(arraysEqual([{ a: 1 }], [{ a: 1 }], (x, y) => x.a === y.a)).toBe(true);
  });
});

describe('generation', () => {
  it('ranges with guards', () => {
    expect(range(3)).toEqual([0, 1, 2]);
    expect(range(-2)).toEqual([0, -1]);
    expect(range(1, 4)).toEqual([1, 2, 3]);
    expect(range(10, 0, -5)).toEqual([10, 5]);
    expect(range(0, 1, 0.1)).toHaveLength(10);
    expect(range(0, 1, 0.25)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(range(0, 5, -1)).toEqual([]);
    for (const [a, b, s] of [[0, 1, 0], [0, Infinity, 1], [NaN, 1, 1]] as const) expect(code(() => range(a, b, s))).toBe('HLP_ARRAY_INVALID_RANGE');
    expect(() => range(0, 1e12)).toThrow(LimitError);
    expect(code(() => range(0, MAX_GENERATED_LENGTH + 1))).toBe('HLP_ARRAY_TOO_LARGE');
    expect(times(3, (i) => i * 2)).toEqual([0, 2, 4]);
    expect(repeat('x', 2)).toEqual(['x', 'x']);
    expect(() => repeat('x', 1e9)).toThrow(LimitError);
    expect(() => times(-1, () => 0)).toThrow(ValidationError);
  });
  it('windows and pairs', () => {
    expect(windowed([1, 2, 3, 4], 2)).toEqual([[1, 2], [2, 3], [3, 4]]);
    expect(windowed([1, 2, 3, 4, 5], 2, 2)).toEqual([[1, 2], [3, 4]]);
    expect(windowed([1], 2)).toEqual([]);
    expect(code(() => windowed([1], 1, 0))).toBe('HLP_ARRAY_INVALID_SIZE');
    expect(pairwise([1, 2, 3])).toEqual([[1, 2], [2, 3]]);
    expect(pairwise([1])).toEqual([]);
    fc.assert(fc.property(fc.array(fc.integer()), (a) => {
      expect(pairwise(a)).toEqual(windowed(a, 2));
    }));
  });
  it('paginates', () => {
    const p = paginate(range(25), 3, 10);
    expect(p).toEqual({ items: [20, 21, 22, 23, 24], total: 25, page: 3, pageSize: 10, pageCount: 3, hasNext: false, hasPrev: true });
    expect(paginate(range(25), 1, 10).hasNext).toBe(true);
    expect(paginate([], 1, 10)).toMatchObject({ items: [], pageCount: 0, hasNext: false, hasPrev: false });
    expect(paginate(range(5), 9, 2).items).toEqual([]);
    for (const [pg, sz] of [[0, 10], [1, 0], [1.5, 10], [1, NaN]] as const) expect(code(() => paginate([], pg, sz))).toBe('HLP_ARRAY_INVALID_PAGE');
  });
});

describe('trees', () => {
  const rows = [
    { id: 1, parentId: null, name: 'root' },
    { id: 2, parentId: 1, name: 'a' },
    { id: 3, parentId: 1, name: 'b' },
    { id: 4, parentId: 2, name: 'a1' },
    { id: 5, parentId: 99, name: 'orphan' },
    { id: 6, parentId: 7, name: 'c1' },
    { id: 7, parentId: 6, name: 'c2' },
    { id: 8, parentId: 7, name: 'c3' },
  ];
  it('builds with orphans and cycles reported', () => {
    const { roots, orphans, cycles } = buildTree(rows);
    expect(roots.map((r) => r.item.name)).toEqual(['root', 'orphan']);
    expect(roots[0]?.children.map((c) => c.item.name)).toEqual(['a', 'b']);
    expect(orphans.map((o) => o.name)).toEqual(['orphan']);
    expect(cycles.map((c) => c.name)).toEqual(['c1', 'c2', 'c3']);
    expect(buildTree(rows, { orphans: 'omit' }).roots).toHaveLength(1);
    expect(code(() => buildTree([{ id: 1 }, { id: 1 }]))).toBe('HLP_ARRAY_DUPLICATE_ID');
    const custom = buildTree([{ key: 'x' }, { key: 'y', up: 'x' }], { id: 'key', parentId: (r: { up?: string }) => r.up });
    expect(custom.roots[0]?.children[0]?.item.key).toBe('y');
  });
  it('flattens depth-first and breadth-first', () => {
    const { roots } = buildTree(rows, { orphans: 'omit' });
    const dfs = flattenTree(roots);
    expect(dfs.map((e) => `${e.depth}${e.node.item.name}`)).toEqual(['0root', '1a', '2a1', '1b']);
    expect(dfs[2]?.parent?.item.name).toBe('a');
    expect(flattenTree(roots, { order: 'breadth' }).map((e) => e.node.item.name)).toEqual(['root', 'a', 'b', 'a1']);
    const cyclic: { children: unknown[] } = { children: [] };
    cyclic.children.push(cyclic);
    expect(code(() => flattenTree([cyclic]))).toBe('HLP_ARRAY_TREE_CYCLE');
  });
  it('handles very deep trees without recursion', () => {
    const deep = Array.from({ length: 100_000 }, (_, i) => ({ id: i, parentId: i === 0 ? null : i - 1 }));
    const { roots } = buildTree(deep);
    const flat = flattenTree<TreeNode<{ id: number }>>(roots);
    expect(flat).toHaveLength(100_000);
    expect(flat.at(-1)?.depth).toBe(99_999);
  });
  it('round-trips random forests', () => {
    fc.assert(fc.property(fc.array(fc.nat({ max: 40 }), { maxLength: 40 }), (parents) => {
      const items = parents.map((p, i) => ({ id: i, parentId: p < i ? p : null }));
      const { roots, orphans, cycles } = buildTree(items);
      expect(orphans).toEqual([]);
      expect(cycles).toEqual([]);
      const flat = flattenTree(roots);
      expect(flat.map((e) => e.node.item.id).toSorted((a, b) => a - b)).toEqual(items.map((x) => x.id));
      for (const e of flat) expect(e.parent?.item.id ?? null).toBe(e.node.item.parentId);
    }));
  });
});
