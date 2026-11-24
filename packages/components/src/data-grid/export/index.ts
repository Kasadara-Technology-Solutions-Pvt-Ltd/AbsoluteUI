/**
 * @absoluteui/components/data-grid/export (R11-17, G8b): Excel export for the Data Grid, outside the
 * core bundle. `toXlsx(grid)` writes one sheet; `xlsxSheet` and `writeXlsx` build workbooks with
 * several sheets. Styles come from explicit options (never from computed CSS).
 */
import { isInstantLike, isPlainDate } from '../../data-table/model.js';
import { toPlainDateTime } from '@absoluteui/core';
import type { DataGrid, DataGridExportOptions } from '../data-grid.js';
import { cellRef, columnName, excelSerial, writeXlsx, type XlsxCell, type XlsxImage, type XlsxProtection, type XlsxRow, type XlsxSheet, type XlsxStyle, type XlsxValue } from './xlsx.js';

export { writeXlsx, protectionHash, columnName, cellRef, type XlsxBorder, type XlsxCell, type XlsxImage, type XlsxProtection, type XlsxRow, type XlsxSheet, type XlsxStyle, type XlsxValue, type XlsxWorkbook } from './xlsx.js';

export interface DataGridXlsxOptions extends DataGridExportOptions {
  /** Sheet name (default: the grid's label). */
  readonly sheetName?: string;
  /** The header row (and the column group rows above it). Default true. */
  readonly header?: boolean;
  /** Column group rows above the header (merged across their columns). Default true. */
  readonly columnGroups?: boolean;
  /** Named styles for columns' `excel.style` and `excel.cellStyle`. */
  readonly styles?: Readonly<Record<string, XlsxStyle>>;
  /** Default: bold on a light gray fill with a bottom border. */
  readonly headerStyle?: XlsxStyle;
  /** Default: bold. */
  readonly groupStyle?: XlsxStyle;
  /** Default: bold with a top border. */
  readonly totalStyle?: XlsxStyle;
  /** Freeze the header rows and the start-pinned columns. Default true. */
  readonly freeze?: boolean;
  /** Row outline levels for groups and tree levels, collapsed like the grid. Default true. */
  readonly outline?: boolean;
  /** An AutoFilter on the header row. Default false. */
  readonly autoFilter?: boolean;
  /** Default `yyyy-mm-dd`. */
  readonly dateFormat?: string;
  /** Default `yyyy-mm-dd hh:mm` (in the grid's time zone). */
  readonly dateTimeFormat?: string;
  readonly protection?: XlsxProtection;
  /** Right-to-left sheet (default: the grid's direction). */
  readonly rightToLeft?: boolean;
}

export interface DataGridXlsxFileOptions extends DataGridXlsxOptions {
  /** Document title and author (docProps). */
  readonly title?: string;
  readonly creator?: string;
}

const HEADER: XlsxStyle = { bold: true, fill: '#F2F2F2', borderBottom: 'thin', borderColor: '#BFBFBF' };
const GROUP: XlsxStyle = { bold: true };
const TOTAL: XlsxStyle = { bold: true, borderTop: 'thin', borderColor: '#808080' };

function fail(property: string, expected: string): never {
  throw new TypeError(`Invalid Excel export: ${property} must be ${expected}.`);
}

/** An Excel currency format for a currency in a locale: the symbol where the locale puts it, its decimals. */
export function currencyFormat(currency: string, locale: string): string {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const parts = format.formatToParts(1234.5);
  const decimals = format.resolvedOptions().maximumFractionDigits ?? 2;
  const symbolAt = parts.findIndex((p) => p.type === 'currency');
  const numberAt = parts.findIndex((p) => p.type === 'integer');
  const symbol = parts[symbolAt]?.value ?? currency;
  const before = symbolAt < numberAt;
  const gap = parts.slice(Math.min(symbolAt, numberAt) + 1, Math.max(symbolAt, numberAt)).some((p) => p.type === 'literal') ? ' ' : '';
  const pattern = `#,##0${decimals > 0 ? `.${'0'.repeat(decimals)}` : ''}`;
  const quoted = `"${(before ? symbol + gap : gap + symbol).replace(/"/g, '')}"`;
  return before ? quoted + pattern : pattern + quoted;
}

