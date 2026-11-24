// R1 pickers and data table page, bundled against the built packages.
import { configureAbsoluteUI, parseInstant, plainDate, plainTime, type Instant, type PlainDate } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Calendar } from '@absoluteui/components/calendar';
import { DatePicker } from '@absoluteui/components/date-picker';
import { TimePicker } from '@absoluteui/components/time-picker';
import { DateTimePicker } from '@absoluteui/components/date-time-picker';
import { Button } from '@absoluteui/components/button';
import { DataTable, DataTableColumnChooser, downloadCsv, type DataTableColumn, type DataTableSelectionChangeDetail } from '@absoluteui/components/data-table';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', timezone: 'America/New_York', locale: params.get('locale') ?? 'en-US' });
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}
const last = byId('last-value');
document.addEventListener('aui-change', (e) => {
  const detail = (e as CustomEvent<{ value?: unknown }>).detail;
  last.textContent = JSON.stringify(detail.value ?? null);
});

// Fixed "today" keeps screenshots stable (documented advanced option).
Calendar.create(byId('calendar'), { value: plainDate(2026, 3, 18), today: plainDate(2026, 3, 16), label: 'Delivery date' });
DatePicker.create(byId('date-picker'), { label: 'Start date', name: 'start', value: plainDate(2026, 3, 8), min: plainDate(2026, 1, 1) });
TimePicker.create(byId('time-picker'), { label: 'Reminder time', name: 'reminder', value: plainTime(9, 30), step: 30 });
DateTimePicker.create(byId('date-time-picker'), { label: 'Meeting', name: 'meeting', value: parseInstant('2026-03-08T15:00:00Z') });

interface Order {
  id: string;
  customer: string;
  amount: number;
  placed: PlainDate;
  updated: Instant;
  paid: boolean;
}
const customers = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Edsger Dijkstra', 'Barbara Liskov', 'Donald Knuth'];
const rows: Order[] = Array.from({ length: 57 }, (_, i) => ({
  id: `ORD-${String(1000 + i)}`,
  customer: customers[i % customers.length] ?? 'Unknown',
  amount: Math.round(((i * 7919) % 100000) / 7) / 100,
  placed: plainDate(2026, 1 + (i % 12), 1 + (i % 28)),
  updated: parseInstant(`2026-03-${String(1 + (i % 28)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:15:00Z`) ?? parseInstant('2026-03-01T00:00:00Z')!,
  paid: i % 3 !== 0,
}));
const columns: DataTableColumn<Order>[] = [
  { id: 'id', header: 'Order', accessor: (r) => r.id, rowHeader: true },
  { id: 'customer', header: 'Customer', accessor: (r) => r.customer },
  { id: 'amount', header: 'Amount', accessor: (r) => r.amount, type: 'currency', currency: 'USD' },
  { id: 'placed', header: 'Placed', accessor: (r) => r.placed, type: 'date' },
  { id: 'updated', header: 'Updated', accessor: (r) => r.updated, type: 'datetime' },
  { id: 'paid', header: 'Paid', accessor: (r) => r.paid, type: 'boolean' },
];
const table = DataTable.create(byId('table'), {
  caption: 'Orders',
  columns,
  rows,
  rowId: (r) => r.id,
  selection: 'multiple',
  pageSize: 10,
  pageSizes: [10, 25, 50],
  sort: { column: 'id', direction: 'ascending' },
});
table.host.addEventListener('aui-selection-change', (e) => {
  byId('selected').textContent = (e as CustomEvent<DataTableSelectionChangeDetail>).detail.selected.join(', ') || 'none';
});

