import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  cleanRecords,
  coerceRecordTypes,
  collapseWhitespace,
  dedupeBy,
  maskPii,
  normalizeEmail,
  normalizePhone,
  normalizeRecord,
  normalizeUnicode,
  redact,
  removeEmpty,
  removeNullish,
  safeFileName,
  sanitizeSearchQuery,
  stripControl,
  stripInvisible,
  trimStrings,
  truncateForLog,
} from '@absoluteui/helpers/sanitize';
import { LimitError, ValidationError } from '@absoluteui/helpers/error';

const ch = (...codes: number[]): string => String.fromCharCode(...codes);
const ZWSP = ch(0x200b);
const ZWJ = ch(0x200d);
const RLO = ch(0x202e);
const LRI = ch(0x2066);
const PDI = ch(0x2069);
const BOM = ch(0xfeff);

const timed = (fn: () => void): number => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};

describe('trimStrings / removeNullish / removeEmpty', () => {
  it('trims deeply without mutating', () => {
    const input = { a: ' x ', b: [' y ', { c: ' z ' }], n: 1, d: new Date(0) };
    const out = trimStrings(input);
    expect(out).toEqual({ a: 'x', b: ['y', { c: 'z' }], n: 1, d: new Date(0) });
    expect(input.a).toBe(' x ');
    expect(out.d).toBe(input.d);
    expect(trimStrings({ a: ' x ', b: { c: ' z ' } }, { deep: false })).toEqual({ a: 'x', b: { c: ' z ' } });
    expect(trimStrings('  s ')).toBe('s');
  });
  it('drops prototype-pollution keys and handles cycles', () => {
    const evil = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"x": 1}, "ok": " 1 "}') as Record<string, unknown>;
    const out = trimStrings(evil);
    expect(Object.keys(out)).toEqual(['ok']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const cyc: Record<string, unknown> = { name: ' a ' };
    cyc.self = cyc;
    const c = trimStrings(cyc);
    expect(c.name).toBe('a');
    expect(c.self).toBe(c);
  });
  it('limits depth', () => {
    let deep: unknown = 'x';
    for (let i = 0; i < 200; i++) deep = [deep];
    expect(() => trimStrings(deep)).toThrow(LimitError);
    expect(() => trimStrings(deep, { maxDepth: 500 })).not.toThrow();
  });
  it('removes nullish (shallow and deep)', () => {
    expect(removeNullish({ a: 1, b: null, c: undefined, d: { e: null } })).toEqual({ a: 1, d: { e: null } });
    expect(removeNullish({ a: [1, null, 2], d: { e: null } }, { deep: true })).toEqual({ a: [1, 2], d: {} });
    expect(removeNullish([null, 0, false, ''])).toEqual([0, false, '']);
  });
  it('removes empty values and containers emptied by cleaning', () => {
    expect(removeEmpty({ a: '', b: [], c: {}, d: 0, e: false, f: '  ', g: null })).toEqual({ d: 0, e: false });
    expect(removeEmpty({ a: { b: '', c: [null] } }, { deep: true })).toEqual({});
    expect(removeEmpty({ f: '  ' }, { whitespace: false })).toEqual({ f: '  ' });
    expect(removeEmpty({ g: null }, { nullish: false })).toEqual({ g: null });
  });
});

