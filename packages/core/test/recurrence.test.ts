import { describe, expect, it } from 'vitest';
import {
  AbsoluteUIError,
  describeRecurrence,
  expandRecurrence,
  instantToString,
  parseInstant,
  parseRecurrenceRule,
  plainDate,
  plainDateTime,
  plainDateToString,
  plainTime,
  recurrenceRule,
  recurrenceRuleToString,
  type PlainDate,
  type PlainDateTime,
  type RecurrenceRule,
} from '@absoluteui/core';

// Fixed instants and zones only (§23.5). Expected dates are the RFC 5545 §3.8.5.3 examples.
const NY = 'America/New_York';
const at = (y: number, m: number, d: number, h = 9, mi = 0): PlainDateTime => plainDateTime(plainDate(y, m, d), plainTime(h, mi));
const rule = (text: string): RecurrenceRule => {
  const r = parseRecurrenceRule(text);
  if (!r) throw new Error(`unparsed: ${text}`);
  return r;
};
const dates = (r: RecurrenceRule, start: PlainDateTime | PlainDate, limit = 100): string[] =>
  expandRecurrence(r, start, { timeZone: NY, limit }).map((o) => plainDateToString(o.start.kind === 'PlainDate' ? o.start : o.start.date));
const instant = (text: string) => {
  const i = parseInstant(text);
  if (!i) throw new Error(text);
  return i;
};

