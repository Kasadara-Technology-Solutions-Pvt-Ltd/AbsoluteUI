/** Chunked, resumable upload engine (docs/PLAN-HELPERS.md section 3). Files are sliced, never read whole. */
import { anySignal, raceSignal, retry, deferred, throwIfAborted, type Deferred } from '@absoluteui/helpers/async';
import { AbortError, HelperError, HttpError, ValidationError, isAbortError, toError } from '@absoluteui/helpers/error';
import { base64Encode, crc32, fnv1a32 } from '@absoluteui/helpers/encoding';
import { isRetryableStatus } from '@absoluteui/helpers/http';
import { isPlainObject } from '@absoluteui/helpers/is';
import type { FetchLike } from '../http/index.js';
import { createRestUploadAdapter } from './rest-adapter.js';
import type { ChunkChecksum, PersistedUpload, UploadAdapter, UploadProgress, UploadResult, UploadState, UploadStateStore, UploadedPart } from './types.js';

/** Smallest allowed chunk (256 KiB). */
export const MIN_CHUNK_SIZE = 256 * 1024;
/** Default chunk size (5 MiB). */
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

const CHECKSUM_SLICE = 1024 * 1024;
const MAX_ID_LENGTH = 512;
const SPEED_WINDOW_MS = 5_000;

export interface UploaderOptions {
  /** REST endpoint for the built-in adapter (see `createRestUploadAdapter`). */
  readonly endpoint?: string;
  /** Custom protocol; takes precedence over `endpoint`. */
  readonly adapter?: UploadAdapter;
  /** Bytes per chunk, at least 256 KiB. Default 5 MiB. */
  readonly chunkSize?: number;
  /** Chunks in flight per file. Default 3. */
  readonly concurrency?: number;
  /** Retries per chunk for network errors, timeouts and retryable statuses. Default 3. */
  readonly retries?: number;
  /** Backoff between chunk retries. Default 500 ms doubling up to 15 s, with jitter. */
  readonly backoff?: { readonly minDelayMs?: number; readonly maxDelayMs?: number };
  /** Per-chunk checksum. Default false. */
  readonly checksum?: 'crc32' | 'sha256' | false;
  /** Headers for the built-in adapter. */
  readonly headers?: HeadersInit;
  /** `fetch` for the built-in adapter. */
  readonly fetch?: FetchLike;
  /** Persists upload ids so a reload can resume. */
  readonly store?: UploadStateStore;
  readonly onProgress?: (progress: UploadProgress, upload: UploadController) => void;
  readonly onChunkComplete?: (part: UploadedPart, upload: UploadController) => void;
  readonly onStateChange?: (state: UploadState, upload: UploadController) => void;
  /** Cancels every upload of this uploader. */
  readonly signal?: AbortSignal;
  /** Clock for speed and ETA (tests). Default `Date.now`. */
  readonly now?: () => number;
}

export interface UploadOptions {
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Resume this server upload id. */
  readonly uploadId?: string;
  readonly signal?: AbortSignal;
}

/** Handle for one upload. */
export interface UploadController {
  /** Resolves on completion; rejects with the failure or `AbortError` `SVC_UPLOAD_CANCELLED`. */
  readonly promise: Promise<UploadResult>;
  readonly file: Blob & { readonly name?: string };
  readonly state: UploadState;
  readonly progress: UploadProgress;
  readonly uploadId: string | undefined;
  readonly error: Error | undefined;
  /** Stops sending (in-flight chunks are aborted and resent on resume). */
  pause(): void;
  resume(): void;
  /** Aborts, calls `adapter.abort` and forgets the resume state. */
  cancel(): void;
  /** Called on every state or progress change. Returns an unsubscribe function. */
  subscribe(listener: (upload: UploadController) => void): () => void;
}

/** Uploader returned by `createUploader`. */
export interface Uploader {
  upload(file: Blob & { readonly name?: string }, options?: UploadOptions): UploadController;
  readonly chunkSize: number;
}

/**
 * Storage key for resuming a file: hash of name, size, last-modified time and type (the file name
 * itself is not stored).
 * @example
 * const file = new File(['hello'], 'a.txt', { type: 'text/plain', lastModified: 0 });
 * resumeKey(file); // => 'aui-upload:b3d68a43-5' // FNV-1a hash, then the size in base 36
 */
