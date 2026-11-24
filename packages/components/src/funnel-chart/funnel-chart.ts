/**
 * Funnel Chart (SPEC section 18.18: Funnel Chart). Sequential stages (for example
 * visits, sign-ups, purchases) as centered bars whose width is proportional to the
 * stage value, joined by trapezoid connectors. Each stage prints its value and its
 * conversion from the first and the previous stage, and is keyboard-reachable
 * (Up/Down or Left/Right). The data table lists the same conversions. No animation.
 */
import { defineComponentConfig, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { fontSize, textWidth, truncateText } from '../internal/chart/axis.js';
import { FrameChart, type ChartModelBase } from '../internal/chart/base.js';
import { ChartFrame, type FrameMark, type HoverResult, type TableData, type TooltipContent } from '../internal/chart/frame.js';
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
import { fmt, roundedRect, svgElement } from '../internal/chart/svg.js';
import type { ChartPointClickDetail } from '../internal/chart/style.js';

export interface FunnelChartConfig extends ChartBaseConfig {
  /** Show conversion from the previous stage next to each stage. Default true. */
  showConversion: boolean;
}

type Resolved = Readonly<FunnelChartConfig & { locale: string; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    funnelChart: FunnelChartConfig & { locale: string; direction: Direction };
  }
}

