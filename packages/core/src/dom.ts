/** Small DOM helpers shared by all packages. */

let counter = 0;

/** Unique, deterministic-per-page element id. */
export function createId(prefix = 'aui'): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}

export interface EmitOptions {
  cancelable?: boolean;
  /**
   * Default true. Lifecycle events (open/close/cancel) pass false, mirroring native
   * `close`/`toggle`, so nested components' events never reach a container's listeners.
   */
  bubbles?: boolean;
}

/**
 * Dispatch a standards-based CustomEvent from a host element (SPEC section 3.3).
 * Returns false when a cancelable event was prevented.
 */
export function emit(host: EventTarget, type: string, detail: unknown, options: EmitOptions = {}): boolean {
  const bubbles = options.bubbles ?? true;
  return host.dispatchEvent(new CustomEvent(type, { detail, bubbles, composed: bubbles, cancelable: options.cancelable ?? false }));
}

export type Disposer = () => void;

/** Collects cleanup callbacks and runs them once, in reverse order. */
export class DisposableGroup {
  #disposers: Disposer[] = [];
  #disposed = false;

  add(disposer: Disposer): void {
    if (this.#disposed) {
      disposer();
      return;
    }
    this.#disposers.push(disposer);
  }

  listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions): void;
  listen<K extends keyof DocumentEventMap>(target: Document, type: K, handler: (event: DocumentEventMap[K]) => void, options?: AddEventListenerOptions): void;
  listen<K extends keyof WindowEventMap>(target: Window, type: K, handler: (event: WindowEventMap[K]) => void, options?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, handler: (event: Event) => void, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler, options);
    this.add(() => {
      target.removeEventListener(type, handler, options);
    });
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const list = this.#disposers.reverse();
    this.#disposers = [];
    for (const d of list) d();
  }
}
