/**
 * Internal time-zone engine shared by the `date` and `timezone` modules (the timezone module
 * re-exports the public parts). Offsets come from `Intl.DateTimeFormat`; no IANA database is
 * bundled, so rule accuracy follows the runtime's ICU data. Behaviour matches the
 * `@absoluteui/core` engine, including the `compatible | earlier | later | reject` vocabulary.
 */
import { LimitError, ValidationError } from '../error/index.js';
import { addDays, fromEpochDay, toEpochDay, toPlainDate, type DateInput } from './plain-date.js';
import { plainDateTime, plainDateTimeToEpochMilliseconds, timeFromMilliseconds, type PlainDateTime } from './plain-time.js';

const DAY_MS = 86_400_000;
const MAX_INSTANT = 8.64e15;

/**
 * An exact instant: epoch milliseconds or a valid `Date`.
 * @example const i: InstantInput = Date.now();
 */
export type InstantInput = number | Date;

/** How a wall-clock time that is skipped (gap) or repeated (overlap) maps to an instant. */
export type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject';

/** Normalizes an instant to epoch milliseconds; throws `HLP_INVALID_INSTANT`. */
export function toEpochMs(instant: InstantInput): number {
  const ms = typeof instant === 'number' ? instant : instant instanceof Date ? instant.getTime() : Number.NaN;
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_INSTANT) throw new ValidationError('HLP_INVALID_INSTANT', 'Expected a finite instant (epoch milliseconds or a valid Date).');
  return ms;
}

const clampInstant = (ms: number): number => Math.max(-MAX_INSTANT, Math.min(MAX_INSTANT, ms));

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function invalidZone(cause?: unknown): ValidationError {
  return new ValidationError('HLP_TZ_INVALID_ZONE', 'Unsupported time zone identifier.', cause === undefined ? {} : { cause });
}

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = zoneFormatters.get(timeZone);
  if (cached) return cached;
  // Longest IANA identifier is 32 characters; the bound keeps garbage out of Intl and the cache.
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 64) throw invalidZone();
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', era: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  } catch (cause) {
    throw invalidZone(cause);
  }
  if (zoneFormatters.size >= 512) zoneFormatters.clear();
  zoneFormatters.set(timeZone, f);
  return f;
}

/**
 * The runtime's IANA time zone (for example `'Europe/London'`).
 * @example getLocalTimeZone() // e.g. 'Asia/Kolkata' (depends on the device)
 */
