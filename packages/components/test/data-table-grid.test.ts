import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, instant, plainDate, resetAbsoluteUIConfig, type Instant, type PlainDate } from '@absoluteui/core';
import {
  DataTable,
  DataTableColumnChooser,
  downloadCsv,
  type DataTableColumn,
  type DataTableColumnsChangeDetail,
  type DataTableExpandChangeDetail,
  type DataTableFilterChangeDetail,
  type DataTableOptions,
  type DataTableSortChangeDetail,
  type DataTableState,
} from '@absoluteui/components/data-table';

// R2 advanced grid features (SPEC section 18.10): multi-sort, filtering, column state,
// resize, pinning, row expansion, virtual scrolling, CSV export, state serialization.

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface Emp {
  id: string;
  name: string;
  dept: string;
  salary: number;
  start: PlainDate;
  seen: Instant;
  remote: boolean;
}

const EMPS: Emp[] = [
  { id: 'e1', name: 'Ada', dept: 'Eng', salary: 120, start: plainDate(2020, 1, 15), seen: instant(Date.UTC(2024, 0, 15, 3, 0)), remote: true },
  { id: 'e2', name: 'Grace', dept: 'Ops', salary: 90, start: plainDate(2019, 6, 1), seen: instant(Date.UTC(2024, 0, 15, 12, 0)), remote: false },
  { id: 'e3', name: 'Alan', dept: 'Eng', salary: 90, start: plainDate(2021, 3, 9), seen: instant(Date.UTC(2024, 0, 16, 12, 0)), remote: true },
  { id: 'e4', name: 'Barbara', dept: 'Ops', salary: 150, start: plainDate(2018, 11, 30), seen: instant(Date.UTC(2024, 0, 14, 23, 30)), remote: false },
  { id: 'e5', name: 'Edsger', dept: 'Eng', salary: 120, start: plainDate(2022, 8, 20), seen: instant(Date.UTC(2024, 0, 17, 8, 0)), remote: false },
];

const COLS: DataTableColumn<Emp>[] = [
  { id: 'name', header: 'Name', accessor: (e) => e.name, filter: 'text' },
  { id: 'dept', header: 'Dept', accessor: (e) => e.dept, filter: 'enum', filterOptions: [{ value: 'Eng', label: 'Engineering' }, { value: 'Ops', label: 'Operations' }] },
  { id: 'salary', header: 'Salary', accessor: (e) => e.salary, type: 'number', filter: 'number' },
  { id: 'start', header: 'Start', accessor: (e) => e.start, type: 'date', filter: 'date' },
  { id: 'seen', header: 'Seen', accessor: (e) => e.seen, type: 'datetime', filter: 'date' },
  { id: 'remote', header: 'Remote', accessor: (e) => e.remote, type: 'boolean', filter: 'enum' },
];

function mount<Row>(options: Partial<DataTableOptions<Row>> & Pick<DataTableOptions<Row>, 'rows' | 'columns' | 'rowId'>): DataTable<Row> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataTable.create(host, { caption: 'Staff', ...options });
}

const staff = (options: Partial<DataTableOptions<Emp>> = {}): DataTable<Emp> => mount({ rows: EMPS, columns: COLS, rowId: (e) => e.id, pageSize: null, filterDelay: 0, ...options });

const bodyRows = <R>(t: DataTable<R>): HTMLTableRowElement[] => Array.from(t.table.tBodies[0]!.rows).filter((r) => r.classList.contains('aui-data-table__row'));
const names = <R>(t: DataTable<R>, index = 0): string[] => bodyRows(t).map((r) => r.cells[index]!.textContent);
const header = <R>(t: DataTable<R>, id: string): HTMLTableCellElement => t.table.querySelector<HTMLTableCellElement>(`thead th[data-column="${id}"]`)!;
const sortButton = <R>(t: DataTable<R>, id: string): HTMLButtonElement => header(t, id).querySelector('button')!;
const filterInput = <R>(t: DataTable<R>, label: string): HTMLInputElement => t.table.querySelector<HTMLInputElement>(`thead input[aria-label="${label}"]`)!;
const filterSelect = <R>(t: DataTable<R>, label: string): HTMLSelectElement => t.table.querySelector<HTMLSelectElement>(`thead select[aria-label="${label}"]`)!;
const resizer = <R>(t: DataTable<R>, id: string): HTMLElement => header(t, id).querySelector<HTMLElement>('.aui-data-table__resizer')!;
const record = <T>(t: { host: HTMLElement }, type: string): T[] => {
  const seen: T[] = [];
  t.host.addEventListener(type, (event) => seen.push((event as CustomEvent<T>).detail));
  return seen;
};
const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => {
  resolve();
}));
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const liveText = (): string => document.querySelector('[data-aui-live-region="polite"]')?.textContent ?? '';

describe('DataTable grid: backward compatibility', () => {
  it('a table without the new options renders no toolbar, filter row, resize handles, or disclosure column', () => {
    const t = mount<Emp>({ rows: EMPS, columns: COLS.map((c) => ({ id: c.id, header: c.header, accessor: c.accessor, type: c.type ?? 'text' })), rowId: (e) => e.id });
    expect(t.host.querySelector<HTMLElement>('.aui-data-table__toolbar')!.hidden).toBe(true);
    expect(t.table.tHead!.rows).toHaveLength(1);
    expect(t.table.querySelector('.aui-data-table__resizer')).toBeNull();
    expect(t.table.querySelector('.aui-data-table__expand-cell')).toBeNull();
    expect(t.table.hasAttribute('aria-rowcount')).toBe(false);
    expect(t.sorts).toEqual([]);
  });
});

