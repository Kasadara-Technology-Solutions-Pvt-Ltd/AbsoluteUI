/**
 * Main-thread friendly scheduling: idle and frame callbacks, yielding, chunked work (INP), drift-corrected
 * intervals and countdowns (docs/PLAN-HELPERS.md section 3). SSR-safe: every API falls back to timers.
 */
import { ValidationError } from '@absoluteui/helpers/error';
import { abortReason, throwIfAborted } from '@absoluteui/helpers/async';

/** Cancellable scheduled callback. */
export interface TaskHandle {
  /** Cancels if not yet run. Idempotent. */
  cancel(): void;
}

/** Deadline passed to idle callbacks. */
export interface IdleDeadlineLike {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}

interface SchedulerGlobal {
  requestIdleCallback?: (cb: (d: IdleDeadline) => void, opts?: { timeout?: number }) => number;
  cancelIdleCallback?: (id: number) => void;
  requestAnimationFrame?: (cb: (t: number) => void) => number;
  cancelAnimationFrame?: (id: number) => void;
  scheduler?: { yield?: () => Promise<void> };
  MessageChannel?: typeof MessageChannel;
  document?: { visibilityState?: string; addEventListener?: (t: string, l: () => void) => void; removeEventListener?: (t: string, l: () => void) => void };
}
const G = (): SchedulerGlobal => globalThis;
const nowMs = (): number => (typeof performance === 'object' && typeof performance.now === 'function' ? performance.now() : Date.now());

/**
 * Runs `fn` when the browser is idle (`requestIdleCallback`), or after a short timeout where unsupported.
 * @example
 * const queue = ['audit-1', 'audit-2', 'audit-3'];
 * const sent: string[] = [];
 * scheduleIdle((d) => { while (d.timeRemaining() > 1 && queue.length > 0) sent.push(queue.shift() ?? ''); }, { timeout: 2000 });
 */
export function scheduleIdle(fn: (deadline: IdleDeadlineLike) => void, options: { readonly timeout?: number } = {}): TaskHandle {
  const g = G();
  if (typeof g.requestIdleCallback === 'function' && typeof g.cancelIdleCallback === 'function') {
    const cancelIdle = g.cancelIdleCallback;
    const id = g.requestIdleCallback.call(globalThis, (d) => {
      fn(d);
    }, options.timeout === undefined ? undefined : { timeout: options.timeout });
    return {
      cancel: () => {
        cancelIdle.call(globalThis, id);
      },
    };
  }
  const t = setTimeout(() => {
    const start = nowMs();
    fn({ didTimeout: false, timeRemaining: () => Math.max(0, 50 - (nowMs() - start)) });
  }, 1);
  return {
    cancel: () => {
      clearTimeout(t);
    },
  };
}

/**
 * Runs `fn` before the next paint (`requestAnimationFrame`), or after about 16 ms where unsupported.
 * @example
 * const panel = document.createElement('div');
 * scheduleFrame(() => panel.classList.add('open'));
 */
export function scheduleFrame(fn: (time: number) => void): TaskHandle {
  const g = G();
  if (typeof g.requestAnimationFrame === 'function' && typeof g.cancelAnimationFrame === 'function') {
    const cancelFrame = g.cancelAnimationFrame;
    const id = g.requestAnimationFrame.call(globalThis, fn);
    return {
      cancel: () => {
        cancelFrame.call(globalThis, id);
      },
    };
  }
  const t = setTimeout(() => {
    fn(nowMs());
  }, 16);
  return {
    cancel: () => {
      clearTimeout(t);
    },
  };
}

/**
 * Yields to the event loop so input and rendering can run: `scheduler.yield()` when present (keeps priority),
 * else a `MessageChannel` macrotask, else `setTimeout(0)`.
 * @example
 * const rows = Array.from({ length: 1000 }, (_, i) => `Row ${i + 1}`);
 * const list = document.createElement('ul');
 * for (const [i, row] of rows.entries()) {
 *   list.append(Object.assign(document.createElement('li'), { textContent: row }));
 *   if ((i + 1) % 100 === 0) await yieldToMain();
 * }
 */
