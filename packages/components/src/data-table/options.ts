/**
 * Data Table options, event details, and option validation (internal module; the
 * public types are re-exported from `./index.ts`).
 */
import { validators, type Density, type Direction } from '@absoluteui/core';
import { filterDefinitionError, normalizeFilter } from './filter.js';
import {
  fail,
  isArray,
  isFunction,
  isObject,
  isObjectLike,
  TYPES,
  type DataTableAlign,
  type DataTableColumn,
  type DataTableFilter,
  type DataTableFilters,
  type DataTableIcons,
  type DataTableMode,
  type DataTablePinnedColumns,
  type DataTableSelection,
  type DataTableSort,
  type DataTableSortCycle,
} from './model.js';
import type { DataTableColumnsState } from './state.js';
import type { DataTableGroup } from './grouping.js';

export interface DataTableConfig {
  /** Row selection. Default `none`. */
  selection: DataTableSelection;
  /** Rows per page; `null` renders every row without pagination. Default 25. */
  pageSize: number | null;
  /** Keep the column headers visible while the scroll region scrolls. Default true. */
  stickyHeader: boolean;
  /** `tri-state`: ascending, descending, unsorted. `bi-state`: ascending, descending. */
  sortCycle: DataTableSortCycle;
  /** Shift+click / Shift+Enter adds a column to the sort (since 0.3.0). Default false. */
  multiSort: boolean;
  /** Milliseconds between the last keystroke in a filter or search field and filtering (since 0.3.0). Default 250. */
  filterDelay: number;
}

export interface DataTableOptions<Row> extends Partial<DataTableConfig> {
  /** Accessible name of the table and its scroll region (required). */
  caption: string;
  /** Visually hide the caption (it stays the accessible name). */
  hideCaption?: boolean;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  /** Stable, unique, non-empty id per row. */
  rowId: (row: Row) => string;
  /** Current sort: one sort, sorts by priority (since 0.3.0), or null. */
  sort?: DataTableSort | readonly DataTableSort[] | null;
  /** Selected row ids. */
  selected?: readonly string[];
  /** Rows for which this returns false get a disabled selection input. */
  isRowSelectable?: (row: Row) => boolean;
  /** Render a "Rows per page" select with these sizes. */
  pageSizes?: readonly number[];
  /** Current page, 1-based. Default 1. Clamped. */
  page?: number;
  /** `client` (default) filters, sorts, and pages `rows`; `server` renders `rows` as the current page. */
  mode?: DataTableMode;
  /** Server mode: total number of rows across all pages (required when paged). */
  total?: number;
  /** Busy state: skeleton rows when there are no rows, otherwise a spinner overlay. */
  loading?: boolean;
  /** Default: localized "No results". */
  emptyMessage?: string;
  /** Active column filters by column id (since 0.3.0). */
  filters?: DataTableFilters;
  /** Global search text (since 0.3.0). */
  search?: string;
  /** Render a global search field above the table (since 0.3.0). */
  searchable?: boolean;
  /** Render the filter row for columns with a `filter`. Default true (since 0.3.0). */
  filterRow?: boolean;
  /** Hidden column ids (since 0.3.0). */
  hiddenColumns?: readonly string[];
  /** Column display order by id; unlisted columns follow in definition order (since 0.3.0). */
  columnOrder?: readonly string[];
  /** Column widths in CSS pixels (since 0.3.0). */
  columnWidths?: Readonly<Record<string, number>>;
  /** Sticky columns at the start and end edges, outermost first (since 0.3.0). */
  pinnedColumns?: DataTablePinnedColumns;
  /** Pointer and keyboard column resizing (since 0.3.0). Default false. */
  resizable?: boolean;
  /** Row detail content; enables a disclosure button per row (since 0.3.0). Strings are text. */
  renderDetail?: (row: Row, doc: Document) => Node | string;
  /** Rows for which this returns false get no disclosure button (since 0.3.0). */
  isRowExpandable?: (row: Row) => boolean;
  /** Expanded row ids (since 0.3.0). */
  expanded?: readonly string[];
  /** Windowed rendering of the current page inside the scroll region (since 0.3.0). */
  virtual?: boolean;
  /** Virtual mode: initial row height estimate in CSS pixels, replaced by the measured height. Default 40 (since 0.3.0). */
  rowHeight?: number;
  /** Group rows by these column ids, nested in order (since 0.9.0). Client mode only; not with `virtual`. */
  groupBy?: readonly string[];
  /** Collapsed group keys (`DataTableGroup.key`); groups are expanded by default (since 0.9.0). */
  collapsedGroups?: readonly string[];
  /**
   * Custom content of a group header (since 0.9.0). Decorative: the toggle keeps the default text
   * ("Column: value (count)") as its accessible name. Nodes are released with `releaseNode` when dropped.
   */
  renderGroupHeader?: (group: DataTableGroup<Row>, doc: Document) => Node;
  /** Show the totals row when a column has an `aggregate` (or `totals` is set). Default true (since 0.9.0). */
  showTotals?: boolean;
  /** Server mode: totals by column id, computed by the server (since 0.9.0). */
  totals?: Readonly<Record<string, unknown>>;
  /** Custom content of the empty state (since 0.9.0); replaces `emptyMessage`. Released with `releaseNode` when dropped. */
  renderEmpty?: (doc: Document) => Node;
  locale?: string;
  timezone?: string;
  density?: Density;
  direction?: Direction;
  icons?: Partial<DataTableIcons>;
}

