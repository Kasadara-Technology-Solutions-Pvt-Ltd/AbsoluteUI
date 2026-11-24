/**
 * Scatter Chart (SPEC section 18.18: Scatter Plot, Bubble Chart). Accessible SVG
 * scatter plot of one or more series of (x, y) points on linear axes; a `size`
 * per point makes it a bubble chart (area proportional to size). Keyboard focus
 * moves through the points of a series in x order (Left/Right) and between series
 * (Up/Down); a crosshair, zoom on x or on both axes, a legend that toggles series,
 * a generated summary, and a data table fallback are built in. Series differ by
 * color and marker shape, never by color alone (WCAG 1.4.1). No animation.
 */
import { defineComponentConfig, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { drawAxisTitle, drawBaseline, drawValueAxis, fontSize, type PlotRect } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase, type ChartSeriesToggleDetail } from '../internal/chart/base.js';
import { assertValueAxis, assertZoomRange, drawLinearXAxis, invert, plotRect, plotVertical, valueAxisWidth, valueTicks, type ValueAxisInput } from '../internal/chart/cartesian.js';
import { ChartFrame, type FrameMark, type HoverResult, type LegendItem, type TableData, type TooltipContent } from '../internal/chart/frame.js';
import {
  assertCommon,
  chartBaseSchema,
  chartFail,
  chartPlural,
  colorSlot,
  fillTemplate,
  finite,
  isChartColor,
  listFormat,
  pickDefined,
  tickFormatter,
  valueFormatter,
  type ChartBaseConfig,
  type ChartColor,
  type ChartCommonOptions,
} from '../internal/chart/model.js';
import { linearScale } from '../internal/chart/scale.js';
import { MARKER_SHAPES, markerPath, svgElement } from '../internal/chart/svg.js';
import { ChartZoom, type ChartZoomDetail, type ChartZoomMode, type ChartZoomRange } from '../internal/chart/zoom.js';
import { annotationSentence, applySeriesStyle, assertAnnotations, assertSeriesStyle, axisValueText, drawAnnotations, markerRadius, numericPosition, seriesMarker, type ChartAnnotation, type ChartPointClickDetail, type ChartSeriesStyle } from '../internal/chart/style.js';

export interface ScatterChartConfig extends ChartBaseConfig {
  /** Crosshair lines through the hovered or focused point. Default false. */
  crosshair: boolean;
}

type Resolved = Readonly<ScatterChartConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    scatterChart: ScatterChartConfig & { locale: string; direction: Direction };
  }
}

