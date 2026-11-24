/**
 * Recurrence rules (SPEC section 8.3/section 8.4): an explicit, frozen value type for the
 * RFC 5545 RRULE subset AbsoluteUI supports, with EXDATE and RDATE lists.
 *
 * Supported rule parts: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT,
 * UNTIL, BYDAY (with ordinals for MONTHLY and YEARLY), BYMONTHDAY, BYMONTH,
 * BYSETPOS, WKST. Anything else (BYHOUR, BYWEEKNO, BYYEARDAY, sub-daily
 * frequencies, RSCALE) is rejected rather than silently ignored.
 *
 * A rule has no start: occurrences are expanded from the event's start
 * (`expandRecurrence`), whose wall-clock time and timezone they keep.
 */
import { validationError } from '../errors.js';
import {
  instant,
  plainDate,
  plainDateTime,
  plainTime,
  type Instant,
  type PlainDate,
  type PlainDateTime,
} from '../timezone/types.js';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A BYDAY entry: every such weekday, or the nth (1..53 from the start, -1..-53 from the end). */
export interface RecurrenceWeekday {
  readonly weekday: IsoWeekday;
  /** Ordinal within the month (MONTHLY, or YEARLY with BYMONTH) or the year. Omitted: every such weekday. */
  readonly nth?: number;
}

/** End of a series: a date (all-day series), a wall-clock time, or an exact instant. */
export type RecurrenceUntil = PlainDate | PlainDateTime | Instant;

/** A date (all-day series) or wall-clock start in the series timezone (EXDATE and RDATE values). */
export type RecurrenceDate = PlainDate | PlainDateTime;

export interface RecurrenceRule {
  readonly kind: 'RecurrenceRule';
  readonly frequency: RecurrenceFrequency;
  /** Every nth period, >= 1. */
  readonly interval: number;
  /** Total occurrences including the start; null when unbounded or bounded by `until`. */
  readonly count: number | null;
  /** Last allowed start (inclusive); null when unbounded or bounded by `count`. */
  readonly until: RecurrenceUntil | null;
  readonly byDay: readonly RecurrenceWeekday[];
  /** 1..31 or -1..-31 (from the end of the month). */
  readonly byMonthDay: readonly number[];
  /** 1..12 */
  readonly byMonth: readonly number[];
  /** Positions within each period's set, 1..366 or -1..-366. */
  readonly bySetPos: readonly number[];
  /** First day of the week for WEEKLY periods (WKST). Default 1 (Monday). */
  readonly weekStart: IsoWeekday;
  /** Cancelled occurrences (EXDATE), matched against occurrence starts. */
  readonly exclusions: readonly RecurrenceDate[];
  /** Extra occurrences (RDATE). */
  readonly inclusions: readonly RecurrenceDate[];
}

export interface RecurrenceRuleInit {
  frequency: RecurrenceFrequency;
  interval?: number;
  count?: number | null;
  until?: RecurrenceUntil | null;
  byDay?: readonly RecurrenceWeekday[];
  byMonthDay?: readonly number[];
  byMonth?: readonly number[];
  bySetPos?: readonly number[];
  weekStart?: IsoWeekday;
  exclusions?: readonly RecurrenceDate[];
  inclusions?: readonly RecurrenceDate[];
}

const FREQUENCIES: readonly RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];
const DAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

function invalid(property: string, expected: string): never {
  throw validationError('RECURRENCE_INVALID', 'Invalid recurrence rule.', { property: `recurrence.${property}`, expected });
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const kindOf = (v: unknown): unknown => (typeof v === 'object' && v !== null ? (v as { kind?: unknown }).kind : undefined);
const isRecurrenceDate = (v: unknown): v is RecurrenceDate => kindOf(v) === 'PlainDate' || kindOf(v) === 'PlainDateTime';

function intList(value: unknown, property: string, ok: (n: number) => boolean, expected: string): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((n) => isInt(n) && ok(n))) invalid(property, expected);
  // Positive values first, then values counted from the end (-1 last), as people write them.
  const order = (n: number): number => (n > 0 ? n : 1000 + n);
  return [...new Set(value as number[])].sort((a, b) => order(a) - order(b));
}

