/**
 * Immutable fixed-point decimal on `BigInt` for money and exact arithmetic (docs/PLAN-HELPERS.md section 2).
 * Operations are methods on `Decimal` (not free functions) so names such as `round`, `sum`,
 * `min`, `compare` never collide with other helpers modules in the root barrel.
 */
import { HelperError, LimitError, ValidationError } from '../error/index.js';
import { formatCurrency, formatNumber, parseNumberString, type FormatNumberOptions, type LocaleInput } from '../number/index.js';

/** Rounding modes. `half-up` rounds ties away from zero; `up`/`down` are away from/toward zero. */
export type RoundingMode = 'half-up' | 'half-even' | 'half-down' | 'up' | 'down' | 'ceiling' | 'floor';

/** Anything accepted where a `Decimal` is expected. Numbers use their shortest round-trip form (`0.1` is exactly 0.1). */
export type DecimalInput = Decimal | string | number | bigint;

/** Maximum number of digits in the unscaled value. */
export const MAX_DECIMAL_DIGITS = 1000;
/** Maximum number of fractional digits. */
export const MAX_DECIMAL_SCALE = 1000;
/** Fractional digits of a division result when no `scale` is given (at least the operands' scales). */
export const DEFAULT_DIVISION_SCALE = 20;

const LIMIT = 10n ** BigInt(MAX_DECIMAL_DIGITS);
const DECIMAL_RE = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d{1,5}))?$/i;
const pow10 = (n: number): bigint => 10n ** BigInt(n);

function checkScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0) throw new ValidationError('HLP_DECIMAL_SCALE', 'The scale must be a non-negative integer.');
  if (scale > MAX_DECIMAL_SCALE) throw new LimitError('HLP_DECIMAL_TOO_LARGE', 'The scale exceeds the decimal limit.');
}

/** Integer division of `n / d` rounded by `mode` (`d !== 0n`). */
function divRound(n: bigint, d: bigint, mode: RoundingMode): bigint {
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  const positive = n < 0n === d < 0n;
  const step = positive ? 1n : -1n;
  const twice = (r < 0n ? -r : r) * 2n;
  const ad = d < 0n ? -d : d;
  switch (mode) {
    case 'down':
      return q;
    case 'up':
      return q + step;
    case 'ceiling':
      return positive ? q + 1n : q;
    case 'floor':
      return positive ? q : q - 1n;
    case 'half-up':
      return twice >= ad ? q + step : q;
    case 'half-down':
      return twice > ad ? q + step : q;
    case 'half-even':
      return twice > ad || (twice === ad && q % 2n !== 0n) ? q + step : q;
  }
}

function rescaleRaw(u: bigint, from: number, to: number, mode: RoundingMode): bigint {
  return to >= from ? u * pow10(to - from) : divRound(u, pow10(from - to), mode);
}

function parse(text: string, allowExponent: boolean): Decimal {
  if (text.length > MAX_DECIMAL_DIGITS * 2 + 20) throw new LimitError('HLP_DECIMAL_TOO_LONG', 'The decimal text exceeds the length limit.');
  const m = DECIMAL_RE.exec(text);
  if (!m) throw new ValidationError('HLP_DECIMAL_PARSE', 'Invalid decimal string.');
  const [, signPart = '', intPart = '0', fracPart = '', expPart] = m;
  if (expPart !== undefined && !allowExponent) throw new ValidationError('HLP_DECIMAL_PARSE', 'Exponent notation is not allowed.');
  let scale = fracPart.length - (expPart === undefined ? 0 : Number(expPart));
  let u = BigInt(intPart + fracPart);
  if (scale < 0) {
    if (-scale > MAX_DECIMAL_DIGITS) throw new LimitError('HLP_DECIMAL_TOO_LARGE', 'The value exceeds the decimal limit.');
    u *= pow10(-scale);
    scale = 0;
  }
  return new Decimal(signPart === '-' ? -u : u, scale);
}

function toDecimal(value: DecimalInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === 'bigint') return new Decimal(value, 0);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError('HLP_DECIMAL_NOT_FINITE', 'Expected a finite number.');
    return parse(String(value), true);
  }
  if (typeof value === 'string') return parse(value, false);
  throw new ValidationError('HLP_DECIMAL_PARSE', 'Expected a Decimal, string, number, or bigint.');
}

