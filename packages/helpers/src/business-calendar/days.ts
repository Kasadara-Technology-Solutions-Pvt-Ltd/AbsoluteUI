/**
 * Date-level business-calendar queries: weekend/weekday, holidays, business days, navigation,
 * and differences. Counting is O(years + log h) per range: weekdays arithmetically, holidays and
 * exceptions by binary search over cached per-year prefix sums.
 */
import { addMonths, fromEpochDay, plainDate, plainDateFromInstant, toEpochDay, toPlainDate, type DateInput, type Inclusivity, type InstantInput, type IsoWeekday, type PlainDate } from '../date/index.js';
import {
  S_FULL, S_HALF, S_HOL_WEEKDAY, S_HOL_WEEKEND, S_NONWORKING_WEEKDAY, S_PATTERN, S_WORKING_WEEKEND,
  businessCount, businessValue, defaultBusinessCalendar, engineOf, infoAt, patternCount, rangesAt, recordAt, recordsIn, specialCounts, statusAt, stepBackward, stepForward,
  type BusinessCalendar, type BusinessDayInfo, type Engine,
} from './engine.js';
import { epochOf, invalid, limit, weekdayOfEpoch } from './internal.js';
import type { ResolvedHoliday } from './rules.js';

const ep = (date: DateInput): number => toEpochDay(toPlainDate(date));
const INCLUSIVE = new Set(['none', 'start', 'end', 'both']);
const MAX_LIST_YEARS = 1000;
const CONVENTIONS = new Set(['following', 'modifiedFollowing', 'preceding', 'modifiedPreceding', 'none']);

function halfValueOf(eng: Engine, value: number | undefined): number {
  if (value === undefined) return eng.cal.halfDayValue;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw invalid('HLP_BIZCAL_INVALID_OPTION', 'halfDayValue must be between 0 and 1.', 'halfDayValue');
  return value;
}

// ---------------------------------------------------------------------------
// Single-date queries

/**
 * True when the weekday pattern makes the date a weekend day (holidays and exceptions do not
 * matter). Default calendar: Saturday/Sunday.
 * @example isWeekend('2026-10-03') // => true // Saturday
 * @example isWeekend('2026-10-02', createBusinessCalendar({ weekend: [5, 6] })) // => true // Friday
 */
export function isWeekend(date: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar()): boolean {
  return engineOf(calendar).working[weekdayOfEpoch(ep(date))] !== true;
}

/**
 * True when the date is not a weekend day (it may still be a holiday).
 * @example isWeekday('2026-10-02') // => true // Friday
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25)] });
 * isWeekday('2026-12-25', cal); // => true // a holiday is still a weekday
 * isBusinessDay('2026-12-25', cal); // => false
 */
export function isWeekday(date: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar()): boolean {
  return !isWeekend(date, calendar);
}

/**
 * Every holiday entry on a date (several rules may coincide), including shifted originals
 * (`movedTo`) and half days.
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25, { observed: 'nearest-weekday' })] });
 * holidaysOn('2026-12-25', cal).map((h) => h.name); // => ['Christmas Day']
 * holidaysOn('2027-12-25', cal).map((h) => h.movedTo); // => ['2027-12-24'] // Saturday, observed Friday
 * holidaysOn('2026-12-28', cal); // => []
 */
export function holidaysOn(date: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar()): readonly ResolvedHoliday[] {
  const eng = engineOf(calendar);
  return recordAt(eng, ep(date))?.holidays ?? [];
}

/**
 * The full (non-half-day) holiday on a date, preferring one that is in effect there over a
 * weekend original that was shifted elsewhere; `undefined` when there is none. Half days are
 * reported by `isHalfDay`.
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25, { observed: 'nearest-weekday' })] });
 * isHoliday('2027-12-24', cal)?.observed; // => true // Christmas on Saturday, observed Friday
 * isHoliday('2027-12-25', cal)?.movedTo; // => '2027-12-24'
 * isHoliday('2027-12-27', cal); // => undefined
 */
export function isHoliday(date: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar()): ResolvedHoliday | undefined {
  const list = holidaysOn(date, calendar);
  return list.find((h) => !h.halfDay && h.movedTo === undefined) ?? list.find((h) => !h.halfDay);
}

/**
 * True for business days: working weekdays that are not holidays, plus working exceptions.
 * Half days are business days.
 * @example
 * const cal = createBusinessCalendar({
 *   holidays: [fixedHoliday('Christmas Day', 12, 25)],
 *   exceptions: [{ date: '2026-12-19', working: true, reason: 'Year-end close' }],
 * });
 * isBusinessDay('2026-12-24', cal); // => true // Thursday
 * isBusinessDay('2026-12-25', cal); // => false // holiday
 * isBusinessDay('2026-12-26', cal); // => false // Saturday
 * isBusinessDay('2026-12-19', cal); // => true // working Saturday exception
 */
