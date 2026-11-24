/**
 * The formula function library (R11-18, G9a). Spreadsheet semantics where they are well defined:
 * ranges skip text and blanks in numeric aggregates, direct arguments are coerced, errors
 * propagate. IF, IFS, IFERROR, IFNA, SWITCH, and CHOOSE are evaluated lazily by the engine.
 */
import { addDays, addMonths, daysInMonth, plainDate, type PlainDate } from '@absoluteui/core';
import { ceil as ceilPlaces, round as roundPlaces, trunc as truncPlaces } from '@absoluteui/helpers/number';
import { isPlainDate } from '../../data-table/model.js';
import { compareScalars, dateText, dateToSerial, formulaError, isFormulaError, isRange, numberText, toBoolean, toDate, toNumber, toText, type FormulaError, type FormulaFunction, type FormulaValue, type FunctionContext, type RangeValue, type Scalar } from './engine.js';

const VALUE = (): FormulaError => formulaError('#VALUE!');
const NA = (): FormulaError => formulaError('#N/A');
const NUM = (): FormulaError => formulaError('#NUM!');

/** Every cell of a value (a scalar is one cell), row by row. */
function* cells(v: FormulaValue): Generator<Scalar> {
  if (!isRange(v)) {
    yield v;
    return;
  }
  for (let r = 0; r < v.rows; r++) for (let c = 0; c < v.columns; c++) yield v.at(r, c);
}

/** Numbers for aggregates: from ranges only numbers and dates count; direct arguments are coerced. */
function numbers(args: readonly FormulaValue[], countOnly = false): number[] | FormulaError {
  const out: number[] = [];
  for (const a of args) {
    if (isRange(a)) {
      for (const v of cells(a)) {
        if (isFormulaError(v)) return v;
        if (typeof v === 'number') out.push(v);
        else if (isPlainDate(v)) out.push(dateToSerial(v));
      }
      continue;
    }
    if (isFormulaError(a)) return a;
    if (a === null || (a === '' && countOnly)) continue;
    const n = toNumber(a);
    if (isFormulaError(n)) {
      if (countOnly) continue;
      return n;
    }
    out.push(n);
  }
  return out;
}

const one = (args: readonly FormulaValue[], i: number, ctx: FunctionContext): Scalar => {
  const a = args[i];
  return a === undefined ? null : ctx.scalar(a);
};

function num(args: readonly FormulaValue[], i: number, ctx: FunctionContext, fallback?: number): number | FormulaError {
  if (args[i] === undefined || (fallback !== undefined && one(args, i, ctx) === '')) {
    return fallback ?? VALUE();
  }
  return toNumber(one(args, i, ctx));
}

function text(args: readonly FormulaValue[], i: number, ctx: FunctionContext): string | FormulaError {
  return toText(one(args, i, ctx));
}

const arity = (fn: FormulaFunction, min: number, max: number): FormulaFunction => (args, ctx) => (args.length < min || args.length > max ? VALUE() : fn(args, ctx));

/** A numeric function of numeric arguments. */
function math(min: number, max: number, f: (...n: number[]) => number | FormulaError): FormulaFunction {
  return arity((args, ctx) => {
    const ns: number[] = [];
    for (let i = 0; i < args.length; i++) {
      const n = num(args, i, ctx);
      if (isFormulaError(n)) return n;
      ns.push(n);
    }
    const r = f(...ns);
    return typeof r === 'number' && !Number.isFinite(r) ? NUM() : r;
  }, min, max);
}

/** Round with helpers that throw on bad places: errors become #NUM!. */
const safe = (f: () => number): number | FormulaError => {
  try {
    return f();
  } catch {
    return NUM();
  }
};

// ---- Criteria (SUMIF, COUNTIF, ...) --------------------------------------------------------------------

type Criterion = (v: Scalar) => boolean;

function wildcard(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (c === '~' && i + 1 < pattern.length) {
      re += pattern.charAt(++i).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
    } else if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else re += c.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'is');
}

