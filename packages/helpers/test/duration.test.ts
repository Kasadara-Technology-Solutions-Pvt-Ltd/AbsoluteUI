import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ValidationError } from '@absoluteui/helpers/error';
import { parsePlainDateTime, plainDate, type PlainDateTime } from '@absoluteui/helpers/date';
import {
  addDuration, addDurationInZone, compareDurations, duration, durationToMilliseconds, formatClock, formatDuration, formatIsoDuration, humanizeDuration,
  isDuration, millisecondsToDuration, negateDuration, normalizeDuration, parseIsoDuration, type Duration,
} from '@absoluteui/helpers/duration';

// Native Temporal (current Chromium) as an oracle; tests using it are skipped when absent.
interface TemporalApi {
  ZonedDateTime: { from(text: string): object };
  Duration: { from(text: string): { total(options: { unit: string; relativeTo: object }): number } };
}
const Temporal = (globalThis as { Temporal?: TemporalApi }).Temporal;

const H = 3_600_000;
const M = 60_000;
function pdt(text: string): PlainDateTime {
  const v = parsePlainDateTime(text);
  if (!v) throw new Error('Bad test date-time.');
  return v;
}
function iso(text: string): Duration {
  const v = parseIsoDuration(text);
  if (!v) throw new Error('Bad test duration.');
  return v;
}
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

const arbDuration = fc.record({
  years: fc.nat(50), months: fc.nat(30), weeks: fc.nat(10), days: fc.nat(400), hours: fc.nat(100), minutes: fc.nat(200), seconds: fc.nat(200), milliseconds: fc.nat(999),
}).chain((f) => fc.boolean().map((neg) => (neg ? negateDuration(duration(f)) : duration(f))));

describe('duration values', () => {
  it('constructs and validates', () => {
    const d = duration({ hours: 1, minutes: 30 });
    expect(d).toEqual({ years: 0, months: 0, weeks: 0, days: 0, hours: 1, minutes: 30, seconds: 0, milliseconds: 0, sign: 1 });
    expect(Object.isFrozen(d)).toBe(true);
    expect(duration({ days: -2 })).toMatchObject({ days: 2, sign: -1 });
    expect(duration({}).sign).toBe(0);
    expect(code(() => duration({ days: 1, hours: -1 }))).toBe('HLP_DURATION_MIXED_SIGNS');
    expect(code(() => duration({ hours: 1.5 }))).toBe('HLP_DURATION_INVALID_FIELD');
    expect(code(() => duration({ hours: Number.NaN }))).toBe('HLP_DURATION_INVALID_FIELD');
    expect(isDuration(d)).toBe(true);
    expect(isDuration({ ...d, sign: 0 })).toBe(false);
    expect(isDuration({ ...d, hours: -1 })).toBe(false);
    expect(isDuration(null)).toBe(false);
    expect(negateDuration(duration({})).sign).toBe(0);
  });

  it('ignores __proto__ payloads', () => {
    const payload = JSON.parse('{"__proto__": {"hours": 5}, "minutes": 2}') as { minutes: number };
    const d = duration(payload);
    expect(d.hours).toBe(0);
    expect(d.minutes).toBe(2);
    expect(({} as { hours?: number }).hours).toBeUndefined();
  });
});

