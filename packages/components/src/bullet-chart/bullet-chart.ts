/**
 * Bullet Chart (SPEC section 18.18: Bullet Chart). Compact horizontal measures against a
 * target and qualitative ranges (for example poor / satisfactory / good): each row
 * has shaded range bands, a measure bar, and a target tick, on a shared value axis.
 * Ranges use three neutral shades (not palette colors) and are named in each row's
 * accessible label, so meaning never depends on shading. Rows are keyboard-reachable
 * with Up/Down. The data table lists value, target, and range per measure.
 */
import { defineComponentConfig, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { drawAxisTitle, drawValueAxis, fontSize, textWidth, truncateText, type PlotRect } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase } from '../internal/chart/base.js';
import { assertValueAxis, valueTicks, type ValueAxisInput } from '../internal/chart/cartesian.js';
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
  valueFormatter,
  type ChartBaseConfig,
  type ChartColor,
  type ChartCommonOptions,
} from '../internal/chart/model.js';
import { linearScale } from '../internal/chart/scale.js';
import { roundedBox, sideRadii, svgElement, valueEnd, type BoxSide } from '../internal/chart/svg.js';
import type { ChartPointClickDetail } from '../internal/chart/style.js';

export type BulletChartConfig = ChartBaseConfig;

type Resolved = Readonly<BulletChartConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    bulletChart: BulletChartConfig & { locale: string; direction: Direction };
  }
}

export const bulletChartConfig = defineComponentConfig<BulletChartConfig, 'locale' | 'direction'>('bulletChart', { ...chartBaseSchema }, ['locale', 'direction']);

export interface BulletMeasure {
  id: string;
  label: string;
  value: number | null;
  target?: number;
  /** Ascending upper ends of up to three qualitative ranges (the first starts at the axis minimum). */
  ranges?: readonly number[];
}

export interface BulletChartOptions extends ChartCommonOptions, Partial<BulletChartConfig> {
  measures: readonly BulletMeasure[];
  /** Names of the qualitative ranges, in the same order as `ranges` (for example ["Poor", "Satisfactory", "Good"]). */
  rangeLabels?: readonly string[];
  /** Palette slot of the measure bars. Default 1. */
  color?: ChartColor;
  valueAxis?: ValueAxisInput;
}

registerMessages('chart', 'en', {
  roleBullet: 'bullet chart',
  bulletMeasure: '{label}: {value}',
  bulletTarget: '{text}, target {target}',
  bulletRange: '{text}, {range}',
  bulletIntro: '{type}, {measures}.',
  bulletMet: '{met} of {total} at or above target.',
  target: 'Target',
  range: 'Range',
  measure: 'Measure',
  measureCount_one: '{count} measure',
  measureCount_other: '{count} measures',
  rangeN: 'Range {n}',
});

const COMPONENT = 'bulletChart';
const CODE = 'BULLET_CHART_OPTIONS';

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly lo: number;
  readonly hi: number;
  readonly format: (value: number) => string;
  readonly formatCount: (value: number) => string;
}

export class BulletChart extends FrameChart<BulletChartOptions, Model> {
  #rows: { y0: number; y1: number; element: SVGRectElement | SVGPathElement; mark: FrameMark }[] = [];

