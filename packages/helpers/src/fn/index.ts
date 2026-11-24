/**
 * Function helpers (docs/PLAN-HELPERS.md section 2 `fn`). Timers never use string callbacks; nothing touches
 * globals at import time.
 */
import { ValidationError, toError, tryCatch, type Result } from '../error/index.js';

export { debounce, throttle, rafThrottle, type Debounced, type DebounceOptions, type ThrottleOptions, type FrameThrottled } from './timing.js';
export { memoize, memoizeOne, type Memoized, type MemoizeOptions } from './memo.js';

/**
 * Does nothing and returns `undefined`.
 * @example
 * const options: { onChange?: (value: string) => void } = {};
 * const onChange = options.onChange ?? noop;
 * onChange('Ada'); // => undefined
 */
export const noop: (...args: unknown[]) => void = () => undefined;

/**
 * Returns its argument.
 * @example
 * [1, 0, 2].filter(identity); // => [1, 2]
 */
export function identity<T>(value: T): T {
  return value;
}

/**
 * Returns a function that always returns `value`.
 * @example
 * const alwaysTrue = constant(true);
 * alwaysTrue(); // => true
 */
export function constant<T>(value: T): () => T {
  return () => value;
}

/**
 * Inverts a predicate.
 * @example
 * [1, 2, 3].filter(negate((n: number) => n % 2 === 0)); // => [1, 3]
 */
export function negate<A extends unknown[]>(predicate: (...args: A) => unknown): (...args: A) => boolean {
  return (...args: A) => !predicate(...args);
}

/**
 * Calls `fn` only on the first call; later calls return the first result (or rethrow the first error).
 * @example
 * let setups = 0;
 * const init = once(() => ++setups);
 * init();
 * init(); // => 1 // returns the first result
 * setups; // => 1
 */
export function once<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let state: { ok: true; value: R } | { ok: false; error: unknown } | undefined;
  return (...args: A): R => {
    if (!state) {
      try {
        state = { ok: true, value: fn(...args) };
      } catch (e) {
        state = { ok: false, error: e };
      }
    }
    if (state.ok) return state.value;
    throw toError(state.error);
  };
}

function assertCount(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new ValidationError('HLP_FN_INVALID_COUNT', 'Count must be a non-negative integer.');
}

/**
 * Calls `fn` for the first `n - 1` calls; afterwards returns the last result without calling it.
 * @example
 * let attempts = 0;
 * const tryLogin = before(3, () => ++attempts); // runs on calls 1 and 2 only
 * [tryLogin(), tryLogin(), tryLogin()]; // => [1, 2, 2]
 */
export function before<A extends unknown[], R>(n: number, fn: (...args: A) => R): (...args: A) => R | undefined {
  assertCount(n);
  let calls = 0;
  let last: R | undefined;
  return (...args: A): R | undefined => {
    calls++;
    if (calls < n) last = fn(...args);
    return last;
  };
}

/**
 * Calls `fn` only from the `n`th call onwards; earlier calls return `undefined`.
 * @example
 * const uploads = ['contract.pdf', 'id-card.png'];
 * const done = after(uploads.length, () => 'All files uploaded.');
 * [done(), done()]; // => [undefined, 'All files uploaded.']
 */
export function after<A extends unknown[], R>(n: number, fn: (...args: A) => R): (...args: A) => R | undefined {
  assertCount(n);
  let calls = 0;
  return (...args: A): R | undefined => {
    calls++;
    return calls >= n ? fn(...args) : undefined;
  };
}

type Fn = (arg: unknown) => unknown;

/**
 * Left-to-right composition: `pipe(f, g)(x) === g(f(x))`. The first function may take several arguments.
 * @example
 * const slug = pipe((s: string) => s.trim(), (s) => s.toLowerCase(), (s) => s.replaceAll(' ', '-'));
 * slug(' Hello World '); // => 'hello-world'
 */
