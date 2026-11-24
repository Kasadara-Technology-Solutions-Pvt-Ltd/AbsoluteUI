/**
 * Data Table grouping and aggregation (docs/PLAN-R9-ANGULAR.md D18, since 0.9.0).
 * Pure functions: rows are grouped by the displayed text of one or more columns (in
 * `groupBy` order, nested), collapsed groups hide their rows and sub-groups, and
 * column aggregates are computed per group and over all filtered rows.
 */
import type { DataTableColumn, Item } from './model.js';

/** Built-in aggregates, or a function of the column values and rows. */
export type DataTableAggregate<Row> = 'sum' | 'avg' | 'min' | 'max' | 'count' | ((values: readonly unknown[], rows: readonly Row[]) => unknown);

/** A group as shown in its header row and passed to `renderGroupHeader`. */
export interface DataTableGroup<Row> {
  /** Stable key: column ids and displayed values of this group and its parents. */
  readonly key: string;
  /** Grouping column id. */
  readonly column: string;
  /** The column value of the group's first row. */
  readonly value: unknown;
  /** Displayed text of the value (the grouping key). */
  readonly label: string;
  /** Nesting level, 0 for top-level groups. */
  readonly depth: number;
  /** Rows in the group (after filtering), at any depth. */
  readonly count: number;
  readonly rows: readonly Row[];
  readonly collapsed: boolean;
  /** Aggregates of the group's rows by column id. */
  readonly aggregates: Readonly<Record<string, unknown>>;
}

/** `aui-group-toggle` detail. */
export interface DataTableGroupToggleDetail {
  readonly key: string;
  readonly collapsed: boolean;
  readonly collapsedGroups: string[];
}

export type GroupedEntry<Row> = { readonly kind: 'group'; readonly group: DataTableGroup<Row> } | { readonly kind: 'row'; readonly item: Item<Row> };

const finite = (values: readonly unknown[]): number[] => values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

/** One column aggregate over rows; null when there is nothing to aggregate. */
export function aggregate<Row>(column: DataTableColumn<Row>, rows: readonly Row[]): unknown {
  const kind = column.aggregate;
  if (kind === undefined) return null;
  const values = rows.map((row) => column.accessor(row));
  if (typeof kind === 'function') return kind(values, rows);
  if (kind === 'count') return rows.length;
  const numbers = finite(values);
  if (numbers.length === 0) return null;
  switch (kind) {
    case 'sum':
      return numbers.reduce((a, b) => a + b, 0);
    case 'avg':
      return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    case 'min':
      return Math.min(...numbers);
    case 'max':
      return Math.max(...numbers);
  }
}

export function aggregateAll<Row>(columns: readonly DataTableColumn<Row>[], rows: readonly Row[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const column of columns) out[column.id] = aggregate(column, rows);
  return out;
}

/**
 * Group sorted items by the displayed text of `columns` (nested). Groups appear in item
 * order, so sort by the grouping columns first. Collapsed groups list no rows.
 */
export function groupItems<Row>(
  items: readonly Item<Row>[],
  columns: readonly DataTableColumn<Row>[],
  label: (column: DataTableColumn<Row>, row: Row) => string,
  collapsed: ReadonlySet<string>,
  aggregates: readonly DataTableColumn<Row>[],
): GroupedEntry<Row>[] {
  const out: GroupedEntry<Row>[] = [];
  const walk = (list: readonly Item<Row>[], depth: number, parent: string): void => {
    const column = columns[depth];
    if (!column) {
      for (const item of list) out.push({ kind: 'row', item });
      return;
    }
    const groups = new Map<string, Item<Row>[]>();
    for (const item of list) {
      const text = label(column, item.row);
      const members = groups.get(text);
      if (members) members.push(item);
      else groups.set(text, [item]);
    }
    for (const [text, members] of groups) {
      const own = `${encodeURIComponent(column.id)}=${encodeURIComponent(text)}`;
      const key = parent === '' ? own : `${parent}/${own}`;
      const rows = members.map((m) => m.row);
      const first = rows[0];
      const isCollapsed = collapsed.has(key);
      out.push({
        kind: 'group',
        group: {
          key,
          column: column.id,
          value: first === undefined ? null : column.accessor(first),
          label: text,
          depth,
          count: members.length,
          rows,
          collapsed: isCollapsed,
          aggregates: aggregateAll(aggregates, rows),
        },
      });
      if (!isCollapsed) walk(members, depth + 1, key);
    }
  };
  walk(items, 0, '');
  return out;
}
