/**
 * Stable multi-column client sort (internal). Keys are computed once per row and
 * sort column; text keys are ranked once by locale collation (numeric ordering),
 * so the row comparisons themselves are numeric. Nulls sort last in both directions.
 */
import { collatorFor, sortKey, type DataTableColumn, type DataTableSort, type Item } from './model.js';

interface Entry<Row> {
  readonly item: Item<Row>;
  /** Position in the input array. */
  readonly i: number;
}

type Comparator<Row> = (a: Entry<Row>, b: Entry<Row>) => number;

/** Ranks of text keys: values equal under collation share a rank; NaN marks a null key. */
function rankText(keys: readonly (string | null)[], locale: string): Float64Array {
  const collator = collatorFor(locale);
  const distinct = [...new Set(keys.filter((k): k is string => k !== null))].sort((x, y) => collator.compare(x, y));
  const rank = new Map<string, number>();
  let r = 0;
  let previous: string | null = null;
  for (const value of distinct) {
    if (previous !== null && collator.compare(previous, value) !== 0) r++;
    rank.set(value, r);
    previous = value;
  }
  const out = new Float64Array(keys.length);
  keys.forEach((k, i) => {
    out[i] = k === null ? Number.NaN : (rank.get(k) ?? Number.NaN);
  });
  return out;
}

function keyComparator<Row>(items: readonly Item<Row>[], column: DataTableColumn<Row>, sign: number, locale: string): Comparator<Row> {
  const compare = column.compare;
  if (compare) return (a, b) => sign * compare(a.item.row, b.item.row);
  const type = column.type ?? 'text';
  let keys: Float64Array;
  if (type === 'text') {
    keys = rankText(items.map((item) => {
      const k = sortKey('text', column.accessor(item.row));
      return typeof k === 'string' ? k : null;
    }), locale);
  } else {
    keys = new Float64Array(items.length);
    items.forEach((item, i) => {
      const k = sortKey(type, column.accessor(item.row));
      keys[i] = typeof k === 'number' ? k : Number.NaN;
    });
  }
  return (a, b) => {
    const x = keys[a.i] ?? Number.NaN;
    const y = keys[b.i] ?? Number.NaN;
    const nx = Number.isNaN(x);
    const ny = Number.isNaN(y);
    if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1;
    return x < y ? -sign : x > y ? sign : 0;
  };
}

/** Sort `items` by `sorts` (first entry has the highest priority). Returns `items` itself when there is nothing to sort. */
export function sortItems<Row>(items: readonly Item<Row>[], sorts: readonly DataTableSort[], columns: ReadonlyMap<string, DataTableColumn<Row>>, locale: string): readonly Item<Row>[] {
  const [only] = sorts;
  const onlyColumn = only && sorts.length === 1 ? columns.get(only.column) : undefined;
  if (only && onlyColumn && !onlyColumn.compare && (onlyColumn.type ?? 'text') === 'text') {
    // One text column: compare keys with the collator directly; ranking would cost an extra pass.
    const collator = collatorFor(locale);
    const sign = only.direction === 'ascending' ? 1 : -1;
    const keyed = items.map((item) => {
      const k = sortKey('text', onlyColumn.accessor(item.row));
      return { item, key: typeof k === 'string' ? k : null };
    });
    keyed.sort((a, b) => {
      const x = a.key;
      const y = b.key;
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return sign * collator.compare(x, y);
    });
    return keyed.map((k) => k.item);
  }
  const comparators: Comparator<Row>[] = [];
  for (const sort of sorts) {
    const column = columns.get(sort.column);
    if (column) comparators.push(keyComparator(items, column, sort.direction === 'ascending' ? 1 : -1, locale));
  }
  const [first] = comparators;
  if (!first) return items;
  const entries = items.map((item, i): Entry<Row> => ({ item, i }));
  // Array.prototype.sort is stable, so equal keys keep their input order.
  entries.sort(comparators.length === 1 ? first : (a, b) => {
    for (const c of comparators) {
      const r = c(a, b);
      if (r !== 0) return r;
    }
    return 0;
  });
  return entries.map((e) => e.item);
}
