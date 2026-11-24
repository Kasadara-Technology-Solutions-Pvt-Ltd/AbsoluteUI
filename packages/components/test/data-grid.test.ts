import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { onNodeRelease, resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridColumnDef, type DataGridOptions, type DataGridSortChangeDetail, type DataGridColumnsChangeDetail } from '@absoluteui/components/data-grid';
import { RowHeights } from '../src/data-grid/heights.js';
import { centerWindow, layoutColumns, resolveColumns } from '../src/data-grid/columns.js';

// docs/PLAN-R11-G1.md (G1a): ARIA grid, virtualization, keyboard, sort, groups, pinning, resize.
// Unit tests run without the component stylesheet: the layout rules the grid relies on are injected here.
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = [
    '.aui-data-grid{display:flex;flex-direction:column;block-size:300px;inline-size:600px}',
    '.aui-data-grid__viewport{flex:1 1 auto;overflow:auto;min-block-size:0;position:relative}',
    '.aui-data-grid__grid{position:relative}',
    '.aui-data-grid__head{position:sticky;top:0;z-index:3;background:#fff}',
    '.aui-data-grid__header-row{display:flex;block-size:40px}',
    '.aui-data-grid__header-cell,.aui-data-grid__header-filler{flex:none;box-sizing:border-box;overflow:hidden;position:relative}',
    '.aui-data-grid__body{position:relative}',
    '.aui-data-grid__row{position:absolute;display:flex;inset-inline-start:0;box-sizing:border-box}',
    '.aui-data-grid__cell{flex:none;box-sizing:border-box;overflow:hidden;white-space:nowrap;padding-inline:8px}',
    '.aui-data-grid__cell--wrap{white-space:normal}',
    '.aui-data-grid__spacer{flex:none}',
    '.aui-data-grid__cell--pinned-start,.aui-data-grid__cell--pinned-end{position:sticky;z-index:1;background:#fff}',
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
  city: string;
}

const people = (n: number): P[] => Array.from({ length: n }, (_, i) => ({ id: `p${String(i)}`, name: `Person ${String(i).padStart(5, '0')}`, age: 20 + (i % 50), city: ['Oslo', 'Lima', 'Pune'][i % 3] ?? '' }));
const COLUMNS: DataGridColumnDef<P>[] = [
  { id: 'name', header: 'Name', accessor: (r) => r.name, width: 200 },
  { id: 'age', header: 'Age', field: 'age', type: 'number', width: 100 },
  { id: 'city', header: 'City', accessor: (r) => r.city, width: 150 },
];

function mount(options: Partial<DataGridOptions<P>> = {}): DataGrid<P> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create(host, { label: 'People', columns: COLUMNS, rows: people(20), rowId: (r) => r.id, rowHeight: 30, ...options });
}

