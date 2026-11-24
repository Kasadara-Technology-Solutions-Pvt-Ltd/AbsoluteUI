/**
 * Instant-level business time: working intervals, working time, business-hour differences and
 * arithmetic, SLA deadlines. Wall-clock hours are converted to instants in the calendar's time
 * zone with `'compatible'` disambiguation (Temporal/RFC 5545): on a DST day an interval lasts
 * its real elapsed time: 09:00-17:00 is unaffected by a 02:00 transition, while 00:00-04:00
 * lasts 3 h on the spring-forward day and 5 h on the fall-back day. Instants are epoch
 * milliseconds.
 */
import { endOfDayInstant, fromEpochDay, plainDateFromInstant, plainDateTime, timeFromMilliseconds, toEpochDay, toPlainDate, type DateInput, type InstantInput } from '../date/index.js';
import { toEpochMs } from '../date/zone.js';
import { offsetAt, zonedToInstant } from '../timezone/index.js';
import { defaultBusinessCalendar, engineOf, noWorkingDays, rangesAt, statusAt, stepForward, type BusinessCalendar, type Engine } from './engine.js';
import { DAY_MS, MINUTE_MS, invalid, limit } from './internal.js';

/**
 * A half-open instant interval `[start, end)` in epoch milliseconds.
 * @example const i: InstantInterval = { start: Date.UTC(2026, 0, 5, 9), end: Date.UTC(2026, 0, 5, 17) };
 */
export interface InstantInterval {
  readonly start: number;
  readonly end: number;
}

const HOUR_MS = 3_600_000;
/** Longest scan in days for business-time arithmetic (100 years). */
const MAX_SCAN_DAYS = 366 * 100;
/** Consecutive days without working time before giving up (10 years). */
const MAX_IDLE_DAYS = 3660;

function wallToInstant(zone: string, e: number, minutes: number): number {
  const day = e + Math.floor(minutes / 1440);
  return zonedToInstant(plainDateTime(fromEpochDay(day), timeFromMilliseconds((minutes % 1440) * MINUTE_MS)), zone, { disambiguation: 'compatible' });
}

/** Working intervals of an epoch day as instants, ascending and non-overlapping. */
function intervalsAt(eng: Engine, e: number): (readonly [number, number])[] {
  if (statusAt(eng, e) === 0) return [];
  const ranges = rangesAt(eng, e);
  if (ranges.length === 0) return [];
  const base = e * DAY_MS;
  // Offsets lie within -12 h ... +14 h: if the offset is the same at both ends of every instant
  // that could belong to this local day, the day has no transition and plain arithmetic works.
  const before = offsetAt(base - 14 * HOUR_MS, eng.zone);
  const after = offsetAt(base + DAY_MS + 14 * HOUR_MS, eng.zone);
  if (before === after) return ranges.map(([s, t]) => [base + s * MINUTE_MS - before, base + t * MINUTE_MS - before] as const);
  const out: (readonly [number, number])[] = [];
  let previous = Number.NEGATIVE_INFINITY;
  for (const [s, t] of ranges) {
    const start = Math.max(wallToInstant(eng.zone, e, s), previous);
    const end = Math.max(wallToInstant(eng.zone, e, t), start);
    if (end > start) out.push([start, end] as const);
    previous = end;
  }
  return out;
}

const localDay = (eng: Engine, ms: number): number => toEpochDay(plainDateFromInstant(ms, eng.zone));

/**
 * Working hours of a date as instants in the calendar's time zone (empty on non-working days).
 * @example
 * workingIntervals('2026-10-05'); // => [{ start: Date.UTC(2026, 9, 5, 9), end: Date.UTC(2026, 9, 5, 17) }]
 * workingIntervals('2026-10-03'); // => [] // Saturday
 * @example
 * const london = createBusinessCalendar({ timeZone: 'Europe/London', workingHours: { default: [['09:00', '12:30'], ['13:30', '17:30']] } });
 * workingIntervals('2026-10-05', london); // => [{ start: Date.UTC(2026, 9, 5, 8), end: Date.UTC(2026, 9, 5, 11, 30) }, { start: Date.UTC(2026, 9, 5, 12, 30), end: Date.UTC(2026, 9, 5, 16, 30) }] // BST is UTC+1
 */
export function workingIntervals(date: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar()): readonly InstantInterval[] {
  const eng = engineOf(calendar);
  return Object.freeze(intervalsAt(eng, toEpochDay(toPlainDate(date))).map(([start, end]) => Object.freeze({ start, end })));
}

