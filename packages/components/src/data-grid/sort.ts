/**
 * Data Grid sorting: stable, nulls last in both directions, typed keys, locale collation with
 * numeric ordering, custom comparators. Text columns are ranked once per column (collator
 * comparisons are the expensive part); later sorts on the same rows compare numbers, and row
 * updates re-rank only the changed rows (binary insertion among the known values).
 */
import { collatorFor, sortKey, type DataTableColumn, type Item } from '../data-table/model.js';
import type { DataGridSort } from './model.js';

interface RankCache {
  /** Rank per source row index (NaN for no value). */
  ranks: Float64Array;
  /** Distinct texts seen, in collation order, with their ranks (ascending). */
  readonly texts: string[];
  readonly values: number[];
}

export class SortEngine<Row> {
  #cache = new Map<string, RankCache>();
  #locale = '';

  /** Drop cached ranks (columns or locale changed, or rows were replaced wholesale). */
  invalidate(): void {
    this.#cache.clear();
  }

  /**
   * Carry cached ranks across a row change: unchanged rows keep their rank (looked up by id),
   * changed and new rows are ranked by insertion. `previous` and `next` are source orders.
   */
  carry(previous: readonly Item<Row>[], next: readonly Item<Row>[], changed: ReadonlySet<string>, columns: ReadonlyMap<string, DataTableColumn<Row>>): void {
    if (this.#cache.size === 0) return;
    const oldIndex = new Map<string, number>();
    for (const item of previous) oldIndex.set(item.id, item.index);
    const compare = collatorFor(this.#locale).compare;
    for (const [id, cache] of [...this.#cache]) {
      const column = columns.get(id);
      if (!column) {
        this.#cache.delete(id);
        continue;
      }
      const ranks = new Float64Array(next.length).fill(Number.NaN);
      let ok = true;
      for (const item of next) {
        const before = oldIndex.get(item.id);
        if (before !== undefined && !changed.has(item.id)) {
          ranks[item.index] = cache.ranks[before] ?? Number.NaN;
          continue;
        }
        const k = sortKey('text', column.accessor(item.row));
        if (typeof k !== 'string') continue;
        const rank = insertRank(cache, k, compare);
        if (rank === null) {
          ok = false;
          break;
        }
        ranks[item.index] = rank;
      }
      if (ok) cache.ranks = ranks;
      else this.#cache.delete(id);
    }
  }

  sort(items: readonly Item<Row>[], sorts: readonly DataGridSort[], columns: ReadonlyMap<string, DataTableColumn<Row>>, locale: string, sourceCount: number): readonly Item<Row>[] {
    if (locale !== this.#locale) {
      this.#cache.clear();
      this.#locale = locale;
    }
    type Compare = (a: Item<Row>, b: Item<Row>) => number;
    const comparators: Compare[] = [];
    for (const s of sorts) {
      const column = columns.get(s.column);
      if (!column) continue;
      const sign = s.direction === 'ascending' ? 1 : -1;
      if (column.compare) {
        const compare = column.compare;
        comparators.push((a, b) => sign * compare(a.row, b.row));
        continue;
      }
      const keys = this.#keys(items, column, locale, sourceCount);
      comparators.push((a, b) => {
        const x = keys[a.index] ?? Number.NaN;
        const y = keys[b.index] ?? Number.NaN;
        const nx = Number.isNaN(x);
        const ny = Number.isNaN(y);
        if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1;
        return x < y ? -sign : x > y ? sign : 0;
      });
    }
    if (comparators.length === 0) return items;
    const out = [...items];
    // Array.prototype.sort is stable, so equal keys keep their input order.
    out.sort(comparators.length === 1 ? comparators[0] : (a, b) => {
      for (const c of comparators) {
        const r = c(a, b);
        if (r !== 0) return r;
      }
      return 0;
    });
    return out;
  }

  /** Numeric sort keys by source index: ranks for text, typed keys otherwise. */
  #keys(items: readonly Item<Row>[], column: DataTableColumn<Row>, locale: string, sourceCount: number): Float64Array {
    const type = column.type ?? 'text';
    if (type === 'text') {
      const cached = this.#cache.get(column.id);
      if (cached?.ranks.length === sourceCount) return cached.ranks;
      const built = rankText(items, column, locale, sourceCount);
      this.#cache.set(column.id, built);
      return built.ranks;
    }
    const keys = new Float64Array(sourceCount).fill(Number.NaN);
    for (const item of items) {
      const k = sortKey(type, column.accessor(item.row));
      if (typeof k === 'number') keys[item.index] = k;
    }
    return keys;
  }
}

function rankText<Row>(items: readonly Item<Row>[], column: DataTableColumn<Row>, locale: string, sourceCount: number): RankCache {
  const ranks = new Float64Array(sourceCount).fill(Number.NaN);
  const entries: { index: number; text: string }[] = [];
  for (const item of items) {
    const k = sortKey('text', column.accessor(item.row));
    if (typeof k === 'string') entries.push({ index: item.index, text: k });
  }
  const compare = collatorFor(locale).compare;
  entries.sort((a, b) => compare(a.text, b.text));
  const texts: string[] = [];
  const values: number[] = [];
  let rank = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const prev = entries[i - 1];
    if (!e) continue;
    if (!prev || compare(prev.text, e.text) !== 0) {
      if (prev) rank++;
      texts.push(e.text);
      values.push(rank);
    }
    ranks[e.index] = rank;
  }
  return { ranks, texts, values };
}

/** Rank of `text`: an existing rank when it collates equal to a known value, else a new rank between its neighbours (null when no room is left). */
function insertRank(cache: RankCache, text: string, compare: (a: string, b: string) => number): number | null {
  const { texts, values } = cache;
  let lo = 0;
  let hi = texts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const c = compare(texts[mid] ?? '', text);
    if (c === 0) return values[mid] ?? null;
    if (c < 0) lo = mid + 1;
    else hi = mid;
  }
  const below = values[lo - 1];
  const above = values[lo];
  const rank = below === undefined ? (above === undefined ? 0 : above - 1) : above === undefined ? below + 1 : (below + above) / 2;
  if ((below !== undefined && rank <= below) || (above !== undefined && rank >= above)) return null;
  texts.splice(lo, 0, text);
  values.splice(lo, 0, rank);
  return rank;
}