  /** Render a bullet chart into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: BulletChartOptions): BulletChart {
    return new BulletChart(host, options);
  }

  private constructor(host: HTMLElement, options: BulletChartOptions) {
    super(host, options, 'aui-bullet-chart');
    this.start((listener) => bulletChartConfig.subscribe(listener));
  }

  protected seriesIds(): readonly string[] {
    return [];
  }

  protected assert(o: BulletChartOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.measures)) chartFail(CODE, COMPONENT, 'measures', 'BulletMeasure[]');
    const ids = new Set<string>();
    o.measures.forEach((me: unknown, i) => {
      const at = `measures[${String(i)}]`;
      if (!validators.isRecord(me)) chartFail(CODE, COMPONENT, at, 'BulletMeasure');
      if (typeof me.id !== 'string' || me.id === '' || ids.has(me.id)) chartFail(CODE, COMPONENT, `${at}.id`, 'unique non-empty string');
      ids.add(me.id);
      if (typeof me.label !== 'string') chartFail(CODE, COMPONENT, `${at}.label`, 'string');
      if (me.value !== null && typeof me.value !== 'number') chartFail(CODE, COMPONENT, `${at}.value`, 'number | null');
      if (me.target !== undefined && !(typeof me.target === 'number' && Number.isFinite(me.target))) chartFail(CODE, COMPONENT, `${at}.target`, 'finite number');
      const r = me.ranges;
      if (r !== undefined && !(Array.isArray(r) && r.length <= 3 && r.every((v, j) => typeof v === 'number' && Number.isFinite(v) && (j === 0 || v > Number(r[j - 1]))))) chartFail(CODE, COMPONENT, `${at}.ranges`, 'up to 3 ascending numbers');
    });
    if (o.rangeLabels !== undefined && !(Array.isArray(o.rangeLabels) && o.rangeLabels.length <= 3 && o.rangeLabels.every((l) => typeof l === 'string'))) chartFail(CODE, COMPONENT, 'rangeLabels', 'up to 3 strings');
    if (!isChartColor(o.color)) chartFail(CODE, COMPONENT, 'color', 'integer 1-8');
    assertValueAxis(o.valueAxis, 'valueAxis', COMPONENT, CODE);
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = bulletChartConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'locale', 'direction']));
    let lo = 0;
    let hi = -Infinity;
    for (const me of o.measures) {
      for (const v of [finite(me.value), me.target ?? null, ...(me.ranges ?? [])]) {
        if (v === null) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    return {
      config,
      lo,
      hi: hi > lo ? hi : lo + 1,
      format: valueFormatter(o, config.locale),
      formatCount: (v) => new Intl.NumberFormat(config.locale).format(v),
      empty: o.measures.length === 0 ? getMessage('chart', 'noData', {}, config.locale) : null,
    };
  }

  #rangeName(index: number): string {
    return this.options.rangeLabels?.[index] ?? this.message('rangeN', { n: String(index + 1) });
  }

  /** Index of the qualitative range the value falls in, or -1. */
  #rangeOf(me: BulletMeasure): number {
    const v = finite(me.value);
    if (v === null || !me.ranges?.length) return -1;
    const i = me.ranges.findIndex((r) => v <= r);
    return i < 0 ? me.ranges.length - 1 : i;
  }

  #label(me: BulletMeasure): string {
    const m = this.model;
    const v = finite(me.value);
    let text = this.message('bulletMeasure', { label: me.label, value: v === null ? this.message('noValue') : m.format(v) });
    if (me.target !== undefined) text = this.message('bulletTarget', { text, target: m.format(me.target) });
    const r = this.#rangeOf(me);
    if (r >= 0) text = this.message('bulletRange', { text, range: this.#rangeName(r) });
    return text;
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    this.configureFrame('roleBullet', 'columns-vertical');
    this.frame.setText(o.label, o.hideLabel === true, o.description, o.summary ?? this.#summaryText());
    this.frame.setLegend([], false, false);
    this.frame.setTable(m.config.dataTable, () => this.#tableData());
    this.frame.setEmpty(m.empty);
    this.frame.render();
  }

  #summaryText(): string {
    const o = this.options;
    const m = this.model;
    const locale = m.config.locale;
    const parts = [this.message('bulletIntro', { type: this.message('roleBullet'), measures: chartPlural('measureCount', o.measures.length, locale) })];
    parts.push(...o.measures.map((me) => `${this.#label(me)}.`));
    const withTarget = o.measures.filter((me) => me.target !== undefined && finite(me.value) !== null);
    if (withTarget.length) parts.push(this.message('bulletMet', { met: m.formatCount(withTarget.filter((me) => (finite(me.value) ?? 0) >= (me.target ?? 0)).length), total: m.formatCount(withTarget.length) }));
    return parts.join(' ');
  }

  #tableData(): TableData {
    const m = this.model;
    const none = this.message('noValue');
    return {
      caption: this.options.label,
      columns: [this.message('measure'), this.message('value'), this.message('target'), this.message('range')],
      numeric: [false, true, true, false],
      rows: this.options.measures.map((me) => {
        const v = finite(me.value);
        const r = this.#rangeOf(me);
        return [me.label, v === null ? none : m.format(v), me.target === undefined ? '-' : m.format(me.target), r < 0 ? '-' : this.#rangeName(r)];
      }),
    };
  }

  protected draw(width: number, height: number): void {
    const o = this.options;
    const m = this.model;
    const frame = this.frame;
    const doc = frame.doc;
    const layer = frame.layer;
    this.#rows = [];
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const side = rtl ? 'right' : 'left';
    const px = fontSize(frame.svg);
    const widest = o.measures.reduce((w, me) => Math.max(w, textWidth(me.label, px)), 0);
    const labelWidth = Math.ceil(Math.min(widest, width * 0.35)) + 12;
    const top = Math.ceil(px * 0.5);
    const xTitle = o.valueAxis?.label;
    const bottom = height - Math.ceil(px * 2 + 6) - (xTitle ? Math.ceil(px * 1.6) : 0);
    const edge = Math.ceil(px);
    const plot: PlotRect = rtl ? { left: edge, right: width - labelWidth, top, bottom } : { left: labelWidth, right: width - edge, top, bottom };
    frame.setPlot(plot);
    const ticks = valueTicks(m.lo, m.hi, plot.right - plot.left, o.valueAxis, 72);
    const tickFormat = tickFormatter(o, ticks.decimals, m.config.locale);
    const x = linearScale([ticks.min, ticks.max], rtl ? [plot.right, plot.left] : [plot.left, plot.right]);
    const clamp = (v: number): number => x.map(Math.min(ticks.max, Math.max(ticks.min, v)));
    drawValueAxis(doc, layer, { axis: 'x', ticks: ticks.values.filter((t) => t >= ticks.min && t <= ticks.max), map: x.map, plot, side, format: tickFormat, fontPx: px, zero: ticks.min < 0 && ticks.max > 0 ? 0 : null });
    if (xTitle) drawAxisTitle(doc, layer, 'x', xTitle, plot, width, height, side, px);
    const n = o.measures.length;
    const step = (plot.bottom - plot.top) / Math.max(1, n);
    const bandHeight = Math.min(40, step * 0.7);
    const barHeight = bandHeight / 3;
    const marks: FrameMark[] = [];
    const rows = svgElement(doc, 'g', {}, `aui-bullet-chart__rows aui-chart__series--c${String(o.color ?? 1)}`);
    const labels = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-chart__axis aui-chart__axis--category');
    const zero = clamp(Math.max(ticks.min, Math.min(0, ticks.max)));
    // R20-22: the qualitative ranges round only at the outer ends of the scale; the measure at its value end.
    const radius = frame.corners.box ?? 0;
    o.measures.forEach((me, i) => {
      const cy = plot.top + step * i + step / 2;
      const y = cy - bandHeight / 2;
      const g = svgElement(doc, 'g', {}, 'aui-bullet-chart__row');
      const bands = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-bullet-chart__ranges');
      let from = ticks.min;
      const ranges = me.ranges ?? [];
      ranges.forEach((r, j) => {
        const a = clamp(from);
        const b = clamp(r);
        const sides: BoxSide[] = [];
        if (j === 0) sides.push(valueEnd(b, a, true));
        if (j === ranges.length - 1) sides.push(valueEnd(a, b, true));
        bands.append(roundedBox(doc, { x: Math.min(a, b), y, width: Math.abs(b - a), height: bandHeight }, sideRadii(radius, sides), `aui-bullet-chart__range aui-bullet-chart__range--${String(j + 1)}`));
        from = r;
      });
      g.append(bands);
      const v = finite(me.value);
      const end = v === null ? zero : clamp(v);
      const bar = roundedBox(doc, { x: Math.min(zero, end), y: cy - barHeight / 2, width: Math.max(v === null ? 0 : 1, Math.abs(end - zero)), height: barHeight }, sideRadii(radius, [valueEnd(zero, end, true)]), 'aui-chart__bar aui-bullet-chart__measure');
      ChartFrame.markElement(bar, this.#label(me));
      g.append(bar);
      if (me.target !== undefined) {
        const t = clamp(me.target);
        g.append(svgElement(doc, 'line', { x1: t, x2: t, y1: y + 2, y2: y + bandHeight - 2, 'aria-hidden': 'true' }, 'aui-bullet-chart__target'));
      }
      rows.append(g);
      const label = svgElement(doc, 'text', { x: rtl ? plot.right + 8 : plot.left - 8, y: cy, 'text-anchor': rtl ? 'start' : 'end', 'dominant-baseline': 'middle' }, 'aui-bullet-chart__label');
      label.textContent = truncateText(me.label, labelWidth - 12, px);
      labels.append(label);
      const mark: FrameMark = { element: bar, row: 0, column: i, key: me.id, x: end, y: cy - barHeight / 2 };
      marks.push(mark);
      this.#rows.push({ y0: plot.top + step * i, y1: plot.top + step * (i + 1), element: bar, mark });
    });
    layer.append(rows, labels);
    frame.setMarks(marks);
  }

  protected hover(_x: number, y: number): HoverResult | null {
    const row = this.#rows.find((r) => y >= r.y0 && y < r.y1);
    if (!row) return null;
    return { content: this.tooltip(row.mark), x: row.mark.x, y: row.mark.y, highlight: [row.element] };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const me = this.options.measures[mark.column];
    const m = this.model;
    if (!me) return { title: '', rows: [] };
    const v = finite(me.value);
    const slot = this.options.color ?? 1;
    const rows: TooltipContent['rows'][number][] = [{ slot, shapeSlot: 1, swatch: 'fill', label: this.message('value'), value: v === null ? this.message('noValue') : m.format(v) }];
    if (me.target !== undefined) rows.push({ slot, shapeSlot: 1, swatch: 'none', label: this.message('target'), value: m.format(me.target) });
    const r = this.#rangeOf(me);
    if (r >= 0) rows.push({ slot, shapeSlot: 1, swatch: 'none', label: this.message('range'), value: this.#rangeName(r) });
    return { title: me.label, rows };
  }
}

/** Detail of `aui-point-click`. */
export type BulletChartPointClickDetail = ChartPointClickDetail;
