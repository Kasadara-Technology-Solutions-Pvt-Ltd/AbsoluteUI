A `fetch` client for application APIs: timeouts, safe retries, cancellation, typed JSON guards, categorized errors with user-facing messages, interceptors, hooks, pagination, and uploads with progress. The [HTTP client guide](/docs/guides/http/) covers interceptors, hooks, cancellation, and error handling in depth; the recipes below are the everyday calls. The examples use `createMockFetch` from `@absoluteui/services/http-mock`; in an application, omit `fetch`.

### How do I call a JSON API with typed results?

Create one client per API. `get`, `post`, `put`, `patch`, and `delete` resolve with the parsed body; pass `validate` to get a typed value and a `bad-response` error when the server sends something else.

```ts
import { createHttpClient } from '@absoluteui/services/http';
import { createMockFetch } from '@absoluteui/services/http-mock';

interface Employee { id: number; name: string; department: string }
const isEmployee = (d: unknown): d is Employee =>
  typeof d === 'object' && d !== null && 'id' in d && typeof d.id === 'number' && 'name' in d && 'department' in d;

const fetch = createMockFetch([{ method: 'GET', url: '/api/employees/42', body: { id: 42, name: 'Ada Lovelace', department: 'Finance' } }]);
const api = createHttpClient({ baseUrl: 'http://localhost/api', timeoutMs: 15_000, fetch });
const ada = await api.get('/employees/42', { validate: isEmployee });
ada.department; // => 'Finance'
fetch.calls[0]?.request.url.href; // => 'http://localhost/api/employees/42'
```

### How do I show validation errors from the server next to the fields?

Every failure rejects with an `HttpError`. Its `category` says what happened, `message` is ready for the user, and `fields` holds per-field messages from an RFC 9457 Problem Details body.

```ts
import { HttpError } from '@absoluteui/helpers/error';
import { createHttpClient } from '@absoluteui/services/http';
import { createMockFetch } from '@absoluteui/services/http-mock';

const fetch = createMockFetch([
  { method: 'POST', url: '/api/leave', status: 422, body: { title: 'Invalid request', status: 422, errors: { to: 'The end date must be on or after the start date.' } } },
]);
const api = createHttpClient({ baseUrl: 'http://localhost/api', fetch });
const error = await api.post('/leave', { from: '2026-10-09', to: '2026-10-05' }).catch((e: unknown) => e);
error instanceof HttpError; // => true
const { category, status, fields } = error as HttpError;
[category, status]; // => ['validation', 422]
fields; // => { to: 'The end date must be on or after the start date.' }
```

### How do I load every page of a list?

`paginate` is an async generator over `Link` headers, cursors, or offsets. It stops at a short page, at the reported total, or after `maxPages` (default 100).

```ts
import { createHttpClient, paginate } from '@absoluteui/services/http';
import { createMockFetch } from '@absoluteui/services/http-mock';

const fetch = createMockFetch([
  { url: '/api/employees?offset=0&limit=2', body: { items: [{ id: 1 }, { id: 2 }] } },
  { url: '/api/employees?offset=2&limit=2', body: { items: [{ id: 3 }] } },
]);
const api = createHttpClient({ baseUrl: 'http://localhost/api', fetch });
const ids: number[] = [];
const toItems = (d: unknown): { id: number }[] => (typeof d === 'object' && d !== null && 'items' in d && Array.isArray(d.items) ? d.items : []);
for await (const page of paginate(api, '/employees', { strategy: 'offset', pageSize: 2, items: toItems })) ids.push(...page.items.map((e) => e.id));
ids; // => [1, 2, 3]
```

### How do I upload a file with a progress bar?

`fetch` cannot report upload progress, so `uploadWithProgress` uses `XMLHttpRequest`. For large files that must survive a dropped connection, use chunked uploads from `@absoluteui/services/upload`.

```ts
import { uploadWithProgress } from '@absoluteui/services/http';

declare const file: File; // from a file input
const bar = document.createElement('progress');
bar.max = 100;
const response = await uploadWithProgress('/api/employees/42/documents', file, {
  onProgress: (p) => { bar.value = p.percent ?? 0; },
});
```

### What goes wrong?

- Retries apply only to idempotent requests (GET, HEAD, OPTIONS, PUT, DELETE) and to POST or PATCH with an `idempotencyKey`; a plain POST is never sent twice.
- A response that fails `validate` is an error in the `bad-response` category, not a wrongly typed value.
- Server error text is not shown to users unless you set `trustServerMessages`; the default messages never leak internals.
