/**
 * Pivot types, layout validation, and path helpers shared by the engine, the
 * local data source, the grid, and the field list. Everything here is pure.
 */
import { configurationError, validators } from '@absoluteui/core';

/** A member key: the grouping value of a row or column field for one record. */
export type PivotKey = string | number | boolean | null;
/** A path of member keys from the top level down; `[]` is the grand total. */
export type PivotPath = readonly PivotKey[];

export type PivotAggregate = 'sum' | 'count' | 'average' | 'min' | 'max' | 'distinctCount';
export type PivotArea = 'rows' | 'columns' | 'values' | 'filters';
export type PivotSortDirection = 'ascending' | 'descending';

export interface PivotField<Row> {
  /** Unique id; also the default property read from each row. */
  id: string;
  /** Visible name. */
  label: string;
  /**
   * Grouping or aggregation value of a row. Default `row[id]`. Grouping keys must be
   * strings, numbers, booleans, or null; other values are converted with `String()`.
   * Derive date parts here (for example `'2026-09'` for months).
   */
  value?: (row: Row) => unknown;
  /** Label of a member key (row and column headers, filter lists). Default: the key as text. */
  formatMember?: (key: PivotKey) => string;
  /** Number format of aggregated values of this field. Default: grouping, at most 2 fraction digits. */
  numberFormat?: Intl.NumberFormatOptions;
  /** Areas the field may be placed in (field list). Default: all. */
  areas?: readonly PivotArea[];
  /** Aggregate used when the field is added to values. Default `sum`. */
  aggregate?: PivotAggregate;
}

export interface PivotValue {
  field: string;
  aggregate: PivotAggregate;
}

export interface PivotLabelSort {
  by: 'label';
  direction: PivotSortDirection;
}

export interface PivotValueSort {
  by: 'value';
  /** Index into `layout.values`. */
  value: number;
  /** Rows: the column path compared (default `[]`, the grand total column). Ignored for columns. */
  column?: PivotPath;
  direction: PivotSortDirection;
}

export type PivotSort = PivotLabelSort | PivotValueSort;

/** Serializable pivot configuration (JSON-safe). */
export interface PivotLayout {
  rows: string[];
  columns: string[];
  values: PivotValue[];
  /** Fields shown in the filter area (their selections live in `include`). */
  filters: string[];
  /** Included members by field id; a missing field includes every member. Applies to any field. */
  include: Record<string, PivotKey[]>;
  sort: { rows: PivotSort | null; columns: PivotSort | null };
  /** Expanded group paths per axis; null derives them from `expandDepth`. */
  expanded: { rows: PivotKey[][]; columns: PivotKey[][] } | null;
}

/** Layout input: every property except `rows`, `columns`, and `values` is optional. */
export interface PivotLayoutInput {
  rows: readonly string[];
  columns: readonly string[];
  values: readonly PivotValue[];
  filters?: readonly string[];
  include?: Readonly<Record<string, readonly PivotKey[]>>;
  sort?: { rows?: PivotSort | null; columns?: PivotSort | null };
  expanded?: { rows: readonly PivotPath[]; columns: readonly PivotPath[] } | null;
}

/** One aggregated cell: the values of `layout.values` (in order) for a row path and a column path. */
export interface PivotCell {
  readonly row: PivotPath;
  readonly column: PivotPath;
  readonly values: readonly (number | null)[];
}

/**
 * A query for aggregated cells. The answer holds one cell for every combination of
 * a requested row path and a requested column path that has records, where the
 * requested row paths are every path in `rowParents` plus their children (one
 * level deeper), and likewise for columns. `[]` in a parent list means the top
 * level (and the grand total).
 */
export interface PivotQuery {
  readonly rows: readonly string[];
  readonly columns: readonly string[];
  readonly values: readonly PivotValue[];
  readonly include: Readonly<Record<string, readonly PivotKey[]>>;
  readonly rowParents: readonly PivotPath[];
  readonly columnParents: readonly PivotPath[];
}

