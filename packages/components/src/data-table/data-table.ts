/**
 * Data Table (SPEC section 18.10; R1 scope "Table / Data Table with sorting,
 * pagination, and row selection"; R2 advanced grid features, all opt-in). A real
 * <table> with a <caption>, column headers (`th scope="col"`), and a row header per
 * row (`th scope="row"`). It is not an ARIA grid: users Tab through sort buttons,
 * resize handles, filter inputs, selection inputs, disclosure buttons, and
 * interactive cell content; cell-by-cell arrow navigation is not provided.
 * The table sits in a focusable, labelled scroll region so keyboard users can
 * scroll it horizontally (WCAG 2.1.1, 1.4.10). Paging composes Pagination.
 * Client mode filters, sorts, and slices `rows`; server mode renders `rows` as the
 * current page and only emits events. Rows are reused by id across renders.
 *
 * Internal modules: `model.ts` (types, value helpers), `sort.ts` (multi-column
 * sort), `filter.ts` (filters and search), `csv.ts` (CSV export), `state.ts`
 * (state serialization). The column chooser (`column-chooser.ts`) is a separate
 * class so a plain table does not bundle Menu.
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
  parsePlainDate,
  plainDateToString,
  registerMessages,
  releaseNode,
  releaseNodes,
  validators,
  type Density,
  type Direction,
  type Disposer,
} from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { aggregateAll, groupItems, type DataTableGroup, type DataTableGroupToggleDetail, type GroupedEntry } from './grouping.js';
import { announce, observeResize } from '@absoluteui/utilities';
import { Pagination, type PaginationOptions } from '../pagination/pagination.js';
import { assertCsvOptions, toCsvText, type CsvValue, type DataTableCsvOptions } from './csv.js';
import { compileFilter, normalizeFilter, type FilterEnvironment } from './filter.js';
import { fail, isInstantLike, isPlainDate, plainText, type DataTableCellEditDetail, type DataTableColumn, type DataTableEditorContext, type DataTableEditorKind, type DataTableFilter, type DataTableSelection, type DataTableSort, type Item } from './model.js';
import { buildFilterRow, readControl, syncFilterControls, type FilterControl } from './filter-row.js';
import { assertOptions, type DataTableColumnsChangeDetail, type DataTableConfig, type DataTableExpandChangeDetail, type DataTableFilterChangeDetail, type DataTableOptions, type DataTablePageChangeDetail, type DataTableSelectionChangeDetail, type DataTableSortChangeDetail } from './options.js';
import { sortItems } from './sort.js';
import { clampWidth, normalizePinned, parseState, widthBounds, type DataTableColumnsState, type DataTableState, type DataTableStateInput } from './state.js';

type Resolved = Readonly<DataTableConfig & { locale: string; timezone: string; density: Density; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    dataTable: DataTableConfig & { locale: string; timezone: string; density: Density; direction: Direction };
  }
}

export const dataTableConfig = defineComponentConfig<DataTableConfig, 'locale' | 'timezone' | 'density' | 'direction'>(
  'dataTable',
  {
    selection: { default: 'none', expected: '"none" | "single" | "multiple"', validate: validators.oneOf(['none', 'single', 'multiple'] as const) },
    pageSize: { default: 25, expected: 'integer from 1 to 1000000, or null', validate: validators.nullable(validators.integerInRange(1, 1_000_000)) },
    stickyHeader: { default: true, expected: 'boolean', validate: validators.isBoolean },
    sortCycle: { default: 'tri-state', expected: '"tri-state" | "bi-state"', validate: validators.oneOf(['tri-state', 'bi-state'] as const) },
    multiSort: { default: false, expected: 'boolean', validate: validators.isBoolean },
    filterDelay: { default: 250, expected: 'integer from 0 to 5000 (milliseconds)', validate: validators.integerInRange(0, 5000) },
  },
  ['locale', 'timezone', 'density', 'direction'],
);

registerMessages('dataTable', 'en', {
  selectAll: 'Select all rows',
  selectRow: 'Select row {row}',
  selectColumn: 'Select',
  empty: 'No results',
  loading: 'Loading',
  sortedAscending: 'Sorted by {column}, ascending',
  sortedDescending: 'Sorted by {column}, descending',
  sortCleared: 'Sorting cleared',
  booleanTrue: 'Yes',
  booleanFalse: 'No',
  pagination: '{caption}, pagination',
  sortThenAscending: 'then by {column}, ascending',
  sortThenDescending: 'then by {column}, descending',
  sortPriorityAscending: 'sort priority {priority}, ascending',
  sortPriorityDescending: 'sort priority {priority}, descending',
  multiSortHint: 'Hold Shift while activating to sort by more than one column.',
  search: 'Search',
  filterText: 'Filter {column}',
  filterMin: 'Minimum {column}',
  filterMax: 'Maximum {column}',
  filterFrom: '{column} from',
  filterTo: '{column} to',
  filterAll: 'All',
  filterMultiple: '{count} selected',
  results: 'Results: {count}',
  resize: 'Resize {column}',
  widthValue: '{width} pixels',
  expandColumn: 'Details',
  editHint: 'edit {column}',
  editLabel: '{column}, {row}',
  editNumber: 'Enter a number.',
  groupLabel: '{column}: {value} ({count})',
  groupEmpty: '(empty)',
  totals: 'Total',
  aggregate_sum: '{column} total: {value}',
  aggregate_avg: '{column} average: {value}',
  aggregate_min: '{column} minimum: {value}',
  aggregate_max: '{column} maximum: {value}',
  aggregate_count: '{column} count: {value}',
  aggregate_custom: '{column}: {value}',
  expandRow: 'Details for {row}',
});

interface RowEntry<Row> {
  readonly tr: HTMLTableRowElement;
  readonly row: Row;
  readonly generation: number;
  readonly input: HTMLInputElement | null;
  readonly expander: HTMLButtonElement | null;
  /** Nodes returned by column `render` hooks (released when the row element is dropped, D8). */
  readonly rendered: readonly Node[];
}

interface DetailEntry<Row> {
  readonly row: Row;
  readonly tr: HTMLTableRowElement;
  readonly content: Node;
  generation: number;
}

interface HeaderEntry {
  readonly th: HTMLTableCellElement;
  readonly button: HTMLButtonElement | null;
  readonly priority: HTMLSpanElement | null;
  readonly priorityText: HTMLSpanElement | null;
  readonly resizer: HTMLSpanElement | null;
  icon: Element | null;
  state: string;
}

/** A rendered column position: the selection column, the disclosure column, or a data column. */
interface Slot<Row> {
  readonly key: string;
  readonly column: DataTableColumn<Row> | null;
  readonly pin: 'start' | 'end' | null;
  /** Position among the pinned slots of the same edge, counted from that edge. */
  readonly pinIndex: number;
  /** Innermost pinned slot of its edge (draws the boundary). */
  readonly edge: boolean;
}

interface CellContext {
  readonly locale: string;
  readonly timezone: string;
  readonly yes: string;
  readonly no: string;
  /** Number formatting by currency code ('' for plain numbers), memoized for one render or export. */
  number(value: number, currency: string): string;
}

interface RowContext extends CellContext {
  /** Slot index of the row header, or -1. */
  readonly rowHeader: number;
  readonly cellClasses: readonly string[];
  readonly selection: DataTableSelection;
}

interface Drag {
  readonly id: string;
  readonly pointerId: number;
  readonly startX: number;
  readonly startWidth: number;
  readonly rtl: boolean;
}

/** Package-internal hooks used by DataTableColumnChooser (not exported from the subpath). */
export interface DataTableInternals {
  /** User change of a column's visibility: re-renders and emits `aui-columns-change`. */
  setColumnVisible(id: string, visible: boolean): void;
}

// Assigned in the class static block: private members stay private to other modules.
let internalsOf: <Row>(table: DataTable<Row>) => DataTableInternals = () => {
  throw new Error('DataTable internals are not initialized.');
};

export function dataTableInternals<Row>(table: DataTable<Row>): DataTableInternals {
  return internalsOf(table);
}

const DENSITIES: readonly Density[] = ['compact', 'comfortable', 'spacious'];
const SKELETON_ROWS = 10;
/** Update keys that never change how an existing row element renders. */
const ROW_NEUTRAL_KEYS: ReadonlySet<string> = new Set([
  'rows', 'selected', 'sort', 'page', 'pageSize', 'pageSizes', 'loading', 'total', 'emptyMessage', 'caption', 'hideCaption', 'stickyHeader', 'sortCycle', 'mode', 'isRowSelectable', 'direction', 'density',
  'filters', 'search', 'searchable', 'filterRow', 'hiddenColumns', 'columnOrder', 'columnWidths', 'pinnedColumns', 'resizable', 'expanded', 'rowHeight', 'multiSort', 'filterDelay',
  'collapsedGroups', 'showTotals', 'totals',
]);
const SELECT_KEY = '::select';
const EXPAND_KEY = '::expand';
/** Virtual mode: rows rendered beyond each edge of the viewport. */
const OVERSCAN = 6;
/** Virtual mode: hard cap on rendered rows (protects an unconstrained scroll region). */
const MAX_WINDOW = 300;
const DEFAULT_ROW_HEIGHT = 40;
const RESIZE_STEP = 10;
const RESIZE_STEP_LARGE = 50;

const isSortList = (sort: DataTableSort | readonly DataTableSort[]): sort is readonly DataTableSort[] => Array.isArray(sort);
const normalizeSorts = (sort: DataTableSort | readonly DataTableSort[] | null | undefined): DataTableSort[] => {
  if (!sort) return [];
  const list = isSortList(sort) ? sort : [sort];
  return list.map((s) => ({ column: s.column, direction: s.direction }));
};
export class DataTable<Row> {
  static {
    internalsOf = <R>(table: DataTable<R>): DataTableInternals => ({
      setColumnVisible: (id, visible) => {
        table.#userColumnVisibility(id, visible);
      },
    });
  }

  readonly host: HTMLElement;
  readonly table: HTMLTableElement;
  #options: DataTableOptions<Row>;
  #byId: Map<string, Row>;
  #items: Item<Row>[];
  #columnsById = new Map<string, DataTableColumn<Row>>();
  #sorts: DataTableSort[];
  #filters = new Map<string, DataTableFilter>();
  #search = '';
  #hidden = new Set<string>();
  #columnOrder: string[] = [];
  #widths = new Map<string, number>();
  #pinned: { start: string[]; end: string[] } = { start: [], end: [] };
  #expanded = new Set<string>();
  /** Collapsed group keys (since 0.9.0). */
  #collapsedGroups = new Set<string>();
  /** Group headers and rows of the current page while grouping (since 0.9.0). */
  #pageEntries: readonly GroupedEntry<Row>[] | null = null;
  /** Group header rows by key, the state they were rendered for, and custom content (D8). */
  #groupRows = new Map<string, { tr: HTMLTableRowElement; signature: string; node: Node | null }>();
  #tfoot: HTMLTableSectionElement | null = null;
  /** Nodes from column `renderHeader` in the current head (D8). */
  #headerNodes: Node[] = [];
  /** Node from `renderEmpty` while the empty state is shown (D8). */
  #emptyNode: Node | null = null;
  /** The cell being edited (since 0.9.0), its validation message, and custom editor content (D8). */
  #editing: { rowId: string; column: string; error: string | null; node: Node | null; draft?: string } | null = null;
  /** True while an edit re-renders: removing the focused editor fires focusout, which must not commit again. */
  #editRendering = false;
  #page: number;
  /** User or `update` override of the page size; `undefined` follows configuration. */
  #pageSize: number | null | undefined;
  #selected: Set<string>;
  #anchor: string | null = null;
  /** Client-mode sorted items, cached by rows, sorts, and generation. */
  #sorted: { key: string; source: Item<Row>[]; generation: number; value: readonly Item<Row>[] } | null = null;
  /** Client-mode filtered items, cached by the sorted items, filters, search, and generation. */
  #filtered: { key: string; sorted: readonly Item<Row>[]; generation: number; value: readonly Item<Row>[] } | null = null;
  /** Lower-cased displayed text per column, indexed by Item.index (filtering and search). */
  #texts = new Map<string, readonly string[]>();
  #textsFor: { items: Item<Row>[]; generation: number } | null = null;
  #visible: readonly Item<Row>[] = [];
  /** Row offset of the current page within all rows (aria-rowindex in virtual mode). */
  #pageStart = 0;
  #entries = new Map<string, RowEntry<Row>>();
  #rowIds = new WeakMap<Element, string>();
  #details = new Map<string, DetailEntry<Row>>();
  #headers = new Map<string, HeaderEntry>();
  #headCells: HTMLTableCellElement[] = [];
  #filterControls = new Map<string, FilterControl>();
  #filterRow: HTMLTableRowElement | null = null;
  #slots: Slot<Row>[] = [];
  #layoutKey = '';
  #headKey = '';
  #selectAll: HTMLInputElement | null = null;
  #bodyKind: 'rows' | 'empty' | 'skeleton' | null = null;
  #generation = 0;
  #template: HTMLSpanElement | null = null;
  #templateGeneration = -1;
  #pagination: Pagination | null = null;
  #pagerKey = '';
  #fromPager = false;
  #shiftSort = false;
  #pendingFilters = new Set<string>();
  #pendingSearch = false;
  #filterTimer: ReturnType<typeof setTimeout> | undefined;
  #drag: Drag | null = null;
  /** Fixed table layout: every header cell has a pixel width (after the first resize). */
  #fixed = false;
  #frozen = new Map<string, number>();
  #pinObservers: Disposer[] = [];
  #rowHeight: number | null = null;
  #measuredGeneration = -1;
  #spacers: HTMLTableRowElement[] = [];
  #scrollFrame = 0;
  #focusedId: string | null = null;
  #searchInput: HTMLInputElement | null = null;
  readonly #doc: Document;
  readonly #caption: HTMLTableCaptionElement;
  readonly #region: HTMLDivElement;
  readonly #thead: HTMLTableSectionElement;
  readonly #headRow: HTMLTableRowElement;
  readonly #tbody: HTMLTableSectionElement;
  readonly #status: HTMLDivElement;
  readonly #statusLabel: HTMLSpanElement;
  readonly #pagerHost: HTMLDivElement;
  readonly #toolbar: HTMLDivElement;
  readonly #hint: HTMLSpanElement;
  readonly #radioName = createId('aui-data-table-select');
  readonly #group = new DisposableGroup();