export interface DataTableSortChangeDetail {
  /** The primary sort (the first of `sorts`), or null. */
  sort: DataTableSort | null;
  /** All sorts by priority (since 0.3.0). */
  sorts: DataTableSort[];
}

export interface DataTableSelectionChangeDetail {
  selected: string[];
}

export interface DataTablePageChangeDetail {
  page: number;
  pageSize: number;
}

export interface DataTableFilterChangeDetail {
  filters: Record<string, DataTableFilter>;
  search: string;
}

export interface DataTableColumnsChangeDetail {
  /** The column the user changed. */
  column: string;
  reason: 'visibility' | 'resize';
  columns: DataTableColumnsState;
}

export interface DataTableExpandChangeDetail {
  id: string;
  expanded: boolean;
  /** All expanded row ids. */
  expandedIds: string[];
}

const ALIGNS: readonly DataTableAlign[] = ['start', 'end', 'center'];
const MODES: readonly DataTableMode[] = ['client', 'server'];
/** Strict allowlist: no functions, keywords, or separators can reach the CSSOM. */
const LENGTH = /^\d+(\.\d+)?(px|rem|em|%|ch)$/;
const CURRENCY = /^[A-Z]{3}$/;

/** Validate options before anything renders (throws DATA_TABLE_OPTIONS / CFG_INVALID_VALUE). */
export function assertOptions<R>(o: DataTableOptions<R>, resolve: (o: DataTableOptions<R>) => Readonly<DataTableConfig>): void {
  if (typeof o.caption !== 'string' || o.caption.trim() === '') fail('caption', 'non-empty string (accessible name)');
  if (o.hideCaption !== undefined && typeof o.hideCaption !== 'boolean') fail('hideCaption', 'boolean');
  if (!isArray(o.columns) || o.columns.length === 0) fail('columns', 'non-empty array of columns');
  const ids = new Set<string>();
  const byId = new Map<string, DataTableColumn<R>>();
  let rowHeaders = 0;
  const isWidth = (v: unknown): boolean => v === undefined || (typeof v === 'number' && Number.isFinite(v) && v > 0);
  for (const c of o.columns) {
    if (!isObjectLike(c)) fail('columns', 'array of column objects');
    if (typeof c.id !== 'string' || c.id.trim() === '' || ids.has(c.id)) fail('columns.id', 'unique non-empty string');
    ids.add(c.id);
    byId.set(c.id, c);
    if (typeof c.header !== 'string' || c.header.trim() === '') fail('columns.header', 'non-empty string');
    if (!isFunction(c.accessor)) fail('columns.accessor', 'function (row) => value');
    if (c.type !== undefined && !TYPES.includes(c.type)) fail('columns.type', '"text" | "number" | "currency" | "date" | "datetime" | "boolean"');
    if (c.type === 'currency' && (typeof c.currency !== 'string' || !CURRENCY.test(c.currency))) fail('columns.currency', 'ISO 4217 code (e.g. "EUR") for currency columns');
    if (c.format !== undefined && !isFunction(c.format)) fail('columns.format', 'function');
    if (c.render !== undefined && !isFunction(c.render)) fail('columns.render', 'function');
    if (c.compare !== undefined && !isFunction(c.compare)) fail('columns.compare', 'function');
    if (c.sortable !== undefined && typeof c.sortable !== 'boolean') fail('columns.sortable', 'boolean');
    if (c.align !== undefined && !ALIGNS.includes(c.align)) fail('columns.align', '"start" | "end" | "center"');
    if (c.width !== undefined && (typeof c.width !== 'string' || !LENGTH.test(c.width))) fail('columns.width', 'CSS length: number + px | rem | em | % | ch');
    if (c.rowHeader !== undefined && typeof c.rowHeader !== 'boolean') fail('columns.rowHeader', 'boolean');
    if (c.rowHeader === true) rowHeaders++;
    const filterError = filterDefinitionError(c);
    if (filterError !== null) fail(c.filter === undefined ? 'columns.filterOptions' : 'columns.filter', filterError);
    for (const key of ['searchable', 'hideable', 'resizable', 'exportable'] as const) {
      if (c[key] !== undefined && typeof c[key] !== 'boolean') fail(`columns.${key}`, 'boolean');
    }
    if (!isWidth(c.minWidth)) fail('columns.minWidth', 'positive number (CSS pixels)');
    if (!isWidth(c.maxWidth) || (c.minWidth !== undefined && c.maxWidth !== undefined && c.maxWidth < c.minWidth)) fail('columns.maxWidth', 'positive number (CSS pixels) >= minWidth');
    if (c.exportValue !== undefined && !isFunction(c.exportValue)) fail('columns.exportValue', 'function');
    if (c.renderHeader !== undefined && !isFunction(c.renderHeader)) fail('columns.renderHeader', 'function (column, doc) => Node');
    if (c.editable !== undefined && typeof c.editable !== 'boolean' && !isFunction(c.editable)) fail('columns.editable', 'boolean or function (row) => boolean');
    if (c.editor !== undefined && !['text', 'number', 'date', 'select', 'checkbox'].includes(c.editor)) fail('columns.editor', '"text" | "number" | "date" | "select" | "checkbox"');
    if (c.editor === 'select' && (c.editOptions?.length ?? 0) === 0) fail('columns.editOptions', 'non-empty array of { value, label } for the select editor');
    if (c.validate !== undefined && !isFunction(c.validate)) fail('columns.validate', 'function (value, row) => string | null');
    if (c.renderEditor !== undefined && !isFunction(c.renderEditor)) fail('columns.renderEditor', 'function (context, doc) => Node');
    if (c.aggregate !== undefined && !isFunction(c.aggregate) && !['sum', 'avg', 'min', 'max', 'count'].includes(String(c.aggregate))) fail('columns.aggregate', '"sum" | "avg" | "min" | "max" | "count" | function');
  }
  if (rowHeaders > 1) fail('columns.rowHeader', 'at most one row header column');
  if (!isArray(o.rows)) fail('rows', 'array');
  if (!isFunction(o.rowId)) fail('rowId', 'function (row) => unique string');
  if (o.sort !== undefined && o.sort !== null) {
    const list: readonly unknown[] = Array.isArray(o.sort) ? o.sort : [o.sort];
    const seen = new Set<string>();
    for (const sort of list) {
      if (!isObject(sort) || typeof sort.column !== 'string' || !['ascending', 'descending'].includes(String(sort.direction))) fail('sort', '{ column, direction: "ascending" | "descending" }, an array of them, or null');
      if (byId.get(sort.column)?.sortable === false || !byId.has(sort.column) || seen.has(sort.column)) fail('sort.column', 'id of a sortable column (once)');
      seen.add(sort.column);
    }
  }
  if (o.selected !== undefined && (!isArray(o.selected) || !o.selected.every((id) => typeof id === 'string'))) fail('selected', 'array of row id strings');
  if (o.isRowSelectable !== undefined && !isFunction(o.isRowSelectable)) fail('isRowSelectable', 'function');
  const isSize = validators.integerInRange(1, 1_000_000);
  if (o.pageSizes !== undefined && (!isArray(o.pageSizes) || o.pageSizes.length === 0 || !o.pageSizes.every((s) => isSize(s)))) fail('pageSizes', 'non-empty array of integers >= 1');
  if (o.pageSizes !== undefined && typeof o.pageSize === 'number' && !o.pageSizes.includes(o.pageSize)) fail('pageSize', 'one of pageSizes');
  if (o.page !== undefined && !validators.integerInRange(1, Number.MAX_SAFE_INTEGER)(o.page)) fail('page', 'integer >= 1');
  if (o.mode !== undefined && !MODES.includes(o.mode)) fail('mode', '"client" | "server"');
  if (o.total !== undefined && !validators.integerInRange(0, Number.MAX_SAFE_INTEGER)(o.total)) fail('total', 'integer >= 0');
  if (o.loading !== undefined && typeof o.loading !== 'boolean') fail('loading', 'boolean');
  if (o.emptyMessage !== undefined && (typeof o.emptyMessage !== 'string' || o.emptyMessage.trim() === '')) fail('emptyMessage', 'non-empty string');
  assertGridOptions(o, byId);
  // Resolving validates the configurable options.
  const config = resolve(o);
  if (config.selection === 'single' && (o.selected?.length ?? 0) > 1) fail('selected', 'at most one id with selection "single"');
  if (o.mode === 'server' && config.pageSize !== null && o.total === undefined) fail('total', 'total row count in server mode');
}

