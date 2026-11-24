import { DataGrid, type DataGridOptions } from '@absoluteui/components/data-grid';
import { host, seed } from '../seed.js';

interface Row {
  id: string;
  date: string;
  account: string;
  entity: string;
  debit: number;
  credit: number;
  approved: boolean;
}

export default seed<DataGridOptions<Row>>({
  options: {
    label: 'Journal',
    columns: [
      { id: 'id', header: 'Line', field: 'id', pinned: 'start', width: 110 },
      { id: 'date', header: 'Date', field: 'date', filter: 'text', width: 120 },
      { id: 'account', header: 'Account', field: 'account', filter: 'set', groupable: true, editable: true, width: 170 },
      { id: 'entity', header: 'Entity', field: 'entity', filter: 'set', groupable: true, width: 110 },
      { id: 'debit', header: 'Debit', field: 'debit', type: 'currency', currency: 'EUR', aggregate: 'sum', editable: true, filter: 'number', width: 120 },
      { id: 'credit', header: 'Credit', field: 'credit', type: 'currency', currency: 'EUR', aggregate: 'sum', editable: true, filter: 'number', width: 120 },
      { id: 'approved', header: 'Approved', field: 'approved', type: 'boolean', editable: true, width: 110 },
    ],
    rows: [
      { id: 'JL-1001', date: '2026-11-02', account: '4000 Revenue', entity: 'UK Ltd', debit: 0, credit: 12400, approved: true },
      { id: 'JL-1002', date: '2026-11-03', account: '6100 Salaries', entity: 'DE GmbH', debit: 8300, credit: 0, approved: true },
      { id: 'JL-1003', date: '2026-11-05', account: '6200 Rent', entity: 'UK Ltd', debit: 2100, credit: 0, approved: false },
      { id: 'JL-1004', date: '2026-11-09', account: '6300 Travel', entity: 'IN Pvt Ltd', debit: 640, credit: 0, approved: true },
      { id: 'JL-1005', date: '2026-11-12', account: '4000 Revenue', entity: 'US Inc', debit: 0, credit: 9800, approved: true },
      { id: 'JL-1006', date: '2026-11-16', account: '6100 Salaries', entity: 'US Inc', debit: 7200, credit: 0, approved: false },
      { id: 'JL-1007', date: '2026-11-20', account: '1200 Receivables', entity: 'DE GmbH', debit: 4500, credit: 0, approved: true },
    ],
    rowId: (r) => r.id,
    rowSelection: { mode: 'multiple' },
    cellSelection: true,
    floatingFilters: true,
  },
  call: 'DataGrid.create<Entry>(host, $)',
  codeValues: { rowId: '(r) => r.id' },
  mount(stage, options) {
    const h = host(stage);
    h.style.setProperty('block-size', '380px');
    const c = DataGrid.create<Row>(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
