import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridColumnsChangeDetail, type DataGridOptions, type DataGridSortChangeDetail } from '@absoluteui/components/data-grid';
import { columnChooser, columnMenu, contextMenu, find, notes, sideBar, statusBar, toolbar, tooltips } from '@absoluteui/components/data-grid/accessories';

// docs/PLAN-R11-G7.md (G7b): column menu, cell menu, header names.
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

interface R {
  id: string;
  name: string;
  dept: string;
  n: number;
}
const rows: R[] = Array.from({ length: 10 }, (_, i) => ({ id: `r${String(i)}`, name: `Row ${String(i)}`, dept: i % 2 === 0 ? 'Even' : 'Odd', n: i }));

function mount(options: Partial<DataGridOptions<R>> = {}): DataGrid<R> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<R>(host, {
    label: 'Menus',
    locale: 'en-US',
    rowHeight: 30,
    rows,
    rowId: (r) => r.id,
    columns: [
      { id: 'name', header: 'Name', field: 'name', filter: 'text' },
      { id: 'dept', header: 'Dept', field: 'dept', groupable: true },
      { id: 'n', header: 'N', field: 'n', type: 'number' },
    ],
    accessories: [columnMenu(), contextMenu()],
    ...options,
  });
}

const header = (g: DataGrid<R>, id: string): HTMLElement => g.host.querySelector<HTMLElement>(`.aui-data-grid__header-cell[data-column="${id}"]`)!;
const openMenu = (): HTMLElement | null => [...document.querySelectorAll<HTMLElement>('[role="menu"]')].find((m) => m.matches(':popover-open')) ?? null;
const labels = (menu: HTMLElement | null): string[] => [...(menu?.querySelectorAll<HTMLElement>(':scope > [role="menuitem"], :scope > * > [role="menuitem"]') ?? [])].map((i) => i.getAttribute('aria-label') ?? i.textContent.trim());
/** An item of any open menu level (submenus are their own popups). */
const anyItem = (label: string): HTMLElement => [...document.querySelectorAll<HTMLElement>('[role="menu"]')].filter((m) => m.matches(':popover-open')).flatMap((m) => [...m.querySelectorAll<HTMLElement>('[role="menuitem"]')]).find((i) => i.textContent.includes(label))!;
const item = (menu: HTMLElement | null, label: string): HTMLElement => [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find((i) => i.textContent.includes(label))!;

describe('column menu (G7b)', () => {
  it('each data column header has a named menu button; the header keeps its own name', () => {
    const g = mount();
    const button = header(g, 'dept').querySelector<HTMLButtonElement>('.aui-data-grid__column-menu-button')!;
    expect(button.getAttribute('aria-label')).toBe('Column menu, Dept');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    const name = header(g, 'dept').getAttribute('aria-labelledby')!;
    expect(document.getElementById(name)?.textContent).toBe('Dept');
  });

  it('the button opens the menu; Sort descending sorts (announced and emitted as a header sort)', async () => {
    const g = mount();
    const sorts: DataGridSortChangeDetail[] = [];
    g.host.addEventListener('aui-sort-change', (e) => sorts.push((e as CustomEvent<DataGridSortChangeDetail>).detail));
    header(g, 'n').querySelector<HTMLButtonElement>('.aui-data-grid__column-menu-button')!.click();
    const menu = openMenu();
    expect(menu?.getAttribute('aria-label')).toBe('Column menu, N');
    expect(labels(menu)).toContain('Sort descending');
    expect(labels(menu)).not.toContain('Filter');
    item(menu, 'Sort descending').click();
    expect(g.sort).toEqual([{ column: 'n', direction: 'descending' }]);
    expect(sorts.at(-1)?.sort).toEqual([{ column: 'n', direction: 'descending' }]);
    await expect.poll(() => openMenu()).toBeNull();
  });

  it('Shift+F10 on a header opens its menu; group, hide, and reset work', async () => {
    const g = mount();
    header(g, 'dept').focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    let menu = openMenu();
    expect(menu?.getAttribute('aria-label')).toBe('Column menu, Dept');
    item(menu, 'Group by Dept').click();
    expect(g.getState().groupBy).toEqual(['dept']);
    header(g, 'n').focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    menu = openMenu();
    item(menu, 'Hide column').click();
    expect(g.getColumnsState().hidden).toContain('n');
    g.resetColumns();
    expect(g.getColumnsState().hidden).toEqual([]);
  });

  it('Rename column edits the header in place: Enter renames (state, event), Escape cancels', async () => {
    const g = mount();
    const changes: DataGridColumnsChangeDetail[] = [];
    g.host.addEventListener('aui-columns-change', (e) => changes.push((e as CustomEvent<DataGridColumnsChangeDetail>).detail));
    header(g, 'name').querySelector<HTMLButtonElement>('.aui-data-grid__column-menu-button')!.click();
    item(openMenu(), 'Columns').click();
    anyItem('Rename column').click();
    const input = header(g, 'name').querySelector<HTMLInputElement>('.aui-data-grid__header-input')!;
    expect(input.getAttribute('aria-label')).toBe('Column name');
    expect(document.activeElement).toBe(input);
    await userEvent.keyboard('{Control>}a{/Control}Full name{Enter}');
    expect(header(g, 'name').querySelector('.aui-data-grid__header-label')?.textContent).toBe('Full name');
    expect(g.getColumnsState().headers).toEqual({ name: 'Full name' });
    expect(changes.at(-1)?.reason).toBe('rename');
    expect(document.activeElement).toBe(header(g, 'name'));
    g.setColumnHeader('name', null);
    expect(g.getColumnsState().headers).toBeUndefined();
  });
});

describe('cell menu (G7b)', () => {
  it('a right-click on a cell opens the cell menu; Pin row pins it; outside cells the browser menu stays', () => {
    const g = mount();
    const cell = g.host.querySelector<HTMLElement>('[data-row-id="r3"] [data-column="name"]')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 50, clientY: 80 });
    cell.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const menu = openMenu();
    expect(menu?.getAttribute('aria-label')).toBe('Cell menu');
    for (const label of ['Copy', 'Copy with headers', 'Cut', 'Pin row', 'Columns']) expect(labels(menu).some((l) => l.startsWith(label))).toBe(true);
    item(menu, 'Pin row').click();
    const sub = [...document.querySelectorAll<HTMLElement>('[role="menu"]')].find((m) => m !== menu && m.matches(':popover-open')) ?? null;
    item(sub, 'Pin to top').click();
    expect(g.getPinnedRows().top).toEqual(['r3']);
    const outside = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    g.host.querySelector<HTMLElement>('.aui-data-grid__viewport')!.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);
  });

  it('custom items: your own entries with actions, next to the built-ins', () => {
    const picked: string[] = [];
    const g = mount({
      accessories: [
        contextMenu<R>({ items: (target, defaults) => [{ id: 'open', label: `Open ${target.row?.name ?? ''}`, action: () => picked.push(target.rowId) }, 'separator', ...defaults] }),
      ],
    });
    g.host.querySelector<HTMLElement>('[data-row-id="r1"] [data-column="n"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 10, clientY: 10 }));
    item(openMenu(), 'Open Row 1').click();
    expect(picked).toEqual(['r1']);
    // No column menu accessory: no header buttons.
    expect(g.host.querySelector('.aui-data-grid__column-menu-button')).toBeNull();
  });
});