/**
 * True when an instant falls inside working hours of a business day in the calendar's zone.
 * @example
 * const cal = createBusinessCalendar({ timeZone: 'Europe/London', holidays: [fixedHoliday('Christmas Day', 12, 25)] });
 * isWorkingTime(Date.UTC(2026, 9, 5, 10), cal); // => true // Monday 11:00 in London
 * isWorkingTime(Date.UTC(2026, 9, 5, 16, 30), cal); // => false // 17:30 in London
 * isWorkingTime(Date.UTC(2026, 11, 25, 10), cal); // => false // holiday
 */
export function isWorkingTime(instant: InstantInput, calendar: BusinessCalendar = defaultBusinessCalendar()): boolean {
  const eng = engineOf(calendar);
  const ms = toEpochMs(instant);
  return intervalsAt(eng, localDay(eng, ms)).some(([s, t]) => ms >= s && ms < t);
}

/**
 * The instant itself when it is working time, otherwise the start of the next working interval.
 * Throws `HLP_BIZCAL_NO_WORKING_DAYS` when there is no working time within ten years.
 * @example
 * const cal = createBusinessCalendar({ timeZone: 'UTC' });
 * nextWorkingTime(Date.UTC(2026, 9, 3, 12), cal); // => Date.UTC(2026, 9, 5, 9) // Saturday noon → Monday 09:00
 * nextWorkingTime(Date.UTC(2026, 9, 5, 10), cal); // => Date.UTC(2026, 9, 5, 10) // already working time
 * @example
 * const kolkata = createBusinessCalendar({ timeZone: 'Asia/Kolkata' });
 * new Date(nextWorkingTime(Date.UTC(2026, 9, 5, 12), kolkata)).toISOString(); // => '2026-10-06T03:30:00.000Z' // 17:30 Monday → Tuesday 09:00 IST
 */
export function nextWorkingTime(instant: InstantInput, calendar: BusinessCalendar = defaultBusinessCalendar()): number {
  const eng = engineOf(calendar);
  const ms = toEpochMs(instant);
  const e0 = localDay(eng, ms);
  for (let i = 0; i <= MAX_IDLE_DAYS; i++) {
    for (const [s, t] of intervalsAt(eng, e0 + i)) if (t > ms) return Math.max(s, ms);
  }
  return noWorkingDays();
}

/** Options for `diffBusinessHours`. */
export interface DiffBusinessHoursOptions {
  /** Default `'hours'` (fractional); `'milliseconds'` for exact integer arithmetic. */
  readonly unit?: 'hours' | 'milliseconds';
}

/**
 * Working time between two instants (real elapsed time inside working intervals, DST-correct),
 * negative when `end` is before `start`. Ranges may span at most 100 years.
 * @example
 * const cal = createBusinessCalendar({ timeZone: 'UTC', workingHours: { default: [['09:00', '17:00']] } });
 * diffBusinessHours(Date.UTC(2026, 9, 2, 15), Date.UTC(2026, 9, 5, 11), cal); // => 4 // Fri 15-17 + Mon 9-11
 * diffBusinessHours(Date.UTC(2026, 9, 5, 11), Date.UTC(2026, 9, 2, 15), cal); // => -4
 * diffBusinessHours(Date.UTC(2026, 9, 2, 15), Date.UTC(2026, 9, 2, 15, 30), cal, { unit: 'milliseconds' }); // => 1800000
 */
export function diffBusinessHours(start: InstantInput, end: InstantInput, calendar: BusinessCalendar = defaultBusinessCalendar(), options: DiffBusinessHoursOptions = {}): number {
  const eng = engineOf(calendar);
  const x = toEpochMs(start);
  const y = toEpochMs(end);
  const unit: string = options.unit ?? 'hours';
  if (unit !== 'hours' && unit !== 'milliseconds') throw invalid('HLP_BIZCAL_INVALID_OPTION', 'unit must be hours or milliseconds.', 'unit');
  const a = Math.min(x, y);
  const b = Math.max(x, y);
  const eA = localDay(eng, a);
  const eB = localDay(eng, b);
  if (eB - eA > MAX_SCAN_DAYS) throw limit('HLP_BIZCAL_RANGE_LIMIT', 'The range spans too many days.', MAX_SCAN_DAYS);
  let total = 0;
  for (let e = eA; e <= eB; e++) {
    for (const [s, t] of intervalsAt(eng, e)) total += Math.max(0, Math.min(t, b) - Math.max(s, a));
  }
  const value = unit === 'hours' ? total / HOUR_MS : total;
  return value === 0 ? 0 : y >= x ? value : -value;
}

/**
 * Adds working time to an instant (negative subtracts), skipping non-working time. A result
 * that lands exactly on the end of an interval stays there (17:00, not the next 09:00). Zero
 * returns the instant unchanged.
 * @example
 * const cal = createBusinessCalendar({ timeZone: 'UTC' });
 * addBusinessHours(Date.UTC(2026, 9, 2, 15), 4, cal); // => Date.UTC(2026, 9, 5, 11) // Friday 15:00 → Monday 11:00
 * addBusinessHours(Date.UTC(2026, 9, 2, 15), 2, cal); // => Date.UTC(2026, 9, 2, 17) // ends exactly at 17:00
 * addBusinessHours(Date.UTC(2026, 9, 5, 10), -2, cal); // => Date.UTC(2026, 9, 2, 16) // back into Friday
 */