export function getLocalTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Validates `timeZone` (default: the runtime's zone) and returns it. */
export function resolveTimeZone(timeZone?: string): string {
  const zone = timeZone ?? getLocalTimeZone();
  zoneFormatter(zone);
  return zone;
}

/**
 * True when `timeZone` is an identifier the runtime's `Intl` accepts (IANA names, `UTC`,
 * and on newer engines fixed offsets such as `'+05:30'`).
 * @example isValidTimeZone('Asia/Kolkata') // => true
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    zoneFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Offset (local - UTC) in ms at `ms` for a validated zone. Intl resolves to whole seconds. */
export function offsetAtMs(ms: number, timeZone: string): number {
  const seconds = Math.floor(ms / 1000) * 1000;
  let year = 0;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let bc = false;
  for (const p of zoneFormatter(timeZone).formatToParts(seconds)) {
    switch (p.type) {
      case 'year': year = Number(p.value); break;
      case 'month': month = Number(p.value); break;
      case 'day': day = Number(p.value); break;
      case 'hour': hour = Number(p.value) % 24; break;
      case 'minute': minute = Number(p.value); break;
      case 'second': second = Number(p.value); break;
      case 'era': bc = p.value === 'BC' || p.value === 'B'; break;
      default: break;
    }
  }
  if (bc) year = 1 - year;
  const local = toEpochDay({ kind: 'PlainDate', year, month, day }) * DAY_MS + ((hour * 60 + minute) * 60 + second) * 1000;
  return local - seconds;
}

/**
 * UTC offset in milliseconds of `timeZone` (default: runtime zone) at an instant.
 * @example offsetAt(Date.UTC(2026, 0, 1), 'Asia/Kolkata') // => 19800000
 */
export function offsetAt(instant: InstantInput, timeZone?: string): number {
  return offsetAtMs(toEpochMs(instant), resolveTimeZone(timeZone));
}

function fromLocalEpoch(local: number): PlainDateTime {
  const day = Math.floor(local / DAY_MS);
  return plainDateTime(fromEpochDay(day), timeFromMilliseconds(local - day * DAY_MS));
}

/**
 * Wall-clock date-time of an instant in `timeZone` (default: runtime zone).
 * @example instantToZoned(Date.UTC(2026, 0, 1), 'Asia/Kolkata') // => '2026-01-01T05:30:00'
 */
export function instantToZoned(instant: InstantInput, timeZone?: string): PlainDateTime {
  const ms = toEpochMs(instant);
  return fromLocalEpoch(ms + offsetAtMs(ms, resolveTimeZone(timeZone)));
}

/**
 * Wall-clock date-time of an instant in `timeZone` (alias of the timezone module's
 * `instantToZoned`, named for the date module's instant conventions).
 * @example
 * toPlainDateTime(Date.UTC(2026, 6, 1, 12), 'Europe/London'); // => '2026-07-01T13:00:00' // BST
 * toPlainDateTime(Date.UTC(2026, 11, 1, 12), 'Europe/London'); // => '2026-12-01T12:00:00' // GMT
 */
export function toPlainDateTime(instant: InstantInput, timeZone?: string): PlainDateTime {
  return instantToZoned(instant, timeZone);
}

function possible(local: number, zone: string): number[] {
  const before = offsetAtMs(clampInstant(local - DAY_MS), zone);
  const after = offsetAtMs(clampInstant(local + DAY_MS), zone);
  const found: number[] = [];
  for (const offset of before === after ? [before] : [before, after]) {
    const candidate = local - offset;
    if (Math.abs(candidate) <= MAX_INSTANT && offsetAtMs(candidate, zone) === offset && !found.includes(candidate)) found.push(candidate);
  }
  return found.sort((a, b) => a - b);
}

/**
 * Every instant at which a wall-clock time occurs: one (normal), two (overlap, clocks fell back),
 * or none (gap, clocks sprang forward). Sorted ascending, epoch milliseconds.
 * @example
 * import { plainDateTime, plainTime } from '@absoluteui/helpers/date';
 * getPossibleInstants(plainDateTime('2026-11-01', plainTime(1, 30)), 'America/New_York'); // => [Date.UTC(2026, 10, 1, 5, 30), Date.UTC(2026, 10, 1, 6, 30)] // EDT, then EST
 * getPossibleInstants(plainDateTime('2026-03-08', plainTime(2, 30)), 'America/New_York'); // => [] // skipped
 */
export function getPossibleInstants(dateTime: PlainDateTime, timeZone?: string): number[] {
  return possible(plainDateTimeToEpochMilliseconds(dateTime), resolveTimeZone(timeZone));
}

/**
 * `'exact'`, `'ambiguous'` (overlap), or `'nonexistent'` (gap) for a wall-clock time in a zone.
 * @example
 * import { plainDateTime, plainTime } from '@absoluteui/helpers/date';
 * getWallTimeStatus(plainDateTime('2026-03-08', plainTime(2, 30)), 'America/New_York'); // => 'nonexistent'
 * getWallTimeStatus(plainDateTime('2026-11-01', plainTime(1, 30)), 'America/New_York'); // => 'ambiguous'
 * getWallTimeStatus(plainDateTime('2026-11-01', plainTime(9, 0)), 'America/New_York'); // => 'exact'
 */
export function getWallTimeStatus(dateTime: PlainDateTime, timeZone?: string): 'exact' | 'ambiguous' | 'nonexistent' {
  const n = getPossibleInstants(dateTime, timeZone).length;
  return n === 1 ? 'exact' : n > 1 ? 'ambiguous' : 'nonexistent';
}

export interface ZonedToInstantOptions {
  /**
   * Default `'compatible'` (Temporal and RFC 5545): overlap -> earlier instant; gap -> shifted
   * forward by the gap length. `'earlier'`: gap shifts backward. `'later'`: overlap -> later
   * instant, gap shifts forward. `'reject'`: throws `HLP_TZ_AMBIGUOUS_TIME` / `HLP_TZ_NONEXISTENT_TIME`.
   */
  readonly disambiguation?: Disambiguation;
}

function toInstantLocal(local: number, zone: string, disambiguation: Disambiguation): number {
  const found = possible(local, zone);
  const [first, second] = found;
  if (first !== undefined && second === undefined) return first;
  if (first !== undefined && second !== undefined) {
    if (disambiguation === 'reject') throw new ValidationError('HLP_TZ_AMBIGUOUS_TIME', 'The wall-clock time is ambiguous in the time zone.');
    return disambiguation === 'later' ? second : first;
  }
  if (disambiguation === 'reject') throw new ValidationError('HLP_TZ_NONEXISTENT_TIME', 'The wall-clock time does not exist in the time zone.');
  const before = offsetAtMs(clampInstant(local - DAY_MS), zone);
  const after = offsetAtMs(clampInstant(local + DAY_MS), zone);
  return toEpochMs(disambiguation === 'earlier' ? local - after : local - before);
}

/**
 * Converts a wall-clock date-time in `timeZone` (default: runtime zone) to epoch milliseconds.
 *
 * | Case | compatible | earlier | later | reject |
 * |---|---|---|---|---|
 * | overlap | earlier instant | earlier instant | later instant | throws |
 * | gap | forward by gap | backward by gap | forward by gap | throws |
 * @example
 * import { plainDateTime, plainTime } from '@absoluteui/helpers/date';
 * const gap = plainDateTime('2026-03-08', plainTime(2, 30)); // skipped in New York
 * zonedToInstant(gap, 'America/New_York'); // => Date.UTC(2026, 2, 8, 7, 30) // 03:30 EDT
 * zonedToInstant(gap, 'America/New_York', { disambiguation: 'earlier' }); // => Date.UTC(2026, 2, 8, 6, 30) // 01:30 EST
 * zonedToInstant(gap, 'America/New_York', { disambiguation: 'reject' }); // => throws HLP_TZ_NONEXISTENT_TIME
 */
export function zonedToInstant(dateTime: PlainDateTime, timeZone?: string, options: ZonedToInstantOptions = {}): number {
  return toInstantLocal(plainDateTimeToEpochMilliseconds(dateTime), resolveTimeZone(timeZone), options.disambiguation ?? 'compatible');
}

/** First second in (loS, hiS] whose offset differs from `loOffset`, in epoch ms. */
function findChange(loS: number, hiS: number, loOffset: number, zone: string): number {
  let lo = loS;
  let hi = hiS;
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (offsetAtMs(mid * 1000, zone) === loOffset) lo = mid;
    else hi = mid;
  }
  return hi * 1000;
}

