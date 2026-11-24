---
title: HTTP client
description: Calling APIs with interceptors, lifecycle hooks, cancellation, categorized errors, and default status messages, using the fetch client in @absoluteui/services.
---

`@absoluteui/services/http` is a `fetch` client for application APIs. It adds what `fetch` leaves to you: timeouts, safe retries, cancellation, typed errors with a user-facing message for every status, interceptors, and lifecycle hooks. `@absoluteui/services` is in preview and not yet published to npm.

| Module | Use it for |
|---|---|
| `@absoluteui/services/http` | The client (requests, interceptors, hooks, cancellation, errors), `paginate` (pages by `Link` header, cursor, or offset), and `uploadWithProgress` (uploads with a progress bar) |
| `@absoluteui/services/http-mock` | An in-memory `fetch` for tests, demos, and prototypes |
| `@absoluteui/helpers/http` | Status reason phrases and messages, Problem Details, header parsing (no network) |

## A client per API

```ts
import { createHttpClient } from '@absoluteui/services/http';

export const api = createHttpClient({
  baseUrl: 'https://api.example.com',
  timeoutMs: 15_000,
  auth: {
    getToken: async () => sessionStorage.getItem('token'),
    refresh: async () => { await fetch('/auth/refresh', { method: 'POST', credentials: 'include' }); },
  },
});

interface Employee { id: number; name: string }
const isEmployee = (d: unknown): d is Employee => typeof d === 'object' && d !== null && 'id' in d && 'name' in d;

const ada = await api.get('/employees/42', { validate: isEmployee });
await api.post('/leave', { from: '2026-10-05', to: '2026-10-09' }, { idempotencyKey: true });
```

`get`, `post`, `put`, `patch`, and `delete` resolve with the parsed body; `send` also returns the status, headers, and `requestId`. Retries apply only to idempotent methods (GET, HEAD, OPTIONS, PUT, DELETE) and to POST or PATCH with an idempotency key, and they honour `Retry-After`. The timeout covers the whole call, retries included.

## Interceptors transform, hooks observe

Interceptors change requests and responses. Add them when the client is created or at any time; `use` returns a function that removes the interceptor again.

```ts
import { createHttpClient } from '@absoluteui/services/http';

const api = createHttpClient({ baseUrl: '/api' });
const stopTenant = api.interceptors.request.use((request) => {
  request.headers.set('X-Tenant', 'acme');
  return undefined;
});
api.interceptors.response.use((response) => {
  const expires = response.headers.get('X-Session-Expires');
  if (expires) console.info('Session expires at', expires);
  return undefined;
});
stopTenant();
```

A request interceptor may also return a `Response` to answer without the network (an offline cache, for example). Order is deterministic: request interceptors run client -> child client -> request; response and error interceptors run in the reverse order.

Hooks are for observing: logging, analytics, progress indicators. They never change the call, are not awaited, and a hook that throws is reported to the logger and ignored.

| Hook | When |
|---|---|
| `beforeRequest` | Each exchange, after request interceptors, just before `fetch` |
| `afterRequest` | Each exchange, when `fetch` settles: headers received, or a network failure |
| `beforeResponse` | Each exchange, after response interceptors, before the body is read |
| `afterResponse` | The accepted response, with its body parsed and validated |
| `onRetry` | Before each retry |
| `onSuccess`, `onError`, `onCancel` | Once per call |
| `onComplete` | Once per call, last, with the outcome `success`, `error`, or `cancelled` |

`fetch` has no "request sent" event, so `afterRequest` fires when the response headers arrive or the connection fails. Hooks see request headers with credentials redacted.

```ts
import { createHttpClient } from '@absoluteui/services/http';

const api = createHttpClient({
  baseUrl: '/api',
  hooks: {
    afterRequest: ({ request, response, durationMs }) => {
      console.debug(request.method, request.url, response?.status ?? 'failed', `${String(durationMs)} ms`);
    },
    onComplete: ({ call, outcome }) => {
      console.debug(`call ${String(call.id)} ended: ${outcome}`);
    },
  },
});
await api.get('/employees', { hooks: { onSuccess: () => { console.info('Employees loaded'); } } });
```

Client hooks run before per-request hooks. `extend` creates a child client for one part of an API; it inherits the parent's options, interceptors, hooks, auth refresh, and ETag cache, and adds its own:

```ts
import { createHttpClient } from '@absoluteui/services/http';

const api = createHttpClient({ baseUrl: 'https://api.example.com', headers: { 'X-App': 'peoplehub' } });
const payroll = api.extend({ baseUrl: 'https://api.example.com/payroll', timeoutMs: 60_000 });
await payroll.get('/runs/2026-09');
```

## Cancelling requests

