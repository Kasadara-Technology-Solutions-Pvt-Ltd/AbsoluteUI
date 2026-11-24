/**
 * English number words and Roman numerals. Both are deliberately locale-independent
 * (docs/PLAN-HELPERS.md section 6: `numberToWords` is the documented English-only helper).
 */
import { LimitError, ValidationError } from '../error/index.js';
import { assertFinite, plainString } from './internal.js';

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'];

export interface NumberToWordsOptions {
  /** British style "one hundred and five". Default false (US: "one hundred five"). */
  readonly and?: boolean;
}

function below1000(n: number, useAnd: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h] ?? ''} hundred`);
  if (r) {
    if (h && useAnd) parts.push('and');
    parts.push(r < 20 ? (ONES[r] ?? '') : `${TENS[Math.floor(r / 10)] ?? ''}${r % 10 ? `-${ONES[r % 10] ?? ''}` : ''}`);
  }
  return parts.join(' ');
}

/**
 * English words for a number up to +/-10¹⁵ (English only, by design). Fractions are read digit by digit.
 * @example numberToWords(-1234.05) // => 'minus one thousand two hundred thirty-four point zero five'
 */
export function numberToWords(value: number, options: NumberToWordsOptions = {}): string {
  assertFinite(value);
  if (Math.abs(value) > 1e15) throw new LimitError('HLP_NUMBER_TOO_LARGE', 'The value exceeds the supported range for words.');
  const useAnd = options.and === true;
  const [intStr = '0', fracStr = ''] = plainString(Math.abs(value)).split('.');
  let n = Number(intStr);
  const groups: string[] = [];
  if (n === 0) groups.push('zero');
  for (let scale = 0; n > 0; scale++) {
    const chunk = n % 1000;
    n = Math.floor(n / 1000);
    if (chunk) groups.unshift(SCALES[scale] ? `${below1000(chunk, useAnd)} ${SCALES[scale] ?? ''}` : below1000(chunk, useAnd));
  }
  let out = groups.join(' ');
  // British style also joins a final chunk below 100 with "and" ("one thousand and five").
  if (useAnd && Number(intStr) >= 1000 && Number(intStr) % 1000 < 100 && Number(intStr) % 1000 > 0) {
    const last = groups.pop() ?? '';
    out = `${groups.join(' ')} and ${last}`;
  }
  if (fracStr) out += ` point ${Array.from(fracStr, (d) => ONES[Number(d)] ?? '').join(' ')}`;
  return value < 0 && out !== 'zero' ? `minus ${out}` : out;
}

const ROMAN: readonly (readonly [number, string])[] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/**
 * Roman numeral for an integer in `1..3999`.
 * @example toRoman(2026) // => 'MMXXVI'
 */
export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) throw new ValidationError('HLP_NUMBER_ROMAN_RANGE', 'Roman numerals support integers from 1 to 3999.');
  let n = value;
  let out = '';
  for (const [v, s] of ROMAN) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

const ROMAN_VALUES = new Map<string, number>([['I', 1], ['V', 5], ['X', 10], ['L', 50], ['C', 100], ['D', 500], ['M', 1000]]);

/**
 * Parses a canonical Roman numeral (case-insensitive, `1..3999`); `undefined` for non-canonical forms like "IIII".
 * @example fromRoman('mcmxcix') // => 1999
 */
export function fromRoman(text: string): number | undefined {
  if (typeof text !== 'string' || text.length === 0 || text.length > 15) return undefined;
  const s = text.toUpperCase();
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN_VALUES.get(s.charAt(i));
    if (v === undefined) return undefined;
    const next = ROMAN_VALUES.get(s.charAt(i + 1)) ?? 0;
    total += v < next ? -v : v;
  }
  return total >= 1 && total <= 3999 && toRoman(total) === s ? total : undefined;
}
