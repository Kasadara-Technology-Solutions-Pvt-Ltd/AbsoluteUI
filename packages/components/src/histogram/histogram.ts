/**
 * Histogram (SPEC section 18.18: Histogram). Distribution of raw numeric values in
 * adjacent bins on a linear x axis. Bins are automatic (Sturges' rule on "nice"
 * boundaries), a bin count, or explicit thresholds; every bin is a focusable bar
 * ("10 to 20: 14 values"). The binning is exported as `computeBins` for reuse
 * (tables, tests). Tooltips, summary, and a data table follow the shared model.
 */
import { defineComponentConfig, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { drawAxisTitle, drawBaseline, drawValueAxis, fontSize, type PlotRect } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase } from '../internal/chart/base.js';
import { assertValueAxis, drawLinearXAxis, lowerBound, plotRect, plotVertical, valueAxisWidth, valueTicks, type ValueAxisInput } from '../internal/chart/cartesian.js';
import { ChartFrame, type FrameMark, type HoverResult, type TableData, type TooltipContent } from '../internal/chart/frame.js';
import {
  assertCommon,
  chartBaseSchema,
  chartFail,
  chartPlural,
  finite,
  isChartColor,
  pickDefined,
  tickFormatter,
  type ChartBaseConfig,
  type ChartColor,
  type ChartCommonOptions,
} from '../internal/chart/model.js';
import { linearScale, linearTicks } from '../internal/chart/scale.js';
import { roundedBox, sideRadii, svgElement } from '../internal/chart/svg.js';
import { annotationSentence, assertAnnotations, axisValueText, drawAnnotations, numericPosition, type ChartAnnotation, type ChartPointClickDetail } from '../internal/chart/style.js';

export type HistogramConfig = ChartBaseConfig;

type Resolved = Readonly<HistogramConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    histogram: HistogramConfig & { locale: string; direction: Direction };
  }
}

export const histogramConfig = defineComponentConfig<HistogramConfig, 'locale' | 'direction'>('histogram', { ...chartBaseSchema }, ['locale', 'direction']);

export interface HistogramBin {
  /** Inclusive lower boundary. */
  readonly from: number;
  /** Exclusive upper boundary (inclusive for the last bin). */
  readonly to: number;
  readonly count: number;
}

export interface HistogramBinning {
  /** `"auto"` (default): Sturges' rule on nice boundaries; a number: about that many bins; an array: ascending thresholds (bin edges). */
  bins?: 'auto' | number | readonly number[];
  /** Domain of the bins. Default: the data extent. Values outside are counted as out of range. */
  min?: number;
  max?: number;
}

export interface HistogramOptions extends ChartCommonOptions, Partial<HistogramConfig>, HistogramBinning {
  /** Raw values; null, NaN, and infinities are ignored (and counted as missing). */
  values: readonly (number | null)[];
  /** Palette slot. Default 1. */
  color?: ChartColor;
  /** Intl.NumberFormat options for bin boundaries. Default: `valueFormat`. */
  binFormat?: Intl.NumberFormatOptions;
  xAxis?: { label?: string };
  /** Count axis (label defaults to "Count"). */
  yAxis?: ValueAxisInput;
  /** Reference lines and bands: x values are data values (bin scale); y values are counts. */
  annotations?: readonly ChartAnnotation[] | undefined;
}

/** Detail of `aui-point-click` (`label` is the bin range, `value` its count). */
export type HistogramPointClickDetail = ChartPointClickDetail;

registerMessages('chart', 'en', {
  roleHistogram: 'histogram',
  count: 'Count',
  bin: 'Bin',
  binRange: '{from} to {to}',
  binPoint: '{range}: {count}',
  valueCount_one: '{count} value',
  valueCount_other: '{count} values',
  binCount_one: '{count} bin',
  binCount_other: '{count} bins',
  histogramIntro: '{type}, {values} in {bins}, from {min} to {max}.',
  histogramMode: 'Most values: {range} ({count}).',
  outOfRange_one: '{count} value outside the bins.',
  outOfRange_other: '{count} values outside the bins.',
});

const COMPONENT = 'histogram';
const CODE = 'HISTOGRAM_OPTIONS';

