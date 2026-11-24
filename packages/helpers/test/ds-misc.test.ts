import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { BiMap, BitSet, BloomFilter, MultiMap, Trie, TrieMap, TypedEventEmitter } from '@absoluteui/helpers/ds';
import { ConflictError, LimitError, ValidationError } from '@absoluteui/helpers/error';

describe('Trie / TrieMap', () => {
  it('inserts, finds by prefix in order, deletes with pruning', () => {
    const t = new Trie(['car', 'cart', 'cat', 'dog']);
    expect(t.size).toBe(4);
    expect(t.has('car')).toBe(true);
    expect(t.has('ca')).toBe(false);
    expect(t.startsWith('ca')).toBe(true);
    expect(t.startsWith('x')).toBe(false);
    expect(t.findByPrefix('car')).toEqual(['car', 'cart']);
    expect(t.findByPrefix('', 2)).toEqual(['car', 'cart']);
    expect(t.countPrefix('ca')).toBe(3);
    expect(t.longestPrefixOf('carting')).toBe('cart');
    expect(t.delete('car')).toBe(true);
    expect(t.delete('car')).toBe(false);
    expect(t.has('cart')).toBe(true);
    expect(t.delete('cart')).toBe(true);
    expect(t.startsWith('car')).toBe(false);
    expect(t.toArray()).toEqual(['cat', 'dog']);
    expect(t.longestCommonPrefix()).toBe('');
    t.insert('');
    expect(t.has('')).toBe(true);
    t.clear();
    expect([...t]).toEqual([]);
  });

  it('computes the longest common prefix', () => {
    expect(new Trie(['flower', 'flow', 'flight']).longestCommonPrefix()).toBe('fl');
    expect(new Trie(['same']).longestCommonPrefix()).toBe('same');
    expect(new Trie().longestCommonPrefix()).toBe('');
    expect(new Trie(['ab', 'abc']).longestCommonPrefix()).toBe('ab');
  });

  it('folds case and keeps the latest spelling; handles unicode and __proto__', () => {
    const m = new TrieMap<number>([['Apple', 1], ['apricot', 2]], { caseFold: true });
    expect(m.get('APPLE')).toBe(1);
    expect(m.keysWithPrefix('AP')).toEqual(['Apple', 'apricot']);
    m.set('APPLE', 3);
    expect(m.size).toBe(2);
    expect(m.entriesWithPrefix('app')).toEqual([['APPLE', 3]]);
    const tr = new TrieMap<boolean>(undefined, { caseFold: 'tr' });
    tr.set('İstanbul', true);
    expect(tr.has('istanbul')).toBe(true);
    const u = new Trie(['😀a', '😀b', '__proto__', 'constructor']);
    expect(u.findByPrefix('😀')).toEqual(['😀a', '😀b']);
    expect(u.has('__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).a).toBeUndefined();
  });

  it('matches a Set oracle (property) and handles very long keys', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 6 })), fc.array(fc.string({ maxLength: 6 })), fc.string({ maxLength: 3 }), (adds, dels, prefix) => {
        const t = new Trie(adds);
        const model = new Set(adds);
        for (const d of dels) expect(t.delete(d)).toBe(model.delete(d));
        expect(t.size).toBe(model.size);
        const expected = [...model].filter((w) => w.startsWith(prefix)).sort();
        expect(t.findByPrefix(prefix)).toEqual(expected);
        expect(t.startsWith(prefix)).toBe(expected.length > 0);
      }),
    );
    const long = 'a'.repeat(200_000);
    const t = new Trie([long, `${long}b`]);
    expect(t.findByPrefix(long)).toHaveLength(2);
    expect(t.delete(long)).toBe(true);
    expect(t.longestCommonPrefix().length).toBe(200_001);
  });
});

