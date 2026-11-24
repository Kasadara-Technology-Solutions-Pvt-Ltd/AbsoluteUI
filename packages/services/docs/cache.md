An in-memory async cache for values that are expensive to load, such as API lookups. Concurrent requests for one key share a single load, values stay fresh for `ttlMs`, stale values can be served while a background reload runs, and the size is bounded (least recently used entries go first). Use it for reference data (departments, cost centres, holiday calendars) and per-record lookups; for data that must survive a reload, persist it with `@absoluteui/services/storage`.

### How do I cache an API call with stale-while-revalidate?

Wrap the loader. Within `ttlMs` the cached value is returned; after that, for `staleWhileRevalidateMs`, the old value is returned at once and a reload runs in the background.

```ts
import { createAsyncCache } from '@absoluteui/services/cache';
import { createHttpClient } from '@absoluteui/services/http';
import { createMockFetch } from '@absoluteui/services/http-mock';

let version = 1;
const fetch = createMockFetch([{ url: '/api/departments', respond: () => ({ body: [`Finance v${String(version)}`] }) }]);
const api = createHttpClient({ fetch, baseUrl: 'http://localhost', retry: false });

let clock = 0;
const departments = createAsyncCache({
  load: (_key: 'all', signal) => api.get('/api/departments', { signal }),
  ttlMs: 60_000,
  staleWhileRevalidateMs: 10 * 60_000,
  now: () => clock,
});
await departments.get('all'); // => ['Finance v1']
version = 2;
clock = 90_000; // stale now
await departments.get('all'); // => ['Finance v1'] // served at once, reload started
await new Promise((resolve) => setTimeout(resolve, 10));
await departments.get('all'); // => ['Finance v2']
fetch.calls.length; // => 2
```

The injected `now` is only for the example; omit it in applications.

### How do I stop duplicate requests when many components ask at once?

Calls for the same key while a load is running join it (single-flight). Use `keyFn` when keys are objects.

```ts
import { createAsyncCache } from '@absoluteui/services/cache';

let loads = 0;
const managers = createAsyncCache({
  load: async ({ employeeId }: { employeeId: number }) => {
    loads++;
    return { employeeId, manager: 'Grace Hopper' };
  },
  keyFn: (k) => k.employeeId,
  ttlMs: 5 * 60_000,
});
const results = await Promise.all([managers.get({ employeeId: 42 }), managers.get({ employeeId: 42 }), managers.get({ employeeId: 42 })]);
results.length; // => 3
loads; // => 1
managers.stats().misses; // => 3
```

### How do I refresh a value after the user edits it?

Put the saved value in with `prime`, or drop entries with `invalidate` and `invalidateWhere` so the next `get` loads again. `get(key, { force: true })` reloads immediately.

```ts
import { createAsyncCache } from '@absoluteui/services/cache';

const employees = createAsyncCache({ load: async (id: number) => ({ id, title: 'Analyst' }) });
await employees.get(42); // => { id: 42, title: 'Analyst' }
employees.prime(42, { id: 42, title: 'Senior Analyst' }); // the response of your save call
employees.peek(42); // => { id: 42, title: 'Senior Analyst' }
await employees.get(7);
employees.invalidateWhere((id) => id < 10); // => 1
employees.has(7); // => false
```

### How do I cancel a lookup the user no longer needs?

Pass a `signal` to `get`. The caller stops waiting at once; the shared load is aborted only when every caller has left, and the loader receives that `signal` to pass on to `fetch`.

```ts
import { createAsyncCache } from '@absoluteui/services/cache';

const search = createAsyncCache({
  load: (text: string, signal) => new Promise<string[]>((resolve, reject) => {
    const timer = setTimeout(() => { resolve([`${text}: Ada Lovelace`]); }, 1000);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); });
  }),
});
const controller = new AbortController();
const pending = search.get('ada', { signal: controller.signal });
controller.abort();
await pending; // => throws AbortError
search.stats().loads; // => 1
```

### What goes wrong?

- Errors are not cached by default: the next `get` tries again. Set `errorTtlMs` to cache failures briefly (for example a 404 lookup).
- Background revalidation failures do not reject anyone; the stale value stays until it expires. Pass `onError` to log them.
- The cache is per page and per instance. Create one per data type at module level, not inside components, or every render starts from empty.
- Negative or `NaN` durations throw `SVC_CACHE_INVALID_OPTION`.