describe('recurrence expansion (RFC 5545 examples)', () => {
  it('daily for 10 occurrences', () => {
    expect(dates(rule('FREQ=DAILY;COUNT=10'), at(1997, 9, 2))).toEqual(['1997-09-02', '1997-09-03', '1997-09-04', '1997-09-05', '1997-09-06', '1997-09-07', '1997-09-08', '1997-09-09', '1997-09-10', '1997-09-11']);
  });

  it('every 10 days, 5 occurrences', () => {
    expect(dates(rule('FREQ=DAILY;INTERVAL=10;COUNT=5'), at(1997, 9, 2))).toEqual(['1997-09-02', '1997-09-12', '1997-09-22', '1997-10-02', '1997-10-12']);
  });

  it('weekly for 10 occurrences keeps 09:00 local across the DST change', () => {
    const occ = expandRecurrence(rule('FREQ=WEEKLY;COUNT=10'), at(1997, 9, 2), { timeZone: NY });
    expect(occ.map((o) => o.instant && instantToString(o.instant))).toEqual([
      '1997-09-02T13:00:00.000Z', '1997-09-09T13:00:00.000Z', '1997-09-16T13:00:00.000Z', '1997-09-23T13:00:00.000Z', '1997-09-30T13:00:00.000Z',
      '1997-10-07T13:00:00.000Z', '1997-10-14T13:00:00.000Z', '1997-10-21T13:00:00.000Z', '1997-10-28T14:00:00.000Z', '1997-11-04T14:00:00.000Z',
    ]);
  });

  it('weekly on Tuesday and Thursday until an instant (WKST=SU)', () => {
    expect(dates(rule('FREQ=WEEKLY;UNTIL=19971007T000000Z;WKST=SU;BYDAY=TU,TH'), at(1997, 9, 2))).toEqual(['1997-09-02', '1997-09-04', '1997-09-09', '1997-09-11', '1997-09-16', '1997-09-18', '1997-09-23', '1997-09-25', '1997-09-30', '1997-10-02']);
  });

  it('every other week on Monday, Wednesday, Friday (unsynchronized start counts first)', () => {
    expect(dates(rule('FREQ=WEEKLY;INTERVAL=2;UNTIL=19971224T000000Z;WKST=SU;BYDAY=MO,WE,FR'), at(1997, 9, 2)).slice(0, 10)).toEqual(['1997-09-02', '1997-09-03', '1997-09-05', '1997-09-15', '1997-09-17', '1997-09-19', '1997-09-29', '1997-10-01', '1997-10-03', '1997-10-13']);
  });

  it('monthly on the first Friday', () => {
    expect(dates(rule('FREQ=MONTHLY;COUNT=10;BYDAY=1FR'), at(1997, 9, 5))).toEqual(['1997-09-05', '1997-10-03', '1997-11-07', '1997-12-05', '1998-01-02', '1998-02-06', '1998-03-06', '1998-04-03', '1998-05-01', '1998-06-05']);
  });

  it('monthly on the second-to-last Monday', () => {
    expect(dates(rule('FREQ=MONTHLY;COUNT=6;BYDAY=-2MO'), at(1997, 9, 22))).toEqual(['1997-09-22', '1997-10-20', '1997-11-17', '1997-12-22', '1998-01-19', '1998-02-16']);
  });

  it('monthly on the third-to-last day', () => {
    expect(dates(rule('FREQ=MONTHLY;BYMONTHDAY=-3'), at(1997, 9, 28), 6)).toEqual(['1997-09-28', '1997-10-29', '1997-11-28', '1997-12-29', '1998-01-29', '1998-02-26']);
  });

  it('monthly on the 2nd and 15th', () => {
    expect(dates(rule('FREQ=MONTHLY;COUNT=10;BYMONTHDAY=2,15'), at(1997, 9, 2))).toEqual(['1997-09-02', '1997-09-15', '1997-10-02', '1997-10-15', '1997-11-02', '1997-11-15', '1997-12-02', '1997-12-15', '1998-01-02', '1998-01-15']);
  });

  it('last workday of the month (BYSETPOS=-1)', () => {
    expect(dates(rule('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'), at(1997, 9, 30), 7)).toEqual(['1997-09-30', '1997-10-31', '1997-11-28', '1997-12-31', '1998-01-30', '1998-02-27', '1998-03-31']);
  });

  it('third Tuesday, Wednesday, or Thursday of the month', () => {
    expect(dates(rule('FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3'), at(1997, 9, 4))).toEqual(['1997-09-04', '1997-10-07', '1997-11-06']);
  });

  it('yearly in June and July', () => {
    expect(dates(rule('FREQ=YEARLY;COUNT=10;BYMONTH=6,7'), at(1997, 6, 10))).toEqual(['1997-06-10', '1997-07-10', '1998-06-10', '1998-07-10', '1999-06-10', '1999-07-10', '2000-06-10', '2000-07-10', '2001-06-10', '2001-07-10']);
  });

  it('every 20th Monday of the year', () => {
    expect(dates(rule('FREQ=YEARLY;BYDAY=20MO'), at(1997, 5, 19), 3)).toEqual(['1997-05-19', '1998-05-18', '1999-05-17']);
  });

  it('every Friday the 13th, with the start excluded', () => {
    const r = rule('RRULE:FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13\nEXDATE:19970902T090000');
    expect(dates(r, at(1997, 9, 2), 5)).toEqual(['1998-02-13', '1998-03-13', '1998-11-13', '1999-08-13', '2000-10-13']);
  });

  it('skips invalid dates instead of clamping (30 February)', () => {
    expect(dates(rule('FREQ=MONTHLY;BYMONTHDAY=15,30;COUNT=5'), at(2007, 1, 15))).toEqual(['2007-01-15', '2007-01-30', '2007-02-15', '2007-03-15', '2007-03-30']);
  });

  it('week start changes weekly periods (WKST)', () => {
    expect(dates(rule('FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO'), at(1997, 8, 5))).toEqual(['1997-08-05', '1997-08-10', '1997-08-19', '1997-08-24']);
    expect(dates(rule('FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU'), at(1997, 8, 5))).toEqual(['1997-08-05', '1997-08-17', '1997-08-19', '1997-08-31']);
  });

  it('29 February yearly occurs only in leap years', () => {
    expect(dates(rule('FREQ=YEARLY;COUNT=3'), plainDate(2024, 2, 29))).toEqual(['2024-02-29', '2028-02-29', '2032-02-29']);
  });
});

