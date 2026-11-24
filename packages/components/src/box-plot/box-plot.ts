/**
 * Box Plot (SPEC section 18.18: Box Plot). Distributions per category as boxes
 * (lower quartile to upper quartile, median line), whiskers, and outlier dots.
 * Each datum is either precomputed statistics or raw values (quartiles use linear
 * interpolation, Tukey whiskers at 1.5 IQR by default). Several series are grouped
 * side by side. Each box is one focusable mark whose name reads the five-number
 * summary; the data table lists every statistic and the outliers.
 */
import { defineComponentConfig, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { drawAxisTitle, drawBaseline, drawCategoryLabels, drawValueAxis, fontSize, type PlotRect } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase, type ChartSeriesToggleDetail } from '../internal/chart/base.js';
import { assertValueAxis, plotRect, plotVertical, valueAxisWidth, valueTicks, type ValueAxisInput } from '../internal/chart/cartesian.js';
import { ChartFrame, type FrameMark, type HoverResult, type LegendItem, type TableData, type TooltipContent } from '../internal/chart/frame.js';
import {
  assertCommon,
  chartBaseSchema,
  chartFail,
  chartPlural,
  colorSlot,
  isChartColor,
  listFormat,
  pickDefined,
  tickFormatter,
  valueFormatter,
  type ChartBaseConfig,
  type ChartColor,
  type ChartCommonOptions,
} from '../internal/chart/model.js';
import { bandScale, linearScale } from '../internal/chart/scale.js';
import { fmt, roundedRect, svgElement } from '../internal/chart/svg.js';
import { annotationSentence, assertAnnotations, categoryPosition, categoryText, drawAnnotations, numericPosition, type ChartAnnotation, type ChartPointClickDetail } from '../internal/chart/style.js';

export type BoxPlotWhiskers = 'tukey' | 'minmax';

export interface BoxPlotConfig extends ChartBaseConfig {
  /** Whiskers for raw values: `tukey` (1.5 IQR, default) or `minmax` (no outliers). */
  whiskers: BoxPlotWhiskers;
}

type Resolved = Readonly<BoxPlotConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    boxPlot: BoxPlotConfig & { locale: string; direction: Direction };
  }
}

export const boxPlotConfig = defineComponentConfig<BoxPlotConfig, 'locale' | 'direction'>(
  'boxPlot',
  {
    ...chartBaseSchema,
    whiskers: { default: 'tukey', expected: '"tukey" | "minmax"', validate: validators.oneOf(['tukey', 'minmax'] as const) },
  },
  ['locale', 'direction'],
);

export interface BoxPlotStats {
  /** Lower whisker end. */
  min: number;
  q1: number;
  median: number;
  q3: number;
  /** Upper whisker end. */
  max: number;
  outliers?: readonly number[];
}

/** Precomputed statistics, raw values, or null (no box). */
export type BoxPlotDatum = BoxPlotStats | readonly number[] | null;

export interface BoxPlotSeries {
  id: string;
  label: string;
  /** One datum per category. */
  data: readonly BoxPlotDatum[];
  color?: ChartColor;
}

export interface BoxPlotOptions extends ChartCommonOptions, Partial<BoxPlotConfig> {
  categories: readonly string[];
  series: readonly BoxPlotSeries[];
  categoryAxis?: { label?: string };
  valueAxis?: ValueAxisInput;
  /** Reference lines and bands: x values are category labels or indexes; y values are numbers. */
  annotations?: readonly ChartAnnotation[] | undefined;
}

export type BoxPlotSeriesToggleDetail = ChartSeriesToggleDetail;
/** Detail of `aui-point-click` (`value` is the box's accessible description). */
export type BoxPlotPointClickDetail = ChartPointClickDetail;

registerMessages('chart', 'en', {
  roleBoxPlot: 'box plot',
  boxLabel: '{category}, {series}: median {median}, quartiles {q1} to {q3}, whiskers {min} to {max}',
  boxOutliers: '{label}, {outliers}',
  outlierCount_one: '{count} outlier',
  outlierCount_other: '{count} outliers',
  statMin: 'Minimum',
  statQ1: 'Lower quartile',
  statMedian: 'Median',
  statQ3: 'Upper quartile',
  statMax: 'Maximum',
  statOutliers: 'Outliers',
  boxIntro: '{type}, {series}, {categories}.',
  boxSeries: '{series}: medians from {low} ({lowAt}) to {high} ({highAt}).',
});

