/**
 * Date-only calendar arithmetic: add/subtract, boundaries, fiscal periods, comparisons,
 * calendar-accurate differences, age, and week numbering. Everything takes `DateInput`
 * (`PlainDate | 'YYYY-MM-DD'`) and returns frozen `PlainDate`s; no `Date` at local midnight.
 */
import { ValidationError } from '../error/index.js';
import { comparePlainDates, daysBetween, daysInMonth, isLeapYear, isoWeekday, plainDate, toEpochDay, toPlainDate, today, addDays, type DateInput, type IsoWeekday, type PlainDate } from './plain-date.js';

function assertInteger(value: number, property: string): void {
  if (!Number.isSafeInteger(value)) throw new ValidationError('HLP_DATE_OUT_OF_RANGE', 'Amount must be a safe integer.', { details: { property } });
}

/**
 * Validates an ISO weekday option (1 = Monday ... 7 = Sunday).
 * @example
 * const weekday: number = 7; // e.g. from a form field
 * assertIsoWeekday(weekday, 'weekday'); // narrows to IsoWeekday
 * weekdayName(weekday, { locale: 'en' }); // => 'Sunday'
 * assertIsoWeekday(0, 'weekday'); // => throws HLP_DATE_INVALID_WEEKDAY
 */
export function assertIsoWeekday(value: number, property = 'firstDayOfWeek'): asserts value is IsoWeekday {
  if (!Number.isInteger(value) || value < 1 || value > 7) throw new ValidationError('HLP_DATE_INVALID_WEEKDAY', 'Weekday must be an integer 1 (Monday) to 7 (Sunday).', { details: { property } });
}

function assertMonth(value: number, property: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 12) throw new ValidationError('HLP_DATE_INVALID_MONTH', 'Month must be an integer 1 to 12.', { details: { property } });
}

export interface WeekOptions {
  /** First day of the week, ISO numbering. Default 1 (Monday, ISO 8601). Use `getWeekInfo(locale).firstDay` for locale conventions. */
  readonly firstDayOfWeek?: IsoWeekday;
}

const fdw = (options: WeekOptions): IsoWeekday => {
  const v = options.firstDayOfWeek ?? 1;
  assertIsoWeekday(v);
  return v;
};

// ---------------------------------------------------------------------------
// Adding and subtracting

/**
 * Adds weeks (negative subtracts).
 * @example addWeeks('2026-01-01', 2) // => '2026-01-15'
 */
export function addWeeks(date: DateInput, weeks: number): PlainDate {
  assertInteger(weeks, 'weeks');
  return addDays(date, weeks * 7);
}

/**
 * Adds calendar months, clamping to the target month's last day (Jan 31 + 1 month = Feb 28/29).
 * @example addMonths('2024-01-31', 1) // => '2024-02-29'
 */
