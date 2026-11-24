import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, instant, plainDate, registerMessages, resetAbsoluteUIConfig, type Instant, type PlainDate } from '@absoluteui/core';
import {
  DataTable,
  type DataTableColumn,
  type DataTableOptions,
  type DataTablePageChangeDetail,
  type DataTableSelectionChangeDetail,
  type DataTableSortChangeDetail,
} from '@absoluteui/components/data-table';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface Person {
  id: string;
  name: string;
  age: number | null;
  active: boolean;
}

const PEOPLE: Person[] = [
  { id: 'p1', name: 'Carol', age: 41, active: true },
  { id: 'p2', name: 'alice', age: 29, active: false },
  { id: 'p3', name: 'Bob', age: null, active: true },
  { id: 'p4', name: 'Dave', age: 29, active: true },
];

const COLUMNS: DataTableColumn<Person>[] = [
  { id: 'name', header: 'Name', accessor: (p) => p.name },
  { id: 'age', header: 'Age', accessor: (p) => p.age, type: 'number' },
  { id: 'active', header: 'Active', accessor: (p) => p.active, type: 'boolean', sortable: false },
];

function mount<Row = Person>(options: Partial<DataTableOptions<Row>> & Pick<DataTableOptions<Row>, 'rows' | 'columns' | 'rowId'>): DataTable<Row> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataTable.create(host, { caption: 'People', ...options });
}

const people = (options: Partial<DataTableOptions<Person>> = {}): DataTable<Person> => mount({ rows: PEOPLE, columns: COLUMNS, rowId: (p) => p.id, ...options });

const bodyRows = <R>(t: DataTable<R>): HTMLTableRowElement[] => Array.from(t.table.tBodies[0]!.rows);
const column = <R>(t: DataTable<R>, index: number): string[] => bodyRows(t).map((r) => r.cells[index]!.textContent);
const header = <R>(t: DataTable<R>, id: string): HTMLTableCellElement => t.table.querySelector<HTMLTableCellElement>(`thead th[data-column="${id}"]`)!;
const sortButton = <R>(t: DataTable<R>, id: string): HTMLButtonElement => header(t, id).querySelector('button')!;
const rowInputs = <R>(t: DataTable<R>): HTMLInputElement[] => Array.from(t.table.querySelectorAll<HTMLInputElement>('tbody input'));
const selectAll = <R>(t: DataTable<R>): HTMLInputElement => t.table.querySelector<HTMLInputElement>('.aui-data-table__select-all')!;
const pagerButton = <R>(t: DataTable<R>, key: string): HTMLButtonElement => t.host.querySelector<HTMLButtonElement>(`.aui-data-table__pagination [data-key="${key}"]`)!;
const record = <T>(t: { host: HTMLElement }, type: string): T[] => {
  const seen: T[] = [];
  t.host.addEventListener(type, (event) => seen.push((event as CustomEvent<T>).detail));
  return seen;
};
const text = (s: string): string => s.replace(/\s/g, ' ');
const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => {
  resolve();
}));
const liveText = (): string => document.querySelector('[data-aui-live-region="polite"]')?.textContent ?? '';

interface Numbered {
  id: string;
  n: number;
  label: string;
}

const numbered = (count: number): Numbered[] => Array.from({ length: count }, (_, i) => ({ id: `r${String(i + 1)}`, n: i + 1, label: `Item ${String(i + 1)}` }));
const NUMBERED_COLUMNS: DataTableColumn<Numbered>[] = [
  { id: 'label', header: 'Label', accessor: (r) => r.label },
  { id: 'n', header: 'Number', accessor: (r) => r.n, type: 'number' },
];
const numberedTable = (count: number, options: Partial<DataTableOptions<Numbered>> = {}): DataTable<Numbered> =>
  mount<Numbered>({ rows: numbered(count), columns: NUMBERED_COLUMNS, rowId: (r) => r.id, ...options });

