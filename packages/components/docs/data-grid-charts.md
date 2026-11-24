# Data Grid charts

> Package: `@absoluteui/components/data-grid/charts` | Styles: Sparkline, Bar Chart, Line Chart, Pie Chart | Since 0.8.0 | Status: R11

Charts of [Data Grid](data-grid.md) data, drawn with the AbsoluteUI chart components:

- `sparklineColumn(options)`: spread into a column; each cell draws a named Sparkline of the row's values.
- `chartRange(grid, options?)`: a panel docked below the grid with a bar, stacked bar, line, area, or pie chart of the selected cells.
- `chartPivot(grid, options?)`: the same panel for pivot results.

## Usage

```ts
import { DataGrid } from '@absoluteui/components/data-grid';
import { chartRange, sparklineColumn } from '@absoluteui/components/data-grid/charts';

interface Region {
  id: string;
  name: string;
  q1: number;
  q2: number;
}

const host = document.createElement('div');
host.style.setProperty('block-size', '200px');
document.body.append(host);
const grid = DataGrid.create<Region>(host, {
  label: 'Sales',
  rows: [{ id: 'n', name: 'North', q1: 120, q2: 150 }, { id: 's', name: 'South', q1: 90, q2: 80 }],
  rowId: (r) => r.id,
  cellSelection: true,
  columns: [
    { id: 'name', header: 'Region', field: 'name' },
    { id: 'q1', header: 'Q1', field: 'q1', type: 'number' },
    { id: 'q2', header: 'Q2', field: 'q2', type: 'number' },
    { id: 'trend', header: 'Trend', ...sparklineColumn<Region>({ values: (r) => [r.q1, r.q2], label: (r) => `${r.name} by quarter` }) },
  ],
});
grid.addCellRange({ startRow: 'n', endRow: 's', startColumn: 'name', endColumn: 'q2' });
const panel = chartRange(grid, { type: 'line', title: 'Sales' });
console.log(panel.element.isConnected);
```

## Behavior

- Sparkline cells copy and export their numbers as text; sorting compares the last value, or `sortBy: 'sum' | 'min' | 'max'`.
- The chart panel is a region named "Chart of {title}"; Escape or Close closes it and focus returns to the grid. It follows edits, sorting, and filtering, and each chart has its own data table.
- Series run by column or by row (`seriesBy`); text columns label the categories.
- To offer charts in the cell menu, add an item to `contextMenu({ items })` that calls `chartRange(grid)`.