export function isBusinessDay(date: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar()): boolean {
  return statusAt(engineOf(calendar), ep(date)) !== 0;
}

/**
 * True for working half days.
 * @example
 * const cal = createBusinessCalendar({
 *   holidays: [fixedHoliday('Christmas Day', 12, 25, { observed: 'nearest-weekday' })],
 *   halfDays: [fixedHoliday('Christmas Eve', 12, 24)],
 * });
 * isHalfDay('2026-12-24', cal); // => true // Thursday
 * isBusinessDay('2026-12-24', cal); // => true // half days are business days
 * isHalfDay('2027-12-24', cal); // => false // the observed Christmas Day (a full holiday) wins
 */
export function isHalfDay(date: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar()): boolean {
  return statusAt(engineOf(calendar), ep(date)) === 2;
}

/**
 * Full information about a date: working, weekend, holidays, exception, half day, hours, and
 * an accessible reason (`reasonCode` + `reason` text).
 * @example getBusinessDay('2026-10-03').reasonCode // => 'weekend'
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25)] });
 * const info = getBusinessDay('2026-12-25', cal);
 * [info.working, info.weekend, info.reasonCode, info.reason]; // => [false, false, 'holiday', 'Christmas Day']
 * getBusinessDay('2026-12-28', cal).reasonCode; // => null // an ordinary working day
 */
export function getBusinessDay(date: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar()): BusinessDayInfo {
  return infoAt(engineOf(calendar), ep(date));
}

/**
 * `getBusinessDay` for the calendar date of an instant in the calendar's time zone.
 * @example
 * const indiaCal = createBusinessCalendar({ timeZone: 'Asia/Kolkata' });
 * const instant = Date.UTC(2026, 9, 2, 20); // Friday 20:00 UTC
 * businessDayAt(instant, indiaCal).date; // => '2026-10-03' // already Saturday 01:30 in Kolkata
 * businessDayAt(instant, indiaCal).working; // => false
 * businessDayAt(instant).date; // => '2026-10-02' // the default calendar uses UTC
 */
export function businessDayAt(instant: InstantInput, calendar: BusinessCalendar = defaultBusinessCalendar()): BusinessDayInfo {
  const eng = engineOf(calendar);
  return infoAt(eng, toEpochDay(plainDateFromInstant(instant, eng.zone)));
}

// ---------------------------------------------------------------------------
// Lists

/**
 * Holiday entries between two dates (inclusive, either order), ascending by date. Ranges may
 * span at most 1000 years.
 * @example
 * const cal = createBusinessCalendar({
 *   holidays: [fixedHoliday('New Year', 1, 1), easterHoliday('Good Friday', -2), fixedHoliday('Christmas Day', 12, 25)],
 * });
 * const holidays = listHolidays('2026-01-01', '2026-12-31', cal);
 * holidays.map((h) => h.name); // => ['New Year', 'Good Friday', 'Christmas Day']
 * holidays.map((h) => h.date); // => ['2026-01-01', '2026-04-03', '2026-12-25']
 */
export function listHolidays(from: DateInput, to: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar()): ResolvedHoliday[] {
  const eng = engineOf(calendar);
  const a = ep(from);
  const b = ep(to);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (fromEpochDay(hi).year - fromEpochDay(lo).year > MAX_LIST_YEARS) throw limit('HLP_BIZCAL_RANGE_LIMIT', 'The date range spans too many years.', MAX_LIST_YEARS);
  const out: ResolvedHoliday[] = [];
  recordsIn(eng, lo, hi, (_e, rec) => { out.push(...rec.holidays); });
  return out;
}

/** Options for `listBusinessDays`. */
export interface ListBusinessDaysOptions {
  /** Stop after this many dates. Default unlimited (the generator is lazy). */
  readonly limit?: number;
}

/**
 * Lazily yields the business days from `from` to `to` inclusive, in that direction (descending
 * when `to` is earlier).
 * @example [...listBusinessDays('2026-10-01', '2026-10-07')].length // => 5
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25)] });
 * [...listBusinessDays('2026-12-23', '2026-12-29', cal)]; // => ['2026-12-23', '2026-12-24', '2026-12-28', '2026-12-29']
 * [...listBusinessDays('2026-12-31', '2026-12-01', cal, { limit: 2 })]; // => ['2026-12-31', '2026-12-30'] // descending
 */
