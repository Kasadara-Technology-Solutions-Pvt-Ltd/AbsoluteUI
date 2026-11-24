/** Multi-file upload queue on top of an `Uploader`. */
import { ValidationError } from '@absoluteui/helpers/error';
import { uuidV4 } from '@absoluteui/helpers/random';
import type { UploadController, Uploader } from './uploader.js';
import type { UploadProgress, UploadResult, UploadState } from './types.js';

/** One file in the queue (a live view; read it in event handlers). */
export interface UploadQueueItem {
  readonly id: string;
  readonly file: Blob & { readonly name?: string };
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly state: UploadState;
  readonly progress: UploadProgress;
  readonly error: Error | undefined;
  readonly result: UploadResult | undefined;
  readonly controller: UploadController | undefined;
}

/** Queue events and their payloads. */
export interface UploadQueueEvents {
  added: UploadQueueItem;
  started: UploadQueueItem;
  progress: UploadQueueItem;
  state: UploadQueueItem;
  completed: UploadQueueItem;
  failed: UploadQueueItem;
  cancelled: UploadQueueItem;
  removed: UploadQueueItem;
  idle: undefined;
}

export interface UploadQueueOptions {
  readonly uploader: Uploader;
  /** Files uploading at once. Default 2. */
  readonly concurrency?: number;
  /** Start uploading as soon as files are added. Default true. */
  readonly autoStart?: boolean;
}

/** Queue returned by `createUploadQueue`. */
export interface UploadQueue {
  add(files: Iterable<Blob & { readonly name?: string }> | (Blob & { readonly name?: string }), options?: { readonly metadata?: Readonly<Record<string, unknown>> }): readonly UploadQueueItem[];
  /** Cancels (if running) and removes an item. */
  remove(id: string): boolean;
  /** Re-queues failed items (they resume when the uploader has a store). Returns the count. */
  retryFailed(): number;
  cancelAll(): void;
  pauseAll(): void;
  resumeAll(): void;
  /** Starts processing when `autoStart` is false. */
  start(): void;
  readonly items: readonly UploadQueueItem[];
  /** Aggregate progress over items that are not cancelled. */
  readonly progress: UploadProgress;
  on<K extends keyof UploadQueueEvents>(event: K, listener: (payload: UploadQueueEvents[K]) => void): () => void;
  /** Resolves when nothing is queued or running. */
  onIdle(): Promise<void>;
}

type Item = {
  -readonly [K in keyof UploadQueueItem]: UploadQueueItem[K];
};

const TERMINAL: ReadonlySet<UploadState> = new Set(['completed', 'failed', 'cancelled']);

/**
 * Uploads many files with at most `concurrency` files in flight, with add/remove, retry of
 * failed files, cancel/pause/resume all, and events for UI and live-region announcements.
 * @example
 * const uploader = createUploader({ endpoint: '/api/uploads' });
 * const queue = createUploadQueue({ uploader });
 * queue.on('completed', (item) => { console.info(`${item.file.name ?? 'File'} uploaded`); });
 * const input = document.createElement('input');
 * input.type = 'file';
 * queue.add(input.files ?? []);
 */
