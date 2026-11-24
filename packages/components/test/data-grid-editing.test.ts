import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { instant, plainDate, resetAbsoluteUIConfig, type Instant, type PlainDate } from '@absoluteui/core';
import { DataGrid, type DataGridCellsChangeDetail, type DataGridOptions } from '@absoluteui/components/data-grid';

// docs/PLAN-R11-G4.md (G4a; R11-13, R11-14): cell editing, validation, undo/redo, bulk edit.
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = [
    '.aui-data-grid{display:flex;flex-direction:column;block-size:400px;inline-size:900px}',
    '.aui-data-grid__viewport{flex:1 1 auto;overflow:auto;min-block-size:0;position:relative}',
    '.aui-data-grid__head{position:sticky;top:0;z-index:3;background:#fff}',
    '.aui-data-grid__header-row{display:flex;block-size:40px}',
    '.aui-data-grid__header-cell{flex:none;box-sizing:border-box;overflow:hidden;position:relative}',
    '.aui-data-grid__body{position:relative}',
    '.aui-data-grid__row{position:absolute;display:flex;inset-inline-start:0;box-sizing:border-box}',
    '.aui-data-grid__cell{flex:none;box-sizing:border-box;overflow:hidden;white-space:nowrap}',
    '.aui-data-grid__spacer{flex:none}',
  ].join('\n');
  document.head.append(style);
});

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface P {
  id: string;
  name: string;
  qty: number | null;
  ok: boolean;
  due: PlainDate | null;
  at: Instant | null;
  size: string;
  note: string;
}
const base = (): P[] => [
  { id: 'a', name: 'Ann', qty: 1, ok: true, due: plainDate(2026, 1, 5), at: instant(Date.UTC(2026, 0, 5, 9, 30)), size: 'S', note: '' },
  { id: 'b', name: 'Bob', qty: 2, ok: false, due: null, at: null, size: 'M', note: '' },
  { id: 'c', name: 'Cid', qty: 3, ok: true, due: null, at: null, size: 'L', note: '' },
];

function mount(options: Partial<DataGridOptions<P>> = {}): { grid: DataGrid<P>; seen: DataGridCellsChangeDetail[] } {
  const host = document.createElement('div');
  document.body.append(host);
  const grid = DataGrid.create(host, {
    label: 'Stock',
    rows: base(),
    rowId: (r) => r.id,
    rowHeight: 30,
    locale: 'en-US',
    timezone: 'Europe/Berlin',
    columns: [
      { id: 'name', header: 'Name', field: 'name', editable: true, required: true, width: 120 },
      { id: 'qty', header: 'Qty', field: 'qty', type: 'number', editable: true, editor: { min: 0, max: 100 }, width: 80 },
      { id: 'ok', header: 'OK', field: 'ok', type: 'boolean', editable: true, width: 60 },
      { id: 'due', header: 'Due', field: 'due', type: 'date', editable: true, width: 120 },
      { id: 'at', header: 'At', field: 'at', type: 'datetime', editable: true, width: 160 },
      { id: 'size', header: 'Size', field: 'size', editable: true, editor: { kind: 'select', options: [{ value: 'S', label: 'Small' }, { value: 'M', label: 'Medium' }, { value: 'L', label: 'Large' }] }, width: 100 },
      { id: 'note', header: 'Note', field: 'note', editable: (r) => r.id !== 'c', editor: { kind: 'largeText' }, validate: (v) => (typeof v === 'string' && v.includes('!') ? 'No exclamation marks' : null), width: 120 },
    ],
    ...options,
  });
  const seen: DataGridCellsChangeDetail[] = [];
  host.addEventListener('aui-cells-change', (e) => seen.push((e as CustomEvent<DataGridCellsChangeDetail>).detail));
  return { grid, seen };
}
const cell = (g: DataGrid<P>, id: string, column: string): HTMLElement => g.host.querySelector<HTMLElement>(`.aui-data-grid__row[data-row-id="${id}"] [data-column="${column}"]`)!;
const text = (g: DataGrid<P>, id: string, column: string): string => cell(g, id, column).textContent;
const control = (): HTMLInputElement => document.querySelector<HTMLInputElement>('.aui-data-grid__editor-control')!;

