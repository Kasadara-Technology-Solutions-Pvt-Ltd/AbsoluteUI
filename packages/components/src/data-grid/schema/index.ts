/**
 * @absoluteui/components/data-grid/schema (R11-19, G10e): the grid's view state as a JSON Schema
 * (draft 2020-12) with its real column ids, filter kinds, groups, and pivot aggregates, so a tool such as
 * an AI assistant can propose a view; `applyState` passes the proposal to `setState`, which validates it.
 * View state only: no row data, no edits, no row ids (selection and pinned rows stay with the user).
 */
import { AbsoluteUIError } from '@absoluteui/core';
import type { DataGrid } from '../data-grid.js';
import { DATE_OPERATORS, NUMBER_OPERATORS, TEXT_OPERATORS, type DataGridFilterKind } from '../filter.js';
import { PIVOT_AGGREGATES } from '../pivot.js';

/** A JSON Schema object (plain JSON). */
export type JsonSchema = Readonly<Record<string, unknown>>;

const ISO_DATE = '^\\d{4}-\\d{2}-\\d{2}$';

function filterSchema(kind: DataGridFilterKind): JsonSchema {
  const join = { enum: ['and', 'or'] };
  switch (kind) {
    case 'text':
      return { type: 'object', additionalProperties: false, required: ['kind', 'conditions'], properties: { kind: { const: 'text' }, join, conditions: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['operator'], properties: { operator: { enum: TEXT_OPERATORS }, value: { type: 'string', maxLength: 1000 } } } } } };
    case 'number':
      return { type: 'object', additionalProperties: false, required: ['kind', 'conditions'], properties: { kind: { const: 'number' }, join, conditions: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['operator'], properties: { operator: { enum: NUMBER_OPERATORS }, value: { type: 'number' }, to: { type: 'number', description: 'Upper bound of between (inclusive).' } } } } } };
    case 'bigint':
      return { type: 'object', additionalProperties: false, required: ['kind', 'conditions'], properties: { kind: { const: 'bigint' }, join, conditions: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['operator'], properties: { operator: { enum: NUMBER_OPERATORS }, value: { type: 'string', pattern: '^-?\\d+$' }, to: { type: 'string', pattern: '^-?\\d+$' } } } } } };
    case 'date':
      return { type: 'object', additionalProperties: false, required: ['kind', 'conditions'], properties: { kind: { const: 'date' }, join, conditions: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['operator'], properties: { operator: { enum: DATE_OPERATORS, description: 'Relative operators (today, thisMonth, lastDays, ...) use the grid time zone; workingDay and the business-day operators use the column business calendar.' }, value: { type: 'string', pattern: ISO_DATE }, to: { type: 'string', pattern: ISO_DATE }, count: { type: 'integer', minimum: 1, maximum: 3660, description: 'For lastDays, nextDays, lastBusinessDays, nextBusinessDays.' } } } } } };
    case 'boolean':
      return { type: 'object', additionalProperties: false, required: ['kind', 'value'], properties: { kind: { const: 'boolean' }, value: { type: ['boolean', 'null'] } } };
    case 'set':
      return { type: 'object', additionalProperties: false, required: ['kind', 'values'], properties: { kind: { const: 'set' }, values: { type: 'array', maxItems: 1000, items: { type: ['string', 'null'] }, description: 'The displayed texts to keep (null keeps blanks).' } } };
  }
}

/** The grid's columns as the schema sees them. */
function columnsOf<Row>(grid: DataGrid<Row>): { id: string; header: string; type: string; filter: DataGridFilterKind | null; sortable: boolean; groupable: boolean }[] {
  return grid.getExportData({ columns: 'all', rows: 'page' }).columns
    .filter((c) => !c.id.startsWith('aui-'))
    .map((c) => ({ id: c.id, header: c.header, type: c.def.type ?? 'text', filter: c.def.filter ?? null, sortable: c.def.sortable !== false, groupable: c.def.groupable === true }));
}

/**
 * A JSON Schema of the view state `setState` accepts for this grid (draft 2020-12): sort, columns (order,
 * widths, pinning, visibility, collapsed groups, header names), paging, column filters by their kinds, the
 * quick filter, grouping and expansion, master/detail expansion, and the pivot. Column ids are enumerated;
 * the description lists each column's header and type.
 */
