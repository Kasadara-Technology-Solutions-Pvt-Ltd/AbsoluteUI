Keeps the main thread responsive while your code does real work: split long loops into time-sliced chunks, yield to input and rendering, run low-priority work when the browser is idle, and use timers that do not drift or overlap. Reach for it when a large import, a report calculation, or a list render makes the page freeze, or when you poll, count down a session, or animate. Every function falls back to plain timers on the server.

### How do I process a large list without freezing the page?

`runChunked` maps items in slices of about `budgetMs` (default 8 ms) and yields between slices, so clicks and typing are handled promptly. Results keep their order; pass a `signal` to stop between items.

```ts
import { runChunked } from '@absoluteui/services/scheduler';

const employees = Array.from({ length: 20_000 }, (_, i) => ({ id: i + 1, salary: 50_000 + (i % 40) * 1_000 }));
const controller = new AbortController();
const withBonus = await runChunked(employees, (e) => ({ ...e, bonus: Math.round(e.salary * 0.08) }), { budgetMs: 8, signal: controller.signal });
withBonus.length; // => 20000
withBonus[0]; // => { id: 1, salary: 50000, bonus: 4000 }
```

### How do I yield inside my own loop?

Call `await yieldToMain()` every so often. It uses `scheduler.yield()` where available, so your work resumes before other queued tasks.

```ts
import { yieldToMain } from '@absoluteui/services/scheduler';

const list = document.createElement('ul');
const names = Array.from({ length: 2_000 }, (_, i) => `Employee ${String(i + 1)}`);
let last = performance.now();
for (const name of names) {
  list.append(Object.assign(document.createElement('li'), { textContent: name }));
  if (performance.now() - last > 8) {
    await yieldToMain();
    last = performance.now();
  }
}
list.childElementCount; // => 2000
```

For thousands of rows, prefer a virtualized grid over rendering every row.

### How do I queue small tasks in order?

`createTaskScheduler` runs tasks one after another and yields whenever the budget is spent. Each `schedule` call resolves with that task's result.

```ts
import { createTaskScheduler } from '@absoluteui/services/scheduler';

const tasks = createTaskScheduler({ budgetMs: 8 });
const widgets = ['headcount', 'attrition', 'open-positions'];
const hydrated = await Promise.all(widgets.map((w) => tasks.schedule(() => `${w} ready`)));
hydrated; // => ['headcount ready', 'attrition ready', 'open-positions ready']
tasks.pending; // => 0
```

### How do I run work when the browser is idle?

`scheduleIdle` suits analytics, prefetching, or cleaning caches. Check `timeRemaining()` and stop when it runs low; the `timeout` guarantees the work runs eventually.

```ts
import { scheduleIdle } from '@absoluteui/services/scheduler';

const auditEvents = ['viewed:42', 'viewed:43', 'exported:payroll'];
const sent: string[] = [];
const handle = scheduleIdle((deadline) => {
  while (deadline.timeRemaining() > 1 && auditEvents.length > 0) sent.push(auditEvents.shift() ?? '');
}, { timeout: 2_000 });
// handle.cancel() if the page is torn down first
```

### How do I poll every 30 seconds without overlapping requests?

`interval` stays aligned to the start time, never starts a tick while an async callback is still running, and can pause while the tab is hidden.

```ts
import { interval } from '@absoluteui/services/scheduler';

const controller = new AbortController();
interval(async () => {
  const r = await fetch('/api/approvals/pending', { signal: controller.signal });
  if (r.ok) console.info('Pending approvals', await r.json());
}, 30_000, { immediate: true, pauseWhenHidden: true, signal: controller.signal, onError: (e) => { console.warn(e); } });
// controller.abort() stops polling when the user leaves the page
```

### How do I warn before a session times out?

`countdown` counts to an absolute deadline and is recomputed from the clock on every tick, so throttled background tabs do not drift. `reset` extends it when the user chooses to stay signed in (WCAG 2.2.1).

```ts
import { countdown } from '@absoluteui/services/scheduler';

const warning = document.createElement('p');
warning.setAttribute('role', 'status');
const session = countdown(Date.now() + 15 * 60_000, (ms) => {
  if (ms <= 120_000 && ms % 60_000 < 1_000) warning.textContent = `You will be signed out in ${String(Math.ceil(ms / 60_000))} minutes.`;
}, { onComplete: () => { location.assign('/signed-out'); } });
const stay = document.createElement('button');
stay.textContent = 'Stay signed in';
stay.addEventListener('click', () => { session.reset(Date.now() + 15 * 60_000); });
```

### What goes wrong?

- Chunking keeps the page responsive but does not make work faster; move heavy CPU work (large parses, crypto on big files) to a Web Worker.
- Invalid timings throw: `budgetMs` must be positive (`SVC_SCHEDULER_INVALID_BUDGET`) and interval periods at least 1 ms (`SVC_SCHEDULER_INVALID_MS`).

```ts
import { interval, runChunked } from '@absoluteui/services/scheduler';

await runChunked([1, 2, 3], (n) => n * 2, { budgetMs: 0 }); // => throws SVC_SCHEDULER_INVALID_BUDGET
interval(() => undefined, 0); // => throws SVC_SCHEDULER_INVALID_MS
```
