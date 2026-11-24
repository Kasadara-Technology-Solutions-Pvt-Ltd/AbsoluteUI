/**
 * Local pivot engine: aggregates in-memory rows and answers the same queries as a
 * server data source, so the grid has one code path. One pass over the filtered
 * rows accumulates every requested (row path, column path) pair.
 */
import { configurationError, validators } from '@absoluteui/core';
import {
  assertFields,
  pathKey,
  toKey,
  type PivotAggregate,
  type PivotCell,
  type PivotDataSource,
  type PivotField,
  type PivotKey,
  type PivotMember,
  type PivotMembersRequest,
  type PivotMembersResult,
  type PivotPath,
  type PivotQuery,
  type PivotQueryResult,
  type PivotValue,
} from './model.js';

interface Accumulator {
  sum: number;
  numbers: number;
  count: number;
  min: number;
  max: number;
  distinct: Set<PivotKey> | null;
}

const newAccumulator = (distinct: boolean): Accumulator => ({ sum: 0, numbers: 0, count: 0, min: Infinity, max: -Infinity, distinct: distinct ? new Set() : null });

function add(acc: Accumulator, raw: unknown): void {
  if (raw === null || raw === undefined || raw === '') return;
  acc.count++;
  acc.distinct?.add(toKey(raw));
  const n = typeof raw === 'number' ? raw : typeof raw === 'bigint' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return;
  acc.numbers++;
  acc.sum += n;
  if (n < acc.min) acc.min = n;
  if (n > acc.max) acc.max = n;
}

function result(acc: Accumulator, aggregate: PivotAggregate): number | null {
  switch (aggregate) {
    case 'count':
      return acc.count;
    case 'distinctCount':
      return acc.distinct?.size ?? 0;
    case 'sum':
      return acc.numbers === 0 ? null : acc.sum;
    case 'average':
      return acc.numbers === 0 ? null : acc.sum / acc.numbers;
    case 'min':
      return acc.numbers === 0 ? null : acc.min;
    case 'max':
      return acc.numbers === 0 ? null : acc.max;
  }
}

/** Default member label: text of the key; null is labelled by the caller (localized "(blank)"). */
export function memberText(key: PivotKey): string {
  return key === null ? '' : String(key);
}

const collators = new Map<string, Intl.Collator>();

/** Member order: null last, numbers numerically, booleans false first, text by locale collation. */
export function compareKeys(a: PivotKey, b: PivotKey, locale: string): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a ? 1 : -1;
  let c = collators.get(locale);
  if (!c) {
    c = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    collators.set(locale, c);
  }
  return c.compare(String(a), String(b)) || (String(a) < String(b) ? -1 : 1);
}

export interface LocalPivotSourceOptions {
  /** Locale of member ordering and label search. Default `en-US`. */
  locale?: string;
}

/** Aggregates `rows` in memory. The returned source reads `rows` at query time (replace it with `setRows`). */
export interface LocalPivotSource<Row> extends PivotDataSource {
  setRows(rows: readonly Row[]): void;
  /** Synchronous query (the async `query` wraps it). */
  compute(query: PivotQuery): PivotQueryResult;
}

