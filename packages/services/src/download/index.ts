/**
 * Downloads: save Blob, text, JSON, CSV, data URLs and remote URLs; streaming with progress and
 * abort; save picker with anchor fallback; automatic object-URL revocation; file-name
 * sanitization; a queue for multiple files (docs/PLAN-HELPERS.md section 3, section 5, section 6).
 * Functions return status objects for the UI to announce; nothing moves focus.
 */
import { AbortError, HttpError, ValidationError, toError } from '@absoluteui/helpers/error';
import { parseDataUrl } from '@absoluteui/helpers/encoding';
import { safeFileName } from '@absoluteui/helpers/sanitize';
import { parseContentDisposition, parseContentType, safeUrlForLog } from '@absoluteui/helpers/http';
import { stringifyCsv, type CsvColumn } from '@absoluteui/helpers/csv';
import { safeJsonStringify } from '@absoluteui/helpers/json';
import { getFileNameFromUrl, isSafeUrl } from '@absoluteui/helpers/url';

/** How the file was saved. */
export type DownloadMethod = 'anchor' | 'picker' | 'none';

/** Why a download did not complete. */
export type DownloadFailureReason = 'cancelled' | 'aborted' | 'unsupported' | 'error';

/** Outcome of a download, for announcements (`describeDownloadStatus`). */
export interface DownloadStatus {
  readonly ok: boolean;
  readonly method: DownloadMethod;
  /** Sanitized file name that was (or would have been) used. */
  readonly fileName: string;
  /** True when the user dismissed the save picker. */
  readonly cancelled?: boolean;
  readonly reason?: DownloadFailureReason;
  readonly error?: Error;
  /** Bytes saved, when known. */
  readonly bytes?: number;
}

// ---------------------------------------------------------------------------
// Object URLs

const live = new Set<string>();

/** An object URL with an idempotent `revoke`. */
export interface ObjectUrlHandle {
  readonly url: string;
  revoke(): void;
}

/**
 * Creates a tracked object URL; `revokeAll()` releases every URL still alive.
 * @example
 * const blob = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' });
 * const { url, revoke } = createObjectUrl(blob);
 * const img = document.createElement('img');
 * img.onload = revoke;
 * img.src = url;
 */
export function createObjectUrl(blob: Blob): ObjectUrlHandle {
  const url = URL.createObjectURL(blob);
  live.add(url);
  return {
    url,
    revoke() {
      if (live.delete(url)) URL.revokeObjectURL(url);
    },
  };
}

/**
 * Revokes every object URL created by `createObjectUrl` that is still alive (for example on route change).
 * @example
 * window.addEventListener('pagehide', revokeAll);
 */
export function revokeAll(): void {
  for (const url of live) URL.revokeObjectURL(url);
  live.clear();
}

// ---------------------------------------------------------------------------
// Names

// Bidirectional controls and marks: 'invoice\u202Efdp.exe' displays as 'invoiceexe.pdf'.
const BIDI = new Set([0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);

export interface SanitizeDownloadNameOptions {
  /** Maximum length in UTF-8 bytes; the extension is kept. Default 200. */
  readonly maxLength?: number;
  /** Used when nothing usable remains. Default `download`. */
  readonly fallback?: string;
}

/**
 * Makes a name safe to save: strips bidirectional overrides (extension spoofing), path
 * separators, control characters and reserved device names, and limits the length while
 * preserving the extension.
 * @example
 * sanitizeDownloadName('invoice\u202Efdp.exe'); // => 'invoicefdp.exe'
 * sanitizeDownloadName('../../report.csv'); // => 'report.csv'
 */
export function sanitizeDownloadName(name: string, options: SanitizeDownloadNameOptions = {}): string {
  const { maxLength = 200, fallback = 'download' } = options;
  let s = '';
  for (const ch of name) if (!BIDI.has(ch.codePointAt(0) ?? 0)) s += ch;
  const base = s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1);
  return safeFileName(base, { maxLength, fallback });
}

// ---------------------------------------------------------------------------
// Anchor downloads

export interface DownloadBlobOptions {
  readonly signal?: AbortSignal;
  /** Delay before the object URL is revoked. Default 0 (next task, after the click has started the download). */
  readonly revokeDelayMs?: number;
}

