/**
 * Locale-aware number formatting and parsing for Number Input. Separators,
 * digits, signs, and currency/percent/unit literals are all derived from
 * `Intl.NumberFormat#formatToParts`, so parsing accepts exactly what the
 * formatter displays (plus ASCII digits, the ASCII hyphen, and U+2212).
 */
import { configurationError } from '@absoluteui/core';

export interface NumberInputFormat {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  useGrouping?: boolean;
  style?: 'decimal' | 'percent' | 'currency' | 'unit';
  /** ISO 4217 code; required for `style: 'currency'`. */
  currency?: string;
  /** Sanctioned simple unit identifier; required for `style: 'unit'`. */
  unit?: string;
}

export interface ParseResult {
  /** `null` for empty or unparseable text. */
  readonly value: number | null;
  /** The text is not empty and is not a number in this locale. */
  readonly bad: boolean;
}

// Bidi controls Intl inserts around signs and literals in RTL locales.
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;
const MINUS = new Set(['-', '\u2212', '\u2012', '\u2013', '\ufe63', '\uff0d']);
const PLUS = new Set(['+', '\ufb29', '\ufe62', '\uff0b']);
// Zero code points of digit blocks accepted in addition to the locale's own digits:
// ASCII, Arabic-Indic, Extended Arabic-Indic, Devanagari, Bengali, fullwidth.
const DIGIT_ZEROS = [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xff10];
// Maximum fraction digits when the consumer does not set one: enough to never hide typed precision.
const DEFAULT_MAX_FRACTION = 20;

const BAD: ParseResult = Object.freeze({ value: null, bad: true });
const EMPTY: ParseResult = Object.freeze({ value: null, bad: false });