export const scatterChartConfig = defineComponentConfig<ScatterChartConfig, 'locale' | 'direction'>(
  'scatterChart',
  {
    ...chartBaseSchema,
    crosshair: { default: false, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

export interface ScatterChartPoint {
  x: number;
  y: number;
  /** Bubble size (non-negative); bubble area is proportional to it. */
  size?: number;
  /** Point name (tooltip, accessible label, data table). */
  label?: string;
}

export interface ScatterChartSeries {
  id: string;
  label: string;
  points: readonly ScatterChartPoint[];
  color?: ChartColor;
  /** Per-series look: color, marker shape (`none` keeps the default shape: the points are the data), fill opacity. */
  style?: ChartSeriesStyle;
}

export interface ScatterChartAxis extends ValueAxisInput {
  /** Include zero in the domain. Default false. */
  readonly includeZero?: boolean;
}

export interface ScatterChartOptions extends ChartCommonOptions, Partial<ScatterChartConfig> {
  series: readonly ScatterChartSeries[];
  xAxis?: ScatterChartAxis;
  yAxis?: ScatterChartAxis;
  /** Name of the size dimension (bubble tooltips, labels, table). Default "Size". */
  sizeLabel?: string;
  /** Bubble radius range in CSS px for the smallest and largest size. Default [4, 24]. */
  sizeRange?: readonly [number, number];
  /** Intl.NumberFormat options for x values. Default: `valueFormat`. */
  xFormat?: Intl.NumberFormatOptions;
  /** Zoom and pan: along x, or both axes. Default "none". */
  zoom?: ChartZoomMode;
  /** Visible x range; null shows everything. */
  zoomRange?: ChartZoomRange | null;
  /** Visible y range with `zoom: "xy"`; null shows everything. */
  zoomRangeY?: ChartZoomRange | null;
  /** Reference lines and bands on the x and y value axes (numbers). */
  annotations?: readonly ChartAnnotation[] | undefined;
}

export type ScatterChartSeriesToggleDetail = ChartSeriesToggleDetail;
export type ScatterChartZoomDetail = ChartZoomDetail;
/** Detail of `aui-point-click` (`column` is the point's position in its series, in x order). */
export type ScatterChartPointClickDetail = ChartPointClickDetail;

registerMessages('chart', 'en', {
  roleScatter: 'scatter chart',
  roleBubble: 'bubble chart',
  size: 'Size',
  scatterPoint: '{name}: {xAxis} {x}, {yAxis} {y}',
  bubblePoint: '{name}: {xAxis} {x}, {yAxis} {y}, {sizeAxis} {size}',
  pointName: '{label}, {series}',
  scatterIntro: '{type}, {series}, {points}.',
  scatterSeries: '{series}: {points}, {xAxis} from {xMin} to {xMax}, {yAxis} from {yMin} to {yMax}.',
  seriesLabel: 'Series',
  pointLabel: 'Point',
});

const COMPONENT = 'scatterChart';
const CODE = 'SCATTER_CHART_OPTIONS';
const ZOOM_MODES: readonly ChartZoomMode[] = ['none', 'x', 'xy'];
/** Above this many visible points, points become virtual marks. */
const DENSE_POINTS = 600;

interface Placed {
  readonly series: ScatterChartSeries;
  readonly position: number;
  readonly row: number;
  /** Point indices sorted by x (navigation order). */
  readonly order: readonly number[];
}

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly visible: readonly Placed[];
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly size: readonly [number, number] | null;
  readonly format: (value: number) => string;
  readonly formatX: (value: number) => string;
}

interface Drawn {
  readonly row: number;
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly element: SVGPathElement | null;
}

export class ScatterChart extends FrameChart<ScatterChartOptions, Model> {
  readonly #zoom: ChartZoom;
  #plot: PlotRect = { left: 0, right: 0, top: 0, bottom: 0 };
  #invertX: (px: number) => number = () => 0;
  #invertY: (py: number) => number = () => 0;
  #drawn: Drawn[] = [];
  /** Spatial hash of drawn points for hover (cell size in px). */
  #cells = new Map<string, Drawn[]>();

  /** Render a scatter (or bubble) chart into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: ScatterChartOptions): ScatterChart {
    return new ScatterChart(host, options);
  }

  private constructor(host: HTMLElement, options: ScatterChartOptions) {
    super(host, options, 'aui-scatter-chart');
    this.#zoom = new ChartZoom({
      frame: this.frame,
      locale: () => this.model.config.locale,
      rtl: () => this.model.config.direction === 'rtl',
      extent: () => ({ x: { from: this.model.x[0], to: this.model.x[1] }, y: { from: this.model.y[0], to: this.model.y[1] } }),
      minSpan: () => ({ x: (this.model.x[1] - this.model.x[0]) / 50, y: (this.model.y[1] - this.model.y[0]) / 50 }),
      plot: () => this.#plot,
      invertX: (px) => this.#invertX(px),
      invertY: (py) => this.#invertY(py),
      formatX: (v) => this.model.formatX(v),
      formatY: (v) => this.model.format(v),
      changed: () => {
        this.frame.render();
      },
    });
    this.start((listener) => scatterChartConfig.subscribe(listener));
  }

  /** Visible x range, or null. */
  get zoomRange(): ChartZoomRange | null {
    return this.#zoom.x;
  }

  /** Visible y range (`zoom: "xy"`), or null. */
  get zoomRangeY(): ChartZoomRange | null {
    return this.#zoom.y;
  }

  protected override cleanup(): void {
    this.#zoom.destroy();
    this.host.classList.remove('aui-scatter-chart--bubble');
  }

  protected override mounted(): void {
    this.#syncZoom(this.options);
  }

  protected override optionsChanged(changed: Partial<ScatterChartOptions>): void {
    this.#syncZoom(changed);
  }

  #syncZoom(o: Partial<ScatterChartOptions>): void {
    this.#zoom.setMode(this.options.zoom ?? 'none');
    if (o.zoomRange !== undefined || o.zoomRangeY !== undefined) this.#zoom.setWindow(o.zoomRange ?? this.#zoom.x, o.zoomRangeY ?? this.#zoom.y);
  }

  protected seriesIds(): readonly string[] {
    return this.options.series.map((s) => s.id);
  }

  protected assert(o: ScatterChartOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.series)) chartFail(CODE, COMPONENT, 'series', 'ScatterChartSeries[]');
    const ids = new Set<string>();
    o.series.forEach((s: unknown, i) => {
      const at = `series[${String(i)}]`;
      if (!validators.isRecord(s)) chartFail(CODE, COMPONENT, at, 'ScatterChartSeries');
      if (typeof s.id !== 'string' || s.id === '' || ids.has(s.id)) chartFail(CODE, COMPONENT, `${at}.id`, 'unique non-empty string');
      ids.add(s.id);
      if (typeof s.label !== 'string') chartFail(CODE, COMPONENT, `${at}.label`, 'string');
      if (!isChartColor(s.color)) chartFail(CODE, COMPONENT, `${at}.color`, 'integer 1-8');
      assertSeriesStyle(s.style, at, COMPONENT, CODE);
      if (!Array.isArray(s.points)) chartFail(CODE, COMPONENT, `${at}.points`, 'ScatterChartPoint[]');
      (s.points as unknown[]).forEach((p, j) => {
        const pat = `${at}.points[${String(j)}]`;
        if (!validators.isRecord(p) || typeof p.x !== 'number' || typeof p.y !== 'number') chartFail(CODE, COMPONENT, pat, '{ x: number; y: number }');
        if (p.size !== undefined && !(typeof p.size === 'number' && p.size >= 0)) chartFail(CODE, COMPONENT, `${pat}.size`, 'non-negative number');
        if (p.label !== undefined && typeof p.label !== 'string') chartFail(CODE, COMPONENT, `${pat}.label`, 'string');
      });
    });
    assertValueAxis(o.xAxis, 'xAxis', COMPONENT, CODE);
    assertValueAxis(o.yAxis, 'yAxis', COMPONENT, CODE);
    if (o.sizeLabel !== undefined && typeof o.sizeLabel !== 'string') chartFail(CODE, COMPONENT, 'sizeLabel', 'string');
    const r: unknown = o.sizeRange;
    if (r !== undefined && !(Array.isArray(r) && r.length === 2 && typeof r[0] === 'number' && typeof r[1] === 'number' && r.every((v: number) => Number.isFinite(v) && v >= 1 && v <= 100) && r[0] <= r[1])) chartFail(CODE, COMPONENT, 'sizeRange', '[min, max] radii from 1 to 100 px, min <= max');
    if (o.xFormat !== undefined && !validators.isRecord(o.xFormat)) chartFail(CODE, COMPONENT, 'xFormat', 'Intl.NumberFormatOptions');
    if (o.zoom !== undefined && !ZOOM_MODES.includes(o.zoom)) chartFail(CODE, COMPONENT, 'zoom', '"none" | "x" | "xy"');
    assertZoomRange(o.zoomRange, 'zoomRange', COMPONENT, CODE);
    assertZoomRange(o.zoomRangeY, 'zoomRangeY', COMPONENT, CODE);
    assertAnnotations(o.annotations, COMPONENT, CODE);
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = scatterChartConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'crosshair', 'locale', 'direction']));
    const visible: Placed[] = [];
    let row = 0;
    let [x0, x1, y0, y1, s0, s1] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    let points = 0;
    o.series.forEach((series, position) => {
      if (this.hidden.has(series.id)) return;
      const order: number[] = [];
      series.points.forEach((p, i) => {
        if (finite(p.x) === null || finite(p.y) === null) return;
        order.push(i);
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
        const size = finite(p.size);
        if (size !== null) {
          s0 = Math.min(s0, size);
          s1 = Math.max(s1, size);
        }
      });
      order.sort((a, b) => (series.points[a]?.x ?? 0) - (series.points[b]?.x ?? 0) || (series.points[a]?.y ?? 0) - (series.points[b]?.y ?? 0));
      points += order.length;
      visible.push({ series, position, row: row++, order });
    });
    const has = points > 0;
    if (!has) [x0, x1, y0, y1] = [0, 1, 0, 1];
    if (o.xAxis?.includeZero) [x0, x1] = [Math.min(x0, 0), Math.max(x1, 0)];
    if (o.yAxis?.includeZero) [y0, y1] = [Math.min(y0, 0), Math.max(y1, 0)];
    // Domains follow the nice ticks at a nominal size, so zoom extents match the rendered axes.
    const xt = valueTicks(x0, x1, 400, o.xAxis, 80);
    const yt = valueTicks(y0, y1, 300, o.yAxis);
    const format = valueFormatter(o, config.locale);
    const nf = o.xFormat ? new Intl.NumberFormat(config.locale, o.xFormat) : null;
    const empty = o.series.length === 0 || o.series.every((s) => s.points.length === 0)
      ? this.#noData(config.locale)
      : visible.length === 0 ? getMessage('chart', 'allHidden', {}, config.locale) : has ? null : this.#noData(config.locale);
    return {
      config,
      visible,
      x: [xt.min, xt.max],
      y: [yt.min, yt.max],
      size: s0 <= s1 ? [s0, s1] : null,
      format,
      formatX: nf ? (v) => nf.format(v) : format,
      empty,
    };
  }

  #noData(locale: string): string {
    return getMessage('chart', 'noData', {}, locale);
  }

  #bubble(): boolean {
    return this.options.series.some((s) => s.points.some((p) => p.size !== undefined));
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    const bubble = this.#bubble();
    this.configureFrame(bubble ? 'roleBubble' : 'roleScatter');
    this.host.classList.toggle('aui-scatter-chart--bubble', bubble);
    const frame = this.frame;
    frame.setCrosshair(m.config.crosshair ? 'xy' : 'none');
    const notes = annotationSentence(o.annotations, axisValueText(m.formatX, m.config.locale), axisValueText(m.format, m.config.locale), m.config.locale);
    frame.setText(o.label, o.hideLabel === true, o.description, [o.summary ?? this.#summaryText(bubble), notes].filter(Boolean).join(' '));
    const items: LegendItem[] = o.series.map((s, position) => ({
      id: s.id,
      label: s.label,
      slot: colorSlot(s.color, position),
      shapeSlot: position + 1,
      swatch: 'line',
      visible: !this.hidden.has(s.id),
      seriesStyle: s.style,
    }));
    frame.setLegend(items, m.config.legend === 'show' || (m.config.legend === 'auto' && o.series.length > 1), true);
    frame.setTable(m.config.dataTable, () => this.#tableData(bubble));
    frame.setEmpty(m.empty);
    frame.render();
  }

  #axisName(axis: 'x' | 'y'): string {
    return (axis === 'x' ? this.options.xAxis?.label : this.options.yAxis?.label) ?? this.message(axis === 'x' ? 'xAxis' : 'yAxis');
  }

  #summaryText(bubble: boolean): string {
    const o = this.options;
    const m = this.model;
    const locale = m.config.locale;
    const total = o.series.reduce((sum, s) => sum + s.points.length, 0);
    const parts = [this.message('scatterIntro', { type: this.message(bubble ? 'roleBubble' : 'roleScatter'), series: chartPlural('seriesCount', o.series.length, locale), points: chartPlural('pointCount', total, locale) })];
    for (const s of o.series) {
      const pts = s.points.filter((p) => finite(p.x) !== null && finite(p.y) !== null);
      if (pts.length === 0) {
        parts.push(this.message('seriesEmpty', { series: s.label }));
        continue;
      }
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      parts.push(this.message('scatterSeries', {
        series: s.label,
        points: chartPlural('pointCount', pts.length, locale),
        xAxis: this.#axisName('x'),
        xMin: m.formatX(Math.min(...xs)),
        xMax: m.formatX(Math.max(...xs)),
        yAxis: this.#axisName('y'),
        yMin: m.format(Math.min(...ys)),
        yMax: m.format(Math.max(...ys)),
      }));
    }
    const hidden = o.series.filter((s) => this.hidden.has(s.id)).map((s) => s.label);
    if (hidden.length) parts.push(this.message('hidden', { list: listFormat(hidden, locale) }));
    return parts.join(' ');
  }

  #tableData(bubble: boolean): TableData {
    const o = this.options;
    const m = this.model;
    const sizeName = o.sizeLabel ?? this.message('size');
    const none = this.message('noValue');
    const rows: string[][] = [];
    for (const s of o.series) {
      s.points.forEach((p, i) => {
        const size = finite(p.size);
        rows.push([p.label ?? `${this.message('pointLabel')} ${String(i + 1)}`, s.label, finite(p.x) === null ? none : m.formatX(p.x), finite(p.y) === null ? none : m.format(p.y), ...(bubble ? [size === null ? none : m.format(size)] : [])]);
      });
    }
    return {
      caption: o.label,
      columns: [this.message('pointLabel'), this.message('seriesLabel'), this.#axisName('x'), this.#axisName('y'), ...(bubble ? [sizeName] : [])],
      numeric: [false, false, true, true, ...(bubble ? [true] : [])],
      rows,
    };
  }

  #label(series: ScatterChartSeries, p: ScatterChartPoint): string {
    const m = this.model;
    const name = p.label ? this.message('pointName', { label: p.label, series: series.label }) : series.label;
    const size = finite(p.size);
    return size !== null
      ? this.message('bubblePoint', { name, xAxis: this.#axisName('x'), x: m.formatX(p.x), yAxis: this.#axisName('y'), y: m.format(p.y), sizeAxis: this.options.sizeLabel ?? this.message('size'), size: m.format(size) })
      : this.message('scatterPoint', { name, xAxis: this.#axisName('x'), x: m.formatX(p.x), yAxis: this.#axisName('y'), y: m.format(p.y) });
  }

  protected draw(width: number, height: number): void {
    const o = this.options;
    const m = this.model;
    const frame = this.frame;
    const doc = frame.doc;
    const layer = frame.layer;
    this.#drawn = [];
    this.#cells = new Map();
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const side = rtl ? 'right' : 'left';
    const px = fontSize(frame.svg);
    const xTitle = o.xAxis?.label;
    const yTitle = o.yAxis?.label;
    const vertical = plotVertical(height, px, Boolean(xTitle));
    const zx = this.#zoom.x;
    const zy = this.#zoom.y;
    const yt = valueTicks(zy?.from ?? m.y[0], zy?.to ?? m.y[1], vertical.bottom - vertical.top, zy ? { ...o.yAxis, min: zy.from, max: zy.to } : o.yAxis);
    const yFormat = tickFormatter(o, yt.decimals, m.config.locale);
    const plot = plotRect(width, vertical, px, rtl, valueAxisWidth(yt.values.map(yFormat), px, Boolean(yTitle)));
    this.#plot = plot;
    frame.setPlot(plot);
    const xt = valueTicks(zx?.from ?? m.x[0], zx?.to ?? m.x[1], plot.right - plot.left, zx ? { ...o.xAxis, min: zx.from, max: zx.to } : o.xAxis, 80);
    const xFormat = tickFormatter(o.xFormat ? { valueFormat: o.xFormat } : o, xt.decimals, m.config.locale);
    // Inset the scales by the largest mark radius so points and bubbles never cover the axes.
    const inset = Math.min((plot.right - plot.left) / 4, (plot.bottom - plot.top) / 4, m.size ? (o.sizeRange ?? [4, 24])[1] + 2 : 6);
    const x = linearScale([xt.min, xt.max], rtl ? [plot.right - inset, plot.left + inset] : [plot.left + inset, plot.right - inset]);
    const y = linearScale([yt.min, yt.max], [plot.bottom - inset, plot.top + inset]);
    this.#invertX = (p) => invert(x, p);
    this.#invertY = (p) => invert(y, p);
    const inRange = (t: number, lo: number, hi: number): boolean => t >= lo - 1e-9 && t <= hi + 1e-9;
    drawValueAxis(doc, layer, { axis: 'y', ticks: yt.values.filter((t) => inRange(t, yt.min, yt.max)), map: y.map, plot, side, format: yFormat, fontPx: px, zero: yt.min < 0 && yt.max > 0 ? 0 : null });
    drawLinearXAxis(doc, layer, { ticks: xt.values.filter((t) => inRange(t, xt.min, xt.max)), scale: x, format: xFormat, plot, side, fontPx: px, width, grid: true });
    if (xt.min < 0 && xt.max > 0) layer.append(svgElement(doc, 'line', { x1: x.map(0), x2: x.map(0), y1: plot.top, y2: plot.bottom, 'aria-hidden': 'true' }, 'aui-chart__zero-line'));
    drawBaseline(doc, layer, 'x', plot, side);
    if (xTitle) drawAxisTitle(doc, layer, 'x', xTitle, plot, width, height, side, px);
    if (yTitle) drawAxisTitle(doc, layer, 'y', yTitle, plot, width, height, side, px);
    drawAnnotations(doc, layer, o.annotations, { x: numericPosition(x.map), y: numericPosition(y.map), plot, rtl, fontPx: px });

    const [rMin, rMax] = o.sizeRange ?? [4, 24];
    const pointRadius = markerRadius(frame.host, o.theme, 4);
    const size = m.size;
    // Area ∝ size: radius ∝ √size, from the smallest to the largest bubble.
    const radius = (s: number | null): number => {
      if (s === null || !size) return 4;
      if (size[1] === size[0]) return (rMin + rMax) / 2;
      const t = (Math.sqrt(s) - Math.sqrt(size[0])) / (Math.sqrt(size[1]) - Math.sqrt(size[0]));
      return rMin + t * (rMax - rMin);
    };
    const inside = (p: ScatterChartPoint): boolean => inRange(p.x, xt.min, xt.max) && inRange(p.y, yt.min, yt.max);
    const visibleCount = m.visible.reduce((sum, v) => sum + v.order.filter((i) => { const p = v.series.points[i]; return p !== undefined && inside(p); }).length, 0);
    const dense = visibleCount > DENSE_POINTS;
    const marks: FrameMark[] = [];
    const bubbles = svgElement(doc, 'g', {}, 'aui-scatter-chart__points');
    if (this.#zoom.zoomed) bubbles.setAttribute('clip-path', frame.clip(plot));
    // Largest bubbles first, so small ones stay on top and hoverable.
    for (const placed of m.visible) {
      const { series, position, row } = placed;
      const slot = colorSlot(series.color, position);
      const fallbackShape = MARKER_SHAPES[position % MARKER_SHAPES.length] ?? 'circle';
      const shape = seriesMarker(series.style, fallbackShape) ?? fallbackShape;
      const g = svgElement(doc, 'g', {}, `aui-scatter-chart__series aui-chart__series--c${String(slot)}`);
      applySeriesStyle(g, series.style);
      let decorative = '';
      let column = 0;
      for (const index of placed.order) {
        const p = series.points[index];
        if (!p || !inside(p)) continue;
        const cx = x.map(p.x);
        const cy = y.map(p.y);
        const r = radius(finite(p.size));
        const key = `${series.id}\u0000${String(index)}`;
        const d = size && p.size !== undefined ? markerPath('circle', cx, cy, r) : markerPath(shape, cx, cy, pointRadius);
        let element: SVGPathElement | null = null;
        if (dense) {
          decorative += d;
        } else {
          element = svgElement(doc, 'path', { d }, size && p.size !== undefined ? 'aui-scatter-chart__point aui-scatter-chart__bubble' : 'aui-scatter-chart__point');
          ChartFrame.markElement(element, this.#label(series, p));
          g.append(element);
        }
        marks.push({ element, row, column: column++, key, x: cx, y: cy });
        const drawn: Drawn = { row, index, cx, cy, r: size && p.size !== undefined ? r : 5, element };
        this.#drawn.push(drawn);
        const cell = `${String(Math.floor(cx / 24))},${String(Math.floor(cy / 24))}`;
        const list = this.#cells.get(cell);
        if (list) list.push(drawn);
        else this.#cells.set(cell, [drawn]);
      }
      if (decorative) g.append(svgElement(doc, 'path', { d: decorative, 'aria-hidden': 'true' }, size ? 'aui-scatter-chart__point aui-scatter-chart__bubble' : 'aui-scatter-chart__point'));
      bubbles.append(g);
    }
    layer.append(bubbles);
    frame.setMarks(marks);
  }

  protected override paint(mark: FrameMark, element: SVGPathElement): void {
    const m = this.model;
    const placed = m.visible.find((v) => v.row === mark.row);
    const drawn = this.#drawn.find((d) => d.row === mark.row && `${placed?.series.id ?? ''}\u0000${String(d.index)}` === mark.key);
    const p = drawn ? placed?.series.points[drawn.index] : undefined;
    if (!placed || !drawn || !p) return;
    const fallback = MARKER_SHAPES[placed.position % MARKER_SHAPES.length] ?? 'circle';
    const shape = seriesMarker(placed.series.style, fallback) ?? fallback;
    element.setAttribute('d', m.size && p.size !== undefined ? markerPath('circle', drawn.cx, drawn.cy, drawn.r) : markerPath(shape, drawn.cx, drawn.cy, markerRadius(this.host, this.options.theme, 4)));
    element.setAttribute('class', `aui-chart__mark aui-scatter-chart__point aui-scatter-chart__cursor aui-chart__series--c${String(colorSlot(placed.series.color, placed.position))}`);
    element.style.removeProperty('--aui-chart-series-color');
    applySeriesStyle(element, placed.series.style?.color === undefined ? undefined : { color: placed.series.style.color });
    element.setAttribute('aria-label', this.#label(placed.series, p));
  }

  protected hover(px: number, py: number): HoverResult | null {
    const p = this.#plot;
    if (px < p.left - 8 || px > p.right + 8 || py < p.top - 8 || py > p.bottom + 8) return null;
    let best: Drawn | null = null;
    let bestDistance = Infinity;
    const cx = Math.floor(px / 24);
    const cy = Math.floor(py / 24);
    // Bubbles up to 100 px radius: search the cells within reach.
    const reach = Math.ceil(Math.max(24, ...(this.options.sizeRange ?? [4, 24])) / 24);
    for (let i = cx - reach; i <= cx + reach; i++) {
      for (let j = cy - reach; j <= cy + reach; j++) {
        for (const d of this.#cells.get(`${String(i)},${String(j)}`) ?? []) {
          const distance = Math.hypot(d.cx - px, d.cy - py) - d.r;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = d;
          }
        }
      }
    }
    if (!best || bestDistance > 12) return null;
    const mark = this.frame.marks.find((mk) => mk.row === best.row && mk.x === best.cx && mk.y === best.cy);
    if (!mark) return null;
    return { content: this.tooltip(mark), x: best.cx, y: best.cy - best.r, highlight: best.element ? [best.element] : [], crosshair: { x: best.cx, y: best.cy } };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const m = this.model;
    const placed = m.visible.find((v) => v.row === mark.row);
    const index = Number(mark.key.slice(mark.key.lastIndexOf('\u0000') + 1));
    const p = placed?.series.points[index];
    if (!placed || !p) return { title: '', rows: [] };
    const slot = colorSlot(placed.series.color, placed.position);
    const size = finite(p.size);
    const row = (label: string, value: string): TooltipContent['rows'][number] => ({ slot, shapeSlot: placed.position + 1, swatch: 'none', label, value, seriesId: placed.series.id });
    return {
      title: p.label ? fillTemplate('{label} ({series})', { label: p.label, series: placed.series.label }) : placed.series.label,
      rows: [row(this.#axisName('x'), m.formatX(p.x)), row(this.#axisName('y'), m.format(p.y)), ...(size !== null ? [row(this.options.sizeLabel ?? this.message('size'), m.format(size))] : [])],
    };
  }

  protected override key(event: KeyboardEvent, mark: FrameMark): boolean {
    return this.#zoom.key(event, { x: this.#invertX(mark.x), y: this.#invertY(mark.y) });
  }

  protected override pointDetail(mark: FrameMark): Pick<ChartPointClickDetail, 'seriesId' | 'series' | 'value'> | null {
    const placed = this.model.visible.find((v) => v.row === mark.row);
    const p = placed?.series.points[Number(mark.key.slice(mark.key.lastIndexOf(String.fromCharCode(0)) + 1))];
    return placed && p ? { seriesId: placed.series.id, series: placed.series.label, value: this.#label(placed.series, p) } : null;
  }
}
