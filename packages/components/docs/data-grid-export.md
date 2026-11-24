# Data Grid Excel export

> Package: `@absoluteui/components/data-grid/export` | No stylesheet | Since 0.8.0 | Status: R11

Excel workbooks (.xlsx) from a [Data Grid](data-grid.md), written in the browser with no dependencies and nothing uploaded:

- `toXlsx(grid, options?)`: a `Promise<Blob>` of a workbook with the grid's view (the same columns, rows, groups, and totals as `toCsv`).
- `xlsxSheet(grid, options?)`: the sheet as data, to combine several grids or add sheets of your own.
- `writeXlsx(workbook)`: writes any workbook of sheets (`XlsxWorkbook`), for example several `xlsxSheet` results.

CSV and print are grid methods (`toCsv`, `toCsvBlob`, `print`); PDF is in [`data-grid/pdf`](data-grid-pdf.md).

## Usage

```ts
import { DataGrid } from '@absoluteui/components/data-grid';
import { toXlsx } from '@absoluteui/components/data-grid/export';

interface Invoice {
  id: string;
  total: number;
}

const host = document.createElement('div');
host.style.setProperty('block-size', '200px');
document.body.append(host);
const grid = DataGrid.create<Invoice>(host, {
  label: 'Invoices',
  rows: [{ id: 'INV-1', total: 120 }],
  rowId: (r) => r.id,
  columns: [
    { id: 'id', header: 'Invoice', field: 'id' },
    { id: 'total', header: 'Total', field: 'total', type: 'currency', currency: 'EUR', excel: { style: 'money' } },
  ],
});
const blob = await toXlsx(grid, { styles: { money: { bold: true } }, autoFilter: true });
console.log(blob.type, blob.size);
```

## Behavior

- Values keep their types: numbers, booleans, dates as Excel dates in the grid's time zone, currency with a number format. Text is always written as text, so formula-like values cannot run; formulas come only from `excel.formula` code you write.
- Named styles (`styles`, a column's `excel.style` and `excel.cellStyle(value, row)`), number formats, merged column group headers, frozen header rows and start-pinned columns (`freeze`, default on), outline levels collapsed like the grid, AutoFilter, links (http, https, and mailto only), PNG and JPEG images, and several sheets.
- Sheet protection stores a SHA-512 hash of the password (never the password) and needs Web Crypto, so a secure context.
- Grid formulas (from `data-grid/formulas`) are exported as their values.

## Errors

- Invalid options throw a `TypeError` that names the property ("Invalid Excel export: ... must be ...").
- A protection password without Web Crypto throws an `Error`.
