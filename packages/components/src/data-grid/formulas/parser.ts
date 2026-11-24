/**
 * Formula parsing (R11-18, G9a): our own tokenizer and precedence parser, never `eval` or
 * `Function` (R11-6). Syntax follows spreadsheets: `=` prefix, numbers with `.` decimals, "text"
 * with doubled quotes, TRUE/FALSE, error literals, A1 references with `$` anchors, ranges
 * (`A1:B5`), structured references (`[Price]` the column, `[@Price]` this row), function calls
 * with `,` separators, and the operators `^`, `*`, `/`, `+`, `-`, `&`, comparisons, and `%`.
 */

/** The formula error values, as spreadsheets write them. */
export const ERROR_CODES = ['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#N/A', '#NUM!', '#NULL!', '#CIRCULAR!', '#LIMIT!'] as const;
export type FormulaErrorCode = (typeof ERROR_CODES)[number];

/** A cell address: 0-based column and row with their `$` anchors. */
export interface CellAddress {
  readonly column: number;
  readonly row: number;
  readonly columnAbsolute: boolean;
  readonly rowAbsolute: boolean;
}

export type FormulaNode =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'error'; readonly code: FormulaErrorCode }
  | { readonly kind: 'cell'; readonly address: CellAddress }
  | { readonly kind: 'range'; readonly from: CellAddress; readonly to: CellAddress }
  /** `[Name]` (the whole column; one row where a single value is needed) or `[@Name]` (this row). */
  | { readonly kind: 'column'; readonly name: string; readonly thisRow: boolean }
  | { readonly kind: 'unary'; readonly operator: '-' | '+' | '%'; readonly operand: FormulaNode }
  | { readonly kind: 'binary'; readonly operator: BinaryOperator; readonly left: FormulaNode; readonly right: FormulaNode }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly FormulaNode[] };

export type BinaryOperator = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';

/** A parse failure: a message and the 0-based position in the formula text (after `=`). */
export class FormulaSyntaxError extends Error {
  readonly position: number;
  constructor(message: string, position: number) {
    super(message);
    this.name = 'FormulaSyntaxError';
    this.position = position;
  }
}

export const MAX_FORMULA_LENGTH = 8192;
export const MAX_DEPTH = 64;
export const MAX_ARGUMENTS = 255;
/** Column letters run to XFD (16,384 columns); rows to 1,048,576, as in spreadsheets. */
export const MAX_COLUMNS = 16_384;
export const MAX_ROWS = 1_048_576;

type Token =
  | { readonly type: 'number'; readonly value: number; readonly at: number }
  | { readonly type: 'text'; readonly value: string; readonly at: number }
  | { readonly type: 'name'; readonly value: string; readonly at: number }
  | { readonly type: 'cell'; readonly address: CellAddress; readonly at: number; readonly length: number }
  | { readonly type: 'column'; readonly name: string; readonly thisRow: boolean; readonly at: number }
  | { readonly type: 'error'; readonly code: FormulaErrorCode; readonly at: number }
  | { readonly type: 'op'; readonly value: string; readonly at: number };

const CELL = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})(?![A-Za-z0-9_(])/;
const NUMBER = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?/;
const NAME = /^[A-Za-z_][A-Za-z0-9_.]*/;

/** 0-based column index of column letters (A is 0), or -1 past XFD. */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n >= 1 && n <= MAX_COLUMNS ? n - 1 : -1;
}