describe('normalizeRecord / dedupeBy / cleanRecords / coerceRecordTypes', () => {
  it('normalizes keys and values', () => {
    const r = normalizeRecord({ ' Age ': ' 42 ', Name: ` Ada ${ZWSP} L `, Email: ' ADA@X.COM ', Active: 'yes', Empty: '  ' }, { lowercaseKeys: true, collapseWhitespace: true, toNumber: ['age'], toBoolean: ['active'], lowercase: ['email'], emptyToNull: true });
    expect(r).toEqual({ age: 42, name: 'Ada L', email: 'ada@x.com', active: true, empty: null });
    expect(normalizeRecord({ n: 'abc' }, { toNumber: ['n'] })).toEqual({ n: null });
    expect(normalizeRecord({ b: 'maybe' }, { toBoolean: ['b'] })).toEqual({ b: null });
  });
  it('never writes unsafe keys, even after key normalization', () => {
    const out = normalizeRecord(JSON.parse('{"__proto__": "x", " constructor ": "y", "PROTOTYPE": "z", "a": "1"}') as Record<string, unknown>, { lowercaseKeys: true });
    expect(Object.keys(out)).toEqual(['a']);
  });
  it('dedupes keeping first or last in O(n)', () => {
    const rows = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 1, v: 'c' }];
    expect(dedupeBy(rows, (r) => r.id)).toEqual([{ id: 1, v: 'a' }, { id: 2, v: 'b' }]);
    expect(dedupeBy(rows, (r) => r.id, { keep: 'last' })).toEqual([{ id: 2, v: 'b' }, { id: 1, v: 'c' }]);
    const big = Array.from({ length: 200_000 }, (_, i) => ({ id: i % 1000 }));
    expect(timed(() => dedupeBy(big, (r) => r.id))).toBeLessThan(500);
  });
  it('dedupeBy property: result keys are unique and a subsequence of input', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 20 })), fc.boolean(), (xs, last) => {
      const out = dedupeBy(xs, (x) => x, { keep: last ? 'last' : 'first' });
      expect(new Set(out).size).toBe(out.length);
      expect(new Set(out)).toEqual(new Set(xs));
    }));
  });
  it('runs a cleaning pipeline', () => {
    const rows = [{ email: ' A@x.com ', name: 'A' }, { email: '', name: '' }, { email: 'A@x.com', name: 'B' }];
    expect(cleanRecords(rows, { dedupeBy: (r) => r.email, keep: 'last' })).toEqual([{ email: 'A@x.com', name: 'B' }]);
    expect(cleanRecords(rows, { dropEmpty: false })).toHaveLength(3);
    expect(cleanRecords(rows, { filter: (r) => r.name === 'A', map: (r) => String(r.name) })).toEqual(['A']);
  });
  it('coerces types', () => {
    const out = coerceRecordTypes({ n: '4', f: '1.5e2', ok: 'Y', d: '2026-09-29T10:00:00Z', j: '{"a":1,"__proto__":{"x":1}}', s: 5, bad: 'x', keep: 'k', e: '' }, { n: 'integer', f: 'number', ok: 'boolean', d: 'date', j: 'json', s: 'string', bad: 'number', e: 'number' });
    expect(out).toMatchObject({ n: 4, f: 150, ok: true, s: '5', bad: null, keep: 'k', e: null });
    expect(out.d).toEqual(new Date('2026-09-29T10:00:00Z'));
    expect(out.j).toEqual({ a: 1 });
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(coerceRecordTypes({ a: 'x', b: '1' }, { a: 'integer' }, { onInvalid: 'keep', strip: true })).toEqual({ a: 'x' });
    expect(coerceRecordTypes({ a: '1.5' }, { a: 'integer' }, { onInvalid: 'omit' })).toEqual({});
    expect(coerceRecordTypes({ a: 'Infinity' }, { a: 'number' })).toEqual({ a: null });
  });
});