describe('column chooser (G7b2)', () => {
  it('opens from the column menu; checkboxes show and hide, buttons move, search filters, Done returns focus', async () => {
    const chooser = columnChooser<R>();
    const g = mount({ accessories: [columnMenu(), chooser] });
    header(g, 'name').querySelector<HTMLButtonElement>('.aui-data-grid__column-menu-button')!.click();
    item(openMenu(), 'Columns').click();
    anyItem('Choose columns').click();
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!;
    expect(dialog.querySelector('h2, [id]')?.textContent).toContain('Choose columns');
    const names = (): string[] => [...dialog.querySelectorAll<HTMLElement>('.aui-data-grid__chooser-item label')].map((l) => l.textContent.trim());
    expect(names()).toEqual(['Name', 'Dept', 'N']);
    const box = dialog.querySelector<HTMLInputElement>('[data-column="dept"] input')!;
    box.click();
    expect(g.getColumnsState().hidden).toEqual(['dept']);
    expect(document.activeElement).toBe(dialog.querySelector('[data-column="dept"] input'));
    dialog.querySelector<HTMLButtonElement>('[aria-label="Move N up"]')!.click();
    expect(g.getColumnsState().order).toEqual(['name', 'n', 'dept']);
    const search = dialog.querySelector<HTMLInputElement>('.aui-data-grid__chooser-search')!;
    search.value = 'na';
    search.dispatchEvent(new Event('input'));
    expect(dialog.querySelectorAll('.aui-data-grid__chooser-item')).toHaveLength(1);
    const all = dialog.querySelector<HTMLInputElement>('.aui-data-grid__chooser-all input')!;
    expect(all.indeterminate).toBe(true);
    all.click();
    expect(g.getColumnsState().hidden).toEqual([]);
    [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent.trim() === 'Done')!.click();
    await expect.poll(() => document.querySelector('dialog[open]')).toBeNull();
    expect(g.host.contains(document.activeElement)).toBe(true);
    chooser.open();
    expect(document.querySelector('dialog[open]')).not.toBeNull();
  });
});

