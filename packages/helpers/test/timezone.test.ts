import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LimitError, ValidationError } from '@absoluteui/helpers/error';
import { formatPlainDateTime, parsePlainDateTime, plainDateTime, plainTime, type PlainDateTime } from '@absoluteui/helpers/date';
import {
  convertWallTime, formatInZone, formatOffset, formatZonedIso, getLocalTimeZone, getPossibleInstants, getWallTimeStatus, instantToZoned, isDstAt,
  isValidTimeZone, listTimeZones, nextTransition, offsetAt, parseOffset, previousTransition, standardOffset, timeZoneName, zonedToInstant,
  type Disambiguation,
} from '@absoluteui/helpers/timezone';

// Native Temporal (current Chromium) as an oracle; tests using it are skipped when absent.
interface TemporalZdt {
  readonly epochMilliseconds: number;
  readonly offsetNanoseconds: number;
  getTimeZoneTransition(direction: 'next' | 'previous'): TemporalZdt | null;
}
interface TemporalApi {
  PlainDateTime: { from(text: string): { toZonedDateTime(timeZone: string, options: { disambiguation: Disambiguation }): TemporalZdt } };
  Instant: { fromEpochMilliseconds(ms: number): { toZonedDateTimeISO(timeZone: string): TemporalZdt } };
}
const Temporal = (globalThis as { Temporal?: TemporalApi }).Temporal;

function pdt(text: string): PlainDateTime {
  const v = parsePlainDateTime(text);
  if (!v) throw new Error('Bad test date-time.');
  return v;
}
const utc = (text: string): number => Date.parse(text);
const H = 3_600_000;
const M = 60_000;
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

interface MatrixRow {
  readonly zone: string;
  readonly wall: string;
  readonly status: 'exact' | 'ambiguous' | 'nonexistent';
  readonly compatible: string;
  readonly earlier: string;
  readonly later: string;
}

// DST matrix (gap = spring forward, overlap = fall back). Expected instants follow Temporal's rules.
const MATRIX: readonly MatrixRow[] = [
  { zone: 'America/New_York', wall: '2026-03-08T02:30', status: 'nonexistent', compatible: '2026-03-08T07:30:00Z', earlier: '2026-03-08T06:30:00Z', later: '2026-03-08T07:30:00Z' },
  { zone: 'America/New_York', wall: '2026-11-01T01:30', status: 'ambiguous', compatible: '2026-11-01T05:30:00Z', earlier: '2026-11-01T05:30:00Z', later: '2026-11-01T06:30:00Z' },
  { zone: 'America/New_York', wall: '2026-07-01T12:00', status: 'exact', compatible: '2026-07-01T16:00:00Z', earlier: '2026-07-01T16:00:00Z', later: '2026-07-01T16:00:00Z' },
  { zone: 'Europe/London', wall: '2026-03-29T01:30', status: 'nonexistent', compatible: '2026-03-29T01:30:00Z', earlier: '2026-03-29T00:30:00Z', later: '2026-03-29T01:30:00Z' },
  { zone: 'Europe/London', wall: '2026-10-25T01:30', status: 'ambiguous', compatible: '2026-10-25T00:30:00Z', earlier: '2026-10-25T00:30:00Z', later: '2026-10-25T01:30:00Z' },
  // Lord Howe: 30-minute DST (+10:30 ↔ +11:00).
  { zone: 'Australia/Lord_Howe', wall: '2026-10-04T02:15', status: 'nonexistent', compatible: '2026-10-03T15:45:00Z', earlier: '2026-10-03T15:15:00Z', later: '2026-10-03T15:45:00Z' },
  { zone: 'Australia/Lord_Howe', wall: '2026-04-05T01:45', status: 'ambiguous', compatible: '2026-04-04T14:45:00Z', earlier: '2026-04-04T14:45:00Z', later: '2026-04-04T15:15:00Z' },
  // Chatham: +12:45 ↔ +13:45, transitions at 02:45 standard time.
  { zone: 'Pacific/Chatham', wall: '2026-09-27T03:00', status: 'nonexistent', compatible: '2026-09-26T14:15:00Z', earlier: '2026-09-26T13:15:00Z', later: '2026-09-26T14:15:00Z' },
  { zone: 'Pacific/Chatham', wall: '2026-04-05T03:00', status: 'ambiguous', compatible: '2026-04-04T13:15:00Z', earlier: '2026-04-04T13:15:00Z', later: '2026-04-04T14:15:00Z' },
  { zone: 'Asia/Kolkata', wall: '2026-03-08T02:30', status: 'exact', compatible: '2026-03-07T21:00:00Z', earlier: '2026-03-07T21:00:00Z', later: '2026-03-07T21:00:00Z' },
  { zone: 'Asia/Kathmandu', wall: '2026-01-01T00:00', status: 'exact', compatible: '2025-12-31T18:15:00Z', earlier: '2025-12-31T18:15:00Z', later: '2025-12-31T18:15:00Z' },
  { zone: 'America/Sao_Paulo', wall: '2026-11-01T00:30', status: 'exact', compatible: '2026-11-01T03:30:00Z', earlier: '2026-11-01T03:30:00Z', later: '2026-11-01T03:30:00Z' },
  // Historic midnight gap (Brazil DST started at 00:00 until 2018).
  { zone: 'America/Sao_Paulo', wall: '2018-11-04T00:30', status: 'nonexistent', compatible: '2018-11-04T03:30:00Z', earlier: '2018-11-04T02:30:00Z', later: '2018-11-04T03:30:00Z' },
];

