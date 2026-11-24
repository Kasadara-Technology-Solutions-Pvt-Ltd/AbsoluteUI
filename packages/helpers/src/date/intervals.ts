/**
 * Closed date intervals (both endpoints are days inside the interval), lazy day/week/month/year
 * iteration with count limits, and the month calendar grid.
 */
import { LimitError, ValidationError } from '../error/index.js';
import { startOfWeek, type WeekOptions } from './calendar.js';
import { comparePlainDates, daysInMonth, fromEpochDay, isoWeekday, plainDate, toEpochDay, toPlainDate, type DateInput, type IsoWeekday, type PlainDate } from './plain-date.js';

/** Closed date interval: `start` and `end` are both included. */
export interface DateInterval {
  readonly start: PlainDate;
  readonly end: PlainDate;
}

/** Interval input: dates as `PlainDate` or `'YYYY-MM-DD'`. */
export interface DateIntervalInput {
  readonly start: DateInput;
  readonly end: DateInput;
}

/**
 * Creates a validated, frozen closed interval; throws `HLP_DATE_INVALID_INTERVAL` when `end < start`.
 * @example dateInterval('2026-01-01', '2026-01-31')
 */
export function dateInterval(start: DateInput, end: DateInput): DateInterval {
  const s = toPlainDate(start);
  const e = toPlainDate(end);
  if (comparePlainDates(e, s) < 0) throw new ValidationError('HLP_DATE_INVALID_INTERVAL', 'Interval end is before its start.');
  return Object.freeze({ start: s, end: e });
}

const norm = (i: DateIntervalInput): DateInterval => dateInterval(i.start, i.end);

/**
 * Days in the interval, counting both endpoints.
 * @example intervalLengthDays({ start: '2026-01-01', end: '2026-01-31' }) // => 31
 */
export function intervalLengthDays(interval: DateIntervalInput): number {
  const i = norm(interval);
  return toEpochDay(i.end) - toEpochDay(i.start) + 1;
}

/**
 * True when `date` lies inside the closed interval.
 * @example containsDate({ start: '2026-01-01', end: '2026-01-31' }, '2026-01-31') // => true
 */
export function containsDate(interval: DateIntervalInput, date: DateInput): boolean {
  const i = norm(interval);
  return comparePlainDates(date, i.start) >= 0 && comparePlainDates(date, i.end) <= 0;
}

/**
 * True when two closed intervals share at least one day. With `inclusive: false`, intervals that
 * only touch at an endpoint (`a.end === b.start`) do not count.
 * @example intervalsOverlap({ start: '2026-01-01', end: '2026-01-05' }, { start: '2026-01-05', end: '2026-01-09' }) // => true
 */
export function intervalsOverlap(a: DateIntervalInput, b: DateIntervalInput, options: { readonly inclusive?: boolean } = {}): boolean {
  const x = norm(a);
  const y = norm(b);
  if (options.inclusive ?? true) return comparePlainDates(x.start, y.end) <= 0 && comparePlainDates(y.start, x.end) <= 0;
  return comparePlainDates(x.start, y.end) < 0 && comparePlainDates(y.start, x.end) < 0;
}

/**
 * Shared days of two intervals, or `undefined` when they are disjoint.
 * @example intervalIntersection({ start: '2026-01-01', end: '2026-01-10' }, { start: '2026-01-05', end: '2026-02-01' }) // => { start: '2026-01-05', end: '2026-01-10' }
 * @example intervalIntersection({ start: '2026-01-01', end: '2026-01-04' }, { start: '2026-01-05', end: '2026-01-06' }) // => undefined
 */
export function intervalIntersection(a: DateIntervalInput, b: DateIntervalInput): DateInterval | undefined {
  const x = norm(a);
  const y = norm(b);
  const start = comparePlainDates(x.start, y.start) >= 0 ? x.start : y.start;
  const end = comparePlainDates(x.end, y.end) <= 0 ? x.end : y.end;
  return comparePlainDates(start, end) <= 0 ? Object.freeze({ start, end }) : undefined;
}

