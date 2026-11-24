/**
 * Data Grid advanced filter (docs/PLAN-R11-G2.md, G2c): a JSON tree of groups and column
 * conditions, its validation, compiled predicates, and a small expression language with a
 * hand-written tokenizer and recursive-descent parser (no eval, no Function):
 *
 *   [Name] contains "ann" and ([Age] >= 30 or [City] is any of ("Oslo", "Lima"))
 *
 * Columns are referenced by header in brackets (`]]` escapes `]`), text and dates are quoted
 * (`\"` and `\\` escape), keywords are English and case-insensitive, `and` binds tighter than `or`.
 * Each condition holds a column filter model (filter.ts), so matching reuses the column engine.
 */
import { configurationError, parsePlainDate } from '@absoluteui/core';
import { compileFilter, parseFilter, type DataGridFilter, type DataGridFilterJoin, type DataGridFilterKind, type FilterColumn, type FilterEnvironment } from './filter.js';

export interface DataGridAdvancedCondition {
  readonly column: string;
  /** A column filter model of the column's filter kind. */
  readonly filter: DataGridFilter;
}
export interface DataGridAdvancedGroup {
  readonly join: DataGridFilterJoin;
  readonly items: readonly DataGridAdvancedItem[];
}
export type DataGridAdvancedItem = DataGridAdvancedCondition | DataGridAdvancedGroup;
/** The advanced filter: a root group. JSON-safe. */
export type DataGridAdvancedFilter = DataGridAdvancedGroup;

export const isAdvancedGroup = (item: DataGridAdvancedItem): item is DataGridAdvancedGroup => 'items' in item;

/** Nesting and size limits for untrusted models and expressions. */
export const ADVANCED_MAX_DEPTH = 8;
export const ADVANCED_MAX_CONDITIONS = 500;

/** What the advanced filter knows about a filterable column. */
export interface AdvancedColumn {
  readonly id: string;
  readonly header: string;
  readonly kind: DataGridFilterKind;
}

// ---- Validation ----------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function invalid(path: string, expected: string): never {
  throw configurationError('DATA_GRID_FILTER', 'Invalid data grid filter.', { component: 'dataGrid', property: `dataGrid.${path}`, expected });
}

/**
 * Validate an advanced filter model. Conditions on columns `kindOf` does not know are dropped
 * (saved views outlive columns); groups left empty are dropped; returns null when nothing is left.
 * Throws DATA_GRID_FILTER for malformed input (property path only, never values).
 */
export function parseAdvancedFilter(value: unknown, kindOf: (column: string) => DataGridFilterKind | null, path: string): DataGridAdvancedFilter | null {
  let count = 0;
  const group = (v: unknown, at: string, depth: number): DataGridAdvancedGroup | null => {
    if (!isRecord(v)) invalid(at, '{ join, items }');
    if (depth > ADVANCED_MAX_DEPTH) invalid(at, `groups nested at most ${String(ADVANCED_MAX_DEPTH)} deep`);
    const join = v.join === 'and' || v.join === 'or' ? v.join : invalid(`${at}.join`, '"and" | "or"');
    if (!Array.isArray(v.items)) invalid(`${at}.items`, 'array of conditions and groups');
    const items: DataGridAdvancedItem[] = [];
    (v.items as unknown[]).forEach((item, i) => {
      const itemPath = `${at}.items[${String(i)}]`;
      if (!isRecord(item)) invalid(itemPath, 'condition { column, filter } or group { join, items }');
      if ('items' in item) {
        const g = group(item, itemPath, depth + 1);
        if (g) items.push(g);
        return;
      }
      if (typeof item.column !== 'string') invalid(`${itemPath}.column`, 'column id');
      count++;
      if (count > ADVANCED_MAX_CONDITIONS) invalid(path, `at most ${String(ADVANCED_MAX_CONDITIONS)} conditions`);
      const kind = kindOf(item.column);
      if (!kind) return;
      items.push({ column: item.column, filter: parseFilter(item.filter, kind, `${itemPath}.filter`) });
    });
    return items.length === 0 ? null : { join, items };
  };
  if (value === null) return null;
  return group(value, path, 1);
}

