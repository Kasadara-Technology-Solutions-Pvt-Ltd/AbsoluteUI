/**
 * RFC 4180 CSV parser: a single-pass state machine (linear time, no regular expressions on
 * field data) shared by the one-shot {@link parseCsv} and the streaming {@link createCsvParser}.
 */
import { LimitError, ValidationError } from '../error/index.js';
import { isUnsafeKey } from '../internal/keys.js';

/** A problem found while parsing. `row` is the 1-based record number (the header is row 1). */
export interface CsvError {
  readonly row: number;
  /** 1-based line where the record starts. */
  readonly line: number;
  readonly code: 'HLP_CSV_UNCLOSED_QUOTE' | 'HLP_CSV_UNEXPECTED_QUOTE' | 'HLP_CSV_FIELD_COUNT' | 'HLP_CSV_UNSAFE_HEADER' | 'HLP_CSV_DUPLICATE_HEADER';
}

export interface CsvParseOptions {
  /** Field delimiter (one character) or `'auto'` to detect among `, ; \t |`. Default `'auto'`. */
  readonly delimiter?: string;
  /** Quote character. Default `"`. */
  readonly quote?: string;
  /** Treat the first record as column names and return objects. Default false. */
  readonly header?: boolean;
  /** Trim whitespace around unquoted fields and outside quotes. Default false. */
  readonly trim?: boolean;
  /** Skip records that are completely empty (a blank line). Default true. */
  readonly skipEmptyLines?: boolean;
  /** Lines starting with this character are ignored. Default: none. */
  readonly comment?: string;
  /** Maximum data rows; more throws `HLP_CSV_TOO_MANY_ROWS`. Default 1 000 000. */
  readonly maxRows?: number;
  /** Maximum characters per field; longer throws `HLP_CSV_FIELD_TOO_LONG`. Default 1 000 000. */
  readonly maxFieldLength?: number;
  /** Maximum fields per record; more throws `HLP_CSV_TOO_MANY_COLUMNS`. Default 10 000. */
  readonly maxColumns?: number;
}

export interface CsvResult<R> {
  readonly rows: R[];
  /** Column names (after renaming unsafe/duplicate/empty names); empty without `header`. */
  readonly headers: string[];
  readonly errors: CsvError[];
  /** Delimiter used (detected or given). */
  readonly delimiter: string;
}

const DETECT_CANDIDATES = [',', ';', '\t', '|'] as const;

/**
 * Detects the delimiter from a sample by counting candidates outside quotes on the first
 * lines and preferring the most consistent, then most frequent. Defaults to `,`.
 * @example detectDelimiter('a;b;c\n1;2;3') // => ';'
 */
export function detectDelimiter(sample: string, candidates: readonly string[] = DETECT_CANDIDATES, quote = '"'): string {
  const text = sample.length > 65_536 ? sample.slice(0, 65_536) : sample;
  const counts = candidates.map(() => [] as number[]);
  let current = candidates.map(() => 0);
  let inQuotes = false;
  let lines = 0;
  for (let i = 0; i < text.length && lines < 10; i++) {
    const c = text.charAt(i);
    if (c === quote) inQuotes = !inQuotes;
    else if (!inQuotes && (c === '\n' || c === '\r')) {
      if (c === '\r' && text.charAt(i + 1) === '\n') i++;
      counts.forEach((list, k) => list.push(current[k] ?? 0));
      current = candidates.map(() => 0);
      lines++;
    } else if (!inQuotes) {
      const k = candidates.indexOf(c);
      if (k >= 0) current[k] = (current[k] ?? 0) + 1;
    }
  }
  if (lines < 10 && current.some((n) => n > 0)) counts.forEach((list, k) => list.push(current[k] ?? 0));
  let best = ',';
  let bestScore = -1;
  candidates.forEach((cand, k) => {
    const list = (counts[k] ?? []).filter((n, idx, all) => n > 0 || idx < all.length - 1);
    if (list.length === 0 || list.every((n) => n === 0)) return;
    const freq = new Map<number, number>();
    for (const n of list) freq.set(n, (freq.get(n) ?? 0) + 1);
    let modeCount = 0;
    let mode = 0;
    for (const [n, f] of freq) if (n > 0 && (f > modeCount || (f === modeCount && n > mode))) [mode, modeCount] = [n, f];
    // Consistency dominates; frequency breaks ties.
    const score = (modeCount / list.length) * 1000 + Math.min(mode, 999);
    if (mode > 0 && score > bestScore) [best, bestScore] = [cand, score];
  });
  return best;
}

