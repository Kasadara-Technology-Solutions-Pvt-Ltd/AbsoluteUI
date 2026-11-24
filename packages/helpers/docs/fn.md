Small wrappers that change when or how often a function runs: debounce and throttle for input and scroll events, memoize for repeated lookups, `once` for setup, `safeCall` for callbacks you do not control, and `pipe`/`compose` for building transformations. For promise work (retries, timeouts, concurrency), use `@absoluteui/helpers/async`. The [Helpers and services guide](/docs/guides/helpers-and-services/) covers import and error conventions.

### How do I search as the user types without a request per keystroke?

`debounce` waits until typing pauses. Cancel the pending call when the view closes, so a late search does not update a removed list.

```ts
import { debounce } from '@absoluteui/helpers/fn';

const requests: string[] = [];
const search = debounce((term: string) => { requests.push(term.trim()); }, 250);
for (const typed of ['r', 'ra', 'rao', 'rao ']) search(typed);
search.pending(); // => true
search.flush();
requests; // => ['rao'] // one request, with the last value

search('liam');
search.cancel(); // e.g. in disconnectedCallback
search.pending(); // => false
requests.length; // => 1
```

### How do I autosave a long form without losing the last edit?

Add `maxWait` so a user who never pauses still gets saved regularly, and call `flush` when the page is hidden so the final change is written.

```ts
import { debounce } from '@absoluteui/helpers/fn';

declare function saveDraft(draft: { notes: string }): void;
const autosave = debounce(saveDraft, 1000, { maxWait: 10_000 });

document.querySelector('textarea')?.addEventListener('input', (e) => {
  if (e.target instanceof HTMLTextAreaElement) autosave({ notes: e.target.value });
});
addEventListener('pagehide', () => autosave.flush());
```

### How do I cache lookups, including async ones?

`memoize` keeps a bounded LRU cache (1000 entries by default) with an optional TTL; give it a `key` when arguments are objects or several values. Returned promises are cached too, including ones that reject, so delete the entry on failure to allow a retry.

```ts
import { memoize } from '@absoluteui/helpers/fn';

interface Manager { employeeId: string; asOf: string; manager: string }
let calls = 0;
const fetchManager = async (employeeId: string, asOf: string): Promise<Manager> => {
  calls++;
  if (employeeId === 'E-404') throw new Error('Not found');
  return { employeeId, asOf, manager: 'M-204' };
};
const managerOf = memoize(
  (id: string, asOf: string): Promise<Manager> => fetchManager(id, asOf).catch((e: unknown) => { managerOf.delete(id, asOf); throw e; }),
  { key: (id, asOf) => `${id}@${asOf}`, ttlMs: 5 * 60_000, maxSize: 500 },
);
(await managerOf('E-1001', '2026-10-01')).manager; // => 'M-204'
await managerOf('E-1001', '2026-10-01');
calls; // => 1
await managerOf('E-404', '2026-10-01').catch(() => 'failed'); // => 'failed'
managerOf.size; // => 1 // the failure was not kept
```

### How do I recompute a filtered list only when its inputs change?

`memoizeOne` remembers just the latest call, which suits render code: the same rows and filter return the same array, so identity checks downstream stay cheap.

```ts
import { memoizeOne } from '@absoluteui/helpers/fn';

interface Employee { name: string; dept: string }
const byDept = memoizeOne((rows: readonly Employee[], dept: string) => rows.filter((r) => r.dept === dept));
const rows: Employee[] = [{ name: 'Asha Rao', dept: 'hr' }, { name: 'Liam Chen', dept: 'finance' }];
const first = byDept(rows, 'hr');
byDept(rows, 'hr') === first; // => true
byDept(rows, 'finance') === first; // => false
byDept([...rows], 'hr') === first; // => false // a new array is a new input
```

### How do I run setup once and keep a user's callback from breaking mine?

`once` returns the first result on every later call (and rethrows the first error). `safeCall` runs an optional callback, reports its error, and lets your code continue.

```ts
import { once, safeCall } from '@absoluteui/helpers/fn';

let loads = 0;
const loadHolidays = once(() => { loads++; return ['2026-12-25', '2027-01-01']; });
loadHolidays();
loadHolidays().length; // => 2
loads; // => 1

const logged: string[] = [];
const options: { onApprove?: (id: string) => void } = { onApprove: () => { throw new Error('Handler failed'); } };
safeCall(() => options.onApprove?.('LR-77'), (e) => logged.push(e.message)); // => undefined
logged; // => ['Handler failed']
```

### What goes wrong?

- `debounce` and `throttle` do not forward `this`: wrap methods in an arrow function (`debounce(() => this.save(), 300)`).
- `throttle` runs the first call immediately and merges the rest into one trailing call; pass `{ leading: false }` to wait first.
- `memoize` keys by the first argument unless you pass `key`, so calls that differ only in later arguments share an entry.

```ts
import { memoize } from '@absoluteui/helpers/fn';

const label = memoize((id: string, lang: string) => `${id}:${lang}`);
label('E-1', 'en');
label('E-1', 'de'); // => 'E-1:en' // add { key: (id, lang) => `${id}|${lang}` }
```
