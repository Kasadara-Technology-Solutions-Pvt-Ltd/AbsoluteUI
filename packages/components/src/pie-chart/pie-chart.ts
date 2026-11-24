/**
 * Pie Chart (SPEC section 18.18: Pie Chart, Donut Chart). Accessible SVG part-to-whole
 * chart: slices start at 12 o'clock and run clockwise in data order, with an
 * optional donut hole and center label. Each slice is keyboard reachable
 * (arrow keys) with a tooltip, labelled with its value and percentage; the legend
 * lists every slice and toggles it. Slices differ by color, texture (with
 * `patterns`), legend order, and percentage labels, never by color alone
 * (WCAG 1.4.1). Negative and missing values cannot be drawn as slices: they are
 * excluded from the pie and listed in the summary and the data table. No animation.
 */
import { defineComponentConfig, DisposableGroup, emit, validators, type Direction } from '@absoluteui/core';
import { fontSize, textWidth } from '../internal/chart/axis.js';
import { ChartFrame, type FrameMark, type HoverResult, type LegendItem, type TableData, type TooltipContent } from '../internal/chart/frame.js';
import {
  assertCommon,
  chartBaseSchema,
  chartFail,
  chartMessage,
  chartPlural,
  colorSlot,
  finite,
  isChartColor,
  listFormat,
  pickDefined,
  valueFormatter,
  type ChartBaseConfig,
  type ChartColor,
  type ChartCommonOptions,
} from '../internal/chart/model.js';
import { fmt, sectorPath, svgElement } from '../internal/chart/svg.js';
import type { ChartPointClickDetail } from '../internal/chart/style.js';

export type PieChartSliceLabels = 'percent' | 'value' | 'none';

export interface PieChartConfig extends ChartBaseConfig {
  /** Text printed on slices large enough to hold it. Default `percent`. */
  sliceLabels: PieChartSliceLabels;
}

type Resolved = Readonly<PieChartConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    pieChart: PieChartConfig & { locale: string; direction: Direction };
  }
}

export const pieChartConfig = defineComponentConfig<PieChartConfig, 'locale' | 'direction'>(
  'pieChart',
  {
    ...chartBaseSchema,
    sliceLabels: { default: 'percent', expected: '"percent" | "value" | "none"', validate: validators.oneOf(['percent', 'value', 'none'] as const) },
  },
  ['locale', 'direction'],
);

export interface PieChartSlice {
  /** Stable, unique, non-empty id. */
  id: string;
  label: string;
  /** Non-negative value. Negative, `null`, and non-finite values are not plotted. */
  value: number | null;
  /** Palette slot 1-8. Default: slice position (cycling). */
  color?: ChartColor;
}

export interface PieChartOptions extends ChartCommonOptions, Partial<PieChartConfig> {
  slices: readonly PieChartSlice[];
  /** Render a donut (ring) instead of a full pie. */
  donut?: boolean;
  /** Donut center text. Default: the formatted total of visible slices. Empty string: none. */
  centerLabel?: string;
  /** Data table header of the value column. Default: localized "Value". */
  valueLabel?: string;
}

/** Detail of `aui-series-toggle` (declared per chart so adapters can name it). */
export interface PieChartSeriesToggleDetail {
  /** Toggled series (or slice) id. */
  id: string;
  visible: boolean;
  /** All hidden ids after the change. */
  hidden: string[];
}

const COMPONENT = 'pieChart';
const CODE = 'PIE_CHART_OPTIONS';
const TAU = Math.PI * 2;
/** Slices narrower than this angle get no printed label. */
const MIN_LABEL_ANGLE = 0.3;

interface Model {
  readonly config: Resolved;
  /** Plotted, visible slices with their angles. */
  readonly arcs: readonly { readonly slice: PieChartSlice; readonly position: number; readonly value: number; readonly start: number; readonly end: number }[];
  readonly total: number;
  readonly format: (value: number) => string;
  readonly percent: (ratio: number) => string;
  readonly empty: string | null;
}

export class PieChart {
  readonly host: HTMLElement;
  #options: PieChartOptions;
  #hidden: Set<string>;
  #model: Model;
  readonly #frame: ChartFrame;
  readonly #group = new DisposableGroup();
  #geometry = { cx: 0, cy: 0, r: 0, inner: 0 };
  #elements: SVGPathElement[] = [];

