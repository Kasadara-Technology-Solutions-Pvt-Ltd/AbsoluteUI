/** Small readers for widget `options` (plain JSON) that collect issues instead of throwing. */
import type { JsonObject, JsonValue } from '../definition.js';
import type { WidgetOptionIssue } from '../registry.js';

export class OptionReader {
  readonly issues: WidgetOptionIssue[] = [];
  readonly #o: JsonObject;
  constructor(options: JsonObject, allowed: readonly string[]) {
    this.#o = options;
    for (const key of Object.keys(options)) if (!allowed.includes(key)) this.issues.push({ path: `/${key}`, expected: `one of: ${allowed.join(', ')}` });
  }
  #fail(key: string, expected: string): void {
    this.issues.push({ path: `/${key}`, expected });
  }
  raw(key: string): JsonValue | undefined {
    return Object.hasOwn(this.#o, key) ? this.#o[key] : undefined;
  }
  string(key: string, max = 200, required = false): string | undefined {
    const v = this.raw(key);
    if (typeof v === 'string' && v.length <= max) return v;
    if (v !== undefined) this.#fail(key, `string of at most ${String(max)} characters`);
    else if (required) this.#fail(key, 'a string');
    return undefined;
  }
  number(key: string, required = false): number | undefined {
    const v = this.raw(key);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (v !== undefined) this.#fail(key, 'finite number');
    else if (required) this.#fail(key, 'a number');
    return undefined;
  }
  boolean(key: string): boolean | undefined {
    const v = this.raw(key);
    if (typeof v === 'boolean') return v;
    if (v !== undefined) this.#fail(key, 'boolean');
    return undefined;
  }
  oneOf<const T extends readonly string[]>(key: string, values: T): T[number] | undefined {
    const v = this.raw(key);
    if (typeof v === 'string' && values.includes(v)) return v;
    if (v !== undefined) this.#fail(key, `one of: ${values.join(', ')}`);
    return undefined;
  }
  color(key: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | undefined {
    const v = this.raw(key);
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 8) return v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    if (v !== undefined) this.#fail(key, 'palette slot 1 to 8');
    return undefined;
  }
  /** An array of objects, each read by `item`. */
  list<T>(key: string, item: (r: OptionReader, index: number) => T | undefined, allowed: readonly string[], max = 50, required = false): T[] | undefined {
    const v = this.raw(key);
    if (v === undefined) {
      if (required) this.#fail(key, 'an array');
      return undefined;
    }
    if (!Array.isArray(v) || v.length > max) {
      this.#fail(key, `array of at most ${String(max)} items`);
      return undefined;
    }
    const out: T[] = [];
    (v as readonly JsonValue[]).forEach((entry, i) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        this.issues.push({ path: `/${key}/${String(i)}`, expected: 'object' });
        return;
      }
      const sub = new OptionReader(entry as JsonObject, allowed);
      const value = item(sub, i);
      for (const issue of sub.issues) this.issues.push({ path: `/${key}/${String(i)}${issue.path}`, expected: issue.expected });
      if (value !== undefined && sub.issues.length === 0) out.push(value);
    });
    return out;
  }
  /** `format`: Intl.NumberFormat options limited to presentation keys. */
  format(key = 'format'): Intl.NumberFormatOptions | undefined {
    const v = this.raw(key);
    if (v === undefined) return undefined;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      this.#fail(key, 'object of Intl.NumberFormat options');
      return undefined;
    }
    const allowed = ['style', 'currency', 'currencyDisplay', 'unit', 'unitDisplay', 'notation', 'compactDisplay', 'signDisplay', 'useGrouping', 'minimumFractionDigits', 'maximumFractionDigits', 'minimumIntegerDigits', 'maximumSignificantDigits'];
    const sub = new OptionReader(v as JsonObject, allowed);
    for (const issue of sub.issues) this.issues.push({ path: `/${key}${issue.path}`, expected: issue.expected });
    if (sub.issues.length > 0) return undefined;
    try {
      new Intl.NumberFormat('en', v as Intl.NumberFormatOptions).format(1);
    } catch {
      this.#fail(key, 'valid Intl.NumberFormat options (for example { "style": "currency", "currency": "EUR" })');
      return undefined;
    }
    return v as Intl.NumberFormatOptions;
  }
}

type Row = Readonly<Record<string, unknown>>;

/** Rows of a widget: the `rows` input when mapped, otherwise the data itself when it is an array. */
export function rowsOf(data: unknown, inputs: Readonly<Record<string, unknown>>): readonly Row[] {
  const source = Object.hasOwn(inputs, 'rows') ? inputs.rows : data;
  if (!Array.isArray(source)) return [];
  return source.filter((r): r is Row => r !== null && typeof r === 'object' && !Array.isArray(r));
}

export function field(row: Row, name: string): unknown {
  return Object.hasOwn(row, name) ? row[name] : undefined;
}

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function toText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  return JSON.stringify(v);
}
