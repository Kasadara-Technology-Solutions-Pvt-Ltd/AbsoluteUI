---
title: Data grid
description: Build spreadsheet-class grids with the Data Grid - columns, filters, editing, grouping, server data, exports, formulas, and charts - and load only the parts you use.
---

[Data Grid](/docs/components/data-grid/) is the full-featured grid: millions of rows, pinned and grouped columns, filters, editing with undo, cell ranges, grouping and pivoting, tree data, master/detail, a server row model, exports to CSV, Excel, and PDF, formulas, and charts. It is keyboard and screen reader accessible (an ARIA grid), runs under a strict Content Security Policy, and has no third-party dependencies.

Choose the smallest component that fits:

| You need | Use |
|---|---|
| A sortable, paged table of a few hundred rows | [Data Table](/docs/components/data-table/) |
| Cross-tab totals of a dataset, nothing else | [Pivot Grid](/docs/components/pivot-grid/) |
| Large data, editing, ranges, grouping, server data, exports | Data Grid |

## Entry points

The grid is split so that pages ship only what they use. Each entry point has its own reference page.

| Import from | What it adds | Extra styles |
|---|---|---|
| `@absoluteui/components/data-grid` | The grid, CSV, print, `inferColumns`, `coerceCsvValues` | Data Grid |
| [`data-grid/editors`](/docs/components/data-grid-editors/) | Combobox and Multi Select cell editors | Combobox, Multi Select |
| [`data-grid/accessories`](/docs/components/data-grid-accessories/) | Menus, column chooser, side bar, status bar, toolbar, tooltips, find, notes | Menu, Context Menu, Dialog, Button, Tooltip |
| [`data-grid/export`](/docs/components/data-grid-export/) | Excel workbooks | none |
| [`data-grid/pdf`](/docs/components/data-grid-pdf/) | PDF documents | none |
| [`data-grid/formulas`](/docs/components/data-grid-formulas/) | Calculated columns, cell formulas, formula bar | none |
| [`data-grid/charts`](/docs/components/data-grid-charts/) | Sparkline columns, range and pivot charts | Sparkline, Bar Chart, Line Chart, Pie Chart |
| [`data-grid/schema`](/docs/components/data-grid-schema/) | The view state as a JSON Schema for tools | none |

## A first grid

Give the grid a label (its accessible name), your rows, a stable row id, and columns. The host needs a height: the grid fills it and scrolls inside (or set `layout: 'auto'` to grow with its rows).

```ts
import { DataGrid } from '@absoluteui/components/data-grid';

interface Employee {
  id: string;
  name: string;
  team: string;
  salary: number;
}

const host = document.querySelector<HTMLElement>('#employees');
if (host) {
  host.style.setProperty('block-size', '480px');
  DataGrid.create<Employee>(host, {
    label: 'Employees',
    rows: [
      { id: 'e1', name: 'Ada', team: 'Core', salary: 92000 },
      { id: 'e2', name: 'Ben', team: 'Docs', salary: 71000 },
    ],
    rowId: (r) => r.id,
    columns: [
      { id: 'name', header: 'Name', field: 'name', pinned: 'start', filter: 'text' },
      { id: 'team', header: 'Team', field: 'team', filter: 'set', groupable: true },
      { id: 'salary', header: 'Salary', field: 'salary', type: 'currency', currency: 'EUR', filter: 'number', aggregate: 'sum' },
    ],
  });
}
```

Rows are never mutated. Only the rows in view are rendered, so a million rows scroll as smoothly as a hundred.

## Columns

- `field` reads a property; `accessor(row)` computes a value. `type` (`text`, `number`, `currency`, `date`, `datetime`, `boolean`) decides alignment, sorting, filtering, editing, and export types; `format` changes only the displayed text.
- Widths: `width`, `minWidth`, `maxWidth`, or `flex` to share the free space. Users resize, move, pin, and hide columns; `getColumnsState()` and `getState()` read the result.
- Column groups: a column with `children` (optionally `collapsible`) draws a header over them.
- `render(value, row)` returns a node for custom cells. Return elements you build with DOM APIs; text values are never parsed as HTML.
- `inferColumns(rows)` generates columns from the rows' keys and value types, for data you do not know in advance.

## Sorting and filtering

Click a sortable header (or press Enter or Space on it) to sort; Shift adds a sort key. Filters come per column (`filter: 'text' | 'number' | 'bigint' | 'date' | 'boolean' | 'set'`), from a quick filter over all columns, from an advanced filter that combines conditions across columns, and from your own `externalFilter(row)`.

