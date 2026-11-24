/**
 * Data Table public types and shared value helpers (internal module; the public
 * surface is re-exported from `./index.ts`).
 */
import { configurationError, type Instant, type PlainDate, type ZonedDateTime } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import type { DataTableAggregate } from './grouping.js';

export type DataTableColumnType = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean';
export type DataTableAlign = 'start' | 'end' | 'center';
export type DataTableSelection = 'none' | 'single' | 'multiple';
export type DataTableMode = 'client' | 'server';
export type DataTableSortDirection = 'ascending' | 'descending';
export type DataTableSortCycle = 'tri-state' | 'bi-state';

export interface DataTableSort {
  column: string;
  direction: DataTableSortDirection;
}

/** Per-column filter kind (since 0.3.0). */
export type DataTableFilterKind = 'text' | 'number' | 'date' | 'enum';

/** Case-insensitive match on the displayed cell text. */
export interface DataTableTextFilter {
  type: 'text';
  value: string;
  /** Default `contains`. */
  operator?: 'contains' | 'equals' | 'startsWith';
}

/** Inclusive numeric range; `null`/absent bounds are open. */
export interface DataTableNumberFilter {
  type: 'number';
  min?: number | null;
  max?: number | null;
}

/**
 * Inclusive calendar-date range as ISO `YYYY-MM-DD` strings. `datetime` columns
 * compare the calendar date in the configured timezone.
 */
export interface DataTableDateFilter {
  type: 'date';
  from?: string | null;
  to?: string | null;
}

/** Matches rows whose value is one of `values` (booleans are `"true"` / `"false"`). */
export interface DataTableEnumFilter {
  type: 'enum';
  values: readonly string[];
}

export type DataTableFilter = DataTableTextFilter | DataTableNumberFilter | DataTableDateFilter | DataTableEnumFilter;
/** Active filters by column id. JSON-safe. */
export type DataTableFilters = Readonly<Record<string, DataTableFilter>>;

export interface DataTableFilterOption {
  value: string;
  label: string;
}

export interface DataTablePinnedColumns {
  start?: readonly string[];
  end?: readonly string[];
}

export interface DataTableIcons {
  sortAscending: IconRef;
  sortDescending: IconRef;
  sortNone: IconRef;
  checked: IconRef;
  indeterminate: IconRef;
  loading: IconRef;
  /** Row expansion disclosure (collapsed). Mirrored in right-to-left layouts. */
  expand: IconRef;
  /** Row expansion disclosure (expanded). */
  collapse: IconRef;
}

export interface DataTableColumn<Row> {
  /** Unique column id (used by `sort.column`). */
  id: string;
  /** Header text. */
  header: string;
  /** Raw value used for sorting and default rendering. */
  accessor: (row: Row) => unknown;
  /**
   * Typed formatting and sorting. `number` and `currency` (needs `currency`) use
   * formatNumber; `date` expects a PlainDate; `datetime` expects an Instant (or
   * ZonedDateTime), always shown in the configured timezone. Default `text`.
   */
  type?: DataTableColumnType;
  /** ISO 4217 code for `type: 'currency'`, e.g. `EUR`. */
  currency?: string;
  /** Cell text (rendered as text, never HTML). Overrides typed formatting. */
  format?: (value: unknown, row: Row) => string;
  /** Custom cell content. Strings are text; returned Nodes are consumer-owned. */
  render?: (row: Row, doc: Document) => Node | string;
  /** Default true. */
  sortable?: boolean;
  /** Custom comparator (ascending). Nulls-last handling is then the comparator's job. */
  compare?: (a: Row, b: Row) => number;
  /** Default `end` for number and currency columns, otherwise `start`. */
  align?: DataTableAlign;
  /** CSS length: a number followed by px, rem, em, % or ch. */
  width?: string;
  /** Render cells as `th scope="row"`. Default: the first column, unless it sets `false`. */
  rowHeader?: boolean;
  /** Filter kind (since 0.3.0). `number` needs a number/currency column, `date` a date/datetime column, `enum` `filterOptions` or a boolean column. */
  filter?: DataTableFilterKind;
  /** Options of an `enum` filter (since 0.3.0). Default for boolean columns: Yes / No. */
  filterOptions?: readonly DataTableFilterOption[];
  /** Include the displayed text in the global search. Default true (since 0.3.0). */
  searchable?: boolean;
  /** The column chooser may hide the column. Default true (since 0.3.0). */
  hideable?: boolean;
  /** Override the table-level `resizable` option for this column (since 0.3.0). */
  resizable?: boolean;
  /** Minimum resize width in pixels. Default 64 (since 0.3.0). */
  minWidth?: number;
  /** Maximum resize width in pixels. Default 960 (since 0.3.0). */
  maxWidth?: number;
  /** Include the column in CSV exports of `visible` or `all` columns. Default true (since 0.3.0). */
  exportable?: boolean;
  /** CSV cell value; overrides the formatted or raw value (since 0.3.0). */
  exportValue?: (row: Row) => string | number | boolean | null;
  /**
   * Aggregate shown in group headers and the totals row (since 0.9.0): `'sum'`, `'avg'`,
   * `'min'`, `'max'` (finite numbers), `'count'` (rows), or a function of the values and rows.
   * Formatted by the column `type` (`format` is not used: there is no single row).
   */
  aggregate?: DataTableAggregate<Row>;
  /**
   * Custom header content (since 0.9.0). Decorative: `header` stays the accessible name (kept as
   * visually hidden text) and the name used in messages. Released with `releaseNode` when dropped.
   */
  renderHeader?: (column: DataTableColumn<Row>, doc: Document) => Node;
  /**
   * Inline editing (since 0.9.0): the cell becomes a button that opens an editor. The table never
   * changes `rows`: it emits `aui-cell-edit` and you update `rows`.
   */
  editable?: boolean | ((row: Row) => boolean);
  /** Built-in editor; default from `type` (number/currency: number, date: date, boolean: checkbox, else text). */
  editor?: DataTableEditorKind;
  /** Choices of the `select` editor. */
  editOptions?: readonly DataTableFilterOption[];
  /** Validate an edited value; return a message to keep the editor open with an error. */
  validate?: (value: unknown, row: Row) => string | null;
  /** Custom editor (since 0.9.0); call `commit(value)` or `cancel()`. Released with `releaseNode` when it closes. */
  renderEditor?: (context: DataTableEditorContext<Row>, doc: Document) => Node;
}

