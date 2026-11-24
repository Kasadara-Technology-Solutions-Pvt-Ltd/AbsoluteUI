/**
 * Data Grid row grouping and aggregation (docs/PLAN-R11-G5.md, G5a): group trees over the
 * filtered and sorted rows, aggregates per group (combined correctly across levels: averages
 * from sums and counts, never averages of averages), and the flattened list of display rows
 * (group rows, data rows, total rows) for the current expansion.
 */
import { isInstantLike, isPlainDate, type Item } from '../data-table/model.js';

export type DataGridAggregateName = 'sum' | 'min' | 'max' | 'count' | 'avg' | 'first' | 'last';

/** What a custom aggregate receives. */
export interface DataGridAggregateContext<Row> {
  readonly column: string;
  /** The data rows of the group (after filtering). */
  readonly rows: readonly Row[];
}

export type DataGridAggregate<Row> = DataGridAggregateName | ((values: readonly unknown[], context: DataGridAggregateContext<Row>) => unknown);

/** A part of a date a level groups by (date hierarchies). */
export type DataGridDatePart = 'year' | 'quarter' | 'month' | 'week' | 'day';

/** A group level: the column and how to read a row's key. */
export interface GroupLevel<Row> {
  readonly column: string;
  /** The date part of a date hierarchy level (keys are part numbers). */
  readonly part?: DataGridDatePart;
  /** The raw key value (blank keys are null). */
  readonly key: (row: Row) => unknown;
  /** Compare two keys (ascending); `direction` decides the order. */
  readonly compare: (a: unknown, b: unknown) => number;
  readonly direction: 'ascending' | 'descending';
}

/** An aggregated column. */
export interface AggregateColumn<Row> {
  readonly column: string;
  readonly aggregate: DataGridAggregate<Row>;
  readonly read: (row: Row) => unknown;
}

export interface GroupNode<Row> {
  /** Stable id: `group:` plus the encoded key path. */
  readonly id: string;
  /** 0 for the first grouping level. */
  readonly level: number;
  readonly column: string;
  /** The date part of a date hierarchy level. */
  readonly part: DataGridDatePart | undefined;
  /** The raw key (null for blanks). */
  readonly key: unknown;
  readonly parent: GroupNode<Row> | null;
  /** Child groups (inner levels) or data rows (the last level), in display order. */
  readonly groups: GroupNode<Row>[];
  readonly items: Item<Row>[];
  /** Every data row below this group, in display order. */
  readonly leaves: Item<Row>[];
  /** Aggregates by column id. */
  readonly aggregates: Map<string, unknown>;
  /** Tree data: the data row of a parent node (absent for groups and filler nodes). */
  readonly item?: Item<Row>;
  /** Server rows: a group row loaded from the server (its children load when it expands). */
  readonly lazy?: { readonly row: Item<Row>; readonly count: number | null; readonly keys: readonly unknown[] };
}

/** A row of the display list. */
export type DisplayRow<Row> =
  | { readonly kind: 'data'; readonly item: Item<Row>; readonly level: number; readonly parent: GroupNode<Row> | null; readonly position: number; readonly size: number }
  | { readonly kind: 'group'; readonly node: GroupNode<Row>; readonly expanded: boolean; readonly position: number; readonly size: number }
  | { readonly kind: 'total'; readonly node: GroupNode<Row> | null; readonly id: string }
  /** Master/detail: the detail row under an expanded master row (`level` is the master's level plus one). */
  | { readonly kind: 'detail'; readonly master: Item<Row>; readonly level: number }
  /** Server row model: a row not loaded yet (or whose block failed: `failed` holds the message). */
  | { readonly kind: 'loading'; readonly index: number; readonly failed: string | null; readonly level: number };

/** A comparable, serializable identity of a key (dates by ISO day, instants by epoch, blanks as one key). */
export function keyId(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'blank';
  if (isPlainDate(value)) return `d:${String(value.year)}-${String(value.month)}-${String(value.day)}`;
  if (isInstantLike(value)) return `i:${String(value.epochMilliseconds)}`;
  if (typeof value === 'bigint') return `n:${value.toString()}`;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return `${typeof value}:${String(value)}`;
  return `o:${JSON.stringify(value)}`;
}

const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';

/** Aggregate a list of values (sum and avg skip non-numbers; BigInt sums stay BigInt). */
export function aggregateValues<Row>(aggregate: DataGridAggregate<Row>, values: readonly unknown[], context: DataGridAggregateContext<Row>): unknown {
  if (typeof aggregate === 'function') return aggregate(values, context);
  const present = values.filter((v) => !isBlank(v));
  switch (aggregate) {
    case 'count':
      return present.length;
    case 'first':
      return present[0] ?? null;
    case 'last':
      return present.at(-1) ?? null;
    case 'sum':
    case 'avg': {
      const bigints = present.filter((v): v is bigint => typeof v === 'bigint');
      if (bigints.length > 0 && bigints.length === present.length) {
        const sum = bigints.reduce((a, b) => a + b, 0n);
        return aggregate === 'sum' ? sum : sum / BigInt(bigints.length);
      }
      const numbers = present.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (numbers.length === 0) return null;
      const sum = numbers.reduce((a, b) => a + b, 0);
      return aggregate === 'sum' ? sum : sum / numbers.length;
    }
    case 'min':
    case 'max': {
      let best: unknown = null;
      for (const v of present) {
        if (best === null || (aggregate === 'min' ? compareValues(v, best) < 0 : compareValues(v, best) > 0)) best = v;
      }
      return best;
    }
  }
}

