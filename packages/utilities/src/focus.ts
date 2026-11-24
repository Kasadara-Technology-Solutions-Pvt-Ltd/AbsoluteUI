/**
 * Focus engine (SPEC section 13.2): focusable discovery, focus restoration, and focus trapping.
 * Native <dialog>.showModal() already makes the background inert; the trap is for
 * non-modal containers such as drawers that must contain focus.
 */
import type { Disposer } from '@absoluteui/core';

const CANDIDATES = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

function isVisible(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ visibilityProperty: true });
  return el.getClientRects().length > 0;
}

export function isFocusable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.matches(CANDIDATES)) return false;
  if (el.closest('[inert]')) return false;
  // :disabled also covers controls inside a disabled <fieldset> (excluding its first legend).
  if (el.matches(':disabled')) return false;
  return isVisible(el);
}

export function isTabbable(el: Element): el is HTMLElement {
  return isFocusable(el) && el.tabIndex >= 0;
}

/** Focusable (or tabbable) descendants in tab order. */
export function getFocusableElements(root: ParentNode, options: { tabbableOnly?: boolean } = {}): HTMLElement[] {
  const tabbableOnly = options.tabbableOnly ?? true;
  const found = Array.from(root.querySelectorAll(CANDIDATES)).filter((el): el is HTMLElement => (tabbableOnly ? isTabbable(el) : isFocusable(el)));
  if (!tabbableOnly) return found;
  // Positive tabindex first (ascending), then document order.
  const positive = found.filter((el) => el.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
  return [...positive, ...found.filter((el) => el.tabIndex === 0)];
}

export function focusElement(el: HTMLElement | null | undefined, options: FocusOptions = {}): boolean {
  if (!el?.isConnected) return false;
  el.focus({ preventScroll: options.preventScroll ?? false });
  return el.ownerDocument.activeElement === el;
}

export function focusFirst(root: ParentNode, options?: FocusOptions): boolean {
  return focusElement(getFocusableElements(root)[0], options);
}

export interface FocusRestore {
  /** Return focus to the element that was focused when the restore point was created. */
  restore(options?: FocusOptions): boolean;
}

/** Last focusable element pressed with a pointer, per document (null after a press elsewhere). */
const pressed = new WeakMap<Document, HTMLElement | null>();

function onPointerDown(event: PointerEvent): void {
  const doc = event.target instanceof Node ? event.target.ownerDocument : null;
  if (!doc) return;
  const hit = event.composedPath().find((node): node is HTMLElement => node instanceof Element && isFocusable(node));
  pressed.set(doc, hit ?? null);
}

/**
 * Remember which focusable element the user presses, so focus can return to it when the press
 * did not focus it: Safari does not focus buttons on click. Idempotent per document; components
 * that restore focus call it when created, and createFocusRestore calls it too.
 */
export function trackPointerFocus(doc: Document = document): void {
  if (pressed.has(doc)) return;
  pressed.set(doc, null);
  doc.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
}

/**
 * Capture the currently focused element so focus can be returned later (section 13.2). When
 * nothing is focused, the element last pressed with a pointer is used (see trackPointerFocus).
 */
export function createFocusRestore(doc: Document = document, fallback?: () => HTMLElement | null): FocusRestore {
  trackPointerFocus(doc);
  const active = doc.activeElement instanceof HTMLElement && doc.activeElement !== doc.body ? doc.activeElement : null;
  const previous = active ?? pressed.get(doc) ?? null;
  return {
    restore(options) {
      if (previous && isFocusable(previous) && focusElement(previous, options)) return true;
      return focusElement(fallback?.() ?? null, options);
    },
  };
}

export interface FocusTrapOptions {
  /** Element to focus on activation. Defaults to the first tabbable element, then the container. */
  initialFocus?: HTMLElement | null;
  /** Restore focus to the previously focused element on deactivate. Default: true. */
  restoreFocus?: boolean;
}

export interface FocusTrap {
  activate(): void;
  deactivate(): void;
  readonly active: boolean;
}

/** Keep keyboard focus within `container` while active. */
export function createFocusTrap(container: HTMLElement, options: FocusTrapOptions = {}): FocusTrap {
  const doc = container.ownerDocument;
  let restore: FocusRestore | null = null;
  let cleanup: Disposer | null = null;

  const focusIn = (event: FocusEvent): void => {
    const target = event.target;
    if (target instanceof Node && !container.contains(target)) {
      if (!focusFirst(container)) focusElement(container);
    }
  };
  const keyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const items = getFocusableElements(container);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
      focusElement(container);
      return;
    }
    const active = doc.activeElement;
    if (event.shiftKey && (active === first || active === container)) {
      event.preventDefault();
      focusElement(last);
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      focusElement(first);
    }
  };

  return {
    get active() {
      return cleanup !== null;
    },
    activate() {
      if (cleanup) return;
      restore = createFocusRestore(doc);
      if (!container.hasAttribute('tabindex')) container.tabIndex = -1;
      doc.addEventListener('focusin', focusIn, true);
      container.addEventListener('keydown', keyDown);
      cleanup = () => {
        doc.removeEventListener('focusin', focusIn, true);
        container.removeEventListener('keydown', keyDown);
      };
      if (!focusElement(options.initialFocus ?? null) && !focusFirst(container)) focusElement(container);
    },
    deactivate() {
      if (!cleanup) return;
      cleanup();
      cleanup = null;
      if (options.restoreFocus ?? true) restore?.restore();
    },
  };
}
