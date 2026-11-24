/**
 * Grid state serialization (internal). `DataTableState` is a JSON-safe snapshot of
 * the user-controlled view state. Parsing treats input as untrusted (it usually
 * comes from storage or a URL): the structure is validated strictly, while ids of
 * columns that no longer exist, or values a column cannot take, are dropped so a
 * stale snapshot still restores what it can.
 */
import { configurationError, validators } from '@absoluteui/core';
import { normalizeFilter } from './filter.js';
import { isObject, type DataTableColumn, type DataTableFilter, type DataTableSort } from './model.js';

export interface DataTableColumnsState {
  /** Every column id in column order (hidden columns included). */
  order: string[];
  /** Hidden column ids. */
  hidden: string[];
  /** Widths in CSS pixels set by resizing, `columnWidths`, or `setState`. */
  widths: Record<string, number>;
  /** Pinned column ids, outermost first. */
  pinned: { start: string[]; end: string[] };
}

export interface DataTableState {
  version: 1;
  /** Sort columns by priority (the first is the primary sort). */
  sort: DataTableSort[];
  filters: Record<string, DataTableFilter>;
  search: string;
  columns: DataTableColumnsState;
  page: number;
  pageSize: number | null;
  /** Keys of collapsed groups (`groupBy`), since 0.9.0. */
  collapsedGroups: string[];
}

/** Input of `setState`: `version` plus any subset of the state; omitted parts are left unchanged. */
export interface DataTableStateInput {
  version: 1;
  sort?: readonly DataTableSort[];
  filters?: Readonly<Record<string, DataTableFilter>>;
  search?: string;
  columns?: Partial<{
    order: readonly string[];
    hidden: readonly string[];
    widths: Readonly<Record<string, number>>;
    pinned: { start?: readonly string[]; end?: readonly string[] };
  }>;
  page?: number;
  pageSize?: number | null;
  collapsedGroups?: readonly string[];
}

export interface ParsedState {
  sorts?: DataTableSort[];
  filters?: Map<string, DataTableFilter>;
  search?: string;
  order?: string[];
  hidden?: Set<string>;
  widths?: Map<string, number>;
  pinned?: { start: string[]; end: string[] };
  page?: number;
  pageSize?: number | null;
  collapsedGroups?: Set<string>;
}

export const DEFAULT_MIN_WIDTH = 64;
export const DEFAULT_MAX_WIDTH = 960;

export function widthBounds<Row>(column: DataTableColumn<Row>): { min: number; max: number } {
  const min = column.minWidth ?? DEFAULT_MIN_WIDTH;
  return { min, max: Math.max(min, column.maxWidth ?? DEFAULT_MAX_WIDTH) };
}

export function clampWidth<Row>(column: DataTableColumn<Row>, px: number): number {
  const { min, max } = widthBounds(column);
  return Math.round(Math.min(max, Math.max(min, px)));
}

function bad(property: string, expected: string): never {
  throw configurationError('DATA_TABLE_STATE', 'Invalid data table state.', { component: 'dataTable', property: `dataTable.state.${property}`, expected });
}

const stringArray = (v: unknown, property: string): string[] => {
  if (!Array.isArray(v) || !v.every((s): s is string => typeof s === 'string')) bad(property, 'array of column id strings');
  return v;
};

/** Pinned ids: known, visible-able columns, no duplicates, `start` wins over `end`. */
export function normalizePinned(start: readonly string[], end: readonly string[], known: ReadonlySet<string>): { start: string[]; end: string[] } {
  const seen = new Set<string>();
  const keep = (ids: readonly string[]): string[] => ids.filter((id) => {
    if (!known.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const s = keep(start);
  return { start: s, end: keep(end) };
}

/** Parse untrusted state; throws DATA_TABLE_STATE on structural errors. */
export function parseState<Row>(value: unknown, columns: readonly DataTableColumn<Row>[], pageSizes: readonly number[] | undefined): ParsedState {
  if (!isObject(value)) bad('', 'state object');
  if (value.version !== 1) bad('version', '1');
  const byId = new Map(columns.map((c) => [c.id, c]));
  const out: ParsedState = {};

  if (value.sort !== undefined) {
    if (!Array.isArray(value.sort)) bad('sort', 'array of { column, direction }');
    const sorts: DataTableSort[] = [];
    for (const s of value.sort as unknown[]) {
      if (!isObject(s) || typeof s.column !== 'string' || (s.direction !== 'ascending' && s.direction !== 'descending')) bad('sort', 'array of { column: string, direction: "ascending" | "descending" }');
      const column = byId.get(s.column);
      if (!column || column.sortable === false || sorts.some((x) => x.column === s.column)) continue;
      sorts.push({ column: s.column, direction: s.direction });
    }
    out.sorts = sorts;
  }

  if (value.filters !== undefined) {
    if (!isObject(value.filters) || Array.isArray(value.filters)) bad('filters', 'object of filters by column id');
    const filters = new Map<string, DataTableFilter>();
    for (const [id, raw] of Object.entries(value.filters)) {
      const column = byId.get(id);
      if (!column) continue;
      const f = normalizeFilter(column, raw);
      if (f) filters.set(id, f);
    }
    out.filters = filters;
  }

  if (value.search !== undefined) {
    if (typeof value.search !== 'string') bad('search', 'string');
    out.search = value.search;
  }

  if (value.columns !== undefined) {
    const c = value.columns;
    if (!isObject(c)) bad('columns', '{ order, hidden, widths, pinned }');
    if (c.order !== undefined) out.order = stringArray(c.order, 'columns.order').filter((id, i, all) => byId.has(id) && all.indexOf(id) === i);
    if (c.hidden !== undefined) {
      const hidden = new Set(stringArray(c.hidden, 'columns.hidden').filter((id) => byId.has(id)));
      // A snapshot that would hide every column is dropped rather than rendering nothing.
      out.hidden = hidden.size >= columns.length ? new Set() : hidden;
    }
    if (c.widths !== undefined) {
      if (!isObject(c.widths) || Array.isArray(c.widths)) bad('columns.widths', 'object of pixel widths by column id');
      const widths = new Map<string, number>();
      for (const [id, px] of Object.entries(c.widths)) {
        if (typeof px !== 'number' || !Number.isFinite(px)) bad('columns.widths', 'finite numbers (CSS pixels)');
        const column = byId.get(id);
        if (column) widths.set(id, clampWidth(column, px));
      }
      out.widths = widths;
    }
    if (c.pinned !== undefined) {
      const p = c.pinned;
      if (!isObject(p)) bad('columns.pinned', '{ start: string[], end: string[] }');
      out.pinned = normalizePinned(p.start === undefined ? [] : stringArray(p.start, 'columns.pinned.start'), p.end === undefined ? [] : stringArray(p.end, 'columns.pinned.end'), new Set(byId.keys()));
    }
  }

  if (value.page !== undefined) {
    if (!validators.integerInRange(1, Number.MAX_SAFE_INTEGER)(value.page)) bad('page', 'integer >= 1');
    out.page = value.page;
  }
  if (value.pageSize !== undefined) {
    const size = value.pageSize;
    if (size !== null && !validators.integerInRange(1, 1_000_000)(size)) bad('pageSize', 'integer from 1 to 1000000, or null');
    // A size the table no longer offers is ignored.
    if (size === null || !pageSizes || pageSizes.includes(size)) out.pageSize = size;
  }
  // Group keys depend on the data; keys of groups that do not exist have no effect.
  if (value.collapsedGroups !== undefined) out.collapsedGroups = new Set(stringArray(value.collapsedGroups, 'collapsedGroups'));
  return out;
}
