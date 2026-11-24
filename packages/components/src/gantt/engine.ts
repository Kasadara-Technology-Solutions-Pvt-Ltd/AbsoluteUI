/**
 * Gantt scheduling engine (pure, DOM-free). Tasks are scheduled in working days
 * of a Business Calendar: a task with duration d occupies d working days from its
 * start (a milestone has duration 0). Dependencies (finish-to-start, start-to-start,
 * finish-to-finish, start-to-finish, with lag in working days) push successors
 * later (forward scheduling, "as soon as possible" but never before the requested
 * start); manual tasks keep their start and report violated dependencies. A
 * backward pass gives total float; tasks without float form the critical path.
 * Summary tasks (tasks with children) span their children.
 */
import {
  addDays,
  comparePlainDate,
  configurationError,
  fieldsToEpoch,
  plainDate,
  runtimeError,
  validators,
  type PlainDate,
} from '@absoluteui/core';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';

export type GanttDependencyType = 'FS' | 'SS' | 'FF' | 'SF';

/** Palette slot 1..8 (`color-chart-1` ... `color-chart-8`). */
export type GanttColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface GanttAssignment {
  resourceId: string;
  /** Percent of a full working day, 1..1000. Default 100. */
  units?: number;
}

/** Planned dates (inclusive). */
export interface GanttBaseline {
  start: PlainDate;
  end: PlainDate;
}

export interface GanttTask {
  /** Unique id. */
  id: string;
  /** Parent (summary) task id, or null for a top-level task. */
  parentId: string | null;
  /** Name (visible text and row name). */
  label: string;
  /**
   * Requested start. Auto-scheduled tasks start here or later when dependencies
   * require it; manual tasks always start here. Non-working dates move to the next
   * working day. Ignored for summary tasks.
   */
  start: PlainDate;
  /** Working days, integer 0..100000 (0 = milestone). Ignored for summary tasks. */
  duration: number;
  /** Percent complete, 0..100. */
  progress?: number;
  /** Keep the start regardless of dependencies (violations are reported). */
  manual?: boolean;
  assignments?: readonly GanttAssignment[];
  baseline?: GanttBaseline;
  color?: GanttColor;
  /** The task cannot be edited in the chart. */
  readOnly?: boolean;
  /** Children hidden initially (summary tasks). */
  collapsed?: boolean;
}

export interface GanttDependency {
  /** Unique id. */
  id: string;
  /** Predecessor task id. */
  from: string;
  /** Successor task id. */
  to: string;
  /** Default 'FS' (finish-to-start). */
  type?: GanttDependencyType;
  /** Working days, integer -10000..10000 (negative = lead). Default 0. */
  lag?: number;
}

export interface GanttResource {
  /** Unique id. */
  id: string;
  label: string;
  /** Percent of a full working day available, 1..10000. Default 100. */
  capacity?: number;
}

export interface GanttScheduledTask {
  readonly id: string;
  readonly start: PlainDate;
  /** Last working day (inclusive); a milestone's `end` equals its `start`. */
  readonly end: PlainDate;
  /** Working days. */
  readonly duration: number;
  readonly summary: boolean;
  readonly milestone: boolean;
  /** Working days the task can slip without delaying the project (negative: behind). */
  readonly totalFloat: number;
  readonly critical: boolean;
  /** A dependency moved the task past its requested start. */
  readonly driven: boolean;
  /** Ids of dependencies a manual task does not satisfy. */
  readonly violations: readonly string[];
  /** Working days the end is after the baseline end (negative: ahead), or null without a baseline. */
  readonly variance: number | null;
}

export interface GanttSchedule {
  readonly tasks: ReadonlyMap<string, GanttScheduledTask>;
  /** First scheduled day (null without tasks). */
  readonly start: PlainDate | null;
  /** Last scheduled working day (null without tasks). */
  readonly finish: PlainDate | null;
  /** Critical task ids (leaf tasks) in schedule order. */
  readonly critical: readonly string[];
}

export interface GanttResourceDay {
  readonly date: PlainDate;
  /** Assigned percent of a full day. */
  readonly load: number;
  readonly capacity: number;
  readonly over: boolean;
}

