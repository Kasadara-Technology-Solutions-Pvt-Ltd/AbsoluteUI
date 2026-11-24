import { Component } from '@angular/core';
import { AuiBarChart } from '@absoluteui/angular/bar-chart';
import { AuiDataTable } from '@absoluteui/angular/data-table';
import { AuiLineChart } from '@absoluteui/angular/line-chart';
import { AuiStatCard } from '@absoluteui/angular/stat-card';
import type { ChartSeries } from '@absoluteui/components/line-chart';
import type { DataTableColumn } from '@absoluteui/components/data-table';

interface Approval {
  readonly id: string;
  readonly request: string;
  readonly owner: string;
  readonly amount: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [AuiStatCard, AuiLineChart, AuiBarChart, AuiDataTable],
  template: `
    <section class="stats" aria-label="Key metrics">
      <aui-stat-card label="Revenue" [value]="48200" [previous]="40100" [valueFormat]="usd" comparisonLabel="vs last month" [trend]="[31000, 35500, 38200, 40100, 48200]" />
      <aui-stat-card label="Active customers" [value]="1284" [previous]="1203" comparisonLabel="vs last month" [trend]="[1090, 1122, 1160, 1203, 1284]" />
      <aui-stat-card label="Open tickets" [value]="37" [previous]="52" sentiment="lower-is-better" comparisonLabel="vs last month" [trend]="[61, 58, 55, 52, 37]" />
    </section>
    <aui-line-chart label="Revenue and target" description="Thousands of US dollars per month" [x]="months" [series]="trend" [area]="true" [height]="220" />
    <aui-bar-chart label="Revenue by region" [categories]="regions" [series]="byRegion" [height]="220" />
    <aui-data-table caption="Pending approvals" [columns]="columns" [rows]="approvals" [rowId]="rowId" selection="multiple" [pageSize]="null" />
  `,
})
export class DashboardComponent {
  readonly usd: Intl.NumberFormatOptions = { style: 'currency', currency: 'USD', maximumFractionDigits: 0 };
  readonly months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  readonly trend: ChartSeries[] = [
    { id: 'revenue', label: 'Revenue', values: [31, 35.5, 38.2, 40.1, 44.6, 48.2] },
    { id: 'target', label: 'Target', values: [32, 34, 36, 38, 40, 42] },
  ];
  readonly regions = ['North America', 'Europe', 'Asia Pacific', 'India'];
  readonly byRegion: ChartSeries[] = [{ id: 'q3', label: 'Q3', values: [18.2, 14.6, 9.4, 6.1] }];
  readonly approvals: Approval[] = [
    { id: 'a1', request: 'Annual licence renewal', owner: 'Priya Iyer', amount: 12400 },
    { id: 'a2', request: 'Conference travel', owner: 'Liam Novak', amount: 2350 },
    { id: 'a3', request: 'New laptops (4)', owner: 'Maya Okafor', amount: 6800 },
  ];
  readonly columns: DataTableColumn<Approval>[] = [
    { id: 'request', header: 'Request', accessor: (a) => a.request, rowHeader: true },
    { id: 'owner', header: 'Owner', accessor: (a) => a.owner },
    { id: 'amount', header: 'Amount', accessor: (a) => a.amount, type: 'currency', currency: 'USD' },
  ];
  readonly rowId = (a: Approval): string => a.id;
}