/** Column letters of a 0-based index. */
export function columnLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function formatAddress(a: CellAddress): string {
  return `${a.columnAbsolute ? '$' : ''}${columnLetters(a.column)}${a.rowAbsolute ? '$' : ''}${String(a.row + 1)}`;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    const rest = text.slice(i);
    if (ch === '"') {
      let value = '';
      let j = i + 1;
      for (;;) {
        if (j >= text.length) throw new FormulaSyntaxError('Text is not closed with a quote', i);
        const c = text.charAt(j);
        if (c === '"') {
          if (text.charAt(j + 1) === '"') {
            value += '"';
            j += 2;
            continue;
          }
          break;
        }
        value += c;
        j++;
      }
      tokens.push({ type: 'text', value, at: i });
      i = j + 1;
      continue;
    }
    if (ch === '[') {
      const end = text.indexOf(']', i);
      if (end < 0) throw new FormulaSyntaxError('A column reference is not closed with ]', i);
      let name = text.slice(i + 1, end).trim();
      const thisRow = name.startsWith('@');
      if (thisRow) name = name.slice(1).trim();
      if (name === '') throw new FormulaSyntaxError('A column reference needs a column name', i);
      tokens.push({ type: 'column', name, thisRow, at: i });
      i = end + 1;
      continue;
    }
    if (ch === '#') {
      const code = ERROR_CODES.find((c) => rest.toUpperCase().startsWith(c));
      if (!code) throw new FormulaSyntaxError('Unknown error value', i);
      tokens.push({ type: 'error', code, at: i });
      i += code.length;
      continue;
    }
    const cell = CELL.exec(rest);
    if (cell) {
      const column = columnIndex(cell[2] ?? '');
      const row = Number(cell[4]) - 1;
      if (column >= 0 && row >= 0 && row < MAX_ROWS) {
        tokens.push({ type: 'cell', address: { column, row, columnAbsolute: cell[1] === '$', rowAbsolute: cell[3] === '$' }, at: i, length: cell[0].length });
        i += cell[0].length;
        continue;
      }
    }
    const num = NUMBER.exec(rest);
    if (num) {
      const value = Number(num[0]);
      if (!Number.isFinite(value)) throw new FormulaSyntaxError('Number out of range', i);
      tokens.push({ type: 'number', value, at: i });
      i += num[0].length;
      continue;
    }
    const name = NAME.exec(rest);
    if (name) {
      tokens.push({ type: 'name', value: name[0], at: i });
      i += name[0].length;
      continue;
    }
    const two = rest.slice(0, 2);
    if (two === '<>' || two === '<=' || two === '>=') {
      tokens.push({ type: 'op', value: two, at: i });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>%(),:'.includes(ch)) {
      tokens.push({ type: 'op', value: ch, at: i });
      i++;
      continue;
    }
    throw new FormulaSyntaxError(`Unexpected character ${ch}`, i);
  }
  return tokens;
}

/** Parse a formula (with or without the leading `=`). Throws FormulaSyntaxError. */
export function parseFormula(source: string): FormulaNode {
  if (typeof source !== 'string') throw new FormulaSyntaxError('A formula must be text', 0);
  const text = source.startsWith('=') ? source.slice(1) : source;
  if (text.length > MAX_FORMULA_LENGTH) throw new FormulaSyntaxError(`A formula has at most ${String(MAX_FORMULA_LENGTH)} characters`, 0);
  const tokens = tokenize(text);
  let p = 0;
  let depth = 0;
  const peek = (): Token | undefined => tokens[p];
  const isOp = (value: string): boolean => {
    const t = tokens[p];
    return t?.type === 'op' && t.value === value;
  };
  const at = (): number => tokens[p]?.at ?? text.length;
  const expect = (value: string): void => {
    if (!isOp(value)) throw new FormulaSyntaxError(`Expected ${value}`, at());
    p++;
  };
  const enter = (): void => {
    if (++depth > MAX_DEPTH) throw new FormulaSyntaxError(`Nesting is limited to ${String(MAX_DEPTH)} levels`, at());
  };
  // Precedence, lowest first: comparison, &, + -, * /, ^, unary - +, %, primary.
  const comparison = (): FormulaNode => {
    let left = concat();
    for (;;) {
      const t = peek();
      if (t?.type !== 'op' || !['=', '<>', '<', '>', '<=', '>='].includes(t.value)) return left;
      p++;
      left = { kind: 'binary', operator: t.value as BinaryOperator, left, right: concat() };
    }
  };
  const concat = (): FormulaNode => {
    let left = additive();
    while (isOp('&')) {
      p++;
      left = { kind: 'binary', operator: '&', left, right: additive() };
    }
    return left;
  };
  const additive = (): FormulaNode => {
    let left = multiplicative();
    for (;;) {
      const t = peek();
      if (t?.type !== 'op' || (t.value !== '+' && t.value !== '-')) return left;
      p++;
      left = { kind: 'binary', operator: t.value, left, right: multiplicative() };
    }
  };
  const multiplicative = (): FormulaNode => {
    let left = power();
    for (;;) {
      const t = peek();
      if (t?.type !== 'op' || (t.value !== '*' && t.value !== '/')) return left;
      p++;
      left = { kind: 'binary', operator: t.value, left, right: power() };
    }
  };
  const power = (): FormulaNode => {
    let left = unary();
    while (isOp('^')) {
      p++;
      // Left-associative, as in spreadsheets: 2^3^2 is 64.
      left = { kind: 'binary', operator: '^', left, right: unary() };
    }
    return left;
  };
  const unary = (): FormulaNode => {
    const t = peek();
    if (t?.type === 'op' && (t.value === '-' || t.value === '+')) {
      p++;
      enter();
      const operand = unary();
      depth--;
      return { kind: 'unary', operator: t.value, operand };
    }
    return percent();
  };
  const percent = (): FormulaNode => {
    let node = primary();
    while (isOp('%')) {
      p++;
      node = { kind: 'unary', operator: '%', operand: node };
    }
    return node;
  };
  const primary = (): FormulaNode => {
    const t = peek();
    if (!t) throw new FormulaSyntaxError('The formula ends too early', text.length);
    p++;
    switch (t.type) {
      case 'number':
        return { kind: 'number', value: t.value };
      case 'text':
        return { kind: 'text', value: t.value };
      case 'error':
        return { kind: 'error', code: t.code };
      case 'column':
        return { kind: 'column', name: t.name, thisRow: t.thisRow };
      case 'cell': {
        if (isOp(':')) {
          p++;
          const end = peek();
          if (end?.type !== 'cell') throw new FormulaSyntaxError('A range needs a cell after :', at());
          p++;
          return { kind: 'range', from: t.address, to: end.address };
        }
        return { kind: 'cell', address: t.address };
      }
      case 'name': {
        const upper = t.value.toUpperCase();
        if (isOp('(')) {
          p++;
          enter();
          const args: FormulaNode[] = [];
          if (!isOp(')')) {
            for (;;) {
              // An empty argument (f(1,,2)) is a blank.
              args.push(isOp(',') || isOp(')') ? { kind: 'text', value: '' } : comparison());
              if (args.length > MAX_ARGUMENTS) throw new FormulaSyntaxError(`A function takes at most ${String(MAX_ARGUMENTS)} arguments`, at());
              if (isOp(',')) {
                p++;
                continue;
              }
              break;
            }
          }
          expect(')');
          depth--;
          return { kind: 'call', name: upper, args };
        }
        if (upper === 'TRUE' || upper === 'FALSE') return { kind: 'boolean', value: upper === 'TRUE' };
        throw new FormulaSyntaxError(`Unknown name ${t.value}`, t.at);
      }
      case 'op': {
        if (t.value === '(') {
          enter();
          const inner = comparison();
          expect(')');
          depth--;
          return inner;
        }
        throw new FormulaSyntaxError(`Unexpected ${t.value}`, t.at);
      }
    }
  };
  if (tokens.length === 0) throw new FormulaSyntaxError('The formula is empty', 0);
  const node = comparison();
  if (p < tokens.length) throw new FormulaSyntaxError(`Unexpected ${tokens[p]?.type === 'op' ? (tokens[p] as { value: string }).value : 'text'}`, at());
  return node;
}

