# Data Grid formulas

> Package: `@absoluteui/components/data-grid/formulas` | No stylesheet (the grid's) | Since 0.8.0 | Status: R11

Spreadsheet formulas for the [Data Grid](data-grid.md): our own parser and evaluator (never `eval`), in a separate entry point so grids without formulas do not ship them.

- `formulaEngine({ functions, calendar })`: pass it as the grid's `formulas` option.
- `formulaBar()`: an accessory that shows the focused cell's address and formula.
- `FormulaBook`, `parseFormula`, `evaluateFormula`, and the helpers around them work without a grid, for your own sheets and validation.

## Usage

```ts
import { DataGrid } from '@absoluteui/components/data-grid';
import { formulaBar, formulaEngine } from '@absoluteui/components/data-grid/formulas';

interface Item {
  id: string;
  price: number;
  qty: number;
  note: string | number | null;
}

const host = document.createElement('div');
host.style.setProperty('block-size', '240px');
document.body.append(host);
DataGrid.create<Item>(host, {
  label: 'Quote',
  rows: [{ id: '1', price: 2, qty: 10, note: '=A1 * 2' }],
  rowId: (r) => r.id,
  formulas: formulaEngine(),
  accessories: [formulaBar()],
  columns: [
    { id: 'price', header: 'Price', field: 'price', type: 'number', editable: true },
    { id: 'qty', header: 'Quantity', field: 'qty', type: 'number', editable: true },
    { id: 'note', header: 'Note', field: 'note', editable: true, formulas: true },
    { id: 'total', header: 'Total', type: 'number', formula: '[Price] * [Quantity]' },
  ],
});
```

## Behavior

- Calculated columns: `formula: '[Price] * [Quantity]'`. `[Column]` (column id or header, without case) is the same row's value, or the whole column inside functions (`SUM([Total])`); `[@Column]` is always the same row. Results are read-only and sort, filter, group, aggregate, and export as values.
- Cell formulas: columns with `formulas: true` evaluate values that are text starting with `=`, stored in your row data. A1 references use stable addresses: letters by column definition order, numbers by source row order.
- The editor shows the formula with function and column suggestions, the signature of the function around the caret, and syntax problems; a click on another cell inserts its address. Invalid formulas are refused with the position of the problem. Fill, Ctrl+D / Ctrl+R, and pasting cells copied in the grid move relative references (`$` parts stay).
- Functions: math and aggregates, conditional aggregates (SUMIF, SUMIFS, COUNTIF, COUNTIFS, AVERAGEIF), logic, text, dates (NETWORKDAYS and WORKDAY on the engine's business calendar; TODAY in the grid time zone), and lookups (XLOOKUP, INDEX, MATCH, VLOOKUP). `BUILTIN_FUNCTIONS` and `FUNCTION_SIGNATURES` list them; add your own with `functions`.
- Errors show their code and read their meaning ("#DIV/0!, division by zero"); cycles give `#CIRCULAR!`.
- Limits give errors, never hangs: 8192 characters per formula, 64 nesting levels, 1,000,000 cells per range, 1,000,000 evaluation steps.

## Errors

- `parseFormula` throws `FormulaSyntaxError` with a message and the character `position` of the problem.
- Evaluation never throws: problems are formula error values (`ERROR_CODES`: `#DIV/0!`, `#VALUE!`, `#REF!`, `#NAME?`, `#N/A`, `#NUM!`, `#NULL!`, `#CIRCULAR!`, `#LIMIT!`).
