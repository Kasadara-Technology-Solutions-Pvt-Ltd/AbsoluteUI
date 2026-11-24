/**
 * Waterfall Chart (SPEC section 18.18: Waterfall Chart). Shows how a starting value
 * changes through a sequence of increases and decreases: each delta step floats
 * from the running total, total steps drop to the baseline, and dashed connectors
 * link consecutive steps. Increases, decreases, and totals differ by color, by
 * texture (with `patterns`), and by their signed value labels and accessible names,
 * never by color alone (WCAG 1.4.1). Keyboard, tooltips, summary, and the data
 * table follow the shared chart model. No animation.
 */
import { defineComponentConfig, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { drawAxisTitle, drawBaseline, drawCategoryLabels, drawValueAxis, fontSize, textWidth, type PlotRect } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase } from '../internal/chart/base.js';
import { assertValueAxis, plotRect, plotVertical, valueAxisWidth, valueTicks, type ValueAxisInput } from '../internal/chart/cartesian.js';
import { ChartFrame, type FrameMark, type HoverResult, type LegendItem, type TableData, type TooltipContent } from '../internal/chart/frame.js';
import {
  assertCommon,
  chartBaseSchema,
  chartFail,
  chartPlural,
  finite,
  isChartColor,
  pickDefined,
  tickFormatter,
  valueFormatter,
  type ChartBaseConfig,
  type ChartColor,
  type ChartCommonOptions,
} from '../internal/chart/model.js';
import { bandScale, linearScale } from '../internal/chart/scale.js';
import { roundedBox, sideRadii, svgElement, valueEnd } from '../internal/chart/svg.js';
import { annotationSentence, assertAnnotations, categoryPosition, categoryText, drawAnnotations, numericPosition, type ChartAnnotation, type ChartPointClickDetail } from '../internal/chart/style.js';

export type WaterfallStepKind = 'delta' | 'total';

export interface WaterfallChartConfig extends ChartBaseConfig {
  /** Signed change (deltas) or total above each bar. Default true. */
  valueLabels: boolean;
  /** Dashed connectors between consecutive steps. Default true. */
  connectors: boolean;
}

type Resolved = Readonly<WaterfallChartConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    waterfallChart: WaterfallChartConfig & { locale: string; direction: Direction };
  }
}

