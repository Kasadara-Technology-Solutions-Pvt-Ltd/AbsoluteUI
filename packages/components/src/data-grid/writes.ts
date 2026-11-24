/**
 * Data Grid writes (docs/PLAN-R11-G3.md, G3c; decision R11-13): clipboard text parsing,
 * locale-aware conversion of pasted text to typed values, and fill series. Pure functions;
 * the grid applies the results as new row objects (rows are never mutated).
 */
import { addDays, instant, parsePlainDate, plainDate, type PlainDate } from '@absoluteui/core';
import { isPlainDate } from '../data-table/model.js';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import type { DataGridColumnType } from './model.js';

/** Parse tab-separated clipboard text (quoted values may hold tabs, line breaks, and doubled quotes). */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let i = 0;
  let quoted = false;
  // A value is quoted only when its first character is a quote.
  let atStart = true;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"' && text.charAt(i + 1) === '"') {
        value += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        quoted = false;
        i++;
        continue;
      }
      value += ch;
      i++;
      continue;
    }
    if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
      i++;
      continue;
    }
    if (ch === '\t') {
      row.push(value);
      value = '';
      atStart = true;
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      atStart = true;
      i += ch === '\r' && text.charAt(i + 1) === '\n' ? 2 : 1;
      continue;
    }
    value += ch;
    atStart = false;
    i++;
  }
  // The last line has no break (a trailing break adds no empty row).
  if (value !== '' || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

/** Locale number parts: the group and decimal separators. */
function separators(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  return { group: parts.find((p) => p.type === 'group')?.value ?? ',', decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.' };
}

/** A number typed in the locale (group separators, the locale decimal separator, a leading sign, %), or null. */
export function parseLocaleNumber(text: string, locale: string): number | null {
  const { group, decimal } = separators(locale);
  let t = text.trim().replace(/\s/g, '');
  if (t === '') return null;
  // Currency symbols and letters around the number are ignored; a minus in parentheses is negative.
  const negative = /^\(.*\)$/.test(t) || /^-|^\u2212/.test(t.replace(/^[^\d\-\u2212(]+/, ''));
  t = t.replace(/[^\d.,'\u00a0\u202f]/g, '');
  t = t.split(group).join('');
  if (group !== "'") t = t.replace(/'/g, '');
  if (decimal !== '.') t = t.split('.').join('').split(decimal).join('.');
  else t = t.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

const fold = (s: string, locale: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale).replace(/\.$/, '');

/** Month names (long and short) of a locale, folded, to month numbers. */
function monthNames(locale: string): Map<string, number> {
  const names = new Map<string, number>();
  for (const style of ['long', 'short'] as const) {
    const format = new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' });
    for (let m = 1; m <= 12; m++) names.set(fold(format.format(Date.UTC(2021, m - 1, 15)), locale), m);
  }
  return names;
}

/** The order of year, month, and day in the locale's numeric dates. */
function fieldOrder(locale: string): ('year' | 'month' | 'day')[] {
  const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' }).formatToParts(Date.UTC(2021, 10, 25));
  return parts.map((p) => p.type).filter((t): t is 'year' | 'month' | 'day' => t === 'year' || t === 'month' || t === 'day');
}

/** A calendar date typed as ISO (2026-01-31) or in the locale (1/31/2026, 31.01.2026, Jan 31, 2026), or null. */
export function parseLocaleDate(text: string, locale: string): PlainDate | null {
  const t = text.trim();
  if (t === '') return null;
  const iso = parsePlainDate(t);
  if (iso) return iso;
  const tokens = t.split(/[\s,./\-\u200f\u200e]+/).filter((x) => x !== '');
  const numbers: number[] = [];
  let month: number | null = null;
  const names = monthNames(locale);
  for (const token of tokens) {
    if (/^\d+$/.test(token)) numbers.push(Number(token));
    else {
      const m = names.get(fold(token, locale));
      if (m === undefined) return null;
      month = m;
    }
  }
  let year: number | undefined;
  let day: number | undefined;
  if (month !== null) {
    if (numbers.length !== 2) return null;
    const [a = 0, b = 0] = numbers;
    [day, year] = a > 31 ? [b, a] : [a, b];
  } else {
    if (numbers.length !== 3) return null;
    const order = fieldOrder(locale);
    const by = new Map(order.map((field, i) => [field, numbers[i]]));
    year = by.get('year');
    month = by.get('month') ?? null;
    day = by.get('day');
  }
  if (year === undefined || month === null || day === undefined) return null;
  if (year < 100) year += 2000;
  try {
    const d = plainDate(year, month, day);
    return d.month === month && d.day === day ? d : null;
  } catch {
    return null;
  }
}

/** The result of converting pasted text: a value, or invalid text. */
export type Parsed = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

/**
 * Convert pasted text to a value of a column type. Empty text is `null` (a blank). Booleans
 * accept the grid's yes/no words and true/false; dates and numbers follow the locale.
 */
export function parseCellText(text: string, type: DataGridColumnType, locale: string, words: { yes: string; no: string }): Parsed {
  if (text.trim() === '') return { ok: true, value: null };
  switch (type) {
    case 'text':
      return { ok: true, value: text };
    case 'number':
    case 'currency': {
      const n = parseLocaleNumber(text, locale);
      return n === null ? { ok: false } : { ok: true, value: n };
    }
    case 'boolean': {
      const t = fold(text.trim(), locale);
      if (t === fold(words.yes, locale) || t === 'true') return { ok: true, value: true };
      if (t === fold(words.no, locale) || t === 'false') return { ok: true, value: false };
      return { ok: false };
    }
    case 'date': {
      const d = parseLocaleDate(text, locale);
      return d ? { ok: true, value: d } : { ok: false };
    }
    case 'datetime': {
      // Only unambiguous ISO instants (with an offset or Z).
      const ms = /\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(text.trim()) ? Date.parse(text.trim()) : Number.NaN;
      return Number.isFinite(ms) ? { ok: true, value: instant(ms) } : { ok: false };
    }
  }
}

const epochDay = (d: PlainDate): number => Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;

/**
 * Values that continue `source` for `count` more cells. Two or more numbers (or dates) continue
 * their linear series (dates by calendar days, or by working days with a business calendar when
 * every source date is a working day); a single number or date, mixed values, and text repeat
 * the source cyclically. `repeat` forces repetition (Alt while filling); `increment` makes a single
 * number or date count up by one (or down when `backwards`).
 */
export function fillSeries(source: readonly unknown[], count: number, options: { repeat?: boolean; increment?: boolean; backwards?: boolean; calendar?: BusinessCalendarEngine } = {}): unknown[] {
  const out: unknown[] = [];
  const n = source.length;
  if (n === 0 || count <= 0) return out;
  const repeat = (): unknown[] => {
    for (let i = 0; i < count; i++) out.push(source[options.backwards ? (n - 1 - (i % n) + n) % n : i % n]);
    return out;
  };
  if (options.repeat) return repeat();
  const numbers = source.every((v) => typeof v === 'number' && Number.isFinite(v));
  const dates = source.every(isPlainDate);
  if (!numbers && !dates) return repeat();
  if (n === 1 && !options.increment) return repeat();
  const sign = options.backwards ? -1 : 1;
  if (numbers) {
    const values = source as number[];
    const first = values[0] ?? 0;
    const last = values[n - 1] ?? 0;
    const step = n === 1 ? 1 : (last - first) / (n - 1);
    const from = options.backwards ? first : last;
    for (let i = 1; i <= count; i++) out.push(from + sign * step * i);
    return out;
  }
  const values = source as PlainDate[];
  const first = values[0];
  const last = values[n - 1];
  if (!first || !last) return repeat();
  const from = options.backwards ? first : last;
  const cal = options.calendar;
  if (cal && values.every((d) => cal.isWorkingDay(d)) && epochDay(last) >= epochDay(first)) {
    const span = n === 1 ? 1 : cal.workingDaysBetween(first, last);
    const step = n === 1 ? 1 : span / (n - 1);
    if (Number.isInteger(step)) {
      for (let i = 1; i <= count; i++) out.push(cal.addWorkingDays(from, sign * step * i));
      return out;
    }
  }
  const step = n === 1 ? 1 : (epochDay(last) - epochDay(first)) / (n - 1);
  if (!Number.isInteger(step)) return repeat();
  for (let i = 1; i <= count; i++) out.push(addDays(from, sign * step * i));
  return out;
}