/** Create a validated, frozen recurrence rule (RFC 5545 constraints included). */
export function recurrenceRule(init: RecurrenceRuleInit): RecurrenceRule {
  if (typeof init !== 'object' || (init as unknown) === null) invalid('init', 'RecurrenceRuleInit');
  if (!FREQUENCIES.includes(init.frequency)) invalid('frequency', '"daily" | "weekly" | "monthly" | "yearly"');
  const interval = init.interval ?? 1;
  if (!isInt(interval) || interval < 1 || interval > 10_000) invalid('interval', 'integer from 1 to 10000');
  const count = init.count ?? null;
  if (count !== null && (!isInt(count) || count < 1 || count > 100_000)) invalid('count', 'integer from 1 to 100000, or null');
  const until = init.until ?? null;
  if (until !== null && !(isRecurrenceDate(until) || kindOf(until) === 'Instant')) invalid('until', 'PlainDate | PlainDateTime | Instant | null');
  if (count !== null && until !== null) invalid('until', 'not combined with count (RFC 5545)');
  const rawDays: unknown = init.byDay ?? [];
  if (!Array.isArray(rawDays)) invalid('byDay', 'RecurrenceWeekday[]');
  const seen = new Set<string>();
  const byDay: RecurrenceWeekday[] = [];
  for (const d of rawDays as unknown[]) {
    if (typeof d !== 'object' || d === null) invalid('byDay', 'RecurrenceWeekday[]');
    const { weekday, nth } = d as { weekday?: unknown; nth?: unknown };
    if (!isInt(weekday) || weekday < 1 || weekday > 7) invalid('byDay.weekday', 'integer from 1 (Monday) to 7 (Sunday)');
    if (nth !== undefined && (!isInt(nth) || nth === 0 || nth < -53 || nth > 53)) invalid('byDay.nth', 'integer from 1 to 53 or -1 to -53');
    if (nth !== undefined && init.frequency !== 'monthly' && init.frequency !== 'yearly') invalid('byDay.nth', 'only with monthly or yearly frequency (RFC 5545)');
    if (nth !== undefined && init.frequency === 'monthly' && Math.abs(nth) > 5) invalid('byDay.nth', 'integer from 1 to 5 or -1 to -5 for monthly frequency');
    const key = `${String(nth ?? 0)}|${String(weekday)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    byDay.push(Object.freeze(nth === undefined ? { weekday: weekday as IsoWeekday } : { weekday: weekday as IsoWeekday, nth }));
  }
  byDay.sort((a, b) => (a.nth ?? 0) - (b.nth ?? 0) || a.weekday - b.weekday);
  const byMonthDay = intList(init.byMonthDay, 'byMonthDay', (n) => n !== 0 && n >= -31 && n <= 31, 'integers from 1 to 31 or -1 to -31');
  if (byMonthDay.length > 0 && init.frequency === 'weekly') invalid('byMonthDay', 'not with weekly frequency (RFC 5545)');
  const byMonth = intList(init.byMonth, 'byMonth', (n) => n >= 1 && n <= 12, 'integers from 1 to 12');
  const bySetPos = intList(init.bySetPos, 'bySetPos', (n) => n !== 0 && n >= -366 && n <= 366, 'integers from 1 to 366 or -366 to -1');
  if (bySetPos.length > 0 && byDay.length === 0 && byMonthDay.length === 0 && byMonth.length === 0) invalid('bySetPos', 'only with byDay, byMonthDay, or byMonth (RFC 5545)');
  const weekStart = init.weekStart ?? 1;
  if (!isInt(weekStart) || weekStart < 1 || weekStart > 7) invalid('weekStart', 'integer from 1 (Monday) to 7 (Sunday)');
  const dates = (value: unknown, property: string): RecurrenceDate[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every(isRecurrenceDate)) invalid(property, '(PlainDate | PlainDateTime)[]');
    const list = value;
    const kinds = new Set(list.map((d) => d.kind));
    if (kinds.size > 1) invalid(property, 'all PlainDate or all PlainDateTime');
    const unique = new Map(list.map((d) => [dateKey(d), d]));
    return [...unique.values()].sort((a, b) => (dateKey(a) < dateKey(b) ? -1 : 1));
  };
  const exclusions = dates(init.exclusions, 'exclusions');
  const inclusions = dates(init.inclusions, 'inclusions');
  return Object.freeze({
    kind: 'RecurrenceRule',
    frequency: init.frequency,
    interval,
    count,
    until,
    byDay: Object.freeze(byDay),
    byMonthDay: Object.freeze(byMonthDay),
    byMonth: Object.freeze(byMonth),
    bySetPos: Object.freeze(bySetPos),
    weekStart: weekStart,
    exclusions: Object.freeze(exclusions),
    inclusions: Object.freeze(inclusions),
  });
}

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

/** Sortable key of a date or wall-clock time (`YYYYMMDD` or `YYYYMMDDTHHMMSS`). */
export function dateKey(d: RecurrenceDate): string {
  if (d.kind === 'PlainDate') return `${pad(d.year, 4)}${pad(d.month)}${pad(d.day)}`;
  return `${pad(d.date.year, 4)}${pad(d.date.month)}${pad(d.date.day)}T${pad(d.time.hour)}${pad(d.time.minute)}${pad(d.time.second)}`;
}

function untilToString(u: RecurrenceUntil): string {
  if (u.kind === 'Instant') {
    const d = new Date(u.epochMilliseconds);
    return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  }
  return dateKey(u);
}

function dateLine(name: 'EXDATE' | 'RDATE', list: readonly RecurrenceDate[]): string {
  const allDay = list[0]?.kind === 'PlainDate';
  return `${name}${allDay ? ';VALUE=DATE' : ''}:${list.map(dateKey).join(',')}`;
}

/**
 * iCalendar text of a rule: an `RRULE:` line, then `EXDATE` and `RDATE` lines when
 * present, separated by `\n`. Wall-clock EXDATE/RDATE values are floating local
 * times (no `TZID`): they are read in the series timezone.
 */
export function recurrenceRuleToString(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.frequency.toUpperCase()}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${String(rule.interval)}`);
  if (rule.count !== null) parts.push(`COUNT=${String(rule.count)}`);
  if (rule.until !== null) parts.push(`UNTIL=${untilToString(rule.until)}`);
  if (rule.byMonth.length) parts.push(`BYMONTH=${rule.byMonth.join(',')}`);
  if (rule.byMonthDay.length) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  if (rule.byDay.length) parts.push(`BYDAY=${rule.byDay.map((d) => `${d.nth === undefined ? '' : String(d.nth)}${DAY_CODES[d.weekday - 1] ?? ''}`).join(',')}`);
  if (rule.bySetPos.length) parts.push(`BYSETPOS=${rule.bySetPos.join(',')}`);
  if (rule.weekStart !== 1) parts.push(`WKST=${DAY_CODES[rule.weekStart - 1] ?? 'MO'}`);
  const lines = [`RRULE:${parts.join(';')}`];
  if (rule.exclusions.length) lines.push(dateLine('EXDATE', rule.exclusions));
  if (rule.inclusions.length) lines.push(dateLine('RDATE', rule.inclusions));
  return lines.join('\n');
}