describe('recurrence expansion: DST, ranges, sets', () => {
  it('a start time inside the spring-forward gap moves forward by the gap (Europe/London)', () => {
    const occ = expandRecurrence(rule('FREQ=DAILY;COUNT=4'), at(2026, 3, 27, 1, 30), { timeZone: 'Europe/London' });
    expect(occ.map((o) => o.instant && instantToString(o.instant))).toEqual(['2026-03-27T01:30:00.000Z', '2026-03-28T01:30:00.000Z', '2026-03-29T01:30:00.000Z', '2026-03-30T00:30:00.000Z']);
  });

  it('an ambiguous fall-back time resolves to the earlier instant by default and later on request', () => {
    const r = rule('FREQ=DAILY;COUNT=2');
    const start = at(2026, 10, 24, 1, 30);
    expect(expandRecurrence(r, start, { timeZone: 'Europe/London' })[1]?.instant?.epochMilliseconds).toBe(Date.UTC(2026, 9, 25, 0, 30));
    expect(expandRecurrence(r, start, { timeZone: 'Europe/London', disambiguation: 'later' })[1]?.instant?.epochMilliseconds).toBe(Date.UTC(2026, 9, 25, 1, 30));
  });

  it('keeps half-hour DST shifts (Australia/Lord_Howe) and fractional zones (Asia/Kolkata)', () => {
    const lh = expandRecurrence(rule('FREQ=WEEKLY;COUNT=2'), at(2026, 9, 30, 9, 0), { timeZone: 'Australia/Lord_Howe' });
    // Lord Howe moves from +10:30 to +11:00 on 4 October 2026.
    expect(lh.map((o) => o.instant && instantToString(o.instant))).toEqual(['2026-09-29T22:30:00.000Z', '2026-10-06T22:00:00.000Z']);
    const kolkata = expandRecurrence(rule('FREQ=DAILY;COUNT=1'), at(2026, 1, 1, 9, 0), { timeZone: 'Asia/Kolkata' });
    expect(kolkata[0]?.instant && instantToString(kolkata[0].instant)).toBe('2026-01-01T03:30:00.000Z');
  });

  it('returns only occurrences in [from, to) and fast-forwards unbounded series', () => {
    const occ = expandRecurrence(rule('FREQ=DAILY'), at(2000, 1, 1), { timeZone: 'UTC', from: instant('2026-06-01T00:00:00Z'), to: instant('2026-06-04T00:00:00Z') });
    expect(occ.map((o) => o.instant && instantToString(o.instant))).toEqual(['2026-06-01T09:00:00.000Z', '2026-06-02T09:00:00.000Z', '2026-06-03T09:00:00.000Z']);
  });

  it('counts from the start even when from is later', () => {
    const occ = expandRecurrence(rule('FREQ=WEEKLY;COUNT=3'), at(2026, 1, 5), { timeZone: 'UTC', from: instant('2026-01-10T00:00:00Z') });
    expect(occ.map((o) => plainDateToString((o.start as PlainDateTime).date))).toEqual(['2026-01-12', '2026-01-19']);
  });

  it('adds RDATE, removes EXDATE (dates remove the whole day), and does not count RDATE toward COUNT', () => {
    const r = recurrenceRule({ frequency: 'daily', count: 3, exclusions: [plainDate(2026, 1, 2)], inclusions: [at(2026, 1, 10)] });
    expect(dates(r, at(2026, 1, 1))).toEqual(['2026-01-01', '2026-01-03', '2026-01-10']);
  });

  it('expands all-day series with PlainDate bounds', () => {
    const occ = expandRecurrence(rule('FREQ=YEARLY;UNTIL=20280101'), plainDate(2025, 12, 25), { from: plainDate(2026, 1, 1) });
    expect(occ.map((o) => o.start.kind === 'PlainDate' && plainDateToString(o.start))).toEqual(['2026-12-25', '2027-12-25']);
    expect(occ[0]?.instant).toBeNull();
  });

  it('respects the limit and terminates for rules that never match', () => {
    expect(expandRecurrence(rule('FREQ=DAILY'), at(2026, 1, 1), { limit: 5 })).toHaveLength(5);
    const never = expandRecurrence(rule('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30'), at(2026, 1, 1), { limit: 5 });
    expect(never).toHaveLength(1);
  });

  it('rejects bounds of the wrong kind', () => {
    expect(() => expandRecurrence(rule('FREQ=DAILY'), at(2026, 1, 1), { from: plainDate(2026, 1, 1) })).toThrow(AbsoluteUIError);
    expect(() => expandRecurrence(rule('FREQ=DAILY'), plainDate(2026, 1, 1), { from: instant('2026-01-01T00:00:00Z') })).toThrow(/RECURRENCE_EXPAND/);
  });
});