export function dataGridStateSchema<Row>(grid: DataGrid<Row>): JsonSchema {
  const columns = columnsOf(grid);
  const ids = columns.map((c) => c.id);
  const data = grid.getExportData({ columns: 'all', rows: 'page' });
  const groups = [...new Set(data.headerRows.flat().flatMap((h) => (h.id === null ? [] : [h.id])))];
  const label = grid.host.querySelector('[role="grid"], [role="treegrid"]')?.getAttribute('aria-label') ?? 'Data grid';
  const idList = { type: 'array', uniqueItems: true, items: { enum: ids } };
  const filters = Object.fromEntries(columns.flatMap((c) => (c.filter ? [[c.id, filterSchema(c.filter)]] : [])));
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: `View state of "${label}"`,
    description: `Pass an object of this shape to setState; sections left out stay as they are. Columns: ${columns.map((c) => `${c.id} ("${c.header}", ${c.type}${c.filter ? `, ${c.filter} filter` : ''}${c.groupable ? ', groupable' : ''})`).join('; ')}.`,
    type: 'object',
    additionalProperties: false,
    properties: {
      version: { const: 1 },
      sort: { type: 'array', description: 'Sort keys by priority.', items: { type: 'object', additionalProperties: false, required: ['column', 'direction'], properties: { column: { enum: columns.filter((c) => c.sortable).map((c) => c.id) }, direction: { enum: ['ascending', 'descending'] } } } },
      columns: {
        type: 'object',
        additionalProperties: false,
        properties: {
          order: { ...idList, description: 'Column ids in display order.' },
          widths: { type: 'object', propertyNames: { enum: ids }, additionalProperties: { type: 'number', exclusiveMinimum: 0 }, description: 'Widths in CSS pixels.' },
          pinned: { type: 'object', propertyNames: { enum: ids }, additionalProperties: { enum: ['start', 'end', null] } },
          hidden: { ...idList, description: 'Hidden column ids (one column always stays visible).' },
          collapsedGroups: { type: 'array', uniqueItems: true, items: { enum: groups } },
          headers: { type: 'object', propertyNames: { enum: ids }, additionalProperties: { type: 'string', minLength: 1, maxLength: 200 }, description: 'Header names set by the user.' },
        },
      },
      page: { type: 'integer', minimum: 1, description: '1-based page when paging is on.' },
      pageSize: { type: ['integer', 'null'], minimum: 1, maximum: 1_000_000 },
      filters: { type: 'object', additionalProperties: false, properties: filters, description: 'Column filters by column id (columns without a filter kind cannot be filtered); the object replaces all column filters.' },
      quickFilter: { type: 'string', maxLength: 1000, description: 'Text matched against every searchable column.' },
      groupBy: { type: 'array', maxItems: 20, uniqueItems: true, items: { enum: columns.filter((c) => c.groupable).map((c) => c.id) } },
      expanded: { type: 'object', additionalProperties: { type: 'boolean' }, description: 'Group rows expanded or collapsed, by group id.' },
      details: { type: 'object', additionalProperties: { type: 'boolean' }, description: 'Master/detail rows expanded or collapsed, by row id.' },
      pivot: {
        description: 'Pivot mode: the row and column fields and the values to aggregate, or null to leave pivot mode.',
        oneOf: [
          { type: 'null' },
          { type: 'object', additionalProperties: false, required: ['rows', 'columns', 'values'], properties: { rows: idList, columns: idList, values: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['column', 'aggregate'], properties: { column: { enum: ids }, aggregate: { enum: PIVOT_AGGREGATES } } } } } },
        ],
      },
    },
  };
}

/** A short English description of the current view (for a tool's context, not for display). */
export function describeState<Row>(grid: DataGrid<Row>): string {
  const state = grid.getState();
  const columns = columnsOf(grid);
  const name = (id: string): string => columns.find((c) => c.id === id)?.header ?? id;
  const label = grid.host.querySelector('[role="grid"], [role="treegrid"]')?.getAttribute('aria-label') ?? 'Data grid';
  const parts: string[] = [`${label}: ${String(grid.filteredRowCount)} rows match.`];
  if (state.sort.length > 0) parts.push(`Sorted by ${state.sort.map((s) => `${name(s.column)} ${s.direction}`).join(', then ')}.`);
  const filtered = Object.keys(state.filters);
  if (filtered.length > 0) parts.push(`Filtered on ${filtered.map(name).join(', ')}.`);
  if (state.quickFilter !== '') parts.push(`Quick filter "${state.quickFilter}".`);
  if (state.groupBy.length > 0) parts.push(`Grouped by ${state.groupBy.map(name).join(', then ')}.`);
  if (state.pivot) parts.push(`Pivot: rows ${state.pivot.rows.map(name).join(', ') || 'none'}; columns ${state.pivot.columns.map(name).join(', ') || 'none'}; values ${state.pivot.values.map((v) => `${v.aggregate} of ${name(v.column)}`).join(', ') || 'none'}.`);
  if (state.columns.hidden.length > 0) parts.push(`Hidden columns: ${state.columns.hidden.map(name).join(', ')}.`);
  if (state.pageSize !== null) parts.push(`Page ${String(state.page)} of ${String(Math.max(1, Math.ceil(grid.filteredRowCount / state.pageSize)))} (${String(state.pageSize)} rows per page).`);
  return parts.join(' ');
}

/** Apply a proposed view state; returns the validation message instead of throwing (for tool loops). */
export function applyState<Row>(grid: DataGrid<Row>, state: unknown): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  try {
    grid.setState(state);
    return { ok: true };
  } catch (e) {
    // Validation errors go back to the caller; anything else is a bug and is thrown.
    if (e instanceof AbsoluteUIError) return { ok: false, error: e.message };
    throw e;
  }
}