const make = (ok: boolean, method: DownloadMethod, fileName: string, extra: Omit<DownloadStatus, 'ok' | 'method' | 'fileName'> = {}): DownloadStatus => ({ ok, method, fileName, ...extra });

/**
 * Saves a Blob through a detached `<a download>` click. The object URL is revoked right after
 * the click; the anchor is never attached to the document and focus does not move.
 * @example
 * declare const blob: Blob; // for example from a report endpoint
 * const status = downloadBlob(blob, 'report.pdf');
 * console.info(describeDownloadStatus(status)); // e.g. 'Download started: report.pdf'
 */
export function downloadBlob(blob: Blob, fileName: string, options: DownloadBlobOptions = {}): DownloadStatus {
  const name = sanitizeDownloadName(fileName);
  if (isAborted(options.signal)) return make(false, 'none', name, { reason: 'aborted' });
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return make(false, 'none', name, { reason: 'unsupported' });
  const a = document.createElement('a');
  if (!('download' in a)) return make(false, 'none', name, { reason: 'unsupported' });
  const handle = createObjectUrl(blob);
  try {
    a.href = handle.url;
    a.download = name;
    a.rel = 'noopener';
    a.click();
  } catch (e) {
    handle.revoke();
    return make(false, 'anchor', name, { reason: 'error', error: toError(e) });
  }
  setTimeout(() => { handle.revoke(); }, Math.max(0, options.revokeDelayMs ?? 0));
  return make(true, 'anchor', name, { bytes: blob.size });
}

export interface DownloadTextOptions extends DownloadBlobOptions {
  /** Default `text/plain;charset=utf-8`. */
  readonly type?: string;
  /** Prepend a UTF-8 byte-order mark. Default false. */
  readonly bom?: boolean;
}

/**
 * Saves text as a file.
 * @example
 * downloadText('2026-09-30 09:00 Sync started', 'log.txt');
 */
export function downloadText(text: string, fileName: string, options: DownloadTextOptions = {}): DownloadStatus {
  const { type = 'text/plain;charset=utf-8', bom = false, ...rest } = options;
  return downloadBlob(new Blob([bom ? '\uFEFF' : '', text], { type }), fileName, rest);
}

export interface DownloadJsonOptions extends DownloadBlobOptions {
  /** Indent with 2 spaces. Default false. */
  readonly pretty?: boolean;
}

/**
 * Saves a value as JSON using `safeJsonStringify` (cycles, BigInt, Map and Set are handled).
 * Throws `SVC_DOWNLOAD_NOT_SERIALIZABLE` for values JSON cannot represent.
 * @example
 * downloadJson({ theme: 'dark', density: 'compact' }, 'settings.json', { pretty: true });
 */
export function downloadJson(value: unknown, fileName: string, options: DownloadJsonOptions = {}): DownloadStatus {
  const { pretty = false, ...rest } = options;
  const json = safeJsonStringify(value, pretty ? { indent: 2 } : {});
  if (json === undefined) throw new ValidationError('SVC_DOWNLOAD_NOT_SERIALIZABLE', 'The value cannot be written as JSON.');
  return downloadBlob(new Blob([json], { type: 'application/json' }), fileName, rest);
}

export interface DownloadCsvOptions<T> extends DownloadBlobOptions {
  readonly columns?: readonly (string | CsvColumn<T>)[];
  /** UTF-8 BOM so Excel detects the encoding. Default true. */
  readonly bom?: boolean;
  /** Default `,`. */
  readonly delimiter?: string;
  /** Default `\r\n`. */
  readonly eol?: '\r\n' | '\n';
  readonly header?: boolean;
}

/**
 * Saves rows as CSV. Formula-like cells are always neutralized (CSV injection protection).
 * @example
 * const employees = [{ name: 'Ada Lovelace', email: 'ada@example.com' }];
 * downloadCsv(employees, 'employees.csv', { columns: [{ key: 'name', header: 'Name' }, 'email'] });
 */
