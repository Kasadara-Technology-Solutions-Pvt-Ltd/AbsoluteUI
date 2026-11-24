import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { plainDate, resetAbsoluteUIConfig, type PlainDate } from '@absoluteui/core';
import { DataGrid, type DataGridGroupChangeDetail, type DataGridOptions, type DataGridRowGroupToggleDetail } from '@absoluteui/components/data-grid';
import { aggregateValues, buildGroups, flattenGroups, keyId } from '../src/data-grid/grouping.js';

// docs/PLAN-R11-G5.md (G5a): row grouping and aggregation.
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = [
    '.aui-data-grid{display:flex;flex-direction:column;block-size:500px;inline-size:900px}',
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
  dept: string;
  city: string;
  salary: number;
  name: string;
}
const rows: P[] = [
  { id: '1', dept: 'Eng', city: 'Oslo', salary: 100, name: 'Ann' },
  { id: '2', dept: 'Eng', city: 'Lima', salary: 200, name: 'Bob' },
  { id: '3', dept: 'Ops', city: 'Oslo', salary: 50, name: 'Cid' },
  { id: '4', dept: 'Eng', city: 'Oslo', salary: 300, name: 'Dee' },
  { id: '5', dept: '', city: 'Pune', salary: 10, name: 'Eve' },
];

describe('grouping engine', () => {
  it('groups by levels (blanks last), aggregates from the leaves, and flattens for the expansion', () => {
    const items = rows.map((row, index) => ({ row, id: row.id, index }));
    const groups = buildGroups(
      items,
      [
        { column: 'dept', key: (r: P) => r.dept, compare: (a, b) => String(a).localeCompare(String(b)), direction: 'ascending' },
        { column: 'city', key: (r: P) => r.city, compare: (a, b) => String(a).localeCompare(String(b)), direction: 'descending' },
      ],
      [{ column: 'salary', aggregate: 'avg', read: (r: P) => r.salary }],
    );
    expect(groups.map((g) => g.key)).toEqual(['Eng', 'Ops', null]);
    const eng = groups[0]!;
    expect(eng.groups.map((g) => g.key)).toEqual(['Oslo', 'Lima']);
    // The average over all leaves (200), not the average of the city averages (150).
    expect(eng.aggregates.get('salary')).toBe(200);
    const flat = flattenGroups(groups, { expanded: (n) => n.level === 0 && n.id === eng.id, groupTotals: true });
    expect(flat.map((d) => (d.kind === 'group' ? `g:${String(d.node.key)}` : d.kind === 'total' ? 't' : d.kind === 'data' ? `d:${d.item.id}` : 'x'))).toEqual(['g:Eng', 'g:Oslo', 'g:Lima', 't', 'g:Ops', 'g:null']);
  });

  it('aggregates: sum, min, max, count, first, last, BigInt sums, custom', () => {
    const ctx = { column: 'x', rows: [] };
    expect(aggregateValues('sum', [1, 2, null, 'x'], ctx)).toBe(3);
    expect(aggregateValues('count', [1, null, '', 3], ctx)).toBe(2);
    expect(aggregateValues('min', [5, 2, 9], ctx)).toBe(2);
    expect(aggregateValues('max', ['b', 'a'], ctx)).toBe('b');
    expect(aggregateValues('first', [null, 4, 5], ctx)).toBe(4);
    expect(aggregateValues('sum', [9007199254740993n, 1n], ctx)).toBe(9007199254740994n);
    expect(aggregateValues((values) => values.length * 10, [1, 2], ctx)).toBe(20);
    expect(keyId(null)).toBe(keyId(''));
  });
});

