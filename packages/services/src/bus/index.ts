/**
 * Typed pub/sub in one tab and across tabs (`BroadcastChannel`), plus leader election
 * (docs/PLAN-HELPERS.md section 3). SSR-safe: channels are created only when a bus is created.
 */
import { ValidationError } from '@absoluteui/helpers/error';
import { randomId } from '@absoluteui/helpers/random';

/** Event name -> payload type map. */
export type EventMap = Record<string, unknown>;

/** Listener for one event type. */
export type EventListener<P> = (payload: P) => void;
/** Listener for every event (`'*'`). */
export type WildcardListener<E extends EventMap> = <K extends keyof E & string>(type: K, payload: E[K]) => void;

/** Options for {@link createEventBus}. */
export interface EventBusOptions {
  /** Receives listener exceptions (other listeners still run). Default: `reportError` when present, else rethrown asynchronously. */
  readonly onError?: (error: unknown, type: string) => void;
}

/** Typed event bus returned by {@link createEventBus}. */
export interface EventBus<E extends EventMap> {
  /** Subscribes; returns an unsubscribe function. `'*'` receives `(type, payload)` for every event. */
  on<K extends keyof E & string>(type: K, listener: EventListener<E[K]>): () => void;
  on(type: '*', listener: WildcardListener<E>): () => void;
  off<K extends keyof E & string>(type: K, listener: EventListener<E[K]>): void;
  off(type: '*', listener: WildcardListener<E>): void;
  /** Subscribes for the next event only. */
  once<K extends keyof E & string>(type: K, listener: EventListener<E[K]>): () => void;
  /** Delivers synchronously to a snapshot of the current listeners. */
  emit<K extends keyof E & string>(type: K, payload: E[K]): void;
  /** Listener count for `type`, or for all types. */
  listenerCount(type?: (keyof E & string) | '*'): number;
  /** Removes every listener. */
  clear(): void;
}

type AnyListener = (...args: unknown[]) => void;

function defaultOnError(error: unknown): void {
  const report = (globalThis as { reportError?: (e: unknown) => void }).reportError;
  if (typeof report === 'function') {
    report(error);
    return;
  }
  setTimeout(() => {
    throw error;
  }, 0);
}

/**
 * Creates a typed in-memory event bus with listener error isolation.
 * @example
 * const bus = createEventBus<{ saved: { id: number }; closed: undefined }>();
 * const saved: number[] = [];
 * const off = bus.on('saved', ({ id }) => { saved.push(id); });
 * bus.emit('saved', { id: 1 });
 * off();
 * bus.emit('saved', { id: 2 });
 * saved; // => [1]
 */
export function createEventBus<E extends EventMap>(options: EventBusOptions = {}): EventBus<E> {
  const onError = options.onError ?? defaultOnError;
  const map = new Map<string, Set<AnyListener>>();
  const add = (type: string, fn: AnyListener): (() => void) => {
    if (typeof fn !== 'function') throw new ValidationError('SVC_BUS_INVALID_LISTENER', 'Listener must be a function.');
    let set = map.get(type);
    if (!set) {
      set = new Set();
      map.set(type, set);
    }
    set.add(fn);
    return () => {
      remove(type, fn);
    };
  };
  const remove = (type: string, fn: AnyListener): void => {
    const set = map.get(type);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) map.delete(type);
  };
  const call = (fn: AnyListener, type: string, args: unknown[]): void => {
    try {
      fn(...args);
    } catch (e) {
      try {
        onError(e, type);
      } catch {
        // The error handler itself failed; nothing sensible remains.
      }
    }
  };
  const bus: EventBus<E> = {
    on(type: string, listener: AnyListener) {
      return add(type, listener);
    },
    off(type: string, listener: AnyListener) {
      remove(type, listener);
    },
    once(type, listener) {
      const wrapper: AnyListener = (payload) => {
        remove(type, wrapper);
        listener(payload as E[typeof type]);
      };
      return add(type, wrapper);
    },
    emit(type, payload) {
      if (type === '*') throw new ValidationError('SVC_BUS_INVALID_TYPE', 'The wildcard type cannot be emitted.');
      const direct = map.get(type);
      if (direct) for (const fn of [...direct]) call(fn, type, [payload]);
      const any = map.get('*');
      if (any) for (const fn of [...any]) call(fn, type, [type, payload]);
    },
    listenerCount(type) {
      if (type !== undefined) return map.get(type)?.size ?? 0;
      let n = 0;
      for (const s of map.values()) n += s.size;
      return n;
    },
    clear() {
      map.clear();
    },
  } as EventBus<E>;
  return bus;
}