describe('DataTable grid: multi-column sorting', () => {
  it('Shift+click adds sort columns with priority indicators; aria-sort stays on the primary column', async () => {
    const t = staff({ multiSort: true });
    const seen = record<DataTableSortChangeDetail>(t, 'aui-sort-change');
    await userEvent.click(sortButton(t, 'dept'));
    await userEvent.click(sortButton(t, 'salary'), { modifiers: ['Shift'] });
    await userEvent.click(sortButton(t, 'salary'), { modifiers: ['Shift'] });
    expect(t.sorts).toEqual([{ column: 'dept', direction: 'ascending' }, { column: 'salary', direction: 'descending' }]);
    // Eng (120, 120, 90) then Ops (150, 90); equal keys keep their original order.
    expect(names(t)).toEqual(['Ada', 'Edsger', 'Alan', 'Barbara', 'Grace']);
    expect(header(t, 'dept').getAttribute('aria-sort')).toBe('ascending');
    expect(header(t, 'salary').hasAttribute('aria-sort')).toBe(false);
    expect(header(t, 'salary').classList.contains('aui-data-table__header-cell--sorted')).toBe(true);
    const badge = sortButton(t, 'salary').querySelector<HTMLElement>('.aui-data-table__sort-priority')!;
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('2');
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(sortButton(t, 'salary').textContent).toContain('sort priority 2, descending');
    await nextFrame();
    expect(liveText()).toBe('Sorted by Dept, ascending, then by Salary, descending');
    expect(seen.at(-1)).toEqual({ sort: { column: 'dept', direction: 'ascending' }, sorts: t.sorts });
    // Third Shift activation in tri-state removes the column from the sort.
    await userEvent.click(sortButton(t, 'salary'), { modifiers: ['Shift'] });
    expect(t.sorts).toEqual([{ column: 'dept', direction: 'ascending' }]);
    expect(badge.hidden).toBe(true);
    expect(sortButton(t, 'dept').querySelector<HTMLElement>('.aui-data-table__sort-priority')!.hidden).toBe(true);
  });

  it('Shift+Enter adds a column from the keyboard; the sort buttons describe the modifier', async () => {
    const t = staff({ multiSort: true, sort: { column: 'dept', direction: 'descending' } });
    const button = sortButton(t, 'name');
    const hint = document.getElementById(button.getAttribute('aria-describedby')!)!;
    expect(hint.textContent).toBe('Hold Shift while activating to sort by more than one column.');
    button.focus();
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    expect(t.sorts).toEqual([{ column: 'dept', direction: 'descending' }, { column: 'name', direction: 'ascending' }]);
    expect(names(t)).toEqual(['Barbara', 'Grace', 'Ada', 'Alan', 'Edsger']);
    await userEvent.keyboard('{Shift>} {/Shift}');
    expect(t.sorts[1]).toEqual({ column: 'name', direction: 'descending' });
    // A plain activation makes the column the only sort, continuing its cycle (descending -> unsorted).
    await userEvent.keyboard('{Enter}');
    expect(t.sorts).toEqual([]);
    await userEvent.keyboard('{Enter}');
    expect(t.sorts).toEqual([{ column: 'name', direction: 'ascending' }]);
    expect(document.activeElement).toBe(button);
  });

  it('ignores the modifier unless multiSort is enabled, and accepts programmatic sort arrays', async () => {
    const t = staff();
    expect(sortButton(t, 'name').hasAttribute('aria-describedby')).toBe(false);
    await userEvent.click(sortButton(t, 'dept'));
    await userEvent.click(sortButton(t, 'name'), { modifiers: ['Shift'] });
    expect(t.sorts).toEqual([{ column: 'name', direction: 'ascending' }]);
    t.update({ sort: [{ column: 'remote', direction: 'descending' }, { column: 'salary', direction: 'ascending' }] });
    expect(names(t)).toEqual(['Alan', 'Ada', 'Grace', 'Edsger', 'Barbara']);
    expect(t.sort).toEqual({ column: 'remote', direction: 'descending' });
    expect(() => {
      t.update({ sort: [{ column: 'name', direction: 'ascending' }, { column: 'name', direction: 'descending' }] });
    }).toThrow(/sort\.column/);
  });
});