export function resumeKey(file: Blob & { readonly name?: string; readonly lastModified?: number }): string {
  const name = typeof file.name === 'string' ? file.name : '';
  const modified = typeof file.lastModified === 'number' ? file.lastModified : 0;
  const hash = fnv1a32(`${name}\u0000${String(file.size)}\u0000${String(modified)}\u0000${file.type}`);
  return `aui-upload:${hash.toString(16).padStart(8, '0')}-${file.size.toString(36)}`;
}

/**
 * Checksum of a chunk: CRC-32 computed incrementally over 1 MiB slices (8 hex digits), or SHA-256
 * through Web Crypto (base64).
 * @example
 * await chunkChecksum(new Blob(['123456789']), 'crc32'); // => { algorithm: 'crc32', value: 'cbf43926' }
 */
export async function chunkChecksum(blob: Blob, algorithm: 'crc32' | 'sha256'): Promise<ChunkChecksum> {
  if (algorithm === 'sha256') {
    const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
    if (!subtle) throw new HelperError('SVC_UPLOAD_NO_CRYPTO', 'Web Crypto is not available (a secure context is required).', { kind: 'unsupported' });
    const digest = await subtle.digest('SHA-256', await blob.arrayBuffer());
    return { algorithm, value: base64Encode(new Uint8Array(digest)) };
  }
  let c = 0;
  for (let off = 0; off < blob.size; off += CHECKSUM_SLICE) c = crc32(new Uint8Array(await blob.slice(off, off + CHECKSUM_SLICE).arrayBuffer()), c);
  return { algorithm, value: c.toString(16).padStart(8, '0') };
}

/** True for errors worth retrying a chunk: network, timeout, retryable HTTP status, or unknown non-helper errors. */
function retryableChunkError(e: Error): boolean {
  if (isAbortError(e)) return false;
  if (e instanceof HttpError) return e.status === 0 || isRetryableStatus(e.status);
  if (e instanceof HelperError) return e.kind === 'timeout';
  return true;
}

function readPersisted(value: unknown, size: number, minChunk: number): PersistedUpload | undefined {
  if (!isPlainObject(value)) return undefined;
  const { uploadId, chunkSize, size: s, savedAt } = value;
  if (typeof uploadId !== 'string' || uploadId === '' || uploadId.length > MAX_ID_LENGTH) return undefined;
  if (typeof chunkSize !== 'number' || !Number.isSafeInteger(chunkSize) || chunkSize < minChunk) return undefined;
  if (s !== size) return undefined;
  return { uploadId, chunkSize, size, savedAt: typeof savedAt === 'number' ? savedAt : 0 };
}

function positiveInt(value: number, name: string, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) throw new ValidationError('SVC_UPLOAD_INVALID_OPTION', 'An uploader option is out of range.', { details: { name, min } });
}

/**
 * Creates a chunked, resumable uploader: parallel chunks with per-chunk retry and backoff,
 * pause/resume/cancel, optional CRC-32 or SHA-256 checksums, file-level progress with speed and
 * ETA, and resume through an injectable store. The server protocol is an `UploadAdapter`
 * (the built-in REST adapter is used when only `endpoint` is given).
 * @example
 * const store: UploadStateStore = {
 *   get: (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
 *   set: (key, value) => { localStorage.setItem(key, JSON.stringify(value)); },
 *   remove: (key) => { localStorage.removeItem(key); },
 * };
 * const uploader = createUploader({ endpoint: '/api/uploads', checksum: 'crc32', store });
 * declare const file: File; // chosen by the user
 * const bar = document.createElement('progress');
 * const up = uploader.upload(file, { metadata: { folder: 'invoices' } });
 * up.subscribe((u) => (bar.value = u.progress.percent));
 * const result = await up.promise;
 */
