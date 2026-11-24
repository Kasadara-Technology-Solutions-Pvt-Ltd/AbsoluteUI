/** Newline-delimited JSON (NDJSON / JSON Lines). */
import { HelperError, LimitError, type Result, ValidationError, err, ok } from '../error/index.js';
import { type SafeJsonParseOptions, safeJsonParse } from './parse.js';
import { type SafeJsonStringifyOptions, safeJsonStringify } from './stringify.js';

export interface ParseNdjsonOptions extends Omit<SafeJsonParseOptions, 'maxLength'> {
  /** Maximum total text length. Default 100,000,000. */
  readonly maxLength?: number;
  /** Maximum length of one line. Default 10,000,000. */
  readonly maxLineLength?: number;
  /** Maximum number of records. Default 1,000,000. */
  readonly maxLines?: number;
  /** `'fail'` (default) returns the first line error; `'skip'` drops bad lines. */
  readonly onError?: 'fail' | 'skip';
  /** Called for each bad line (1-based line number) in `'skip'` mode. */
  readonly onLineError?: (line: number, error: HelperError) => void;
}

/**
 * Parses NDJSON: one JSON value per line, blank lines ignored, `\r\n` accepted.
 * Line errors carry `details.line` (1-based) and never the line's content.
 * @example parseNdjson('{"a":1}\n{"a":2}\n') // => { ok: true, value: [{ a: 1 }, { a: 2 }] }
 */
export function parseNdjson(text: string, options: ParseNdjsonOptions = {}): Result<unknown[], HelperError> {
  const { maxLength = 100_000_000, maxLineLength = 10_000_000, maxLines = 1_000_000, onError = 'fail', onLineError, ...parseOptions } = options;
  if (typeof text !== 'string') return err(new ValidationError('HLP_JSON_INVALID_INPUT', 'JSON input must be a string.'));
  if (text.length > maxLength) return err(new LimitError('HLP_JSON_TOO_LONG', 'NDJSON text exceeds the maximum length.', { details: { maxLength } }));
  const values: unknown[] = [];
  let line = 0;
  let start = 0;
  while (start <= text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    line++;
    let raw = text.slice(start, end);
    start = end + 1;
    if (raw.endsWith('\r')) raw = raw.slice(0, -1);
    if (raw.trim() === '') continue;
    if (values.length >= maxLines) return err(new LimitError('HLP_JSON_TOO_MANY_LINES', 'NDJSON has too many records.', { details: { maxLines } }));
    const r = safeJsonParse(raw, { ...parseOptions, maxLength: maxLineLength });
    if (r.ok) {
      values.push(r.value);
      continue;
    }
    const lineError = new HelperError(r.error.code, 'An NDJSON line is not valid.', { kind: r.error.kind, details: { ...r.error.details, line } });
    if (onError === 'fail') return err(lineError);
    onLineError?.(line, lineError);
  }
  return ok(values);
}

/**
 * Serializes values as NDJSON (each record terminated by `\n`). Values JSON cannot represent throw
 * `HLP_JSON_NOT_SERIALIZABLE`.
 * @example stringifyNdjson([{ a: 1 }, 2]) // => '{"a":1}\n2\n'
 */
export function stringifyNdjson(values: Iterable<unknown>, options: Omit<SafeJsonStringifyOptions, 'indent'> = {}): string {
  let out = '';
  for (const v of values) {
    const s = safeJsonStringify(v, options);
    if (s === undefined) throw new ValidationError('HLP_JSON_NOT_SERIALIZABLE', 'A value cannot be represented as JSON.');
    out += `${s}\n`;
  }
  return out;
}
