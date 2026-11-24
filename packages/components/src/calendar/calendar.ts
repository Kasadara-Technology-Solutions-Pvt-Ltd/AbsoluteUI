/**
 * Calendar (SPEC section 18.7). A month grid following the WAI-ARIA APG date picker
 * grid: a `table role="grid"` whose day cells are the focusable gridcells
 * (roving tabindex, exactly one day tabbable). Values are `PlainDate` (section 8.4).
 * "Today" is the current date in the configured timezone (UTC by default,
 * section 8.1), never the host machine's zone.
 *
 * Since R2 the calendar can show several consecutive months (one grid per month,
 * one roving tab stop across all of them) and select a date range: the first pick
 * sets an anchor, the days between the anchor and the hovered or focused day are
 * previewed, and the second pick completes the range.
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
  DisposableGroup,
  emit,
  fieldsToEpoch,
  formatNumber,
  formatPlainDate,
  getFirstDayOfWeek,
  getMessage,
  now,
  plainDate,
  plainDatesEqual,
  registerMessages,
  toPlainDateTime,
  validators,
  type PlainDate,
  type Range,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce } from '@absoluteui/utilities';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import { assertBusinessDayOptions, isUnavailable } from '../internal/business-days.js';

export interface CalendarConfig {
  /** Show days of the previous and next month in the first and last week. */
  showOutsideDays: boolean;
  /** Show ISO 8601 week numbers as row headers. */
  showWeekNumbers: boolean;
}

type Inherited = 'locale' | 'timezone' | 'direction';
type Resolved = Readonly<CalendarConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    calendar: CalendarConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' };
  }
}

