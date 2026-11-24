/**
 * Chart scales (SPEC section 18.18 shared infrastructure): linear scales with "nice"
 * ticks, band scales for categories, and calendar-aware time ticks computed in an
 * explicit IANA timezone (never the host machine's zone, SPEC section 8.1).
 * Pure functions: no DOM access. Internal: not a public subpath export.
 */
import { fieldsToEpoch, instant, plainDate, plainDateTime, plainTime, toInstant, toPlainDateTime } from '@absoluteui/core';

export interface LinearTicks {
  /** Domain start (a tick when `nice`). */
  readonly min: number;
  /** Domain end (a tick when `nice`). */
  readonly max: number;
  readonly step: number;
  /** Fraction digits needed to print every tick exactly. */
  readonly decimals: number;
  readonly values: readonly number[];
}

export interface LinearScale {
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
  readonly map: (value: number) => number;
}

export interface BandScale {
  readonly count: number;
  /** Width of one band, px. */
  readonly bandwidth: number;
  /** Distance between the starts of adjacent bands, px. */
  readonly step: number;
  /** Lower-coordinate edge of band `index` (independent of range direction). */
  readonly start: (index: number) => number;
  readonly center: (index: number) => number;
  /** Band index at a pixel position, or -1 outside every band's step. */
  readonly indexAt: (position: number) => number;
}

/**
 * A "nice" step (1, 2 or 5 times a power of ten) that splits `span` into about
 * `count` intervals (Heckbert's nice numbers, rounded).
 */
export function niceStep(span: number, count: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const intervals = Math.max(1, Math.round(count));
  const raw = span / intervals;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  return nice * power;
}

function decimalsFor(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

function roundTo(value: number, decimals: number): number {
  // toFixed avoids binary artifacts such as 0.30000000000000004; +0 normalizes -0.
  return Number(value.toFixed(Math.min(100, decimals))) + 0;
}

/**
 * Ticks for [min, max]. With `nice` (default) the domain is extended outward to
 * whole steps. A zero-width domain is widened so a single value still renders
 * mid-scale. Non-finite input yields the domain [0, 1].
 */
export function linearTicks(min: number, max: number, count = 5, nice = true): LinearTicks {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo = lo === 0 ? 0 : lo - pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, count);
  const decimals = decimalsFor(step);
  const first = nice ? Math.floor(lo / step + 1e-9) : Math.ceil(lo / step - 1e-9);
  const last = nice ? Math.ceil(hi / step - 1e-9) : Math.floor(hi / step + 1e-9);
  const values: number[] = [];
  for (let i = first; i <= last && values.length <= 1000; i++) values.push(roundTo(i * step, decimals));
  return {
    min: nice ? roundTo(first * step, decimals) : lo,
    max: nice ? roundTo(last * step, decimals) : hi,
    step,
    decimals,
    values,
  };
}

