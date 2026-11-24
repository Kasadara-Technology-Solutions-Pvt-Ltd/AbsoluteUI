import { afterEach, describe, expect, it } from 'vitest';
import { plainDate, resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridOptions } from '@absoluteui/components/data-grid';

// docs/PLAN-R11-G8.md (G8a): CSV export.
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface S {
  id: string;
  region: string;
  name: string;
  amount: number;
  day: ReturnType<typeof plainDate>;
  note: string;
  boss?: string | null;
}
const sales: S[] = [
  { id: '1', region: 'East', name: 'Oslo', amount: 10, day: plainDate(2026, 1, 2), note: '=SUM(A1)' },
  { id: '2', region: 'East', name: 'Lima, Peru', amount: -5, day: plainDate(2026, 2, 3), note: 'say "hi"' },
  { id: '3', region: 'West', name: 'Pune', amount: 1234.5, day: plainDate(2026, 3, 4), note: '' },
];

function mount(options: Partial<DataGridOptions<S>> = {}): DataGrid<S> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<S>(host, {
    label: 'Sales',
    locale: 'en-US',
    rows: sales,
    rowId: (r) => r.id,
    columns: [
      { id: 'region', header: 'Region', field: 'region' },
      { id: 'name', header: 'Name', field: 'name' },
      { id: 'amount', header: 'Amount', field: 'amount', type: 'number', aggregate: 'sum' },
      { id: 'day', header: 'Day', field: 'day', type: 'date' },
      { id: 'note', header: 'Note', field: 'note' },
      { id: 'secret', header: 'Secret', field: 'id', exportable: false },
    ],
    ...options,
  });
}

const lines = (csv: string): string[] => csv.split('\r\n');

describe('CSV export (G8a)', () => {
  it('formats like the cells, quotes and escapes formulas, trusts the grid numbers, and skips columns not exportable', () => {
    const g = mount();
    expect(lines(g.toCsv())).toEqual([
      'Region,Name,Amount,Day,Note',
      "East,Oslo,10,\"Jan 2, 2026\",\"'=SUM(A1)\"",
      'East,"Lima, Peru",-5,"Feb 3, 2026","say ""hi"""',
      'West,Pune,"1,234.5","Mar 4, 2026",',
    ]);
    expect(lines(g.toCsv({ values: 'raw', columns: ['name', 'amount', 'day'], header: false }))).toEqual(['Oslo,10,2026-01-02', '"Lima, Peru",-5,2026-02-03', 'Pune,1234.5,2026-03-04']);
    const csv = g.toCsv({ delimiter: ';', lineEnding: '\n', bom: true, columns: ['name', 'amount'], escapeFormulas: false });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\n')).toEqual(['Name;Amount', 'Oslo;10', 'Lima, Peru;-5', 'Pune;1,234.5']);
    expect(g.toCsvBlob().type).toBe('text/csv;charset=utf-8');
    expect(() => g.toCsv({ rows: 'some' as 'all' })).toThrow(/dataGrid\.toCsv\.rows/);
    expect(() => g.toCsv({ columns: ['nope'] })).toThrow(/dataGrid\.toCsv\.columns/);
  });

  it('rows: filtered across pages, page, selected and all ignoring filters, and the active range', () => {
    const g = mount({ pageSize: 2, rowSelection: { mode: 'multiple' }, cellSelection: true, quickFilter: 'East' });
    const names = (csv: string): string[] => lines(csv).slice(1).map((l) => l.split(',')[1] ?? '');
    expect(names(g.toCsv({ columns: ['region', 'name'] }))).toEqual(['Oslo', '"Lima']);
    g.setSelected(['3']);
    expect(lines(g.toCsv({ rows: 'selected', columns: ['name'] }))).toEqual(['Name', 'Pune']);
    expect(lines(g.toCsv({ rows: 'all', columns: ['name'], header: false }))).toEqual(['Oslo', '"Lima, Peru"', 'Pune']);
    g.update({ quickFilter: '' });
    expect(lines(g.toCsv({ rows: 'page', columns: ['name'], header: false }))).toEqual(['Oslo', '"Lima, Peru"']);
    g.addCellRange({ startRow: '1', endRow: '2', startColumn: 'name', endColumn: 'amount' });
    expect(lines(g.toCsv({ rows: 'range' }))).toEqual(['Name,Amount', 'Oslo,10', '"Lima, Peru",-5']);
  });

  it('grouped: group rows with indented labels and totals, every group expanded; groups none gives data rows only', () => {
    const g = mount({ groupBy: ['region'], grandTotal: 'bottom', groupTotals: 'bottom' });
    const csv = lines(g.toCsv({ columns: ['aui-group', 'name', 'amount'] }));
    expect(csv[0]).toBe('Group,Name,Amount');
    expect(csv.slice(1, 5)).toEqual(['East,,5', ',Oslo,10', ',"Lima, Peru",-5', 'Total East,,5']);
    expect(csv.at(-1)).toMatch(/^Total,,"1,239.5"$/);
    expect(lines(g.toCsv({ groups: 'none', columns: ['name'], header: false }))).toEqual(['Oslo', '"Lima, Peru"', 'Pune']);
  });

  it('column group header rows, the value callback, and tree levels', () => {
    const g = mount({
      columns: [
        { id: 'where', header: 'Where', children: [{ id: 'region', header: 'Region', field: 'region' }, { id: 'name', header: 'Name', field: 'name' }] },
        { id: 'amount', header: 'Amount', field: 'amount', type: 'number' },
      ],
    });
    expect(lines(g.toCsv()).slice(0, 2)).toEqual(['Where,,', 'Region,Name,Amount']);
    expect(lines(g.toCsv({ columnGroups: false, value: (c) => (c.column === 'amount' && c.row ? c.row.amount * 2 : c.column === 'name' ? '+1' : undefined) })).slice(0, 2)).toEqual(['Region,Name,Amount', "East,\"'+1\",20"]);
    const tree = mount({
      rows: [
        { ...sales[0]!, boss: null },
        { ...sales[1]!, boss: '1' },
      ],
      treeData: { parentIdField: 'boss', label: 'name' },
      groupDefaultExpanded: 0,
      columns: [{ id: 'name', header: 'Name', field: 'name' }, { id: 'amount', header: 'Amount', field: 'amount', type: 'number' }],
    });
    // A label starting with - is escaped like any formula-like text.
    expect(lines(tree.toCsv({ indent: '- ', columns: ['aui-group', 'amount'] }))).toEqual(['Name,Amount', 'Oslo,10', `"'- Lima, Peru",-5`]);
  });
});

