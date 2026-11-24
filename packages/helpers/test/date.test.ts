import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LimitError, ValidationError } from '@absoluteui/helpers/error';
import {
  addDays, addMonths, addQuarters, addWeeks, addYears, age, calendarMonthGrid, clampDate, closestTo, comparePlainDateTimes, containsDate,
  dateDiff, dateInterval, dayOfYear, differenceInDays, differenceInMonths, differenceInQuarters, differenceInWeeks, differenceInYears,
  eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval, eachYearOfInterval, endOfDayInstant, endOfFiscalQuarter, endOfFiscalYear,
  endOfMonth, endOfQuarter, endOfWeek, endOfYear, fiscalQuarterLabel, fiscalQuarterOf, fiscalYearLabel, fiscalYearOf, formatDate,
  formatDateIntl, formatDateRange, formatInstant, formatPlainDate, formatPlainDateTime, formatPlainTime, formatRelative, formatRelativeDate,
  fromEpochDay, getWeekInfo, intervalGaps, intervalIntersection, intervalLengthDays, intervalsOverlap, isAfter, isBefore, isBetween, isFuture,
  isoWeek, isoWeekYear, isoWeeksInYear, isPast, isPlainDateTime, isPlainTime, isSameDay, isSameMonth, isSameQuarter, isSameWeek, isSameYear,
  isToday, maxDate, mergeIntervals, minDate, monthName, monthNames, parseDate, parseDateTime, parseInstant, parseIsoDateTime, parsePlainDate,
  parsePlainDateTime, parsePlainTime, plainDate, plainDateTime, plainTime, quarterOf, startOfDayInstant, startOfFiscalQuarter, startOfFiscalYear,
  startOfMonth, startOfQuarter, startOfWeek, startOfYear, subDays, subMonths, subQuarters, subWeeks, subYears, timeFromMilliseconds,
  toEpochDay, today, toPlainDateTime, weekdayName, weekdayNames, weekOfMonth, weekOfYear, weeksInWeekYear, type PlainDate,
} from '@absoluteui/helpers/date';

// Native Temporal (current Chromium) as an oracle; tests using it are skipped when absent.
interface TemporalPlainDate {
  readonly weekOfYear: number | undefined;
  readonly yearOfWeek: number | undefined;
  readonly dayOfYear: number;
  add(d: Readonly<Record<string, number>>): { toString(): string };
  toZonedDateTime(o: { timeZone: string }): { readonly epochMilliseconds: number };
}
interface TemporalApi {
  PlainDate: { from(text: string): TemporalPlainDate };
}
const Temporal = (globalThis as { Temporal?: TemporalApi }).Temporal;
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a value.');
  return value;
}

const iso = (d: PlainDate): string => formatPlainDate(d);
const arbDate = fc.integer({ min: -80_000, max: 80_000 }).map((n) => fromEpochDay(n));
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