/** Options added in 0.3.0 (filters, columns state, expansion, virtual mode). */
function assertGridOptions<R>(o: DataTableOptions<R>, byId: ReadonlyMap<string, DataTableColumn<R>>): void {
  const idList = (v: unknown, property: string): readonly string[] => {
    if (!Array.isArray(v) || !v.every((id): id is string => typeof id === 'string' && byId.has(id)) || new Set(v).size !== v.length) fail(property, 'array of unique column ids');
    return v;
  };
  if (o.filters !== undefined) {
    const filters: unknown = o.filters;
    if (!isObject(filters) || Array.isArray(filters)) fail('filters', 'object of filters by column id');
    for (const [id, value] of Object.entries(filters)) {
      const column = byId.get(id);
      if (!column || normalizeFilter(column, value) === undefined) fail('filters', 'filters keyed by the id of a column whose filter kind matches the filter type');
    }
  }
  if (o.search !== undefined && typeof o.search !== 'string') fail('search', 'string');
  for (const key of ['searchable', 'filterRow', 'resizable', 'virtual'] as const) {
    if (o[key] !== undefined && typeof o[key] !== 'boolean') fail(key, 'boolean');
  }
  if (o.hiddenColumns !== undefined && idList(o.hiddenColumns, 'hiddenColumns').length >= o.columns.length) fail('hiddenColumns', 'at least one visible column');
  if (o.columnOrder !== undefined) idList(o.columnOrder, 'columnOrder');
  if (o.columnWidths !== undefined) {
    const widths: unknown = o.columnWidths;
    if (!isObject(widths) || Array.isArray(widths)) fail('columnWidths', 'object of pixel widths by column id');
    for (const [id, px] of Object.entries(widths)) {
      if (!byId.has(id) || typeof px !== 'number' || !Number.isFinite(px) || px <= 0) fail('columnWidths', 'positive pixel widths keyed by column id');
    }
  }
  if (o.pinnedColumns !== undefined) {
    const p: unknown = o.pinnedColumns;
    if (!isObject(p)) fail('pinnedColumns', '{ start?: string[], end?: string[] }');
    const start = p.start === undefined ? [] : idList(p.start, 'pinnedColumns.start');
    const end = p.end === undefined ? [] : idList(p.end, 'pinnedColumns.end');
    if (start.some((id) => end.includes(id))) fail('pinnedColumns', 'a column pinned to one edge only');
  }
  if (o.renderDetail !== undefined && !isFunction(o.renderDetail)) fail('renderDetail', 'function (row, doc) => Node | string');
  if (o.isRowExpandable !== undefined && !isFunction(o.isRowExpandable)) fail('isRowExpandable', 'function');
  if (o.expanded !== undefined && (!isArray(o.expanded) || !o.expanded.every((id) => typeof id === 'string'))) fail('expanded', 'array of row id strings');
  if (o.virtual === true && o.renderDetail !== undefined) fail('virtual', 'false when renderDetail is set (virtual rows need a uniform height)');
  if (o.rowHeight !== undefined && !validators.numberInRange(16, 500)(o.rowHeight)) fail('rowHeight', 'number from 16 to 500 (CSS pixels)');
  const strings = (v: unknown): boolean => Array.isArray(v) && v.every((x: unknown) => typeof x === 'string');
  if (o.groupBy !== undefined && !strings(o.groupBy)) fail('groupBy', 'array of column ids');
  if (o.groupBy !== undefined && o.groupBy.length > 0) {
    if (o.mode === 'server') fail('groupBy', 'client mode (group on the server and send the rows)');
    if (o.virtual === true) fail('virtual', 'false when groupBy is set');
  }
  if (o.collapsedGroups !== undefined && !strings(o.collapsedGroups)) fail('collapsedGroups', 'array of group key strings');
  if (o.renderGroupHeader !== undefined && !isFunction(o.renderGroupHeader)) fail('renderGroupHeader', 'function (group, doc) => Node');
  if (o.showTotals !== undefined && typeof o.showTotals !== 'boolean') fail('showTotals', 'boolean');
  if (o.totals !== undefined && !isObject(o.totals)) fail('totals', 'object of column id -> value');
  if (o.renderEmpty !== undefined && !isFunction(o.renderEmpty)) fail('renderEmpty', 'function (doc) => Node');
}
