/**
 * Line Chart (SPEC section 18.18: Line Chart, Area Chart). Accessible SVG line chart
 * with one or more series over a shared x axis (categories, numbers, or instants),
 * an optional area fill, gaps for missing values, a legend that toggles series,
 * keyboard-reachable data points (roving focus) with tooltips, a generated
 * summary, and a data table fallback. Series differ by color, marker shape, and
 * (with `patterns`) dash pattern, never by color alone (WCAG 1.4.1). Time axes
 * use the configured timezone (UTC by default). No animation.
 */
import {
  defineComponentConfig,
  DisposableGroup,
  emit,
  getMessage,
  validators,
  type Direction,
  type Instant,
  type ZonedDateTime,
} from '@absoluteui/core';
import { drawAxisTitle, drawBaseline, drawCategoryLabels, drawValueAxis, fontSize, textWidth, type PlotRect } from '../internal/chart/axis.js';
import { ChartFrame, type FrameMark, type HoverResult, type LegendItem, type TableData, type TooltipContent, type TooltipRow } from '../internal/chart/frame.js';
import {
  assertCommon,
  assertSeries,
  cartesianSummary,
  chartBaseSchema,
  chartFail,
  chartMessage,
  colorSlot,
  fillTemplate,
  finite,
  pickDefined,
  tickFormatter,
  valueFormatter,
  type ChartBaseConfig,
  type ChartCommonOptions,
  type ChartSeries,
} from '../internal/chart/model.js';
import { invert, lowerBound } from '../internal/chart/cartesian.js';
import { ChartZoom, type ChartZoomDetail, type ChartZoomRange } from '../internal/chart/zoom.js';
import { bandScale, linearScale, linearTicks, timeTicks, type TimeUnit } from '../internal/chart/scale.js';
import { annotationSentence, applySeriesDash, applySeriesStyle, assertAnnotations, categoryPosition, drawAnnotations, markerRadius, numericPosition, seriesMarker, type ChartAnnotation, type ChartPointClickDetail } from '../internal/chart/style.js';
import { fmt, MARKER_SHAPES, markerPath, svgElement } from '../internal/chart/svg.js';

export type LineChartXValue = string | number | Instant | ZonedDateTime;
export type LineChartXType = 'category' | 'linear' | 'time';
export type LineChartMarkers = 'auto' | 'always' | 'focus';

export interface LineChartConfig extends ChartBaseConfig {
  /** `auto`: markers when points are at least 12 px apart; `focus`: only on hover and focus. Default `auto`. */
  markers: LineChartMarkers;
  /** Vertical crosshair line following the hovered or focused x value. Default false. */
  crosshair: boolean;
}

type Resolved = Readonly<LineChartConfig & { locale: string; timezone: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    lineChart: LineChartConfig & { locale: string; timezone: string; direction: Direction };
  }
}

