/**
 * Calendar Heatmap (R20 P11). One square per day in a week-by-weekday grid (weeks as
 * columns, weekdays as rows starting at the locale's first day of the week), over a
 * calendar year or a date range. The fill encodes the day's value in discrete steps
 * listed in the legend. With a business calendar, non-working days are outlined with
 * a dashed border and holidays carry a dot and their name (tooltip, accessible name,
 * table), so weekends and holidays never read as "no activity". Keyboard: one tab
 * stop; Up/Down move by a day, Left/Right by a week, Home/End to the week's ends,
 * PageUp/PageDown by a month. Values appear in tooltips, the summary, and the table.
 */
import { addDays, addMonths, dayOfWeek, defineComponentConfig, formatPlainDate, getFirstDayOfWeek, getMessage, registerMessages, validators, type Direction, type PlainDate } from '@absoluteui/core';
import { fromEpochDay, isPlainDate, toEpochDay } from '@absoluteui/helpers/date';
import { fontSize } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase } from '../internal/chart/base.js';
import { ChartFrame, type FrameMark, type HoverResult, type LegendItem, type TableData, type TooltipContent, type TooltipRow } from '../internal/chart/frame.js';
import { assertCommon, chartBaseSchema, chartFail, chartPlural, finite, pickDefined, valueFormatter, type ChartBaseConfig, type ChartCommonOptions } from '../internal/chart/model.js';
import { assertColorSteps, colorSteps, stepOf, type ChartColorSteps, type ColorStep } from '../internal/chart/steps.js';
import { roundedRect, svgElement } from '../internal/chart/svg.js';
import type { ChartPointClickDetail } from '../internal/chart/style.js';
import { isBusinessCalendar } from '../internal/business-days.js';
import type { BusinessCalendarEngine, BusinessDay } from '../business-calendar/engine.js';

export type CalendarHeatmapWeekdayLabels = 'auto' | 'all' | 'none';

export interface CalendarHeatmapConfig extends ChartBaseConfig {
  /** Month names above the first week of each month. Default true. */
  monthLabels: boolean;
  /** Weekday names beside the rows: `auto` (every other row), `all`, `none`. Default `auto`. */
  weekdayLabels: CalendarHeatmapWeekdayLabels;
}

type Resolved = Readonly<CalendarHeatmapConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    calendarHeatmap: CalendarHeatmapConfig & { locale: string; direction: Direction };
  }
}

export const calendarHeatmapConfig = defineComponentConfig<CalendarHeatmapConfig, 'locale' | 'direction'>(
  'calendarHeatmap',
  {
    ...chartBaseSchema,
    height: { default: 180, expected: 'integer from 120 to 2000 (CSS px)', validate: validators.integerInRange(120, 2000) },
    monthLabels: { default: true, expected: 'boolean', validate: validators.isBoolean },
    weekdayLabels: { default: 'auto', expected: '"auto" | "all" | "none"', validate: validators.oneOf(['auto', 'all', 'none'] as const) },
  },
  ['locale', 'direction'],
);

export interface CalendarHeatmapDay {
  date: PlainDate;
  /** `null`, NaN, and infinities are days without a value. */
  value: number | null;
}

export interface CalendarHeatmapOptions extends ChartCommonOptions, Partial<CalendarHeatmapConfig> {
  /** One entry per day (later duplicates of a date replace earlier ones). */
  data: readonly CalendarHeatmapDay[];
  /** Show this calendar year (ignored when `from` and `to` are set). */
  year?: number;
  /** First day shown (inclusive). Default: January 1 of `year`, else the first data date. */
  from?: PlainDate;
  /** Last day shown (inclusive), at most 1,098 days after `from`. */
  to?: PlainDate;
  /** First row: ISO weekday 1 (Monday) to 7 (Sunday). Default: from the locale. */
  firstDayOfWeek?: number;
  /** Business calendar (`createBusinessCalendar`): non-working days and holidays are marked and named. */
  businessCalendar?: BusinessCalendarEngine | null;
  colorScale?: ChartColorSteps;
}

/** Detail of `aui-point-click` (`label` is the formatted date, `column` the week, `row` the weekday row). */
export type CalendarHeatmapPointClickDetail = ChartPointClickDetail;

