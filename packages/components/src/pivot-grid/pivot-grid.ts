/**
 * Pivot Grid (SPEC section 18.19 Pivot Table / Pivot Grid). Cross-tabulates records by
 * row and column fields and aggregates value fields (sum, count, average, min,
 * max, distinct count) with group subtotals and grand totals. A real <table>: the
 * column header rows use `th scope="col"`/`"colgroup"`, each row has a row header
 * (`th scope="row"`, compact form: nested members are indented and carry their
 * group's path as hidden text), and every data cell names its headers through the
 * `headers` attribute (WCAG H43), so multi-level headers are announced. Like Data
 * Table it is not an ARIA grid: users Tab through the expand and sort buttons.
 *
 * Data comes from a `PivotDataSource`: `data` creates the local in-memory engine;
 * `dataSource` connects an application server with the same query contract. Groups
 * load lazily when expanded; requests are cancellable and time out. The layout
 * (fields per area, aggregates, member filters, sort, expansion) is serializable
 * and emitted with `aui-layout-change`; the Field List edits it.
 */
import {
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatNumber,
  getMessage,
  registerMessages,
  validators,
  type Density,
  type Direction,
} from '@absoluteui/core';
import { renderIcon } from '@absoluteui/icons';
import { announce, observeResize } from '@absoluteui/utilities';
import { assertCsvOptions, toCsvText, type CsvValue, type DataTableCsvOptions } from '../data-table/csv.js';
import { columnTree, pendingParents, rowEntries, PivotStore, type AxisContext, type PivotAxis, type PivotAxisEntry, type PivotColumnNode } from './axis.js';
import { createLocalPivotSource, memberText } from './engine.js';
import {
  assertFields,
  assertMembersResult,
  assertQueryResult,
  copyLayout,
  fail,
  normalizeLayout,
  omit,
  pathKey,
  type PivotAggregate,
  type PivotDataSource,
  type PivotField,
  type PivotKey,
  type PivotLayout,
  type PivotLayoutInput,
  type PivotMembersResult,
  type PivotPath,
  type PivotQuery,
  type PivotSort,
} from './model.js';

export type PivotGrandTotals = 'both' | 'rows' | 'columns' | 'none';

export interface PivotGridConfig {
  /** Grand total row, column, both (default), or none. */
  grandTotals: PivotGrandTotals;
  /** Total column after each expanded column group. Default true. */
  columnSubtotals: boolean;
  /** Group levels expanded when the layout has no explicit expansion (0 = top level only). Default 16 (all). */
  expandDepth: number;
  /** Data source request timeout in milliseconds. Default 30000. */
  requestTimeoutMs: number;
  /** Column headers stay visible while the region scrolls. Default true. */
  stickyHeader: boolean;
}

type Resolved = Readonly<PivotGridConfig & { locale: string; density: Density; direction: Direction }>;

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    pivotGrid: PivotGridConfig & { locale: string; density: Density; direction: Direction };
  }
}

export const pivotGridConfig = defineComponentConfig<PivotGridConfig, 'locale' | 'density' | 'direction'>(
  'pivotGrid',
  {
    grandTotals: { default: 'both', expected: '"both" | "rows" | "columns" | "none"', validate: validators.oneOf(['both', 'rows', 'columns', 'none'] as const) },
    columnSubtotals: { default: true, expected: 'boolean', validate: validators.isBoolean },
    expandDepth: { default: 16, expected: 'integer from 0 to 16', validate: validators.integerInRange(0, 16) },
    requestTimeoutMs: { default: 30_000, expected: 'integer from 100 to 600000 (ms)', validate: validators.integerInRange(100, 600_000) },
    stickyHeader: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'density', 'direction'],
);

registerMessages('pivotGrid', 'en', {
  grandTotal: 'Grand total',
  total: '{label} total',
  blank: '(blank)',
  rows: 'Rows',
  empty: 'No data',
  noValues: 'Add a field to Values to see results.',
  loading: 'Loading',
  loadFailed: 'The data could not be loaded.',
  retry: 'Retry',
  sum: 'Sum of {field}',
  count: 'Count of {field}',
  average: 'Average of {field}',
  min: 'Minimum of {field}',
  max: 'Maximum of {field}',
  distinctCount: 'Distinct count of {field}',
  sortedAscending: 'Sorted by {column}, ascending',
  sortedDescending: 'Sorted by {column}, descending',
  sortCleared: 'Sorting cleared',
  pathSeparator: ', ',
});

export interface PivotGridOptions<Row> extends Partial<PivotGridConfig> {
  /** Visible caption and accessible name of the table and its scroll region. */
  caption: string;
  /** Keep the caption for assistive technology only. Default false. */
  hideCaption?: boolean;
  fields: readonly PivotField<Row>[];
  /** Records aggregated in the browser (the local engine). Exclusive with `dataSource`. */
  data?: readonly Row[];
  /** Server-side aggregation. Exclusive with `data`. */
  dataSource?: PivotDataSource;
  layout: PivotLayoutInput;
  /** Render only the rows in view (fixed row height). Default false. */
  virtual?: boolean;
  /** Virtual mode row height estimate in CSS px (measured after the first render). Default 40. */
  rowHeight?: number;
  /** Text when there is no data. Default: localized "No data". */
  emptyMessage?: string;
  locale?: string;
  density?: Density;
  direction?: Direction;
}

export type PivotGridLayoutChangeReason = 'layout' | 'sort' | 'filter' | 'expand' | 'collapse';

/** Detail of `aui-layout-change`. */
export interface PivotGridLayoutChangeDetail {
  reason: PivotGridLayoutChangeReason;
  layout: PivotLayout;
}

/** Detail of `aui-load-error`. */
export interface PivotGridLoadErrorDetail {
  error: unknown;
  /** `query` (cells) or `members` (a filter list). */
  request: 'query' | 'members';
}

