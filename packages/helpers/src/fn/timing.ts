import { ValidationError } from '../error/index.js';

type Handle = ReturnType<typeof setTimeout>;

export interface DebounceOptions {
  /** Invoke on the leading edge. Default false. */
  readonly leading?: boolean;
  /** Invoke on the trailing edge. Default true. */
  readonly trailing?: boolean;
  /** Maximum ms `fn` may be delayed; guarantees periodic calls under constant input. */
  readonly maxWait?: number;
}

/** A debounced function with control methods. Returns the result of the last invocation. */
export interface Debounced<A extends unknown[], R> {
  (...args: A): R | undefined;
  /** Drops any pending invocation. */
  cancel(): void;
  /** Runs a pending invocation now and returns its result (or the last result). */
  flush(): R | undefined;
  /** True while an invocation is scheduled. */
  pending(): boolean;
}

function assertWait(ms: number, name: string): void {
  if (!Number.isFinite(ms) || ms < 0) throw new ValidationError('HLP_FN_INVALID_WAIT', 'Wait must be a finite number of milliseconds >= 0.', { details: { name } });
}

/**
 * Delays calling `fn` until `wait` ms have passed since the last call (lodash-compatible edges and
 * `maxWait`). `this` is not forwarded; wrap methods in an arrow function.
 * @example
 * const saved: string[] = [];
 * const save = debounce((text: string) => { saved.push(text); }, 300);
 * save('D');
 * save('Dr');
 * save('Draft');
 * save.flush(); // runs the pending call now (e.g. on beforeunload)
 * saved; // => ['Draft']
 */
export function debounce<A extends unknown[], R>(fn: (...args: A) => R, wait: number, options: DebounceOptions = {}): Debounced<A, R> {
  assertWait(wait, 'wait');
  const leading = options.leading ?? false;
  const trailing = options.trailing ?? true;
  let maxWait: number | undefined;
  if (options.maxWait !== undefined) {
    assertWait(options.maxWait, 'maxWait');
    maxWait = Math.max(options.maxWait, wait);
  }
  let lastArgs: A | undefined;
  let result: R | undefined;
  let timer: Handle | undefined;
  let lastCallTime: number | undefined;
  let lastInvokeTime = 0;

  const invoke = (time: number): R | undefined => {
    const args = lastArgs;
    lastArgs = undefined;
    lastInvokeTime = time;
    if (args) result = fn(...args);
    return result;
  };
  const remaining = (time: number): number => {
    const sinceCall = time - (lastCallTime ?? 0);
    const w = wait - sinceCall;
    return maxWait === undefined ? w : Math.min(w, maxWait - (time - lastInvokeTime));
  };
  const shouldInvoke = (time: number): boolean => {
    if (lastCallTime === undefined) return true;
    const sinceCall = time - lastCallTime;
    return sinceCall >= wait || sinceCall < 0 || (maxWait !== undefined && time - lastInvokeTime >= maxWait);
  };
  const trailingEdge = (time: number): R | undefined => {
    timer = undefined;
    if (trailing && lastArgs) return invoke(time);
    lastArgs = undefined;
    return result;
  };
  const expired = (): void => {
    const time = Date.now();
    if (shouldInvoke(time)) {
      trailingEdge(time);
      return;
    }
    timer = setTimeout(expired, remaining(time));
  };
  const leadingEdge = (time: number): R | undefined => {
    lastInvokeTime = time;
    timer = setTimeout(expired, wait);
    return leading ? invoke(time) : result;
  };

  const debounced = (...args: A): R | undefined => {
    const time = Date.now();
    const invoking = shouldInvoke(time);
    lastArgs = args;
    lastCallTime = time;
    if (invoking) {
      if (timer === undefined) return leadingEdge(time);
      if (maxWait !== undefined) {
        clearTimeout(timer);
        timer = setTimeout(expired, wait);
        return invoke(time);
      }
    }
    timer ??= setTimeout(expired, wait);
    return result;
  };
  debounced.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    lastInvokeTime = 0;
    lastArgs = lastCallTime = timer = undefined;
  };
  debounced.flush = (): R | undefined => {
    if (timer === undefined) return result;
    clearTimeout(timer);
    return trailingEdge(Date.now());
  };
  debounced.pending = (): boolean => timer !== undefined;
  return debounced;
}

export interface ThrottleOptions {
  /** Invoke on the leading edge. Default true. */
  readonly leading?: boolean;
  /** Invoke on the trailing edge with the latest arguments. Default true. */
  readonly trailing?: boolean;
}

/**
 * Calls `fn` at most once per `wait` ms (leading and trailing by default).
 * @example
 * let calls = 0;
 * const onScroll = throttle(() => { calls++; }, 100);
 * onScroll();
 * onScroll();
 * onScroll();
 * calls; // => 1 // leading call; the others merge into one trailing call
 * onScroll.cancel();
 */
export function throttle<A extends unknown[], R>(fn: (...args: A) => R, wait: number, options: ThrottleOptions = {}): Debounced<A, R> {
  return debounce(fn, wait, { leading: options.leading ?? true, trailing: options.trailing ?? true, maxWait: wait });
}

/** A frame-throttled function. */
export interface FrameThrottled<A extends unknown[]> {
  (...args: A): void;
  /** Drops the scheduled call. */
  cancel(): void;
}

/**
 * Calls `fn` at most once per animation frame with the latest arguments. Uses `requestAnimationFrame`
 * when available at call time, otherwise a 16 ms timer (SSR/Node/workers). No global access at import.
 * @example
 * declare const handle: HTMLElement;
 * const onMove = rafThrottle((e: PointerEvent) => { handle.style.translate = `${e.clientX}px ${e.clientY}px`; });
 * handle.addEventListener('pointermove', onMove); // at most one update per frame
 */
export function rafThrottle<A extends unknown[]>(fn: (...args: A) => void): FrameThrottled<A> {
  let lastArgs: A | undefined;
  let cancelFrame: (() => void) | undefined;
  const run = (): void => {
    cancelFrame = undefined;
    const args = lastArgs;
    lastArgs = undefined;
    if (args) fn(...args);
  };
  const throttled = (...args: A): void => {
    lastArgs = args;
    if (cancelFrame) return;
    const raf = typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame.bind(globalThis) : undefined;
    if (raf) {
      const id = raf(run);
      cancelFrame = () => {
        globalThis.cancelAnimationFrame(id);
      };
    } else {
      const id = setTimeout(run, 16);
      cancelFrame = () => {
        clearTimeout(id);
      };
    }
  };
  throttled.cancel = (): void => {
    cancelFrame?.();
    cancelFrame = undefined;
    lastArgs = undefined;
  };
  return throttled;
}
