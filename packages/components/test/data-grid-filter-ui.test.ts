import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { plainDate, resetAbsoluteUIConfig, type PlainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { DataGrid, type DataGridFilterChangeDetail, type DataGridOptions } from '@absoluteui/components/data-grid';
import { formatNumberSyntax, parseNumberSyntax, summarizeFilter } from '../src/data-grid/filter-ui.js';

// docs/PLAN-R11-G2.md (G2b): filter panel, floating filters, and the search box.
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface R {
  id: string;
  name: string;
  age: number | null;
  city: string;
  active: boolean | null;
  joined: PlainDate | null;
}

const rows: R[] = [
  { id: 'a', name: 'Ann', age: 31, city: 'Oslo', active: true, joined: plainDate(2026, 1, 5) },
  { id: 'b', name: 'Bob', age: 5, city: 'Lima', active: false, joined: plainDate(2025, 6, 1) },
  { id: 'c', name: 'Cid', age: null, city: '', active: null, joined: null },
  { id: 'd', name: 'Dee', age: 120, city: 'Oslo', active: true, joined: plainDate(2026, 3, 9) },
  { id: 'e', name: 'Eve', age: 47, city: 'Pune', active: false, joined: plainDate(2024, 12, 24) },
];
const calendar = createBusinessCalendar({});

function mount(options: Partial<DataGridOptions<R>> = {}): DataGrid<R> {
  const host = document.createElement('div');
  host.style.setProperty('block-size', '400px');
  host.style.setProperty('display', 'flex');
  host.style.setProperty('flex-direction', 'column');
  document.body.append(host);
  return DataGrid.create(host, {
    label: 'People',
    rows,
    rowId: (r) => r.id,
    filterDelay: 0,
    locale: 'en-US',
    columns: [
      { id: 'name', header: 'Name', field: 'name', filter: 'text' },
      { id: 'age', header: 'Age', field: 'age', type: 'number', filter: 'number' },
      { id: 'city', header: 'City', field: 'city', filter: 'set' },
      { id: 'active', header: 'Active', field: 'active', type: 'boolean', filter: 'boolean' },
      { id: 'joined', header: 'Joined', field: 'joined', type: 'date', filter: 'date' },
      { id: 'note', header: 'Note', accessor: () => 'x' },
    ],
    ...options,
  });
}

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));
const shown = (g: DataGrid<R>): string[] => [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__row')].map((r) => r.dataset.rowId ?? '').sort();
const header = (g: DataGrid<R>, id: string): HTMLElement => g.host.querySelector<HTMLElement>(`[role="columnheader"][data-column="${id}"]`)!;
const filterButton = (g: DataGrid<R>, id: string): HTMLButtonElement => header(g, id).querySelector<HTMLButtonElement>('.aui-data-grid__filter-button')!;
const panel = (g: DataGrid<R>): HTMLElement | null => g.host.querySelector<HTMLElement>('.aui-data-grid__filter-panel');
const nameOf = (el: Element): string => (el.getAttribute('aria-labelledby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join('');
function type(input: HTMLInputElement | HTMLSelectElement, value: string, event: 'input' | 'change' = 'input'): void {
  input.value = value;
  input.dispatchEvent(new Event(event, { bubbles: true }));
}
function events(g: DataGrid<R>): DataGridFilterChangeDetail[] {
  const list: DataGridFilterChangeDetail[] = [];
  g.host.addEventListener('aui-filter-change', (e) => list.push((e as CustomEvent<DataGridFilterChangeDetail>).detail));
  return list;
}

describe('floating filter syntax and summaries', () => {
  it('parses and formats the number syntax', () => {
    expect(parseNumberSyntax('5', 'number')).toEqual({ operator: 'equals', value: 5 });
    expect(parseNumberSyntax(' >= 2.5 ', 'number')).toEqual({ operator: 'greaterThanOrEqual', value: 2.5 });
    expect(parseNumberSyntax('<>0', 'number')).toEqual({ operator: 'notEquals', value: 0 });
    expect(parseNumberSyntax('5..10', 'number')).toEqual({ operator: 'between', value: 5, to: 10 });
    expect(parseNumberSyntax('-3 .. 4', 'number')).toEqual({ operator: 'between', value: -3, to: 4 });
    expect(parseNumberSyntax('', 'number')).toBeNull();
    expect(parseNumberSyntax('>x', 'number')).toBe('invalid');
    expect(parseNumberSyntax('1.5', 'bigint')).toBe('invalid');
    expect(parseNumberSyntax('<9007199254740993', 'bigint')).toEqual({ operator: 'lessThan', value: '9007199254740993' });
    expect(formatNumberSyntax({ operator: 'lessThanOrEqual', value: 10 })).toBe('<=10');
    expect(formatNumberSyntax({ operator: 'between', value: 1, to: 2 })).toBe('1..2');
    expect(formatNumberSyntax({ operator: 'blank' })).toBeNull();
  });

  it('summarizes filters in words', () => {
    expect(summarizeFilter({ kind: 'text', join: 'or', conditions: [{ operator: 'contains', value: 'an' }, { operator: 'blank' }] }, 'en-US')).toBe('Contains "an" OR Blank');
    expect(summarizeFilter({ kind: 'number', conditions: [{ operator: 'between', value: 1000, to: 2000 }] }, 'en-US')).toBe('Between 1,000 and 2,000');
    expect(summarizeFilter({ kind: 'date', conditions: [{ operator: 'lastDays', count: 7 }] }, 'en-US')).toBe('Last 7 days');
    expect(summarizeFilter({ kind: 'date', conditions: [{ operator: 'onOrAfter', value: '2026-01-05' }] }, 'en-US')).toBe('On or after Jan 5, 2026');
    expect(summarizeFilter({ kind: 'set', values: [null] }, 'en-US')).toBe('(Blanks)');
    expect(summarizeFilter({ kind: 'set', values: ['a', 'b'] }, 'en-US')).toBe('2 selected');
    expect(summarizeFilter({ kind: 'boolean', value: false }, 'en-US')).toBe('No');
  });
});

describe('filter panel', () => {
  it('adds a filter button to filterable headers only; the header name leaves the button out', () => {
    const g = mount();
    const button = filterButton(g, 'name');
    expect(button.getAttribute('aria-label')).toBe('Filter Name');
    expect(button.tabIndex).toBe(-1);
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(header(g, 'note').querySelector('.aui-data-grid__filter-button')).toBeNull();
    expect(nameOf(header(g, 'name'))).toBe('Name');
  });

  it('opens from the button without sorting; typed values apply, announce, and emit; Escape returns focus to the header', async () => {
    const g = mount();
    const seen = events(g);
    filterButton(g, 'name').click();
    expect(g.sort).toEqual([]);
    const dialog = panel(g)!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(nameOf(dialog)).toBe('Name filter');
    expect(dialog.matches(':popover-open')).toBe(true);
    expect(filterButton(g, 'name').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(dialog.querySelector('select'));
    type(dialog.querySelector<HTMLInputElement>('input[aria-label="Condition 1 value"]')!, 'e');
    await tick();
    expect(shown(g)).toEqual(['d', 'e']);
    expect(seen.at(-1)?.filters).toEqual({ name: { kind: 'text', conditions: [{ operator: 'contains', value: 'e' }] } });
    expect(header(g, 'name').classList.contains('aui-data-grid__header-cell--filtered')).toBe(true);
    expect(nameOf(header(g, 'name'))).toBe('Name, filtered');
    await userEvent.keyboard('{Escape}');
    expect(panel(g)).toBeNull();
    expect(document.activeElement).toBe(header(g, 'name'));
    expect(filterButton(g, 'name').getAttribute('aria-expanded')).toBe('false');
  });

  it('offers the next condition once the previous one is complete, joined with AND or OR', async () => {
    const g = mount();
    filterButton(g, 'age').click();
    const dialog = panel(g)!;
    const groups = dialog.querySelectorAll<HTMLElement>('.aui-data-grid__filter-condition');
    expect(groups).toHaveLength(2);
    expect(groups[1]?.hidden).toBe(true);
    type(dialog.querySelector<HTMLSelectElement>('select[aria-label="Condition 1 operator"]')!, 'lessThan', 'change');
    type(dialog.querySelector<HTMLInputElement>('input[aria-label="Condition 1 value"]')!, '10');
    await tick();
    expect(shown(g)).toEqual(['b']);
    expect(groups[1]?.hidden).toBe(false);
    dialog.querySelector<HTMLInputElement>('input[type="radio"][value="or"]')!.click();
    type(dialog.querySelector<HTMLSelectElement>('select[aria-label="Condition 2 operator"]')!, 'greaterThan', 'change');
    type(dialog.querySelector<HTMLInputElement>('input[aria-label="Condition 2 value"]')!, '100');
    await tick();
    expect(shown(g)).toEqual(['b', 'd']);
    expect(g.getFilters().age).toEqual({ kind: 'number', join: 'or', conditions: [{ operator: 'lessThan', value: 10 }, { operator: 'greaterThan', value: 100 }] });
    dialog.querySelector<HTMLButtonElement>('.aui-data-grid__filter-clear')!.click();
    expect(g.getFilters()).toEqual({});
    expect(shown(g)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('set filter: sorted values with blanks first, tri-state select all, search', () => {
    const g = mount();
    filterButton(g, 'city').click();
    const dialog = panel(g)!;
    const labels = (): string[] => [...dialog.querySelectorAll('.aui-data-grid__filter-values label')].map((l) => l.textContent);
    expect(labels()).toEqual(['(Blanks)', 'Lima', 'Oslo', 'Pune']);
    const all = dialog.querySelector<HTMLInputElement>('.aui-data-grid__filter-select-all input')!;
    expect(all.checked).toBe(true);
    const oslo = dialog.querySelectorAll<HTMLInputElement>('.aui-data-grid__filter-values input')[2]!;
    oslo.click();
    expect(shown(g)).toEqual(['b', 'c', 'e']);
    expect(all.indeterminate).toBe(true);
    all.click();
    expect(g.getFilters()).toEqual({});
    type(dialog.querySelector<HTMLInputElement>('input[type="search"]')!, 'o');
    expect(labels()).toEqual(['Oslo']);
    all.click();
    expect(g.getFilters().city).toEqual({ kind: 'set', values: [null, 'Lima', 'Pune'] });
    expect(shown(g)).toEqual(['b', 'c', 'e']);
  });

  it('boolean filter: Any, Yes, No, Blank', () => {
    const g = mount();
    filterButton(g, 'active').click();
    panel(g)!.querySelector<HTMLInputElement>('input[value="blank"]')!.click();
    expect(shown(g)).toEqual(['c']);
    panel(g)!.querySelector<HTMLInputElement>('input[value=""]')!.click();
    expect(g.getFilters()).toEqual({});
  });

  it('date filter groups operators; business days only with a business calendar; counted operators take a count', async () => {
    const g = mount();
    filterButton(g, 'joined').click();
    const groups = (): string[] => [...panel(g)!.querySelectorAll('select[aria-label="Condition 1 operator"] optgroup')].map((o) => o.getAttribute('label') ?? '');
    expect(groups()).toEqual(['Dates', 'Relative dates']);
    const select = panel(g)!.querySelector<HTMLSelectElement>('select[aria-label="Condition 1 operator"]')!;
    type(select, 'lastDays', 'change');
    const count = panel(g)!.querySelector<HTMLInputElement>('input[aria-label="Condition 1 number of days"]')!;
    expect(count.hidden).toBe(false);
    expect(panel(g)!.querySelector<HTMLInputElement>('input[aria-label="Condition 1 value"]')!.hidden).toBe(true);
    type(select, 'before', 'change');
    type(panel(g)!.querySelector<HTMLInputElement>('input[aria-label="Condition 1 value"]')!, '2026-01-01');
    await tick();
    expect(shown(g)).toEqual(['b', 'e']);
    const other = mount({ columns: [{ id: 'joined', header: 'Joined', field: 'joined', type: 'date', filter: 'date', businessCalendar: calendar }] });
    filterButton(other, 'joined').click();
    expect([...panel(other)!.querySelectorAll('select[aria-label="Condition 1 operator"] optgroup')].map((o) => o.getAttribute('label'))).toEqual(['Dates', 'Relative dates', 'Business days']);
  });

  it('F2 reaches the header button; Alt+ArrowDown opens the panel; programmatic filters update the header in place', async () => {
    const g = mount();
    header(g, 'name').focus();
    await userEvent.keyboard('{F2}');
    expect(document.activeElement).toBe(filterButton(g, 'name'));
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(header(g, 'name'));
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(panel(g)).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    const before = header(g, 'age');
    g.setFilter('age', { kind: 'number', conditions: [{ operator: 'greaterThan', value: 40 }] });
    expect(header(g, 'age')).toBe(before);
    expect(before.classList.contains('aui-data-grid__header-cell--filtered')).toBe(true);
    expect(shown(g)).toEqual(['d', 'e']);
  });

  it('closes when the grid is destroyed', () => {
    const g = mount();
    filterButton(g, 'name').click();
    g.destroy();
    expect(document.querySelector('.aui-data-grid__filter-panel')).toBeNull();
  });
});

describe('floating filters and the search box', () => {
  const floating = (g: DataGrid<R>, id: string): HTMLElement => g.host.querySelector<HTMLElement>(`.aui-data-grid__floating-cell[data-column="${id}"]`)!;
  const control = (g: DataGrid<R>, id: string): HTMLElement => floating(g, id).querySelector<HTMLElement>('.aui-data-grid__floating-control')!;
  const input = (g: DataGrid<R>, id: string): HTMLInputElement => floating(g, id).querySelector<HTMLInputElement>('input.aui-data-grid__floating-control')!;
  const select = (g: DataGrid<R>, id: string): HTMLSelectElement => floating(g, id).querySelector<HTMLSelectElement>('select.aui-data-grid__floating-control')!;
  const summary = (g: DataGrid<R>, id: string): HTMLButtonElement => floating(g, id).querySelector<HTMLButtonElement>('button.aui-data-grid__floating-control')!;

  it('adds a header row of labelled controls and counts it in the row indexes', () => {
    const g = mount({ floatingFilters: true });
    const row = g.host.querySelector('.aui-data-grid__floating-row')!;
    expect(row.getAttribute('role')).toBe('row');
    expect(row.getAttribute('aria-rowindex')).toBe('2');
    expect(g.element.getAttribute('aria-rowcount')).toBe('7');
    expect(g.host.querySelector('.aui-data-grid__row')?.getAttribute('aria-rowindex')).toBe('3');
    expect(floating(g, 'name').getAttribute('role')).toBe('gridcell');
    expect(input(g, 'name').getAttribute('aria-label')).toBe('Name filter');
    expect(floating(g, 'note').childElementCount).toBe(0);
  });

  it('text contains, number syntax with invalid input flagged, boolean choice; complex filters show a read-only summary', async () => {
    const g = mount({ floatingFilters: true });
    const seen = events(g);
    type(input(g, 'name'), 'b');
    await tick();
    expect(shown(g)).toEqual(['b']);
    expect(seen).toHaveLength(1);
    type(input(g, 'name'), '');
    const age = input(g, 'age');
    type(age, '>x');
    await tick();
    expect(age.getAttribute('aria-invalid')).toBe('true');
    type(age, '30..50');
    await tick();
    expect(age.hasAttribute('aria-invalid')).toBe(false);
    expect(shown(g)).toEqual(['a', 'e']);
    type(select(g, 'active'), 'true', 'change');
    expect(shown(g)).toEqual(['a']);
    g.setFilter('name', { kind: 'text', join: 'or', conditions: [{ operator: 'startsWith', value: 'a' }, { operator: 'startsWith', value: 'd' }] });
    const name = input(g, 'name');
    expect(name.readOnly).toBe(true);
    expect(name.value).toBe('Starts with "a" OR Starts with "d"');
    g.setFilter('name', { kind: 'text', conditions: [{ operator: 'startsWith', value: 'a' }] });
    expect(name.readOnly).toBe(false);
    expect(name.value).toBe('a');
  });

  it('set floating control opens the panel; keyboard moves between headers, floating cells, and rows', async () => {
    const g = mount({ floatingFilters: true });
    const city = summary(g, 'city');
    expect(city.textContent).toContain('Any');
    city.click();
    expect(panel(g)).not.toBeNull();
    expect(city.getAttribute('aria-expanded')).toBe('true');
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(city);
    header(g, 'name').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(floating(g, 'name'));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(floating(g, 'age'));
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(control(g, 'age'));
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(floating(g, 'age'));
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.closest('.aui-data-grid__row')?.getAttribute('data-row-id')).toBe('a');
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(floating(g, 'age'));
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(header(g, 'age'));
  });

  it('keeps a focused floating input while the filter applies', async () => {
    const g = mount({ floatingFilters: true });
    const name = input(g, 'name');
    name.focus();
    type(name, 'e');
    await tick();
    expect(document.activeElement).toBe(name);
    expect(name.value).toBe('e');
  });

  it('search box sets the quick filter as the user types', async () => {
    const g = mount({ searchBox: true });
    const seen = events(g);
    const bar = g.host.querySelector('.aui-data-grid__toolbar [role="search"]')!;
    expect(bar.closest('.aui-data-grid__toolbar')).not.toBeNull();
    expect(bar.getAttribute('aria-label')).toBe('Search People');
    const field = bar.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(field.closest('label')?.textContent).toBe('Search');
    type(field, 'oslo');
    await tick();
    expect(shown(g)).toEqual(['a', 'd']);
    expect(seen.at(-1)?.quickFilter).toBe('oslo');
    g.setQuickFilter('pune');
    expect(field.value).toBe('pune');
    g.update({ searchBox: false });
    expect(g.host.querySelector('.aui-data-grid__toolbar')).toBeNull();
  });
});