export function listBusinessDays(from: DateInput, to: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar(), options: ListBusinessDaysOptions = {}): Generator<PlainDate, void, undefined> {
  const eng = engineOf(calendar);
  const a = ep(from);
  const b = ep(to);
  const max = options.limit ?? Number.POSITIVE_INFINITY;
  if (typeof max !== 'number' || Number.isNaN(max) || max < 0 || (Number.isFinite(max) && !Number.isInteger(max))) throw invalid('HLP_BIZCAL_INVALID_OPTION', 'limit must be a non-negative integer.', 'limit');
  const step = b >= a ? 1 : -1;
  function* run(): Generator<PlainDate, void, undefined> {
    let count = 0;
    for (let e = a; step > 0 ? e <= b : e >= b; e += step) {
      if (count >= max) return;
      if (statusAt(eng, e) !== 0) {
        count++;
        yield fromEpochDay(e);
      }
    }
  }
  return run();
}

/**
 * A period for `businessDaysIn`: a calendar year, month, or quarter, or a fiscal year or
 * fiscal quarter per the calendar's `fiscalYearStartMonth` and `fiscalYearNaming`.
 * @example
 * const q: BusinessPeriod = { fiscalYear: 2027, quarter: 1 };
 * periodRange(q, createBusinessCalendar({ fiscalYearStartMonth: 4 })); // => ['2026-04-01', '2026-06-30']
 * periodRange({ year: 2026, quarter: 4 }); // => ['2026-10-01', '2026-12-31']
 */
export type BusinessPeriod = number | { readonly year: number; readonly month: number } | { readonly year: number; readonly quarter: number } | { readonly fiscalYear: number; readonly quarter?: number };

function intOpt(value: unknown, min: number, max: number, property: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw invalid('HLP_BIZCAL_INVALID_OPTION', 'Period field is out of range.', property);
  return value;
}

/**
 * First and last date (inclusive) of a `BusinessPeriod`.
 * @example
 * const cal = createBusinessCalendar({ fiscalYearStartMonth: 4 });
 * periodRange({ fiscalYear: 2027 }, cal); // => ['2026-04-01', '2027-03-31'] // named by the year it ends in
 * periodRange({ year: 2026, month: 2 }); // => ['2026-02-01', '2026-02-28']
 */
export function periodRange(period: BusinessPeriod, calendar: BusinessCalendar = defaultBusinessCalendar()): readonly [PlainDate, PlainDate] {
  const { cal } = engineOf(calendar);
  let start: PlainDate;
  let months: number;
  if (typeof period === 'number') {
    start = plainDate(period, 1, 1);
    months = 12;
  } else if (typeof period === 'object' && 'fiscalYear' in period) {
    const fy = intOpt(period.fiscalYear, -270_000, 270_000, 'fiscalYear');
    const sm = cal.fiscalYearStartMonth;
    start = plainDate(sm === 1 || cal.fiscalYearNaming === 'start' ? fy : fy - 1, sm, 1);
    months = 12;
    if (period.quarter !== undefined) {
      start = addMonths(start, 3 * (intOpt(period.quarter, 1, 4, 'quarter') - 1));
      months = 3;
    }
  } else if (typeof period === 'object' && 'month' in period) {
    start = plainDate(period.year, intOpt(period.month, 1, 12, 'month'), 1);
    months = 1;
  } else if (typeof period === 'object' && 'quarter' in period) {
    start = plainDate(period.year, (intOpt(period.quarter, 1, 4, 'quarter') - 1) * 3 + 1, 1);
    months = 3;
  } else {
    throw invalid('HLP_BIZCAL_INVALID_OPTION', 'Unknown period.', 'period');
  }
  return Object.freeze([start, fromEpochDay(toEpochDay(addMonths(start, months)) - 1)] as const);
}

/**
 * Business days in a period, half days weighted (`halfDayValue`, default the calendar's).
 * @example businessDaysIn({ year: 2026, month: 10 }) // => 22
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25)], halfDays: [fixedHoliday('Christmas Eve', 12, 24)] });
 * businessDaysIn({ year: 2026, month: 12 }, cal); // => 21.5 // 23 weekdays − Christmas − half of Christmas Eve
 * businessDaysIn({ year: 2026, month: 12 }, cal, { halfDayValue: 1 }); // => 22
 */
export function businessDaysIn(period: BusinessPeriod, calendar: BusinessCalendar = defaultBusinessCalendar(), options: { readonly halfDayValue?: number } = {}): number {
  const eng = engineOf(calendar);
  const [start, end] = periodRange(period, calendar);
  return businessValue(eng, toEpochDay(start), toEpochDay(end), halfValueOf(eng, options.halfDayValue));
}

// ---------------------------------------------------------------------------
// Navigation

/** Options for `nextBusinessDay` / `previousBusinessDay`. */
export interface NextBusinessDayOptions {
  /** Return `date` itself when it is a business day. Default false. */
  readonly includeSelf?: boolean;
}

