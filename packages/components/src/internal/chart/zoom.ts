/**
 * Zoom and pan for cartesian charts (SPEC section 18.18 shared infrastructure). The
 * visible window is kept in data units per axis; the chart maps it to pixels on
 * each render. Inputs, all optional to the user and equivalent in effect:
 *
 * - toolbar buttons (Zoom in, Zoom out, Reset zoom), reachable with Tab;
 * - keys on a focused mark: `+`/`=` zoom in around it, `-` zoom out, `0` reset;
 *   arrow keys past the window edge pan (the chart's `beyond` hook);
 * - Ctrl/Cmd + wheel zooms around the pointer (a plain wheel keeps scrolling the page);
 * - dragging the plot pans a zoomed chart; Shift + drag selects a range to zoom into.
 *
 * Every change is announced politely and reported with `aui-zoom`. Internal.
 */
import { emit, registerMessages, type Disposer } from '@absoluteui/core';
import { renderIcon } from '@absoluteui/icons';
import { announce, trackPointerDrag } from '@absoluteui/utilities';
import type { PlotRect } from './axis.js';
import type { ChartFrame } from './frame.js';
import { chartMessage } from './model.js';
import { svgElement } from './svg.js';

export type ChartZoomMode = 'none' | 'x' | 'xy';

/** Visible range of one axis in data units (category index, number, or epoch ms). */
export interface ChartZoomRange {
  readonly from: number;
  readonly to: number;
}

/** Detail of `aui-zoom`. */
export interface ChartZoomDetail {
  /** Visible x range, or null when showing everything. */
  x: ChartZoomRange | null;
  /** Visible y range (xy zoom only), or null. */
  y: ChartZoomRange | null;
  reason: 'button' | 'keyboard' | 'wheel' | 'pan' | 'select' | 'reset';
}

export interface ChartZoomHost {
  readonly frame: ChartFrame;
  locale(): string;
  rtl(): boolean;
  /** Full data extent per axis. */
  extent(): { readonly x: ChartZoomRange; readonly y: ChartZoomRange | null };
  /** Smallest visible span per axis (for example two categories). */
  minSpan(): { readonly x: number; readonly y: number };
  /** Plot rectangle and pixel-to-data inversion of the current render. */
  plot(): PlotRect;
  invertX(px: number): number;
  invertY(py: number): number;
  /** Text of an x (or y) data value, for announcements. */
  formatX(value: number): string;
  formatY(value: number): string;
  /** The window changed: re-render. */
  changed(): void;
}

const FACTOR = 1.5;

registerMessages('chart', 'en', {
  zoom: 'Zoom',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomReset: 'Reset zoom',
  zoomRange: 'Showing {from} to {to}.',
  zoomAll: 'Showing all data.',
});

export class ChartZoom {
  #mode: ChartZoomMode = 'none';
  #x: ChartZoomRange | null = null;
  #y: ChartZoomRange | null = null;
  readonly #host: ChartZoomHost;
  #buttons: { in: HTMLButtonElement; out: HTMLButtonElement; reset: HTMLButtonElement } | null = null;
  #brush: SVGRectElement | null = null;
  readonly #disposers: Disposer[] = [];

  constructor(host: ChartZoomHost) {
    this.#host = host;
  }

  get mode(): ChartZoomMode {
    return this.#mode;
  }

  get x(): ChartZoomRange | null {
    return this.#x;
  }

  get y(): ChartZoomRange | null {
    return this.#y;
  }

  get zoomed(): boolean {
    return this.#x !== null || this.#y !== null;
  }

  /** Enable or disable zooming (rebuilds the toolbar; disabling resets the window). */
  setMode(mode: ChartZoomMode): void {
    const frame = this.#host.frame;
    if (mode === this.#mode) {
      this.#syncButtons();
      return;
    }
    this.#mode = mode;
    this.#detach();
    frame.host.classList.toggle('aui-chart--zoomable', mode !== 'none');
    if (mode === 'none') {
      this.#x = null;
      this.#y = null;
      this.#buttons = null;
      frame.setToolbar([]);
      return;
    }
    if (mode === 'x') this.#y = null;
    this.#attach();
  }