/**
 * Sorts and merges overlapping intervals in O(n log n). Adjacent intervals (one ends the day
 * before the next starts) merge too unless `mergeAdjacent: false`.
 * @example
 * const leave = [{ start: '2026-01-01', end: '2026-01-03' }, { start: '2026-01-04', end: '2026-01-06' }];
 * mergeIntervals(leave); // => [{ start: '2026-01-01', end: '2026-01-06' }]
 * mergeIntervals(leave, { mergeAdjacent: false }).length; // => 2
 */
export function mergeIntervals(intervals: Iterable<DateIntervalInput>, options: { readonly mergeAdjacent?: boolean } = {}): DateInterval[] {
  const gap = (options.mergeAdjacent ?? true) ? 1 : 0;
  const list = Array.from(intervals, (i) => {
    const n = norm(i);
    return [toEpochDay(n.start), toEpochDay(n.end)] as [number, number];
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const cur of list) {
    const last = out[out.length - 1];
    if (last && cur[0] <= last[1] + gap) last[1] = Math.max(last[1], cur[1]);
    else out.push([cur[0], cur[1]]);
  }
  return out.map(([s, e]) => Object.freeze({ start: fromEpochDay(s), end: fromEpochDay(e) }));
}

/**
 * Uncovered sub-intervals of `within` (days not in any of `intervals`), ascending.
 * @example
 * const booked = [{ start: '2026-01-03', end: '2026-01-04' }];
 * intervalGaps(booked, { start: '2026-01-01', end: '2026-01-06' }); // => [{ start: '2026-01-01', end: '2026-01-02' }, { start: '2026-01-05', end: '2026-01-06' }]
 */
export function intervalGaps(intervals: Iterable<DateIntervalInput>, within: DateIntervalInput): DateInterval[] {
  const w = norm(within);
  const ws = toEpochDay(w.start);
  const we = toEpochDay(w.end);
  const out: DateInterval[] = [];
  let cursor = ws;
  for (const m of mergeIntervals(intervals)) {
    const s = toEpochDay(m.start);
    const e = toEpochDay(m.end);
    if (e < cursor) continue;
    if (s > we) break;
    if (s > cursor) out.push(Object.freeze({ start: fromEpochDay(cursor), end: fromEpochDay(Math.min(s - 1, we)) }));
    cursor = Math.max(cursor, e + 1);
    if (cursor > we) break;
  }
  if (cursor <= we) out.push(Object.freeze({ start: fromEpochDay(cursor), end: w.end }));
  return out;
}

// ---------------------------------------------------------------------------
// Iteration

export interface IterateOptions {
  /** Maximum number of items; exceeding it throws `HLP_DATE_TOO_MANY_ITEMS` before iteration starts. Default 100000. */
  readonly limit?: number;
}

function checkLimit(count: number, options: IterateOptions): void {
  const limit = options.limit ?? 100_000;
  if (!Number.isInteger(limit) || limit < 0) throw new ValidationError('HLP_DATE_INVALID_LIMIT', 'limit must be a non-negative integer.');
  if (count > limit) throw new LimitError('HLP_DATE_TOO_MANY_ITEMS', 'The interval yields more items than the limit allows.', { details: { limit } });
}

function* epochDays(start: number, count: number, step: number): Generator<PlainDate, void, undefined> {
  for (let i = 0; i < count; i++) yield fromEpochDay(start + i * step);
}

/**
 * Lazily yields every `step`-th day of the interval (both endpoints included).
 * @example [...eachDayOfInterval({ start: '2026-01-30', end: '2026-02-02' })].length // => 4
 */
export function eachDayOfInterval(interval: DateIntervalInput, options: IterateOptions & { readonly step?: number } = {}): Generator<PlainDate, void, undefined> {
  const i = norm(interval);
  const step = options.step ?? 1;
  if (!Number.isSafeInteger(step) || step < 1) throw new ValidationError('HLP_DATE_INVALID_STEP', 'step must be a positive integer.');
  const s = toEpochDay(i.start);
  const count = Math.floor((toEpochDay(i.end) - s) / step) + 1;
  checkLimit(count, options);
  return epochDays(s, count, step);
}

/**
 * Lazily yields the first day of every week that overlaps the interval (the first item may precede `start`).
 * @example [...eachWeekOfInterval({ start: '2026-09-30', end: '2026-10-12' })] // => ['2026-09-28', '2026-10-05', '2026-10-12'] // Mondays
 */
export function eachWeekOfInterval(interval: DateIntervalInput, options: IterateOptions & WeekOptions = {}): Generator<PlainDate, void, undefined> {
  const i = norm(interval);
  const s = toEpochDay(startOfWeek(i.start, options));
  const count = Math.floor((toEpochDay(i.end) - s) / 7) + 1;
  checkLimit(count, options);
  return epochDays(s, count, 7);
}

function* monthStarts(year: number, month: number, count: number, stepMonths: number): Generator<PlainDate, void, undefined> {
  const base = year * 12 + month - 1;
  for (let i = 0; i < count; i++) {
    const total = base + i * stepMonths;
    const y = Math.floor(total / 12);
    yield plainDate(y, total - y * 12 + 1, 1);
  }
}

/**
 * Lazily yields the first day of every month that overlaps the interval.
 * @example [...eachMonthOfInterval({ start: '2026-01-15', end: '2026-03-01' })] // => ['2026-01-01', '2026-02-01', '2026-03-01']
 */
export function eachMonthOfInterval(interval: DateIntervalInput, options: IterateOptions = {}): Generator<PlainDate, void, undefined> {
  const i = norm(interval);
  const count = (i.end.year - i.start.year) * 12 + (i.end.month - i.start.month) + 1;
  checkLimit(count, options);
  return monthStarts(i.start.year, i.start.month, count, 1);
}

/**
 * Lazily yields January 1 of every year that overlaps the interval.
 * @example [...eachYearOfInterval({ start: '2025-06-01', end: '2026-01-01' })] // => ['2025-01-01', '2026-01-01']
 */
export function eachYearOfInterval(interval: DateIntervalInput, options: IterateOptions = {}): Generator<PlainDate, void, undefined> {
  const i = norm(interval);
  const count = i.end.year - i.start.year + 1;
  checkLimit(count, options);
  return monthStarts(i.start.year, 1, count, 12);
}

// ---------------------------------------------------------------------------
// Month grid

/** One cell of `calendarMonthGrid`. */
export interface CalendarDay {
  readonly date: PlainDate;
  /** False for leading/trailing days from the adjacent months. */
  readonly inMonth: boolean;
  /** True when `date` equals the `today` option (always false when it is omitted). */
  readonly isToday: boolean;
  readonly weekday: IsoWeekday;
}

export interface CalendarGridOptions extends WeekOptions {
  /** Always return 6 weeks so the grid height never changes. Default true. */
  readonly fixedWeeks?: boolean;
  /** Marks this date with `isToday`. The function stays pure: nothing reads the clock. */
  readonly today?: DateInput;
}

/**
 * Weeks (rows of 7 days) covering a month, including adjacent-month days to fill the rows.
 * @example
 * const grid = calendarMonthGrid(2026, 9, { firstDayOfWeek: 7 }); // Sunday-first
 * grid[0]?.[0]?.date; // => '2026-08-30'
 * grid[0]?.[0]?.inMonth; // => false
 * grid.length; // => 6 // fixed height by default
 * calendarMonthGrid(2026, 9, { firstDayOfWeek: 7, fixedWeeks: false }).length; // => 5
 */
export function calendarMonthGrid(year: number, month: number, options: CalendarGridOptions = {}): CalendarDay[][] {
  const first = plainDate(year, month, 1);
  const start = toEpochDay(startOfWeek(first, options));
  const lastDay = toEpochDay(first) + daysInMonth(year, month) - 1;
  const weeks = (options.fixedWeeks ?? true) ? 6 : Math.floor((lastDay - start) / 7) + 1;
  const todayDay = options.today === undefined ? undefined : toEpochDay(toPlainDate(options.today));
  const rows: CalendarDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const e = start + w * 7 + d;
      const date = fromEpochDay(e);
      row.push(Object.freeze({ date, inMonth: date.month === month && date.year === year, isToday: e === todayDay, weekday: isoWeekday(date) }));
    }
    rows.push(row);
  }
  return rows;
}
