/**
 * Business Calendar (SPEC section 18.7). Shows one to twelve consecutive months with
 * working days, non-working days (weekends), holidays, and changed days
 * (exceptions) from a `BusinessCalendarDefinition`, plus a legend and the list of
 * holidays in view. Each month is a `table role="grid"` (as Calendar, WAI-ARIA APG
 * grid) with one roving tab stop across all months; every day's name states its
 * kind, so color is never the only cue. In edit mode Enter, Space, or a click
 * toggles a day between working and non-working (an exception); the updated
 * definition is emitted for saving.
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
  formatPlainDate,
  getFirstDayOfWeek,
  getMessage,
  now,
  plainDate,
  plainDatesEqual,
  plainDateToString,
  registerMessages,
  toPlainDateTime,
  validators,
  type IsoWeekday,
  type PlainDate,
  type PlainYearMonth,
  plainYearMonth,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce } from '@absoluteui/utilities';
import {
  createBusinessCalendar,
  type BusinessCalendarDefinition,
  type BusinessCalendarEngine,
  type BusinessDay,
  type BusinessDayException,
} from './engine.js';

export interface BusinessCalendarConfig {
  /** Consecutive months shown (1-12). */
  months: number;
  showLegend: boolean;
  /** List the holidays of the visible months below the grids. */
  showHolidays: boolean;
}

type Inherited = 'locale' | 'timezone' | 'direction';
type Resolved = Readonly<BusinessCalendarConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    businessCalendar: BusinessCalendarConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' };
  }
}

export const businessCalendarConfig = defineComponentConfig<BusinessCalendarConfig, Inherited>(
  'businessCalendar',
  {
    months: { default: 3, expected: 'integer from 1 to 12', validate: validators.integerInRange(1, 12) },
    showLegend: { default: true, expected: 'boolean', validate: validators.isBoolean },
    showHolidays: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'timezone', 'direction'],
);

registerMessages('businessCalendar', 'en', {
  previous: 'Previous months',
  next: 'Next months',
  previousOne: 'Previous month',
  nextOne: 'Next month',
  gridLabel: '{label}, {month}',
  working: '{date}, working day',
  nonWorking: '{date}, non-working day',
  holiday: '{date}, holiday: {name}',
  holidayWorking: '{date}, holiday: {name}, working day',
  changedWorking: '{date}, working day (changed)',
  changedNonWorking: '{date}, non-working day (changed)',
  reason: '{text}: {reason}',
  madeWorking: '{date} is now a working day.',
  madeNonWorking: '{date} is now a non-working day.',
  legend: 'Legend',
  legendWorking: 'Working day',
  legendNonWorking: 'Non-working day',
  legendHoliday: 'Holiday',
  legendChanged: 'Changed day',
  holidays: 'Holidays',
  holidayItem: '{date}: {name}',
  range: '{start} to {end}',
});

export interface BusinessCalendarIcons {
  previous: IconRef;
  next: IconRef;
}

export interface BusinessCalendarOptions extends Partial<BusinessCalendarConfig> {
  /** Accessible name of the calendar (grids are named "{label}, {month}"). */
  label: string;
  definition?: BusinessCalendarDefinition;
  /** First visible month. Default: the month of the focused date. */
  month?: PlainYearMonth;
  /** Initially focused day. Default: today. */
  focusedDate?: PlainDate;
  /** Toggle days between working and non-working. Default false. */
  editable?: boolean;
  /** First column. Default: the locale's first day of week. */
  firstDayOfWeek?: IsoWeekday;
  /** Advanced: fixed "today" (tests, demos). Default: the current date in `timezone`. */
  today?: PlainDate;
  locale?: string;
  timezone?: string;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<BusinessCalendarIcons>;
}

/** Detail of `aui-change` (edit mode). */
export interface BusinessCalendarChangeDetail {
  date: PlainDate;
  working: boolean;
  /** The updated definition, for saving. */
  definition: BusinessCalendarDefinition;
}

export interface BusinessCalendarDaySelectDetail {
  date: PlainDate;
  day: BusinessDay;
}