/**
 * Bin `values`: ascending bins covering [min, max], lower-inclusive, the last bin
 * also upper-inclusive. Non-finite values are skipped; values outside [min, max]
 * are counted in `outside`.
 */
export function computeBins(values: readonly (number | null)[], binning: HistogramBinning = {}): { bins: HistogramBin[]; outside: number; missing: number } {
  const data: number[] = [];
  let missing = 0;
  for (const v of values) {
    const f = finite(v);
    if (f === null) missing++;
    else data.push(f);
  }
  let lo = binning.min ?? Infinity;
  let hi = binning.max ?? -Infinity;
  if (binning.min === undefined || binning.max === undefined) {
    for (const v of data) {
      if (binning.min === undefined && v < lo) lo = v;
      if (binning.max === undefined && v > hi) hi = v;
    }
  }
  let edges: number[];
  const spec = binning.bins ?? 'auto';
  if (typeof spec === 'object') {
    edges = [...spec];
  } else {
    if (!(lo <= hi)) return { bins: [], outside: 0, missing };
    const count = spec === 'auto' ? Math.max(1, Math.ceil(Math.log2(Math.max(1, data.length)) + 1)) : spec;
    const t = linearTicks(lo, hi, count, true);
    edges = [...t.values];
    if (edges.length < 2) edges = [t.min, t.max];
    // A fixed domain keeps its exact edges.
    const { min, max } = binning;
    if (min !== undefined) edges = [min, ...edges.filter((e) => e > min)];
    if (max !== undefined) edges = [...edges.filter((e) => e < max), max];
  }
  const bins: HistogramBin[] = [];
  const counts = new Array<number>(Math.max(0, edges.length - 1)).fill(0);
  let outside = 0;
  const first = edges[0] ?? 0;
  const last = edges[edges.length - 1] ?? 0;
  for (const v of data) {
    if (v < first || v > last || counts.length === 0) {
      outside++;
      continue;
    }
    // Index of the bin whose lower edge is the largest edge <= v.
    let i = lowerBound(edges, v);
    if (edges[i] !== v) i -= 1;
    const bin = Math.min(counts.length - 1, Math.max(0, i));
    counts[bin] = (counts[bin] ?? 0) + 1;
  }
  for (let i = 0; i < counts.length; i++) bins.push({ from: edges[i] ?? 0, to: edges[i + 1] ?? 0, count: counts[i] ?? 0 });
  return { bins, outside, missing };
}

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly bins: readonly HistogramBin[];
  readonly outside: number;
  readonly total: number;
  readonly formatBin: (value: number) => string;
  readonly formatCount: (value: number) => string;
}

export class Histogram extends FrameChart<HistogramOptions, Model> {
  #plot: PlotRect = { left: 0, right: 0, top: 0, bottom: 0 };
  #edges: { x0: number; x1: number }[] = [];
  #elements: (SVGRectElement | SVGPathElement)[] = [];

  /** Render a histogram into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: HistogramOptions): Histogram {
    return new Histogram(host, options);
  }

  private constructor(host: HTMLElement, options: HistogramOptions) {
    super(host, options, 'aui-histogram');
    this.start((listener) => histogramConfig.subscribe(listener));
  }

  /** The bins of the current data. */
  get bins(): readonly HistogramBin[] {
    return this.model.bins;
  }

  protected seriesIds(): readonly string[] {
    return [];
  }

