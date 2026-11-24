import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  assertResponse,
  classifyHttpError,
  decodeExtValue,
  etagMatches,
  etagMatchesAny,
  getPaginationLinks,
  httpStatus,
  isClientError,
  isIdempotentMethod,
  isInformational,
  isJsonContentType,
  isProblemDetails,
  isRedirect,
  isRetryableStatus,
  isSafeMethod,
  isServerError,
  isSuccess,
  parseAcceptLanguage,
  parseCacheControl,
  parseContentDisposition,
  parseContentType,
  parseETag,
  parseETagList,
  parseHttpDate,
  parseLinkHeader,
  parseProblemDetails,
  parseRetryAfter,
  problemToFieldErrors,
  safeUrlForLog,
  statusText,
  userMessageForStatus,
} from '@absoluteui/helpers/http';
import { AbortError, HelperError, HttpError, LimitError, TimeoutError } from '@absoluteui/helpers/error';

const timed = (fn: () => void): number => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};

const response = (status: number, headers: Record<string, string> = {}, url = 'https://api.example.com/items?token=secret#x') => ({
  status,
  url,
  headers: { get: (name: string): string | null => headers[name.toLowerCase()] ?? null },
});

describe('status and methods', () => {
  it('classifies statuses', () => {
    expect(httpStatus.NOT_FOUND).toBe(404);
    expect(httpStatus.CONTENT_TOO_LARGE).toBe(413);
    expect(statusText(404)).toBe('Not Found');
    expect(statusText(599)).toBe('');
    expect([isInformational(103), isSuccess(204), isRedirect(308), isClientError(499), isServerError(500)]).toEqual([true, true, true, true, true]);
    expect([isSuccess(199), isSuccess(300), isSuccess(200.5), isServerError(600)]).toEqual([false, false, false, false]);
  });
  it('knows retryable statuses and method semantics', () => {
    for (const s of [408, 425, 429, 500, 502, 503, 504]) expect(isRetryableStatus(s)).toBe(true);
    for (const s of [400, 401, 404, 409, 501]) expect(isRetryableStatus(s)).toBe(false);
    expect(isRetryableStatus(409, [409])).toBe(true);
    expect(isRetryableStatus(503, new Set([409]))).toBe(false);
    expect(isIdempotentMethod('put')).toBe(true);
    expect(isIdempotentMethod('DELETE')).toBe(true);
    expect(isIdempotentMethod('POST')).toBe(false);
    expect(isIdempotentMethod('PATCH')).toBe(false);
    expect(isSafeMethod('GET')).toBe(true);
    expect(isSafeMethod('PUT')).toBe(false);
  });
  it('gives actionable user messages, replaceable for i18n', () => {
    expect(userMessageForStatus(503)).toBe('The service is temporarily unavailable. Try again in a few minutes.');
    expect(userMessageForStatus(0)).toMatch(/connection/);
    expect(userMessageForStatus(499)).toMatch(/Check the information/);
    expect(userMessageForStatus(599)).toMatch(/our side/);
    expect(userMessageForStatus(999)).toMatch(/Try again/);
    expect(userMessageForStatus(404, (s) => (s === 404 ? 'Introuvable.' : undefined))).toBe('Introuvable.');
    expect(userMessageForStatus(500, () => undefined)).toMatch(/our side/);
  });
});

