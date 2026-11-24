/**
 * @absoluteui/components/dashboard/widgets (R18-4): built-in widget types on top of existing components.
 * A separate entry point so dashboards only bundle the components they use: import the types you need,
 * or call `registerBuiltInWidgets()` for all of them.
 */
import { BarChart, type BarChartOptions } from '../../bar-chart/bar-chart.js';
import { BulletChart, type BulletChartOptions } from '../../bullet-chart/bullet-chart.js';
import { DataTable } from '../../data-table/data-table.js';
import type { DataTableOptions } from '../../data-table/options.js';
import type { DataTableColumn, DataTableColumnType } from '../../data-table/model.js';
import { Gauge, type GaugeBand, type GaugeOptions } from '../../gauge/gauge.js';
import { LineChart, type LineChartOptions } from '../../line-chart/line-chart.js';
import { PieChart, type PieChartOptions } from '../../pie-chart/pie-chart.js';
import { ProgressBar, type ProgressBarOptions } from '../../progress-bar/progress-bar.js';
import { Sparkline, type SparklineOptions } from '../../sparkline/sparkline.js';
import { StatCard, type StatCardOptions } from '../../stat-card/stat-card.js';
import type { ChartSeries } from '../../internal/chart/model.js';
import type { JsonObject } from '../definition.js';
import { defaultWidgetRegistry, type WidgetContext, type WidgetData, type WidgetInstance, type WidgetRegistry, type WidgetType } from '../registry.js';
import { field, OptionReader, rowsOf, toNumber, toText } from './options.js';

type Color = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
const TONES = ['neutral', 'info', 'success', 'warning', 'danger'] as const;
type Tone = (typeof TONES)[number];

/* ------------------------------------------------------------------ thresholds (S5) */

interface Threshold {
  readonly above?: number;
  readonly below?: number;
  readonly tone: Tone;
}

function readThresholds(r: OptionReader): Threshold[] | undefined {
  return r.list(
    'thresholds',
    (t) => {
      const tone = t.oneOf('tone', TONES);
      const above = t.number('above');
      const below = t.number('below');
      if (tone === undefined) {
        if (t.raw('tone') === undefined) t.issues.push({ path: '/tone', expected: `one of: ${TONES.join(', ')}` });
        return undefined;
      }
      if (above === undefined && below === undefined) {
        t.issues.push({ path: '/above', expected: 'above or below' });
        return undefined;
      }
      const out: { above?: number; below?: number; tone: Tone } = { tone };
      if (above !== undefined) out.above = above;
      if (below !== undefined) out.below = below;
      return out;
    },
    ['above', 'below', 'tone'],
    10,
  );
}

/** The first matching threshold wins: `above` is exclusive, `below` is exclusive. */
export function toneFor(value: number | null, thresholds: readonly Threshold[] | undefined): Tone | null {
  if (value === null) return null;
  for (const t of thresholds ?? []) {
    if ((t.above === undefined || value > t.above) && (t.below === undefined || value < t.below)) return t.tone;
  }
  return null;
}

function setTone(context: WidgetContext, tone: Tone | null): void {
  const host = context.body.closest<HTMLElement>('.aui-dashboard-widget');
  if (!host) return;
  if (tone === null) delete host.dataset.auiTone;
  else host.dataset.auiTone = tone;
}

/* ------------------------------------------------------------------ helpers */

function mount(context: WidgetContext, className: string): HTMLDivElement {
  const el = context.body.ownerDocument.createElement('div');
  el.className = className;
  context.body.replaceChildren(el);
  return el;
}

/** Creates the component on first update and calls its update() afterwards. */
const CHART_MIN = 120;
const CHART_MAX = 2000;
const CHART_DEFAULT = 300;

/**
 * Creates the component on first update and calls its update() afterwards. With `fit`, the chart's
 * plot height follows the widget body (its legend, labels, and table toggle are measured and subtracted),
 * so charts fill the widget without overflowing it, and resizing the widget resizes the chart.
 */