const S = { FieldStart: 0, Unquoted: 1, Quoted: 2, QuoteInQuoted: 3, AfterQuoted: 4, Comment: 5 } as const;
type State = (typeof S)[keyof typeof S];

interface RecordMeta {
  readonly line: number;
  /** True when every field was empty and unquoted (a blank line). */
  readonly blank: boolean;
  /** Syntax problems found inside this record. */
  readonly errors: readonly CsvError['code'][];
}

interface Limits {
  readonly maxFieldLength: number;
  readonly maxColumns: number;
}

/** Incremental tokenizer. Chunks may split anywhere, including inside quotes or CRLF. */
class Tokenizer {
  private state: State = S.FieldStart;
  private lastWasCr = false;
  private recordErrors: CsvError['code'][] = [];
  private field = '';
  private record: string[] = [];
  private anyQuoted = false;
  private skipLf = false;
  private line = 1;
  private recordLine = 1;
  private started = false;
  private readonly delimiter: string;
  private readonly quote: string;
  private readonly trim: boolean;
  private readonly comment: string | undefined;
  private readonly limits: Limits;
  private readonly onRecord: (fields: string[], meta: RecordMeta) => void;

  constructor(delimiter: string, quote: string, trim: boolean, comment: string | undefined, limits: Limits, onRecord: (fields: string[], meta: RecordMeta) => void) {
    this.delimiter = delimiter;
    this.quote = quote;
    this.trim = trim;
    this.comment = comment;
    this.limits = limits;
    this.onRecord = onRecord;
  }

  private onError(code: CsvError['code']): void {
    this.recordErrors.push(code);
  }

  private checkField(extra: number): void {
    if (this.field.length + extra > this.limits.maxFieldLength) throw new LimitError('HLP_CSV_FIELD_TOO_LONG', 'A CSV field exceeds the length limit.', { details: { maxFieldLength: this.limits.maxFieldLength } });
  }

  private endField(): void {
    this.checkField(0);
    this.record.push(this.state === S.Unquoted && this.trim ? this.field.trimEnd() : this.field);
    if (this.record.length > this.limits.maxColumns) throw new LimitError('HLP_CSV_TOO_MANY_COLUMNS', 'A CSV record has too many fields.', { details: { maxColumns: this.limits.maxColumns } });
    this.field = '';
  }

  private endRecord(): void {
    const fields = this.record;
    const blank = !this.anyQuoted && fields.length === 1 && fields[0] === '';
    const errors = this.recordErrors;
    this.record = [];
    this.recordErrors = [];
    this.anyQuoted = false;
    this.onRecord(fields, { line: this.recordLine, blank, errors });
  }