const cmp = (a: bigint, b: bigint): -1 | 0 | 1 => (a < b ? -1 : a > b ? 1 : 0);

export interface DecimalRoundOptions {
  /** Fractional digits of the result. */
  readonly scale?: number;
  /** Default `'half-up'`. */
  readonly rounding?: RoundingMode;
}

export interface AllocateOptions {
  /** Scale of the parts (the smallest unit). Default: the amount's scale. */
  readonly scale?: number;
}

/**
 * Immutable decimal: `unscaled x 10^-scale`. Create with `decimal()`.
 * @example decimal('0.10').add('0.20').toString() // => '0.30'
 */
export class Decimal {
  /** Integer digits without the decimal point. */
  readonly unscaled: bigint;
  /** Number of fractional digits (0..MAX_DECIMAL_SCALE). */
  readonly scale: number;

  /** Prefer `decimal()`; throws `LimitError` beyond `MAX_DECIMAL_DIGITS` / `MAX_DECIMAL_SCALE`. */
  constructor(unscaled: bigint, scale = 0) {
    if (typeof unscaled !== 'bigint') throw new ValidationError('HLP_DECIMAL_PARSE', 'The unscaled value must be a bigint.');
    checkScale(scale);
    if (unscaled >= LIMIT || unscaled <= -LIMIT) throw new LimitError('HLP_DECIMAL_TOO_LARGE', 'The value exceeds the decimal digit limit.');
    this.unscaled = unscaled;
    this.scale = scale;
    Object.freeze(this);
  }

  /** Sum. @example decimal('1.1').add('2.25').toString() // => '3.35' */
  add(other: DecimalInput): Decimal {
    const b = toDecimal(other);
    const s = Math.max(this.scale, b.scale);
    return new Decimal(this.unscaled * pow10(s - this.scale) + b.unscaled * pow10(s - b.scale), s);
  }

  /** Difference. @example decimal('1').subtract('0.9').toString() // => '0.1' */
  subtract(other: DecimalInput): Decimal {
    return this.add(toDecimal(other).negate());
  }

  /** Exact product (scale = sum of scales), optionally rounded. @example decimal('1.5').multiply('1.5').toString() // => '2.25' */
  multiply(other: DecimalInput, options: DecimalRoundOptions = {}): Decimal {
    const b = toDecimal(other);
    const u = this.unscaled * b.unscaled;
    const s = this.scale + b.scale;
    if (options.scale === undefined) return new Decimal(u, s);
    checkScale(options.scale);
    return new Decimal(rescaleRaw(u, s, options.scale, options.rounding ?? 'half-up'), options.scale);
  }

  /**
   * Quotient rounded to `scale` (default: max of `DEFAULT_DIVISION_SCALE` and both scales).
   * Throws `HLP_DECIMAL_DIVIDE_BY_ZERO`.
   * @example decimal(1).divide(3, { scale: 4 }).toString() // => '0.3333'
   */
  divide(other: DecimalInput, options: DecimalRoundOptions = {}): Decimal {
    const b = toDecimal(other);
    if (b.unscaled === 0n) throw new HelperError('HLP_DECIMAL_DIVIDE_BY_ZERO', 'Division by zero.', { kind: 'validation' });
    const s = options.scale ?? Math.max(DEFAULT_DIVISION_SCALE, this.scale, b.scale);
    checkScale(s);
    // (a/10^as) / (b/10^bs) x 10^s = a x 10^(bs + s) / (b x 10^as)
    return new Decimal(divRound(this.unscaled * pow10(b.scale + s), b.unscaled * pow10(this.scale), options.rounding ?? 'half-up'), s);
  }

  /** Additive inverse. @example decimal('2').negate().toString() // => '-2' */
  negate(): Decimal {
    return new Decimal(-this.unscaled, this.scale);
  }

  /** Absolute value. @example decimal('-2.5').abs().toString() // => '2.5' */
  abs(): Decimal {
    return this.unscaled < 0n ? this.negate() : this;
  }

