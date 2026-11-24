/**
 * Arithmetic helpers: clamping, exact decimal rounding, compensated sums, integer math.
 */
import { LimitError, ValidationError } from '../error/index.js';
import { assertInteger, fractionDigits, numberParts, shift } from './internal.js';

const normZero = (v: number): number => (v === 0 ? 0 : v);

function checkPlaces(places: number): void {
  if (!Number.isInteger(places) || places < -308 || places > 308) throw new ValidationError('HLP_NUMBER_PLACES', 'Decimal places must be an integer between -308 and 308.');
}

/**
 * Restricts `value` to `[min, max]`. Throws `HLP_NUMBER_RANGE` when `min > max`.
 * @example clamp(15, 0, 10) // => 10
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) throw new ValidationError('HLP_NUMBER_RANGE', 'The minimum must not exceed the maximum.');
  return value < min ? min : value > max ? max : value;
}

export interface InRangeOptions {
  /** Which bounds are included. `true` (default) = both, `false` = neither. */
  readonly inclusive?: boolean | 'min' | 'max';
}

/**
 * True when `value` lies between `min` and `max` (bounds may be given in either order).
 * @example inRange(10, 0, 10, { inclusive: 'min' }) // => false
 */
export function inRange(value: number, min: number, max: number, options: InRangeOptions = {}): boolean {
  const { inclusive = true } = options;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const loOk = inclusive === true || inclusive === 'min' ? value >= lo : value > lo;
  const hiOk = inclusive === true || inclusive === 'max' ? value <= hi : value < hi;
  return loOk && hiOk;
}

/**
 * Rounds half away from zero to `places` decimals, exact for decimal inputs (Excel `ROUND`).
 * Negative `places` round to tens, hundreds, ...
 * @example
 * round(1.005, 2); // => 1.01 // naive Math.round(1.005 * 100) / 100 gives 1
 */
export function round(value: number, places = 0): number {
  checkPlaces(places);
  if (!Number.isFinite(value)) return value;
  const s = shift(Math.abs(value), places);
  if (!Number.isFinite(s)) return value;
  return normZero(Math.sign(value) * shift(Math.round(s), -places));
}

/**
 * Rounds half to even ("banker's rounding") to `places` decimals, exact for decimal inputs.
 * @example
 * roundHalfEven(2.5); // => 2
 * roundHalfEven(0.125, 2); // => 0.12
 */
export function roundHalfEven(value: number, places = 0): number {
  checkPlaces(places);
  if (!Number.isFinite(value)) return value;
  const s = shift(Math.abs(value), places);
  if (!Number.isFinite(s)) return value;
  const f = Math.floor(s);
  const d = s - f;
  const r = d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1;
  return normZero(Math.sign(value) * shift(r, -places));
}

function directed(fn: (x: number) => number, value: number, places: number): number {
  checkPlaces(places);
  if (!Number.isFinite(value)) return value;
  const s = shift(value, places);
  if (!Number.isFinite(s)) return value;
  return normZero(shift(fn(s), -places));
}

/**
 * Rounds toward -infinity to `places` decimals, exact for decimal inputs.
 * @example floor(1.99, 1) // => 1.9
 */
export function floor(value: number, places = 0): number {
  return directed(Math.floor, value, places);
}

/**
 * Rounds toward +infinity to `places` decimals, exact for decimal inputs.
 * @example ceil(1.01, 1) // => 1.1
 */
export function ceil(value: number, places = 0): number {
  return directed(Math.ceil, value, places);
}

/**
 * Drops digits beyond `places` decimals (rounds toward zero). Named `trunc` to avoid
 * clashing with the string module's `truncate`.
 * @example trunc(-1.29, 1) // => -1.2
 */
export function trunc(value: number, places = 0): number {
  return directed(Math.trunc, value, places);
}

/**
 * Rounds to the nearest multiple of `step` (half away from zero), without float drift.
 * @example
 * roundTo(1.13, 0.25); // => 1.25
 * roundTo(0.125, 0.05); // => 0.15
 */
export function roundTo(value: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) throw new ValidationError('HLP_NUMBER_STEP', 'The step must be a positive finite number.');
  if (!Number.isFinite(value)) return value;
  const d = Math.max(fractionDigits(value), fractionDigits(step));
  const q = shift(value, d) / shift(step, d);
  const n = Math.sign(q) * Math.round(Math.abs(q));
  return round(n * step, fractionDigits(step));
}

/** True for even integers. @example isEven(-4) // => true */
export function isEven(value: number): boolean {
  return Number.isInteger(value) && value % 2 === 0;
}

