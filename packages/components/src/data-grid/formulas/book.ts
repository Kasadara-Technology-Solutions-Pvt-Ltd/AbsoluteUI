/**
 * Formula cells, their cached results, and dependencies (R11-18, G9a). Results are computed on
 * demand in dependency order (an explicit stack, so long chains never overflow the call stack),
 * cycles give #CIRCULAR!, and a change invalidates only the cells that depend on it.
 */
import type { PlainDate } from '@absoluteui/core';
import type { BusinessCalendarEngine } from '../../business-calendar/engine.js';
import { evaluateFormula, formulaError, type FormulaFunction, type FormulaSheet, type Scalar } from './engine.js';
import { FormulaSyntaxError, parseFormula, references, type FormulaNode } from './parser.js';

/** The cells a book computes over: plain values, formula texts, and column names. */
export interface FormulaSource {
  readonly rowCount: number;
  readonly columnCount: number;
  /** Column index of a structured reference name, or -1. */
  column(name: string): number;
  /** The formula text of a cell (starting with `=`), or null for a plain value. */
  formula(row: number, column: number): string | null;
  /** A plain cell's value. */
  value(row: number, column: number): Scalar;
  /** Rows from `top` to `bottom` of a column that hold formulas, ascending. */
  formulaRows(column: number, top: number, bottom: number): Iterable<number>;
}

export interface FormulaBookOptions {
  readonly source: FormulaSource;
  readonly functions: ReadonlyMap<string, FormulaFunction>;
  readonly today: () => PlainDate;
  readonly calendar?: BusinessCalendarEngine;
}

/** A parse result: the tree, or the syntax error. */
export type ParsedFormula = { readonly node: FormulaNode } | { readonly error: FormulaSyntaxError };

interface Deps {
  readonly cells: readonly number[];
  readonly ranges: readonly { readonly top: number; readonly left: number; readonly bottom: number; readonly right: number }[];
}

const key = (row: number, column: number): number => row * 16_384 + column;

export class FormulaBook {
  readonly #o: FormulaBookOptions;
  readonly #parsed = new Map<string, ParsedFormula>();
  readonly #values = new Map<number, Scalar>();
  readonly #deps = new Map<number, Deps>();
  /** Cell to the formula cells reading it; ranges kept in a list (checked on change). */
  readonly #readers = new Map<number, Set<number>>();
  readonly #rangeReaders = new Map<number, Deps['ranges']>();
  readonly #sheet: FormulaSheet;