/** Order numbers, BigInts, dates, instants, and text (numbers before text). */
export function compareValues(a: unknown, b: unknown): number {
  const rank = (v: unknown): number | bigint | string => {
    if (typeof v === 'number' || typeof v === 'bigint') return v;
    if (isPlainDate(v)) return v.year * 10_000 + v.month * 100 + v.day;
    if (isInstantLike(v)) return v.epochMilliseconds;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return String(v);
  };
  const x = rank(a);
  const y = rank(b);
  if (typeof x === 'string' || typeof y === 'string') return String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Group the (filtered, sorted) data rows by the levels. Rows keep their order within a group;
 * groups are ordered by key (blanks last), each level by its own direction.
 */
export function buildGroups<Row>(items: readonly Item<Row>[], levels: readonly GroupLevel<Row>[], aggregates: readonly AggregateColumn<Row>[]): GroupNode<Row>[] {
  const build = (rows: readonly Item<Row>[], depth: number, parent: GroupNode<Row> | null, path: string): GroupNode<Row>[] => {
    const level = levels[depth];
    if (!level) return [];
    const byKey = new Map<string, { key: unknown; items: Item<Row>[] }>();
    for (const item of rows) {
      const raw = level.key(item.row);
      const key = isBlank(raw) ? null : raw;
      const id = keyId(key);
      let bucket = byKey.get(id);
      if (!bucket) {
        bucket = { key, items: [] };
        byKey.set(id, bucket);
      }
      bucket.items.push(item);
    }
    const sign = level.direction === 'descending' ? -1 : 1;
    const ordered = [...byKey].sort(([, a], [, b]) => {
      // Blanks come last in either direction.
      if (a.key === null || b.key === null) return a.key === null ? (b.key === null ? 0 : 1) : -1;
      return sign * level.compare(a.key, b.key);
    });
    return ordered.map(([id, bucket]) => {
      const nodeId = `${path}/${encodeURIComponent(id)}`;
      const node: GroupNode<Row> = { id: `group:${nodeId}`, level: depth, column: level.column, part: level.part, key: bucket.key, parent, groups: [], items: [], leaves: bucket.items, aggregates: new Map() };
      if (depth + 1 < levels.length) node.groups.push(...build(bucket.items, depth + 1, node, nodeId));
      else node.items.push(...bucket.items);
      const groupRows = bucket.items.map((item) => item.row);
      for (const a of aggregates) node.aggregates.set(a.column, aggregateValues(a.aggregate, bucket.items.map((item) => a.read(item.row)), { column: a.column, rows: groupRows }));
      return node;
    });
  };
  return build(items, 0, null, '');
}

/** The grand total aggregates over every data row. */
export function grandTotals<Row>(items: readonly Item<Row>[], aggregates: readonly AggregateColumn<Row>[]): Map<string, unknown> {
  const rows = items.map((item) => item.row);
  return new Map(aggregates.map((a) => [a.column, aggregateValues(a.aggregate, items.map((item) => a.read(item.row)), { column: a.column, rows })]));
}

export interface FlattenOptions {
  /** Whether a group is expanded. */
  readonly expanded: (node: { readonly id: string; readonly level: number }) => boolean;
  /** A total row after each expanded group's children. */
  readonly groupTotals: boolean;
}

/** The display rows for the current expansion (group rows, their visible children, totals). */
export function flattenGroups<Row>(groups: readonly GroupNode<Row>[], options: FlattenOptions): DisplayRow<Row>[] {
  const out: DisplayRow<Row>[] = [];
  const walk = (nodes: readonly GroupNode<Row>[]): void => {
    nodes.forEach((node, i) => {
      const expanded = options.expanded(node);
      out.push({ kind: 'group', node, expanded, position: i + 1, size: nodes.length });
      if (!expanded) return;
      if (node.groups.length > 0) walk(node.groups);
      else node.items.forEach((item, j) => out.push({ kind: 'data', item, level: node.level + 1, parent: node, position: j + 1, size: node.items.length }));
      // Pivot rows of the last level have no children (and no totals).
      if (options.groupTotals && (node.groups.length > 0 || node.items.length > 0)) out.push({ kind: 'total', node, id: `total:${node.id}` });
    });
  };
  walk(groups);
  return out;
}
