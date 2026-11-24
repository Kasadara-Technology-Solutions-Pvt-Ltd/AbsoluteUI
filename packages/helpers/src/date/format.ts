/**
 * Pattern formatting/parsing, `Intl` formatting of wall-clock values, relative time, and ranges.
 *
 * Pattern tokens (Unicode/date-fns style; letters outside this set throw `HLP_DATE_INVALID_PATTERN`,
 * so put literal text in single quotes, `''` for a quote):
 *
 * | Token | Meaning | Example |
 * |---|---|---|
 * | `yyyy` / `yy` | year (4 digits, `-` for BCE) / last two digits | 2026 / 26 |
 * | `M` / `MM` | month 1-12 / zero-padded | 9 / 09 |
 * | `MMM` / `MMMM` | month name short / long (Intl, format context) | Sep / September |
 * | `d` / `dd` | day of month / zero-padded | 5 / 05 |
 * | `EEE` / `EEEE` | weekday short / long (Intl) | Tue / Tuesday |
 * | `H` / `HH` | hour 0-23 / zero-padded | 7 / 07 |
 * | `h` / `hh` | hour 1-12 / zero-padded | 7 / 07 |
 * | `mm` / `ss` / `SSS` | minute / second / millisecond, zero-padded | 05 / 09 / 042 |
 * | `a` | day period (Intl, for example AM/PM) | PM |
 * | `Q` | calendar quarter 1-4 | 3 |
 * | `w` | ISO 8601 week number | 40 |
 *
 * Numbers use ASCII digits; use `formatDateIntl` for fully localized output.
 */
import { LimitError, ValidationError } from '../error/index.js';
import { differenceInMonths, differenceInYears, isoWeek, quarterOf } from './calendar.js';
import { dateTimeFormat, relativeTimeFormat } from './intl-cache.js';
import { monthName, weekdayName } from './locale.js';
import { daysBetween, isoWeekday, plainDate, today, toPlainDate, type DateInput, type IsoWeekday, type PlainDate } from './plain-date.js';
import { isPlainDateTime, plainDateTime, plainDateTimeToEpochMilliseconds, plainTime, type PlainDateTime } from './plain-time.js';
import { toEpochMs, type InstantInput } from './zone.js';

type FieldToken = 'yyyy' | 'yy' | 'MMMM' | 'MMM' | 'MM' | 'M' | 'dd' | 'd' | 'EEEE' | 'EEE' | 'HH' | 'H' | 'hh' | 'h' | 'mm' | 'ss' | 'SSS' | 'a' | 'Q' | 'w';
type Token = { readonly lit: string } | { readonly field: FieldToken };

const FIELD_TOKENS = new Set<string>(['yyyy', 'yy', 'MMMM', 'MMM', 'MM', 'M', 'dd', 'd', 'EEEE', 'EEE', 'HH', 'H', 'hh', 'h', 'mm', 'ss', 'SSS', 'a', 'Q', 'w']);
const MAX_PATTERN = 256;
const MAX_TEXT = 256;
const compiled = new Map<string, readonly Token[]>();

const isLetter = (c: string): boolean => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isFieldToken = (s: string): s is FieldToken => FIELD_TOKENS.has(s);

function badPattern(): ValidationError {
  return new ValidationError('HLP_DATE_INVALID_PATTERN', 'Unsupported date pattern.');
}

function compile(pattern: string): readonly Token[] {
  const hit = compiled.get(pattern);
  if (hit) return hit;
  if (typeof pattern !== 'string') throw badPattern();
  if (pattern.length > MAX_PATTERN) throw new LimitError('HLP_DATE_PATTERN_TOO_LONG', 'Date pattern exceeds 256 characters.');
  const tokens: Token[] = [];
  let lit = '';
  const flush = (): void => {
    if (lit) tokens.push({ lit });
    lit = '';
  };
  let i = 0;
  while (i < pattern.length) {
    const c = pattern.charAt(i);
    if (c === "'") {
      if (pattern.charAt(i + 1) === "'") {
        lit += "'";
        i += 2;
        continue;
      }
      i++;
      let closed = false;
      while (i < pattern.length) {
        const q = pattern.charAt(i);
        if (q === "'") {
          if (pattern.charAt(i + 1) === "'") {
            lit += "'";
            i += 2;
            continue;
          }
          closed = true;
          i++;
          break;
        }
        lit += q;
        i++;
      }
      if (!closed) throw badPattern();
    } else if (isLetter(c)) {
      let j = i;
      while (pattern.charAt(j) === c) j++;
      const run = pattern.slice(i, j);
      if (!isFieldToken(run)) throw badPattern();
      flush();
      tokens.push({ field: run });
      i = j;
    } else {
      lit += c;
      i++;
    }
  }
  flush();
  const frozen = Object.freeze(tokens);
  if (compiled.size >= 64) compiled.clear();
  compiled.set(pattern, frozen);
  return frozen;
}