  protected assert(o: HistogramOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.values) || o.values.some((v) => v !== null && typeof v !== 'number')) chartFail(CODE, COMPONENT, 'values', '(number | null)[]');
    const b = o.bins;
    if (b !== undefined && b !== 'auto') {
      if (typeof b === 'number') {
        if (!(Number.isInteger(b) && b >= 1 && b <= 500)) chartFail(CODE, COMPONENT, 'bins', 'integer from 1 to 500');
      } else if (!(Array.isArray(b) && b.length >= 2 && b.length <= 501 && b.every((e, i) => Number.isFinite(e) && (i === 0 || e > (b[i - 1] ?? 0))))) {
        chartFail(CODE, COMPONENT, 'bins', '"auto" | integer | ascending thresholds (2 to 501)');
      }
    }
    if (o.min !== undefined && !Number.isFinite(o.min)) chartFail(CODE, COMPONENT, 'min', 'finite number');
    if (o.max !== undefined && !Number.isFinite(o.max)) chartFail(CODE, COMPONENT, 'max', 'finite number');
    if (o.min !== undefined && o.max !== undefined && o.max <= o.min) chartFail(CODE, COMPONENT, 'max', 'number greater than min');
    if (!isChartColor(o.color)) chartFail(CODE, COMPONENT, 'color', 'integer 1-8');
    if (o.binFormat !== undefined && !validators.isRecord(o.binFormat)) chartFail(CODE, COMPONENT, 'binFormat', 'Intl.NumberFormatOptions');
    if (o.xAxis !== undefined && !(validators.isRecord(o.xAxis) && (o.xAxis.label === undefined || typeof o.xAxis.label === 'string'))) chartFail(CODE, COMPONENT, 'xAxis', '{ label?: string }');
    assertValueAxis(o.yAxis, 'yAxis', COMPONENT, CODE);
    assertAnnotations(o.annotations, COMPONENT, CODE);
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = histogramConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'locale', 'direction']));
    const binning: HistogramBinning = {};
    if (o.bins !== undefined) binning.bins = o.bins;
    if (o.min !== undefined) binning.min = o.min;
    if (o.max !== undefined) binning.max = o.max;
    const { bins, outside, missing } = computeBins(o.values, binning);
    const custom = o.formatValue;
    const nf = new Intl.NumberFormat(config.locale, o.binFormat ?? o.valueFormat ?? {});
    const cf = new Intl.NumberFormat(config.locale);
    const total = o.values.length - missing;
    return {
      config,
      bins,
      outside,
      total,
      formatBin: custom && !o.binFormat ? (v) => custom(v) : (v) => nf.format(v),
      formatCount: (v) => cf.format(v),
      empty: bins.length === 0 || total === 0 ? getMessage('chart', 'noData', {}, config.locale) : null,
    };
  }

  #range(bin: HistogramBin): string {
    return this.message('binRange', { from: this.model.formatBin(bin.from), to: this.model.formatBin(bin.to) });
  }

  #countText(count: number): string {
    return chartPlural('valueCount', count, this.model.config.locale);
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    this.configureFrame('roleHistogram');
    const notes = annotationSentence(o.annotations, axisValueText(m.formatBin, m.config.locale), axisValueText(m.formatCount, m.config.locale), m.config.locale);
    this.frame.setText(o.label, o.hideLabel === true, o.description, [o.summary ?? this.#summaryText(), notes].filter(Boolean).join(' '));
    this.frame.setLegend([], false, false);
    this.frame.setTable(m.config.dataTable, () => this.#tableData());
    this.frame.setEmpty(m.empty);
    this.frame.render();
  }

  #summaryText(): string {
    const m = this.model;
    const locale = m.config.locale;
    if (m.bins.length === 0) return this.message('histogramIntro', { type: this.message('roleHistogram'), values: this.#countText(m.total), bins: chartPlural('binCount', 0, locale), min: '', max: '' });
    const parts = [this.message('histogramIntro', {
      type: this.message('roleHistogram'),
      values: this.#countText(m.total),
      bins: chartPlural('binCount', m.bins.length, locale),
      min: m.formatBin(m.bins[0]?.from ?? 0),
      max: m.formatBin(m.bins[m.bins.length - 1]?.to ?? 0),
    })];
    const mode = m.bins.reduce((best, b) => (b.count > best.count ? b : best), m.bins[0] ?? { from: 0, to: 0, count: 0 });
    if (mode.count > 0) parts.push(this.message('histogramMode', { range: this.#range(mode), count: this.#countText(mode.count) }));
    if (m.outside > 0) parts.push(chartPlural('outOfRange', m.outside, locale));
    return parts.join(' ');
  }

  #tableData(): TableData {
    const m = this.model;
    return {
      caption: this.options.label,
      columns: [this.options.xAxis?.label ?? this.message('bin'), this.options.yAxis?.label ?? this.message('count')],
      numeric: [false, true],
      rows: m.bins.map((b) => [this.#range(b), m.formatCount(b.count)]),
    };
  }

  protected draw(width: number, height: number): void {
    const o = this.options;
    const m = this.model;
    const frame = this.frame;
    const doc = frame.doc;
    const layer = frame.layer;
    this.#edges = [];
    this.#elements = [];
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const side = rtl ? 'right' : 'left';
    const px = fontSize(frame.svg);
    const xTitle = o.xAxis?.label;
    const yTitle = o.yAxis?.label ?? this.message('count');
    const vertical = plotVertical(height, px, Boolean(xTitle));
    const maxCount = Math.max(1, ...m.bins.map((b) => b.count));
    const ticks = valueTicks(0, maxCount, vertical.bottom - vertical.top, o.yAxis);
    // Counts are integers: never print fractional ticks.
    const tickValues = ticks.values.filter((t) => Number.isInteger(t) && t >= ticks.min && t <= ticks.max);
    const countFormat = tickFormatter({}, 0, m.config.locale);
    const plot = plotRect(width, vertical, px, rtl, valueAxisWidth(tickValues.map(countFormat), px, true));
    this.#plot = plot;
    frame.setPlot(plot);
    const y = linearScale([ticks.min, ticks.max], [plot.bottom, plot.top]);
    drawValueAxis(doc, layer, { axis: 'y', ticks: tickValues, map: y.map, plot, side, format: countFormat, fontPx: px, zero: null });
    const first = m.bins[0]?.from ?? 0;
    const last = m.bins[m.bins.length - 1]?.to ?? 1;
    const x = linearScale([first, last], rtl ? [plot.right, plot.left] : [plot.left, plot.right]);
    const edges = [first, ...m.bins.map((b) => b.to)];
    // Label every k-th edge so labels never crowd.
    const spacing = (plot.right - plot.left) / Math.max(1, m.bins.length);
    const every = Math.max(1, Math.ceil((px * 4) / Math.max(1, spacing)));
    drawLinearXAxis(doc, layer, { ticks: edges.filter((_, i) => i % every === 0), scale: x, format: (v) => m.formatBin(v), plot, side, fontPx: px, width, grid: false });
    drawBaseline(doc, layer, 'x', plot, side);
    if (xTitle) drawAxisTitle(doc, layer, 'x', xTitle, plot, width, height, side, px);
    drawAxisTitle(doc, layer, 'y', yTitle, plot, width, height, side, px);
    drawAnnotations(doc, layer, o.annotations, { x: numericPosition(x.map), y: numericPosition(y.map), plot, rtl, fontPx: px });

    const g = svgElement(doc, 'g', {}, `aui-histogram__bars aui-chart__series--c${String(o.color ?? 1)}`);
    const marks: FrameMark[] = [];
    m.bins.forEach((bin, i) => {
      const x0 = Math.min(x.map(bin.from), x.map(bin.to));
      const x1 = Math.max(x.map(bin.from), x.map(bin.to));
      const top = y.map(Math.min(ticks.max, bin.count));
      // R20-22: bins round at the value end (the top).
      const rect = roundedBox(doc, { x: x0, y: top, width: Math.max(0, x1 - x0), height: Math.max(0, plot.bottom - top) }, sideRadii(frame.corners.bar ?? 0, ['top']), 'aui-chart__bar');
      ChartFrame.markElement(rect, this.message('binPoint', { range: this.#range(bin), count: this.#countText(bin.count) }));
      g.append(rect);
      this.#edges.push({ x0, x1 });
      this.#elements.push(rect);
      marks.push({ element: rect, row: 0, column: i, key: String(i), x: (x0 + x1) / 2, y: top });
    });
    layer.append(g);
    frame.setMarks(marks);
  }

  protected hover(px: number, py: number): HoverResult | null {
    const p = this.#plot;
    if (py < p.top - 8 || py > p.bottom + 8) return null;
    const i = this.#edges.findIndex((e) => px >= e.x0 && px < e.x1);
    const el = this.#elements[i];
    const mark = this.frame.marks[i];
    if (i < 0 || !el || !mark) return null;
    return { content: this.tooltip(mark), x: mark.x, y: mark.y, highlight: [el] };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const bin = this.model.bins[Number(mark.key)];
    if (!bin) return { title: '', rows: [] };
    return { title: this.#range(bin), rows: [{ slot: this.options.color ?? 1, shapeSlot: 1, swatch: 'fill', label: this.options.yAxis?.label ?? this.message('count'), value: this.model.formatCount(bin.count) }] };
  }
}
