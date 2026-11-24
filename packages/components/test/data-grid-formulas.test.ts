import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { plainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import type { DataGrid, DataGridOptions } from '@absoluteui/components/data-grid';
import { BUILTIN_FUNCTIONS, FormulaBook, FormulaSyntaxError, formulaError, parseFormula, shiftFormula, type FormulaSource, type Scalar } from '@absoluteui/components/data-grid/formulas';

// docs/PLAN-R11-G9.md (G9a): the formula engine.

/** A small sheet: cells as values or "=..." formulas; columns named by their header row. */
function sheet(grid: Scalar[][], names: readonly string[] = []): { book: FormulaBook; set: (r: number, c: number, v: Scalar) => void } {
  const formula = (v: Scalar): string | null => (typeof v === 'string' && v.startsWith('=') ? v : null);
  const source: FormulaSource = {
    get rowCount() {
      return grid.length;
    },
    columnCount: Math.max(8, names.length),
    column: (name) => names.findIndex((n) => n.toLowerCase() === name.toLowerCase()),
    formula: (r, c) => formula(grid[r]?.[c] ?? null),
    value: (r, c) => grid[r]?.[c] ?? null,
    formulaRows: function* (c, top, bottom) {
      for (let r = top; r <= bottom; r++) if (formula(grid[r]?.[c] ?? null) !== null) yield r;
    },
  };
  const book = new FormulaBook({ source, functions: BUILTIN_FUNCTIONS, today: () => plainDate(2026, 10, 16) });
  return {
    book,
    set: (r, c, v) => {
      const row = grid[r] ?? [];
      row[c] = v;
      grid[r] = row;
      book.invalidate(r, c);
    },
  };
}

/** Evaluate one formula over an optional grid (the formula sits in column H of the first row, outside the data). */
function calc(formula: string, grid: Scalar[][] = [], names: readonly string[] = []): Scalar {
  const rows = grid.length > 0 ? grid.map((r) => [...r]) : [[]];
  const first = rows[0] ?? [];
  first[7] = formula;
  return sheet(rows, names).book.value(0, 7);
}

describe('formula parser (G9a)', () => {
  it('parses precedence, references, ranges, structured references, and reports positions', () => {
    expect(calc('=1+2*3^2')).toBe(19);
    expect(calc('=2^3^2')).toBe(64);
    expect(calc('=-2^2')).toBe(4);
    expect(calc('=50%*10')).toBe(5);
    expect(calc('="a"&1&TRUE')).toBe('a1TRUE');
    expect(calc('=1<2')).toBe(true);
    expect(calc('="B"="b"')).toBe(true);
    expect(parseFormula('=SUM($A$1:B2, [Price], [@Qty])')).toMatchObject({ kind: 'call', name: 'SUM', args: [{ kind: 'range' }, { kind: 'column', name: 'Price', thisRow: false }, { kind: 'column', name: 'Qty', thisRow: true }] });
    expect(() => parseFormula('=1+')).toThrow(FormulaSyntaxError);
    try {
      parseFormula('=1 + @');
    } catch (e) {
      expect((e as FormulaSyntaxError).position).toBe(4);
    }
    expect(() => parseFormula('="open')).toThrow(/quote/);
    expect(() => parseFormula(`=${'('.repeat(70)}1${')'.repeat(70)}`)).toThrow(/Nesting/);
    expect(calc('=NOPE(1)')).toEqual(formulaError('#NAME?'));
  });

  it('shiftFormula moves relative references for fill and paste; anchors stay; out of the sheet is #REF!', () => {
    expect(shiftFormula('=A1+$B$2+C$3+$D4+"A1"', 2, 1)).toBe('=B3+$B$2+D$3+$D6+"A1"');
    expect(shiftFormula('=SUM(A1:A3)', -1, 0)).toBe('=SUM(#REF!:A2)');
    expect(shiftFormula('=[Price]*2', 5, 5)).toBe('=[Price]*2');
  });
});

describe('formula evaluation (G9a)', () => {
  it('coerces like a spreadsheet and returns error values instead of throwing', () => {
    expect(calc('=1/0')).toEqual(formulaError('#DIV/0!'));
    expect(calc('="x"+1')).toEqual(formulaError('#VALUE!'));
    expect(calc('="2"+3')).toBe(5);
    expect(calc('=TRUE+1')).toBe(2);
    expect(calc('=A1+1', [[null]])).toBe(1);
    expect(calc('=0.1+0.2')).toBe(0.30000000000000004);
    expect(calc('=0.1+0.2&""')).toBe('0.3');
    expect(calc('=Z1', [[1]])).toEqual(formulaError('#REF!'));
    expect(calc('=IFERROR(1/0, "none")')).toBe('none');
    expect(calc('=IF(TRUE, 1, 1/0)')).toBe(1);
  });

  it('aggregates and conditional aggregates over ranges and columns', () => {
    const data: Scalar[][] = [
      ['East', 10, 'a'],
      ['East', 5, 'b'],
      ['West', 7, ''],
      ['North', null, 'c'],
    ];
    const names = ['Region', 'Amount', 'Code'];
    expect(calc('=SUM(B1:B4)', data, names)).toBe(22);
    expect(calc('=SUM([Amount])', data, names)).toBe(22);
    expect(calc('=AVERAGE(B1:B4)', data, names)).toBeCloseTo(22 / 3);
    expect(calc('=COUNT(B1:B4)', data, names)).toBe(3);
    expect(calc('=COUNTA(C1:C4)', data, names)).toBe(3);
    expect(calc('=COUNTBLANK(B1:B4)', data, names)).toBe(1);
    expect(calc('=SUMIF(A1:A4, "East", B1:B4)', data, names)).toBe(15);
    expect(calc('=SUMIFS([Amount], [Region], "<>East", [Amount], ">5")', data, names)).toBe(7);
    expect(calc('=COUNTIF(A1:A4, "*st")', data, names)).toBe(3);
    expect(calc('=AVERAGEIF(B1:B4, ">=7")', data, names)).toBe(8.5);
    expect(calc('=MAX(B1:B4)-MIN(B1:B4)', data, names)).toBe(5);
    expect(calc('=ROUND(2.675, 2)')).toBe(2.68);
    expect(calc('=ROUNDUP(-1.21, 1)')).toBe(-1.3);
    expect(calc('=ROUNDDOWN(1.29, 1)')).toBe(1.2);
    expect(calc('=MOD(-7, 3)')).toBe(2);
  });

  it('text, logic, and lookups', () => {
    const data: Scalar[][] = [
      ['apple', 3],
      ['banana', 5],
      ['cherry', 7],
    ];
    expect(calc('=UPPER(LEFT("hello", 3))&LEN("abc")')).toBe('HEL3');
    expect(calc('=MID("abcdef", 2, 3)')).toBe('bcd');
    expect(calc('=SUBSTITUTE("a-b-c", "-", "+", 2)')).toBe('a-b+c');
    expect(calc('=TEXTJOIN(", ", TRUE, "a", "", "b")')).toBe('a, b');
    expect(calc('=PROPER("hello wORLD")')).toBe('Hello World');
    expect(calc('=SEARCH("an", "Banana")')).toBe(2);
    expect(calc('=FIND("x", "abc")')).toEqual(formulaError('#VALUE!'));
    expect(calc('=TEXT(1234.5, "#,##0.00")')).toBe('1,234.50');
    expect(calc('=TEXT(0.256, "0.0%")')).toBe('25.6%');
    expect(calc('=AND(TRUE, 1)') && calc('=OR(FALSE, 0)')).toBe(false);
    expect(calc('=SWITCH(2, 1, "one", 2, "two", "many")')).toBe('two');
    expect(calc('=IFS(1>2, "a", TRUE, "b")')).toBe('b');
    expect(calc('=CHOOSE(2, "x", "y")')).toBe('y');
    expect(calc('=XLOOKUP("banana", A1:A3, B1:B3)', data)).toBe(5);
    expect(calc('=XLOOKUP("kiwi", A1:A3, B1:B3, "none")', data)).toBe('none');
    expect(calc('=XLOOKUP("b*", A1:A3, B1:B3, , 2)', data)).toBe(5);
    expect(calc('=INDEX(B1:B3, MATCH("cherry", A1:A3, 0))', data)).toBe(7);
    expect(calc('=VLOOKUP("banana", A1:B3, 2, FALSE)', data)).toBe(5);
    expect(calc('=VLOOKUP(6, B1:B3, 1)', data)).toBe(5);
    expect(calc('=MATCH(6, B1:B3)', data)).toBe(2);
  });

  it('dates: arithmetic, parts, months, and business days (default Monday to Friday, or a business calendar)', () => {
    expect(calc('=DATE(2026, 13, 1)')).toEqual(plainDate(2027, 1, 1));
    expect(calc('=DATE(2026, 3, 1)-1')).toEqual(plainDate(2026, 2, 28));
    expect(calc('=DATE(2026, 3, 1)-DATE(2026, 2, 1)')).toBe(28);
    expect(calc('=TODAY()')).toEqual(plainDate(2026, 10, 16));
    expect(calc('=YEAR("2026-05-04")*100+MONTH(TODAY())')).toBe(202610);
    expect(calc('=EOMONTH(DATE(2026, 1, 31), 1)')).toEqual(plainDate(2026, 2, 28));
    expect(calc('=EDATE(DATE(2026, 1, 31), 1)')).toEqual(plainDate(2026, 2, 28));
    expect(calc('=WEEKDAY(DATE(2026, 10, 16))')).toBe(6);
    expect(calc('=NETWORKDAYS(DATE(2026, 10, 12), DATE(2026, 10, 18))')).toBe(5);
    expect(calc('=WORKDAY(DATE(2026, 10, 16), 1)')).toEqual(plainDate(2026, 10, 19));
    expect(calc('=NETWORKDAYS(DATE(2026, 10, 12), DATE(2026, 10, 18), A1)', [[plainDate(2026, 10, 14)]])).toBe(4);
    // A Sunday-to-Thursday week: Friday 16 and Saturday 17 October are not working days.
    const calendar = createBusinessCalendar({ workingDays: [7, 1, 2, 3, 4] });
    expect(calc('=NETWORKDAYS(DATE(2026, 10, 16), DATE(2026, 10, 17))')).toBe(1);
    const rows: Scalar[][] = [['=NETWORKDAYS(DATE(2026, 10, 16), DATE(2026, 10, 17))']];
    const formula = (v: Scalar): string | null => (typeof v === 'string' && v.startsWith('=') ? v : null);
    const book = new FormulaBook({
      source: { rowCount: 1, columnCount: 1, column: () => -1, formula: (r, c) => formula(rows[r]?.[c] ?? null), value: () => null, formulaRows: () => [] },
      functions: BUILTIN_FUNCTIONS,
      today: () => plainDate(2026, 10, 16),
      calendar,
    });
    expect(book.value(0, 0)).toBe(0);
  });
});

describe('formula book (G9a)', () => {
  it('computes dependencies in order, recalculates only what depends on a change, and finds cycles', () => {
    const s = sheet([
      [1, '=A1*2', '=B1+A2'],
      [10, '=SUM(A1:A2)', '=C1'],
    ]);
    expect(s.book.value(0, 2)).toBe(12);
    expect(s.book.value(1, 1)).toBe(11);
    s.set(0, 0, 5);
    expect(s.book.value(0, 2)).toBe(20);
    expect(s.book.value(1, 1)).toBe(15);
    expect(s.book.value(1, 2)).toBe(20);
    s.set(0, 0, '=C2');
    expect(s.book.value(0, 0)).toEqual(formulaError('#CIRCULAR!'));
    expect(s.book.value(1, 2)).toEqual(formulaError('#CIRCULAR!'));
    s.set(0, 0, 1);
    expect(s.book.value(1, 2)).toBe(12);
  });

  it('long dependency chains do not overflow the stack; syntax errors show #NAME?', () => {
    const rows: Scalar[][] = [[1]];
    for (let i = 1; i < 20_000; i++) rows.push([`=A${String(i)}+1`]);
    const s = sheet(rows);
    expect(s.book.value(19_999, 0)).toBe(20_000);
    expect(sheet([['=1+']]).book.value(0, 0)).toEqual(formulaError('#NAME?'));
  });
});

describe('calculated columns (G9b)', () => {
  interface P {
    id: string;
    name: string;
    price: number;
    qty: number;
  }
  const items: P[] = [
    { id: '1', name: 'Pen', price: 2, qty: 10 },
    { id: '2', name: 'Ink', price: 7.5, qty: 0 },
    { id: '3', name: 'Pad', price: 4, qty: 3 },
  ];
  async function mount(options: Partial<DataGridOptions<P>> = {}): Promise<DataGrid<P>> {
    const { DataGrid } = await import('@absoluteui/components/data-grid');
    const { formulaEngine } = await import('@absoluteui/components/data-grid/formulas');
    const host = document.createElement('div');
    document.body.append(host);
    return DataGrid.create<P>(host, {
      label: 'Items',
      locale: 'en-US',
      rows: items,
      rowId: (r) => r.id,
      formulas: formulaEngine({ functions: { DOUBLE: (args, ctx) => Number(ctx.scalar(args[0] ?? null)) * 2 } }),
      columns: [
        { id: 'name', header: 'Name', field: 'name' },
        { id: 'price', header: 'Price', field: 'price', type: 'number' },
        { id: 'qty', header: 'Quantity', field: 'qty', type: 'number' },
        { id: 'total', header: 'Total', type: 'number', formula: '[Price] * [Quantity]' },
        { id: 'share', header: 'Share', type: 'number', formula: '=ROUND([total] / SUM([Total]), 3)' },
        { id: 'unit', header: 'Per unit', type: 'number', formula: '[Price] / [qty]' },
        { id: 'double', header: 'Double', type: 'number', formula: 'DOUBLE([Price])' },
      ],
      ...options,
    });
  }
  /** The displayed text of a cell (through the export data: columns past the test viewport are not rendered). */
  const text = (g: DataGrid<P>, id: string, column: string): string => g.getExportData({ columns: [column], rows: 'all' }).rows.find((r) => r.id === id)?.cells[0]?.text ?? '';

  it('computes per row and across rows, shows errors as codes, sorts, recalculates on updates, and exports results', async () => {
    const g = await mount();
    expect(text(g, '1', 'total')).toBe('20');
    expect(text(g, '1', 'share')).toBe('0.625');
    expect(text(g, '2', 'unit')).toBe('#DIV/0!');
    expect(text(g, '3', 'double')).toBe('8');
    g.update({ sort: [{ column: 'total', direction: 'descending' }] });
    expect(g.toCsv({ columns: ['name', 'total'], header: false }).split('\r\n')).toEqual(['Pen,20', 'Pad,12', 'Ink,0']);
    g.applyTransaction({ update: [{ id: '2', name: 'Ink', price: 7.5, qty: 4 }] });
    expect(text(g, '2', 'total')).toBe('30');
    expect(text(g, '1', 'share')).toBe('0.323');
    expect(g.toCsv({ columns: ['name', 'unit'], header: false, values: 'raw' }).split('\r\n')).toContain('Ink,1.875');
    expect(g.getExportData({ columns: ['total'] }).rows.map((r) => r.cells[0]?.value)).toEqual([30, 20, 12]);
  });

  it('calculated columns are read-only; a formula column needs the engine; bad functions are refused', async () => {
    const g = await mount({ columns: [{ id: 'name', header: 'Name', field: 'name', editable: true }, { id: 'calc', header: 'Calc', formula: 'UPPER([name])', editable: true }] });
    expect(text(g, '1', 'calc')).toBe('PEN');
    g.host.querySelector<HTMLElement>('[data-row-id="1"] [data-column="calc"]')!.focus();
    g.host.querySelector<HTMLElement>('[data-row-id="1"] [data-column="calc"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    expect(g.editingCell).toBeNull();
    const { DataGrid } = await import('@absoluteui/components/data-grid');
    const { formulaEngine } = await import('@absoluteui/components/data-grid/formulas');
    expect(() => DataGrid.create<P>(document.body.appendChild(document.createElement('div')), { label: 'x', rows: items, rowId: (r) => r.id, columns: [{ id: 'c', header: 'C', formula: '1' }] })).toThrow(/formulas/);
    expect(() => formulaEngine({ functions: { SUM: () => 1 } })).toThrow(/SUM/);
    expect(() => formulaEngine({ functions: { 'bad name': () => 1 } })).toThrow();
  });
});

describe('cell formulas (G9c)', () => {
  interface C {
    id: string;
    name: string;
    v: number;
    calc: unknown;
  }
  async function mount(rows: C[], changes: unknown[] = []): Promise<DataGrid<C>> {
    const { DataGrid } = await import('@absoluteui/components/data-grid');
    const { formulaEngine } = await import('@absoluteui/components/data-grid/formulas');
    const host = document.createElement('div');
    document.body.append(host);
    const g = DataGrid.create<C>(host, {
      label: 'Cells',
      locale: 'en-US',
      rows,
      rowId: (r) => r.id,
      cellSelection: true,
      formulas: formulaEngine(),
      columns: [
        { id: 'name', header: 'Name', field: 'name' },
        { id: 'v', header: 'V', field: 'v', type: 'number', editable: true },
        { id: 'calc', header: 'Calc', field: 'calc', type: 'number', editable: true, formulas: true },
      ],
    });
    g.host.addEventListener('aui-rows-change', () => changes.push(1));
    return g;
  }
  const shown = (g: DataGrid<C>, id: string): string => g.getExportData({ columns: ['calc'], rows: 'all' }).rows.find((r) => r.id === id)?.cells[0]?.text ?? '';
  const cell = (g: DataGrid<C>, id: string, column = 'calc'): HTMLElement => g.host.querySelector<HTMLElement>(`[data-row-id="${id}"] [data-column="${column}"]`)!;
  const rows = (): C[] => [
    { id: 'a', name: 'A', v: 2, calc: '=B1*10' },
    { id: 'b', name: 'B', v: 3, calc: 7 },
    { id: 'c', name: 'C', v: 4, calc: null },
  ];

  it('evaluates formula values, edits show the formula, invalid formulas are refused with their position', async () => {
    const g = await mount(rows());
    expect(shown(g, 'a')).toBe('20');
    expect(shown(g, 'b')).toBe('7');
    cell(g, 'a').focus();
    await userEvent.keyboard('{F2}');
    const input = g.host.querySelector<HTMLInputElement>('.aui-data-grid__editor input')!;
    expect(input.value).toBe('=B1*10');
    await userEvent.clear(input);
    await userEvent.type(input, '=1+');
    await userEvent.keyboard('{Enter}');
    expect(g.editingCell).not.toBeNull();
    expect(g.host.querySelector('.aui-data-grid__edit-error')?.textContent).toMatch(/Invalid formula: .*\(at 3\)/);
    await userEvent.clear(input);
    await userEvent.type(input, '=SUM(B1:B3)');
    await userEvent.keyboard('{Enter}');
    expect(shown(g, 'a')).toBe('9');
    cell(g, 'b').focus();
    await userEvent.keyboard('{F2}');
    const second = g.host.querySelector<HTMLInputElement>('.aui-data-grid__editor input')!;
    expect(second.value).toBe('7');
    await userEvent.clear(second);
    await userEvent.type(second, 'abc');
    await userEvent.keyboard('{Enter}');
    expect(g.host.querySelector('.aui-data-grid__edit-error')?.textContent).toMatch(/formula starting with =/);
    await userEvent.keyboard('{Escape}');
  });

  it('Ctrl+D and paste move relative references; values recalculate when inputs change', async () => {
    const g = await mount(rows());
    g.addCellRange({ startRow: 'a', endRow: 'c', startColumn: 'calc', endColumn: 'calc' });
    cell(g, 'a').focus();
    await userEvent.keyboard('{Control>}d{/Control}');
    expect(shown(g, 'b')).toBe('30');
    expect(shown(g, 'c')).toBe('40');
    g.applyTransaction({ update: [{ id: 'c', name: 'C', v: 5, calc: '=B3*10' }] });
    expect(shown(g, 'c')).toBe('50');
    // Copy the formula in row a, paste it on row c: =B1*10 becomes =B3*10.
    g.applyTransaction({ update: [{ id: 'c', name: 'C', v: 5, calc: 0 }] });
    g.clearCellRanges();
    cell(g, 'a').focus();
    const copy = new DataTransfer();
    cell(g, 'a').dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: copy }));
    cell(g, 'c').focus();
    const paste = new DataTransfer();
    paste.setData('text/plain', copy.getData('text/plain'));
    cell(g, 'c').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: paste }));
    expect(shown(g, 'c')).toBe('50');
    // Text pasted from elsewhere is a value (or a formula as typed).
    const outside = new DataTransfer();
    outside.setData('text/plain', '=B1+1');
    cell(g, 'c').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: outside }));
    expect(shown(g, 'c')).toBe('3');
  });
});

