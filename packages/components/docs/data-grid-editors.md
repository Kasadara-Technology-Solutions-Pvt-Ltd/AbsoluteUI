# Data Grid list editors

> Package: `@absoluteui/components/data-grid/editors` | Styles: Combobox, Multi Select | Since 0.8.0 | Status: R11

List editors for [Data Grid](data-grid.md) columns, in a separate entry point so the grid itself does not include Combobox and Multi Select:

- `comboboxEditor({ values | loadValues, loadDelay, placeholder })` edits one value with typeahead filtering, or with values loaded per query (`loadValues(query, context, signal)`; newer queries abort older ones, loading and errors are announced).
- `multiSelectEditor({ ..., maxSelected, selectAll })` edits an array of values with chips.

Pass the result as a column's `editor` (the column must be `editable`). Load the Combobox and Multi Select stylesheets with the grid's.

## Usage

```ts
import { DataGrid } from '@absoluteui/components/data-grid';
import { comboboxEditor, multiSelectEditor } from '@absoluteui/components/data-grid/editors';

interface Task {
  id: string;
  owner: string;
  tags: string[];
}

const host = document.createElement('div');
host.style.setProperty('block-size', '240px');
document.body.append(host);
DataGrid.create<Task>(host, {
  label: 'Tasks',
  rows: [{ id: '1', owner: 'Ada', tags: ['ui'] }],
  rowId: (r) => r.id,
  columns: [
    { id: 'owner', header: 'Owner', field: 'owner', editable: true, editor: comboboxEditor({ values: [{ value: 'Ada', label: 'Ada' }, { value: 'Grace', label: 'Grace' }] }) },
    { id: 'tags', header: 'Tags', field: 'tags', editable: true, editor: multiSelectEditor({ values: [{ value: 'ui', label: 'UI' }, { value: 'api', label: 'API' }] }), format: (v) => (Array.isArray(v) ? v.join(', ') : '') },
  ],
});
```

## Behavior

- Choice values are strings, numbers, or booleans; `values` can be a function of the row (dependent lists).
- The component's label is the editor's name ("{column}, {row}"), visually hidden in the cell.
- Inside the list, Enter chooses an option and Escape closes the list; with the list closed, Enter commits and Escape cancels.
- Committed values go through the column's validation, undo, and change events like any other edit.