const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => { r(); }));
const viewport = (g: DataGrid<P>): HTMLElement => g.host.querySelector<HTMLElement>('.aui-data-grid__viewport')!;
const bodyRows = (g: DataGrid<P>): HTMLElement[] => [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__row')];
const cellTexts = (row: HTMLElement): string[] => [...row.querySelectorAll('[role="gridcell"]')].map((c) => c.textContent);
const header = (g: DataGrid<P>, id: string): HTMLElement => g.host.querySelector<HTMLElement>(`[role="columnheader"][data-column="${id}"]`)!;

describe('RowHeights', () => {
  it('computes offsets and finds rows by offset, and updates in place', () => {
    const h = new RowHeights();
    h.reset(5, (i) => 10 * (i + 1)); // 10, 20, 30, 40, 50
    expect(h.total).toBe(150);
    expect([0, 1, 2, 3, 4, 5].map((i) => h.offset(i))).toEqual([0, 10, 30, 60, 100, 150]);
    expect([0, 9, 10, 29, 30, 99, 100, 149, 500].map((y) => h.indexAt(y))).toEqual([0, 0, 1, 1, 2, 3, 4, 4, 4]);
    expect(h.set(1, 5)).toBe(-15);
    expect(h.offset(2)).toBe(15);
    expect(h.indexAt(14)).toBe(1);
    expect(h.total).toBe(135);
  });
});

describe('column layout', () => {
  const defs: DataGridColumnDef<P>[] = [
    { id: 'name', header: 'Name', pinned: 'start', width: 100 },
    { id: 'contact', header: 'Contact', children: [{ id: 'city', header: 'City', width: 80 }, { id: 'age', header: 'Age', width: 60, visibleWhen: 'expanded' }], collapsible: true },
    { id: 'notes', header: 'Notes', flex: 1, minWidth: 50 },
    { id: 'tools', header: 'Tools', pinned: 'end', width: 48 },
  ];
  it('places sections, flex widths, header rows with spans and fillers, and keeps groups together when reordering', () => {
    const { leaves, groups } = resolveColumns(defs);
    const l = layoutColumns(leaves, groups, {}, 500);
    expect(l.start.map((c) => c.leaf.id)).toEqual(['name']);
    expect(l.center.map((c) => [c.leaf.id, c.x, c.width])).toEqual([['city', 0, 80], ['age', 80, 60], ['notes', 140, 212]]);
    expect(l.end.map((c) => c.leaf.id)).toEqual(['tools']);
    expect(l.visible.map((c) => c.colIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(l.levels).toBe(2);
    expect(l.header[0]?.center.map((h) => h.kind)).toEqual(['group', 'leaf']);
    expect(l.header[1]?.start.map((h) => h.kind)).toEqual(['filler']);
    // Moving "notes" first keeps the group's members together.
    const moved = layoutColumns(leaves, groups, { order: ['notes', 'age', 'name', 'city', 'tools'] }, 500);
    expect(moved.center.map((c) => c.leaf.id)).toEqual(['notes', 'age', 'city']);
    // Collapsing the group hides "age" (visibleWhen expanded).
    expect(layoutColumns(leaves, groups, { collapsed: { contact: true } }, 500).center.map((c) => c.leaf.id)).toEqual(['city', 'notes']);
    expect(centerWindow(l.center, 70, 150)).toEqual({ first: 0, last: 2 });
    expect(centerWindow(l.center, 141, 160)).toEqual({ first: 2, last: 2 });
  });

  it('rejects malformed columns with the property path, never the value', () => {
    expect(() => resolveColumns([{ id: '', header: 'X' }])).toThrow(/columns\[0\]\.id/);
    expect(() => resolveColumns([{ id: 'a', header: 'A' }, { id: 'g', header: 'G', children: [{ id: 'a', header: 'Again' }] }])).toThrow(/unique/);
    expect(() => resolveColumns([{ id: 'a', header: 'A', width: -1 }])).toThrow(/width/);
  });
});

describe('DataGrid: structure and ARIA', () => {
  it('renders an ARIA grid with row and column counts, indexes, and typed cells', () => {
    const g = mount();
    const grid = g.element;
    expect(grid.getAttribute('role')).toBe('grid');
    expect(grid.getAttribute('aria-label')).toBe('People');
    expect(grid.getAttribute('aria-rowcount')).toBe('21');
    expect(grid.getAttribute('aria-colcount')).toBe('3');
    const first = bodyRows(g).find((r) => r.dataset.rowId === 'p0')!;
    expect(first.getAttribute('aria-rowindex')).toBe('2');
    expect(cellTexts(first)).toEqual(['Person 00000', '20', 'Oslo']);
    expect([...first.querySelectorAll('[role="gridcell"]')].map((c) => c.getAttribute('aria-colindex'))).toEqual(['1', '2', '3']);
    // One tab stop: the first header cell.
    expect([...grid.querySelectorAll('[tabindex="0"]')]).toEqual([header(g, 'name')]);
  });

  it('virtualizes 1,000,000 rows (scaled scroll height) and renders only a window', async () => {
    const g = mount({ rows: people(1_000_000) });
    expect(g.element.getAttribute('aria-rowcount')).toBe('1000001');
    expect(bodyRows(g).length).toBeLessThan(40);
    const vp = viewport(g);
    vp.scrollTop = vp.scrollHeight;
    vp.dispatchEvent(new Event('scroll'));
    await frame();
    await frame();
    const ids = bodyRows(g).map((r) => r.dataset.rowId);
    expect(ids).toContain('p999999');
    const last = bodyRows(g).find((r) => r.dataset.rowId === 'p999999')!;
    expect(last.getAttribute('aria-rowindex')).toBe('1000001');
  });

  it('shows the empty message as one grid cell spanning every column', () => {
    const g = mount({ rows: [] });
    const cell = g.host.querySelector('.aui-data-grid__empty')!;
    expect(cell.getAttribute('role')).toBe('gridcell');
    expect(cell.getAttribute('aria-colspan')).toBe('3');
    expect(cell.textContent).toBe('No rows to show');
  });

  it('releases consumer nodes when their cells are dropped', async () => {
    const released: string[] = [];
    const g = mount({
      rows: people(200),
      columns: [{ id: 'name', header: 'Name', render: (r) => onNodeRelease(document.createElement('b'), () => released.push(r.id)) }],
    });
    const vp = viewport(g);
    vp.scrollTop = 4000;
    vp.dispatchEvent(new Event('scroll'));
    await frame();
    await frame();
    expect(released).toContain('p0');
    g.destroy();
    expect(released.length).toBeGreaterThan(20);
  });
});

describe('DataGrid: keyboard (APG grid)', () => {
  it('moves between headers and cells with arrows, Home/End, Ctrl+Home/End, and PageDown; Tab leaves the grid', async () => {
    const before = document.createElement('button');
    document.body.append(before);
    const g = mount({ rows: people(100) });
    const after = document.createElement('button');
    document.body.append(after);
    before.focus();
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).toBe(header(g, 'name'));
    await userEvent.keyboard('{ArrowDown}');
    expect(g.focusedCell).toEqual({ rowId: 'p0', column: 'name' });
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(g.focusedCell).toEqual({ rowId: 'p0', column: 'city' });
    await userEvent.keyboard('{Home}');
    expect(g.focusedCell?.column).toBe('name');
    await userEvent.keyboard('{End}');
    expect(g.focusedCell?.column).toBe('city');
    await userEvent.keyboard('{Control>}{End}{/Control}');
    expect(g.focusedCell).toEqual({ rowId: 'p99', column: 'city' });
    expect(document.activeElement?.closest('[role="row"]')?.getAttribute('aria-rowindex')).toBe('101');
    await userEvent.keyboard('{Control>}{Home}{/Control}');
    expect(g.focusedCell).toEqual({ rowId: 'p0', column: 'name' });
    await userEvent.keyboard('{PageDown}');
    expect(Number(g.focusedCell?.rowId?.slice(1))).toBeGreaterThan(3);
    await userEvent.keyboard('{Control>}{Home}{/Control}{ArrowUp}');
    expect(g.focusedCell).toEqual({ rowId: null, column: 'name', level: 0 });
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).toBe(after);
    // Exactly one tab stop remains, on the last focused cell.
    expect(g.element.querySelectorAll('[tabindex="0"]').length).toBe(1);
  });

  it('Enter activates a plain cell and moves into a cell widget; Escape returns to the cell', async () => {
    const g = mount({
      columns: [...COLUMNS, { id: 'act', header: 'Action', render: () => Object.assign(document.createElement('button'), { textContent: 'Open', type: 'button' }) }],
    });
    const activated: unknown[] = [];
    g.host.addEventListener('aui-cell-activate', (e) => activated.push((e as CustomEvent<{ rowId: string; column: string }>).detail));
    g.focusCell('p1', 'name');
    await userEvent.keyboard('{Enter}');
    expect(activated).toEqual([expect.objectContaining({ rowId: 'p1', column: 'name' })]);
    g.focusCell('p1', 'act');
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement?.tagName).toBe('BUTTON');
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement?.getAttribute('role')).toBe('gridcell');
  });

  it('mirrors left and right in right-to-left layouts', async () => {
    const g = mount({ direction: 'rtl' });
    g.focusCell('p0', 'name');
    await userEvent.keyboard('{ArrowLeft}');
    expect(g.focusedCell?.column).toBe('age');
  });
});

