/**
 * Bar Chart (SPEC section 18.18: Bar Chart, Column Chart, Stacked Bar, Stacked Column).
 * Accessible SVG bar chart over categories: vertical (columns) or horizontal bars,
 * grouped or stacked series, negative values (stacked positives and negatives
 * diverge from the zero baseline), gaps for missing values, optional value labels,
 * a legend that toggles series, keyboard-reachable bars with tooltips, a generated
 * summary, and a data table fallback. With `patterns` each series also has its own
 * texture, so series never differ by color alone (WCAG 1.4.1). Column charts zoom and
 * pan over categories (`zoom`); horizontal bar charts do not zoom. Animation is opt-in
 * (`theme.animation`).
 */
import { defineComponentConfig, DisposableGroup, emit, getMessage, validators, type Direction } from '@absoluteui/core';
import { drawAxisTitle, drawBaseline, drawCategoryLabels, drawValueAxis, fontSize, textWidth, truncateText, type PlotRect } from '../internal/chart/axis.js';
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
import { assertZoomRange } from '../internal/chart/cartesian.js';
import { bandScale, linearScale, linearTicks } from '../internal/chart/scale.js';
import { annotationSentence, applySeriesStyle, assertAnnotations, categoryPosition, categoryText, drawAnnotations, numericPosition, type ChartAnnotation, type ChartPointClickDetail } from '../internal/chart/style.js';
import { roundedBox, sideRadii, svgElement, valueEnd } from '../internal/chart/svg.js';
import { ChartZoom, type ChartZoomDetail, type ChartZoomRange } from '../internal/chart/zoom.js';

export type BarChartOrientation = 'vertical' | 'horizontal';
export type BarChartLayout = 'grouped' | 'stacked';

export interface BarChartConfig extends ChartBaseConfig {
  /** Print each bar's value next to (grouped) or inside (stacked, when it fits) the bar. Default false. */
  valueLabels: boolean;
}

type Resolved = Readonly<BarChartConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    barChart: BarChartConfig & { locale: string; direction: Direction };
  }
}

