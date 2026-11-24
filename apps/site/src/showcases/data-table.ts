// Data Table showcase: an employee directory with sorting (multi-sort with Shift), search, a
// filter row, selection, expandable detail rows, grouping with totals, a column chooser,
// CSV download, and a simulated server mode with loading and paging.
import { Button } from '@absoluteui/components/button';
import { DataTable, DataTableColumnChooser, downloadCsv, type DataTableColumn, type DataTablePageChangeDetail, type DataTableSortChangeDetail } from '@absoluteui/components/data-table';
import { action, choice, createShowcase, hostIn, toggle, wait } from './kit.js';

interface Employee {
  id: string;
  name: string;
  department: string;
  location: string;
  salary: number;
  start: string;
  remote: boolean;
}

const sc = createShowcase({
  title: 'Employee directory',
  description: '200 employees: sort, search, filter, select, expand a row, group by department, choose columns, or switch to a simulated server.',
  simulated: true,
});

const FIRST = ['Ada', 'Bruno', 'Chen', 'Divya', 'Emeka', 'Farah', 'Grace', 'Hiro', 'Inés', 'Jonas', 'Kofi', 'Lena', 'Mateo', 'Nora', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sami', 'Tomas'];
const LAST = ['Kowalski', 'Silva', 'Wei', 'Nair', 'Obi', 'Haddad', 'Liu', 'Tanaka', 'García', 'Berg'];
const DEPTS = ['Engineering', 'Finance', 'People', 'Operations', 'Sales'];
const CITIES = ['London', 'Berlin', 'Bengaluru', 'New York', 'Tokyo'];
const all: Employee[] = Array.from({ length: 200 }, (_, i) => ({
  id: `E${String(1000 + i)}`,
  name: `${FIRST[i % FIRST.length] ?? ''} ${LAST[(i * 7) % LAST.length] ?? ''}`,
  department: DEPTS[(i * 3) % DEPTS.length] ?? '',
  location: CITIES[(i * 11) % CITIES.length] ?? '',
  salary: 42_000 + ((i * 7919) % 90_000),
  start: `20${String(15 + (i % 10)).padStart(2, '0')}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
  remote: i % 4 === 0,
}));

const columns: DataTableColumn<Employee>[] = [
  { id: 'name', header: 'Name', accessor: (r) => r.name, sortable: true, rowHeader: true },
  { id: 'department', header: 'Department', accessor: (r) => r.department, sortable: true },
  { id: 'location', header: 'Location', accessor: (r) => r.location, sortable: true },
  { id: 'salary', header: 'Salary', accessor: (r) => r.salary, type: 'currency', currency: 'EUR', sortable: true, align: 'end' },
  { id: 'start', header: 'Start date', accessor: (r) => r.start, sortable: true },
  { id: 'remote', header: 'Remote', accessor: (r) => r.remote, type: 'boolean' },
];

const toolbar = hostIn(sc.stage);
toolbar.className = 'sc-row';
const chooserButton = Button.create({ text: 'Columns', icon: 'chevron-down', iconPosition: 'end', variant: 'secondary', size: 'sm' }, document);
toolbar.append(chooserButton.element);

const host = hostIn(sc.stage);
let server = false;
const table = DataTable.create<Employee>(host, {
  caption: 'Employees',
  columns,
  rows: all,
  rowId: (r) => r.id,
  selection: 'multiple',
  searchable: true,
  pageSize: 10,
  pageSizes: [10, 25, 50],
  multiSort: true,
  stickyHeader: true,
  resizable: true,
  sort: { column: 'name', direction: 'ascending' },
  renderDetail: (r, doc) => {
    const p = doc.createElement('p');
    p.textContent = `${r.name} joined ${r.department} in ${r.location} on ${r.start}${r.remote ? ' and works remotely' : ''}.`;
    return p;
  },
});
DataTableColumnChooser.create(chooserButton.element, table, { label: 'Visible columns' });

// The simulated server: sorts and pages on "the server" after a delay.
const serverLoad = async (page: number, pageSize: number, sort: DataTableSortChangeDetail['sort'] | null): Promise<void> => {
  table.update({ loading: true });
  await wait(450);
  const sorted = [...all];
  if (sort) {
    const col = columns.find((c) => c.id === sort.column);
    if (col) sorted.sort((a, b) => String(col.accessor(a)).localeCompare(String(col.accessor(b)), undefined, { numeric: true }) * (sort.direction === 'descending' ? -1 : 1));
  }
  table.update({ rows: sorted.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, loading: false });
  sc.log('server answered', { page, pageSize });
};
host.addEventListener('aui-page-change', (e) => {
  const d = (e as CustomEvent<DataTablePageChangeDetail>).detail;
  if (server) void serverLoad(d.page, d.pageSize, table.getState().sort[0] ?? null);
});
host.addEventListener('aui-sort-change', (e) => {
  if (server) void serverLoad(1, 10, (e as CustomEvent<DataTableSortChangeDetail>).detail.sort);
});
sc.listen(host, ['aui-sort-change', 'aui-selection-change', 'aui-page-change', 'aui-filter-change', 'aui-expand-change', 'aui-columns-change'], 'table');

choice(
  sc,
  'Group by',
  [
    { value: 'none', label: 'No grouping' },
    { value: 'department', label: 'Department' },
    { value: 'location', label: 'Location' },
  ],
  'none',
  (g) => {
    table.update({ groupBy: g === 'none' ? [] : [g], showTotals: g !== 'none' });
  },
);
choice(
  sc,
  'Density',
  [
    { value: 'compact', label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'spacious', label: 'Spacious' },
  ],
  'comfortable',
  (density) => {
    table.update({ density });
  },
);
toggle(sc, 'Filter row', false, (filterRow) => {
  table.update({ filterRow });
});
toggle(sc, 'Simulated server', false, (on) => {
  server = on;
  table.update(on ? { mode: 'server', rows: all.slice(0, 10), total: all.length, page: 1, groupBy: [], searchable: false } : { mode: 'client', rows: all, searchable: true, loading: false });
  if (on) void serverLoad(1, 10, table.getState().sort[0] ?? null);
});
action(sc, 'Download CSV', () => {
  downloadCsv(table.toCsvBlob({ rows: 'filtered', bom: true }), 'employees.csv');
  sc.log('CSV downloaded');
});