/**
 * The formula with relative A1 references moved by rows and columns (fill and paste); `$` parts stay.
 * References moved outside the sheet become `#REF!`. Text, column references, and names are kept as typed.
 */
export function shiftFormula(source: string, rows: number, columns: number): string {
  const prefix = source.startsWith('=') ? '=' : '';
  const text = prefix ? source.slice(1) : source;
  const tokens = tokenize(text);
  let out = '';
  let last = 0;
  for (const t of tokens) {
    if (t.type !== 'cell') continue;
    const a = t.address;
    const column = a.columnAbsolute ? a.column : a.column + columns;
    const row = a.rowAbsolute ? a.row : a.row + rows;
    out += text.slice(last, t.at);
    out += column < 0 || row < 0 || column >= MAX_COLUMNS || row >= MAX_ROWS ? '#REF!' : formatAddress({ ...a, column, row });
    last = t.at + t.length;
  }
  return prefix + out + text.slice(last);
}

/** Every cell, range, column, and function name a formula refers to (for dependencies and autocomplete). */
export function references(node: FormulaNode): { cells: CellAddress[]; ranges: { from: CellAddress; to: CellAddress }[]; columns: { name: string; thisRow: boolean }[]; functions: string[] } {
  const out = { cells: [] as CellAddress[], ranges: [] as { from: CellAddress; to: CellAddress }[], columns: [] as { name: string; thisRow: boolean }[], functions: [] as string[] };
  const stack: FormulaNode[] = [node];
  for (let n = stack.pop(); n; n = stack.pop()) {
    if (n.kind === 'cell') out.cells.push(n.address);
    else if (n.kind === 'range') out.ranges.push({ from: n.from, to: n.to });
    else if (n.kind === 'column') out.columns.push({ name: n.name, thisRow: n.thisRow });
    else if (n.kind === 'unary') stack.push(n.operand);
    else if (n.kind === 'binary') stack.push(n.left, n.right);
    else if (n.kind === 'call') {
      out.functions.push(n.name);
      stack.push(...n.args);
    }
  }
  return out;
}
