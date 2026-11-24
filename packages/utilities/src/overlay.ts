/**
 * Overlay engine. Non-modal overlays render in the browser top layer through the
 * Popover API (`popover="manual"`), which removes z-index/portal stacking issues.
 * A single stack arbitrates Escape and outside-pointer dismissal so only the
 * topmost overlay responds. Modal dialogs register via `registerOverlayLayer`.
 */
import type { Disposer } from '@absoluteui/core';

export type DismissReason = 'escape' | 'outside-pointer' | 'programmatic';

export interface OverlayOptions {
  /** Dismiss on Escape when topmost. Default true. */
  dismissOnEscape?: boolean;
  /** Dismiss on pointerdown outside the overlay and `inside` elements. Default true. */
  dismissOnOutsidePointer?: boolean;
  /** Elements treated as part of the overlay (e.g. the trigger or combobox input). */
  inside?: readonly Element[];
  /** Called when the engine requests dismissal. The owner performs the close. */
  onDismiss?: (reason: DismissReason) => void;
}

export interface OverlayLayer {
  readonly element: HTMLElement;
  readonly options: OverlayOptions;
}

const stack: OverlayLayer[] = [];
let listening = false;

function isInside(layer: OverlayLayer, target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  if (layer.element.contains(target)) return true;
  return (layer.options.inside ?? []).some((el) => el.contains(target));
}

/**
 * Topmost live layer. Layers whose element was removed from the document without
 * being unregistered (for example a host cleared without destroy()) are pruned, so
 * they can never swallow Escape or outside-pointer dismissal (R1 fix).
 */
function topLayer(): OverlayLayer | undefined {
  while (stack.length > 0 && !stack[stack.length - 1]?.element.isConnected) stack.pop();
  return stack[stack.length - 1];
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const top = topLayer();
  if (!top || top.options.dismissOnEscape === false) return;
  event.preventDefault();
  event.stopPropagation();
  top.options.onDismiss?.('escape');
}

function onPointerDown(event: PointerEvent): void {
  const top = topLayer();
  if (!top || top.options.dismissOnOutsidePointer === false) return;
  // Pointer inside any overlay above-or-equal is "inside"; pointer inside a lower overlay dismisses the top one.
  if (isInside(top, event.target)) return;
  top.options.onDismiss?.('outside-pointer');
}

function ensureListeners(doc: Document): void {
  if (listening) return;
  listening = true;
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
}

function releaseListeners(doc: Document): void {
  if (!listening || stack.length > 0) return;
  listening = false;
  doc.removeEventListener('keydown', onKeyDown, true);
  doc.removeEventListener('pointerdown', onPointerDown, true);
}

/** Register an element as the topmost overlay layer. Returns a disposer that removes it. */
export function registerOverlayLayer(element: HTMLElement, options: OverlayOptions = {}): Disposer {
  const layer: OverlayLayer = { element, options };
  stack.push(layer);
  ensureListeners(element.ownerDocument);
  return () => {
    const i = stack.indexOf(layer);
    if (i >= 0) stack.splice(i, 1);
    releaseListeners(element.ownerDocument);
  };
}

export function isTopOverlay(element: HTMLElement): boolean {
  return topLayer()?.element === element;
}

export function getOverlayDepth(): number {
  topLayer();
  return stack.length;
}

export interface PopoverHandle {
  close(): void;
  readonly open: boolean;
}

/**
 * Show `element` as a manual popover in the top layer and register it in the
 * overlay stack. Closing is idempotent.
 */
export function openPopover(element: HTMLElement, options: OverlayOptions = {}): PopoverHandle {
  if (element.popover !== 'manual') element.popover = 'manual';
  if (!element.matches(':popover-open')) element.showPopover();
  const unregister = registerOverlayLayer(element, options);
  let open = true;
  return {
    get open() {
      return open;
    },
    close() {
      if (!open) return;
      open = false;
      unregister();
      if (element.matches(':popover-open')) element.hidePopover();
    },
  };
}