registerMessages('chart', 'en', {
  roleCalendarHeatmap: 'calendar heatmap',
  calDay: '{date}: {value}',
  calDayNote: '{date}: {value}, {note}',
  calIntro: '{type}, {from} to {to}, {days} with values.',
  calTotal: 'Total {total}.',
  calExtremes: 'Highest {max} on {maxAt}; lowest {min} on {minAt}.',
  calOffCount: 'Non-working days: {off}; holidays: {holidays}.',
  calHoliday: 'Holiday: {name}',
  calNonWorking: 'Non-working day',
  calWorking: 'Working day',
  calHolidayLegend: 'Holiday',
  calNoValue: 'No value',
  calDate: 'Date',
  calStep: '{from} to {to}',
  calDayType: 'Day type',
  dayCount_one: '{count} day',
  dayCount_other: '{count} days',
});

const COMPONENT = 'calendarHeatmap';
const CODE = 'CALENDAR_HEATMAP_OPTIONS';
const MAX_DAYS = 1098;

interface DayCell {
  readonly date: PlainDate;
  readonly epoch: number;
  readonly value: number | null;
  readonly row: number;
  readonly column: number;
  readonly info: BusinessDay | null;
}

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly days: readonly DayCell[];
  readonly byEpoch: ReadonlyMap<number, DayCell>;
  readonly first: number;
  readonly last: number;
  readonly weeks: number;
  readonly firstDay: number;
  readonly steps: readonly ColorStep[];
  readonly format: (value: number) => string;
  readonly min: DayCell | null;
  readonly max: DayCell | null;
  readonly total: number;
  readonly counted: number;
}

const epochOf = (d: PlainDate): number => toEpochDay(d);
const keyOf = (epoch: number): string => `d${String(epoch)}`;

export class CalendarHeatmap extends FrameChart<CalendarHeatmapOptions, Model> {
  #cells = new Map<number, SVGRectElement>();
  #geometry = { x0: 0, y0: 0, cell: 0, step: 0, rtl: false, width: 0 };