// ---- Matching --------------------------------------------------------------------------------

type Test<Row> = (row: Row) => boolean;

/** A predicate for the whole tree, or null when nothing in it filters (incomplete conditions are ignored). */
export function compileAdvancedFilter<Row>(model: DataGridAdvancedFilter, columnFor: (id: string) => FilterColumn<Row> | null, env: FilterEnvironment): Test<Row> | null {
  const item = (it: DataGridAdvancedItem): Test<Row> | null => {
    if (!isAdvancedGroup(it)) {
      const column = columnFor(it.column);
      return column ? compileFilter(column, it.filter, env) : null;
    }
    const tests = it.items.map(item).filter((t): t is Test<Row> => t !== null);
    const [only] = tests;
    if (!only) return null;
    if (tests.length === 1) return only;
    return it.join === 'or' ? (row) => tests.some((t) => t(row)) : (row) => tests.every((t) => t(row));
  };
  return item(model);
}

// ---- Expression language: operators --------------------------------------------------------

/** `#` stands for a day count; other entries are keywords (lower case) or symbols. */
type Pattern = readonly string[];
type Operand = 'none' | 'value' | 'range' | 'count' | 'list' | 'true' | 'false' | 'blank';
interface OperatorSyntax {
  readonly operator: string;
  readonly operand: Operand;
  /** Accepted spellings; the first is the canonical one. */
  readonly patterns: readonly Pattern[];
}
const p = (...phrases: string[]): Pattern[] => phrases.map((s) => s.split(' '));
const blankOps: OperatorSyntax[] = [
  { operator: 'blank', operand: 'none', patterns: p('is blank') },
  { operator: 'notBlank', operand: 'none', patterns: p('is not blank') },
];
const RELATIVE: readonly (readonly [string, string])[] = [
  ['today', 'today'], ['yesterday', 'yesterday'], ['tomorrow', 'tomorrow'],
  ['thisWeek', 'this week'], ['lastWeek', 'last week'], ['nextWeek', 'next week'],
  ['thisMonth', 'this month'], ['lastMonth', 'last month'], ['nextMonth', 'next month'],
  ['thisQuarter', 'this quarter'], ['lastQuarter', 'last quarter'], ['nextQuarter', 'next quarter'],
  ['thisYear', 'this year'], ['lastYear', 'last year'], ['nextYear', 'next year'], ['yearToDate', 'year to date'],
  ['workingDay', 'working day'], ['nonWorkingDay', 'non-working day'], ['holiday', 'holiday'],
];
const SYNTAX: Readonly<Record<DataGridFilterKind, readonly OperatorSyntax[]>> = {
  text: [
    { operator: 'contains', operand: 'value', patterns: p('contains') },
    { operator: 'notContains', operand: 'value', patterns: p('does not contain', 'not contains') },
    { operator: 'equals', operand: 'value', patterns: p('=', 'equals', 'is') },
    { operator: 'notEquals', operand: 'value', patterns: p('!=', '<>', 'does not equal', 'is not') },
    { operator: 'startsWith', operand: 'value', patterns: p('starts with') },
    { operator: 'endsWith', operand: 'value', patterns: p('ends with') },
    ...blankOps,
  ],
  number: [
    { operator: 'equals', operand: 'value', patterns: p('=') },
    { operator: 'notEquals', operand: 'value', patterns: p('!=', '<>') },
    { operator: 'lessThan', operand: 'value', patterns: p('<') },
    { operator: 'lessThanOrEqual', operand: 'value', patterns: p('<=') },
    { operator: 'greaterThan', operand: 'value', patterns: p('>') },
    { operator: 'greaterThanOrEqual', operand: 'value', patterns: p('>=') },
    { operator: 'between', operand: 'range', patterns: p('between') },
    ...blankOps,
  ],
  bigint: [],
  date: [
    { operator: 'on', operand: 'value', patterns: p('=', 'on', 'is') },
    { operator: 'notOn', operand: 'value', patterns: p('!=', '<>', 'not on', 'is not') },
    { operator: 'before', operand: 'value', patterns: p('<', 'before') },
    { operator: 'after', operand: 'value', patterns: p('>', 'after') },
    { operator: 'onOrBefore', operand: 'value', patterns: p('<=', 'on or before') },
    { operator: 'onOrAfter', operand: 'value', patterns: p('>=', 'on or after') },
    { operator: 'between', operand: 'range', patterns: p('between') },
    ...blankOps,
    ...RELATIVE.map(([operator, words]): OperatorSyntax => ({ operator, operand: 'none', patterns: p(`is ${words}`) })),
    { operator: 'lastDays', operand: 'count', patterns: p('is in last # days') },
    { operator: 'nextDays', operand: 'count', patterns: p('is in next # days') },
    { operator: 'lastBusinessDays', operand: 'count', patterns: p('is in last # business days') },
    { operator: 'nextBusinessDays', operand: 'count', patterns: p('is in next # business days') },
  ],
  boolean: [
    { operator: 'true', operand: 'true', patterns: p('is true') },
    { operator: 'false', operand: 'false', patterns: p('is false') },
    { operator: 'blank', operand: 'blank', patterns: p('is blank') },
  ],
  set: [{ operator: 'anyOf', operand: 'list', patterns: p('is any of', 'in') }],
};
const syntaxFor = (kind: DataGridFilterKind): readonly OperatorSyntax[] => SYNTAX[kind === 'bigint' ? 'number' : kind];

