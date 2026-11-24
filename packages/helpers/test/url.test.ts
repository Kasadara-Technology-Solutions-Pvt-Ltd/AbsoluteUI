import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  buildQuery,
  encodePathSegment,
  getDomain,
  getExtension,
  getFileNameFromUrl,
  getQueryParam,
  isAbsoluteUrl,
  isSafeUrl,
  isSameOrigin,
  joinUrl,
  normalizeUrl,
  parseQuery,
  parseUrl,
  removeQuery,
  safeRedirectTarget,
  withQuery,
} from '@absoluteui/helpers/url';
import { LimitError, ValidationError } from '@absoluteui/helpers/error';

const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe('buildQuery', () => {
  it('encodes primitives, arrays, dates, nested objects', () => {
    expect(buildQuery({ q: 'a b&c', page: 2, on: true, big: 10n, skip: undefined })).toBe('q=a%20b%26c&page=2&on=true&big=10');
    expect(buildQuery({ d: new Date(Date.UTC(2026, 0, 2)) })).toBe('d=2026-01-02T00%3A00%3A00.000Z');
    expect(buildQuery({ tag: ['x', 'y'] })).toBe('tag=x&tag=y');
    expect(buildQuery({ tag: ['x', 'y'] }, { arrayFormat: 'brackets' })).toBe('tag%5B%5D=x&tag%5B%5D=y');
    expect(buildQuery({ tag: ['x,1', 'y'] }, { arrayFormat: 'comma' })).toBe('tag=x%2C1,y');
    expect(buildQuery({ user: { name: 'Ann', address: { city: 'Pune' } } })).toBe('user%5Bname%5D=Ann&user%5Baddress%5D%5Bcity%5D=Pune');
    expect(buildQuery({ b: 1, a: 2 }, { sort: true, prefix: true })).toBe('?a=2&b=1');
    expect(buildQuery({}, { prefix: true })).toBe('');
  });
  it('handles null', () => {
    expect(buildQuery({ a: null, b: 1 })).toBe('a=&b=1');
    expect(buildQuery({ a: null, b: [null, 2] }, { skipNull: true })).toBe('b=2');
  });
  it('rejects unsafe keys and invalid dates', () => {
    const payload = JSON.parse('{"__proto__": {"x": 1}}') as Record<string, never>;
    expect(() => buildQuery(payload)).toThrow(ValidationError);
    expect(() => buildQuery({ d: new Date(NaN) })).toThrow(ValidationError);
  });
});

