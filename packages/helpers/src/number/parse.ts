/**
 * Locale-aware number parsing (symbols derived from `Intl.NumberFormat#formatToParts`).
 */
import { LimitError } from '../error/index.js';
import { numberFormat, type LocaleInput } from './format.js';
import { partsToPlain } from './internal.js';

/** Longest accepted input for `parseNumber` / `parseNumberString`. */
export const MAX_NUMBER_TEXT = 1000;

interface LocaleSymbols {
  readonly group: ReadonlySet<string>;
  readonly decimal: string;
  readonly minus: ReadonlySet<string>;
  readonly plus: ReadonlySet<string>;
  readonly percent: ReadonlySet<string>;
  readonly primary: number;
  readonly secondary: number;
}

const SPACES = [' ', '\u00a0', '\u202f', '\u2009'];
/** Code point of "0" in each Unicode decimal digit block this parser maps to ASCII. */
const ZEROS = [0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0de6, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x17e0, 0x1810, 0x1946, 0x19d0, 0x1b50, 0xa8d0, 0xa900, 0xff10];
const isBidi = (cp: number): boolean => cp === 0x061c || cp === 0x200e || cp === 0x200f || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
const stripBidi = (s: string): string => Array.from(s).filter((c) => !isBidi(c.codePointAt(0) ?? 0)).join('');

const symbolCache = new Map<string, LocaleSymbols>();

function symbolsFor(locale: LocaleInput): LocaleSymbols {
  const key = locale === undefined ? '' : typeof locale === 'string' ? locale : locale.join(',');
  const cached = symbolCache.get(key);
  if (cached) return cached;
  const parts = numberFormat(locale, { useGrouping: true }).formatToParts(-1234567890.5);
  const strip = stripBidi;
  let group = ',';
  let decimal = '.';
  let minus = '-';
  const ints: number[] = [];
  for (const p of parts) {
    if (p.type === 'group') group = p.value;
    else if (p.type === 'decimal') decimal = p.value;
    else if (p.type === 'minusSign') minus = strip(p.value) || '-';
    else if (p.type === 'integer') ints.push(p.value.length);
  }
  const plusPart = numberFormat(locale, { signDisplay: 'always' }).formatToParts(1).find((p) => p.type === 'plusSign');
  const pctPart = numberFormat(locale, { style: 'percent' }).formatToParts(0.5).find((p) => p.type === 'percentSign');
  const groupSet = new Set([group]);
  if (SPACES.includes(group)) for (const s of SPACES) groupSet.add(s);
  if (group === '\u2019' || group === "'") {
    groupSet.add("'");
    groupSet.add('\u2019');
  }
  const primary = ints.at(-1) ?? 3;
  const sym: LocaleSymbols = {
    group: groupSet,
    decimal,
    minus: new Set(['-', '\u2212', minus]),
    plus: new Set(['+', plusPart ? strip(plusPart.value) || '+' : '+']),
    percent: new Set(['%', '\u066a', pctPart ? strip(pctPart.value) || '%' : '%']),
    primary,
    secondary: ints.length > 2 ? (ints.at(-2) ?? primary) : primary,
  };
  if (symbolCache.size >= 32) symbolCache.clear();
  symbolCache.set(key, sym);
  return sym;
}

function toAsciiDigit(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  for (const z of ZEROS) if (cp >= z && cp <= z + 9) return String(cp - z);
  return ch;
}

export interface ParseNumberOptions {
  /** Locale whose group, decimal, sign and percent symbols are expected. Default: runtime locale. */
  readonly locale?: LocaleInput;
  /** Reject misplaced group separators (e.g. "1,2,3") and dangling decimal points. Default false. */
  readonly strict?: boolean;
}

