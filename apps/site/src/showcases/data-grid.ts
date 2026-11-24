// Data Grid showcase: a ledger with 5,000 rows. Editing with validation and undo, cell ranges
// with copy, paste, and fill, grouping with totals, filters, column menus, a toolbar, a status
// bar, find, pinned columns, and CSV, Excel, and PDF export.
import { DataGrid, type DataGridCellsChangeDetail } from '@absoluteui/components/data-grid';
import { columnMenu, contextMenu, find, statusBar, toolbar } from '@absoluteui/components/data-grid/accessories';
import { toXlsx } from '@absoluteui/components/data-grid/export';
import { toPdf } from '@absoluteui/components/data-grid/pdf';
import { downloadCsv } from '@absoluteui/components/data-table';
import { action, choice, createShowcase, hostIn, toggle } from './kit.js';

interface Entry {
  id: string;
  date: string;
  account: string;
  entity: string;
  description: string;
  debit: number;
  credit: number;
  approved: boolean;
}

const sc = createShowcase({
  title: 'Ledger',
  description: '5,000 journal lines. Edit cells (Enter or typing), select ranges with Shift+arrows, copy and paste, fill down with Ctrl+D, undo with Ctrl+Z, group, filter, and export.',
});

const ACCOUNTS = ['4000 Revenue', '5000 Cost of sales', '6100 Salaries', '6200 Rent', '6300 Travel', '1200 Receivables'];
const ENTITIES = ['UK Ltd', 'DE GmbH', 'IN Pvt Ltd', 'US Inc'];
const rows: Entry[] = Array.from({ length: 5000 }, (_, i) => {
  const amount = ((i * 7919) % 9000) + 100;
  const debit = i % 3 !== 0;
  return {
    id: `JL-${String(100000 + i)}`,
    date: `2026-${String(1 + (i % 11)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
    account: ACCOUNTS[(i * 5) % ACCOUNTS.length] ?? '',
    entity: ENTITIES[(i * 3) % ENTITIES.length] ?? '',
    description: `Journal line ${String(i + 1)}`,
    debit: debit ? amount : 0,
    credit: debit ? 0 : amount,
    approved: i % 5 !== 0,
  };
});

const host = hostIn(sc.stage);
host.style.setProperty('block-size', '520px');
const grid = DataGrid.create<Entry>(host, {
  label: 'Journal',
  rows,
  rowId: (r) => r.id,
  cellSelection: { fillHandle: true },
  rowSelection: { mode: 'multiple' },
  accessories: [columnMenu(), contextMenu(), statusBar(), toolbar({ items: ['resetColumns'] }), find()],
  columns: [
    { id: 'id', header: 'Line', field: 'id', pinned: 'start', width: 120 },
    { id: 'date', header: 'Date', field: 'date', filter: 'text', width: 120 },
    { id: 'account', header: 'Account', field: 'account', filter: 'set', groupable: true, editable: true, width: 180 },
    { id: 'entity', header: 'Entity', field: 'entity', filter: 'set', groupable: true, width: 120 },
    { id: 'description', header: 'Description', field: 'description', editable: true, required: true, flex: 1, minWidth: 180 },
    { id: 'debit', header: 'Debit', field: 'debit', type: 'currency', currency: 'EUR', aggregate: 'sum', editable: true, editor: { min: 0 }, filter: 'number', width: 130 },
    { id: 'credit', header: 'Credit', field: 'credit', type: 'currency', currency: 'EUR', aggregate: 'sum', editable: true, editor: { min: 0 }, filter: 'number', width: 130 },
    { id: 'approved', header: 'Approved', field: 'approved', type: 'boolean', editable: true, width: 110 },
  ],
});
host.addEventListener('aui-cells-change', (e) => {
  const { changes } = (e as CustomEvent<DataGridCellsChangeDetail>).detail;
  sc.log('cells changed', changes.slice(0, 3).map((c) => ({ row: c.rowId, column: c.column, value: c.newValue })));
});
sc.listen(host, ['aui-sort-change', 'aui-filter-change', 'aui-selection-change'], 'grid');

choice(
  sc,
  'Group by',
  [
    { value: 'none', label: 'No grouping' },
    { value: 'entity', label: 'Entity' },
    { value: 'account', label: 'Account' },
    { value: 'entity,account', label: 'Entity, then account' },
  ],
  'none',
  (g) => {
    grid.update({ groupBy: g === 'none' ? [] : g.split(','), groupTotals: 'bottom', grandTotal: g === 'none' ? null : 'bottom' });
  },
);
toggle(sc, 'Group panel', false, (groupPanel) => {
  grid.update({ groupPanel });
});
action(sc, 'CSV', () => {
  downloadCsv(grid.toCsvBlob({ bom: true }), 'journal.csv');
});
action(sc, 'Excel', () => {
  void toXlsx(grid, { autoFilter: true }).then((blob) => {
    downloadCsv(blob, 'journal.xlsx');
  });
});
action(sc, 'PDF', () => {
  void toPdf(grid, { title: 'Journal', orientation: 'landscape' }).then((blob) => {
    downloadCsv(blob, 'journal.pdf');
  });
});
