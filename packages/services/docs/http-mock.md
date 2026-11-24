An in-memory `fetch` for tests, demos, and prototypes: a route table with statuses, JSON bodies, headers, delays, and dropped connections, plus a log of every call. Pass it to `createHttpClient({ fetch })` (or to anything else that accepts a `fetch`) and your code runs unchanged without a server. The [HTTP client guide](/docs/guides/http/) shows it alongside the client.

### How do I answer requests with canned JSON and check what was sent?

Routes are tried in order and the first match answers. A string `url` matches the pathname; include `?` to match the query too. `calls` records each request, with the JSON body already parsed.

```ts
import { createHttpClient } from '@absoluteui/services/http';
import { createMockFetch } from '@absoluteui/services/http-mock';

const fetch = createMockFetch([
  { method: 'GET', url: '/api/employees/42', body: { id: 42, name: 'Ada Lovelace' } },
  { method: 'POST', url: '/api/leave', status: 201, body: { id: 'LR-1042', state: 'pending' } },
]);
const api = createHttpClient({ baseUrl: 'http://localhost/api', fetch });
await api.get('/employees/42'); // => { id: 42, name: 'Ada Lovelace' }
await api.post('/leave', { employeeId: 42, from: '2026-10-05', to: '2026-10-09' }); // => { id: 'LR-1042', state: 'pending' }
fetch.calls.map((c) => `${c.request.method} ${c.request.url.pathname}`); // => ['GET /api/employees/42', 'POST /api/leave']
fetch.calls[1]?.request.json; // => { employeeId: 42, from: '2026-10-05', to: '2026-10-09' }
```

### How do I build replies from the request?

`respond` receives the method, URL, headers, and body and returns `{ status, body, headers }` or a `Response`. Use it for small stateful fakes.

```ts
import { createHttpClient } from '@absoluteui/services/http';
import { createMockFetch } from '@absoluteui/services/http-mock';

const approved = new Set<string>();
const fetch = createMockFetch([
  {
    method: 'POST',
    url: /\/api\/leave\/[\w-]+\/approve$/,
    respond: ({ url }) => {
      const id = url.pathname.split('/')[3] ?? '';
      if (approved.has(id)) return { status: 409, body: { title: 'Already approved', status: 409 } };
      approved.add(id);
      return { body: { id, state: 'approved' } };
    },
  },
]);
const api = createHttpClient({ baseUrl: 'http://localhost/api', fetch });
await api.post('/leave/LR-1042/approve'); // => { id: 'LR-1042', state: 'approved' }
const again = await api.post('/leave/LR-1042/approve').catch((e: unknown) => e);
(again as { category: string }).category; // => 'conflict'
```

### How do I test retries, outages, and slow responses?

`times` lets a route answer only so often before later routes take over; `network: true` fails like a dropped connection; `delayMs` adds latency and honours the request's abort signal.

```ts
import { createHttpClient } from '@absoluteui/services/http';
import { createMockFetch } from '@absoluteui/services/http-mock';

const fetch = createMockFetch([
  { url: '/api/holidays', status: 503, times: 1 },
  { url: '/api/holidays', body: [{ date: '2026-12-25', name: 'Christmas Day' }] },
  { url: '/api/payroll', network: true },
  { url: '/api/reports/annual', delayMs: 5_000, body: {} },
]);
const api = createHttpClient({ baseUrl: 'http://localhost/api', fetch, retry: { retries: 2, baseDelayMs: 1 } });
await api.get('/holidays'); // => [{ date: '2026-12-25', name: 'Christmas Day' }] // after one retry
fetch.calls.length; // => 2
const down = await api.get('/payroll', { retry: false }).catch((e: unknown) => e);
(down as { category: string }).category; // => 'network'
const slow = await api.get('/reports/annual', { timeoutMs: 20 }).catch((e: unknown) => e);
(slow as { category: string }).category; // => 'timeout'
```

`reset()` clears the call log and restores every route's `times`; `route()` adds a route later.

### What goes wrong?

- Unmatched requests reject with an error naming the method and path, so a missing route fails the test instead of hanging. Pass `onUnhandled: 'network'` or a reply function to change that.
- Relative URLs resolve against `http://localhost/` (change it with `base`); a full-URL route must match the origin too.
- Statuses must be 200 to 599 (`SVC_HTTP_MOCK_STATUS`). The mock is for tests and demos; never ship it as a production fallback.

```ts
import { createMockFetch } from '@absoluteui/services/http-mock';

const fetch = createMockFetch([{ url: '/api/employees', body: [] }]);
await fetch('/api/departments', {}); // => throws Error // 'No mock route for GET /api/departments.'
fetch.calls[0]?.route; // => -1
```