// ---------------------------------------------------------------------------
// Cross-tab

/** Options for {@link createCrossTabBus}. */
export interface CrossTabBusOptions extends EventBusOptions {
  /** Also deliver emitted events to listeners in this tab. Default true. */
  readonly local?: boolean;
  /** Validates incoming payloads per type; failing messages are dropped. */
  readonly validate?: (type: string, payload: unknown) => boolean;
}

/** Cross-tab bus returned by {@link createCrossTabBus}. */
export interface CrossTabBus<E extends EventMap> extends EventBus<E> {
  /** False when `BroadcastChannel` is unavailable and events stay in this tab. */
  readonly crossTab: boolean;
  /** Closes the channel and removes listeners. Emitting afterwards is a no-op. */
  close(): void;
}

interface Wire {
  readonly __aui: 1;
  readonly type: string;
  readonly payload: unknown;
}
const isWire = (d: unknown): d is Wire => typeof d === 'object' && d !== null && (d as { __aui?: unknown }).__aui === 1 && typeof (d as { type?: unknown }).type === 'string';

/**
 * Typed bus shared by every same-origin tab/worker that uses the same `channelName` (`BroadcastChannel` is
 * same-origin by design, so no origin check is needed). Payloads must be structured-cloneable (plain data,
 * no functions or DOM nodes): otherwise `emit` throws `SVC_BUS_UNCLONEABLE`. Falls back to in-tab delivery.
 * @example
 * const bus = createCrossTabBus<{ logout: undefined; theme: 'light' | 'dark' }>('app');
 * bus.on('logout', () => location.assign('/signed-out'));
 * bus.emit('logout', undefined);
 */
export function createCrossTabBus<E extends EventMap>(channelName: string, options: CrossTabBusOptions = {}): CrossTabBus<E> {
  if (typeof channelName !== 'string' || channelName.length === 0 || channelName.length > 256) throw new ValidationError('SVC_BUS_INVALID_CHANNEL', 'Channel name must be 1-256 characters.');
  const { local = true, validate } = options;
  const inner = createEventBus<E>(options);
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`aui-bus:${channelName}`) : undefined;
  let closed = false;
  if (channel) {
    channel.onmessage = (ev: MessageEvent<unknown>) => {
      const d = ev.data;
      if (closed || !isWire(d) || d.type === '*') return;
      if (validate && !validate(d.type, d.payload)) return;
      inner.emit(d.type, d.payload as E[keyof E & string]);
    };
    channel.onmessageerror = () => {
      options.onError?.(new ValidationError('SVC_BUS_MESSAGE_ERROR', 'A cross-tab message could not be deserialized.'), '');
    };
  }
  const bus: CrossTabBus<E> = {
    ...inner,
    crossTab: channel !== undefined,
    emit(type, payload) {
      if (closed) return;
      if (channel) {
        try {
          channel.postMessage({ __aui: 1, type, payload } satisfies Wire);
        } catch (e) {
          throw new ValidationError('SVC_BUS_UNCLONEABLE', 'The event payload cannot be sent to other tabs (not structured-cloneable).', { cause: e });
        }
      }
      if (local || !channel) inner.emit(type, payload);
    },
    close() {
      if (closed) return;
      closed = true;
      channel?.close();
      inner.clear();
    },
  };
  return bus;
}

// ---------------------------------------------------------------------------
// Leader election

/** Options for {@link createLeaderElection}. */
export interface LeaderElectionOptions {
  /** `'auto'` (default) uses Web Locks when present, else a `BroadcastChannel` heartbeat. */
  readonly strategy?: 'auto' | 'locks' | 'broadcast';
  /** Heartbeat interval for the broadcast strategy. Default 1000 ms (leadership is claimed after 3 missed beats). */
  readonly heartbeatMs?: number;
}

/** Handle returned by {@link createLeaderElection}. */
export interface LeaderElection {
  /** True while this tab is the leader. */
  readonly isLeader: boolean;
  /** Resolves when this tab becomes leader (immediately if it is). Rejects if resigned first. */
  whenLeader(): Promise<void>;
  /** Calls `callback(isLeader)` on every change; returns an unsubscribe function. */
  onChange(callback: (isLeader: boolean) => void): () => void;
  /** Gives up (or stops competing for) leadership. Idempotent. */
  resign(): void;
}

interface LockManagerLike {
  request(name: string, options: { signal?: AbortSignal }, callback: () => Promise<void>): Promise<unknown>;
}