/** True for odd integers. @example isOdd(-3) // => true */
export function isOdd(value: number): boolean {
  return Number.isInteger(value) && value % 2 !== 0;
}

/**
 * Sign as `-1 | 0 | 1` (`-0` gives `0`), or `NaN` for `NaN`.
 * @example sign(-0) // => 0
 */
export function sign(value: number): number {
  return value > 0 ? 1 : value < 0 ? -1 : value === 0 ? 0 : Number.NaN;
}

/** True only for `-0`. @example isNegativeZero(-0) // => true */
export function isNegativeZero(value: number): boolean {
  return value === 0 && 1 / value < 0;
}

/** Converts `-0` to `0`; other values pass through. @example normalizeZero(-0) // => 0 */
export function normalizeZero(value: number): number {
  return normZero(value);
}

export interface PercentOptions {
  /** Round the result to this many decimals. */
  readonly places?: number;
}

const finiteOrUndefined = (v: number, places: number | undefined): number | undefined => (Number.isFinite(v) ? (places === undefined ? normZero(v) : round(v, places)) : undefined);

/**
 * `part` as a percentage of `total`; `undefined` when `total` is 0 or inputs are not finite.
 * @example percent(1, 3, { places: 2 }) // => 33.33
 */
export function percent(part: number, total: number, options: PercentOptions = {}): number | undefined {
  if (total === 0) return undefined;
  return finiteOrUndefined((part / total) * 100, options.places);
}

/**
 * Percentage change from `from` to `to` relative to `|from|`; `undefined` when `from` is 0.
 * @example percentChange(80, 100) // => 25
 */
export function percentChange(from: number, to: number, options: PercentOptions = {}): number | undefined {
  if (from === 0) return undefined;
  return finiteOrUndefined(((to - from) / Math.abs(from)) * 100, options.places);
}

/**
 * `a / b`, or `undefined` when `b` is 0 or the result is not finite.
 * @example ratio(3, 4) // => 0.75
 */
export function ratio(a: number, b: number, options: PercentOptions = {}): number | undefined {
  if (b === 0) return undefined;
  return finiteOrUndefined(a / b, options.places);
}

/**
 * Linear interpolation; exact at `t = 0` and `t = 1`.
 * @example lerp(10, 20, 0.25) // => 12.5
 */
export function lerp(a: number, b: number, t: number): number {
  return (1 - t) * a + t * b;
}

/**
 * Inverse of `lerp`: where `value` sits between `a` and `b` (0 when `a === b`).
 * @example inverseLerp(10, 20, 15) // => 0.5
 */
export function inverseLerp(a: number, b: number, value: number): number {
  return a === b ? 0 : (value - a) / (b - a);
}

export interface RemapOptions {
  /** Clamp the result to the output range. Default false. */
  readonly clamp?: boolean;
}

/**
 * Maps `value` from `[inMin, inMax]` to `[outMin, outMax]`.
 * @example remap(5, 0, 10, 0, 100) // => 50
 */
export function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number, options: RemapOptions = {}): number {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, options.clamp ? Math.min(1, Math.max(0, t)) : t);
}

export interface ApproxOptions {
  /** Relative tolerance, scaled by the larger magnitude. Default 1e-9. */
  readonly relative?: number;
  /** Absolute tolerance, for values near zero. Default 1e-12. */
  readonly absolute?: number;
}

/**
 * Tolerant equality: `|a - b| <= max(relative x max(|a|, |b|), absolute)`. `NaN` is never equal.
 * @example approximatelyEqual(0.1 + 0.2, 0.3) // => true
 */
export function approximatelyEqual(a: number, b: number, options: ApproxOptions = {}): boolean {
  const { relative = 1e-9, absolute = 1e-12 } = options;
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(relative * Math.max(Math.abs(a), Math.abs(b)), absolute);
}

/**
 * Compensated (Kahan-Babuška-Neumaier) sum; far less rounding error than a plain loop.
 * @example kahanSum([0.1, 0.2, 0.3]) // => 0.6 // plain reduce gives 0.6000000000000001
 */
export function kahanSum(values: Iterable<number>): number {
  let s = 0;
  let c = 0;
  let naive = 0;
  for (const x of values) {
    naive += x;
    const t = s + x;
    c += Math.abs(s) >= Math.abs(x) ? s - t + x : x - t + s;
    s = t;
  }
  return Number.isFinite(naive) ? normZero(s + c) : naive;
}

/**
 * Compensated sum (alias of `kahanSum`). Empty input gives 0.
 * @example sum([1, 2, 3]) // => 6
 */
export function sum(values: Iterable<number>): number {
  return kahanSum(values);
}