// ---- Tokenizer ---------------------------------------------------------------------------------

type TokenType = 'column' | 'string' | 'number' | 'word' | 'symbol' | '(' | ')' | ',';
interface Token {
  readonly type: TokenType;
  /** Source text (columns and strings: the unescaped content). */
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** An unterminated column or string at the end of the input (completion only). */
  readonly open?: boolean;
}

export type AdvancedErrorCode =
  | 'unexpectedCharacter' | 'unterminatedColumn' | 'unterminatedString' | 'expectedColumn' | 'unknownColumn' | 'expectedOperator'
  | 'expectedValue' | 'invalidNumber' | 'invalidDate' | 'invalidCount' | 'expectedAnd' | 'expectedJoin' | 'expectedClose' | 'unexpectedClose' | 'tooDeep' | 'tooLong';

/** A syntax error: code, 0-based source range, and message parameters. */
export interface AdvancedFilterError {
  readonly code: AdvancedErrorCode;
  readonly start: number;
  readonly end: number;
  readonly params: Readonly<Record<string, string | number>>;
}

class SyntaxFailure extends Error {
  constructor(readonly detail: AdvancedFilterError) {
    super(detail.code);
  }
}
function fail(code: AdvancedErrorCode, start: number, end: number, params: Record<string, string | number> = {}): never {
  throw new SyntaxFailure({ code, start, end, params });
}

const SYMBOLS = ['<=', '>=', '!=', '<>', '<', '>', '='];
const WORD = /[A-Za-z][A-Za-z-]*/y;
const NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

function tokenize(source: string, lenient: boolean): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const start = i;
    if (ch === '[' || ch === '"') {
      const close = ch === '[' ? ']' : '"';
      let text = '';
      i++;
      let closed = false;
      while (i < source.length) {
        const c = source.charAt(i);
        if (ch === '"' && c === '\\' && i + 1 < source.length) {
          text += source.charAt(i + 1);
          i += 2;
        } else if (c === close) {
          if (ch === '[' && source.charAt(i + 1) === ']') {
            text += ']';
            i += 2;
          } else {
            i++;
            closed = true;
            break;
          }
        } else {
          text += c;
          i++;
        }
      }
      if (!closed) {
        if (!lenient) fail(ch === '[' ? 'unterminatedColumn' : 'unterminatedString', start, source.length);
        tokens.push({ type: ch === '[' ? 'column' : 'string', text, start, end: source.length, open: true });
        continue;
      }
      tokens.push({ type: ch === '[' ? 'column' : 'string', text, start, end: i });
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',') {
      tokens.push({ type: ch, text: ch, start, end: ++i });
      continue;
    }
    NUMBER.lastIndex = i;
    const number = NUMBER.exec(source);
    if (number) {
      i += number[0].length;
      tokens.push({ type: 'number', text: number[0], start, end: i });
      continue;
    }
    WORD.lastIndex = i;
    const word = WORD.exec(source);
    if (word) {
      i += word[0].length;
      tokens.push({ type: 'word', text: word[0].toLowerCase(), start, end: i });
      continue;
    }
    const symbol = SYMBOLS.find((s) => source.startsWith(s, i));
    if (symbol) {
      i += symbol.length;
      tokens.push({ type: 'symbol', text: symbol, start, end: i });
      continue;
    }
    fail('unexpectedCharacter', start, start + 1, { character: ch });
  }
  return tokens;
}