  push(chunk: string, final: boolean): void {
    let text = chunk;
    if (!this.started && text.length > 0) {
      this.started = true;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    const { delimiter: d, quote: q } = this;
    let segStart = -1; // start of a pending slice of `text` belonging to `field`
    const flush = (end: number): void => {
      if (segStart >= 0) {
        this.checkField(end - segStart);
        this.field += text.slice(segStart, end);
        segStart = -1;
      }
    };
    for (let i = 0; i < text.length; i++) {
      const c = text.charAt(i);
      if (this.skipLf) {
        this.skipLf = false;
        if (c === '\n') continue;
      }
      switch (this.state) {
        case S.FieldStart:
          if (this.record.length === 0 && this.comment !== undefined && c === this.comment) {
            this.state = S.Comment;
          } else if (c === q) {
            this.state = S.Quoted;
            this.anyQuoted = true;
          } else if (c === d) {
            this.record.push('');
            if (this.record.length > this.limits.maxColumns) throw new LimitError('HLP_CSV_TOO_MANY_COLUMNS', 'A CSV record has too many fields.', { details: { maxColumns: this.limits.maxColumns } });
          } else if (c === '\n' || c === '\r') {
            this.record.push('');
            this.newline(c);
          } else if (this.trim && (c === ' ' || c === '\t')) {
            // skip leading whitespace
          } else {
            this.state = S.Unquoted;
            segStart = i;
          }
          break;
        case S.Unquoted:
          if (c === d) {
            flush(i);
            this.endField();
            this.state = S.FieldStart;
          } else if (c === '\n' || c === '\r') {
            flush(i);
            this.endField();
            this.state = S.FieldStart;
            this.newline(c);
          } else if (segStart < 0) {
            segStart = i;
          }
          break;
        case S.Quoted:
          if (c === q) {
            flush(i);
            this.lastWasCr = false;
            this.state = S.QuoteInQuoted;
          } else {
            // Count CR, LF and CRLF (possibly split across chunks) as one line break each.
            if (c === '\r' || (c === '\n' && !this.lastWasCr)) this.line++;
            this.lastWasCr = c === '\r';
            if (segStart < 0) segStart = i;
          }
          break;
        case S.QuoteInQuoted:
          if (c === q) {
            this.checkField(1);
            this.field += q;
            this.state = S.Quoted;
          } else if (c === d) {
            this.endField();
            this.state = S.FieldStart;
          } else if (c === '\n' || c === '\r') {
            this.endField();
            this.state = S.FieldStart;
            this.newline(c);
          } else if (this.trim && (c === ' ' || c === '\t')) {
            this.state = S.AfterQuoted;
          } else {
            // Text after a closing quote: keep it (lenient) and report.
            this.onError('HLP_CSV_UNEXPECTED_QUOTE');
            this.state = S.Unquoted;
            segStart = i;
          }
          break;
        case S.AfterQuoted:
          if (c === d) {
            this.endField();
            this.state = S.FieldStart;
          } else if (c === '\n' || c === '\r') {
            this.endField();
            this.state = S.FieldStart;
            this.newline(c);
          } else if (c !== ' ' && c !== '\t') {
            this.onError('HLP_CSV_UNEXPECTED_QUOTE');
            this.state = S.Unquoted;
            segStart = i;
          }
          break;
        case S.Comment:
          if (c === '\n' || c === '\r') {
            if (c === '\r') this.skipLf = true;
            this.line++;
            this.recordLine = this.line;
            this.state = S.FieldStart;
          }
          break;
      }
    }
    flush(text.length);
    if (final) this.finish();
  }

  /** Ends the current record at a line break. */
  private newline(c: string): void {
    if (c === '\r') this.skipLf = true;
    this.endRecord();
    this.line++;
    this.recordLine = this.line;
  }

  private finish(): void {
    switch (this.state) {
      case S.Comment:
        return;
      case S.FieldStart:
        // A trailing line break ends the last record; nothing pending.
        if (this.record.length === 0) return;
        this.record.push('');
        break;
      case S.Quoted:
        this.onError('HLP_CSV_UNCLOSED_QUOTE');
        this.endField();
        break;
      default:
        this.endField();
    }
    this.state = S.FieldStart;
    this.endRecord();
  }
}

// ---------------------------------------------------------------------------
// Row assembly (header handling, limits, errors)

interface Assembler {
  readonly headers: string[];
  readonly errors: CsvError[];
  record(fields: string[], meta: RecordMeta): Record<string, string> | string[] | undefined;
}

function makeHeaders(fields: readonly string[], errors: CsvError[], line: number): string[] {
  const seen = new Set<string>();
  return fields.map((raw, i) => {
    let name = raw;
    if (isUnsafeKey(name)) {
      errors.push({ row: 1, line, code: 'HLP_CSV_UNSAFE_HEADER' });
      name = '';
    }
    if (name === '') name = `column_${i + 1}`;
    if (seen.has(name)) {
      errors.push({ row: 1, line, code: 'HLP_CSV_DUPLICATE_HEADER' });
      let n = 2;
      while (seen.has(`${name}_${n}`)) n++;
      name = `${name}_${n}`;
    }
    seen.add(name);
    return name;
  });
}

function makeAssembler(header: boolean, skipEmpty: boolean, maxRows: number): Assembler {
  const headers: string[] = [];
  const errors: CsvError[] = [];
  let recordNo = 0;
  let dataRows = 0;
  let width = -1;
  return {
    headers,
    errors,
    record(fields, meta) {
      if (meta.blank && skipEmpty) return undefined;
      recordNo++;
      for (const code of meta.errors) errors.push({ row: recordNo, line: meta.line, code });
      if (header && recordNo === 1) {
        headers.push(...makeHeaders(fields, errors, meta.line));
        width = headers.length;
        return undefined;
      }
      dataRows++;
      if (dataRows > maxRows) throw new LimitError('HLP_CSV_TOO_MANY_ROWS', 'The CSV has too many rows.', { details: { maxRows } });
      if (width < 0) width = fields.length;
      else if (fields.length !== width) errors.push({ row: recordNo, line: meta.line, code: 'HLP_CSV_FIELD_COUNT' });
      if (!header) return fields;
      const obj: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) obj[headers[i] ?? ''] = fields[i] ?? '';
      return obj;
    },
  };
}