export const barChartConfig = defineComponentConfig<BarChartConfig, 'locale' | 'direction'>(
  'barChart',
  {
    ...chartBaseSchema,
    valueLabels: { default: false, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

export interface BarChartCategoryAxis {
  /** Axis title (visible, and used in the summary and data table header). */
  label?: string;
}

export interface BarChartValueAxis {
  label?: string;
  /** Fixed domain minimum. Default: from the data, always including zero. */
  min?: number;
  /** Fixed domain maximum. Default: from the data, always including zero. */
  max?: number;
  /** Approximate number of ticks. Default: from the available size. */
  tickCount?: number;
}

export interface BarChartOptions extends ChartCommonOptions, Partial<BarChartConfig> {
  /** Category labels, one per bar group (text only). */
  categories: readonly string[];
  /** Each series has exactly one value per category. */
  series: readonly ChartSeries[];
  /** `vertical` (default): columns; `horizontal`: bars growing along the inline axis. */
  orientation?: BarChartOrientation;
  /** `grouped` (default): side by side; `stacked`: summed per category. */
  layout?: BarChartLayout;
  categoryAxis?: BarChartCategoryAxis;
  valueAxis?: BarChartValueAxis;
  /**
   * Zoom and pan over categories (vertical columns only; horizontal bar charts ignore it):
   * toolbar buttons, +/- keys, Ctrl/Cmd + wheel, drag to pan, Shift + drag to select. Default false.
   */
  zoom?: boolean;
  /** Visible category index range; null shows everything. */
  zoomRange?: ChartZoomRange | null;
  /** Reference lines and bands: category axis values are labels or indexes; value axis values are numbers. */
  annotations?: readonly ChartAnnotation[] | undefined;
}

/** Detail of `aui-zoom`. */
export type BarChartZoomDetail = ChartZoomDetail;

/** Detail of `aui-point-click`. */
export type BarChartPointClickDetail = ChartPointClickDetail;

/** Detail of `aui-series-toggle` (declared per chart so adapters can name it). */
export interface BarChartSeriesToggleDetail {
  /** Toggled series (or slice) id. */
  id: string;
  visible: boolean;
  /** All hidden ids after the change. */
  hidden: string[];
}

const COMPONENT = 'barChart';
const CODE = 'BAR_CHART_OPTIONS';
const ORIENTATIONS: readonly BarChartOrientation[] = ['vertical', 'horizontal'];
const LAYOUTS: readonly BarChartLayout[] = ['grouped', 'stacked'];

interface Model {
  readonly config: Resolved;
  readonly visible: readonly { readonly series: ChartSeries; readonly position: number; readonly row: number }[];
  readonly min: number;
  readonly max: number;
  readonly format: (value: number) => string;
  readonly empty: string | null;
}

interface BarGeometry {
  readonly element: SVGRectElement | SVGPathElement;
  readonly row: number;
  readonly category: number;
  /** Tooltip anchor. */
  readonly x: number;
  readonly y: number;
}

export class BarChart {
  readonly host: HTMLElement;
  #options: BarChartOptions;
  #hidden: Set<string>;
  #model: Model;
  readonly #frame: ChartFrame;
  readonly #group = new DisposableGroup();
  #bars: BarGeometry[] = [];
  #band: ReturnType<typeof bandScale> | null = null;
  #plot: PlotRect = { left: 0, right: 0, top: 0, bottom: 0 };
  readonly #zoom: ChartZoom;
  /** First visible category (zoom window start). */
  #first = 0;
  #invertX: (px: number) => number = () => 0;

  /** Render a bar chart into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: BarChartOptions): BarChart {
    return new BarChart(host, options);
  }

  private constructor(host: HTMLElement, options: BarChartOptions) {
    BarChart.#assert(options);
    this.host = host;
    this.#options = { ...options };
    this.#hidden = new Set(options.hiddenSeries ?? []);
    this.#model = this.#prepare();
    this.#frame = new ChartFrame(host, 'aui-bar-chart', {
      render: (w, h) => {
        this.#render(w, h);
      },
      hover: (x, y) => this.#hover(x, y),
      tooltip: (mark) => this.#tooltip(mark),
      toggle: (id) => {
        this.#toggle(id);
      },
      key: (event, mark) => this.#zoom.key(event, { x: mark.column }),
      beyond: (mark, step) => this.#beyond(mark, step),
    });
    this.#zoom = new ChartZoom({
      frame: this.#frame,
      locale: () => this.#model.config.locale,
      rtl: () => this.#model.config.direction === 'rtl',
      extent: () => ({ x: { from: 0, to: Math.max(0, this.#options.categories.length - 1) }, y: null }),
      minSpan: () => ({ x: Math.min(1, Math.max(0, this.#options.categories.length - 1)), y: 0 }),
      plot: () => this.#plot,
      invertX: (px) => this.#invertX(px),
      invertY: (py) => py,
      formatX: (v) => this.#options.categories[Math.round(v)] ?? '',
      formatY: (v) => this.#model.format(v),
      changed: () => {
        this.#frame.render();
      },
    });
    this.#frame.mount();
    this.#syncZoom(this.#options);
    this.#apply();
    this.#group.add(barChartConfig.subscribe(() => {
      this.#model = this.#prepare();
      this.#apply();
    }));
  }

  get hiddenSeries(): string[] {
    return this.#options.series.filter((s) => this.#hidden.has(s.id)).map((s) => s.id);
  }

  /** Visible category index range, or null. */
  get zoomRange(): ChartZoomRange | null {
    return this.#zoom.x;
  }

  #syncZoom(o: Partial<BarChartOptions>): void {
    const mode = this.#options.zoom === true && !this.#horizontal() ? 'x' : 'none';
    this.#zoom.setMode(mode);
    if (mode === 'none') return;
    if (o.zoomRange !== undefined) this.#zoom.setWindow(o.zoomRange);
    else if (o.categories !== undefined) this.#zoom.setWindow(this.#zoom.x);
  }

  /** Arrow key past the zoom window edge: pan to the next category with a value in the series. */
  #beyond(mark: FrameMark, step: 1 | -1): string | null {
    const win = this.#zoom.x;
    if (!win) return null;
    const entry = this.#model.visible.find((v) => v.row === mark.row);
    if (!entry) return null;
    const n = this.#options.categories.length;
    let target = mark.column + step;
    while (target >= 0 && target < n && finite(entry.series.values[target]) === null) target += step;
    if (target < 0 || target >= n) return null;
    this.#zoom.pan(step > 0 ? target - win.to : target - win.from, 0, 'keyboard');
    return `${entry.series.id}${String.fromCharCode(0)}${String(target)}`;
  }

  get summary(): string {
    return this.#frame.summary;
  }

  /** The SVG plot (role="group"). */
  get element(): SVGSVGElement {
    return this.#frame.svg;
  }

  update(options: Partial<BarChartOptions>): void {
    const next = { ...this.#options, ...options };
    BarChart.#assert(next);
    const previous = this.#options;
    const previousHidden = this.#hidden;
    if (options.hiddenSeries !== undefined) this.#hidden = new Set(options.hiddenSeries);
    this.#options = next;
    try {
      this.#model = this.#prepare();
    } catch (e) {
      this.#options = previous;
      this.#hidden = previousHidden;
      throw e;
    }
    this.#syncZoom(options);
    this.#apply();
  }

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
    this.host.classList.remove('aui-bar-chart--horizontal', 'aui-bar-chart--stacked');
  }

  static #assert(o: BarChartOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.categories) || o.categories.some((c) => typeof c !== 'string')) chartFail(CODE, COMPONENT, 'categories', 'string[]');
    assertSeries(o.series, COMPONENT, CODE);
    o.series.forEach((s, i) => {
      if (s.values.length !== o.categories.length) chartFail(CODE, COMPONENT, `series[${String(i)}].values`, 'one value per category');
    });
    if (o.orientation !== undefined && !ORIENTATIONS.includes(o.orientation)) chartFail(CODE, COMPONENT, 'orientation', '"vertical" | "horizontal"');
    if (o.layout !== undefined && !LAYOUTS.includes(o.layout)) chartFail(CODE, COMPONENT, 'layout', '"grouped" | "stacked"');
    if (o.categoryAxis?.label !== undefined && typeof o.categoryAxis.label !== 'string') chartFail(CODE, COMPONENT, 'categoryAxis.label', 'string');
    const v = o.valueAxis;
    if (v?.label !== undefined && typeof v.label !== 'string') chartFail(CODE, COMPONENT, 'valueAxis.label', 'string');
    if (v?.min !== undefined && !Number.isFinite(v.min)) chartFail(CODE, COMPONENT, 'valueAxis.min', 'finite number');
    if (v?.max !== undefined && !Number.isFinite(v.max)) chartFail(CODE, COMPONENT, 'valueAxis.max', 'finite number');
    if (v?.min !== undefined && v.max !== undefined && v.max <= v.min) chartFail(CODE, COMPONENT, 'valueAxis.max', 'number greater than valueAxis.min');
    if (v?.tickCount !== undefined && !(Number.isInteger(v.tickCount) && v.tickCount >= 2 && v.tickCount <= 20)) chartFail(CODE, COMPONENT, 'valueAxis.tickCount', 'integer from 2 to 20');
    if (o.zoom !== undefined && typeof o.zoom !== 'boolean') chartFail(CODE, COMPONENT, 'zoom', 'boolean');
    assertZoomRange(o.zoomRange, 'zoomRange', COMPONENT, CODE);
    assertAnnotations(o.annotations, COMPONENT, CODE);
  }

  #config(): Resolved {
    return barChartConfig.resolve(pickDefined(this.#options, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'valueLabels', 'locale', 'direction']));
  }

  #stacked(): boolean {
    return this.#options.layout === 'stacked';
  }

  #horizontal(): boolean {
    return this.#options.orientation === 'horizontal';
  }

  #prepare(): Model {
    const o = this.#options;
    const config = this.#config();
    const n = o.categories.length;
    const visible = o.series
      .map((series, position) => ({ series, position }))
      .filter((s) => !this.#hidden.has(s.series.id))
      .map((s, row) => ({ ...s, row }));
    let min = 0;
    let max = 0;
    let any = false;
    for (let i = 0; i < n; i++) {
      let positive = 0;
      let negative = 0;
      for (const { series } of visible) {
        const v = finite(series.values[i]);
        if (v === null) continue;
        any = true;
        if (this.#stacked()) {
          if (v >= 0) positive += v;
          else negative += v;
        } else {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
      if (this.#stacked()) {
        min = Math.min(min, negative);
        max = Math.max(max, positive);
      }
    }
    if (o.valueAxis?.min !== undefined) min = o.valueAxis.min;
    if (o.valueAxis?.max !== undefined) max = o.valueAxis.max;
    const empty = n === 0 || o.series.length === 0
      ? chartMessage('noData', {}, config.locale)
      : visible.length === 0
        ? chartMessage('allHidden', {}, config.locale)
        : any ? null : chartMessage('noData', {}, config.locale);
    return { config, visible, min, max, format: valueFormatter(o, config.locale), empty };
  }

  #apply(): void {
    const o = this.#options;
    const m = this.#model;
    const { config } = m;
    const frame = this.#frame;
    const horizontal = this.#horizontal();
    frame.configure({
      height: config.height,
      rtl: config.direction === 'rtl',
      locale: config.locale,
      tooltip: config.tooltip,
      patterns: config.patterns,
      navigation: horizontal ? 'columns-vertical' : 'columns-horizontal',
      roleDescription: chartMessage(horizontal ? 'roleBar' : 'roleColumn', {}, config.locale),
      theme: o.theme,
      renderTooltip: o.renderTooltip,
      syncGroup: o.syncGroup,
    });
    this.host.classList.toggle('aui-bar-chart--horizontal', horizontal);
    this.host.classList.toggle('aui-bar-chart--stacked', this.#stacked());
    const notes = annotationSentence(o.annotations, categoryText(o.categories), (v) => (typeof v === 'string' ? v : m.format(v)), config.locale);
    frame.setText(o.label, o.hideLabel === true, o.description, [o.summary ?? this.#summaryText(), notes].filter(Boolean).join(' '));
    const items: LegendItem[] = o.series.map((s, position) => ({
      id: s.id,
      label: s.label,
      slot: colorSlot(s.color, position),
      shapeSlot: position + 1,
      swatch: 'fill',
      visible: !this.#hidden.has(s.id),
      seriesStyle: s.style,
    }));
    frame.setLegend(items, config.legend === 'show' || (config.legend === 'auto' && o.series.length > 1), true);
    frame.setTable(config.dataTable, () => this.#tableData());
    frame.setEmpty(m.empty);
    frame.render();
  }

  #summaryText(): string {
    const o = this.#options;
    const m = this.#model;
    const locale = m.config.locale;
    const fixed = o.valueAxis?.min !== undefined || o.valueAxis?.max !== undefined;
    const ticks = linearTicks(m.min, m.max, 5, !fixed);
    return cartesianSummary({
      type: chartMessage(this.#horizontal() ? 'roleBar' : 'roleColumn', {}, locale),
      locale,
      series: o.series.map((s) => ({ label: s.label, values: s.values, hidden: this.#hidden.has(s.id) })),
      length: o.categories.length,
      lengthKey: 'categoryCount',
      xAxis: o.categoryAxis?.label ?? chartMessage('category', {}, locale),
      xFrom: o.categories[0] ?? '',
      xTo: o.categories[o.categories.length - 1] ?? '',
      yAxis: o.valueAxis?.label ?? chartMessage('yAxis', {}, locale),
      yFrom: m.format(ticks.min),
      yTo: m.format(ticks.max),
      xLabel: (i) => o.categories[i] ?? '',
      format: m.format,
    });
  }

  #tableData(): TableData {
    const o = this.#options;
    const m = this.#model;
    const locale = m.config.locale;
    const none = chartMessage('noValue', {}, locale);
    const stacked = this.#stacked() && o.series.length > 1;
    const columns = [o.categoryAxis?.label ?? chartMessage('category', {}, locale), ...o.series.map((s) => s.label), ...(stacked ? [chartMessage('total', {}, locale)] : [])];
    return {
      caption: o.label,
      columns,
      numeric: columns.map((_, i) => i > 0),
      rows: o.categories.map((category, i) => {
        const cells = o.series.map((s) => {
          const v = finite(s.values[i]);
          return v === null ? none : m.format(v);
        });
        if (stacked) cells.push(m.format(o.series.reduce((sum, s) => sum + (finite(s.values[i]) ?? 0), 0)));
        return [category, ...cells];
      }),
    };
  }

  #toggle(id: string): void {
    const visible = this.#hidden.has(id);
    this.setSeriesVisible(id, visible);
    const detail: BarChartSeriesToggleDetail = { id, visible, hidden: this.hiddenSeries };
    emit(this.host, 'aui-series-toggle', detail);
  }

  #render(width: number, height: number): void {
    const o = this.#options;
    const m = this.#model;
    const frame = this.#frame;
    const doc = frame.doc;
    const layer = frame.layer;
    this.#bars = [];
    this.#band = null;
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const side = rtl ? 'right' : 'left';
    const horizontal = this.#horizontal();
    const stacked = this.#stacked();
    const px = fontSize(frame.svg);
    const categoryTitle = o.categoryAxis?.label;
    const valueTitle = o.valueAxis?.label;
    const n = o.categories.length;
    const fixed = o.valueAxis?.min !== undefined || o.valueAxis?.max !== undefined;
    const edge = Math.ceil(px);
    const titleBelow = horizontal ? valueTitle : categoryTitle;
    const titleBeside = horizontal ? categoryTitle : valueTitle;
    const top = Math.ceil(px);
    const bottom = height - Math.ceil(px * 2 + 6) - (titleBelow ? Math.ceil(px * 1.6) : 0);
    const besideWidth = titleBeside ? Math.ceil(px * 1.8) : 0;

    let plot: PlotRect;
    let ticks;
    let tickFormat: (v: number) => string;
    if (horizontal) {
      const widest = o.categories.reduce((w, c) => Math.max(w, textWidth(c, px)), 0);
      const labelWidth = Math.ceil(Math.min(widest, width * 0.4)) + 12 + besideWidth;
      plot = rtl ? { left: edge * 2, right: width - labelWidth, top, bottom } : { left: labelWidth, right: width - edge * 2, top, bottom };
      const count = o.valueAxis?.tickCount ?? Math.max(2, Math.min(10, Math.floor((plot.right - plot.left) / 72)));
      ticks = linearTicks(m.min, m.max, count, !fixed);
      tickFormat = tickFormatter(o, ticks.decimals, m.config.locale);
    } else {
      const count = o.valueAxis?.tickCount ?? Math.max(2, Math.min(10, Math.floor((bottom - top) / 48)));
      ticks = linearTicks(m.min, m.max, count, !fixed);
      tickFormat = tickFormatter(o, ticks.decimals, m.config.locale);
      const axisWidth = Math.ceil(ticks.values.reduce((w, t) => Math.max(w, textWidth(tickFormat(t), px)), px)) + 10 + besideWidth;
      plot = rtl ? { left: edge, right: width - axisWidth, top, bottom } : { left: axisWidth, right: width - edge, top, bottom };
    }
    this.#plot = plot;
    const valueRange: [number, number] = horizontal ? (rtl ? [plot.right, plot.left] : [plot.left, plot.right]) : [plot.bottom, plot.top];
    const value = linearScale([ticks.min, ticks.max], valueRange);
    const clamp = (v: number): number => Math.min(ticks.max, Math.max(ticks.min, v));
    const zero = ticks.min < 0 && ticks.max > 0 ? 0 : null;
    drawValueAxis(doc, layer, {
      axis: horizontal ? 'x' : 'y',
      ticks: ticks.values.filter((t) => t >= ticks.min && t <= ticks.max),
      map: value.map,
      plot,
      side,
      format: tickFormat,
      fontPx: px,
      zero,
    });

    const categoryRange: [number, number] = horizontal ? [plot.top, plot.bottom] : rtl ? [plot.right, plot.left] : [plot.left, plot.right];
    // Zoom window (columns only): bars for categories [first, last].
    const win = horizontal ? null : this.#zoom.x;
    const first = win ? Math.max(0, Math.ceil(win.from - 1e-9)) : 0;
    const last = win ? Math.min(n - 1, Math.floor(win.to + 1e-9)) : n - 1;
    this.#first = first;
    const band = bandScale(last - first + 1, categoryRange, 0.2, 0.1);
    this.#band = band;
    const dir = rtl ? -1 : 1;
    this.#invertX = (p) => first + (dir * (p - categoryRange[0]) - band.step * 0.1) / (band.step || 1) - 0.4;
    const shown = o.categories.slice(first, last + 1);
    drawCategoryLabels(doc, layer, {
      axis: horizontal ? 'y' : 'x',
      labels: shown,
      positions: shown.map((_, i) => band.center(i)),
      spacing: band.step,
      plot,
      side,
      fontPx: px,
      maxWidth: Math.max(px * 2, (horizontal ? (rtl ? width - plot.right : plot.left) : 0) - 12 - besideWidth),
      width,
    });
    drawBaseline(doc, layer, horizontal ? 'y' : 'x', plot, side);
    if (titleBelow) drawAxisTitle(doc, layer, 'x', titleBelow, plot, width, height, side, px);
    if (titleBeside) drawAxisTitle(doc, layer, 'y', titleBeside, plot, width, height, side, px);
    const categoryAt = categoryPosition(o.categories, (i) => (i < first || i > last ? null : band.center(i - first)));
    const valueAt = numericPosition(value.map);
    drawAnnotations(doc, layer, o.annotations, { x: horizontal ? valueAt : categoryAt, y: horizontal ? categoryAt : valueAt, plot, rtl, fontPx: px });

    const k = m.visible.length;
    const template = getMessage('chart', 'point', {}, m.config.locale);
    const marks: FrameMark[] = [];
    const bars = svgElement(doc, 'g', {}, 'aui-bar-chart__bars');
    const labels = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-bar-chart__labels');
    const baseline = value.map(clamp(0));
    // R20-22: bars round at the value end; in a stack only the outermost segment of each direction.
    const radius = frame.corners.bar ?? 0;
    for (let i = first; i <= last; i++) {
      const start = band.start(i - first);
      const sub = bandScale(k, [start, start + band.bandwidth], stacked ? 0 : 0.1, 0);
      let positive = 0;
      let negative = 0;
      let outerPositive = -1;
      let outerNegative = -1;
      if (stacked && radius > 0) {
        m.visible.forEach(({ series }, j) => {
          const v = finite(series.values[i]);
          if (v !== null && v > 0) outerPositive = j;
          else if (v !== null && v < 0) outerNegative = j;
        });
      }
      for (const [j, { series, position, row }] of m.visible.entries()) {
        const v = finite(series.values[i]);
        if (v === null) continue;
        let from: number;
        let to: number;
        if (stacked) {
          const base = v >= 0 ? positive : negative;
          from = value.map(clamp(base));
          to = value.map(clamp(base + v));
          if (v >= 0) positive += v;
          else negative += v;
        } else {
          from = baseline;
          to = value.map(clamp(v));
        }
        const lo = Math.min(from, to);
        const length = Math.abs(to - from);
        const across = stacked ? start : sub.start(row);
        const thickness = stacked ? band.bandwidth : sub.bandwidth;
        const rect = horizontal
          ? { x: lo, y: across, width: length, height: thickness }
          : { x: across, y: lo, width: thickness, height: length };
        const slot = colorSlot(series.color, position);
        const g = svgElement(doc, 'g', {}, `aui-bar-chart__series aui-chart__series--c${String(slot)}`);
        applySeriesStyle(g, series.style);
        const rounded = radius > 0 && (!stacked || j === (v >= 0 ? outerPositive : outerNegative));
        const corners = sideRadii(rounded ? radius : 0, [valueEnd(from, to, horizontal)]);
        const bar = roundedBox(doc, rect, corners, 'aui-bar-chart__bar');
        frame.applyGradient(bar, slot, series.style?.color, horizontal);
        ChartFrame.markElement(bar, fillTemplate(template, { x: o.categories[i] ?? '', series: series.label, value: m.format(v) }));
        g.append(bar);
        const pattern = frame.pattern(position + 1);
        if (pattern) g.append(roundedBox(doc, rect, corners, 'aui-chart__pattern', { fill: `url(#${pattern})`, 'aria-hidden': 'true' }));
        bars.append(g);
        // Tooltip anchor: the bar's outer end, centered across it.
        const end = to;
        const mid = across + thickness / 2;
        const anchor = horizontal ? { x: end, y: mid } : { x: mid, y: end };
        this.#bars.push({ element: bar, row, category: i, ...anchor });
        marks.push({ element: bar, row, column: i, key: `${series.id}\u0000${String(i)}`, ...anchor });
        if (m.config.valueLabels) this.#valueLabel(labels, m.format(v), rect, v, horizontal, stacked, rtl, px);
      }
    }
    layer.append(bars, labels);
    frame.setMarks(marks);
  }

  #valueLabel(group: SVGGElement, text: string, rect: { x: number; y: number; width: number; height: number }, v: number, horizontal: boolean, stacked: boolean, rtl: boolean, px: number): void {
    const doc = this.#frame.doc;
    const w = textWidth(text, px);
    let x: number;
    let y: number;
    let anchor = 'middle';
    if (stacked) {
      // Inside the segment, only when it fits.
      if ((horizontal ? rect.width : rect.height) < (horizontal ? w + 6 : px + 4) || (horizontal ? rect.height : rect.width) < (horizontal ? px + 2 : w + 4)) return;
      x = rect.x + rect.width / 2;
      y = rect.y + rect.height / 2;
    } else if (horizontal) {
      const towardEnd = (v >= 0) !== rtl;
      x = towardEnd ? rect.x + rect.width + 4 : rect.x - 4;
      y = rect.y + rect.height / 2;
      anchor = towardEnd ? 'start' : 'end';
    } else {
      x = rect.x + rect.width / 2;
      y = v >= 0 ? rect.y - px * 0.7 : rect.y + rect.height + px * 0.7;
      if (rect.width < w * 0.6) return;
    }
    const label = svgElement(doc, 'text', { x, y, 'text-anchor': anchor, 'dominant-baseline': 'middle' }, 'aui-chart__value-label');
    label.textContent = truncateText(text, Math.max(w, 1), px);
    group.append(label);
  }

  #hover(x: number, y: number): HoverResult | null {
    const band = this.#band;
    const p = this.#plot;
    if (!band || x < p.left - 4 || x > p.right + 4 || y < p.top - 4 || y > p.bottom + 4) return null;
    const horizontal = this.#horizontal();
    const local = band.indexAt(horizontal ? y : x);
    if (local < 0) return null;
    const category = local + this.#first;
    const m = this.#model;
    const o = this.#options;
    const rows: TooltipRow[] = [];
    const highlight: SVGElement[] = [];
    let total = 0;
    const bars = this.#bars.filter((b) => b.category === category);
    for (const { series, position, row } of m.visible) {
      const v = finite(series.values[category]);
      const bar = bars.find((b) => b.row === row);
      if (v === null || !bar) continue;
      total += v;
      rows.push({ slot: colorSlot(series.color, position), shapeSlot: position + 1, swatch: 'fill', label: series.label, value: m.format(v), seriesId: series.id, seriesStyle: series.style });
      highlight.push(bar.element);
    }
    if (rows.length === 0) return null;
    if (this.#stacked() && rows.length > 1) rows.push({ slot: 0, shapeSlot: 0, swatch: 'none', label: chartMessage('total', {}, m.config.locale), value: m.format(total) });
    const rtl = m.config.direction === 'rtl';
    const extreme = horizontal
      ? bars.reduce((best, b) => (rtl ? Math.min(best, b.x) : Math.max(best, b.x)), rtl ? Infinity : -Infinity)
      : bars.reduce((best, b) => Math.min(best, b.y), Infinity);
    return {
      content: { title: o.categories[category] ?? '', rows },
      x: horizontal ? extreme : band.center(local),
      y: horizontal ? band.center(local) : extreme,
      highlight,
      column: category,
    };
  }

  #tooltip(mark: FrameMark): TooltipContent {
    const m = this.#model;
    const entry = m.visible.find((v) => v.row === mark.row);
    const v = entry ? finite(entry.series.values[mark.column]) : null;
    return {
      title: this.#options.categories[mark.column] ?? '',
      rows: entry && v !== null ? [{ slot: colorSlot(entry.series.color, entry.position), shapeSlot: entry.position + 1, swatch: 'fill', label: entry.series.label, value: m.format(v), seriesId: entry.series.id, seriesStyle: entry.series.style }] : [],
    };
  }
}
