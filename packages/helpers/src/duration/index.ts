/**
 * `@absoluteui/helpers/duration` (docs/PLAN-HELPERS.md section 2): calendar-aware ISO 8601 durations.
 *
 * A `Duration` stores non-negative integer fields plus a `sign`, like Temporal. Years and months
 * have no fixed length, so converting them to milliseconds needs a `relativeTo` date. Weeks and
 * days count as 7 x 24 h and 24 h unless `relativeTo` names a time zone, in which case DST-length
 * days are respected. Human formatting uses `Intl.DurationFormat` when present, otherwise
 * `Intl.NumberFormat` units joined with `Intl.ListFormat` ("3 hours, 5 minutes").
 */
import { LimitError, ValidationError } from '../error/index.js';
import { addDays, addMonths, isPlainDateTime, plainDateTime, plainDateTimeToEpochMilliseconds, timeFromMilliseconds, toPlainDate, fromEpochDay, type DateInput, type InstantInput, type PlainDate, type PlainDateTime } from '../date/index.js';
import { cachedIntl, listFormat, numberFormat } from '../date/intl-cache.js';
import { instantToZoned, toEpochMs, zonedToInstant, type Disambiguation } from '../date/zone.js';

/** Duration field names, largest first. */
export type DurationUnit = 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds';

export type DurationFields = Readonly<Record<DurationUnit, number>>;

/** Immutable duration: non-negative integer fields and a sign (0 only for the zero duration). */
export interface Duration extends DurationFields {
  readonly sign: -1 | 0 | 1;
}

/** Input for `duration`: any subset of fields, all >= 0 or all <= 0. */
export type DurationLike = Partial<DurationFields>;

const UNITS: readonly DurationUnit[] = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds'];
const DAY_MS = 86_400_000;
const FIXED_MS: Readonly<Record<Exclude<DurationUnit, 'years' | 'months'>, number>> = { weeks: 7 * DAY_MS, days: DAY_MS, hours: 3_600_000, minutes: 60_000, seconds: 1000, milliseconds: 1 };

function outOfRange(): LimitError {
  return new LimitError('HLP_DURATION_OUT_OF_RANGE', 'Duration exceeds the safe integer range.');
}

/**
 * Creates a validated, frozen duration. Fields must be safe integers with one sign.
 * @example formatIsoDuration(duration({ hours: 1, minutes: 30 })) // => 'PT1H30M'
 * @example
 * const back = duration({ days: -2 });
 * [back.sign, back.days]; // => [-1, 2]
 * duration({ days: 1, hours: -1 }); // => throws HLP_DURATION_MIXED_SIGNS
 */
export function duration(fields: DurationLike): Duration {
  let sign: -1 | 0 | 1 = 0;
  const out: Record<DurationUnit, number> = { years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 };
  for (const unit of UNITS) {
    const v = fields[unit] ?? 0;
    if (!Number.isSafeInteger(v)) throw new ValidationError('HLP_DURATION_INVALID_FIELD', 'Duration fields must be safe integers.', { details: { property: unit } });
    if (v === 0) continue;
    const s = v < 0 ? -1 : 1;
    if (sign !== 0 && s !== sign) throw new ValidationError('HLP_DURATION_MIXED_SIGNS', 'Duration fields must not mix signs.');
    sign = s;
    out[unit] = Math.abs(v);
  }
  return Object.freeze({ ...out, sign });
}

/**
 * Type guard for `Duration` values.
 * @example isDuration(duration({ days: 1 })) // => true
 */
export function isDuration(value: unknown): value is Duration {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<Duration>;
  if (v.sign !== -1 && v.sign !== 0 && v.sign !== 1) return false;
  let nonZero = false;
  for (const u of UNITS) {
    const n = v[u];
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) return false;
    if (n) nonZero = true;
  }
  return nonZero === (v.sign !== 0);
}

/**
 * The same duration with the opposite sign.
 * @example negateDuration(duration({ days: 1 })).sign // => -1
 */
export function negateDuration(d: Duration): Duration {
  return Object.freeze({ ...d, sign: (0 - d.sign) as -1 | 0 | 1 });
}

