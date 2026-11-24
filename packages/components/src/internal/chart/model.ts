/**
 * Shared chart model (SPEC section 18.18): common options and configuration schema,
 * option validation, number formatting through Intl with the configured locale,
 * series statistics, and localized summary text. Internal: not a public subpath.
 */
import { configurationError, formatNumber, getMessage, registerMessages, validators, type ConfigSchema, type Direction } from '@absoluteui/core';
import { assertInteraction, assertSeriesStyle, assertTheme, type ChartSeriesStyle, type ChartTheme, type ChartTooltipRenderer } from './style.js';

/** Palette slot: maps to the `color-chart-<n>` theme token. */
export type ChartColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ChartLegendMode = 'auto' | 'show' | 'hide';
export type ChartTableMode = 'toggle' | 'visible' | 'hidden' | 'none';

export interface ChartSeries {
  /** Stable, unique, non-empty id (legend toggling, events, focus restoration). */
  id: string;
  /** Series name (legend, tooltip, accessible labels, data table header). */
  label: string;
  /** One value per x / category. `null`, `NaN`, and infinities are gaps. */
  values: readonly (number | null)[];
  /** Palette slot 1-8. Default: series position (cycling). */
  color?: ChartColor;
  /** Per-series look: CSS color, line width, dash, marker shape, fill opacity (R20-15). */
  style?: ChartSeriesStyle;
}

/** Configuration shared by Line, Bar, and Pie charts (globally configurable). */
export interface ChartBaseConfig {
  /** `auto`: legend when there is more than one series (always for pie charts). */
  legend: ChartLegendMode;
  /** Data table fallback with the exact data: behind a toggle button, always visible, visually hidden, or none. */
  dataTable: ChartTableMode;
  /** Tooltip on pointer hover and keyboard focus. */
  tooltip: boolean;
  /**
   * Texture fills and dash patterns so series never differ by color alone (WCAG 1.4.1).
   * Off by default (plain colors); forced-colors mode always shows them.
   */
  patterns: boolean;
  /** Plot height in CSS px (the width follows the container). */
  height: number;
}

export const chartBaseSchema: ConfigSchema<ChartBaseConfig> = {
  legend: { default: 'auto', expected: '"auto" | "show" | "hide"', validate: validators.oneOf(['auto', 'show', 'hide'] as const) },
  dataTable: { default: 'toggle', expected: '"toggle" | "visible" | "hidden" | "none"', validate: validators.oneOf(['toggle', 'visible', 'hidden', 'none'] as const) },
  tooltip: { default: true, expected: 'boolean', validate: validators.isBoolean },
  patterns: { default: false, expected: 'boolean', validate: validators.isBoolean },
  height: { default: 300, expected: 'integer from 120 to 2000 (CSS px)', validate: validators.integerInRange(120, 2000) },
};

/** Instance options shared by Line, Bar, and Pie charts. */
export interface ChartCommonOptions extends Partial<ChartBaseConfig> {
  /** Chart title: visible text and the accessible name of the chart (required). */
  label: string;
  /** Visually hide the title; it stays the accessible name. */
  hideLabel?: boolean;
  /** Visible description below the title, also referenced by aria-describedby (text only). */
  description?: string;
  /** Replaces the generated accessible summary (series, ranges, extremes, trend). */
  summary?: string;
  /** Intl.NumberFormat options for values (tooltips, labels, table, summary, ticks). */
  valueFormat?: Intl.NumberFormatOptions;
  /** Custom value text; overrides `valueFormat` everywhere except axis ticks. */
  formatValue?: (value: number) => string;
  /** Series ids hidden initially (and after `update`). */
  hiddenSeries?: readonly string[];
  locale?: string;
  direction?: Direction;
  /** Look and feel: palette, fonts, grid, axis, lines, markers, bars, areas, tooltip, legend position, animation (R20-15). */
  theme?: ChartTheme | undefined;
  /** Custom tooltip content as DOM nodes (never HTML strings); return null for the default tooltip. */
  renderTooltip?: ChartTooltipRenderer | undefined;
  /** Charts with the same group show the crosshair and tooltip at the same column when one is hovered or focused. */
  syncGroup?: string | undefined;
}


