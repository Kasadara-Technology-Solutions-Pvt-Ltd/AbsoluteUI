import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createCsvParser, detectDelimiter, escapeCsvCell, isFormulaLike, parseCsv, stringifyCsv } from '@absoluteui/helpers/csv';
import { LimitError, ValidationError } from '@absoluteui/helpers/error';

const timed = (fn: () => void): number => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};

describe('parseCsv (RFC 4180)', () => {
  it('parses quoted fields with delimiters, line breaks and escaped quotes', () => {
    const text = 'a,b,c\r\n"x, y","line1\r\nline2","say ""hi"""\r\n';
    expect(parseCsv(text).rows).toEqual([['a', 'b', 'c'], ['x, y', 'line1\r\nline2', 'say "hi"']]);
  });
  it('handles LF, CR and CRLF line endings and a missing final newline', () => {
    expect(parseCsv('a,b\nc,d').rows).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\rc,d\r').rows).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('a,b\r\nc,d\r\n').rows).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('strips a BOM and handles empty fields', () => {
    expect(parseCsv(`${String.fromCharCode(0xfeff)}a,,c\n,,\n`, { delimiter: ',' }).rows).toEqual([['a', '', 'c'], ['', '', '']]);
    expect(parseCsv('').rows).toEqual([]);
    expect(parseCsv('""').rows).toEqual([['']]);
  });
  it('skips blank lines by default and keeps them on request', () => {
    expect(parseCsv('a\n\nb\n').rows).toEqual([['a'], ['b']]);
    expect(parseCsv('a\n\nb\n', { skipEmptyLines: false }).rows).toEqual([['a'], [''], ['b']]);
  });
  it('supports header mode with safe objects', () => {
    const r = parseCsv('name,age\r\n"Doe, Jane",42\r\nBob', { header: true });
    expect(r.headers).toEqual(['name', 'age']);
    expect(r.rows).toEqual([{ name: 'Doe, Jane', age: '42' }, { name: 'Bob', age: '' }]);
    expect(r.errors).toEqual([{ row: 3, line: 3, code: 'HLP_CSV_FIELD_COUNT' }]);
  });
  it('renames unsafe, duplicate and empty headers', () => {
    const r = parseCsv('__proto__,constructor,a,a,\n1,2,3,4,5', { header: true });
    expect(r.headers).toEqual(['column_1', 'column_2', 'a', 'a_2', 'column_5']);
    expect(r.errors.map((e) => e.code)).toEqual(['HLP_CSV_UNSAFE_HEADER', 'HLP_CSV_UNSAFE_HEADER', 'HLP_CSV_DUPLICATE_HEADER']);
    expect(r.rows[0]).toEqual({ column_1: '1', column_2: '2', a: '3', a_2: '4', column_5: '5' });
    expect(Object.getPrototypeOf(r.rows[0])).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)['1']).toBeUndefined();
  });
  it('reports malformed quotes without throwing', () => {
    const r = parseCsv('a,"unclosed\nb,c');
    expect(r.rows).toEqual([['a', 'unclosed\nb,c']]);
    expect(r.errors).toEqual([{ row: 1, line: 1, code: 'HLP_CSV_UNCLOSED_QUOTE' }]);
    const r2 = parseCsv('"ab"c,d\ne,f');
    expect(r2.rows).toEqual([['abc', 'd'], ['e', 'f']]);
    expect(r2.errors).toEqual([{ row: 1, line: 1, code: 'HLP_CSV_UNEXPECTED_QUOTE' }]);
    expect(parseCsv('a"b,c').rows).toEqual([['a"b', 'c']]);
  });
  it('trims, skips comments and uses custom quote/delimiter', () => {
    expect(parseCsv('  a , "b c"  ,c\n', { trim: true }).rows).toEqual([['a', 'b c', 'c']]);
    expect(parseCsv('# note\na;b\n#x\nc;d', { comment: '#', delimiter: ';' }).rows).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv("'a|b'|c", { quote: "'", delimiter: '|' }).rows).toEqual([['a|b', 'c']]);
    expect(parseCsv('a\tb\n1\t2').rows).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('tracks line numbers across multi-line fields', () => {
    const r = parseCsv('h1,h2\n"a\nb\r\nc",1\nx', { header: true });
    expect(r.errors).toEqual([{ row: 3, line: 5, code: 'HLP_CSV_FIELD_COUNT' }]);
  });
  it('enforces limits', () => {
    expect(() => parseCsv('a\nb\nc', { maxRows: 2 })).toThrow(LimitError);
    expect(() => parseCsv(`"${'x'.repeat(101)}"`, { maxFieldLength: 100 })).toThrow(LimitError);
    expect(() => parseCsv('x'.repeat(101), { maxFieldLength: 100 })).toThrow(LimitError);
    expect(() => parseCsv(','.repeat(20), { maxColumns: 10, delimiter: ',' })).toThrow(LimitError);
    expect(() => parseCsv('a', { delimiter: '"' })).toThrow(ValidationError);
    expect(() => parseCsv('a', { delimiter: ',,' })).toThrow(ValidationError);
    expect(() => parseCsv('a', { quote: '' })).toThrow(ValidationError);
  });
  it('is linear on adversarial input', () => {
    const quotes = '"'.repeat(200_001);
    const many = 'a,'.repeat(5000) + '\n';
    const big = many.repeat(100);
    expect(timed(() => parseCsv(quotes))).toBeLessThan(500);
    expect(timed(() => parseCsv(big, { delimiter: ',' }))).toBeLessThan(1000);
    expect(timed(() => parseCsv(`"${'""'.repeat(200_000)}"`))).toBeLessThan(500);
    expect(timed(() => detectDelimiter('"'.repeat(1_000_000)))).toBeLessThan(500);
  });
});