/** One header of the exported matrix. */
export interface PivotMatrixHeader {
  path: PivotKey[];
  /** Member labels along the path (the grand total has none). */
  labels: string[];
  kind: 'member' | 'subtotal' | 'total';
}

export interface PivotMatrixColumn extends PivotMatrixHeader {
  /** Index into `layout.values`. */
  value: number;
  valueLabel: string;
}

/** The visible pivot as plain data (for charts or other consumers). */
export interface PivotMatrix {
  rows: PivotMatrixHeader[];
  columns: PivotMatrixColumn[];
  /** `values[row][column]`; null where there is no data. */
  values: (number | null)[][];
}

export type PivotCsvOptions = Omit<DataTableCsvOptions, 'columns' | 'rows' | 'header'>;

interface Leaf {
  readonly entry: PivotAxisEntry;
  readonly value: number;
  /** Ids of every header above the leaf (groups, member, value). */
  readonly headers: string;
}

const DENSITIES: readonly Density[] = ['compact', 'comfortable', 'spacious'];
const OVERSCAN = 6;
const MAX_WINDOW = 300;
const DEFAULT_ROW_HEIGHT = 40;

export class PivotGrid<Row = unknown> {
  readonly host: HTMLElement;
  readonly table: HTMLTableElement;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();
  readonly #region: HTMLDivElement;
  readonly #caption: HTMLTableCaptionElement;
  readonly #thead: HTMLTableSectionElement;
  readonly #tbody: HTMLTableSectionElement;
  readonly #store = new PivotStore();
  readonly #idBase = createId('aui-pivot');
  #options: PivotGridOptions<Row>;
  #fields = new Map<string, PivotField<Row>>();
  #source: PivotDataSource;
  #layout: PivotLayout;
  /** Expanded paths per axis (path key -> path). */
  #expanded: Record<PivotAxis, Map<string, PivotKey[]>> = { rows: new Map(), columns: new Map() };
  /** Automatic expansion depth until the first load finishes (layout without `expanded`). */
  #auto: number | null = null;
  #abort = new AbortController();
  #generation = 0;
  #pending = 0;
  #error: unknown = null;
  #rows: PivotAxisEntry[] = [];
  #leaves: Leaf[] = [];
  #rowIds = new Map<string, string>();
  #rowHeight: number | null = null;
  #scrollFrame = 0;
  #focusPath: string | null = null;
  #loadingPaths = new Set<string>();
  #ready: Promise<void> = Promise.resolve();

  static create<Row>(host: HTMLElement, options: PivotGridOptions<Row>): PivotGrid<Row> {
    return new PivotGrid(host, options);
  }