describe('ISO 8601', () => {
  it('parses', () => {
    expect(iso('P1Y2M3DT4H5M6.5S')).toEqual(duration({ years: 1, months: 2, days: 3, hours: 4, minutes: 5, seconds: 6, milliseconds: 500 }));
    expect(iso('PT0S').sign).toBe(0);
    expect(iso('-P1D')).toMatchObject({ days: 1, sign: -1 });
    expect(iso('+P1D').sign).toBe(1);
    expect(iso('-PT0S').sign).toBe(0);
    expect(iso('P1W2D')).toMatchObject({ weeks: 1, days: 2 });
    expect(iso('PT36H').hours).toBe(36);
    expect(iso('PT0,25S').milliseconds).toBe(250);
    expect(iso('PT0.123000S').milliseconds).toBe(123);
    for (const bad of ['P', 'PT', '-P', 'P1YT', '', 'P1.5Y', 'PT1.5H', 'P-1D', '1D', 'p1d', 'PT0.1234S', 'P1D2M', 'PT1S1M', ' P1D', 'P99999999999999999D']) {
      expect(parseIsoDuration(bad)).toBeUndefined();
    }
    const t0 = performance.now();
    expect(parseIsoDuration(`P${'1'.repeat(100_000)}D`)).toBeUndefined();
    expect(parseIsoDuration(`PT${'1'.repeat(60)}`)).toBeUndefined();
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('formats and round-trips', () => {
    expect(formatIsoDuration(duration({ days: 1, minutes: 5, milliseconds: 500 }))).toBe('P1DT5M0.5S');
    expect(formatIsoDuration(duration({}))).toBe('PT0S');
    expect(formatIsoDuration(duration({ days: -1 }))).toBe('-P1D');
    expect(formatIsoDuration(duration({ seconds: 1, milliseconds: 50 }))).toBe('PT1.05S');
    expect(formatIsoDuration(duration({ years: 1, weeks: 2 }))).toBe('P1Y2W');
    fc.assert(fc.property(arbDuration, (d) => {
      expect(parseIsoDuration(formatIsoDuration(d))).toEqual(d);
    }));
  });
});

describe('arithmetic', () => {
  it('converts fixed durations to milliseconds', () => {
    expect(durationToMilliseconds(duration({ hours: 1, minutes: 30 }))).toBe(90 * M);
    expect(durationToMilliseconds(duration({ weeks: 1, days: -0 }))).toBe(7 * 24 * H);
    expect(durationToMilliseconds(iso('-PT1S'))).toBe(-1000);
    expect(Object.is(durationToMilliseconds(duration({})), 0)).toBe(true);
    expect(code(() => durationToMilliseconds(duration({ months: 1 })))).toBe('HLP_DURATION_RELATIVE_TO_REQUIRED');
    expect(durationToMilliseconds(duration({ months: 1 }), { relativeTo: '2026-01-31' })).toBe(28 * 24 * H);
    expect(durationToMilliseconds(duration({ months: -1 }), { relativeTo: '2026-03-31' })).toBe(-31 * 24 * H);
    expect(durationToMilliseconds(duration({ days: 1 }), { relativeTo: { dateTime: '2026-03-08', timeZone: 'America/New_York' } })).toBe(23 * H);
    expect(durationToMilliseconds(duration({ days: 1 }), { relativeTo: { dateTime: '2026-11-01', timeZone: 'America/New_York' } })).toBe(25 * H);
    expect(durationToMilliseconds(duration({ days: 1 }), { relativeTo: { dateTime: '2026-10-04', timeZone: 'Australia/Lord_Howe' } })).toBe(23.5 * H);
    expect(durationToMilliseconds(duration({ days: 1 }), { relativeTo: '2026-03-08' })).toBe(24 * H);
  });

  it('matches Temporal totals relative to a zoned start (property)', () => {
    if (!Temporal) return;
    const T = Temporal;
    const zones = ['America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'Pacific/Chatham', 'Asia/Kolkata'];
    fc.assert(fc.property(arbDuration, fc.integer({ min: 20_000, max: 22_000 }), fc.integer({ min: 0, max: 23 }), fc.constantFrom(...zones), (d, day, hour, zone) => {
      const start = new Date(day * 86_400_000).toISOString().slice(0, 10);
      const wall = `${start}T${String(hour).padStart(2, '0')}:00`;
      const expected = T.Duration.from(formatIsoDuration(d)).total({ unit: 'milliseconds', relativeTo: T.ZonedDateTime.from(`${wall}[${zone}]`) });
      expect(durationToMilliseconds(d, { relativeTo: { dateTime: pdt(wall), timeZone: zone } })).toBe(expected);
    }), { numRuns: 300 });
  });

  it('adds calendar-aware', () => {
    expect(addDuration('2026-01-31', duration({ months: 1, days: 1 }))).toEqual(plainDate(2026, 3, 1));
    expect(addDuration('2026-03-31', iso('-P1M'))).toEqual(plainDate(2026, 2, 28));
    expect(addDuration('2026-01-01', iso('PT25H'))).toEqual(plainDate(2026, 1, 2));
    expect(addDuration('2026-01-01', iso('PT23H'))).toEqual(plainDate(2026, 1, 1));
    expect(addDuration(pdt('2026-01-31T23:00'), iso('PT2H'))).toEqual(pdt('2026-02-01T01:00'));
    expect(addDuration(pdt('2026-03-01T00:30'), iso('-PT1H'))).toEqual(pdt('2026-02-28T23:30'));
    expect(addDuration(pdt('2024-02-29T12:00'), iso('P1Y'))).toEqual(pdt('2025-02-28T12:00'));
    const noon = Date.UTC(2026, 2, 7, 17);
    expect(addDurationInZone(noon, iso('P1D'), 'America/New_York') - noon).toBe(23 * H);
    expect(addDurationInZone(noon, iso('PT24H'), 'America/New_York') - noon).toBe(24 * H);
    expect(code(() => addDuration('2026-01-01', { years: 1 } as unknown as Duration))).toBe('HLP_DURATION_INVALID');
    expect(code(() => addDuration('2026-01-01', duration({ years: 300_000 })))).toBe('HLP_DATE_OUT_OF_RANGE');
  });

  it('balances and compares', () => {
    expect(millisecondsToDuration(90_061_001, { largestUnit: 'days' })).toEqual(duration({ days: 1, hours: 1, minutes: 1, seconds: 1, milliseconds: 1 }));
    expect(millisecondsToDuration(90_061_001)).toEqual(duration({ hours: 25, minutes: 1, seconds: 1, milliseconds: 1 }));
    expect(millisecondsToDuration(-1500, { largestUnit: 'seconds' })).toEqual(duration({ seconds: -1, milliseconds: -500 }));
    expect(millisecondsToDuration(1.9)).toEqual(duration({ milliseconds: 1 }));
    expect(code(() => millisecondsToDuration(1, { largestUnit: 'months' as 'days' }))).toBe('HLP_DURATION_INVALID_UNIT');
    expect(normalizeDuration(duration({ minutes: 90 }))).toEqual(duration({ hours: 1, minutes: 30 }));
    expect(normalizeDuration(duration({ days: 1, hours: 30 }))).toEqual(duration({ days: 1, hours: 30 }));
    expect(normalizeDuration(duration({ days: 1, hours: 30 }), { largestUnit: 'days' })).toEqual(duration({ days: 2, hours: 6 }));
    expect(normalizeDuration(duration({ months: 14, seconds: -0, milliseconds: 1500 }))).toEqual(duration({ months: 14, seconds: 1, milliseconds: 500 }));
    expect(normalizeDuration(iso('-PT90M'))).toEqual(iso('-PT1H30M'));
    expect(compareDurations(iso('PT90M'), iso('PT1H'))).toBe(1);
    expect(compareDurations(iso('PT60M'), iso('PT1H'))).toBe(0);
    expect(compareDurations(iso('P1M'), iso('P30D'), { relativeTo: '2026-02-01' })).toBe(-1);
    expect(compareDurations(iso('P1M'), iso('P30D'), { relativeTo: '2026-03-01' })).toBe(1);
    expect(code(() => compareDurations(iso('P1M'), iso('P30D')))).toBe('HLP_DURATION_RELATIVE_TO_REQUIRED');
    fc.assert(fc.property(fc.integer({ min: -1e12, max: 1e12 }), fc.constantFrom('weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds' as const), (ms, largestUnit) => {
      const d = millisecondsToDuration(ms, { largestUnit });
      expect(durationToMilliseconds(d)).toBe(ms + 0);
      expect(durationToMilliseconds(normalizeDuration(d, { largestUnit: 'weeks' }))).toBe(ms + 0);
    }));
  });
});

describe('human formatting', () => {
  it('formats with Intl.DurationFormat and the fallback identically for common cases', () => {
    const d = duration({ hours: 3, minutes: 5 });
    for (const useNative of [true, false]) {
      const o = { locale: 'en', useNative };
      expect(formatDuration(d, o)).toBe('3 hours, 5 minutes');
      expect(formatDuration(d, { ...o, style: 'short' })).toBe('3 hr, 5 min');
      expect(formatDuration(d, { ...o, style: 'narrow' })).toBe('3h 5m');
      expect(formatDuration(d, { ...o, style: 'digital' })).toBe('3:05:00');
      expect(formatDuration(duration({}), o)).toBe('0 seconds');
      expect(formatDuration(duration({}), { ...o, style: 'digital' })).toBe('0:00:00');
      expect(formatDuration(negateDuration(d), o)).toBe('-3 hours, 5 minutes');
      expect(formatDuration(duration({ days: 1, hours: 2 }), o)).toBe('1 day, 2 hours');
    }
    expect(formatDuration(duration({ hours: 1 }), { locale: 'de' })).toBe('1 Stunde');
    expect(code(() => formatDuration({} as Duration))).toBe('HLP_DURATION_INVALID');
  });

  it('humanizes', () => {
    const en = { locale: 'en' };
    expect(humanizeDuration(5_430_000, en)).toBe('1 hour, 31 minutes');
    expect(humanizeDuration(59_999, { ...en, largestUnits: 1 })).toBe('1 minute');
    expect(humanizeDuration(0, en)).toBe('0 seconds');
    expect(humanizeDuration(400, en)).toBe('0 seconds');
    expect(humanizeDuration(400, { ...en, smallestUnit: 'milliseconds' })).toBe('400 milliseconds');
    expect(humanizeDuration(-90_000, en)).toBe('-1 minute, 30 seconds');
    expect(humanizeDuration(3 * 86_400_000 + 5 * H + 10 * M, en)).toBe('3 days, 5 hours');
    expect(humanizeDuration(3 * 86_400_000 + 5 * H + 10 * M, { ...en, largestUnits: 3 })).toBe('3 days, 5 hours, 10 minutes');
    expect(humanizeDuration(3_600_000 + 10_000, en)).toBe('1 hour');
    expect(humanizeDuration(15 * 86_400_000, { ...en, largestUnit: 'weeks' })).toBe('2 weeks, 1 day');
    expect(humanizeDuration(90_000, { ...en, style: 'short', useNative: false })).toBe('1 min, 30 sec');
    expect(code(() => humanizeDuration(1, { largestUnits: 0 }))).toBe('HLP_DURATION_INVALID_UNIT');
    expect(code(() => humanizeDuration(1, { largestUnit: 'seconds', smallestUnit: 'hours' }))).toBe('HLP_DURATION_INVALID_UNIT');
    expect(() => humanizeDuration(Number.POSITIVE_INFINITY)).toThrow(ValidationError);
  });

  it('formats clocks', () => {
    expect(formatClock(3_909_000)).toBe('01:05:09');
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(-3_909_000)).toBe('-01:05:09');
    expect(formatClock(-400)).toBe('00:00:00');
    expect(formatClock(360_000_000)).toBe('100:00:00');
    expect(formatClock(3_909_042, { milliseconds: true })).toBe('01:05:09.042');
    expect(() => formatClock(Number.NaN)).toThrow(ValidationError);
  });
});
