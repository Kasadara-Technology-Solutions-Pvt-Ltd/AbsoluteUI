/**
 * @absoluteui/components/data-grid/charts (R11-19): charts for the Data Grid, outside the core
 * bundle, drawn by AbsoluteUI chart components (R11-8). Sparklines in cells, range charts, and pivot charts.
 */
import { formatNumber, getMessage, onNodeRelease, registerMessages } from '@absoluteui/core';
import { BarChart, type BarChartOptions } from '../../bar-chart/bar-chart.js';
import { LineChart, type LineChartOptions } from '../../line-chart/line-chart.js';
import { PieChart, type PieChartOptions } from '../../pie-chart/pie-chart.js';
import type { DataGrid } from '../data-grid.js';
import { Sparkline, type SparklineColor, type SparklineVariant } from '../../sparkline/sparkline.js';
import type { DataGridColumn } from '../model.js';
import { fail } from '../model.js';

export interface SparklineColumnOptions<Row> {
  /** The numbers of a row (null for gaps). */
  readonly values: (row: Row) => readonly (number | null)[];
  /** What the values are, per row or for every row ("Sales, last 12 months"): the start of each cell's accessible name. */
  readonly label: string | ((row: Row) => string);
  /** Default `line`. */
  readonly variant?: SparklineVariant;
  /** Palette slot 1-8. Default 1. */
  readonly color?: SparklineColor;
  /** A shared domain makes the rows comparable (default: each row's own range). */
  readonly min?: number;
  readonly max?: number;
  readonly valueFormat?: Intl.NumberFormatOptions;
  /** What sorting compares: the last value (default), the sum, the minimum, or the maximum. */
  readonly sortBy?: 'last' | 'sum' | 'min' | 'max';
  /** Locale of the value text (default `en-US`; pass the grid's locale). */
  readonly locale?: string;
}

const numbersOf = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : []);

/**
 * Column options drawing a Sparkline in each cell (spread them into a column with its `id` and `header`).
 * The cell reads its values out ("Sales, last 12 months: 12 values, from 4 to 9, ..."); copy, CSV, Excel,
 * and print get the numbers as text; sorting uses one number per row (`sortBy`). Load the Sparkline styles.
 */
export function sparklineColumn<Row>(options: SparklineColumnOptions<Row>): Pick<DataGridColumn<Row>, 'accessor' | 'render' | 'format' | 'compare'> {
  const o: unknown = options;
  if (typeof o !== 'object' || o === null || typeof options.values !== 'function') fail('sparklineColumn.values', 'function (row) => numbers');
  if (typeof options.label !== 'string' && typeof options.label !== 'function') fail('sparklineColumn.label', 'string or function (row) => string');
  if (options.sortBy !== undefined && !['last', 'sum', 'min', 'max'].includes(options.sortBy)) fail('sparklineColumn.sortBy', '"last" | "sum" | "min" | "max"');
  const locale = options.locale ?? 'en-US';
  const key = (row: Row): number => {
    const ns = numbersOf(options.values(row));
    if (ns.length === 0) return Number.NEGATIVE_INFINITY;
    switch (options.sortBy ?? 'last') {
      case 'sum':
        return ns.reduce((a, b) => a + b, 0);
      case 'min':
        return Math.min(...ns);
      case 'max':
        return Math.max(...ns);
      default:
        return ns[ns.length - 1] ?? Number.NEGATIVE_INFINITY;
    }
  };
  return {
    accessor: (row) => options.values(row),
    format: (value) => numbersOf(value).map((n) => formatNumber(n, options.valueFormat ?? {}, locale)).join(', '),
    compare: (a, b) => Math.sign(key(a) - key(b)),
    render: (row, context) => {
      const host = context.doc.createElement('span');
      host.className = 'aui-data-grid__sparkline';
      const values = options.values(row);
      const sparkline = Sparkline.create(host, {
        label: typeof options.label === 'function' ? options.label(row) : options.label,
        values: Array.isArray(values) ? values.map((v) => (typeof v === 'number' ? v : null)) : [],
        locale,
        ...(options.variant === undefined ? {} : { variant: options.variant }),
        ...(options.color === undefined ? {} : { color: options.color }),
        ...(options.min === undefined ? {} : { min: options.min }),
        ...(options.max === undefined ? {} : { max: options.max }),
        ...(options.valueFormat === undefined ? {} : { valueFormat: options.valueFormat }),
      });
      // The grid releases the node when it re-renders or drops the row: the sparkline unsubscribes.
      return onNodeRelease(host, () => {
        sparkline.destroy();
      });
    },
  };
}

