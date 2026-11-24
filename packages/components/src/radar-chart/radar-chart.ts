/**
 * Radar Chart (SPEC section 18.18: Radar Chart, Polar Chart). Compares series across
 * several quantitative axes arranged around a circle: each series is a closed
 * polygon (optionally filled) with a focusable vertex per axis. Keyboard: Left/Right
 * move around the axes, Up/Down between series. Series differ by color, marker
 * shape, and (with `patterns`) dash pattern. Axes keep clockwise order in RTL (like
 * pie charts, decision C5). A shared radial scale, rings, and spokes are drawn
 * aria-hidden; the summary and data table carry the values.
 */
import { defineComponentConfig, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { fontSize, textWidth, truncateText } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase, type ChartSeriesToggleDetail } from '../internal/chart/base.js';
import { assertValueAxis, type ValueAxisInput } from '../internal/chart/cartesian.js';
import { ChartFrame, type FrameMark, type HoverResult, type LegendItem, type TableData, type TooltipContent } from '../internal/chart/frame.js';
import {
  assertCommon,
  assertSeries,
  chartBaseSchema,
  chartFail,
  chartPlural,
  colorSlot,
  finite,
  listFormat,
  pickDefined,
  tickFormatter,
  valueFormatter,
  type ChartBaseConfig,
  type ChartCommonOptions,
  type ChartSeries,
} from '../internal/chart/model.js';
import { linearTicks } from '../internal/chart/scale.js';
import { fmt, MARKER_SHAPES, markerPath, svgElement } from '../internal/chart/svg.js';
import { applySeriesDash, applySeriesStyle, markerRadius, seriesMarker, type ChartPointClickDetail } from '../internal/chart/style.js';

export interface RadarChartConfig extends ChartBaseConfig {
  /** Fill each polygon (translucent). Default true. */
  fill: boolean;
}

type Resolved = Readonly<RadarChartConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    radarChart: RadarChartConfig & { locale: string; direction: Direction };
  }
}

