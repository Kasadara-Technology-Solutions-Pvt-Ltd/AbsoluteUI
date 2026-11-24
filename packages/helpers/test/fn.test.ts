import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { after, attempt, before, callIf, compose, constant, debounce, identity, memoize, memoizeOne, negate, noop, once, pipe, rafThrottle, safeCall, tap, throttle, unary } from '@absoluteui/helpers/fn';
import { ValidationError } from '@absoluteui/helpers/error';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls once on the trailing edge with the latest arguments', () => {
    const fn = vi.fn((x: number) => x * 2);
    const d = debounce(fn, 100);
    d(1);
    d(2);
    vi.advanceTimersByTime(99);
    d(3);
    expect(fn).not.toHaveBeenCalled();
    expect(d.pending()).toBe(true);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(3);
    expect(d.pending()).toBe(false);
    expect(d(4)).toBe(6);
  });

  it('supports leading edge only', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50, { leading: true, trailing: false });
    d('a');
    d('b');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('a');
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(1);
    d('c');
    expect(fn).toHaveBeenLastCalledWith('c');
  });

  it('leading + trailing calls both edges only when called more than once', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50, { leading: true });
    d(1);
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(1);
    d(2);
    d(3);
    vi.advanceTimersByTime(60);
    expect(fn.mock.calls).toEqual([[1], [2], [3]]);
  });

  it('maxWait forces periodic calls under constant input', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100, { maxWait: 250 });
    for (let t = 0; t < 1000; t += 50) {
      d(t);
      vi.advanceTimersByTime(50);
    }
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('cancel and flush', () => {
    const fn = vi.fn((x: number) => x);
    const d = debounce(fn, 100);
    d(1);
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    d(2);
    expect(d.flush()).toBe(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(d.flush()).toBe(2);
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid waits', () => {
    expect(() => debounce(noop, -1)).toThrow(ValidationError);
    expect(() => debounce(noop, Number.NaN)).toThrow(ValidationError);
    expect(() => debounce(noop, 1, { maxWait: Infinity })).toThrow(ValidationError);
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs on leading edge and at most once per window with trailing latest args', () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t(1);
    t(2);
    t(3);
    expect(fn.mock.calls).toEqual([[1]]);
    vi.advanceTimersByTime(100);
    expect(fn.mock.calls).toEqual([[1], [3]]);
    for (let i = 0; i < 10; i++) {
      t(i);
      vi.advanceTimersByTime(20);
    }
    expect(fn.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('trailing: false drops the trailing call', () => {
    const fn = vi.fn();
    const t = throttle(fn, 100, { trailing: false });
    t(1);
    t(2);
    vi.advanceTimersByTime(150);
    expect(fn.mock.calls).toEqual([[1]]);
    t.cancel();
  });
});

describe('rafThrottle', () => {
  it('coalesces calls into one per frame with the latest args', async () => {
    const fn = vi.fn();
    const r = rafThrottle(fn);
    r(1);
    r(2);
    r(3);
    await new Promise((res) => requestAnimationFrame(() => { res(undefined); }));
    await new Promise((res) => requestAnimationFrame(() => { res(undefined); }));
    expect(fn.mock.calls).toEqual([[3]]);
    r(4);
    r.cancel();
    await new Promise((res) => setTimeout(res, 40));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('falls back to a timer when requestAnimationFrame is missing', () => {
    vi.useFakeTimers();
    const saved = globalThis.requestAnimationFrame;
    Object.defineProperty(globalThis, 'requestAnimationFrame', { value: undefined, configurable: true, writable: true });
    try {
      const fn = vi.fn();
      const r = rafThrottle(fn);
      r('a');
      r('b');
      vi.advanceTimersByTime(16);
      expect(fn.mock.calls).toEqual([['b']]);
    } finally {
      Object.defineProperty(globalThis, 'requestAnimationFrame', { value: saved, configurable: true, writable: true });
      vi.useRealTimers();
    }
  });
});

describe('memoize', () => {
  it('caches by first argument and is bounded (LRU)', () => {
    const fn = vi.fn((n: number) => n * n);
    const m = memoize(fn, { maxSize: 2 });
    expect(m(2)).toBe(4);
    expect(m(2)).toBe(4);
    expect(fn).toHaveBeenCalledTimes(1);
    m(3);
    m(2); // refresh 2
    m(4); // evicts 3
    expect(m.size).toBe(2);
    m(3);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(m.delete(3)).toBe(true);
    m.clear();
    expect(m.size).toBe(0);
  });

  it('custom key resolver and TTL with injected clock', () => {
    let now = 0;
    const fn = vi.fn((a: string, b: string) => a + b);
    const m = memoize(fn, { key: (a, b) => `${a}|${b}`, ttlMs: 100, now: () => now });
    m('x', 'y');
    m('x', 'y');
    m('x', 'z');
    expect(fn).toHaveBeenCalledTimes(2);
    now = 100;
    m('x', 'y');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not cache throws', () => {
    let fail = true;
    const m = memoize((n: number) => {
      if (fail) throw new Error('x');
      return n;
    });
    expect(() => m(1)).toThrow();
    fail = false;
    expect(m(1)).toBe(1);
  });

  it('handles __proto__ as a plain key (Map-based)', () => {
    const m = memoize((k: string) => k.length);
    expect(m('__proto__')).toBe(9);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('validates options', () => {
    expect(() => memoize(identity, { maxSize: 0 })).toThrow(ValidationError);
    expect(() => memoize(identity, { ttlMs: -5 })).toThrow(ValidationError);
  });

  it('memoizeOne compares last arguments', () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const m = memoizeOne(fn);
    m(1, 2);
    m(1, 2);
    m(2, 2);
    m(1, 2);
    expect(fn).toHaveBeenCalledTimes(3);
    const obj = memoizeOne((o: { v: number }) => o.v, (next, prev) => next[0].v === prev[0].v);
    obj({ v: 1 });
    expect(obj({ v: 1 })).toBe(1);
  });
});

describe('call control', () => {
  it('once caches results and errors', () => {
    const fn = vi.fn(() => 42);
    const o = once(fn);
    expect(o()).toBe(42);
    expect(o()).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    const bad = vi.fn((): number => {
      throw new Error('boom');
    });
    const ob = once(bad);
    expect(() => ob()).toThrow('boom');
    expect(() => ob()).toThrow('boom');
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it('before and after', () => {
    const fn = vi.fn((x: number) => x);
    const b = before(3, fn);
    expect([b(1), b(2), b(3), b(4)]).toEqual([1, 2, 2, 2]);
    expect(fn).toHaveBeenCalledTimes(2);
    const a = after(2, (x: number) => x);
    expect([a(1), a(2), a(3)]).toEqual([undefined, 2, 3]);
    expect(() => before(-1, noop)).toThrow(ValidationError);
  });

  it('callIf, safeCall, attempt', () => {
    expect(callIf(true, (a: number, b: number) => a + b, 1, 2)).toBe(3);
    expect(callIf(0, () => 1)).toBeUndefined();
    const onError = vi.fn();
    expect(safeCall((): number => { throw new Error('x'); }, onError)).toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(safeCall(() => 5)).toBe(5);
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- verifies normalization of non-Error throws
    expect(safeCall((): number => { throw 'not an error'; }, onError)).toBeUndefined();
    expect(onError.mock.calls[1]?.[0]).toBeInstanceOf(Error);
    const r = attempt(() => JSON.parse('{') as unknown);
    expect(r.ok).toBe(false);
    expect(attempt(() => 1)).toEqual({ ok: true, value: 1 });
  });
});

describe('composition and small helpers', () => {
  it('pipe and compose agree (property)', () => {
    const inc = (n: number): number => n + 1;
    const dbl = (n: number): number => n * 2;
    const sq = (n: number): number => n * n;
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (n) => {
        expect(pipe(inc, dbl, sq)(n)).toBe(sq(dbl(inc(n))));
        expect(compose(sq, dbl, inc)(n)).toBe(pipe(inc, dbl, sq)(n));
        expect(pipe(inc)(n)).toBe(inc(n));
      }),
    );
  });

  it('pipe passes multiple arguments to the first function and supports 9 steps', () => {
    const add = (a: number, b: number): number => a + b;
    const s = (n: number): string => String(n);
    const len = (x: string): number => x.length;
    expect(pipe(add, s, len, s, len, s, len, s, len)(40, 2)).toBe(1);
    expect(compose(len, s, add)(500, 500)).toBe(4);
  });

  it('identity, constant, negate, tap, unary, noop', () => {
    expect(identity(3)).toBe(3);
    expect(constant('x')()).toBe('x');
    expect([1, 2, 3].filter(negate((n: number) => n > 1))).toEqual([1]);
    const seen: number[] = [];
    expect([1, 2].map(tap((n: number) => seen.push(n)))).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
    expect(['1', '2', '3'].map(unary(parseInt))).toEqual([1, 2, 3]);
    noop(1, 2);
  });
});