function criterion(c: Scalar): Criterion | FormulaError {
  if (isFormulaError(c)) return c;
  if (typeof c !== 'string') return (v) => v !== null && compareScalars(v, c) === 0 && (typeof v === typeof c || (typeof v === 'number' && isPlainDate(c)) || (isPlainDate(v) && typeof c === 'number') || (isPlainDate(v) && isPlainDate(c)));
  const m = /^(<>|>=|<=|=|<|>)?([\s\S]*)$/.exec(c);
  const op = m?.[1] ?? '=';
  const operand = m?.[2] ?? '';
  const n = operand.trim() !== '' && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(operand.trim()) ? Number(operand) : null;
  if (n !== null) {
    const test = (v: Scalar): boolean | null => {
      const x = typeof v === 'number' ? v : isPlainDate(v) ? dateToSerial(v) : null;
      if (x === null) return null;
      return op === '=' ? x === n : op === '<>' ? x !== n : op === '<' ? x < n : op === '>' ? x > n : op === '<=' ? x <= n : x >= n;
    };
    return (v) => test(v) ?? op === '<>';
  }
  if (op === '=' || op === '<>') {
    const empty = operand === '';
    const re = wildcard(operand);
    const eq = (v: Scalar): boolean => (empty ? v === null || v === '' : typeof v === 'string' && re.test(v));
    return op === '=' ? eq : (v) => !eq(v);
  }
  return (v) => {
    if (typeof v !== 'string') return false;
    const d = compareScalars(v, operand);
    return op === '<' ? d < 0 : op === '>' ? d > 0 : op === '<=' ? d <= 0 : d >= 0;
  };
}

/** Pairs of ranges and criteria: the cell positions matching all of them. */
function matching(pairs: readonly [FormulaValue | undefined, FormulaValue | undefined][], ctx: FunctionContext): { rows: number; columns: number; hit: (r: number, c: number) => boolean } | FormulaError {
  let shape: { rows: number; columns: number } | null = null;
  const tests: { range: RangeValue | null; scalar: Scalar; test: Criterion }[] = [];
  for (const [range, crit] of pairs) {
    if (range === undefined || crit === undefined) return VALUE();
    const t = criterion(ctx.scalar(crit));
    if (isFormulaError(t)) return t;
    const r = isRange(range) ? range : null;
    const rows = r?.rows ?? 1;
    const columns = r?.columns ?? 1;
    if (shape && (shape.rows !== rows || shape.columns !== columns)) return VALUE();
    shape = { rows, columns };
    tests.push({ range: r, scalar: r ? null : ctx.scalar(range), test: t });
  }
  if (!shape) return VALUE();
  return { ...shape, hit: (row, column) => tests.every((t) => t.test(t.range ? t.range.at(row, column) : t.scalar)) };
}

function cellAt(v: FormulaValue, r: number, c: number): Scalar {
  return isRange(v) ? v.at(r, c) : v;
}

// ---- Lookups -------------------------------------------------------------------------------------------

/** Position of a value in a one-row or one-column range: exact (0, with wildcards for text), next smaller (1 / -1), next larger. */
function find(value: Scalar, list: FormulaValue, mode: number, reverse = false): number | FormulaError {
  const r = isRange(list) ? list : null;
  const length = r ? (r.rows === 1 ? r.columns : r.rows) : 1;
  if (r && r.rows !== 1 && r.columns !== 1) return NA();
  const at = (i: number): Scalar => (r ? (r.rows === 1 ? r.at(0, i) : r.at(i, 0)) : (list as Scalar));
  if (isFormulaError(value)) return value;
  const exact = typeof value === 'string' && /[*?~]/.test(value) ? wildcard(value) : null;
  let best = -1;
  for (let k = 0; k < length; k++) {
    const i = reverse ? length - 1 - k : k;
    const v = at(i);
    if (mode === 0 || mode === 2) {
      if (exact ? typeof v === 'string' && exact.test(v) : v !== null && compareScalars(v, value) === 0 && (typeof v === 'string') === (typeof value === 'string')) return i;
      continue;
    }
    if (v === null || typeof v !== typeof value) {
      if (!(typeof v === 'number' && isPlainDate(value)) && !(isPlainDate(v) && typeof value === 'number')) continue;
    }
    const d = compareScalars(v, value);
    if (d === 0) return i;
    if (mode === 1 || mode === -1) {
      // Next smaller (-1 in XLOOKUP terms, 1 in MATCH on sorted data): the largest value below.
      const below = mode === 1 ? d < 0 : d > 0;
      if (below && (best < 0 || compareScalars(v, at(best)) * mode > 0)) best = i;
    }
  }
  return best >= 0 ? best : NA();
}

