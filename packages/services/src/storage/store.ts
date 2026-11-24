/** Typed, namespaced, async-uniform key-value stores over web storage, IndexedDB or memory. */
import { HelperError, LimitError, ValidationError } from '@absoluteui/helpers/error';
import { safeJsonParse, safeJsonStringify } from '@absoluteui/helpers/json';
import { idbError, openIndexedDb, type IndexedDbConnection } from './indexeddb.js';

/** Where a store keeps its data. */
export type StorageBackend = 'local' | 'session' | 'memory' | 'indexeddb';

/** Converts values to and from strings. */
export interface StoreSerializer<T> {
  readonly serialize: (value: T) => string;
  readonly deserialize: (text: string) => unknown;
}

/** Options for {@link createStore}. */
export interface CreateStoreOptions<T> {
  /** Default `'local'`. Falls back to memory when unavailable (SSR, blocked storage, private mode). */
  readonly backend?: StorageBackend;
  /** Key prefix (web storage) or database name suffix (IndexedDB). 1-128 characters, no `:` or control characters. */
  readonly namespace: string;
  /** Data schema version (positive integer). Default 1. */
  readonly version?: number;
  /** Upgrades values written by an older version; without it (or for newer versions) old entries are dropped. */
  readonly migrate?: (oldValue: unknown, fromVersion: number) => T;
  /** Default time to live per entry in ms; expired entries are removed lazily on read or by `prune()`. */
  readonly ttlMs?: number;
  /** Custom value serializer. Default: JSON with ISO date revival (`Date` round-trips; `Map`/`Set` become arrays). */
  readonly serializer?: StoreSerializer<T>;
  /** Shape check on read and write. Failing reads are removed and reported; failing writes throw `SVC_STORAGE_INVALID`. */
  readonly validate?: (value: unknown) => value is T;
  /** Receives read problems (corrupt, invalid, migration failures). Reads never throw. */
  readonly onError?: (error: HelperError, key: string) => void;
  /** Clock in ms, injectable for tests. Default `Date.now`. */
  readonly now?: () => number;
}

/** A change notification from {@link Store.subscribe}. Read the new value with `get`. */
export interface StoreChange {
  /** Changed key, or `null` when the namespace was cleared. */
  readonly key: string | null;
  readonly kind: 'set' | 'remove' | 'clear';
  /**
   * `'local'` for this store instance; `'remote'` for another tab (local and session backends,
   * through `storage` events, which never fire in the same page) or another tab or instance
   * (IndexedDB, through `BroadcastChannel`).
   */
  readonly source: 'local' | 'remote';
}

/** Per-write options. */
export interface StoreSetOptions {
  /** Overrides the store's `ttlMs` for this entry. */
  readonly ttlMs?: number;
}

/** Async key-value store returned by {@link createStore}. */
export interface Store<T> {
  readonly namespace: string;
  /** The backend actually in use (`'memory'` after a fallback). Final once `ready` resolves. */
  readonly backend: StorageBackend;
  /** False when data lives only in memory (fallback or `'memory'` backend). Final once `ready` resolves. */
  readonly persistent: boolean;
  /** Resolves once the backend is open (or has fallen back to memory). */
  readonly ready: Promise<void>;
  /** Value for `key`, or `undefined` (missing, expired, corrupt, invalid). Never throws for bad data. */
  get(key: string): Promise<T | undefined>;
  /** Writes `value`; `undefined` removes. Rejects with `SVC_STORAGE_QUOTA` (`LimitError`) when storage is full. */
  set(key: string, value: T, options?: StoreSetOptions): Promise<void>;
  remove(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  /** Live (non-expired, valid) keys of this namespace. */
  keys(): Promise<string[]>;
  /** Live entries of this namespace. */
  entries(): Promise<[string, T][]>;
  /** Removes every entry of this namespace (other namespaces are untouched). */
  clear(): Promise<void>;
  /** Removes expired and corrupt entries now; resolves how many were removed. */
  prune(): Promise<number>;
  /**
   * Notifies about changes to `key` (or any key with `null`) from this instance and from other tabs
   * (`storage` events for local/session, `BroadcastChannel` for IndexedDB). Returns an unsubscribe function.
   */
  subscribe(key: string | null, callback: (change: StoreChange) => void): () => void;
  /** Releases listeners, channels and connections. */
  close(): void;
}

/** Raw string key-value backend scoped to one namespace. */
interface RawBackend {
  readonly kind: StorageBackend;
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
  close(): void;
}

const MAX_KEY_LENGTH = 512;
const BACKENDS: readonly string[] = ['local', 'session', 'memory', 'indexeddb'];

function validName(s: unknown, max: number, allowColon: boolean): s is string {
  if (typeof s !== 'string' || s.length === 0 || s.length > max) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f || (!allowColon && c === 0x3a)) return false;
  }
  return true;
}

