/** AES-GCM encryption at rest on top of any string store. */
import { HelperError, ValidationError } from '@absoluteui/helpers/error';
import { safeJsonParse, safeJsonStringify } from '@absoluteui/helpers/json';
import { aesGcmDecryptString, aesGcmEncryptString } from '../crypto/index.js';
import type { Store } from './store.js';

/** Options for {@link createEncryptedStore}. */
export interface EncryptedStoreOptions<T> {
  /** Shape check after decryption; failing values read as `undefined` and are reported. */
  readonly validate?: (value: unknown) => value is T;
  /** Receives decryption and parse failures. Entries that fail to decrypt are kept (the key may be wrong). */
  readonly onError?: (error: HelperError, key: string) => void;
}

/**
 * Wraps a string store so values are encrypted with AES-GCM (fresh random 96-bit IV per write; AAD binds each
 * ciphertext to `namespace` and key, so entries cannot be swapped between keys). TTL, versions and change events
 * come from the inner store (its `migrate` sees ciphertext, so version the plaintext yourself if needed).
 *
 * Protects data at rest only (disk, backups, other OS users). It does NOT protect against XSS: script running in
 * the page can use the same key. Never store auth tokens in web storage; use HttpOnly cookies.
 * @example
 * import { deriveKeyPbkdf2, randomSalt } from '@absoluteui/services/crypto';
 * type Draft = { text: string };
 * const key = await deriveKeyPbkdf2('user passphrase', randomSalt());
 * const drafts = createEncryptedStore<Draft>(createStore<string>({ namespace: 'drafts', backend: 'indexeddb' }), key);
 * await drafts.set('d1', { text: 'Hi' });
 */
export function createEncryptedStore<T>(store: Store<string>, key: CryptoKey, options: EncryptedStoreOptions<T> = {}): Store<T> {
  const { validate, onError } = options;
  const aad = (k: string): string => `${store.namespace}\u0000${k}`;
  const report = (code: string, message: string, k: string): void => {
    try {
      onError?.(new HelperError(code, message, { kind: 'validation' }), k);
    } catch {
      // Reporter failures never break reads.
    }
  };
  const decrypt = async (k: string, token: string): Promise<T | undefined> => {
    let text: string;
    try {
      text = await aesGcmDecryptString(key, token, { aad: aad(k) });
    } catch {
      report('SVC_STORAGE_DECRYPT_FAILED', 'A stored entry could not be decrypted.', k);
      return undefined;
    }
    const r = safeJsonParse(text, { dates: true, unsafeKeys: 'strip' });
    if (!r.ok || (validate && !validate(r.value))) {
      report('SVC_STORAGE_INVALID', 'A decrypted entry is invalid.', k);
      return undefined;
    }
    return r.value as T;
  };
  const enc: Store<T> = {
    namespace: store.namespace,
    get backend() {
      return store.backend;
    },
    get persistent() {
      return store.persistent;
    },
    ready: store.ready,
    async get(k) {
      const token = await store.get(k);
      return token === undefined ? undefined : decrypt(k, token);
    },
    async set(k, value, opts) {
      if (value === undefined) {
        await store.remove(k);
        return;
      }
      if (validate && !validate(value)) throw new ValidationError('SVC_STORAGE_INVALID', 'The value failed validation.');
      const text = safeJsonStringify(value, { circular: 'error' });
      if (text === undefined) throw new ValidationError('SVC_STORAGE_UNSERIALIZABLE', 'The value cannot be serialized.');
      await store.set(k, await aesGcmEncryptString(key, text, { aad: aad(k) }), opts);
    },
    remove: (k) => store.remove(k),
    async has(k) {
      return (await enc.get(k)) !== undefined;
    },
    async keys() {
      return (await enc.entries()).map(([k]) => k);
    },
    async entries() {
      const out: [string, T][] = [];
      for (const [k, token] of await store.entries()) {
        const v = await decrypt(k, token);
        if (v !== undefined) out.push([k, v]);
      }
      return out;
    },
    clear: () => store.clear(),
    prune: () => store.prune(),
    subscribe: (k, cb) => store.subscribe(k, cb),
    close() {
      store.close();
    },
  };
  return enc;
}
