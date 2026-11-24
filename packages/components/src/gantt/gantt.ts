/**
 * Gantt chart (SPEC section 18.19). A task tree grid beside a timeline of bars, with
 * summary tasks, milestones, progress, baselines, dependencies (FS, SS, FF, SF with
 * lag) drawn as connectors, forward auto-scheduling on Business Calendar working
 * days, the critical path, resource assignments with a load histogram, undo, and
 * virtual rows. The tree grid is the accessible surface (WAI-ARIA treegrid with
 * row focus): every value shown by a bar is also in its row. The timeline is a
 * pointer surface: drag a bar to move it, its end to resize it, or its link
 * handle onto another bar to add a dependency. Keyboard and toolbar equivalents:
 * Ctrl/Cmd + Left/Right moves a task by a working day, Shift + Left/Right changes
 * its duration, and Link then Enter on another task links (or unlinks) two tasks.
 * Every change is dispatched first as the cancelable `aui-task-change`.
 */
import {
  addDays,
  addMonths,
  comparePlainDate,
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatNumber,
  formatPlainDate,
  getFirstDayOfWeek,
  getMessage,
  plainDate,
  registerMessages,
  validators,
  type Direction,
  type PlainDate,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, matchesHotkey, observeResize, trackPointerDrag, type DragMove, type PointerDrag } from '@absoluteui/utilities';
import { createBusinessCalendar, type BusinessCalendarDefinition, type BusinessCalendarEngine } from '../business-calendar/engine.js';
import {
  assertGantt,
  createsCycle,
  epochDay,
  fromEpochDay,
  resourceLoad,
  scheduleGantt,
  workIndexFor,
  type GanttDependency,
  type GanttResource,
  type GanttResourceLoad,
  type GanttSchedule,
  type GanttScheduledTask,
  type GanttTask,
  type WorkIndex,
} from './engine.js';

export type GanttScale = 'day' | 'week' | 'month';
export type GanttColumnKey = 'name' | 'start' | 'end' | 'duration' | 'progress' | 'resources' | 'float';

export interface GanttConfig {
  scale: GanttScale;
  /** Row height in CSS px. */
  rowHeight: number;
  historyLimit: number;
}

type Resolved = GanttConfig & { locale: string; direction: Direction };

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    gantt: Resolved;
  }
}

export const ganttConfig = defineComponentConfig<GanttConfig, 'locale' | 'direction'>(
  'gantt',
  {
    scale: { default: 'week', expected: '"day" | "week" | "month"', validate: validators.oneOf(['day', 'week', 'month'] as const) },
    rowHeight: { default: 36, expected: 'integer from 24 to 96 (CSS px)', validate: validators.integerInRange(24, 96) },
    historyLimit: { default: 50, expected: 'integer from 0 to 500', validate: validators.integerInRange(0, 500) },
  },
  ['locale', 'direction'],
);

registerMessages('gantt', 'en', {
  toolbar: '{label} controls',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  today: 'Go to today',
  earlier: 'Move earlier',
  later: 'Move later',
  shorten: 'Shorten',
  lengthen: 'Lengthen',
  link: 'Link tasks',
  undo: 'Undo',
  redo: 'Redo',
  colName: 'Task',
  colStart: 'Start',
  colEnd: 'End',
  colDuration: 'Duration',
  colProgress: 'Progress',
  colResources: 'Resources',
  colFloat: 'Float',
  days_one: '{count} day',
  days_other: '{count} days',
  milestone: 'Milestone',
  critical: 'Critical',
  instructions: 'Use the arrow keys to move between tasks; Right and Left expand and collapse. Control with Left or Right moves a task by one working day, Shift with Left or Right changes its duration. Press Enter to open a task.',
  readInstructions: 'Use the arrow keys to move between tasks; Right and Left expand and collapse. Press Enter to open a task.',
  predecessors: 'Depends on {list}.',
  dependency: '{task} ({type})',
  dependencyLag: '{task} ({type}, {lag})',
  typeFS: 'finish to start',
  typeSS: 'start to start',
  typeFF: 'finish to finish',
  typeSF: 'start to finish',
  violated: 'Dependency not met: {list}.',
  behind_one: '{count} working day behind baseline.',
  behind_other: '{count} working days behind baseline.',
  ahead_one: '{count} working day ahead of baseline.',
  ahead_other: '{count} working days ahead of baseline.',
  onBaseline: 'On baseline.',
  changed: '{label}: {start} to {end}, {duration}.',
  changedMilestone: '{label}: milestone on {start}.',
  limited: '{label} cannot start earlier because of its dependencies.',
  notEditable: '{label} cannot be changed.',
  linkStart: 'Select the task that follows {label} and press Enter, or press Escape to cancel.',
  linked: '{to} now follows {from}.',
  unlinked: '{to} no longer follows {from}.',
  linkRefused: '{to} cannot follow {from}.',
  linkCancelled: 'Linking cancelled.',
  undone: 'Change undone.',
  redone: 'Change redone.',
  scaleday: 'Scale: days.',
  scaleweek: 'Scale: weeks.',
  scalemonth: 'Scale: months.',
  histogram: 'Resource load',
  load: 'Peak {peak}, {over}',
  overDays_one: '{count} day over capacity',
  overDays_other: '{count} days over capacity',
  noLoad: 'No assignments in view',
  empty: 'No tasks',
});

export interface GanttOptions extends Partial<GanttConfig> {
  /** Accessible name of the tree grid; the toolbar is named "{label} controls". */
  label: string;
  tasks: readonly GanttTask[];
  dependencies?: readonly GanttDependency[];
  resources?: readonly GanttResource[];
  /** Working days and holidays (default Monday to Friday). */
  calendar?: BusinessCalendarDefinition;
  /** Pointer, keyboard, and toolbar editing. Default false. */
  editable?: boolean;
  /** Tree grid columns. Default name, start, end, duration. */
  columns?: readonly GanttColumnKey[];
  /** Mark critical tasks. Default true. */
  showCritical?: boolean;
  /** Draw baselines. Default true. */
  showBaselines?: boolean;
  /** Show the resource load histogram (needs `resources`). Default false. */
  showHistogram?: boolean;
  /** Today's date (default: the local date). */
  today?: PlainDate;
  /** Veto edits of a task. Summary and read-only tasks are never edited. */
  canEdit?: (task: Readonly<GanttTask>) => boolean;
  locale?: string;
  direction?: Direction;
}

export type GanttChangeReason = 'move' | 'resize' | 'link' | 'unlink' | 'undo' | 'redo';

export interface GanttTaskChange {
  id: string;
  start?: PlainDate;
  duration?: number;
}

/** Detail of the cancelable `aui-task-change`. */
export interface GanttTaskChangeDetail {
  reason: GanttChangeReason;
  /** Requested changes (empty for link, unlink, undo, redo). */
  changes: GanttTaskChange[];
  /** Dependency added (link) or removed (unlink). */
  dependency: GanttDependency | null;
  /** Every task and dependency after the change (copies), for saving. */
  tasks: GanttTask[];
  dependencies: GanttDependency[];
  /** The schedule after the change. */
  schedule: GanttSchedule;
}

export interface GanttTaskActivateDetail {
  id: string;
  task: GanttTask;
}

export interface GanttExpandChangeDetail {
  id: string;
  expanded: boolean;
}

export interface GanttScaleChangeDetail {
  scale: GanttScale;
}

interface Snapshot {
  readonly tasks: readonly GanttTask[];
  readonly dependencies: readonly GanttDependency[];
}

interface RowEl {
  readonly row: HTMLDivElement;
  readonly cells: Map<GanttColumnKey, HTMLDivElement>;
  readonly bar: HTMLDivElement;
}

interface Drag {
  readonly id: string;
  readonly mode: 'move' | 'resize' | 'link';
  readonly origin: GanttScheduledTask;
  target: string | null;
}

const COLUMNS: readonly GanttColumnKey[] = ['name', 'start', 'end', 'duration', 'progress', 'resources', 'float'];
const DEFAULT_COLUMNS: readonly GanttColumnKey[] = ['name', 'start', 'end', 'duration'];
const DAY_WIDTH: Readonly<Record<GanttScale, number>> = { day: 32, week: 16, month: 5 };
const PADDING: Readonly<Record<GanttScale, number>> = { day: 7, week: 14, month: 45 };
const SCALES: readonly GanttScale[] = ['day', 'week', 'month'];
const OVERSCAN = 8;
const LABEL_ROOM = 160;
const SVG = 'http://www.w3.org/2000/svg';

function fail(property: string, expected: string): never {
  throw configurationError('GANTT_OPTIONS', 'Invalid Gantt options.', { component: 'gantt', property: `gantt.${property}`, expected });
}