/** Built-in inline editors (since 0.9.0). */
export type DataTableEditorKind = 'text' | 'number' | 'date' | 'select' | 'checkbox';

/** Context of a custom editor (since 0.9.0). */
export interface DataTableEditorContext<Row> {
  readonly row: Row;
  readonly rowId: string;
  /** Column id. */
  readonly column: string;
  /** The current cell value (`accessor(row)`). */
  readonly value: unknown;
  /** Validation message of the last commit, or null. */
  readonly error: string | null;
  commit(value: unknown): void;
  cancel(): void;
}

/** `aui-cell-edit` detail (since 0.9.0): update `rows` with `value`. */
export interface DataTableCellEditDetail<Row = unknown> {
  readonly rowId: string;
  readonly row: Row;
  readonly column: string;
  readonly value: unknown;
  readonly previous: unknown;
}

export interface Item<Row> {
  readonly row: Row;
  readonly id: string;
  /** Index in the source `rows` array (keys per-column caches). */
  readonly index: number;
}

export type SortKey = string | number | null;

export const TYPES: readonly DataTableColumnType[] = ['text', 'number', 'currency', 'date', 'datetime', 'boolean'];

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
export const isPlainDate = (v: unknown): v is PlainDate => isObject(v) && v.kind === 'PlainDate' && typeof v.year === 'number' && typeof v.month === 'number' && typeof v.day === 'number';
export const isInstantLike = (v: unknown): v is Instant | ZonedDateTime => isObject(v) && (v.kind === 'Instant' || v.kind === 'ZonedDateTime') && typeof v.epochMilliseconds === 'number';
export const isFunction = (v: unknown): boolean => typeof v === 'function';
/** Non-narrowing array check: keeps the declared element type for later validation. */
export const isArray = (v: unknown): boolean => Array.isArray(v);
export const isObjectLike = (v: unknown): boolean => typeof v === 'object' && v !== null;

export function fail(property: string, expected: string): never {
  throw configurationError('DATA_TABLE_OPTIONS', 'Invalid data table options.', { component: 'dataTable', property: `dataTable.${property}`, expected });
}

/** Default text for a value that has no typed formatter (or does not match its type). */
export function plainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isNaN(value) ? '' : String(value);
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return '';
}

export function sortKey(type: DataTableColumnType, value: unknown): SortKey {
  switch (type) {
    case 'number':
    case 'currency':
      return typeof value === 'number' && !Number.isNaN(value) ? value : null;
    case 'boolean':
      return typeof value === 'boolean' ? Number(value) : null;
    case 'date':
      // month * 100 + day < 10000, so the key orders correctly for any year.
      return isPlainDate(value) ? dateKey(value) : null;
    case 'datetime':
      return isInstantLike(value) ? value.epochMilliseconds : null;
    case 'text':
      return value === null || value === undefined || typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol' ? null : plainText(value);
  }
}

export function dateKey(value: PlainDate): number {
  return value.year * 10000 + value.month * 100 + value.day;
}

// Collators are expensive to create (ICU initialization); one per locale is reused.
const collators = new Map<string, Intl.Collator>();
export function collatorFor(locale: string): Intl.Collator {
  let c = collators.get(locale);
  if (!c) {
    c = new Intl.Collator(locale, { numeric: true });
    collators.set(locale, c);
  }
  return c;
}