describe('status bar and toolbar (G7c1)', () => {
  it('the status bar counts rows (filtered of total) and selected rows, and aggregates the numbers in the ranges', async () => {
    const g = mount({ accessories: [statusBar()], rowSelection: { mode: 'multiple' }, cellSelection: true });
    const bar = g.host.querySelector<HTMLElement>('.aui-data-grid__status-bar')!;
    expect(bar.getAttribute('role')).toBe('group');
    expect(bar.getAttribute('aria-label')).toBe('Grid status');
    expect(bar.textContent).toBe('Rows: 10');
    g.setFilter('name', { kind: 'text', conditions: [{ operator: 'contains', value: '1' }] });
    await expect.poll(() => bar.textContent).toBe('Rows: 1 of 10');
    g.setFilter('name', null);
    g.setSelected(['r1', 'r2']);
    await expect.poll(() => bar.querySelector('[data-panel="selected"]')?.textContent).toBe('Selected: 2');
    g.addCellRange({ startRow: 'r1', endRow: 'r4', startColumn: 'n', endColumn: 'n' });
    await expect.poll(() => bar.querySelector('[data-panel="sum"]')?.textContent).toBe('Sum: 10');
    expect(bar.querySelector('[data-panel="avg"]')?.textContent).toBe('Average: 2.5');
    expect(bar.querySelector('[data-panel="count"]')?.textContent).toBe('Count: 4');
    g.destroy();
    expect(g.host.querySelector('.aui-data-grid__status-bar')).toBeNull();
  });

  it('the toolbar is one tab stop; arrows move; buttons act; a button with items opens a menu', async () => {
    const done: string[] = [];
    const chooser = columnChooser<R>();
    const g = mount({ accessories: [chooser, toolbar({ items: ['chooser', 'separator', { id: 'export', label: 'Export', action: () => done.push('export') }, { id: 'more', label: 'More', items: ['resetColumns', { id: 'x', label: 'Mine', action: () => done.push('mine') }] }] })] });
    const bar = g.host.querySelector<HTMLElement>('[role="toolbar"]')!;
    expect(bar.getAttribute('aria-label')).toBe('Grid actions');
    const buttons = [...bar.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Choose columns', 'Export', 'More']);
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
    buttons[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(buttons[1]);
    await userEvent.keyboard('{Enter}');
    expect(done).toEqual(['export']);
    buttons[2]!.click();
    item(openMenu(), 'Mine').click();
    expect(done).toEqual(['export', 'mine']);
    buttons[0]!.click();
    expect(document.querySelector('dialog[open]')).not.toBeNull();
  });
});

describe('side bar (G7c2)', () => {
  it('buttons beside the rows open one panel at a time; Columns lists columns with Group toggles', () => {
    const g = mount({ accessories: [sideBar()] });
    const main = g.host.querySelector<HTMLElement>('.aui-data-grid__main')!;
    expect(main.querySelector('.aui-data-grid__viewport')).not.toBeNull();
    const columns = g.host.querySelector<HTMLButtonElement>('.aui-data-grid__side-tab[data-panel="columns"]')!;
    const filters = g.host.querySelector<HTMLButtonElement>('.aui-data-grid__side-tab[data-panel="filters"]')!;
    expect(columns.textContent).toBe('Columns');
    expect(columns.getAttribute('aria-expanded')).toBe('false');
    columns.click();
    expect(columns.getAttribute('aria-expanded')).toBe('true');
    const region = document.getElementById(columns.getAttribute('aria-controls')!)!;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-label')).toBe('Columns');
    expect(region.hidden).toBe(false);
    const group = region.querySelector<HTMLButtonElement>('[data-column="dept"] .aui-data-grid__chooser-group')!;
    expect(group.getAttribute('aria-label')).toBe('Group by Dept');
    expect(group.getAttribute('aria-pressed')).toBe('false');
    group.click();
    expect(g.getState().groupBy).toEqual(['dept']);
    expect(region.querySelector('[data-column="dept"] .aui-data-grid__chooser-group')?.getAttribute('aria-pressed')).toBe('true');
    filters.click();
    expect(region.hidden).toBe(true);
    expect(filters.getAttribute('aria-expanded')).toBe('true');
  });

  it('Filters: a disclosure per filterable column with its filter editor inline; filtered columns are marked', async () => {
    const g = mount({ accessories: [sideBar({ open: 'filters' })] });
    const region = document.getElementById(g.host.querySelector('.aui-data-grid__side-tab[data-panel="filters"]')!.getAttribute('aria-controls')!)!;
    const toggle = region.querySelector<HTMLButtonElement>('.aui-data-grid__filter-section-toggle')!;
    expect(toggle.textContent).toBe('Name');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    const editor = region.querySelector<HTMLElement>('.aui-data-grid__filter-panel--inline')!;
    expect(editor.getAttribute('role')).toBe('group');
    expect(editor.hasAttribute('popover')).toBe(false);
    g.setFilter('name', { kind: 'text', conditions: [{ operator: 'contains', value: '1' }] });
    (document.activeElement as HTMLElement | null)?.blur();
    g.setFilter('name', { kind: 'text', conditions: [{ operator: 'contains', value: '2' }] });
    await expect.poll(() => region.querySelector('.aui-data-grid__filter-section-toggle')?.textContent).toBe('NameFiltered');
    g.destroy();
    expect(g.host.querySelector('.aui-data-grid__side')).toBeNull();
  });
});

describe('tooltips, find, notes (G7d)', () => {
  it('a cell tooltip shows on keyboard focus (described by it), on hover after a delay, and Escape dismisses it', async () => {
    const g = mount({
      accessories: [tooltips({ showDelay: 50 })],
      columns: [
        { id: 'name', header: 'Name', field: 'name', tooltip: true },
        { id: 'dept', header: 'Dept', field: 'dept', tooltip: (v) => `Department ${String(v)}` },
        { id: 'n', header: 'N', field: 'n', type: 'number' },
      ],
    });
    const tip = document.querySelector<HTMLElement>('.aui-data-grid__tooltip')!;
    expect(tip.getAttribute('role')).toBe('tooltip');
    const cell = g.host.querySelector<HTMLElement>('[data-row-id="r1"] [data-column="dept"]')!;
    cell.focus();
    expect(tip.matches(':popover-open')).toBe(true);
    expect(tip.textContent).toBe('Department Odd');
    expect(cell.getAttribute('aria-describedby')).toContain(tip.id);
    await userEvent.keyboard('{Escape}');
    expect(tip.matches(':popover-open')).toBe(false);
    expect(document.activeElement).toBe(cell);
    g.host.querySelector<HTMLElement>('[data-row-id="r1"] [data-column="n"]')!.focus();
    expect(tip.matches(':popover-open')).toBe(false);
    const name = g.host.querySelector<HTMLElement>('[data-row-id="r2"] [data-column="name"]')!;
    name.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    await expect.poll(() => tip.matches(':popover-open')).toBe(true);
    expect(tip.textContent).toBe('Row 2');
  });

  it('find marks matches, reveals and announces the current one; Enter and F3 move; data changes keep it current', async () => {
    const finder = find<R>();
    const g = mount({ accessories: [finder] });
    const input = g.host.querySelector<HTMLInputElement>('.aui-data-grid__find-input')!;
    expect(input.getAttribute('aria-label')).toBe('Find in grid');
    expect(input.closest('[role="search"]')).not.toBeNull();
    expect(finder.find('row 1')).toBe(1);
    expect(finder.find('Odd')).toBe(5);
    const active = (): string => [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__cell--find-active')].map((c) => c.closest<HTMLElement>('[role="row"]')!.dataset.rowId!).join();
    expect(active()).toBe('r1');
    expect(g.host.querySelectorAll('.aui-data-grid__cell--find')).toHaveLength(4);
    expect(g.host.querySelector('.aui-data-grid__find-count')?.textContent).toBe('Match 1 of 5');
    input.focus();
    await userEvent.keyboard('{Enter}');
    expect(active()).toBe('r3');
    g.host.querySelector<HTMLElement>('[data-row-id="r0"] [data-column="n"]')!.focus();
    await userEvent.keyboard('{Shift>}{F3}{/Shift}');
    expect(active()).toBe('r1');
    expect(document.activeElement?.closest<HTMLElement>('[role="row"]')?.dataset.rowId).toBe('r0');
    finder.find('');
    expect(g.host.querySelectorAll('.aui-data-grid__cell--find, .aui-data-grid__cell--find-active')).toHaveLength(0);
  });

  it('notes: Shift+F2 opens a dialog; saving goes to the store and marks the cell; the cell menu offers Edit note', async () => {
    const saved = new Map<string, string>([['r2|n', 'Check this']]);
    const store = {
      get: (rowId: string, column: string) => Promise.resolve(saved.has(`${rowId}|${column}`) ? { text: saved.get(`${rowId}|${column}`) ?? '' } : null),
      set: (rowId: string, column: string, note: { text: string } | null) => {
        if (note) saved.set(`${rowId}|${column}`, note.text);
        else saved.delete(`${rowId}|${column}`);
        return Promise.resolve();
      },
      index: () => Promise.resolve([{ rowId: 'r2', column: 'n' }]),
    };
    const g = mount({ accessories: [contextMenu(), notes({ store, author: 'Ann' })] });
    await expect.poll(() => g.host.querySelector('[data-row-id="r2"] [data-column="n"]')?.classList.contains('aui-data-grid__cell--note')).toBe(true);
    expect(g.host.querySelector('[data-row-id="r2"] [data-column="n"]')?.textContent).toContain('has a note');
    const cell = g.host.querySelector<HTMLElement>('[data-row-id="r1"] [data-column="name"]')!;
    cell.focus();
    await userEvent.keyboard('{Shift>}{F2}{/Shift}');
    await expect.poll(() => document.querySelector('dialog[open]')).not.toBeNull();
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!;
    expect(dialog.textContent).toContain('Name, Row 1');
    const area = dialog.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(area.getAttribute('aria-label')).toBe('Note');
    area.value = 'New note';
    [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent.trim() === 'Save')!.click();
    await expect.poll(() => saved.get('r1|name')).toBe('New note');
    await expect.poll(() => g.host.querySelector('[data-row-id="r1"] [data-column="name"]')?.classList.contains('aui-data-grid__cell--note')).toBe(true);
    g.host.querySelector<HTMLElement>('[data-row-id="r2"] [data-column="n"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 10, clientY: 10 }));
    expect(labels(openMenu()).some((l) => l.startsWith('Edit note'))).toBe(true);
  });
});