export function downloadCsv<T extends object>(rows: readonly T[] | readonly (readonly unknown[])[], fileName: string, options: DownloadCsvOptions<T> = {}): DownloadStatus {
  const { columns, bom = true, delimiter, eol, header, ...rest } = options;
  const csv = stringifyCsv<T>(rows, {
    injectionProtection: true,
    bom,
    ...(columns === undefined ? {} : { columns }),
    ...(delimiter === undefined ? {} : { delimiter }),
    ...(eol === undefined ? {} : { eol }),
    ...(header === undefined ? {} : { header }),
  });
  return downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName, rest);
}

export interface DownloadDataUrlOptions extends DownloadBlobOptions {
  /** Maximum decoded size. Default 10 MiB. */
  readonly maxBytes?: number;
}

/**
 * Saves a `data:` URL (decoded to a Blob first; top-level `data:` navigation is blocked by browsers).
 * @example
 * const canvas = document.createElement('canvas');
 * downloadDataUrl(canvas.toDataURL('image/png'), 'chart.png');
 */
export function downloadDataUrl(dataUrl: string, fileName: string, options: DownloadDataUrlOptions = {}): DownloadStatus {
  const { maxBytes, ...rest } = options;
  const parsed = parseDataUrl(dataUrl, maxBytes === undefined ? {} : { maxBytes });
  if (!parsed) throw new ValidationError('SVC_DOWNLOAD_INVALID_DATA_URL', 'The data URL is not valid.');
  return downloadBlob(new Blob([parsed.bytes], { type: parsed.mimeType }), fileName, rest);
}

// ---------------------------------------------------------------------------
// Remote URLs

/** Download progress. `total` and `percent` are undefined without `Content-Length`. */
export interface DownloadProgress {
  readonly loaded: number;
  readonly total: number | undefined;
  readonly percent: number | undefined;
}

export interface DownloadUrlOptions extends DownloadBlobOptions {
  /** Overrides the name from `Content-Disposition` or the URL. */
  readonly fileName?: string;
  readonly onProgress?: (progress: DownloadProgress) => void;
  /** Extra `fetch` options. `signal` comes from `options.signal`. */
  readonly fetchInit?: Omit<RequestInit, 'signal'>;
  /** Allow other origins (the URL must still be http or https). Default false. */
  readonly allowCrossOrigin?: boolean;
  /** Maximum response size held in memory. Default 1 GiB. For larger files stream with `saveWithPicker`. */
  readonly maxBytes?: number;
  /** Injected `fetch` (tests, instrumented clients). Default `globalThis.fetch`. */
  readonly fetch?: typeof fetch;
}

function resolveUrl(url: string): URL {
  const base = typeof location === 'undefined' ? undefined : location.href;
  try {
    return new URL(url, base);
  } catch {
    throw new ValidationError('SVC_DOWNLOAD_INVALID_URL', 'The download URL is not valid.');
  }
}

/**
 * Fetches a URL with progress and abort, then saves it. Same-origin only unless
 * `allowCrossOrigin`; only http(s). The file name comes from `fileName`, then a sanitized
 * `Content-Disposition` name, then the URL, then `download`. Invalid or disallowed URLs throw;
 * network, HTTP and abort outcomes resolve to a failed status carrying `error`.
 * @example
 * const bar = document.createElement('progress');
 * bar.max = 100;
 * const controller = new AbortController();
 * const status = await downloadUrl('/api/reports/42/pdf', { onProgress: (p) => { bar.value = p.percent ?? 0; }, signal: controller.signal });
 */