function resolveOptions(options: CsvParseOptions): { quote: string; trim: boolean; comment: string | undefined; skipEmpty: boolean; maxRows: number; limits: Limits } {
  const { quote = '"', trim = false, comment, skipEmptyLines = true, maxRows = 1_000_000, maxFieldLength = 1_000_000, maxColumns = 10_000 } = options;
  if (quote.length !== 1) throw new ValidationError('HLP_CSV_OPTION', 'The quote must be a single character.');
  if (comment !== undefined && comment.length !== 1) throw new ValidationError('HLP_CSV_OPTION', 'The comment marker must be a single character.');
  return { quote, trim, comment, skipEmpty: skipEmptyLines, maxRows, limits: { maxFieldLength, maxColumns } };
}

function checkDelimiter(delimiter: string, quote: string): void {
  if (delimiter.length !== 1 || delimiter === quote || delimiter === '\n' || delimiter === '\r') throw new ValidationError('HLP_CSV_OPTION', 'The delimiter must be a single character other than the quote or a line break.');
}

/**
 * Parses CSV text (RFC 4180: quoted fields with delimiters and line breaks, `""` escapes,
 * CRLF/LF/CR, BOM). With `header`, rows are objects keyed by column name; unsafe names such as
 * `__proto__` are renamed (`column_N`) and reported. Malformed input is reported in `errors`,
 * never thrown; limits throw `LimitError`.
 * @example parseCsv('name,age\r\n"Doe, Jane",42', { header: true }).rows // => [{ name: 'Doe, Jane', age: '42' }]
 */
export function parseCsv(text: string, options: CsvParseOptions & { readonly header: true }): CsvResult<Record<string, string>>;
export function parseCsv(text: string, options?: CsvParseOptions & { readonly header?: false }): CsvResult<string[]>;
export function parseCsv(text: string, options?: CsvParseOptions): CsvResult<Record<string, string> | string[]>;
export function parseCsv(text: string, options: CsvParseOptions = {}): CsvResult<Record<string, string> | string[]> {
  const o = resolveOptions(options);
  const delimiter = options.delimiter === undefined || options.delimiter === 'auto' ? detectDelimiter(text, DETECT_CANDIDATES, o.quote) : options.delimiter;
  checkDelimiter(delimiter, o.quote);
  const asm = makeAssembler(options.header === true, o.skipEmpty, o.maxRows);
  const rows: (Record<string, string> | string[])[] = [];
  const tok = new Tokenizer(
    delimiter,
    o.quote,
    o.trim,
    o.comment,
    o.limits,
    (fields, meta) => {
      const r = asm.record(fields, meta);
      if (r !== undefined) rows.push(r);
    },
  );
  tok.push(text, true);
  return { rows, headers: asm.headers, errors: asm.errors, delimiter };
}

