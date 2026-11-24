import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LimitError, ValidationError } from '@absoluteui/helpers/error';
import { formatPlainDate, isoWeekday, plainDate, type PlainDate } from '@absoluteui/helpers/date';
import {
  addBusinessDays, adjustBusinessDay, businessDayAt, businessDayOfMonth, businessDaysIn, countBusinessDays, countHolidays, countWeekdays, countWeekends,
  createBusinessCalendar, customHoliday, defaultBusinessCalendar, defineHolidays, describeBusinessDay, diffBreakdown, diffDays, easterHoliday, easterSunday,
  firstBusinessDayOfMonth, fixedHoliday, getBusinessDay, holidayRange, holidaysOn, isBusinessCalendar, isBusinessDay, isHalfDay, isHoliday, isWeekday,
  isWeekend, lastBusinessDayOfMonth, lastWeekdayHoliday, listBusinessDays, listHolidays, mergeCalendars, nextBusinessDay, nthBusinessDayOfMonth,
  nthWeekdayHoliday, oneOffHoliday, periodRange, previousBusinessDay, weekendForLocale, withTags, type BusinessCalendar, type HolidayProvider, type HolidayRule,
} from '@absoluteui/helpers/business-calendar';

const iso = (d: PlainDate | undefined): string | undefined => (d === undefined ? undefined : formatPlainDate(d));
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

const US_RULES: readonly HolidayRule[] = defineHolidays([
  fixedHoliday("New Year's Day", 1, 1, { observed: 'nearest-weekday' }),
  nthWeekdayHoliday('Martin Luther King Jr. Day', 1, 1, 3),
  nthWeekdayHoliday("Washington's Birthday", 2, 1, 3),
  lastWeekdayHoliday('Memorial Day', 5, 1),
  fixedHoliday('Juneteenth', 6, 19, { observed: 'nearest-weekday', fromYear: 2021 }),
  fixedHoliday('Independence Day', 7, 4, { observed: 'nearest-weekday' }),
  nthWeekdayHoliday('Labor Day', 9, 1, 1),
  nthWeekdayHoliday('Columbus Day', 10, 1, 2),
  fixedHoliday('Veterans Day', 11, 11, { observed: 'nearest-weekday' }),
  nthWeekdayHoliday('Thanksgiving Day', 11, 4, 4),
  fixedHoliday('Christmas Day', 12, 25, { observed: 'nearest-weekday' }),
]);
const US = createBusinessCalendar({ name: 'US federal', holidays: US_RULES, timeZone: 'America/New_York' });

describe('business-calendar: weekends', () => {
  it('defaults to Saturday/Sunday', () => {
    expect(isWeekend('2026-10-03')).toBe(true);
    expect(isWeekend('2026-10-04')).toBe(true);
    expect(isWeekend('2026-10-02')).toBe(false);
    expect(isWeekday('2026-10-05')).toBe(true);
    expect(defaultBusinessCalendar().weekend).toEqual([6, 7]);
    expect(defaultBusinessCalendar()).toBe(defaultBusinessCalendar());
  });

  it('supports Fri/Sat, Thu/Fri, Sunday-only, and no weekend', () => {
    const friSat = createBusinessCalendar({ weekend: [6, 5] });
    expect(friSat.weekend).toEqual([5, 6]);
    expect(isWeekend('2026-10-02', friSat)).toBe(true);
    expect(isWeekend('2026-10-04', friSat)).toBe(false);
    const thuFri = createBusinessCalendar({ weekend: [4, 5] });
    expect(isWeekend('2026-10-01', thuFri)).toBe(true);
    expect(nextBusinessDay('2026-09-30', thuFri)).toEqual(plainDate(2026, 10, 3));
    const sunday = createBusinessCalendar({ weekend: [7] });
    expect(countWeekdays('2026-09-28', '2026-10-04', { inclusive: 'both', calendar: sunday })).toBe(6);
    const none = createBusinessCalendar({ weekend: [] });
    expect(countWeekends('2026-01-01', '2026-12-31', { inclusive: 'both', calendar: none })).toBe(0);
    expect(diffDays('2026-01-01', '2027-01-01', { mode: 'business', calendar: none })).toBe(365);
  });

  it('derives weekends from locales', () => {
    expect(weekendForLocale('ar-SA')).toEqual([5, 6]);
    expect(weekendForLocale('en-US')).toEqual([6, 7]);
    const sa = createBusinessCalendar({ locale: 'ar-SA' });
    expect(sa.weekend).toEqual([5, 6]);
    expect(sa.firstDayOfWeek).toBe(7);
    expect(createBusinessCalendar({ locale: 'ar-SA', weekend: [6, 7] }).weekend).toEqual([6, 7]);
  });

  it('throws instead of looping forever when nothing is ever worked', () => {
    const never = createBusinessCalendar({ weekend: [1, 2, 3, 4, 5, 6, 7] });
    expect(code(() => nextBusinessDay('2026-10-01', never))).toBe('HLP_BIZCAL_NO_WORKING_DAYS');
    expect(code(() => addBusinessDays('2026-10-01', -3, never))).toBe('HLP_BIZCAL_NO_WORKING_DAYS');
    expect(diffDays('2026-01-01', '2027-01-01', { mode: 'business', calendar: never })).toBe(0);
    const onlyExceptions = createBusinessCalendar({ weekend: [1, 2, 3, 4, 5, 6, 7], exceptions: [{ date: '2026-10-10', working: true }, { date: '2026-10-20', working: true }] });
    expect(iso(nextBusinessDay('2026-10-01', onlyExceptions))).toBe('2026-10-10');
    expect(iso(addBusinessDays('2026-10-01', 2, onlyExceptions))).toBe('2026-10-20');
    expect(iso(previousBusinessDay('2026-10-20', onlyExceptions))).toBe('2026-10-10');
    expect(code(() => addBusinessDays('2026-10-01', 3, onlyExceptions))).toBe('HLP_BIZCAL_NO_WORKING_DAYS');
    const allHoliday = createBusinessCalendar({ holidays: [customHoliday('Everything', (y) => Array.from({ length: 12 }, (_, m) => Array.from({ length: 28 }, (_x, d) => plainDate(y, m + 1, d + 1))).flat().slice(0, 400))] });
    expect(iso(nextBusinessDay('2026-02-27', allHoliday))).toBe('2026-03-30');
  });
});