export interface PivotQueryResult {
  readonly cells: readonly PivotCell[];
}

export interface PivotMembersRequest {
  readonly field: string;
  /** Filters of the other fields (the field's own selection is not applied). */
  readonly include: Readonly<Record<string, readonly PivotKey[]>>;
  /** Case-insensitive text the member label must contain; '' for all. */
  readonly search: string;
  readonly offset: number;
  readonly limit: number;
}

export interface PivotMember {
  readonly key: PivotKey;
  /** Label; the field's `formatMember` (or the key as text) when omitted. */
  readonly label?: string;
}

export interface PivotMembersResult {
  readonly members: readonly PivotMember[];
  /** Number of matching members across all pages. */
  readonly total: number;
}

/**
 * Where aggregated data comes from: the local source (`createLocalPivotSource`)
 * or an application server. Honour `signal`: a newer request or `destroy()` aborts
 * older ones.
 */
export interface PivotDataSource {
  query(query: PivotQuery, signal: AbortSignal): Promise<PivotQueryResult>;
  members(request: PivotMembersRequest, signal: AbortSignal): Promise<PivotMembersResult>;
}

export const AGGREGATES: readonly PivotAggregate[] = ['sum', 'count', 'average', 'min', 'max', 'distinctCount'];
export const AREAS: readonly PivotArea[] = ['rows', 'columns', 'values', 'filters'];

export function fail(property: string, expected: string, code = 'PIVOT_GRID_OPTIONS', component = 'pivotGrid'): never {
  throw configurationError(code, 'Invalid pivot options.', { component, property: `${component}.${property}`, expected });
}

export const isKey = (v: unknown): v is PivotKey => v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));

/** Grouping key of a raw value. */
export function toKey(v: unknown): PivotKey {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  // Objects with their own text form (value types such as plain dates); others as JSON.
  const own = (v as { toString?: unknown }).toString;
  if (typeof own === 'function' && own !== Object.prototype.toString) return String((own as () => unknown).call(v));
  const json = JSON.stringify(v) as string | undefined;
  return json ?? null;
}

/** A copy of `record` without `key`. */
export function omit<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/** Stable text key of a path (Map keys). */
export const pathKey = (path: PivotPath): string => JSON.stringify(path);
export const cellKey = (row: PivotPath, column: PivotPath): string => `${pathKey(row)}|${pathKey(column)}`;

export function isPath(v: unknown): v is PivotKey[] {
  return Array.isArray(v) && v.every(isKey);
}

export function startsWith(path: PivotPath, prefix: PivotPath): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i++) if (!Object.is(path[i], prefix[i])) return false;
  return true;
}

export function assertFields(fields: unknown): void {
  if (!Array.isArray(fields) || fields.length === 0) fail('fields', 'non-empty PivotField[]');
  const ids = new Set<string>();
  fields.forEach((f: unknown, i) => {
    const p = `fields[${String(i)}]`;
    if (!validators.isRecord(f)) fail(p, 'PivotField');
    if (typeof f.id !== 'string' || f.id === '' || ids.has(f.id)) fail(`${p}.id`, 'unique non-empty string');
    ids.add(f.id);
    if (typeof f.label !== 'string' || f.label.trim() === '') fail(`${p}.label`, 'non-empty string');
    if (f.value !== undefined && typeof f.value !== 'function') fail(`${p}.value`, 'function');
    if (f.formatMember !== undefined && typeof f.formatMember !== 'function') fail(`${p}.formatMember`, 'function');
    if (f.numberFormat !== undefined && !validators.isRecord(f.numberFormat)) fail(`${p}.numberFormat`, 'Intl.NumberFormatOptions');
    if (f.aggregate !== undefined && !AGGREGATES.includes(f.aggregate as PivotAggregate)) fail(`${p}.aggregate`, AGGREGATES.map((a) => `"${a}"`).join(' | '));
    const areas: unknown = f.areas;
    if (areas !== undefined && !(Array.isArray(areas) && areas.every((a) => AREAS.includes(a as PivotArea)))) fail(`${p}.areas`, 'PivotArea[]');
  });
}