export const calendarConfig = defineComponentConfig<CalendarConfig, Inherited>(
  'calendar',
  {
    showOutsideDays: { default: true, expected: 'boolean', validate: validators.isBoolean },
    showWeekNumbers: { default: false, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'timezone', 'direction'],
);

registerMessages('calendar', 'en', {
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  week: 'Week',
  weekShort: 'Wk',
  weekNumber: 'Week {week}',
  gridLabel: '{label}, {month}',
  rangeStartDay: '{date}, start of range',
  rangeEndDay: '{date}, end of range',
  rangeSingleDay: '{date}, start and end of range',
  rangeAnchor: '{date} selected as the first day. Choose the last day.',
  nonWorkingDay: '{date}, non-working day',
  holiday: '{date}, {holiday}, non-working day',
});

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type CalendarSelectionMode = 'single' | 'range';

export interface CalendarMonth {
  readonly year: number;
  /** 1-12 */
  readonly month: number;
}

export interface CalendarIcons {
  previous: IconRef;
  next: IconRef;
}

export interface CalendarOptions extends Partial<CalendarConfig> {
  value?: PlainDate | null;
  /**
   * `'range'`: the first pick sets an anchor, the second completes `range` (in either
   * order). `value` is not used in range mode. Default `'single'`.
   */
  selectionMode?: CalendarSelectionMode;
  /** Selected range (inclusive) in range mode. */
  range?: Range<PlainDate> | null;
  /** Range mode: minimum range length in days, counting the first and last day. */
  minDays?: number;
  /** Range mode: maximum range length in days, counting the first and last day. */
  maxDays?: number;
  /**
   * Consecutive months shown side by side (1-3). Outside days are never shown with
   * more than one month, so every date appears once. Default 1.
   */
  visibleMonths?: number;
  /** Inclusive lower bound; earlier days are disabled and focus never moves before it. */
  min?: PlainDate | null;
  /** Inclusive upper bound. */
  max?: PlainDate | null;
  /** Return true to disable a day (focusable, announced as unavailable, not selectable). */
  isDateDisabled?: (date: PlainDate) => boolean;
  /** Business calendar (since 0.9.0): non-working days and holidays are marked and named. */
  businessCalendar?: BusinessCalendarEngine | null;
  /** With `businessCalendar`: non-working days are disabled (since 0.9.0). */
  disableNonWorking?: boolean;
  /** Initially focused day, which also sets the visible month. Default: value, else today. */
  focusedDate?: PlainDate;
  /** First column of the grid. Default: the locale's first day of week. */
  firstDayOfWeek?: Weekday;
  /** Grid accessible name. Default: the visible month-year heading. */
  label?: string;
  /**
   * Advanced: fixed "today" instead of the current date in `timezone`.
   * For tests, server rendering, and demos with a fixed clock.
   */
  today?: PlainDate;
  locale?: string;
  timezone?: string;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<CalendarIcons>;
}

export interface CalendarChangeDetail {
  /** The picked day. */
  value: PlainDate;
  /** Range mode only: the completed range. */
  range?: Range<PlainDate>;
}

export interface CalendarNavigateDetail {
  /** The first visible month. */
  month: CalendarMonth;
}

const ROWS = 6;
const MAX_VISIBLE_MONTHS = 3;

const monthIndex = (d: { year: number; month: number }): number => d.year * 12 + d.month - 1;
const monthOf = (index: number): CalendarMonth => ({ year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 });
const isPlainDate = (v: unknown): v is PlainDate => typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'PlainDate';
const daysBetween = (a: PlainDate, b: PlainDate): number => Math.round((fieldsToEpoch(b.year, b.month, b.day) - fieldsToEpoch(a.year, a.month, a.day)) / 86_400_000);

/** ISO 8601 week number of a date. */
export function isoWeekNumber(date: PlainDate): number {
  const thursday = addDays(date, 4 - dayOfWeek(date));
  const dayOfYear = Math.round((fieldsToEpoch(thursday.year, thursday.month, thursday.day) - fieldsToEpoch(thursday.year, 1, 1)) / 86_400_000);
  return Math.floor(dayOfYear / 7) + 1;
}

interface Row {
  readonly tr: HTMLTableRowElement;
  readonly week: HTMLTableCellElement;
  readonly days: HTMLTableCellElement[];
}

/** One month: its header, heading, and grid. */
interface Panel {
  /** Wrapper element with several months; null for the single-month layout. */
  root: HTMLDivElement | null;
  readonly header: HTMLDivElement;
  readonly heading: HTMLDivElement;
  readonly grid: HTMLTableElement;
  readonly weekHeader: HTMLTableCellElement;
  readonly weekdays: HTMLTableCellElement[];
  readonly rows: Row[];
}

/** Visual range state: a committed range, or the preview from a pending anchor. */
interface RangeState {
  readonly start: PlainDate;
  readonly end: PlainDate;
  readonly pending: boolean;
}

export class Calendar {
  readonly host: HTMLElement;
  /** The `table role="grid"` of the first visible month. */
  readonly grid: HTMLTableElement;
  #options: CalendarOptions;
  #value: PlainDate | null;
  #range: Range<PlainDate> | null;
  /** Range mode: the first pick, while the range is incomplete. */
  #anchor: PlainDate | null = null;
  /** Range mode: the day under the pointer, for the preview. */
  #hover: PlainDate | null = null;
  #focused: PlainDate;
  /** Month index of the first visible month. */
  #start: number;
  readonly #doc: Document;
  readonly #prev: HTMLButtonElement;
  readonly #next: HTMLButtonElement;
  readonly #months: HTMLDivElement;
  #panels: Panel[] = [];
  readonly #dates = new Map<HTMLTableCellElement, PlainDate>();
  readonly #group = new DisposableGroup();

  /** Render a calendar into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: CalendarOptions = {}): Calendar {
    return new Calendar(host, options);
  }

  private constructor(host: HTMLElement, options: CalendarOptions) {
    this.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#value = options.value ?? null;
    this.#range = options.range ?? null;
    const doc = this.#doc;

    this.#prev = doc.createElement('button');
    this.#prev.type = 'button';
    this.#prev.className = 'aui-calendar__nav aui-calendar__prev';
    this.#next = doc.createElement('button');
    this.#next.type = 'button';
    this.#next.className = 'aui-calendar__nav aui-calendar__next';
    this.#months = doc.createElement('div');
    this.#months.className = 'aui-calendar__months';
    const first = this.#createPanel();
    // Announces the new month when the user navigates (first month only, so paging is read once).
    first.heading.setAttribute('aria-live', 'polite');
    this.grid = first.grid;
    this.#panels = [first];

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#focused = this.#clamp(options.focusedDate ?? options.value ?? options.range?.start ?? this.#today());
    this.#start = monthIndex(this.#focused);
    host.classList.add('aui-calendar');
    this.#layout();
    this.#render();
    this.#bindEvents();
    this.#group.add(calendarConfig.subscribe(() => {
      this.#render();
    }));
  }

  get value(): PlainDate | null {
    return this.#value;
  }

  /** Range mode: the selected range (not the pending anchor). */
  get range(): Range<PlainDate> | null {
    return this.#range;
  }

  /** Range mode: the first picked day while the range is incomplete, else null. */
  get rangeAnchor(): PlainDate | null {
    return this.#anchor;
  }

  /** The day that holds the roving tab stop. */
  get focusedDate(): PlainDate {
    return this.#focused;
  }

  /** The first visible month. */
  get visibleMonth(): CalendarMonth {
    return monthOf(this.#start);
  }

  /** All month grids, first to last (one per visible month). */
  get grids(): readonly HTMLTableElement[] {
    return this.#panels.map((p) => p.grid);
  }

  /** The current date in the configured timezone (or the `today` option). */
  get today(): PlainDate {
    return this.#today();
  }

  get options(): Readonly<CalendarOptions> {
    return this.#options;
  }

  /** Set the selected day programmatically (no events); a date also becomes the focused day. */
  setValue(value: PlainDate | null): void {
    this.#assertDate(value, 'value');
    this.#value = value;
    if (value) this.#focus(value);
    this.#render();
  }

  /**
   * Range mode: set the selected range programmatically (no events). A pending anchor
   * is discarded; the first day becomes the focused day.
   */
  setRange(range: Range<PlainDate> | null): void {
    this.#assertRange(range);
    this.#range = range;
    this.#anchor = null;
    this.#hover = null;
    if (range) this.#focus(range.start);
    this.#render();
  }

  /** Show the month of `date` and make it the focused day (no events). Keeps DOM focus inside the grid. */
  goTo(date: PlainDate): void {
    this.#assertDate(date, 'focusedDate');
    this.#moveTo(date, false);
  }

  /** Move DOM focus to the focused day. */
  focus(): void {
    this.#cellFor(this.#focused)?.focus();
  }

  update(options: Partial<CalendarOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    const layoutChanged = (next.visibleMonths ?? 1) !== (this.#options.visibleMonths ?? 1);
    this.#options = next;
    if ('value' in options) this.#value = options.value ?? null;
    if ('range' in options) this.#range = options.range ?? null;
    if ('range' in options || 'selectionMode' in options || 'minDays' in options || 'maxDays' in options) {
      this.#anchor = null;
      this.#hover = null;
    }
    const target = options.focusedDate ?? ('value' in options && options.value ? options.value : 'range' in options && options.range ? options.range.start : this.#focused);
    this.#focus(target);
    if (layoutChanged) this.#layout();
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.#dates.clear();
    this.host.replaceChildren();
    this.host.classList.remove('aui-calendar', 'aui-calendar--multi');
  }

  #config(): Resolved {
    const o = this.#options;
    return calendarConfig.resolve({
      ...(o.showOutsideDays === undefined ? {} : { showOutsideDays: o.showOutsideDays }),
      ...(o.showWeekNumbers === undefined ? {} : { showWeekNumbers: o.showWeekNumbers }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.timezone === undefined ? {} : { timezone: o.timezone }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #fail(property: string, expected: string): never {
    throw configurationError('CALENDAR_OPTIONS', 'Invalid calendar options.', { component: 'calendar', property: `calendar.${property}`, expected });
  }

  #assertDate(value: unknown, property: string): void {
    if (value !== null && value !== undefined && !isPlainDate(value)) this.#fail(property, 'PlainDate');
  }

  #assertRange(range: unknown): void {
    if (range === null || range === undefined) return;
    if (typeof range !== 'object' || !('start' in range) || !('end' in range) || !isPlainDate(range.start) || !isPlainDate(range.end)) {
      this.#fail('range', '{ start: PlainDate; end: PlainDate } or null');
    } else if (comparePlainDate(range.start, range.end) > 0) this.#fail('range', 'start <= end');
  }

  #assertOptions(o: CalendarOptions): void {
    for (const key of ['value', 'min', 'max', 'focusedDate', 'today'] as const) this.#assertDate(o[key], key);
    if (o.min && o.max && comparePlainDate(o.min, o.max) > 0) this.#fail('min', 'min <= max');
    if (o.firstDayOfWeek !== undefined && !validators.integerInRange(1, 7)(o.firstDayOfWeek)) this.#fail('firstDayOfWeek', 'integer 1 (Monday) to 7 (Sunday)');
    if (o.isDateDisabled !== undefined && typeof o.isDateDisabled !== 'function') this.#fail('isDateDisabled', '(date: PlainDate) => boolean');
    assertBusinessDayOptions(o, (property, expected) => this.#fail(property, expected));
    if (o.label !== undefined && (typeof o.label !== 'string' || o.label.trim() === '')) this.#fail('label', 'non-empty string');
    if (o.selectionMode !== undefined && !validators.oneOf(['single', 'range'] as const)(o.selectionMode)) this.#fail('selectionMode', '"single" | "range"');
    this.#assertRange(o.range);
    for (const key of ['minDays', 'maxDays'] as const) {
      const v = o[key];
      if (v !== undefined && !validators.integerInRange(1, 100_000)(v)) this.#fail(key, 'positive integer (days)');
    }
    if (o.minDays !== undefined && o.maxDays !== undefined && o.minDays > o.maxDays) this.#fail('minDays', 'minDays <= maxDays');
    if (o.visibleMonths !== undefined && !validators.integerInRange(1, MAX_VISIBLE_MONTHS)(o.visibleMonths)) this.#fail('visibleMonths', `integer 1..${String(MAX_VISIBLE_MONTHS)}`);
  }

  #today(): PlainDate {
    return this.#options.today ?? toPlainDateTime(now(), this.#config().timezone).date;
  }

  #firstDay(config: Resolved): number {
    return this.#options.firstDayOfWeek ?? getFirstDayOfWeek(config.locale);
  }

  #count(): number {
    return this.#options.visibleMonths ?? 1;
  }

  #isRange(): boolean {
    return this.#options.selectionMode === 'range';
  }

  #clamp(date: PlainDate): PlainDate {
    const { min, max } = this.#options;
    if (min && comparePlainDate(date, min) < 0) return min;
    if (max && comparePlainDate(date, max) > 0) return max;
    return date;
  }

  /**
   * Make `date` (clamped) the focused day and scroll the visible months to it. With
   * several months, the view also stops at min and max (no fully disabled months).
   */
  #focus(date: PlainDate): void {
    this.#focused = this.#clamp(date);
    const index = monthIndex(this.#focused);
    const count = this.#count();
    if (index < this.#start) this.#start = index;
    else if (index > this.#start + count - 1) this.#start = index - count + 1;
    // Both adjustments keep the focused day visible because it lies within [min, max].
    const { min, max } = this.#options;
    if (max) this.#start = Math.min(this.#start, monthIndex(max) - count + 1);
    if (min) this.#start = Math.max(this.#start, monthIndex(min));
  }

  #isVisible(date: PlainDate): boolean {
    const index = monthIndex(date);
    return index >= this.#start && index < this.#start + this.#count();
  }

  #isDisabled(date: PlainDate): boolean {
    const { min, max, minDays, maxDays } = this.#options;
    if (min && comparePlainDate(date, min) < 0) return true;
    if (max && comparePlainDate(date, max) > 0) return true;
    if (isUnavailable(this.#options, date)) return true;
    // While an anchor is pending, days that would make the range too short or too long cannot end it.
    if (this.#anchor && this.#isRange()) {
      const length = Math.abs(daysBetween(this.#anchor, date)) + 1;
      if ((minDays !== undefined && length < minDays) || (maxDays !== undefined && length > maxDays)) return true;
    }
    return false;
  }

  #cellFor(date: PlainDate): HTMLTableCellElement | undefined {
    for (const [td, d] of this.#dates) if (plainDatesEqual(d, date)) return td;
    return undefined;
  }

  #createPanel(): Panel {
    const doc = this.#doc;
    const header = doc.createElement('div');
    header.className = 'aui-calendar__header';
    const heading = doc.createElement('div');
    heading.className = 'aui-calendar__heading';
    heading.id = createId('aui-calendar-heading');
    const grid = doc.createElement('table');
    grid.className = 'aui-calendar__grid';
    grid.setAttribute('role', 'grid');
    const thead = doc.createElement('thead');
    const headRow = doc.createElement('tr');
    const weekHeader = doc.createElement('th');
    weekHeader.scope = 'col';
    weekHeader.className = 'aui-calendar__week-header';
    headRow.append(weekHeader);
    const weekdays: HTMLTableCellElement[] = [];
    for (let c = 0; c < 7; c++) {
      const th = doc.createElement('th');
      th.scope = 'col';
      th.className = 'aui-calendar__weekday';
      weekdays.push(th);
      headRow.append(th);
    }
    thead.append(headRow);
    const tbody = doc.createElement('tbody');
    const rows: Row[] = [];
    for (let r = 0; r < ROWS; r++) {
      const tr = doc.createElement('tr');
      const week = doc.createElement('th');
      week.scope = 'row';
      week.className = 'aui-calendar__week-number';
      tr.append(week);
      const cells: HTMLTableCellElement[] = [];
      for (let c = 0; c < 7; c++) {
        const td = doc.createElement('td');
        cells.push(td);
        tr.append(td);
      }
      rows.push({ tr, week, days: cells });
      tbody.append(tr);
    }
    grid.append(thead, tbody);
    return { root: null, header, heading, grid, weekHeader, weekdays, rows };
  }

  /**
   * One month: host > header (prev, heading, next) + grid, as in R1. Several months:
   * host > months > panel (header, grid) per month; the previous-month button sits in
   * the first header and the next-month button in the last.
   */
  #layout(): void {
    const count = this.#count();
    while (this.#panels.length < count) this.#panels.push(this.#createPanel());
    this.#panels.length = count;
    const [first] = this.#panels;
    if (!first) return;
    this.host.classList.toggle('aui-calendar--multi', count > 1);
    if (count === 1) {
      first.root = null;
      first.header.replaceChildren(this.#prev, first.heading, this.#next);
      this.host.replaceChildren(first.header, first.grid);
      return;
    }
    const spacer = (): HTMLSpanElement => {
      const s = this.#doc.createElement('span');
      s.className = 'aui-calendar__nav-spacer';
      return s;
    };
    this.#panels.forEach((panel, i) => {
      panel.root ??= this.#doc.createElement('div');
      panel.root.className = 'aui-calendar__month';
      panel.header.replaceChildren(i === 0 ? this.#prev : spacer(), panel.heading, i === count - 1 ? this.#next : spacer());
      panel.root.replaceChildren(panel.header, panel.grid);
    });
    this.#months.replaceChildren(...this.#panels.flatMap((p) => (p.root ? [p.root] : [])));
    this.host.replaceChildren(this.#months);
  }

  #bindEvents(): void {
    const g = this.#group;
    g.listen(this.#prev, 'click', () => {
      this.#page(-1);
    });
    g.listen(this.#next, 'click', () => {
      this.#page(1);
    });
    // Listeners live on the host, so they cover every month grid.
    g.listen(this.host, 'keydown', (event) => {
      this.#onKeyDown(event);
    });
    g.listen(this.host, 'click', (event) => {
      const td = event.target instanceof Element ? event.target.closest('td') : null;
      const date = td ? this.#dates.get(td) : undefined;
      if (date) this.#select(date);
    });
    // Pointer focus on a day of a visible month keeps the roving tab stop in sync.
    g.listen(this.host, 'focusin', (event) => {
      const date = event.target instanceof HTMLTableCellElement ? this.#dates.get(event.target) : undefined;
      if (!date || !this.#isVisible(date) || plainDatesEqual(date, this.#focused)) return;
      this.#focused = date;
      this.#renderTabStops();
    });
    // Range preview follows the pointer. pointermove (not pointerover), which does not fire
    // when content appears under a stationary cursor.
    g.listen(this.host, 'pointermove', (event) => {
      if (!this.#anchor) return;
      const td = event.target instanceof Element ? event.target.closest('td') : null;
      const date = td ? (this.#dates.get(td) ?? null) : null;
      if (date && !plainDatesEqual(date, this.#hover)) {
        this.#hover = date;
        this.#renderRange();
      }
    });
    g.listen(this.host, 'pointerleave', () => {
      if (this.#hover === null) return;
      this.#hover = null;
      this.#renderRange();
    });
  }

  /** Previous/next month buttons: focus stays on the button (APG). */
  #page(delta: -1 | 1): void {
    const button = delta < 0 ? this.#prev : this.#next;
    if (button.getAttribute('aria-disabled') === 'true') return;
    this.#shift(delta, false);
  }

  /** Scroll the visible months by `delta` and move the focused day by the same amount. */
  #shift(delta: number, focusCell: boolean): void {
    const before = this.#start;
    const hadFocus = this.#hasGridFocus();
    const target = addMonths(this.#focused, delta);
    this.#start += delta;
    this.#focus(target);
    this.#render();
    if (focusCell || hadFocus) this.focus();
    this.#emitNavigate(before);
  }

  #hasGridFocus(): boolean {
    const active = this.#doc.activeElement;
    return this.#panels.some((p) => p.grid.contains(active));
  }

  #onKeyDown(event: KeyboardEvent): void {
    const base = event.target instanceof HTMLTableCellElement ? this.#dates.get(event.target) : undefined;
    if (!base) return;
    const rtl = this.#config().direction === 'rtl';
    const offset = (dayOfWeek(base) - this.#firstDay(this.#config()) + 7) % 7;
    let target: PlainDate;
    switch (event.key) {
      case 'ArrowRight':
        target = addDays(base, rtl ? -1 : 1);
        break;
      case 'ArrowLeft':
        target = addDays(base, rtl ? 1 : -1);
        break;
      case 'ArrowDown':
        target = addDays(base, 7);
        break;
      case 'ArrowUp':
        target = addDays(base, -7);
        break;
      case 'Home':
        target = addDays(base, -offset);
        break;
      case 'End':
        target = addDays(base, 6 - offset);
        break;
      case 'PageUp':
      case 'PageDown':
        event.preventDefault();
        this.#shift((event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1), true);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.#select(base);
        return;
      case 'Escape':
        // Range mode: Escape discards a pending first day (an enclosing popup may close first).
        if (!this.#anchor) return;
        event.preventDefault();
        this.#anchor = null;
        this.#hover = null;
        this.#render();
        return;
      default:
        return;
    }
    event.preventDefault();
    this.#moveTo(target, true, true);
  }

  /** Move the focused day; re-render when the visible months change. */
  #moveTo(date: PlainDate, fromUser: boolean, focusCell = false): void {
    const before = this.#start;
    const hadFocus = this.#hasGridFocus();
    this.#focus(date);
    if (this.#start !== before) this.#render();
    else this.#renderTabStops();
    if (focusCell || hadFocus) this.focus();
    if (this.#start !== before && fromUser) emit(this.host, 'aui-navigate', { month: this.visibleMonth } satisfies CalendarNavigateDetail);
  }

  #select(date: PlainDate): void {
    if (this.#isDisabled(date)) return;
    const before = this.#start;
    this.#focus(date);
    let detail: CalendarChangeDetail = { value: date };
    if (this.#isRange()) {
      const anchor = this.#anchor;
      this.#hover = null;
      if (!anchor) {
        // First pick: wait for the last day. No change event until the range is complete.
        this.#anchor = date;
        this.#render();
        this.focus();
        this.#emitNavigate(before);
        const locale = this.#config().locale;
        announce(getMessage('calendar', 'rangeAnchor', { date: formatPlainDate(date, { dateStyle: 'long' }, locale) }, locale), 'polite', this.#doc);
        return;
      }
      const range: Range<PlainDate> = Object.freeze(comparePlainDate(anchor, date) <= 0 ? { start: anchor, end: date } : { start: date, end: anchor });
      this.#anchor = null;
      this.#range = range;
      detail = { value: date, range };
    } else {
      this.#value = date;
    }
    this.#render();
    this.focus();
    this.#emitNavigate(before);
    emit(this.host, 'aui-change', detail);
  }

  #emitNavigate(before: number): void {
    if (this.#start !== before) emit(this.host, 'aui-navigate', { month: this.visibleMonth } satisfies CalendarNavigateDetail);
  }

  #renderTabStops(): void {
    for (const [td, d] of this.#dates) td.tabIndex = plainDatesEqual(d, this.#focused) ? 0 : -1;
    // The preview follows keyboard focus as well as the pointer.
    if (this.#anchor) this.#renderRange();
  }

  #rangeState(): RangeState | null {
    if (!this.#isRange()) return null;
    const anchor = this.#anchor;
    if (anchor) {
      const other = this.#hover ?? this.#focused;
      // A day that cannot end the range previews nothing beyond the anchor.
      const end = this.#isDisabled(other) ? anchor : other;
      return comparePlainDate(anchor, end) <= 0 ? { start: anchor, end, pending: true } : { start: end, end: anchor, pending: true };
    }
    return this.#range ? { ...this.#range, pending: false } : null;
  }

  /** Update only the range classes (pointer and focus preview; no full re-render). */
  #renderRange(): void {
    const state = this.#rangeState();
    for (const [td, date] of this.#dates) this.#applyRange(td, date, state);
  }

  #applyRange(td: HTMLTableCellElement, date: PlainDate, state: RangeState | null): void {
    const inRange = state !== null && comparePlainDate(date, state.start) >= 0 && comparePlainDate(date, state.end) <= 0;
    const isStart = inRange && plainDatesEqual(date, state.start);
    const isEnd = inRange && plainDatesEqual(date, state.end);
    const isAnchor = this.#anchor !== null && plainDatesEqual(date, this.#anchor);
    td.classList.toggle('aui-calendar__day--in-range', inRange);
    td.classList.toggle('aui-calendar__day--range-start', isStart);
    td.classList.toggle('aui-calendar__day--range-end', isEnd);
    td.classList.toggle('aui-calendar__day--preview', inRange && state.pending && !isAnchor);
    td.classList.toggle('aui-calendar__day--selected', state?.pending === true ? isAnchor : isStart || isEnd);
  }

  #render(): void {
    const config = this.#config();
    const o = this.#options;
    const locale = config.locale;
    const doc = this.#doc;
    const today = this.#today();
    const firstDay = this.#firstDay(config);
    const count = this.#count();
    const range = this.#rangeState();

    this.#months.dir = config.direction;
    // aria-disabled (not disabled) keeps focus on the button when the range ends.
    this.#setDisabled(this.#prev, o.min ? monthIndex(o.min) >= this.#start : false);
    this.#setDisabled(this.#next, o.max ? monthIndex(o.max) <= this.#start + count - 1 : false);
    this.#prev.setAttribute('aria-label', getMessage('calendar', 'previousMonth', {}, locale));
    this.#next.setAttribute('aria-label', getMessage('calendar', 'nextMonth', {}, locale));
    this.#prev.replaceChildren(renderIcon(o.icons?.previous ?? 'chevron-left', { doc }));
    this.#next.replaceChildren(renderIcon(o.icons?.next ?? 'chevron-right', { doc }));

    this.#dates.clear();
    this.#panels.forEach((panel, i) => {
      const { year, month } = monthOf(this.#start + i);
      this.#renderPanel(panel, year, month, config, today, firstDay, range);
    });
    this.#renderTabStops();
  }

  #renderPanel(panel: Panel, year: number, month: number, config: Resolved, today: PlainDate, firstDay: number, range: RangeState | null): void {
    const o = this.#options;
    const locale = config.locale;
    const first = plainDate(year, month, 1);
    const multi = this.#count() > 1;
    panel.header.dir = config.direction;
    panel.grid.dir = config.direction;
    if (this.#isRange()) panel.grid.setAttribute('aria-multiselectable', 'true');
    else panel.grid.removeAttribute('aria-multiselectable');

    // Header: localized heading.
    const heading = formatPlainDate(first, { month: 'long', year: 'numeric' }, locale);
    if (panel.heading.textContent !== heading) panel.heading.textContent = heading;
    if (o.label) {
      // With several months each grid needs a distinct name.
      panel.grid.setAttribute('aria-label', multi ? getMessage('calendar', 'gridLabel', { label: o.label, month: heading }, locale) : o.label);
      panel.grid.removeAttribute('aria-labelledby');
    } else {
      panel.grid.setAttribute('aria-labelledby', panel.heading.id);
      panel.grid.removeAttribute('aria-label');
    }

    // Column headers: abbreviated names, full names in abbr.
    const weekNumbers = config.showWeekNumbers;
    panel.weekHeader.hidden = !weekNumbers;
    panel.weekHeader.textContent = getMessage('calendar', 'weekShort', {}, locale);
    panel.weekHeader.abbr = getMessage('calendar', 'week', {}, locale);
    // 2024-01-01 is a Monday (ISO weekday 1).
    for (let c = 0; c < 7; c++) {
      const weekday = plainDate(2024, 1, ((firstDay - 1 + c) % 7) + 1);
      const th = panel.weekdays[c];
      if (!th) continue;
      th.textContent = formatPlainDate(weekday, { weekday: 'short' }, locale);
      th.abbr = formatPlainDate(weekday, { weekday: 'long' }, locale);
    }

    // Day cells.
    const showOutside = config.showOutsideDays && !multi;
    const lead = (dayOfWeek(first) - firstDay + 7) % 7;
    const weeks = Math.ceil((lead + daysInMonth(year, month)) / 7);
    const start = addDays(first, -lead);
    panel.rows.forEach((row, r) => {
      row.tr.hidden = r >= weeks;
      const rowStart = addDays(start, r * 7);
      const monday = addDays(rowStart, (1 - firstDay + 7) % 7);
      row.week.hidden = !weekNumbers;
      const week = isoWeekNumber(monday);
      row.week.textContent = formatNumber(week, {}, locale);
      row.week.setAttribute('aria-label', getMessage('calendar', 'weekNumber', { week: formatNumber(week, {}, locale) }, locale));
      row.days.forEach((td, c) => {
        const date = addDays(rowStart, c);
        this.#renderDay(td, date, date.month === month && date.year === year, showOutside, config, today, range);
      });
    });
  }

  #renderDay(td: HTMLTableCellElement, date: PlainDate, inMonth: boolean, showOutside: boolean, config: Resolved, today: PlainDate, range: RangeState | null): void {
    const shown = inMonth || showOutside;
    td.className = 'aui-calendar__day';
    for (const attr of ['aria-label', 'aria-selected', 'aria-current', 'aria-disabled', 'tabindex']) td.removeAttribute(attr);
    if (!shown) {
      td.classList.add('aui-calendar__day--empty');
      td.textContent = '';
      return;
    }
    this.#dates.set(td, date);
    td.textContent = formatPlainDate(date, { day: 'numeric' }, config.locale);
    const business = this.#options.businessCalendar?.day(date) ?? null;
    const dateText = formatPlainDate(date, { dateStyle: 'full' }, config.locale);
    // Holidays and non-working days are named, not only colored (WCAG 1.4.1).
    const full = business && !business.working
      ? business.holiday ? getMessage('calendar', 'holiday', { date: dateText, holiday: business.holiday }, config.locale) : getMessage('calendar', 'nonWorkingDay', { date: dateText }, config.locale)
      : dateText;
    td.setAttribute('aria-label', full);
    if (business && !business.working) td.classList.add('aui-calendar__day--non-working');
    if (business?.holiday) td.classList.add('aui-calendar__day--holiday');
    td.tabIndex = -1;
    let selected: boolean;
    if (this.#isRange()) {
      // Pending: only the anchor is selected (the preview is not a selection).
      selected = range !== null && (range.pending ? plainDatesEqual(date, this.#anchor) : comparePlainDate(date, range.start) >= 0 && comparePlainDate(date, range.end) <= 0);
      if (range && !range.pending) {
        const isStart = plainDatesEqual(date, range.start);
        const isEnd = plainDatesEqual(date, range.end);
        const key = isStart && isEnd ? 'rangeSingleDay' : isStart ? 'rangeStartDay' : isEnd ? 'rangeEndDay' : null;
        if (key) td.setAttribute('aria-label', getMessage('calendar', key, { date: full }, config.locale));
      }
      this.#applyRange(td, date, range);
    } else {
      selected = this.#value !== null && plainDatesEqual(date, this.#value);
      td.classList.toggle('aui-calendar__day--selected', selected);
    }
    if (selected) td.setAttribute('aria-selected', 'true');
    if (plainDatesEqual(date, today)) {
      td.setAttribute('aria-current', 'date');
      td.classList.add('aui-calendar__day--today');
    }
    if (this.#isDisabled(date)) {
      td.setAttribute('aria-disabled', 'true');
      td.classList.add('aui-calendar__day--disabled');
    }
    td.classList.toggle('aui-calendar__day--outside', !inMonth);
  }

  #setDisabled(button: HTMLButtonElement, disabled: boolean): void {
    if (disabled) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  }
}