describe('Retry-After and HTTP dates', () => {
  it('parses the three HTTP-date formats (RFC 9110 §5.6.7)', () => {
    const t = Date.UTC(1994, 10, 6, 8, 49, 37);
    expect(parseHttpDate('Sun, 06 Nov 1994 08:49:37 GMT')).toBe(t);
    expect(parseHttpDate('Sunday, 06-Nov-94 08:49:37 GMT', Date.UTC(2026, 0, 1))).toBe(t);
    expect(parseHttpDate('Sun Nov  6 08:49:37 1994')).toBe(t);
    expect(parseHttpDate('Sun, 31 Feb 1994 08:49:37 GMT')).toBeUndefined();
    expect(parseHttpDate('Sun, 06 Nov 1994 25:49:37 GMT')).toBeUndefined();
    expect(parseHttpDate('06 Nov 1994')).toBeUndefined();
    expect(parseHttpDate('Monday, 01-Jan-70 00:00:00 GMT', Date.UTC(2026, 0, 1))).toBe(Date.UTC(2070, 0, 1));
    expect(parseHttpDate('Monday, 01-Jan-80 00:00:00 GMT', Date.UTC(2026, 0, 1))).toBe(Date.UTC(1980, 0, 1));
  });
  it('converts Retry-After to a clamped delay', () => {
    expect(parseRetryAfter('120')).toBe(120_000);
    expect(parseRetryAfter(' 0 ')).toBe(0);
    expect(parseRetryAfter('999999')).toBe(3_600_000);
    expect(parseRetryAfter('999999', Date.now(), { maxMs: 10_000_000_000 })).toBe(999_999_000);
    const now = Date.UTC(2015, 9, 21, 7, 27, 0);
    expect(parseRetryAfter('Wed, 21 Oct 2015 07:28:00 GMT', now)).toBe(60_000);
    expect(parseRetryAfter('Wed, 21 Oct 2015 07:28:00 GMT', new Date(now + 120_000))).toBe(0);
    for (const bad of ['-1', '1.5', 'soon', '', null, undefined]) expect(parseRetryAfter(bad)).toBeUndefined();
  });
});

describe('content type and disposition', () => {
  it('parses content types', () => {
    expect(parseContentType('application/json; charset=UTF-8')).toEqual({ type: 'application', subtype: 'json', suffix: '', mediaType: 'application/json', params: { charset: 'utf-8' } });
    expect(parseContentType('Application/Problem+JSON')?.suffix).toBe('+json');
    expect(parseContentType('multipart/form-data; boundary="a;b=c"')?.params).toEqual({ boundary: 'a;b=c' });
    expect(parseContentType('text/plain; __proto__=x; a=1')?.params).toEqual({ a: '1' });
    for (const bad of ['', 'json', '/json', 'text/', null]) expect(parseContentType(bad)).toBeUndefined();
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('application/vnd.api+json; charset=utf-8')).toBe(true);
    expect(isJsonContentType('application/problem+json')).toBe(true);
    expect(isJsonContentType('text/json')).toBe(false);
    expect(isJsonContentType('application/jsonp')).toBe(false);
    expect(isJsonContentType(null)).toBe(false);
  });
  it('parses Content-Disposition with RFC 8187 filename* and sanitizes the name (RFC 6266 examples)', () => {
    expect(parseContentDisposition('Attachment; filename=example.html')).toMatchObject({ type: 'attachment', filename: 'example.html', safeFilename: 'example.html' });
    expect(parseContentDisposition('INLINE; FILENAME= "an example.html"')).toMatchObject({ type: 'inline', filename: 'an example.html' });
    expect(parseContentDisposition("attachment; filename*= UTF-8''%e2%82%ac%20rates")?.filename).toBe('€ rates');
    expect(parseContentDisposition(`attachment; filename="EURO rates"; filename*=utf-8''%e2%82%ac%20rates`)?.filename).toBe('€ rates');
    expect(parseContentDisposition("attachment; filename*=iso-8859-1'en'%A3%20rates")?.filename).toBe('£ rates');
    expect(parseContentDisposition('attachment; filename="..\\\\..\\\\evil.bat"')?.safeFilename).toBe('evil.bat');
    expect(parseContentDisposition('attachment; filename="../../etc/passwd"')?.safeFilename).toBe('passwd');
    expect(parseContentDisposition('attachment; filename="CON.txt"')?.safeFilename).toBe('_CON.txt');
    expect(parseContentDisposition("attachment; filename*=UTF-8''%ZZ; filename=fallback.txt")?.filename).toBe('fallback.txt');
    expect(parseContentDisposition("attachment; filename*=UTF-8''%C3%28")?.filename).toBeUndefined();
    expect(parseContentDisposition('attachment')).toEqual({ type: 'attachment', filename: undefined, safeFilename: undefined, params: {} });
    expect(parseContentDisposition('')).toBeUndefined();
    expect(decodeExtValue("koi8-r''%C1")).toBeUndefined();
    expect(decodeExtValue('no-quotes')).toBeUndefined();
  });
});

