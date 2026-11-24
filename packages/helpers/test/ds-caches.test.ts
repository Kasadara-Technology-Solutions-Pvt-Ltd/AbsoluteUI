import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { LFUCache, LRUCache, TTLCache } from '@absoluteui/helpers/ds';
import { ValidationError } from '@absoluteui/helpers/error';

describe('LRUCache', () => {
  it('evicts the least recently used and reports it', () => {
    const onEvict = vi.fn();
    const c = new LRUCache<string, number>({ maxSize: 2, onEvict });
    c.set('a', 1).set('b', 2);
    expect(c.get('a')).toBe(1);
    c.set('c', 3);
    expect(c.has('b')).toBe(false);
    expect(onEvict).toHaveBeenCalledWith('b', 2, 'capacity');
    expect(c.toArray()).toEqual([['a', 1], ['c', 3]]);
    expect(c.peek('a')).toBe(1);
    c.set('d', 4); // peek did not refresh 'a'
    expect(c.has('a')).toBe(false);
    expect([...c.keys()]).toEqual(['c', 'd']);
    expect([...c.values()]).toEqual([3, 4]);
    expect(c.delete('c')).toBe(true);
    c.clear();
    expect(c.size).toBe(0);
  });

  it('expires lazily with an injected clock', () => {
    let now = 0;
    const onEvict = vi.fn();
    const c = new LRUCache<string, number>({ ttlMs: 100, now: () => now, onEvict });
    c.set('a', 1);
    c.set('b', 2, { ttlMs: 500 });
    now = 99;
    expect(c.get('a')).toBe(1);
    now = 100;
    expect(c.get('a')).toBeUndefined();
    expect(onEvict).toHaveBeenCalledWith('a', 1, 'expired');
    expect(c.has('b')).toBe(true);
    c.set('c', 3);
    now = 250;
    expect(c.toArray()).toEqual([['b', 2]]);
    expect(c.prune()).toBe(1);
    expect(c.size).toBe(1);
  });

  it('matches a reference model under random operations (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), fc.array(fc.tuple(fc.constantFrom('get', 'set', 'delete', 'peek'), fc.integer({ min: 0, max: 8 }), fc.integer()), { maxLength: 200 }), (max, ops) => {
        const c = new LRUCache<number, number>({ maxSize: max });
        let model: [number, number][] = []; // oldest first
        for (const [op, k, v] of ops) {
          const i = model.findIndex(([mk]) => mk === k);
          if (op === 'set') {
            if (i >= 0) model.splice(i, 1);
            model.push([k, v]);
            if (model.length > max) model = model.slice(model.length - max);
            c.set(k, v);
          } else if (op === 'get') {
            const hit = i >= 0 ? model.splice(i, 1)[0] : undefined;
            if (hit) model.push(hit);
            expect(c.get(k)).toBe(hit?.[1]);
          } else if (op === 'peek') {
            expect(c.peek(k)).toBe(i >= 0 ? model[i]![1] : undefined);
          } else {
            if (i >= 0) model.splice(i, 1);
            expect(c.delete(k)).toBe(i >= 0);
          }
        }
        expect(c.toArray()).toEqual(model);
      }),
    );
  });

  it('validates options', () => {
    expect(() => new LRUCache({ maxSize: 0 })).toThrow(ValidationError);
    expect(() => new LRUCache({ ttlMs: 0 })).toThrow(ValidationError);
    expect(() => new LRUCache().set('a', 1, { ttlMs: -1 })).toThrow(ValidationError);
  });
});

describe('LFUCache', () => {
  it('evicts the least frequently used, ties by recency', () => {
    const onEvict = vi.fn();
    const c = new LFUCache<string, number>({ maxSize: 2, onEvict });
    c.set('a', 1).set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.has('b')).toBe(false);
    expect(onEvict).toHaveBeenCalledWith('b', 2);
    expect(c.frequency('a')).toBe(2);
    c.set('d', 4); // 'c' (freq 1) evicted
    expect(c.has('c')).toBe(false);
    expect(c.toArray()).toEqual([['d', 4], ['a', 1]]);
    expect(c.peek('d')).toBe(4);
    expect(c.frequency('d')).toBe(1);
    c.set('a', 10);
    expect(c.get('a')).toBe(10);
    expect(c.delete('a')).toBe(true);
    expect(c.delete('a')).toBe(false);
    expect(c.size).toBe(1);
    c.clear();
    expect(c.size).toBe(0);
    c.set('x', 1);
    expect(c.get('x')).toBe(1);
  });

  it('matches a reference model (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.array(fc.tuple(fc.constantFrom('get', 'set', 'delete'), fc.integer({ min: 0, max: 6 })), { maxLength: 200 }), (max, ops) => {
        const c = new LFUCache<number, number>({ maxSize: max });
        // model: key -> { freq, tick of last use }
        const model = new Map<number, { freq: number; last: number }>();
        let t = 0;
        for (const [op, k] of ops) {
          t++;
          const m = model.get(k);
          if (op === 'get') {
            expect(c.get(k)).toBe(m ? k : undefined);
            if (m) { m.freq++; m.last = t; }
          } else if (op === 'delete') {
            expect(c.delete(k)).toBe(model.delete(k));
          } else if (m) {
            m.freq++;
            m.last = t;
            c.set(k, k);
          } else {
            if (model.size >= max) {
              let victim: number | undefined;
              let best: { freq: number; last: number } | undefined;
              for (const [mk, mv] of model) if (!best || mv.freq < best.freq || (mv.freq === best.freq && mv.last < best.last)) { best = mv; victim = mk; }
              model.delete(victim!);
            }
            model.set(k, { freq: 1, last: t });
            c.set(k, k);
          }
        }
        expect(new Set(c.toArray().map(([k]) => k))).toEqual(new Set(model.keys()));
      }),
    );
  });
});

describe('TTLCache', () => {
  it('expires per entry and prunes', () => {
    let now = 1000;
    const onEvict = vi.fn();
    const c = new TTLCache<string, string>({ ttlMs: 100, now: () => now, onEvict });
    c.set('a', 'A').set('b', 'B', { ttlMs: 300 });
    expect(c.ttlRemaining('a')).toBe(100);
    now += 50;
    expect(c.touch('a')).toBe(true);
    now += 120;
    expect(c.get('a')).toBeUndefined();
    expect(onEvict).toHaveBeenCalledWith('a', 'A', 'expired');
    expect(c.get('b')).toBe('B');
    c.set('c', 'C');
    now += 200;
    expect(c.toArray()).toEqual([]);
    expect(c.prune()).toBe(2);
    expect(c.size).toBe(0);
    expect(c.touch('zzz')).toBe(false);
    expect(c.ttlRemaining('zzz')).toBeUndefined();
  });

  it('bounds size by evicting the oldest insertion', () => {
    const onEvict = vi.fn();
    const c = new TTLCache<number, number>({ ttlMs: 1000, maxSize: 2, onEvict });
    c.set(1, 1).set(2, 2).set(3, 3);
    expect([...c].map(([k]) => k)).toEqual([2, 3]);
    expect(onEvict).toHaveBeenCalledWith(1, 1, 'capacity');
    expect(c.has(3)).toBe(true);
    expect(c.delete(3)).toBe(true);
    c.clear();
    expect(c.size).toBe(0);
    expect(() => new TTLCache({ ttlMs: Number.NaN })).toThrow(ValidationError);
  });
});