```ts
import { DataGrid } from '@absoluteui/components/data-grid';

interface Order {
  id: string;
  customer: string;
  total: number;
}

const host = document.querySelector<HTMLElement>('#orders');
if (host) {
  const grid = DataGrid.create<Order>(host, {
    label: 'Orders',
    rows: [{ id: 'o1', customer: 'Acme', total: 1200 }],
    rowId: (r) => r.id,
    floatingFilters: true,
    searchBox: true,
    columns: [
      { id: 'customer', header: 'Customer', field: 'customer', filter: 'text' },
      { id: 'total', header: 'Total', field: 'total', type: 'number', filter: 'number' },
    ],
  });
  grid.setFilter('total', { kind: 'number', conditions: [{ operator: 'greaterThan', value: 1000 }] });
  grid.setQuickFilter('acme');
}
```

Date filters can count calendar days, weekdays, or business days of a [business calendar](/docs/guides/business-calendars/) (`businessCalendar` on the column).

## Editing

Mark columns `editable`. Enter or F2 starts editing, Enter commits, Escape cancels; typing replaces the value. `required`, `validate(value, row)`, and `validateRow` show messages in the cell and keep invalid values out (`invalidEdit` decides whether to block or revert). Ctrl+Z and Ctrl+Y undo and redo, including paste and fill. `editMode: 'row'` edits a whole row at once; `startBatch()` and `commitBatch()` collect edits for one save.

Edits never change your rows. Listen for `aui-cells-change`, which lists every change with its old and new value, and save them:

```ts
import { DataGrid, type DataGridCellsChangeDetail } from '@absoluteui/components/data-grid';
import { comboboxEditor } from '@absoluteui/components/data-grid/editors';

interface Task {
  id: string;
  title: string;
  owner: string;
  hours: number;
}

const host = document.querySelector<HTMLElement>('#tasks');
if (host) {
  const grid = DataGrid.create<Task>(host, {
    label: 'Tasks',
    rows: [{ id: 't1', title: 'Write docs', owner: 'Ada', hours: 3 }],
    rowId: (r) => r.id,
    cellSelection: { fillHandle: true },
    columns: [
      { id: 'title', header: 'Title', field: 'title', editable: true, required: true },
      { id: 'owner', header: 'Owner', field: 'owner', editable: true, editor: comboboxEditor({ values: [{ value: 'Ada', label: 'Ada' }, { value: 'Ben', label: 'Ben' }] }) },
      { id: 'hours', header: 'Hours', field: 'hours', type: 'number', editable: true, validate: (v) => (typeof v === 'number' && v > 40 ? 'At most 40 hours' : null) },
    ],
  });
  grid.host.addEventListener('aui-cells-change', (event) => {
    const { changes } = (event as CustomEvent<DataGridCellsChangeDetail>).detail;
    console.log(`Save ${String(changes.length)} change(s)`);
  });
}
```

Validate again on the server: the grid's checks help users, they do not protect your data.

## Selection, ranges, and the clipboard

- `rowSelection: { mode: 'single' | 'multiple' }` adds a checkbox column; selection is kept by row id across sorting, filtering, and updates (`getSelected()`, `aui-selection-change`).
- `cellSelection: true` lets users select ranges with Shift+arrows or the pointer. Ctrl+C copies them as tab-separated text (with headers if `copyHeaders`), Ctrl+V pastes into editable cells, Ctrl+D and Ctrl+R fill down and right, and the fill handle extends a series.
- Pasted text is parsed per column type and validated like an edit; nothing pasted is parsed as HTML or run as a formula unless the column has `formulas: true`.

## Updating data

`setRows(rows)` replaces the data and keeps sort, filters, focus, and scroll. For streams, `applyTransaction({ add, update, remove })` changes only the rows that changed, and `applyTransactionAsync` batches many small updates into one render. `flashChanges` highlights changed cells briefly.

## Grouping, aggregation, tree data, master/detail, and pivoting

- `groupBy: ['region']` groups rows; columns with `aggregate` (`sum`, `average`, `min`, `max`, `count`, ...) show totals per group, with `groupTotals` and `grandTotal` rows. `groupPanel: true` lets users drag headers to group.
- `treeData` shows hierarchical rows (`getPath`, `parentIdField`, or `childrenField`); with `rowDragging: { managed: true }` users reparent rows by dragging or with Ctrl+Shift+arrows.
- `detail: { render(row) }` expands a row into a detail area, for example a nested grid.
- `pivot: { rows, columns, values }` turns the grid into a cross tab; `pivotPanel: true` lets users edit it.