describe('cache control, ETags, Accept-Language', () => {
  it('parses Cache-Control', () => {
    const cc = parseCacheControl('public, max-age=3600, stale-while-revalidate=60, no-cache="Set-Cookie", MAX-AGE=1, s-maxage=99999999999');
    expect(cc).toMatchObject({ public: true, maxAge: 3600, staleWhileRevalidate: 60, noCache: true, sMaxAge: 2_147_483_648, noStore: false });
    expect(cc.directives['no-cache']).toBe('Set-Cookie');
    expect(parseCacheControl('max-stale').maxStale).toBe(Infinity);
    expect(parseCacheControl('max-age=abc').maxAge).toBeUndefined();
    expect(parseCacheControl('no-store, private, immutable')).toMatchObject({ noStore: true, private: true, immutable: true });
    expect(parseCacheControl(null).directives).toEqual({});
    expect(Object.keys(parseCacheControl('__proto__=1, constructor').directives)).toEqual([]);
  });
  it('parses and compares ETags (RFC 9110 §8.8.3.2 table)', () => {
    expect(parseETag('"xyzzy"')).toEqual({ weak: false, tag: 'xyzzy' });
    expect(parseETag('W/"xyzzy"')).toEqual({ weak: true, tag: 'xyzzy' });
    expect(parseETag('""')).toEqual({ weak: false, tag: '' });
    for (const bad of ['xyzzy', '"a"b"', 'w/"a"', '"a', 'W/ "a"']) expect(parseETag(bad)).toBeUndefined();
    // W/"1" vs W/"1": weak match, no strong match; W/"1" vs W/"2": none; W/"1" vs "1": weak only; "1" vs "1": both.
    expect([etagMatches('W/"1"', 'W/"1"', { weak: false }), etagMatches('W/"1"', 'W/"1"')]).toEqual([false, true]);
    expect([etagMatches('W/"1"', 'W/"2"', { weak: false }), etagMatches('W/"1"', 'W/"2"')]).toEqual([false, false]);
    expect([etagMatches('W/"1"', '"1"', { weak: false }), etagMatches('W/"1"', '"1"')]).toEqual([false, true]);
    expect([etagMatches('"1"', '"1"', { weak: false }), etagMatches('"1"', '"1"')]).toEqual([true, true]);
    expect(etagMatches(null, '"1"')).toBe(false);
    expect(parseETagList('"a", W/"b", junk, "c"')).toEqual([{ weak: false, tag: 'a' }, { weak: true, tag: 'b' }, { weak: false, tag: 'c' }]);
    expect(parseETagList(' * ')).toBe('*');
    expect(etagMatchesAny('"a", W/"b"', '"b"')).toBe(true);
    expect(etagMatchesAny('"a", W/"b"', '"b"', { weak: false })).toBe(false);
    expect(etagMatchesAny('*', '"x"')).toBe(true);
    expect(etagMatchesAny('*', undefined)).toBe(false);
  });
  it('parses Accept-Language sorted by quality', () => {
    expect(parseAcceptLanguage('fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5')).toEqual([
      { tag: 'fr-CH', q: 1 }, { tag: 'fr', q: 0.9 }, { tag: 'en', q: 0.8 }, { tag: 'de', q: 0.7 }, { tag: '*', q: 0.5 },
    ]);
    expect(parseAcceptLanguage('en;q=0.5, de, ja;q=0, xx;q=2, zh-Hant-TW;q=0.5, bad tag')).toEqual([{ tag: 'de', q: 1 }, { tag: 'en', q: 0.5 }, { tag: 'zh-Hant-TW', q: 0.5 }]);
    expect(parseAcceptLanguage(Array.from({ length: 100 }, () => 'en').join(','))).toHaveLength(50);
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(() => parseAcceptLanguage('a'.repeat(5000))).toThrow(LimitError);
  });
});

