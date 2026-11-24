// docs/PLAN-R6.md: interceptors, hooks, cancellation, error model, status messages, mock transport.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, isAbortError } from '@absoluteui/helpers/error';
import { localizedStatusMessages } from '@absoluteui/helpers/http';
import { createHttpClient, isCancelled, type HttpCallResult, type HttpHooks, type HttpLogger } from '@absoluteui/services/http';
import { createMockFetch } from '@absoluteui/services/http-mock';

const fast = { baseDelayMs: 1, maxDelayMs: 5 };
const rejection = async (p: Promise<unknown>): Promise<unknown> => p.then(() => { throw new Error('expected a rejection'); }, (e: unknown) => e);
const hang = (init: RequestInit): Promise<Response> =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')); });
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('interceptors', () => {
  it('adds and removes interceptors at runtime and per request, in documented order', async () => {
    const order: string[] = [];
    const fetch = createMockFetch([{ url: '/x', body: { ok: true } }]);
    const root = createHttpClient({ fetch, baseUrl: 'http://localhost', onRequest: () => { order.push('root:req:init'); return undefined; } });
    const eject = root.interceptors.request.use(() => { order.push('root:req:use'); return undefined; });
    root.interceptors.response.use((r) => { order.push('root:res'); return r; });
    const child = root.extend();
    child.interceptors.request.use(() => { order.push('child:req'); return undefined; });
    child.interceptors.response.use((r) => { order.push('child:res'); return r; });
    await child.get('/x', { interceptors: { request: () => { order.push('call:req'); return undefined; }, response: (r) => { order.push('call:res'); return r; } } });
    expect(order).toEqual(['root:req:init', 'root:req:use', 'child:req', 'call:req', 'call:res', 'child:res', 'root:res']);
    expect(root.interceptors.request.size).toBe(2);
    eject();
    eject();
    expect(root.interceptors.request.size).toBe(1);
    order.length = 0;
    await root.get('/x', { dedupe: false });
    expect(order).toEqual(['root:req:init', 'root:res']);
  });

  it('a request interceptor can change the request or answer it', async () => {
    const fetch = createMockFetch([{ url: '/x', respond: (r) => ({ body: { tenant: r.headers.get('x-tenant') } }) }]);
    const api = createHttpClient({ fetch, baseUrl: 'http://localhost' });
    api.interceptors.request.use((req) => { req.headers.set('x-tenant', 'acme'); return undefined; });
    expect(await api.get('/x')).toEqual({ tenant: 'acme' });
    api.interceptors.request.use(() => new Response('{"cached":true}', { headers: { 'content-type': 'application/json' } }));
    expect(await api.get('/x', { dedupe: false })).toEqual({ cached: true });
    expect(fetch.calls).toHaveLength(1);
  });
});

describe('extend', () => {
  it('inherits options and merges headers and messages; child settings win', async () => {
    const fetch = createMockFetch([{ url: /./, respond: (r) => ({ body: { url: r.url.href, a: r.headers.get('x-a'), b: r.headers.get('x-b') } }) }, { url: '/missing', status: 404 }]);
    const root = createHttpClient({ fetch, baseUrl: 'http://localhost/api', headers: { 'x-a': 'root', 'x-b': 'root' }, messages: (s) => (s === 500 ? 'Root 500.' : undefined) });
    const v2 = root.extend({ baseUrl: 'http://localhost/v2', headers: () => ({ 'x-b': 'child' }), messages: (s) => (s === 404 ? 'Child 404.' : undefined) });
    expect(await v2.get('/people')).toEqual({ url: 'http://localhost/v2/people', a: 'root', b: 'child' });
    const f2 = createMockFetch([{ url: /404/, status: 404 }, { url: /500/, status: 500 }]);
    const r2 = createHttpClient({ fetch: f2, retry: false, messages: (s) => (s === 500 ? 'Root 500.' : undefined) }).extend({ messages: (s) => (s === 404 ? 'Child 404.' : undefined) });
    expect(await rejection(r2.get('http://localhost/404'))).toMatchObject({ message: 'Child 404.' });
    expect(await rejection(r2.get('http://localhost/500'))).toMatchObject({ message: 'Root 500.' });
  });

  it('cancelling the parent cancels the child; cancelling the child leaves the parent', async () => {
    const root = createHttpClient({ fetch: (_u, init) => hang(init) });
    const child = root.extend();
    const a = root.get('https://a.test/1');
    const b = child.get('https://a.test/2');
    expect(root.pending).toHaveLength(2);
    expect(child.pending).toHaveLength(1);
    expect(child.cancelAll()).toBe(1);
    expect(await rejection(b)).toMatchObject({ category: 'cancelled' });
    expect(root.pending).toHaveLength(1);
    const c = child.get('https://a.test/3');
    expect(root.cancelAll('signed out')).toBe(2);
    expect(await rejection(a)).toMatchObject({ category: 'cancelled', details: { reason: 'signed out' } });
    expect(await rejection(c)).toMatchObject({ category: 'cancelled' });
  });
});