function assertKey(key: string): void {
  if (!validName(key, MAX_KEY_LENGTH, true)) throw new ValidationError('SVC_STORAGE_INVALID_KEY', 'Storage key must be a non-empty string without control characters.');
}

function assertTtl(ttl: number | undefined): void {
  if (ttl !== undefined && !(Number.isFinite(ttl) && ttl > 0)) throw new ValidationError('SVC_STORAGE_INVALID_TTL', 'TTL must be a positive number of milliseconds.');
}

const isQuota = (e: unknown): boolean => {
  if (typeof e !== 'object' || e === null) return false;
  const { name, code } = e as { name?: unknown; code?: unknown };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
};

function writeError(e: unknown): HelperError {
  if (e instanceof HelperError) return e;
  if (isQuota(e)) return new LimitError('SVC_STORAGE_QUOTA', 'The storage quota was exceeded.', { cause: e });
  return new HelperError('SVC_STORAGE_WRITE_FAILED', 'Writing to storage failed.', { cause: e });
}

// ---------------------------------------------------------------------------
// Backends

function memoryBackend(): RawBackend {
  const map = new Map<string, string>();
  return {
    kind: 'memory',
    get: (k) => Promise.resolve(map.get(k)),
    set: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
    remove: (k) => {
      map.delete(k);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...map.keys()]),
    clear: () => {
      map.clear();
      return Promise.resolve();
    },
    close: () => undefined,
  };
}

/** The Storage object when usable; accessing it throws in some privacy modes. */
function webStorage(kind: 'local' | 'session'): Storage | undefined {
  let s: Storage | undefined;
  try {
    s = (globalThis as { localStorage?: Storage; sessionStorage?: Storage })[kind === 'local' ? 'localStorage' : 'sessionStorage'];
    if (!s) return undefined;
    const probe = '__aui_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch (e) {
    // A full store is still readable; anything else (SecurityError) means unavailable.
    return s && isQuota(e) ? s : undefined;
  }
}

function webBackend(storage: Storage, kind: 'local' | 'session', prefix: string): RawBackend {
  const ownKeys = (): string[] => {
    const out: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
    return out;
  };
  return {
    kind,
    get: (k) => {
      try {
        return Promise.resolve(storage.getItem(prefix + k) ?? undefined);
      } catch (e) {
        return Promise.reject(new HelperError('SVC_STORAGE_READ_FAILED', 'Reading from storage failed.', { cause: e }));
      }
    },
    set: (k, v) => {
      try {
        storage.setItem(prefix + k, v);
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(writeError(e));
      }
    },
    remove: (k) => {
      storage.removeItem(prefix + k);
      return Promise.resolve();
    },
    keys: () => Promise.resolve(ownKeys()),
    clear: () => {
      for (const k of ownKeys()) storage.removeItem(prefix + k);
      return Promise.resolve();
    },
    close: () => undefined,
  };
}

const IDB_STORE = 'kv';