/**
 * The first business day after `date` (or on it with `includeSelf`). Throws
 * `HLP_BIZCAL_NO_WORKING_DAYS` when the calendar has no business day in reach.
 * @example nextBusinessDay('2026-10-02') // => '2026-10-05' // Friday → Monday
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25)] });
 * nextBusinessDay('2026-12-24', cal); // => '2026-12-28' // skips the holiday and the weekend
 * nextBusinessDay('2026-12-24', cal, { includeSelf: true }); // => '2026-12-24'
 */
export function nextBusinessDay(date: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar(), options: NextBusinessDayOptions = {}): PlainDate {
  const eng = engineOf(calendar);
  const e = ep(date);
  if (options.includeSelf === true && statusAt(eng, e) !== 0) return fromEpochDay(e);
  return fromEpochDay(stepForward(eng, e, 1));
}

/**
 * The last business day before `date` (or on it with `includeSelf`).
 * @example previousBusinessDay('2026-10-05') // => '2026-10-02' // Monday → Friday
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('New Year', 1, 1)] });
 * previousBusinessDay('2027-01-04', cal); // => '2026-12-31' // skips the weekend and New Year (Friday)
 */
export function previousBusinessDay(date: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar(), options: NextBusinessDayOptions = {}): PlainDate {
  const eng = engineOf(calendar);
  const e = ep(date);
  if (options.includeSelf === true && statusAt(eng, e) !== 0) return fromEpochDay(e);
  return fromEpochDay(stepBackward(eng, e, 1));
}

/** Options for `addBusinessDays`. */
export interface AddBusinessDaysOptions {
  /**
   * Result for `n = 0`: `'following'` (default) returns `date` when it is a business day, else
   * the next one; `'preceding'` the previous one; `'none'` returns `date` unchanged (Excel
   * `WORKDAY(date, 0)`).
   */
  readonly zero?: 'following' | 'preceding' | 'none';
}

const MAX_BUSINESS_STEPS = 10_000_000;

/**
 * Moves `n` business days (negative moves back); half days count as one business day. The
 * result is always a business day for `n != 0`. Runs in O(log n) range counts, never day by day.
 * Inverse: `diffDays(d, addBusinessDays(d, n), { mode: 'business', inclusive: 'end', halfDayValue: 1 }) === n`
 * for `n > 0` (use `inclusive: 'start'` for `n < 0`).
 * @example addBusinessDays('2026-10-02', 1) // => '2026-10-05'
 * @example addBusinessDays('2026-10-05', -1) // => '2026-10-02'
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25), fixedHoliday('New Year', 1, 1)] });
 * addBusinessDays('2026-12-23', 5, cal); // => '2026-12-31' // Christmas and the weekend are skipped
 * addBusinessDays('2026-12-26', 0, cal); // => '2026-12-28' // zero: 'following'
 * addBusinessDays('2026-12-26', 0, cal, { zero: 'none' }); // => '2026-12-26'
 */
export function addBusinessDays(date: DateInput, n: number, calendar: BusinessCalendar = defaultBusinessCalendar(), options: AddBusinessDaysOptions = {}): PlainDate {
  const eng = engineOf(calendar);
  const e = ep(date);
  if (typeof n !== 'number' || !Number.isInteger(n)) throw invalid('HLP_BIZCAL_INVALID_OPTION', 'n must be an integer.', 'n');
  if (Math.abs(n) > MAX_BUSINESS_STEPS) throw limit('HLP_BIZCAL_RANGE_LIMIT', 'n exceeds the supported number of business days.', MAX_BUSINESS_STEPS);
  if (n > 0) return fromEpochDay(stepForward(eng, e, n));
  if (n < 0) return fromEpochDay(stepBackward(eng, e, -n));
  const zero: string = options.zero ?? 'following';
  if (zero === 'none' || statusAt(eng, e) !== 0) return fromEpochDay(e);
  if (zero === 'following') return fromEpochDay(stepForward(eng, e, 1));
  if (zero === 'preceding') return fromEpochDay(stepBackward(eng, e, 1));
  throw invalid('HLP_BIZCAL_INVALID_OPTION', 'Unknown zero option.', 'zero');
}

/**
 * Business-day conventions (ISDA): `'following'`, `'modifiedFollowing'` (following unless that
 * leaves the month, then preceding), `'preceding'`, `'modifiedPreceding'`, `'none'`.
 * @example const c: BusinessDayConvention = 'modifiedFollowing';
 */
export type BusinessDayConvention = 'following' | 'modifiedFollowing' | 'preceding' | 'modifiedPreceding' | 'none';