describe('parseQuery', () => {
  it('parses flat, repeated, bracket and nested keys', () => {
    expect(plain(parseQuery('?q=a+b&tag=x&tag=y&user[name]=Ann&user[age]=3&list[]=1&flag'))).toEqual({ q: 'a b', tag: ['x', 'y'], user: { name: 'Ann', age: '3' }, list: ['1'], flag: '' });
    expect(plain(parseQuery('a=1,2', { arrayFormat: 'comma' }))).toEqual({ a: ['1', '2'] });
    expect(plain(parseQuery('a=%E2%82%AC&b=%ZZ'))).toEqual({ a: '€', b: '%ZZ' });
    expect(plain(parseQuery('a[b=1&c]=2'))).toEqual({ 'a[b': '1', 'c]': '2' });
    expect(plain(parseQuery('#x'))).toEqual({});
    expect(plain(parseQuery('a=1#frag'))).toEqual({ a: '1' });
  });
  it('returns null-prototype objects at every level', () => {
    const r = parseQuery('a[b][c]=1');
    expect(Object.getPrototypeOf(r)).toBeNull();
    const a = r.a as Record<string, unknown>;
    expect(Object.getPrototypeOf(a)).toBeNull();
    expect(Object.getPrototypeOf(a.b)).toBeNull();
  });
  it('keeps the first value on shape conflicts', () => {
    expect(plain(parseQuery('a=1&a[b]=2'))).toEqual({ a: '1' });
    expect(plain(parseQuery('a[b]=2&a=1'))).toEqual({ a: { b: '2' } });
    expect(plain(parseQuery('a[][b]=1'))).toEqual({});
  });
  it('is prototype-pollution safe', () => {
    const attacks = ['__proto__[x]=1', '__proto__.x=1', 'constructor[prototype][x]=1', 'a[__proto__][x]=1', 'a[constructor][prototype][x]=1', '%5F%5Fproto%5F%5F[x]=1', 'prototype=1', '__proto__=1'];
    for (const a of attacks) {
      const r = parseQuery(a);
      expect(({} as Record<string, unknown>).x, a).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'x')).toBe(false);
      expect(Object.keys(r).every((k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype'), a).toBe(true);
    }
    expect(plain(parseQuery('__proto__.x=1'))).toEqual({ '__proto__.x': '1' });
  });
  it('enforces limits', () => {
    expect(() => parseQuery(Array.from({ length: 1001 }, (_, i) => `a${i}=1`).join('&'))).toThrow(LimitError);
    expect(() => parseQuery('a=1&b=2', { maxParams: 1 })).toThrow(LimitError);
    expect(() => parseQuery('a[b][c][d][e][f][g]=1')).toThrow(LimitError);
    expect(plain(parseQuery('a[b][c]=1', { maxDepth: 2 }))).toEqual({ a: { b: { c: '1' } } });
    expect(() => parseQuery('a'.repeat(70_000))).toThrow(LimitError);
  });
  it('is fast on adversarial input', () => {
    const t = performance.now();
    parseQuery(`${'['.repeat(30_000)}=1&${'a]'.repeat(10_000)}=2&${'%'.repeat(20_000)}`, { maxParams: 10, maxLength: 100_000 });
    expect(performance.now() - t).toBeLessThan(500);
  });
  it('round-trips buildQuery for flat string maps and arrays', () => {
    const key = fc.string({ minLength: 1, maxLength: 8 }).filter((k) => !['__proto__', 'constructor', 'prototype'].includes(k) && !k.includes('['));
    const val = fc.oneof(fc.string({ maxLength: 10 }), fc.array(fc.string({ maxLength: 5 }), { minLength: 2, maxLength: 4 }));
    fc.assert(
      fc.property(fc.dictionary(key, val), (obj) => {
        expect(plain(parseQuery(buildQuery(obj)))).toEqual(obj);
        expect(plain(parseQuery(buildQuery(obj, { arrayFormat: 'brackets' })))).toEqual(obj);
      }),
    );
  });
});

describe('joinUrl', () => {
  it('joins without double slashes and keeps protocol, query, hash', () => {
    expect(joinUrl('https://api.example.com/v1/', '/users/', 42)).toBe('https://api.example.com/v1/users/42');
    expect(joinUrl('https://x.test', 'a')).toBe('https://x.test/a');
    expect(joinUrl('https://x.test/', '')).toBe('https://x.test/');
    expect(joinUrl('/api', 'a//b', 'c/')).toBe('/api/a/b/c/');
    expect(joinUrl('api', 'x')).toBe('api/x');
    expect(joinUrl('https://x.test/a?q=1#h', 'b')).toBe('https://x.test/a/b?q=1#h');
    expect(joinUrl('//cdn.test/', 'x.js')).toBe('//cdn.test/x.js');
    expect(joinUrl('file:///c/', 'd')).toBe('file:///c/d');
  });
  it('confines traversal when asked', () => {
    expect(joinUrl('/files', 'a/../b', { confine: true })).toBe('/files/b');
    expect(joinUrl('/files', './a', { confine: true })).toBe('/files/a');
    for (const evil of ['..', '../etc', 'a/../../x', '%2e%2e/x', '%2E./x', '..\\x', 'a\\..\\..\\x']) {
      expect(() => joinUrl('https://x.test/files', evil, { confine: true }), evil).toThrow(ValidationError);
    }
    expect(joinUrl('/files', '..')).toBe('/files/..');
  });
  it('encodePathSegment', () => {
    expect(encodePathSegment('a/b c?#')).toBe('a%2Fb%20c%3F%23');
    expect(encodePathSegment('..')).toBe('%2E%2E');
    expect(encodePathSegment('.')).toBe('%2E');
    expect(joinUrl('/files', encodePathSegment('../x'), { confine: true })).toBe('/files/..%2Fx');
  });
});

describe('query editing', () => {
  it('withQuery replaces, appends, removes, keeps hash', () => {
    expect(withQuery('/list?page=1&q=x#top', { page: 2 })).toBe('/list?q=x&page=2#top');
    expect(withQuery('/list', { a: 'b c' })).toBe('/list?a=b%20c');
    expect(withQuery('/list?a=1&b=2', { a: undefined })).toBe('/list?b=2');
    expect(withQuery('/l?f[x]=1&f[y]=2&g=1', { f: { z: '3' } })).toBe('/l?g=1&f%5Bz%5D=3');
    expect(withQuery('https://x.test/?a%20b=1', { 'a b': 2 })).toBe('https://x.test/?a%20b=2');
  });
  it('removeQuery and getQueryParam', () => {
    expect(removeQuery('/a?x=1&y=2', ['x'])).toBe('/a?y=2');
    expect(removeQuery('/a?x=1', ['x'])).toBe('/a');
    expect(removeQuery('/a?x=1#f')).toBe('/a#f');
    expect(getQueryParam('https://x.test/?a=1&a=2', 'a')).toBe('1');
    expect(getQueryParam('/p?q=a+b%21', 'q')).toBe('a b!');
    expect(getQueryParam('/p?flag', 'flag')).toBe('');
    expect(getQueryParam('/p#?a=1', 'a')).toBeUndefined();
  });
});

describe('isSafeUrl', () => {
  it('allows http(s), mailto, tel and relative', () => {
    for (const ok of ['https://example.com', 'http://x.test/a?b#c', 'mailto:a@b.test', 'tel:+15551234', '/path', 'rel/path', '?q=1', '#frag', '//cdn.test/x']) expect(isSafeUrl(ok), ok).toBe(true);
  });
  it('rejects dangerous and obfuscated schemes', () => {
    const bad = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'java\u0000script:alert(1)',
      '\u0001javascript:alert(1)',
      'javascript\u2028:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://x.test/uuid',
      '\ufeffjavascript:alert(1)',
      '',
      '   ',
    ];
    for (const b of bad) expect(isSafeUrl(b), JSON.stringify(b)).toBe(false);
  });
  it('honours options', () => {
    expect(isSafeUrl('/a', { allowRelative: false })).toBe(false);
    expect(isSafeUrl('ftp://x.test', { allowedSchemes: ['ftp'] })).toBe(true);
    expect(isSafeUrl('https://x.test', { allowedSchemes: ['ftp'] })).toBe(false);
    expect(isSafeUrl(`https://x.test/${'a'.repeat(9000)}`)).toBe(false);
  });
  it('never accepts a string the browser would resolve to javascript:', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), fc.string({ maxLength: 5 }), (noise, sep) => {
        const s = `${noise}${sep}javascript:alert(1)`;
        if (isSafeUrl(s)) expect(new URL(s, 'https://base.test/').protocol).not.toBe('javascript:');
      }),
    );
  });
});

