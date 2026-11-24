import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, ValidationError, isAbortError } from '@absoluteui/helpers/error';
import { createHttpClient, isHttpError, paginate, redactHeaders, toProblem, uploadWithProgress, type FetchLike, type HttpLogger } from '@absoluteui/services/http';

type Handler = (url: string, init: RequestInit, n: number) => Response | Promise<Response>;

function mockFetch(handler: Handler): { fetch: FetchLike; calls: { url: string; init: RequestInit; headers: Headers }[] } {
  const calls: { url: string; init: RequestInit; headers: Headers }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init, headers: new Headers(init.headers) });
    return handler(url, init, calls.length);
  };
  return { fetch, calls };
}

const json = (data: unknown, init: ResponseInit = {}): Response => new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) } });
const hang = (init: RequestInit): Promise<Response> =>
  new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')); });
  });
const fast = { baseDelayMs: 1, maxDelayMs: 2_000 };

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected rejection');
}

describe('http client basics', () => {
  it('joins baseUrl, builds the query and parses JSON', async () => {
    const m = mockFetch(() => json({ id: 1 }));
    const api = createHttpClient({ baseUrl: 'https://api.test/v1/', fetch: m.fetch });
    const data = await api.get('/users', { query: { q: 'a b', tag: ['x', 'y'] } });
    expect(data).toEqual({ id: 1 });
    expect(m.calls[0]?.url).toBe('https://api.test/v1/users?q=a%20b&tag=x&tag=y');
    expect(m.calls[0]?.init.credentials).toBe('same-origin');
    expect(m.calls[0]?.headers.get('accept')).toContain('application/json');
  });

  it('serializes JSON bodies and passes platform bodies through', async () => {
    const m = mockFetch(() => new Response(null, { status: 204 }));
    const api = createHttpClient({ fetch: m.fetch });
    expect(await api.post('https://api.test/a', { x: 1 })).toBeUndefined();
    expect(m.calls[0]?.init.body).toBe('{"x":1}');
    expect(m.calls[0]?.headers.get('content-type')).toBe('application/json');
    const fd = new FormData();
    fd.append('f', 'v');
    await api.post('https://api.test/a', fd);
    expect(m.calls[1]?.init.body).toBe(fd);
    expect(m.calls[1]?.headers.get('content-type')).toBeNull();
    await expect(api.post('https://api.test/a', { n: 1n })).rejects.toMatchObject({ code: 'SVC_HTTP_INVALID_BODY' });
  });

  it('rejects unsafe URLs and methods', async () => {
    const api = createHttpClient({ fetch: mockFetch(() => json(1)).fetch });
    await expect(api.get('javascript:alert(1)')).rejects.toMatchObject({ code: 'SVC_HTTP_INVALID_URL' });
    await expect(api.request('GE T', 'https://a.test')).rejects.toMatchObject({ code: 'SVC_HTTP_INVALID_METHOD' });
  });

  it('returns each response type', async () => {
    const m = mockFetch(() => new Response('hello', { headers: { 'content-type': 'text/plain' } }));
    const api = createHttpClient({ fetch: m.fetch, dedupeGets: false });
    expect(await api.get('https://a.test', { responseType: 'text' })).toBe('hello');
    expect(await (await api.get('https://a.test', { responseType: 'blob' })).text()).toBe('hello');
    expect(new TextDecoder().decode(await api.get('https://a.test', { responseType: 'arrayBuffer' }))).toBe('hello');
    const stream = await api.get('https://a.test', { responseType: 'stream' });
    expect(await new Response(stream).text()).toBe('hello');
    const res = await api.get('https://a.test', { responseType: 'response' });
    expect(res.status).toBe(200);
    const full = await api.send('GET', 'https://a.test', { responseType: 'text' });
    expect(full.headers.get('content-type')).toBe('text/plain');
    expect((await api.head('https://a.test')).status).toBe(200);
  });

  it('fails JSON parsing and validation with SVC_HTTP_INVALID_RESPONSE', async () => {
    const m = mockFetch((url) => (url.endsWith('bad') ? new Response('{nope', { headers: { 'content-type': 'application/json' } }) : url.endsWith('proto') ? new Response('{"__proto__":{"x":1}}') : json({ name: 1 })));
    const api = createHttpClient({ fetch: m.fetch });
    const isUser = (d: unknown): d is { name: string } => typeof d === 'object' && d !== null && typeof (d as { name?: unknown }).name === 'string';
    const e1 = await rejection(api.get('https://a.test/u', { validate: isUser }));
    expect(e1).toBeInstanceOf(HttpError);
    expect(e1).toMatchObject({ code: 'SVC_HTTP_INVALID_RESPONSE', status: 200 });
    await expect(api.get('https://a.test/bad')).rejects.toMatchObject({ code: 'SVC_HTTP_INVALID_RESPONSE' });
    await expect(api.get('https://a.test/proto')).rejects.toMatchObject({ code: 'SVC_HTTP_INVALID_RESPONSE' });
    const typed: { name: string } = await api.get('https://a.test/ok', { validate: (d: unknown): d is { name: string } => typeof d === 'object' && d !== null, dedupe: false });
    expect(typed).toEqual({ name: 1 });
  });

  it('honours expectStatus', async () => {
    const m = mockFetch(() => json({ ok: true }, { status: 202 }));
    const api = createHttpClient({ fetch: m.fetch });
    await expect(api.post('https://a.test', {}, { expectStatus: 201 })).rejects.toMatchObject({ code: 'SVC_HTTP_STATUS', status: 202 });
    expect(await api.post('https://a.test', {}, { expectStatus: [201, 202] })).toEqual({ ok: true });
  });
});