function lazy<O extends object>(context: WidgetContext, className: string, create: (host: HTMLElement, options: O) => { update(o: O): void; destroy(): void }, build: (d: WidgetData) => O, fit = false): WidgetInstance {
  let component: { update(o: O): void; destroy(): void } | null = null;
  let host: HTMLDivElement | null = null;
  let options: O | null = null;
  let height = CHART_DEFAULT;
  let observer: ResizeObserver | null = null;
  const sized = (o: O): O => (fit ? { ...o, height } : o);
  /** One or two measuring passes: the plot gets the body height minus everything else the chart draws. */
  const fitHeight = (pass = 0): void => {
    if (!fit || !component || !host || !options || pass > 1) return;
    const available = context.body.clientHeight;
    if (available <= 0) return;
    const extra = Math.max(0, host.scrollHeight - height);
    const next = Math.round(Math.min(CHART_MAX, Math.max(CHART_MIN, available - extra)));
    if (Math.abs(next - height) < 2) return;
    height = next;
    component.update(sized(options));
    fitHeight(pass + 1);
  };
  return {
    update(d) {
      options = build(d);
      if (component) component.update(sized(options));
      else {
        host = mount(context, className);
        component = create(host, sized(options));
        if (fit && typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => {
            fitHeight();
          });
          observer.observe(context.body);
        }
      }
      fitHeight();
    },
    destroy() {
      observer?.disconnect();
      observer = null;
      component?.destroy();
      component = null;
      host = null;
      context.body.replaceChildren();
    },
  };
}

function seriesSpec(r: OptionReader): { field: string; label: string; color?: Color }[] | undefined {
  return r.list(
    'series',
    (s) => {
      const f = s.string('field', 128, true);
      const label = s.string('label', 200) ?? f;
      const color = s.color('color');
      if (f === undefined || label === undefined) return undefined;
      return color === undefined ? { field: f, label } : { field: f, label, color };
    },
    ['field', 'label', 'color'],
    8,
    true,
  );
}

function seriesFrom(rows: readonly Readonly<Record<string, unknown>>[], spec: readonly { field: string; label: string; color?: Color }[]): ChartSeries[] {
  return spec.map((s, i) => {
    const out: ChartSeries = { id: `s${String(i)}-${s.field}`, label: s.label, values: rows.map((row) => toNumber(field(row, s.field))) };
    if (s.color !== undefined) out.color = s.color;
    return out;
  });
}

function withFormat<T extends object>(target: T, format: Intl.NumberFormatOptions | undefined): T {
  return format === undefined ? target : { ...target, valueFormat: format };
}

/* ------------------------------------------------------------------ KPI */

const KPI_KEYS = ['format', 'comparisonLabel', 'description', 'trendColor', 'thresholds', 'deltaMode'];

export const kpiWidget: WidgetType = {
  label: 'KPI',
  description: 'One number with change and trend (Stat Card).',
  category: 'Metrics',
  defaultSize: { w: 3, h: 2 },
  inputs: [
    { name: 'value', label: 'Value', kind: 'number', required: true },
    { name: 'previous', label: 'Previous value', kind: 'number' },
    { name: 'delta', label: 'Change', kind: 'number' },
    { name: 'trend', label: 'Trend values', kind: 'numbers' },
  ],
  optionFields: [
    { name: 'comparisonLabel', label: 'Comparison label', kind: 'text' },
    { name: 'description', label: 'Description', kind: 'text' },
  ],
  checkOptions(options) {
    const r = new OptionReader(options, KPI_KEYS);
    r.format();
    r.string('comparisonLabel');
    r.string('description', 500);
    r.color('trendColor');
    readThresholds(r);
    return r.issues;
  },
  create(context) {
    return lazy(context, 'aui-dashboard-kpi', (h, o: StatCardOptions) => StatCard.create(h, o), (d) => {
      const r = new OptionReader(d.options, KPI_KEYS);
      const raw = d.inputs.value;
      const value = typeof raw === 'string' && toNumber(raw) === null ? raw : toNumber(raw);
      setTone(context, toneFor(typeof value === 'number' ? value : null, readThresholds(r)));
      const o: StatCardOptions = { label: context.definition.title, value };
      const format = r.format();
      if (format) o.valueFormat = format;
      const previous = toNumber(d.inputs.previous);
      if (previous !== null) o.previous = previous;
      const delta = toNumber(d.inputs.delta);
      if (delta !== null) o.delta = delta;
      const trend = d.inputs.trend;
      if (Array.isArray(trend)) o.trend = trend.map(toNumber);
      const comparison = r.string('comparisonLabel');
      if (comparison) o.comparisonLabel = comparison;
      const description = r.string('description', 500);
      if (description) o.description = description;
      const color = r.color('trendColor');
      if (color) o.trendColor = color;
      return o;
    });
  },
};