/**
 * Rolls a non-business date by a convention; business days are returned unchanged.
 * @example
 * adjustBusinessDay('2026-10-31', 'following'); // => '2026-11-02' // Saturday → Monday
 * adjustBusinessDay('2026-10-31', 'modifiedFollowing'); // => '2026-10-30' // Monday is November, so Friday
 * adjustBusinessDay('2026-10-28', 'modifiedFollowing'); // => '2026-10-28' // business days stay
 */
export function adjustBusinessDay(date: DateInput, convention: BusinessDayConvention, calendar: BusinessCalendar = defaultBusinessCalendar()): PlainDate {
  const eng = engineOf(calendar);
  const d = toPlainDate(date);
  const e = toEpochDay(d);
  if (!CONVENTIONS.has(convention)) throw invalid('HLP_BIZCAL_INVALID_OPTION', 'Unknown business-day convention.', 'convention');
  if (convention === 'none' || statusAt(eng, e) !== 0) return d;
  switch (convention) {
    case 'following': return fromEpochDay(stepForward(eng, e, 1));
    case 'preceding': return fromEpochDay(stepBackward(eng, e, 1));
    case 'modifiedFollowing': {
      const f = fromEpochDay(stepForward(eng, e, 1));
      return f.month === d.month && f.year === d.year ? f : fromEpochDay(stepBackward(eng, e, 1));
    }
    case 'modifiedPreceding': {
      const p = fromEpochDay(stepBackward(eng, e, 1));
      return p.month === d.month && p.year === d.year ? p : fromEpochDay(stepForward(eng, e, 1));
    }
    default: return d;
  }
}

function monthBounds(year: number, month: number): [number, number] {
  const first = plainDate(year, month, 1);
  const lo = toEpochDay(first);
  return [lo, toEpochDay(addMonths(first, 1)) - 1];
}

/**
 * The `n`-th business day of a month (`n` >= 1), or counting from the end (`-1` = last);
 * `undefined` when the month has fewer.
 * @example nthBusinessDayOfMonth(2026, 10, 1) // => '2026-10-01'
 * @example nthBusinessDayOfMonth(2026, 10, -1) // => '2026-10-30'
 */
export function nthBusinessDayOfMonth(year: number, month: number, n: number, calendar: BusinessCalendar = defaultBusinessCalendar()): PlainDate | undefined {
  const eng = engineOf(calendar);
  if (typeof n !== 'number' || !Number.isInteger(n) || n === 0 || Math.abs(n) > 31) throw invalid('HLP_BIZCAL_INVALID_OPTION', 'n must be a non-zero integer from -31 to 31.', 'n');
  const [lo, hi] = monthBounds(year, month);
  let left = Math.abs(n);
  for (let i = 0; i <= hi - lo; i++) {
    const e = n > 0 ? lo + i : hi - i;
    if (statusAt(eng, e) !== 0 && --left === 0) return fromEpochDay(e);
  }
  return undefined;
}

/**
 * First business day of a month, or `undefined` when there is none.
 * @example firstBusinessDayOfMonth(2026, 11) // => '2026-11-02' // 1 November is a Sunday
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('New Year', 1, 1)] });
 * firstBusinessDayOfMonth(2027, 1, cal); // => '2027-01-04' // Friday 1st is a holiday
 */
export function firstBusinessDayOfMonth(year: number, month: number, calendar: BusinessCalendar = defaultBusinessCalendar()): PlainDate | undefined {
  return nthBusinessDayOfMonth(year, month, 1, calendar);
}

/**
 * Last business day of a month, or `undefined` when there is none.
 * @example lastBusinessDayOfMonth(2026, 10) // => '2026-10-30' // 31 October is a Saturday
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('New Year', 1, 1, { observed: 'nearest-weekday' })] });
 * lastBusinessDayOfMonth(2027, 12, cal); // => '2027-12-30' // New Year 2028 (Saturday) is observed on Friday 31st
 */
export function lastBusinessDayOfMonth(year: number, month: number, calendar: BusinessCalendar = defaultBusinessCalendar()): PlainDate | undefined {
  return nthBusinessDayOfMonth(year, month, -1, calendar);
}

/**
 * 1-based index of a business day within its month; `undefined` for non-business days.
 * @example businessDayOfMonth('2026-10-05') // => 3
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Gandhi Jayanti', 10, 2)] });
 * businessDayOfMonth('2026-10-05', cal); // => 2
 * businessDayOfMonth('2026-10-02', cal); // => undefined // holiday
 */
export function businessDayOfMonth(date: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar()): number | undefined {
  const eng = engineOf(calendar);
  const d = toPlainDate(date);
  const e = toEpochDay(d);
  if (statusAt(eng, e) === 0) return undefined;
  return businessCount(eng, epochOf(d.year, d.month, 1), e);
}