registerMessages('chart', 'en', {
  legend: 'Legend',
  showTable: 'Show data table',
  hideTable: 'Hide data table',
  noData: 'No data',
  allHidden: 'All series are hidden',
  noValue: 'No value',
  point: '{x}, {series}: {value}',
  total: 'Total',
  percent: 'Percent',
  category: 'Category',
  value: 'Value',
  xAxis: 'X axis',
  yAxis: 'Y axis',
  seriesCount_one: '{count} series',
  seriesCount_other: '{count} series',
  pointCount_one: '{count} data point',
  pointCount_other: '{count} data points',
  categoryCount_one: '{count} category',
  categoryCount_other: '{count} categories',
  sliceCount_one: '{count} slice',
  sliceCount_other: '{count} slices',
  missingCount_one: '{count} missing value',
  missingCount_other: '{count} missing values',
  intro: '{type}, {series}, {points}.',
  range: '{axis}: {from} to {to}.',
  seriesStats: '{series}: minimum {min} at {minAt}, maximum {max} at {maxAt}, {trend}.',
  seriesSingle: '{series}: {value} at {at}.',
  seriesEmpty: '{series}: no values.',
  trendUp: 'trending up from {first} to {last}',
  trendDown: 'trending down from {first} to {last}',
  trendFlat: 'no overall change ({first})',
  hidden: 'Hidden: {list}.',
  missing: '{missing}.',
  roleLine: 'line chart',
  roleArea: 'area chart',
  roleBar: 'bar chart',
  roleColumn: 'column chart',
  rolePie: 'pie chart',
  roleDonut: 'donut chart',
  sliceSummary: '{label}: {value} ({percent})',
  pieIntro: '{type}, {slices}. Total: {total}.',
  notPlotted: 'Not plotted (negative or missing): {list}.',
  notPlottedValue: '{value} (not plotted)',
});

export function chartMessage(key: string, params: Readonly<Record<string, string | number>>, locale: string): string {
  return getMessage('chart', key, params, locale);
}

/** Pluralized message: `<key>_<Intl.PluralRules category>`, falling back to `<key>_other`. */
export function chartPlural(key: string, count: number, locale: string, params: Readonly<Record<string, string | number>> = {}): string {
  const rule = new Intl.PluralRules(locale).select(count);
  const all = { ...params, count: formatNumber(count, {}, locale) };
  try {
    return getMessage('chart', `${key}_${rule}`, all, locale);
  } catch {
    return getMessage('chart', `${key}_other`, all, locale);
  }
}

