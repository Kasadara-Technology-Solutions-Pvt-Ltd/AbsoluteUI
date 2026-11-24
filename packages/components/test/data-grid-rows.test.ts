import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridOptions, type DataGridRowResizeDetail } from '@absoluteui/components/data-grid';

// docs/PLAN-R11-G7.md (G7a): row numbers, row resizing.
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
    '.aui-data-grid__cell{flex:none;box-sizing:border-box;overflow:hidden;white-space:nowrap;position:relative}',
    '.aui-data-grid__spacer{flex:none}',
    '.aui-data-grid__row-resizer{position:absolute;inset-inline:0;inset-block-end:0;block-size:6px}',
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
  n: number;
}
const rows: R[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${String(i)}`, name: `Row ${String(i)}`, n: i }));

function mount(options: Partial<DataGridOptions<R>> = {}): DataGrid<R> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<R>(host, {
    label: 'Rows',
    locale: 'en-US',
    rowHeight: 30,
    rows,
    rowId: (r) => r.id,
    columns: [
      { id: 'name', header: 'Name', field: 'name' },
      { id: 'n', header: 'N', field: 'n', type: 'number' },
    ],
    ...options,
  });
}

const numberOf = (g: DataGrid<R>, id: string): string => g.host.querySelector(`[data-row-id="${id}"] [data-column="aui-row-number"]`)?.textContent ?? '';
const rowEl = (g: DataGrid<R>, id: string): HTMLElement => g.host.querySelector<HTMLElement>(`[data-row-id="${id}"]`)!;

describe('row numbers (G7a1)', () => {
  it('a leading column numbers rows by display position, after sorting and paging too; it has a hidden header name', () => {
    const g = mount({ rowNumbers: true, pageSize: 10 });
    const header = g.host.querySelector<HTMLElement>('.aui-data-grid__header-cell[data-column="aui-row-number"]')!;
    expect(header.textContent).toBe('Row number');
    expect(header.getAttribute('aria-colindex')).toBe('1');
    expect(numberOf(g, 'r0')).toBe('1');
    expect(numberOf(g, 'r9')).toBe('10');
    g.update({ sort: [{ column: 'n', direction: 'descending' }] });
    expect(numberOf(g, 'r29')).toBe('1');
    g.update({ page: 2 });
    expect(numberOf(g, 'r19')).toBe('11');
    // Numbers are not data: the column is not in the columns state.
    expect(g.getColumnsState().order).not.toContain('aui-row-number');
  });

  it('with cell ranges, a click on a number selects the row; numbers are never copied', () => {
    const g = mount({ rowNumbers: true, cellSelection: true });
    g.host.querySelector<HTMLElement>('[data-row-id="r2"] [data-column="aui-row-number"]')!.click();
    expect(g.getCellRanges()).toEqual([{ startRow: 'r2', endRow: 'r2', startColumn: 'name', endColumn: 'n' }]);
  });

  it('resizable: Alt+arrows on a number and dragging its handle set the row height; announced and emitted; setRowHeight resets', async () => {
    const g = mount({ rowNumbers: { resizable: true } });
    const seen: DataGridRowResizeDetail[] = [];
    g.host.addEventListener('aui-row-resize', (e) => seen.push((e as CustomEvent<DataGridRowResizeDetail>).detail));
    g.host.querySelector<HTMLElement>('[data-row-id="r1"] [data-column="aui-row-number"]')!.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{ArrowDown}{/Alt}');
    expect(rowEl(g, 'r1').style.blockSize).toBe('38px');
    expect(seen.at(-1)).toEqual({ rowId: 'r1', height: 38 });
    expect(rowEl(g, 'r2').style.insetBlockStart).toBe('68px');
    const handle = g.host.querySelector<HTMLElement>('[data-row-id="r3"] .aui-data-grid__row-resizer')!;
    const box = handle.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: x, clientY: y }));
    handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: x, clientY: y + 20 }));
    handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: x, clientY: y + 20 }));
    expect(rowEl(g, 'r3').style.blockSize).toBe('50px');
    expect(seen.at(-1)).toEqual({ rowId: 'r3', height: 50 });
    g.setRowHeight('r3', null);
    expect(rowEl(g, 'r3').style.blockSize).toBe('30px');
    expect(() => {
      g.setRowHeight('r3', 5);
    }).toThrow();
  });
});

describe('row pinning (G7a2)', () => {
  it('static pinned rows stack in named sections above and below the body; row indexes count them', () => {
    const g = mount({
      pinnedTopRows: [{ id: 'top', name: 'Pinned top', n: -1 }],
      pinnedBottomRows: [{ id: 'bottom', name: 'Pinned bottom', n: 99 }],
    });
    const top = g.host.querySelector<HTMLElement>('.aui-data-grid__pinned--top')!;
    const bottom = g.host.querySelector<HTMLElement>('.aui-data-grid__pinned--bottom')!;
    expect(top.getAttribute('role')).toBe('rowgroup');
    expect(top.getAttribute('aria-label')).toBe('Pinned to top');
    expect(top.textContent).toContain('Pinned top');
    expect(bottom.getAttribute('aria-label')).toBe('Pinned to bottom');
    expect(top.querySelector('[role="row"]')?.getAttribute('aria-rowindex')).toBe('2');
    expect(rowEl(g, 'r0').getAttribute('aria-rowindex')).toBe('3');
    expect(bottom.querySelector('[role="row"]')?.getAttribute('aria-rowindex')).toBe('33');
    expect(g.element.getAttribute('aria-rowcount')).toBe('33');
  });

  it('pinRow keeps the row in the body too; filters hide the pinned copy; selection is mirrored', () => {
    const g = mount({ rowSelection: { mode: 'multiple' }, columns: [{ id: 'name', header: 'Name', field: 'name', filter: 'text' }, { id: 'n', header: 'N', field: 'n', type: 'number' }] });
    expect(g.pinRow('r5', 'top')).toBe(true);
    expect(g.pinRow('nope', 'top')).toBe(false);
    expect(g.getPinnedRows()).toEqual({ top: ['r5'], bottom: [] });
    const copy = g.host.querySelector<HTMLElement>('[data-row-id="pin-top:r5"]')!;
    expect(copy.closest('.aui-data-grid__pinned--top')).not.toBeNull();
    expect(rowEl(g, 'r5')).not.toBeNull();
    g.setSelected(['r5']);
    expect(copy.getAttribute('aria-selected')).toBe('true');
    g.setFilter('name', { kind: 'text', conditions: [{ operator: 'equals', value: 'Row 1' }] });
    expect(g.host.querySelector('[data-row-id="pin-top:r5"]')).toBeNull();
    g.pinRow('r5', null);
    expect(g.getPinnedRows().top).toEqual([]);
  });

  it('keyboard order: header, pinned top, body, pinned bottom; a pinned grand total', async () => {
    const g = mount({
      pinnedTopRows: [{ id: 'top', name: 'Pinned top', n: -1 }],
      groupBy: [],
      grandTotal: 'pinnedBottom',
      columns: [
        { id: 'name', header: 'Name', field: 'name' },
        { id: 'n', header: 'N', field: 'n', type: 'number', aggregate: 'sum' },
      ],
    });
    const total = g.host.querySelector<HTMLElement>('.aui-data-grid__pinned--bottom [data-row-id="pin-bottom:total:grand"]')!;
    expect(total.querySelector('[data-column="n"]')?.textContent).toBe('435');
    g.host.querySelector<HTMLElement>('.aui-data-grid__header-cell[data-column="name"]')!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.closest('[role="row"]')?.getAttribute('data-row-id')).toBe('pin-top:top');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.closest('[role="row"]')?.getAttribute('data-row-id')).toBe('r0');
    await userEvent.keyboard('{Control>}{End}{/Control}');
    expect(document.activeElement?.closest('[role="row"]')?.getAttribute('data-row-id')).toBe('pin-bottom:total:grand');
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement?.closest('[role="row"]')?.getAttribute('data-row-id')).toBe('r29');
  });
});

describe('full-width rows, full-width group rows, sticky group rows (G7a3)', () => {
  it('full-width rows are one cell across the row; arrows enter it and return to the column they came from', async () => {
    const g = mount({
      fullWidthRow: {
        isFullWidth: (r) => r.n % 10 === 0 && r.n > 0,
        render: (r, { doc }) => Object.assign(doc.createElement('strong'), { textContent: `Section ${r.name}` }),
      },
    });
    const full = rowEl(g, 'r10');
    const cells = full.querySelectorAll('[role="gridcell"]');
    expect(cells).toHaveLength(1);
    expect(cells[0]?.getAttribute('aria-colspan')).toBe('2');
    expect(cells[0]?.textContent).toBe('Section Row 10');
    rowEl(g, 'r9').querySelector<HTMLElement>('[data-column="n"]')!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(cells[0]);
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(cells[0]);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(rowEl(g, 'r11').querySelector('[data-column="n"]'));
  });

  it("groupDisplay 'rows': group rows span the row (no group column); keyboard toggles; totals name their group", async () => {
    const g = mount({
      groupBy: ['dept'],
      groupDisplay: 'rows',
      groupTotals: 'bottom',
      rows: rows.slice(0, 6).map((r) => ({ ...r, dept: r.n % 2 === 0 ? 'Even' : 'Odd' })),
      columns: [
        { id: 'name', header: 'Name', field: 'name' },
        { id: 'dept', header: 'Dept', field: 'dept' },
        { id: 'n', header: 'N', field: 'n', type: 'number', aggregate: 'sum' },
      ],
    });
    expect(g.host.querySelector('.aui-data-grid__header-cell[data-column="aui-group"]')).toBeNull();
    const even = g.host.querySelector<HTMLElement>('.aui-data-grid__row--group')!;
    const cell = even.querySelector<HTMLElement>('[role="gridcell"]')!;
    expect(even.querySelectorAll('[role="gridcell"]')).toHaveLength(1);
    expect(cell.textContent).toBe('Even (3)');
    cell.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(g.host.querySelector('.aui-data-grid__row--group')?.getAttribute('aria-expanded')).toBe('true');
    const total = g.host.querySelector<HTMLElement>('.aui-data-grid__row--total')!;
    expect(total.querySelector('[data-column="name"]')?.textContent).toBe('Total Even');
    expect(total.querySelector('[data-column="n"]')?.textContent).toBe('6');
    rowEl(g, 'r2').querySelector<HTMLElement>('[data-column="name"]')!.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement?.closest('[role="row"]')?.classList.contains('aui-data-grid__row--group')).toBe(true);
  });

  it('sticky group rows: the group of the topmost row stays under the header (hidden from assistive technology); its toggle works', async () => {
    const many = Array.from({ length: 90 }, (_, i) => ({ id: `r${String(i)}`, name: `Row ${String(i)}`, n: Math.floor(i / 30) }));
    const g = mount({ rows: many, groupBy: ['n'], groupDefaultExpanded: -1 });
    const sticky = g.host.querySelector<HTMLElement>('.aui-data-grid__sticky')!;
    expect(sticky.hidden).toBe(true);
    const viewport = g.host.querySelector<HTMLElement>('.aui-data-grid__viewport')!;
    viewport.scrollTop = 30 * 40;
    viewport.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(() => { r(null); }));
    expect(sticky.hidden).toBe(false);
    expect(sticky.getAttribute('aria-hidden')).toBe('true');
    expect(sticky.textContent).toContain('1 (30)');
    sticky.querySelector<HTMLElement>('.aui-data-grid__group-toggle')!.click();
    // Group 1 collapsed: its rows left the grid.
    expect(g.host.querySelector('[data-row-id="r40"]')).toBeNull();
  });
});

describe('row and column spanning (G7a4)', () => {
  interface S {
    id: string;
    name: string;
    n: number;
    dept: string;
  }
  const spanRows: S[] = ['A', 'A', 'A', 'B', 'B', 'C'].map((dept, i) => ({ id: `r${String(i)}`, name: `Row ${String(i)}`, n: i, dept }));
  function mountSpans(options: Partial<DataGridOptions<S>> = {}): DataGrid<S> {
    const host = document.createElement('div');
    document.body.append(host);
    return DataGrid.create<S>(host, {
      label: 'Spans',
      locale: 'en-US',
      rowHeight: 30,
      rows: spanRows,
      rowId: (r) => r.id,
      columns: [
        { id: 'dept', header: 'Dept', field: 'dept', spanRows: true },
        { id: 'name', header: 'Name', field: 'name', width: 100, colSpan: (r) => (r.n === 5 ? 2 : 1) },
        { id: 'n', header: 'N', field: 'n', type: 'number', width: 80 },
      ],
      ...options,
    });
  }
  const cell = (g: DataGrid<S>, row: string, column: string): HTMLElement | null => g.host.querySelector<HTMLElement>(`[data-row-id="${row}"] [data-column="${column}"]`);

  it('equal adjacent values merge into one cell (aria-rowspan); covered rows have no cell there', () => {
    const g = mountSpans();
    const a = cell(g, 'r0', 'dept')!;
    expect(a.getAttribute('aria-rowspan')).toBe('3');
    expect(a.style.blockSize).toBe('90px');
    expect(cell(g, 'r1', 'dept')).toBeNull();
    expect(cell(g, 'r2', 'dept')).toBeNull();
    expect(cell(g, 'r3', 'dept')?.getAttribute('aria-rowspan')).toBe('2');
    expect(cell(g, 'r5', 'dept')?.hasAttribute('aria-rowspan')).toBe(false);
    g.update({ sort: [{ column: 'n', direction: 'descending' }] });
    expect(cell(g, 'r5', 'dept')?.hasAttribute('aria-rowspan')).toBe(false);
    expect(cell(g, 'r4', 'dept')?.getAttribute('aria-rowspan')).toBe('2');
  });

  it('a cell can span columns (aria-colspan, the widths together); covered cells are absent', () => {
    const g = mountSpans();
    const wide = cell(g, 'r5', 'name')!;
    expect(wide.getAttribute('aria-colspan')).toBe('2');
    expect(wide.style.inlineSize).toBe('180px');
    expect(cell(g, 'r5', 'n')).toBeNull();
    expect(cell(g, 'r4', 'n')).not.toBeNull();
  });

  it('keyboard: moving within a span steps past it; moving into one lands on its cell', async () => {
    const g = mountSpans();
    cell(g, 'r0', 'dept')!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(cell(g, 'r3', 'dept'));
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(cell(g, 'r0', 'dept'));
    cell(g, 'r1', 'name')!.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(cell(g, 'r0', 'dept'));
    cell(g, 'r4', 'n')!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(cell(g, 'r5', 'name'));
  });
});