  /** Render a data table into an empty host element (the host's children are replaced). */
  static create<Row>(host: HTMLElement, options: DataTableOptions<Row>): DataTable<Row> {
    return new DataTable(host, options);
  }

  private constructor(host: HTMLElement, options: DataTableOptions<Row>) {
    assertOptions(options, (o) => DataTable.#resolve(o));
    const byId = DataTable.#indexRows(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#byId = byId.map;
    this.#items = byId.items;
    this.#columnsById = new Map(options.columns.map((c) => [c.id, c]));
    this.#sorts = normalizeSorts(options.sort);
    this.#applyStateOptions(options, true);
    this.#page = options.page ?? 1;
    this.#pageSize = undefined;
    this.#selected = this.#filterSelection(options.selected ?? []);
    this.#expanded = this.#filterExpanded(options.expanded ?? []);
    this.#collapsedGroups = new Set(options.collapsedGroups ?? []);
    const doc = this.#doc;

    this.table = doc.createElement('table');
    this.table.className = 'aui-data-table__table';
    this.#caption = doc.createElement('caption');
    this.#caption.className = 'aui-data-table__caption';
    this.#caption.id = createId('aui-data-table-caption');
    this.#thead = doc.createElement('thead');
    this.#thead.className = 'aui-data-table__head';
    this.#headRow = doc.createElement('tr');
    this.#headRow.className = 'aui-data-table__header-row';
    this.#thead.append(this.#headRow);
    this.#tbody = doc.createElement('tbody');
    this.#tbody.className = 'aui-data-table__rows';
    this.table.append(this.#caption, this.#thead, this.#tbody);

    // A focusable, labelled region so keyboard users can scroll a wide table.
    this.#region = doc.createElement('div');
    this.#region.className = 'aui-data-table__region';
    this.#region.id = createId('aui-data-table-region');
    this.#region.setAttribute('role', 'region');
    this.#region.tabIndex = 0;
    this.#region.setAttribute('aria-labelledby', this.#caption.id);
    this.#region.append(this.table);

    // The status sits outside the busy region so its "Loading" text is announced.
    this.#status = doc.createElement('div');
    this.#status.className = 'aui-data-table__status';
    this.#status.setAttribute('role', 'status');
    this.#statusLabel = doc.createElement('span');
    this.#statusLabel.className = 'aui-data-table__visually-hidden';

    // Description target of sort buttons when multi-sort is enabled.
    this.#hint = doc.createElement('span');
    this.#hint.id = createId('aui-data-table-hint');
    this.#hint.hidden = true;

    const body = doc.createElement('div');
    body.className = 'aui-data-table__body';
    body.append(this.#region, this.#status, this.#hint);
    this.#pagerHost = doc.createElement('div');
    this.#pagerHost.className = 'aui-data-table__pagination';
    this.#toolbar = doc.createElement('div');
    this.#toolbar.className = 'aui-data-table__toolbar';
    this.#toolbar.hidden = true;

    host.classList.add('aui-data-table');
    host.replaceChildren(this.#toolbar, body, this.#pagerHost);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    try {
      this.#render();
    } catch (error) {
      this.#pagination?.destroy();
      this.#disposePinObservers();
      host.replaceChildren();
      host.classList.remove('aui-data-table');
      throw error;
    }
    this.#bindEvents();
    this.#group.add(() => {
      this.#pagination?.destroy();
      this.#pagination = null;
      clearTimeout(this.#filterTimer);
      if (this.#scrollFrame) (this.#doc.defaultView ?? window).cancelAnimationFrame(this.#scrollFrame);
      this.#disposePinObservers();
    });
    this.#group.add(dataTableConfig.subscribe(() => {
      this.#generation++;
      this.#render();
    }));
  }

  /** The primary sort (a copy). */
  get sort(): DataTableSort | null {
    const first = this.#sorts[0];
    return first ? { ...first } : null;
  }

  /** All sorts by priority (copies; since 0.3.0). */
  get sorts(): DataTableSort[] {
    return this.#sorts.map((s) => ({ ...s }));
  }

  /** Active filters by column id (a copy; since 0.3.0). */
  get filters(): Record<string, DataTableFilter> {
    return this.#filtersObject();
  }

  /** Global search text (since 0.3.0). */
  get search(): string {
    return this.#search;
  }