The [live examples on the Data Grid page](/docs/components/data-grid/#examples) show each of these.

## Server data

For data that does not fit in the browser, pass a `datasource`. The grid asks for blocks of rows as they scroll into view and passes the sort and filters; your server applies them.

```ts
import { DataGrid, type DataGridRowsRequest } from '@absoluteui/components/data-grid';

interface Ticket {
  id: string;
  subject: string;
}

async function getRows(request: DataGridRowsRequest, signal: AbortSignal): Promise<{ rows: Ticket[]; rowCount: number }> {
  const response = await fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start: request.start, end: request.end, sort: request.sort, filters: request.filters }),
    signal,
  });
  if (!response.ok) throw new Error(`Tickets: HTTP ${String(response.status)}`);
  return (await response.json()) as { rows: Ticket[]; rowCount: number };
}

const host = document.querySelector<HTMLElement>('#tickets');
if (host) {
  DataGrid.create<Ticket>(host, {
    label: 'Tickets',
    rows: [],
    rowId: (r) => r.id,
    datasource: { getRows },
    blockSize: 100,
    columns: [
      { id: 'id', header: 'Ticket', field: 'id' },
      { id: 'subject', header: 'Subject', field: 'subject', flex: 1, filter: 'text' },
    ],
  });
}
```

- The grid aborts requests it no longer needs (pass `signal` on), loads at most `maxConcurrentLoads` blocks at a time, and keeps at most `maxBlocks` blocks.
- Failed blocks show an error row with Retry; they are never retried automatically.
- Treat the request as untrusted input on the server: check column ids against an allow list and use parameterized queries.
- Grouped and tree data work on the server too (`groupBy` with `groupKeys` in the request, `getChildCount`); see the [Server data guide](/docs/guides/server-data/) for the shared request patterns.

## Menus, panels, and other accessories

Accessories are optional parts passed in `accessories`:

```ts
import { DataGrid } from '@absoluteui/components/data-grid';
import { columnMenu, contextMenu, find, sideBar, statusBar, toolbar } from '@absoluteui/components/data-grid/accessories';

interface Product {
  id: string;
  name: string;
  stock: number;
}

const host = document.querySelector<HTMLElement>('#products');
if (host) {
  DataGrid.create<Product>(host, {
    label: 'Products',
    rows: [{ id: 'p1', name: 'Pen', stock: 40 }],
    rowId: (r) => r.id,
    cellSelection: true,
    accessories: [columnMenu(), contextMenu(), sideBar({ panels: ['columns', 'filters'] }), statusBar(), toolbar({ items: ['chooser', 'resetColumns'] }), find()],
    columns: [
      { id: 'name', header: 'Name', field: 'name', filter: 'text' },
      { id: 'stock', header: 'Stock', field: 'stock', type: 'number', filter: 'number' },
    ],
  });
}
```

Menus open with the right mouse button, Shift+F10, or the ContextMenu key. Entries you add are text and actions, never HTML.

## Exports and print

- CSV: `grid.toCsv()` or `grid.toCsvBlob()`; formula-like text is escaped so spreadsheets do not run it.
- Excel: `toXlsx(grid)` from `data-grid/export`, with typed values, styles, outlines, frozen panes, and optional sheet protection.
- PDF: `toPdf(grid)` from `data-grid/pdf`, with repeated headers and page numbers; embed fonts for scripts beyond Latin.
- Print: `grid.print()` prints a real table, with the header repeated on every page.

All exports follow the current view (sort, filters, visible columns, groups) by default, and nothing is uploaded. To save a Blob as a file, see [Files and downloads](/docs/guides/files-and-downloads/).

## Formulas and charts

`formulas: formulaEngine()` from `data-grid/formulas` enables calculated columns (`formula: '[Price] * [Quantity]'`) and cell formulas typed with `=` in columns with `formulas: true`. The engine is our own parser and evaluator: formulas cannot run code, and limits stop runaway formulas with an error value.

`sparklineColumn` from `data-grid/charts` draws a small chart in every row; `chartRange(grid)` charts the selected cells in a panel below the grid.

## Saving the view

`getState()` returns sort, columns, filters, grouping, expansion, paging, selection, pinned rows, and the pivot; `setState(state)` validates and restores it (invalid input throws and changes nothing). Store it per user, for example in local storage or your server. For tools such as AI assistants, `data-grid/schema` describes the state as a JSON Schema and applies proposals with validation.

## Accessibility

- The grid is an ARIA grid with one tab stop; arrow keys, Home, End, Page Up, and Page Down move between cells, and Enter or F2 interacts with a cell. The full key list is on the [component page](/docs/components/data-grid/#accessibility).
- Sorting, filtering, loading, errors, and validation are announced through live regions.
- Every pointer action has a keyboard path: column menus, Move row (Ctrl+Shift+arrows), Send to (drop zones), and the column chooser. File drop is the exception, so offer a file input too.
- Give every grid a `label` that says what the rows are.

## Performance

- Keep `rowId` cheap and stable; it keys selection, edits, and updates.
- Prefer `applyTransaction` over `setRows` for live updates, and `applyTransactionAsync` for many small updates.
- Avoid `autoRowHeight` and `spanRows` on very large data unless you need them: both measure or compare rows.
- Use the server row model when the data does not fit in memory or takes too long to download.
