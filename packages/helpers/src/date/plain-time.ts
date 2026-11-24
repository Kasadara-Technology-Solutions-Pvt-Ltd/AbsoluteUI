/**
 * Wall-clock time and date-time value types plus strict ISO 8601 parse/format.
 * `PlainTime` and `PlainDateTime` are structurally identical to `@absoluteui/core`'s.
 */
import { ValidationError } from '../error/index.js';
import { formatPlainDate, isPlainDate, parsePlainDate, toEpochDay, toPlainDate, type DateInput, type PlainDate } from './plain-date.js';

export interface PlainTime {
  readonly kind: 'PlainTime';
  /** 0-23 */
  readonly hour: number;
  /** 0-59 */
  readonly minute: number;
  /** 0-59 (no leap seconds) */
  readonly second: number;
  /** 0-999 */
  readonly millisecond: number;
}

export interface PlainDateTime {
  readonly kind: 'PlainDateTime';
  readonly date: PlainDate;
  readonly time: PlainTime;
}

const DAY_MS = 86_400_000;

function assertField(value: number, max: number, property: string): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new ValidationError('HLP_DATE_OUT_OF_RANGE', 'Time field out of range.', { details: { property, min: 0, max } });
  }
}

/**
 * Creates a validated, frozen wall-clock time.
 * @example plainTime(9, 30) // => '09:30:00'
 */
export function plainTime(hour: number, minute = 0, second = 0, millisecond = 0): PlainTime {
  assertField(hour, 23, 'hour');
  assertField(minute, 59, 'minute');
  assertField(second, 59, 'second');
  assertField(millisecond, 999, 'millisecond');
  return Object.freeze({ kind: 'PlainTime', hour, minute, second, millisecond });
}

/**
 * Creates a frozen date-time from a date and a time (default midnight).
 * @example plainDateTime('2026-03-08', plainTime(2, 30))
 */
export function plainDateTime(date: DateInput, time: PlainTime = plainTime(0)): PlainDateTime {
  if (!isPlainTime(time)) throw new ValidationError('HLP_INVALID_TIME', 'Expected a PlainTime.');
  return Object.freeze({ kind: 'PlainDateTime', date: toPlainDate(date), time });
}

/**
 * Type guard for `PlainTime`-shaped values (including core's).
 * @example isPlainTime(plainTime(12)) // => true
 */
export function isPlainTime(value: unknown): value is PlainTime {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<PlainTime>;
  const ok = (n: unknown, max: number): boolean => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
  return v.kind === 'PlainTime' && ok(v.hour, 23) && ok(v.minute, 59) && ok(v.second, 59) && ok(v.millisecond, 999);
}

/**
 * Type guard for `PlainDateTime`-shaped values (including core's).
 * @example isPlainDateTime(plainDateTime('2026-01-01')) // => true
 */
export function isPlainDateTime(value: unknown): value is PlainDateTime {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<PlainDateTime>;
  return v.kind === 'PlainDateTime' && isPlainDate(v.date) && isPlainTime(v.time);
}

/**
 * Milliseconds since midnight.
 * @example timeToMilliseconds(plainTime(1)) // => 3600000
 */
export function timeToMilliseconds(time: PlainTime): number {
  return ((time.hour * 60 + time.minute) * 60 + time.second) * 1000 + time.millisecond;
}

/**
 * Time for milliseconds since midnight (wraps modulo one day, negative values wrap backwards).
 * @example timeFromMilliseconds(5_400_000) // => '01:30:00'
 */
export function timeFromMilliseconds(ms: number): PlainTime {
  if (!Number.isInteger(ms)) throw new ValidationError('HLP_DATE_OUT_OF_RANGE', 'Milliseconds must be an integer.');
  let rest = ((ms % DAY_MS) + DAY_MS) % DAY_MS;
  const hour = Math.floor(rest / 3_600_000);
  rest -= hour * 3_600_000;
  const minute = Math.floor(rest / 60_000);
  rest -= minute * 60_000;
  const second = Math.floor(rest / 1000);
  return plainTime(hour, minute, second, rest - second * 1000);
}

/**
 * Orders two times: `-1`, `0`, or `1`.
 * @example comparePlainTimes(plainTime(9), plainTime(10)) // => -1
 */
