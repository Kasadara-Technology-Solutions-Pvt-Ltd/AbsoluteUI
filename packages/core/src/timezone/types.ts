/**
 * Explicit date/time value types (SPEC section 8.4). Values are immutable and validated;
 * AbsoluteUI never represents these concepts as ambiguous strings.
 */
import { addDays as addEpochDays, addMonths as addCalendarMonths, daysInMonth as helperDaysInMonth, isLeapYear as helperIsLeapYear, isoWeekday } from '@absoluteui/helpers/date';
import { isHelperError } from '@absoluteui/helpers/error';
import { validationError } from '../errors.js';

export interface PlainDate {
  readonly kind: 'PlainDate';
  readonly year: number;
  /** 1-12 */
  readonly month: number;
  /** 1-31 */
  readonly day: number;
}

export interface PlainTime {
  readonly kind: 'PlainTime';
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

export interface PlainDateTime {
  readonly kind: 'PlainDateTime';
  readonly date: PlainDate;
  readonly time: PlainTime;
}

/** An exact point on the UTC timeline. */
export interface Instant {
  readonly kind: 'Instant';
  readonly epochMilliseconds: number;
}

/** An exact instant observed in a specific IANA timezone. */
export interface ZonedDateTime {
  readonly kind: 'ZonedDateTime';
  readonly epochMilliseconds: number;
  readonly timeZone: string;
}

/** A fixed-length duration in milliseconds (not a calendar duration such as "1 month"). */
export interface Duration {
  readonly kind: 'Duration';
  readonly milliseconds: number;
}

/** Inclusive range of comparable values. */
export interface Range<T> {
  readonly start: T;
  readonly end: T;
}

// Calendar arithmetic is implemented once, in @absoluteui/helpers (R5 H7).
export function isLeapYear(year: number): boolean {
  return helperIsLeapYear(year);
}

export function daysInMonth(year: number, month: number): number {
  return helperDaysInMonth(year, month);
}

/** Runs helper date arithmetic, reporting out-of-range results with core's error model. */
function inRange<T>(compute: () => T): T {
  try {
    return compute();
  } catch (e) {
    if (isHelperError(e)) throw validationError('DT_OUT_OF_RANGE', 'Date/time field out of range.', { property: 'date', expected: `year within +/-${String(MAX_YEAR)}` });
    throw e;
  }
}

const MAX_YEAR = 275759;

function assertInt(value: number, min: number, max: number, property: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw validationError('DT_OUT_OF_RANGE', 'Date/time field out of range.', { property, expected: `integer ${min}..${max}` });
  }
}

export function plainDate(year: number, month: number, day: number): PlainDate {
  assertInt(year, -MAX_YEAR, MAX_YEAR, 'year');
  assertInt(month, 1, 12, 'month');
  assertInt(day, 1, daysInMonth(year, month), 'day');
  return Object.freeze({ kind: 'PlainDate', year, month, day });
}

export function plainTime(hour: number, minute = 0, second = 0, millisecond = 0): PlainTime {
  assertInt(hour, 0, 23, 'hour');
  assertInt(minute, 0, 59, 'minute');
  assertInt(second, 0, 59, 'second');
  assertInt(millisecond, 0, 999, 'millisecond');
  return Object.freeze({ kind: 'PlainTime', hour, minute, second, millisecond });
}

export function plainDateTime(date: PlainDate, time: PlainTime = plainTime(0)): PlainDateTime {
  return Object.freeze({ kind: 'PlainDateTime', date, time });
}

export function instant(epochMilliseconds: number): Instant {
  if (!Number.isFinite(epochMilliseconds) || Math.abs(epochMilliseconds) > 8.64e15) {
    throw validationError('DT_OUT_OF_RANGE', 'Instant out of range.', { property: 'epochMilliseconds', expected: 'finite number within +/-8.64e15' });
  }
  return Object.freeze({ kind: 'Instant', epochMilliseconds });
}

export function duration(milliseconds: number): Duration {
  if (!Number.isFinite(milliseconds)) {
    throw validationError('DT_OUT_OF_RANGE', 'Duration out of range.', { property: 'milliseconds', expected: 'finite number' });
  }
  return Object.freeze({ kind: 'Duration', milliseconds });
}

