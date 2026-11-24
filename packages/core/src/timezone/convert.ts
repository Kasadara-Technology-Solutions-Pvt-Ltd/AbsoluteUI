/**
 * Local <-> instant conversion with explicit DST disambiguation (SPEC section 8.5).
 */
import { getCommonConfig, type Disambiguation } from '../config/config.js';
import { configurationError, validationError } from '../errors.js';
import { fieldsToEpoch, intlTimeZoneEngine, type TimeZoneEngine } from './engine.js';
import { instant, plainDate, plainDateTime, plainTime, type Instant, type PlainDateTime, type ZonedDateTime } from './types.js';

const DAY_MS = 86_400_000;

/** Active engine: configured resolver (section 8.7) or the built-in Intl engine. */
export function getTimeZoneEngine(): TimeZoneEngine {
  return getCommonConfig().timeZoneEngine ?? intlTimeZoneEngine;
}

function assertZone(engine: TimeZoneEngine, timeZone: string): void {
  if (!engine.isValidTimeZone(timeZone)) {
    throw configurationError('TZ_INVALID_ZONE', 'Unsupported timezone identifier.', { property: 'timeZone', expected: 'IANA timezone identifier' });
  }
}

function localEpoch(value: PlainDateTime): number {
  const { date, time } = value;
  return fieldsToEpoch(date.year, date.month, date.day, time.hour, time.minute, time.second, time.millisecond);
}

export type LocalTimeStatus = 'exact' | 'ambiguous' | 'nonexistent';

/**
 * All instants at which the wall-clock time occurs in the zone:
 * one (exact), two (ambiguous, clock fell back) or none (nonexistent, clock sprang forward).
 */
export function getPossibleInstants(value: PlainDateTime, timeZone: string, engine: TimeZoneEngine = getTimeZoneEngine()): Instant[] {
  assertZone(engine, timeZone);
  const local = localEpoch(value);
  const offsets = new Set([engine.getOffsetMs(local - DAY_MS, timeZone), engine.getOffsetMs(local + DAY_MS, timeZone)]);
  const found = new Set<number>();
  for (const offset of offsets) {
    const candidate = local - offset;
    if (engine.getOffsetMs(candidate, timeZone) === offset) found.add(candidate);
  }
  return [...found].sort((a, b) => a - b).map(instant);
}

export function getLocalTimeStatus(value: PlainDateTime, timeZone: string, engine?: TimeZoneEngine): LocalTimeStatus {
  const n = getPossibleInstants(value, timeZone, engine).length;
  return n === 1 ? 'exact' : n > 1 ? 'ambiguous' : 'nonexistent';
}

/**
 * Convert a wall-clock time in a zone to an exact instant.
 *
 * | Case | compatible | earlier | later | reject |
 * |---|---|---|---|---|
 * | ambiguous | earlier instant | earlier instant | later instant | error |
 * | nonexistent | shift forward by gap | shift backward by gap | shift forward by gap | error |
 */
export function toInstant(
  value: PlainDateTime,
  timeZone: string,
  disambiguation: Disambiguation = getCommonConfig().disambiguation,
  engine: TimeZoneEngine = getTimeZoneEngine(),
): Instant {
  const possible = getPossibleInstants(value, timeZone, engine);
  const [first, second] = possible;
  if (first && !second) return first;
  if (first && second) {
    if (disambiguation === 'reject') {
      throw validationError('TZ_AMBIGUOUS_TIME', 'The local time is ambiguous in the selected timezone.', {
        property: 'value',
        remediation: 'Choose an explicit disambiguation or a different time.',
      });
    }
    return disambiguation === 'later' ? second : first;
  }
  if (disambiguation === 'reject') {
    throw validationError('TZ_NONEXISTENT_TIME', 'The local time does not exist in the selected timezone.', {
      property: 'value',
      remediation: 'Choose a time outside the daylight-saving gap.',
    });
  }
  const local = localEpoch(value);
  const before = engine.getOffsetMs(local - DAY_MS, timeZone);
  const after = engine.getOffsetMs(local + DAY_MS, timeZone);
  return instant(disambiguation === 'earlier' ? local - after : local - before);
}

/** Wall-clock time of an instant in a zone. */
export function toPlainDateTime(value: Instant | ZonedDateTime, timeZone?: string, engine: TimeZoneEngine = getTimeZoneEngine()): PlainDateTime {
  const zone = timeZone ?? (value.kind === 'ZonedDateTime' ? value.timeZone : getCommonConfig().timezone);
  assertZone(engine, zone);
  const local = new Date(value.epochMilliseconds + engine.getOffsetMs(value.epochMilliseconds, zone));
  return plainDateTime(
    plainDate(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()),
    plainTime(local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds()),
  );
}

export function zonedDateTime(value: Instant, timeZone: string, engine: TimeZoneEngine = getTimeZoneEngine()): ZonedDateTime {
  assertZone(engine, timeZone);
  return Object.freeze({ kind: 'ZonedDateTime', epochMilliseconds: value.epochMilliseconds, timeZone });
}

/** Offset string such as "+05:30" for an instant in a zone. */
export function formatOffset(value: Instant, timeZone: string, engine: TimeZoneEngine = getTimeZoneEngine()): string {
  const offset = Math.round(engine.getOffsetMs(value.epochMilliseconds, timeZone) / 60000);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Current instant. Isolated for testability; components never read the host timezone. */
export function now(): Instant {
  return instant(Date.now());
}