export interface GanttResourceLoad {
  readonly resourceId: string;
  /** Working days of the range. */
  readonly days: readonly GanttResourceDay[];
  /** Days over capacity. */
  readonly overDays: number;
  readonly peak: number;
}

function fail(property: string, expected: string): never {
  throw configurationError('GANTT_OPTIONS', 'Invalid Gantt options.', { component: 'gantt', property: `gantt.${property}`, expected });
}

const kind = (v: unknown): unknown => (typeof v === 'object' && v !== null ? (v as { kind?: unknown }).kind : undefined);
const DAY_MS = 86_400_000;
export const epochDay = (d: PlainDate): number => Math.round(fieldsToEpoch(d.year, d.month, d.day) / DAY_MS);
export const fromEpochDay = (n: number): PlainDate => {
  const d = new Date(n * DAY_MS);
  return plainDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

/** Validate tasks, dependencies (incl. cycles), and resources. Throws `GANTT_OPTIONS`. */
export function assertGantt(tasks: unknown, dependencies: unknown, resources: unknown): void {
  if (!Array.isArray(tasks)) fail('tasks', 'GanttTask[]');
  const ids = new Set<string>();
  (tasks as unknown[]).forEach((t, i) => {
    const p = `tasks[${String(i)}]`;
    if (!validators.isRecord(t)) fail(p, 'GanttTask');
    if (typeof t.id !== 'string' || t.id === '' || ids.has(t.id)) fail(`${p}.id`, 'unique non-empty string');
    ids.add(t.id);
    if (typeof t.label !== 'string' || t.label.trim() === '') fail(`${p}.label`, 'non-empty string');
    if (kind(t.start) !== 'PlainDate') fail(`${p}.start`, 'PlainDate');
    if (!(Number.isInteger(t.duration) && (t.duration as number) >= 0 && (t.duration as number) <= 100_000)) fail(`${p}.duration`, 'integer from 0 to 100000 (working days)');
    if (t.progress !== undefined && !(typeof t.progress === 'number' && t.progress >= 0 && t.progress <= 100)) fail(`${p}.progress`, 'number from 0 to 100');
    for (const key of ['manual', 'readOnly', 'collapsed'] as const) if (t[key] !== undefined && typeof t[key] !== 'boolean') fail(`${p}.${key}`, 'boolean');
    if (t.color !== undefined && !(Number.isInteger(t.color) && (t.color as number) >= 1 && (t.color as number) <= 8)) fail(`${p}.color`, 'integer from 1 to 8');
    const b = t.baseline;
    if (b !== undefined) {
      if (!validators.isRecord(b) || kind(b.start) !== 'PlainDate' || kind(b.end) !== 'PlainDate') fail(`${p}.baseline`, '{ start: PlainDate; end: PlainDate }');
      if (comparePlainDate(b.start as PlainDate, b.end as PlainDate) > 0) fail(`${p}.baseline.end`, 'on or after baseline.start');
    }
    if (t.assignments !== undefined) {
      if (!Array.isArray(t.assignments)) fail(`${p}.assignments`, 'GanttAssignment[]');
      (t.assignments as unknown[]).forEach((a, j) => {
        if (!validators.isRecord(a) || typeof a.resourceId !== 'string') fail(`${p}.assignments[${String(j)}]`, '{ resourceId: string; units?: number }');
        if (a.units !== undefined && !(Number.isInteger(a.units) && (a.units as number) >= 1 && (a.units as number) <= 1000)) fail(`${p}.assignments[${String(j)}].units`, 'integer from 1 to 1000 (percent)');
      });
    }
  });
  const list = tasks as GanttTask[];
  const byId = new Map(list.map((t) => [t.id, t]));
  const parents = new Set<string>();
  list.forEach((t, i) => {
    if (!(t.parentId === null || typeof t.parentId === 'string')) fail(`tasks[${String(i)}].parentId`, 'string | null');
    if (t.parentId !== null && !byId.has(t.parentId)) fail(`tasks[${String(i)}].parentId`, 'null or the id of another task');
    let cursor: string | null = t.parentId;
    let steps = 0;
    while (cursor !== null) {
      if (cursor === t.id || ++steps > list.length) fail(`tasks[${String(i)}].parentId`, 'no cycles');
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    if (t.parentId !== null) parents.add(t.parentId);
  });
  if (resources !== undefined) {
    if (!Array.isArray(resources)) fail('resources', 'GanttResource[]');
    const rids = new Set<string>();
    (resources as unknown[]).forEach((r, i) => {
      const p = `resources[${String(i)}]`;
      if (!validators.isRecord(r)) fail(p, 'GanttResource');
      if (typeof r.id !== 'string' || r.id === '' || rids.has(r.id)) fail(`${p}.id`, 'unique non-empty string');
      rids.add(r.id);
      if (typeof r.label !== 'string' || r.label.trim() === '') fail(`${p}.label`, 'non-empty string');
      if (r.capacity !== undefined && !(Number.isInteger(r.capacity) && (r.capacity as number) >= 1 && (r.capacity as number) <= 10_000)) fail(`${p}.capacity`, 'integer from 1 to 10000 (percent)');
    });
    list.forEach((t, i) => {
      (t.assignments ?? []).forEach((a, j) => {
        if (!rids.has(a.resourceId)) fail(`tasks[${String(i)}].assignments[${String(j)}].resourceId`, 'the id of a resource');
      });
    });
  }
  if (dependencies === undefined) return;
  if (!Array.isArray(dependencies)) fail('dependencies', 'GanttDependency[]');
  const dids = new Set<string>();
  const pairs = new Set<string>();
  (dependencies as unknown[]).forEach((d, i) => {
    const p = `dependencies[${String(i)}]`;
    if (!validators.isRecord(d)) fail(p, 'GanttDependency');
    if (typeof d.id !== 'string' || d.id === '' || dids.has(d.id)) fail(`${p}.id`, 'unique non-empty string');
    dids.add(d.id);
    for (const key of ['from', 'to'] as const) {
      const v = d[key];
      if (typeof v !== 'string' || !byId.has(v)) fail(`${p}.${key}`, 'the id of a task');
      if (parents.has(v)) fail(`${p}.${key}`, 'a task without children (summary tasks follow their children)');
    }
    if (d.from === d.to) fail(`${p}.to`, 'a different task than from');
    const pair = `${String(d.from)}\u0000${String(d.to)}`;
    if (pairs.has(pair)) fail(p, 'one dependency per pair of tasks');
    pairs.add(pair);
    if (d.type !== undefined && !['FS', 'SS', 'FF', 'SF'].includes(d.type as string)) fail(`${p}.type`, '"FS" | "SS" | "FF" | "SF"');
    if (d.lag !== undefined && !(Number.isInteger(d.lag) && (d.lag as number) >= -10_000 && (d.lag as number) <= 10_000)) fail(`${p}.lag`, 'integer from -10000 to 10000 (working days)');
  });
  const cycle = findCycle(dependencies as GanttDependency[]);
  if (cycle) fail(`dependencies[${String((dependencies as GanttDependency[]).findIndex((d) => d.id === cycle[0]))}]`, `no cycles (${cycle.join(' -> ')})`);
}

/** Ids of the dependencies forming a cycle, or null. */
function findCycle(deps: readonly GanttDependency[]): string[] | null {
  const out = new Map<string, GanttDependency[]>();
  for (const d of deps) {
    const list = out.get(d.from);
    if (list) list.push(d);
    else out.set(d.from, [d]);
  }
  const state = new Map<string, 1 | 2>();
  const path: GanttDependency[] = [];
  const visit = (id: string): string[] | null => {
    state.set(id, 1);
    for (const d of out.get(id) ?? []) {
      const s = state.get(d.to);
      path.push(d);
      if (s === 1) {
        const start = path.findIndex((x) => x.from === d.to);
        return path.slice(start).map((x) => x.id);
      }
      if (s === undefined) {
        const found = visit(d.to);
        if (found) return found;
      }
      path.pop();
    }
    state.set(id, 2);
    return null;
  };
  for (const d of deps) {
    if (state.has(d.from)) continue;
    const found = visit(d.from);
    if (found) return found;
  }
  return null;
}

/** Whether adding a dependency from -> to would create a cycle. */
export function createsCycle(dependencies: readonly GanttDependency[], from: string, to: string): boolean {
  if (from === to) return true;
  const out = new Map<string, string[]>();
  for (const d of dependencies) {
    const list = out.get(d.from);
    if (list) list.push(d.to);
    else out.set(d.from, [d.to]);
  }
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length > 0) {
    const id = stack.pop() ?? '';
    if (id === from) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(out.get(id) ?? []));
  }
  return false;
}

