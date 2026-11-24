/**
 * Recurrence expansion (RFC 5545 section 3.3.10 and section 3.8.5, for the supported subset).
 *
 * Occurrences are generated as wall-clock dates in the series timezone and keep the
 * start's time of day; each is then resolved to an instant with the DST
 * disambiguation policy (SPEC section 8.5). So a 09:00 series stays at 09:00 local
 * across daylight-saving changes, and a start in a skipped hour moves forward by
 * the gap (`compatible`, as RFC 5545 requires). Invalid dates (30 February, the
 * 31st of a 30-day month) are skipped, never clamped.
 *
 * The recurrence set is: the start (always the first occurrence, counted by
 * COUNT), the rule's occurrences, plus RDATE values, minus EXDATE values.
 */
import { getCommonConfig, type Disambiguation } from '../config/config.js';
import { validationError } from '../errors.js';
import { toInstant, toPlainDateTime } from '../timezone/convert.js';
import { fieldsToEpoch } from '../timezone/engine.js';
import { daysInMonth, plainDate, plainDateTime, type Instant, type PlainDate, type PlainDateTime } from '../timezone/types.js';
import { dateKey, type RecurrenceDate, type RecurrenceRule } from './rule.js';

export interface RecurrenceExpandOptions {
  /** Timezone of the start's wall-clock time (timed series). Default: the configured timezone. */
  timeZone?: string;
  /** Only occurrences starting at or after this bound: an instant (timed series) or a date (all-day series). */
  from?: Instant | PlainDate;
  /** Only occurrences starting before this bound (exclusive), of the same kind as `from`. */
  to?: Instant | PlainDate;
  /** Maximum number of occurrences returned, 1..100000. Default 1000. */
  limit?: number;
  disambiguation?: Disambiguation;
}

export interface RecurrenceOccurrence {
  /** Local start: a date (all-day series) or the wall-clock time in the series timezone. */
  readonly start: PlainDate | PlainDateTime;
  /** Exact start of a timed occurrence; null for all-day series. */
  readonly instant: Instant | null;
}

const DAY_MS = 86_400_000;
/** Periods examined at most per expansion (about 137 years of days); bounds impossible rules. */
const MAX_PERIODS = 50_000;

const dayNumber = (y: number, m: number, d: number): number => Math.floor(fieldsToEpoch(y, m, d) / DAY_MS);
/** ISO weekday of a day number (day 0 = 1970-01-01, a Thursday). */
const weekdayOf = (dn: number): number => ((((dn % 7) + 7 + 3) % 7) + 1);

