Typed, namespaced key-value stores over `localStorage`, `sessionStorage`, IndexedDB, or memory, with the same async API for all of them. Reach for `createStore` when you persist user preferences, drafts, or cached lookups; it adds expiry, schema versions, validation, and change events, and falls back to memory during SSR or when storage is blocked. Cookies and a promise wrapper for IndexedDB live here too.

### How do I keep typed preferences that expire?

Give the store a namespace, a shape check, and a default time to live. Reads never throw: missing, expired, corrupt, or invalid entries read as `undefined`.

```ts
import { createStore } from '@absoluteui/services/storage';

interface GridPrefs { density: 'compact' | 'comfortable'; pageSize: number }
const isGridPrefs = (v: unknown): v is GridPrefs =>
  typeof v === 'object' && v !== null && 'density' in v && 'pageSize' in v && typeof v.pageSize === 'number';

let clock = Date.parse('2026-10-05T09:00:00Z');
const prefs = createStore<GridPrefs>({ namespace: 'hr-grid', validate: isGridPrefs, ttlMs: 30 * 86_400_000, now: () => clock });
await prefs.set('employees', { density: 'compact', pageSize: 50 });
await prefs.get('employees'); // => { density: 'compact', pageSize: 50 }
await prefs.set('leave', { density: 'comfortable', pageSize: 25 }, { ttlMs: 60_000 }); // per-entry override
clock += 120_000;
await prefs.get('leave'); // => undefined
await prefs.keys(); // => ['employees']
```

The injected `now` is only for the example; omit it in applications. `prune()` removes expired entries in bulk, for example on start-up.

### How do I change the shape of stored data without losing it?

Raise `version` and pass `migrate`. Older entries are upgraded on first read and written back; without `migrate`, they are dropped.

```ts
import { createStore } from '@absoluteui/services/storage';

const v1 = createStore<{ compact: boolean }>({ namespace: 'hr-layout' });
await v1.clear();
await v1.set('timesheet', { compact: true });

const v2 = createStore<{ density: 'compact' | 'comfortable' }>({
  namespace: 'hr-layout',
  version: 2,
  migrate: (old, fromVersion) => {
    const compact = fromVersion === 1 && typeof old === 'object' && old !== null && 'compact' in old && old.compact === true;
    return { density: compact ? 'compact' : 'comfortable' };
  },
});
await v2.get('timesheet'); // => { density: 'compact' }
```

### How do I react when another tab changes a value?

`subscribe` reports changes from this store instance (`source: 'local'`) and from other tabs (`'remote'`, through `storage` events or a `BroadcastChannel` for IndexedDB). Read the new value with `get`; pass `null` to hear about every key.

```ts
import { createStore, type StoreChange } from '@absoluteui/services/storage';

const settings = createStore<string>({ namespace: 'hr-settings' });
const seen: StoreChange[] = [];
const stop = settings.subscribe('theme', (change) => { seen.push(change); });
await settings.set('theme', 'dark');
seen; // => [{ key: 'theme', kind: 'set', source: 'local' }]
stop();
settings.close();
```

### How do I encrypt what I store?

Wrap a string store with `createEncryptedStore` and an AES-GCM key. Derive the key from a passphrase with `deriveKeyPbkdf2` and keep the salt (it is not secret) next to the data.

```ts
import { deriveKeyPbkdf2, randomSalt } from '@absoluteui/services/crypto';
import { createEncryptedStore, createStore } from '@absoluteui/services/storage';

interface Draft { employeeId: number; note: string }
const key = await deriveKeyPbkdf2('passphrase entered by the user', randomSalt());
const raw = createStore<string>({ namespace: 'hr-drafts', backend: 'indexeddb' });
const drafts = createEncryptedStore<Draft>(raw, key);
await drafts.set('review-42', { employeeId: 42, note: 'Promotion case' });
await drafts.get('review-42'); // => { employeeId: 42, note: 'Promotion case' }
(await raw.get('review-42'))?.includes('Promotion'); // => false
```

This protects data at rest (disk, backups). Script running in the page can use the same key, so it does not protect against XSS.

### How do I read and write cookies?

Use cookies only for small, non-sensitive values such as a locale or consent state. `setCookie` defaults to `Secure`, `SameSite=Lax`, and `Path=/`, URI-encodes the value, and refuses cookies over `MAX_COOKIE_BYTES` (`SVC_COOKIE_TOO_LARGE`).

```ts
import { getCookie, removeCookie, setCookie } from '@absoluteui/services/storage';

setCookie('hr-locale', 'en-GB', { maxAge: 365 * 86_400 });
getCookie('hr-locale'); // e.g. 'en-GB'
removeCookie('hr-locale');
```

JavaScript cannot read or set `HttpOnly` cookies; set session cookies from the server.

### What goes wrong?

- Bad keys, namespaces, or TTLs throw at once (`SVC_STORAGE_INVALID_KEY`, `SVC_STORAGE_INVALID_NAMESPACE`, `SVC_STORAGE_INVALID_TTL`); a value that fails `validate` throws `SVC_STORAGE_INVALID`; a full disk rejects with `SVC_STORAGE_QUOTA`.
- In private browsing or during SSR the store silently uses memory: check `persistent` after `ready` if losing data matters.
- Never keep auth tokens in web storage; any script in the page can read them. Use `HttpOnly` cookies set by the server.

```ts
import { createStore } from '@absoluteui/services/storage';

const store = createStore<number>({ namespace: 'hr-counters', validate: (v): v is number => typeof v === 'number' });
createStore<number>({ namespace: 'hr:counters' }); // => throws SVC_STORAGE_INVALID_NAMESPACE
await store.set('', 1); // => throws SVC_STORAGE_INVALID_KEY
await store.set('visits', Number.NaN, { ttlMs: -1 }); // => throws SVC_STORAGE_INVALID_TTL
```
