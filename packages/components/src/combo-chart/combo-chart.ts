/**
 * Combo Chart (SPEC section 18.18: Combo Chart). Bars, lines, and areas over shared
 * categories, each series on the primary (start-side) or secondary (end-side)
 * value axis. Bars are grouped (or stacked) inside each category band; lines and
 * areas pass through the band centers. Keyboard focus moves along a series
 * (Left/Right) and between series (Up/Down); hovering a category lists every
 * series. Crosshair, zoom and pan over categories, a legend that toggles series,
 * a generated summary, and a data table fallback are built in. No animation.
 */
import { defineComponentConfig, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { drawAxisTitle, drawBaseline, drawCategoryLabels, drawValueAxis, fontSize, type PlotRect } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase, type ChartSeriesToggleDetail } from '../internal/chart/base.js';
import { assertValueAxis, assertZoomRange, plotRect, plotVertical, valueAxisWidth, valueTicks, type ValueAxisInput } from '../internal/chart/cartesian.js';
import { ChartFrame, type FrameMark, type HoverResult, type LegendItem, type TableData, type TooltipContent, type TooltipRow } from '../internal/chart/frame.js';
import {
  assertCommon,
  assertSeries,
  chartBaseSchema,
  chartFail,
  chartPlural,
  colorSlot,
  fillTemplate,
  finite,
  listFormat,
  pickDefined,
  seriesSentence,
  tickFormatter,
  valueFormatter,
  type ChartBaseConfig,
  type ChartCommonOptions,
  type ChartSeries,
} from '../internal/chart/model.js';
import { bandScale, linearScale, type LinearScale } from '../internal/chart/scale.js';
import { annotationSentence, applySeriesDash, applySeriesStyle, assertAnnotations, categoryPosition, categoryText, drawAnnotations, markerRadius, numericPosition, seriesMarker, type ChartAnnotation, type ChartPointClickDetail } from '../internal/chart/style.js';
import { fmt, MARKER_SHAPES, markerPath, roundedBox, sideRadii, svgElement, valueEnd } from '../internal/chart/svg.js';
import { ChartZoom, type ChartZoomDetail, type ChartZoomRange } from '../internal/chart/zoom.js';

export type ComboChartSeriesType = 'bar' | 'line' | 'area';
export type ComboChartAxisSide = 'primary' | 'secondary';

export interface ComboChartConfig extends ChartBaseConfig {
  /** Vertical crosshair line on the hovered or focused category. Default false. */
  crosshair: boolean;
}

type Resolved = Readonly<ComboChartConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    comboChart: ComboChartConfig & { locale: string; direction: Direction };
  }
}

