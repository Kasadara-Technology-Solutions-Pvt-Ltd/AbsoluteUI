import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { isAbortError } from '@absoluteui/helpers/error';
import { deferred } from '@absoluteui/helpers/async';
import { createAsyncCache } from '@absoluteui/services/cache';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('createAsyncCache', () => {
  it('dedupes concurrent loads (single-flight) and serves hits', async () => {
    let calls = 0;
    const c = createAsyncCache({ load: async (k: string) => { calls++; await tick(); return k.toUpperCase(); } });
    const [a, b, d] = await Promise.all([c.get('x'), c.get('x'), c.get('y')]);
    expect([a, b, d]).toEqual(['X', 'X', 'Y']);
    expect(calls).toBe(2);
    expect(await c.get('x')).toBe('X');
    expect(c.stats()).toMatchObject({ hits: 1, misses: 3, loads: 2, size: 2 });
    expect(c.peek('x')).toBe('X');
    expect(c.has('z')).toBe(false);
  });

  it('expires after ttl and serves stale while revalidating', async () => {
    let t = 0;
    let version = 0;
    const errors: Error[] = [];
    const c = createAsyncCache({ load: () => Promise.resolve(++version), ttlMs: 100, staleWhileRevalidateMs: 100, now: () => t, onError: (e) => errors.push(e) });
    expect(await c.get('k')).toBe(1);
    t = 150;
    expect(await c.get('k')).toBe(1); // stale, revalidation started
    await tick();
    expect(await c.get('k')).toBe(2);
    expect(c.stats().stale).toBe(1);
    t = 400; // beyond stale window → blocking load
    expect(await c.get('k')).toBe(3);
    expect(errors).toEqual([]);
  });

  it('keeps the stale value when revalidation fails and reports the error', async () => {
    let t = 0;
    let fail = false;
    const errors: string[] = [];
    const c = createAsyncCache({ load: () => (fail ? Promise.reject(new Error('down')) : Promise.resolve('ok')), ttlMs: 10, staleWhileRevalidateMs: 1000, now: () => t, onError: (e) => errors.push(e.message) });
    await c.get('k');
    fail = true;
    t = 20;
    expect(await c.get('k')).toBe('ok');
    await tick();
    expect(errors).toEqual(['down']);
    expect(await c.get('k')).toBe('ok');
  });

  it('does not cache errors by default; negative caching is opt-in', async () => {
    let calls = 0;
    const c = createAsyncCache({ load: () => { calls++; return Promise.reject(new Error('nope')); } });
    await expect(c.get('a')).rejects.toThrow('nope');
    await expect(c.get('a')).rejects.toThrow('nope');
    expect(calls).toBe(2);
    let t = 0;
    let n = 0;
    const neg = createAsyncCache({ load: () => { n++; throw new Error('sync'); }, errorTtlMs: 50, now: () => t });
    await expect(neg.get('a')).rejects.toThrow('sync');
    await expect(neg.get('a')).rejects.toThrow('sync');
    expect(n).toBe(1);
    t = 60;
    await expect(neg.get('a')).rejects.toThrow('sync');
    expect(n).toBe(2);
    expect(neg.stats().errors).toBe(2);
  });

  it('aborts the shared load only when every waiter aborted', async () => {
    const signals: AbortSignal[] = [];
    const gate = deferred<string>();
    const c = createAsyncCache({ load: (_k: string, signal) => { signals.push(signal); return gate.promise; } });
    const c1 = new AbortController();
    const c2 = new AbortController();
    const p1 = c.get('k', { signal: c1.signal });
    const p2 = c.get('k', { signal: c2.signal });
    await tick();
    c1.abort();
    await expect(p1).rejects.toSatisfy(isAbortError);
    expect(signals[0]?.aborted).toBe(false);
    c2.abort();
    await expect(p2).rejects.toSatisfy(isAbortError);
    expect(signals[0]?.aborted).toBe(true);
    const pre = new AbortController();
    pre.abort();
    await expect(c.get('z', { signal: pre.signal })).rejects.toSatisfy(isAbortError);
  });

  it('invalidate discards in-flight results; prime, force, clear, invalidateWhere', async () => {
    const gate = deferred<number>();
    let calls = 0;
    const c = createAsyncCache({ load: (k: number) => { calls++; return k === 1 ? gate.promise : Promise.resolve(k * 10); } });
    const p = c.get(1);
    await tick();
    c.invalidate(1);
    gate.resolve(99);
    expect(await p).toBe(99);
    expect(c.peek(1)).toBeUndefined();
    c.prime(1, 5);
    expect(await c.get(1)).toBe(5);
    expect(await c.get(2, { force: true })).toBe(20);
    await c.get(3);
    expect(c.invalidateWhere((k) => k > 1)).toBe(2);
    expect(c.stats().size).toBe(1);
    c.clear();
    expect(c.stats().size).toBe(0);
    expect(calls).toBe(3);
  });

  it('bounds size with LRU and supports object keys through keyFn', async () => {
    const c = createAsyncCache({ load: (k: { id: number }) => k.id, maxSize: 2, keyFn: (k) => k.id });
    await c.get({ id: 1 });
    await c.get({ id: 2 });
    await c.get({ id: 1 });
    await c.get({ id: 3 });
    expect(c.has({ id: 1 })).toBe(true);
    expect(c.has({ id: 2 })).toBe(false);
    expect(c.stats().size).toBe(2);
  });

  it('validates options', () => {
    expect(() => createAsyncCache({ load: () => 1, ttlMs: -1 })).toThrow();
    expect(() => createAsyncCache({ load: undefined as unknown as () => number })).toThrow();
  });

  it('property: sequential gets equal a pure oracle with at most one load per key', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 40 }), async (keys) => {
        const loads = new Map<number, number>();
        const c = createAsyncCache({ load: (k: number) => { loads.set(k, (loads.get(k) ?? 0) + 1); return k * 2; } });
        const out = await Promise.all(keys.map((k) => c.get(k)));
        expect(out).toEqual(keys.map((k) => k * 2));
        for (const n of loads.values()) expect(n).toBe(1);
      }),
      { numRuns: 50 },
    );
  });
});