  constructor(options: FormulaBookOptions) {
    this.#o = options;
    const s = options.source;
    this.#sheet = {
      get rowCount() {
        return s.rowCount;
      },
      get columnCount() {
        return s.columnCount;
      },
      column: (name) => s.column(name),
      value: (row, column) => this.value(row, column),
    };
  }

  /** Parse with a cache (formula texts repeat: calculated columns share one text). */
  parse(text: string): ParsedFormula {
    let p = this.#parsed.get(text);
    if (!p) {
      try {
        p = { node: parseFormula(text) };
      } catch (e) {
        p = { error: e instanceof FormulaSyntaxError ? e : new FormulaSyntaxError('Invalid formula', 0) };
      }
      if (this.#parsed.size > 10_000) this.#parsed.clear();
      this.#parsed.set(text, p);
    }
    return p;
  }

  /** A cell's value: a plain value, or a formula's result (computed in dependency order when needed). */
  value(row: number, column: number): Scalar {
    const src = this.#o.source;
    if (row < 0 || column < 0 || row >= src.rowCount || column >= src.columnCount) return null;
    const k = key(row, column);
    const cached = this.#values.get(k);
    if (cached !== undefined) return cached;
    if (src.formula(row, column) === null) return src.value(row, column);
    this.#compute(row, column);
    return this.#values.get(k) ?? formulaError('#CIRCULAR!');
  }

  /** The cells a formula cell depends on (A1, ranges, column references in its row or whole). */
  #dependencies(node: FormulaNode, row: number): Deps {
    const src = this.#o.source;
    const refs = references(node);
    const cells: number[] = refs.cells.map((a) => key(a.row, a.column));
    const ranges: { top: number; left: number; bottom: number; right: number }[] = refs.ranges.map((r) => ({ top: Math.min(r.from.row, r.to.row), left: Math.min(r.from.column, r.to.column), bottom: Math.max(r.from.row, r.to.row), right: Math.max(r.from.column, r.to.column) }));
    for (const c of refs.columns) {
      const index = src.column(c.name);
      if (index < 0) continue;
      // [@Col] reads this row; [Col] may read any row of the column.
      if (c.thisRow) cells.push(key(row, index));
      else ranges.push({ top: 0, left: index, bottom: Math.max(0, src.rowCount - 1), right: index });
    }
    return { cells, ranges };
  }

  /** Formula cells a dependency set reads (to compute them first). */
  *#formulaInputs(deps: Deps): Generator<number> {
    const src = this.#o.source;
    for (const k of deps.cells) {
      const row = Math.floor(k / 16_384);
      const column = k % 16_384;
      if (row < src.rowCount && column < src.columnCount && src.formula(row, column) !== null) yield k;
    }
    for (const r of deps.ranges) {
      for (let c = r.left; c <= Math.min(r.right, src.columnCount - 1); c++) {
        for (const row of src.formulaRows(c, r.top, Math.min(r.bottom, src.rowCount - 1))) yield key(row, c);
      }
    }
  }

  /** Compute a formula cell and the uncomputed formula cells it needs, deepest first; cycles become #CIRCULAR!. */
  #compute(row: number, column: number): void {
    const src = this.#o.source;
    const onStack = new Set<number>();
    const stack: { k: number; inputs: Iterator<number> | null }[] = [{ k: key(row, column), inputs: null }];
    onStack.add(key(row, column));
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (!top) break;
      const r = Math.floor(top.k / 16_384);
      const c = top.k % 16_384;
      if (!top.inputs) {
        const text = src.formula(r, c);
        const parsed = text === null ? null : this.parse(text);
        if (!parsed || 'error' in parsed) {
          this.#store(top.k, { cells: [], ranges: [] }, text === null ? src.value(r, c) : formulaError('#NAME?'));
          onStack.delete(top.k);
          stack.pop();
          continue;
        }
        const deps = this.#dependencies(parsed.node, r);
        this.#deps.set(top.k, deps);
        top.inputs = this.#formulaInputs(deps);
      }
      let pushed = false;
      for (let next = top.inputs.next(); !next.done; next = top.inputs.next()) {
        const k = next.value;
        if (this.#values.has(k)) continue;
        if (onStack.has(k)) {
          // A cycle: every cell on it is circular.
          let i = stack.length - 1;
          for (; i >= 0 && stack[i]?.k !== k; i--);
          for (let j = Math.max(0, i); j < stack.length; j++) {
            const e = stack[j];
            if (e) this.#store(e.k, this.#deps.get(e.k) ?? { cells: [], ranges: [] }, formulaError('#CIRCULAR!'));
          }
          continue;
        }
        onStack.add(k);
        stack.push({ k, inputs: null });
        pushed = true;
        break;
      }
      if (pushed) continue;
      if (!this.#values.has(top.k)) {
        const text = src.formula(r, c);
        const parsed = text === null ? null : this.parse(text);
        const value = parsed && 'node' in parsed ? evaluateFormula(parsed.node, { sheet: this.#sheet, row: r, column: c, functions: this.#o.functions, today: this.#o.today, ...(this.#o.calendar ? { calendar: this.#o.calendar } : {}) }) : formulaError('#NAME?');
        this.#store(top.k, this.#deps.get(top.k) ?? { cells: [], ranges: [] }, value);
      }
      onStack.delete(top.k);
      stack.pop();
    }
  }

  #store(k: number, deps: Deps, value: Scalar): void {
    this.#values.set(k, value);
    for (const d of deps.cells) {
      let set = this.#readers.get(d);
      if (!set) {
        set = new Set();
        this.#readers.set(d, set);
      }
      set.add(k);
    }
    if (deps.ranges.length > 0) this.#rangeReaders.set(k, deps.ranges);
  }

  /** A cell's value or formula changed: forget the results that depend on it (and on them). */
  invalidate(row: number, column: number): void {
    const queue = [key(row, column)];
    const seen = new Set<number>();
    for (let k = queue.pop(); k !== undefined; k = queue.pop()) {
      if (seen.has(k)) continue;
      seen.add(k);
      this.#values.delete(k);
      this.#forget(k);
      const r = Math.floor(k / 16_384);
      const c = k % 16_384;
      for (const reader of this.#readers.get(k) ?? []) queue.push(reader);
      for (const [reader, ranges] of this.#rangeReaders) {
        if (ranges.some((x) => r >= x.top && r <= x.bottom && c >= x.left && c <= x.right)) queue.push(reader);
      }
    }
  }

  #forget(k: number): void {
    const deps = this.#deps.get(k);
    if (!deps) return;
    for (const d of deps.cells) this.#readers.get(d)?.delete(k);
    this.#rangeReaders.delete(k);
    this.#deps.delete(k);
  }

  /** Forget every result (rows added, removed, or reordered; volatile functions such as TODAY). */
  invalidateAll(): void {
    this.#values.clear();
    this.#deps.clear();
    this.#readers.clear();
    this.#rangeReaders.clear();
  }
}