// ---------------------------------------------------------------------------
// Differences

/**
 * Which end dates of a range are counted. Inclusivity refers to the earlier (`start`) and
 * later (`end`) date whatever the argument order; the sign of a difference gives the direction.
 * For `a` = Monday and `b` = Friday of one week (weekdays mode):
 *
 * | inclusive | dates counted | count |
 * |---|---|---|
 * | `'start'` (default) | Mon..Thu, [a, b) | 4 |
 * | `'end'` | Tue..Fri, (a, b] | 4 |
 * | `'both'` | Mon..Fri, [a, b] (leave requests) | 5 |
 * | `'none'` | Tue..Thu, (a, b) | 3 |
 *
 * When `a` and `b` are the same date only `'both'` counts it.
 */
export type { Inclusivity };

/** What `diffDays` counts. */
export type DiffMode = 'calendar' | 'weekdays' | 'business';

/** Options for `diffDays`. */
export interface DiffDaysOptions {
  /** Default `'calendar'`. `'weekdays'` counts non-weekend days; `'business'` also removes holidays. */
  readonly mode?: DiffMode;
  /** Default `'start'`: [earlier, later), which equals `daysBetween` in calendar mode. */
  readonly inclusive?: Inclusivity;
  /** Default: the shared Saturday/Sunday calendar. */
  readonly calendar?: BusinessCalendar;
  /** Business mode: value of a half day (default the calendar's, 0.5). */
  readonly halfDayValue?: number;
}

interface Span {
  readonly sign: 1 | -1;
  readonly lo: number;
  readonly hi: number;
}

function spanOf(a: DateInput, b: DateInput, inclusive: Inclusivity | undefined): Span {
  const x = ep(a);
  const y = ep(b);
  const inc = inclusive ?? 'start';
  if (!INCLUSIVE.has(inc)) throw invalid('HLP_BIZCAL_INVALID_OPTION', 'inclusive must be none, start, end, or both.', 'inclusive');
  const first = Math.min(x, y);
  const last = Math.max(x, y);
  if (first === last) return { sign: 1, lo: first, hi: inc === 'both' ? first : first - 1 };
  return {
    sign: y >= x ? 1 : -1,
    lo: inc === 'both' || inc === 'start' ? first : first + 1,
    hi: inc === 'both' || inc === 'end' ? last : last - 1,
  };
}

const signed = (sign: 1 | -1, value: number): number => (value === 0 ? 0 : sign * value);

/**
 * Days from `a` to `b`: calendar days, weekdays (non-weekend), or business days (weekdays minus
 * holidays, plus working exceptions, half days weighted). Negative when `b` is before `a`.
 * Week, month, quarter, and year differences are always calendar-based (B1): use
 * `differenceInMonths` and friends from `@absoluteui/helpers/date`.
 * @example diffDays('2026-09-28', '2026-10-02') // => 4
 * @example diffDays('2026-09-28', '2026-10-02', { mode: 'business', inclusive: 'both' }) // => 5 // Mon..Fri leave
 * @example diffDays('2026-10-02', '2026-09-28', { mode: 'weekdays' }) // => -4
 * @example
 * // Fri 25 Dec 2026 to Fri 1 Jan 2027, with Christmas and New Year as holidays.
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25), fixedHoliday('New Year', 1, 1)] });
 * diffDays('2026-12-25', '2027-01-01', { mode: 'calendar', calendar: cal }); // => 7
 * diffDays('2026-12-25', '2027-01-01', { mode: 'weekdays', calendar: cal }); // => 5
 * diffDays('2026-12-25', '2027-01-01', { mode: 'business', calendar: cal }); // => 4
 * diffDays('2026-12-25', '2027-01-01', { mode: 'business', inclusive: 'both', calendar: cal }); // => 4 // New Year is a holiday too
 */
export function diffDays(a: DateInput, b: DateInput, options: DiffDaysOptions = {}): number {
  const eng = engineOf(options.calendar ?? defaultBusinessCalendar());
  const { sign, lo, hi } = spanOf(a, b, options.inclusive);
  const mode: string = options.mode ?? 'calendar';
  if (mode === 'calendar') return signed(sign, Math.max(0, hi - lo + 1));
  if (mode === 'weekdays') return signed(sign, patternCount(eng, lo, hi));
  if (mode === 'business') return signed(sign, businessValue(eng, lo, hi, halfValueOf(eng, options.halfDayValue)));
  throw invalid('HLP_BIZCAL_INVALID_OPTION', 'mode must be calendar, weekdays, or business.', 'mode');
}

/** Options for the `count*` functions. */
export interface CountOptions {
  /** Default `'start'` (see `Inclusivity`). */
  readonly inclusive?: Inclusivity;
  readonly calendar?: BusinessCalendar;
}

