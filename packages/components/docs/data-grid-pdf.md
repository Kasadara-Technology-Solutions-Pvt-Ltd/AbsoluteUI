# Data Grid PDF export

> Package: `@absoluteui/components/data-grid/pdf` | No stylesheet | Since 0.8.0 | Status: R11

`toPdf(grid, options?)` writes a [Data Grid](data-grid.md)'s view as a PDF document (`Promise<Blob>`), with our own PDF writer: no dependencies, nothing uploaded. For paper, the grid's own `print()` prints a real table without a file.

## Usage

```ts
import { DataGrid } from '@absoluteui/components/data-grid';
import { toPdf } from '@absoluteui/components/data-grid/pdf';

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
    { id: 'total', header: 'Total', field: 'total', type: 'number' },
  ],
});
const blob = await toPdf(grid, { title: 'Invoices', pageSize: 'a4', orientation: 'landscape' });
console.log(blob.type, blob.size);
```

## Behavior

- Pages carry the title, the column group and header rows repeated on every page, bold group and total rows, end-aligned numbers, and "Page n of N".
- A4 or Letter (`pageSize`), landscape by default (`orientation`), with `margin`, `fontSize`, and `pageLabel` ("Page {page} of {pages}"); the grid's column widths are scaled down to fit the page.
- Latin text uses the standard PDF fonts. Other scripts need `fonts: { regular, bold }` (TrueType or OpenType bytes): the fonts are embedded with a ToUnicode map so text can be searched and copied, and fonts whose license forbids embedding are refused. `parseFont` reads a font's tables.
- Right-to-left grids mirror the columns. `visualOrder(text, rtl)` is the simplified bidirectional ordering used for right-to-left text (not the full Unicode algorithm; no Arabic shaping).
- The document properties carry the title (shown as the window title) and the grid's language.

## Errors

- Invalid options throw a `TypeError` that names the property ("Invalid PDF export: ... must be ...").
- A font that cannot be read or may not be embedded throws "Invalid PDF font: ...".