/**
 * First instant (epoch ms) of a calendar day in a zone. DST-safe: when midnight is skipped
 * (for example America/Santiago or Asia/Beirut at their spring transitions) it returns the
 * first instant that exists on that date, as Temporal's `startOfDay` does.
 * @example
 * startOfDayInstant('2026-10-05', 'Asia/Kolkata'); // => Date.UTC(2026, 9, 4, 18, 30) // 00:00 IST
 * startOfDayInstant('2026-03-29', 'Asia/Beirut'); // => Date.UTC(2026, 2, 28, 22) // midnight is skipped: 01:00 local (+03:00)
 */
export function startOfDayInstant(date: DateInput, timeZone?: string): number {
  const zone = resolveTimeZone(timeZone);
  const local = toEpochDay(toPlainDate(date)) * DAY_MS;
  const found = possible(local, zone);
  if (found[0] !== undefined) return found[0];
  // Midnight falls in a gap: the day starts at the transition, which lies between the two
  // candidate instants computed with the offsets before and after it.
  const before = offsetAtMs(clampInstant(local - DAY_MS), zone);
  const after = offsetAtMs(clampInstant(local + DAY_MS), zone);
  const lo = Math.floor((local - after) / 1000);
  const hi = Math.ceil((local - before) / 1000);
  return findChange(lo, hi, offsetAtMs(lo * 1000, zone), zone);
}