interface Fields {
  readonly date: PlainDate;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

function fieldsOf(value: DateInput | PlainDateTime): Fields {
  if (isPlainDateTime(value)) return { date: value.date, ...value.time };
  return { date: toPlainDate(value), hour: 0, minute: 0, second: 0, millisecond: 0 };
}

const pad = (n: number, len: number): string => String(n).padStart(len, '0');

function dayPeriods(locale: string | undefined): [string, string] {
  const f = dateTimeFormat(locale, { hour: 'numeric', hour12: true, timeZone: 'UTC' });
  const get = (h: number, fallback: string): string => f.formatToParts(Date.UTC(2024, 0, 1, h)).find((p) => p.type === 'dayPeriod')?.value ?? fallback;
  return [get(9, 'AM'), get(21, 'PM')];
}

export interface PatternOptions {
  /** Locale for names (`MMM`, `EEE`, `a`); default the runtime locale. */
  readonly locale?: string;
}

/**
 * Formats a date or date-time with a pattern (token table at the top of this module).
 * @example formatDate('2026-09-29', "EEE, d MMM yyyy 'Q'Q") // => 'Tue, 29 Sep 2026 Q3'
 */
export function formatDate(value: DateInput | PlainDateTime, pattern: string, options: PatternOptions = {}): string {
  const tokens = compile(pattern);
  const f = fieldsOf(value);
  const { locale } = options;
  const loc = locale === undefined ? {} : { locale };
  let out = '';
  for (const t of tokens) {
    if ('lit' in t) {
      out += t.lit;
      continue;
    }
    const { year, month, day } = f.date;
    switch (t.field) {
      case 'yyyy': out += year < 0 ? `-${pad(-year, 4)}` : pad(year, 4); break;
      case 'yy': out += pad(((year % 100) + 100) % 100, 2); break;
      case 'M': out += String(month); break;
      case 'MM': out += pad(month, 2); break;
      case 'MMM': out += monthName(month, { ...loc, style: 'short', context: 'format' }); break;
      case 'MMMM': out += monthName(month, { ...loc, style: 'long', context: 'format' }); break;
      case 'd': out += String(day); break;
      case 'dd': out += pad(day, 2); break;
      case 'EEE': out += weekdayName(isoWeekday(f.date), { ...loc, style: 'short' }); break;
      case 'EEEE': out += weekdayName(isoWeekday(f.date), { ...loc, style: 'long' }); break;
      case 'H': out += String(f.hour); break;
      case 'HH': out += pad(f.hour, 2); break;
      case 'h': out += String(f.hour % 12 || 12); break;
      case 'hh': out += pad(f.hour % 12 || 12, 2); break;
      case 'mm': out += pad(f.minute, 2); break;
      case 'ss': out += pad(f.second, 2); break;
      case 'SSS': out += pad(f.millisecond, 3); break;
      case 'a': out += dayPeriods(locale)[f.hour < 12 ? 0 : 1]; break;
      case 'Q': out += String(quarterOf(f.date)); break;
      case 'w': out += String(isoWeek(f.date)); break;
    }
  }
  return out;
}

export interface ParsePatternOptions extends PatternOptions {
  /**
   * `yy` maps to the year with those last two digits in `[referenceYear - 50, referenceYear + 49]`.
   * Default 2000 (so `yy` covers 1950-2049).
   */
  readonly referenceYear?: number;
}

interface Parsed {
  year?: number;
  month?: number;
  day?: number;
  hour24?: number;
  hour12?: number;
  pm?: boolean;
  minute?: number;
  second?: number;
  millisecond?: number;
  weekday?: number;
  quarter?: number;
  week?: number;
}

const nameListCache = new Map<string, readonly string[]>();

function names(locale: string | undefined, kind: 'MMM' | 'MMMM' | 'EEE' | 'EEEE', context: 'format' | 'standalone'): readonly string[] {
  const key = `${locale ?? ''}|${kind}|${context}`;
  const hit = nameListCache.get(key);
  if (hit) return hit;
  const loc = locale === undefined ? {} : { locale };
  const list: string[] = [];
  if (kind === 'MMM' || kind === 'MMMM') {
    for (let m = 1; m <= 12; m++) list.push(monthName(m, { ...loc, style: kind === 'MMM' ? 'short' : 'long', context }));
  } else {
    for (let d = 1; d <= 7; d++) list.push(weekdayName(d as IsoWeekday, { ...loc, style: kind === 'EEE' ? 'short' : 'long' }));
  }
  const frozen = Object.freeze(list);
  if (nameListCache.size >= 128) nameListCache.clear();
  nameListCache.set(key, frozen);
  return frozen;
}

/** Index (0-based) of the longest name matching `text` at `pos`, case-insensitively, and its length. */
function matchName(text: string, pos: number, lists: readonly (readonly string[])[], locale: string | undefined): [number, number] | undefined {
  let best: [number, number] | undefined;
  for (const list of lists) {
    list.forEach((name, index) => {
      if (!name || (best && name.length <= best[1])) return;
      const slice = text.slice(pos, pos + name.length);
      if (slice.length === name.length && slice.toLocaleLowerCase(locale) === name.toLocaleLowerCase(locale)) best = [index, name.length];
    });
  }
  return best;
}

const isDigit = (c: string): boolean => c >= '0' && c <= '9';

function parseFields(text: string, pattern: string, options: ParsePatternOptions): Parsed | undefined {
  if (typeof text !== 'string' || text.length > MAX_TEXT) return undefined;
  const tokens = compile(pattern);
  const { locale } = options;
  const out: Parsed = {};
  let pos = 0;
  const set = (key: keyof Parsed, value: number | boolean): boolean => {
    const prev = out[key];
    if (prev !== undefined && prev !== value) return false;
    (out as Record<keyof Parsed, number | boolean | undefined>)[key] = value;
    return true;
  };
  const digits = (min: number, max: number): number | undefined => {
    let end = pos;
    while (end < text.length && end - pos < max && isDigit(text.charAt(end))) end++;
    if (end - pos < min) return undefined;
    const v = Number(text.slice(pos, end));
    pos = end;
    return v;
  };
  for (const t of tokens) {
    if ('lit' in t) {
      if (!text.startsWith(t.lit, pos)) return undefined;
      pos += t.lit.length;
      continue;
    }
    let ok: boolean;
    switch (t.field) {
      case 'yyyy': {
        const v = digits(4, 4);
        ok = v !== undefined && set('year', v);
        break;
      }
      case 'yy': {
        const v = digits(2, 2);
        const ref = options.referenceYear ?? 2000;
        if (v === undefined || !Number.isInteger(ref)) return undefined;
        const lo = ref - 50;
        const year = lo + ((((v - lo) % 100) + 100) % 100);
        ok = set('year', year);
        break;
      }
      case 'M': case 'MM': {
        const v = t.field === 'M' ? digits(1, 2) : digits(2, 2);
        ok = v !== undefined && set('month', v);
        break;
      }
      case 'MMM': case 'MMMM': {
        const m = matchName(text, pos, [names(locale, t.field, 'format'), names(locale, t.field, 'standalone')], locale);
        if (!m) return undefined;
        pos += m[1];
        ok = set('month', m[0] + 1);
        break;
      }
      case 'd': case 'dd': {
        const v = t.field === 'd' ? digits(1, 2) : digits(2, 2);
        ok = v !== undefined && set('day', v);
        break;
      }
      case 'EEE': case 'EEEE': {
        const m = matchName(text, pos, [names(locale, t.field, 'format')], locale);
        if (!m) return undefined;
        pos += m[1];
        ok = set('weekday', m[0] + 1);
        break;
      }
      case 'H': case 'HH': {
        const v = t.field === 'H' ? digits(1, 2) : digits(2, 2);
        ok = v !== undefined && set('hour24', v);
        break;
      }
      case 'h': case 'hh': {
        const v = t.field === 'h' ? digits(1, 2) : digits(2, 2);
        ok = v !== undefined && set('hour12', v);
        break;
      }
      case 'mm': { const v = digits(2, 2); ok = v !== undefined && set('minute', v); break; }
      case 'ss': { const v = digits(2, 2); ok = v !== undefined && set('second', v); break; }
      case 'SSS': { const v = digits(3, 3); ok = v !== undefined && set('millisecond', v); break; }
      case 'a': {
        const [am, pm] = dayPeriods(locale);
        const m = matchName(text, pos, [[am, pm]], locale);
        if (!m) return undefined;
        pos += m[1];
        ok = set('pm', m[0] === 1);
        break;
      }
      case 'Q': { const v = digits(1, 1); ok = v !== undefined && set('quarter', v); break; }
      case 'w': { const v = digits(1, 2); ok = v !== undefined && set('week', v); break; }
    }
    if (!ok) return undefined;
  }
  return pos === text.length ? out : undefined;
}

function buildDateTime(p: Parsed): PlainDateTime | undefined {
  if (p.year === undefined) return undefined;
  let hour = p.hour24 ?? 0;
  if (p.hour12 !== undefined) {
    if (p.pm === undefined || p.hour12 < 1 || p.hour12 > 12) return undefined;
    const h = (p.hour12 % 12) + (p.pm ? 12 : 0);
    if (p.hour24 !== undefined && p.hour24 !== h) return undefined;
    hour = h;
  }
  let result: PlainDateTime;
  try {
    result = plainDateTime(plainDate(p.year, p.month ?? 1, p.day ?? 1), plainTime(hour, p.minute ?? 0, p.second ?? 0, p.millisecond ?? 0));
  } catch {
    return undefined;
  }
  if (p.weekday !== undefined && p.weekday !== isoWeekday(result.date)) return undefined;
  if (p.quarter !== undefined && p.quarter !== quarterOf(result.date)) return undefined;
  if (p.week !== undefined && p.week !== isoWeek(result.date)) return undefined;
  return result;
}

/**
 * Strictly parses a date-time with a pattern (same tokens as `formatDate`). Returns `undefined`
 * on any mismatch, impossible value, or inconsistent field (for example a weekday that does not
 * match the date). The year is required; a missing month or day defaults to 1. `h`/`hh` require `a`.
 * @example parseDateTime('29/09/2026 14:05', 'dd/MM/yyyy HH:mm') // => '2026-09-29T14:05:00'
 */
export function parseDateTime(text: string, pattern: string, options: ParsePatternOptions = {}): PlainDateTime | undefined {
  const fields = parseFields(text, pattern, options);
  return fields ? buildDateTime(fields) : undefined;
}

/**
 * Strictly parses a date with a pattern; time tokens are validated and discarded.
 * @example parseDate('Sep 29, 2026', 'MMM d, yyyy', { locale: 'en' }) // => '2026-09-29'
 */
export function parseDate(text: string, pattern: string, options: ParsePatternOptions = {}): PlainDate | undefined {
  return parseDateTime(text, pattern, options)?.date;
}

/** `Intl.DateTimeFormat` options for wall-clock values (the zone is fixed internally). */
export type DateIntlOptions = Omit<Intl.DateTimeFormatOptions, 'timeZone' | 'timeZoneName'> & { readonly locale?: string };

function wallEpoch(value: DateInput | PlainDateTime): number {
  return isPlainDateTime(value) ? plainDateTimeToEpochMilliseconds(value) : plainDateTimeToEpochMilliseconds(plainDateTime(value));
}

function intlOptions(options: DateIntlOptions): Intl.DateTimeFormatOptions {
  const hasField = Object.keys(options).some((k) => k !== 'locale' && k !== 'calendar' && k !== 'numberingSystem' && k !== 'hour12' && k !== 'hourCycle' && k !== 'localeMatcher' && k !== 'formatMatcher');
  return { ...options, ...(hasField ? {} : { dateStyle: 'medium' }), timeZone: 'UTC' };
}

/**
 * Formats a date or wall-clock date-time with `Intl.DateTimeFormat` (cached). The value is
 * rendered in UTC internally, so the calendar date never shifts. Default `{ dateStyle: 'medium' }`.
 * @example formatDateIntl('2026-09-29', { locale: 'de', dateStyle: 'long' }) // => '29. September 2026'
 */
export function formatDateIntl(value: DateInput | PlainDateTime, options: DateIntlOptions = {}): string {
  return dateTimeFormat(options.locale, intlOptions(options)).format(wallEpoch(value));
}

/**
 * Formats a range with `Intl.DateTimeFormat#formatRange` (shared parts collapsed, "Jan 1 - 5, 2026"),
 * falling back to `start - end`. Throws `HLP_DATE_INVALID_INTERVAL` when `end < start`.
 * @example formatDateRange('2026-01-01', '2026-01-05', { locale: 'en' }) // => 'Jan 1 – 5, 2026'
 */
export function formatDateRange(start: DateInput | PlainDateTime, end: DateInput | PlainDateTime, options: DateIntlOptions = {}): string {
  const a = wallEpoch(start);
  const b = wallEpoch(end);
  if (b < a) throw new ValidationError('HLP_DATE_INVALID_INTERVAL', 'Interval end is before its start.');
  const f = dateTimeFormat(options.locale, intlOptions(options));
  const range = (f as Partial<Pick<Intl.DateTimeFormat, 'formatRange'>>).formatRange;
  return range ? range.call(f, a, b) : `${f.format(a)} to ${f.format(b)}`;
}

export interface RelativeOptions {
  readonly locale?: string;
  /** `'auto'` (default) allows "yesterday"/"now"; `'always'` forces numbers. */
  readonly numeric?: 'auto' | 'always';
  readonly style?: 'long' | 'short' | 'narrow';
}

const RELATIVE_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number, number])[] = [
  ['second', 1000, 60],
  ['minute', 60_000, 60],
  ['hour', 3_600_000, 24],
  ['day', 86_400_000, 7],
  ['week', 604_800_000, 4],
  ['month', 2_629_746_000, 12],
  ['year', 31_556_952_000, Infinity],
];

