import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import {
  abortReason,
  anySignal,
  asyncPipe,
  backoffDelay,
  collectAsync,
  createBatcher,
  createLimiter,
  createSerialQueue,
  debounceAsync,
  deferred,
  forEachAsync,
  mapLimit,
  mapLimitSettled,
  partitionSettled,
  poll,
  raceSignal,
  retry,
  singleFlight,
  sleep,
  timeout,
  timeoutSignal,
  toAsyncIterable,
  withCancel,
} from '@absoluteui/helpers/async';
import { AbortError, HelperError, TimeoutError, ValidationError, isAbortError } from '@absoluteui/helpers/error';

afterEach(() => {
  vi.useRealTimers();
});

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('sleep', () => {
  it('resolves after the delay', async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void sleep(100).then(done);
    await vi.advanceTimersByTimeAsync(99);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it('rejects with AbortError and clears the timer on abort', async () => {
    vi.useFakeTimers();
    const ctrl = new AbortController();
    const p = sleep(10_000, { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(vi.getTimerCount()).toBe(0);
    await expect(sleep(1, { signal: ctrl.signal })).rejects.toBeInstanceOf(AbortError);
  });

  it('passes a HelperError reason through and validates ms', async () => {
    const ctrl = new AbortController();
    const reason = new TimeoutError();
    ctrl.abort(reason);
    await expect(sleep(5, { signal: ctrl.signal })).rejects.toBe(reason);
    expect(() => sleep(-1)).toThrow(ValidationError);
    expect(() => sleep(2 ** 31)).toThrow(ValidationError);
  });
});

describe('signals', () => {
  it('abortReason maps timeout reasons to TimeoutError', () => {
    const ctrl = new AbortController();
    ctrl.abort(new DOMException('t', 'TimeoutError'));
    expect(abortReason(ctrl.signal)).toBeInstanceOf(TimeoutError);
    const c2 = new AbortController();
    c2.abort('why');
    const e = abortReason(c2.signal);
    expect(e).toBeInstanceOf(AbortError);
    expect(e.message).not.toContain('why');
  });

  it('anySignal aborts when any input aborts', () => {
    const a = new AbortController();
    const b = new AbortController();
    const s = anySignal([a.signal, undefined, b.signal]);
    expect(s.aborted).toBe(false);
    b.abort('b');
    expect(s.aborted).toBe(true);
    expect(s.reason).toBe('b');
  });

  it('timeoutSignal aborts after ms', async () => {
    const s = timeoutSignal(10);
    await new Promise((r) => setTimeout(r, 40));
    expect(s.aborted).toBe(true);
    expect(abortReason(s)).toBeInstanceOf(TimeoutError);
  });

  it('raceSignal rejects on abort and passes through otherwise', async () => {
    const ctrl = new AbortController();
    const never = new Promise<number>(() => undefined);
    const p = raceSignal(never, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toSatisfy(isAbortError);
    await expect(raceSignal(Promise.resolve(1), new AbortController().signal)).resolves.toBe(1);
    await expect(raceSignal(Promise.reject(new Error('x')), undefined)).rejects.toThrow('x');
  });

  it('withCancel aborts the inner signal', async () => {
    let inner: AbortSignal | undefined;
    const h = withCancel((signal) => {
      inner = signal;
      return new Promise<never>(() => undefined);
    });
    await tick();
    h.cancel();
    await expect(h.promise).rejects.toBeInstanceOf(AbortError);
    expect(inner?.aborted).toBe(true);
  });

  it('deferred settles from outside', async () => {
    const d = deferred<number>();
    d.resolve(5);
    await expect(d.promise).resolves.toBe(5);
    const e = deferred<number>();
    e.reject(new Error('no'));
    await expect(e.promise).rejects.toThrow('no');
  });
});

describe('timeout', () => {
  it('rejects with TimeoutError and aborts the inner work', async () => {
    vi.useFakeTimers();
    let inner: AbortSignal | undefined;
    const p = timeout((signal) => {
      inner = signal;
      return new Promise<never>(() => undefined);
    }, 50, { message: 'Too slow.' });
    const assertion = expect(p).rejects.toMatchObject({ name: 'TimeoutError', code: 'HLP_TIMEOUT', message: 'Too slow.' });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(inner?.aborted).toBe(true);
  });

  it('resolves in time and clears the timer', async () => {
    vi.useFakeTimers();
    const p = timeout(Promise.resolve(7), 1000);
    await expect(p).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates inner errors and outer aborts', async () => {
    await expect(timeout(() => { throw new Error('sync'); }, 100)).rejects.toThrow('sync');
    await expect(timeout(Promise.reject(new Error('async')), 100)).rejects.toThrow('async');
    const ctrl = new AbortController();
    const p = timeout(new Promise<never>(() => undefined), 10_000, { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });
});

describe('retry', () => {
  it('retries with backoff until success', async () => {
    let calls = 0;
    const onRetry = vi.fn();
    const result = await retry(
      (attempt) => {
        calls++;
        if (attempt < 3) throw new Error('flaky');
        return 'ok';
      },
      { minDelay: 1, jitter: 'none', onRetry },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(onRetry.mock.calls.map((c): unknown => c[2])).toEqual([1, 2]);
  });

  it('rejects with the last error after retries and respects retryIf', async () => {
    const err = new Error('always');
    const fn = vi.fn(() => Promise.reject(err));
    await expect(retry(fn, { retries: 2, minDelay: 0 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
    const fn2 = vi.fn(() => Promise.reject(new Error('fatal')));
    await expect(retry(fn2, { retryIf: () => false })).rejects.toThrow('fatal');
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('never retries AbortError and stops on signal abort', async () => {
    const fn = vi.fn(() => Promise.reject(new AbortError()));
    await expect(retry(fn, { minDelay: 0 })).rejects.toBeInstanceOf(AbortError);
    expect(fn).toHaveBeenCalledTimes(1);
    const dom = vi.fn(() => Promise.reject(new DOMException('x', 'AbortError')));
    await expect(retry(dom, { minDelay: 0 })).rejects.toSatisfy(isAbortError);
    expect(dom).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    const ctrl = new AbortController();
    const slow = vi.fn(() => Promise.reject(new Error('x')));
    const p = retry(slow, { minDelay: 10_000, jitter: 'none', signal: ctrl.signal });
    const assertion = expect(p).rejects.toBeInstanceOf(AbortError);
    await vi.advanceTimersByTimeAsync(10);
    ctrl.abort();
    await assertion;
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it('delayFor overrides the computed delay (Retry-After)', async () => {
    const onRetry = vi.fn();
    let n = 0;
    await retry(() => (n++ === 0 ? Promise.reject(new Error('429')) : Promise.resolve(1)), { delayFor: () => 3, onRetry, minDelay: 1000 });
    expect(onRetry.mock.calls[0]?.[2]).toBe(3);
  });

  it('backoff jitter stays within bounds (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.double({ min: 0, max: 0.999999, noNaN: true }), fc.constantFrom('full', 'equal', 'none'), (attempt, r, jitter) => {
        const base = Math.min(30_000, 100 * 2 ** (attempt - 1));
        const d = backoffDelay(attempt, { jitter, random: () => r });
        expect(d).toBeGreaterThanOrEqual(jitter === 'equal' ? base / 2 : jitter === 'none' ? base : 0);
        expect(d).toBeLessThanOrEqual(base);
      }),
    );
    const d = backoffDelay(2);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(200);
  });

  it('validates options', async () => {
    await expect(retry(() => 1, { retries: -1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(retry(() => 1, { factor: 0.5 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('mapLimit', () => {
  it('preserves order and respects the limit', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3], 2, async (n, i) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, n));
      active--;
      return n * 10 + i;
    });
    expect(out).toEqual([50, 11, 42, 23, 34]);
    expect(peak).toBe(2);
  });

  it('property: equals Array.map for any limit', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer(), { maxLength: 30 }), fc.integer({ min: 1, max: 8 }), async (items, limit) => {
        const out = await mapLimit(items, limit, (x) => Promise.resolve(x * 2));
        expect(out).toEqual(items.map((x) => x * 2));
      }),
      { numRuns: 50 },
    );
  });

  it('stops on first error and aborts the shared signal', async () => {
    const signals: AbortSignal[] = [];
    const started: number[] = [];
    const p = mapLimit([1, 2, 3, 4, 5, 6], 2, async (n, _i, signal) => {
      started.push(n);
      signals.push(signal);
      await tick();
      if (n === 2) throw new Error('bad');
      return n;
    });
    await expect(p).rejects.toThrow('bad');
    expect(signals[0]?.aborted).toBe(true);
    expect(started.length).toBeLessThan(6);
  });

  it('stopOnError false runs everything and aggregates failures; settled variant keeps results', async () => {
    const seen: number[] = [];
    const p = mapLimit([1, 2, 3], 1, (n) => {
      seen.push(n);
      if (n !== 2) return n;
      throw new Error('two');
    }, { stopOnError: false });
    await expect(p).rejects.toMatchObject({ code: 'HLP_ASYNC_MAP_FAILED', details: { failed: 1, total: 3 } });
    expect(seen).toEqual([1, 2, 3]);
    const settled = await mapLimitSettled([1, 2, 3], 2, (n) => (n === 2 ? Promise.reject(new Error('two')) : n));
    const { fulfilled, rejected } = partitionSettled(settled);
    expect(fulfilled).toEqual([1, 3]);
    expect(rejected).toHaveLength(1);
  });

  it('handles empty input, abort, and invalid limits', async () => {
    await expect(mapLimit([], 3, (x) => x)).resolves.toEqual([]);
    const ctrl = new AbortController();
    const p = mapLimit([1, 2, 3], 1, () => new Promise<number>(() => undefined), { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
    await expect(mapLimit([1], 0, (x) => x)).rejects.toBeInstanceOf(ValidationError);
    await expect(mapLimit([1], 1.5, (x) => x)).rejects.toBeInstanceOf(ValidationError);
  });

  it('pulls a lazy iterable without materializing it', async () => {
    let pulled = 0;
    function* gen(): Generator<number> {
      for (let i = 0; i < 1_000; i++) {
        pulled++;
        yield i;
      }
    }
    const out = await mapLimit(gen(), 4, (x) => x);
    expect(out).toHaveLength(1000);
    expect(pulled).toBe(1000);
  });
});

describe('createLimiter', () => {
  it('limits concurrency, tracks counts, and resolves onIdle', async () => {
    const limiter = createLimiter(2);
    const gates = [deferred<undefined>(), deferred<undefined>(), deferred<undefined>()];
    const results = gates.map((g, i) => limiter.schedule(async () => {
      await g.promise;
      return i;
    }));
    await tick();
    expect(limiter.active).toBe(2);
    expect(limiter.pending).toBe(1);
    gates.forEach((g) => { g.resolve(undefined); });
    await expect(Promise.all(results)).resolves.toEqual([0, 1, 2]);
    await limiter.onIdle();
    expect(limiter.active + limiter.pending).toBe(0);
  });

  it('drops aborted queued tasks and clear() rejects pending', async () => {
    const limiter = createLimiter(1);
    const gate = deferred<undefined>();
    const first = limiter.schedule(() => gate.promise);
    const ctrl = new AbortController();
    const second = limiter.schedule(() => 'never', { signal: ctrl.signal });
    const third = limiter.schedule(() => 'never');
    ctrl.abort();
    await expect(second).rejects.toBeInstanceOf(AbortError);
    expect(limiter.pending).toBe(1);
    limiter.clear();
    await expect(third).rejects.toMatchObject({ code: 'HLP_ASYNC_QUEUE_CLEARED' });
    gate.resolve(undefined);
    await first;
    await limiter.onIdle();
  });

  it('serial queue runs tasks in order one at a time', async () => {
    const q = createSerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => q.schedule(async () => {
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
    });
    await Promise.all([task('a', 10), task('b', 1)]);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('propagates task errors without breaking the queue', async () => {
    const limiter = createLimiter(1);
    await expect(limiter.schedule(() => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(limiter.schedule(() => 2)).resolves.toBe(2);
  });
});

describe('poll', () => {
  it('resolves when until holds', async () => {
    let n = 0;
    const v = await poll(() => ++n, { interval: 1, until: (x) => x >= 3 });
    expect(v).toBe(3);
  });

  it('times out with TimeoutError and aborts the in-flight call', async () => {
    let lastSignal: AbortSignal | undefined;
    const p = poll((signal) => {
      lastSignal = signal;
      return false;
    }, { interval: 5, timeout: 30 });
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
    expect(lastSignal?.aborted).toBe(true);
  });
});

describe('batching and de-duplication', () => {
  it('createBatcher coalesces and de-duplicates keys in one call', async () => {
    const loadMany = vi.fn((keys: number[]) => Promise.resolve(keys.map((k) => (k === 3 ? new Error('missing') : k * 10))));
    const b = createBatcher(loadMany);
    const p = Promise.allSettled([b.load(1), b.load(2), b.load(1), b.load(3)]);
    const [a, c, d, e] = await p;
    expect(loadMany).toHaveBeenCalledTimes(1);
    expect(loadMany).toHaveBeenCalledWith([1, 2, 3]);
    expect(a).toEqual({ status: 'fulfilled', value: 10 });
    expect(c).toEqual({ status: 'fulfilled', value: 20 });
    expect(d).toEqual({ status: 'fulfilled', value: 10 });
    expect(e.status).toBe('rejected');
  });

  it('createBatcher splits by maxBatchSize and detects length mismatch', async () => {
    const loadMany = vi.fn((keys: string[]) => keys.map((k) => k.toUpperCase()));
    const b = createBatcher(loadMany, { maxBatchSize: 2 });
    await expect(b.loadMany(['a', 'b', 'c'])).resolves.toEqual(['A', 'B', 'C']);
    expect(loadMany).toHaveBeenCalledTimes(2);
    const broken = createBatcher((keys: number[]) => keys.slice(1));
    await expect(Promise.all([broken.load(1), broken.load(2)])).rejects.toMatchObject({ code: 'HLP_ASYNC_BATCH_LENGTH' });
    const failing = createBatcher((): number[] => { throw new Error('down'); });
    await expect(failing.load(1)).rejects.toThrow('down');
  });

  it('createBatcher with delay uses a timer', async () => {
    vi.useFakeTimers();
    const loadMany = vi.fn((keys: number[]) => keys);
    const b = createBatcher(loadMany, { delay: 20 });
    const p1 = b.load(1);
    await vi.advanceTimersByTimeAsync(10);
    const p2 = b.load(2);
    await vi.advanceTimersByTimeAsync(10);
    await expect(Promise.all([p1, p2])).resolves.toEqual([1, 2]);
    expect(loadMany).toHaveBeenCalledTimes(1);
  });

  it('singleFlight shares in-flight calls per key', async () => {
    const fn = vi.fn(async (k: string) => {
      await tick();
      return k + '!';
    });
    const sf = singleFlight(fn);
    const [a, b, c] = await Promise.all([sf('x'), sf('x'), sf('y')]);
    expect([a, b, c]).toEqual(['x!', 'x!', 'y!']);
    expect(fn).toHaveBeenCalledTimes(2);
    await sf('x');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('debounceAsync runs only the latest call and resolves every caller with it', async () => {
    vi.useFakeTimers();
    const fn = vi.fn((q: string) => Promise.resolve(q.toUpperCase()));
    const search = debounceAsync(fn, 50);
    const p1 = search('a');
    const p2 = search('ab');
    await vi.advanceTimersByTimeAsync(50);
    await expect(Promise.all([p1, p2])).resolves.toEqual(['AB', 'AB']);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('debounceAsync discards a run superseded while in flight', async () => {
    vi.useFakeTimers();
    const gates = new Map<string, ReturnType<typeof deferred<string>>>();
    const fn = (q: string): Promise<string> => {
      const d = deferred<string>();
      gates.set(q, d);
      return d.promise;
    };
    const search = debounceAsync(fn, 10);
    const p1 = search('old');
    await vi.advanceTimersByTimeAsync(10); // 'old' is running
    const p2 = search('new');
    await vi.advanceTimersByTimeAsync(10); // 'new' is running
    gates.get('new')?.resolve('NEW');
    await vi.advanceTimersByTimeAsync(0);
    gates.get('old')?.resolve('OLD');
    await expect(Promise.all([p1, p2])).resolves.toEqual(['NEW', 'NEW']);
  });

  it('debounceAsync cancel rejects waiters', async () => {
    vi.useFakeTimers();
    const search = debounceAsync((q: string) => q, 50);
    const p = search('x');
    search.cancel();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });
});

describe('iteration helpers', () => {
  it('asyncPipe awaits each step', async () => {
    const f = asyncPipe((a: number, b: number) => Promise.resolve(a + b), (n) => n * 2, (n) => Promise.resolve(String(n)));
    await expect(f(1, 2)).resolves.toBe('6');
  });

  it('forEachAsync runs sequentially and honours abort', async () => {
    const log: number[] = [];
    await forEachAsync([1, 2, 3], async (n) => {
      await tick();
      log.push(n);
    });
    expect(log).toEqual([1, 2, 3]);
    const ctrl = new AbortController();
    const p = forEachAsync([1, 2, 3], (n) => {
      if (n === 2) ctrl.abort();
    }, { signal: ctrl.signal });
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  it('toAsyncIterable and collectAsync with limit close the source', async () => {
    await expect(collectAsync(toAsyncIterable([Promise.resolve(1), 2, Promise.resolve(3)]))).resolves.toEqual([1, 2, 3]);
    let closed = false;
    async function* source(): AsyncGenerator<number> {
      try {
        for (let i = 0; ; i++) yield await Promise.resolve(i);
      } finally {
        closed = true;
      }
    }
    await expect(collectAsync(source(), { limit: 3 })).resolves.toEqual([0, 1, 2]);
    expect(closed).toBe(true);
    await expect(collectAsync([1, 2], { limit: 0 })).resolves.toEqual([]);
    await expect(collectAsync([1], { limit: -1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('error types are HelperErrors', () => {
    expect(new TimeoutError()).toBeInstanceOf(HelperError);
  });
});