describe('detectDelimiter', () => {
  it('detects common delimiters and ignores quoted ones', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectDelimiter('a|b|c\n1|2|3')).toBe('|');
    expect(detectDelimiter('"x,y,z";b\n"1,2,3";4')).toBe(';');
    expect(detectDelimiter('a,b;c\n1,2;3\n4,5;6,7,8')).toBe(';');
    expect(detectDelimiter('single')).toBe(',');
    expect(detectDelimiter('')).toBe(',');
    expect(parseCsv('a;b\n1;2').delimiter).toBe(';');
  });
});

describe('createCsvParser (streaming)', () => {
  it('produces the same rows as parseCsv for any chunking', () => {
    const text = 'id;name;note\r\n1;"Doe; Jane";"multi\r\nline"\r\n2;Bob;"quote "" here"\r\n3;;\r\n';
    const expected = parseCsv(text, { header: true });
    for (let size = 1; size <= text.length; size++) {
      const p = createCsvParser({ header: true });
      const rows: Record<string, string>[] = [];
      for (let i = 0; i < text.length; i += size) rows.push(...p.push(text.slice(i, i + size)));
      rows.push(...p.end());
      expect(rows).toEqual(expected.rows);
      expect(p.headers).toEqual(expected.headers);
      expect(p.delimiter).toBe(';');
    }
  });
  it('handles CRLF and quotes split across chunks with a fixed delimiter', () => {
    const p = createCsvParser({ delimiter: ',' });
    expect(p.push('a,"b\r')).toEqual([]);
    expect(p.push('\nc"\r')).toEqual([['a', 'b\r\nc']]);
    expect(p.push('\nd,e')).toEqual([]);
    expect(p.end()).toEqual([['d', 'e']]);
    expect(p.errors).toEqual([]);
  });
  it('works with TextDecoderStream chunks and multi-byte characters', async () => {
    const text = 'name,city\n"Ünïcødé, ✓",Zürich\n日本,東京\n';
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
        controller.close();
      },
    }).pipeThrough(new TextDecoderStream());
    const p = createCsvParser({ header: true, delimiter: ',' });
    const rows: Record<string, string>[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rows.push(...p.push(value));
    }
    rows.push(...p.end());
    expect(rows).toEqual([{ name: 'Ünïcødé, ✓', city: 'Zürich' }, { name: '日本', city: '東京' }]);
  });
  it('detects the delimiter when the input ends before the buffer fills', () => {
    const p = createCsvParser();
    expect(p.push('a|b\n1|2')).toEqual([]);
    expect(p.end()).toEqual([['a', 'b'], ['1', '2']]);
    expect(p.delimiter).toBe('|');
  });
});