// Data grid (R2): filters, search, multi-sort, resize, pinning, detail rows, column chooser, CSV.
interface Employee {
  id: string;
  name: string;
  dept: string;
  salary: number;
  start: PlainDate;
  remote: boolean;
  notes: string;
}
const depts = ['Engineering', 'Operations', 'Finance'];
const people: Employee[] = Array.from({ length: 24 }, (_, i) => ({
  id: `EMP-${String(100 + i)}`,
  name: `${customers[i % customers.length] ?? 'Unknown'} ${String.fromCharCode(65 + (i % 26))}.`,
  dept: depts[i % depts.length] ?? 'Engineering',
  salary: 60000 + ((i * 7919) % 90) * 1000,
  start: plainDate(2015 + (i % 10), 1 + (i % 12), 1 + ((i * 3) % 28)),
  remote: i % 2 === 0,
  notes: i % 5 === 0 ? '=HYPERLINK("http://example.invalid")' : `Reports to team lead ${String(i % 4)}`,
}));
const gridColumns: DataTableColumn<Employee>[] = [
  { id: 'name', header: 'Name', accessor: (r) => r.name, filter: 'text', hideable: false, minWidth: 120 },
  { id: 'dept', header: 'Department', accessor: (r) => r.dept, filter: 'enum', filterOptions: depts.map((d) => ({ value: d, label: d })) },
  { id: 'salary', header: 'Salary', accessor: (r) => r.salary, type: 'currency', currency: 'USD', filter: 'number' },
  { id: 'start', header: 'Start date', accessor: (r) => r.start, type: 'date', filter: 'date' },
  { id: 'remote', header: 'Remote', accessor: (r) => r.remote, type: 'boolean', filter: 'enum' },
  { id: 'notes', header: 'Notes', accessor: (r) => r.notes, sortable: false },
];
const gridEvents = byId('grid-events');
const grid = DataTable.create(byId('grid'), {
  caption: 'Employees',
  columns: gridColumns,
  rows: people,
  rowId: (r) => r.id,
  selection: 'multiple',
  multiSort: true,
  searchable: true,
  resizable: true,
  pageSize: 5,
  pageSizes: [5, 10, 25],
  pinnedColumns: { start: ['name'] },
  sort: [{ column: 'dept', direction: 'ascending' }, { column: 'salary', direction: 'descending' }],
  // The first row in the initial sort order (Engineering, highest salary) starts expanded.
  expanded: [people.filter((p) => p.dept === 'Engineering').sort((x, y) => y.salary - x.salary)[0]?.id ?? ''],
  renderDetail: (r, doc) => {
    const p = doc.createElement('p');
    p.className = 'demo-detail';
    p.textContent = `${r.name} works in ${r.dept}. ${r.notes}`;
    return p;
  },
});
for (const type of ['aui-sort-change', 'aui-filter-change', 'aui-columns-change', 'aui-expand-change']) {
  grid.host.addEventListener(type, () => {
    gridEvents.textContent = type;
  });
}
const columnsButton = byId('grid-columns');
const exportButton = byId('grid-export');
if (columnsButton instanceof HTMLButtonElement && exportButton instanceof HTMLButtonElement) {
  Button.enhance(columnsButton);
  Button.enhance(exportButton);
  DataTableColumnChooser.create(columnsButton, grid);
  exportButton.addEventListener('click', () => {
    downloadCsv(grid.toCsvBlob({ rows: 'filtered' }), 'employees.csv');
  });
}

interface Reading {
  id: string;
  sensor: string;
  value: number;
}
const readings: Reading[] = Array.from({ length: 10_000 }, (_, i) => ({ id: `r${String(i)}`, sensor: `Sensor ${String(i + 1)}`, value: (i * 37) % 1000 }));
const virtualTable = DataTable.create(byId('virtual'), {
  caption: 'Readings',
  rows: readings,
  rowId: (r) => r.id,
  pageSize: null,
  virtual: true,
  selection: 'multiple',
  columns: [
    { id: 'sensor', header: 'Sensor', accessor: (r) => r.sensor },
    { id: 'value', header: 'Value', accessor: (r) => r.value, type: 'number' },
  ],
});

Object.assign(window, { __auiReady: true, __aui: { DataTable, grid, virtualTable } });