describe('text cleanup', () => {
  it('strips invisible and bidi control characters (Trojan Source)', () => {
    expect(stripInvisible(`ad${ZWSP}min${RLO}`)).toBe('admin');
    expect(stripInvisible(`${BOM}a${LRI}b${PDI}${ch(0x00ad)}c`)).toBe('abc');
    const family = `${ch(0xd83d, 0xdc68)}${ZWJ}${ch(0xd83d, 0xdc69)}`;
    expect(stripInvisible(family, { keepJoiners: true })).toBe(family);
    expect(stripInvisible(family)).toBe(`${ch(0xd83d, 0xdc68)}${ch(0xd83d, 0xdc69)}`);
    // Variation selectors survive (emoji presentation).
    expect(stripInvisible(`${ch(0x2764)}${ch(0xfe0f)}`)).toBe(`${ch(0x2764)}${ch(0xfe0f)}`);
    expect(stripInvisible('plain')).toBe('plain');
  });
  it('strips control characters', () => {
    expect(stripControl(`a${ch(0)}b${ch(0x1b)}c\td\n`)).toBe('abc\td\n');
    expect(stripControl('a\tb\r\n', { keepWhitespace: false })).toBe('ab');
    expect(stripControl(`x${ch(0x85)}y`)).toBe('xy');
  });
  it('normalizes Unicode and whitespace', () => {
    expect(normalizeUnicode('e' + ch(0x301))).toBe(ch(0xe9));
    expect(normalizeUnicode(ch(0xff46, 0xff55, 0xff4c, 0xff4c), 'NFKC')).toBe('full');
    expect(collapseWhitespace('  a \n\t b  ')).toBe('a b');
  });
  it('sanitizes search queries', () => {
    expect(sanitizeSearchQuery(`  hello${ch(0)}   world${ZWSP} `)).toBe('hello world');
    expect(sanitizeSearchQuery('x'.repeat(1000))).toHaveLength(200);
    expect(sanitizeSearchQuery(ch(0xff21, 0xff22))).toBe('AB');
    expect(sanitizeSearchQuery('abc', { maxLength: 2 })).toBe('ab');
  });
  it('truncates values for logs', () => {
    expect(truncateForLog('short')).toBe('short');
    const t = truncateForLog('x'.repeat(2000), 10);
    expect(t).toBe('xx…[+1998]');
    expect(t.length).toBeLessThanOrEqual(10);
    const cyc: Record<string, unknown> = { a: 1n };
    cyc.self = cyc;
    expect(truncateForLog(cyc)).toBe('{"a":"1n","self":"[Circular]"}');
    expect(truncateForLog(new Error('boom'))).toBe('Error: boom');
    expect(truncateForLog(undefined)).toBe('undefined');
    const emoji = ch(0xd83d, 0xde00).repeat(20);
    const cut = truncateForLog(emoji, 12);
    expect(cut.charCodeAt(cut.indexOf('…') - 1)).not.toBe(0xd83d);
  });
});