export const funnelChartConfig = defineComponentConfig<FunnelChartConfig, 'locale' | 'direction'>(
  'funnelChart',
  {
    ...chartBaseSchema,
    showConversion: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

export interface FunnelStage {
  id: string;
  label: string;
  /** Non-negative; null is a missing stage (drawn empty, read "No value"). */
  value: number | null;
  /** Palette slot. Default: the chart `color`. */
  color?: ChartColor;
}

export interface FunnelChartOptions extends ChartCommonOptions, Partial<FunnelChartConfig> {
  stages: readonly FunnelStage[];
  /** Palette slot for all stages. Default 1. */
  color?: ChartColor;
}

registerMessages('chart', 'en', {
  roleFunnel: 'funnel chart',
  funnelFirst: '{label}: {value}',
  funnelStage: '{label}: {value}, {ofFirst} of {first}, {ofPrevious} of previous stage',
  funnelIntro: '{type}, {stages}, from {first} ({firstValue}) to {last} ({lastValue}), {overall} overall.',
  funnelDrop: 'Largest drop: {from} to {to} ({rate} kept).',
  ofFirst: 'Of first stage',
  ofPrevious: 'Of previous stage',
  stage: 'Stage',
  stageCount_one: '{count} stage',
  stageCount_other: '{count} stages',
});

const COMPONENT = 'funnelChart';
const CODE = 'FUNNEL_CHART_OPTIONS';

interface Stage {
  readonly stage: FunnelStage;
  readonly value: number | null;
  readonly ofFirst: number | null;
  readonly ofPrevious: number | null;
}

interface Model extends ChartModelBase {
  readonly config: Resolved;
  readonly stages: readonly Stage[];
  readonly max: number;
  readonly format: (value: number) => string;
  readonly percent: (ratio: number) => string;
}

export class FunnelChart extends FrameChart<FunnelChartOptions, Model> {
  #rows: { y0: number; y1: number; element: SVGRectElement }[] = [];

  /** Render a funnel chart into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: FunnelChartOptions): FunnelChart {
    return new FunnelChart(host, options);
  }

  private constructor(host: HTMLElement, options: FunnelChartOptions) {
    super(host, options, 'aui-funnel-chart');
    this.start((listener) => funnelChartConfig.subscribe(listener));
  }

  protected seriesIds(): readonly string[] {
    return [];
  }

  protected assert(o: FunnelChartOptions): void {
    assertCommon(o, COMPONENT, CODE);
    if (!Array.isArray(o.stages)) chartFail(CODE, COMPONENT, 'stages', 'FunnelStage[]');
    const ids = new Set<string>();
    o.stages.forEach((s: unknown, i) => {
      const at = `stages[${String(i)}]`;
      if (!validators.isRecord(s)) chartFail(CODE, COMPONENT, at, 'FunnelStage');
      if (typeof s.id !== 'string' || s.id === '' || ids.has(s.id)) chartFail(CODE, COMPONENT, `${at}.id`, 'unique non-empty string');
      ids.add(s.id);
      if (typeof s.label !== 'string') chartFail(CODE, COMPONENT, `${at}.label`, 'string');
      if (s.value !== null && !(typeof s.value === 'number' && (Number.isNaN(s.value) || s.value >= 0))) chartFail(CODE, COMPONENT, `${at}.value`, 'non-negative number | null');
      if (!isChartColor(s.color)) chartFail(CODE, COMPONENT, `${at}.color`, 'integer 1-8');
    });
    if (!isChartColor(o.color)) chartFail(CODE, COMPONENT, 'color', 'integer 1-8');
  }

  protected prepare(): Model {
    const o = this.options;
    const config: Resolved = funnelChartConfig.resolve(pickDefined(o, ['legend', 'dataTable', 'tooltip', 'patterns', 'height', 'showConversion', 'locale', 'direction']));
    const first = finite(o.stages[0]?.value);
    let previous: number | null = null;
    const stages: Stage[] = o.stages.map((stage, i) => {
      const value = finite(stage.value);
      const s: Stage = {
        stage,
        value,
        ofFirst: i > 0 && value !== null && first !== null && first > 0 ? value / first : null,
        ofPrevious: i > 0 && value !== null && previous !== null && previous > 0 ? value / previous : null,
      };
      if (value !== null) previous = value;
      return s;
    });
    const max = Math.max(0, ...stages.map((s) => s.value ?? 0));
    const pf = new Intl.NumberFormat(config.locale, { style: 'percent', maximumFractionDigits: 1 });
    return {
      config,
      stages,
      max,
      format: valueFormatter(o, config.locale),
      percent: (r) => pf.format(r),
      empty: max <= 0 ? getMessage('chart', 'noData', {}, config.locale) : null,
    };
  }

  #label(s: Stage, i: number): string {
    const m = this.model;
    const value = s.value === null ? this.message('noValue') : m.format(s.value);
    if (i === 0 || s.ofFirst === null || s.ofPrevious === null) return this.message('funnelFirst', { label: s.stage.label, value });
    return this.message('funnelStage', { label: s.stage.label, value, ofFirst: m.percent(s.ofFirst), first: m.stages[0]?.stage.label ?? '', ofPrevious: m.percent(s.ofPrevious) });
  }

  protected apply(): void {
    const o = this.options;
    const m = this.model;
    this.configureFrame('roleFunnel');
    this.frame.setText(o.label, o.hideLabel === true, o.description, o.summary ?? this.#summaryText());
    this.frame.setLegend([], false, false);
    this.frame.setTable(m.config.dataTable, () => this.#tableData());
    this.frame.setEmpty(m.empty);
    this.frame.render();
  }

  #summaryText(): string {
    const m = this.model;
    const locale = m.config.locale;
    const shown = m.stages.filter((s) => s.value !== null);
    const first = shown[0];
    const last = shown[shown.length - 1];
    if (!first || !last) return this.message('noData');
    const parts = [this.message('funnelIntro', {
      type: this.message('roleFunnel'),
      stages: chartPlural('stageCount', m.stages.length, locale),
      first: first.stage.label,
      firstValue: m.format(first.value ?? 0),
      last: last.stage.label,
      lastValue: m.format(last.value ?? 0),
      overall: m.percent((first.value ?? 0) > 0 ? (last.value ?? 0) / (first.value ?? 1) : 0),
    })];
    let drop: { from: Stage; to: Stage; rate: number } | null = null;
    for (let i = 1; i < shown.length; i++) {
      const a = shown[i - 1];
      const b = shown[i];
      if (!a || !b || !a.value) continue;
      const rate = (b.value ?? 0) / a.value;
      if (!drop || rate < drop.rate) drop = { from: a, to: b, rate };
    }
    if (drop) parts.push(this.message('funnelDrop', { from: drop.from.stage.label, to: drop.to.stage.label, rate: m.percent(drop.rate) }));
    return parts.join(' ');
  }

  #tableData(): TableData {
    const m = this.model;
    const none = this.message('noValue');
    return {
      caption: this.options.label,
      columns: [this.message('stage'), this.message('value'), this.message('ofFirst'), this.message('ofPrevious')],
      numeric: [false, true, true, true],
      rows: m.stages.map((s) => [s.stage.label, s.value === null ? none : m.format(s.value), s.ofFirst === null ? '-' : m.percent(s.ofFirst), s.ofPrevious === null ? '-' : m.percent(s.ofPrevious)]),
    };
  }

  protected draw(width: number, height: number): void {
    const m = this.model;
    const frame = this.frame;
    const doc = frame.doc;
    this.#rows = [];
    if (m.empty !== null) return;
    const rtl = m.config.direction === 'rtl';
    const px = fontSize(frame.svg);
    const n = m.stages.length;
    // Stage names and numbers beside the funnel: up to 40 % of the width.
    const texts = m.stages.map((s, i) => this.#sideText(s, i));
    const labelWidth = Math.min(width * 0.4, Math.max(...m.stages.map((s) => textWidth(s.stage.label, px)), ...texts.map((t) => textWidth(t, px))) + 12);
    const left = rtl ? 4 : labelWidth;
    const right = rtl ? width - labelWidth : width - 4;
    const plotWidth = Math.max(10, right - left);
    frame.setPlot({ left, right, top: 0, bottom: height });
    const step = height / Math.max(1, n);
    const barHeight = step * 0.62;
    const cx = (left + right) / 2;
    const widthOf = (v: number | null): number => (v === null ? 0 : Math.max(2, (v / m.max) * plotWidth));
    const bars = svgElement(doc, 'g', {}, 'aui-funnel-chart__stages');
    const joins = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-funnel-chart__joins');
    const labels = svgElement(doc, 'g', { 'aria-hidden': 'true' }, 'aui-funnel-chart__labels');
    const marks: FrameMark[] = [];
    m.stages.forEach((s, i) => {
      const y = i * step + (step - barHeight) / 2;
      const w = widthOf(s.value);
      const slot = s.stage.color ?? this.options.color ?? 1;
      const g = svgElement(doc, 'g', {}, `aui-funnel-chart__stage aui-chart__series--c${String(slot)}`);
      // R20-22: `sliceRadius` / `cornerRadius`; unset keeps square stages (the stylesheet's `rx: 0` used to override the 2 px attribute).
      const rect = roundedRect(doc, { x: cx - w / 2, y, width: w, height: barHeight }, frame.corners.slice ?? 0, s.value === null ? 'aui-chart__bar aui-funnel-chart__missing' : 'aui-chart__bar');
      ChartFrame.markElement(rect, this.#label(s, i));
      g.append(rect);
      bars.append(g);
      this.#rows.push({ y0: i * step, y1: (i + 1) * step, element: rect });
      marks.push({ element: rect, row: 0, column: i, key: s.stage.id, x: cx, y });
      const next = m.stages[i + 1];
      if (next && s.value !== null && next.value !== null) {
        const nw = widthOf(next.value);
        const y1 = y + barHeight;
        const y2 = (i + 1) * step + (step - barHeight) / 2;
        joins.append(svgElement(doc, 'path', { d: `M${fmt(cx - w / 2)} ${fmt(y1)}L${fmt(cx + w / 2)} ${fmt(y1)}L${fmt(cx + nw / 2)} ${fmt(y2)}L${fmt(cx - nw / 2)} ${fmt(y2)}Z` }, `aui-funnel-chart__join aui-chart__series--c${String(slot)}`));
      }
      const tx = rtl ? width - 4 : 4;
      const anchor = rtl ? 'end' : 'start';
      const name = svgElement(doc, 'text', { x: tx, y: y + barHeight / 2 - px * 0.55, 'text-anchor': anchor, 'dominant-baseline': 'middle' }, 'aui-funnel-chart__name');
      name.textContent = truncateText(s.stage.label, labelWidth - 12, px);
      const detail = svgElement(doc, 'text', { x: tx, y: y + barHeight / 2 + px * 0.65, 'text-anchor': anchor, 'dominant-baseline': 'middle' }, 'aui-chart__tick-label');
      detail.textContent = truncateText(texts[i] ?? '', labelWidth - 12, px);
      labels.append(name, detail);
    });
    frame.layer.append(joins, bars, labels);
    frame.setMarks(marks);
  }

  #sideText(s: Stage, i: number): string {
    const m = this.model;
    const value = s.value === null ? this.message('noValue') : m.format(s.value);
    if (i === 0 || !m.config.showConversion || s.ofPrevious === null) return value;
    return `${value} | ${m.percent(s.ofPrevious)}`;
  }

  protected hover(_x: number, y: number): HoverResult | null {
    const i = this.#rows.findIndex((r) => y >= r.y0 && y < r.y1);
    const row = this.#rows[i];
    const mark = this.frame.marks[i];
    if (!row || !mark) return null;
    return { content: this.tooltip(mark), x: mark.x, y: mark.y, highlight: [row.element] };
  }

  protected tooltip(mark: FrameMark): TooltipContent {
    const m = this.model;
    const s = m.stages[mark.column];
    if (!s) return { title: '', rows: [] };
    const slot = s.stage.color ?? this.options.color ?? 1;
    const rows: TooltipContent['rows'][number][] = [{ slot, shapeSlot: 1, swatch: 'fill', label: this.message('value'), value: s.value === null ? this.message('noValue') : m.format(s.value) }];
    if (s.ofFirst !== null) rows.push({ slot, shapeSlot: 1, swatch: 'none', label: this.message('ofFirst'), value: m.percent(s.ofFirst) });
    if (s.ofPrevious !== null) rows.push({ slot, shapeSlot: 1, swatch: 'none', label: this.message('ofPrevious'), value: m.percent(s.ofPrevious) });
    return { title: s.stage.label, rows };
  }
}

/** Detail of `aui-point-click`. */
export type FunnelChartPointClickDetail = ChartPointClickDetail;