function assertSort(sort: unknown, at: string, values: number): void {
  if (sort === null || sort === undefined) return;
  if (!validators.isRecord(sort)) fail(at, 'PivotSort | null');
  if (sort.direction !== 'ascending' && sort.direction !== 'descending') fail(`${at}.direction`, '"ascending" | "descending"');
  if (sort.by === 'label') return;
  if (sort.by !== 'value') fail(`${at}.by`, '"label" | "value"');
  if (!(typeof sort.value === 'number' && Number.isInteger(sort.value) && sort.value >= 0 && sort.value < Math.max(1, values))) fail(`${at}.value`, 'index into layout.values');
  if (sort.column !== undefined && !isPath(sort.column)) fail(`${at}.column`, 'PivotKey[]');
}

/** Validate a layout against the fields; returns a normalized, independent copy. */
export function normalizeLayout(input: unknown, fieldIds: ReadonlySet<string>, at = 'layout'): PivotLayout {
  if (!validators.isRecord(input)) fail(at, 'PivotLayout');
  const used = new Set<string>();
  const ids = (key: 'rows' | 'columns' | 'filters', required: boolean): string[] => {
    const list: unknown = input[key];
    if (list === undefined && !required) return [];
    if (!Array.isArray(list)) fail(`${at}.${key}`, 'string[] of field ids');
    return list.map((id: unknown, i) => {
      if (typeof id !== 'string' || !fieldIds.has(id)) fail(`${at}.${key}[${String(i)}]`, 'a field id');
      if (used.has(id)) fail(`${at}.${key}[${String(i)}]`, 'a field id not used in another row, column, or filter position');
      used.add(id);
      return id;
    });
  };
  const rows = ids('rows', true);
  const columns = ids('columns', true);
  const filters = ids('filters', false);
  const valuesIn: unknown = input.values;
  if (!Array.isArray(valuesIn)) fail(`${at}.values`, 'PivotValue[]');
  const valueFields = new Set<string>();
  const values = valuesIn.map((v: unknown, i): PivotValue => {
    const p = `${at}.values[${String(i)}]`;
    if (!validators.isRecord(v) || typeof v.field !== 'string' || !fieldIds.has(v.field)) fail(`${p}.field`, 'a field id');
    if (valueFields.has(v.field)) fail(`${p}.field`, 'a field id not already in values');
    valueFields.add(v.field);
    if (!AGGREGATES.includes(v.aggregate as PivotAggregate)) fail(`${p}.aggregate`, AGGREGATES.map((a) => `"${a}"`).join(' | '));
    return { field: v.field, aggregate: v.aggregate as PivotAggregate };
  });
  const include: Record<string, PivotKey[]> = {};
  const includeIn: unknown = input.include;
  if (includeIn !== undefined) {
    if (!validators.isRecord(includeIn)) fail(`${at}.include`, 'Record<string, PivotKey[]>');
    for (const [id, keys] of Object.entries(includeIn)) {
      if (!fieldIds.has(id)) fail(`${at}.include.${id}`, 'a field id');
      if (!isPath(keys)) fail(`${at}.include.${id}`, 'PivotKey[]');
      include[id] = [...keys];
    }
  }
  const sortIn: unknown = input.sort;
  let sort: PivotLayout['sort'] = { rows: null, columns: null };
  if (sortIn !== undefined) {
    if (!validators.isRecord(sortIn)) fail(`${at}.sort`, '{ rows?, columns? }');
    assertSort(sortIn.rows, `${at}.sort.rows`, values.length);
    assertSort(sortIn.columns, `${at}.sort.columns`, values.length);
    sort = { rows: copySort(sortIn.rows as PivotSort | null | undefined), columns: copySort(sortIn.columns as PivotSort | null | undefined) };
  }
  const expandedIn: unknown = input.expanded;
  let expanded: PivotLayout['expanded'] = null;
  if (expandedIn !== undefined && expandedIn !== null) {
    if (!validators.isRecord(expandedIn) || !Array.isArray(expandedIn.rows) || !Array.isArray(expandedIn.columns)) fail(`${at}.expanded`, '{ rows: PivotKey[][]; columns: PivotKey[][] } | null');
    const paths = (list: unknown[], axis: string): PivotKey[][] => list.map((p, i) => {
      if (!isPath(p)) fail(`${at}.expanded.${axis}[${String(i)}]`, 'PivotKey[]');
      return [...p];
    });
    expanded = { rows: paths(expandedIn.rows, 'rows'), columns: paths(expandedIn.columns, 'columns') };
  }
  return { rows, columns, values, filters, include, sort, expanded };
}