export function createLocalPivotSource<Row>(rows: readonly Row[], fields: readonly PivotField<Row>[], options: LocalPivotSourceOptions = {}): LocalPivotSource<Row> {
  assertFields(fields);
  if (!Array.isArray(rows)) throw configurationError('PIVOT_GRID_OPTIONS', 'Invalid pivot options.', { component: 'pivotGrid', property: 'pivotGrid.rows', expected: 'Row[]' });
  if (options.locale !== undefined && !validators.isLocale(options.locale)) throw configurationError('PIVOT_GRID_OPTIONS', 'Invalid pivot options.', { component: 'pivotGrid', property: 'pivotGrid.locale', expected: 'BCP 47 locale' });
  const byId = new Map(fields.map((f) => [f.id, f]));
  const locale = options.locale ?? 'en-US';
  let data: readonly Row[] = rows;

  const reader = (id: string): ((row: Row) => unknown) => {
    const field = byId.get(id);
    if (!field) {
      throw configurationError('PIVOT_GRID_OPTIONS', 'Invalid pivot query.', { component: 'pivotGrid', property: 'pivotGrid.query', expected: `a field id (got "${id}")` });
    }
    const value = field.value;
    if (value) return value;
    return (row: Row) => (validators.isRecord(row) ? row[id] : undefined);
  };

  /** Row indexes passing the include filters (optionally ignoring one field). */
  const filtered = (include: Readonly<Record<string, readonly PivotKey[]>>, skip?: string): readonly Row[] => {
    const tests = Object.entries(include)
      .filter(([id]) => id !== skip)
      .map(([id, keys]) => ({ read: reader(id), keys: new Set(keys) }));
    if (tests.length === 0) return data;
    return data.filter((row) => tests.every((t) => t.keys.has(toKey(t.read(row)))));
  };

  const compute = (q: PivotQuery): PivotQueryResult => {
    // Fields below the deepest requested child level are never read.
    const depth = (parents: readonly PivotPath[], fields: number): number => Math.min(fields, parents.reduce((m, p) => Math.max(m, p.length), -1) + 1);
    const rowReaders = q.rows.slice(0, depth(q.rowParents, q.rows.length)).map(reader);
    const colReaders = q.columns.slice(0, depth(q.columnParents, q.columns.length)).map(reader);
    const valueReaders = q.values.map((v: PivotValue) => reader(v.field));
    const rowParents = new Set(q.rowParents.map(pathKey));
    const colParents = new Set(q.columnParents.map(pathKey));
    const distinct = q.values.map((v) => v.aggregate === 'distinctCount');
    const cells = new Map<string, { row: PivotKey[]; column: PivotKey[]; acc: Accumulator[] }>();
    const rowKeys: PivotKey[] = new Array<PivotKey>(rowReaders.length);
    const colKeys: PivotKey[] = new Array<PivotKey>(colReaders.length);
    const rowHits: number[] = [];
    const colHits: number[] = [];
    const rowText: string[] = [];
    const colText: string[] = [];

    /**
     * Prefix lengths of a full path that the query asks for (a parent, or a child of a
     * parent). Prefix keys are built incrementally: `[${text[k]}]` equals pathKey(prefix).
     */
    const requested = (row: Row, readers: readonly ((row: Row) => unknown)[], keys: PivotKey[], text: string[], parents: ReadonlySet<string>, hits: number[]): void => {
      hits.length = 0;
      let prefix = '';
      let previous = parents.has('[]');
      text[0] = '';
      if (previous) hits.push(0);
      for (let k = 0; k < readers.length; k++) {
        const read = readers[k];
        const key = read ? toKey(read(row)) : null;
        keys[k] = key;
        prefix = k === 0 ? JSON.stringify(key) : `${prefix},${JSON.stringify(key)}`;
        text[k + 1] = prefix;
        const isParent = parents.has(`[${prefix}]`);
        if (isParent || previous) hits.push(k + 1);
        previous = isParent;
      }
    };

    for (const row of filtered(q.include)) {
      requested(row, rowReaders, rowKeys, rowText, rowParents, rowHits);
      if (rowHits.length === 0) continue;
      requested(row, colReaders, colKeys, colText, colParents, colHits);
      if (colHits.length === 0) continue;
      const raw = valueReaders.map((r) => r(row));
      for (const rl of rowHits) {
        for (const cl of colHits) {
          const key = `${rowText[rl] ?? ''}|${colText[cl] ?? ''}`;
          let cell = cells.get(key);
          if (!cell) {
            cell = { row: rowKeys.slice(0, rl), column: colKeys.slice(0, cl), acc: distinct.map((d) => newAccumulator(d)) };
            cells.set(key, cell);
          }
          for (let i = 0; i < raw.length; i++) {
            const acc = cell.acc[i];
            if (acc) add(acc, raw[i]);
          }
        }
      }
    }
    const out: PivotCell[] = [];
    for (const c of cells.values()) out.push({ row: c.row, column: c.column, values: c.acc.map((a, i) => result(a, q.values[i]?.aggregate ?? 'sum')) });
    return { cells: out };
  };

  const members = (r: PivotMembersRequest): PivotMembersResult => {
    const read = reader(r.field);
    const field = byId.get(r.field);
    const seen = new Set<PivotKey>();
    for (const row of filtered(r.include, r.field)) seen.add(toKey(read(row)));
    const label = (k: PivotKey): string => field?.formatMember?.(k) ?? memberText(k);
    const needle = r.search.trim().toLocaleLowerCase(locale);
    const all = [...seen].sort((a, b) => compareKeys(a, b, locale)).filter((k) => needle === '' || label(k).toLocaleLowerCase(locale).includes(needle));
    const page: PivotMember[] = all.slice(r.offset, r.offset + r.limit).map((key) => ({ key }));
    return { members: page, total: all.length };
  };

  const guard = (signal: AbortSignal): void => {
    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');
  };

  return {
    setRows(next) {
      if (!Array.isArray(next)) throw configurationError('PIVOT_GRID_OPTIONS', 'Invalid pivot options.', { component: 'pivotGrid', property: 'pivotGrid.rows', expected: 'Row[]' });
      data = next;
    },
    compute,
    // Errors (an aborted signal, an unknown field) reject the promise; they are never thrown synchronously.
    query(q, signal) {
      return new Promise((resolve) => {
        guard(signal);
        resolve(compute(q));
      });
    },
    members(r, signal) {
      return new Promise((resolve) => {
        guard(signal);
        resolve(members(r));
      });
    },
  };
}

/** Path helper for callers: the parent of a path (`[]` for top-level members). */
export const parentPath = (path: PivotPath): PivotKey[] => path.slice(0, -1);