  private constructor(host: HTMLElement, options: PivotGridOptions<Row>) {
    PivotGrid.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#fields = new Map(options.fields.map((f) => [f.id, f]));
    this.#layout = normalizeLayout(options.layout, new Set(this.#fields.keys()));
    this.#source = this.#makeSource();
    const config = this.#config();
    const doc = this.#doc;
    this.#region = doc.createElement('div');
    this.#region.className = 'aui-pivot__region';
    this.#region.tabIndex = 0;
    this.#region.setAttribute('role', 'region');
    this.table = doc.createElement('table');
    this.table.className = 'aui-pivot__table';
    this.#caption = doc.createElement('caption');
    this.#caption.className = 'aui-pivot__caption';
    this.#caption.id = `${this.#idBase}-caption`;
    this.#region.setAttribute('aria-labelledby', this.#caption.id);
    this.#thead = doc.createElement('thead');
    this.#thead.className = 'aui-pivot__head';
    this.#tbody = doc.createElement('tbody');
    this.#tbody.className = 'aui-pivot__body';
    this.table.append(this.#caption, this.#thead, this.#tbody);
    this.#region.append(this.table);
    host.classList.add('aui-pivot');
    this.#applyHost(config);
    this.#resetExpansion();
    this.#render();
    host.append(this.#region);

    const g = this.#group;
    g.listen(this.#region, 'click', (e) => {
      this.#onClick(e);
    });
    g.listen(this.#region, 'focusin', (e) => {
      const th = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-aui-path]') : null;
      this.#focusPath = th?.dataset.auiPath ?? null;
    });
    g.listen(this.#region, 'scroll', () => {
      if (this.#options.virtual !== true || this.#scrollFrame) return;
      const view = doc.defaultView ?? window;
      this.#scrollFrame = view.requestAnimationFrame(() => {
        this.#scrollFrame = 0;
        if (this.#options.virtual === true) this.#renderBody();
      });
    });
    g.add(observeResize(this.#region, () => {
      if (this.#options.virtual === true) this.#renderBody();
    }));
    g.add(pivotGridConfig.subscribe(() => {
      this.#applyHost(this.#config());
      this.#render();
    }));
    g.add(() => {
      this.#abort.abort(new DOMException('The pivot grid was destroyed.', 'AbortError'));
      if (this.#scrollFrame) (doc.defaultView ?? window).cancelAnimationFrame(this.#scrollFrame);
    });
    this.#ready = this.#loadAll();
  }

  /** The current layout (a serializable copy, with explicit expansion). */
  get layout(): PivotLayout {
    const l = copyLayout(this.#layout);
    l.expanded = { rows: [...this.#expanded.rows.values()].map((p) => [...p]), columns: [...this.#expanded.columns.values()].map((p) => [...p]) };
    return l;
  }

  get fields(): readonly PivotField<Row>[] {
    return this.#options.fields;
  }

  /** True while a data source request is running. */
  get loading(): boolean {
    return this.#pending > 0;
  }

  /** Resolves when the current loads finished (successfully or not). */
  get ready(): Promise<void> {
    return this.#ready;
  }

  update(options: Partial<PivotGridOptions<Row>>): void {
    const next = { ...this.#options, ...options };
    if (options.data !== undefined && options.dataSource === undefined) delete next.dataSource;
    if (options.dataSource !== undefined && options.data === undefined) delete next.data;
    PivotGrid.#assert(next);
    const fieldIds = new Set(next.fields.map((f) => f.id));
    const layout = options.layout !== undefined || options.fields !== undefined ? normalizeLayout(next.layout, fieldIds) : this.#layout;
    this.#options = next;
    this.#fields = new Map(next.fields.map((f) => [f.id, f]));
    this.#applyHost(this.#config());
    const reload = options.data !== undefined || options.dataSource !== undefined || options.fields !== undefined || options.layout !== undefined || options.expandDepth !== undefined;
    if (options.data !== undefined || options.dataSource !== undefined || options.fields !== undefined) this.#source = this.#makeSource();
    if (options.layout !== undefined || options.fields !== undefined) {
      this.#layout = layout;
      this.#resetExpansion();
    }
    if (reload) this.#ready = this.#loadAll();
    else this.#render();
  }

  /** Replace the layout (validated). Emits `aui-layout-change` with reason `layout`. */
  setLayout(layout: PivotLayoutInput): void {
    const next = normalizeLayout(layout, new Set(this.#fields.keys()));
    const prev = this.#layout;
    const structural = JSON.stringify([prev.rows, prev.columns, prev.values]) !== JSON.stringify([next.rows, next.columns, next.values]);
    const filterOnly = !structural && JSON.stringify(prev.include) !== JSON.stringify(next.include);
    this.#layout = next;
    if (structural || next.expanded !== null) this.#resetExpansion();
    this.#ready = this.#loadAll();
    this.#emitChange(filterOnly ? 'filter' : 'layout');
  }

  /** Set the included members of a field (null includes every member). Emits reason `filter`. */
  setFilter(field: string, include: readonly PivotKey[] | null): void {
    if (!this.#fields.has(field)) fail('setFilter.field', 'a field id');
    const next = copyLayout(this.#layout);
    next.include = include === null ? omit(next.include, field) : { ...next.include, [field]: [...include] };
    this.#layout = normalizeLayout(next, new Set(this.#fields.keys()));
    this.#ready = this.#loadAll();
    this.#emitChange('filter');
  }

  /** Sort rows or columns (null restores ascending member order). Emits reason `sort`. */
  sort(axis: PivotAxis, sort: PivotSort | null): void {
    const next = copyLayout(this.#layout);
    next.sort[axis] = sort;
    this.#layout = normalizeLayout(next, new Set(this.#fields.keys()));
    this.#render();
    this.#emitChange('sort');
  }

  /** Expand or collapse a group; children load on first expansion. Emits `expand` or `collapse`. */
  async setExpanded(axis: PivotAxis, path: PivotPath, expanded: boolean): Promise<void> {
    const depth = this.#layout[axis].length;
    if (path.length === 0 || path.length >= depth) return;
    const key = pathKey(path);
    if (expanded === this.#expanded[axis].has(key)) return;
    if (!expanded) {
      this.#expanded[axis].delete(key);
      this.#render();
      this.#emitChange('collapse');
      return;
    }
    this.#expanded[axis].set(key, [...path]);
    if (this.#store.loaded(axis, path)) {
      this.#render();
      this.#emitChange('expand');
      return;
    }
    this.#loadingPaths.add(key);
    this.#render();
    const generation = this.#generation;
    const ok = await this.#fetch(axis === 'rows' ? [[...path]] : this.#store.parents('rows'), axis === 'columns' ? [[...path]] : this.#store.parents('columns'));
    if (generation !== this.#generation) return;
    this.#loadingPaths.delete(key);
    if (!ok) {
      this.#expanded[axis].delete(key);
      announce(this.#msg('loadFailed'), 'assertive');
    }
    this.#render();
    if (ok) this.#emitChange('expand');
  }

  /** Expand or collapse every loaded group of an axis (collapsing needs no data). */
  async expandAll(axis: PivotAxis, expanded: boolean): Promise<void> {
    if (!expanded) {
      this.#expanded[axis].clear();
      this.#render();
      this.#emitChange('collapse');
      return;
    }
    const generation = this.#generation;
    for (;;) {
      const ctx = this.#axisContext(axis);
      const pending = pendingParents(ctx, this.#layout[axis].length);
      for (const p of this.#store.parents(axis)) if (p.length > 0 && p.length < this.#layout[axis].length) this.#expanded[axis].set(pathKey(p), p);
      if (pending.length === 0) break;
      for (const p of pending) this.#expanded[axis].set(pathKey(p), p);
      const ok = await this.#fetch(axis === 'rows' ? pending : this.#store.parents('rows'), axis === 'columns' ? pending : this.#store.parents('columns'));
      if (!ok || generation !== this.#generation) break;
    }
    this.#render();
    this.#emitChange('expand');
  }

  /** Members of a field for filter lists (paged, searchable), through the data source. */
  async members(field: string, options: { search?: string; offset?: number; limit?: number } = {}): Promise<PivotMembersResult & { labels: string[] }> {
    if (!this.#fields.has(field)) fail('members.field', 'a field id');
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    if (!(Number.isInteger(offset) && offset >= 0)) fail('members.offset', 'non-negative integer');
    if (!(Number.isInteger(limit) && limit >= 1 && limit <= 10_000)) fail('members.limit', 'integer from 1 to 10000');
    const include = omit(this.#layout.include, field);
    try {
      const result = await this.#withTimeout((signal) => this.#source.members({ field, include, search: options.search ?? '', offset, limit }, signal));
      assertMembersResult(result);
      return { ...result, labels: result.members.map((m) => m.label ?? this.memberLabel(field, m.key)) };
    } catch (error) {
      const detail: PivotGridLoadErrorDetail = { error, request: 'members' };
      emit(this.host, 'aui-load-error', detail);
      throw error;
    }
  }

  /** Display label of a member key. */
  memberLabel(field: string, key: PivotKey): string {
    const f = this.#fields.get(field);
    const custom = f?.formatMember?.(key);
    if (custom !== undefined) return custom;
    if (key === null) return this.#msg('blank');
    if (typeof key === 'number') return formatNumber(key, { useGrouping: false, maximumFractionDigits: 20 }, this.#config().locale);
    return memberText(key);
  }

  /** Header text of a value field ("Sum of Sales"). */
  valueLabel(index: number): string {
    const v = this.#layout.values[index];
    if (!v) return '';
    return this.#msg(v.aggregate, { field: this.#fields.get(v.field)?.label ?? v.field });
  }

  /** Reload everything from the data source (keeps the expansion). */
  reload(): Promise<void> {
    this.#ready = this.#loadAll();
    return this.#ready;
  }

  /** The visible pivot (rows, columns split by value, values) as plain data. */
  toMatrix(): PivotMatrix {
    const rows: PivotMatrixHeader[] = this.#rows.map((r) => ({ path: [...r.path], labels: this.#labels('rows', r.path), kind: r.kind }));
    const columns: PivotMatrixColumn[] = this.#leaves.map((l) => ({ path: [...l.entry.path], labels: this.#labels('columns', l.entry.path), kind: l.entry.kind, value: l.value, valueLabel: this.valueLabel(l.value) }));
    const values = this.#rows.map((r) => this.#leaves.map((l) => this.#store.value(r.path, l.entry.path, l.value)));
    return { rows, columns, values };
  }

  /**
   * CSV of the visible pivot: one column per row field (member labels), then one per
   * visible value column (headers joined with " / "). Formula injection is escaped.
   */
  toCsv(options: PivotCsvOptions & { values?: 'formatted' | 'raw' } = {}): string {
    assertCsvOptions(options);
    const matrix = this.toMatrix();
    const rowFields = this.#layout.rows.map((id) => this.#fields.get(id)?.label ?? id);
    const rowHeads = rowFields.length === 0 ? [this.#msg('rows')] : rowFields;
    const header = [...rowHeads, ...matrix.columns.map((c) => [...this.#columnLabels(c), c.valueLabel].join(' / '))];
    const raw = options.values === 'raw';
    const body = matrix.rows.map((r, i): CsvValue[] => {
      const heads = rowHeads.map((_, level): CsvValue => {
        if (r.kind === 'total') return { text: level === 0 ? this.#msg('grandTotal') : '', trusted: false };
        return { text: r.labels[level] ?? '', trusted: false };
      });
      const cells = matrix.columns.map((c, j): CsvValue => {
        const v = matrix.values[i]?.[j] ?? null;
        if (v === null) return { text: '', trusted: true };
        return { text: raw ? String(v) : this.#format(v, c.value), trusted: true };
      });
      return [...heads, ...cells];
    });
    return toCsvText(header, body, options);
  }

  destroy(): void {
    this.#group.dispose();
    this.#region.remove();
    this.host.classList.remove('aui-pivot', ...DENSITIES.map((d) => `aui-pivot--${d}`), 'aui-pivot--sticky', 'aui-pivot--virtual');
  }

  static #assert<R>(o: PivotGridOptions<R>): void {
    if (!validators.isRecord(o)) fail('options', 'PivotGridOptions');
    if (typeof o.caption !== 'string' || o.caption.trim() === '') fail('caption', 'non-empty string');
    assertFields(o.fields);
    const hasData = o.data !== undefined;
    const hasSource = o.dataSource !== undefined;
    if (hasData === hasSource) fail('data', 'exactly one of data (Row[]) or dataSource (PivotDataSource)');
    if (hasData && !Array.isArray(o.data)) fail('data', 'Row[]');
    if (hasSource && !(validators.isRecord(o.dataSource) && typeof o.dataSource.query === 'function' && typeof o.dataSource.members === 'function')) fail('dataSource', 'PivotDataSource { query, members }');
    if (o.hideCaption !== undefined && typeof o.hideCaption !== 'boolean') fail('hideCaption', 'boolean');
    if (o.virtual !== undefined && typeof o.virtual !== 'boolean') fail('virtual', 'boolean');
    if (o.rowHeight !== undefined && !(Number.isInteger(o.rowHeight) && o.rowHeight >= 16 && o.rowHeight <= 200)) fail('rowHeight', 'integer from 16 to 200 (CSS px)');
    if (o.emptyMessage !== undefined && typeof o.emptyMessage !== 'string') fail('emptyMessage', 'string');
    normalizeLayout(o.layout, new Set(o.fields.map((f) => f.id)));
  }

  #makeSource(): PivotDataSource {
    const o = this.#options;
    if (o.dataSource) return o.dataSource;
    return createLocalPivotSource(o.data ?? [], o.fields, { locale: this.#config().locale });
  }

  #config(): Resolved {
    const o = this.#options;
    const input: Partial<PivotGridConfig & { locale: string; density: Density; direction: Direction }> = {};
    if (o.grandTotals !== undefined) input.grandTotals = o.grandTotals;
    if (o.columnSubtotals !== undefined) input.columnSubtotals = o.columnSubtotals;
    if (o.expandDepth !== undefined) input.expandDepth = o.expandDepth;
    if (o.requestTimeoutMs !== undefined) input.requestTimeoutMs = o.requestTimeoutMs;
    if (o.stickyHeader !== undefined) input.stickyHeader = o.stickyHeader;
    if (o.locale !== undefined) input.locale = o.locale;
    if (o.density !== undefined) input.density = o.density;
    if (o.direction !== undefined) input.direction = o.direction;
    return pivotGridConfig.resolve(input);
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('pivotGrid', key, params, this.#config().locale);
  }

  #applyHost(c: Resolved): void {
    const host = this.host;
    for (const d of DENSITIES) host.classList.toggle(`aui-pivot--${d}`, c.density === d);
    host.classList.toggle('aui-pivot--sticky', c.stickyHeader);
    host.classList.toggle('aui-pivot--virtual', this.#options.virtual === true);
    this.#caption.textContent = this.#options.caption;
    this.#caption.classList.toggle('aui-pivot__caption--hidden', this.#options.hideCaption === true);
  }

  #resetExpansion(): void {
    const e = this.#layout.expanded;
    this.#expanded = { rows: new Map(), columns: new Map() };
    if (e) {
      for (const p of e.rows) this.#expanded.rows.set(pathKey(p), [...p]);
      for (const p of e.columns) this.#expanded.columns.set(pathKey(p), [...p]);
      this.#auto = null;
    } else {
      this.#auto = this.#config().expandDepth;
    }
    this.#layout.expanded = null;
  }

  #axisContext(axis: PivotAxis): AxisContext {
    return { axis, store: this.#store, depth: this.#layout[axis].length, expanded: new Set(this.#expanded[axis].keys()), sort: this.#layout.sort[axis], locale: this.#config().locale };
  }

  #emitChange(reason: PivotGridLayoutChangeReason): void {
    const detail: PivotGridLayoutChangeDetail = { reason, layout: this.layout };
    emit(this.host, 'aui-layout-change', detail);
  }

  async #withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const outer = this.#abort.signal;
    const controller = new AbortController();
    const view = this.#doc.defaultView ?? window;
    const onAbort = (): void => {
      controller.abort(outer.reason);
    };
    outer.addEventListener('abort', onAbort, { once: true });
    const timer = view.setTimeout(() => {
      controller.abort(new DOMException('The pivot request timed out.', 'TimeoutError'));
    }, this.#config().requestTimeoutMs);
    try {
      return await Promise.race([
        run(controller.signal),
        new Promise<never>((_, reject) => {
          if (controller.signal.aborted) reject(controller.signal.reason instanceof Error ? controller.signal.reason : new Error('aborted'));
          controller.signal.addEventListener('abort', () => {
            reject(controller.signal.reason instanceof Error ? controller.signal.reason : new Error('aborted'));
          }, { once: true });
        }),
      ]);
    } finally {
      view.clearTimeout(timer);
      outer.removeEventListener('abort', onAbort);
    }
  }

  /** Query cells for the given parents and merge them; false on failure (reported). */
  async #fetch(rowParents: PivotKey[][], columnParents: PivotKey[][]): Promise<boolean> {
    const l = this.#layout;
    const query: PivotQuery = { rows: [...l.rows], columns: [...l.columns], values: l.values.map((v) => ({ ...v })), include: copyLayout(l).include, rowParents, columnParents };
    const generation = this.#generation;
    this.#pending++;
    this.#syncBusy();
    try {
      const result = await this.#withTimeout((signal) => this.#source.query(query, signal));
      if (generation !== this.#generation) return false;
      assertQueryResult(result, l.values.length);
      this.#store.ingest(result.cells, rowParents, columnParents);
      return true;
    } catch (error) {
      if (generation !== this.#generation) return false;
      this.#error = error;
      const detail: PivotGridLoadErrorDetail = { error, request: 'query' };
      emit(this.host, 'aui-load-error', detail);
      return false;
    } finally {
      this.#pending--;
      this.#syncBusy();
    }
  }

  /** Discard loaded data and load the root plus every expanded (or auto-expanded) level. */
  async #loadAll(): Promise<void> {
    this.#abort.abort(new DOMException('Superseded by a newer pivot request.', 'AbortError'));
    this.#abort = new AbortController();
    const generation = ++this.#generation;
    this.#store.clear();
    this.#error = null;
    this.#loadingPaths.clear();
    this.#render();
    if (!(await this.#fetch([[]], [[]]))) {
      if (generation === this.#generation) this.#render();
      return;
    }
    for (;;) {
      if (generation !== this.#generation) return;
      const rows = pendingParents(this.#axisContext('rows'), this.#auto);
      const columns = pendingParents(this.#axisContext('columns'), this.#auto);
      if (this.#auto !== null) {
        for (const p of [...rows]) this.#expanded.rows.set(pathKey(p), p);
        for (const p of [...columns]) this.#expanded.columns.set(pathKey(p), p);
      }
      if (rows.length === 0 && columns.length === 0) break;
      let ok = true;
      if (rows.length > 0) ok = await this.#fetch(rows, this.#store.parents('columns'));
      if (ok && columns.length > 0) ok = await this.#fetch(this.#store.parents('rows'), columns);
      if (!ok) break;
    }
    if (generation !== this.#generation) return;
    this.#auto = null;
    // Drop expansion of paths that no longer exist (filters removed them).
    for (const axis of ['rows', 'columns'] as const) {
      for (const [key, path] of this.#expanded[axis]) {
        const parent = path.slice(0, -1);
        if (this.#store.loaded(axis, parent) && !(this.#store.children(axis, parent) ?? []).some((c) => pathKey(c) === key)) this.#expanded[axis].delete(key);
      }
    }
    this.#render();
  }

  #syncBusy(): void {
    if (this.#pending > 0) this.table.setAttribute('aria-busy', 'true');
    else this.table.removeAttribute('aria-busy');
  }

  #labels(axis: PivotAxis, path: PivotPath): string[] {
    const fields = this.#layout[axis];
    return path.map((key, i) => this.memberLabel(fields[i] ?? '', key));
  }

  #columnLabels(c: PivotMatrixColumn): string[] {
    if (c.kind === 'total') return this.#layout.columns.length === 0 ? [] : [this.#msg('grandTotal')];
    if (c.kind === 'subtotal') {
      const labels = [...c.labels];
      const last = labels.pop() ?? '';
      return [...labels, this.#msg('total', { label: last })];
    }
    return c.labels;
  }

  #format(value: number, index: number): string {
    const v = this.#layout.values[index];
    const locale = this.#config().locale;
    if (!v) return String(value);
    if (v.aggregate === 'count' || v.aggregate === 'distinctCount') return formatNumber(value, { maximumFractionDigits: 0 }, locale);
    const f = this.#fields.get(v.field);
    return formatNumber(value, f?.numberFormat ?? { maximumFractionDigits: 2 }, locale);
  }

  #rowId(path: PivotPath): string {
    const key = pathKey(path);
    let id = this.#rowIds.get(key);
    if (!id) {
      id = `${this.#idBase}-r${String(this.#rowIds.size)}`;
      this.#rowIds.set(key, id);
    }
    return id;
  }

  #render(): void {
    const c = this.#config();
    const rowsCtx = this.#axisContext('rows');
    const colsCtx = this.#axisContext('columns');
    const loaded = this.#store.loaded('rows', []);
    this.#rows = loaded ? rowEntries(rowsCtx, c.grandTotals === 'both' || c.grandTotals === 'rows') : [];
    const tree = columnTree(colsCtx, c.columnSubtotals, c.grandTotals === 'both' || c.grandTotals === 'columns' || this.#layout.columns.length === 0);
    this.#renderHead(tree.nodes);
    this.#renderBody();
  }

  #th(scope: string, className: string): HTMLTableCellElement {
    const th = this.#doc.createElement('th');
    th.scope = scope;
    th.className = className;
    return th;
  }

  #toggle(axis: PivotAxis, entry: { path: PivotKey[]; expanded: boolean }, label: string): HTMLButtonElement {
    const b = this.#doc.createElement('button');
    b.type = 'button';
    b.className = 'aui-pivot__toggle';
    b.dataset.auiAxis = axis;
    b.setAttribute('aria-expanded', String(entry.expanded));
    const rtl = this.#config().direction === 'rtl';
    b.append(renderIcon(entry.expanded ? 'chevron-down' : rtl ? 'chevron-left' : 'chevron-right', { className: 'aui-pivot__toggle-icon', doc: this.#doc }));
    const text = this.#doc.createElement('span');
    text.textContent = label;
    b.append(text);
    if (this.#loadingPaths.has(pathKey(entry.path))) b.setAttribute('aria-busy', 'true');
    return b;
  }

  #renderHead(nodes: readonly PivotColumnNode[]): void {
    const doc = this.#doc;
    const l = this.#layout;
    const D = l.columns.length;
    const V = l.values.length;
    const H = D + 1;
    const rows: HTMLTableRowElement[] = [];
    for (let i = 0; i < H; i++) {
      const tr = doc.createElement('tr');
      tr.className = 'aui-pivot__head-row';
      rows.push(tr);
    }
    // Corner: the row fields (sort by member label).
    const corner = this.#th('col', 'aui-pivot__corner');
    corner.id = `${this.#idBase}-corner`;
    corner.rowSpan = H;
    const rowLabel = l.rows.length === 0 ? this.#msg('rows') : l.rows.map((id) => this.#fields.get(id)?.label ?? id).join(' / ');
    const rowSort = l.sort.rows;
    if (l.rows.length > 0) {
      corner.append(this.#sortButton(rowLabel, rowSort?.by === 'label' ? rowSort.direction : rowSort === null ? 'ascending' : null, 'label'));
      corner.setAttribute('aria-sort', rowSort?.by === 'label' ? rowSort.direction : rowSort === null ? 'ascending' : 'none');
    } else {
      corner.textContent = rowLabel;
    }
    rows[0]?.append(corner);
    const leaves: Leaf[] = [];
    const span = Math.max(1, V);
    const valueRow = rows[D];
    const addLeaf = (entry: PivotAxisEntry, ids: readonly string[]): void => {
      for (let v = 0; v < V; v++) {
        const th = this.#th('col', 'aui-pivot__value-header');
        th.id = `${this.#idBase}-c${String(leaves.length)}`;
        if (entry.kind !== 'member') th.classList.add('aui-pivot__value-header--total');
        const sort = l.sort.rows;
        const active = sort?.by === 'value' && sort.value === v && pathKey(sort.column ?? []) === pathKey(entry.path);
        th.append(this.#sortButton(this.valueLabel(v), active ? sort.direction : null, 'value', v, entry.path));
        if (active) th.setAttribute('aria-sort', sort.direction);
        valueRow?.append(th);
        leaves.push({ entry, value: v, headers: [...ids, th.id].join(' ') });
      }
    };
    let n = 0;
    const visit = (node: PivotColumnNode, ids: readonly string[]): void => {
      const depth = node.kind === 'total' ? 0 : node.path.length - 1;
      const tr = rows[depth];
      if (!tr) return;
      const id = `${this.#idBase}-h${String(n++)}`;
      if (node.kind === 'total') {
        if (D === 0) {
          addLeaf({ path: [], kind: 'total', expandable: false, expanded: false }, ids);
          return;
        }
        const th = this.#th('col', 'aui-pivot__col-header aui-pivot__col-header--total');
        th.id = id;
        th.rowSpan = D;
        th.colSpan = span;
        th.textContent = this.#msg('grandTotal');
        tr.append(th);
        addLeaf({ path: [], kind: 'total', expandable: false, expanded: false }, [...ids, id]);
        return;
      }
      const label = this.memberLabel(l.columns[depth] ?? '', node.path[depth] ?? null);
      if (node.kind === 'subtotal') {
        const th = this.#th('col', 'aui-pivot__col-header aui-pivot__col-header--total');
        th.id = id;
        th.rowSpan = D - depth;
        th.colSpan = span;
        th.textContent = this.#msg('total', { label });
        tr.append(th);
        addLeaf({ path: node.path, kind: 'subtotal', expandable: false, expanded: false }, [...ids, id]);
        return;
      }
      const th = this.#th(node.expanded ? 'colgroup' : 'col', 'aui-pivot__col-header');
      th.id = id;
      th.dataset.auiPath = pathKey(node.path);
      th.colSpan = node.span * span;
      if (!node.expanded) th.rowSpan = D - depth;
      if (node.expandable) th.append(this.#toggle('columns', node, label));
      else th.textContent = label;
      tr.append(th);
      if (node.expanded) for (const child of node.children) visit(child, [...ids, id]);
      else addLeaf({ path: node.path, kind: 'member', expandable: node.expandable, expanded: false }, [...ids, id]);
    };
    for (const node of nodes) visit(node, []);
    this.#leaves = leaves;
    this.#thead.replaceChildren(...rows);
  }

  #sortButton(label: string, direction: 'ascending' | 'descending' | null, by: 'label' | 'value', value = 0, column: PivotPath = []): HTMLButtonElement {
    const b = this.#doc.createElement('button');
    b.type = 'button';
    b.className = 'aui-pivot__sort';
    b.dataset.auiSort = by;
    b.dataset.auiValue = String(value);
    b.dataset.auiColumn = pathKey(column);
    const text = this.#doc.createElement('span');
    text.className = 'aui-pivot__sort-label';
    text.textContent = label;
    b.append(text, renderIcon(direction === 'ascending' ? 'arrow-up' : direction === 'descending' ? 'arrow-down' : 'arrow-up-down', { className: 'aui-pivot__sort-icon', doc: this.#doc }));
    return b;
  }

  #renderBody(): void {
    const doc = this.#doc;
    const l = this.#layout;
    const columns = 1 + this.#leaves.length;
    if (this.#error !== null && !this.#store.loaded('rows', [])) {
      this.#tbody.replaceChildren(this.#statusRow(columns, this.#msg('loadFailed'), true));
      return;
    }
    if (!this.#store.loaded('rows', [])) {
      this.#tbody.replaceChildren(this.#statusRow(columns, this.#msg('loading'), false));
      return;
    }
    if (l.values.length === 0) {
      this.#tbody.replaceChildren(this.#statusRow(columns, this.#msg('noValues'), false));
      return;
    }
    const hasData = this.#store.has([], []);
    if (!hasData) {
      this.#tbody.replaceChildren(this.#statusRow(columns, this.#options.emptyMessage ?? this.#msg('empty'), false));
      return;
    }
    const rows = this.#rows;
    if (this.#options.virtual !== true) {
      this.#tbody.replaceChildren(...rows.map((r) => this.#row(r)));
      this.table.removeAttribute('aria-rowcount');
      return;
    }
    // Virtual window over the visible rows.
    const region = this.#region;
    const height = this.#rowHeight ?? this.#options.rowHeight ?? DEFAULT_ROW_HEIGHT;
    const viewport = region.clientHeight > 0 ? region.clientHeight : height * 20;
    // Measured from the body: the sticky head stays put while the region scrolls (regression).
    const bodyTop = this.#tbody.getBoundingClientRect().top - region.getBoundingClientRect().top - region.clientTop + region.scrollTop;
    const top = Math.max(0, region.scrollTop - bodyTop);
    const n = rows.length;
    const start = Math.min(n, Math.max(0, Math.floor(top / height) - OVERSCAN));
    const end = Math.min(n, start + MAX_WINDOW, Math.ceil((top + viewport) / height) + OVERSCAN);
    const indexes: number[] = [];
    const focus = this.#focusPath === null ? -1 : rows.findIndex((r) => pathKey(r.path) === this.#focusPath && r.kind === 'member');
    if (focus !== -1 && focus < start) indexes.push(focus);
    for (let i = start; i < end; i++) indexes.push(i);
    if (focus !== -1 && focus >= end) indexes.push(focus);
    const out: HTMLTableRowElement[] = [];
    const headRows = l.columns.length + 1;
    let last = -1;
    for (const i of indexes) {
      const entry = rows[i];
      if (!entry) continue;
      if (i - last > 1) out.push(this.#spacer(i - last - 1, columns, height));
      const tr = this.#row(entry);
      tr.setAttribute('aria-rowindex', String(headRows + i + 1));
      out.push(tr);
      last = i;
    }
    if (n - last > 1) out.push(this.#spacer(n - last - 1, columns, height));
    const active = doc.activeElement;
    this.#tbody.replaceChildren(...out);
    this.table.setAttribute('aria-rowcount', String(headRows + n));
    this.#thead.querySelectorAll('tr').forEach((tr, i) => {
      tr.setAttribute('aria-rowindex', String(i + 1));
    });
    this.#restoreFocus(active);
    const first = out.find((tr) => !tr.classList.contains('aui-pivot__spacer'));
    if (first && this.#rowHeight === null && region.clientHeight > 0) {
      const measured = first.getBoundingClientRect().height;
      if (measured > 0) {
        this.#rowHeight = measured;
        if (Math.abs(measured - height) > 0.5) this.#renderBody();
      }
    }
  }

  #restoreFocus(active: Element | null): void {
    if (!(active instanceof HTMLElement) || active.isConnected || this.#focusPath === null) return;
    const th = [...this.#tbody.querySelectorAll<HTMLElement>('[data-aui-path]')].find((el) => el.dataset.auiPath === this.#focusPath);
    th?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }

  #spacer(rows: number, columns: number, height: number): HTMLTableRowElement {
    const tr = this.#doc.createElement('tr');
    tr.className = 'aui-pivot__spacer';
    tr.setAttribute('aria-hidden', 'true');
    const td = this.#doc.createElement('td');
    td.colSpan = columns;
    td.style.setProperty('block-size', `${String(rows * height)}px`);
    tr.append(td);
    return tr;
  }

  #statusRow(columns: number, text: string, retry: boolean): HTMLTableRowElement {
    const doc = this.#doc;
    const tr = doc.createElement('tr');
    tr.className = 'aui-pivot__status-row';
    const td = doc.createElement('td');
    td.className = 'aui-pivot__status';
    td.colSpan = columns;
    const span = doc.createElement('span');
    span.textContent = text;
    td.append(span);
    if (retry) {
      td.classList.add('aui-pivot__status--error');
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-pivot__retry';
      b.dataset.auiRetry = '';
      b.textContent = this.#msg('retry');
      td.append(b);
    }
    tr.append(td);
    return tr;
  }

  #row(entry: PivotAxisEntry): HTMLTableRowElement {
    const doc = this.#doc;
    const tr = doc.createElement('tr');
    tr.className = 'aui-pivot__row';
    const th = doc.createElement('th');
    th.scope = 'row';
    th.className = 'aui-pivot__row-header';
    th.id = this.#rowId(entry.path);
    const level = entry.kind === 'total' ? 0 : entry.path.length - 1;
    th.style.setProperty('--aui-pivot-level', String(level));
    if (entry.kind === 'total') {
      tr.classList.add('aui-pivot__row--total');
      th.textContent = this.#msg('grandTotal');
    } else {
      th.dataset.auiPath = pathKey(entry.path);
      const labels = this.#labels('rows', entry.path);
      const own = labels[labels.length - 1] ?? '';
      if (labels.length > 1) {
        // The group path is read with the row header, even when its row is scrolled away.
        const hidden = doc.createElement('span');
        hidden.className = 'aui-pivot__path';
        hidden.textContent = labels.slice(0, -1).join(this.#msg('pathSeparator')) + this.#msg('pathSeparator');
        th.append(hidden);
      }
      if (entry.expandable) th.append(this.#toggle('rows', entry, own));
      else {
        const text = doc.createElement('span');
        text.className = 'aui-pivot__leaf-label';
        text.textContent = own;
        th.append(text);
      }
      if (entry.expanded) tr.classList.add('aui-pivot__row--group');
    }
    tr.append(th);
    for (const leaf of this.#leaves) {
      const td = doc.createElement('td');
      td.className = 'aui-pivot__cell';
      if (leaf.entry.kind !== 'member') td.classList.add('aui-pivot__cell--total');
      td.setAttribute('headers', `${leaf.headers} ${th.id}`);
      const v = this.#store.value(entry.path, leaf.entry.path, leaf.value);
      td.textContent = v === null ? '' : this.#format(v, leaf.value);
      tr.append(td);
    }
    return tr;
  }

  #onClick(e: Event): void {
    const target = e.target instanceof Element ? e.target : null;
    const button = target?.closest<HTMLButtonElement>('button');
    if (!button || !this.#region.contains(button)) return;
    if (button.dataset.auiRetry !== undefined) {
      void this.reload();
      return;
    }
    if (button.classList.contains('aui-pivot__toggle')) {
      const axis = button.dataset.auiAxis === 'columns' ? 'columns' : 'rows';
      const cell = button.closest<HTMLElement>('[data-aui-path]');
      const key = cell?.dataset.auiPath;
      if (key === undefined) return;
      const path = JSON.parse(key) as PivotKey[];
      this.#focusPath = axis === 'rows' ? key : null;
      const refocus = axis === 'columns' ? key : null;
      void this.setExpanded(axis, path, button.getAttribute('aria-expanded') !== 'true').then(() => {
        if (refocus !== null) this.#focusToggle(this.#thead, refocus);
        else this.#focusToggle(this.#tbody, key);
      });
      if (refocus !== null) this.#focusToggle(this.#thead, refocus);
      else this.#focusToggle(this.#tbody, key);
      return;
    }
    if (button.classList.contains('aui-pivot__sort')) {
      const by = button.dataset.auiSort;
      const current = this.#layout.sort.rows;
      let next: PivotSort | null;
      let label: string;
      if (by === 'label') {
        const dir = current === null || (current.by === 'label' && current.direction === 'ascending') ? 'descending' : 'ascending';
        next = dir === 'ascending' ? null : { by: 'label', direction: 'descending' };
        label = this.#layout.rows.map((id) => this.#fields.get(id)?.label ?? id).join(' / ');
        announce(this.#msg(dir === 'ascending' ? 'sortedAscending' : 'sortedDescending', { column: label }));
      } else {
        const value = Number(button.dataset.auiValue ?? '0');
        const column = JSON.parse(button.dataset.auiColumn ?? '[]') as PivotKey[];
        const same = current?.by === 'value' && current.value === value && pathKey(current.column ?? []) === pathKey(column);
        // Values sort descending first (largest on top), then ascending, then off.
        const dir = !same ? 'descending' : current.direction === 'descending' ? 'ascending' : null;
        next = dir === null ? null : { by: 'value', value, column, direction: dir };
        label = this.valueLabel(value);
        announce(dir === null ? this.#msg('sortCleared') : this.#msg(dir === 'ascending' ? 'sortedAscending' : 'sortedDescending', { column: label }));
      }
      const selector = by === 'label' ? '.aui-pivot__corner .aui-pivot__sort' : null;
      const index = [...this.#thead.querySelectorAll('.aui-pivot__sort')].indexOf(button);
      this.sort('rows', next);
      const again = selector ? this.#thead.querySelector<HTMLElement>(selector) : this.#thead.querySelectorAll<HTMLElement>('.aui-pivot__sort')[index];
      again?.focus({ preventScroll: true });
    }
  }

  #focusToggle(section: HTMLElement, key: string): void {
    const cell = [...section.querySelectorAll<HTMLElement>('[data-aui-path]')].find((el) => el.dataset.auiPath === key);
    cell?.querySelector<HTMLElement>('.aui-pivot__toggle')?.focus({ preventScroll: true });
  }
}

/** Aggregates in menus and field lists, in display order. */
export const PIVOT_AGGREGATES: readonly PivotAggregate[] = ['sum', 'count', 'average', 'min', 'max', 'distinctCount'];

export function assertPivotGrid(grid: unknown): asserts grid is PivotGrid {
  if (!(grid instanceof PivotGrid)) throw configurationError('PIVOT_FIELD_LIST_OPTIONS', 'Invalid pivot field list options.', { component: 'pivotFieldList', property: 'pivotFieldList.grid', expected: 'PivotGrid' });
}
