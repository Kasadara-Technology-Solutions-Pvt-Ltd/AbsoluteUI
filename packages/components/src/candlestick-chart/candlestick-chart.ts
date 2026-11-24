/**
 * Candlestick Chart (R20 P11). Daily open-high-low-close prices over time as candles
 * (rising candles hollow, falling candles filled, so direction never depends on color
 * alone) or OHLC bars, an optional volume pane, and moving-average overlays. The time
 * axis is a day axis; with a business calendar it becomes a trading-day axis that
 * skips weekends and holidays (entries on non-trading days are not plotted and are
 * listed in the summary). Crosshair, zoom and pan (ChartZoom), keyboard navigation
 * along the sessions, tooltips, a generated summary, and the data table are built in.
 */
import { defineComponentConfig, formatPlainDate, getMessage, registerMessages, validators, type Direction, type PlainDate } from '@absoluteui/core';
import { isPlainDate, toEpochDay } from '@absoluteui/helpers/date';
import { drawAxisTitle, drawBaseline, drawCategoryLabels, drawValueAxis, fontSize, type PlotRect } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase, type ChartSeriesToggleDetail } from '../internal/chart/base.js';
import { assertValueAxis, assertZoomRange, plotRect, plotVertical, valueAxisWidth, valueTicks, type ValueAxisInput } from '../internal/chart/cartesian.js';
import { ChartFrame, type FrameMark, type HoverResult, type LegendItem, type TableData, type TooltipContent, type TooltipRow } from '../internal/chart/frame.js';
import { assertCommon, chartBaseSchema, chartFail, chartPlural, colorSlot, isChartColor, listFormat, pickDefined, tickFormatter, valueFormatter, type ChartBaseConfig, type ChartColor, type ChartCommonOptions } from '../internal/chart/model.js';
import { linearScale } from '../internal/chart/scale.js';
import { applySeriesDash, applySeriesStyle, assertSeriesStyle, type ChartPointClickDetail, type ChartSeriesStyle } from '../internal/chart/style.js';
import { fmt, roundedBox, roundedRectPath, sideRadii, svgElement } from '../internal/chart/svg.js';
import { ChartZoom, type ChartZoomDetail, type ChartZoomRange } from '../internal/chart/zoom.js';
import { isBusinessCalendar } from '../internal/business-days.js';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';

export type CandlestickChartType = 'candle' | 'ohlc';

export interface CandlestickChartConfig extends ChartBaseConfig {
  /** Crosshair lines (time and price) on the hovered or focused session. Default true. */
  crosshair: boolean;
}

type Resolved = Readonly<CandlestickChartConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    candlestickChart: CandlestickChartConfig & { locale: string; direction: Direction };
  }
}