export interface BusinessCalendarNavigateDetail {
  month: PlainYearMonth;
}

interface Panel {
  readonly root: HTMLDivElement;
  readonly heading: HTMLHeadingElement;
  readonly grid: HTMLTableElement;
  readonly weekdays: HTMLTableCellElement[];
  readonly body: HTMLTableSectionElement;
}

const monthIndex = (d: { year: number; month: number }): number => d.year * 12 + d.month - 1;
const monthOfIndex = (i: number): PlainYearMonth => plainYearMonth(Math.floor(i / 12), (((i % 12) + 12) % 12) + 1);
const kind = (v: unknown): unknown => (typeof v === 'object' && v !== null ? (v as { kind?: unknown }).kind : undefined);

export class BusinessCalendar {
  readonly host: HTMLElement;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();
  readonly #prev: HTMLButtonElement;
  readonly #next: HTMLButtonElement;
  readonly #range: HTMLDivElement;
  readonly #months: HTMLDivElement;
  readonly #legend: HTMLUListElement;
  readonly #holidays: HTMLDivElement;
  #panels: Panel[] = [];
  #options: BusinessCalendarOptions;
  #engine: BusinessCalendarEngine;
  #definition: BusinessCalendarDefinition;
  #focused: PlainDate;
  #start: number;
  readonly #cells = new Map<string, HTMLTableCellElement>();
  readonly #dates = new WeakMap<HTMLTableCellElement, PlainDate>();

  static create(host: HTMLElement, options: BusinessCalendarOptions): BusinessCalendar {
    return new BusinessCalendar(host, options);
  }

