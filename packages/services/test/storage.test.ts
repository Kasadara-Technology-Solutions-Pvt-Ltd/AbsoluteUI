import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelperError, LimitError, isHelperError } from '@absoluteui/helpers/error';
import { generateAesKey } from '@absoluteui/services/crypto';
import { createEncryptedStore, createStore, getCookie, getCookies, openIndexedDb, removeCookie, setCookie, type StoreChange } from '@absoluteui/services/storage';

const until = async (cond: () => boolean, ms = 2000): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
};

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('createStore (local/session/memory)', () => {
  it.each(['local', 'session', 'memory'] as const)('%s: get/set/remove/has/keys/entries/clear', async (backend) => {
    const s = createStore<{ n: number; at?: Date }>({ backend, namespace: 'ns1' });
    expect(s.backend).toBe(backend);
    expect(s.persistent).toBe(backend !== 'memory');
    const at = new Date('2026-01-02T03:04:05.000Z');
    await s.set('a', { n: 1, at });
    await s.set('b', { n: 2 });
    const a = await s.get('a');
    expect(a?.n).toBe(1);
    expect(a?.at).toBeInstanceOf(Date);
    expect(a?.at?.getTime()).toBe(at.getTime());
    expect(await s.has('b')).toBe(true);
    expect((await s.keys()).sort()).toEqual(['a', 'b']);
    expect((await s.entries()).length).toBe(2);
    await s.remove('a');
    expect(await s.get('a')).toBeUndefined();
    await s.set('b', undefined as unknown as { n: number });
    expect(await s.has('b')).toBe(false);
    await s.set('c', { n: 3 });
    await s.clear();
    expect(await s.keys()).toEqual([]);
  });

  it('prefixes keys with the namespace and clears only its namespace', async () => {
    const a = createStore<number>({ namespace: 'app' });
    const b = createStore<number>({ namespace: 'other' });
    await a.set('x', 1);
    await b.set('x', 2);
    localStorage.setItem('unrelated', 'keep');
    expect(localStorage.getItem('app:x')).not.toBeNull();
    await a.clear();
    expect(await b.get('x')).toBe(2);
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });

  it('validates namespace, key, ttl and version', () => {
    expect(() => createStore({ namespace: 'a:b' })).toThrow(HelperError);
    expect(() => createStore({ namespace: '' })).toThrow(HelperError);
    expect(() => createStore({ namespace: 'x', version: 0 })).toThrow(HelperError);
    expect(() => createStore({ namespace: 'x', ttlMs: -1 })).toThrow(HelperError);
    expect(() => createStore({ namespace: 'x', backend: 'cloud' as 'local' })).toThrow(HelperError);
    const s = createStore<number>({ namespace: 'x' });
    return expect(s.get('')).rejects.toMatchObject({ code: 'SVC_STORAGE_INVALID_KEY' });
  });

  it('expires entries lazily and prunes', async () => {
    let t = 1_000;
    const s = createStore<string>({ namespace: 'ttl', ttlMs: 100, now: () => t });
    await s.set('a', 'x');
    await s.set('b', 'y', { ttlMs: 1_000 });
    t += 150;
    expect(await s.get('a')).toBeUndefined();
    expect(localStorage.getItem('ttl:a')).toBeNull();
    expect(await s.get('b')).toBe('y');
    await s.set('c', 'z');
    t += 200;
    expect(await s.prune()).toBe(1);
    expect(await s.keys()).toEqual(['b']);
  });

  it('migrates old versions, drops unknown versions, and reports corruption without throwing', async () => {
    const errors: string[] = [];
    const v1 = createStore<{ compact: boolean }>({ namespace: 'mig', version: 1 });
    await v1.set('grid', { compact: true });
    const v2 = createStore<{ density: string }>({
      namespace: 'mig',
      version: 2,
      migrate: (old, from) => {
        expect(from).toBe(1);
        return { density: (old as { compact: boolean }).compact ? 'compact' : 'comfortable' };
      },
      onError: (e) => errors.push(e.code),
    });
    expect(await v2.get('grid')).toEqual({ density: 'compact' });
    expect(localStorage.getItem('mig:grid')).toContain('"v":2');
    // Downgrade: v1 cannot read v2 data.
    const v1b = createStore<unknown>({ namespace: 'mig', version: 1, onError: (e) => errors.push(e.code) });
    expect(await v1b.get('grid')).toBeUndefined();
    localStorage.setItem('mig:bad', '{not json');
    localStorage.setItem('mig:shape', '[1,2]');
    expect(await v2.get('bad')).toBeUndefined();
    expect(await v2.get('shape')).toBeUndefined();
    expect(localStorage.getItem('mig:bad')).toBeNull();
    expect(errors).toEqual(['SVC_STORAGE_VERSION', 'SVC_STORAGE_CORRUPT', 'SVC_STORAGE_CORRUPT']);
  });

  it('validates values on read and write', async () => {
    const isNum = (v: unknown): v is number => typeof v === 'number';
    const errors: string[] = [];
    const s = createStore<number>({ namespace: 'val', validate: isNum, onError: (e) => errors.push(e.code) });
    await expect(s.set('a', 'x' as unknown as number)).rejects.toMatchObject({ code: 'SVC_STORAGE_INVALID' });
    localStorage.setItem('val:a', JSON.stringify({ v: 1, d: 'str' }));
    expect(await s.get('a')).toBeUndefined();
    expect(errors).toEqual(['SVC_STORAGE_INVALID']);
  });

  it('never lets stored JSON pollute prototypes', async () => {
    localStorage.setItem('pp:a', '{"v":1,"d":{"__proto__":{"polluted":true},"ok":1}}');
    const s = createStore<Record<string, unknown>>({ namespace: 'pp' });
    const v = await s.get('a');
    expect(v).toEqual({ ok: 1 });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('supports custom serializers', async () => {
    const s = createStore<Set<string>>({ namespace: 'ser', serializer: { serialize: (v) => [...v].join(','), deserialize: (t) => new Set(t.split(',')) } });
    await s.set('tags', new Set(['a', 'b']));
    expect([...((await s.get('tags')) ?? [])]).toEqual(['a', 'b']);
  });

  it('maps quota errors to LimitError SVC_STORAGE_QUOTA', async () => {
    const s = createStore<string>({ namespace: 'quota' });
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      const err = await s.set('a', 'x').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(LimitError);
      expect(isHelperError(err, 'SVC_STORAGE_QUOTA')).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('falls back to memory when storage is unavailable', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    let s;
    try {
      s = createStore<number>({ namespace: 'fb' });
    } finally {
      spy.mockRestore();
    }
    expect(s.persistent).toBe(false);
    expect(s.backend).toBe('memory');
    await s.set('a', 1);
    expect(await s.get('a')).toBe(1);
    expect(localStorage.getItem('fb:a')).toBeNull();
  });

  it('notifies local subscribers and remote storage events', async () => {
    const s = createStore<number>({ namespace: 'sub' });
    const all: StoreChange[] = [];
    const onlyA: StoreChange[] = [];
    const stop = s.subscribe(null, (c) => all.push(c));
    s.subscribe('a', (c) => onlyA.push(c));
    await s.set('a', 1);
    await s.set('b', 2);
    await s.remove('a');
    window.dispatchEvent(new StorageEvent('storage', { key: 'sub:b', newValue: 'x', storageArea: localStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'other:b', newValue: 'x', storageArea: localStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    expect(all).toEqual([
      { key: 'a', kind: 'set', source: 'local' },
      { key: 'b', kind: 'set', source: 'local' },
      { key: 'a', kind: 'remove', source: 'local' },
      { key: 'b', kind: 'set', source: 'remote' },
      { key: null, kind: 'clear', source: 'remote' },
    ]);
    expect(onlyA.map((c) => c.kind)).toEqual(['set', 'remove', 'clear']);
    stop();
    s.close();
  });
});

describe('createStore (indexeddb)', () => {
  it('persists, lists and syncs across instances through BroadcastChannel', async () => {
    const ns = `idb${String(Date.now())}`;
    const a = createStore<{ n: number }>({ backend: 'indexeddb', namespace: ns });
    const b = createStore<{ n: number }>({ backend: 'indexeddb', namespace: ns });
    await a.ready;
    await b.ready;
    expect(a.backend).toBe('indexeddb');
    expect(a.persistent).toBe(true);
    const seen: StoreChange[] = [];
    b.subscribe(null, (c) => seen.push(c));
    await new Promise((r) => setTimeout(r, 20));
    await a.set('k', { n: 1 });
    expect(await b.get('k')).toEqual({ n: 1 });
    await until(() => seen.length > 0);
    expect(seen[0]).toEqual({ key: 'k', kind: 'set', source: 'remote' });
    expect(await a.keys()).toEqual(['k']);
    await a.clear();
    expect(await b.get('k')).toBeUndefined();
    a.close();
    b.close();
    await new Promise<void>((r) => {
      const req = indexedDB.deleteDatabase(`aui-store:${ns}`);
      req.onsuccess = req.onerror = req.onblocked = () => {
        r();
      };
    });
  });
});

describe('openIndexedDb', () => {
  it('upgrades, runs transactions and closes on versionchange', async () => {
    const name = `aui-test-${String(Date.now())}`;
    const conn = await openIndexedDb(name, {
      version: 1,
      upgrade(db, old) {
        expect(old).toBe(0);
        db.createObjectStore('items', { keyPath: 'id' });
      },
    });
    await conn.put('items', { id: 1, v: 'a' });
    await conn.put('items', { id: 2, v: 'b' });
    expect(await conn.get<{ v: string }>('items', 1)).toEqual({ id: 1, v: 'a' });
    expect(await conn.count('items')).toBe(2);
    expect(await conn.keys('items')).toEqual([1, 2]);
    expect((await conn.getAll('items')).length).toBe(2);
    const r = await conn.transaction('items', 'readwrite', (tx) => {
      tx.objectStore('items').delete(1);
      return 'done';
    });
    expect(r).toBe('done');
    // A failing request aborts the whole transaction (constraint error on add of an existing key).
    await expect(
      conn.transaction('items', 'readwrite', (tx) => {
        tx.objectStore('items').put({ id: 3, v: 'c' });
        tx.objectStore('items').add({ id: 2, v: 'dup' });
      }),
    ).rejects.toBeInstanceOf(HelperError);
    expect(await conn.get('items', 3)).toBeUndefined();
    await conn.delete('items', 2);
    await conn.clear('items');
    let changed = false;
    const v2 = openIndexedDb(name, { version: 2, upgrade: (db) => db.createObjectStore('more') });
    conn.db.addEventListener('versionchange', () => (changed = true));
    const conn2 = await v2;
    expect(conn.closed).toBe(true);
    expect(changed).toBe(true);
    await expect(conn.get('items', 1)).rejects.toMatchObject({ code: 'SVC_IDB_CLOSED' });
    conn2.close();
    indexedDB.deleteDatabase(name);
  });

  it('reports failed upgrades and invalid versions', async () => {
    await expect(openIndexedDb('x', { version: 0 })).rejects.toMatchObject({ code: 'SVC_IDB_INVALID_VERSION' });
    const name = `aui-fail-${String(Date.now())}`;
    await expect(
      openIndexedDb(name, {
        upgrade() {
          throw new Error('boom');
        },
      }),
    ).rejects.toMatchObject({ code: 'SVC_IDB_UPGRADE_FAILED' });
    indexedDB.deleteDatabase(name);
  });
});

describe('cookies', () => {
  afterEach(() => {
    for (const k of Object.keys(getCookies())) removeCookie(k);
  });
  it('sets, reads, encodes and removes', () => {
    // The test page is http://localhost, so Secure cookies are still accepted (localhost is potentially trustworthy).
    expect(setCookie('theme', 'dark mode; é')).toBe(true);
    expect(getCookie('theme')).toBe('dark mode; é');
    expect(getCookies().theme).toBe('dark mode; é');
    removeCookie('theme');
    expect(getCookie('theme')).toBeUndefined();
  });
  it('rejects invalid names, attributes and oversize values', () => {
    expect(() => setCookie('a;b', 'x')).toThrow(HelperError);
    expect(() => setCookie('a\nb', 'x')).toThrow(HelperError);
    expect(() => setCookie('', 'x')).toThrow(HelperError);
    expect(() => setCookie('a', 'x', { path: '/;evil' })).toThrow(HelperError);
    expect(() => setCookie('a', 'x', { domain: 'a.com\u0000' })).toThrow(HelperError);
    expect(() => setCookie('a', 'x', { maxAge: 1.5 })).toThrow(HelperError);
    expect(() => setCookie('__Host-a', 'x', { path: '/app' })).toThrow(HelperError);
    expect(() => setCookie('a', 'x'.repeat(5000))).toThrow(LimitError);
    expect(() => getCookie('bad name')).toThrow(HelperError);
  });
  it('writes secure defaults', () => {
    const spy = vi.spyOn(Document.prototype, 'cookie', 'set');
    try {
      setCookie('p', 'v', { maxAge: 60 });
      expect(spy.mock.calls[0]?.[0]).toBe('p=v; Path=/; Max-Age=60; SameSite=Lax; Secure');
      setCookie('p', 'v', { secure: false, sameSite: 'Strict' });
      expect(spy.mock.calls[1]?.[0]).toBe('p=v; Path=/; SameSite=Strict');
      setCookie('p', 'v', { secure: false, sameSite: 'None', partitioned: true });
      expect(spy.mock.calls[2]?.[0]).toBe('p=v; Path=/; SameSite=None; Secure; Partitioned');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('createEncryptedStore', () => {
  it('encrypts at rest, binds entries to keys and round-trips values', async () => {
    const key = await generateAesKey();
    const inner = createStore<string>({ namespace: 'enc' });
    const errors: string[] = [];
    const s = createEncryptedStore<{ secret: string; at: Date }>(inner, key, { onError: (e) => errors.push(e.code) });
    const at = new Date('2026-05-01T00:00:00.000Z');
    await s.set('a', { secret: 'top', at });
    await s.set('b', { secret: 'other', at });
    expect(localStorage.getItem('enc:a')).not.toContain('top');
    const v = await s.get('a');
    expect(v?.secret).toBe('top');
    expect(v?.at.getTime()).toBe(at.getTime());
    // Swapping ciphertexts between keys fails authentication (AAD = namespace + key).
    localStorage.setItem('enc:a', localStorage.getItem('enc:b') ?? '');
    expect(await s.get('a')).toBeUndefined();
    expect(errors).toEqual(['SVC_STORAGE_DECRYPT_FAILED']);
    expect(localStorage.getItem('enc:a')).not.toBeNull();
    expect((await s.entries()).map(([k]) => k)).toEqual(['b']);
    const wrong = createEncryptedStore<unknown>(inner, await generateAesKey());
    expect(await wrong.get('b')).toBeUndefined();
  });
});