// ---- Range and pivot charts (G10b, G10c) ------------------------------------------------------------

export type DataGridChartType = 'bar' | 'stackedBar' | 'line' | 'area' | 'pie';

export interface DataGridChartOptions {
  /** Default `bar`. */
  readonly type?: DataGridChartType;
  /** Range charts: each numeric column is a series (`columns`, default) or each row is (`rows`). */
  readonly seriesBy?: 'columns' | 'rows';
  /** The chart title (default: the grid label). */
  readonly title?: string;
  /** Range charts: the cells (default: the active cell range when the chart opens). */
  readonly range?: { readonly startRow: string; readonly endRow: string; readonly startColumn: string; readonly endColumn: string };
  /** Pivot charts: the group level whose rows are the categories (default 0, the first level). */
  readonly level?: number;
}

export interface DataGridChartPanel {
  /** The docked panel (a region below the grid). */
  readonly element: HTMLElement;
  /** Change the chart type, series direction, or title. */
  update(options: Pick<DataGridChartOptions, 'type' | 'seriesBy' | 'title'>): void;
  /** Close the panel (focus returns to the grid when it was in the panel). */
  close(): void;
}

registerMessages('dataGridCharts', 'en', {
  chartType: 'Chart type',
  seriesBy: 'Series',
  byColumns: 'By columns',
  byRows: 'By rows',
  bar: 'Bar',
  stackedBar: 'Stacked bar',
  line: 'Line',
  area: 'Area',
  pie: 'Pie',
  close: 'Close chart',
  noData: 'The cells hold no numbers to chart',
  chartOf: 'Chart of {title}',
});

interface ChartData {
  readonly categories: string[];
  readonly series: { id: string; label: string; values: (number | null)[] }[];
}

/** The chart component in the panel, recreated when the chart family changes. */
interface ChartInstance {
  update(options: object): void;
  destroy(): void;
}

const TYPES: readonly DataGridChartType[] = ['bar', 'stackedBar', 'line', 'area', 'pie'];
const isChartType = (v: unknown): v is DataGridChartType => TYPES.some((x) => x === v);

function numberOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Open a docked chart panel for the grid: `read` gives what to chart; the events re-read it. */
function openPanel<Row>(grid: DataGrid<Row>, options: DataGridChartOptions, read: (seriesBy: 'columns' | 'rows') => ChartData, events: readonly string[], pivot: boolean): DataGridChartPanel {
  const doc = grid.host.ownerDocument;
  const gridLabel = grid.host.querySelector('[role="grid"], [role="treegrid"]')?.getAttribute('aria-label') ?? 'Grid';
  const locale = grid.getExportData({ columns: [], rows: 'page' }).locale;
  const t = (key: string, params: Readonly<Record<string, string>> = {}): string => getMessage('dataGridCharts', key, params, locale);
  if (options.type !== undefined && !isChartType(options.type)) fail('chart.type', '"bar" | "stackedBar" | "line" | "area" | "pie"');
  let type: DataGridChartType = options.type ?? 'bar';
  let seriesBy: 'columns' | 'rows' = options.seriesBy === 'rows' ? 'rows' : 'columns';
  let title = options.title ?? gridLabel;
  const panel = doc.createElement('section');
  panel.className = 'aui-data-grid-chart';
  const tools = doc.createElement('div');
  tools.className = 'aui-data-grid-chart__tools';
  const field = (name: string, values: readonly (readonly [string, string])[], value: string, change: (v: string) => void): HTMLSelectElement => {
    const wrap = doc.createElement('label');
    wrap.className = 'aui-data-grid-chart__field';
    const text = doc.createElement('span');
    text.textContent = name;
    const s = doc.createElement('select');
    s.className = 'aui-data-grid__filter-control';
    for (const [v, l] of values) s.append(Object.assign(doc.createElement('option'), { value: v, textContent: l, selected: v === value }));
    s.addEventListener('change', () => {
      change(s.value);
    });
    wrap.append(text, s);
    tools.append(wrap);
    return s;
  };
  let chart: ChartInstance | null = null;
  let family: 'bar' | 'line' | 'pie' | null = null;
  const body = doc.createElement('div');
  body.className = 'aui-data-grid-chart__body';
  const empty = doc.createElement('p');
  empty.className = 'aui-data-grid-chart__empty';
  const draw = (recreate: boolean): void => {
    panel.setAttribute('aria-label', t('chartOf', { title }));
    const data = read(seriesBy);
    const has = data.series.length > 0 && data.categories.length > 0;
    empty.hidden = has;
    empty.textContent = has ? '' : t('noData');
    if (!has) {
      chart?.destroy();
      chart = null;
      family = null;
      body.replaceChildren();
      return;
    }
    const nextFamily = type === 'pie' ? 'pie' : type === 'line' || type === 'area' ? 'line' : 'bar';
    if (chart && family === nextFamily && !recreate) {
      chart.update(
        nextFamily === 'pie'
          ? { label: title, slices: data.categories.map((c, i) => ({ id: `s${String(i)}`, label: c, value: data.series[0]?.values[i] ?? null })) }
          : nextFamily === 'line'
            ? { label: title, x: data.categories, series: data.series, area: type === 'area' }
            : { label: title, categories: data.categories, series: data.series, layout: type === 'stackedBar' ? 'stacked' : 'grouped' },
      );
      return;
    }
    chart?.destroy();
    const host = doc.createElement('div');
    host.className = 'aui-data-grid-chart__chart';
    body.replaceChildren(host);
    if (nextFamily === 'pie') {
      const o: PieChartOptions = { label: title, locale, slices: data.categories.map((c, i) => ({ id: `s${String(i)}`, label: c, value: data.series[0]?.values[i] ?? null })) };
      chart = PieChart.create(host, o);
    } else if (nextFamily === 'line') {
      const o: LineChartOptions = { label: title, locale, x: data.categories, xType: 'category', series: data.series, area: type === 'area' };
      chart = LineChart.create(host, o);
    } else {
      const o: BarChartOptions = { label: title, locale, categories: data.categories, series: data.series, layout: type === 'stackedBar' ? 'stacked' : 'grouped' };
      chart = BarChart.create(host, o);
    }
    family = nextFamily;
  };
  const typeSelect = field(t('chartType'), TYPES.map((x) => [x, t(x)] as const), type, (v) => {
    if (isChartType(v)) type = v;
    draw(true);
  });
  if (!pivot) {
    field(t('seriesBy'), [['columns', t('byColumns')], ['rows', t('byRows')]], seriesBy, (v) => {
      seriesBy = v === 'rows' ? 'rows' : 'columns';
      draw(false);
    });
  }
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'aui-data-grid-chart__close';
  closeButton.setAttribute('aria-label', t('close'));
  closeButton.textContent = String.fromCharCode(0x00d7);
  tools.append(closeButton);
  panel.append(tools, body, empty);
  grid.host.after(panel);
  const refresh = (): void => {
    draw(false);
  };
  for (const name of events) grid.host.addEventListener(name, refresh);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    const inside = panel.contains(doc.activeElement);
    for (const name of events) grid.host.removeEventListener(name, refresh);
    chart?.destroy();
    panel.remove();
    if (inside) {
      const f = grid.focusedCell;
      if (f?.rowId) grid.focusCell(f.rowId, f.column);
      else grid.host.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    }
  };
  closeButton.addEventListener('click', close);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      close();
    }
  });
  draw(true);
  return {
    element: panel,
    update: (o) => {
      if (o.type !== undefined) {
        if (!isChartType(o.type)) fail('chart.type', '"bar" | "stackedBar" | "line" | "area" | "pie"');
        type = o.type;
        typeSelect.value = o.type;
      }
      if (o.seriesBy !== undefined) seriesBy = o.seriesBy === 'rows' ? 'rows' : 'columns';
      if (o.title !== undefined) title = o.title;
      draw(true);
    },
    close,
  };
}