describe('BitSet', () => {
  it('sets, clears, toggles, and iterates', () => {
    const b = new BitSet();
    b.set(3).set(64).set(31);
    expect(b.has(3)).toBe(true);
    expect(b.has(4)).toBe(false);
    expect(b.has(-1)).toBe(false);
    expect(b.has(1e9)).toBe(false);
    expect([...b]).toEqual([3, 31, 64]);
    expect(b.count()).toBe(3);
    expect(b.size).toBe(3);
    expect(b.toggle(3)).toBe(false);
    expect(b.toggle(5)).toBe(true);
    b.clear(64);
    expect(b.toArray()).toEqual([5, 31]);
    b.clear(10_000);
    b.clear();
    expect(b.count()).toBe(0);
    expect(b.capacity).toBeGreaterThanOrEqual(96);
    expect(() => b.set(-1)).toThrow(ValidationError);
    expect(() => b.set(1.5)).toThrow(ValidationError);
    expect(() => b.set(2 ** 31)).toThrow(ValidationError);
    expect(() => new BitSet(-1)).toThrow(ValidationError);
  });

  it('set algebra matches Set semantics (property)', () => {
    const idx = fc.array(fc.integer({ min: 0, max: 300 }));
    fc.assert(
      fc.property(idx, idx, (xs, ys) => {
        const a = BitSet.from(xs);
        const b = BitSet.from(ys);
        const sa = new Set(xs);
        const sb = new Set(ys);
        const sorted = (s: Iterable<number>): number[] => [...s].sort((p, q) => p - q);
        expect(a.union(b).toArray()).toEqual(sorted(new Set([...sa, ...sb])));
        expect(a.intersect(b).toArray()).toEqual(sorted([...sa].filter((x) => sb.has(x))));
        expect(a.difference(b).toArray()).toEqual(sorted([...sa].filter((x) => !sb.has(x))));
        expect(a.xor(b).toArray()).toEqual(sorted([...sa, ...sb].filter((x) => sa.has(x) !== sb.has(x))));
        expect(a.count()).toBe(sa.size);
        expect(a.clone().equals(a)).toBe(true);
        expect(a.equals(b)).toBe(sa.size === sb.size && [...sa].every((x) => sb.has(x)));
      }),
    );
  });
});

describe('MultiMap and BiMap', () => {
  it('MultiMap keeps arrays or unique sets', () => {
    const m = new MultiMap<string, number>([['a', 1], ['a', 1], ['b', 2]]);
    expect(m.get('a')).toEqual([1, 1]);
    expect(m.size).toBe(3);
    expect(m.keyCount).toBe(2);
    expect(m.hasEntry('a', 1)).toBe(true);
    expect(m.deleteEntry('a', 1)).toBe(true);
    expect(m.get('a')).toEqual([1]);
    expect(m.deleteEntry('a', 1)).toBe(true);
    expect(m.has('a')).toBe(false);
    expect(m.deleteEntry('a', 1)).toBe(false);
    expect(m.get('zzz')).toEqual([]);
    const u = new MultiMap<string, number>(undefined, { unique: true });
    u.add('x', 1).add('x', 1).add('x', 2).add('__proto__', 3);
    expect(u.get('x')).toEqual([1, 2]);
    expect(u.size).toBe(3);
    expect(u.hasEntry('x', 2)).toBe(true);
    expect(u.deleteEntry('x', 5)).toBe(false);
    expect([...u.keys()]).toEqual(['x', '__proto__']);
    expect([...u.groups()]).toEqual([['x', [1, 2]], ['__proto__', [3]]]);
    expect(u.toArray()).toEqual([['x', 1], ['x', 2], ['__proto__', 3]]);
    expect(u.delete('x')).toBe(true);
    expect(u.delete('x')).toBe(false);
    expect(u.size).toBe(1);
    u.clear();
    expect(u.size).toBe(0);
    const returned = m.get('b');
    returned.push(99);
    expect(m.get('b')).toEqual([2]);
  });

  it('BiMap enforces unique values', () => {
    const b = new BiMap([['IN', 'India']]);
    expect(b.getKey('India')).toBe('IN');
    expect(() => b.set('FR', 'India')).toThrow(ConflictError);
    b.set('IN', 'Bharat');
    expect(b.hasValue('India')).toBe(false);
    b.set('FR', 'France');
    b.forceSet('XX', 'France');
    expect(b.has('FR')).toBe(false);
    expect(b.get('XX')).toBe('France');
    expect(b.inverse().get('Bharat')).toBe('IN');
    expect(b.deleteValue('Bharat')).toBe(true);
    expect(b.delete('IN')).toBe(false);
    expect(b.deleteValue('nope')).toBe(false);
    expect([...b.keys()]).toEqual(['XX']);
    expect([...b.values()]).toEqual(['France']);
    expect(b.toArray()).toEqual([['XX', 'France']]);
    expect([...b]).toEqual([['XX', 'France']]);
    expect(b.size).toBe(1);
    b.clear();
    expect(b.size).toBe(0);
  });
});

