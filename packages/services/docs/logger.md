Structured logging for browser applications: levels, named child loggers, pluggable sinks, and automatic redaction of secrets. Messages are constant strings and data travels separately, so records are searchable and nothing sensitive is interpolated into text. Use it instead of scattered `console` calls when you want the same records in the console during development and at a telemetry endpoint in production.

### How do I log structured records?

Create one logger for the application and pass data as an object. `memorySink` keeps records in memory, which is handy for tests and for a "copy diagnostics" button.

```ts
import { createLogger, memorySink } from '@absoluteui/services/logger';

const mem = memorySink({ capacity: 500 });
const log = createLogger({ name: 'peoplehub', level: 'debug', context: { release: '2026.10' }, sinks: [mem] });
log.info('Leave request submitted', { requestId: 'LR-1042', days: 3 });
const [record] = mem.records();
[record?.level, record?.message, record?.data]; // => ['info', 'Leave request submitted', { requestId: 'LR-1042', days: 3 }]
record?.context; // => { release: '2026.10' }
```

Without `sinks`, records go to the console (`consoleSink()`; pass `{ format: 'json' }` for one JSON line per record).

### How do I keep secrets and personal data out of logs?

Values under secret-looking keys (password, token, authorization, cookie, session, API key, ...) are replaced by `'[REDACTED]'`, and query strings are stripped from values under keys ending in `url`, `uri`, or `href`. Add your own keys with `redact`.

```ts
import { DEFAULT_REDACT_KEYS } from '@absoluteui/helpers/sanitize';
import { createLogger, memorySink } from '@absoluteui/services/logger';

const mem = memorySink();
const log = createLogger({ sinks: [mem], redact: [...DEFAULT_REDACT_KEYS, 'nationalId', /^bank/i] });
log.warn('Profile update failed', {
  employeeId: 42,
  nationalId: 'AB123456C',
  bankAccount: '12345678',
  accessToken: 'eyJhbGciOi',
  url: 'https://hr.example.com/api/profile?email=ada@example.com',
});
mem.records()[0]?.data; // => { employeeId: 42, nationalId: '[REDACTED]', bankAccount: '[REDACTED]', accessToken: '[REDACTED]', url: 'https://hr.example.com/api/profile' }
```

### How do I log errors?

Pass the `Error` itself, or an object with an `error` field next to other data. It is serialized into `record.error` (name, message, code, status) without the stack unless `includeStack` is set.

```ts
import { ValidationError } from '@absoluteui/helpers/error';
import { createLogger, memorySink } from '@absoluteui/services/logger';

const mem = memorySink();
const log = createLogger({ name: 'payroll', sinks: [mem] });
log.error('Payroll run failed', { runId: '2026-09', error: new ValidationError('PAYROLL_NO_BANK', 'Bank details are missing.') });
const r = mem.records()[0];
r?.data; // => { runId: '2026-09' }
[r?.error?.name, r?.error?.code]; // => ['ValidationError', 'PAYROLL_NO_BANK']
```

### How do I give each part of the app its own name and context?

`child` adds context (and optionally a dotted sub-name) and shares the parent's sinks and level, so `setLevel` on the root changes every child.

```ts
import { createLogger, memorySink } from '@absoluteui/services/logger';

const mem = memorySink();
const log = createLogger({ name: 'peoplehub', sinks: [mem] });
const grid = log.child({ view: 'employees' }, { name: 'grid' });
grid.debug('Rows rendered', { rows: 1200 }); // below the default 'info' level: dropped
log.setLevel('debug');
grid.debug('Rows rendered', { rows: 1200 });
mem.records().map((r) => [r.name, r.context]); // => [['peoplehub.grid', { view: 'employees' }]]
```

`withTimer(label)` returns a function that logs `label` with `durationMs` when you call it.

### How do I send logs to a server without flooding it?

Sample noisy levels with `sampleRate`, keep only warnings and errors for the remote sink with `filterSink`, and batch them with `batchingSink`. Batches flush every few seconds and with `navigator.sendBeacon` when the page is hidden or closed.

```ts
import { batchingSink, consoleSink, createLogger, filterSink } from '@absoluteui/services/logger';

const remote = batchingSink(
  async (records) => {
    await fetch('/api/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(records), keepalive: true });
  },
  { maxBatch: 50, flushIntervalMs: 10_000, beaconUrl: '/api/logs' },
);
export const log = createLogger({
  name: 'peoplehub',
  sampleRate: { debug: 0.1, info: 0.5 }, // warn and error are always kept
  sinks: [consoleSink(), filterSink(remote, (r) => r.level === 'warn' || r.level === 'error')],
});
```

### What goes wrong?

- Never put data into the message (`` `Saved ${email}` ``): redaction only sees `data` and `context`.
- A sink that throws is ignored, so logging never breaks the application; `batchingSink` drops a failed batch (reported to `onError`) instead of retrying forever.
- Unknown levels throw a `TypeError`: `createLogger({ level: 'verbose' })` fails at start-up rather than silently logging nothing.