  /** `-1`, `0` or `1`; scale does not matter (`1.0` equals `1`). @example decimal('1.0').compare('1') // => 0 */
  compare(other: DecimalInput): -1 | 0 | 1 {
    const b = toDecimal(other);
    const s = Math.max(this.scale, b.scale);
    return cmp(this.unscaled * pow10(s - this.scale), b.unscaled * pow10(s - b.scale));
  }

  /** Numeric equality. @example decimal('1.50').equals('1.5') // => true */
  equals(other: DecimalInput): boolean {
    return this.compare(other) === 0;
  }

  /** @example decimal(2).gt(1) // => true */
  gt(other: DecimalInput): boolean {
    return this.compare(other) > 0;
  }

  /** @example decimal(2).gte(2) // => true */
  gte(other: DecimalInput): boolean {
    return this.compare(other) >= 0;
  }

  /** @example decimal(1).lt(2) // => true */
  lt(other: DecimalInput): boolean {
    return this.compare(other) < 0;
  }

  /** @example decimal(2).lte(2) // => true */
  lte(other: DecimalInput): boolean {
    return this.compare(other) <= 0;
  }

  /** @example decimal('0.00').isZero() // => true */
  isZero(): boolean {
    return this.unscaled === 0n;
  }

  /** @example decimal('-0.01').isNegative() // => true */
  isNegative(): boolean {
    return this.unscaled < 0n;
  }

  /** @example decimal('0.01').isPositive() // => true */
  isPositive(): boolean {
    return this.unscaled > 0n;
  }

  /**
   * Rounds (or pads) to exactly `scale` fractional digits.
   * @example decimal('2.345').round(2, 'half-even').toString() // => '2.34'
   */
  round(scale: number, mode: RoundingMode = 'half-up'): Decimal {
    checkScale(scale);
    return scale === this.scale ? this : new Decimal(rescaleRaw(this.unscaled, this.scale, scale, mode), scale);
  }

  /** Removes trailing fractional zeros. @example decimal('1.500').normalize().toString() // => '1.5' */
  normalize(): Decimal {
    let u = this.unscaled;
    let s = this.scale;
    while (s > 0 && u % 10n === 0n) {
      u /= 10n;
      s--;
    }
    return s === this.scale ? this : new Decimal(u, s);
  }

  /** Plain string, never exponent notation; keeps the scale. @example decimal('-0.5').toString() // => '-0.5' */
  toString(): string {
    const neg = this.unscaled < 0n;
    let digits = (neg ? -this.unscaled : this.unscaled).toString();
    if (this.scale > 0) {
      digits = digits.padStart(this.scale + 1, '0');
      digits = `${digits.slice(0, -this.scale)}.${digits.slice(-this.scale)}`;
    }
    return neg ? `-${digits}` : digits;
  }

  /** Rounded plain string with exactly `places` digits. @example decimal('1.005').toFixed(2) // => '1.01' */
  toFixed(places: number, mode: RoundingMode = 'half-up'): string {
    return this.round(places, mode).toString();
  }

  /**
   * Nearest `number`. Lossy: doubles hold about 15–17 significant digits; keep money as `Decimal` or string.
   * @example decimal('0.1').toNumber() // => 0.1
   */
  toNumber(): number {
    return Number(this.toString());
  }

  /** Integer minor units (cents) for a currency with `digits` fraction digits. @example decimal('12.345').toMinorUnits(2) // => 1235n */
  toMinorUnits(digits = 2, mode: RoundingMode = 'half-up'): bigint {
    return this.round(digits, mode).unscaled;
  }