export const waterfallChartConfig = defineComponentConfig<WaterfallChartConfig, 'locale' | 'direction'>(
  'waterfallChart',
  {
    ...chartBaseSchema,
    valueLabels: { default: true, expected: 'boolean', validate: validators.isBoolean },
    connectors: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

export interface WaterfallStep {
  id: string;
  label: string;
  /**
   * Delta: the change (null is a gap: no bar, the total carries over). Total: when
   * set, the running total becomes this value (an opening balance); when null or
   * omitted, the bar shows the current running total.
   */
  value?: number | null;
  /** Default "delta". */
  kind?: WaterfallStepKind;
}

export interface WaterfallChartColors {
  increase?: ChartColor;
  decrease?: ChartColor;
  total?: ChartColor;
}

export interface WaterfallChartOptions extends ChartCommonOptions, Partial<WaterfallChartConfig> {
  steps: readonly WaterfallStep[];
  /** Palette slots per step kind. Default increase 3, decrease 2, total 1. */
  colors?: WaterfallChartColors;
  categoryAxis?: { label?: string };
  valueAxis?: ValueAxisInput;
  /** Reference lines and bands: x values are step labels or indexes; y values are running-total numbers. */
  annotations?: readonly ChartAnnotation[] | undefined;
}

/** Detail of `aui-point-click`. */
export type WaterfallChartPointClickDetail = ChartPointClickDetail;

registerMessages('chart', 'en', {
  roleWaterfall: 'waterfall chart',
  increase: 'Increase',
  decrease: 'Decrease',
  totalStep: 'Total',
  noChange: 'No change',
  change: 'Change',
  runningTotal: 'Running total',
  stepKind: 'Type',
  waterfallDelta: '{label}: {change} ({kind}), running total {total}',
  waterfallTotal: '{label}: total {total}',
  waterfallGap: '{label}: no value, running total {total}',
  waterfallIntro: '{type}, {steps}. Starts at {start}, ends at {end}.',
  waterfallExtreme: 'Largest increase: {up}. Largest decrease: {down}.',
  waterfallExtremeUp: 'Largest increase: {up}.',
  waterfallExtremeDown: 'Largest decrease: {down}.',
  stepValue: '{label} ({value})',
  stepCount_one: '{count} step',
  stepCount_other: '{count} steps',
});

const COMPONENT = 'waterfallChart';
const CODE = 'WATERFALL_CHART_OPTIONS';
const KINDS: readonly WaterfallStepKind[] = ['delta', 'total'];

type BarKind = 'increase' | 'decrease' | 'total' | 'none';

interface Bar {
  readonly step: WaterfallStep;
  readonly index: number;
  readonly kind: BarKind;
  /** Change for deltas; total for totals. */
  readonly value: number | null;
  readonly from: number;
  readonly to: number;
  /** Running total after this step. */
  readonly total: number;
}

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly bars: readonly Bar[];
  readonly lo: number;
  readonly hi: number;
  readonly format: (value: number) => string;
  readonly signed: (value: number) => string;
}

const SHAPES: Readonly<Record<Exclude<BarKind, 'none'>, number>> = { increase: 1, decrease: 2, total: 3 };

export class WaterfallChart extends FrameChart<WaterfallChartOptions, Model> {
  #plot: PlotRect = { left: 0, right: 0, top: 0, bottom: 0 };
  #band: ReturnType<typeof bandScale> | null = null;
  #elements: (SVGRectElement | SVGPathElement | undefined)[] = [];

  /** Render a waterfall chart into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: WaterfallChartOptions): WaterfallChart {
    return new WaterfallChart(host, options);
  }

  private constructor(host: HTMLElement, options: WaterfallChartOptions) {
    super(host, options, 'aui-waterfall-chart');
    this.start((listener) => waterfallChartConfig.subscribe(listener));
  }

  protected seriesIds(): readonly string[] {
    return [];
  }

  protected assert(o: WaterfallChartOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.steps)) chartFail(CODE, COMPONENT, 'steps', 'WaterfallStep[]');
    const ids = new Set<string>();
    o.steps.forEach((s: unknown, i) => {
      const at = `steps[${String(i)}]`;
      if (!validators.isRecord(s)) chartFail(CODE, COMPONENT, at, 'WaterfallStep');
      if (typeof s.id !== 'string' || s.id === '' || ids.has(s.id)) chartFail(CODE, COMPONENT, `${at}.id`, 'unique non-empty string');
      ids.add(s.id);
      if (typeof s.label !== 'string') chartFail(CODE, COMPONENT, `${at}.label`, 'string');
      if (s.value !== undefined && s.value !== null && typeof s.value !== 'number') chartFail(CODE, COMPONENT, `${at}.value`, 'number | null');
      if (s.kind !== undefined && !KINDS.includes(s.kind as WaterfallStepKind)) chartFail(CODE, COMPONENT, `${at}.kind`, '"delta" | "total"');
    });
    const c: unknown = o.colors;
    if (c !== undefined && !(validators.isRecord(c) && isChartColor(c.increase) && isChartColor(c.decrease) && isChartColor(c.total))) chartFail(CODE, COMPONENT, 'colors', '{ increase?, decrease?, total?: 1-8 }');
    if (o.categoryAxis !== undefined && !(validators.isRecord(o.categoryAxis) && (o.categoryAxis.label === undefined || typeof o.categoryAxis.label === 'string'))) chartFail(CODE, COMPONENT, 'categoryAxis', '{ label?: string }');
    assertValueAxis(o.valueAxis, 'valueAxis', COMPONENT, CODE);
    assertAnnotations(o.annotations, COMPONENT, CODE);
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = waterfallChartConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'valueLabels', 'connectors', 'locale', 'direction']));
    let running = 0;
    let lo = 0;
    let hi = 0;
    const bars: Bar[] = o.steps.map((step, index) => {
      const v = finite(step.value);
      if (step.kind === 'total') {
        if (v !== null) running = v;
        lo = Math.min(lo, running);
        hi = Math.max(hi, running);
        return { step, index, kind: 'total', value: running, from: 0, to: running, total: running };
      }
      if (v === null) return { step, index, kind: 'none', value: null, from: running, to: running, total: running };
      const from = running;
      running += v;
      lo = Math.min(lo, from, running);
      hi = Math.max(hi, from, running);
      return { step, index, kind: v >= 0 ? 'increase' : 'decrease', value: v, from, to: running, total: running };
    });
    const format = valueFormatter(o, config.locale);
    const signedFormat = new Intl.NumberFormat(config.locale, { ...(o.valueFormat ?? {}), signDisplay: 'exceptZero' });
    const custom = o.formatValue;
    const signed = custom ? (v: number): string => (v > 0 ? `+${custom(v)}` : custom(v)) : (v: number): string => signedFormat.format(v);
    const empty = bars.every((b) => b.kind === 'none') ? getMessage('chart', 'noData', {}, config.locale) : null;
    return { config, bars, lo, hi, format, signed, empty };
  }

  #slot(kind: Exclude<BarKind, 'none'>): number {
    const c = this.options.colors;
    return kind === 'increase' ? (c?.increase ?? 3) : kind === 'decrease' ? (c?.decrease ?? 2) : (c?.total ?? 1);
  }

  #kindText(kind: BarKind): string {
    return this.message(kind === 'increase' ? 'increase' : kind === 'decrease' ? 'decrease' : kind === 'total' ? 'totalStep' : 'noChange');
  }

  #label(bar: Bar): string {
    const m = this.model;
    if (bar.kind === 'total') return this.message('waterfallTotal', { label: bar.step.label, total: m.format(bar.total) });
    if (bar.value === null) return this.message('waterfallGap', { label: bar.step.label, total: m.format(bar.total) });
    return this.message('waterfallDelta', { label: bar.step.label, change: m.signed(bar.value), kind: this.#kindText(bar.kind), total: m.format(bar.total) });
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    this.configureFrame('roleWaterfall');
    const frame = this.frame;
    const notes = annotationSentence(o.annotations, categoryText(o.steps.map((s) => s.label)), (v) => (typeof v === 'string' ? v : m.format(v)), m.config.locale);
    frame.setText(o.label, o.hideLabel === true, o.description, [o.summary ?? this.#summaryText(), notes].filter(Boolean).join(' '));
    const kinds = (['increase', 'decrease', 'total'] as const).filter((k) => m.bars.some((b) => b.kind === k));
    const items: LegendItem[] = kinds.map((k) => ({ id: k, label: this.#kindText(k), slot: this.#slot(k), shapeSlot: SHAPES[k], swatch: 'fill', visible: true }));
    frame.setLegend(items, m.config.legend !== 'hide', false);
    frame.setTable(m.config.dataTable, () => this.#tableData());
    frame.setEmpty(m.empty);
    frame.render();
  }

  #summaryText(): string {
    const o = this.options;
    const m = this.model;
    const locale = m.config.locale;
    const first = m.bars[0];
    const last = m.bars[m.bars.length - 1];
    const parts = [this.message('waterfallIntro', {
      type: this.message('roleWaterfall'),
      steps: chartPlural('stepCount', o.steps.length, locale),
      start: m.format(first ? first.from === 0 && first.kind === 'total' ? first.total : first.from : 0),
      end: m.format(last?.total ?? 0),
    })];
    const deltas = m.bars.filter((b) => b.kind === 'increase' || b.kind === 'decrease');
    const up = deltas.filter((b) => b.kind === 'increase').sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
    const down = deltas.filter((b) => b.kind === 'decrease').sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0];
    const text = (b: Bar): string => this.message('stepValue', { label: b.step.label, value: m.signed(b.value ?? 0) });
    if (up && down) parts.push(this.message('waterfallExtreme', { up: text(up), down: text(down) }));
    else if (up) parts.push(this.message('waterfallExtremeUp', { up: text(up) }));
    else if (down) parts.push(this.message('waterfallExtremeDown', { down: text(down) }));
    return parts.join(' ');
  }

  #tableData(): TableData {
    const o = this.options;
    const m = this.model;
    const none = this.message('noValue');
    return {
      caption: o.label,
      columns: [o.categoryAxis?.label ?? this.message('category'), this.message('change'), this.message('runningTotal'), this.message('stepKind')],
      numeric: [false, true, true, false],
      rows: m.bars.map((b) => [b.step.label, b.kind === 'total' ? '-' : b.value === null ? none : m.signed(b.value), m.format(b.total), this.#kindText(b.kind)]),
    };
  }

  protected draw(width: number, height: number): void {
    const o = this.options;
    const m = this.model;
    const frame = this.frame;
    const doc = frame.doc;
    const layer = frame.layer;
    this.#elements = [];
    this.#band = null;
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const side = rtl ? 'right' : 'left';
    const px = fontSize(frame.svg);
    const xTitle = o.categoryAxis?.label;
    const yTitle = o.valueAxis?.label;
    const vertical = plotVertical(height, px, Boolean(xTitle));
    // Room above the tallest bar for its value label.
    const labelRoom = m.config.valueLabels ? Math.ceil(px * 1.4) : 0;
    const v = { top: vertical.top + labelRoom, bottom: vertical.bottom };
    const ticks = valueTicks(m.lo, m.hi, v.bottom - v.top, o.valueAxis);
    const tickFormat = tickFormatter(o, ticks.decimals, m.config.locale);
    const plot = plotRect(width, v, px, rtl, valueAxisWidth(ticks.values.map(tickFormat), px, Boolean(yTitle)));
    this.#plot = plot;
    frame.setPlot(plot);
    const y = linearScale([ticks.min, ticks.max], [plot.bottom, plot.top]);
    const clamp = (value: number): number => y.map(Math.min(ticks.max, Math.max(ticks.min, value)));
    drawValueAxis(doc, layer, { axis: 'y', ticks: ticks.values.filter((t) => t >= ticks.min && t <= ticks.max), map: y.map, plot, side, format: tickFormat, fontPx: px, zero: ticks.min < 0 && ticks.max > 0 ? 0 : null });
    const n = m.bars.length;
    const band = bandScale(n, rtl ? [plot.right, plot.left] : [plot.left, plot.right], 0.25, 0.1);
    this.#band = band;
    drawCategoryLabels(doc, layer, { axis: 'x', labels: m.bars.map((b) => b.step.label), positions: m.bars.map((_, i) => band.center(i)), spacing: band.step, plot, side, fontPx: px, maxWidth: 0, width });
    drawBaseline(doc, layer, 'x', plot, side);
    if (xTitle) drawAxisTitle(doc, layer, 'x', xTitle, plot, width, height, side, px);
    if (yTitle) drawAxisTitle(doc, layer, 'y', yTitle, plot, width, height, side, px);
    drawAnnotations(doc, layer, o.annotations, { x: categoryPosition(m.bars.map((b) => b.step.label), (i) => band.center(i)), y: numericPosition(y.map), plot, rtl, fontPx: px });

    const connectors = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-waterfall-chart__connectors');
    const bars = svgElement(doc, 'g', {}, 'aui-waterfall-chart__bars');
    const labels = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-waterfall-chart__labels');
    const marks: FrameMark[] = [];
    // R20-22: floating steps round all four corners; totals (anchored at zero) round at the value end.
    const radius = frame.corners.bar ?? 0;
    m.bars.forEach((bar, i) => {
      const x = band.start(i);
      const top = Math.min(clamp(bar.from), clamp(bar.to));
      const bottom = Math.max(clamp(bar.from), clamp(bar.to));
      if (bar.kind !== 'none') {
        const slot = this.#slot(bar.kind);
        const g = svgElement(doc, 'g', {}, `aui-waterfall-chart__step aui-waterfall-chart__step--${bar.kind} aui-chart__series--c${String(slot)}`);
        // Zero-height changes stay visible (and hoverable) as a 1 px bar.
        const rect = { x, y: bottom - top < 1 ? top - 0.5 : top, width: band.bandwidth, height: Math.max(1, bottom - top) };
        const corners = sideRadii(radius, bar.kind === 'total' ? [valueEnd(clamp(0), clamp(bar.total), false)] : undefined);
        const el = roundedBox(doc, rect, corners, 'aui-chart__bar');
        ChartFrame.markElement(el, this.#label(bar));
        g.append(el);
        const pattern = frame.pattern(SHAPES[bar.kind]);
        if (pattern) g.append(roundedBox(doc, rect, corners, 'aui-chart__pattern', { fill: `url(#${pattern})`, 'aria-hidden': 'true' }));
        bars.append(g);
        this.#elements[i] = el;
        marks.push({ element: el, row: 0, column: i, key: bar.step.id, x: x + band.bandwidth / 2, y: top });
        if (m.config.valueLabels && bar.value !== null) {
          const text = bar.kind === 'total' ? m.format(bar.value) : m.signed(bar.value);
          if (textWidth(text, px) <= band.step * 1.1) {
            // Above the bar for increases and totals >= 0, below it for decreases and negative totals.
            const below = bar.kind === 'decrease' || (bar.kind === 'total' && bar.total < 0);
            const label = svgElement(doc, 'text', { x: x + band.bandwidth / 2, y: below ? bottom + px * 0.9 : top - px * 0.6, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, 'aui-chart__value-label');
            label.textContent = text;
            labels.append(label);
          }
        }
      } else {
        // A gap still has a focusable (invisible) mark, so every step is reachable.
        const el = svgElement(doc, 'rect', { x, y: clamp(bar.total) - 1, width: band.bandwidth, height: 2 }, 'aui-waterfall-chart__gap');
        ChartFrame.markElement(el, this.#label(bar));
        bars.append(el);
        this.#elements[i] = el;
        marks.push({ element: el, row: 0, column: i, key: bar.step.id, x: x + band.bandwidth / 2, y: clamp(bar.total) });
      }
      const next = m.bars[i + 1];
      if (m.config.connectors && next && next.kind !== 'total') {
        const level = clamp(bar.total);
        const x1 = rtl ? x : x + band.bandwidth;
        const x2 = rtl ? band.start(i + 1) + band.bandwidth : band.start(i + 1);
        connectors.append(svgElement(doc, 'line', { x1, x2, y1: level, y2: level }, 'aui-chart__connector'));
      }
    });
    layer.append(connectors, bars, labels);
    frame.setMarks(marks);
  }

  protected hover(x: number, y: number): HoverResult | null {
    const p = this.#plot;
    if (y < p.top - 8 || y > p.bottom + 8) return null;
    const index = this.#band?.indexAt(x) ?? -1;
    const element = this.#elements[index];
    const mark = this.frame.marks[index];
    if (index < 0 || !element || !mark) return null;
    return { content: this.tooltip(mark), x: mark.x, y: mark.y, highlight: [element] };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const m = this.model;
    const bar = m.bars[mark.column];
    if (!bar) return { title: '', rows: [] };
    const rows: TooltipContent['rows'][number][] = [];
    if (bar.kind === 'increase' || bar.kind === 'decrease') rows.push({ slot: this.#slot(bar.kind), shapeSlot: SHAPES[bar.kind], swatch: 'fill', label: this.#kindText(bar.kind), value: m.signed(bar.value ?? 0) });
    rows.push({ slot: this.#slot('total'), shapeSlot: SHAPES.total, swatch: bar.kind === 'total' ? 'fill' : 'none', label: this.message('runningTotal'), value: m.format(bar.total) });
    return { title: bar.step.label, rows };
  }
}
