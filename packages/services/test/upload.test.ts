import { describe, expect, it } from 'vitest';
import { AbortError, HttpError, ValidationError } from '@absoluteui/helpers/error';
import type { FetchLike } from '@absoluteui/services/http';
import {
  MIN_CHUNK_SIZE,
  chunkChecksum,
  createRestUploadAdapter,
  createUploadQueue,
  createUploader,
  describeUploadProgress,
  resumeKey,
  type PersistedUpload,
  type UploadAdapter,
  type UploadChunkInput,
  type UploadedPart,
  type UploadStateStore,
} from '@absoluteui/services/upload';

const K = MIN_CHUNK_SIZE;
const fast = { minDelayMs: 1, maxDelayMs: 5 };
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const file = (size: number, name = 'f.bin'): File => new File([new Uint8Array(size)], name, { lastModified: 1_700_000_000_000 });

interface FakeAdapter extends UploadAdapter {
  readonly chunks: UploadChunkInput[];
  readonly completed: UploadedPart[][];
  readonly aborted: string[];
  maxActive: number;
}

function fakeAdapter(opts: { delay?: number; uploaded?: number[]; fail?: (input: UploadChunkInput, attempt: number) => Error | undefined; hold?: Promise<void> } = {}): FakeAdapter {
  let active = 0;
  const attempts = new Map<number, number>();
  const a: FakeAdapter = {
    chunks: [],
    completed: [],
    aborted: [],
    maxActive: 0,
    start: (_file, info) => Promise.resolve({ uploadId: info.uploadId ?? 'up-1', ...(opts.uploaded ? { uploadedChunks: opts.uploaded } : {}) }),
    async uploadChunk(input) {
      active++;
      a.maxActive = Math.max(a.maxActive, active);
      try {
        const n = (attempts.get(input.index) ?? 0) + 1;
        attempts.set(input.index, n);
        input.onProgress(Math.floor(input.size / 2));
        if (opts.hold) await opts.hold;
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, opts.delay ?? 1);
          input.signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new AbortError());
          }, { once: true });
        });
        const f = opts.fail?.(input, n);
        if (f) throw f;
        a.chunks.push(input);
        return { etag: `e${String(input.index)}` };
      } finally {
        active--;
      }
    },
    complete({ parts }) {
      a.completed.push([...parts]);
      return Promise.resolve({ ok: true });
    },
    abort(id) {
      a.aborted.push(id);
      return Promise.resolve();
    },
  };
  return a;
}

function memoryStore(): UploadStateStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return { map, get: (k) => map.get(k), set: (k, v) => { map.set(k, v); }, remove: (k) => { map.delete(k); } };
}