/* ------------------------------------------------------------------ line and bar */

const LINE_KEYS = ['x', 'series', 'area', 'format', 'hideLabel'];

export const lineChartWidget: WidgetType = {
  label: 'Line chart',
  description: 'Trends over a category or time field.',
  category: 'Charts',
  defaultSize: { w: 6, h: 4 },
  inputs: [{ name: 'rows', label: 'Rows', kind: 'rows' }],
  optionFields: [
    { name: 'x', label: 'X field', kind: 'field' },
    { name: 'series', label: 'Value fields', kind: 'fields' },
    { name: 'area', label: 'Area', kind: 'boolean' },
  ],
  checkOptions(options) {
    const r = new OptionReader(options, LINE_KEYS);
    r.string('x', 128, true);
    seriesSpec(r);
    r.boolean('area');
    r.boolean('hideLabel');
    r.format();
    return r.issues;
  },
  create(context) {
    return lazy(context, 'aui-dashboard-chart', (h, o: LineChartOptions) => LineChart.create(h, o), (d) => {
      const r = new OptionReader(d.options, LINE_KEYS);
      const rows = rowsOf(d.data, d.inputs);
      const x = r.string('x', 128, true) ?? '';
      return withFormat<LineChartOptions>({ label: context.definition.title, hideLabel: r.boolean('hideLabel') ?? true, x: rows.map((row) => toText(field(row, x))), series: seriesFrom(rows, seriesSpec(r) ?? []), area: r.boolean('area') ?? false }, r.format());
    }, true);
  },
};

const BAR_KEYS = ['category', 'series', 'orientation', 'layout', 'format', 'hideLabel'];

export const barChartWidget: WidgetType = {
  label: 'Bar chart',
  description: 'Compare values across categories.',
  category: 'Charts',
  defaultSize: { w: 6, h: 4 },
  inputs: [{ name: 'rows', label: 'Rows', kind: 'rows' }],
  optionFields: [
    { name: 'category', label: 'Category field', kind: 'field' },
    { name: 'series', label: 'Value fields', kind: 'fields' },
    { name: 'orientation', label: 'Orientation', kind: 'enum', values: ['vertical', 'horizontal'] },
    { name: 'layout', label: 'Layout', kind: 'enum', values: ['grouped', 'stacked'] },
  ],
  checkOptions(options) {
    const r = new OptionReader(options, BAR_KEYS);
    r.string('category', 128, true);
    seriesSpec(r);
    r.oneOf('orientation', ['vertical', 'horizontal'] as const);
    r.oneOf('layout', ['grouped', 'stacked'] as const);
    r.boolean('hideLabel');
    r.format();
    return r.issues;
  },
  create(context) {
    return lazy(context, 'aui-dashboard-chart', (h, o: BarChartOptions) => BarChart.create(h, o), (d) => {
      const r = new OptionReader(d.options, BAR_KEYS);
      const rows = rowsOf(d.data, d.inputs);
      const category = r.string('category', 128, true) ?? '';
      return withFormat<BarChartOptions>(
        {
          label: context.definition.title,
          hideLabel: r.boolean('hideLabel') ?? true,
          categories: rows.map((row) => toText(field(row, category))),
          series: seriesFrom(rows, seriesSpec(r) ?? []),
          orientation: r.oneOf('orientation', ['vertical', 'horizontal'] as const) ?? 'vertical',
          layout: r.oneOf('layout', ['grouped', 'stacked'] as const) ?? 'grouped',
        },
        r.format(),
      );
    }, true);
  },
};

/* ------------------------------------------------------------------ pie */

const PIE_KEYS = ['label', 'value', 'donut', 'format', 'hideLabel'];

