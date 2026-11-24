import { afterEach, describe, expect, it } from 'vitest';
import {
  AbsoluteUIError,
  addDays,
  addMonths,
  comparePlainYearMonth,
  comparePlainYearQuarter,
  configureAbsoluteUI,
  dayOfWeek,
  duration,
  durationToString,
  formatInstant,
  formatOffset,
  getLocalTimeStatus,
  getPossibleInstants,
  instantToString,
  parseDuration,
  parseInstant,
  parsePlainDate,
  parsePlainTime,
  parsePlainYearMonth,
  parsePlainYearQuarter,
  plainDate,
  plainDateTime,
  plainDateToString,
  plainTime,
  plainYearMonth,
  plainYearMonthToString,
  plainYearQuarter,
  plainYearQuarterToString,
  resetAbsoluteUIConfig,
  toInstant,
  toPlainDateTime,
  type PlainDateTime,
  type TimeZoneEngine,
} from '@absoluteui/core';

// All tests use fixed instants; nothing depends on the test machine's clock or zone (§23.5).
const pdt = (y: number, mo: number, d: number, h = 0, mi = 0): PlainDateTime => plainDateTime(plainDate(y, mo, d), plainTime(h, mi));
const iso = (y: number, mo: number, d: number, h: number, mi: number, zone: string, dis?: 'compatible' | 'earlier' | 'later' | 'reject'): string =>
  instantToString(toInstant(pdt(y, mo, d, h, mi), zone, dis));

afterEach(() => {
  resetAbsoluteUIConfig();
});

describe('UTC and fixed offsets', () => {
  it('UTC round-trips', () => {
    expect(iso(2026, 1, 15, 10, 0, 'UTC')).toBe('2026-01-15T10:00:00.000Z');
  });

  it('Asia/Kolkata: +05:30 fractional offset, no DST', () => {
    expect(iso(2026, 1, 15, 0, 0, 'Asia/Kolkata')).toBe('2026-01-14T18:30:00.000Z');
    expect(iso(2026, 7, 15, 0, 0, 'Asia/Kolkata')).toBe('2026-07-14T18:30:00.000Z');
    expect(formatOffset(parseInstant('2026-07-01T00:00:00Z')!, 'Asia/Kolkata')).toBe('+05:30');
  });

  it('negative offsets: America/New_York standard and daylight time', () => {
    expect(iso(2026, 1, 15, 12, 0, 'America/New_York')).toBe('2026-01-15T17:00:00.000Z');
    expect(iso(2026, 7, 15, 12, 0, 'America/New_York')).toBe('2026-07-15T16:00:00.000Z');
  });
});

describe('DST: America/New_York (1-hour shift)', () => {
  it('nonexistent 02:30 on 2026-03-08', () => {
    expect(getLocalTimeStatus(pdt(2026, 3, 8, 2, 30), 'America/New_York')).toBe('nonexistent');
    expect(getPossibleInstants(pdt(2026, 3, 8, 2, 30), 'America/New_York')).toHaveLength(0);
    expect(iso(2026, 3, 8, 2, 30, 'America/New_York', 'compatible')).toBe('2026-03-08T07:30:00.000Z');
    expect(iso(2026, 3, 8, 2, 30, 'America/New_York', 'later')).toBe('2026-03-08T07:30:00.000Z');
    expect(iso(2026, 3, 8, 2, 30, 'America/New_York', 'earlier')).toBe('2026-03-08T06:30:00.000Z');
    expect(() => iso(2026, 3, 8, 2, 30, 'America/New_York', 'reject')).toThrow(AbsoluteUIError);
  });

  it('ambiguous 01:30 on 2026-11-01', () => {
    expect(getLocalTimeStatus(pdt(2026, 11, 1, 1, 30), 'America/New_York')).toBe('ambiguous');
    expect(iso(2026, 11, 1, 1, 30, 'America/New_York', 'compatible')).toBe('2026-11-01T05:30:00.000Z');
    expect(iso(2026, 11, 1, 1, 30, 'America/New_York', 'earlier')).toBe('2026-11-01T05:30:00.000Z');
    expect(iso(2026, 11, 1, 1, 30, 'America/New_York', 'later')).toBe('2026-11-01T06:30:00.000Z');
    expect(() => iso(2026, 11, 1, 1, 30, 'America/New_York', 'reject')).toThrow(/ambiguous/);
  });

  it('uses the configured disambiguation policy by default', () => {
    configureAbsoluteUI({ disambiguation: 'later' });
    expect(iso(2026, 11, 1, 1, 30, 'America/New_York')).toBe('2026-11-01T06:30:00.000Z');
  });
});

