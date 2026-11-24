/**
 * Formula values and evaluation (R11-18, G9a): spreadsheet coercions and errors, implicit
 * intersection for column references, date arithmetic on PlainDate, and a step budget. Pure:
 * cell values come from a FormulaSheet; functions from a registry.
 */
import { addDays, parsePlainDate, plainDate, type PlainDate } from '@absoluteui/core';
import { isPlainDate } from '../../data-table/model.js';
import type { BusinessCalendarEngine } from '../../business-calendar/engine.js';
import { ERROR_CODES, type FormulaErrorCode, type FormulaNode } from './parser.js';

export interface FormulaError {
  readonly error: FormulaErrorCode;
}

const ERRORS = new Map<FormulaErrorCode, FormulaError>(ERROR_CODES.map((code) => [code, Object.freeze({ error: code })]));

/** The shared error value of a code. */
export function formulaError(code: FormulaErrorCode): FormulaError {
  return ERRORS.get(code) ?? { error: code };
}

export const isFormulaError = (v: unknown): v is FormulaError => typeof v === 'object' && v !== null && 'error' in v && ERRORS.has((v as FormulaError).error);

/** A single value: a number, text, boolean, calendar date, blank (null), or an error. */
export type Scalar = number | string | boolean | PlainDate | null | FormulaError;

/** A rectangle of cells (ranges and column references), read lazily. */
export interface RangeValue {
  readonly kind: 'range';
  readonly top: number;
  readonly left: number;
  readonly rows: number;
  readonly columns: number;
  at(row: number, column: number): Scalar;
}

export type FormulaValue = Scalar | RangeValue;

export const isRange = (v: FormulaValue): v is RangeValue => typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'range';

/** Cell values for evaluation (a formula cell's value is its result). */
export interface FormulaSheet {
  readonly rowCount: number;
  readonly columnCount: number;
  /** Column index of a structured reference name (column id or header, case-insensitive), or -1. */
  column(name: string): number;
  value(row: number, column: number): Scalar;
}

export interface FunctionContext {
  readonly row: number;
  readonly column: number;
  today(): PlainDate;
  readonly calendar: BusinessCalendarEngine | undefined;
  /** Implicit intersection of a range with the current cell. */
  scalar(value: FormulaValue): Scalar;
}

/** A function: evaluated arguments (ranges stay ranges), returns one value. Must be pure. */
export type FormulaFunction = (args: readonly FormulaValue[], context: FunctionContext) => Scalar;

export interface EvaluateOptions {
  readonly sheet: FormulaSheet;
  readonly row: number;
  readonly column: number;
  readonly functions: ReadonlyMap<string, FormulaFunction>;
  readonly today: () => PlainDate;
  readonly calendar?: BusinessCalendarEngine;
  /** Node evaluations allowed (default 1,000,000); more gives #LIMIT!. */
  readonly steps?: number;
}

export const MAX_RANGE_CELLS = 1_000_000;

// ---- Dates as serial day numbers (the 1900 system, from 1899-12-30) -----------------------------------

const DAY = 86_400_000;
const EPOCH = Date.UTC(1899, 11, 30);

export function dateToSerial(d: PlainDate): number {
  return (Date.UTC(d.year, d.month - 1, d.day) - EPOCH) / DAY;
}

export function serialToDate(serial: number): PlainDate | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  const t = new Date(EPOCH + Math.floor(serial) * DAY);
  return plainDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// ---- Coercions -----------------------------------------------------------------------------------------

const NUMERIC = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

export function toNumber(v: Scalar): number | FormulaError {
  if (typeof v === 'number') return v;
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isFormulaError(v)) return v;
  if (isPlainDate(v)) return dateToSerial(v);
  const t = v.trim();
  if (NUMERIC.test(t)) return Number(t);
  if (/^[-+]?(?:\d+\.?\d*|\.\d+)%$/.test(t)) return Number(t.slice(0, -1)) / 100;
  const d = parsePlainDate(t);
  return d ? dateToSerial(d) : formulaError('#VALUE!');
}

/** Number text without float noise (15 significant digits, as spreadsheets show). */
export function numberText(n: number): string {
  if (!Number.isFinite(n)) return '#NUM!';
  return String(Number(n.toPrecision(15)));
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
export const dateText = (d: PlainDate): string => `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}`;

export function toText(v: Scalar): string | FormulaError {
  if (typeof v === 'string') return v;
  if (v === null) return '';
  if (typeof v === 'number') return numberText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isFormulaError(v)) return v;
  return dateText(v);
}