/**
 * Parses localized numeric text into a canonical ASCII decimal string (lossless, no exponent),
 * or `undefined` when the text is not a number. A percent sign divides by 100.
 * Non-Latin digits (Arabic-Indic, Devanagari, ...), NBSP / narrow NBSP group separators and
 * U+2212 minus are accepted. Throws `HLP_NUMBER_TOO_LONG` above `MAX_NUMBER_TEXT` characters.
 * @example parseNumberString('1.234.567,891', { locale: 'de' }) // => '1234567.891'
 */
export function parseNumberString(text: string, options: ParseNumberOptions = {}): string | undefined {
  if (typeof text !== 'string') return undefined;
  if (text.length > MAX_NUMBER_TEXT) throw new LimitError('HLP_NUMBER_TOO_LONG', 'The numeric text exceeds the length limit.');
  const sym = symbolsFor(options.locale);
  const strict = options.strict === true;
  const chars = Array.from(stripBidi(text).trim(), toAsciiDigit);
  let i = 0;
  let negative = false;
  let signSeen = false;
  let percent = false;
  const skipSpaces = (): void => {
    while (i < chars.length && SPACES.includes(chars[i] ?? '')) i++;
  };
  // Prefix: sign and/or percent in either order (e.g. "-%50" in Turkish).
  for (let k = 0; k < 2; k++) {
    const c = chars[i] ?? '';
    if (!signSeen && (sym.minus.has(c) || sym.plus.has(c))) {
      negative = sym.minus.has(c);
      signSeen = true;
      i++;
    } else if (!percent && sym.percent.has(c)) {
      percent = true;
      i++;
      skipSpaces();
    }
  }
  let lastDigit = -1;
  for (let k = chars.length - 1; k >= 0; k--) {
    const c = chars[k] ?? '';
    if (c >= '0' && c <= '9') {
      lastDigit = k;
      break;
    }
  }
  const runs: number[] = [];
  let run = '';
  let intDigits = '';
  let frac = '';
  let seenDecimal = false;
  let anyDigit = false;
  let lastWasGroup = false;
  for (; i < chars.length; i++) {
    const c = chars[i] ?? '';
    if (c >= '0' && c <= '9') {
      anyDigit = true;
      lastWasGroup = false;
      if (seenDecimal) frac += c;
      else run += c;
    } else if (c === sym.decimal && !seenDecimal) {
      if (lastWasGroup) return undefined;
      seenDecimal = true;
      runs.push(run.length);
      intDigits += run;
      run = '';
    } else if (sym.group.has(c) && !seenDecimal) {
      // A space-like group char followed by a percent sign is padding, not grouping.
      if (SPACES.includes(c) && i > lastDigit) break;
      if (run === '' || lastWasGroup) return undefined;
      runs.push(run.length);
      intDigits += run;
      run = '';
      lastWasGroup = true;
    } else break;
  }
  if (!seenDecimal) {
    runs.push(run.length);
    intDigits += run;
  }
  if (lastWasGroup) return undefined;
  skipSpaces();
  if (!percent && sym.percent.has(chars[i] ?? '')) {
    percent = true;
    i++;
  }
  if (i !== chars.length || !anyDigit) return undefined;
  if (strict) {
    if (seenDecimal && (frac === '' || intDigits === '')) return undefined;
    if (runs.length > 1) {
      const last = runs.length - 1;
      for (let r = 0; r <= last; r++) {
        const len = runs[r] ?? 0;
        if (r === last ? len !== sym.primary : r === 0 ? len < 1 || len > sym.secondary : len !== sym.secondary) return undefined;
      }
    }
  }
  const digits = (intDigits + frac).replace(/^0+(?=\d)/, '');
  return partsToPlain({ negative, digits, exponent: -frac.length - (percent ? 2 : 0) });
}

/**
 * Locale-aware number parse; `undefined` for garbage, empty text, or values outside the double range.
 * @example
 * parseNumber('١٢٣٫٥', { locale: 'ar-EG' }); // => 123.5
 * parseNumber('12 %', { locale: 'fr' }); // => 0.12
 */