export const lineChartConfig = defineComponentConfig<LineChartConfig, 'locale' | 'timezone' | 'direction'>(
  'lineChart',
  {
    ...chartBaseSchema,
    markers: { default: 'auto', expected: '"auto" | "always" | "focus"', validate: validators.oneOf(['auto', 'always', 'focus'] as const) },
    crosshair: { default: false, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'timezone', 'direction'],
);

export interface LineChartAxis {
  /** Axis title (visible, and used in the summary and data table header). */
  label?: string;
  /** Approximate number of ticks. Default: from the available size. */
  tickCount?: number;
}

export interface LineChartYAxis extends LineChartAxis {
  /** Fixed domain minimum. Default: from the data (nice-rounded). */
  min?: number;
  /** Fixed domain maximum. Default: from the data (nice-rounded). */
  max?: number;
  /** Include zero in the domain. Default: true with `area`, otherwise false. */
  includeZero?: boolean;
}

export interface LineChartOptions extends ChartCommonOptions, Partial<LineChartConfig> {
  /**
   * Shared x values, one per data point: strings (categories), numbers, or
   * instants (Instant or ZonedDateTime). Numbers and instants must be ascending.
   */
  x: readonly LineChartXValue[];
  /** Each series has exactly one value per x value. */
  series: readonly ChartSeries[];
  /** Fill the area between each line and the baseline. */
  area?: boolean;
  /** Axis type. Default: inferred from `x` (string -> category, number -> linear, instant -> time). */
  xType?: LineChartXType;
  xAxis?: LineChartAxis;
  yAxis?: LineChartYAxis;
  /** Custom x text (tooltips, accessible labels, table, summary). Axis ticks keep their own format for linear and time axes. */
  formatX?: (value: LineChartXValue, index: number) => string;
  /** Intl.DateTimeFormat options for time x values. Default: chosen from the data resolution. */
  timeFormat?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>;
  timezone?: string;
  /** Zoom and pan along x: toolbar buttons, +/- keys, Ctrl/Cmd + wheel, drag to pan, Shift + drag to select. Default false. */
  zoom?: boolean;
  /** Visible x range (category index, number, or epoch ms); null shows everything. Clamped to the data. */
  zoomRange?: ChartZoomRange | null;
  /** Reference lines and bands: x values are categories (label or index), numbers, or epoch ms; y values are numbers. */
  annotations?: readonly ChartAnnotation[] | undefined;
}

/** Detail of `aui-zoom`. */
export type LineChartZoomDetail = ChartZoomDetail;

/** Detail of `aui-point-click`. */
export type LineChartPointClickDetail = ChartPointClickDetail;

/** Detail of `aui-series-toggle` (declared per chart so adapters can name it). */
export interface LineChartSeriesToggleDetail {
  /** Toggled series (or slice) id. */
  id: string;
  visible: boolean;
  /** All hidden ids after the change. */
  hidden: string[];
}

const COMPONENT = 'lineChart';
const CODE = 'LINE_CHART_OPTIONS';
const TYPES: readonly LineChartXType[] = ['category', 'linear', 'time'];
/** Above this many visible points, points become virtual marks (no DOM node per point). */
const DENSE_POINTS = 600;

function isInstantLike(v: unknown): v is Instant | ZonedDateTime {
  return typeof v === 'object' && v !== null && 'epochMilliseconds' in v && typeof v.epochMilliseconds === 'number';
}

function inferType(x: readonly LineChartXValue[]): LineChartXType {
  const first = x[0];
  if (typeof first === 'number') return 'linear';
  if (isInstantLike(first)) return 'time';
  return 'category';
}

interface Model {
  readonly config: Resolved;
  readonly type: LineChartXType;
  /** Numeric x per index (index for categories, value for numbers, epoch ms for instants). */
  readonly xs: readonly number[];
  readonly xLabels: readonly string[];
  readonly visible: readonly { readonly series: ChartSeries; readonly position: number; readonly row: number }[];
  readonly yMin: number;
  readonly yMax: number;
  readonly format: (value: number) => string;
  /** Text of an x data value (zoom announcements). */
  readonly formatX: (value: number) => string;
  readonly empty: string | null;
}

/** Wall-clock resolution of the x instants in `timeZone`: the coarsest unit all values align to. */
function timeResolution(xs: readonly number[], timeZone: string): 'year' | 'month' | 'day' | 'minute' | 'second' {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  let month = true;
  let day = true;
  let midnight = true;
  let minute = true;
  // Sampling bounds the cost for large series; the first 200 values decide.
  for (const x of xs.slice(0, 200)) {
    const f: Record<string, number> = {};
    for (const p of parts.formatToParts(x)) f[p.type] = Number(p.value);
    // Numeric parts are unpadded ("0"); compare numbers. Hour 24 is midnight in some engines.
    const hour = (f.hour ?? 0) % 24;
    if (f.second !== 0 || x % 1000 !== 0) minute = false;
    if (hour !== 0 || f.minute !== 0 || f.second !== 0) midnight = false;
    if (f.day !== 1) day = false;
    if (f.month !== 1) month = false;
  }
  if (!midnight) return minute ? 'minute' : 'second';
  if (!day) return 'day';
  return month ? 'year' : 'month';
}

const TIME_FORMATS: Readonly<Record<string, Intl.DateTimeFormatOptions>> = {
  year: { year: 'numeric' },
  month: { year: 'numeric', month: 'long' },
  day: { dateStyle: 'medium' },
  minute: { dateStyle: 'medium', timeStyle: 'short' },
  second: { dateStyle: 'medium', timeStyle: 'medium' },
};

const TICK_FORMATS: Readonly<Record<TimeUnit, Intl.DateTimeFormatOptions>> = {
  year: { year: 'numeric' },
  month: { month: 'short', year: 'numeric' },
  day: { month: 'short', day: 'numeric' },
  hour: { hour: 'numeric', minute: '2-digit' },
  minute: { hour: 'numeric', minute: '2-digit' },
  second: { hour: 'numeric', minute: '2-digit', second: '2-digit' },
  millisecond: { minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 },
};

export class LineChart {
  readonly host: HTMLElement;
  #options: LineChartOptions;
  #hidden: Set<string>;
  #model: Model;
  readonly #frame: ChartFrame;
  readonly #group = new DisposableGroup();
  /** Rendered point positions per visible row, for hover hit-testing. */
  #columns: number[] = [];
  /** Point elements per visible row (sparse arrays; empty in dense mode). */
  #elements: (SVGPathElement | undefined)[][] = [];
  #yMap: (value: number) => number = () => 0;
  #plot: PlotRect = { left: 0, right: 0, top: 0, bottom: 0 };
  readonly #zoom: ChartZoom;
  #invertX: (px: number) => number = () => 0;
  /** First and last index with marks in the current render. */
  #visibleRange: readonly [number, number] = [0, -1];

  /** Render a line chart into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: LineChartOptions): LineChart {
    return new LineChart(host, options);
  }

  private constructor(host: HTMLElement, options: LineChartOptions) {
    LineChart.#assert(options);
    this.host = host;
    this.#options = { ...options };
    this.#hidden = new Set(options.hiddenSeries ?? []);
    // Resolve config and the model before touching the host: invalid input leaves it untouched.
    this.#model = this.#prepare();
    this.#frame = new ChartFrame(host, 'aui-line-chart', {
      render: (w, h) => {
        this.#render(w, h);
      },
      hover: (x, y) => this.#hover(x, y),
      tooltip: (mark) => this.#tooltip(mark),
      paint: (mark, element) => {
        this.#paint(mark, element);
      },
      toggle: (id) => {
        this.#toggle(id);
      },
      beyond: (mark, step) => this.#beyond(mark, step),
      key: (event, mark) => this.#zoom.key(event, { x: this.#model.xs[mark.column] ?? 0 }),
    });
    this.#zoom = new ChartZoom({
      frame: this.#frame,
      locale: () => this.#model.config.locale,
      rtl: () => this.#model.config.direction === 'rtl',
      extent: () => ({ x: { from: this.#model.xs[0] ?? 0, to: this.#model.xs[this.#model.xs.length - 1] ?? 0 }, y: null }),
      minSpan: () => {
        const xs = this.#model.xs;
        const full = (xs[xs.length - 1] ?? 0) - (xs[0] ?? 0);
        // At least two points (categories) stay visible.
        return { x: xs.length > 2 ? Math.min(full, (full / (xs.length - 1)) * 2) : full, y: 0 };
      },
      plot: () => this.#plot,
      invertX: (px) => this.#invertX(px),
      invertY: (py) => py,
      formatX: (v) => this.#model.formatX(v),
      formatY: (v) => this.#model.format(v),
      changed: () => {
        this.#frame.render();
      },
    });
    this.#frame.mount();
    this.#zoom.setMode(options.zoom === true ? 'x' : 'none');
    if (options.zoomRange !== undefined) this.#zoom.setWindow(options.zoomRange);
    this.#apply();
    this.#group.add(lineChartConfig.subscribe(() => {
      this.#model = this.#prepare();
      this.#apply();
    }));
  }

  /** Ids of hidden series. */
  get hiddenSeries(): string[] {
    return this.#options.series.filter((s) => this.#hidden.has(s.id)).map((s) => s.id);
  }

  /** The generated (or custom) accessible summary. */
  get summary(): string {
    return this.#frame.summary;
  }

  /** The SVG plot (role="group"). */
  get element(): SVGSVGElement {
    return this.#frame.svg;
  }

  /** Visible x range, or null when showing everything. */
  get zoomRange(): ChartZoomRange | null {
    return this.#zoom.x;
  }

  update(options: Partial<LineChartOptions>): void {
    const next = { ...this.#options, ...options };
    LineChart.#assert(next);
    const previousHidden = this.#hidden;
    if (options.hiddenSeries !== undefined) this.#hidden = new Set(options.hiddenSeries);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#model = this.#prepare();
    } catch (e) {
      this.#options = previous;
      this.#hidden = previousHidden;
      throw e;
    }
    this.#zoom.setMode(next.zoom === true ? 'x' : 'none');
    if (options.zoomRange !== undefined) this.#zoom.setWindow(options.zoomRange);
    else if (options.x !== undefined) this.#zoom.setWindow(this.#zoom.x);
    this.#apply();
  }

  /** Show or hide a series programmatically (no event). */
  setSeriesVisible(id: string, visible: boolean): void {
    if (visible) this.#hidden.delete(id);
    else this.#hidden.add(id);
    this.#model = this.#prepare();
    this.#apply();
  }

  destroy(): void {
    this.#group.dispose();
    this.#zoom.destroy();
    this.#frame.destroy();
    this.host.classList.remove('aui-line-chart--markers', 'aui-line-chart--area');
  }

  static #assert(o: LineChartOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.x)) chartFail(CODE, COMPONENT, 'x', '(string | number | Instant | ZonedDateTime)[]');
    if (o.xType !== undefined && !TYPES.includes(o.xType)) chartFail(CODE, COMPONENT, 'xType', '"category" | "linear" | "time"');
    const type = o.xType ?? inferType(o.x);
    let previous = -Infinity;
    for (const v of o.x) {
      if (type === 'category') {
        if (typeof v !== 'string') chartFail(CODE, COMPONENT, 'x', 'string[] for a category axis');
        continue;
      }
      const n = type === 'linear' ? (typeof v === 'number' ? v : Number.NaN) : isInstantLike(v) ? v.epochMilliseconds : Number.NaN;
      if (!Number.isFinite(n)) chartFail(CODE, COMPONENT, 'x', type === 'linear' ? 'finite number[] for a linear axis' : 'Instant[] for a time axis');
      if (n < previous) chartFail(CODE, COMPONENT, 'x', 'ascending values');
      previous = n;
    }
    assertSeries(o.series, COMPONENT, CODE);
    o.series.forEach((s, i) => {
      if (s.values.length !== o.x.length) chartFail(CODE, COMPONENT, `series[${String(i)}].values`, 'one value per x value');
    });
    if (o.area !== undefined && typeof o.area !== 'boolean') chartFail(CODE, COMPONENT, 'area', 'boolean');
    if (o.formatX !== undefined && typeof o.formatX !== 'function') chartFail(CODE, COMPONENT, 'formatX', '(value, index) => string');
    for (const key of ['xAxis', 'yAxis'] as const) {
      const axis = o[key];
      if (axis === undefined) continue;
      if (typeof axis !== 'object') chartFail(CODE, COMPONENT, key, 'axis options object');
      if (axis.label !== undefined && typeof axis.label !== 'string') chartFail(CODE, COMPONENT, `${key}.label`, 'string');
      if (axis.tickCount !== undefined && !(Number.isInteger(axis.tickCount) && axis.tickCount >= 2 && axis.tickCount <= 20)) chartFail(CODE, COMPONENT, `${key}.tickCount`, 'integer from 2 to 20');
    }
    const y = o.yAxis;
    if (y?.min !== undefined && !Number.isFinite(y.min)) chartFail(CODE, COMPONENT, 'yAxis.min', 'finite number');
    if (y?.max !== undefined && !Number.isFinite(y.max)) chartFail(CODE, COMPONENT, 'yAxis.max', 'finite number');
    if (y?.min !== undefined && y.max !== undefined && y.max <= y.min) chartFail(CODE, COMPONENT, 'yAxis.max', 'number greater than yAxis.min');
    if (y?.includeZero !== undefined && typeof y.includeZero !== 'boolean') chartFail(CODE, COMPONENT, 'yAxis.includeZero', 'boolean');
    if (o.zoom !== undefined && typeof o.zoom !== 'boolean') chartFail(CODE, COMPONENT, 'zoom', 'boolean');
    assertAnnotations(o.annotations, COMPONENT, CODE);
    const z: unknown = o.zoomRange;
    if (z !== undefined && z !== null && !(validators.isRecord(z) && Number.isFinite(z.from) && Number.isFinite(z.to))) chartFail(CODE, COMPONENT, 'zoomRange', '{ from: number; to: number } | null');
  }

  #config(): Resolved {
    return lineChartConfig.resolve(pickDefined(this.#options, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'markers', 'crosshair', 'locale', 'timezone', 'direction']));
  }

  #prepare(): Model {
    const o = this.#options;
    const config = this.#config();
    const type = o.xType ?? inferType(o.x);
    const n = o.x.length;
    const xs = o.x.map((v, i) => (type === 'category' ? i : typeof v === 'number' ? v : isInstantLike(v) ? v.epochMilliseconds : i));
    let xLabels: string[];
    let formatX: (value: number) => string;
    if (type === 'time') {
      const df = new Intl.DateTimeFormat(config.locale, { ...(o.timeFormat ?? TIME_FORMATS[timeResolution(xs, config.timezone)]), timeZone: config.timezone });
      formatX = (v) => df.format(v);
    } else if (type === 'linear') {
      const nf = new Intl.NumberFormat(config.locale, { maximumFractionDigits: 2 });
      formatX = (v) => nf.format(v);
    } else {
      formatX = (v) => {
        const label = o.x[Math.min(n - 1, Math.max(0, Math.round(v)))];
        return typeof label === 'string' ? label : '';
      };
    }
    if (o.formatX) {
      const custom = o.formatX;
      xLabels = o.x.map((v, i) => custom(v, i));
    } else if (type === 'time') {
      const df = new Intl.DateTimeFormat(config.locale, { ...(o.timeFormat ?? TIME_FORMATS[timeResolution(xs, config.timezone)]), timeZone: config.timezone });
      xLabels = xs.map((x) => df.format(x));
    } else if (type === 'linear') {
      const nf = new Intl.NumberFormat(config.locale);
      xLabels = xs.map((x) => nf.format(x));
    } else {
      xLabels = o.x.map(String);
    }
    const visible = o.series
      .map((series, position) => ({ series, position }))
      .filter((s) => !this.#hidden.has(s.series.id))
      .map((s, row) => ({ ...s, row }));
    let lo = Infinity;
    let hi = -Infinity;
    for (const { series } of visible) {
      for (let i = 0; i < n; i++) {
        const v = finite(series.values[i]);
        if (v === null) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const hasData = lo <= hi;
    const includeZero = o.yAxis?.includeZero ?? o.area === true;
    if (hasData && includeZero) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    if (o.yAxis?.min !== undefined) lo = o.yAxis.min;
    if (o.yAxis?.max !== undefined) hi = o.yAxis.max;
    const empty = n === 0 || o.series.length === 0
      ? chartMessage('noData', {}, config.locale)
      : visible.length === 0
        ? chartMessage('allHidden', {}, config.locale)
        : hasData ? null : chartMessage('noData', {}, config.locale);
    return { config, type, xs, xLabels, visible, yMin: hasData ? lo : 0, yMax: hasData ? hi : 1, format: valueFormatter(o, config.locale), formatX, empty };
  }

  #apply(): void {
    const o = this.#options;
    const m = this.#model;
    const { config } = m;
    const frame = this.#frame;
    frame.configure({
      height: config.height,
      rtl: config.direction === 'rtl',
      locale: config.locale,
      tooltip: config.tooltip,
      patterns: config.patterns,
      navigation: 'columns-horizontal',
      roleDescription: chartMessage(o.area ? 'roleArea' : 'roleLine', {}, config.locale),
      theme: o.theme,
      renderTooltip: o.renderTooltip,
      syncGroup: o.syncGroup,
    });
    this.host.classList.toggle('aui-line-chart--area', o.area === true);
    frame.setCrosshair(config.crosshair ? 'x' : 'none');
    const notes = annotationSentence(o.annotations, (v) => (typeof v === 'string' ? v : m.type === 'category' ? (m.xLabels[v] ?? String(v)) : m.formatX(v)), (v) => (typeof v === 'string' ? v : m.format(v)), config.locale);
    frame.setText(o.label, o.hideLabel === true, o.description, [o.summary ?? this.#summaryText(), notes].filter(Boolean).join(' '));
    const items: LegendItem[] = o.series.map((s, position) => ({
      id: s.id,
      label: s.label,
      slot: colorSlot(s.color, position),
      shapeSlot: position + 1,
      swatch: 'line',
      visible: !this.#hidden.has(s.id),
      seriesStyle: s.style,
    }));
    const showLegend = config.legend === 'show' || (config.legend === 'auto' && o.series.length > 1);
    frame.setLegend(items, showLegend, true);
    frame.setTable(config.dataTable, () => this.#tableData());
    frame.setEmpty(m.empty);
    frame.render();
  }

  #summaryText(): string {
    const o = this.#options;
    const m = this.#model;
    const locale = m.config.locale;
    const ticks = linearTicks(m.yMin, m.yMax, 5, o.yAxis?.min === undefined && o.yAxis?.max === undefined);
    return cartesianSummary({
      type: chartMessage(o.area ? 'roleArea' : 'roleLine', {}, locale),
      locale,
      series: o.series.map((s) => ({ label: s.label, values: s.values, hidden: this.#hidden.has(s.id) })),
      length: o.x.length,
      lengthKey: 'pointCount',
      xAxis: o.xAxis?.label ?? chartMessage('xAxis', {}, locale),
      xFrom: m.xLabels[0] ?? '',
      xTo: m.xLabels[m.xLabels.length - 1] ?? '',
      yAxis: o.yAxis?.label ?? chartMessage('yAxis', {}, locale),
      yFrom: m.format(ticks.min),
      yTo: m.format(ticks.max),
      xLabel: (i) => m.xLabels[i] ?? '',
      format: m.format,
    });
  }

  #tableData(): TableData {
    const o = this.#options;
    const m = this.#model;
    const locale = m.config.locale;
    const none = chartMessage('noValue', {}, locale);
    return {
      caption: o.label,
      columns: [o.xAxis?.label ?? chartMessage(m.type === 'category' ? 'category' : 'xAxis', {}, locale), ...o.series.map((s) => s.label)],
      numeric: [m.type !== 'category', ...o.series.map(() => true)],
      rows: o.x.map((_, i) => [m.xLabels[i] ?? '', ...o.series.map((s) => {
        const v = finite(s.values[i]);
        return v === null ? none : m.format(v);
      })]),
    };
  }

  #toggle(id: string): void {
    const visible = this.#hidden.has(id);
    this.setSeriesVisible(id, visible);
    const detail: LineChartSeriesToggleDetail = { id, visible, hidden: this.hiddenSeries };
    emit(this.host, 'aui-series-toggle', detail);
  }

  #render(width: number, height: number): void {
    const o = this.#options;
    const m = this.#model;
    const frame = this.#frame;
    const doc = frame.doc;
    const layer = frame.layer;
    this.#columns = [];
    this.#elements = [];
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const side = rtl ? 'right' : 'left';
    const px = fontSize(frame.svg);
    const xTitle = o.xAxis?.label;
    const yTitle = o.yAxis?.label;

    const top = Math.ceil(px);
    const bottom = height - Math.ceil(px * 2 + 6) - (xTitle ? Math.ceil(px * 1.6) : 0);
    const yCount = o.yAxis?.tickCount ?? Math.max(2, Math.min(10, Math.floor((bottom - top) / 48)));
    const nice = o.yAxis?.min === undefined && o.yAxis?.max === undefined;
    const ticks = linearTicks(m.yMin, m.yMax, yCount, nice);
    const tickFormat = tickFormatter(o, ticks.decimals, m.config.locale);
    const tickLabels = ticks.values.map(tickFormat);
    const axisWidth = Math.ceil(Math.max(...tickLabels.map((t) => textWidth(t, px)), px)) + 10 + (yTitle ? Math.ceil(px * 1.8) : 0);
    const edge = Math.ceil(px);
    const plot: PlotRect = rtl
      ? { left: edge, right: width - axisWidth, top, bottom }
      : { left: axisWidth, right: width - edge, top, bottom };
    this.#plot = plot;
    frame.setPlot(plot);
    const domain: [number, number] = [ticks.min, ticks.max];
    const y = linearScale(domain, [plot.bottom, plot.top]);
    const zero = ticks.min < 0 && ticks.max > 0 ? 0 : null;
    drawValueAxis(doc, layer, { axis: 'y', ticks: ticks.values.filter((t) => t >= ticks.min && t <= ticks.max), map: y.map, plot, side, format: tickFormat, fontPx: px, zero });

    const n = m.xs.length;
    const range: [number, number] = rtl ? [plot.right, plot.left] : [plot.left, plot.right];
    // Zoom window: marks for [lo, hi]; lines also reach one point beyond each edge (clipped).
    const win = this.#zoom.x;
    let lo = 0;
    let hi = n - 1;
    if (win && m.type === 'category') {
      lo = Math.max(0, Math.ceil(win.from - 1e-9));
      hi = Math.min(n - 1, Math.floor(win.to + 1e-9));
    } else if (win) {
      lo = lowerBound(m.xs, win.from);
      const k = lowerBound(m.xs, win.to);
      hi = Math.min(n - 1, m.xs[k] === win.to ? k : k - 1);
    }
    this.#visibleRange = [lo, hi];
    const drawFrom = win ? Math.max(0, lo - 1) : 0;
    const drawTo = win ? Math.min(n - 1, hi + 1) : n - 1;
    let xAt: (i: number) => number;
    let annotationX: (v: number | string) => number | null;
    let spacing: number;
    if (m.type === 'category') {
      const count = Math.max(1, hi - lo + 1);
      const band = bandScale(count, range, 0, 0);
      xAt = (i) => band.center(i - lo);
      annotationX = categoryPosition(m.xLabels, xAt);
      spacing = band.step;
      const dir = rtl ? -1 : 1;
      this.#invertX = (p) => lo + (p - (range[0] + (dir * band.step) / 2)) / (dir * (band.step || 1));
      const shown = m.xLabels.slice(lo, hi + 1);
      drawCategoryLabels(doc, layer, { axis: 'x', labels: shown, positions: shown.map((_, i) => xAt(i + lo)), spacing, plot, side, fontPx: px, maxWidth: 0, width });
    } else {
      const first = win?.from ?? m.xs[0] ?? 0;
      const last = win?.to ?? m.xs[n - 1] ?? first;
      const scale = linearScale([first, last], range);
      annotationX = numericPosition(scale.map);
      this.#invertX = (p) => invert(scale, p);
      xAt = (i) => scale.map(m.xs[i] ?? first);
      const visibleCount = Math.max(1, hi - lo + 1);
      spacing = visibleCount > 1 ? Math.abs(plot.right - plot.left) / (visibleCount - 1) : plot.right - plot.left;
      const labelWidth = textWidth(m.type === 'time' ? 'Sep 30, 2026' : (m.xLabels[n - 1] ?? '0'), px) + px * 2;
      const count = o.xAxis?.tickCount ?? Math.max(2, Math.floor((plot.right - plot.left) / labelWidth));
      let tickValues: readonly number[];
      let format: (v: number) => string;
      if (m.type === 'time') {
        const tt = timeTicks(first, last, count, m.config.timezone);
        const df = new Intl.DateTimeFormat(m.config.locale, { ...TICK_FORMATS[tt.unit], timeZone: m.config.timezone });
        tickValues = tt.values;
        format = (v) => df.format(v);
      } else {
        const lt = linearTicks(first, last, count, false);
        tickValues = lt.values;
        const nf = new Intl.NumberFormat(m.config.locale, { minimumFractionDigits: lt.decimals, maximumFractionDigits: lt.decimals });
        format = (v) => nf.format(v);
      }
      const positions = tickValues.map((v) => scale.map(v));
      const tickSpacing = positions.length > 1 ? Math.abs((positions[1] ?? 0) - (positions[0] ?? 0)) : plot.right - plot.left;
      drawCategoryLabels(doc, layer, { axis: 'x', labels: tickValues.map(format), positions, spacing: tickSpacing, plot, side, fontPx: px, maxWidth: 0, width });
    }
    drawBaseline(doc, layer, 'x', plot, side);
    if (xTitle) drawAxisTitle(doc, layer, 'x', xTitle, plot, width, height, side, px);
    if (yTitle) drawAxisTitle(doc, layer, 'y', yTitle, plot, width, height, side, px);
    drawAnnotations(doc, layer, o.annotations, { x: annotationX, y: numericPosition(y.map), plot, rtl, fontPx: px });

    // Dense data: points are virtual marks (painted on focus), not one DOM node each.
    const dense = m.visible.length * Math.max(0, hi - lo + 1) > DENSE_POINTS;
    const markers = m.config.markers === 'always' || (m.config.markers === 'auto' && spacing >= 12);
    frame.host.classList.toggle('aui-line-chart--markers', markers);
    this.#yMap = y.map;
    const columns: number[] = [];
    for (let i = 0; i < n; i++) columns.push(xAt(i));
    this.#columns = columns;

    const baseline = y.map(Math.min(Math.max(0, ticks.min), ticks.max));
    const template = getMessage('chart', 'point', {}, m.config.locale);
    const marks: FrameMark[] = [];
    const seriesLayer = svgElement(doc, 'g', {}, 'aui-line-chart__series-layer');
    const markerLayer = svgElement(doc, 'g', {}, 'aui-line-chart__marker-layer');
    const radius = markerRadius(frame.host, o.theme, 3.5);
    for (const { series, position, row } of m.visible) {
      const slot = colorSlot(series.color, position);
      const fallbackShape = MARKER_SHAPES[position % MARKER_SHAPES.length] ?? 'circle';
      const styledShape = seriesMarker(series.style, fallbackShape);
      // `marker: "none"`: no visible markers; the focusable point still shows on hover and focus.
      const shape = styledShape ?? fallbackShape;
      const dash = (position % 4) + 1;
      const g = svgElement(doc, 'g', { 'aria-hidden': 'true' }, `aui-line-chart__series aui-chart__series--c${String(slot)}`);
      const points = svgElement(doc, 'g', {}, `aui-line-chart__points aui-chart__series--c${String(slot)}`);
      applySeriesStyle(g, series.style);
      applySeriesStyle(points, series.style);
      const elements: (SVGPathElement | undefined)[] = [];
      this.#elements[row] = elements;
      let line = '';
      let area = '';
      let decorative = '';
      let segment: string[] = [];
      let segmentStart = 0;
      const closeSegment = (end: number): void => {
        if (segment.length === 0) return;
        line += `M${segment.join('L')}`;
        if (o.area) area += `M${fmt(xAt(segmentStart))} ${fmt(baseline)}L${segment.join('L')}L${fmt(xAt(end))} ${fmt(baseline)}Z`;
        segment = [];
      };
      for (let i = drawFrom; i <= drawTo; i++) {
        const v = finite(series.values[i]);
        if (v === null) {
          closeSegment(i - 1);
          continue;
        }
        if (segment.length === 0) segmentStart = i;
        const cx = columns[i] ?? 0;
        const cy = y.map(v);
        segment.push(`${fmt(cx)} ${fmt(cy)}`);
        if (i < lo || i > hi) continue;
        const isolated = finite(series.values[i - 1]) === null && finite(series.values[i + 1]) === null;
        const key = `${series.id}\u0000${String(i)}`;
        if (dense) {
          // Visible markers (and isolated points) are one decorative path per series.
          if (styledShape && (markers || isolated)) decorative += markerPath(shape, cx, cy, radius);
          marks.push({ element: null, row, column: i, key, x: cx, y: cy });
          continue;
        }
        const el = svgElement(doc, 'path', { d: markerPath(shape, cx, cy, radius) }, `${isolated ? 'aui-line-chart__point aui-line-chart__point--isolated' : 'aui-line-chart__point'}${styledShape ? '' : ' aui-line-chart__point--unmarked'}`);
        ChartFrame.markElement(el, fillTemplate(template, { x: m.xLabels[i] ?? '', series: series.label, value: m.format(v) }));
        points.append(el);
        elements[i] = el;
        marks.push({ element: el, row, column: i, key, x: cx, y: cy });
      }
      closeSegment(drawTo);
      if (win) g.setAttribute('clip-path', frame.clip(plot));
      if (o.area && area) {
        const areaPath = svgElement(doc, 'path', { d: area }, 'aui-line-chart__area');
        frame.applyGradient(areaPath, slot, series.style?.color);
        g.append(areaPath);
      }
      if (line) {
        const linePath = svgElement(doc, 'path', { d: line }, `aui-line-chart__line aui-chart__dash--${String(dash)}`);
        applySeriesDash(linePath, series.style);
        g.append(linePath);
      }
      if (decorative) g.append(svgElement(doc, 'path', { d: decorative }, 'aui-line-chart__markers'));
      seriesLayer.append(g);
      markerLayer.append(points);
    }
    layer.append(seriesLayer, markerLayer);
    frame.setMarks(marks);
  }

  #paint(mark: FrameMark, element: SVGPathElement): void {
    const m = this.#model;
    const entry = m.visible.find((v) => v.row === mark.row);
    if (!entry) return;
    const v = finite(entry.series.values[mark.column]) ?? 0;
    const fallback = MARKER_SHAPES[entry.position % MARKER_SHAPES.length] ?? 'circle';
    const shape = seriesMarker(entry.series.style, fallback) ?? fallback;
    element.setAttribute('d', markerPath(shape, mark.x, mark.y, markerRadius(this.host, this.#options.theme, 3.5)));
    element.setAttribute('class', `aui-chart__mark aui-line-chart__point aui-line-chart__cursor aui-chart__series--c${String(colorSlot(entry.series.color, entry.position))}`);
    element.style.removeProperty('--aui-chart-series-color');
    applySeriesStyle(element, entry.series.style?.color === undefined ? undefined : { color: entry.series.style.color });
    element.setAttribute('aria-label', chartMessage('point', { x: m.xLabels[mark.column] ?? '', series: entry.series.label, value: m.format(v) }, m.config.locale));
  }

  #nearestColumn(x: number): number {
    const cols = this.#columns;
    if (cols.length === 0) return -1;
    // Columns are monotonic (ascending in LTR, descending in RTL): binary search.
    const ascending = (cols[cols.length - 1] ?? 0) >= (cols[0] ?? 0);
    let lo = 0;
    let hi = cols.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      const v = cols[mid] ?? 0;
      if (ascending ? v < x : v > x) lo = mid;
      else hi = mid;
    }
    return Math.abs((cols[lo] ?? 0) - x) <= Math.abs((cols[hi] ?? 0) - x) ? lo : hi;
  }

  #hover(x: number, y: number): HoverResult | null {
    const p = this.#plot;
    if (y < p.top - 8 || y > p.bottom + 8 || x < p.left - 8 || x > p.right + 8) return null;
    const nearest = this.#nearestColumn(x);
    if (nearest < 0) return null;
    const [lo, hi] = this.#visibleRange;
    if (hi < lo) return null;
    const column = Math.min(hi, Math.max(lo, nearest));
    const rows: TooltipRow[] = [];
    const highlight: SVGElement[] = [];
    let anchorY = Infinity;
    const m = this.#model;
    for (const { series, position, row } of m.visible) {
      const v = finite(series.values[column]);
      if (v === null) continue;
      rows.push({ slot: colorSlot(series.color, position), shapeSlot: position + 1, swatch: 'line', label: series.label, value: m.format(v), seriesId: series.id, seriesStyle: series.style });
      const element = this.#elements[row]?.[column];
      if (element) highlight.push(element);
      anchorY = Math.min(anchorY, this.#yMap(v));
    }
    if (rows.length === 0) return null;
    return { content: { title: m.xLabels[column] ?? '', rows }, x: this.#columns[column] ?? 0, y: anchorY, highlight, crosshair: { x: this.#columns[column] ?? 0 }, column };
  }

  /** Arrow key past the zoom window edge: pan so the next point of the series is visible. */
  #beyond(mark: FrameMark, step: 1 | -1): string | null {
    const win = this.#zoom.x;
    if (!win) return null;
    const m = this.#model;
    const entry = m.visible.find((v) => v.row === mark.row);
    if (!entry) return null;
    let target = mark.column + step;
    while (target >= 0 && target < m.xs.length && finite(entry.series.values[target]) === null) target += step;
    const x = m.xs[target];
    if (x === undefined) return null;
    this.#zoom.pan(step > 0 ? x - win.to : x - win.from, 0, 'keyboard');
    return `${entry.series.id}\u0000${String(target)}`;
  }

  #tooltip(mark: FrameMark): TooltipContent {
    const m = this.#model;
    const entry = m.visible.find((v) => v.row === mark.row);
    const v = entry ? finite(entry.series.values[mark.column]) : null;
    return {
      title: m.xLabels[mark.column] ?? '',
      rows: entry && v !== null ? [{ slot: colorSlot(entry.series.color, entry.position), shapeSlot: entry.position + 1, swatch: 'line', label: entry.series.label, value: m.format(v), seriesId: entry.series.id, seriesStyle: entry.series.style }] : [],
    };
  }
}