describe('Link header (RFC 8288)', () => {
  it('parses multiple links, quoted params and multiple rel values', () => {
    const header = '<https://api.example.com/items?page=2>; rel="next last"; title="Next, page", <https://api.example.com/items?page=1>; rel=prev, </items?page=1>;rel="first";type="application/json"';
    const links = parseLinkHeader(header);
    expect(links).toHaveLength(3);
    expect(links[0]).toEqual({ uri: 'https://api.example.com/items?page=2', rel: ['next', 'last'], params: { rel: 'next last', title: 'Next, page' } });
    expect(links[2]?.params.type).toBe('application/json');
    expect(getPaginationLinks(header, 'https://api.example.com/x')).toEqual({ next: 'https://api.example.com/items?page=2', last: 'https://api.example.com/items?page=2', prev: 'https://api.example.com/items?page=1', first: 'https://api.example.com/items?page=1' });
    expect(getPaginationLinks('<?p=0>; rel="previous"', 'https://a.example/list')).toEqual({ prev: 'https://a.example/list?p=0' });
    expect(getPaginationLinks(links)).toMatchObject({ first: '/items?page=1' });
  });
  it('decodes title*, skips malformed links and enforces limits', () => {
    expect(parseLinkHeader("</TheBook/chapter2>; rel=\"previous\"; title*=UTF-8'de'letztes%20Kapitel")[0]?.params['title*']).toBe('letztes Kapitel');
    expect(parseLinkHeader('garbage, <https://x.example/a>; rel=next')).toEqual([{ uri: 'https://x.example/a', rel: ['next'], params: { rel: 'next' } }]);
    expect(parseLinkHeader('<unterminated; rel=next')).toEqual([]);
    expect(parseLinkHeader('<a>; rel=next; __proto__=x')[0]?.params).toEqual({ rel: 'next' });
    expect(() => parseLinkHeader(Array.from({ length: 101 }, (_, i) => `<a${i}>; rel=x`).join(','))).toThrow(LimitError);
    expect(() => parseLinkHeader('<a>'.padEnd(20_000, ' '))).toThrow(LimitError);
    expect(parseLinkHeader(null)).toEqual([]);
  });
  it('stays linear on adversarial headers', () => {
    const inputs = ['<'.repeat(16_000), ';'.repeat(16_000), '"'.repeat(16_000), '<a>;'.repeat(3_000), `<a>; t="${'\\'.repeat(15_000)}`];
    for (const s of inputs) expect(timed(() => { try { parseLinkHeader(s); } catch { /* limit */ } })).toBeLessThan(200);
    expect(timed(() => parseCacheControl(','.repeat(16_000)))).toBeLessThan(200);
    expect(timed(() => parseETagList('"'.repeat(16_000)))).toBeLessThan(200);
  });
  it('property: parsers never throw anything but LimitError on arbitrary strings', () => {
    fc.assert(fc.property(fc.string({ maxLength: 300 }), (s) => {
      parseLinkHeader(s);
      parseContentType(s);
      parseContentDisposition(s);
      parseCacheControl(s);
      parseETagList(s);
      parseAcceptLanguage(s);
      parseRetryAfter(s);
    }), { numRuns: 500 });
  });
});