/**
 * Working-day index over a calendar: every working day gets a consecutive integer.
 * Tables grow on demand, so lookups are constant time after the first pass.
 */
export class WorkIndex {
  readonly #cal: BusinessCalendarEngine;
  readonly #origin: number;
  /** cum[i]: working days in [origin, origin + i). */
  #cum: number[] = [0];
  /** days[k]: epoch day of working day k. */
  #days: number[] = [];

  constructor(calendar: BusinessCalendarEngine, origin: PlainDate) {
    this.#cal = calendar;
    this.#origin = epochDay(origin);
  }

  get origin(): PlainDate {
    return fromEpochDay(this.#origin);
  }

  #extendDays(offset: number): void {
    let quiet = 0;
    while (this.#cum.length <= offset + 1) {
      const i = this.#cum.length - 1;
      const day = this.#origin + i;
      const working = this.#cal.isWorkingDay(fromEpochDay(day));
      if (working) {
        this.#days.push(day);
        quiet = 0;
      } else if (++quiet > 3660) {
        throw runtimeError('BUSINESS_CALENDAR_NO_WORKING_DAYS', 'No working day found within ten years.', { component: 'gantt', remediation: 'Define at least one working weekday or working exception.' });
      }
      this.#cum.push((this.#cum[i] ?? 0) + (working ? 1 : 0));
    }
  }