describe('DST: Europe/London (transition at UTC+0)', () => {
  it('nonexistent 01:30 on 2026-03-29', () => {
    expect(iso(2026, 3, 29, 1, 30, 'Europe/London')).toBe('2026-03-29T01:30:00.000Z');
    expect(toPlainDateTime(parseInstant('2026-03-29T01:30:00Z')!, 'Europe/London').time.hour).toBe(2);
  });

  it('ambiguous 01:30 on 2026-10-25', () => {
    expect(iso(2026, 10, 25, 1, 30, 'Europe/London', 'earlier')).toBe('2026-10-25T00:30:00.000Z');
    expect(iso(2026, 10, 25, 1, 30, 'Europe/London', 'later')).toBe('2026-10-25T01:30:00.000Z');
  });
});

describe('DST: Australia/Lord_Howe (30-minute shift)', () => {
  it('nonexistent 02:15 on 2026-10-04 shifts forward 30 minutes', () => {
    expect(getLocalTimeStatus(pdt(2026, 10, 4, 2, 15), 'Australia/Lord_Howe')).toBe('nonexistent');
    const result = toInstant(pdt(2026, 10, 4, 2, 15), 'Australia/Lord_Howe');
    expect(instantToString(result)).toBe('2026-10-03T15:45:00.000Z');
    const local = toPlainDateTime(result, 'Australia/Lord_Howe');
    expect([local.time.hour, local.time.minute]).toEqual([2, 45]);
  });

  it('ambiguous 01:45 on 2026-04-05', () => {
    expect(iso(2026, 4, 5, 1, 45, 'Australia/Lord_Howe', 'earlier')).toBe('2026-04-04T14:45:00.000Z');
    expect(iso(2026, 4, 5, 1, 45, 'Australia/Lord_Howe', 'later')).toBe('2026-04-04T15:15:00.000Z');
  });
});

describe('date rollover, leap years, ranges', () => {
  it('rolls the calendar date across zones', () => {
    const local = toPlainDateTime(parseInstant('2026-12-31T20:00:00Z')!, 'Asia/Kolkata');
    expect(plainDateToString(local.date)).toBe('2027-01-01');
    expect([local.time.hour, local.time.minute]).toEqual([1, 30]);
  });

  it('handles leap years', () => {
    expect(plainDateToString(plainDate(2028, 2, 29))).toBe('2028-02-29');
    expect(() => plainDate(2026, 2, 29)).toThrow(AbsoluteUIError);
    expect(() => plainDate(2100, 2, 29)).toThrow(AbsoluteUIError);
    expect(plainDateToString(plainDate(2000, 2, 29))).toBe('2000-02-29');
    expect(plainDateToString(addDays(plainDate(2028, 2, 28), 1))).toBe('2028-02-29');
    expect(plainDateToString(addMonths(plainDate(2028, 1, 31), 1))).toBe('2028-02-29');
    expect(plainDateToString(addMonths(plainDate(2026, 1, 31), 1))).toBe('2026-02-28');
  });

  it('a local day range spans 23 hours on a spring-forward day', () => {
    const start = toInstant(pdt(2026, 3, 8), 'America/New_York');
    const end = toInstant(pdt(2026, 3, 9), 'America/New_York');
    expect((end.epochMilliseconds - start.epochMilliseconds) / 3_600_000).toBe(23);
  });

  it('the same local date maps to different instants in different zones', () => {
    const tokyo = toInstant(pdt(2026, 6, 1), 'Asia/Tokyo');
    const ny = toInstant(pdt(2026, 6, 1), 'America/New_York');
    expect((ny.epochMilliseconds - tokyo.epochMilliseconds) / 3_600_000).toBe(13);
  });

  it('supports years 0-99 without the Date.UTC 1900 mapping bug', () => {
    const local = toPlainDateTime(toInstant(pdt(50, 6, 15, 12, 0), 'UTC'), 'UTC');
    expect(local.date.year).toBe(50);
  });

  it('computes ISO weekday', () => {
    expect(dayOfWeek(plainDate(2026, 9, 27))).toBe(7);
    expect(dayOfWeek(plainDate(2026, 9, 28))).toBe(1);
  });
});

describe('strict parsing (§8.4: no ambiguous strings)', () => {
  it('parses only strict ISO forms', () => {
    expect(parsePlainDate('2026-02-03')).toEqual(plainDate(2026, 2, 3));
    expect(parsePlainDate('2026-2-3')).toBeNull();
    expect(parsePlainDate('2026-02-30')).toBeNull();
    expect(parsePlainDate('02/03/2026')).toBeNull();
    expect(parsePlainTime('23:59:59.5')).toEqual(plainTime(23, 59, 59, 500));
    expect(parsePlainTime('24:00')).toBeNull();
  });

  it('requires an explicit offset for instants', () => {
    expect(parseInstant('2026-03-08T02:30')).toBeNull();
    expect(instantToString(parseInstant('2026-03-08T02:30:00+05:30')!)).toBe('2026-03-07T21:00:00.000Z');
  });
});