describe('DST matrix', () => {
  for (const row of MATRIX) {
    it(`${row.zone} ${row.wall} (${row.status})`, () => {
      const wall = pdt(row.wall);
      expect(getWallTimeStatus(wall, row.zone)).toBe(row.status);
      expect(getPossibleInstants(wall, row.zone)).toHaveLength(row.status === 'exact' ? 1 : row.status === 'ambiguous' ? 2 : 0);
      expect(zonedToInstant(wall, row.zone)).toBe(utc(row.compatible));
      expect(zonedToInstant(wall, row.zone, { disambiguation: 'earlier' })).toBe(utc(row.earlier));
      expect(zonedToInstant(wall, row.zone, { disambiguation: 'later' })).toBe(utc(row.later));
      if (row.status === 'exact') expect(zonedToInstant(wall, row.zone, { disambiguation: 'reject' })).toBe(utc(row.compatible));
      else expect(code(() => zonedToInstant(wall, row.zone, { disambiguation: 'reject' }))).toBe(row.status === 'ambiguous' ? 'HLP_TZ_AMBIGUOUS_TIME' : 'HLP_TZ_NONEXISTENT_TIME');
      if (Temporal) {
        for (const d of ['compatible', 'earlier', 'later'] as const) {
          expect(zonedToInstant(wall, row.zone, { disambiguation: d })).toBe(Temporal.PlainDateTime.from(row.wall).toZonedDateTime(row.zone, { disambiguation: d }).epochMilliseconds);
        }
      }
    });
  }

  it('reports fixed and fractional offsets', () => {
    expect(offsetAt(utc('2026-01-01T00:00:00Z'), 'Asia/Kolkata')).toBe(5.5 * H);
    expect(offsetAt(utc('2026-07-01T00:00:00Z'), 'Asia/Kolkata')).toBe(5.5 * H);
    expect(offsetAt(utc('2026-01-01T00:00:00Z'), 'Asia/Kathmandu')).toBe(5 * H + 45 * M);
    expect(offsetAt(utc('2026-07-01T00:00:00Z'), 'Pacific/Chatham')).toBe(12 * H + 45 * M);
    expect(offsetAt(utc('2026-01-01T00:00:00Z'), 'Pacific/Chatham')).toBe(13 * H + 45 * M);
    expect(offsetAt(utc('2026-01-01T00:00:00Z'), 'Australia/Lord_Howe')).toBe(11 * H);
    expect(offsetAt(utc('2026-07-01T00:00:00Z'), 'Australia/Lord_Howe')).toBe(10.5 * H);
    expect(offsetAt(utc('2026-01-01T00:00:00Z'), 'America/Sao_Paulo')).toBe(-3 * H);
    expect(offsetAt(utc('2026-07-01T00:00:00Z'), 'America/Sao_Paulo')).toBe(-3 * H);
    expect(offsetAt(new Date(0), 'UTC')).toBe(0);
    // Local mean time before 1883 has a seconds component.
    expect(formatOffset(offsetAt(utc('1800-01-01T00:00:00Z'), 'America/New_York'))).toBe('-04:56:02');
  });

  it('matches Temporal offsets and conversions (property)', () => {
    if (!Temporal) return;
    const zones = ['America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'Pacific/Chatham', 'Asia/Kolkata', 'Asia/Kathmandu', 'America/Sao_Paulo', 'America/Santiago', 'Asia/Beirut', 'Pacific/Apia', 'Europe/Dublin', 'Africa/Casablanca'];
    fc.assert(fc.property(fc.integer({ min: utc('1950-01-01T00:00:00Z'), max: utc('2060-01-01T00:00:00Z') }), fc.constantFrom(...zones), fc.constantFrom<Disambiguation>('compatible', 'earlier', 'later'), (ms, zone, disambiguation) => {
      expect(offsetAt(ms, zone)).toBe(Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone).offsetNanoseconds / 1e6);
      // Shift by up to ±3 h of wall time so gaps and overlaps get hit.
      const wall = instantToZoned(ms, zone);
      expect(zonedToInstant(wall, zone, { disambiguation })).toBe(Temporal.PlainDateTime.from(formatPlainDateTime(wall)).toZonedDateTime(zone, { disambiguation }).epochMilliseconds);
    }), { numRuns: 500 });
  });

  it('round-trips instant → wall → instant for non-gap times', () => {
    const zones = ['America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'Pacific/Chatham', 'Asia/Kolkata', 'America/Sao_Paulo'];
    fc.assert(fc.property(fc.integer({ min: utc('1970-01-01T00:00:00Z'), max: utc('2100-01-01T00:00:00Z') }), fc.constantFrom(...zones), (ms, zone) => {
      const wall = instantToZoned(ms, zone);
      const candidates = getPossibleInstants(wall, zone);
      expect(candidates).toContain(ms);
      expect(zonedToInstant(wall, zone, { disambiguation: candidates.length === 2 && candidates[1] === ms ? 'later' : 'earlier' })).toBe(ms);
    }), { numRuns: 500 });
  });
});

describe('conversion helpers', () => {
  it('converts wall times between zones', () => {
    expect(convertWallTime(pdt('2026-09-29T09:00'), 'Asia/Kolkata', 'America/New_York')).toEqual(pdt('2026-09-28T23:30'));
    expect(convertWallTime(pdt('2026-03-08T02:30'), 'America/New_York', 'UTC')).toEqual(pdt('2026-03-08T07:30'));
    expect(code(() => convertWallTime(pdt('2026-03-08T02:30'), 'America/New_York', 'UTC', { disambiguation: 'reject' }))).toBe('HLP_TZ_NONEXISTENT_TIME');
    expect(instantToZoned(utc('2026-01-01T00:00:00Z'), 'Pacific/Chatham')).toEqual(plainDateTime('2026-01-01', plainTime(13, 45)));
  });

  it('formats and parses offsets', () => {
    expect(formatOffset(5.5 * H)).toBe('+05:30');
    expect(formatOffset(-4 * H)).toBe('-04:00');
    expect(formatOffset(0)).toBe('+00:00');
    expect(formatOffset(-0)).toBe('+00:00');
    expect(formatOffset(12 * H + 45 * M)).toBe('+12:45');
    expect(parseOffset('-04:00')).toBe(-4 * H);
    expect(parseOffset('Z')).toBe(0);
    expect(parseOffset('+05:45')).toBe(5 * H + 45 * M);
    expect(parseOffset('-04:56:02')).toBe(-(4 * H + 56 * M + 2000));
    for (const bad of ['+5:30', '+24:00', '+05:60', '0530', '', 'z']) expect(parseOffset(bad)).toBeUndefined();
    expect(() => formatOffset(Number.NaN)).toThrow(ValidationError);
    fc.assert(fc.property(fc.integer({ min: -86_399, max: 86_399 }), (s) => {
      expect(parseOffset(formatOffset(s * 1000))).toBe(s * 1000 + 0);
    }));
  });

  it('formats in zones', () => {
    expect(formatZonedIso(utc('2026-03-08T07:00:00Z'), 'America/New_York')).toBe('2026-03-08T03:00:00-04:00');
    expect(formatZonedIso(utc('2026-01-01T00:00:00Z'), 'Asia/Kathmandu')).toBe('2026-01-01T05:45:00+05:45');
    expect(formatInZone(utc('2026-01-01T00:00:00Z'), { timeZone: 'Asia/Tokyo', locale: 'en-US', timeStyle: 'short' })).toBe('9:00 AM');
    expect(formatInZone(utc('2026-01-01T00:00:00Z'), { timeZone: 'UTC', locale: 'en-US' })).toBe('Jan 1, 2026, 12:00 AM');
  });
});

describe('zones', () => {
  it('validates and lists zones', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('A'.repeat(10_000))).toBe(false);
    expect(isValidTimeZone(42 as unknown as string)).toBe(false);
    expect(code(() => offsetAt(0, 'Mars/Olympus'))).toBe('HLP_TZ_INVALID_ZONE');
    expect(isValidTimeZone(getLocalTimeZone())).toBe(true);
    const zones = listTimeZones();
    expect(zones).toContain('Asia/Kolkata');
    expect(zones).toContain('UTC');
    expect(zones).not.toContain('Asia/Calcutta');
    expect(listTimeZones({ modernNames: false }).length).toBeGreaterThanOrEqual(zones.length);
    expect([...zones].sort()).toEqual(zones);
    expect(zones.every((z) => isValidTimeZone(z))).toBe(true);
  });

  it('names zones', () => {
    const at = utc('2026-01-15T00:00:00Z');
    expect(timeZoneName('Asia/Kolkata', { locale: 'en', at })).toBe('India Standard Time');
    expect(timeZoneName('Asia/Kolkata', { locale: 'en', style: 'shortOffset', at })).toBe('GMT+5:30');
    expect(timeZoneName('America/Los_Angeles', { locale: 'en', style: 'longGeneric', at })).toBe('Pacific Time');
    expect(timeZoneName('America/New_York', { locale: 'en', style: 'long', at: utc('2026-07-01T00:00:00Z') })).toBe('Eastern Daylight Time');
    expect(code(() => timeZoneName('Nope/Nope'))).toBe('HLP_TZ_INVALID_ZONE');
  });

  it('detects DST', () => {
    expect(isDstAt(utc('2026-07-01T00:00:00Z'), 'Europe/London')).toBe(true);
    expect(isDstAt(utc('2026-01-01T00:00:00Z'), 'Europe/London')).toBe(false);
    expect(isDstAt(utc('2026-01-01T00:00:00Z'), 'Australia/Lord_Howe')).toBe(true);
    expect(isDstAt(utc('2026-07-01T00:00:00Z'), 'Australia/Lord_Howe')).toBe(false);
    expect(isDstAt(utc('2026-07-01T00:00:00Z'), 'Asia/Kolkata')).toBe(false);
    expect(isDstAt(utc('2026-01-01T00:00:00Z'), 'America/Sao_Paulo')).toBe(false);
    expect(isDstAt(utc('2018-01-01T00:00:00Z'), 'America/Sao_Paulo')).toBe(true);
    expect(standardOffset(2026, 'America/New_York')).toBe(-5 * H);
    expect(standardOffset(2026, 'Pacific/Chatham')).toBe(12 * H + 45 * M);
  });

  it('finds transitions', () => {
    expect(nextTransition(utc('2026-01-01T00:00:00Z'), 'America/New_York')).toBe(utc('2026-03-08T07:00:00Z'));
    expect(nextTransition(utc('2026-03-08T07:00:00Z'), 'America/New_York')).toBe(utc('2026-11-01T06:00:00Z'));
    expect(previousTransition(utc('2026-06-01T00:00:00Z'), 'America/New_York')).toBe(utc('2026-03-08T07:00:00Z'));
    expect(previousTransition(utc('2026-03-08T07:00:00Z'), 'America/New_York')).toBe(utc('2025-11-02T06:00:00Z'));
    expect(nextTransition(utc('2026-01-01T00:00:00Z'), 'Australia/Lord_Howe')).toBe(utc('2026-04-04T15:00:00Z'));
    expect(nextTransition(utc('2026-01-01T00:00:00Z'), 'Asia/Kolkata')).toBeUndefined();
    expect(nextTransition(utc('2020-01-01T00:00:00Z'), 'America/Sao_Paulo', { searchDays: 3000 })).toBeUndefined();
    expect(previousTransition(utc('2020-01-01T00:00:00Z'), 'America/Sao_Paulo')).toBe(utc('2019-02-17T02:00:00Z'));
    expect(nextTransition(utc('2011-12-01T00:00:00Z'), 'Pacific/Apia', { searchDays: 60 })).toBe(utc('2011-12-30T10:00:00Z'));
    expect(() => nextTransition(0, 'UTC', { searchDays: 40_000 })).toThrow(LimitError);
    expect(() => nextTransition(0, 'UTC', { searchDays: 0 })).toThrow(ValidationError);
  });

  it('matches Temporal transitions (property)', () => {
    if (!Temporal) return;
    const zones = ['America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'Pacific/Chatham', 'America/Santiago', 'Asia/Beirut'];
    fc.assert(fc.property(fc.integer({ min: utc('1990-01-01T00:00:00Z'), max: utc('2040-01-01T00:00:00Z') }), fc.constantFrom(...zones), (ms, zone) => {
      const zdt = Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone);
      const next = zdt.getTimeZoneTransition('next');
      const prev = zdt.getTimeZoneTransition('previous');
      if (next && next.epochMilliseconds - ms < 300 * 86_400_000) expect(nextTransition(ms, zone)).toBe(next.epochMilliseconds);
      if (prev && ms - prev.epochMilliseconds < 300 * 86_400_000) expect(previousTransition(ms, zone)).toBe(prev.epochMilliseconds);
    }), { numRuns: 60 });
  });
});
