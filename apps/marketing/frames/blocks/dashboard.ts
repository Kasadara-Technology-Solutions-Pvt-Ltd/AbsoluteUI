import { BarChart } from '@absoluteui/components/bar-chart';
import { DataTable, type DataTableColumn } from '@absoluteui/components/data-table';
import { LineChart } from '@absoluteui/components/line-chart';
import { StatCard } from '@absoluteui/components/stat-card';

const el = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node;
};

const usd = { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } as const;
StatCard.create(el('revenue'), { label: 'Revenue', value: 48200, previous: 40100, valueFormat: usd, comparisonLabel: 'vs last month', trend: [31000, 35500, 38200, 40100, 48200] });
StatCard.create(el('customers'), { label: 'Active customers', value: 1284, previous: 1203, comparisonLabel: 'vs last month', trend: [1090, 1122, 1160, 1203, 1284] });
StatCard.create(el('churn'), { label: 'Churn', value: 2.1, previous: 2.6, sentiment: 'lower-is-better', valueFormat: { style: 'unit', unit: 'percent', maximumFractionDigits: 1 }, comparisonLabel: 'vs last month', trend: [3.1, 2.9, 2.8, 2.6, 2.1] });
StatCard.create(el('tickets'), { label: 'Open tickets', value: 37, previous: 52, sentiment: 'lower-is-better', comparisonLabel: 'vs last month', trend: [61, 58, 55, 52, 37] });

LineChart.create(el('trend'), {
  label: 'Revenue and target',
  description: 'Thousands of US dollars per month',
  x: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
  series: [
    { id: 'revenue', label: 'Revenue', values: [31, 35.5, 38.2, 40.1, 44.6, 48.2] },
    { id: 'target', label: 'Target', values: [32, 34, 36, 38, 40, 42] },
  ],
  area: true,
  height: 220,
});

BarChart.create(el('regions'), {
  label: 'Revenue by region',
  categories: ['North America', 'Europe', 'Asia Pacific', 'India'],
  series: [{ id: 'q3', label: 'Q3', values: [18.2, 14.6, 9.4, 6.1] }],
  valueFormat: { style: 'currency', currency: 'USD', maximumFractionDigits: 1, notation: 'compact' },
  height: 220,
});

interface Approval {
  readonly id: string;
  readonly request: string;
  readonly owner: string;
  readonly amount: number;
}
const approvals: Approval[] = [
  { id: 'a1', request: 'Annual licence renewal', owner: 'Priya Iyer', amount: 12400 },
  { id: 'a2', request: 'Conference travel', owner: 'Liam Novak', amount: 2350 },
  { id: 'a3', request: 'New laptops (4)', owner: 'Maya Okafor', amount: 6800 },
];
const columns: DataTableColumn<Approval>[] = [
  { id: 'request', header: 'Request', accessor: (a) => a.request, rowHeader: true },
  { id: 'owner', header: 'Owner', accessor: (a) => a.owner },
  { id: 'amount', header: 'Amount', accessor: (a) => a.amount, type: 'currency', currency: 'USD' },
];
DataTable.create<Approval>(el('approvals'), { caption: 'Pending approvals', columns, rows: approvals, rowId: (a) => a.id, selection: 'multiple', pageSize: null });
