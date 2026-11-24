import { TimeoutError, ValidationError, isAbortError, toError } from '../error/index.js';
import { abortReason, assertDelay, sleep, throwIfAborted, type SignalOptions } from './signal.js';

export interface TimeoutOptions extends SignalOptions {
  /** Message for the `TimeoutError` (developer text; never user input). */
  readonly message?: string;
}

/**
 * Rejects with `TimeoutError` (code `HLP_TIMEOUT`) if `work` does not settle within `ms`.
 * When `work` is a function it receives an `AbortSignal` that aborts on timeout or outer abort,
 * so the inner operation is actually cancelled.
 * @example
 * await timeout(Promise.resolve('ok'), 1_000); // => 'ok'
 * await timeout((signal) => sleep(10_000, { signal }), 20); // => throws HLP_TIMEOUT
 */
export function timeout<T>(work: PromiseLike<T> | ((signal: AbortSignal) => PromiseLike<T> | T), ms: number, options: TimeoutOptions = {}): Promise<T> {
  assertDelay(ms);
  const outer = options.signal;
  return new Promise<T>((resolve, reject) => {
    if (outer?.aborted) {
      reject(abortReason(outer));
      return;
    }
    const ctrl = new AbortController();
    let settled = false;
    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
      return true;
    };
    const onAbort = (): void => {
      if (!outer || !finish()) return;
      const e = abortReason(outer);
      ctrl.abort(e);
      reject(e);
    };
    const timer = setTimeout(() => {
      if (!finish()) return;
      const e = new TimeoutError('HLP_TIMEOUT', options.message ?? 'The operation timed out.');
      ctrl.abort(e);
      reject(e);
    }, ms);
    outer?.addEventListener('abort', onAbort, { once: true });
    let p: PromiseLike<T> | T;
    try {
      p = typeof work === 'function' ? work(ctrl.signal) : work;
    } catch (e) {
      finish();
      reject(toError(e));
      return;
    }
    Promise.resolve(p).then(
      (v) => {
        if (finish()) resolve(v);
      },
      (e: unknown) => {
        if (finish()) reject(toError(e));
      },
    );
  });
}

export interface RetryOptions extends SignalOptions {
  /** Retries after the first attempt (total attempts = retries + 1). Default 3. */
  readonly retries?: number;
  /** Base delay in ms for the first retry. Default 100. */
  readonly minDelay?: number;
  /** Delay cap in ms. Default 30 000. */
  readonly maxDelay?: number;
  /** Exponential growth factor (>= 1). Default 2. */
  readonly factor?: number;
  /** `'full'` (default): random in [0, d]; `'equal'`: d/2 + random in [0, d/2]; `'none'`: d. */
  readonly jitter?: 'full' | 'equal' | 'none';
  /** Decides whether to retry; abort errors are never retried. Default: always. */
  readonly retryIf?: (error: Error, attempt: number) => boolean | PromiseLike<boolean>;
  /** Overrides the computed delay (for example from a `Retry-After` header); return `undefined` to keep it. */
  readonly delayFor?: (error: Error, attempt: number, computed: number) => number | undefined;
  /** Called before waiting for each retry. */
  readonly onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  /** Random source in [0, 1) for jitter, injectable for tests. Default: `crypto.getRandomValues`. */
  readonly random?: () => number;
}

/** Crypto-backed uniform float in [0, 1) (jitter needs no crypto strength; `Math.random` is banned by policy). */
function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0] ?? 0) / 2 ** 32;
}

/**
 * Backoff delay for retry number `attempt` (1-based): `min(maxDelay, minDelay * factor^(attempt-1))` with jitter.
 * @example
 * backoffDelay(3, { minDelay: 100, jitter: 'none' }); // => 400
 */