const DATE_VALUE = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME_VALUE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

function parseDateValue(text: string, allowInstant: boolean): RecurrenceUntil | null {
  try {
    const d = DATE_VALUE.exec(text);
    if (d) return plainDate(Number(d[1]), Number(d[2]), Number(d[3]));
    const t = DATE_TIME_VALUE.exec(text);
    if (!t) return null;
    const date = plainDate(Number(t[1]), Number(t[2]), Number(t[3]));
    const time = plainTime(Number(t[4]), Number(t[5]), Number(t[6]));
    if (t[7] === 'Z') {
      if (!allowInstant) return null;
      return instant(Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, time.second));
    }
    return plainDateTime(date, time);
  } catch {
    return null;
  }
}

const intOf = (text: string): number | null => (/^[+-]?\d{1,6}$/.test(text) ? Number(text) : null);

function parseRRule(value: string, init: Partial<RecurrenceRuleInit>): boolean {
  const seen = new Set<string>();
  for (const part of value.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) return false;
    const key = part.slice(0, eq).toUpperCase();
    const val = part.slice(eq + 1).toUpperCase();
    if (seen.has(key) || val === '') return false;
    seen.add(key);
    const list = val.split(',');
    switch (key) {
      case 'FREQ': {
        const f = val.toLowerCase() as RecurrenceFrequency;
        if (!FREQUENCIES.includes(f)) return false;
        init.frequency = f;
        break;
      }
      case 'INTERVAL':
      case 'COUNT': {
        const n = intOf(val);
        if (n === null) return false;
        if (key === 'INTERVAL') init.interval = n;
        else init.count = n;
        break;
      }
      case 'UNTIL': {
        const u = parseDateValue(val, true);
        if (!u) return false;
        init.until = u;
        break;
      }
      case 'BYDAY': {
        const days: RecurrenceWeekday[] = [];
        for (const item of list) {
          const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(item);
          if (!m) return false;
          const weekday = (DAY_CODES.indexOf(m[2] as (typeof DAY_CODES)[number]) + 1) as IsoWeekday;
          days.push(m[1] === undefined ? { weekday } : { weekday, nth: Number(m[1]) });
        }
        init.byDay = days;
        break;
      }
      case 'BYMONTHDAY':
      case 'BYMONTH':
      case 'BYSETPOS': {
        const nums = list.map(intOf);
        if (nums.some((n) => n === null)) return false;
        const values = nums as number[];
        if (key === 'BYMONTHDAY') init.byMonthDay = values;
        else if (key === 'BYMONTH') init.byMonth = values;
        else init.bySetPos = values;
        break;
      }
      case 'WKST': {
        const i = DAY_CODES.indexOf(val as (typeof DAY_CODES)[number]);
        if (i < 0) return false;
        init.weekStart = (i + 1) as IsoWeekday;
        break;
      }
      default:
        // Unsupported rule parts are refused, never ignored.
        return false;
    }
  }
  return init.frequency !== undefined;
}