/** Copy only the defined `keys` of `o` (instance options passed to config.resolve). */
export function pickDefined<T extends object, K extends keyof T>(o: T, keys: readonly K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    const value = o[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function chartFail(code: string, component: string, property: string, expected: string): never {
  throw configurationError(code, 'Invalid chart options.', { component, property: `${component}.${property}`, expected });
}

/** Finite number, or null for gaps (null, undefined, NaN, infinities). */
export function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const COLORS: readonly unknown[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** `undefined` or a palette slot 1-8. */
export function isChartColor(value: unknown): value is ChartColor | undefined {
  return value === undefined || COLORS.includes(value);
}

/** Validate options shared by Line, Bar, and Pie charts. */
export function assertCommon(o: ChartCommonOptions, component: string, code: string): void {
  if (typeof o.label !== 'string' || o.label.trim() === '') chartFail(code, component, 'label', 'non-empty string');
  for (const key of ['description', 'summary'] as const) {
    const v = o[key];
    if (v !== undefined && typeof v !== 'string') chartFail(code, component, key, 'string');
  }
  if (o.hideLabel !== undefined && typeof o.hideLabel !== 'boolean') chartFail(code, component, 'hideLabel', 'boolean');
  if (o.formatValue !== undefined && typeof o.formatValue !== 'function') chartFail(code, component, 'formatValue', '(value: number) => string');
  if (o.valueFormat !== undefined && !validators.isRecord(o.valueFormat)) chartFail(code, component, 'valueFormat', 'Intl.NumberFormatOptions');
  if (o.hiddenSeries !== undefined && (!Array.isArray(o.hiddenSeries) || o.hiddenSeries.some((id) => typeof id !== 'string'))) chartFail(code, component, 'hiddenSeries', 'string[]');
  assertTheme(o.theme, component, code);
  assertInteraction(o, component, code);
}

/** Validate a series list: unique non-empty ids, labels, value arrays, palette slots. */
export function assertSeries(series: unknown, component: string, code: string): void {
  if (!Array.isArray(series)) chartFail(code, component, 'series', 'ChartSeries[]');
  const ids = new Set<string>();
  series.forEach((s: unknown, i) => {
    const at = `series[${String(i)}]`;
    if (!validators.isRecord(s)) chartFail(code, component, at, 'ChartSeries');
    const { id, label, values } = s;
    if (typeof id !== 'string' || id === '' || ids.has(id)) chartFail(code, component, `${at}.id`, 'unique non-empty string');
    ids.add(id);
    if (typeof label !== 'string') chartFail(code, component, `${at}.label`, 'string');
    if (!Array.isArray(values) || values.some((v: unknown) => v !== null && typeof v !== 'number')) chartFail(code, component, `${at}.values`, '(number | null)[]');
    if (!isChartColor(s.color)) chartFail(code, component, `${at}.color`, 'integer 1-8');
    assertSeriesStyle(s.style, at, component, code);
  });
}

/** Palette slot (1-8) for a series at `position`. */
export function colorSlot(color: ChartColor | undefined, position: number): number {
  return color ?? (position % 8) + 1;
}

/** Formats values for tooltips, labels, the data table, and the summary. */
export function valueFormatter(o: Pick<ChartCommonOptions, 'valueFormat' | 'formatValue'>, locale: string): (value: number) => string {
  const custom = o.formatValue;
  if (custom) return (v) => custom(v);
  // One formatter per render: charts format thousands of values (SPEC section 15).
  const nf = new Intl.NumberFormat(locale, o.valueFormat ?? {});
  return (v) => nf.format(v);
}

/** Fill `{name}` placeholders of a message template resolved once (hot paths). */
export function fillTemplate(template: string, params: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}

/** Formats axis ticks with exactly the fraction digits the tick step needs. */
export function tickFormatter(o: Pick<ChartCommonOptions, 'valueFormat'>, decimals: number, locale: string): (value: number) => string {
  const base = o.valueFormat ?? {};
  const digits = Math.min(20, Math.max(0, base.style === 'percent' ? decimals - 2 : decimals));
  const options: Intl.NumberFormatOptions = base.notation === 'compact' ? base : { ...base, minimumFractionDigits: digits, maximumFractionDigits: digits };
  const nf = new Intl.NumberFormat(locale, options);
  return (v) => nf.format(v);
}

export interface SeriesStats {
  readonly count: number;
  readonly missing: number;
  readonly min: number;
  readonly max: number;
  readonly minIndex: number;
  readonly maxIndex: number;
  readonly first: number;
  readonly last: number;
}

/** Statistics over finite values; `null` when a series has none. */
export function seriesStats(values: readonly (number | null)[], length = values.length): SeriesStats | null {
  let count = 0;
  let min = Infinity;
  let max = -Infinity;
  let minIndex = -1;
  let maxIndex = -1;
  let first = 0;
  let last = 0;
  for (let i = 0; i < length; i++) {
    const v = finite(values[i]);
    if (v === null) continue;
    if (count === 0) first = v;
    last = v;
    count++;
    if (v < min) {
      min = v;
      minIndex = i;
    }
    if (v > max) {
      max = v;
      maxIndex = i;
    }
  }
  if (count === 0) return null;
  return { count, missing: length - count, min, max, minIndex, maxIndex, first, last };
}

export interface SummaryInput {
  readonly type: string;
  readonly locale: string;
  readonly series: readonly { readonly label: string; readonly values: readonly (number | null)[]; readonly hidden: boolean }[];
  readonly length: number;
  readonly lengthKey: 'pointCount' | 'categoryCount';
  readonly xAxis: string;
  readonly xFrom: string;
  readonly xTo: string;
  readonly yAxis: string;
  readonly yFrom: string;
  readonly yTo: string;
  readonly xLabel: (index: number) => string;
  readonly format: (value: number) => string;
}

/** Generated description: type and size, axis ranges, per-series extremes and trend, hidden series. */
export function cartesianSummary(s: SummaryInput): string {
  const { locale } = s;
  const parts = [
    chartMessage('intro', { type: s.type, series: chartPlural('seriesCount', s.series.length, locale), points: chartPlural(s.lengthKey, s.length, locale) }, locale),
  ];
  if (s.length > 0) {
    parts.push(chartMessage('range', { axis: s.xAxis, from: s.xFrom, to: s.xTo }, locale));
    parts.push(chartMessage('range', { axis: s.yAxis, from: s.yFrom, to: s.yTo }, locale));
  }
  let missing = 0;
  for (const series of s.series) {
    const sentence = seriesSentence(series.label, series.values, s.length, s.xLabel, s.format, locale);
    parts.push(sentence.text);
    missing += sentence.missing;
  }
  if (missing > 0 && s.length > 0) parts.push(chartMessage('missing', { missing: chartPlural('missingCount', missing, locale) }, locale));
  const hidden = s.series.filter((x) => x.hidden).map((x) => x.label);
  if (hidden.length) parts.push(chartMessage('hidden', { list: listFormat(hidden, locale) }, locale));
  return parts.join(' ');
}

/** Per-series sentence of the generated summary (extremes and trend), and its missing-value count. */
export function seriesSentence(label: string, values: readonly (number | null)[], length: number, xLabel: (index: number) => string, format: (value: number) => string, locale: string): { text: string; missing: number } {
  const stats = seriesStats(values, length);
  if (!stats) return { text: chartMessage('seriesEmpty', { series: label }, locale), missing: length };
  if (stats.count === 1) return { text: chartMessage('seriesSingle', { series: label, value: format(stats.first), at: xLabel(stats.minIndex) }, locale), missing: stats.missing };
  const trendKey = stats.last > stats.first ? 'trendUp' : stats.last < stats.first ? 'trendDown' : 'trendFlat';
  return {
    text: chartMessage('seriesStats', {
      series: label,
      min: format(stats.min),
      minAt: xLabel(stats.minIndex),
      max: format(stats.max),
      maxAt: xLabel(stats.maxIndex),
      trend: chartMessage(trendKey, { first: format(stats.first), last: format(stats.last) }, locale),
    }, locale),
    missing: stats.missing,
  };
}

export function listFormat(items: readonly string[], locale: string): string {
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(items);
}