export async function downloadUrl(url: string, options: DownloadUrlOptions = {}): Promise<DownloadStatus> {
  const { fileName, onProgress, fetchInit, allowCrossOrigin = false, maxBytes = 1024 * 1024 * 1024, signal } = options;
  if (!isSafeUrl(url, { allowedSchemes: ['http', 'https'] })) throw new ValidationError('SVC_DOWNLOAD_UNSAFE_URL', 'Only http and https URLs can be downloaded.');
  const target = resolveUrl(url);
  if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new ValidationError('SVC_DOWNLOAD_UNSAFE_URL', 'Only http and https URLs can be downloaded.');
  const origin = typeof location === 'undefined' ? undefined : location.origin;
  if (!allowCrossOrigin && target.origin !== origin) throw new ValidationError('SVC_DOWNLOAD_CROSS_ORIGIN', 'Cross-origin downloads need allowCrossOrigin.');
  const doFetch = options.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
  const fallbackName = sanitizeDownloadName(fileName ?? getFileNameFromUrl(target.href) ?? 'download');
  if (!doFetch) return make(false, 'none', fallbackName, { reason: 'unsupported' });
  const aborted = (): DownloadStatus => make(false, 'none', fallbackName, { reason: 'aborted', error: new AbortError('SVC_DOWNLOAD_ABORTED', 'The download was aborted.', { cause: signal?.reason }) });
  if (isAborted(signal)) return aborted();
  let response: Response;
  try {
    response = await doFetch(target.href, { credentials: 'same-origin', ...fetchInit, ...(signal ? { signal } : {}) });
  } catch (e) {
    if (isAborted(signal)) return aborted();
    return make(false, 'none', fallbackName, { reason: 'error', error: toError(e) });
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const error = new HttpError('SVC_DOWNLOAD_HTTP', 'The server could not provide the file.', { status: response.status, statusText: response.statusText, url: safeUrlForLog(target.href) });
    return make(false, 'none', fallbackName, { reason: 'error', error });
  }
  const header = parseContentLength(response.headers.get('content-length'));
  if (header !== undefined && header > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return make(false, 'none', fallbackName, { reason: 'error', error: new ValidationError('SVC_DOWNLOAD_TOO_LARGE', 'The file is too large to download in memory.') });
  }
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  try {
    if (response.body) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const r = await reader.read();
          if (r.done) break;
          loaded += r.value.length;
          if (loaded > maxBytes) {
            await reader.cancel();
            return make(false, 'none', fallbackName, { reason: 'error', error: new ValidationError('SVC_DOWNLOAD_TOO_LARGE', 'The file is too large to download in memory.') });
          }
          parts.push(r.value);
          onProgress?.({ loaded, total: header, percent: header ? Math.min(100, (loaded / header) * 100) : undefined });
        }
      } finally {
        reader.releaseLock();
      }
    }
  } catch (e) {
    if (isAborted(signal)) return aborted();
    return make(false, 'none', fallbackName, { reason: 'error', error: toError(e) });
  }
  const disposition = parseContentDispositionSafe(response.headers.get('content-disposition'));
  const responseName = getFileNameFromUrl(response.url === '' ? target.href : response.url);
  const name = sanitizeDownloadName(fileName ?? disposition ?? responseName ?? 'download');
  const type = parseContentType(response.headers.get('content-type'))?.mediaType ?? 'application/octet-stream';
  return downloadBlob(new Blob(parts, { type }), name, options);
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null || !/^\d{1,16}$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

function parseContentDispositionSafe(value: string | null): string | undefined {
  try {
    return parseContentDisposition(value)?.safeFilename;
  } catch {
    return undefined; // over-long or malformed header: fall back to the URL name
  }
}

// ---------------------------------------------------------------------------
// Save picker (File System Access API)

/** `showSaveFilePicker` accept types, as in the File System Access API. */
export interface SavePickerType {
  readonly description?: string;
  readonly accept: Readonly<Record<string, readonly string[]>>;
}

interface WritableLike extends WritableStream<Uint8Array<ArrayBuffer>> {
  abort(reason?: unknown): Promise<void>;
}
interface SaveHandleLike {
  createWritable(): Promise<WritableLike>;
}
type ShowSaveFilePicker = (options: { suggestedName?: string; types?: SavePickerType[] }) => Promise<SaveHandleLike>;

/** Data to save: a Blob, a stream, or a function producing one (called after the picker closes). */
export type SaveSource = Blob | ReadableStream<Uint8Array<ArrayBuffer>> | (() => Promise<Blob | ReadableStream<Uint8Array<ArrayBuffer>>>);

export interface SaveWithPickerOptions {
  readonly suggestedName: string;
  /** Default: derived from the Blob type and the name's extension. */
  readonly types?: readonly SavePickerType[];
  readonly signal?: AbortSignal;
  /** Fall back to an anchor download when the picker is unavailable or blocked. Default true. */
  readonly fallback?: boolean;
}