  /** Render a pie or donut chart into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: PieChartOptions): PieChart {
    return new PieChart(host, options);
  }

  private constructor(host: HTMLElement, options: PieChartOptions) {
    PieChart.#assert(options);
    this.host = host;
    this.#options = { ...options };
    this.#hidden = new Set(options.hiddenSeries ?? []);
    this.#model = this.#prepare();
    this.#frame = new ChartFrame(host, 'aui-pie-chart', {
      render: (w, h) => {
        this.#render(w, h);
      },
      hover: (x, y) => this.#hover(x, y),
      tooltip: (mark) => this.#tooltip(mark),
      toggle: (id) => {
        this.#toggle(id);
      },
    });
    this.#frame.mount();
    this.#apply();
    this.#group.add(pieChartConfig.subscribe(() => {
      this.#model = this.#prepare();
      this.#apply();
    }));
  }

  /** Ids of hidden slices. */
  get hiddenSeries(): string[] {
    return this.#options.slices.filter((s) => this.#hidden.has(s.id)).map((s) => s.id);
  }

  get summary(): string {
    return this.#frame.summary;
  }

  /** The SVG plot (role="group"). */
  get element(): SVGSVGElement {
    return this.#frame.svg;
  }

  update(options: Partial<PieChartOptions>): void {
    const next = { ...this.#options, ...options };
    PieChart.#assert(next);
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
    this.#apply();
  }

  /** Show or hide a slice programmatically (no event). */
  setSeriesVisible(id: string, visible: boolean): void {
    if (visible) this.#hidden.delete(id);
    else this.#hidden.add(id);
    this.#model = this.#prepare();
    this.#apply();
  }

  destroy(): void {
    this.#group.dispose();
    this.#frame.destroy();
    this.host.classList.remove('aui-pie-chart--donut');
  }

  static #assert(o: PieChartOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.slices)) chartFail(CODE, COMPONENT, 'slices', 'PieChartSlice[]');
    const ids = new Set<string>();
    o.slices.forEach((s: unknown, i) => {
      const at = `slices[${String(i)}]`;
      if (!validators.isRecord(s)) chartFail(CODE, COMPONENT, at, 'PieChartSlice');
      if (typeof s.id !== 'string' || s.id === '' || ids.has(s.id)) chartFail(CODE, COMPONENT, `${at}.id`, 'unique non-empty string');
      ids.add(s.id);
      if (typeof s.label !== 'string') chartFail(CODE, COMPONENT, `${at}.label`, 'string');
      if (s.value !== null && typeof s.value !== 'number') chartFail(CODE, COMPONENT, `${at}.value`, 'number | null');
      if (!isChartColor(s.color)) chartFail(CODE, COMPONENT, `${at}.color`, 'integer 1-8');
    });
    if (o.valueLabel !== undefined && typeof o.valueLabel !== 'string') chartFail(CODE, COMPONENT, 'valueLabel', 'string');
    if (o.donut !== undefined && typeof o.donut !== 'boolean') chartFail(CODE, COMPONENT, 'donut', 'boolean');
    if (o.centerLabel !== undefined && typeof o.centerLabel !== 'string') chartFail(CODE, COMPONENT, 'centerLabel', 'string');
  }

  #config(): Resolved {
    return pieChartConfig.resolve(pickDefined(this.#options, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'sliceLabels', 'locale', 'direction']));
  }

  #plotted(slice: PieChartSlice): number | null {
    const v = finite(slice.value);
    return v !== null && v >= 0 ? v : null;
  }

