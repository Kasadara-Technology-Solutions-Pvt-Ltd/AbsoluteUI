# Data Grid state schema

> Package: `@absoluteui/components/data-grid/schema` | No stylesheet | Since 0.8.0 | Status: R11

Describes a [Data Grid](data-grid.md)'s view state for tools, such as an AI assistant that changes the view on request:

- `dataGridStateSchema(grid)`: a JSON Schema (draft 2020-12) of the state `setState` accepts, with this grid's column ids, filter kinds, groupable columns, and pivot aggregates.
- `describeState(grid)`: a short English summary of the current view.
- `applyState(grid, state)`: validates and applies a proposed state; returns `{ ok: true }` or `{ ok: false, error }` so the tool can correct its proposal.

## Usage

```ts
import { DataGrid } from '@absoluteui/components/data-grid';
import { applyState, dataGridStateSchema, describeState } from '@absoluteui/components/data-grid/schema';

interface Person {
  id: string;
  name: string;
  age: number;
}

const host = document.createElement('div');
host.style.setProperty('block-size', '200px');
document.body.append(host);
const grid = DataGrid.create<Person>(host, {
  label: 'People',
  rows: [{ id: '1', name: 'Ada', age: 36 }],
  rowId: (r) => r.id,
  columns: [
    { id: 'name', header: 'Name', field: 'name' },
    { id: 'age', header: 'Age', field: 'age', type: 'number' },
  ],
});
console.log(dataGridStateSchema(grid), describeState(grid));
const result = applyState(grid, { sort: [{ column: 'age', direction: 'descending' }] });
if (!result.ok) console.log(result.error);
```

## Behavior

- Only view state: sort, columns, paging, filters, quick and advanced filters, grouping, and the pivot. No row data, no edits, no row ids: the schema and summary are safe to send to a service that should not see the data.
- Treat the tool's proposal as untrusted input: `applyState` validates it like `setState` and changes nothing when it is invalid.
