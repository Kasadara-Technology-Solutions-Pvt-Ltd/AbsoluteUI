/**
 * Internal helpers for the business-calendar module: time-of-day parsing, epoch-day weekday
 * math, binary search, and error construction. Not part of the public API.
 */
import { LimitError, ValidationError } from '../error/index.js';
import { toEpochDay, type IsoWeekday } from '../date/index.js';

export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;

/**
 * A working-time interval as `['HH:mm', 'HH:mm']`; start inclusive, end exclusive, `'24:00'`
 * allowed as an end.
 * @example const morning: TimeRange = ['09:00', '13:00'];
 */
export type TimeRange = readonly [start: string, end: string];

/** Internal form of a `TimeRange`: minutes since midnight, end up to 1440. */
export type MinuteRange = readonly [start: number, end: number];

/** A `ValidationError` whose details carry only a fixed property path, never user values. */
export function invalid(code: string, message: string, property?: string): ValidationError {
  return new ValidationError(code, message, property === undefined ? {} : { details: { property } });
}

/** A `LimitError` with a fixed limit in its details. */
export function limit(code: string, message: string, max: number): LimitError {
  return new LimitError(code, message, { details: { limit: max } });
}

export const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);
export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** ISO weekday of an epoch day (1970-01-01 was a Thursday). */
export const weekdayOfEpoch = (e: number): IsoWeekday => ((((e + 3) % 7) + 7) % 7 + 1) as IsoWeekday;

/** Epoch day of a (valid) calendar date without allocating a frozen `PlainDate`. */
export const epochOf = (year: number, month: number, day: number): number => toEpochDay({ kind: 'PlainDate', year, month, day });

const HHMM = /^(\d{2}):(\d{2})$/;

/** Minutes since midnight for `HH:mm`; `'24:00'` -> 1440 only when `allow24`. */
export function parseTime(text: unknown, allow24: boolean): number | undefined {
  if (typeof text !== 'string' || text.length !== 5) return undefined;
  const m = HHMM.exec(text);
  if (!m) return undefined;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h === 24 && mi === 0) return allow24 ? 1440 : undefined;
  if (h > 23 || mi > 59) return undefined;
  return h * 60 + mi;
}

/** `HH:mm` for minutes since midnight (1440 -> `'24:00'`). */
export function formatMinutes(minutes: number): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(Math.floor(minutes / 60))}:${p(minutes % 60)}`;
}

const MAX_RANGES = 48;

/** Validates `TimeRange[]`: `HH:mm`, end after start, sorted, non-overlapping (touching is fine). */
export function normalizeRanges(value: unknown, property: string): readonly MinuteRange[] {
  if (!isArray(value)) throw invalid('HLP_BIZCAL_INVALID_HOURS', 'Working hours must be an array of [start, end] pairs.', property);
  if (value.length > MAX_RANGES) throw limit('HLP_BIZCAL_TOO_MANY_RANGES', 'Too many working-hour intervals in one day.', MAX_RANGES);
  const out: MinuteRange[] = [];
  let previousEnd = -1;
  value.forEach((pair, i) => {
    const path = `${property}[${String(i)}]`;
    if (!isArray(pair) || pair.length !== 2) throw invalid('HLP_BIZCAL_INVALID_HOURS', 'Each working-hours entry must be a [start, end] pair.', path);
    const start = parseTime(pair[0], false);
    const end = parseTime(pair[1], true);
    if (start === undefined || end === undefined) throw invalid('HLP_BIZCAL_INVALID_HOURS', 'Working hours must use HH:mm (24:00 is allowed as an end).', path);
    if (end <= start) throw invalid('HLP_BIZCAL_INVALID_HOURS', 'A working-hours end must be after its start.', path);
    if (start < previousEnd) throw invalid('HLP_BIZCAL_INVALID_HOURS', 'Working hours must be sorted and must not overlap.', path);
    previousEnd = end;
    out.push(Object.freeze([start, end] as const));
  });
  return Object.freeze(out);
}

/** Public `TimeRange[]` for internal minute ranges. */
export function rangesToText(ranges: readonly MinuteRange[]): readonly TimeRange[] {
  return Object.freeze(ranges.map(([s, e]) => Object.freeze([formatMinutes(s), formatMinutes(e)] as const)));
}

/** First half (by working minutes) of a day's intervals: the default half-day hours. */
export function firstHalf(ranges: readonly MinuteRange[]): readonly MinuteRange[] {
  const total = ranges.reduce((sum, [s, e]) => sum + e - s, 0);
  let left = Math.round(total / 2);
  const out: MinuteRange[] = [];
  for (const [s, e] of ranges) {
    if (left <= 0) break;
    const take = Math.min(e - s, left);
    out.push(Object.freeze([s, s + take] as const));
    left -= take;
  }
  return Object.freeze(out);
}

/** Index of the first element >= `x` in an ascending array. */
export function lowerBound(sorted: readonly number[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] ?? 0) < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the first element > `x` in an ascending array. */
export function upperBound(sorted: readonly number[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] ?? 0) <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Validates an optional short text field (name, id, reason). */
export function optionalText(value: unknown, property: string, max = 256): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max) throw invalid('HLP_BIZCAL_INVALID_TEXT', 'Expected a string of at most 256 characters.', property);
  return value;
}

/** Validates a required non-blank name. */
export function requiredName(value: unknown, property: string): string {
  const text = optionalText(value, property);
  if (text === undefined || text.trim() === '') throw invalid('HLP_BIZCAL_INVALID_NAME', 'A non-empty name is required.', property);
  return text;
}
