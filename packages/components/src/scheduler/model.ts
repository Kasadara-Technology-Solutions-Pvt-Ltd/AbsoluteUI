/**
 * Scheduler data model (pure, DOM-free): event validation, recurrence expansion
 * into occurrences for a range, and the edits applied by moves and resizes,
 * including recurring scopes (this occurrence, this and following, the series).
 *
 * Ranges follow core conventions: instants are half-open (`end` is the moment an
 * event ends), dates are inclusive (`end` is the last day of an all-day event).
 * Wall-clock arithmetic happens in the event's timezone, so a 09:00 series stays
 * at 09:00 across DST changes.
 */
import {
  addDays,
  comparePlainDate,
  configurationError,
  expandRecurrence,
  fieldsToEpoch,
  instant,
  isRecurrenceRule,
  plainDateTime,
  plainDateToString,
  plainTime,
  recurrenceRule,
  toInstant,
  toPlainDateTime,
  validators,
  type Disambiguation,
  type Instant,
  type IsoWeekday,
  type PlainDate,
  type PlainDateTime,
  type PlainTime,
  type RecurrenceDate,
  type RecurrenceRule,
  type RecurrenceRuleInit,
} from '@absoluteui/core';

export interface SchedulerEvent {
  /** Unique id. */
  id: string;
  title: string;
  /** Exact start (timed) or first day (all-day). */
  start: Instant | PlainDate;
  /** Exact end, exclusive (timed), or last day, inclusive (all-day); same kind as `start`. */
  end: Instant | PlainDate;
  /** Timezone of the wall clock for recurrence and moves. Default: the scheduler timezone. */
  timeZone?: string;
  /** Makes the event the master of a recurring series. */
  recurrence?: RecurrenceRule | null;
  /** Exception: replaces the occurrence of series `seriesId` that started at `originalStart`. */
  seriesId?: string;
  originalStart?: Instant | PlainDate;
  /** Timeline row. */
  resourceId?: string;
  /** Palette slot 1..8 (chart colors). */
  color?: number;
  location?: string;
  description?: string;
  /** Cannot be moved or resized. */
  readOnly?: boolean;
}

export interface SchedulerResource {
  id: string;
  label: string;
  description?: string;
  color?: number;
}

/** One rendered instance: a single event, a series occurrence, or an exception. */
export interface SchedulerOccurrence {
  /** Stable key: the event id, or `{seriesId}@{original start}` for series occurrences. */
  readonly key: string;
  /** The source event (the series master for generated occurrences). */
  readonly event: Readonly<SchedulerEvent>;
  readonly start: Instant | PlainDate;
  readonly end: Instant | PlainDate;
  readonly allDay: boolean;
  /** Part of a recurring series (generated or exception). */
  readonly recurring: boolean;
  readonly seriesId: string | null;
  /** Start of the occurrence in the series (before any exception moved it). */
  readonly originalStart: Instant | PlainDate | null;
}

export type SchedulerEditScope = 'occurrence' | 'following' | 'series';

/** The events added, updated (by id), and removed by one edit. */
export interface SchedulerEventChanges {
  added: SchedulerEvent[];
  updated: SchedulerEvent[];
  removed: string[];
}

const DAY_MS = 86_400_000;
const kind = (v: unknown): unknown => (typeof v === 'object' && v !== null ? (v as { kind?: unknown }).kind : undefined);

function fail(property: string, expected: string): never {
  throw configurationError('SCHEDULER_OPTIONS', 'Invalid scheduler options.', { component: 'scheduler', property: `scheduler.${property}`, expected });
}

export const isAllDay = (e: { start: Instant | PlainDate }): boolean => e.start.kind === 'PlainDate';