describe('DataTable grid: filtering and search', () => {
  it('renders a labelled filter row and filters text, number, date, and enum columns', async () => {
    const t = staff();
    const seen = record<DataTableFilterChangeDetail>(t, 'aui-filter-change');
    expect(t.table.tHead!.rows).toHaveLength(2);
    await userEvent.fill(filterInput(t, 'Filter Name'), 'a');
    expect(names(t)).toEqual(['Ada', 'Grace', 'Alan', 'Barbara']);
    await userEvent.fill(filterInput(t, 'Minimum Salary'), '100');
    expect(names(t)).toEqual(['Ada', 'Barbara']);
    await userEvent.selectOptions(filterSelect(t, 'Filter Dept'), 'Ops');
    expect(names(t)).toEqual(['Barbara']);
    expect(seen.at(-1)).toEqual({ filters: { name: { type: 'text', value: 'a' }, salary: { type: 'number', min: 100, max: null }, dept: { type: 'enum', values: ['Ops'] } }, search: '' });
    t.update({ filters: { start: { type: 'date', from: '2019-01-01', to: '2021-12-31' } } });
    expect(names(t)).toEqual(['Ada', 'Grace', 'Alan']);
    expect(filterInput(t, 'Start from').value).toBe('2019-01-01');
    expect(filterInput(t, 'Filter Name').value).toBe('');
    // Boolean enum filters default to localized Yes/No options.
    const remote = filterSelect(t, 'Filter Remote');
    expect(Array.from(remote.options).map((o) => o.textContent)).toEqual(['All', 'Yes', 'No']);
    await userEvent.selectOptions(remote, 'true');
    expect(names(t)).toEqual(['Ada', 'Alan']);
    await nextFrame();
    expect(liveText()).toBe('Results: 2');
    expect(t.rowCount).toBe(2);
  });

  it('filters datetime columns by calendar date in the configured timezone', () => {
    // Ada was seen at 2024-01-15T03:00Z: Jan 15 in UTC, Jan 14 in New York.
    const utc = staff({ filters: { seen: { type: 'date', from: '2024-01-14', to: '2024-01-14' } } });
    expect(names(utc)).toEqual(['Barbara']);
    const ny = staff({ timezone: 'America/New_York', filters: { seen: { type: 'date', from: '2024-01-14', to: '2024-01-14' } } });
    expect(names(ny)).toEqual(['Ada', 'Barbara']);
    const kolkata = staff({ timezone: 'Asia/Kolkata', filters: { seen: { type: 'date', from: '2024-01-15', to: null } } });
    // Barbara (Jan 14 23:30 UTC) is Jan 15 05:00 in Kolkata.
    expect(names(kolkata)).toEqual(['Ada', 'Grace', 'Alan', 'Barbara', 'Edsger']);
  });

  it('global search matches every term against the displayed text of visible columns', async () => {
    const t = staff({ searchable: true, pageSize: 2 });
    const toolbar = t.host.querySelector<HTMLElement>('.aui-data-table__toolbar')!;
    expect(toolbar.hidden).toBe(false);
    expect(toolbar.getAttribute('role')).toBe('search');
    expect(toolbar.getAttribute('aria-label')).toBe('Staff');
    const search = toolbar.querySelector('input')!;
    expect(search.labels?.[0]?.textContent).toBe('Search');
    await userEvent.click(t.host.querySelector<HTMLButtonElement>('[data-key="next"]')!);
    expect(t.page).toBe(2);
    await userEvent.fill(search, 'eng 120');
    // Salary is shown formatted ("120"); both terms must match; the page resets.
    expect(names(t)).toEqual(['Ada', 'Edsger']);
    expect(t.page).toBe(1);
    expect(t.search).toBe('eng 120');
    t.update({ hiddenColumns: ['salary'] });
    expect(names(t)).toEqual([]);
    expect(t.table.querySelector('.aui-data-table__empty')!.textContent).toBe('No results');
  });

  it('debounces typing by filterDelay and applies Enter immediately', async () => {
    // A delay well above the time userEvent needs to type under full-suite load (200 ms flaked).
    const t = staff({ filterDelay: 1000 });
    const seen = record<DataTableFilterChangeDetail>(t, 'aui-filter-change');
    const input = filterInput(t, 'Filter Name');
    await userEvent.type(input, 'Gr');
    expect(names(t)).toHaveLength(5);
    await wait(1100);
    expect(names(t)).toEqual(['Grace']);
    expect(seen).toHaveLength(1);
    await userEvent.type(input, 'x{Enter}');
    expect(names(t)).toEqual([]);
    expect(seen).toHaveLength(2);
    t.destroy();
  });

  it('server mode emits filter changes without filtering locally', async () => {
    const t = staff({ mode: 'server', total: 5, pageSize: 5 });
    const seen = record<DataTableFilterChangeDetail>(t, 'aui-filter-change');
    await userEvent.fill(filterInput(t, 'Filter Name'), 'Ada');
    expect(names(t)).toHaveLength(5);
    expect(seen).toEqual([{ filters: { name: { type: 'text', value: 'Ada' } }, search: '' }]);
    expect(t.getState().filters).toEqual({ name: { type: 'text', value: 'Ada' } });
  });

  it('shows a multi-value enum filter as "n selected" and validates filter definitions', () => {
    const t = staff({ filters: { dept: { type: 'enum', values: ['Eng', 'Ops'] } } });
    const select = filterSelect(t, 'Filter Dept');
    expect(select.selectedOptions[0]!.textContent).toBe('2 selected');
    expect(names(t)).toHaveLength(5);
    const bad = (columns: DataTableColumn<Emp>[]): (() => void) => () => mount<Emp>({ rows: EMPS, columns, rowId: (e) => e.id });
    expect(bad([{ id: 'n', header: 'N', accessor: (e) => e.name, filter: 'number' }])).toThrow(/columns\.filter/);
    expect(bad([{ id: 'n', header: 'N', accessor: (e) => e.name, filter: 'enum' }])).toThrow(/filterOptions/);
    expect(bad([{ id: 'n', header: 'N', accessor: (e) => e.name, filterOptions: [{ value: 'a', label: 'A' }] }])).toThrow(/filterOptions/);
    expect(() => staff({ filters: { name: { type: 'number', min: 1 } } })).toThrow(/filters/);
    expect(() => staff({ filters: { nope: { type: 'text', value: 'x' } } })).toThrow(AbsoluteUIError);
  });
});