export function createUploadQueue(options: UploadQueueOptions): UploadQueue {
  const concurrency = options.concurrency ?? 2;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new ValidationError('SVC_UPLOAD_INVALID_OPTION', 'An uploader option is out of range.', { details: { name: 'concurrency', min: 1 } });
  const { uploader } = options;
  const items: Item[] = [];
  const listeners = new Map<keyof UploadQueueEvents, Set<(payload: never) => void>>();
  let started = options.autoStart ?? true;
  let active = 0;
  let idleWaiters: (() => void)[] = [];

  const emit = <K extends keyof UploadQueueEvents>(event: K, payload: UploadQueueEvents[K]): void => {
    const set = listeners.get(event);
    if (!set) return;
    for (const l of [...set]) (l as (p: UploadQueueEvents[K]) => void)(payload);
  };
  const isIdle = (): boolean => active === 0 && !items.some((i) => i.state === 'queued');
  const checkIdle = (): void => {
    if (!isIdle()) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const w of waiters) w();
    emit('idle', undefined);
  };

  const launch = (item: Item): void => {
    active++;
    const c = uploader.upload(item.file, { metadata: item.metadata });
    item.controller = c;
    item.state = c.state;
    emit('started', item);
    let lastState = c.state;
    c.subscribe((u) => {
      if (item.controller !== u) return;
      item.progress = u.progress;
      item.state = u.state;
      if (u.state !== lastState) {
        lastState = u.state;
        emit('state', item);
      } else emit('progress', item);
    });
    c.promise.then(
      (result) => {
        if (item.controller !== c) return;
        item.result = result;
        item.state = 'completed';
        item.progress = c.progress;
        emit('completed', item);
      },
      (e: unknown) => {
        if (item.controller !== c) return;
        item.error = c.error ?? (e instanceof Error ? e : undefined);
        item.state = c.state;
        emit(c.state === 'cancelled' ? 'cancelled' : 'failed', item);
      },
    ).finally(() => {
      active--;
      pump();
      checkIdle();
    });
  };

  const pump = (): void => {
    if (!started) return;
    while (active < concurrency) {
      const next = items.find((i) => i.state === 'queued' && i.controller === undefined);
      if (!next) break;
      launch(next);
    }
  };

  const aggregate = (): UploadProgress => {
    let loaded = 0;
    let total = 0;
    let speed = 0;
    let anySpeed = false;
    for (const i of items) {
      if (i.state === 'cancelled') continue;
      loaded += i.progress.loaded;
      total += i.progress.total;
      if (i.progress.speedBps !== null && (i.state === 'uploading')) {
        speed += i.progress.speedBps;
        anySpeed = true;
      }
    }
    const speedBps = anySpeed ? speed : null;
    return { loaded, total, percent: total === 0 ? 0 : Math.min(100, (loaded / total) * 100), speedBps, etaMs: speedBps !== null && speedBps > 0 ? Math.round(((total - loaded) / speedBps) * 1000) : null };
  };

  return {
    add(files, addOptions = {}) {
      const list = files instanceof Blob ? [files] : [...files];
      const added: Item[] = list.map((file) => ({
        id: uuidV4(),
        file,
        metadata: addOptions.metadata ?? {},
        state: 'queued',
        progress: { loaded: 0, total: file.size, percent: 0, speedBps: null, etaMs: null },
        error: undefined,
        result: undefined,
        controller: undefined,
      }));
      items.push(...added);
      for (const a of added) emit('added', a);
      pump();
      return added;
    },
    remove(id) {
      const idx = items.findIndex((i) => i.id === id);
      const item = items[idx];
      if (!item) return false;
      items.splice(idx, 1);
      if (item.controller && !TERMINAL.has(item.controller.state)) item.controller.cancel();
      emit('removed', item);
      checkIdle();
      return true;
    },
    retryFailed() {
      let n = 0;
      for (const i of items) {
        if (i.state !== 'failed') continue;
        i.state = 'queued';
        i.controller = undefined;
        i.error = undefined;
        n++;
      }
      pump();
      return n;
    },
    cancelAll() {
      for (const i of items) {
        if (i.controller && !TERMINAL.has(i.controller.state)) i.controller.cancel();
        else if (i.state === 'queued' && !i.controller) {
          i.state = 'cancelled';
          emit('cancelled', i);
        }
      }
      checkIdle();
    },
    pauseAll() {
      for (const i of items) i.controller?.pause();
    },
    resumeAll() {
      for (const i of items) i.controller?.resume();
    },
    start() {
      started = true;
      pump();
    },
    get items() {
      return [...items];
    },
    get progress() {
      return aggregate();
    },
    on(event, listener) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      const l = listener as (payload: never) => void;
      set.add(l);
      return () => {
        set.delete(l);
      };
    },
    onIdle() {
      if (isIdle()) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },
  };
}