/** Validate events (throws `SCHEDULER_OPTIONS`, or `code` for data-source answers). */
export function assertEvents(events: unknown, at: string, code = 'SCHEDULER_OPTIONS'): asserts events is SchedulerEvent[] {
  function bad(property: string, expected: string): never {
    throw configurationError(code, code === 'SCHEDULER_OPTIONS' ? 'Invalid scheduler options.' : 'Invalid scheduler data source answer.', { component: 'scheduler', property: `scheduler.${property}`, expected });
  }
  if (!Array.isArray(events)) bad(at, 'SchedulerEvent[]');
  const ids = new Set<string>();
  (events as unknown[]).forEach((e, i) => {
    const p = `${at}[${String(i)}]`;
    if (!validators.isRecord(e)) bad(p, 'SchedulerEvent');
    if (typeof e.id !== 'string' || e.id === '' || ids.has(e.id)) bad(`${p}.id`, 'unique non-empty string');
    ids.add(e.id);
    if (typeof e.title !== 'string') bad(`${p}.title`, 'string');
    const sk = kind(e.start);
    if (sk !== 'Instant' && sk !== 'PlainDate') bad(`${p}.start`, 'Instant | PlainDate');
    if (kind(e.end) !== sk) bad(`${p}.end`, 'same kind as start');
    const s = e.start as Instant | PlainDate;
    const en = e.end as Instant | PlainDate;
    if (s.kind === 'Instant' ? (en as Instant).epochMilliseconds <= s.epochMilliseconds : comparePlainDate(en as PlainDate, s) < 0) bad(`${p}.end`, 'after start (timed) or on or after start (all-day)');
    if (e.timeZone !== undefined && !validators.isTimeZone(e.timeZone)) bad(`${p}.timeZone`, 'IANA timezone identifier');
    if (e.recurrence !== undefined && e.recurrence !== null && !isRecurrenceRule(e.recurrence)) bad(`${p}.recurrence`, 'RecurrenceRule | null');
    if (e.seriesId !== undefined) {
      if (typeof e.seriesId !== 'string' || e.seriesId === '') bad(`${p}.seriesId`, 'non-empty string');
      if (kind(e.originalStart) !== sk) bad(`${p}.originalStart`, 'same kind as start (required with seriesId)');
      if (e.recurrence) bad(`${p}.recurrence`, 'null on an exception (seriesId)');
    }
    for (const key of ['resourceId', 'location', 'description'] as const) if (e[key] !== undefined && typeof e[key] !== 'string') bad(`${p}.${key}`, 'string');
    if (e.color !== undefined && !validators.integerInRange(1, 8)(e.color)) bad(`${p}.color`, 'integer 1..8');
    if (e.readOnly !== undefined && typeof e.readOnly !== 'boolean') bad(`${p}.readOnly`, 'boolean');
  });
}

export function assertResources(resources: unknown): asserts resources is SchedulerResource[] {
  if (!Array.isArray(resources)) fail('resources', 'SchedulerResource[]');
  const ids = new Set<string>();
  (resources as unknown[]).forEach((r, i) => {
    const p = `resources[${String(i)}]`;
    if (!validators.isRecord(r)) fail(p, 'SchedulerResource');
    if (typeof r.id !== 'string' || r.id === '' || ids.has(r.id)) fail(`${p}.id`, 'unique non-empty string');
    ids.add(r.id);
    if (typeof r.label !== 'string' || r.label.trim() === '') fail(`${p}.label`, 'non-empty string');
    if (r.description !== undefined && typeof r.description !== 'string') fail(`${p}.description`, 'string');
    if (r.color !== undefined && !validators.integerInRange(1, 8)(r.color)) fail(`${p}.color`, 'integer 1..8');
  });
}

/** Shallow copy with frozen value fields (events are data, never shared mutable state). */
export function copyEvent(e: Readonly<SchedulerEvent>): SchedulerEvent {
  const out: SchedulerEvent = { id: e.id, title: e.title, start: e.start, end: e.end };
  for (const key of ['timeZone', 'recurrence', 'seriesId', 'originalStart', 'resourceId', 'color', 'location', 'description', 'readOnly'] as const) {
    const v = e[key];
    if (v !== undefined) (out as unknown as Record<string, unknown>)[key] = v;
  }
  return out;
}

const dayNumber = (d: PlainDate): number => Math.round(fieldsToEpoch(d.year, d.month, d.day) / DAY_MS);
export const daysBetween = (a: PlainDate, b: PlainDate): number => dayNumber(b) - dayNumber(a);

