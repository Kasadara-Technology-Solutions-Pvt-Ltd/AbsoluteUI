import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LimitError } from '@absoluteui/helpers/error';
import { parsePlainDateTime } from '@absoluteui/helpers/date';
import { zonedToInstant } from '@absoluteui/helpers/timezone';
import {
  addBusinessHours, createBusinessCalendar, diffBusinessHours, fixedHoliday, isWorkingTime, nextWorkingTime, oneOffHoliday, slaDeadline, workingIntervals,
} from '@absoluteui/helpers/business-calendar';

const H = 3_600_000;
const at = (text: string, zone: string): number => {
  const dt = parsePlainDateTime(text);
  if (!dt) throw new Error('bad test date');
  return zonedToInstant(dt, zone);
};
const ny = (text: string): number => at(text, 'America/New_York');
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

const office = createBusinessCalendar({
  timeZone: 'America/New_York',
  workingHours: { default: [['09:00', '12:00'], ['13:00', '17:00']] },
  holidays: [fixedHoliday('Columbus Day', 10, 12), fixedHoliday('Christmas Eve', 12, 24, { halfDay: true })],
});

describe('business-calendar: working time', () => {
  it('maps working hours to instants in the calendar zone', () => {
    expect(workingIntervals('2026-10-05')).toEqual([{ start: Date.UTC(2026, 9, 5, 9), end: Date.UTC(2026, 9, 5, 17) }]);
    expect(workingIntervals('2026-10-03')).toEqual([]);
    expect(workingIntervals('2026-10-05', office)).toEqual([{ start: ny('2026-10-05T09:00'), end: ny('2026-10-05T12:00') }, { start: ny('2026-10-05T13:00'), end: ny('2026-10-05T17:00') }]);
    expect(workingIntervals('2026-12-24', office)).toEqual([{ start: ny('2026-12-24T09:00'), end: ny('2026-12-24T12:00') }, { start: ny('2026-12-24T13:00'), end: ny('2026-12-24T13:30') }]);
    const kolkata = createBusinessCalendar({ timeZone: 'Asia/Kolkata' });
    expect(isWorkingTime(Date.UTC(2026, 9, 5, 4), kolkata)).toBe(true);
    expect(isWorkingTime(Date.UTC(2026, 9, 5, 12), kolkata)).toBe(false);
  });

  it('detects working time and finds the next working instant', () => {
    expect(isWorkingTime(ny('2026-10-05T10:00'), office)).toBe(true);
    expect(isWorkingTime(ny('2026-10-05T12:30'), office)).toBe(false);
    expect(isWorkingTime(ny('2026-10-05T17:00'), office)).toBe(false);
    expect(isWorkingTime(ny('2026-10-03T10:00'), office)).toBe(false);
    expect(isWorkingTime(ny('2026-10-12T10:00'), office)).toBe(false);
    expect(isWorkingTime(new Date(ny('2026-10-05T16:59')), office)).toBe(true);
    expect(nextWorkingTime(ny('2026-10-05T10:00'), office)).toBe(ny('2026-10-05T10:00'));
    expect(nextWorkingTime(ny('2026-10-05T12:30'), office)).toBe(ny('2026-10-05T13:00'));
    expect(nextWorkingTime(ny('2026-10-09T18:00'), office)).toBe(ny('2026-10-13T09:00'));
    const idle = createBusinessCalendar({ workingHours: { default: [] } });
    expect(code(() => nextWorkingTime(Date.UTC(2026, 0, 1), idle))).toBe('HLP_BIZCAL_NO_WORKING_DAYS');
    expect(code(() => addBusinessHours(Date.UTC(2026, 0, 1), 1, idle))).toBe('HLP_BIZCAL_NO_WORKING_DAYS');
    expect(code(() => isWorkingTime(Number.NaN, office))).toBe('HLP_INVALID_INSTANT');
  });
});

