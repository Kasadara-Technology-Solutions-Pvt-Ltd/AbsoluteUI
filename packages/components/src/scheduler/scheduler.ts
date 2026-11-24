/**
 * Scheduler (SPEC section 18.19: Scheduler, Calendar Scheduler, Timeline Scheduler).
 * Day, week, work-week, month, agenda, and resource timeline views of events,
 * with recurring series (RRULE subset, section 8.3), timezone-aware wall-clock layout
 * (section 8), business hours and holidays from a Business Calendar definition, and
 * editing: pointer drag to move or resize, Ctrl/Cmd+X then Ctrl/Cmd+V to move,
 * Shift+Arrow keys to resize, and toolbar buttons for single-pointer use; changes
 * to recurring events apply to one occurrence, this and following, or the series.
 * Events come from `events` or from `loadEvents` by visible range (cancellable,
 * timed out, validated).
 *
 * Every view except the agenda is a WAI-ARIA grid with one roving tab stop over
 * its cells (days or time slots); events are buttons inside the cell where they
 * start. Enter moves into a cell's events and Escape returns; Enter on an empty
 * cell (or Shift+Enter anywhere) asks the application to create an event.
 */
import {
  addDays,
  addMonths,
  comparePlainDate,
  configurationError,
  createId,
  dayOfWeek,
  daysInMonth,
  defineComponentConfig,
  describeRecurrence,
  DisposableGroup,
  emit,
  formatInstant,
  formatNumber,
  formatPlainDate,
  formatPlainTime,
  getFirstDayOfWeek,
  getMessage,
  instant,
  now,
  plainDate,
  plainDatesEqual,
  plainDateTime,
  plainDateToString,
  plainTime,
  registerMessages,
  toInstant,
  toPlainDateTime,
  validators,
  type Disambiguation,
  type Direction,
  type Instant,
  type IsoWeekday,
  type PlainDate,
  type PlainDateTime,
  releaseNodes,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, matchesHotkey, observeResize, trackPointerDrag, type PointerDrag } from '@absoluteui/utilities';
import { createBusinessCalendar, type BusinessCalendarDefinition, type BusinessCalendarEngine } from '../business-calendar/engine.js';
import { Dialog } from '../dialog/dialog.js';
import { packColumns, packLanes } from './layout.js';
import {
  applyEdit,
  assertEvents,
  assertResources,
  copyEvent,
  daysBetween,
  expandEvents,
  minutesOf,
  startKey,
  startOfDay,
  type SchedulerEditScope,
  type SchedulerEvent,
  type SchedulerEventChanges,
  type SchedulerOccurrence,
  type SchedulerResource,
} from './model.js';

export type SchedulerView = 'day' | 'week' | 'workWeek' | 'month' | 'agenda' | 'timeline';
export type SchedulerTimelineScale = 'day' | 'week' | 'month';

export interface SchedulerConfig {
  /** Minutes per time slot (rows of day and week views, columns of the day timeline). */
  slotDuration: 15 | 30 | 60;
  /** Minutes moves and resizes snap to. */
  snapDuration: number;
  /** First and last (exclusive) hour shown in time views. */
  dayStartHour: number;
  dayEndHour: number;
  /** Hour scrolled into view when a time view opens. */
  scrollToHour: number;
  /** Rows of events per month cell before "+N more". */
  monthEventLimit: number;
  /** Days listed by the agenda view. */
  agendaDays: number;
  timelineScale: SchedulerTimelineScale;
  /** `loadEvents` timeout in milliseconds. */
  requestTimeoutMs: number;
  /** Undo depth (0 disables undo). */
  historyLimit: number;
}

type Inherited = 'locale' | 'timezone' | 'disambiguation' | 'direction';
type Resolved = Readonly<SchedulerConfig & { locale: string; timezone: string; disambiguation: Disambiguation; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    scheduler: SchedulerConfig & { locale: string; timezone: string; disambiguation: Disambiguation; direction: Direction };
  }
}

export const schedulerConfig = defineComponentConfig<SchedulerConfig, Inherited>(
  'scheduler',
  {
    slotDuration: { default: 30, expected: '15 | 30 | 60', validate: validators.oneOf([15, 30, 60] as const) },
    snapDuration: { default: 15, expected: '5 | 10 | 15 | 30 | 60', validate: validators.oneOf([5, 10, 15, 30, 60] as const) },
    dayStartHour: { default: 0, expected: 'integer from 0 to 23', validate: validators.integerInRange(0, 23) },
    dayEndHour: { default: 24, expected: 'integer from 1 to 24', validate: validators.integerInRange(1, 24) },
    scrollToHour: { default: 8, expected: 'integer from 0 to 23', validate: validators.integerInRange(0, 23) },
    monthEventLimit: { default: 3, expected: 'integer from 1 to 10', validate: validators.integerInRange(1, 10) },
    agendaDays: { default: 7, expected: 'integer from 1 to 62', validate: validators.integerInRange(1, 62) },
    timelineScale: { default: 'day', expected: '"day" | "week" | "month"', validate: validators.oneOf(['day', 'week', 'month'] as const) },
    requestTimeoutMs: { default: 30_000, expected: 'integer from 100 to 600000 (ms)', validate: validators.integerInRange(100, 600_000) },
    historyLimit: { default: 50, expected: 'integer from 0 to 500', validate: validators.integerInRange(0, 500) },
  },
  ['locale', 'timezone', 'disambiguation', 'direction'],
);

registerMessages('scheduler', 'en', {
  toolbar: '{label} controls',
  today: 'Today',
  previousday: 'Previous day',
  nextday: 'Next day',
  previousweek: 'Previous week',
  nextweek: 'Next week',
  previousworkWeek: 'Previous week',
  nextworkWeek: 'Next week',
  previousmonth: 'Previous month',
  nextmonth: 'Next month',
  previousagenda: 'Previous days',
  nextagenda: 'Next days',
  previoustimeline: 'Previous period',
  nexttimeline: 'Next period',
  views: 'View',
  day: 'Day',
  week: 'Week',
  workWeek: 'Work week',
  month: 'Month',
  agenda: 'Agenda',
  timeline: 'Timeline',
  gridLabel: '{label}, {title}',
  allDay: 'All day',
  time: 'Time',
  resource: 'Resource',
  unassigned: 'Unassigned',
  slot: '{date}, {start} to {end}',
  events: '{count} events',
  oneEvent: '1 event',
  nonWorking: 'non-working time',
  holiday: 'holiday: {name}',
  more: '+{count} more',
  moreLabel: '{count} more events, show {date}',
  range: '{start} to {end}',
  eventAllDay: 'all day',
  repeats: 'repeats {rule}',
  readOnly: 'read-only',
  noEvents: 'No events',
  loading: 'Loading events...',
  loadFailed: 'Events could not be loaded.',
  retry: 'Retry',
  edit: 'Editing',
  cut: 'Move',
  paste: 'Move here',
  shorten: 'Shorten',
  lengthen: 'Lengthen',
  undo: 'Undo',
  redo: 'Redo',
  cutDone: '{title} ready to move. Go to a day or time and press Control V, or Escape to cancel.',
  cutCancelled: 'Move cancelled.',
  moved: '{title} moved to {time}.',
  resized: '{title} now {time}.',
  notAllowed: '{title} cannot be changed.',
  undone: 'Change undone.',
  redone: 'Change redone.',
  recurringTitle: 'Change a recurring event',
  recurringText: '{title} repeats. Which events should change?',
  scopeOccurrence: 'This event',
  scopeFollowing: 'This and following events',
  scopeSeries: 'All events',
  cancel: 'Cancel',
});

export interface SchedulerRange {
  /** First visible moment (local midnight of the first day) and the moment after the last day. */
  readonly start: Instant;
  readonly end: Instant;
  /** First and last visible day (inclusive). */
  readonly startDate: PlainDate;
  readonly endDate: PlainDate;
}

export interface SchedulerRenderContext {
  readonly view: SchedulerView;
  readonly doc: Document;
}

export interface SchedulerIcons {
  previous: IconRef;
  next: IconRef;
}

export interface SchedulerOptions extends Partial<SchedulerConfig> {
  /** Accessible name (grids are named "{label}, {period}"). */
  label: string;
  events?: readonly SchedulerEvent[];
  /**
   * Events of a visible range (honour `signal`). Return single events overlapping
   * it, series masters that may occur in it, and their exceptions.
   */
  loadEvents?: (range: SchedulerRange, signal: AbortSignal) => Promise<readonly SchedulerEvent[]>;
  /** Rows of the timeline view. */
  resources?: readonly SchedulerResource[];
  view?: SchedulerView;
  /** Views offered by the switcher. Default: day, week, work week, month, agenda (plus timeline with resources). */
  views?: readonly SchedulerView[];
  /** A day in the visible period. Default: today. */
  date?: PlainDate;
  /** Move and resize events. Default false. */
  editable?: boolean;
  /** How changes to a recurring occurrence apply. Default 'ask' (a dialog). */
  recurringEditScope?: 'ask' | SchedulerEditScope;
  /** Working days and hours, holidays: work-week days, shading, and header marks. */
  businessCalendar?: BusinessCalendarDefinition;
  firstDayOfWeek?: IsoWeekday;
  /** Id of an event created from `base` (exceptions, split series). Default `{id}~{hint}`. */
  createId?: (base: Readonly<SchedulerEvent>, hint: string) => string;
  /** Event content (non-interactive; the event is the button). */
  renderEvent?: (occurrence: SchedulerOccurrence, context: SchedulerRenderContext) => Node;
  /** Advanced: fixed current time (tests, demos). */
  now?: Instant;
  locale?: string;
  timezone?: string;
  disambiguation?: Disambiguation;
  direction?: Direction;
  icons?: Partial<SchedulerIcons>;
}

/** Detail of `aui-navigate` (view, date, or period changed by the user). */
export interface SchedulerNavigateDetail {
  view: SchedulerView;
  date: PlainDate;
  range: SchedulerRange;
}

/** Detail of `aui-slot-activate`: the application may create an event there. */
export interface SchedulerSlotActivateDetail {
  start: Instant | PlainDate;
  end: Instant | PlainDate;
  allDay: boolean;
  resourceId: string | null;
}

export interface SchedulerEventActivateDetail {
  occurrence: SchedulerOccurrence;
  event: SchedulerEvent;
}

export type SchedulerChangeReason = 'move' | 'resize' | 'undo' | 'redo';

/** Detail of the cancelable `aui-event-change` (dispatched before the change is applied). */
export interface SchedulerEventChangeDetail {
  reason: SchedulerChangeReason;
  /** The edited occurrence (null for undo and redo). */
  occurrence: SchedulerOccurrence | null;
  scope: SchedulerEditScope | null;
  changes: SchedulerEventChanges;
  /** Every event after the change, for saving. */
  events: SchedulerEvent[];
}

export interface SchedulerEventDeleteDetail {
  occurrence: SchedulerOccurrence;
  event: SchedulerEvent;
}

export interface SchedulerLoadErrorDetail {
  range: SchedulerRange;
  error: unknown;
}

interface Cell {
  readonly el: HTMLTableCellElement;
  readonly date: PlainDate;
  /** Slot start in minutes after midnight; null for day cells. */
  readonly minutes: number | null;
  readonly length: number;
  /** Timeline row (null: unassigned); undefined outside the timeline. */
  readonly resourceId: string | null | undefined;
  readonly row: number;
  readonly col: number;
  readonly events: string[];
}

interface Rendered {
  readonly el: HTMLElement;
  readonly occ: SchedulerOccurrence;
  readonly cell: Cell;
  drag: PointerDrag | null;
}

interface Snapshot {
  readonly before: SchedulerEvent[];
  readonly after: SchedulerEvent[];
}

const VIEWS: readonly SchedulerView[] = ['day', 'week', 'workWeek', 'month', 'agenda', 'timeline'];
const MINUTE = 60_000;
const kind = (v: unknown): unknown => (typeof v === 'object' && v !== null ? (v as { kind?: unknown }).kind : undefined);

function fail(property: string, expected: string): never {
  throw configurationError('SCHEDULER_OPTIONS', 'Invalid scheduler options.', { component: 'scheduler', property: `scheduler.${property}`, expected });
}

export class Scheduler {
  readonly host: HTMLElement;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();
  readonly #toolbar: HTMLDivElement;
  readonly #title: HTMLHeadingElement;
  readonly #viewGroup: HTMLDivElement;
  readonly #editGroup: HTMLDivElement;
  readonly #status: HTMLDivElement;
  readonly #body: HTMLDivElement;
  readonly #buttons = new Map<string, HTMLButtonElement>();
  #options: SchedulerOptions;
  #view: SchedulerView;
  #date: PlainDate;
  #events: SchedulerEvent[] = [];
  #occ: SchedulerOccurrence[] = [];
  #occByKey = new Map<string, SchedulerOccurrence>();
  #calendar: BusinessCalendarEngine;
  /** Rows of cells; rows outside the rendered window of a virtual timeline are undefined. */
  #grid: (Cell[] | undefined)[] = [];
  #rendered = new Map<string, Rendered>();
  /** Nodes returned by `renderEvent` in the current render (released on the next full render, D8). */
  #eventContent: Node[] = [];
  #focus = { row: 0, col: 0 };
  #focusEvent: string | null = null;
  #active: string | null = null;
  #anchor: { row: number; col: number } | null = null;
  #cut: string | null = null;
  #history: Snapshot[] = [];
  #future: Snapshot[] = [];
  #cache = new Map<string, SchedulerEvent[]>();
  #loading: AbortController | null = null;
  #loadError = false;
  #scrolled = false;
  #timer: number | null = null;
  #pointerSelect: { anchor: Cell; last: Cell } | null = null;
  #virtual: { top: number; rows: number; heights: number[] } | null = null;
  #dialog: Dialog | null = null;
  #localCache = new Map<string, PlainDateTime>();
  /** False after the period or view changed: focus moves to the new period's default cell. */
  #focusInPeriod = false;

