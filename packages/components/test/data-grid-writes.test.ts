import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { plainDate, resetAbsoluteUIConfig, type PlainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { DataGrid, type DataGridCellsChangeDetail, type DataGridOptions } from '@absoluteui/components/data-grid';
import { fillSeries, parseLocaleDate, parseLocaleNumber, parseTsv } from '../src/data-grid/writes.js';

// docs/PLAN-R11-G3.md (G3c, R11-13): paste, cut, Delete, fill.
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = [
    '.aui-data-grid{display:flex;flex-direction:column;block-size:400px;inline-size:700px}',
    '.aui-data-grid__viewport{flex:1 1 auto;overflow:auto;min-block-size:0;position:relative}',
    '.aui-data-grid__head{position:sticky;top:0;z-index:3;background:#fff}',
    '.aui-data-grid__header-row{display:flex;block-size:40px}',
    '.aui-data-grid__header-cell{flex:none;box-sizing:border-box;overflow:hidden;position:relative}',
    '.aui-data-grid__body{position:relative}',
    '.aui-data-grid__row{position:absolute;display:flex;inset-inline-start:0;box-sizing:border-box}',
    '.aui-data-grid__cell{flex:none;box-sizing:border-box;overflow:hidden;white-space:nowrap}',
    '.aui-data-grid__cell--range{position:relative}',
    '.aui-data-grid__fill-handle{position:absolute;inset-block-end:0;inset-inline-end:0;inline-size:8px;block-size:8px}',
    '.aui-data-grid__spacer{flex:none}',
  ].join('\n');
  document.head.append(style);
});

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

describe('write helpers', () => {
  it('parses tab-separated text with quotes and line breaks', () => {
    expect(parseTsv('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseTsv('"x\ty"\t"say ""hi"""\n"two\nlines"\tz')).toEqual([['x\ty', 'say "hi"'], ['two\nlines', 'z']]);
    expect(parseTsv('only')).toEqual([['only']]);
    expect(parseTsv('')).toEqual([]);
  });

  it('parses numbers and dates in the locale', () => {
    expect(parseLocaleNumber('1,234.5', 'en-US')).toBe(1234.5);
    expect(parseLocaleNumber('1.234,5', 'de-DE')).toBe(1234.5);
    expect(parseLocaleNumber('$1,000.00', 'en-US')).toBe(1000);
    expect(parseLocaleNumber('(12)', 'en-US')).toBe(-12);
    expect(parseLocaleNumber('-3', 'en-US')).toBe(-3);
    expect(parseLocaleNumber('12abc3', 'en-US')).toBe(123);
    expect(parseLocaleNumber('x', 'en-US')).toBeNull();
    const date = (d: PlainDate | null): string => (d ? `${String(d.year)}-${String(d.month)}-${String(d.day)}` : 'null');
    expect(date(parseLocaleDate('2026-01-05', 'en-US'))).toBe('2026-1-5');
    expect(date(parseLocaleDate('Jan 5, 2026', 'en-US'))).toBe('2026-1-5');
    expect(date(parseLocaleDate('1/5/2026', 'en-US'))).toBe('2026-1-5');
    expect(date(parseLocaleDate('05.01.2026', 'de-DE'))).toBe('2026-1-5');
    expect(date(parseLocaleDate(`5 janv. 2026`, 'fr-FR'))).toBe('2026-1-5');
    expect(date(parseLocaleDate('2/31/2026', 'en-US'))).toBe('null');
    expect(date(parseLocaleDate('soon', 'en-US'))).toBe('null');
  });

  it('continues linear series, repeats text and single values, and counts with business days', () => {
    expect(fillSeries([1, 3], 3)).toEqual([5, 7, 9]);
    expect(fillSeries([1, 3], 2, { backwards: true })).toEqual([-1, -3]);
    expect(fillSeries([7], 2)).toEqual([7, 7]);
    expect(fillSeries([7], 2, { increment: true })).toEqual([8, 9]);
    expect(fillSeries([1, 3], 3, { repeat: true })).toEqual([1, 3, 1]);
    expect(fillSeries(['a', 'b'], 3)).toEqual(['a', 'b', 'a']);
    const days = fillSeries([plainDate(2026, 1, 30), plainDate(2026, 1, 31)], 2) as PlainDate[];
    expect(days.map((d) => `${String(d.month)}-${String(d.day)}`)).toEqual(['2-1', '2-2']);
    // Friday 2 and Monday 5 January 2026 are one working day apart: the series continues on working days.
    const calendar = createBusinessCalendar({});
    const work = fillSeries([plainDate(2026, 1, 2), plainDate(2026, 1, 5)], 2, { calendar }) as PlainDate[];
    expect(work.map((d) => `${String(d.month)}-${String(d.day)}`)).toEqual(['1-6', '1-7']);
  });
});

interface P {
  id: string;
  name: string;
  qty: number | null;
  code: string;
}
const base: P[] = [
  { id: 'a', name: 'Ann', qty: 1, code: 'X1' },
  { id: 'b', name: 'Bob', qty: 2, code: 'X2' },
  { id: 'c', name: 'Cid', qty: 3, code: 'X3' },
  { id: 'd', name: 'Dee', qty: 4, code: 'X4' },
];

function mount(options: Partial<DataGridOptions<P>> = {}): { grid: DataGrid<P>; rows: P[]; seen: DataGridCellsChangeDetail[] } {
  const host = document.createElement('div');
  document.body.append(host);
  const rows = base.map((r) => ({ ...r }));
  const grid = DataGrid.create(host, {
    label: 'Stock',
    rows,
    rowId: (r) => r.id,
    rowHeight: 30,
    locale: 'en-US',
    cellSelection: { fillHandle: true },
    columns: [
      { id: 'name', header: 'Name', field: 'name', editable: true, width: 150 },
      { id: 'qty', header: 'Qty', field: 'qty', type: 'number', editable: true, width: 120 },
      { id: 'code', header: 'Code', field: 'code', width: 120 },
    ],
    ...options,
  });
  const seen: DataGridCellsChangeDetail[] = [];
  host.addEventListener('aui-cells-change', (e) => seen.push((e as CustomEvent<DataGridCellsChangeDetail>).detail));
  return { grid, rows, seen };
}
const cell = (g: DataGrid<P>, id: string, column: string): HTMLElement => g.host.querySelector<HTMLElement>(`.aui-data-grid__row[data-row-id="${id}"] [data-column="${column}"]`)!;
const text = (g: DataGrid<P>, id: string, column: string): string => cell(g, id, column).textContent;
function paste(data: string): void {
  const t = new DataTransfer();
  t.setData('text/plain', data);
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true }));
}

