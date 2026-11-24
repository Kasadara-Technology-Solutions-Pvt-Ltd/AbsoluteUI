import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridOptions, type DataGridSelectionChangeDetail } from '@absoluteui/components/data-grid';

// docs/PLAN-R11-G3.md (G3a): row selection.
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = [
    '.aui-data-grid{display:flex;flex-direction:column;block-size:400px;inline-size:600px}',
    '.aui-data-grid__viewport{flex:1 1 auto;overflow:auto;min-block-size:0;position:relative}',
    '.aui-data-grid__head{position:sticky;top:0;z-index:3;background:#fff}',
    '.aui-data-grid__header-row{display:flex;block-size:40px}',
    '.aui-data-grid__header-cell{flex:none;box-sizing:border-box;overflow:hidden;position:relative}',
    '.aui-data-grid__body{position:relative}',
    '.aui-data-grid__row{position:absolute;display:flex;inset-inline-start:0;box-sizing:border-box}',
    '.aui-data-grid__cell{flex:none;box-sizing:border-box;overflow:hidden;white-space:nowrap}',
    '.aui-data-grid__spacer{flex:none}',
    '.aui-data-grid__cell--pinned-start{position:sticky;z-index:1;background:#fff}',
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
  age: number;
}
const people: P[] = ['Ann', 'Bob', 'Cid', 'Dee', 'Eve', 'Fay'].map((name, i) => ({ id: String.fromCharCode(97 + i), name, age: 20 + i * 5 }));

function mount(options: Partial<DataGridOptions<P>> = {}): DataGrid<P> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create(host, {
    label: 'People',
    rows: people,
    rowId: (r) => r.id,
    rowHeight: 30,
    rowSelection: { mode: 'multiple' },
    columns: [
      { id: 'name', header: 'Name', field: 'name', filter: 'text' },
      { id: 'age', header: 'Age', field: 'age', type: 'number' },
    ],
    ...options,
  });
}
const row = (g: DataGrid<P>, id: string): HTMLElement => g.host.querySelector<HTMLElement>(`.aui-data-grid__row[data-row-id="${id}"]`)!;
const box = (g: DataGrid<P>, id: string): HTMLInputElement => row(g, id).querySelector<HTMLInputElement>('.aui-data-grid__select-input')!;
const all = (g: DataGrid<P>): HTMLInputElement => g.host.querySelector<HTMLInputElement>('.aui-data-grid__select-all')!;
const cell = (g: DataGrid<P>, id: string, column: string): HTMLElement => row(g, id).querySelector<HTMLElement>(`[data-column="${column}"]`)!;
function events(g: DataGrid<P>): DataGridSelectionChangeDetail[] {
  const list: DataGridSelectionChangeDetail[] = [];
  g.host.addEventListener('aui-selection-change', (e) => list.push((e as CustomEvent<DataGridSelectionChangeDetail>).detail));
  return list;
}

