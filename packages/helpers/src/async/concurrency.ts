import { AbortError, HelperError, ValidationError, toError } from '../error/index.js';
import { LinkedList, type LinkedListNode } from '../ds/index.js';
import { abortReason, throwIfAborted, type SignalOptions } from './signal.js';

function assertLimit(limit: number): void {
  if (!(Number.isSafeInteger(limit) && limit >= 1) && limit !== Infinity) throw new ValidationError('HLP_ASYNC_INVALID_LIMIT', 'Concurrency limit must be a positive integer.');
}

const NEVER = (): AbortSignal => new AbortController().signal;

export interface MapLimitOptions extends SignalOptions {
  /**
   * `true` (default): the first failure aborts the shared signal, stops scheduling, and rejects with that error.
   * `false`: every item runs; if any failed, rejects with `HLP_ASYNC_MAP_FAILED` whose `cause` is an
   * `AggregateError` of the failures (use `mapLimitSettled` to keep partial results).
   */
  readonly stopOnError?: boolean;
}

/**
 * Maps `items` through async `fn` with at most `limit` calls in flight, preserving input order.
 * Items are pulled lazily from the iterable. `fn` receives a signal that aborts on outer abort or first failure.
 * @example
 * const ids = [3, 1, 2];
 * await mapLimit(ids, 2, async (id) => `EMP-${id}`); // => ['EMP-3', 'EMP-1', 'EMP-2']
 */
export function mapLimit<T, R>(items: Iterable<T>, limit: number, fn: (item: T, index: number, signal: AbortSignal) => PromiseLike<R> | R, options: MapLimitOptions = {}): Promise<R[]> {
  const stopOnError = options.stopOnError ?? true;
  return run(items, limit, fn, options.signal, stopOnError).then((settled) => {
    const errors: unknown[] = [];
    const out: R[] = [];
    for (const s of settled) {
      if (s.status === 'fulfilled') out.push(s.value);
      else errors.push(s.reason);
    }
    if (errors.length > 0) throw new HelperError('HLP_ASYNC_MAP_FAILED', 'One or more operations failed.', { cause: new AggregateError(errors), details: { failed: errors.length, total: settled.length } });
    return out;
  });
}

/**
 * Like `mapLimit` but never rejects for item failures: resolves with a settled result per item, in order.
 * Still rejects with `AbortError` when `signal` aborts.
 * @example
 * const files = ['staff.csv', 'photo.png'];
 * const results = await mapLimitSettled(files, 3, async (f) => {
 *   if (!f.endsWith('.csv')) throw new Error('Only CSV files can be imported.');
 *   return f;
 * });
 * const { fulfilled, rejected } = partitionSettled(results);
 * fulfilled; // => ['staff.csv']
 * rejected.length; // => 1
 */
export function mapLimitSettled<T, R>(items: Iterable<T>, limit: number, fn: (item: T, index: number, signal: AbortSignal) => PromiseLike<R> | R, options: SignalOptions = {}): Promise<PromiseSettledResult<R>[]> {
  return run(items, limit, fn, options.signal, false);
}