describe('DataTable grid: column visibility and the column chooser', () => {
  const chooser = (t: DataTable<Emp>): DataTableColumnChooser<Emp> => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Columns';
    t.host.before(button);
    return DataTableColumnChooser.create(button, t);
  };

  it('hides columns with hiddenColumns and keeps at least one visible', () => {
    const t = staff({ hiddenColumns: ['dept', 'seen'] });
    expect(Array.from(t.table.tHead!.rows[0]!.cells).map((c) => c.textContent)).toEqual(['Name', 'Salary', 'Start', 'Remote']);
    expect(bodyRows(t)[0]!.cells).toHaveLength(4);
    expect(() => staff({ hiddenColumns: COLS.map((c) => c.id) })).toThrow(/hiddenColumns/);
  });

  it('toggles columns through menuitemcheckbox items and emits aui-columns-change', async () => {
    const t = staff({ columns: COLS.map((c) => (c.id === 'name' ? { ...c, hideable: false } : c)) });
    const seen = record<DataTableColumnsChangeDetail>(t, 'aui-columns-change');
    const c = chooser(t);
    await userEvent.click(c.trigger);
    const items = Array.from(c.menu.element.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]'));
    expect(items.map((i) => i.textContent)).toEqual(['Name', 'Dept', 'Salary', 'Start', 'Seen', 'Remote']);
    expect(items[0]!.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(items[1]!);
    expect(header(t, 'dept')).toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.reason).toBe('visibility');
    expect(seen[0]!.column).toBe('dept');
    expect(seen[0]!.columns.hidden).toEqual(['dept']);
    // The menu stays open (closeOnSelect false) and reflects the new state.
    expect(c.menu.isOpen).toBe(true);
    expect(c.menu.element.querySelectorAll('[role="menuitemcheckbox"]')[1]!.getAttribute('aria-checked')).toBe('false');
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(c.trigger);
    c.destroy();
  });

  it('disables the last visible column and re-reads programmatic changes when opened', async () => {
    const t = staff({ hiddenColumns: ['dept', 'salary', 'start', 'seen', 'remote'] });
    const c = chooser(t);
    await userEvent.click(c.trigger);
    const first = (): HTMLElement => c.menu.element.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')[0]!;
    expect(first().getAttribute('aria-disabled')).toBe('true');
    await userEvent.keyboard('{Escape}');
    t.update({ hiddenColumns: [] });
    await userEvent.click(c.trigger);
    expect(first().getAttribute('aria-disabled')).not.toBe('true');
    c.destroy();
  });

  it('applies columnOrder, leaving unlisted columns in definition order', () => {
    const t = staff({ columnOrder: ['salary', 'name'] });
    expect(Array.from(t.table.tHead!.rows[0]!.cells).map((c) => c.textContent)).toEqual(['Salary', 'Name', 'Dept', 'Start', 'Seen', 'Remote']);
    // The first displayed column is the row header.
    expect(bodyRows(t)[0]!.cells[0]!.tagName).toBe('TH');
    expect(t.getState().columns.order).toEqual(['salary', 'name', 'dept', 'start', 'seen', 'remote']);
  });
});