describe('period and duration value types (§8.4)', () => {
  it('creates frozen, validated year-month and quarter values', () => {
    const ym = plainYearMonth(2026, 3);
    expect(Object.isFrozen(ym)).toBe(true);
    expect(ym).toEqual({ kind: 'PlainYearMonth', year: 2026, month: 3 });
    expect(() => plainYearMonth(2026, 13)).toThrow(AbsoluteUIError);
    expect(() => plainYearMonth(2026.5, 1)).toThrow(AbsoluteUIError);
    expect(Object.isFrozen(plainYearQuarter(2026, 4))).toBe(true);
    expect(() => plainYearQuarter(2026, 0)).toThrow(AbsoluteUIError);
    expect(() => plainYearQuarter(2026, 5)).toThrow(AbsoluteUIError);
  });

  it('compares and serializes periods', () => {
    expect(comparePlainYearMonth(plainYearMonth(2025, 12), plainYearMonth(2026, 1))).toBe(-1);
    expect(comparePlainYearMonth(plainYearMonth(2026, 1), plainYearMonth(2026, 1))).toBe(0);
    expect(comparePlainYearQuarter(plainYearQuarter(2026, 2), plainYearQuarter(2025, 4))).toBe(1);
    expect(plainYearMonthToString(plainYearMonth(2026, 3))).toBe('2026-03');
    expect(plainYearMonthToString(plainYearMonth(12, 3))).toBe('0012-03');
    expect(plainYearQuarterToString(plainYearQuarter(2026, 2))).toBe('2026-Q2');
  });

  it('parses only strict period forms', () => {
    expect(parsePlainYearMonth('2026-03')).toEqual(plainYearMonth(2026, 3));
    expect(parsePlainYearMonth('2026-3')).toBeNull();
    expect(parsePlainYearMonth('2026-13')).toBeNull();
    expect(parsePlainYearMonth('03/2026')).toBeNull();
    expect(parsePlainYearQuarter('2026-Q4')).toEqual(plainYearQuarter(2026, 4));
    expect(parsePlainYearQuarter('2026-Q5')).toBeNull();
    expect(parsePlainYearQuarter('2026Q1')).toBeNull();
  });

  it('serializes fixed-length durations as ISO 8601 without calendar days', () => {
    expect(durationToString(duration(90 * 60_000))).toBe('PT1H30M');
    expect(durationToString(duration(36 * 3_600_000))).toBe('PT36H');
    expect(durationToString(duration(0))).toBe('PT0S');
    expect(durationToString(duration(250))).toBe('PT0.25S');
    expect(durationToString(duration(3_600_000 + 5_000))).toBe('PT1H5S');
    expect(durationToString(duration(-5 * 60_000))).toBe('-PT5M');
  });

  it('parses strict ISO 8601 durations; a day is exactly 24 hours', () => {
    expect(parseDuration('PT1H30M')?.milliseconds).toBe(5_400_000);
    expect(parseDuration('P1DT2H')?.milliseconds).toBe(26 * 3_600_000);
    expect(parseDuration('P2D')?.milliseconds).toBe(48 * 3_600_000);
    expect(parseDuration('PT1.5S')?.milliseconds).toBe(1500);
    expect(parseDuration('-PT5M')?.milliseconds).toBe(-300_000);
    expect(parseDuration('PT0S')?.milliseconds).toBe(0);
    for (const bad of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W', 'PT1.5H', '1H', 'pt1h', 'PT1H30']) expect(parseDuration(bad)).toBeNull();
    for (const ms of [0, 1, 999, 59_999, 5_400_000, 90_061_001]) expect(parseDuration(durationToString(duration(ms)))?.milliseconds).toBe(ms);
  });
});

describe('formatting never uses the host timezone (§8.1)', () => {
  it('formats in UTC unless configured', () => {
    const at = parseInstant('2026-06-01T12:00:00Z')!;
    const opts = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const;
    expect(formatInstant(at, opts)).toBe(new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(at.epochMilliseconds));
    configureAbsoluteUI({ timezone: 'Asia/Kolkata' });
    expect(formatInstant(at, opts)).toBe('17:30');
  });
});

describe('pluggable timezone engine (§8.7)', () => {
  it('uses a configured authoritative resolver', () => {
    const fixed: TimeZoneEngine = { getOffsetMs: () => 3 * 3_600_000, isValidTimeZone: (tz) => tz === 'Server/Zone' };
    configureAbsoluteUI({ timeZoneEngine: fixed });
    expect(iso(2026, 1, 1, 3, 0, 'Server/Zone')).toBe('2026-01-01T00:00:00.000Z');
    expect(() => iso(2026, 1, 1, 3, 0, 'America/New_York')).toThrow(/Unsupported timezone/);
  });
});
