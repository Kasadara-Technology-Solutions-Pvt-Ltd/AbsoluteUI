import { AbortError, HelperError, TimeoutError, ValidationError, toError } from '../error/index.js';

/** Largest delay `setTimeout` honours (about 24.8 days); larger values would fire immediately. */
export const MAX_DELAY_MS = 2_147_483_647;

/** Throws `HLP_ASYNC_INVALID_MS` unless `ms` is a finite number in [0, MAX_DELAY_MS]. */
export function assertDelay(ms: number, name = 'ms'): void {
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_DELAY_MS) throw new ValidationError('HLP_ASYNC_INVALID_MS', 'Delay must be a finite number of milliseconds within the timer range.', { details: { name } });
}

/** Options accepted by every cancellable helper. */
export interface SignalOptions {
  /** Aborts the operation; the promise rejects with `AbortError` (or the `HelperError` used as reason). */
  readonly signal?: AbortSignal | undefined;
}

/**
 * The error an aborted `signal` should reject with: its reason when that is a `HelperError`,
 * `TimeoutError` for timeout reasons (`AbortSignal.timeout`), otherwise `AbortError` with the reason as `cause`.
 * @example
 * const controller = new AbortController();
 * controller.abort();
 * abortReason(controller.signal).code; // => 'HLP_ABORTED'
 */
export function abortReason(signal: AbortSignal): HelperError {
  const reason: unknown = signal.reason;
  if (reason instanceof HelperError) return reason;
  if (typeof reason === 'object' && reason !== null && (reason as { name?: unknown }).name === 'TimeoutError') return new TimeoutError(undefined, undefined, { cause: reason });
  return new AbortError(undefined, undefined, { cause: reason });
}

/**
 * Throws `abortReason(signal)` when `signal` is aborted.
 * @example
 * const controller = new AbortController();
 * throwIfAborted(controller.signal); // no-op while not aborted
 * controller.abort();
 * throwIfAborted(controller.signal); // => throws HLP_ABORTED
 */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortReason(signal);
}

/**
 * Resolves after `ms`; rejects with `AbortError` (and clears the timer) when `signal` aborts.
 * @example
 * await sleep(10);
 * const controller = new AbortController();
 * const pending = sleep(10_000, { signal: controller.signal });
 * controller.abort();
 * await pending; // => throws HLP_ABORTED
 */
export function sleep(ms: number, options: SignalOptions = {}): Promise<void> {
  assertDelay(ms);
  const { signal } = options;
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      if (signal) reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** `{ promise, resolve, reject }` for settling a promise from outside. */
export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
}

/**
 * Creates a promise with external `resolve`/`reject` (native `Promise.withResolvers` when present).
 * @example
 * const ready = deferred<string>();
 * setTimeout(() => ready.resolve('connected'), 0);
 * await ready.promise; // => 'connected'
 */
export function deferred<T>(): Deferred<T> {
  const native = (Promise as unknown as { withResolvers?: <U>() => Deferred<U> }).withResolvers;
  if (typeof native === 'function') return native.call(Promise) as Deferred<T>;
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Settles like `promise`, or rejects with `AbortError` as soon as `signal` aborts (the underlying work
 * is not cancelled; pass the signal to it too). Removes its listener when settled.
 * @example
 * const controller = new AbortController();
 * const never = new Promise<string>(() => {});
 * const pending = raceSignal(never, controller.signal);
 * controller.abort();
 * await pending; // => throws HLP_ABORTED
 */
export function raceSignal<T>(promise: PromiseLike<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return Promise.resolve(promise);
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = (): void => {
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(toError(e));
      },
    );
  });
}

/**
 * Signal that aborts when any input aborts (native `AbortSignal.any` when present; `undefined` entries are ignored).
 * @example
 * const user = new AbortController();
 * const signal = anySignal([user.signal, timeoutSignal(5_000)]);
 * user.abort();
 * signal.aborted; // => true
 */
export function anySignal(signals: readonly (AbortSignal | undefined)[]): AbortSignal {
  const list = signals.filter((s): s is AbortSignal => s !== undefined);
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(list);
  const ctrl = new AbortController();
  const cleanup = (): void => {
    for (const s of list) s.removeEventListener('abort', onAbort);
  };
  const onAbort = function (this: AbortSignal): void {
    cleanup();
    ctrl.abort(this.reason);
  };
  for (const s of list) {
    if (s.aborted) {
      cleanup();
      ctrl.abort(s.reason);
      break;
    }
    s.addEventListener('abort', onAbort, { once: true });
  }
  return ctrl.signal;
}

/**
 * Signal that aborts after `ms` with a timeout reason (native `AbortSignal.timeout` when present).
 * @example
 * const signal = timeoutSignal(10);
 * await sleep(1_000, { signal }); // => throws HLP_TIMEOUT
 */
export function timeoutSignal(ms: number): AbortSignal {
  assertDelay(ms);
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => {
    ctrl.abort(new TimeoutError());
  }, ms);
  return ctrl.signal;
}

/** A running operation that can be cancelled. */
export interface Cancellable<T> {
  readonly promise: Promise<T>;
  /** Aborts the signal passed to the work and rejects `promise` with `AbortError` (or `reason`). */
  readonly cancel: (reason?: unknown) => void;
  readonly signal: AbortSignal;
}

/**
 * Starts `fn` with a fresh `AbortSignal` and returns a handle to cancel it.
 * @example
 * const search = withCancel((signal) => sleep(10_000, { signal }).then(() => ['Ada']));
 * search.cancel();
 * await search.promise; // => throws HLP_ABORTED
 * search.signal.aborted; // => true
 */
export function withCancel<T>(fn: (signal: AbortSignal) => PromiseLike<T> | T): Cancellable<T> {
  const ctrl = new AbortController();
  const promise = raceSignal(
    Promise.resolve().then(() => fn(ctrl.signal)),
    ctrl.signal,
  );
  return {
    promise,
    signal: ctrl.signal,
    cancel: (reason?: unknown) => {
      ctrl.abort(reason ?? new AbortError());
    },
  };
}