describe('hooks', () => {
  const recorder = (log: string[], tag = ''): HttpHooks => ({
    beforeRequest: (r) => { log.push(`${tag}beforeRequest#${String(r.attempt)}`); },
    afterRequest: (i) => { log.push(`${tag}afterRequest:${i.response ? String(i.response.status) : 'error'}`); },
    beforeResponse: (i) => { log.push(`${tag}beforeResponse:${String(i.response.status)}`); },
    afterResponse: (i) => { log.push(`${tag}afterResponse:${String(i.response.status)}`); },
    onRetry: (i) => { log.push(`${tag}onRetry#${String(i.attempt)}`); },
    onSuccess: () => { log.push(`${tag}onSuccess`); },
    onError: (e) => { log.push(`${tag}onError:${e instanceof HttpError ? e.category : e.name}`); },
    onCancel: () => { log.push(`${tag}onCancel`); },
    onComplete: (r) => { log.push(`${tag}onComplete:${r.outcome}`); },
  });

  it('fires per exchange and once per call, client hooks before request hooks', async () => {
    const log: string[] = [];
    const fetch = createMockFetch([{ url: '/x', status: 503, times: 1 }, { url: '/x', body: 1 }]);
    const api = createHttpClient({ fetch, baseUrl: 'http://localhost', retry: fast, hooks: recorder(log, 'c.') });
    await api.get('/x', { hooks: { onSuccess: () => { log.push('r.onSuccess'); } } });
    expect(log).toEqual([
      'c.beforeRequest#1', 'c.afterRequest:503', 'c.beforeResponse:503', 'c.onRetry#1',
      'c.beforeRequest#2', 'c.afterRequest:200', 'c.beforeResponse:200', 'c.afterResponse:200',
      'c.onSuccess', 'r.onSuccess', 'c.onComplete:success',
    ]);
  });

  it('reports failures through onError and cancellations only through onCancel', async () => {
    const log: string[] = [];
    const results: HttpCallResult[] = [];
    const fetch = createMockFetch([{ url: '/bad', status: 422, body: { title: 'Invalid', status: 422, errors: { name: 'Required.' } } }, { url: '/net', network: true }]);
    const api = createHttpClient({ fetch, baseUrl: 'http://localhost', retry: false, hooks: { ...recorder(log), onComplete: (r) => { results.push(r); } } });
    await rejection(api.post('/bad', {}));
    await rejection(api.post('/net', {}));
    const hung = createHttpClient({ fetch: (_u, init) => hang(init), hooks: recorder(log) });
    const p = hung.get('https://a.test');
    hung.cancelAll();
    await rejection(p);
    expect(log.filter((l) => l.startsWith('on'))).toEqual(['onError:validation', 'onError:network', 'onCancel', 'onComplete:cancelled']);
    expect(results.map((r) => [r.outcome, r.error instanceof HttpError ? r.error.status : undefined])).toEqual([['error', 422], ['error', 0]]);
  });

  it('hooks see redacted headers, and a failing hook never breaks the call', async () => {
    const warn = vi.fn();
    const logger: HttpLogger = { warn };
    const seen: Record<string, string>[] = [];
    const fetch = createMockFetch([{ url: '/x', body: 'ok' }]);
    const api = createHttpClient({ fetch, baseUrl: 'http://localhost', logger, headers: { authorization: 'Bearer secret' }, hooks: {
      beforeRequest: (r) => { seen.push({ ...r.headers }); throw new Error('hook bug'); },
      afterResponse: () => Promise.reject(new Error('async hook bug')),
    } });
    expect(await api.get('/x', { responseType: 'text' })).toBe('ok');
    await new Promise((r) => setTimeout(r, 0));
    expect(seen[0]?.authorization).toBe('[REDACTED]');
    expect(warn.mock.calls.map((c) => (c[1] as { hook?: string }).hook)).toEqual(['beforeRequest', 'afterResponse']);
  });
});

