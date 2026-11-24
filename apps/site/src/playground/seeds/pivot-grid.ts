import { PivotGrid, type PivotGridOptions } from '@absoluteui/components/pivot-grid';
import { host, seed } from '../seed.js';

interface Row {
  department: string;
  country: string;
  quarter: string;
  type: string;
  amount: number;
}

export default seed<PivotGridOptions<Row>>({
  options: {
    caption: 'Payroll 2026',
    fields: [
      { id: 'department', label: 'Department' },
      { id: 'country', label: 'Country' },
      { id: 'quarter', label: 'Quarter' },
      { id: 'type', label: 'Pay type' },
      { id: 'amount', label: 'Amount', numberFormat: { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 } },
    ],
    data: [
      { department: 'Engineering', country: 'UK', quarter: 'Q1', type: 'Salary', amount: 182000 },
      { department: 'Engineering', country: 'India', quarter: 'Q2', type: 'Salary', amount: 96000 },
      { department: 'Engineering', country: 'UK', quarter: 'Q2', type: 'Bonus', amount: 14000 },
      { department: 'Finance', country: 'Germany', quarter: 'Q1', type: 'Salary', amount: 88000 },
      { department: 'Finance', country: 'Germany', quarter: 'Q2', type: 'Overtime', amount: 4200 },
      { department: 'Sales', country: 'USA', quarter: 'Q1', type: 'Salary', amount: 120000 },
      { department: 'Sales', country: 'USA', quarter: 'Q2', type: 'Bonus', amount: 31000 },
      { department: 'Sales', country: 'UK', quarter: 'Q2', type: 'Salary', amount: 74000 },
    ],
    layout: { rows: ['department', 'country'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] },
    stickyHeader: true,
    expandDepth: 1,
  },
  call: 'PivotGrid.create<Payment>(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = PivotGrid.create<Row>(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