export const candlestickChartConfig = defineComponentConfig<CandlestickChartConfig, 'locale' | 'direction'>(
  'candlestickChart',
  {
    ...chartBaseSchema,
    crosshair: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

export interface CandlestickPoint {
  /** Trading day (strictly increasing across the data). */
  date: PlainDate;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Traded volume (zero or more). */
  volume?: number;
}

export interface CandlestickMovingAverage {
  /** Number of sessions averaged (2-250). */
  period: number;
  /** Unique id (legend toggling, `hiddenSeries`). Default `ma<period>`. */
  id?: string;
  /** Legend and tooltip name. Default "<period>-day average". */
  label?: string;
  /** Palette slot 1-8. Default: position + 1. */
  color?: ChartColor;
  style?: ChartSeriesStyle;
}

export interface CandlestickChartOptions extends ChartCommonOptions, Partial<CandlestickChartConfig> {
  data: readonly CandlestickPoint[];
  /** Candles (hollow when rising, filled when falling) or OHLC bars. Default `candle`. */
  type?: CandlestickChartType;
  /** Volume pane below the prices (when the data has volume). Default true. */
  volume?: boolean;
  /** Simple moving averages of the close (up to 4). */
  movingAverages?: readonly CandlestickMovingAverage[];
  /** Business calendar (`createBusinessCalendar`): the axis counts trading days only, skipping non-working days. */
  businessCalendar?: BusinessCalendarEngine | null;
  /** Price axis: label, fixed min / max, tick count. */
  priceAxis?: Omit<ValueAxisInput, 'includeZero'>;
  /** Intl.NumberFormat options for volume (tooltips, table, pane ticks). Default compact notation. */
  volumeFormat?: Intl.NumberFormatOptions;
  /** Zoom and pan over time (toolbar, + / - / 0 keys, Ctrl+wheel, drag, Shift+drag). Default false. */
  zoom?: boolean;
  /** Visible session range in axis positions (trading-day or day index); null shows everything. */
  zoomRange?: ChartZoomRange | null;
}

export type CandlestickChartSeriesToggleDetail = ChartSeriesToggleDetail;
export type CandlestickChartZoomDetail = ChartZoomDetail;
/** Detail of `aui-point-click` (`column` is the session index, `value` the close). */
export type CandlestickChartPointClickDetail = ChartPointClickDetail;

registerMessages('chart', 'en', {
  roleCandlestick: 'candlestick chart',
  candle: '{date}: open {open}, high {high}, low {low}, close {close}, {change}',
  candleUp: 'up {change}',
  candleDown: 'down {change}',
  candleFlat: 'unchanged',
  candleOpen: 'Open',
  candleHigh: 'High',
  candleLow: 'Low',
  candleClose: 'Close',
  candleChange: 'Change',
  candleVolume: 'Volume',
  candleDate: 'Date',
  candleMa: '{period}-day average',
  candleIntro: '{type}, {sessions}, {from} to {to}.',
  candleTrend: 'Close from {first} to {last} ({change}).',
  candleExtremes: 'Highest high {high} on {highAt}; lowest low {low} on {lowAt}.',
  candleSkipped: 'Not plotted (non-trading days): {list}.',
  sessionCount_one: '{count} session',
  sessionCount_other: '{count} sessions',
});

const COMPONENT = 'candlestickChart';
const CODE = 'CANDLESTICK_CHART_OPTIONS';
const MAX_POINTS = 20000;

interface Session {
  readonly point: CandlestickPoint;
  /** Position on the axis (trading-day or day index). */
  readonly pos: number;
}

interface Average {
  readonly id: string;
  readonly label: string;
  readonly slot: number;
  readonly position: number;
  readonly style: ChartSeriesStyle | undefined;
  /** Value per session (null before the period is filled). */
  readonly values: readonly (number | null)[];
}

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly sessions: readonly Session[];
  readonly skipped: readonly CandlestickPoint[];
  readonly averages: readonly Average[];
  readonly hasVolume: boolean;
  readonly extent: number;
  readonly format: (value: number) => string;
  readonly formatVolume: (value: number) => string;
  readonly percent: (ratio: number) => string;
  readonly percentAbs: (ratio: number) => string;
}

export class CandlestickChart extends FrameChart<CandlestickChartOptions, Model> {
  readonly #zoom: ChartZoom;
  #plot: PlotRect = { left: 0, right: 0, top: 0, bottom: 0 };
  #centers = new Map<number, number>();
  #window: [number, number] = [0, -1];
  #invertX: (px: number) => number = () => 0;
  #elements = new Map<number, SVGElement>();

  /** Render a candlestick chart into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: CandlestickChartOptions): CandlestickChart {
    return new CandlestickChart(host, options);
  }

  private constructor(host: HTMLElement, options: CandlestickChartOptions) {
    super(host, options, 'aui-candlestick-chart');
    this.#zoom = new ChartZoom({
      frame: this.frame,
      locale: () => this.model.config.locale,
      rtl: () => this.model.config.direction === 'rtl',
      extent: () => ({ x: { from: 0, to: Math.max(0, this.model.extent) }, y: null }),
      minSpan: () => ({ x: Math.min(5, Math.max(0, this.model.extent)), y: 0 }),
      plot: () => this.#plot,
      invertX: (px) => this.#invertX(px),
      invertY: (py) => py,
      formatX: (v) => this.#dateAt(v),
      formatY: (v) => this.model.format(v),
      changed: () => {
        this.frame.render();
      },
    });
    this.start((listener) => candlestickChartConfig.subscribe(listener));
  }

  /** Visible axis range, or null. */
  get zoomRange(): ChartZoomRange | null {
    return this.#zoom.x;
  }

  protected override mounted(): void {
    this.#syncZoom(this.options);
  }

  protected override optionsChanged(changed: Partial<CandlestickChartOptions>): void {
    this.#syncZoom(changed);
  }

  #syncZoom(o: Partial<CandlestickChartOptions>): void {
    this.#zoom.setMode(this.options.zoom === true ? 'x' : 'none');
    if (o.zoomRange !== undefined) this.#zoom.setWindow(o.zoomRange);
    else if (o.data !== undefined || o.businessCalendar !== undefined) this.#zoom.setWindow(this.#zoom.x);
  }

  protected override cleanup(): void {
    this.#zoom.destroy();
  }

  protected seriesIds(): readonly string[] {
    return (this.options.movingAverages ?? []).map((a) => a.id ?? `ma${String(a.period)}`);
  }

  protected assert(o: CandlestickChartOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.data) || o.data.length > MAX_POINTS) chartFail(CODE, COMPONENT, 'data', `CandlestickPoint[] (at most ${String(MAX_POINTS)})`);
    let previous = -Infinity;
    o.data.forEach((p: unknown, i) => {
      const at = `data[${String(i)}]`;
      if (!validators.isRecord(p)) chartFail(CODE, COMPONENT, at, 'CandlestickPoint');
      if (!isPlainDate(p.date)) chartFail(CODE, COMPONENT, `${at}.date`, 'PlainDate');
      const epoch = toEpochDay(p.date);
      if (epoch <= previous) chartFail(CODE, COMPONENT, `${at}.date`, 'a date after the previous entry (ascending, no duplicates)');
      previous = epoch;
      for (const key of ['open', 'high', 'low', 'close'] as const) if (!(typeof p[key] === 'number' && Number.isFinite(p[key]))) chartFail(CODE, COMPONENT, `${at}.${key}`, 'finite number');
      const { open, high, low, close } = p as unknown as CandlestickPoint;
      if (high < Math.max(open, close, low)) chartFail(CODE, COMPONENT, `${at}.high`, 'at least open, close, and low');
      if (low > Math.min(open, close)) chartFail(CODE, COMPONENT, `${at}.low`, 'at most open and close');
      if (p.volume !== undefined && !(typeof p.volume === 'number' && Number.isFinite(p.volume) && p.volume >= 0)) chartFail(CODE, COMPONENT, `${at}.volume`, 'finite number >= 0');
    });
    const type: unknown = o.type;
    if (type !== undefined && type !== 'candle' && type !== 'ohlc') chartFail(CODE, COMPONENT, 'type', '"candle" | "ohlc"');
    if (o.volume !== undefined && typeof o.volume !== 'boolean') chartFail(CODE, COMPONENT, 'volume', 'boolean');
    const averages: unknown = o.movingAverages;
    if (averages !== undefined) {
      if (!Array.isArray(averages) || averages.length > 4) chartFail(CODE, COMPONENT, 'movingAverages', 'CandlestickMovingAverage[] (up to 4)');
      const ids = new Set<string>();
      averages.forEach((a: unknown, i) => {
        const at = `movingAverages[${String(i)}]`;
        if (!validators.isRecord(a) || !(typeof a.period === 'number' && Number.isInteger(a.period) && a.period >= 2 && a.period <= 250)) chartFail(CODE, COMPONENT, `${at}.period`, 'integer from 2 to 250');
        const id = a.id === undefined ? `ma${String(a.period)}` : a.id;
        if (typeof id !== 'string' || id === '' || ids.has(id)) chartFail(CODE, COMPONENT, `${at}.id`, 'unique non-empty string');
        ids.add(id);
        if (a.label !== undefined && typeof a.label !== 'string') chartFail(CODE, COMPONENT, `${at}.label`, 'string');
        if (!isChartColor(a.color)) chartFail(CODE, COMPONENT, `${at}.color`, 'integer 1-8');
        assertSeriesStyle(a.style, at, COMPONENT, CODE);
      });
    }
    if (o.businessCalendar !== undefined && o.businessCalendar !== null && !isBusinessCalendar(o.businessCalendar)) chartFail(CODE, COMPONENT, 'businessCalendar', 'BusinessCalendarEngine (createBusinessCalendar) or null');
    assertValueAxis(o.priceAxis, 'priceAxis', COMPONENT, CODE);
    if (o.volumeFormat !== undefined && !validators.isRecord(o.volumeFormat)) chartFail(CODE, COMPONENT, 'volumeFormat', 'Intl.NumberFormatOptions');
    if (o.zoom !== undefined && typeof o.zoom !== 'boolean') chartFail(CODE, COMPONENT, 'zoom', 'boolean');
    assertZoomRange(o.zoomRange, 'zoomRange', COMPONENT, CODE);
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = candlestickChartConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'crosshair', 'locale', 'direction']));
    const calendar = o.businessCalendar ?? null;
    const sessions: Session[] = [];
    const skipped: CandlestickPoint[] = [];
    let previous: CandlestickPoint | null = null;
    let pos = 0;
    const first = o.data[0];
    for (const point of o.data) {
      if (calendar) {
        if (!calendar.isWorkingDay(point.date)) {
          skipped.push(point);
          continue;
        }
        // Incremental: each call walks only the gap since the previous session.
        pos = previous ? pos + calendar.workingDaysBetween(previous.date, point.date) : 0;
      } else {
        pos = first ? toEpochDay(point.date) - toEpochDay(first.date) : 0;
      }
      sessions.push({ point, pos });
      previous = point;
    }
    const averages: Average[] = (o.movingAverages ?? []).map((a, position) => {
      const values: (number | null)[] = [];
      let sum = 0;
      sessions.forEach((s, i) => {
        sum += s.point.close;
        if (i >= a.period) sum -= sessions[i - a.period]?.point.close ?? 0;
        values.push(i >= a.period - 1 ? sum / a.period : null);
      });
      return { id: a.id ?? `ma${String(a.period)}`, label: a.label ?? getMessage('chart', 'candleMa', { period: a.period }, config.locale), slot: colorSlot(a.color, position + 1), position, style: a.style, values };
    });
    const pf = new Intl.NumberFormat(config.locale, { style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' });
    const pa = new Intl.NumberFormat(config.locale, { style: 'percent', maximumFractionDigits: 2 });
    const vf = new Intl.NumberFormat(config.locale, o.volumeFormat ?? { notation: 'compact', maximumFractionDigits: 1 });
    const empty = sessions.length === 0 ? getMessage('chart', 'noData', {}, config.locale) : null;
    return {
      config,
      sessions,
      skipped,
      averages,
      hasVolume: o.volume !== false && sessions.some((s) => s.point.volume !== undefined),
      extent: sessions.at(-1)?.pos ?? 0,
      format: valueFormatter(o, config.locale),
      formatVolume: (v) => vf.format(v),
      percent: (r) => pf.format(r),
      percentAbs: (r) => pa.format(r),
      empty,
    };
  }

  #date(d: PlainDate): string {
    return formatPlainDate(d, { dateStyle: 'medium' }, this.model.config.locale);
  }

  /** Date text at an axis position (zoom announcements). */
  #dateAt(pos: number): string {
    const s = this.model.sessions;
    let best = s[0];
    for (const x of s) if (Math.abs(x.pos - pos) < Math.abs((best?.pos ?? 0) - pos)) best = x;
    return best ? this.#date(best.point.date) : '';
  }

  #changeText(p: CandlestickPoint, prevClose: number | undefined): string {
    const base = prevClose ?? p.open;
    const ratio = base === 0 ? 0 : (p.close - base) / base;
    if (p.close === base) return this.message('candleFlat');
    return this.message(p.close > base ? 'candleUp' : 'candleDown', { change: this.model.percentAbs(Math.abs(ratio)) });
  }

  #label(i: number): string {
    const s = this.model.sessions[i];
    if (!s) return '';
    const f = this.model.format;
    const p = s.point;
    return this.message('candle', { date: this.#date(p.date), open: f(p.open), high: f(p.high), low: f(p.low), close: f(p.close), change: this.#changeText(p, this.model.sessions[i - 1]?.point.close) });
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    this.configureFrame('roleCandlestick');
    this.frame.setCrosshair(m.config.crosshair ? 'xy' : 'none');
    this.frame.setText(o.label, o.hideLabel === true, o.description, o.summary ?? this.#summaryText());
    const items: LegendItem[] = m.averages.map((a) => ({ id: a.id, label: a.label, slot: a.slot, shapeSlot: a.position + 1, swatch: 'line', visible: !this.hidden.has(a.id), seriesStyle: { ...a.style, marker: 'none' } }));
    this.frame.setLegend(items, m.config.legend === 'show' || (m.config.legend === 'auto' && items.length > 0), true);
    this.frame.setTable(m.config.dataTable, () => this.#tableData());
    this.frame.setEmpty(m.empty);
    this.frame.render();
  }

  #summaryText(): string {
    const m = this.model;
    const s = m.sessions;
    const locale = m.config.locale;
    const firstSession = s[0];
    const lastSession = s.at(-1);
    if (!firstSession || !lastSession) return this.message('candleIntro', { type: this.message('roleCandlestick'), sessions: chartPlural('sessionCount', 0, locale), from: '', to: '' });
    const parts = [this.message('candleIntro', { type: this.message('roleCandlestick'), sessions: chartPlural('sessionCount', s.length, locale), from: this.#date(firstSession.point.date), to: this.#date(lastSession.point.date) })];
    const firstClose = firstSession.point.close;
    parts.push(this.message('candleTrend', { first: m.format(firstClose), last: m.format(lastSession.point.close), change: m.percent(firstClose === 0 ? 0 : (lastSession.point.close - firstClose) / firstClose) }));
    let high = firstSession;
    let low = firstSession;
    for (const x of s) {
      if (x.point.high > high.point.high) high = x;
      if (x.point.low < low.point.low) low = x;
    }
    parts.push(this.message('candleExtremes', { high: m.format(high.point.high), highAt: this.#date(high.point.date), low: m.format(low.point.low), lowAt: this.#date(low.point.date) }));
    if (m.skipped.length) parts.push(this.message('candleSkipped', { list: listFormat(m.skipped.slice(0, 10).map((p) => this.#date(p.date)), locale) }));
    const hidden = m.averages.filter((a) => this.hidden.has(a.id)).map((a) => a.label);
    if (hidden.length) parts.push(this.message('hidden', { list: listFormat(hidden, locale) }));
    return parts.join(' ');
  }

  #tableData(): TableData {
    const o = this.options;
    const m = this.model;
    const none = this.message('noValue');
    return {
      caption: o.label,
      columns: [this.message('candleDate'), this.message('candleOpen'), this.message('candleHigh'), this.message('candleLow'), this.message('candleClose'), ...(m.hasVolume ? [this.message('candleVolume')] : []), ...m.averages.map((a) => a.label)],
      numeric: [false, true, true, true, true, true, ...m.averages.map(() => true)],
      rows: m.sessions.map((s, i) => {
        const p = s.point;
        return [
          this.#date(p.date),
          m.format(p.open),
          m.format(p.high),
          m.format(p.low),
          m.format(p.close),
          ...(m.hasVolume ? [p.volume === undefined ? none : m.formatVolume(p.volume)] : []),
          ...m.averages.map((a) => {
            const v = a.values[i];
            return v === null || v === undefined ? none : m.format(v);
          }),
        ];
      }),
    };
  }

  protected draw(width: number, height: number): void {
    const o = this.options;
    const m = this.model;
    const frame = this.frame;
    const doc = frame.doc;
    const layer = frame.layer;
    this.#centers = new Map();
    this.#elements = new Map();
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const side = rtl ? 'right' : 'left';
    const px = fontSize(frame.svg);
    const win = this.#zoom.x ?? { from: 0, to: m.extent };
    // Sessions in the window (with half a slot of margin).
    const visible: number[] = [];
    m.sessions.forEach((s, i) => {
      if (s.pos >= win.from - 0.5 && s.pos <= win.to + 0.5) visible.push(i);
    });
    this.#window = [visible[0] ?? 0, visible.at(-1) ?? -1];
    let lo = Infinity;
    let hi = -Infinity;
    let vmax = 0;
    for (const i of visible) {
      const p = m.sessions[i]?.point;
      if (!p) continue;
      lo = Math.min(lo, p.low);
      hi = Math.max(hi, p.high);
      vmax = Math.max(vmax, p.volume ?? 0);
      for (const a of m.averages) {
        const v = a.values[i];
        if (v !== null && v !== undefined && !this.hidden.has(a.id)) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
    }
    if (!Number.isFinite(lo)) {
      lo = 0;
      hi = 1;
    }
    const pTitle = o.priceAxis?.label;
    const vertical = plotVertical(height, px, false);
    const paneGap = Math.ceil(px);
    const paneHeight = m.hasVolume ? Math.round((vertical.bottom - vertical.top) * 0.22) : 0;
    const priceBottom = m.hasVolume ? vertical.bottom - paneHeight - paneGap : vertical.bottom;
    const ticks = valueTicks(lo, hi, priceBottom - vertical.top, o.priceAxis);
    const tickFormat = tickFormatter(o, ticks.decimals, m.config.locale);
    const plot = plotRect(width, vertical, px, rtl, valueAxisWidth(ticks.values.map(tickFormat), px, Boolean(pTitle)));
    const pricePlot: PlotRect = { ...plot, bottom: priceBottom };
    this.#plot = plot;
    frame.setPlot(plot);
    const price = linearScale([ticks.min, ticks.max], [priceBottom, plot.top]);
    const clampPrice = (v: number): number => price.map(Math.min(ticks.max, Math.max(ticks.min, v)));
    drawValueAxis(doc, layer, { axis: 'y', ticks: ticks.values.filter((t) => t >= ticks.min - 1e-9 && t <= ticks.max + 1e-9), map: price.map, plot: pricePlot, side, format: tickFormat, fontPx: px, zero: null });
    if (pTitle) drawAxisTitle(doc, layer, 'y', pTitle, pricePlot, width, height, side, px);
    const span = Math.max(1, win.to - win.from + 1);
    const slot = (plot.right - plot.left) / span;
    const dir = rtl ? -1 : 1;
    const origin = rtl ? plot.right : plot.left;
    const center = (pos: number): number => origin + dir * (pos - win.from + 0.5) * slot;
    this.#invertX = (p) => win.from + (dir * (p - origin)) / slot - 0.5;
    const body = Math.max(1, Math.min(24, slot * 0.7));
    // Date labels for the visible sessions (thinned by the axis helper).
    const labelled = visible.map((i) => m.sessions[i]).filter((s): s is Session => s !== undefined);
    drawCategoryLabels(doc, layer, { axis: 'x', labels: labelled.map((s) => formatPlainDate(s.point.date, { month: 'short', day: 'numeric' }, m.config.locale)), positions: labelled.map((s) => center(s.pos)), spacing: slot, plot, side, fontPx: px, maxWidth: 0, width });
    drawBaseline(doc, layer, 'x', plot, side);
    if (m.hasVolume) {
      const paneTop = priceBottom + paneGap;
      const volume = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-candlestick-chart__volume');
      volume.append(svgElement(doc, 'line', { x1: plot.left, x2: plot.right, y1: paneTop, y2: paneTop }, 'aui-chart__gridline'));
      const label = svgElement(doc, 'text', { x: rtl ? plot.right + 6 : plot.left - 6, y: paneTop + px * 0.6, 'text-anchor': rtl ? 'start' : 'end', 'dominant-baseline': 'middle' }, 'aui-chart__tick-label');
      label.textContent = m.formatVolume(vmax);
      volume.append(label);
      for (const i of visible) {
        const s = m.sessions[i];
        if (s?.point.volume === undefined || vmax <= 0) continue;
        const h = (s.point.volume / vmax) * (plot.bottom - paneTop);
        const up = s.point.close >= s.point.open;
        volume.append(roundedBox(doc, { x: center(s.pos) - body / 2, y: plot.bottom - h, width: body, height: Math.max(0.5, h) }, sideRadii(frame.corners.bar ?? 0, ['top']), `aui-candlestick-chart__volume-bar aui-candlestick-chart__volume-bar--${up ? 'up' : 'down'}`));
      }
      layer.append(volume);
    }
    const candles = svgElement(doc, 'g', { 'clip-path': frame.clip(plot) }, 'aui-candlestick-chart__candles');
    const ohlc = o.type === 'ohlc';
    const marks: FrameMark[] = [];
    // R20-22: candle bodies take `boxRadius` / `cornerRadius` (clamped to half the body).
    const bodyRadius = frame.corners.box ?? 0;
    for (const i of visible) {
      const s = m.sessions[i];
      if (!s) continue;
      const p = s.point;
      const cx = center(s.pos);
      this.#centers.set(i, cx);
      const yo = clampPrice(p.open);
      const yc = clampPrice(p.close);
      const yh = clampPrice(p.high);
      const yl = clampPrice(p.low);
      const up = p.close >= p.open;
      const half = body / 2;
      const d = ohlc
        ? `M${fmt(cx)} ${fmt(yh)}V${fmt(yl)}M${fmt(cx - half)} ${fmt(yo)}H${fmt(cx)}M${fmt(cx)} ${fmt(yc)}H${fmt(cx + half)}`
        : `M${fmt(cx)} ${fmt(yh)}V${fmt(Math.min(yo, yc))}M${fmt(cx)} ${fmt(Math.max(yo, yc))}V${fmt(yl)}${
            bodyRadius > 0
              ? roundedRectPath({ x: cx - half, y: Math.min(yo, yc), width: body, height: Math.max(1, Math.abs(yo - yc)) }, sideRadii(bodyRadius))
              : `M${fmt(cx - half)} ${fmt(Math.min(yo, yc))}h${fmt(body)}v${fmt(Math.max(1, Math.abs(yo - yc)))}h${fmt(-body)}Z`
          }`;
      const path = svgElement(doc, 'path', { d }, `aui-candlestick-chart__${ohlc ? 'bar' : 'candle'} aui-candlestick-chart__${ohlc ? 'bar' : 'candle'}--${up ? 'up' : 'down'}`);
      ChartFrame.markElement(path, this.#label(i));
      candles.append(path);
      this.#elements.set(i, path);
      marks.push({ element: path, row: 0, column: i, key: `c${String(i)}`, x: cx, y: yh });
    }
    layer.append(candles);
    const lines = svgElement(doc, 'g', { 'aria-hidden': 'true', 'clip-path': frame.clip(plot) }, 'aui-candlestick-chart__averages');
    for (const a of m.averages) {
      if (this.hidden.has(a.id)) continue;
      let d = '';
      let pen = false;
      for (const i of visible) {
        const v = a.values[i];
        const s = m.sessions[i];
        if (v === null || v === undefined || !s) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${fmt(center(s.pos))} ${fmt(clampPrice(v))}`;
        pen = true;
      }
      if (!d) continue;
      const g = svgElement(doc, 'g', {}, `aui-chart__series--c${String(a.slot)}`);
      applySeriesStyle(g, a.style);
      const line = svgElement(doc, 'path', { d }, `aui-chart__line aui-chart__dash--${String((a.position % 4) + 1)}`);
      applySeriesDash(line, a.style);
      g.append(line);
      lines.append(g);
    }
    layer.append(lines);
    frame.setMarks(marks);
  }

  protected hover(x: number, y: number): HoverResult | null {
    const p = this.#plot;
    if (y < p.top - 8 || y > p.bottom + 8 || x < p.left - 8 || x > p.right + 8) return null;
    const [lo, hi] = this.#window;
    let best = -1;
    let distance = Infinity;
    for (let i = lo; i <= hi; i++) {
      const cx = this.#centers.get(i);
      if (cx === undefined) continue;
      const dd = Math.abs(cx - x);
      if (dd < distance) {
        distance = dd;
        best = i;
      }
    }
    const mark = this.frame.marks.find((mk) => mk.column === best);
    const el = this.#elements.get(best);
    if (!mark || !el) return null;
    return { content: this.tooltip(mark), x: mark.x, y: mark.y, highlight: [el], crosshair: { x: mark.x, y: Math.min(p.bottom, Math.max(p.top, y)) }, column: best };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const m = this.model;
    const s = m.sessions[mark.column];
    if (!s) return { title: '', rows: [] };
    const p = s.point;
    const f = m.format;
    const row = (label: string, value: string): TooltipRow => ({ slot: 1, shapeSlot: 1, swatch: 'none', label, value });
    const rows: TooltipRow[] = [
      row(this.message('candleOpen'), f(p.open)),
      row(this.message('candleHigh'), f(p.high)),
      row(this.message('candleLow'), f(p.low)),
      row(this.message('candleClose'), f(p.close)),
      row(this.message('candleChange'), this.#changeText(p, m.sessions[mark.column - 1]?.point.close)),
    ];
    if (m.hasVolume && p.volume !== undefined) rows.push(row(this.message('candleVolume'), m.formatVolume(p.volume)));
    for (const a of m.averages) {
      const v = a.values[mark.column];
      if (this.hidden.has(a.id) || v === null || v === undefined) continue;
      rows.push({ slot: a.slot, shapeSlot: a.position + 1, swatch: 'line', label: a.label, value: f(v), seriesId: a.id, seriesStyle: { ...a.style, marker: 'none' } });
    }
    return { title: this.#date(p.date), rows };
  }

  protected override pointDetail(mark: FrameMark): Pick<ChartPointClickDetail, 'seriesId' | 'series' | 'value'> | null {
    const s = this.model.sessions[mark.column];
    return s ? { seriesId: null, series: this.message('candleClose'), value: this.model.format(s.point.close) } : null;
  }

  protected override key(event: KeyboardEvent, mark: FrameMark): boolean {
    const s = this.model.sessions[mark.column];
    return s ? this.#zoom.key(event, { x: s.pos }) : false;
  }

  protected override beyond(mark: FrameMark, step: 1 | -1): string | null {
    const win = this.#zoom.x;
    if (!win) return null;
    const target = this.model.sessions[mark.column + step];
    if (!target) return null;
    this.#zoom.pan(step > 0 ? target.pos - win.to : target.pos - win.from, 0, 'keyboard');
    return `c${String(mark.column + step)}`;
  }
}