  /** Index of the first working day on or after `date` (dates before the origin clamp to 0). */
  index(date: PlainDate): number {
    const offset = epochDay(date) - this.#origin;
    if (offset <= 0) return 0;
    this.#extendDays(offset);
    return this.#cum[offset] ?? 0;
  }

  /** Index of the last working day on or before `date` (-1 before the first). */
  indexBefore(date: PlainDate): number {
    const offset = epochDay(date) - this.#origin;
    if (offset < 0) return -1;
    this.#extendDays(offset + 1);
    return (this.#cum[offset + 1] ?? 0) - 1;
  }

  /** Date of working day `index` (negative indexes clamp to 0). */
  date(index: number): PlainDate {
    const k = Math.max(0, index);
    let offset = this.#cum.length;
    while (this.#days.length <= k) {
      offset += 64;
      this.#extendDays(offset);
    }
    return fromEpochDay(this.#days[k] ?? this.#origin);
  }
}

interface Work {
  s: number;
  f: number;
  ls: number;
  lf: number;
  driven: boolean;
  violations: string[];
}

const typeOf = (d: GanttDependency): GanttDependencyType => d.type ?? 'FS';

/** Earliest start a dependency allows for its successor (working-day index). */
function required(d: GanttDependency, pred: Work, succDuration: number): number {
  const lag = d.lag ?? 0;
  switch (typeOf(d)) {
    case 'FS':
      return pred.f + lag;
    case 'SS':
      return pred.s + lag;
    case 'FF':
      return pred.f + lag - succDuration;
    case 'SF':
      return pred.s + lag - succDuration;
  }
}

/** Latest finish a dependency allows for its predecessor. */
function latest(d: GanttDependency, succ: Work, succDuration: number, predDuration: number): number {
  const lag = d.lag ?? 0;
  const ls = succ.lf - succDuration;
  switch (typeOf(d)) {
    case 'FS':
      return ls - lag;
    case 'SS':
      return ls - lag + predDuration;
    case 'FF':
      return succ.lf - lag;
    case 'SF':
      return succ.lf - lag + predDuration;
  }
}

/** A work index whose origin lies safely before every date the schedule can reach. */
export function workIndexFor(tasks: readonly Readonly<GanttTask>[], dependencies: readonly Readonly<GanttDependency>[], calendar: BusinessCalendarEngine): WorkIndex {
  let min = Number.POSITIVE_INFINITY;
  for (const t of tasks) {
    min = Math.min(min, epochDay(t.start));
    if (t.baseline) min = Math.min(min, epochDay(t.baseline.start));
  }
  if (!Number.isFinite(min)) min = epochDay(plainDate(2000, 1, 1));
  const leads = dependencies.reduce((sum, d) => sum + Math.max(0, -(d.lag ?? 0)), 0) + tasks.reduce((m, t) => Math.max(m, t.duration), 0);
  return new WorkIndex(calendar, fromEpochDay(min - Math.min(40_000, 3 * leads + 400)));
}

/** Schedule tasks on a calendar (validate first with `assertGantt`). */
export function scheduleGantt(tasks: readonly Readonly<GanttTask>[], dependencies: readonly Readonly<GanttDependency>[], calendar: BusinessCalendarEngine, index = workIndexFor(tasks, dependencies, calendar)): GanttSchedule {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.parentId === null) continue;
    const list = children.get(t.parentId);
    if (list) list.push(t.id);
    else children.set(t.parentId, [t.id]);
  }
  const leaves = tasks.filter((t) => !children.has(t.id));
  const incoming = new Map<string, GanttDependency[]>();
  const outgoing = new Map<string, GanttDependency[]>();
  for (const d of dependencies) {
    (incoming.get(d.to) ?? incoming.set(d.to, []).get(d.to))?.push(d);
    (outgoing.get(d.from) ?? outgoing.set(d.from, []).get(d.from))?.push(d);
  }
  // Kahn's topological order over leaf tasks (dependencies connect leaves only).
  const indegree = new Map(leaves.map((t) => [t.id, incoming.get(t.id)?.length ?? 0]));
  const queue = leaves.filter((t) => indegree.get(t.id) === 0).map((t) => t.id);
  const order: string[] = [];
  // The queue grows while it is iterated (for-of sees appended items).
  for (const id of queue) {
    order.push(id);
    for (const d of outgoing.get(id) ?? []) {
      const n = (indegree.get(d.to) ?? 0) - 1;
      indegree.set(d.to, n);
      if (n === 0) queue.push(d.to);
    }
  }
  if (order.length !== leaves.length) fail('dependencies', 'no cycles');