const copyTask = (t: Readonly<GanttTask>): GanttTask => {
  const out: GanttTask = { id: t.id, parentId: t.parentId, label: t.label, start: t.start, duration: t.duration };
  if (t.progress !== undefined) out.progress = t.progress;
  if (t.manual !== undefined) out.manual = t.manual;
  if (t.assignments !== undefined) out.assignments = t.assignments.map((a) => ({ ...a }));
  if (t.baseline !== undefined) out.baseline = { start: t.baseline.start, end: t.baseline.end };
  if (t.color !== undefined) out.color = t.color;
  if (t.readOnly !== undefined) out.readOnly = t.readOnly;
  if (t.collapsed !== undefined) out.collapsed = t.collapsed;
  return out;
};
const copyDep = (d: Readonly<GanttDependency>): GanttDependency => ({ ...d });

function localToday(): PlainDate {
  const d = new Date();
  return plainDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export class Gantt {
  readonly host: HTMLElement;
  /** The tree grid element (role=treegrid). */
  readonly element: HTMLDivElement;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();
  readonly #toolbar: HTMLDivElement;
  readonly #buttons = new Map<string, HTMLButtonElement>();
  readonly #body: HTMLDivElement;
  readonly #head: HTMLDivElement;
  readonly #rows: HTMLDivElement;
  readonly #chart: HTMLDivElement;
  readonly #scale: HTMLDivElement;
  readonly #canvas: HTMLDivElement;
  readonly #shade: HTMLDivElement;
  readonly #links: SVGSVGElement;
  readonly #bars: HTMLDivElement;
  readonly #today: HTMLDivElement;
  readonly #histogram: HTMLDivElement;
  readonly #help: HTMLParagraphElement;
  #options: GanttOptions;
  #tasks: GanttTask[] = [];
  #deps: GanttDependency[] = [];
  #byId = new Map<string, GanttTask>();
  #children = new Map<string, string[]>();
  #calendar: BusinessCalendarEngine;
  #index: WorkIndex;
  #schedule: GanttSchedule = { tasks: new Map(), start: null, finish: null, critical: [] };
  #expanded = new Set<string>();
  #knownSummaries = new Set<string>();
  #visible: string[] = [];
  #depth = new Map<string, number>();
  #rowEls = new Map<string, RowEl>();
  #focusId: string | null = null;
  #linkFrom: string | null = null;
  #history: Snapshot[] = [];
  #future: Snapshot[] = [];
  #range = { start: plainDate(2000, 1, 1), days: 0 };
  #drag: Drag | null = null;
  #pointer: PointerDrag | null = null;
  #frame = 0;
  #syncing = false;

  static create(host: HTMLElement, options: GanttOptions): Gantt {
    return new Gantt(host, options);
  }

  private constructor(host: HTMLElement, options: GanttOptions) {
    Gantt.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#config();
    this.#calendar = createBusinessCalendar(options.calendar ?? {});
    this.#setData(options.tasks, options.dependencies ?? []);
    this.#index = workIndexFor(this.#tasks, this.#deps, this.#calendar);
    this.#initExpansion();
    this.#reschedule();
    const doc = this.#doc;
    const div = (className: string): HTMLDivElement => {
      const el = doc.createElement('div');
      el.className = className;
      return el;
    };
    this.#toolbar = div('aui-gantt__toolbar');
    this.#toolbar.setAttribute('role', 'group');
    const tools: [string, IconRef][] = [['zoomOut', 'zoom-out'], ['zoomIn', 'zoom-in'], ['today', 'locate'], ['earlier', 'chevron-left'], ['later', 'chevron-right'], ['shorten', 'minus'], ['lengthen', 'plus'], ['link', 'link'], ['undo', 'undo'], ['redo', 'redo']];
    for (const [action, icon] of tools) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-gantt__tool';
      b.dataset.auiAction = action;
      b.append(renderIcon(icon, { doc }));
      this.#toolbar.append(b);
      this.#buttons.set(action, b);
    }
    this.#body = div('aui-gantt__body');
    this.element = div('aui-gantt__table');
    this.element.setAttribute('role', 'treegrid');
    this.#head = div('aui-gantt__head');
    this.#head.setAttribute('role', 'row');
    this.#head.setAttribute('aria-rowindex', '1');
    this.#rows = div('aui-gantt__rows');
    this.#rows.setAttribute('role', 'rowgroup');
    const headGroup = div('aui-gantt__head-group');
    headGroup.setAttribute('role', 'rowgroup');
    headGroup.append(this.#head);
    this.element.append(headGroup, this.#rows);
    this.#chart = div('aui-gantt__chart');
    this.#chart.setAttribute('aria-hidden', 'true');
    this.#scale = div('aui-gantt__scale');
    this.#canvas = div('aui-gantt__canvas');
    this.#shade = div('aui-gantt__shade');
    this.#links = doc.createElementNS(SVG, 'svg');
    this.#links.classList.add('aui-gantt__links');
    this.#links.setAttribute('focusable', 'false');
    this.#bars = div('aui-gantt__bars');
    this.#today = div('aui-gantt__today');
    this.#canvas.append(this.#shade, this.#today, this.#links, this.#bars);
    this.#chart.append(this.#scale, this.#canvas);
    this.#body.append(this.element, this.#chart);
    this.#histogram = div('aui-gantt__histogram');
    this.#help = doc.createElement('p');
    this.#help.className = 'aui-gantt__instructions';
    this.#help.id = createId('aui-gantt-help');
    host.classList.add('aui-gantt');
    host.replaceChildren(this.#toolbar, this.#body, this.#histogram, this.#help);
    this.#render();

    const g = this.#group;
    g.listen(this.element, 'keydown', (e) => {
      this.#onKey(e);
    });
    g.listen(this.#body, 'click', (e) => {
      this.#onClick(e);
    });
    g.listen(this.element, 'focusin', (e) => {
      const row = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[role="row"][data-aui-task]') : null;
      const id = row?.dataset.auiTask;
      if (id !== undefined && id !== this.#focusId) {
        this.#focusId = id;
        this.#syncTabStops();
        this.#syncToolbar();
      }
    });
    g.listen(this.#toolbar, 'click', (e) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button') : null;
      if (b?.dataset.auiAction) this.#action(b.dataset.auiAction);
    });
    g.listen(this.#body, 'scroll', () => {
      this.#syncScroll(this.#body, this.#histogram);
      const view = this.#doc.defaultView;
      if (!view || this.#frame !== 0) return;
      this.#frame = view.requestAnimationFrame(() => {
        this.#frame = 0;
        this.#renderRows();
      });
    }, { passive: true });
    g.listen(this.#histogram, 'scroll', () => {
      this.#syncScroll(this.#histogram, this.#body);
    }, { passive: true });
    this.#pointer = trackPointerDrag(this.#bars, {
      canStart: (e) => this.#canStartDrag(e),
      onStart: (move) => {
        this.#dragMove(move);
      },
      onMove: (move) => {
        this.#dragMove(move);
      },
      onEnd: (move) => {
        this.#dragEnd(move);
      },
      onCancel: () => {
        this.#dragCancel();
      },
    });
    g.add(() => this.#pointer?.dispose());
    g.add(observeResize(this.#body, () => {
      this.#renderRows();
    }));
    g.add(ganttConfig.subscribe(() => {
      this.#render();
    }));
    g.add(() => {
      const view = this.#doc.defaultView;
      if (this.#frame !== 0 && view) view.cancelAnimationFrame(this.#frame);
    });
  }

  /** Every task (copies, for saving). */
  get tasks(): GanttTask[] {
    return this.#tasks.map(copyTask);
  }

  get dependencies(): GanttDependency[] {
    return this.#deps.map(copyDep);
  }

  /** The current schedule (scheduled dates, float, critical path). */
  get schedule(): GanttSchedule {
    return this.#schedule;
  }

  get businessCalendar(): BusinessCalendarEngine {
    return this.#calendar;
  }

  get scale(): GanttScale {
    return this.#config().scale;
  }

  get editable(): boolean {
    return this.#options.editable === true;
  }

  get expanded(): string[] {
    return [...this.#expanded];
  }

  get canUndo(): boolean {
    return this.#history.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  update(options: Partial<GanttOptions>): void {
    const next = { ...this.#options, ...options };
    Gantt.#assert(next);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#config();
    } catch (error) {
      this.#options = previous;
      throw error;
    }
    if (options.calendar !== undefined) this.#calendar = createBusinessCalendar(next.calendar ?? {});
    if (options.tasks !== undefined || options.dependencies !== undefined) {
      this.#setData(next.tasks, next.dependencies ?? []);
      this.#history = [];
      this.#future = [];
      this.#linkFrom = null;
      if (options.tasks !== undefined) this.#initExpansion(true);
    }
    if (options.columns !== undefined) {
      for (const r of this.#rowEls.values()) {
        r.row.remove();
        r.bar.remove();
      }
      this.#rowEls.clear();
    }
    if (options.tasks !== undefined || options.dependencies !== undefined || options.calendar !== undefined) this.#index = workIndexFor(this.#tasks, this.#deps, this.#calendar);
    this.#reschedule();
    this.#render();
  }

  setScale(scale: GanttScale): void {
    if (!SCALES.includes(scale)) fail('setScale.scale', '"day" | "week" | "month"');
    if (scale === this.scale) return;
    const anchor = this.#dateAtViewStart();
    this.#options = { ...this.#options, scale };
    this.#render();
    this.#scrollToDate(anchor, 'start');
    announce(this.#msg(`scale${scale}`), 'polite', this.#doc);
    const detail: GanttScaleChangeDetail = { scale };
    emit(this.host, 'aui-scale-change', detail);
  }

  setExpanded(id: string, expanded: boolean): void {
    if (!this.#children.has(id)) return;
    if (expanded === this.#expanded.has(id)) return;
    if (expanded) this.#expanded.add(id);
    else this.#expanded.delete(id);
    this.#render();
    const detail: GanttExpandChangeDetail = { id, expanded };
    emit(this.host, 'aui-expand-change', detail);
  }

  expandAll(): void {
    for (const id of this.#children.keys()) this.#expanded.add(id);
    this.#render();
  }

  collapseAll(): void {
    this.#expanded.clear();
    this.#render();
  }

  /** Expand a task's ancestors, scroll its row and bar into view, and optionally focus it. */
  scrollToTask(id: string, options: { focus?: boolean } = {}): void {
    if (!this.#byId.has(id)) fail('scrollToTask.id', 'the id of a task');
    let cursor = this.#byId.get(id)?.parentId ?? null;
    while (cursor !== null) {
      this.#expanded.add(cursor);
      cursor = this.#byId.get(cursor)?.parentId ?? null;
    }
    this.#focusId = id;
    this.#render();
    this.#scrollRowIntoView(id);
    const st = this.#schedule.tasks.get(id);
    if (st) this.#scrollToDate(st.start, 'center');
    if (options.focus !== false) this.#focusRow(id);
  }

  /** Scroll the timeline to a date. */
  scrollToDate(date: PlainDate): void {
    this.#scrollToDate(date, 'center');
  }

  /** Change a task's requested start (moves to the next working day). Returns false when refused. */
  moveTask(id: string, start: PlainDate): boolean {
    this.#assertEditTarget(id, 'moveTask.id');
    return this.#change('move', [{ id, start: this.#index.date(this.#index.index(start)) }]);
  }

  /** Change a task's duration in working days (0 makes a milestone). */
  setDuration(id: string, duration: number): boolean {
    this.#assertEditTarget(id, 'setDuration.id');
    if (!(Number.isInteger(duration) && duration >= 0 && duration <= 100_000)) fail('setDuration.duration', 'integer from 0 to 100000');
    return this.#change('resize', [{ id, duration }]);
  }

  /** Add a dependency. Refused (false) for cycles, summary tasks, and duplicate pairs. */
  addDependency(dependency: GanttDependency): boolean {
    const next = [...this.#deps, copyDep(dependency)];
    assertGantt(this.#tasks, next, this.#options.resources);
    return this.#commit('link', [], this.#tasks, next, copyDep(dependency));
  }

  removeDependency(id: string): boolean {
    const dep = this.#deps.find((d) => d.id === id);
    if (!dep) fail('removeDependency.id', 'the id of a dependency');
    return this.#commit('unlink', [], this.#tasks, this.#deps.filter((d) => d.id !== id), copyDep(dep));
  }

  /** Daily load per resource over a range (default: the visible timeline). */
  resourceLoad(range?: { start: PlainDate; end: PlainDate }): GanttResourceLoad[] {
    const r = range ?? { start: this.#range.start, end: addDays(this.#range.start, Math.max(0, this.#range.days - 1)) };
    return resourceLoad(this.#tasks, this.#schedule, this.#options.resources ?? [], this.#calendar, r);
  }

  focusTask(id: string): void {
    this.scrollToTask(id, { focus: true });
  }

  undo(): boolean {
    const s = this.#history.pop();
    if (!s) return false;
    const current: Snapshot = { tasks: this.#tasks, dependencies: this.#deps };
    if (!this.#emitChange('undo', [], null, s.tasks, s.dependencies)) {
      this.#history.push(s);
      return false;
    }
    this.#future.push(current);
    this.#apply(s.tasks, s.dependencies);
    announce(this.#msg('undone'), 'polite', this.#doc);
    return true;
  }

  redo(): boolean {
    const s = this.#future.pop();
    if (!s) return false;
    const current: Snapshot = { tasks: this.#tasks, dependencies: this.#deps };
    if (!this.#emitChange('redo', [], null, s.tasks, s.dependencies)) {
      this.#future.push(s);
      return false;
    }
    this.#history.push(current);
    this.#apply(s.tasks, s.dependencies);
    announce(this.#msg('redone'), 'polite', this.#doc);
    return true;
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-gantt', 'aui-gantt--editable', 'aui-gantt--linking', 'aui-gantt--day', 'aui-gantt--week', 'aui-gantt--month', 'aui-gantt--rtl');
  }

  // ---- options and data ----------------------------------------------------------------

  static #assert(o: GanttOptions): void {
    if (!validators.isRecord(o)) fail('options', 'GanttOptions');
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    assertGantt(o.tasks, o.dependencies ?? [], o.resources);
    for (const key of ['editable', 'showCritical', 'showBaselines', 'showHistogram'] as const) if (o[key] !== undefined && typeof o[key] !== 'boolean') fail(key, 'boolean');
    if (o.canEdit !== undefined && typeof o.canEdit !== 'function') fail('canEdit', 'function');
    const columns: unknown = o.columns;
    if (columns !== undefined && !(Array.isArray(columns) && columns.length > 0 && columns[0] === 'name' && columns.every((c) => COLUMNS.includes(c as GanttColumnKey)) && new Set(columns).size === columns.length)) {
      fail('columns', `unique keys of ${COLUMNS.join(', ')}, starting with "name"`);
    }
    if (o.today !== undefined && (typeof o.today !== 'object' || (o.today as { kind?: unknown }).kind !== 'PlainDate')) fail('today', 'PlainDate');
  }

  #config(): Readonly<Resolved> {
    const o = this.#options;
    const input: Partial<Resolved> = {};
    for (const key of ['scale', 'rowHeight', 'historyLimit', 'locale', 'direction'] as const) {
      const v = o[key];
      if (v !== undefined) (input as Record<string, unknown>)[key] = v;
    }
    return ganttConfig.resolve(input);
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('gantt', key, params, this.#config().locale);
  }

  #plural(key: string, count: number, params: Readonly<Record<string, string>> = {}): string {
    const locale = this.#config().locale;
    const category = new Intl.PluralRules(locale).select(count);
    const all = { ...params, count: formatNumber(count, {}, locale) };
    try {
      return getMessage('gantt', `${key}_${category}`, all, locale);
    } catch {
      return getMessage('gantt', `${key}_other`, all, locale);
    }
  }

  #date(d: PlainDate, style: 'short' | 'medium' | 'full' = 'medium'): string {
    return formatPlainDate(d, { dateStyle: style }, this.#config().locale);
  }

  #setData(tasks: readonly GanttTask[], deps: readonly GanttDependency[]): void {
    this.#tasks = tasks.map(copyTask);
    this.#deps = deps.map(copyDep);
    this.#byId = new Map(this.#tasks.map((t) => [t.id, t]));
    this.#children = new Map();
    for (const t of this.#tasks) {
      if (t.parentId === null) continue;
      const list = this.#children.get(t.parentId);
      if (list) list.push(t.id);
      else this.#children.set(t.parentId, [t.id]);
    }
    if (this.#focusId !== null && !this.#byId.has(this.#focusId)) this.#focusId = null;
  }

  /** Summary tasks start expanded unless `collapsed`; `keep` preserves the state of known ones. */
  #initExpansion(keep = false): void {
    const previous = this.#expanded;
    const known = this.#knownSummaries;
    this.#expanded = new Set();
    for (const id of this.#children.keys()) {
      if (keep && known.has(id)) {
        if (previous.has(id)) this.#expanded.add(id);
      } else if (this.#byId.get(id)?.collapsed !== true) this.#expanded.add(id);
    }
    this.#knownSummaries = new Set(this.#children.keys());
  }

  #reschedule(): void {
    this.#schedule = scheduleGantt(this.#tasks, this.#deps, this.#calendar, this.#index);
  }

  #assertEditTarget(id: string, at: string): void {
    if (!this.#byId.has(id)) fail(at, 'the id of a task');
  }

  #canEdit(id: string): boolean {
    const t = this.#byId.get(id);
    if (!t || t.readOnly === true || this.#children.has(id)) return false;
    return this.#options.canEdit ? this.#options.canEdit(copyTask(t)) : true;
  }

  // ---- changes -----------------------------------------------------------------------------

  #change(reason: 'move' | 'resize', changes: GanttTaskChange[]): boolean {
    for (const c of changes) {
      if (!this.#canEdit(c.id)) {
        announce(this.#msg('notEditable', { label: this.#byId.get(c.id)?.label ?? c.id }), 'assertive', this.#doc);
        return false;
      }
    }
    const byId = new Map(changes.map((c) => [c.id, c]));
    const tasks = this.#tasks.map((t) => {
      const c = byId.get(t.id);
      if (!c) return t;
      const out = copyTask(t);
      if (c.start !== undefined) out.start = c.start;
      if (c.duration !== undefined) out.duration = c.duration;
      return out;
    });
    const before = new Map(changes.map((c) => [c.id, this.#schedule.tasks.get(c.id)]));
    const ok = this.#commit(reason, changes, tasks, this.#deps, null);
    if (!ok) return false;
    for (const c of changes) {
      const st = this.#schedule.tasks.get(c.id);
      const t = this.#byId.get(c.id);
      if (!st || !t) continue;
      const prev = before.get(c.id);
      if (reason === 'move' && c.start !== undefined && st.driven && prev && comparePlainDate(prev.start, st.start) === 0) announce(this.#msg('limited', { label: t.label }), 'assertive', this.#doc);
      else announce(this.#describeDates(t, st), 'polite', this.#doc);
    }
    return true;
  }

  #describeDates(t: GanttTask, st: GanttScheduledTask): string {
    if (st.milestone) return this.#msg('changedMilestone', { label: t.label, start: this.#date(st.start) });
    return this.#msg('changed', { label: t.label, start: this.#date(st.start), end: this.#date(st.end), duration: this.#plural('days', st.duration) });
  }

  #emitChange(reason: GanttChangeReason, changes: GanttTaskChange[], dependency: GanttDependency | null, tasks: readonly GanttTask[], deps: readonly GanttDependency[], schedule?: GanttSchedule): boolean {
    const detail: GanttTaskChangeDetail = {
      reason,
      changes: changes.map((c) => ({ ...c })),
      dependency: dependency ? copyDep(dependency) : null,
      tasks: tasks.map(copyTask),
      dependencies: deps.map(copyDep),
      schedule: schedule ?? scheduleGantt(tasks, deps, this.#calendar, workIndexFor(tasks, deps, this.#calendar)),
    };
    return emit(this.host, 'aui-task-change', detail, { cancelable: true });
  }

  #commit(reason: GanttChangeReason, changes: GanttTaskChange[], tasks: readonly GanttTask[], deps: readonly GanttDependency[], dependency: GanttDependency | null): boolean {
    const index = workIndexFor(tasks, deps, this.#calendar);
    const schedule = scheduleGantt(tasks, deps, this.#calendar, index);
    if (!this.#emitChange(reason, changes, dependency, tasks, deps, schedule)) {
      this.#render();
      return false;
    }
    const limit = this.#config().historyLimit;
    if (limit > 0) {
      this.#history.push({ tasks: this.#tasks, dependencies: this.#deps });
      if (this.#history.length > limit) this.#history.shift();
    }
    this.#future = [];
    this.#tasks = tasks.map(copyTask);
    this.#deps = deps.map(copyDep);
    this.#byId = new Map(this.#tasks.map((t) => [t.id, t]));
    this.#index = index;
    this.#schedule = schedule;
    this.#render();
    return true;
  }

  #apply(tasks: readonly GanttTask[], deps: readonly GanttDependency[]): void {
    this.#setData(tasks, deps);
    this.#index = workIndexFor(this.#tasks, this.#deps, this.#calendar);
    this.#reschedule();
    this.#render();
  }

  #link(from: string, to: string): boolean {
    const a = this.#byId.get(from);
    const b = this.#byId.get(to);
    if (!a || !b) return false;
    const existing = this.#deps.find((d) => (d.from === from && d.to === to) || (d.from === to && d.to === from));
    if (existing) {
      const ok = this.#commit('unlink', [], this.#tasks, this.#deps.filter((d) => d !== existing), existing);
      if (ok) announce(this.#msg('unlinked', { from: this.#byId.get(existing.from)?.label ?? '', to: this.#byId.get(existing.to)?.label ?? '' }), 'assertive', this.#doc);
      return ok;
    }
    if (this.#children.has(from) || this.#children.has(to) || createsCycle(this.#deps, from, to) || !this.#canEdit(to)) {
      announce(this.#msg('linkRefused', { from: a.label, to: b.label }), 'assertive', this.#doc);
      return false;
    }
    const dep: GanttDependency = { id: createId('aui-gantt-dep'), from, to, type: 'FS' };
    const ok = this.#commit('link', [], this.#tasks, [...this.#deps, dep], dep);
    if (ok) announce(this.#msg('linked', { from: a.label, to: b.label }), 'assertive', this.#doc);
    return ok;
  }

  // ---- toolbar -------------------------------------------------------------------------------

  #action(action: string): void {
    if (this.#buttons.get(action)?.getAttribute('aria-disabled') === 'true') return;
    const id = this.#focusId;
    switch (action) {
      case 'zoomIn':
      case 'zoomOut': {
        const i = SCALES.indexOf(this.scale) + (action === 'zoomIn' ? -1 : 1);
        const next = SCALES[Math.max(0, Math.min(SCALES.length - 1, i))];
        if (next) this.setScale(next);
        return;
      }
      case 'today':
        this.#scrollToDate(this.#todayDate(), 'center');
        return;
      case 'earlier':
      case 'later':
        if (id !== null) this.#nudge(id, action === 'later' ? 1 : -1);
        return;
      case 'shorten':
      case 'lengthen':
        if (id !== null) this.#resizeBy(id, action === 'lengthen' ? 1 : -1);
        return;
      case 'link':
        if (this.#linkFrom !== null) this.#cancelLink();
        else if (id !== null) this.#startLink(id);
        return;
      case 'undo':
        this.undo();
        return;
      case 'redo':
        this.redo();
        return;
    }
  }

  #nudge(id: string, dir: 1 | -1): void {
    const st = this.#schedule.tasks.get(id);
    if (!st) return;
    const at = this.#index.index(st.start) + dir;
    this.#change('move', [{ id, start: this.#index.date(at) }]);
  }

  #resizeBy(id: string, dir: 1 | -1): void {
    const t = this.#byId.get(id);
    if (!t) return;
    const duration = Math.max(t.duration === 0 ? 0 : 1, t.duration + dir);
    if (duration === t.duration) return;
    this.#change('resize', [{ id, duration }]);
  }

  #startLink(id: string): void {
    if (this.#children.has(id)) {
      announce(this.#msg('notEditable', { label: this.#byId.get(id)?.label ?? id }), 'assertive', this.#doc);
      return;
    }
    this.#linkFrom = id;
    this.#render();
    announce(this.#msg('linkStart', { label: this.#byId.get(id)?.label ?? id }), 'assertive', this.#doc);
  }

  #cancelLink(): void {
    this.#linkFrom = null;
    this.#render();
    announce(this.#msg('linkCancelled'), 'polite', this.#doc);
  }

  #finishLink(to: string): void {
    const from = this.#linkFrom;
    this.#linkFrom = null;
    if (from === null) return;
    if (from === to) {
      this.#render();
      announce(this.#msg('linkCancelled'), 'polite', this.#doc);
      return;
    }
    if (!this.#link(from, to)) this.#render();
  }

  #syncToolbar(): void {
    const id = this.#focusId;
    const edit = id !== null && this.#canEdit(id);
    const set = (action: string, disabled: boolean): void => {
      this.#buttons.get(action)?.setAttribute('aria-disabled', String(disabled));
    };
    set('zoomIn', this.scale === 'day');
    set('zoomOut', this.scale === 'month');
    set('earlier', !edit);
    set('later', !edit);
    const t = id === null ? undefined : this.#byId.get(id);
    set('shorten', !edit || (t?.duration ?? 0) <= 1);
    set('lengthen', !edit);
    set('link', this.#linkFrom === null && (id === null || this.#children.has(id)));
    set('undo', !this.canUndo);
    set('redo', !this.canRedo);
    this.#buttons.get('link')?.setAttribute('aria-pressed', String(this.#linkFrom !== null));
  }

  // ---- geometry ------------------------------------------------------------------------------

  #dayWidth(): number {
    return DAY_WIDTH[this.scale];
  }

  #todayDate(): PlainDate {
    return this.#options.today ?? localToday();
  }

  #computeRange(): void {
    const scale = this.scale;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const st of this.#schedule.tasks.values()) {
      min = Math.min(min, epochDay(st.start));
      max = Math.max(max, epochDay(st.end));
    }
    for (const t of this.#tasks) {
      if (!t.baseline || this.#options.showBaselines === false) continue;
      min = Math.min(min, epochDay(t.baseline.start));
      max = Math.max(max, epochDay(t.baseline.end));
    }
    if (!Number.isFinite(min)) {
      min = epochDay(this.#todayDate());
      max = min + 30;
    }
    let start = fromEpochDay(min - PADDING[scale]);
    if (scale === 'week') {
      const first = getFirstDayOfWeek(this.#config().locale);
      const dow = new Date(Date.UTC(start.year, start.month - 1, start.day)).getUTCDay() || 7;
      start = addDays(start, -((dow - first + 7) % 7));
    } else if (scale === 'month') start = plainDate(start.year, start.month, 1);
    // Extra room after the last bar for its label.
    let end = fromEpochDay(max + PADDING[scale] + Math.ceil(LABEL_ROOM / DAY_WIDTH[scale]));
    if (scale === 'month') end = addDays(addMonths(plainDate(end.year, end.month, 1), 1), -1);
    this.#range = { start, days: epochDay(end) - epochDay(start) + 1 };
  }

  /** Inline offset (px from the timeline's inline start) of the start of a date. */
  #x(date: PlainDate): number {
    return (epochDay(date) - epochDay(this.#range.start)) * this.#dayWidth();
  }

  #dateAtX(x: number): PlainDate {
    return fromEpochDay(epochDay(this.#range.start) + Math.floor(x / this.#dayWidth()));
  }

  #tableWidth(): number {
    return this.element.getBoundingClientRect().width;
  }

  #dateAtViewStart(): PlainDate {
    const scrolled = Math.abs(this.#body.scrollLeft);
    return this.#dateAtX(Math.max(0, scrolled));
  }

  #scrollToDate(date: PlainDate, align: 'start' | 'center'): void {
    const view = Math.max(0, this.#body.clientWidth - this.#tableWidth());
    const x = this.#x(date) - (align === 'center' ? view / 2 : 0);
    const left = Math.max(0, x);
    this.#body.scrollLeft = this.#config().direction === 'rtl' ? -left : left;
  }

  #syncScroll(from: HTMLElement, to: HTMLElement): void {
    if (this.#syncing || to.hidden) return;
    this.#syncing = true;
    to.scrollLeft = from.scrollLeft;
    this.#syncing = false;
  }

  // ---- rendering -----------------------------------------------------------------------------

  #columns(): readonly GanttColumnKey[] {
    return this.#options.columns ?? DEFAULT_COLUMNS;
  }

  #computeVisible(): void {
    const out: string[] = [];
    this.#depth = new Map();
    const roots = this.#tasks.filter((t) => t.parentId === null).map((t) => t.id);
    const walk = (ids: readonly string[], depth: number): void => {
      for (const id of ids) {
        out.push(id);
        this.#depth.set(id, depth);
        if (this.#expanded.has(id)) walk(this.#children.get(id) ?? [], depth + 1);
      }
    };
    walk(roots, 0);
    this.#visible = out;
  }

  #render(): void {
    const c = this.#config();
    const doc = this.#doc;
    const o = this.#options;
    this.host.classList.toggle('aui-gantt--editable', this.editable);
    this.host.classList.toggle('aui-gantt--linking', this.#linkFrom !== null);
    for (const s of SCALES) this.host.classList.toggle(`aui-gantt--${s}`, s === c.scale);
    this.host.classList.toggle('aui-gantt--rtl', c.direction === 'rtl');
    this.element.setAttribute('aria-label', o.label);
    this.element.setAttribute('aria-describedby', this.#help.id);
    this.#toolbar.setAttribute('aria-label', this.#msg('toolbar', { label: o.label }));
    this.#help.textContent = this.editable ? this.#msg('instructions') : this.#msg('readInstructions');
    const labels: Record<string, string> = {};
    for (const action of this.#buttons.keys()) labels[action] = this.#msg(action);
    for (const [action, b] of this.#buttons) {
      const text = labels[action] ?? action;
      b.setAttribute('aria-label', text);
      b.title = text;
      if (['earlier', 'later', 'shorten', 'lengthen', 'link', 'undo', 'redo'].includes(action)) b.hidden = !this.editable;
    }
    this.#computeVisible();
    this.#computeRange();
    const columns = this.#columns();
    const headLabels: Record<GanttColumnKey, string> = { name: 'colName', start: 'colStart', end: 'colEnd', duration: 'colDuration', progress: 'colProgress', resources: 'colResources', float: 'colFloat' };
    this.#head.replaceChildren(...columns.map((key, i) => {
      const h = doc.createElement('div');
      h.className = `aui-gantt__cell aui-gantt__cell--${key}`;
      h.setAttribute('role', 'columnheader');
      h.setAttribute('aria-colindex', String(i + 1));
      h.textContent = this.#msg(headLabels[key]);
      return h;
    }));
    this.element.setAttribute('aria-rowcount', String(this.#visible.length + 1));
    this.element.setAttribute('aria-colcount', String(columns.length));
    // On the host: the table width and the histogram label column derive from it.
    this.host.style.setProperty('--aui-gantt-columns', String(columns.length));
    const width = this.#range.days * this.#dayWidth();
    const height = this.#visible.length * c.rowHeight;
    const s = this.host.style;
    s.setProperty('--aui-gantt-row', `${String(c.rowHeight)}px`);
    s.setProperty('--aui-gantt-day', `${String(this.#dayWidth())}px`);
    this.#rows.style.setProperty('block-size', `${String(height)}px`);
    this.#canvas.style.setProperty('inline-size', `${String(width)}px`);
    this.#canvas.style.setProperty('block-size', `${String(Math.max(height, c.rowHeight))}px`);
    this.#scale.style.setProperty('inline-size', `${String(width)}px`);
    this.#links.setAttribute('width', String(width));
    this.#links.setAttribute('height', String(Math.max(height, 1)));
    this.#links.setAttribute('viewBox', `0 0 ${String(width)} ${String(Math.max(height, 1))}`);
    this.#renderScale(c);
    this.#renderShade();
    const today = this.#todayDate();
    const tx = this.#x(today);
    this.#today.hidden = tx < 0 || tx > width;
    this.#today.style.setProperty('inset-inline-start', `${String(tx + this.#dayWidth() / 2)}px`);
    if (this.#focusId === null || !this.#visible.includes(this.#focusId)) {
      // Focus moves to the nearest visible ancestor (a collapsed summary).
      let cursor = this.#focusId;
      while (cursor !== null && !this.#visible.includes(cursor)) cursor = this.#byId.get(cursor)?.parentId ?? null;
      this.#focusId = cursor ?? this.#visible[0] ?? null;
    }
    this.#renderRows();
    this.#renderHistogram(c);
  }

  #renderScale(c: Resolved): void {
    const doc = this.#doc;
    const locale = c.locale;
    const start = this.#range.start;
    const days = this.#range.days;
    const top = doc.createElement('div');
    top.className = 'aui-gantt__tier';
    const bottom = doc.createElement('div');
    bottom.className = 'aui-gantt__tier';
    const label = (tier: HTMLElement, text: string, from: number, span: number, extra = ''): void => {
      const el = doc.createElement('span');
      el.className = `aui-gantt__tick${extra}`;
      el.textContent = text;
      el.style.setProperty('inset-inline-start', `${String(from * this.#dayWidth())}px`);
      el.style.setProperty('inline-size', `${String(span * this.#dayWidth())}px`);
      tier.append(el);
    };
    const origin = epochDay(start);
    // Top tier: months (years on the month scale).
    let d = start;
    while (epochDay(d) < origin + days) {
      const next = c.scale === 'month' ? plainDate(d.year + 1, 1, 1) : addMonths(plainDate(d.year, d.month, 1), 1);
      const from = epochDay(d) - origin;
      const span = Math.min(epochDay(next), origin + days) - epochDay(d);
      label(top, c.scale === 'month' ? formatNumber(d.year, { useGrouping: false }, locale) : formatPlainDate(d, { month: 'long', year: 'numeric' }, locale), from, span);
      d = next;
    }
    if (c.scale === 'day') {
      for (let i = 0; i < days; i++) {
        const day = fromEpochDay(origin + i);
        label(bottom, formatPlainDate(day, { day: 'numeric' }, locale), i, 1, this.#calendar.isWorkingDay(day) ? '' : ' aui-gantt__tick--off');
      }
    } else if (c.scale === 'week') {
      for (let i = 0; i < days; i += 7) {
        const day = fromEpochDay(origin + i);
        label(bottom, formatPlainDate(day, { day: 'numeric', month: 'short' }, locale), i, Math.min(7, days - i));
      }
    } else {
      let m = start;
      while (epochDay(m) < origin + days) {
        const next = addMonths(m, 1);
        label(bottom, formatPlainDate(m, { month: 'short' }, locale), epochDay(m) - origin, epochDay(next) - epochDay(m));
        m = next;
      }
    }
    this.#scale.replaceChildren(top, bottom);
  }

  #renderShade(): void {
    const doc = this.#doc;
    if (this.scale === 'month') {
      this.#shade.replaceChildren();
      return;
    }
    const nodes: HTMLElement[] = [];
    const origin = epochDay(this.#range.start);
    let run = -1;
    const flush = (end: number): void => {
      if (run < 0) return;
      const el = doc.createElement('div');
      el.className = 'aui-gantt__off';
      el.style.setProperty('inset-inline-start', `${String(run * this.#dayWidth())}px`);
      el.style.setProperty('inline-size', `${String((end - run) * this.#dayWidth())}px`);
      nodes.push(el);
      run = -1;
    };
    for (let i = 0; i < this.#range.days; i++) {
      const working = this.#calendar.isWorkingDay(fromEpochDay(origin + i));
      if (!working && run < 0) run = i;
      if (working) flush(i);
    }
    flush(this.#range.days);
    this.#shade.replaceChildren(...nodes);
  }

  /** Rows (and their bars) in the scrolled window; rows have a fixed height. */
  #renderRows(): void {
    const c = this.#config();
    const doc = this.#doc;
    const rowHeight = c.rowHeight;
    const headHeight = this.#head.offsetHeight;
    const top = Math.max(0, this.#body.scrollTop - headHeight);
    const viewport = this.#body.clientHeight || rowHeight * 40;
    const first = Math.max(0, Math.floor(top / rowHeight) - OVERSCAN);
    const last = Math.min(this.#visible.length, Math.ceil((top + viewport) / rowHeight) + OVERSCAN);
    const ids = this.#visible.slice(first, last);
    const focusIndex = this.#focusId === null ? -1 : this.#visible.indexOf(this.#focusId);
    // The focused row stays rendered so the roving tab stop survives scrolling.
    if (focusIndex >= 0 && (focusIndex < first || focusIndex >= last) && this.#focusId !== null) ids.push(this.#focusId);
    const keep = new Set(ids);
    const hadFocus = this.element.contains(doc.activeElement);
    const focused = doc.activeElement;
    for (const [id, r] of this.#rowEls) {
      if (keep.has(id)) continue;
      r.row.remove();
      r.bar.remove();
      this.#rowEls.delete(id);
    }
    for (const id of ids) {
      const r = this.#rowEls.get(id) ?? this.#createRow(id);
      this.#paintRow(r, id, this.#visible.indexOf(id), c);
    }
    // Rows are kept in reading order in the DOM.
    const ordered = ids.map((id) => this.#rowEls.get(id)?.row).filter((r): r is HTMLDivElement => r !== undefined).sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex')));
    let before: Element | null = this.#rows.firstElementChild;
    for (const row of ordered) {
      if (row !== before) this.#rows.insertBefore(row, before);
      before = row.nextElementSibling;
    }
    for (const r of this.#rowEls.values()) if (!r.bar.isConnected) this.#bars.append(r.bar);
    if (hadFocus && focused instanceof HTMLElement && focused !== doc.activeElement && focused.isConnected) focused.focus({ preventScroll: true });
    this.#renderLinks(new Set(ids));
    this.#syncTabStops();
    this.#syncToolbar();
  }

  #createRow(id: string): RowEl {
    const doc = this.#doc;
    const row = doc.createElement('div');
    row.className = 'aui-gantt__row';
    row.setAttribute('role', 'row');
    row.dataset.auiTask = id;
    row.tabIndex = -1;
    const cells = new Map<GanttColumnKey, HTMLDivElement>();
    this.#columns().forEach((key, i) => {
      const cell = doc.createElement('div');
      cell.className = `aui-gantt__cell aui-gantt__cell--${key}`;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-colindex', String(i + 1));
      row.append(cell);
      cells.set(key, cell);
    });
    const bar = doc.createElement('div');
    bar.className = 'aui-gantt__bar';
    bar.dataset.auiTask = id;
    const r: RowEl = { row, cells, bar };
    this.#rowEls.set(id, r);
    return r;
  }

  #paintRow(r: RowEl, id: string, index: number, c: Resolved): void {
    const doc = this.#doc;
    const t = this.#byId.get(id);
    const st = this.#schedule.tasks.get(id);
    if (!t || !st) return;
    const row = r.row;
    const depth = this.#depth.get(id) ?? 0;
    const siblings = t.parentId === null ? this.#tasks.filter((x) => x.parentId === null).map((x) => x.id) : (this.#children.get(t.parentId) ?? []);
    row.setAttribute('aria-rowindex', String(index + 2));
    row.setAttribute('aria-level', String(depth + 1));
    row.setAttribute('aria-setsize', String(siblings.length));
    row.setAttribute('aria-posinset', String(siblings.indexOf(id) + 1));
    const summary = this.#children.has(id);
    if (summary) row.setAttribute('aria-expanded', String(this.#expanded.has(id)));
    else row.removeAttribute('aria-expanded');
    row.style.setProperty('inset-block-start', `${String(index * c.rowHeight)}px`);
    const critical = this.#options.showCritical !== false && st.critical;
    row.classList.toggle('aui-gantt__row--summary', summary);
    row.classList.toggle('aui-gantt__row--critical', critical);
    row.classList.toggle('aui-gantt__row--link-source', this.#linkFrom === id);
    const locale = c.locale;
    for (const [key, cell] of r.cells) {
      switch (key) {
        case 'name': {
          cell.style.setProperty('--aui-gantt-depth', String(depth));
          const toggle = doc.createElement('span');
          toggle.className = 'aui-gantt__toggle';
          toggle.setAttribute('aria-hidden', 'true');
          if (summary) toggle.append(renderIcon(this.#expanded.has(id) ? 'chevron-down' : c.direction === 'rtl' ? 'chevron-left' : 'chevron-right', { doc }));
          const name = doc.createElement('span');
          name.className = 'aui-gantt__name';
          name.textContent = t.label;
          const parts: Node[] = [toggle, name];
          if (st.milestone) {
            // A diamond marks milestones visually; the word is read by screen readers.
            const mark = doc.createElement('span');
            mark.className = 'aui-gantt__milestone-mark';
            mark.setAttribute('aria-hidden', 'true');
            const word = doc.createElement('span');
            word.className = 'aui-gantt__hidden';
            word.textContent = ` ${this.#msg('milestone')}`;
            parts.splice(1, 0, mark);
            parts.push(word);
          }
          if (critical) parts.push(this.#badge(this.#msg('critical'), 'critical'));
          const extra = this.#rowDescription(t, st);
          if (extra !== '') {
            const hidden = doc.createElement('span');
            hidden.className = 'aui-gantt__hidden';
            hidden.textContent = ` ${extra}`;
            parts.push(hidden);
          }
          cell.replaceChildren(...parts);
          break;
        }
        // Short dates fit the grid; announcements use the medium style.
        case 'start':
          cell.textContent = this.#date(st.start, 'short');
          break;
        case 'end':
          cell.textContent = this.#date(st.end, 'short');
          break;
        case 'duration':
          cell.textContent = this.#plural('days', st.duration);
          break;
        case 'progress':
          cell.textContent = t.progress === undefined ? '' : formatNumber(t.progress / 100, { style: 'percent', maximumFractionDigits: 0 }, locale);
          break;
        case 'resources': {
          const names = (t.assignments ?? []).map((a) => {
            const res = this.#options.resources?.find((x) => x.id === a.resourceId);
            const label = res?.label ?? a.resourceId;
            return a.units !== undefined && a.units !== 100 ? `${label} (${formatNumber(a.units / 100, { style: 'percent' }, locale)})` : label;
          });
          cell.textContent = names.join(', ');
          break;
        }
        case 'float':
          cell.textContent = summary ? '' : this.#plural('days', st.totalFloat);
          break;
      }
    }
    this.#paintBar(r.bar, t, st, index, c, critical);
  }

  #badge(text: string, kind: string): HTMLSpanElement {
    const b = this.#doc.createElement('span');
    b.className = `aui-gantt__badge aui-gantt__badge--${kind}`;
    b.textContent = text;
    return b;
  }

  /** Dependencies and baseline variance as text (the bars show them visually). */
  #rowDescription(t: GanttTask, st: GanttScheduledTask): string {
    const parts: string[] = [];
    const incoming = this.#deps.filter((d) => d.to === t.id);
    const describe = (d: GanttDependency): string => {
      const task = this.#byId.get(d.from)?.label ?? d.from;
      const type = this.#msg(`type${d.type ?? 'FS'}`);
      const lag = d.lag ?? 0;
      return lag === 0 ? this.#msg('dependency', { task, type }) : this.#msg('dependencyLag', { task, type, lag: this.#plural('days', lag) });
    };
    if (incoming.length > 0) parts.push(this.#msg('predecessors', { list: incoming.map(describe).join(', ') }));
    if (st.violations.length > 0) parts.push(this.#msg('violated', { list: this.#deps.filter((d) => st.violations.includes(d.id)).map(describe).join(', ') }));
    if (st.variance !== null && this.#options.showBaselines !== false) {
      if (st.variance > 0) parts.push(this.#plural('behind', st.variance));
      else if (st.variance < 0) parts.push(this.#plural('ahead', -st.variance));
      else parts.push(this.#msg('onBaseline'));
    }
    return parts.join(' ');
  }

  #paintBar(bar: HTMLDivElement, t: GanttTask, st: GanttScheduledTask, index: number, c: Resolved, critical: boolean): void {
    const doc = this.#doc;
    const x = this.#x(st.start);
    const w = st.milestone ? 0 : this.#x(st.end) + this.#dayWidth() - x;
    bar.className = `aui-gantt__bar aui-gantt__bar--c${String(t.color ?? 1)}`;
    bar.classList.toggle('aui-gantt__bar--summary', st.summary);
    bar.classList.toggle('aui-gantt__bar--milestone', st.milestone);
    bar.classList.toggle('aui-gantt__bar--critical', critical);
    bar.classList.toggle('aui-gantt__bar--manual', t.manual === true);
    bar.classList.toggle('aui-gantt__bar--editable', this.editable && this.#canEdit(t.id));
    bar.classList.toggle('aui-gantt__bar--focus', this.#focusId === t.id);
    bar.classList.toggle('aui-gantt__bar--link-source', this.#linkFrom === t.id);
    const s = bar.style;
    s.setProperty('inset-block-start', `${String(index * c.rowHeight)}px`);
    s.setProperty('inset-inline-start', `${String(x)}px`);
    s.setProperty('--aui-gantt-width', `${String(w)}px`);
    s.setProperty('--aui-gantt-progress', `${String(t.progress ?? 0)}%`);
    const parts: HTMLElement[] = [];
    const fill = doc.createElement('span');
    fill.className = 'aui-gantt__fill';
    parts.push(fill);
    if (!st.summary && !st.milestone) {
      const progress = doc.createElement('span');
      progress.className = 'aui-gantt__progress';
      fill.append(progress);
    }
    const text = doc.createElement('span');
    text.className = 'aui-gantt__bar-label';
    text.textContent = t.label;
    parts.push(text);
    if (this.editable && this.#canEdit(t.id)) {
      if (!st.milestone) {
        const resize = doc.createElement('span');
        resize.className = 'aui-gantt__resize';
        parts.push(resize);
      }
      const link = doc.createElement('span');
      link.className = 'aui-gantt__link-handle';
      parts.push(link);
    }
    if (t.baseline && this.#options.showBaselines !== false) {
      const b = doc.createElement('span');
      b.className = 'aui-gantt__baseline';
      const bx = this.#x(t.baseline.start) - x;
      b.style.setProperty('inset-inline-start', `${String(bx)}px`);
      b.style.setProperty('inline-size', `${String(this.#x(t.baseline.end) + this.#dayWidth() - this.#x(t.baseline.start))}px`);
      parts.push(b);
    }
    bar.replaceChildren(...parts);
  }

  #renderLinks(rendered: ReadonlySet<string>): void {
    const doc = this.#doc;
    const c = this.#config();
    const rowOf = new Map(this.#visible.map((id, i) => [id, i]));
    const paths: SVGElement[] = [];
    const defs = doc.createElementNS(SVG, 'defs');
    const marker = doc.createElementNS(SVG, 'marker');
    const markerId = `${this.#help.id}-arrow`;
    marker.setAttribute('id', markerId);
    marker.setAttribute('viewBox', '0 0 8 8');
    marker.setAttribute('refX', '7');
    marker.setAttribute('refY', '4');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '8');
    marker.setAttribute('orient', 'auto-start-reverse');
    const tip = doc.createElementNS(SVG, 'path');
    tip.setAttribute('d', 'M0,0 L8,4 L0,8 z');
    tip.classList.add('aui-gantt__arrow');
    marker.append(tip);
    defs.append(marker);
    paths.push(defs);
    const half = c.rowHeight / 2;
    for (const d of this.#deps) {
      const a = rowOf.get(d.from);
      const b = rowOf.get(d.to);
      if (a === undefined || b === undefined) continue;
      if (!rendered.has(d.from) && !rendered.has(d.to)) continue;
      const pa = this.#schedule.tasks.get(d.from);
      const pb = this.#schedule.tasks.get(d.to);
      if (!pa || !pb) continue;
      const type = d.type ?? 'FS';
      const startOf = (st: GanttScheduledTask): number => this.#x(st.start);
      const endOf = (st: GanttScheduledTask): number => (st.milestone ? this.#x(st.start) : this.#x(st.end) + this.#dayWidth());
      const x1 = type === 'FS' || type === 'FF' ? endOf(pa) : startOf(pa);
      const x2 = type === 'FS' || type === 'SS' ? startOf(pb) : endOf(pb);
      const y1 = a * c.rowHeight + half;
      const y2 = b * c.rowHeight + half;
      const toEnd = type === 'FF' || type === 'SF';
      const out = type === 'FS' || type === 'FF' ? 8 : -8;
      const into = toEnd ? 8 : -8;
      let dPath: string;
      if (!toEnd && x2 + into >= x1 + out && type === 'FS') dPath = `M${String(x1)},${String(y1)} H${String(x2 - 6)} V${String(y2)} H${String(x2)}`;
      else {
        const mid = y1 + (y2 > y1 ? half : -half);
        dPath = `M${String(x1)},${String(y1)} H${String(x1 + out)} V${String(mid)} H${String(x2 + into)} V${String(y2)} H${String(x2)}`;
      }
      const p = doc.createElementNS(SVG, 'path');
      p.setAttribute('d', dPath);
      p.setAttribute('marker-end', `url(#${markerId})`);
      p.classList.add('aui-gantt__dependency');
      if (this.#options.showCritical !== false && pa.critical && pb.critical) p.classList.add('aui-gantt__dependency--critical');
      if (pb.violations.includes(d.id)) p.classList.add('aui-gantt__dependency--violated');
      paths.push(p);
    }
    this.#links.replaceChildren(...paths);
  }

  #renderHistogram(c: Resolved): void {
    const doc = this.#doc;
    const resources = this.#options.resources ?? [];
    const show = this.#options.showHistogram === true && resources.length > 0;
    this.#histogram.hidden = !show;
    if (!show) {
      this.#histogram.replaceChildren();
      return;
    }
    const loads = this.resourceLoad();
    const width = this.#range.days * this.#dayWidth();
    const heading = doc.createElement('div');
    heading.className = 'aui-gantt__histogram-title';
    heading.setAttribute('role', 'heading');
    heading.setAttribute('aria-level', '3');
    heading.textContent = this.#msg('histogram');
    const rows = loads.map((load) => {
      const res = resources.find((r) => r.id === load.resourceId);
      const row = doc.createElement('div');
      row.className = 'aui-gantt__load-row';
      const label = doc.createElement('div');
      label.className = 'aui-gantt__load-label';
      const name = doc.createElement('span');
      name.className = 'aui-gantt__load-name';
      name.textContent = res?.label ?? load.resourceId;
      const summary = doc.createElement('span');
      summary.className = 'aui-gantt__load-summary';
      summary.textContent = load.peak === 0 ? this.#msg('noLoad') : this.#msg('load', { peak: formatNumber(load.peak / 100, { style: 'percent' }, c.locale), over: this.#plural('overDays', load.overDays) });
      label.append(name, summary);
      const track = doc.createElement('div');
      track.className = 'aui-gantt__load-track';
      track.setAttribute('aria-hidden', 'true');
      track.style.setProperty('inline-size', `${String(width)}px`);
      for (const day of load.days) {
        if (day.load === 0) continue;
        const col = doc.createElement('span');
        col.className = `aui-gantt__load${day.over ? ' aui-gantt__load--over' : ''}`;
        col.style.setProperty('inset-inline-start', `${String(this.#x(day.date))}px`);
        col.style.setProperty('--aui-gantt-load', String(Math.min(2, day.load / day.capacity)));
        track.append(col);
      }
      row.append(label, track);
      return row;
    });
    this.#histogram.replaceChildren(heading, ...rows);
  }

  // ---- focus and keyboard ----------------------------------------------------------------------

  #syncTabStops(): void {
    for (const [id, r] of this.#rowEls) {
      r.row.tabIndex = id === this.#focusId ? 0 : -1;
      r.bar.classList.toggle('aui-gantt__bar--focus', id === this.#focusId);
    }
  }

  #scrollRowIntoView(id: string): void {
    const index = this.#visible.indexOf(id);
    if (index < 0) return;
    const rowHeight = this.#config().rowHeight;
    const head = this.#head.offsetHeight;
    const top = index * rowHeight;
    const view = this.#body.clientHeight - head;
    if (top < this.#body.scrollTop) this.#body.scrollTop = top;
    else if (top + rowHeight > this.#body.scrollTop + view) this.#body.scrollTop = top + rowHeight - view;
    this.#renderRows();
  }

  #focusRow(id: string): void {
    this.#focusId = id;
    if (!this.#rowEls.has(id)) this.#renderRows();
    this.#scrollRowIntoView(id);
    this.#syncTabStops();
    this.#syncToolbar();
    this.#rowEls.get(id)?.row.focus({ preventScroll: true });
  }

  #onKey(e: KeyboardEvent): void {
    const row = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[role="row"][data-aui-task]') : null;
    const id = row?.dataset.auiTask;
    if (id === undefined || row !== e.target) return;
    const index = this.#visible.indexOf(id);
    const rtl = this.#config().direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (this.editable) {
      if (matchesHotkey(e, 'mod+z')) {
        e.preventDefault();
        this.undo();
        return;
      }
      if (matchesHotkey(e, 'mod+shift+z') || matchesHotkey(e, 'mod+y')) {
        e.preventDefault();
        this.redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        this.#nudge(id, e.key === forward ? 1 : -1);
        return;
      }
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        this.#resizeBy(id, e.key === forward ? 1 : -1);
        return;
      }
      if (e.key === 'Escape' && this.#linkFrom !== null) {
        e.preventDefault();
        e.stopPropagation();
        this.#cancelLink();
        return;
      }
    }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const page = Math.max(1, Math.floor((this.#body.clientHeight - this.#head.offsetHeight) / this.#config().rowHeight) - 1);
    const go = (i: number): void => {
      const target = this.#visible[Math.max(0, Math.min(this.#visible.length - 1, i))];
      if (target !== undefined) this.#focusRow(target);
    };
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        go(index + 1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        go(index - 1);
        return;
      case 'PageDown':
        e.preventDefault();
        go(index + page);
        return;
      case 'PageUp':
        e.preventDefault();
        go(index - page);
        return;
      case 'Home':
        e.preventDefault();
        go(0);
        return;
      case 'End':
        e.preventDefault();
        go(this.#visible.length - 1);
        return;
      case 'Enter': {
        e.preventDefault();
        if (this.#linkFrom !== null) this.#finishLink(id);
        else this.#activate(id);
        return;
      }
    }
    if (e.key === forward) {
      e.preventDefault();
      if (!this.#children.has(id)) return;
      if (!this.#expanded.has(id)) this.setExpanded(id, true);
      else {
        const child = this.#children.get(id)?.[0];
        if (child !== undefined) this.#focusRow(child);
      }
      return;
    }
    if (e.key === back) {
      e.preventDefault();
      if (this.#expanded.has(id)) this.setExpanded(id, false);
      else {
        const parent = this.#byId.get(id)?.parentId ?? null;
        if (parent !== null) this.#focusRow(parent);
      }
    }
  }

  #activate(id: string): void {
    const t = this.#byId.get(id);
    if (!t) return;
    const detail: GanttTaskActivateDetail = { id, task: copyTask(t) };
    emit(this.host, 'aui-task-activate', detail);
  }

  #onClick(e: MouseEvent): void {
    const t = e.target instanceof Element ? e.target : null;
    const el = t?.closest<HTMLElement>('[data-aui-task]');
    const id = el?.dataset.auiTask;
    if (id === undefined) return;
    if (this.#linkFrom !== null) {
      this.#finishLink(id);
      this.#focusRow(id);
      return;
    }
    if (el?.getAttribute('role') === 'row' && t?.closest('.aui-gantt__toggle')) {
      this.setExpanded(id, !this.#expanded.has(id));
      this.#focusRow(id);
      return;
    }
    this.#focusRow(id);
  }

  // ---- pointer ------------------------------------------------------------------------------------

  #canStartDrag(e: PointerEvent): boolean {
    if (!this.editable || this.#drag !== null) return false;
    const t = e.target instanceof Element ? e.target : null;
    const bar = t?.closest<HTMLElement>('.aui-gantt__bar');
    const id = bar?.dataset.auiTask;
    if (id === undefined) return false;
    const mode = t?.closest('.aui-gantt__link-handle') ? 'link' : t?.closest('.aui-gantt__resize') ? 'resize' : 'move';
    if (mode !== 'link' && !this.#canEdit(id)) return false;
    if (mode === 'link' && this.#children.has(id)) return false;
    const origin = this.#schedule.tasks.get(id);
    if (!origin) return false;
    this.#drag = { id, mode, origin, target: null };
    return true;
  }

  #dragMove(move: DragMove): void {
    const drag = this.#drag;
    if (!drag) return;
    const bar = this.#rowEls.get(drag.id)?.bar;
    if (!bar) return;
    bar.classList.add('aui-gantt__bar--dragging');
    const rtl = this.#config().direction === 'rtl';
    const dx = rtl ? -move.dx : move.dx;
    if (drag.mode === 'move') bar.style.setProperty('translate', `${String(move.dx)}px 0`);
    else if (drag.mode === 'resize') {
      const width = drag.origin.milestone ? 0 : this.#x(drag.origin.end) + this.#dayWidth() - this.#x(drag.origin.start);
      bar.style.setProperty('--aui-gantt-width', `${String(Math.max(this.#dayWidth(), width + dx))}px`);
    } else {
      const under = this.#doc.elementsFromPoint(move.point.x, move.point.y).map((n) => n.closest<HTMLElement>('.aui-gantt__bar')).find((n) => n !== null && n !== bar);
      const target = under?.dataset.auiTask ?? null;
      if (target !== drag.target) {
        if (drag.target !== null) this.#rowEls.get(drag.target)?.bar.classList.remove('aui-gantt__bar--drop', 'aui-gantt__bar--no-drop');
        drag.target = target;
        if (target !== null) {
          const ok = !this.#children.has(target) && !createsCycle(this.#deps, drag.id, target) && this.#canEdit(target);
          this.#rowEls.get(target)?.bar.classList.add(ok ? 'aui-gantt__bar--drop' : 'aui-gantt__bar--no-drop');
        }
      }
      bar.style.setProperty('--aui-gantt-link-x', `${String(dx)}px`);
      bar.style.setProperty('--aui-gantt-link-y', `${String(move.dy)}px`);
    }
  }

  #dragEnd(move: DragMove): void {
    const drag = this.#drag;
    this.#dragCancel();
    if (!drag) return;
    const rtl = this.#config().direction === 'rtl';
    const dx = rtl ? -move.dx : move.dx;
    const days = Math.round(dx / this.#dayWidth());
    if (drag.mode === 'move') {
      if (days === 0) return;
      const start = fromEpochDay(epochDay(drag.origin.start) + days);
      this.#change('move', [{ id: drag.id, start: this.#index.date(this.#index.index(start)) }]);
    } else if (drag.mode === 'resize') {
      if (days === 0) return;
      const end = fromEpochDay(epochDay(drag.origin.end) + days);
      const duration = Math.max(1, this.#index.indexBefore(end) - this.#index.index(drag.origin.start) + 1);
      if (duration !== this.#byId.get(drag.id)?.duration) this.#change('resize', [{ id: drag.id, duration }]);
    } else if (drag.target !== null) this.#link(drag.id, drag.target);
  }

  #dragCancel(): void {
    const drag = this.#drag;
    this.#drag = null;
    if (!drag) return;
    const bar = this.#rowEls.get(drag.id)?.bar;
    if (bar) {
      bar.classList.remove('aui-gantt__bar--dragging');
      bar.style.removeProperty('translate');
      bar.style.removeProperty('--aui-gantt-link-x');
      bar.style.removeProperty('--aui-gantt-link-y');
      const st = this.#schedule.tasks.get(drag.id);
      if (st) bar.style.setProperty('--aui-gantt-width', `${String(st.milestone ? 0 : this.#x(st.end) + this.#dayWidth() - this.#x(st.start))}px`);
    }
    if (drag.target !== null) this.#rowEls.get(drag.target)?.bar.classList.remove('aui-gantt__bar--drop', 'aui-gantt__bar--no-drop');
  }
}