/**
 * Weekend days between two dates (never negative; argument order does not matter).
 * @example countWeekends('2026-10-01', '2026-10-31', { inclusive: 'both' }) // => 9
 * @example countWeekends('2026-10-01', '2026-10-31', { inclusive: 'both', calendar: createBusinessCalendar({ weekend: [5, 6] }) }) // => 10 // five Fridays and five Saturdays
 */
export function countWeekends(a: DateInput, b: DateInput, options: CountOptions = {}): number {
  const eng = engineOf(options.calendar ?? defaultBusinessCalendar());
  const { lo, hi } = spanOf(a, b, options.inclusive);
  return Math.max(0, hi - lo + 1) - patternCount(eng, lo, hi);
}

/**
 * Weekdays (non-weekend days, holidays included) between two dates (never negative).
 * @example countWeekdays('2026-09-28', '2026-10-02', { inclusive: 'both' }) // => 5
 */
export function countWeekdays(a: DateInput, b: DateInput, options: CountOptions = {}): number {
  const eng = engineOf(options.calendar ?? defaultBusinessCalendar());
  const { lo, hi } = spanOf(a, b, options.inclusive);
  return patternCount(eng, lo, hi);
}

/**
 * Business days between two dates (never negative), half days weighted.
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25)], halfDays: [fixedHoliday('Christmas Eve', 12, 24)] });
 * countWeekdays('2026-12-21', '2026-12-25', { inclusive: 'both', calendar: cal }); // => 5
 * countBusinessDays('2026-12-21', '2026-12-25', { inclusive: 'both', calendar: cal }); // => 3.5 // Christmas off, Christmas Eve half
 * countBusinessDays('2026-12-21', '2026-12-25', { inclusive: 'both', calendar: cal, halfDayValue: 1 }); // => 4
 */
export function countBusinessDays(a: DateInput, b: DateInput, options: CountOptions & { readonly halfDayValue?: number } = {}): number {
  const eng = engineOf(options.calendar ?? defaultBusinessCalendar());
  const { lo, hi } = spanOf(a, b, options.inclusive);
  return businessValue(eng, lo, hi, halfValueOf(eng, options.halfDayValue));
}

/**
 * Holiday dates in a range: `onWeekdays` (in effect on working weekdays) and `onWeekends`
 * (falling on weekend days, shifted or not). A date with several holidays counts once.
 * @example
 * const cal = createBusinessCalendar({
 *   holidays: [fixedHoliday('Republic Day', 1, 26), fixedHoliday('Independence Day', 8, 15), fixedHoliday('Christmas Day', 12, 25)],
 * });
 * const count: HolidayCount = countHolidays('2026-01-01', '2026-12-31', { inclusive: 'both', calendar: cal });
 * count; // => { total: 3, onWeekdays: 2, onWeekends: 1 } // 15 August 2026 is a Saturday
 */
export interface HolidayCount {
  readonly total: number;
  readonly onWeekdays: number;
  readonly onWeekends: number;
}

/**
 * Counts full-holiday dates between two dates (never negative); see `HolidayCount`.
 * @example
 * const cal = createBusinessCalendar({
 *   holidays: [fixedHoliday('Republic Day', 1, 26), fixedHoliday('Independence Day', 8, 15), fixedHoliday('Christmas Day', 12, 25)],
 * });
 * countHolidays('2026-01-01', '2026-12-31', { inclusive: 'both', calendar: cal }).onWeekdays; // => 2
 * countHolidays('2026-08-01', '2026-08-31', { inclusive: 'both', calendar: cal }); // => { total: 1, onWeekdays: 0, onWeekends: 1 }
 */
export function countHolidays(a: DateInput, b: DateInput, options: CountOptions = {}): HolidayCount {
  const eng = engineOf(options.calendar ?? defaultBusinessCalendar());
  const { lo, hi } = spanOf(a, b, options.inclusive);
  const s = specialCounts(eng, lo, hi);
  const onWeekdays = s[S_HOL_WEEKDAY] ?? 0;
  const onWeekends = s[S_HOL_WEEKEND] ?? 0;
  return Object.freeze({ total: onWeekdays + onWeekends, onWeekdays, onWeekends });
}

/**
 * Breakdown of a range (all fields signed like `diffDays`). Identities:
 * `weekdays + weekendDays === calendarDays` and
 * `businessDays === weekdays - nonWorkingWeekdays + workingWeekendDays - (1 - halfDayValue) x halfDays`.
 * A holiday on a weekend is counted in `holidaysOnWeekends` and never subtracted twice.
 * `businessHours` is the nominal scheduled wall-clock time (DST-free); use `diffBusinessHours`
 * for elapsed time between instants.
 * @example
 * const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25)] });
 * const b: DiffBreakdown = diffBreakdown('2026-12-21', '2026-12-28', cal); // [Mon 21, Mon 28)
 * [b.calendarDays, b.weekdays, b.weekendDays, b.holidays, b.businessDays]; // => [7, 5, 2, 1, 4]
 * b.weekdays + b.weekendDays === b.calendarDays; // => true
 */
