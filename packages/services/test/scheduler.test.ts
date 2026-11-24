import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAbortError } from '@absoluteui/helpers/error';
import { countdown, createTaskScheduler, interval, runChunked, scheduleFrame, scheduleIdle, yieldToMain } from '@absoluteui/services/scheduler';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('idle, frame, yield', () => {
  it('scheduleIdle runs and can be cancelled', async () => {
    const d = await new Promise<{ didTimeout: boolean; remaining: number }>((resolve) => {
      scheduleIdle((dl) => {
        resolve({ didTimeout: dl.didTimeout, remaining: dl.timeRemaining() });
      }, { timeout: 200 });
    });
    expect(d.remaining).toBeGreaterThanOrEqual(0);
    let ran = false;
    scheduleIdle(() => (ran = true)).cancel();
    await new Promise((r) => setTimeout(r, 100));
    expect(ran).toBe(false);
  });
  it('scheduleIdle falls back to setTimeout', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const remaining = await new Promise<number>((resolve) => {
      scheduleIdle((dl) => {
        resolve(dl.timeRemaining());
      });
    });
    expect(remaining).toBeGreaterThan(0);
  });
  it('scheduleFrame runs before paint and cancels; falls back without rAF', async () => {
    const t = await new Promise<number>((resolve) => {
      scheduleFrame(resolve);
    });
    expect(t).toBeGreaterThan(0);
    let ran = false;
    scheduleFrame(() => (ran = true)).cancel();
    vi.stubGlobal('requestAnimationFrame', undefined);
    await new Promise<number>((resolve) => {
      scheduleFrame(resolve);
    });
    expect(ran).toBe(false);
  });
  it('yieldToMain resolves with and without scheduler.yield / MessageChannel', async () => {
    await yieldToMain();
    vi.stubGlobal('scheduler', undefined);
    await yieldToMain();
    vi.stubGlobal('MessageChannel', undefined);
    await yieldToMain();
  });
});

describe('runChunked', () => {
  it('maps in order and yields when the budget is spent', async () => {
    const items = Array.from({ length: 2000 }, (_, i) => i);
    let yields = 0;
    const out = await runChunked(
      items,
      (x) => {
        const end = performance.now() + 0.01;
        while (performance.now() < end) {
          /* busy */
        }
        return x * 2;
      },
      { budgetMs: 1 },
    );
    expect(out.length).toBe(2000);
    expect(out[1999]).toBe(3998);
    // Count yields through a stubbed scheduler.yield.
    vi.stubGlobal('scheduler', { yield: () => { yields++; return Promise.resolve(); } });
    await runChunked(items, (x) => {
      const end = performance.now() + 0.01;
      while (performance.now() < end) {
        /* busy */
      }
      return x;
    }, { budgetMs: 1 });
    expect(yields).toBeGreaterThan(2);
  });
  it('aborts between chunks and validates the budget', async () => {
    const ctrl = new AbortController();
    const p = runChunked(Array.from({ length: 100_000 }, (_, i) => i), (x) => {
      if (x === 10) ctrl.abort();
      const end = performance.now() + 0.01;
      while (performance.now() < end) {
        /* busy */
      }
      return x;
    }, { budgetMs: 1, signal: ctrl.signal });
    await expect(p).rejects.toSatisfy(isAbortError);
    await expect(runChunked([1], (x) => x, { budgetMs: 0 })).rejects.toMatchObject({ code: 'SVC_SCHEDULER_INVALID_BUDGET' });
  });
});

describe('createTaskScheduler', () => {
  it('runs tasks serially and resolves results; clear rejects queued tasks', async () => {
    const s = createTaskScheduler({ budgetMs: 4 });
    const order: number[] = [];
    const results = await Promise.all([1, 2, 3].map((n) => s.schedule(async () => { order.push(n); await Promise.resolve(); return n * 10; })));
    expect(results).toEqual([10, 20, 30]);
    expect(order).toEqual([1, 2, 3]);
    await expect(s.schedule(() => { throw new Error('x'); })).rejects.toThrow('x');
    const blocker = s.schedule(() => new Promise((r) => setTimeout(r, 20)));
    const queued = s.schedule(() => 1);
    expect(s.pending).toBe(1);
    s.clear();
    await expect(queued).rejects.toSatisfy(isAbortError);
    await blocker;
    expect(await s.runChunked([1, 2], (x) => x + 1)).toEqual([2, 3]);
  });
});

describe('interval', () => {
  it('ticks drift-corrected, supports immediate and signal', async () => {
    vi.useFakeTimers({ now: 0 });
    const times: number[] = [];
    const ctrl = new AbortController();
    interval(() => {
      times.push(Date.now());
      // Simulate a slow callback: the next tick should still land on the grid.
      vi.setSystemTime(Date.now() + 30);
    }, 100, { immediate: true, signal: ctrl.signal });
    await vi.advanceTimersByTimeAsync(350);
    // Each callback costs 30 ms, yet ticks stay on the 100 ms grid instead of drifting to 130, 260, …
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect(times.every((t) => t % 100 === 0)).toBe(true);
    const count = times.length;
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(500);
    expect(times.length).toBe(count);
  });
  it('never overlaps async callbacks and reports errors', async () => {
    vi.useFakeTimers({ now: 0 });
    let active = 0;
    let maxActive = 0;
    const errors: unknown[] = [];
    const h = interval(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 250));
      active--;
      throw new Error('e');
    }, 100, { onError: (e) => errors.push(e) });
    await vi.advanceTimersByTimeAsync(1000);
    h.cancel();
    expect(maxActive).toBe(1);
    expect(errors.length).toBeGreaterThan(1);
    expect(() => interval(() => undefined, 0)).toThrow();
  });
  it('pauses while hidden', async () => {
    vi.useFakeTimers({ now: 0 });
    let state = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state as DocumentVisibilityState);
    let n = 0;
    const h = interval(() => n++, 100, { pauseWhenHidden: true });
    await vi.advanceTimersByTimeAsync(250);
    expect(n).toBe(2);
    state = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(n).toBe(2);
    state = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(n).toBe(3);
    await vi.advanceTimersByTimeAsync(100);
    expect(n).toBe(4);
    h.cancel();
    vi.restoreAllMocks();
  });
});

describe('countdown', () => {
  it('ticks on interval boundaries, completes, and can be reset', async () => {
    vi.useFakeTimers({ now: 0 });
    const ticks: number[] = [];
    let done = 0;
    const c = countdown(3500, (ms) => ticks.push(ms), { onComplete: () => done++ });
    expect(ticks).toEqual([3500]);
    await vi.advanceTimersByTimeAsync(3500);
    expect(ticks).toEqual([3500, 3000, 2000, 1000, 0]);
    expect(done).toBe(1);
    expect(c.remaining).toBe(0);
    c.reset(Date.now() + 2000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.remaining).toBe(1000);
    c.cancel();
    c.reset(Date.now() + 5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(done).toBe(1);
  });
  it('honours signals and validates input', async () => {
    vi.useFakeTimers({ now: 0 });
    const ctrl = new AbortController();
    const ticks: number[] = [];
    countdown(5000, (ms) => ticks.push(ms), { signal: ctrl.signal });
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ticks).toEqual([5000]);
    expect(() => countdown(Number.NaN, () => undefined)).toThrow();
    expect(() => countdown(1, () => undefined, { intervalMs: 1 })).toThrow();
  });
});
