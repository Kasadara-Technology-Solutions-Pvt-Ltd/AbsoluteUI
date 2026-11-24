/**
 * Heatmap (SPEC section 18.18: Heatmap). A matrix of values over two categorical axes
 * (columns along x, rows along y) where each cell's fill encodes its value on a
 * sequential (one palette slot, light to dark) or diverging (two slots around a
 * midpoint) scale in discrete steps. Because fill lightness alone is a weak cue,
 * cells print their values when they fit (`cellLabels`), the legend lists every
 * step's range, every cell is keyboard-reachable (arrow keys in two dimensions),
 * and the data table holds the exact matrix. No animation.
 */
import { defineComponentConfig, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { drawAxisTitle, drawCategoryLabels, fontSize, textWidth, type PlotRect } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase } from '../internal/chart/base.js';
import { ChartFrame, type FrameMark, type HoverResult, type LegendItem, type TableData, type TooltipContent } from '../internal/chart/frame.js';
import {
  assertCommon,
  chartBaseSchema,
  chartFail,
  chartPlural,
  finite,
  isChartColor,
  pickDefined,
  valueFormatter,
  type ChartBaseConfig,
  type ChartColor,
  type ChartCommonOptions,
} from '../internal/chart/model.js';
import { bandScale, linearTicks } from '../internal/chart/scale.js';
import { roundedRect, svgElement } from '../internal/chart/svg.js';
import type { ChartPointClickDetail } from '../internal/chart/style.js';

export type HeatmapCellLabels = 'auto' | 'always' | 'none';

export interface HeatmapConfig extends ChartBaseConfig {
  /** Values inside cells: `auto` when they fit, `always` (truncated cells are skipped), `none`. Default `auto`. */
  cellLabels: HeatmapCellLabels;
}

type Resolved = Readonly<HeatmapConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    heatmap: HeatmapConfig & { locale: string; direction: Direction };
  }
}

export const heatmapConfig = defineComponentConfig<HeatmapConfig, 'locale' | 'direction'>(
  'heatmap',
  {
    ...chartBaseSchema,
    cellLabels: { default: 'auto', expected: '"auto" | "always" | "none"', validate: validators.oneOf(['auto', 'always', 'none'] as const) },
  },
  ['locale', 'direction'],
);

export interface HeatmapColorScale {
  /** `sequential` (default): light to dark in one slot; `diverging`: two slots around `midpoint`. */
  type?: 'sequential' | 'diverging';
  /** Sequential slot. Default 1. */
  color?: ChartColor;
  /** Diverging slot below the midpoint. Default 2. */
  negative?: ChartColor;
  /** Diverging slot above the midpoint. Default 1. */
  positive?: ChartColor;
  /** Diverging center. Default 0. */
  midpoint?: number;
  /** Scale domain. Default: the data extent (nice-rounded). */
  min?: number;
  max?: number;
  /** Number of discrete steps (per side for diverging), 3-9. Default 5. */
  steps?: number;
}

export interface HeatmapOptions extends ChartCommonOptions, Partial<HeatmapConfig> {
  /** Column labels (x axis). */
  columns: readonly string[];
  /** Row labels (y axis), top to bottom. */
  rows: readonly string[];
  /** `values[row][column]`; null is an empty cell. */
  values: readonly (readonly (number | null)[])[];
  colorScale?: HeatmapColorScale;
  xAxis?: { label?: string };
  yAxis?: { label?: string };
}

registerMessages('chart', 'en', {
  roleHeatmap: 'heatmap',
  heatCell: '{column}, {row}: {value}',
  heatIntro: '{type}, {rows} by {columns}.',
  heatExtremes: 'Lowest {min} at {minAt}; highest {max} at {maxAt}.',
  heatAt: '{column}, {row}',
  heatStep: '{from} to {to}',
  heatBelow: 'Below {value}',
  heatAbove: 'Above {value}',
  rowCount_one: '{count} row',
  rowCount_other: '{count} rows',
  columnCount_one: '{count} column',
  columnCount_other: '{count} columns',
  row: 'Row',
});

const COMPONENT = 'heatmap';
const CODE = 'HEATMAP_OPTIONS';

interface Step {
  readonly from: number;
  readonly to: number;
  /** Palette slot. */
  readonly slot: number;
  /** Fill strength class suffix (5-100, multiples of 5). */
  readonly level: number;
}

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly steps: readonly Step[];
  readonly format: (value: number) => string;
  readonly min: { value: number; row: number; column: number } | null;
  readonly max: { value: number; row: number; column: number } | null;
}