// ---- Text formats for TEXT() ---------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatValue(v: Scalar, format: string): string | FormulaError {
  if (isFormulaError(v)) return v;
  const f = format.trim();
  if (/[ymd]/i.test(f) && !/[0#]/.test(f)) {
    const d = toDate(v);
    if (isFormulaError(d)) return d;
    return f.replace(/yyyy|yy|mmmm|mmm|mm|m|dd|d/gi, (t) => {
      switch (t.toLowerCase()) {
        case 'yyyy':
          return String(d.year).padStart(4, '0');
        case 'yy':
          return String(d.year % 100).padStart(2, '0');
        case 'mmmm':
          return MONTHS[d.month - 1] ?? '';
        case 'mmm':
          return (MONTHS[d.month - 1] ?? '').slice(0, 3);
        case 'mm':
          return String(d.month).padStart(2, '0');
        case 'm':
          return String(d.month);
        case 'dd':
          return String(d.day).padStart(2, '0');
        default:
          return String(d.day);
      }
    });
  }
  const m = /^([^0#,.%]*)([#0,]*0|#,##0|#)(?:\.(0+))?(%?)([^0#]*)$/.exec(f);
  if (!m) return VALUE();
  let n = toNumber(v);
  if (isFormulaError(n)) return n;
  const percent = m[4] === '%';
  if (percent) n *= 100;
  const decimals = m[3]?.length ?? 0;
  const grouped = (m[2] ?? '').includes(',');
  const body = roundPlaces(Math.abs(n), decimals).toFixed(decimals);
  const [int = '0', frac] = body.split('.');
  const intText = grouped ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  return `${n < 0 && Number(body) !== 0 ? '-' : ''}${m[1] ?? ''}${intText}${frac ? `.${frac}` : ''}${percent ? '%' : ''}${m[5] ?? ''}`;
}

// ---- Business days ---------------------------------------------------------------------------------------

function holidaySet(arg: FormulaValue | undefined): Set<number> | FormulaError {
  const out = new Set<number>();
  if (arg === undefined) return out;
  for (const v of cells(arg)) {
    if (v === null || v === '') continue;
    const d = toDate(v);
    if (isFormulaError(d)) return d;
    out.add(dateToSerial(d));
  }
  return out;
}

function workingDay(d: PlainDate, ctx: FunctionContext, holidays: ReadonlySet<number>): boolean {
  if (holidays.has(dateToSerial(d))) return false;
  if (ctx.calendar) return ctx.calendar.isWorkingDay(d);
  const w = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  return w !== 0 && w !== 6;
}

// ---- The library ---------------------------------------------------------------------------------------

const sum = (ns: readonly number[]): number => ns.reduce((a, b) => a + b, 0);

export const BUILTIN_FUNCTIONS: ReadonlyMap<string, FormulaFunction> = new Map<string, FormulaFunction>([
  // Math and aggregates.
  ['SUM', (args) => {
    const ns = numbers(args);
    return isFormulaError(ns) ? ns : sum(ns);
  }],
  ['AVERAGE', (args) => {
    const ns = numbers(args);
    if (isFormulaError(ns)) return ns;
    return ns.length === 0 ? formulaError('#DIV/0!') : sum(ns) / ns.length;
  }],
  ['MIN', (args) => {
    const ns = numbers(args);
    return isFormulaError(ns) ? ns : ns.length === 0 ? 0 : Math.min(...ns);
  }],
  ['MAX', (args) => {
    const ns = numbers(args);
    return isFormulaError(ns) ? ns : ns.length === 0 ? 0 : Math.max(...ns);
  }],
  ['PRODUCT', (args) => {
    const ns = numbers(args);
    return isFormulaError(ns) ? ns : ns.length === 0 ? 0 : ns.reduce((a, b) => a * b, 1);
  }],
  ['COUNT', (args) => {
    let n = 0;
    for (const a of args) for (const v of cells(a)) if (typeof v === 'number' || isPlainDate(v) || (!isRange(a) && typeof v !== 'object' && !isFormulaError(toNumber(v)) && v !== '')) n++;
    return n;
  }],
  ['COUNTA', (args) => {
    let n = 0;
    for (const a of args) for (const v of cells(a)) if (v !== null && !(isRange(a) && v === '')) n++;
    return n;
  }],
  ['COUNTBLANK', arity((args) => {
    let n = 0;
    for (const v of cells(args[0] ?? null)) if (v === null || v === '') n++;
    return n;
  }, 1, 1)],
  ['ABS', math(1, 1, (x = 0) => Math.abs(x))],
  ['SIGN', math(1, 1, (x = 0) => Math.sign(x))],
  ['INT', math(1, 1, (x = 0) => Math.floor(x))],
  ['SQRT', math(1, 1, (x = 0) => (x < 0 ? NUM() : Math.sqrt(x)))],
  ['POWER', math(2, 2, (x = 0, y = 0) => (x === 0 && y === 0 ? NUM() : x ** y))],
  ['MOD', math(2, 2, (x = 0, y = 0) => (y === 0 ? formulaError('#DIV/0!') : x - y * Math.floor(x / y)))],
  ['ROUND', math(1, 2, (x = 0, p = 0) => safe(() => roundPlaces(x, Math.trunc(p))))],
  ['ROUNDUP', math(1, 2, (x = 0, p = 0) => safe(() => Math.sign(x) * ceilPlaces(Math.abs(x), Math.trunc(p))))],
  ['ROUNDDOWN', math(1, 2, (x = 0, p = 0) => safe(() => truncPlaces(x, Math.trunc(p))))],
  // Conditional aggregates.
  ['SUMIF', arity((args, ctx) => {
    const target = args[2] ?? args[0];
    const m = matching([[args[0], args[1]]], ctx);
    if (isFormulaError(m)) return m;
    let s = 0;
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.columns; c++) if (m.hit(r, c)) {
      const v = target ? cellAt(target, r, c) : null;
      if (isFormulaError(v)) return v;
      if (typeof v === 'number') s += v;
    }
    return s;
  }, 2, 3)],
  ['SUMIFS', (args, ctx) => {
    if (args.length < 3 || args.length % 2 === 0) return VALUE();
    const pairs: [FormulaValue | undefined, FormulaValue | undefined][] = [];
    for (let i = 1; i < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
    const m = matching(pairs, ctx);
    if (isFormulaError(m)) return m;
    let s = 0;
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.columns; c++) if (m.hit(r, c)) {
      const v = cellAt(args[0] ?? null, r, c);
      if (isFormulaError(v)) return v;
      if (typeof v === 'number') s += v;
    }
    return s;
  }],
  ['COUNTIF', arity((args, ctx) => {
    const m = matching([[args[0], args[1]]], ctx);
    if (isFormulaError(m)) return m;
    let n = 0;
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.columns; c++) if (m.hit(r, c)) n++;
    return n;
  }, 2, 2)],
  ['COUNTIFS', (args, ctx) => {
    if (args.length < 2 || args.length % 2 !== 0) return VALUE();
    const pairs: [FormulaValue | undefined, FormulaValue | undefined][] = [];
    for (let i = 0; i < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
    const m = matching(pairs, ctx);
    if (isFormulaError(m)) return m;
    let n = 0;
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.columns; c++) if (m.hit(r, c)) n++;
    return n;
  }],
  ['AVERAGEIF', arity((args, ctx) => {
    const target = args[2] ?? args[0];
    const m = matching([[args[0], args[1]]], ctx);
    if (isFormulaError(m)) return m;
    let s = 0;
    let n = 0;
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.columns; c++) if (m.hit(r, c)) {
      const v = target ? cellAt(target, r, c) : null;
      if (isFormulaError(v)) return v;
      if (typeof v === 'number') {
        s += v;
        n++;
      }
    }
    return n === 0 ? formulaError('#DIV/0!') : s / n;
  }, 2, 3)],
  // Logic.
  ['AND', (args) => logic(args, (bs) => bs.every(Boolean))],
  ['OR', (args) => logic(args, (bs) => bs.some(Boolean))],
  ['XOR', (args) => logic(args, (bs) => bs.filter(Boolean).length % 2 === 1)],
  ['NOT', arity((args, ctx) => {
    const b = toBoolean(one(args, 0, ctx));
    return isFormulaError(b) ? b : !b;
  }, 1, 1)],
  ['TRUE', arity(() => true, 0, 0)],
  ['FALSE', arity(() => false, 0, 0)],
  ['ISBLANK', arity((args, ctx) => one(args, 0, ctx) === null, 1, 1)],
  ['ISNUMBER', arity((args, ctx) => typeof one(args, 0, ctx) === 'number', 1, 1)],
  ['ISTEXT', arity((args, ctx) => typeof one(args, 0, ctx) === 'string', 1, 1)],
  ['ISERROR', arity((args, ctx) => isFormulaError(one(args, 0, ctx)), 1, 1)],
  ['NA', arity(() => NA(), 0, 0)],
  // Text.
  ['CONCAT', (args) => {
    let out = '';
    for (const a of args) for (const v of cells(a)) {
      const t = toText(v);
      if (isFormulaError(t)) return t;
      out += t;
    }
    return out.length > 32_767 ? VALUE() : out;
  }],
  ['TEXTJOIN', (args, ctx) => {
    if (args.length < 3) return VALUE();
    const sep = text(args, 0, ctx);
    const skip = toBoolean(one(args, 1, ctx));
    if (isFormulaError(sep)) return sep;
    if (isFormulaError(skip)) return skip;
    const parts: string[] = [];
    for (const a of args.slice(2)) for (const v of cells(a)) {
      const t = toText(v);
      if (isFormulaError(t)) return t;
      if (!(skip && t === '')) parts.push(t);
    }
    const out = parts.join(sep);
    return out.length > 32_767 ? VALUE() : out;
  }],
  ['LEN', arity((args, ctx) => {
    const t = text(args, 0, ctx);
    return isFormulaError(t) ? t : t.length;
  }, 1, 1)],
  ['LEFT', arity((args, ctx) => slice(args, ctx, (t, n) => t.slice(0, n)), 1, 2)],
  ['RIGHT', arity((args, ctx) => slice(args, ctx, (t, n) => (n === 0 ? '' : t.slice(-n))), 1, 2)],
  ['MID', arity((args, ctx) => {
    const t = text(args, 0, ctx);
    const s = num(args, 1, ctx);
    const n = num(args, 2, ctx);
    if (isFormulaError(t)) return t;
    if (isFormulaError(s)) return s;
    if (isFormulaError(n)) return n;
    if (s < 1 || n < 0) return VALUE();
    return t.slice(Math.trunc(s) - 1, Math.trunc(s) - 1 + Math.trunc(n));
  }, 3, 3)],
  ['UPPER', arity((args, ctx) => mapText(args, ctx, (t) => t.toUpperCase()), 1, 1)],
  ['LOWER', arity((args, ctx) => mapText(args, ctx, (t) => t.toLowerCase()), 1, 1)],
  ['PROPER', arity((args, ctx) => mapText(args, ctx, (t) => t.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())), 1, 1)],
  ['TRIM', arity((args, ctx) => mapText(args, ctx, (t) => t.trim().replace(/ {2,}/g, ' ')), 1, 1)],
  ['REPT', arity((args, ctx) => {
    const t = text(args, 0, ctx);
    const n = num(args, 1, ctx);
    if (isFormulaError(t)) return t;
    if (isFormulaError(n)) return n;
    if (n < 0 || t.length * Math.trunc(n) > 32_767) return VALUE();
    return t.repeat(Math.trunc(n));
  }, 2, 2)],
  ['FIND', arity((args, ctx) => position(args, ctx, false), 2, 3)],
  ['SEARCH', arity((args, ctx) => position(args, ctx, true), 2, 3)],
  ['SUBSTITUTE', arity((args, ctx) => {
    const t = text(args, 0, ctx);
    const from = text(args, 1, ctx);
    const to = text(args, 2, ctx);
    if (isFormulaError(t)) return t;
    if (isFormulaError(from)) return from;
    if (isFormulaError(to)) return to;
    if (from === '') return t;
    if (args.length < 4) return t.split(from).join(to);
    const k = num(args, 3, ctx);
    if (isFormulaError(k)) return k;
    if (k < 1) return VALUE();
    let i = -1;
    for (let n = 0; n < Math.trunc(k); n++) {
      i = t.indexOf(from, i + 1);
      if (i < 0) return t;
    }
    return t.slice(0, i) + to + t.slice(i + from.length);
  }, 3, 4)],
  ['VALUE', arity((args, ctx) => {
    const v = one(args, 0, ctx);
    return typeof v === 'string' && v.trim() === '' ? VALUE() : toNumber(v);
  }, 1, 1)],
  ['TEXT', arity((args, ctx) => {
    const f = text(args, 1, ctx);
    return isFormulaError(f) ? f : formatValue(one(args, 0, ctx), f);
  }, 2, 2)],
  // Dates.
  ['TODAY', arity((_args, ctx) => ctx.today(), 0, 0)],
  ['DATE', dateFn()],
  ['YEAR', arity((args, ctx) => datePart(args, ctx, (d) => d.year), 1, 1)],
  ['MONTH', arity((args, ctx) => datePart(args, ctx, (d) => d.month), 1, 1)],
  ['DAY', arity((args, ctx) => datePart(args, ctx, (d) => d.day), 1, 1)],
  ['WEEKDAY', arity((args, ctx) => {
    const d = toDate(one(args, 0, ctx));
    if (isFormulaError(d)) return d;
    const type = num(args, 1, ctx, 1);
    if (isFormulaError(type)) return type;
    const w = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
    return type === 1 ? w + 1 : type === 2 ? ((w + 6) % 7) + 1 : type === 3 ? (w + 6) % 7 : NUM();
  }, 1, 2)],
  ['DAYS', arity((args, ctx) => {
    const end = toDate(one(args, 0, ctx));
    const start = toDate(one(args, 1, ctx));
    if (isFormulaError(end)) return end;
    if (isFormulaError(start)) return start;
    return dateToSerial(end) - dateToSerial(start);
  }, 2, 2)],
  ['EDATE', arity((args, ctx) => {
    const d = toDate(one(args, 0, ctx));
    const n = num(args, 1, ctx);
    if (isFormulaError(d)) return d;
    if (isFormulaError(n)) return n;
    return addMonths(d, Math.trunc(n));
  }, 2, 2)],
  ['EOMONTH', arity((args, ctx) => {
    const d = toDate(one(args, 0, ctx));
    const n = num(args, 1, ctx);
    if (isFormulaError(d)) return d;
    if (isFormulaError(n)) return n;
    const m = addMonths(plainDate(d.year, d.month, 1), Math.trunc(n));
    return plainDate(m.year, m.month, daysInMonth(m.year, m.month));
  }, 2, 2)],
  ['NETWORKDAYS', arity((args, ctx) => {
    const a = toDate(one(args, 0, ctx));
    const b = toDate(one(args, 1, ctx));
    if (isFormulaError(a)) return a;
    if (isFormulaError(b)) return b;
    const holidays = holidaySet(args[2]);
    if (isFormulaError(holidays)) return holidays;
    const from = dateToSerial(a);
    const to = dateToSerial(b);
    const sign = to >= from ? 1 : -1;
    if (Math.abs(to - from) > 100_000) return NUM();
    let n = 0;
    for (let s = from, d = a; sign > 0 ? s <= to : s >= to; s += sign, d = addDays(d, sign)) if (workingDay(d, ctx, holidays)) n++;
    return sign * n;
  }, 2, 3)],
  ['WORKDAY', arity((args, ctx) => {
    const start = toDate(one(args, 0, ctx));
    const days = num(args, 1, ctx);
    if (isFormulaError(start)) return start;
    if (isFormulaError(days)) return days;
    const holidays = holidaySet(args[2]);
    if (isFormulaError(holidays)) return holidays;
    let left = Math.trunc(days);
    if (Math.abs(left) > 100_000) return NUM();
    const step = left < 0 ? -1 : 1;
    let d = start;
    while (left !== 0) {
      d = addDays(d, step);
      if (workingDay(d, ctx, holidays)) left -= step;
    }
    return d;
  }, 2, 3)],
  // Lookups.
  ['MATCH', arity((args, ctx) => {
    const mode = num(args, 2, ctx, 1);
    if (isFormulaError(mode)) return mode;
    if (mode !== 0 && mode !== 1 && mode !== -1) return NA();
    const i = find(one(args, 0, ctx), args[1] ?? null, mode === 1 ? 1 : mode === -1 ? -1 : 0);
    return isFormulaError(i) ? i : i + 1;
  }, 2, 3)],
  ['INDEX', arity((args, ctx) => {
    const r = args[0];
    if (r === undefined) return VALUE();
    const row = num(args, 1, ctx);
    const column = num(args, 2, ctx, 1);
    if (isFormulaError(row)) return row;
    if (isFormulaError(column)) return column;
    const rows = isRange(r) ? r.rows : 1;
    const cols = isRange(r) ? r.columns : 1;
    // A one-row range takes the position as a column.
    const [ri, ci] = rows === 1 && args.length === 2 ? [1, Math.trunc(row)] : [Math.trunc(row), Math.trunc(column)];
    if (ri < 1 || ci < 1 || ri > rows || ci > cols) return formulaError('#REF!');
    return cellAt(r, ri - 1, ci - 1);
  }, 2, 3)],
  ['XLOOKUP', arity((args, ctx) => {
    const lookup = args[1];
    const result = args[2];
    if (lookup === undefined || result === undefined) return VALUE();
    const match = num(args, 4, ctx, 0);
    const search = num(args, 5, ctx, 1);
    if (isFormulaError(match)) return match;
    if (isFormulaError(search)) return search;
    if (![0, -1, 1, 2].includes(match) || (search !== 1 && search !== -1)) return VALUE();
    const i = find(one(args, 0, ctx), lookup, match === -1 ? 1 : match === 1 ? -1 : match, search === -1);
    if (isFormulaError(i)) return args.length > 3 ? one(args, 3, ctx) : i;
    if (!isRange(result)) return result;
    const vertical = isRange(lookup) ? lookup.columns === 1 : true;
    return vertical ? result.at(i, 0) : result.at(0, i);
  }, 3, 6)],
  ['VLOOKUP', arity((args, ctx) => {
    const table = args[1];
    if (table === undefined || !isRange(table)) return VALUE();
    const column = num(args, 2, ctx);
    if (isFormulaError(column)) return column;
    const approx = args.length > 3 ? toBoolean(one(args, 3, ctx)) : true;
    if (isFormulaError(approx)) return approx;
    if (column < 1 || column > table.columns) return formulaError('#REF!');
    const first: RangeValue = { ...table, columns: 1, at: (r) => table.at(r, 0) };
    const i = find(one(args, 0, ctx), first, approx ? 1 : 0);
    return isFormulaError(i) ? i : table.at(i, Math.trunc(column) - 1);
  }, 3, 4)],
]);

