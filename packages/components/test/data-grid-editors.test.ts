import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridCellsChangeDetail } from '@absoluteui/components/data-grid';
import { comboboxEditor, multiSelectEditor } from '@absoluteui/components/data-grid/editors';

// docs/PLAN-R11-G4.md (G4c; R11-14): list editors in a separate entry point.
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface P {
  id: string;
  name: string;
  level: number | null;
  tags: string[];
}

function mount(): { grid: DataGrid<P>; seen: DataGridCellsChangeDetail[] } {
  const host = document.createElement('div');
  host.style.setProperty('block-size', '300px');
  document.body.append(host);
  const levels = [{ value: 1, label: 'Junior' }, { value: 2, label: 'Mid' }, { value: 3, label: 'Senior' }];
  const grid = DataGrid.create<P>(host, {
    label: 'Staff',
    rows: [{ id: 'a', name: 'Ann', level: 1, tags: ['x'] }, { id: 'b', name: 'Bob', level: null, tags: [] }],
    rowId: (r) => r.id,
    rowHeight: 40,
    columns: [
      { id: 'name', header: 'Name', field: 'name', editable: true, editor: comboboxEditor({ loadValues: (query) => Promise.resolve(['Ada', 'Alan', 'Grace'].filter((n) => n.toLowerCase().includes(query.toLowerCase())).map((n) => ({ value: n, label: n }))), loadDelay: 0 }) },
      { id: 'level', header: 'Level', field: 'level', editable: true, editor: comboboxEditor({ values: levels }), format: (v) => levels.find((l) => l.value === v)?.label ?? '' },
      { id: 'tags', header: 'Tags', field: 'tags', editable: true, editor: multiSelectEditor({ values: [{ value: 'x', label: 'X-ray' }, { value: 'y', label: 'Yankee' }, { value: 'z', label: 'Zulu' }] }), format: (v) => (Array.isArray(v) ? v.join(', ') : '') },
    ],
  });
  const seen: DataGridCellsChangeDetail[] = [];
  host.addEventListener('aui-cells-change', (e) => seen.push((e as CustomEvent<DataGridCellsChangeDetail>).detail));
  return { grid, seen };
}
const cell = (g: DataGrid<P>, id: string, column: string): HTMLElement => g.host.querySelector<HTMLElement>(`.aui-data-grid__row[data-row-id="${id}"] [data-column="${column}"]`)!;
const options = (): string[] => [...document.querySelectorAll('[role="option"]')].filter((o) => (o as HTMLElement).offsetParent !== null).map((o) => o.textContent.trim());

describe('list editors', () => {
  it('combobox editor: the list opens, typing filters, Enter chooses, the next Enter commits the typed value', async () => {
    const { grid, seen } = mount();
    cell(grid, 'b', 'level').focus();
    await userEvent.keyboard('{Enter}');
    const input = document.activeElement as HTMLInputElement;
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    // The component's accessible name is the editor label.
    expect(input.labels?.[0]?.textContent).toBe('Level, Bob');
    await userEvent.keyboard('sen');
    expect(options()).toEqual(['Senior']);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(grid.editingCell).toEqual({ rowId: 'b', column: 'level' });
    await userEvent.keyboard('{Enter}');
    expect(grid.editingCell).toBeNull();
    expect(cell(grid, 'b', 'level').textContent).toBe('Senior');
    expect(seen.at(-1)?.changes).toEqual([{ rowId: 'b', column: 'level', oldValue: null, newValue: 3 }]);
  });

  it('combobox editor with values loaded per query; a typed key starts the search', async () => {
    const { grid } = mount();
    cell(grid, 'a', 'name').focus();
    await userEvent.keyboard('g');
    await expect.poll(options).toEqual(['Grace']);
    await userEvent.keyboard('{ArrowDown}{Enter}{Enter}');
    expect(cell(grid, 'a', 'name').textContent).toBe('Grace');
  });

  it('multi-select editor writes an array of the chosen values', async () => {
    const { grid, seen } = mount();
    cell(grid, 'a', 'tags').focus();
    await userEvent.keyboard('{Enter}');
    expect((document.activeElement as HTMLElement).closest('.aui-data-grid__list-editor')).not.toBeNull();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await userEvent.keyboard('{Escape}');
    // The first Escape closed the list; Tab commits.
    await userEvent.keyboard('{Tab}');
    expect(seen.at(-1)?.changes[0]?.newValue).toEqual(['x', 'y']);
    expect(cell(grid, 'a', 'tags').textContent).toBe('x, y');
  });
});
