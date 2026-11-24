// Product proof (docs/PLAN-R4.md section 4.4 item 3): one large, fully interactive Data Table with
// search, per-column filters, sorting, selection, pinning, resizing, and paging.
import { DataTable, type DataTableColumn } from '@absoluteui/components/data-table';
import { plainDate, type PlainDate } from '@absoluteui/core';
import './runtime.js';

interface Employee {
  readonly id: string;
  readonly name: string;
  readonly department: string;
  readonly location: string;
  readonly started: PlainDate;
  readonly salary: number;
  readonly remote: boolean;
}

const FIRST = ['Aarav', 'Maya', 'Liam', 'Sofia', 'Noah', 'Ananya', 'Lucas', 'Emma', 'Kenji', 'Zara', 'Omar', 'Chloe', 'Ravi', 'Ines', 'Ethan', 'Leila'];
const LAST = ['Sharma', 'Okafor', 'Nguyen', 'Rossi', 'Schmidt', 'Iyer', 'Garcia', 'Tanaka', 'Dubois', 'Khan', 'Silva', 'Novak'];
const DEPARTMENTS = ['Engineering', 'Finance', 'Operations', 'People', 'Sales', 'Support'];
const LOCATIONS = ['Bengaluru', 'London', 'Singapore', 'Toronto', 'Berlin'];

// Deterministic rows (no Math.random): the preview looks the same on every load.
const rows: Employee[] = Array.from({ length: 48 }, (_, i) => ({
  id: `e${String(i + 1)}`,
  name: `${FIRST[i % FIRST.length] ?? ''} ${LAST[(i * 7) % LAST.length] ?? ''}`,
  department: DEPARTMENTS[(i * 5) % DEPARTMENTS.length] ?? '',
  location: LOCATIONS[(i * 3) % LOCATIONS.length] ?? '',
  started: plainDate(2018 + (i % 8), 1 + ((i * 5) % 12), 1 + ((i * 11) % 28)),
  salary: 52000 + ((i * 7919) % 68000),
  remote: i % 3 === 0,
}));

const enumOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
const columns: DataTableColumn<Employee>[] = [
  { id: 'name', header: 'Name', accessor: (e) => e.name, rowHeader: true, filter: 'text', minWidth: 160 },
  { id: 'department', header: 'Department', accessor: (e) => e.department, filter: 'enum', filterOptions: enumOptions(DEPARTMENTS) },
  { id: 'location', header: 'Location', accessor: (e) => e.location, filter: 'enum', filterOptions: enumOptions(LOCATIONS) },
  { id: 'started', header: 'Start date', accessor: (e) => e.started, type: 'date', filter: 'date' },
  { id: 'salary', header: 'Salary', accessor: (e) => e.salary, type: 'currency', currency: 'USD', filter: 'number' },
  { id: 'remote', header: 'Remote', accessor: (e) => e.remote, type: 'boolean' },
];

const host = document.getElementById('grid');
if (host) {
  DataTable.create<Employee>(host, {
    caption: 'Employees',
    columns,
    rows,
    rowId: (e) => e.id,
    selection: 'multiple',
    searchable: true,
    filterRow: true,
    resizable: true,
    pinnedColumns: { start: ['name'] },
    pageSize: 8,
    pageSizes: [8, 16, 48],
    multiSort: true,
    stickyHeader: true,
  });
}