describe('recurrence text', () => {
  it('round-trips iCalendar text', () => {
    const texts = [
      'RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=19971224T000000Z;BYDAY=MO,WE,FR;WKST=SU',
      'RRULE:FREQ=MONTHLY;COUNT=6;BYDAY=-2MO',
      'RRULE:FREQ=YEARLY;BYMONTH=6,7;BYMONTHDAY=1,-1;BYSETPOS=1',
      'RRULE:FREQ=DAILY;UNTIL=20261231\nEXDATE;VALUE=DATE:20260105,20260106\nRDATE;VALUE=DATE:20260201',
      'RRULE:FREQ=DAILY;UNTIL=20261231T090000\nEXDATE:20260105T090000',
    ];
    for (const t of texts) expect(recurrenceRuleToString(rule(t))).toBe(t);
  });

  it('accepts a bare rule value, lower case, and CRLF', () => {
    expect(recurrenceRuleToString(rule('freq=daily;count=2'))).toBe('RRULE:FREQ=DAILY;COUNT=2');
    expect(rule('RRULE:FREQ=DAILY\r\nEXDATE:20260101T090000').exclusions).toHaveLength(1);
  });

  it('refuses unsupported or contradictory input', () => {
    for (const t of [
      'FREQ=HOURLY',
      'FREQ=DAILY;BYHOUR=9',
      'FREQ=YEARLY;BYWEEKNO=20',
      'FREQ=DAILY;COUNT=2;UNTIL=20260101',
      'FREQ=WEEKLY;BYDAY=1MO',
      'FREQ=WEEKLY;BYMONTHDAY=1',
      'FREQ=DAILY;BYSETPOS=1',
      'FREQ=MONTHLY;BYDAY=6MO',
      'FREQ=DAILY;FREQ=WEEKLY',
      'FREQ=DAILY;INTERVAL=0',
      'RRULE:FREQ=DAILY\nEXDATE;TZID=Europe/London:20260101T090000',
      'RRULE:FREQ=DAILY\nEXDATE:20260101T090000Z',
      'RRULE:FREQ=DAILY\nDTSTART:20260101T090000',
      'EXDATE:20260101T090000',
      '',
    ]) expect(parseRecurrenceRule(t), t).toBeNull();
  });

  it('validates constructed rules', () => {
    expect(() => recurrenceRule({ frequency: 'weekly', byDay: [{ weekday: 1, nth: 1 }] })).toThrow(/RECURRENCE_INVALID/);
    expect(() => recurrenceRule({ frequency: 'daily', exclusions: [plainDate(2026, 1, 1), at(2026, 1, 2)] })).toThrow(/RECURRENCE_INVALID/);
    const r = recurrenceRule({ frequency: 'weekly', byDay: [{ weekday: 3 }, { weekday: 1 }, { weekday: 1 }] });
    expect(r.byDay).toEqual([{ weekday: 1 }, { weekday: 3 }]);
    expect(Object.isFrozen(r) && Object.isFrozen(r.byDay)).toBe(true);
  });

  it('describes rules in the locale', () => {
    expect(describeRecurrence(rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'))).toBe('Every 2 weeks on Monday and Wednesday');
    expect(describeRecurrence(rule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'))).toBe('Every weekday');
    expect(describeRecurrence(rule('FREQ=MONTHLY;COUNT=10;BYDAY=1FR'))).toBe('Every month on the first Friday, 10 times');
    expect(describeRecurrence(rule('FREQ=MONTHLY;BYMONTHDAY=-1'))).toBe('Every month on the last day');
    expect(describeRecurrence(rule('FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=3'))).toBe('Every year on October 3');
    expect(describeRecurrence(rule('FREQ=DAILY;UNTIL=20261231'))).toBe('Every day, until Dec 31, 2026');
    expect(describeRecurrence(rule('FREQ=WEEKLY'), { start: plainDate(2026, 9, 29) })).toBe('Every week on Tuesday');
    expect(describeRecurrence(rule('FREQ=MONTHLY'), { start: plainDate(2026, 9, 15) })).toBe('Every month on day 15');
    expect(describeRecurrence(rule('FREQ=DAILY;COUNT=1'))).toBe('Every day, once');
    expect(describeRecurrence(rule('FREQ=WEEKLY;BYDAY=MO'), { locale: 'de-DE' })).toContain('Montag');
  });
});