  static create(host: HTMLElement, options: SchedulerOptions): Scheduler {
    return new Scheduler(host, options);
  }

  private constructor(host: HTMLElement, options: SchedulerOptions) {
    Scheduler.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#calendar = createBusinessCalendar(options.businessCalendar ?? {});
    this.#view = options.view ?? 'week';
    this.#date = options.date ?? this.#today();
    if (options.events) this.#events = options.events.map(copyEvent);
    const doc = this.#doc;
    this.#toolbar = doc.createElement('div');
    this.#toolbar.className = 'aui-scheduler__toolbar';
    this.#toolbar.setAttribute('role', 'toolbar');
    const nav = doc.createElement('div');
    nav.className = 'aui-scheduler__nav';
    for (const action of ['today', 'previous', 'next']) nav.append(this.#button(action));
    this.#title = doc.createElement('h2');
    this.#title.className = 'aui-scheduler__title';
    this.#title.id = createId('aui-scheduler-title');
    this.#title.setAttribute('aria-live', 'polite');
    this.#viewGroup = doc.createElement('div');
    this.#viewGroup.className = 'aui-scheduler__views';
    this.#viewGroup.setAttribute('role', 'group');
    this.#editGroup = doc.createElement('div');
    this.#editGroup.className = 'aui-scheduler__edit';
    this.#editGroup.setAttribute('role', 'group');
    for (const action of ['cut', 'paste', 'shorten', 'lengthen', 'undo', 'redo']) this.#editGroup.append(this.#button(action));
    this.#toolbar.append(nav, this.#title, this.#viewGroup, this.#editGroup);
    this.#status = doc.createElement('div');
    this.#status.className = 'aui-scheduler__status';
    this.#status.setAttribute('role', 'status');
    this.#body = doc.createElement('div');
    this.#body.className = 'aui-scheduler__body';
    // Firefox makes scroll containers a Tab stop; the grid keeps the one tab stop and scrolls with
    // keyboard movement, so the scrolling body stays out of the tab order.
    this.#body.tabIndex = -1;
    host.classList.add('aui-scheduler');
    host.replaceChildren(this.#toolbar, this.#status, this.#body);
    this.#render();
    this.#load();

    const g = this.#group;
    g.listen(this.#toolbar, 'click', (e) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button') : null;
      if (b?.dataset.auiAction) this.#action(b.dataset.auiAction, b);
    });
    g.listen(this.#status, 'click', (e) => {
      if (e.target instanceof Element && e.target.closest('button')) this.refresh();
    });
    g.listen(this.#body, 'keydown', (e) => {
      this.#onKey(e);
    });
    g.listen(this.#body, 'click', (e) => {
      this.#onClick(e);
    });
    g.listen(this.#body, 'dblclick', (e) => {
      const cell = this.#cellOf(e.target);
      if (cell && !(e.target instanceof Element && e.target.closest('.aui-scheduler__event, .aui-scheduler__more'))) this.#activateSlot(cell, cell);
    });
    g.listen(this.#body, 'focusin', (e) => {
      this.#onFocusIn(e);
    });
    g.listen(this.#body, 'pointerdown', (e) => {
      this.#onPointerDown(e);
    });
    g.listen(this.#body, 'pointermove', (e) => {
      this.#onPointerMove(e);
    });
    g.listen(this.#doc, 'pointerup', () => {
      this.#onPointerUp();
    });
    g.listen(this.#body, 'scroll', () => {
      if (this.#virtual) this.#renderVirtualRows();
    }, { passive: true });
    g.add(observeResize(this.#body, () => {
      if (this.#virtual) this.#renderVirtualRows();
    }));
    g.add(schedulerConfig.subscribe(() => {
      this.#render();
    }));
    const view = doc.defaultView;
    if (view && options.now === undefined) {
      this.#timer = view.setInterval(() => {
        this.#renderNow();
      }, MINUTE);
      g.add(() => {
        if (this.#timer !== null) view.clearInterval(this.#timer);
      });
    }
    g.add(() => {
      this.#loading?.abort(new DOMException('The scheduler was destroyed.', 'AbortError'));
      this.#dialog?.destroy();
    });
  }

  get view(): SchedulerView {
    return this.#view;
  }

  get date(): PlainDate {
    return this.#date;
  }

  /** The visible range. */
  get range(): SchedulerRange {
    return this.#range();
  }

  /** Every event (copies), for saving. */
  get events(): SchedulerEvent[] {
    return this.#events.map(copyEvent);
  }

  /** Occurrences in the visible range, sorted. */
  get occurrences(): readonly SchedulerOccurrence[] {
    return this.#occ;
  }

  get editable(): boolean {
    return this.#options.editable === true;
  }

  get loading(): boolean {
    return this.#loading !== null;
  }

  get canUndo(): boolean {
    return this.#history.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  /** The business calendar engine used for work weeks and shading. */
  get businessCalendar(): BusinessCalendarEngine {
    return this.#calendar;
  }

  /** The view's grid (or the agenda list) element. */
  get element(): HTMLElement | null {
    return this.#body.firstElementChild instanceof HTMLElement ? this.#body.firstElementChild : null;
  }

  update(options: Partial<SchedulerOptions>): void {
    const next = { ...this.#options, ...options };
    Scheduler.#assert(next);
    this.#options = next;
    if (options.businessCalendar !== undefined) this.#calendar = createBusinessCalendar(options.businessCalendar);
    if (options.view !== undefined) this.#view = options.view;
    if (options.date !== undefined) this.#date = options.date;
    if (options.view !== undefined || options.date !== undefined) this.#focusInPeriod = false;
    if (options.events !== undefined) {
      this.#events = options.events.map(copyEvent);
      this.#history = [];
      this.#future = [];
      this.#cut = null;
    }
    if (options.loadEvents !== undefined) this.#cache.clear();
    this.#render();
    if (options.loadEvents !== undefined || options.view !== undefined || options.date !== undefined) this.#load();
  }

  setView(view: SchedulerView): void {
    if (!VIEWS.includes(view)) fail('setView.view', VIEWS.map((v) => `"${v}"`).join(' | '));
    if (view === this.#view) return;
    this.#view = view;
    this.#scrolled = false;
    this.#focusInPeriod = false;
    this.#render();
    this.#load();
  }

  /** Show the period containing `date`. */
  goTo(date: PlainDate): void {
    if (kind(date) !== 'PlainDate') fail('goTo.date', 'PlainDate');
    this.#date = date;
    this.#focusInPeriod = false;
    this.#render();
    this.#load();
  }

  next(): void {
    this.#shift(1);
  }

  previous(): void {
    this.#shift(-1);
  }

  today(): void {
    this.goTo(this.#today());
  }

  /** Reload the visible range (`loadEvents`), discarding cached ranges. */
  refresh(): void {
    this.#cache.clear();
    this.#load();
  }

  /** Focus the grid's current cell or event. */
  focus(): void {
    this.#focusCurrent();
  }

  /**
   * Move an occurrence (programmatic; emits the cancelable `aui-event-change`).
   * `scope` applies to recurring occurrences (default: this occurrence).
   */
  moveEvent(key: string, start: Instant | PlainDate, options: { resourceId?: string; scope?: SchedulerEditScope } = {}): boolean {
    const occ = this.#occByKey.get(key);
    if (!occ) fail('moveEvent.key', 'a visible occurrence key');
    if (kind(start) !== occ.start.kind) fail('moveEvent.start', occ.allDay ? 'PlainDate' : 'Instant');
    const end = this.#endFor(occ, start);
    return this.#commit(occ, start, end, options.resourceId, 'move', options.scope ?? 'occurrence');
  }

  /** Change an occurrence's end (programmatic; emits `aui-event-change`). */
  resizeEvent(key: string, end: Instant | PlainDate, options: { scope?: SchedulerEditScope } = {}): boolean {
    const occ = this.#occByKey.get(key);
    if (!occ) fail('resizeEvent.key', 'a visible occurrence key');
    if (kind(end) !== occ.end.kind) fail('resizeEvent.end', occ.allDay ? 'PlainDate' : 'Instant');
    return this.#commit(occ, occ.start, end, undefined, 'resize', options.scope ?? 'occurrence');
  }

  undo(): boolean {
    const s = this.#history.pop();
    if (!s) return false;
    if (!this.#emitChange('undo', null, null, s.before)) {
      this.#history.push(s);
      return false;
    }
    this.#future.push(s);
    this.#setEvents(s.before);
    announce(this.#msg('undone'));
    return true;
  }

  redo(): boolean {
    const s = this.#future.pop();
    if (!s) return false;
    if (!this.#emitChange('redo', null, null, s.after)) {
      this.#future.push(s);
      return false;
    }
    this.#history.push(s);
    this.#setEvents(s.after);
    announce(this.#msg('redone'));
    return true;
  }

  destroy(): void {
    this.#group.dispose();
    for (const r of this.#rendered.values()) r.drag?.dispose();
    this.#rendered.clear();
    releaseNodes(this.#eventContent);
    this.#eventContent = [];
    this.host.replaceChildren();
    this.host.classList.remove('aui-scheduler', 'aui-scheduler--editable', `aui-scheduler--${this.#view}`);
  }

  // ---- options -----------------------------------------------------------------

  static #assert(o: SchedulerOptions): void {
    if (!validators.isRecord(o)) fail('options', 'SchedulerOptions');
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    if (o.events !== undefined) assertEvents(o.events, 'events');
    if (o.resources !== undefined) assertResources(o.resources);
    if (o.view !== undefined && !VIEWS.includes(o.view)) fail('view', VIEWS.map((v) => `"${v}"`).join(' | '));
    const views: unknown = o.views;
    if (views !== undefined && !(Array.isArray(views) && views.length > 0 && views.every((v) => VIEWS.includes(v as SchedulerView)))) fail('views', 'non-empty SchedulerView[]');
    if (o.date !== undefined && kind(o.date) !== 'PlainDate') fail('date', 'PlainDate');
    if (o.now !== undefined && kind(o.now) !== 'Instant') fail('now', 'Instant');
    if (o.editable !== undefined && typeof o.editable !== 'boolean') fail('editable', 'boolean');
    if (o.recurringEditScope !== undefined && !['ask', 'occurrence', 'following', 'series'].includes(o.recurringEditScope)) fail('recurringEditScope', '"ask" | "occurrence" | "following" | "series"');
    for (const key of ['loadEvents', 'createId', 'renderEvent'] as const) if (o[key] !== undefined && typeof o[key] !== 'function') fail(key, 'function');
    if (o.firstDayOfWeek !== undefined && !validators.integerInRange(1, 7)(o.firstDayOfWeek)) fail('firstDayOfWeek', 'integer 1 (Monday) to 7 (Sunday)');
    if (o.businessCalendar !== undefined) createBusinessCalendar(o.businessCalendar);
    const c = schedulerConfig.resolve(Scheduler.#configInput(o));
    if (c.dayEndHour <= c.dayStartHour) fail('dayEndHour', 'greater than dayStartHour');
  }

  static #configInput(o: SchedulerOptions): Partial<Resolved> {
    const input: Record<string, unknown> = {};
    for (const key of ['slotDuration', 'snapDuration', 'dayStartHour', 'dayEndHour', 'scrollToHour', 'monthEventLimit', 'agendaDays', 'timelineScale', 'requestTimeoutMs', 'historyLimit', 'locale', 'timezone', 'disambiguation', 'direction'] as const) {
      if (o[key] !== undefined) input[key] = o[key];
    }
    return input;
  }

  #config(): Resolved {
    return schedulerConfig.resolve(Scheduler.#configInput(this.#options));
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('scheduler', key, params, this.#config().locale);
  }

  #now(): Instant {
    return this.#options.now ?? now();
  }

  #today(): PlainDate {
    return toPlainDateTime(this.#now(), this.#config().timezone).date;
  }

  #views(): readonly SchedulerView[] {
    const o = this.#options;
    if (o.views) return o.views;
    const base: SchedulerView[] = ['day', 'week', 'workWeek', 'month', 'agenda'];
    if (o.resources && o.resources.length > 0) base.push('timeline');
    return base;
  }

  #firstDay(): number {
    return this.#options.firstDayOfWeek ?? getFirstDayOfWeek(this.#config().locale);
  }

  // ---- ranges ----------------------------------------------------------------------

  #weekStart(date: PlainDate): PlainDate {
    return addDays(date, -((dayOfWeek(date) - this.#firstDay() + 7) % 7));
  }

  /** Visible days of the current view. */
  #days(view = this.#view, date = this.#date): PlainDate[] {
    const c = this.#config();
    switch (view) {
      case 'day':
        return [date];
      case 'week':
        return Array.from({ length: 7 }, (_, i) => addDays(this.#weekStart(date), i));
      case 'workWeek': {
        const working = new Set<number>(this.#calendar.definition.workingDays);
        const days = Array.from({ length: 7 }, (_, i) => addDays(this.#weekStart(date), i)).filter((d) => working.has(dayOfWeek(d)));
        return days.length > 0 ? days : Array.from({ length: 5 }, (_, i) => addDays(this.#weekStart(date), i));
      }
      case 'month': {
        const first = plainDate(date.year, date.month, 1);
        const start = this.#weekStart(first);
        const weeks = Math.ceil((daysBetween(start, first) + daysInMonth(date.year, date.month)) / 7);
        return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
      }
      case 'agenda':
        return Array.from({ length: c.agendaDays }, (_, i) => addDays(date, i));
      case 'timeline':
        if (c.timelineScale === 'day') return [date];
        if (c.timelineScale === 'week') return Array.from({ length: 7 }, (_, i) => addDays(this.#weekStart(date), i));
        return Array.from({ length: daysInMonth(date.year, date.month) }, (_, i) => plainDate(date.year, date.month, i + 1));
    }
  }

  #range(): SchedulerRange {
    const days = this.#days();
    const c = this.#config();
    const startDate = days[0] ?? this.#date;
    const endDate = days[days.length - 1] ?? this.#date;
    return Object.freeze({ start: startOfDay(startDate, c.timezone, c.disambiguation), end: startOfDay(addDays(endDate, 1), c.timezone, c.disambiguation), startDate, endDate });
  }

  #shift(delta: 1 | -1): void {
    const c = this.#config();
    let date: PlainDate;
    switch (this.#view) {
      case 'day':
        date = addDays(this.#date, delta);
        break;
      case 'week':
      case 'workWeek':
        date = addDays(this.#date, 7 * delta);
        break;
      case 'month':
        date = addMonths(this.#date, delta);
        break;
      case 'agenda':
        date = addDays(this.#date, c.agendaDays * delta);
        break;
      case 'timeline':
        date = c.timelineScale === 'day' ? addDays(this.#date, delta) : c.timelineScale === 'week' ? addDays(this.#date, 7 * delta) : addMonths(this.#date, delta);
        break;
    }
    this.#date = date;
    this.#focusInPeriod = false;
    this.#render();
    this.#load();
    this.#emitNavigate();
  }

  #emitNavigate(): void {
    emit(this.host, 'aui-navigate', { view: this.#view, date: this.#date, range: this.#range() } satisfies SchedulerNavigateDetail);
  }

  // ---- data --------------------------------------------------------------------------

  #rangeKey(r: SchedulerRange): string {
    return `${String(r.start.epochMilliseconds)}|${String(r.end.epochMilliseconds)}`;
  }

  #load(): void {
    const loader = this.#options.loadEvents;
    if (!loader) return;
    const range = this.#range();
    const key = this.#rangeKey(range);
    const cached = this.#cache.get(key);
    this.#loading?.abort(new DOMException('A newer range was requested.', 'AbortError'));
    this.#loading = null;
    if (cached) {
      this.#events = cached;
      this.#loadError = false;
      this.#render();
      return;
    }
    const controller = new AbortController();
    this.#loading = controller;
    this.#loadError = false;
    this.#renderStatus();
    const view = this.#doc.defaultView ?? window;
    const timer = view.setTimeout(() => {
      controller.abort(new DOMException('Loading events timed out.', 'TimeoutError'));
    }, this.#config().requestTimeoutMs);
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(controller.signal.reason instanceof Error ? controller.signal.reason : new Error('aborted'));
      }, { once: true });
    });
    void Promise.race([loader(range, controller.signal), aborted])
      .then((events) => {
        if (this.#loading !== controller) return;
        assertEvents(events, 'loadEvents()', 'SCHEDULER_DATA_SOURCE');
        const list = events.map(copyEvent);
        this.#cache.set(key, list);
        this.#events = list;
        this.#loading = null;
        this.#render();
      })
      .catch((error: unknown) => {
        if (this.#loading !== controller || this.#group.disposed) return;
        this.#loading = null;
        this.#loadError = true;
        this.#render();
        announce(this.#msg('loadFailed'), 'assertive');
        emit(this.host, 'aui-load-error', { range, error } satisfies SchedulerLoadErrorDetail);
      })
      .finally(() => {
        view.clearTimeout(timer);
      });
  }

  #setEvents(events: SchedulerEvent[]): void {
    this.#events = events;
    if (this.#options.loadEvents) {
      // Other cached ranges may hold stale copies of the edited events.
      const key = this.#rangeKey(this.#range());
      this.#cache.clear();
      this.#cache.set(key, events);
    }
    this.#render();
  }

  // ---- toolbar -------------------------------------------------------------------------

  #button(action: string): HTMLButtonElement {
    const b = this.#doc.createElement('button');
    b.type = 'button';
    b.className = `aui-scheduler__button aui-scheduler__button--${action}`;
    b.dataset.auiAction = action;
    this.#buttons.set(action, b);
    return b;
  }

  #renderToolbar(c: Resolved): void {
    const doc = this.#doc;
    const o = this.#options;
    const rtl = c.direction === 'rtl';
    this.#toolbar.setAttribute('aria-label', this.#msg('toolbar', { label: o.label }));
    const set = (action: string, text: string, icon: IconRef | null, iconOnly = false): void => {
      const b = this.#buttons.get(action);
      if (!b) return;
      const nodes: Node[] = [];
      if (icon) nodes.push(renderIcon(icon, { doc }));
      const span = doc.createElement('span');
      span.textContent = text;
      if (iconOnly) span.className = 'aui-visually-hidden';
      nodes.push(span);
      b.replaceChildren(...nodes);
      if (iconOnly) b.title = text;
    };
    set('today', this.#msg('today'), null);
    set('previous', this.#msg(`previous${this.#view}`), o.icons?.previous ?? (rtl ? 'chevron-right' : 'chevron-left'), true);
    set('next', this.#msg(`next${this.#view}`), o.icons?.next ?? (rtl ? 'chevron-left' : 'chevron-right'), true);
    this.#title.textContent = this.#titleText(c);
    this.#viewGroup.setAttribute('aria-label', this.#msg('views'));
    const views = this.#views();
    const buttons = views.map((v) => {
      let b = this.#buttons.get(`view:${v}`);
      if (!b) {
        b = this.#button(`view:${v}`);
        b.classList.add('aui-scheduler__view');
      }
      b.textContent = this.#msg(v);
      b.setAttribute('aria-pressed', String(v === this.#view));
      return b;
    });
    this.#viewGroup.replaceChildren(...buttons);
    this.#viewGroup.hidden = views.length < 2;
    this.#editGroup.hidden = !this.editable;
    this.#editGroup.setAttribute('aria-label', this.#msg('edit'));
    set('cut', this.#msg('cut'), 'grip');
    set('paste', this.#msg('paste'), 'check');
    set('shorten', this.#msg('shorten'), 'minus');
    set('lengthen', this.#msg('lengthen'), 'plus');
    set('undo', this.#msg('undo'), 'undo', true);
    set('redo', this.#msg('redo'), 'redo', true);
    this.#syncEditButtons();
  }

  #syncEditButtons(): void {
    const set = (action: string, disabled: boolean): void => {
      // aria-disabled keeps the buttons focusable and discoverable.
      this.#buttons.get(action)?.setAttribute('aria-disabled', String(disabled));
    };
    const active = this.#active === null ? undefined : this.#occByKey.get(this.#active);
    const editableActive = active !== undefined && this.#canEdit(active);
    set('cut', !editableActive && this.#cut === null);
    this.#buttons.get('cut')?.setAttribute('aria-pressed', String(this.#cut !== null));
    set('paste', this.#cut === null || this.#grid.length === 0);
    set('shorten', !editableActive);
    set('lengthen', !editableActive);
    set('undo', !this.canUndo);
    set('redo', !this.canRedo);
  }

  #titleText(c: Resolved): string {
    const days = this.#days();
    const first = days[0] ?? this.#date;
    const last = days[days.length - 1] ?? this.#date;
    const locale = c.locale;
    if (this.#view === 'month' || (this.#view === 'timeline' && c.timelineScale === 'month')) return formatPlainDate(this.#date, { month: 'long', year: 'numeric' }, locale);
    if (plainDatesEqual(first, last)) return formatPlainDate(first, { dateStyle: 'full' }, locale);
    return this.#formatRange(first, last, locale);
  }

  #formatRange(a: PlainDate, b: PlainDate, locale: string): string {
    const f = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return f.formatRange(Date.UTC(a.year, a.month - 1, a.day, 12), Date.UTC(b.year, b.month - 1, b.day, 12));
  }

  #action(action: string, button: HTMLButtonElement): void {
    if (button.getAttribute('aria-disabled') === 'true') return;
    if (action.startsWith('view:')) {
      const v = action.slice(5) as SchedulerView;
      if (v !== this.#view) {
        this.setView(v);
        this.#emitNavigate();
      }
      return;
    }
    const active = this.#active === null ? undefined : this.#occByKey.get(this.#active);
    switch (action) {
      case 'today': {
        const before = startKey(this.#date);
        this.today();
        if (startKey(this.#date) !== before) this.#emitNavigate();
        return;
      }
      case 'previous':
        this.previous();
        return;
      case 'next':
        this.next();
        return;
      case 'cut':
        if (this.#cut !== null) this.#cancelCut();
        else if (active) this.#cutEvent(active);
        return;
      case 'paste': {
        const cell = this.#cellAt(this.#focus.row, this.#focus.col);
        if (cell) this.#paste(cell);
        return;
      }
      case 'shorten':
      case 'lengthen':
        if (active) this.#resizeBy(active, action === 'lengthen' ? 1 : -1);
        return;
      case 'undo':
        this.undo();
        return;
      case 'redo':
        this.redo();
        return;
    }
  }

  // ---- rendering -----------------------------------------------------------------------

  #render(): void {
    this.#localCache.clear();
    const c = this.#config();
    const range = this.#range();
    this.#occ = expandEvents(this.#events, { startDate: range.startDate, endDate: range.endDate, timeZone: c.timezone, disambiguation: c.disambiguation });
    this.#occByKey = new Map(this.#occ.map((o) => [o.key, o]));
    if (this.#active !== null && !this.#occByKey.has(this.#active)) this.#active = null;
    if (this.#cut !== null && !this.#occByKey.has(this.#cut)) this.#cut = null;
    const hadFocus = this.#body.contains(this.#doc.activeElement);
    for (const r of this.#rendered.values()) r.drag?.dispose();
    this.#rendered.clear();
    releaseNodes(this.#eventContent);
    this.#eventContent = [];
    this.#grid = [];
    this.#virtual = null;
    this.host.className = this.host.className.replace(/\baui-scheduler--(day|week|workWeek|month|agenda|timeline)\b/g, '').trim();
    this.host.classList.add('aui-scheduler', `aui-scheduler--${this.#view}`);
    this.host.classList.toggle('aui-scheduler--editable', this.editable);
    this.host.dir = c.direction;
    this.#renderToolbar(c);
    let content: HTMLElement;
    switch (this.#view) {
      case 'month':
        content = this.#renderMonth(c);
        break;
      case 'agenda':
        content = this.#renderAgenda(c);
        break;
      case 'timeline':
        content = this.#renderTimeline(c);
        break;
      default:
        content = this.#renderTimeGrid(c);
    }
    this.#body.replaceChildren(content);
    this.#renderStatus();
    this.#clampFocus();
    this.#syncTabStops();
    this.#syncEditButtons();
    if (hadFocus) this.#focusCurrent();
    if (!this.#scrolled && (this.#view === 'day' || this.#view === 'week' || this.#view === 'workWeek')) this.#scrollToHour(c);
    if (this.#view === 'timeline' && this.#isVirtual()) {
      const view = this.#doc.defaultView;
      view?.requestAnimationFrame(() => {
        if (!this.#group.disposed) this.#renderVirtualRows();
      });
    }
  }

  #renderStatus(): void {
    const doc = this.#doc;
    const grid = this.element;
    if (this.#loading) {
      this.#status.hidden = false;
      this.#status.replaceChildren(this.#msg('loading'));
      grid?.setAttribute('aria-busy', 'true');
      return;
    }
    grid?.removeAttribute('aria-busy');
    if (this.#loadError) {
      this.#status.hidden = false;
      const retry = doc.createElement('button');
      retry.type = 'button';
      retry.className = 'aui-scheduler__retry';
      retry.append(renderIcon('refresh', { doc }), this.#msg('retry'));
      this.#status.replaceChildren(this.#msg('loadFailed'), ' ', retry);
      return;
    }
    this.#status.hidden = true;
    this.#status.replaceChildren();
  }

  #scrollToHour(c: Resolved): void {
    this.#scrolled = true;
    const view = this.#doc.defaultView;
    // Measured in the next frame: reading layout now would force it during creation.
    view?.requestAnimationFrame(() => {
      if (this.#group.disposed) return;
      const slots = this.#grid.slice(1);
      const perHour = 60 / c.slotDuration;
      const row = slots[Math.max(0, (c.scrollToHour - c.dayStartHour) * perHour)]?.[0]?.el.parentElement;
      const head = this.element?.querySelector('thead');
      if (row instanceof HTMLElement) this.#body.scrollTop = Math.max(0, row.offsetTop - (head instanceof HTMLElement ? head.offsetHeight : 0) - (this.#grid[0]?.[0]?.el.parentElement?.offsetHeight ?? 0));
    });
  }

  /** Header cell of a day: short weekday and day number; holidays and today marked. */
  #dayHeader(th: HTMLTableCellElement, date: PlainDate, c: Resolved): void {
    const doc = this.#doc;
    const locale = c.locale;
    th.scope = 'col';
    th.className = 'aui-scheduler__day-header';
    const day = this.#calendar.day(date);
    if (!day.working) th.classList.add('aui-scheduler__day-header--non-working');
    const today = plainDatesEqual(date, this.#today());
    if (today) th.classList.add('aui-scheduler__day-header--today');
    const weekday = doc.createElement('span');
    weekday.className = 'aui-scheduler__weekday';
    weekday.textContent = formatPlainDate(date, { weekday: 'short' }, locale);
    const num = doc.createElement('span');
    num.className = 'aui-scheduler__day-number';
    num.textContent = formatPlainDate(date, { day: 'numeric' }, locale);
    th.append(weekday, ' ', num);
    if (day.holiday) {
      const h = doc.createElement('span');
      h.className = 'aui-scheduler__holiday';
      h.textContent = day.holiday;
      th.append(h);
    }
    th.abbr = formatPlainDate(date, { dateStyle: 'full' }, locale);
    if (today) th.setAttribute('aria-current', 'date');
  }

  #cell(row: number, col: number, date: PlainDate, minutes: number | null, length: number, resourceId: string | null | undefined, label: string): Cell {
    const td = this.#doc.createElement('td');
    td.className = 'aui-scheduler__cell';
    td.tabIndex = -1;
    td.dataset.auiRow = String(row);
    td.dataset.auiCol = String(col);
    const cell: Cell = { el: td, date, minutes, length, resourceId, row, col, events: [] };
    td.setAttribute('aria-label', label);
    (this.#grid[row] ??= [])[col] = cell;
    return cell;
  }

  #timeText(minutes: number, locale: string): string {
    const m = Math.min(minutes, 1439);
    return formatPlainTime(plainTime(Math.floor(m / 60), m % 60), { timeStyle: 'short' }, locale);
  }

  #endLabel(minutes: number, locale: string): string {
    return minutes >= 1440 ? this.#timeText(0, locale) : this.#timeText(minutes, locale);
  }

  /** Accessible cell text: base text, then working time, holiday, and event count. */
  #cellLabel(base: string, date: PlainDate, minutes: number | null, length: number, count: number, c: Resolved): string {
    const parts = [base];
    const day = this.#calendar.day(date);
    if (minutes !== null) {
      if (!this.#isWorkingSlot(date, minutes, length)) parts.push(this.#msg('nonWorking'));
    } else if (!day.working) parts.push(this.#msg('nonWorking'));
    if (minutes === null && day.holiday) parts.push(this.#msg('holiday', { name: day.holiday }));
    if (count > 0) parts.push(count === 1 ? this.#msg('oneEvent') : this.#msg('events', { count: formatNumber(count, {}, c.locale) }));
    return parts.join(', ');
  }

  #isWorkingSlot(date: PlainDate, minutes: number, length: number): boolean {
    const day = this.#calendar.day(date);
    return day.hours.some((h) => {
      const s = minutesOf(h.start);
      const e = minutesOf(h.end) === 0 ? 1440 : minutesOf(h.end);
      return minutes >= s && minutes + length <= e;
    });
  }

  /** Wall-clock time of an instant, cached per render (timezone conversions dominate large views). */
  #toLocal(v: Instant, zone: string): PlainDateTime {
    const key = `${zone}|${String(v.epochMilliseconds)}`;
    let hit = this.#localCache.get(key);
    if (!hit) {
      hit = toPlainDateTime(v, zone);
      this.#localCache.set(key, hit);
    }
    return hit;
  }

  /** Local wall-clock minutes of an instant on a given local date (clamped to the day). */
  #localMinutes(v: Instant, date: PlainDate, zone: string): number {
    const local = this.#toLocal(v, zone);
    const d = daysBetween(date, local.date);
    if (d < 0) return 0;
    if (d > 0) return 1440;
    return minutesOf(local.time);
  }

  #eventColor(occ: SchedulerOccurrence): number {
    const e = occ.event;
    if (e.color !== undefined) return e.color;
    const r = e.resourceId === undefined ? undefined : this.#options.resources?.find((x) => x.id === e.resourceId);
    return r?.color ?? 1;
  }

  #canEdit(occ: SchedulerOccurrence): boolean {
    return this.editable && occ.event.readOnly !== true;
  }

  /** The accessible name of an event: title, time, location, recurrence, read-only. */
  #eventLabel(occ: SchedulerOccurrence, c: Resolved): string {
    const locale = c.locale;
    const zone = c.timezone;
    const parts = [occ.event.title.trim() === '' ? '-' : occ.event.title];
    if (occ.allDay) {
      const s = occ.start as PlainDate;
      const e = occ.end as PlainDate;
      parts.push(plainDatesEqual(s, e) ? `${this.#msg('eventAllDay')}, ${formatPlainDate(s, { dateStyle: 'full' }, locale)}` : this.#msg('range', { start: formatPlainDate(s, { dateStyle: 'medium' }, locale), end: formatPlainDate(e, { dateStyle: 'medium' }, locale) }));
    } else {
      const s = occ.start as Instant;
      const e = occ.end as Instant;
      const sameDay = plainDatesEqual(this.#toLocal(s, zone).date, this.#toLocal(instant(e.epochMilliseconds - 1), zone).date);
      if (sameDay) parts.push(`${this.#msg('range', { start: formatInstant(s, { timeStyle: 'short' }, zone, locale), end: formatInstant(e, { timeStyle: 'short' }, zone, locale) })}, ${formatInstant(s, { dateStyle: 'full' }, zone, locale)}`);
      else parts.push(this.#msg('range', { start: formatInstant(s, { dateStyle: 'medium', timeStyle: 'short' }, zone, locale), end: formatInstant(e, { dateStyle: 'medium', timeStyle: 'short' }, zone, locale) }));
    }
    if (occ.event.location) parts.push(occ.event.location);
    if (occ.recurring) {
      const master = occ.seriesId === null ? undefined : this.#events.find((x) => x.id === occ.seriesId);
      const rule = master?.recurrence;
      if (rule) parts.push(this.#msg('repeats', { rule: describeRecurrence(rule, { locale, timeZone: master.timeZone ?? zone }).toLocaleLowerCase(locale) }));
    }
    if (this.editable && occ.event.readOnly === true) parts.push(this.#msg('readOnly'));
    return parts.join(', ');
  }

  /** The focusable event button (the first segment of an occurrence). */
  #eventButton(occ: SchedulerOccurrence, cell: Cell, c: Resolved, showTime: boolean, primary: boolean): HTMLElement {
    const doc = this.#doc;
    const el = doc.createElement(primary ? 'button' : 'div');
    if (el instanceof HTMLButtonElement) el.type = 'button';
    el.className = `aui-scheduler__event aui-scheduler__event--c${String(this.#eventColor(occ))}`;
    el.dataset.auiKey = occ.key;
    if (occ.allDay) el.classList.add('aui-scheduler__event--all-day');
    if (occ.recurring) el.classList.add('aui-scheduler__event--recurring');
    if (this.#cut === occ.key) el.classList.add('aui-scheduler__event--cut');
    if (occ.event.readOnly === true) el.classList.add('aui-scheduler__event--read-only');
    if (primary) {
      el.tabIndex = -1;
      el.setAttribute('aria-label', this.#eventLabel(occ, c));
      cell.events.push(occ.key);
    } else el.setAttribute('aria-hidden', 'true');
    const custom = this.#options.renderEvent ? this.#options.renderEvent(occ, { view: this.#view, doc }) : null;
    if (custom) this.#eventContent.push(custom);
    const content = custom ?? this.#defaultContent(occ, c, showTime);
    const inner = doc.createElement('span');
    inner.className = 'aui-scheduler__event-content';
    inner.append(content);
    el.append(inner);
    if (primary && this.#canEdit(occ)) {
      const handle = doc.createElement('span');
      handle.className = 'aui-scheduler__resize';
      handle.setAttribute('aria-hidden', 'true');
      el.append(handle);
    }
    if (primary) {
      const r: Rendered = { el, occ, cell, drag: null };
      this.#rendered.set(occ.key, r);
      if (this.#canEdit(occ)) r.drag = this.#eventDrag(r);
    }
    return el;
  }

  #defaultContent(occ: SchedulerOccurrence, c: Resolved, showTime: boolean): DocumentFragment {
    const doc = this.#doc;
    const frag = doc.createDocumentFragment();
    if (showTime && !occ.allDay) {
      const t = doc.createElement('span');
      t.className = 'aui-scheduler__event-time';
      t.textContent = formatInstant(occ.start as Instant, { timeStyle: 'short' }, c.timezone, c.locale);
      frag.append(t, ' ');
    }
    const title = doc.createElement('span');
    title.className = 'aui-scheduler__event-title';
    title.textContent = occ.event.title;
    frag.append(title);
    if (occ.event.location) {
      const loc = doc.createElement('span');
      loc.className = 'aui-scheduler__event-location';
      loc.textContent = occ.event.location;
      frag.append(' ', loc);
    }
    return frag;
  }

  /** Day, week, and work-week: an all-day row and one row per time slot. */
  #renderTimeGrid(c: Resolved): HTMLTableElement {
    const doc = this.#doc;
    const locale = c.locale;
    const zone = c.timezone;
    const days = this.#days();
    const table = doc.createElement('table');
    table.className = 'aui-scheduler__grid aui-scheduler__grid--time';
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-label', this.#msg('gridLabel', { label: this.#options.label, title: this.#titleText(c) }));
    table.style.setProperty('--aui-scheduler-days', String(days.length));
    const thead = doc.createElement('thead');
    const hr = doc.createElement('tr');
    const corner = doc.createElement('th');
    corner.scope = 'col';
    corner.className = 'aui-scheduler__corner';
    const cornerText = doc.createElement('span');
    cornerText.className = 'aui-visually-hidden';
    cornerText.textContent = this.#msg('time');
    corner.append(cornerText);
    hr.append(corner);
    for (const d of days) {
      const th = doc.createElement('th');
      this.#dayHeader(th, d, c);
      hr.append(th);
    }
    thead.append(hr);
    const tbody = doc.createElement('tbody');

    // All-day row: lanes of all-day and multi-day bars.
    const bars: { occ: SchedulerOccurrence; first: number; last: number }[] = [];
    const timed: SchedulerOccurrence[] = [];
    for (const occ of this.#occ) {
      if (occ.allDay) {
        let first = -1;
        let last = -1;
        days.forEach((d, i) => {
          if (comparePlainDate(d, occ.start as PlainDate) >= 0 && comparePlainDate(d, occ.end as PlainDate) <= 0) {
            if (first < 0) first = i;
            last = i;
          }
        });
        if (first >= 0) bars.push({ occ, first, last });
      } else timed.push(occ);
    }
    const lanes = packLanes(bars.map((b) => ({ key: b.occ.key, start: b.first, end: b.last + 1 })));
    const allDayRow = doc.createElement('tr');
    allDayRow.className = 'aui-scheduler__all-day-row';
    const allDayHead = doc.createElement('th');
    allDayHead.scope = 'row';
    allDayHead.className = 'aui-scheduler__row-header';
    allDayHead.textContent = this.#msg('allDay');
    allDayRow.append(allDayHead);
    const allDayCells = days.map((d, col) => this.#cell(0, col, d, null, 0, undefined, ''));
    for (const b of bars) {
      const cell = allDayCells[b.first];
      if (!cell) continue;
      const el = this.#eventButton(b.occ, cell, c, false, true);
      el.style.setProperty('--aui-lane', String(lanes.lanes.get(b.occ.key) ?? 0));
      el.style.setProperty('--aui-span', String(b.last - b.first + 1));
      cell.el.append(el);
    }
    for (const cell of allDayCells) {
      cell.el.classList.add('aui-scheduler__cell--all-day');
      cell.el.style.setProperty('--aui-lanes', String(lanes.count));
      if (!this.#calendar.day(cell.date).working) cell.el.classList.add('aui-scheduler__cell--non-working');
      cell.el.setAttribute('aria-label', this.#cellLabel(`${formatPlainDate(cell.date, { dateStyle: 'full' }, locale)}, ${this.#msg('allDay')}`, cell.date, null, 0, cell.events.length, c));
      allDayRow.append(cell.el);
    }
    tbody.append(allDayRow);

    // Time slots.
    const slot = c.slotDuration;
    const from = c.dayStartHour * 60;
    const to = c.dayEndHour * 60;
    const slotRows: Cell[][] = [];
    const labels = new Map<number, string>();
    for (let m = from, row = 1; m < to; m += slot, row++) {
      const tr = doc.createElement('tr');
      tr.className = 'aui-scheduler__slot-row';
      if (m % 60 === 0) tr.classList.add('aui-scheduler__slot-row--hour');
      const th = doc.createElement('th');
      th.scope = 'row';
      th.className = 'aui-scheduler__row-header aui-scheduler__time';
      const label = doc.createElement('span');
      label.textContent = this.#timeText(m, locale);
      if (m % 60 !== 0) label.className = 'aui-visually-hidden';
      th.append(label);
      tr.append(th);
      labels.set(m, this.#timeText(m, locale));
      const cells = days.map((d, col) => this.#cell(row, col, d, m, slot, undefined, ''));
      slotRows.push(cells);
      for (const cell of cells) tr.append(cell.el);
      tbody.append(tr);
    }

    // Timed events: one segment per visible day, placed in the slot where it starts.
    days.forEach((d, col) => {
      const dayStart = startOfDay(d, zone, c.disambiguation).epochMilliseconds;
      const dayEnd = startOfDay(addDays(d, 1), zone, c.disambiguation).epochMilliseconds;
      const segs: { occ: SchedulerOccurrence; start: number; end: number }[] = [];
      for (const occ of timed) {
        const s = (occ.start as Instant).epochMilliseconds;
        const e = (occ.end as Instant).epochMilliseconds;
        if (s >= dayEnd || e <= dayStart) continue;
        const sm = Math.max(from, this.#localMinutes(occ.start as Instant, d, zone));
        const em = Math.min(to, e >= dayEnd ? 1440 : this.#localMinutes(occ.end as Instant, d, zone));
        if (em <= from || sm >= to) continue;
        segs.push({ occ, start: sm, end: Math.max(em, sm + Math.min(slot, 15)) });
      }
      const placement = packColumns(segs.map((sg) => ({ key: sg.occ.key, start: sg.start, end: sg.end })));
      for (const sg of segs) {
        const index = Math.min(slotRows.length - 1, Math.floor((sg.start - from) / slot));
        const cell = slotRows[index]?.[col];
        if (!cell) continue;
        // The first visible segment is the button; later days show continuation segments.
        const el = this.#eventButton(sg.occ, cell, c, true, !this.#rendered.has(sg.occ.key));
        const p = placement.get(sg.occ.key);
        const s = el.style;
        s.setProperty('--aui-top', String((sg.start - (from + index * slot)) / slot));
        s.setProperty('--aui-span', String((sg.end - sg.start) / slot));
        s.setProperty('--aui-column', String(p?.column ?? 0));
        s.setProperty('--aui-columns', String(p?.columns ?? 1));
        s.setProperty('--aui-extent', String(p?.extent ?? 1));
        if ((sg.end - sg.start) / slot < 1.5) el.classList.add('aui-scheduler__event--short');
        cell.el.append(el);
      }
    });
    for (const cells of slotRows) {
      for (const cell of cells) {
        const m = cell.minutes ?? 0;
        if (!this.#isWorkingSlot(cell.date, m, slot)) cell.el.classList.add('aui-scheduler__cell--non-working');
        cell.el.setAttribute('aria-label', this.#cellLabel(this.#msg('slot', { date: formatPlainDate(cell.date, { weekday: 'long', month: 'long', day: 'numeric' }, locale), start: labels.get(m) ?? '', end: this.#endLabel(m + slot, locale) }), cell.date, m, slot, cell.events.length, c));
      }
    }
    table.append(thead, tbody);
    this.#renderNow(table);
    return table;
  }

  /** Current-time line in time views (decorative). */
  #renderNow(root: ParentNode | null = this.element): void {
    if (!root) return;
    for (const old of Array.from(root.querySelectorAll('.aui-scheduler__now'))) old.remove();
    const c = this.#config();
    const n = this.#now();
    const local = toPlainDateTime(n, c.timezone);
    const minutes = minutesOf(local.time);
    const slot = c.slotDuration;
    const isTimeGrid = this.#view === 'day' || this.#view === 'week' || this.#view === 'workWeek';
    const isDayTimeline = this.#view === 'timeline' && c.timelineScale === 'day';
    if (!isTimeGrid && !isDayTimeline) return;
    const from = c.dayStartHour * 60;
    if (minutes < from || minutes >= c.dayEndHour * 60) return;
    const index = Math.floor((minutes - from) / slot);
    const lines: Cell[] = [];
    if (isTimeGrid) {
      const col = this.#grid[0]?.findIndex((cell) => plainDatesEqual(cell.date, local.date)) ?? -1;
      const cell = this.#grid[index + 1]?.[col];
      if (cell) lines.push(cell);
    } else {
      for (const row of this.#grid) { const cell = row?.[index]; if (cell && plainDatesEqual(cell.date, local.date)) lines.push(cell); }
    }
    for (const cell of lines) {
      const line = this.#doc.createElement('span');
      line.className = 'aui-scheduler__now';
      line.setAttribute('aria-hidden', 'true');
      line.style.setProperty('--aui-top', String((minutes - (from + index * slot)) / slot));
      cell.el.append(line);
    }
  }

  /** Month: one row per week; bars for all-day and multi-day events, chips for timed events. */
  #renderMonth(c: Resolved): HTMLTableElement {
    const doc = this.#doc;
    const locale = c.locale;
    const zone = c.timezone;
    const days = this.#days();
    const month = this.#date.month;
    const table = doc.createElement('table');
    table.className = 'aui-scheduler__grid aui-scheduler__grid--month';
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-label', this.#msg('gridLabel', { label: this.#options.label, title: this.#titleText(c) }));
    const thead = doc.createElement('thead');
    const hr = doc.createElement('tr');
    for (let i = 0; i < 7; i++) {
      const d = days[i];
      if (!d) continue;
      const th = doc.createElement('th');
      th.scope = 'col';
      th.className = 'aui-scheduler__day-header';
      th.textContent = formatPlainDate(d, { weekday: 'short' }, locale);
      th.abbr = formatPlainDate(d, { weekday: 'long' }, locale);
      hr.append(th);
    }
    thead.append(hr);
    const tbody = doc.createElement('tbody');
    const limit = c.monthEventLimit;
    const today = this.#today();
    for (let w = 0; w < days.length / 7; w++) {
      const week = days.slice(w * 7, w * 7 + 7);
      const first = week[0];
      const lastDay = week[6];
      if (!first || !lastDay) continue;
      const tr = doc.createElement('tr');
      const cells = week.map((d, col) => this.#cell(w, col, d, null, 0, undefined, ''));
      // Bars: all-day events and timed events longer than a day.
      const bars: { occ: SchedulerOccurrence; first: number; last: number }[] = [];
      const chips = new Map<number, SchedulerOccurrence[]>();
      for (const occ of this.#occ) {
        let sd: PlainDate;
        let ed: PlainDate;
        if (occ.allDay) {
          sd = occ.start as PlainDate;
          ed = occ.end as PlainDate;
        } else {
          sd = this.#toLocal(occ.start as Instant, zone).date;
          ed = this.#toLocal(instant((occ.end as Instant).epochMilliseconds - 1), zone).date;
        }
        if (comparePlainDate(ed, first) < 0 || comparePlainDate(sd, lastDay) > 0) continue;
        const a = Math.max(0, daysBetween(first, sd));
        const b = Math.min(6, daysBetween(first, ed));
        if (occ.allDay || b > a) bars.push({ occ, first: a, last: b });
        else chips.set(a, [...(chips.get(a) ?? []), occ]);
      }
      const lanes = packLanes(bars.map((b) => ({ key: b.occ.key, start: b.first, end: b.last + 1 })));
      const hiddenPerDay = new Array<number>(7).fill(0);
      for (const b of bars) {
        const lane = lanes.lanes.get(b.occ.key) ?? 0;
        if (lane >= limit) {
          for (let i = b.first; i <= b.last; i++) hiddenPerDay[i] = (hiddenPerDay[i] ?? 0) + 1;
          continue;
        }
        const cell = cells[b.first];
        if (!cell) continue;
        const primary = !this.#rendered.has(b.occ.key);
        const el = this.#eventButton(b.occ, cell, c, !b.occ.allDay, primary);
        el.classList.add('aui-scheduler__event--bar');
        el.style.setProperty('--aui-lane', String(lane));
        el.style.setProperty('--aui-span', String(b.last - b.first + 1));
        cell.el.append(el);
      }
      cells.forEach((cell, col) => {
        const d = cell.date;
        const td = cell.el;
        td.classList.add('aui-scheduler__cell--day');
        if (d.month !== month) td.classList.add('aui-scheduler__cell--outside');
        if (!this.#calendar.day(d).working) td.classList.add('aui-scheduler__cell--non-working');
        const used = Math.min(limit, lanes.count);
        td.style.setProperty('--aui-lanes', String(used));
        const num = doc.createElement('span');
        num.className = 'aui-scheduler__date';
        num.setAttribute('aria-hidden', 'true');
        num.textContent = formatPlainDate(d, { day: 'numeric' }, locale);
        if (plainDatesEqual(d, today)) {
          td.classList.add('aui-scheduler__cell--today');
          td.setAttribute('aria-current', 'date');
        }
        td.prepend(num);
        const list = chips.get(col) ?? [];
        const room = Math.max(0, limit - Math.min(limit, lanes.count));
        const shown = list.slice(0, room);
        const chipBox = doc.createElement('div');
        chipBox.className = 'aui-scheduler__chips';
        for (const occ of shown) {
          const el = this.#eventButton(occ, cell, c, true, !this.#rendered.has(occ.key));
          el.classList.add('aui-scheduler__event--chip');
          chipBox.append(el);
        }
        const hidden = list.length - shown.length + (hiddenPerDay[col] ?? 0);
        if (hidden > 0) {
          const more = doc.createElement('button');
          more.type = 'button';
          more.className = 'aui-scheduler__more';
          more.tabIndex = -1;
          more.dataset.auiDate = plainDateToString(d);
          more.textContent = this.#msg('more', { count: formatNumber(hidden, {}, locale) });
          more.setAttribute('aria-label', this.#msg('moreLabel', { count: formatNumber(hidden, {}, locale), date: formatPlainDate(d, { month: 'long', day: 'numeric' }, locale) }));
          chipBox.append(more);
        }
        td.append(chipBox);
        const holiday = this.#calendar.day(d).holiday;
        if (holiday) {
          const h = doc.createElement('span');
          h.className = 'aui-scheduler__holiday';
          h.setAttribute('aria-hidden', 'true');
          h.textContent = holiday;
          num.after(h);
        }
        td.setAttribute('aria-label', this.#cellLabel(formatPlainDate(d, { dateStyle: 'full' }, locale), d, null, 0, cell.events.length + hidden, c));
        tr.append(td);
      });
      tbody.append(tr);
    }
    table.append(thead, tbody);
    return table;
  }

  /** Agenda: days with their events, one list; one roving tab stop over the events. */
  #renderAgenda(c: Resolved): HTMLDivElement {
    const doc = this.#doc;
    const locale = c.locale;
    const zone = c.timezone;
    const root = doc.createElement('div');
    root.className = 'aui-scheduler__agenda';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', this.#msg('gridLabel', { label: this.#options.label, title: this.#titleText(c) }));
    const days = this.#days();
    const cellFor = (d: PlainDate, i: number): Cell => ({ el: doc.createElement('td'), date: d, minutes: null, length: 0, resourceId: undefined, row: i, col: 0, events: [] });
    let any = false;
    for (const [i, d] of days.entries()) {
      const occs = this.#occ.filter((o) => {
        if (o.allDay) return comparePlainDate(o.start as PlainDate, d) <= 0 && comparePlainDate(o.end as PlainDate, d) >= 0;
        const s = (o.start as Instant).epochMilliseconds;
        const e = (o.end as Instant).epochMilliseconds;
        return s < startOfDay(addDays(d, 1), zone, c.disambiguation).epochMilliseconds && e > startOfDay(d, zone, c.disambiguation).epochMilliseconds;
      });
      if (occs.length === 0) continue;
      any = true;
      const section = doc.createElement('section');
      section.className = 'aui-scheduler__agenda-day';
      const h = doc.createElement('h3');
      h.className = 'aui-scheduler__agenda-date';
      h.id = createId('aui-scheduler-agenda');
      h.textContent = formatPlainDate(d, { dateStyle: 'full' }, locale);
      const ul = doc.createElement('ul');
      ul.className = 'aui-scheduler__agenda-list';
      ul.setAttribute('aria-labelledby', h.id);
      const cell = cellFor(d, i);
      for (const occ of occs) {
        const li = doc.createElement('li');
        const time = doc.createElement('span');
        time.className = 'aui-scheduler__agenda-time';
        time.setAttribute('aria-hidden', 'true');
        time.textContent = occ.allDay ? this.#msg('allDay') : this.#msg('range', { start: formatInstant(occ.start as Instant, { timeStyle: 'short' }, zone, locale), end: formatInstant(occ.end as Instant, { timeStyle: 'short' }, zone, locale) });
        const el = this.#eventButton(occ, cell, c, false, !this.#rendered.has(occ.key));
        li.append(time, el);
        ul.append(li);
      }
      section.append(h, ul);
      root.append(section);
    }
    if (!any) {
      const p = doc.createElement('p');
      p.className = 'aui-scheduler__empty';
      p.textContent = this.#msg('noEvents');
      root.append(p);
    }
    return root;
  }

  /** Timeline: one row per resource (plus unassigned), columns are slots or days. */
  #renderTimeline(c: Resolved): HTMLTableElement {
    const doc = this.#doc;
    const locale = c.locale;
    const zone = c.timezone;
    const table = doc.createElement('table');
    table.className = 'aui-scheduler__grid aui-scheduler__grid--timeline';
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-label', this.#msg('gridLabel', { label: this.#options.label, title: this.#titleText(c) }));
    const days = this.#days();
    const byDay = c.timelineScale !== 'day';
    const slot = c.slotDuration;
    const from = c.dayStartHour * 60;
    const to = c.dayEndHour * 60;
    const date = days[0] ?? this.#date;
    const columns: { date: PlainDate; minutes: number | null; length: number }[] = byDay
      ? days.map((d) => ({ date: d, minutes: null, length: 1440 }))
      : Array.from({ length: (to - from) / slot }, (_, i) => ({ date, minutes: from + i * slot, length: slot }));
    table.style.setProperty('--aui-scheduler-columns', String(columns.length));
    const thead = doc.createElement('thead');
    const hr = doc.createElement('tr');
    const corner = doc.createElement('th');
    corner.scope = 'col';
    corner.className = 'aui-scheduler__corner';
    corner.textContent = this.#msg('resource');
    hr.append(corner);
    for (const col of columns) {
      const th = doc.createElement('th');
      if (col.minutes === null) this.#dayHeader(th, col.date, c);
      else {
        th.scope = 'col';
        th.className = 'aui-scheduler__time-header';
        const label = doc.createElement('span');
        label.textContent = this.#timeText(col.minutes, locale);
        if (col.minutes % 60 !== 0) label.className = 'aui-visually-hidden';
        th.append(label);
      }
      hr.append(th);
    }
    thead.append(hr);
    const tbody = doc.createElement('tbody');
    const resources: { id: string | null; label: string }[] = (this.#options.resources ?? []).map((r) => ({ id: r.id, label: r.label }));
    const known = new Set(resources.map((r) => r.id));
    if (this.#occ.some((o) => o.event.resourceId === undefined || !known.has(o.event.resourceId))) resources.push({ id: null, label: this.#msg('unassigned') });
    const rangeStart = startOfDay(date, zone, c.disambiguation).epochMilliseconds;
    const position = (o: SchedulerOccurrence): { start: number; end: number } | null => {
      // Position in column units.
      if (byDay) {
        const sd = o.allDay ? (o.start as PlainDate) : this.#toLocal(o.start as Instant, zone).date;
        const ed = o.allDay ? (o.end as PlainDate) : this.#toLocal(instant((o.end as Instant).epochMilliseconds - 1), zone).date;
        const first = days[0];
        if (!first) return null;
        const a = daysBetween(first, sd);
        const b = daysBetween(first, ed) + 1;
        if (b <= 0 || a >= columns.length) return null;
        const startFrac = o.allDay ? 0 : minutesOf(this.#toLocal(o.start as Instant, zone).time) / 1440;
        const endFrac = o.allDay ? 1 : (() => {
          const endLocal = this.#toLocal(o.end as Instant, zone);
          const m = minutesOf(endLocal.time);
          return m === 0 ? 1 : m / 1440;
        })();
        return { start: Math.max(0, a + startFrac), end: Math.min(columns.length, b - 1 + endFrac) };
      }
      if (o.allDay) return { start: 0, end: columns.length };
      const s = (o.start as Instant).epochMilliseconds;
      const e = (o.end as Instant).epochMilliseconds;
      if (e <= rangeStart) return null;
      const sm = Math.max(from, this.#localMinutes(o.start as Instant, date, zone));
      const em = Math.min(to, this.#localMinutes(o.end as Instant, date, zone));
      if (em <= from || sm >= to || s >= startOfDay(addDays(date, 1), zone, c.disambiguation).epochMilliseconds) return null;
      return { start: (sm - from) / slot, end: Math.max((sm - from) / slot + 0.25, (em - from) / slot) };
    };
    const rows: TimelineRow[] = resources.map((r, row) => {
      const occs = this.#occ.filter((o) => (r.id === null ? o.event.resourceId === undefined || !known.has(o.event.resourceId) : o.event.resourceId === r.id));
      const placed = occs.map((o) => ({ o, p: position(o) })).filter((x): x is { o: SchedulerOccurrence; p: { start: number; end: number } } => x.p !== null);
      const lanes = packLanes(placed.map((x) => ({ key: x.o.key, start: x.p.start, end: x.p.end })));
      return { r, row, placed, lanes };
    });
    const heights = rows.map((x) => Math.max(1, x.lanes.count));
    const buildRow = (x: TimelineRow): HTMLTableRowElement => {
      const tr = doc.createElement('tr');
      tr.className = 'aui-scheduler__resource-row';
      tr.style.setProperty('--aui-lanes', String(Math.max(1, x.lanes.count)));
      const th = doc.createElement('th');
      th.scope = 'row';
      th.className = 'aui-scheduler__row-header aui-scheduler__resource';
      th.textContent = x.r.label;
      tr.append(th);
      const cells = columns.map((col, i) => this.#cell(x.row, i, col.date, col.minutes, col.length, x.r.id, ''));
      for (const { o, p } of x.placed) {
        const index = Math.min(columns.length - 1, Math.floor(p.start));
        const cell = cells[index];
        if (!cell) continue;
        const el = this.#eventButton(o, cell, c, !byDay, !this.#rendered.has(o.key));
        el.classList.add('aui-scheduler__event--bar');
        el.style.setProperty('--aui-lane', String(x.lanes.lanes.get(o.key) ?? 0));
        el.style.setProperty('--aui-offset', String(p.start - index));
        el.style.setProperty('--aui-span', String(p.end - p.start));
        cell.el.append(el);
      }
      for (const cell of cells) {
        const label = cell.minutes === null
          ? `${x.r.label}, ${formatPlainDate(cell.date, { dateStyle: 'full' }, locale)}`
          : `${x.r.label}, ${this.#msg('slot', { date: formatPlainDate(cell.date, { weekday: 'long', month: 'long', day: 'numeric' }, locale), start: this.#timeText(cell.minutes, locale), end: this.#endLabel(cell.minutes + slot, locale) })}`;
        if (cell.minutes === null ? !this.#calendar.day(cell.date).working : !this.#isWorkingSlot(cell.date, cell.minutes, slot)) cell.el.classList.add('aui-scheduler__cell--non-working');
        cell.el.setAttribute('aria-label', this.#cellLabel(label, cell.date, cell.minutes, cell.length, cell.events.length, c));
        tr.append(cell.el);
      }
      return tr;
    };
    table.append(thead, tbody);
    // Large timelines render only the rows in view (rows are cheap to rebuild on scroll).
    if (rows.length > VIRTUAL_ROWS) {
      this.#virtual = { top: 0, rows: rows.length, heights };
      this.#timelineRows = { rows, buildRow, tbody };
      const initial = Math.min(rows.length, 40);
      for (const x of rows.slice(0, initial)) tbody.append(buildRow(x));
      const after = doc.createElement('tr');
      after.className = 'aui-scheduler__spacer';
      after.setAttribute('aria-hidden', 'true');
      after.style.setProperty('--aui-lanes', String(heights.slice(initial).reduce((a, b) => a + b, 0)));
      tbody.append(after);
      table.setAttribute('aria-rowcount', String(rows.length + 1));
    } else {
      this.#timelineRows = null;
      for (const x of rows) tbody.append(buildRow(x));
    }
    this.#renderNow(table);
    return table;
  }

  #isVirtual(): boolean {
    return this.#virtual !== null;
  }

  #timelineRows: { rows: TimelineRow[]; buildRow: (x: TimelineRow) => HTMLTableRowElement; tbody: HTMLTableSectionElement } | null = null;

  /** Window of timeline rows for the scroll position (rows are measured in lanes). */
  #renderVirtualRows(): void {
    const v = this.#virtual;
    const t = this.#timelineRows;
    if (!v || !t) return;
    const probe = t.tbody.querySelector<HTMLElement>('.aui-scheduler__resource-row');
    const laneHeight = probe ? probe.offsetHeight / Math.max(1, Number(probe.style.getPropertyValue('--aui-lanes')) || 1) : 40;
    const offsets: number[] = [];
    let acc = 0;
    for (const h of v.heights) {
      offsets.push(acc);
      acc += h * laneHeight;
    }
    const head = this.element?.querySelector('thead');
    const top = Math.max(0, this.#body.scrollTop - (head instanceof HTMLElement ? head.offsetHeight : 0));
    const viewport = this.#body.clientHeight || 600;
    let first = offsets.findIndex((o, i) => o + (v.heights[i] ?? 1) * laneHeight > top);
    if (first < 0) first = 0;
    first = Math.max(0, first - 5);
    let last = offsets.findIndex((o) => o > top + viewport);
    if (last < 0) last = v.rows;
    last = Math.min(v.rows, last + 5);
    // Keep the focused row rendered so the roving tab stop survives scrolling.
    const doc = this.#doc;
    const lanesBefore = v.heights.slice(0, first).reduce((a, b) => a + b, 0);
    const lanesAfter = v.heights.slice(last).reduce((a, b) => a + b, 0);
    const spacer = (lanes: number): HTMLTableRowElement => {
      const tr = doc.createElement('tr');
      tr.className = 'aui-scheduler__spacer';
      tr.setAttribute('aria-hidden', 'true');
      tr.style.setProperty('--aui-lanes', String(lanes));
      return tr;
    };
    const hadFocus = this.#body.contains(doc.activeElement);
    const keep = this.#focus.row;
    for (const r of [...this.#rendered.values()]) {
      if (r.cell.row < first || r.cell.row >= last) {
        r.drag?.dispose();
        this.#rendered.delete(r.occ.key);
      }
    }
    for (let row = 0; row < v.rows; row++) if (row < first || row >= last) this.#grid[row] = undefined;
    const built = t.rows.slice(first, last).map((x) => {
      const tr = t.buildRow(x);
      tr.setAttribute('aria-rowindex', String(x.row + 2));
      return tr;
    });
    t.tbody.replaceChildren(...(lanesBefore ? [spacer(lanesBefore)] : []), ...built, ...(lanesAfter ? [spacer(lanesAfter)] : []));
    if (keep < first || keep >= last) this.#focus = { row: first, col: this.#focus.col };
    this.#syncTabStops();
    if (hadFocus && !this.#body.contains(doc.activeElement)) this.#focusCurrent();
  }

  // ---- focus and keyboard ----------------------------------------------------------------

  #cellAt(row: number, col: number): Cell | undefined {
    return this.#grid[row]?.[col];
  }

  #cellOf(target: EventTarget | null): Cell | undefined {
    const td = target instanceof Element ? target.closest<HTMLTableCellElement>('td[data-aui-row]') : null;
    if (!td || !this.#body.contains(td)) return undefined;
    return this.#cellAt(Number(td.dataset.auiRow), Number(td.dataset.auiCol));
  }

  #clampFocus(): void {
    if (this.#view === 'agenda') return;
    const rows = this.#grid.length;
    if (rows === 0) return;
    // Focus follows the anchor date when the period changed.
    const current = this.#cellAt(this.#focus.row, this.#focus.col);
    if (!current || !this.#focusInPeriod) this.#focus = this.#defaultFocus();
    this.#focusInPeriod = true;
    if (this.#focusEvent !== null && !this.#rendered.has(this.#focusEvent)) this.#focusEvent = null;
  }

  #syncTabStops(): void {
    const focusEvent = this.#focusEvent;
    for (const row of this.#grid) for (const cell of row ?? []) cell.el.tabIndex = focusEvent === null && cell.row === this.#focus.row && cell.col === this.#focus.col ? 0 : -1;
    for (const r of this.#rendered.values()) r.el.tabIndex = r.occ.key === focusEvent ? 0 : -1;
    if (this.#view === 'agenda' && focusEvent === null) {
      const first = this.#rendered.values().next().value;
      if (first) first.el.tabIndex = 0;
    }
    for (const b of Array.from(this.#body.querySelectorAll<HTMLElement>('.aui-scheduler__more'))) b.tabIndex = -1;
  }

  #focusCurrent(): void {
    if (this.#focusEvent !== null) {
      const r = this.#rendered.get(this.#focusEvent);
      if (r) {
        r.el.focus({ preventScroll: false });
        return;
      }
      this.#focusEvent = null;
    }
    if (this.#view === 'agenda') {
      this.#rendered.values().next().value?.el.focus();
      return;
    }
    this.#cellAt(this.#focus.row, this.#focus.col)?.el.focus();
  }

  #setFocus(row: number, col: number): void {
    this.#focus = { row, col };
    this.#focusEvent = null;
    this.#syncTabStops();
    this.#focusCurrent();
    this.#syncEditButtons();
  }

  #focusEventKey(key: string): void {
    this.#focusEvent = key;
    this.#active = key;
    const r = this.#rendered.get(key);
    if (r) this.#focus = { row: r.cell.row, col: r.cell.col };
    this.#syncTabStops();
    this.#focusCurrent();
    this.#syncEditButtons();
  }

  #onFocusIn(e: FocusEvent): void {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const key = t.closest<HTMLElement>('.aui-scheduler__event')?.dataset.auiKey;
    if (key !== undefined && this.#rendered.has(key)) {
      if (this.#focusEvent !== key || this.#active !== key) {
        this.#focusEvent = key;
        this.#active = key;
        const r = this.#rendered.get(key);
        if (r) this.#focus = { row: r.cell.row, col: r.cell.col };
        this.#syncTabStops();
        this.#syncEditButtons();
      }
      return;
    }
    const cell = t instanceof HTMLTableCellElement ? this.#cellOf(t) : undefined;
    if (cell && (cell.row !== this.#focus.row || cell.col !== this.#focus.col || this.#focusEvent !== null)) {
      this.#focus = { row: cell.row, col: cell.col };
      this.#focusEvent = null;
      this.#syncTabStops();
    }
  }

  #onKey(e: KeyboardEvent): void {
    if (this.#view === 'agenda') {
      this.#onAgendaKey(e);
      return;
    }
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target) return;
    const more = target.closest<HTMLElement>('.aui-scheduler__more');
    const key = target.closest<HTMLElement>('.aui-scheduler__event')?.dataset.auiKey;
    if (this.editable && matchesHotkey(e, 'mod+z')) {
      e.preventDefault();
      this.undo();
      return;
    }
    if (this.editable && (matchesHotkey(e, 'mod+shift+z') || matchesHotkey(e, 'mod+y'))) {
      e.preventDefault();
      this.redo();
      return;
    }
    if (key !== undefined || more) {
      this.#onEventKey(e, key, more);
      return;
    }
    const cell = this.#cellOf(target);
    if (!cell) return;
    this.#onCellKey(e, cell);
  }

  #onCellKey(e: KeyboardEvent, cell: Cell): void {
    const rtl = this.#config().direction === 'rtl';
    const rows = this.#grid.length;
    const cols = this.#grid[cell.row]?.length ?? 1;
    let row = cell.row;
    let col = cell.col;
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (this.editable && matchesHotkey(e, 'mod+v')) {
      e.preventDefault();
      this.#paste(cell);
      return;
    }
    if (e.key === 'Escape' && this.#cut !== null) {
      e.preventDefault();
      e.stopPropagation();
      this.#cancelCut();
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        row++;
        break;
      case 'ArrowUp':
        row--;
        break;
      case 'Home':
        col = 0;
        if (e.ctrlKey || e.metaKey) row = this.#firstRow();
        break;
      case 'End':
        col = cols - 1;
        if (e.ctrlKey || e.metaKey) row = rows - 1;
        break;
      case 'PageUp':
      case 'PageDown':
        e.preventDefault();
        this.#anchor = null;
        this.#shift(e.key === 'PageUp' ? -1 : 1);
        this.#setFocus(Math.min(cell.row, this.#grid.length - 1), Math.min(cell.col, (this.#grid[Math.min(cell.row, this.#grid.length - 1)]?.length ?? 1) - 1));
        return;
      case 'Enter':
      case ' ':
      case 'F2': {
        e.preventDefault();
        const first = cell.events[0];
        const moreButton = cell.el.querySelector<HTMLElement>('.aui-scheduler__more');
        // With a selection, Enter creates; otherwise it moves into the cell's events.
        if (!e.shiftKey && !this.#anchor && first !== undefined) this.#focusEventKey(first);
        else if (!e.shiftKey && !this.#anchor && moreButton && e.key !== ' ') moreButton.focus();
        else this.#activateSlot(this.#anchor ? (this.#cellAt(this.#anchor.row, this.#anchor.col) ?? cell) : cell, cell);
        return;
      }
      case 'Escape':
        if (this.#anchor) {
          e.preventDefault();
          this.#anchor = null;
          this.#renderSelection();
        }
        return;
      default:
        if (e.key === forward) col++;
        else if (e.key === back) col--;
        else return;
    }
    e.preventDefault();
    // Past the edge of a day or week: the neighbouring period (month and time views move by days).
    if (col < 0 || col >= cols) {
      if (this.#view === 'timeline' && this.#config().timelineScale === 'day') return;
      if (this.#view === 'month' && (row !== cell.row)) return;
      const delta = col < 0 ? -1 : 1;
      if (this.#view === 'day' || this.#view === 'week' || this.#view === 'workWeek' || this.#view === 'timeline') {
        this.#shift(delta);
        this.#setFocus(cell.row, delta > 0 ? 0 : (this.#grid[cell.row]?.length ?? 1) - 1);
        return;
      }
      col = Math.max(0, Math.min(cols - 1, col));
    }
    if (row < this.#firstRow() || row >= rows) {
      if (this.#view === 'month') {
        this.#shiftMonthFocus(cell, row < 0 ? -7 : 7);
        return;
      }
      return;
    }
    if (!this.#cellAt(row, col)) return;
    if (e.shiftKey) {
      this.#anchor ??= { row: cell.row, col: cell.col };
      // Selections stay within one day (time views) or one resource (timeline).
      if ((this.#view === 'day' || this.#view === 'week' || this.#view === 'workWeek') && (col !== this.#anchor.col || row === 0 || this.#anchor.row === 0)) return;
      if (this.#view === 'timeline' && row !== this.#anchor.row) return;
    } else this.#anchor = null;
    this.#setFocus(row, col);
    this.#renderSelection();
  }

  /** Initial cell of a period: the anchor date (at the scroll hour in time views). */
  #defaultFocus(): { row: number; col: number } {
    const c = this.#config();
    const firstRow = Math.max(0, this.#firstRow());
    const slotIndex = Math.max(0, Math.floor(((c.scrollToHour - c.dayStartHour) * 60) / c.slotDuration));
    const time = this.#view === 'day' || this.#view === 'week' || this.#view === 'workWeek';
    if (this.#view === 'timeline' && c.timelineScale === 'day') return { row: firstRow, col: Math.min(slotIndex, (this.#grid[firstRow]?.length ?? 1) - 1) };
    const row0 = this.#grid[time ? 0 : firstRow] ?? [];
    const col = Math.max(0, row0.findIndex((cell) => plainDatesEqual(cell.date, this.#date)));
    if (time) return { row: Math.min(this.#grid.length - 1, 1 + slotIndex), col };
    if (this.#view === 'month') {
      for (const row of this.#grid) for (const cell of row ?? []) if (plainDatesEqual(cell.date, this.#date)) return { row: cell.row, col: cell.col };
    }
    return { row: firstRow, col };
  }

  #firstRow(): number {
    return this.#grid.findIndex((r) => r !== undefined);
  }

  #shiftMonthFocus(cell: Cell, days: number): void {
    const target = addDays(cell.date, days);
    this.#date = target;
    this.#focusInPeriod = false;
    this.#render();
    this.#load();
    this.#emitNavigate();
    for (const row of this.#grid) for (const c of row ?? []) if (plainDatesEqual(c.date, target)) {
      this.#setFocus(c.row, c.col);
      return;
    }
  }

  #onEventKey(e: KeyboardEvent, key: string | undefined, more: HTMLElement | null): void {
    if (more) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.#showDay(more.dataset.auiDate ?? '');
      } else if (e.key === 'Escape' || e.key === 'F2') {
        e.preventDefault();
        this.#setFocus(this.#focus.row, this.#focus.col);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const cell = this.#cellAt(this.#focus.row, this.#focus.col);
        const last = cell?.events[cell.events.length - 1];
        if (last !== undefined) this.#focusEventKey(last);
      }
      return;
    }
    if (key === undefined) return;
    const r = this.#rendered.get(key);
    if (!r) return;
    const occ = r.occ;
    const c = this.#config();
    const rtl = c.direction === 'rtl';
    if (this.editable && matchesHotkey(e, 'mod+x')) {
      e.preventDefault();
      this.#cutEvent(occ);
      return;
    }
    if (this.editable && matchesHotkey(e, 'mod+v')) {
      e.preventDefault();
      this.#paste(r.cell);
      return;
    }
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.#activateEvent(occ);
        return;
      case 'Escape':
      case 'F2':
        // Back to the cell; a pending move is cancelled by Escape on a cell.
        e.preventDefault();
        e.stopPropagation();
        this.#setFocus(r.cell.row, r.cell.col);
        return;
      case 'Delete':
      case 'Backspace':
        if (!this.#canEdit(occ)) return;
        e.preventDefault();
        emit(this.host, 'aui-event-delete', { occurrence: occ, event: copyEvent(occ.event) } satisfies SchedulerEventDeleteDetail);
        return;
    }
    const time = this.#view === 'day' || this.#view === 'week' || this.#view === 'workWeek';
    const vertical = time && !occ.allDay;
    if (e.shiftKey && this.#canEdit(occ) && (vertical ? e.key === 'ArrowDown' || e.key === 'ArrowUp' : e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const grow = vertical ? e.key === 'ArrowDown' : (e.key === 'ArrowRight') !== rtl;
      this.#resizeBy(occ, grow ? 1 : -1);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = r.cell.events;
      const i = list.indexOf(key) + (e.key === 'ArrowDown' ? 1 : -1);
      const next = list[i];
      if (next !== undefined) this.#focusEventKey(next);
      else if (e.key === 'ArrowDown') r.cell.el.querySelector<HTMLElement>('.aui-scheduler__more')?.focus();
    }
  }

  #onAgendaKey(e: KeyboardEvent): void {
    const key = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('.aui-scheduler__event')?.dataset.auiKey : undefined;
    if (key === undefined) return;
    const keys = [...this.#rendered.keys()];
    const i = keys.indexOf(key);
    const occ = this.#occByKey.get(key);
    let next: string | undefined;
    switch (e.key) {
      case 'ArrowDown':
        next = keys[i + 1];
        break;
      case 'ArrowUp':
        next = keys[i - 1];
        break;
      case 'Home':
        next = keys[0];
        break;
      case 'End':
        next = keys[keys.length - 1];
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (occ) this.#activateEvent(occ);
        return;
      case 'PageUp':
      case 'PageDown':
        e.preventDefault();
        this.#shift(e.key === 'PageUp' ? -1 : 1);
        this.#focusCurrent();
        return;
      default:
        return;
    }
    e.preventDefault();
    if (next !== undefined) this.#focusEventKey(next);
  }

  #renderSelection(): void {
    for (const row of this.#grid) for (const cell of row ?? []) cell.el.classList.remove('aui-scheduler__cell--selected');
    const a = this.#anchor;
    if (!a) return;
    for (const cell of this.#selectedCells(this.#cellAt(a.row, a.col), this.#cellAt(this.#focus.row, this.#focus.col))) {
      cell.el.classList.add('aui-scheduler__cell--selected');
      cell.el.setAttribute('aria-selected', 'true');
    }
  }

  #selectedCells(a: Cell | undefined, b: Cell | undefined): Cell[] {
    if (!a || !b) return [];
    const out: Cell[] = [];
    if (this.#view === 'month') {
      const [s, e] = comparePlainDate(a.date, b.date) <= 0 ? [a.date, b.date] : [b.date, a.date];
      for (const row of this.#grid) for (const c of row ?? []) if (comparePlainDate(c.date, s) >= 0 && comparePlainDate(c.date, e) <= 0) out.push(c);
      return out;
    }
    if (this.#view === 'timeline') {
      const row = this.#grid[a.row] ?? [];
      const [s, e] = a.col <= b.col ? [a.col, b.col] : [b.col, a.col];
      return row.slice(s, e + 1);
    }
    const [s, e] = a.row <= b.row ? [a.row, b.row] : [b.row, a.row];
    for (let r = s; r <= e; r++) {
      const c = this.#cellAt(r, a.col);
      if (c) out.push(c);
    }
    return out;
  }

  // ---- activation ---------------------------------------------------------------------------

  #slotRange(a: Cell, b: Cell): SchedulerSlotActivateDetail {
    const c = this.#config();
    const cells = this.#selectedCells(a, b);
    const list = cells.length ? cells : [a];
    const first = list[0] ?? a;
    const last = list[list.length - 1] ?? a;
    const resourceId = a.resourceId ?? null;
    if (first.minutes === null || last.minutes === null) {
      const [s, e] = comparePlainDate(first.date, last.date) <= 0 ? [first.date, last.date] : [last.date, first.date];
      return { start: s, end: e, allDay: true, resourceId };
    }
    const toI = (date: PlainDate, minutes: number): Instant => (minutes >= 1440 ? startOfDay(addDays(date, 1), c.timezone, c.disambiguation) : toInstant(plainDateTime(date, plainTime(Math.floor(minutes / 60), minutes % 60)), c.timezone, c.disambiguation));
    return { start: toI(first.date, first.minutes), end: toI(last.date, last.minutes + last.length), allDay: false, resourceId };
  }

  #activateSlot(a: Cell, b: Cell): void {
    const detail = this.#slotRange(a, b);
    this.#anchor = null;
    this.#renderSelection();
    emit(this.host, 'aui-slot-activate', detail);
  }

  #activateEvent(occ: SchedulerOccurrence): void {
    emit(this.host, 'aui-event-activate', { occurrence: occ, event: copyEvent(occ.event) } satisfies SchedulerEventActivateDetail);
  }

  #showDay(iso: string): void {
    const [y, m, d] = iso.split('-').map(Number);
    if (y === undefined || m === undefined || d === undefined) return;
    this.#date = plainDate(y, m, d);
    this.#view = 'day';
    this.#scrolled = false;
    this.#focusInPeriod = false;
    this.#render();
    this.#load();
    this.#emitNavigate();
    this.#focusCurrent();
  }

  #onClick(e: MouseEvent): void {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const more = t.closest<HTMLElement>('.aui-scheduler__more');
    if (more) {
      this.#showDay(more.dataset.auiDate ?? '');
      return;
    }
    const key = t.closest<HTMLElement>('.aui-scheduler__event')?.dataset.auiKey;
    if (key !== undefined) {
      const occ = this.#occByKey.get(key);
      if (!occ) return;
      if (this.#rendered.has(key)) this.#focusEventKey(key);
      this.#activateEvent(occ);
      return;
    }
    const cell = this.#cellOf(t);
    if (cell) this.#setFocus(cell.row, cell.col);
  }

  // ---- pointer: range selection on cells -------------------------------------------------------

  #onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !(e.target instanceof Element) || e.target.closest('.aui-scheduler__event, .aui-scheduler__more')) return;
    const cell = this.#cellOf(e.target);
    if (!cell || this.#view === 'agenda') return;
    this.#pointerSelect = { anchor: cell, last: cell };
  }

  #onPointerMove(e: PointerEvent): void {
    const sel = this.#pointerSelect;
    if (!sel) return;
    const cell = this.#cellOf(e.target);
    if (!cell || cell === sel.last) return;
    const time = this.#view === 'day' || this.#view === 'week' || this.#view === 'workWeek';
    if (time && (cell.col !== sel.anchor.col || cell.row === 0 || sel.anchor.row === 0)) return;
    if (this.#view === 'timeline' && cell.row !== sel.anchor.row) return;
    sel.last = cell;
    this.#anchor = { row: sel.anchor.row, col: sel.anchor.col };
    this.#focus = { row: cell.row, col: cell.col };
    this.#renderSelection();
  }

  #onPointerUp(): void {
    const sel = this.#pointerSelect;
    this.#pointerSelect = null;
    if (!sel || sel.anchor === sel.last) return;
    this.#setFocus(sel.last.row, sel.last.col);
    this.#activateSlot(sel.anchor, sel.last);
  }

  // ---- pointer: moving and resizing events ------------------------------------------------------

  #eventDrag(r: Rendered): PointerDrag {
    const el = r.el;
    let mode: 'move' | 'resize' = 'move';
    let origin: Cell | null = null;
    let target: { start: Instant | PlainDate; end: Instant | PlainDate; resourceId: string | null | undefined } | null = null;
    let grabMinutes = 0;
    return trackPointerDrag(el, {
      canStart: (e) => {
        mode = e.target instanceof Element && e.target.closest('.aui-scheduler__resize') ? 'resize' : 'move';
        return this.#canEdit(r.occ);
      },
      onStart: (move) => {
        origin = this.#cellUnder(move.start.x, move.start.y, el);
        const at = origin ? this.#pointAt(origin, move.start.x, move.start.y) : null;
        grabMinutes = at !== null && !r.occ.allDay && origin?.minutes !== null ? at - this.#localStartMinutes(r.occ, origin?.date ?? r.cell.date) : 0;
        el.classList.add('aui-scheduler__event--dragging');
      },
      onMove: (move) => {
        const cell = this.#cellUnder(move.point.x, move.point.y, el);
        if (!cell || !origin) return;
        target = mode === 'move' ? this.#moveTarget(r.occ, origin, cell, move.point.x, move.point.y, grabMinutes) : this.#resizeTarget(r.occ, cell, move.point.x, move.point.y);
        this.#preview(el, origin, cell, move.dx, move.dy, mode, r.occ, target);
      },
      onEnd: () => {
        this.#endDrag(el);
        const t = target;
        target = null;
        if (t) this.#commit(r.occ, t.start, t.end, t.resourceId ?? undefined, mode, null);
      },
      onCancel: () => {
        target = null;
        this.#endDrag(el);
      },
    });
  }

  #endDrag(el: HTMLElement): void {
    el.classList.remove('aui-scheduler__event--dragging');
    el.style.removeProperty('translate');
    el.style.removeProperty('--aui-preview-span');
  }

  #preview(el: HTMLElement, origin: Cell, cell: Cell, dx: number, dy: number, mode: 'move' | 'resize', occ: SchedulerOccurrence, target: { start: Instant | PlainDate; end: Instant | PlainDate } | null): void {
    if (mode === 'resize') {
      if (!target) return;
      // The previewed length in the element's own units (slots or days).
      const c = this.#config();
      const days = occ.allDay || cell.minutes === null;
      const span = days
        ? daysBetween(occ.allDay ? (occ.start as PlainDate) : toPlainDateTime(occ.start as Instant, c.timezone).date, occ.allDay ? (target.end as PlainDate) : toPlainDateTime(instant((target.end as Instant).epochMilliseconds - 1), c.timezone).date) + 1
        : ((target.end as Instant).epochMilliseconds - (occ.start as Instant).epochMilliseconds) / (c.slotDuration * MINUTE);
      el.style.setProperty('--aui-preview-span', String(Math.max(0.25, span)));
      return;
    }
    const a = origin.el.getBoundingClientRect();
    const b = cell.el.getBoundingClientRect();
    const time = this.#view === 'day' || this.#view === 'week' || this.#view === 'workWeek';
    // Columns snap to cells; time views follow the pointer vertically.
    const x = this.#view === 'timeline' && cell.minutes !== null ? dx : b.left - a.left;
    const y = time && cell.minutes !== null ? dy : b.top - a.top;
    el.style.setProperty('translate', `${String(Math.round(x))}px ${String(Math.round(y))}px`);
  }

  #cellUnder(x: number, y: number, ignore: HTMLElement): Cell | null {
    for (const n of this.#doc.elementsFromPoint(x, y)) {
      if (ignore.contains(n)) continue;
      const cell = this.#cellOf(n);
      if (cell) return cell;
    }
    return null;
  }

  /** Minutes after midnight at a point in a time cell (time views: vertical; timeline: horizontal), snapped. */
  #pointAt(cell: Cell, x: number, y: number): number | null {
    if (cell.minutes === null) return null;
    const rect = cell.el.getBoundingClientRect();
    const rtl = this.#config().direction === 'rtl';
    const frac = this.#view === 'timeline' ? (rtl ? rect.right - x : x - rect.left) / Math.max(1, rect.width) : (y - rect.top) / Math.max(1, rect.height);
    const snap = this.#config().snapDuration;
    return cell.minutes + Math.round((Math.max(0, Math.min(1, frac)) * cell.length) / snap) * snap;
  }

  #localStartMinutes(occ: SchedulerOccurrence, date: PlainDate): number {
    if (occ.allDay) return 0;
    return this.#localMinutes(occ.start as Instant, date, this.#config().timezone);
  }

  #instantAt(date: PlainDate, minutes: number): Instant {
    const c = this.#config();
    const day = Math.floor(minutes / 1440);
    const m = ((minutes % 1440) + 1440) % 1440;
    return toInstant(plainDateTime(addDays(date, day), plainTime(Math.floor(m / 60), m % 60)), c.timezone, c.disambiguation);
  }

  #endFor(occ: SchedulerOccurrence, start: Instant | PlainDate): Instant | PlainDate {
    if (start.kind === 'PlainDate') return addDays(start, daysBetween(occ.start as PlainDate, occ.end as PlainDate));
    return instant(start.epochMilliseconds + ((occ.end as Instant).epochMilliseconds - (occ.start as Instant).epochMilliseconds));
  }

  /** New start (and end) when an occurrence is dropped on a cell: times keep their time of day on day cells. */
  #placeAt(occ: SchedulerOccurrence, cell: Cell, minutes: number | null): { start: Instant | PlainDate; end: Instant | PlainDate; resourceId: string | null | undefined } {
    const zone = this.#config().timezone;
    const resourceId = cell.resourceId;
    if (occ.allDay) {
      const start = cell.date;
      return { start, end: this.#endFor(occ, start), resourceId };
    }
    const time = minutes ?? minutesOf(toPlainDateTime(occ.start as Instant, zone).time);
    const start = this.#instantAt(cell.date, time);
    return { start, end: this.#endFor(occ, start), resourceId };
  }

  #moveTarget(occ: SchedulerOccurrence, origin: Cell, cell: Cell, x: number, y: number, grab: number): { start: Instant | PlainDate; end: Instant | PlainDate; resourceId: string | null | undefined } {
    const at = this.#pointAt(cell, x, y);
    if (at === null) {
      // Day cells: move by whole days from the grabbed day.
      const days = daysBetween(origin.date, cell.date);
      if (occ.allDay) {
        const start = addDays(occ.start as PlainDate, days);
        return { start, end: this.#endFor(occ, start), resourceId: cell.resourceId };
      }
      const zone = this.#config().timezone;
      const local = toPlainDateTime(occ.start as Instant, zone);
      const start = this.#instantAt(addDays(local.date, days), minutesOf(local.time));
      return { start, end: this.#endFor(occ, start), resourceId: cell.resourceId };
    }
    return this.#placeAt(occ, cell, Math.max(0, at - grab));
  }

  #resizeTarget(occ: SchedulerOccurrence, cell: Cell, x: number, y: number): { start: Instant | PlainDate; end: Instant | PlainDate; resourceId: string | null | undefined } | null {
    const at = this.#pointAt(cell, x, y);
    if (occ.allDay || at === null) {
      if (occ.allDay) {
        const end = comparePlainDate(cell.date, occ.start as PlainDate) < 0 ? (occ.start as PlainDate) : cell.date;
        return { start: occ.start, end, resourceId: undefined };
      }
      const zone = this.#config().timezone;
      const endLocal = toPlainDateTime(occ.end as Instant, zone);
      const end = this.#instantAt(cell.date, minutesOf(endLocal.time) || 1440);
      return end.epochMilliseconds > (occ.start as Instant).epochMilliseconds ? { start: occ.start, end, resourceId: undefined } : null;
    }
    const snap = this.#config().snapDuration;
    const end = this.#instantAt(cell.date, Math.max(at, 0));
    const min = (occ.start as Instant).epochMilliseconds + snap * MINUTE;
    return { start: occ.start, end: end.epochMilliseconds >= min ? end : instant(min), resourceId: undefined };
  }

  // ---- keyboard editing -----------------------------------------------------------------------------

  #cutEvent(occ: SchedulerOccurrence): void {
    if (!this.#canEdit(occ)) {
      announce(this.#msg('notAllowed', { title: occ.event.title }), 'assertive');
      return;
    }
    this.#cut = occ.key;
    for (const r of this.#rendered.values()) r.el.classList.toggle('aui-scheduler__event--cut', r.occ.key === occ.key);
    this.#syncEditButtons();
    announce(this.#msg('cutDone', { title: occ.event.title }), 'assertive');
  }

  #cancelCut(): void {
    this.#cut = null;
    for (const r of this.#rendered.values()) r.el.classList.remove('aui-scheduler__event--cut');
    this.#syncEditButtons();
    announce(this.#msg('cutCancelled'));
  }

  #paste(cell: Cell): void {
    const key = this.#cut;
    if (key === null) return;
    const occ = this.#occByKey.get(key);
    if (!occ) return;
    const t = this.#placeAt(occ, cell, cell.minutes);
    this.#cut = null;
    void this.#commitAsync(occ, t.start, t.end, t.resourceId ?? undefined, 'move', null);
  }

  #resizeBy(occ: SchedulerOccurrence, dir: 1 | -1): void {
    if (!this.#canEdit(occ)) {
      announce(this.#msg('notAllowed', { title: occ.event.title }), 'assertive');
      return;
    }
    const c = this.#config();
    let end: Instant | PlainDate;
    if (occ.allDay) {
      end = addDays(occ.end as PlainDate, dir);
      if (comparePlainDate(end, occ.start as PlainDate) < 0) return;
    } else {
      const time = this.#view === 'day' || this.#view === 'week' || this.#view === 'workWeek' || (this.#view === 'timeline' && c.timelineScale === 'day');
      const step = time ? c.snapDuration * MINUTE : 86_400_000;
      const next = (occ.end as Instant).epochMilliseconds + dir * step;
      if (next <= (occ.start as Instant).epochMilliseconds) return;
      end = time ? instant(next) : this.#endShiftDays(occ.end as Instant, dir);
    }
    void this.#commitAsync(occ, occ.start, end, undefined, 'resize', null);
  }

  #endShiftDays(end: Instant, dir: 1 | -1): Instant {
    const c = this.#config();
    const local = toPlainDateTime(end, c.timezone);
    return toInstant(plainDateTime(addDays(local.date, dir), local.time), c.timezone, c.disambiguation);
  }

  // ---- committing changes -------------------------------------------------------------------------

  #commit(occ: SchedulerOccurrence, start: Instant | PlainDate, end: Instant | PlainDate, resourceId: string | undefined, reason: 'move' | 'resize', scope: SchedulerEditScope | null): boolean {
    if (occ.recurring && scope === null) {
      void this.#commitAsync(occ, start, end, resourceId, reason, null);
      return true;
    }
    return this.#apply(occ, start, end, resourceId, reason, scope ?? 'occurrence');
  }

  async #commitAsync(occ: SchedulerOccurrence, start: Instant | PlainDate, end: Instant | PlainDate, resourceId: string | undefined, reason: 'move' | 'resize', scope: SchedulerEditScope | null): Promise<void> {
    let chosen = scope;
    if (chosen === null) {
      const configured = this.#options.recurringEditScope ?? 'ask';
      chosen = !occ.recurring ? 'occurrence' : configured === 'ask' ? await this.#askScope(occ) : configured;
    }
    if (chosen === null) {
      this.#render();
      this.#focusEventKey(occ.key);
      return;
    }
    this.#apply(occ, start, end, resourceId, reason, chosen);
  }

  #askScope(occ: SchedulerOccurrence): Promise<SchedulerEditScope | null> {
    const title = occ.event.title;
    this.#dialog?.destroy();
    const dialog = Dialog.create({
      title: this.#msg('recurringTitle'),
      description: this.#msg('recurringText', { title }),
      size: 'sm',
      actions: [
        { label: this.#msg('cancel'), value: '', variant: 'secondary' },
        { label: this.#msg('scopeSeries'), value: 'series', variant: 'secondary' },
        { label: this.#msg('scopeFollowing'), value: 'following', variant: 'secondary' },
        { label: this.#msg('scopeOccurrence'), value: 'occurrence', autofocus: true },
      ],
    }, this.#doc);
    this.#dialog = dialog;
    return new Promise((resolve) => {
      dialog.element.addEventListener('aui-close', (e) => {
        const value = (e as CustomEvent<{ returnValue: string }>).detail.returnValue;
        resolve(value === 'occurrence' || value === 'following' || value === 'series' ? value : null);
        dialog.destroy();
        if (this.#dialog === dialog) this.#dialog = null;
      }, { once: true });
      dialog.open();
    });
  }

  #apply(occ: SchedulerOccurrence, start: Instant | PlainDate, end: Instant | PlainDate, resourceId: string | undefined, reason: 'move' | 'resize', scope: SchedulerEditScope): boolean {
    const c = this.#config();
    const createIdFn = this.#options.createId ?? ((base: Readonly<SchedulerEvent>, hint: string): string => `${base.id}~${hint}`);
    const taken = new Set(this.#events.map((e) => e.id));
    const result = applyEdit(this.#events, {
      occurrence: occ,
      start,
      end,
      resourceId,
      scope,
      timeZone: c.timezone,
      disambiguation: c.disambiguation,
      createId: (base, hint) => {
        let id = createIdFn(base, hint);
        for (let n = 2; taken.has(id); n++) id = `${createIdFn(base, hint)}-${String(n)}`;
        taken.add(id);
        return id;
      },
    });
    if (!result) {
      this.#render();
      return false;
    }
    if (!this.#emitChange(reason, occ, scope, result.events, result.changes)) {
      this.#render();
      return false;
    }
    const before = this.#events;
    const limit = c.historyLimit;
    if (limit > 0) {
      this.#history.push({ before, after: result.events });
      if (this.#history.length > limit) this.#history.shift();
    }
    this.#future = [];
    const inBody = this.#body.contains(this.#doc.activeElement);
    this.#focusEvent = null;
    this.#setEvents(result.events);
    // Focus follows the edited event (its key changes when an exception was created).
    const newKey = this.#findEdited(occ, result.changes, start);
    if (newKey !== null && inBody && this.#rendered.has(newKey)) this.#focusEventKey(newKey);
    else if (newKey !== null) this.#active = newKey;
    this.#syncEditButtons();
    const edited = newKey === null ? undefined : this.#occByKey.get(newKey);
    const when = edited ? this.#whenText(edited, c) : '';
    announce(this.#msg(reason === 'move' ? 'moved' : 'resized', { title: occ.event.title, time: when }));
    return true;
  }

  #whenText(occ: SchedulerOccurrence, c: Resolved): string {
    if (occ.allDay) return this.#msg('range', { start: formatPlainDate(occ.start as PlainDate, { dateStyle: 'medium' }, c.locale), end: formatPlainDate(occ.end as PlainDate, { dateStyle: 'medium' }, c.locale) });
    return this.#msg('range', { start: formatInstant(occ.start as Instant, { dateStyle: 'medium', timeStyle: 'short' }, c.timezone, c.locale), end: formatInstant(occ.end as Instant, { timeStyle: 'short' }, c.timezone, c.locale) });
  }

  #findEdited(occ: SchedulerOccurrence, changes: SchedulerEventChanges, start: Instant | PlainDate): string | null {
    const ids = new Set([...changes.added, ...changes.updated].map((e) => e.id));
    const at = startKey(start);
    const hit = this.#occ.find((o) => ids.has(o.event.id) && startKey(o.start) === at) ?? this.#occ.find((o) => o.key === occ.key);
    return hit?.key ?? null;
  }

  #emitChange(reason: SchedulerChangeReason, occ: SchedulerOccurrence | null, scope: SchedulerEditScope | null, events: SchedulerEvent[], changes?: SchedulerEventChanges): boolean {
    const detail: SchedulerEventChangeDetail = {
      reason,
      occurrence: occ,
      scope,
      changes: changes ?? diffEvents(this.#events, events),
      events: events.map(copyEvent),
    };
    return emit(this.host, 'aui-event-change', detail, { cancelable: true });
  }
}

const VIRTUAL_ROWS = 60;

interface TimelineRow {
  readonly r: { id: string | null; label: string };
  readonly row: number;
  readonly placed: { o: SchedulerOccurrence; p: { start: number; end: number } }[];
  readonly lanes: { lanes: Map<string, number>; count: number };
}

/** Changes between two event lists (by id and identity). */
function diffEvents(before: readonly SchedulerEvent[], after: readonly SchedulerEvent[]): SchedulerEventChanges {
  const b = new Map(before.map((e) => [e.id, e]));
  const a = new Map(after.map((e) => [e.id, e]));
  const changes: SchedulerEventChanges = { added: [], updated: [], removed: [] };
  for (const [id, e] of a) {
    const prev = b.get(id);
    if (!prev) changes.added.push(copyEvent(e));
    else if (prev !== e) changes.updated.push(copyEvent(e));
  }
  for (const id of b.keys()) if (!a.has(id)) changes.removed.push(id);
  return changes;
}