describe('http errors', () => {
  it('maps RFC 9457 problem details to HttpError with fields and a safe message', async () => {
    const m = mockFetch(() =>
      new Response(JSON.stringify({ type: 'https://x.test/validation', title: 'Invalid', status: 422, detail: 'secret=1', errors: [{ detail: 'must be positive', pointer: '#/age' }] }), { status: 422, headers: { 'content-type': 'application/problem+json' } }),
    );
    const api = createHttpClient({ fetch: m.fetch });
    const e = await rejection(api.post('https://a.test/people?token=abc', { age: -1 }));
    expect(isHttpError(e, 422)).toBe(true);
    const he = e as HttpError;
    expect(he.code).toBe('SVC_HTTP_STATUS');
    expect(he.fields).toEqual({ age: 'must be positive' });
    expect(he.problem).toMatchObject({ title: 'Invalid', type: 'https://x.test/validation' });
    expect(he.url).toBe('https://a.test/people');
    expect(he.method).toBe('POST');
    expect(he.message).not.toContain('token');
    expect(he.message).not.toContain('secret');
    expect(toProblem(he)).toMatchObject({ title: 'Invalid', status: 422, fieldErrors: { age: 'must be positive' } });
  });

  it('synthesizes problems and supports custom messages', async () => {
    const api = createHttpClient({ fetch: mockFetch(() => new Response('oops', { status: 404 })).fetch, messages: (s) => (s === 404 ? 'Nicht gefunden.' : undefined) });
    const e = await rejection(api.get('https://a.test/x'));
    expect((e as HttpError).message).toBe('Nicht gefunden.');
    expect(toProblem(e)).toMatchObject({ type: 'about:blank', status: 404, detail: 'Nicht gefunden.' });
    expect(toProblem(new Error('x'))).toBeUndefined();
    expect(isHttpError(new Error('x'))).toBe(false);
  });

  it('maps network failures to status 0 and retries idempotent requests', async () => {
    const m = mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const api = createHttpClient({ fetch: m.fetch, retry: fast });
    const e = await rejection(api.get('https://a.test/x'));
    expect(e).toMatchObject({ status: 0, code: 'SVC_HTTP_NETWORK', kind: 'http' });
    expect(m.calls).toHaveLength(3);
  });

  it('redacts credential headers', () => {
    expect(redactHeaders({ Authorization: 'Bearer x', Cookie: 'a=b', 'X-Api-Key': 'k', Accept: 'json' })).toEqual({ authorization: '[REDACTED]', cookie: '[REDACTED]', 'x-api-key': '[REDACTED]', accept: 'json' });
    expect(redactHeaders(new Headers({ 'set-cookie': 's', 'x-trace': 't' }), ['x-trace'])).toEqual({ 'set-cookie': '[REDACTED]', 'x-trace': '[REDACTED]' });
    expect(redactHeaders([['Proxy-Authorization', 'p']])).toEqual({ 'proxy-authorization': '[REDACTED]' });
  });

  it('logs redacted headers and URLs without query', async () => {
    const entries: Record<string, unknown>[] = [];
    const logger: HttpLogger = { debug: (_m, c) => entries.push(c) };
    const api = createHttpClient({ fetch: mockFetch(() => json(1)).fetch, logger, headers: { Authorization: 'Bearer secret' } });
    await api.get('https://a.test/x?token=1');
    expect(JSON.stringify(entries)).not.toContain('secret');
    expect(JSON.stringify(entries)).not.toContain('token=1');
    expect(entries[0]).toMatchObject({ url: 'https://a.test/x', headers: { authorization: '[REDACTED]' } });
  });
});