  /**
   * Splits by ratios with the largest-remainder method; the parts always sum exactly to the amount.
   * Ties go to the earlier ratio. Throws when the amount has more digits than `scale`.
   * @example decimal('100').allocate([1, 1, 1], { scale: 2 }).map(String) // => ['33.34', '33.33', '33.33']
   */
  allocate(ratios: readonly DecimalInput[], options: AllocateOptions = {}): Decimal[] {
    const target = options.scale ?? this.scale;
    checkScale(target);
    if (ratios.length === 0 || ratios.length > 1_000_000) throw new ValidationError('HLP_DECIMAL_ALLOCATE', 'Provide between 1 and 1,000,000 ratios.');
    const units = rescaleRaw(this.unscaled, this.scale, target, 'down');
    if (rescaleRaw(units, target, this.scale, 'down') !== this.unscaled) throw new ValidationError('HLP_DECIMAL_ALLOCATE', 'The amount has more fractional digits than the allocation scale.');
    const rs = ratios.map(toDecimal);
    const rScale = Math.max(...rs.map((r) => r.scale));
    const weights = rs.map((r) => r.unscaled * pow10(rScale - r.scale));
    if (weights.some((w) => w < 0n)) throw new ValidationError('HLP_DECIMAL_ALLOCATE', 'Ratios must not be negative.');
    const total = weights.reduce((a, w) => a + w, 0n);
    if (total === 0n) throw new ValidationError('HLP_DECIMAL_ALLOCATE', 'At least one ratio must be positive.');
    const neg = units < 0n;
    const abs = neg ? -units : units;
    const shares = weights.map((w) => (abs * w) / total);
    const rems = weights.map((w, i) => ({ i, r: (abs * w) % total }));
    let leftover = abs - shares.reduce((a, s) => a + s, 0n);
    rems.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
    for (const { i } of rems) {
      if (leftover === 0n) break;
      shares[i] = (shares[i] ?? 0n) + 1n;
      leftover--;
    }
    return shares.map((s) => new Decimal(neg ? -s : s, target));
  }

  /**
   * Splits into `n` near-equal parts that sum exactly to the amount.
   * @example decimal('10.00').split(3).map(String) // => ['3.34', '3.33', '3.33']
   */
  split(n: number, options: AllocateOptions = {}): Decimal[] {
    if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw new ValidationError('HLP_DECIMAL_ALLOCATE', 'The part count must be an integer between 1 and 1,000,000.');
    return this.allocate(new Array<number>(n).fill(1), options);
  }

  /** `pct` percent of this amount (exact unless `scale` is given). @example decimal('200').percent('7.5').toString() // => '15.000' */
  percent(pct: DecimalInput, options: DecimalRoundOptions = {}): Decimal {
    const r = this.multiply(pct);
    const exact = new Decimal(r.unscaled, r.scale + 2);
    return options.scale === undefined ? exact : exact.round(options.scale, options.rounding ?? 'half-up');
  }

  /** What percentage this amount is of `total`. @example decimal(15).percentageOf(200, { scale: 1 }).toString() // => '7.5' */
  percentageOf(total: DecimalInput, options: DecimalRoundOptions = {}): Decimal {
    return this.multiply(100).divide(total, options);
  }

  /** JSON form is the plain string (never a lossy number). @example JSON.stringify({ a: decimal('1.10') }) // => '{"a":"1.10"}' */
  toJSON(): string {
    return this.toString();
  }

  /** String conversion is allowed; numeric coercion (`+d`, `d * 2`) throws to prevent silent precision loss. */
  [Symbol.toPrimitive](hint: string): string {
    if (hint === 'number') throw new HelperError('HLP_DECIMAL_COERCION', 'Use toNumber() to convert a Decimal to a number explicitly.', { kind: 'validation' });
    return this.toString();
  }
}

export interface DecimalOptions extends DecimalRoundOptions {
  /** Accept exponent notation in strings ("1e5"). Default false. */
  readonly allowExponent?: boolean;
  /** Parse strings with this locale's group and decimal symbols (strict grouping), e.g. "1.234,5" for `de`. */
  readonly locale?: LocaleInput;
}

/**
 * Creates a `Decimal`. Strings are parsed strictly (`"-12.50"`); exponents and grouping need options.
 * Throws `HLP_DECIMAL_PARSE` (ValidationError) or `HLP_DECIMAL_TOO_LARGE` (LimitError).
 * @example decimal('19.99').multiply(3).toString() // => '59.97'
 */