function assertOptions(o: DataGridXlsxOptions): void {
  const v: unknown = o;
  if (typeof v !== 'object' || v === null) fail('options', 'an object');
  for (const key of ['header', 'columnGroups', 'freeze', 'outline', 'autoFilter', 'rightToLeft'] as const) if (o[key] !== undefined && typeof o[key] !== 'boolean') fail(key, 'a boolean');
  for (const key of ['sheetName', 'dateFormat', 'dateTimeFormat'] as const) if (o[key] !== undefined && typeof o[key] !== 'string') fail(key, 'a string');
  const styles: unknown = o.styles;
  if (styles !== undefined && (typeof styles !== 'object' || styles === null)) fail('styles', 'an object of named styles');
}

/**
 * One sheet of a grid's rows: the same row and column choices as `toCsv`, typed values (numbers,
 * booleans, dates as Excel dates in the grid's time zone, text never as formulas), number formats from
 * the column types, group and tree outlines, frozen header rows and start-pinned columns, merged
 * column group headers, and the columns' `excel` options (styles, formulas, links, images, widths).
 */
export function xlsxSheet<Row>(grid: DataGrid<Row>, options: DataGridXlsxOptions = {}): XlsxSheet {
  assertOptions(options);
  const data = grid.getExportData({ ...options, text: 'needed' });
  const currencies = new Map<string, string>();
  const currency = (code: string): string => {
    let f = currencies.get(code);
    if (f === undefined) {
      f = currencyFormat(code, data.locale);
      currencies.set(code, f);
    }
    return f;
  };
  const named = options.styles ?? {};
  const styleNamed = (name: string | undefined, at: string): XlsxStyle | undefined => {
    if (name === undefined) return undefined;
    const s = Object.prototype.hasOwnProperty.call(named, name) ? named[name] : undefined;
    if (!s) fail(at, `a name in styles ("${name}" is not defined)`);
    return s;
  };
  const headerStyle = options.headerStyle ?? HEADER;
  const dateFormat = options.dateFormat ?? 'yyyy-mm-dd';
  const dateTimeFormat = options.dateTimeFormat ?? 'yyyy-mm-dd hh:mm';
  const ids = data.columns.map((c) => c.id);
  const rows: XlsxRow[] = [];
  const merges: { top: number; left: number; bottom: number; right: number }[] = [];
  const images: XlsxImage[] = [];
  if (options.header !== false) {
    if (options.columnGroups !== false) {
      for (const run of data.headerRows) {
        const r = rows.length;
        const cells: (XlsxCell | null)[] = [];
        for (const cell of run) {
          if (cell.span > 1 && cell.id !== null) merges.push({ top: r, left: cells.length, bottom: r, right: cells.length + cell.span - 1 });
          cells.push({ value: cell.text === '' ? null : cell.text, style: { ...headerStyle, align: 'center' } });
          for (let i = 1; i < cell.span; i++) cells.push({ value: null, style: headerStyle });
        }
        rows.push({ cells });
      }
    }
    rows.push({ cells: data.columns.map((c) => ({ value: c.header, style: headerStyle })) });
  }
  const headerCount = rows.length;
  const outline = options.outline !== false;
  for (const row of data.rows) {
    const r = rows.length;
    const kindStyle = row.kind === 'group' ? (options.groupStyle ?? GROUP) : row.kind === 'total' ? (options.totalStyle ?? TOTAL) : undefined;
    const cells = row.cells.map((cell, c): XlsxCell => {
      const column = data.columns[c];
      const def = column?.def;
      const x = def?.excel;
      const isData = row.kind === 'data' && row.row !== null;
      const named = isData && def ? styleNamed((x?.cellStyle ? x.cellStyle(row.row) : undefined) ?? x?.style, `columns.${def.id}.excel.style`) : undefined;
      let value: XlsxValue;
      let numberFormat: string | undefined = x?.numberFormat;
      const v = cell.value;
      if (typeof v === 'number') {
        value = Number.isFinite(v) ? v : null;
        if (cell.percent) numberFormat ??= '0.0%';
        else if (def?.type === 'currency' && !(row.kind !== 'data' && def.aggregate === 'count')) numberFormat ??= currency(def.currency ?? 'USD');
      } else if (typeof v === 'boolean') value = v;
      else if (isPlainDate(v)) {
        value = excelSerial(v.year, v.month, v.day);
        numberFormat ??= dateFormat;
      } else if (isInstantLike(v)) {
        const p = toPlainDateTime(v, data.timezone);
        value = excelSerial(p.date.year, p.date.month, p.date.day, p.time.hour, p.time.minute, p.time.second, p.time.millisecond);
        numberFormat ??= dateTimeFormat;
      } else if (typeof v === 'string') value = v;
      else value = v === null || v === undefined ? null : cell.text;
      // Group and tree labels are indented by level (an Excel indent, not spaces).
      const indent = def && def.id.startsWith('aui-group') && row.level > 0 ? { indent: Math.min(15, row.level) } : {};
      const style: XlsxStyle = { ...kindStyle, ...named, ...indent, ...(numberFormat ? { numberFormat } : {}) };
      const out: { value: XlsxValue; style?: XlsxStyle; formula?: string; link?: string } = { value };
      if (Object.keys(style).length > 0) out.style = style;
      if (isData && def && x) {
        if (x.formula) {
          const formula = x.formula(row.row, (id) => {
            const i = ids.indexOf(id);
            return i < 0 ? '#REF!' : cellRef(r, i);
          });
          if (typeof formula === 'string' && formula !== '') out.formula = formula;
        }
        const link = x.link?.(row.row);
        if (typeof link === 'string' && link !== '') out.link = link;
        const image = x.image?.(row.row);
        if (image) images.push({ row: r, column: c, bytes: image.bytes, type: image.type, width: image.width, height: image.height, ...(image.alt === undefined ? {} : { alt: image.alt }) });
      }
      return out;
    });
    rows.push({ cells, ...(outline && row.level > 0 ? { outlineLevel: row.level } : {}), ...(outline && row.hidden ? { hidden: true } : {}), ...(outline && row.collapsed ? { collapsed: true } : {}) });
  }
  let frozenColumns = 0;
  while (frozenColumns < data.columns.length && data.columns[frozenColumns]?.pinned === 'start') frozenColumns++;
  const direction = options.rightToLeft ?? (typeof getComputedStyle === 'function' && getComputedStyle(grid.host).direction === 'rtl');
  const sheet: XlsxSheet = {
    name: options.sheetName ?? grid.host.querySelector('[role="grid"], [role="treegrid"]')?.getAttribute('aria-label') ?? 'Sheet1',
    widths: data.columns.map((c) => c.def.excel?.width ?? Math.max(4, Math.min(100, Math.round(c.width / 7)))),
    rows,
    ...(options.freeze === false ? {} : { freeze: { rows: headerCount, columns: frozenColumns } }),
    ...(merges.length > 0 ? { merges } : {}),
    ...(options.autoFilter === true && headerCount > 0 && data.columns.length > 0 ? { autoFilter: { top: headerCount - 1, left: 0, bottom: Math.max(headerCount - 1, rows.length - 1), right: data.columns.length - 1 } } : {}),
    ...(images.length > 0 ? { images } : {}),
    ...(options.protection ? { protection: options.protection } : {}),
    ...(direction ? { rightToLeft: true } : {}),
  };
  return sheet;
}

/** The grid as a one-sheet .xlsx Blob. Several grids or sheets: `writeXlsx({ sheets: [xlsxSheet(a), xlsxSheet(b)] })`. */
export function toXlsx<Row>(grid: DataGrid<Row>, options: DataGridXlsxFileOptions = {}): Promise<Blob> {
  const sheet = xlsxSheet(grid, options);
  return writeXlsx({ sheets: [sheet], ...(options.title === undefined ? {} : { title: options.title }), ...(options.creator === undefined ? {} : { creator: options.creator }) });
}

/** Column letters for a 0-based index (A, B, ... Z, AA): handy in `excel.formula` code. */
export const xlsxColumn = columnName;
