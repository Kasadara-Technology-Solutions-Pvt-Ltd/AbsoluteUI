// Hero result panel (docs/PLAN-MARKETING-REDESIGN.md section 4.1): the Data Table that the hero's
// code renders, compact enough for half the page width.
import { DataTable, type DataTableColumn } from '@absoluteui/components/data-table';
import './runtime.js';

interface Order {
  readonly id: string;
  readonly customer: string;
  readonly region: string;
  readonly total: number;
  readonly paid: boolean;
}

const rows: Order[] = [
  { id: 'o-1042', customer: 'Northwind Traders', region: 'Europe', total: 12400, paid: true },
  { id: 'o-1043', customer: 'Contoso Health', region: 'North America', total: 9800, paid: true },
  { id: 'o-1044', customer: 'Tailspin Logistics', region: 'Asia Pacific', total: 7350, paid: false },
  { id: 'o-1045', customer: 'Fabrikam Energy', region: 'Europe', total: 5120, paid: true },
  { id: 'o-1046', customer: 'Adatum Retail', region: 'India', total: 4480, paid: false },
];
const columns: DataTableColumn<Order>[] = [
  { id: 'customer', header: 'Customer', accessor: (o) => o.customer, rowHeader: true },
  { id: 'region', header: 'Region', accessor: (o) => o.region },
  { id: 'total', header: 'Total', accessor: (o) => o.total, type: 'currency', currency: 'USD' },
  { id: 'paid', header: 'Paid', accessor: (o) => o.paid, type: 'boolean', sortable: false },
];

const host = document.getElementById('table');
if (host) DataTable.create<Order>(host, { caption: 'Orders', columns, rows, rowId: (o) => o.id, selection: 'multiple', searchable: true, pageSize: null, density: 'compact' });