describe('DataGrid: sorting', () => {
  it('sorts by header click and Enter, multi-sorts with Shift, announces, and emits aui-sort-change', async () => {
    const g = mount();
    const log: DataGridSortChangeDetail[] = [];
    g.host.addEventListener('aui-sort-change', (e) => log.push((e as CustomEvent<DataGridSortChangeDetail>).detail));
    header(g, 'age').click();
    expect(header(g, 'age').getAttribute('aria-sort')).toBe('ascending');
    header(g, 'age').click();
    expect(header(g, 'age').getAttribute('aria-sort')).toBe('descending');
    const firstRow = (): string => [...bodyRows(g)].sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex')))[0]?.dataset.rowId ?? '';
    expect(firstRow()).toBe('p19');
    header(g, 'city').focus();
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    expect(g.sort).toEqual([{ column: 'age', direction: 'descending' }, { column: 'city', direction: 'ascending' }]);
    expect(header(g, 'city').textContent).toContain('sort priority 2');
    // A plain click on the descending primary column clears the sort (tri-state).
    header(g, 'age').click();
    expect(log.at(-1)?.sort).toEqual([]);
  });
});

describe('DataGrid: columns', () => {
  it('pins columns with sticky offsets, groups headers with aria-colspan, and toggles collapsible groups', async () => {
    const g = mount({
      columns: [
        { id: 'name', header: 'Name', accessor: (r) => r.name, pinned: 'start', width: 120 },
        { id: 'details', header: 'Details', collapsible: true, children: [{ id: 'age', header: 'Age', field: 'age', width: 80 }, { id: 'city', header: 'City', field: 'city', width: 90, visibleWhen: 'expanded' }] },
      ],
    });
    const name = g.host.querySelector<HTMLElement>('[role="gridcell"][data-column="name"]')!;
    expect(name.classList.contains('aui-data-grid__cell--pinned-start')).toBe(true);
    expect(name.style.getPropertyValue('inset-inline-start')).toBe('0px');
    const group = header(g, 'details');
    expect(group.getAttribute('aria-colspan')).toBe('2');
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(header(g, 'name').getAttribute('aria-rowspan')).toBe('2');
    const changes: DataGridColumnsChangeDetail[] = [];
    g.host.addEventListener('aui-columns-change', (e) => changes.push((e as CustomEvent<DataGridColumnsChangeDetail>).detail));
    group.focus();
    await userEvent.keyboard('{Enter}');
    expect(g.element.getAttribute('aria-colcount')).toBe('2');
    expect(header(g, 'details').getAttribute('aria-expanded')).toBe('false');
    expect(changes.at(-1)).toMatchObject({ reason: 'group-toggle', columns: { collapsedGroups: ['details'] } });
  });

  it('resizes with Alt+arrows and auto-sizes to content', async () => {
    const g = mount();
    const changes: DataGridColumnsChangeDetail[] = [];
    g.host.addEventListener('aui-columns-change', (e) => changes.push((e as CustomEvent<DataGridColumnsChangeDetail>).detail));
    header(g, 'age').focus();
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(header(g, 'age').style.getPropertyValue('inline-size')).toBe('110px');
    expect(changes.at(-1)?.columns.widths).toEqual({ age: 110 });
    g.autoSizeColumns(['city']);
    const w = Number.parseFloat(header(g, 'city').style.getPropertyValue('inline-size'));
    expect(w).toBeGreaterThanOrEqual(48);
    expect(w).toBeLessThan(150);
    expect(changes.at(-1)?.reason).toBe('autosize');
  });

  it('renders only the visible window of 300 columns', () => {
    const many: DataGridColumnDef<P>[] = Array.from({ length: 300 }, (_, i) => ({ id: `c${String(i)}`, header: `C${String(i)}`, accessor: (r: P) => `${r.id}-${String(i)}`, width: 100 }));
    const g = mount({ columns: many });
    const row = bodyRows(g)[0]!;
    expect(row.querySelectorAll('[role="gridcell"]').length).toBeLessThan(12);
    expect(g.element.getAttribute('aria-colcount')).toBe('300');
  });
});