describe('grid writes', () => {
  it('paste writes editable cells as new rows, skips read-only columns, and reports rejected text', () => {
    const { grid, rows, seen } = mount();
    cell(grid, 'a', 'name').focus();
    paste('Ana\t10\tZZ\r\nBo\tmany\tZZ');
    expect([text(grid, 'a', 'name'), text(grid, 'a', 'qty'), text(grid, 'b', 'name'), text(grid, 'b', 'qty')]).toEqual(['Ana', '10', 'Bo', '2']);
    // Code is not editable; rows are never mutated.
    expect(text(grid, 'a', 'code')).toBe('X1');
    expect(rows[0]).toEqual({ id: 'a', name: 'Ann', qty: 1, code: 'X1' });
    const detail = seen.at(-1);
    expect(detail?.source).toBe('paste');
    expect(detail?.applied).toBe(true);
    expect(detail?.changes).toEqual([
      { rowId: 'a', column: 'name', oldValue: 'Ann', newValue: 'Ana' },
      { rowId: 'a', column: 'qty', oldValue: 1, newValue: 10 },
      { rowId: 'b', column: 'name', oldValue: 'Bob', newValue: 'Bo' },
    ]);
    expect(detail?.rejected).toEqual([{ rowId: 'b', column: 'qty', text: 'many' }]);
    // The pasted area becomes the range.
    expect(grid.getCellRanges()).toEqual([{ startRow: 'a', endRow: 'b', startColumn: 'name', endColumn: 'code' }]);
  });

  it('tiles a block that divides the range; Delete clears; cut copies then clears', async () => {
    const { grid, seen } = mount();
    grid.addCellRange({ startRow: 'a', endRow: 'd', startColumn: 'qty', endColumn: 'qty' });
    cell(grid, 'a', 'qty').focus();
    paste('7\r\n8');
    expect(['a', 'b', 'c', 'd'].map((id) => text(grid, id, 'qty'))).toEqual(['7', '8', '7', '8']);
    await userEvent.keyboard('{Delete}');
    expect(['a', 'b', 'c', 'd'].map((id) => text(grid, id, 'qty'))).toEqual(['', '', '', '']);
    expect(seen.at(-1)?.source).toBe('delete');
    grid.clearCellRanges();
    cell(grid, 'c', 'name').focus();
    const t = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent('cut', { clipboardData: t, bubbles: true, cancelable: true }));
    expect(t.getData('text/plain')).toBe('Cid');
    expect(text(grid, 'c', 'name')).toBe('');
    expect(seen.at(-1)?.source).toBe('cut');
  });

  it('Ctrl+D fills down and Ctrl+R fills right (converting between column types)', async () => {
    const { grid } = mount({ columns: [
      { id: 'name', header: 'Name', field: 'name', editable: true, width: 150 },
      { id: 'qty', header: 'Qty', field: 'qty', type: 'number', editable: true, width: 120 },
      { id: 'code', header: 'Code', field: 'code', editable: true, width: 120 },
    ] });
    cell(grid, 'a', 'qty').focus();
    await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}{Control>}d{/Control}');
    expect(['a', 'b', 'c'].map((id) => text(grid, id, 'qty'))).toEqual(['1', '1', '1']);
    grid.clearCellRanges();
    cell(grid, 'd', 'qty').focus();
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}{Control>}r{/Control}');
    expect(text(grid, 'd', 'code')).toBe('4');
  });

  it('keeps focus when the focused row is replaced by an update', () => {
    const { grid } = mount();
    cell(grid, 'b', 'qty').focus();
    grid.applyTransaction({ update: [{ id: 'b', name: 'Bob', qty: 99, code: 'X2' }] });
    expect(document.activeElement).toBe(cell(grid, 'b', 'qty'));
    expect(text(grid, 'b', 'qty')).toBe('99');
  });

  it('readOnlyEdits only requests the change', () => {
    const { grid, seen } = mount({ readOnlyEdits: true });
    cell(grid, 'a', 'name').focus();
    paste('Zed');
    expect(text(grid, 'a', 'name')).toBe('Ann');
    expect(seen.at(-1)).toEqual({ changes: [{ rowId: 'a', column: 'name', oldValue: 'Ann', newValue: 'Zed' }], source: 'paste', applied: false, rejected: [] });
  });

  it('fill handle: drag continues the series; double-click fills to the last row; shrinking clears', async () => {
    const { grid } = mount();
    grid.addCellRange({ startRow: 'a', endRow: 'b', startColumn: 'qty', endColumn: 'qty' });
    const handle = (): HTMLElement => g().querySelector<HTMLElement>('.aui-data-grid__fill-handle')!;
    const g = (): HTMLElement => grid.host;
    expect(handle().closest('[data-column]')).toBe(cell(grid, 'b', 'qty'));
    expect(handle().getAttribute('aria-hidden')).toBe('true');
    const at = (el: HTMLElement): { x: number; y: number } => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const drag = (to: HTMLElement): void => {
      const from = at(handle());
      handle().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: from.x, clientY: from.y, pointerId: 2, button: 0, isPrimary: true }));
      const end = at(to);
      for (const f of [0.5, 1]) document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: from.x + (end.x - from.x) * f, clientY: from.y + (end.y - from.y) * f, pointerId: 2, isPrimary: true }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: end.x, clientY: end.y, pointerId: 2, isPrimary: true }));
    };
    // 1, 2 continue as 3, 4 (unchanged here) - first change the values so the series is visible.
    cell(grid, 'a', 'qty').focus();
    paste('10\r\n20');
    drag(cell(grid, 'd', 'qty'));
    expect(['a', 'b', 'c', 'd'].map((id) => text(grid, id, 'qty'))).toEqual(['10', '20', '30', '40']);
    expect(grid.getCellRanges()).toEqual([{ startRow: 'a', endRow: 'd', startColumn: 'qty', endColumn: 'qty' }]);
    await new Promise((r) => setTimeout(r, 10));
    drag(cell(grid, 'b', 'qty'));
    expect(['a', 'b', 'c', 'd'].map((id) => text(grid, id, 'qty'))).toEqual(['10', '20', '', '']);
    await new Promise((r) => setTimeout(r, 10));
    grid.clearCellRanges();
    grid.addCellRange({ startRow: 'a', endRow: 'a', startColumn: 'name', endColumn: 'name' });
    handle().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(['a', 'b', 'c', 'd'].map((id) => text(grid, id, 'name'))).toEqual(['Ann', 'Ann', 'Ann', 'Ann']);
  });
});