  private constructor(host: HTMLElement, options: BusinessCalendarOptions) {
    BusinessCalendar.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#definition = options.definition ?? {};
    this.#engine = createBusinessCalendar(this.#definition);
    this.#focused = options.focusedDate ?? this.#today();
    this.#start = options.month ? monthIndex(options.month) : monthIndex(this.#focused);
    if (!options.focusedDate && options.month && !this.#isVisible(this.#focused)) this.#focused = plainDate(options.month.year, options.month.month, 1);
    const doc = this.#doc;
    const header = doc.createElement('div');
    header.className = 'aui-business-calendar__header';
    this.#prev = this.#navButton('prev');
    this.#next = this.#navButton('next');
    this.#range = doc.createElement('div');
    this.#range.className = 'aui-business-calendar__range';
    this.#range.setAttribute('aria-live', 'polite');
    header.append(this.#prev, this.#range, this.#next);
    this.#months = doc.createElement('div');
    this.#months.className = 'aui-business-calendar__months';
    this.#legend = doc.createElement('ul');
    this.#legend.className = 'aui-business-calendar__legend';
    this.#holidays = doc.createElement('div');
    this.#holidays.className = 'aui-business-calendar__holidays';
    host.classList.add('aui-business-calendar');
    host.replaceChildren(header, this.#months, this.#legend, this.#holidays);
    this.#render();

    const g = this.#group;
    g.listen(this.#prev, 'click', () => {
      this.#page(-1);
    });
    g.listen(this.#next, 'click', () => {
      this.#page(1);
    });
    g.listen(this.#months, 'keydown', (e) => {
      this.#onKey(e);
    });
    g.listen(this.#months, 'click', (e) => {
      const td = e.target instanceof Element ? e.target.closest('td') : null;
      const date = td ? this.#dates.get(td) : undefined;
      if (date) this.#activate(date);
    });
    g.listen(this.#months, 'focusin', (e) => {
      const date = e.target instanceof HTMLTableCellElement ? this.#dates.get(e.target) : undefined;
      if (date && !plainDatesEqual(date, this.#focused)) {
        this.#focused = date;
        this.#syncTabStops();
      }
    });
    g.add(businessCalendarConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** The current definition (after edits), for saving. */
  get definition(): BusinessCalendarDefinition {
    return this.#definition;
  }

  /** The engine for the current definition (working-day arithmetic). */
  get engine(): BusinessCalendarEngine {
    return this.#engine;
  }

  get focusedDate(): PlainDate {
    return this.#focused;
  }

  get visibleMonth(): PlainYearMonth {
    return monthOfIndex(this.#start);
  }

  get options(): Readonly<BusinessCalendarOptions> {
    return this.#options;
  }

  update(options: Partial<BusinessCalendarOptions>): void {
    const next = { ...this.#options, ...options };
    BusinessCalendar.#assert(next);
    if (options.definition !== undefined) {
      this.#engine = createBusinessCalendar(options.definition);
      this.#definition = options.definition;
    }
    this.#options = next;
    if (options.month) this.#start = monthIndex(options.month);
    if (options.focusedDate) this.#focusDate(options.focusedDate);
    this.#render();
  }

  /** Show and focus-track a date (no events; DOM focus moves only when it is inside the grids). */
  goTo(date: PlainDate): void {
    if (kind(date) !== 'PlainDate') this.#fail('goTo.date', 'PlainDate');
    const inside = this.#months.contains(this.#doc.activeElement);
    const before = this.#start;
    this.#focusDate(date);
    if (before !== this.#start) this.#render();
    else this.#syncTabStops();
    if (inside) this.focus();
  }

  focus(): void {
    this.#cells.get(plainDateToString(this.#focused))?.focus();
  }

  /** Make a date working or non-working (programmatic; no events). */
  setWorking(date: PlainDate, working: boolean): void {
    if (kind(date) !== 'PlainDate') this.#fail('setWorking.date', 'PlainDate');
    this.#apply(date, working);
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-business-calendar', 'aui-business-calendar--editable');
  }

  static #assert(o: BusinessCalendarOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('BUSINESS_CALENDAR_OPTIONS', 'Invalid business calendar options.', { component: 'businessCalendar', property: `businessCalendar.${property}`, expected });
    };
    if (!validators.isRecord(o)) fail('options', 'BusinessCalendarOptions');
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    for (const key of ['focusedDate', 'today'] as const) if (o[key] !== undefined && kind(o[key]) !== 'PlainDate') fail(key, 'PlainDate');
    if (o.month !== undefined && kind(o.month) !== 'PlainYearMonth') fail('month', 'PlainYearMonth');
    if (o.editable !== undefined && typeof o.editable !== 'boolean') fail('editable', 'boolean');
    if (o.firstDayOfWeek !== undefined && !validators.integerInRange(1, 7)(o.firstDayOfWeek)) fail('firstDayOfWeek', 'integer 1 (Monday) to 7 (Sunday)');
    // Validates the definition (throws BUSINESS_CALENDAR_DEFINITION) and the config-backed options.
    if (o.definition !== undefined) createBusinessCalendar(o.definition);
    businessCalendarConfig.resolve(BusinessCalendar.#configInput(o));
  }

  static #configInput(o: BusinessCalendarOptions): Partial<BusinessCalendarConfig & { locale: string; timezone: string; direction: 'ltr' | 'rtl' }> {
    const input: Record<string, unknown> = {};
    for (const key of ['months', 'showLegend', 'showHolidays', 'locale', 'timezone', 'direction'] as const) if (o[key] !== undefined) input[key] = o[key];
    return input;
  }

  #config(): Resolved {
    return businessCalendarConfig.resolve(BusinessCalendar.#configInput(this.#options));
  }

  #fail(property: string, expected: string): never {
    throw configurationError('BUSINESS_CALENDAR_OPTIONS', 'Invalid business calendar options.', { component: 'businessCalendar', property: `businessCalendar.${property}`, expected });
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('businessCalendar', key, params, this.#config().locale);
  }

  #today(): PlainDate {
    return this.#options.today ?? toPlainDateTime(now(), this.#config().timezone).date;
  }

  #firstDay(): number {
    return this.#options.firstDayOfWeek ?? getFirstDayOfWeek(this.#config().locale);
  }