  const work = new Map<string, Work>();
  for (const id of order) {
    const t = byId.get(id);
    if (!t) continue;
    const floor = index.index(t.start);
    let s = floor;
    const violations: string[] = [];
    for (const d of incoming.get(id) ?? []) {
      const pred = work.get(d.from);
      if (!pred) continue;
      const r = required(d, pred, t.duration);
      if (t.manual === true) {
        if (r > floor) violations.push(d.id);
      } else s = Math.max(s, r);
    }
    work.set(id, { s, f: s + t.duration, ls: 0, lf: 0, driven: s > floor, violations });
  }
  let projectStart = Number.POSITIVE_INFINITY;
  let projectFinish = Number.NEGATIVE_INFINITY;
  let projectEnd = Number.NEGATIVE_INFINITY;
  for (const w of work.values()) {
    projectStart = Math.min(projectStart, w.s);
    projectFinish = Math.max(projectFinish, w.f);
    projectEnd = Math.max(projectEnd, w.f > w.s ? w.f - 1 : w.s);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i] ?? '';
    const w = work.get(id);
    const t = byId.get(id);
    if (!w || !t) continue;
    let lf = projectFinish;
    for (const d of outgoing.get(id) ?? []) {
      const succ = work.get(d.to);
      const st = byId.get(d.to);
      if (succ && st) lf = Math.min(lf, latest(d, succ, st.duration, t.duration));
    }
    w.lf = lf;
    w.ls = lf - t.duration;
  }

  const out = new Map<string, GanttScheduledTask>();
  const critical: string[] = [];
  const finishIndex = (s: number, f: number): number => (f > s ? f - 1 : s);
  const variance = (t: Readonly<GanttTask>, s: number, f: number): number | null => (t.baseline ? finishIndex(s, f) - index.indexBefore(t.baseline.end) : null);
  for (const id of order) {
    const w = work.get(id);
    const t = byId.get(id);
    if (!w || !t) continue;
    const float = w.ls - w.s;
    const isCritical = float <= 0;
    if (isCritical) critical.push(id);
    out.set(id, Object.freeze({
      id,
      start: index.date(w.s),
      end: index.date(finishIndex(w.s, w.f)),
      duration: t.duration,
      summary: false,
      milestone: t.duration === 0,
      totalFloat: float,
      critical: isCritical,
      driven: w.driven,
      violations: Object.freeze(w.violations),
      variance: variance(t, w.s, w.f),
    }));
  }
  // Summary tasks span their descendants: first start to last end (a milestone ends on its day).
  const spans = new Map<string, { s: number; e: number }>();
  const span = (id: string): { s: number; e: number } | null => {
    const w = work.get(id);
    if (w) return { s: w.s, e: finishIndex(w.s, w.f) };
    const known = spans.get(id);
    if (known) return known;
    let s = Number.POSITIVE_INFINITY;
    let e = Number.NEGATIVE_INFINITY;
    for (const c of children.get(id) ?? []) {
      const x = span(c);
      if (!x) continue;
      s = Math.min(s, x.s);
      e = Math.max(e, x.e);
    }
    if (!Number.isFinite(s)) return null;
    const t = byId.get(id);
    if (t) {
      out.set(id, Object.freeze({
        id,
        start: index.date(s),
        end: index.date(e),
        duration: e - s + 1,
        summary: true,
        milestone: false,
        totalFloat: 0,
        critical: false,
        driven: false,
        violations: Object.freeze([]),
        variance: t.baseline ? e - index.indexBefore(t.baseline.end) : null,
      }));
    }
    spans.set(id, { s, e });
    return { s, e };
  };
  for (const t of tasks) if (children.has(t.id) && !out.has(t.id)) span(t.id);
  return Object.freeze({
    tasks: out,
    start: Number.isFinite(projectStart) ? index.date(projectStart) : null,
    finish: Number.isFinite(projectEnd) ? index.date(projectEnd) : null,
    critical: Object.freeze(critical),
  });
}