export function yieldToMain(): Promise<void> {
  const g = G();
  const y = g.scheduler?.yield;
  if (typeof y === 'function') return y.call(g.scheduler);
  const MC = g.MessageChannel;
  if (typeof MC === 'function') {
    return new Promise<void>((resolve) => {
      const ch = new MC();
      ch.port1.onmessage = () => {
        ch.port1.close();
        resolve();
      };
      ch.port2.postMessage(null);
      ch.port2.close();
    });
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Options for {@link runChunked}. */
export interface RunChunkedOptions {
  /** Work time before yielding, in ms. Default 8 (keeps tasks well under the 50 ms long-task threshold). */
  readonly budgetMs?: number;
  /** Aborts between items (rejects with `AbortError`). */
  readonly signal?: AbortSignal;
}

/**
 * Processes `items` in time-sliced chunks, yielding to the main thread whenever `budgetMs` is used up, so
 * large loops do not cause long tasks (better INP). Resolves the mapped results in order.
 * @example
 * const records = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }];
 * const rows = await runChunked(records, (r) => `${r.id}: ${r.name}`, { budgetMs: 8 });
 * rows; // => ['1: Ada', '2: Grace']
 */
export async function runChunked<T, R>(items: Iterable<T>, fn: (item: T, index: number) => R, options: RunChunkedOptions = {}): Promise<R[]> {
  const { budgetMs = 8, signal } = options;
  if (!(Number.isFinite(budgetMs) && budgetMs > 0)) throw new ValidationError('SVC_SCHEDULER_INVALID_BUDGET', 'budgetMs must be a positive number.');
  throwIfAborted(signal);
  const out: R[] = [];
  let sliceStart = nowMs();
  let i = 0;
  for (const item of items) {
    out.push(fn(item, i++));
    if (nowMs() - sliceStart >= budgetMs) {
      await yieldToMain();
      throwIfAborted(signal);
      sliceStart = nowMs();
    }
  }
  return out;
}

/** Scheduler returned by {@link createTaskScheduler}. */
export interface TaskScheduler {
  /** Queues `task`; tasks run in order, yielding between them once the budget is used. Resolves the task's result. */
  schedule<R>(task: () => R | Promise<R>): Promise<Awaited<R>>;
  /** {@link runChunked} with this scheduler's budget. */
  runChunked<T, R>(items: Iterable<T>, fn: (item: T, index: number) => R, options?: { readonly signal?: AbortSignal }): Promise<R[]>;
  /** Tasks waiting to run. */
  readonly pending: number;
  /** Drops queued tasks (they reject with `AbortError`). */
  clear(): void;
}

/**
 * Serial queue of small main-thread tasks that yields to input and rendering when the time budget is spent.
 * @example
 * const tasks = createTaskScheduler({ budgetMs: 8 });
 * const widgets = [{ hydrate: () => 'chart' }, { hydrate: () => 'grid' }];
 * for (const w of widgets) void tasks.schedule(() => w.hydrate());
 */
export function createTaskScheduler(options: { readonly budgetMs?: number } = {}): TaskScheduler {
  const { budgetMs = 8 } = options;
  if (!(Number.isFinite(budgetMs) && budgetMs > 0)) throw new ValidationError('SVC_SCHEDULER_INVALID_BUDGET', 'budgetMs must be a positive number.');
  interface Job {
    run: () => unknown;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }
  const queue: Job[] = [];
  let running = false;
  const pump = async (): Promise<void> => {
    if (running) return;
    running = true;
    let sliceStart = nowMs();
    try {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          job.resolve(await job.run());
        } catch (e) {
          job.reject(e);
        }
        if (queue.length > 0 && nowMs() - sliceStart >= budgetMs) {
          await yieldToMain();
          sliceStart = nowMs();
        }
      }
    } finally {
      running = false;
    }
  };
  return {
    schedule<R>(task: () => R | Promise<R>) {
      return new Promise<Awaited<R>>((resolve, reject) => {
        queue.push({ run: task, resolve: resolve as (v: unknown) => void, reject });
        void pump();
      });
    },
    runChunked: (items, fn, opts = {}) => runChunked(items, fn, { budgetMs, ...opts }),
    get pending() {
      return queue.length;
    },
    clear() {
      for (const job of queue.splice(0)) job.reject(abortReason(AbortSignal.abort()));
    },
  };
}

/** Options for {@link interval}. */
export interface IntervalOptions {
  readonly signal?: AbortSignal;
  /** Run once immediately. Default false. */
  readonly immediate?: boolean;
  /** Pause while the page is hidden and resume (running once if a tick was missed) when visible. Default false. */
  readonly pauseWhenHidden?: boolean;
  /** Receives errors thrown or rejected by `fn`; the interval keeps running. */
  readonly onError?: (error: unknown) => void;
}

/**
 * Drift-corrected repeating timer: ticks stay aligned to `start + n x ms` instead of accumulating
 * `setTimeout` lateness. Async callbacks never overlap (missed ticks are skipped).
 * @example
 * const controller = new AbortController();
 * const h = interval(() => fetch('/api/notifications'), 30_000, { pauseWhenHidden: true, signal: controller.signal });
 * controller.abort(); // stops polling
 */