export function toBoolean(v: Scalar): boolean | FormulaError {
  if (typeof v === 'boolean') return v;
  if (v === null) return false;
  if (typeof v === 'number') return v !== 0;
  if (isFormulaError(v)) return v;
  if (typeof v === 'string') {
    const u = v.trim().toUpperCase();
    return u === 'TRUE' ? true : u === 'FALSE' ? false : formulaError('#VALUE!');
  }
  return formulaError('#VALUE!');
}

export function toDate(v: Scalar): PlainDate | FormulaError {
  if (isPlainDate(v)) return v;
  if (isFormulaError(v)) return v;
  if (typeof v === 'string') {
    const d = parsePlainDate(v.trim());
    if (d) return d;
  }
  const n = toNumber(v);
  if (isFormulaError(n)) return n;
  return serialToDate(n) ?? formulaError('#NUM!');
}

/** Spreadsheet ordering: numbers (and dates) < text < booleans; text compares without case; a blank is 0, "", or FALSE. */
export function compareScalars(a: Scalar, b: Scalar): number {
  const rank = (v: Scalar): number => (typeof v === 'number' || isPlainDate(v) ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);
  let x = a;
  let y = b;
  x ??= y === null ? 0 : typeof y === 'string' ? '' : typeof y === 'boolean' ? false : 0;
  y ??= typeof x === 'string' ? '' : typeof x === 'boolean' ? false : 0;
  const rx = rank(x);
  const ry = rank(y);
  if (rx !== ry) return rx - ry;
  if (rx === 0) {
    const nx = toNumber(x);
    const ny = toNumber(y);
    return typeof nx === 'number' && typeof ny === 'number' ? Math.sign(nx - ny) : 0;
  }
  if (typeof x === 'string' && typeof y === 'string') {
    const lx = x.toLowerCase();
    const ly = y.toLowerCase();
    return lx < ly ? -1 : lx > ly ? 1 : 0;
  }
  return Number(x === true) - Number(y === true);
}

const finite = (n: number): number | FormulaError => (Number.isFinite(n) ? n : formulaError('#NUM!'));

// ---- Evaluation ----------------------------------------------------------------------------------------

/** Functions evaluating their arguments themselves (short circuit). */
const LAZY = new Set(['IF', 'IFS', 'IFERROR', 'IFNA', 'SWITCH', 'CHOOSE']);