describe('plain time and date-time', () => {
  it('constructs, guards, and freezes', () => {
    const t = plainTime(9, 5, 7, 42);
    expect(Object.isFrozen(t)).toBe(true);
    expect(isPlainTime(t)).toBe(true);
    expect(isPlainTime({ kind: 'PlainTime', hour: 24, minute: 0, second: 0, millisecond: 0 })).toBe(false);
    expect(() => plainTime(24)).toThrow(ValidationError);
    expect(() => plainTime(1, 60)).toThrow(ValidationError);
    expect(() => plainTime(1.5)).toThrow(ValidationError);
    const dt = plainDateTime('2026-03-08', t);
    expect(isPlainDateTime(dt)).toBe(true);
    expect(isPlainDateTime({ kind: 'PlainDateTime', date: { kind: 'PlainDate', year: 2026, month: 2, day: 30 }, time: t })).toBe(false);
    expect(formatPlainTime(t)).toBe('09:05:07.042');
    expect(formatPlainTime(plainTime(0))).toBe('00:00:00');
    expect(formatPlainDateTime(dt)).toBe('2026-03-08T09:05:07.042');
    expect(timeFromMilliseconds(-1)).toEqual(plainTime(23, 59, 59, 999));
    expect(comparePlainDateTimes(dt, plainDateTime('2026-03-08'))).toBe(1);
  });

  it('parses ISO strictly', () => {
    expect(parsePlainTime('09:30')).toEqual(plainTime(9, 30));
    expect(parsePlainTime('09:30:15.5')).toEqual(plainTime(9, 30, 15, 500));
    for (const bad of ['24:00', '9:30', '09:60', '09:30:60', '09:30:00.1234', '09:30Z', ' 09:30', '']) expect(parsePlainTime(bad)).toBeUndefined();
    expect(parsePlainDateTime('2026-03-08T02:30')).toEqual(plainDateTime('2026-03-08', plainTime(2, 30)));
    expect(parsePlainDateTime('2026-03-08T02:30Z')).toBeUndefined();
    expect(parseIsoDateTime('2026-03-08T02:30:00-05:00')?.offset).toBe(-18_000_000);
    expect(parseIsoDateTime('+012026-03-08T02:30:00Z')?.dateTime.date.year).toBe(12026);
    for (const bad of ['2026-03-08 02:30', '2026-03-08t02:30', '2026-02-29T00:00', '2026-03-08T02:30+24:00', '2026-03-08T02:30+0500', '2026-03-08T', '2026-03-08']) expect(parseIsoDateTime(bad)).toBeUndefined();
    expect(parseInstant('2026-03-08T07:00:00Z')).toBe(Date.UTC(2026, 2, 8, 7));
    expect(parseInstant('2026-03-08T12:30:00+05:30')).toBe(Date.UTC(2026, 2, 8, 7));
    expect(parseInstant('2026-03-08T07:00:00')).toBeUndefined();
    expect(formatInstant(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(() => formatInstant(Number.NaN)).toThrow(ValidationError);
  });

  it('round-trips ISO date-times', () => {
    fc.assert(fc.property(arbDate, fc.integer({ min: 0, max: 86_399_999 }), (d, ms) => {
      const dt = plainDateTime(d, timeFromMilliseconds(ms));
      expect(parsePlainDateTime(formatPlainDateTime(dt))).toEqual(dt);
      expect(parsePlainDate(formatPlainDate(d))).toEqual(d);
    }));
  });

  it('rejects oversized input in linear time', () => {
    const long = `2026-01-01T${'0'.repeat(100_000)}`;
    const t0 = performance.now();
    expect(parseIsoDateTime(long)).toBeUndefined();
    expect(parsePlainTime('1'.repeat(100_000))).toBeUndefined();
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe('arithmetic', () => {
  it('adds with month-end clamping', () => {
    expect(addMonths('2026-01-31', 1)).toEqual(plainDate(2026, 2, 28));
    expect(addMonths('2024-01-31', 1)).toEqual(plainDate(2024, 2, 29));
    expect(addMonths('2026-03-31', -1)).toEqual(plainDate(2026, 2, 28));
    expect(addMonths('2026-12-15', 1)).toEqual(plainDate(2027, 1, 15));
    expect(addQuarters('2026-11-30', 1)).toEqual(plainDate(2027, 2, 28));
    expect(addYears('2024-02-29', 1)).toEqual(plainDate(2025, 2, 28));
    expect(addWeeks('2026-01-01', 2)).toEqual(plainDate(2026, 1, 15));
    expect(subDays('2026-03-01', 1)).toEqual(plainDate(2026, 2, 28));
    expect(subWeeks('2026-01-15', 2)).toEqual(plainDate(2026, 1, 1));
    expect(subMonths('2026-03-31', 1)).toEqual(plainDate(2026, 2, 28));
    expect(subQuarters('2026-05-31', 1)).toEqual(plainDate(2026, 2, 28));
    expect(subYears('2028-02-29', 1)).toEqual(plainDate(2027, 2, 28));
    expect(code(() => addMonths('2026-01-01', 1.5))).toBe('HLP_DATE_OUT_OF_RANGE');
    expect(code(() => addYears('2026-01-01', 300_000))).toBe('HLP_DATE_OUT_OF_RANGE');
    expect(code(() => addMonths('2026-13-01', 1))).toBe('HLP_INVALID_DATE');
  });

  it('matches Temporal month/year addition (constrain)', () => {
    if (!Temporal) return;
    fc.assert(fc.property(arbDate, fc.integer({ min: -1200, max: 1200 }), (d, n) => {
      if (d.year < 1 || d.year > 9000) return;
      expect(iso(addMonths(d, n))).toBe(Temporal.PlainDate.from(iso(d)).add({ months: n }).toString());
    }));
  });

  it('computes boundaries', () => {
    expect(startOfWeek('2026-09-30')).toEqual(plainDate(2026, 9, 28));
    expect(startOfWeek('2026-09-30', { firstDayOfWeek: 7 })).toEqual(plainDate(2026, 9, 27));
    expect(startOfWeek('2026-09-26', { firstDayOfWeek: 6 })).toEqual(plainDate(2026, 9, 26));
    expect(endOfWeek('2026-09-30')).toEqual(plainDate(2026, 10, 4));
    expect(code(() => startOfWeek('2026-09-30', { firstDayOfWeek: 0 as 1 }))).toBe('HLP_DATE_INVALID_WEEKDAY');
    expect(startOfMonth('2026-09-29')).toEqual(plainDate(2026, 9, 1));
    expect(endOfMonth('2024-02-10')).toEqual(plainDate(2024, 2, 29));
    expect(startOfQuarter('2026-09-29')).toEqual(plainDate(2026, 7, 1));
    expect(endOfQuarter('2026-11-02')).toEqual(plainDate(2026, 12, 31));
    expect(startOfYear('2026-09-29')).toEqual(plainDate(2026, 1, 1));
    expect(endOfYear('2026-09-29')).toEqual(plainDate(2026, 12, 31));
    expect(quarterOf('2026-01-01')).toBe(1);
    expect(quarterOf('2026-12-31')).toBe(4);
  });

  it('computes fiscal periods', () => {
    const india = { startMonth: 4 };
    expect(startOfFiscalYear('2026-09-29', india)).toEqual(plainDate(2026, 4, 1));
    expect(endOfFiscalYear('2026-09-29', india)).toEqual(plainDate(2027, 3, 31));
    expect(fiscalYearOf('2026-09-29', india)).toBe(2027);
    expect(fiscalYearOf('2026-09-29', { ...india, naming: 'start' })).toBe(2026);
    expect(fiscalYearOf('2026-03-31', india)).toBe(2026);
    expect(fiscalQuarterOf('2026-09-29', india)).toBe(2);
    expect(fiscalQuarterOf('2027-01-15', india)).toBe(4);
    expect(startOfFiscalQuarter('2026-09-29', india)).toEqual(plainDate(2026, 7, 1));
    expect(endOfFiscalQuarter('2026-09-29', india)).toEqual(plainDate(2026, 9, 30));
    expect(fiscalYearLabel('2026-09-29', india)).toBe('FY2027');
    expect(fiscalYearLabel('2026-09-29', { ...india, style: 'span' })).toBe('FY2026-27');
    expect(fiscalYearLabel('2026-09-29', { style: 'span' })).toBe('FY2026');
    expect(fiscalQuarterLabel('2026-09-29', india)).toBe('Q2');
    const us = { startMonth: 10 };
    expect(fiscalYearOf('2026-09-30', us)).toBe(2026);
    expect(fiscalYearOf('2026-10-01', us)).toBe(2027);
    expect(fiscalQuarterOf('2026-10-01', us)).toBe(1);
    expect(fiscalYearOf('2026-06-01')).toBe(2026);
    expect(code(() => fiscalYearOf('2026-06-01', { startMonth: 13 }))).toBe('HLP_DATE_INVALID_MONTH');
  });

  it('compares', () => {
    expect(isSameDay('2026-01-01', plainDate(2026, 1, 1))).toBe(true);
    expect(isSameWeek('2026-09-28', '2026-10-04')).toBe(true);
    expect(isSameWeek('2026-09-27', '2026-09-28')).toBe(false);
    expect(isSameWeek('2026-09-27', '2026-09-28', { firstDayOfWeek: 7 })).toBe(true);
    expect(isSameMonth('2026-09-01', '2026-09-30')).toBe(true);
    expect(isSameMonth('2025-09-01', '2026-09-30')).toBe(false);
    expect(isSameQuarter('2026-07-01', '2026-09-30')).toBe(true);
    expect(isSameYear('2026-01-01', '2026-12-31')).toBe(true);
    expect(isBefore('2026-01-01', '2026-01-02')).toBe(true);
    expect(isAfter('2026-01-01', '2026-01-02')).toBe(false);
    expect(isBetween('2026-01-31', '2026-01-01', '2026-01-31')).toBe(true);
    expect(isBetween('2026-01-31', '2026-01-01', '2026-01-31', { inclusive: 'start' })).toBe(false);
    expect(isBetween('2026-01-01', '2026-01-01', '2026-01-31', { inclusive: 'none' })).toBe(false);
    expect(isBetween('2026-01-31', '2026-01-01', '2026-01-31', { inclusive: 'end' })).toBe(true);
    expect(code(() => isBetween('2026-01-01', '2026-02-01', '2026-01-01'))).toBe('HLP_DATE_INVALID_INTERVAL');
    expect(isToday(today('Asia/Kolkata'), 'Asia/Kolkata')).toBe(true);
    expect(isPast('2000-01-01')).toBe(true);
    expect(isFuture('2999-01-01')).toBe(true);
    expect(isFuture(today())).toBe(false);
    expect(minDate(['2026-02-01', '2026-01-01'])).toEqual(plainDate(2026, 1, 1));
    expect(maxDate(['2026-02-01', '2026-01-01'])).toEqual(plainDate(2026, 2, 1));
    expect(minDate([])).toBeUndefined();
    expect(clampDate('2026-12-25', { start: '2026-01-01', end: '2026-06-30' })).toEqual(plainDate(2026, 6, 30));
    expect(clampDate('2025-12-25', { start: '2026-01-01', end: '2026-06-30' })).toEqual(plainDate(2026, 1, 1));
    expect(closestTo('2026-01-10', ['2026-01-01', '2026-01-12'])).toEqual(plainDate(2026, 1, 12));
    expect(closestTo('2026-01-10', ['2026-01-08', '2026-01-12'])).toEqual(plainDate(2026, 1, 8));
    expect(closestTo('2026-01-10', [])).toBeUndefined();
  });
});

describe('differences', () => {
  it('counts calendar-accurate whole units', () => {
    expect(differenceInDays('2026-03-01', '2026-02-01')).toBe(28);
    expect(differenceInWeeks('2026-01-15', '2026-01-01')).toBe(2);
    expect(differenceInWeeks('2026-01-01', '2026-01-14')).toBe(-1);
    expect(differenceInMonths('2026-02-28', '2026-01-31')).toBe(1);
    expect(differenceInMonths('2026-02-27', '2026-01-31')).toBe(0);
    expect(differenceInMonths('2026-01-31', '2026-02-28')).toBe(-1);
    expect(differenceInMonths('2026-03-30', '2026-01-31')).toBe(1);
    expect(differenceInMonths('2026-03-31', '2026-01-31')).toBe(2);
    expect(differenceInQuarters('2026-12-31', '2026-01-01')).toBe(3);
    expect(differenceInYears('2026-09-28', '2000-09-29')).toBe(25);
    expect(differenceInYears('2025-02-28', '2024-02-29')).toBe(1);
    expect(Object.is(differenceInYears('2026-01-02', '2026-01-01'), 0)).toBe(true);
  });

  it('addMonths then differenceInMonths is the identity', () => {
    fc.assert(fc.property(arbDate, fc.integer({ min: -2400, max: 2400 }), (d, n) => {
      expect(differenceInMonths(addMonths(d, n), d)).toBe(n);
      expect(differenceInYears(addYears(d, Math.trunc(n / 12)), d)).toBe(Math.trunc(n / 12) + 0);
    }));
  });

  it('dateDiff reconstructs the later date', () => {
    expect(dateDiff('2024-01-31', '2024-03-01')).toEqual({ years: 0, months: 1, days: 1 });
    expect(dateDiff('2024-03-01', '2024-01-31')).toEqual({ years: 0, months: -1, days: -1 });
    expect(dateDiff('2000-02-29', '2026-09-29')).toEqual({ years: 26, months: 7, days: 0 });
    fc.assert(fc.property(arbDate, arbDate, (a, b) => {
      const [from, to] = toEpochDay(a) <= toEpochDay(b) ? [a, b] : [b, a];
      const r = dateDiff(from, to);
      expect(r.months).toBeGreaterThanOrEqual(0);
      expect(r.months).toBeLessThan(12);
      expect(r.days).toBeGreaterThanOrEqual(0);
      expect(r.days).toBeLessThan(31);
      expect(addDays(addMonths(from, r.years * 12 + r.months), r.days)).toEqual(to);
    }));
  });

  it('computes age with documented leap-day handling', () => {
    expect(age('2000-02-29', '2025-02-28')).toBe(25);
    expect(age('2000-02-29', '2025-02-28', { leapDayBirthday: 'mar1' })).toBe(24);
    expect(age('2000-02-29', '2025-03-01', { leapDayBirthday: 'mar1' })).toBe(25);
    expect(age('2000-02-29', '2024-02-28')).toBe(23);
    expect(age('1990-09-30', '2026-09-29')).toBe(35);
    expect(age('1990-09-29', '2026-09-29')).toBe(36);
    expect(code(() => age('2026-01-02', '2026-01-01'))).toBe('HLP_DATE_AGE_BEFORE_BIRTH');
  });
});

describe('weeks and ordinals', () => {
  it('numbers ISO weeks', () => {
    expect(isoWeek('2026-09-29')).toBe(40);
    expect(weekOfYear('2027-01-01')).toEqual({ week: 53, year: 2026 });
    expect(isoWeekYear('2024-12-30')).toBe(2025);
    expect(isoWeek('2024-12-30')).toBe(1);
    expect(isoWeeksInYear(2026)).toBe(53);
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2020)).toBe(53);
    expect(weekOfYear('2026-01-01', { firstDayOfWeek: 7, minimalDays: 1 })).toEqual({ week: 1, year: 2026 });
    expect(weekOfYear('2025-12-28', { firstDayOfWeek: 7, minimalDays: 1 })).toEqual({ week: 1, year: 2026 });
    expect(weeksInWeekYear(2026, { firstDayOfWeek: 7, minimalDays: 1 })).toBe(52);
    expect(code(() => weekOfYear('2026-01-01', { minimalDays: 0 }))).toBe('HLP_DATE_INVALID_MINIMAL_DAYS');
    expect(weekOfMonth('2026-09-29')).toBe(5);
    expect(weekOfMonth('2026-09-01')).toBe(1);
    expect(weekOfMonth('2026-09-07')).toBe(2);
    expect(dayOfYear('2026-02-01')).toBe(32);
    expect(dayOfYear('2024-12-31')).toBe(366);
  });

  it('matches Temporal ISO week and day of year', () => {
    if (!Temporal) return;
    fc.assert(fc.property(arbDate, (d) => {
      if (d.year < 1 || d.year > 9000) return;
      const t = Temporal.PlainDate.from(iso(d));
      expect(weekOfYear(d)).toEqual({ week: t.weekOfYear, year: t.yearOfWeek });
      expect(dayOfYear(d)).toBe(t.dayOfYear);
    }));
  });
});

describe('locale', () => {
  it('reads week info', () => {
    expect(getWeekInfo('ar-SA')).toEqual({ firstDay: 7, weekend: [5, 6], minimalDays: 1 });
    expect(getWeekInfo('en-US')).toEqual({ firstDay: 7, weekend: [6, 7], minimalDays: 1 });
    expect(getWeekInfo('en-GB')).toEqual({ firstDay: 1, weekend: [6, 7], minimalDays: 4 });
    expect(getWeekInfo('de')).toEqual({ firstDay: 1, weekend: [6, 7], minimalDays: 4 });
    expect(getWeekInfo('hi-IN').weekend).toEqual([7]);
    expect(getWeekInfo('fa-IR', { useNative: false })).toEqual({ firstDay: 6, weekend: [5], minimalDays: 1 });
    expect(getWeekInfo('ps-AF', { useNative: false }).weekend).toEqual([4, 5]);
    expect(getWeekInfo('dv-MV', { useNative: false }).firstDay).toBe(5);
    expect(Object.isFrozen(getWeekInfo('en-US').weekend)).toBe(true);
    expect(code(() => getWeekInfo('not a locale!'))).toBe('HLP_INVALID_LOCALE');
  });

  it('fallback table agrees with the engine for every region', () => {
    const probe = new Intl.Locale('en-US') as Intl.Locale & { getWeekInfo?: unknown; weekInfo?: unknown };
    if (probe.getWeekInfo === undefined && probe.weekInfo === undefined) return;
    const names = new Intl.DisplayNames('en', { type: 'region' });
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let checked = 0;
    for (const a of letters) for (const b of letters) {
      const region = a + b;
      if (names.of(region) === region) continue;
      const native = getWeekInfo(`und-${region}`);
      const table = getWeekInfo(`und-${region}`, { useNative: false });
      expect({ region, firstDay: table.firstDay, weekend: table.weekend }).toEqual({ region, firstDay: native.firstDay, weekend: native.weekend });
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('names weekdays and months via Intl', () => {
    expect(weekdayName(1, { locale: 'en' })).toBe('Monday');
    expect(weekdayName(7, { locale: 'en', style: 'short' })).toBe('Sun');
    expect(weekdayName(1, { locale: 'fr' })).toBe('lundi');
    expect(weekdayNames('en-US', 7, 'short')).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(weekdayNames('en', 1, 'narrow')).toHaveLength(7);
    expect(monthName(9, { locale: 'en' })).toBe('September');
    expect(monthName(9, { locale: 'ru' })).toBe('сентябрь');
    expect(monthName(9, { locale: 'ru', context: 'format' })).toBe('сентября');
    expect(monthNames('en', 'short')[0]).toBe('Jan');
    expect(code(() => monthName(13))).toBe('HLP_DATE_INVALID_MONTH');
    expect(code(() => weekdayName(8 as 1))).toBe('HLP_DATE_INVALID_WEEKDAY');
  });
});

describe('intervals and iteration', () => {
  const iv = (start: string, end: string): { start: string; end: string } => ({ start, end });

  it('handles closed intervals', () => {
    expect(() => dateInterval('2026-02-01', '2026-01-01')).toThrow(ValidationError);
    expect(intervalLengthDays(iv('2026-01-01', '2026-01-31'))).toBe(31);
    expect(containsDate(iv('2026-01-01', '2026-01-31'), '2026-01-31')).toBe(true);
    expect(containsDate(iv('2026-01-01', '2026-01-31'), '2026-02-01')).toBe(false);
    expect(intervalsOverlap(iv('2026-01-01', '2026-01-05'), iv('2026-01-05', '2026-01-09'))).toBe(true);
    expect(intervalsOverlap(iv('2026-01-01', '2026-01-05'), iv('2026-01-05', '2026-01-09'), { inclusive: false })).toBe(false);
    expect(intervalsOverlap(iv('2026-01-01', '2026-01-05'), iv('2026-01-06', '2026-01-09'))).toBe(false);
    expect(intervalIntersection(iv('2026-01-01', '2026-01-10'), iv('2026-01-05', '2026-02-01'))).toEqual(dateInterval('2026-01-05', '2026-01-10'));
    expect(intervalIntersection(iv('2026-01-01', '2026-01-04'), iv('2026-01-05', '2026-02-01'))).toBeUndefined();
    expect(mergeIntervals([iv('2026-01-04', '2026-01-06'), iv('2026-01-01', '2026-01-03'), iv('2026-01-10', '2026-01-12')])).toEqual([dateInterval('2026-01-01', '2026-01-06'), dateInterval('2026-01-10', '2026-01-12')]);
    expect(mergeIntervals([iv('2026-01-04', '2026-01-06'), iv('2026-01-01', '2026-01-03')], { mergeAdjacent: false })).toHaveLength(2);
    expect(intervalGaps([iv('2026-01-03', '2026-01-04')], iv('2026-01-01', '2026-01-06'))).toEqual([dateInterval('2026-01-01', '2026-01-02'), dateInterval('2026-01-05', '2026-01-06')]);
    expect(intervalGaps([iv('2025-01-01', '2027-01-01')], iv('2026-01-01', '2026-01-06'))).toEqual([]);
    expect(intervalGaps([], iv('2026-01-01', '2026-01-06'))).toEqual([dateInterval('2026-01-01', '2026-01-06')]);
  });

  it('merge and gaps partition the covered days (oracle)', () => {
    const arbIv = fc.tuple(fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 10 })).map(([s, len]) => ({ start: fromEpochDay(20_000 + s), end: fromEpochDay(20_000 + s + len) }));
    fc.assert(fc.property(fc.array(arbIv, { maxLength: 8 }), (list) => {
      const covered = new Set<number>();
      for (const i of list) for (let e = toEpochDay(i.start); e <= toEpochDay(i.end); e++) covered.add(e);
      const merged = mergeIntervals(list);
      let total = 0;
      for (const [k, m] of merged.entries()) {
        total += intervalLengthDays(m);
        const next = merged[k + 1];
        if (next) expect(toEpochDay(next.start)).toBeGreaterThan(toEpochDay(m.end) + 1);
      }
      expect(total).toBe(covered.size);
      const within = { start: fromEpochDay(20_000), end: fromEpochDay(20_080) };
      const gapDays = intervalGaps(list, within).reduce((n, g) => n + intervalLengthDays(g), 0);
      expect(gapDays + [...covered].filter((e) => e <= 20_080).length).toBe(81);
    }));
  });

  it('iterates lazily with limits', () => {
    expect([...eachDayOfInterval(iv('2026-01-30', '2026-02-02'))].map(iso)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
    expect([...eachDayOfInterval(iv('2026-01-01', '2026-01-10'), { step: 3 })].map(iso)).toEqual(['2026-01-01', '2026-01-04', '2026-01-07', '2026-01-10']);
    expect([...eachWeekOfInterval(iv('2026-09-30', '2026-10-12'))].map(iso)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    expect([...eachMonthOfInterval(iv('2025-12-15', '2026-02-01'))].map(iso)).toEqual(['2025-12-01', '2026-01-01', '2026-02-01']);
    expect([...eachYearOfInterval(iv('2025-06-01', '2026-01-01'))].map(iso)).toEqual(['2025-01-01', '2026-01-01']);
    expect(() => eachDayOfInterval(iv('1000-01-01', '9000-01-01'))).toThrow(LimitError);
    expect(() => eachDayOfInterval(iv('2026-01-01', '2026-01-10'), { limit: 5 })).toThrow(LimitError);
    expect(() => eachDayOfInterval(iv('2026-01-01', '2026-01-10'), { step: 0 })).toThrow(ValidationError);
    const gen = eachDayOfInterval(iv('2026-01-01', '2999-01-01'), { limit: 1_000_000 });
    expect(gen.next().value).toEqual(plainDate(2026, 1, 1));
  });

  it('eachDay count equals differenceInDays + 1', () => {
    fc.assert(fc.property(arbDate, fc.integer({ min: 0, max: 3000 }), (a, n) => {
      const b = addDays(a, n);
      expect([...eachDayOfInterval({ start: a, end: b })]).toHaveLength(differenceInDays(b, a) + 1);
    }), { numRuns: 50 });
  });

  it('builds month grids', () => {
    const grid = calendarMonthGrid(2026, 9, { firstDayOfWeek: 7, today: '2026-09-29' });
    expect(grid).toHaveLength(6);
    expect(iso(must(grid[0]?.[0]).date)).toBe('2026-08-30');
    expect(grid.flat().filter((c) => c.inMonth)).toHaveLength(30);
    expect(grid.flat().filter((c) => c.isToday).map((c) => iso(c.date))).toEqual(['2026-09-29']);
    expect(must(grid[0]?.[0]).weekday).toBe(7);
    expect(calendarMonthGrid(2026, 2, { fixedWeeks: false, firstDayOfWeek: 7 })).toHaveLength(4);
    expect(calendarMonthGrid(2026, 2, { fixedWeeks: false })).toHaveLength(5);
    expect(calendarMonthGrid(2026, 2).flat().some((c) => c.isToday)).toBe(false);
  });
});

describe('formatting and parsing', () => {
  it('formats patterns', () => {
    const dt = plainDateTime('2026-09-29', plainTime(19, 5, 9, 42));
    expect(formatDate('2026-09-29', "EEE, d MMM yyyy 'Q'Q", { locale: 'en' })).toBe('Tue, 29 Sep 2026 Q3');
    expect(formatDate(dt, 'yyyy-MM-dd HH:mm:ss.SSS')).toBe('2026-09-29 19:05:09.042');
    expect(formatDate(dt, 'EEEE, MMMM d, yy h:mm a', { locale: 'en' })).toBe('Tuesday, September 29, 26 7:05 PM');
    expect(formatDate(dt, 'hh H M d w')).toBe('07 19 9 29 40');
    expect(formatDate(plainDateTime('2026-01-01', plainTime(0)), 'h a', { locale: 'en' })).toBe('12 AM');
    expect(formatDate('2026-09-29', "yyyy'T'HH 'o''clock' ''")).toBe("2026T00 o'clock '");
    expect(formatDate('2026-09-29', 'd MMMM', { locale: 'ru' })).toBe('29 сентября');
    expect(formatDate(plainDate(-44, 3, 15), 'yyyy')).toBe('-0044');
    expect(code(() => formatDate('2026-09-29', 'YYYY'))).toBe('HLP_DATE_INVALID_PATTERN');
    expect(code(() => formatDate('2026-09-29', 'yyyyy'))).toBe('HLP_DATE_INVALID_PATTERN');
    expect(code(() => formatDate('2026-09-29', "'open"))).toBe('HLP_DATE_INVALID_PATTERN');
    expect(() => formatDate('2026-09-29', 'd'.repeat(300))).toThrow(LimitError);
  });

  it('parses patterns strictly', () => {
    expect(parseDate('Sep 29, 2026', 'MMM d, yyyy', { locale: 'en' })).toEqual(plainDate(2026, 9, 29));
    expect(parseDate('sep 29, 2026', 'MMM d, yyyy', { locale: 'en' })).toEqual(plainDate(2026, 9, 29));
    expect(parseDate('29 сентября 2026', 'd MMMM yyyy', { locale: 'ru' })).toEqual(plainDate(2026, 9, 29));
    expect(parseDate('29 сентябрь 2026', 'd MMMM yyyy', { locale: 'ru' })).toEqual(plainDate(2026, 9, 29));
    expect(parseDateTime('07:05 PM 2026-09-29', 'hh:mm a yyyy-MM-dd', { locale: 'en' })).toEqual(plainDateTime('2026-09-29', plainTime(19, 5)));
    expect(parseDateTime('12:00 AM 2026-09-29', 'hh:mm a yyyy-MM-dd', { locale: 'en' })?.time.hour).toBe(0);
    expect(parseDate('Tue 2026-09-29', 'EEE yyyy-MM-dd', { locale: 'en' })).toEqual(plainDate(2026, 9, 29));
    expect(parseDate('Wed 2026-09-29', 'EEE yyyy-MM-dd', { locale: 'en' })).toBeUndefined();
    expect(parseDate('2026-09 Q3', "yyyy-MM 'Q'Q")).toEqual(plainDate(2026, 9, 1));
    expect(parseDate('2026-09 Q2', "yyyy-MM 'Q'Q")).toBeUndefined();
    expect(parseDate('9/5/26', 'M/d/yy')).toEqual(plainDate(2026, 9, 5));
    expect(parseDate('9/5/70', 'M/d/yy')).toEqual(plainDate(1970, 9, 5));
    expect(parseDate('9/5/70', 'M/d/yy', { referenceYear: 2100 })).toEqual(plainDate(2070, 9, 5));
    for (const [text, pattern] of [['2026-02-30', 'yyyy-MM-dd'], ['2026-9-29', 'yyyy-MM-dd'], ['2026-09-29x', 'yyyy-MM-dd'], ['09-29', 'MM-dd'], ['07:05 2026', 'hh:mm yyyy'], ['25:00 2026', 'HH:mm yyyy'], ['2026-09-29 2026-09-30', 'yyyy-MM-dd yyyy-MM-dd'], ['', 'yyyy']] as const) {
      expect(parseDate(text, pattern)).toBeUndefined();
    }
    expect(parseDate('1'.repeat(10_000), 'yyyy')).toBeUndefined();
  });

  it('round-trips format and parse', () => {
    const patterns = ['yyyy-MM-dd HH:mm:ss.SSS', 'dd/MM/yyyy hh:mm a', 'EEEE, MMMM d, yyyy H:mm', 'EEE d MMM yyyy'];
    fc.assert(fc.property(fc.integer({ min: 0, max: 2_900_000 }), fc.integer({ min: 0, max: 86_399_999 }), fc.constantFrom(...patterns), fc.constantFrom('en', 'fr', 'de', 'ru', 'es'), (day, ms, pattern, locale) => {
      const time = timeFromMilliseconds(pattern.includes('SSS') ? ms : Math.floor(ms / 60_000) * 60_000);
      const dt = plainDateTime(fromEpochDay(day), time);
      const text = formatDate(dt, pattern, { locale });
      const back = parseDateTime(text, pattern, { locale });
      expect(back?.date).toEqual(dt.date);
      if (pattern.includes('mm')) expect(back?.time).toEqual(time);
    }), { numRuns: 300 });
  });

  it('formats with Intl', () => {
    expect(formatDateIntl('2026-09-29', { locale: 'de', dateStyle: 'long' })).toBe('29. September 2026');
    expect(formatDateIntl('2026-01-01', { locale: 'en-US' })).toBe('Jan 1, 2026');
    expect(formatDateIntl(plainDateTime('2026-01-01', plainTime(23, 30)), { locale: 'en-US', hour: 'numeric', minute: '2-digit' })).toBe('11:30 PM');
    expect(formatDateRange('2026-01-01', '2026-01-05', { locale: 'en' }).replace(/\s/g, ' ')).toBe('Jan 1 – 5, 2026');
    expect(code(() => formatDateRange('2026-01-05', '2026-01-01'))).toBe('HLP_DATE_INVALID_INTERVAL');
    expect(code(() => formatDateIntl('2026-01-01', { locale: 'x-invalid-locale-tag-!!' }))).toBe('HLP_INTL_INVALID_OPTIONS');
  });

  it('formats relative time', () => {
    const base = Date.UTC(2026, 8, 29, 12);
    const en = { locale: 'en' };
    expect(formatRelative(base - 3 * 3_600_000, base, en)).toBe('3 hours ago');
    expect(formatRelative(base + 86_400_000, base, en)).toBe('tomorrow');
    expect(formatRelative(base, base, en)).toBe('now');
    expect(formatRelative(base + 59_600, base, en)).toBe('in 1 minute');
    expect(formatRelative(base + 45 * 86_400_000, base, en)).toBe('next month');
    expect(formatRelative(base - 400 * 86_400_000, base, en)).toBe('last year');
    expect(formatRelative(base - 10 * 86_400_000, base, { ...en, numeric: 'always' })).toBe('1 week ago');
    expect(formatRelative(new Date(base + 30_000), base, en)).toBe('in 30 seconds');
    expect(formatRelativeDate('2026-09-28', '2026-09-29', en)).toBe('yesterday');
    expect(formatRelativeDate('2026-10-13', '2026-09-29', en)).toBe('in 2 weeks');
    expect(formatRelativeDate('2026-12-01', '2026-09-29', en)).toBe('in 2 months');
    expect(formatRelativeDate('2020-01-01', '2026-09-29', en)).toBe('6 years ago');
    expect(() => formatRelative(Number.NaN, base)).toThrow(ValidationError);
  });
});

describe('instant helpers', () => {
  it('converts instants to wall time', () => {
    expect(toPlainDateTime(Date.UTC(2026, 0, 1), 'Asia/Kolkata')).toEqual(plainDateTime('2026-01-01', plainTime(5, 30)));
    expect(toPlainDateTime(new Date(Date.UTC(2026, 0, 1)), 'UTC')).toEqual(plainDateTime('2026-01-01'));
    expect(code(() => toPlainDateTime(0, 'Mars/Olympus'))).toBe('HLP_TZ_INVALID_ZONE');
  });

  it('finds the first instant of days whose midnight is skipped', () => {
    // Asserted against Intl-derived transition instants (verified in Chromium) and Temporal when present.
    const cases: [string, string, number][] = [
      ['America/Santiago', '2022-09-11', Date.UTC(2022, 8, 11, 4)],
      ['Asia/Beirut', '2026-03-29', Date.UTC(2026, 2, 28, 22)],
      ['America/Havana', '2026-03-08', Date.UTC(2026, 2, 8, 5)],
      ['America/Sao_Paulo', '2018-11-04', Date.UTC(2018, 10, 4, 3)],
      ['America/New_York', '2026-03-08', Date.UTC(2026, 2, 8, 5)],
      ['Asia/Kolkata', '2026-09-29', Date.UTC(2026, 8, 28, 18, 30)],
    ];
    for (const [zone, date, expected] of cases) {
      const start = startOfDayInstant(date, zone);
      expect(start).toBe(expected);
      expect(formatPlainDate(toPlainDateTime(start, zone).date)).toBe(date);
      expect(formatPlainDate(toPlainDateTime(start - 1, zone).date)).not.toBe(date);
      if (Temporal) expect(start).toBe(Temporal.PlainDate.from(date).toZonedDateTime({ timeZone: zone }).epochMilliseconds);
    }
    expect(endOfDayInstant('2026-11-01', 'America/New_York') - startOfDayInstant('2026-11-01', 'America/New_York')).toBe(25 * 3_600_000 - 1);
    expect(endOfDayInstant('2026-03-08', 'America/New_York') - startOfDayInstant('2026-03-08', 'America/New_York')).toBe(23 * 3_600_000 - 1);
  });

  it('matches Temporal startOfDay across zones', () => {
    if (!Temporal) return;
    const zones = ['America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'Pacific/Chatham', 'America/Santiago', 'Asia/Beirut', 'America/Havana', 'Pacific/Apia', 'Asia/Kathmandu'];
    fc.assert(fc.property(fc.integer({ min: 0, max: 25_000 }), fc.constantFrom(...zones), (n, zone) => {
      const d = fromEpochDay(n);
      expect(startOfDayInstant(d, zone)).toBe(Temporal.PlainDate.from(iso(d)).toZonedDateTime({ timeZone: zone }).epochMilliseconds);
    }), { numRuns: 300 });
  });

  it('is not polluted by __proto__ payloads', () => {
    const payload = JSON.parse('{"__proto__": {"polluted": true}, "start": "2026-01-01", "end": "2026-01-02"}') as { start: string; end: string };
    expect(intervalLengthDays(payload)).toBe(2);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