export function comparePlainDate(a: PlainDate, b: PlainDate): -1 | 0 | 1 {
  const x = a.year * 10000 + a.month * 100 + a.day;
  const y = b.year * 10000 + b.month * 100 + b.day;
  return x < y ? -1 : x > y ? 1 : 0;
}

export function plainDatesEqual(a: PlainDate | null, b: PlainDate | null): boolean {
  if (a === null || b === null) return a === b;
  return comparePlainDate(a, b) === 0;
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function dayOfWeek(date: PlainDate): number {
  return isoWeekday(date);
}

export function addDays(date: PlainDate, days: number): PlainDate {
  return inRange(() => addEpochDays(date, Math.trunc(days)));
}

/** Adds calendar months, clamping the day to the target month's length. */
export function addMonths(date: PlainDate, months: number): PlainDate {
  return inRange(() => addCalendarMonths(date, Math.trunc(months)));
}

const pad = (n: number, len = 2): string => String(Math.abs(n)).padStart(len, '0');

function yearToIso(year: number): string {
  if (year >= 0 && year <= 9999) return pad(year, 4);
  return `${year < 0 ? '-' : '+'}${pad(year, 6)}`;
}

export function plainDateToString(date: PlainDate): string {
  return `${yearToIso(date.year)}-${pad(date.month)}-${pad(date.day)}`;
}

export function plainTimeToString(time: PlainTime): string {
  const base = `${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`;
  return time.millisecond ? `${base}.${pad(time.millisecond, 3)}` : base;
}

const DATE_RE = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

/** Strict ISO 8601 calendar date (`YYYY-MM-DD`). Returns null when invalid. */
export function parsePlainDate(text: string): PlainDate | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const year = Number(m[1]);
  if (m[1] === '-000000') return null;
  try {
    return plainDate(year, Number(m[2]), Number(m[3]));
  } catch {
    return null;
  }
}

/** Strict ISO 8601 time (`HH:MM[:SS[.sss]]`). Returns null when invalid. */
export function parsePlainTime(text: string): PlainTime | null {
  const m = TIME_RE.exec(text);
  if (!m) return null;
  try {
    return plainTime(Number(m[1]), Number(m[2]), Number(m[3] ?? 0), Number((m[4] ?? '0').padEnd(3, '0')));
  } catch {
    return null;
  }
}

const INSTANT_RE = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

/** Strict ISO 8601 instant; requires `Z` or an explicit offset. Returns null when invalid. */
export function parseInstant(text: string): Instant | null {
  const m = INSTANT_RE.exec(text);
  if (!m) return null;
  const date = parsePlainDate(`${m[1] ?? ''}-${m[2] ?? ''}-${m[3] ?? ''}`);
  const time = parsePlainTime(`${m[4] ?? ''}:${m[5] ?? ''}:${m[6] ?? '00'}${m[7] ? `.${m[7]}` : ''}`);
  if (!date || !time) return null;
  const zone = m[8] ?? 'Z';
  let offsetMs = 0;
  if (zone !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const [h, min] = zone.slice(1).split(':').map(Number);
    if (h === undefined || min === undefined || h > 23 || min > 59) return null;
    offsetMs = sign * (h * 3600000 + min * 60000);
  }
  const d = new Date(0);
  d.setUTCFullYear(date.year, date.month - 1, date.day);
  d.setUTCHours(time.hour, time.minute, time.second, time.millisecond);
  return instant(d.getTime() - offsetMs);
}

export function instantToString(value: Instant): string {
  return new Date(value.epochMilliseconds).toISOString();
}

/** A calendar month without a day (ISO 8601 `YYYY-MM`). */
export interface PlainYearMonth {
  readonly kind: 'PlainYearMonth';
  readonly year: number;
  /** 1-12 */
  readonly month: number;
}

/** A calendar quarter (`YYYY-Qn`): Q1 is January to March, Q4 October to December. */
export interface PlainYearQuarter {
  readonly kind: 'PlainYearQuarter';
  readonly year: number;
  /** 1-4 */
  readonly quarter: number;
}

export function plainYearMonth(year: number, month: number): PlainYearMonth {
  assertInt(year, -MAX_YEAR, MAX_YEAR, 'year');
  assertInt(month, 1, 12, 'month');
  return Object.freeze({ kind: 'PlainYearMonth', year, month });
}