describe('business-calendar: holiday rules', () => {
  it('resolves US federal rules with observed shifts', () => {
    const names = (from: string, to: string): string[] => listHolidays(from, to, US).filter((h) => h.movedTo === undefined).map((h) => `${iso(h.date) ?? ''} ${h.name}`);
    expect(names('2026-01-01', '2026-12-31')).toEqual([
      "2026-01-01 New Year's Day", '2026-01-19 Martin Luther King Jr. Day', "2026-02-16 Washington's Birthday", '2026-05-25 Memorial Day',
      '2026-06-19 Juneteenth', '2026-07-03 Independence Day', '2026-09-07 Labor Day', '2026-10-12 Columbus Day', '2026-11-11 Veterans Day',
      '2026-11-26 Thanksgiving Day', '2026-12-25 Christmas Day',
    ]);
    expect(businessDaysIn(2026, US)).toBe(261 - 11);
    // 2027: Christmas and New Year 2028 fall on Saturdays and are observed on Fridays in 2027.
    expect(iso(isHoliday('2027-12-24', US)?.originalDate)).toBe('2027-12-25');
    expect(isHoliday('2027-12-31', US)?.name).toBe("New Year's Day");
    expect(businessDaysIn(2027, US)).toBe(261 - 12);
    expect(iso(isHoliday('2021-12-31', US)?.originalDate)).toBe('2022-01-01');
    expect(isHoliday('2020-06-19', US)).toBeUndefined();
    const sat = isHoliday('2026-07-04', US);
    expect(sat?.observed).toBe(false);
    expect(iso(sat?.movedTo)).toBe('2026-07-03');
    expect(isHoliday('2026-07-03', US)).toMatchObject({ observed: true, kind: 'fixed', name: 'Independence Day' });
    expect(isBusinessDay('2026-07-03', US)).toBe(false);
  });

  it('moves observed holidays past collisions in the shift direction', () => {
    const uk = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25, { observed: 'next-weekday' }), fixedHoliday('Boxing Day', 12, 26, { observed: 'next-weekday' })] });
    expect(listHolidays('2021-12-24', '2021-12-31', uk).filter((h) => h.observed).map((h) => `${iso(h.date) ?? ''} ${h.name}`)).toEqual(['2021-12-27 Christmas Day', '2021-12-28 Boxing Day']);
    const eve = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Eve', 12, 24), fixedHoliday('Christmas Day', 12, 25, { observed: 'nearest-weekday' })] });
    expect(isHoliday('2027-12-23', eve)?.name).toBe('Christmas Day');
    expect(holidaysOn('2027-12-24', eve).map((h) => h.name)).toEqual(['Christmas Eve']);
    const prev = createBusinessCalendar({ holidays: [fixedHoliday('X', 10, 4, { observed: 'previous-weekday' })] });
    expect(iso(isHoliday('2026-10-02', prev)?.originalDate)).toBe('2026-10-04');
    const custom = createBusinessCalendar({ holidays: [fixedHoliday('Moved', 10, 6, { observed: { 2: -1 } })] });
    expect(isBusinessDay('2026-10-06', custom)).toBe(true);
    expect(isBusinessDay('2026-10-05', custom)).toBe(false);
    expect(isHoliday('2026-10-06', custom)?.movedTo).toBeDefined();
    const friSat = createBusinessCalendar({ weekend: [5, 6], holidays: [fixedHoliday('Day', 10, 2, { observed: 'nearest-weekday' })] });
    expect(iso(isHoliday('2026-10-01', friSat)?.originalDate)).toBe('2026-10-02');
    const noWeekend = createBusinessCalendar({ weekend: [], holidays: [fixedHoliday('Day', 10, 3, { observed: 'nearest-weekday' })] });
    expect(listHolidays('2026-10-01', '2026-10-31', noWeekend).map((h) => iso(h.date))).toEqual(['2026-10-03']);
  });

  it('computes Western and Orthodox Easter', () => {
    const western: Record<number, string> = { 1818: '1818-03-22', 1961: '1961-04-02', 2000: '2000-04-23', 2011: '2011-04-24', 2019: '2019-04-21', 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28', 2038: '2038-04-25', 2285: '2285-03-22' };
    for (const [y, d] of Object.entries(western)) expect(iso(easterSunday(Number(y)))).toBe(d);
    const orthodox: Record<number, string> = { 2023: '2023-04-16', 2024: '2024-05-05', 2025: '2025-04-20', 2026: '2026-04-12', 2027: '2027-05-02' };
    for (const [y, d] of Object.entries(orthodox)) expect(iso(easterSunday(Number(y), 'orthodox'))).toBe(d);
    fc.assert(fc.property(fc.integer({ min: 1583, max: 9999 }), (y) => {
      const e = easterSunday(y);
      const md = e.month * 100 + e.day;
      return isoWeekday(e) === 7 && md >= 322 && md <= 425;
    }));
    fc.assert(fc.property(fc.integer({ min: 1900, max: 2099 }), (y) => {
      const e = easterSunday(y, 'orthodox');
      const md = e.month * 100 + e.day;
      return isoWeekday(e) === 7 && md >= 404 && md <= 508;
    }));
    const cal = createBusinessCalendar({ holidays: [easterHoliday('Good Friday', -2), easterHoliday('Easter Monday', 1), easterHoliday('Orthodox Good Friday', -2, { method: 'orthodox' })] });
    expect(listHolidays('2026-03-01', '2026-05-01', cal).map((h) => `${iso(h.date) ?? ''} ${h.name}`)).toEqual(['2026-04-03 Good Friday', '2026-04-06 Easter Monday', '2026-04-10 Orthodox Good Friday']);
    expect(code(() => easterSunday(0))).toBe('HLP_BIZCAL_INVALID_YEAR');
  });

  it('handles nth weekday edge cases, Feb 29, year bounds, one-offs, ranges, and custom rules', () => {
    const cal = createBusinessCalendar({
      holidays: [
        nthWeekdayHoliday('Fifth Friday', 10, 5, 5),
        nthWeekdayHoliday('Second-last Monday', 10, 1, -2),
        fixedHoliday('Leap', 2, 29),
        fixedHoliday('Bounded', 3, 3, { fromYear: 2026, toYear: 2027 }),
        oneOffHoliday('Once', '2026-06-10'),
        holidayRange('Shutdown', '2026-12-28', '2027-01-02'),
        customHoliday('Diwali', (y) => ({ 2026: ['2026-11-09'], 2027: ['2027-10-29'] } as Record<number, readonly string[]>)[y] ?? []),
      ],
    });
    expect(iso(listHolidays('2026-10-01', '2026-10-31', cal).find((h) => h.name === 'Fifth Friday')?.date)).toBe('2026-10-30');
    expect(listHolidays('2027-10-01', '2027-10-31', cal).some((h) => h.name === 'Fifth Friday')).toBe(true);
    expect(listHolidays('2025-10-01', '2025-10-31', cal).some((h) => h.name === 'Fifth Friday')).toBe(true);
    expect(listHolidays('2024-10-01', '2024-10-31', cal).some((h) => h.name === 'Fifth Friday')).toBe(false);
    expect(iso(listHolidays('2026-10-01', '2026-10-31', cal).find((h) => h.name === 'Second-last Monday')?.date)).toBe('2026-10-19');
    expect(isHoliday('2028-02-29', cal)?.name).toBe('Leap');
    expect(listHolidays('2027-02-01', '2027-03-01', cal).some((h) => h.name === 'Leap')).toBe(false);
    expect(isHoliday('2025-03-03', cal)).toBeUndefined();
    expect(isHoliday('2027-03-03', cal)?.name).toBe('Bounded');
    expect(isHoliday('2028-03-03', cal)).toBeUndefined();
    expect(isHoliday('2026-06-10', cal)?.kind).toBe('date');
    expect(listHolidays('2026-12-25', '2027-01-05', cal).filter((h) => h.name === 'Shutdown')).toHaveLength(6);
    expect(isHoliday('2026-11-09', cal)?.kind).toBe('custom');
    expect(holidaysOn('2027-10-29', cal).map((h) => h.name)).toEqual(['Fifth Friday', 'Diwali']);
  });

  it('supports holiday providers with caching and resolved entries', () => {
    let calls = 0;
    const provider: HolidayProvider = {
      holidaysFor(year) {
        calls++;
        if (year === 2026) return [{ date: '2026-11-09', name: 'Diwali', tags: ['IN'] }, fixedHoliday('Republic Day', 1, 26, { tags: ['IN'] }), { date: plainDate(2026, 8, 15), name: 'Independence Day', kind: 'fixed', observed: false, halfDay: false, tags: [] } as never];
        return [];
      },
    };
    const cal = createBusinessCalendar({ providers: [provider] });
    expect(isHoliday('2026-11-09', cal)).toMatchObject({ name: 'Diwali', kind: 'provided', tags: ['IN'] });
    expect(isHoliday('2026-01-26', cal)?.kind).toBe('fixed');
    expect(isHoliday('2026-08-15', cal)?.name).toBe('Independence Day');
    expect(isHoliday('2027-01-26', cal)).toBeUndefined();
    const before = calls;
    isBusinessDay('2026-05-05', cal);
    countBusinessDays('2026-01-01', '2026-12-31', { calendar: cal });
    expect(calls).toBe(before);
    const bad = createBusinessCalendar({ providers: [{ holidaysFor: () => 'nope' as never }] });
    expect(code(() => isBusinessDay('2026-01-01', bad))).toBe('HLP_BIZCAL_INVALID_PROVIDER');
    const huge = createBusinessCalendar({ providers: [{ holidaysFor: () => Array.from({ length: 10_001 }, () => ({ date: '2026-01-01', name: 'x' })) }] });
    expect(() => isBusinessDay('2026-01-01', huge)).toThrow(LimitError);
    expect(code(() => createBusinessCalendar({ providers: [{} as never] }))).toBe('HLP_BIZCAL_INVALID_PROVIDER');
  });
});

