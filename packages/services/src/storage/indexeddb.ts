/** Minimal zero-dependency promise wrapper over IndexedDB. */
import { AbortError, HelperError, LimitError, TimeoutError } from '@absoluteui/helpers/error';

/** Options for {@link openIndexedDb}. */
export interface OpenIndexedDbOptions {
  /** Schema version (positive integer). Default 1. */
  readonly version?: number;
  /** Creates or migrates object stores; runs inside the `versionchange` transaction. */
  readonly upgrade?: (db: IDBDatabase, oldVersion: number, newVersion: number, transaction: IDBTransaction) => void;
  /** Another tab holds an older version open; the open waits until it closes. */
  readonly onBlocked?: () => void;
  /**
   * Another tab wants to upgrade. The connection is closed right after this callback so the upgrade is not blocked
   * (reload or reopen to get the new schema).
   */
  readonly onVersionChange?: () => void;
  /** Rejects with `SVC_IDB_TIMEOUT` if opening takes longer (for example blocked forever). Default 10,000 ms. */
  readonly timeoutMs?: number;
}

/** Promise-based IndexedDB connection returned by {@link openIndexedDb}. */
export interface IndexedDbConnection {
  /** The underlying database (for advanced use: indexes, cursors). */
  readonly db: IDBDatabase;
  /** Value for `key`, or `undefined`. */
  get<T = unknown>(store: string, key: IDBValidKey): Promise<T | undefined>;
  /** Writes `value` (under `key` for stores without a key path); resolves the key. */
  put(store: string, value: unknown, key?: IDBValidKey): Promise<IDBValidKey>;
  /** Deletes `key` (or a key range). */
  delete(store: string, key: IDBValidKey | IDBKeyRange): Promise<void>;
  /** Deletes every record in `store`. */
  clear(store: string): Promise<void>;
  /** All keys, optionally limited to a range. */
  keys(store: string, query?: IDBKeyRange): Promise<IDBValidKey[]>;
  /** All values, optionally limited to a range. */
  getAll<T = unknown>(store: string, query?: IDBKeyRange): Promise<T[]>;
  /** Record count. */
  count(store: string, query?: IDBKeyRange): Promise<number>;
  /**
   * Runs `work` in one transaction and resolves its result once the transaction COMMITS
   * (`oncomplete`); rejects on error or abort. Do not await unrelated promises inside `work`:
   * IndexedDB commits a transaction as soon as it has no pending requests.
   */
  transaction<R>(stores: string | readonly string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => R): Promise<R>;
  /** Closes the connection. Idempotent. */
  close(): void;
  /** True once closed (by `close()` or a version change from another tab). */
  readonly closed: boolean;
}

/**
 * Maps a DOMException from IndexedDB to a `HelperError` (quota -> `SVC_STORAGE_QUOTA`) without leaking platform messages.
 * @example
 * declare const req: IDBRequest<number>;
 * declare const reject: (error: Error) => void;
 * req.onerror = () => reject(idbError(req.error));
 */
export function idbError(e: unknown): HelperError {
  if (e instanceof HelperError) return e;
  const name = typeof e === 'object' && e !== null ? (e as { name?: unknown }).name : undefined;
  if (name === 'QuotaExceededError') return new LimitError('SVC_STORAGE_QUOTA', 'The storage quota was exceeded.', { cause: e });
  if (name === 'AbortError') return new AbortError('SVC_IDB_ABORTED', 'The IndexedDB transaction was aborted.', { cause: e });
  return new HelperError('SVC_IDB_ERROR', 'An IndexedDB operation failed.', { cause: e });
}

/**
 * Wraps an `IDBRequest` in a promise.
 * @example
 * declare const store: IDBObjectStore;
 * const n = await idbRequest(store.count());
 */
export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    // No preventDefault: a failed request must still abort its transaction.
    request.onerror = () => {
      reject(idbError(request.error));
    };
  });
}

/**
 * Opens (and creates or upgrades) an IndexedDB database with a promise API. Handles `blocked`,
 * `versionchange` (closes so other tabs can upgrade) and transaction completion correctly.
 * Rejects with `SVC_IDB_UNAVAILABLE` when IndexedDB is absent (SSR, some private modes).
 * @example
 * const conn = await openIndexedDb('app', {
 *   version: 2,
 *   upgrade(db, old) { if (old < 1) db.createObjectStore('drafts'); if (old < 2) db.createObjectStore('files'); },
 * });
 * await conn.put('drafts', { text: 'Hi' }, 'd1');
 */
