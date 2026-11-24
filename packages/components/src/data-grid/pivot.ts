/**
 * Data Grid pivot mode (docs/PLAN-R11-G5.md, G5e): the pivot model, its validation, and the
 * aggregated cells for every (row path, column path) pair, computed by the Pivot Grid's local
 * engine. Paths are lists of key ids (`keyId`), the same identities the grouping engine uses.
 */
import type { Item } from '../data-table/model.js';
import { createLocalPivotSource } from '../pivot-grid/engine.js';
import type { PivotAggregate, PivotField } from '../pivot-grid/model.js';
import { keyId, type GroupLevel } from './grouping.js';
import { fail } from './model.js';

export type DataGridPivotAggregate = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinctCount';

export interface DataGridPivotValue {
  readonly column: string;
  readonly aggregate: DataGridPivotAggregate;
}

/** Pivot mode: row fields (grouped rows), column fields (generated column groups), and aggregated values. */
export interface DataGridPivot {
  readonly rows: readonly string[];
  readonly columns: readonly string[];
  readonly values: readonly DataGridPivotValue[];
}

export const PIVOT_AGGREGATES: readonly DataGridPivotAggregate[] = ['sum', 'count', 'avg', 'min', 'max', 'distinctCount'];

const ENGINE: Readonly<Record<DataGridPivotAggregate, PivotAggregate>> = { sum: 'sum', count: 'count', avg: 'average', min: 'min', max: 'max', distinctCount: 'distinctCount' };

const isList = (v: unknown): v is readonly string[] => Array.isArray(v) && v.length <= 20 && v.every((x) => typeof x === 'string');

/** Validate a pivot model (shape only; unknown column ids are dropped by the grid). */
export function parsePivot(value: unknown, property = 'pivot'): DataGridPivot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(property, '{ rows, columns, values }');
  const v = value as Partial<Record<keyof DataGridPivot, unknown>>;
  if (!isList(v.rows)) fail(`${property}.rows`, 'array of at most 20 column ids');
  if (!isList(v.columns)) fail(`${property}.columns`, 'array of at most 20 column ids');
  const values: unknown = v.values;
  if (!Array.isArray(values) || values.length > 50) fail(`${property}.values`, 'array of at most 50 { column, aggregate }');
  const parsed = values.map((x: unknown, i): DataGridPivotValue => {
    const item = typeof x === 'object' && x !== null ? (x as Partial<Record<keyof DataGridPivotValue, unknown>>) : null;
    if (!item || typeof item.column !== 'string' || !PIVOT_AGGREGATES.includes(item.aggregate as DataGridPivotAggregate)) fail(`${property}.values[${String(i)}]`, `{ column, aggregate: ${PIVOT_AGGREGATES.map((a) => `"${a}"`).join(' | ')} }`);
    return { column: item.column, aggregate: item.aggregate as DataGridPivotAggregate };
  });
  return { rows: [...v.rows], columns: [...v.columns], values: parsed };
}

/** The key of a (row path, column path) pair in the cell map. */
export const cellKey = (row: readonly string[], column: readonly string[]): string => `${JSON.stringify(row)}|${JSON.stringify(column)}`;

const blank = (v: unknown): boolean => v === null || v === undefined || v === '';

/**
 * Aggregated values of every requested pair: rows by `rowLevels`, columns by `columnLevels`
 * (paths of key ids), values read by `values`. `rowParents` and `columnParents` are the paths
 * whose children are wanted (`[]` for the top level and the totals).
 */
export function pivotCells<Row>(
  items: readonly Item<Row>[],
  rowLevels: readonly GroupLevel<Row>[],
  columnLevels: readonly GroupLevel<Row>[],
  values: readonly { readonly aggregate: DataGridPivotAggregate; readonly read: (row: Row) => unknown }[],
  rowParents: readonly (readonly string[])[],
  columnParents: readonly (readonly string[])[],
): Map<string, readonly (number | null)[]> {
  const key = (level: GroupLevel<Row>) => (item: Item<Row>): string => {
    const raw = level.key(item.row);
    return keyId(blank(raw) ? null : raw);
  };
  const fields: PivotField<Item<Row>>[] = [
    ...rowLevels.map((level, i) => ({ id: `r${String(i)}`, label: level.column, value: key(level) })),
    ...columnLevels.map((level, i) => ({ id: `c${String(i)}`, label: level.column, value: key(level) })),
    ...values.map((v, i) => ({
      id: `v${String(i)}`,
      label: String(i),
      // Distinct counts compare key ids (dates and instants by value); other aggregates read the raw value.
      value: v.aggregate === 'distinctCount' ? (item: Item<Row>) => { const raw = v.read(item.row); return blank(raw) ? null : keyId(raw); } : (item: Item<Row>) => v.read(item.row),
    })),
  ];
  const source = createLocalPivotSource(items, fields);
  const result = source.compute({
    rows: rowLevels.map((_l, i) => `r${String(i)}`),
    columns: columnLevels.map((_l, i) => `c${String(i)}`),
    values: values.map((v, i) => ({ field: `v${String(i)}`, aggregate: ENGINE[v.aggregate] })),
    include: {},
    rowParents,
    columnParents,
  });
  const out = new Map<string, readonly (number | null)[]>();
  for (const cell of result.cells) out.set(cellKey(cell.row.map(String), cell.column.map(String)), cell.values);
  return out;
}
