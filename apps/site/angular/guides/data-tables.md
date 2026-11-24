---
title: Data tables
description: Declare columns in templates, bind table state two-way, group and aggregate rows, and edit cells inline with the Angular Data Table.
---

```html
<aui-data-table caption="Employees" [rows]="employees()" [rowId]="byId" selection="multiple"
  [(selected)]="picked" [(sort)]="sort" [groupBy]="['department']" [(collapsedGroups)]="collapsed">
  <aui-column field="name" header="Employee" rowHeader>
    <ng-template auiCell let-e>{{ e.name }} ({{ e.email }})</ng-template>
  </aui-column>
  <aui-column field="department" header="Department" />
  <aui-column id="salary" header="Salary" [accessor]="salaryOf" type="currency" currency="EUR" aggregate="sum" />
  <ng-template auiEmpty>No employees match.</ng-template>
</aui-data-table>
```

## Columns

Bind `[columns]` (data) or declare `<aui-column>` children; import `AUI_DATA_TABLE` for the table, the column, and the templates. Column inputs mirror the column options: `field` reads a row property, `[accessor]` computes a value (its row type types the column), and a column's own `auiCell` and `auiHeader` templates need no column id.

## State

Two-way bindings: `[(sort)]`, `[(selected)]`, `[(page)]`, `[(pageSize)]`, `[(filters)]`, `[(search)]`, `[(expanded)]`, `[(hiddenColumns)]`, `[(columnOrder)]`, `[(columnWidths)]`, `[(pinnedColumns)]`, `[(collapsedGroups)]`. Typed methods: `getState()`, `setState()`, `toCsv()`, `setSelected()`, and others (see the [Data Table](/docs/angular/components/data-table/) page). Save and restore a view with `getState()` and `setState()`.

## Grouping and aggregation

`[groupBy]` groups rows (client mode, not virtual) with counts and aggregates in the group headers; `(groupToggled)` reports expand and collapse. A column `aggregate` (`sum`, `avg`, `min`, `max`, `count`, or a function) adds group values and a totals row. In server mode, pass `[totals]`.

## Inline editing

Mark a column `editable` (or bind `[editable]` to a function of the row). Built-in editors follow the column `type`, or set `editor`: `text`, `number`, `date`, `select` (with `[editOptions]`), or `checkbox`. `[validate]` returns a message to keep the editor open with an error.

The table never changes `rows`: update your data in `(cellEdit)`, which carries `{ rowId, row, column, value, previous }`:

```ts
import { Component, signal } from '@angular/core';
import type { DataTableCellEditDetail } from '@absoluteui/components/data-table';
import { AUI_DATA_TABLE } from '@absoluteui/angular/data-table';

interface Item {
  id: string;
  name: string;
  qty: number;
}

@Component({
  selector: 'app-stock',
  imports: [...AUI_DATA_TABLE],
  template: `
    <aui-data-table caption="Stock" [rows]="items()" [rowId]="byId" (cellEdit)="save($event)">
      <aui-column field="name" header="Item" />
      <aui-column field="qty" header="Quantity" type="number" editable [validate]="positive" />
    </aui-data-table>
  `,
})
export class StockComponent {
  readonly items = signal<Item[]>([{ id: 'a', name: 'Paper', qty: 12 }]);
  readonly byId = (item: Item): string => item.id;
  readonly positive = (value: unknown): string | null => (typeof value === 'number' && value >= 0 ? null : 'Enter 0 or more.');

  save(edit: DataTableCellEditDetail<Item>): void {
    const qty = edit.value;
    if (edit.column !== 'qty' || typeof qty !== 'number') return;
    this.items.update((list) => list.map((item) => (item.id === edit.rowId ? { ...item, qty } : item)));
  }
}
```

A custom editor is `<ng-template auiEditor let-value let-commit="commit" let-cancel="cancel">`. Editable cells are buttons in the tab order; Enter or leaving the cell commits, Escape cancels, and focus and the typed draft survive row updates.