  /** Set the window without an event (from options). Ranges are clamped to the extent. */
  setWindow(x: ChartZoomRange | null, y: ChartZoomRange | null = null): void {
    const extent = this.#host.extent();
    const span = this.#host.minSpan();
    this.#x = x ? clampRange(x, extent.x, span.x) : null;
    this.#y = y && this.#mode === 'xy' && extent.y ? clampRange(y, extent.y, span.y) : null;
    this.#syncButtons();
  }

  /** Zoom by `factor` (> 1 zooms in) around a data point (default: the window center). */
  zoom(factor: number, reason: ChartZoomDetail['reason'], at?: { readonly x?: number; readonly y?: number }): void {
    if (this.#mode === 'none') return;
    const extent = this.#host.extent();
    const span = this.#host.minSpan();
    const x = scaleRange(this.#x ?? extent.x, extent.x, factor, at?.x, span.x);
    const y = this.#mode === 'xy' && extent.y ? scaleRange(this.#y ?? extent.y, extent.y, factor, at?.y, span.y) : null;
    this.#commit(x, y, reason);
  }

  /** Shift the window by data deltas. */
  pan(dx: number, dy: number, reason: ChartZoomDetail['reason']): void {
    if (!this.zoomed) return;
    const extent = this.#host.extent();
    const x = this.#x ? shiftRange(this.#x, extent.x, dx) : null;
    const y = this.#y && extent.y ? shiftRange(this.#y, extent.y, dy) : null;
    this.#commit(x, y, reason);
  }

  /** Show `range` (clamped) on the x axis. */
  select(x: ChartZoomRange, y: ChartZoomRange | null, reason: ChartZoomDetail['reason']): void {
    const extent = this.#host.extent();
    const span = this.#host.minSpan();
    this.#commit(clampRange(x, extent.x, span.x), y && extent.y && this.#mode === 'xy' ? clampRange(y, extent.y, span.y) : null, reason);
  }

  reset(reason: ChartZoomDetail['reason'] = 'reset'): void {
    if (!this.zoomed) return;
    this.#commit(null, null, reason);
  }

  /** Zoom keys on a focused mark. */
  key(event: KeyboardEvent, at: { readonly x: number; readonly y?: number }): boolean {
    if (this.#mode === 'none' || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key === '+' || event.key === '=') this.zoom(FACTOR, 'keyboard', at);
    else if (event.key === '-' || event.key === '_') this.zoom(1 / FACTOR, 'keyboard', at);
    else if (event.key === '0') this.reset('keyboard');
    else return false;
    return true;
  }

  destroy(): void {
    this.#detach();
    this.#host.frame.host.classList.remove('aui-chart--zoomable', 'aui-chart--zoomed');
  }

  #commit(x: ChartZoomRange | null, y: ChartZoomRange | null, reason: ChartZoomDetail['reason']): void {
    const extent = this.#host.extent();
    // A window covering the whole extent is no zoom.
    const nx = x && (x.from > extent.x.from || x.to < extent.x.to) ? x : null;
    const ny = y && extent.y && (y.from > extent.y.from || y.to < extent.y.to) ? y : null;
    if (same(nx, this.#x) && same(ny, this.#y)) return;
    this.#x = nx;
    this.#y = ny;
    this.#syncButtons();
    this.#host.changed();
    const locale = this.#host.locale();
    announce(nx
      ? chartMessage('zoomRange', { from: this.#host.formatX(nx.from), to: this.#host.formatX(nx.to) }, locale)
      : ny ? chartMessage('zoomRange', { from: this.#host.formatY(ny.from), to: this.#host.formatY(ny.to) }, locale) : chartMessage('zoomAll', {}, locale));
    const detail: ChartZoomDetail = { x: nx, y: ny, reason };
    emit(this.#host.frame.host, 'aui-zoom', detail);
  }

  #syncButtons(): void {
    const b = this.#buttons;
    this.#host.frame.host.classList.toggle('aui-chart--zoomed', this.zoomed);
    if (!b) return;
    const extent = this.#host.extent();
    const span = this.#host.minSpan();
    const current = this.#x ?? extent.x;
    setDisabled(b.in, current.to - current.from <= span.x * 1.0001 && (this.#mode !== 'xy' || !extent.y || (this.#y ?? extent.y).to - (this.#y ?? extent.y).from <= span.y * 1.0001));
    setDisabled(b.out, !this.zoomed);
    setDisabled(b.reset, !this.zoomed);
  }

  #attach(): void {
    const host = this.#host;
    const frame = host.frame;
    const doc = frame.doc;
    const locale = host.locale();
    const group = doc.createElement('div');
    group.className = 'aui-chart__zoom';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', chartMessage('zoom', {}, locale));
    const button = (icon: string, key: string, onClick: () => void): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-chart__tool';
      b.setAttribute('aria-label', chartMessage(key, {}, locale));
      b.title = chartMessage(key, {}, locale);
      b.append(renderIcon(icon, { doc }));
      b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') === 'true') return;
        onClick();
      });
      return b;
    };
    this.#buttons = {
      in: button('plus', 'zoomIn', () => {
        this.zoom(FACTOR, 'button');
      }),
      out: button('minus', 'zoomOut', () => {
        this.zoom(1 / FACTOR, 'button');
      }),
      reset: button('refresh', 'zoomReset', () => {
        this.reset('button');
      }),
    };
    group.append(this.#buttons.in, this.#buttons.out, this.#buttons.reset);
    frame.setToolbar([group]);
    this.#syncButtons();

    const body = frame.body;
    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.deltaY === 0) return;
      const at = this.#dataAt(e.clientX, e.clientY);
      if (!at) return;
      e.preventDefault();
      this.zoom(e.deltaY < 0 ? 1.25 : 1 / 1.25, 'wheel', at);
    };
    body.addEventListener('wheel', onWheel, { passive: false });
    this.#disposers.push(() => {
      body.removeEventListener('wheel', onWheel);
    });

    let origin: { window: ChartZoomRange | null; windowY: ChartZoomRange | null; brush: boolean } | null = null;
    let shift = false;
    const drag = trackPointerDrag(body, {
      canStart: (e) => {
        shift = e.shiftKey;
        return (this.zoomed || e.shiftKey) && this.#dataAt(e.clientX, e.clientY) !== null && !(e.target instanceof Element && frame.tooltipElement.contains(e.target));
      },
      onStart: () => {
        const brush = shift || !this.zoomed;
        origin = { window: this.#x, windowY: this.#y, brush };
        if (brush) {
          this.#brush = svgElement(doc, 'rect', {}, 'aui-chart__brush');
          frame.layer.append(this.#brush);
        }
      },
      onMove: (move) => {
        if (!origin) return;
        const rect = frame.svg.getBoundingClientRect();
        const p = host.plot();
        if (origin.brush && this.#brush) {
          const x0 = clamp(Math.min(move.start.x, move.point.x) - rect.left, p.left, p.right);
          const x1 = clamp(Math.max(move.start.x, move.point.x) - rect.left, p.left, p.right);
          const xy = this.#mode === 'xy';
          const y0 = xy ? clamp(Math.min(move.start.y, move.point.y) - rect.top, p.top, p.bottom) : p.top;
          const y1 = xy ? clamp(Math.max(move.start.y, move.point.y) - rect.top, p.top, p.bottom) : p.bottom;
          for (const [name, value] of [['x', x0], ['y', y0], ['width', x1 - x0], ['height', y1 - y0]] as const) this.#brush.setAttribute(name, String(value));
          return;
        }
        // Pan: the data under the pointer at the start stays under the pointer.
        const extent = host.extent();
        const width = Math.max(1, p.right - p.left);
        const height = Math.max(1, p.bottom - p.top);
        const wx = origin.window ?? extent.x;
        const dx = (-(move.dx / width) * (wx.to - wx.from)) * (host.rtl() ? -1 : 1);
        const wy = origin.windowY ?? extent.y;
        const dy = wy ? (move.dy / height) * (wy.to - wy.from) : 0;
        this.#x = origin.window ? shiftRange(origin.window, extent.x, dx) : null;
        this.#y = origin.windowY && extent.y ? shiftRange(origin.windowY, extent.y, dy) : null;
        host.changed();
      },
      onEnd: (move) => {
        const o = origin;
        origin = null;
        this.#brush?.remove();
        this.#brush = null;
        if (!o) return;
        if (!o.brush) {
          // Pointer pans rendered live; report the final window once.
          const x = this.#x;
          const y = this.#y;
          this.#x = o.window;
          this.#y = o.windowY;
          this.#commit(x, y, 'pan');
          return;
        }
        const rect = frame.svg.getBoundingClientRect();
        const p = host.plot();
        const a = host.invertX(clamp(move.start.x - rect.left, p.left, p.right));
        const b = host.invertX(clamp(move.point.x - rect.left, p.left, p.right));
        const ya = host.invertY(clamp(move.start.y - rect.top, p.top, p.bottom));
        const yb = host.invertY(clamp(move.point.y - rect.top, p.top, p.bottom));
        if (Math.abs(move.dx) < 4) return;
        this.select({ from: Math.min(a, b), to: Math.max(a, b) }, this.#mode === 'xy' && Math.abs(move.dy) >= 4 ? { from: Math.min(ya, yb), to: Math.max(ya, yb) } : null, 'select');
      },
      onCancel: () => {
        const o = origin;
        origin = null;
        this.#brush?.remove();
        this.#brush = null;
        if (o && !o.brush) {
          this.#x = o.window;
          this.#y = o.windowY;
          host.changed();
        }
      },
    });
    this.#disposers.push(() => {
      drag.dispose();
    });
  }

  #detach(): void {
    for (const d of this.#disposers.splice(0)) d();
    this.#brush?.remove();
    this.#brush = null;
  }

  /** Data coordinates under a client point, or null outside the plot. */
  #dataAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.#host.frame.svg.getBoundingClientRect();
    const p = this.#host.plot();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    if (px < p.left || px > p.right || py < p.top || py > p.bottom) return null;
    return { x: this.#host.invertX(px), y: this.#host.invertY(py) };
  }
}

function setDisabled(button: HTMLButtonElement, disabled: boolean): void {
  // aria-disabled keeps the button focusable, so focus never drops to the body.
  if (disabled) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function same(a: ChartZoomRange | null, b: ChartZoomRange | null): boolean {
  return a === b || (a !== null && b !== null && a.from === b.from && a.to === b.to);
}

/** Clamp `range` into `extent` with at least `minSpan` width. */
export function clampRange(range: ChartZoomRange, extent: ChartZoomRange, minSpan: number): ChartZoomRange {
  const full = extent.to - extent.from;
  let from = Math.min(range.from, range.to);
  let to = Math.max(range.from, range.to);
  const span = Math.min(full, Math.max(minSpan, to - from));
  const mid = (from + to) / 2;
  from = mid - span / 2;
  to = mid + span / 2;
  if (from < extent.from) {
    to += extent.from - from;
    from = extent.from;
  }
  if (to > extent.to) {
    from -= to - extent.to;
    to = extent.to;
  }
  return { from: Math.max(extent.from, from), to: Math.min(extent.to, to) };
}

/** Scale a window by `factor` around `center` (kept at the same relative position). */
export function scaleRange(current: ChartZoomRange, extent: ChartZoomRange, factor: number, center: number | undefined, minSpan: number): ChartZoomRange {
  const c = center ?? (current.from + current.to) / 2;
  const span = current.to - current.from;
  const next = Math.min(extent.to - extent.from, Math.max(minSpan, span / factor));
  const ratio = span === 0 ? 0.5 : (c - current.from) / span;
  return clampRange({ from: c - ratio * next, to: c - ratio * next + next }, extent, minSpan);
}

/** Move a window by `delta` without changing its width, stopping at the extent. */
export function shiftRange(current: ChartZoomRange, extent: ChartZoomRange, delta: number): ChartZoomRange {
  const span = current.to - current.from;
  const from = clamp(current.from + delta, extent.from, extent.to - span);
  return { from, to: from + span };
}