const COMPONENT = 'boxPlot';
const CODE = 'BOX_PLOT_OPTIONS';

/** Quantile of sorted values with linear interpolation (Hyndman-Fan type 7, as in spreadsheets). */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const a = sorted[lo] ?? 0;
  const b = sorted[Math.min(sorted.length - 1, lo + 1)] ?? a;
  return a + (h - lo) * (b - a);
}

/** Five-number summary and outliers of raw values; null when there are none. */
export function boxStats(values: readonly number[], whiskers: BoxPlotWhiskers = 'tukey'): BoxPlotStats | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  if (whiskers === 'minmax') return { min: sorted[0] ?? q1, q1, median, q3, max: sorted[sorted.length - 1] ?? q3, outliers: [] };
  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;
  const inside = sorted.filter((v) => v >= lowFence && v <= highFence);
  return {
    min: inside[0] ?? q1,
    q1,
    median,
    q3,
    max: inside[inside.length - 1] ?? q3,
    outliers: sorted.filter((v) => v < lowFence || v > highFence),
  };
}

interface Visible {
  readonly series: BoxPlotSeries;
  readonly position: number;
  readonly row: number;
  readonly stats: readonly (BoxPlotStats | null)[];
}

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly visible: readonly Visible[];
  readonly lo: number;
  readonly hi: number;
  readonly format: (value: number) => string;
}

function isStats(d: unknown): d is BoxPlotStats {
  return validators.isRecord(d);
}

export class BoxPlot extends FrameChart<BoxPlotOptions, Model> {
  #plot: PlotRect = { left: 0, right: 0, top: 0, bottom: 0 };
  #band: ReturnType<typeof bandScale> | null = null;
  #elements = new Map<string, SVGRectElement>();

