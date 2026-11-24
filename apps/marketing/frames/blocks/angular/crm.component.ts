import { Component, signal } from '@angular/core';
import { AuiDataTable } from '@absoluteui/angular/data-table';
import type { DataTableColumn, DataTableSort } from '@absoluteui/components/data-table';
import type { PlainDate } from '@absoluteui/core';

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly stage: string;
  readonly region: string;
  readonly renewal: PlainDate;
  readonly value: number;
}

const STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Customer'];
const options = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

@Component({
  selector: 'app-accounts',
  imports: [AuiDataTable],
  template: `
    <aui-data-table caption="Accounts" [columns]="columns" [rows]="accounts()" [rowId]="rowId"
      selection="multiple" [searchable]="true" [filterRow]="true" [resizable]="true" [multiSort]="true"
      [pinnedColumns]="{ start: ['name'] }" [(sort)]="sort" [pageSize]="10" [pageSizes]="[10, 25, 64]" [stickyHeader]="true" />
  `,
})
export class AccountsComponent {
  /** Load from your API; the table filters, sorts, and pages on the client. */
  readonly accounts = signal<Account[]>([]);
  readonly sort = signal<DataTableSort | readonly DataTableSort[] | null>({ column: 'value', direction: 'descending' });
  readonly columns: DataTableColumn<Account>[] = [
    { id: 'name', header: 'Account', accessor: (a) => a.name, rowHeader: true, filter: 'text', minWidth: 180 },
    { id: 'owner', header: 'Owner', accessor: (a) => a.owner, filter: 'text' },
    { id: 'stage', header: 'Stage', accessor: (a) => a.stage, filter: 'enum', filterOptions: options(STAGES) },
    { id: 'region', header: 'Region', accessor: (a) => a.region, filter: 'text' },
    { id: 'renewal', header: 'Renewal', accessor: (a) => a.renewal, type: 'date', filter: 'date' },
    { id: 'value', header: 'Annual value', accessor: (a) => a.value, type: 'currency', currency: 'USD', filter: 'number' },
  ];
  readonly rowId = (a: Account): string => a.id;
}