describe('http retries', () => {
  it('retries retryable statuses and honours Retry-After', async () => {
    const m = mockFetch((_u, _i, n) => (n === 1 ? new Response('', { status: 503, headers: { 'retry-after': '1' } }) : json({ ok: 1 })));
    const api = createHttpClient({ fetch: m.fetch, retry: fast });
    const t0 = performance.now();
    expect(await api.get('https://a.test')).toEqual({ ok: 1 });
    expect(performance.now() - t0).toBeGreaterThanOrEqual(900);
    expect(m.calls).toHaveLength(2);
  });

  it('does not retry when Retry-After exceeds maxDelayMs, or for non-retryable statuses', async () => {
    const m = mockFetch(() => new Response('', { status: 429, headers: { 'retry-after': '120' } }));
    const api = createHttpClient({ fetch: m.fetch, retry: fast });
    const e = await rejection(api.get('https://a.test'));
    expect(e).toMatchObject({ status: 429, retryAfterMs: 120_000, category: 'rate-limited' });
    expect(m.calls).toHaveLength(1);
    const m2 = mockFetch(() => new Response('', { status: 400 }));
    await expect(createHttpClient({ fetch: m2.fetch, retry: fast }).get('https://a.test')).rejects.toMatchObject({ status: 400 });
    expect(m2.calls).toHaveLength(1);
  });

  it('never retries POST unless an idempotency key is set', async () => {
    const m = mockFetch(() => new Response('', { status: 503 }));
    const api = createHttpClient({ fetch: m.fetch, retry: { ...fast, retries: 2 } });
    await expect(api.post('https://a.test', { a: 1 })).rejects.toMatchObject({ status: 503 });
    expect(m.calls).toHaveLength(1);
    await expect(api.post('https://a.test', { a: 1 }, { idempotencyKey: true })).rejects.toMatchObject({ status: 503 });
    expect(m.calls).toHaveLength(4);
    const keys = m.calls.slice(1).map((c) => c.headers.get('idempotency-key'));
    expect(keys[0]).toMatch(/^[\da-f-]{36}$/);
    expect(new Set(keys).size).toBe(1);
    await expect(api.post('https://a.test', {}, { idempotencyKey: 'bad key\n' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('can disable retries per request or per client', async () => {
    const m = mockFetch(() => new Response('', { status: 503 }));
    await expect(createHttpClient({ fetch: m.fetch, retry: false }).get('https://a.test')).rejects.toBeInstanceOf(HttpError);
    await expect(createHttpClient({ fetch: m.fetch, retry: fast }).get('https://a.test', { retry: false })).rejects.toBeInstanceOf(HttpError);
    expect(m.calls).toHaveLength(2);
  });
});

describe('http cancellation', () => {
  it('rejects with a timeout HttpError after timeoutMs', async () => {
    const api = createHttpClient({ fetch: (_u, init) => hang(init), timeoutMs: 50 });
    const e = await rejection(api.get('https://a.test'));
    expect(e).toBeInstanceOf(HttpError);
    expect(e).toMatchObject({ code: 'SVC_HTTP_TIMEOUT', status: 0, category: 'timeout', kind: 'timeout', retryable: true });
  });

  it('rejects with a cancelled HttpError on caller abort and never retries', async () => {
    const m = mockFetch((_u, init) => hang(init));
    const api = createHttpClient({ fetch: m.fetch, retry: fast });
    const ctrl = new AbortController();
    const p = api.get('https://a.test', { signal: ctrl.signal, dedupe: false });
    setTimeout(() => { ctrl.abort(); }, 10);
    const e = await rejection(p);
    expect(e).toBeInstanceOf(HttpError);
    expect(e).toMatchObject({ code: 'SVC_HTTP_ABORTED', category: 'cancelled', retryable: false });
    expect(isAbortError(e)).toBe(true);
    expect(m.calls).toHaveLength(1);
  });

  it('rejects immediately for an already-aborted signal', async () => {
    const m = mockFetch(() => json(1));
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(createHttpClient({ fetch: m.fetch }).post('https://a.test', {}, { signal: ctrl.signal })).rejects.toMatchObject({ category: 'cancelled' });
    expect(m.calls).toHaveLength(0);
  });
});

describe('http caching and dedupe', () => {
  it('shares identical in-flight GETs and gives each caller its own copy', async () => {
    const m = mockFetch(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return json({ list: [1] });
    });
    const api = createHttpClient({ fetch: m.fetch });
    const [a, b] = await Promise.all([api.get<{ list: number[] }>('https://a.test/x'), api.get<{ list: number[] }>('https://a.test/x')]);
    expect(m.calls).toHaveLength(1);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    await Promise.all([api.get('https://a.test/x', { headers: { 'x-a': '1' } }), api.get('https://a.test/x')]);
    expect(m.calls).toHaveLength(3);
    await Promise.all([api.get('https://a.test/y', { dedupe: false }), api.get('https://a.test/y', { dedupe: false })]);
    expect(m.calls).toHaveLength(5);
  });

  it('a caller aborting does not cancel the shared request for others', async () => {
    const m = mockFetch(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return json({ v: 1 });
    });
    const api = createHttpClient({ fetch: m.fetch });
    const ctrl = new AbortController();
    const p1 = api.get('https://a.test/x', { signal: ctrl.signal });
    const p2 = api.get('https://a.test/x');
    ctrl.abort();
    await expect(p1).rejects.toMatchObject({ category: 'cancelled' });
    expect(await p2).toEqual({ v: 1 });
  });

  it('sends If-None-Match and serves the cached body on 304', async () => {
    const m = mockFetch((_u, _i, n) => (n === 1 ? json({ v: 1 }, { headers: { etag: '"abc"' } }) : new Response(null, { status: 304, headers: { etag: '"abc"' } })));
    const api = createHttpClient({ fetch: m.fetch, etagCache: true });
    const first = await api.get<{ v: number }>('https://a.test/x');
    first.v = 99;
    const second = await api.send('GET', 'https://a.test/x');
    expect(m.calls[1]?.headers.get('if-none-match')).toBe('"abc"');
    expect(second.data).toEqual({ v: 1 });
    expect(second.fromCache).toBe(true);
  });

  it('keys the ETag cache by credentials without storing them', async () => {
    const keys: string[] = [];
    const store = { map: new Map<string, { etag: string; body: unknown }>(), get(k: string) { return this.map.get(k); }, set(k: string, v: { etag: string; body: unknown }) { keys.push(k); this.map.set(k, v); }, delete(k: string) { this.map.delete(k); } };
    const m = mockFetch(() => json({ v: 1 }, { headers: { etag: 'W/"1"' } }));
    const api = createHttpClient({ fetch: m.fetch, etagCache: store, headers: { authorization: 'Bearer top-secret' } });
    await api.get('https://a.test/x');
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain('top-secret');
    await api.get('https://a.test/x', { cache: 'no-store' });
    expect(m.calls[1]?.headers.get('if-none-match')).toBeNull();
  });
});

describe('http auth', () => {
  it('refreshes once for concurrent 401s and retries each request once', async () => {
    let token = 'old';
    let refreshes = 0;
    const m = mockFetch(async (_u, init) => {
      await new Promise((r) => setTimeout(r, 5));
      return new Headers(init.headers).get('authorization') === 'Bearer new' ? json({ ok: true }) : new Response('', { status: 401 });
    });
    const api = createHttpClient({
      fetch: m.fetch,
      auth: {
        getToken: () => Promise.resolve(token),
        refresh: async () => {
          refreshes++;
          await new Promise((r) => setTimeout(r, 10));
          token = 'new';
        },
      },
    });
    const results = await Promise.all([api.get('https://a.test/1'), api.get('https://a.test/2'), api.post('https://a.test/3', {})]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshes).toBe(1);
    expect(m.calls).toHaveLength(6);
  });

  it('surfaces the 401 when refresh does not help', async () => {
    const api = createHttpClient({ fetch: mockFetch(() => new Response('', { status: 401 })).fetch, auth: { getToken: () => Promise.resolve(null), refresh: () => Promise.reject(new Error('no')) } });
    const e = await rejection(api.get('https://a.test'));
    expect(e).toMatchObject({ status: 401, kind: 'unauthorized' });
  });
});

describe('http interceptors and xsrf', () => {
  it('runs request, response and error interceptors', async () => {
    const m = mockFetch((url) => (url.endsWith('fail') ? new Response('', { status: 500 }) : json({ from: 'net' })));
    const api = createHttpClient({
      fetch: m.fetch,
      retry: false,
      onRequest: [
        (req) => { req.headers.set('x-trace', '1'); },
        (req) => (req.url.endsWith('local') ? json({ from: 'interceptor' }) : undefined),
      ],
      onResponse: (res) => (res.headers.get('x-replace') === null ? undefined : json({ replaced: true })),
      onError: (e) => (e instanceof HttpError && e.status === 500 ? json({ recovered: true }) : undefined),
    });
    expect(await api.get('https://a.test/x')).toEqual({ from: 'net' });
    expect(m.calls[0]?.headers.get('x-trace')).toBe('1');
    expect(await api.get('https://a.test/local')).toEqual({ from: 'interceptor' });
    expect(m.calls).toHaveLength(1);
    expect(await api.get('https://a.test/fail')).toEqual({ recovered: true });
  });

  it('adds the XSRF header only for same-origin unsafe methods', async () => {
    document.cookie = 'XSRF-TOKEN=tok%20en; path=/';
    try {
      const m = mockFetch(() => new Response(null, { status: 204 }));
      const api = createHttpClient({ fetch: m.fetch, xsrf: true });
      await api.post('/api/x', {});
      await api.get('/api/x');
      await api.post('https://elsewhere.test/x', {});
      expect(m.calls[0]?.headers.get('x-xsrf-token')).toBe('tok en');
      expect(m.calls[1]?.headers.get('x-xsrf-token')).toBeNull();
      expect(m.calls[2]?.headers.get('x-xsrf-token')).toBeNull();
    } finally {
      document.cookie = 'XSRF-TOKEN=; path=/; max-age=0';
    }
  });
});

function streamResponse(chunks: string[], headers: Record<string, string> = {}): Response {
  const enc = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      const next = chunks[i++];
      if (next === undefined) c.close();
      else c.enqueue(enc.encode(next));
    },
  });
  return new Response(body, { headers });
}