describe('export menu (G8a)', () => {
  it('the cell menu Export submenu downloads CSV named after the grid; export: false leaves it out', async () => {
    const { contextMenu } = await import('@absoluteui/components/data-grid/accessories');
    const g = mount({ accessories: [contextMenu<S>({ export: { csv: { columns: ['name'] } } })] });
    const saved: string[] = [];
    const onClick = (e: Event): void => {
      if (e.target instanceof HTMLAnchorElement && e.target.download) {
        saved.push(e.target.download);
        e.preventDefault();
      }
    };
    document.addEventListener('click', onClick, true);
    const open = (): HTMLElement[] => {
      g.host.querySelector<HTMLElement>('[data-row-id="1"] [data-column="name"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 10, clientY: 10 }));
      return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    };
    open().find((i) => i.textContent.includes('Export'))!.click();
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.some((i) => i.textContent.includes('Excel'))).toBe(false);
    items.find((i) => i.textContent.includes('CSV (.csv)'))!.click();
    expect(saved).toEqual(['Sales.csv']);
    document.removeEventListener('click', onClick, true);
    g.destroy();
    document.body.replaceChildren();
    const h = mount({ accessories: [contextMenu<S>({ export: false })] });
    h.host.querySelector<HTMLElement>('[data-row-id="1"] [data-column="name"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 10, clientY: 10 }));
    expect([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].some((i) => i.textContent.includes('Export'))).toBe(false);
  });
});

describe('print (G8c)', () => {
  it('prints a static table only while printing: caption, repeated header groups, group rows, end-aligned numbers; too many rows throw', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'print');
    let printed: HTMLTableElement | null = null;
    window.print = () => {
      printed = document.querySelector<HTMLTableElement>('.aui-data-grid-print table');
    };
    try {
      const g = mount({
        groupBy: ['region'],
        columns: [
          { id: 'where', header: 'Where', children: [{ id: 'region', header: 'Region', field: 'region' }, { id: 'name', header: 'Name', field: 'name' }] },
          { id: 'amount', header: 'Amount', field: 'amount', type: 'number', aggregate: 'sum' },
        ],
      });
      g.print({ columns: ['aui-group', 'name', 'amount'], title: 'Sales report' });
      const table = printed as HTMLTableElement | null;
      expect(table?.caption?.textContent).toBe('Sales report');
      expect([...(table?.tHead?.rows ?? [])].map((r) => [...r.cells].map((c) => c.textContent))).toEqual([['', 'Where', ''], ['Group', 'Name', 'Amount']]);
      expect(table?.tHead?.rows[1]?.cells[0]?.getAttribute('scope')).toBe('col');
      const body = [...(table?.tBodies[0]?.rows ?? [])];
      expect(body[0]?.className).toBe('aui-data-grid-print__row--group');
      expect(body[0]?.cells[0]?.textContent).toBe('East');
      expect(body[1]?.cells[2]?.className).toBe('aui-data-grid-print__cell--end');
      // Still there until the browser says printing ended.
      expect(document.querySelector('.aui-data-grid-print')).not.toBeNull();
      window.dispatchEvent(new Event('afterprint'));
      expect(document.querySelector('.aui-data-grid-print')).toBeNull();
      const big = mount({ rows: Array.from({ length: 20_001 }, (_, i) => ({ ...sales[0]!, id: String(i) })) });
      expect(() => {
        big.print();
      }).toThrow(/dataGrid\.print\.rows/);
      g.print();
      g.destroy();
      expect(document.querySelector('.aui-data-grid-print')).toBeNull();
    } finally {
      if (original) Object.defineProperty(window, 'print', original);
      else Reflect.deleteProperty(window, 'print');
    }
  });
});