  #isVisible(date: PlainDate): boolean {
    const i = monthIndex(date);
    return i >= this.#start && i < this.#start + this.#config().months;
  }

  #focusDate(date: PlainDate): void {
    this.#focused = date;
    const i = monthIndex(date);
    const count = this.#config().months;
    if (i < this.#start) this.#start = i;
    else if (i >= this.#start + count) this.#start = i - count + 1;
  }

  #navButton(which: 'prev' | 'next'): HTMLButtonElement {
    const b = this.#doc.createElement('button');
    b.type = 'button';
    b.className = `aui-business-calendar__nav aui-business-calendar__${which}`;
    return b;
  }

  #page(delta: -1 | 1): void {
    const count = this.#config().months;
    const before = this.#start;
    this.#start += delta * count;
    this.#focused = addMonths(this.#focused, delta * count);
    this.#render();
    if (this.#start !== before) emit(this.host, 'aui-navigate', { month: this.visibleMonth } satisfies BusinessCalendarNavigateDetail);
  }

  // ---- rendering -------------------------------------------------------------

  #createPanel(): Panel {
    const doc = this.#doc;
    const root = doc.createElement('div');
    root.className = 'aui-business-calendar__month';
    const heading = doc.createElement('h3');
    heading.className = 'aui-business-calendar__heading';
    heading.id = createId('aui-business-calendar-heading');
    const grid = doc.createElement('table');
    grid.className = 'aui-business-calendar__grid';
    grid.setAttribute('role', 'grid');
    const thead = doc.createElement('thead');
    const tr = doc.createElement('tr');
    const weekdays: HTMLTableCellElement[] = [];
    for (let c = 0; c < 7; c++) {
      const th = doc.createElement('th');
      th.scope = 'col';
      th.className = 'aui-business-calendar__weekday';
      weekdays.push(th);
      tr.append(th);
    }
    thead.append(tr);
    const body = doc.createElement('tbody');
    grid.append(thead, body);
    root.append(heading, grid);
    return { root, heading, grid, weekdays, body };
  }

  #render(): void {
    const c = this.#config();
    const o = this.#options;
    const locale = c.locale;
    const doc = this.#doc;
    const count = c.months;
    while (this.#panels.length < count) this.#panels.push(this.#createPanel());
    this.#panels.length = count;
    this.#months.replaceChildren(...this.#panels.map((p) => p.root));
    this.#months.dir = c.direction;
    this.host.classList.toggle('aui-business-calendar--editable', o.editable === true);
    const one = count === 1;
    this.#prev.setAttribute('aria-label', this.#msg(one ? 'previousOne' : 'previous'));
    this.#next.setAttribute('aria-label', this.#msg(one ? 'nextOne' : 'next'));
    const rtl = c.direction === 'rtl';
    this.#prev.replaceChildren(renderIcon(o.icons?.previous ?? (rtl ? 'chevron-right' : 'chevron-left'), { doc }));
    this.#next.replaceChildren(renderIcon(o.icons?.next ?? (rtl ? 'chevron-left' : 'chevron-right'), { doc }));
    const first = monthOfIndex(this.#start);
    const last = monthOfIndex(this.#start + count - 1);
    const fmt = (m: PlainYearMonth): string => formatPlainDate(plainDate(m.year, m.month, 1), { month: 'long', year: 'numeric' }, locale);
    this.#range.textContent = one ? fmt(first) : this.#msg('range', { start: fmt(first), end: fmt(last) });

    if (!this.#isVisible(this.#focused)) this.#focused = plainDate(first.year, first.month, 1);
    const today = this.#today();
    const firstDay = this.#firstDay();
    this.#cells.clear();
    this.#panels.forEach((panel, i) => {
      const { year, month } = monthOfIndex(this.#start + i);
      this.#renderPanel(panel, year, month, locale, firstDay, today);
    });
    this.#renderLegend(c);
    this.#renderHolidays(c);
    this.#syncTabStops();
  }

  #renderPanel(panel: Panel, year: number, month: number, locale: string, firstDay: number, today: PlainDate): void {
    const doc = this.#doc;
    const o = this.#options;
    const heading = formatPlainDate(plainDate(year, month, 1), { month: 'long', year: 'numeric' }, locale);
    panel.heading.textContent = heading;
    panel.grid.setAttribute('aria-label', this.#msg('gridLabel', { label: o.label, month: heading }));
    if (o.editable === true) panel.grid.removeAttribute('aria-readonly');
    else panel.grid.setAttribute('aria-readonly', 'true');
    for (let col = 0; col < 7; col++) {
      // 2024-01-01 is a Monday (ISO weekday 1).
      const weekday = plainDate(2024, 1, ((firstDay - 1 + col) % 7) + 1);
      const th = panel.weekdays[col];
      if (!th) continue;
      th.textContent = formatPlainDate(weekday, { weekday: 'short' }, locale);
      th.abbr = formatPlainDate(weekday, { weekday: 'long' }, locale);
    }
    const firstOfMonth = plainDate(year, month, 1);
    const lead = (dayOfWeek(firstOfMonth) - firstDay + 7) % 7;
    const weeks = Math.ceil((lead + daysInMonth(year, month)) / 7);
    const start = addDays(firstOfMonth, -lead);
    const rows: HTMLTableRowElement[] = [];
    for (let r = 0; r < weeks; r++) {
      const tr = doc.createElement('tr');
      for (let col = 0; col < 7; col++) {
        const date = addDays(start, r * 7 + col);
        const td = doc.createElement('td');
        if (date.month !== month) {
          td.className = 'aui-business-calendar__day aui-business-calendar__day--empty';
        } else this.#renderDay(td, date, locale, today);
        tr.append(td);
      }
      rows.push(tr);
    }
    panel.body.replaceChildren(...rows);
  }

  #renderDay(td: HTMLTableCellElement, date: PlainDate, locale: string, today: PlainDate): void {
    const day = this.#engine.day(date);
    const full = formatPlainDate(date, { dateStyle: 'full' }, locale);
    let label: string;
    if (day.exception) label = this.#msg(day.working ? 'changedWorking' : 'changedNonWorking', { date: full });
    else if (day.holiday !== null) label = this.#msg(day.working ? 'holidayWorking' : 'holiday', { date: full, name: day.holiday });
    else label = this.#msg(day.working ? 'working' : 'nonWorking', { date: full });
    if (day.exception && day.holiday !== null) label = this.#msg('reason', { text: label, reason: day.holiday });
    if (day.reason !== null) label = this.#msg('reason', { text: label, reason: day.reason });
    const cls = ['aui-business-calendar__day', day.working ? 'aui-business-calendar__day--working' : 'aui-business-calendar__day--non-working'];
    if (day.holiday !== null) cls.push('aui-business-calendar__day--holiday');
    if (day.exception) cls.push('aui-business-calendar__day--changed');
    if (plainDatesEqual(date, today)) {
      cls.push('aui-business-calendar__day--today');
      td.setAttribute('aria-current', 'date');
    }
    td.className = cls.join(' ');
    td.setAttribute('aria-label', label);
    td.tabIndex = -1;
    const num = this.#doc.createElement('span');
    num.className = 'aui-business-calendar__number';
    num.setAttribute('aria-hidden', 'true');
    num.textContent = formatPlainDate(date, { day: 'numeric' }, locale);
    td.replaceChildren(num);
    if (day.holiday !== null || day.reason !== null) td.title = day.holiday ?? day.reason ?? '';
    this.#cells.set(plainDateToString(date), td);
    this.#dates.set(td, date);
  }

  #renderLegend(c: Resolved): void {
    this.#legend.hidden = !c.showLegend;
    if (!c.showLegend) return;
    this.#legend.setAttribute('aria-label', this.#msg('legend'));
    const items: [string, string][] = [['working', 'legendWorking'], ['non-working', 'legendNonWorking'], ['holiday', 'legendHoliday'], ['changed', 'legendChanged']];
    this.#legend.replaceChildren(...items.map(([cls, key]) => {
      const li = this.#doc.createElement('li');
      li.className = 'aui-business-calendar__legend-item';
      const swatch = this.#doc.createElement('span');
      swatch.className = `aui-business-calendar__swatch aui-business-calendar__day--${cls}`;
      swatch.setAttribute('aria-hidden', 'true');
      li.append(swatch, this.#msg(key));
      return li;
    }));
  }

  #renderHolidays(c: Resolved): void {
    const doc = this.#doc;
    const first = monthOfIndex(this.#start);
    const startDate = plainDate(first.year, first.month, 1);
    const endDate = addMonths(startDate, c.months);
    const items: HTMLLIElement[] = [];
    for (let d = startDate; comparePlainDate(d, endDate) < 0; d = addDays(d, 1)) {
      const day = this.#engine.day(d);
      if (day.holiday === null) continue;
      const li = doc.createElement('li');
      li.textContent = this.#msg('holidayItem', { date: formatPlainDate(d, { month: 'short', day: 'numeric', weekday: 'short' }, c.locale), name: day.holiday });
      items.push(li);
    }
    this.#holidays.hidden = !c.showHolidays || items.length === 0;
    if (this.#holidays.hidden) {
      this.#holidays.replaceChildren();
      return;
    }
    const heading = doc.createElement('h3');
    heading.className = 'aui-business-calendar__holidays-heading';
    heading.id = createId('aui-business-calendar-holidays');
    heading.textContent = this.#msg('holidays');
    const list = doc.createElement('ul');
    list.className = 'aui-business-calendar__holiday-list';
    list.setAttribute('aria-labelledby', heading.id);
    list.append(...items);
    this.#holidays.replaceChildren(heading, list);
  }

  #syncTabStops(): void {
    const key = plainDateToString(this.#focused);
    for (const [k, td] of this.#cells) td.tabIndex = k === key ? 0 : -1;
  }

  // ---- interaction -----------------------------------------------------------

  #onKey(e: KeyboardEvent): void {
    const base = e.target instanceof HTMLTableCellElement ? this.#dates.get(e.target) : undefined;
    if (!base) return;
    const rtl = this.#config().direction === 'rtl';
    const offset = (dayOfWeek(base) - this.#firstDay() + 7) % 7;
    let target: PlainDate;
    switch (e.key) {
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
        target = addMonths(base, (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.#activate(base);
        return;
      default:
        return;
    }
    e.preventDefault();
    const before = this.#start;
    this.#focusDate(target);
    if (before !== this.#start) {
      this.#render();
      emit(this.host, 'aui-navigate', { month: this.visibleMonth } satisfies BusinessCalendarNavigateDetail);
    } else this.#syncTabStops();
    this.focus();
  }

  #activate(date: PlainDate): void {
    this.#focused = date;
    emit(this.host, 'aui-day-select', { date, day: this.#engine.day(date) } satisfies BusinessCalendarDaySelectDetail);
    if (this.#options.editable !== true) {
      this.#syncTabStops();
      return;
    }
    const working = !this.#engine.isWorkingDay(date);
    this.#apply(date, working);
    this.#render();
    this.focus();
    const locale = this.#config().locale;
    announce(this.#msg(working ? 'madeWorking' : 'madeNonWorking', { date: formatPlainDate(date, { dateStyle: 'long' }, locale) }), 'polite', this.#doc);
    emit(this.host, 'aui-change', { date, working, definition: this.#definition } satisfies BusinessCalendarChangeDetail);
  }

  /** Set a date's state: drop the exception when the pattern (and holidays) already give it, else add one. */
  #apply(date: PlainDate, working: boolean): void {
    const key = plainDateToString(date);
    const rest: BusinessDayException[] = (this.#definition.exceptions ?? []).filter((x) => plainDateToString(x.date) !== key);
    const plain = createBusinessCalendar({ ...this.#definition, exceptions: rest });
    const exceptions = plain.isWorkingDay(date) === working ? rest : [...rest, { date, working }];
    exceptions.sort((a, b) => comparePlainDate(a.date, b.date));
    this.#definition = { ...this.#definition, exceptions };
    this.#engine = createBusinessCalendar(this.#definition);
  }
}
