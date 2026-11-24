import { toError } from '../error/index.js';

/** Event map: event name -> listener argument tuple, e.g. `{ change: [value: number]; close: [] }`. */
export type EventMap<E> = { [K in keyof E]: unknown[] };

/** Listener for event `K`. */
export type Listener<E extends EventMap<E>, K extends keyof E> = (...args: E[K]) => void;

export interface TypedEventEmitterOptions {
  /**
   * Catch listener errors so every listener runs; errors go to `onError`. Default false: the first
   * throwing listener stops the emit and the error propagates to the `emit` caller.
   */
  readonly isolateErrors?: boolean;
  /** Receives isolated listener errors. */
  readonly onError?: (error: Error, event: PropertyKey) => void;
  /** Listener count per event above which `onMaxListeners` fires once per event. Default 10; 0 disables. */
  readonly maxListeners?: number;
  /** Called (not logged) when an event first exceeds `maxListeners`, a common leak signal. */
  readonly onMaxListeners?: (event: PropertyKey, count: number) => void;
}

/**
 * Strongly typed event emitter. `on` returns an unsubscribe function; listeners are snapshotted per
 * `emit`, so adding or removing listeners during an emit is safe.
 * Complexity: `on`, `emit` O(listeners of the event); `off` O(listeners of the event).
 * Not iterable and has no `size`; use `listenerCount`.
 * @example
 * const bus = new TypedEventEmitter<{ saved: [id: string]; reset: [] }>();
 * const messages: string[] = [];
 * const stop = bus.on('saved', (id) => { messages.push(`Saved ${id}`); });
 * bus.emit('saved', 'e-42');
 * stop();
 * bus.emit('saved', 'e-43'); // no listener any more
 * messages; // => ['Saved e-42']
 */
export class TypedEventEmitter<E extends EventMap<E>> {
  readonly #listeners = new Map<keyof E, Listener<E, keyof E>[]>();
  readonly #warned = new Set<keyof E>();
  readonly #options: TypedEventEmitterOptions;

  constructor(options: TypedEventEmitterOptions = {}) {
    this.#options = options;
  }

  /** Subscribes `listener` to `event`; returns an unsubscribe function. */
  on<K extends keyof E>(event: K, listener: Listener<E, K>): () => void {
    let list = this.#listeners.get(event);
    if (!list) {
      list = [];
      this.#listeners.set(event, list);
    }
    list.push(listener as Listener<E, keyof E>);
    const max = this.#options.maxListeners ?? 10;
    if (max > 0 && list.length > max && !this.#warned.has(event)) {
      this.#warned.add(event);
      this.#options.onMaxListeners?.(event, list.length);
    }
    return () => {
      this.off(event, listener);
    };
  }

  /** Subscribes for a single emit; returns an unsubscribe function. */
  once<K extends keyof E>(event: K, listener: Listener<E, K>): () => void {
    const wrapper = (...args: E[K]): void => {
      unsubscribe();
      listener(...args);
    };
    const unsubscribe = this.on(event, wrapper);
    return unsubscribe;
  }

  /** Removes one registration of `listener` from `event`. */
  off<K extends keyof E>(event: K, listener: Listener<E, K>): boolean {
    const list = this.#listeners.get(event);
    if (!list) return false;
    const i = list.indexOf(listener as Listener<E, keyof E>);
    if (i < 0) return false;
    list.splice(i, 1);
    if (list.length === 0) {
      this.#listeners.delete(event);
      this.#warned.delete(event);
    }
    return true;
  }

  /** Calls every listener of `event` with `args`; returns true when there were listeners. */
  emit<K extends keyof E>(event: K, ...args: E[K]): boolean {
    const list = this.#listeners.get(event);
    if (!list || list.length === 0) return false;
    for (const listener of list.slice()) {
      if (!this.#options.isolateErrors) {
        listener(...args);
        continue;
      }
      try {
        listener(...args);
      } catch (e) {
        this.#options.onError?.(toError(e), event);
      }
    }
    return true;
  }

  /** Number of listeners for `event`, or for all events when omitted. */
  listenerCount(event?: keyof E): number {
    if (event !== undefined) return this.#listeners.get(event)?.length ?? 0;
    let n = 0;
    for (const list of this.#listeners.values()) n += list.length;
    return n;
  }

  /** Event names that have listeners. */
  eventNames(): (keyof E)[] {
    return [...this.#listeners.keys()];
  }

  /** Removes all listeners of `event`, or of every event when omitted. */
  removeAllListeners(event?: keyof E): void {
    if (event === undefined) {
      this.#listeners.clear();
      this.#warned.clear();
    } else {
      this.#listeners.delete(event);
      this.#warned.delete(event);
    }
  }

  /** Alias of `removeAllListeners()`. */
  clear(): void {
    this.removeAllListeners();
  }
}