describe('origin helpers', () => {
  it('isAbsoluteUrl / parseUrl / isSameOrigin', () => {
    expect(isAbsoluteUrl('https://a.test')).toBe(true);
    expect(isAbsoluteUrl('mailto:x@y.test')).toBe(true);
    expect(isAbsoluteUrl('//a.test')).toBe(false);
    expect(isAbsoluteUrl('/a')).toBe(false);
    expect(parseUrl('not a url')).toBeUndefined();
    expect(parseUrl('/a', 'https://x.test')?.href).toBe('https://x.test/a');
    expect(isSameOrigin('https://a.test/x', 'https://A.test:443/y')).toBe(true);
    expect(isSameOrigin('https://a.test', 'http://a.test')).toBe(false);
    expect(isSameOrigin('https://a.test', 'https://a.test:8443')).toBe(false);
    expect(isSameOrigin('data:,x', 'data:,x')).toBe(false);
    expect(isSameOrigin('/a', '/a')).toBe(false);
  });
});

describe('safeRedirectTarget', () => {
  it('accepts local paths and allowed origins', () => {
    expect(safeRedirectTarget('/dashboard?tab=1#x')).toBe('/dashboard?tab=1#x');
    expect(safeRedirectTarget('https://app.test/x', { allowedOrigins: ['https://app.test'] })).toBe('https://app.test/x');
    expect(safeRedirectTarget('https://APP.test:443/x', { allowedOrigins: ['https://app.test/'] })).toBe('https://app.test/x');
  });
  it('rejects open-redirect payloads', () => {
    const bad = ['//evil.com', '/\\evil.com', '\\\\evil.com', '/\t/evil.com', ' //evil.com', 'https://evil.com', 'https://app.test.evil.com', 'https://app.test@evil.com', 'https://evil.com@app.test/', 'javascript:alert(1)', 'data:text/html,x', 'evil.com', 'http:evil.com', '/%09/evil.com', '', null, undefined];
    for (const b of bad) {
      const r = safeRedirectTarget(b, { allowedOrigins: ['https://app.test'], fallback: '/home' });
      expect(r === '/home' || new URL(r, 'https://app.test').origin === 'https://app.test', String(b)).toBe(true);
    }
    expect(safeRedirectTarget('//evil.com')).toBe('/');
    expect(safeRedirectTarget('/\\evil.com')).toBe('/');
    expect(safeRedirectTarget('https://evil.com', { fallback: '/home' })).toBe('/home');
  });
  it('never yields a cross-origin target (property)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), (s) => {
        const r = safeRedirectTarget(s, { allowedOrigins: ['https://app.test'] });
        expect(new URL(r, 'https://app.test/').origin).toBe('https://app.test');
      }),
    );
  });
});

