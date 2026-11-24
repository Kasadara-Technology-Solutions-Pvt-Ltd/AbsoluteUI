/**
 * Upload Queue (SPEC section 18.16): a list of files with per-item progress (Progress
 * Bar), status, cancel/retry/remove actions, and live announcements. Uploading is
 * transport-agnostic: the consumer supplies `upload(file, { signal, onProgress })`.
 * The queue schedules calls with a concurrency limit, cancels through
 * AbortController, and retries with exponential backoff; it never performs a
 * network request itself. Optional image previews use object URLs, revoked when
 * the item is removed or the queue is destroyed.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getMessage, registerMessages, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce } from '@absoluteui/utilities';
import { formatFileSize } from '../internal/files.js';
import { setText } from '../internal/field.js';
import { ProgressBar, type ProgressBarOptions } from '../progress-bar/progress-bar.js';

export interface UploadQueueConfig {
  /** Uploads running at the same time. */
  concurrency: number;
  /** Automatic retries after a failed attempt (0 = none). */
  retries: number;
  /** Delay before the first automatic retry, in ms; doubles for each further retry. */
  retryDelay: number;
  /** Start uploading as soon as files are added. When false, call `start()`. */
  autoStart: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    uploadQueue: UploadQueueConfig & { locale: string };
  }
}