describe('http streaming limits and progress', () => {
  it('enforces maxResponseBytes from Content-Length and while streaming', async () => {
    const big = 'x'.repeat(2000);
    const api = createHttpClient({ fetch: () => Promise.resolve(streamResponse([big, big], { 'content-type': 'text/plain' })), maxResponseBytes: 3000, dedupeGets: false });
    const e = await rejection(api.get('https://a.test', { responseType: 'text' }));
    expect(e).toBeInstanceOf(HttpError);
    expect(e).toMatchObject({ code: 'SVC_HTTP_RESPONSE_TOO_LARGE', category: 'too-large' });
    const api2 = createHttpClient({ fetch: () => Promise.resolve(new Response('{}', { headers: { 'content-length': '5000' } })), maxResponseBytes: 3000 });
    await expect(api2.get('https://a.test')).rejects.toMatchObject({ code: 'SVC_HTTP_RESPONSE_TOO_LARGE' });
    const stream = await api.get('https://a.test', { responseType: 'stream' });
    await expect(new Response(stream).text()).rejects.toBeDefined();
    const small = createHttpClient({ fetch: () => Promise.resolve(streamResponse(['{"a":', '1}'])), maxResponseBytes: 100 });
    expect(await small.get('https://a.test')).toEqual({ a: 1 });
  });

  it('reports download progress from a ReadableStream body', async () => {
    const events: { loaded: number; total: number | null; percent: number | null }[] = [];
    const api = createHttpClient({ fetch: () => Promise.resolve(streamResponse(['aaaa', 'bbbb', 'cc'], { 'content-length': '10' })) });
    expect(await api.get('https://a.test', { responseType: 'text', onDownloadProgress: (p) => events.push(p) })).toBe('aaaabbbbcc');
    expect(events.map((e) => e.loaded)).toEqual([0, 4, 8, 10]);
    expect(events.at(-1)).toEqual({ loaded: 10, total: 10, percent: 100 });
    const unknown: (number | null)[] = [];
    const api2 = createHttpClient({ fetch: () => Promise.resolve(streamResponse(['ab', 'c'])) });
    await api2.get('https://a.test', { responseType: 'blob', onDownloadProgress: (p) => unknown.push(p.percent) });
    expect(unknown.slice(0, -1).every((p) => p === null)).toBe(true);
    expect(unknown.at(-1)).toBe(100);
  });
});