export function createUploader(options: UploaderOptions): Uploader {
  const chunkSizeOpt = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  positiveInt(chunkSizeOpt, 'chunkSize', MIN_CHUNK_SIZE);
  const concurrency = options.concurrency ?? 3;
  positiveInt(concurrency, 'concurrency', 1);
  const retries = options.retries ?? 3;
  positiveInt(retries, 'retries', 0);
  const minDelay = options.backoff?.minDelayMs ?? 500;
  const maxDelay = options.backoff?.maxDelayMs ?? 15_000;
  const algorithm = options.checksum ?? false;
  const now = options.now ?? Date.now;
  let adapter: UploadAdapter;
  if (options.adapter) adapter = options.adapter;
  else if (options.endpoint !== undefined) adapter = createRestUploadAdapter({ endpoint: options.endpoint, ...(options.headers === undefined ? {} : { headers: options.headers }), ...(options.fetch === undefined ? {} : { http: { fetch: options.fetch } }) });
  else throw new ValidationError('SVC_UPLOAD_NO_ADAPTER', 'Provide an upload adapter or an endpoint.');

  function upload(file: Blob & { readonly name?: string; readonly lastModified?: number }, uploadOptions: UploadOptions = {}): UploadController {
    const total = file.size;
    const listeners = new Set<(u: UploadController) => void>();
    const cancelCtrl = new AbortController();
    const outer = anySignal([options.signal, uploadOptions.signal, cancelCtrl.signal]);
    let state: UploadState = 'queued';
    let uploadId = uploadOptions.uploadId;
    let error: Error | undefined;
    let phase: AbortController | undefined;
    let gate: Deferred<undefined> | undefined;
    let completedBytes = 0;
    const inflight = new Map<number, number>();
    let samples: [number, number][] = [];
    let transferred = 0;
    let progress: UploadProgress = { loaded: 0, total, percent: 0, speedBps: null, etaMs: null };

    const notify = (): void => {
      for (const l of [...listeners]) l(controller);
    };
    const setState = (s: UploadState): void => {
      if (state === s) return;
      state = s;
      options.onStateChange?.(s, controller);
      notify();
    };
    const updateProgress = (): void => {
      let loaded = completedBytes;
      for (const v of inflight.values()) loaded += v;
      loaded = Math.min(loaded, total);
      const t = now();
      samples.push([t, transferred]);
      while (samples.length > 2 && (samples[0]?.[0] ?? t) < t - SPEED_WINDOW_MS) samples.shift();
      if (samples.length > 64) samples = samples.slice(-64);
      const first = samples[0];
      const dt = first ? t - first[0] : 0;
      const speedBps = first && dt >= 250 ? ((transferred - first[1]) / dt) * 1000 : null;
      const etaMs = speedBps !== null && speedBps > 0 ? Math.round(((total - loaded) / speedBps) * 1000) : null;
      const percent = total === 0 ? (state === 'completed' ? 100 : 0) : Math.min(100, (loaded / total) * 100);
      progress = { loaded, total, percent, speedBps, etaMs };
      options.onProgress?.(progress, controller);
      notify();
    };
    const setInflight = (index: number, loaded: number, size: number): void => {
      const prev = inflight.get(index) ?? 0;
      const next = Math.max(0, Math.min(loaded, size));
      if (next > prev) transferred += next - prev;
      inflight.set(index, next);
      updateProgress();
    };
    const cancelledError = (): HelperError => {
      const reason: unknown = outer.reason;
      if (reason instanceof AbortError && reason.code === 'SVC_UPLOAD_CANCELLED') return reason;
      return new AbortError('SVC_UPLOAD_CANCELLED', 'The upload was cancelled.', { cause: reason });
    };

    const run = async (): Promise<UploadResult> => {
      await Promise.resolve();
      throwIfAborted(outer);
      if (state === 'queued') setState('uploading');
      const key = resumeKey(file);
      let chunkSize = chunkSizeOpt;
      const persisted = options.store ? readPersisted(await options.store.get(key), total, MIN_CHUNK_SIZE) : undefined;
      if (persisted && (uploadId === undefined || uploadId === persisted.uploadId)) {
        uploadId = persisted.uploadId;
        chunkSize = persisted.chunkSize;
      }
      let totalChunks = Math.max(1, Math.ceil(total / chunkSize));
      const started = await raceSignal(
        adapter.start(file, { name: typeof file.name === 'string' ? file.name : undefined, size: total, type: file.type, lastModified: typeof file.lastModified === 'number' ? file.lastModified : undefined, chunkSize, totalChunks, metadata: uploadOptions.metadata ?? {}, uploadId, signal: outer }),
        outer,
      );
      if (typeof started.uploadId !== 'string' || started.uploadId === '' || started.uploadId.length > MAX_ID_LENGTH) throw new ValidationError('SVC_UPLOAD_INVALID_START', 'The upload adapter returned an invalid upload id.');
      const resuming = started.uploadId === uploadId;
      if (!resuming && chunkSize !== chunkSizeOpt) {
        chunkSize = chunkSizeOpt;
        totalChunks = Math.max(1, Math.ceil(total / chunkSize));
      }
      uploadId = started.uploadId;
      const id = uploadId;
      await options.store?.set(key, { uploadId: id, chunkSize, size: total, savedAt: now() });
      const sizeOf = (i: number): number => Math.max(0, Math.min(chunkSize, total - i * chunkSize));
      const parts = new Map<number, UploadedPart>();
      if (resuming && started.uploadedChunks) {
        for (const i of started.uploadedChunks) {
          if (!Number.isSafeInteger(i) || i < 0 || i >= totalChunks || parts.has(i)) continue;
          parts.set(i, { index: i, offset: i * chunkSize, size: sizeOf(i), resumed: true });
          completedBytes += sizeOf(i);
        }
      }
      updateProgress();
      const remaining = new Set<number>();
      for (let i = 0; i < totalChunks; i++) if (!parts.has(i)) remaining.add(i);

      const sendChunk = async (index: number, signal: AbortSignal): Promise<void> => {
        const offset = index * chunkSize;
        const size = sizeOf(index);
        const blob = file.slice(offset, offset + size);
        const checksum = algorithm === false ? undefined : await chunkChecksum(blob, algorithm);
        throwIfAborted(signal);
        try {
          const res = await retry(
            (_attempt, s) => {
              setInflight(index, 0, size);
              return adapter.uploadChunk({ uploadId: id, index, blob, offset, size, total, checksum, signal: s, onProgress: (loaded) => { if (!s.aborted) setInflight(index, loaded, size); } });
            },
            { retries, minDelay, maxDelay, signal, retryIf: retryableChunkError },
          );
          // A chunk that finished while pausing is kept rather than re-sent.
          const prev = inflight.get(index) ?? 0;
          transferred += size - prev;
          inflight.delete(index);
          completedBytes += size;
          const part: UploadedPart = { index, offset, size, resumed: false, ...(checksum ? { checksum } : {}), ...(typeof res?.etag === 'string' ? { etag: res.etag } : {}) };
          parts.set(index, part);
          remaining.delete(index);
          updateProgress();
          options.onChunkComplete?.(part, controller);
        } finally {
          if (inflight.delete(index)) updateProgress();
        }
      };

      while (remaining.size > 0) {
        if (gate) await raceSignal(gate.promise, outer);
        throwIfAborted(outer);
        const ctrl = new AbortController();
        phase = ctrl;
        const signal = anySignal([outer, ctrl.signal]);
        const queue = [...remaining].sort((a, b) => a - b);
        let failure: Error | undefined;
        const worker = async (): Promise<void> => {
          for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
            try {
              await sendChunk(i, signal);
            } catch (e) {
              if (!signal.aborted) {
                failure ??= toError(e);
                ctrl.abort(failure);
              }
              return;
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
        phase = undefined;
        throwIfAborted(outer);
        if (failure) throw failure;
      }
      if (gate) await raceSignal(gate.promise, outer);
      const response = await raceSignal(adapter.complete({ uploadId: id, parts: [...parts.values()].sort((a, b) => a.index - b.index), signal: outer }), outer);
      await options.store?.remove(key);
      completedBytes = total;
      state = 'completed';
      updateProgress();
      options.onStateChange?.('completed', controller);
      return { uploadId: id, size: total, parts: [...parts.values()].sort((a, b) => a.index - b.index), response };
    };

    const promise = run().catch(async (e: unknown) => {
      if (outer.aborted) {
        const err = cancelledError();
        error = err;
        setState('cancelled');
        const id = uploadId;
        if (id !== undefined) await adapter.abort?.(id).catch(() => undefined);
        await Promise.resolve(options.store?.remove(resumeKey(file))).catch(() => undefined);
        throw err;
      }
      error = toError(e);
      setState('failed');
      throw error;
    });
    // The rejection is also exposed through `state` and `error`; avoid unhandled-rejection noise when unobserved.
    promise.catch(() => undefined);

    const controller: UploadController = {
      promise,
      file,
      get state() {
        return state;
      },
      get progress() {
        return progress;
      },
      get uploadId() {
        return uploadId;
      },
      get error() {
        return error;
      },
      pause() {
        if (state !== 'uploading' && state !== 'queued') return;
        gate = deferred<undefined>();
        setState('paused');
        samples = [];
        phase?.abort(new AbortError('SVC_UPLOAD_PAUSED', 'The upload was paused.'));
      },
      resume() {
        if (state !== 'paused') return;
        const g = gate;
        gate = undefined;
        samples = [];
        setState('uploading');
        g?.resolve(undefined);
      },
      cancel() {
        if (state === 'completed' || state === 'failed' || state === 'cancelled') return;
        cancelCtrl.abort(new AbortError('SVC_UPLOAD_CANCELLED', 'The upload was cancelled.'));
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    return controller;
  }

  return { upload, chunkSize: chunkSizeOpt };
}