export function pipe<A extends unknown[], B>(ab: (...a: A) => B): (...a: A) => B;
export function pipe<A extends unknown[], B, C>(ab: (...a: A) => B, bc: (b: B) => C): (...a: A) => C;
export function pipe<A extends unknown[], B, C, D>(ab: (...a: A) => B, bc: (b: B) => C, cd: (c: C) => D): (...a: A) => D;
export function pipe<A extends unknown[], B, C, D, E>(ab: (...a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E): (...a: A) => E;
export function pipe<A extends unknown[], B, C, D, E, F>(ab: (...a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E, ef: (e: E) => F): (...a: A) => F;
export function pipe<A extends unknown[], B, C, D, E, F, G>(ab: (...a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E, ef: (e: E) => F, fg: (f: F) => G): (...a: A) => G;
export function pipe<A extends unknown[], B, C, D, E, F, G, H>(ab: (...a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E, ef: (e: E) => F, fg: (f: F) => G, gh: (g: G) => H): (...a: A) => H;
export function pipe<A extends unknown[], B, C, D, E, F, G, H, I>(ab: (...a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E, ef: (e: E) => F, fg: (f: F) => G, gh: (g: G) => H, hi: (h: H) => I): (...a: A) => I;
export function pipe<A extends unknown[], B, C, D, E, F, G, H, I, J>(ab: (...a: A) => B, bc: (b: B) => C, cd: (c: C) => D, de: (d: D) => E, ef: (e: E) => F, fg: (f: F) => G, gh: (g: G) => H, hi: (h: H) => I, ij: (i: I) => J): (...a: A) => J;
export function pipe(first: (...args: unknown[]) => unknown, ...rest: Fn[]): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    let value = first(...args);
    for (const f of rest) value = f(value);
    return value;
  };
}

/**
 * Right-to-left composition: `compose(g, f)(x) === g(f(x))`. The last function may take several arguments.
 * @example
 * const shout = compose((s: string) => `${s}!`, (s: string) => s.toUpperCase());
 * shout('hi'); // => 'HI!'
 */
export function compose<A extends unknown[], B>(ab: (...a: A) => B): (...a: A) => B;
export function compose<A extends unknown[], B, C>(bc: (b: B) => C, ab: (...a: A) => B): (...a: A) => C;
export function compose<A extends unknown[], B, C, D>(cd: (c: C) => D, bc: (b: B) => C, ab: (...a: A) => B): (...a: A) => D;
export function compose<A extends unknown[], B, C, D, E>(de: (d: D) => E, cd: (c: C) => D, bc: (b: B) => C, ab: (...a: A) => B): (...a: A) => E;
export function compose<A extends unknown[], B, C, D, E, F>(ef: (e: E) => F, de: (d: D) => E, cd: (c: C) => D, bc: (b: B) => C, ab: (...a: A) => B): (...a: A) => F;
export function compose<A extends unknown[], B, C, D, E, F, G>(fg: (f: F) => G, ef: (e: E) => F, de: (d: D) => E, cd: (c: C) => D, bc: (b: B) => C, ab: (...a: A) => B): (...a: A) => G;
export function compose<A extends unknown[], B, C, D, E, F, G, H>(gh: (g: G) => H, fg: (f: F) => G, ef: (e: E) => F, de: (d: D) => E, cd: (c: C) => D, bc: (b: B) => C, ab: (...a: A) => B): (...a: A) => H;
export function compose<A extends unknown[], B, C, D, E, F, G, H, I>(hi: (h: H) => I, gh: (g: G) => H, fg: (f: F) => G, ef: (e: E) => F, de: (d: D) => E, cd: (c: C) => D, bc: (b: B) => C, ab: (...a: A) => B): (...a: A) => I;
export function compose<A extends unknown[], B, C, D, E, F, G, H, I, J>(ij: (i: I) => J, hi: (h: H) => I, gh: (g: G) => H, fg: (f: F) => G, ef: (e: E) => F, de: (d: D) => E, cd: (c: C) => D, bc: (b: B) => C, ab: (...a: A) => B): (...a: A) => J;
export function compose(...fns: ((...args: unknown[]) => unknown)[]): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    let i = fns.length - 1;
    const last = fns[i];
    if (!last) return args[0];
    let value = last(...args);
    for (i--; i >= 0; i--) value = (fns[i] as Fn)(value);
    return value;
  };
}

/**
 * Wraps `fn` to run it for side effects and pass the value through.
 * @example
 * const seen: number[] = [];
 * const double = pipe((s: string) => Number(s), tap((n: number) => { seen.push(n); }), (n) => n * 2);
 * double('21'); // => 42
 * seen; // => [21]
 */
export function tap<T>(fn: (value: T) => void): (value: T) => T {
  return (value: T) => {
    fn(value);
    return value;
  };
}

/**
 * Runs `fn`, returning a `Result` instead of throwing.
 * @example
 * const r = attempt(() => JSON.parse('{"active":true}') as unknown); // => { ok: true, value: { active: true } }
 * attempt(() => JSON.parse('{')).ok; // => false
 */
export function attempt<R>(fn: () => R): Result<R> {
  return tryCatch(fn);
}

/**
 * Calls `fn(...args)` when `condition` is truthy; otherwise returns `undefined`.
 * @example
 * const add = (a: number, b: number): number => a + b;
 * callIf(true, add, 2, 3); // => 5
 * callIf(false, add, 2, 3); // => undefined
 */
export function callIf<A extends unknown[], R>(condition: unknown, fn: (...args: A) => R, ...args: A): R | undefined {
  return condition ? fn(...args) : undefined;
}

/**
 * Runs `fn`, swallowing any throw: returns `undefined` and reports the error to `onError` (if given).
 * Use for optional user callbacks that must not break the caller.
 * @example
 * const errors: string[] = [];
 * safeCall(() => { throw new Error('onChange failed.'); }, (e) => { errors.push(e.message); }); // => undefined
 * errors; // => ['onChange failed.']
 */
export function safeCall<R>(fn: () => R, onError?: (error: Error) => void): R | undefined {
  try {
    return fn();
  } catch (e) {
    onError?.(toError(e));
    return undefined;
  }
}

/**
 * Limits `fn` to its first argument (for `map(parseInt)`-style pitfalls).
 * @example
 * ['1', '2', '3'].map(unary(parseInt)); // => [1, 2, 3]
 */
export function unary<T, R>(fn: (value: T, ...rest: never[]) => R): (value: T) => R {
  return (value: T) => fn(value);
}