// DATE normalizes months and days past their ranges (DATE(2026, 13, 1) is 2027-01-01).
function dateFn(): FormulaFunction {
  return arity((args, ctx) => {
  const y = num(args, 0, ctx);
  const m = num(args, 1, ctx);
  const d = num(args, 2, ctx);
  if (isFormulaError(y)) return y;
  if (isFormulaError(m)) return m;
  if (isFormulaError(d)) return d;
  const year = Math.trunc(y) < 1900 ? Math.trunc(y) + 1900 : Math.trunc(y);
  if (year > 9999) return NUM();
  const t = new Date(Date.UTC(year, Math.trunc(m) - 1, Math.trunc(d)));
  return plainDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }, 3, 3);
}

function logic(args: readonly FormulaValue[], f: (bs: boolean[]) => boolean): Scalar {
  const bs: boolean[] = [];
  for (const a of args) for (const v of cells(a)) {
    if (isRange(a) && (v === null || typeof v === 'string')) continue;
    const b = toBoolean(v);
    if (isFormulaError(b)) return b;
    bs.push(b);
  }
  return bs.length === 0 ? VALUE() : f(bs);
}

function slice(args: readonly FormulaValue[], ctx: FunctionContext, f: (t: string, n: number) => string): Scalar {
  const t = text(args, 0, ctx);
  const n = num(args, 1, ctx, 1);
  if (isFormulaError(t)) return t;
  if (isFormulaError(n)) return n;
  if (n < 0) return VALUE();
  return f(t, Math.trunc(n));
}