function escapeRegExp(s: string): string {
  // Syntax characters only: identity escapes such as `\-` are invalid with the `u` flag.
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function partsOf(format: Intl.NumberFormat, value: number): Intl.NumberFormatPart[] {
  return format.formatToParts(value);
}

const codecCache = new Map<string, NumberCodec>();
const CODEC_CACHE_MAX = 64;

export class NumberCodec {
  /**
   * Shared, immutable codec per locale and format. Building one runs several
   * Intl.NumberFormat probes, so instances with the same settings reuse it.
   */
  static for(locale: string, spec: NumberInputFormat = {}): NumberCodec {
    const key = `${locale}|${JSON.stringify(spec)}`;
    let codec = codecCache.get(key);
    if (!codec) {
      codec = new NumberCodec(locale, spec);
      if (codecCache.size >= CODEC_CACHE_MAX) codecCache.delete(codecCache.keys().next().value ?? '');
      codecCache.set(key, codec);
    }
    return codec;
  }

  readonly percent: boolean;
  /** Fraction digits of the canonical value kept on commit (`undefined`: no rounding). */
  readonly valueFractionDigits: number | undefined;
  readonly #display: Intl.NumberFormat;
  readonly #decimal: string;
  readonly #group = new Set<string>();
  readonly #minus = new Set(MINUS);
  readonly #plus = new Set(PLUS);
  readonly #digits = new Map<string, string>();
  readonly #literals: RegExp | null;

  constructor(locale: string, spec: NumberInputFormat = {}) {
    const style = spec.style ?? 'decimal';
    const base: Intl.NumberFormatOptions = {
      style,
      ...(spec.currency === undefined ? {} : { currency: spec.currency }),
      ...(spec.unit === undefined ? {} : { unit: spec.unit }),
    };
    const display: Intl.NumberFormatOptions = {
      ...base,
      ...(spec.useGrouping === undefined ? {} : { useGrouping: spec.useGrouping }),
      ...(spec.minimumFractionDigits === undefined ? {} : { minimumFractionDigits: spec.minimumFractionDigits }),
      maximumFractionDigits: spec.maximumFractionDigits ?? DEFAULT_MAX_FRACTION,
    };
    try {
      this.#display = new Intl.NumberFormat(locale, display);
    } catch {
      throw configurationError('NUMBER_INPUT_FORMAT', 'Invalid number format.', { component: 'numberInput', property: 'numberInput.format', expected: 'Intl.NumberFormat options (currency for style "currency", unit for style "unit", fraction digits 0..20, min <= max)' });
    }
    this.percent = style === 'percent';
    const max = spec.maximumFractionDigits;
    this.valueFractionDigits = max === undefined ? undefined : max + (this.percent ? 2 : 0);

    const withFraction = new Intl.NumberFormat(locale, { ...base, minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: true });
    const sample = [...partsOf(withFraction, -1234567.5), ...partsOf(withFraction, 1)];
    this.#decimal = sample.find((p) => p.type === 'decimal')?.value ?? '.';
    for (const p of sample) {
      if (p.type === 'group') this.#group.add(p.value.replace(BIDI, ''));
      if (p.type === 'minusSign') this.#minus.add(p.value.replace(BIDI, ''));
      if (p.type === 'plusSign') this.#plus.add(p.value.replace(BIDI, ''));
    }
    // Users type an apostrophe for the Swiss right single quotation mark group separator.
    if (this.#group.has('\u2019')) this.#group.add('\'');

    const plain = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 0 });
    for (let d = 0; d <= 9; d++) {
      const glyph = plain.format(d).replace(BIDI, '');
      if (Array.from(glyph).length === 1) this.#digits.set(glyph, String(d));
    }

    // Literals to strip: currency symbols/codes/names, percent signs, unit labels, and literal text.
    const literals = new Set<string>();
    const displays: Intl.NumberFormatOptions[] =
      style === 'currency' ? (['symbol', 'narrowSymbol', 'code', 'name'] as const).map((currencyDisplay) => ({ ...base, currencyDisplay }))
        : style === 'unit' ? (['short', 'long', 'narrow'] as const).map((unitDisplay) => ({ ...base, unitDisplay }))
          : [base];
    for (const options of displays) {
      const f = new Intl.NumberFormat(locale, options);
      for (const value of [-1234.5, 1, 2, 0]) {
        for (const p of partsOf(f, value)) {
          if (p.type !== 'currency' && p.type !== 'percentSign' && p.type !== 'unit' && p.type !== 'literal') continue;
          const text = p.value.replace(BIDI, '').replace(/\s+/gu, ' ').trim();
          if (text !== '') literals.add(text);
        }
      }
    }
    if (this.percent) {
      literals.add('%');
      literals.add('\u066a');
    }
    const sorted = [...literals].sort((a, b) => b.length - a.length).map((l) => escapeRegExp(l).replace(/ /g, '\\s*'));
    this.#literals = sorted.length ? new RegExp(sorted.join('|'), 'giu') : null;
  }

  /** Display text for a value. Float noise beyond 15 significant digits is not shown. */
  format(value: number): string {
    return this.#display.format(Number(value.toPrecision(15)));
  }

  /** Round to the configured fraction digits (decimal rounding, not binary `toFixed`). */
  round(value: number): number {
    const digits = this.valueFractionDigits;
    if (digits === undefined) return value;
    return roundDecimal(value, digits);
  }

  parse(text: string): ParseResult {
    let s = text.replace(BIDI, '');
    if (s.trim() === '') return EMPTY;
    if (this.#literals) s = s.replace(this.#literals, '');
    s = s.replace(/\s+/gu, '');
    let negative = false;
    const chars = Array.from(s);
    const first = chars[0];
    const last = chars.at(-1);
    if (first !== undefined && (this.#minus.has(first) || this.#plus.has(first))) {
      negative = this.#minus.has(first);
      chars.shift();
    } else if (last !== undefined && this.#minus.has(last)) {
      negative = true;
      chars.pop();
    }
    let int = '';
    let frac: string | null = null;
    for (const ch of chars) {
      const d = this.#digit(ch);
      if (d !== undefined) {
        if (frac === null) int += d;
        else frac += d;
      } else if (ch === this.#decimal) {
        if (frac !== null) return BAD;
        frac = '';
      } else if (this.#group.has(ch)) {
        // Grouping belongs to the integer part only.
        if (frac !== null) return BAD;
      } else {
        return BAD;
      }
    }
    if (int === '' && !frac) return BAD;
    // Percent: "15" and "15%" both mean 0.15. Shift the exponent instead of dividing (no float error).
    const n = Number(`${int === '' ? '0' : int}.${frac === null || frac === '' ? '0' : frac}${this.percent ? 'e-2' : ''}`);
    if (!Number.isFinite(n)) return BAD;
    const value = negative && n !== 0 ? -n : n;
    return { value, bad: false };
  }

  #digit(ch: string): string | undefined {
    const mapped = this.#digits.get(ch);
    if (mapped !== undefined) return mapped;
    const cp = ch.codePointAt(0) ?? -1;
    for (const zero of DIGIT_ZEROS) {
      if (cp >= zero && cp <= zero + 9) return String(cp - zero);
    }
    return undefined;
  }
}

const rounders = new Map<number, Intl.NumberFormat>();

/** Decimal rounding through ICU (shortest round-trip representation), so 1.005 rounds to 1.01. */
export function roundDecimal(value: number, digits: number): number {
  let f = rounders.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: Math.min(100, digits) });
    rounders.set(digits, f);
  }
  const n = Number(f.format(value).replace('\u2212', '-'));
  return Object.is(n, -0) ? 0 : n;
}