describe('stringifyCsv / escapeCsvCell', () => {
  it('escapes minimally or always', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(escapeCsvCell(' padded ')).toBe('" padded "');
    expect(escapeCsvCell('x', { quote: 'all' })).toBe('"x"');
    expect(escapeCsvCell('a;b', { delimiter: ';' })).toBe('"a;b"');
  });
  it('neutralizes formula injection (OWASP), including full-width variants', () => {
    for (const s of ['=SUM(A1)', '+1', '-1+2', '@cmd', '\tx', '\rx', `${String.fromCharCode(0xff1d)}1+1`, `${String.fromCharCode(0xff20)}x`]) {
      expect(isFormulaLike(s)).toBe(true);
      expect(escapeCsvCell(s).replace(/^"/, '').startsWith("'")).toBe(true);
    }
    expect(escapeCsvCell('=1', { injectionProtection: false })).toBe('=1');
    expect(escapeCsvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(isFormulaLike('safe')).toBe(false);
  });
  it('writes objects with columns, formats, BOM and EOL options', () => {
    const rows = [{ name: 'Ada', score: -1, when: new Date(Date.UTC(2026, 8, 29)), tags: ['a'], note: '=cmd' }, { name: 'Bob', extra: true }];
    expect(stringifyCsv(rows)).toBe("name,score,when,tags,note,extra\r\nAda,-1,2026-09-29T00:00:00.000Z,\"[\"\"a\"\"]\",'=cmd,\r\nBob,,,,,true\r\n");
    const out = stringifyCsv(rows, { columns: [{ key: 'name', header: 'Name' }, { key: 'score', header: 'Score', format: (v) => (typeof v === 'number' ? v * 10 : 'n/a') }], eol: '\n', bom: true, trailingEol: false });
    expect(out).toBe(`${String.fromCharCode(0xfeff)}Name,Score\nAda,-10\nBob,n/a`);
    expect(stringifyCsv(rows, { columns: ['name'], header: false })).toBe('Ada\r\nBob\r\n');
    expect(stringifyCsv([])).toBe('');
  });
  it('writes arrays with optional header names', () => {
    expect(stringifyCsv([['a', 'b'], ['1', '2']], { eol: '\n' })).toBe('a,b\n1,2\n');
    expect(stringifyCsv([[1, null, undefined, true]], { columns: ['w', 'x', 'y', 'z'] })).toBe('w,x,y,z\r\n1,,,true\r\n');
    expect(stringifyCsv([['']])).toBe('""\r\n');
    expect(() => stringifyCsv([['a']], { delimiter: '"' })).toThrow(ValidationError);
  });
  it('property: stringify → parse round-trips any 2D string array', () => {
    const cell = fc.string({ unit: fc.constantFrom('a', 'b', ' ', ',', ';', '"', '\n', '\r', '=', 'é', '\t', '|'), maxLength: 8 });
    const table = fc.integer({ min: 1, max: 5 }).chain((w) => fc.array(fc.array(cell, { minLength: w, maxLength: w }), { maxLength: 8 }));
    fc.assert(fc.property(table, fc.constantFrom<'\r\n' | '\n'>('\r\n', '\n'), fc.constantFrom<'minimal' | 'all'>('minimal', 'all'), (rows, eol, quote) => {
      const text = stringifyCsv(rows, { injectionProtection: false, eol, quote });
      expect(parseCsv(text, { delimiter: ',', skipEmptyLines: false }).rows).toEqual(rows);
      const p = createCsvParser({ delimiter: ',', skipEmptyLines: false });
      const streamed = [...p.push(text.slice(0, 7)), ...p.push(text.slice(7)), ...p.end()];
      expect(streamed).toEqual(rows);
    }), { numRuns: 300 });
  });
});