export const pieChartWidget: WidgetType = {
  label: 'Pie chart',
  description: 'Parts of a whole.',
  category: 'Charts',
  defaultSize: { w: 4, h: 4 },
  inputs: [{ name: 'rows', label: 'Rows', kind: 'rows' }],
  optionFields: [
    { name: 'label', label: 'Label field', kind: 'field' },
    { name: 'value', label: 'Value field', kind: 'field' },
    { name: 'donut', label: 'Donut', kind: 'boolean' },
  ],
  checkOptions(options) {
    const r = new OptionReader(options, PIE_KEYS);
    r.string('label', 128, true);
    r.string('value', 128, true);
    r.boolean('donut');
    r.boolean('hideLabel');
    r.format();
    return r.issues;
  },
  create(context) {
    return lazy(context, 'aui-dashboard-chart', (h, o: PieChartOptions) => PieChart.create(h, o), (d) => {
      const r = new OptionReader(d.options, PIE_KEYS);
      const rows = rowsOf(d.data, d.inputs);
      const label = r.string('label', 128, true) ?? '';
      const value = r.string('value', 128, true) ?? '';
      return withFormat<PieChartOptions>({ label: context.definition.title, hideLabel: r.boolean('hideLabel') ?? true, donut: r.boolean('donut') ?? false, slices: rows.map((row, i) => ({ id: `p${String(i)}`, label: toText(field(row, label)), value: toNumber(field(row, value)) })) }, r.format());
    }, true);
  },
};

/* ------------------------------------------------------------------ gauge */

const GAUGE_KEYS = ['min', 'max', 'target', 'bands', 'format', 'hideLabel'];

function gaugeBands(r: OptionReader): GaugeBand[] | undefined {
  return r.list(
    'bands',
    (b) => {
      const to = b.number('to', true);
      const label = b.string('label', 100, true);
      const color = b.color('color');
      if (to === undefined || label === undefined) return undefined;
      const band: GaugeBand = { to, label };
      if (color !== undefined) band.color = color;
      return band;
    },
    ['to', 'label', 'color'],
    8,
  );
}

export const gaugeWidget: WidgetType = {
  label: 'Gauge',
  description: 'One value on a scale with bands and a target.',
  category: 'Metrics',
  defaultSize: { w: 3, h: 3 },
  inputs: [{ name: 'value', label: 'Value', kind: 'number', required: true }],
  optionFields: [
    { name: 'min', label: 'Minimum', kind: 'number' },
    { name: 'max', label: 'Maximum', kind: 'number' },
    { name: 'target', label: 'Target', kind: 'number' },
  ],
  checkOptions(options) {
    const r = new OptionReader(options, GAUGE_KEYS);
    const min = r.number('min');
    const max = r.number('max');
    if (min !== undefined && max !== undefined && min >= max) r.issues.push({ path: '/max', expected: 'max greater than min' });
    r.number('target');
    gaugeBands(r);
    r.boolean('hideLabel');
    r.format();
    return r.issues;
  },
  create(context) {
    return lazy(context, 'aui-dashboard-gauge', (h, o: GaugeOptions) => Gauge.create(h, o), (d) => {
      const r = new OptionReader(d.options, GAUGE_KEYS);
      const o: GaugeOptions = { label: context.definition.title, hideLabel: r.boolean('hideLabel') ?? true, value: toNumber(d.inputs.value) };
      const min = r.number('min');
      const max = r.number('max');
      const target = r.number('target');
      const bands = gaugeBands(r);
      const format = r.format();
      if (min !== undefined) o.min = min;
      if (max !== undefined) o.max = max;
      if (target !== undefined) o.target = target;
      if (bands && bands.length > 0) o.bands = bands;
      if (format) o.valueFormat = format;
      return o;
    });
  },
};

/* ------------------------------------------------------------------ sparkline */

const SPARK_KEYS = ['field', 'variant', 'color', 'format'];