function copySort(sort: PivotSort | null | undefined): PivotSort | null {
  if (!sort) return null;
  if (sort.by === 'label') return { by: 'label', direction: sort.direction };
  const out: PivotValueSort = { by: 'value', value: sort.value, direction: sort.direction };
  if (sort.column) out.column = [...sort.column];
  return out;
}

export function copyLayout(l: PivotLayout): PivotLayout {
  const include: Record<string, PivotKey[]> = {};
  for (const [k, v] of Object.entries(l.include)) include[k] = [...v];
  return {
    rows: [...l.rows],
    columns: [...l.columns],
    values: l.values.map((v) => ({ ...v })),
    filters: [...l.filters],
    include,
    sort: { rows: copySort(l.sort.rows), columns: copySort(l.sort.columns) },
    expanded: l.expanded ? { rows: l.expanded.rows.map((p) => [...p]), columns: l.expanded.columns.map((p) => [...p]) } : null,
  };
}

export function assertQueryResult(result: unknown, values: number): asserts result is PivotQueryResult {
  const bad: (expected: string) => never = (expected) => {
    throw configurationError('PIVOT_DATA_SOURCE', 'Invalid pivot data source result.', { component: 'pivotGrid', property: 'pivotGrid.dataSource.query', expected });
  };
  if (!validators.isRecord(result)) bad('{ cells: PivotCell[] }');
  const cells: unknown = result.cells;
  if (!Array.isArray(cells)) bad('{ cells: PivotCell[] }');
  for (const c of cells as unknown[]) {
    if (!validators.isRecord(c) || !isPath(c.row) || !isPath(c.column)) bad('PivotCell { row: PivotKey[]; column: PivotKey[]; values }');
    const list: unknown = c.values;
    if (!Array.isArray(list) || list.length !== values) bad(`PivotCell.values: (number | null)[${String(values)}]`);
    for (const v of list as unknown[]) if (!(v === null || (typeof v === 'number' && Number.isFinite(v)))) bad('cell values: finite number | null');
  }
}

export function assertMembersResult(result: unknown): asserts result is PivotMembersResult {
  const bad: (expected: string) => never = (expected) => {
    throw configurationError('PIVOT_DATA_SOURCE', 'Invalid pivot data source result.', { component: 'pivotGrid', property: 'pivotGrid.dataSource.members', expected });
  };
  if (!validators.isRecord(result)) bad('{ members: PivotMember[]; total: number }');
  const members: unknown = result.members;
  const total: unknown = result.total;
  if (!Array.isArray(members) || !(typeof total === 'number' && Number.isInteger(total) && total >= 0)) bad('{ members: PivotMember[]; total: number }');
  for (const m of members as unknown[]) {
    if (!validators.isRecord(m) || !isKey(m.key) || (m.label !== undefined && typeof m.label !== 'string')) bad('PivotMember { key: PivotKey; label?: string }');
  }
}