export const comboChartConfig = defineComponentConfig<ComboChartConfig, 'locale' | 'direction'>(
  'comboChart',
  {
    ...chartBaseSchema,
    crosshair: { default: false, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

export interface ComboChartSeries extends ChartSeries {
  /** How the series is drawn. */
  type: ComboChartSeriesType;
  /** Value axis. Default "primary". */
  axis?: ComboChartAxisSide;
}

export interface ComboChartValueAxis extends ValueAxisInput {
  /** Intl.NumberFormat options for this axis (ticks, tooltips, labels). Default: `valueFormat`. */
  format?: Intl.NumberFormatOptions;
}

export interface ComboChartOptions extends ChartCommonOptions, Partial<ComboChartConfig> {
  categories: readonly string[];
  /** Each series has exactly one value per category. */
  series: readonly ComboChartSeries[];
  /** Stack the bar series (lines and areas are never stacked). Default false. */
  stacked?: boolean;
  categoryAxis?: { label?: string };
  primaryAxis?: ComboChartValueAxis;
  secondaryAxis?: ComboChartValueAxis;
  /** Zoom and pan over categories. Default false. */
  zoom?: boolean;
  /** Visible category index range; null shows everything. */
  zoomRange?: ChartZoomRange | null;
  /** Reference lines and bands: x values are category labels or indexes; y values are primary-axis numbers. */
  annotations?: readonly ChartAnnotation[] | undefined;
}

export type ComboChartSeriesToggleDetail = ChartSeriesToggleDetail;
export type ComboChartZoomDetail = ChartZoomDetail;
/** Detail of `aui-point-click`. */
export type ComboChartPointClickDetail = ChartPointClickDetail;

registerMessages('chart', 'en', {
  roleCombo: 'combo chart',
  primaryAxis: 'Primary axis',
  secondaryAxis: 'Secondary axis',
});

const COMPONENT = 'comboChart';
const CODE = 'COMBO_CHART_OPTIONS';
const TYPES: readonly ComboChartSeriesType[] = ['bar', 'line', 'area'];
const SIDES: readonly ComboChartAxisSide[] = ['primary', 'secondary'];

interface Visible {
  readonly series: ComboChartSeries;
  readonly position: number;
  readonly row: number;
  readonly secondary: boolean;
  /** Index among visible bar series (grouping), or -1. */
  readonly barIndex: number;
}

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly visible: readonly Visible[];
  readonly bars: number;
  readonly hasSecondary: boolean;
  readonly primary: readonly [number, number];
  readonly secondary: readonly [number, number];
  readonly format: (value: number) => string;
  readonly formatSecondary: (value: number) => string;
}

export class ComboChart extends FrameChart<ComboChartOptions, Model> {
  readonly #zoom: ChartZoom;
  #plot: PlotRect = { left: 0, right: 0, top: 0, bottom: 0 };
  #centers: number[] = [];
  #range: readonly [number, number] = [0, -1];
  #invertX: (px: number) => number = () => 0;
  #elements = new Map<number, SVGElement[]>();
  #scales: { primary: LinearScale; secondary: LinearScale } | null = null;

  /** Render a combo chart into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: ComboChartOptions): ComboChart {
    return new ComboChart(host, options);
  }

  private constructor(host: HTMLElement, options: ComboChartOptions) {
    super(host, options, 'aui-combo-chart');
    this.#zoom = new ChartZoom({
      frame: this.frame,
      locale: () => this.model.config.locale,
      rtl: () => this.model.config.direction === 'rtl',
      extent: () => ({ x: { from: 0, to: Math.max(0, this.options.categories.length - 1) }, y: null }),
      minSpan: () => ({ x: Math.min(1, Math.max(0, this.options.categories.length - 1)), y: 0 }),
      plot: () => this.#plot,
      invertX: (px) => this.#invertX(px),
      invertY: (py) => py,
      formatX: (v) => this.options.categories[Math.round(v)] ?? '',
      formatY: (v) => this.model.format(v),
      changed: () => {
        this.frame.render();
      },
    });
    this.start((listener) => comboChartConfig.subscribe(listener));
  }

  /** Visible category index range, or null. */
  get zoomRange(): ChartZoomRange | null {
    return this.#zoom.x;
  }

  protected override mounted(): void {
    this.#syncZoom(this.options);
  }

  protected override optionsChanged(changed: Partial<ComboChartOptions>): void {
    this.#syncZoom(changed);
  }

  #syncZoom(o: Partial<ComboChartOptions>): void {
    this.#zoom.setMode(this.options.zoom === true ? 'x' : 'none');
    if (o.zoomRange !== undefined) this.#zoom.setWindow(o.zoomRange);
    else if (o.categories !== undefined) this.#zoom.setWindow(this.#zoom.x);
  }

  protected override cleanup(): void {
    this.#zoom.destroy();
  }

  protected seriesIds(): readonly string[] {
    return this.options.series.map((s) => s.id);
  }

  protected assert(o: ComboChartOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.categories) || o.categories.some((c) => typeof c !== 'string')) chartFail(CODE, COMPONENT, 'categories', 'string[]');
    assertSeries(o.series, COMPONENT, CODE);
    o.series.forEach((s, i) => {
      const at = `series[${String(i)}]`;
      if (!TYPES.includes(s.type)) chartFail(CODE, COMPONENT, `${at}.type`, '"bar" | "line" | "area"');
      if (s.axis !== undefined && !SIDES.includes(s.axis)) chartFail(CODE, COMPONENT, `${at}.axis`, '"primary" | "secondary"');
      if (s.values.length !== o.categories.length) chartFail(CODE, COMPONENT, `${at}.values`, 'one value per category');
    });
    if (o.stacked !== undefined && typeof o.stacked !== 'boolean') chartFail(CODE, COMPONENT, 'stacked', 'boolean');
    if (o.categoryAxis !== undefined && !(validators.isRecord(o.categoryAxis) && (o.categoryAxis.label === undefined || typeof o.categoryAxis.label === 'string'))) chartFail(CODE, COMPONENT, 'categoryAxis', '{ label?: string }');
    for (const key of ['primaryAxis', 'secondaryAxis'] as const) {
      assertValueAxis(o[key], key, COMPONENT, CODE);
      const format: unknown = o[key]?.format;
      if (format !== undefined && !validators.isRecord(format)) chartFail(CODE, COMPONENT, `${key}.format`, 'Intl.NumberFormatOptions');
    }
    if (o.zoom !== undefined && typeof o.zoom !== 'boolean') chartFail(CODE, COMPONENT, 'zoom', 'boolean');
    assertZoomRange(o.zoomRange, 'zoomRange', COMPONENT, CODE);
    assertAnnotations(o.annotations, COMPONENT, CODE);
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = comboChartConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'crosshair', 'locale', 'direction']));
    const visible: Visible[] = [];
    let bars = 0;
    o.series.forEach((series, position) => {
      if (this.hidden.has(series.id)) return;
      visible.push({ series, position, row: visible.length, secondary: series.axis === 'secondary', barIndex: series.type === 'bar' ? bars++ : -1 });
    });
    const n = o.categories.length;
    const extent = (secondary: boolean): [number, number] | null => {
      let lo = Infinity;
      let hi = -Infinity;
      const group = visible.filter((v) => v.secondary === secondary);
      for (let i = 0; i < n; i++) {
        let positive = 0;
        let negative = 0;
        for (const v of group) {
          const value = finite(v.series.values[i]);
          if (value === null) continue;
          if (v.series.type === 'bar' && o.stacked) {
            if (value >= 0) positive += value;
            else negative += value;
            lo = Math.min(lo, negative);
            hi = Math.max(hi, positive);
          } else {
            lo = Math.min(lo, value);
            hi = Math.max(hi, value);
          }
        }
      }
      if (lo > hi) return null;
      // Bars and areas grow from zero.
      const axis = secondary ? o.secondaryAxis : o.primaryAxis;
      if (group.some((v) => v.series.type !== 'line') || axis?.includeZero) return [Math.min(lo, 0), Math.max(hi, 0)];
      return [lo, hi];
    };
    const primary = extent(false);
    const secondary = extent(true);
    const format = valueFormatter(o.primaryAxis?.format ? { valueFormat: o.primaryAxis.format } : o, config.locale);
    const formatSecondary = o.formatValue ? format : valueFormatter(o.secondaryAxis?.format ? { valueFormat: o.secondaryAxis.format } : o, config.locale);
    const locale = config.locale;
    const empty = n === 0 || o.series.length === 0
      ? getMessage('chart', 'noData', {}, locale)
      : visible.length === 0 ? getMessage('chart', 'allHidden', {}, locale) : primary || secondary ? null : getMessage('chart', 'noData', {}, locale);
    return {
      config,
      visible,
      bars,
      hasSecondary: visible.some((v) => v.secondary),
      primary: primary ?? secondary ?? [0, 1],
      secondary: secondary ?? [0, 1],
      format,
      formatSecondary,
      empty,
    };
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    this.configureFrame('roleCombo');
    const frame = this.frame;
    frame.setCrosshair(m.config.crosshair ? 'x' : 'none');
    const notes = annotationSentence(o.annotations, categoryText(o.categories), (v) => (typeof v === 'string' ? v : m.format(v)), m.config.locale);
    frame.setText(o.label, o.hideLabel === true, o.description, [o.summary ?? this.#summaryText(), notes].filter(Boolean).join(' '));
    const items: LegendItem[] = o.series.map((s, position) => ({
      id: s.id,
      label: s.label,
      slot: colorSlot(s.color, position),
      shapeSlot: position + 1,
      swatch: s.type === 'bar' ? 'fill' : 'line',
      visible: !this.hidden.has(s.id),
      seriesStyle: s.style,
    }));
    frame.setLegend(items, m.config.legend !== 'hide', true);
    frame.setTable(m.config.dataTable, () => this.#tableData());
    frame.setEmpty(m.empty);
    frame.render();
  }

  #formatFor(v: Visible | ComboChartSeries): (value: number) => string {
    const secondary = 'secondary' in v ? v.secondary : v.axis === 'secondary';
    return secondary ? this.model.formatSecondary : this.model.format;
  }

  #summaryText(): string {
    const o = this.options;
    const m = this.model;
    const locale = m.config.locale;
    const n = o.categories.length;
    const parts = [this.message('intro', { type: this.message('roleCombo'), series: chartPlural('seriesCount', o.series.length, locale), points: chartPlural('categoryCount', n, locale) })];
    if (n > 0) {
      parts.push(this.message('range', { axis: o.categoryAxis?.label ?? this.message('category'), from: o.categories[0] ?? '', to: o.categories[n - 1] ?? '' }));
      const p = valueTicks(m.primary[0], m.primary[1], 300, o.primaryAxis);
      parts.push(this.message('range', { axis: o.primaryAxis?.label ?? this.message('primaryAxis'), from: m.format(p.min), to: m.format(p.max) }));
      if (o.series.some((s) => s.axis === 'secondary')) {
        const s = valueTicks(m.secondary[0], m.secondary[1], 300, o.secondaryAxis);
        parts.push(this.message('range', { axis: o.secondaryAxis?.label ?? this.message('secondaryAxis'), from: m.formatSecondary(s.min), to: m.formatSecondary(s.max) }));
      }
    }
    let missing = 0;
    for (const s of o.series) {
      const sentence = seriesSentence(s.label, s.values, n, (i) => o.categories[i] ?? '', this.#formatFor(s), locale);
      parts.push(sentence.text);
      missing += sentence.missing;
    }
    if (missing > 0 && n > 0) parts.push(this.message('missing', { missing: chartPlural('missingCount', missing, locale) }));
    const hidden = o.series.filter((s) => this.hidden.has(s.id)).map((s) => s.label);
    if (hidden.length) parts.push(this.message('hidden', { list: listFormat(hidden, locale) }));
    return parts.join(' ');
  }

  #tableData(): TableData {
    const o = this.options;
    const none = this.message('noValue');
    return {
      caption: o.label,
      columns: [o.categoryAxis?.label ?? this.message('category'), ...o.series.map((s) => s.label)],
      numeric: [false, ...o.series.map(() => true)],
      rows: o.categories.map((c, i) => [c, ...o.series.map((s) => {
        const v = finite(s.values[i]);
        return v === null ? none : this.#formatFor(s)(v);
      })]),
    };
  }

  protected draw(width: number, height: number): void {
    const o = this.options;
    const m = this.model;
    const frame = this.frame;
    const doc = frame.doc;
    const layer = frame.layer;
    this.#centers = [];
    this.#elements = new Map();
    this.#scales = null;
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const side = rtl ? 'right' : 'left';
    const endSide = rtl ? 'left' : 'right';
    const px = fontSize(frame.svg);
    const xTitle = o.categoryAxis?.label;
    const pTitle = o.primaryAxis?.label;
    const sTitle = m.hasSecondary ? o.secondaryAxis?.label : undefined;
    const vertical = plotVertical(height, px, Boolean(xTitle));
    const pt = valueTicks(m.primary[0], m.primary[1], vertical.bottom - vertical.top, o.primaryAxis);
    const pFormat = tickFormatter(o.primaryAxis?.format ? { valueFormat: o.primaryAxis.format } : o, pt.decimals, m.config.locale);
    const st = valueTicks(m.secondary[0], m.secondary[1], vertical.bottom - vertical.top, { ...o.secondaryAxis, tickCount: o.secondaryAxis?.tickCount ?? Math.max(2, pt.values.length - 1) });
    const sFormat = tickFormatter(o.secondaryAxis?.format ? { valueFormat: o.secondaryAxis.format } : o, st.decimals, m.config.locale);
    const plot = plotRect(width, vertical, px, rtl, valueAxisWidth(pt.values.map(pFormat), px, Boolean(pTitle)), m.hasSecondary ? valueAxisWidth(st.values.map(sFormat), px, Boolean(sTitle)) : 0);
    this.#plot = plot;
    frame.setPlot(plot);
    const primary = linearScale([pt.min, pt.max], [plot.bottom, plot.top]);
    const secondary = linearScale([st.min, st.max], [plot.bottom, plot.top]);
    this.#scales = { primary, secondary };
    const within = (t: number, lo: number, hi: number): boolean => t >= lo - 1e-9 && t <= hi + 1e-9;
    drawValueAxis(doc, layer, { axis: 'y', ticks: pt.values.filter((t) => within(t, pt.min, pt.max)), map: primary.map, plot, side, format: pFormat, fontPx: px, zero: pt.min < 0 && pt.max > 0 ? 0 : null });
    if (m.hasSecondary) {
      // Secondary tick labels only; its gridlines would not align with the primary ones.
      const labels = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-chart__axis aui-chart__axis--value aui-chart__axis--secondary');
      for (const t of st.values.filter((v) => within(v, st.min, st.max))) {
        const label = svgElement(doc, 'text', { x: endSide === 'right' ? plot.right + 6 : plot.left - 6, y: secondary.map(t), 'text-anchor': endSide === 'right' ? 'start' : 'end', 'dominant-baseline': 'middle' }, 'aui-chart__tick-label');
        label.textContent = sFormat(t);
        labels.append(label);
      }
      layer.append(labels);
      drawBaseline(doc, layer, 'y', plot, endSide);
      if (sTitle) drawAxisTitle(doc, layer, 'y', sTitle, plot, width, height, endSide, px);
    }

    const n = o.categories.length;
    const win = this.#zoom.x;
    const lo = win ? Math.max(0, Math.ceil(win.from - 1e-9)) : 0;
    const hi = win ? Math.min(n - 1, Math.floor(win.to + 1e-9)) : n - 1;
    this.#range = [lo, hi];
    const range: [number, number] = rtl ? [plot.right, plot.left] : [plot.left, plot.right];
    const band = bandScale(hi - lo + 1, range, 0.2, 0.1);
    const dir = rtl ? -1 : 1;
    this.#invertX = (p) => lo + (dir * (p - range[0]) - band.step * 0.1) / (band.step || 1) - 0.4;
    const shown = o.categories.slice(lo, hi + 1);
    for (let i = 0; i < n; i++) this.#centers.push(band.center(i - lo));
    drawCategoryLabels(doc, layer, { axis: 'x', labels: shown, positions: shown.map((_, i) => band.center(i)), spacing: band.step, plot, side, fontPx: px, maxWidth: 0, width });
    drawBaseline(doc, layer, 'x', plot, side);
    if (xTitle) drawAxisTitle(doc, layer, 'x', xTitle, plot, width, height, side, px);
    if (pTitle) drawAxisTitle(doc, layer, 'y', pTitle, plot, width, height, side, px);
    drawAnnotations(doc, layer, o.annotations, { x: categoryPosition(o.categories, (i) => (i < lo || i > hi ? null : band.center(i - lo))), y: numericPosition(primary.map), plot, rtl, fontPx: px });

    const template = getMessage('chart', 'point', {}, m.config.locale);
    const marks: FrameMark[] = [];
    const barLayer = svgElement(doc, 'g', {}, 'aui-combo-chart__bars');
    const lineLayer = svgElement(doc, 'g', {}, 'aui-combo-chart__lines');
    const pointLayer = svgElement(doc, 'g', {}, 'aui-combo-chart__points');
    const clampTo = (scale: LinearScale, v: number): number => {
      const [a, b] = scale.domain;
      return scale.map(Math.min(Math.max(a, b), Math.max(Math.min(a, b), v)));
    };
    const stacks = new Map<string, number>();
    const radius = markerRadius(frame.host, o.theme, 3.5);
    const track = (i: number, el: SVGElement): void => {
      const list = this.#elements.get(i);
      if (list) list.push(el);
      else this.#elements.set(i, [el]);
    };
    // Bars first (under lines), in series order.
    // R20-22: bars round at the value end; in a stack only the outermost segment of each direction.
    const barRadius = frame.corners.bar ?? 0;
    const outer = new Map<string, string>();
    if (o.stacked && barRadius > 0) {
      for (const v of m.visible) {
        if (v.series.type !== 'bar') continue;
        for (let i = lo; i <= hi; i++) {
          const value = finite(v.series.values[i]);
          if (value !== null && value !== 0) outer.set(`${v.secondary ? 's' : 'p'}${value > 0 ? '+' : '-'}${String(i)}`, v.series.id);
        }
      }
    }
    for (const v of m.visible) {
      if (v.series.type !== 'bar') continue;
      const scale = v.secondary ? secondary : primary;
      const slot = colorSlot(v.series.color, v.position);
      const g = svgElement(doc, 'g', {}, `aui-combo-chart__series aui-chart__series--c${String(slot)}`);
      applySeriesStyle(g, v.series.style);
      const pattern = frame.pattern(v.position + 1);
      for (let i = lo; i <= hi; i++) {
        const value = finite(v.series.values[i]);
        if (value === null) continue;
        const start = band.start(i - lo);
        let from: number;
        let to: number;
        let x: number;
        let w: number;
        let rounded = barRadius > 0;
        if (o.stacked) {
          const key = `${v.secondary ? 's' : 'p'}${value >= 0 ? '+' : '-'}${String(i)}`;
          const base = stacks.get(key) ?? 0;
          stacks.set(key, base + value);
          rounded &&= outer.get(`${v.secondary ? 's' : 'p'}${value > 0 ? '+' : '-'}${String(i)}`) === v.series.id;
          from = clampTo(scale, base);
          to = clampTo(scale, base + value);
          x = start;
          w = band.bandwidth;
        } else {
          const sub = bandScale(m.bars, [start, start + band.bandwidth], 0.1, 0);
          from = clampTo(scale, 0);
          to = clampTo(scale, value);
          x = sub.start(rtl ? m.bars - 1 - v.barIndex : v.barIndex);
          w = sub.bandwidth;
        }
        const rect = { x, y: Math.min(from, to), width: w, height: Math.abs(to - from) };
        const corners = sideRadii(rounded ? barRadius : 0, [valueEnd(from, to, false)]);
        const bar = roundedBox(doc, rect, corners, 'aui-chart__bar');
        frame.applyGradient(bar, slot, v.series.style?.color);
        ChartFrame.markElement(bar, fillTemplate(template, { x: o.categories[i] ?? '', series: v.series.label, value: this.#formatFor(v)(value) }));
        g.append(bar);
        if (pattern) g.append(roundedBox(doc, rect, corners, 'aui-chart__pattern', { fill: `url(#${pattern})`, 'aria-hidden': 'true' }));
        track(i, bar);
        marks.push({ element: bar, row: v.row, column: i, key: `${v.series.id}\u0000${String(i)}`, x: x + w / 2, y: Math.min(from, to) });
      }
      barLayer.append(g);
    }
    for (const v of m.visible) {
      if (v.series.type === 'bar') continue;
      const scale = v.secondary ? secondary : primary;
      const slot = colorSlot(v.series.color, v.position);
      const fallbackShape = MARKER_SHAPES[v.position % MARKER_SHAPES.length] ?? 'circle';
      const styledShape = seriesMarker(v.series.style, fallbackShape);
      const shape = styledShape ?? fallbackShape;
      const g = svgElement(doc, 'g', { 'aria-hidden': 'true' }, `aui-combo-chart__series aui-chart__series--c${String(slot)}`);
      const points = svgElement(doc, 'g', {}, `aui-combo-chart__series aui-chart__series--c${String(slot)}`);
      applySeriesStyle(g, v.series.style);
      applySeriesStyle(points, v.series.style);
      const baseline = clampTo(scale, 0);
      let line = '';
      let area = '';
      let segment: string[] = [];
      let segmentStart = lo;
      const close = (end: number): void => {
        if (segment.length === 0) return;
        line += `M${segment.join('L')}`;
        if (v.series.type === 'area') area += `M${fmt(band.center(segmentStart - lo))} ${fmt(baseline)}L${segment.join('L')}L${fmt(band.center(end - lo))} ${fmt(baseline)}Z`;
        segment = [];
      };
      for (let i = lo; i <= hi; i++) {
        const value = finite(v.series.values[i]);
        if (value === null) {
          close(i - 1);
          continue;
        }
        if (segment.length === 0) segmentStart = i;
        const cx = band.center(i - lo);
        const cy = clampTo(scale, value);
        segment.push(`${fmt(cx)} ${fmt(cy)}`);
        const point = svgElement(doc, 'path', { d: markerPath(shape, cx, cy, radius) }, styledShape ? 'aui-chart__point' : 'aui-chart__point aui-chart__point--unmarked');
        ChartFrame.markElement(point, fillTemplate(template, { x: o.categories[i] ?? '', series: v.series.label, value: this.#formatFor(v)(value) }));
        points.append(point);
        track(i, point);
        marks.push({ element: point, row: v.row, column: i, key: `${v.series.id}\u0000${String(i)}`, x: cx, y: cy });
      }
      close(hi);
      if (area) {
        const areaPath = svgElement(doc, 'path', { d: area }, 'aui-chart__area');
        frame.applyGradient(areaPath, slot, v.series.style?.color);
        g.append(areaPath);
      }
      if (line) {
        const linePath = svgElement(doc, 'path', { d: line }, `aui-chart__line aui-chart__dash--${String((v.position % 4) + 1)}`);
        applySeriesDash(linePath, v.series.style);
        g.append(linePath);
      }
      lineLayer.append(g);
      pointLayer.append(points);
    }
    layer.append(barLayer, lineLayer, pointLayer);
    frame.setMarks(marks);
  }

  protected hover(x: number, y: number): HoverResult | null {
    const p = this.#plot;
    if (y < p.top - 8 || y > p.bottom + 8 || x < p.left - 8 || x > p.right + 8) return null;
    const [lo, hi] = this.#range;
    let column = -1;
    let best = Infinity;
    for (let i = lo; i <= hi; i++) {
      const d = Math.abs((this.#centers[i] ?? 0) - x);
      if (d < best) {
        best = d;
        column = i;
      }
    }
    if (column < 0) return null;
    const m = this.model;
    const rows: TooltipRow[] = [];
    let anchor = Infinity;
    for (const v of m.visible) {
      const value = finite(v.series.values[column]);
      if (value === null) continue;
      rows.push({ slot: colorSlot(v.series.color, v.position), shapeSlot: v.position + 1, swatch: v.series.type === 'bar' ? 'fill' : 'line', label: v.series.label, value: this.#formatFor(v)(value), seriesId: v.series.id, seriesStyle: v.series.style });
      const scale = v.secondary ? this.#scales?.secondary : this.#scales?.primary;
      if (scale) anchor = Math.min(anchor, scale.map(value));
    }
    if (rows.length === 0) return null;
    const cx = this.#centers[column] ?? 0;
    return { content: { title: this.options.categories[column] ?? '', rows }, x: cx, y: Number.isFinite(anchor) ? anchor : p.top, highlight: this.#elements.get(column) ?? [], crosshair: { x: cx }, column };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const m = this.model;
    const v = m.visible.find((x) => x.row === mark.row);
    const value = v ? finite(v.series.values[mark.column]) : null;
    return {
      title: this.options.categories[mark.column] ?? '',
      rows: v && value !== null ? [{ slot: colorSlot(v.series.color, v.position), shapeSlot: v.position + 1, swatch: v.series.type === 'bar' ? 'fill' : 'line', label: v.series.label, value: this.#formatFor(v)(value), seriesId: v.series.id, seriesStyle: v.series.style }] : [],
    };
  }

  protected override key(event: KeyboardEvent, mark: FrameMark): boolean {
    return this.#zoom.key(event, { x: mark.column });
  }

  protected override beyond(mark: FrameMark, step: 1 | -1): string | null {
    const win = this.#zoom.x;
    if (!win) return null;
    const v = this.model.visible.find((x) => x.row === mark.row);
    if (!v) return null;
    let target = mark.column + step;
    while (target >= 0 && target < this.options.categories.length && finite(v.series.values[target]) === null) target += step;
    if (target < 0 || target >= this.options.categories.length) return null;
    this.#zoom.pan(step > 0 ? target - win.to : target - win.from, 0, 'keyboard');
    return `${v.series.id}\u0000${String(target)}`;
  }
}