export const sparklineWidget: WidgetType = {
  label: 'Sparkline',
  description: 'A compact trend line or bars.',
  category: 'Metrics',
  defaultSize: { w: 3, h: 2 },
  inputs: [
    { name: 'values', label: 'Values', kind: 'numbers' },
    { name: 'rows', label: 'Rows', kind: 'rows' },
  ],
  optionFields: [
    { name: 'field', label: 'Value field (with rows)', kind: 'field' },
    { name: 'variant', label: 'Variant', kind: 'enum', values: ['line', 'bar'] },
  ],
  checkOptions(options) {
    const r = new OptionReader(options, SPARK_KEYS);
    r.string('field', 128);
    r.oneOf('variant', ['line', 'bar'] as const);
    r.color('color');
    r.format();
    return r.issues;
  },
  create(context) {
    return lazy(context, 'aui-dashboard-sparkline', (h, o: SparklineOptions) => Sparkline.create(h, o), (d) => {
      const r = new OptionReader(d.options, SPARK_KEYS);
      const f = r.string('field', 128);
      const direct = d.inputs.values;
      const values = Array.isArray(direct) ? direct.map(toNumber) : f !== undefined ? rowsOf(d.data, d.inputs).map((row) => toNumber(field(row, f))) : Array.isArray(d.data) ? d.data.map(toNumber) : [];
      const o: SparklineOptions = { label: context.definition.title, values, variant: r.oneOf('variant', ['line', 'bar'] as const) ?? 'line' };
      const color = r.color('color');
      const format = r.format();
      if (color) o.color = color;
      if (format) o.valueFormat = format;
      return o;
    });
  },
};

/* ------------------------------------------------------------------ bullet */

const BULLET_KEYS = ['label', 'value', 'target', 'format', 'hideLabel'];

export const bulletChartWidget: WidgetType = {
  label: 'Bullet chart',
  description: 'Measures against targets.',
  category: 'Charts',
  defaultSize: { w: 6, h: 3 },
  inputs: [{ name: 'rows', label: 'Rows', kind: 'rows' }],
  optionFields: [
    { name: 'label', label: 'Label field', kind: 'field' },
    { name: 'value', label: 'Value field', kind: 'field' },
    { name: 'target', label: 'Target field', kind: 'field' },
  ],
  checkOptions(options) {
    const r = new OptionReader(options, BULLET_KEYS);
    r.string('label', 128, true);
    r.string('value', 128, true);
    r.string('target', 128);
    r.boolean('hideLabel');
    r.format();
    return r.issues;
  },
  create(context) {
    return lazy(context, 'aui-dashboard-chart', (h, o: BulletChartOptions) => BulletChart.create(h, o), (d) => {
      const r = new OptionReader(d.options, BULLET_KEYS);
      const rows = rowsOf(d.data, d.inputs);
      const label = r.string('label', 128, true) ?? '';
      const value = r.string('value', 128, true) ?? '';
      const target = r.string('target', 128);
      return withFormat<BulletChartOptions>(
        {
          label: context.definition.title,
          hideLabel: r.boolean('hideLabel') ?? true,
          measures: rows.map((row, i) => {
            const t = target === undefined ? null : toNumber(field(row, target));
            return t === null ? { id: `m${String(i)}`, label: toText(field(row, label)), value: toNumber(field(row, value)) } : { id: `m${String(i)}`, label: toText(field(row, label)), value: toNumber(field(row, value)), target: t };
          }),
        },
        r.format(),
      );
    }, true);
  },
};

/* ------------------------------------------------------------------ table */

const TABLE_KEYS = ['columns', 'pageSize', 'searchable', 'selectable'];
const COLUMN_TYPES = ['text', 'number', 'currency', 'date', 'datetime', 'boolean'] as const;

interface ColumnSpec {
  field: string;
  header: string;
  type?: DataTableColumnType;
  currency?: string;
}

function columnSpecs(r: OptionReader): ColumnSpec[] | undefined {
  return r.list(
    'columns',
    (c) => {
      const f = c.string('field', 128, true);
      const header = c.string('header', 200) ?? f;
      const type = c.oneOf('type', COLUMN_TYPES);
      const currency = c.string('currency', 3);
      if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) c.issues.push({ path: '/currency', expected: 'ISO 4217 code such as EUR' });
      if (f === undefined || header === undefined) return undefined;
      const spec: ColumnSpec = { field: f, header };
      if (type) spec.type = type;
      if (currency) spec.currency = currency;
      return spec;
    },
    ['field', 'header', 'type', 'currency'],
    30,
  );
}

type TableRow = Readonly<Record<string, unknown>>;