describe('business-calendar: business hours', () => {
  it('measures working time with lunch breaks, weekends, and holidays', () => {
    expect(diffBusinessHours(ny('2026-10-02T16:00'), ny('2026-10-05T10:00'), office)).toBe(2);
    expect(diffBusinessHours(ny('2026-10-05T10:00'), ny('2026-10-02T16:00'), office)).toBe(-2);
    expect(diffBusinessHours(ny('2026-10-05T11:00'), ny('2026-10-05T14:00'), office, { unit: 'milliseconds' })).toBe(2 * H);
    expect(diffBusinessHours(ny('2026-10-09T09:00'), ny('2026-10-13T17:00'), office)).toBe(14);
    expect(diffBusinessHours(ny('2026-10-05T12:10'), ny('2026-10-05T12:50'), office)).toBe(0);
    expect(code(() => diffBusinessHours(0, 1, office, { unit: 'days' as never }))).toBe('HLP_BIZCAL_INVALID_OPTION');
    expect(() => diffBusinessHours(Date.UTC(1900, 0, 1), Date.UTC(2100, 0, 1))).toThrow(LimitError);
  });

  it('is DST-correct in America/New_York', () => {
    const allDays = (hours: readonly (readonly [string, string])[]) => createBusinessCalendar({ weekend: [], timeZone: 'America/New_York', workingHours: { default: hours } });
    const night = allDays([['00:00', '04:00']]);
    const span = (d: string, cal = night): number => workingIntervals(d, cal).reduce((s, i) => s + i.end - i.start, 0) / H;
    expect(span('2026-03-08')).toBe(3);
    expect(span('2026-11-01')).toBe(5);
    expect(span('2026-03-09')).toBe(4);
    expect(diffBusinessHours(ny('2026-03-07T00:00'), ny('2026-03-10T00:00'), night)).toBe(11);
    expect(diffBusinessHours(ny('2026-10-31T00:00'), ny('2026-11-03T00:00'), night)).toBe(13);
    const day = allDays([['09:00', '17:00']]);
    expect(span('2026-03-08', day)).toBe(8);
    expect(span('2026-11-01', day)).toBe(8);
    const gap = allDays([['01:00', '03:00']]);
    expect(span('2026-03-08', gap)).toBe(1);
    expect(addBusinessHours(ny('2026-03-08T00:00'), 3, night)).toBe(ny('2026-03-08T04:00'));
    expect(addBusinessHours(ny('2026-11-01T00:00'), 5, night)).toBe(ny('2026-11-01T04:00'));
    expect(isWorkingTime(ny('2026-11-01T03:30'), night)).toBe(true);
  });

  it('adds and subtracts working time', () => {
    expect(addBusinessHours(ny('2026-10-02T16:00'), 2, office)).toBe(ny('2026-10-05T10:00'));
    expect(addBusinessHours(ny('2026-10-05T11:00'), 2, office)).toBe(ny('2026-10-05T14:00'));
    expect(addBusinessHours(ny('2026-10-05T16:00'), 1, office)).toBe(ny('2026-10-05T17:00'));
    expect(addBusinessHours(ny('2026-10-05T10:00'), -2, office)).toBe(ny('2026-10-02T16:00'));
    expect(addBusinessHours(ny('2026-10-05T13:00'), -1, office)).toBe(ny('2026-10-05T11:00'));
    expect(addBusinessHours(ny('2026-10-05T09:00'), -3, office)).toBe(ny('2026-10-02T14:00'));
    expect(addBusinessHours(ny('2026-10-03T12:00'), 0, office)).toBe(ny('2026-10-03T12:00'));
    expect(addBusinessHours(ny('2026-10-09T16:30'), 1, office)).toBe(ny('2026-10-13T09:30'));
    expect(code(() => addBusinessHours(0, Number.NaN, office))).toBe('HLP_BIZCAL_INVALID_OPTION');
    const start = ny('2026-01-05T08:00');
    const far = addBusinessHours(start, 10_000, office);
    expect(diffBusinessHours(start, far, office)).toBeCloseTo(10_000, 6);
  });

  it('addBusinessHours inverts diffBusinessHours', () => {
    const t0 = ny('2026-01-01T00:00');
    fc.assert(fc.property(fc.integer({ min: 0, max: 400 * 24 * 60 }), fc.integer({ min: -200 * 60, max: 200 * 60 }), (minute, deltaMinutes) => {
      const start = t0 + minute * 60_000;
      const hours = deltaMinutes / 60;
      const end = addBusinessHours(start, hours, office);
      expect(diffBusinessHours(start, end, office, { unit: 'milliseconds' })).toBe(Math.round(hours * H));
    }), { numRuns: 150 });
  });
});

describe('business-calendar: SLA deadlines', () => {
  const cal = createBusinessCalendar({ holidays: [oneOffHoliday('Holiday', '2026-10-05')] });
  it('crosses weekends and holidays', () => {
    const fri = Date.UTC(2026, 9, 2, 16);
    expect(slaDeadline(fri, { businessHours: 4 }, cal)).toBe(Date.UTC(2026, 9, 6, 12));
    expect(slaDeadline(fri, { businessDays: 1 }, cal)).toBe(Date.UTC(2026, 9, 6, 17));
    expect(slaDeadline(fri, { businessDays: 0 }, cal)).toBe(Date.UTC(2026, 9, 2, 17));
    expect(slaDeadline(Date.UTC(2026, 9, 3, 10), { businessDays: 0 }, cal)).toBe(Date.UTC(2026, 9, 6, 17));
    expect(slaDeadline(Date.UTC(2026, 9, 3, 10), { businessDays: 2 }, cal)).toBe(Date.UTC(2026, 9, 7, 17));
    expect(slaDeadline(Date.UTC(2026, 9, 3, 10), { businessHours: 8 }, cal)).toBe(Date.UTC(2026, 9, 6, 17));
    const noHours = createBusinessCalendar({ workingHours: { default: [], 1: [['09:00', '10:00']] } });
    expect(slaDeadline(Date.UTC(2026, 9, 1, 10), { businessDays: 1 }, noHours)).toBe(Date.UTC(2026, 9, 2, 23, 59, 59, 999));
    expect(code(() => slaDeadline(fri, {} as never, cal))).toBe('HLP_BIZCAL_INVALID_OPTION');
    expect(code(() => slaDeadline(fri, { businessDays: 1, businessHours: 2 }, cal))).toBe('HLP_BIZCAL_INVALID_OPTION');
    expect(code(() => slaDeadline(fri, { businessDays: -1 }, cal))).toBe('HLP_BIZCAL_INVALID_OPTION');
    expect(code(() => slaDeadline(fri, { businessHours: -1 }, cal))).toBe('HLP_BIZCAL_INVALID_OPTION');
  });
});
