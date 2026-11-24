/**
 * Data Grid (docs/PLAN-R11-G1.md): an ARIA grid with cell focus, the WAI-ARIA APG grid
 * keyboard model, row and column virtualization in one native scroll container, column
 * groups, pinned columns (logical `position: sticky`), multi-sort, and column resizing.
 * Behavior follows established data-grid conventions; names and design are AbsoluteUI's.
 *
 * Internal modules: `model.ts` (types), `columns.ts` (column layout), `heights.ts` (row
 * offsets). Typed values, sorting, and formatting are shared with the Data Table.
 */
import {
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatInstant,
  formatNumber,
  formatPlainDate,
  getMessage,
  instant,
  instantToString,
  plainDateToString,
  registerMessages,
  releaseNode,
  validators,
  type Density,
  type Direction,
  type Disposer,
} from '@absoluteui/core';
import { renderIcon } from '@absoluteui/icons';
import { announce, autoPosition, focusFirst, observeResize, openPopover, shouldAnimate, trackPointerDrag, type PopoverHandle } from '@absoluteui/utilities';
import { isArray, isInstantLike, isObjectLike, isPlainDate, plainText, type DataTableColumn, type Item } from '../data-table/model.js';
import { csvField, type CsvValue } from '../data-table/csv.js';
import { centerWindow, clampWidth, displayOrder, layoutColumns, moveUnit, parentOf, resolveColumns, unitAt, type ColumnLayout, type ColumnState, type HeaderCell, type Leaf, type PlacedColumn, type Section } from './columns.js';
import { RowHeights } from './heights.js';
import { SortEngine } from './sort.js';
import { compileFilter, normalizer, parseFilter, todayIn, type DataGridFilter, type DataGridFilterKind, type DataGridFilters, type FilterColumn, type FilterEnvironment } from './filter.js';
import { compileAdvancedFilter, parseAdvancedFilter, type DataGridAdvancedFilter } from './advanced-filter.js';
import { createAdvancedBar, openAdvancedBuilder, type AdvancedBar, type AdvancedUiColumn } from './advanced-filter-ui.js';
import type { Dialog } from '../dialog/dialog.js';
import { createFilterPanel, createFloatingFilter, type FilterDraft, type FilterPanel, type FilterUiColumn, type FloatingFilter } from './filter-ui.js';
import { getFirstDayOfWeek, plainDate, toPlainDateTime, type PlainDate } from '@absoluteui/core';
import { Pagination, type PaginationOptions } from '../pagination/pagination.js';
import { parseState, type DataGridColumnsState, type DataGridState } from './state.js';
import { parseRange, resolveRange, toHtmlTable, toTsv, type DataGridCellRange, type RangeRect } from './ranges.js';
import { fillSeries, parseCellText, parseTsv } from './writes.js';
import { buildGroups, compareValues, flattenGroups, grandTotals, keyId, type AggregateColumn, type DataGridDatePart, type DisplayRow, type GroupLevel, type GroupNode } from './grouping.js';
import { buildTree, flattenNested, flattenTree, treeGroups, type TreeNode, type TreeRelation } from './tree.js';
import { ServerCache, type DataGridDatasource, type DataGridServerTransaction } from './server.js';
import { cellKey, parsePivot, pivotCells, PIVOT_AGGREGATES, type DataGridPivot, type DataGridPivotValue } from './pivot.js';
import { createProvidedEditor, defaultEditorKind, editorMessageId, isCustomEditor, isInvalidInput, type DataGridCellEditor, type DataGridEditorContext } from './editing.js';
import { fail, type DataGridCellPosition, type DataGridColumn, type DataGridColumnDef, type DataGridColumnGroup, type DataGridIcons, type DataGridLayout, type DataGridPinned, type DataGridSort, type DataGridSortCycle } from './model.js';

export interface DataGridConfig {
  /** Shift+click / Shift+Enter adds a column to the sort. Default true. */
  multiSort: boolean;
  /** `tri-state`: ascending, descending, unsorted. `bi-state`: ascending, descending. */
  sortCycle: DataGridSortCycle;
  /** Rows rendered beyond each edge of the viewport. Default 8. */
  overscan: number;
  /** Milliseconds between applying queued `applyTransactionAsync` batches. Default 50. */
  transactionDelay: number;
  /** Rows move to their new position with a short transition after a sort or update (off with reduced motion). Default true. */
  animateRows: boolean;
  /** Milliseconds after typing stops before a typed filter value applies (Enter applies at once). Default 250. */
  filterDelay: number;
  /** Conditions offered per text, number, and date filter in the filter panel (1 to 10). Default 2. */
  maxFilterConditions: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    dataGrid: DataGridConfig & { locale: string; timezone: string; density: Density; direction: Direction };
  }
}

export const dataGridConfig = defineComponentConfig<DataGridConfig, 'locale' | 'timezone' | 'density' | 'direction'>(
  'dataGrid',
  {
    multiSort: { default: true, expected: 'boolean', validate: validators.isBoolean },
    sortCycle: { default: 'tri-state', expected: '"tri-state" | "bi-state"', validate: validators.oneOf(['tri-state', 'bi-state'] as const) },
    overscan: { default: 8, expected: 'integer from 0 to 200', validate: validators.integerInRange(0, 200) },
    transactionDelay: { default: 50, expected: 'integer from 0 to 10000 (milliseconds)', validate: validators.integerInRange(0, 10_000) },
    animateRows: { default: true, expected: 'boolean', validate: validators.isBoolean },
    filterDelay: { default: 250, expected: 'integer from 0 to 10000 (milliseconds)', validate: validators.integerInRange(0, 10_000) },
    maxFilterConditions: { default: 2, expected: 'integer from 1 to 10', validate: validators.integerInRange(1, 10) },
  },
  ['locale', 'timezone', 'density', 'direction'],
);

registerMessages('dataGrid', 'en', {
  ascending: 'ascending',
  descending: 'descending',
  sortPriority: 'sort priority {priority}',
  sorted: 'Sorted by {columns}',
  sortedColumn: '{column}, {direction}',
  sortCleared: 'Sorting cleared',
  noMatches: 'No matching rows',
  results: '{count} rows',
  resultsOne: '1 row',
  empty: 'No rows to show',
  loading: 'Loading',
  yes: 'Yes',
  no: 'No',
  resized: '{column}: {width} pixels wide',
  groupExpanded: '{group} expanded',
  groupCollapsed: '{group} collapsed',
  pagination: '{label} pages',
  moved: '{column} moved to position {position} of {count}',
  pinnedStart: '{column} pinned to the start',
  pinnedEnd: '{column} pinned to the end',
  unpinned: '{column} unpinned',
  selectionColumn: 'Row selection',
  selectRow: 'Select {row}',
  selectRowFallback: 'Select row {index}',
  selectAllRows: 'Select all rows',
  rowsSelected: '{count} rows selected',
  rowSelected: '1 row selected',
  noRowsSelected: 'No rows selected',
  rangeSelected: '{rows} by {columns} cells selected',
  copied: 'Copied {rows} by {columns} cells',
  cellsPasted: '{count} cells pasted',
  cellsCleared: '{count} cells cleared',
  cellsFilled: '{count} cells filled',
  cellsRejected: '{count} values could not be used',
  rowName: 'Row {index}',
  editLabel: '{column}, {row}',
  editRequired: 'Enter a value',
  editMin: 'Enter {min} or more',
  editMax: 'Enter {max} or less',
  editMaxLength: 'Use at most {max} characters',
  editInvalidNumber: 'Enter a number',
  editInvalidDate: 'Enter a valid date',
  editInvalidTime: 'This time does not exist in the time zone',
  editEmpty: '(None)',
  editDiscarded: 'Edit discarded: {message}',
  pendingEdit: 'edited',
  groupColumn: 'Group',
  groupLabel: '{group} ({count})',
  groupBlank: '(Blanks)',
  groupTotal: 'Total',
  groupTotalOf: 'Total {group}',
  rowGroupExpanded: '{group} expanded, {count} rows',
  rowGroupCollapsed: '{group} collapsed',
  rowGroupExpandedOnly: '{group} expanded',
  detailColumn: 'Details',
  rowNumberColumn: 'Row number',
  dragHandle: 'Move {row}',
  rowsMoved: '{count} rows moved',
  rowMoved: 'Row moved to position {position}',
  rowMovedInto: 'Row moved under {parent}',
  rowsNotMovable: 'Rows cannot be moved while sorted, filtered, or grouped',
  rowsSent: '{count} rows sent to {zone}',
  formulaErrorDivide: 'division by zero',
  formulaErrorValue: 'wrong type of value',
  formulaErrorRef: 'reference to a missing cell or column',
  formulaErrorName: 'unknown function or invalid formula',
  formulaErrorNa: 'value not found',
  formulaErrorNum: 'number out of range',
  formulaErrorCircular: 'circular reference',
  formulaErrorLimit: 'formula too large to calculate',
  formulaErrorOther: 'formula error',
  formulaInvalid: 'Invalid formula: {message}',
  formulaValueInvalid: 'Enter a value of this column\'s type, or a formula starting with =',
  dropFiles: 'Drop files to load',
  filesNotAccepted: 'The dropped files are not accepted here',
  rowSent: 'Row sent to {zone}',
  dragging: '{count} rows',
  columnName: 'Column name',
  columnRenamed: 'Column renamed to {name}',
  pinnedTop: 'Pinned to top',
  pinnedBottom: 'Pinned to bottom',
  rowPinned: 'Row pinned to the {side}',
  rowUnpinned: 'Row unpinned',
  rowResized: 'Row height {height} pixels',
  rowsLoading: 'Loading',
  rowsFailed: 'Rows could not load: {message}',
  rowsRetry: 'Retry',
  rowsFailedAnnounce: 'Some rows could not load',
  serverRowCount: '{count} rows',
  pivotPanel: 'Pivot',
  pivotRows: 'Rows',
  pivotColumns: 'Columns',
  pivotValues: 'Values',
  pivotEmpty: 'None',
  pivotAdd: 'Add to {zone}',
  pivotMoveEarlier: 'Move {column} earlier in {zone}',
  pivotMoveLater: 'Move {column} later in {zone}',
  pivotRemove: 'Remove {column} from {zone}',
  pivotAggregateOf: 'Aggregate of {column}',
  pivotValue: '{aggregate} of {column}',
  pivotTotal: 'Total',
  pivotChanged: 'Pivot: rows {rows}; columns {columns}; values {values}',
  pivotTruncated: 'Showing {shown} of {total} pivot columns',
  aggregateSum: 'Sum',
  aggregateCount: 'Count',
  aggregateAvg: 'Average',
  aggregateMin: 'Min',
  aggregateMax: 'Max',
  aggregateDistinctCount: 'Distinct count',
  detailExpanded: 'Details of {row} expanded',
  detailCollapsed: 'Details of {row} collapsed',
  groupPanel: 'Row groups',
  groupPanelLabel: 'Group by',
  groupPanelEmpty: 'Drag a column header here, or choose a column',
  groupAdd: 'Add a row group',
  groupAddPlaceholder: 'Add a column',
  groupMoveEarlier: 'Move {column} earlier',
  groupMoveLater: 'Move {column} later',
  groupRemove: 'Remove {column} from the row groups',
  groupedBy: 'Grouped by {columns}',
  ungrouped: 'Grouping removed',
  quarterOf: 'Q{quarter} {year}',
  weekOf: 'Week {week}, {year}',
  partYear: 'year',
  partQuarter: 'quarter',
  partMonth: 'month',
  partWeek: 'week',
  partDay: 'day',
  selectGroup: 'Select {group}',
  undone: 'Undid changes to {count} cells',
  redone: 'Redid changes to {count} cells',
});

/** Which rows Select all (the header checkbox, Ctrl+A) affects. */
export type DataGridSelectAllScope = 'filtered' | 'all' | 'page';

export interface DataGridRowSelection<Row = unknown> {
  /** One row at a time, or any number. */
  mode: 'single' | 'multiple';
  /** A checkbox column pinned to the start. Default true. */
  checkboxes?: boolean;
  /** A Select all checkbox in that column's header (multiple mode). Default true. */
  headerCheckbox?: boolean;
  /** Rows Select all affects: those passing the filters (default), every row, or the current page. */
  selectAll?: DataGridSelectAllScope;
  /** A click on a row selects it (Ctrl/Cmd toggles, Shift selects a range). Default false: clicks only focus. */
  clickToSelect?: boolean;
  /** Rows that may be selected (others show a disabled checkbox and are skipped). */
  selectable?: (row: Row) => boolean;
}

/** Cell range selection: several ranges (default true) and column selection by header (default false). */
export interface DataGridCellSelection {
  multiple?: boolean;
  /** Enter or a click on a leaf header selects its column; sorting moves to Alt+Enter and Alt+click. */
  columnSelection?: boolean;
  /** A handle at the range corner: drag to fill (series; Alt repeats or counts), double-click to fill down. Default false. */
  fillHandle?: boolean;
}

/** One written cell. */
export interface DataGridCellChange {
  readonly rowId: string;
  readonly column: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

/** `aui-cells-change` detail. */
export interface DataGridCellsChangeDetail {
  readonly changes: readonly DataGridCellChange[];
  readonly source: 'paste' | 'cut' | 'delete' | 'fill' | 'edit' | 'bulk' | 'undo' | 'redo' | 'batch';
  /** False with `readOnlyEdits`: the application applies the changes. */
  readonly applied: boolean;
  /** Pasted text the column could not convert (left unchanged). */
  readonly rejected: readonly { readonly rowId: string; readonly column: string; readonly text: string }[];
}

/** What a detail renderer receives. */
export interface DataGridDetailContext {
  readonly doc: Document;
  readonly rowId: string;
}

/** Master/detail: an expandable detail row under each master row. */
export interface DataGridDetail<Row> {
  /** The detail content (any node: text, a form, a nested Data Grid). Called once per master row while its content is kept. */
  render: (row: Row, context: DataGridDetailContext) => Node;
  /** Fixed height in px (default 300), or `auto` (measured). */
  height?: number | 'auto';
  /** Which rows have details (default: every data row). */
  isMaster?: (row: Row) => boolean;
  /** Collapsed details whose content is kept for a quick reopen (default 10; expanded ones are always kept). */
  keep?: number;
  /** Details start expanded. Default false. */
  expandedByDefault?: boolean;
  /** Called when kept content is released (destroy nested grids here). */
  destroy?: (node: Node, row: Row) => void;
}

/** A button an accessory adds to every data column's header. */
export interface DataGridHeaderButton {
  /** Unique per accessory; also the button's class name. */
  readonly key: string;
  readonly icon: string;
  /** The button's accessible name for a column header text. */
  readonly label: (header: string) => string;
  /** `aria-haspopup` of the button. */
  readonly popup?: 'menu' | 'dialog';
  readonly activate: (column: string, button: HTMLButtonElement) => void;
}

/** A column as accessories see it. */
export interface DataGridAccessoryColumn {
  readonly id: string;
  readonly header: string;
  readonly hidden: boolean;
  readonly pinned: DataGridPinned | null;
  readonly sortable: boolean;
  readonly filterable: boolean;
  readonly groupable: boolean;
  readonly grouped: boolean;
  readonly movable: boolean;
  readonly hideable: boolean;
}

/** What an accessory (menus, panels; the data-grid/accessories entry point) may use. */
export interface DataGridAccessoryContext<Row> {
  readonly grid: DataGrid<Row>;
  /** The `grid` / `treegrid` element and the host. */
  readonly element: HTMLElement;
  readonly host: HTMLElement;
  readonly doc: Document;
  readonly locale: () => string;
  readonly direction: () => 'ltr' | 'rtl';
  /** The cell or header under an event target (`rowId` null for headers; pinned copies give the row's id). */
  readonly cellAt: (target: EventTarget | null) => { rowId: string | null; column: string; pinned: 'top' | 'bottom' | null } | null;
  /** Data columns in display order (generated columns left out). */
  readonly columns: () => DataGridAccessoryColumn[];
  readonly row: (rowId: string) => Row | undefined;
  readonly addHeaderButton: (button: DataGridHeaderButton) => void;
  /** User actions (announced and emitted like their pointer and keyboard counterparts). */
  readonly sort: (column: string, direction: 'ascending' | 'descending' | null) => void;
  readonly group: (column: string, grouped: boolean) => void;
  readonly openFilter: (column: string) => void;
  readonly editHeader: (column: string) => void;
  readonly copy: (headers: boolean) => Promise<string>;
  readonly cut: () => Promise<string>;
  readonly paste: (text: string) => void;
  readonly pinRow: (rowId: string, side: 'top' | 'bottom' | null) => void;
  /** Managed row dragging: whether a row can move up or down now, and the move (as Ctrl+Shift+arrows). */
  readonly canMoveRow: (rowId: string, direction: 'up' | 'down') => boolean;
  readonly moveRow: (rowId: string, direction: 'up' | 'down') => void;
  /** Drop zones (`addRowDropZone`) by label, and sending a row (the selected rows with multiRow) to one. */
  readonly dropZones: () => readonly string[];
  readonly sendToZone: (index: number, rowId: string) => void;
  readonly announce: (text: string) => void;
  /** Focus moves back to the grid's tab stop. */
  readonly focusGrid: () => void;
  /** Row counts: every row (the server's count with a datasource), rows passing the filters, selected rows. */
  readonly counts: () => { total: number; filtered: number; selected: number };
  /** Raw values of the cells in the cell ranges (empty unless the ranges cover two cells or more). */
  readonly rangeValues: () => unknown[];
  /** A container of the accessory's own in the toolbar above the grid (created on first use). */
  readonly toolbarSlot: (key: string) => HTMLElement;
  /** A container beside the rows (start or end side, created on first use). */
  readonly sideSlot: (position: 'start' | 'end') => HTMLElement;
  /** A column's filter editor inline in a container (changes apply as in the filter popup); null for columns without a filter. Returns its remover. */
  readonly filterEditor: (column: string, container: HTMLElement) => (() => void) | null;
  /** Whether a column has a filter now. */
  readonly isFiltered: (column: string) => boolean;
  /** The rendered cell of a position (pinned copies excluded), or null when it is not rendered. */
  readonly cellElement: (rowId: string, column: string) => HTMLElement | null;
  /** A row's name (its first data column's text, else "Row n"). */
  readonly rowLabel: (rowId: string) => string;
  /** A cell's tooltip text (its column's `tooltip`), or null. */
  readonly tooltip: (rowId: string, column: string) => string | null;
  /** Cells of the displayed rows (all pages; collapsed groups' rows excluded) whose displayed text contains `text`, in display order. */
  readonly search: (text: string, caseSensitive: boolean) => { rowId: string; column: string }[];
  /** Scroll (and page) a displayed cell into view without moving focus. */
  readonly reveal: (rowId: string, column: string) => void;
  /** Mark cells (a class, and an optional text appended for assistive technology); null removes the decorator. */
  readonly decorate: (key: string, decorator: ((rowId: string, column: string) => { className: string; description?: string } | null) | null) => void;
  /** Repaint the decorations of the rendered cells. */
  readonly refreshDecorations: () => void;
  /** Called (batched) after rows, filters, sorting, grouping, selection, or ranges change. Returns an unsubscribe function. */
  readonly onUpdate: (listener: () => void) => () => void;
}

export interface DataGridAccessory<Row> {
  /** Wire the accessory up; the returned function removes it. */
  attach(context: DataGridAccessoryContext<Row>): () => void;
}

/** Row dragging started: the rows being dragged. */
export interface DataGridRowDragStartDetail {
  readonly rowIds: readonly string[];
}

/** Row dragging: what moved where (`inside`: as the last child of the target, tree data only). */
export interface DataGridRowDropDetail {
  readonly rowIds: readonly string[];
  readonly targetId: string;
  readonly position: 'before' | 'after' | 'inside';
  readonly source: 'pointer' | 'keyboard';
}

export interface DataGridRowDragging<Row> {
  /** The grid moves the rows (flat rows, or tree data with parentIdField); otherwise only `aui-row-drop` is emitted. */
  managed?: boolean;
  /** Dragging a selected row drags every selected row. */
  multiRow?: boolean;
  /** Rows that can be dragged (default all). */
  canDrag?: (row: Row) => boolean;
  /** Native drag and drop: the handle is `draggable` and a drag carries this data (MIME type to text) to other apps and elements. */
  nativeData?: (rows: readonly Row[]) => Readonly<Record<string, string>>;
}

/** Formulas (data-grid/formulas): the cells a formula engine reads. */
export interface DataGridFormulaSource {
  readonly rowCount: number;
  readonly columnCount: number;
  column(name: string): number;
  formula(row: number, column: number): string | null;
  value(row: number, column: number): unknown;
  formulaRows(column: number, top: number, bottom: number): Iterable<number>;
}

/** Computed formula results over a source (results of errors are `{ error: code }`). */
export interface DataGridFormulaBook {
  value(row: number, column: number): unknown;
  invalidate(row: number, column: number): void;
  invalidateAll(): void;
}

/** A formula engine: `formulaEngine()` from `@absoluteui/components/data-grid/formulas`. */
export interface DataGridFormulaEngine {
  create(source: DataGridFormulaSource, environment: { readonly today: () => PlainDate }): DataGridFormulaBook;
  /** A syntax problem of a formula (its message), or null. */
  check(text: string): string | null;
  /** The formula with relative A1 references moved (fill and paste). */
  shift(text: string, rows: number, columns: number): string;
  /** The editor of cells in `formulas` columns (autocomplete, hints, reference insertion). */
  editor?(context: DataGridEditorContext, columns: readonly { readonly id: string; readonly header: string }[]): DataGridCellEditor;
}

const isFormulaText = (v: unknown): v is string => typeof v === 'string' && v.length > 1 && v.startsWith('=');

/** Message keys for formula error codes (read after the code). */
const FORMULA_ERRORS: Readonly<Record<string, string>> = { '#DIV/0!': 'formulaErrorDivide', '#VALUE!': 'formulaErrorValue', '#REF!': 'formulaErrorRef', '#NAME?': 'formulaErrorName', '#N/A': 'formulaErrorNa', '#NUM!': 'formulaErrorNum', '#CIRCULAR!': 'formulaErrorCircular', '#LIMIT!': 'formulaErrorLimit' };

const isFormulaErrorValue = (v: unknown): v is { readonly error: string } => {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false;
  const code: unknown = v.error;
  return typeof code === 'string' && code.startsWith('#');
};

/** Printing: the CSV row and column choices and a title (default: the grid label). */
export interface DataGridPrintOptions extends Pick<DataGridCsvOptions<unknown>, 'columns' | 'rows' | 'groups' | 'pinned'> {
  readonly title?: string;
}

const PRINT_LIMIT = 20_000;

/** Which rows and columns an export covers (the CSV choices). */
export type DataGridExportOptions = Pick<DataGridCsvOptions<unknown>, 'columns' | 'rows' | 'groups' | 'pinned'> & {
  /** Display text of data cells: `all` (default) or `needed` (only where the value is not a number, boolean, text, date, or instant, or the column has `format`; faster). */
  readonly text?: 'all' | 'needed';
};

export interface DataGridExportColumn<Row> {
  readonly id: string;
  readonly header: string;
  readonly def: DataGridColumn<Row>;
  /** Width in CSS pixels. */
  readonly width: number;
  readonly pinned: 'start' | 'end' | null;
}

/** A column group header cell spanning `span` columns (`id` null: no group at that level). */
export interface DataGridExportHeaderCell {
  readonly id: string | null;
  readonly text: string;
  readonly span: number;
}

/** A cell: the raw value (aggregates as numbers; group labels as text) and the displayed text; `percent` for shown-as percentages. */
export interface DataGridExportCell {
  readonly value: unknown;
  readonly text: string;
  readonly percent?: boolean;
}

export interface DataGridExportRow<Row> {
  readonly kind: 'data' | 'group' | 'total';
  readonly id: string;
  readonly row: Row | null;
  /** 0 at the top level. */
  readonly level: number;
  /** A group row collapsed in the grid. */
  readonly collapsed: boolean;
  /** Inside a group collapsed in the grid. */
  readonly hidden: boolean;
  readonly cells: readonly DataGridExportCell[];
}

export interface DataGridExportData<Row> {
  readonly columns: readonly DataGridExportColumn<Row>[];
  /** Column group rows above the header, top first. */
  readonly headerRows: readonly (readonly DataGridExportHeaderCell[])[];
  readonly rows: readonly DataGridExportRow<Row>[];
  readonly locale: string;
  readonly timezone: string;
}

/** One exported cell for the CSV `value` callback: the row (null for group and total rows), the raw value of data cells, and the default text. */
export interface DataGridCsvCell<Row> {
  readonly kind: 'data' | 'group' | 'total';
  readonly column: string;
  readonly row: Row | null;
  readonly value: unknown;
  readonly text: string;
}

export interface DataGridCsvOptions<Row> {
  /** `visible` (default: displayed columns in display order), `all` (hidden too), or column ids. Columns with `exportable: false` are left out of visible and all. */
  readonly columns?: 'visible' | 'all' | readonly string[];
  /**
   * `filtered` (default: every row passing the filters in sort order, across pages; group rows and totals with every
   * group expanded), `page` (the displayed rows of the current page, as expanded), `selected` (selected rows in sort
   * order, ignoring filters), `all` (every row in sort order, ignoring filters), or `range` (the active cell range).
   * With a datasource only loaded rows exist.
   */
  readonly rows?: 'filtered' | 'page' | 'selected' | 'all' | 'range';
  /** `rows` (default): group rows and totals while grouped; `none`: data rows only. */
  readonly groups?: 'rows' | 'none';
  /** Header row (and the column group rows above it). Default true. */
  readonly header?: boolean;
  /** Column group rows above the header. Default true. */
  readonly columnGroups?: boolean;
  /** Pinned rows before and after the body rows. Default false. */
  readonly pinned?: boolean;
  /** `formatted` (default: the displayed text) or `raw` (numbers, true/false, ISO 8601 dates and UTC instants). */
  readonly values?: 'formatted' | 'raw';
  /** Prefix per level for group and tree labels (default two spaces; at most 8 characters). */
  readonly indent?: string;
  readonly delimiter?: ',' | ';' | '\t';
  /** Default CRLF (RFC 4180), or LF. */
  readonly lineEnding?: '\r\n' | '\n';
  /** Prefix a UTF-8 byte order mark. Default false. */
  readonly bom?: boolean;
  /** Formula-injection protection. Default true; disable only for trusted, non-spreadsheet consumers. */
  readonly escapeFormulas?: boolean;
  /** A cell's exported value (undefined keeps the default; numbers and booleans are trusted, strings are escaped). */
  readonly value?: (cell: DataGridCsvCell<Row>) => string | number | boolean | null | undefined;
}

function assertGridCsv<Row>(o: DataGridCsvOptions<Row>): void {
  const bad = (property: string, expected: string): never => {
    throw configurationError('DATA_GRID_CSV', 'Invalid CSV export options.', { component: 'dataGrid', property: `dataGrid.toCsv.${property}`, expected });
  };
  const v: unknown = o;
  if (!isObjectLike(v)) bad('', 'object');
  const columns: unknown = o.columns;
  if (columns !== undefined && columns !== 'visible' && columns !== 'all' && !(Array.isArray(columns) && columns.every((c) => typeof c === 'string'))) bad('columns', '"visible" | "all" | column id array');
  const oneOf = (key: keyof DataGridCsvOptions<Row>, values: readonly unknown[], expected: string): void => {
    if (o[key] !== undefined && !values.includes(o[key])) bad(key, expected);
  };
  oneOf('rows', ['filtered', 'page', 'selected', 'all', 'range'], '"filtered" | "page" | "selected" | "all" | "range"');
  oneOf('groups', ['rows', 'none'], '"rows" | "none"');
  oneOf('values', ['formatted', 'raw'], '"formatted" | "raw"');
  oneOf('delimiter', [',', ';', '\t'], '"," | ";" | tab');
  oneOf('lineEnding', ['\r\n', '\n'], 'CRLF or LF');
  for (const key of ['header', 'columnGroups', 'pinned', 'bom', 'escapeFormulas'] as const) if (o[key] !== undefined && typeof o[key] !== 'boolean') bad(key, 'boolean');
  if (o.indent !== undefined && (typeof o.indent !== 'string' || o.indent.length > 8)) bad('indent', 'string of at most 8 characters');
  if (o.value !== undefined && typeof o.value !== 'function') bad('value', 'function');
}

export interface DataGridFileDrop {
  /** The overlay text (default "Drop files to load"). */
  readonly label?: string;
  readonly accept?: readonly string[];
  readonly onFiles: (files: readonly File[]) => void;
}

/** Whether a file matches an accept list (extensions, MIME types, `type/*`). */
function acceptsFile(file: File, accept: readonly string[] | undefined): boolean {
  if (!accept || accept.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept.some((a) => {
    const x = a.trim().toLowerCase();
    return x.startsWith('.') ? name.endsWith(x) : x.endsWith('/*') ? type.startsWith(x.slice(0, -1)) : type === x;
  });
}

/** What aligned grids use of each other. */
interface AlignedGrid {
  getColumnsState(): DataGridColumnsState;
  setState(state: unknown): void;
}

/** Where dragged rows can be dropped outside the grid (`addRowDropZone`); `rowDropZone()` of another grid makes one. */
export interface DataGridRowDropZone<Row> {
  readonly element: HTMLElement;
  /** Names the zone in the cell menu's Send to submenu (the keyboard path) and in announcements. */
  readonly label: string;
  readonly onDragEnter?: (detail: DataGridRowZoneDetail<Row>) => void;
  readonly onDragMove?: (detail: DataGridRowZoneDetail<Row>) => void;
  readonly onDragLeave?: (detail: DataGridRowZoneDetail<Row>) => void;
  readonly onDrop: (detail: DataGridRowZoneDetail<Row>) => void;
}

/** A drag over or a drop on a zone: the rows, the pointer (null from the menu), and the source grid. */
export interface DataGridRowZoneDetail<Row> {
  readonly rowIds: readonly string[];
  readonly rows: readonly Row[];
  readonly x: number | null;
  readonly y: number | null;
  readonly grid: DataGrid<Row>;
}

export interface DataGridRowPinDetail {
  readonly rowId: string;
  readonly pinned: 'top' | 'bottom' | null;
}

export interface DataGridRowResizeDetail {
  readonly rowId: string;
  /** The new height in px, or null when the row went back to its default height. */
  readonly height: number | null;
}

export interface DataGridPivotChangeDetail {
  readonly pivot: DataGridPivot | null;
}

export interface DataGridDetailToggleDetail {
  readonly rowId: string;
  readonly expanded: boolean;
}

/** Where dragged rows drop among a grid's rows. */
interface DropTarget {
  readonly id: string;
  readonly position: 'before' | 'after' | 'inside';
}

/** The class on a drop zone's element while rows are dragged over it. */
const ZONE_ACTIVE = 'aui-data-grid-drop-zone--active';

/** An undo step: cell writes, or a row order (row moves). */
type UndoStep<Row> = DataGridCellChange[] | { readonly before: readonly Row[]; readonly after: readonly Row[]; readonly ids: readonly string[] };

/** A run of server rows not loaded yet in the display list: where it starts, its cache, and its first position there. */
interface ServerSegment<Row> {
  readonly start: number;
  readonly count: number;
  readonly cache: ServerCache<Row>;
  readonly route: string;
  readonly from: number;
  readonly level: number;
}

/** Tree data: exactly one of `getPath`, `parentIdField`, `childrenField`, or (with a datasource) `serverGroup` and `serverKey`. */
export interface DataGridTreeData<Row> {
  /** The path of a row (`['Docs', 'Plans', 'Budget']`); missing levels become filler rows. */
  getPath?: (row: Row) => readonly string[];
  /** A field holding the parent row's id (blank: a root row). */
  parentIdField?: string;
  /** A field holding the nested child rows (read when rows are set). */
  childrenField?: string;
  /** The column whose text labels rows in the group column (parent ids and nested children; default: the first column). */
  label?: string;
  /** Server tree data: whether a row has children (they load from the datasource when it expands). */
  serverGroup?: (row: Row) => boolean;
  /** Server tree data: the key of a parent row, sent in `groupKeys` for its children. */
  serverKey?: (row: Row) => string;
}

export interface DataGridOptions<Row> extends Partial<DataGridConfig> {
  /** Accessible name of the grid (required). */
  label: string;
  /** Accessible description of the grid. */
  description?: string;
  columns: readonly DataGridColumnDef<Row>[];
  rows: readonly Row[];
  /** Stable, unique, non-empty id per row. */
  rowId: (row: Row) => string;
  /** Row height in pixels, or a function of the row. Default by density: 32, 40, or 48. */
  rowHeight?: number | ((row: Row) => number);
  /** Measure rendered rows and let them grow to their content (wrapped text). */
  autoRowHeight?: boolean;
  /** `fill` (default): fills the host, which needs a height. `auto`: grows with its rows up to the host's max height. */
  layout?: DataGridLayout;
  /** Current sort, by priority. */
  sort?: DataGridSort | readonly DataGridSort[] | null;
  /** Rows per page; `null` (default) shows every row in one scrolling grid. */
  pageSize?: number | null;
  /** Offer a "Rows per page" choice with these sizes. */
  pageSizes?: readonly number[];
  /** Current page, 1-based (clamped). */
  page?: number;
  /** Highlight cells whose displayed text changes when rows are updated. Columns can opt in with `flashOnChange`. */
  flashChanges?: boolean;
  /** Milliseconds a changed cell stays highlighted (100 to 10000). Default 800. */
  flashDuration?: number;
  /** Classes added to a row while their predicate is true (re-evaluated on every render). */
  rowClassRules?: Readonly<Record<string, (row: Row) => boolean>>;
  /** Active column filters by column id (JSON models; see `DataGridFilter`). */
  filters?: DataGridFilters;
  /** Rows must contain every word of this text in some searchable visible column (case- and accent-insensitive). */
  quickFilter?: string;
  /** An application filter applied with the others; call `refreshFilters()` when its result may change. */
  externalFilter?: (row: Row) => boolean;
  /** A header row of compact filter inputs under the column headers (filterable columns). */
  floatingFilters?: boolean;
  /** A search box above the grid that sets the quick filter. */
  searchBox?: boolean;
  /** An expression bar (with a builder dialog) replaces the column filter UI; column filters stop applying. */
  advancedFilter?: boolean;
  /** The advanced filter model (validated; applies while `advancedFilter` is on). */
  advancedFilterModel?: DataGridAdvancedFilter | null;
  /** Row selection (off when omitted or null). */
  rowSelection?: DataGridRowSelection<Row> | null;
  /** Selected row ids (unknown and unselectable ids are dropped). */
  selected?: readonly string[];
  /** Cell range selection (drag, Shift+arrows, Ctrl+A) and copying of the ranges. */
  cellSelection?: boolean | DataGridCellSelection;
  /** Copy the column headers above copied cells. Default false. */
  copyHeaders?: boolean;
  /** Writes (paste, cut, Delete, fill, edits) are only requested through `aui-cells-change` (`applied: false`); the application applies them. */
  readOnlyEdits?: boolean;
  /** A single click on an editable cell starts editing (default: Enter, F2, typing, or a double-click). */
  clickToEdit?: boolean;
  /** Enter commits an edit and moves down, as in spreadsheets (default: stays on the cell). */
  enterMovesDown?: boolean;
  /** An invalid edit keeps the editor open with the message (`block`, default) or is discarded (`revert`). */
  invalidEdit?: 'block' | 'revert';
  /** Undo steps kept (0 turns undo off). Default 20. */
  undoLimit?: number;
  /** `row`: editing opens every editable cell of the row; Enter commits the row as one write. Default `cell`. */
  editMode?: 'cell' | 'row';
  /** Group the rows by these columns (ids, in level order). */
  groupBy?: readonly string[];
  /** Levels expanded by default (0: all collapsed, the default; -1: all expanded). */
  groupDefaultExpanded?: number;
  /** A total row after each expanded group's rows. */
  groupTotals?: 'bottom' | null;
  /** A grand total row at the top or bottom of the rows, or pinned above or below them. */
  grandTotal?: 'top' | 'bottom' | 'pinnedTop' | 'pinnedBottom' | null;
  /** One generated group column (default), one per level, or group rows spanning the whole row (`rows`). */
  groupDisplay?: 'column' | 'columns' | 'rows';
  /** While grouped, the group rows of the topmost row stay under the header as their groups scroll (default true). */
  stickyGroupRows?: boolean;
  /** Rows drawn as one cell across every column (`render` builds the content). */
  fullWidthRow?: { isFullWidth: (row: Row) => boolean; render: (row: Row, context: { readonly doc: Document; readonly rowId: string }) => Node } | null;
  /** The generated group column (header text and width). */
  groupColumn?: { header?: string; width?: number };
  /** Hide the grouped columns while grouped (their values show in the group column). Default true. */
  hideGroupedColumns?: boolean;
  /** Group rows expanded or collapsed explicitly, by group id. */
  expanded?: Readonly<Record<string, boolean>>;
  /** A panel above the grid lists the row groups (reorder, remove, add; drop a header to group by it). */
  groupPanel?: boolean;
  /** Aggregates use only the rows that pass the filters (default true); false aggregates every row of the group. */
  aggregateFilteredOnly?: boolean;
  /** Accessories (menus, chooser, panels) from `@absoluteui/components/data-grid/accessories`. */
  accessories?: readonly DataGridAccessory<Row>[];
  /** Header names set by the user, by column id (also part of the columns state). */
  headerNames?: Readonly<Record<string, string>>;
  /** Rows always shown above the body (never sorted, filtered, grouped, selected, or edited). */
  pinnedTopRows?: readonly Row[];
  /** Rows always shown below the body. */
  pinnedBottomRows?: readonly Row[];
  /** Rows pinned to the top or bottom by id (`pinRow`); they also stay in place in the body. */
  pinned?: Readonly<Record<string, 'top' | 'bottom'>>;
  /**
   * Files dropped on the grid: an overlay shows while files are over it, and accepted files (`accept`: extensions
   * such as `.csv`, MIME types such as `text/csv` or `text/*`; default all) go to `onFiles` (see `parseCsv` in
   * `@absoluteui/helpers/csv`, `coerceCsvValues`, `inferColumns`). Dropping is pointer only: offer a file input too.
   */
  fileDrop?: DataGridFileDrop;
  /** The formula engine for calculated columns (`formulaEngine()` from `@absoluteui/components/data-grid/formulas`). */
  formulas?: DataGridFormulaEngine;
  /** Row dragging: a drag handle in the `rowDrag` column (pointer), Ctrl+Shift+arrows on it (keyboard). */
  rowDragging?: boolean | DataGridRowDragging<Row>;
  /** A leading column numbering the rows (`resizable`: a handle on each number resizes its row). */
  rowNumbers?: boolean | { width?: number; resizable?: boolean };
  /** Server row model: rows load in blocks from the datasource (`rows` is ignored; sort and filters run on the server). */
  datasource?: DataGridDatasource<Row> | null;
  /** Rows per datasource request. Default 100. */
  blockSize?: number;
  /** Loaded blocks kept (least recently used ones are released). Default: all. */
  maxBlocks?: number | null;
  /** Milliseconds to wait before loading while scrolling. Default 50. */
  blockLoadDelay?: number;
  /** Datasource requests at a time. Default 2. */
  maxConcurrentLoads?: number;
  /** Rows assumed before the first answer (the scrollbar size). Default 0. */
  initialRowCount?: number;
  /** Server groups: the number of rows below a group row (shown with its key), or null when unknown. */
  getChildCount?: (row: Row) => number | null;
  /** Server groups: collapsing a group releases its loaded rows (default false: kept). */
  purgeClosedGroups?: boolean;
  /** Pivot mode: rows grouped by `rows`, a column group per `columns` key, aggregated `values` (the data columns hide). */
  pivot?: DataGridPivot | null;
  /** A panel above the grid edits the pivot (rows, columns, values). */
  pivotPanel?: boolean;
  /** Most generated pivot result columns (default 1000); more are left out and announced. */
  pivotMaxColumns?: number;
  /** Master/detail: a detail row under each expanded master row (a generated toggle column expands it). */
  detail?: DataGridDetail<Row> | null;
  /** Tree data: the rows form a tree (the group column shows it; `groupBy` is ignored). */
  treeData?: DataGridTreeData<Row> | null;
  /** Filtering keeps the ancestors of matching rows (`ancestors`, default), or also the subtrees of matching rows (`subtree`). */
  treeFilter?: 'ancestors' | 'subtree';
  /** Row mode: cross-field validation of the edited values by column; a message (or messages by column) blocks the commit. */
  validateRow?: (values: Readonly<Record<string, unknown>>, row: Row) => Readonly<Record<string, string>> | string | null;
  /** Busy state: an announced overlay; rows stay in place. */
  loading?: boolean;
  /** Shown when there are no rows. Default "No rows to show". */
  emptyMessage?: string;
  icons?: Partial<DataGridIcons>;
  locale?: string;
  timezone?: string;
  density?: Density;
  direction?: Direction;
}

export interface DataGridSortChangeDetail {
  readonly sort: readonly DataGridSort[];
}

export type DataGridColumnsChangeReason = 'resize' | 'move' | 'pin' | 'visibility' | 'group-toggle' | 'autosize' | 'fit' | 'rename' | 'reset';

export interface DataGridColumnsChangeDetail {
  readonly reason: DataGridColumnsChangeReason;
  readonly columns: DataGridColumnsState;
}

export interface DataGridPageChangeDetail {
  readonly page: number;
  readonly pageSize: number | null;
}

/** Rows to add, update (matched by id), and remove (by id). */
export interface DataGridTransaction<Row> {
  readonly add?: readonly Row[];
  /** Source position for added rows (default: the end). */
  readonly addIndex?: number;
  readonly update?: readonly Row[];
  readonly remove?: readonly string[];
}

export interface DataGridTransactionResult {
  readonly added: readonly string[];
  readonly updated: readonly string[];
  readonly removed: readonly string[];
  /** Ids in `update` or `remove` that were not found (ignored). */
  readonly missing: readonly string[];
}

/** `aui-rows-change` detail: what a transaction changed. */
export type DataGridRowsChangeDetail = DataGridTransactionResult;

/** `aui-filter-change` detail: the user changed a filter or the quick filter. */
export interface DataGridFilterChangeDetail {
  readonly filters: DataGridFilters;
  readonly quickFilter: string;
  readonly advancedFilter: DataGridAdvancedFilter | null;
}

/** `aui-selection-change` detail. */
/** A group of the current grouping (getGroups). */
export interface DataGridGroup {
  readonly id: string;
  readonly column: string;
  /** The raw key (null for blanks). */
  readonly key: unknown;
  /** Data rows in the group. */
  readonly count: number;
  readonly aggregates: Readonly<Record<string, unknown>>;
  readonly children: readonly DataGridGroup[];
}

export interface DataGridSelectionChangeDetail {
  /** Every selected row id. */
  readonly selected: readonly string[];
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** `user`: a click, checkbox, or key; `select-all`: the header checkbox or Ctrl+A; `rows`: selected rows were removed. */
  readonly reason: 'user' | 'select-all' | 'rows';
}

/** `aui-group-change` detail: the user changed the row groups (group panel). */
export interface DataGridGroupChangeDetail {
  readonly groupBy: readonly string[];
}

/** `aui-row-group-toggle` detail. */
export interface DataGridRowGroupToggleDetail {
  readonly groupId: string;
  readonly expanded: boolean;
}

/** `aui-range-change` detail. */
export interface DataGridRangeChangeDetail {
  readonly ranges: readonly DataGridCellRange[];
  /** False while a pointer drag is still extending the range. */
  readonly finished: boolean;
}

export interface DataGridCellFocusDetail {
  readonly rowId: string | null;
  readonly column: string;
}

export interface DataGridCellActivateDetail<Row = unknown> {
  readonly rowId: string;
  readonly column: string;
  readonly row: Row;
}

type Resolved = Readonly<DataGridConfig & { locale: string; timezone: string; density: Density; direction: Direction }>;

interface RowEntry<Row> {
  readonly el: HTMLDivElement;
  item: Item<Row>;
  index: number;
  generation: number;
  readonly cells: Map<string, HTMLDivElement>;
  /** Consumer nodes rendered into cells, released when the cell is dropped or re-rendered. */
  readonly nodes: Map<string, Node>;
  leading: HTMLDivElement | null;
  trailing: HTMLDivElement | null;
  measure: (() => void) | null;
  /** Last displayed text per column (change highlighting compares against it). */
  readonly texts: Map<string, string>;
}

interface Focus {
  /** Display index of the row, or -1 for a header cell. */
  rowId: string | null;
  column: string;
  /** Header level when rowId is null. */
  level: number;
}

/** Scrollable heights above this are scaled (browsers cap element heights at roughly 16 to 33 million pixels). */
const MAX_SCROLL_HEIGHT = 10_000_000;
const DENSITY_HEIGHT: Readonly<Record<Density, number>> = { compact: 32, comfortable: 40, spacious: 48 };
const HEADER_HEIGHT: Readonly<Record<Density, number>> = { compact: 36, comfortable: 44, spacious: 52 };
const RESIZE_STEP = 10;
/** Reserved id of the generated group column. */
const GROUP_COLUMN = 'aui-group';
/** The generated group column, or one of the per-level ones (`aui-group:0`, `aui-group:1`, ...). */
const isGroupColumn = (id: string): boolean => id === GROUP_COLUMN || id.startsWith(`${GROUP_COLUMN}:`);
/** A display row: a data row (optionally with its grouping place), or a group or total row (row is its first data row). */
type GridItem<Row> = Item<Row> & { readonly display?: DisplayRow<Row> };
/** Reserved id of the row selection checkbox column. */
const SELECT_COLUMN = 'aui-row-select';
/** Reserved id of the master/detail toggle column (also the column of a detail row's single cell). */
const DETAIL_COLUMN = 'aui-detail';
/** Columns the grid generates (selection, grouping, detail toggles). */
/** Prefix of generated pivot result columns and their column groups. */
const PIVOT_PREFIX = 'aui-pivot';
/** Reserved id of the row number column. */
const ROW_NUMBER_COLUMN = 'aui-row-number';
/** The single cell of a full-width row (and of a full-width group row). */
const FULL_WIDTH_COLUMN = 'aui-full-width';
/** Columns that hold controls rather than data (never part of ranges, copies, or writes). */
const isUtilityColumn = (id: string): boolean => id === SELECT_COLUMN || id === ROW_NUMBER_COLUMN || id === DETAIL_COLUMN || id === FULL_WIDTH_COLUMN;
const isGeneratedColumn = (id: string): boolean => isUtilityColumn(id) || isGroupColumn(id) || id.startsWith(PIVOT_PREFIX);
/** Longest row span followed (rows beyond start a new span). */
const MAX_ROW_SPAN = 500;
/** Column spans of a row: owner column to its width and count, covered column to its owner. */
interface ColSpans {
  readonly owners: Map<string, { width: number; count: number }>;
  readonly covered: Map<string, string>;
}
/** Row heights a user may set (row resizer, setRowHeight). */
const MIN_ROW_HEIGHT = 16;
const MAX_ROW_HEIGHT = 2000;
/** Default height of a detail row. */
const DETAIL_HEIGHT = 300;
/** A field of an object row (undefined for other values). */
const fieldOf = (row: unknown, field: string): unknown => (typeof row === 'object' && row !== null && !Array.isArray(row) ? (row as Record<string, unknown>)[field] : undefined);
const isPlainObject = (v: unknown): boolean => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};
/** Equal cell values: identical, or the same calendar date or instant. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (isPlainDate(a) && isPlainDate(b)) return a.year === b.year && a.month === b.month && a.day === b.day;
  if (isInstantLike(a) && isInstantLike(b)) return a.epochMilliseconds === b.epochMilliseconds;
  return false;
}
/** An open editor of the edited cell or row. */
interface OpenEditor {
  readonly column: string;
  readonly editor: DataGridCellEditor;
  readonly wrapper: HTMLDivElement;
  /** Shown in a popup over the cell (large text in cell mode). */
  readonly popup: boolean;
  stopPosition: Disposer | null;
}
/** A row's pending version in a batch, the committed row it started from, and the changed cells. */
interface PendingRow<Row> {
  readonly base: Row;
  row: Row;
  readonly changes: Map<string, { oldValue: unknown; newValue: unknown }>;
}
/** Why an edit is committed: a key, focus leaving, another edit starting, or the API. */
type CommitReason = 'enter' | 'down' | 'next' | 'previous' | 'bulk' | 'blur' | 'move' | 'api';
const NAVIGATION_KEYS: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const RESIZE_STEP_LARGE = 50;
const isFn = (v: unknown): boolean => typeof v === 'function';
const oneOf = (v: unknown, values: readonly unknown[]): boolean => values.includes(v);
const isBool = (v: unknown): boolean => typeof v === 'boolean';
const isText = (v: unknown): boolean => typeof v === 'string';
const CLASS_TOKEN = /^[A-Za-z_-][\w-]*$/;
/** Class-rule maps: class tokens to predicates. */
function checkClassRules(rules: unknown, property: string): void {
  if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) fail(property, 'object of class name to predicate');
  for (const [name, test] of Object.entries(rules)) if (!CLASS_TOKEN.test(name) || !isFn(test)) fail(property, 'object of class name to predicate');
}
const isPageSize = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1_000_000;

function assertOptions<Row>(o: Partial<DataGridOptions<Row>>, creating: boolean): void {
  if (creating || 'label' in o) if (!isText(o.label) || (o.label ?? '').trim() === '') fail('label', 'non-empty string');
  if (o.description !== undefined && !isText(o.description)) fail('description', 'string');
  if (creating || 'rows' in o) if (!isArray(o.rows)) fail('rows', 'array');
  if (creating || 'rowId' in o) if (!isFn(o.rowId)) fail('rowId', 'function (row) => string');
  if (creating || 'columns' in o) if (!isArray(o.columns)) fail('columns', 'array of columns and column groups');
  if (o.rowHeight !== undefined && !isFn(o.rowHeight) && !(typeof o.rowHeight === 'number' && Number.isFinite(o.rowHeight) && o.rowHeight >= 16 && o.rowHeight <= 1000)) fail('rowHeight', 'number from 16 to 1000, or a function of the row');
  if (o.autoRowHeight !== undefined && !isBool(o.autoRowHeight)) fail('autoRowHeight', 'boolean');
  if (o.layout !== undefined && !oneOf(o.layout, ['fill', 'auto'])) fail('layout', '"fill" | "auto"');
  if (o.loading !== undefined && !isBool(o.loading)) fail('loading', 'boolean');
  if (o.emptyMessage !== undefined && !isText(o.emptyMessage)) fail('emptyMessage', 'string');
  if (o.flashChanges !== undefined && !isBool(o.flashChanges)) fail('flashChanges', 'boolean');
  if (o.flashDuration !== undefined && !(Number.isInteger(o.flashDuration) && o.flashDuration >= 100 && o.flashDuration <= 10_000)) fail('flashDuration', 'integer from 100 to 10000 (milliseconds)');
  if (o.rowClassRules !== undefined) checkClassRules(o.rowClassRules, 'rowClassRules');
  if (o.quickFilter !== undefined && !isText(o.quickFilter)) fail('quickFilter', 'string');
  if (o.externalFilter !== undefined && !isFn(o.externalFilter)) fail('externalFilter', 'function (row) => boolean');
  if (o.floatingFilters !== undefined && !isBool(o.floatingFilters)) fail('floatingFilters', 'boolean');
  if (o.searchBox !== undefined && !isBool(o.searchBox)) fail('searchBox', 'boolean');
  if (o.advancedFilter !== undefined && !isBool(o.advancedFilter)) fail('advancedFilter', 'boolean');
  if (o.rowSelection !== undefined && o.rowSelection !== null) {
    const s: unknown = o.rowSelection;
    if (!isObjectLike(s)) fail('rowSelection', '{ mode: "single" | "multiple", ... } or null');
    const r = s as Partial<Record<keyof DataGridRowSelection, unknown>>;
    if (!oneOf(r.mode, ['single', 'multiple'])) fail('rowSelection.mode', '"single" | "multiple"');
    for (const key of ['checkboxes', 'headerCheckbox', 'clickToSelect'] as const) if (r[key] !== undefined && !isBool(r[key])) fail(`rowSelection.${key}`, 'boolean');
    if (r.selectAll !== undefined && !oneOf(r.selectAll, ['filtered', 'all', 'page'])) fail('rowSelection.selectAll', '"filtered" | "all" | "page"');
    if (r.selectable !== undefined && !isFn(r.selectable)) fail('rowSelection.selectable', 'function (row) => boolean');
  }
  if (o.cellSelection !== undefined && !isBool(o.cellSelection)) {
    const c: unknown = o.cellSelection;
    if (!isObjectLike(c)) fail('cellSelection', 'boolean or { multiple?, columnSelection? }');
    const r = c as Partial<Record<keyof DataGridCellSelection, unknown>>;
    for (const key of ['multiple', 'columnSelection', 'fillHandle'] as const) if (r[key] !== undefined && !isBool(r[key])) fail(`cellSelection.${key}`, 'boolean');
  }
  if (o.copyHeaders !== undefined && !isBool(o.copyHeaders)) fail('copyHeaders', 'boolean');
  if (o.readOnlyEdits !== undefined && !isBool(o.readOnlyEdits)) fail('readOnlyEdits', 'boolean');
  if (o.clickToEdit !== undefined && !isBool(o.clickToEdit)) fail('clickToEdit', 'boolean');
  if (o.enterMovesDown !== undefined && !isBool(o.enterMovesDown)) fail('enterMovesDown', 'boolean');
  if (o.invalidEdit !== undefined && !oneOf(o.invalidEdit, ['block', 'revert'])) fail('invalidEdit', '"block" | "revert"');
  if (o.editMode !== undefined && !oneOf(o.editMode, ['cell', 'row'])) fail('editMode', '"cell" | "row"');
  if (o.groupBy !== undefined && !(isArray(o.groupBy) && o.groupBy.length <= 20 && o.groupBy.every((id) => typeof id === 'string'))) fail('groupBy', 'array of at most 20 column ids');
  if (o.groupDefaultExpanded !== undefined && !(Number.isInteger(o.groupDefaultExpanded) && o.groupDefaultExpanded >= -1)) fail('groupDefaultExpanded', 'integer >= -1');
  if (o.groupTotals !== undefined && !oneOf(o.groupTotals, ['bottom', null])) fail('groupTotals', '"bottom" | null');
  if (o.grandTotal !== undefined && !oneOf(o.grandTotal, ['top', 'bottom', 'pinnedTop', 'pinnedBottom', null])) fail('grandTotal', '"top" | "bottom" | "pinnedTop" | "pinnedBottom" | null');
  for (const key of ['pinnedTopRows', 'pinnedBottomRows'] as const) if (o[key] !== undefined && !(isArray(o[key]) && o[key].length <= 1000)) fail(key, 'array of at most 1000 rows');
  const pins: unknown = o.pinned;
  if (pins !== undefined && (!isObjectLike(pins) || isArray(pins) || !Object.values(pins as Record<string, unknown>).every((v) => v === 'top' || v === 'bottom'))) fail('pinned', 'object of row ids to "top" | "bottom"');
  if (o.hideGroupedColumns !== undefined && !isBool(o.hideGroupedColumns)) fail('hideGroupedColumns', 'boolean');
  if (o.groupPanel !== undefined && !isBool(o.groupPanel)) fail('groupPanel', 'boolean');
  if (o.groupDisplay !== undefined && !oneOf(o.groupDisplay, ['column', 'columns', 'rows'])) fail('groupDisplay', '"column" | "columns" | "rows"');
  if (o.stickyGroupRows !== undefined && !isBool(o.stickyGroupRows)) fail('stickyGroupRows', 'boolean');
  if (o.fullWidthRow !== undefined && o.fullWidthRow !== null) {
    const f: unknown = o.fullWidthRow;
    const r = isObjectLike(f) ? (f as Partial<Record<'isFullWidth' | 'render', unknown>>) : null;
    if (!r || !isFn(r.isFullWidth) || !isFn(r.render)) fail('fullWidthRow', '{ isFullWidth(row), render(row, context) }');
  }
  if (o.aggregateFilteredOnly !== undefined && !isBool(o.aggregateFilteredOnly)) fail('aggregateFilteredOnly', 'boolean');
  if (o.groupColumn !== undefined && (!isObjectLike(o.groupColumn) || (o.groupColumn.header !== undefined && !isText(o.groupColumn.header)) || (o.groupColumn.width !== undefined && !(typeof o.groupColumn.width === 'number' && o.groupColumn.width >= 48 && o.groupColumn.width <= 2000)))) fail('groupColumn', '{ header?: string, width?: 48 to 2000 }');
  if (o.expanded !== undefined && (!isObjectLike(o.expanded) || !Object.values(o.expanded).every(isBool))) fail('expanded', 'object of group ids to booleans');
  if (o.treeData !== undefined && o.treeData !== null) {
    const t: unknown = o.treeData;
    if (!isObjectLike(t)) fail('treeData', '{ getPath | parentIdField | childrenField, label? }');
    const r = t as Partial<Record<keyof DataGridTreeData<unknown>, unknown>>;
    if ((r.serverGroup === undefined) !== (r.serverKey === undefined)) fail('treeData', 'serverGroup and serverKey together');
    if ([r.getPath, r.parentIdField, r.childrenField, r.serverGroup].filter((v) => v !== undefined).length !== 1) fail('treeData', 'exactly one of getPath, parentIdField, childrenField, or serverGroup with serverKey');
    for (const key of ['serverGroup', 'serverKey'] as const) if (r[key] !== undefined && !isFn(r[key])) fail(`treeData.${key}`, 'function');
    if (r.getPath !== undefined && !isFn(r.getPath)) fail('treeData.getPath', 'function (row) => string[]');
    for (const key of ['parentIdField', 'childrenField', 'label'] as const) if (r[key] !== undefined && !(typeof r[key] === 'string' && r[key] !== '')) fail(`treeData.${key}`, 'non-empty string');
  }
  if (o.treeFilter !== undefined && !oneOf(o.treeFilter, ['ancestors', 'subtree'])) fail('treeFilter', '"ancestors" | "subtree"');
  if (o.pivot !== undefined && o.pivot !== null) parsePivot(o.pivot);
  const engine: unknown = o.formulas;
  if (engine !== undefined && !(isObjectLike(engine) && ['create', 'check', 'shift'].every((k) => isFn((engine as Partial<Record<string, unknown>>)[k])))) fail('formulas', 'formulaEngine() from @absoluteui/components/data-grid/formulas');
  if (o.fileDrop !== undefined) {
    const d: unknown = o.fileDrop;
    const r = isObjectLike(d) ? (d as Partial<Record<'label' | 'accept' | 'onFiles', unknown>>) : null;
    if (!r || !isFn(r.onFiles) || (r.label !== undefined && typeof r.label !== 'string') || (r.accept !== undefined && !(Array.isArray(r.accept) && (r.accept as unknown[]).every((a) => typeof a === 'string' && a.trim() !== '')))) fail('fileDrop', '{ onFiles, label?, accept? }');
  }
  if (o.rowDragging !== undefined && !isBool(o.rowDragging)) {
    const d: unknown = o.rowDragging;
    const r = isObjectLike(d) ? (d as Partial<Record<'managed' | 'multiRow' | 'canDrag', unknown>>) : null;
    const n = r as Partial<Record<'nativeData', unknown>> | null;
    if (!r || (r.managed !== undefined && !isBool(r.managed)) || (r.multiRow !== undefined && !isBool(r.multiRow)) || (r.canDrag !== undefined && !isFn(r.canDrag)) || (n?.nativeData !== undefined && !isFn(n.nativeData))) fail('rowDragging', 'boolean or { managed?, multiRow?, canDrag?, nativeData? }');
  }
  if (o.accessories !== undefined && !(isArray(o.accessories) && o.accessories.every((a) => isObjectLike(a) && isFn((a as { attach?: unknown }).attach)))) fail('accessories', 'array of accessories ({ attach(context) })');
  const names: unknown = o.headerNames;
  if (names !== undefined && (!isObjectLike(names) || isArray(names) || !Object.values(names as Record<string, unknown>).every((v) => typeof v === 'string' && v.trim() !== '' && v.length <= 200))) fail('headerNames', 'object of column ids to non-empty names (at most 200 characters)');
  if (o.rowNumbers !== undefined && !isBool(o.rowNumbers)) {
    const n: unknown = o.rowNumbers;
    const r = isObjectLike(n) ? (n as Partial<Record<'width' | 'resizable', unknown>>) : null;
    if (!r || (r.width !== undefined && !(typeof r.width === 'number' && r.width >= 32 && r.width <= 200)) || (r.resizable !== undefined && !isBool(r.resizable))) fail('rowNumbers', 'boolean or { width?: 32 to 200, resizable?: boolean }');
  }
  if (o.datasource !== undefined && o.datasource !== null && !(isObjectLike(o.datasource) && isFn((o.datasource as { getRows?: unknown }).getRows))) fail('datasource', '{ getRows(request, signal) }');
  const intIn = (v: unknown, min: number, max: number): boolean => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  if (o.blockSize !== undefined && !intIn(o.blockSize, 1, 10000)) fail('blockSize', 'integer from 1 to 10000');
  if (o.maxBlocks !== undefined && o.maxBlocks !== null && !intIn(o.maxBlocks, 1, 100000)) fail('maxBlocks', 'integer from 1 to 100000, or null');
  if (o.blockLoadDelay !== undefined && !intIn(o.blockLoadDelay, 0, 5000)) fail('blockLoadDelay', 'integer from 0 to 5000');
  if (o.maxConcurrentLoads !== undefined && !intIn(o.maxConcurrentLoads, 1, 20)) fail('maxConcurrentLoads', 'integer from 1 to 20');
  if (o.initialRowCount !== undefined && !intIn(o.initialRowCount, 0, 1_000_000_000)) fail('initialRowCount', 'integer from 0 to 1000000000');
  if (o.getChildCount !== undefined && !isFn(o.getChildCount)) fail('getChildCount', 'function (row) => number | null');
  if (o.purgeClosedGroups !== undefined && !isBool(o.purgeClosedGroups)) fail('purgeClosedGroups', 'boolean');
  if (o.pivotPanel !== undefined && !isBool(o.pivotPanel)) fail('pivotPanel', 'boolean');
  if (o.pivotMaxColumns !== undefined && !(Number.isInteger(o.pivotMaxColumns) && o.pivotMaxColumns >= 1 && o.pivotMaxColumns <= 100000)) fail('pivotMaxColumns', 'integer from 1 to 100000');
  if (o.detail !== undefined && o.detail !== null) {
    const d: unknown = o.detail;
    if (!isObjectLike(d)) fail('detail', '{ render, height?, isMaster?, keep?, expandedByDefault?, destroy? }');
    const r = d as Partial<Record<keyof DataGridDetail<unknown>, unknown>>;
    if (!isFn(r.render)) fail('detail.render', 'function (row, context) => Node');
    if (r.height !== undefined && r.height !== 'auto' && !(typeof r.height === 'number' && r.height >= 24 && r.height <= 5000)) fail('detail.height', '24 to 5000, or "auto"');
    for (const key of ['isMaster', 'destroy'] as const) if (r[key] !== undefined && !isFn(r[key])) fail(`detail.${key}`, 'function');
    if (r.keep !== undefined && !(Number.isInteger(r.keep) && typeof r.keep === 'number' && r.keep >= 0 && r.keep <= 1000)) fail('detail.keep', 'integer from 0 to 1000');
    if (r.expandedByDefault !== undefined && !isBool(r.expandedByDefault)) fail('detail.expandedByDefault', 'boolean');
  }
  if (o.validateRow !== undefined && !isFn(o.validateRow)) fail('validateRow', 'function (values, row) => messages | string | null');
  if (o.undoLimit !== undefined && !(Number.isInteger(o.undoLimit) && o.undoLimit >= 0 && o.undoLimit <= 1000)) fail('undoLimit', 'integer from 0 to 1000');
  if (o.selected !== undefined && !(isArray(o.selected) && o.selected.every((id) => typeof id === 'string'))) fail('selected', 'array of row ids');
  if (o.filters !== undefined && (!isObjectLike(o.filters) || isArray(o.filters))) fail('filters', 'object of filters by column id');
  if (o.pageSize !== undefined && o.pageSize !== null && !isPageSize(o.pageSize)) fail('pageSize', 'integer from 1 to 1000000, or null');
  if (o.pageSizes !== undefined && (!isArray(o.pageSizes) || !o.pageSizes.every(isPageSize))) fail('pageSizes', 'array of integers from 1 to 1000000');
  if (o.page !== undefined && !(Number.isInteger(o.page) && o.page >= 1)) fail('page', 'integer >= 1');
  if (o.sort !== undefined && o.sort !== null) {
    const list = Array.isArray(o.sort) ? o.sort : [o.sort];
    for (const s of list as readonly unknown[]) {
      const ok = typeof s === 'object' && s !== null && typeof (s as DataGridSort).column === 'string' && ((s as DataGridSort).direction === 'ascending' || (s as DataGridSort).direction === 'descending');
      if (!ok) fail('sort', '{ column, direction: "ascending" | "descending" } or an array of them');
    }
  }
}

export class DataGrid<Row> {
  readonly host: HTMLElement;
  /** The element with role="grid". */
  readonly element: HTMLDivElement;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();
  readonly #viewport: HTMLDivElement;
  readonly #head: HTMLDivElement;
  readonly #body: HTMLDivElement;
  readonly #overlay: HTMLDivElement;
  readonly #description: HTMLDivElement;
  #options: DataGridOptions<Row>;
  #config: Resolved;
  #leaves: readonly Leaf<Row>[] = [];
  #groupDefs: ReadonlyMap<string, DataGridColumnGroup<Row>> = new Map();
  #engineColumns = new Map<string, DataTableColumn<Row>>();
  #layout!: ColumnLayout<Row>;
  #columnState: { order: string[]; widths: Record<string, number>; pinned: Record<string, DataGridPinned | null>; hidden: Record<string, boolean>; collapsed: Record<string, boolean> } = { order: [], widths: {}, pinned: {}, hidden: {}, collapsed: {} };
  #sorts: DataGridSort[] = [];
  #filters: Record<string, DataGridFilter> = {};
  #quickFilter = '';
  /** Normalized searchable texts per row object, by column position (filled lazily by the quick filter). */
  #quickText = new WeakMap<object, string[]>();
  /** Locale and searchable columns the cached quick-filter texts belong to. */
  #quickSignature = '';
  /** Set-filter values by column, valid while the source rows and locale are unchanged. */
  readonly #setValueCache = new Map<string, { source: readonly Item<Row>[]; locale: string; values: (string | null)[] }>();
  /** Rows after filtering (before sorting) and the total before filtering. */
  #filteredCount = 0;
  #source: Item<Row>[] = [];
  /** Every row after sorting. */
  #sorted: readonly Item<Row>[] = [];
  /** The display rows (group rows, data rows, totals) before paging; the same as #sorted when not grouped. */
  #display: readonly GridItem<Row>[] = [];
  /** The group tree of the last grouping, and the grand totals. */
  #groups: GroupNode<Row>[] = [];
  #grand: Map<string, unknown> | null = null;
  /** Grand totals for percentages (show values as), whether or not a grand total row shows. */
  #grandAll = new Map<string, unknown>();
  #groupPanel: HTMLDivElement | null = null;
  /** Tree data: the visible tree and its group nodes; parents of nested rows; sort ranks and filter matches of every row. */
  #tree: { roots: TreeNode<Row>[]; byNode: Map<TreeNode<Row>, GroupNode<Row>> } | null = null;
  #treeParent = new Map<string, string>();
  #treeRank = new Map<string, number>();
  #treePass = new Set<string>();
  #treeOrphans: string[] = [];
  /** Master/detail: explicit expansion by master row id; kept content (oldest first); measured heights; the column to return to below a detail row. */
  #detailOpen = new Map<string, boolean>();
  #detailCache = new Map<string, { wrapper: HTMLDivElement; node: Node; row: Row }>();
  #detailMeasured = new Map<string, number>();
  #detailReturn: string | null = null;
  /** Pivot mode: the generated result columns (and their signature), the panel, columns left out by pivotMaxColumns. */
  #pivotDefs: DataGridColumnDef<Row>[] = [];
  #pivotSignature = '';
  #pivotPanel: HTMLDivElement | null = null;
  #pivotTruncated: { shown: number; total: number } | null = null;
  /** Server row model: the block cache, the query its blocks belong to, a row standing in for unloaded rows, placeholders by page index, the page's first absolute row. */
  #server: ServerCache<Row> | null = null;
  #serverQuery = '';
  #serverTemplate: { row: Row } | null = null;
  /** Placeholders by absolute row index, kept while their state is the same (so their rows are not rebuilt). */
  #placeholders = new Map<string, GridItem<Row>>();
  /** Server groups: caches by encoded group path; runs of rows not loaded; display ids by `route|position`. */
  #serverChildren = new Map<string, { cache: ServerCache<Row>; keys: readonly unknown[] }>();
  #segments: ServerSegment<Row>[] = [];
  #serverPositions = new Map<string, string>();
  #pageOffset = 0;
  #serverAnnounced = false;
  #serverFailed = false;
  /** Server selection: every row is selected except the ids in #selected (which then lists the exceptions). */
  #serverSelectAll = false;
  /** Heights set by the user (row resizer) or setRowHeight, by row id. */
  #rowHeightOverrides = new Map<string, number>();
  /** Accessories: their detach functions and the header buttons they added. */
  #accessoryDisposers: (() => void)[] = [];
  /** Accessory update listeners, and whether a notification is queued. */
  readonly #updateListeners = new Set<() => void>();
  #updateQueued = false;
  /** Cell decorators of accessories (find matches, notes), by key. */
  readonly #decorators = new Map<string, (rowId: string, column: string) => { className: string; description?: string } | null>();
  /** The row of side slots and the viewport (created when an accessory asks for a side slot). */
  #main: HTMLDivElement | null = null;
  #headerButtons: DataGridHeaderButton[] = [];
  /** Header names set by the user, by column (or column group) id. */
  #headerNames = new Map<string, string>();
  /** Pinned sections: their rowgroups, the rows pinned by id (in pin order), and the pinned display rows by key. */
  readonly #pinTop: HTMLDivElement;
  readonly #pinBottom: HTMLDivElement;
  #userPins = new Map<string, 'top' | 'bottom'>();
  #pinnedRows: { top: GridItem<Row>[]; bottom: GridItem<Row>[] } = { top: [], bottom: [] };
  #pinnedById = new Map<string, GridItem<Row>>();
  /** Sticky group rows: their overlay (no height of its own) and the height of the rows in it. */
  readonly #stickyBox: HTMLDivElement;
  #stickyHeight = 0;
  /** Row spans of this render pass, by `column:index`. */
  #spanCache = new Map<string, { start: number; end: number }>();
  /** Columns with row spans, whether any column spans columns. */
  #spanColumns: { rows: DataGridColumn<Row>[]; cols: boolean; any: boolean } = { rows: [], cols: false, any: false };
  /** The first render is done (later column changes re-render the header). */
  #ready = false;
  /** Group rows expanded or collapsed explicitly. */
  #expanded = new Map<string, boolean>();
  /** Rows of the current page (all rows when paging is off). */
  #items: readonly GridItem<Row>[] = [];
  #page = 1;
  #pageSize: number | null = null;
  readonly #pagerHost: HTMLDivElement;
  #pagination: Pagination | null = null;
  /** Row id to displayed index, built on first use (most renders never need it). */
  #indexCache: Map<string, number> | null = null;
  readonly #heights = new RowHeights();
  readonly #sorter = new SortEngine<Row>();
  readonly #rows = new Map<string, RowEntry<Row>>();
  #generation = 0;
  #frame = 0;
  #focus: Focus | null = null;
  #headerCells = new Map<string, HTMLDivElement>();
  #emptyRow: HTMLDivElement | null = null;
  #viewportWidth = 0;
  #dropIndicator: HTMLDivElement | null = null;
  #queue: DataGridTransaction<Row>[] = [];
  #queueTimer = 0;
  #animTimer = 0;
  /** The click that ends a header drag must not sort. */
  #suppressClick = false;
  #viewportHeight = 0;
  #destroyed = false;
  /** Filter buttons by column, kept across header renders so an open panel stays anchored. */
  readonly #filterButtons = new Map<string, HTMLButtonElement>();
  /** Floating filter controls by column (kept across header renders), with the key they were built for. */
  readonly #floating = new Map<string, { key: string; control: FloatingFilter }>();
  readonly #floatingCells = new Map<string, HTMLDivElement>();
  #panel: { column: string; panel: FilterPanel; popover: PopoverHandle; stopPosition: Disposer; anchor: HTMLElement | null; triggers: readonly HTMLElement[] } | null = null;
  #toolbar: HTMLDivElement | null = null;
  #searchInput: HTMLInputElement | null = null;
  #searchTimer = 0;
  #advanced: DataGridAdvancedFilter | null = null;
  /** Selected row ids, and the row Shift ranges start from. */
  #selected = new Set<string>();
  #anchor: string | null = null;
  /** Cell ranges (the last one is active) and the moving corner of the active range. */
  #ranges: DataGridCellRange[] = [];
  #rangeEnd: { rowId: string; column: string } | null = null;
  #rangeAnnounce = 0;
  /** The fill handle element (in the active range's corner cell) and the rectangle a fill drag would cover. */
  #fillHandle: HTMLDivElement | null = null;
  #fillPreview: RangeRect | null = null;
  #fillAlt = false;
  /** The open editor. */
  #editing: { rowId: string; column: string; editors: Map<string, OpenEditor>; error: HTMLDivElement; stopError: Disposer | null; row: boolean } | null = null;
  /** Pending rows of a batch (shown; applied on commitBatch). */
  #batch: Map<string, PendingRow<Row>> | null = null;
  /** Body rendering is under way (focus moves it causes are not edit commits). */
  #rendering = false;
  /** Applied writes, as undo and redo steps. */
  #undo: UndoStep<Row>[] = [];
  #redo: UndoStep<Row>[] = [];
  #advancedBar: AdvancedBar | null = null;
  #builder: Dialog | null = null;
  readonly #numberFormats = new Map<string, Intl.NumberFormat>();

  private constructor(host: HTMLElement, options: DataGridOptions<Row>) {
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#config = DataGrid.#resolve(options);
    const doc = this.#doc;
    host.classList.add('aui-data-grid');
    this.#viewport = doc.createElement('div');
    this.#viewport.className = 'aui-data-grid__viewport';
    this.element = doc.createElement('div');
    this.element.className = 'aui-data-grid__grid';
    this.element.setAttribute('role', 'grid');
    this.#head = doc.createElement('div');
    this.#head.className = 'aui-data-grid__head';
    this.#head.setAttribute('role', 'rowgroup');
    this.#body = doc.createElement('div');
    this.#body.className = 'aui-data-grid__body';
    this.#body.setAttribute('role', 'rowgroup');
    // Pinned rows: rowgroups that stay under the header and above the bottom edge while the body scrolls.
    this.#pinTop = doc.createElement('div');
    this.#pinTop.className = 'aui-data-grid__pinned aui-data-grid__pinned--top';
    this.#pinTop.setAttribute('role', 'rowgroup');
    this.#pinTop.hidden = true;
    this.#pinBottom = doc.createElement('div');
    this.#pinBottom.className = 'aui-data-grid__pinned aui-data-grid__pinned--bottom';
    this.#pinBottom.setAttribute('role', 'rowgroup');
    this.#pinBottom.hidden = true;
    this.#stickyBox = doc.createElement('div');
    this.#stickyBox.className = 'aui-data-grid__sticky';
    this.#stickyBox.setAttribute('aria-hidden', 'true');
    this.#stickyBox.hidden = true;
    this.element.append(this.#head, this.#pinTop, this.#stickyBox, this.#body, this.#pinBottom);
    this.#viewport.append(this.element);
    this.#overlay = doc.createElement('div');
    this.#overlay.className = 'aui-data-grid__overlay';
    this.#overlay.hidden = true;
    this.#description = doc.createElement('div');
    this.#description.className = 'aui-data-grid__visually-hidden';
    this.#description.id = createId('aui-data-grid-description');
    this.#pagerHost = doc.createElement('div');
    this.#pagerHost.className = 'aui-data-grid__pager';
    this.#pagerHost.hidden = true;
    host.append(this.#viewport, this.#pagerHost, this.#overlay, this.#description);
    this.#pageSize = options.pageSize ?? null;
    this.#page = options.page ?? 1;
    this.#applyColumns(options.columns, true);
    this.#applySort(options.sort, false);
    if (options.expanded) this.#expanded = new Map(Object.entries(options.expanded));
    this.#applyFilters(options.filters);
    this.#applyAdvanced(options.advancedFilterModel);
    this.#quickFilter = options.quickFilter ?? '';
    if (options.pinned) this.#userPins = new Map(Object.entries(options.pinned));
    if (options.headerNames) this.#headerNames = new Map(Object.entries(options.headerNames));
    this.#initServer();
    this.#setRows(options.rows);
    if (options.selected) this.#selected = this.#validSelection(options.selected);
    this.#applyHostOptions();
    this.#listen();
    this.#renderHeader();
    this.#renderNow();
    this.#ready = true;
    this.#attachAccessories();
  }

  static create<Row>(host: HTMLElement, options: DataGridOptions<Row>): DataGrid<Row> {
    if (host.childElementCount > 0) throw configurationError('DATA_GRID_OPTIONS', 'The data grid host must be empty.', { component: 'dataGrid', property: 'host', expected: 'empty element' });
    assertOptions(options, true);
    return new DataGrid(host, options);
  }

  static #resolve<R>(o: DataGridOptions<R>): Resolved {
    return dataGridConfig.resolve({
      ...(o.multiSort === undefined ? {} : { multiSort: o.multiSort }),
      ...(o.sortCycle === undefined ? {} : { sortCycle: o.sortCycle }),
      ...(o.overscan === undefined ? {} : { overscan: o.overscan }),
      ...(o.transactionDelay === undefined ? {} : { transactionDelay: o.transactionDelay }),
      ...(o.animateRows === undefined ? {} : { animateRows: o.animateRows }),
      ...(o.filterDelay === undefined ? {} : { filterDelay: o.filterDelay }),
      ...(o.maxFilterConditions === undefined ? {} : { maxFilterConditions: o.maxFilterConditions }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.timezone === undefined ? {} : { timezone: o.timezone }),
      ...(o.density === undefined ? {} : { density: o.density }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #index(): Map<string, number> {
    if (!this.#indexCache) {
      const map = new Map<string, number>();
      const items = this.#items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item) map.set(item.id, i);
      }
      this.#indexCache = map;
    }
    return this.#indexCache;
  }

  /** Displayed rows (after sorting). */
  get rowCount(): number {
    return this.#items.length;
  }

  /** Current sort, by priority (a copy). */
  get sort(): DataGridSort[] {
    return this.#sorts.map((s) => ({ ...s }));
  }

  /** The cell or header that holds the grid's tab stop. */
  get focusedCell(): DataGridCellPosition | null {
    const f = this.#focus;
    if (!f) return null;
    return f.rowId === null ? { rowId: null, column: f.column, level: f.level } : { rowId: f.rowId, column: f.column };
  }

  update(options: Partial<DataGridOptions<Row>>): void {
    assertOptions(options, false);
    this.#options = { ...this.#options, ...options };
    this.#config = DataGrid.#resolve(this.#options);
    if (options.columns) this.#applyColumns(options.columns, false);
    if ('sort' in options) this.#applySort(options.sort, false);
    if ('filters' in options) this.#applyFilters(options.filters);
    if ('advancedFilterModel' in options) this.#applyAdvanced(options.advancedFilterModel);
    if ('quickFilter' in options) this.#quickFilter = options.quickFilter ?? '';
    if ('pageSize' in options) this.#pageSize = options.pageSize ?? null;
    if (options.page !== undefined) this.#page = options.page;
    // Re-validate rows only when they changed; a sort or paging change re-uses the validated rows (and cached sort ranks).
    if (options.expanded) this.#expanded = new Map(Object.entries(options.expanded));
    if (options.pinned) this.#userPins = new Map(Object.entries(options.pinned));
    if (options.headerNames) this.#headerNames = new Map(Object.entries(options.headerNames));
    if (('rowSelection' in options || 'groupBy' in options || 'groupColumn' in options || 'groupDisplay' in options || 'treeData' in options || 'detail' in options || 'pivot' in options || 'rowNumbers' in options || 'fullWidthRow' in options || 'headerNames' in options) && !options.columns) this.#applyColumns(this.#options.columns, false);
    if (options.rows || options.rowId) this.#clearUndo();
    const serverKeys = ['datasource', 'blockSize', 'maxBlocks', 'blockLoadDelay', 'maxConcurrentLoads', 'initialRowCount'] as const;
    if (serverKeys.some((k) => k in options) || (options.rowId && this.#options.datasource)) this.#initServer();
    if ('accessories' in options && this.#ready) this.#attachAccessories();
    else this.#assertServerOptions();
    if (options.rows || options.rowId || 'treeData' in options || serverKeys.some((k) => k in options)) this.#setRows(this.#options.rows);
    if (options.rows || options.rowId || 'rowSelection' in options) this.#pruneSelection(false);
    if (options.selected) this.#selected = this.#validSelection(options.selected);
    else if (options.columns || 'sort' in options || 'locale' in options || 'filters' in options || 'groupBy' in options || 'treeFilter' in options || 'detail' in options || 'pivot' in options || 'pinned' in options || 'pinnedTopRows' in options || 'pinnedBottomRows' in options || 'pivotMaxColumns' in options || 'aggregateFilteredOnly' in options || 'groupDefaultExpanded' in options || 'groupTotals' in options || 'grandTotal' in options || 'expanded' in options || 'advancedFilterModel' in options || 'advancedFilter' in options || 'quickFilter' in options || 'externalFilter' in options || 'timezone' in options) this.#sortRows();
    else if ('pageSize' in options || options.page !== undefined || options.rowHeight !== undefined || 'density' in options) this.#paginate();
    this.#applyHostOptions();
    this.#generation++;
    this.#renderHeader();
    this.#renderNow();
  }

  /** Replace the rows (keeps sort, focus, and scroll position). */
  setRows(rows: readonly Row[]): void {
    if (!isArray(rows)) fail('rows', 'array');
    this.#clearUndo();
    this.#options = { ...this.#options, rows };
    this.#setRows(rows);
    this.#pruneBatch();
    // No generation bump: only rows whose object changed re-render (and can highlight changes).
    this.#renderNow();
    this.#pruneSelection(true);
  }

  /** Column layout state (order, widths, pinning, visibility, collapsed groups). */
  getColumnsState(): DataGridColumnsState {
    const s = this.#columnState;
    const user = (id: string): boolean => !isGeneratedColumn(id);
    return {
      order: displayOrder(this.#leaves, s.order).filter(user),
      widths: Object.fromEntries(Object.entries(s.widths).filter(([id]) => user(id))),
      pinned: Object.fromEntries(Object.entries(s.pinned).filter(([id]) => user(id))),
      hidden: Object.keys(s.hidden).filter((k) => s.hidden[k]),
      collapsedGroups: Object.keys(s.collapsed).filter((k) => s.collapsed[k]),
      ...(this.#headerNames.size > 0 ? { headers: Object.fromEntries(this.#headerNames) } : {}),
    };
  }

  /** Rename a column (or column group); null restores its defined header. Emits `aui-columns-change` (rename). */
  setColumnHeader(id: string, header: string | null): boolean {
    if (header !== null && !(typeof header === 'string' && header.trim() !== '' && header.length <= 200)) fail('header', 'non-empty string of at most 200 characters, or null');
    const known = resolveColumns(this.#options.columns);
    if (!known.leaves.some((l) => l.id === id) && !known.groups.has(id)) return false;
    if (header === null) this.#headerNames.delete(id);
    else this.#headerNames.set(id, header.trim());
    this.#applyColumns(this.#options.columns, false);
    this.#relayout('rename');
    return true;
  }

  /** Undo the user's column changes: order, widths, pinning, visibility, collapsed groups, and names. Emits `aui-columns-change` (reset). */
  resetColumns(): void {
    this.#columnState = { order: [], widths: {}, pinned: {}, hidden: {}, collapsed: {} };
    this.#headerNames.clear();
    this.#applyColumns(this.#options.columns, false);
    this.#relayout('reset');
  }

  /**
   * Add, update (by id), and remove (by id) rows. Sort is re-applied, rows keep their identity
   * (focus, scroll position), and changed cells are highlighted when enabled. Emits
   * `aui-rows-change`. Unknown ids are reported in `missing`; added rows must have new, unique ids.
   */
  applyTransaction(tx: DataGridTransaction<Row>): DataGridTransactionResult {
    this.#clearUndo();
    const result = this.#applyTx(tx);
    this.#pruneBatch();
    this.#afterRowsChange(result);
    return result;
  }

  /** Queue a transaction; queued transactions are applied together every `transactionDelay` ms. */
  applyTransactionAsync(tx: DataGridTransaction<Row>): void {
    this.#queue.push(tx);
    if (this.#queueTimer) return;
    this.#queueTimer = (this.#doc.defaultView ?? window).setTimeout(() => {
      this.flushTransactions();
    }, this.#config.transactionDelay);
  }

  /** Apply queued transactions now. */
  flushTransactions(): void {
    if (this.#queueTimer) (this.#doc.defaultView ?? window).clearTimeout(this.#queueTimer);
    this.#queueTimer = 0;
    const queue = this.#queue;
    this.#queue = [];
    if (queue.length === 0 || this.#destroyed) return;
    this.#clearUndo();
    const merged = { added: [] as string[], updated: [] as string[], removed: [] as string[], missing: [] as string[] };
    for (const tx of queue) {
      const r = this.#applyTx(tx);
      merged.added.push(...r.added);
      merged.updated.push(...r.updated);
      merged.removed.push(...r.removed);
      merged.missing.push(...r.missing);
    }
    this.#afterRowsChange(merged);
  }

  #applyTx(tx: DataGridTransaction<Row>): DataGridTransactionResult {
    if (!isObjectLike(tx)) fail('transaction', '{ add?, addIndex?, update?, remove? }');
    if (tx.add !== undefined && !isArray(tx.add)) fail('transaction.add', 'array of rows');
    if (tx.update !== undefined && !isArray(tx.update)) fail('transaction.update', 'array of rows');
    if (tx.remove !== undefined && !(isArray(tx.remove) && tx.remove.every((id) => typeof id === 'string'))) fail('transaction.remove', 'array of row ids');
    if (tx.addIndex !== undefined && !(Number.isInteger(tx.addIndex) && tx.addIndex >= 0)) fail('transaction.addIndex', 'integer >= 0');
    const server = this.#server;
    if (server) {
      // Server rows: updates replace loaded rows; adding and removing belong to the server (refresh).
      if (tx.add?.length) fail('transaction.add', 'no added rows with a datasource (refresh instead)');
      const updates = tx.update ?? [];
      const done = new Set(this.#caches().flatMap((cache) => cache.replace(updates)));
      const ids = updates.map((r) => this.#options.rowId(r));
      this.#sortRows();
      return { added: [], updated: ids.filter((id) => done.has(id)), removed: [], missing: [...ids.filter((id) => !done.has(id)), ...(tx.remove ?? [])] };
    }
    const rowId = this.#options.rowId;
    const missing: string[] = [];
    let rows = this.#source.map((item) => item.row);
    const position = new Map(this.#source.map((item, i) => [item.id, i]));
    const removed: string[] = [];
    if (tx.remove?.length) {
      const drop = new Set<string>();
      for (const id of tx.remove) {
        if (position.has(id)) drop.add(id);
        else missing.push(id);
      }
      rows = this.#source.filter((item) => !drop.has(item.id)).map((item) => item.row);
      removed.push(...drop);
      position.clear();
      rows.forEach((row, i) => position.set(rowId(row), i));
    }
    const updated: string[] = [];
    for (const row of tx.update ?? []) {
      const id = rowId(row);
      const at = position.get(id);
      if (at === undefined) missing.push(id);
      else {
        rows[at] = row;
        updated.push(id);
      }
    }
    const added: string[] = [];
    if (tx.add?.length) {
      for (const row of tx.add) {
        const id = rowId(row);
        if (typeof id !== 'string' || id === '' || position.has(id) || added.includes(id)) throw configurationError('DATA_GRID_ROW_ID', 'Duplicate row id.', { component: 'dataGrid', property: 'dataGrid.transaction.add', expected: 'new, unique row ids' });
        added.push(id);
      }
      const at = Math.min(tx.addIndex ?? rows.length, rows.length);
      rows = [...rows.slice(0, at), ...tx.add, ...rows.slice(at)];
    }
    this.#options = { ...this.#options, rows };
    const previous = this.#source;
    this.#source = rows.map((row, index) => ({ row, id: rowId(row), index }));
    // Unchanged rows keep their cached sort ranks; only updated and added rows are ranked again.
    this.#sorter.carry(previous, this.#source, new Set([...updated, ...added]), this.#engineColumns);
    this.#sortRows();
    return { added, updated, removed, missing };
  }

  #afterRowsChange(result: DataGridTransactionResult): void {
    this.#animateNextRender();
    this.#trimDetails();
    // Grouped and tree rows carry counts, levels, and expansion that any row change can alter.
    if (this.#grouped()) this.#generation++;
    this.#renderNow();
    emit(this.host, 'aui-rows-change', result satisfies DataGridRowsChangeDetail);
    this.#pruneSelection(true);
  }

  /** Let rows glide to their new positions on the next render (sort or row updates). */
  #animateNextRender(): void {
    if (!this.#config.animateRows) return;
    const host = this.host;
    host.classList.add('aui-data-grid--animating');
    if (this.#animTimer) (this.#doc.defaultView ?? window).clearTimeout(this.#animTimer);
    this.#animTimer = (this.#doc.defaultView ?? window).setTimeout(() => {
      host.classList.remove('aui-data-grid--animating');
      this.#animTimer = 0;
    }, 400);
  }

  /** Serializable view state: sort, columns, and paging. */
  getState(): DataGridState {
    return { version: 1, sort: this.sort, columns: this.getColumnsState(), page: this.#page, pageSize: this.#pageSize, filters: this.getFilters(), quickFilter: this.#quickFilter, advancedFilter: this.getAdvancedFilter(), selected: this.getSelected(), groupBy: this.#groupBy(), expanded: Object.fromEntries(this.#expanded), details: Object.fromEntries(this.#detailOpen), pinnedRows: this.getPinnedRows(), pivot: this.getPivot() };
  }

  /**
   * Restore a view state (from storage or a URL). Sections not present are left as they are;
   * unknown column ids are dropped; malformed input throws `DATA_GRID_STATE` and changes nothing.
   * Emits no events.
   */
  setState(state: unknown): void {
    const parsed = parseState(state, new Set(this.#leaves.map((l) => l.id)), new Set(this.#groupDefs.keys()));
    // Validated before anything changes.
    let pivot: DataGridPivot | null | undefined;
    if ('pivot' in parsed) {
      try {
        pivot = parsed.pivot === null || parsed.pivot === undefined ? null : parsePivot(parsed.pivot);
      } catch {
        throw configurationError('DATA_GRID_STATE', 'Invalid data grid state.', { component: 'dataGrid', property: 'dataGrid.state.pivot', expected: '{ rows, columns, values } or null' });
      }
    }
    if (pivot !== undefined) {
      this.#options = { ...this.#options, pivot };
      this.#applyColumns(this.#options.columns, false);
      this.#applyHostOptions();
    }
    const s = this.#columnState;
    if (parsed.order) s.order = parsed.order;
    if (parsed.widths) s.widths = parsed.widths;
    if (parsed.pinned) s.pinned = parsed.pinned;
    if (parsed.hidden) s.hidden = Object.fromEntries(this.#leaves.map((l) => [l.id, parsed.hidden?.includes(l.id) ?? false]));
    if (parsed.collapsed) s.collapsed = Object.fromEntries([...this.#groupDefs.keys()].map((id) => [id, parsed.collapsed?.includes(id) ?? false]));
    // At least one column stays visible.
    if (this.#leaves.every((l) => s.hidden[l.id] ?? l.def.hidden ?? false)) s.hidden = {};
    if (parsed.sort) this.#sorts = parsed.sort;
    if (parsed.filters) {
      const filters: Record<string, DataGridFilter> = {};
      for (const [id, model] of Object.entries(parsed.filters)) {
        const kind = this.#filterKind(id);
        if (kind) filters[id] = parseFilter(model, kind, `state.filters.${id}`);
      }
      this.#filters = filters;
    }
    if (parsed.quickFilter !== undefined) this.#quickFilter = parsed.quickFilter;
    if ('advancedFilter' in parsed) this.#advanced = parseAdvancedFilter(parsed.advancedFilter ?? null, (id) => this.#filterKind(id), 'state.advancedFilter');
    if (parsed.pageSize !== undefined) this.#pageSize = parsed.pageSize;
    if (parsed.page !== undefined) this.#page = parsed.page;
    if (parsed.selected) this.#selected = this.#validSelection(parsed.selected);
    if (parsed.expanded) this.#expanded = new Map(Object.entries(parsed.expanded));
    if (parsed.details) this.#detailOpen = new Map(Object.entries(parsed.details));
    if (parsed.headers) this.#headerNames = new Map(Object.entries(parsed.headers));
    if (parsed.pinnedRows) {
      const known = new Set(this.#source.map((item) => item.id));
      this.#userPins = new Map([...parsed.pinnedRows.top.map((id) => [id, 'top'] as const), ...parsed.pinnedRows.bottom.map((id) => [id, 'bottom'] as const)].filter(([id]) => this.#server !== null || known.has(id)));
    }
    if (parsed.groupBy) {
      this.#options = { ...this.#options, groupBy: parsed.groupBy };
      this.#applyColumns(this.#options.columns, false);
      this.#applyHostOptions();
    }
    this.#layout = layoutColumns(this.#leaves, this.#groupDefs, this.#stateForLayout(), this.#viewportWidth);
    this.#sortRows();
    if (parsed.pinnedRows) this.#pinnedSync();
    if (pivot !== undefined) this.#renderPivotPanel();
    this.#generation++;
    this.#renderHeader();
    this.#renderNow();
  }

  /** Move focus to a cell (scrolling it into view). Returns false when the row or column is not displayed. */
  focusCell(rowId: string, column: string): boolean {
    if (!this.#index().has(rowId) || !this.#layout.visible.some((c) => c.leaf.id === column)) return false;
    this.#moveFocus({ rowId, column, level: 0 }, true);
    return true;
  }

  /** Scroll a row into view. */
  scrollToRow(rowId: string): boolean {
    const index = this.#index().get(rowId);
    if (index === undefined) return false;
    this.#ensureRowVisible(index);
    this.#renderNow();
    return true;
  }

  /** Scroll a column into view. */
  scrollToColumn(column: string): boolean {
    const col = this.#layout.visible.find((c) => c.leaf.id === column);
    if (!col) return false;
    this.#ensureColumnVisible(col);
    this.#renderNow();
    return true;
  }

  /** Set columns to the width of their content (header and rendered cells). All visible columns when `ids` is omitted. */
  autoSizeColumns(ids?: readonly string[]): void {
    const targets = this.#layout.visible.filter((c) => !ids || ids.includes(c.leaf.id));
    for (const c of targets) this.#columnState.widths[c.leaf.id] = clampWidth(c.leaf.def, this.#measureColumn(c));
    this.#relayout('autosize');
  }

  /** Scale the visible columns so they fill the viewport width. */
  fitColumns(): void {
    const total = this.#layout.visible.reduce((s, c) => s + c.width, 0);
    const target = this.#viewport.clientWidth;
    if (total <= 0 || target <= 0) return;
    for (const c of this.#layout.visible) this.#columnState.widths[c.leaf.id] = clampWidth(c.leaf.def, (c.width * target) / total);
    this.#relayout('fit');
  }

  /**
   * Move a column or column group before or after another one with the same parent group.
   * Returns false when the move is not allowed (locked, not movable, or a different parent).
   */
  moveColumn(id: string, target: string, position: 'before' | 'after' = 'before'): boolean {
    if (isGeneratedColumn(id) || isGeneratedColumn(target)) return false;
    if (!this.#isMovable(id)) return false;
    const next = moveUnit(this.#leaves, this.#columnState.order, id, target, position === 'after');
    if (!next) return false;
    this.#columnState.order = next;
    this.#relayout('move');
    this.#announceMove(id);
    return true;
  }

  /** Pin a column to the start or end edge, or unpin it (`null`). Returns false for locked or unknown columns. */
  setColumnPinned(id: string, pinned: DataGridPinned | null): boolean {
    if (isGeneratedColumn(id)) return false;
    const leaf = this.#leaves.find((l) => l.id === id);
    if (!leaf || leaf.def.lockPinned) return false;
    this.#columnState.pinned[id] = pinned;
    this.#relayout('pin');
    const message = pinned === 'start' ? 'pinnedStart' : pinned === 'end' ? 'pinnedEnd' : 'unpinned';
    announce(getMessage('dataGrid', message, { column: leaf.def.header }, this.#config.locale), 'polite', this.#doc);
    return true;
  }

  /** Show or hide a column. At least one column stays visible. */
  setColumnHidden(id: string, hidden: boolean): boolean {
    if (isGeneratedColumn(id)) return false;
    const leaf = this.#leaves.find((l) => l.id === id);
    if (!leaf) return false;
    if (hidden && this.#layout.visible.length <= 1 && this.#layout.visible[0]?.leaf.id === id) return false;
    this.#columnState.hidden[id] = hidden;
    if (hidden && this.#focus?.column === id) this.#focus = null;
    this.#relayout('visibility');
    return true;
  }

  destroy(): void {
    if (this.#destroyed) return;
    // Destroyed first: closing the panel then applies nothing and moves no focus.
    this.#destroyed = true;
    this.#closeFilterPanel(false);
    this.#closeEditor();
    for (const detach of this.#accessoryDisposers.splice(0)) detach();
    for (const cache of this.#caches()) cache.destroy();
    this.#serverChildren.clear();
    this.#server = null;
    for (const id of [...this.#detailCache.keys()]) this.#releaseDetail(id);
    this.#builder?.destroy();
    this.#builder = null;
    this.#advancedBar?.destroy();
    for (const { control } of this.#floating.values()) control.destroy();
    this.#floating.clear();
    if (this.#searchTimer) (this.#doc.defaultView ?? window).clearTimeout(this.#searchTimer);
    this.#group.dispose();
    for (const entry of this.#rows.values()) this.#dropRow(entry);
    this.#rows.clear();
    this.host.replaceChildren();
    this.host.classList.remove('aui-data-grid');
  }

  // ---- Formulas (R11-18; the engine comes from data-grid/formulas) ---------------------------------

  /** The formula columns in definition order (stable A1 letters) and the book over the source rows. */
  #formulaBook(): DataGridFormulaBook | null {
    const engine = this.#options.formulas;
    if (!engine || this.#server) return null;
    if (this.#book && this.#bookSource === this.#source) return this.#book;
    const users = this.#leaves.filter((l) => !isGeneratedColumn(l.id));
    if (!users.some((l) => l.def.formula !== undefined || l.def.formulas === true)) return null;
    // Rebuilt for new rows: row positions are the source order.
    this.#bookSource = this.#source;
    this.#rowPositions = new Map(this.#source.map((item, i) => [item.row, i]));
    const byName = new Map<string, number>();
    users.forEach((l, i) => {
      byName.set(l.id.toLowerCase(), i);
      if (!byName.has(l.def.header.toLowerCase())) byName.set(l.def.header.toLowerCase(), i);
    });
    const defs = users.map((l) => l.def);
    const accessors = users.map((l) => this.#rawAccessors.get(l.id));
    // Rows holding cell formulas, by formula column.
    const formulaRows = new Map<number, number[]>();
    defs.forEach((def, c) => {
      if (def.formulas !== true) return;
      const read = accessors[c];
      const rows: number[] = [];
      this.#source.forEach((item, r) => {
        if (isFormulaText(read?.(item.row))) rows.push(r);
      });
      formulaRows.set(c, rows);
    });
    const timezone = (): string => this.#config.timezone;
    const source: DataGridFormulaSource = {
      rowCount: this.#source.length,
      columnCount: users.length,
      column: (name) => byName.get(name.trim().toLowerCase()) ?? -1,
      formula: (row, column) => {
        const def = defs[column];
        if (def?.formula !== undefined) return def.formula;
        if (def?.formulas !== true) return null;
        const item = this.#source[row];
        const value = item ? accessors[column]?.(item.row) : null;
        return isFormulaText(value) ? value : null;
      },
      value: (row, column) => {
        const item = this.#source[row];
        const value = item ? accessors[column]?.(item.row) : null;
        if (value === undefined) return null;
        // Instants read as their calendar date in the grid time zone.
        return isInstantLike(value) ? toPlainDateTime(value, timezone()).date : value;
      },
      formulaRows: function* (column, top, bottom) {
        if (defs[column]?.formula !== undefined) {
          for (let r = top; r <= bottom; r++) yield r;
          return;
        }
        for (const r of formulaRows.get(column) ?? []) if (r >= top && r <= bottom) yield r;
      },
    };
    this.#book = engine.create(source, { today: () => todayIn(timezone(), Date.now()) });
    this.#bookColumns = new Map(users.map((l, i) => [l.id, i]));
    // Calculated values may change with any row: cached sort ranks are stale.
    this.#sorter.invalidate();
    return this.#book;
  }

  /** A calculated cell's value (an error is `{ error: code }`). */
  #calculated(row: Row, column: string): unknown {
    const book = this.#formulaBook();
    const r = this.#rowPositions.get(row);
    const c = this.#bookColumns.get(column);
    if (!book || r === undefined || c === undefined) return null;
    return book.value(r, c);
  }

  // ---- Columns -------------------------------------------------------------------------

  #applyColumns(defs: readonly DataGridColumnDef<Row>[], creating: boolean): void {
    if (resolveColumns(defs).leaves.some((l) => l.id === SELECT_COLUMN)) fail('columns', `column ids other than "${SELECT_COLUMN}" (reserved for row selection)`);
    const selection = this.#options.rowSelection;
    if (resolveColumns(defs).leaves.some((l) => isGroupColumn(l.id))) fail('columns', `column ids other than "${GROUP_COLUMN}" (reserved for grouping)`);
    if (resolveColumns(defs).leaves.some((l) => l.id === DETAIL_COLUMN || l.id === ROW_NUMBER_COLUMN || l.id === FULL_WIDTH_COLUMN || l.id.startsWith(PIVOT_PREFIX))) fail('columns', `column ids other than "${DETAIL_COLUMN}", "${ROW_NUMBER_COLUMN}", and "${PIVOT_PREFIX}..." (reserved)`);
    if (this.#headerNames.size > 0) defs = this.#renamed(defs);
    const generated = [...(this.#options.rowNumbers ? [this.#rowNumberColumn()] : []), ...(selection && selection.checkboxes !== false ? [this.#selectColumn()] : []), ...(this.#options.detail ? [this.#detailColumn()] : []), ...(this.#grouped() ? this.#groupColumns(resolveColumns(defs).leaves) : []), ...(this.#options.pivot && !this.#options.treeData ? this.#pivotDefs : [])];
    const { leaves, groups } = resolveColumns([...generated, ...defs]);
    this.#leaves = leaves;
    this.#groupDefs = groups;
    this.#rawAccessors = new Map();
    this.#engineColumns = new Map(
      leaves.map((l) => {
        const def = l.def;
        const field = def.field;
        const id = def.id;
        const raw = def.accessor ?? (field === undefined ? (): unknown => undefined : (row: Row): unknown => (row as Record<string, unknown> | null)?.[field]);
        this.#rawAccessors.set(id, raw);
        const accessor =
          def.formula !== undefined
            ? (row: Row): unknown => this.#calculated(row, id)
            : def.formulas === true
              ? (row: Row): unknown => {
                  const value = raw(row);
                  return isFormulaText(value) ? this.#calculated(row, id) : value;
                }
              : raw;
        const engine: DataTableColumn<Row> = { id: def.id, header: def.header, accessor, ...(def.type ? { type: def.type } : {}), ...(def.compare ? { compare: def.compare } : {}), ...(def.currency ? { currency: def.currency } : {}) };
        return [def.id, engine];
      }),
    );
    // Accessors may have changed: cached text ranks and quick-filter texts are stale.
    this.#sorter.invalidate();
    this.#book = null;
    this.#bookSource = null;
    if (leaves.some((l) => l.def.formula !== undefined || l.def.formulas === true) && !this.#options.formulas) fail('formulas', 'a formula engine (formulaEngine() from @absoluteui/components/data-grid/formulas) for columns with formula or formulas');
    this.#quickText = new WeakMap();
    this.#setValueCache.clear();
    if (!creating) {
      // Drop state for columns that no longer exist.
      const known = new Set(leaves.map((l) => l.id));
      const s = this.#columnState;
      s.order = s.order.filter((id) => known.has(id));
      const keep = <V>(rec: Record<string, V>, has: (k: string) => boolean): Record<string, V> => Object.fromEntries(Object.entries(rec).filter(([k]) => has(k)));
      s.widths = keep(s.widths, (k) => known.has(k));
      s.pinned = keep(s.pinned, (k) => known.has(k));
      s.hidden = keep(s.hidden, (k) => known.has(k));
      s.collapsed = keep(s.collapsed, (k) => groups.has(k));
      this.#sorts = this.#sorts.filter((x) => known.has(x.column));
    }
    this.#layout = layoutColumns(this.#leaves, this.#groupDefs, this.#stateForLayout(), this.#viewportWidth);
    const rows = leaves.map((l) => l.def).filter((d) => d.spanRows !== undefined && d.spanRows !== false);
    const cols = leaves.some((l) => l.def.colSpan !== undefined);
    this.#spanColumns = { rows, cols, any: rows.length > 0 || cols };
  }

  /** Column definitions with the user's header names. */
  #renamed(defs: readonly DataGridColumnDef<Row>[]): DataGridColumnDef<Row>[] {
    return defs.map((def): DataGridColumnDef<Row> => {
      const header = this.#headerNames.get(def.id);
      const named = header === undefined ? def : { ...def, header };
      return 'children' in named ? { ...named, children: this.#renamed(named.children) } : named;
    });
  }

  #stateForLayout(): ColumnState {
    const s = this.#columnState;
    // Grouped columns hide while grouped (their values show in the group column).
    const grouped = this.#grouped() && this.#options.hideGroupedColumns !== false ? { ...s.hidden, ...Object.fromEntries(this.#groupBy().map((id) => [id, true])) } : s.hidden;
    // Pivot mode shows the group column and the result columns only.
    const hidden = this.#pivot() ? { ...grouped, ...Object.fromEntries(this.#leaves.filter((l) => !isGeneratedColumn(l.id)).map((l) => [l.id, true])) } : grouped;
    return { order: s.order, widths: s.widths, pinned: s.pinned, hidden, collapsed: s.collapsed };
  }

  #relayout(reason: DataGridColumnsChangeReason | null): void {
    this.#layout = layoutColumns(this.#leaves, this.#groupDefs, this.#stateForLayout(), this.#viewportWidth);
    this.#generation++;
    this.#renderHeader();
    this.#renderNow();
    if (reason) emit(this.host, 'aui-columns-change', { reason, columns: this.getColumnsState() } satisfies DataGridColumnsChangeDetail);
  }

  // ---- Rows and sorting ------------------------------------------------------------------

  #setRows(input: readonly Row[]): void {
    const field = this.#options.treeData?.childrenField;
    let rows = input;
    this.#treeParent = new Map();
    if (field) {
      const nested = flattenNested(input, (row) => {
        const kids = fieldOf(row, field);
        return Array.isArray(kids) ? (kids as readonly Row[]) : undefined;
      }, (row) => this.#options.rowId(row));
      rows = nested.rows;
      this.#treeParent = nested.parent;
    }
    const seen = new Set<string>();
    const items: Item<Row>[] = [];
    rows.forEach((row, index) => {
      const id = this.#options.rowId(row);
      if (typeof id !== 'string' || id === '') throw configurationError('DATA_GRID_ROW_ID', 'Invalid row id.', { component: 'dataGrid', property: 'dataGrid.rowId', expected: 'non-empty string' });
      if (seen.has(id)) throw configurationError('DATA_GRID_ROW_ID', 'Duplicate row id.', { component: 'dataGrid', property: 'dataGrid.rowId', expected: 'unique id per row' });
      seen.add(id);
      items.push({ row, id, index });
    });
    this.#source = items;
    this.#sorter.invalidate();
    this.#sortRows();
  }

  #sortRows(): void {
    // New rows: formula results are recalculated (the book is rebuilt over the new source).
    if (this.#book && this.#bookSource !== this.#source) this.#formulaBook();
    if (this.#server) {
      this.#serverSync();
      this.#paginate();
      return;
    }
    const sorts = this.#sorts.filter((s) => this.#leafDef(s.column)?.sortable !== false);
    const filtered = this.#filterItems(this.#source);
    this.#filteredCount = filtered.length;
    if (this.#options.treeData) {
      // Tree data: every row is ranked (ancestors that do not match still show, in sort order).
      const all = this.#sorter.sort(this.#source, sorts, this.#engineColumns, this.#config.locale, this.#source.length);
      this.#treePass = new Set(filtered.map((item) => item.id));
      this.#treeRank = new Map(all.map((item, i) => [item.id, i]));
      this.#sorted = all.filter((item) => this.#treePass.has(item.id));
    } else this.#sorted = this.#sorter.sort(filtered, sorts, this.#engineColumns, this.#config.locale, this.#source.length);
    this.#regroup();
    this.#paginate();
  }

  // ---- Server row model -------------------------------------------------------------------

  /** Create the block cache for the datasource (replacing an earlier one and its group caches). */
  #initServer(): void {
    this.#assertServerOptions();
    for (const cache of this.#caches()) cache.destroy();
    this.#server = null;
    this.#serverChildren.clear();
    this.#serverQuery = '';
    this.#serverTemplate = null;
    this.#placeholders.clear();
    this.#segments = [];
    if (!this.#options.datasource) return;
    this.#server = this.#makeCache([]);
  }

  /** A block cache for the rows under a group path (`[]`: the top level). */
  #makeCache(keys: readonly unknown[], initial = 0): ServerCache<Row> {
    const ds = this.#options.datasource;
    if (!ds) fail('datasource', '{ getRows(request, signal) }');
    return new ServerCache<Row>({
      blockSize: this.#options.blockSize ?? 100,
      maxBlocks: this.#options.maxBlocks ?? null,
      delay: this.#options.blockLoadDelay ?? 50,
      maxConcurrent: this.#options.maxConcurrentLoads ?? 2,
      initialRowCount: keys.length === 0 ? (this.#options.initialRowCount ?? 0) : initial,
      rowId: this.#options.rowId,
      win: this.#doc.defaultView ?? window,
      load: (start, end, signal) => ds.getRows({ start, end, sort: this.sort, filters: this.getFilters(), quickFilter: this.#quickFilter, advancedFilter: this.getAdvancedFilter(), groupBy: this.#serverGroupBy(), groupKeys: keys }, signal),
      onChange: () => {
        this.#serverChanged();
      },
    });
  }

  /** Every block cache: the top level and the expanded groups'. */
  #caches(): ServerCache<Row>[] {
    return this.#server ? [this.#server, ...[...this.#serverChildren.values()].map((c) => c.cache)] : [];
  }

  /** The cache of a group path (route: encoded key ids), created and started on first use (sized by the group's child count, when known). */
  #childCache(route: string, keys: readonly unknown[], initial: number): ServerCache<Row> {
    let child = this.#serverChildren.get(route);
    if (!child) {
      child = { cache: this.#makeCache(keys, initial), keys };
      this.#serverChildren.set(route, child);
      child.cache.ensure(0, (this.#options.blockSize ?? 100) - 1);
    }
    return child.cache;
  }

  /** Columns the server groups by (none for server tree data). */
  #serverGroupBy(): string[] {
    return this.#options.treeData ? [] : this.#groupBy();
  }

  /** Options that cannot combine with a datasource, and server tree data without one. */
  #assertServerOptions(): void {
    const o = this.#options;
    const serverTree = o.treeData?.serverGroup !== undefined;
    if (o.datasource && (o.pivot || o.detail)) fail('datasource', 'no pivot or detail together with a datasource');
    if (o.datasource && o.treeData && !serverTree) fail('treeData', '{ serverGroup, serverKey } together with a datasource');
    if (!o.datasource && serverTree) fail('treeData', 'getPath, parentIdField, or childrenField without a datasource (serverGroup needs one)');
  }

  /**
   * Display rows from the loaded blocks: the top level, and below each expanded group (or server
   * tree parent) its own cache; rows not loaded are runs of holes (`#segments` maps them back).
   * A changed sort, filter, or grouping purges every cache and loads from the top.
   */
  #serverSync(): void {
    const server = this.#server;
    if (!server) return;
    const groupBy = this.#serverGroupBy();
    const tree = this.#options.treeData;
    const query = JSON.stringify({ sort: this.sort, filters: this.getFilters(), quick: this.#quickFilter, advanced: this.getAdvancedFilter(), groupBy, tree: Boolean(tree) });
    if (query !== this.#serverQuery) {
      const first = this.#serverQuery === '';
      this.#serverQuery = query;
      for (const child of this.#serverChildren.values()) child.cache.destroy();
      this.#serverChildren.clear();
      // Loading rows keep the previous count until the server answers.
      server.purge(!first);
      this.#placeholders.clear();
      this.#serverAnnounced = false;
      if (!first) this.#viewport.scrollTop = 0;
      server.ensure(0, (this.#options.blockSize ?? 100) - 1);
    }
    const top = server.loaded();
    const firstRow = top[0];
    if (firstRow) this.#serverTemplate = { row: firstRow.row };
    const display: GridItem<Row>[] = [];
    const segments: ServerSegment<Row>[] = [];
    const positions = new Map<string, string>();
    const source: Item<Row>[] = [];
    const roots: GroupNode<Row>[] = [];
    const opened = this.#options.groupDefaultExpanded ?? 0;
    const flat = groupBy.length === 0 && !tree;
    const aggregated = this.#aggregateColumns();
    const visited = new Set<string>();
    const walk = (cache: ServerCache<Row>, route: string, keys: readonly unknown[], level: number, parent: GroupNode<Row> | null): void => {
      const count = cache.rowCount;
      let pos = 0;
      const hole = (from: number, to: number): void => {
        if (to <= from) return;
        segments.push({ start: display.length, count: to - from, cache, route, from, level });
        display.length += to - from;
      };
      for (const item of cache.loaded()) {
        if (item.index >= count) break;
        hole(pos, item.index);
        pos = item.index + 1;
        const group = tree ? tree.serverGroup?.(item.row) === true : level < groupBy.length;
        if (!group) {
          source.push(item);
          positions.set(`${route}|${String(item.index)}`, item.id);
          display.push(flat ? item : { ...item, display: { kind: 'data', item, level, parent, position: item.index + 1, size: count } });
          continue;
        }
        const column = groupBy[level] ?? '';
        const raw: unknown = tree ? tree.serverKey?.(item.row) : this.#engineColumns.get(column)?.accessor(item.row);
        const key = raw === undefined || raw === '' ? null : raw;
        const childKeys = [...keys, key];
        const childRoute = encodeURIComponent(JSON.stringify(childKeys.map(keyId)));
        const childCount: unknown = this.#options.getChildCount?.(item.row);
        const node: GroupNode<Row> = {
          id: tree ? item.id : `group:${childRoute}`,
          level,
          column,
          part: undefined,
          key: tree ? this.#treeItemLabel(item) : key,
          parent,
          groups: [],
          items: [],
          leaves: [],
          aggregates: new Map(aggregated.map((a) => [a.column, a.read(item.row)])),
          ...(tree ? { item } : {}),
          lazy: { row: item, count: typeof childCount === 'number' && Number.isInteger(childCount) && childCount >= 0 ? childCount : null, keys: childKeys },
        };
        if (tree) source.push(item);
        (parent ? parent.groups : roots).push(node);
        const expanded = this.#expanded.get(node.id) ?? (opened === -1 || level < opened);
        const d: DisplayRow<Row> = { kind: 'group', node, expanded, position: item.index + 1, size: count };
        positions.set(`${route}|${String(item.index)}`, node.id);
        display.push(tree ? { ...item, display: d } : { row: item.row, id: node.id, index: -1, display: d });
        if (expanded) {
          visited.add(childRoute);
          walk(this.#childCache(childRoute, childKeys, node.lazy?.count ?? 0), childRoute, childKeys, level + 1, node);
        }
      }
      hole(pos, count);
    };
    if (this.#serverTemplate) walk(server, '', [], 0, null);
    if (this.#options.purgeClosedGroups === true) {
      // Collapsed groups release their rows (they load again when expanded).
      for (const [route, child] of this.#serverChildren) {
        if (visited.has(route)) continue;
        child.cache.destroy();
        this.#serverChildren.delete(route);
      }
    }
    this.#source = source;
    this.#sorted = source;
    this.#filteredCount = server.rowCount;
    this.#groups = roots;
    this.#grand = null;
    this.#tree = null;
    this.#display = display;
    this.#segments = segments;
    this.#serverPositions = positions;
    for (const id of [...this.#placeholders.keys()]) if (positions.has(id.slice(8))) this.#placeholders.delete(id);
  }

  /** Blocks arrived, failed, or a count changed: rebuild the rows, keeping focus on the row it was on. */
  #serverChanged(): void {
    const server = this.#server;
    if (!server || this.#destroyed) return;
    const focus = this.#focus;
    this.#serverSync();
    const slot = focus?.rowId?.startsWith('loading:') ? this.#serverPositions.get(focus.rowId.slice(8)) : undefined;
    if (focus && slot !== undefined) this.#focus = { rowId: slot, column: focus.column, level: 0 };
    this.#paginate();
    // Busy while the `loading` option is on or blocks are loading (absent otherwise, as without a datasource).
    this.element.toggleAttribute('aria-busy', this.#options.loading === true || this.#serverBusy());
    this.#renderOverlay();
    this.#renderNow();
    const locale = this.#config.locale;
    if (!this.#serverAnnounced && server.known) {
      this.#serverAnnounced = true;
      announce(getMessage('dataGrid', 'serverRowCount', { count: formatNumber(server.rowCount, {}, locale) }, locale), 'polite', this.#doc);
    }
    const failed = [...this.#placeholders.values()].some((p) => p.display?.kind === 'loading' && p.display.failed !== null);
    if (failed && !this.#serverFailed) announce(getMessage('dataGrid', 'rowsFailedAnnounce', {}, locale), 'polite', this.#doc);
    this.#serverFailed = failed;
  }

  #serverBusy(): boolean {
    return this.#caches().some((c) => c.busy);
  }

  /** The run of rows not loaded that holds a display index, or undefined. */
  #segmentAt(index: number): ServerSegment<Row> | undefined {
    const list = this.#segments;
    let lo = 0;
    let hi = list.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = list[mid];
      if (!s) break;
      if (index < s.start) hi = mid - 1;
      else if (index >= s.start + s.count) lo = mid + 1;
      else return s;
    }
    return undefined;
  }

  /** Load the rows of a display range (each run of rows not loaded asks its own cache). */
  #ensureDisplay(first: number, last: number): void {
    for (const s of this.#segments) {
      if (s.start > last || s.start + s.count - 1 < first) continue;
      s.cache.ensure(s.from + Math.max(first, s.start) - s.start, s.from + Math.min(last, s.start + s.count - 1) - s.start);
    }
  }

  /** The row at a page index; with a datasource, rows not loaded yet are placeholders (made on first use). */
  #itemAt(index: number): GridItem<Row> | undefined {
    const item = this.#items[index];
    if (item || !this.#server || !this.#serverTemplate || index < 0 || index >= this.#items.length) return item;
    const segment = this.#segmentAt(this.#pageOffset + index);
    if (!segment) return undefined;
    const position = segment.from + this.#pageOffset + index - segment.start;
    const { state, error } = segment.cache.stateAt(position);
    const failed = state === 'failed' ? error : null;
    const id = `loading:${segment.route}|${String(position)}`;
    const existing = this.#placeholders.get(id);
    const same = existing?.display?.kind === 'loading' && existing.display.failed === failed;
    const placeholder: GridItem<Row> = existing && same ? existing : { row: this.#serverTemplate.row, id, index: -1, display: { kind: 'loading', index: position, failed, level: segment.level } };
    this.#placeholders.set(id, placeholder);
    this.#index().set(placeholder.id, index);
    return placeholder;
  }

  /** Server row model: reload the loaded rows (`purge`: drop them first and show loading rows). */
  refresh(options: { purge?: boolean; route?: readonly unknown[] } = {}): void {
    const route = options.route;
    if (route === undefined) {
      for (const cache of this.#caches()) cache.refresh(options.purge === true);
      return;
    }
    // One group's children (route: the group keys from the top).
    const cache = route.length === 0 ? this.#server : this.#serverChildren.get(encodeURIComponent(JSON.stringify(route.map(keyId))))?.cache;
    cache?.refresh(options.purge === true);
  }

  /**
   * Server row model: apply changes the server already holds to the loaded rows (adds and
   * removes shift later rows; `rowCount` corrects the total). Emits `aui-rows-change`.
   */
  applyServerTransaction(tx: DataGridServerTransaction<Row>): DataGridTransactionResult {
    if (!this.#server) fail('datasource', 'a datasource for server transactions');
    if (tx.route !== undefined && !isArray(tx.route)) fail('serverTransaction.route', 'array of group keys');
    const route = tx.route ?? [];
    const server = route.length === 0 ? this.#server : this.#serverChildren.get(encodeURIComponent(JSON.stringify(route.map(keyId))))?.cache;
    if (!server) fail('serverTransaction.route', 'the keys of a loaded, expanded group');
    if (!isObjectLike(tx)) fail('serverTransaction', '{ add?, addIndex?, update?, remove?, rowCount? }');
    if (tx.add !== undefined && !isArray(tx.add)) fail('serverTransaction.add', 'array of rows');
    if (tx.update !== undefined && !isArray(tx.update)) fail('serverTransaction.update', 'array of rows');
    if (tx.remove !== undefined && !(isArray(tx.remove) && tx.remove.every((id) => typeof id === 'string'))) fail('serverTransaction.remove', 'array of row ids');
    for (const key of ['addIndex', 'rowCount'] as const) {
      const v = tx[key];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) fail(`serverTransaction.${key}`, 'integer >= 0');
    }
    const known = new Set(server.loaded().map((item) => item.id));
    const ids = new Set<string>();
    for (const row of tx.add ?? []) {
      const id: unknown = this.#options.rowId(row);
      if (typeof id !== 'string' || id === '' || ids.has(id) || known.has(id)) throw configurationError('DATA_GRID_ROW_ID', 'Duplicate row id.', { component: 'dataGrid', property: 'dataGrid.serverTransaction.add', expected: 'new, unique row ids' });
      ids.add(id);
    }
    this.#clearUndo();
    const result = server.transact(tx);
    for (const id of result.removed) this.#selected.delete(id);
    this.#pruneBatch();
    this.#afterRowsChange(result);
    return result;
  }

  /** Server row model: load failed blocks again (never done automatically). */
  retryLoads(): void {
    for (const cache of this.#caches()) cache.retry();
  }

  /** Server row model: set the row count (`known` false keeps growing it as blocks arrive). */
  setRowCount(count: number, known = true): void {
    if (!(Number.isInteger(count) && count >= 0)) fail('rowCount', 'integer >= 0');
    this.#server?.setRowCount(count, known);
  }

  /** Server row model: whether the total row count is known. Client rows: always true. */
  isRowCountKnown(): boolean {
    return this.#server ? this.#server.known : true;
  }

  // ---- Filtering ---------------------------------------------------------------------------

  /** Validate and keep filters for known, filterable columns. */
  #applyFilters(filters: DataGridFilters | undefined): void {
    const next: Record<string, DataGridFilter> = {};
    for (const [id, model] of Object.entries(filters ?? {})) {
      const kind = this.#filterKind(id);
      if (kind) next[id] = parseFilter(model, kind, `filters.${id}`);
    }
    this.#filters = next;
  }

  #filterKind(id: string): DataGridFilterKind | null {
    const def = this.#leafDef(id);
    return def?.filter ?? null;
  }

  #filterColumn(def: DataGridColumn<Row>): FilterColumn<Row> {
    const engine = this.#engineColumns.get(def.id);
    const raw = def.filterValue ?? ((row: Row): unknown => engine?.accessor(row));
    return {
      id: def.id,
      kind: def.filter ?? 'text',
      text: (row) => {
        if (def.filterValue) {
          const v = def.filterValue(row);
          return typeof v === 'string' ? v : this.#cellText(def, v, row);
        }
        return this.#cellText(def, engine?.accessor(row), row);
      },
      value: raw,
      caseSensitive: def.filterCaseSensitive === true,
      accentSensitive: def.filterAccentSensitive === true,
      calendar: def.businessCalendar,
    };
  }

  #filterEnvironment(): FilterEnvironment {
    const { locale, timezone } = this.#config;
    return { locale, timezone, today: todayIn(timezone, Date.now()), firstDayOfWeek: getFirstDayOfWeek(locale) };
  }

  #filterItems(items: readonly Item<Row>[]): readonly Item<Row>[] {
    const tests: ((row: Row) => boolean)[] = [];
    const env = this.#filterEnvironment();
    if (this.#options.advancedFilter === true) {
      // The advanced filter replaces the column filters (which are kept, not applied).
      const advanced = this.#advanced ? compileAdvancedFilter(this.#advanced, (id) => {
        const def = this.#leafDef(id);
        return def?.filter ? this.#filterColumn(def) : null;
      }, env) : null;
      if (advanced) tests.push(advanced);
    } else {
      for (const [id, model] of Object.entries(this.#filters)) {
        const def = this.#leafDef(id);
        if (!def) continue;
        const test = compileFilter(this.#filterColumn(def), model, env);
        if (test) tests.push(test);
      }
    }
    const quick = this.#quickTest();
    if (quick) tests.push(quick);
    const external = this.#options.externalFilter;
    if (external) tests.push(external);
    if (tests.length === 0) return items;
    return items.filter((item) => tests.every((t) => t(item.row)));
  }

  /** Every word must appear in the normalized text of some searchable visible column. */
  #quickTest(): ((row: Row) => boolean) | null {
    const norm = normalizer(this.#config.locale, false, false);
    const words = norm(this.#quickFilter).split(/\s+/).filter((w) => w !== '');
    if (words.length === 0) return null;
    const columns = this.#layout.visible.map((c) => c.leaf.def).filter((d) => d.searchable !== false);
    // Cached texts are per column position: a different column set (visibility, order, locale) starts afresh.
    const signature = [this.#config.locale, ...columns.map((d) => d.id)].join('\n');
    if (signature !== this.#quickSignature) {
      this.#quickSignature = signature;
      this.#quickText = new WeakMap();
    }
    const cache = this.#quickText;
    // Displayed text, or the column's filterValue when given.
    const readers = columns.map((d) => this.#filterColumn(d).text);
    return (row) => {
      const cacheable = typeof row === 'object' && row !== null;
      let texts = cacheable ? cache.get(row) : undefined;
      if (!texts) {
        texts = [];
        if (cacheable) cache.set(row, texts);
      }
      const t = texts;
      // Columns are formatted only until one matches (formatting dominates the first search).
      const text = (i: number): string => {
        let v = t[i];
        if (v === undefined) {
          const read = readers[i];
          v = read ? norm(read(row)) : '';
          t[i] = v;
        }
        return v;
      };
      return words.every((w) => {
        for (let i = 0; i < columns.length; i++) if (text(i).includes(w)) return true;
        return false;
      });
    };
  }

  /** Active column filters (copies). */
  getFilters(): DataGridFilters {
    return structuredClone(this.#filters);
  }

  /** Set or clear (`null`) one column's filter. Validated; emits nothing. */
  setFilter(column: string, filter: DataGridFilter | null): void {
    const kind = this.#filterKind(column);
    if (!kind) fail(`filters.${column}`, 'a filterable column (column.filter)');
    const next = Object.fromEntries(Object.entries(this.#filters).filter(([id]) => id !== column));
    if (filter !== null) next[column] = parseFilter(filter, kind, `filters.${column}`);
    this.#filters = next;
    this.#refilter();
  }

  /** Set the quick filter text. Emits nothing. */
  setQuickFilter(text: string): void {
    if (!isText(text)) fail('quickFilter', 'string');
    this.#quickFilter = text;
    this.#refilter();
  }

  /** Re-run filters (for example after the external filter's inputs changed). */
  refreshFilters(): void {
    this.#refilter();
  }

  /** The advanced filter model (a copy), or null. */
  getAdvancedFilter(): DataGridAdvancedFilter | null {
    return this.#advanced ? structuredClone(this.#advanced) : null;
  }

  /** Set or clear (`null`) the advanced filter model. Validated (conditions on unknown columns are dropped); emits nothing. */
  setAdvancedFilter(filter: DataGridAdvancedFilter | null): void {
    this.#applyAdvanced(filter);
    this.#refilter();
  }

  #applyAdvanced(filter: DataGridAdvancedFilter | null | undefined): void {
    this.#advanced = parseAdvancedFilter(filter ?? null, (id) => this.#filterKind(id), 'advancedFilterModel');
  }

  // ---- Row selection -------------------------------------------------------------------------

  /** Selected row ids, in source order. */
  getSelected(): string[] {
    return this.#source.filter((item) => this.#isRowSelected(item.id)).map((item) => item.id);
  }

  /** Selected rows, in source order. */
  getSelectedRows(): Row[] {
    return this.#source.filter((item) => this.#isRowSelected(item.id)).map((item) => item.row);
  }

  /** Server rows: the selection as `{ selectAll, toggled }` (toggled: the exceptions to selectAll). */
  getServerSelection(): { selectAll: boolean; toggled: string[] } {
    return { selectAll: this.#serverSelectAll, toggled: [...this.#selected] };
  }

  /** Server rows: set the selection state. Emits nothing. */
  setServerSelection(state: { readonly selectAll: boolean; readonly toggled: readonly string[] }): void {
    const s: unknown = state;
    const r = isObjectLike(s) ? (s as Partial<Record<'selectAll' | 'toggled', unknown>>) : null;
    if (!r || !isBool(r.selectAll) || !(Array.isArray(r.toggled) && r.toggled.length <= 1_000_000 && r.toggled.every((id) => typeof id === 'string'))) fail('serverSelection', '{ selectAll: boolean, toggled: string[] }');
    if (!this.#server || this.#options.rowSelection?.mode !== 'multiple') fail('serverSelection', 'a datasource and rowSelection mode "multiple"');
    this.#serverSelectAll = r.selectAll === true;
    this.#selected = new Set(r.toggled as readonly string[]);
    this.#syncSelection();
  }

  /** Replace the selection (unknown and unselectable ids are dropped; single mode keeps the first). Emits nothing. */
  setSelected(ids: readonly string[]): void {
    if (!(isArray(ids) && ids.every((id) => typeof id === 'string'))) fail('selected', 'array of row ids');
    this.#serverSelectAll = false;
    this.#selected = this.#validSelection(ids);
    this.#syncSelection();
  }

  /** Select every selectable row in a scope (default: the configured `selectAll`). Emits nothing. */
  selectAll(scope?: DataGridSelectAllScope): void {
    if (this.#options.rowSelection?.mode !== 'multiple') return;
    if (this.#server) {
      this.#serverSelectAll = true;
      this.#selected.clear();
    } else for (const item of this.#scope(scope)) if (this.#isSelectable(item.row)) this.#selected.add(item.id);
    this.#syncSelection();
  }

  /** Clear the selection. Emits nothing. */
  clearSelection(): void {
    this.#serverSelectAll = false;
    this.#selected.clear();
    this.#syncSelection();
  }

  /** The synthetic checkbox column (pinned first, fixed width, never sorted, filtered, searched, or moved). */
  #selectColumn(): DataGridColumn<Row> {
    return {
      id: SELECT_COLUMN,
      header: getMessage('dataGrid', 'selectionColumn', {}, this.#config.locale),
      width: 44,
      minWidth: 44,
      maxWidth: 44,
      resizable: false,
      movable: false,
      sortable: false,
      searchable: false,
      pinned: 'start',
      lockPinned: true,
      lockPosition: 'start',
      align: 'center',
      render: (row, context) => this.#selectBox(row, context.rowId),
    };
  }

  /** Attach the accessories (after the first render, and again when they change). */
  #attachAccessories(): void {
    const had = this.#accessoryDisposers.length > 0;
    for (const detach of this.#accessoryDisposers.splice(0)) detach();
    this.#headerButtons = [];
    const list = this.#options.accessories ?? [];
    if (!had && list.length === 0) return;
    if (list.length > 0) {
      const context = this.#accessoryContext();
      for (const accessory of list) this.#accessoryDisposers.push(accessory.attach(context));
    }
    this.#generation++;
    this.#renderHeader();
  }

  #accessoryContext(): DataGridAccessoryContext<Row> {
    return {
      grid: this,
      element: this.element,
      host: this.host,
      doc: this.#doc,
      locale: () => this.#config.locale,
      direction: () => this.#config.direction,
      cellAt: (target) => {
        const cell = this.#ownCell(target);
        const column = cell?.dataset.column;
        if (!cell || column === undefined) return null;
        if (cell.getAttribute('role') === 'columnheader') return { rowId: null, column, pinned: null };
        const id = cell.closest<HTMLElement>('[role="row"]')?.dataset.rowId;
        if (id === undefined) return null;
        const pinned = id.startsWith('pin-top:') ? 'top' : id.startsWith('pin-bottom:') ? 'bottom' : null;
        return { rowId: this.#baseRowId(id), column, pinned };
      },
      columns: () => {
        const grouped = this.#groupBy();
        const order = displayOrder(this.#leaves, this.#columnState.order).filter((id) => !isGeneratedColumn(id));
        return order.flatMap((id): DataGridAccessoryColumn[] => {
          const def = this.#leafDef(id);
          if (!def) return [];
          const placed = this.#layout.visible.find((c) => c.leaf.id === id);
          return [{
            id,
            header: def.header,
            hidden: this.#columnState.hidden[id] ?? def.hidden ?? false,
            pinned: placed ? (placed.section === 'center' ? null : placed.section) : (this.#columnState.pinned[id] ?? def.pinned ?? null),
            sortable: def.sortable !== false,
            filterable: def.filter !== undefined && this.#options.advancedFilter !== true,
            groupable: def.groupable === true,
            grouped: grouped.includes(id),
            movable: def.movable !== false && def.lockPosition === undefined,
            hideable: true,
          }];
        });
      },
      row: (rowId) => this.#source.find((item) => item.id === rowId)?.row,
      addHeaderButton: (button) => {
        if (!this.#headerButtons.some((b) => b.key === button.key)) this.#headerButtons.push(button);
      },
      sort: (column, direction) => {
        if (this.#leafDef(column)?.sortable === false) return;
        this.#userSort(direction === null ? this.#sorts.filter((s) => s.column !== column) : [{ column, direction }]);
      },
      group: (column, grouped) => {
        const now = this.#groupBy();
        this.#setGroupBy(grouped ? [...now.filter((id) => id !== column), column] : now.filter((id) => id !== column), true);
      },
      openFilter: (column) => {
        if (this.#leafDef(column)?.filter !== undefined && this.#options.advancedFilter !== true) this.#openFilterPanel(column, null);
      },
      editHeader: (column) => {
        this.#editHeader(column);
      },
      copy: (headers) => this.#copyToClipboard(headers),
      cut: async () => {
        const text = await this.#copyToClipboard(false);
        this.#clearCells('cut');
        return text;
      },
      paste: (text) => {
        this.#pasteText(text);
      },
      pinRow: (rowId, side) => {
        if (side === null || this.#source.some((item) => item.id === rowId)) this.#pin(rowId, side, true);
      },
      canMoveRow: (rowId, direction) => this.#movable() && this.#rowMoveTarget(rowId, direction === 'up' ? 'ArrowUp' : 'ArrowDown') !== null,
      moveRow: (rowId, direction) => {
        if (this.#movable()) this.#keyboardRowMove(rowId, direction === 'up' ? 'ArrowUp' : 'ArrowDown', '', '');
      },
      dropZones: () => (this.#dragOptions() ? [...this.#zones].map((zone) => zone.label) : []),
      sendToZone: (index, rowId) => {
        this.#sendToZone(index, rowId);
      },
      announce: (text) => {
        announce(text, 'polite', this.#doc);
      },
      focusGrid: () => {
        this.#focusTarget()?.focus({ preventScroll: true });
      },
      counts: () => ({
        total: this.#server ? this.#server.rowCount : this.#source.length,
        filtered: this.#filteredCount,
        selected: this.#options.rowSelection ? this.#selectedCount() : 0,
      }),
      rangeValues: () => {
        if (this.#ranges.length === 0) return [];
        const cells = this.#targetRects().flatMap((rect) => this.#cellsOf(rect));
        if (cells.length < 2) return [];
        return cells.map((cell) => this.#engineColumns.get(cell.def.id)?.accessor(cell.row));
      },
      toolbarSlot: (key) => {
        const bar = this.#ensureToolbar();
        let slot = bar.querySelector<HTMLElement>(`:scope > [data-accessory="${CSS.escape(key)}"]`);
        if (!slot) {
          slot = this.#doc.createElement('div');
          slot.className = 'aui-data-grid__toolbar-slot';
          slot.dataset.accessory = key;
          bar.append(slot);
        }
        return slot;
      },
      sideSlot: (position) => {
        let main = this.#main;
        if (!main) {
          // The rows and the side slots share a row (the viewport keeps its place in it).
          main = this.#doc.createElement('div');
          main.className = 'aui-data-grid__main';
          this.host.insertBefore(main, this.#viewport);
          main.append(this.#viewport);
          this.#main = main;
        }
        let slot = main.querySelector<HTMLElement>(`:scope > .aui-data-grid__side--${position}`);
        if (!slot) {
          slot = this.#doc.createElement('div');
          slot.className = `aui-data-grid__side aui-data-grid__side--${position}`;
          if (position === 'start') main.prepend(slot);
          else main.append(slot);
        }
        return slot;
      },
      filterEditor: (column, container) => {
        const def = this.#leafDef(column);
        if (!def?.filter || this.#options.advancedFilter === true) return null;
        const panel = createFilterPanel({
          doc: this.#doc,
          locale: this.#config.locale,
          column: this.#filterUiColumn(def),
          filter: this.#filters[column],
          maxConditions: this.#config.maxFilterConditions,
          delay: this.#config.filterDelay,
          values: () => this.#setValues(def),
          commit: (draft) => {
            this.#commitUserFilter(column, draft);
          },
        });
        // Inline, not a popup: a named group in the container.
        const el = panel.element;
        el.removeAttribute('popover');
        el.setAttribute('role', 'group');
        el.removeAttribute('tabindex');
        el.classList.add('aui-data-grid__filter-panel--inline');
        container.append(el);
        return () => {
          panel.flush();
          panel.destroy();
          el.remove();
        };
      },
      isFiltered: (column) => column in this.#filters,
      cellElement: (rowId, column) => this.#rows.get(rowId)?.cells.get(column) ?? null,
      rowLabel: (rowId) => {
        const row = this.#source.find((item) => item.id === rowId)?.row;
        return row === undefined ? rowId : this.#rowName(row, rowId);
      },
      tooltip: (rowId, column) => {
        const def = this.#leafDef(column);
        const index = this.#index().get(rowId);
        const item = index === undefined ? undefined : this.#items[index];
        const tip = def?.tooltip;
        if (!def || tip === undefined || !item || (item.display !== undefined && item.display.kind !== 'data')) return null;
        const text = tip === true ? this.#itemText(item, def) : typeof tip === 'string' ? tip : tip(this.#engineColumns.get(def.id)?.accessor(item.row), item.row);
        return typeof text === 'string' && text.trim() !== '' ? text : null;
      },
      search: (text, caseSensitive) => {
        const needle = caseSensitive ? text : text.toLocaleLowerCase(this.#config.locale);
        if (needle === '') return [];
        const columns = this.#layout.visible.filter((c) => !isUtilityColumn(c.leaf.id)).map((c) => c.leaf.def);
        const out: { rowId: string; column: string }[] = [];
        for (const item of this.#display) {
          if (item.display?.kind === 'detail' || item.display?.kind === 'loading') continue;
          for (const def of columns) {
            const value = this.#itemText(item, def);
            if ((caseSensitive ? value : value.toLocaleLowerCase(this.#config.locale)).includes(needle)) out.push({ rowId: item.id, column: def.id });
          }
        }
        return out;
      },
      reveal: (rowId, column) => {
        const at = this.#display.findIndex((item) => item.id === rowId);
        if (at < 0) return;
        const size = this.#pageSize;
        if (size !== null && Math.floor(at / size) + 1 !== this.#page) {
          this.#page = Math.floor(at / size) + 1;
          this.#paginate();
          this.#generation++;
        }
        const index = this.#index().get(rowId);
        if (index !== undefined) this.#ensureRowVisible(index);
        const col = this.#layout.visible.find((c) => c.leaf.id === column);
        if (col) this.#ensureColumnVisible(col);
        this.#renderNow();
      },
      decorate: (key, decorator) => {
        if (decorator) this.#decorators.set(key, decorator);
        else this.#decorators.delete(key);
        this.#paintAllDecorations();
      },
      refreshDecorations: () => {
        this.#paintAllDecorations();
      },
      onUpdate: (listener) => {
        this.#updateListeners.add(listener);
        return () => {
          this.#updateListeners.delete(listener);
        };
      },
    };
  }

  /** The drag handle of a row (decorative: the keyboard path is Ctrl+Shift+arrows on the cell). */
  #paintDragHandle(entry: RowEntry<Row>): void {
    const column = this.#dragColumn();
    const display = (entry.item as GridItem<Row>).display;
    const data = display === undefined || display.kind === 'data' || (display.kind === 'group' && display.node.item !== undefined);
    for (const [id, cell] of entry.cells) {
      const handle = cell.querySelector<HTMLElement>(':scope > .aui-data-grid__drag-handle');
      const wanted = id === column && data && !entry.item.id.startsWith('pin-') && !entry.item.id.startsWith('sticky:');
      if (!wanted) {
        handle?.remove();
        continue;
      }
      const allowed = this.#dragOptions()?.canDrag?.(entry.item.row) !== false;
      if (handle) {
        handle.classList.toggle('aui-data-grid__drag-handle--disabled', !allowed);
        continue;
      }
      const h = this.#doc.createElement('span');
      h.className = 'aui-data-grid__drag-handle';
      h.setAttribute('aria-hidden', 'true');
      if (this.#dragOptions()?.nativeData) h.draggable = true;
      h.classList.toggle('aui-data-grid__drag-handle--disabled', !allowed);
      h.append(renderIcon(this.#options.icons?.drag ?? 'grip', { className: 'aui-data-grid__drag-icon', doc: this.#doc }));
      cell.prepend(h);
    }
  }

  /** Apply the accessories' cell decorations to a rendered row (classes, and a text for assistive technology). */
  #paintDecorations(entry: RowEntry<Row>): void {
    const rowId = this.#baseRowId(entry.item.id);
    for (const [column, cell] of entry.cells) {
      const previous = cell.dataset.decor;
      const next: string[] = [];
      const descriptions: string[] = [];
      for (const decorator of this.#decorators.values()) {
        const d = decorator(rowId, column);
        if (!d) continue;
        next.push(d.className);
        if (d.description) descriptions.push(d.description);
      }
      const key = `${next.join(' ')}|${descriptions.join(', ')}`;
      if ((previous ?? '|') === key) continue;
      for (const c of (previous ?? '').split('|')[0]?.split(' ') ?? []) if (c !== '') cell.classList.remove(c);
      for (const c of next) cell.classList.add(c);
      cell.querySelector(':scope > .aui-data-grid__decoration')?.remove();
      if (descriptions.length > 0) {
        const spoken = this.#doc.createElement('span');
        spoken.className = 'aui-data-grid__visually-hidden aui-data-grid__decoration';
        spoken.textContent = `, ${descriptions.join(', ')}`;
        cell.append(spoken);
      }
      if (key === '|') delete cell.dataset.decor;
      else cell.dataset.decor = key;
    }
  }

  #paintAllDecorations(): void {
    for (const entry of this.#rows.values()) this.#paintDecorations(entry);
  }

  /** Tell accessories that rows, filters, sorting, grouping, selection, or ranges changed (once per task). */
  #notifyAccessories(): void {
    if (this.#updateListeners.size === 0 || this.#updateQueued) return;
    this.#updateQueued = true;
    queueMicrotask(() => {
      this.#updateQueued = false;
      if (this.#destroyed) return;
      for (const listener of [...this.#updateListeners]) listener();
    });
  }

  /** A sort set by the user through an accessory (announced and emitted, as a header click). */
  #userSort(sorts: DataGridSort[]): void {
    this.#sorts = sorts;
    this.#sortRows();
    this.#generation++;
    this.#animateNextRender();
    this.#renderHeader();
    this.#renderNow();
    this.#announceSort();
    emit(this.host, 'aui-sort-change', { sort: this.sort } satisfies DataGridSortChangeDetail);
  }

  /** Copy (the ranges, else the selected rows, else the focused cell), optionally with headers. */
  async #copyToClipboard(headers: boolean): Promise<string> {
    const block = this.#copyBlock(headers);
    if (!block) return '';
    const text = toTsv(block.rows);
    const clipboard = (this.#doc.defaultView ?? window).navigator.clipboard as Clipboard | undefined;
    if (clipboard) await clipboard.writeText(text);
    const locale = this.#config.locale;
    announce(getMessage('dataGrid', 'copied', { rows: formatNumber(block.height, {}, locale), columns: formatNumber(block.width, {}, locale) }, locale), 'polite', this.#doc);
    return text;
  }

  /** Edit a header's name in place: Enter or leaving the field renames, Escape cancels. */
  #editHeader(column: string): void {
    const level = this.#leaves.find((l) => l.id === column)?.path.length;
    const cell = level === undefined ? (this.#groupDefs.has(column) ? [...this.#headerCells.values()].find((el) => el.dataset.column === column) : undefined) : this.#headerCells.get(`${String(level)}:${column}`);
    const label = cell?.querySelector<HTMLElement>('.aui-data-grid__header-label');
    if (!cell || !label) return;
    const doc = this.#doc;
    const input = doc.createElement('input');
    input.type = 'text';
    input.className = 'aui-data-grid__header-input';
    input.value = label.textContent;
    input.maxLength = 200;
    input.setAttribute('aria-label', getMessage('dataGrid', 'columnName', {}, this.#config.locale));
    label.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit: boolean): void => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      input.replaceWith(label);
      if (commit && name !== '' && name !== label.textContent) {
        this.setColumnHeader(column, name);
        announce(getMessage('dataGrid', 'columnRenamed', { name }, this.#config.locale), 'polite', this.#doc);
      }
      this.#focus = { rowId: null, column, level: level ?? 0 };
      this.#focusTarget()?.focus({ preventScroll: true });
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(event.key === 'Enter');
      }
    });
    input.addEventListener('blur', () => {
      finish(true);
    });
  }

  /** The pinned display rows: grand totals, static pinned rows, and rows pinned by id that pass the filters. */
  #pinnedSync(): void {
    const rowId = this.#options.rowId;
    const top: GridItem<Row>[] = [];
    const bottom: GridItem<Row>[] = [];
    const seen = new Set<string>();
    const add = (list: GridItem<Row>[], item: GridItem<Row>): void => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      list.push(item);
    };
    const first = this.#sorted[0];
    const total = this.#options.grandTotal;
    const grand = (side: 'top' | 'bottom'): GridItem<Row> | null => (first ? { row: first.row, id: `pin-${side}:total:grand`, index: -1, display: { kind: 'total', node: null, id: `pin-${side}:total:grand` } } : null);
    const grandTop = total === 'pinnedTop' ? grand('top') : null;
    if (grandTop) add(top, grandTop);
    for (const row of this.#options.pinnedTopRows ?? []) add(top, { row, id: `pin-top:${rowId(row)}`, index: -1 });
    // Built only when rows are pinned by id (a million-row map on every paging pass is not free).
    const passing = this.#userPins.size > 0 ? new Map(this.#sorted.map((item) => [item.id, item])) : new Map<string, Item<Row>>();
    for (const [id, side] of this.#userPins) {
      const item = passing.get(id);
      if (item) add(side === 'top' ? top : bottom, { row: item.row, id: `pin-${side}:${id}`, index: -1 });
    }
    for (const row of this.#options.pinnedBottomRows ?? []) add(bottom, { row, id: `pin-bottom:${rowId(row)}`, index: -1 });
    const grandBottom = total === 'pinnedBottom' ? grand('bottom') : null;
    if (grandBottom) add(bottom, grandBottom);
    this.#pinnedRows = { top, bottom };
    this.#pinnedById = new Map([...top, ...bottom].map((item) => [item.id, item]));
  }

  /** The row id behind a display row id (pinned copies carry a `pin-top:` or `pin-bottom:` prefix). */
  #baseRowId(id: string): string {
    return id.startsWith('pin-top:') ? id.slice(8) : id.startsWith('pin-bottom:') ? id.slice(11) : id;
  }

  /** Pin a row to the top or bottom (null unpins); by the user: announced and emitted. */
  #pin(rowId: string, side: 'top' | 'bottom' | null, user: boolean): void {
    if (side === null) this.#userPins.delete(rowId);
    else {
      // Pinning again moves the row to the end of its section.
      this.#userPins.delete(rowId);
      this.#userPins.set(rowId, side);
    }
    this.#pinnedSync();
    this.#generation++;
    this.#renderNow();
    if (!user) return;
    const locale = this.#config.locale;
    announce(side === null ? getMessage('dataGrid', 'rowUnpinned', {}, locale) : getMessage('dataGrid', 'rowPinned', { side: side === 'top' ? 'top' : 'bottom' }, locale), 'polite', this.#doc);
    emit(this.host, 'aui-row-pin', { rowId, pinned: side } satisfies DataGridRowPinDetail);
  }

  /** Pin a row by id to the top or bottom, or unpin it (null). Returns false for unknown ids. Emits nothing. */
  pinRow(rowId: string, side: 'top' | 'bottom' | null): boolean {
    const s: unknown = side;
    if (!(s === null || s === 'top' || s === 'bottom')) fail('pinRow', '"top" | "bottom" | null');
    if (side !== null && !this.#source.some((item) => item.id === rowId)) return false;
    this.#pin(rowId, side, false);
    return true;
  }

  /** Ids of the rows pinned by id, by section, in pin order. */
  getPinnedRows(): { top: string[]; bottom: string[] } {
    const all = [...this.#userPins];
    return { top: all.filter(([, s]) => s === 'top').map(([id]) => id), bottom: all.filter(([, s]) => s === 'bottom').map(([id]) => id) };
  }

  /** Render the pinned sections (their rows stack; the sections stay under the header and at the bottom edge). */
  #renderPinned(keep: Set<string>, width: number): void {
    // Nothing pinned: no work (and no layout reads) per frame.
    if (this.#pinnedRows.top.length === 0 && this.#pinnedRows.bottom.length === 0) {
      this.#pinTop.hidden = true;
      this.#pinBottom.hidden = true;
      return;
    }
    const layout = this.#layout;
    const x = this.#scrollX();
    const win = centerWindow(layout.center, x, x + Math.max(0, this.#viewportWidth - layout.startWidth - layout.endWidth));
    const height = this.#rowHeightFn();
    const locale = this.#config.locale;
    for (const side of ['top', 'bottom'] as const) {
      const box = side === 'top' ? this.#pinTop : this.#pinBottom;
      const list = this.#pinnedRows[side];
      box.hidden = list.length === 0;
      box.setAttribute('aria-label', getMessage('dataGrid', side === 'top' ? 'pinnedTop' : 'pinnedBottom', {}, locale));
      let y = 0;
      list.forEach((item, i) => {
        keep.add(item.id);
        let entry = this.#rows.get(item.id);
        if (!entry) {
          entry = this.#createRow(item, -1);
          this.#rows.set(item.id, entry);
        }
        if (entry.el.parentElement !== box) box.append(entry.el);
        this.#updateRow(entry, item, i, y, width, win.first, win.last);
        const h = this.#rowHeightOverrides.get(this.#baseRowId(item.id)) ?? height(item);
        entry.el.style.setProperty('block-size', `${String(h)}px`);
        entry.el.classList.add('aui-data-grid__row--pinned');
        const before = side === 'top' ? 0 : this.#pinnedRows.top.length + Math.max(this.#items.length, 0);
        entry.el.setAttribute('aria-rowindex', String(this.#headLevels() + before + i + 1));
        const number = entry.cells.get(ROW_NUMBER_COLUMN)?.querySelector('.aui-data-grid__row-number');
        if (number) number.textContent = '';
        y += h;
      });
      box.style.setProperty('block-size', `${String(y)}px`);
      box.style.setProperty('inline-size', `${String(width)}px`);
      if (side === 'top') box.style.setProperty('inset-block-start', `${String(this.#head.offsetHeight)}px`);
    }
  }

  /** Keyboard order of rows: pinned top, the body, pinned bottom. */
  #navPosition(rowId: string): number {
    const { top, bottom } = this.#pinnedRows;
    const t = top.findIndex((item) => item.id === rowId);
    if (t >= 0) return t;
    const body = this.#index().get(rowId);
    if (body !== undefined) return top.length + body;
    const b = bottom.findIndex((item) => item.id === rowId);
    return b >= 0 ? top.length + this.#items.length + b : 0;
  }

  #navItem(position: number): GridItem<Row> | undefined {
    const { top, bottom } = this.#pinnedRows;
    if (position < top.length) return top[position];
    const body = position - top.length;
    return body < this.#items.length ? this.#itemAt(body) : bottom[body - this.#items.length];
  }

  /** Group rows span the whole row (`groupDisplay: 'rows'`; not for tree data and pivot mode, which need the group column). */
  #groupRowsMode(): boolean {
    return this.#options.groupDisplay === 'rows' && !this.#options.treeData && !this.#options.pivot;
  }

  /** The single column of a row drawn as one cell (detail rows, full-width rows, full-width group rows), or null. */
  #singleCellColumn(item: GridItem<Row> | undefined): string | null {
    if (!item) return null;
    const d = item.display;
    if (d?.kind === 'detail') return DETAIL_COLUMN;
    if (d?.kind === 'group' && !d.node.item && this.#groupRowsMode()) return FULL_WIDTH_COLUMN;
    const full = this.#options.fullWidthRow;
    if (full && (d === undefined || d.kind === 'data') && full.isFullWidth(item.row)) return FULL_WIDTH_COLUMN;
    return null;
  }

  /** A row drawn as one cell spanning every column: a full-width row's content, or a group row's toggle and label. */
  #updateFullRow(entry: RowEntry<Row>, item: GridItem<Row>, index: number, y: number, width: number): void {
    const el = entry.el;
    const rebuild = entry.generation !== this.#generation || entry.item !== item || el.childElementCount !== 1;
    entry.item = item;
    entry.index = index;
    entry.generation = this.#generation;
    el.classList.add('aui-data-grid__row--full');
    el.setAttribute('aria-rowindex', String(this.#headLevels() + this.#pinnedRows.top.length + index + 1));
    this.#paintGroupRow(el, item);
    el.classList.toggle('aui-data-grid__row--odd', index % 2 === 1);
    el.style.setProperty('inset-block-start', `${String(y)}px`);
    el.style.setProperty('inline-size', `${String(width)}px`);
    el.style.setProperty('block-size', `${String(this.#heights.height(index))}px`);
    let cell = entry.cells.get(FULL_WIDTH_COLUMN);
    if (!cell) {
      cell = this.#doc.createElement('div');
      cell.className = 'aui-data-grid__cell aui-data-grid__full-cell';
      cell.setAttribute('role', 'gridcell');
      cell.dataset.column = FULL_WIDTH_COLUMN;
      cell.setAttribute('aria-colindex', '1');
      cell.tabIndex = -1;
      entry.cells.set(FULL_WIDTH_COLUMN, cell);
    }
    cell.setAttribute('aria-colspan', String(Math.max(1, this.#layout.visible.length)));
    cell.style.setProperty('inline-size', `${String(Math.min(width, this.#viewportWidth || width))}px`);
    if (rebuild) {
      for (const [id, other] of [...entry.cells]) {
        if (id === FULL_WIDTH_COLUMN) continue;
        other.remove();
        this.#releaseCell(entry, id);
        entry.cells.delete(id);
      }
      this.#releaseCell(entry, FULL_WIDTH_COLUMN);
      const group = item.display?.kind === 'group';
      let content: Node;
      if (group) content = this.#groupCell(item.id, null);
      else {
        const node: unknown = this.#options.fullWidthRow?.render(item.row, { doc: this.#doc, rowId: item.id });
        if (!(node instanceof Node)) fail('fullWidthRow.render', 'function returning a Node');
        content = node;
        entry.nodes.set(FULL_WIDTH_COLUMN, node);
      }
      cell.replaceChildren(content);
      el.replaceChildren(cell);
    }
    this.#paintSelection(el, item.id);
  }

  /**
   * Sticky group rows: the group rows of the topmost visible row whose own rows have scrolled
   * under the header stay there (copies, hidden from assistive technology: the real rows are
   * in the grid; toggles still work).
   */
  #renderSticky(keep: Set<string>, width: number): void {
    const box = this.#stickyBox;
    const list: GridItem<Row>[] = [];
    if (this.#grouped() && this.#options.stickyGroupRows !== false && this.#items.length > 0) {
      const top = this.#scrollGeometry().contentTop(this.#viewport.scrollTop);
      const first = this.#items[this.#heights.indexAt(top)];
      const d = first?.display;
      let node: GroupNode<Row> | null = d?.kind === 'data' ? d.parent : d?.kind === 'group' ? (d.expanded ? d.node : d.node.parent) : d?.kind === 'total' ? d.node : null;
      const chain: GridItem<Row>[] = [];
      for (; node; node = node.parent) {
        const at = this.#index().get(node.id);
        const row = at === undefined ? undefined : this.#items[at];
        if (at !== undefined && row && this.#heights.offset(at) < top) chain.unshift(row);
      }
      list.push(...chain);
    }
    box.hidden = list.length === 0;
    this.#stickyHeight = 0;
    // Nothing sticky: no work (and no layout reads) per frame.
    if (list.length === 0) return;
    let y = 0;
    const layout = this.#layout;
    const x = this.#scrollX();
    const win = centerWindow(layout.center, x, x + Math.max(0, this.#viewportWidth - layout.startWidth - layout.endWidth));
    for (const real of list) {
      const item: GridItem<Row> = { ...real, id: `sticky:${real.id}` };
      keep.add(item.id);
      let entry = this.#rows.get(item.id);
      if (!entry) {
        entry = this.#createRow(item, -1);
        this.#rows.set(item.id, entry);
      }
      if (entry.el.parentElement !== box) box.append(entry.el);
      const index = this.#index().get(real.id) ?? 0;
      if (this.#singleCellColumn(real)) this.#updateFullRow(entry, item, index, y, width);
      else this.#updateRow(entry, item, index, y, width, win.first, win.last);
      entry.el.classList.add('aui-data-grid__row--sticky');
      for (const cell of entry.cells.values()) cell.removeAttribute('tabindex');
      y += this.#heights.height(index);
    }
    this.#stickyHeight = y;
    box.style.setProperty('inline-size', `${String(width)}px`);
    box.style.setProperty('inset-block-start', `${String(this.#head.offsetHeight + this.#pinTop.offsetHeight)}px`);
  }

  /** Whether two display rows merge in a row-spanning column (data rows only; blank values never merge). */
  #sameSpan(def: DataGridColumn<Row>, a: GridItem<Row> | undefined, b: GridItem<Row> | undefined): boolean {
    const data = (x: GridItem<Row> | undefined): x is GridItem<Row> => x !== undefined && (x.display === undefined || x.display.kind === 'data') && !this.#singleCellColumn(x);
    if (!data(a) || !data(b)) return false;
    if (typeof def.spanRows === 'function') return def.spanRows(a.row, b.row);
    const accessor = this.#engineColumns.get(def.id)?.accessor;
    const ta = this.#cellText(def, accessor?.(a.row), a.row);
    return ta !== '' && ta === this.#cellText(def, accessor?.(b.row), b.row);
  }

  /** The rows a row-spanning cell covers (start and end page indexes, at most MAX_ROW_SPAN). */
  #rowSpan(index: number, def: DataGridColumn<Row>): { start: number; end: number } {
    const key = `${def.id}:${String(index)}`;
    const cached = this.#spanCache.get(key);
    if (cached) return cached;
    const items = this.#items;
    let start = index;
    while (start > 0 && index - start < MAX_ROW_SPAN && this.#sameSpan(def, items[start - 1], items[start])) start--;
    let end = start;
    while (end + 1 < items.length && end - start + 1 < MAX_ROW_SPAN && this.#sameSpan(def, items[end], items[end + 1])) end++;
    const span = { start, end };
    for (let i = start; i <= end; i++) this.#spanCache.set(`${def.id}:${String(i)}`, span);
    return span;
  }

  /** Column spans of a row: owner column to its width and count, and covered column to its owner. */
  #colSpans(item: GridItem<Row> | undefined): ColSpans {
    const owners = new Map<string, { width: number; count: number }>();
    const covered = new Map<string, string>();
    if (!item || (item.display !== undefined && item.display.kind !== 'data')) return { owners, covered };
    const layout = this.#layout;
    for (const list of [layout.start, layout.center, layout.end]) {
      for (let i = 0; i < list.length; i++) {
        const col = list[i];
        const def = col?.leaf.def;
        if (!col || !def?.colSpan || def.spanRows || covered.has(col.leaf.id)) continue;
        const asked: unknown = def.colSpan(item.row);
        const count = typeof asked === 'number' && Number.isFinite(asked) ? Math.min(list.length - i, Math.max(1, Math.floor(asked))) : 1;
        if (count < 2) continue;
        let width = 0;
        for (let j = i; j < i + count; j++) {
          const c = list[j];
          if (!c) continue;
          width += c.width;
          if (j > i) covered.set(c.leaf.id, col.leaf.id);
        }
        owners.set(col.leaf.id, { width, count });
      }
    }
    return { owners, covered };
  }

  /** The cell that shows a position: itself, or the start of the row span or column span covering it. */
  #spanOwner(rowId: string, column: string): { rowId: string; column: string } {
    const index = this.#index().get(rowId);
    const def = this.#leafDef(column);
    if (index === undefined || !def) return { rowId, column };
    if (def.spanRows) {
      const { start } = this.#rowSpan(index, def);
      const owner = this.#items[start];
      if (start !== index && owner) return { rowId: owner.id, column };
    }
    const owner = this.#colSpans(this.#items[index]).covered.get(column);
    return owner === undefined ? { rowId, column } : { rowId, column: owner };
  }

  /** A cell with its spans applied (null when another cell covers it). */
  #spanCell(entry: RowEntry<Row>, col: PlacedColumn<Row>, index: number, spans: ColSpans | null): HTMLDivElement | null {
    const def = col.leaf.def;
    if (spans?.covered.has(col.leaf.id)) return null;
    let rows: { start: number; end: number } | null = null;
    if (def.spanRows && index >= 0 && entry.item === this.#items[index]) {
      rows = this.#rowSpan(index, def);
      if (rows.start !== index) return null;
    }
    const cell = this.#cell(entry, col);
    const across = spans?.owners.get(col.leaf.id);
    if (across) {
      cell.style.setProperty('inline-size', `${String(across.width)}px`);
      cell.setAttribute('aria-colspan', String(across.count));
      cell.dataset.span = 'cols';
    }
    if (rows && rows.end > rows.start) {
      const height = this.#heights.offset(rows.end) + this.#heights.height(rows.end) - this.#heights.offset(rows.start);
      cell.style.setProperty('block-size', `${String(height)}px`);
      cell.setAttribute('aria-rowspan', String(rows.end - rows.start + 1));
      cell.classList.add('aui-data-grid__cell--span-rows');
      cell.dataset.span = across ? 'both' : 'rows';
    }
    if (!across && !(rows && rows.end > rows.start) && cell.dataset.span !== undefined) {
      // The span ended: back to one cell.
      delete cell.dataset.span;
      cell.removeAttribute('aria-colspan');
      cell.removeAttribute('aria-rowspan');
      cell.style.removeProperty('block-size');
      cell.style.setProperty('inline-size', `${String(col.width)}px`);
      cell.classList.remove('aui-data-grid__cell--span-rows');
    }
    return cell;
  }

  /** The generated row number column: display positions, filled in place by #paintRowNumber. */
  #rowNumberColumn(): DataGridColumn<Row> {
    const o = this.#options.rowNumbers;
    const width = typeof o === 'object' && o.width !== undefined ? o.width : 56;
    return {
      id: ROW_NUMBER_COLUMN,
      header: getMessage('dataGrid', 'rowNumberColumn', {}, this.#config.locale),
      width,
      minWidth: width,
      maxWidth: width,
      resizable: false,
      movable: false,
      sortable: false,
      searchable: false,
      pinned: 'start',
      lockPinned: true,
      lockPosition: 'start',
      align: 'end',
      render: () => {
        const span = this.#doc.createElement('span');
        span.className = 'aui-data-grid__row-number';
        return span;
      },
    };
  }

  #rowResizable(): boolean {
    const o = this.#options.rowNumbers;
    return typeof o === 'object' && o.resizable === true && this.#options.autoRowHeight !== true;
  }

  /** The number (display position) of a row, and its resize handle. */
  #paintRowNumber(entry: RowEntry<Row>, index: number): void {
    const cell = entry.cells.get(ROW_NUMBER_COLUMN);
    if (!cell) return;
    let label = cell.querySelector<HTMLElement>('.aui-data-grid__row-number');
    if (!label) {
      label = this.#doc.createElement('span');
      label.className = 'aui-data-grid__row-number';
      cell.replaceChildren(label);
    }
    const text = String(this.#pageOffset + index + 1);
    if (label.textContent !== text) label.textContent = text;
    const resizable = this.#rowResizable() && (entry.item as GridItem<Row>).display?.kind !== 'loading';
    const handle = cell.querySelector('.aui-data-grid__row-resizer');
    if (resizable && !handle) {
      const h = this.#doc.createElement('span');
      h.className = 'aui-data-grid__row-resizer';
      h.setAttribute('aria-hidden', 'true');
      cell.append(h);
    } else if (!resizable) handle?.remove();
  }

  /** Set (or with null, reset) a row's height; by the user: announced and emitted. */
  #resizeRow(rowId: string, height: number | null, user: boolean): void {
    const clamped = height === null ? null : Math.round(Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, height)));
    if (clamped === null) this.#rowHeightOverrides.delete(rowId);
    else this.#rowHeightOverrides.set(rowId, clamped);
    this.#paginate();
    this.#renderNow();
    if (!user) return;
    const locale = this.#config.locale;
    if (clamped !== null) announce(getMessage('dataGrid', 'rowResized', { height: formatNumber(clamped, {}, locale) }, locale), 'polite', this.#doc);
    emit(this.host, 'aui-row-resize', { rowId, height: clamped } satisfies DataGridRowResizeDetail);
  }

  /** Set a row's height in px (16 to 2000), or null for its default height. Emits nothing. */
  setRowHeight(rowId: string, height: number | null): void {
    if (typeof rowId !== 'string' || !(height === null || (typeof height === 'number' && height >= MIN_ROW_HEIGHT && height <= MAX_ROW_HEIGHT))) fail('rowHeight', 'row id and 16 to 2000 px, or null');
    this.#resizeRow(rowId, height, false);
  }

  /** Cell ranges: a click on a row number selects the row's cells. */
  #selectRowCells(rowId: string): void {
    const visible = this.#layout.visible;
    const { first, last } = this.#rangeColumns();
    const a = visible[first];
    const b = visible[last];
    if (!a || !b) return;
    this.#rangeEnd = { rowId, column: b.leaf.id };
    this.#setRanges([{ startRow: rowId, endRow: rowId, startColumn: a.leaf.id, endColumn: b.leaf.id }], true);
    this.#announceRange();
  }

  /** The generated detail toggle column: a decorative chevron on master rows (the row's aria-expanded carries the state). */
  #detailColumn(): DataGridColumn<Row> {
    return {
      id: DETAIL_COLUMN,
      header: getMessage('dataGrid', 'detailColumn', {}, this.#config.locale),
      width: 44,
      minWidth: 44,
      maxWidth: 44,
      resizable: false,
      movable: false,
      sortable: false,
      searchable: false,
      pinned: 'start',
      lockPinned: true,
      lockPosition: 'start',
      align: 'center',
      render: (_row, context) => this.#detailToggle(context.rowId),
    };
  }

  #detailToggle(rowId: string): HTMLElement {
    const doc = this.#doc;
    const span = doc.createElement('span');
    const index = this.#index().get(rowId);
    const item = index === undefined ? undefined : this.#items[index];
    if (!item || !this.#isMaster(item)) return span;
    span.className = 'aui-data-grid__detail-toggle';
    span.setAttribute('aria-hidden', 'true');
    span.append(renderIcon(this.#detailExpanded(rowId) ? (this.#options.icons?.collapse ?? 'chevron-down') : (this.#options.icons?.expand ?? 'chevron-right'), { className: 'aui-data-grid__group-icon', doc }));
    return span;
  }

  /** A data row with details (not group, total, or detail rows; not tree parents). */
  #isMaster(item: GridItem<Row>): boolean {
    const detail = this.#options.detail;
    if (!detail || (item.display !== undefined && item.display.kind !== 'data')) return false;
    return detail.isMaster ? detail.isMaster(item.row) : true;
  }

  #detailExpanded(rowId: string): boolean {
    return this.#detailOpen.get(rowId) ?? this.#options.detail?.expandedByDefault === true;
  }

  /** The display items with a detail row after each expanded master row. */
  #withDetails(items: readonly GridItem<Row>[]): readonly GridItem<Row>[] {
    if (!this.#options.detail) return items;
    const out: GridItem<Row>[] = [];
    for (const item of items) {
      out.push(item);
      if (!this.#isMaster(item) || !this.#detailExpanded(item.id)) continue;
      const level = (item.display?.kind === 'data' ? item.display.level : 0) + 1;
      out.push({ row: item.row, id: `detail:${item.id}`, index: -1, display: { kind: 'detail', master: item, level } });
    }
    return out;
  }

  /** The kept content of a master row's details (rendered on first use, again when the row object changed). */
  #detailContent(master: Item<Row>): HTMLDivElement {
    const cached = this.#detailCache.get(master.id);
    if (cached) {
      if (cached.row === master.row) {
        // Most recently used last.
        this.#detailCache.delete(master.id);
        this.#detailCache.set(master.id, cached);
        return cached.wrapper;
      }
      this.#releaseDetail(master.id);
    }
    const wrapper = this.#doc.createElement('div');
    wrapper.className = 'aui-data-grid__detail-content';
    const node: unknown = this.#options.detail?.render(master.row, { doc: this.#doc, rowId: master.id });
    if (!(node instanceof Node)) fail('detail.render', 'function returning a Node');
    wrapper.append(node);
    this.#detailCache.set(master.id, { wrapper, node, row: master.row });
    return wrapper;
  }

  #releaseDetail(id: string): void {
    const cached = this.#detailCache.get(id);
    if (!cached) return;
    this.#detailCache.delete(id);
    cached.wrapper.remove();
    this.#options.detail?.destroy?.(cached.node, cached.row);
  }

  /** Release the content of removed rows, and of collapsed details beyond `keep` (oldest first). */
  #trimDetails(): void {
    if (this.#detailCache.size === 0) return;
    const known = new Set(this.#source.map((item) => item.id));
    const keep = this.#options.detail ? (this.#options.detail.keep ?? 10) : 0;
    const collapsed = [...this.#detailCache.keys()].filter((id) => known.has(id) && !this.#detailExpanded(id));
    for (const id of [...this.#detailCache.keys()]) if (!known.has(id) || !this.#options.detail) this.#releaseDetail(id);
    for (const id of collapsed.slice(0, Math.max(0, collapsed.length - keep))) this.#releaseDetail(id);
  }

  /** Expand or collapse a master row's details (by the user: announced and emitted). */
  #toggleDetail(rowId: string, expanded: boolean, user: boolean): void {
    this.#detailOpen.set(rowId, expanded);
    const inDetail = this.#focus?.rowId === `detail:${rowId}`;
    this.#paginate();
    this.#trimDetails();
    this.#generation++;
    if (inDetail && !expanded) this.#focus = { rowId, column: DETAIL_COLUMN, level: 0 };
    this.#renderNow();
    if (!user) return;
    this.#focusTarget()?.focus({ preventScroll: true });
    const index = this.#index().get(rowId);
    const item = index === undefined ? undefined : this.#items[index];
    const row = item ? this.#rowName(item.row, rowId) : rowId;
    const locale = this.#config.locale;
    announce(getMessage('dataGrid', expanded ? 'detailExpanded' : 'detailCollapsed', { row }, locale), 'polite', this.#doc);
    emit(this.host, 'aui-detail-toggle', { rowId, expanded } satisfies DataGridDetailToggleDetail);
  }

  /** The detail content of this grid an event target is inside (not a nested grid's own details), or null. */
  #detailContentOf(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element) || this.#detailCache.size === 0) return null;
    for (let c = target.closest<HTMLElement>('.aui-data-grid__detail-content'); c; c = c.parentElement?.closest<HTMLElement>('.aui-data-grid__detail-content') ?? null) {
      if (c.parentElement?.closest('.aui-data-grid__body') === this.#body) return c;
    }
    return null;
  }

  /** A group row's checkbox: tri-state over the group's selectable rows (the rows that pass the filters). */
  #groupSelectBox(node: GroupNode<Row>): HTMLInputElement {
    const box = this.#doc.createElement('input');
    box.type = 'checkbox';
    box.className = 'aui-data-grid__select-input aui-data-grid__select-group';
    box.tabIndex = -1;
    box.setAttribute('aria-label', getMessage('dataGrid', 'selectGroup', { group: this.#groupKeyText(node) }, this.#config.locale));
    this.#paintGroupBox(box, node);
    return box;
  }

  #paintGroupBox(box: HTMLInputElement, node: GroupNode<Row>): void {
    const rows = node.leaves.filter((item) => this.#isSelectable(item.row));
    const on = rows.filter((item) => this.#isRowSelected(item.id)).length;
    box.checked = on > 0 && on === rows.length;
    box.indeterminate = on > 0 && on < rows.length;
    box.disabled = rows.length === 0 || this.#options.rowSelection?.mode !== 'multiple';
  }

  /** Select or clear every selectable row of a group (the header checkbox scope rules do not apply: it is the group's rows). */
  #toggleGroupSelection(node: GroupNode<Row>): void {
    if (this.#options.rowSelection?.mode !== 'multiple') return;
    const before = this.#selectedIds();
    const rows = node.leaves.filter((item) => this.#isSelectable(item.row));
    const select = !rows.every((item) => this.#isRowSelected(item.id));
    for (const item of rows) {
      this.#setRowSelected(item.id, select);
    }
    this.#afterUserSelection(before, 'user');
  }

  #selectBox(row: Row, rowId: string): HTMLInputElement {
    const box = this.#doc.createElement('input');
    box.type = 'checkbox';
    box.className = 'aui-data-grid__select-input';
    // A widget inside the cell: Enter or F2 reaches it, Tab does not stop on it.
    box.tabIndex = -1;
    box.checked = this.#isRowSelected(this.#baseRowId(rowId));
    box.disabled = !this.#isSelectable(row);
    box.setAttribute('aria-label', this.#rowLabel(row, rowId));
    return box;
  }

  /** "Select {first column text}", or the row's position when that text is empty. */
  #rowLabel(row: Row, rowId: string): string {
    const locale = this.#config.locale;
    const first = this.#layout.visible.find((c) => !isGeneratedColumn(c.leaf.id))?.leaf.def;
    const text = first ? this.#cellText(first, this.#engineColumns.get(first.id)?.accessor(row), row).trim() : '';
    if (text !== '') return getMessage('dataGrid', 'selectRow', { row: text }, locale);
    const index = this.#index().get(rowId) ?? 0;
    return getMessage('dataGrid', 'selectRowFallback', { index: index + 1 }, locale);
  }

  #selectHeader(el: HTMLDivElement, col: PlacedColumn<Row>, section: Section, level: number, rowSpan: number): HTMLDivElement {
    const doc = this.#doc;
    el.className = 'aui-data-grid__header-cell aui-data-grid__select-header aui-data-grid__cell--center';
    el.dataset.column = col.leaf.id;
    el.dataset.level = String(level);
    el.setAttribute('aria-colindex', String(col.colIndex));
    if (rowSpan > 1) {
      el.setAttribute('aria-rowspan', String(rowSpan));
      el.style.setProperty('--aui-data-grid-span', String(rowSpan));
      el.classList.add('aui-data-grid__header-cell--span');
    }
    const name = doc.createElement('span');
    name.className = 'aui-data-grid__visually-hidden';
    name.id = createId('aui-data-grid-select');
    name.textContent = col.leaf.def.header;
    el.append(name);
    el.setAttribute('aria-labelledby', name.id);
    const selection = this.#options.rowSelection;
    if (col.leaf.id === SELECT_COLUMN && selection?.mode === 'multiple' && selection.headerCheckbox !== false) {
      const all = doc.createElement('input');
      all.type = 'checkbox';
      all.className = 'aui-data-grid__select-all';
      all.tabIndex = -1;
      all.setAttribute('aria-label', getMessage('dataGrid', 'selectAllRows', {}, this.#config.locale));
      el.append(all);
    }
    const layout = this.#layout;
    this.#placeCell(el, col.width, section, col.x, layout[`${section}Width`]);
    this.#headerCells.set(`${String(level)}:${col.leaf.id}`, el);
    this.#syncSelectAll(el);
    return el;
  }

  #isSelectable(row: Row): boolean {
    const test = this.#options.rowSelection?.selectable;
    return !test || test(row);
  }

  /** Known, selectable ids (the first one only in single mode; none when selection is off). */
  #validSelection(ids: readonly string[]): Set<string> {
    const selection = this.#options.rowSelection;
    if (!selection) return new Set();
    const rows = new Map(this.#source.map((item) => [item.id, item.row]));
    const valid = ids.filter((id) => {
      const row = rows.get(id);
      // With a datasource, rows that are not loaded keep their selection.
      return row === undefined ? this.#server !== null : this.#isSelectable(row);
    });
    return new Set(selection.mode === 'single' ? valid.slice(0, 1) : valid);
  }

  /** Rows a Select all affects. */
  #scope(scope?: DataGridSelectAllScope): readonly Item<Row>[] {
    switch (scope ?? this.#options.rowSelection?.selectAll ?? 'filtered') {
      case 'all':
        return this.#source;
      case 'page':
        return this.#items.filter((item) => item.display === undefined || item.display.kind === 'data' || (item.display.kind === 'group' && item.display.node.item !== undefined));
      case 'filtered':
        return this.#sorted;
    }
  }

  /** Whether a row is selected (server rows: Select all inverts the listed ids). */
  #isRowSelected(id: string): boolean {
    return this.#serverSelectAll && this.#server ? !this.#selected.has(id) : this.#selected.has(id);
  }

  #setRowSelected(id: string, on: boolean): void {
    if (on !== (this.#serverSelectAll && this.#server !== null)) this.#selected.add(id);
    else this.#selected.delete(id);
  }

  /** Ids of selected rows the grid holds (all of them for client rows; loaded ones for server rows). */
  #selectedIds(): Set<string> {
    return this.#server ? new Set(this.getSelected()) : new Set(this.#selected);
  }

  /** Selected rows in total (server rows with Select all: the count less the exceptions). */
  #selectedCount(): number {
    return this.#server && this.#serverSelectAll ? Math.max(0, this.#server.rowCount - this.#selected.size) : this.#selected.size;
  }

  #allSelected(): boolean {
    if (this.#server) return this.#serverSelectAll && this.#selected.size === 0;
    const rows = this.#scope().filter((item) => this.#isSelectable(item.row));
    return rows.length > 0 && rows.every((item) => this.#isRowSelected(item.id));
  }

  /** Drop ids whose rows are gone (or that became unselectable); `notify` emits the change. */
  #pruneSelection(notify: boolean): void {
    if (this.#selected.size === 0) return;
    const next = this.#validSelection([...this.#selected]);
    if (next.size === this.#selected.size) return;
    const removed = [...this.#selected].filter((id) => !next.has(id));
    this.#selected = next;
    this.#syncSelection();
    if (notify) emit(this.host, 'aui-selection-change', { selected: this.getSelected(), added: [], removed, reason: 'rows' } satisfies DataGridSelectionChangeDetail);
  }

  /** A selection change by the user: `toggle` one row, select `only` it, or select the `range` from the anchor. */
  #userSelect(rowId: string, how: 'toggle' | 'only' | 'range'): void {
    const selection = this.#options.rowSelection;
    if (!selection) return;
    const item = this.#source.find((x) => x.id === rowId);
    if (!item || !this.#isSelectable(item.row)) {
      this.#syncSelection();
      return;
    }
    const before = this.#selectedIds();
    const anchor = this.#anchor;
    if (how === 'range' && selection.mode === 'multiple' && anchor !== null && anchor !== rowId) {
      const order = this.#sorted;
      const a = order.findIndex((x) => x.id === anchor);
      const b = order.findIndex((x) => x.id === rowId);
      if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
        const x = order[i];
        if (x && this.#isSelectable(x.row)) this.#setRowSelected(x.id, true);
      }
    } else if (how === 'only' || selection.mode === 'single') {
      const was = this.#selected.has(rowId);
      this.#selected.clear();
      // A click on the only selected row in single mode with toggle semantics clears it.
      if (!(was && how === 'toggle' && before.size === 1)) this.#selected.add(rowId);
      this.#anchor = rowId;
    } else {
      if (this.#selected.has(rowId)) this.#selected.delete(rowId);
      else this.#selected.add(rowId);
      this.#anchor = rowId;
    }
    this.#afterUserSelection(before, 'user');
  }

  #toggleAll(select: boolean): void {
    if (this.#options.rowSelection?.mode !== 'multiple') return;
    const before = this.#selectedIds();
    if (this.#server) {
      // Server rows: Select all covers every row, loaded or not.
      this.#serverSelectAll = select;
      this.#selected.clear();
      this.#afterUserSelection(before, 'select-all');
      return;
    }
    for (const item of this.#scope()) {
      if (!this.#isSelectable(item.row)) continue;
      this.#setRowSelected(item.id, select);
    }
    this.#afterUserSelection(before, 'select-all');
  }

  #afterUserSelection(before: ReadonlySet<string>, reason: DataGridSelectionChangeDetail['reason']): void {
    this.#syncSelection();
    const after = this.#selectedIds();
    const added = [...after].filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));
    if (added.length === 0 && removed.length === 0 && !(reason === 'select-all' && this.#server)) return;
    const n = this.#selectedCount();
    const locale = this.#config.locale;
    announce(n === 0 ? getMessage('dataGrid', 'noRowsSelected', {}, locale) : n === 1 ? getMessage('dataGrid', 'rowSelected', {}, locale) : getMessage('dataGrid', 'rowsSelected', { count: formatNumber(n, {}, locale) }, locale), 'polite', this.#doc);
    emit(this.host, 'aui-selection-change', { selected: this.getSelected(), added, removed, reason } satisfies DataGridSelectionChangeDetail);
  }

  /** Reflect the selection in rendered rows, their checkboxes, and the header checkbox (in place). */
  #syncSelection(): void {
    this.#notifyAccessories();
    for (const entry of this.#rows.values()) this.#paintSelection(entry.el, entry.item.id);
    const header = this.#headerCells.get(`0:${SELECT_COLUMN}`);
    if (header) this.#syncSelectAll(header);
  }

  #paintSelection(el: HTMLElement, rowId: string): void {
    if (!this.#options.rowSelection) {
      el.removeAttribute('aria-selected');
      el.classList.remove('aui-data-grid__row--selected');
      return;
    }
    const display = this.#displayOf(rowId);
    if (display && display.kind !== 'data' && !(display.kind === 'group' && display.node.item)) {
      // Group and total rows are not selectable themselves; a group's checkbox reflects its rows.
      el.removeAttribute('aria-selected');
      el.classList.remove('aui-data-grid__row--selected');
      const groupBox = el.querySelector<HTMLInputElement>('.aui-data-grid__select-group');
      if (groupBox && display.kind === 'group') this.#paintGroupBox(groupBox, display.node);
      return;
    }
    const on = this.#isRowSelected(this.#baseRowId(rowId));
    el.setAttribute('aria-selected', String(on));
    el.classList.toggle('aui-data-grid__row--selected', on);
    const box = el.querySelector<HTMLInputElement>('.aui-data-grid__select-input');
    if (box) box.checked = on;
  }

  #syncSelectAll(header: HTMLElement): void {
    const all = header.querySelector<HTMLInputElement>('.aui-data-grid__select-all');
    if (!all) return;
    if (this.#server) {
      // Server rows: checked with Select all and no exceptions; mixed with exceptions or a partial selection.
      all.checked = this.#serverSelectAll && this.#selected.size === 0;
      all.indeterminate = this.#selected.size > 0;
      all.disabled = false;
      return;
    }
    const rows = this.#scope().filter((item) => this.#isSelectable(item.row));
    const on = rows.filter((item) => this.#isRowSelected(item.id)).length;
    all.checked = on > 0 && on === rows.length;
    all.indeterminate = on > 0 && on < rows.length;
    all.disabled = rows.length === 0;
  }

  // ---- Cell ranges and copy --------------------------------------------------------------------

  /** Cell ranges (copies), the active one last. */
  getCellRanges(): DataGridCellRange[] {
    return this.#ranges.map((r) => ({ ...r }));
  }

  /** Add a range (ids of displayed rows and visible columns). Replaces the others unless several are allowed. Emits nothing. */
  addCellRange(range: DataGridCellRange): void {
    const r = parseRange(range, 'cellRange');
    if (!this.#cellSelectionOn()) fail('cellSelection', 'true to add cell ranges');
    if (!resolveRange(r, (id) => this.#index().get(id), (id) => this.#rangeColumnIndex(id))) fail('cellRange', 'ids of displayed rows and visible columns');
    this.#ranges = this.#multipleRanges() ? [...this.#ranges, r] : [r];
    this.#rangeEnd = null;
    this.#paintRanges();
    this.#notifyAccessories();
  }

  /** Clear every cell range. Emits nothing. */
  clearCellRanges(): void {
    this.#ranges = [];
    this.#rangeEnd = null;
    this.#paintRanges();
    this.#notifyAccessories();
  }

  /**
   * Copy the ranges (else the selected rows, else the focused cell) to the clipboard with the
   * asynchronous Clipboard API, and return the text (tab-separated). Keyboard copy (Ctrl+C)
   * needs no call: it uses the native copy event.
   */
  async copySelection(): Promise<string> {
    const block = this.#copyBlock();
    if (!block) return '';
    const text = toTsv(block.rows);
    const clipboard = (this.#doc.defaultView ?? window).navigator.clipboard as Clipboard | undefined;
    if (clipboard) await clipboard.writeText(text);
    return text;
  }

  #cellSelectionOn(): boolean {
    const c = this.#options.cellSelection;
    return c === true || (typeof c === 'object');
  }

  #multipleRanges(): boolean {
    const c = this.#options.cellSelection;
    return typeof c === 'object' ? c.multiple !== false : true;
  }

  #columnSelectionOn(): boolean {
    const c = this.#options.cellSelection;
    return typeof c === 'object' && c.columnSelection === true;
  }

  /** Visible column index for ranges (the checkbox column is not part of ranges). */
  #rangeColumnIndex(id: string): number | undefined {
    if (isUtilityColumn(id)) return undefined;
    const i = this.#columnIndex(id);
    return i < 0 ? undefined : i;
  }

  /** First and last visible columns ranges may cover. */
  #rangeColumns(): { first: number; last: number } {
    const visible = this.#layout.visible;
    const first = Math.max(0, visible.findIndex((c) => !isUtilityColumn(c.leaf.id)));
    return { first, last: visible.length - 1 };
  }

  #insideRanges(rowId: string, column: string): boolean {
    const r = this.#index().get(rowId);
    const c = this.#rangeColumnIndex(column);
    if (r === undefined || c === undefined) return false;
    return this.#rects().some((rect) => r >= rect.top && r <= rect.bottom && c >= rect.left && c <= rect.right);
  }

  #setRanges(ranges: DataGridCellRange[], notify: boolean): void {
    this.#ranges = ranges;
    this.#notifyAccessories();
    if (ranges.length === 0) this.#rangeEnd = null;
    this.#paintRanges();
    if (notify) this.#emitRanges(true);
  }

  #emitRanges(finished: boolean): void {
    this.#notifyAccessories();
    emit(this.host, 'aui-range-change', { ranges: this.getCellRanges(), finished } satisfies DataGridRangeChangeDetail);
  }

  #rects(): RangeRect[] {
    const index = this.#index();
    return this.#ranges.map((r) => resolveRange(r, (id) => index.get(id), (id) => this.#rangeColumnIndex(id))).filter((x): x is RangeRect => x !== null);
  }

  /** Mark rendered cells inside ranges (class, edges, aria-selected). */
  #paintRanges(): void {
    const on = this.#cellSelectionOn();
    const rects = on ? this.#rects() : [];
    const columns = new Map(this.#layout.visible.map((c, i) => [c.leaf.id, i]));
    for (const entry of this.#rows.values()) {
      const r = entry.index;
      for (const [id, cell] of entry.cells) {
        const c = columns.get(id);
        let inside = false;
        let top = false;
        let bottom = false;
        let start = false;
        let end = false;
        if (c !== undefined && !isUtilityColumn(id)) {
          for (const rect of rects) {
            if (r < rect.top || r > rect.bottom || c < rect.left || c > rect.right) continue;
            inside = true;
            top ||= r === rect.top;
            bottom ||= r === rect.bottom;
            start ||= c === rect.left;
            end ||= c === rect.right;
          }
        }
        cell.classList.toggle('aui-data-grid__cell--range', inside);
        cell.classList.toggle('aui-data-grid__cell--range-top', top);
        cell.classList.toggle('aui-data-grid__cell--range-bottom', bottom);
        cell.classList.toggle('aui-data-grid__cell--range-start', start);
        cell.classList.toggle('aui-data-grid__cell--range-end', end);
        if (on && !isUtilityColumn(id)) cell.setAttribute('aria-selected', String(inside));
        else cell.removeAttribute('aria-selected');
        const preview = this.#fillPreview;
        cell.classList.toggle('aui-data-grid__cell--fill', preview !== null && c !== undefined && r >= preview.top && r <= preview.bottom && c >= preview.left && c <= preview.right && !inside);
      }
    }
    this.#placeFillHandle(rects);
  }

  /** The fill handle sits in the bottom-end corner cell of a single range (pointer only; Ctrl+D and Ctrl+R are the keyboard way). */
  #placeFillHandle(rects: readonly RangeRect[]): void {
    const c = this.#options.cellSelection;
    const rect = rects.length === 1 && this.#ranges.length === 1 && typeof c === 'object' && c.fillHandle === true ? rects[0] : undefined;
    const item = rect ? this.#items[rect.bottom] : undefined;
    const column = rect ? this.#layout.visible[rect.right] : undefined;
    const cell = item && column ? this.#rows.get(item.id)?.cells.get(column.leaf.id) : undefined;
    if (!cell) {
      this.#fillHandle?.remove();
      return;
    }
    const handle = (this.#fillHandle ??= Object.assign(this.#doc.createElement('div'), { className: 'aui-data-grid__fill-handle' }));
    handle.setAttribute('aria-hidden', 'true');
    if (handle.parentElement !== cell) cell.append(handle);
  }

  /** Shift+navigation: move the active range's free corner (the anchor stays on the focused cell). */
  #extendRange(pos: Focus, key: string, ctrl: boolean, left: string, right: string): void {
    const items = this.#items;
    const visible = this.#layout.visible;
    if (pos.rowId === null || items.length === 0) return;
    const { first, last } = this.#rangeColumns();
    const active = this.#ranges.at(-1);
    const anchorColumn = isUtilityColumn(pos.column) ? (visible[first]?.leaf.id ?? pos.column) : pos.column;
    const base = active ?? { startRow: pos.rowId, endRow: pos.rowId, startColumn: anchorColumn, endColumn: anchorColumn };
    const corner = this.#rangeEnd ?? { rowId: base.endRow, column: base.endColumn };
    let r = this.#index().get(corner.rowId) ?? 0;
    let c = Math.max(first, this.#columnIndex(corner.column));
    const count = items.length;
    const page = Math.max(1, Math.floor((this.#viewportHeight - this.#headerHeight()) / DENSITY_HEIGHT[this.#config.density]) - 1);
    if (key === 'ArrowDown') r = ctrl ? count - 1 : Math.min(count - 1, r + 1);
    else if (key === 'ArrowUp') r = ctrl ? 0 : Math.max(0, r - 1);
    else if (key === left) c = ctrl ? first : Math.max(first, c - 1);
    else if (key === right) c = ctrl ? last : Math.min(last, c + 1);
    else if (key === 'Home') {
      c = first;
      if (ctrl) r = 0;
    } else if (key === 'End') {
      c = last;
      if (ctrl) r = count - 1;
    } else if (key === 'PageDown') r = Math.min(count - 1, r + page);
    else if (key === 'PageUp') r = Math.max(0, r - page);
    const item = items[r];
    const col = visible[c];
    if (!item || !col) return;
    this.#rangeEnd = { rowId: item.id, column: col.leaf.id };
    const next: DataGridCellRange = { startRow: base.startRow, startColumn: base.startColumn, endRow: item.id, endColumn: col.leaf.id };
    this.#ranges = active ? [...this.#ranges.slice(0, -1), next] : [next];
    this.#ensureRowVisible(r);
    this.#ensureColumnVisible(col);
    this.#renderNow();
    this.#emitRanges(true);
    this.#announceRange();
  }

  #selectAllCells(): void {
    const items = this.#items;
    const visible = this.#layout.visible;
    const { first, last } = this.#rangeColumns();
    const top = items[0];
    const bottom = items.at(-1);
    const a = visible[first];
    const b = visible[last];
    if (!top || !bottom || !a || !b) return;
    this.#rangeEnd = { rowId: bottom.id, column: b.leaf.id };
    this.#setRanges([{ startRow: top.id, endRow: bottom.id, startColumn: a.leaf.id, endColumn: b.leaf.id }], true);
    this.#announceRange();
  }

  /** Select a whole column (Ctrl adds a range, Shift extends the active range to it). */
  #selectColumnRange(column: string, add: boolean, extend: boolean): void {
    const top = this.#items[0];
    const bottom = this.#items.at(-1);
    if (!top || !bottom) return;
    const active = this.#ranges.at(-1);
    let next: DataGridCellRange[];
    if (extend && active) next = [...this.#ranges.slice(0, -1), { startRow: top.id, endRow: bottom.id, startColumn: active.startColumn, endColumn: column }];
    else {
      const range = { startRow: top.id, endRow: bottom.id, startColumn: column, endColumn: column };
      next = add && this.#multipleRanges() ? [...this.#ranges, range] : [range];
    }
    this.#rangeEnd = { rowId: bottom.id, column };
    this.#setRanges(next, true);
    this.#announceRange();
  }

  /** The cell under a body event, for ranges (not the checkbox column, not inside widgets). */
  #rangeCell(target: EventTarget | null): { rowId: string; column: string } | null {
    if (!(target instanceof Element) || this.#detailContentOf(target) || target.closest('a, button, input, select, textarea, [contenteditable="true"], .aui-data-grid__fill-handle')) return null;
    const cell = target.closest<HTMLElement>('[role="gridcell"]');
    const rowId = cell?.closest<HTMLElement>('.aui-data-grid__row')?.dataset.rowId;
    const column = cell?.dataset.column;
    if (!cell || rowId === undefined || column === undefined || isUtilityColumn(column) || !this.#body.contains(cell)) return null;
    return { rowId, column };
  }

  /** Pointer down on a cell: start, add (Ctrl), or extend (Shift) a range; a drag then moves its corner. */
  #onRangePointerDown(event: PointerEvent): boolean {
    if (!this.#cellSelectionOn() || event.button !== 0) return false;
    const cell = this.#rangeCell(event.target);
    if (!cell) return false;
    const active = this.#ranges.at(-1);
    const single: DataGridCellRange = { startRow: cell.rowId, endRow: cell.rowId, startColumn: cell.column, endColumn: cell.column };
    if (event.shiftKey && active) this.#ranges = [...this.#ranges.slice(0, -1), { ...active, endRow: cell.rowId, endColumn: cell.column }];
    else if ((event.ctrlKey || event.metaKey) && this.#multipleRanges()) this.#ranges = [...this.#ranges, single];
    else this.#ranges = [single];
    this.#rangeEnd = cell;
    this.#paintRanges();
    this.#emitRanges(true);
    return true;
  }

  /** Scroll while a drag pointer is near (or beyond) the edges of the scrolling area. */
  #onRangeDragScroll(x: number, y: number): void {
    const viewport = this.#viewport.getBoundingClientRect();
    const edge = 30;
    const top = viewport.top + this.#headerHeight();
    if (y < top + edge) this.#viewport.scrollTop -= 20;
    else if (y > viewport.bottom - edge) this.#viewport.scrollTop += 20;
    this.#autoScroll(x);
  }

  #onRangeDrag(x: number, y: number): void {
    const viewport = this.#viewport.getBoundingClientRect();
    const top = viewport.top + this.#headerHeight();
    this.#onRangeDragScroll(x, y);
    const px = Math.min(Math.max(x, viewport.left + 1), viewport.right - 2);
    const py = Math.min(Math.max(y, top + 1), viewport.bottom - 2);
    const cell = this.#rangeCell(this.#doc.elementFromPoint(px, py));
    const active = this.#ranges.at(-1);
    if (!cell || !active || (cell.rowId === active.endRow && cell.column === active.endColumn)) {
      this.#schedule();
      return;
    }
    this.#ranges = [...this.#ranges.slice(0, -1), { ...active, endRow: cell.rowId, endColumn: cell.column }];
    this.#rangeEnd = cell;
    this.#paintRanges();
    this.#schedule();
    this.#emitRanges(false);
  }

  /** Announce the size of the active range (debounced while it changes quickly). */
  #announceRange(): void {
    const view = this.#doc.defaultView ?? window;
    if (this.#rangeAnnounce) view.clearTimeout(this.#rangeAnnounce);
    this.#rangeAnnounce = view.setTimeout(() => {
      this.#rangeAnnounce = 0;
      const rect = this.#rects().at(-1);
      if (!rect) return;
      const locale = this.#config.locale;
      announce(getMessage('dataGrid', 'rangeSelected', { rows: formatNumber(rect.bottom - rect.top + 1, {}, locale), columns: formatNumber(rect.right - rect.left + 1, {}, locale) }, locale), 'polite', this.#doc);
    }, 150);
  }

  #copyText(def: DataGridColumn<Row>, row: Row): string {
    const value = this.#engineColumns.get(def.id)?.accessor(row);
    return def.copyValue ? def.copyValue(value, row) : this.#cellText(def, value, row);
  }

  /** What Ctrl+C copies: the ranges, else the selected rows, else the focused cell. */
  #copyBlock(includeHeaders?: boolean): { rows: string[][]; headers: number; height: number; width: number } | null {
    const visible = this.#layout.visible.filter((c) => !isUtilityColumn(c.leaf.id)).map((c) => c.leaf.def);
    const withHeaders = includeHeaders ?? this.#options.copyHeaders === true;
    const out: string[][] = [];
    const formulas: ({ formula: string; row: number; column: number } | null)[][] = [];
    let headers = 0;
    let height = 0;
    let width = 0;
    const add = (items: readonly GridItem<Row>[], columns: readonly DataGridColumn<Row>[]): void => {
      if (withHeaders) {
        if (out.length === 0) headers = 1;
        out.push(columns.map((d) => d.header));
        formulas.push(columns.map(() => null));
      }
      for (const item of items) {
        out.push(columns.map((d) => this.#itemText(item, d)));
        formulas.push(columns.map((d) => this.#formulaAt(item, d)));
      }
      height += items.length;
      width = Math.max(width, columns.length);
    };
    const rects = this.#cellSelectionOn() ? this.#rects() : [];
    if (rects.length > 0) {
      const all = this.#layout.visible;
      for (const rect of rects) {
        const columns = all.slice(rect.left, rect.right + 1).map((c) => c.leaf.def).filter((d) => !isUtilityColumn(d.id));
        add(this.#items.slice(rect.top, rect.bottom + 1), columns);
      }
    } else if (this.#options.rowSelection && (this.#selected.size > 0 || this.#serverSelectAll)) {
      add(this.#sorted.filter((item) => this.#isRowSelected(item.id)), visible);
    } else {
      const f = this.#focus;
      const def = f ? this.#leafDef(f.column) : undefined;
      const index = f?.rowId ? this.#index().get(f.rowId) : undefined;
      const item = index === undefined ? undefined : this.#items[index];
      if (!def || !item || isUtilityColumn(def.id)) return null;
      add([item], [def]);
    }
    const text = toTsv(out);
    this.#copied = formulas.some((r) => r.some((x) => x !== null)) ? { text, cells: formulas } : null;
    return out.length === 0 ? null : { rows: out, headers, height, width };
  }

  /**
   * A cell's stable A1 address for formulas (R11-18: column letters by column definition order, row numbers by
   * source row order), or null without formula columns or for rows and columns outside them.
   */
  cellAddress(rowId: string, column: string): string | null {
    const item = this.#source.find((x) => x.id === rowId);
    const at = item ? this.#formulaAddress(item.row, column) : null;
    if (!at) return null;
    let n = at.column + 1;
    let letters = '';
    while (n > 0) {
      letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
      n = Math.floor((n - 1) / 26);
    }
    return `${letters}${String(at.row + 1)}`;
  }

  /** A cell's formula text: a calculated column's formula, or a cell formula; null for plain values. */
  cellFormula(rowId: string, column: string): string | null {
    const def = this.#leafDef(column);
    if (!def || isGeneratedColumn(column)) return null;
    if (def.formula !== undefined) return def.formula.startsWith('=') ? def.formula : `=${def.formula}`;
    if (def.formulas !== true) return null;
    const item = this.#source.find((x) => x.id === rowId);
    const raw = item ? this.#rawAccessors.get(column)?.(item.row) : undefined;
    return isFormulaText(raw) ? raw : null;
  }

  /** While a formula is edited, a pointer press on another cell inserts its reference (focus stays in the editor). */
  #listenFormulaPointer(): void {
    let swallow = false;
    const g = this.#group;
    g.listen(
      this.#body,
      'pointerdown',
      (event) => {
        swallow = false;
        const e = this.#editing;
        const open = e ? e.editors.get(e.column) : undefined;
        if (!e || !open?.editor.insertReference || event.button !== 0 || !(event.target instanceof Element) || open.wrapper.contains(event.target)) return;
        const cellEl = event.target.closest<HTMLElement>('.aui-data-grid__cell');
        const rowEl = cellEl?.closest<HTMLElement>('.aui-data-grid__row');
        const rowId = rowEl?.parentElement === this.#body ? rowEl.dataset.rowId : undefined;
        const column = cellEl?.dataset.column;
        if (rowId === undefined || column === undefined) return;
        const address = this.cellAddress(this.#baseRowId(rowId), column);
        if (address === null || !open.editor.insertReference(address)) return;
        event.preventDefault();
        event.stopPropagation();
        swallow = true;
        open.editor.focus();
      },
      { capture: true },
    );
    g.listen(
      this.#body,
      'mousedown',
      (event) => {
        if (!swallow) return;
        // The press inserted a reference: it must not move focus out of the editor.
        event.preventDefault();
        event.stopPropagation();
        swallow = false;
      },
      { capture: true },
    );
  }

  /** A cell formula with its stable address (for paste), or null. */
  #formulaAt(item: GridItem<Row>, def: DataGridColumn<Row>): { formula: string; row: number; column: number } | null {
    if (def.formulas !== true || (item.display && item.display.kind !== 'data')) return null;
    const row = this.#displayRow(item);
    const value = this.#rawAccessors.get(def.id)?.(row);
    const at = isFormulaText(value) ? this.#formulaAddress(row, def.id) : null;
    return at && isFormulaText(value) ? { formula: value, ...at } : null;
  }

  /** A cell's stable address: source row position and column definition position. */
  #formulaAddress(row: Row, column: string): { row: number; column: number } | null {
    if (!this.#formulaBook()) return null;
    const r = this.#rowPositions.get(row);
    const c = this.#bookColumns.get(column);
    return r === undefined || c === undefined ? null : { row: r, column: c };
  }

  /** The text an editor of a formulas column starts with: the formula, else the value as text. */
  #formulaEditText(def: DataGridColumn<Row>, row: Row): string {
    const raw = this.#rawAccessors.get(def.id)?.(row);
    if (isFormulaText(raw)) return raw;
    return raw === null || raw === undefined ? '' : this.#cellText(def, raw, row);
  }

  /** An edited value of a formulas column: a checked formula, else the text read as the column type. */
  #formulaInput(def: DataGridColumn<Row>, row: Row, value: unknown): unknown {
    if (def.formulas !== true || typeof value !== 'string') return value;
    const text = value.trim();
    const locale = this.#config.locale;
    if (text === '') return null;
    if (text.startsWith('=')) {
      const problem = this.#options.formulas?.check(text) ?? null;
      return problem === null ? text : { invalid: getMessage('dataGrid', 'formulaInvalid', { message: problem }, locale) };
    }
    const parsed = this.#parseFor(def, row, value);
    return parsed.ok ? parsed.value : { invalid: getMessage('dataGrid', 'formulaValueInvalid', {}, locale) };
  }

  /** Ctrl+C on a grid cell: write the copy block as text and as an HTML table (no permission needed). */
  #onCopy(event: ClipboardEvent): boolean {
    if (!this.#gridCellFocused()) return false;
    const block = this.#copyBlock();
    if (!block || !event.clipboardData) return false;
    event.preventDefault();
    event.clipboardData.setData('text/plain', toTsv(block.rows));
    event.clipboardData.setData('text/html', toHtmlTable(block.rows, block.headers));
    const locale = this.#config.locale;
    announce(getMessage('dataGrid', 'copied', { rows: formatNumber(block.height, {}, locale), columns: formatNumber(block.width, {}, locale) }, locale), 'polite', this.#doc);
    return true;
  }

  /** Focus is on a body cell itself (not a widget in it) and no text is selected: clipboard keys are the grid's. */
  #gridCellFocused(): boolean {
    const active = this.#doc.activeElement;
    if (!(active instanceof HTMLElement) || !this.#body.contains(active) || active.getAttribute('role') !== 'gridcell' || this.#detailContentOf(active)) return false;
    const selection = this.#doc.getSelection();
    return !(selection && !selection.isCollapsed && selection.toString() !== '');
  }

  // ---- Writes (R11-13: rows are never mutated; readOnlyEdits only requests) ------------------------

  #writable(def: DataGridColumn<Row>, row: Row): boolean {
    if (isUtilityColumn(def.id) || def.formula !== undefined) return false;
    const editable = typeof def.editable === 'function' ? def.editable(row) : def.editable === true;
    if (!editable) return false;
    return def.setValue !== undefined || (def.field !== undefined && isPlainObject(row));
  }

  #withValue(def: DataGridColumn<Row>, row: Row, value: unknown): Row {
    if (def.setValue) return def.setValue(row, value);
    const field = def.field ?? '';
    // Only plain-object rows reach here (#writable): a shallow copy keeps every other field.
    return { ...(row as Record<string, unknown>), [field]: value } as Row;
  }

  /** Apply (or, with readOnlyEdits, request) cell writes as one transaction; emits aui-cells-change. */
  #writeCells(writes: readonly { rowId: string; column: string; value: unknown }[], source: DataGridCellsChangeDetail['source'], rejected: DataGridCellsChangeDetail['rejected'] = []): DataGridCellChange[] {
    const rows = new Map(this.#source.map((item) => [item.id, this.#displayRow(item)]));
    const changes: DataGridCellChange[] = [];
    const next = new Map<string, Row>();
    for (const w of writes) {
      const row = rows.get(w.rowId);
      const def = this.#leafDef(w.column);
      if (row === undefined || !def || !this.#writable(def, row)) continue;
      const oldValue = this.#engineColumns.get(def.id)?.accessor(row);
      if (sameValue(oldValue, w.value)) continue;
      changes.push({ rowId: w.rowId, column: w.column, oldValue, newValue: w.value });
      next.set(w.rowId, this.#withValue(def, next.get(w.rowId) ?? row, w.value));
    }
    if (changes.length === 0 && rejected.length === 0) return [];
    if (this.#batch && source !== 'batch') {
      // Batch editing: pending values only (events and undo come with commitBatch).
      this.#writePending(changes);
      return [];
    }
    const applied = this.#options.readOnlyEdits !== true;
    if (applied && next.size > 0) {
      // An internal transaction: the undo history stays (it records this write instead).
      this.#afterRowsChange(this.#applyTx({ update: [...next.values()] }));
      if (source !== 'undo' && source !== 'redo') this.#recordUndo(changes);
    }
    const locale = this.#config.locale;
    const count = { count: formatNumber(changes.length, {}, locale) };
    const parts = [
      source === 'undo' ? getMessage('dataGrid', 'undone', count, locale) : source === 'redo' ? getMessage('dataGrid', 'redone', count, locale) : source === 'edit' ? '' : getMessage('dataGrid', source === 'paste' ? 'cellsPasted' : source === 'fill' || source === 'bulk' ? 'cellsFilled' : 'cellsCleared', count, locale),
    ].filter((p) => p !== '');
    if (rejected.length > 0) parts.push(getMessage('dataGrid', 'cellsRejected', { count: formatNumber(rejected.length, {}, locale) }, locale));
    if (parts.length > 0) announce(parts.join('. '), 'polite', this.#doc);
    emit(this.host, 'aui-cells-change', { changes, source, applied, rejected } satisfies DataGridCellsChangeDetail);
    return applied ? changes : [];
  }

  /** The cells writes apply to: every range (resolved), else the focused cell. */
  #targetRects(): RangeRect[] {
    const rects = this.#cellSelectionOn() ? this.#rects() : [];
    if (rects.length > 0) return rects;
    const f = this.#focus;
    const r = f?.rowId ? this.#index().get(f.rowId) : undefined;
    const c = f ? this.#rangeColumnIndex(f.column) : undefined;
    return r === undefined || c === undefined ? [] : [{ top: r, bottom: r, left: c, right: c }];
  }

  #cellsOf(rect: RangeRect): { rowId: string; row: Row; def: DataGridColumn<Row>; r: number; c: number }[] {
    const out: { rowId: string; row: Row; def: DataGridColumn<Row>; r: number; c: number }[] = [];
    const visible = this.#layout.visible;
    for (let r = rect.top; r <= rect.bottom; r++) {
      const item = this.#items[r];
      if (!item) continue;
      for (let c = rect.left; c <= rect.right; c++) {
        const def = visible[c]?.leaf.def;
        if (def && !isUtilityColumn(def.id)) out.push({ rowId: item.id, row: item.row, def, r, c });
      }
    }
    return out;
  }

  /** Delete or cut: set the target cells to null. */
  #clearCells(source: 'delete' | 'cut'): void {
    const writes = this.#targetRects().flatMap((rect) => this.#cellsOf(rect).map((x) => ({ rowId: x.rowId, column: x.def.id, value: null })));
    this.#writeCells(writes, source);
  }

  /** Convert pasted text for a column (its parseValue, else by type in the grid's locale). */
  #parseFor(def: DataGridColumn<Row>, row: Row, text: string): { ok: true; value: unknown } | { ok: false } {
    if (def.formulas === true && text.trim().startsWith('=')) {
      const formula = text.trim();
      return this.#options.formulas?.check(formula) === null ? { ok: true, value: formula } : { ok: false };
    }
    if (def.parseValue) {
      const value = def.parseValue(text, row);
      return value === undefined ? { ok: false } : { ok: true, value };
    }
    const locale = this.#config.locale;
    return parseCellText(text, def.type ?? 'text', locale, { yes: getMessage('dataGrid', 'yes', {}, locale), no: getMessage('dataGrid', 'no', {}, locale) });
  }

  /** Ctrl+V: paste tab-separated text at the active range (tiled when it divides the range evenly) or the focused cell. */
  #onPaste(event: ClipboardEvent): void {
    if (!this.#gridCellFocused() || !event.clipboardData) return;
    if (this.#pasteText(event.clipboardData.getData('text/plain'))) event.preventDefault();
  }

  /** Paste tab-separated text; false when there is nothing to paste into. */
  #pasteText(text: string): boolean {
    const block = parseTsv(text);
    const target = this.#targetRects().at(-1);
    const height = block.length;
    const width = Math.max(0, ...block.map((r) => r.length));
    if (!target || height === 0 || width === 0) return false;
    const rh = target.bottom - target.top + 1;
    const rw = target.right - target.left + 1;
    const tile = rh % height === 0 && rw % width === 0 && (rh > height || rw > width);
    const area: RangeRect = tile
      ? target
      : { top: target.top, left: target.left, bottom: Math.min(this.#items.length - 1, target.top + height - 1), right: Math.min(this.#layout.visible.length - 1, target.left + width - 1) };
    const writes: { rowId: string; column: string; value: unknown }[] = [];
    const rejected: { rowId: string; column: string; text: string }[] = [];
    const copied = this.#copied?.text === text ? this.#copied : null;
    for (const cell of this.#cellsOf(area)) {
      const text = block[(cell.r - area.top) % height]?.[(cell.c - area.left) % width];
      if (text === undefined || !this.#writable(cell.def, cell.row)) continue;
      const from = copied?.cells[(cell.r - area.top) % height]?.[(cell.c - area.left) % width];
      if (from && cell.def.formulas === true) {
        const to = this.#formulaAddress(cell.row, cell.def.id);
        if (to) {
          writes.push({ rowId: cell.rowId, column: cell.def.id, value: this.#options.formulas?.shift(from.formula, to.row - from.row, to.column - from.column) ?? from.formula });
          continue;
        }
      }
      const parsed = this.#parseFor(cell.def, cell.row, text);
      if (parsed.ok) writes.push({ rowId: cell.rowId, column: cell.def.id, value: parsed.value });
      else rejected.push({ rowId: cell.rowId, column: cell.def.id, text });
    }
    // The pasted area becomes the range.
    if (this.#cellSelectionOn()) this.#rangeFromRect(area);
    this.#writeCells(writes, 'paste', rejected);
    return true;
  }

  #rangeFromRect(rect: RangeRect): void {
    const visible = this.#layout.visible;
    const a = this.#items[rect.top];
    const b = this.#items[rect.bottom];
    const l = visible[rect.left];
    const r = visible[rect.right];
    if (!a || !b || !l || !r) return;
    this.#rangeEnd = { rowId: b.id, column: r.leaf.id };
    this.#setRanges([{ startRow: a.id, endRow: b.id, startColumn: l.leaf.id, endColumn: r.leaf.id }], true);
  }

  /** Raw value of a cell, converted through its text when the target column has another type. */
  #carry(from: DataGridColumn<Row>, row: Row, to: DataGridColumn<Row>, target: Row): { ok: true; value: unknown } | { ok: false } {
    if (to.formulas === true && from.formulas === true) {
      const raw = this.#rawAccessors.get(from.id)?.(row);
      const a = isFormulaText(raw) ? this.#formulaAddress(row, from.id) : null;
      const b = a ? this.#formulaAddress(target, to.id) : null;
      if (isFormulaText(raw) && a && b) return { ok: true, value: this.#options.formulas?.shift(raw, b.row - a.row, b.column - a.column) ?? raw };
    }
    const value = this.#engineColumns.get(from.id)?.accessor(row);
    if ((from.type ?? 'text') === (to.type ?? 'text') && !to.parseValue) return { ok: true, value };
    return this.#parseFor(to, target, this.#copyText(from, row));
  }

  /** Ctrl+D (down) / Ctrl+R (right): copy each range's first row or column over the rest of it. */
  #fillCopy(direction: 'down' | 'right'): void {
    const writes: { rowId: string; column: string; value: unknown }[] = [];
    const visible = this.#layout.visible;
    for (const rect of this.#targetRects()) {
      for (const cell of this.#cellsOf(rect)) {
        if (direction === 'down' ? cell.r === rect.top : cell.c === rect.left) continue;
        const sourceItem = this.#items[direction === 'down' ? rect.top : cell.r];
        const sourceDef = direction === 'down' ? cell.def : visible[rect.left]?.leaf.def;
        if (!sourceItem || !sourceDef || isUtilityColumn(sourceDef.id)) continue;
        const carried = this.#carry(sourceDef, sourceItem.row, cell.def, cell.row);
        if (carried.ok) writes.push({ rowId: cell.rowId, column: cell.def.id, value: carried.value });
      }
    }
    this.#writeCells(writes, 'fill');
  }

  /** Dragging the fill handle: the preview grows along the axis the pointer moved furthest from the range. */
  #onFillDrag(x: number, y: number): void {
    const base = this.#rects().at(-1);
    if (!base) return;
    this.#onRangeDragScroll(x, y);
    const viewport = this.#viewport.getBoundingClientRect();
    const px = Math.min(Math.max(x, viewport.left + 1), viewport.right - 2);
    const py = Math.min(Math.max(y, viewport.top + this.#headerHeight() + 1), viewport.bottom - 2);
    const cell = this.#rangeCell(this.#doc.elementFromPoint(px, py));
    if (!cell) return;
    const r = this.#index().get(cell.rowId);
    const c = this.#rangeColumnIndex(cell.column);
    if (r === undefined || c === undefined) return;
    const dr = r < base.top ? r - base.top : r > base.bottom ? r - base.bottom : 0;
    const dc = c < base.left ? c - base.left : c > base.right ? c - base.right : 0;
    let preview: RangeRect;
    if (dr === 0 && dc === 0) {
      // Inside the range: shrink it from the bottom (or the end) to the pointer.
      preview = base.bottom - r >= base.right - c ? { ...base, bottom: Math.max(base.top, r) } : { ...base, right: Math.max(base.left, c) };
    } else if (Math.abs(dr) >= Math.abs(dc)) preview = { ...base, top: Math.min(base.top, r), bottom: Math.max(base.bottom, r) };
    else preview = { ...base, left: Math.min(base.left, c), right: Math.max(base.right, c) };
    this.#fillPreview = preview;
    this.#paintRanges();
    this.#schedule();
  }

  /** Release: fill the cells the preview added (series per column or row), or clear the cells a shrink removed. */
  #finishFill(): void {
    const base = this.#rects().at(-1);
    const preview = this.#fillPreview;
    this.#fillPreview = null;
    if (!base || !preview) {
      this.#paintRanges();
      return;
    }
    this.#applyFill(base, preview, this.#fillAlt);
  }

  /** Double-click on the handle: fill down to the last displayed row. */
  #fillToEnd(): void {
    const base = this.#rects().at(-1);
    if (!base) return;
    this.#applyFill(base, { ...base, bottom: this.#items.length - 1 }, false);
  }

  #applyFill(base: RangeRect, to: RangeRect, alt: boolean): void {
    const writes: { rowId: string; column: string; value: unknown }[] = [];
    const visible = this.#layout.visible;
    const shrink = to.bottom < base.bottom || to.right < base.right;
    if (shrink) {
      // The cells the shrink removed are cleared.
      for (const cell of this.#cellsOf(base)) if (cell.r > to.bottom || cell.c > to.right) writes.push({ rowId: cell.rowId, column: cell.def.id, value: null });
    } else if (to.top !== base.top || to.bottom !== base.bottom) {
      const backwards = to.top < base.top;
      const count = backwards ? base.top - to.top : to.bottom - base.bottom;
      for (let c = base.left; c <= base.right; c++) {
        const def = visible[c]?.leaf.def;
        if (!def || isUtilityColumn(def.id)) continue;
        const sources = this.#items.slice(base.top, base.bottom + 1);
        if (def.formulas === true && sources.some((item) => this.#formulaAt(item, def))) {
          // Formulas repeat, their relative references moved by the rows filled over.
          for (let i = 0; i < count; i++) {
            const k = backwards ? sources.length - 1 - (i % sources.length) : i % sources.length;
            const from = sources[k];
            const item = this.#items[backwards ? base.top - 1 - i : base.bottom + 1 + i];
            if (!from || !item) continue;
            const formula = this.#formulaAt(from, def);
            const to = this.#formulaAddress(this.#displayRow(item), def.id);
            const value = formula && to ? (this.#options.formulas?.shift(formula.formula, to.row - formula.row, to.column - formula.column) ?? formula.formula) : this.#rawAccessors.get(def.id)?.(this.#displayRow(from));
            writes.push({ rowId: item.id, column: def.id, value });
          }
          continue;
        }
        const accessor = this.#engineColumns.get(def.id)?.accessor;
        const source = sources.map((item) => accessor?.(this.#displayRow(item)));
        const values = fillSeries(source, count, { repeat: alt && source.length > 1, increment: alt && source.length === 1, backwards, ...(def.businessCalendar ? { calendar: def.businessCalendar } : {}) });
        values.forEach((value, i) => {
          const item = this.#items[backwards ? base.top - 1 - i : base.bottom + 1 + i];
          if (item) writes.push({ rowId: item.id, column: def.id, value });
        });
      }
    } else if (to.left !== base.left || to.right !== base.right) {
      const backwards = to.left < base.left;
      const count = backwards ? base.left - to.left : to.right - base.right;
      for (let r = base.top; r <= base.bottom; r++) {
        const item = this.#items[r];
        if (!item) continue;
        const defs = visible.slice(base.left, base.right + 1).map((col) => col.leaf.def);
        const source = defs.map((d) => this.#engineColumns.get(d.id)?.accessor(this.#displayRow(item)));
        const values = fillSeries(source, count, { repeat: alt && source.length > 1, increment: alt && source.length === 1, backwards });
        values.forEach((value, i) => {
          const def = visible[backwards ? base.left - 1 - i : base.right + 1 + i]?.leaf.def;
          if (!def || isUtilityColumn(def.id)) return;
          // A formula moves its relative references by the columns filled over.
          const k = backwards ? defs.length - 1 - (i % defs.length) : i % defs.length;
          const fromDef = defs[k];
          const formula = fromDef ? this.#formulaAt(item, fromDef) : null;
          const to = def.formulas === true ? this.#formulaAddress(this.#displayRow(item), def.id) : null;
          if (formula && to) writes.push({ rowId: item.id, column: def.id, value: this.#options.formulas?.shift(formula.formula, to.row - formula.row, to.column - formula.column) ?? formula.formula });
          else writes.push({ rowId: item.id, column: def.id, value });
        });
      }
    }
    if (this.#cellSelectionOn()) this.#rangeFromRect(to);
    this.#writeCells(writes, 'fill');
  }

  // ---- Editing (G4a, G4b) ---------------------------------------------------------------------------

  /** The cell whose editor has focus, or null. */
  get editingCell(): { rowId: string; column: string } | null {
    const e = this.#editing;
    return e ? { rowId: e.rowId, column: e.column } : null;
  }

  /** Start editing a cell (its whole row with `editMode: 'row'`). Returns false when it is not displayed or not editable. */
  startEditing(rowId: string, column: string): boolean {
    return this.#startEditing(rowId, column, null);
  }

  /** Stop editing: commit (validated; invalid values are discarded) or cancel. */
  stopEditing(cancel = false): void {
    if (cancel) this.#cancelEdit(true);
    else this.#commitEdit('api');
  }

  /** Undo the last applied write (edit, paste, cut, Delete, fill, bulk edit, batch). Returns false when there is nothing to undo. */
  undo(): boolean {
    return this.#undoStep(false);
  }

  /** Redo the last undone write. */
  redo(): boolean {
    return this.#undoStep(true);
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  /** A batch is collecting pending edits (shown, but not applied until `commitBatch`). */
  get isBatchEditing(): boolean {
    return this.#batch !== null;
  }

  /** Start collecting writes as pending values: they show in the cells, sorting and filtering keep the committed data. */
  startBatch(): void {
    if (this.#editing) this.#commitEdit('api');
    this.#batch ??= new Map();
  }

  /** Apply the pending values as one transaction and one undo step (`aui-cells-change` with `source: 'batch'`). */
  commitBatch(): void {
    if (this.#editing) this.#commitEdit('api');
    const batch = this.#batch;
    if (!batch) return;
    this.#batch = null;
    const writes = [...batch].flatMap(([rowId, p]) => [...p.changes].map(([column, c]) => ({ rowId, column, value: c.newValue })));
    this.#refreshPending(batch);
    this.#writeCells(writes, 'batch');
  }

  /** Discard the pending values. */
  cancelBatch(): void {
    if (this.#editing) this.#cancelEdit(false);
    const batch = this.#batch;
    if (!batch) return;
    this.#batch = null;
    this.#refreshPending(batch);
    this.#renderNow();
  }

  /** Rebuild the rendered cells a batch touched (their text and pending marker change). */
  #refreshPending(batch: ReadonlyMap<string, PendingRow<Row>>): void {
    for (const [rowId, p] of batch) for (const column of p.changes.keys()) this.#refreshCell(rowId, column);
  }

  /** The row as displayed: its pending version during a batch, else the committed row. */
  #displayRow(item: Item<Row>): Row {
    return this.#batch?.get(item.id)?.row ?? item.row;
  }

  /** Drop pending rows whose committed row changed or was removed (application updates during a batch). */
  #pruneBatch(): void {
    const batch = this.#batch;
    if (!batch || batch.size === 0) return;
    const rows = new Map(this.#source.map((item) => [item.id, item.row]));
    for (const [rowId, p] of batch) if (rows.get(rowId) !== p.base) batch.delete(rowId);
  }

  /** Record writes as pending values (batch editing). */
  #writePending(changes: readonly DataGridCellChange[]): void {
    const batch = this.#batch;
    if (!batch) return;
    const rows = new Map(this.#source.map((item) => [item.id, item.row]));
    for (const c of changes) {
      const base = rows.get(c.rowId);
      const def = this.#leafDef(c.column);
      if (base === undefined || !def) continue;
      const p = batch.get(c.rowId) ?? { base, row: base, changes: new Map<string, { oldValue: unknown; newValue: unknown }>() };
      p.row = this.#withValue(def, p.row, c.newValue);
      const committed = this.#engineColumns.get(def.id)?.accessor(base);
      if (sameValue(committed, c.newValue)) p.changes.delete(c.column);
      else p.changes.set(c.column, { oldValue: committed, newValue: c.newValue });
      if (p.changes.size === 0) batch.delete(c.rowId);
      else batch.set(c.rowId, p);
      this.#refreshCell(c.rowId, c.column);
    }
    this.#renderNow();
  }

  #clearUndo(): void {
    this.#undo = [];
    this.#redo = [];
  }

  #recordUndo(changes: DataGridCellChange[]): void {
    const limit = this.#options.undoLimit ?? 20;
    if (limit === 0 || changes.length === 0) return;
    this.#undo.push(changes);
    if (this.#undo.length > limit) this.#undo.shift();
    this.#redo = [];
  }

  #undoStep(redo: boolean): boolean {
    if (this.#editing) this.#commitEdit('api');
    // Undo works on applied writes; a batch's pending values are discarded with cancelBatch.
    if (this.#batch) return false;
    const step = (redo ? this.#redo : this.#undo).pop();
    if (!step) return false;
    if (!Array.isArray(step)) {
      // A row move: the order before (undo) or after (redo).
      this.#applyOrder(redo ? step.after : step.before, step.ids);
      (redo ? this.#undo : this.#redo).push(step);
      return true;
    }
    const written = this.#writeCells(step.map((c) => ({ rowId: c.rowId, column: c.column, value: redo ? c.newValue : c.oldValue })), redo ? 'redo' : 'undo');
    if (written.length > 0) (redo ? this.#undo : this.#redo).push(step);
    // Focus (and select) the cells the step changed.
    const index = this.#index();
    const rows = step.map((c) => index.get(c.rowId)).filter((r): r is number => r !== undefined);
    const cols = step.map((c) => this.#rangeColumnIndex(c.column)).filter((c): c is number => c !== undefined);
    if (rows.length > 0 && cols.length > 0) {
      const rect = { top: Math.min(...rows), bottom: Math.max(...rows), left: Math.min(...cols), right: Math.max(...cols) };
      const item = this.#items[rect.top];
      const col = this.#layout.visible[rect.left];
      if (item && col) this.#moveFocus({ rowId: item.id, column: col.leaf.id, level: 0 }, true);
      if (this.#cellSelectionOn() && (rect.top !== rect.bottom || rect.left !== rect.right)) this.#rangeFromRect(rect);
    }
    return written.length > 0;
  }

  /** "{first column text}", or "Row n" when that text is empty. */
  #rowName(row: Row, rowId: string): string {
    const locale = this.#config.locale;
    const first = this.#layout.visible.find((c) => !isGeneratedColumn(c.leaf.id))?.leaf.def;
    const text = first ? this.#cellText(first, this.#engineColumns.get(first.id)?.accessor(row), row).trim() : '';
    return text !== '' ? text : getMessage('dataGrid', 'rowName', { index: (this.#index().get(rowId) ?? 0) + 1 }, locale);
  }

  #editableAt(rowId: string, column: string): boolean {
    const index = this.#index().get(rowId);
    const item = index === undefined ? undefined : this.#items[index];
    const def = this.#leafDef(column);
    const display = item?.display;
    // A tree parent's own cells are editable, except aggregated ones.
    const data = display === undefined || display.kind === 'data' || (display.kind === 'group' && display.node.item !== undefined && !def?.aggregate);
    return item !== undefined && def !== undefined && data && this.#writable(def, item.row);
  }

  /** Drop a rendered cell so the next render builds it again (to show or hide an editor, or a pending value). */
  #refreshCell(rowId: string, column: string): void {
    const entry = this.#rows.get(rowId);
    const cell = entry?.cells.get(column);
    if (!entry || !cell) return;
    cell.remove();
    this.#releaseCell(entry, column);
    entry.cells.delete(column);
  }

  /** Create an editor for one cell (inline in row mode, so popup editors also render in the cell). */
  #createEditor(item: Item<Row>, def: DataGridColumn<Row>, key: string | null, describedBy: string, rowMode: boolean): OpenEditor {
    const doc = this.#doc;
    const { locale, timezone } = this.#config;
    const msg = (k: string, params: Readonly<Record<string, string | number>> = {}): string => getMessage('dataGrid', k, params, locale);
    const row = this.#displayRow(item);
    const context = {
      doc,
      row,
      rowId: item.id,
      column: def.id,
      value: def.formulas === true ? this.#formulaEditText(def, row) : this.#engineColumns.get(def.id)?.accessor(row),
      key,
      locale,
      timezone,
      label: msg('editLabel', { column: def.header, row: this.#rowName(row, item.id) }),
      describedBy,
      commit: () => {
        this.#commitEdit('enter');
      },
      cancel: () => {
        this.#cancelEdit(true);
      },
    };
    const spec = def.editor ?? {};
    const formulas = this.#options.formulas;
    const editor = isCustomEditor(spec)
      ? spec.create(context)
      : def.formulas === true && formulas?.editor
        ? formulas.editor(context, this.#leaves.filter((l) => !isGeneratedColumn(l.id)).map((l) => ({ id: l.id, header: l.def.header })))
        : createProvidedEditor(def.formulas === true ? 'text' : (spec.kind ?? defaultEditorKind(def.type ?? 'text')), spec, context, { invalidNumber: msg('editInvalidNumber'), invalidDate: msg('editInvalidDate'), invalidTime: msg('editInvalidTime'), empty: msg('editEmpty') });
    const wrapper = doc.createElement('div');
    wrapper.className = 'aui-data-grid__editor';
    wrapper.append(editor.element);
    wrapper.addEventListener('keydown', (event) => {
      this.#onEditorKey(event, def.id);
    });
    wrapper.addEventListener('focusin', () => {
      if (this.#editing) this.#editing.column = def.id;
    });
    wrapper.addEventListener('focusout', (event) => {
      const e = this.#editing;
      if (this.#rendering || !e || e.editors.get(def.id)?.wrapper !== wrapper) return;
      const next = event.relatedTarget;
      if (next instanceof Node && ([...e.editors.values()].some((o) => o.wrapper.contains(next)) || e.error.contains(next))) return;
      // Focus leaving the editors commits (R11-14); invalid values are then discarded.
      this.#commitEdit('blur');
    });
    return { column: def.id, editor, wrapper, popup: editor.popup === true && !rowMode, stopPosition: null };
  }

  #startEditing(rowId: string, column: string, key: string | null): boolean {
    const current = this.#editing;
    if (current) {
      if (current.rowId === rowId && current.editors.has(column)) {
        current.editors.get(column)?.editor.focus();
        return true;
      }
      if (!this.#commitEdit('move')) return false;
    }
    if (!this.#editableAt(rowId, column)) return false;
    const item = this.#source.find((x) => x.id === rowId);
    const def = this.#leafDef(column);
    if (!item || !def) return false;
    this.#moveFocus({ rowId, column, level: 0 }, false);
    const doc = this.#doc;
    const rowMode = this.#options.editMode === 'row';
    const error = doc.createElement('div');
    error.className = 'aui-data-grid__edit-error';
    error.id = editorMessageId();
    error.popover = 'manual';
    this.host.append(error);
    const editors = new Map<string, OpenEditor>();
    // Row mode: an editor in every editable visible cell of the row; the started cell gets the key.
    const columns = rowMode ? this.#layout.visible.map((c) => c.leaf.def).filter((d) => this.#writable(d, item.row)) : [def];
    for (const d of columns) editors.set(d.id, this.#createEditor(item, d, d.id === column ? key : null, error.id, rowMode));
    this.#editing = { rowId, column, editors, error, stopError: null, row: rowMode };
    for (const open of editors.values()) {
      if (open.popup) {
        open.wrapper.classList.add('aui-data-grid__editor--popup');
        open.wrapper.popover = 'manual';
        this.host.append(open.wrapper);
        open.wrapper.showPopover();
        const anchor = this.#rows.get(rowId)?.cells.get(open.column);
        if (anchor) open.stopPosition = autoPosition(anchor, open.wrapper, { placement: 'bottom-start', offset: 0, direction: this.#config.direction });
      } else this.#refreshCell(rowId, open.column);
    }
    this.#rows.get(rowId)?.el.classList.toggle('aui-data-grid__row--editing', rowMode);
    this.#renderNow();
    editors.get(column)?.editor.focus();
    return true;
  }

  #onEditorKey(event: KeyboardEvent, column: string): void {
    const e = this.#editing;
    const open = e?.editors.get(column);
    // Keys an editor's own widget handled (a list choosing an option, closing its popup) are not the grid's.
    if (!e || !open || event.defaultPrevented) return;
    const { key } = event;
    const ctrl = event.ctrlKey || event.metaKey;
    const textarea = open.editor.element instanceof HTMLTextAreaElement;
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.#cancelEdit(true);
      return;
    }
    let how: CommitReason | null = null;
    if (key === 'Enter' && ctrl) how = !e.row && this.#cellSelectionOn() && this.#ranges.length > 0 ? 'bulk' : 'enter';
    else if (key === 'Enter' && !textarea && !event.altKey && !event.shiftKey) how = this.#options.enterMovesDown === true ? 'down' : 'enter';
    else if (key === 'Tab') {
      if (e.row) {
        // Row mode: Tab moves between the row's editors; past the last (or first) it commits the row.
        const order = [...e.editors.keys()];
        const next = order[order.indexOf(column) + (event.shiftKey ? -1 : 1)];
        if (next !== undefined) {
          event.preventDefault();
          event.stopPropagation();
          e.editors.get(next)?.editor.focus();
          return;
        }
      }
      how = event.shiftKey ? 'previous' : 'next';
    }
    if (!how) return;
    event.preventDefault();
    event.stopPropagation();
    this.#commitEdit(how);
  }

  /** The message for an unacceptable value, else null (editor conversion, required, bounds, the column's validate). */
  #validateEdit(def: DataGridColumn<Row>, row: Row, value: unknown): string | null {
    const locale = this.#config.locale;
    if (isInvalidInput(value)) return value.invalid;
    if (def.required === true && (value === null || value === undefined || value === '')) return getMessage('dataGrid', 'editRequired', {}, locale);
    const spec = def.editor && !isCustomEditor(def.editor) ? def.editor : undefined;
    if (typeof value === 'number' && spec) {
      if (typeof spec.min === 'number' && value < spec.min) return getMessage('dataGrid', 'editMin', { min: formatNumber(spec.min, {}, locale) }, locale);
      if (typeof spec.max === 'number' && value > spec.max) return getMessage('dataGrid', 'editMax', { max: formatNumber(spec.max, {}, locale) }, locale);
    }
    if (typeof value === 'string' && spec?.maxLength !== undefined && value.length > spec.maxLength) return getMessage('dataGrid', 'editMaxLength', { max: spec.maxLength }, locale);
    if (isPlainDate(value) && spec) {
      const iso = `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
      if (typeof spec.min === 'string' && iso < spec.min) return getMessage('dataGrid', 'editMin', { min: spec.min }, locale);
      if (typeof spec.max === 'string' && iso > spec.max) return getMessage('dataGrid', 'editMax', { max: spec.max }, locale);
    }
    return def.validate ? def.validate(value, row) : null;
  }

  /** Show a validation message under a cell's editor (announced; its control is marked invalid and focused). */
  #showEditError(column: string, message: string): void {
    const e = this.#editing;
    const open = e?.editors.get(column);
    if (!e || !open) return;
    e.error.textContent = message;
    if (!e.error.matches(':popover-open')) e.error.showPopover();
    e.stopError?.();
    const anchor = open.popup ? open.wrapper : this.#rows.get(e.rowId)?.cells.get(column);
    if (anchor) e.stopError = autoPosition(anchor, e.error, { placement: 'bottom-start', offset: 2, direction: this.#config.direction });
    for (const o of e.editors.values()) (o.editor.control ?? o.editor.element).removeAttribute('aria-invalid');
    (open.editor.control ?? open.editor.element).setAttribute('aria-invalid', 'true');
    if (e.column !== column) open.editor.focus();
    announce(message, 'assertive', this.#doc);
  }

  /**
   * Commit the edit (every editor of the row in row mode). Invalid values block (the editors stay
   * open) unless `invalidEdit: 'revert'` or focus left them; then they are discarded and announced.
   * Returns false while blocked.
   */
  #commitEdit(how: CommitReason): boolean {
    const e = this.#editing;
    if (!e) return true;
    const item = this.#source.find((x) => x.id === e.rowId);
    if (!item) {
      this.#closeEditor();
      return true;
    }
    const row = this.#displayRow(item);
    const values = new Map<string, unknown>();
    let failure: { column: string; message: string } | null = null;
    for (const [column, open] of e.editors) {
      const def = this.#leafDef(column);
      if (!def) continue;
      const value = this.#formulaInput(def, row, open.editor.getValue());
      values.set(column, value);
      const message = this.#validateEdit(def, row, value);
      if (message !== null && !failure) failure = { column, message };
    }
    // Cross-field validation of the whole row (row mode).
    if (!failure && e.row && this.#options.validateRow) {
      const result = this.#options.validateRow(Object.fromEntries(values), row);
      if (typeof result === 'string') failure = { column: e.column, message: result };
      else if (result) {
        const first = Object.entries(result).find(([column]) => e.editors.has(column));
        if (first) failure = { column: first[0], message: first[1] };
      }
    }
    if (failure) {
      if (this.#options.invalidEdit !== 'revert' && how !== 'blur' && how !== 'api') {
        this.#showEditError(failure.column, failure.message);
        return false;
      }
      this.#cancelEdit(how !== 'blur');
      announce(getMessage('dataGrid', 'editDiscarded', { message: failure.message }, this.#config.locale), 'assertive', this.#doc);
      return true;
    }
    const { rowId, column } = e;
    const def = this.#leafDef(column);
    this.#closeEditor();
    const value = values.get(column);
    if (how === 'bulk' && def) {
      const writes = this.#targetRects().flatMap((rect) => this.#cellsOf(rect)).filter((x) => this.#writable(x.def, x.row)).map((x) => {
        if ((x.def.type ?? 'text') === (def.type ?? 'text')) return { rowId: x.rowId, column: x.def.id, value, ok: true };
        const parsed = this.#parseFor(x.def, x.row, this.#cellText(def, value, row));
        return { rowId: x.rowId, column: x.def.id, value: parsed.ok ? parsed.value : null, ok: parsed.ok };
      });
      this.#writeCells(writes.filter((w) => w.ok), 'bulk');
    } else {
      this.#writeCells([...values].map(([c, v]) => ({ rowId, column: c, value: v })), 'edit');
    }
    if (how === 'blur') return true;
    const index = this.#index().get(rowId) ?? 0;
    if (how === 'down') {
      const next = this.#items[Math.min(this.#items.length - 1, index + 1)];
      if (next) this.#moveFocus({ rowId: next.id, column, level: 0 }, true);
    } else if (how === 'next' || how === 'previous') {
      const from = e.row ? ([...e.editors.keys()].at(how === 'next' ? -1 : 0) ?? column) : column;
      const target = this.#nextEditable(rowId, from, how === 'next' ? 1 : -1, e.row);
      if (target) this.#startEditing(target.rowId, target.column, null);
      else this.#moveFocus({ rowId, column, level: 0 }, true);
    } else if (how !== 'move') {
      this.#moveFocus({ rowId, column, level: 0 }, true);
    }
    return true;
  }

  /** Close without writing; `focusCell` returns focus to the cell. */
  #cancelEdit(focusCell: boolean): void {
    const e = this.#editing;
    if (!e) return;
    const { rowId, column } = e;
    this.#closeEditor();
    if (focusCell && this.#index().has(rowId)) this.#moveFocus({ rowId, column, level: 0 }, true);
  }

  #closeEditor(): void {
    const e = this.#editing;
    if (!e) return;
    this.#editing = null;
    e.stopError?.();
    if (e.error.matches(':popover-open')) e.error.hidePopover();
    e.error.remove();
    for (const open of e.editors.values()) {
      open.stopPosition?.();
      open.editor.destroy?.();
      if (open.popup && open.wrapper.matches(':popover-open')) open.wrapper.hidePopover();
      open.wrapper.remove();
      this.#refreshCell(e.rowId, open.column);
    }
    this.#rows.get(e.rowId)?.el.classList.remove('aui-data-grid__row--editing');
    if (!this.#destroyed) this.#renderNow();
  }

  /** The next (or previous) editable cell in display order (the first one of another row in row mode). */
  #nextEditable(rowId: string, column: string, step: 1 | -1, otherRow = false): { rowId: string; column: string } | null {
    const visible = this.#layout.visible;
    const start = this.#index().get(rowId) ?? 0;
    let r = start;
    let c = this.#columnIndex(column);
    // Bounded search: a few rows ahead is enough for a Tab.
    for (let n = 0; n < visible.length * 20; n++) {
      c += step;
      if (c >= visible.length) {
        c = 0;
        r++;
      } else if (c < 0) {
        c = visible.length - 1;
        r--;
      }
      const item = this.#items[r];
      if (!item) return null;
      if (otherRow && r === start) continue;
      const id = visible[c]?.leaf.id;
      if (id !== undefined && this.#editableAt(item.id, id)) return { rowId: item.id, column: id };
    }
    return null;
  }

  // ---- Row grouping (G5a) --------------------------------------------------------------------------

  /** Grouped column ids (known columns only). */
  #groupBy(): string[] {
    if (this.#options.treeData) return [];
    const pivot = this.#pivot();
    if (pivot) return [...pivot.rows];
    const known = new Set(this.#leaves.map((l) => l.id));
    return (this.#options.groupBy ?? []).filter((id, i, all) => known.has(id) && all.indexOf(id) === i);
  }

  #grouped(): boolean {
    return Boolean(this.#options.treeData) || Boolean(this.#options.pivot) || (this.#options.groupBy ?? []).length > 0;
  }

  #groupColumnIndex(): number {
    // The last generated group column (one per level with groupDisplay 'columns').
    return this.#layout.visible.findLastIndex((c) => isGroupColumn(c.leaf.id));
  }

  /** The generated group column: key, count, and expansion of group rows; indentation of their rows. */
  /** The levels of the current grouping (date hierarchies add a level per date part). */
  #groupLevelSpecs(leaves: readonly Leaf<Row>[] = this.#leaves): { column: string; part: DataGridDatePart | undefined }[] {
    const known = new Map(leaves.map((l) => [l.id, l.def]));
    if (this.#options.treeData) return [];
    const ids = (this.#options.pivot ? this.#options.pivot.rows : (this.#options.groupBy ?? [])).filter((id, i, all) => known.has(id) && all.indexOf(id) === i);
    return ids.flatMap((id): { column: string; part: DataGridDatePart | undefined }[] => {
      const def = known.get(id);
      const parts = def?.groupHierarchy && (def.type === 'date' || def.type === 'datetime') ? def.groupHierarchy : [];
      return parts.length > 0 ? parts.map((part) => ({ column: id, part })) : [{ column: id, part: undefined }];
    });
  }

  /** The level a per-level group column shows (null for the single group column). */
  #groupColumnLevel(id: string): number | null {
    return id === GROUP_COLUMN ? null : Number(id.slice(GROUP_COLUMN.length + 1));
  }

  /** The generated group column, or one per level (`groupDisplay: 'columns'`, named after the grouped columns). */
  #groupColumns(leaves: readonly Leaf<Row>[]): DataGridColumn<Row>[] {
    if (this.#groupRowsMode()) return [];
    const g = this.#options.groupColumn;
    const base = { sortable: false, movable: false, searchable: false, pinned: 'start' as const, lockPinned: true, lockPosition: 'start' as const };
    if (this.#options.groupDisplay !== 'columns' || this.#options.treeData) {
      const tree = this.#options.treeData;
      const treeHeader = tree ? leaves.find((l) => l.id === tree.label)?.def.header : undefined;
      return [{ ...base, id: GROUP_COLUMN, header: g?.header ?? treeHeader ?? getMessage('dataGrid', 'groupColumn', {}, this.#config.locale), width: g?.width ?? 240, render: (_row, context) => this.#groupCell(context.rowId, null) }];
    }
    return this.#groupLevelSpecs(leaves).map((spec, level) => {
      const header = leaves.find((l) => l.id === spec.column)?.def.header ?? spec.column;
      const part = spec.part ? getMessage('dataGrid', `part${spec.part.charAt(0).toUpperCase()}${spec.part.slice(1)}`, {}, this.#config.locale) : null;
      return { ...base, id: `${GROUP_COLUMN}:${String(level)}`, header: part ? `${header} (${part})` : header, width: g?.width ?? 180, render: (_row, context) => this.#groupCell(context.rowId, level) };
    });
  }

  #displayOf(rowId: string): DisplayRow<Row> | undefined {
    if (rowId.startsWith('sticky:')) return this.#displayOf(rowId.slice(7));
    const pinned = this.#pinnedById.get(rowId);
    if (pinned) return pinned.display;
    const index = this.#index().get(rowId);
    return index === undefined ? undefined : this.#items[index]?.display;
  }

  /** Text of a group's key, formatted like its column ("(Blanks)" for blanks). */
  #groupKeyText(node: GroupNode<Row>): string {
    const locale = this.#config.locale;
    if (this.#options.treeData) return node.key === '' ? getMessage('dataGrid', 'groupBlank', {}, locale) : String(node.key);
    const def = this.#leafDef(node.column);
    const first = node.leaves[0] ?? node.lazy?.row;
    if (node.key === null || !def || !first) return getMessage('dataGrid', 'groupBlank', {}, locale);
    if (node.part && typeof node.key === 'number') return this.#datePartText(node.key, node.part);
    return this.#cellText(def, node.key, first.row);
  }

  /** A group column cell; `column` is the level of a per-level column (null: the single column, indented by level). */
  #groupCell(rowId: string, column: number | null): HTMLElement {
    const doc = this.#doc;
    const locale = this.#config.locale;
    const display = this.#displayOf(rowId);
    const span = doc.createElement('span');
    span.className = 'aui-data-grid__group-cell';
    const level = display?.kind === 'group' ? display.node.level : display?.kind === 'data' ? display.level : display?.kind === 'total' ? (display.node ? display.node.level + 1 : 0) : 0;
    span.style.setProperty('--aui-data-grid-group-level', String(column === null ? level : 0));
    // Per-level columns: a group row shows its key in its level's column; totals in the first.
    if (column !== null && ((display?.kind === 'group' && display.node.level !== column) || (display?.kind === 'total' && column !== 0))) return span;
    if (display?.kind === 'group') {
      const toggle = doc.createElement('span');
      toggle.className = this.#expandable(display.node) ? 'aui-data-grid__group-toggle' : 'aui-data-grid__group-spacer';
      toggle.setAttribute('aria-hidden', 'true');
      toggle.append(renderIcon(display.expanded ? (this.#options.icons?.collapse ?? 'chevron-down') : (this.#options.icons?.expand ?? 'chevron-right'), { className: 'aui-data-grid__group-icon', doc }));
      const label = doc.createElement('span');
      label.className = 'aui-data-grid__text';
      const count = this.#groupCount(display.node);
      label.textContent = count === null ? this.#groupKeyText(display.node) : getMessage('dataGrid', 'groupLabel', { group: this.#groupKeyText(display.node), count: formatNumber(count, {}, locale) }, locale);
      span.append(toggle, label);
    } else if (display?.kind === 'data' && this.#options.treeData) {
      const spacer = doc.createElement('span');
      spacer.className = 'aui-data-grid__group-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      spacer.append(renderIcon(this.#options.icons?.expand ?? 'chevron-right', { className: 'aui-data-grid__group-icon', doc }));
      const label = doc.createElement('span');
      label.className = 'aui-data-grid__text';
      label.textContent = this.#treeItemLabel(display.item);
      span.append(spacer, label);
    } else if (display?.kind === 'total') {
      span.classList.add('aui-data-grid__group-cell--total');
      span.textContent = display.node ? getMessage('dataGrid', 'groupTotalOf', { group: this.#groupKeyText(display.node) }, locale) : getMessage('dataGrid', 'groupTotal', {}, locale);
    }
    return span;
  }

  /** An aggregate shown in a group or total row, formatted like its column. */
  #aggregateText(def: DataGridColumn<Row>, display: DisplayRow<Row>): string {
    if (!def.aggregate) return '';
    const values = display.kind === 'group' ? display.node.aggregates : display.kind === 'total' ? (display.node ? display.node.aggregates : this.#grand) : null;
    const value = values?.get(def.id);
    if (value === null || value === undefined) return '';
    const first = display.kind === 'group' ? (display.node.leaves[0] ?? display.node.lazy?.row) : display.kind === 'total' && display.node ? display.node.leaves[0] : this.#sorted[0];
    // Counts are plain numbers whatever the column type.
    if (def.aggregate === 'count' && typeof value === 'number') return formatNumber(value, {}, this.#config.locale);
    if (def.showAs && typeof value === 'number') {
      // A percentage of the grand total, or of the parent group (the grand total for top-level groups).
      const node = display.kind === 'group' ? display.node : display.kind === 'total' ? display.node : null;
      const parent = def.showAs === 'percentOfParent' ? node?.parent : null;
      const base = (parent ? parent.aggregates : this.#grandAll).get(def.id);
      return typeof base === 'number' && base !== 0 ? formatNumber(value / base, { style: 'percent', maximumFractionDigits: 1 }, this.#config.locale) : '';
    }
    return first ? this.#cellText(def, value, first.row) : plainText(value);
  }

  /** Text of a display item's cell (copy): aggregates and group labels for group and total rows. */
  #itemText(item: GridItem<Row>, def: DataGridColumn<Row>): string {
    const display = item.display;
    if (isGroupColumn(def.id)) {
      const level = this.#groupColumnLevel(def.id);
      if (display?.kind === 'group') return level === null || level === display.node.level ? this.#groupKeyText(display.node) : '';
      if (display?.kind === 'total') return display.node ? getMessage('dataGrid', 'groupTotalOf', { group: this.#groupKeyText(display.node) }, this.#config.locale) : getMessage('dataGrid', 'groupTotal', {}, this.#config.locale);
      return display?.kind === 'data' && this.#options.treeData ? this.#treeItemLabel(display.item) : '';
    }
    if (display && display.kind !== 'data' && !(display.kind === 'group' && display.node.item && !def.aggregate)) return this.#aggregateText(def, display);
    return this.#copyText(def, this.#displayRow(item));
  }

  /** Build the group tree over the filtered, sorted rows and flatten it for the current expansion. */
  #regroup(): void {
    const tree = this.#options.treeData;
    if (tree) {
      this.#retree(tree);
      return;
    }
    this.#tree = null;
    this.#treeOrphans = [];
    const pivot = this.#pivot();
    if (pivot) {
      this.#repivot(pivot);
      return;
    }
    if (this.#pivotDefs.length > 0) this.#setPivotColumns([]);
    const groupBy = this.#groupBy();
    if (groupBy.length === 0) {
      this.#groups = [];
      const total = this.#options.grandTotal ?? null;
      // Flat rows: a grand total row (at the top, the bottom, or pinned) when asked for.
      this.#grandAll = total === null ? new Map<string, unknown>() : grandTotals(this.#sorted, this.#aggregateColumns());
      this.#grand = total === null ? null : this.#grandAll;
      const first = this.#sorted[0];
      const grand = (): GridItem<Row>[] => (first ? [{ row: first.row, id: 'total:grand', index: -1, display: { kind: 'total', node: null, id: 'total:grand' } }] : []);
      this.#display = total === 'top' ? [...grand(), ...this.#sorted] : total === 'bottom' ? [...this.#sorted, ...grand()] : this.#sorted;
      return;
    }
    const levels = this.#levelsFor(groupBy);
    const aggregates = this.#aggregateColumns();
    this.#groups = buildGroups(this.#sorted, levels, aggregates);
    this.#finishGroups(levels, aggregates);
  }

  /** Group levels of columns (a date hierarchy adds a level per date part), in each column's sort direction. */
  #levelsFor(ids: readonly string[]): GroupLevel<Row>[] {
    const collator = new Intl.Collator(this.#config.locale, { numeric: true });
    return ids.flatMap((id): GroupLevel<Row>[] => {
      const def = this.#leafDef(id);
      const accessor = this.#engineColumns.get(id)?.accessor;
      const text = (def?.type ?? 'text') === 'text';
      const direction = this.#sorts.find((s) => s.column === id)?.direction ?? 'ascending';
      const parts = def?.groupHierarchy && (def.type === 'date' || def.type === 'datetime') ? def.groupHierarchy : [];
      // A date hierarchy expands one grouped column into a level per date part.
      if (parts.length > 0) return parts.map((part) => ({ column: id, part, key: (row: Row) => this.#datePart(accessor?.(row), part), compare: compareValues, direction }));
      return [{ column: id, key: (row: Row) => accessor?.(row), compare: text ? (a, b) => collator.compare(String(a), String(b)) : compareValues, direction }];
    });
  }

  #finishGroups(levels: readonly GroupLevel<Row>[], aggregates: readonly AggregateColumn<Row>[]): void {
    const filteredOnly = this.#options.aggregateFilteredOnly !== false;
    if (!filteredOnly) {
      // Aggregates of every row of each group, filtered out or not.
      const all = new Map<string, Map<string, unknown>>();
      const collect = (nodes: readonly GroupNode<Row>[]): void => {
        for (const n of nodes) {
          all.set(n.id, n.aggregates);
          collect(n.groups);
        }
      };
      collect(buildGroups(this.#source, levels, aggregates));
      const apply = (nodes: readonly GroupNode<Row>[]): void => {
        for (const n of nodes) {
          const full = all.get(n.id);
          if (full) for (const [k, v] of full) n.aggregates.set(k, v);
          apply(n.groups);
        }
      };
      apply(this.#groups);
    }
    this.#grandAll = grandTotals(filteredOnly ? this.#sorted : this.#source, aggregates);
    this.#grand = (this.#options.grandTotal ?? null) ? this.#grandAll : null;
    this.#flatten();
  }

  #aggregateColumns(): AggregateColumn<Row>[] {
    return this.#leaves.flatMap((l) => {
      const aggregate = l.def.aggregate;
      const accessor = this.#engineColumns.get(l.id)?.accessor;
      return aggregate && accessor ? [{ column: l.id, aggregate, read: accessor }] : [];
    });
  }

  /** How rows place in the tree. */
  #treeRelation(tree: DataGridTreeData<Row>): TreeRelation<Row> {
    const getPath = tree.getPath;
    if (getPath) {
      return {
        kind: 'path',
        path: (row) => {
          const path: unknown = getPath(row);
          if (!(Array.isArray(path) && path.length <= 100 && path.every((p) => typeof p === 'string'))) fail('treeData.getPath', 'function returning an array of at most 100 strings');
          return path;
        },
      };
    }
    const field = tree.parentIdField;
    if (field) {
      return {
        kind: 'parent',
        parentId: (row) => {
          const value = fieldOf(row, field);
          return typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
        },
      };
    }
    return { kind: 'parent', parentId: (_row, id) => this.#treeParent.get(id) ?? null };
  }

  /** The label of a tree row: the last path element, or the label column's text. */
  #treeItemLabel(item: Item<Row>): string {
    const tree = this.#options.treeData;
    if (tree?.getPath) {
      const path: unknown = tree.getPath(item.row);
      const last: unknown = Array.isArray(path) ? path.at(-1) : undefined;
      return typeof last === 'string' ? last : '';
    }
    const def = tree?.label ? this.#leafDef(tree.label) : undefined;
    return def ? this.#cellText(def, this.#engineColumns.get(def.id)?.accessor(item.row), item.row) : this.#rowName(item.row, item.id);
  }

  /** Build the tree over every row (filtering keeps ancestors or subtrees) and flatten it. */
  #retree(tree: DataGridTreeData<Row>): void {
    const collator = new Intl.Collator(this.#config.locale, { numeric: true });
    const aggregates = this.#aggregateColumns();
    const built = buildTree(this.#source, this.#treeRelation(tree), {
      pass: this.#treePass,
      mode: this.#options.treeFilter ?? 'ancestors',
      rank: this.#treeRank,
      compareKeys: (a, b) => collator.compare(a, b),
      aggregates,
    });
    this.#treeOrphans = built.orphans;
    const { groups, byNode } = treeGroups(built.roots, (n) => (n.item ? this.#treeItemLabel(n.item) : n.key));
    this.#groups = groups;
    this.#tree = { roots: built.roots, byNode };
    this.#grandAll = grandTotals(built.roots.flatMap((n) => n.leaves), aggregates);
    this.#grand = (this.#options.grandTotal ?? null) ? this.#grandAll : null;
    this.#flatten();
  }

  /** The pivot with known columns only (rows and columns distinct; values of known columns), or null. */
  #pivot(): DataGridPivot | null {
    const pivot = this.#options.pivot;
    if (!pivot || this.#options.treeData) return null;
    const known = new Set(this.#leaves.filter((l) => !isGeneratedColumn(l.id)).map((l) => l.id));
    const rows = [...new Set(pivot.rows)].filter((id) => known.has(id));
    const columns = [...new Set(pivot.columns)].filter((id) => known.has(id) && !rows.includes(id));
    return { rows, columns, values: pivot.values.filter((v) => known.has(v.column)) };
  }

  /** Pivot rows (group rows of the row fields, without data rows), result columns, and their aggregates. */
  #repivot(pivot: DataGridPivot): void {
    const rowLevels = this.#levelsFor(pivot.rows);
    const columnLevels = this.#levelsFor(pivot.columns);
    const values = pivot.values.flatMap((v) => {
      const read = this.#engineColumns.get(v.column)?.accessor;
      return read ? [{ ...v, read }] : [];
    });
    const rows = buildGroups(this.#sorted, rowLevels, []);
    const columns = buildGroups(this.#sorted, columnLevels, []);
    // Pivot rows are aggregates only: the last level lists no data rows.
    const strip = (nodes: readonly GroupNode<Row>[]): void => {
      for (const n of nodes) {
        if (n.groups.length === 0) n.items.length = 0;
        else strip(n.groups);
      }
    };
    strip(rows);
    const pathOf = (node: GroupNode<Row>): string[] => {
      const out: string[] = [];
      for (let n: GroupNode<Row> | null = node; n; n = n.parent) out.unshift(keyId(n.key));
      return out;
    };
    const parents = (nodes: readonly GroupNode<Row>[], out: string[][]): string[][] => {
      for (const n of nodes) {
        if (n.groups.length === 0) continue;
        out.push(pathOf(n));
        parents(n.groups, out);
      }
      return out;
    };
    const cells = pivotCells(this.#sorted, rowLevels, columnLevels, values, parents(rows, [[]]), parents(columns, [[]]));
    const { defs, leaves } = this.#pivotColumns(columns, pivot, pathOf);
    const fill = (target: Map<string, unknown>, rowPath: readonly string[]): void => {
      for (const leaf of leaves) target.set(leaf.id, cells.get(cellKey(rowPath, leaf.path))?.[leaf.value] ?? null);
    };
    const walk = (nodes: readonly GroupNode<Row>[]): void => {
      for (const n of nodes) {
        fill(n.aggregates, pathOf(n));
        walk(n.groups);
      }
    };
    walk(rows);
    this.#groups = rows;
    this.#grandAll = new Map();
    fill(this.#grandAll, []);
    this.#grand = pivot.rows.length === 0 || (this.#options.grandTotal ?? null) !== null ? this.#grandAll : null;
    this.#setPivotColumns(defs);
    if (pivot.rows.length === 0) {
      // No row fields: one row of grand totals.
      const first = this.#sorted[0];
      this.#display = first ? [{ row: first.row, id: 'total:grand', index: -1, display: { kind: 'total', node: null, id: 'total:grand' } }] : [];
      return;
    }
    this.#flatten();
  }

  /** The generated result columns: a column group per column key (nested by level), a value column per value under each, and totals. */
  #pivotColumns(columns: readonly GroupNode<Row>[], pivot: DataGridPivot, pathOf: (node: GroupNode<Row>) => string[]): { defs: DataGridColumnDef<Row>[]; leaves: { id: string; path: readonly string[]; value: number }[] } {
    const locale = this.#config.locale;
    const max = this.#options.pivotMaxColumns ?? 1000;
    const leaves: { id: string; path: readonly string[]; value: number }[] = [];
    const perPath = pivot.values.length;
    const valueColumns = (path: readonly string[], pathId: string): DataGridColumnDef<Row>[] =>
      pivot.values.map((v, i) => {
        const id = `${PIVOT_PREFIX}:${pathId}:${String(i)}`;
        leaves.push({ id, path, value: i });
        return this.#pivotLeaf(id, v);
      });
    let total = 0;
    const count = (nodes: readonly GroupNode<Row>[]): void => {
      for (const n of nodes) {
        if (n.groups.length > 0) count(n.groups);
        else total += perPath;
      }
    };
    count(columns);
    const build = (nodes: readonly GroupNode<Row>[]): DataGridColumnDef<Row>[] =>
      nodes.flatMap((n): DataGridColumnDef<Row>[] => {
        if (leaves.length + perPath > max) return [];
        const path = pathOf(n);
        const pathId = encodeURIComponent(JSON.stringify(path));
        const children = n.groups.length > 0 ? build(n.groups) : valueColumns(path, pathId);
        return children.length > 0 ? [{ id: `${PIVOT_PREFIX}-group:${pathId}`, header: this.#groupKeyText(n), children }] : [];
      });
    const defs = build(columns);
    const shown = leaves.length;
    this.#pivotTruncated = shown < total ? { shown, total } : null;
    if (perPath > 0) {
      // Grand total columns: a "Total" group after the column groups (the value columns themselves without column fields).
      const totals = valueColumns([], 'total');
      if (pivot.columns.length > 0) defs.push({ id: `${PIVOT_PREFIX}-group:total`, header: getMessage('dataGrid', 'pivotTotal', {}, locale), children: totals });
      else defs.push(...totals);
    }
    return { defs, leaves };
  }

  /** A result column: the aggregate of a value column, formatted like it (counts as plain numbers). */
  #pivotLeaf(id: string, value: DataGridPivotValue): DataGridColumn<Row> {
    const locale = this.#config.locale;
    const def = this.#leafDef(value.column);
    const counting = value.aggregate === 'count' || value.aggregate === 'distinctCount';
    const currency = !counting && def?.type === 'currency' && def.currency !== undefined ? def.currency : undefined;
    const aggregate = getMessage('dataGrid', `aggregate${value.aggregate.charAt(0).toUpperCase()}${value.aggregate.slice(1)}`, {}, locale);
    return {
      id,
      header: getMessage('dataGrid', 'pivotValue', { aggregate, column: def?.header ?? value.column }, locale),
      type: currency ? 'currency' : 'number',
      ...(currency ? { currency } : {}),
      width: 150,
      sortable: false,
      movable: false,
      searchable: false,
      aggregate: counting ? 'count' : 'sum',
    };
  }

  /** Install changed result columns (the header re-renders after the first render). */
  #setPivotColumns(defs: DataGridColumnDef<Row>[]): void {
    const signature = JSON.stringify(defs);
    if (signature === this.#pivotSignature) return;
    this.#pivotSignature = signature;
    this.#pivotDefs = defs;
    this.#applyColumns(this.#options.columns, false);
    if (this.#pivotTruncated) {
      const locale = this.#config.locale;
      announce(getMessage('dataGrid', 'pivotTruncated', { shown: formatNumber(this.#pivotTruncated.shown, {}, locale), total: formatNumber(this.#pivotTruncated.total, {}, locale) }, locale), 'polite', this.#doc);
    }
    if (!this.#ready) return;
    this.#generation++;
    this.#renderHeader();
  }

  /** Set the pivot (by the user: announced and emitted). */
  #setPivot(pivot: DataGridPivot | null, user: boolean): void {
    this.#options = { ...this.#options, pivot };
    this.#applyColumns(this.#options.columns, false);
    this.#applyHostOptions();
    this.#sortRows();
    this.#relayout(null);
    this.#renderPivotPanel();
    if (!user) return;
    const locale = this.#config.locale;
    const name = (id: string): string => this.#leafDef(id)?.header ?? id;
    const none = getMessage('dataGrid', 'pivotEmpty', {}, locale);
    const list = (ids: readonly string[]): string => (ids.length > 0 ? ids.map(name).join(', ') : none);
    if (pivot) announce(getMessage('dataGrid', 'pivotChanged', { rows: list(pivot.rows), columns: list(pivot.columns), values: list(pivot.values.map((v) => v.column)) }, locale), 'polite', this.#doc);
    emit(this.host, 'aui-pivot-change', { pivot } satisfies DataGridPivotChangeDetail);
  }

  /** The pivot panel: a zone per area with pills (move, remove; an aggregate per value) and a picker to add. */
  #renderPivotPanel(): void {
    const doc = this.#doc;
    const locale = this.#config.locale;
    const msg = (k: string, params: Readonly<Record<string, string | number>> = {}): string => getMessage('dataGrid', k, params, locale);
    const pivot = this.#pivot();
    if (this.#options.pivotPanel !== true || !pivot) {
      this.#pivotPanel?.remove();
      this.#pivotPanel = null;
      if (this.#toolbar && this.#toolbar.childElementCount === 0) {
        this.#toolbar.remove();
        this.#toolbar = null;
      }
      return;
    }
    let panel = this.#pivotPanel;
    if (!panel) {
      panel = doc.createElement('div');
      panel.className = 'aui-data-grid__group-panel aui-data-grid__pivot-panel';
      panel.setAttribute('role', 'group');
      this.#ensureToolbar().prepend(panel);
      this.#pivotPanel = panel;
    }
    panel.setAttribute('aria-label', msg('pivotPanel'));
    const users = this.#leaves.filter((l) => !isGeneratedColumn(l.id));
    const name = (id: string): string => this.#leafDef(id)?.header ?? id;
    const commit = (next: DataGridPivot, zone: string, index: number): void => {
      this.#setPivot(next, true);
      const area = this.#pivotPanel?.querySelector<HTMLElement>(`[data-zone="${zone}"]`);
      const pill = area?.querySelector<HTMLElement>(`[data-index="${String(Math.max(0, index))}"] .aui-data-grid__group-pill-button:not(:disabled)`);
      (pill ?? area?.querySelector<HTMLElement>('select:last-of-type'))?.focus();
    };
    const button = (text: string, icon: string, onClick: () => void, disabled: boolean): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-data-grid__group-pill-button';
      b.setAttribute('aria-label', text);
      b.title = text;
      b.disabled = disabled;
      b.append(renderIcon(icon, { className: 'aui-data-grid__group-pill-icon', doc }));
      b.addEventListener('click', onClick);
      return b;
    };
    const picker = (label: string, ids: readonly string[], onPick: (id: string) => void): HTMLSelectElement | null => {
      if (ids.length === 0) return null;
      const select = doc.createElement('select');
      select.className = 'aui-data-grid__filter-control aui-data-grid__group-add';
      select.setAttribute('aria-label', label);
      const placeholder = doc.createElement('option');
      placeholder.value = '';
      placeholder.textContent = msg('groupAddPlaceholder');
      select.append(placeholder, ...ids.map((id) => Object.assign(doc.createElement('option'), { value: id, textContent: name(id) })));
      select.addEventListener('change', () => {
        if (select.value !== '') onPick(select.value);
      });
      return select;
    };
    const zone = (key: 'rows' | 'columns' | 'values', title: string, entries: readonly string[], change: (list: string[], values?: DataGridPivotValue[]) => DataGridPivot, candidates: readonly string[]): HTMLElement => {
      const area = doc.createElement('div');
      area.className = 'aui-data-grid__pivot-zone';
      area.dataset.zone = key;
      area.setAttribute('role', 'group');
      area.setAttribute('aria-label', title);
      const label = doc.createElement('span');
      label.className = 'aui-data-grid__group-panel-label';
      label.textContent = title;
      area.append(label);
      const list = doc.createElement('ul');
      list.className = 'aui-data-grid__group-pills';
      const values = pivot.values;
      entries.forEach((id, i) => {
        const column = name(id);
        const li = doc.createElement('li');
        li.className = 'aui-data-grid__group-pill';
        li.dataset.index = String(i);
        li.dataset.column = id;
        const text = doc.createElement('span');
        text.textContent = column;
        li.append(text);
        const value = key === 'values' ? values[i] : undefined;
        if (value) {
          const select = doc.createElement('select');
          select.className = 'aui-data-grid__filter-control aui-data-grid__pivot-aggregate';
          select.setAttribute('aria-label', msg('pivotAggregateOf', { column }));
          select.append(...PIVOT_AGGREGATES.map((a) => Object.assign(doc.createElement('option'), { value: a, textContent: msg(`aggregate${a.charAt(0).toUpperCase()}${a.slice(1)}`), selected: a === value.aggregate })));
          select.addEventListener('change', () => {
            const aggregate = PIVOT_AGGREGATES.find((a) => a === select.value);
            if (!aggregate) return;
            this.#setPivot({ ...pivot, values: values.map((v, j) => (j === i ? { column: v.column, aggregate } : v)) }, true);
            this.#pivotPanel?.querySelector<HTMLSelectElement>(`[data-zone="values"] [data-index="${String(i)}"] select`)?.focus();
          });
          li.append(select);
        }
        const move = (delta: number): void => {
          const next = [...entries];
          const [moved] = next.splice(i, 1);
          if (moved === undefined) return;
          next.splice(i + delta, 0, moved);
          const nextValues = [...values];
          const [mv] = nextValues.splice(i, 1);
          if (mv) nextValues.splice(i + delta, 0, mv);
          commit(change(next, key === 'values' ? nextValues : undefined), key, i + delta);
        };
        li.append(
          button(msg('pivotMoveEarlier', { column, zone: title }), 'chevron-left', () => {
            move(-1);
          }, i === 0),
          button(msg('pivotMoveLater', { column, zone: title }), 'chevron-right', () => {
            move(1);
          }, i === entries.length - 1),
          button(msg('pivotRemove', { column, zone: title }), 'close', () => {
            commit(change(entries.filter((_x, j) => j !== i), key === 'values' ? values.filter((_x, j) => j !== i) : undefined), key, i - 1);
          }, false),
        );
        list.append(li);
      });
      if (entries.length > 0) area.append(list);
      else {
        const empty = doc.createElement('span');
        empty.className = 'aui-data-grid__group-panel-empty';
        empty.textContent = msg('pivotEmpty');
        area.append(empty);
      }
      const add = picker(msg('pivotAdd', { zone: title }), candidates, (id) => {
        const numeric = this.#leafDef(id)?.type === 'number' || this.#leafDef(id)?.type === 'currency';
        commit(change([...entries, id], key === 'values' ? [...values, { column: id, aggregate: numeric ? 'sum' : 'count' }] : undefined), key, entries.length);
      });
      if (add) area.append(add);
      return area;
    };
    const axis = users.filter((l) => !pivot.rows.includes(l.id) && !pivot.columns.includes(l.id)).map((l) => l.id);
    panel.replaceChildren(
      zone('rows', msg('pivotRows'), pivot.rows, (rows) => ({ ...pivot, rows }), axis),
      zone('columns', msg('pivotColumns'), pivot.columns, (columns) => ({ ...pivot, columns }), axis),
      zone('values', msg('pivotValues'), pivot.values.map((v) => v.column), (_list, values) => ({ ...pivot, values: values ?? pivot.values }), users.map((l) => l.id)),
    );
  }

  /** A group row that can expand (pivot rows of the last level cannot). */
  #expandable(node: GroupNode<Row>): boolean {
    return node.groups.length > 0 || node.items.length > 0 || node.item !== undefined || node.lazy !== undefined;
  }

  /** The display rows for the current expansion (no regrouping). */
  #flatten(): void {
    if (this.#server) {
      this.#serverSync();
      return;
    }
    this.#display = this.#displayItems(false);
  }

  /** The display rows of the group tree: as expanded, or with every group expanded (exports). */
  #displayItems(expandAll: boolean): GridItem<Row>[] {
    const opened = this.#options.groupDefaultExpanded ?? 0;
    const flatten = { expanded: (node: { readonly id: string; readonly level: number }) => expandAll || (this.#expanded.get(node.id) ?? (opened === -1 || node.level < opened)), groupTotals: this.#options.groupTotals === 'bottom' };
    const rows = this.#tree ? flattenTree(this.#tree.roots, this.#tree.byNode, flatten) : flattenGroups(this.#groups, flatten);
    const first = this.#sorted[0];
    const items: GridItem<Row>[] = [];
    if (this.#options.grandTotal === 'top' && first) items.push({ row: first.row, id: 'total:grand', index: -1, display: { kind: 'total', node: null, id: 'total:grand' } });
    for (const d of rows) {
      if (d.kind === 'data') items.push({ ...d.item, display: d });
      else if (d.kind === 'group' && d.node.item) items.push({ ...d.node.item, display: d });
      else if (d.kind === 'group') {
        const leaf = d.node.leaves[0];
        if (leaf) items.push({ row: leaf.row, id: d.node.id, index: -1, display: d });
      } else if (d.kind === 'total') {
        const leaf = d.node?.leaves[0] ?? first;
        if (leaf) items.push({ row: leaf.row, id: d.id, index: -1, display: d });
      }
    }
    if (this.#options.grandTotal === 'bottom' && first) items.push({ row: first.row, id: 'total:grand', index: -1, display: { kind: 'total', node: null, id: 'total:grand' } });
    return items;
  }

  /** Row attributes of a display row: tree levels and expansion while grouped. */
  #paintGroupRow(el: HTMLElement, item: GridItem<Row>): void {
    const d = item.display;
    el.classList.toggle('aui-data-grid__row--loading', d?.kind === 'loading');
    if (d?.kind === 'loading') el.setAttribute('aria-busy', String(d.failed === null));
    else el.removeAttribute('aria-busy');
    // A tree parent with its own row looks like a data row (with a toggle).
    el.classList.toggle('aui-data-grid__row--group', d?.kind === 'group' && !d.node.item);
    el.classList.toggle('aui-data-grid__row--total', d?.kind === 'total');
    // Tree attributes belong to treegrids only (a flat grid's total row has none).
    if (!d || d.kind === 'loading' || (!this.#grouped() && !this.#options.detail)) {
      for (const a of ['aria-level', 'aria-expanded', 'aria-setsize', 'aria-posinset']) el.removeAttribute(a);
      // Loading rows of server groups keep their tree level.
      if (d?.kind === 'loading' && this.#grouped()) el.setAttribute('aria-level', String(d.level + 1));
      return;
    }
    const level = d.kind === 'group' ? d.node.level + 1 : d.kind === 'data' ? d.level + 1 : d.kind === 'detail' ? d.level + 1 : d.node ? d.node.level + 2 : 1;
    el.setAttribute('aria-level', String(level));
    if (d.kind === 'group' && this.#expandable(d.node)) el.setAttribute('aria-expanded', String(d.expanded));
    else el.removeAttribute('aria-expanded');
    if (d.kind === 'total' || d.kind === 'detail') {
      el.removeAttribute('aria-setsize');
      el.removeAttribute('aria-posinset');
    } else {
      el.setAttribute('aria-setsize', String(d.size));
      el.setAttribute('aria-posinset', String(d.position));
    }
  }

  /** Rows below a group (server groups: `getChildCount`, or null when unknown). */
  #groupCount(node: GroupNode<Row>): number | null {
    return node.lazy ? node.lazy.count : node.leaves.length;
  }

  /** Expand or collapse a group row (by the user: announced and emitted). */
  #toggleRowGroup(node: GroupNode<Row>, expanded: boolean): void {
    this.#expanded.set(node.id, expanded);
    this.#flatten();
    this.#paginate();
    this.#generation++;
    this.#renderNow();
    this.#focusTarget()?.focus({ preventScroll: true });
    const locale = this.#config.locale;
    const group = this.#groupKeyText(node);
    const count = this.#groupCount(node);
    announce(expanded ? (count === null ? getMessage('dataGrid', 'rowGroupExpandedOnly', { group }, locale) : getMessage('dataGrid', 'rowGroupExpanded', { group, count: formatNumber(count, {}, locale) }, locale)) : getMessage('dataGrid', 'rowGroupCollapsed', { group }, locale), 'polite', this.#doc);
    emit(this.host, 'aui-row-group-toggle', { groupId: node.id, expanded } satisfies DataGridRowGroupToggleDetail);
  }

  /** The number for a date part of a date or instant value (in the grid's time zone), or null. */
  #datePart(value: unknown, part: DataGridDatePart): number | null {
    const d = isPlainDate(value) ? value : isInstantLike(value) ? toPlainDateTime(value, this.#config.timezone).date : null;
    if (!d) return null;
    switch (part) {
      case 'year':
        return d.year;
      case 'quarter':
        return d.year * 10 + Math.floor((d.month - 1) / 3) + 1;
      case 'month':
        return d.year * 100 + d.month;
      case 'day':
        return d.year * 10_000 + d.month * 100 + d.day;
      case 'week': {
        // ISO 8601 weeks: the week with the year's first Thursday is week 1.
        const t = Date.UTC(d.year, d.month - 1, d.day);
        const weekday = (new Date(t).getUTCDay() + 6) % 7;
        const thursday = new Date(t + (3 - weekday) * 86_400_000);
        const year = thursday.getUTCFullYear();
        const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * 86_400_000)) + 1;
        return year * 100 + week;
      }
    }
  }

  #datePartText(key: number, part: DataGridDatePart): string {
    const locale = this.#config.locale;
    const plain = { useGrouping: false };
    switch (part) {
      case 'year':
        return formatNumber(key, plain, locale);
      case 'quarter':
        return getMessage('dataGrid', 'quarterOf', { quarter: key % 10, year: formatNumber(Math.floor(key / 10), plain, locale) }, locale);
      case 'month':
        return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(Math.floor(key / 100), (key % 100) - 1, 1));
      case 'week':
        return getMessage('dataGrid', 'weekOf', { week: key % 100, year: formatNumber(Math.floor(key / 100), plain, locale) }, locale);
      case 'day':
        return formatPlainDate(plainDate(Math.floor(key / 10_000), Math.floor(key / 100) % 100, key % 100), { dateStyle: 'medium' }, locale);
    }
  }

  /** Change the row groups; `user` changes (the group panel) are announced and emitted. */
  #setGroupBy(groupBy: readonly string[], user: boolean): void {
    const next = [...new Set(groupBy)];
    this.#options = { ...this.#options, groupBy: next };
    this.#applyColumns(this.#options.columns, false);
    this.#applyHostOptions();
    this.#sortRows();
    this.#renderGroupPanel();
    this.#generation++;
    this.#renderHeader();
    this.#renderNow();
    if (!user) return;
    const locale = this.#config.locale;
    const names = next.map((id) => this.#leafDef(id)?.header ?? id).join(', ');
    announce(next.length > 0 ? getMessage('dataGrid', 'groupedBy', { columns: names }, locale) : getMessage('dataGrid', 'ungrouped', {}, locale), 'polite', this.#doc);
    emit(this.host, 'aui-group-change', { groupBy: next } satisfies DataGridGroupChangeDetail);
  }

  /** Columns the group panel may add: groupable ones not grouped yet. */
  #canGroup(id: string): boolean {
    const def = this.#leafDef(id);
    return def !== undefined && !isGeneratedColumn(id) && def.groupable === true && !this.#groupBy().includes(id);
  }

  #overGroupPanel(x: number, y: number): boolean {
    const panel = this.#groupPanel;
    if (!panel?.isConnected) return false;
    const r = panel.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /** The group panel: a pill per row group (move earlier, move later, remove) and a picker to add one. */
  #renderGroupPanel(): void {
    const doc = this.#doc;
    const locale = this.#config.locale;
    const msg = (k: string, params: Readonly<Record<string, string | number>> = {}): string => getMessage('dataGrid', k, params, locale);
    if (this.#options.groupPanel !== true || this.#options.treeData || this.#options.pivot) {
      this.#groupPanel?.remove();
      this.#groupPanel = null;
      if (this.#toolbar && this.#toolbar.childElementCount === 0) {
        this.#toolbar.remove();
        this.#toolbar = null;
      }
      return;
    }
    let panel = this.#groupPanel;
    if (!panel) {
      panel = doc.createElement('div');
      panel.className = 'aui-data-grid__group-panel';
      panel.setAttribute('role', 'group');
      this.#ensureToolbar().prepend(panel);
      this.#groupPanel = panel;
    }
    panel.setAttribute('aria-label', msg('groupPanel'));
    const label = doc.createElement('span');
    label.className = 'aui-data-grid__group-panel-label';
    label.textContent = msg('groupPanelLabel');
    const list = doc.createElement('ul');
    list.className = 'aui-data-grid__group-pills';
    const groupBy = this.#groupBy();
    const button = (text: string, icon: string, onClick: () => void, disabled = false): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-data-grid__group-pill-button';
      b.setAttribute('aria-label', text);
      b.title = text;
      b.disabled = disabled;
      b.append(renderIcon(icon, { className: 'aui-data-grid__group-pill-icon', doc }));
      b.addEventListener('click', onClick);
      return b;
    };
    groupBy.forEach((id, i) => {
      const name = this.#leafDef(id)?.header ?? id;
      const li = doc.createElement('li');
      li.className = 'aui-data-grid__group-pill';
      li.dataset.column = id;
      li.dataset.index = String(i);
      const text = doc.createElement('span');
      text.textContent = name;
      const move = (delta: number): void => {
        const next = [...groupBy];
        const [moved] = next.splice(i, 1);
        if (moved === undefined) return;
        next.splice(i + delta, 0, moved);
        this.#setGroupBy(next, true);
        this.#groupPanel?.querySelector<HTMLButtonElement>(`[data-column="${CSS.escape(id)}"] .aui-data-grid__group-pill-button:not(:disabled)`)?.focus();
      };
      li.append(
        text,
        button(msg('groupMoveEarlier', { column: name }), 'chevron-left', () => {
          move(-1);
        }, i === 0),
        button(msg('groupMoveLater', { column: name }), 'chevron-right', () => {
          move(1);
        }, i === groupBy.length - 1),
        button(msg('groupRemove', { column: name }), 'close', () => {
          this.#setGroupBy(groupBy.filter((x) => x !== id), true);
          this.#groupPanel?.querySelector<HTMLElement>('.aui-data-grid__group-pill-button:not(:disabled), select')?.focus();
        }),
      );
      list.append(li);
    });
    const parts: HTMLElement[] = [label];
    if (groupBy.length > 0) parts.push(list);
    else {
      const empty = doc.createElement('span');
      empty.className = 'aui-data-grid__group-panel-empty';
      empty.textContent = msg('groupPanelEmpty');
      parts.push(empty);
    }
    const candidates = this.#leaves.filter((l) => this.#canGroup(l.id));
    if (candidates.length > 0) {
      const select = doc.createElement('select');
      select.className = 'aui-data-grid__filter-control aui-data-grid__group-add';
      select.setAttribute('aria-label', msg('groupAdd'));
      const placeholder = doc.createElement('option');
      placeholder.value = '';
      placeholder.textContent = msg('groupAddPlaceholder');
      select.append(placeholder, ...candidates.map((l) => Object.assign(doc.createElement('option'), { value: l.id, textContent: l.def.header })));
      select.addEventListener('change', () => {
        if (select.value === '') return;
        this.#setGroupBy([...groupBy, select.value], true);
        this.#groupPanel?.querySelector<HTMLSelectElement>('select')?.focus();
      });
      parts.push(select);
    }
    panel.replaceChildren(...parts);
  }

  /** Expand every group row. Emits nothing. */
  expandAll(): void {
    this.#setAllExpanded(true);
  }

  /** Collapse every group row. Emits nothing. */
  collapseAll(): void {
    this.#setAllExpanded(false);
  }

  /** Expand or collapse one group row by id. Returns false for unknown ids. Emits nothing. */
  setExpanded(groupId: string, expanded: boolean): boolean {
    const find = (nodes: readonly GroupNode<Row>[]): GroupNode<Row> | undefined => {
      for (const n of nodes) {
        if (n.id === groupId) return n;
        const inner = find(n.groups);
        if (inner) return inner;
      }
      return undefined;
    };
    if (!find(this.#groups)) return false;
    this.#expanded.set(groupId, expanded);
    this.#flatten();
    this.#paginate();
    this.#generation++;
    this.#renderNow();
    return true;
  }

  /**
   * Tree data with `parentIdField`: move a row under another parent (null: a root) to a position
   * among its new siblings (in row order). Rows are never mutated: the moved row is a shallow copy
   * with the new parent id. Returns false for unknown ids, moves into the row's own subtree, rows
   * that are not plain objects, and the other tree modes. Emits `aui-rows-change`.
   */
  moveRow(id: string, parentId: string | null, index: number): boolean {
    const rows = this.#treeMove(this.#source, id, parentId, index);
    if (!rows) return false;
    this.#clearUndo();
    this.#applyOrder(rows, [id]);
    return true;
  }

  /** Tree data with parentIdField: the rows after moving one under a parent at a sibling position, or null. */
  #treeMove(items: readonly Item<Row>[], id: string, parentId: string | null, index: number): Row[] | null {
    const field = this.#options.treeData?.parentIdField;
    if (!field || typeof id !== 'string' || !(parentId === null || typeof parentId === 'string') || !Number.isInteger(index) || index < 0) return null;
    const byId = new Map(items.map((item) => [item.id, item]));
    const moved = byId.get(id);
    if (!moved || !isPlainObject(moved.row)) return null;
    const parentOf = (rowId: string): string | null => {
      const row = byId.get(rowId)?.row;
      const value = fieldOf(row, field);
      return typeof value === 'string' && value !== '' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
    };
    if (parentId !== null) {
      if (!byId.has(parentId)) return null;
      // The new parent must not be the row or one of its descendants (bounded: cycles in the data never loop).
      let p: string | null = parentId;
      for (let steps = 0; p !== null && steps <= items.length; steps++, p = parentOf(p)) if (p === id) return null;
    }
    const copy = { ...(moved.row as Record<string, unknown>), [field]: parentId } as Row;
    const rest = items.filter((item) => item.id !== id);
    // Rows with a missing parent show as roots: they are root siblings too.
    const siblings = rest.filter((item) => {
      const p = parentOf(item.id);
      return parentId === null ? p === null || !byId.has(p) : p === parentId;
    });
    const before = siblings[index];
    const last = siblings.at(-1);
    const at = before ? rest.indexOf(before) : last ? rest.indexOf(last) + 1 : rest.length;
    const rows = rest.map((item) => item.row);
    rows.splice(at, 0, copy);
    return rows;
  }

  /** Apply a new row order (row moves, their undo and redo): rows keep their identity; emits `aui-rows-change`. */
  #applyOrder(rows: readonly Row[], moved: readonly string[]): void {
    this.#options = { ...this.#options, rows };
    const previous = this.#source;
    const rowId = this.#options.rowId;
    this.#source = rows.map((row, i) => ({ row, id: rowId(row), index: i }));
    this.#sorter.carry(previous, this.#source, new Set(moved), this.#engineColumns);
    this.#sortRows();
    this.#pruneBatch();
    this.#afterRowsChange({ added: [], updated: [...moved], removed: [], missing: [] });
  }

  // ---- Row dragging --------------------------------------------------------------------------

  #dragOptions(): DataGridRowDragging<Row> | null {
    const d = this.#options.rowDragging;
    return d === true ? {} : d === false || d === undefined ? null : d;
  }

  /** The column holding drag handles: the `rowDrag` column, else the first data column. */
  #dragColumn(): string | null {
    if (!this.#dragOptions()) return null;
    const visible = this.#layout.visible.filter((c) => !isGeneratedColumn(c.leaf.id));
    return (visible.find((c) => c.leaf.def.rowDrag === true) ?? visible[0])?.leaf.id ?? null;
  }

  /** Whether the grid itself can move rows now (managed; flat rows in source order, or parent-id trees). */
  #movable(): boolean {
    const d = this.#dragOptions();
    if (!d?.managed || this.#server || this.#options.pivot || this.#sorts.length > 0 || this.#filteredCount < this.#source.length) return false;
    if (this.#options.treeData) return this.#options.treeData.parentIdField !== undefined;
    return (this.#options.groupBy ?? []).length === 0;
  }

  /** The rows a drag of one row moves: the selected rows (display order) when it is selected and multiRow is on. */
  #draggedRows(rowId: string): string[] {
    const d = this.#dragOptions();
    if (d?.multiRow === true && this.#isRowSelected(rowId)) return this.#sorted.filter((item) => this.#isRowSelected(item.id)).map((item) => item.id);
    return [rowId];
  }

  /** Emit the drop (cancelable) and, when the grid manages moves, move the rows (one undo step). */
  #dropRows(rowIds: readonly string[], targetId: string, position: 'before' | 'after' | 'inside', source: 'pointer' | 'keyboard'): boolean {
    const ids = rowIds.filter((id) => id !== targetId);
    if (ids.length === 0) return false;
    const go = emit(this.host, 'aui-row-drop', { rowIds: ids, targetId, position, source } satisfies DataGridRowDropDetail, { cancelable: true });
    if (!go || !this.#dragOptions()?.managed) return false;
    const locale = this.#config.locale;
    if (!this.#movable()) {
      announce(getMessage('dataGrid', 'rowsNotMovable', {}, locale), 'polite', this.#doc);
      return false;
    }
    const before = this.#source.map((item) => item.row);
    let rows: Row[] | null;
    const field = this.#options.treeData?.parentIdField;
    if (field) {
      // Tree: each row in turn (inside: the target's last child; before/after: the target's sibling).
      let items: Item<Row>[] = this.#source;
      rows = null;
      for (const id of ids) {
        const byId = new Map(items.map((item) => [item.id, item]));
        const target = byId.get(targetId);
        if (!target) return false;
        const raw = fieldOf(target.row, field);
        const parent = position === 'inside' ? targetId : typeof raw === 'string' && raw !== '' && byId.has(raw) ? raw : typeof raw === 'number' ? String(raw) : null;
        const siblings = items.filter((item) => item.id !== id && (() => {
          const p = fieldOf(item.row, field);
          const pid = typeof p === 'string' && p !== '' ? p : typeof p === 'number' ? String(p) : null;
          return parent === null ? pid === null || !byId.has(pid) : pid === parent;
        })());
        const at = position === 'inside' ? siblings.length : siblings.findIndex((s) => s.id === targetId) + (position === 'after' ? 1 : 0);
        const next = this.#treeMove(items, id, parent, Math.max(0, at));
        if (!next) return false;
        rows = next;
        const rowId = this.#options.rowId;
        items = next.map((row, i) => ({ row, id: rowId(row), index: i }));
      }
    } else {
      if (position === 'inside') return false;
      const moving = new Set(ids);
      const rest = this.#source.filter((item) => !moving.has(item.id));
      const at = rest.findIndex((item) => item.id === targetId);
      if (at < 0) return false;
      const block = this.#source.filter((item) => moving.has(item.id)).map((item) => item.row);
      rows = rest.map((item) => item.row);
      rows.splice(at + (position === 'after' ? 1 : 0), 0, ...block);
    }
    if (!rows) return false;
    this.#applyOrder(rows, ids);
    const limit = this.#options.undoLimit ?? 20;
    if (limit > 0) {
      this.#undo.push({ before, after: rows, ids });
      if (this.#undo.length > limit) this.#undo.shift();
      this.#redo = [];
    }
    const first = ids[0];
    const index = first === undefined ? undefined : this.#index().get(first);
    announce(
      ids.length > 1
        ? getMessage('dataGrid', 'rowsMoved', { count: formatNumber(ids.length, {}, locale) }, locale)
        : position === 'inside'
          ? getMessage('dataGrid', 'rowMovedInto', { parent: this.#rowLabelOf(targetId) }, locale)
          : getMessage('dataGrid', 'rowMoved', { position: formatNumber((index ?? 0) + 1, {}, locale) }, locale),
      'polite',
      this.#doc,
    );
    return true;
  }

  #rowLabelOf(rowId: string): string {
    const row = this.#source.find((item) => item.id === rowId)?.row;
    return row === undefined ? rowId : this.#rowName(row, rowId);
  }

  /** The row a move up or down lands next to: the nearest row of the same level (in trees: the neighbouring sibling). */
  #rowMoveTarget(rowId: string, key: 'ArrowUp' | 'ArrowDown'): string | null {
    const index = this.#index().get(rowId);
    if (index === undefined) return null;
    const ids = this.#draggedRows(rowId);
    const tree = this.#options.treeData?.parentIdField !== undefined;
    const levelOf = (d: GridItem<Row>['display']): number => (d?.kind === 'data' ? d.level : d?.kind === 'group' ? d.node.level : 0);
    const level = levelOf(this.#items[index]?.display);
    const step = key === 'ArrowUp' ? -1 : 1;
    for (let i = index + step; i >= 0 && i < this.#items.length; i += step) {
      const other = this.#items[i];
      if (!other || ids.includes(other.id)) continue;
      const d = other.display;
      const l = levelOf(d);
      if (tree && l > level) continue;
      if (tree && l < level) return null;
      return d?.kind === 'group' && d.node.item ? d.node.item.id : other.id;
    }
    return null;
  }

  /** Keyboard row moves on a drag handle cell: up and down (siblings), and in trees indent and outdent. */
  #keyboardRowMove(rowId: string, key: string, left: string, right: string): boolean {
    const index = this.#index().get(rowId);
    if (index === undefined) return false;
    const ids = this.#draggedRows(rowId);
    const tree = this.#options.treeData?.parentIdField !== undefined;
    const display = this.#items[index]?.display;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const target = this.#rowMoveTarget(rowId, key);
      return target !== null && this.#dropRows(ids, target, key === 'ArrowUp' ? 'before' : 'after', 'keyboard');
    }
    if (!tree) return false;
    const parent = display?.kind === 'data' ? display.parent : display?.kind === 'group' ? display.node.parent : null;
    if (key === right) {
      // Indent: the last child of the sibling above.
      for (let i = index - 1; i >= 0; i--) {
        const d = this.#items[i]?.display;
        const p = d?.kind === 'data' ? d.parent : d?.kind === 'group' ? d.node.parent : null;
        const id = d?.kind === 'data' ? d.item.id : d?.kind === 'group' ? (d.node.item?.id ?? null) : null;
        if (p === parent && id !== null) return this.#dropRows(ids, id, 'inside', 'keyboard');
      }
      return false;
    }
    if (key === left && parent?.item) return this.#dropRows(ids, parent.item.id, 'after', 'keyboard');
    return false;
  }

  /**
   * Dragging group and pivot pills (the pill buttons and pickers are the keyboard path): reorder within a zone, move
   * between pivot zones (a value keeps its aggregate; new values get sum or count), and drop outside the panel to remove.
   */
  #listenPillDrag(): void {
    type Zone = 'group' | 'rows' | 'columns' | 'values';
    interface PillDrag {
      zone: Zone;
      id: string;
      index: number;
      pill: HTMLElement;
      ghost: HTMLElement;
      to: { zone: Zone; index: number } | null;
    }
    let drag: PillDrag | null = null;
    let pending: { zone: Zone; id: string; index: number; pill: HTMLElement } | null = null;
    const marks = ['aui-data-grid__group-pill--drop-before', 'aui-data-grid__group-pill--drop-after'];
    const unmark = (): void => {
      for (const panel of [this.#groupPanel, this.#pivotPanel]) {
        for (const el of panel?.querySelectorAll<HTMLElement>('.aui-data-grid__group-pill--drop-before, .aui-data-grid__group-pill--drop-after') ?? []) el.classList.remove(...marks);
        panel?.classList.remove('aui-data-grid__group-panel--drop');
        for (const el of panel?.querySelectorAll<HTMLElement>('.aui-data-grid__pivot-zone--drop') ?? []) el.classList.remove('aui-data-grid__pivot-zone--drop');
      }
    };
    const clear = (): void => {
      if (!drag) return;
      drag.ghost.remove();
      drag.pill.classList.remove('aui-data-grid__group-pill--dragging');
      unmark();
      drag = null;
    };
    const zoneOf = (el: Element | null): { zone: Zone; area: HTMLElement } | null => {
      const pivotArea = el?.closest<HTMLElement>('.aui-data-grid__pivot-zone');
      if (pivotArea && this.#pivotPanel?.contains(pivotArea)) {
        const key = pivotArea.dataset.zone;
        return key === 'rows' || key === 'columns' || key === 'values' ? { zone: key, area: pivotArea } : null;
      }
      const group = this.#groupPanel;
      return group && el && group.contains(el) ? { zone: 'group', area: group } : null;
    };
    const tracker = trackPointerDrag(this.host, {
      threshold: 4,
      canStart: (event) => {
        pending = null;
        const t = event.target instanceof Element ? event.target : null;
        const pill = event.button === 0 ? t?.closest<HTMLElement>('.aui-data-grid__group-pill') : null;
        if (!pill || t?.closest('button, select')) return false;
        const z = zoneOf(pill);
        const id = pill.dataset.column;
        const index = Number(pill.dataset.index);
        if (!z || id === undefined || !Number.isInteger(index)) return false;
        pending = { zone: z.zone, id, index, pill };
        return true;
      },
      onStart: () => {
        const p = pending;
        if (!p) return;
        const ghost = this.#doc.createElement('div');
        ghost.className = 'aui-data-grid__drag-ghost';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.textContent = this.#leafDef(p.id)?.header ?? p.id;
        this.host.append(ghost);
        p.pill.classList.add('aui-data-grid__group-pill--dragging');
        drag = { ...p, ghost, to: null };
      },
      onMove: (move) => {
        const d = drag;
        if (!d) return;
        const { x, y } = move.point;
        d.ghost.style.setProperty('inset-inline-start', `${String(x + 12)}px`);
        d.ghost.style.setProperty('inset-block-start', `${String(y + 12)}px`);
        unmark();
        const z = zoneOf(this.#doc.elementFromPoint(x, y));
        // The group panel takes group pills only; pivot zones take pivot pills.
        if (!z || (z.zone === 'group') !== (d.zone === 'group')) {
          d.to = null;
          d.ghost.classList.add('aui-data-grid__drag-ghost--remove');
          return;
        }
        d.ghost.classList.remove('aui-data-grid__drag-ghost--remove');
        const rtl = this.#config.direction === 'rtl';
        const pills = [...z.area.querySelectorAll<HTMLElement>('.aui-data-grid__group-pill')];
        // Pills before the point: on an earlier line, or on its line and before it in the reading direction.
        let index = 0;
        for (const pill of pills) {
          const r = pill.getBoundingClientRect();
          const mid = r.left + r.width / 2;
          if (r.bottom < y || (r.top <= y && (rtl ? mid > x : mid < x))) index = Number(pill.dataset.index) + 1;
        }
        d.to = { zone: z.zone, index };
        const at = pills.find((p) => Number(p.dataset.index) === index);
        if (at) at.classList.add('aui-data-grid__group-pill--drop-before');
        else if (pills.length > 0) pills[pills.length - 1]?.classList.add('aui-data-grid__group-pill--drop-after');
        else z.area.classList.add(z.zone === 'group' ? 'aui-data-grid__group-panel--drop' : 'aui-data-grid__pivot-zone--drop');
      },
      onEnd: () => {
        const d = drag;
        clear();
        if (d) this.#dropPill(d.zone, d.id, d.index, d.to);
      },
      onCancel: clear,
    });
    this.#group.add(() => {
      tracker.dispose();
      clear();
    });
  }

  /** Apply a pill drop (to null: removed). */
  #dropPill(zone: 'group' | 'rows' | 'columns' | 'values', id: string, index: number, to: { zone: 'group' | 'rows' | 'columns' | 'values'; index: number } | null): void {
    const place = <T>(list: readonly T[], from: number, item: T, at: number): T[] => {
      const next = list.filter((_x, i) => i !== from);
      next.splice(Math.min(next.length, at > from ? at - 1 : at), 0, item);
      return next;
    };
    if (zone === 'group') {
      const groupBy = this.#groupBy();
      if (groupBy[index] !== id) return;
      if (!to) this.#setGroupBy(groupBy.filter((_x, i) => i !== index), true);
      else if (to.index !== index && to.index !== index + 1) this.#setGroupBy(place(groupBy, index, id, to.index), true);
      return;
    }
    const pivot = this.#pivot();
    if (!pivot) return;
    const lists = { rows: [...pivot.rows], columns: [...pivot.columns] };
    let values = [...pivot.values];
    const value = zone === 'values' ? values[index] : undefined;
    if ((zone === 'values' ? value?.column : lists[zone][index]) !== id) return;
    if (to?.zone === zone) {
      if (to.index === index || to.index === index + 1) return;
      if (zone === 'values') values = place(values, index, value ?? { column: id, aggregate: 'count' }, to.index);
      else lists[zone] = place(lists[zone], index, id, to.index);
    } else {
      // Out of the source zone.
      if (zone === 'values') values = values.filter((_x, i) => i !== index);
      else lists[zone] = lists[zone].filter((_x, i) => i !== index);
      if (to?.zone === 'values') {
        const numeric = this.#leafDef(id)?.type === 'number' || this.#leafDef(id)?.type === 'currency';
        values.splice(to.index, 0, { column: id, aggregate: numeric ? 'sum' : 'count' });
      } else if (to && to.zone !== 'group') {
        // Rows and columns hold a column once between them.
        if (lists.rows.includes(id) || lists.columns.includes(id)) return;
        lists[to.zone].splice(to.index, 0, id);
      }
    }
    this.#setPivot({ rows: lists.rows, columns: lists.columns, values }, true);
  }

  /**
   * Keep another grid's columns (order, widths, pinning, visibility, collapsed groups) and horizontal scroll in
   * step with this one, both ways: for example a totals grid under the main grid. The other grid takes this grid's
   * columns now. Returns a function ending it (destroying either grid ends it too).
   */
  alignWith<Other>(other: DataGrid<Other>): () => void {
    const o: unknown = other;
    if (!(o instanceof DataGrid) || o === this) fail('alignWith', 'another DataGrid');
    let syncing = false;
    const copy = (from: AlignedGrid, to: AlignedGrid): void => {
      if (syncing) return;
      syncing = true;
      try {
        const c = from.getColumnsState();
        to.setState({ columns: { order: c.order, widths: c.widths, pinned: c.pinned, hidden: c.hidden, collapsedGroups: c.collapsedGroups } });
      } finally {
        syncing = false;
      }
    };
    const scroll = (from: HTMLElement, to: HTMLElement): void => {
      if (to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
    };
    const mine = this.#viewport;
    const theirs = other.#viewport;
    const toOther = (): void => {
      copy(this, other);
    };
    const toThis = (): void => {
      copy(other, this);
    };
    const scrollOther = (): void => {
      scroll(mine, theirs);
    };
    const scrollThis = (): void => {
      scroll(theirs, mine);
    };
    this.host.addEventListener('aui-columns-change', toOther);
    other.host.addEventListener('aui-columns-change', toThis);
    mine.addEventListener('scroll', scrollOther, { passive: true });
    theirs.addEventListener('scroll', scrollThis, { passive: true });
    toOther();
    scrollOther();
    let ended = false;
    const end = (): void => {
      if (ended) return;
      ended = true;
      this.host.removeEventListener('aui-columns-change', toOther);
      other.host.removeEventListener('aui-columns-change', toThis);
      mine.removeEventListener('scroll', scrollOther);
      theirs.removeEventListener('scroll', scrollThis);
    };
    this.#group.add(end);
    other.#group.add(end);
    return end;
  }

  /** Files dropped on the grid (`fileDrop`): an overlay while files are over it; accepted files go to onFiles. */
  #listenFileDrop(): void {
    const hasFiles = (event: DragEvent): boolean => this.#options.fileDrop !== undefined && (event.dataTransfer?.types.includes('Files') ?? false);
    const show = (on: boolean): void => {
      if (!on) {
        this.#fileOverlay?.remove();
        this.#fileOverlay = null;
        return;
      }
      if (this.#fileOverlay) return;
      const overlay = this.#doc.createElement('div');
      overlay.className = 'aui-data-grid__file-drop';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.textContent = this.#options.fileDrop?.label ?? getMessage('dataGrid', 'dropFiles', {}, this.#config.locale);
      this.host.append(overlay);
      this.#fileOverlay = overlay;
    };
    const over = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      show(true);
    };
    const g = this.#group;
    g.listen(this.host, 'dragenter', over);
    g.listen(this.host, 'dragover', over);
    g.listen(this.host, 'dragleave', (event) => {
      if (!(event.relatedTarget instanceof Node && this.host.contains(event.relatedTarget))) show(false);
    });
    g.listen(this.host, 'drop', (event) => {
      const drop = this.#options.fileDrop;
      if (!drop || !hasFiles(event)) return;
      event.preventDefault();
      show(false);
      const files = [...(event.dataTransfer?.files ?? [])].filter((file) => acceptsFile(file, drop.accept));
      if (files.length === 0) {
        announce(getMessage('dataGrid', 'filesNotAccepted', {}, this.#config.locale), 'assertive', this.#doc);
        return;
      }
      drop.onFiles(files);
    });
    g.add(() => {
      show(false);
    });
  }

  /** Drop zones outside the grid (`addRowDropZone`), and the ones a native drag is over. */
  readonly #zones = new Set<DataGridRowDropZone<Row>>();
  readonly #zonesOver = new Set<DataGridRowDropZone<Row>>();
  /** This grid's drop line (its own rows dragged, or rows from a grid whose zone it is). */
  #dropLine: HTMLElement | null = null;
  #fileOverlay: HTMLElement | null = null;
  /** Formulas: the book, the rows it was built for, row positions, and formula column positions. */
  #book: DataGridFormulaBook | null = null;
  #bookSource: readonly Item<Row>[] | null = null;
  #rowPositions = new Map<Row, number>();
  #bookColumns = new Map<string, number>();
  /** Column accessors without formula results (cell formulas read as their text). */
  #rawAccessors = new Map<string, (row: Row) => unknown>();
  /** The last copy's cell formulas with their stable addresses (paste moves relative references). */
  #copied: { text: string; cells: ({ formula: string; row: number; column: number } | null)[][] } | null = null;
  /** The print table while the browser prints. */
  #printOut: HTMLElement | null = null;
  /** The rows of a native drag from this grid in progress. */
  #nativeDrag: { ids: string[]; rows: Row[] } | null = null;

  /** Let rows dragged from this grid drop on an element outside it (also offered in the cell menu's Send to submenu). Returns a function removing the zone. */
  addRowDropZone(zone: DataGridRowDropZone<Row>): () => void {
    const z: unknown = zone;
    const r = isObjectLike(z) ? (z as Partial<Record<keyof DataGridRowDropZone<Row>, unknown>>) : null;
    const hooks = r ? [r.onDragEnter, r.onDragMove, r.onDragLeave].every((h) => h === undefined || isFn(h)) : false;
    if (!r || !(r.element instanceof HTMLElement) || typeof r.label !== 'string' || r.label.trim() === '' || !isFn(r.onDrop) || !hooks) {
      fail('addRowDropZone', '{ element, label, onDrop, onDragEnter?, onDragMove?, onDragLeave? }');
    }
    const el = zone.element;
    const detailOf = (event: DragEvent): DataGridRowZoneDetail<Row> | null => {
      const d = this.#nativeDrag;
      return d ? { rowIds: d.ids, rows: d.rows, x: event.clientX, y: event.clientY, grid: this } : null;
    };
    // Native drags: the zone accepts this grid's rows only.
    const over = (event: DragEvent): void => {
      const d = detailOf(event);
      if (!d) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      if (!this.#zonesOver.has(zone)) {
        this.#zonesOver.add(zone);
        el.classList.add(ZONE_ACTIVE);
        zone.onDragEnter?.(d);
      }
      zone.onDragMove?.(d);
    };
    const leave = (event: DragEvent): void => {
      if (!this.#zonesOver.has(zone) || (event.relatedTarget instanceof Node && el.contains(event.relatedTarget))) return;
      this.#zonesOver.delete(zone);
      el.classList.remove(ZONE_ACTIVE);
      const d = detailOf(event);
      if (d) zone.onDragLeave?.(d);
    };
    const drop = (event: DragEvent): void => {
      const d = detailOf(event);
      if (!d) return;
      event.preventDefault();
      this.#zonesOver.delete(zone);
      el.classList.remove(ZONE_ACTIVE);
      this.#zoneDrop(zone, d);
    };
    el.addEventListener('dragenter', over);
    el.addEventListener('dragover', over);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', drop);
    this.#zones.add(zone);
    let removed = false;
    const remove = (): void => {
      if (removed) return;
      removed = true;
      this.#zones.delete(zone);
      this.#zonesOver.delete(zone);
      el.classList.remove(ZONE_ACTIVE);
      el.removeEventListener('dragenter', over);
      el.removeEventListener('dragover', over);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', drop);
    };
    this.#group.add(remove);
    return remove;
  }

  /**
   * A drop zone (for another grid's `addRowDropZone`) adding the dropped rows to this grid: at the drop line when
   * this grid shows its rows in source order, else at the end; rows whose id is already here are skipped. `move`
   * removes the added rows from the source grid.
   */
  rowDropZone(options: { readonly label?: string; readonly move?: boolean } = {}): DataGridRowDropZone<Row> {
    if (!isObjectLike(options) || (options.label !== undefined && typeof options.label !== 'string') || (options.move !== undefined && !isBool(options.move))) fail('rowDropZone', '{ label?, move? }');
    const at = (d: DataGridRowZoneDetail<Row>): DropTarget | null => (d.x === null || d.y === null ? null : this.#hoverDrop(d.x, d.y, [], false, this.#doc.elementFromPoint(d.x, d.y)));
    return {
      element: this.host,
      label: options.label ?? this.#options.label,
      onDragMove: (d) => {
        at(d);
      },
      onDragLeave: () => {
        this.#clearDropHover();
      },
      onDrop: (d) => {
        const target = at(d);
        this.#clearDropHover();
        if (d.grid === this) return;
        const added = this.#receiveRows(d.rows, target);
        if (options.move === true && added.length > 0) d.grid.applyTransaction({ remove: added });
      },
    };
  }

  /** Add rows dropped from another grid; returns the ids added. */
  #receiveRows(rows: readonly Row[], target: DropTarget | null): string[] {
    if (this.#server) return [];
    const rowId = this.#options.rowId;
    const have = new Set(this.#source.map((item) => item.id));
    const add = rows.filter((row) => !have.has(rowId(row)));
    if (add.length === 0) return [];
    const inOrder = this.#sorts.length === 0 && this.#filteredCount === this.#source.length && (this.#options.groupBy ?? []).length === 0 && !this.#options.treeData && !this.#options.pivot;
    const i = target && inOrder ? this.#source.findIndex((item) => item.id === target.id) : -1;
    const result = this.applyTransaction(i < 0 || !target ? { add } : { add, addIndex: i + (target.position === 'before' ? 0 : 1) });
    return [...result.added];
  }

  /** Drop rows on a zone (pointer, native, or the Send to menu) and announce it. */
  #zoneDrop(zone: DataGridRowDropZone<Row>, detail: DataGridRowZoneDetail<Row>): void {
    zone.onDrop(detail);
    const locale = this.#config.locale;
    const count = detail.rowIds.length;
    announce(
      count === 1 ? getMessage('dataGrid', 'rowSent', { zone: zone.label }, locale) : getMessage('dataGrid', 'rowsSent', { count: formatNumber(count, {}, locale), zone: zone.label }, locale),
      'polite',
      this.#doc,
    );
  }

  /** The cell menu's Send to: the zones, and sending a row (the selected rows with multiRow) to one. */
  #sendToZone(index: number, rowId: string): void {
    const zone = [...this.#zones][index];
    const row = this.#source.find((item) => item.id === rowId)?.row;
    if (!zone || row === undefined || this.#dragOptions()?.canDrag?.(row) === false) return;
    const ids = this.#draggedRows(rowId);
    this.#zoneDrop(zone, { rowIds: ids, rows: this.#rowsOf(ids), x: null, y: null, grid: this });
  }

  #rowsOf(ids: readonly string[]): Row[] {
    const want = new Set(ids);
    const byId = new Map<string, Row>();
    for (const item of this.#source) if (want.has(item.id)) byId.set(item.id, item.row);
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row === undefined ? [] : [row];
    });
  }

  /** The innermost zone containing an element. */
  #zoneAt(el: Element | null): DataGridRowDropZone<Row> | null {
    let best: DataGridRowDropZone<Row> | null = null;
    if (!el) return null;
    for (const zone of this.#zones) if (zone.element.contains(el) && (!best || best.element.contains(zone.element))) best = zone;
    return best;
  }

  /** Show where rows would drop at a point over this grid's rows (`inside`: into tree rows); returns the target or null (cleared). */
  #hoverDrop(x: number, y: number, exclude: readonly string[], inside: boolean, under: Element | null): DropTarget | null {
    this.#body.querySelector('.aui-data-grid__row--drop-inside')?.classList.remove('aui-data-grid__row--drop-inside');
    const rowEl = under?.closest<HTMLElement>('.aui-data-grid__row');
    const id = rowEl?.parentElement === this.#body ? rowEl.dataset.rowId : undefined;
    if (!rowEl || id === undefined || exclude.includes(id) || !this.#index().has(id)) {
      this.#dropLine?.remove();
      this.#dropLine = null;
      return null;
    }
    const r = rowEl.getBoundingClientRect();
    const f = (y - r.top) / Math.max(1, r.height);
    const position = inside && this.#options.treeData?.parentIdField !== undefined && f > 0.25 && f < 0.75 ? 'inside' : f < 0.5 ? 'before' : 'after';
    if (position === 'inside') {
      rowEl.classList.add('aui-data-grid__row--drop-inside');
      this.#dropLine?.remove();
      this.#dropLine = null;
    } else {
      let line = this.#dropLine;
      if (!line) {
        line = this.#doc.createElement('div');
        line.className = 'aui-data-grid__drop-line';
        line.setAttribute('aria-hidden', 'true');
        this.#dropLine = line;
      }
      if (line.parentElement !== this.#body) this.#body.append(line);
      const top = Number.parseFloat(rowEl.style.insetBlockStart || '0') + (position === 'after' ? r.height : 0);
      line.style.setProperty('inset-block-start', `${String(top - 1)}px`);
      line.style.setProperty('inline-size', rowEl.style.inlineSize);
    }
    this.#edgeScroll(x, y);
    return { id, position };
  }

  #clearDropHover(): void {
    this.#body.querySelector('.aui-data-grid__row--drop-inside')?.classList.remove('aui-data-grid__row--drop-inside');
    this.#dropLine?.remove();
    this.#dropLine = null;
  }

  /** Scroll the rows while a drag is near the top or bottom edge of the viewport. */
  #edgeScroll(x: number, y: number): void {
    const vr = this.#viewport.getBoundingClientRect();
    if (x < vr.left || x > vr.right || y < vr.top || y > vr.bottom) return;
    if (y < vr.top + this.#head.offsetHeight + 24) this.#viewport.scrollTop -= 16;
    else if (y > vr.bottom - 24) this.#viewport.scrollTop += 16;
  }

  #dragGhost(ids: readonly string[], rowId: string): HTMLElement {
    const ghost = this.#doc.createElement('div');
    ghost.className = 'aui-data-grid__drag-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.textContent = ids.length > 1 ? getMessage('dataGrid', 'dragging', { count: formatNumber(ids.length, {}, this.#config.locale) }, this.#config.locale) : this.#rowLabelOf(rowId);
    this.host.append(ghost);
    return ghost;
  }

  /** The handle's row, when a drag may start from it. */
  #handleRow(target: EventTarget | null): string | undefined {
    const handle = target instanceof Element ? target.closest('.aui-data-grid__drag-handle') : null;
    if (!handle || this.#detailContentOf(handle) || handle.classList.contains('aui-data-grid__drag-handle--disabled')) return undefined;
    const row = handle.closest<HTMLElement>('.aui-data-grid__row');
    return row?.parentElement === this.#body ? row.dataset.rowId : undefined;
  }

  /** Dragging from a handle: pointer tracking (a ghost, the drop line or a row to drop into, zones), or native drag and drop with `nativeData`. */
  #listenRowDrag(): void {
    interface Drag {
      ids: string[];
      rows: Row[];
      ghost: HTMLElement;
      target: DropTarget | null;
      zone: DataGridRowDropZone<Row> | null;
    }
    let drag: Drag | null = null;
    let pending: string | undefined;
    const detail = (d: Drag, x: number | null, y: number | null): DataGridRowZoneDetail<Row> => ({ rowIds: d.ids, rows: d.rows, x, y, grid: this });
    const setZone = (d: Drag, next: DataGridRowDropZone<Row> | null, x: number, y: number): void => {
      if (next === d.zone) return;
      const previous = d.zone;
      d.zone = next;
      if (previous) {
        previous.element.classList.remove(ZONE_ACTIVE);
        previous.onDragLeave?.(detail(d, x, y));
      }
      if (next) {
        next.element.classList.add(ZONE_ACTIVE);
        next.onDragEnter?.(detail(d, x, y));
      }
    };
    const clear = (): void => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.zone) {
        d.zone.element.classList.remove(ZONE_ACTIVE);
        d.zone.onDragLeave?.(detail(d, null, null));
      }
      d.ghost.remove();
      this.#clearDropHover();
      this.host.classList.remove('aui-data-grid--dragging');
    };
    const native = (): boolean => this.#dragOptions()?.nativeData !== undefined;
    const tracker = trackPointerDrag(this.#body, {
      threshold: 4,
      canStart: (event) => {
        pending = event.button === 0 && !native() ? this.#handleRow(event.target) : undefined;
        return pending !== undefined;
      },
      onStart: () => {
        const rowId = pending;
        if (rowId === undefined) return;
        const ids = this.#draggedRows(rowId);
        this.host.classList.add('aui-data-grid--dragging');
        drag = { ids, rows: this.#rowsOf(ids), ghost: this.#dragGhost(ids, rowId), target: null, zone: null };
        emit(this.host, 'aui-row-drag-start', { rowIds: ids } satisfies DataGridRowDragStartDetail);
      },
      onMove: (move) => {
        const d = drag;
        if (!d) return;
        const { x, y } = move.point;
        d.ghost.style.setProperty('inset-inline-start', `${String(x + 12)}px`);
        d.ghost.style.setProperty('inset-block-start', `${String(y + 12)}px`);
        // The ghost ignores the pointer (pointer-events: none), so this is what lies under it.
        const under = this.#doc.elementFromPoint(x, y);
        if (under && this.#body.contains(under)) {
          setZone(d, null, x, y);
          d.target = this.#hoverDrop(x, y, d.ids, true, under);
          return;
        }
        this.#clearDropHover();
        d.target = null;
        const zone = this.#zoneAt(under);
        setZone(d, zone, x, y);
        zone?.onDragMove?.(detail(d, x, y));
      },
      onEnd: (move) => {
        const d = drag;
        if (!d) return;
        const zone = d.zone;
        const target = d.target;
        d.zone = null;
        zone?.element.classList.remove(ZONE_ACTIVE);
        clear();
        if (zone) this.#zoneDrop(zone, detail(d, move.point.x, move.point.y));
        else if (target) this.#dropRows(d.ids, target.id, target.position, 'pointer');
      },
      onCancel: clear,
    });
    // Native drag and drop (nativeData): the data goes to other apps; drops on these rows and on zones move rows as above.
    const endNative = (): void => {
      this.#nativeDrag = null;
      for (const zone of this.#zonesOver) zone.element.classList.remove(ZONE_ACTIVE);
      this.#zonesOver.clear();
      this.#clearDropHover();
      this.host.classList.remove('aui-data-grid--dragging');
    };
    const g = this.#group;
    g.listen(this.#body, 'dragstart', (event) => {
      const make = this.#dragOptions()?.nativeData;
      const rowId = make ? this.#handleRow(event.target) : undefined;
      if (!make || rowId === undefined || !event.dataTransfer) return;
      const ids = this.#draggedRows(rowId);
      const rows = this.#rowsOf(ids);
      const data = make(rows);
      for (const [type, value] of Object.entries(data)) if (typeof value === 'string') event.dataTransfer.setData(type, value);
      event.dataTransfer.effectAllowed = 'copyMove';
      const ghost = this.#dragGhost(ids, rowId);
      ghost.style.setProperty('inset-inline-start', '-10000px');
      event.dataTransfer.setDragImage(ghost, -12, -12);
      // The drag image is captured from the ghost now; it is not needed after this task.
      queueMicrotask(() => {
        (this.#doc.defaultView ?? window).requestAnimationFrame(() => {
          ghost.remove();
        });
      });
      this.#nativeDrag = { ids, rows };
      this.host.classList.add('aui-data-grid--dragging');
      emit(this.host, 'aui-row-drag-start', { rowIds: ids } satisfies DataGridRowDragStartDetail);
    });
    const overRows = (event: DragEvent): void => {
      const d = this.#nativeDrag;
      if (!d) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      this.#hoverDrop(event.clientX, event.clientY, d.ids, true, event.target instanceof Element ? event.target : null);
    };
    g.listen(this.#body, 'dragenter', overRows);
    g.listen(this.#body, 'dragover', overRows);
    g.listen(this.#body, 'dragleave', (event) => {
      if (this.#nativeDrag && !(event.relatedTarget instanceof Node && this.#body.contains(event.relatedTarget))) this.#clearDropHover();
    });
    g.listen(this.#body, 'drop', (event) => {
      const d = this.#nativeDrag;
      if (!d) return;
      event.preventDefault();
      const target = this.#hoverDrop(event.clientX, event.clientY, d.ids, true, event.target instanceof Element ? event.target : null);
      endNative();
      if (target) this.#dropRows(d.ids, target.id, target.position, 'pointer');
    });
    g.listen(this.#body, 'dragend', endNative);
    g.add(() => {
      tracker.dispose();
      clear();
      endNative();
    });
  }

  /**
   * Serialize rows as RFC 4180 CSV with formula-injection protection (cells starting with =, +, -, @, a tab, or a
   * carriage return are prefixed with a quote; numbers the grid formats itself are trusted). No side effects. While
   * grouped, in tree data, and in pivot mode the default exports the group rows and totals with every group expanded.
   */
  toCsv(options: DataGridCsvOptions<Row> = {}): string {
    assertGridCsv(options);
    const delimiter = options.delimiter ?? ',';
    const escape = options.escapeFormulas ?? true;
    const line = (values: readonly CsvValue[]): string => values.map((v) => csvField(v, delimiter, escape)).join(delimiter);
    const spec = options.rows ?? 'filtered';
    let columns = this.#csvColumns(options.columns ?? 'visible');
    let items: readonly GridItem<Row>[];
    if (spec === 'range') {
      const rect = this.#cellSelectionOn() ? this.#rects().at(-1) : undefined;
      if (!rect) return options.bom === true ? '\ufeff' : '';
      const ids = new Set(this.#layout.visible.slice(rect.left, rect.right + 1).map((c) => c.leaf.id));
      columns = columns.filter((c) => ids.has(c.id));
      items = this.#items.slice(rect.top, rect.bottom + 1);
    } else items = this.#csvRows(spec, options.groups ?? 'rows');
    if (options.pinned === true && spec !== 'range') items = [...this.#pinnedRows.top, ...items, ...this.#pinnedRows.bottom];
    const lines: string[] = [];
    if (options.header !== false) {
      // Column group rows above the header: a group's name in the first column of its run.
      const depth = Math.max(0, ...columns.map((c) => this.#leafPath(c.id).length));
      if (options.columnGroups !== false) {
        for (let level = 0; level < depth; level++) {
          let previous: string | null = null;
          lines.push(line(columns.map((c) => {
            const group = this.#leafPath(c.id)[level];
            const first = group !== undefined && group.id !== previous;
            previous = group?.id ?? null;
            return { text: first ? group.header : '', trusted: false };
          })));
        }
      }
      lines.push(line(columns.map((c) => ({ text: c.header, trusted: false }))));
    }
    const raw = options.values === 'raw';
    const indent = options.indent ?? '  ';
    for (const item of items) lines.push(line(columns.map((c) => this.#csvCell(item, c, raw, indent, options.value))));
    return (options.bom === true ? '\ufeff' : '') + lines.join(options.lineEnding ?? '\r\n');
  }

  /** `toCsv()` as a `text/csv` Blob; `downloadCsv` (from the Data Table entry) saves it. */
  toCsvBlob(options: DataGridCsvOptions<Row> = {}): Blob {
    return new Blob([this.toCsv(options)], { type: 'text/csv;charset=utf-8' });
  }

  /**
   * The rows and columns of an export, for exporters such as `toXlsx` in `data-grid/export`: the same choices as
   * `toCsv` (`columns`, `rows`, `groups`, `pinned`), with raw values (aggregates as numbers), display text, group
   * levels, and the grid's expansion state. No side effects.
   */
  /**
   * Print the rows as a static table (R11-17): the `toCsv` row and column choices, column group headers repeated on
   * every page, group and total rows, the grid's direction, and print colors. The table exists only while the browser
   * prints (removed after `afterprint`). More than 20,000 rows throws: page the grid or export CSV instead.
   */
  print(options: DataGridPrintOptions = {}): void {
    const title: unknown = options.title;
    if (title !== undefined && typeof title !== 'string') fail('print.title', 'string');
    const data = this.getExportData({ ...(options.columns === undefined ? {} : { columns: options.columns }), ...(options.rows === undefined ? {} : { rows: options.rows }), ...(options.groups === undefined ? {} : { groups: options.groups }), ...(options.pinned === undefined ? {} : { pinned: options.pinned }) });
    if (data.rows.length > PRINT_LIMIT) {
      throw configurationError('DATA_GRID_PRINT', 'Too many rows to print.', { component: 'dataGrid', property: 'dataGrid.print.rows', expected: `at most ${String(PRINT_LIMIT)} rows (page the grid or export CSV)` });
    }
    const doc = this.#doc;
    const view = doc.defaultView ?? window;
    this.#printOut?.remove();
    const box = doc.createElement('div');
    box.className = 'aui-data-grid-print';
    box.setAttribute('dir', this.#config.direction);
    const table = doc.createElement('table');
    table.className = 'aui-data-grid-print__table';
    const caption = doc.createElement('caption');
    caption.textContent = options.title ?? this.#options.label;
    const head = doc.createElement('thead');
    for (const run of data.headerRows) {
      const tr = doc.createElement('tr');
      for (const cell of run) {
        const th = doc.createElement('th');
        th.textContent = cell.text;
        if (cell.span > 1) th.colSpan = cell.span;
        if (cell.id !== null) th.scope = 'colgroup';
        tr.append(th);
      }
      head.append(tr);
    }
    const names = doc.createElement('tr');
    for (const c of data.columns) {
      const th = doc.createElement('th');
      th.scope = 'col';
      th.textContent = c.header;
      names.append(th);
    }
    head.append(names);
    const body = doc.createElement('tbody');
    for (const row of data.rows) {
      const tr = doc.createElement('tr');
      if (row.kind !== 'data') tr.className = `aui-data-grid-print__row--${row.kind}`;
      row.cells.forEach((cell, i) => {
        const def = data.columns[i]?.def;
        const td = doc.createElement('td');
        td.textContent = cell.text;
        if (def && isGroupColumn(def.id) && row.level > 0) td.style.setProperty('--aui-data-grid-print-level', String(row.level));
        if (def && (def.align === 'end' || (def.align === undefined && (def.type === 'number' || def.type === 'currency')))) td.className = 'aui-data-grid-print__cell--end';
        tr.append(td);
      });
      body.append(tr);
    }
    table.append(caption, head, body);
    box.append(table);
    doc.body.append(box);
    this.#printOut = box;
    const done = (): void => {
      view.removeEventListener('afterprint', done);
      box.remove();
      if (this.#printOut === box) this.#printOut = null;
    };
    view.addEventListener('afterprint', done);
    view.print();
  }

  getExportData(options: DataGridExportOptions = {}): DataGridExportData<Row> {
    assertGridCsv(options);
    const text: unknown = options.text;
    if (text !== undefined && text !== 'all' && text !== 'needed') fail('getExportData.text', '"all" | "needed"');
    const textAll = options.text !== 'needed';
    const spec = options.rows ?? 'filtered';
    let columns = this.#csvColumns(options.columns ?? 'visible');
    let items: readonly GridItem<Row>[] = [];
    if (spec === 'range') {
      const rect = this.#cellSelectionOn() ? this.#rects().at(-1) : undefined;
      if (rect) {
        const ids = new Set(this.#layout.visible.slice(rect.left, rect.right + 1).map((c) => c.leaf.id));
        columns = columns.filter((c) => ids.has(c.id));
        items = this.#items.slice(rect.top, rect.bottom + 1);
      }
    } else items = this.#csvRows(spec, options.groups ?? 'rows');
    if (options.pinned === true && spec !== 'range') items = [...this.#pinnedRows.top, ...items, ...this.#pinnedRows.bottom];
    const placed = new Map(this.#layout.visible.map((c) => [c.leaf.id, c]));
    const depth = Math.max(0, ...columns.map((c) => this.#leafPath(c.id).length));
    const headerRows: DataGridExportHeaderCell[][] = [];
    for (let level = 0; level < depth; level++) {
      const run: DataGridExportHeaderCell[] = [];
      for (const c of columns) {
        const group = this.#leafPath(c.id)[level];
        const last = run.at(-1);
        if (last && last.id !== null && group?.id === last.id) run[run.length - 1] = { ...last, span: last.span + 1 };
        else run.push({ id: group?.id ?? null, text: group?.header ?? '', span: 1 });
      }
      headerRows.push(run);
    }
    const opened = this.#options.groupDefaultExpanded ?? 0;
    const open = (node: GroupNode<Row>): boolean => this.#expanded.get(node.id) ?? (opened === -1 || node.level < opened);
    const closedAbove = (node: GroupNode<Row> | null): boolean => {
      for (let n = node; n; n = n.parent) if (!open(n)) return true;
      return false;
    };
    const rows = items.map((item): DataGridExportRow<Row> => {
      const d = item.display;
      const kind = d?.kind === 'group' && !d.node.item ? 'group' : d?.kind === 'total' ? 'total' : 'data';
      const node = d?.kind === 'group' ? d.node : d?.kind === 'total' ? d.node : null;
      const parent = d?.kind === 'data' ? d.parent : node?.parent ?? null;
      const level = d?.kind === 'data' ? d.level : d?.kind === 'group' ? d.node.level : (d?.kind === 'total' ? (d.node?.level ?? -1) + 1 : 0);
      return {
        kind,
        id: item.id,
        row: kind === 'data' || (d?.kind === 'group' && d.node.item) ? this.#displayRow(item) : null,
        level,
        collapsed: d?.kind === 'group' ? !open(d.node) : false,
        hidden: closedAbove(d?.kind === 'total' ? (node ?? null) : parent),
        cells: columns.map((c) => this.#exportCell(item, c, textAll)),
      };
    });
    return {
      columns: columns.map((def) => ({ id: def.id, header: def.header, def, width: placed.get(def.id)?.width ?? def.width ?? 120, pinned: placed.get(def.id)?.section === 'start' ? 'start' : placed.get(def.id)?.section === 'end' ? 'end' : null })),
      headerRows,
      rows,
      locale: this.#config.locale,
      timezone: this.#config.timezone,
    };
  }

  #exportCell(item: GridItem<Row>, def: DataGridColumn<Row>, textAll: boolean): DataGridExportCell {
    const d = item.display;
    if (isGroupColumn(def.id) || (d && d.kind !== 'data' && !(d.kind === 'group' && d.node.item && !def.aggregate))) {
      const text = this.#itemText(item, def);
      if (isGroupColumn(def.id) || !d || !def.aggregate) return { value: text === '' ? null : text, text };
      const values = d.kind === 'group' ? d.node.aggregates : d.kind === 'total' ? (d.node ? d.node.aggregates : this.#grand) : null;
      const value = values?.get(def.id) ?? null;
      if (def.showAs && typeof value === 'number') {
        const node = d.kind === 'group' ? d.node : d.kind === 'total' ? d.node : null;
        const parent = def.showAs === 'percentOfParent' ? node?.parent : null;
        const base = (parent ? parent.aggregates : this.#grandAll).get(def.id);
        return { value: typeof base === 'number' && base !== 0 ? value / base : null, text, percent: true };
      }
      return { value, text };
    }
    const row = this.#displayRow(item);
    const value = this.#engineColumns.get(def.id)?.accessor(row);
    const plain = value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' || isPlainDate(value) || isInstantLike(value);
    return { value: value ?? null, text: textAll || def.format || !plain ? this.#cellText(def, value, row) : '' };
  }

  #leafPath(id: string): readonly DataGridColumnGroup<Row>[] {
    return this.#leaves.find((l) => l.id === id)?.path ?? [];
  }

  #csvColumns(spec: 'visible' | 'all' | readonly string[]): DataGridColumn<Row>[] {
    const usable = (d: DataGridColumn<Row>): boolean => !isUtilityColumn(d.id) && d.exportable !== false;
    if (spec === 'visible') return this.#layout.visible.map((c) => c.leaf.def).filter(usable);
    if (spec === 'all') {
      const byId = new Map(this.#leaves.map((l) => [l.id, l.def]));
      return displayOrder(this.#leaves, this.#columnState.order).flatMap((id) => {
        const def = byId.get(id);
        return def && usable(def) ? [def] : [];
      });
    }
    return spec.map((id) => {
      const def = this.#leafDef(id);
      if (!def || isUtilityColumn(id)) throw configurationError('DATA_GRID_CSV', 'Unknown CSV export column.', { component: 'dataGrid', property: 'dataGrid.toCsv.columns', expected: 'ids of existing columns' });
      return def;
    });
  }

  /** The rows of an export (no detail or loading rows). */
  #csvRows(spec: 'filtered' | 'page' | 'selected' | 'all', groups: 'rows' | 'none'): readonly GridItem<Row>[] {
    const exportable = (item: GridItem<Row>): boolean => item.display === undefined || item.display.kind === 'data' || item.display.kind === 'group' || item.display.kind === 'total';
    if (spec === 'page') return this.#items.filter(exportable);
    if (this.#server) {
      const loaded = this.#display.filter(exportable);
      return spec === 'selected' ? loaded.filter((item) => item.display?.kind !== 'total' && item.display?.kind !== 'group' && this.#isRowSelected(item.id)) : loaded;
    }
    // Flat rows: #display is every filtered row with the grand total rows (before paging).
    if (spec === 'filtered') return groups === 'none' ? this.#sorted : this.#grouped() || this.#pivot() !== null ? this.#displayItems(true) : this.#display.filter(exportable);
    // Every row in sort order, ignoring the filters.
    const sorts = this.#sorts.filter((s) => this.#leafDef(s.column)?.sortable !== false);
    const all = this.#sorter.sort(this.#source, sorts, this.#engineColumns, this.#config.locale, this.#source.length);
    return spec === 'selected' ? all.filter((item) => this.#isRowSelected(item.id)) : all;
  }

  #csvCell(item: GridItem<Row>, def: DataGridColumn<Row>, raw: boolean, indent: string, callback: DataGridCsvOptions<Row>['value']): CsvValue {
    const d = item.display;
    const kind = d?.kind === 'group' && !d.node.item ? 'group' : d?.kind === 'total' ? 'total' : 'data';
    const numeric = (def.type === 'number' || def.type === 'currency') && !def.format;
    let out: CsvValue;
    let value: unknown;
    if (isGroupColumn(def.id) || (d && d.kind !== 'data' && !(d.kind === 'group' && d.node.item && !def.aggregate))) {
      const text = this.#itemText(item, def);
      const level = d?.kind === 'data' ? d.level : d?.kind === 'group' ? d.node.level : 0;
      // Group and tree labels show their level; aggregates of number columns are Intl text.
      out = isGroupColumn(def.id) ? { text: text === '' ? '' : indent.repeat(level) + text, trusted: false } : { text, trusted: numeric };
    } else {
      const row = this.#displayRow(item);
      value = this.#engineColumns.get(def.id)?.accessor(row);
      if (raw) {
        if (typeof value === 'number') out = { text: Number.isFinite(value) ? String(value) : '', trusted: true };
        else if (typeof value === 'boolean') out = { text: String(value), trusted: true };
        else if (isPlainDate(value)) out = { text: plainDateToString(value), trusted: true };
        else if (isInstantLike(value)) out = { text: instantToString(instant(value.epochMilliseconds)), trusted: true };
        else out = { text: isFormulaErrorValue(value) ? value.error : plainText(value), trusted: false };
      } else out = { text: this.#cellText(def, value, row), trusted: numeric && typeof value === 'number' };
    }
    if (!callback) return out;
    const custom = callback({ kind, column: def.id, row: kind === 'data' || (d?.kind === 'group' && d.node.item) ? this.#displayRow(item) : null, value, text: out.text });
    if (custom === undefined) return out;
    // Numbers and booleans cannot carry a formula; strings from callbacks are untrusted.
    if (typeof custom === 'number') return { text: Number.isFinite(custom) ? String(custom) : '', trusted: true };
    if (typeof custom === 'boolean') return { text: String(custom), trusted: true };
    return { text: custom ?? '', trusted: false };
  }

  /** Pivot mode: the current pivot (as set), or null. */
  getPivot(): DataGridPivot | null {
    const p = this.#options.pivot;
    return p ? { rows: [...p.rows], columns: [...p.columns], values: p.values.map((v) => ({ ...v })) } : null;
  }

  /** Pivot mode: set the pivot (null leaves pivot mode). Emits nothing. */
  setPivot(pivot: DataGridPivot | null): void {
    this.#setPivot(pivot === null ? null : parsePivot(pivot), false);
  }

  /** Pivot mode: result columns shown and in total when `pivotMaxColumns` left some out, else null. */
  getPivotTruncation(): { shown: number; total: number } | null {
    return this.#pivotTruncated ? { ...this.#pivotTruncated } : null;
  }

  /** Master/detail: expand or collapse a master row's details. Returns false for rows without details. Emits nothing. */
  setDetailExpanded(rowId: string, expanded: boolean): boolean {
    const item = this.#source.find((i) => i.id === rowId);
    const detail = this.#options.detail;
    if (!item || !detail || (detail.isMaster && !detail.isMaster(item.row))) return false;
    this.#toggleDetail(rowId, expanded, false);
    return true;
  }

  /** Master/detail: whether a master row's details are expanded. */
  isDetailExpanded(rowId: string): boolean {
    return this.#options.detail ? this.#detailExpanded(rowId) : false;
  }

  /** Tree data: ids of rows whose parent is missing or would form a cycle (shown as root rows). */
  getTreeOrphans(): string[] {
    return [...this.#treeOrphans];
  }

  /** The groups of the current grouping: ids, keys, counts, aggregates, and children. */
  getGroups(): DataGridGroup[] {
    const map = (nodes: readonly GroupNode<Row>[]): DataGridGroup[] => nodes.map((n) => ({ id: n.id, column: n.column, key: n.key, count: this.#groupCount(n) ?? 0, aggregates: Object.fromEntries(n.aggregates), children: map(n.groups) }));
    return map(this.#groups);
  }

  #setAllExpanded(expanded: boolean): void {
    const walk = (nodes: readonly GroupNode<Row>[]): void => {
      for (const n of nodes) {
        this.#expanded.set(n.id, expanded);
        walk(n.groups);
      }
    };
    walk(this.#groups);
    this.#flatten();
    this.#paginate();
    this.#generation++;
    this.#renderNow();
  }

  /** Rows that pass the filters (before paging). */
  get filteredRowCount(): number {
    return this.#filteredCount;
  }

  #refilter(): void {
    this.#page = 1;
    this.#sortRows();
    this.#viewport.scrollTop = 0;
    this.#generation++;
    // Header cells are updated in place: rebuilding them would drop a focused floating input.
    this.#syncFilterUi();
    this.#renderNow();
  }

  /** Announce the number of rows after a user filter change. */
  #announceResults(): void {
    const n = this.#filteredCount;
    const locale = this.#config.locale;
    announce(n === 1 ? getMessage('dataGrid', 'resultsOne', {}, locale) : getMessage('dataGrid', 'results', { count: formatNumber(n, {}, locale) }, locale), 'polite', this.#doc);
  }

  /** A user change from the filter UI: apply, announce, and emit. */
  protected userFilterChange(): void {
    this.#announceResults();
    emit(this.host, 'aui-filter-change', { filters: this.getFilters(), quickFilter: this.#quickFilter, advancedFilter: this.getAdvancedFilter() } satisfies DataGridFilterChangeDetail);
  }

  // ---- Filter UI -----------------------------------------------------------------------------

  #filterUiColumn(def: DataGridColumn<Row>): FilterUiColumn {
    return { id: def.id, header: def.header, kind: def.filter ?? 'text', business: def.businessCalendar !== undefined };
  }

  /** A filter change made in the filter UI: validate, apply, announce, and emit. */
  #commitUserFilter(column: string, draft: FilterDraft): void {
    if (this.#destroyed) return;
    const kind = this.#filterKind(column);
    if (!kind) return;
    const next = Object.fromEntries(Object.entries(this.#filters).filter(([id]) => id !== column));
    if (draft !== null) next[column] = parseFilter(draft, kind, `filters.${column}`);
    this.#filters = next;
    this.#refilter();
    this.userFilterChange();
  }

  /** Distinct displayed values of a column for its set filter: blanks first, then sorted (numbers and dates by value). */
  #setValues(def: DataGridColumn<Row>): (string | null)[] {
    if (def.filterValues) return [...new Set(def.filterValues)];
    const locale = this.#config.locale;
    const cached = this.#setValueCache.get(def.id);
    // Transactions and setRows replace the source list, so its identity tells whether the values are current.
    if (cached?.source === this.#source && cached.locale === locale) return cached.values;
    const values = this.#extractSetValues(def);
    this.#setValueCache.set(def.id, { source: this.#source, locale, values });
    return values;
  }

  #extractSetValues(def: DataGridColumn<Row>): (string | null)[] {
    const column = this.#filterColumn(def);
    const raw = new Map<string, unknown>();
    let blanks = false;
    for (const item of this.#source) {
      const t = column.text(item.row);
      if (t.trim() === '') blanks = true;
      else if (!raw.has(t)) raw.set(t, column.value(item.row));
    }
    const collator = new Intl.Collator(this.#config.locale, { numeric: true });
    const key = (v: unknown): number | bigint | null => {
      if (typeof v === 'number') return Number.isNaN(v) ? null : v;
      if (typeof v === 'bigint') return v;
      if (isPlainDate(v)) return v.year * 10_000 + v.month * 100 + v.day;
      if (isInstantLike(v)) return v.epochMilliseconds;
      return null;
    };
    const keys = new Map([...raw].map(([t, v]) => [t, key(v)]));
    const texts = [...raw.keys()].sort((a, b) => {
      const ka = keys.get(a) ?? null;
      const kb = keys.get(b) ?? null;
      if (ka !== null && kb !== null) {
        const d = typeof ka === 'bigint' && typeof kb === 'bigint' ? (ka < kb ? -1 : ka > kb ? 1 : 0) : Number(ka) - Number(kb);
        if (d !== 0) return d;
      }
      return collator.compare(a, b);
    });
    return blanks ? [null, ...texts] : texts;
  }

  /** The cached filter button of a column (kept across header renders). */
  #filterButton(column: string): HTMLButtonElement {
    let button = this.#filterButtons.get(column);
    if (!button) {
      button = this.#doc.createElement('button');
      button.type = 'button';
      // A widget inside the header: F2 reaches it, Tab does not stop on it.
      button.tabIndex = -1;
      button.className = 'aui-data-grid__filter-button';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      this.#filterButtons.set(column, button);
    }
    button.replaceChildren(renderIcon(this.#options.icons?.filter ?? 'filter', { className: 'aui-data-grid__filter-icon', doc: this.#doc }));
    return button;
  }

  /** Filter button and state text of a filterable leaf header. */
  #decorateFilterHeader(el: HTMLDivElement, column: string): void {
    const def = this.#leafDef(column);
    if (!def) return;
    const doc = this.#doc;
    // The header is named by one composed text (header, sort priority, filter state), never by the button inside it.
    const name = doc.createElement('span');
    name.className = 'aui-data-grid__visually-hidden aui-data-grid__header-name';
    name.id = createId('aui-data-grid-header');
    name.setAttribute('aria-hidden', 'true');
    const button = this.#filterButton(column);
    button.setAttribute('aria-label', getMessage('dataGrid', 'filterColumn', { column: def.header }, this.#config.locale));
    el.append(name, button);
    el.setAttribute('aria-labelledby', name.id);
    this.#syncFilterHeader(el, column);
  }

  /** Accessory buttons in a data column's header; the header keeps one composed name (never the buttons'). */
  #decorateHeaderButtons(el: HTMLDivElement, column: string, header: string): void {
    const doc = this.#doc;
    for (const b of this.#headerButtons) {
      const button = doc.createElement('button');
      button.type = 'button';
      // A widget inside the header: F2 reaches it, Tab does not stop on it.
      button.tabIndex = -1;
      button.className = `aui-data-grid__header-button ${b.key}`;
      button.dataset.headerButton = b.key;
      button.setAttribute('aria-label', b.label(header));
      button.setAttribute('aria-haspopup', b.popup ?? 'menu');
      button.append(renderIcon(b.icon, { className: 'aui-data-grid__header-button-icon', doc }));
      el.append(button);
    }
    if (!el.querySelector('.aui-data-grid__header-name')) {
      const name = doc.createElement('span');
      name.className = 'aui-data-grid__visually-hidden aui-data-grid__header-name';
      name.id = createId('aui-data-grid-header');
      name.setAttribute('aria-hidden', 'true');
      el.append(name);
      el.setAttribute('aria-labelledby', name.id);
    }
    this.#syncFilterHeader(el, column);
  }

  #syncFilterHeader(el: HTMLElement, column: string): void {
    const active = column in this.#filters;
    el.classList.toggle('aui-data-grid__header-cell--filtered', active);
    this.#filterButtons.get(column)?.classList.toggle('aui-data-grid__filter-button--active', active);
    const name = el.querySelector('.aui-data-grid__header-name');
    if (!name) return;
    const label = el.querySelector('.aui-data-grid__header-label')?.textContent ?? '';
    const priority = el.querySelector('.aui-data-grid__visually-hidden:not(.aui-data-grid__header-name)')?.textContent ?? '';
    name.textContent = `${label}${priority}${active ? `, ${getMessage('dataGrid', 'filtered', {}, this.#config.locale)}` : ''}`;
  }

  /** Reflect the filters in header indicators, floating filters, and the search box (in place). */
  #syncFilterUi(): void {
    this.#notifyAccessories();
    for (const el of this.#headerCells.values()) {
      const column = el.dataset.column;
      if (column !== undefined && this.#filterButtons.has(column)) this.#syncFilterHeader(el, column);
    }
    for (const [id, { control }] of this.#floating) control.sync(this.#filters[id]);
    const input = this.#searchInput;
    if (input && this.#doc.activeElement !== input && input.value !== this.#quickFilter) input.value = this.#quickFilter;
    this.#advancedBar?.sync(this.#advanced);
  }

  /** The floating filter row: one cell per visible column, a compact control for filterable ones. */
  #floatingRow(): HTMLDivElement {
    const doc = this.#doc;
    const layout = this.#layout;
    const level = layout.levels;
    const tr = doc.createElement('div');
    tr.className = 'aui-data-grid__header-row aui-data-grid__floating-row';
    tr.setAttribute('role', 'row');
    tr.setAttribute('aria-rowindex', String(level + 1));
    for (const section of ['start', 'center', 'end'] as const) {
      for (const col of layout[section]) {
        const cell = doc.createElement('div');
        cell.className = 'aui-data-grid__floating-cell';
        cell.setAttribute('role', 'gridcell');
        cell.dataset.column = col.leaf.id;
        cell.dataset.level = String(level);
        cell.setAttribute('aria-colindex', String(col.colIndex));
        cell.tabIndex = -1;
        this.#placeCell(cell, col.width, section, col.x, layout[`${section}Width`]);
        const control = this.#floatingControl(col.leaf.def);
        if (control) {
          control.sync(this.#filters[col.leaf.id]);
          cell.append(control.element);
        }
        this.#floatingCells.set(col.leaf.id, cell);
        tr.append(cell);
      }
    }
    return tr;
  }

  #floatingControl(def: DataGridColumn<Row>): FloatingFilter | null {
    if (!def.filter) return null;
    const { locale, filterDelay } = this.#config;
    const key = [locale, def.filter, def.header, String(def.businessCalendar !== undefined), String(filterDelay)].join('|');
    const cached = this.#floating.get(def.id);
    if (cached?.key === key) return cached.control;
    cached?.control.destroy();
    const control = createFloatingFilter({
      doc: this.#doc,
      locale,
      column: this.#filterUiColumn(def),
      delay: filterDelay,
      commit: (draft) => {
        this.#commitUserFilter(def.id, draft);
      },
      openPanel: (anchor) => {
        this.#openFilterPanel(def.id, anchor);
      },
    });
    this.#floating.set(def.id, { key, control });
    return control;
  }

  /** Drop cached filter widgets whose column is no longer shown; close a panel that lost its anchor. */
  #pruneFilterWidgets(): void {
    for (const [id, button] of this.#filterButtons) if (!button.isConnected) this.#filterButtons.delete(id);
    for (const [id, { control }] of this.#floating) {
      if (control.element.isConnected) continue;
      control.destroy();
      this.#floating.delete(id);
    }
    const panel = this.#panel;
    if (panel && !panel.triggers.some((t) => t.isConnected)) this.#closeFilterPanel(false);
  }

  /**
   * Open the filter panel of a column, anchored to `anchor` (a floating control) or the header's
   * filter button. A non-modal dialog: Escape closes it and returns focus; moving focus or
   * pointing outside closes it; pending typed changes apply on close.
   */
  #openFilterPanel(column: string, anchor: HTMLElement | null): void {
    const def = this.#leafDef(column);
    if (!def?.filter || this.#destroyed || this.#panel?.column === column) return;
    this.#closeFilterPanel(false);
    const placed = this.#layout.visible.find((c) => c.leaf.id === column);
    if (placed) {
      this.#ensureColumnVisible(placed);
      this.#renderNow();
    }
    const button = this.#filterButtons.get(column);
    const target = anchor ?? (button?.isConnected ? button : null);
    if (!target) return;
    const { locale, direction } = this.#config;
    const panel = createFilterPanel({
      doc: this.#doc,
      locale,
      column: this.#filterUiColumn(def),
      filter: this.#filters[column],
      maxConditions: this.#config.maxFilterConditions,
      delay: this.#config.filterDelay,
      values: () => this.#setValues(def),
      commit: (draft) => {
        this.#commitUserFilter(column, draft);
      },
    });
    const el = panel.element;
    el.dir = direction;
    el.classList.toggle('aui-data-grid__filter-panel--static', !shouldAnimate());
    this.host.append(el);
    const triggers = button && button !== target ? [target, button] : [target];
    const popover = openPopover(el, {
      inside: triggers,
      onDismiss: (reason) => {
        this.#closeFilterPanel(reason === 'escape');
      },
    });
    const stopPosition = autoPosition(target, el, { placement: 'bottom-start', offset: 4, direction });
    for (const t of triggers) {
      if (t.getAttribute('aria-haspopup') !== 'dialog') continue;
      t.setAttribute('aria-expanded', 'true');
      t.setAttribute('aria-controls', el.id);
    }
    el.addEventListener('focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && !el.contains(next) && !triggers.some((t) => t.contains(next))) this.#closeFilterPanel(false);
    });
    this.#panel = { column, panel, popover, stopPosition, anchor, triggers };
    if (!focusFirst(el, { preventScroll: true })) el.focus({ preventScroll: true });
  }

  /** Close the open filter panel (applying pending changes). Focus returns when asked or when it was inside. */
  #closeFilterPanel(returnFocus: boolean): void {
    const p = this.#panel;
    if (!p) return;
    this.#panel = null;
    const el = p.panel.element;
    const hadFocus = el.contains(this.#doc.activeElement);
    p.panel.flush();
    p.stopPosition();
    p.popover.close();
    p.panel.destroy();
    el.remove();
    for (const t of p.triggers) {
      if (t.getAttribute('aria-haspopup') !== 'dialog') continue;
      t.setAttribute('aria-expanded', 'false');
      t.removeAttribute('aria-controls');
    }
    if (this.#destroyed || !(returnFocus || hadFocus)) return;
    if (p.anchor?.isConnected) {
      p.anchor.focus({ preventScroll: true });
      return;
    }
    const leaf = this.#leaves.find((l) => l.id === p.column);
    if (leaf && this.#layout.visible.some((c) => c.leaf.id === p.column)) this.#moveFocus({ rowId: null, column: p.column, level: leaf.path.length }, true);
  }

  /** Keys on a floating filter cell (the header level below the column headers). */
  #onFloatingKey(event: KeyboardEvent, pos: Focus, left: string, right: string): void {
    const { key } = event;
    const layout = this.#layout;
    const visible = layout.visible;
    const index = Math.max(0, this.#columnIndex(pos.column));
    const at = (i: number): Focus | null => {
      const col = visible[i];
      return col ? { rowId: null, column: col.leaf.id, level: layout.levels } : null;
    };
    if (event.altKey && key === 'ArrowDown') {
      event.preventDefault();
      this.#openFilterPanel(pos.column, null);
      return;
    }
    let next: Focus | null;
    switch (key) {
      case 'Enter':
      case 'F2': {
        event.preventDefault();
        const cell = this.#floatingCells.get(pos.column);
        (cell ? this.#firstWidget(cell) : null)?.focus();
        return;
      }
      case 'ArrowUp': {
        const header = this.#headerAt(layout.levels - 1, index);
        next = header ? { rowId: null, column: header.column, level: header.level } : null;
        break;
      }
      case 'ArrowDown': {
        const item = this.#navItem(0);
        next = item ? { rowId: item.id, column: pos.column, level: 0 } : null;
        break;
      }
      case 'Home':
        next = at(0);
        break;
      case 'End':
        next = at(visible.length - 1);
        break;
      default:
        if (key === left) next = at(index - 1);
        else if (key === right) next = at(index + 1);
        else return;
    }
    event.preventDefault();
    if (next) this.#moveFocus(next, true);
  }

  /** The toolbar above the grid (search box, advanced filter bar). */
  #ensureToolbar(): HTMLDivElement {
    if (!this.#toolbar) {
      const bar = this.#doc.createElement('div');
      bar.className = 'aui-data-grid__toolbar';
      this.host.insertBefore(bar, this.#main ?? this.#viewport);
      this.#toolbar = bar;
    }
    return this.#toolbar;
  }

  /** Filterable columns for the advanced filter (all leaves with a filter kind). */
  #advancedColumns(): AdvancedUiColumn[] {
    return this.#leaves.filter((l) => l.def.filter).map((l) => ({ id: l.id, header: l.def.header, kind: l.def.filter ?? 'text', business: l.def.businessCalendar !== undefined }));
  }

  /** The expression bar (option `advancedFilter`), rebuilt when the locale changes. */
  #renderAdvancedBar(): void {
    const on = this.#options.advancedFilter === true;
    const locale = this.#config.locale;
    if (this.#advancedBar && (!on || this.#advancedBar.element.dataset.locale !== locale)) {
      this.#advancedBar.destroy();
      this.#advancedBar.element.remove();
      this.#advancedBar = null;
    }
    if (!on || this.#advancedBar) {
      this.#advancedBar?.sync(this.#advanced);
      return;
    }
    const bar = createAdvancedBar({
      doc: this.#doc,
      locale,
      columns: () => this.#advancedColumns(),
      values: (id) => {
        const def = this.#leafDef(id);
        return def ? this.#setValues(def) : [];
      },
      commit: (filter) => {
        this.#commitAdvanced(filter);
      },
      openBuilder: () => {
        this.#openBuilder();
      },
    });
    bar.element.dataset.locale = locale;
    this.#ensureToolbar().append(bar.element);
    this.#advancedBar = bar;
    bar.sync(this.#advanced);
  }

  /** A change from the expression bar or the builder: validate, apply, announce, and emit. */
  #commitAdvanced(filter: unknown): void {
    if (this.#destroyed) return;
    this.#advanced = parseAdvancedFilter(filter, (id) => this.#filterKind(id), 'advancedFilterModel');
    this.#refilter();
    this.userFilterChange();
  }

  #openBuilder(): void {
    if (this.#builder || this.#destroyed) return;
    this.#builder = openAdvancedBuilder({
      doc: this.#doc,
      locale: this.#config.locale,
      columns: this.#advancedColumns(),
      filter: this.#advanced,
      values: (id) => {
        const def = this.#leafDef(id);
        return def ? this.#setValues(def) : [];
      },
      commit: (draft) => {
        this.#commitAdvanced(draft);
      },
      closed: () => {
        this.#builder = null;
        // Back to the button that opened the builder (the dialog restores focus only when it had it).
        this.#advancedBar?.builderButton.focus();
      },
    });
  }

  /** The search box above the grid (option `searchBox`): sets the quick filter as the user types. */
  #renderSearchBox(): void {
    const doc = this.#doc;
    const locale = this.#config.locale;
    this.#renderAdvancedBar();
    if (this.#options.searchBox !== true) {
      this.#searchInput?.closest('.aui-data-grid__search-region')?.remove();
      this.#searchInput = null;
      if (this.#toolbar && this.#toolbar.childElementCount === 0) {
        this.#toolbar.remove();
        this.#toolbar = null;
      }
      return;
    }
    const bar = this.#ensureToolbar();
    let input = this.#searchInput;
    if (!input) {
      const label = doc.createElement('label');
      label.className = 'aui-data-grid__search';
      const caption = doc.createElement('span');
      caption.className = 'aui-data-grid__search-label';
      const field = doc.createElement('input');
      field.type = 'search';
      field.className = 'aui-data-grid__filter-control aui-data-grid__search-input';
      field.autocomplete = 'off';
      field.spellcheck = false;
      field.value = this.#quickFilter;
      label.append(caption, field);
      // A search landmark around the search box only.
      const landmark = doc.createElement('div');
      landmark.className = 'aui-data-grid__search-region';
      landmark.setAttribute('role', 'search');
      landmark.append(label);
      bar.prepend(landmark);
      const view = doc.defaultView ?? window;
      const apply = (): void => {
        if (this.#searchTimer) view.clearTimeout(this.#searchTimer);
        this.#searchTimer = 0;
        if (this.#destroyed || field.value === this.#quickFilter) return;
        this.#quickFilter = field.value;
        this.#refilter();
        this.userFilterChange();
      };
      field.addEventListener('input', () => {
        if (this.#searchTimer) view.clearTimeout(this.#searchTimer);
        this.#searchTimer = view.setTimeout(apply, this.#config.filterDelay);
      });
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          apply();
        }
      });
      this.#searchInput = field;
      input = field;
    }
    input.closest('[role="search"]')?.setAttribute('aria-label', getMessage('dataGrid', 'searchLandmark', { label: this.#options.label }, locale));
    const caption = bar.querySelector('.aui-data-grid__search-label');
    if (caption) caption.textContent = getMessage('dataGrid', 'search', {}, locale);
    if (doc.activeElement !== input && input.value !== this.#quickFilter) input.value = this.#quickFilter;
  }

  /** Slice the current page (clamping the page) and rebuild row offsets. */
  #paginate(): void {
    const size = this.#pageSize;
    if (size === null) {
      this.#page = 1;
      this.#items = this.#display;
    } else {
      const pages = Math.max(1, Math.ceil(this.#display.length / size));
      this.#page = Math.min(Math.max(1, this.#page), pages);
      this.#items = this.#display.slice((this.#page - 1) * size, this.#page * size);
    }
    this.#items = this.#withDetails(this.#items);
    this.#pageOffset = size === null ? 0 : (this.#page - 1) * size;
    this.#indexCache = null;
    const option = this.#options.rowHeight;
    const detail = this.#options.detail;
    const overrides = this.#rowHeightOverrides;
    if (typeof option === 'function' || detail || overrides.size > 0) {
      const base = this.#rowHeightFn();
      const height = (item: Item<Row> | undefined): number => (item ? (overrides.get(item.id) ?? base(item)) : base(item));
      const fixed = typeof detail?.height === 'number' ? detail.height : DETAIL_HEIGHT;
      this.#heights.reset(this.#items.length, (i) => {
        const item = this.#items[i];
        return item?.display?.kind === 'detail' ? (detail?.height === 'auto' ? (this.#detailMeasured.get(item.id) ?? fixed) : fixed) : height(item);
      });
    } else {
      this.#heights.resetUniform(this.#items.length, typeof option === 'number' ? option : DENSITY_HEIGHT[this.#config.density]);
    }
    this.#pinnedSync();
    this.#notifyAccessories();
    if (this.#focus?.rowId && !this.#focus.rowId.startsWith('loading:') && !this.#pinnedById.has(this.#focus.rowId) && !this.#index().has(this.#focus.rowId)) this.#focus = this.#items[0] ? { rowId: this.#items[0].id, column: this.#focus.column, level: 0 } : null;
  }

  #rowHeightFn(): (item: Item<Row> | undefined) => number {
    const option = this.#options.rowHeight;
    const base = typeof option === 'number' ? option : DENSITY_HEIGHT[this.#config.density];
    if (typeof option === 'function') {
      return (item) => {
        if (!item) return base;
        const h = option(item.row);
        return typeof h === 'number' && Number.isFinite(h) && h >= 1 ? h : base;
      };
    }
    return () => base;
  }

  #applySort(sort: DataGridOptions<Row>['sort'], announceIt: boolean): void {
    const list = sort === null || sort === undefined ? [] : Array.isArray(sort) ? [...(sort as readonly DataGridSort[])] : [sort as DataGridSort];
    const known = new Set(this.#leaves.map((l) => l.id));
    const seen = new Set<string>();
    this.#sorts = list.filter((s) => known.has(s.column) && !seen.has(s.column) && seen.add(s.column)).map((s) => ({ column: s.column, direction: s.direction }));
    if (announceIt) this.#announceSort();
  }

  #toggleSort(column: string, additive: boolean): void {
    const def = this.#leafDef(column);
    if (!def || def.sortable === false) return;
    const current = this.#sorts.find((s) => s.column === column);
    const next: DataGridSort['direction'] | null = !current ? 'ascending' : current.direction === 'ascending' ? 'descending' : this.#config.sortCycle === 'tri-state' ? null : 'ascending';
    if (additive && this.#config.multiSort) {
      const rest = this.#sorts.filter((s) => s.column !== column);
      this.#sorts = next ? (current ? this.#sorts.map((s) => (s.column === column ? { column, direction: next } : s)) : [...rest, { column, direction: next }]) : rest;
    } else {
      this.#sorts = next ? [{ column, direction: next }] : [];
    }
    this.#sortRows();
    this.#generation++;
    this.#animateNextRender();
    this.#renderHeader();
    this.#renderNow();
    this.#announceSort();
    emit(this.host, 'aui-sort-change', { sort: this.sort } satisfies DataGridSortChangeDetail);
  }

  #announceSort(): void {
    const locale = this.#config.locale;
    if (this.#sorts.length === 0) {
      announce(getMessage('dataGrid', 'sortCleared', {}, locale), 'polite', this.#doc);
      return;
    }
    const columns = this.#sorts
      .map((s) => getMessage('dataGrid', 'sortedColumn', { column: this.#leafDef(s.column)?.header ?? s.column, direction: getMessage('dataGrid', s.direction, {}, locale) }, locale))
      .join('; ');
    announce(getMessage('dataGrid', 'sorted', { columns }, locale), 'polite', this.#doc);
  }

  #leafDef(id: string): DataGridColumn<Row> | undefined {
    return this.#leaves.find((l) => l.id === id)?.def;
  }

  // ---- Host, listeners -------------------------------------------------------------------

  #applyHostOptions(): void {
    const o = this.#options;
    const host = this.host;
    host.dir = this.#config.direction;
    host.classList.toggle('aui-data-grid--auto', o.layout === 'auto');
    host.classList.toggle('aui-data-grid--compact', this.#config.density === 'compact');
    host.classList.toggle('aui-data-grid--spacious', this.#config.density === 'spacious');
    this.element.setAttribute('aria-label', o.label);
    this.#description.textContent = o.description ?? '';
    if (o.description) this.element.setAttribute('aria-describedby', this.#description.id);
    else this.element.removeAttribute('aria-describedby');
    this.element.toggleAttribute('aria-busy', o.loading === true || this.#serverBusy());
    // Grouped rows form a tree: rows carry levels and expansion.
    this.element.setAttribute('role', this.#grouped() || this.#options.detail ? 'treegrid' : 'grid');
    if (o.rowSelection?.mode === 'multiple' || this.#cellSelectionOn()) this.element.setAttribute('aria-multiselectable', 'true');
    else this.element.removeAttribute('aria-multiselectable');
    this.host.style.setProperty('--aui-data-grid-header-row-height', `${String(HEADER_HEIGHT[this.#config.density])}px`);
    this.#renderSearchBox();
    this.#renderGroupPanel();
    this.#renderPivotPanel();
    this.#renderOverlay();
  }

  #listen(): void {
    const g = this.#group;
    g.listen(this.#viewport, 'scroll', () => {
      this.#schedule();
    });
    g.add(
      observeResize(this.#viewport, () => {
        const width = this.#viewport.clientWidth;
        const height = this.#viewport.clientHeight;
        if (width === this.#viewportWidth && height === this.#viewportHeight) return;
        const widthChanged = width !== this.#viewportWidth;
        this.#viewportWidth = width;
        this.#viewportHeight = height;
        if (widthChanged && this.#leaves.some((l) => l.def.flex !== undefined)) {
          this.#layout = layoutColumns(this.#leaves, this.#groupDefs, this.#stateForLayout(), width);
          this.#generation++;
          this.#renderHeader();
        }
        this.#schedule();
      }),
    );
    g.listen(this.element, 'keydown', (event) => {
      this.#onKeyDown(event);
    });
    g.listen(this.element, 'click', (event) => {
      this.#onClick(event);
    });
    this.#listenRowDrag();
    this.#listenFileDrop();
    this.#listenFormulaPointer();
    this.#group.add(() => {
      this.#printOut?.remove();
      this.#printOut = null;
    });
    this.#listenPillDrag();
    let resizing: { rowId: string; height: number } | null = null;
    const rowResize = trackPointerDrag(this.#body, {
      threshold: 1,
      canStart: (event) => {
        const handle = event.button === 0 && event.target instanceof Element ? event.target.closest('.aui-data-grid__row-resizer') : null;
        const rowId = handle?.closest<HTMLElement>('.aui-data-grid__row')?.dataset.rowId;
        const index = rowId === undefined ? undefined : this.#index().get(rowId);
        if (!handle || rowId === undefined || index === undefined || this.#detailContentOf(handle)) return false;
        resizing = { rowId, height: this.#heights.height(index) };
        return true;
      },
      onMove: (move) => {
        if (resizing) this.#resizeRow(resizing.rowId, resizing.height + move.dy, false);
      },
      onEnd: (move) => {
        if (resizing) this.#resizeRow(resizing.rowId, resizing.height + move.dy, true);
        resizing = null;
      },
      onCancel: () => {
        if (resizing) this.#resizeRow(resizing.rowId, resizing.height, false);
        resizing = null;
      },
    });
    g.add(() => {
      rowResize.dispose();
    });
    const rangeDrag = trackPointerDrag(this.#body, {
      threshold: 4,
      canStart: (event) => !(event.target instanceof Element && event.target.closest('.aui-data-grid__drag-handle')) && this.#onRangePointerDown(event),
      onMove: (move) => {
        this.#onRangeDrag(move.point.x, move.point.y);
      },
      onEnd: () => {
        this.#emitRanges(true);
        this.#announceRange();
      },
      onCancel: () => {
        this.#emitRanges(true);
      },
    });
    g.add(() => {
      rangeDrag.dispose();
    });
    g.listen(this.#doc, 'copy', (event) => {
      this.#onCopy(event);
    });
    g.listen(this.#doc, 'cut', (event) => {
      if (this.#onCopy(event)) this.#clearCells('cut');
    });
    g.listen(this.#doc, 'paste', (event) => {
      this.#onPaste(event);
    });
    const fillDrag = trackPointerDrag(this.#body, {
      threshold: 2,
      canStart: (event) => event.button === 0 && event.target instanceof Element && event.target.closest('.aui-data-grid__fill-handle') !== null && !this.#detailContentOf(event.target),
      onMove: (move) => {
        this.#onFillDrag(move.point.x, move.point.y);
      },
      onEnd: () => {
        this.#finishFill();
      },
      onCancel: () => {
        this.#fillPreview = null;
        this.#paintRanges();
      },
    });
    g.add(() => {
      fillDrag.dispose();
    });
    // Alt while filling repeats a series (or counts up from a single value).
    g.listen(this.#doc, 'pointermove', (event) => {
      this.#fillAlt = event.altKey;
    }, { capture: true });
    g.listen(this.#body, 'dblclick', (event) => {
      if (event.target instanceof Element && event.target.closest('.aui-data-grid__fill-handle') && !this.#detailContentOf(event.target)) {
        event.stopPropagation();
        this.#fillToEnd();
      }
    });
    g.listen(this.element, 'dblclick', (event) => {
      const cell = this.#cellFromEvent(event);
      if (cell?.rowId == null) return;
      const group = this.#displayOf(cell.rowId);
      if (group?.kind === 'group' && this.#expandable(group.node) && (!group.node.item || isGroupColumn(cell.column))) this.#toggleRowGroup(group.node, !group.expanded);
      else if (this.#editableAt(cell.rowId, cell.column)) this.#startEditing(cell.rowId, cell.column, null);
      else this.#activate(cell.rowId, cell.column);
    });
    g.listen(this.element, 'focusin', (event) => {
      const cell = this.#cellFromEvent(event);
      if (!cell) return;
      const changed = !this.#focus || this.#focus.rowId !== cell.rowId || this.#focus.column !== cell.column || this.#focus.level !== cell.level;
      if (!changed) return;
      this.#focus = cell;
      this.#syncTabStop();
      // Ranges always contain the focused cell: focus moving outside them (Tab, a programmatic focus) clears them.
      if (cell.rowId !== null && this.#ranges.length > 0 && !this.#insideRanges(cell.rowId, cell.column)) this.#setRanges([], true);
      emit(this.host, 'aui-cell-focus', { rowId: cell.rowId, column: cell.column } satisfies DataGridCellFocusDetail);
    });
    const onPage = (event: Event): void => {
      // Re-emitted as aui-page-change; the inner Pagination event stays internal.
      event.stopPropagation();
      const pager = this.#pagination;
      if (!pager) return;
      this.#page = pager.page;
      if (pager.pageSize !== null) this.#pageSize = pager.pageSize;
      this.#paginate();
      this.#viewport.scrollTop = 0;
      this.#generation++;
      this.#renderNow();
      emit(this.host, 'aui-page-change', { page: this.#page, pageSize: this.#pageSize } satisfies DataGridPageChangeDetail);
    };
    const pagerHost = this.#pagerHost;
    pagerHost.addEventListener('aui-change', onPage);
    g.add(() => {
      pagerHost.removeEventListener('aui-change', onPage);
      this.#pagination?.destroy();
      this.#pagination = null;
    });
    g.add(
      dataGridConfig.subscribe(() => {
        this.#config = DataGrid.#resolve(this.#options);
        this.#applyHostOptions();
        this.#generation++;
        this.#renderHeader();
        this.#renderNow();
      }),
    );
    g.add(() => {
      const view = this.#doc.defaultView ?? window;
      if (this.#frame) view.cancelAnimationFrame(this.#frame);
      if (this.#queueTimer) view.clearTimeout(this.#queueTimer);
      if (this.#animTimer) view.clearTimeout(this.#animTimer);
      if (this.#rangeAnnounce) view.clearTimeout(this.#rangeAnnounce);
    });
  }

  #schedule(): void {
    if (this.#frame || this.#destroyed) return;
    const view = this.#doc.defaultView;
    if (!view) {
      this.#renderBody();
      return;
    }
    this.#frame = view.requestAnimationFrame(() => {
      this.#frame = 0;
      if (!this.#destroyed) this.#renderBody();
    });
  }

  #renderNow(): void {
    if (this.#frame) {
      (this.#doc.defaultView ?? window).cancelAnimationFrame(this.#frame);
      this.#frame = 0;
    }
    this.#viewportWidth = this.#viewport.clientWidth || this.#viewportWidth;
    this.#viewportHeight = this.#viewport.clientHeight || this.#viewportHeight;
    this.#renderBody();
  }

  // ---- Geometry --------------------------------------------------------------------------

  #rowWidth(): number {
    const l = this.#layout;
    return l.startWidth + l.centerWidth + l.endWidth;
  }

  #headerHeight(): number {
    return this.#head.offsetHeight || HEADER_HEIGHT[this.#config.density] * this.#headLevels();
  }

  /** Header rows, including the floating filter row. */
  #headLevels(): number {
    return this.#layout.levels + (this.#floatingOn() ? 1 : 0);
  }

  /** The floating filter row is shown (not with the advanced filter, which replaces column filters). */
  #floatingOn(): boolean {
    return this.#options.floatingFilters === true && this.#options.advancedFilter !== true;
  }

  /** Scroll space of the body (capped) and the mapping from scroll position to content offset. */
  #scrollGeometry(): { bodyHeight: number; contentTop: (scrollTop: number) => number } {
    const total = this.#heights.total;
    if (total <= MAX_SCROLL_HEIGHT) return { bodyHeight: total, contentTop: (t) => t };
    const visible = Math.max(1, this.#viewportHeight - this.#headerHeight());
    const ratio = (total - visible) / (MAX_SCROLL_HEIGHT - visible);
    return { bodyHeight: MAX_SCROLL_HEIGHT, contentTop: (t) => t * ratio };
  }

  #scrollX(): number {
    return Math.abs(this.#viewport.scrollLeft);
  }

  // ---- Rendering: header -----------------------------------------------------------------

  #renderHeader(): void {
    const doc = this.#doc;
    const layout = this.#layout;
    const width = this.#rowWidth();
    this.element.setAttribute('aria-rowcount', this.#rowCountText());
    this.element.setAttribute('aria-colcount', String(layout.visible.length));
    this.element.style.setProperty('inline-size', `${String(width)}px`);
    this.#head.style.setProperty('inline-size', `${String(width)}px`);
    const rows: HTMLDivElement[] = [];
    this.#headerCells.clear();
    this.#floatingCells.clear();
    // Cached widgets (filter buttons, floating inputs) move into the new cells; keep their focus.
    const active = doc.activeElement;
    const refocus = active instanceof HTMLElement && this.#head.contains(active) && !active.matches('[role="columnheader"], [role="gridcell"]') ? active : null;
    for (let level = 0; level < layout.levels; level++) {
      const tr = doc.createElement('div');
      tr.className = 'aui-data-grid__header-row';
      tr.setAttribute('role', 'row');
      tr.setAttribute('aria-rowindex', String(level + 1));
      const levelCells = layout.header[level];
      if (!levelCells) continue;
      for (const section of ['start', 'center', 'end'] as const) {
        for (const cell of levelCells[section]) tr.append(this.#headerCell(cell, section, level));
      }
      rows.push(tr);
    }
    if (this.#floatingOn()) rows.push(this.#floatingRow());
    this.#head.replaceChildren(...rows);
    this.#pruneFilterWidgets();
    if (refocus?.isConnected && doc.activeElement !== refocus) refocus.focus({ preventScroll: true });
    // Floating filters, the search box, and the expression bar reflect the current filters.
    this.#syncFilterUi();
    this.#syncTabStop();
  }

  #headerCell(cell: HeaderCell<Row>, section: Section, level: number): HTMLDivElement {
    const doc = this.#doc;
    const el = doc.createElement('div');
    const layout = this.#layout;
    if (cell.kind === 'filler') {
      el.className = 'aui-data-grid__header-filler';
      el.setAttribute('aria-hidden', 'true');
      this.#placeCell(el, cell.column.width, section, cell.column.x, cell.column.width);
      return el;
    }
    el.setAttribute('role', 'columnheader');
    el.tabIndex = -1;
    if (cell.kind === 'group') {
      const g = cell.group;
      const first = cell.columns[0];
      el.className = 'aui-data-grid__header-cell aui-data-grid__group-header';
      el.dataset.column = g.id;
      el.dataset.level = String(level);
      el.setAttribute('aria-colindex', String(first?.colIndex ?? 1));
      if (cell.columns.length > 1) el.setAttribute('aria-colspan', String(cell.columns.length));
      const label = doc.createElement('span');
      label.className = 'aui-data-grid__header-label';
      label.textContent = g.header;
      el.append(label);
      if (g.collapsible) {
        const collapsed = this.#columnState.collapsed[g.id] ?? g.collapsed ?? false;
        el.setAttribute('aria-expanded', String(!collapsed));
        const icons = this.#options.icons;
        el.append(renderIcon(collapsed ? (icons?.expand ?? 'chevron-right') : (icons?.collapse ?? 'chevron-down'), { className: 'aui-data-grid__group-icon', doc }));
      }
      if (g.headerTooltip) el.title = g.headerTooltip;
      if (this.#isMovable(g.id)) this.#bindMove(el, g.id);
      this.#placeCell(el, cell.width, section, cell.x, layout[`${section}Width`]);
      this.#headerCells.set(`${String(level)}:${g.id}`, el);
      return el;
    }
    const col = cell.column;
    const def = col.leaf.def;
    if (isUtilityColumn(col.leaf.id)) return this.#selectHeader(el, col, section, level, cell.rowSpan);
    el.className = 'aui-data-grid__header-cell';
    el.dataset.column = col.leaf.id;
    el.dataset.level = String(level);
    el.setAttribute('aria-colindex', String(col.colIndex));
    if (cell.rowSpan > 1) {
      el.setAttribute('aria-rowspan', String(cell.rowSpan));
      el.style.setProperty('--aui-data-grid-span', String(cell.rowSpan));
      el.classList.add('aui-data-grid__header-cell--span');
    }
    if (def.wrapHeader) el.classList.add('aui-data-grid__header-cell--wrap');
    const align = def.align ?? (def.type === 'number' || def.type === 'currency' ? 'end' : 'start');
    if (align !== 'start') el.classList.add(`aui-data-grid__cell--${align}`);
    const label = doc.createElement('span');
    label.className = 'aui-data-grid__header-label';
    label.textContent = def.header;
    el.append(label);
    const sortIndex = this.#sorts.findIndex((s) => s.column === col.leaf.id);
    const sortable = def.sortable !== false;
    if (sortable) {
      el.classList.add('aui-data-grid__header-cell--sortable');
      const sort = this.#sorts[sortIndex];
      if (sort && sortIndex === 0) el.setAttribute('aria-sort', sort.direction);
      const icons = this.#options.icons;
      const ref = sort ? (sort.direction === 'ascending' ? (icons?.sortAscending ?? 'arrow-up') : (icons?.sortDescending ?? 'arrow-down')) : (icons?.sortNone ?? 'arrow-up-down');
      el.append(renderIcon(ref, { className: `aui-data-grid__sort-icon${sort ? '' : ' aui-data-grid__sort-icon--none'}`, doc }));
      if (sort && this.#sorts.length > 1) {
        const priority = doc.createElement('span');
        priority.className = 'aui-data-grid__sort-priority';
        priority.textContent = String(sortIndex + 1);
        priority.setAttribute('aria-hidden', 'true');
        const spoken = doc.createElement('span');
        spoken.className = 'aui-data-grid__visually-hidden';
        spoken.textContent = `, ${getMessage('dataGrid', 'sortPriority', { priority: sortIndex + 1 }, this.#config.locale)}`;
        el.append(priority, spoken);
      }
    }
    if (def.filter && this.#options.advancedFilter !== true) this.#decorateFilterHeader(el, col.leaf.id);
    if (this.#headerButtons.length > 0 && !isGeneratedColumn(col.leaf.id)) this.#decorateHeaderButtons(el, col.leaf.id, def.header);
    // The title is the header's accessible description (its name comes from the text).
    if (def.headerTooltip) el.title = def.headerTooltip;
    if (def.resizable !== false) {
      const handle = doc.createElement('div');
      handle.className = 'aui-data-grid__resize';
      handle.setAttribute('aria-hidden', 'true');
      this.#bindResize(handle, col);
      el.append(handle);
    }
    if (this.#isMovable(col.leaf.id)) this.#bindMove(el, col.leaf.id);
    this.#placeCell(el, col.width, section, col.x, layout[`${section}Width`]);
    this.#headerCells.set(`${String(level)}:${col.leaf.id}`, el);
    return el;
  }

  /** Width and, for pinned sections, the sticky offset (logical, so right-to-left mirrors). */
  #placeCell(el: HTMLElement, width: number, section: Section, x: number, sectionWidth: number): void {
    el.style.setProperty('inline-size', `${String(width)}px`);
    if (section === 'start') {
      el.classList.add('aui-data-grid__cell--pinned-start');
      el.style.setProperty('inset-inline-start', `${String(x)}px`);
    } else if (section === 'end') {
      el.classList.add('aui-data-grid__cell--pinned-end');
      el.style.setProperty('inset-inline-end', `${String(sectionWidth - x - width)}px`);
    }
  }

  #bindResize(handle: HTMLElement, col: PlacedColumn<Row>): void {
    let startWidth = 0;
    const rtl = (): boolean => this.#config.direction === 'rtl';
    const drag = trackPointerDrag(handle, {
      threshold: 0,
      onStart: () => {
        startWidth = this.#layout.visible.find((c) => c.leaf.id === col.leaf.id)?.width ?? col.width;
        handle.classList.add('aui-data-grid__resize--active');
      },
      onMove: (move) => {
        const delta = rtl() ? -move.dx : move.dx;
        this.#columnState.widths[col.leaf.id] = clampWidth(col.leaf.def, startWidth + delta);
        this.#relayout(null);
      },
      onEnd: () => {
        handle.classList.remove('aui-data-grid__resize--active');
        emit(this.host, 'aui-columns-change', { reason: 'resize', columns: this.getColumnsState() } satisfies DataGridColumnsChangeDetail);
      },
      onCancel: () => {
        handle.classList.remove('aui-data-grid__resize--active');
        this.#columnState.widths[col.leaf.id] = startWidth;
        this.#relayout(null);
      },
    });
    this.#group.add(() => {
      drag.dispose();
    });
    handle.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      this.autoSizeColumns([col.leaf.id]);
    });
    handle.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  // ---- Rendering: body -------------------------------------------------------------------

  #renderBody(): void {
    // A focused cell may be rebuilt (its row object changed): focus moves to its replacement.
    const active = this.#doc.activeElement;
    const hadFocus = active instanceof HTMLElement && this.#body.contains(active) ? active : null;
    this.#rendering = true;
    const layout = this.#layout;
    const width = this.#rowWidth();
    const { bodyHeight, contentTop } = this.#scrollGeometry();
    this.#body.style.setProperty('block-size', `${String(Math.max(bodyHeight, this.#items.length === 0 ? this.#emptyHeight() : 0))}px`);
    this.#body.style.setProperty('inline-size', `${String(width)}px`);
    // An unknown server row count is -1.
    this.element.setAttribute('aria-rowcount', this.#rowCountText());
    this.#renderEmpty();
    const count = this.#items.length;
    const keep = new Set<string>();
    if (count > 0) {
      const scrollTop = this.#viewport.scrollTop;
      const top = contentTop(scrollTop);
      const visible = Math.max(this.#viewportHeight - this.#headerHeight(), DENSITY_HEIGHT[this.#config.density]);
      const overscan = this.#config.overscan;
      const first = Math.max(0, this.#heights.indexAt(top) - overscan);
      const last = Math.min(count - 1, this.#heights.indexAt(top + visible) + overscan);
      const indexes: number[] = [];
      for (let i = first; i <= last; i++) indexes.push(i);
      this.#spanCache.clear();
      for (const def of this.#spanColumns.rows) {
        const { start } = this.#rowSpan(first, def);
        if (start < first) indexes.push(start);
      }
      if (this.#server) this.#ensureDisplay(this.#pageOffset + first, this.#pageOffset + last);
      // The focused row stays rendered so focus is never lost while it is scrolled away.
      const focusIndex = this.#focus?.rowId ? this.#index().get(this.#focus.rowId) : undefined;
      if (focusIndex !== undefined && (focusIndex < first || focusIndex > last)) indexes.push(focusIndex);
      const x = this.#scrollX();
      const centerVisible = Math.max(0, this.#viewportWidth - layout.startWidth - layout.endWidth);
      const win = centerWindow(layout.center, x, x + centerVisible);
      const focusColumn = this.#focus ? layout.center.findIndex((c) => c.leaf.id === this.#focus?.column) : -1;
      const firstCol = focusColumn >= 0 ? Math.min(win.first, focusColumn) : win.first;
      const lastCol = focusColumn >= 0 ? Math.max(win.last, focusColumn) : win.last;
      const scaled = this.#heights.total > MAX_SCROLL_HEIGHT;
      for (const index of indexes) {
        const item = this.#itemAt(index);
        if (!item) continue;
        keep.add(item.id);
        let entry = this.#rows.get(item.id);
        if (!entry) {
          entry = this.#createRow(item, index);
          this.#rows.set(item.id, entry);
          this.#body.append(entry.el);
        }
        const offset = this.#heights.offset(index);
        const y = scaled ? scrollTop + (offset - top) : offset;
        if (item.display?.kind === 'detail') this.#updateDetailRow(entry, item, item.display.master, item.display.level, index, y, width);
        else if (this.#singleCellColumn(item)) this.#updateFullRow(entry, item, index, y, width);
        else this.#updateRow(entry, item, index, y, width, firstCol, lastCol);
      }
    }
    this.#renderPinned(keep, width);
    this.#renderSticky(keep, width);
    for (const [id, entry] of this.#rows) {
      if (!keep.has(id)) {
        this.#dropRow(entry);
        this.#rows.delete(id);
      }
    }
    this.#syncTabStop();
    this.#renderPagination();
    this.#paintRanges();
    this.#rendering = false;
    // An editor whose row left the rendered rows (filtered out, removed) is discarded.
    const editing = this.#editing;
    if (editing && [...editing.editors.values()].some((o) => !o.popup && !o.wrapper.isConnected)) this.#closeEditor();
    if (hadFocus && this.#doc.activeElement !== hadFocus) {
      if (hadFocus.isConnected) hadFocus.focus({ preventScroll: true });
      else this.#focusTarget()?.focus({ preventScroll: true });
    }
  }

  #renderPagination(): void {
    const size = this.#pageSize;
    const total = this.#display.length;
    if (size === null) {
      this.#pagination?.destroy();
      this.#pagination = null;
      this.#pagerHost.hidden = true;
      return;
    }
    this.#pagerHost.hidden = total === 0;
    const sizes = this.#options.pageSizes;
    const options: PaginationOptions = {
      total,
      pageSize: size,
      page: this.#page,
      label: getMessage('dataGrid', 'pagination', { label: this.#options.label }, this.#config.locale),
      locale: this.#config.locale,
      direction: this.#config.direction,
      ...(sizes === undefined ? {} : { pageSizes: sizes }),
    };
    if (this.#pagination) this.#pagination.update(options);
    else this.#pagination = Pagination.create(this.#pagerHost, options);
  }

  /** aria-rowcount: header rows, pinned rows, and the rows (-1 while a server count is unknown). */
  #rowCountText(): string {
    return this.#server && !this.#server.known ? '-1' : String(this.#headLevels() + this.#pinnedRows.top.length + Math.max(this.#items.length, 1) + this.#pinnedRows.bottom.length);
  }

  #emptyHeight(): number {
    return DENSITY_HEIGHT[this.#config.density] * 2;
  }

  #renderEmpty(): void {
    const empty = this.#items.length === 0 && !this.#busyOverlay();
    if (!empty) {
      this.#emptyRow?.remove();
      this.#emptyRow = null;
      return;
    }
    if (!this.#emptyRow) {
      const row = this.#doc.createElement('div');
      row.className = 'aui-data-grid__empty-row';
      row.setAttribute('role', 'row');
      const cell = this.#doc.createElement('div');
      cell.className = 'aui-data-grid__empty';
      cell.setAttribute('role', 'gridcell');
      row.append(cell);
      this.#emptyRow = row;
      this.#body.append(row);
    }
    this.#emptyRow.setAttribute('aria-rowindex', String(this.#headLevels() + this.#pinnedRows.top.length + 1));
    const cell = this.#emptyRow.firstElementChild;
    if (cell instanceof HTMLElement) {
      cell.setAttribute('aria-colindex', '1');
      cell.setAttribute('aria-colspan', String(Math.max(1, this.#layout.visible.length)));
      const locale = this.#config.locale;
      const failed = this.#server && !this.#serverTemplate ? this.#server.stateAt(0) : null;
      cell.classList.toggle('aui-data-grid__cell--failed', failed?.state === 'failed');
      if (failed?.state === 'failed') {
        // The first block failed: the message and Retry take the empty row.
        const text = this.#doc.createElement('span');
        text.textContent = getMessage('dataGrid', 'rowsFailed', { message: failed.error }, locale);
        const retry = this.#doc.createElement('button');
        retry.type = 'button';
        retry.className = 'aui-data-grid__retry';
        retry.textContent = getMessage('dataGrid', 'rowsRetry', {}, locale);
        cell.replaceChildren(text, retry);
        return;
      }
      const noMatches = this.#source.length > 0;
      cell.textContent = noMatches ? getMessage('dataGrid', 'noMatches', {}, this.#config.locale) : (this.#options.emptyMessage ?? getMessage('dataGrid', 'empty', {}, this.#config.locale));
    }
  }

  /** The loading overlay shows: the `loading` option, or a datasource that has not answered yet. */
  #busyOverlay(): boolean {
    const server = this.#server;
    return this.#options.loading === true || (server !== null && this.#serverTemplate === null && server.busy);
  }

  #renderOverlay(): void {
    const loading = this.#busyOverlay();
    const overlay = this.#overlay;
    if (overlay.hidden === !loading) return;
    overlay.hidden = !loading;
    if (loading) {
      overlay.replaceChildren(renderIcon(this.#options.icons?.loading ?? 'spinner', { className: 'aui-data-grid__spinner', doc: this.#doc }));
      const text = this.#doc.createElement('span');
      text.textContent = getMessage('dataGrid', 'loading', {}, this.#config.locale);
      overlay.append(text);
      announce(text.textContent, 'polite', this.#doc);
    } else {
      overlay.replaceChildren();
    }
  }

  #createRow(item: Item<Row>, index: number): RowEntry<Row> {
    const el = this.#doc.createElement('div');
    el.className = 'aui-data-grid__row';
    el.setAttribute('role', 'row');
    el.dataset.rowId = item.id;
    const entry: RowEntry<Row> = { el, item, index, generation: -1, cells: new Map(), nodes: new Map(), leading: null, trailing: null, measure: null, texts: new Map() };
    const detail = (item as GridItem<Row>).display?.kind === 'detail';
    if (detail ? this.#options.detail?.height === 'auto' : this.#options.autoRowHeight) {
      el.classList.add('aui-data-grid__row--auto');
      const dispose = observeResize(el, () => {
        this.#onRowMeasured(entry);
      });
      entry.measure = dispose;
    }
    return entry;
  }

  #onRowMeasured(entry: RowEntry<Row>): void {
    const index = this.#index().get(entry.item.id);
    if (index === undefined) return;
    const measured = entry.el.offsetHeight;
    if (measured <= 0) return;
    if ((entry.item as GridItem<Row>).display?.kind === 'detail') this.#detailMeasured.set(entry.item.id, measured);
    const above = index < this.#heights.indexAt(this.#scrollGeometry().contentTop(this.#viewport.scrollTop));
    const delta = this.#heights.set(index, measured);
    if (delta === 0) return;
    // Keep the content in view still when a row above it changes height.
    if (above) this.#viewport.scrollTop += delta;
    this.#schedule();
  }

  #updateRow(entry: RowEntry<Row>, item: Item<Row>, index: number, y: number, width: number, firstCol: number, lastCol: number): void {
    const el = entry.el;
    const layout = this.#layout;
    // A row re-renders when the grid changed (generation) or its row object was replaced.
    // Placeholders are made anew on each change of the server rows (their loading or failed state).
    const rebuild = entry.generation !== this.#generation || entry.item.row !== item.row || (entry.item !== item && (item as GridItem<Row>).display?.kind === 'loading');
    entry.item = item;
    entry.index = index;
    el.setAttribute('aria-rowindex', String(this.#headLevels() + this.#pinnedRows.top.length + index + 1));
    this.#paintGroupRow(el, item);
    el.classList.remove('aui-data-grid__row--full');
    if (this.#options.detail) {
      // Master/detail grids are tree grids: rows have a level; master rows carry their details' expansion.
      const shown: GridItem<Row> = item;
      if (!shown.display) el.setAttribute('aria-level', '1');
      if (this.#isMaster(shown)) el.setAttribute('aria-expanded', String(this.#detailExpanded(item.id)));
      else if (shown.display?.kind !== 'group') el.removeAttribute('aria-expanded');
    }
    el.style.setProperty('inset-block-start', `${String(y)}px`);
    el.style.setProperty('inline-size', `${String(width)}px`);
    const height = this.#heights.height(index);
    if (this.#options.autoRowHeight) el.style.setProperty('min-block-size', `${String(this.#rowHeightFn()(item))}px`);
    else el.style.setProperty('block-size', `${String(height)}px`);
    el.classList.toggle('aui-data-grid__row--odd', index % 2 === 1);
    this.#paintSelection(el, item.id);
    const rules = this.#options.rowClassRules;
    if (rules) for (const [name, test] of Object.entries(rules)) el.classList.toggle(name, test(item.row));
    if (rebuild) {
      for (const cell of entry.cells.values()) cell.remove();
      for (const id of [...entry.cells.keys()]) this.#releaseCell(entry, id);
      entry.cells.clear();
      entry.generation = this.#generation;
    }
    // Order: pinned start, leading spacer, center window, trailing spacer, pinned end.
    const wanted: HTMLElement[] = [];
    const spanning = this.#spanColumns;
    const spans = spanning.cols ? this.#colSpans(item) : null;
    const rendered = new Set<string>();
    const add = (col: PlacedColumn<Row>): void => {
      const cell = spanning.any ? this.#spanCell(entry, col, index, spans) : this.#cell(entry, col);
      if (!cell) return;
      wanted.push(cell);
      rendered.add(col.leaf.id);
    };
    for (const col of layout.start) add(col);
    const leading = (entry.leading ??= this.#spacer());
    const center = layout.center;
    // A column span starting left of the window still draws its cell.
    let from = firstCol;
    const coveredFirst = spans?.covered.get(center[firstCol]?.leaf.id ?? '');
    if (coveredFirst !== undefined) {
      const at = center.findIndex((c) => c.leaf.id === coveredFirst);
      if (at >= 0 && at < from) from = at;
    }
    const firstX = center[from]?.x ?? 0;
    leading.style.setProperty('inline-size', `${String(lastCol >= firstCol ? firstX : layout.centerWidth)}px`);
    wanted.push(leading);
    for (let i = from; i <= lastCol; i++) {
      const col = center[i];
      if (col) add(col);
    }
    const lastColumn = center[lastCol];
    const trailing = (entry.trailing ??= this.#spacer());
    trailing.style.setProperty('inline-size', `${String(lastColumn ? layout.centerWidth - lastColumn.x - lastColumn.width : 0)}px`);
    wanted.push(trailing);
    for (const col of layout.end) add(col);
    // Drop cells that left the window.
    for (const [id, cell] of entry.cells) {
      if (!rendered.has(id)) {
        cell.remove();
        this.#releaseCell(entry, id);
        entry.cells.delete(id);
      }
    }
    // Reorder only when needed (DOM moves are the expensive part).
    let node = el.firstElementChild;
    let inOrder = el.childElementCount === wanted.length;
    for (const w of wanted) {
      if (node !== w) {
        inOrder = false;
        break;
      }
      node = node.nextElementSibling;
    }
    if (!inOrder) el.replaceChildren(...wanted);
    if (this.#options.rowNumbers) this.#paintRowNumber(entry, index);
    if (this.#options.rowDragging) this.#paintDragHandle(entry);
    if (this.#decorators.size > 0) this.#paintDecorations(entry);
  }

  /** A detail row: one cell spanning every column, as wide as the viewport (it does not scroll sideways). */
  #updateDetailRow(entry: RowEntry<Row>, item: Item<Row>, master: Item<Row>, level: number, index: number, y: number, width: number): void {
    const el = entry.el;
    entry.item = item;
    entry.index = index;
    entry.generation = this.#generation;
    el.classList.add('aui-data-grid__row--detail');
    el.setAttribute('aria-rowindex', String(this.#headLevels() + this.#pinnedRows.top.length + index + 1));
    el.setAttribute('aria-level', String(level + 1));
    el.style.setProperty('inset-block-start', `${String(y)}px`);
    el.style.setProperty('inline-size', `${String(width)}px`);
    if (this.#options.detail?.height === 'auto') el.style.setProperty('min-block-size', '24px');
    else el.style.setProperty('block-size', `${String(this.#heights.height(index))}px`);
    let cell = entry.cells.get(DETAIL_COLUMN);
    if (!cell) {
      cell = this.#doc.createElement('div');
      cell.className = 'aui-data-grid__detail-cell';
      cell.setAttribute('role', 'gridcell');
      cell.dataset.column = DETAIL_COLUMN;
      cell.setAttribute('aria-colindex', '1');
      cell.tabIndex = -1;
      entry.cells.set(DETAIL_COLUMN, cell);
      el.replaceChildren(cell);
    }
    cell.setAttribute('aria-colspan', String(Math.max(1, this.#layout.visible.length)));
    cell.style.setProperty('inline-size', `${String(Math.min(width, this.#viewportWidth || width))}px`);
    const content = this.#detailContent(master);
    if (content.parentElement !== cell) cell.replaceChildren(content);
  }

  #spacer(): HTMLDivElement {
    const s = this.#doc.createElement('div');
    s.className = 'aui-data-grid__spacer';
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  #cell(entry: RowEntry<Row>, col: PlacedColumn<Row>): HTMLDivElement {
    const existing = entry.cells.get(col.leaf.id);
    if (existing) return existing;
    const doc = this.#doc;
    const def = col.leaf.def;
    const cell = doc.createElement('div');
    cell.className = 'aui-data-grid__cell';
    cell.setAttribute('role', 'gridcell');
    cell.dataset.column = col.leaf.id;
    cell.setAttribute('aria-colindex', String(col.colIndex));
    cell.tabIndex = -1;
    const align = def.align ?? (def.type === 'number' || def.type === 'currency' ? 'end' : 'start');
    if (align !== 'start') cell.classList.add(`aui-data-grid__cell--${align}`);
    if (def.wrapText) cell.classList.add('aui-data-grid__cell--wrap');
    const extra = def.cellClass?.(entry.item.row);
    if (extra) for (const token of typeof extra === 'string' ? extra.split(/\s+/) : extra) if (CLASS_TOKEN.test(token)) cell.classList.add(token);
    this.#placeCell(cell, col.width, col.section, col.x, this.#layout[`${col.section}Width`]);
    this.#fillCell(entry, cell, col);
    entry.cells.set(col.leaf.id, cell);
    return cell;
  }

  #fillCell(entry: RowEntry<Row>, cell: HTMLDivElement, col: PlacedColumn<Row>): void {
    const def = col.leaf.def;
    const row = this.#displayRow(entry.item);
    const open = this.#editing?.rowId === entry.item.id ? this.#editing.editors.get(def.id) : undefined;
    if (open && !open.popup) {
      cell.classList.add('aui-data-grid__cell--editing');
      // The editor covers the cell: the cell is not a separate focus target while it is edited.
      cell.removeAttribute('tabindex');
      cell.append(open.wrapper);
      return;
    }
    const display = (entry.item as GridItem<Row>).display;
    if (display?.kind === 'loading') {
      // Loading rows: a skeleton bar per cell; the first data cell names the state (failed rows: the message and Retry).
      const lead = this.#layout.visible.find((c) => !isGeneratedColumn(c.leaf.id))?.leaf.id === def.id;
      const locale = this.#config.locale;
      if (display.failed !== null) {
        if (!lead) return;
        cell.classList.add('aui-data-grid__cell--failed');
        const text = this.#doc.createElement('span');
        text.className = 'aui-data-grid__text';
        text.textContent = getMessage('dataGrid', 'rowsFailed', { message: display.failed }, locale);
        const retry = this.#doc.createElement('button');
        retry.type = 'button';
        retry.className = 'aui-data-grid__retry';
        retry.tabIndex = -1;
        retry.textContent = getMessage('dataGrid', 'rowsRetry', {}, locale);
        cell.append(text, retry);
        return;
      }
      const bar = this.#doc.createElement('span');
      bar.className = 'aui-data-grid__skeleton';
      bar.setAttribute('aria-hidden', 'true');
      cell.append(bar);
      if (lead) {
        const spoken = this.#doc.createElement('span');
        spoken.className = 'aui-data-grid__visually-hidden';
        spoken.textContent = getMessage('dataGrid', 'rowsLoading', {}, locale);
        cell.append(spoken);
      }
      return;
    }
    const treeParent = display?.kind === 'group' && display.node.item !== undefined;
    if (display && display.kind !== 'data' && !isGroupColumn(def.id) && !(def.id === SELECT_COLUMN && display.kind === 'group') && !(treeParent && !def.aggregate)) {
      // Group and total rows: aggregates in aggregated columns, nothing elsewhere.
      // Without a group column, a total row names itself in the first data column.
      const label = display.kind === 'total' && this.#groupColumnIndex() < 0 && !def.aggregate && this.#layout.visible.find((c) => !isGeneratedColumn(c.leaf.id))?.leaf.id === def.id;
      if (label) cell.append(this.#text(display.node ? getMessage('dataGrid', 'groupTotalOf', { group: this.#groupKeyText(display.node) }, this.#config.locale) : getMessage('dataGrid', 'groupTotal', {}, this.#config.locale)));
      else if (!isUtilityColumn(def.id)) cell.append(this.#text(this.#aggregateText(def, display)));
      return;
    }
    if (display?.kind === 'group' && def.id === SELECT_COLUMN && !treeParent) {
      if (this.#options.rowSelection?.mode === 'multiple' && !display.node.lazy) cell.append(this.#groupSelectBox(display.node));
      return;
    }
    // A pending batch value is marked, and spoken as edited after the content.
    const pending = this.#batch?.get(entry.item.id)?.changes.has(def.id) === true;
    if (pending) cell.classList.add('aui-data-grid__cell--pending');
    const markPending = (): void => {
      if (!pending) return;
      const spoken = this.#doc.createElement('span');
      spoken.className = 'aui-data-grid__visually-hidden';
      spoken.textContent = `, ${getMessage('dataGrid', 'pendingEdit', {}, this.#config.locale)}`;
      cell.append(spoken);
    };
    if (def.render) {
      const out = def.render(row, { doc: this.#doc, column: def.id, rowId: entry.item.id });
      if (typeof out === 'string') {
        cell.append(this.#text(out));
      } else {
        cell.append(out);
        entry.nodes.set(def.id, out);
      }
      markPending();
      return;
    }
    const engine = this.#engineColumns.get(def.id);
    const value = engine ? engine.accessor(row) : undefined;
    const text = this.#cellText(def, value, row);
    cell.append(this.#text(text));
    // Formula errors: the code is shown; its meaning is read out.
    const failed = isFormulaErrorValue(value);
    cell.classList.toggle('aui-data-grid__cell--formula-error', failed);
    if (failed) {
      const why = this.#doc.createElement('span');
      why.className = 'aui-data-grid__visually-hidden';
      why.textContent = `, ${getMessage('dataGrid', FORMULA_ERRORS[value.error] ?? 'formulaErrorOther', {}, this.#config.locale)}`;
      cell.append(why);
    }
    markPending();
    if (def.cellClassRules) for (const [name, test] of Object.entries(def.cellClassRules)) if (CLASS_TOKEN.test(name)) cell.classList.toggle(name, test(value, row));
    const previous = entry.texts.get(def.id);
    entry.texts.set(def.id, text);
    if (previous !== undefined && previous !== text && (this.#options.flashChanges === true || def.flashOnChange === true)) this.#flash(cell);
  }

  /** Highlight a changed cell, then let it fade back (instant with reduced motion). */
  #flash(cell: HTMLElement): void {
    cell.classList.add('aui-data-grid__cell--changed');
    (this.#doc.defaultView ?? window).setTimeout(() => {
      cell.classList.remove('aui-data-grid__cell--changed');
    }, this.#options.flashDuration ?? 800);
  }

  #text(text: string): HTMLSpanElement {
    const span = this.#doc.createElement('span');
    span.className = 'aui-data-grid__text';
    span.textContent = text;
    return span;
  }

  #cellText(def: DataGridColumn<Row>, value: unknown, row: Row): string {
    // Formula errors show their code (#DIV/0!, #REF!, ...).
    if (isFormulaErrorValue(value)) return value.error;
    if (def.format) return def.format(value, row);
    const locale = this.#config.locale;
    switch (def.type ?? 'text') {
      case 'number':
        return typeof value === 'number' && !Number.isNaN(value) ? this.#numberFormat(locale, null).format(value) : '';
      case 'currency':
        return typeof value === 'number' && !Number.isNaN(value) ? this.#numberFormat(locale, def.currency ?? 'USD').format(value) : '';
      case 'date':
        return isPlainDate(value) ? formatPlainDate(value, { dateStyle: 'medium' }, locale) : '';
      case 'datetime':
        // Always the configured time zone, never the machine's.
        return isInstantLike(value) ? formatInstant(value, { dateStyle: 'medium', timeStyle: 'short' }, this.#config.timezone, locale) : '';
      case 'boolean':
        return typeof value === 'boolean' ? getMessage('dataGrid', value ? 'yes' : 'no', {}, locale) : '';
      case 'text':
        return plainText(value);
    }
  }

  /** Number formatters by locale and currency: cell text is formatted per cell (renders, quick and set filters). */
  #numberFormat(locale: string, currency: string | null): Intl.NumberFormat {
    const key = `${locale}|${currency ?? ''}`;
    let format = this.#numberFormats.get(key);
    if (!format) {
      format = new Intl.NumberFormat(locale, currency === null ? {} : { style: 'currency', currency });
      this.#numberFormats.set(key, format);
    }
    return format;
  }

  #releaseCell(entry: RowEntry<Row>, column: string): void {
    const node = entry.nodes.get(column);
    if (node) {
      releaseNode(node);
      entry.nodes.delete(column);
    }
  }

  #dropRow(entry: RowEntry<Row>): void {
    entry.measure?.();
    for (const id of [...entry.nodes.keys()]) this.#releaseCell(entry, id);
    entry.el.remove();
  }

  // ---- Measuring -------------------------------------------------------------------------

  #measureColumn(col: PlacedColumn<Row>): number {
    let max = 0;
    const header = this.#headerCells.get(`${String(col.leaf.path.length)}:${col.leaf.id}`);
    if (header) {
      const label = header.querySelector('.aui-data-grid__header-label');
      const extras = [...header.children].filter((c) => c !== label && !c.classList.contains('aui-data-grid__resize')).reduce((s, c) => s + (c instanceof HTMLElement ? c.offsetWidth : 0), 0);
      max = Math.max(max, (label instanceof HTMLElement ? label.scrollWidth : 0) + extras + this.#cellPadding(header));
    }
    for (const entry of this.#rows.values()) {
      const cell = entry.cells.get(col.leaf.id);
      if (!cell) continue;
      const content = cell.firstElementChild;
      const w = content instanceof HTMLElement ? content.scrollWidth : 0;
      max = Math.max(max, w + this.#cellPadding(cell));
    }
    return Math.ceil(max) || col.width;
  }

  #cellPadding(el: HTMLElement): number {
    const view = this.#doc.defaultView;
    if (!view) return 0;
    const s = view.getComputedStyle(el);
    return (Number.parseFloat(s.paddingInlineStart) || 0) + (Number.parseFloat(s.paddingInlineEnd) || 0) + 2;
  }

  // ---- Focus and keyboard ----------------------------------------------------------------

  /** The grid's own cell an event target is in (inside detail content: the detail cell). */
  #ownCell(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const content = this.#detailContentOf(target);
    if (content) return content.parentElement;
    const cell = target.closest<HTMLElement>('[role="gridcell"], [role="columnheader"]');
    return cell && this.element.contains(cell) ? cell : null;
  }

  #cellFromEvent(event: Event): Focus | null {
    const target = this.#ownCell(event.target);
    if (!target) return null;
    const column = target.dataset.column;
    if (column === undefined) return null;
    // Header cells and floating filter cells carry their header level.
    if (target.dataset.level !== undefined) return { rowId: null, column, level: Number(target.dataset.level) };
    const rowId = target.closest<HTMLElement>('[role="row"]')?.dataset.rowId;
    return rowId === undefined ? null : { rowId, column, level: 0 };
  }

  /** The element that should hold the tab stop now. */
  #focusTarget(): HTMLElement | null {
    // While a cell is edited inline, its editor holds the grid's tab stop (the cell itself is not focusable).
    const open = this.#editing?.editors.get(this.#editing.column);
    if (open && !open.popup && open.wrapper.isConnected) return open.editor.control ?? open.editor.element;
    const f = this.#focus;
    if (f) {
      if (f.rowId === null) {
        const el = f.level === this.#layout.levels ? this.#floatingCells.get(f.column) : this.#headerCells.get(`${String(f.level)}:${f.column}`);
        if (el) return el;
      } else {
        const el = this.#rows.get(f.rowId)?.cells.get(f.column);
        if (el) return el;
        if (this.#spanColumns.any) {
          const owner = this.#spanOwner(f.rowId, f.column);
          const spanned = this.#rows.get(owner.rowId)?.cells.get(owner.column);
          if (spanned) return spanned;
        }
      }
    }
    // Default entry point: the first header cell (or the empty-state cell).
    const first = this.#layout.visible[0];
    if (first) {
      const el = this.#headerCells.get(`${String(first.leaf.path.length)}:${first.leaf.id}`);
      if (el) return el;
    }
    return null;
  }

  #syncTabStop(): void {
    const target = this.#focusTarget();
    for (const el of this.element.querySelectorAll<HTMLElement>('[tabindex="0"]')) if (el !== target && (el.getAttribute('role') === 'gridcell' || el.getAttribute('role') === 'columnheader') && !this.#detailContentOf(el)) el.tabIndex = -1;
    if (target) target.tabIndex = 0;
  }

  #moveFocus(next: Focus, focus: boolean): void {
    this.#focus = next;
    if (next.rowId !== null) {
      const index = this.#index().get(next.rowId);
      if (index !== undefined) this.#ensureRowVisible(index);
    }
    const col = this.#layout.visible.find((c) => c.leaf.id === next.column);
    if (col) this.#ensureColumnVisible(col);
    this.#renderNow();
    if (focus) this.#focusTarget()?.focus({ preventScroll: true });
  }

  #ensureRowVisible(index: number): void {
    const { contentTop } = this.#scrollGeometry();
    const scrollTop = this.#viewport.scrollTop;
    const top = contentTop(scrollTop);
    const visible = Math.max(0, this.#viewportHeight - this.#headerHeight() - this.#pinTop.offsetHeight - this.#pinBottom.offsetHeight);
    const rowTop = this.#heights.offset(index);
    const rowBottom = rowTop + this.#heights.height(index);
    const total = this.#heights.total;
    const scale = total > MAX_SCROLL_HEIGHT ? contentTop(1) || 1 : 1;
    const covered = top + this.#stickyHeight;
    if (rowTop < covered) this.#viewport.scrollTop = scrollTop - (covered - rowTop) / scale;
    else if (rowBottom > top + visible) this.#viewport.scrollTop = scrollTop + (rowBottom - top - visible) / scale;
  }

  #ensureColumnVisible(col: PlacedColumn<Row>): void {
    if (col.section !== 'center') return;
    const layout = this.#layout;
    const x = this.#scrollX();
    const visible = Math.max(0, this.#viewportWidth - layout.startWidth - layout.endWidth);
    let next = x;
    if (col.x < x) next = col.x;
    else if (col.x + col.width > x + visible) next = col.x + col.width - visible;
    if (next !== x) this.#viewport.scrollLeft = this.#config.direction === 'rtl' ? -next : next;
  }

  /** The visible leaf columns in display order and the header cell geometry used for navigation. */
  #columnIndex(column: string): number {
    return this.#layout.visible.findIndex((c) => c.leaf.id === column);
  }

  /** Header cell at `level` covering the visible column at `index` (a group cell, a leaf header, or the spanning leaf above a filler). */
  #headerAt(level: number, index: number): { column: string; level: number } | null {
    const col = this.#layout.visible[index];
    if (!col) return null;
    const depth = col.leaf.path.length;
    if (level >= depth) return { column: col.leaf.id, level: depth };
    const group = col.leaf.path[level];
    return group ? { column: group.id, level } : null;
  }

  /** First visible column index under a header cell. */
  #headerFirstIndex(column: string, level: number): number {
    const visible = this.#layout.visible;
    const i = visible.findIndex((c) => c.leaf.id === column || c.leaf.path[level]?.id === column);
    return Math.max(0, i);
  }

  #onKeyDown(event: KeyboardEvent): void {
    const pos = this.#cellFromEvent(event);
    if (!pos) return;
    const target = event.target;
    const cellEl = this.#ownCell(target);
    // Inside a cell's own widgets (or detail content): only Escape (back to the cell) and F2 are the grid's, unless a widget handled them.
    if (cellEl && target !== cellEl) {
      if (!event.defaultPrevented && (event.key === 'Escape' || event.key === 'F2')) {
        event.preventDefault();
        cellEl.focus();
      }
      return;
    }
    const { key } = event;
    const ctrl = event.ctrlKey || event.metaKey;
    const rtl = this.#config.direction === 'rtl';
    const left = rtl ? 'ArrowRight' : 'ArrowLeft';
    const right = rtl ? 'ArrowLeft' : 'ArrowRight';
    const visible = this.#layout.visible;
    if (pos.rowId === null) {
      this.#onHeaderKey(event, pos, left, right);
      return;
    }
    const rowIndex = this.#navPosition(pos.rowId);
    const bodyIndex = this.#index().get(pos.rowId);
    const colIndex = Math.max(0, this.#columnIndex(pos.column));
    const count = this.#pinnedRows.top.length + this.#items.length + this.#pinnedRows.bottom.length;
    let nextRow = rowIndex;
    let nextCol = colIndex;
    const display = this.#displayOf(pos.rowId);
    const here = bodyIndex === undefined ? undefined : this.#items[bodyIndex];
    if (here && this.#options.detail && !ctrl && !event.altKey) {
      // Master/detail: the toggle column expands and collapses; Tab from a master row's last cell enters its details (Shift+Tab back).
      const master = this.#isMaster(here);
      const open = master && this.#detailExpanded(here.id);
      if (master && !event.shiftKey && pos.column === DETAIL_COLUMN && (key === 'Enter' || (key === right && !open) || (key === left && open))) {
        event.preventDefault();
        this.#toggleDetail(here.id, !open, true);
        return;
      }
      if (key === 'Tab' && !event.shiftKey && open && colIndex === visible.length - 1) {
        event.preventDefault();
        this.#moveFocus({ rowId: `detail:${here.id}`, column: DETAIL_COLUMN, level: 0 }, true);
        const cell = this.#rows.get(`detail:${here.id}`)?.cells.get(DETAIL_COLUMN);
        (cell ? this.#firstWidget(cell) : null)?.focus();
        return;
      }
      if (display?.kind === 'detail') {
        if (key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          const last = visible.at(-1);
          if (last) this.#moveFocus({ rowId: display.master.id, column: last.leaf.id, level: 0 }, true);
          return;
        }
        // One cell: sideways keys stay; Space selects nothing.
        if (key === left || key === right || key === 'Home' || key === 'End' || key === ' ' || key === 'Delete') {
          event.preventDefault();
          return;
        }
      }
    }
    if (display && !ctrl && !event.altKey && !event.shiftKey) {
      // Tree keys: Right expands a collapsed group, Left collapses an expanded one or moves to the parent group; Enter toggles.
      const treeKeys = display.kind === 'group' && this.#expandable(display.node) && (!display.node.item || colIndex <= this.#groupColumnIndex());
      if (display.kind === 'group' && treeKeys && (key === 'Enter' || (key === right && !display.expanded) || (key === left && display.expanded))) {
        event.preventDefault();
        this.#toggleRowGroup(display.node, !display.expanded);
        return;
      }
      const parent = display.kind === 'data' ? display.parent : display.kind === 'group' ? display.node.parent : null;
      if (key === left && parent && colIndex <= Math.max(this.#groupColumnIndex(), this.#groupRowsMode() ? 0 : -1)) {
        event.preventDefault();
        // A parent drawn as one cell takes focus on that cell.
        const at = this.#index().get(parent.id);
        this.#moveFocus({ rowId: parent.id, column: this.#singleCellColumn(at === undefined ? undefined : this.#items[at]) ?? pos.column, level: 0 }, true);
        return;
      }
    }
    if (ctrl && event.shiftKey && !event.altKey && this.#dragOptions() && pos.column === this.#dragColumn() && (key === 'ArrowUp' || key === 'ArrowDown' || key === left || key === right)) {
      const row = this.#source.find((item) => item.id === pos.rowId)?.row;
      if (row !== undefined && this.#dragOptions()?.canDrag?.(row) !== false) {
        event.preventDefault();
        if (this.#keyboardRowMove(pos.rowId, key, left, right)) {
          this.#focus = { rowId: pos.rowId, column: pos.column, level: 0 };
          const index = this.#index().get(pos.rowId);
          if (index !== undefined) this.#ensureRowVisible(index);
          this.#renderNow();
          this.#focusTarget()?.focus({ preventScroll: true });
        }
        return;
      }
    }
    if (event.altKey && !ctrl && !event.shiftKey && pos.column === ROW_NUMBER_COLUMN && this.#rowResizable() && (key === 'ArrowUp' || key === 'ArrowDown')) {
      event.preventDefault();
      const index = this.#index().get(pos.rowId);
      if (index !== undefined) this.#resizeRow(pos.rowId, this.#heights.height(index) + (key === 'ArrowDown' ? 4 : -4), true);
      this.#focusTarget()?.focus({ preventScroll: true });
      return;
    }
    if (!ctrl && !event.altKey && (key === left || key === right || key === 'Home' || key === 'End') && this.#singleCellColumn(here) === FULL_WIDTH_COLUMN) {
      // One cell: sideways keys stay on it.
      event.preventDefault();
      return;
    }
    if (ctrl && !event.altKey && (key === 'z' || key === 'Z' || key === 'y' || key === 'Y')) {
      event.preventDefault();
      if (key === 'y' || key === 'Y' || event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    const printable = key.length === 1 && key !== ' ';
    if (!ctrl && !event.altKey && (key === 'Enter' || key === 'F2' || key === 'Backspace' || printable) && !(cellEl && this.#firstWidget(cellEl)) && this.#editableAt(pos.rowId, pos.column)) {
      event.preventDefault();
      this.#startEditing(pos.rowId, pos.column, printable ? key : key === 'Backspace' ? '' : null);
      return;
    }
    if (this.#cellSelectionOn()) {
      const navigation = NAVIGATION_KEYS.has(key);
      if (navigation && event.shiftKey) {
        event.preventDefault();
        this.#extendRange(pos, key, ctrl, left, right);
        return;
      }
      if (ctrl && (key === 'a' || key === 'A')) {
        event.preventDefault();
        this.#selectAllCells();
        return;
      }
      if (ctrl && (key === 'd' || key === 'D' || key === 'r' || key === 'R')) {
        event.preventDefault();
        this.#fillCopy(key === 'd' || key === 'D' ? 'down' : 'right');
        return;
      }
      // A plain move collapses the ranges to the focused cell.
      if (navigation && this.#ranges.length > 0) this.#setRanges([], true);
    }
    switch (key) {
      case 'ArrowDown':
        nextRow = Math.min(count - 1, rowIndex + 1);
        break;
      case 'ArrowUp':
        if (rowIndex === 0) {
          if (this.#floatingOn()) {
            event.preventDefault();
            this.#moveFocus({ rowId: null, column: pos.column, level: this.#layout.levels }, true);
            return;
          }
          const header = this.#headerAt(this.#layout.levels - 1, colIndex);
          if (header) {
            event.preventDefault();
            this.#moveFocus({ rowId: null, column: header.column, level: header.level }, true);
          }
          return;
        }
        nextRow = rowIndex - 1;
        break;
      case 'PageDown':
      case 'PageUp': {
        const page = Math.max(1, Math.floor((this.#viewportHeight - this.#headerHeight()) / DENSITY_HEIGHT[this.#config.density]) - 1);
        nextRow = key === 'PageDown' ? Math.min(count - 1, rowIndex + page) : Math.max(0, rowIndex - page);
        break;
      }
      case 'Home':
        nextCol = 0;
        if (ctrl) nextRow = 0;
        break;
      case 'End':
        nextCol = visible.length - 1;
        if (ctrl) nextRow = count - 1;
        break;
      case 'Delete':
        event.preventDefault();
        this.#clearCells('delete');
        return;
      case ' ': {
        if (!this.#options.rowSelection) return;
        event.preventDefault();
        const group = this.#displayOf(pos.rowId);
        if (group?.kind === 'group' && !group.node.item) this.#toggleGroupSelection(group.node);
        else this.#userSelect(this.#baseRowId(pos.rowId), event.shiftKey ? 'range' : 'toggle');
        return;
      }
      case 'a':
      case 'A':
        if (!ctrl || this.#options.rowSelection?.mode !== 'multiple') return;
        event.preventDefault();
        this.#toggleAll(true);
        return;
      case 'Enter':
      case 'F2': {
        event.preventDefault();
        const inner = cellEl ? this.#firstWidget(cellEl) : null;
        if (inner) inner.focus();
        else if (key === 'Enter') this.#activate(pos.rowId, pos.column);
        return;
      }
      default:
        if (key === left) nextCol = Math.max(0, colIndex - 1);
        else if (key === right) nextCol = Math.min(visible.length - 1, colIndex + 1);
        else return;
    }
    event.preventDefault();
    let item = this.#navItem(nextRow);
    let col = visible[nextCol];
    if (this.#spanColumns.any && item && col && (nextRow !== rowIndex || nextCol !== colIndex)) {
      const origin = this.#spanOwner(pos.rowId, pos.column);
      const dr = Math.sign(nextRow - rowIndex);
      const dc = Math.sign(nextCol - colIndex);
      for (let guard = 0; guard < MAX_ROW_SPAN && item && col; guard++) {
        const there = this.#spanOwner(item.id, col.leaf.id);
        if (there.rowId !== origin.rowId || there.column !== origin.column) break;
        const r = nextRow + dr;
        const c = nextCol + dc;
        if (r < 0 || r >= count || c < 0 || c >= visible.length) {
          event.preventDefault();
          return;
        }
        nextRow = r;
        nextCol = c;
        item = this.#navItem(nextRow);
        col = visible[nextCol];
      }
      if (item && col) {
        const owner = this.#spanOwner(item.id, col.leaf.id);
        if (owner.rowId !== item.id || owner.column !== col.leaf.id) {
          event.preventDefault();
          this.#moveFocus({ rowId: owner.rowId, column: owner.column, level: 0 }, true);
          return;
        }
      }
    }
    // Leaving a detail row returns to the column it was entered from; entering one focuses its single cell.
    const fromSingle = this.#singleCellColumn(here) !== null;
    if (fromSingle && this.#detailReturn !== null) col = visible[this.#columnIndex(this.#detailReturn)] ?? col;
    const single = this.#singleCellColumn(item);
    if (item && single) {
      if (!fromSingle) this.#detailReturn = col?.leaf.id ?? null;
      this.#moveFocus({ rowId: item.id, column: single, level: 0 }, true);
      return;
    }
    if (item && col) this.#moveFocus({ rowId: item.id, column: col.leaf.id, level: 0 }, true);
  }

  #onHeaderKey(event: KeyboardEvent, pos: Focus, left: string, right: string): void {
    const { key } = event;
    const layout = this.#layout;
    const level = pos.level;
    const index = this.#headerFirstIndex(pos.column, level);
    const isLeaf = this.#leaves.some((l) => l.id === pos.column);
    const group = this.#groupDefs.get(pos.column);
    // Span of the focused header cell (a group covers several columns).
    const span = group ? layout.visible.filter((c) => c.leaf.path[level]?.id === pos.column).length : 1;
    if (level === layout.levels) {
      this.#onFloatingKey(event, pos, left, right);
      return;
    }
    const cellEl = this.#headerCells.get(`${String(level)}:${pos.column}`);
    if (key === 'F2') {
      event.preventDefault();
      const widget = cellEl ? this.#firstWidget(cellEl) : null;
      widget?.focus();
      return;
    }
    if (isLeaf && event.altKey && key === 'ArrowDown') {
      event.preventDefault();
      this.#openFilterPanel(pos.column, null);
      return;
    }
    if ((key === 'Enter' || key === ' ') && pos.column === SELECT_COLUMN) {
      event.preventDefault();
      if (this.#options.rowSelection?.mode === 'multiple') this.#toggleAll(!this.#allSelected());
      return;
    }
    if (isLeaf && key === 'Enter' && this.#columnSelectionOn()) {
      event.preventDefault();
      // Enter selects the column; Alt+Enter sorts (Shift+Alt+Enter adds to the sort).
      if (event.altKey) this.#toggleSort(pos.column, event.shiftKey);
      else this.#selectColumnRange(pos.column, event.ctrlKey || event.metaKey, event.shiftKey);
      return;
    }
    if ((key === 'Enter' || key === ' ') && !event.altKey) {
      event.preventDefault();
      if (isLeaf) this.#toggleSort(pos.column, event.shiftKey);
      else if (group?.collapsible) this.#toggleGroup(group);
      return;
    }
    if (isLeaf && event.altKey && (key === left || key === right)) {
      event.preventDefault();
      const col = layout.visible.find((c) => c.leaf.id === pos.column);
      if (!col || col.leaf.def.resizable === false) return;
      const step = event.shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP;
      const width = clampWidth(col.leaf.def, col.width + (key === right ? step : -step));
      if (width === col.width) return;
      this.#columnState.widths[col.leaf.id] = width;
      this.#relayout('resize');
      this.#moveFocus(pos, true);
      announce(getMessage('dataGrid', 'resized', { column: col.leaf.def.header, width }, this.#config.locale), 'polite', this.#doc);
      return;
    }
    if (event.shiftKey && !event.altKey && (key === left || key === right)) {
      event.preventDefault();
      this.#keyboardMove(pos, key === right);
      return;
    }
    let next: { column: string; level: number } | null = null;
    switch (key) {
      case 'ArrowDown': {
        if ((isLeaf || level + 1 >= layout.levels) && this.#floatingOn()) {
          event.preventDefault();
          this.#moveFocus({ rowId: null, column: layout.visible[index]?.leaf.id ?? pos.column, level: layout.levels }, true);
          return;
        }
        if (isLeaf || level + 1 >= layout.levels) {
          const item = this.#navItem(0);
          if (item) {
            event.preventDefault();
            this.#moveFocus({ rowId: item.id, column: layout.visible[index]?.leaf.id ?? pos.column, level: 0 }, true);
          }
          return;
        }
        next = this.#headerAt(level + 1, index);
        break;
      }
      case 'ArrowUp':
        if (level > 0) next = this.#headerAt(level - 1, index);
        break;
      case 'Home':
        next = this.#headerAt(level, 0);
        break;
      case 'End':
        next = this.#headerAt(level, layout.visible.length - 1);
        break;
      default:
        if (key === left && index > 0) next = this.#headerAt(level, index - 1);
        else if (key === right && index + span < layout.visible.length) next = this.#headerAt(level, index + span);
        else if (key !== left && key !== right) return;
    }
    event.preventDefault();
    if (next) this.#moveFocus({ rowId: null, column: next.column, level: next.level }, true);
  }

  #firstWidget(cell: HTMLElement): HTMLElement | null {
    return cell.querySelector<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]');
  }

  #activate(rowId: string, column: string): void {
    const index = this.#index().get(rowId);
    const item = index === undefined ? undefined : this.#items[index];
    if (!item || item.display?.kind === 'detail') return;
    emit(this.host, 'aui-cell-activate', { rowId, column, row: item.row } satisfies DataGridCellActivateDetail<Row>);
  }

  #toggleGroup(group: DataGridColumnGroup<Row>): void {
    const collapsed = !(this.#columnState.collapsed[group.id] ?? group.collapsed ?? false);
    this.#columnState.collapsed[group.id] = collapsed;
    const focus = this.#focus;
    this.#relayout('group-toggle');
    if (focus) this.#moveFocus(focus, true);
    announce(getMessage('dataGrid', collapsed ? 'groupCollapsed' : 'groupExpanded', { group: group.header }, this.#config.locale), 'polite', this.#doc);
  }

  /** A column or group the user may move: movable, not position-locked, and every member movable. */
  #isMovable(id: string): boolean {
    const members = this.#leaves.filter((l) => l.id === id || l.path.some((g) => g.id === id));
    return members.length > 0 && members.every((l) => l.def.movable !== false && !l.def.lockPosition);
  }

  /** Visible units (leaf or group ids) that share `unitId`'s parent and section, in display order. */
  #siblings(unitId: string): { units: string[]; section: Section } | null {
    const parent = parentOf(this.#leaves, unitId);
    if (parent === undefined) return null;
    const member = this.#layout.visible.find((c) => unitAt(c.leaf, parent) === unitId);
    if (!member) return null;
    const units: string[] = [];
    for (const c of this.#layout.visible) {
      if (c.section !== member.section || (parent !== null && !c.leaf.path.some((g) => g.id === parent))) continue;
      const u = unitAt(c.leaf, parent);
      if (units.at(-1) !== u) units.push(u);
    }
    return { units, section: member.section };
  }

  #keyboardMove(pos: Focus, forward: boolean): void {
    if (!this.#isMovable(pos.column)) return;
    const sib = this.#siblings(pos.column);
    if (!sib) return;
    const i = sib.units.indexOf(pos.column);
    const target = sib.units[forward ? i + 1 : i - 1];
    if (target === undefined || !this.#isMovable(target)) return;
    const next = moveUnit(this.#leaves, this.#columnState.order, pos.column, target, forward);
    if (!next) return;
    this.#columnState.order = next;
    this.#relayout('move');
    this.#moveFocus(pos, true);
    this.#announceMove(pos.column);
  }

  #announceMove(id: string): void {
    const sib = this.#siblings(id);
    if (!sib) return;
    const name = this.#leafDef(id)?.header ?? this.#groupDefs.get(id)?.header ?? id;
    announce(getMessage('dataGrid', 'moved', { column: name, position: sib.units.indexOf(id) + 1, count: sib.units.length }, this.#config.locale), 'polite', this.#doc);
  }

  /** Pointer drag on a header cell: a drop indicator follows the pointer; dropping moves (and, across sections, pins). */
  #bindMove(el: HTMLElement, id: string): void {
    let drop: { target: string; after: boolean; section: Section } | null = null;
    const drag = trackPointerDrag(el, {
      threshold: 6,
      canStart: (event) => !(event.target instanceof Element && event.target.closest('.aui-data-grid__resize, .aui-data-grid__filter-button, [data-header-button], .aui-data-grid__header-input')),
      onStart: () => {
        el.classList.add('aui-data-grid__header-cell--dragging');
      },
      onMove: (move) => {
        // Over the group panel: the drop groups by the column instead of moving it.
        const panel = this.#overGroupPanel(move.point.x, move.point.y) && this.#canGroup(id);
        this.#groupPanel?.classList.toggle('aui-data-grid__group-panel--drop', panel);
        drop = panel ? null : this.#dropTarget(id, move.point.x);
        if (!panel) this.#autoScroll(move.point.x);
        this.#showDropIndicator(drop);
      },
      onEnd: (move) => {
        this.#groupPanel?.classList.remove('aui-data-grid__group-panel--drop');
        if (this.#overGroupPanel(move.point.x, move.point.y) && this.#canGroup(id)) {
          drop = null;
          this.#setGroupBy([...this.#groupBy(), id], true);
        }
        el.classList.remove('aui-data-grid__header-cell--dragging');
        // The click that follows this pointerup (same task) is ignored; a drop outside the header fires none.
        this.#suppressClick = true;
        (this.#doc.defaultView ?? window).setTimeout(() => {
          this.#suppressClick = false;
        }, 0);
        this.#showDropIndicator(null);
        if (drop) this.#applyDrop(id, drop);
        drop = null;
      },
      onCancel: () => {
        el.classList.remove('aui-data-grid__header-cell--dragging');
        this.#groupPanel?.classList.remove('aui-data-grid__group-panel--drop');
        this.#showDropIndicator(null);
        drop = null;
      },
    });
    this.#group.add(() => {
      drag.dispose();
    });
  }

  /** The sibling unit under client x, and whether the drop goes after it. */
  #dropTarget(id: string, clientX: number): { target: string; after: boolean; section: Section } | null {
    const parent = parentOf(this.#leaves, id);
    if (parent === undefined) return null;
    const rtl = this.#config.direction === 'rtl';
    for (const cell of this.#headerCells.values()) {
      const column = cell.dataset.column;
      const rect = cell.getBoundingClientRect();
      if (column === undefined || clientX < rect.left || clientX >= rect.right) continue;
      const leaf = this.#leaves.find((l) => l.id === column) ?? this.#leaves.find((l) => l.path.some((g) => g.id === column));
      if (!leaf || (parent !== null && !leaf.path.some((g) => g.id === parent))) continue;
      const target = unitAt(leaf, parent);
      if (target === id || !this.#isMovable(target)) continue;
      const placed = this.#layout.visible.find((c) => c.leaf.id === leaf.id);
      const mid = rect.left + rect.width / 2;
      return { target, after: rtl ? clientX < mid : clientX >= mid, section: placed?.section ?? 'center' };
    }
    return null;
  }

  #applyDrop(id: string, drop: { target: string; after: boolean; section: Section }): void {
    const members = this.#leaves.filter((l) => l.id === id || l.path.some((g) => g.id === id));
    const pinned: DataGridPinned | null = drop.section === 'center' ? null : drop.section;
    const pinChange = members.some((l) => (this.#layout.visible.find((c) => c.leaf.id === l.id)?.section ?? 'center') !== drop.section);
    if (pinChange && members.some((l) => l.def.lockPinned)) return;
    const next = moveUnit(this.#leaves, this.#columnState.order, id, drop.target, drop.after);
    if (next) this.#columnState.order = next;
    if (pinChange) for (const l of members) this.#columnState.pinned[l.id] = pinned;
    if (!next && !pinChange) return;
    this.#relayout(pinChange ? 'pin' : 'move');
    this.#announceMove(id);
  }

  #autoScroll(clientX: number): void {
    const rect = this.#viewport.getBoundingClientRect();
    const edge = 40;
    const rtl = this.#config.direction === 'rtl';
    const startEdge = rtl ? rect.right - clientX : clientX - rect.left;
    const endEdge = rtl ? clientX - rect.left : rect.right - clientX;
    const step = startEdge < edge ? -20 : endEdge < edge ? 20 : 0;
    if (step !== 0) this.#viewport.scrollLeft += rtl ? -step : step;
  }

  #showDropIndicator(drop: { target: string; after: boolean } | null): void {
    if (!drop) {
      this.#dropIndicator?.remove();
      this.#dropIndicator = null;
      return;
    }
    const cells = [...this.#headerCells.values()].filter((c) => c.dataset.column === drop.target);
    const cell = cells[0];
    if (!cell) return;
    const indicator = (this.#dropIndicator ??= Object.assign(this.#doc.createElement('div'), { className: 'aui-data-grid__drop-indicator' }));
    indicator.setAttribute('aria-hidden', 'true');
    if (!indicator.isConnected) this.host.append(indicator);
    const host = this.host.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    const rtl = this.#config.direction === 'rtl';
    const edgeX = drop.after !== rtl ? rect.right : rect.left;
    indicator.style.setProperty('left', `${String(edgeX - host.left - 1)}px`);
    indicator.style.setProperty('top', `${String(this.#head.getBoundingClientRect().top - host.top)}px`);
    indicator.style.setProperty('block-size', `${String(this.#head.offsetHeight)}px`);
  }

  #onClick(event: MouseEvent): void {
    if (this.#suppressClick) {
      this.#suppressClick = false;
      return;
    }
    const target = event.target;
    if (!(target instanceof Element) || this.#detailContentOf(target)) return;
    const numberCell = target.closest<HTMLElement>(`[data-column="${ROW_NUMBER_COLUMN}"]`);
    const numberRow = numberCell?.closest<HTMLElement>('.aui-data-grid__row')?.dataset.rowId;
    if (numberCell && numberRow !== undefined && !target.closest('.aui-data-grid__row-resizer') && this.#cellSelectionOn() && this.#index().has(numberRow)) {
      this.#selectRowCells(numberRow);
      return;
    }
    if (target.closest('.aui-data-grid__retry')) {
      this.retryLoads();
      return;
    }
    const detailToggle = target.closest<HTMLElement>('.aui-data-grid__detail-toggle');
    if (detailToggle) {
      const id = detailToggle.closest<HTMLElement>('.aui-data-grid__row')?.dataset.rowId;
      if (id !== undefined) this.#toggleDetail(id, !this.#detailExpanded(id), true);
      return;
    }
    const toggle = target.closest<HTMLElement>('.aui-data-grid__group-toggle');
    if (toggle) {
      const id = toggle.closest<HTMLElement>('.aui-data-grid__row')?.dataset.rowId;
      const group = id === undefined ? undefined : this.#displayOf(id);
      if (group?.kind === 'group') this.#toggleRowGroup(group.node, !group.expanded);
      return;
    }
    if (target.closest('.aui-data-grid__select-all')) {
      this.#toggleAll(!this.#allSelected());
      return;
    }
    const box = target.closest<HTMLElement>('.aui-data-grid__select-input');
    const rowEl = target.closest<HTMLElement>('.aui-data-grid__row');
    const rowId = rowEl?.dataset.rowId;
    if (box && rowId !== undefined) {
      const group = this.#displayOf(rowId);
      if (group?.kind === 'group' && !group.node.item) this.#toggleGroupSelection(group.node);
      else this.#userSelect(this.#baseRowId(rowId), event.shiftKey ? 'range' : 'toggle');
      return;
    }
    if (rowId !== undefined && this.#options.rowSelection?.clickToSelect === true && !target.closest('a, button, input, select, textarea, [contenteditable="true"]')) {
      this.#userSelect(rowId, event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'only');
      return;
    }
    if (this.#options.clickToEdit === true && !this.#editing) {
      const cell = this.#rangeCell(target);
      if (cell && this.#editableAt(cell.rowId, cell.column)) {
        this.#startEditing(cell.rowId, cell.column, null);
        return;
      }
    }
    const extra = target.closest<HTMLButtonElement>('[data-header-button]');
    if (extra) {
      const column = extra.closest<HTMLElement>('[role="columnheader"]')?.dataset.column;
      const b = this.#headerButtons.find((x) => x.key === extra.dataset.headerButton);
      if (column !== undefined && b) b.activate(column, extra);
      return;
    }
    if (target.closest('.aui-data-grid__header-input')) return;
    const button = target.closest<HTMLElement>('.aui-data-grid__filter-button');
    if (button) {
      const column = button.closest<HTMLElement>('[role="columnheader"]')?.dataset.column;
      if (column === undefined) return;
      if (this.#panel?.column === column) this.#closeFilterPanel(false);
      else this.#openFilterPanel(column, null);
      return;
    }
    const header = target.closest<HTMLElement>('[role="columnheader"]');
    if (!header || target.closest('.aui-data-grid__resize')) return;
    const column = header.dataset.column;
    if (column === undefined) return;
    if (this.#leaves.some((l) => l.id === column)) {
      if (this.#columnSelectionOn() && !event.altKey && !isUtilityColumn(column)) this.#selectColumnRange(column, event.ctrlKey || event.metaKey, event.shiftKey);
      else this.#toggleSort(column, event.shiftKey);
    }
    else {
      const group = this.#groupDefs.get(column);
      if (group?.collapsible) this.#toggleGroup(group);
    }
  }
}
