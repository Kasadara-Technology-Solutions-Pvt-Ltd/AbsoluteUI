/**
 * Data Grid public types (internal module; the public surface is re-exported from
 * `./index.ts`). Value types, typed sorting, and formatting follow the Data Table.
 */
import { configurationError } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import type { DataGridFilterKind } from './filter.js';
import type { DataGridColumnEditor } from './editing.js';
import type { DataGridAggregate, DataGridDatePart } from './grouping.js';
import type { DataTableAlign, DataTableColumnType, DataTableSort, DataTableSortCycle } from '../data-table/model.js';

export type DataGridColumnType = DataTableColumnType;
export type DataGridAlign = DataTableAlign;
export type DataGridSort = DataTableSort;
export type DataGridSortCycle = DataTableSortCycle;
export type DataGridPinned = 'start' | 'end';
export type DataGridLayout = 'fill' | 'auto';

/** Context passed to `render`. */
export interface DataGridRenderContext {
  readonly doc: Document;
  /** Column id. */
  readonly column: string;
  readonly rowId: string;
}

/** An image for an Excel cell: PNG or JPEG bytes and the displayed size in CSS pixels. */
export interface DataGridExcelImage {
  readonly bytes: Uint8Array;
  readonly type: 'png' | 'jpeg';
  readonly width: number;
  readonly height: number;
  /** Alternative text (the drawing's description). */
  readonly alt?: string;
}

/** Per-column Excel options. Formulas come only from this code, never from cell text. */
export interface DataGridExcelColumn<Row> {
  /** A named style from the export's `styles` for the column's data cells. */
  readonly style?: string;
  /** A named style per row (undefined: the column style). */
  readonly cellStyle?: (row: Row) => string | undefined;
  /** An Excel number format such as `0.0%` or `#,##0.00` (default from the column type). */
  readonly numberFormat?: string;
  /** A formula without the leading `=`; `ref(columnId)` is the A1 reference of that column's cell in the same row. */
  readonly formula?: (row: Row, ref: (column: string) => string) => string;
  /** A hyperlink (http, https, or mailto; others are left out). */
  readonly link?: (row: Row) => string | null;
  /** An image anchored to the cell (the cell keeps its value). */
  readonly image?: (row: Row) => DataGridExcelImage | null;
  /** Column width in characters (default from the grid width). */
  readonly width?: number;
}