function ymd(dn: number): [number, number, number] {
  const d = new Date(dn * DAY_MS);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

function fail(property: string, expected: string): never {
  throw validationError('RECURRENCE_EXPAND', 'Invalid recurrence expansion input.', { property: `expandRecurrence.${property}`, expected });
}

function applySetPos(list: number[], positions: readonly number[]): number[] {
  if (positions.length === 0) return list;
  const out = new Set<number>();
  for (const p of positions) {
    const v = p > 0 ? list[p - 1] : list[list.length + p];
    if (v !== undefined) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

/** Days of `weekday` in [first, last] (day numbers). */
function weekdaysIn(first: number, last: number, weekday: number): number[] {
  const out: number[] = [];
  for (let dn = first + ((weekday - weekdayOf(first) + 7) % 7); dn <= last; dn += 7) out.push(dn);
  return out;
}

/** Day numbers matching BYDAY within [first, last] (nth relative to that span). */
function byDayIn(rule: RecurrenceRule, first: number, last: number): Set<number> {
  const out = new Set<number>();
  for (const d of rule.byDay) {
    const days = weekdaysIn(first, last, d.weekday);
    if (d.nth === undefined) for (const dn of days) out.add(dn);
    else {
      const v = d.nth > 0 ? days[d.nth - 1] : days[days.length + d.nth];
      if (v !== undefined) out.add(v);
    }
  }
  return out;
}

function monthDaysIn(rule: RecurrenceRule, y: number, m: number): number[] {
  const len = daysInMonth(y, m);
  const out: number[] = [];
  for (const md of rule.byMonthDay) {
    const day = md > 0 ? md : len + md + 1;
    if (day >= 1 && day <= len) out.push(dayNumber(y, m, day));
  }
  return out;
}

/** Candidates of one month (MONTHLY, and YEARLY with BYMONTH): BYMONTHDAY and BYDAY expand; together BYDAY limits. */
function monthCandidates(rule: RecurrenceRule, y: number, m: number, startDay: number): number[] {
  const first = dayNumber(y, m, 1);
  const last = first + daysInMonth(y, m) - 1;
  if (rule.byMonthDay.length > 0) {
    const days = monthDaysIn(rule, y, m);
    if (rule.byDay.length === 0) return days;
    const allowed = byDayIn(rule, first, last);
    return days.filter((dn) => allowed.has(dn));
  }
  if (rule.byDay.length > 0) return [...byDayIn(rule, first, last)];
  return startDay <= daysInMonth(y, m) ? [first + startDay - 1] : [];
}

function yearCandidates(rule: RecurrenceRule, y: number, startMonth: number, startDay: number): number[] {
  if (rule.byMonth.length > 0) return rule.byMonth.flatMap((m) => monthCandidates(rule, y, m, startDay));
  const first = dayNumber(y, 1, 1);
  const last = dayNumber(y, 12, 31);
  if (rule.byMonthDay.length > 0) {
    const days: number[] = [];
    for (let m = 1; m <= 12; m++) days.push(...monthDaysIn(rule, y, m));
    if (rule.byDay.length === 0) return days;
    const allowed = byDayIn(rule, first, last);
    return days.filter((dn) => allowed.has(dn));
  }
  if (rule.byDay.length > 0) return [...byDayIn(rule, first, last)];
  return startDay <= daysInMonth(y, startMonth) ? [dayNumber(y, startMonth, startDay)] : [];
}

interface Walker {
  /** Candidate day numbers of period k, sorted and BYSETPOS-filtered. */
  candidates(k: number): number[];
  /** First day number of period k. */
  periodStart(k: number): number;
  /** Largest k whose period ends before day `dn` (0 when none). */
  skipTo(dn: number): number;
}

function walker(rule: RecurrenceRule, startDn: number): Walker {
  const [sy, sm, sd] = ymd(startDn);
  const iv = rule.interval;
  const months = new Set(rule.byMonth);
  const inMonths = (dn: number): boolean => months.size === 0 || months.has(ymd(dn)[1]);
  const finish = (list: number[]): number[] => applySetPos([...new Set(list)].sort((a, b) => a - b), rule.bySetPos);
  switch (rule.frequency) {
    case 'daily': {
      const weekdays = new Set(rule.byDay.map((d) => d.weekday as number));
      return {
        periodStart: (k) => startDn + k * iv,
        candidates: (k) => {
          const dn = startDn + k * iv;
          if (!inMonths(dn)) return [];
          if (weekdays.size > 0 && !weekdays.has(weekdayOf(dn))) return [];
          if (rule.byMonthDay.length > 0) {
            const [y, m] = ymd(dn);
            if (!monthDaysIn(rule, y, m).includes(dn)) return [];
          }
          return [dn];
        },
        skipTo: (dn) => Math.max(0, Math.floor((dn - startDn) / iv) - 1),
      };
    }
    case 'weekly': {
      const weekStart = startDn - ((weekdayOf(startDn) - rule.weekStart + 7) % 7);
      const weekdays = rule.byDay.length > 0 ? rule.byDay.map((d) => d.weekday as number) : [weekdayOf(startDn)];
      return {
        periodStart: (k) => weekStart + 7 * k * iv,
        candidates: (k) => {
          const first = weekStart + 7 * k * iv;
          const out: number[] = [];
          for (let i = 0; i < 7; i++) if (weekdays.includes(weekdayOf(first + i)) && inMonths(first + i)) out.push(first + i);
          return finish(out);
        },
        skipTo: (dn) => Math.max(0, Math.floor((dn - weekStart) / (7 * iv)) - 1),
      };
    }
    case 'monthly': {
      const base = sy * 12 + (sm - 1);
      const monthOf = (k: number): [number, number] => {
        const idx = base + k * iv;
        return [Math.floor(idx / 12), (idx % 12) + 1];
      };
      return {
        periodStart: (k) => {
          const [y, m] = monthOf(k);
          return dayNumber(y, m, 1);
        },
        candidates: (k) => {
          const [y, m] = monthOf(k);
          if (months.size > 0 && !months.has(m)) return [];
          return finish(monthCandidates(rule, y, m, sd));
        },
        skipTo: (dn) => {
          const [y, m] = ymd(dn);
          return Math.max(0, Math.floor((y * 12 + (m - 1) - base) / iv) - 1);
        },
      };
    }
    case 'yearly':
      return {
        periodStart: (k) => dayNumber(sy + k * iv, 1, 1),
        candidates: (k) => finish(yearCandidates(rule, sy + k * iv, sm, sd)),
        skipTo: (dn) => Math.max(0, Math.floor((ymd(dn)[0] - sy) / iv) - 1),
      };
  }
}

const kind = (v: unknown): unknown => (typeof v === 'object' && v !== null ? (v as { kind?: unknown }).kind : undefined);

/**
 * Occurrences of a recurring series starting at `start` (a date for all-day
 * series, or a wall-clock time in `timeZone`), in ascending order, within
 * `from`/`to` and at most `limit`. Throws `RECURRENCE_EXPAND` for mismatched
 * bound kinds or an invalid limit.
 */
export function expandRecurrence(rule: RecurrenceRule, start: PlainDate | PlainDateTime, options: RecurrenceExpandOptions = {}): RecurrenceOccurrence[] {
  if (kind(rule) !== 'RecurrenceRule') fail('rule', 'RecurrenceRule');
  const allDay = kind(start) === 'PlainDate';
  if (!allDay && kind(start) !== 'PlainDateTime') fail('start', 'PlainDate | PlainDateTime');
  const limit = options.limit ?? 1000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) fail('limit', 'integer from 1 to 100000');
  const boundKind = allDay ? 'PlainDate' : 'Instant';
  for (const key of ['from', 'to'] as const) {
    const b = options[key];
    if (b !== undefined && kind(b) !== boundKind) fail(key, allDay ? 'PlainDate (all-day series)' : 'Instant (timed series)');
  }
  const zone = options.timeZone ?? getCommonConfig().timezone;
  const disambiguation = options.disambiguation ?? getCommonConfig().disambiguation;
  const startDate = allDay ? (start as PlainDate) : (start as PlainDateTime).date;
  const time = allDay ? null : (start as PlainDateTime).time;
  const startDn = dayNumber(startDate.year, startDate.month, startDate.day);

  const toDate = (dn: number): PlainDate => {
    const [y, m, d] = ymd(dn);
    return plainDate(y, m, d);
  };
  const make = (dn: number): RecurrenceOccurrence => {
    const date = toDate(dn);
    if (!time) return Object.freeze({ start: date, instant: null });
    const local = plainDateTime(date, time);
    return Object.freeze({ start: local, instant: toInstant(local, zone, disambiguation) });
  };
  const fromDate = (d: RecurrenceDate): RecurrenceOccurrence => {
    if (allDay) return make(d.kind === 'PlainDate' ? dayNumber(d.year, d.month, d.day) : dayNumber(d.date.year, d.date.month, d.date.day));
    const local = d.kind === 'PlainDate' ? plainDateTime(d, time ?? undefined) : d;
    return Object.freeze({ start: local, instant: toInstant(local, zone, disambiguation) });
  };

  // Bounds as day numbers (with a day of slack for zone offsets) and exact comparisons.
  const from = options.from;
  const to = options.to;
  const dnOfBound = (b: Instant | PlainDate): number => {
    if (b.kind === 'PlainDate') return dayNumber(b.year, b.month, b.day);
    const local = toPlainDateTime(b, zone).date;
    return dayNumber(local.year, local.month, local.day);
  };
  const toDn = to === undefined ? Infinity : dnOfBound(to) + 1;
  const afterFrom = (o: RecurrenceOccurrence): boolean => {
    if (from === undefined) return true;
    if (o.instant) return o.instant.epochMilliseconds >= (from as Instant).epochMilliseconds;
    return dateKey(o.start) >= dateKey(from as PlainDate);
  };
  const beforeTo = (o: RecurrenceOccurrence): boolean => {
    if (to === undefined) return true;
    if (o.instant) return o.instant.epochMilliseconds < (to as Instant).epochMilliseconds;
    return dateKey(o.start) < dateKey(to as PlainDate);
  };
  const until = rule.until;
  let untilDn = Infinity;
  if (until) {
    const d = until.kind === 'PlainDate' ? until : until.kind === 'PlainDateTime' ? until.date : toPlainDateTime(until, zone).date;
    untilDn = dayNumber(d.year, d.month, d.day) + (until.kind === 'Instant' ? 1 : 0);
  }
  const withinUntil = (o: RecurrenceOccurrence): boolean => {
    if (!until) return true;
    if (until.kind === 'Instant') {
      if (o.instant) return o.instant.epochMilliseconds <= until.epochMilliseconds;
      const s = o.start as PlainDate;
      return toInstant(plainDateTime(s), zone, disambiguation).epochMilliseconds <= until.epochMilliseconds;
    }
    const occDate = o.start.kind === 'PlainDate' ? o.start : o.start.date;
    if (until.kind === 'PlainDate') return dateKey(occDate) <= dateKey(until);
    return o.start.kind === 'PlainDate' ? dateKey(occDate) <= dateKey(until.date) : dateKey(o.start) <= dateKey(until);
  };

  const excludedDates = new Set(rule.exclusions.filter((d) => d.kind === 'PlainDate').map(dateKey));
  const excludedTimes = new Set(rule.exclusions.filter((d) => d.kind === 'PlainDateTime').map(dateKey));
  const isExcluded = (o: RecurrenceOccurrence): boolean => {
    const date = o.start.kind === 'PlainDate' ? o.start : o.start.date;
    if (excludedDates.has(dateKey(date))) return true;
    if (o.start.kind === 'PlainDate') return [...excludedTimes].some((k) => k.startsWith(dateKey(date)));
    return excludedTimes.has(dateKey(o.start));
  };

  const out: RecurrenceOccurrence[] = [];
  const accept = (o: RecurrenceOccurrence): void => {
    if (afterFrom(o) && beforeTo(o) && !isExcluded(o)) out.push(o);
  };

  // The start is always the first occurrence (and counts toward COUNT).
  let produced = 1;
  const first = make(startDn);
  if (withinUntil(first)) accept(first);
  else produced = Infinity;

  const w = walker(rule, startDn);
  const counted = rule.count !== null;
  let k = !counted && from !== undefined ? w.skipTo(dnOfBound(from) - 1) : 0;
  const stopAt = k + MAX_PERIODS;
  const max = rule.count ?? Infinity;
  outer: for (; k < stopAt && produced < max && out.length < limit; k++) {
    const periodStart = w.periodStart(k);
    if (periodStart > toDn || periodStart > untilDn) break;
    for (const dn of w.candidates(k)) {
      if (dn <= startDn) continue;
      if (dn > toDn || dn > untilDn + 1) break outer;
      const o = make(dn);
      if (!withinUntil(o)) break outer;
      produced++;
      accept(o);
      if (produced >= max || out.length >= limit) break outer;
    }
  }

  for (const d of rule.inclusions) {
    const o = fromDate(d);
    if (afterFrom(o) && beforeTo(o) && !isExcluded(o)) out.push(o);
  }
  const sortKey = (o: RecurrenceOccurrence): number => (o.instant ? o.instant.epochMilliseconds : fieldsToEpoch((o.start as PlainDate).year, (o.start as PlainDate).month, (o.start as PlainDate).day));
  const unique = new Map<number, RecurrenceOccurrence>();
  for (const o of out) if (!unique.has(sortKey(o))) unique.set(sortKey(o), o);
  return [...unique.values()].sort((a, b) => sortKey(a) - sortKey(b)).slice(0, limit);
}