export const tableWidget: WidgetType = {
  label: 'Table',
  description: 'Rows and columns with sorting and paging (Data Table).',
  category: 'Data',
  defaultSize: { w: 6, h: 5 },
  inputs: [{ name: 'rows', label: 'Rows', kind: 'rows' }],
  optionFields: [
    { name: 'columns', label: 'Columns', kind: 'fields' },
    { name: 'searchable', label: 'Search box', kind: 'boolean' },
  ],
  checkOptions(options) {
    const r = new OptionReader(options, TABLE_KEYS);
    columnSpecs(r);
    const size = r.number('pageSize');
    if (size !== undefined && (!Number.isInteger(size) || size < 5 || size > 200)) r.issues.push({ path: '/pageSize', expected: 'integer from 5 to 200' });
    r.boolean('searchable');
    r.boolean('selectable');
    return r.issues;
  },
  create(context) {
    const ids = new WeakMap<object, string>();
    let rows: readonly TableRow[] = [];
    let table: DataTable<TableRow> | null = null;
    const build = (d: WidgetData): DataTableOptions<TableRow> => {
      const r = new OptionReader(d.options, TABLE_KEYS);
      rows = rowsOf(d.data, d.inputs);
      rows.forEach((row, i) => ids.set(row, String(i)));
      const specs: ColumnSpec[] = columnSpecs(r) ?? Object.keys(rows[0] ?? {}).slice(0, 12).map((f) => ({ field: f, header: f }));
      const columns: DataTableColumn<TableRow>[] = specs.map((s, i) => {
        const col: DataTableColumn<TableRow> = { id: `c${String(i)}`, header: s.header, accessor: (row) => field(row, s.field), sortable: true };
        if (s.type) col.type = s.type;
        if (s.currency) col.currency = s.currency;
        return col;
      });
      const size = r.number('pageSize') ?? 10;
      const o: DataTableOptions<TableRow> = { caption: context.definition.title, hideCaption: true, columns, rows, rowId: (row) => ids.get(row) ?? '', pageSize: size };
      if (r.boolean('searchable') === true) o.searchable = true;
      if (r.boolean('selectable') === true) o.selection = 'single';
      return o;
    };
    return {
      update(d) {
        const o = build(d);
        if (table) table.update(o);
        else {
          const host = mount(context, 'aui-dashboard-table');
          table = DataTable.create(host, o);
          host.addEventListener('aui-selection-change', (e) => {
            const detail = (e as CustomEvent<{ selected?: readonly string[] }>).detail;
            const id = detail.selected?.[0];
            const row = rows.find((r) => ids.get(r) === id);
            if (row) context.select(JSON.parse(JSON.stringify(row)) as JsonObject);
          });
        }
      },
      destroy() {
        table?.destroy();
        table = null;
        context.body.replaceChildren();
      },
    };
  },
};

/* ------------------------------------------------------------------ list */

const LIST_KEYS = ['label', 'value', 'format', 'selectable'];

export const listWidget: WidgetType = {
  label: 'List',
  description: 'Ranked label and value pairs.',
  category: 'Data',
  defaultSize: { w: 3, h: 4 },
  inputs: [{ name: 'rows', label: 'Rows', kind: 'rows' }],
  optionFields: [
    { name: 'label', label: 'Label field', kind: 'field' },
    { name: 'value', label: 'Value field', kind: 'field' },
  ],
  checkOptions(options) {
    const r = new OptionReader(options, LIST_KEYS);
    r.string('label', 128, true);
    r.string('value', 128);
    r.format();
    r.boolean('selectable');
    return r.issues;
  },
  create(context) {
    return {
      update(d) {
        const r = new OptionReader(d.options, LIST_KEYS);
        const doc = context.body.ownerDocument;
        const label = r.string('label', 128, true) ?? '';
        const value = r.string('value', 128);
        const nf = new Intl.NumberFormat(context.locale, r.format() ?? {});
        const selectable = r.boolean('selectable') === true;
        const list = doc.createElement('ol');
        list.className = 'aui-dashboard-list';
        for (const row of rowsOf(d.data, d.inputs).slice(0, 100)) {
          const item = doc.createElement('li');
          item.className = 'aui-dashboard-list__item';
          const name = doc.createElement(selectable ? 'button' : 'span');
          name.className = 'aui-dashboard-list__label';
          name.textContent = toText(field(row, label));
          if (name instanceof HTMLButtonElement) {
            name.type = 'button';
            name.addEventListener('click', () => {
              context.select(JSON.parse(JSON.stringify(row)) as JsonObject);
            });
          }
          item.append(name);
          if (value !== undefined) {
            const v = doc.createElement('span');
            v.className = 'aui-dashboard-list__value';
            const n = toNumber(field(row, value));
            v.textContent = n === null ? toText(field(row, value)) : nf.format(n);
            item.append(v);
          }
          list.append(item);
        }
        context.body.replaceChildren(list);
      },
      destroy() {
        context.body.replaceChildren();
      },
    };
  },
};