describe('Problem Details (RFC 9457)', () => {
  it('parses the RFC example with extensions', () => {
    const json = '{"type":"https://example.com/probs/out-of-credit","title":"You do not have enough credit.","detail":"Your current balance is 30, but that costs 50.","instance":"/account/12345/msgs/abc","balance":30,"accounts":["/account/12345","/account/67890"]}';
    const p = parseProblemDetails(json);
    expect(p).toMatchObject({ type: 'https://example.com/probs/out-of-credit', title: 'You do not have enough credit.', instance: '/account/12345/msgs/abc', extensions: { balance: 30, accounts: ['/account/12345', '/account/67890'] } });
    expect(p?.status).toBeUndefined();
  });
  it('defaults type, ignores wrongly typed members, and drops unsafe keys', () => {
    const p = parseProblemDetails({ title: 'Oops', status: '500', detail: 7, instance: null, x: 1 });
    expect(p).toEqual({ type: 'about:blank', title: 'Oops', extensions: { x: 1 }, fieldErrors: {} });
    const evil = parseProblemDetails('{"title":"t","__proto__":{"polluted":1},"constructor":{"prototype":{"x":1}}}');
    expect(evil?.extensions).toEqual({});
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(parseProblemDetails('not json')).toBeUndefined();
    expect(parseProblemDetails('[1]')).toBeUndefined();
    expect(parseProblemDetails({ foo: 1 })).toBeUndefined();
    expect(parseProblemDetails({ status: 99, title: 'x' })?.status).toBeUndefined();
    expect(() => parseProblemDetails('x'.repeat(2_000_001))).toThrow(LimitError);
  });
  it('maps validation extensions to field errors', () => {
    expect(problemToFieldErrors({ errors: [{ detail: 'must be a positive integer', pointer: '#/age' }, { detail: 'must be red, green or blue', pointer: '#/profile/color' }, { detail: 'x', pointer: '#/items/2/qty' }] })).toEqual({ age: 'must be a positive integer', 'profile.color': 'must be red, green or blue', 'items[2].qty': 'x' });
    expect(problemToFieldErrors({ 'invalid-params': [{ name: 'age', reason: 'must be a positive integer' }, { name: 'color', reason: 'must be one of' }] })).toEqual({ age: 'must be a positive integer', color: 'must be one of' });
    expect(problemToFieldErrors({ errors: { Email: ['The Email field is required.', 'second'], 'Items[0].Qty': 'bad' } })).toEqual({ Email: 'The Email field is required.', 'Items[0].Qty': 'bad' });
    expect(problemToFieldErrors({ violations: [{ field: 'name', message: 'must not be blank' }] })).toEqual({ name: 'must not be blank' });
    expect(problemToFieldErrors({ errors: [{ pointer: '/a~1b/c~0d', detail: 'escaped' }] })).toEqual({ 'a/b.c~d': 'escaped' });
    expect(problemToFieldErrors({ errors: { __proto__: 'x', constructor: 'y' } })).toEqual({});
    expect(problemToFieldErrors({ errors: Array.from({ length: 500 }, (_, i) => ({ field: `f${i}`, message: 'm' })) }, 10)).toEqual(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`f${i}`, 'm'])));
    expect(parseProblemDetails({ title: 'Invalid', status: 422, errors: [{ detail: 'required', pointer: '#/name' }] })?.fieldErrors).toEqual({ name: 'required' });
    expect(problemToFieldErrors('nope')).toEqual({});
  });
  it('recognizes problem details', () => {
    expect(isProblemDetails({ title: 'Out of credit', status: 403 })).toBe(true);
    expect(isProblemDetails({ type: 'about:blank' })).toBe(true);
    expect(isProblemDetails({ title: 5 })).toBe(false);
    expect(isProblemDetails({ status: 1000 })).toBe(false);
    expect(isProblemDetails({ detail: 'only detail' })).toBe(false);
    expect(isProblemDetails([])).toBe(false);
  });
});

