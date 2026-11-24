import { DataTable, type DataTableOptions } from '@absoluteui/components/data-table';
import { host, seed } from '../seed.js';

interface Row {
  id: string;
  name: string;
  department: string;
  location: string;
  salary: number;
  remote: boolean;
}

export default seed<DataTableOptions<Row>>({
  options: {
    caption: 'Employees',
    columns: [
      { id: 'name', header: 'Name', accessor: (r) => r.name, sortable: true, rowHeader: true },
      { id: 'department', header: 'Department', accessor: (r) => r.department, sortable: true },
      { id: 'location', header: 'Location', accessor: (r) => r.location, sortable: true },
      { id: 'salary', header: 'Salary', accessor: (r) => r.salary, type: 'currency', currency: 'EUR', sortable: true, align: 'end' },
      { id: 'remote', header: 'Remote', accessor: (r) => r.remote, type: 'boolean' },
    ],
    rows: [
      { id: 'E1001', name: 'Ada Kowalski', department: 'Engineering', location: 'London', salary: 86000, remote: true },
      { id: 'E1002', name: 'Bruno Silva', department: 'Finance', location: 'Berlin', salary: 64000, remote: false },
      { id: 'E1003', name: 'Chen Wei', department: 'Engineering', location: 'Bengaluru', salary: 72000, remote: false },
      { id: 'E1004', name: 'Divya Nair', department: 'People', location: 'London', salary: 58000, remote: true },
      { id: 'E1005', name: 'Emeka Obi', department: 'Sales', location: 'New York', salary: 69000, remote: false },
      { id: 'E1006', name: 'Farah Haddad', department: 'Operations', location: 'Tokyo', salary: 61000, remote: false },
      { id: 'E1007', name: 'Grace Liu', department: 'Engineering', location: 'Berlin', salary: 91000, remote: true },
    ],
    rowId: (r) => r.id,
    selection: 'multiple',
    searchable: true,
    pageSize: 5,
    sort: { column: 'name', direction: 'ascending' },
    renderDetail: (r, doc) => {
      const p = doc.createElement('p');
      p.textContent = `${r.name} works in ${r.department} in ${r.location}${r.remote ? ', remotely' : ''}.`;
      return p;
    },
  },
  call: 'DataTable.create<Employee>(host, $)',
  // Virtual rows need a uniform height, so detail rows are off while `virtual` is on.
  adjust: (name, value) => (name === 'virtual' && value === true ? { renderDetail: undefined } : undefined),
  codeValues: {
    columns: [
      '[',
      "    { id: 'name', header: 'Name', accessor: (r) => r.name, sortable: true, rowHeader: true },",
      "    { id: 'department', header: 'Department', accessor: (r) => r.department, sortable: true },",
      "    { id: 'location', header: 'Location', accessor: (r) => r.location, sortable: true },",
      "    { id: 'salary', header: 'Salary', accessor: (r) => r.salary, type: 'currency', currency: 'EUR', sortable: true, align: 'end' },",
      "    { id: 'remote', header: 'Remote', accessor: (r) => r.remote, type: 'boolean' },",
      '  ]',
    ].join('\n'),
    rowId: '(r) => r.id',
    renderDetail: [
      '(r, doc) => {',
      "    const p = doc.createElement('p');",
      '    p.textContent = `${r.name} works in ${r.department} in ${r.location}.`;',
      '    return p;',
      '  }',
    ].join('\n'),
  },
  mount(stage, options) {
    const h = host(stage);
    const c = DataTable.create<Row>(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