/** Sortable key of an original start (instant ms or date). */
export function startKey(s: Instant | PlainDate): string {
  return s.kind === 'Instant' ? String(s.epochMilliseconds) : plainDateToString(s);
}

export function occurrenceKey(seriesId: string, original: Instant | PlainDate): string {
  return `${seriesId}@${startKey(original)}`;
}

/** Local midnight of a date in a zone. */
export function startOfDay(date: PlainDate, zone: string, disambiguation?: Disambiguation): Instant {
  return toInstant(plainDateTime(date, plainTime(0)), zone, disambiguation);
}

export interface ExpandRange {
  /** First and last visible day (inclusive), in the scheduler timezone. */
  readonly startDate: PlainDate;
  readonly endDate: PlainDate;
  readonly timeZone: string;
  readonly disambiguation?: Disambiguation;
}

/**
 * Occurrences that overlap the visible days: single events, generated series
 * occurrences (without those replaced by exceptions or cancelled by EXDATE), and
 * exceptions. Sorted by start, then longer first.
 */
export function expandEvents(events: readonly SchedulerEvent[], range: ExpandRange): SchedulerOccurrence[] {
  const zone = range.timeZone;
  const from = startOfDay(range.startDate, zone, range.disambiguation);
  const to = startOfDay(addDays(range.endDate, 1), zone, range.disambiguation);
  const exceptions = new Set<string>();
  for (const e of events) if (e.seriesId !== undefined && e.originalStart) exceptions.add(occurrenceKey(e.seriesId, e.originalStart));
  const out: SchedulerOccurrence[] = [];
  const overlaps = (s: Instant | PlainDate, en: Instant | PlainDate): boolean => {
    if (s.kind === 'PlainDate') return comparePlainDate(s, range.endDate) <= 0 && comparePlainDate(en as PlainDate, range.startDate) >= 0;
    return s.epochMilliseconds < to.epochMilliseconds && (en as Instant).epochMilliseconds > from.epochMilliseconds;
  };
  for (const e of events) {
    const rule = e.recurrence;
    if (!rule) {
      if (overlaps(e.start, e.end)) {
        const recurring = e.seriesId !== undefined;
        out.push(Object.freeze({ key: e.id, event: e, start: e.start, end: e.end, allDay: isAllDay(e), recurring, seriesId: e.seriesId ?? null, originalStart: e.originalStart ?? null }));
      }
      continue;
    }
    const ez = e.timeZone ?? zone;
    if (e.start.kind === 'PlainDate') {
      const length = daysBetween(e.start, e.end as PlainDate);
      for (const o of expandRecurrence(rule, e.start, { from: addDays(range.startDate, -length), to: addDays(range.endDate, 1), limit: 10_000 })) {
        const s = o.start as PlainDate;
        const key = occurrenceKey(e.id, s);
        if (exceptions.has(key)) continue;
        out.push(Object.freeze({ key, event: e, start: s, end: addDays(s, length), allDay: true, recurring: true, seriesId: e.id, originalStart: s }));
      }
    } else {
      const span = (e.end as Instant).epochMilliseconds - e.start.epochMilliseconds;
      const local = toPlainDateTime(e.start, ez);
      for (const o of expandRecurrence(rule, local, { timeZone: ez, from: instant(from.epochMilliseconds - span + 1), to, limit: 10_000, ...(range.disambiguation ? { disambiguation: range.disambiguation } : {}) })) {
        const s = o.instant;
        if (!s) continue;
        const key = occurrenceKey(e.id, s);
        if (exceptions.has(key)) continue;
        out.push(Object.freeze({ key, event: e, start: s, end: instant(s.epochMilliseconds + span), allDay: false, recurring: true, seriesId: e.id, originalStart: s }));
      }
    }
  }
  return out.sort(compareOccurrences);
}

function epochOf(v: Instant | PlainDate): number {
  return v.kind === 'Instant' ? v.epochMilliseconds : fieldsToEpoch(v.year, v.month, v.day);
}