/* ------------------------------------------------------------------ progress */

const PROGRESS_KEYS = ['min', 'max', 'tone', 'description', 'thresholds'];
const PROGRESS_TONES = ['default', 'success', 'warning', 'error'] as const;

export const progressWidget: WidgetType = {
  label: 'Progress',
  description: 'Progress toward a goal (Progress Bar).',
  category: 'Metrics',
  defaultSize: { w: 3, h: 2 },
  inputs: [{ name: 'value', label: 'Value', kind: 'number', required: true }],
  optionFields: [
    { name: 'max', label: 'Goal', kind: 'number' },
    { name: 'description', label: 'Description', kind: 'text' },
  ],
  checkOptions(options) {
    const r = new OptionReader(options, PROGRESS_KEYS);
    const min = r.number('min');
    const max = r.number('max');
    if (min !== undefined && max !== undefined && min >= max) r.issues.push({ path: '/max', expected: 'max greater than min' });
    r.oneOf('tone', PROGRESS_TONES);
    r.string('description', 500);
    readThresholds(r);
    return r.issues;
  },
  create(context) {
    return lazy(context, 'aui-dashboard-progress', (h, o: ProgressBarOptions) => ProgressBar.create(h, o), (d) => {
      const r = new OptionReader(d.options, PROGRESS_KEYS);
      const value = toNumber(d.inputs.value);
      setTone(context, toneFor(value, readThresholds(r)));
      const o: ProgressBarOptions = { label: context.definition.title, value, tone: r.oneOf('tone', PROGRESS_TONES) ?? 'default' };
      const min = r.number('min');
      const max = r.number('max');
      const description = r.string('description', 500);
      if (min !== undefined) o.min = min;
      if (max !== undefined) o.max = max;
      if (description) o.description = description;
      return o;
    });
  },
};

/* ------------------------------------------------------------------ text */

export const textWidget: WidgetType = {
  label: 'Text',
  description: 'Plain text notes (no HTML).',
  category: 'Content',
  defaultSize: { w: 4, h: 2 },
  optionFields: [{ name: 'text', label: 'Text', kind: 'text' }],
  checkOptions(options) {
    const r = new OptionReader(options, ['text']);
    r.string('text', 2000, true);
    return r.issues;
  },
  create(context) {
    return {
      update(d) {
        const text = typeof d.options.text === 'string' ? d.options.text : '';
        const doc = context.body.ownerDocument;
        const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim() !== '').map((p) => {
          const el = doc.createElement('p');
          el.className = 'aui-dashboard-text';
          el.textContent = p;
          return el;
        });
        context.body.replaceChildren(...paragraphs);
      },
      destroy() {
        context.body.replaceChildren();
      },
    };
  },
};

/** Every built-in type by its registered name. */
export const builtInWidgets: Readonly<Record<string, WidgetType>> = Object.freeze({
  kpi: kpiWidget,
  'line-chart': lineChartWidget,
  'bar-chart': barChartWidget,
  'pie-chart': pieChartWidget,
  gauge: gaugeWidget,
  sparkline: sparklineWidget,
  'bullet-chart': bulletChartWidget,
  table: tableWidget,
  list: listWidget,
  progress: progressWidget,
  text: textWidget,
});

/** Registers every built-in widget type (default registry unless one is given). */
export function registerBuiltInWidgets(registry: WidgetRegistry = defaultWidgetRegistry): void {
  for (const [name, type] of Object.entries(builtInWidgets)) registry.register(name, type);
}

export type { JsonObject };