const signed = (d: Duration, unit: DurationUnit): number => (d[unit] === 0 ? 0 : d.sign * d[unit]);

// ---------------------------------------------------------------------------
// ISO 8601

// Bounded quantifiers; the input length is checked first (ReDoS-safe).
const ISO_DURATION = /^([+-])?P(?:(\d{1,16})Y)?(?:(\d{1,16})M)?(?:(\d{1,16})W)?(?:(\d{1,16})D)?(?:T(?:(\d{1,16})H)?(?:(\d{1,16})M)?(?:(\d{1,16})(?:[.,](\d{1,9}))?S)?)?$/;

/**
 * Parses an ISO 8601 duration (`P1Y2M3DT4H5M6.5S`, `PT0S`, `P2W`, `-P1D`; weeks may mix with
 * other units per ISO 8601-2). Only seconds may be fractional, to millisecond precision
 * (`PT0.1234S` is rejected, `PT0.123000S` accepted). Returns `undefined` for `P`, `PT`, `P1YT`, and anything else invalid.
 * @example
 * parseIsoDuration('PT1H30M'); // => duration({ hours: 1, minutes: 30 })
 * parseIsoDuration('-P1D')?.sign; // => -1
 * parseIsoDuration('PT'); // => undefined
 */
export function parseIsoDuration(text: string): Duration | undefined {
  if (typeof text !== 'string' || text.length > 128) return undefined;
  const m = ISO_DURATION.exec(text);
  if (!m) return undefined;
  const hasDate = m[2] !== undefined || m[3] !== undefined || m[4] !== undefined || m[5] !== undefined;
  const hasTime = m[6] !== undefined || m[7] !== undefined || m[8] !== undefined;
  if (!hasDate && !hasTime) return undefined;
  if (text.includes('T') && !hasTime) return undefined;
  const frac = m[9] ?? '';
  if (/[1-9]/.test(frac.slice(3))) return undefined;
  const values = [m[2], m[3], m[4], m[5], m[6], m[7], m[8]].map((x) => Number(x ?? 0));
  if (!values.every((v) => Number.isSafeInteger(v))) return undefined;
  const [years = 0, months = 0, weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = values;
  const milliseconds = Number(frac.slice(0, 3).padEnd(3, '0'));
  const d = duration({ years, months, weeks, days, hours, minutes, seconds, milliseconds });
  return m[1] === '-' ? negateDuration(d) : d;
}

/**
 * ISO 8601 text for a duration; zero is `PT0S`, negative durations get a leading `-`.
 * @example formatIsoDuration(duration({ days: 1, minutes: 5, milliseconds: 500 })) // => 'P1DT5M0.5S'
 */
export function formatIsoDuration(d: Duration): string {
  let date = '';
  if (d.years) date += `${String(d.years)}Y`;
  if (d.months) date += `${String(d.months)}M`;
  if (d.weeks) date += `${String(d.weeks)}W`;
  if (d.days) date += `${String(d.days)}D`;
  let time = '';
  if (d.hours) time += `${String(d.hours)}H`;
  if (d.minutes) time += `${String(d.minutes)}M`;
  if (d.seconds || d.milliseconds) time += `${String(d.seconds)}${d.milliseconds ? `.${String(d.milliseconds).padStart(3, '0').replace(/0{1,2}$/, '')}` : ''}S`;
  if (!date && !time) return 'PT0S';
  return `${d.sign < 0 ? '-' : ''}P${date}${time ? `T${time}` : ''}`;
}

// ---------------------------------------------------------------------------
// Arithmetic

/** Reference point for calendar units. A plain date/date-time uses 24-hour days; a zoned one respects DST. */
export type RelativeTo = DateInput | PlainDateTime | ZonedRelativeTo;

export interface ZonedRelativeTo {
  readonly dateTime: DateInput | PlainDateTime;
  readonly timeZone: string;
  /** How `dateTime` maps to an instant if it is ambiguous or skipped. Default `'compatible'`. */
  readonly disambiguation?: Disambiguation;
}

const isZoned = (r: RelativeTo): r is ZonedRelativeTo => typeof r === 'object' && 'timeZone' in r;
const toDateTime = (v: DateInput | PlainDateTime): PlainDateTime => (isPlainDateTime(v) ? v : plainDateTime(v));

function timeMs(d: Duration): number {
  const total = d.hours * 3_600_000 + d.minutes * 60_000 + d.seconds * 1000 + d.milliseconds;
  if (!Number.isSafeInteger(total)) throw outOfRange();
  return d.sign * total;
}

function addDateUnits(date: PlainDate, d: Duration): PlainDate {
  const months = d.years * 12 + d.months;
  const days = d.weeks * 7 + d.days;
  if (!Number.isSafeInteger(months) || !Number.isSafeInteger(days)) throw outOfRange();
  return addDays(addMonths(date, d.sign * months + 0), d.sign * days + 0);
}

/**
 * Adds a duration to a date or wall-clock date-time, calendar-aware: years and months first
 * (month-end clamped), then weeks and days, then clock time. For a date, time units are
 * converted to whole days (remainder dropped), as Temporal's `PlainDate#add` does.
 * @example addDuration('2026-01-31', duration({ months: 1, days: 1 })) // => '2026-03-01'
 */
export function addDuration(value: PlainDateTime, d: Duration): PlainDateTime;
export function addDuration(value: DateInput, d: Duration): PlainDate;
export function addDuration(value: DateInput | PlainDateTime, d: Duration): PlainDate | PlainDateTime {
  if (!isDuration(d)) throw new ValidationError('HLP_DURATION_INVALID', 'Expected a Duration.');
  if (isPlainDateTime(value)) {
    const date = addDateUnits(value.date, d);
    const local = plainDateTimeToEpochMilliseconds(plainDateTime(date, value.time)) + timeMs(d);
    const day = Math.floor(local / DAY_MS);
    return plainDateTime(fromEpochDay(day), timeFromMilliseconds(local - day * DAY_MS));
  }
  return addDays(addDateUnits(toPlainDate(value), d), Math.trunc(timeMs(d) / DAY_MS) + 0);
}

/**
 * Adds a duration to an instant in a zone, like Temporal's `ZonedDateTime#add`: calendar units
 * move the wall-clock date (DST-aware, `compatible` disambiguation), then clock units add
 * exact elapsed time. Returns epoch milliseconds.
 * @example
 * const noon = Date.UTC(2026, 2, 7, 17); // Saturday 12:00 EST, the day before clocks spring forward
 * addDurationInZone(noon, duration({ days: 1 }), 'America/New_York'); // => Date.UTC(2026, 2, 8, 16) // Sunday 12:00 EDT, 23 h later
 * addDurationInZone(noon, duration({ hours: 24 }), 'America/New_York'); // => Date.UTC(2026, 2, 8, 17) // exactly 24 h: 13:00 EDT
 */
export function addDurationInZone(instant: InstantInput, d: Duration, timeZone: string): number {
  if (!isDuration(d)) throw new ValidationError('HLP_DURATION_INVALID', 'Expected a Duration.');
  const start = toEpochMs(instant);
  let mid = start;
  if (d.years || d.months || d.weeks || d.days) {
    const wall = instantToZoned(start, timeZone);
    mid = zonedToInstant(plainDateTime(addDateUnits(wall.date, d), wall.time), timeZone);
  }
  return toEpochMs(mid + timeMs(d));
}

export interface RelativeToOptions {
  readonly relativeTo?: RelativeTo;
}

/**
 * Total length in milliseconds (negative for negative durations). Years or months require
 * `relativeTo`, otherwise `HLP_DURATION_RELATIVE_TO_REQUIRED` is thrown.
 * @example durationToMilliseconds(duration({ hours: 1, minutes: 30 })) // => 5400000
 * @example durationToMilliseconds(duration({ days: 1 }), { relativeTo: { dateTime: '2026-03-08', timeZone: 'America/New_York' } }) // => 82800000
 */
export function durationToMilliseconds(d: Duration, options: RelativeToOptions = {}): number {
  if (!isDuration(d)) throw new ValidationError('HLP_DURATION_INVALID', 'Expected a Duration.');
  const { relativeTo } = options;
  if (relativeTo === undefined) {
    if (d.years || d.months) throw new ValidationError('HLP_DURATION_RELATIVE_TO_REQUIRED', 'Years and months need a relativeTo date.');
    const total = d.weeks * FIXED_MS.weeks + d.days * DAY_MS + d.hours * 3_600_000 + d.minutes * 60_000 + d.seconds * 1000 + d.milliseconds;
    if (!Number.isSafeInteger(total)) throw outOfRange();
    return total === 0 ? 0 : d.sign * total;
  }
  if (isZoned(relativeTo)) {
    const start = zonedToInstant(toDateTime(relativeTo.dateTime), relativeTo.timeZone, { disambiguation: relativeTo.disambiguation ?? 'compatible' });
    return addDurationInZone(start, d, relativeTo.timeZone) - start + 0;
  }
  const start = toDateTime(relativeTo);
  return plainDateTimeToEpochMilliseconds(addDuration(start, d)) - plainDateTimeToEpochMilliseconds(start) + 0;
}

/** Fixed-length units usable as `largestUnit`. */
export type FixedUnit = 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds';

const FIXED_ORDER: readonly FixedUnit[] = ['weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds'];

function assertFixedUnit(unit: string): asserts unit is FixedUnit {
  if (!(FIXED_ORDER as readonly string[]).includes(unit)) throw new ValidationError('HLP_DURATION_INVALID_UNIT', 'Unsupported largest unit.');
}

function decompose(totalAbs: number, largest: FixedUnit): Record<FixedUnit, number> {
  const out: Record<FixedUnit, number> = { weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 };
  let rest = totalAbs;
  for (const unit of FIXED_ORDER.slice(FIXED_ORDER.indexOf(largest))) {
    const size = FIXED_MS[unit];
    out[unit] = Math.floor(rest / size);
    rest -= out[unit] * size;
  }
  return out;
}

/**
 * Splits milliseconds into fixed units up to `largestUnit` (default `'hours'`; days are 24 h,
 * weeks 7 days). Fractional milliseconds are truncated.
 * @example
 * formatIsoDuration(millisecondsToDuration(90_061_001, { largestUnit: 'days' })); // => 'P1DT1H1M1.001S'
 * formatIsoDuration(millisecondsToDuration(90_061_001)); // => 'PT25H1M1.001S' // default largest unit: hours
 */
export function millisecondsToDuration(ms: number, options: { readonly largestUnit?: FixedUnit } = {}): Duration {
  if (!Number.isFinite(ms)) throw new ValidationError('HLP_DURATION_INVALID_FIELD', 'Milliseconds must be finite.');
  const whole = Math.trunc(ms);
  if (!Number.isSafeInteger(whole)) throw outOfRange();
  const largest = options.largestUnit ?? 'hours';
  assertFixedUnit(largest);
  const parts = decompose(Math.abs(whole), largest);
  const d = duration(parts);
  return whole < 0 ? negateDuration(d) : d;
}

/**
 * Rebalances fixed units at or below `largestUnit` (default `'hours'`): 90 minutes -> 1 h 30 min.
 * Units above `largestUnit`, and always years and months, are kept as they are.
 * @example
 * formatIsoDuration(normalizeDuration(duration({ minutes: 90 }))); // => 'PT1H30M'
 * formatIsoDuration(normalizeDuration(duration({ hours: 49 }), { largestUnit: 'days' })); // => 'P2DT1H'
 */
export function normalizeDuration(d: Duration, options: { readonly largestUnit?: FixedUnit } = {}): Duration {
  if (!isDuration(d)) throw new ValidationError('HLP_DURATION_INVALID', 'Expected a Duration.');
  const largest = options.largestUnit ?? 'hours';
  assertFixedUnit(largest);
  const rebalanced = FIXED_ORDER.slice(FIXED_ORDER.indexOf(largest));
  let total = 0;
  for (const u of rebalanced) total += d[u] * FIXED_MS[u];
  if (!Number.isSafeInteger(total)) throw outOfRange();
  const parts = decompose(total, largest);
  const fields: Record<DurationUnit, number> = { ...d };
  for (const u of rebalanced) fields[u] = parts[u];
  const out = duration(fields);
  return d.sign < 0 ? negateDuration(out) : out;
}

/**
 * Orders two durations by total length (`relativeTo` is required when either has years or months).
 * @example compareDurations(duration({ minutes: 90 }), duration({ hours: 1 })) // => 1
 */
export function compareDurations(a: Duration, b: Duration, options: RelativeToOptions = {}): -1 | 0 | 1 {
  const x = durationToMilliseconds(a, options);
  const y = durationToMilliseconds(b, options);
  return x < y ? -1 : x > y ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Human formatting

export interface FormatDurationOptions {
  readonly locale?: string;
  /** `'long'` (default, spoken-friendly: "3 hours, 5 minutes"), `'short'`, `'narrow'`, or `'digital'` ("3:05:00"). */
  readonly style?: 'long' | 'short' | 'narrow' | 'digital';
  /** Use `Intl.DurationFormat` when present. Default true; false forces the NumberFormat/ListFormat path for identical output on every engine. */
  readonly useNative?: boolean;
}

interface DurationFormatLike {
  format(value: Partial<Record<DurationUnit, number>>): string;
}
type DurationFormatCtor = new (locale: string | undefined, options: { readonly style: string }) => DurationFormatLike;

const SINGULAR: Readonly<Record<DurationUnit, string>> = { years: 'year', months: 'month', weeks: 'week', days: 'day', hours: 'hour', minutes: 'minute', seconds: 'second', milliseconds: 'millisecond' };

function unitPart(value: number, unit: DurationUnit, locale: string | undefined, display: 'long' | 'short' | 'narrow'): string {
  return numberFormat(locale, { style: 'unit', unit: SINGULAR[unit], unitDisplay: display }).format(value);
}

function fallbackFormat(d: Duration, locale: string | undefined, style: 'long' | 'short' | 'narrow' | 'digital'): string {
  const display = style === 'digital' ? 'short' : style;
  const units = style === 'digital' ? UNITS.slice(0, 4) : UNITS;
  const parts: string[] = [];
  for (const u of units) {
    if (!d[u]) continue;
    parts.push(unitPart(parts.length === 0 ? signed(d, u) : d[u], u, locale, display));
  }
  if (style === 'digital') {
    const two = numberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false });
    const neg = d.sign < 0 && parts.length === 0;
    let clock = `${numberFormat(locale, { useGrouping: false }).format(neg ? -d.hours : d.hours)}:${two.format(d.minutes)}:${two.format(d.seconds)}`;
    if (d.milliseconds) clock += `${numberFormat(locale, {}).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.'}${numberFormat(locale, { minimumIntegerDigits: 3, useGrouping: false }).format(d.milliseconds)}`;
    parts.push(clock);
    return listFormat(locale, { type: 'unit', style: 'narrow' }).format(parts);
  }
  if (parts.length === 0) return unitPart(0, 'seconds', locale, display);
  return listFormat(locale, { type: 'unit', style: display }).format(parts);
}

