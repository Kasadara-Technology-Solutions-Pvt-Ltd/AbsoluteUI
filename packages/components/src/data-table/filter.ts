/**
 * Client filtering and global search (internal). Filters are JSON-safe values
 * (DataTableFilter); this module normalizes them and compiles one predicate per
 * change. Text matching uses the displayed cell text, lower-cased for the locale.
 */
import { addDays, parsePlainDate, plainDateTime, toInstant } from '@absoluteui/core';
import { dateKey, isArray, isInstantLike, isObject, isPlainDate, plainText, sortKey, type DataTableColumn, type DataTableFilter, type DataTableFilterKind, type Item } from './model.js';

export const FILTER_KINDS: readonly DataTableFilterKind[] = ['text', 'number', 'date', 'enum'];
const TEXT_OPERATORS = ['contains', 'equals', 'startsWith'] as const;

/** Why a column's filter definition is invalid, or null when it is valid. */
export function filterDefinitionError<Row>(c: DataTableColumn<Row>): string | null {
  if (c.filter === undefined) return c.filterOptions === undefined ? null : 'filterOptions needs filter: "enum"';
  if (!FILTER_KINDS.includes(c.filter)) return '"text" | "number" | "date" | "enum"';
  const type = c.type ?? 'text';
  if (c.filter === 'number' && type !== 'number' && type !== 'currency') return 'filter "number" on a number or currency column';
  if (c.filter === 'date' && type !== 'date' && type !== 'datetime') return 'filter "date" on a date or datetime column';
  if (c.filter === 'enum') {
    const options = c.filterOptions;
    if (options === undefined) return type === 'boolean' ? null : 'filterOptions for an enum filter (or a boolean column)';
    if (!isArray(options) || options.length === 0) return 'non-empty filterOptions';
    const values = new Set<string>();
    for (const o of options) {
      if (!isObject(o) || typeof o.value !== 'string' || typeof o.label !== 'string' || o.label.trim() === '' || values.has(o.value)) return 'filterOptions: { value: unique string, label: non-empty string }[]';
      values.add(o.value);
    }
  } else if (c.filterOptions !== undefined) {
    return 'filterOptions needs filter: "enum"';
  }
  return null;
}

const isBound = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v));
const isDateBound = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'string' && parsePlainDate(v) !== null);

/**
 * Normalize a filter value for a column: the normalized filter, `null` when it
 * filters nothing (empty text, open range, no values), or `undefined` when invalid.
 */
export function normalizeFilter<Row>(column: DataTableColumn<Row>, value: unknown): DataTableFilter | null | undefined {
  if (!isObject(value) || column.filter === undefined || value.type !== column.filter) return undefined;
  switch (value.type) {
    case 'text': {
      const operator = value.operator;
      if (typeof value.value !== 'string') return undefined;
      if (operator !== undefined && !TEXT_OPERATORS.some((o) => o === operator)) return undefined;
      const text = value.value.trim();
      if (text === '') return null;
      const op = TEXT_OPERATORS.find((o) => o === operator);
      return op === undefined || op === 'contains' ? { type: 'text', value: text } : { type: 'text', value: text, operator: op };
    }
    case 'number': {
      if (!isBound(value.min) || !isBound(value.max)) return undefined;
      const min = typeof value.min === 'number' ? value.min : null;
      const max = typeof value.max === 'number' ? value.max : null;
      return min === null && max === null ? null : { type: 'number', min, max };
    }
    case 'date': {
      if (!isDateBound(value.from) || !isDateBound(value.to)) return undefined;
      const from = typeof value.from === 'string' ? value.from : null;
      const to = typeof value.to === 'string' ? value.to : null;
      return from === null && to === null ? null : { type: 'date', from, to };
    }
    case 'enum': {
      const values = value.values;
      if (!Array.isArray(values) || !values.every((v): v is string => typeof v === 'string')) return undefined;
      const unique = [...new Set(values)];
      return unique.length === 0 ? null : { type: 'enum', values: unique };
    }
    default:
      return undefined;
  }
}