/**
 * Last millisecond of a calendar day in a zone (one before the next day's `startOfDayInstant`).
 * @example
 * endOfDayInstant('2026-11-01', 'America/New_York'); // => Date.UTC(2026, 10, 2, 5) - 1 // 23:59:59.999 EST
 * endOfDayInstant('2026-11-01', 'America/New_York') - startOfDayInstant('2026-11-01', 'America/New_York'); // => 25 * 3_600_000 - 1 // a 25-hour day
 */
export function endOfDayInstant(date: DateInput, timeZone?: string): number {
  return startOfDayInstant(addDays(date, 1), timeZone) - 1;
}

export interface TransitionSearchOptions {
  /** Days to scan, 1-36600. Default 400. */
  readonly searchDays?: number;
}

function searchDays(options: TransitionSearchOptions): number {
  const days = options.searchDays ?? 400;
  if (!Number.isInteger(days) || days < 1) throw new ValidationError('HLP_TZ_INVALID_SEARCH', 'searchDays must be a positive integer.');
  if (days > 36_600) throw new LimitError('HLP_TZ_SEARCH_LIMIT', 'searchDays exceeds the limit of 36600.');
  return days;
}

/**
 * Next UTC-offset change strictly after `instant` (epoch ms of the first instant with the new
 * offset), or `undefined` within `searchDays`. Scans day by day, then binary-searches to the
 * second, so two changes less than a day apart can be missed.
 * @example
 * nextTransition(Date.UTC(2026, 0, 1), 'America/New_York'); // => 1772953200000 // 2026-03-08T07:00:00Z, clocks spring forward
 * nextTransition(Date.UTC(2026, 0, 1), 'Asia/Kolkata'); // => undefined // no DST
 */
export function nextTransition(instant: InstantInput, timeZone?: string, options: TransitionSearchOptions = {}): number | undefined {
  const start = toEpochMs(instant);
  const zone = resolveTimeZone(timeZone);
  const days = searchDays(options);
  let prev = start;
  const startOffset = offsetAtMs(start, zone);
  for (let i = 1; i <= days; i++) {
    const t = clampInstant(start + i * DAY_MS);
    if (offsetAtMs(t, zone) !== startOffset) return findChange(Math.floor(prev / 1000), Math.floor(t / 1000), startOffset, zone);
    if (t === MAX_INSTANT) break;
    prev = t;
  }
  return undefined;
}

/**
 * Latest UTC-offset change strictly before `instant`, or `undefined` within `searchDays`.
 * @example
 * const t = previousTransition(Date.UTC(2026, 5, 1), 'America/New_York'); // => 1772953200000
 * t === undefined ? undefined : new Date(t).toISOString(); // => '2026-03-08T07:00:00.000Z'
 */
export function previousTransition(instant: InstantInput, timeZone?: string, options: TransitionSearchOptions = {}): number | undefined {
  const ref = toEpochMs(instant) - 1;
  const zone = resolveTimeZone(timeZone);
  const days = searchDays(options);
  const refOffset = offsetAtMs(ref, zone);
  let prev = ref;
  for (let i = 1; i <= days; i++) {
    const t = clampInstant(ref - i * DAY_MS);
    const off = offsetAtMs(t, zone);
    if (off !== refOffset) return findChange(Math.floor(t / 1000), Math.floor(prev / 1000), off, zone);
    if (t === -MAX_INSTANT) break;
    prev = t;
  }
  return undefined;
}