  #prepare(): Model {
    const o = this.#options;
    const config = this.#config();
    const format = valueFormatter(o, config.locale);
    const pf = new Intl.NumberFormat(config.locale, { style: 'percent', maximumFractionDigits: 1 });
    const visible = o.slices
      .map((slice, position) => ({ slice, position, value: this.#plotted(slice) }))
      .filter((s): s is { slice: PieChartSlice; position: number; value: number } => s.value !== null && !this.#hidden.has(s.slice.id));
    const total = visible.reduce((sum, s) => sum + s.value, 0);
    let angle = 0;
    const arcs = total > 0
      ? visible.filter((s) => s.value > 0).map((s) => {
          const start = angle;
          angle += (s.value / total) * TAU;
          return { ...s, start, end: angle };
        })
      : [];
    const empty = o.slices.length === 0 || o.slices.every((s) => this.#plotted(s) === null)
      ? chartMessage('noData', {}, config.locale)
      : total > 0 ? null : chartMessage(visible.length === 0 && o.slices.some((s) => this.#hidden.has(s.id)) ? 'allHidden' : 'noData', {}, config.locale);
    return { config, arcs, total, format, percent: (r) => pf.format(r), empty };
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
      roleDescription: chartMessage(o.donut ? 'roleDonut' : 'rolePie', {}, config.locale),
      theme: o.theme,
      renderTooltip: o.renderTooltip,
      syncGroup: o.syncGroup,
    });
    this.host.classList.toggle('aui-pie-chart--donut', o.donut === true);
    frame.setText(o.label, o.hideLabel === true, o.description, o.summary ?? this.#summaryText());
    const items: LegendItem[] = o.slices.map((s, position) => {
      const v = this.#plotted(s);
      const visible = !this.#hidden.has(s.id);
      const detail = v !== null && visible && m.total > 0 ? m.percent(v / m.total) : undefined;
      return {
        id: s.id,
        label: s.label,
        ...(detail === undefined ? {} : { detail }),
        slot: colorSlot(s.color, position),
        shapeSlot: position + 1,
        swatch: 'fill',
        visible,
      };
    });
    frame.setLegend(items, config.legend !== 'hide', true);
    frame.setTable(config.dataTable, () => this.#tableData());
    frame.setEmpty(m.empty);
    frame.render();
  }

  #summaryText(): string {
    const o = this.#options;
    const m = this.#model;
    const locale = m.config.locale;
    const type = chartMessage(o.donut ? 'roleDonut' : 'rolePie', {}, locale);
    const parts = [chartMessage('pieIntro', { type, slices: chartPlural('sliceCount', o.slices.length, locale), total: m.format(m.total) }, locale)];
    const shown = m.arcs.map((a) => chartMessage('sliceSummary', { label: a.slice.label, value: m.format(a.value), percent: m.percent(a.value / m.total) }, locale));
    if (shown.length) parts.push(`${shown.join('; ')}.`);
    const skipped = o.slices.filter((s) => this.#plotted(s) === null).map((s) => s.label);
    if (skipped.length) parts.push(chartMessage('notPlotted', { list: listFormat(skipped, locale) }, locale));
    const hidden = o.slices.filter((s) => this.#hidden.has(s.id)).map((s) => s.label);
    if (hidden.length) parts.push(chartMessage('hidden', { list: listFormat(hidden, locale) }, locale));
    return parts.join(' ');
  }

  #tableData(): TableData {
    const o = this.#options;
    const m = this.#model;
    const locale = m.config.locale;
    return {
      caption: o.label,
      columns: [chartMessage('category', {}, locale), o.valueLabel ?? chartMessage('value', {}, locale), chartMessage('percent', {}, locale)],
      numeric: [false, true, true],
      rows: o.slices.map((s) => {
        const raw = finite(s.value);
        const plotted = this.#plotted(s);
        const value = raw === null ? chartMessage('noValue', {}, locale) : plotted === null ? chartMessage('notPlottedValue', { value: m.format(raw) }, locale) : m.format(raw);
        const arc = m.arcs.find((a) => a.slice.id === s.id);
        return [s.label, value, arc ? m.percent(arc.value / m.total) : '-'];
      }),
    };
  }

  #toggle(id: string): void {
    const visible = this.#hidden.has(id);
    this.setSeriesVisible(id, visible);
    const detail: PieChartSeriesToggleDetail = { id, visible, hidden: this.hiddenSeries };
    emit(this.host, 'aui-series-toggle', detail);
  }

  #render(width: number, height: number): void {
    const o = this.#options;
    const m = this.#model;
    const frame = this.#frame;
    const doc = frame.doc;
    this.#elements = [];
    if (m.empty !== null) return;
    const px = fontSize(frame.svg);
    const r = Math.max(8, Math.min(width, height) / 2 - 4);
    const inner = o.donut ? r * 0.6 : 0;
    const cx = width / 2;
    const cy = height / 2;
    this.#geometry = { cx, cy, r, inner };
    const point = (angle: number, radius: number): string => `${fmt(cx + Math.sin(angle) * radius)} ${fmt(cy - Math.cos(angle) * radius)}`;
    const slices = svgElement(doc, 'g', {}, 'aui-pie-chart__slices');
    const labels = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-pie-chart__labels');
    const marks: FrameMark[] = [];
    const locale = m.config.locale;
    // R20-22: slice corners (`sliceRadius` / `cornerRadius`), clamped by the shared sector math.
    const corner = frame.corners.slice ?? 0;
    m.arcs.forEach((arc, index) => {
      const sweep = arc.end - arc.start;
      let d: string;
      if (sweep >= TAU - 1e-9) {
        // A full circle cannot be one arc: two half arcs (and the hole for donuts, drawn evenodd).
        d = `M${point(0, r)}A${fmt(r)} ${fmt(r)} 0 1 1 ${point(Math.PI, r)}A${fmt(r)} ${fmt(r)} 0 1 1 ${point(0, r)}Z`;
        if (inner > 0) d += `M${point(0, inner)}A${fmt(inner)} ${fmt(inner)} 0 1 0 ${point(Math.PI, inner)}A${fmt(inner)} ${fmt(inner)} 0 1 0 ${point(0, inner)}Z`;
      } else {
        d = sectorPath(cx, cy, r, inner, arc.start, arc.end, corner);
      }
      const slot = colorSlot(arc.slice.color, arc.position);
      const g = svgElement(doc, 'g', {}, `aui-pie-chart__slice-group aui-chart__series--c${String(slot)}`);
      const path = svgElement(doc, 'path', { d, 'fill-rule': 'evenodd' }, 'aui-pie-chart__slice');
      const percent = m.percent(arc.value / m.total);
      ChartFrame.markElement(path, chartMessage('sliceSummary', { label: arc.slice.label, value: m.format(arc.value), percent }, locale));
      g.append(path);
      const pattern = frame.pattern(arc.position + 1);
      if (pattern) g.append(svgElement(doc, 'path', { d, 'fill-rule': 'evenodd', fill: `url(#${pattern})`, 'aria-hidden': 'true' }, 'aui-chart__pattern'));
      slices.append(g);
      this.#elements.push(path);
      const mid = (arc.start + arc.end) / 2;
      const labelRadius = inner > 0 ? (r + inner) / 2 : r * 0.62;
      const [ax, ay] = [cx + Math.sin(mid) * labelRadius, cy - Math.cos(mid) * labelRadius];
      marks.push({ element: path, row: 0, column: index, key: arc.slice.id, x: ax, y: ay });
      const mode = m.config.sliceLabels;
      if (mode !== 'none' && sweep >= MIN_LABEL_ANGLE) {
        const text = mode === 'percent' ? percent : m.format(arc.value);
        const chord = 2 * labelRadius * Math.sin(Math.min(sweep, Math.PI) / 2);
        if (textWidth(text, px) <= Math.min(chord, (r - inner) * 1.6)) {
          const label = svgElement(doc, 'text', { x: ax, y: ay, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, 'aui-chart__value-label');
          label.textContent = text;
          labels.append(label);
        }
      }
    });
    frame.layer.append(slices, labels);
    if (inner > 0) {
      const center = o.centerLabel ?? m.format(m.total);
      if (center !== '' && textWidth(center, px * 1.4) <= inner * 1.8) {
        const text = svgElement(doc, 'text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'aria-hidden': 'true' }, 'aui-pie-chart__center');
        text.textContent = center;
        frame.layer.append(text);
      }
    }
    frame.setMarks(marks);
  }

  #hover(x: number, y: number): HoverResult | null {
    const { cx, cy, r, inner } = this.#geometry;
    const dx = x - cx;
    const dy = y - cy;
    const distance = Math.hypot(dx, dy);
    if (distance > r || distance < inner) return null;
    let angle = Math.atan2(dx, -dy);
    if (angle < 0) angle += TAU;
    const m = this.#model;
    const index = m.arcs.findIndex((a) => angle >= a.start && angle < a.end);
    const element = this.#elements[index];
    const mark = this.#frame.marks[index];
    if (index < 0 || !element || !mark) return null;
    return { content: this.#tooltip(mark), x: mark.x, y: mark.y, highlight: [element] };
  }

  #tooltip(mark: FrameMark): TooltipContent {
    const m = this.#model;
    const arc = m.arcs[mark.column];
    if (!arc) return { title: '', rows: [] };
    return {
      title: arc.slice.label,
      rows: [{ slot: colorSlot(arc.slice.color, arc.position), shapeSlot: arc.position + 1, swatch: 'fill', label: m.format(arc.value), value: m.percent(arc.value / m.total), seriesId: arc.slice.id }],
    };
  }
}

/** Detail of `aui-point-click`. */
export type PieChartPointClickDetail = ChartPointClickDetail;