async function idbBackend(namespace: string): Promise<RawBackend> {
  const conn: IndexedDbConnection = await openIndexedDb(`aui-store:${namespace}`, {
    version: 1,
    upgrade(db) {
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    },
  });
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
  return {
    kind: 'indexeddb',
    get: async (k) => str(await conn.get(IDB_STORE, k)),
    set: async (k, v) => {
      try {
        await conn.put(IDB_STORE, v, k);
      } catch (e) {
        throw idbError(e);
      }
    },
    remove: (k) => conn.delete(IDB_STORE, k),
    keys: async () => (await conn.keys(IDB_STORE)).filter((k): k is string => typeof k === 'string'),
    clear: () => conn.clear(IDB_STORE),
    close: () => {
      conn.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Envelope

interface Envelope {
  /** Schema version. */
  readonly v: number;
  /** Expiry (epoch ms). */
  readonly e?: number;
  /** Data. */
  readonly d?: unknown;
}

const isEnvelope = (x: unknown): x is Envelope => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return Number.isInteger(o.v) && (o.e === undefined || typeof o.e === 'number');
};

interface Sub {
  readonly key: string | null;
  readonly cb: (c: StoreChange) => void;
}

interface ChannelMessage {
  readonly k: string | null;
  readonly t: StoreChange['kind'];
}
const isChannelMessage = (x: unknown): x is ChannelMessage => {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (o.k === null || typeof o.k === 'string') && (o.t === 'set' || o.t === 'remove' || o.t === 'clear');
};

/**
 * Creates a typed, namespaced store with TTL, versioned migrations, validation and cross-tab change events.
 * All methods are async regardless of backend. Falls back to memory (with `persistent === false`) when the
 * requested backend is unavailable, including during SSR. Do not keep auth tokens in web storage (XSS-readable).
 * @example
 * const prefs = createStore<{ density: 'compact' | 'comfortable' }>({ namespace: 'prefs', version: 2,
 *   migrate: (old) => ({ density: (old as { compact?: boolean }).compact ? 'compact' : 'comfortable' }) });
 * await prefs.set('grid', { density: 'compact' });
 * const stop = prefs.subscribe('grid', () => { console.info('Grid preferences changed'); });
 */
export function createStore<T>(options: CreateStoreOptions<T>): Store<T> {
  const { backend = 'local', namespace, version = 1, migrate, ttlMs, serializer, validate, onError, now = Date.now } = options;
  if (!validName(namespace, 128, false)) throw new ValidationError('SVC_STORAGE_INVALID_NAMESPACE', 'Namespace must be 1-128 characters without ":" or control characters.');
  if (!Number.isInteger(version) || version < 1) throw new ValidationError('SVC_STORAGE_INVALID_VERSION', 'Version must be a positive integer.');
  if (!BACKENDS.includes(backend)) throw new ValidationError('SVC_STORAGE_INVALID_BACKEND', 'Unknown storage backend.');
  assertTtl(ttlMs);

  const prefix = `${namespace}:`;
  let webArea: Storage | undefined;
  let current: RawBackend;
  let rawPromise: Promise<RawBackend>;
  if (backend === 'local' || backend === 'session') {
    webArea = webStorage(backend);
    current = webArea ? webBackend(webArea, backend, prefix) : memoryBackend();
    rawPromise = Promise.resolve(current);
  } else if (backend === 'indexeddb' && (globalThis as { indexedDB?: unknown }).indexedDB != null) {
    current = { ...memoryBackend(), kind: 'indexeddb' };
    rawPromise = idbBackend(namespace).then(
      (b) => (current = b),
      () => (current = memoryBackend()),
    );
  } else {
    current = memoryBackend();
    rawPromise = Promise.resolve(current);
  }
  let closed = false;

  const report = (code: string, message: string, key: string, cause?: unknown): void => {
    try {
      onError?.(new HelperError(code, message, { kind: 'validation', ...(cause === undefined ? {} : { cause }) }), key);
    } catch {
      // A failing reporter must not break reads.
    }
  };

  const encode = (value: T, expires: number | undefined): string => {
    const env: { v: number; e?: number; d: unknown } = { v: version, d: serializer ? serializer.serialize(value) : value };
    if (expires !== undefined) env.e = expires;
    const text = safeJsonStringify(env, { circular: 'error' });
    if (text === undefined) throw new ValidationError('SVC_STORAGE_UNSERIALIZABLE', 'The value cannot be serialized.');
    return text;
  };

  // ---- subscriptions
  const subs = new Set<Sub>();
  let channel: BroadcastChannel | undefined;
  let detachStorage: (() => void) | undefined;
  const dispatch = (change: StoreChange): void => {
    for (const s of [...subs]) {
      if (s.key !== null && change.key !== null && s.key !== change.key) continue;
      try {
        s.cb(change);
      } catch (e) {
        report('SVC_STORAGE_LISTENER_FAILED', 'A storage change listener threw.', change.key ?? '', e);
      }
    }
  };
  const ensureChannel = (): BroadcastChannel | undefined => {
    if (channel || closed || current.kind !== 'indexeddb' || typeof BroadcastChannel !== 'function') return channel;
    channel = new BroadcastChannel(`aui-store:${namespace}`);
    channel.onmessage = (ev: MessageEvent<unknown>) => {
      if (isChannelMessage(ev.data)) dispatch({ key: ev.data.k, kind: ev.data.t, source: 'remote' });
    };
    return channel;
  };
  const ensureStorageListener = (): void => {
    if (detachStorage || !webArea) return;
    const target = globalThis as { addEventListener?: (t: string, l: (e: StorageEvent) => void) => void; removeEventListener?: (t: string, l: (e: StorageEvent) => void) => void };
    if (typeof target.addEventListener !== 'function') return;
    const area = webArea;
    const onStorage = (e: StorageEvent): void => {
      if (e.storageArea !== area) return;
      if (e.key === null) dispatch({ key: null, kind: 'clear', source: 'remote' });
      else if (e.key.startsWith(prefix)) dispatch({ key: e.key.slice(prefix.length), kind: e.newValue === null ? 'remove' : 'set', source: 'remote' });
    };
    target.addEventListener('storage', onStorage);
    detachStorage = () => {
      target.removeEventListener?.('storage', onStorage);
    };
  };
  const changed = (key: string | null, kind: StoreChange['kind']): void => {
    dispatch({ key, kind, source: 'local' });
    try {
      ensureChannel()?.postMessage({ k: key, t: kind } satisfies ChannelMessage);
    } catch {
      // Channel closed: other tabs simply miss this notification.
    }
  };

  // ---- reads
  const read = async (key: string): Promise<{ value: T } | undefined> => {
    const raw = await rawPromise;
    let text: string | undefined;
    try {
      text = await raw.get(key);
    } catch (e) {
      report('SVC_STORAGE_READ_FAILED', 'Reading from storage failed.', key, e);
      return undefined;
    }
    if (text === undefined) return undefined;
    const drop = async (code?: string, message?: string, cause?: unknown): Promise<undefined> => {
      if (code !== undefined && message !== undefined) report(code, message, key, cause);
      try {
        await raw.remove(key);
      } catch {
        // Best effort.
      }
      return undefined;
    };
    const parsed = safeJsonParse(text, { dates: serializer === undefined, unsafeKeys: 'strip' });
    if (!parsed.ok || !isEnvelope(parsed.value)) return drop('SVC_STORAGE_CORRUPT', 'A stored entry is corrupt and was removed.', parsed.ok ? undefined : parsed.error);
    const env = parsed.value;
    if (env.e !== undefined && env.e <= now()) return drop();
    let value: unknown;
    try {
      value = serializer ? serializer.deserialize(typeof env.d === 'string' ? env.d : '') : env.d;
    } catch (e) {
      return drop('SVC_STORAGE_CORRUPT', 'A stored entry is corrupt and was removed.', e);
    }
    if (env.v !== version) {
      if (!migrate || env.v > version) return drop('SVC_STORAGE_VERSION', 'A stored entry has an unsupported version and was removed.');
      try {
        value = migrate(value, env.v);
      } catch (e) {
        return drop('SVC_STORAGE_MIGRATION_FAILED', 'Migrating a stored entry failed; it was removed.', e);
      }
      if (validate && !validate(value)) return drop('SVC_STORAGE_INVALID', 'A stored entry failed validation and was removed.');
      try {
        await raw.set(key, encode(value as T, env.e));
      } catch (e) {
        report('SVC_STORAGE_WRITE_FAILED', 'Saving a migrated entry failed.', key, e);
      }
      return { value: value as T };
    }
    if (validate && !validate(value)) return drop('SVC_STORAGE_INVALID', 'A stored entry failed validation and was removed.');
    return { value: value as T };
  };

  const liveEntries = async (): Promise<[string, T][]> => {
    const raw = await rawPromise;
    const out: [string, T][] = [];
    for (const k of await raw.keys()) {
      const r = await read(k);
      if (r) out.push([k, r.value]);
    }
    return out;
  };

  const store: Store<T> = {
    namespace,
    get backend() {
      return current.kind;
    },
    get persistent() {
      return current.kind !== 'memory';
    },
    ready: rawPromise.then(() => undefined),
    async get(key) {
      assertKey(key);
      return (await read(key))?.value;
    },
    async set(key, value, opts = {}) {
      assertKey(key);
      assertTtl(opts.ttlMs);
      if (value === undefined) {
        await store.remove(key);
        return;
      }
      if (validate && !validate(value)) throw new ValidationError('SVC_STORAGE_INVALID', 'The value failed validation.');
      const ttl = opts.ttlMs ?? ttlMs;
      const text = encode(value, ttl === undefined ? undefined : now() + ttl);
      const raw = await rawPromise;
      try {
        await raw.set(key, text);
      } catch (e) {
        throw writeError(e);
      }
      changed(key, 'set');
    },
    async remove(key) {
      assertKey(key);
      const raw = await rawPromise;
      await raw.remove(key);
      changed(key, 'remove');
    },
    async has(key) {
      assertKey(key);
      return (await read(key)) !== undefined;
    },
    async keys() {
      return (await liveEntries()).map(([k]) => k);
    },
    entries: liveEntries,
    async clear() {
      const raw = await rawPromise;
      await raw.clear();
      changed(null, 'clear');
    },
    async prune() {
      const raw = await rawPromise;
      let removed = 0;
      for (const k of await raw.keys()) if ((await read(k)) === undefined) removed++;
      return removed;
    },
    subscribe(key, callback) {
      if (key !== null) assertKey(key);
      const sub: Sub = { key, cb: callback };
      subs.add(sub);
      ensureStorageListener();
      void rawPromise.then(() => ensureChannel());
      return () => {
        subs.delete(sub);
      };
    },
    close() {
      if (closed) return;
      closed = true;
      subs.clear();
      detachStorage?.();
      detachStorage = undefined;
      channel?.close();
      channel = undefined;
      void rawPromise.then((r) => {
        r.close();
      });
    },
  };
  return store;
}