describe('DataGrid: options', () => {
  it('rejects invalid options and duplicate row ids', () => {
    expect(() => mount({ label: '' })).toThrow(/dataGrid\.label/);
    expect(() => mount({ rowHeight: 2 })).toThrow(/rowHeight/);
    expect(() => mount({ rows: [{ id: 'a', name: '', age: 1, city: '' }, { id: 'a', name: '', age: 1, city: '' }] })).toThrow(/Duplicate row id/);
  });

  it('formats dates in the configured locale and switches locale live', () => {
    const g = mount({ locale: 'de-DE', columns: [{ id: 'age', header: 'Age', field: 'age', type: 'number' }], rows: [{ id: 'x', name: '', age: 1234.5, city: '' }] });
    expect(bodyRows(g)[0]?.textContent).toBe('1.234,5');
    g.update({ locale: 'en-US' });
    expect(bodyRows(g)[0]?.textContent).toBe('1,234.5');
  });
});

describe('DataGrid: moving, pinning, visibility (G1b)', () => {
  const order = (g: DataGrid<P>): string[] => [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__row[data-row-id="p0"] [role="gridcell"]')].map((c) => c.dataset.column ?? '');

  it('moves a column with Shift+arrows, announces, and keeps focus on it', async () => {
    const g = mount();
    const changes: DataGridColumnsChangeDetail[] = [];
    g.host.addEventListener('aui-columns-change', (e) => changes.push((e as CustomEvent<DataGridColumnsChangeDetail>).detail));
    header(g, 'name').focus();
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(order(g)).toEqual(['age', 'name', 'city']);
    expect(document.activeElement).toBe(header(g, 'name'));
    expect(changes.at(-1)).toMatchObject({ reason: 'move', columns: { order: ['age', 'name', 'city'] } });
    await userEvent.keyboard('{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}');
    expect(order(g)).toEqual(['name', 'age', 'city']);
  });

  it('moves groups as a whole and keeps children inside their group; locked columns stay put', () => {
    const g = mount({
      columns: [
        { id: 'name', header: 'Name', accessor: (r) => r.name, lockPosition: 'start' },
        { id: 'grp', header: 'Group', children: [{ id: 'age', header: 'Age', field: 'age' }, { id: 'city', header: 'City', field: 'city' }] },
        { id: 'extra', header: 'Extra', accessor: () => 'x' },
      ],
    });
    expect(g.moveColumn('extra', 'grp', 'before')).toBe(true);
    expect(order(g)).toEqual(['name', 'extra', 'age', 'city']);
    expect(g.moveColumn('city', 'age', 'before')).toBe(true);
    expect(order(g)).toEqual(['name', 'extra', 'city', 'age']);
    // A child cannot leave its group; a locked column cannot move.
    expect(g.moveColumn('age', 'extra', 'before')).toBe(false);
    expect(g.moveColumn('name', 'extra', 'after')).toBe(false);
    expect(g.moveColumn('grp', 'name', 'before')).toBe(true);
    expect(order(g)).toEqual(['name', 'city', 'age', 'extra']);
  });

  it('drags a header to move it, and across sections to pin it; the drop click does not sort', async () => {
    const g = mount({ columns: [{ ...(COLUMNS[0] as object), id: 'name', header: 'Name', accessor: (r: P) => r.name, pinned: 'start', width: 200 }, ...COLUMNS.slice(1)] as DataGridColumnDef<P>[] });
    const drag = async (from: HTMLElement, to: HTMLElement, side: 'start' | 'end'): Promise<void> => {
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const x = side === 'end' ? b.right - 5 : b.left + 5;
      const y = b.top + b.height / 2;
      from.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: a.left + 10, clientY: a.top + 10, pointerId: 1, button: 0, isPrimary: true }));
      for (const step of [0.3, 0.7, 1]) from.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: a.left + 10 + (x - a.left - 10) * step, clientY: y, pointerId: 1, isPrimary: true }));
      from.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
      from.click();
      await frame();
    };
    await drag(header(g, 'city'), header(g, 'age'), 'start');
    expect(order(g)).toEqual(['name', 'city', 'age']);
    expect(g.sort).toEqual([]);
    // Dropping onto the pinned "name" column pins "age" to the start.
    await drag(header(g, 'age'), header(g, 'name'), 'end');
    expect(order(g)).toEqual(['name', 'age', 'city']);
    expect(g.getColumnsState().pinned).toMatchObject({ age: 'start' });
    expect(g.host.querySelector('[role="gridcell"][data-column="age"]')?.classList.contains('aui-data-grid__cell--pinned-start')).toBe(true);
  });

  it('pins, unpins, hides, and shows columns through the API (at least one stays visible)', () => {
    const g = mount();
    expect(g.setColumnPinned('city', 'start')).toBe(true);
    expect(order(g)).toEqual(['city', 'name', 'age']);
    expect(g.setColumnPinned('city', null)).toBe(true);
    expect(g.setColumnHidden('age', true)).toBe(true);
    expect(g.element.getAttribute('aria-colcount')).toBe('2');
    expect(g.getColumnsState().hidden).toEqual(['age']);
    g.setColumnHidden('name', true);
    expect(g.setColumnHidden('city', true)).toBe(false);
    g.setColumnHidden('age', false);
    expect(order(g)).toEqual(['age', 'city']);
  });
});

