/**
 * Data Grid state (serializable, versioned) and its validation. `setState` input is untrusted
 * (storage, URLs, other users): structure errors throw `DATA_GRID_STATE` and leave the grid
 * unchanged; ids that no longer exist are dropped.
 */
import { configurationError } from '@absoluteui/core';
import { pinnedValue } from './columns.js';
import type { DataGridPinned, DataGridSort } from './model.js';
import type { DataGridFilters } from './filter.js';
import type { DataGridAdvancedFilter } from './advanced-filter.js';
import type { DataGridPivot } from './pivot.js';

export interface DataGridColumnsState {
  /** Every column id in display order (hidden ones included). */
  readonly order: readonly string[];
  /** User-set widths in pixels (flex columns without a user width are absent). */
  readonly widths: Readonly<Record<string, number>>;
  /** User pinning: `start`, `end`, or `null` (unpinned), overriding the column definition. */
  readonly pinned: Readonly<Record<string, DataGridPinned | null>>;
  readonly hidden: readonly string[];
  readonly collapsedGroups: readonly string[];
  /** Header names set by the user (absent when none). */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface DataGridState {
  readonly version: 1;
  readonly sort: readonly DataGridSort[];
  readonly columns: DataGridColumnsState;
  /** 1-based; 1 when paging is off. */
  readonly page: number;
  /** Rows per page, or null when paging is off. */
  readonly pageSize: number | null;
  readonly filters: DataGridFilters;
  readonly quickFilter: string;
  /** The advanced filter model (applies while the grid's `advancedFilter` option is on). */
  readonly advancedFilter: DataGridAdvancedFilter | null;
  /** Selected row ids (row selection). */
  readonly selected: readonly string[];
  /** Grouped column ids, in level order. */
  readonly groupBy: readonly string[];
  /** Group rows expanded or collapsed explicitly (others follow groupDefaultExpanded). */
  readonly expanded: Readonly<Record<string, boolean>>;
  /** Master/detail: master rows expanded or collapsed explicitly (others follow detail.expandedByDefault). */
  readonly details: Readonly<Record<string, boolean>>;
  /** Rows pinned by id (`pinRow`, the cell menu), by section, in pin order. */
  readonly pinnedRows: { readonly top: readonly string[]; readonly bottom: readonly string[] };
  /** Pivot mode: the pivot, or null when off. */
  readonly pivot: DataGridPivot | null;
}

/** Parsed state: only the sections present in the input. */
export interface ParsedState {
  sort?: DataGridSort[];
  order?: string[];
  widths?: Record<string, number>;
  pinned?: Record<string, DataGridPinned | null>;
  hidden?: string[];
  collapsed?: string[];
  page?: number;
  pageSize?: number | null;
  /** Raw filter models by known column id (validated against the column kind by the grid). */
  filters?: Record<string, unknown>;
  quickFilter?: string;
  /** Raw advanced filter model (validated by the grid); present when the input has the key. */
  advancedFilter?: unknown;
  /** Selected row ids (unknown ids are dropped by the grid). */
  selected?: string[];
  groupBy?: string[];
  expanded?: Record<string, boolean>;
  details?: Record<string, boolean>;
  pinnedRows?: { top: string[]; bottom: string[] };
  /** Raw pivot (validated by the grid); present when the input has the key. */
  pivot?: unknown;
  headers?: Record<string, string>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const stringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function invalid(property: string, expected: string): never {
  throw configurationError('DATA_GRID_STATE', 'Invalid data grid state.', { component: 'dataGrid', property: `dataGrid.state.${property}`, expected });
}

/** Validate untrusted state against the known column and group ids. */
export function parseState(value: unknown, columns: ReadonlySet<string>, groups: ReadonlySet<string>): ParsedState {
  if (!isRecord(value)) invalid('', 'object');
  if (value.version !== undefined && value.version !== 1) invalid('version', '1');
  const out: ParsedState = {};
  if (value.sort !== undefined) {
    if (!Array.isArray(value.sort)) invalid('sort', 'array of { column, direction }');
    const sort: DataGridSort[] = [];
    for (const s of value.sort as unknown[]) {
      if (!isRecord(s) || typeof s.column !== 'string' || (s.direction !== 'ascending' && s.direction !== 'descending')) invalid('sort', 'array of { column, direction: "ascending" | "descending" }');
      if (columns.has(s.column) && !sort.some((x) => x.column === s.column)) sort.push({ column: s.column, direction: s.direction });
    }
    out.sort = sort;
  }
  if (value.columns !== undefined) {
    const c = value.columns;
    if (!isRecord(c)) invalid('columns', 'object');
    if (c.order !== undefined) {
      if (!stringList(c.order)) invalid('columns.order', 'array of column ids');
      out.order = c.order.filter((id) => columns.has(id));
    }
    if (c.widths !== undefined) {
      if (!isRecord(c.widths)) invalid('columns.widths', 'object of pixel widths');
      const widths: Record<string, number> = {};
      for (const [id, w] of Object.entries(c.widths)) {
        if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) invalid('columns.widths', 'positive numbers');
        if (columns.has(id)) widths[id] = w;
      }
      out.widths = widths;
    }
    if (c.pinned !== undefined) {
      if (!isRecord(c.pinned)) invalid('columns.pinned', 'object of "start" | "end" | null');
      const pinned: Record<string, DataGridPinned | null> = {};
      for (const [id, p] of Object.entries(c.pinned)) {
        const v = pinnedValue(p);
        if (v === undefined) invalid('columns.pinned', '"start" | "end" | null');
        if (columns.has(id)) pinned[id] = v;
      }
      out.pinned = pinned;
    }
    if (c.hidden !== undefined) {
      if (!stringList(c.hidden)) invalid('columns.hidden', 'array of column ids');
      out.hidden = c.hidden.filter((id) => columns.has(id));
    }
    if (c.collapsedGroups !== undefined) {
      if (!stringList(c.collapsedGroups)) invalid('columns.collapsedGroups', 'array of group ids');
      out.collapsed = c.collapsedGroups.filter((id) => groups.has(id));
    }
    if (c.headers !== undefined) {
      if (!isRecord(c.headers) || !Object.values(c.headers).every((h) => typeof h === 'string' && h.trim() !== '' && h.length <= 200)) invalid('columns.headers', 'object of column ids to names (1 to 200 characters)');
      out.headers = Object.fromEntries(Object.entries(c.headers as Record<string, string>).filter(([id]) => columns.has(id)).map(([id, h]) => [id, h.trim()]));
    }
  }
  if (value.page !== undefined) {
    if (typeof value.page !== 'number' || !Number.isInteger(value.page) || value.page < 1) invalid('page', 'integer >= 1');
    out.page = value.page;
  }
  if (value.pageSize !== undefined) {
    if (value.pageSize !== null && (typeof value.pageSize !== 'number' || !Number.isInteger(value.pageSize) || value.pageSize < 1 || value.pageSize > 1_000_000)) invalid('pageSize', 'integer from 1 to 1000000, or null');
    out.pageSize = value.pageSize;
  }
  if (value.filters !== undefined) {
    if (!isRecord(value.filters)) invalid('filters', 'object of filters by column id');
    out.filters = Object.fromEntries(Object.entries(value.filters).filter(([id]) => columns.has(id)));
  }
  if (value.quickFilter !== undefined) {
    if (typeof value.quickFilter !== 'string' || value.quickFilter.length > 1000) invalid('quickFilter', 'string of at most 1000 characters');
    out.quickFilter = value.quickFilter;
  }
  if ('advancedFilter' in value) out.advancedFilter = value.advancedFilter;
  if (value.selected !== undefined) {
    if (!stringList(value.selected) || value.selected.length > 10_000_000) invalid('selected', 'array of row ids');
    out.selected = [...value.selected];
  }
  if (value.groupBy !== undefined) {
    if (!stringList(value.groupBy) || value.groupBy.length > 20) invalid('groupBy', 'array of at most 20 column ids');
    out.groupBy = value.groupBy.filter((id) => columns.has(id));
  }
  if (value.expanded !== undefined) {
    if (!isRecord(value.expanded) || Object.keys(value.expanded).length > 100_000 || !Object.values(value.expanded).every((v) => typeof v === 'boolean')) invalid('expanded', 'object of group ids to booleans');
    out.expanded = { ...(value.expanded as Record<string, boolean>) };
  }
  if (value.details !== undefined) {
    if (!isRecord(value.details) || Object.keys(value.details).length > 100_000 || !Object.values(value.details).every((v) => typeof v === 'boolean')) invalid('details', 'object of row ids to booleans');
    out.details = { ...(value.details as Record<string, boolean>) };
  }
  if (value.pinnedRows !== undefined) {
    const p = value.pinnedRows;
    if (!isRecord(p) || !stringList(p.top ?? []) || !stringList(p.bottom ?? []) || ((p.top as string[] | undefined)?.length ?? 0) + ((p.bottom as string[] | undefined)?.length ?? 0) > 1000) invalid('pinnedRows', '{ top: row ids, bottom: row ids } (at most 1000)');
    out.pinnedRows = { top: [...((p.top as string[] | undefined) ?? [])], bottom: [...((p.bottom as string[] | undefined) ?? [])] };
  }
  if ('pivot' in value) out.pivot = value.pivot;
  return out;
}