/**
 * Chart the cells of a range in a panel docked below the grid (a region; Escape or Close closes it and focus
 * returns to the grid). The first text column names the categories; numeric columns are the series (or the
 * rows are, with `seriesBy: 'rows'`). The chart follows edits, transactions, sorting, and filtering; every
 * chart has its own data table. Load the Bar, Line, and Pie Chart styles.
 */
export function chartRange<Row>(grid: DataGrid<Row>, options: DataGridChartOptions = {}): DataGridChartPanel {
  const range = options.range ?? grid.getCellRanges().at(-1);
  if (!range) fail('chartRange.range', 'a cell range (select cells first, or pass range)');
  const read = (seriesBy: 'columns' | 'rows'): ChartData => {
    const data = grid.getExportData({ rows: 'filtered', groups: 'none', columns: 'visible' });
    const ids = data.columns.map((c) => c.id);
    const a = ids.indexOf(range.startColumn);
    const b = ids.indexOf(range.endColumn);
    const r1 = data.rows.findIndex((r) => r.id === range.startRow);
    const r2 = data.rows.findIndex((r) => r.id === range.endRow);
    if (a < 0 || b < 0 || r1 < 0 || r2 < 0) return { categories: [], series: [] };
    const left = Math.min(a, b);
    const cols = data.columns.slice(left, Math.max(a, b) + 1).map((c, k) => ({ c, i: left + k }));
    const rows = data.rows.slice(Math.min(r1, r2), Math.max(r1, r2) + 1);
    const numeric = cols.filter(({ i }) => rows.some((r) => numberOf(r.cells[i]?.value) !== null));
    const text = cols.find(({ i }) => !numeric.some((n) => n.i === i));
    const rowName = (r: (typeof rows)[number], k: number): string => (text ? (r.cells[text.i]?.text ?? '') : '') || String(k + 1);
    if (seriesBy === 'rows') {
      return { categories: numeric.map(({ c }) => c.header), series: rows.map((r, k) => ({ id: `r${String(k)}`, label: rowName(r, k), values: numeric.map(({ i }) => numberOf(r.cells[i]?.value)) })) };
    }
    return { categories: rows.map(rowName), series: numeric.map(({ c, i }) => ({ id: c.id, label: c.header, values: rows.map((r) => numberOf(r.cells[i]?.value)) })) };
  };
  return openPanel(grid, options, read, ['aui-cells-change', 'aui-rows-change', 'aui-sort-change', 'aui-filter-change'], false);
}

/**
 * Chart the pivot results in a docked panel: the pivot rows of a group level are the categories, the value
 * columns the series. The chart follows pivot changes, filters, and row updates.
 */
export function chartPivot<Row>(grid: DataGrid<Row>, options: DataGridChartOptions = {}): DataGridChartPanel {
  if (!grid.getPivot()) fail('chartPivot', 'a grid in pivot mode');
  const level = options.level ?? 0;
  if (!Number.isInteger(level) || level < 0) fail('chartPivot.level', 'integer >= 0');
  const read = (): ChartData => {
    const data = grid.getExportData({ rows: 'filtered', columns: 'visible' });
    const groupAt = data.columns.findIndex((c) => c.id.startsWith('aui-group'));
    const values = data.columns.map((c, i) => ({ c, i })).filter(({ c }) => c.id.startsWith('aui-pivot'));
    const rows = data.rows.filter((r) => r.kind === 'group' && r.level === level);
    return {
      categories: rows.map((r) => (groupAt >= 0 ? (r.cells[groupAt]?.text ?? '') : r.id)),
      series: values.map(({ c, i }) => ({ id: c.id, label: c.header, values: rows.map((r) => numberOf(r.cells[i]?.value)) })),
    };
  };
  return openPanel(grid, options, read, ['aui-pivot-change', 'aui-rows-change', 'aui-filter-change', 'aui-sort-change'], true);
}