describe('DataTable grid: column resizing', () => {
  it('resizes with the keyboard through a labelled separator, within min and max widths', async () => {
    const t = staff({ resizable: true, columns: COLS.map((c) => (c.id === 'salary' ? { ...c, minWidth: 80, maxWidth: 300 } : c)) });
    const seen = record<DataTableColumnsChangeDetail>(t, 'aui-columns-change');
    const handle = resizer(t, 'salary');
    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-label')).toBe('Resize Salary');
    expect(handle.tabIndex).toBe(0);
    handle.focus();
    const start = Number(handle.getAttribute('aria-valuenow'));
    expect(start).toBeGreaterThan(0);
    await userEvent.keyboard('{ArrowRight}');
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(Math.min(300, Math.max(80, start + 10)));
    expect(t.host.classList.contains('aui-data-table--fixed')).toBe(true);
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    const wide = Number(handle.getAttribute('aria-valuenow'));
    await userEvent.keyboard('{ArrowLeft}');
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(wide - 10);
    await userEvent.keyboard('{End}');
    expect(handle.getAttribute('aria-valuenow')).toBe('300');
    expect(handle.getAttribute('aria-valuetext')).toBe('300 pixels');
    expect(header(t, 'salary').style.getPropertyValue('width')).toBe('300px');
    await userEvent.keyboard('{Home}');
    expect(t.getState().columns.widths).toEqual({ salary: 80 });
    expect(seen.every((d) => d.reason === 'resize' && d.column === 'salary')).toBe(true);
    expect(seen).toHaveLength(5);
    // Tab is not a resize key: focus moves on.
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).not.toBe(handle);
  });

  it('(regression) keeps the resize handle name out of the column header name', () => {
    const t = staff({ resizable: true, multiSort: true, sort: [{ column: 'name', direction: 'ascending' }, { column: 'salary', direction: 'descending' }] });
    expect(header(t, 'salary').getAttribute('aria-label')).toBe('Salary');
    // The sort button keeps its own name with the priority.
    expect(sortButton(t, 'salary').textContent).toContain('sort priority 2, descending');
    expect(staff().table.querySelector('thead th[aria-label]')).toBeNull();
  });

  it('mirrors arrow keys in right-to-left layouts', async () => {
    const t = staff({ resizable: true });
    t.host.dir = 'rtl';
    const handle = resizer(t, 'name');
    handle.focus();
    const start = Number(handle.getAttribute('aria-valuenow'));
    await userEvent.keyboard('{ArrowLeft}');
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(start + 10);
  });

  // (regression) frozen widths were applied as content-box widths, so the first resize widened every column by its padding.
  it('(regression) resizes by pointer drag without a jump at the switch to the fixed layout, and emits one change on release', () => {
    const t = staff({ resizable: true });
    const seen = record<DataTableColumnsChangeDetail>(t, 'aui-columns-change');
    const handle = resizer(t, 'name');
    const box = handle.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const before = header(t, 'name').getBoundingClientRect().width;
    // Synthetic pointer events: vitest's userEvent has no low-level pointer drag.
    const fire = (type: string, clientX: number): void => {
      handle.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, clientX, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
    };
    const others = (): number[] => ['dept', 'salary', 'start'].map((id) => Math.round(header(t, id).getBoundingClientRect().width));
    const othersBefore = others();
    fire('pointerdown', x);
    expect(t.host.classList.contains('aui-data-table--fixed')).toBe(true);
    expect(others()).toEqual(othersBefore);
    fire('pointermove', x + 40);
    fire('pointermove', x + 60);
    expect(seen).toHaveLength(0);
    fire('pointerup', x + 60);
    expect(seen).toHaveLength(1);
    expect(t.getState().columns.widths.name).toBe(Math.round(before) + 60);
    expect(Math.round(header(t, 'name').getBoundingClientRect().width)).toBe(Math.round(before) + 60);
  });

  it('restores widths from columnWidths and clamps them', () => {
    const t = staff({ resizable: true, columnWidths: { name: 10, salary: 5000 } });
    expect(t.getState().columns.widths).toEqual({ name: 64, salary: 960 });
    expect(header(t, 'salary').style.getPropertyValue('width')).toBe('960px');
    expect(() => staff({ columnWidths: { name: -1 } })).toThrow(/columnWidths/);
  });
});

describe('DataTable grid: column pinning', () => {
  it('moves pinned columns to the edges with sticky offsets from header widths', () => {
    const t = staff({ selection: 'multiple', pinnedColumns: { start: ['salary'], end: ['name'] } });
    const heads = Array.from(t.table.tHead!.rows[0]!.cells);
    expect(heads.map((c) => c.textContent)).toEqual(['', 'Salary', 'Dept', 'Start', 'Seen', 'Remote', 'Name']);
    const [select, salary] = heads;
    expect(select!.classList.contains('aui-data-table__cell--pinned-start')).toBe(true);
    expect(salary!.classList.contains('aui-data-table__cell--pinned-edge')).toBe(true);
    expect(salary!.style.getPropertyValue('inset-inline-start')).toBe('var(--_aui-data-table-start-1, 0px)');
    expect(heads.at(-1)!.style.getPropertyValue('inset-inline-end')).toBe('var(--_aui-data-table-end-0, 0px)');
    const selectWidth = select!.getBoundingClientRect().width;
    expect(t.table.style.getPropertyValue('--_aui-data-table-start-0')).toBe('0px');
    expect(t.table.style.getPropertyValue('--_aui-data-table-start-1')).toBe(`${String(selectWidth)}px`);
    expect(t.table.style.getPropertyValue('--_aui-data-table-end-0')).toBe('0px');
    const row = bodyRows(t)[0]!;
    expect(row.cells[1]!.classList.contains('aui-data-table__cell--pinned-start')).toBe(true);
    expect(row.cells[6]!.classList.contains('aui-data-table__cell--pinned-end')).toBe(true);
    // Filter cells are pinned too.
    expect(t.table.tHead!.rows[1]!.cells[1]!.classList.contains('aui-data-table__cell--pinned')).toBe(true);
    expect(t.getState().columns.pinned).toEqual({ start: ['salary'], end: ['name'] });
    expect(() => staff({ pinnedColumns: { start: ['name'], end: ['name'] } })).toThrow(/pinnedColumns/);
  });
});