export function compareOccurrences(a: SchedulerOccurrence, b: SchedulerOccurrence): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const d = epochOf(a.start) - epochOf(b.start);
  if (d !== 0) return d;
  const len = epochOf(b.end) - epochOf(b.start) - (epochOf(a.end) - epochOf(a.start));
  return len !== 0 ? len : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

// ---- edits --------------------------------------------------------------------------

export interface EditRequest {
  readonly occurrence: SchedulerOccurrence;
  /** New start and end, same kinds as the occurrence. */
  readonly start: Instant | PlainDate;
  readonly end: Instant | PlainDate;
  /** New timeline row (undefined keeps it). */
  readonly resourceId?: string | undefined;
  readonly scope: SchedulerEditScope;
  readonly timeZone: string;
  readonly disambiguation?: Disambiguation;
  /** Id for a new event derived from `base` (exceptions and split series). */
  readonly createId: (base: SchedulerEvent, hint: string) => string;
}

/** Local wall-clock parts of a start (for shifting series in the event's timezone). */
function localOf(v: Instant | PlainDate, zone: string): PlainDateTime {
  return v.kind === 'Instant' ? toPlainDateTime(v, zone) : plainDateTime(v, plainTime(0));
}

/** Days and minutes between two wall-clock times. */
function wallDelta(a: PlainDateTime, b: PlainDateTime): { days: number; minutes: number } {
  const days = daysBetween(a.date, b.date);
  const minutes = b.time.hour * 60 + b.time.minute - (a.time.hour * 60 + a.time.minute);
  return { days, minutes };
}

function shiftLocal(v: PlainDateTime, delta: { days: number; minutes: number }): PlainDateTime {
  let total = v.time.hour * 60 + v.time.minute + delta.minutes;
  let days = delta.days + Math.floor(total / 1440);
  total = ((total % 1440) + 1440) % 1440;
  if (!Number.isFinite(days)) days = 0;
  return plainDateTime(addDays(v.date, days), plainTime(Math.floor(total / 60), total % 60, v.time.second));
}

function shiftStart(v: Instant | PlainDate, delta: { days: number; minutes: number }, zone: string, disambiguation?: Disambiguation): Instant | PlainDate {
  if (v.kind === 'PlainDate') return addDays(v, delta.days);
  return toInstant(shiftLocal(toPlainDateTime(v, zone), delta), zone, disambiguation);
}

function shiftDate(d: RecurrenceDate, delta: { days: number; minutes: number }): RecurrenceDate {
  return d.kind === 'PlainDate' ? addDays(d, delta.days) : shiftLocal(d, delta);
}

/** A rule moved by a wall-clock delta: weekly BYDAY and BYMONTHDAY follow the day shift, EXDATE/RDATE move too. */
function shiftRule(rule: RecurrenceRule, delta: { days: number; minutes: number }): RecurrenceRule {
  const init: RecurrenceRuleInit = {
    frequency: rule.frequency,
    interval: rule.interval,
    count: rule.count,
    until: rule.until,
    byDay: rule.byDay,
    byMonthDay: rule.byMonthDay,
    byMonth: rule.byMonth,
    bySetPos: rule.bySetPos,
    weekStart: rule.weekStart,
    exclusions: rule.exclusions.map((d) => shiftDate(d, delta)),
    inclusions: rule.inclusions.map((d) => shiftDate(d, delta)),
  };
  const days = delta.days;
  if (days !== 0 && rule.byDay.length > 0 && rule.byDay.every((d) => d.nth === undefined)) {
    init.byDay = rule.byDay.map((d) => ({ weekday: ((((d.weekday - 1 + days) % 7) + 7) % 7 + 1) as IsoWeekday }));
  }
  if (days !== 0 && rule.byMonthDay.length > 0 && rule.byMonthDay.every((d) => d > 0)) {
    init.byMonthDay = rule.byMonthDay.map((d) => Math.min(31, Math.max(1, d + days)));
  }
  if (rule.until && rule.until.kind !== 'Instant') init.until = shiftDate(rule.until, delta);
  return recurrenceRule(init);
}