describe('formula editor and formula bar (G9d)', () => {
  interface C {
    id: string;
    v: number;
    calc: unknown;
  }
  async function mount(): Promise<DataGrid<C>> {
    const { DataGrid } = await import('@absoluteui/components/data-grid');
    const { formulaBar, formulaEngine } = await import('@absoluteui/components/data-grid/formulas');
    const host = document.createElement('div');
    document.body.append(host);
    return DataGrid.create<C>(host, {
      label: 'Cells',
      locale: 'en-US',
      rows: [
        { id: 'a', v: 2, calc: '=B1*10' },
        { id: 'b', v: 3, calc: null },
      ],
      rowId: (r) => r.id,
      formulas: formulaEngine(),
      accessories: [formulaBar()],
      columns: [
        { id: 'v', header: 'Value', field: 'v', type: 'number' },
        { id: 'calc', header: 'Calc', field: 'calc', type: 'number', editable: true, formulas: true },
      ],
    });
  }
  const cell = (g: DataGrid<C>, id: string, column = 'calc'): HTMLElement => g.host.querySelector<HTMLElement>(`[data-row-id="${id}"] [data-column="${column}"]`)!;

  it('suggests functions and columns as a combobox, hints arguments, and inserts clicked cells as references', async () => {
    const g = await mount();
    cell(g, 'b').focus();
    await userEvent.keyboard('{F2}');
    const input = g.host.querySelector<HTMLInputElement>('.aui-data-grid__formula-input')!;
    expect(input.getAttribute('role')).toBe('combobox');
    await userEvent.type(input, '=SU');
    const list = document.getElementById(input.getAttribute('aria-controls') ?? '')!;
    expect(list.hidden).toBe(false);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const options = [...list.querySelectorAll('[role="option"]')].map((o) => o.firstChild?.textContent);
    expect(options).toEqual(['SUBSTITUTE', 'SUM', 'SUMIF', 'SUMIFS']);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(input.value).toBe('=SUM(');
    expect(g.editingCell).not.toBeNull();
    expect(g.host.querySelector('.aui-data-grid__formula-hint')?.textContent).toBe('SUM(number1, [number2], ...)');
    // A click on another cell inserts its stable address.
    const target = cell(g, 'a', 'v');
    const r = target.getBoundingClientRect();
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: r.left + 2, clientY: r.top + 2 }));
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    expect(input.value).toBe('=SUM(A1');
    await userEvent.type(input, ',[[V');
    expect([...list.querySelectorAll('[role="option"]')].map((o) => o.firstChild?.textContent)).toEqual(['Value']);
    await userEvent.keyboard('{Tab}');
    expect(input.value).toBe('=SUM(A1,[Value]');
    await userEvent.type(input, ')');
    await userEvent.keyboard('{Enter}');
    expect(g.getExportData({ columns: ['calc'], rows: 'all' }).rows.find((x) => x.id === 'b')?.cells[0]?.text).toBe('7');
    expect(document.querySelector('.aui-data-grid__formula-list')).toBeNull();
  });

  it('the formula bar shows the focused cell address and formula', async () => {
    const g = await mount();
    g.focusCell('a', 'calc');
    const bar = g.host.querySelector('.aui-data-grid__formula-bar')!;
    expect(bar.getAttribute('aria-label')).toBe('Formula bar');
    expect(bar.querySelector('.aui-data-grid__formula-address')?.textContent).toBe('B1');
    expect(bar.querySelector('.aui-data-grid__formula-text')?.textContent).toBe('=B1*10');
    g.focusCell('b', 'v');
    expect(bar.querySelector('.aui-data-grid__formula-address')?.textContent).toBe('A2');
    expect(bar.querySelector('.aui-data-grid__formula-text')?.textContent).toBe('3');
    expect(g.cellAddress('b', 'calc')).toBe('B2');
    expect(g.cellFormula('a', 'calc')).toBe('=B1*10');
    expect(g.cellFormula('b', 'v')).toBeNull();
  });
});