describe('DataTable grid: row expansion', () => {
  const detail = (e: Emp, doc: Document): Node => {
    const p = doc.createElement('p');
    p.textContent = `${e.name} works in ${e.dept}`;
    return p;
  };

  it('adds a disclosure button per row that shows consumer-rendered detail rows', async () => {
    let calls = 0;
    const t = staff({ renderDetail: (e, doc) => {
      calls++;
      return detail(e, doc);
    }, isRowExpandable: (e) => e.id !== 'e5' });
    const seen = record<DataTableExpandChangeDetail>(t, 'aui-expand-change');
    const buttons = Array.from(t.table.querySelectorAll<HTMLButtonElement>('tbody .aui-data-table__expander'));
    expect(buttons).toHaveLength(4);
    const first = buttons[0]!;
    expect(first.getAttribute('aria-label')).toBe('Details for Ada');
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(first.hasAttribute('aria-controls')).toBe(false);
    expect(first.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(t.table.querySelector('thead .aui-data-table__expand-cell')!.textContent).toBe('Details');
    expect(calls).toBe(0);
    await userEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById(first.getAttribute('aria-controls')!)!;
    expect(panel.tagName).toBe('TR');
    expect(panel.previousElementSibling).toBe(first.closest('tr'));
    expect((panel.firstElementChild as HTMLTableCellElement).colSpan).toBe(7);
    expect(panel.textContent).toBe('Ada works in Eng');
    expect(seen).toEqual([{ id: 'e1', expanded: true, expandedIds: ['e1'] }]);
    expect(document.activeElement).toBe(first);
    // Re-renders keep the rendered detail content.
    t.update({ selection: 'multiple' });
    expect(calls).toBe(1);
    await userEvent.click(t.table.querySelector<HTMLButtonElement>('tbody .aui-data-table__expander')!);
    expect(t.expanded).toEqual([]);
    expect(t.table.querySelector('.aui-data-table__detail-row')).toBeNull();
  });

  it('renders string details as text, honors expanded, and rejects virtual mode', () => {
    const t = staff({ renderDetail: () => '<img src=x onerror=alert(1)>', expanded: ['e2', 'missing'] });
    expect(t.expanded).toEqual(['e2']);
    const cell = t.table.querySelector('.aui-data-table__detail')!;
    expect(cell.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(cell.querySelector('img')).toBeNull();
    expect(() => staff({ renderDetail: detail, virtual: true })).toThrow(/virtual/);
  });
});

describe('DataTable grid: virtual scrolling', () => {
  interface N {
    id: string;
    n: number;
    label: string;
  }
  const big = (count: number): N[] => Array.from({ length: count }, (_, i) => ({ id: `r${String(i)}`, n: i, label: `Row ${String(i)}` }));
  const virtualTable = (count: number, options: Partial<DataTableOptions<N>> = {}): DataTable<N> => {
    const t = mount<N>({
      rows: big(count),
      rowId: (r) => r.id,
      columns: [{ id: 'label', header: 'Label', accessor: (r) => r.label }, { id: 'n', header: 'N', accessor: (r) => r.n, type: 'number' }],
      pageSize: null,
      virtual: true,
      rowHeight: 30,
      ...options,
    });
    // Unit tests run without component CSS: give the region its scroll box here.
    const region = t.host.querySelector<HTMLElement>('.aui-data-table__region')!;
    region.style.setProperty('overflow', 'auto');
    region.style.setProperty('block-size', '300px');
    t.update({});
    return t;
  };
  const region = <R>(t: DataTable<R>): HTMLElement => t.host.querySelector<HTMLElement>('.aui-data-table__region')!;
  const scrollTo = async <R>(t: DataTable<R>, top: number): Promise<void> => {
    region(t).scrollTop = top;
    region(t).dispatchEvent(new Event('scroll'));
    await nextFrame();
    await nextFrame();
  };

  it('renders a window of 100,000 rows with correct aria-rowcount and aria-rowindex', async () => {
    const t = virtualTable(100_000);
    const rows = bodyRows(t);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.length).toBeLessThan(60);
    expect(t.table.getAttribute('aria-rowcount')).toBe('100001');
    expect(t.table.tHead!.rows[0]!.getAttribute('aria-rowindex')).toBe('1');
    expect(rows[0]!.getAttribute('aria-rowindex')).toBe('2');
    expect(rows[0]!.cells[0]!.textContent).toBe('Row 0');
    const spacer = t.table.querySelector('.aui-data-table__spacer')!;
    expect(spacer.getAttribute('aria-hidden')).toBe('true');
    const height = rows[0]!.getBoundingClientRect().height;
    await scrollTo(t, height * 50_000);
    const after = bodyRows(t);
    expect(after.length).toBeLessThan(60);
    const labels = after.map((r) => r.cells[0]!.textContent);
    expect(labels).toContain('Row 50000');
    const at = after.find((r) => r.cells[0]!.textContent === 'Row 50000')!;
    expect(at.getAttribute('aria-rowindex')).toBe('50002');
    // Total scroll height stays that of all rows.
    expect(Math.abs(t.table.tBodies[0]!.getBoundingClientRect().height / (height * 100_000) - 1)).toBeLessThan(0.001);
  });

  it('keeps the focused row rendered while it scrolls out of the window', async () => {
    const t = virtualTable(5_000, { selection: 'multiple' });
    const first = bodyRows(t)[0]!;
    const input = first.querySelector('input')!;
    input.focus();
    await scrollTo(t, 30 * 3_000);
    expect(input.isConnected).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(bodyRows(t)[0]).toBe(first);
    expect(first.getAttribute('aria-rowindex')).toBe('2');
    await userEvent.keyboard(' ');
    expect(t.selected).toEqual(['r0']);
    // Select all covers every row of the page, rendered or not.
    await userEvent.click(t.table.querySelector<HTMLInputElement>('.aui-data-table__select-all')!);
    expect(t.selected).toHaveLength(5_000);
  });

  it('windows filtered and sorted rows and offsets aria-rowindex by the page', () => {
    const t = virtualTable(1_000, { pageSize: 100, page: 3, sort: { column: 'n', direction: 'descending' } });
    const rows = bodyRows(t);
    expect(rows[0]!.cells[0]!.textContent).toBe('Row 799');
    expect(rows[0]!.getAttribute('aria-rowindex')).toBe('202');
    expect(t.table.getAttribute('aria-rowcount')).toBe('1001');
    t.update({ virtual: false });
    expect(t.table.hasAttribute('aria-rowcount')).toBe(false);
    expect(bodyRows(t)[0]!.hasAttribute('aria-rowindex')).toBe(false);
    expect(bodyRows(t)).toHaveLength(100);
  });
});

describe('DataTable grid: CSV export', () => {
  interface Line {
    id: string;
    text: string;
    amount: number;
    on: PlainDate;
    at: Instant;
    ok: boolean;
  }
  const lines: Line[] = [
    { id: 'l1', text: 'plain', amount: -5, on: plainDate(2024, 2, 29), at: instant(Date.UTC(2024, 0, 15, 15, 30)), ok: true },
    { id: 'l2', text: 'a,b "quoted"\nnext', amount: 1234.5, on: plainDate(2023, 12, 31), at: instant(0), ok: false },
  ];
  const cols: DataTableColumn<Line>[] = [
    { id: 'text', header: 'Text', accessor: (l) => l.text },
    { id: 'amount', header: 'Amount', accessor: (l) => l.amount, type: 'currency', currency: 'USD' },
    { id: 'on', header: 'On', accessor: (l) => l.on, type: 'date' },
    { id: 'at', header: 'At', accessor: (l) => l.at, type: 'datetime' },
    { id: 'ok', header: 'OK', accessor: (l) => l.ok, type: 'boolean' },
  ];
  const table = (rows: Line[] = lines, options: Partial<DataTableOptions<Line>> = {}): DataTable<Line> => mount<Line>({ rows, columns: cols, rowId: (l) => l.id, ...options });

  it('quotes fields per RFC 4180 and uses CRLF line endings', () => {
    const csv = table().toCsv();
    expect(csv).toBe([
      'Text,Amount,On,At,OK',
      'plain,-$5.00,"Feb 29, 2024","Jan 15, 2024, 3:30 PM",Yes',
      '"a,b ""quoted""\nnext","$1,234.50","Dec 31, 2023","Jan 1, 1970, 12:00 AM",No',
    ].join('\r\n'));
  });

  it('prefixes formula-like text with a quote (OWASP CSV injection) but not table-formatted numbers', () => {
    const payloads = ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx', '=HYPERLINK("http://x")'];
    const rows = payloads.map((text, i): Line => ({ ...lines[0]!, id: `p${String(i)}`, text }));
    const csv = table(rows).toCsv({ columns: ['text', 'amount'], header: false });
    const fields = csv.split('\r\n').map((l) => l.slice(0, l.lastIndexOf(',')));
    expect(fields).toEqual([`"'=1+1"`, `"'+SUM(A1)"`, `"'-2+3"`, `"'@cmd"`, `"'\tx"`, `"'\rx"`, `"'=HYPERLINK(""http://x"")"`]);
    // The typed, Intl-formatted negative amount is trusted.
    expect(csv.split('\r\n')[0]!.endsWith(',-$5.00')).toBe(true);
    // Consumer callbacks are untrusted when they return strings, trusted when they return numbers.
    const custom = table(rows.slice(0, 1), {
      columns: [
        { id: 'fmt', header: '=Header', accessor: (l) => l.amount, type: 'number', format: (v) => String(v) },
        { id: 'num', header: 'Num', accessor: () => 0, exportValue: () => -7 },
        { id: 'str', header: 'Str', accessor: () => 0, exportValue: () => '-7' },
      ],
    });
    expect(custom.toCsv()).toBe(`"'=Header",Num,Str\r\n"'-5",-7,"'-7"`);
    expect(custom.toCsv({ escapeFormulas: false })).toBe('=Header,Num,Str\r\n-5,-7,-7');
  });

  it('exports raw values, column and row subsets, delimiters, and a BOM', async () => {
    const t = table(lines, { selection: 'multiple', pageSize: 1, hiddenColumns: ['at'], sort: { column: 'amount', direction: 'descending' } });
    expect(t.toCsv({ values: 'raw', header: false })).toBe('"a,b ""quoted""\nnext",1234.5,2023-12-31,false\r\nplain,-5,2024-02-29,true');
    expect(t.toCsv({ columns: 'all', rows: 'page', values: 'raw', header: false })).toBe('"a,b ""quoted""\nnext",1234.5,2023-12-31,1970-01-01T00:00:00.000Z,false');
    await userEvent.click(t.table.querySelector<HTMLInputElement>('tbody input')!);
    expect(t.toCsv({ rows: 'selected', columns: ['ok', 'text'], delimiter: ';', lineEnding: '\n' })).toBe('OK;Text\nNo;"a,b ""quoted""\nnext"');
    t.update({ filters: {}, columns: cols.map((c) => (c.id === 'text' ? { ...c, filter: 'text' as const } : c)) });
    t.update({ filters: { text: { type: 'text', value: 'plain' } } });
    expect(t.toCsv({ rows: 'filtered', columns: ['text'], header: false })).toBe('plain');
    expect(t.toCsv({ rows: 'all', columns: ['text'], header: false, bom: true })).toBe('﻿"a,b ""quoted""\nnext"\r\nplain');
    const blob = t.toCsvBlob({ columns: ['text'] });
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(await blob.text()).toBe('Text\r\nplain');
    expect(() => t.toCsv({ columns: ['nope'] })).toThrow(expect.objectContaining({ code: 'DATA_TABLE_CSV' }));
    expect(() => t.toCsv({ delimiter: '|' as ',' })).toThrow(expect.objectContaining({ code: 'DATA_TABLE_CSV' }));
  });

  it('exports columns with exportable false only when named', () => {
    const t = table(lines, { columns: cols.map((c) => (c.id === 'text' ? c : { ...c, exportable: false })) });
    expect(t.toCsv({ header: false })).toBe('plain\r\n"a,b ""quoted""\nnext"');
    expect(t.toCsv({ columns: ['ok'], header: false })).toBe('Yes\r\nNo');
  });

  it('downloadCsv saves through a temporary object URL only when called', () => {
    const clicks: HTMLAnchorElement[] = [];
    const intercept = (event: MouseEvent): void => {
      if (event.target instanceof HTMLAnchorElement && event.target.hasAttribute('download')) {
        clicks.push(event.target);
        event.preventDefault();
      }
    };
    document.addEventListener('click', intercept, true);
    try {
      const t = table();
      t.toCsv();
      expect(clicks).toHaveLength(0);
      downloadCsv(t.toCsv(), 'orders.csv');
      expect(clicks).toHaveLength(1);
      expect(clicks[0]!.download).toBe('orders.csv');
      expect(clicks[0]!.href.startsWith('blob:')).toBe(true);
      expect(clicks[0]!.isConnected).toBe(false);
      expect(() => {
        downloadCsv('x', ' ');
      }).toThrow(expect.objectContaining({ code: 'DATA_TABLE_CSV' }));
    } finally {
      document.removeEventListener('click', intercept, true);
    }
  });
});

describe('DataTable grid: state serialization', () => {
  it('round-trips a JSON-safe state onto another table without events', () => {
    const source = staff({
      multiSort: true,
      sort: [{ column: 'dept', direction: 'ascending' }, { column: 'salary', direction: 'descending' }],
      filters: { salary: { type: 'number', min: 90, max: null } },
      search: 'a',
      hiddenColumns: ['seen'],
      columnOrder: ['salary'],
      columnWidths: { name: 150 },
      pinnedColumns: { start: ['name'] },
      pageSize: 2,
      pageSizes: [2, 5],
      page: 2,
    });
    const state = source.getState();
    const json = JSON.parse(JSON.stringify(state)) as DataTableState;
    expect(json).toEqual(state);
    expect(state).toEqual({
      version: 1,
      sort: [{ column: 'dept', direction: 'ascending' }, { column: 'salary', direction: 'descending' }],
      filters: { salary: { type: 'number', min: 90, max: null } },
      search: 'a',
      columns: { order: ['salary', 'name', 'dept', 'start', 'seen', 'remote'], hidden: ['seen'], widths: { name: 150 }, pinned: { start: ['name'], end: [] } },
      page: 2,
      pageSize: 2,
      collapsedGroups: [],
    });
    const target = staff({ pageSizes: [2, 5] });
    const events: string[] = [];
    for (const type of ['aui-sort-change', 'aui-filter-change', 'aui-columns-change', 'aui-page-change']) target.host.addEventListener(type, () => events.push(type));
    target.setState(json);
    expect(target.getState()).toEqual(state);
    expect(names(target)).toEqual(names(source));
    expect(events).toEqual([]);
  });

  it('drops unknown ids, applies partial states, and rejects malformed input', () => {
    const t = staff({ pageSize: 5, pageSizes: [5, 10] });
    t.setState({ version: 1, sort: [{ column: 'gone', direction: 'ascending' }, { column: 'name', direction: 'descending' }], columns: { hidden: ['gone', 'dept'], widths: { gone: 10 } }, pageSize: 7 });
    expect(t.sorts).toEqual([{ column: 'name', direction: 'descending' }]);
    expect(t.getState().columns.hidden).toEqual(['dept']);
    expect(t.getState().columns.widths).toEqual({});
    expect(t.pageSize).toBe(5);
    t.setState({ version: 1, search: 'Ada' });
    expect(t.sorts).toEqual([{ column: 'name', direction: 'descending' }]);
    expect(names(t)).toEqual(['Ada']);
    const before = JSON.stringify(t.getState());
    const malformed: unknown[] = [null, { version: 2 }, { version: 1, sort: 'name' }, { version: 1, filters: [] }, { version: 1, page: 0 }, { version: 1, columns: { widths: { name: 'wide' } } }];
    for (const bad of malformed) {
      expect(() => {
        // Untrusted input (for example parsed from storage) reaches setState unchecked.
        t.setState(bad as DataTableState);
      }).toThrow(expect.objectContaining({ code: 'DATA_TABLE_STATE' }));
    }
    expect(JSON.stringify(t.getState())).toBe(before);
    // A stale filter for a column whose kind changed is dropped.
    t.setState({ version: 1, filters: { name: { type: 'number', min: 1 } } });
    expect(t.filters).toEqual({});
  });
});
