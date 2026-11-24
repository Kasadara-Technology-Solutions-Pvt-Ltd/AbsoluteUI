/**
 * Data Grid cell ranges and clipboard text (docs/PLAN-R11-G3.md, G3b): range validation and
 * resolution to display positions, and Excel-compatible text (tab-separated, quoted where
 * needed) plus an HTML table for rich clipboard targets. No HTML is parsed; text is escaped.
 */
import { configurationError } from '@absoluteui/core';

/** A rectangle of cells by row and column ids (corners in any order). JSON-safe. */
export interface DataGridCellRange {
  readonly startRow: string;
  readonly endRow: string;
  readonly startColumn: string;
  readonly endColumn: string;
}

/** A range resolved to inclusive display positions. */
export interface RangeRect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate an untrusted range (shape only; ids are resolved by the grid). */
export function parseRange(value: unknown, path: string): DataGridCellRange {
  const keys = ['startRow', 'endRow', 'startColumn', 'endColumn'] as const;
  if (!isRecord(value) || !keys.every((k) => typeof value[k] === 'string')) {
    throw configurationError('DATA_GRID_OPTIONS', 'Invalid data grid options.', { component: 'dataGrid', property: `dataGrid.${path}`, expected: '{ startRow, endRow, startColumn, endColumn } (ids)' });
  }
  return { startRow: String(value.startRow), endRow: String(value.endRow), startColumn: String(value.startColumn), endColumn: String(value.endColumn) };
}

/** Display positions of a range, or null when a corner is not displayed. */
export function resolveRange(range: DataGridCellRange, rowIndex: (id: string) => number | undefined, columnIndex: (id: string) => number | undefined): RangeRect | null {
  const r1 = rowIndex(range.startRow);
  const r2 = rowIndex(range.endRow);
  const c1 = columnIndex(range.startColumn);
  const c2 = columnIndex(range.endColumn);
  if (r1 === undefined || r2 === undefined || c1 === undefined || c2 === undefined) return null;
  return { top: Math.min(r1, r2), bottom: Math.max(r1, r2), left: Math.min(c1, c2), right: Math.max(c1, c2) };
}

/** Tab-separated text: values with tabs, line breaks, or quotes are quoted (quotes doubled). */
export function toTsv(rows: readonly (readonly string[])[]): string {
  const cell = (v: string): string => (/[\t\n\r"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join('\t')).join('\r\n');
}

const escapeHtml = (v: string): string => v.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));

/** An HTML table of the same cells; the first `headerRows` rows are header cells. */
export function toHtmlTable(rows: readonly (readonly string[])[], headerRows: number): string {
  const body = rows.map((r, i) => `<tr>${r.map((v) => (i < headerRows ? `<th>${escapeHtml(v)}</th>` : `<td>${escapeHtml(v)}</td>`)).join('')}</tr>`).join('');
  return `<table>${body}</table>`;
}