function mapText(args: readonly FormulaValue[], ctx: FunctionContext, f: (t: string) => string): Scalar {
  const t = text(args, 0, ctx);
  return isFormulaError(t) ? t : f(t);
}

function position(args: readonly FormulaValue[], ctx: FunctionContext, search: boolean): Scalar {
  const needle = text(args, 0, ctx);
  const hay = text(args, 1, ctx);
  const start = num(args, 2, ctx, 1);
  if (isFormulaError(needle)) return needle;
  if (isFormulaError(hay)) return hay;
  if (isFormulaError(start)) return start;
  if (start < 1 || start > hay.length + 1) return VALUE();
  const from = Math.trunc(start) - 1;
  if (!search) {
    const i = hay.indexOf(needle, from);
    return i < 0 ? VALUE() : i + 1;
  }
  const re = wildcard(`*${needle}*`);
  for (let i = from; i <= hay.length; i++) {
    if (wildcard(`${needle}*`).test(hay.slice(i))) return i + 1;
    if (!re.test(hay.slice(i))) break;
  }
  return VALUE();
}

function datePart(args: readonly FormulaValue[], ctx: FunctionContext, f: (d: PlainDate) => number): Scalar {
  const d = toDate(one(args, 0, ctx));
  return isFormulaError(d) ? d : f(d);
}