function withEnd(rule: RecurrenceRule, until: Instant | PlainDate | null, count: number | null): RecurrenceRule {
  return recurrenceRule({
    frequency: rule.frequency,
    interval: rule.interval,
    count,
    until,
    byDay: rule.byDay,
    byMonthDay: rule.byMonthDay,
    byMonth: rule.byMonth,
    bySetPos: rule.bySetPos,
    weekStart: rule.weekStart,
    exclusions: rule.exclusions,
    inclusions: rule.inclusions,
  });
}

/** Occurrences of a series before an original start (to split COUNT). */
function countBefore(master: SchedulerEvent, original: Instant | PlainDate, zone: string): number {
  const rule = master.recurrence;
  if (!rule) return 0;
  const ez = master.timeZone ?? zone;
  if (master.start.kind === 'PlainDate') {
    return expandRecurrence(recurrenceRule({ ...ruleInit(rule), exclusions: [], inclusions: [] }), master.start, { to: original as PlainDate, limit: 100_000 }).length;
  }
  return expandRecurrence(recurrenceRule({ ...ruleInit(rule), exclusions: [], inclusions: [] }), toPlainDateTime(master.start, ez), { timeZone: ez, to: original as Instant, limit: 100_000 }).length;
}

function ruleInit(rule: RecurrenceRule): RecurrenceRuleInit {
  return { frequency: rule.frequency, interval: rule.interval, count: rule.count, until: rule.until, byDay: rule.byDay, byMonthDay: rule.byMonthDay, byMonth: rule.byMonth, bySetPos: rule.bySetPos, weekStart: rule.weekStart, exclusions: rule.exclusions, inclusions: rule.inclusions };
}

const later = (a: Instant | PlainDate, b: Instant | PlainDate): boolean => (a.kind === 'Instant' ? a.epochMilliseconds >= (b as Instant).epochMilliseconds : comparePlainDate(a, b as PlainDate) >= 0);

/**
 * Apply a move or resize to the events. Returns the new event list and the changes,
 * or null when nothing changes.
 */
