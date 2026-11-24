Typed publish/subscribe for decoupled parts of an application, within one tab or across every same-origin tab through `BroadcastChannel`, plus leader election so only one tab runs a job. Use a bus when unrelated screens must react to the same event (an employee was saved, the user signed out) without importing each other; for state that must persist, use `@absoluteui/services/storage` instead.

### How do I publish typed events inside the page?

Declare the event map once; `on`, `once`, and `emit` are checked against it. `on` returns the unsubscribe function.

```ts
import { createEventBus } from '@absoluteui/services/bus';

type HrEvents = {
  'employee:saved': { id: number; name: string };
  'leave:approved': { requestId: string; days: number };
};
const events = createEventBus<HrEvents>();

const toasts: string[] = [];
const off = events.on('employee:saved', ({ name }) => { toasts.push(`${name} saved`); });
events.once('leave:approved', ({ days }) => { toasts.push(`${String(days)} days approved`); });
events.emit('employee:saved', { id: 42, name: 'Ada Lovelace' });
events.emit('leave:approved', { requestId: 'LR-1042', days: 3 });
events.emit('leave:approved', { requestId: 'LR-1043', days: 1 }); // once: not delivered
off();
toasts; // => ['Ada Lovelace saved', '3 days approved']
events.listenerCount(); // => 0
```

### How do I observe every event, for example for audit logging?

Subscribe to `'*'`; the listener receives the type and the payload.

```ts
import { createEventBus } from '@absoluteui/services/bus';

const events = createEventBus<{ 'employee:saved': { id: number }; 'employee:deleted': { id: number } }>();
const audit: string[] = [];
events.on('*', (type, payload) => { audit.push(`${type} ${JSON.stringify(payload)}`); });
events.emit('employee:saved', { id: 42 });
events.emit('employee:deleted', { id: 7 });
audit; // => ['employee:saved {"id":42}', 'employee:deleted {"id":7}']
```

### How do I send events to other tabs?

`createCrossTabBus` delivers to every same-origin tab and worker that uses the same channel name, and to this tab (unless `local: false`). Payloads must be plain, structured-cloneable data. Validate incoming payloads: another tab may run an older release.

```ts
import { createCrossTabBus } from '@absoluteui/services/bus';

type SessionEvents = { 'session:ended': { reason: 'logout' | 'timeout' } };
const isEnded = (type: string, p: unknown): boolean =>
  type === 'session:ended' && typeof p === 'object' && p !== null && 'reason' in p && (p.reason === 'logout' || p.reason === 'timeout');

const thisTab = createCrossTabBus<SessionEvents>('peoplehub-session', { validate: isEnded });
const otherTab = createCrossTabBus<SessionEvents>('peoplehub-session', { validate: isEnded }); // stands in for a second tab
const received = new Promise<string>((resolve) => { otherTab.once('session:ended', ({ reason }) => { resolve(reason); }); });
thisTab.emit('session:ended', { reason: 'logout' });
await received; // => 'logout'
thisTab.crossTab; // => true
thisTab.close();
otherTab.close();
```

### How do I run a job in only one tab?

`createLeaderElection` picks one tab per name (Web Locks when available, a heartbeat otherwise); leadership moves to another tab when the leader closes. Poll or refresh tokens only in the leader, and share results with a cross-tab bus.

```ts
import { createCrossTabBus, createLeaderElection } from '@absoluteui/services/bus';

const updates = createCrossTabBus<{ 'notifications:count': number }>('peoplehub-notifications');
const election = createLeaderElection('peoplehub-notifications');
await election.whenLeader();
const timer = setInterval(() => {
  void fetch('/api/notifications/count').then(async (r) => { updates.emit('notifications:count', Number(await r.text())); });
}, 60_000);
election.onChange((leader) => { if (!leader) clearInterval(timer); });
```

`resign()` gives leadership up, for example on sign-out.

### What goes wrong?

- Declare the event map with `type`, not `interface`: interfaces have no index signature, so TypeScript rejects them as an `EventMap`.
- A listener that throws does not stop the others; the error goes to `onError` (default `reportError`).
- Functions, DOM nodes, and class instances with methods cannot cross tabs: `emit` throws `SVC_BUS_UNCLONEABLE`. `'*'` cannot be emitted (`SVC_BUS_INVALID_TYPE`).
- Without `BroadcastChannel`, `crossTab` is `false` and events stay in the current tab.

```ts
import { createCrossTabBus } from '@absoluteui/services/bus';

const bus = createCrossTabBus<{ 'report:ready': { open: () => void } }>('peoplehub-reports');
bus.emit('report:ready', { open: () => undefined }); // => throws SVC_BUS_UNCLONEABLE
bus.close();
```