describe('BloomFilter', () => {
  it('has no false negatives and a false-positive rate near target', () => {
    const f = new BloomFilter<string>({ expectedItems: 2000, falsePositiveRate: 0.01 });
    for (let i = 0; i < 2000; i++) f.add(`user-${i}`);
    for (let i = 0; i < 2000; i++) expect(f.has(`user-${i}`)).toBe(true);
    let fp = 0;
    for (let i = 0; i < 10_000; i++) if (f.has(`other-${i}`)) fp++;
    expect(fp / 10_000).toBeLessThan(0.03);
    expect(f.estimatedFalsePositiveRate()).toBeLessThan(0.03);
    expect(f.size).toBe(2000);
    expect(f.hashCount).toBeGreaterThan(1);
    f.clear();
    expect(f.has('user-1')).toBe(false);
  });

  it('supports numbers, bytes, custom keys, and validates sizing', () => {
    const f = new BloomFilter<number | Uint8Array>({ expectedItems: 10 });
    f.add(42).add(new Uint8Array([1, 2, 3]));
    expect(f.has(42)).toBe(true);
    expect(f.has(new Uint8Array([1, 2, 3]))).toBe(true);
    const obj = new BloomFilter<{ id: string }>({ expectedItems: 10, key: (o) => o.id });
    obj.add({ id: 'a' });
    expect(obj.has({ id: 'a' })).toBe(true);
    const bad = new BloomFilter<object>({ expectedItems: 1 });
    expect(() => bad.add({})).toThrow(ValidationError);
    expect(() => new BloomFilter({ expectedItems: 0 })).toThrow(ValidationError);
    expect(() => new BloomFilter({ expectedItems: 10, falsePositiveRate: 1 })).toThrow(ValidationError);
    expect(() => new BloomFilter({ expectedItems: 1e12, falsePositiveRate: 1e-9 })).toThrow(LimitError);
  });
});

describe('TypedEventEmitter', () => {
  interface Events {
    saved: [id: string];
    progress: [done: number, total: number];
    reset: [];
  }

  it('on/off/once/emit with unsubscribe', () => {
    const bus = new TypedEventEmitter<Events>();
    const saved = vi.fn();
    const stop = bus.on('saved', saved);
    const once = vi.fn();
    bus.once('progress', once);
    expect(bus.emit('saved', 'e1')).toBe(true);
    bus.emit('progress', 1, 2);
    bus.emit('progress', 2, 2);
    expect(once).toHaveBeenCalledTimes(1);
    expect(once).toHaveBeenCalledWith(1, 2);
    stop();
    expect(bus.emit('saved', 'e2')).toBe(false);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(bus.off('saved', saved)).toBe(false);
    expect(bus.emit('reset')).toBe(false);
  });

  it('snapshots listeners during emit and counts listeners', () => {
    const bus = new TypedEventEmitter<Events>();
    const late = vi.fn();
    bus.on('reset', () => {
      bus.on('reset', late);
    });
    bus.emit('reset');
    expect(late).not.toHaveBeenCalled();
    expect(bus.listenerCount('reset')).toBe(2);
    bus.on('saved', vi.fn());
    expect(bus.listenerCount()).toBe(3);
    expect(bus.eventNames()).toEqual(['reset', 'saved']);
    bus.removeAllListeners('reset');
    expect(bus.listenerCount('reset')).toBe(0);
    bus.clear();
    expect(bus.listenerCount()).toBe(0);
  });

  it('isolates listener errors when asked, otherwise propagates', () => {
    const onError = vi.fn();
    const bus = new TypedEventEmitter<Events>({ isolateErrors: true, onError });
    const second = vi.fn();
    bus.on('saved', () => {
      throw new Error('bad listener');
    });
    bus.on('saved', second);
    bus.emit('saved', 'x');
    expect(second).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'saved');
    const strict = new TypedEventEmitter<Events>();
    strict.on('reset', () => {
      throw new Error('boom');
    });
    expect(() => strict.emit('reset')).toThrow('boom');
  });

  it('reports max listeners via callback once', () => {
    const onMaxListeners = vi.fn();
    const bus = new TypedEventEmitter<Events>({ maxListeners: 2, onMaxListeners });
    for (let i = 0; i < 5; i++) bus.on('reset', vi.fn());
    expect(onMaxListeners).toHaveBeenCalledTimes(1);
    expect(onMaxListeners).toHaveBeenCalledWith('reset', 3);
  });
});