function parseDateList(params: string, value: string): RecurrenceDate[] | null {
  const upper = params.toUpperCase();
  if (upper !== '' && upper !== ';VALUE=DATE' && upper !== ';VALUE=DATE-TIME') return null;
  const out: RecurrenceDate[] = [];
  for (const item of value.split(',')) {
    const d = parseDateValue(item.trim(), false);
    if (!d || d.kind === 'Instant') return null;
    if (upper === ';VALUE=DATE' && d.kind !== 'PlainDate') return null;
    if (upper === ';VALUE=DATE-TIME' && d.kind !== 'PlainDateTime') return null;
    out.push(d);
  }
  return out;
}

/**
 * Parse iCalendar recurrence text: a bare rule value (`FREQ=WEEKLY;BYDAY=MO`), or
 * lines (`\n` or `\r\n`) with one `RRULE:` and optional `EXDATE:`/`RDATE:` lines
 * (floating local or `VALUE=DATE` values; `TZID` and UTC `Z` values are not
 * supported there). `UNTIL` may be a date, a local time, or UTC (`Z`). Returns null
 * for invalid or unsupported input.
 */
export function parseRecurrenceRule(text: string): RecurrenceRule | null {
  if (typeof text !== 'string') return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  if (lines.length === 0) return null;
  const init: Partial<RecurrenceRuleInit> = {};
  let hasRule = false;
  const exclusions: RecurrenceDate[] = [];
  const inclusions: RecurrenceDate[] = [];
  for (const line of lines) {
    const m = /^(RRULE|EXDATE|RDATE)((?:;[^:]*)?):(.+)$/i.exec(line);
    if (!m) {
      if (lines.length === 1 && !hasRule && parseRRule(line, init)) {
        hasRule = true;
        continue;
      }
      return null;
    }
    const name = (m[1] ?? '').toUpperCase();
    const params = m[2] ?? '';
    const value = m[3] ?? '';
    if (name === 'RRULE') {
      if (hasRule || params !== '' || !parseRRule(value, init)) return null;
      hasRule = true;
    } else {
      const list = parseDateList(params, value);
      if (!list) return null;
      (name === 'EXDATE' ? exclusions : inclusions).push(...list);
    }
  }
  if (!hasRule || init.frequency === undefined) return null;
  try {
    return recurrenceRule({ ...(init as RecurrenceRuleInit), exclusions, inclusions });
  } catch {
    return null;
  }
}

export function isRecurrenceRule(value: unknown): value is RecurrenceRule {
  return kindOf(value) === 'RecurrenceRule';
}