export function linearScale(domain: readonly [number, number], range: readonly [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const mid = (r0 + r1) / 2;
  return {
    domain,
    range,
    map: (value) => (k === 0 ? mid : r0 + (value - d0) * k),
  };
}

/**
 * Categorical band scale over `range` (which may run right-to-left for RTL).
 * `paddingInner` is the gap between bands and `paddingOuter` the gap at both ends,
 * both as fractions of `step`.
 */
export function bandScale(count: number, range: readonly [number, number], paddingInner = 0.2, paddingOuter = 0.1): BandScale {
  const [r0, r1] = range;
  const dir = r1 >= r0 ? 1 : -1;
  const length = Math.abs(r1 - r0);
  const n = Math.max(0, count);
  const step = n === 0 ? 0 : length / Math.max(1e-9, n - paddingInner + 2 * paddingOuter);
  const bandwidth = step * (1 - paddingInner);
  const offset = (index: number): number => r0 + dir * (paddingOuter * step + index * step);
  return {
    count: n,
    bandwidth,
    step,
    start: (index) => (dir > 0 ? offset(index) : offset(index) - bandwidth),
    center: (index) => offset(index) + (dir * bandwidth) / 2,
    indexAt: (position) => {
      if (n === 0 || step === 0) return -1;
      const along = (position - r0) * dir - paddingOuter * step + (paddingInner * step) / 2;
      const index = Math.floor(along / step);
      return index >= 0 && index < n ? index : -1;
    },
  };
}

export type TimeUnit = 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year';

export interface TimeTicks {
  readonly unit: TimeUnit;
  /** Units per tick, e.g. 15 for 15-minute ticks. */
  readonly every: number;
  /** Tick instants, epoch milliseconds, ascending, within the domain. */
  readonly values: readonly number[];
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30.44 * DAY;
const YEAR = 365.25 * DAY;

const INTERVALS: readonly (readonly [TimeUnit, number, number])[] = [
  ['second', 1, SECOND], ['second', 5, 5 * SECOND], ['second', 15, 15 * SECOND], ['second', 30, 30 * SECOND],
  ['minute', 1, MINUTE], ['minute', 5, 5 * MINUTE], ['minute', 15, 15 * MINUTE], ['minute', 30, 30 * MINUTE],
  ['hour', 1, HOUR], ['hour', 3, 3 * HOUR], ['hour', 6, 6 * HOUR], ['hour', 12, 12 * HOUR],
  ['day', 1, DAY], ['day', 2, 2 * DAY], ['day', 7, 7 * DAY],
  ['month', 1, MONTH], ['month', 3, 3 * MONTH], ['month', 6, 6 * MONTH],
];

/** Wall-clock fields (possibly overflowing, e.g. month 13) to an instant in `timeZone`. */
function localToEpoch(timeZone: string, year: number, month: number, day: number, hour = 0, minute = 0): number {
  const normalized = new Date(fieldsToEpoch(year, month, day, hour, minute));
  const local = plainDateTime(
    plainDate(normalized.getUTCFullYear(), normalized.getUTCMonth() + 1, normalized.getUTCDate()),
    plainTime(normalized.getUTCHours(), normalized.getUTCMinutes()),
  );
  // 'compatible': a tick in a DST gap moves forward, an ambiguous one takes the earlier instant.
  return toInstant(local, timeZone, 'compatible').epochMilliseconds;
}

/**
 * Calendar-aware ticks for [min, max] (epoch ms), aligned to wall-clock boundaries
 * in `timeZone`: 00:00 local for days, the 1st for months, January for years.
 * Across DST changes ticks follow local time, so their spacing is uneven there.
 */
export function timeTicks(min: number, max: number, count: number, timeZone: string): TimeTicks {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const span = hi - lo;
  const target = Math.max(1, count);
  if (!Number.isFinite(span) || span <= 0) return { unit: 'day', every: 1, values: Number.isFinite(lo) ? [lo] : [] };

  if (span / SECOND < target) {
    const step = niceStep(span, target);
    const values: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi && values.length < 1000; v += step) values.push(v);
    return { unit: 'millisecond', every: step, values };
  }

  const found = INTERVALS.find(([, , ms]) => span / ms <= target);
  const unit: TimeUnit = found?.[0] ?? 'year';
  const every = found?.[1] ?? Math.max(1, niceStep(span / YEAR, target));
  const values: number[] = [];
  const push = (v: number): void => {
    const previous = values[values.length - 1];
    if (v >= lo && v <= hi && (previous === undefined || v > previous)) values.push(v);
  };

  if (unit === 'second') {
    const step = every * SECOND;
    for (let v = Math.ceil(lo / step) * step; v <= hi && values.length < 1000; v += step) push(v);
    return { unit, every, values };
  }

  const start = toPlainDateTime(instant(lo), timeZone);
  const { year, month, day } = start.date;
  const { hour, minute } = start.time;
  for (let k = 0; k < 2000 && values.length < 1000; k++) {
    let v: number;
    switch (unit) {
      case 'minute':
        v = localToEpoch(timeZone, year, month, day, hour, Math.floor(minute / every) * every + k * every);
        break;
      case 'hour':
        v = localToEpoch(timeZone, year, month, day, Math.floor(hour / every) * every + k * every);
        break;
      case 'day':
        v = localToEpoch(timeZone, year, month, (every === 1 ? day : 1 + Math.floor((day - 1) / every) * every) + k * every);
        break;
      case 'month':
        v = localToEpoch(timeZone, year, 1 + Math.floor((month - 1) / every) * every + k * every, 1);
        break;
      default:
        v = localToEpoch(timeZone, Math.floor(year / every) * every + k * every, 1, 1);
    }
    if (v > hi) break;
    push(v);
  }
  return { unit, every, values };
}