export function interval(fn: () => unknown, ms: number, options: IntervalOptions = {}): TaskHandle {
  if (!(Number.isFinite(ms) && ms >= 1 && ms <= 2_147_483_647)) throw new ValidationError('SVC_SCHEDULER_INVALID_MS', 'Interval must be between 1 ms and the timer maximum.');
  const { signal, immediate = false, pauseWhenHidden = false, onError } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;
  let origin = Date.now();
  let n = 0;
  const doc = G().document;
  const hidden = (): boolean => pauseWhenHidden && doc?.visibilityState === 'hidden';

  const run = async (): Promise<void> => {
    running = true;
    try {
      await fn();
    } catch (e) {
      try {
        onError?.(e);
      } catch {
        // Ignore reporter failures.
      }
    } finally {
      running = false;
    }
  };
  const arm = (): void => {
    if (stopped || hidden()) return;
    const t = Date.now();
    n = Math.max(n + 1, Math.floor((t - origin) / ms) + 1);
    timer = setTimeout(() => {
      timer = undefined;
      void tick();
    }, Math.max(0, origin + n * ms - t));
  };
  const tick = async (): Promise<void> => {
    if (stopped || hidden()) return;
    if (!running) await run();
    arm();
  };
  const onVisibility = (): void => {
    if (stopped) return;
    if (hidden()) {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    } else if (timer === undefined) {
      const missed = Date.now() - origin >= n * ms;
      origin = Date.now();
      n = 0;
      if (missed) void tick();
      else arm();
    }
  };
  const cancel = (): void => {
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    signal?.removeEventListener('abort', cancel);
    if (pauseWhenHidden) doc?.removeEventListener?.('visibilitychange', onVisibility);
  };
  if (signal?.aborted) return { cancel: () => undefined };
  signal?.addEventListener('abort', cancel, { once: true });
  if (pauseWhenHidden) doc?.addEventListener?.('visibilitychange', onVisibility);
  if (immediate) void tick();
  else arm();
  return { cancel };
}

/** Options for {@link countdown}. */
export interface CountdownOptions {
  readonly signal?: AbortSignal;
  /** Tick granularity. Default 1000 ms. */
  readonly intervalMs?: number;
  /** Called once when the deadline passes. */
  readonly onComplete?: () => void;
  /** Clock (epoch ms), injectable for tests. Default `Date.now`. */
  readonly now?: () => number;
}

/** Handle returned by {@link countdown}. */
export interface CountdownHandle extends TaskHandle {
  /** Milliseconds left (0 when done). */
  readonly remaining: number;
  /** Moves the deadline (for example after the user chooses "Stay signed in"); restarts a completed countdown, not a cancelled one. */
  reset(deadline: number): void;
}

/**
 * Counts down to an absolute `deadline` (epoch ms), calling `onTick(remainingMs)` aligned to `intervalMs`.
 * Computed from the clock on every tick, so throttled background timers never make it drift.
 * Supports WCAG 2.2.1 Timing Adjustable: warn before a session expires and let users extend it via `reset`.
 * Announce the remaining time sparingly (for example each minute) in a polite live region.
 * @example
 * const sessionExpiresAt = Date.now() + 15 * 60_000;
 * const warning = document.createElement('p');
 * const c = countdown(sessionExpiresAt, (ms) => { if (ms <= 120_000) warning.textContent = `Signing out in ${Math.ceil(ms / 1000)} s`; }, {
 *   onComplete: () => location.assign('/signed-out'),
 * });
 * const stay = document.createElement('button');
 * stay.onclick = () => c.reset(Date.now() + 15 * 60_000);
 */
export function countdown(deadline: number, onTick: (remainingMs: number) => void, options: CountdownOptions = {}): CountdownHandle {
  const { signal, intervalMs = 1000, onComplete, now = Date.now } = options;
  if (!Number.isFinite(deadline)) throw new ValidationError('SVC_SCHEDULER_INVALID_DEADLINE', 'Deadline must be a finite epoch time in ms.');
  if (!(Number.isFinite(intervalMs) && intervalMs >= 10)) throw new ValidationError('SVC_SCHEDULER_INVALID_MS', 'intervalMs must be at least 10.');
  let target = deadline;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let cancelled = false;
  const remaining = (): number => Math.max(0, target - now());
  const step = (): void => {
    timer = undefined;
    if (stopped) return;
    const left = remaining();
    onTick(left);
    if (left <= 0) {
      stopped = true;
      signal?.removeEventListener('abort', cancel);
      onComplete?.();
      return;
    }
    // Align the next tick to the interval boundary of the remaining time.
    const next = left % intervalMs || intervalMs;
    timer = setTimeout(step, Math.min(next, left));
  };
  const cancel = (): void => {
    cancelled = true;
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    signal?.removeEventListener('abort', cancel);
  };
  if (signal?.aborted) {
    stopped = true;
    cancelled = true;
  }
  else {
    signal?.addEventListener('abort', cancel, { once: true });
    step();
  }
  return {
    get remaining() {
      return remaining();
    },
    reset(d) {
      if (!Number.isFinite(d)) throw new ValidationError('SVC_SCHEDULER_INVALID_DEADLINE', 'Deadline must be a finite epoch time in ms.');
      target = d;
      if (cancelled) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (stopped) {
        stopped = false;
        signal?.addEventListener('abort', cancel, { once: true });
      }
      step();
    },
    cancel,
  };
}