describe('assertResponse / classifyHttpError', () => {
  it('passes expected responses and throws typed errors without leaking query strings', () => {
    expect(() => { assertResponse(response(200, { 'content-type': 'application/json' }), { expectContentType: 'json' }); }).not.toThrow();
    expect(() => { assertResponse(response(204), { expectContentType: 'json' }); }).not.toThrow();
    expect(() => { assertResponse(response(201), { expectStatus: [200, 201] }); }).not.toThrow();
    try {
      assertResponse(response(503), { method: 'get' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      const h = e as HttpError;
      expect(h.code).toBe('HLP_HTTP_STATUS');
      expect(h.status).toBe(503);
      expect(h.statusText).toBe('Service Unavailable');
      expect(h.method).toBe('GET');
      expect(h.url).toBe('https://api.example.com/items');
      expect(h.message).not.toContain('secret');
      expect(h.message).not.toContain('example.com');
    }
    try {
      assertResponse(response(200, { 'content-type': 'text/html' }), { expectContentType: 'json' });
      expect.unreachable();
    } catch (e) {
      expect((e as HttpError).code).toBe('HLP_HTTP_CONTENT_TYPE');
    }
    expect(() => { assertResponse(response(200, { 'content-type': 'text/csv; charset=utf-8' }), { expectContentType: ['text/csv', 'application/csv'] }); }).not.toThrow();
    expect(() => { assertResponse(response(200), { expectContentType: 'text/csv' }); }).toThrow(HttpError);
    expect(() => { assertResponse(response(404), { expectStatus: (s) => s < 500 }); }).not.toThrow();
    expect((() => { try { assertResponse(response(401)); } catch (e) { return (e as HttpError).kind; } return undefined; })()).toBe('unauthorized');
  });
  it('strips credentials, query and fragment from URLs', () => {
    expect(safeUrlForLog('https://u:p@api.example.com/a?token=x#f')).toBe('https://api.example.com/a');
    expect(safeUrlForLog('/relative/path?q=1')).toBe('/relative/path');
  });
  it('classifies errors', () => {
    expect(classifyHttpError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyHttpError(new DOMException('The operation was aborted.', 'AbortError'))).toBe('aborted');
    expect(classifyHttpError(new DOMException('Signal timed out.', 'TimeoutError'))).toBe('timeout');
    expect(classifyHttpError(new AbortError())).toBe('aborted');
    expect(classifyHttpError(new TimeoutError())).toBe('timeout');
    expect(classifyHttpError(new HttpError('X', 'Failed.', { status: 401 }))).toBe('auth');
    expect(classifyHttpError(new HttpError('X', 'Failed.', { status: 403 }))).toBe('auth');
    expect(classifyHttpError(new HttpError('X', 'Failed.', { status: 404 }))).toBe('client');
    expect(classifyHttpError(new HttpError('X', 'Failed.', { status: 408 }))).toBe('timeout');
    expect(classifyHttpError(new HttpError('X', 'Failed.', { status: 502 }))).toBe('server');
    expect(classifyHttpError({ status: 0 })).toBe('network');
    expect(classifyHttpError(new HelperError('X', 'x', { kind: 'forbidden' }))).toBe('auth');
    expect(classifyHttpError(new Error('x'))).toBe('unknown');
    expect(classifyHttpError('string')).toBe('unknown');
    expect(classifyHttpError(null)).toBe('unknown');
  });
});

describe('status messages for every status (PLAN-R6 D7)', () => {
  it('every registered status has a reason phrase and a default message', async () => {
    const { DEFAULT_STATUS_MESSAGES: messages, httpStatus: codes, statusText: reason, statusClass: cls } = await import('@absoluteui/helpers/http');
    for (const code of Object.values(codes)) {
      expect(reason(code), String(code)).not.toBe('');
      expect(messages[code], String(code)).toMatch(/\.$/);
    }
    expect(Object.keys(messages).map(Number).sort((a, b) => a - b)).toEqual([0, ...Object.values(codes)].sort((a, b) => a - b));
    expect([cls(0), cls(101), cls(204), cls(301), cls(404), cls(503), cls(700)]).toEqual(['network', 'informational', 'success', 'redirect', 'client-error', 'server-error', 'unknown']);
  });

  it('catalog precedence: first catalog, then locale chain, then defaults, then class fallbacks', async () => {
    const { composeStatusMessages, localizedStatusMessages, statusMessageCatalog, userMessageForStatus: msg } = await import('@absoluteui/helpers/http');
    const fr = localizedStatusMessages({ fr: { 404: 'Introuvable.', 409: 'Conflit.' }, 'fr-CA': { 404: 'Introuvable (CA).' } }, 'fr-CA');
    const app = composeStatusMessages(statusMessageCatalog({ 409: 'Someone else saved first.' }), fr);
    expect([msg(404, app), msg(409, app), msg(503, app), msg(299, app), msg(399), msg(199)]).toEqual([
      'Introuvable (CA).', 'Someone else saved first.', 'The service is temporarily unavailable. Try again in a few minutes.', 'Done.', 'This item is at a different address.', 'The request is in progress.',
    ]);
    expect(statusMessageCatalog({})(Number('constructor'))).toBeUndefined();
  });

  it('HttpError categories and retryability follow the status', () => {
    const cat = (status: number): [string, boolean] => { const e = new HttpError('X', 'x', { status }); return [e.category, e.retryable]; };
    expect([400, 401, 403, 404, 408, 409, 410, 412, 413, 418, 422, 425, 429, 500, 501, 502, 503, 504].map(cat)).toEqual([
      ['validation', false], ['unauthorized', false], ['forbidden', false], ['not-found', false], ['timeout', true], ['conflict', false], ['not-found', false], ['conflict', false], ['too-large', false],
      ['client', false], ['validation', false], ['client', true], ['rate-limited', true], ['server', true], ['server', false], ['unavailable', true], ['unavailable', true], ['timeout', true],
    ]);
    const cancelled = new HttpError('X', 'x', { status: 0, category: 'cancelled' });
    expect([cancelled.kind, cancelled.retryable, classifyHttpError(cancelled)]).toEqual(['aborted', false, 'aborted']);
    expect(new HttpError('X', 'x', { status: 0, category: 'timeout' }).kind).toBe('timeout');
  });
});