describe('row selection', () => {
  it('adds a pinned checkbox column with a tri-state Select all; ARIA marks selected rows', () => {
    const g = mount();
    expect(g.element.getAttribute('aria-multiselectable')).toBe('true');
    const header = g.host.querySelector<HTMLElement>('[role="columnheader"][data-column="aui-row-select"]')!;
    expect(header.classList.contains('aui-data-grid__cell--pinned-start')).toBe(true);
    expect(document.getElementById(header.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Row selection');
    expect(all(g).getAttribute('aria-label')).toBe('Select all rows');
    expect(box(g, 'a').getAttribute('aria-label')).toBe('Select Ann');
    expect(box(g, 'a').tabIndex).toBe(-1);
    expect(row(g, 'a').getAttribute('aria-selected')).toBe('false');
    // The checkbox column is not part of the column state.
    expect(g.getColumnsState().order).toEqual(['name', 'age']);
    expect(g.moveColumn('aui-row-select', 'age')).toBe(false);
    expect(g.setColumnHidden('aui-row-select', true)).toBe(false);
  });

  it('checkboxes toggle and Shift extends from the anchor; Select all covers the filtered rows', () => {
    const g = mount();
    const seen = events(g);
    box(g, 'b').click();
    expect(g.getSelected()).toEqual(['b']);
    expect(row(g, 'b').getAttribute('aria-selected')).toBe('true');
    expect(row(g, 'b').classList.contains('aui-data-grid__row--selected')).toBe(true);
    expect(all(g).indeterminate).toBe(true);
    box(g, 'd').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(g.getSelected()).toEqual(['b', 'c', 'd']);
    expect(seen.at(-1)).toEqual({ selected: ['b', 'c', 'd'], added: ['c', 'd'], removed: [], reason: 'user' });
    g.setFilter('name', { kind: 'text', conditions: [{ operator: 'contains', value: 'e' }] });
    all(g).click();
    // Dee, Eve: the filtered rows join the selection; hidden rows are untouched.
    expect(g.getSelected()).toEqual(['b', 'c', 'd', 'e']);
    expect(seen.at(-1)?.reason).toBe('select-all');
    expect(all(g).checked).toBe(true);
    all(g).click();
    expect(g.getSelected()).toEqual(['b', 'c']);
  });

  it('Space toggles the focused row, Shift+Space selects a range, Ctrl+A selects all; Space on the header toggles all', async () => {
    const g = mount();
    cell(g, 'a', 'name').focus();
    await userEvent.keyboard(' ');
    expect(g.getSelected()).toEqual(['a']);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Shift>} {/Shift}');
    expect(g.getSelected()).toEqual(['a', 'b', 'c']);
    await userEvent.keyboard('{Control>}a{/Control}');
    expect(g.getSelected()).toHaveLength(6);
    g.host.querySelector<HTMLElement>('[role="columnheader"][data-column="aui-row-select"]')!.focus();
    await userEvent.keyboard(' ');
    expect(g.getSelected()).toEqual([]);
  });

  it('single mode keeps one row; clickToSelect selects by click with Ctrl and Shift', () => {
    const single = mount({ rowSelection: { mode: 'single', clickToSelect: true } });
    expect(single.host.querySelector('.aui-data-grid__select-all')).toBeNull();
    expect(single.element.hasAttribute('aria-multiselectable')).toBe(false);
    cell(single, 'a', 'name').click();
    cell(single, 'c', 'name').click();
    expect(single.getSelected()).toEqual(['c']);
    const multi = mount({ rowSelection: { mode: 'multiple', clickToSelect: true, checkboxes: false } });
    expect(multi.host.querySelector('[data-column="aui-row-select"]')).toBeNull();
    cell(multi, 'a', 'name').click();
    cell(multi, 'c', 'name').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(multi.getSelected()).toEqual(['a', 'c']);
    cell(multi, 'e', 'name').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(multi.getSelected()).toEqual(['a', 'c', 'd', 'e']);
    cell(multi, 'b', 'name').click();
    expect(multi.getSelected()).toEqual(['b']);
  });

  it('respects selectable, keeps the selection by id across sorting, prunes removed rows, and round-trips through state', () => {
    const g = mount({ rowSelection: { mode: 'multiple', selectable: (r) => r.age < 40 }, selected: ['a', 'f', 'zz'] });
    // f (age 45) is not selectable and zz is unknown.
    expect(g.getSelected()).toEqual(['a']);
    expect(box(g, 'f').disabled).toBe(true);
    g.selectAll();
    expect(g.getSelected()).toEqual(['a', 'b', 'c', 'd']);
    const seen = events(g);
    g.update({ sort: { column: 'age', direction: 'descending' } });
    expect(g.getSelected()).toEqual(['a', 'b', 'c', 'd']);
    g.applyTransaction({ remove: ['b'] });
    expect(g.getSelected()).toEqual(['a', 'c', 'd']);
    expect(seen.at(-1)).toEqual({ selected: ['a', 'c', 'd'], added: [], removed: ['b'], reason: 'rows' });
    const state = g.getState();
    expect(state.selected).toEqual(['a', 'c', 'd']);
    const other = mount({ rowSelection: { mode: 'multiple' } });
    other.setState(JSON.parse(JSON.stringify(state)));
    expect(other.getSelected()).toEqual(['a', 'c', 'd']);
    other.clearSelection();
    expect(other.getSelectedRows()).toEqual([]);
    expect(() => mount({ columns: [{ id: 'aui-row-select', header: 'X' }] })).toThrow(/reserved/);
  });
});
