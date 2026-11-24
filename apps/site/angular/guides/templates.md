---
title: Templates and content
description: Render Angular templates inside components (cells, items, options, headers, editors) and project content into cards, alerts, and overlays.
---

## Templates

`@absoluteui/angular/templates` renders your `<ng-template>`s into the render slots of components. Each rendered template is a live embedded view: bindings, child components, dependency injection, and change detection work as usual. The view is destroyed when the component drops its node (a row re-renders, a group collapses, a row scrolls out of the virtual window, or the component is destroyed).

| Directive | Where | Context |
|---|---|---|
| `<ng-template auiCell="columnId" let-row>` | Data Table cells | `$implicit` / `row`, `column` |
| `<ng-template auiRowDetail let-row>` | Data Table expandable rows | `$implicit` / `row` |
| `<ng-template auiHeader="columnId" let-header="header">` | Data Table column headers (decorative; the header text stays the name) | `$implicit` / `header`, `column` |
| `<ng-template auiGroupHeader let-group>` | Data Table group headers (decorative; the toggle keeps its text) | `$implicit` / `group` |
| `<ng-template auiEditor let-value let-commit="commit" let-cancel="cancel">` | Data Table inline editors | value, `commit`, `cancel`, row |
| `<ng-template auiEmpty>` | Data Table empty state | none |
| `<ng-template auiItem let-item>` | Select, Combobox, and Multi Select options; Menu, Context Menu, and Menu Bar items; Kanban cards; Org Chart nodes; Scheduler events | `$implicit` / `item`, `context` |
| `<ng-template auiSelectedItem let-option>` | Select value | `$implicit` / `item` |

Option, item, and header templates are decorative: the label stays the accessible name, the typeahead text, and the announced value.

```ts
import { Component } from '@angular/core';
import type { DataTableColumn } from '@absoluteui/components/data-table';
import { AuiDataTable } from '@absoluteui/angular/data-table';
import { AuiCell } from '@absoluteui/angular/templates';

interface Person {
  id: string;
  name: string;
  email: string;
}

@Component({
  selector: 'app-people',
  imports: [AuiDataTable, AuiCell],
  template: `
    <aui-data-table caption="People" [columns]="columns" [rows]="people" [rowId]="byId">
      <ng-template auiCell="name" [auiCellOf]="people" let-person>
        <strong>{{ person.name }}</strong> ({{ person.email }})
      </ng-template>
    </aui-data-table>
  `,
})
export class PeopleComponent {
  readonly people: Person[] = [{ id: '1', name: 'Ada Lovelace', email: 'ada@example.com' }];
  readonly columns: DataTableColumn<Person>[] = [{ id: 'name', header: 'Name', accessor: (p) => p.name }];
  readonly byId = (p: Person): string => p.id;
}
```

### Typed context

Under `strictTemplates`, bind the same array you give the component to the optional `...Of` input (`[auiCellOf]`, `[auiItemOf]`, `[auiRowDetailOf]`, `[auiGroupHeaderOf]`, `[auiEditorOf]`) and `let-` variables get its element type. The input only types the template.

## Projected content

| Component | Projected parts |
|---|---|
| `<aui-card>` | `<aui-card-content>`, `<aui-card-footer>`, `<aui-card-media>` (import `AUI_CARD` for the card and its parts) |
| `<aui-alert>` | the default content is the message when `message` is not bound |
| `<aui-dialog>`, `<aui-drawer>`, `<aui-bottom-sheet>`, `<aui-session-warning-dialog>` | the default content is the body |
| `<aui-form-field>`, `<aui-dashboard-grid>`, `<aui-dashboard-widget>` | the default content |

Projected parts stay managed by Angular; the component only places them.

```html
<aui-alert tone="success">Saved. <a routerLink="/reports">View the report</a></aui-alert>
```