function rtf(options: RelativeOptions): Intl.RelativeTimeFormat {
  return relativeTimeFormat(options.locale, { numeric: options.numeric ?? 'auto', style: options.style ?? 'long' });
}

/**
 * Describes `value` relative to `base` (default now) with the best unit, seconds to years
 * (months and years use average Gregorian lengths).
 * @example formatRelative(Date.UTC(2026, 8, 29, 9), Date.UTC(2026, 8, 29, 12), { locale: 'en' }) // => '3 hours ago'
 * @example formatRelative(Date.now() - 3 * 3_600_000) // e.g. '3 hours ago' (relative to now, in the runtime locale)
 */
export function formatRelative(value: InstantInput, base: InstantInput = Date.now(), options: RelativeOptions = {}): string {
  const diff = toEpochMs(value) - toEpochMs(base);
  const abs = Math.abs(diff);
  for (const [unit, ms, limit] of RELATIVE_UNITS) {
    const v = Math.round(abs / ms);
    if (v < limit) return rtf(options).format(v === 0 ? 0 : diff < 0 ? -v : v, unit);
  }
  return rtf(options).format(0, 'second');
}

/**
 * Describes a date relative to `base` (default today in the runtime zone) in calendar units:
 * days under a week, then weeks, complete months, and complete years.
 * @example formatRelativeDate('2026-09-28', '2026-09-29') // => 'yesterday'
 */
export function formatRelativeDate(date: DateInput, base: DateInput = today(), options: RelativeOptions = {}): string {
  const days = daysBetween(base, date);
  const f = rtf(options);
  if (Math.abs(days) < 7) return f.format(days, 'day');
  const months = differenceInMonths(date, base);
  if (months === 0) return f.format(Math.round(days / 7), 'week');
  if (Math.abs(months) < 12) return f.format(months, 'month');
  return f.format(differenceInYears(date, base), 'year');
}