/**
 * Localized duration text, spoken-friendly by default.
 * @example formatDuration(duration({ hours: 3, minutes: 5 }), { locale: 'en' }) // => '3 hours, 5 minutes'
 */
export function formatDuration(d: Duration, options: FormatDurationOptions = {}): string {
  if (!isDuration(d)) throw new ValidationError('HLP_DURATION_INVALID', 'Expected a Duration.');
  const style = options.style ?? 'long';
  const { locale } = options;
  const Native = (Intl as unknown as { DurationFormat?: DurationFormatCtor }).DurationFormat;
  if (Native && (options.useNative ?? true)) {
    const f = cachedIntl('df', locale, { style }, () => new Native(locale, { style }));
    if (d.sign === 0) return style === 'digital' ? f.format({ seconds: 0 }) : unitPart(0, 'seconds', locale, style);
    const value: Partial<Record<DurationUnit, number>> = {};
    for (const u of UNITS) if (d[u]) value[u] = signed(d, u);
    return f.format(value);
  }
  return fallbackFormat(d, locale, style);
}

export interface HumanizeOptions {
  readonly locale?: string;
  /** Maximum number of units shown. Default 2. */
  readonly largestUnits?: number;
  readonly style?: 'long' | 'short' | 'narrow';
  /** Largest unit used. Default `'days'`. */
  readonly largestUnit?: FixedUnit;
  /** Smallest unit shown. Default `'seconds'`. */
  readonly smallestUnit?: FixedUnit;
  /** See `FormatDurationOptions.useNative`. */
  readonly useNative?: boolean;
}