describe('createUploader', () => {
  it('validates options', () => {
    expect(() => createUploader({ adapter: fakeAdapter(), chunkSize: 1000 })).toThrow(ValidationError);
    expect(() => createUploader({ adapter: fakeAdapter(), concurrency: 0 })).toThrow(ValidationError);
    expect(() => createUploader({})).toThrow(ValidationError);
  });

  it('slices chunks correctly, including the short last chunk', async () => {
    const adapter = fakeAdapter();
    const up = createUploader({ adapter, chunkSize: K }).upload(file(2 * K + 100), { metadata: { a: 1 } });
    const result = await up.promise;
    const sizes = [...adapter.chunks].sort((x, y) => x.index - y.index).map((c) => [c.index, c.offset, c.size, c.blob.size]);
    expect(sizes).toEqual([[0, 0, K, K], [1, K, K, K], [2, 2 * K, 100, 100]]);
    expect(result).toMatchObject({ uploadId: 'up-1', size: 2 * K + 100, response: { ok: true } });
    expect(result.parts.map((p) => [p.index, p.etag])).toEqual([[0, 'e0'], [1, 'e1'], [2, 'e2']]);
    expect(up.state).toBe('completed');
    expect(up.progress).toMatchObject({ loaded: 2 * K + 100, percent: 100 });
  });

  it('handles exact multiples and empty files', async () => {
    const a1 = fakeAdapter();
    await createUploader({ adapter: a1, chunkSize: K }).upload(file(2 * K)).promise;
    expect(a1.chunks.map((c) => c.size)).toEqual([K, K]);
    const a2 = fakeAdapter();
    const up = createUploader({ adapter: a2, chunkSize: K }).upload(file(0));
    await up.promise;
    expect(a2.chunks.map((c) => c.size)).toEqual([0]);
    expect(up.progress.percent).toBe(100);
  });

  it('respects the concurrency limit', async () => {
    const adapter = fakeAdapter({ delay: 15 });
    await createUploader({ adapter, chunkSize: K, concurrency: 2 }).upload(file(6 * K)).promise;
    expect(adapter.maxActive).toBe(2);
    expect(adapter.chunks).toHaveLength(6);
  });

  it('retries failed chunks with backoff and fails on non-retryable errors', async () => {
    const a1 = fakeAdapter({ fail: (i, n) => (i.index === 1 && n < 3 ? new HttpError('X', 'x', { status: 503 }) : undefined) });
    await createUploader({ adapter: a1, chunkSize: K, backoff: fast }).upload(file(2 * K)).promise;
    expect(a1.chunks.map((c) => c.index).sort()).toEqual([0, 1]);
    const a2 = fakeAdapter({ fail: (i) => (i.index === 0 ? new HttpError('X', 'x', { status: 400 }) : undefined) });
    const up = createUploader({ adapter: a2, chunkSize: K, backoff: fast }).upload(file(3 * K));
    await expect(up.promise).rejects.toMatchObject({ status: 400 });
    expect(up.state).toBe('failed');
    expect(up.error).toBeInstanceOf(HttpError);
    const a3 = fakeAdapter({ fail: () => new TypeError('network') });
    await expect(createUploader({ adapter: a3, chunkSize: K, retries: 2, backoff: fast }).upload(file(10)).promise).rejects.toBeInstanceOf(TypeError);
  });

  it('pauses and resumes without losing chunks', async () => {
    const adapter = fakeAdapter({ delay: 20 });
    const states: string[] = [];
    const up = createUploader({ adapter, chunkSize: K, concurrency: 2, onStateChange: (s) => states.push(s) }).upload(file(5 * K));
    await sleep(30);
    up.pause();
    expect(up.state).toBe('paused');
    const done = adapter.chunks.length;
    await sleep(60);
    expect(adapter.chunks.length).toBe(done);
    up.resume();
    const result = await up.promise;
    expect(new Set(adapter.chunks.map((c) => c.index))).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(result.parts).toHaveLength(5);
    expect(states).toEqual(['uploading', 'paused', 'uploading', 'completed']);
  });

  it('resumes from the store and skips chunks the server has', async () => {
    const f = file(3 * K + 5);
    const store = memoryStore();
    const saved: PersistedUpload = { uploadId: 'up-9', chunkSize: K, size: f.size, savedAt: 1 };
    store.map.set(resumeKey(f), saved);
    const adapter = fakeAdapter({ uploaded: [0, 2, 99] });
    const up = createUploader({ adapter, chunkSize: 2 * K, store }).upload(f);
    const result = await up.promise;
    expect(adapter.chunks.map((c) => c.index).sort()).toEqual([1, 3]);
    expect(adapter.chunks.every((c) => c.uploadId === 'up-9')).toBe(true);
    expect(result.parts.map((p) => [p.index, p.resumed])).toEqual([[0, true], [1, false], [2, true], [3, false]]);
    expect(store.map.size).toBe(0);
  });

  it('ignores malformed persisted state and persists new uploads until they complete', async () => {
    const f = file(K + 1);
    const store = memoryStore();
    store.map.set(resumeKey(f), { uploadId: 42, chunkSize: 'x' });
    const adapter = fakeAdapter({ fail: (i) => (i.index === 1 ? new HttpError('X', 'x', { status: 400 }) : undefined) });
    await expect(createUploader({ adapter, chunkSize: K, store }).upload(f).promise).rejects.toBeInstanceOf(HttpError);
    expect(store.map.get(resumeKey(f))).toMatchObject({ uploadId: 'up-1', chunkSize: K, size: K + 1 });
  });

  it('cancel aborts in-flight chunks, calls adapter.abort and forgets state', async () => {
    const store = memoryStore();
    const adapter = fakeAdapter({ delay: 50 });
    const f = file(4 * K);
    const up = createUploader({ adapter, chunkSize: K, store }).upload(f);
    await sleep(15);
    up.cancel();
    const e = await up.promise.catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AbortError);
    expect(e).toMatchObject({ code: 'SVC_UPLOAD_CANCELLED' });
    expect(up.state).toBe('cancelled');
    expect(adapter.aborted).toEqual(['up-1']);
    expect(store.map.has(resumeKey(f))).toBe(false);
    expect(adapter.completed).toHaveLength(0);
  });

  it('computes checksums per chunk', async () => {
    expect(await chunkChecksum(new Blob(['123456789']), 'crc32')).toEqual({ algorithm: 'crc32', value: 'cbf43926' });
    expect(await chunkChecksum(new Blob(['abc']), 'sha256')).toEqual({ algorithm: 'sha256', value: 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=' });
    const big = new Uint8Array(2.5 * 1024 * 1024).map((_, i) => i % 251);
    const { crc32 } = await import('@absoluteui/helpers/encoding');
    expect((await chunkChecksum(new Blob([big]), 'crc32')).value).toBe(crc32(big).toString(16).padStart(8, '0'));
    const adapter = fakeAdapter();
    const r = await createUploader({ adapter, chunkSize: K, checksum: 'crc32' }).upload(new File(['123456789'], 'a.txt')).promise;
    expect(adapter.chunks[0]?.checksum).toEqual({ algorithm: 'crc32', value: 'cbf43926' });
    expect(r.parts[0]?.checksum?.value).toBe('cbf43926');
  });

  it('reports progress with speed and ETA', async () => {
    let t = 0;
    const loaded: number[] = [];
    const adapter = fakeAdapter({ delay: 5 });
    const up = createUploader({ adapter, chunkSize: K, concurrency: 1, now: () => (t += 100), onProgress: (p) => loaded.push(p.loaded) }).upload(file(3 * K));
    await up.promise;
    expect(loaded.at(-1)).toBe(3 * K);
    expect(Math.max(...loaded)).toBe(3 * K);
    expect(up.progress.speedBps).toBeGreaterThan(0);
  });

  it('resumeKey is stable and does not contain the file name', () => {
    const a = file(10, 'secret-report.pdf');
    expect(resumeKey(a)).toBe(resumeKey(file(10, 'secret-report.pdf')));
    expect(resumeKey(a)).not.toBe(resumeKey(file(11, 'secret-report.pdf')));
    expect(resumeKey(a)).not.toContain('secret');
  });
});

describe('describeUploadProgress', () => {
  const p = { loaded: 45, total: 100, percent: 45.7, speedBps: 1, etaMs: 120_000 };
  it('builds live-region text', () => {
    expect(describeUploadProgress(p, { locale: 'en' })).toBe('45% uploaded, about 2 minutes remaining');
    expect(describeUploadProgress({ ...p, etaMs: null }, { locale: 'en' })).toBe('45% uploaded');
    expect(describeUploadProgress(p, { locale: 'en', state: 'paused' })).toBe('Upload paused at 45%');
    expect(describeUploadProgress(p, { state: 'completed' })).toBe('Upload complete');
    const de = describeUploadProgress(p, { locale: 'de', messages: { uploading: (pc, r) => `${pc} hochgeladen${r === undefined ? '' : `, noch etwa ${r}`}` } });
    expect(de.replace(/\s/gu, ' ')).toBe('45 % hochgeladen, noch etwa 2 Minuten');
  });
});

describe('createUploadQueue', () => {
  it('limits concurrent files and emits events', async () => {
    const adapter = fakeAdapter({ delay: 10 });
    const uploader = createUploader({ adapter, chunkSize: K });
    const queue = createUploadQueue({ uploader, concurrency: 2 });
    let running = 0;
    let maxRunning = 0;
    const completed: string[] = [];
    queue.on('started', () => { running++; maxRunning = Math.max(maxRunning, running); });
    queue.on('completed', (item) => { running--; completed.push(item.id); });
    const items = queue.add([file(10, 'a'), file(20, 'b'), file(30, 'c')]);
    await queue.onIdle();
    expect(maxRunning).toBe(2);
    expect(completed.sort()).toEqual(items.map((i) => i.id).sort());
    expect(queue.items.every((i) => i.state === 'completed')).toBe(true);
    expect(queue.progress).toMatchObject({ loaded: 60, total: 60, percent: 100 });
  });

  it('retries failed items and cancels all', async () => {
    let failing = true;
    const adapter = fakeAdapter({ fail: () => (failing ? new HttpError('X', 'x', { status: 400 }) : undefined) });
    const queue = createUploadQueue({ uploader: createUploader({ adapter, chunkSize: K }), autoStart: false });
    queue.add(file(10));
    queue.start();
    await queue.onIdle();
    expect(queue.items[0]?.state).toBe('failed');
    failing = false;
    expect(queue.retryFailed()).toBe(1);
    await queue.onIdle();
    expect(queue.items[0]?.state).toBe('completed');

    const slow = fakeAdapter({ delay: 100 });
    const q2 = createUploadQueue({ uploader: createUploader({ adapter: slow, chunkSize: K }), concurrency: 1 });
    const cancelled: string[] = [];
    q2.on('cancelled', (i) => cancelled.push(i.id));
    const [a, b] = q2.add([file(10), file(10)]);
    await sleep(10);
    q2.cancelAll();
    await q2.onIdle();
    expect(q2.items.map((i) => i.state)).toEqual(['cancelled', 'cancelled']);
    expect(cancelled.sort()).toEqual([a?.id, b?.id].sort());
    expect(q2.remove(a?.id ?? '')).toBe(true);
    expect(q2.items).toHaveLength(1);
  });
});

describe('createRestUploadAdapter', () => {
  it('speaks the REST convention', async () => {
    const calls: { method: string; url: string; headers: Headers; body: unknown }[] = [];
    const fetch: FetchLike = (url, init) => {
      calls.push({ method: init.method ?? 'GET', url, headers: new Headers(init.headers), body: init.body });
      if (init.method === 'POST' && url.endsWith('/uploads')) return Promise.resolve(Response.json({ uploadId: 'a/b' }));
      if (init.method === 'PUT') return Promise.resolve(new Response('', { headers: { etag: '"p"' } }));
      return Promise.resolve(Response.json({ done: true }));
    };
    const uploader = createUploader({ endpoint: 'https://api.test/uploads', fetch, chunkSize: K, concurrency: 1, checksum: 'crc32', headers: { 'x-tenant': 't1' } });
    const r = await uploader.upload(file(K + 3)).promise;
    expect(r.response).toEqual({ done: true });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://api.test/uploads',
      'PUT https://api.test/uploads/a%2Fb/chunks/0',
      'PUT https://api.test/uploads/a%2Fb/chunks/1',
      'POST https://api.test/uploads/a%2Fb/complete',
    ]);
    expect(calls[1]?.headers.get('content-range')).toBe(`bytes 0-${String(K - 1)}/${String(K + 3)}`);
    expect(calls[2]?.headers.get('content-range')).toBe(`bytes ${String(K)}-${String(K + 2)}/${String(K + 3)}`);
    expect(calls[2]?.headers.get('x-chunk-checksum')).toMatch(/^crc32=[\da-f]{8}$/);
    expect(calls[0]?.headers.get('x-tenant')).toBe('t1');
    expect(JSON.parse(calls[3]?.body as string)).toMatchObject({ parts: [{ index: 0, etag: '"p"' }, { index: 1, etag: '"p"' }] });
  });

  it('resumes via GET and starts over on 404', async () => {
    const seen: string[] = [];
    const fetch: FetchLike = (url, init) => {
      seen.push(`${init.method ?? 'GET'} ${url}`);
      if (url.endsWith('/uploads/old')) return Promise.resolve(new Response('', { status: 404 }));
      if (url.endsWith('/uploads/keep')) return Promise.resolve(Response.json({ uploadedChunks: [0, -1, 'x'] }));
      return Promise.resolve(Response.json({ id: 'fresh' }));
    };
    const adapter = createRestUploadAdapter({ endpoint: 'https://api.test/uploads', http: { fetch } });
    const base = { name: 'f', size: 1, type: '', lastModified: undefined, chunkSize: K, totalChunks: 1, metadata: {}, signal: new AbortController().signal };
    expect(await adapter.start(new Blob(), { ...base, uploadId: 'keep' })).toEqual({ uploadId: 'keep', uploadedChunks: [0] });
    expect(await adapter.start(new Blob(), { ...base, uploadId: 'old' })).toEqual({ uploadId: 'fresh' });
    expect(seen).toEqual(['GET https://api.test/uploads/keep', 'GET https://api.test/uploads/old', 'POST https://api.test/uploads']);
  });
});