/**
 * Elects one leader among same-origin tabs for `name` (for example, only the leader refreshes tokens or polls).
 * Uses the Web Locks API when present (leadership passes automatically when the leader tab closes), otherwise
 * a `BroadcastChannel` heartbeat; without either, this tab is always leader.
 * @example
 * const election = createLeaderElection('token-refresh');
 * await election.whenLeader();
 * const timer = setInterval(() => { void fetch('/api/token/refresh', { method: 'POST' }); }, 240_000); // only one tab refreshes
 */
export function createLeaderElection(name: string, options: LeaderElectionOptions = {}): LeaderElection {
  if (typeof name !== 'string' || name.length === 0 || name.length > 256) throw new ValidationError('SVC_BUS_INVALID_CHANNEL', 'Election name must be 1-256 characters.');
  const { strategy = 'auto', heartbeatMs = 1000 } = options;
  if (!Number.isFinite(heartbeatMs) || heartbeatMs < 10) throw new ValidationError('SVC_BUS_INVALID_OPTION', 'heartbeatMs must be at least 10.');
  let leader = false;
  let resigned = false;
  const listeners = new Set<(v: boolean) => void>();
  const waiters: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  const setLeader = (v: boolean): void => {
    if (leader === v) return;
    leader = v;
    if (v) for (const w of waiters.splice(0)) w.resolve();
    for (const l of [...listeners]) {
      try {
        l(v);
      } catch {
        // Listener failures are isolated.
      }
    }
  };
  let stop: () => void = () => undefined;

  const locks = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks;
  const useLocks = strategy === 'locks' || (strategy === 'auto' && locks !== undefined);
  if (useLocks && locks) {
    const abort = new AbortController();
    let release: (() => void) | undefined;
    locks
      .request(`aui-leader:${name}`, { signal: abort.signal }, () => {
        if (resigned) return Promise.resolve();
        setLeader(true);
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => undefined);
    stop = () => {
      abort.abort();
      release?.();
    };
  } else if (strategy !== 'locks' && typeof BroadcastChannel === 'function') {
    const id = randomId(16);
    const channel = new BroadcastChannel(`aui-leader:${name}`);
    let lastBeat = 0;
    let claimTimer: ReturnType<typeof setTimeout> | undefined;
    const post = (t: 'beat' | 'claim' | 'resign'): void => {
      try {
        channel.postMessage({ t, id });
      } catch {
        // Closed.
      }
    };
    const claim = (): void => {
      if (resigned || leader || claimTimer !== undefined) return;
      post('claim');
      // Wait for competing claims; the smallest id wins.
      claimTimer = setTimeout(() => {
        claimTimer = undefined;
        if (!resigned && Date.now() - lastBeat > heartbeatMs * 3) {
          setLeader(true);
          post('beat');
        }
      }, Math.min(heartbeatMs, 250));
    };
    channel.onmessage = (ev: MessageEvent<unknown>) => {
      const d = ev.data as { t?: unknown; id?: unknown } | null;
      if (typeof d !== 'object' || d === null || typeof d.id !== 'string') return;
      const otherWins = d.id < id;
      if (d.t === 'beat') {
        if (leader && !otherWins) {
          post('beat');
          return;
        }
        lastBeat = Date.now();
        if (leader) setLeader(false);
        if (claimTimer !== undefined) {
          clearTimeout(claimTimer);
          claimTimer = undefined;
        }
      } else if (d.t === 'claim') {
        if (leader) post('beat');
        else if (otherWins) {
          lastBeat = Date.now();
          if (claimTimer !== undefined) {
            clearTimeout(claimTimer);
            claimTimer = undefined;
          }
        } else claim();
      } else if (d.t === 'resign') {
        lastBeat = 0;
        claim();
      }
    };
    const tick = setInterval(() => {
      if (leader) post('beat');
      else if (Date.now() - lastBeat > heartbeatMs * 3) claim();
    }, heartbeatMs);
    claim();
    stop = () => {
      clearInterval(tick);
      if (claimTimer !== undefined) clearTimeout(claimTimer);
      if (leader) post('resign');
      channel.close();
    };
  } else {
    queueMicrotask(() => {
      if (!resigned) setLeader(true);
    });
  }

  return {
    get isLeader() {
      return leader;
    },
    whenLeader() {
      if (leader) return Promise.resolve();
      if (resigned) return Promise.reject(new ValidationError('SVC_BUS_RESIGNED', 'The election was resigned.'));
      return new Promise<void>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    onChange(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    resign() {
      if (resigned) return;
      resigned = true;
      stop();
      setLeader(false);
      for (const w of waiters.splice(0)) w.reject(new ValidationError('SVC_BUS_RESIGNED', 'The election was resigned.'));
      listeners.clear();
    },
  };
}
