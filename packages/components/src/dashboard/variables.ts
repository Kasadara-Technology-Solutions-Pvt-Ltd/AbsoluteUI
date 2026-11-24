/**
 * Dashboard variables (S1): values, date range presets (with the business calendar for business-day
 * presets), and placeholder interpolation into data source parameters and bodies.
 */
import {
  addDays,
  addMonths,
  addQuarters,
  addYears,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  formatPlainDate,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  today,
  type PlainDate,
} from '@absoluteui/helpers/date';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import { PLACEHOLDER_PATTERN, type DateRangePreset, type DateRangeValue, type JsonValue, type VariableDefinition } from './definition.js';

/** A resolved date range (ISO dates, inclusive). */
export interface DateRange {
  readonly from: string;
  readonly to: string;
}

/** Current value of a variable. */
export type VariableValue = DateRange | string | number | readonly string[] | null;

export interface DateContext {
  /** IANA time zone for "today". Default: the runtime zone. */
  readonly timeZone?: string;
  /** Business calendar for business-day presets. Without one, Monday to Friday are working days. */
  readonly calendar?: BusinessCalendarEngine;
  /** Override "today" (tests, server rendering). */
  readonly today?: PlainDate;
}

function iso(d: PlainDate): string {
  return formatPlainDate(d);
}

function isWorking(d: PlainDate, calendar: BusinessCalendarEngine | undefined): boolean {
  if (calendar) return calendar.isWorkingDay(d);
  const weekday = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/** The last `count` working days up to and including the most recent working day. */
function lastBusinessDays(now: PlainDate, count: number, calendar: BusinessCalendarEngine | undefined): DateRange {
  let end = now;
  let guard = 0;
  while (!isWorking(end, calendar) && guard++ < 366) end = addDays(end, -1);
  let start = end;
  let found = 1;
  guard = 0;
  while (found < count && guard++ < 3660) {
    start = addDays(start, -1);
    if (isWorking(start, calendar)) found++;
  }
  return { from: iso(start), to: iso(end) };
}

export function resolvePreset(preset: DateRangePreset, context: DateContext = {}): DateRange {
  const now = context.today ?? today(context.timeZone);
  const range = (a: PlainDate, b: PlainDate): DateRange => ({ from: iso(a), to: iso(b) });
  switch (preset) {
    case 'today':
      return range(now, now);
    case 'yesterday': {
      const y = addDays(now, -1);
      return range(y, y);
    }
    case 'last7Days':
      return range(addDays(now, -6), now);
    case 'last30Days':
      return range(addDays(now, -29), now);
    case 'thisWeek':
      return range(startOfWeek(now), endOfWeek(now));
    case 'lastWeek': {
      const p = addDays(startOfWeek(now), -7);
      return range(p, endOfWeek(p));
    }
    case 'thisMonth':
      return range(startOfMonth(now), endOfMonth(now));
    case 'lastMonth': {
      const p = addMonths(startOfMonth(now), -1);
      return range(p, endOfMonth(p));
    }
    case 'thisQuarter':
      return range(startOfQuarter(now), endOfQuarter(now));
    case 'lastQuarter': {
      const p = addQuarters(startOfQuarter(now), -1);
      return range(p, endOfQuarter(p));
    }
    case 'thisYear':
      return range(startOfYear(now), endOfYear(now));
    case 'lastYear': {
      const p = addYears(startOfYear(now), -1);
      return range(p, endOfYear(p));
    }
    case 'yearToDate':
      return range(startOfYear(now), now);
    case 'last5BusinessDays':
      return lastBusinessDays(now, 5, context.calendar);
    case 'last20BusinessDays':
      return lastBusinessDays(now, 20, context.calendar);
  }
}

export function resolveDateRange(value: DateRangeValue, context: DateContext = {}): DateRange {
  return 'preset' in value ? resolvePreset(value.preset, context) : { from: value.from, to: value.to };
}

/** Initial value of a variable: its default, or a sensible empty value. */
export function initialValue(def: VariableDefinition, contexts: (calendar: string | undefined) => DateContext): VariableValue {
  switch (def.kind) {
    case 'dateRange':
      return resolveDateRange(def.default ?? { preset: 'last30Days' }, contexts(def.businessCalendar));
    case 'select':
      return def.default ?? (def.multiple === true ? [] : (def.options[0]?.value ?? null));
    case 'text':
      return def.default ?? '';
    case 'number':
      return def.default ?? null;
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a value set at runtime (UI, interactions, host API). Returns the value or undefined when invalid. */
export function acceptValue(def: VariableDefinition, value: unknown): VariableValue | undefined {
  switch (def.kind) {
    case 'dateRange': {
      if (value === null || typeof value !== 'object') return undefined;
      const { from, to } = value as Record<string, unknown>;
      return typeof from === 'string' && typeof to === 'string' && ISO.test(from) && ISO.test(to) && from <= to ? { from, to } : undefined;
    }
    case 'select': {
      const allowed = new Set(def.options.map((o) => o.value));
      if (def.multiple === true) return Array.isArray(value) && value.every((v) => typeof v === 'string' && allowed.has(v)) ? Object.freeze([...(value as string[])]) : undefined;
      return typeof value === 'string' && allowed.has(value) ? value : undefined;
    }
    case 'text':
      return typeof value === 'string' && value.length <= (def.maxLength ?? 2000) ? value : undefined;
    case 'number':
      if (value === null) return null;
      return typeof value === 'number' && Number.isFinite(value) && (def.min === undefined || value >= def.min) && (def.max === undefined || value <= def.max) ? value : undefined;
  }
}

function part(value: VariableValue | undefined, sub: string | undefined): JsonValue {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const range = value as DateRange;
    return sub === 'to' ? range.to : sub === 'from' ? range.from : `${range.from}/${range.to}`;
  }
  if (Array.isArray(value)) return value as readonly string[];
  return value;
}

function asText(v: JsonValue): string {
  if (Array.isArray(v)) return v.map(asText).join(',');
  return v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/**
 * Replaces placeholders in a string. With `raw`, a string that is exactly one placeholder becomes the
 * variable's value itself (number or array), for JSON bodies.
 */
export function interpolate(text: string, values: ReadonlyMap<string, VariableValue>, raw = false): JsonValue {
  if (raw) {
    const whole = new RegExp(`^${PLACEHOLDER_PATTERN.source}$`).exec(text);
    if (whole) return part(values.get(whole[1] ?? ''), whole[2]);
  }
  return text.replace(PLACEHOLDER_PATTERN, (_m, name: string, sub: string | undefined) => asText(part(values.get(name), sub)));
}

/** Replaces placeholders in a string, always returning text (query parameters). */
export function interpolateText(text: string, values: ReadonlyMap<string, VariableValue>): string {
  return asText(interpolate(text, values));
}

/** Interpolates every string inside a JSON value (bodies). */
export function interpolateJson(value: JsonValue, values: ReadonlyMap<string, VariableValue>): JsonValue {
  if (typeof value === 'string') return interpolate(value, values, true);
  if (Array.isArray(value)) return value.map((v: JsonValue) => interpolateJson(v, values));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolateJson(v, values);
    return out;
  }
  return value;
}

/** Variable ids a string refers to. */
export function referencedVariables(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[1] ?? '');
}