  /** Render a box plot into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: BoxPlotOptions): BoxPlot {
    return new BoxPlot(host, options);
  }

  private constructor(host: HTMLElement, options: BoxPlotOptions) {
    super(host, options, 'aui-box-plot');
    this.start((listener) => boxPlotConfig.subscribe(listener));
  }

  protected seriesIds(): readonly string[] {
    return this.options.series.map((s) => s.id);
  }

  protected assert(o: BoxPlotOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.categories) || o.categories.some((c) => typeof c !== 'string')) chartFail(CODE, COMPONENT, 'categories', 'string[]');
    if (!Array.isArray(o.series)) chartFail(CODE, COMPONENT, 'series', 'BoxPlotSeries[]');
    const ids = new Set<string>();
    o.series.forEach((s: unknown, i) => {
      const at = `series[${String(i)}]`;
      if (!validators.isRecord(s)) chartFail(CODE, COMPONENT, at, 'BoxPlotSeries');
      if (typeof s.id !== 'string' || s.id === '' || ids.has(s.id)) chartFail(CODE, COMPONENT, `${at}.id`, 'unique non-empty string');
      ids.add(s.id);
      if (typeof s.label !== 'string') chartFail(CODE, COMPONENT, `${at}.label`, 'string');
      if (!isChartColor(s.color)) chartFail(CODE, COMPONENT, `${at}.color`, 'integer 1-8');
      if (!Array.isArray(s.data) || s.data.length !== o.categories.length) chartFail(CODE, COMPONENT, `${at}.data`, 'one datum per category');
      (s.data as unknown[]).forEach((d, j) => {
        const dat = `${at}.data[${String(j)}]`;
        if (d === null) return;
        if (Array.isArray(d)) {
          if (d.some((v) => typeof v !== 'number')) chartFail(CODE, COMPONENT, dat, 'number[]');
          return;
        }
        if (!isStats(d)) chartFail(CODE, COMPONENT, dat, 'BoxPlotStats | number[] | null');
        const keys = ['min', 'q1', 'median', 'q3', 'max'] as const;
        const nums = keys.map((k) => d[k]);
        if (nums.some((v) => typeof v !== 'number' || !Number.isFinite(v))) chartFail(CODE, COMPONENT, dat, '{ min, q1, median, q3, max: finite numbers }');
        if (nums.some((v, k) => k > 0 && v < (nums[k - 1] ?? 0))) chartFail(CODE, COMPONENT, dat, 'min <= q1 <= median <= q3 <= max');
        if (d.outliers !== undefined && !(Array.isArray(d.outliers) && d.outliers.every((v) => Number.isFinite(v)))) chartFail(CODE, COMPONENT, `${dat}.outliers`, 'number[]');
      });
    });
    if (o.categoryAxis !== undefined && !(validators.isRecord(o.categoryAxis) && (o.categoryAxis.label === undefined || typeof o.categoryAxis.label === 'string'))) chartFail(CODE, COMPONENT, 'categoryAxis', '{ label?: string }');
    assertValueAxis(o.valueAxis, 'valueAxis', COMPONENT, CODE);
    assertAnnotations(o.annotations, COMPONENT, CODE);
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = boxPlotConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'whiskers', 'locale', 'direction']));
    const visible: Visible[] = [];
    let lo = Infinity;
    let hi = -Infinity;
    o.series.forEach((series, position) => {
      const stats = series.data.map((d) => (d === null ? null : isStats(d) ? d : boxStats(d, config.whiskers)));
      if (this.hidden.has(series.id)) return;
      for (const s of stats) {
        if (!s) continue;
        lo = Math.min(lo, s.min, ...(s.outliers ?? []));
        hi = Math.max(hi, s.max, ...(s.outliers ?? []));
      }
      visible.push({ series, position, row: visible.length, stats });
    });
    const locale = config.locale;
    const empty = o.categories.length === 0 || o.series.length === 0
      ? getMessage('chart', 'noData', {}, locale)
      : visible.length === 0 ? getMessage('chart', 'allHidden', {}, locale) : lo <= hi ? null : getMessage('chart', 'noData', {}, locale);
    if (lo <= hi && o.valueAxis?.includeZero) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    return { config, visible, lo: lo <= hi ? lo : 0, hi: lo <= hi ? hi : 1, format: valueFormatter(o, locale), empty };
  }

  #statsOf(series: BoxPlotSeries, i: number): BoxPlotStats | null {
    const d = series.data[i];
    if (d === null || d === undefined) return null;
    return isStats(d) ? d : boxStats(d, this.model.config.whiskers);
  }

  #label(category: number, v: Visible): string {
    const s = v.stats[category];
    const m = this.model;
    const cat = this.options.categories[category] ?? '';
    if (!s) return this.message('point', { x: cat, series: v.series.label, value: this.message('noValue') });
    const label = this.message('boxLabel', { category: cat, series: v.series.label, median: m.format(s.median), q1: m.format(s.q1), q3: m.format(s.q3), min: m.format(s.min), max: m.format(s.max) });
    const n = s.outliers?.length ?? 0;
    return n > 0 ? this.message('boxOutliers', { label, outliers: chartPlural('outlierCount', n, m.config.locale) }) : label;
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    this.configureFrame('roleBoxPlot');
    const notes = annotationSentence(o.annotations, categoryText(o.categories), (v) => (typeof v === 'string' ? v : m.format(v)), m.config.locale);
    this.frame.setText(o.label, o.hideLabel === true, o.description, [o.summary ?? this.#summaryText(), notes].filter(Boolean).join(' '));
    const items: LegendItem[] = o.series.map((s, position) => ({ id: s.id, label: s.label, slot: colorSlot(s.color, position), shapeSlot: position + 1, swatch: 'fill', visible: !this.hidden.has(s.id) }));
    this.frame.setLegend(items, m.config.legend === 'show' || (m.config.legend === 'auto' && o.series.length > 1), true);
    this.frame.setTable(m.config.dataTable, () => this.#tableData());
    this.frame.setEmpty(m.empty);
    this.frame.render();
  }

  #summaryText(): string {
    const o = this.options;
    const m = this.model;
    const locale = m.config.locale;
    const parts = [this.message('boxIntro', { type: this.message('roleBoxPlot'), series: chartPlural('seriesCount', o.series.length, locale), categories: chartPlural('categoryCount', o.categories.length, locale) })];
    for (const s of o.series) {
      let low = -1;
      let high = -1;
      const medians = o.categories.map((_, i) => this.#statsOf(s, i)?.median ?? null);
      medians.forEach((v, i) => {
        if (v === null) return;
        if (low < 0 || v < (medians[low] ?? Infinity)) low = i;
        if (high < 0 || v > (medians[high] ?? -Infinity)) high = i;
      });
      if (low < 0) parts.push(this.message('seriesEmpty', { series: s.label }));
      else parts.push(this.message('boxSeries', { series: s.label, low: m.format(medians[low] ?? 0), lowAt: o.categories[low] ?? '', high: m.format(medians[high] ?? 0), highAt: o.categories[high] ?? '' }));
    }
    const hidden = o.series.filter((s) => this.hidden.has(s.id)).map((s) => s.label);
    if (hidden.length) parts.push(this.message('hidden', { list: listFormat(hidden, locale) }));
    return parts.join(' ');
  }

  #tableData(): TableData {
    const o = this.options;
    const m = this.model;
    const none = this.message('noValue');
    const rows: string[][] = [];
    for (const s of o.series) {
      o.categories.forEach((c, i) => {
        const st = this.#statsOf(s, i);
        rows.push(st
          ? [`${c}, ${s.label}`, m.format(st.min), m.format(st.q1), m.format(st.median), m.format(st.q3), m.format(st.max), listFormat((st.outliers ?? []).map(m.format), m.config.locale)]
          : [`${c}, ${s.label}`, none, none, none, none, none, '']);
      });
    }
    return {
      caption: o.label,
      columns: [o.categoryAxis?.label ?? this.message('category'), this.message('statMin'), this.message('statQ1'), this.message('statMedian'), this.message('statQ3'), this.message('statMax'), this.message('statOutliers')],
      numeric: [false, true, true, true, true, true, true],
      rows,
    };
  }

  protected draw(width: number, height: number): void {
    const o = this.options;
    const m = this.model;
    const frame = this.frame;
    const doc = frame.doc;
    const layer = frame.layer;
    this.#elements = new Map();
    this.#band = null;
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const side = rtl ? 'right' : 'left';
    const px = fontSize(frame.svg);
    const xTitle = o.categoryAxis?.label;
    const yTitle = o.valueAxis?.label;
    const vertical = plotVertical(height, px, Boolean(xTitle));
    const ticks = valueTicks(m.lo, m.hi, vertical.bottom - vertical.top, o.valueAxis);
    const tickFormat = tickFormatter(o, ticks.decimals, m.config.locale);
    const plot = plotRect(width, vertical, px, rtl, valueAxisWidth(ticks.values.map(tickFormat), px, Boolean(yTitle)));
    this.#plot = plot;
    frame.setPlot(plot);
    const y = linearScale([ticks.min, ticks.max], [plot.bottom, plot.top]);
    const clamp = (v: number): number => y.map(Math.min(ticks.max, Math.max(ticks.min, v)));
    drawValueAxis(doc, layer, { axis: 'y', ticks: ticks.values.filter((t) => t >= ticks.min && t <= ticks.max), map: y.map, plot, side, format: tickFormat, fontPx: px, zero: ticks.min < 0 && ticks.max > 0 ? 0 : null });
    const n = o.categories.length;
    const band = bandScale(n, rtl ? [plot.right, plot.left] : [plot.left, plot.right], 0.25, 0.1);
    this.#band = band;
    drawCategoryLabels(doc, layer, { axis: 'x', labels: [...o.categories], positions: o.categories.map((_, i) => band.center(i)), spacing: band.step, plot, side, fontPx: px, maxWidth: 0, width });
    drawBaseline(doc, layer, 'x', plot, side);
    if (xTitle) drawAxisTitle(doc, layer, 'x', xTitle, plot, width, height, side, px);
    if (yTitle) drawAxisTitle(doc, layer, 'y', yTitle, plot, width, height, side, px);
    drawAnnotations(doc, layer, o.annotations, { x: categoryPosition(o.categories, (i) => band.center(i)), y: numericPosition(y.map), plot, rtl, fontPx: px });

    const k = m.visible.length;
    const marks: FrameMark[] = [];
    const boxes = svgElement(doc, 'g', {}, 'aui-box-plot__boxes');
    for (let i = 0; i < n; i++) {
      const start = band.start(i);
      const sub = bandScale(k, [start, start + band.bandwidth], 0.2, 0);
      for (const v of m.visible) {
        const s = v.stats[i];
        if (!s) continue;
        const slot = colorSlot(v.series.color, v.position);
        const g = svgElement(doc, 'g', {}, `aui-box-plot__series aui-chart__series--c${String(slot)}`);
        const x = sub.start(rtl ? k - 1 - v.row : v.row);
        const w = sub.bandwidth;
        const cx = x + w / 2;
        const decor = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-box-plot__whiskers');
        const cap = Math.min(w / 2, 8);
        decor.append(svgElement(doc, 'path', { d: `M${fmt(cx)} ${fmt(clamp(s.max))}V${fmt(clamp(s.q3))}M${fmt(cx)} ${fmt(clamp(s.q1))}V${fmt(clamp(s.min))}M${fmt(cx - cap)} ${fmt(clamp(s.max))}H${fmt(cx + cap)}M${fmt(cx - cap)} ${fmt(clamp(s.min))}H${fmt(cx + cap)}` }, 'aui-box-plot__whisker'));
        const top = clamp(s.q3);
        const box = { x, y: top, width: w, height: Math.max(1, clamp(s.q1) - top) };
        const rect = roundedRect(doc, box, frame.corners.box ?? 0, 'aui-box-plot__box');
        ChartFrame.markElement(rect, this.#label(i, v));
        const pattern = frame.pattern(v.position + 1);
        const overlay = pattern ? roundedRect(doc, box, frame.corners.box ?? 0, 'aui-chart__pattern', { fill: `url(#${pattern})`, 'aria-hidden': 'true' }) : null;
        const median = svgElement(doc, 'line', { x1: x, x2: x + w, y1: clamp(s.median), y2: clamp(s.median), 'aria-hidden': 'true' }, 'aui-box-plot__median');
        for (const out of s.outliers ?? []) decor.append(svgElement(doc, 'circle', { cx, cy: clamp(out), r: 2.5 }, 'aui-box-plot__outlier'));
        g.append(decor, rect);
        if (overlay) g.append(overlay);
        g.append(median);
        boxes.append(g);
        this.#elements.set(`${String(v.row)},${String(i)}`, rect);
        marks.push({ element: rect, row: v.row, column: i, key: `${v.series.id}\u0000${String(i)}`, x: cx, y: clamp(s.max) });
      }
    }
    layer.append(boxes);
    frame.setMarks(marks);
  }

  protected hover(x: number, y: number): HoverResult | null {
    const p = this.#plot;
    if (y < p.top - 8 || y > p.bottom + 8) return null;
    const i = this.#band?.indexAt(x) ?? -1;
    if (i < 0) return null;
    const candidates = this.frame.marks.filter((mk) => mk.column === i);
    let best: FrameMark | null = null;
    for (const mk of candidates) if (!best || Math.abs(mk.x - x) < Math.abs(best.x - x)) best = mk;
    const el = best ? this.#elements.get(`${String(best.row)},${String(i)}`) : undefined;
    if (!best || !el) return null;
    return { content: this.tooltip(best), x: best.x, y: best.y, highlight: [el] };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const m = this.model;
    const v = m.visible.find((x) => x.row === mark.row);
    const s = v?.stats[mark.column];
    if (!v || !s) return { title: '', rows: [] };
    const slot = colorSlot(v.series.color, v.position);
    const row = (key: string, value: number): TooltipContent['rows'][number] => ({ slot, shapeSlot: v.position + 1, swatch: 'none', label: this.message(key), value: m.format(value) });
    const rows = [row('statMax', s.max), row('statQ3', s.q3), row('statMedian', s.median), row('statQ1', s.q1), row('statMin', s.min)];
    const n = s.outliers?.length ?? 0;
    if (n > 0) rows.push({ slot, shapeSlot: v.position + 1, swatch: 'none', label: this.message('statOutliers'), value: chartPlural('outlierCount', n, m.config.locale) });
    return { title: `${this.options.categories[mark.column] ?? ''} | ${v.series.label}`, rows };
  }
}