/** Evaluate a parsed formula for one cell. Never throws for formula problems: they become error values. */
export function evaluateFormula(node: FormulaNode, options: EvaluateOptions): Scalar {
  const { sheet } = options;
  let steps = options.steps ?? 1_000_000;
  const scalar = (v: FormulaValue): Scalar => {
    if (!isRange(v)) return v;
    if (v.rows === 1 && v.columns === 1) return v.at(0, 0);
    // Implicit intersection: the cell of a column range in this row, or of a row range in this column.
    if (v.columns === 1 && options.row >= v.top && options.row < v.top + v.rows) return v.at(options.row - v.top, 0);
    if (v.rows === 1 && options.column >= v.left && options.column < v.left + v.columns) return v.at(0, options.column - v.left);
    return formulaError('#VALUE!');
  };
  const range = (top: number, left: number, bottom: number, right: number): FormulaValue => {
    const t = Math.min(top, bottom);
    const b = Math.max(top, bottom);
    const l = Math.min(left, right);
    const r = Math.max(left, right);
    if (r >= sheet.columnCount) return formulaError('#REF!');
    if ((b - t + 1) * (r - l + 1) > MAX_RANGE_CELLS) return formulaError('#LIMIT!');
    return { kind: 'range', top: t, left: l, rows: b - t + 1, columns: r - l + 1, at: (row, column) => (t + row < sheet.rowCount ? sheet.value(t + row, l + column) : null) };
  };
  const context: FunctionContext = { row: options.row, column: options.column, today: options.today, calendar: options.calendar, scalar };
  const evaluate = (n: FormulaNode): FormulaValue => {
    if (--steps < 0) return formulaError('#LIMIT!');
    switch (n.kind) {
      case 'number':
        return n.value;
      case 'text':
        return n.value;
      case 'boolean':
        return n.value;
      case 'error':
        return formulaError(n.code);
      case 'cell':
        if (n.address.column >= sheet.columnCount) return formulaError('#REF!');
        return n.address.row < sheet.rowCount ? sheet.value(n.address.row, n.address.column) : null;
      case 'range':
        return range(n.from.row, n.from.column, n.to.row, n.to.column);
      case 'column': {
        const c = sheet.column(n.name);
        if (c < 0) return formulaError('#REF!');
        return n.thisRow ? (options.row < sheet.rowCount ? sheet.value(options.row, c) : null) : range(0, c, Math.max(0, sheet.rowCount - 1), c);
      }
      case 'unary': {
        const v = scalar(evaluate(n.operand));
        const x = toNumber(v);
        if (isFormulaError(x)) return x;
        return n.operator === '-' ? -x : n.operator === '%' ? x / 100 : x;
      }
      case 'binary':
        return binary(n.operator, scalar(evaluate(n.left)), scalar(evaluate(n.right)));
      case 'call': {
        if (LAZY.has(n.name)) return lazy(n.name, n.args);
        const fn = options.functions.get(n.name);
        if (!fn) return formulaError('#NAME?');
        const args = n.args.map(evaluate);
        try {
          return fn(args, context);
        } catch {
          // A failing function (an application one) gives #VALUE!, never an exception out of the grid.
          return formulaError('#VALUE!');
        }
      }
    }
  };
  const condition = (n: FormulaNode | undefined): boolean | FormulaError => (n ? toBoolean(scalar(evaluate(n))) : formulaError('#VALUE!'));
  const lazy = (name: string, args: readonly FormulaNode[]): FormulaValue => {
    const arg = (i: number): FormulaValue => {
      const a = args[i];
      return a ? evaluate(a) : formulaError('#VALUE!');
    };
    switch (name) {
      case 'IF': {
        if (args.length < 2 || args.length > 3) return formulaError('#VALUE!');
        const c = condition(args[0]);
        if (isFormulaError(c)) return c;
        return c ? arg(1) : args.length > 2 ? arg(2) : false;
      }
      case 'IFS': {
        if (args.length < 2 || args.length % 2 !== 0) return formulaError('#VALUE!');
        for (let i = 0; i < args.length; i += 2) {
          const c = condition(args[i]);
          if (isFormulaError(c)) return c;
          if (c) return arg(i + 1);
        }
        return formulaError('#N/A');
      }
      case 'IFERROR':
      case 'IFNA': {
        if (args.length !== 2) return formulaError('#VALUE!');
        const v = scalar(arg(0));
        if (isFormulaError(v) && (name === 'IFERROR' || v.error === '#N/A')) return arg(1);
        return v;
      }
      case 'SWITCH': {
        if (args.length < 3) return formulaError('#VALUE!');
        const v = scalar(arg(0));
        if (isFormulaError(v)) return v;
        let i = 1;
        for (; i + 1 < args.length; i += 2) {
          const k = scalar(arg(i));
          if (isFormulaError(k)) return k;
          if (compareScalars(v, k) === 0 && typeof v === typeof k) return arg(i + 1);
        }
        return i < args.length ? arg(i) : formulaError('#N/A');
      }
      default: {
        // CHOOSE(index, value1, value2, ...)
        if (args.length < 2) return formulaError('#VALUE!');
        const k = toNumber(scalar(arg(0)));
        if (isFormulaError(k)) return k;
        const i = Math.trunc(k);
        return i >= 1 && i < args.length ? arg(i) : formulaError('#VALUE!');
      }
    }
  };
  const result = scalar(evaluate(node));
  return typeof result === 'number' ? finite(result) : result;
}

function binary(op: string, a: Scalar, b: Scalar): Scalar {
  if (isFormulaError(a)) return a;
  if (isFormulaError(b)) return b;
  switch (op) {
    case '&': {
      const x = toText(a);
      const y = toText(b);
      return isFormulaError(x) ? x : isFormulaError(y) ? y : x + y;
    }
    case '=':
      return compareScalars(a, b) === 0;
    case '<>':
      return compareScalars(a, b) !== 0;
    case '<':
      return compareScalars(a, b) < 0;
    case '>':
      return compareScalars(a, b) > 0;
    case '<=':
      return compareScalars(a, b) <= 0;
    case '>=':
      return compareScalars(a, b) >= 0;
  }
  // Date arithmetic: a date plus or minus days is a date; a date minus a date is days.
  if (op === '+' || op === '-') {
    if (isPlainDate(a) && !isPlainDate(b)) {
      const n = toNumber(b);
      if (isFormulaError(n)) return n;
      return addDays(a, op === '+' ? Math.trunc(n) : -Math.trunc(n));
    }
    if (op === '+' && isPlainDate(b) && !isPlainDate(a)) {
      const n = toNumber(a);
      if (isFormulaError(n)) return n;
      return addDays(b, Math.trunc(n));
    }
  }
  const x = toNumber(a);
  const y = toNumber(b);
  if (isFormulaError(x)) return x;
  if (isFormulaError(y)) return y;
  switch (op) {
    case '+':
      return finite(x + y);
    case '-':
      return finite(x - y);
    case '*':
      return finite(x * y);
    case '/':
      return y === 0 ? formulaError('#DIV/0!') : finite(x / y);
    default:
      return x === 0 && y === 0 ? formulaError('#NUM!') : finite(x ** y);
  }
}
