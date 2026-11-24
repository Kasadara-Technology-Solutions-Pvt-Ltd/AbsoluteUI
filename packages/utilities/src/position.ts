/**
 * Positioning engine. `computePosition` is pure (testable, no DOM reads);
 * `autoPosition` measures and applies results through the CSSOM (CSP-safe, section 14.6)
 * and keeps the floating element anchored on scroll/resize.
 */
import type { Direction, Disposer } from '@absoluteui/core';
import { observeResize } from './observe.js';

export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Alignment = 'start' | 'center' | 'end';
export type Placement = Side | `${Side}-start` | `${Side}-end`;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A positioning reference that is not an element, for example the pointer position of
 * a context menu. `getBoundingClientRect` is read on every update, so a virtual anchor
 * can follow scrolling content.
 */
export interface VirtualAnchor {
  getBoundingClientRect(): Rect;
}

export interface Size {
  width: number;
  height: number;
}

export interface PositionOptions {
  placement?: Placement;
  /** Gap between anchor and floating element, px. Default 4. */
  offset?: number;
  /** Flip to the opposite side when space is insufficient. Default true. */
  flip?: boolean;
  /** Shift along the cross axis to stay within the viewport. Default true. */
  shift?: boolean;
  /** Minimum distance from the viewport edge, px. Default 8. */
  padding?: number;
  /** Logical alignment: in RTL, "start" aligns to the anchor's right edge. */
  direction?: Direction;
}

export interface PositionResult {
  x: number;
  y: number;
  placement: Placement;
  /** Available size on the final side, for constraining scrollable content. */
  availableWidth: number;
  availableHeight: number;
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function split(placement: Placement): [Side, Alignment] {
  const [side, align] = placement.split('-') as [Side, 'start' | 'end' | undefined];
  return [side, align ?? 'center'];
}

function join(side: Side, align: Alignment): Placement {
  return align === 'center' ? side : `${side}-${align}`;
}

function available(side: Side, anchor: Rect, viewport: Rect, offset: number, padding: number): number {
  switch (side) {
    case 'top':
      return anchor.y - viewport.y - offset - padding;
    case 'bottom':
      return viewport.y + viewport.height - (anchor.y + anchor.height) - offset - padding;
    case 'left':
      return anchor.x - viewport.x - offset - padding;
    case 'right':
      return viewport.x + viewport.width - (anchor.x + anchor.width) - offset - padding;
  }
}

export function computePosition(anchor: Rect, floating: Size, viewport: Rect, options: PositionOptions = {}): PositionResult {
  const offset = options.offset ?? 4;
  const padding = options.padding ?? 8;
  const rtl = options.direction === 'rtl';
  const [preferredSide, align] = split(options.placement ?? 'bottom-start');

  let side = preferredSide;
  if (options.flip ?? true) {
    const need = side === 'top' || side === 'bottom' ? floating.height : floating.width;
    const here = available(side, anchor, viewport, offset, padding);
    const there = available(OPPOSITE[side], anchor, viewport, offset, padding);
    if (here < need && there > here) side = OPPOSITE[side];
  }

  const verticalSide = side === 'top' || side === 'bottom';
  let x: number;
  let y: number;
  if (verticalSide) {
    y = side === 'bottom' ? anchor.y + anchor.height + offset : anchor.y - floating.height - offset;
    // Logical alignment on the horizontal axis honours direction.
    const physical = align === 'center' ? 'center' : (align === 'start') !== rtl ? 'left' : 'right';
    x = physical === 'center' ? anchor.x + (anchor.width - floating.width) / 2 : physical === 'left' ? anchor.x : anchor.x + anchor.width - floating.width;
  } else {
    x = side === 'right' ? anchor.x + anchor.width + offset : anchor.x - floating.width - offset;
    y = align === 'center' ? anchor.y + (anchor.height - floating.height) / 2 : align === 'start' ? anchor.y : anchor.y + anchor.height - floating.height;
  }

  if (options.shift ?? true) {
    if (verticalSide) {
      x = Math.min(Math.max(x, viewport.x + padding), Math.max(viewport.x + padding, viewport.x + viewport.width - padding - floating.width));
    } else {
      y = Math.min(Math.max(y, viewport.y + padding), Math.max(viewport.y + padding, viewport.y + viewport.height - padding - floating.height));
    }
  }

  const mainAvailable = Math.max(0, available(side, anchor, viewport, offset, padding));
  return {
    x: Math.round(x),
    y: Math.round(y),
    placement: join(side, align),
    availableWidth: verticalSide ? Math.max(0, viewport.width - padding * 2) : mainAvailable,
    availableHeight: verticalSide ? mainAvailable : Math.max(0, viewport.height - padding * 2),
  };
}

export interface AutoPositionOptions extends PositionOptions {
  /** Set the floating element's min-width to the anchor width. */
  matchAnchorWidth?: boolean;
  /**
   * Publish the available block size as the `--aui-available-height` custom property
   * so component CSS can cap its max height. Default true.
   */
  constrainHeight?: boolean;
  onPosition?: (result: PositionResult) => void;
}

/**
 * Position `floating` (fixed positioning; intended for top-layer popovers) next to
 * `anchor` and keep it updated. `anchor` is an element or a virtual anchor (only an
 * element's size is observed). Returns a disposer.
 */
export function autoPosition(anchor: Element | VirtualAnchor, floating: HTMLElement, options: AutoPositionOptions = {}): Disposer {
  const win = floating.ownerDocument.defaultView ?? window;
  let frame = 0;

  const update = (): void => {
    frame = 0;
    const a = anchor.getBoundingClientRect();
    const style = floating.style;
    style.setProperty('position', 'fixed');
    style.setProperty('margin', '0');
    style.setProperty('inset', 'auto');
    if (options.matchAnchorWidth) style.setProperty('min-width', `${a.width}px`);
    const f = floating.getBoundingClientRect();
    const viewport = { x: 0, y: 0, width: win.innerWidth, height: win.innerHeight };
    const result = computePosition(a, { width: f.width, height: f.height }, viewport, options);
    style.setProperty('left', `${result.x}px`);
    style.setProperty('top', `${result.y}px`);
    if (options.constrainHeight ?? true) style.setProperty('--aui-available-height', `${result.availableHeight}px`);
    floating.dataset.placement = result.placement;
    options.onPosition?.(result);
  };
  const schedule = (): void => {
    if (!frame) frame = win.requestAnimationFrame(update);
  };

  update();
  const stopAnchor = anchor instanceof win.Element ? observeResize(anchor, schedule) : (): void => undefined;
  const stopFloating = observeResize(floating, schedule);
  win.addEventListener('scroll', schedule, { capture: true, passive: true });
  win.addEventListener('resize', schedule, { passive: true });

  return () => {
    if (frame) win.cancelAnimationFrame(frame);
    stopAnchor();
    stopFloating();
    win.removeEventListener('scroll', schedule, { capture: true });
    win.removeEventListener('resize', schedule);
  };
}