export const radarChartConfig = defineComponentConfig<RadarChartConfig, 'locale' | 'direction'>(
  'radarChart',
  {
    ...chartBaseSchema,
    fill: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

export interface RadarChartOptions extends ChartCommonOptions, Partial<RadarChartConfig> {
  /** Axis names, clockwise from the top. At least three. */
  axes: readonly string[];
  /** Each series has exactly one value per axis. */
  series: readonly ChartSeries[];
  /** Shared radial scale (`min` defaults to 0 or the data minimum when negative). */
  valueAxis?: ValueAxisInput;
}

export type RadarChartSeriesToggleDetail = ChartSeriesToggleDetail;

registerMessages('chart', 'en', {
  roleRadar: 'radar chart',
  axis: 'Axis',
  axisCount_one: '{count} axis',
  axisCount_other: '{count} axes',
  radarIntro: '{type}, {series}, {axes}: {list}. Scale {from} to {to}.',
  radarSeries: '{series}: highest {max} on {maxAt}, lowest {min} on {minAt}.',
});

const COMPONENT = 'radarChart';
const CODE = 'RADAR_CHART_OPTIONS';

interface Visible {
  readonly series: ChartSeries;
  readonly position: number;
  readonly row: number;
}

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly visible: readonly Visible[];
  readonly min: number;
  readonly max: number;
  readonly format: (value: number) => string;
}

export class RadarChart extends FrameChart<RadarChartOptions, Model> {
  #vertices: { mark: FrameMark; element: SVGPathElement }[] = [];

  /** Render a radar chart into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: RadarChartOptions): RadarChart {
    return new RadarChart(host, options);
  }

  private constructor(host: HTMLElement, options: RadarChartOptions) {
    super(host, options, 'aui-radar-chart');
    this.start((listener) => radarChartConfig.subscribe(listener));
  }

  protected seriesIds(): readonly string[] {
    return this.options.series.map((s) => s.id);
  }

  protected assert(o: RadarChartOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.axes) || o.axes.length < 3 || o.axes.some((a) => typeof a !== 'string')) chartFail(CODE, COMPONENT, 'axes', 'string[] with at least 3 axes');
    assertSeries(o.series, COMPONENT, CODE);
    o.series.forEach((s, i) => {
      if (s.values.length !== o.axes.length) chartFail(CODE, COMPONENT, `series[${String(i)}].values`, 'one value per axis');
    });
    assertValueAxis(o.valueAxis, 'valueAxis', COMPONENT, CODE);
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = radarChartConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'fill', 'locale', 'direction']));
    const visible: Visible[] = [];
    o.series.forEach((series, position) => {
      if (!this.hidden.has(series.id)) visible.push({ series, position, row: visible.length });
    });
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of visible) for (const value of v.series.values) {
      const f = finite(value);
      if (f === null) continue;
      lo = Math.min(lo, f);
      hi = Math.max(hi, f);
    }
    const has = lo <= hi;
    const t = linearTicks(o.valueAxis?.min ?? Math.min(0, has ? lo : 0), o.valueAxis?.max ?? (has ? hi : 1), o.valueAxis?.tickCount ?? 4, o.valueAxis?.min === undefined && o.valueAxis?.max === undefined);
    const locale = config.locale;
    const empty = o.series.length === 0 ? getMessage('chart', 'noData', {}, locale) : visible.length === 0 ? getMessage('chart', 'allHidden', {}, locale) : has ? null : getMessage('chart', 'noData', {}, locale);
    return { config, visible, min: t.min, max: t.max, format: valueFormatter(o, locale), empty };
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    this.configureFrame('roleRadar');
    this.frame.setText(o.label, o.hideLabel === true, o.description, o.summary ?? this.#summaryText());
    const items: LegendItem[] = o.series.map((s, position) => ({ id: s.id, label: s.label, slot: colorSlot(s.color, position), shapeSlot: position + 1, swatch: 'line', visible: !this.hidden.has(s.id), seriesStyle: s.style }));
    this.frame.setLegend(items, m.config.legend === 'show' || (m.config.legend === 'auto' && o.series.length > 1), true);
    this.frame.setTable(m.config.dataTable, () => this.#tableData());
    this.frame.setEmpty(m.empty);
    this.frame.render();
  }

  #summaryText(): string {
    const o = this.options;
    const m = this.model;
    const locale = m.config.locale;
    const parts = [this.message('radarIntro', {
      type: this.message('roleRadar'),
      series: chartPlural('seriesCount', o.series.length, locale),
      axes: chartPlural('axisCount', o.axes.length, locale),
      list: listFormat(o.axes, locale),
      from: m.format(m.min),
      to: m.format(m.max),
    })];
    for (const s of o.series) {
      let min = -1;
      let max = -1;
      s.values.forEach((v, i) => {
        const f = finite(v);
        if (f === null) return;
        if (min < 0 || f < (finite(s.values[min]) ?? Infinity)) min = i;
        if (max < 0 || f > (finite(s.values[max]) ?? -Infinity)) max = i;
      });
      if (min < 0) {
        parts.push(this.message('seriesEmpty', { series: s.label }));
        continue;
      }
      parts.push(this.message('radarSeries', { series: s.label, max: m.format(finite(s.values[max]) ?? 0), maxAt: o.axes[max] ?? '', min: m.format(finite(s.values[min]) ?? 0), minAt: o.axes[min] ?? '' }));
    }
    const hidden = o.series.filter((s) => this.hidden.has(s.id)).map((s) => s.label);
    if (hidden.length) parts.push(this.message('hidden', { list: listFormat(hidden, locale) }));
    return parts.join(' ');
  }

  #tableData(): TableData {
    const o = this.options;
    const none = this.message('noValue');
    return {
      caption: o.label,
      columns: [this.message('axis'), ...o.series.map((s) => s.label)],
      numeric: [false, ...o.series.map(() => true)],
      rows: o.axes.map((a, i) => [a, ...o.series.map((s) => {
        const v = finite(s.values[i]);
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
    this.#vertices = [];
    if (m.empty !== null) return;
    const px = fontSize(frame.svg);
    const n = o.axes.length;
    const labelSpace = Math.min(width * 0.25, Math.max(...o.axes.map((a) => textWidth(a, px))) + 8);
    const r = Math.max(20, Math.min(width / 2 - labelSpace, height / 2 - px * 1.8));
    const cx = width / 2;
    const cy = height / 2;
    frame.setPlot({ left: cx - r, right: cx + r, top: cy - r, bottom: cy + r });
    const angle = (i: number): number => (i / n) * Math.PI * 2;
    const at = (i: number, radius: number): [number, number] => [cx + Math.sin(angle(i)) * radius, cy - Math.cos(angle(i)) * radius];
    const radius = (v: number): number => (Math.min(m.max, Math.max(m.min, v)) - m.min) / (m.max - m.min || 1) * r;
    const grid = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-chart__grid');
    const ticks = linearTicks(m.min, m.max, o.valueAxis?.tickCount ?? 4, false).values.filter((t) => t > m.min && t <= m.max);
    const tickFormat = tickFormatter(o, linearTicks(m.min, m.max, o.valueAxis?.tickCount ?? 4, false).decimals, m.config.locale);
    for (const t of ticks) {
      const ring = Array.from({ length: n }, (_, i) => at(i, radius(t)).map(fmt).join(' ')).join('L');
      grid.append(svgElement(doc, 'path', { d: `M${ring}Z` }, 'aui-chart__gridline aui-radar-chart__ring'));
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = at(i, r);
      grid.append(svgElement(doc, 'line', { x1: cx, y1: cy, x2: x, y2: y }, 'aui-chart__gridline'));
    }
    const labels = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-chart__axis');
    for (const t of ticks) {
      const label = svgElement(doc, 'text', { x: cx + 4, y: cy - radius(t), 'dominant-baseline': 'middle' }, 'aui-chart__tick-label');
      label.textContent = tickFormat(t);
      labels.append(label);
    }
    o.axes.forEach((a, i) => {
      const [x, y] = at(i, r + 8);
      const s = Math.sin(angle(i));
      const anchor = Math.abs(s) < 0.2 ? 'middle' : s > 0 ? 'start' : 'end';
      const room = anchor === 'middle' ? width * 0.4 : s > 0 ? width - x : x;
      const text = svgElement(doc, 'text', { x, y: y + (Math.cos(angle(i)) < -0.5 ? px * 0.5 : Math.cos(angle(i)) > 0.5 ? -px * 0.3 : 0), 'text-anchor': anchor, 'dominant-baseline': 'middle' }, 'aui-radar-chart__axis-label');
      text.textContent = truncateText(a, Math.max(px * 3, room - 4), px);
      labels.append(text);
    });
    layer.append(grid, labels);

    const shapes = svgElement(doc, 'g', {}, 'aui-radar-chart__series-layer');
    const points = svgElement(doc, 'g', {}, 'aui-radar-chart__points');
    const marks: FrameMark[] = [];
    const markerSize = markerRadius(frame.host, o.theme, 3.5);
    for (const v of m.visible) {
      const slot = colorSlot(v.series.color, v.position);
      const fallbackShape = MARKER_SHAPES[v.position % MARKER_SHAPES.length] ?? 'circle';
      const styledShape = seriesMarker(v.series.style, fallbackShape);
      const shape = styledShape ?? fallbackShape;
      const g = svgElement(doc, 'g', { 'aria-hidden': 'true' }, `aui-radar-chart__series aui-chart__series--c${String(slot)}`);
      const pg = svgElement(doc, 'g', {}, `aui-radar-chart__series aui-chart__series--c${String(slot)}`);
      applySeriesStyle(g, v.series.style);
      applySeriesStyle(pg, v.series.style);
      // Missing values are drawn at the center (and read "No value").
      const coords = o.axes.map((_, i) => at(i, radius(finite(v.series.values[i]) ?? m.min)));
      const d = `M${coords.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`;
      if (m.config.fill) g.append(svgElement(doc, 'path', { d }, 'aui-chart__area'));
      const outline = svgElement(doc, 'path', { d }, `aui-chart__line aui-chart__dash--${String((v.position % 4) + 1)}`);
      applySeriesDash(outline, v.series.style);
      g.append(outline);
      coords.forEach(([x, y], i) => {
        const value = finite(v.series.values[i]);
        const el = svgElement(doc, 'path', { d: markerPath(shape, x, y, markerSize) }, styledShape ? 'aui-chart__point' : 'aui-chart__point aui-chart__point--unmarked');
        ChartFrame.markElement(el, this.message('point', { x: o.axes[i] ?? '', series: v.series.label, value: value === null ? this.message('noValue') : m.format(value) }));
        pg.append(el);
        const mark: FrameMark = { element: el, row: v.row, column: i, key: `${v.series.id}\u0000${String(i)}`, x, y };
        marks.push(mark);
        this.#vertices.push({ mark, element: el });
      });
      shapes.append(g);
      points.append(pg);
    }
    layer.append(shapes, points);
    frame.setMarks(marks);
  }

  protected hover(x: number, y: number): HoverResult | null {
    let best: { mark: FrameMark; element: SVGPathElement } | null = null;
    let distance = 16;
    for (const v of this.#vertices) {
      const d = Math.hypot(v.mark.x - x, v.mark.y - y);
      if (d < distance) {
        distance = d;
        best = v;
      }
    }
    if (!best) return null;
    return { content: this.tooltip(best.mark), x: best.mark.x, y: best.mark.y, highlight: [best.element] };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const v = this.model.visible.find((x) => x.row === mark.row);
    const value = v ? finite(v.series.values[mark.column]) : null;
    return {
      title: this.options.axes[mark.column] ?? '',
      rows: v ? [{ slot: colorSlot(v.series.color, v.position), shapeSlot: v.position + 1, swatch: 'line', label: v.series.label, value: value === null ? this.message('noValue') : this.model.format(value), seriesId: v.series.id, seriesStyle: v.series.style }] : [],
    };
  }
}

/** Detail of `aui-point-click`. */
export type RadarChartPointClickDetail = ChartPointClickDetail;