describe('paginate', () => {
  it('follows RFC 8288 next links', async () => {
    const m = mockFetch((url) => {
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      const headers: Record<string, string> = page < 3 ? { link: `<https://a.test/items?page=${String(page + 1)}>; rel="next"` } : {};
      return json([page], { headers });
    });
    const api = createHttpClient({ fetch: m.fetch });
    const pages: unknown[] = [];
    for await (const p of paginate(api, 'https://a.test/items', { strategy: 'link' })) pages.push(...p.items);
    expect(pages).toEqual([1, 2, 3]);
    const limited: number[] = [];
    for await (const p of paginate(api, 'https://a.test/items', { strategy: 'link', maxPages: 2, items: (d) => (Array.isArray(d) ? d.filter((x): x is number => typeof x === 'number') : []) })) limited.push(...p.items);
    expect(limited).toEqual([1, 2]);
  });

  it('refuses cross-origin next links by default', async () => {
    const api = createHttpClient({ fetch: () => Promise.resolve(json([], { headers: { link: '<https://evil.test/x>; rel="next"' } })), dedupeGets: false });
    const it = paginate(api, 'https://a.test/items', { strategy: 'link' });
    await it.next();
    await expect(it.next()).rejects.toMatchObject({ code: 'SVC_HTTP_CROSS_ORIGIN_PAGE' });
  });

  it('follows cursors and offsets', async () => {
    const m = mockFetch((url) => {
      const u = new URL(url);
      if (u.pathname === '/c') {
        const c = u.searchParams.get('cursor');
        return json({ items: [c ?? 'start'], nextCursor: c === null ? 'n1' : c === 'n1' ? 'n2' : null });
      }
      const offset = Number(u.searchParams.get('offset'));
      const all = [1, 2, 3, 4, 5];
      return json({ data: all.slice(offset, offset + Number(u.searchParams.get('limit'))), total: 5 });
    });
    const api = createHttpClient({ fetch: m.fetch });
    const cursors: unknown[] = [];
    for await (const p of paginate(api, 'https://a.test/c', { strategy: 'cursor', query: { q: 'x' } })) cursors.push(...p.items);
    expect(cursors).toEqual(['start', 'n1', 'n2']);
    expect(m.calls[1]?.url).toBe('https://a.test/c?q=x&cursor=n1');
    const offsets: unknown[] = [];
    for await (const p of paginate(api, 'https://a.test/o', { strategy: 'offset', pageSize: 2, getTotal: (d) => (d as { total: number }).total })) offsets.push(...p.items);
    expect(offsets).toEqual([1, 2, 3, 4, 5]);
  });
});