describe('DataGrid: paging and state (G1c)', () => {
  it('pages rows with the Pagination component and emits aui-page-change', async () => {
    const g = mount({ rows: people(55), pageSize: 20, pageSizes: [20, 50] });
    expect(g.rowCount).toBe(20);
    expect(g.element.getAttribute('aria-rowcount')).toBe('21');
    const pages: unknown[] = [];
    g.host.addEventListener('aui-page-change', (e) => pages.push((e as CustomEvent).detail));
    const next = g.host.querySelector<HTMLButtonElement>('.aui-data-grid__pager button[aria-label*="Next"], .aui-data-grid__pager button[rel="next"]') ?? [...g.host.querySelectorAll<HTMLButtonElement>('.aui-data-grid__pager button')].find((b) => /next/i.test(b.getAttribute('aria-label') ?? b.textContent));
    expect(next).toBeTruthy();
    next?.click();
    await frame();
    expect(pages.at(-1)).toEqual({ page: 2, pageSize: 20 });
    expect(bodyRows(g).some((r) => r.dataset.rowId === 'p20')).toBe(true);
    g.update({ page: 3 });
    expect(g.rowCount).toBe(15);
  });

  it('round-trips state, validates untrusted input, and drops unknown ids', () => {
    const g = mount({ pageSize: 10 });
    g.setColumnPinned('city', 'start');
    g.setColumnHidden('age', true);
    header(g, 'name').click();
    const state = g.getState();
    expect(state).toMatchObject({ version: 1, sort: [{ column: 'name', direction: 'ascending' }], page: 1, pageSize: 10, columns: { hidden: ['age'], pinned: { city: 'start' } } });
    const other = mount({ pageSize: 10 });
    other.setState(JSON.parse(JSON.stringify(state)));
    expect(other.getState()).toEqual(state);
    expect(() => { other.setState({ sort: [{ column: 'name', direction: 'up' }] }); }).toThrow(/dataGrid\.state\.sort/);
    expect(() => { other.setState({ columns: { widths: { name: -5 } } }); }).toThrow(/widths/);
    expect(other.getState()).toEqual(state);
    other.setState({ sort: [{ column: 'gone', direction: 'ascending' }], columns: { order: ['gone', 'age'] } });
    expect(other.sort).toEqual([]);
  });
});