describe('cell editing', () => {
  it('typing starts an edit with the typed key; Enter commits a new row value and returns focus to the cell', async () => {
    const { grid, seen } = mount();
    cell(grid, 'a', 'name').focus();
    await userEvent.keyboard('Z');
    expect(grid.editingCell).toEqual({ rowId: 'a', column: 'name' });
    expect(control().value).toBe('Z');
    expect(control().getAttribute('aria-label')).toBe('Name, Ann');
    await userEvent.keyboard('oe{Enter}');
    expect(grid.editingCell).toBeNull();
    expect(text(grid, 'a', 'name')).toBe('Zoe');
    expect(document.activeElement).toBe(cell(grid, 'a', 'name'));
    expect(seen.at(-1)).toEqual({ changes: [{ rowId: 'a', column: 'name', oldValue: 'Ann', newValue: 'Zoe' }], source: 'edit', applied: true, rejected: [] });
  });

  it('Escape cancels; F2 selects the value; Tab commits and edits the next editable cell', async () => {
    const { grid } = mount();
    cell(grid, 'b', 'name').focus();
    await userEvent.keyboard('{F2}');
    expect(control().selectionStart).toBe(0);
    expect(control().selectionEnd).toBe(3);
    await userEvent.keyboard('Xyz{Escape}');
    expect(text(grid, 'b', 'name')).toBe('Bob');
    expect(document.activeElement).toBe(cell(grid, 'b', 'name'));
    await userEvent.keyboard('{Enter}Bea{Tab}');
    expect(text(grid, 'b', 'name')).toBe('Bea');
    expect(grid.editingCell).toEqual({ rowId: 'b', column: 'qty' });
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(grid.editingCell).toEqual({ rowId: 'b', column: 'name' });
    await userEvent.keyboard('{Escape}');
  });

  it('blocks invalid values with an announced message; Escape cancels; revert mode discards', async () => {
    const { grid } = mount();
    cell(grid, 'a', 'qty').focus();
    await userEvent.keyboard('{Backspace}abc{Enter}');
    expect(grid.editingCell).toEqual({ rowId: 'a', column: 'qty' });
    expect(control().getAttribute('aria-invalid')).toBe('true');
    const error = document.getElementById(control().getAttribute('aria-describedby') ?? '')!;
    expect(error.textContent).toBe('Enter a number');
    expect(error.matches(':popover-open')).toBe(true);
    await userEvent.keyboard('{Control>}a{/Control}500{Enter}');
    expect(error.textContent).toBe('Enter 100 or less');
    await userEvent.keyboard('{Escape}');
    expect(text(grid, 'a', 'qty')).toBe('1');
    expect(document.querySelector('.aui-data-grid__edit-error')).toBeNull();
    // Required: an empty name blocks.
    cell(grid, 'a', 'name').focus();
    await userEvent.keyboard('{Backspace}{Enter}');
    expect(grid.editingCell).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    const revert = mount({ invalidEdit: 'revert' }).grid;
    cell(revert, 'a', 'qty').focus();
    await userEvent.keyboard('7x{Enter}');
    expect(revert.editingCell).toBeNull();
    expect(text(revert, 'a', 'qty')).toBe('1');
  });

  it('provided editors: number in the locale, checkbox, date, date-time in the grid time zone, select, and a large-text popup with validate', async () => {
    const { grid } = mount();
    cell(grid, 'b', 'qty').focus();
    await userEvent.keyboard('{Enter}{Control>}a{/Control}42.5{Enter}');
    expect(text(grid, 'b', 'qty')).toBe('42.5');
    cell(grid, 'b', 'qty').focus();
    await userEvent.keyboard('{Enter}{ArrowUp}{ArrowUp}{Enter}');
    expect(text(grid, 'b', 'qty')).toBe('44.5');
    cell(grid, 'b', 'ok').focus();
    await userEvent.keyboard('{Enter}');
    expect(control().type).toBe('checkbox');
    await userEvent.keyboard(' {Enter}');
    expect(text(grid, 'b', 'ok')).toBe('Yes');
    grid.startEditing('b', 'due');
    expect(control().type).toBe('date');
    control().value = '2026-03-09';
    await userEvent.keyboard('{Enter}');
    expect(text(grid, 'b', 'due')).toBe('Mar 9, 2026');
    grid.startEditing('a', 'at');
    // 09:30 UTC is 10:30 in Berlin in January.
    expect(control().value).toBe('2026-01-05T10:30');
    control().value = '2026-01-05T12:00';
    await userEvent.keyboard('{Enter}');
    expect(grid.getState().version).toBe(1);
    grid.startEditing('c', 'size');
    const select = document.querySelector<HTMLSelectElement>('select.aui-data-grid__editor-control')!;
    expect([...select.options].map((o) => o.textContent)).toEqual(['(None)', 'Small', 'Medium', 'Large']);
    select.selectedIndex = 1;
    await userEvent.keyboard('{Enter}');
    expect(text(grid, 'c', 'size')).toBe('S');
    grid.startEditing('a', 'note');
    const area = document.querySelector<HTMLTextAreaElement>('.aui-data-grid__editor--popup textarea')!;
    expect(area.closest('.aui-data-grid__editor')?.matches(':popover-open')).toBe(true);
    await userEvent.keyboard('Hi!{Enter}there{Tab}');
    expect(grid.editingCell?.column).toBe('note');
    expect(document.querySelector('.aui-data-grid__edit-error')?.textContent).toBe('No exclamation marks');
    await userEvent.keyboard('{Escape}');
    // Row c's note is not editable.
    expect(grid.startEditing('c', 'note')).toBe(false);
  });

  it('double-click and clickToEdit start editing; focus leaving commits (an invalid value is discarded)', async () => {
    const { grid } = mount({ clickToEdit: true });
    cell(grid, 'c', 'name').click();
    expect(grid.editingCell).toEqual({ rowId: 'c', column: 'name' });
    await userEvent.keyboard('{Control>}a{/Control}Cy');
    cell(grid, 'a', 'size').focus();
    expect(grid.editingCell).toBeNull();
    expect(text(grid, 'c', 'name')).toBe('Cy');
    const other = mount().grid;
    cell(other, 'b', 'qty').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(other.editingCell).toEqual({ rowId: 'b', column: 'qty' });
    await userEvent.keyboard('{Control>}a{/Control}zz');
    cell(other, 'a', 'name').focus();
    expect(other.editingCell).toBeNull();
    expect(text(other, 'b', 'qty')).toBe('2');
  });

  it('undo and redo edits, paste, and bulk edits; external row updates clear the history', async () => {
    const { grid, seen } = mount({ cellSelection: true });
    cell(grid, 'a', 'name').focus();
    await userEvent.keyboard('Q{Enter}');
    expect(text(grid, 'a', 'name')).toBe('Q');
    expect(grid.canUndo).toBe(true);
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(text(grid, 'a', 'name')).toBe('Ann');
    expect(seen.at(-1)?.source).toBe('undo');
    await userEvent.keyboard('{Control>}y{/Control}');
    expect(text(grid, 'a', 'name')).toBe('Q');
    // Bulk edit: a range, an edit, and Ctrl+Enter writes every editable cell of the range.
    cell(grid, 'a', 'qty').focus();
    await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}9{Control>}{Enter}{/Control}');
    expect(['a', 'b', 'c'].map((id) => text(grid, id, 'qty'))).toEqual(['9', '9', '9']);
    expect(seen.at(-1)?.source).toBe('bulk');
    expect(grid.undo()).toBe(true);
    expect(['a', 'b', 'c'].map((id) => text(grid, id, 'qty'))).toEqual(['1', '2', '3']);
    grid.setRows(base());
    expect(grid.canUndo).toBe(false);
    expect(grid.canRedo).toBe(false);
  });

  it('row mode: every editable cell of the row edits; Tab moves within it; Enter commits one write; validateRow blocks', async () => {
    const { grid, seen } = mount({ editMode: 'row', validateRow: (values) => (values.name === 'Bad' ? { qty: 'Not with this name' } : null) });
    cell(grid, 'b', 'name').focus();
    await userEvent.keyboard('{F2}');
    const editors = (): HTMLElement[] => [...grid.host.querySelectorAll<HTMLElement>('.aui-data-grid__row[data-row-id="b"] .aui-data-grid__editor-control')];
    // name, qty, ok, due, at, size, note (large text renders in the cell in row mode).
    expect(editors()).toHaveLength(7);
    expect(grid.host.querySelector('.aui-data-grid__row[data-row-id="b"]')?.classList.contains('aui-data-grid__row--editing')).toBe(true);
    await userEvent.keyboard('{Control>}a{/Control}Bea{Tab}');
    expect(grid.editingCell).toEqual({ rowId: 'b', column: 'qty' });
    await userEvent.keyboard('{Control>}a{/Control}12{Enter}');
    expect(grid.editingCell).toBeNull();
    expect([text(grid, 'b', 'name'), text(grid, 'b', 'qty')]).toEqual(['Bea', '12']);
    expect(seen.at(-1)?.changes.map((c) => c.column)).toEqual(['name', 'qty']);
    expect(grid.undo()).toBe(true);
    expect([text(grid, 'b', 'name'), text(grid, 'b', 'qty')]).toEqual(['Bob', '2']);
    cell(grid, 'c', 'name').focus();
    await userEvent.keyboard('{Enter}{Control>}a{/Control}Bad{Enter}');
    expect(grid.editingCell).toEqual({ rowId: 'c', column: 'qty' });
    expect(document.querySelector('.aui-data-grid__edit-error')?.textContent).toBe('Not with this name');
    await userEvent.keyboard('{Escape}');
    expect(text(grid, 'c', 'name')).toBe('Cid');
  });

  it('batch editing: pending values show and are spoken as edited, sorting keeps committed data, commit is one write and one undo step', async () => {
    const { grid, seen } = mount({ cellSelection: true });
    grid.startBatch();
    expect(grid.isBatchEditing).toBe(true);
    cell(grid, 'a', 'qty').focus();
    await userEvent.keyboard('50{Enter}');
    cell(grid, 'c', 'name').focus();
    await userEvent.keyboard('Ace{Enter}');
    expect(text(grid, 'a', 'qty')).toBe('50, edited');
    expect(cell(grid, 'a', 'qty').classList.contains('aui-data-grid__cell--pending')).toBe(true);
    expect(seen).toHaveLength(0);
    // Sorting by quantity uses the committed values (a=1 stays first).
    grid.update({ sort: { column: 'qty', direction: 'ascending' } });
    expect(grid.host.querySelector<HTMLElement>('.aui-data-grid__row[aria-rowindex="2"]')?.dataset.rowId).toBe('a');
    grid.commitBatch();
    expect(grid.isBatchEditing).toBe(false);
    expect(text(grid, 'a', 'qty')).toBe('50');
    expect(seen.at(-1)?.source).toBe('batch');
    expect(seen.at(-1)?.changes).toHaveLength(2);
    grid.undo();
    expect([text(grid, 'a', 'qty'), text(grid, 'c', 'name')]).toEqual(['1', 'Cid']);
    grid.startBatch();
    cell(grid, 'b', 'name').focus();
    await userEvent.keyboard('Zed{Enter}');
    grid.cancelBatch();
    expect(text(grid, 'b', 'name')).toBe('Bob');
  });

  it('custom editors; readOnlyEdits requests the edit and records no undo', async () => {
    const { grid, seen } = mount({
      readOnlyEdits: true,
      columns: [
        {
          id: 'name',
          header: 'Name',
          field: 'name',
          editable: true,
          editor: {
            create: (ctx) => {
              const el = ctx.doc.createElement('input');
              el.setAttribute('aria-label', ctx.label);
              el.className = 'custom-editor';
              el.value = String(ctx.value).toUpperCase();
              return { element: el, getValue: () => el.value, focus: () => { el.focus(); } };
            },
          },
        },
      ],
    });
    cell(grid, 'a', 'name').focus();
    await userEvent.keyboard('{Enter}');
    expect(document.querySelector<HTMLInputElement>('.custom-editor')?.value).toBe('ANN');
    await userEvent.keyboard('{Enter}');
    expect(text(grid, 'a', 'name')).toBe('Ann');
    expect(seen.at(-1)).toEqual({ changes: [{ rowId: 'a', column: 'name', oldValue: 'Ann', newValue: 'ANN' }], source: 'edit', applied: false, rejected: [] });
    expect(grid.canUndo).toBe(false);
  });
});
