RFC 4180 CSV in both directions: export tables that open safely in spreadsheets, and parse uploads, including large files as a stream. Reach for it for employee imports, payroll exports, and any "Download as CSV" button. To save the file, use `downloadCsv` from the services `download` module; the [Files and downloads guide](/docs/guides/files-and-downloads/) shows reading uploads in chunks.

### How do I export a table safely?

`stringifyCsv` quotes cells that need it and, by default, neutralises text a spreadsheet would run as a formula (`=`, `+`, `-`, `@`): a classic injection when user-entered names end up in an export. Numbers, booleans, and dates are never prefixed, so `-250` stays numeric. Use `columns` to choose, order, rename, and format fields.

```ts
import { stringifyCsv } from '@absoluteui/helpers/csv';

const rows = [
  { id: 'E-1001', name: 'Asha Rao', adjustment: -250, joined: new Date('2021-04-01T00:00:00Z') },
  { id: 'E-1002', name: '=HYPERLINK("http://evil.test","Click")', adjustment: 0, joined: new Date('2024-01-15T00:00:00Z') },
];
const csv = stringifyCsv(rows, {
  columns: [
    { key: 'id', header: 'Employee ID' },
    'name',
    { key: 'adjustment', header: 'Adjustment' },
    { key: 'joined', header: 'Joined', format: (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v) },
  ],
  eol: '\n',
});
csv.split('\n')[0]; // => 'Employee ID,name,Adjustment,Joined'
csv.split('\n')[1]; // => 'E-1001,Asha Rao,-250,2021-04-01'
csv.split('\n')[2]; // => `E-1002,"'=HYPERLINK(""http://evil.test"",""Click"")",0,2024-01-15`
```

Add `bom: true` when the file is opened by Excel on Windows, so non-ASCII names display correctly.

### How do I parse an uploaded file with a header row?

With `header: true`, rows are objects keyed by column name. Problems are collected in `errors` (with row and line numbers) instead of thrown, so you can show them next to the import. The delimiter is detected by default (`,`, `;`, tab, or `|`), which handles files saved with `;` by European spreadsheet settings.

```ts
import { parseCsv } from '@absoluteui/helpers/csv';

const text = 'Employee ID;Name;Dept\nE-1001;"Rao; Asha";Finance\nE-1002;Liam Chen\n';
const result = parseCsv(text, { header: true, skipEmptyLines: true, trim: true });
result.delimiter; // => ';'
result.rows[0]; // => { 'Employee ID': 'E-1001', Name: 'Rao; Asha', Dept: 'Finance' }
result.errors.map((e) => `${e.code} at row ${String(e.row)}`); // => ['HLP_CSV_FIELD_COUNT at row 3']
```

### How do I parse a large file without loading it all?

Feed text chunks to `createCsvParser`; each `push` returns the rows completed so far, and quotes or line breaks split across chunks are handled. Set `delimiter` when you know it: detection buffers the first 64 KiB (or 10 lines) before rows come out. Here a `Blob` stands in for the uploaded `File`.

```ts
import { createCsvParser } from '@absoluteui/helpers/csv';

const upload = new Blob(['id,name,salary\nE-1,Asha Rao,', '98000\nE-2,"Chen, ', 'Liam",91000\n']);
const parser = createCsvParser({ header: true, delimiter: ',', maxRows: 100_000 });
const reader = upload.stream().pipeThrough(new TextDecoderStream()).getReader();
let total = 0;
const names: string[] = [];
for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
  for (const row of parser.push(chunk.value)) {
    total += Number(row.salary);
    names.push(row.name ?? '');
  }
}
parser.end().length; // => 0
names; // => ['Asha Rao', 'Chen, Liam']
total; // => 189000
```

### How do I write one cell or check user input for formulas?

`escapeCsvCell` applies the same quoting and injection protection to a single value, for hand-built rows. `isFormulaLike` lets you warn at entry time instead of only at export.

```ts
import { escapeCsvCell, isFormulaLike } from '@absoluteui/helpers/csv';

escapeCsvCell('Rao, Asha'); // => '"Rao, Asha"'
escapeCsvCell('@SUM(A1:A9)'); // => "'@SUM(A1:A9)"
isFormulaLike('+44 20 7946 0000'); // => true // a phone number with + also triggers it
isFormulaLike('Asha'); // => false
```

### What goes wrong?

Malformed rows go to `errors`; hard limits throw a `LimitError` so a hostile file cannot exhaust memory. Set `maxRows`, `maxColumns`, and `maxFieldLength` for uploads. Header names such as `__proto__` are renamed to `column_N` and reported as `HLP_CSV_UNSAFE_HEADER`.

```ts
import { parseCsv } from '@absoluteui/helpers/csv';

parseCsv('a\n1\n2\n3', { maxRows: 2 }); // => throws HLP_CSV_TOO_MANY_ROWS
parseCsv('note\n' + 'x'.repeat(100), { maxFieldLength: 50 }); // => throws HLP_CSV_FIELD_TOO_LONG
parseCsv('name\n"unfinished', { header: true }).errors[0]?.code; // => 'HLP_CSV_UNCLOSED_QUOTE'
parseCsv('__proto__,name\n1,Asha', { header: true }).headers; // => ['column_1', 'name']
```
