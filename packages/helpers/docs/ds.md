Data structures that JavaScript lacks, with documented complexity: graphs with cycle detection and shortest paths, interval trees for overlaps, tries for prefix search, heaps and priority queues, bounded caches, sorted maps, queues, and more. Reach for one when an array or `Map` would make an operation linear (or quadratic) at your data size, such as checking every booking against every other. All algorithms are iterative, so large inputs cannot overflow the stack. Conventions are in the [Helpers and services guide](/docs/guides/helpers-and-services/).

### How do I stop a reporting-line change from creating a loop?

Model "reports to" as a directed graph. Before saving a change, add the edge to a copy and ask `findCycle`; `topologicalSort` gives an order in which every manager comes before their reports.

```ts
import { Graph } from '@absoluteui/helpers/ds';

const reportsTo: [string, string][] = [['CEO', 'CFO'], ['CFO', 'Payroll Lead'], ['Payroll Lead', 'Asha']];
const org = new Graph<string>();
for (const [manager, report] of reportsTo) org.addEdge(manager, report);
org.topologicalSort(); // => ['CEO', 'CFO', 'Payroll Lead', 'Asha']

const proposed = new Graph<string>();
for (const [from, to] of org.edges()) proposed.addEdge(from, to);
proposed.addEdge('Asha', 'CFO'); // Asha would manage the CFO
proposed.hasCycle(); // => true
proposed.findCycle(); // => ['CFO', 'Payroll Lead', 'Asha'] // each manages the next, and the last manages the first
```

### How do I find overlapping bookings or shifts?

Store each interval once in an `IntervalTree`; `search` returns everything that overlaps a range in O(log n + k). With `bounds: '[)'`, a shift ending at 14:00 does not clash with one starting at 14:00.

```ts
import { IntervalTree } from '@absoluteui/helpers/ds';

const at = (hhmm: string) => Date.parse(`2026-10-05T${hhmm}:00Z`);
const room = new IntervalTree<string>({ bounds: '[)' });
room.insert(at('09:00'), at('10:00'), 'Stand-up');
room.insert(at('10:00'), at('12:00'), 'Payroll review');
room.insert(at('13:00'), at('14:00'), 'Interview');

room.search(at('11:30'), at('13:30')).map((e) => e.value); // => ['Payroll review', 'Interview']
room.overlaps(at('12:00'), at('13:00')); // => false // the free slot
room.searchPoint(at('10:00')).map((e) => e.value); // => ['Payroll review']
```

### How do I autocomplete names from a large list?

A `Trie` answers prefix queries without scanning the list; `caseFold: true` makes matching case-insensitive, and `limit` caps the suggestions. `countPrefix` tells you how many matches exist beyond the ones you show.

```ts
import { Trie } from '@absoluteui/helpers/ds';

const names = new Trie(['Asha Rao', 'Ashok Kumar', 'Aisha Khan', 'Liam Chen', 'asher Cole'], { caseFold: true });
names.findByPrefix('ash', 2).length; // => 2
names.countPrefix('ASH'); // => 3
names.startsWith('li'); // => true
names.has('liam chen'); // => true
```

### How do I work through tickets by deadline?

A `PriorityQueue` always gives you the item that sorts first by your comparer, in O(log n) per push and pop, instead of re-sorting an array on every insert.

```ts
import { PriorityQueue } from '@absoluteui/helpers/ds';

interface Ticket { id: string; dueAt: string }
const queue = new PriorityQueue<Ticket>([], (a, b) => a.dueAt.localeCompare(b.dueAt));
queue.push({ id: 'HR-12', dueAt: '2026-10-07T17:00:00Z' });
queue.push({ id: 'HR-9', dueAt: '2026-10-05T09:00:00Z' });
queue.push({ id: 'HR-15', dueAt: '2026-10-06T12:00:00Z' });
queue.pop()?.id; // => 'HR-9'
[...queue.drain()].map((t) => t.id); // => ['HR-15', 'HR-12']
```

For deadlines in business hours (weekends and holidays excluded), compute `dueAt` with `@absoluteui/helpers/business-calendar` first.

### How do I keep a bounded cache and a recent-activity list?

`LRUCache` evicts the least recently used entry when full and can expire entries (`ttlMs`); `onEvict` tells you why an entry went. `CircularBuffer` keeps the last N items, overwriting the oldest.

```ts
import { CircularBuffer, LRUCache } from '@absoluteui/helpers/ds';

const evicted: string[] = [];
const profiles = new LRUCache<string, { name: string }>({ maxSize: 2, ttlMs: 60_000, onEvict: (key, _v, reason) => evicted.push(`${key}:${reason}`) });
profiles.set('E-1', { name: 'Asha Rao' }).set('E-2', { name: 'Liam Chen' });
profiles.get('E-1');
profiles.set('E-3', { name: 'Zoë Müller' });
evicted; // => ['E-2:capacity']
[...profiles.keys()]; // => ['E-1', 'E-3']

const recent = new CircularBuffer<string>(3);
for (const action of ['login', 'view payslip', 'edit address', 'logout']) recent.push(action);
recent.toArray(); // => ['view payslip', 'edit address', 'logout']
```

### What goes wrong?

Structures fail loudly instead of returning wrong answers: a topological sort of a cyclic graph throws (with the cycle in `details.cycle`), a `BiMap` refuses a second key for the same value, and changing a `SortedMap` while iterating it throws.

```ts
import { BiMap, Graph, SortedMap, naturalCompare } from '@absoluteui/helpers/ds';

new Graph<string>().addEdge('a', 'b').addEdge('b', 'a').topologicalSort(); // => throws HLP_DS_GRAPH_CYCLE
new BiMap([['E-1', 'asha@example.com']]).set('E-2', 'asha@example.com'); // => throws HLP_DS_BIMAP_DUPLICATE_VALUE
const m = new SortedMap<number, string>([[1, 'a'], [2, 'b']]);
(() => { for (const [k] of m) m.set(k + 10, 'x'); })(); // => throws HLP_DS_CONCURRENT_MODIFICATION
naturalCompare(1, '1'); // => throws HLP_DS_NOT_COMPARABLE
```