describe('DataGrid: data updates (G2a)', () => {
  const nameOf = (g: DataGrid<P>, id: string): string => g.host.querySelector(`.aui-data-grid__row[data-row-id="${id}"] [data-column="name"]`)?.textContent ?? '';

  it('applies transactions (add at an index, update by id, remove), keeps sort, reports missing ids, and emits aui-rows-change', () => {
    const g = mount({ rows: people(5), sort: { column: 'age', direction: 'descending' } });
    const events: unknown[] = [];
    g.host.addEventListener('aui-rows-change', (e) => events.push((e as CustomEvent).detail));
    const result = g.applyTransaction({ add: [{ id: 'n1', name: 'New', age: 99, city: 'Oslo' }], update: [{ id: 'p1', name: 'Renamed', age: 21, city: 'Lima' }], remove: ['p0', 'nope'] });
    expect(result).toEqual({ added: ['n1'], updated: ['p1'], removed: ['p0'], missing: ['nope'] });
    expect(events).toEqual([result]);
    expect(g.rowCount).toBe(5);
    const ordered = [...bodyRows(g)].sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex'))).map((r) => r.dataset.rowId);
    expect(ordered[0]).toBe('n1');
    expect(nameOf(g, 'p1')).toBe('Renamed');
    expect(() => g.applyTransaction({ add: [{ id: 'p2', name: '', age: 1, city: '' }] })).toThrow(/Duplicate row id/);
  });

  it('re-renders only rows whose object changed and highlights changed cells', () => {
    const rows = people(3);
    const g = mount({ rows, flashChanges: true });
    const before = g.host.querySelector<HTMLElement>('.aui-data-grid__row[data-row-id="p0"] [data-column="name"]');
    const p1 = rows[1]!;
    g.setRows([rows[0]!, { ...p1, age: 77 }, rows[2]!]);
    // p0 kept its cell elements; p1 re-rendered and its changed age cell is highlighted.
    expect(g.host.querySelector('.aui-data-grid__row[data-row-id="p0"] [data-column="name"]')).toBe(before);
    expect(g.host.querySelector('.aui-data-grid__row[data-row-id="p1"] [data-column="age"]')?.classList.contains('aui-data-grid__cell--changed')).toBe(true);
    expect(g.host.querySelector('.aui-data-grid__row[data-row-id="p1"] [data-column="name"]')?.classList.contains('aui-data-grid__cell--changed')).toBe(false);
  });

  it('batches async transactions and applies them on flush', async () => {
    const g = mount({ rows: people(2), transactionDelay: 10_000 });
    const events: unknown[] = [];
    g.host.addEventListener('aui-rows-change', (e) => events.push((e as CustomEvent).detail));
    g.applyTransactionAsync({ add: [{ id: 'a', name: 'A', age: 1, city: '' }] });
    g.applyTransactionAsync({ remove: ['p0'] });
    expect(g.rowCount).toBe(2);
    g.flushTransactions();
    expect(g.rowCount).toBe(2);
    expect(events).toEqual([{ added: ['a'], updated: [], removed: ['p0'], missing: [] }]);
    g.update({ transactionDelay: 0 });
    g.applyTransactionAsync({ remove: ['a'] });
    await new Promise((r) => setTimeout(r, 20));
    expect(g.rowCount).toBe(1);
  });

  it('applies row and cell class rules and validates them', () => {
    const g = mount({
      rows: people(3),
      rowClassRules: { senior: (r) => r.age > 20 },
      columns: [{ id: 'age', header: 'Age', field: 'age', type: 'number', cellClassRules: { even: (v) => typeof v === 'number' && v % 2 === 0 } }],
    });
    expect(g.host.querySelector('.aui-data-grid__row[data-row-id="p0"]')?.classList.contains('senior')).toBe(false);
    expect(g.host.querySelector('.aui-data-grid__row[data-row-id="p1"]')?.classList.contains('senior')).toBe(true);
    expect(g.host.querySelector('.aui-data-grid__row[data-row-id="p0"] [data-column="age"]')?.classList.contains('even')).toBe(true);
    expect(() => mount({ rowClassRules: { 'not a class': () => true } })).toThrow(/rowClassRules/);
  });
});