/** Streaming parser handle returned by {@link createCsvParser}. */
export interface CsvStreamParser<R> {
  /** Feeds a chunk (any split point) and returns the rows completed by it. */
  push(chunk: string): R[];
  /** Flushes the final record and returns the remaining rows. */
  end(): R[];
  /** Column names once the header row has been read. */
  readonly headers: readonly string[];
  /** Errors so far. */
  readonly errors: readonly CsvError[];
  /** Delimiter in use (after auto-detection). */
  readonly delimiter: string | undefined;
}

/**
 * Incremental CSV parser for large files: feed string chunks (for example from
 * `TextDecoderStream`) and collect rows as they complete. Quotes and CRLF split across chunks
 * are handled. With `delimiter: 'auto'`, the first 64 KiB (or 10 lines) are buffered for detection.
 * @example
 * const p = createCsvParser({ header: true, delimiter: ',' });
 * p.push('name,dept\nAda,Eng'); // => []
 * p.push('\nGrace,Ops\n'); // => [{ name: 'Ada', dept: 'Eng' }, { name: 'Grace', dept: 'Ops' }]
 * p.end(); // => []
 */
export function createCsvParser(options: CsvParseOptions & { readonly header: true }): CsvStreamParser<Record<string, string>>;
export function createCsvParser(options?: CsvParseOptions & { readonly header?: false }): CsvStreamParser<string[]>;
export function createCsvParser(options?: CsvParseOptions): CsvStreamParser<Record<string, string> | string[]>;
export function createCsvParser(options: CsvParseOptions = {}): CsvStreamParser<Record<string, string> | string[]> {
  const o = resolveOptions(options);
  const asm = makeAssembler(options.header === true, o.skipEmpty, o.maxRows);
  let delimiter = options.delimiter === undefined || options.delimiter === 'auto' ? undefined : options.delimiter;
  if (delimiter !== undefined) checkDelimiter(delimiter, o.quote);
  let pending: (Record<string, string> | string[])[] = [];
  let buffered = '';
  let tok: Tokenizer | undefined;
  const start = (d: string): Tokenizer => {
    checkDelimiter(d, o.quote);
    return new Tokenizer(
      d,
      o.quote,
      o.trim,
      o.comment,
      o.limits,
      (fields, meta) => {
        const r = asm.record(fields, meta);
        if (r !== undefined) pending.push(r);
      },
    );
  };
  const take = (): (Record<string, string> | string[])[] => {
    const out = pending;
    pending = [];
    return out;
  };
  const lineCount = (s: string): number => {
    let n = 0;
    for (let i = 0; i < s.length && n < 10; i++) if (s.charCodeAt(i) === 10) n++;
    return n;
  };
  return {
    push(chunk) {
      if (!tok) {
        if (delimiter === undefined) {
          buffered += chunk;
          if (buffered.length < 65_536 && lineCount(buffered) < 10) return [];
          delimiter = detectDelimiter(buffered, DETECT_CANDIDATES, o.quote);
        }
        tok = start(delimiter);
        const first = buffered === '' ? chunk : buffered;
        buffered = '';
        tok.push(first, false);
        return take();
      }
      tok.push(chunk, false);
      return take();
    },
    end() {
      if (!tok) {
        delimiter ??= detectDelimiter(buffered, DETECT_CANDIDATES, o.quote);
        tok = start(delimiter);
        tok.push(buffered, true);
        buffered = '';
        return take();
      }
      tok.push('', true);
      return take();
    },
    get headers() {
      return asm.headers;
    },
    get errors() {
      return asm.errors;
    },
    get delimiter() {
      return delimiter;
    },
  };
}