export function openIndexedDb(name: string, options: OpenIndexedDbOptions = {}): Promise<IndexedDbConnection> {
  const { version = 1, upgrade, onBlocked, onVersionChange, timeoutMs = 10_000 } = options;
  const factory = (globalThis as { indexedDB?: IDBFactory | null }).indexedDB;
  if (!factory) return Promise.reject(new HelperError('SVC_IDB_UNAVAILABLE', 'IndexedDB is not available.', { kind: 'unsupported' }));
  if (!Number.isInteger(version) || version < 1) return Promise.reject(new HelperError('SVC_IDB_INVALID_VERSION', 'Version must be a positive integer.', { kind: 'validation' }));
  return new Promise<IndexedDbConnection>((resolve, reject) => {
    let settled = false;
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(name, version);
    } catch (e) {
      reject(idbError(e));
      return;
    }
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new TimeoutError('SVC_IDB_TIMEOUT', 'Opening IndexedDB timed out.'));
    }, timeoutMs);
    req.onupgradeneeded = (ev) => {
      const tx = req.transaction;
      if (upgrade && tx) {
        try {
          upgrade(req.result, ev.oldVersion, ev.newVersion ?? version, tx);
        } catch (e) {
          tx.abort();
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new HelperError('SVC_IDB_UPGRADE_FAILED', 'The IndexedDB upgrade failed.', { cause: e }));
          }
        }
      }
    };
    req.onblocked = () => {
      onBlocked?.();
    };
    req.onerror = (ev) => {
      ev.preventDefault();
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(idbError(req.error));
    };
    req.onsuccess = () => {
      const db = req.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(wrap(db, onVersionChange));
    };
  });
}

function wrap(db: IDBDatabase, onVersionChange: (() => void) | undefined): IndexedDbConnection {
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    db.close();
  };
  db.onversionchange = () => {
    try {
      onVersionChange?.();
    } finally {
      close();
    }
  };
  db.onclose = () => {
    closed = true;
  };
  const assertOpen = (): void => {
    if (closed) throw new HelperError('SVC_IDB_CLOSED', 'The IndexedDB connection is closed.');
  };
  const transaction = <R>(stores: string | readonly string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => R): Promise<R> =>
    new Promise<R>((resolve, reject) => {
      assertOpen();
      let tx: IDBTransaction;
      try {
        tx = db.transaction(typeof stores === 'string' ? stores : [...stores], mode);
      } catch (e) {
        reject(idbError(e));
        return;
      }
      let result: R;
      let failure: unknown;
      tx.oncomplete = () => {
        resolve(result);
      };
      tx.onerror = (ev) => {
        // Not prevented: the failed request aborts the transaction and `onabort` rejects.
        failure ??= (ev.target as IDBRequest | null)?.error ?? tx.error;
      };
      tx.onabort = () => {
        reject(idbError(failure ?? tx.error ?? new DOMException('Transaction aborted.', 'AbortError')));
      };
      try {
        result = work(tx);
      } catch (e) {
        failure = e;
        try {
          tx.abort();
        } catch {
          // Already finished.
        }
      }
    });
  const one = <T>(store: string, mode: IDBTransactionMode, make: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    transaction(store, mode, (tx) => {
      return make(tx.objectStore(store));
    }).then((req) => req.result);
  return {
    db,
    get closed() {
      return closed;
    },
    get: <T>(store: string, key: IDBValidKey) => one(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
    put: (store, value, key) => one(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key))),
    delete: (store, key) => one(store, 'readwrite', (s) => s.delete(key)).then(() => undefined),
    clear: (store) => one(store, 'readwrite', (s) => s.clear()).then(() => undefined),
    keys: (store, query) => one(store, 'readonly', (s) => s.getAllKeys(query)),
    getAll: <T>(store: string, query?: IDBKeyRange) => one(store, 'readonly', (s) => s.getAll(query) as IDBRequest<T[]>),
    count: (store, query) => one(store, 'readonly', (s) => s.count(query)),
    transaction,
    close,
  };
}