| Need | Use |
|---|---|
| Cancel one call | `signal` from an `AbortController` |
| Typeahead: only the latest search matters | `cancelKey: 'employee-search'`: starting a call with the same key cancels the previous one |
| Leave a page: cancel its loads | `group: 'page'` on the calls, then `api.cancelGroup('page')` |
| Sign out: cancel everything | `api.cancelAll('signed out')` (a parent also cancels its children's calls) |
| A global loading indicator | `api.onPendingChange((count) => ...)` and `api.pending` |

```ts
import { createHttpClient, isCancelled } from '@absoluteui/services/http';

const api = createHttpClient({ baseUrl: '/api' });
const search = async (text: string): Promise<unknown> => {
  try {
    return await api.get('/employees', { query: { q: text }, cancelKey: 'employee-search' });
  } catch (error) {
    if (isCancelled(error)) return undefined;
    throw error;
  }
};
void search('ad');
void search('ada');
```

A cancelled call rejects with an `HttpError` in the `cancelled` category. It is never retried, never reported to `reportError`, and fires `onCancel` instead of `onError`. When several callers share one deduplicated GET, one caller leaving does not cancel it for the others; it is cancelled when the last caller leaves.

## Errors you can act on

Every transport or HTTP failure rejects with an `HttpError`. Its `category` says why, `message` is ready to show to the user, and `retryable` says whether trying again may help.

| `category` | Typical cause |
|---|---|
| `network`, `offline` | No response; `offline` when the browser reports no connection |
| `timeout` | The deadline passed, or 408 or 504 |
| `cancelled` | The caller, a group, `cancelAll`, or a newer call with the same `cancelKey` |
| `unauthorized`, `forbidden` | 401, 403 |
| `not-found`, `conflict` | 404 or 410; 409 or 412 |
| `validation` | 400 or 422; `fields` holds field messages from Problem Details |
| `rate-limited` | 429; `retryAfterMs` holds the server's `Retry-After` |
| `unavailable`, `server` | 502 or 503; other 5xx |
| `bad-response`, `too-large` | The body was not in the expected format; it exceeded `maxResponseBytes` |
| `client` | Any other 4xx |

The error also carries `status`, `requestId` (from `X-Request-Id`, `X-Correlation-Id`, or `traceparent`), `problem` (RFC 9457), and `body` (the parsed JSON error body, for application error codes). `JSON.stringify(error)` gives a log-safe summary without headers, body, or query string.

For application-wide handling, `reportError` receives every failed call except cancellations, and reports calls that fail the same way (category and status) within two seconds once: ten parallel requests after a session ends produce one "session expired". `mapError` converts errors into your own types.

```ts
import { HttpError } from '@absoluteui/helpers/error';
import { createHttpClient } from '@absoluteui/services/http';

class SessionExpiredError extends Error {}

const api = createHttpClient({
  baseUrl: '/api',
  reportError: (error) => {
    if (error instanceof HttpError && error.category === 'unauthorized') location.assign('/sign-in');
  },
  mapError: (error) => (error instanceof HttpError && error.category === 'unauthorized' ? new SessionExpiredError(error.message) : error),
});
```

## Status messages

`@absoluteui/helpers/http` has a reason phrase and a plain-language message for every registered status code, and `0` for network failures. The client uses them for `HttpError.message`.

```ts
import { describeStatus, userMessageForStatus } from '@absoluteui/helpers/http';

userMessageForStatus(409); // 'This item was changed by someone else. Reload it and try again.'
describeStatus(429).reason; // 'Too Many Requests'
```

Override messages per client (`messages`) or per child client (child messages win, the parent's fill in). Translations are plain objects keyed by status, with the locale falling back from `fr-CA` to `fr` and then to the English defaults:

```ts
import { composeStatusMessages, localizedStatusMessages, statusMessageCatalog } from '@absoluteui/helpers/http';
import { createHttpClient } from '@absoluteui/services/http';

const messages = composeStatusMessages(
  statusMessageCatalog({ 404: 'No such employee.' }),
  localizedStatusMessages({ fr: { 409: 'Cet élément a été modifié par quelqu’un d’autre.' } }, navigator.language),
);
const api = createHttpClient({ baseUrl: '/api', messages });
```

Server text is not shown by default: it may expose internals or arrive untranslated. When the API is your own and writes its messages for users, set `trustServerMessages: true` (or a predicate) and the Problem Details `detail`, or a top-level `message`, becomes the error message. Control characters are removed and messages over 500 characters are ignored.

## Testing with the mock transport

```ts
import { createHttpClient } from '@absoluteui/services/http';
import { createMockFetch } from '@absoluteui/services/http-mock';

const fetch = createMockFetch([
  { method: 'GET', url: '/api/employees/42', body: { id: 42, name: 'Ada' } },
  { method: 'POST', url: '/api/leave', status: 422, body: { title: 'Invalid', status: 422, errors: { days: 'Choose at least one day.' } } },
  { url: '/api/slow', delayMs: 2_000, body: [] },
  { url: '/api/down', network: true },
]);
const api = createHttpClient({ fetch, baseUrl: 'http://localhost', retry: false });
await api.get('/api/employees/42');
console.log(fetch.calls.length);
```

Routes are tried in order; `times` limits how often a route answers, `respond` builds replies from the request, and unmatched requests reject with an error naming the request.