/** Values of an enum filter: the options, or Yes/No (`"true"` / `"false"`) for boolean columns. */
export function enumOptions<Row>(column: DataTableColumn<Row>, yes: string, no: string): readonly { value: string; label: string }[] {
  return column.filterOptions ?? [{ value: 'true', label: yes }, { value: 'false', label: no }];
}

export interface FilterEnvironment<Row> {
  readonly locale: string;
  readonly timezone: string;
  /** Lower-cased displayed text of a column for every item, indexed by `Item.index`. */
  text(column: DataTableColumn<Row>): readonly string[];
}

type Predicate<Row> = (item: Item<Row>) => boolean;

function datePredicate<Row>(column: DataTableColumn<Row>, filter: { from?: string | null; to?: string | null }, timezone: string): Predicate<Row> {
  const from = filter.from ? parsePlainDate(filter.from) : null;
  const to = filter.to ? parsePlainDate(filter.to) : null;
  if (column.type === 'datetime') {
    // Calendar days in the configured zone: [start of `from`, start of the day after `to`).
    const lo = from ? toInstant(plainDateTime(from), timezone, 'compatible').epochMilliseconds : -Infinity;
    const hi = to ? toInstant(plainDateTime(addDays(to, 1)), timezone, 'compatible').epochMilliseconds : Infinity;
    return (item) => {
      const v = column.accessor(item.row);
      return isInstantLike(v) && v.epochMilliseconds >= lo && v.epochMilliseconds < hi;
    };
  }
  const lo = from ? dateKey(from) : -Infinity;
  const hi = to ? dateKey(to) : Infinity;
  return (item) => {
    const v = column.accessor(item.row);
    if (!isPlainDate(v)) return false;
    const k = dateKey(v);
    return k >= lo && k <= hi;
  };
}

function columnPredicate<Row>(column: DataTableColumn<Row>, filter: DataTableFilter, env: FilterEnvironment<Row>): Predicate<Row> {
  switch (filter.type) {
    case 'text': {
      const texts = env.text(column);
      const needle = filter.value.toLocaleLowerCase(env.locale);
      const op = filter.operator ?? 'contains';
      if (op === 'equals') return (item) => texts[item.index] === needle;
      if (op === 'startsWith') return (item) => texts[item.index]?.startsWith(needle) === true;
      return (item) => texts[item.index]?.includes(needle) === true;
    }
    case 'number': {
      const min = filter.min ?? -Infinity;
      const max = filter.max ?? Infinity;
      const type = column.type ?? 'number';
      return (item) => {
        const k = sortKey(type, column.accessor(item.row));
        return typeof k === 'number' && k >= min && k <= max;
      };
    }
    case 'date':
      return datePredicate(column, filter, env.timezone);
    case 'enum': {
      const values = new Set(filter.values);
      return (item) => values.has(plainText(column.accessor(item.row)));
    }
  }
}

/**
 * One predicate for all active filters and the global search (every search term
 * must appear in some searchable column), or null when nothing filters.
 */
export function compileFilter<Row>(
  filters: ReadonlyMap<string, DataTableFilter>,
  search: string,
  columns: ReadonlyMap<string, DataTableColumn<Row>>,
  searchColumns: readonly DataTableColumn<Row>[],
  env: FilterEnvironment<Row>,
): Predicate<Row> | null {
  const predicates: Predicate<Row>[] = [];
  for (const [id, filter] of filters) {
    const column = columns.get(id);
    if (column) predicates.push(columnPredicate(column, filter, env));
  }
  const terms = search.toLocaleLowerCase(env.locale).split(/\s+/).filter((t) => t !== '');
  if (terms.length > 0) {
    const texts = searchColumns.map((c) => env.text(c));
    predicates.push((item) => terms.every((term) => texts.some((t) => t[item.index]?.includes(term) === true)));
  }
  if (predicates.length === 0) return null;
  const [only] = predicates;
  if (predicates.length === 1 && only) return only;
  return (item) => predicates.every((p) => p(item));
}