/** Function names: letters, digits, `_`, and `.`, starting with a letter; at most 64 characters. */
export const FUNCTION_NAME = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;

export { dateText, numberText };

/** Argument hints for the formula editor (brackets mark optional arguments). */
export const FUNCTION_SIGNATURES: ReadonlyMap<string, string> = new Map([
  ['SUM', 'SUM(number1, [number2], ...)'],
  ['AVERAGE', 'AVERAGE(number1, [number2], ...)'],
  ['MIN', 'MIN(number1, [number2], ...)'],
  ['MAX', 'MAX(number1, [number2], ...)'],
  ['PRODUCT', 'PRODUCT(number1, [number2], ...)'],
  ['COUNT', 'COUNT(value1, [value2], ...)'],
  ['COUNTA', 'COUNTA(value1, [value2], ...)'],
  ['COUNTBLANK', 'COUNTBLANK(range)'],
  ['ABS', 'ABS(number)'],
  ['SIGN', 'SIGN(number)'],
  ['INT', 'INT(number)'],
  ['SQRT', 'SQRT(number)'],
  ['POWER', 'POWER(number, power)'],
  ['MOD', 'MOD(number, divisor)'],
  ['ROUND', 'ROUND(number, [digits])'],
  ['ROUNDUP', 'ROUNDUP(number, [digits])'],
  ['ROUNDDOWN', 'ROUNDDOWN(number, [digits])'],
  ['SUMIF', 'SUMIF(range, criteria, [sum_range])'],
  ['SUMIFS', 'SUMIFS(sum_range, range1, criteria1, ...)'],
  ['COUNTIF', 'COUNTIF(range, criteria)'],
  ['COUNTIFS', 'COUNTIFS(range1, criteria1, ...)'],
  ['AVERAGEIF', 'AVERAGEIF(range, criteria, [average_range])'],
  ['IF', 'IF(condition, value_if_true, [value_if_false])'],
  ['IFS', 'IFS(condition1, value1, ...)'],
  ['IFERROR', 'IFERROR(value, value_if_error)'],
  ['IFNA', 'IFNA(value, value_if_na)'],
  ['SWITCH', 'SWITCH(value, case1, result1, ..., [default])'],
  ['CHOOSE', 'CHOOSE(index, value1, value2, ...)'],
  ['AND', 'AND(logical1, [logical2], ...)'],
  ['OR', 'OR(logical1, [logical2], ...)'],
  ['XOR', 'XOR(logical1, [logical2], ...)'],
  ['NOT', 'NOT(logical)'],
  ['TRUE', 'TRUE()'],
  ['FALSE', 'FALSE()'],
  ['ISBLANK', 'ISBLANK(value)'],
  ['ISNUMBER', 'ISNUMBER(value)'],
  ['ISTEXT', 'ISTEXT(value)'],
  ['ISERROR', 'ISERROR(value)'],
  ['NA', 'NA()'],
  ['CONCAT', 'CONCAT(text1, [text2], ...)'],
  ['TEXTJOIN', 'TEXTJOIN(delimiter, ignore_empty, text1, ...)'],
  ['LEN', 'LEN(text)'],
  ['LEFT', 'LEFT(text, [count])'],
  ['RIGHT', 'RIGHT(text, [count])'],
  ['MID', 'MID(text, start, count)'],
  ['UPPER', 'UPPER(text)'],
  ['LOWER', 'LOWER(text)'],
  ['PROPER', 'PROPER(text)'],
  ['TRIM', 'TRIM(text)'],
  ['REPT', 'REPT(text, times)'],
  ['FIND', 'FIND(find_text, within_text, [start])'],
  ['SEARCH', 'SEARCH(find_text, within_text, [start])'],
  ['SUBSTITUTE', 'SUBSTITUTE(text, old_text, new_text, [instance])'],
  ['VALUE', 'VALUE(text)'],
  ['TEXT', 'TEXT(value, format)'],
  ['TODAY', 'TODAY()'],
  ['DATE', 'DATE(year, month, day)'],
  ['YEAR', 'YEAR(date)'],
  ['MONTH', 'MONTH(date)'],
  ['DAY', 'DAY(date)'],
  ['WEEKDAY', 'WEEKDAY(date, [type])'],
  ['DAYS', 'DAYS(end_date, start_date)'],
  ['EDATE', 'EDATE(date, months)'],
  ['EOMONTH', 'EOMONTH(date, months)'],
  ['NETWORKDAYS', 'NETWORKDAYS(start_date, end_date, [holidays])'],
  ['WORKDAY', 'WORKDAY(start_date, days, [holidays])'],
  ['MATCH', 'MATCH(value, range, [match_type])'],
  ['INDEX', 'INDEX(range, row, [column])'],
  ['XLOOKUP', 'XLOOKUP(value, lookup_range, return_range, [if_not_found], [match_mode], [search_mode])'],
  ['VLOOKUP', 'VLOOKUP(value, table, column, [approximate])'],
]);