function run<T, R>(items: Iterable<T>, limit: number, fn: (item: T, index: number, signal: AbortSignal) => PromiseLike<R> | R, signal: AbortSignal | undefined, stopOnError: boolean): Promise<PromiseSettledResult<R>[]> {
  return new Promise<PromiseSettledResult<R>[]>((resolve, reject) => {
    assertLimit(limit);
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const ctrl = new AbortController();
    const results: PromiseSettledResult<R>[] = [];
    const it = items[Symbol.iterator]();
    let index = 0;
    let active = 0;
    let exhausted = false;
    let settled = false;
    const cleanup = (): void => {
      settled = true;
      signal?.removeEventListener('abort', onAbort);
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      cleanup();
      ctrl.abort(error);
      if (!exhausted) it.return?.();
      reject(toError(error));
    };
    const onAbort = (): void => {
      if (signal) fail(abortReason(signal));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const pump = (): void => {
      while (!settled && !exhausted && active < limit) {
        let r: IteratorResult<T>;
        try {
          r = it.next();
        } catch (e) {
          fail(e);
          return;
        }
        if (r.done) {
          exhausted = true;
          break;
        }
        const i = index++;
        const item = r.value;
        active++;
        Promise.resolve()
          .then(() => fn(item, i, ctrl.signal))
          .then(
            (value) => {
              results[i] = { status: 'fulfilled', value };
            },
            (reason: unknown) => {
              results[i] = { status: 'rejected', reason };
              if (stopOnError) fail(reason);
            },
          )
          .finally(() => {
            active--;
            pump();
          });
      }
      if (!settled && exhausted && active === 0) {
        cleanup();
        resolve(results);
      }
    };
    pump();
  });
}

/**
 * Splits `Promise.allSettled` output into values and reasons, keeping order within each.
 * @example
 * const results = await Promise.allSettled([Promise.resolve(1), Promise.reject(new Error('Failed.')), Promise.resolve(3)]);
 * partitionSettled(results).fulfilled; // => [1, 3]
 */
export function partitionSettled<T>(results: readonly PromiseSettledResult<T>[]): { fulfilled: T[]; rejected: unknown[] } {
  const fulfilled: T[] = [];
  const rejected: unknown[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') fulfilled.push(r.value);
    else rejected.push(r.reason);
  }
  return { fulfilled, rejected };
}

/** Concurrency limiter returned by `createLimiter`. */
export interface Limiter {
  /** Queues `fn`; it starts when a slot is free. A queued task whose `signal` aborts is dropped and rejects. */
  schedule<T>(fn: (signal: AbortSignal) => PromiseLike<T> | T, options?: SignalOptions): Promise<T>;
  /** Tasks running now. */
  readonly active: number;
  /** Tasks waiting for a slot. */
  readonly pending: number;
  /** Maximum concurrent tasks. */
  readonly concurrency: number;
  /** Resolves when nothing is running or queued. */
  onIdle(): Promise<void>;
  /** Rejects every queued (not yet running) task with `AbortError`. */
  clear(): void;
}

interface Task {
  start: () => void;
  cancel: (error: Error) => void;
}

/**
 * Runs scheduled async tasks with at most `concurrency` in flight (FIFO). O(1) per schedule/start/cancel.
 * @example
 * const limiter = createLimiter(2);
 * let peak = 0;
 * const task = async (): Promise<void> => {
 *   peak = Math.max(peak, limiter.active);
 *   await sleep(5);
 * };
 * await Promise.all([1, 2, 3, 4].map(() => limiter.schedule(task)));
 * peak; // => 2
 */
export function createLimiter(concurrency: number): Limiter {
  assertLimit(concurrency);
  const queue = new LinkedList<Task>();
  let active = 0;
  let idle: (() => void)[] = [];

  const checkIdle = (): void => {
    if (active === 0 && queue.size === 0 && idle.length > 0) {
      const waiters = idle;
      idle = [];
      for (const w of waiters) w();
    }
  };
  const next = (): void => {
    while (active < concurrency && queue.size > 0) queue.shift()?.start();
    checkIdle();
  };

  return {
    schedule<T>(fn: (signal: AbortSignal) => PromiseLike<T> | T, options: SignalOptions = {}): Promise<T> {
      const { signal } = options;
      return new Promise<T>((resolve, reject) => {
        throwIfAborted(signal);
        let node: LinkedListNode<Task> | undefined;
        const onAbort = (): void => {
          if (node && signal) {
            queue.remove(node);
            node = undefined;
            reject(abortReason(signal));
            checkIdle();
          }
        };
        const task: Task = {
          start: () => {
            node = undefined;
            signal?.removeEventListener('abort', onAbort);
            active++;
            Promise.resolve()
              .then(() => fn(signal ?? NEVER()))
              .then(resolve, reject)
              .finally(() => {
                active--;
                next();
              });
          },
          cancel: (error) => {
            node = undefined;
            signal?.removeEventListener('abort', onAbort);
            reject(error);
          },
        };
        node = queue.push(task);
        signal?.addEventListener('abort', onAbort, { once: true });
        next();
      });
    },
    get active() {
      return active;
    },
    get pending() {
      return queue.size;
    },
    concurrency,
    onIdle(): Promise<void> {
      if (active === 0 && queue.size === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idle.push(resolve));
    },
    clear(): void {
      for (let t = queue.shift(); t; t = queue.shift()) t.cancel(new AbortError('HLP_ASYNC_QUEUE_CLEARED', 'The queued task was cleared.'));
      checkIdle();
    },
  };
}

/**
 * Runs async tasks one at a time in submission order (a limiter with concurrency 1).
 * @example
 * const writes = createSerialQueue();
 * const saved: string[] = [];
 * const save = async (id: string): Promise<void> => {
 *   await sleep(id === 'a' ? 10 : 0);
 *   saved.push(id);
 * };
 * await Promise.all([writes.schedule(() => save('a')), writes.schedule(() => save('b'))]);
 * saved; // => ['a', 'b'] // b starts after a finishes
 */
export function createSerialQueue(): Limiter {
  return createLimiter(1);
}

/**
 * Calls `fn` for each item sequentially, awaiting each call (works with sync and async iterables).
 * @example
 * const applied: string[] = [];
 * await forEachAsync(['001_create', '002_seed'], async (name, i) => {
 *   applied.push(`${i}:${name}`);
 * });
 * applied; // => ['0:001_create', '1:002_seed']
 */
export async function forEachAsync<T>(items: Iterable<T> | AsyncIterable<T>, fn: (item: T, index: number, signal: AbortSignal | undefined) => unknown, options: SignalOptions = {}): Promise<void> {
  const { signal } = options;
  let i = 0;
  throwIfAborted(signal);
  for await (const item of items) {
    throwIfAborted(signal);
    await fn(item, i++, signal);
  }
}