export const uploadQueueConfig = defineComponentConfig<UploadQueueConfig, 'locale'>(
  'uploadQueue',
  {
    concurrency: { default: 2, expected: 'integer 1..16', validate: validators.integerInRange(1, 16) },
    retries: { default: 0, expected: 'integer 0..10', validate: validators.integerInRange(0, 10) },
    retryDelay: { default: 1000, expected: 'integer 0..60000 (ms)', validate: validators.integerInRange(0, 60_000) },
    autoStart: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale'],
);

registerMessages('uploadQueue', 'en', {
  empty: 'No files in the queue.',
  summary: '{done} of {total} uploaded',
  queued: 'Waiting',
  uploading: 'Uploading',
  done: 'Uploaded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  itemDescription: '{size} | {status}',
  itemDescriptionError: '{size} | {status}: {error}',
  uploadFailed: 'The upload did not complete.',
  cancel: 'Cancel upload of {name}',
  retry: 'Retry upload of {name}',
  remove: 'Remove {name}',
  announceFailed: '{name} failed to upload.',
  announceCancelled: 'Upload of {name} cancelled.',
  announceRemoved: '{name} removed.',
  announceComplete: 'Uploads finished: {done} uploaded, {failed} failed, {cancelled} cancelled.',
  announceAllDone: 'All {done} files uploaded.',
  announceOneDone: '{name} uploaded.',
});

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';

/** Passed to the consumer's upload function for each attempt. */
export interface UploadContext {
  /** Aborted when the user cancels or removes the item, or the queue is destroyed. Pass it to fetch/XHR. */
  readonly signal: AbortSignal;
  /** Report progress in bytes. `total` defaults to `file.size`. Call it after each chunk for chunked uploads. */
  readonly onProgress: (loaded: number, total?: number) => void;
  /** 1 for the first attempt; increases with automatic and manual retries. */
  readonly attempt: number;
  /** Queue item id (stable across retries; useful as an upload session key). */
  readonly id: string;
}

/** Resolve on success (the value becomes `item.response`), reject on failure. */
export type UploadFunction = (file: File, context: UploadContext) => Promise<unknown>;

export interface UploadItem {
  readonly id: string;
  readonly file: File;
  readonly status: UploadStatus;
  /** Bytes reported so far for the current attempt. */
  readonly loaded: number;
  readonly total: number;
  readonly attempts: number;
  /** Localized, user-facing error for failed items; `null` otherwise. */
  readonly error: string | null;
  /** Resolved value of the last successful attempt. */
  readonly response: unknown;
}

export interface UploadQueueIcons {
  file: IconRef;
  cancel: IconRef;
  retry: IconRef;
  remove: IconRef;
}

export interface UploadQueueOptions extends Partial<UploadQueueConfig> {
  /** Visible label and accessible name of the list. */
  label: string;
  /** Transport: performs one upload attempt. Honour `signal` so cancellation stops the transfer. */
  upload: UploadFunction;
  /** Show image previews (object URLs) for `image/*` files. Needs `img-src blob:` in the CSP. Default false. */
  preview?: boolean;
  /** Map a rejection to a user-facing message. Default: a generic localized message (raw errors are never shown). */
  errorMessage?: (error: unknown, file: File) => string | null;
  locale?: string;
  icons?: Partial<UploadQueueIcons>;
}

export type UploadQueueChangeReason = 'added' | 'started' | 'succeeded' | 'failed' | 'cancelled' | 'retried' | 'removed';

export interface UploadQueueChangeDetail {
  items: readonly UploadItem[];
  reason: UploadQueueChangeReason;
  /** The affected item; `null` when several were added or removed at once. */
  item: UploadItem | null;
}

export interface UploadQueueCompleteDetail {
  succeeded: number;
  failed: number;
  cancelled: number;
}

const DEFAULT_ICONS: UploadQueueIcons = { file: 'file', cancel: 'close', retry: 'refresh', remove: 'close' };

interface Entry {
  readonly id: string;
  readonly file: File;
  status: UploadStatus;
  loaded: number;
  total: number;
  attempts: number;
  error: string | null;
  response: unknown;
  /** Set while an attempt runs; replaced or cleared when the attempt becomes stale. */
  controller: AbortController | null;
  previewUrl: string | null;
  row: EntryRow | null;
}

interface EntryRow {
  readonly item: HTMLLIElement;
  readonly bar: ProgressBar;
  readonly cancel: HTMLButtonElement;
  readonly retry: HTMLButtonElement;
  readonly remove: HTMLButtonElement;
}

function fail(property: string, expected: string): never {
  throw configurationError('UPLOAD_QUEUE_OPTIONS', 'Invalid upload queue options.', { component: 'uploadQueue', property: `uploadQueue.${property}`, expected });
}

/** Resolve after `ms`, or reject when the signal aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

export class UploadQueue {
  readonly host: HTMLElement;
  /** The list element (`<ul>`). */
  readonly list: HTMLUListElement;
  #options: UploadQueueOptions;
  #entries: Entry[] = [];
  #active = 0;
  /** Settled since the queue was last idle, so completion is announced once per batch. */
  #batchActivity = false;
  #frame = 0;
  readonly #dirty = new Set<Entry>();
  readonly #doc: Document;
  readonly #label: HTMLDivElement;
  readonly #summary: HTMLDivElement;
  readonly #group = new DisposableGroup();

  /** Render an upload queue into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: UploadQueueOptions): UploadQueue {
    return new UploadQueue(host, options);
  }

  private constructor(host: HTMLElement, options: UploadQueueOptions) {
    UploadQueue.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;
    // Resolve config before touching the host: invalid config throws with nothing rendered.
    this.#config();

    this.#label = doc.createElement('div');
    this.#label.className = 'aui-upload-queue__label';
    this.#label.id = createId('aui-upload-queue-label');
    this.#summary = doc.createElement('div');
    this.#summary.className = 'aui-upload-queue__summary';
    this.list = doc.createElement('ul');
    this.list.className = 'aui-upload-queue__list';
    this.list.setAttribute('aria-labelledby', this.#label.id);
    // Fallback focus target when the last item with focus is removed.
    this.list.tabIndex = -1;

    host.classList.add('aui-upload-queue');
    host.replaceChildren(this.#label, this.#summary, this.list);
    this.#render();
    this.#group.add(uploadQueueConfig.subscribe(() => {
      this.#render();
      this.#pump();
    }));
  }

  /** Snapshots of all items, in queue order. */
  get items(): readonly UploadItem[] {
    return this.#entries.map((e) => this.#snapshot(e));
  }

  /** Whether any item is queued or uploading. */
  get busy(): boolean {
    return this.#entries.some((e) => e.status === 'queued' || e.status === 'uploading');
  }

  get options(): Readonly<UploadQueueOptions> {
    return this.#options;
  }

  getItem(id: string): UploadItem | null {
    const e = this.#find(id);
    return e ? this.#snapshot(e) : null;
  }

  /** Add files (for example from File Upload's `aui-change` `added`). Returns the new item ids. */
  add(files: Iterable<File>): string[] {
    if (this.#group.disposed) return [];
    const list = Array.from(files);
    if (list.some((f) => !(f instanceof File))) fail('add', 'iterable of File objects');
    const added = list.map((file): Entry => ({
      id: createId('aui-upload'),
      file,
      status: 'queued',
      loaded: 0,
      total: file.size,
      attempts: 0,
      error: null,
      response: undefined,
      controller: null,
      previewUrl: this.#options.preview && file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      row: null,
    }));
    if (added.length === 0) return [];
    this.#entries.push(...added);
    this.#render();
    const first = added[0];
    this.#emitChange('added', added.length === 1 && first ? first : null);
    this.#pump();
    return added.map((e) => e.id);
  }

  /** Start queued uploads (needed only with `autoStart: false`). */
  start(): void {
    this.#pump(true);
  }

  /** Cancel a queued or uploading item (aborts its signal). */
  cancel(id: string): void {
    const e = this.#find(id);
    if (!e || (e.status !== 'queued' && e.status !== 'uploading')) return;
    this.#abort(e);
    e.status = 'cancelled';
    e.error = null;
    this.#touch(e);
    announce(this.#m('announceCancelled', { name: e.file.name }), 'polite', this.#doc);
    this.#emitChange('cancelled', e);
    this.#settled();
  }

  /** Cancel every queued or uploading item. */
  cancelAll(): void {
    for (const e of [...this.#entries]) this.cancel(e.id);
  }

  /** Queue a failed or cancelled item again. */
  retry(id: string): void {
    const e = this.#find(id);
    if (!e || (e.status !== 'failed' && e.status !== 'cancelled')) return;
    e.status = 'queued';
    e.loaded = 0;
    e.error = null;
    this.#touch(e);
    this.#emitChange('retried', e);
    this.#pump(true);
  }

  /** Remove an item; an upload in progress is aborted. Its preview URL is revoked. */
  remove(id: string): void {
    const e = this.#find(id);
    if (!e) return;
    this.#abort(e);
    this.#drop(e);
    this.#render();
    this.#emitChange('removed', this.#snapshot(e));
    this.#settled();
  }

  /** Remove every item (uploads in progress are aborted). */
  clear(): void {
    if (this.#entries.length === 0) return;
    for (const e of [...this.#entries]) {
      this.#abort(e);
      this.#drop(e);
    }
    this.#render();
    this.#emitChange('removed', null);
  }

  /** Remove items that finished successfully. */
  clearCompleted(): void {
    const done = this.#entries.filter((e) => e.status === 'done');
    if (done.length === 0) return;
    for (const e of done) this.#drop(e);
    this.#render();
    this.#emitChange('removed', null);
  }

  update(options: Partial<UploadQueueOptions>): void {
    const next = { ...this.#options, ...options };
    UploadQueue.#assert(next);
    this.#options = next;
    this.#config();
    this.#render(true);
    this.#pump();
  }

  /** Abort every upload, revoke preview URLs, and remove rendering. Late results are ignored. */
  destroy(): void {
    if (this.#group.disposed) return;
    this.#group.dispose();
    (this.#doc.defaultView ?? window).cancelAnimationFrame(this.#frame);
    for (const e of this.#entries) {
      this.#abort(e);
      if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
      e.row?.bar.destroy();
    }
    this.#entries = [];
    this.host.replaceChildren();
    this.host.classList.remove('aui-upload-queue');
  }

  static #assert(o: UploadQueueOptions): void {
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    if (typeof o.upload !== 'function') fail('upload', '(file: File, context: UploadContext) => Promise<unknown>');
    if (o.errorMessage !== undefined && typeof o.errorMessage !== 'function') fail('errorMessage', '(error: unknown, file: File) => string | null');
    if (o.preview !== undefined && typeof o.preview !== 'boolean') fail('preview', 'boolean');
  }

  #config(): Readonly<UploadQueueConfig & { locale: string }> {
    const o = this.#options;
    return uploadQueueConfig.resolve({
      ...(o.concurrency === undefined ? {} : { concurrency: o.concurrency }),
      ...(o.retries === undefined ? {} : { retries: o.retries }),
      ...(o.retryDelay === undefined ? {} : { retryDelay: o.retryDelay }),
      ...(o.autoStart === undefined ? {} : { autoStart: o.autoStart }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #m(key: string, params: Record<string, string> = {}): string {
    return getMessage('uploadQueue', key, params, this.#config().locale);
  }

  #find(id: string): Entry | undefined {
    return this.#entries.find((e) => e.id === id);
  }

  #snapshot(e: Entry): UploadItem {
    return Object.freeze({ id: e.id, file: e.file, status: e.status, loaded: e.loaded, total: e.total, attempts: e.attempts, error: e.error, response: e.response });
  }

  #emitChange(reason: UploadQueueChangeReason, item: Entry | UploadItem | null): void {
    const snapshot = item === null ? null : 'row' in item ? this.#snapshot(item) : item;
    emit(this.host, 'aui-change', { items: this.items, reason, item: snapshot } satisfies UploadQueueChangeDetail);
  }

  /** Make the current attempt stale and abort its signal. */
  #abort(e: Entry): void {
    const c = e.controller;
    e.controller = null;
    c?.abort();
  }

  #drop(e: Entry): void {
    const index = this.#entries.indexOf(e);
    if (index === -1) return;
    this.#entries.splice(index, 1);
    this.#dirty.delete(e);
    if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
    e.previewUrl = null;
    if (e.row) {
      const hadFocus = e.row.item.contains(this.#doc.activeElement);
      e.row.bar.destroy();
      e.row.item.remove();
      e.row = null;
      if (hadFocus) {
        const next = this.#entries[index] ?? this.#entries[index - 1];
        const target = next?.row ? this.#firstAction(next.row) : null;
        (target ?? this.list).focus();
      }
    }
  }

  /** Start queued items up to the concurrency limit. */
  #pump(force = false): void {
    if (this.#group.disposed) return;
    const config = this.#config();
    if (!config.autoStart && !force) return;
    for (const e of this.#entries) {
      if (this.#active >= config.concurrency) break;
      if (e.status === 'queued') void this.#run(e);
    }
  }

  async #run(e: Entry): Promise<void> {
    const controller = new AbortController();
    e.controller = controller;
    e.status = 'uploading';
    e.loaded = 0;
    e.total = e.file.size;
    e.error = null;
    this.#active++;
    this.#batchActivity = true;
    this.#touch(e);
    this.#emitChange('started', e);
    const stale = (): boolean => e.controller !== controller || this.#group.disposed;
    const onProgress = (loaded: number, total?: number): void => {
      if (stale() || !Number.isFinite(loaded)) return;
      if (total !== undefined && Number.isFinite(total) && total >= 0) e.total = total;
      e.loaded = Math.max(0, e.total > 0 ? Math.min(loaded, e.total) : loaded);
      this.#touch(e, true);
    };
    try {
      const { retries, retryDelay } = this.#config();
      for (let retry = 0; ; retry++) {
        e.attempts++;
        try {
          // Wrapped so a synchronous throw or a non-promise return is handled like a rejection/resolution.
          const response: unknown = await new Promise<unknown>((resolve, reject) => {
            Promise.resolve(this.#options.upload(e.file, { signal: controller.signal, onProgress, attempt: e.attempts, id: e.id })).then(resolve, reject);
          });
          if (stale()) return;
          e.status = 'done';
          e.response = response;
          if (e.total > 0) e.loaded = e.total;
          e.controller = null;
          this.#touch(e);
          this.#emitChange('succeeded', e);
          return;
        } catch (error) {
          if (stale()) return;
          if (retry < retries) {
            e.loaded = 0;
            this.#touch(e);
            try {
              await wait(retryDelay * 2 ** retry, controller.signal);
            } catch {
              return;
            }
            if (stale()) return;
            continue;
          }
          e.status = 'failed';
          e.error = this.#errorText(error, e.file);
          e.controller = null;
          this.#touch(e);
          announce(this.#m('announceFailed', { name: e.file.name }), 'polite', this.#doc);
          this.#emitChange('failed', e);
          return;
        }
      }
    } finally {
      this.#active--;
      if (!this.#group.disposed) {
        this.#pump();
        this.#settled();
      }
    }
  }

  #errorText(error: unknown, file: File): string {
    const mapped = this.#options.errorMessage?.(error, file);
    return typeof mapped === 'string' && mapped !== '' ? mapped : this.#m('uploadFailed');
  }

  /** When nothing is queued or uploading any more, announce and emit completion once per batch. */
  #settled(): void {
    if (!this.#batchActivity || this.busy || this.#group.disposed) return;
    this.#batchActivity = false;
    const count = (s: UploadStatus): number => this.#entries.filter((e) => e.status === s).length;
    const detail: UploadQueueCompleteDetail = { succeeded: count('done'), failed: count('failed'), cancelled: count('cancelled') };
    const locale = this.#config().locale;
    const n = (x: number): string => formatNumber(x, {}, locale);
    const only = this.#entries.length === 1 ? this.#entries[0] : undefined;
    let text: string;
    if (detail.failed === 0 && detail.cancelled === 0) {
      text = only ? this.#m('announceOneDone', { name: only.file.name }) : this.#m('announceAllDone', { done: n(detail.succeeded) });
    } else {
      text = this.#m('announceComplete', { done: n(detail.succeeded), failed: n(detail.failed), cancelled: n(detail.cancelled) });
    }
    // A lone failure or cancellation was already announced for the item itself.
    if (!(only && only.status !== 'done')) announce(text, 'polite', this.#doc);
    emit(this.host, 'aui-complete', detail, { bubbles: false });
  }

  /**
   * Re-render a row. Status changes render at once (text, actions, and focus stay
   * in step); progress, which can be reported hundreds of times per second, is
   * coalesced to one render per frame.
   */
  #touch(e: Entry, progressOnly = false): void {
    if (!progressOnly) {
      this.#dirty.delete(e);
      this.#renderRow(e);
      this.#renderSummary();
      return;
    }
    this.#dirty.add(e);
    if (this.#frame !== 0) return;
    this.#frame = (this.#doc.defaultView ?? window).requestAnimationFrame(() => {
      this.#frame = 0;
      if (this.#group.disposed) return;
      const dirty = [...this.#dirty];
      this.#dirty.clear();
      for (const d of dirty) this.#renderRow(d);
    });
  }

  #firstAction(row: EntryRow): HTMLButtonElement | null {
    return [row.cancel, row.retry, row.remove].find((b) => !b.hidden) ?? null;
  }

  #createRow(e: Entry): EntryRow {
    const doc = this.#doc;
    const o = this.#options;
    const item = doc.createElement('li');
    item.className = 'aui-upload-queue__item';
    const media = doc.createElement('span');
    media.className = 'aui-upload-queue__media';
    if (e.previewUrl) {
      const img = doc.createElement('img');
      img.className = 'aui-upload-queue__preview';
      // Decorative: the file name is the progress bar's label right next to it.
      img.alt = '';
      img.src = e.previewUrl;
      media.append(img);
    } else {
      media.append(renderIcon(o.icons?.file ?? DEFAULT_ICONS.file, { className: 'aui-upload-queue__file-icon', doc }));
    }
    const barHost = doc.createElement('div');
    barHost.className = 'aui-upload-queue__progress';
    const bar = ProgressBar.create(barHost, { ...this.#barOptions(e), announceComplete: false });
    const actions = doc.createElement('div');
    actions.className = 'aui-upload-queue__actions';
    const button = (kind: 'cancel' | 'retry' | 'remove', onClick: () => void): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = `aui-upload-queue__action aui-upload-queue__${kind}`;
      b.append(renderIcon(o.icons?.[kind] ?? DEFAULT_ICONS[kind], { doc }));
      b.addEventListener('click', onClick);
      return b;
    };
    const cancel = button('cancel', () => {
      this.cancel(e.id);
    });
    const retry = button('retry', () => {
      this.retry(e.id);
    });
    const remove = button('remove', () => {
      const name = e.file.name;
      this.remove(e.id);
      announce(this.#m('announceRemoved', { name }), 'polite', this.#doc);
    });
    actions.append(cancel, retry, remove);
    item.append(media, barHost, actions);
    return { item, bar, cancel, retry, remove };
  }

  #renderActions(e: Entry): void {
    const row = e.row;
    if (!row) return;
    const hadFocus = row.item.contains(this.#doc.activeElement);
    const active = e.status === 'queued' || e.status === 'uploading';
    row.cancel.hidden = !active;
    row.retry.hidden = e.status !== 'failed' && e.status !== 'cancelled';
    row.remove.hidden = active;
    const name = { name: e.file.name };
    row.cancel.setAttribute('aria-label', this.#m('cancel', name));
    row.retry.setAttribute('aria-label', this.#m('retry', name));
    row.remove.setAttribute('aria-label', this.#m('remove', name));
    // Keep focus in the row when the focused action was just hidden.
    if (hadFocus && !row.item.contains(this.#doc.activeElement)) this.#firstAction(row)?.focus();
    else if (hadFocus && this.#doc.activeElement instanceof HTMLButtonElement && this.#doc.activeElement.hidden) this.#firstAction(row)?.focus();
    row.item.dataset.status = e.status;
  }

  #barOptions(e: Entry): ProgressBarOptions {
    const locale = this.#config().locale;
    const status = this.#m(e.status);
    const size = formatFileSize(e.file.size, locale);
    const description = e.error ? this.#m('itemDescriptionError', { size, status, error: e.error }) : this.#m('itemDescription', { size, status });
    const unknownTotal = e.status === 'uploading' && e.total <= 0;
    const value = unknownTotal ? null : e.status === 'done' ? 100 : e.total > 0 ? (e.loaded / e.total) * 100 : 0;
    return { label: e.file.name, value, description, tone: e.status === 'done' ? 'success' : e.status === 'failed' ? 'error' : 'default', locale };
  }

  #renderRow(e: Entry): void {
    const row = e.row;
    if (!row) return;
    row.bar.update(this.#barOptions(e));
    this.#renderActions(e);
  }

  #renderSummary(): void {
    const locale = this.#config().locale;
    const total = this.#entries.length;
    const done = this.#entries.filter((e) => e.status === 'done').length;
    setText(this.#summary, total === 0 ? this.#m('empty') : this.#m('summary', { done: formatNumber(done, {}, locale), total: formatNumber(total, {}, locale) }));
  }

  /** Full render: label, rows in order (created on first render), summary. */
  #render(all = false): void {
    setText(this.#label, this.#options.label);
    const rows: HTMLLIElement[] = [];
    for (const e of this.#entries) {
      if (!e.row) {
        // The bar is created with its final options: one render per new row.
        e.row = this.#createRow(e);
        this.#renderActions(e);
      } else if (all) this.#renderRow(e);
      rows.push(e.row.item);
    }
    // Append only what is missing (moving a focused row would drop focus), in one batch.
    const missing = rows.filter((r) => r.parentNode !== this.list);
    if (missing.length > 0) {
      const fragment = this.#doc.createDocumentFragment();
      fragment.append(...missing);
      this.list.append(fragment);
    }
    this.list.hidden = this.#entries.length === 0;
    this.#renderSummary();
  }
}