/**
 * Approximate, human-friendly length of `ms`: the largest non-zero units, at most
 * `largestUnits` of them, with the last one rounded half-up.
 * @example humanizeDuration(5_430_000, { locale: 'en' }) // => '1 hour, 31 minutes'
 */
export function humanizeDuration(ms: number, options: HumanizeOptions = {}): string {
  if (!Number.isFinite(ms)) throw new ValidationError('HLP_DURATION_INVALID_FIELD', 'Milliseconds must be finite.');
  const count = options.largestUnits ?? 2;
  if (!Number.isInteger(count) || count < 1 || count > 6) throw new ValidationError('HLP_DURATION_INVALID_UNIT', 'largestUnits must be an integer 1 to 6.');
  const largest = options.largestUnit ?? 'days';
  const smallest = options.smallestUnit ?? 'seconds';
  assertFixedUnit(largest);
  assertFixedUnit(smallest);
  const li = FIXED_ORDER.indexOf(largest);
  const si = FIXED_ORDER.indexOf(smallest);
  if (si < li) throw new ValidationError('HLP_DURATION_INVALID_UNIT', 'smallestUnit is larger than largestUnit.');
  const abs = Math.abs(Math.trunc(ms));
  if (!Number.isSafeInteger(abs)) throw outOfRange();
  const first = decompose(abs, largest);
  let top = FIXED_ORDER.findIndex((u, i) => i >= li && first[u] > 0);
  if (top < 0 || top > si) top = si;
  const lastIndex = Math.min(top + count - 1, si);
  const lastUnit = FIXED_ORDER[lastIndex] ?? 'seconds';
  const unitMs = FIXED_MS[lastUnit];
  const rounded = Math.round(abs / unitMs) * unitMs;
  const parts = decompose(rounded, largest);
  const newTop = FIXED_ORDER.findIndex((u, i) => i >= li && parts[u] > 0);
  const fields: Partial<Record<FixedUnit, number>> = {};
  if (newTop >= 0) for (let i = newTop; i <= Math.min(newTop + count - 1, si); i++) {
    const u = FIXED_ORDER[i];
    if (u) fields[u] = parts[u];
  }
  const d = duration(fields);
  const style = options.style ?? 'long';
  const common = { style, ...(options.locale === undefined ? {} : { locale: options.locale }), ...(options.useNative === undefined ? {} : { useNative: options.useNative }) };
  if (d.sign === 0) return unitPart(0, smallest, options.locale, style);
  return formatDuration(ms < 0 ? negateDuration(d) : d, common);
}

/**
 * Stopwatch text `HH:MM:SS` (hours grow past 99; `.SSS` with `milliseconds: true`). Sub-unit remainders are
 * truncated; negative values get a leading `-` unless they display as zero.
 * @example formatClock(3_909_000) // => '01:05:09'
 */
export function formatClock(ms: number, options: { readonly milliseconds?: boolean } = {}): string {
  if (!Number.isFinite(ms)) throw new ValidationError('HLP_DURATION_INVALID_FIELD', 'Milliseconds must be finite.');
  const abs = Math.floor(Math.abs(ms));
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  const p = (n: number, len = 2): string => String(n).padStart(len, '0');
  const text = `${p(h)}:${p(m)}:${p(s)}${options.milliseconds ? `.${p(abs % 1000, 3)}` : ''}`;
  const shown = options.milliseconds ? abs : abs - (abs % 1000);
  return ms < 0 && shown > 0 ? `-${text}` : text;
}