  /** Expanded row ids (since 0.3.0). */
  get expanded(): string[] {
    return [...this.#expanded];
  }

  /** Keys of collapsed groups (a copy), since 0.9.0. */
  get collapsedGroups(): string[] {
    return [...this.#collapsedGroups];
  }

  /** Current page (1-based). */
  get page(): number {
    return this.#page;
  }

  /** Rows per page, or `null` when paging is off. */
  get pageSize(): number | null {
    return this.#effectivePageSize(this.#config());
  }

  /** Selected row ids, in selection order. */
  get selected(): string[] {
    return [...this.#selected];
  }

  /** Number of rows after client filtering (all pages), or `total` in server mode (since 0.3.0). */
  get rowCount(): number {
    if (this.#isServer()) return this.#options.total ?? this.#options.rows.length;
    return this.#filteredItems(this.#config()).length;
  }

  get options(): Readonly<DataTableOptions<Row>> {
    return this.#options;
  }

  getSelected(): string[] {
    return [...this.#selected];
  }

  /** Replace the selection programmatically (no events). Unknown (client mode) and unselectable ids are dropped. */
  setSelected(ids: readonly string[]): void {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) fail('selected', 'array of row id strings');
    this.#selected = this.#filterSelection(ids);
    this.#syncSelection(true);
  }

  clearSelection(): void {
    this.#selected.clear();
    this.#anchor = null;
    this.#syncSelection(true);
  }

  /** Replace the rows (and, in server mode, the total). Selection of ids still present is kept. */
  setRows(rows: readonly Row[], total?: number): void {
    this.update(total === undefined ? { rows } : { rows, total });
  }

  update(options: Partial<DataTableOptions<Row>>): void {
    const next: DataTableOptions<Row> = { ...this.#options, ...options };
    assertOptions(next, (o) => DataTable.#resolve(o));
    const rowsChanged = 'rows' in options || 'rowId' in options;
    const indexed = rowsChanged ? DataTable.#indexRows(next) : null;
    this.#options = next;
    if (indexed) {
      this.#byId = indexed.map;
      this.#items = indexed.items;
    }
    if ('columns' in options) {
      this.#columnsById = new Map(next.columns.map((c) => [c.id, c]));
      this.#pruneColumnState();
    }
    if ('sort' in options) this.#sorts = normalizeSorts(next.sort);
    this.#applyStateOptions(options, false);
    if ('page' in options) this.#page = next.page ?? 1;
    if ('pageSize' in options || 'pageSizes' in options) this.#pageSize = undefined;
    if (Object.keys(options).some((key) => !ROW_NEUTRAL_KEYS.has(key))) this.#generation++;
    // Sorts on columns that no longer exist (or are no longer sortable) are dropped.
    this.#sorts = this.#sorts.filter((s) => this.#columnsById.get(s.column)?.sortable !== false && this.#columnsById.has(s.column));
    this.#selected = this.#filterSelection('selected' in options ? (next.selected ?? []) : [...this.#selected]);
    this.#expanded = this.#filterExpanded('expanded' in options ? (next.expanded ?? []) : [...this.#expanded]);
    if ('collapsedGroups' in options) this.#collapsedGroups = new Set(next.collapsedGroups ?? []);
    this.#render();
  }

  /** JSON-safe snapshot of the view state (since 0.3.0). */
  getState(): DataTableState {
    return {
      version: 1,
      sort: this.sorts,
      filters: this.#filtersObject(),
      search: this.#search,
      columns: this.#columnsState(),
      page: this.#page,
      pageSize: this.pageSize,
      collapsedGroups: [...this.#collapsedGroups],
    };
  }

  /**
   * Restore a snapshot from `getState()` (or any subset of it). The input is
   * validated as untrusted; unknown column ids are dropped. Emits nothing.
   */
  setState(state: DataTableStateInput): void {
    const parsed = parseState(state, this.#options.columns, this.#options.pageSizes);
    if (parsed.sorts) this.#sorts = parsed.sorts;
    if (parsed.filters) this.#filters = parsed.filters;
    if (parsed.search !== undefined) this.#search = parsed.search;
    if (parsed.order) this.#columnOrder = parsed.order;
    if (parsed.hidden) this.#hidden = parsed.hidden;
    if (parsed.widths) this.#widths = parsed.widths;
    if (parsed.pinned) this.#pinned = parsed.pinned;
    if (parsed.page !== undefined) this.#page = parsed.page;
    if (parsed.pageSize !== undefined) this.#pageSize = parsed.pageSize;
    if (parsed.collapsedGroups) this.#collapsedGroups = parsed.collapsedGroups;
    this.#render();
  }

  /** Serialize rows as RFC 4180 CSV with formula-injection protection (since 0.3.0). No side effects. */
  toCsv(options: DataTableCsvOptions = {}): string {
    assertCsvOptions(options);
    const config = this.#config();
    const ctx = this.#textContext(config);
    const columns = this.#csvColumns(options.columns ?? 'visible');
    const raw = options.values === 'raw';
    const rows = this.#csvRows(options.rows ?? 'filtered', config);
    const body = rows.map((item) => columns.map((c) => this.#csvValue(c, item.row, raw, ctx)));
    return toCsvText(options.header === false ? null : columns.map((c) => c.header), body, options);
  }

  /** `toCsv()` as a `text/csv` Blob (since 0.3.0). Use `downloadCsv()` to save it. */
  toCsvBlob(options: DataTableCsvOptions = {}): Blob {
    return new Blob([this.toCsv(options)], { type: 'text/csv;charset=utf-8' });
  }

  destroy(): void {
    this.#group.dispose();
    this.#dropEntries(this.#entries);
    this.#entries.clear();
    for (const id of [...this.#details.keys()]) this.#dropDetail(id);
    this.#dropGroupRows(new Set());
    this.#releaseEmpty();
    releaseNode(this.#editing?.node);
    this.#editing = null;
    releaseNodes(this.#headerNodes);
    this.#headerNodes = [];
    this.#tfoot?.remove();
    this.#tfoot = null;
    this.#headers.clear();
    this.#filterControls.clear();
    this.host.replaceChildren();
    this.host.classList.remove(
      'aui-data-table', 'aui-data-table--sticky', 'aui-data-table--virtual', 'aui-data-table--fixed', 'aui-data-table--pinned', 'aui-data-table--loading',
      ...DENSITIES.map((d) => `aui-data-table--${d}`),
    );
  }

  /** Row ids must be unique, non-empty strings: they key selection and row reuse. */
  static #indexRows<R>(o: DataTableOptions<R>): { map: Map<string, R>; items: Item<R>[] } {
    const map = new Map<string, R>();
    const items: Item<R>[] = [];
    let index = 0;
    for (const row of o.rows) {
      const id = o.rowId(row);
      if (typeof id !== 'string' || id === '') {
        throw configurationError('DATA_TABLE_ROW_ID', 'Row id must be a non-empty string.', { component: 'dataTable', property: 'dataTable.rowId', expected: 'non-empty string per row' });
      }
      if (map.has(id)) {
        throw configurationError('DATA_TABLE_ROW_ID', 'Duplicate row id.', { component: 'dataTable', property: 'dataTable.rowId', expected: 'unique id per row' });
      }
      map.set(id, row);
      items.push({ row, id, index: index++ });
    }
    return { map, items };
  }

  static #resolve<R>(o: DataTableOptions<R>): Resolved {
    return dataTableConfig.resolve({
      ...(o.selection === undefined ? {} : { selection: o.selection }),
      ...(o.pageSize === undefined ? {} : { pageSize: o.pageSize }),
      ...(o.stickyHeader === undefined ? {} : { stickyHeader: o.stickyHeader }),
      ...(o.sortCycle === undefined ? {} : { sortCycle: o.sortCycle }),
      ...(o.multiSort === undefined ? {} : { multiSort: o.multiSort }),
      ...(o.filterDelay === undefined ? {} : { filterDelay: o.filterDelay }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.timezone === undefined ? {} : { timezone: o.timezone }),
      ...(o.density === undefined ? {} : { density: o.density }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  /** Apply the state-like options present in `o` (all of them at construction). */
  #applyStateOptions(o: Partial<DataTableOptions<Row>>, all: boolean): void {
    const has = (key: keyof DataTableOptions<Row>): boolean => all || key in o;
    if (has('filters')) {
      const filters = new Map<string, DataTableFilter>();
      for (const [id, value] of Object.entries(o.filters ?? {})) {
        const column = this.#columnsById.get(id);
        const f = column ? normalizeFilter(column, value) : undefined;
        if (f) filters.set(id, f);
      }
      this.#filters = filters;
    }
    if (has('search')) this.#search = o.search ?? '';
    if (has('hiddenColumns')) this.#hidden = new Set(o.hiddenColumns ?? []);
    if (has('columnOrder')) this.#columnOrder = [...(o.columnOrder ?? [])];
    if (has('columnWidths')) {
      this.#widths = new Map();
      for (const [id, px] of Object.entries(o.columnWidths ?? {})) {
        const column = this.#columnsById.get(id);
        if (column) this.#widths.set(id, clampWidth(column, px));
      }
    }
    if (has('pinnedColumns')) this.#pinned = normalizePinned(o.pinnedColumns?.start ?? [], o.pinnedColumns?.end ?? [], new Set(this.#columnsById.keys()));
  }

  /** After `columns` changes: drop state that refers to removed columns or no longer fits them. */
  #pruneColumnState(): void {
    const known = this.#columnsById;
    for (const [id, f] of this.#filters) {
      const column = known.get(id);
      if (!column || !normalizeFilter(column, f)) this.#filters.delete(id);
    }
    for (const id of this.#hidden) if (!known.has(id)) this.#hidden.delete(id);
    if (this.#hidden.size >= known.size) this.#hidden.clear();
    this.#columnOrder = this.#columnOrder.filter((id) => known.has(id));
    for (const id of this.#widths.keys()) if (!known.has(id)) this.#widths.delete(id);
    this.#pinned = normalizePinned(this.#pinned.start, this.#pinned.end, new Set(known.keys()));
  }

  #config(): Resolved {
    return DataTable.#resolve(this.#options);
  }

  #isServer(): boolean {
    return this.#options.mode === 'server';
  }

  #effectivePageSize(config: Resolved): number | null {
    const size = this.#pageSize === undefined ? config.pageSize : this.#pageSize;
    const sizes = this.#options.pageSizes;
    // A configured default that is not offered in the select falls back to the first offered size.
    if (size !== null && sizes && !sizes.includes(size)) return sizes[0] ?? size;
    return size;
  }

  #isSelectable(row: Row): boolean {
    const fn = this.#options.isRowSelectable;
    return fn ? fn(row) : true;
  }

  #isExpandable(row: Row): boolean {
    if (!this.#options.renderDetail) return false;
    const fn = this.#options.isRowExpandable;
    return fn ? fn(row) : true;
  }

  /** Client mode keeps ids of present, selectable rows; server mode also keeps ids from other pages. */
  #filterSelection(ids: readonly string[]): Set<string> {
    const config = this.#config();
    if (config.selection === 'none') return new Set();
    const out = new Set<string>();
    for (const id of ids) {
      const row = this.#byId.get(id);
      if (row === undefined && !this.#byId.has(id)) {
        if (this.#isServer()) out.add(id);
        continue;
      }
      if (row !== undefined && !this.#isSelectable(row)) continue;
      out.add(id);
    }
    if (config.selection === 'single' && out.size > 1) return new Set([...out].slice(-1));
    return out;
  }

  /** Expanded ids, pruned like the selection. */
  #filterExpanded(ids: readonly string[]): Set<string> {
    if (!this.#options.renderDetail) return new Set();
    const out = new Set<string>();
    for (const id of ids) {
      if (!this.#byId.has(id)) {
        if (this.#isServer()) out.add(id);
        continue;
      }
      const row = this.#byId.get(id);
      if (row !== undefined && !this.#isExpandable(row)) continue;
      out.add(id);
    }
    return out;
  }

  #filtersObject(): Record<string, DataTableFilter> {
    const out: Record<string, DataTableFilter> = {};
    for (const [id, f] of this.#filters) out[id] = structuredClone(f);
    return out;
  }

  /** Every column in column order (hidden columns included). */
  #orderedColumns(): DataTableColumn<Row>[] {
    const out: DataTableColumn<Row>[] = [];
    const seen = new Set<string>();
    for (const id of this.#columnOrder) {
      const c = this.#columnsById.get(id);
      if (c && !seen.has(id)) {
        out.push(c);
        seen.add(id);
      }
    }
    for (const c of this.#options.columns) if (!seen.has(c.id)) out.push(c);
    return out;
  }

  #columnsState(): DataTableColumnsState {
    return {
      order: this.#orderedColumns().map((c) => c.id),
      hidden: this.#orderedColumns().filter((c) => this.#hidden.has(c.id)).map((c) => c.id),
      widths: Object.fromEntries(this.#widths),
      pinned: { start: [...this.#pinned.start], end: [...this.#pinned.end] },
    };
  }

  /** Rendered slots: selection, disclosure, then visible data columns (start pins, unpinned, end pins). */
  #computeSlots(config: Resolved): string {
    const visible = this.#orderedColumns().filter((c) => !this.#hidden.has(c.id));
    const startIds = this.#pinned.start.filter((id) => visible.some((c) => c.id === id));
    const endIds = this.#pinned.end.filter((id) => visible.some((c) => c.id === id));
    const byId = this.#columnsById;
    const start = startIds.map((id) => byId.get(id)).filter((c): c is DataTableColumn<Row> => c !== undefined);
    const end = endIds.map((id) => byId.get(id)).filter((c): c is DataTableColumn<Row> => c !== undefined);
    const middle = visible.filter((c) => !startIds.includes(c.id) && !endIds.includes(c.id));
    const slots: Slot<Row>[] = [];
    const utility: string[] = [];
    if (config.selection !== 'none') utility.push(SELECT_KEY);
    if (this.#options.renderDetail) utility.push(EXPAND_KEY);
    // Utility columns sit at the start edge, so they are pinned whenever data columns are.
    const pinUtility = start.length > 0;
    const startCount = (pinUtility ? utility.length : 0) + start.length;
    let s = 0;
    for (const key of utility) {
      slots.push({ key, column: null, pin: pinUtility ? 'start' : null, pinIndex: pinUtility ? s : -1, edge: pinUtility && s === startCount - 1 });
      if (pinUtility) s++;
    }
    for (const c of start) {
      slots.push({ key: c.id, column: c, pin: 'start', pinIndex: s, edge: s === startCount - 1 });
      s++;
    }
    for (const c of middle) slots.push({ key: c.id, column: c, pin: null, pinIndex: -1, edge: false });
    end.forEach((c, i) => {
      slots.push({ key: c.id, column: c, pin: 'end', pinIndex: end.length - 1 - i, edge: i === 0 });
    });
    this.#slots = slots;
    return slots.map((sl) => `${sl.key}:${sl.pin ?? ''}${String(sl.pinIndex)}`).join('|');
  }

  #bindEvents(): void {
    const g = this.#group;
    const thead = this.#thead;
    g.listen(thead, 'click', (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button');
      const column = button?.dataset.column;
      if (!button || column === undefined || !thead.contains(button)) return;
      const additive = event.shiftKey || this.#shiftSort;
      this.#shiftSort = false;
      this.#userSort(column, additive);
    });
    g.listen(thead, 'keydown', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.classList.contains('aui-data-table__sort')) {
        // Keyboard activation: the click that follows may not carry the modifier.
        if (event.key === 'Enter' || event.key === ' ') this.#shiftSort = event.shiftKey;
        return;
      }
      if (target.classList.contains('aui-data-table__resizer')) {
        this.#resizeKey(target, event);
        return;
      }
      if (event.key === 'Enter' && target.dataset.filter !== undefined) this.#flushFilters();
    });
    g.listen(thead, 'focusin', (event) => {
      // Widths are measured lazily: report the current one when a resize handle gets focus.
      const target = event.target;
      if (target instanceof HTMLSpanElement && target.classList.contains('aui-data-table__resizer')) this.#syncResizers(true);
    });
    g.listen(thead, 'focusout', (event) => {
      if (event.target instanceof HTMLElement && event.target.classList.contains('aui-data-table__sort')) this.#shiftSort = false;
    });
    g.listen(thead, 'change', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.dataset.filter !== undefined) {
        this.#pendingFilters.add(target.dataset.filter);
        this.#flushFilters();
        return;
      }
      if (target !== this.#selectAll || !this.#selectAll) return;
      const selectable = this.#visible.filter((item) => this.#isSelectable(item.row));
      const all = selectable.length > 0 && selectable.every((item) => this.#selected.has(item.id));
      for (const item of selectable) {
        if (all) this.#selected.delete(item.id);
        else this.#selected.add(item.id);
      }
      this.#anchor = null;
      this.#userSelection();
    });
    g.listen(thead, 'input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset.filter === undefined) return;
      this.#pendingFilters.add(target.dataset.filter);
      this.#scheduleFilters();
    });
    g.listen(thead, 'pointerdown', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSpanElement) || !target.classList.contains('aui-data-table__resizer') || event.button !== 0) return;
      this.#startDrag(target, event);
    });
    g.listen(thead, 'pointermove', (event) => {
      const drag = this.#drag;
      if (drag?.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      this.#setWidth(drag.id, drag.startWidth + (drag.rtl ? -dx : dx));
    });
    const endDrag = (event: PointerEvent): void => {
      const drag = this.#drag;
      if (drag?.pointerId !== event.pointerId) return;
      this.#drag = null;
      this.host.classList.remove('aui-data-table--resizing');
      if (this.#widths.get(drag.id) !== drag.startWidth) this.#emitColumns(drag.id, 'resize');
    };
    g.listen(thead, 'pointerup', endDrag);
    g.listen(thead, 'pointercancel', endDrag);

    const toolbar = this.#toolbar;
    g.listen(toolbar, 'input', (event) => {
      if (event.target !== this.#searchInput) return;
      this.#pendingSearch = true;
      this.#scheduleFilters();
    });
    g.listen(toolbar, 'keydown', (event) => {
      if (event.target === this.#searchInput && event.key === 'Enter') {
        this.#pendingSearch = true;
        this.#flushFilters();
      }
    });

    // Checkboxes: click (fired by pointer and Space) carries shiftKey for range selection.
    g.listen(this.#tbody, 'click', (event) => {
      const target = event.target;
      if (target instanceof Element) {
        const editButton = target.closest('button.aui-data-table__edit');
        if (editButton instanceof HTMLButtonElement && this.#tbody.contains(editButton)) {
          const rowId = editButton.dataset.rowId;
          const columnId = editButton.dataset.column;
          if (rowId !== undefined && columnId !== undefined) this.#activateEdit(rowId, columnId);
          return;
        }
        const toggle = target.closest('button.aui-data-table__group-toggle');
        if (toggle instanceof HTMLButtonElement && this.#tbody.contains(toggle)) {
          const key = toggle.dataset.groupKey;
          if (key !== undefined) this.#userToggleGroup(key);
          return;
        }
        const expander = target.closest('button.aui-data-table__expander');
        if (expander instanceof HTMLButtonElement && this.#tbody.contains(expander)) {
          const id = expander.dataset.rowId;
          if (id !== undefined && this.#entries.has(id)) this.#userToggleExpanded(id);
          return;
        }
      }
      const input = target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') return;
      const id = input.dataset.rowId;
      if (id === undefined || !this.#entries.has(id)) return;
      const on = input.checked;
      const ids = this.#visible.map((item) => item.id);
      const from = this.#anchor === null ? -1 : ids.indexOf(this.#anchor);
      const to = ids.indexOf(id);
      if (event.shiftKey && from !== -1 && to !== -1) {
        for (const item of this.#visible.slice(Math.min(from, to), Math.max(from, to) + 1)) {
          if (!this.#isSelectable(item.row)) continue;
          if (on) this.#selected.add(item.id);
          else this.#selected.delete(item.id);
        }
      } else if (on) {
        this.#selected.add(id);
      } else {
        this.#selected.delete(id);
      }
      this.#anchor = id;
      this.#userSelection();
    });
    // Radios: change fires only when the checked radio actually changes (pointer or arrow keys).
    g.listen(this.#tbody, 'change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'radio' || !input.checked) return;
      const id = input.dataset.rowId;
      if (id === undefined || !this.#entries.has(id)) return;
      this.#selected = new Set([id]);
      this.#anchor = id;
      this.#userSelection();
    });
    // Virtual mode keeps the row that holds focus rendered while it scrolls out of view.
    g.listen(this.#tbody, 'focusin', (event) => {
      const tr = event.target instanceof Element ? event.target.closest('tr') : null;
      this.#focusedId = tr ? (this.#rowIds.get(tr) ?? null) : null;
    });
    g.listen(this.#tbody, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (!(next instanceof Node) || !this.#tbody.contains(next)) this.#focusedId = null;
    });
    // Virtual mode: re-window on scroll and when the viewport changes size (one frame at most).
    const rewindow = (): void => {
      if (this.#options.virtual !== true || this.#scrollFrame) return;
      const view = this.#doc.defaultView ?? window;
      this.#scrollFrame = view.requestAnimationFrame(() => {
        this.#scrollFrame = 0;
        if (this.#options.virtual === true && this.#bodyKind === 'rows') this.#renderWindow(this.#config());
      });
    };
    g.listen(this.#region, 'scroll', rewindow, { passive: true });
    g.add(observeResize(this.#region, rewindow));

    const pagerHost = this.#pagerHost;
    const onPage = (event: Event): void => {
      // Re-emitted as aui-page-change; the inner Pagination event stays internal.
      event.stopPropagation();
      const pager = this.#pagination;
      if (!pager) return;
      const size = pager.pageSize;
      this.#page = pager.page;
      if (size !== null) this.#pageSize = size;
      // Pagination already rendered this state and restored focus; do not re-render it.
      this.#fromPager = true;
      try {
        this.#render();
      } finally {
        this.#fromPager = false;
      }
      emit(this.host, 'aui-page-change', { page: this.#page, pageSize: this.#effectivePageSize(this.#config()) ?? 0 } satisfies DataTablePageChangeDetail);
    };
    pagerHost.addEventListener('aui-change', onPage);
    g.add(() => {
      pagerHost.removeEventListener('aui-change', onPage);
    });
  }

  #userSort(columnId: string, additive: boolean): void {
    const column = this.#columnsById.get(columnId);
    if (!column || column.sortable === false) return;
    const config = this.#config();
    const index = this.#sorts.findIndex((s) => s.column === columnId);
    const current = this.#sorts[index]?.direction ?? null;
    let direction: DataTableSort['direction'] | null;
    if (current === null) direction = 'ascending';
    else if (current === 'ascending') direction = 'descending';
    else direction = config.sortCycle === 'bi-state' ? 'ascending' : null;
    let next: DataTableSort[];
    if (additive && config.multiSort) {
      next = [...this.#sorts];
      if (index === -1) next.push({ column: columnId, direction: 'ascending' });
      else if (direction === null) next.splice(index, 1);
      else next[index] = { column: columnId, direction };
    } else {
      next = direction === null ? [] : [{ column: columnId, direction }];
    }
    this.#sorts = next;
    // A new order starts at the first page.
    this.#page = 1;
    this.#render();
    const locale = config.locale;
    const parts = next.map((s, i) => {
      const header = this.#columnsById.get(s.column)?.header ?? s.column;
      const key = i === 0 ? (s.direction === 'ascending' ? 'sortedAscending' : 'sortedDescending') : (s.direction === 'ascending' ? 'sortThenAscending' : 'sortThenDescending');
      return getMessage('dataTable', key, { column: header }, locale);
    });
    announce(parts.length === 0 ? getMessage('dataTable', 'sortCleared', {}, locale) : parts.join(', '), 'polite', this.#doc);
    emit(this.host, 'aui-sort-change', { sort: this.sort, sorts: this.sorts } satisfies DataTableSortChangeDetail);
  }

  #userSelection(): void {
    this.#syncSelection(true);
    emit(this.host, 'aui-selection-change', { selected: [...this.#selected] } satisfies DataTableSelectionChangeDetail);
  }

  #userToggleExpanded(id: string): void {
    const open = !this.#expanded.has(id);
    if (open) this.#expanded.add(id);
    else this.#expanded.delete(id);
    this.#render();
    emit(this.host, 'aui-expand-change', { id, expanded: open, expandedIds: [...this.#expanded] } satisfies DataTableExpandChangeDetail);
  }

  #userColumnVisibility(id: string, visible: boolean): void {
    const column = this.#columnsById.get(id);
    if (!column || this.#hidden.has(id) !== visible) return;
    if (visible) this.#hidden.delete(id);
    else {
      // The last visible column cannot be hidden.
      if (this.#columnsById.size - this.#hidden.size <= 1) return;
      this.#hidden.add(id);
    }
    this.#render();
    this.#emitColumns(id, 'visibility');
  }

  #emitColumns(column: string, reason: DataTableColumnsChangeDetail['reason']): void {
    emit(this.host, 'aui-columns-change', { column, reason, columns: this.#columnsState() } satisfies DataTableColumnsChangeDetail);
  }

  #scheduleFilters(): void {
    clearTimeout(this.#filterTimer);
    const delay = this.#config().filterDelay;
    if (delay === 0) {
      this.#flushFilters();
      return;
    }
    this.#filterTimer = setTimeout(() => {
      this.#flushFilters();
    }, delay);
  }

  /** Apply pending filter and search input as one user change. */
  #flushFilters(): void {
    clearTimeout(this.#filterTimer);
    this.#filterTimer = undefined;
    const before = JSON.stringify([[...this.#filters], this.#search]);
    for (const id of this.#pendingFilters) {
      const column = this.#columnsById.get(id);
      const control = this.#filterControls.get(id);
      if (!column || !control) continue;
      const f = normalizeFilter(column, readControl(control, this.#filters.get(id)));
      if (f) this.#filters.set(id, f);
      else this.#filters.delete(id);
    }
    this.#pendingFilters.clear();
    if (this.#pendingSearch && this.#searchInput) this.#search = this.#searchInput.value;
    this.#pendingSearch = false;
    if (JSON.stringify([[...this.#filters], this.#search]) === before) return;
    this.#page = 1;
    this.#render();
    const config = this.#config();
    if (!this.#isServer()) announce(getMessage('dataTable', 'results', { count: formatNumber(this.rowCount, {}, config.locale) }, config.locale), 'polite', this.#doc);
    emit(this.host, 'aui-filter-change', { filters: this.#filtersObject(), search: this.#search } satisfies DataTableFilterChangeDetail);
  }

  #startDrag(handle: HTMLSpanElement, event: PointerEvent): void {
    const id = handle.dataset.column;
    const entry = id === undefined ? undefined : this.#headers.get(id);
    if (id === undefined || !entry) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    if (!this.#freeze()) return;
    try {
      // Keeps the drag alive when the pointer leaves the header.
      handle.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is no longer active (released before this handler ran); header events still apply.
    }
    this.#drag = { id, pointerId: event.pointerId, startX: event.clientX, startWidth: this.#currentWidth(id), rtl: this.#isRtl() };
    this.host.classList.add('aui-data-table--resizing');
  }

  #resizeKey(handle: HTMLElement, event: KeyboardEvent): void {
    const id = handle.dataset.column;
    const column = id === undefined ? undefined : this.#columnsById.get(id);
    if (id === undefined || !column) return;
    const rtl = this.#isRtl();
    const step = event.shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP;
    const { min, max } = widthBounds(column);
    // The handle sits on the inline-end edge: the arrow toward it widens the column.
    const delta = event.key === 'ArrowRight' ? (rtl ? -step : step) : event.key === 'ArrowLeft' ? (rtl ? step : -step) : 0;
    if (delta === 0 && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    if (!this.#freeze()) return;
    const width = event.key === 'Home' ? min : event.key === 'End' ? max : this.#currentWidth(id) + delta;
    const before = this.#widths.get(id);
    this.#setWidth(id, width);
    if (this.#widths.get(id) !== before) this.#emitColumns(id, 'resize');
  }

  #isRtl(): boolean {
    return (this.#doc.defaultView ?? window).getComputedStyle(this.table).direction === 'rtl';
  }

  #currentWidth(id: string): number {
    return this.#widths.get(id) ?? this.#frozen.get(id) ?? this.#headers.get(id)?.th.getBoundingClientRect().width ?? 0;
  }

  #setWidth(id: string, px: number): void {
    const column = this.#columnsById.get(id);
    if (!column) return;
    this.#widths.set(id, clampWidth(column, px));
    this.#applyWidths();
    this.#syncResizers();
    this.#layoutPins();
  }

  /**
   * Switch to a fixed table layout: measure every header cell once and give it a
   * pixel width, so resizing one column never redistributes the others. Returns
   * false when the table is not laid out (detached or hidden).
   */
  #freeze(): boolean {
    if (this.#fixed) return true;
    if (!this.table.isConnected) return false;
    const widths = this.#headCells.map((th) => th.getBoundingClientRect().width);
    if (widths.length === 0 || widths.some((w) => w === 0)) return false;
    this.#frozen.clear();
    this.#slots.forEach((slot, i) => {
      this.#frozen.set(slot.key, Math.round(widths[i] ?? 0));
    });
    this.#fixed = true;
    this.host.classList.add('aui-data-table--fixed');
    this.#applyWidths();
    return true;
  }

  #unfreeze(): void {
    if (!this.#fixed) return;
    this.#fixed = false;
    this.#frozen.clear();
    this.host.classList.remove('aui-data-table--fixed');
    this.table.style.removeProperty('inline-size');
    this.table.style.removeProperty('table-layout');
  }

  /**
   * Header cell widths through the CSSOM (CSP-safe). Pixel widths are border-box
   * (what the user sees and what was measured); the fixed layout also sets the
   * table layout and width, so it works independently of the stylesheet.
   */
  #applyWidths(): void {
    let sum = 0;
    this.#slots.forEach((slot, i) => {
      const th = this.#headCells[i];
      if (!th) return;
      const column = slot.column;
      const px = this.#fixed
        ? ((column ? this.#widths.get(column.id) : undefined) ?? this.#frozen.get(slot.key) ?? (column ? widthBounds(column).min : 0))
        : column ? this.#widths.get(column.id) : undefined;
      if (px !== undefined) {
        sum += px;
        th.style.setProperty('box-sizing', 'border-box');
        th.style.setProperty('width', `${String(px)}px`);
        return;
      }
      th.style.removeProperty('box-sizing');
      if (column?.width === undefined) th.style.removeProperty('width');
      else th.style.setProperty('width', column.width);
    });
    if (this.#fixed) {
      this.table.style.setProperty('table-layout', 'fixed');
      this.table.style.setProperty('inline-size', `${String(sum)}px`);
    }
  }

  /** Resize handle values; `measure` reads unknown widths from layout (only on demand). */
  #syncResizers(measure = false): void {
    const locale = this.#config().locale;
    for (const [id, entry] of this.#headers) {
      const handle = entry.resizer;
      const column = this.#columnsById.get(id);
      if (!handle || !column) continue;
      const width = Math.round(measure ? this.#currentWidth(id) : (this.#widths.get(id) ?? this.#frozen.get(id) ?? 0));
      const { min, max } = widthBounds(column);
      handle.setAttribute('aria-valuemin', String(min));
      handle.setAttribute('aria-valuemax', String(max));
      // Before the first measurement the width is unknown; report the minimum.
      const now = width === 0 ? min : Math.min(max, Math.max(min, width));
      handle.setAttribute('aria-valuenow', String(now));
      handle.setAttribute('aria-valuetext', getMessage('dataTable', 'widthValue', { width: formatNumber(now, {}, locale) }, locale));
    }
  }

  #disposePinObservers(): void {
    for (const d of this.#pinObservers) d();
    this.#pinObservers = [];
  }

  /** Sticky offsets of pinned slots: cumulative header cell widths from each edge. */
  #layoutPins(): void {
    const pinned = this.#slots.some((s) => s.pin !== null);
    this.host.classList.toggle('aui-data-table--pinned', pinned);
    if (!pinned || !this.table.isConnected) return;
    const widths = this.#headCells.map((th) => th.getBoundingClientRect().width);
    let offset = 0;
    this.#slots.forEach((slot, i) => {
      if (slot.pin !== 'start') return;
      this.table.style.setProperty(`--_aui-data-table-start-${String(slot.pinIndex)}`, `${String(offset)}px`);
      offset += widths[i] ?? 0;
    });
    offset = 0;
    for (let i = this.#slots.length - 1; i >= 0; i--) {
      const slot = this.#slots[i];
      if (slot?.pin !== 'end') continue;
      this.table.style.setProperty(`--_aui-data-table-end-${String(slot.pinIndex)}`, `${String(offset)}px`);
      offset += widths[i] ?? 0;
    }
  }

  /** Sticky positioning for a cell of a pinned slot (the offset comes from a table custom property). */
  static #pinCell<R>(cell: HTMLTableCellElement, slot: Slot<R>): void {
    if (slot.pin === null) return;
    cell.classList.add('aui-data-table__cell--pinned', `aui-data-table__cell--pinned-${slot.pin}`);
    if (slot.edge) cell.classList.add('aui-data-table__cell--pinned-edge');
    cell.style.setProperty(slot.pin === 'start' ? 'inset-inline-start' : 'inset-inline-end', `var(--_aui-data-table-${slot.pin}-${String(slot.pinIndex)}, 0px)`);
  }

  #textContext(config: Resolved): CellContext {
    const locale = config.locale;
    // Same formatter as formatNumber (Intl.NumberFormat), without its per-call cache key lookup.
    const formats = new Map<string, (value: number) => string>();
    return {
      locale,
      timezone: config.timezone,
      yes: getMessage('dataTable', 'booleanTrue', {}, locale),
      no: getMessage('dataTable', 'booleanFalse', {}, locale),
      number(value, currency) {
        let format = formats.get(currency);
        if (!format) {
          const options: Intl.NumberFormatOptions = currency === '' ? {} : { style: 'currency', currency };
          const formatter = new Intl.NumberFormat(locale, options);
          format = (v: number): string => formatter.format(v);
          formats.set(currency, format);
        }
        return format(value);
      },
    };
  }

  /** Lower-cased displayed text of a column for every row (cached per rows and generation). */
  #columnTexts(column: DataTableColumn<Row>, config: Resolved): readonly string[] {
    const valid = this.#textsFor?.items === this.#items && this.#textsFor.generation === this.#generation;
    if (!valid) {
      this.#texts.clear();
      this.#textsFor = { items: this.#items, generation: this.#generation };
    }
    let texts = this.#texts.get(column.id);
    if (!texts) {
      const ctx = this.#textContext(config);
      const locale = config.locale;
      texts = this.#items.map((item) => this.#cellText(column, column.accessor(item.row), item.row, ctx).toLocaleLowerCase(locale));
      this.#texts.set(column.id, texts);
    }
    return texts;
  }

  /** Stable client sort of all rows by the current sorts (cached). */
  #sortedItems(locale: string): readonly Item<Row>[] {
    const sorts = this.#effectiveSorts();
    const key = JSON.stringify(sorts);
    const cached = this.#sorted;
    if (cached?.key === key && cached.source === this.#items && cached.generation === this.#generation) return cached.value;
    const value = sortItems(this.#items, sorts, this.#columnsById, locale);
    this.#sorted = { key, source: this.#items, generation: this.#generation, value };
    return value;
  }

  /** Grouping columns sort first (in their sort direction when sorted, else ascending), then the other sorts. */
  #effectiveSorts(): DataTableSort[] {
    const groups = this.#groupColumns().map((c) => c.id);
    if (groups.length === 0) return this.#sorts;
    return [
      ...groups.map((column): DataTableSort => ({ column, direction: this.#sorts.find((s) => s.column === column)?.direction ?? 'ascending' })),
      ...this.#sorts.filter((s) => !groups.includes(s.column)),
    ];
  }

  #groupColumns(): DataTableColumn<Row>[] {
    return (this.#options.groupBy ?? []).map((id) => this.#columnsById.get(id)).filter((c): c is DataTableColumn<Row> => c !== undefined);
  }

  #aggregateColumns(): DataTableColumn<Row>[] {
    return this.#options.columns.filter((c) => c.aggregate !== undefined);
  }

  #groupedEntries(filtered: readonly Item<Row>[], config: Resolved): GroupedEntry<Row>[] | null {
    const columns = this.#groupColumns();
    if (columns.length === 0) return null;
    const ctx = this.#textContext(config);
    return groupItems(filtered, columns, (c, row) => this.#cellText(c, c.accessor(row), row, ctx), this.#collapsedGroups, this.#aggregateColumns());
  }

  /** Client filtering of the sorted rows (cached). */
  #filteredItems(config: Resolved): readonly Item<Row>[] {
    const sorted = this.#sortedItems(config.locale);
    const key = JSON.stringify([[...this.#filters], this.#search]);
    const cached = this.#filtered;
    if (cached?.key === key && cached.sorted === sorted && cached.generation === this.#generation) return cached.value;
    const env: FilterEnvironment<Row> = { locale: config.locale, timezone: config.timezone, text: (c) => this.#columnTexts(c, config) };
    const searchColumns = this.#slots.map((s) => s.column).filter((c): c is DataTableColumn<Row> => c !== null && c.searchable !== false);
    const predicate = compileFilter(this.#filters, this.#search, this.#columnsById, searchColumns, env);
    const value = predicate ? sorted.filter(predicate) : sorted;
    this.#filtered = { key, sorted, generation: this.#generation, value };
    return value;
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const host = this.host;
    if (config.selection === 'none' && this.#selected.size > 0) this.#selected = new Set();
    host.classList.toggle('aui-data-table--sticky', config.stickyHeader);
    host.classList.toggle('aui-data-table--virtual', o.virtual === true);
    for (const d of DENSITIES) host.classList.toggle(`aui-data-table--${d}`, d === config.density);
    this.#caption.textContent = o.caption;
    this.#caption.classList.toggle('aui-data-table__visually-hidden', o.hideCaption === true);

    const layoutKey = this.#computeSlots(config);
    if (layoutKey !== this.#layoutKey) {
      // Cells follow the slots: rebuild rows, and re-measure a fixed layout.
      if (this.#layoutKey !== '') this.#generation++;
      this.#layoutKey = layoutKey;
      this.#unfreeze();
    }
    this.#renderToolbar(config);
    const showFilterRow = o.filterRow !== false && this.#slots.some((s) => s.column?.filter !== undefined);
    const headKey = `${String(this.#generation)}|${layoutKey}|${String(showFilterRow)}|${String(o.resizable === true)}|${String(config.multiSort)}`;
    if (headKey !== this.#headKey) {
      this.#headKey = headKey;
      this.#renderHead(config, showFilterRow);
    }
    this.#syncSortHeaders(config);
    syncFilterControls(this.#filterControls, this.#filters, this.#pendingFilters, this.#doc, config.locale);
    this.#applyWidths();
    this.#syncResizers();

    const size = this.#effectivePageSize(config);
    const server = this.#isServer();
    const filtered = server ? this.#items : this.#filteredItems(config);
    const grouped = server ? null : this.#groupedEntries(filtered, config);
    const total = server ? (o.total ?? o.rows.length) : grouped ? grouped.length : filtered.length;
    const pageCount = size === null ? 1 : Math.max(1, Math.ceil(total / size));
    this.#page = Math.min(Math.max(this.#page, 1), pageCount);
    this.#pageStart = size === null ? 0 : (this.#page - 1) * size;
    this.#pageEntries = null;
    if (server) {
      this.#visible = this.#items;
    } else if (grouped) {
      // Pages count group header rows and row rows alike.
      const entries = size === null ? grouped : grouped.slice(this.#pageStart, this.#pageStart + size);
      this.#pageEntries = entries;
      this.#visible = entries.flatMap((e) => (e.kind === 'row' ? [e.item] : []));
    } else {
      this.#visible = size === null ? filtered : filtered.slice(this.#pageStart, this.#pageStart + size);
    }

    const loading = o.loading === true;
    const columns = this.#slots.length;
    const focusKey = this.#focusedEditKey();
    const hasEntries = this.#visible.length > 0 || (this.#pageEntries?.length ?? 0) > 0;
    if (!hasEntries && loading) this.#renderSkeleton(Math.min(size ?? SKELETON_ROWS, SKELETON_ROWS), columns);
    else if (!hasEntries) this.#renderEmpty(columns, o.emptyMessage ?? getMessage('dataTable', 'empty', {}, config.locale));
    else if (o.virtual === true) this.#renderWindow(config);
    else this.#renderRows(config);
    this.#restoreEditFocus(focusKey);
    this.#syncRowCount(total);
    this.#syncSelection(true);
    this.#renderStatus(loading, this.#visible.length > 0, config.locale);
    this.#renderPagination(config, total, size);
    this.#renderTotals(config, server ? null : filtered);
    // A restored or resized layout is fixed; measure once the table is laid out.
    if (this.#widths.size > 0 && !this.#fixed) this.#freeze();
    this.#layoutPins();
  }

  #renderToolbar(config: Resolved): void {
    const searchable = this.#options.searchable === true;
    this.#toolbar.hidden = !searchable;
    if (!searchable) {
      if (this.#searchInput) this.#toolbar.replaceChildren();
      this.#searchInput = null;
      this.#toolbar.removeAttribute('role');
      this.#toolbar.removeAttribute('aria-label');
      return;
    }
    this.#toolbar.setAttribute('role', 'search');
    this.#toolbar.setAttribute('aria-label', this.#options.caption);
    let input = this.#searchInput;
    if (!input) {
      const doc = this.#doc;
      const label = doc.createElement('label');
      label.className = 'aui-data-table__search';
      const text = doc.createElement('span');
      text.className = 'aui-data-table__search-label';
      input = doc.createElement('input');
      input.type = 'search';
      input.className = 'aui-data-table__search-input aui-data-table__control';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-controls', this.#region.id);
      label.append(text, input);
      this.#toolbar.replaceChildren(label);
      this.#searchInput = input;
    }
    const label = input.previousElementSibling;
    if (label) label.textContent = getMessage('dataTable', 'search', {}, config.locale);
    if (!this.#pendingSearch && input.value !== this.#search) input.value = this.#search;
  }

  #rowContext(config: Resolved): RowContext {
    const slots = this.#slots;
    const explicit = slots.findIndex((s) => s.column?.rowHeader === true);
    const firstData = slots.findIndex((s) => s.column !== null);
    const fallback = firstData === -1 || slots[firstData]?.column?.rowHeader === false ? -1 : firstData;
    return {
      ...this.#textContext(config),
      rowHeader: explicit !== -1 ? explicit : fallback,
      cellClasses: slots.map((s) => (s.column ? `aui-data-table__cell${DataTable.#alignClass(s.column)}` : 'aui-data-table__cell')),
      selection: config.selection,
    };
  }

  static #alignClass<R>(c: DataTableColumn<R>): string {
    const align = c.align ?? (c.type === 'number' || c.type === 'currency' ? 'end' : 'start');
    return align === 'start' ? '' : ` aui-data-table__cell--${align}`;
  }

  #renderHead(config: Resolved, showFilterRow: boolean): void {
    const doc = this.#doc;
    const o = this.#options;
    this.#headers.clear();
    releaseNodes(this.#headerNodes);
    this.#headerNodes = [];
    this.#filterControls.clear();
    this.#disposePinObservers();
    this.#selectAll = null;
    const locale = config.locale;
    this.#hint.textContent = getMessage('dataTable', 'multiSortHint', {}, locale);
    const cells: HTMLTableCellElement[] = [];
    for (const slot of this.#slots) {
      const th = doc.createElement('th');
      th.scope = 'col';
      const column = slot.column;
      if (slot.key === SELECT_KEY) {
        th.className = 'aui-data-table__header-cell aui-data-table__select-cell';
        if (config.selection === 'multiple') {
          const box = this.#selector('checkbox', true);
          const input = box.firstElementChild;
          if (input instanceof HTMLInputElement) {
            input.classList.add('aui-data-table__select-all');
            input.setAttribute('aria-label', getMessage('dataTable', 'selectAll', {}, locale));
            this.#selectAll = input;
          }
          th.append(box);
        } else {
          th.append(this.#srText(getMessage('dataTable', 'selectColumn', {}, locale)));
        }
      } else if (slot.key === EXPAND_KEY || !column) {
        th.className = 'aui-data-table__header-cell aui-data-table__expand-cell';
        th.append(this.#srText(getMessage('dataTable', 'expandColumn', {}, locale)));
      } else {
        th.className = `aui-data-table__header-cell${DataTable.#alignClass(column)}`;
        th.dataset.column = column.id;
        let button: HTMLButtonElement | null = null;
        let priority: HTMLSpanElement | null = null;
        let priorityText: HTMLSpanElement | null = null;
        if (column.sortable !== false) {
          button = doc.createElement('button');
          button.type = 'button';
          button.className = 'aui-data-table__sort';
          button.dataset.column = column.id;
          if (config.multiSort) button.setAttribute('aria-describedby', this.#hint.id);
          const label = doc.createElement('span');
          label.className = 'aui-data-table__sort-label';
          this.#headerContent(label, column);
          priority = doc.createElement('span');
          priority.className = 'aui-data-table__sort-priority';
          priority.setAttribute('aria-hidden', 'true');
          priority.hidden = true;
          priorityText = this.#srText('');
          button.append(label, priorityText, priority);
          th.append(button);
        } else {
          const label = doc.createElement('span');
          label.className = 'aui-data-table__header-label';
          this.#headerContent(label, column);
          th.append(label);
        }
        let resizer: HTMLSpanElement | null = null;
        if (column.resizable ?? o.resizable === true) {
          resizer = doc.createElement('span');
          resizer.className = 'aui-data-table__resizer';
          resizer.dataset.column = column.id;
          resizer.tabIndex = 0;
          resizer.setAttribute('role', 'separator');
          resizer.setAttribute('aria-orientation', 'vertical');
          resizer.setAttribute('aria-label', getMessage('dataTable', 'resize', { column: column.header }, locale));
          th.append(resizer);
          // Without this, the handle's name would join the column header's name read with every cell.
          th.setAttribute('aria-label', column.header);
        }
        this.#headers.set(column.id, { th, button, priority, priorityText, resizer, icon: null, state: '' });
      }
      DataTable.#pinCell(th, slot);
      cells.push(th);
    }
    this.#headCells = cells;
    this.#headRow.replaceChildren(...cells);
    if (showFilterRow) {
      const built = buildFilterRow<Row, Slot<Row>>(doc, this.#slots, locale, this.#textContext(config), (cell, slot) => {
        DataTable.#pinCell(cell, slot);
      });
      this.#filterRow = built.row;
      this.#filterControls = built.controls;
    } else {
      this.#filterRow = null;
    }
    this.#thead.replaceChildren(...(this.#filterRow ? [this.#headRow, this.#filterRow] : [this.#headRow]));
    // Pinned offsets follow the header cell widths (content, density, container size).
    this.#slots.forEach((slot, i) => {
      const th = cells[i];
      if (slot.pin !== null && th) {
        this.#pinObservers.push(observeResize(th, () => {
          this.#layoutPins();
        }));
      }
    });
  }

  #srText(text: string): HTMLSpanElement {
    const span = this.#doc.createElement('span');
    span.className = 'aui-data-table__visually-hidden';
    span.textContent = text;
    return span;
  }

  #syncSortHeaders(config: Resolved): void {
    const icons = this.#options.icons;
    const sorts = this.#sorts;
    const multi = sorts.length > 1;
    for (const [id, entry] of this.#headers) {
      const index = sorts.findIndex((s) => s.column === id);
      const direction = sorts[index]?.direction ?? null;
      // aria-sort belongs on one header only: the primary sort.
      if (direction && index === 0) entry.th.setAttribute('aria-sort', direction);
      else entry.th.removeAttribute('aria-sort');
      entry.th.classList.toggle('aui-data-table__header-cell--sorted', direction !== null);
      if (!entry.button) continue;
      const showPriority = multi && direction !== null;
      if (entry.priority) {
        entry.priority.hidden = !showPriority;
        entry.priority.textContent = showPriority ? formatNumber(index + 1, {}, config.locale) : '';
      }
      if (entry.priorityText) {
        entry.priorityText.textContent = showPriority
          ? getMessage('dataTable', direction === 'ascending' ? 'sortPriorityAscending' : 'sortPriorityDescending', { priority: formatNumber(index + 1, {}, config.locale) }, config.locale)
          : '';
      }
      const ref = direction === 'ascending' ? (icons?.sortAscending ?? 'arrow-up') : direction === 'descending' ? (icons?.sortDescending ?? 'arrow-down') : (icons?.sortNone ?? 'arrow-up-down');
      const state = `${direction ?? 'none'}|${typeof ref === 'string' ? ref : 'custom'}`;
      if (entry.state === state && typeof ref === 'string') continue;
      const icon = renderIcon(ref, { className: 'aui-data-table__sort-icon', doc: this.#doc });
      if (entry.icon) entry.icon.replaceWith(icon);
      else entry.button.append(icon);
      entry.icon = icon;
      entry.state = state;
    }
  }

  /** A selection input inside its box; cloned per row from a per-generation template. */
  #selector(type: 'checkbox' | 'radio', header = false): HTMLSpanElement {
    if (!header && this.#template && this.#templateGeneration === this.#generation) {
      const clone = this.#template.cloneNode(true);
      if (clone instanceof HTMLSpanElement) return clone;
    }
    const doc = this.#doc;
    const icons = this.#options.icons;
    const box = doc.createElement('span');
    box.className = 'aui-data-table__box';
    const input = doc.createElement('input');
    input.type = type;
    input.className = `aui-data-table__check aui-data-table__check--${type}`;
    if (type === 'radio') input.name = this.#radioName;
    box.append(input);
    if (type === 'checkbox') {
      const mark = (kind: 'checked' | 'indeterminate', ref: IconRef): HTMLSpanElement => {
        const span = doc.createElement('span');
        span.className = `aui-data-table__mark aui-data-table__mark--${kind}`;
        span.append(renderIcon(ref, { doc }));
        return span;
      };
      box.append(mark('checked', icons?.checked ?? 'check'));
      if (header) box.append(mark('indeterminate', icons?.indeterminate ?? 'minus'));
    }
    if (!header) {
      this.#template = box;
      this.#templateGeneration = this.#generation;
      const clone = box.cloneNode(true);
      if (clone instanceof HTMLSpanElement) return clone;
    }
    return box;
  }

  #cellText(column: DataTableColumn<Row>, value: unknown, row: Row, ctx: CellContext): string {
    if (column.format) return column.format(value, row);
    switch (column.type ?? 'text') {
      case 'number':
        return typeof value === 'number' && !Number.isNaN(value) ? ctx.number(value, '') : '';
      case 'currency':
        return typeof value === 'number' && !Number.isNaN(value) ? ctx.number(value, column.currency ?? 'USD') : '';
      case 'date':
        return isPlainDate(value) ? formatPlainDate(value, { dateStyle: 'medium' }, ctx.locale) : '';
      case 'datetime':
        // Always the configured timezone, never the machine's (SPEC section 8).
        return isInstantLike(value) ? formatInstant(value, { dateStyle: 'medium', timeStyle: 'short' }, ctx.timezone, ctx.locale) : '';
      case 'boolean':
        return typeof value === 'boolean' ? (value ? ctx.yes : ctx.no) : '';
      case 'text':
        return plainText(value);
    }
  }

  #buildRow(item: Item<Row>, ctx: RowContext): RowEntry<Row> {
    const doc = this.#doc;
    const { row, id } = item;
    const tr = doc.createElement('tr');
    tr.className = 'aui-data-table__row';
    this.#rowIds.set(tr, id);
    let input: HTMLInputElement | null = null;
    let expander: HTMLButtonElement | null = null;
    const rendered: Node[] = [];
    let headerCell: HTMLElement | null = null;
    const slots = this.#slots;
    const headerColumn = ctx.rowHeader >= 0 ? slots[ctx.rowHeader]?.column : null;
    const rowName = headerColumn ? this.#cellText(headerColumn, headerColumn.accessor(row), row, ctx).trim() || id : id;
    for (let c = 0; c < slots.length; c++) {
      const slot = slots[c];
      if (!slot) continue;
      const column = slot.column;
      if (slot.key === SELECT_KEY) {
        const td = doc.createElement('td');
        td.className = 'aui-data-table__cell aui-data-table__select-cell';
        const box = this.#selector(ctx.selection === 'multiple' ? 'checkbox' : 'radio');
        const el = box.firstElementChild;
        if (el instanceof HTMLInputElement) {
          input = el;
          input.dataset.rowId = id;
        }
        td.append(box);
        DataTable.#pinCell(td, slot);
        tr.append(td);
        continue;
      }
      if (slot.key === EXPAND_KEY || !column) {
        const td = doc.createElement('td');
        td.className = 'aui-data-table__cell aui-data-table__expand-cell';
        if (this.#isExpandable(row)) {
          expander = doc.createElement('button');
          expander.type = 'button';
          expander.className = 'aui-data-table__expander';
          expander.dataset.rowId = id;
          td.append(expander);
        }
        DataTable.#pinCell(td, slot);
        tr.append(td);
        continue;
      }
      const isHeader = c === ctx.rowHeader;
      const cell = doc.createElement(isHeader ? 'th' : 'td');
      if (isHeader) {
        cell.setAttribute('scope', 'row');
        headerCell = cell;
      }
      cell.className = ctx.cellClasses[c] ?? 'aui-data-table__cell';
      if (this.#isEditable(column, row)) {
        this.#editableCell(cell, column, item, rowName, ctx, rendered);
      } else if (column.render) {
        const content = column.render(row, doc);
        // Strings are text, never HTML; Nodes are consumer-owned and appended as-is.
        if (typeof content === 'string') cell.textContent = content;
        else {
          rendered.push(content);
          cell.append(content);
        }
      } else {
        cell.textContent = this.#cellText(column, column.accessor(row), row, ctx);
      }
      DataTable.#pinCell(cell, slot);
      tr.append(cell);
    }
    const name = (headerCell?.textContent ?? '').trim() || id;
    if (input) input.setAttribute('aria-label', getMessage('dataTable', 'selectRow', { row: name }, ctx.locale));
    if (expander) expander.setAttribute('aria-label', getMessage('dataTable', 'expandRow', { row: name }, ctx.locale));
    return { tr, row, generation: this.#generation, input, expander, rendered };
  }

  #entryFor(item: Item<Row>, previous: ReadonlyMap<string, RowEntry<Row>>, ctx: RowContext): RowEntry<Row> {
    const old = previous.get(item.id);
    return old?.row === item.row && old.generation === this.#generation ? old : this.#buildRow(item, ctx);
  }

  /** Detail row of an expanded row; the consumer content is rendered once per row object. */
  #detailFor(item: Item<Row>, entry: RowEntry<Row>): HTMLTableRowElement | null {
    const expanded = this.#expanded.has(item.id) && entry.expander !== null;
    const expander = entry.expander;
    if (expander) {
      expander.setAttribute('aria-expanded', String(expanded));
      const icons = this.#options.icons;
      const ref = expanded ? (icons?.collapse ?? 'chevron-down') : (icons?.expand ?? 'chevron-right');
      const key = expanded ? 'collapse' : 'expand';
      if (expander.dataset.icon !== key) {
        expander.replaceChildren(renderIcon(ref, { className: 'aui-data-table__expander-icon', doc: this.#doc }));
        expander.dataset.icon = key;
      }
    }
    if (!expanded) {
      expander?.removeAttribute('aria-controls');
      this.#dropDetail(item.id);
      return null;
    }
    let detail = this.#details.get(item.id);
    if (detail?.row !== item.row) {
      this.#dropDetail(item.id);
      const render = this.#options.renderDetail;
      const content = render ? render(item.row, this.#doc) : '';
      const node = typeof content === 'string' ? this.#doc.createTextNode(content) : content;
      const tr = this.#doc.createElement('tr');
      tr.className = 'aui-data-table__detail-row';
      tr.id = createId('aui-data-table-detail');
      detail = { row: item.row, tr, content: node, generation: -1 };
      this.#details.set(item.id, detail);
    }
    if (detail.generation !== this.#generation) {
      // Column changes rebuild the cell; the consumer's content node is moved, not re-rendered.
      const td = this.#doc.createElement('td');
      td.className = 'aui-data-table__detail';
      td.colSpan = this.#slots.length;
      td.append(detail.content);
      detail.tr.replaceChildren(td);
      detail.generation = this.#generation;
    }
    expander?.setAttribute('aria-controls', detail.tr.id);
    return detail.tr;
  }

  /** Reuse row elements by id; unchanged rows stay in place so focus inside them is kept. */
  #renderRows(config: Resolved): void {
    this.#resetBody('rows');
    const ctx = this.#rowContext(config);
    const previous = this.#entries;
    const entries = new Map<string, RowEntry<Row>>();
    const rows: HTMLTableRowElement[] = [];
    const expandable = this.#options.renderDetail !== undefined;
    const pageEntries: readonly GroupedEntry<Row>[] = this.#pageEntries ?? this.#visible.map((item) => ({ kind: 'row' as const, item }));
    const groupKeys = new Set<string>();
    for (const pageEntry of pageEntries) {
      if (pageEntry.kind === 'group') {
        rows.push(this.#groupRow(pageEntry.group, config));
        groupKeys.add(pageEntry.group.key);
        continue;
      }
      const item = pageEntry.item;
      const entry = this.#entryFor(item, previous, ctx);
      entries.set(item.id, entry);
      rows.push(entry.tr);
      if (expandable) {
        const detail = this.#detailFor(item, entry);
        if (detail) rows.push(detail);
      }
    }
    this.#dropGroupRows(groupKeys);
    if (expandable) for (const id of [...this.#details.keys()]) if (!entries.has(id)) this.#dropDetail(id);
    this.#dropEntries(previous, entries);
    this.#entries = entries;
    this.#placeRows(rows, previous.size === 0);
  }

  /** Release rendered cell nodes of row entries that are not kept (D8). */
  #dropEntries(previous: ReadonlyMap<string, RowEntry<Row>>, kept?: ReadonlyMap<string, RowEntry<Row>>): void {
    for (const [id, entry] of previous) if (kept?.get(id) !== entry) releaseNodes(entry.rendered);
  }

  #dropDetail(id: string): void {
    const detail = this.#details.get(id);
    if (!detail) return;
    this.#details.delete(id);
    releaseNode(detail.content);
  }

  /** A group header row: a toggle with the group text (or custom content) and the group's aggregates. */
  #groupRow(group: DataTableGroup<Row>, config: Resolved): HTMLTableRowElement {
    const ctx = this.#textContext(config);
    const summary = this.#aggregateSummary(group.aggregates, ctx);
    const signature = [group.label, String(group.count), String(group.collapsed), String(this.#slots.length), String(this.#generation), summary].join('\u0000');
    const cached = this.#groupRows.get(group.key);
    if (cached?.signature === signature) return cached.tr;
    releaseNode(cached?.node);
    const doc = this.#doc;
    const locale = config.locale;
    const tr = cached?.tr ?? doc.createElement('tr');
    tr.className = 'aui-data-table__group-row';
    tr.style.setProperty('--aui-data-table-group-depth', String(group.depth));
    const th = doc.createElement('th');
    th.scope = 'rowgroup';
    th.colSpan = this.#slots.length;
    th.className = 'aui-data-table__group';
    const column = this.#columnsById.get(group.column);
    const text = getMessage('dataTable', 'groupLabel', {
      column: column?.header ?? group.column,
      value: group.label === '' ? getMessage('dataTable', 'groupEmpty', {}, locale) : group.label,
      count: formatNumber(group.count, {}, locale),
    }, locale);
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'aui-data-table__group-toggle';
    button.dataset.groupKey = group.key;
    button.setAttribute('aria-expanded', String(!group.collapsed));
    const icons = this.#options.icons;
    button.append(renderIcon(group.collapsed ? (icons?.expand ?? 'chevron-right') : (icons?.collapse ?? 'chevron-down'), { className: 'aui-data-table__group-icon', doc }));
    const label = doc.createElement('span');
    label.className = 'aui-data-table__group-label';
    const render = this.#options.renderGroupHeader;
    const node = render ? render(group, doc) : null;
    if (node) {
      button.setAttribute('aria-label', text);
      label.append(node);
    } else {
      label.textContent = text;
    }
    button.append(label);
    th.append(button);
    if (summary) {
      const aggregates = doc.createElement('span');
      aggregates.className = 'aui-data-table__group-aggregates';
      aggregates.textContent = summary;
      th.append(aggregates);
    }
    tr.replaceChildren(th);
    this.#groupRows.set(group.key, { tr, signature, node });
    return tr;
  }

  /** Release group header rows that are not on the page any more (D8). */
  #dropGroupRows(keep: ReadonlySet<string>): void {
    for (const [key, row] of this.#groupRows) {
      if (keep.has(key)) continue;
      releaseNode(row.node);
      this.#groupRows.delete(key);
    }
  }

  #userToggleGroup(key: string): void {
    const collapsed = !this.#collapsedGroups.has(key);
    if (collapsed) this.#collapsedGroups.add(key);
    else this.#collapsedGroups.delete(key);
    this.#render();
    this.#groupRows.get(key)?.tr.querySelector<HTMLButtonElement>('button.aui-data-table__group-toggle')?.focus();
    emit(this.host, 'aui-group-toggle', { key, collapsed, collapsedGroups: [...this.#collapsedGroups] } satisfies DataTableGroupToggleDetail);
  }

  /** "Salary total: 1,200, Age average: 31.5" for the columns that aggregate. */
  #aggregateSummary(values: Readonly<Record<string, unknown>>, ctx: CellContext): string {
    const parts: string[] = [];
    for (const column of this.#aggregateColumns()) {
      if (this.#hidden.has(column.id)) continue;
      const value = values[column.id];
      if (value === null || value === undefined) continue;
      const kind = typeof column.aggregate === 'string' ? column.aggregate : 'custom';
      parts.push(getMessage('dataTable', `aggregate_${kind}`, { column: column.header, value: this.#aggregateText(column, value, ctx) }, ctx.locale));
    }
    return parts.join(', ');
  }

  #aggregateText(column: DataTableColumn<Row>, value: unknown, ctx: CellContext): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (column.aggregate === 'count') return ctx.number(value, '');
      if (column.type === 'currency') return ctx.number(value, column.currency ?? 'USD');
      return ctx.number(value, '');
    }
    return plainText(value);
  }

  /** The totals row in <tfoot>: client aggregates over all filtered rows, or server `totals`. */
  #renderTotals(config: Resolved, filtered: readonly Item<Row>[] | null): void {
    const o = this.#options;
    const columns = this.#aggregateColumns();
    const serverTotals = filtered === null ? o.totals : undefined;
    const hasTotals = filtered === null ? serverTotals !== undefined : columns.length > 0;
    if (o.showTotals === false || !hasTotals) {
      this.#tfoot?.remove();
      this.#tfoot = null;
      return;
    }
    const values: Readonly<Record<string, unknown>> = serverTotals ?? aggregateAll(columns, (filtered ?? []).map((item) => item.row));
    const doc = this.#doc;
    const ctx = this.#textContext(config);
    const classes = this.#rowContext(config).cellClasses;
    if (!this.#tfoot) {
      this.#tfoot = doc.createElement('tfoot');
      this.#tfoot.className = 'aui-data-table__foot';
      this.table.append(this.#tfoot);
    }
    const tr = doc.createElement('tr');
    tr.className = 'aui-data-table__totals-row';
    const label = getMessage('dataTable', 'totals', {}, config.locale);
    let labelled = false;
    for (const [index, slot] of this.#slots.entries()) {
      const column = slot.column;
      const has = column !== null && Object.hasOwn(values, column.id) && values[column.id] !== null && values[column.id] !== undefined;
      if (!has && !labelled) {
        const th = doc.createElement('th');
        th.scope = 'row';
        th.className = 'aui-data-table__total-label';
        th.textContent = label;
        DataTable.#pinCell(th, slot);
        tr.append(th);
        labelled = true;
        continue;
      }
      const td = doc.createElement('td');
      td.className = `${classes[index] ?? 'aui-data-table__cell'} aui-data-table__total`;
      if (has) td.textContent = this.#aggregateText(column, values[column.id], ctx);
      DataTable.#pinCell(td, slot);
      tr.append(td);
    }
    if (!labelled) {
      // Every column aggregates: the label is read before the first value.
      const first = tr.firstElementChild;
      const hidden = doc.createElement('span');
      hidden.className = 'aui-data-table__visually-hidden';
      hidden.textContent = `${label}: `;
      first?.prepend(hidden);
    }
    this.#tfoot.replaceChildren(tr);
  }

  #resetBody(kind: 'rows' | 'empty' | 'skeleton'): void {
    if (this.#bodyKind === kind) return;
    this.#releaseEmpty();
    this.#tbody.replaceChildren();
    this.#dropEntries(this.#entries);
    this.#entries.clear();
    this.#bodyKind = kind;
  }

  /** Put `rows` into the body in order with the fewest moves. */
  #placeRows(rows: readonly HTMLTableRowElement[], fresh: boolean): void {
    const tbody = this.#tbody;
    if (fresh) {
      const fragment = this.#doc.createDocumentFragment();
      fragment.append(...rows);
      tbody.replaceChildren(fragment);
      return;
    }
    let ref = tbody.firstChild;
    for (const tr of rows) {
      if (tr === ref) ref = ref.nextSibling;
      else tbody.insertBefore(tr, ref);
    }
    while (ref) {
      const next = ref.nextSibling;
      ref.remove();
      ref = next;
    }
  }

  #headRowCount(): number {
    return this.#filterRow ? 2 : 1;
  }

  /** Virtual mode: aria-rowcount on the table and aria-rowindex on header rows; removed otherwise. */
  #syncRowCount(total: number): void {
    const virtual = this.#options.virtual === true && this.#bodyKind === 'rows';
    const heads = [this.#headRow, ...(this.#filterRow ? [this.#filterRow] : [])];
    if (!virtual) {
      this.table.removeAttribute('aria-rowcount');
      for (const tr of heads) tr.removeAttribute('aria-rowindex');
      return;
    }
    this.table.setAttribute('aria-rowcount', String(this.#headRowCount() + total));
    heads.forEach((tr, i) => {
      tr.setAttribute('aria-rowindex', String(i + 1));
    });
  }

  #spacer(index: number, rows: number, columns: number, height: number): HTMLTableRowElement {
    let tr = this.#spacers[index];
    if (!tr) {
      tr = this.#doc.createElement('tr');
      tr.className = 'aui-data-table__spacer';
      tr.setAttribute('aria-hidden', 'true');
      tr.append(this.#doc.createElement('td'));
      this.#spacers[index] = tr;
    }
    const td = tr.firstElementChild;
    if (td instanceof HTMLTableCellElement) {
      td.colSpan = columns;
      td.style.setProperty('block-size', `${String(rows * height)}px`);
    }
    return tr;
  }

  /**
   * Virtual mode: render the rows inside the scroll region's viewport plus an
   * overscan, and spacer rows for the rest. The row holding focus stays rendered.
   */
  #renderWindow(config: Resolved): void {
    this.#resetBody('rows');
    const visible = this.#visible;
    const n = visible.length;
    const region = this.#region;
    const height = this.#rowHeight ?? this.#options.rowHeight ?? DEFAULT_ROW_HEIGHT;
    const viewport = region.clientHeight > 0 ? region.clientHeight : height * 20;
    // Offset of the first body row inside the scrolled content (caption and header rows above it).
    const bodyTop = this.#tbody.getBoundingClientRect().top - region.getBoundingClientRect().top - region.clientTop + region.scrollTop;
    const top = Math.max(0, region.scrollTop - bodyTop);
    const start = Math.min(n, Math.max(0, Math.floor(top / height) - OVERSCAN));
    const end = Math.min(n, start + MAX_WINDOW, Math.ceil((top + viewport) / height) + OVERSCAN);
    const indexes: number[] = [];
    const focused = this.#focusedId;
    let focusIndex = -1;
    if (focused !== null && this.#entries.has(focused)) {
      focusIndex = visible.findIndex((item) => item.id === focused);
      if (focusIndex >= start && focusIndex < end) focusIndex = -1;
    }
    if (focusIndex !== -1 && focusIndex < start) indexes.push(focusIndex);
    for (let i = start; i < end; i++) indexes.push(i);
    if (focusIndex !== -1 && focusIndex >= end) indexes.push(focusIndex);

    const ctx = this.#rowContext(config);
    const previous = this.#entries;
    const entries = new Map<string, RowEntry<Row>>();
    const rows: HTMLTableRowElement[] = [];
    const columns = this.#slots.length;
    const offset = this.#headRowCount() + this.#pageStart + 1;
    let spacer = 0;
    let last = -1;
    for (const i of indexes) {
      const item = visible[i];
      if (!item) continue;
      if (i - last > 1) rows.push(this.#spacer(spacer++, i - last - 1, columns, height));
      const entry = this.#entryFor(item, previous, ctx);
      entry.tr.setAttribute('aria-rowindex', String(offset + i));
      entries.set(item.id, entry);
      rows.push(entry.tr);
      last = i;
    }
    if (n - last > 1) rows.push(this.#spacer(spacer, n - last - 1, columns, height));
    this.#dropEntries(previous, entries);
    this.#entries = entries;
    this.#placeRows(rows, previous.size === 0);
    this.#syncSelection(false);

    // Replace the estimate with the measured height once per generation (density, fonts).
    const first = entries.values().next().value;
    if (first && this.#measuredGeneration !== this.#generation && region.clientHeight > 0) {
      const measured = first.tr.getBoundingClientRect().height;
      this.#measuredGeneration = this.#generation;
      if (measured > 0 && Math.abs(measured - height) > 0.5) {
        this.#rowHeight = measured;
        this.#renderWindow(config);
      }
    }
  }

  #isEditable(column: DataTableColumn<Row>, row: Row): boolean {
    const editable = column.editable;
    return typeof editable === 'function' ? editable(row) : editable === true;
  }

  #editorKind(column: DataTableColumn<Row>): DataTableEditorKind {
    if (column.editor) return column.editor;
    switch (column.type) {
      case 'number':
      case 'currency':
        return 'number';
      case 'date':
        return 'date';
      case 'boolean':
        return 'checkbox';
      default:
        return 'text';
    }
  }

  static #editKey(rowId: string, column: string): string {
    return `${encodeURIComponent(rowId)}|${encodeURIComponent(column)}`;
  }

  /** An editable cell: a button showing the value, or the editor while editing. */
  #editableCell(cell: HTMLElement, column: DataTableColumn<Row>, item: Item<Row>, rowName: string, ctx: RowContext, rendered: Node[]): void {
    const doc = this.#doc;
    const { row, id } = item;
    const editing = this.#editing;
    if (editing?.rowId === id && editing.column === column.id) {
      cell.classList.add('aui-data-table__cell--editing');
      cell.append(this.#editorFor(column, item, rowName, ctx, editing));
      return;
    }
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'aui-data-table__edit';
    button.dataset.rowId = id;
    button.dataset.column = column.id;
    button.dataset.editKey = DataTable.#editKey(id, column.id);
    if (column.render) {
      const content = column.render(row, doc);
      if (typeof content === 'string') button.append(content);
      else {
        rendered.push(content);
        button.append(content);
      }
    } else {
      button.append(this.#cellText(column, column.accessor(row), row, ctx));
    }
    const kind = this.#editorKind(column);
    if (kind === 'checkbox') button.setAttribute('aria-pressed', String(column.accessor(row) === true));
    button.append(this.#srText(`, ${getMessage('dataTable', 'editHint', { column: column.header }, ctx.locale)}`));
    cell.append(button);
  }

  #editorFor(column: DataTableColumn<Row>, item: Item<Row>, rowName: string, ctx: RowContext, editing: { error: string | null; node: Node | null; draft?: string }): HTMLElement {
    const doc = this.#doc;
    const { row, id } = item;
    const value = column.accessor(row);
    const wrapper = doc.createElement('div');
    wrapper.className = 'aui-data-table__editor';
    wrapper.dataset.editKey = DataTable.#editKey(id, column.id);
    const errorId = createId('aui-data-table-edit-error');
    const render = column.renderEditor;
    if (render) {
      const context: DataTableEditorContext<Row> = {
        row,
        rowId: id,
        column: column.id,
        value,
        error: editing.error,
        commit: (next) => {
          this.#commitEdit(id, column.id, next);
        },
        cancel: () => {
          this.#closeEdit(id, column.id);
        },
      };
      editing.node ??= render(context, doc);
      wrapper.append(editing.node);
    } else {
      const label = getMessage('dataTable', 'editLabel', { column: column.header, row: rowName }, ctx.locale);
      const control = this.#builtInEditor(column, value, label);
      // The typed text survives a row rebuilt by an outside update.
      if (editing.draft !== undefined) control.value = editing.draft;
      control.addEventListener('input', () => {
        editing.draft = control.value;
      });
      if (editing.error) {
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', errorId);
      }
      control.addEventListener('keydown', (event) => {
        if (!(event instanceof KeyboardEvent)) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          this.#commitEdit(id, column.id, this.#editorValue(column, control));
        } else if (event.key === 'Escape') {
          // Escape ends editing only; it must not also close an enclosing dialog.
          event.preventDefault();
          event.stopPropagation();
          this.#closeEdit(id, column.id);
        }
      });
      control.addEventListener('focusout', (event) => {
        const next = event instanceof FocusEvent ? event.relatedTarget : null;
        if (this.#editRendering || (next instanceof Node && wrapper.contains(next))) return;
        // A row rebuilt by a render removes the editor without leaving the cell: commit only real blurs.
        queueMicrotask(() => {
          if (!control.isConnected || this.#editing?.rowId !== id || this.#editing.column !== column.id) return;
          if (wrapper.contains(this.#doc.activeElement)) return;
          this.#commitEdit(id, column.id, this.#editorValue(column, control));
        });
      });
      wrapper.append(control);
    }
    if (editing.error) {
      const message = doc.createElement('span');
      message.id = errorId;
      message.className = 'aui-data-table__edit-error';
      message.textContent = editing.error;
      wrapper.append(message);
    }
    return wrapper;
  }

  #builtInEditor(column: DataTableColumn<Row>, value: unknown, label: string): HTMLInputElement | HTMLSelectElement {
    const doc = this.#doc;
    const kind = this.#editorKind(column);
    if (kind === 'select') {
      const select = doc.createElement('select');
      select.className = 'aui-data-table__editor-control aui-data-table__control';
      for (const option of column.editOptions ?? []) {
        const el = doc.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        select.append(el);
      }
      select.value = typeof value === 'string' ? value : '';
      select.setAttribute('aria-label', label);
      return select;
    }
    const input = doc.createElement('input');
    input.className = 'aui-data-table__editor-control aui-data-table__control';
    input.setAttribute('aria-label', label);
    if (kind === 'number') {
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
    } else if (kind === 'date') {
      input.type = 'date';
      input.value = isPlainDate(value) ? plainDateToString(value) : '';
    } else {
      input.type = 'text';
      input.value = value === null || value === undefined ? '' : plainText(value);
    }
    return input;
  }

  /** The typed value of a built-in editor; numbers that do not parse are reported by `#commitEdit`. */
  #editorValue(column: DataTableColumn<Row>, control: HTMLInputElement | HTMLSelectElement): unknown {
    const text = control.value;
    switch (this.#editorKind(column)) {
      case 'number': {
        if (text.trim() === '') return null;
        const n = Number(text.trim());
        return Number.isFinite(n) ? n : Number.NaN;
      }
      case 'date':
        return text === '' ? null : parsePlainDate(text);
      default:
        return text;
    }
  }

  /** Click on an editable cell: checkbox columns toggle at once, others open the editor. */
  #activateEdit(rowId: string, columnId: string): void {
    const column = this.#columnsById.get(columnId);
    const row = this.#byId.get(rowId);
    if (!column || row === undefined || !this.#isEditable(column, row)) return;
    if (this.#editorKind(column) === 'checkbox' && !column.renderEditor) {
      this.#commitEdit(rowId, columnId, column.accessor(row) !== true);
      return;
    }
    if (this.#editing) this.#closeEdit(this.#editing.rowId, this.#editing.column, false);
    this.#editing = { rowId, column: columnId, error: null, node: null };
    this.#invalidateRow(rowId);
    this.#editRender();
    this.#focusEditor();
  }

  #commitEdit(rowId: string, columnId: string, value: unknown): void {
    const column = this.#columnsById.get(columnId);
    const row = this.#byId.get(rowId);
    if (!column || row === undefined) return;
    const editing = this.#editing;
    const message = typeof value === 'number' && Number.isNaN(value)
      ? getMessage('dataTable', 'editNumber', {}, this.#config().locale)
      : (column.validate?.(value, row) ?? null);
    if (message !== null && editing?.rowId === rowId && editing.column === columnId) {
      editing.error = message;
      this.#invalidateRow(rowId);
      this.#editRender();
      this.#focusEditor();
      return;
    }
    if (message !== null) return;
    const previous = column.accessor(row);
    this.#closeEdit(rowId, columnId);
    if (Object.is(previous, value)) return;
    emit(this.host, 'aui-cell-edit', { rowId, row, column: columnId, value, previous } satisfies DataTableCellEditDetail<Row>);
  }

  /** End editing; focus returns to the cell button unless `focus` is false. */
  #closeEdit(rowId: string, columnId: string, focus = true): void {
    const editing = this.#editing;
    if (editing?.rowId === rowId && editing.column === columnId) {
      releaseNode(editing.node);
      this.#editing = null;
    }
    this.#invalidateRow(rowId);
    this.#editRender();
    if (focus) this.#tbody.querySelector<HTMLElement>(`button[data-edit-key="${CSS.escape(DataTable.#editKey(rowId, columnId))}"]`)?.focus();
  }

  #editRender(): void {
    this.#editRendering = true;
    try {
      this.#render();
    } finally {
      this.#editRendering = false;
    }
  }

  /** Rebuild one row on the next render (its rendered nodes are released). */
  #invalidateRow(rowId: string): void {
    const entry = this.#entries.get(rowId);
    if (!entry) return;
    releaseNodes(entry.rendered);
    this.#entries.delete(rowId);
  }

  #focusEditor(): void {
    const editor = this.#tbody.querySelector('.aui-data-table__cell--editing .aui-data-table__editor');
    const target = editor?.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
    target?.focus();
  }

  #focusedEditKey(): string | null {
    const active = this.#doc.activeElement;
    if (!(active instanceof HTMLElement) || !this.#tbody.contains(active)) return null;
    return active.closest<HTMLElement>('[data-edit-key]')?.dataset.editKey ?? null;
  }

  /** A rebuilt row loses DOM focus: return it to the same editable cell. */
  #restoreEditFocus(key: string | null): void {
    if (key === null) return;
    const active = this.#doc.activeElement;
    if (active instanceof HTMLElement && this.#tbody.contains(active)) return;
    const target = this.#tbody.querySelector<HTMLElement>(`[data-edit-key="${CSS.escape(key)}"]`);
    const focusable = target?.matches('button, input, select, textarea') ? target : target?.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
  }

  /** Header text, or custom content with the header kept as visually hidden text. */
  #headerContent(label: HTMLElement, column: DataTableColumn<Row>): void {
    const render = column.renderHeader;
    if (!render) {
      label.textContent = column.header;
      return;
    }
    const node = render(column, this.#doc);
    this.#headerNodes.push(node);
    const content = this.#doc.createElement('span');
    content.className = 'aui-data-table__header-content';
    content.setAttribute('aria-hidden', 'true');
    content.append(node);
    label.replaceChildren(this.#srText(column.header), content);
  }

  #releaseEmpty(): void {
    releaseNode(this.#emptyNode);
    this.#emptyNode = null;
  }

  #renderEmpty(columns: number, message: string): void {
    const doc = this.#doc;
    this.#dropEntries(this.#entries);
    this.#dropGroupRows(new Set());
    this.#entries.clear();
    this.#bodyKind = 'empty';
    const tr = doc.createElement('tr');
    tr.className = 'aui-data-table__empty-row';
    const td = doc.createElement('td');
    td.className = 'aui-data-table__empty';
    td.colSpan = columns;
    const render = this.#options.renderEmpty;
    if (render) {
      this.#emptyNode ??= render(doc);
      td.append(this.#emptyNode);
    } else {
      this.#releaseEmpty();
      td.textContent = message;
    }
    tr.append(td);
    this.#tbody.replaceChildren(tr);
  }

  /** Decorative placeholder rows (hidden from assistive technology; the status announces loading). */
  #renderSkeleton(count: number, columns: number): void {
    const doc = this.#doc;
    this.#dropEntries(this.#entries);
    this.#dropGroupRows(new Set());
    this.#releaseEmpty();
    this.#entries.clear();
    this.#bodyKind = 'skeleton';
    const fragment = doc.createDocumentFragment();
    for (let r = 0; r < count; r++) {
      const tr = doc.createElement('tr');
      tr.className = 'aui-data-table__row aui-data-table__skeleton-row';
      tr.setAttribute('aria-hidden', 'true');
      for (let c = 0; c < columns; c++) {
        const td = doc.createElement('td');
        td.className = 'aui-data-table__cell';
        const bar = doc.createElement('span');
        bar.className = 'aui-data-table__skeleton';
        td.append(bar);
        tr.append(td);
      }
      fragment.append(tr);
    }
    this.#tbody.replaceChildren(fragment);
  }

  /** Row inputs of rendered rows; with `all`, also the select-all state over the whole page. */
  #syncSelection(all: boolean): void {
    for (const [id, entry] of this.#entries) {
      const on = this.#selected.has(id);
      entry.tr.classList.toggle('aui-data-table__row--selected', on);
      if (entry.input) {
        entry.input.checked = on;
        entry.input.disabled = !this.#isSelectable(entry.row);
      }
    }
    const box = this.#selectAll;
    if (!all || !box) return;
    // "Select all" covers the current page only (every row of it in virtual mode); other pages keep their selection.
    let selectable = 0;
    let selected = 0;
    for (const item of this.#visible) {
      if (!this.#isSelectable(item.row)) continue;
      selectable++;
      if (this.#selected.has(item.id)) selected++;
    }
    box.checked = selectable > 0 && selected === selectable;
    box.indeterminate = selected > 0 && selected < selectable;
    box.disabled = selectable === 0;
  }

  #renderStatus(loading: boolean, hasRows: boolean, locale: string): void {
    if (loading) this.#region.setAttribute('aria-busy', 'true');
    else this.#region.removeAttribute('aria-busy');
    this.host.classList.toggle('aui-data-table--loading', loading);
    this.#status.classList.toggle('aui-data-table__status--overlay', loading && hasRows);
    if (!loading) {
      this.#status.replaceChildren();
      return;
    }
    this.#statusLabel.textContent = getMessage('dataTable', 'loading', {}, locale);
    if (this.#status.childElementCount === 0) {
      // Inserted into the existing status region, so "Loading" is announced.
      const icon = renderIcon(this.#options.icons?.loading ?? 'spinner', { className: 'aui-data-table__spinner', doc: this.#doc });
      this.#status.replaceChildren(icon, this.#statusLabel);
    }
  }

  #renderPagination(config: Resolved, total: number, size: number | null): void {
    if (size === null) {
      this.#pagination?.destroy();
      this.#pagination = null;
      this.#pagerKey = '';
      this.#pagerHost.hidden = true;
      return;
    }
    const sizes = this.#options.pageSizes;
    const label = getMessage('dataTable', 'pagination', { caption: this.#options.caption }, config.locale);
    const options: PaginationOptions = {
      total,
      pageSize: size,
      page: this.#page,
      label,
      locale: config.locale,
      direction: config.direction,
      ...(sizes === undefined ? {} : { pageSizes: sizes }),
    };
    const key = JSON.stringify([total, size, this.#page, sizes ?? null, label, config.locale, config.direction]);
    this.#pagerHost.hidden = total === 0;
    if (this.#fromPager) {
      this.#pagerKey = key;
      return;
    }
    if (key === this.#pagerKey && this.#pagination) return;
    this.#pagerKey = key;
    if (this.#pagination && !(sizes === undefined && this.#pagination.options.pageSizes !== undefined)) {
      this.#pagination.update(options);
      return;
    }
    this.#pagination?.destroy();
    this.#pagination = Pagination.create(this.#pagerHost, options);
  }

  #csvColumns(spec: 'visible' | 'all' | readonly string[]): DataTableColumn<Row>[] {
    if (spec === 'visible') return this.#slots.map((s) => s.column).filter((c): c is DataTableColumn<Row> => c !== null && c.exportable !== false);
    if (spec === 'all') return this.#orderedColumns().filter((c) => c.exportable !== false);
    return spec.map((id) => {
      const c = this.#columnsById.get(id);
      if (!c) throw configurationError('DATA_TABLE_CSV', 'Unknown CSV export column.', { component: 'dataTable', property: 'dataTable.toCsv.columns', expected: 'ids of existing columns' });
      return c;
    });
  }

  #csvRows(spec: NonNullable<DataTableCsvOptions['rows']>, config: Resolved): readonly Item<Row>[] {
    if (spec === 'page') return this.#visible;
    const server = this.#isServer();
    if (spec === 'filtered') return server ? this.#items : this.#filteredItems(config);
    const all = server ? this.#items : this.#sortedItems(config.locale);
    return spec === 'all' ? all : all.filter((item) => this.#selected.has(item.id));
  }

  #csvValue(column: DataTableColumn<Row>, row: Row, raw: boolean, ctx: CellContext): CsvValue {
    if (column.exportValue) {
      const v = column.exportValue(row);
      // Numbers and booleans cannot carry a formula; strings from callbacks are untrusted.
      if (typeof v === 'number') return { text: Number.isFinite(v) ? String(v) : '', trusted: true };
      if (typeof v === 'boolean') return { text: String(v), trusted: true };
      return { text: v ?? '', trusted: false };
    }
    const value = column.accessor(row);
    const numeric = (column.type === 'number' || column.type === 'currency') && typeof value === 'number' && Number.isFinite(value);
    if (raw) {
      if (typeof value === 'number') return { text: Number.isFinite(value) ? String(value) : '', trusted: true };
      if (typeof value === 'boolean') return { text: String(value), trusted: true };
      if (isPlainDate(value)) return { text: plainDateToString(value), trusted: true };
      if (isInstantLike(value)) return { text: instantToString(instant(value.epochMilliseconds)), trusted: true };
      return { text: plainText(value), trusted: false };
    }
    // Typed number text comes from Intl, not from row data; format() output is untrusted.
    return { text: this.#cellText(column, value, row, ctx), trusted: numeric && !column.format };
  }
}