export function addMonths(date: DateInput, months: number): PlainDate {
  assertInteger(months, 'months');
  const d = toPlainDate(date);
  const total = d.year * 12 + (d.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  return plainDate(year, month, Math.min(d.day, daysInMonth(year, month)));
}

/**
 * Adds quarters (3 months each, month-end clamped).
 * @example addQuarters('2026-11-30', 1) // => '2027-02-28'
 */
export function addQuarters(date: DateInput, quarters: number): PlainDate {
  assertInteger(quarters, 'quarters');
  return addMonths(date, quarters * 3);
}

/**
 * Adds years; Feb 29 clamps to Feb 28 in non-leap years.
 * @example addYears('2024-02-29', 1) // => '2025-02-28'
 */
export function addYears(date: DateInput, years: number): PlainDate {
  assertInteger(years, 'years');
  return addMonths(date, years * 12);
}

/**
 * Subtracts days.
 * @example subDays('2026-03-01', 1) // => '2026-02-28'
 */
export function subDays(date: DateInput, days: number): PlainDate {
  assertInteger(days, 'days');
  return addDays(date, 0 - days);
}

/**
 * Subtracts weeks.
 * @example subWeeks('2026-01-15', 2) // => '2026-01-01'
 */
export function subWeeks(date: DateInput, weeks: number): PlainDate {
  assertInteger(weeks, 'weeks');
  return addWeeks(date, 0 - weeks);
}

/**
 * Subtracts months (month-end clamped).
 * @example subMonths('2026-03-31', 1) // => '2026-02-28'
 */
export function subMonths(date: DateInput, months: number): PlainDate {
  assertInteger(months, 'months');
  return addMonths(date, 0 - months);
}

/**
 * Subtracts quarters.
 * @example subQuarters('2026-05-31', 1) // => '2026-02-28'
 */
export function subQuarters(date: DateInput, quarters: number): PlainDate {
  assertInteger(quarters, 'quarters');
  return addQuarters(date, 0 - quarters);
}

/**
 * Subtracts years.
 * @example subYears('2028-02-29', 1) // => '2027-02-28'
 */
export function subYears(date: DateInput, years: number): PlainDate {
  assertInteger(years, 'years');
  return addYears(date, 0 - years);
}

// ---------------------------------------------------------------------------
// Boundaries

/**
 * First day of the week containing `date`.
 * @example startOfWeek('2026-09-30', { firstDayOfWeek: 7 }) // => '2026-09-27' // Sunday
 */
export function startOfWeek(date: DateInput, options: WeekOptions = {}): PlainDate {
  const first = fdw(options);
  const d = toPlainDate(date);
  return addDays(d, 0 - ((isoWeekday(d) - first + 7) % 7));
}

/**
 * Last day of the week containing `date`.
 * @example endOfWeek('2026-09-30') // => '2026-10-04' // Sunday
 */
export function endOfWeek(date: DateInput, options: WeekOptions = {}): PlainDate {
  return addDays(startOfWeek(date, options), 6);
}

/**
 * First day of the month.
 * @example startOfMonth('2026-09-29') // => '2026-09-01'
 */
export function startOfMonth(date: DateInput): PlainDate {
  const d = toPlainDate(date);
  return plainDate(d.year, d.month, 1);
}

/**
 * Last day of the month.
 * @example endOfMonth('2024-02-10') // => '2024-02-29'
 */
export function endOfMonth(date: DateInput): PlainDate {
  const d = toPlainDate(date);
  return plainDate(d.year, d.month, daysInMonth(d.year, d.month));
}

/**
 * Calendar quarter (1-4; Q1 = January to March).
 * @example quarterOf('2026-09-29') // => 3
 */
export function quarterOf(date: DateInput): 1 | 2 | 3 | 4 {
  return (Math.floor((toPlainDate(date).month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
}

/**
 * First day of the calendar quarter.
 * @example startOfQuarter('2026-09-29') // => '2026-07-01'
 */
export function startOfQuarter(date: DateInput): PlainDate {
  const d = toPlainDate(date);
  return plainDate(d.year, (quarterOf(d) - 1) * 3 + 1, 1);
}

/**
 * Last day of the calendar quarter.
 * @example endOfQuarter('2026-09-29') // => '2026-09-30'
 */
export function endOfQuarter(date: DateInput): PlainDate {
  return endOfMonth(addMonths(startOfQuarter(date), 2));
}

/**
 * January 1 of the year.
 * @example startOfYear('2026-09-29') // => '2026-01-01'
 */
export function startOfYear(date: DateInput): PlainDate {
  return plainDate(toPlainDate(date).year, 1, 1);
}

/**
 * December 31 of the year.
 * @example endOfYear('2026-09-29') // => '2026-12-31'
 */
export function endOfYear(date: DateInput): PlainDate {
  return plainDate(toPlainDate(date).year, 12, 31);
}

// ---------------------------------------------------------------------------
// Fiscal periods

/**
 * Fiscal-year options. Naming convention: a fiscal year is labelled by the calendar year in
 * which it **ends** (default `naming: 'end'`; US federal FY2027 = Oct 2026 - Sep 2027, India
 * April 2026 - March 2027 = FY2027). `naming: 'start'` labels by the starting year. With
 * `startMonth: 1` both conventions give the calendar year. Quarters are numbered from the
 * fiscal start: Q1 is the first three months of the fiscal year.
 */
export interface FiscalYearOptions {
  /** Month the fiscal year starts in, 1-12. Default 1 (calendar year). */
  readonly startMonth?: number;
  /** Which calendar year names the fiscal year. Default `'end'`. */
  readonly naming?: 'end' | 'start';
}

function fiscalStartYear(d: PlainDate, startMonth: number): number {
  return d.month >= startMonth ? d.year : d.year - 1;
}

function startMonthOf(options: FiscalYearOptions): number {
  const m = options.startMonth ?? 1;
  assertMonth(m, 'startMonth');
  return m;
}

/**
 * First day of the fiscal year containing `date`.
 * @example startOfFiscalYear('2026-09-29', { startMonth: 4 }) // => '2026-04-01'
 */
export function startOfFiscalYear(date: DateInput, options: FiscalYearOptions = {}): PlainDate {
  const sm = startMonthOf(options);
  return plainDate(fiscalStartYear(toPlainDate(date), sm), sm, 1);
}

/**
 * Last day of the fiscal year containing `date`.
 * @example endOfFiscalYear('2026-09-29', { startMonth: 4 }) // => '2027-03-31'
 */
export function endOfFiscalYear(date: DateInput, options: FiscalYearOptions = {}): PlainDate {
  return addDays(addMonths(startOfFiscalYear(date, options), 12), -1);
}

/**
 * Fiscal year number (see `FiscalYearOptions` for the naming convention).
 * @example fiscalYearOf('2026-09-29', { startMonth: 4 }) // => 2027
 */
export function fiscalYearOf(date: DateInput, options: FiscalYearOptions = {}): number {
  const sm = startMonthOf(options);
  const start = fiscalStartYear(toPlainDate(date), sm);
  return sm === 1 || options.naming === 'start' ? start : start + 1;
}

/**
 * Fiscal quarter 1-4, counted from the fiscal start month.
 * @example fiscalQuarterOf('2026-09-29', { startMonth: 4 }) // => 2
 */
export function fiscalQuarterOf(date: DateInput, options: FiscalYearOptions = {}): 1 | 2 | 3 | 4 {
  const sm = startMonthOf(options);
  return (Math.floor(((toPlainDate(date).month - sm + 12) % 12) / 3) + 1) as 1 | 2 | 3 | 4;
}

/**
 * First day of the fiscal quarter containing `date`.
 * @example startOfFiscalQuarter('2026-09-29', { startMonth: 4 }) // => '2026-07-01'
 */
export function startOfFiscalQuarter(date: DateInput, options: FiscalYearOptions = {}): PlainDate {
  return addMonths(startOfFiscalYear(date, options), (fiscalQuarterOf(date, options) - 1) * 3);
}

/**
 * Last day of the fiscal quarter containing `date`.
 * @example endOfFiscalQuarter('2026-09-29', { startMonth: 4 }) // => '2026-09-30'
 */
export function endOfFiscalQuarter(date: DateInput, options: FiscalYearOptions = {}): PlainDate {
  return addDays(addMonths(startOfFiscalQuarter(date, options), 3), -1);
}

export interface FiscalLabelOptions extends FiscalYearOptions {
  /** Default `'FY'`. */
  readonly prefix?: string;
  /** `'year'` -> `FY2027` (default); `'span'` -> `FY2026-27` (start year, two-digit end year). */
  readonly style?: 'year' | 'span';
}

/**
 * Fiscal-year label such as `FY2027` or `FY2026-27`.
 * @example fiscalYearLabel('2026-09-29', { startMonth: 4 }) // => 'FY2027'
 */
export function fiscalYearLabel(date: DateInput, options: FiscalLabelOptions = {}): string {
  const prefix = options.prefix ?? 'FY';
  if (options.style === 'span') {
    const sm = startMonthOf(options);
    const start = fiscalStartYear(toPlainDate(date), sm);
    const end = sm === 1 ? start : start + 1;
    return end === start ? `${prefix}${String(start)}` : `${prefix}${String(start)}-${String(((end % 100) + 100) % 100).padStart(2, '0')}`;
  }
  return `${prefix}${String(fiscalYearOf(date, options))}`;
}

/**
 * Fiscal-quarter label `Q1`-`Q4`.
 * @example fiscalQuarterLabel('2026-09-29', { startMonth: 4 }) // => 'Q2'
 */
export function fiscalQuarterLabel(date: DateInput, options: FiscalYearOptions = {}): string {
  return `Q${String(fiscalQuarterOf(date, options))}`;
}

// ---------------------------------------------------------------------------
// Comparisons

/**
 * Same calendar day.
 * @example isSameDay('2026-01-01', plainDate(2026, 1, 1)) // => true
 */
export function isSameDay(a: DateInput, b: DateInput): boolean {
  return comparePlainDates(a, b) === 0;
}

/**
 * Same week (weeks start on `firstDayOfWeek`, default Monday).
 * @example isSameWeek('2026-09-28', '2026-10-04') // => true
 */
export function isSameWeek(a: DateInput, b: DateInput, options: WeekOptions = {}): boolean {
  return isSameDay(startOfWeek(a, options), startOfWeek(b, options));
}

/**
 * Same month of the same year.
 * @example isSameMonth('2026-09-01', '2026-09-30') // => true
 */
export function isSameMonth(a: DateInput, b: DateInput): boolean {
  const x = toPlainDate(a);
  const y = toPlainDate(b);
  return x.year === y.year && x.month === y.month;
}

/**
 * Same calendar quarter of the same year.
 * @example isSameQuarter('2026-07-01', '2026-09-30') // => true
 */
export function isSameQuarter(a: DateInput, b: DateInput): boolean {
  return toPlainDate(a).year === toPlainDate(b).year && quarterOf(a) === quarterOf(b);
}

/**
 * Same calendar year.
 * @example isSameYear('2026-01-01', '2026-12-31') // => true
 */
export function isSameYear(a: DateInput, b: DateInput): boolean {
  return toPlainDate(a).year === toPlainDate(b).year;
}

/**
 * `a` is strictly before `b`.
 * @example isBefore('2026-01-01', '2026-01-02') // => true
 */
export function isBefore(a: DateInput, b: DateInput): boolean {
  return comparePlainDates(a, b) < 0;
}

/**
 * `a` is strictly after `b`.
 * @example isAfter('2026-01-02', '2026-01-01') // => true
 */
export function isAfter(a: DateInput, b: DateInput): boolean {
  return comparePlainDates(a, b) > 0;
}

/** Which endpoints count as inside a range. */
export type Inclusivity = 'both' | 'none' | 'start' | 'end';

/**
 * `start <= date <= end` by default; `inclusive` controls the endpoints. Throws
 * `HLP_DATE_INVALID_INTERVAL` when `end` is before `start`.
 * @example isBetween('2026-01-31', '2026-01-01', '2026-01-31', { inclusive: 'start' }) // => false
 */
export function isBetween(date: DateInput, start: DateInput, end: DateInput, options: { readonly inclusive?: Inclusivity } = {}): boolean {
  const d = toEpochDay(toPlainDate(date));
  const s = toEpochDay(toPlainDate(start));
  const e = toEpochDay(toPlainDate(end));
  if (e < s) throw new ValidationError('HLP_DATE_INVALID_INTERVAL', 'Interval end is before its start.');
  const inc = options.inclusive ?? 'both';
  const afterStart = inc === 'both' || inc === 'start' ? d >= s : d > s;
  const beforeEnd = inc === 'both' || inc === 'end' ? d <= e : d < e;
  return afterStart && beforeEnd;
}

/**
 * `date` is today in `timeZone` (default: runtime zone).
 * @example isToday(today('Asia/Kolkata'), 'Asia/Kolkata') // => true
 */
export function isToday(date: DateInput, timeZone?: string): boolean {
  return isSameDay(date, today(timeZone));
}

/**
 * `date` is before today in `timeZone`.
 * @example isPast('2000-01-01') // => true
 */
export function isPast(date: DateInput, timeZone?: string): boolean {
  return isBefore(date, today(timeZone));
}

/**
 * `date` is after today in `timeZone`.
 * @example isFuture('2999-01-01') // => true
 */
export function isFuture(date: DateInput, timeZone?: string): boolean {
  return isAfter(date, today(timeZone));
}

/**
 * Earliest date, or `undefined` for none.
 * @example minDate(['2026-02-01', '2026-01-01']) // => '2026-01-01'
 */
export function minDate(dates: Iterable<DateInput>): PlainDate | undefined {
  let best: PlainDate | undefined;
  for (const x of dates) {
    const d = toPlainDate(x);
    if (!best || comparePlainDates(d, best) < 0) best = d;
  }
  return best;
}

/**
 * Latest date, or `undefined` for none.
 * @example maxDate(['2026-02-01', '2026-01-01']) // => '2026-02-01'
 */
export function maxDate(dates: Iterable<DateInput>): PlainDate | undefined {
  let best: PlainDate | undefined;
  for (const x of dates) {
    const d = toPlainDate(x);
    if (!best || comparePlainDates(d, best) > 0) best = d;
  }
  return best;
}

/**
 * Clamps `date` into the closed range `[start, end]`.
 * @example clampDate('2026-12-25', { start: '2026-01-01', end: '2026-06-30' }) // => '2026-06-30'
 */
export function clampDate(date: DateInput, range: { readonly start: DateInput; readonly end: DateInput }): PlainDate {
  const s = toPlainDate(range.start);
  const e = toPlainDate(range.end);
  if (comparePlainDates(e, s) < 0) throw new ValidationError('HLP_DATE_INVALID_INTERVAL', 'Interval end is before its start.');
  const d = toPlainDate(date);
  return comparePlainDates(d, s) < 0 ? s : comparePlainDates(d, e) > 0 ? e : d;
}

/**
 * Candidate closest to `date` (ties: the first such candidate), or `undefined` for none.
 * @example closestTo('2026-01-10', ['2026-01-01', '2026-01-12']) // => '2026-01-12'
 */
export function closestTo(date: DateInput, candidates: Iterable<DateInput>): PlainDate | undefined {
  const target = toEpochDay(toPlainDate(date));
  let best: PlainDate | undefined;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = toPlainDate(c);
    const dist = Math.abs(toEpochDay(d) - target);
    if (dist < bestDistance) {
      best = d;
      bestDistance = dist;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Differences. Argument order follows date-fns: `differenceInX(later, earlier)` is positive
// when the first argument is later. Month/quarter/year counts are complete units consistent
// with `addMonths` clamping: the largest n with addMonths(earlier, n) <= later.

/**
 * Calendar days from `earlier` to `later` (negative when `later` is earlier).
 * @example differenceInDays('2026-03-01', '2026-02-01') // => 28
 */
export function differenceInDays(later: DateInput, earlier: DateInput): number {
  return daysBetween(earlier, later);
}

/**
 * Complete weeks (truncated toward zero).
 * @example differenceInWeeks('2026-01-15', '2026-01-01') // => 2
 */
export function differenceInWeeks(later: DateInput, earlier: DateInput): number {
  return Math.trunc(differenceInDays(later, earlier) / 7) + 0;
}

function completeMonths(from: PlainDate, to: PlainDate): number {
  // Precondition: from <= to.
  let months = (to.year - from.year) * 12 + (to.month - from.month);
  if (Math.min(from.day, daysInMonth(to.year, to.month)) > to.day) months -= 1;
  return months;
}

function signedMonths(later: DateInput, earlier: DateInput): number {
  const l = toPlainDate(later);
  const e = toPlainDate(earlier);
  return comparePlainDates(l, e) >= 0 ? completeMonths(e, l) : 0 - completeMonths(l, e);
}

/**
 * Complete calendar months, month-end aware (Jan 31 -> Feb 28 is one month).
 * @example differenceInMonths('2026-02-28', '2026-01-31') // => 1
 */
export function differenceInMonths(later: DateInput, earlier: DateInput): number {
  return signedMonths(later, earlier);
}

/**
 * Complete quarters (3 months).
 * @example differenceInQuarters('2026-12-31', '2026-01-01') // => 3
 */
export function differenceInQuarters(later: DateInput, earlier: DateInput): number {
  return Math.trunc(signedMonths(later, earlier) / 3) + 0;
}

/**
 * Complete years (Feb 29 -> Feb 28 of a common year counts as a year, like `addYears`).
 * @example differenceInYears('2026-09-28', '2000-09-29') // => 25
 */
export function differenceInYears(later: DateInput, earlier: DateInput): number {
  return Math.trunc(signedMonths(later, earlier) / 12) + 0;
}

/** Age-style breakdown returned by `dateDiff`. */
export interface DateDiff {
  readonly years: number;
  readonly months: number;
  readonly days: number;
}

/**
 * Years, months, and days from `from` to `to` such that
 * `addDays(addMonths(from, years * 12 + months), days)` equals `to`. When `to` is earlier,
 * every field is the negation of `dateDiff(to, from)`.
 * @example dateDiff('2024-01-31', '2024-03-01') // => { years: 0, months: 1, days: 1 }
 */
export function dateDiff(from: DateInput, to: DateInput): DateDiff {
  const a = toPlainDate(from);
  const b = toPlainDate(to);
  if (comparePlainDates(b, a) < 0) {
    const r = dateDiff(b, a);
    return Object.freeze({ years: 0 - r.years, months: 0 - r.months, days: 0 - r.days });
  }
  const months = completeMonths(a, b);
  return Object.freeze({ years: Math.floor(months / 12), months: months % 12, days: daysBetween(addMonths(a, months), b) });
}

export interface AgeOptions {
  /**
   * When a Feb 29 birthday is reached in a common year. `'feb28'` (default, consistent with
   * `addYears` clamping) or `'mar1'` (legal convention in, for example, England and Wales and Hong Kong).
   */
  readonly leapDayBirthday?: 'feb28' | 'mar1';
}

/**
 * Age in whole years on `asOf` (default: today in the runtime zone). Throws
 * `HLP_DATE_AGE_BEFORE_BIRTH` when `asOf` precedes `birthDate`.
 * @example age('2000-02-29', '2025-02-28') // => 25 // 'mar1' → 24
 */
export function age(birthDate: DateInput, asOf: DateInput = today(), options: AgeOptions = {}): number {
  const b = toPlainDate(birthDate);
  const on = toPlainDate(asOf);
  if (comparePlainDates(on, b) < 0) throw new ValidationError('HLP_DATE_AGE_BEFORE_BIRTH', 'The reference date is before the birth date.');
  let bd = b.day;
  if (b.month === 2 && b.day === 29 && !isLeapYear(on.year) && (options.leapDayBirthday ?? 'feb28') === 'feb28') bd = 28;
  let years = on.year - b.year;
  if (on.month < b.month || (on.month === b.month && on.day < bd)) years -= 1;
  return years;
}

// ---------------------------------------------------------------------------
// Week numbering and ordinal positions

export interface WeekNumberingOptions extends WeekOptions {
  /** Days of the new year the first week must contain, 1-7. Default 4 (ISO 8601). */
  readonly minimalDays?: number;
}

function week1Start(year: number, first: IsoWeekday, minimalDays: number): number {
  return toEpochDay(startOfWeek(plainDate(year, 1, minimalDays), { firstDayOfWeek: first }));
}

function numberingOf(options: WeekNumberingOptions): [IsoWeekday, number] {
  const first = fdw(options);
  const md = options.minimalDays ?? 4;
  if (!Number.isInteger(md) || md < 1 || md > 7) throw new ValidationError('HLP_DATE_INVALID_MINIMAL_DAYS', 'minimalDays must be an integer 1 to 7.');
  return [first, md];
}

/**
 * Week number and week-year under any week rule (default ISO: Monday, 4 minimal days; US: `{ firstDayOfWeek: 7, minimalDays: 1 }`).
 * @example weekOfYear('2027-01-01') // => { week: 53, year: 2026 }
 */
export function weekOfYear(date: DateInput, options: WeekNumberingOptions = {}): { readonly week: number; readonly year: number } {
  const [first, md] = numberingOf(options);
  const d = toPlainDate(date);
  const e = toEpochDay(d);
  let year = d.year;
  let start = week1Start(year, first, md);
  if (e < start) {
    year -= 1;
    start = week1Start(year, first, md);
  } else {
    const next = week1Start(year + 1, first, md);
    if (e >= next) {
      year += 1;
      start = next;
    }
  }
  return Object.freeze({ week: Math.floor((e - start) / 7) + 1, year });
}

/**
 * Number of weeks (52 or 53) in a week-year under a week rule.
 * @example weeksInWeekYear(2026) // => 53
 */
export function weeksInWeekYear(year: number, options: WeekNumberingOptions = {}): number {
  const [first, md] = numberingOf(options);
  return (week1Start(year + 1, first, md) - week1Start(year, first, md)) / 7;
}

/**
 * ISO 8601 week number (1-53).
 * @example isoWeek('2026-09-29') // => 40
 */
export function isoWeek(date: DateInput): number {
  return weekOfYear(date).week;
}

/**
 * ISO 8601 week-numbering year (differs from the calendar year around January 1).
 * @example isoWeekYear('2027-01-01') // => 2026
 */
export function isoWeekYear(date: DateInput): number {
  return weekOfYear(date).year;
}

/**
 * ISO weeks in a year (53 when January 1 is a Thursday, or a Wednesday in a leap year).
 * @example isoWeeksInYear(2026) // => 53
 */
export function isoWeeksInYear(year: number): number {
  return weeksInWeekYear(year);
}

/**
 * 1-based row of `date` in its month's calendar (weeks start on `firstDayOfWeek`).
 * @example weekOfMonth('2026-09-29') // => 5
 */
export function weekOfMonth(date: DateInput, options: WeekOptions = {}): number {
  const first = fdw(options);
  const d = toPlainDate(date);
  const lead = (isoWeekday(plainDate(d.year, d.month, 1)) - first + 7) % 7;
  return Math.floor((d.day - 1 + lead) / 7) + 1;
}

/**
 * Day of the year, 1-366.
 * @example dayOfYear('2026-02-01') // => 32
 */
export function dayOfYear(date: DateInput): number {
  const d = toPlainDate(date);
  return toEpochDay(d) - toEpochDay(plainDate(d.year, 1, 1)) + 1;
}
