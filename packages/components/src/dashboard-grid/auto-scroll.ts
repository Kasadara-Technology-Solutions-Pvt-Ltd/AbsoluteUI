/**
 * Edge auto-scroll while dragging (R18-15): when the pointer is within `EDGE` px of the top or bottom of
 * the nearest scroll container (or the viewport), that container scrolls on every animation frame,
 * faster closer to the edge, and `onTick` lets the drag recompute the drop cell.
 */
const EDGE = 48;
const MAX_STEP = 18;

function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== node.ownerDocument.body) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

export class AutoScroller {
  readonly #host: () => HTMLElement;
  #frame = 0;
  #y = 0;
  #onTick: (() => void) | null = null;

  constructor(host: () => HTMLElement) {
    this.#host = host;
  }

  /** Call on every pointer move with the client y. */
  track(clientY: number, onTick: (() => void) | null): void {
    this.#y = clientY;
    this.#onTick = onTick;
    if (this.#frame === 0 && this.#step() !== 0) this.#loop();
  }

  stop(): void {
    const win = this.#host().ownerDocument.defaultView;
    if (this.#frame !== 0) win?.cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#onTick = null;
  }

  /** Scroll delta for the current pointer position (negative scrolls up). */
  #step(): number {
    const host = this.#host();
    const win = host.ownerDocument.defaultView;
    if (!win) return 0;
    const container = scrollParent(host);
    const top = container ? container.getBoundingClientRect().top : 0;
    const bottom = container ? container.getBoundingClientRect().bottom : win.innerHeight;
    if (this.#y < top + EDGE) return -Math.ceil(MAX_STEP * Math.min(1, (top + EDGE - this.#y) / EDGE));
    if (this.#y > bottom - EDGE) return Math.ceil(MAX_STEP * Math.min(1, (this.#y - (bottom - EDGE)) / EDGE));
    return 0;
  }

  #loop(): void {
    const host = this.#host();
    const win = host.ownerDocument.defaultView;
    if (!win) return;
    this.#frame = win.requestAnimationFrame(() => {
      this.#frame = 0;
      const delta = this.#step();
      if (delta === 0) return;
      const container = scrollParent(host);
      const before = container ? container.scrollTop : win.scrollY;
      if (container) container.scrollTop += delta;
      else win.scrollBy(0, delta);
      const after = container ? container.scrollTop : win.scrollY;
      if (after === before) return; // at the end: stop until the pointer moves again
      this.#onTick?.();
      this.#loop();
    });
  }
}