describe('cancellation', () => {
  it('cancelGroup cancels only that group; pending and onPendingChange track calls', async () => {
    const api = createHttpClient({ fetch: (_u, init) => hang(init) });
    const counts: number[] = [];
    const off = api.onPendingChange((n) => counts.push(n));
    const a = api.get('https://a.test/a', { group: 'search' });
    const b = api.get('https://a.test/b', { group: 'search' });
    const c = api.get('https://a.test/c', { group: 'report' });
    expect(api.pending.map((p) => p.group)).toEqual(['search', 'search', 'report']);
    expect(api.cancelGroup('search')).toBe(2);
    await Promise.all([rejection(a), rejection(b)]);
    expect(api.pending.map((p) => p.url)).toEqual(['https://a.test/c']);
    api.cancelAll();
    expect(isCancelled(await rejection(c))).toBe(true);
    expect(counts).toEqual([1, 2, 3, 2, 1, 0]);
    off();
  });

  it('cancelKey lets the latest call win (typeahead)', async () => {
    const fetch = createMockFetch([{ url: /q=a$/, delayMs: 50, body: ['a'] }, { url: /q=ab$/, body: ['ab'] }]);
    const api = createHttpClient({ fetch });
    const first = api.get('http://localhost/search', { query: { q: 'a' }, cancelKey: 'employee-search' });
    const second = api.get('http://localhost/search', { query: { q: 'ab' }, cancelKey: 'employee-search' });
    const e = await rejection(first);
    expect(e).toMatchObject({ category: 'cancelled', details: { reason: 'superseded' } });
    expect(isAbortError(e)).toBe(true);
    expect(await second).toEqual(['ab']);
  });

  it('a deduplicated GET is aborted only when every caller has left (regression, PLAN-R6 §5)', async () => {
    let sharedSignal: AbortSignal | undefined;
    const api = createHttpClient({ fetch: (_u, init) => { sharedSignal = init.signal ?? undefined; return hang(init); } });
    const c1 = new AbortController();
    const c2 = new AbortController();
    const p1 = api.get('https://a.test/x', { signal: c1.signal });
    const p2 = api.get('https://a.test/x', { signal: c2.signal });
    await new Promise((r) => setTimeout(r, 0));
    c1.abort();
    await rejection(p1);
    expect(sharedSignal?.aborted).toBe(false);
    c2.abort();
    await rejection(p2);
    expect(sharedSignal?.aborted).toBe(true);
  });
});

describe('error model', () => {
  it('categorizes failures and carries request ids and retry hints', async () => {
    const fetch = createMockFetch([
      { url: '/422', status: 422, body: { title: 'Invalid', status: 422, errors: { email: 'Enter a valid email address.' } }, headers: { 'x-request-id': 'req-9' } },
      { url: '/503', status: 503, headers: { 'retry-after': '1' } },
      { url: '/409', status: 409 },
      { url: '/bad', body: 'not json', headers: { 'content-type': 'application/json' } },
    ]);
    const api = createHttpClient({ fetch, baseUrl: 'http://localhost', retry: false });
    const e422 = await rejection(api.post('/422', {}));
    expect(e422).toMatchObject({ category: 'validation', retryable: false, requestId: 'req-9', fields: { email: 'Enter a valid email address.' }, message: 'Some of the information is not valid. Check it and try again.' });
    expect(await rejection(api.get('/503'))).toMatchObject({ category: 'unavailable', retryable: true, retryAfterMs: 1000 });
    expect(await rejection(api.put('/409', {}))).toMatchObject({ category: 'conflict' });
    expect(await rejection(api.get('/bad'))).toMatchObject({ code: 'SVC_HTTP_INVALID_RESPONSE', category: 'bad-response' });
    const json = JSON.parse(JSON.stringify(e422)) as Record<string, unknown>;
    expect(json).toMatchObject({ name: 'HttpError', status: 422, category: 'validation', requestId: 'req-9', url: 'http://localhost/422' });
    expect(Object.keys(json)).not.toContain('problem');
  });

  it('reports network failures as offline when the browser is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const api = createHttpClient({ fetch: createMockFetch([{ url: /./, network: true }]), retry: false });
    expect(await rejection(api.get('http://localhost/x'))).toMatchObject({ code: 'SVC_HTTP_NETWORK', category: 'offline', retryable: true });
  });

  it('uses server messages only when trusted, and strips control characters', async () => {
    const detail = `Leave overlaps an approved request.${String.fromCharCode(7)}`;
    const routes = [{ url: '/leave', status: 409, body: { title: 'Conflict', status: 409, detail } }, { url: '/plain', status: 400, body: { message: 'Start date is after end date.' } }];
    const untrusted = createHttpClient({ fetch: createMockFetch(routes), baseUrl: 'http://localhost', retry: false });
    expect(await rejection(untrusted.post('/leave', {}))).toMatchObject({ message: 'This item was changed by someone else. Reload it and try again.' });
    const trusted = createHttpClient({ fetch: createMockFetch(routes), baseUrl: 'http://localhost', retry: false, trustServerMessages: true });
    expect(await rejection(trusted.post('/leave', {}))).toMatchObject({ message: 'Leave overlaps an approved request.' });
    expect(await rejection(trusted.post('/plain', {}))).toMatchObject({ message: 'Start date is after end date.' });
    const onlyConflicts = createHttpClient({ fetch: createMockFetch(routes), baseUrl: 'http://localhost', retry: false, trustServerMessages: ({ status }) => status === 409 });
    expect(await rejection(onlyConflicts.post('/plain', {}))).toMatchObject({ message: 'Some of the information is not valid. Check it and try again.' });
  });

  it('reportError runs once for parallel failures of the same kind and never for cancellations; mapError converts', async () => {
    const reported: string[] = [];
    class SessionExpired extends Error {}
    const fetch = createMockFetch([{ url: /./, status: 401 }]);
    const api = createHttpClient({
      fetch,
      retry: false,
      reportError: (e) => { reported.push(e.message); },
      mapError: (e) => (e instanceof HttpError && e.category === 'unauthorized' ? new SessionExpired(e.message) : e),
    });
    const errors = await Promise.all([1, 2, 3].map((n) => rejection(api.get(`http://localhost/${String(n)}`))));
    expect(errors.every((e) => e instanceof SessionExpired)).toBe(true);
    expect(reported).toEqual(['Your session has ended. Sign in again to continue.']);
    const hung = createHttpClient({ fetch: (_u, init) => hang(init), reportError: (e) => { reported.push(e.message); } });
    const p = hung.get('https://a.test');
    hung.cancelAll();
    await rejection(p);
    expect(reported).toHaveLength(1);
  });

  it('localized catalogs set HttpError messages', async () => {
    const api = createHttpClient({ fetch: createMockFetch([{ url: /./, status: 404 }]), retry: false, messages: localizedStatusMessages({ fr: { 404: 'Élément introuvable.' } }, 'fr-FR') });
    expect(await rejection(api.get('http://localhost/x'))).toMatchObject({ message: 'Élément introuvable.' });
  });
});

