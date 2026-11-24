Promise control that browsers do not ship: timeouts that really cancel, retries with backoff, concurrency limits, request batching and de-duplication, polling, and `AbortSignal` plumbing. Every helper accepts a `signal`, and cancellation rejects with an `AbortError` (`HLP_ABORTED`) that retries never repeat. The [Helpers and services guide](/docs/guides/helpers-and-services/) has a basic retry example; for HTTP, the services client already retries and times out (see the [HTTP guide](/docs/guides/http/)).

### How do I process many items with a concurrency limit and report the failures?

`mapLimitSettled` keeps at most `limit` calls in flight, returns one result per item in input order, and never rejects for an item failure. `partitionSettled` splits the results for a summary. Pass a `signal` so the user can stop the whole run.

```ts
import { mapLimitSettled, partitionSettled, sleep } from '@absoluteui/helpers/async';

const payslips = ['E-1001', 'E-1002', 'E-1003', 'E-1004', 'E-1005'];
const controller = new AbortController();
let inFlight = 0;
let peak = 0;
const results = await mapLimitSettled(payslips, 2, async (id, _i, signal) => {
  peak = Math.max(peak, ++inFlight);
  await sleep(5, { signal });
  inFlight--;
  if (id === 'E-1003') throw new Error('No bank account on file');
  return `${id}.pdf`;
}, { signal: controller.signal });
const { fulfilled, rejected } = partitionSettled(results);
fulfilled; // => ['E-1001.pdf', 'E-1002.pdf', 'E-1004.pdf', 'E-1005.pdf']
rejected.length; // => 1
peak; // => 2
```

Use `mapLimit` instead when one failure should stop the rest, and `createLimiter` when tasks arrive over time.

### How do I retry a slow or flaky call with a deadline per attempt?

Wrap each attempt in `timeout` with a function, so the attempt's signal aborts the real work when time runs out. `retry` then tries again with exponential backoff; `retryIf` decides which errors are worth it.

```ts
import { retry, sleep, timeout } from '@absoluteui/helpers/async';
import { TimeoutError } from '@absoluteui/helpers/error';

const delays = [300, 300, 1]; // the service is slow twice, then answers
const retried: number[] = [];
const loadBalance = (signal: AbortSignal, attempt: number) => sleep(delays[attempt - 1] ?? 1, { signal }).then(() => ({ leaveDays: 12 }));

const balance = await retry((attempt, signal) => timeout((s) => loadBalance(s, attempt), 60, { signal }), {
  retries: 3,
  minDelay: 1,
  jitter: 'none',
  retryIf: (e) => e instanceof TimeoutError,
  onRetry: (_e, attempt) => retried.push(attempt),
});
balance; // => { leaveDays: 12 }
retried; // => [1, 2]
```

### How do I wait for a long-running job to finish?

`poll` calls your function, waits `interval` between calls, and stops when `until` holds. `timeout` bounds the whole wait (`HLP_TIMEOUT`), and the signal lets the user cancel.

```ts
import { poll } from '@absoluteui/helpers/async';

let checks = 0;
const checkExport = async () => ({ id: 'X-9', status: ++checks < 3 ? 'running' : 'ready', url: '/exports/X-9.zip' });
const job = await poll(checkExport, { until: (j) => j.status !== 'running', interval: 5, timeout: 1000 });
[job.status, checks]; // => ['ready', 3]
await poll(async () => ({ status: 'running' }), { until: (j) => j.status !== 'running', interval: 5, timeout: 20 }); // => throws HLP_TIMEOUT
```

### How do I turn many lookups into one request?

`createBatcher` collects `load(key)` calls made in the same tick and resolves them from one `loadMany` call, such as a grid rendering 50 manager names. `singleFlight` shares one in-flight promise between callers that ask for the same thing at the same time.

```ts
import { createBatcher, singleFlight } from '@absoluteui/helpers/async';

const requests: string[][] = [];
const people = createBatcher(async (ids: string[]) => {
  requests.push(ids);
  return ids.map((id) => (id === 'E-0' ? new Error('Unknown employee') : { id, name: `Employee ${id}` }));
}, { maxBatchSize: 100 });
const [asha, liam, missing] = await Promise.allSettled([people.load('E-1'), people.load('E-2'), people.load('E-0')]);
requests; // => [['E-1', 'E-2', 'E-0']]
[asha.status, liam.status, missing.status]; // => ['fulfilled', 'fulfilled', 'rejected']

let loads = 0;
const holidays = singleFlight(async (year: number) => { loads++; return [`${String(year)}-12-25`]; });
await Promise.all([holidays(2026), holidays(2026), holidays(2027)]);
loads; // => 2
```

### How do I keep saves in the order the user made them?

A serial queue runs one task at a time in submission order, so a slow first save cannot land after a fast second one. `onIdle` resolves when everything queued has finished, for example before closing an editor.

```ts
import { createSerialQueue, sleep } from '@absoluteui/helpers/async';

const queue = createSerialQueue();
const stored: string[] = [];
const save = (text: string, ms: number) => queue.schedule(async (signal) => { await sleep(ms, { signal }); stored.push(text); });
void save('Draft 1', 20);
void save('Draft 2', 0);
await queue.onIdle();
stored; // => ['Draft 1', 'Draft 2']
```

### What goes wrong?

- `raceSignal` and a plain promise passed to `timeout` stop waiting but do not stop the work; pass a function to `timeout`, or the signal to the work itself.
- Aborts are not retried, and cancelled work rejects with `HLP_ABORTED`: ignore that code instead of showing an error.
- Delays over `MAX_DELAY_MS` (about 24.8 days) are rejected, because `setTimeout` would fire them at once.

```ts
import { MAX_DELAY_MS, sleep, withCancel } from '@absoluteui/helpers/async';

const search = withCancel((signal) => sleep(10_000, { signal }).then(() => ['Asha Rao']));
search.cancel();
await search.promise; // => throws HLP_ABORTED
await sleep(MAX_DELAY_MS + 1); // => throws HLP_ASYNC_INVALID_MS
```
