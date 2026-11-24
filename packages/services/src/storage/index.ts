/**
 * Storage services (docs/PLAN-HELPERS.md section 3): typed namespaced stores over local/session/IndexedDB/memory
 * with TTL, migrations, quota errors and cross-tab sync; a promise IndexedDB wrapper; cookies with secure
 * defaults; AES-GCM encryption at rest. SSR-safe: stores fall back to memory without a DOM.
 */
export { createStore, type Store, type StoreChange, type StoreSetOptions, type StoreSerializer, type StorageBackend, type CreateStoreOptions } from './store.js';
export { createEncryptedStore, type EncryptedStoreOptions } from './encrypted.js';
export { openIndexedDb, idbRequest, idbError, type IndexedDbConnection, type OpenIndexedDbOptions } from './indexeddb.js';
export { getCookie, getCookies, setCookie, removeCookie, MAX_COOKIE_BYTES, type CookieOptions } from './cookies.js';