export function decimal(value: DecimalInput, options: DecimalOptions = {}): Decimal {
  let d: Decimal;
  if (typeof value === 'string' && (options.locale !== undefined || options.allowExponent === true)) {
    let text = value;
    if (options.locale !== undefined) {
      const canonical = parseNumberString(value, { locale: options.locale, strict: true });
      if (canonical === undefined || value.includes('%') || value.includes(String.fromCharCode(0x66a))) throw new ValidationError('HLP_DECIMAL_PARSE', 'Invalid decimal string.');
      text = canonical.startsWith('.') ? `0${canonical}` : canonical;
    }
    d = parse(text, options.allowExponent === true);
  } else d = toDecimal(value);
  return options.scale === undefined ? d : d.round(options.scale, options.rounding ?? 'half-up');
}

/**
 * Non-throwing `decimal()` for untrusted text: `undefined` when invalid (limit errors still throw).
 * @example parseDecimal('12.3x') // => undefined
 */
export function parseDecimal(text: string, options: DecimalOptions = {}): Decimal | undefined {
  try {
    return decimal(text, options);
  } catch (e) {
    if (e instanceof ValidationError) return undefined;
    throw e;
  }
}

/** True for `Decimal` instances. @example isDecimal(decimal(1)) // => true */
export function isDecimal(value: unknown): value is Decimal {
  return value instanceof Decimal;
}

/** Comparator for `Array#sort`. @example ['2', '10', '1.5'].map((s) => decimal(s)).sort(compareDecimals) */
export function compareDecimals(a: DecimalInput, b: DecimalInput): -1 | 0 | 1 {
  return toDecimal(a).compare(b);
}

/** Exact sum; empty input gives `0`. @example sumDecimals(['0.1', '0.2']).toString() // => '0.3' */
export function sumDecimals(values: Iterable<DecimalInput>): Decimal {
  let acc = new Decimal(0n, 0);
  for (const v of values) acc = acc.add(v);
  return acc;
}

/** Smallest value, or `undefined` for none. @example minDecimal('2', '1.5')?.toString() // => '1.5' */
export function minDecimal(...values: DecimalInput[]): Decimal | undefined {
  let best: Decimal | undefined;
  for (const v of values) {
    const d = toDecimal(v);
    if (best === undefined || d.lt(best)) best = d;
  }
  return best;
}

/** Largest value, or `undefined` for none. @example maxDecimal('2', '10')?.toString() // => '10' */
export function maxDecimal(...values: DecimalInput[]): Decimal | undefined {
  let best: Decimal | undefined;
  for (const v of values) {
    const d = toDecimal(v);
    if (best === undefined || d.gt(best)) best = d;
  }
  return best;
}

/**
 * Decimal from integer minor units (cents) with `digits` fraction digits.
 * @example fromMinorUnits(1999n, 2).toString() // => '19.99'
 */
export function fromMinorUnits(minor: bigint | number, digits = 2): Decimal {
  if (typeof minor === 'number' && !Number.isSafeInteger(minor)) throw new ValidationError('HLP_DECIMAL_MINOR_UNITS', 'Minor units must be a safe integer or bigint.');
  return new Decimal(BigInt(minor), digits);
}

export interface FormatDecimalOptions extends Omit<FormatNumberOptions, 'style' | 'currency'> {
  /** ISO 4217 code; formats as currency with the currency's default digits unless overridden. */
  readonly currency?: string;
  /** Currency display; see `formatCurrency`. */
  readonly display?: 'symbol' | 'narrowSymbol' | 'code' | 'name';
}

/**
 * Formats through `Intl.NumberFormat` using the exact decimal string (no float conversion).
 * Without `currency`, all fractional digits of the scale are shown by default.
 * Intl rounds with `roundingMode` (default half-expand = `half-up`).
 * @example formatDecimal(decimal('1234567890123456789.25'), { locale: 'en-US' }) // => '1,234,567,890,123,456,789.25'
 */
export function formatDecimal(value: DecimalInput, options: FormatDecimalOptions = {}): string {
  const d = toDecimal(value);
  const text = d.toString() as Intl.StringNumericLiteral;
  const { currency, display, ...rest } = options;
  if (currency !== undefined) return formatCurrency(text, currency, display ? { ...rest, display } : rest);
  const digits = Math.min(d.scale, 100);
  const withDigits = rest.minimumFractionDigits === undefined && rest.maximumFractionDigits === undefined ? { ...rest, minimumFractionDigits: digits, maximumFractionDigits: digits } : rest;
  return formatNumber(text, withDigits);
}