export function addBusinessHours(instant: InstantInput, hours: number, calendar: BusinessCalendar = defaultBusinessCalendar()): number {
  const eng = engineOf(calendar);
  const ms = toEpochMs(instant);
  if (typeof hours !== 'number' || !Number.isFinite(hours)) throw invalid('HLP_BIZCAL_INVALID_OPTION', 'hours must be a finite number.', 'hours');
  let remaining = Math.round(Math.abs(hours) * HOUR_MS);
  if (remaining === 0) return ms;
  const forward = hours > 0;
  const e0 = localDay(eng, ms);
  let idle = 0;
  for (let i = 0; i <= MAX_SCAN_DAYS; i++) {
    const e = forward ? e0 + i : e0 - i;
    const list = intervalsAt(eng, e);
    let used = false;
    if (forward) {
      for (const [s, t] of list) {
        const from = Math.max(s, ms);
        if (t <= from) continue;
        used = true;
        if (remaining <= t - from) return from + remaining;
        remaining -= t - from;
      }
    } else {
      for (let k = list.length - 1; k >= 0; k--) {
        const [s, t] = list[k] ?? [0, 0];
        const to = Math.min(t, ms);
        if (to <= s) continue;
        used = true;
        if (remaining <= to - s) return to - remaining;
        remaining -= to - s;
      }
    }
    idle = used ? 0 : idle + 1;
    if (idle > MAX_IDLE_DAYS) noWorkingDays();
  }
  throw limit('HLP_BIZCAL_RANGE_LIMIT', 'The result is too far away.', MAX_SCAN_DAYS);
}

/**
 * An SLA target: working hours, or business days (due at the end of the working day).
 * @example const target: SlaTarget = { businessHours: 8 };
 */
export type SlaTarget = { readonly businessHours: number } | { readonly businessDays: number };

/**
 * Deadline for an SLA started at `start`. `{ businessHours }` adds working time
 * (`addBusinessHours`). `{ businessDays: n }` is due at the end of the last working interval of
 * the `n`-th business day after the start's local date (`n = 0`: that date, or the next
 * business day); a business day without hours is due at the end of the day.
 * @example
 * const cal = createBusinessCalendar({ timeZone: 'UTC', holidays: [fixedHoliday('Christmas Day', 12, 25)] });
 * slaDeadline(Date.UTC(2026, 9, 2, 16), { businessDays: 1 }, cal); // => Date.UTC(2026, 9, 5, 17) // Friday → end of Monday
 * slaDeadline(Date.UTC(2026, 9, 2, 16), { businessHours: 4 }, cal); // => Date.UTC(2026, 9, 5, 12) // 1 h Friday + 3 h Monday
 * slaDeadline(Date.UTC(2026, 11, 24, 16), { businessHours: 4 }, cal); // => Date.UTC(2026, 11, 28, 12) // skips Christmas and the weekend
 */
export function slaDeadline(start: InstantInput, target: SlaTarget, calendar: BusinessCalendar = defaultBusinessCalendar()): number {
  const eng = engineOf(calendar);
  const ms = toEpochMs(start);
  const t: unknown = target;
  if (typeof t !== 'object' || t === null) throw invalid('HLP_BIZCAL_INVALID_OPTION', 'Expected { businessHours } or { businessDays }.', 'target');
  const hours = 'businessHours' in target ? target.businessHours : undefined;
  const days = 'businessDays' in target ? target.businessDays : undefined;
  if ((hours === undefined) === (days === undefined)) throw invalid('HLP_BIZCAL_INVALID_OPTION', 'Expected exactly one of businessHours or businessDays.', 'target');
  if (hours !== undefined) {
    if (typeof hours !== 'number' || !(hours >= 0)) throw invalid('HLP_BIZCAL_INVALID_OPTION', 'businessHours must be a non-negative number.', 'businessHours');
    return addBusinessHours(ms, hours, calendar);
  }
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 0) throw invalid('HLP_BIZCAL_INVALID_OPTION', 'businessDays must be a non-negative integer.', 'businessDays');
  const e0 = localDay(eng, ms);
  const due = days === 0 && statusAt(eng, e0) !== 0 ? e0 : stepForward(eng, e0, Math.max(days, 1));
  const list = intervalsAt(eng, due);
  const last = list[list.length - 1];
  return last ? last[1] : endOfDayInstant(fromEpochDay(due), eng.zone);
}