export interface DiffBreakdown {
  readonly calendarDays: number;
  readonly weekdays: number;
  readonly weekendDays: number;
  /** Full-holiday dates in effect on working weekdays. */
  readonly holidays: number;
  /** Full-holiday dates on weekend days. */
  readonly holidaysOnWeekends: number;
  /** Working half days. */
  readonly halfDays: number;
  /** Weekdays that are not worked (holidays, non-working exceptions). */
  readonly nonWorkingWeekdays: number;
  /** Weekend days made working by exceptions. */
  readonly workingWeekendDays: number;
  /** Half days weighted by `halfDayValue`. */
  readonly businessDays: number;
  readonly businessHours: number;
}

function weekdayCount(lo: number, hi: number, weekday: IsoWeekday): number {
  if (hi < lo) return 0;
  // Epoch days with this weekday are ≡ (weekday - 4) mod 7.
  const r = (((weekday - 4) % 7) + 7) % 7;
  const upTo = (x: number): number => Math.floor((x - r) / 7);
  return upTo(hi) - upTo(lo - 1);
}

const minutesOf = (ranges: readonly (readonly [number, number])[]): number => ranges.reduce((sum, [s, e]) => sum + e - s, 0);

/**
 * Calendar days, weekdays, weekend days, holidays, half days, business days, and nominal
 * business hours of a range in one call (see `DiffBreakdown`).
 * @example
 * diffBreakdown('2026-09-28', '2026-10-02', undefined, { inclusive: 'both' }).businessHours; // => 40 // Mon..Fri, 8 h a day
 * @example
 * const cal = createBusinessCalendar({
 *   holidays: [fixedHoliday('Christmas Day', 12, 25), fixedHoliday('Boxing Day', 12, 26)],
 *   halfDays: [fixedHoliday('Christmas Eve', 12, 24)],
 * });
 * const b = diffBreakdown('2026-12-21', '2026-12-27', cal, { inclusive: 'both' }); // Mon..Sun
 * [b.calendarDays, b.weekdays, b.weekendDays]; // => [7, 5, 2]
 * [b.holidays, b.holidaysOnWeekends, b.halfDays, b.nonWorkingWeekdays]; // => [1, 1, 1, 1] // Boxing Day is a Saturday
 * b.businessDays; // => 3.5 // 5 weekdays − Christmas − half of Christmas Eve
 * b.businessHours; // => 28 // 3 × 8 h + 4 h on Christmas Eve
 */
export function diffBreakdown(a: DateInput, b: DateInput, calendar: BusinessCalendar = defaultBusinessCalendar(), options: { readonly inclusive?: Inclusivity; readonly halfDayValue?: number } = {}): DiffBreakdown {
  const eng = engineOf(calendar);
  const hv = halfValueOf(eng, options.halfDayValue);
  const { sign, lo, hi } = spanOf(a, b, options.inclusive);
  const calendarDays = Math.max(0, hi - lo + 1);
  const weekdays = patternCount(eng, lo, hi);
  const s = specialCounts(eng, lo, hi);
  let minutes = 0;
  for (let w = 1; w <= 7; w++) if (eng.working[w] === true) minutes += weekdayCount(lo, hi, w as IsoWeekday) * minutesOf(eng.hours[w] ?? []);
  recordsIn(eng, lo, hi, (e, rec) => {
    if (rec.pattern) minutes -= minutesOf(eng.hours[weekdayOfEpoch(e)] ?? []);
    minutes += minutesOf(rangesAt(eng, e, rec));
  });
  const v = (i: number): number => s[i] ?? 0;
  return Object.freeze({
    calendarDays: signed(sign, calendarDays),
    weekdays: signed(sign, weekdays),
    weekendDays: signed(sign, calendarDays - weekdays),
    holidays: signed(sign, v(S_HOL_WEEKDAY)),
    holidaysOnWeekends: signed(sign, v(S_HOL_WEEKEND)),
    halfDays: signed(sign, v(S_HALF)),
    nonWorkingWeekdays: signed(sign, v(S_NONWORKING_WEEKDAY)),
    workingWeekendDays: signed(sign, v(S_WORKING_WEEKEND)),
    businessDays: signed(sign, weekdays - v(S_PATTERN) + v(S_FULL) + hv * v(S_HALF)),
    businessHours: signed(sign, minutes / 60),
  });
}