  /** Render a calendar heatmap into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: CalendarHeatmapOptions): CalendarHeatmap {
    return new CalendarHeatmap(host, options);
  }

  private constructor(host: HTMLElement, options: CalendarHeatmapOptions) {
    super(host, options, 'aui-calendar-heatmap');
    this.start((listener) => calendarHeatmapConfig.subscribe(listener));
  }

  protected seriesIds(): readonly string[] {
    return [];
  }

  protected assert(o: CalendarHeatmapOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.data) || o.data.length > 20000) chartFail(CODE, COMPONENT, 'data', 'CalendarHeatmapDay[] (at most 20,000)');
    o.data.forEach((d: unknown, i) => {
      if (!validators.isRecord(d) || !isPlainDate(d.date)) chartFail(CODE, COMPONENT, `data[${String(i)}].date`, 'PlainDate');
      if (d.value !== null && typeof d.value !== 'number') chartFail(CODE, COMPONENT, `data[${String(i)}].value`, 'number | null');
    });
    if (o.year !== undefined && !(Number.isInteger(o.year) && o.year >= 1 && o.year <= 9999)) chartFail(CODE, COMPONENT, 'year', 'integer from 1 to 9999');
    for (const key of ['from', 'to'] as const) if (o[key] !== undefined && !isPlainDate(o[key])) chartFail(CODE, COMPONENT, key, 'PlainDate');
    if (o.from && o.to) {
      const span = epochOf(o.to) - epochOf(o.from);
      if (span < 0) chartFail(CODE, COMPONENT, 'to', 'a date on or after from');
      if (span >= MAX_DAYS) chartFail(CODE, COMPONENT, 'to', `at most ${String(MAX_DAYS)} days after from`);
    }
    if (o.firstDayOfWeek !== undefined && !validators.integerInRange(1, 7)(o.firstDayOfWeek)) chartFail(CODE, COMPONENT, 'firstDayOfWeek', 'integer 1 (Monday) to 7 (Sunday)');
    if (o.businessCalendar !== undefined && o.businessCalendar !== null && !isBusinessCalendar(o.businessCalendar)) chartFail(CODE, COMPONENT, 'businessCalendar', 'BusinessCalendarEngine (createBusinessCalendar) or null');
    assertColorSteps(o.colorScale, COMPONENT, CODE);
  }

  /** The shown range [first, last] in epoch days. */
  #range(o: CalendarHeatmapOptions): [number, number] {
    let first: number;
    let last: number;
    if (o.from && o.to) return [epochOf(o.from), epochOf(o.to)];
    if (o.year !== undefined) {
      first = epochOf({ kind: 'PlainDate', year: o.year, month: 1, day: 1 });
      last = epochOf({ kind: 'PlainDate', year: o.year, month: 12, day: 31 });
    } else {
      const dates = o.data.map((d) => epochOf(d.date));
      first = o.from ? epochOf(o.from) : dates.length ? Math.min(...dates) : epochOf(addDays(o.to ?? fromEpochDay(0), -364));
      last = o.to ? epochOf(o.to) : dates.length ? Math.max(...dates) : first + 364;
    }
    if (o.from) first = epochOf(o.from);
    if (o.to) last = epochOf(o.to);
    if (last < first) last = first;
    return [first, Math.min(last, first + MAX_DAYS - 1)];
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = calendarHeatmapConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'monthLabels', 'weekdayLabels', 'locale', 'direction']));
    const [first, last] = this.#range(o);
    const firstDay = o.firstDayOfWeek ?? getFirstDayOfWeek(config.locale);
    const values = new Map<number, number | null>();
    for (const d of o.data) values.set(epochOf(d.date), finite(d.value));
    const calendar = o.businessCalendar ?? null;
    const startDate = fromEpochDay(first);
    const lead = (dayOfWeek(startDate) - firstDay + 7) % 7;
    const days: DayCell[] = [];
    let min: DayCell | null = null;
    let max: DayCell | null = null;
    let total = 0;
    let counted = 0;
    for (let e = first; e <= last; e++) {
      const date = fromEpochDay(e);
      const offset = e - first + lead;
      const cell: DayCell = { date, epoch: e, value: values.get(e) ?? null, row: offset % 7, column: Math.floor(offset / 7), info: calendar ? calendar.day(date) : null };
      days.push(cell);
      if (cell.value !== null) {
        total += cell.value;
        counted++;
        if (!min || cell.value < (min.value ?? 0)) min = cell;
        if (!max || cell.value > (max.value ?? 0)) max = cell;
      }
    }
    const weeks = Math.floor((last - first + lead) / 7) + 1;
    const steps = colorSteps(o.colorScale, min?.value ?? 0, max?.value ?? 1);
    const empty = counted === 0 && o.data.length === 0 ? getMessage('chart', 'noData', {}, config.locale) : null;
    return { config, days, byEpoch: new Map(days.map((d) => [d.epoch, d])), first, last, weeks, firstDay, steps, format: valueFormatter(o, config.locale), min, max, total, counted, empty };
  }

  #dateText(date: PlainDate): string {
    return formatPlainDate(date, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }, this.model.config.locale);
  }

  #note(day: DayCell): string | null {
    const info = day.info;
    if (!info) return null;
    if (info.holiday !== null) return this.message('calHoliday', { name: info.holiday });
    return info.working ? null : this.message('calNonWorking');
  }

  #valueText(day: DayCell): string {
    return day.value === null ? this.message('calNoValue') : this.model.format(day.value);
  }

  #label(day: DayCell): string {
    const note = this.#note(day);
    const params = { date: this.#dateText(day.date), value: this.#valueText(day) };
    return note ? this.message('calDayNote', { ...params, note }) : this.message('calDay', params);
  }

  #stepText(step: ColorStep): string {
    const f = this.model.format;
    return this.message('calStep', { from: f(step.from), to: f(step.to) });
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    this.configureFrame('roleCalendarHeatmap');
    this.frame.setText(o.label, o.hideLabel === true, o.description, o.summary ?? this.#summaryText());
    const items: LegendItem[] = m.steps.map((s, i) => ({ id: String(i), label: this.#stepText(s), slot: s.slot, shapeSlot: 1, swatch: 'fill', visible: true, swatchClass: `aui-chart__series--c${String(s.slot)} aui-calendar-heatmap__level--${String(s.level)}` }));
    items.unshift({ id: 'none', label: this.message('calNoValue'), slot: 1, shapeSlot: 1, swatch: 'fill', visible: true, swatchClass: 'aui-calendar-heatmap__swatch-empty' });
    if (o.businessCalendar) {
      items.push({ id: 'off', label: this.message('calNonWorking'), slot: 1, shapeSlot: 1, swatch: 'fill', visible: true, swatchClass: 'aui-calendar-heatmap__swatch-off' });
      items.push({ id: 'holiday', label: this.message('calHolidayLegend'), slot: 1, shapeSlot: 1, swatch: 'fill', visible: true, swatchClass: 'aui-calendar-heatmap__swatch-holiday' });
    }
    this.frame.setLegend(items, m.config.legend !== 'hide', false);
    this.frame.setTable(m.config.dataTable, () => this.#tableData());
    this.frame.setEmpty(m.empty);
    this.frame.render();
  }

  #summaryText(): string {
    const m = this.model;
    const locale = m.config.locale;
    const parts = [this.message('calIntro', { type: this.message('roleCalendarHeatmap'), from: this.#dateText(fromEpochDay(m.first)), to: this.#dateText(fromEpochDay(m.last)), days: chartPlural('dayCount', m.counted, locale) })];
    if (m.counted > 0) parts.push(this.message('calTotal', { total: m.format(m.total) }));
    if (m.min && m.max && m.min.value !== null && m.max.value !== null) parts.push(this.message('calExtremes', { max: m.format(m.max.value), maxAt: this.#dateText(m.max.date), min: m.format(m.min.value), minAt: this.#dateText(m.min.date) }));
    if (this.options.businessCalendar) {
      const off = m.days.filter((d) => d.info && !d.info.working).length;
      const holidays = m.days.filter((d) => d.info?.holiday != null).length;
      parts.push(this.message('calOffCount', { off: String(off), holidays: String(holidays) }));
    }
    return parts.join(' ');
  }

  #tableData(): TableData {
    const o = this.options;
    const m = this.model;
    const calendar = Boolean(o.businessCalendar);
    return {
      caption: o.label,
      columns: [this.message('calDate'), this.message('value'), ...(calendar ? [this.message('calDayType')] : [])],
      numeric: [false, true, false],
      rows: m.days.map((d) => [this.#dateText(d.date), this.#valueText(d), ...(calendar ? [this.#note(d) ?? this.message('calWorking')] : [])]),
    };
  }

  protected draw(width: number, height: number): void {
    const m = this.model;
    const frame = this.frame;
    const doc = frame.doc;
    const layer = frame.layer;
    this.#cells = new Map();
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const px = fontSize(frame.svg);
    const locale = m.config.locale;
    const weekdayMode = m.config.weekdayLabels;
    const weekdayName = (row: number): string => formatPlainDate(addDays({ kind: 'PlainDate', year: 2024, month: 1, day: 1 }, (m.firstDay - 1 + row) % 7), { weekday: 'short' }, locale);
    const labelWidth = weekdayMode === 'none' ? 4 : Math.ceil(Math.max(...[0, 1, 2, 3, 4, 5, 6].map((r) => weekdayName(r).length)) * px * 0.62) + 8;
    const top = m.config.monthLabels ? Math.ceil(px * 1.6) : 4;
    const gap = 3;
    const step = Math.max(4, Math.min((width - labelWidth - 4) / m.weeks, (height - top - 4) / 7));
    const cell = Math.max(2, step - gap);
    const x0 = rtl ? width - labelWidth : labelWidth;
    this.#geometry = { x0, y0: top, cell, step, rtl, width };
    frame.setPlot({ left: rtl ? x0 - m.weeks * step : x0, right: rtl ? x0 : x0 + m.weeks * step, top, bottom: top + 7 * step });
    const colX = (column: number): number => (rtl ? x0 - (column + 1) * step + gap : x0 + column * step);
    const axis = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-chart__axis');
    if (weekdayMode !== 'none') {
      for (let r = 0; r < 7; r++) {
        if (weekdayMode === 'auto' && r % 2 === 0) continue;
        const t = svgElement(doc, 'text', { x: rtl ? x0 + 6 : x0 - 6, y: top + r * step + cell / 2, 'text-anchor': rtl ? 'start' : 'end', 'dominant-baseline': 'middle' }, 'aui-chart__tick-label');
        t.textContent = weekdayName(r);
        axis.append(t);
      }
    }
    if (m.config.monthLabels) {
      let lastLabelEdge = -Infinity;
      for (const d of m.days) {
        if (d.date.day !== 1 && d.epoch !== m.first) continue;
        const name = formatPlainDate(d.date, { month: 'short' }, locale);
        const x = colX(d.column);
        const edge = rtl ? -x : x;
        if (edge - lastLabelEdge < name.length * px * 0.62 + 4) continue;
        lastLabelEdge = edge;
        const t = svgElement(doc, 'text', { x: rtl ? x + cell : x, y: top - 6, 'text-anchor': 'start' }, 'aui-chart__tick-label');
        if (rtl) t.setAttribute('text-anchor', 'end');
        t.textContent = name;
        axis.append(t);
      }
    }
    layer.append(axis);
    const cells = svgElement(doc, 'g', {}, 'aui-calendar-heatmap__cells');
    const dots = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-calendar-heatmap__holidays');
    const marks: FrameMark[] = [];
    for (const d of m.days) {
      const x = colX(d.column);
      const y = top + d.row * step;
      const s = d.value === null ? undefined : stepOf(m.steps, d.value);
      let cls = s ? `aui-calendar-heatmap__cell aui-chart__series--c${String(s.slot)} aui-calendar-heatmap__level--${String(s.level)}` : 'aui-calendar-heatmap__cell aui-calendar-heatmap__cell--empty';
      if (d.info && !d.info.working) cls += ' aui-calendar-heatmap__cell--off';
      if (d.info?.holiday != null) cls += ' aui-calendar-heatmap__cell--holiday';
      // R20-22: `cellRadius` / `cornerRadius`, else the built-in rounding (a quarter of the cell, at most 3 px).
      const rect = roundedRect(doc, { x, y, width: cell, height: cell }, frame.corners.cell ?? Math.min(3, cell / 4), cls);
      ChartFrame.markElement(rect, this.#label(d));
      cells.append(rect);
      this.#cells.set(d.epoch, rect);
      if (d.info?.holiday != null && cell >= 6) dots.append(svgElement(doc, 'circle', { cx: x + cell / 2, cy: y + cell / 2, r: Math.max(1.5, cell / 6) }, 'aui-calendar-heatmap__dot'));
      marks.push({ element: rect, row: d.row, column: d.column, key: keyOf(d.epoch), x: x + cell / 2, y });
    }
    layer.append(cells, dots);
    frame.setMarks(marks);
  }

  protected hover(x: number, y: number): HoverResult | null {
    const g = this.#geometry;
    const m = this.model;
    const column = Math.floor((g.rtl ? g.x0 - x : x - g.x0) / g.step);
    const row = Math.floor((y - g.y0) / g.step);
    if (row < 0 || row > 6 || column < 0 || column >= m.weeks) return null;
    const day = m.days.find((d) => d.row === row && d.column === column);
    const el = day ? this.#cells.get(day.epoch) : undefined;
    const mark = day ? this.frame.marks.find((mk) => mk.key === keyOf(day.epoch)) : undefined;
    if (!day || !el || !mark) return null;
    return { content: this.tooltip(mark), x: mark.x, y: mark.y, highlight: [el] };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const day = this.model.byEpoch.get(Number(mark.key.slice(1)));
    if (!day) return { title: '', rows: [] };
    const s = day.value === null ? undefined : stepOf(this.model.steps, day.value);
    const rows: TooltipRow[] = [{ slot: s?.slot ?? 1, shapeSlot: 1, swatch: s ? 'fill' : 'none', label: this.message('value'), value: this.#valueText(day), ...(s ? { swatchClass: `aui-chart__series--c${String(s.slot)} aui-calendar-heatmap__level--${String(s.level)}` } : {}) }];
    const note = this.#note(day);
    if (note) rows.push({ slot: 1, shapeSlot: 1, swatch: 'none', label: this.message('calDayType'), value: note });
    return { title: this.#dateText(day.date), rows };
  }

  protected override pointDetail(mark: FrameMark): Pick<ChartPointClickDetail, 'seriesId' | 'series' | 'value'> | null {
    const day = this.model.byEpoch.get(Number(mark.key.slice(1)));
    return day ? { seriesId: null, series: '', value: this.#valueText(day) } : null;
  }

  /** Day and week navigation (the APG grid pattern of a calendar). */
  protected override key(event: KeyboardEvent, mark: FrameMark): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const m = this.model;
    const day = m.byEpoch.get(Number(mark.key.slice(1)));
    if (!day) return false;
    const rtl = m.config.direction === 'rtl';
    let target: number;
    switch (event.key) {
      case 'ArrowDown': target = day.epoch + 1; break;
      case 'ArrowUp': target = day.epoch - 1; break;
      case 'ArrowRight': target = day.epoch + (rtl ? -7 : 7); break;
      case 'ArrowLeft': target = day.epoch + (rtl ? 7 : -7); break;
      case 'Home': target = day.epoch - day.row; break;
      case 'End': target = day.epoch + (6 - day.row); break;
      case 'PageDown': target = epochOf(addMonths(day.date, event.shiftKey ? 12 : 1)); break;
      case 'PageUp': target = epochOf(addMonths(day.date, event.shiftKey ? -12 : -1)); break;
      default: return false;
    }
    target = Math.min(m.last, Math.max(m.first, target));
    if (target !== day.epoch) this.frame.focusMark(this.#cells.get(target));
    return true;
  }
}