describe('createMockFetch', () => {
  it('matches routes in order, honours times, records calls, and resets', async () => {
    const fetch = createMockFetch([{ method: 'GET', url: '/a', body: 1, times: 1 }, { url: '/a', body: 2 }, { url: 'http://localhost/b?x=1', body: 'b' }]);
    const api = createHttpClient({ fetch, dedupeGets: false });
    expect([await api.get('http://localhost/a'), await api.get('http://localhost/a'), await api.get('http://localhost/b?x=1', { responseType: 'text' })]).toEqual([1, 2, 'b']);
    expect(fetch.calls.map((c) => c.route)).toEqual([0, 1, 2]);
    fetch.reset();
    expect(fetch.calls).toHaveLength(0);
    expect(await api.get('http://localhost/a')).toBe(1);
  });

  it('handles unmatched requests as configured and aborts delays', async () => {
    await expect(createMockFetch()('http://localhost/none', {})).rejects.toThrow('No mock route for GET /none.');
    await expect(createMockFetch([], { onUnhandled: 'network' })('http://localhost/none', {})).rejects.toBeInstanceOf(TypeError);
    const r = await createMockFetch([], { onUnhandled: () => ({ status: 404, body: { title: 'Not Found', status: 404 } }) })('http://localhost/none', {});
    expect([r.status, r.headers.get('content-type')]).toEqual([404, 'application/problem+json']);
    const ctrl = new AbortController();
    const slow = createMockFetch([{ url: /./, delayMs: 1000, body: 1 }])('http://localhost/x', { signal: ctrl.signal });
    ctrl.abort();
    await expect(slow).rejects.toBeDefined();
  });
});

describe('paginate with a client baseUrl on another origin', () => {
  it('follows same-origin next links and still rejects cross-origin ones (regression)', async () => {
    const { paginate } = await import('@absoluteui/services/http');
    const fetch = createMockFetch([
      { url: 'https://api.test/items?page=2', body: [3] },
      { url: 'https://api.test/items', body: [1, 2], headers: { link: '<https://api.test/items?page=2>; rel="next"' } },
      { url: 'https://api.test/evil', body: [1], headers: { link: '<https://other.test/items>; rel="next"' } },
    ]);
    const api = createHttpClient({ fetch, baseUrl: 'https://api.test' });
    const items: unknown[] = [];
    for await (const page of paginate(api, '/items', { strategy: 'link' })) items.push(...page.items);
    expect(items).toEqual([1, 2, 3]);
    const pages = paginate(api, '/evil', { strategy: 'link' });
    await pages.next();
    await expect(pages.next()).rejects.toMatchObject({ code: 'SVC_HTTP_CROSS_ORIGIN_PAGE' });
  });
});