function derivedTypes(name: string, type: string): SavePickerType[] | undefined {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
  const mime = type.split(';')[0]?.trim().toLowerCase() ?? '';
  if (ext.length < 2 || ext.length > 16 || !/^\.[\da-z]+$/.test(ext) || !/^[a-z]+\/[\w.+-]+$/.test(mime) || mime.length > 100) return undefined;
  return [{ accept: { [mime]: [ext] } }];
}

async function toBlob(source: Blob | ReadableStream<Uint8Array<ArrayBuffer>>): Promise<Blob> {
  return source instanceof Blob ? source : new Response(source).blob();
}

/**
 * Saves through `showSaveFilePicker`, streaming into the file (no full copy in memory), with an
 * anchor fallback. Dismissing the picker resolves to `{ ok: false, cancelled: true }`. Call from
 * a user gesture; pass a function as `source` to start fetching only after the user chose a file.
 * @example
 * const status = await saveWithPicker(async () => (await fetch('/export')).body!, { suggestedName: 'export.csv' });
 */
export async function saveWithPicker(source: SaveSource, options: SaveWithPickerOptions): Promise<DownloadStatus> {
  const { signal, fallback = true } = options;
  const name = sanitizeDownloadName(options.suggestedName);
  if (isAborted(signal)) return make(false, 'none', name, { reason: 'aborted' });
  const picker = typeof window === 'undefined' ? undefined : (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  const resolveSource = async (): Promise<Blob | ReadableStream<Uint8Array<ArrayBuffer>>> => (typeof source === 'function' ? source() : source);
  const anchor = async (): Promise<DownloadStatus> => {
    if (!fallback) return make(false, 'none', name, { reason: 'unsupported' });
    try {
      return downloadBlob(await toBlob(await resolveSource()), name, signal ? { signal } : {});
    } catch (e) {
      return make(false, 'anchor', name, { reason: isAborted(signal) ? 'aborted' : 'error', error: toError(e) });
    }
  };
  if (typeof picker !== 'function') return anchor();
  let handle: SaveHandleLike;
  try {
    const types = options.types ?? (source instanceof Blob ? derivedTypes(name, source.type) : undefined);
    handle = await picker.call(window, { suggestedName: name, ...(types ? { types: [...types] } : {}) });
  } catch (e) {
    if (isNamed(e, 'AbortError')) return make(false, 'picker', name, { cancelled: true, reason: 'cancelled' });
    // SecurityError (no user activation, cross-origin iframe) or TypeError (bad types): use the anchor.
    return anchor();
  }
  let writable: WritableLike | undefined;
  try {
    writable = await handle.createWritable();
    const data = await resolveSource();
    const stream = data instanceof Blob ? data.stream() : data;
    let bytes = 0;
    const counter = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
      transform(chunk, controller) {
        bytes += chunk.length;
        controller.enqueue(chunk);
      },
    });
    await stream.pipeThrough(counter).pipeTo(writable, signal ? { signal } : {});
    return make(true, 'picker', name, { bytes });
  } catch (e) {
    await writable?.abort(e).catch(() => undefined);
    if (isAborted(signal)) return make(false, 'picker', name, { reason: 'aborted', error: new AbortError('SVC_DOWNLOAD_ABORTED', 'The download was aborted.', { cause: signal?.reason }) });
    return make(false, 'picker', name, { reason: 'error', error: toError(e) });
  }
}

const isNamed = (e: unknown, name: string): boolean => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === name;

// ---------------------------------------------------------------------------
// Queue

export interface DownloadQueueOptions {
  /** Downloads running at once. Default 1. */
  readonly concurrency?: number;
  /**
   * Pause between starting downloads. Default 400 ms: browsers block or prompt for rapid
   * multiple downloads ("This site is trying to download multiple files").
   */
  readonly delayMs?: number;
}

/** A download task: any function returning a status (for example `() => downloadUrl(url)`). */
export type DownloadTask = () => DownloadStatus | Promise<DownloadStatus>;

export interface DownloadQueue {
  /** Queues a task; resolves with its status (rejections become failed statuses). */
  add(task: DownloadTask, fileName?: string): Promise<DownloadStatus>;
  /** Resolves when the queue is empty and nothing is running. */
  onIdle(): Promise<void>;
  /** Drops tasks that have not started; they resolve as aborted. */
  clear(): void;
  readonly pending: number;
  readonly running: number;
}