/** Daily load of each resource over the working days of [range.start, range.end]. */
export function resourceLoad(
  tasks: readonly Readonly<GanttTask>[],
  schedule: GanttSchedule,
  resources: readonly Readonly<GanttResource>[],
  calendar: BusinessCalendarEngine,
  range: { start: PlainDate; end: PlainDate },
): GanttResourceLoad[] {
  const index = new WorkIndex(calendar, addDays(range.start, -1));
  const first = index.index(range.start);
  const last = index.indexBefore(range.end);
  const length = Math.max(0, last - first + 1);
  const loads = new Map(resources.map((r) => [r.id, new Array<number>(length).fill(0)]));
  for (const t of tasks) {
    const st = schedule.tasks.get(t.id);
    if (!st || st.summary || st.milestone || !t.assignments) continue;
    const s = index.index(st.start);
    const e = index.indexBefore(st.end);
    for (const a of t.assignments) {
      const load = loads.get(a.resourceId);
      if (!load) continue;
      for (let k = Math.max(s, first); k <= Math.min(e, last); k++) load[k - first] = (load[k - first] ?? 0) + (a.units ?? 100);
    }
  }
  return resources.map((r) => {
    const capacity = r.capacity ?? 100;
    const load = loads.get(r.id) ?? [];
    const days = load.map((value, k) => Object.freeze({ date: index.date(first + k), load: value, capacity, over: value > capacity }));
    return Object.freeze({
      resourceId: r.id,
      days: Object.freeze(days),
      overDays: days.filter((d) => d.over).length,
      peak: load.reduce((m, v) => Math.max(m, v), 0),
    });
  });
}