export function backoffDelay(attempt: number, options: Pick<RetryOptions, 'minDelay' | 'maxDelay' | 'factor' | 'jitter' | 'random'> = {}): number {
  const { minDelay = 100, maxDelay = 30_000, factor = 2, jitter = 'full', random = cryptoRandom } = options;
  const base = Math.min(maxDelay, minDelay * factor ** Math.max(0, attempt - 1));
  if (jitter === 'none') return base;
  if (jitter === 'equal') return base / 2 + random() * (base / 2);
  return random() * base;
}

/**
 * Calls `fn(attempt, signal)` until it succeeds, retrying failures with exponential backoff and jitter.
 * Never retries abort errors; stops immediately when `signal` aborts. Rejects with the last error (non-`Error` throws normalized by `toError`).
 * @example
 * let calls = 0;
 * const data = await retry(
 *   async (attempt) => {
 *     calls = attempt;
 *     if (attempt < 3) throw new Error('Service unavailable.');
 *     return 'ok';
 *   },
 *   { retries: 4, minDelay: 1, jitter: 'none', retryIf: (e) => e.message === 'Service unavailable.' },
 * );
 * data; // => 'ok'
 * calls; // => 3
 */
export async function retry<T>(fn: (attempt: number, signal: AbortSignal) => PromiseLike<T> | T, options: RetryOptions = {}): Promise<T> {
  const { retries = 3, minDelay = 100, maxDelay = 30_000, factor = 2, signal } = options;
  if (!Number.isSafeInteger(retries) || retries < 0) throw new ValidationError('HLP_ASYNC_INVALID_RETRIES', 'retries must be a non-negative integer.');
  assertDelay(minDelay, 'minDelay');
  assertDelay(maxDelay, 'maxDelay');
  if (!Number.isFinite(factor) || factor < 1) throw new ValidationError('HLP_ASYNC_INVALID_FACTOR', 'factor must be a finite number >= 1.');
  const sig = signal ?? new AbortController().signal;
  for (let attempt = 1; ; attempt++) {
    throwIfAborted(signal);
    try {
      return await fn(attempt, sig);
    } catch (e) {
      const error = toError(e);
      if (isAbortError(e) || signal?.aborted || attempt > retries) throw error;
      if (options.retryIf && !(await options.retryIf(error, attempt))) throw error;
      const computed = backoffDelay(attempt, options);
      const override = options.delayFor?.(error, attempt, computed);
      const delay = Math.min(Math.max(0, override ?? computed), maxDelay);
      options.onRetry?.(error, attempt, delay);
      await sleep(delay, { signal });
    }
  }
}

export interface PollOptions<T> extends SignalOptions {
  /** Ms between the end of one call and the start of the next. Default 1000. */
  readonly interval?: number;
  /** Stop condition. Default: value is truthy. */
  readonly until?: (value: T, attempt: number) => boolean;
  /** Overall limit in ms; rejects with `TimeoutError` and aborts the in-flight call. */
  readonly timeout?: number;
}

/**
 * Calls `fn` repeatedly until `until(value)` holds, waiting `interval` ms between calls.
 * @example
 * let calls = 0;
 * const job = await poll(async () => ({ status: ++calls < 3 ? 'running' : 'done' }), {
 *   until: (j) => j.status !== 'running',
 *   interval: 5,
 *   timeout: 1_000,
 * });
 * [job.status, calls]; // => ['done', 3]
 */
export function poll<T>(fn: (signal: AbortSignal, attempt: number) => PromiseLike<T> | T, options: PollOptions<T> = {}): Promise<T> {
  const interval = options.interval ?? 1000;
  assertDelay(interval, 'interval');
  const until = options.until ?? ((v: T): boolean => Boolean(v));
  const loop = async (signal: AbortSignal): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
      throwIfAborted(signal);
      const value = await fn(signal, attempt);
      if (until(value, attempt)) return value;
      await sleep(interval, { signal });
    }
  };
  if (options.timeout !== undefined) return timeout(loop, options.timeout, { signal: options.signal, message: 'Polling timed out.' });
  const outer = options.signal;
  return loop(outer ?? new AbortController().signal);
}