describe('business-calendar: half days and exceptions', () => {
  const cal = createBusinessCalendar({
    holidays: [fixedHoliday('Christmas Day', 12, 25), fixedHoliday('Christmas Eve', 12, 24, { halfDay: true }), fixedHoliday('Founders Day', 10, 7)],
    halfDays: [fixedHoliday('New Year Eve', 12, 31)],
    exceptions: [
      { date: '2026-10-24', working: true, reason: 'Compensatory working day' },
      { date: '2026-10-07', working: true, reason: 'Release day' },
      { date: '2026-10-08', working: false, reason: 'Stocktaking' },
      { date: '2026-10-09', working: true, halfDay: true, hours: [['10:00', '12:00']] },
    ],
    workingHours: { default: [['09:00', '13:00'], ['14:00', '18:00']], 5: [['09:00', '13:00']] },
  });

  it('weights half days (B2) and reports them', () => {
    expect(isHalfDay('2026-12-24', cal)).toBe(true);
    expect(isBusinessDay('2026-12-24', cal)).toBe(true);
    expect(isHoliday('2026-12-24', cal)).toBeUndefined();
    const info = getBusinessDay('2026-12-24', cal);
    expect(info).toMatchObject({ reasonCode: 'half-day', reason: 'Christmas Eve', businessDayValue: 0.5, hours: [['09:00', '13:00']] });
    expect(diffDays('2026-12-21', '2026-12-25', { mode: 'business', inclusive: 'both', calendar: cal })).toBe(3.5);
    expect(diffDays('2026-12-21', '2026-12-25', { mode: 'business', inclusive: 'both', calendar: cal, halfDayValue: 1 })).toBe(4);
    expect(isHalfDay('2026-12-31', cal)).toBe(true);
    expect(isHalfDay('2027-12-31', cal)).toBe(true);
    const custom = createBusinessCalendar({ ...cal.definition, halfDayValue: 0.25, halfDayHours: [['08:00', '11:00']] });
    expect(getBusinessDay('2026-12-24', custom)).toMatchObject({ businessDayValue: 0.25, hours: [['08:00', '11:00']] });
    // A half-day rule on a weekend does not make it working.
    expect(isBusinessDay('2027-12-24', cal)).toBe(true);
    expect(isBusinessDay('2022-12-24', cal)).toBe(false);
    expect(nextBusinessDay('2026-12-23', cal)).toEqual(plainDate(2026, 12, 24));
    expect(addBusinessDays('2026-12-23', 2, cal)).toEqual(plainDate(2026, 12, 28));
  });

  it('applies exceptions first', () => {
    expect(getBusinessDay('2026-10-24', cal)).toMatchObject({ working: true, weekend: true, reasonCode: 'exception', reason: 'Compensatory working day', hours: [['09:00', '13:00'], ['14:00', '18:00']] });
    const release = getBusinessDay('2026-10-07', cal);
    expect(release.working).toBe(true);
    expect(release.holidays.map((h) => h.name)).toEqual(['Founders Day']);
    expect(getBusinessDay('2026-10-08', cal)).toMatchObject({ working: false, weekend: false, reasonCode: 'exception', reason: 'Stocktaking', hours: [] });
    expect(getBusinessDay('2026-10-09', cal)).toMatchObject({ halfDay: true, hours: [['10:00', '12:00']], businessDayValue: 0.5 });
    expect(getBusinessDay('2026-10-02', cal).hours).toEqual([['09:00', '13:00']]);
    expect(getBusinessDay('2026-10-05', cal)).toMatchObject({ reasonCode: null, reason: null, exception: null, businessDayValue: 1 });
    const b = diffBreakdown('2026-10-05', '2026-10-25', cal, { inclusive: 'both' });
    expect(b).toMatchObject({ calendarDays: 21, weekdays: 15, weekendDays: 6, holidays: 1, nonWorkingWeekdays: 1, workingWeekendDays: 1, halfDays: 1, businessDays: 14.5 });
    // Three weeks of Mon-Thu 8 h + Fri 4 h, minus Stocktaking (8 h), the 2 h half day instead of 4 h, plus the working Saturday.
    expect(b.businessHours).toBe(3 * (4 * 8 + 4) - 8 - 2 + 8);
  });

  it('describes days accessibly', () => {
    expect(describeBusinessDay(getBusinessDay('2026-10-03', cal))).toBe('Weekend');
    expect(describeBusinessDay(getBusinessDay('2026-12-25', cal))).toBe('Holiday: Christmas Day');
    expect(describeBusinessDay(getBusinessDay('2026-12-24', cal))).toBe('Half day: Christmas Eve');
    expect(describeBusinessDay(getBusinessDay('2026-10-24', cal))).toBe('Working day: Compensatory working day');
    expect(describeBusinessDay(getBusinessDay('2026-10-08', cal))).toBe('Non-working day: Stocktaking');
    expect(describeBusinessDay(getBusinessDay('2026-10-09', cal))).toBe('Half day');
    expect(describeBusinessDay(getBusinessDay('2026-10-05', cal))).toBe('');
    expect(describeBusinessDay(getBusinessDay('2026-12-26', cal), { labels: { weekend: 'Wochenende' } })).toBe('Wochenende');
    const two = createBusinessCalendar({ holidays: [fixedHoliday('A', 5, 1), fixedHoliday('B', 5, 1)] });
    expect(describeBusinessDay(getBusinessDay('2026-05-01', two), { locale: 'en' })).toBe('Holiday: A and B');
    expect(describeBusinessDay(getBusinessDay('2026-07-04', US))).toBe('Holiday: Independence Day');
    expect(getBusinessDay('2026-07-04', US)).toMatchObject({ weekend: true, reasonCode: 'holiday' });
  });
});