describe('safeFileName', () => {
  it('removes path traversal and separators', () => {
    expect(safeFileName('../../etc/passwd')).toBe('etc_passwd');
    expect(safeFileName('..\\..\\windows\\system32\\cmd.exe')).toBe('windows_system32_cmd.exe');
    expect(safeFileName('C:\\Users\\x.txt')).toBe('C_Users_x.txt');
    expect(safeFileName('/')).toBe('file');
    expect(safeFileName('..')).toBe('file');
  });
  it('replaces forbidden and control characters', () => {
    expect(safeFileName('a<b>c:d"e|f?g*h.txt')).toBe('a_b_c_d_e_f_g_h.txt');
    expect(safeFileName(`bad${ch(0)}name${ch(0x1f)}.txt`)).toBe('bad_name_.txt');
    expect(safeFileName(`evil${RLO}txt.exe`)).toBe('eviltxt.exe');
    expect(safeFileName('a???b', { replacement: '-' })).toBe('a-b');
    expect(safeFileName('a/b', { replacement: '' })).toBe('ab');
  });
  it('handles Windows reserved names, trailing dots and leading dots', () => {
    expect(safeFileName('CON')).toBe('_CON');
    expect(safeFileName('con.txt')).toBe('_con.txt');
    expect(safeFileName('LPT9.tar.gz')).toBe('_LPT9.tar.gz');
    expect(safeFileName('COM¹')).toBe('_COM¹');
    expect(safeFileName('console.txt')).toBe('console.txt');
    expect(safeFileName('name. . .')).toBe('name');
    expect(safeFileName('.htaccess')).toBe('htaccess');
    expect(safeFileName('.env', { allowLeadingDot: true })).toBe('.env');
    expect(safeFileName('   ')).toBe('file');
    expect(safeFileName('', { fallback: 'download' })).toBe('download');
  });
  it('truncates to UTF-8 bytes keeping the extension', () => {
    const long = `${'a'.repeat(300)}.pdf`;
    const out = safeFileName(long);
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(255);
    expect(out.endsWith('.pdf')).toBe(true);
    const multi = `${ch(0x20ac).repeat(200)}.txt`;
    const m = safeFileName(multi, { maxLength: 100 });
    expect(new TextEncoder().encode(m).length).toBeLessThanOrEqual(100);
    expect(m.endsWith('.txt')).toBe(true);
    expect(safeFileName(ch(0xd83d, 0xde00).repeat(10), { maxLength: 6 })).toBe(ch(0xd83d, 0xde00));
  });
  it('rejects unsafe replacement and options', () => {
    expect(() => safeFileName('x', { replacement: '/' })).toThrow(ValidationError);
    expect(() => safeFileName('x', { replacement: '.' })).toThrow(ValidationError);
    expect(() => safeFileName('x', { maxLength: 0 })).toThrow(ValidationError);
  });
  it('property: output never contains separators, control chars, or reserved device names', () => {
    fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (s) => {
      const out = safeFileName(s);
      expect(out.length).toBeGreaterThan(0);
      expect(/[/\\:*?"<>|]/.test(out)).toBe(false);
      expect(Array.from(out).some((c) => (c.codePointAt(0) ?? 0) < 0x20)).toBe(false);
      expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(255);
      expect(/[. ]$/.test(out)).toBe(false);
      expect(out.startsWith('.')).toBe(false);
      expect(/^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(out)).toBe(false);
    }), { numRuns: 500 });
  });
});

describe('normalizeEmail / normalizePhone', () => {
  it('normalizes e-mail addresses', () => {
    expect(normalizeEmail(' John.Doe@Example.COM ')).toBe('John.Doe@example.com');
    expect(normalizeEmail('John@Example.com.', { lowercaseLocal: true })).toBe('john@example.com');
    expect(normalizeEmail('J.o.h.n+tag@GoogleMail.com', { gmail: true })).toBe('john@gmail.com');
    expect(normalizeEmail('j.o+tag@example.com', { gmail: true })).toBe('j.o+tag@example.com');
    expect(normalizeEmail('a+b@example.com', { stripPlusTag: true })).toBe('a@example.com');
    for (const bad of ['', 'no-at', '@x.com', 'x@', 'a@b@c.com', `${'a'.repeat(250)}@x.com`, '+tag@x.com']) {
      expect(normalizeEmail(bad, { stripPlusTag: true })).toBeUndefined();
    }
  });
  it('normalizes phones to E.164', () => {
    expect(normalizePhone('(020) 7946 0958', { defaultCountryCode: '44' })).toBe('+442079460958');
    expect(normalizePhone('+1 (555) 010-9999')).toBe('+15550109999');
    expect(normalizePhone('0049 30 123456')).toBe('+4930123456');
    expect(normalizePhone('555-010-9999', { defaultCountryCode: '+1' })).toBe('+15550109999');
    expect(normalizePhone('98765 43210 ext. 12', { defaultCountryCode: '91' })).toBe('+919876543210');
    expect(normalizePhone('555-0109')).toBeUndefined();
    expect(normalizePhone('12+34')).toBeUndefined();
    expect(normalizePhone('call me')).toBeUndefined();
    expect(normalizePhone('+1234567890123456')).toBeUndefined();
    expect(normalizePhone('1234', { defaultCountryCode: 'x' })).toBeUndefined();
  });
});