// ---- Parser ------------------------------------------------------------------------------------

/** Completion mode: what the parser expected where the input ended. */
export type AdvancedExpectation =
  | { readonly kind: 'column' }
  | { readonly kind: 'operator'; readonly column: AdvancedColumn; readonly from: number }
  | { readonly kind: 'value'; readonly column: AdvancedColumn }
  | { readonly kind: 'keyword'; readonly words: readonly string[] }
  | { readonly kind: 'join'; readonly close: boolean };

class Incomplete extends Error {
  constructor(readonly expectation: AdvancedExpectation) {
    super('incomplete');
  }
}

/** Find a column by header (case-insensitive), then by id. */
function resolveColumn(columns: readonly AdvancedColumn[], name: string): AdvancedColumn | undefined {
  const key = name.trim().toLowerCase();
  return columns.find((c) => c.header.trim().toLowerCase() === key) ?? columns.find((c) => c.id === name);
}

class Parser {
  #i = 0;
  #depth = 0;
  #conditions = 0;
  constructor(
    private readonly tokens: readonly Token[],
    private readonly columns: readonly AdvancedColumn[],
    private readonly source: string,
    private readonly completing: boolean,
  ) {}

  parse(): DataGridAdvancedFilter | null {
    if (this.tokens.length === 0) {
      if (this.completing) throw new Incomplete({ kind: 'column' });
      return null;
    }
    const item = this.#or();
    const extra = this.#peek();
    if (extra) {
      if (extra.type === ')') fail('unexpectedClose', extra.start, extra.end);
      fail('expectedJoin', extra.start, extra.end);
    }
    if (this.completing) throw new Incomplete({ kind: 'join', close: false });
    return isAdvancedGroup(item) ? item : { join: 'and', items: [item] };
  }

  #peek(offset = 0): Token | undefined {
    return this.tokens[this.#i + offset];
  }