describe('DataGrid: incremental sort ranks', () => {
  it('keeps the same order as a fresh sort after many text updates (including several new values in one gap)', () => {
    // 12 rows of 16 px fit the 300 px test host, so every row is rendered.
    const order = (g: DataGrid<P>): string[] => [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__row')].sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex'))).map((r) => r.dataset.rowId ?? '');
    const rows = people(12);
    const g = mount({ rows, sort: [{ column: 'name', direction: 'ascending' }], rowHeight: 16 });
    let current = [...rows];
    // Includes an accented letter (U+00D6), built from its code so the source stays ASCII.
    const names = ['Person 00010a', 'Person 00010b', 'Person 00010ab', 'a', 'zzz', 'Person 00010aa', 'person 00002', String.fromCharCode(0xd6), 'O', '10', '9'];
    names.forEach((name, i) => {
      const id = `p${String(i)}`;
      const row = { ...current.find((r) => r.id === id)!, name };
      current = current.map((r) => (r.id === id ? row : r));
      g.applyTransaction({ update: [row] });
    });
    const fresh = mount({ rows: current, sort: [{ column: 'name', direction: 'ascending' }], rowHeight: 16 });
    expect(order(g)).toHaveLength(12);
    expect(order(g)).toEqual(order(fresh));
  });
});