export function comparePlainTimes(a: PlainTime, b: PlainTime): -1 | 0 | 1 {
  const x = timeToMilliseconds(a);
  const y = timeToMilliseconds(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Wall-clock milliseconds as if the date-time were UTC ("local epoch"). Internal building block
 * for zone conversion; exported for business-calendar arithmetic.
 * @example plainDateTimeToEpochMilliseconds(plainDateTime('1970-01-02')) // => 86400000
 */
export function plainDateTimeToEpochMilliseconds(value: PlainDateTime): number {
  return toEpochDay(value.date) * DAY_MS + timeToMilliseconds(value.time);
}

/**
 * Orders two date-times: `-1`, `0`, or `1`.
 * @example
 * const a = plainDateTime('2026-10-05', plainTime(9, 0));
 * const b = plainDateTime('2026-10-05', plainTime(17, 30));
 * comparePlainDateTimes(a, b); // => -1
 * comparePlainDateTimes(b, a); // => 1
 * [b, a].sort(comparePlainDateTimes); // => [a, b]
 */
export function comparePlainDateTimes(a: PlainDateTime, b: PlainDateTime): -1 | 0 | 1 {
  const x = plainDateTimeToEpochMilliseconds(a);
  const y = plainDateTimeToEpochMilliseconds(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

/**
 * ISO 8601 `HH:mm:ss` plus `.SSS` when milliseconds are non-zero.
 * @example formatPlainTime(plainTime(9, 5)) // => '09:05:00'
 */
export function formatPlainTime(time: PlainTime): string {
  const base = `${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`;
  return time.millisecond ? `${base}.${pad(time.millisecond, 3)}` : base;
}

/**
 * ISO 8601 `YYYY-MM-DDTHH:mm:ss[.SSS]`.
 * @example formatPlainDateTime(plainDateTime('2026-03-08', plainTime(2, 30))) // => '2026-03-08T02:30:00'
 */
export function formatPlainDateTime(value: PlainDateTime): string {
  return `${formatPlainDate(value.date)}T${formatPlainTime(value.time)}`;
}

// Bounded quantifiers only (ReDoS-safe); inputs are length-checked before matching.
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const DATE_TIME_RE = /^((?:[+-]\d{2})?\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:\d{2})?$/;
const OFFSET_RE = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Parses `HH:mm[:ss[.SSS]]` strictly (1-3 fraction digits). Returns `undefined` otherwise,
 * including `24:00` and leap seconds.
 * @example parsePlainTime('09:30') // => '09:30:00'
 */
export function parsePlainTime(text: string): PlainTime | undefined {
  if (typeof text !== 'string' || text.length > 12) return undefined;
  const m = TIME_RE.exec(text);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3] ?? 0);
  const ms = Number((m[4] ?? '0').padEnd(3, '0'));
  if (h > 23 || min > 59 || s > 59) return undefined;
  return plainTime(h, min, s, ms);
}

/**
 * Offset in milliseconds for `Z` or `+/-HH:MM[:SS]` (hours <= 23). Returns `undefined` otherwise.
 * @internal Shared by the date and timezone modules.
 */
export function parseOffsetText(text: string): number | undefined {
  if (typeof text !== 'string' || text.length > 9) return undefined;
  if (text === 'Z') return 0;
  const m = OFFSET_RE.exec(text);
  if (!m) return undefined;
  const h = Number(m[2]);
  const min = Number(m[3]);
  const s = Number(m[4] ?? 0);
  if (h > 23 || min > 59 || s > 59) return undefined;
  const ms = ((h * 60 + min) * 60 + s) * 1000;
  return m[1] === '-' ? 0 - ms : ms;
}

/** Parsed ISO 8601 date-time: wall-clock fields plus the offset when one was written. */
export interface IsoDateTimeParts {
  readonly dateTime: PlainDateTime;
  /** Offset in milliseconds (`Z` -> 0); `undefined` when the text had no offset. */
  readonly offset: number | undefined;
}

/**
 * Parses `YYYY-MM-DDTHH:mm[:ss[.SSS]]` with an optional `Z` or `+/-HH:MM` suffix. Strict:
 * uppercase `T`, no spaces, no impossible dates or times. Returns `undefined` otherwise.
 * @example
 * parseIsoDateTime('2026-03-08T02:30:00-05:00'); // => { dateTime: '2026-03-08T02:30:00', offset: -18000000 }
 * parseIsoDateTime('2026-03-08T02:30')?.offset; // => undefined // no offset in the text
 * parseIsoDateTime('2026-02-30T10:00Z'); // => undefined // impossible date
 */
export function parseIsoDateTime(text: string): IsoDateTimeParts | undefined {
  if (typeof text !== 'string' || text.length > 40) return undefined;
  const m = DATE_TIME_RE.exec(text);
  if (!m) return undefined;
  const date = parsePlainDate(m[1] ?? '');
  const time = parsePlainTime(m[2] ?? '');
  if (!date || !time) return undefined;
  const offset = m[3] === undefined ? undefined : parseOffsetText(m[3]);
  if (m[3] !== undefined && offset === undefined) return undefined;
  return Object.freeze({ dateTime: plainDateTime(date, time), offset });
}

/**
 * Parses a date-time without an offset (`YYYY-MM-DDTHH:mm[:ss[.SSS]]`). Text with `Z` or an
 * offset is rejected because it denotes an instant, not a wall-clock time.
 * @example parsePlainDateTime('2026-03-08T02:30') // => '2026-03-08T02:30:00'
 */
export function parsePlainDateTime(text: string): PlainDateTime | undefined {
  const parts = parseIsoDateTime(text);
  return parts && parts.offset === undefined ? parts.dateTime : undefined;
}

const MAX_INSTANT = 8.64e15;

/**
 * Parses an ISO 8601 instant (date-time with a mandatory `Z` or `+/-HH:MM`) to epoch milliseconds.
 * Returns `undefined` for text without an offset or outside the `Date` range.
 * @example parseInstant('2026-03-08T07:00:00Z') // => 1772953200000
 */
export function parseInstant(text: string): number | undefined {
  const parts = parseIsoDateTime(text);
  if (parts?.offset === undefined) return undefined;
  const ms = plainDateTimeToEpochMilliseconds(parts.dateTime) - parts.offset;
  return Math.abs(ms) > MAX_INSTANT ? undefined : ms;
}

/**
 * ISO 8601 UTC string for an instant (`Date#toISOString`).
 * @example formatInstant(0) // => '1970-01-01T00:00:00.000Z'
 */
export function formatInstant(instant: number | Date): string {
  const ms = typeof instant === 'number' ? instant : instant.getTime();
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_INSTANT) throw new ValidationError('HLP_INVALID_INSTANT', 'Expected a finite instant.');
  return new Date(ms).toISOString();
}