describe('normalizeUrl and path pieces', () => {
  it('normalizes', () => {
    expect(normalizeUrl('HTTPS://Example.COM:443/a/../b?z=1&a=2#x', { sortQuery: true, removeFragment: true })).toBe('https://example.com/b?a=2&z=1');
    expect(normalizeUrl('http://x.test:80/a/', { removeTrailingSlash: true })).toBe('http://x.test/a');
    expect(normalizeUrl('http://x.test/?')).toBe('http://x.test/');
    expect(normalizeUrl('http://x.test/?b=%20&a=1&b=0', { sortQuery: true })).toBe('http://x.test/?a=1&b=%20&b=0');
    expect(normalizeUrl('nope')).toBeUndefined();
  });
  it('getDomain / getFileNameFromUrl / getExtension', () => {
    expect(getDomain('https://Sub.Example.com:8080/x')).toBe('sub.example.com');
    expect(getDomain('bad')).toBeUndefined();
    expect(getFileNameFromUrl('https://x.test/files/report%202026.pdf?v=1')).toBe('report 2026.pdf');
    expect(getFileNameFromUrl('/dir/')).toBeUndefined();
    expect(getFileNameFromUrl('/dir/%E0%A4%A')).toBe('%E0%A4%A');
    expect(getExtension('/a/photo.JPG?x=1')).toBe('jpg');
    expect(getExtension('archive.tar.gz')).toBe('gz');
    expect(getExtension('.env')).toBeUndefined();
    expect(getExtension('noext')).toBeUndefined();
    expect(getExtension('C:\\docs\\a.TXT')).toBe('txt');
  });
});