export class Heatmap extends FrameChart<HeatmapOptions, Model> {
  #xBand: ReturnType<typeof bandScale> | null = null;
  #yBand: ReturnType<typeof bandScale> | null = null;
  #cells = new Map<string, SVGRectElement>();

  /** Render a heatmap into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: HeatmapOptions): Heatmap {
    return new Heatmap(host, options);
  }

  private constructor(host: HTMLElement, options: HeatmapOptions) {
    super(host, options, 'aui-heatmap');
    this.start((listener) => heatmapConfig.subscribe(listener));
  }

  protected seriesIds(): readonly string[] {
    return [];
  }

  protected assert(o: HeatmapOptions): void {
    assertCommon(o, COMPONENT, CODE);
    for (const key of ['columns', 'rows'] as const) {
      const list: unknown = o[key];
      if (!Array.isArray(list) || list.some((c) => typeof c !== 'string')) chartFail(CODE, COMPONENT, key, 'string[]');
    }
    if (!Array.isArray(o.values) || o.values.length !== o.rows.length) chartFail(CODE, COMPONENT, 'values', 'one array per row');
    o.values.forEach((row: unknown, i) => {
      if (!Array.isArray(row) || row.length !== o.columns.length || row.some((v) => v !== null && typeof v !== 'number')) chartFail(CODE, COMPONENT, `values[${String(i)}]`, '(number | null)[] with one value per column');
    });
    const s: unknown = o.colorScale;
    if (s !== undefined) {
      if (!validators.isRecord(s)) chartFail(CODE, COMPONENT, 'colorScale', 'HeatmapColorScale');
      if (s.type !== undefined && s.type !== 'sequential' && s.type !== 'diverging') chartFail(CODE, COMPONENT, 'colorScale.type', '"sequential" | "diverging"');
      for (const key of ['color', 'negative', 'positive'] as const) if (!isChartColor(s[key])) chartFail(CODE, COMPONENT, `colorScale.${key}`, 'integer 1-8');
      for (const key of ['midpoint', 'min', 'max'] as const) {
        const v = s[key];
        if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v))) chartFail(CODE, COMPONENT, `colorScale.${key}`, 'finite number');
      }
      if (typeof s.min === 'number' && typeof s.max === 'number' && s.max <= s.min) chartFail(CODE, COMPONENT, 'colorScale.max', 'number greater than colorScale.min');
      if (s.steps !== undefined && !(typeof s.steps === 'number' && Number.isInteger(s.steps) && s.steps >= 3 && s.steps <= 9)) chartFail(CODE, COMPONENT, 'colorScale.steps', 'integer from 3 to 9');
    }
    for (const key of ['xAxis', 'yAxis'] as const) {
      const axis: unknown = o[key];
      if (axis !== undefined && !(validators.isRecord(axis) && (axis.label === undefined || typeof axis.label === 'string'))) chartFail(CODE, COMPONENT, key, '{ label?: string }');
    }
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = heatmapConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'cellLabels', 'locale', 'direction']));
    let min: Model['min'] = null;
    let max: Model['max'] = null;
    for (let r = 0; r < o.values.length; r++) {
      const row = o.values[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const v = finite(row[c]);
        if (v === null) continue;
        if (!min || v < min.value) min = { value: v, row: r, column: c };
        if (!max || v > max.value) max = { value: v, row: r, column: c };
      }
    }
    const format = valueFormatter(o, config.locale);
    const scale = o.colorScale ?? {};
    const count = scale.steps ?? 5;
    const lo = scale.min ?? min?.value ?? 0;
    const hi = scale.max ?? max?.value ?? 1;
    const steps: Step[] = [];
    const level = (k: number, n: number): number => Math.max(15, Math.round((100 * k) / n / 5) * 5);
    if (scale.type === 'diverging') {
      const mid = scale.midpoint ?? 0;
      const reach = Math.max(Math.abs(hi - mid), Math.abs(mid - lo)) || 1;
      const t = linearTicks(0, reach, count, true);
      const size = t.max / count;
      for (let k = count; k >= 1; k--) steps.push({ from: mid - k * size, to: mid - (k - 1) * size, slot: scale.negative ?? 2, level: level(k, count) });
      for (let k = 1; k <= count; k++) steps.push({ from: mid + (k - 1) * size, to: mid + k * size, slot: scale.positive ?? 1, level: level(k, count) });
    } else {
      const t = linearTicks(lo, hi, count, scale.min === undefined && scale.max === undefined);
      const size = (t.max - t.min) / count || 1;
      for (let k = 1; k <= count; k++) steps.push({ from: t.min + (k - 1) * size, to: t.min + k * size, slot: scale.color ?? 1, level: level(k, count) });
    }
    const empty = o.rows.length === 0 || o.columns.length === 0 || !min ? getMessage('chart', 'noData', {}, config.locale) : null;
    return { config, steps, format, min, max, empty };
  }

  /** Scale step of a value (values outside the domain use the first or last step). */
  #stepOf(v: number): Step | undefined {
    const steps = this.model.steps;
    return steps.find((s, i) => v < s.to || i === steps.length - 1) ?? steps[0];
  }

  #stepText(step: Step, index: number): string {
    const m = this.model;
    const scale = this.options.colorScale;
    const last = m.steps.length - 1;
    // Open-ended ends when the data exceeds a fixed domain.
    if (index === 0 && scale?.min !== undefined && m.min && m.min.value < step.from) return this.message('heatBelow', { value: m.format(step.to) });
    if (index === last && scale?.max !== undefined && m.max && m.max.value > step.to) return this.message('heatAbove', { value: m.format(step.from) });
    return this.message('heatStep', { from: m.format(step.from), to: m.format(step.to) });
  }

  #label(row: number, column: number): string {
    const v = finite(this.options.values[row]?.[column]);
    return this.message('heatCell', { column: this.options.columns[column] ?? '', row: this.options.rows[row] ?? '', value: v === null ? this.message('noValue') : this.model.format(v) });
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    this.configureFrame('roleHeatmap');
    this.frame.setText(o.label, o.hideLabel === true, o.description, o.summary ?? this.#summaryText());
    const items: LegendItem[] = m.steps.map((s, i) => ({ id: String(i), label: this.#stepText(s, i), slot: s.slot, shapeSlot: 1, swatch: 'fill', visible: true, swatchClass: `aui-chart__series--c${String(s.slot)} aui-heatmap__level--${String(s.level)}` }));
    this.frame.setLegend(items, m.config.legend !== 'hide', false);
    this.frame.setTable(m.config.dataTable, () => this.#tableData());
    this.frame.setEmpty(m.empty);
    this.frame.render();
  }

  #summaryText(): string {
    const o = this.options;
    const m = this.model;
    const locale = m.config.locale;
    const parts = [this.message('heatIntro', { type: this.message('roleHeatmap'), rows: chartPlural('rowCount', o.rows.length, locale), columns: chartPlural('columnCount', o.columns.length, locale) })];
    const at = (p: { row: number; column: number }): string => this.message('heatAt', { column: o.columns[p.column] ?? '', row: o.rows[p.row] ?? '' });
    if (m.min && m.max) parts.push(this.message('heatExtremes', { min: m.format(m.min.value), minAt: at(m.min), max: m.format(m.max.value), maxAt: at(m.max) }));
    return parts.join(' ');
  }

  #tableData(): TableData {
    const o = this.options;
    const none = this.message('noValue');
    return {
      caption: o.label,
      columns: [o.yAxis?.label ?? this.message('row'), ...o.columns],
      numeric: [false, ...o.columns.map(() => true)],
      rows: o.rows.map((r, i) => [r, ...o.columns.map((_, c) => {
        const v = finite(o.values[i]?.[c]);
        return v === null ? none : this.model.format(v);
      })]),
    };
  }

  protected draw(width: number, height: number): void {
    const o = this.options;
    const m = this.model;
    const frame = this.frame;
    const doc = frame.doc;
    const layer = frame.layer;
    this.#cells = new Map();
    this.#xBand = null;
    this.#yBand = null;
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const side = rtl ? 'right' : 'left';
    const px = fontSize(frame.svg);
    const xTitle = o.xAxis?.label;
    const yTitle = o.yAxis?.label;
    const widest = o.rows.reduce((w, r) => Math.max(w, textWidth(r, px)), 0);
    const labelWidth = Math.ceil(Math.min(widest, width * 0.3)) + 10 + (yTitle ? Math.ceil(px * 1.8) : 0);
    const top = Math.ceil(px * 0.5);
    const bottom = height - Math.ceil(px * 2 + 6) - (xTitle ? Math.ceil(px * 1.6) : 0);
    const edge = Math.ceil(px * 0.5);
    const plot: PlotRect = rtl ? { left: edge, right: width - labelWidth, top, bottom } : { left: labelWidth, right: width - edge, top, bottom };
    frame.setPlot(plot);
    const xBand = bandScale(o.columns.length, rtl ? [plot.right, plot.left] : [plot.left, plot.right], 0.04, 0);
    const yBand = bandScale(o.rows.length, [plot.top, plot.bottom], 0.04, 0);
    this.#xBand = xBand;
    this.#yBand = yBand;
    drawCategoryLabels(doc, layer, { axis: 'x', labels: [...o.columns], positions: o.columns.map((_, i) => xBand.center(i)), spacing: xBand.step, plot, side, fontPx: px, maxWidth: 0, width });
    drawCategoryLabels(doc, layer, { axis: 'y', labels: [...o.rows], positions: o.rows.map((_, i) => yBand.center(i)), spacing: yBand.step, plot, side, fontPx: px, maxWidth: labelWidth - 10 - (yTitle ? Math.ceil(px * 1.8) : 0), width });
    if (xTitle) drawAxisTitle(doc, layer, 'x', xTitle, plot, width, height, side, px);
    if (yTitle) drawAxisTitle(doc, layer, 'y', yTitle, plot, width, height, side, px);

    const cells = svgElement(doc, 'g', {}, 'aui-heatmap__cells');
    const labels = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-heatmap__labels');
    const marks: FrameMark[] = [];
    const mode = m.config.cellLabels;
    // R20-22: `cellRadius` / `cornerRadius`, else the built-in 2 px.
    const cellRadius = frame.corners.cell ?? 2;
    o.rows.forEach((_, r) => {
      o.columns.forEach((__, c) => {
        const v = finite(o.values[r]?.[c]);
        const x = xBand.start(c);
        const y = yBand.start(r);
        const step = v === null ? undefined : this.#stepOf(v);
        const cls = step ? `aui-heatmap__cell aui-chart__series--c${String(step.slot)} aui-heatmap__level--${String(step.level)}` : 'aui-heatmap__cell aui-heatmap__cell--empty';
        const rect = roundedRect(doc, { x, y, width: xBand.bandwidth, height: yBand.bandwidth }, cellRadius, cls);
        ChartFrame.markElement(rect, this.#label(r, c));
        cells.append(rect);
        this.#cells.set(`${String(r)},${String(c)}`, rect);
        marks.push({ element: rect, row: r, column: c, key: `${String(r)},${String(c)}`, x: x + xBand.bandwidth / 2, y });
        if (v !== null && mode !== 'none') {
          const text = m.format(v);
          if (textWidth(text, px) <= xBand.bandwidth - 4 && yBand.bandwidth >= px + 2) {
            const label = svgElement(doc, 'text', { x: x + xBand.bandwidth / 2, y: y + yBand.bandwidth / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, 'aui-chart__value-label');
            label.textContent = text;
            labels.append(label);
          }
        }
      });
    });
    layer.append(cells, labels);
    frame.setMarks(marks);
  }

  protected hover(x: number, y: number): HoverResult | null {
    const c = this.#xBand?.indexAt(x) ?? -1;
    const r = this.#yBand?.indexAt(y) ?? -1;
    const el = this.#cells.get(`${String(r)},${String(c)}`);
    const mark = this.frame.marks.find((mk) => mk.row === r && mk.column === c);
    if (!el || !mark) return null;
    return { content: this.tooltip(mark), x: mark.x, y: mark.y, highlight: [el] };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const o = this.options;
    const v = finite(o.values[mark.row]?.[mark.column]);
    const step = v === null ? undefined : this.#stepOf(v);
    return {
      title: this.message('heatAt', { column: o.columns[mark.column] ?? '', row: o.rows[mark.row] ?? '' }),
      rows: [{ slot: step?.slot ?? 1, shapeSlot: 1, swatch: step ? 'fill' : 'none', label: this.message('value'), value: v === null ? this.message('noValue') : this.model.format(v), ...(step ? { swatchClass: `aui-chart__series--c${String(step.slot)} aui-heatmap__level--${String(step.level)}` } : {}) }],
    };
  }
}

/** Detail of `aui-point-click`. */
export type HeatmapPointClickDetail = ChartPointClickDetail;