describe('business-calendar: navigation', () => {
  it('moves by business days across weekends and holidays', () => {
    expect(iso(nextBusinessDay('2026-10-02'))).toBe('2026-10-05');
    expect(iso(nextBusinessDay('2026-10-02', undefined, { includeSelf: true }))).toBe('2026-10-02');
    expect(iso(previousBusinessDay('2026-10-05'))).toBe('2026-10-02');
    expect(iso(previousBusinessDay('2026-10-04', undefined, { includeSelf: true }))).toBe('2026-10-02');
    expect(iso(addBusinessDays('2026-11-25', 1, US))).toBe('2026-11-27');
    expect(iso(addBusinessDays('2026-11-27', -1, US))).toBe('2026-11-25');
    expect(iso(addBusinessDays('2026-12-24', 1, US))).toBe('2026-12-28');
    expect(iso(addBusinessDays('2026-10-03', 0))).toBe('2026-10-05');
    expect(iso(addBusinessDays('2026-10-03', 0, undefined, { zero: 'preceding' }))).toBe('2026-10-02');
    expect(iso(addBusinessDays('2026-10-03', 0, undefined, { zero: 'none' }))).toBe('2026-10-03');
    expect(iso(addBusinessDays('2026-10-05', 0))).toBe('2026-10-05');
    expect(code(() => addBusinessDays('2026-10-05', 1.5))).toBe('HLP_BIZCAL_INVALID_OPTION');
    expect(() => addBusinessDays('2026-10-05', 1e8)).toThrow(LimitError);
  });

  it('matches a naive oracle for ±10000 business days', () => {
    const naive = (start: string, n: number): string | undefined => {
      let d = plainDate(Number(start.slice(0, 4)), Number(start.slice(5, 7)), Number(start.slice(8, 10)));
      let left = Math.abs(n);
      while (left > 0) {
        d = nextOrPrev(d, n > 0 ? 1 : -1);
        if (isBusinessDay(d, US)) left--;
      }
      return iso(d);
    };
    for (const n of [10_000, -10_000, 1234, -777, 5]) expect(iso(addBusinessDays('2026-09-29', n, US))).toBe(naive('2026-09-29', n));
  });

  it('adjusts by conventions', () => {
    expect(iso(adjustBusinessDay('2026-10-31', 'following'))).toBe('2026-11-02');
    expect(iso(adjustBusinessDay('2026-10-31', 'modifiedFollowing'))).toBe('2026-10-30');
    expect(iso(adjustBusinessDay('2026-11-01', 'preceding'))).toBe('2026-10-30');
    expect(iso(adjustBusinessDay('2026-11-01', 'modifiedPreceding'))).toBe('2026-11-02');
    expect(iso(adjustBusinessDay('2026-10-03', 'modifiedPreceding'))).toBe('2026-10-02');
    expect(iso(adjustBusinessDay('2026-10-03', 'none'))).toBe('2026-10-03');
    expect(iso(adjustBusinessDay('2026-10-05', 'preceding'))).toBe('2026-10-05');
    expect(code(() => adjustBusinessDay('2026-10-05', 'sideways' as never))).toBe('HLP_BIZCAL_INVALID_OPTION');
  });

  it('finds business days within months', () => {
    expect(iso(firstBusinessDayOfMonth(2026, 11))).toBe('2026-11-02');
    expect(iso(lastBusinessDayOfMonth(2026, 10))).toBe('2026-10-30');
    expect(iso(nthBusinessDayOfMonth(2026, 10, 3))).toBe('2026-10-05');
    expect(iso(nthBusinessDayOfMonth(2026, 10, -2))).toBe('2026-10-29');
    expect(nthBusinessDayOfMonth(2026, 10, 23)).toBeUndefined();
    expect(iso(nthBusinessDayOfMonth(2026, 11, -1, US))).toBe('2026-11-30');
    expect(businessDayOfMonth('2026-10-05')).toBe(3);
    expect(businessDayOfMonth('2026-10-03')).toBeUndefined();
    expect(businessDayOfMonth('2026-11-27', US)).toBe(18);
    expect(code(() => nthBusinessDayOfMonth(2026, 10, 0))).toBe('HLP_BIZCAL_INVALID_OPTION');
    const never = createBusinessCalendar({ weekend: [1, 2, 3, 4, 5, 6, 7] });
    expect(firstBusinessDayOfMonth(2026, 10, never)).toBeUndefined();
  });

  it('lists business days lazily in either direction', () => {
    expect([...listBusinessDays('2026-10-01', '2026-10-07')].map(iso)).toEqual(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07']);
    expect([...listBusinessDays('2026-10-07', '2026-10-01', undefined, { limit: 2 })].map(iso)).toEqual(['2026-10-07', '2026-10-06']);
    const gen = listBusinessDays('2026-01-01', '9999-12-31');
    expect(iso(gen.next().value ?? undefined)).toBe('2026-01-01');
    expect(code(() => listBusinessDays('2026-01-01', '2026-01-02', undefined, { limit: -1 }))).toBe('HLP_BIZCAL_INVALID_OPTION');
  });

  it('counts business days in periods, including fiscal years (B5)', () => {
    expect(businessDaysIn({ year: 2026, month: 10 })).toBe(22);
    expect(businessDaysIn({ year: 2026, quarter: 4 })).toBe(66);
    const india = createBusinessCalendar({ fiscalYearStartMonth: 4 });
    expect(periodRange({ fiscalYear: 2027 }, india).map(iso)).toEqual(['2026-04-01', '2027-03-31']);
    expect(periodRange({ fiscalYear: 2027, quarter: 3 }, india).map(iso)).toEqual(['2026-10-01', '2026-12-31']);
    const byStart = createBusinessCalendar({ fiscalYearStartMonth: 4, fiscalYearNaming: 'start' });
    expect(periodRange({ fiscalYear: 2026 }, byStart).map(iso)).toEqual(['2026-04-01', '2027-03-31']);
    expect(businessDaysIn({ fiscalYear: 2027, quarter: 3 }, india)).toBe(businessDaysIn({ year: 2026, quarter: 4 }));
    expect(code(() => businessDaysIn({ year: 2026, month: 13 }))).toBe('HLP_BIZCAL_INVALID_OPTION');
  });
});

function nextOrPrev(d: PlainDate, step: 1 | -1): PlainDate {
  const t = Date.UTC(d.year, d.month - 1, d.day) + step * 86_400_000;
  const x = new Date(t);
  return plainDate(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}

describe('business-calendar: differences', () => {
  it('defines inclusive semantics (Mon..Fri)', () => {
    const table: [string, number][] = [['start', 4], ['end', 4], ['both', 5], ['none', 3]];
    for (const [inclusive, n] of table) {
      expect(diffDays('2026-09-28', '2026-10-02', { mode: 'weekdays', inclusive: inclusive as 'start' })).toBe(n);
      expect(diffDays('2026-10-02', '2026-09-28', { mode: 'weekdays', inclusive: inclusive as 'start' })).toBe(-n);
    }
    expect(diffDays('2026-09-28', '2026-10-02')).toBe(4);
    expect(diffDays('2026-09-28', '2026-09-28', { inclusive: 'both', mode: 'business' })).toBe(1);
    expect(diffDays('2026-09-28', '2026-09-28', { mode: 'business' })).toBe(0);
    expect(Object.is(diffDays('2026-10-04', '2026-10-03', { mode: 'business' }), 0)).toBe(true);
    // Friday to Monday: [Fri, Mon) = 1 business day.
    expect(diffDays('2026-10-02', '2026-10-05', { mode: 'business' })).toBe(1);
    expect(diffDays('2026-10-02', '2026-10-05', { mode: 'weekdays', inclusive: 'none' })).toBe(0);
    expect(code(() => diffDays('2026-10-02', '2026-10-05', { inclusive: 'all' as never }))).toBe('HLP_BIZCAL_INVALID_OPTION');
    expect(code(() => diffDays('2026-10-02', '2026-10-05', { mode: 'months' as never }))).toBe('HLP_BIZCAL_INVALID_OPTION');
  });

  it('counts weekends, weekdays, and holidays without double counting', () => {
    expect(countWeekends('2026-10-01', '2026-10-31', { inclusive: 'both' })).toBe(9);
    expect(countWeekends('2026-10-31', '2026-10-01', { inclusive: 'both' })).toBe(9);
    expect(countWeekdays('2026-09-28', '2026-10-02', { inclusive: 'both' })).toBe(5);
    expect(countHolidays('2026-01-01', '2026-12-31', { inclusive: 'both', calendar: US })).toEqual({ total: 12, onWeekdays: 11, onWeekends: 1 });
    const b = diffBreakdown('2026-07-01', '2026-07-08', US, { inclusive: 'both' });
    expect(b).toMatchObject({ calendarDays: 8, weekdays: 6, weekendDays: 2, holidays: 1, holidaysOnWeekends: 1, businessDays: 5, businessHours: 40 });
    const r = diffBreakdown('2026-07-08', '2026-07-01', US, { inclusive: 'both' });
    expect(r.businessDays).toBe(-5);
    expect(r.calendarDays).toBe(-8);
    expect(diffBreakdown('2026-09-28', '2026-10-02', undefined, { inclusive: 'both' })).toMatchObject({ calendarDays: 5, weekdays: 5, businessDays: 5, businessHours: 40 });
  });

  it('counts a century quickly (O(years + log h))', () => {
    const fresh = createBusinessCalendar({ holidays: US_RULES });
    const t0 = performance.now();
    const n = diffDays('1950-01-01', '2050-01-01', { mode: 'business', calendar: fresh });
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
    expect(n).toBeGreaterThan(24_000);
    const t1 = performance.now();
    for (let i = 0; i < 1000; i++) diffDays('1950-01-01', '2050-01-01', { mode: 'business', calendar: fresh });
    expect(performance.now() - t1).toBeLessThan(500);
    expect(diffDays('-100000-01-01', '+100000-01-01', { mode: 'weekdays' })).toBeGreaterThan(0);
    expect(() => diffDays('-100000-01-01', '+100000-01-01', { mode: 'business' })).toThrow(LimitError);
  });
});

describe('business-calendar: composition', () => {
  const company = createBusinessCalendar({
    name: 'Company',
    holidays: [fixedHoliday('New Year', 1, 1), fixedHoliday('Karnataka Rajyotsava', 11, 1, { tags: ['IN-KA'] }), fixedHoliday('Maharashtra Day', 5, 1, { tags: ['IN-MH'] })],
    exceptions: [{ date: '2026-10-10', working: true, reason: 'A' }],
    timeZone: 'Asia/Kolkata',
  });

  it('scopes holidays by tag', () => {
    const ka = withTags(company, ['IN-KA']);
    expect(isHoliday('2027-11-01', ka)?.name).toBe('Karnataka Rajyotsava');
    expect(isHoliday('2027-05-03', ka)).toBeUndefined();
    expect(isHoliday('2026-05-01', ka)).toBeUndefined();
    expect(isHoliday('2026-01-01', ka)?.name).toBe('New Year');
    const strict = withTags(company, ['IN-KA'], { includeUntagged: false });
    expect(isHoliday('2026-01-01', strict)).toBeUndefined();
    expect(ka.timeZone).toBe('Asia/Kolkata');
    expect(isBusinessCalendar(ka)).toBe(true);
  });

  it('merges calendars', () => {
    const other = createBusinessCalendar({ name: 'Region', weekend: [5, 6], holidays: [fixedHoliday('Regional', 3, 3)], exceptions: [{ date: '2026-10-10', working: false }, { date: '2026-10-17', working: true }] });
    const merged = mergeCalendars([withTags(company, ['IN-MH']), other]);
    expect(merged.name).toBe('Company + Region');
    expect(merged.weekend).toEqual([6, 7]);
    expect(merged.timeZone).toBe('Asia/Kolkata');
    expect(isHoliday('2026-03-03', merged)?.name).toBe('Regional');
    expect(isHoliday('2026-05-01', merged)?.name).toBe('Maharashtra Day');
    expect(isHoliday('2026-11-02', merged)).toBeUndefined();
    expect(isBusinessDay('2026-10-10', merged)).toBe(true);
    expect(isBusinessDay('2026-10-17', merged)).toBe(true);
    expect(mergeCalendars([company, other], { weekend: [5, 6], name: 'X' }).weekend).toEqual([5, 6]);
    expect(code(() => mergeCalendars([]))).toBe('HLP_BIZCAL_INVALID_CALENDAR');
  });

  it('resolves dates of instants in the calendar zone', () => {
    const info = businessDayAt(Date.UTC(2026, 9, 2, 20), company);
    expect(iso(info.date)).toBe('2026-10-03');
    expect(info.reasonCode).toBe('weekend');
    expect(iso(businessDayAt(new Date(Date.UTC(2026, 9, 2, 17)), company).date)).toBe('2026-10-02');
  });
});

describe('business-calendar: validation and security', () => {
  it('rejects invalid definitions with stable codes and no user values in messages', () => {
    const cases: [unknown, string][] = [
      [null, 'HLP_BIZCAL_INVALID_DEFINITION'],
      [{ weekend: [8] }, 'HLP_BIZCAL_INVALID_WEEKDAY'],
      [{ weekend: [6, 6] }, 'HLP_BIZCAL_INVALID_WEEKEND'],
      [{ weekend: 'sat' }, 'HLP_BIZCAL_INVALID_WEEKEND'],
      [{ firstDayOfWeek: 0 }, 'HLP_BIZCAL_INVALID_WEEKDAY'],
      [{ timeZone: 'Mars/Olympus_Mons' }, 'HLP_BIZCAL_INVALID_TIME_ZONE'],
      [{ fiscalYearStartMonth: 13 }, 'HLP_BIZCAL_INVALID_FISCAL'],
      [{ fiscalYearNaming: 'middle' }, 'HLP_BIZCAL_INVALID_FISCAL'],
      [{ halfDayValue: 2 }, 'HLP_BIZCAL_INVALID_HALF_DAY'],
      [{ name: '   ' }, 'HLP_BIZCAL_INVALID_NAME'],
      [{ workingHours: { default: [['9:00', '17:00']] } }, 'HLP_BIZCAL_INVALID_HOURS'],
      [{ workingHours: { default: [['09:00', '09:00']] } }, 'HLP_BIZCAL_INVALID_HOURS'],
      [{ workingHours: { default: [['13:00', '17:00'], ['09:00', '12:00']] } }, 'HLP_BIZCAL_INVALID_HOURS'],
      [{ workingHours: { default: [['09:00', '13:00'], ['12:00', '17:00']] } }, 'HLP_BIZCAL_INVALID_HOURS'],
      [{ workingHours: { default: [['24:00', '24:00']] } }, 'HLP_BIZCAL_INVALID_HOURS'],
      [{ workingHours: { monday: [] } }, 'HLP_BIZCAL_INVALID_HOURS'],
      [{ workingHours: JSON.parse('{"__proto__": [["09:00", "17:00"]]}') as unknown }, 'HLP_BIZCAL_INVALID_HOURS'],
      [{ holidays: [{ kind: 'lunar', name: 'X' }] }, 'HLP_BIZCAL_INVALID_RULE'],
      [{ holidays: [{ kind: 'fixed', name: 'X', month: 2, day: 30 }] }, 'HLP_BIZCAL_INVALID_RULE'],
      [{ holidays: [{ kind: 'fixed', name: '', month: 2, day: 1 }] }, 'HLP_BIZCAL_INVALID_NAME'],
      [{ holidays: [{ kind: 'nth-weekday', name: 'X', month: 1, weekday: 1, n: 0 }] }, 'HLP_BIZCAL_INVALID_RULE'],
      [{ holidays: [{ kind: 'date', name: 'X', date: '2026-02-30' }] }, 'HLP_BIZCAL_INVALID_RULE'],
      [{ holidays: [{ kind: 'range', name: 'X', start: '2026-02-03', end: '2026-02-01' }] }, 'HLP_BIZCAL_INVALID_RULE'],
      [{ holidays: [{ kind: 'fixed', name: 'X', month: 1, day: 1, observed: 'someday' }] }, 'HLP_BIZCAL_INVALID_OBSERVED'],
      [{ holidays: [{ kind: 'fixed', name: 'X', month: 1, day: 1, observed: JSON.parse('{"__proto__": 1}') as unknown }] }, 'HLP_BIZCAL_INVALID_OBSERVED'],
      [{ holidays: [{ kind: 'fixed', name: 'X', month: 1, day: 1, observed: { 7: 9 } }] }, 'HLP_BIZCAL_INVALID_OBSERVED'],
      [{ holidays: [{ kind: 'fixed', name: 'X', month: 1, day: 1, tags: [''] }] }, 'HLP_BIZCAL_INVALID_TAGS'],
      [{ holidays: [{ kind: 'fixed', name: 'X', month: 1, day: 1, fromYear: 2030, toYear: 2020 }] }, 'HLP_BIZCAL_INVALID_RULE'],
      [{ holidays: [{ kind: 'custom', name: 'X' }] }, 'HLP_BIZCAL_INVALID_RULE'],
      [{ exceptions: [{ date: '2026-01-01', working: 'yes' }] }, 'HLP_BIZCAL_INVALID_EXCEPTION'],
      [{ exceptions: [{ date: '2026-01-01', working: false, hours: [] }] }, 'HLP_BIZCAL_INVALID_EXCEPTION'],
      [{ exceptions: [{ date: '2026-01-01', working: true }, { date: '2026-01-01', working: false }] }, 'HLP_BIZCAL_DUPLICATE_EXCEPTION'],
      [{ tagScope: { tags: 'x' } }, 'HLP_BIZCAL_INVALID_TAGS'],
    ];
    for (const [def, expected] of cases) {
      let error: unknown;
      try {
        createBusinessCalendar(def as never);
      } catch (e) {
        error = e;
      }
      expect(error, expected).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).code, JSON.stringify(def)).toBe(expected);
      expect((error as ValidationError).message).not.toMatch(/Mars|someday|lunar|9:00|middle/);
    }
    expect(() => createBusinessCalendar({ holidays: [holidayRangeTooLong()] })).toThrow(LimitError);
    expect(() => createBusinessCalendar({ holidays: Array.from({ length: 5001 }, () => fixedHoliday('X', 1, 1)) })).toThrow(LimitError);
    expect(() => createBusinessCalendar({ workingHours: { default: Array.from({ length: 49 }, (_, i) => [`${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '59' : '29'}`] as const) } })).toThrow(LimitError);
    expect(code(() => isBusinessDay('2026-01-01', {} as BusinessCalendar))).toBe('HLP_BIZCAL_INVALID_CALENDAR');
    expect(code(() => isBusinessDay('2026-13-01'))).toBe('HLP_INVALID_DATE');
    const badCustom = createBusinessCalendar({ holidays: [customHoliday('Bad', () => ['nope'])] });
    expect(code(() => isBusinessDay('2026-01-01', badCustom))).toBe('HLP_BIZCAL_INVALID_RULE');
    const tooMany = createBusinessCalendar({ holidays: [customHoliday('Many', () => Array.from({ length: 401 }, () => '2026-01-01'))] });
    expect(() => isBusinessDay('2026-01-01', tooMany)).toThrow(LimitError);
    expect(code(() => fixedHoliday('X', 13, 1))).toBe('HLP_BIZCAL_INVALID_RULE');
  });

  it('produces deeply frozen, re-creatable calendars and accepts 24:00 ends', () => {
    const cal = createBusinessCalendar({ workingHours: { default: [['22:00', '24:00']] }, holidays: [fixedHoliday('A', 1, 1, { tags: ['x'] })], exceptions: [{ date: '2026-01-02', working: false }] });
    expect(Object.isFrozen(cal)).toBe(true);
    expect(Object.isFrozen(cal.holidays)).toBe(true);
    expect(Object.isFrozen(cal.holidays[0])).toBe(true);
    expect(Object.isFrozen(cal.workingHours)).toBe(true);
    expect(Object.isFrozen(cal.exceptions[0])).toBe(true);
    expect(cal.workingHours['1']).toEqual([['22:00', '24:00']]);
    const again = createBusinessCalendar(cal.definition);
    expect(again.definition).toEqual(cal.definition);
    expect(isHoliday('2026-01-01', again)?.tags).toEqual(['x']);
    const input = { weekend: [6, 7] as const, holidays: [fixedHoliday('B', 2, 2)] };
    createBusinessCalendar({ ...input, weekend: [...input.weekend] });
    expect(input.weekend).toEqual([6, 7]);
  });
});

function holidayRangeTooLong(): HolidayRule {
  return { kind: 'range', name: 'Long', start: '2020-01-01', end: '2030-12-31' };
}