describe('maskPii', () => {
  it('masks common PII', () => {
    expect(maskPii('Mail ada@example.com, card 4111 1111 1111 1111')).toBe('Mail a***@example.com, card **** **** **** 1111');
    expect(maskPii('IBAN GB82 WEST 1234 5698 7654 32 ok')).toBe('IBAN GB** **** **** **** **54 32 ok');
    expect(maskPii('IBAN GB82WEST12345698765432')).toBe('IBAN GB****************5432');
    expect(maskPii('SSN 123-45-6789')).toBe('SSN ***-**-6789');
    expect(maskPii('Call +1 (555) 010-9999 now')).toBe('Call +* (***) ***-**99 now');
  });
  it('leaves non-matching numbers and respects options', () => {
    expect(maskPii('order 4111 1111 1111 1112 and year 2026')).toBe('order 4111 1111 1111 1112 and year 2026');
    expect(maskPii('GB00 WEST 1234 5698 7654 32', { phone: false, card: false })).toBe('GB00 WEST 1234 5698 7654 32');
    expect(maskPii('ada@example.com', { email: false })).toBe('ada@example.com');
    expect(maskPii('4111111111111111', { maskChar: '#' })).toBe('############1111');
  });
  it('stays linear on adversarial input', () => {
    const attacks = ['a'.repeat(50_000) + '@', '1 '.repeat(50_000), '1-'.repeat(50_000), `${'a.'.repeat(30_000)}@`, '@a'.repeat(30_000), 'GB00 '.repeat(20_000)];
    for (const a of attacks) expect(timed(() => maskPii(a))).toBeLessThan(1000);
  });
});

describe('redact', () => {
  it('redacts secret-looking keys deeply without mutating', () => {
    const input = { user: 'ada', password: 'x', nested: { apiKey: 'k', api_key: 'k', list: [{ token: 't', ok: 1 }] }, headers: new Map([['Authorization', 'Bearer t'], ['Accept', 'json']]) };
    const out = redact(input);
    expect(out.password).toBe('[REDACTED]');
    expect(out.nested).toEqual({ apiKey: '[REDACTED]', api_key: '[REDACTED]', list: [{ token: '[REDACTED]', ok: 1 }] });
    expect(out.headers.get('Authorization')).toBe('[REDACTED]');
    expect(out.headers.get('Accept')).toBe('json');
    expect(input.password).toBe('x');
    expect(input.nested.list[0]?.token).toBe('t');
  });
  it('supports custom keys, replacement, depth, and cycles', () => {
    expect(redact({ ssn: '1', SSN: '2', a: 1 }, { keys: ['ssn'], replacement: null })).toEqual({ ssn: null, SSN: null, a: 1 });
    expect(redact({ a: { b: { c: { d: 1 } } } }, { maxDepth: 2 })).toEqual({ a: { b: '[Truncated]' } });
    expect(redact({ a: { password: 1 } }, { deep: false })).toEqual({ a: { password: 1 } });
    const cyc: Record<string, unknown> = { secret: 's' };
    cyc.me = cyc;
    expect(redact(cyc)).toEqual({ secret: '[REDACTED]', me: '[Circular]' });
    expect(redact({ note: 'mail ada@example.com' }, { maskStrings: true })).toEqual({ note: 'mail a***@example.com' });
    expect(redact({ Cookie: 'c', sessionId: 's', 'x-auth-token': 't' })).toEqual({ Cookie: '[REDACTED]', sessionId: '[REDACTED]', 'x-auth-token': '[REDACTED]' });
    const g = /secret/gi;
    expect(redact({ secret: 1, Secret: 2 }, { keys: [g] })).toEqual({ secret: '[REDACTED]', Secret: '[REDACTED]' });
  });
  it('drops __proto__ keys from untrusted input', () => {
    const evil = JSON.parse('{"__proto__": {"polluted": 1}, "a": 1}') as Record<string, unknown>;
    const out = redact(evil);
    expect(Object.keys(out)).toEqual(['a']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