  #end(): number {
    return this.source.length;
  }

  #isWord(token: Token | undefined, word: string): boolean {
    return token?.type === 'word' && token.text === word;
  }

  #chain(join: DataGridFilterJoin, next: () => DataGridAdvancedItem): DataGridAdvancedItem {
    const items = [next()];
    while (this.#isWord(this.#peek(), join)) {
      this.#i++;
      items.push(next());
    }
    const [first] = items;
    return items.length === 1 && first ? first : { join, items };
  }

  #or(): DataGridAdvancedItem {
    return this.#chain('or', () => this.#and());
  }

  #and(): DataGridAdvancedItem {
    return this.#chain('and', () => this.#primary());
  }

  #primary(): DataGridAdvancedItem {
    const token = this.#peek();
    if (token?.type !== '(') return this.#condition();
    this.#i++;
    this.#depth++;
    if (this.#depth >= ADVANCED_MAX_DEPTH) fail('tooDeep', token.start, token.end, { depth: ADVANCED_MAX_DEPTH });
    const inner = this.#or();
    const close = this.#peek();
    if (!close) {
      if (this.completing) throw new Incomplete({ kind: 'join', close: true });
      fail('expectedClose', this.#end(), this.#end());
    }
    if (close.type !== ')') fail('expectedJoin', close.start, close.end);
    this.#i++;
    this.#depth--;
    // A parenthesized group stays a group (one condition in parentheses is just the condition).
    return inner;
  }

  #condition(): DataGridAdvancedCondition {
    const token = this.#peek();
    if (!token) {
      if (this.completing) throw new Incomplete({ kind: 'column' });
      return fail('expectedColumn', this.#end(), this.#end());
    }
    if (token.type !== 'column') return fail('expectedColumn', token.start, token.end);
    const column = resolveColumn(this.columns, token.text);
    if (!column) return fail('unknownColumn', token.start, token.end, { column: token.text });
    this.#i++;
    this.#conditions++;
    if (this.#conditions > ADVANCED_MAX_CONDITIONS) fail('tooLong', token.start, token.end, { count: ADVANCED_MAX_CONDITIONS });
    const { syntax, count } = this.#operator(column);
    return { column: column.id, filter: this.#operand(column, syntax, count) };
  }

  /** Longest operator pattern for the column's kind at the current token. */
  #operator(column: AdvancedColumn): { syntax: OperatorSyntax; count: number | null } {
    const from = this.#peek()?.start ?? this.#end();
    let best: { syntax: OperatorSyntax; length: number; count: number | null } | null = null;
    let partial = false;
    for (const syntax of syntaxFor(column.kind)) {
      for (const pattern of syntax.patterns) {
        let count: number | null = null;
        let k = 0;
        for (; k < pattern.length; k++) {
          const t = this.#peek(k);
          const part = pattern[k];
          if (!t) {
            partial = true;
            break;
          }
          if (part === '#') {
            if (t.type !== 'number' || !/^\d+$/.test(t.text)) break;
            count = Number(t.text);
          } else if (!((t.type === 'word' || t.type === 'symbol') && t.text === part)) break;
        }
        if (k === pattern.length && (!best || k > best.length)) best = { syntax, length: k, count };
      }
    }
    // While completing, an operator that could still grow (`is` -> `is blank`) is unfinished.
    if (this.completing && partial && (!best || this.#i + best.length >= this.tokens.length)) throw new Incomplete({ kind: 'operator', column, from });
    if (!best) {
      const t = this.#peek();
      return fail('expectedOperator', t?.start ?? this.#end(), t?.end ?? this.#end(), { column: column.header });
    }
    this.#i += best.length;
    if (best.count !== null && !(best.count >= 1 && best.count <= 3660)) {
      const t = this.tokens[this.#i - best.length + 3];
      fail('invalidCount', t?.start ?? from, t?.end ?? from);
    }
    return { syntax: best.syntax, count: best.count };
  }

  #value(column: AdvancedColumn): string | number {
    const token = this.#peek();
    if (!token) {
      if (this.completing) throw new Incomplete({ kind: 'value', column });
      return fail('expectedValue', this.#end(), this.#end(), { column: column.header });
    }
    this.#i++;
    switch (column.kind) {
      case 'number': {
        const n = Number(token.text);
        if (token.type !== 'number' || !Number.isFinite(n)) fail('invalidNumber', token.start, token.end);
        return n;
      }
      case 'bigint':
        if (token.type !== 'number' || !/^-?\d+$/.test(token.text)) fail('invalidNumber', token.start, token.end);
        return token.text;
      case 'date':
        if (token.type !== 'string' || !parsePlainDate(token.text)) fail('invalidDate', token.start, token.end);
        return token.text;
      default:
        if (token.type !== 'string') fail('expectedValue', token.start, token.end, { column: column.header });
        return token.text;
    }
  }

  #keyword(word: string): void {
    const token = this.#peek();
    if (!token && this.completing) throw new Incomplete({ kind: 'keyword', words: [word] });
    if (!token || !(token.type === 'word' && token.text === word) && !(token.type === ',' && word === ',') && !(token.type === ')' && word === ')')) {
      fail(word === 'and' ? 'expectedAnd' : word === ')' ? 'expectedClose' : 'expectedValue', token?.start ?? this.#end(), token?.end ?? this.#end());
    }
    this.#i++;
  }

  #operand(column: AdvancedColumn, syntax: OperatorSyntax, count: number | null): DataGridFilter {
    const kind = column.kind;
    switch (syntax.operand) {
      case 'true':
      case 'false':
      case 'blank':
        return { kind: 'boolean', value: syntax.operand === 'blank' ? null : syntax.operand === 'true' };
      case 'list': {
        const open = this.#peek();
        if (!open && this.completing) throw new Incomplete({ kind: 'keyword', words: ['('] });
        if (open?.type !== '(') return fail('expectedValue', open?.start ?? this.#end(), open?.end ?? this.#end(), { column: column.header });
        this.#i++;
        const values: (string | null)[] = [];
        for (;;) {
          const t = this.#peek();
          if (!t) {
            if (this.completing) throw new Incomplete({ kind: 'value', column });
            return fail('expectedClose', this.#end(), this.#end());
          }
          if (t.type === 'string') values.push(t.text);
          else if (this.#isWord(t, 'blank')) values.push(null);
          else return fail('expectedValue', t.start, t.end, { column: column.header });
          this.#i++;
          const next = this.#peek();
          if (!next && this.completing) throw new Incomplete({ kind: 'keyword', words: [',', ')'] });
          if (next?.type === ',') {
            this.#i++;
            continue;
          }
          this.#keyword(')');
          return { kind: 'set', values };
        }
      }
      case 'none':
        return this.#single(kind, { operator: syntax.operator });
      case 'count':
        return this.#single(kind, { operator: syntax.operator, count: count ?? 1 });
      case 'value':
        return this.#single(kind, { operator: syntax.operator, value: this.#value(column) });
      case 'range': {
        const value = this.#value(column);
        this.#keyword('and');
        return this.#single(kind, { operator: syntax.operator, value, to: this.#value(column) });
      }
    }
  }

  /** A one-condition column filter; the grid validates it with parseFilter. */
  #single(kind: DataGridFilterKind, condition: Record<string, unknown>): DataGridFilter {
    return parseFilter({ kind, conditions: [condition] }, kind, 'advancedFilter');
  }
}

export type AdvancedParseResult = { readonly ok: true; readonly filter: DataGridAdvancedFilter | null } | { readonly ok: false; readonly error: AdvancedFilterError };

/** Parse an expression. An empty expression is `null` (no filter). */
export function parseAdvancedExpression(source: string, columns: readonly AdvancedColumn[]): AdvancedParseResult {
  try {
    return { ok: true, filter: new Parser(tokenize(source, false), columns, source, false).parse() };
  } catch (error) {
    if (error instanceof SyntaxFailure) return { ok: false, error: error.detail };
    throw error;
  }
}

// ---- Formatter ---------------------------------------------------------------------------------

const quote = (s: string): string => `"${s.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
const columnRef = (header: string): string => `[${header.replace(/]/g, ']]')}]`;

/** The canonical expression of a model (round-trips through parseAdvancedExpression). */
export function formatAdvancedExpression(model: DataGridAdvancedFilter | null, columns: readonly AdvancedColumn[]): string {
  if (!model) return '';
  const byId = new Map(columns.map((c) => [c.id, c]));
  const condition = (c: DataGridAdvancedCondition): string => {
    const column = byId.get(c.column);
    // A column filter with several conditions becomes a parenthesized group of one-condition parts.
    const ref = columnRef(column?.header ?? c.column);
    const f = c.filter;
    if (f.kind === 'boolean') return `${ref} is ${f.value === null ? 'blank' : String(f.value)}`;
    if (f.kind === 'set') return `${ref} is any of (${f.values.map((v) => (v === null ? 'blank' : quote(v))).join(', ')})`;
    const kind = f.kind;
    const literal = (v: string | number | undefined): string => (v === undefined ? '' : kind === 'number' || kind === 'bigint' ? String(v) : quote(String(v)));
    const parts = (f.conditions as readonly { operator: string; value?: string | number; to?: string | number; count?: number }[]).map((x) => {
      const syntax = syntaxFor(kind).find((s) => s.operator === x.operator);
      const phrase = (syntax?.patterns[0] ?? [x.operator]).map((w) => (w === '#' ? String(x.count ?? 1) : w)).join(' ');
      if (syntax?.operand === 'range') return `${ref} ${phrase} ${literal(x.value)} and ${literal(x.to)}`;
      if (syntax?.operand === 'value') return `${ref} ${phrase} ${literal(x.value)}`;
      return `${ref} ${phrase}`;
    });
    return parts.length === 1 ? (parts[0] ?? '') : `(${parts.join(` ${f.join ?? 'and'} `)})`;
  };
  const group = (g: DataGridAdvancedGroup, nested: boolean): string => {
    const text = g.items.map((it) => (isAdvancedGroup(it) ? group(it, it.items.length > 1) : condition(it))).join(` ${g.join} `);
    return nested ? `(${text})` : text;
  };
  return group(model, false);
}

// ---- Completion --------------------------------------------------------------------------------

export interface AdvancedSuggestion {
  /** Shown in the list. */
  readonly label: string;
  /** Replaces the source from `from` to the cursor. */
  readonly insert: string;
}

export interface AdvancedSuggestions {
  readonly from: number;
  readonly to: number;
  readonly items: readonly AdvancedSuggestion[];
}

/** Operator phrases offered for a column kind (canonical spelling first, then word forms). */
export function operatorPhrases(kind: DataGridFilterKind): string[] {
  const phrases: string[] = [];
  for (const s of syntaxFor(kind)) for (const pattern of s.patterns) phrases.push(pattern.map((w) => (w === '#' ? '7' : w)).join(' '));
  return phrases;
}

/**
 * Suggestions for the cursor position: column headers, operators of the column's kind, set
 * values, or the next keyword. `values` lists a set column's values. Null when nothing fits.
 */
export function suggestAdvanced(source: string, cursor: number, columns: readonly AdvancedColumn[], values: (column: string) => readonly (string | null)[], limit = 50): AdvancedSuggestions | null {
  const before = source.slice(0, cursor);
  let tokens: Token[];
  try {
    tokens = tokenize(before, true);
  } catch {
    return null;
  }
  // The token being typed (a word, or an unterminated column or string) is the prefix.
  const last = tokens.at(-1);
  const typing = last?.end === before.length && (last.open === true || last.type === 'word' || (last.type === 'symbol' && !/\s$/.test(before))) ? last : undefined;
  const complete = typing ? tokens.slice(0, -1) : tokens;
  let expectation: AdvancedExpectation;
  try {
    new Parser(complete, columns, before.slice(0, typing?.start ?? before.length), true).parse();
    return null;
  } catch (error) {
    if (error instanceof Incomplete) expectation = error.expectation;
    else return null;
  }
  const from = expectation.kind === 'operator' ? expectation.from : (typing?.start ?? cursor);
  const typed = before.slice(from).replace(/\s+/g, ' ').trimStart().toLowerCase();
  const prefix = typing?.open ? typing.text.toLowerCase() : typed;
  let items: AdvancedSuggestion[] = [];
  switch (expectation.kind) {
    case 'column':
      items = columns.filter((c) => c.header.toLowerCase().includes(typing?.type === 'column' ? prefix : typed)).map((c) => ({ label: c.header, insert: `${columnRef(c.header)} ` }));
      break;
    case 'operator':
      items = operatorPhrases(expectation.column.kind)
        .filter((phrase) => phrase.startsWith(typed))
        .map((phrase) => ({ label: phrase, insert: `${phrase} ` }));
      break;
    case 'value': {
      if (expectation.column.kind !== 'set') return null;
      const list = values(expectation.column.id);
      const out: AdvancedSuggestion[] = [];
      for (const v of list) {
        // Inside a quoted string only values fit (blanks are the bare keyword).
        if (v === null && typing?.type === 'string') continue;
        const label = v ?? 'blank';
        if (label.toLowerCase().includes(typing?.type === 'string' ? prefix : typed)) out.push({ label, insert: v === null ? 'blank' : quote(v) });
        if (out.length >= limit) break;
      }
      items = out;
      break;
    }
    case 'keyword':
      items = expectation.words.filter((w) => w.startsWith(typed)).map((w) => ({ label: w, insert: w === ',' ? ', ' : `${w} ` }));
      break;
    case 'join':
      items = ['and', 'or', ...(expectation.close ? [')'] : [])].filter((w) => w.startsWith(typed)).map((w) => ({ label: w, insert: `${w} ` }));
      break;
  }
  return items.length === 0 ? null : { from, to: cursor, items: items.slice(0, limit) };
}