/**
 * Runs downloads with limited concurrency and a delay between starts.
 * @example
 * const queue = createDownloadQueue();
 * const files = [{ url: '/api/payslips/2026-08.pdf' }, { url: '/api/payslips/2026-09.pdf' }];
 * for (const f of files) void queue.add(() => downloadUrl(f.url));
 * await queue.onIdle();
 */
export function createDownloadQueue(options: DownloadQueueOptions = {}): DownloadQueue {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
  const delayMs = Math.max(0, options.delayMs ?? 400);
  interface Job {
    readonly task: DownloadTask;
    readonly name: string;
    readonly resolve: (s: DownloadStatus) => void;
  }
  const queue: Job[] = [];
  let running = 0;
  let lastStart = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: (() => void)[] = [];

  const settleIdle = (): void => {
    if (running === 0 && queue.length === 0) {
      const waiting = idle;
      idle = [];
      for (const w of waiting) w();
    }
  };
  const pump = (): void => {
    if (timer !== undefined) return;
    while (running < concurrency && queue.length > 0) {
      const wait = lastStart + delayMs - Date.now();
      if (wait > 0) {
        timer = setTimeout(() => {
          timer = undefined;
          pump();
        }, wait);
        return;
      }
      const job = queue.shift();
      if (!job) break;
      running++;
      lastStart = Date.now();
      void (async () => {
        let result: DownloadStatus;
        try {
          result = await job.task();
        } catch (e) {
          result = make(false, 'none', job.name, { reason: 'error', error: toError(e) });
        }
        running--;
        job.resolve(result);
        pump();
        settleIdle();
      })();
    }
  };
  return {
    add(task, fileName = 'download') {
      return new Promise<DownloadStatus>((resolve) => {
        queue.push({ task, name: fileName, resolve });
        pump();
      });
    },
    onIdle() {
      return new Promise<void>((resolve) => {
        idle.push(resolve);
        settleIdle();
      });
    },
    clear() {
      for (const job of queue.splice(0)) job.resolve(make(false, 'none', job.name, { reason: 'aborted' }));
      settleIdle();
    },
    get pending() {
      return queue.length;
    },
    get running() {
      return running;
    },
  };
}

// ---------------------------------------------------------------------------
// Announcements

/** Live-region messages; `{fileName}` is replaced. Override for localization. */
export interface DownloadStatusLabels {
  readonly started: string;
  readonly saved: string;
  readonly cancelled: string;
  readonly aborted: string;
  readonly unsupported: string;
  readonly failed: string;
}

export const DEFAULT_DOWNLOAD_LABELS: DownloadStatusLabels = Object.freeze({
  started: 'Download started: {fileName}',
  saved: 'Saved: {fileName}',
  cancelled: 'Download cancelled.',
  aborted: 'Download stopped: {fileName}',
  unsupported: 'Downloads are not supported in this browser.',
  failed: 'Download failed: {fileName}. Try again.',
});

/**
 * Text for a live region describing a download status.
 * @example
 * describeDownloadStatus({ ok: true, method: 'anchor', fileName: 'report.csv' }); // => 'Download started: report.csv'
 * describeDownloadStatus({ ok: true, method: 'picker', fileName: 'report.csv' }); // => 'Saved: report.csv'
 * describeDownloadStatus({ ok: false, method: 'picker', fileName: 'report.csv', cancelled: true }); // => 'Download cancelled.'
 */
export function describeDownloadStatus(value: DownloadStatus, options: { readonly labels?: Partial<DownloadStatusLabels> } = {}): string {
  const labels = { ...DEFAULT_DOWNLOAD_LABELS, ...options.labels };
  let text: string;
  if (value.ok) text = value.method === 'picker' ? labels.saved : labels.started;
  else if (value.cancelled === true || value.reason === 'cancelled') text = labels.cancelled;
  else if (value.reason === 'aborted') text = labels.aborted;
  else if (value.reason === 'unsupported') text = labels.unsupported;
  else text = labels.failed;
  return text.replaceAll('{fileName}', value.fileName);
}

// A function (not an inline check) so TypeScript does not keep a stale narrowing across awaits.
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}