/**
 * Product of all values. Empty input gives 1.
 * @example product([2, 3, 4]) // => 24
 */
export function product(values: Iterable<number>): number {
  let p = 1;
  for (const x of values) p *= x;
  return p;
}

/**
 * Greatest common divisor of two integers (always >= 0).
 * @example gcd(12, -18) // => 6
 */
export function gcd(a: number, b: number): number {
  assertInteger(a);
  assertInteger(b);
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

/**
 * Least common multiple of two integers; throws `HLP_NUMBER_UNSAFE` when the result is not a safe integer.
 * @example lcm(4, 6) // => 12
 */
export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) {
    assertInteger(a);
    assertInteger(b);
    return 0;
  }
  const r = Math.abs((a / gcd(a, b)) * b);
  if (!Number.isSafeInteger(r)) throw new LimitError('HLP_NUMBER_UNSAFE', 'The result is not a safe integer.');
  return r;
}

const babs = (v: bigint): bigint => (v < 0n ? -v : v);

/** `gcd` for `bigint`. @example gcdBigInt(12n, 18n) // => 6n */
export function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = babs(a);
  let y = babs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

/** `lcm` for `bigint`. @example lcmBigInt(4n, 6n) // => 12n */
export function lcmBigInt(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  return babs((a / gcdBigInt(a, b)) * b);
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return r;
}

const MR_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];
const MR_LIMIT = 3_317_044_064_679_887_385_961_981n; // bases up to 41 are deterministic below this

/**
 * Deterministic primality test for safe integers and for `bigint` below 3.3 × 10²⁴
 * (trial division for small values, Miller–Rabin with fixed bases otherwise).
 * @example isPrime(2_147_483_647) // => true
 */
export function isPrime(n: number | bigint): boolean {
  if (typeof n === 'number') {
    if (!Number.isInteger(n) || n < 2) return false;
    if (!Number.isSafeInteger(n)) throw new ValidationError('HLP_NUMBER_UNSAFE', 'Expected a safe integer; pass a bigint for larger values.');
    if (n < 4) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;
    if (n < 1e10) {
      for (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return false;
      return true;
    }
    return isPrime(BigInt(n));
  }
  if (n < 2n) return false;
  if (n >= MR_LIMIT) throw new LimitError('HLP_NUMBER_TOO_LARGE', 'The value exceeds the deterministic primality limit.');
  for (const p of MR_BASES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }
  outer: for (const a of MR_BASES) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1; i < s; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue outer;
    }
    return false;
  }
  return true;
}

/** Largest accepted `factorial` argument. */
export const MAX_FACTORIAL = 10_000;

/**
 * Exact factorial as `bigint`; `n` must be an integer in `0..MAX_FACTORIAL`.
 * @example factorial(20) // => 2432902008176640000n
 */
export function factorial(n: number): bigint {
  assertInteger(n);
  if (n < 0) throw new ValidationError('HLP_NUMBER_NEGATIVE', 'Expected a non-negative integer.');
  if (n > MAX_FACTORIAL) throw new LimitError('HLP_NUMBER_TOO_LARGE', 'The value exceeds the factorial limit.');
  let r = 1n;
  for (let i = 2n, m = BigInt(n); i <= m; i++) r *= i;
  return r;
}

/**
 * Plain decimal string with no exponent notation. With `places`, rounds half away from
 * zero on the exact decimal value (unlike `Number#toFixed`) and pads to `places` digits.
 * `-0` and negative values that round to zero print without a minus sign.
 * @example
 * toFixedSafe(1e21); // => '1000000000000000000000'
 * toFixedSafe(1.005, 2); // => '1.01'
 */
export function toFixedSafe(value: number, places?: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (places !== undefined && (!Number.isInteger(places) || places < 0 || places > 100)) throw new ValidationError('HLP_NUMBER_PLACES', 'Decimal places must be an integer between 0 and 100.');
  const p = numberParts(value);
  const target = places === undefined ? Math.min(p.exponent, 0) : -places;
  let unscaled = BigInt(p.digits);
  if (p.exponent >= target) unscaled *= 10n ** BigInt(p.exponent - target);
  else {
    const div = 10n ** BigInt(target - p.exponent);
    const q = unscaled / div;
    unscaled = (unscaled % div) * 2n >= div ? q + 1n : q;
  }
  const scale = -target;
  let s = unscaled.toString();
  if (scale > 0) {
    s = s.padStart(scale + 1, '0');
    s = `${s.slice(0, -scale)}.${s.slice(-scale)}`;
  }
  return p.negative && unscaled !== 0n ? `-${s}` : s;
}

