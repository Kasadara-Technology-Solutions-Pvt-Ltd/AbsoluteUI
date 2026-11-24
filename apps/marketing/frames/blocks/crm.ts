import { DataTable, type DataTableColumn } from '@absoluteui/components/data-table';
import { plainDate, type PlainDate } from '@absoluteui/core';

interface Account {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly stage: string;
  readonly region: string;
  readonly renewal: PlainDate;
  readonly value: number;
}

const STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Customer'];
const REGIONS = ['North America', 'Europe', 'Asia Pacific', 'India'];
const NAMES = ['Northwind', 'Contoso', 'Tailspin', 'Fabrikam', 'Adatum', 'Litware', 'Proseware', 'Wingtip', 'Fourth Coffee', 'Alpine Ski'];
const OWNERS = ['Priya Iyer', 'Liam Novak', 'Maya Okafor', 'Kenji Tanaka', 'Sofia Rossi'];

// Deterministic sample data.
const accounts: Account[] = Array.from({ length: 64 }, (_, i) => ({
  id: `acc-${String(i + 1)}`,
  name: `${NAMES[i % NAMES.length] ?? ''} ${['Group', 'Labs', 'Retail', 'Health'][i % 4] ?? ''}`,
  owner: OWNERS[(i * 3) % OWNERS.length] ?? '',
  stage: STAGES[(i * 7) % STAGES.length] ?? '',
  region: REGIONS[(i * 5) % REGIONS.length] ?? '',
  renewal: plainDate(2027, 1 + ((i * 5) % 12), 1 + ((i * 11) % 28)),
  value: 8000 + ((i * 7919) % 92000),
}));

const options = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
const columns: DataTableColumn<Account>[] = [
  { id: 'name', header: 'Account', accessor: (a) => a.name, rowHeader: true, filter: 'text', minWidth: 180 },
  { id: 'owner', header: 'Owner', accessor: (a) => a.owner, filter: 'enum', filterOptions: options(OWNERS) },
  { id: 'stage', header: 'Stage', accessor: (a) => a.stage, filter: 'enum', filterOptions: options(STAGES) },
  { id: 'region', header: 'Region', accessor: (a) => a.region, filter: 'enum', filterOptions: options(REGIONS) },
  { id: 'renewal', header: 'Renewal', accessor: (a) => a.renewal, type: 'date', filter: 'date' },
  { id: 'value', header: 'Annual value', accessor: (a) => a.value, type: 'currency', currency: 'USD', filter: 'number' },
];

const host = document.getElementById('accounts');
if (host) {
  DataTable.create<Account>(host, {
    caption: 'Accounts',
    columns,
    rows: accounts,
    rowId: (a) => a.id,
    selection: 'multiple',
    searchable: true,
    filterRow: true,
    resizable: true,
    multiSort: true,
    pinnedColumns: { start: ['name'] },
    sort: { column: 'value', direction: 'descending' },
    pageSize: 10,
    pageSizes: [10, 25, 64],
    stickyHeader: true,
  });
}
