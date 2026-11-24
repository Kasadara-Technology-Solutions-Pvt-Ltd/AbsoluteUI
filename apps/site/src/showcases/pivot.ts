// Pivot showcase: payroll by department and quarter. Drag or move fields between areas in the
// field list, change aggregates, filter members, expand groups, and download the result.
import { downloadCsv } from '@absoluteui/components/data-table';
import { PivotFieldList, PivotGrid, type PivotGridLayoutChangeDetail } from '@absoluteui/components/pivot-grid';
import { action, choice, createShowcase, hostIn } from './kit.js';

interface Payment {
  department: string;
  team: string;
  country: string;
  quarter: string;
  type: 'salary' | 'bonus' | 'overtime';
  amount: number;
}

const sc = createShowcase({
  title: 'Payroll pivot',
  description: 'Rearrange rows, columns, and values in the field list, or pick a preset. Totals and subtotals update instantly.',
});

const DEPTS: Record<string, string[]> = { Engineering: ['Platform', 'Web', 'Data'], Finance: ['Accounts', 'Tax'], Sales: ['EMEA', 'APAC', 'Americas'] };
const COUNTRIES = ['UK', 'Germany', 'India', 'USA'];
const data: Payment[] = [];
let n = 0;
for (const [department, teams] of Object.entries(DEPTS)) {
  for (const team of teams) {
    for (const quarter of ['Q1', 'Q2', 'Q3', 'Q4']) {
      for (const type of ['salary', 'bonus', 'overtime'] as const) {
        n++;
        data.push({ department, team, country: COUNTRIES[n % COUNTRIES.length] ?? 'UK', quarter, type, amount: type === 'salary' ? 80_000 + ((n * 977) % 40_000) : ((n * 313) % 9000) + 500 });
      }
    }
  }
}

const listHost = hostIn(sc.stage);
const gridHost = hostIn(sc.stage);
const grid = PivotGrid.create<Payment>(gridHost, {
  caption: 'Payroll 2026',
  data,
  stickyHeader: true,
  columnSubtotals: true,
  fields: [
    { id: 'department', label: 'Department' },
    { id: 'team', label: 'Team' },
    { id: 'country', label: 'Country' },
    { id: 'quarter', label: 'Quarter' },
    { id: 'type', label: 'Pay type', formatMember: (key) => ({ salary: 'Salary', bonus: 'Bonus', overtime: 'Overtime' })[String(key)] ?? String(key) },
    { id: 'amount', label: 'Amount', numberFormat: { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 } },
  ],
  layout: { rows: ['department', 'team'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] },
});
PivotFieldList.create(listHost, { grid, label: 'Pivot fields' });
gridHost.addEventListener('aui-layout-change', (e) => {
  sc.log('layout changed', (e as CustomEvent<PivotGridLayoutChangeDetail>).detail.layout);
});

choice(
  sc,
  'Preset',
  [
    { value: 'dept-quarter', label: 'Department by quarter' },
    { value: 'country-type', label: 'Country by pay type' },
    { value: 'type-quarter', label: 'Pay type by quarter (average)' },
  ],
  'dept-quarter',
  (p) => {
    if (p === 'dept-quarter') grid.setLayout({ rows: ['department', 'team'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] });
    if (p === 'country-type') grid.setLayout({ rows: ['country'], columns: ['type'], values: [{ field: 'amount', aggregate: 'sum' }] });
    if (p === 'type-quarter') grid.setLayout({ rows: ['type'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'average' }] });
  },
);
choice(
  sc,
  'Grand totals',
  [
    { value: 'both', label: 'Rows and columns' },
    { value: 'rows', label: 'Rows only' },
    { value: 'columns', label: 'Columns only' },
    { value: 'none', label: 'None' },
  ],
  'both',
  (grandTotals) => {
    grid.update({ grandTotals });
  },
);
action(sc, 'Expand all', () => {
  void grid.expandAll('rows', true).then(() => grid.expandAll('columns', true));
});
action(sc, 'Download CSV', () => {
  downloadCsv(new Blob([grid.toCsv()], { type: 'text/csv' }), 'payroll-pivot.csv');
});