export function parseNumber(text: string, options: ParseNumberOptions = {}): number | undefined {
  const s = parseNumberString(text, options);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? (n === 0 ? 0 : n) : undefined;
}

const KILO = new Map<string, number>([
  ['k', 1], ['kb', 1], ['kilobyte', 1], ['kilobytes', 1],
  ['m', 2], ['mb', 2], ['megabyte', 2], ['megabytes', 2],
  ['g', 3], ['gb', 3], ['gigabyte', 3], ['gigabytes', 3],
  ['t', 4], ['tb', 4], ['terabyte', 4], ['terabytes', 4],
  ['p', 5], ['pb', 5], ['petabyte', 5], ['petabytes', 5],
]);
const BINARY = new Map<string, number>([
  ['kib', 1], ['kibibyte', 1], ['kibibytes', 1],
  ['mib', 2], ['mebibyte', 2], ['mebibytes', 2],
  ['gib', 3], ['gibibyte', 3], ['gibibytes', 3],
  ['tib', 4], ['tebibyte', 4], ['tebibytes', 4],
  ['pib', 5], ['pebibyte', 5], ['pebibytes', 5],
]);

export interface ParseBytesOptions {
  /** Multiplier for "KB", "MB", ... (default 1000). "KiB", "MiB", ... are always 1024. */
  readonly base?: 1000 | 1024;
  /** Locale of the numeric part. Default `'en'`. */
  readonly locale?: LocaleInput;
}

/**
 * Parses a byte size ("1.5 GB", "512 KiB", "3 megabytes", "42") into whole bytes; `undefined` when invalid or negative.
 * @example
 * parseBytes('1.5 GB'); // => 1500000000
 * parseBytes('1 KiB'); // => 1024
 */
export function parseBytes(text: string, options: ParseBytesOptions = {}): number | undefined {
  if (typeof text !== 'string') return undefined;
  if (text.length > 256) throw new LimitError('HLP_NUMBER_TOO_LONG', 'The byte size text exceeds the length limit.');
  const { base = 1000, locale = 'en' } = options;
  const t = text.trim();
  const at = t.search(/\p{L}/u);
  const numPart = (at === -1 ? t : t.slice(0, at)).trim();
  const unit = (at === -1 ? '' : t.slice(at)).trim().toLowerCase();
  if (numPart.includes('%')) return undefined;
  const n = parseNumber(numPart, { locale });
  if (n === undefined || n < 0) return undefined;
  let mult: number;
  if (unit === '' || unit === 'b' || unit === 'byte' || unit === 'bytes') mult = 1;
  else if (KILO.has(unit)) mult = base ** (KILO.get(unit) ?? 0);
  else if (BINARY.has(unit)) mult = 1024 ** (BINARY.get(unit) ?? 0);
  else return undefined;
  const r = Math.round(n * mult);
  return Number.isSafeInteger(r) ? r : undefined;
}

/**
 * True when `text` is a plain decimal string (`-12.5`, `.5`, no exponent) whose value a `number`
 * holds exactly: integers must be safe, fractions at most 15 significant digits.
 * @example
 * isSafeNumberString('9007199254740993'); // => false
 * isSafeNumberString('0.1'); // => true
 */
export function isSafeNumberString(text: string): boolean {
  if (typeof text !== 'string' || text.length > 400 || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return false;
  const unsigned = text.replace(/^[+-]/, '');
  const [intPart = '', fracPart = ''] = unsigned.split('.');
  let end = fracPart.length;
  while (end > 0 && fracPart.charCodeAt(end - 1) === 48) end--;
  const frac = fracPart.slice(0, end);
  if (frac === '') {
    const n = Number(intPart || '0');
    return Number.isSafeInteger(n) && BigInt(intPart || '0') === BigInt(n);
  }
  const sig = (intPart + frac).replace(/^0+/, '');
  return sig.length <= 15 && Number(unsigned) !== 0;
}