export interface DataGridColumn<Row> {
  /** Unique id among columns and column groups. */
  id: string;
  /** Header text; the column's accessible name. */
  header: string;
  /** Raw value used for sorting and default rendering. Takes precedence over `field`. */
  accessor?: (row: Row) => unknown;
  /** Row property shown in the column when there is no `accessor` (dot paths are not followed). */
  field?: string;
  /** Typed formatting and sorting (Data Table types). Default `text`. */
  type?: DataGridColumnType;
  /** ISO 4217 code for `type: 'currency'`. */
  currency?: string;
  /** Cell text (never HTML). Overrides typed formatting. */
  format?: (value: unknown, row: Row) => string;
  /** Custom cell content. Strings are text; Nodes are consumer-owned and released with `releaseNode` when dropped. */
  render?: (row: Row, context: DataGridRenderContext) => Node | string;
  /** Default `end` for number and currency, otherwise `start`. */
  align?: DataGridAlign;
  /** Width in pixels. Default 160 (or the flex share). */
  width?: number;
  /** Minimum width in pixels. Default 48. */
  minWidth?: number;
  /** Maximum width in pixels. Default 2000. */
  maxWidth?: number;
  /** Share of the width left by the other columns (a positive number). Resizing the column turns it off. */
  flex?: number;
  /** Default true. */
  resizable?: boolean;
  /** Default true. */
  movable?: boolean;
  /** Pin the column to the start or end edge. */
  pinned?: DataGridPinned | null;
  /** The user may not pin or unpin it. */
  lockPinned?: boolean;
  /** Keep the column first (`start`) or last (`end`) in its section; it is not movable. */
  lockPosition?: DataGridPinned;
  /** Hidden columns are not rendered (state keeps them). */
  hidden?: boolean;
  /** Default true. */
  sortable?: boolean;
  /** Custom comparator (ascending). */
  compare?: (a: Row, b: Row) => number;
  /** Tooltip text of the header (also its accessible description). */
  headerTooltip?: string;
  /** Wrap the header text (the header grows to fit). */
  wrapHeader?: boolean;
  /** Wrap cell text; combine with `autoRowHeight` so rows grow to fit. */
  wrapText?: boolean;
  /** Row dragging: this column's cells hold the drag handle (default: the first data column). */
  rowDrag?: boolean;
  /** A cell tooltip (with the tooltips accessory): `true` shows the displayed text, or a text, or a function of the value and row. */
  tooltip?: true | string | ((value: unknown, row: Row) => string);
  /** Merge adjacent data rows with the same displayed value (or that the function calls equal) into one cell. */
  spanRows?: boolean | ((a: Row, b: Row) => boolean);
  /** The number of columns this cell covers in a row (to its end; within its pinned section). */
  colSpan?: (row: Row) => number;
  /** Extra class names for a cell (CSS class tokens). */
  cellClass?: (row: Row) => string | readonly string[] | null | undefined;
  /** Filter kind for this column (filters, the filter panel, and floating filters). */
  filter?: DataGridFilterKind;
  /** Value filters and the quick filter use instead of the displayed text (text filters) or the accessor value. */
  filterValue?: (row: Row) => unknown;
  /** Text filters match case (default false). */
  filterCaseSensitive?: boolean;
  /** Text filters match accents (default false). */
  filterAccentSensitive?: boolean;
  /** Values offered by a set filter (default: the distinct displayed values of the rows). */
  filterValues?: readonly string[];
  /** Business calendar for date filters (working days, holidays, business-day ranges). */
  businessCalendar?: BusinessCalendarEngine;
  /** The quick filter searches this column (default true; visible columns only). */
  searchable?: boolean;
  /** Cells of this column may be written (paste, cut, Delete, fill; editors in a later phase). A function decides per row. */
  editable?: boolean | ((row: Row) => boolean);
  /**
   * A new row with the cell set to `value` (rows are never mutated). Default for `field` columns on
   * plain-object rows: a shallow copy with the field replaced. Must keep the row id.
   */
  setValue?: (row: Row, value: unknown) => Row;
  /** Aggregate shown in group rows and totals (a built-in name or a function of the group's values). */
  aggregate?: DataGridAggregate<Row>;
  /** Show a numeric aggregate as a percentage of the grand total or of the parent group. */
  showAs?: 'percentOfGrandTotal' | 'percentOfParent';
  /** The column can be grouped from the group panel. Default false (grouped columns always can). */
  groupable?: boolean;
  /** Date and date-time columns: group by these date parts as nested levels (in the grid's time zone). */
  groupHierarchy?: readonly DataGridDatePart[];
  /** The cell editor: a provided one (`{ kind, ... }`, default by column type) or `{ create(context) }`. */
  editor?: DataGridColumnEditor<Row>;
  /** An edit must leave a value (not blank). */
  required?: boolean;
  /** A message when an edited value is not acceptable (the edit is blocked or reverted), else null. */
  validate?: (value: unknown, row: Row) => string | null;
  /** Convert pasted text to a value; return `undefined` to reject it. Default: by column type, in the grid's locale. */
  parseValue?: (text: string, row: Row) => unknown;
  /** Text copied to the clipboard for a cell (default: the displayed text). */
  copyValue?: (value: unknown, row: Row) => string;
  /** Include the column in CSV and Excel exports of `visible` or `all` columns. Default true. */
  exportable?: boolean;
  /**
   * A calculated column (needs the grid's `formulas` option): a formula evaluated for every row, for example
   * `[Price] * [Quantity]` (`[Column]` is the same row's value). Read-only; sorts, filters, groups, and exports.
   */
  formula?: string;
  /**
   * Cell formulas (needs the grid's `formulas` option): a value that is text starting with `=` is a formula, stored
   * in the row data like any value and shown as its result; editing shows the formula. Fill and paste move
   * relative A1 references.
   */
  formulas?: boolean;
  /** Excel export (`toXlsx` in `data-grid/export`): styles, number format, formulas, links, images, width. */
  excel?: DataGridExcelColumn<Row>;
  /** Highlight the cell when its displayed text changes in an update (see the grid `flashChanges`). */
  flashOnChange?: boolean;
  /** Classes added to a cell while their predicate is true (re-evaluated on every render). */
  cellClassRules?: Readonly<Record<string, (value: unknown, row: Row) => boolean>>;
  /** In a collapsible group: show only while the group is expanded or collapsed. Default always. */
  visibleWhen?: 'expanded' | 'collapsed';
}

export interface DataGridColumnGroup<Row> {
  /** Unique id among columns and column groups. */
  id: string;
  /** Group header text. */
  header: string;
  children: readonly DataGridColumnDef<Row>[];
  /** The header toggles between expanded and collapsed (children use `visibleWhen`). */
  collapsible?: boolean;
  /** Initial collapsed state of a collapsible group. */
  collapsed?: boolean;
  /** Tooltip text of the group header. */
  headerTooltip?: string;
}

export type DataGridColumnDef<Row> = DataGridColumn<Row> | DataGridColumnGroup<Row>;

export interface DataGridIcons {
  sortAscending: IconRef;
  sortDescending: IconRef;
  sortNone: IconRef;
  /** Collapsible group (collapsed). Mirrored in right-to-left layouts. */
  expand: IconRef;
  /** Collapsible group (expanded). */
  collapse: IconRef;
  loading: IconRef;
  /** Filter button in filterable headers. */
  filter: IconRef;
  /** Row drag handle. */
  drag: IconRef;
}

/** The focused cell: a data cell (`rowId`) or a header (`rowId: null`, `level` from 0 at the top). */
export interface DataGridCellPosition {
  readonly rowId: string | null;
  readonly column: string;
  readonly level?: number;
}

export const isGroup = <Row>(def: DataGridColumnDef<Row>): def is DataGridColumnGroup<Row> => 'children' in def;

export function fail(property: string, expected: string): never {
  throw configurationError('DATA_GRID_OPTIONS', 'Invalid data grid options.', { component: 'dataGrid', property: `dataGrid.${property}`, expected });
}
