import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { onNodeRelease, plainDate, plainDateToString, resetAbsoluteUIConfig, type PlainDate } from '@absoluteui/core';
import { DataTable, type DataTableCellEditDetail, type DataTableColumn, type DataTableOptions } from '@absoluteui/components/data-table';

// docs/PLAN-R9-ANGULAR.md M5b (D18): inline editing.
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface Person {
  id: string;
  name: string;
  age: number;
  active: boolean;
  born: PlainDate;
  role: string;
}

const PEOPLE: Person[] = [
  { id: 'p1', name: 'Ada', age: 36, active: true, born: plainDate(1815, 12, 10), role: 'eng' },
  { id: 'p2', name: 'Bob', age: 41, active: false, born: plainDate(1980, 1, 2), role: 'ops' },
];

const COLUMNS: DataTableColumn<Person>[] = [
  { id: 'name', header: 'Name', accessor: (p) => p.name, rowHeader: true, editable: true, validate: (v) => (typeof v === 'string' && v.trim() === '' ? 'Enter a name.' : null) },
  { id: 'age', header: 'Age', accessor: (p) => p.age, type: 'number', editable: (p) => p.id !== 'p2' },
  { id: 'active', header: 'Active', accessor: (p) => p.active, type: 'boolean', editable: true },
  { id: 'born', header: 'Born', accessor: (p) => p.born, type: 'date', editable: true },
  { id: 'role', header: 'Role', accessor: (p) => p.role, editable: true, editor: 'select', editOptions: [{ value: 'eng', label: 'Engineering' }, { value: 'ops', label: 'Operations' }] },
];

/** A table whose consumer applies edits to its rows, as the docs require. */
function mount(options: Partial<DataTableOptions<Person>> = {}): { t: DataTable<Person>; edits: DataTableCellEditDetail<Person>[] } {
  const host = document.createElement('div');
  document.body.append(host);
  let rows = PEOPLE.map((p) => ({ ...p }));
  const t = DataTable.create<Person>(host, { caption: 'People', columns: COLUMNS, rows, rowId: (p) => p.id, locale: 'en-US', ...options });
  const edits: DataTableCellEditDetail<Person>[] = [];
  host.addEventListener('aui-cell-edit', (e) => {
    const d = (e as CustomEvent<DataTableCellEditDetail<Person>>).detail;
    edits.push(d);
    rows = rows.map((r) => (r.id === d.rowId ? { ...r, [d.column]: d.value } : r));
    t.update({ rows });
  });
  return { t, edits };
}

const editButton = (t: DataTable<Person>, row: string, column: string): HTMLButtonElement =>
  t.host.querySelector<HTMLButtonElement>(`button.aui-data-table__edit[data-row-id="${row}"][data-column="${column}"]`)!;

describe('Data Table inline editing (since 0.9.0)', () => {
  it('edits text with Enter, keeps focus on the cell, and the consumer updates rows', async () => {
    const { t, edits } = mount();
    const button = editButton(t, 'p1', 'name');
    expect(button.textContent).toBe('Ada, edit Name');
    await userEvent.click(button);
    const input = t.host.querySelector<HTMLInputElement>('.aui-data-table__editor input')!;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-label')).toBe('Name, Ada');
    await userEvent.keyboard('{Control>}a{/Control}Ada L.{Enter}');
    expect(edits).toEqual([expect.objectContaining({ rowId: 'p1', column: 'name', value: 'Ada L.', previous: 'Ada' })]);
    expect(editButton(t, 'p1', 'name').textContent).toContain('Ada L.');
    expect(document.activeElement).toBe(editButton(t, 'p1', 'name'));
  });

  it('Escape cancels; validation keeps the editor open with an error', async () => {
    const { t, edits } = mount();
    await userEvent.click(editButton(t, 'p1', 'name'));
    await userEvent.keyboard('{Control>}a{/Control}{Backspace}{Enter}');
    const input = t.host.querySelector<HTMLInputElement>('.aui-data-table__editor input')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(t.host.querySelector('.aui-data-table__edit-error')!.textContent).toBe('Enter a name.');
    expect(document.activeElement).toBe(input);
    await userEvent.keyboard('{Escape}');
    expect(t.host.querySelector('.aui-data-table__editor')).toBeNull();
    expect(edits).toHaveLength(0);
    expect(document.activeElement).toBe(editButton(t, 'p1', 'name'));
  });

  it('number, date, select, and checkbox editors produce typed values; editable can depend on the row', async () => {
    const { t, edits } = mount();
    expect(editButton(t, 'p2', 'age')).toBeNull();
    await userEvent.click(editButton(t, 'p1', 'age'));
    await userEvent.keyboard('{Control>}a{/Control}abc{Enter}');
    expect(t.host.querySelector('.aui-data-table__edit-error')!.textContent).toBe('Enter a number.');
    await userEvent.keyboard('{Control>}a{/Control}37{Enter}');
    expect(edits.at(-1)).toMatchObject({ column: 'age', value: 37 });

    await userEvent.click(editButton(t, 'p1', 'active'));
    expect(edits.at(-1)).toMatchObject({ column: 'active', value: false, previous: true });
    expect(editButton(t, 'p1', 'active').getAttribute('aria-pressed')).toBe('false');

    await userEvent.click(editButton(t, 'p2', 'role'));
    await userEvent.selectOptions(t.host.querySelector('.aui-data-table__editor select')!, 'eng');
    await userEvent.keyboard('{Enter}');
    expect(edits.at(-1)).toMatchObject({ rowId: 'p2', column: 'role', value: 'eng' });

    await userEvent.click(editButton(t, 'p2', 'born'));
    const date = t.host.querySelector<HTMLInputElement>('.aui-data-table__editor input')!;
    date.value = '1980-02-03';
    await userEvent.keyboard('{Enter}');
    const last = edits.at(-1)!;
    expect(last.column).toBe('born');
    expect(plainDateToString(last.value as PlainDate)).toBe('1980-02-03');
  });

  it('a custom editor commits through its context and is released when it closes', async () => {
    const live = vi.fn();
    const released = vi.fn();
    const { t, edits } = mount({
      columns: COLUMNS.map((c) =>
        c.id === 'name'
          ? {
              ...c,
              renderEditor: (ctx) => {
                live();
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'custom-save';
                b.textContent = `Save ${String(ctx.value)}!`;
                b.addEventListener('click', () => {
                  ctx.commit(`${String(ctx.value)}!`);
                });
                return onNodeRelease(b, released);
              },
            }
          : c,
      ),
    });
    await userEvent.click(editButton(t, 'p1', 'name'));
    expect(document.activeElement?.className).toBe('custom-save');
    await userEvent.click(t.host.querySelector('.custom-save')!);
    expect(edits.at(-1)).toMatchObject({ value: 'Ada!' });
    expect(released).toHaveBeenCalledTimes(1);
    expect(live).toHaveBeenCalledTimes(1);
  });
});

describe('inline editing across outside updates', () => {
  it('an outside rows update while editing keeps the editor and its focus', async () => {
    const { t, edits } = mount();
    await userEvent.click(editButton(t, 'p1', 'name'));
    await userEvent.keyboard('{Control>}a{/Control}Ad');
    // A refresh replaces every row object while the user types.
    t.update({ rows: PEOPLE.map((p) => ({ ...p })) });
    await Promise.resolve();
    const input = t.host.querySelector<HTMLInputElement>('.aui-data-table__editor input')!;
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Ad');
    expect(edits).toHaveLength(0);
  });
});