type FakeScript = (xhr: FakeXhr, body: unknown) => void;

class FakeXhr extends EventTarget {
  static script: FakeScript = () => undefined;
  readonly upload = new EventTarget();
  method = '';
  url = '';
  readonly requestHeaders = new Map<string, string>();
  responseType: XMLHttpRequestResponseType = '';
  withCredentials = false;
  timeout = 0;
  status = 0;
  statusText = '';
  responseText = '';
  response: unknown = null;
  responseHeaders = '';
  aborted = false;
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string): void {
    this.requestHeaders.set(k, v);
  }
  getAllResponseHeaders(): string {
    return this.responseHeaders;
  }
  send(body: unknown): void {
    FakeXhr.script(this, body);
  }
  abort(): void {
    this.aborted = true;
    this.dispatchEvent(new Event('abort'));
  }
  respond(status: number, text: string, headers = 'content-type: application/json'): void {
    this.status = status;
    this.responseText = text;
    this.response = text;
    this.responseHeaders = headers;
    this.dispatchEvent(new Event('load'));
  }
}

describe('uploadWithProgress', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const make = (): XMLHttpRequest => new FakeXhr() as unknown as XMLHttpRequest;

  it('reports upload progress and resolves with parsed JSON (global XMLHttpRequest)', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    let seen: FakeXhr | undefined;
    FakeXhr.script = (xhr) => {
      seen = xhr;
      xhr.upload.dispatchEvent(new ProgressEvent('progress', { loaded: 50, total: 100, lengthComputable: true }));
      xhr.upload.dispatchEvent(new ProgressEvent('progress', { loaded: 100, total: 100, lengthComputable: true }));
      xhr.respond(201, '{"id":7}', 'Content-Type: application/json\r\nETag: "e1"\r\n');
    };
    const events: (number | null)[] = [];
    const res = await uploadWithProgress('/files', new Blob(['x']), { headers: { 'x-a': '1' }, withCredentials: true, onProgress: (p) => events.push(p.percent) });
    expect(res).toMatchObject({ status: 201, body: { id: 7 } });
    expect(res.headers.get('etag')).toBe('"e1"');
    expect(events).toEqual([50, 100]);
    expect(seen?.requestHeaders.get('x-a')).toBe('1');
    expect(seen?.withCredentials).toBe(true);
    expect(seen?.method).toBe('POST');
  });

  it('rejects consistently with the client', async () => {
    FakeXhr.script = (xhr) => { xhr.respond(413, '{"title":"Too big","status":413}', 'content-type: application/problem+json'); };
    const e = await rejection(uploadWithProgress('/files', 'x', { createXhr: make }));
    expect(e).toMatchObject({ code: 'SVC_HTTP_STATUS', status: 413, problem: { title: 'Too big' } });
    FakeXhr.script = (xhr) => { xhr.dispatchEvent(new Event('error')); };
    await expect(uploadWithProgress('/files', 'x', { createXhr: make })).rejects.toMatchObject({ code: 'SVC_HTTP_NETWORK', status: 0 });
    FakeXhr.script = (xhr) => { xhr.dispatchEvent(new Event('timeout')); };
    await expect(uploadWithProgress('/files', 'x', { createXhr: make, timeoutMs: 10 })).rejects.toMatchObject({ code: 'SVC_HTTP_TIMEOUT', category: 'timeout' });
    FakeXhr.script = () => undefined;
    const ctrl = new AbortController();
    const p = uploadWithProgress('/files', 'x', { createXhr: make, signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ code: 'SVC_HTTP_ABORTED' });
    await expect(uploadWithProgress('javascript:x', 'x', { createXhr: make })).rejects.toMatchObject({ code: 'SVC_HTTP_INVALID_URL' });
    FakeXhr.script = (xhr) => { xhr.respond(200, '{bad'); };
    await expect(uploadWithProgress('/files', 'x', { createXhr: make })).rejects.toMatchObject({ code: 'SVC_HTTP_INVALID_RESPONSE' });
  });

  it('fails clearly without XMLHttpRequest', async () => {
    vi.stubGlobal('XMLHttpRequest', undefined);
    await expect(uploadWithProgress('/files', 'x')).rejects.toMatchObject({ code: 'SVC_HTTP_NO_XHR' });
  });
});