export function applyEdit(events: readonly SchedulerEvent[], req: EditRequest): { events: SchedulerEvent[]; changes: SchedulerEventChanges } | null {
  const occ = req.occurrence;
  const byId = new Map(events.map((e) => [e.id, e]));
  const changes: SchedulerEventChanges = { added: [], updated: [], removed: [] };
  const setResource = (e: SchedulerEvent): void => {
    if (req.resourceId !== undefined) e.resourceId = req.resourceId;
  };
  const sameTimes = startKey(occ.start) === startKey(req.start) && startKey(occ.end) === startKey(req.end);
  if (sameTimes && (req.resourceId === undefined || req.resourceId === occ.event.resourceId)) return null;

  // A single event, or an exception edited as an occurrence: update it in place.
  if (!occ.recurring || (occ.event.seriesId !== undefined && req.scope === 'occurrence')) {
    const current = byId.get(occ.event.id);
    if (!current) return null;
    const next = copyEvent(current);
    next.start = req.start;
    next.end = req.end;
    setResource(next);
    changes.updated.push(next);
    return { events: events.map((e) => (e.id === next.id ? next : e)), changes };
  }

  const seriesId = occ.seriesId ?? occ.event.id;
  const master = byId.get(seriesId);
  const original = occ.originalStart;
  if (!master || !original || !master.recurrence) return null;

  if (req.scope === 'occurrence') {
    const exception = copyEvent(master);
    exception.id = req.createId(master, startKey(original));
    delete exception.recurrence;
    exception.seriesId = master.id;
    exception.originalStart = original;
    exception.start = req.start;
    exception.end = req.end;
    setResource(exception);
    changes.added.push(exception);
    return { events: [...events, exception], changes };
  }

  // Wall-clock delta of the edited occurrence's start, applied to the series (or its tail).
  const zone = master.timeZone ?? req.timeZone;
  const delta = wallDelta(localOf(occ.start, zone), localOf(req.start, zone));
  const newSpan = req.start.kind === 'Instant' ? (req.end as Instant).epochMilliseconds - req.start.epochMilliseconds : daysBetween(req.start, req.end as PlainDate);
  const spanned = (s: Instant | PlainDate): Instant | PlainDate => (s.kind === 'Instant' ? instant(s.epochMilliseconds + newSpan) : addDays(s, newSpan));
  const firstOriginal = master.start;
  const isFirst = startKey(firstOriginal) === startKey(original);

  const shiftException = (e: SchedulerEvent, targetSeries: string): SchedulerEvent => {
    const x = copyEvent(e);
    x.seriesId = targetSeries;
    if (x.originalStart) x.originalStart = shiftStart(x.originalStart, delta, zone, req.disambiguation);
    return x;
  };

  if (req.scope === 'series' || isFirst) {
    const next = copyEvent(master);
    const start = shiftStart(master.start, delta, zone, req.disambiguation);
    next.start = start;
    next.end = spanned(start);
    next.recurrence = shiftRule(master.recurrence, delta);
    setResource(next);
    changes.updated.push(next);
    const out = events.map((e) => {
      if (e.id === master.id) return next;
      if (e.seriesId === master.id) {
        const x = shiftException(e, master.id);
        changes.updated.push(x);
        return x;
      }
      return e;
    });
    return { events: out, changes };
  }

  // This and following: end the series before the occurrence; a new series starts at it.
  const rule = master.recurrence;
  const before = countBefore(master, original, req.timeZone);
  const until: Instant | PlainDate = original.kind === 'Instant' ? instant(original.epochMilliseconds - 1000) : addDays(original, -1);
  const head = copyEvent(master);
  head.recurrence = rule.count !== null ? withEnd(rule, null, Math.max(1, before)) : withEnd(rule, until, null);
  if (head.recurrence.exclusions.length || head.recurrence.inclusions.length) {
    const cut = localOf(original, zone);
    const keep = (d: RecurrenceDate): boolean => (d.kind === 'PlainDate' ? comparePlainDate(d, cut.date) < 0 : daysBetween(d.date, cut.date) > 0 || (daysBetween(d.date, cut.date) === 0 && d.time.hour * 60 + d.time.minute < cut.time.hour * 60 + cut.time.minute));
    head.recurrence = recurrenceRule({ ...ruleInit(head.recurrence), exclusions: head.recurrence.exclusions.filter(keep), inclusions: head.recurrence.inclusions.filter(keep) });
  }
  const tail = copyEvent(master);
  tail.id = req.createId(master, startKey(original));
  tail.start = req.start;
  tail.end = req.end;
  const tailInit = ruleInit(shiftRule(rule, delta));
  if (rule.count !== null) tailInit.count = Math.max(1, rule.count - before);
  const cut = localOf(original, zone);
  const after = (d: RecurrenceDate): boolean => !(d.kind === 'PlainDate' ? comparePlainDate(d, cut.date) < 0 : daysBetween(d.date, cut.date) > 0 || (daysBetween(d.date, cut.date) === 0 && d.time.hour * 60 + d.time.minute < cut.time.hour * 60 + cut.time.minute));
  tailInit.exclusions = rule.exclusions.filter(after).map((d) => shiftDate(d, delta));
  tailInit.inclusions = rule.inclusions.filter(after).map((d) => shiftDate(d, delta));
  tail.recurrence = recurrenceRule(tailInit);
  setResource(tail);
  changes.updated.push(head);
  changes.added.push(tail);
  const out: SchedulerEvent[] = [];
  for (const e of events) {
    if (e.id === master.id) out.push(head);
    else if (e.seriesId === master.id && e.originalStart && later(e.originalStart, original)) {
      const x = shiftException(e, tail.id);
      changes.updated.push(x);
      out.push(x);
    } else out.push(e);
  }
  out.push(tail);
  return { events: out, changes };
}

/** Local minutes since midnight of an instant on its local date. */
export function minutesOf(t: PlainTime): number {
  return t.hour * 60 + t.minute + t.second / 60;
}