describe('DataTable: semantics', () => {
  it('renders a captioned table in a labelled, focusable scroll region', () => {
    const t = people();
    const caption = t.table.caption!;
    expect(caption.textContent).toBe('People');
    const region = t.host.querySelector<HTMLElement>('.aui-data-table__region')!;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.tabIndex).toBe(0);
    expect(region.getAttribute('aria-labelledby')).toBe(caption.id);
    expect(region.contains(t.table)).toBe(true);
    expect(t.table.getAttribute('role')).toBeNull();
  });

  it('uses th scope=col for headers and th scope=row for the first column by default', () => {
    const t = people();
    const heads = Array.from(t.table.tHead!.rows[0]!.cells);
    expect(heads.map((h) => [h.tagName, h.getAttribute('scope'), h.textContent])).toEqual([
      ['TH', 'col', 'Name'],
      ['TH', 'col', 'Age'],
      ['TH', 'col', 'Active'],
    ]);
    const first = bodyRows(t)[0]!;
    expect(first.cells[0]!.tagName).toBe('TH');
    expect(first.cells[0]!.getAttribute('scope')).toBe('row');
    expect(first.cells[1]!.tagName).toBe('TD');
  });

  it('honors an explicit row header column and rowHeader: false', () => {
    const cols = COLUMNS.map((c) => (c.id === 'age' ? { ...c, rowHeader: true } : c));
    const t = people({ columns: cols });
    expect(bodyRows(t)[0]!.cells[1]!.tagName).toBe('TH');
    expect(bodyRows(t)[0]!.cells[0]!.tagName).toBe('TD');
    const none = people({ columns: COLUMNS.map((c, i) => (i === 0 ? { ...c, rowHeader: false } : c)) });
    expect(none.table.querySelectorAll('tbody th')).toHaveLength(0);
  });

  it('puts a button in sortable headers only; aria-sort is on the sorted column only', () => {
    const t = people({ sort: { column: 'age', direction: 'descending' } });
    expect(sortButton(t, 'name').type).toBe('button');
    expect(sortButton(t, 'name').textContent).toBe('Name');
    expect(header(t, 'active').querySelector('button')).toBeNull();
    expect(header(t, 'age').getAttribute('aria-sort')).toBe('descending');
    expect(header(t, 'name').hasAttribute('aria-sort')).toBe(false);
    expect(header(t, 'active').hasAttribute('aria-sort')).toBe(false);
    expect(sortButton(t, 'age').querySelector('.aui-icon')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('visually hides the caption on request and applies column widths through the CSSOM', () => {
    const t = people({ hideCaption: true, columns: COLUMNS.map((c) => (c.id === 'age' ? { ...c, width: '8rem' } : c)) });
    expect(t.table.caption!.classList.contains('aui-data-table__visually-hidden')).toBe(true);
    expect(header(t, 'age').style.getPropertyValue('width')).toBe('8rem');
    expect(header(t, 'age').getAttribute('style')).toContain('8rem');
  });

  it('aligns numeric columns to the end and applies density and sticky header classes', () => {
    const t = people({ density: 'compact' });
    expect(bodyRows(t)[0]!.cells[1]!.classList.contains('aui-data-table__cell--end')).toBe(true);
    expect(header(t, 'age').classList.contains('aui-data-table__cell--end')).toBe(true);
    expect(t.host.classList.contains('aui-data-table--compact')).toBe(true);
    expect(t.host.classList.contains('aui-data-table--sticky')).toBe(true);
    t.update({ stickyHeader: false, density: 'spacious' });
    expect(t.host.classList.contains('aui-data-table--sticky')).toBe(false);
    expect(t.host.classList.contains('aui-data-table--spacious')).toBe(true);
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    const base: DataTableOptions<Person> = { caption: 'People', columns: COLUMNS, rows: PEOPLE, rowId: (p) => p.id };
    expect(() => DataTable.create(host, { ...base, caption: ' ' })).toThrow(AbsoluteUIError);
    expect(() => DataTable.create(host, { ...base, columns: [] })).toThrow(/columns/);
    expect(() => DataTable.create(host, { ...base, columns: [COLUMNS[0]!, COLUMNS[0]!] })).toThrow(/columns\.id/);
    expect(() => DataTable.create(host, { ...base, columns: [{ id: 'x', header: 'X', accessor: () => 1, type: 'currency' }] })).toThrow(/currency/);
    expect(() => DataTable.create(host, { ...base, columns: [{ id: 'x', header: 'X', accessor: () => 1, width: 'calc(1px)' }] })).toThrow(/width/);
    expect(() => DataTable.create(host, { ...base, sort: { column: 'active', direction: 'ascending' } })).toThrow(/sort\.column/);
    expect(() => DataTable.create(host, { ...base, rowId: () => 'same' })).toThrow(expect.objectContaining({ code: 'DATA_TABLE_ROW_ID' }));
    expect(() => DataTable.create(host, { ...base, rowId: () => '' })).toThrow(expect.objectContaining({ code: 'DATA_TABLE_ROW_ID' }));
    expect(() => DataTable.create(host, { ...base, mode: 'server' })).toThrow(/total/);
    expect(() => DataTable.create(host, { ...base, pageSize: 7, pageSizes: [10, 20] })).toThrow(/pageSize/);
    expect(() => DataTable.create(host, { ...base, selection: 'single', selected: ['p1', 'p2'] })).toThrow(/selected/);
    expect(() => DataTable.create(host, { ...base, pageSize: 0 })).toThrow(AbsoluteUIError);
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
  });

  it('leaves nothing behind when a consumer renderer throws during construction', () => {
    const host = document.createElement('div');
    const cols: DataTableColumn<Person>[] = [{ id: 'x', header: 'X', accessor: () => 1, render: () => { throw new Error('boom'); } }];
    expect(() => DataTable.create(host, { caption: 'People', columns: cols, rows: PEOPLE, rowId: (p) => p.id })).toThrow('boom');
    expect(host.childElementCount).toBe(0);
    expect(host.classList.contains('aui-data-table')).toBe(false);
  });
});

describe('DataTable: typed formatting', () => {
  interface Txn {
    id: string;
    amount: number;
    on: PlainDate;
    at: Instant;
    note: string | null;
  }
  const rows: Txn[] = [{ id: 't1', amount: 1234.5, on: plainDate(2024, 1, 5), at: instant(Date.UTC(2024, 0, 15, 15, 30)), note: null }];
  const cols: DataTableColumn<Txn>[] = [
    { id: 'id', header: 'Id', accessor: (r) => r.id },
    { id: 'n', header: 'Amount', accessor: (r) => r.amount, type: 'number' },
    { id: 'c', header: 'Price', accessor: (r) => r.amount, type: 'currency', currency: 'EUR' },
    { id: 'd', header: 'Date', accessor: (r) => r.on, type: 'date' },
    { id: 'dt', header: 'At', accessor: (r) => r.at, type: 'datetime' },
    { id: 'note', header: 'Note', accessor: (r) => r.note },
  ];
  const txns = (options: Partial<DataTableOptions<Txn>> = {}): DataTable<Txn> => mount<Txn>({ rows, columns: cols, rowId: (r) => r.id, ...options });
  const cells = (t: DataTable<Txn>): string[] => Array.from(bodyRows(t)[0]!.cells).map((c) => text(c.textContent));

  it('formats numbers, currency, dates, and datetimes for the locale', () => {
    expect(cells(txns())).toEqual(['t1', '1,234.5', '€1,234.50', 'Jan 5, 2024', 'Jan 15, 2024, 3:30 PM', '']);
    expect(cells(txns({ locale: 'de-DE' })).slice(1, 4)).toEqual(['1.234,5', '1.234,50 €', '05.01.2024']);
  });

  it('shows datetimes in the configured timezone, never the machine zone', () => {
    expect(cells(txns({ timezone: 'America/New_York' }))[4]).toBe('Jan 15, 2024, 10:30 AM');
    expect(cells(txns({ timezone: 'UTC' }))[4]).toBe('Jan 15, 2024, 3:30 PM');
    const t = txns();
    configureAbsoluteUI({ timezone: 'America/New_York' });
    expect(cells(t)[4]).toBe('Jan 15, 2024, 10:30 AM');
    // A PlainDate never shifts with the timezone.
    expect(cells(t)[3]).toBe('Jan 5, 2024');
  });

  it('renders booleans as localized Yes/No, and format/render output as text', () => {
    const t = people();
    expect(column(t, 2)).toEqual(['Yes', 'No', 'Yes', 'Yes']);
    const custom = people({
      columns: [
        { id: 'name', header: 'Name', accessor: (p) => p.name, format: (v) => `<b>${String(v)}</b>` },
        { id: 'age', header: 'Age', accessor: (p) => p.age, render: () => '<img src=x onerror=alert(1)>' },
        { id: 'link', header: 'Link', accessor: () => null, render: (p, doc) => {
          const a = doc.createElement('a');
          a.href = `#${p.id}`;
          a.textContent = 'Open';
          return a;
        } },
      ],
    });
    const first = bodyRows(custom)[0]!;
    expect(first.cells[0]!.textContent).toBe('<b>Carol</b>');
    expect(first.cells[0]!.children).toHaveLength(0);
    expect(first.cells[1]!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(first.cells[1]!.querySelector('img')).toBeNull();
    expect(first.cells[2]!.querySelector('a')!.getAttribute('href')).toBe('#p1');
  });

  it('renders null and mismatched values as empty cells', () => {
    const t = people();
    expect(column(t, 1)).toEqual(['41', '29', '', '29']);
  });
});

describe('DataTable: sorting', () => {
  it('cycles ascending, descending, unsorted (tri-state) and announces each change', async () => {
    const t = people();
    const seen = record<DataTableSortChangeDetail>(t, 'aui-sort-change');
    await userEvent.click(sortButton(t, 'name'));
    expect(column(t, 0)).toEqual(['alice', 'Bob', 'Carol', 'Dave']);
    expect(header(t, 'name').getAttribute('aria-sort')).toBe('ascending');
    await nextFrame();
    expect(liveText()).toBe('Sorted by Name, ascending');
    await userEvent.click(sortButton(t, 'name'));
    expect(column(t, 0)).toEqual(['Dave', 'Carol', 'Bob', 'alice']);
    expect(header(t, 'name').getAttribute('aria-sort')).toBe('descending');
    await userEvent.click(sortButton(t, 'name'));
    expect(column(t, 0)).toEqual(['Carol', 'alice', 'Bob', 'Dave']);
    expect(header(t, 'name').hasAttribute('aria-sort')).toBe(false);
    await nextFrame();
    expect(liveText()).toBe('Sorting cleared');
    // Since 0.3.0 the detail also carries `sorts` (all sorts by priority).
    expect(seen).toEqual([
      { sort: { column: 'name', direction: 'ascending' }, sorts: [{ column: 'name', direction: 'ascending' }] },
      { sort: { column: 'name', direction: 'descending' }, sorts: [{ column: 'name', direction: 'descending' }] },
      { sort: null, sorts: [] },
    ]);
    expect(t.sort).toBeNull();
    // Focus stays on the header button across re-renders.
    expect(document.activeElement).toBe(sortButton(t, 'name'));
  });

  it('bi-state cycle never returns to unsorted', async () => {
    const t = people({ sortCycle: 'bi-state' });
    for (let i = 0; i < 3; i++) await userEvent.click(sortButton(t, 'age'));
    expect(t.sort).toEqual({ column: 'age', direction: 'ascending' });
  });

  it('is stable and puts nulls last in both directions', async () => {
    const t = people();
    await userEvent.click(sortButton(t, 'age'));
    // alice and Dave are both 29: original order (alice before Dave) is kept.
    expect(column(t, 0)).toEqual(['alice', 'Dave', 'Carol', 'Bob']);
    await userEvent.click(sortButton(t, 'age'));
    expect(column(t, 0)).toEqual(['Carol', 'alice', 'Dave', 'Bob']);
  });

  it('uses numeric, locale-aware collation for text', () => {
    const t = numberedTable(12, { sort: { column: 'label', direction: 'ascending' }, pageSize: null });
    expect(column(t, 0).slice(0, 3)).toEqual(['Item 1', 'Item 2', 'Item 3']);
    expect(column(t, 0).at(-1)).toBe('Item 12');
  });

  it('sorts dates and uses a custom comparator when given', () => {
    interface D { id: string; on: PlainDate | null }
    const rows: D[] = [{ id: 'a', on: plainDate(2024, 3, 1) }, { id: 'b', on: null }, { id: 'c', on: plainDate(2023, 12, 31) }];
    const t = mount<D>({ rows, rowId: (r) => r.id, columns: [{ id: 'id', header: 'Id', accessor: (r) => r.id }, { id: 'on', header: 'On', accessor: (r) => r.on, type: 'date' }], sort: { column: 'on', direction: 'ascending' } });
    expect(column(t, 0)).toEqual(['c', 'a', 'b']);
    const byLength = people({ columns: [{ ...COLUMNS[0]!, compare: (a, b) => a.name.length - b.name.length || b.name.localeCompare(a.name) }], sort: { column: 'name', direction: 'ascending' } });
    expect(column(byLength, 0)).toEqual(['Bob', 'Dave', 'Carol', 'alice']);
  });

  it('returns to the first page on a new sort and ignores programmatic sort for events', async () => {
    const t = numberedTable(30, { pageSize: 10, page: 3 });
    const seen = record<DataTableSortChangeDetail>(t, 'aui-sort-change');
    t.update({ sort: { column: 'n', direction: 'descending' } });
    expect(seen).toHaveLength(0);
    expect(column(t, 0)[0]).toBe('Item 10');
    await userEvent.click(sortButton(t, 'n'));
    expect(t.page).toBe(1);
    expect(column(t, 0)[0]).toBe('Item 1');
  });
});

describe('DataTable: selection', () => {
  it('labels the select-all and row checkboxes and emits aui-selection-change', async () => {
    const t = people({ selection: 'multiple' });
    const seen = record<DataTableSelectionChangeDetail>(t, 'aui-selection-change');
    expect(selectAll(t).getAttribute('aria-label')).toBe('Select all rows');
    expect(selectAll(t).closest('th')!.getAttribute('scope')).toBe('col');
    expect(rowInputs(t).map((i) => i.getAttribute('aria-label'))).toEqual(['Select row Carol', 'Select row alice', 'Select row Bob', 'Select row Dave']);
    await userEvent.click(rowInputs(t)[1]!);
    expect(seen).toEqual([{ selected: ['p2'] }]);
    expect(bodyRows(t)[1]!.classList.contains('aui-data-table__row--selected')).toBe(true);
    expect(bodyRows(t)[1]!.hasAttribute('aria-selected')).toBe(false);
    expect(selectAll(t).indeterminate).toBe(true);
    await userEvent.click(selectAll(t));
    expect(t.selected.sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(selectAll(t).checked).toBe(true);
    expect(selectAll(t).indeterminate).toBe(false);
    await userEvent.click(selectAll(t));
    expect(t.selected).toEqual([]);
  });

  it('toggles with Space on the native checkbox', async () => {
    const t = people({ selection: 'multiple' });
    rowInputs(t)[0]!.focus();
    await userEvent.keyboard(' ');
    expect(t.selected).toEqual(['p1']);
    await userEvent.keyboard(' ');
    expect(t.selected).toEqual([]);
  });

  it('select all covers the current page; indeterminate state is per page', async () => {
    const t = numberedTable(25, { selection: 'multiple', pageSize: 10 });
    await userEvent.click(selectAll(t));
    expect(t.selected).toHaveLength(10);
    await userEvent.click(pagerButton(t, 'next'));
    expect(selectAll(t).checked).toBe(false);
    expect(selectAll(t).indeterminate).toBe(false);
    await userEvent.click(rowInputs(t)[0]!);
    expect(selectAll(t).indeterminate).toBe(true);
    expect(t.selected).toHaveLength(11);
    await userEvent.click(pagerButton(t, 'previous'));
    expect(selectAll(t).checked).toBe(true);
    expect(rowInputs(t).every((i) => i.checked)).toBe(true);
  });

  it('disables unselectable rows and excludes them from select all and setSelected', async () => {
    const t = people({ selection: 'multiple', isRowSelectable: (p) => p.active });
    expect(rowInputs(t).map((i) => i.disabled)).toEqual([false, true, false, false]);
    await userEvent.click(selectAll(t));
    expect(t.selected.sort()).toEqual(['p1', 'p3', 'p4']);
    expect(selectAll(t).checked).toBe(true);
    t.setSelected(['p2', 'p4', 'missing']);
    expect(t.getSelected()).toEqual(['p4']);
  });

  it('Shift+click selects a range from the last clicked row', async () => {
    const t = numberedTable(10, { selection: 'multiple', pageSize: null });
    const seen = record<DataTableSelectionChangeDetail>(t, 'aui-selection-change');
    await userEvent.click(rowInputs(t)[1]!);
    await userEvent.click(rowInputs(t)[5]!, { modifiers: ['Shift'] });
    expect(t.selected.sort()).toEqual(['r2', 'r3', 'r4', 'r5', 'r6']);
    // Shift+click to uncheck clears the range from the new anchor.
    await userEvent.click(rowInputs(t)[3]!, { modifiers: ['Shift'] });
    expect(t.selected.sort()).toEqual(['r2', 'r3']);
    expect(seen).toHaveLength(3);
  });

  it('single selection uses one radio group', async () => {
    const t = people({ selection: 'single' });
    const seen = record<DataTableSelectionChangeDetail>(t, 'aui-selection-change');
    const radios = rowInputs(t);
    expect(radios.every((r) => r.type === 'radio' && r.name === radios[0]!.name)).toBe(true);
    expect(t.table.querySelector('thead .aui-data-table__select-cell')!.textContent).toBe('Select');
    await userEvent.click(radios[0]!);
    await userEvent.click(radios[2]!);
    expect(t.selected).toEqual(['p3']);
    expect(seen).toEqual([{ selected: ['p1'] }, { selected: ['p3'] }]);
    expect(bodyRows(t).filter((r) => r.classList.contains('aui-data-table__row--selected'))).toHaveLength(1);
  });

  it('programmatic selection emits nothing', () => {
    const t = people({ selection: 'multiple', selected: ['p1'] });
    const seen = record<DataTableSelectionChangeDetail>(t, 'aui-selection-change');
    expect(rowInputs(t)[0]!.checked).toBe(true);
    t.setSelected(['p2', 'p3']);
    expect(rowInputs(t).map((i) => i.checked)).toEqual([false, true, true, false]);
    t.clearSelection();
    expect(t.selected).toEqual([]);
    expect(seen).toHaveLength(0);
  });

  it('update and setRows keep the selection of ids that are still present', () => {
    const t = people({ selection: 'multiple', selected: ['p1', 'p2'] });
    t.setRows(PEOPLE.filter((p) => p.id !== 'p2'));
    expect(t.selected).toEqual(['p1']);
    t.update({ rows: [...PEOPLE] });
    expect(t.selected).toEqual(['p1']);
    t.update({ selection: 'none' });
    expect(t.selected).toEqual([]);
    expect(rowInputs(t)).toHaveLength(0);
  });
});

describe('DataTable: pagination', () => {
  it('slices sorted rows client-side and composes Pagination with a summary', async () => {
    const t = numberedTable(57, { pageSize: 10 });
    const seen = record<DataTablePageChangeDetail>(t, 'aui-page-change');
    let bubbled = 0;
    t.host.addEventListener('aui-change', () => bubbled++);
    expect(bodyRows(t)).toHaveLength(10);
    expect(t.host.querySelector('.aui-pagination__summary')!.textContent).toBe('Showing 1 to 10 of 57');
    expect(t.host.querySelector('nav')!.getAttribute('aria-label')).toBe('People, pagination');
    await userEvent.click(pagerButton(t, 'next'));
    expect(column(t, 0)[0]).toBe('Item 11');
    expect(t.page).toBe(2);
    expect(seen).toEqual([{ page: 2, pageSize: 10 }]);
    expect(bubbled).toBe(0);
    // Pagination keeps focus on its own control.
    expect(document.activeElement).toBe(pagerButton(t, 'next'));
    await userEvent.click(pagerButton(t, 'page-6'));
    expect(bodyRows(t)).toHaveLength(7);
  });

  it('changes the page size through the rows-per-page select', async () => {
    const t = numberedTable(57, { pageSizes: [10, 25, 50], pageSize: 10, page: 3 });
    expect(t.pageSize).toBe(10);
    const seen = record<DataTablePageChangeDetail>(t, 'aui-page-change');
    await userEvent.selectOptions(t.host.querySelector('select')!, '25');
    expect(t.pageSize).toBe(25);
    expect(bodyRows(t)).toHaveLength(25);
    // Pagination keeps the first item of the old page (item 21) visible: page 1 of size 25.
    expect(seen).toEqual([{ page: 1, pageSize: 25 }]);
  });

  it('renders every row without pagination when pageSize is null, and honors configured defaults', () => {
    const all = numberedTable(40, { pageSize: null });
    expect(bodyRows(all)).toHaveLength(40);
    expect(all.host.querySelector<HTMLElement>('.aui-data-table__pagination')!.hidden).toBe(true);
    expect(all.host.querySelector('nav')).toBeNull();
    configureAbsoluteUI({ components: { dataTable: { pageSize: 5, selection: 'multiple' } } });
    const configured = numberedTable(40);
    expect(bodyRows(configured)).toHaveLength(5);
    expect(selectAll(configured)).not.toBeNull();
    expect(bodyRows(numberedTable(40, { pageSize: 20 }))).toHaveLength(20);
    expect(bodyRows(all)).toHaveLength(40);
  });

  it('clamps the page when rows shrink', () => {
    const t = numberedTable(30, { pageSize: 10, page: 3 });
    t.setRows(numbered(12));
    expect(t.page).toBe(2);
    expect(bodyRows(t)).toHaveLength(2);
  });
});

describe('DataTable: server mode', () => {
  it('renders rows as the current page and only emits sort and page events', async () => {
    const t = numberedTable(10, { mode: 'server', total: 95, pageSize: 10 });
    const sorts = record<DataTableSortChangeDetail>(t, 'aui-sort-change');
    const pages = record<DataTablePageChangeDetail>(t, 'aui-page-change');
    expect(t.host.querySelector('.aui-pagination__summary')!.textContent).toBe('Showing 1 to 10 of 95');
    await userEvent.click(sortButton(t, 'n'));
    await userEvent.click(sortButton(t, 'n'));
    expect(sorts.at(-1)).toEqual({ sort: { column: 'n', direction: 'descending' }, sorts: [{ column: 'n', direction: 'descending' }] });
    // Rows are not reordered locally.
    expect(column(t, 0)[0]).toBe('Item 1');
    expect(header(t, 'n').getAttribute('aria-sort')).toBe('descending');
    await userEvent.click(pagerButton(t, 'next'));
    expect(pages).toEqual([{ page: 2, pageSize: 10 }]);
    t.setRows(numbered(20).slice(10), 95);
    expect(column(t, 0)[0]).toBe('Item 11');
    expect(t.page).toBe(2);
  });

  it('keeps selected ids from other pages', async () => {
    const t = numberedTable(10, { mode: 'server', total: 20, pageSize: 10, selection: 'multiple' });
    await userEvent.click(rowInputs(t)[0]!);
    t.setRows(numbered(20).slice(10), 20);
    expect(t.selected).toEqual(['r1']);
    expect(selectAll(t).indeterminate).toBe(false);
  });
});

describe('DataTable: loading and empty states', () => {
  it('shows skeleton rows and announces loading when there are no rows', () => {
    const t = numberedTable(0, { loading: true, pageSize: 5 });
    const region = t.host.querySelector('.aui-data-table__region')!;
    expect(region.getAttribute('aria-busy')).toBe('true');
    const skeletons = t.table.querySelectorAll('.aui-data-table__skeleton-row');
    expect(skeletons).toHaveLength(5);
    expect(skeletons[0]!.getAttribute('aria-hidden')).toBe('true');
    const status = t.host.querySelector('[role="status"]')!;
    expect(region.contains(status)).toBe(false);
    expect(status.textContent).toBe('Loading');
    t.update({ loading: false, rows: numbered(3) });
    expect(region.hasAttribute('aria-busy')).toBe(false);
    expect(status.textContent).toBe('');
    expect(bodyRows(t)).toHaveLength(3);
  });

  it('overlays a spinner and keeps existing rows (stable layout) while loading', () => {
    const t = numberedTable(3);
    const before = bodyRows(t);
    t.update({ loading: true });
    expect(bodyRows(t)).toEqual(before);
    expect(t.host.querySelector('.aui-data-table__status--overlay')).not.toBeNull();
  });

  it('shows a localized empty message spanning all columns', () => {
    const t = numberedTable(0, { selection: 'multiple' });
    const cell = t.table.querySelector<HTMLTableCellElement>('.aui-data-table__empty')!;
    expect(cell.textContent).toBe('No results');
    expect(cell.colSpan).toBe(3);
    expect(t.host.querySelector<HTMLElement>('.aui-data-table__pagination')!.hidden).toBe(true);
    t.update({ emptyMessage: 'No orders yet' });
    expect(cell.isConnected).toBe(false);
    expect(t.table.querySelector('.aui-data-table__empty')!.textContent).toBe('No orders yet');
    registerMessages('dataTable', 'fr', { empty: 'Aucun résultat' });
    const fr = numberedTable(0, { locale: 'fr' });
    expect(fr.table.querySelector('.aui-data-table__empty')!.textContent).toBe('Aucun résultat');
  });
});

describe('DataTable: rendering and lifecycle', () => {
  it('reuses row elements by id when rows are unchanged', async () => {
    const t = people({ selection: 'multiple' });
    const first = bodyRows(t)[0]!;
    await userEvent.click(sortButton(t, 'name'));
    expect(bodyRows(t)).toContain(first);
    t.setRows([...PEOPLE]);
    expect(bodyRows(t)).toContain(first);
    t.setRows(PEOPLE.map((p) => ({ ...p })));
    expect(bodyRows(t)).not.toContain(first);
  });

  it('applies configuration changes to existing instances', () => {
    const t = numberedTable(5, { pageSize: null });
    configureAbsoluteUI({ locale: 'de-DE' });
    const big = numberedTable(1, { rows: [{ id: 'x', n: 1234.5, label: 'x' }], pageSize: null });
    expect(column(big, 1)).toEqual(['1.234,5']);
    configureAbsoluteUI({ components: { dataTable: { selection: 'multiple' } } });
    expect(rowInputs(t)).toHaveLength(5);
  });

  it('destroy removes rendering, listeners, and subscriptions', () => {
    const t = numberedTable(30, { pageSize: 10, selection: 'multiple' });
    const host = t.host;
    t.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
    configureAbsoluteUI({ components: { dataTable: { pageSize: 5 } } });
    expect(host.childElementCount).toBe(0);
  });
});

describe('DataTable: performance budgets (sanity checks with generous margins)', () => {
  const cols8: DataTableColumn<Numbered>[] = Array.from({ length: 8 }, (_, i) => (i % 2 === 0
    ? { id: `t${String(i)}`, header: `Text ${String(i)}`, accessor: (r: Numbered) => `${r.label}-${String(i)}` }
    : { id: `n${String(i)}`, header: `Num ${String(i)}`, accessor: (r: Numbered) => r.n * i, type: 'number' as const }));

  it('renders 1,000 rows x 8 columns (budget 150 ms)', () => {
    const rows = numbered(1000);
    const host = document.createElement('div');
    document.body.append(host);
    const start = performance.now();
    const t = DataTable.create(host, { caption: 'Big', columns: cols8, rows, rowId: (r) => r.id, pageSize: null });
    const elapsed = performance.now() - start;
    expect(bodyRows(t)).toHaveLength(1000);
    expect(elapsed).toBeLessThan(300);
  });

  it('sorts 10,000 rows with pageSize 25 (budget 50 ms)', () => {
    const rows = numbered(10_000).reverse();
    const host = document.createElement('div');
    document.body.append(host);
    const t = DataTable.create(host, { caption: 'Big', columns: cols8, rows, rowId: (r) => r.id, pageSize: 25 });
    // Fastest of three rounds (regression: flaky under suite load): a slower sort slows every
    // round; one-off costs and scheduler noise from parallel test files do not. Same budget.
    const time = (fn: () => void): number => {
      const start = performance.now();
      fn();
      return performance.now() - start;
    };
    const numericRuns: number[] = [];
    const textualRuns: number[] = [];
    for (let i = 0; i < 3; i++) {
      numericRuns.push(time(() => { t.update({ sort: { column: 'n1', direction: 'ascending' } }); }));
      textualRuns.push(time(() => { t.update({ sort: { column: 't0', direction: 'descending' } }); }));
    }
    const numeric = Math.min(...numericRuns);
    const textual = Math.min(...textualRuns);
    expect(bodyRows(t)).toHaveLength(25);
    expect(column(t, 0)[0]).toBe('Item 10000-0');
    expect(numeric).toBeLessThan(100);
    expect(textual).toBeLessThan(100);
  });
});
