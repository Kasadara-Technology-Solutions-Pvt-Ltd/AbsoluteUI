/**
 * @absoluteui/components/data-grid/formulas (R11-18): formulas and calculated columns for the Data
 * Grid on our own parser and evaluator (no eval; strict CSP and Trusted Types stay intact).
 */
export { parseFormula, shiftFormula, references, columnIndex, columnLetters, formatAddress, FormulaSyntaxError, ERROR_CODES, MAX_FORMULA_LENGTH, type CellAddress, type FormulaNode, type FormulaErrorCode, type BinaryOperator } from './parser.js';
export {
  evaluateFormula,
  formulaError,
  isFormulaError,
  isRange,
  toNumber,
  toText,
  toBoolean,
  toDate,
  compareScalars,
  dateToSerial,
  serialToDate,
  type FormulaError,
  type Scalar,
  type RangeValue,
  type FormulaValue,
  type FormulaSheet,
  type FormulaFunction,
  type FunctionContext,
  type EvaluateOptions,
} from './engine.js';
export { BUILTIN_FUNCTIONS, FUNCTION_NAME } from './functions.js';
export { FormulaBook, type FormulaSource, type FormulaBookOptions, type ParsedFormula } from './book.js';

import type { BusinessCalendarEngine } from '../../business-calendar/engine.js';
import { isPlainDate } from '../../data-table/model.js';
import type { DataGridFormulaEngine } from '../data-grid.js';
import { fail } from '../model.js';
import { getMessage, registerMessages } from '@absoluteui/core';
import type { DataGridAccessory } from '../data-grid.js';
import { createFormulaEditor } from './editor.js';
import { FormulaBook } from './book.js';
import { FormulaSyntaxError, parseFormula, shiftFormula } from './parser.js';
import { isFormulaError, type FormulaFunction, type Scalar } from './engine.js';
import { BUILTIN_FUNCTIONS, FUNCTION_NAME, FUNCTION_SIGNATURES } from './functions.js';

export { createFormulaEditor, callAt, type FormulaEditorNames, type FormulaEditorMessages } from './editor.js';
export { FUNCTION_SIGNATURES } from './functions.js';

registerMessages('dataGridFormulas', 'en', {
  suggestions: 'Suggestions',
  problem: 'Problem: {message}',
  formulaBar: 'Formula bar',
  cell: 'Cell',
});

export interface FormulaEngineOptions {
  /** Application functions by name (letters, digits, `_`, `.`; not a built-in name). They must be pure. */
  readonly functions?: Readonly<Record<string, FormulaFunction>>;
  /** Business calendar for NETWORKDAYS and WORKDAY (default Monday to Friday). */
  readonly calendar?: BusinessCalendarEngine;
}

/** A cell value as a formula value: numbers, text, booleans, calendar dates, blanks; anything else reads as blank. */
function toScalar(value: unknown): Scalar {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return Number(value);
  if (isPlainDate(value) || isFormulaError(value)) return value;
  return null;
}

/** The formula engine for the grid's `formulas` option: the built-in functions plus the application's. */
export function formulaEngine(options: FormulaEngineOptions = {}): DataGridFormulaEngine {
  const o: unknown = options;
  if (typeof o !== 'object' || o === null) fail('formulaEngine', '{ functions?, calendar? }');
  const functions = new Map(BUILTIN_FUNCTIONS);
  for (const [name, fn] of Object.entries(options.functions ?? {})) {
    const upper = name.toUpperCase();
    if (!FUNCTION_NAME.test(name) || BUILTIN_FUNCTIONS.has(upper) || ['IF', 'IFS', 'IFERROR', 'IFNA', 'SWITCH', 'CHOOSE', 'TRUE', 'FALSE'].includes(upper)) fail(`formulaEngine.functions.${name}`, 'a new function name (letters, digits, _ and .)');
    if (typeof fn !== 'function') fail(`formulaEngine.functions.${name}`, 'function (args, context) => value');
    functions.set(upper, fn);
  }
  const calendar = options.calendar;
  return {
    check: (text) => {
      try {
        parseFormula(text);
        return null;
      } catch (e) {
        return e instanceof FormulaSyntaxError ? `${e.message} (at ${String(e.position + 1)})` : 'Invalid formula';
      }
    },
    shift: (text, rows, columns) => shiftFormula(text, rows, columns),
    editor: (context, columns) => {
      const locale = context.locale;
      const names = new Map([...functions.keys()].sort().map((name) => [name, FUNCTION_SIGNATURES.get(name) ?? `${name}(...)`]));
      return createFormulaEditor(context, { functions: names, columns }, { suggestions: getMessage('dataGridFormulas', 'suggestions', {}, locale), problem: (message) => getMessage('dataGridFormulas', 'problem', { message }, locale) });
    },
    create: (source, environment) =>
      new FormulaBook({
        source: {
          get rowCount() {
            return source.rowCount;
          },
          get columnCount() {
            return source.columnCount;
          },
          column: (name) => source.column(name),
          formula: (row, column) => source.formula(row, column),
          value: (row, column) => toScalar(source.value(row, column)),
          formulaRows: (column, top, bottom) => source.formulaRows(column, top, bottom),
        },
        functions,
        today: environment.today,
        ...(calendar ? { calendar } : {}),
      }),
  };
}

/**
 * A read-only formula bar above the grid (an accessory): the focused cell's stable address and its formula
 * (or its displayed value).
 */
export function formulaBar<Row>(): DataGridAccessory<Row> {
  return {
    attach(context) {
      const doc = context.doc;
      const t = (key: string): string => getMessage('dataGridFormulas', key, {}, context.locale());
      const slot = context.toolbarSlot('formula-bar');
      const box = doc.createElement('div');
      box.className = 'aui-data-grid__formula-bar';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', t('formulaBar'));
      const address = doc.createElement('span');
      address.className = 'aui-data-grid__formula-address';
      const text = doc.createElement('output');
      text.className = 'aui-data-grid__formula-text';
      box.append(address, text);
      slot.append(box);
      const refresh = (): void => {
        const f = context.grid.focusedCell;
        const rowId = f?.rowId ?? null;
        if (!f || rowId === null) {
          address.textContent = '';
          text.textContent = '';
          return;
        }
        address.textContent = context.grid.cellAddress(rowId, f.column) ?? '';
        address.setAttribute('aria-label', `${t('cell')} ${address.textContent}`);
        text.textContent = context.grid.cellFormula(rowId, f.column) ?? context.cellElement(rowId, f.column)?.querySelector('.aui-data-grid__text')?.textContent ?? '';
      };
      context.host.addEventListener('aui-cell-focus', refresh);
      // Focus moves by the API emit no event.
      context.host.addEventListener('focusin', refresh);
      const off = context.onUpdate(refresh);
      refresh();
      return () => {
        context.host.removeEventListener('aui-cell-focus', refresh);
        context.host.removeEventListener('focusin', refresh);
        off();
        box.remove();
      };
    },
  };
}
