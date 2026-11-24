import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridDetailToggleDetail, type DataGridOptions } from '@absoluteui/components/data-grid';

// docs/PLAN-R11-G5.md (G5d): master/detail.
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

interface O {
  id: string;
  customer: string;
  total: number;
  lines: { id: string; item: string }[];
}
const orders: O[] = [
  { id: 'o1', customer: 'Acme', total: 30, lines: [{ id: 'l1', item: 'Bolt' }, { id: 'l2', item: 'Nut' }] },
  { id: 'o2', customer: 'Bard', total: 10, lines: [] },
  { id: 'o3', customer: 'Cole', total: 20, lines: [{ id: 'l3', item: 'Gear' }] },
];

function mount(options: Partial<DataGridOptions<O>> = {}): DataGrid<O> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<O>(host, {
    label: 'Orders',
    locale: 'en-US',
    rowHeight: 30,
    rows: orders,
    rowId: (r) => r.id,
    columns: [
      { id: 'customer', header: 'Customer', field: 'customer' },
      { id: 'total', header: 'Total', field: 'total', type: 'number' },
    ],
    detail: {
      height: 120,
      isMaster: (r) => r.lines.length > 0,
      render: (row, { doc }) => {
        const p = doc.createElement('p');
        p.textContent = `${String(row.lines.length)} lines`;
        const button = doc.createElement('button');
        button.textContent = 'Reorder';
        const box = doc.createElement('div');
        box.append(p, button);
        return box;
      },
    },
    ...options,
  });
}

const row = (g: DataGrid<O>, id: string): HTMLElement => g.host.querySelector<HTMLElement>(`[data-row-id="${id}"]`)!;

describe('master/detail (G5d)', () => {
  it('a toggle column expands a full-width detail row under a master row; treegrid semantics; event', () => {
    const g = mount();
    expect(g.element.getAttribute('role')).toBe('treegrid');
    const header = g.host.querySelector<HTMLElement>('.aui-data-grid__header-cell[data-column="aui-detail"]')!;
    expect(header.textContent).toBe('Details');
    expect(row(g, 'o1').getAttribute('aria-expanded')).toBe('false');
    expect(row(g, 'o2').hasAttribute('aria-expanded')).toBe(false);
    expect(row(g, 'o2').querySelector('.aui-data-grid__detail-toggle')).toBeNull();
    const seen: DataGridDetailToggleDetail[] = [];
    g.host.addEventListener('aui-detail-toggle', (e) => seen.push((e as CustomEvent<DataGridDetailToggleDetail>).detail));
    row(g, 'o1').querySelector<HTMLElement>('.aui-data-grid__detail-toggle')!.click();
    expect(seen).toEqual([{ rowId: 'o1', expanded: true }]);
    expect(row(g, 'o1').getAttribute('aria-expanded')).toBe('true');
    const detail = row(g, 'detail:o1');
    expect(detail.getAttribute('aria-level')).toBe('2');
    expect(detail.getAttribute('aria-rowindex')).toBe('3');
    const cell = detail.querySelector<HTMLElement>('[role="gridcell"]')!;
    expect(cell.getAttribute('aria-colspan')).toBe('3');
    expect(cell.textContent).toBe('2 linesReorder');
    expect(detail.style.blockSize).toBe('120px');
    expect(row(g, 'o2').getAttribute('aria-rowindex')).toBe('4');
    expect(g.setDetailExpanded('o2', true)).toBe(false);
    expect(g.isDetailExpanded('o1')).toBe(true);
  });

  it('keyboard: Enter on the toggle expands; arrows enter and leave the detail row; Escape and Tab move between the content and the grid', async () => {
    const g = mount();
    const toggle = row(g, 'o1').querySelector<HTMLElement>('[data-column="aui-detail"]')!;
    toggle.focus();
    await userEvent.keyboard('{Enter}');
    expect(g.isDetailExpanded('o1')).toBe(true);
    // From the Total column: down into the detail row, down again back into the Total column.
    row(g, 'o1').querySelector<HTMLElement>('[data-column="total"]')!.focus();
    await userEvent.keyboard('{ArrowDown}');
    const detailCell = row(g, 'detail:o1').querySelector<HTMLElement>('[role="gridcell"]')!;
    expect(document.activeElement).toBe(detailCell);
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(detailCell);
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement?.textContent).toBe('Reorder');
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(detailCell);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(row(g, 'o2').querySelector('[data-column="total"]'));
    // Tab from the master row's last cell enters the content; Shift+Tab on the detail cell goes back.
    row(g, 'o1').querySelector<HTMLElement>('[data-column="total"]')!.focus();
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement?.textContent).toBe('Reorder');
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(row(g, 'o1').querySelector('[data-column="total"]'));
    // ArrowLeft on the toggle collapses; focus stays on the master row.
    row(g, 'o1').querySelector<HTMLElement>('[data-column="aui-detail"]')!.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(g.isDetailExpanded('o1')).toBe(false);
    expect(g.host.querySelector('[data-row-id="detail:o1"]')).toBeNull();
  });

  it('content is kept while collapsed (up to keep), released with destroy, and rendered again for a new row object', () => {
    let renders = 0;
    const destroyed: string[] = [];
    const g = mount({
      detail: {
        keep: 0,
        render: (r, { doc }) => {
          renders++;
          const s = doc.createElement('span');
          s.textContent = r.customer;
          return s;
        },
        destroy: (_node, r) => destroyed.push(r.id),
      },
    });
    g.setDetailExpanded('o1', true);
    expect(renders).toBe(1);
    g.applyTransaction({ update: [{ ...orders[0]!, customer: 'Acme 2' }] });
    expect(renders).toBe(2);
    expect(destroyed).toEqual(['o1']);
    expect(row(g, 'detail:o1').textContent).toBe('Acme 2');
    g.setDetailExpanded('o1', false);
    expect(destroyed).toEqual(['o1', 'o1']);
    g.setDetailExpanded('o2', true);
    g.destroy();
    expect(destroyed).toEqual(['o1', 'o1', 'o2']);
  });

  it('a nested Data Grid keeps its own keyboard and clicks; the outer grid treats it as detail content', async () => {
    const inner = new Map<string, DataGrid<{ id: string; item: string }>>();
    const g = mount({
      detail: {
        expandedByDefault: true,
        render: (r, { doc }) => {
          const host = doc.createElement('div');
          inner.set(r.id, DataGrid.create(host, { label: `Lines of ${r.id}`, rows: r.lines, rowId: (l) => l.id, rowHeight: 30, columns: [{ id: 'item', header: 'Item', field: 'item' }] }));
          return host;
        },
        destroy: (_node, r) => {
          inner.get(r.id)?.destroy();
        },
      },
    });
    expect(row(g, 'o1').getAttribute('aria-expanded')).toBe('true');
    const nested = inner.get('o1')!;
    // The nested grid measures itself once attached.
    await expect.poll(() => nested.host.querySelector('[data-row-id="l1"] [data-column="item"]')).not.toBeNull();
    const first = nested.host.querySelector<HTMLElement>('[data-row-id="l1"] [data-column="item"]')!;
    first.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(nested.host.querySelector('[data-row-id="l2"] [data-column="item"]'));
    // The outer grid's tab stop is the detail cell holding the nested grid.
    expect(row(g, 'detail:o1').querySelector('[role="gridcell"]')?.getAttribute('tabindex')).toBe('0');
  });
});