export function plainYearQuarter(year: number, quarter: number): PlainYearQuarter {
  assertInt(year, -MAX_YEAR, MAX_YEAR, 'year');
  assertInt(quarter, 1, 4, 'quarter');
  return Object.freeze({ kind: 'PlainYearQuarter', year, quarter });
}

export function comparePlainYearMonth(a: PlainYearMonth, b: PlainYearMonth): -1 | 0 | 1 {
  const x = a.year * 12 + a.month;
  const y = b.year * 12 + b.month;
  return x < y ? -1 : x > y ? 1 : 0;
}

export function comparePlainYearQuarter(a: PlainYearQuarter, b: PlainYearQuarter): -1 | 0 | 1 {
  const x = a.year * 4 + a.quarter;
  const y = b.year * 4 + b.quarter;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** ISO 8601 `YYYY-MM`. */
export function plainYearMonthToString(value: PlainYearMonth): string {
  return `${yearToIso(value.year)}-${pad(value.month)}`;
}

/** `YYYY-Qn` (the ISO 8601-2 quarter notation used by most reporting tools). */
export function plainYearQuarterToString(value: PlainYearQuarter): string {
  return `${yearToIso(value.year)}-Q${String(value.quarter)}`;
}

const YEAR_MONTH_RE = /^([+-]\d{6}|\d{4})-(\d{2})$/;
const YEAR_QUARTER_RE = /^([+-]\d{6}|\d{4})-Q([1-4])$/;

/** Strict ISO 8601 year and month (`YYYY-MM`). Returns null when invalid. */
export function parsePlainYearMonth(text: string): PlainYearMonth | null {
  const m = YEAR_MONTH_RE.exec(text);
  if (!m || m[1] === '-000000') return null;
  try {
    return plainYearMonth(Number(m[1]), Number(m[2]));
  } catch {
    return null;
  }
}

/** Strict `YYYY-Qn`. Returns null when invalid. */
export function parsePlainYearQuarter(text: string): PlainYearQuarter | null {
  const m = YEAR_QUARTER_RE.exec(text);
  if (!m || m[1] === '-000000') return null;
  try {
    return plainYearQuarter(Number(m[1]), Number(m[2]));
  } catch {
    return null;
  }
}

const HOUR_MS = 3_600_000;
const DURATION_RE = /^(-)?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:[.,](\d{1,3}))?S)?)?$/;

/**
 * ISO 8601 duration of a fixed-length `Duration`, in hours, minutes, and seconds
 * (`PT1H30M`, `PT36H`, `PT0.25S`, `PT0S`). Days are never emitted, because an ISO
 * day is a calendar day that is not always 24 hours long. Negative durations use
 * the ISO 8601-2 leading minus (`-PT5M`).
 */
export function durationToString(value: Duration): string {
  const total = Math.round(value.milliseconds);
  let rest = Math.abs(total);
  const hours = Math.floor(rest / HOUR_MS);
  rest -= hours * HOUR_MS;
  const minutes = Math.floor(rest / 60_000);
  rest -= minutes * 60_000;
  const seconds = Math.floor(rest / 1000);
  const ms = rest - seconds * 1000;
  let out = '';
  if (hours) out += `${String(hours)}H`;
  if (minutes) out += `${String(minutes)}M`;
  if (seconds || ms || out === '') out += `${String(seconds)}${ms ? `.${pad(ms, 3).replace(/0+$/, '')}` : ''}S`;
  return `${total < 0 ? '-' : ''}PT${out}`;
}

/**
 * Strict ISO 8601 duration with day, hour, minute, and second designators
 * (`P1DT2H`, `PT90M`, `PT1.5S`), as a fixed-length `Duration`. A day counts as
 * exactly 24 hours. Years, months, and weeks are calendar units and are rejected,
 * as are empty designators (`P`, `PT`). Returns null when invalid.
 */
export function parseDuration(text: string): Duration | null {
  const m = DURATION_RE.exec(text);
  if (!m || text.endsWith('T') || !/\d/.test(text)) return null;
  const n = (i: number): number => Number(m[i] ?? 0);
  const ms = Number((m[6] ?? '0').padEnd(3, '0'));
  const total = n(2) * 24 * HOUR_MS + n(3) * HOUR_MS + n(4) * 60_000 + n(5) * 1000 + ms;
  if (!Number.isSafeInteger(total)) return null;
  return duration(m[1] && total !== 0 ? -total : total);
}