function mount(options: Partial<DataGridOptions<P>> = {}): DataGrid<P> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create(host, {
    label: 'Staff',
    rows,
    rowId: (r) => r.id,
    rowHeight: 30,
    locale: 'en-US',
    groupBy: ['dept'],
    columns: [
      { id: 'name', header: 'Name', field: 'name' },
      { id: 'dept', header: 'Department', field: 'dept' },
      { id: 'city', header: 'City', field: 'city' },
      { id: 'salary', header: 'Salary', field: 'salary', type: 'number', aggregate: 'sum' },
    ],
    ...options,
  });
}
const visibleRows = (g: DataGrid<P>): string[] =>
  [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__row')]
    .sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex')))
    .map((r) => r.dataset.rowId ?? '');
const row = (g: DataGrid<P>, id: string): HTMLElement => g.host.querySelector<HTMLElement>(`.aui-data-grid__row[data-row-id="${CSS.escape(id)}"]`)!;
const groupId = (g: DataGrid<P>, key: string | null): string => g.getGroups().find((x) => x.key === key)!.id;

describe('DataGrid grouping', () => {
  it('renders a treegrid of collapsed groups with counts and aggregates; grouped columns hide', () => {
    const g = mount();
    expect(g.element.getAttribute('role')).toBe('treegrid');
    expect(g.getColumnsState().order).toEqual(['name', 'dept', 'city', 'salary']);
    expect([...g.host.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent)).toEqual(['Group', 'Name', 'City', 'Salary']);
    const eng = row(g, groupId(g, 'Eng'));
    expect(visibleRows(g)).toHaveLength(3);
    expect(eng.getAttribute('aria-level')).toBe('1');
    expect(eng.getAttribute('aria-expanded')).toBe('false');
    expect(eng.getAttribute('aria-setsize')).toBe('3');
    expect(eng.querySelector('[data-column="aui-group"]')?.textContent).toBe('Eng (3)');
    expect(eng.querySelector('[data-column="salary"]')?.textContent).toBe('600');
    expect(row(g, groupId(g, null)).querySelector('[data-column="aui-group"]')?.textContent).toBe('(Blanks) (1)');
  });

  it('keyboard: Right expands, Left collapses or moves to the group, Enter toggles; toggles announce and emit', async () => {
    const g = mount();
    const seen: DataGridRowGroupToggleDetail[] = [];
    g.host.addEventListener('aui-row-group-toggle', (e) => seen.push((e as CustomEvent<DataGridRowGroupToggleDetail>).detail));
    const eng = groupId(g, 'Eng');
    row(g, eng).querySelector<HTMLElement>('[data-column="aui-group"]')!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(row(g, eng).getAttribute('aria-expanded')).toBe('true');
    expect(seen).toEqual([{ groupId: eng, expanded: true }]);
    expect(visibleRows(g)).toEqual([eng, '1', '2', '4', groupId(g, 'Ops'), groupId(g, null)]);
    expect(row(g, '1').getAttribute('aria-level')).toBe('2');
    await userEvent.keyboard('{ArrowDown}{ArrowLeft}');
    expect(document.activeElement?.closest('.aui-data-grid__row')?.getAttribute('data-row-id')).toBe(eng);
    await userEvent.keyboard('{ArrowLeft}');
    expect(row(g, eng).getAttribute('aria-expanded')).toBe('false');
    await userEvent.keyboard('{Enter}');
    expect(row(g, eng).getAttribute('aria-expanded')).toBe('true');
    // Group rows are not editable.
    expect(g.startEditing(eng, 'name')).toBe(false);
  });

  it('two levels with totals; expand and collapse all; state round-trips groupBy and expansion', () => {
    const g = mount({ groupBy: ['dept', 'city'], groupTotals: 'bottom', grandTotal: 'bottom', groupDefaultExpanded: 1 });
    // Level 0 open, level 1 closed: Eng > (Oslo, Lima), total; Ops > (Oslo), total; Blanks > (Pune), total; grand total.
    expect(visibleRows(g)).toHaveLength(11);
    const grand = row(g, 'total:grand');
    expect(grand.querySelector('[data-column="aui-group"]')?.textContent).toBe('Total');
    expect(grand.querySelector('[data-column="salary"]')?.textContent).toBe('660');
    g.expandAll();
    expect(row(g, '4').getAttribute('aria-level')).toBe('3');
    g.collapseAll();
    expect(visibleRows(g)).toEqual([groupId(g, 'Eng'), groupId(g, 'Ops'), groupId(g, null), 'total:grand']);
    g.setExpanded(groupId(g, 'Ops'), true);
    const state = JSON.parse(JSON.stringify(g.getState())) as unknown;
    const other = mount({ groupBy: [] });
    expect(other.element.getAttribute('role')).toBe('grid');
    other.setState(state);
    expect(other.element.getAttribute('role')).toBe('treegrid');
    expect(row(other, other.getGroups()[1]!.id).getAttribute('aria-expanded')).toBe('true');
  });

  it('copy reads group labels and aggregates; sorting a grouped column orders the groups', () => {
    const g = mount({ cellSelection: true, sort: { column: 'dept', direction: 'descending' } });
    expect(g.getGroups().map((x) => x.key)).toEqual(['Ops', 'Eng', null]);
    g.addCellRange({ startRow: groupId(g, 'Ops'), endRow: groupId(g, 'Eng'), startColumn: 'aui-group', endColumn: 'salary' });
    row(g, groupId(g, 'Ops')).querySelector<HTMLElement>('[data-column="aui-group"]')!.focus();
    const data = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    expect(data.getData('text/plain')).toBe('Ops\t\t\t50\r\nEng\t\t\t600');
  });
});

describe('group panel, date hierarchies, show values as (G5b)', () => {
  it('the panel lists row groups; buttons reorder and remove; the picker adds groupable columns; changes announce and emit', () => {
    const g = mount({
      groupPanel: true,
      groupBy: ['dept'],
      columns: [
        { id: 'name', header: 'Name', field: 'name' },
        { id: 'dept', header: 'Department', field: 'dept', groupable: true },
        { id: 'city', header: 'City', field: 'city', groupable: true },
        { id: 'salary', header: 'Salary', field: 'salary', type: 'number', aggregate: 'sum' },
      ],
    });
    const seen: DataGridGroupChangeDetail[] = [];
    g.host.addEventListener('aui-group-change', (e) => seen.push((e as CustomEvent<DataGridGroupChangeDetail>).detail));
    const panel = g.host.querySelector<HTMLElement>('.aui-data-grid__group-panel')!;
    expect(panel.getAttribute('role')).toBe('group');
    expect(panel.getAttribute('aria-label')).toBe('Row groups');
    const pills = (): string[] => [...panel.querySelectorAll('.aui-data-grid__group-pill')].map((p) => p.textContent);
    expect(pills()).toEqual(['Department']);
    const picker = panel.querySelector<HTMLSelectElement>('select')!;
    expect(picker.getAttribute('aria-label')).toBe('Add a row group');
    expect([...picker.options].map((o) => o.textContent)).toEqual(['Add a column', 'City']);
    picker.value = 'city';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seen.at(-1)).toEqual({ groupBy: ['dept', 'city'] });
    expect(g.getState().groupBy).toEqual(['dept', 'city']);
    g.host.querySelector<HTMLButtonElement>('.aui-data-grid__group-panel [aria-label="Move City earlier"]')!.click();
    expect(g.getState().groupBy).toEqual(['city', 'dept']);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move City later');
    g.host.querySelector<HTMLButtonElement>('.aui-data-grid__group-panel [aria-label="Remove City from the row groups"]')!.click();
    g.host.querySelector<HTMLButtonElement>('.aui-data-grid__group-panel [aria-label="Remove Department from the row groups"]')!.click();
    expect(seen.at(-1)).toEqual({ groupBy: [] });
    expect(g.element.getAttribute('role')).toBe('grid');
    expect(g.host.querySelector('.aui-data-grid__group-panel-empty')?.textContent).toBe('Drag a column header here, or choose a column');
  });

  it('date hierarchies group a date column by year and month; show values as percentages', () => {
    interface D {
      id: string;
      day: PlainDate;
      amount: number;
    }
    const host = document.createElement('div');
    document.body.append(host);
    const g = DataGrid.create<D>(host, {
      label: 'Sales',
      locale: 'en-US',
      rowHeight: 30,
      rows: [
        { id: 'a', day: plainDate(2025, 12, 31), amount: 25 },
        { id: 'b', day: plainDate(2026, 1, 5), amount: 50 },
        { id: 'c', day: plainDate(2026, 1, 20), amount: 25 },
        { id: 'd', day: plainDate(2026, 3, 1), amount: 100 },
      ],
      rowId: (r) => r.id,
      groupBy: ['day'],
      groupDefaultExpanded: -1,
      columns: [
        { id: 'day', header: 'Day', field: 'day', type: 'date', groupHierarchy: ['year', 'month'] },
        { id: 'amount', header: 'Amount', field: 'amount', type: 'number', aggregate: 'sum' },
        { id: 'share', header: 'Share', field: 'amount', type: 'number', aggregate: 'sum', showAs: 'percentOfParent' },
      ],
    });
    const labels = [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__row--group')]
      .sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex')))
      .map((r) => [r.querySelector('[data-column="aui-group"]')?.textContent, r.querySelector('[data-column="share"]')?.textContent]);
    expect(labels).toEqual([
      ['2025 (1)', '12.5%'],
      ['December 2025 (1)', '100%'],
      ['2026 (3)', '87.5%'],
      ['January 2026 (2)', '42.9%'],
      ['March 2026 (1)', '57.1%'],
    ]);
  });

  it('aggregateFilteredOnly: false aggregates every row of a group', () => {
    const g = mount({ aggregateFilteredOnly: false, columns: [
      { id: 'name', header: 'Name', field: 'name', filter: 'text' },
      { id: 'dept', header: 'Department', field: 'dept' },
      { id: 'salary', header: 'Salary', field: 'salary', type: 'number', aggregate: 'sum' },
    ] });
    g.setFilter('name', { kind: 'text', conditions: [{ operator: 'equals', value: 'Ann' }] });
    const eng = g.getGroups().find((x) => x.key === 'Eng')!;
    expect(eng.count).toBe(1);
    expect(eng.aggregates.salary).toBe(600);
  });
});

describe('group selection and per-level group columns (G5b2)', () => {
  it('a group checkbox selects its rows (tri-state); Space on a group row toggles them', async () => {
    const g = mount({ rowSelection: { mode: 'multiple' }, groupDefaultExpanded: -1 });
    const eng = row(g, groupId(g, 'Eng'));
    const box = eng.querySelector<HTMLInputElement>('.aui-data-grid__select-group')!;
    expect(box.getAttribute('aria-label')).toBe('Select Eng');
    expect(eng.hasAttribute('aria-selected')).toBe(false);
    box.click();
    expect(g.getSelected()).toEqual(['1', '2', '4']);
    expect(box.checked).toBe(true);
    row(g, '2').querySelector<HTMLInputElement>('.aui-data-grid__select-input')!.click();
    expect(box.indeterminate).toBe(true);
    eng.querySelector<HTMLElement>('[data-column="aui-group"]')!.focus();
    await userEvent.keyboard(' ');
    expect(g.getSelected()).toEqual(['1', '2', '4']);
    await userEvent.keyboard(' ');
    expect(g.getSelected()).toEqual([]);
  });

  it("groupDisplay 'columns': one group column per level, a group row's key in its level's column", () => {
    const g = mount({ groupBy: ['dept', 'city'], groupDisplay: 'columns', groupDefaultExpanded: -1 });
    expect([...g.host.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent)).toEqual(['Department', 'City', 'Name', 'Salary']);
    const eng = row(g, groupId(g, 'Eng'));
    expect(eng.querySelector('[data-column="aui-group:0"]')?.textContent).toBe('Eng (3)');
    expect(eng.querySelector('[data-column="aui-group:1"]')?.textContent).toBe('');
    // Cities in Eng, ascending: Lima, then Oslo.
    const lima = g.getGroups()[0]!.children[0]!;
    expect(row(g, lima.id).querySelector('[data-column="aui-group:1"]')?.textContent).toBe('Lima (1)');
    expect(g.getColumnsState().order).toEqual(['name', 'dept', 'city', 'salary']);
  });
});
