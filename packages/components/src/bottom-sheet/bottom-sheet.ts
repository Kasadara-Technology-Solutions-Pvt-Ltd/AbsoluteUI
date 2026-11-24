/**
 * Bottom Sheet (SPEC section 18.13). A panel attached to the bottom edge, built on native
 * <dialog> like Dialog and Drawer: modal sheets use showModal() (top layer, inert
 * background, backdrop, scroll lock); non-modal sheets use show(). Optional snap points
 * set the height as fractions of the viewport. The drag handle resizes the sheet and,
 * dragged down, dismisses it; it is never the only way: with two or more snap points the
 * handle is a keyboard-operable slider (arrow keys, Home, End) and a single click cycles
 * the heights (WCAG 2.5.7), and Escape and the close button dismiss. Close reasons and
 * cancelable close events mirror Drawer; Escape goes through the shared overlay stack.
 */
import {
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  getMessage,
  registerMessages,
  validators,
  type Disposer,
} from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import {
  createFocusRestore,
  trackPointerFocus,
  focusElement,
  focusFirst,
  lockScroll,
  registerOverlayLayer,
  shouldAnimate,
  trackPointerDrag,
  type DragMove,
  type FocusRestore,
  type OverlayOptions,
  type PointerDrag,
} from '@absoluteui/utilities';
import { Button } from '../button/button.js';

export interface BottomSheetConfig {
  closeOnEscape: boolean;
  closeOnBackdrop: boolean;
  showCloseButton: boolean;
  /** Dragging the handle down past the threshold requests close (reason 'drag'). */
  closeOnDragDown: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    bottomSheet: BottomSheetConfig;
  }
}

export const bottomSheetConfig = defineComponentConfig<BottomSheetConfig>('bottomSheet', {
  closeOnEscape: { default: true, expected: 'boolean', validate: validators.isBoolean },
  closeOnBackdrop: { default: true, expected: 'boolean', validate: validators.isBoolean },
  showCloseButton: { default: true, expected: 'boolean', validate: validators.isBoolean },
  closeOnDragDown: { default: true, expected: 'boolean', validate: validators.isBoolean },
});

registerMessages('bottomSheet', 'en', {
  close: 'Close',
  handle: 'Sheet height',
  height: '{percent}% of screen height',
});

export type BottomSheetCloseReason = 'escape' | 'backdrop' | 'close-button' | 'drag' | 'programmatic';

export interface BottomSheetIcons {
  close: IconRef;
}

export interface BottomSheetOptions extends Partial<BottomSheetConfig> {
  /** Required accessible name, rendered as the heading (text only). */
  title: string;
  /** Optional description, referenced by aria-describedby (text only). */
  description?: string;
  /** Body content. Strings are rendered as text, never parsed as HTML (section 14.5). */
  content?: Node | string;
  /**
   * Heights as fractions of the viewport height, ascending, each in (0, 1]. Without snap
   * points the sheet fits its content (capped at 90% of the viewport).
   */
  snapPoints?: readonly number[];
  /** Index into `snapPoints` used when the sheet opens. Default 0 (the lowest). */
  snap?: number;
  /** Init-only. `true` (default): showModal(). `false`: show(); the page stays interactive. */
  modal?: boolean;
  icons?: Partial<BottomSheetIcons>;
}

/** Options accepted by `update()`; `modal` is fixed at construction. */
export type BottomSheetUpdateOptions = Partial<Omit<BottomSheetOptions, 'modal'>>;

export interface BottomSheetCloseDetail {
  reason: BottomSheetCloseReason;
}

export interface BottomSheetSnapChangeDetail {
  index: number;
  /** Fraction of the viewport height. */
  value: number;
}

/** Drag-down distance (px, or 25% of the sheet height when smaller) that dismisses. */
const DISMISS_DISTANCE = 120;

export class BottomSheet {
  readonly element: HTMLDialogElement;
  /** Consumer content area. */
  readonly body: HTMLDivElement;
  /** The drag handle strip (a slider with two or more snap points). */
  readonly handle: HTMLDivElement;
  #options: BottomSheetOptions;
  readonly #modal: boolean;
  readonly #doc: Document;
  readonly #title: HTMLHeadingElement;
  readonly #description: HTMLParagraphElement;
  readonly #header: HTMLElement;
  #closeButton: Button | null = null;
  #snap = 0;
  #restore: FocusRestore | null = null;
  #unlockScroll: Disposer | null = null;
  #unregisterLayer: Disposer | null = null;
  #drag: PointerDrag | null = null;
  #dragStartHeight = 0;
  #opened = false;
  readonly #group = new DisposableGroup();

  static create(options: BottomSheetOptions, doc: Document = document): BottomSheet {
    return new BottomSheet(options, doc);
  }

  private constructor(options: BottomSheetOptions, doc: Document) {
    this.#doc = doc;
    // Safari does not focus a clicked button; remember it so closing returns focus there.
    trackPointerFocus(doc);
    this.#options = { ...options };
    this.#assertOptions(this.#options);
    this.#config();
    if (options.modal !== undefined && typeof options.modal !== 'boolean') this.#fail('modal', 'boolean');
    this.#modal = options.modal ?? true;
    this.#snap = options.snap ?? 0;

    const el = doc.createElement('dialog');
    el.className = 'aui-bottom-sheet';
    el.classList.add(this.#modal ? 'aui-bottom-sheet--modal' : 'aui-bottom-sheet--non-modal');
    this.element = el;
    const titleId = createId('aui-bottom-sheet-title');

    this.#header = doc.createElement('header');
    this.#header.className = 'aui-bottom-sheet__header';
    this.#title = doc.createElement('h2');
    this.#title.className = 'aui-bottom-sheet__title';
    this.#title.id = titleId;
    this.#header.append(this.#title);

    this.handle = doc.createElement('div');
    this.handle.className = 'aui-bottom-sheet__handle';
    const grip = doc.createElement('span');
    grip.className = 'aui-bottom-sheet__grip';
    this.handle.append(grip);

    this.#description = doc.createElement('p');
    this.#description.className = 'aui-bottom-sheet__description';
    this.#description.id = createId('aui-bottom-sheet-desc');

    this.body = doc.createElement('div');
    this.body.className = 'aui-bottom-sheet__body';

    // DOM order header, handle: the native initial focus lands on the close button, not the
    // handle; CSS shows the handle strip first.
    el.append(this.#header, this.handle, this.#description, this.body);
    el.setAttribute('aria-labelledby', titleId);
    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render(true);

    const g = this.#group;
    g.listen(el, 'keydown', (event) => {
      // The overlay stack handles Escape when this sheet is topmost. Always block the
      // native close request (Chrome ignores cancel-event prevention on repeated presses).
      if (event.key === 'Escape' && !event.defaultPrevented) event.preventDefault();
    });
    g.listen(el, 'cancel', (event) => {
      event.preventDefault();
    });
    g.listen(el, 'click', (event) => {
      if (!this.#modal || event.target !== el || !this.#config().closeOnBackdrop) return;
      const r = el.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) this.#requestClose('backdrop');
    });
    // Native closes (e.g. <form method="dialog"> in consumer content) keep state in sync.
    g.listen(el, 'close', () => {
      if (this.#opened) this.#finishClose('programmatic');
    });
    g.listen(this.handle, 'keydown', (event) => {
      this.#onHandleKey(event);
    });
    g.listen(this.handle, 'click', () => {
      // A click without drag cycles the heights (single-pointer alternative, WCAG 2.5.7).
      const count = this.#snapPoints().length;
      if (count >= 2) this.#setSnap((this.#snap + 1) % count, true);
    });
    this.#drag = trackPointerDrag(this.handle, {
      canStart: () => this.element.open,
      onStart: () => {
        this.#dragStartHeight = el.getBoundingClientRect().height;
        el.classList.add('aui-bottom-sheet--dragging');
      },
      onMove: (move) => {
        this.#applyDrag(move);
      },
      onEnd: (move) => {
        this.#endDrag(move);
      },
      onCancel: () => {
        this.#clearDrag();
      },
    });
    g.add(() => {
      this.#drag?.dispose();
      this.#drag = null;
    });
    g.add(bottomSheetConfig.subscribe(() => {
      this.#render();
    }));
    doc.body.append(el);
  }

  get isOpen(): boolean {
    return this.element.open;
  }

  /** Whether the sheet was created modal (init-only). */
  get modal(): boolean {
    return this.#modal;
  }

  /** Current snap point index (0 without snap points). */
  get snap(): number {
    return this.#snap;
  }

  update(options: BottomSheetUpdateOptions): void {
    const next: BottomSheetOptions = { ...this.#options, ...options };
    // New snap points without a new `snap`: clamp the kept index instead of rejecting it.
    if ('snapPoints' in options && options.snap === undefined && next.snap !== undefined) {
      next.snap = Math.min(next.snap, Math.max(0, (next.snapPoints?.length ?? 1) - 1));
    }
    this.#assertOptions(next);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#config();
    } catch (error) {
      this.#options = previous;
      throw error;
    }
    if (options.snap !== undefined) this.#snap = options.snap;
    else if ('snapPoints' in options) this.#snap = Math.min(this.#snap, Math.max(0, (next.snapPoints?.length ?? 1) - 1));
    this.#render('content' in options);
  }

  /** Move to a snap point programmatically (no event). */
  snapTo(index: number): void {
    const count = this.#snapPoints().length;
    if (!Number.isInteger(index) || index < 0 || index >= Math.max(count, 1)) this.#fail('snap', 'index into snapPoints');
    this.#setSnap(index, false);
  }

  /** Open the sheet. Focus moves inside; a modal sheet also makes the background inert. */
  open(): void {
    if (this.element.open) return;
    const el = this.element;
    this.#restore = createFocusRestore(this.#doc);
    el.classList.toggle('aui-bottom-sheet--static', !shouldAnimate());
    this.#snap = this.#options.snap ?? this.#snap;
    this.#renderSnap();
    if (this.#modal) {
      this.#unlockScroll = lockScroll(this.#doc);
      el.showModal();
    } else {
      el.show();
      if (!el.contains(this.#doc.activeElement) && !focusFirst(el)) {
        el.tabIndex = -1;
        focusElement(el);
      }
    }
    this.#opened = true;
    const escapeEnabled = (): boolean => this.#config().closeOnEscape && (this.#modal || !this.#modalElsewhere());
    const layer: OverlayOptions = {
      dismissOnOutsidePointer: false,
      get dismissOnEscape() {
        return escapeEnabled();
      },
      onDismiss: (reason) => {
        if (reason === 'escape') this.#requestClose('escape');
      },
    };
    this.#unregisterLayer = registerOverlayLayer(el, layer);
    emit(el, 'aui-open', null, { bubbles: false });
  }

  /** Close programmatically. Programmatic closes are not cancelable. */
  close(): void {
    if (!this.element.open) return;
    this.#finishClose('programmatic');
  }

  destroy(): void {
    if (this.element.open) this.#finishClose('programmatic');
    this.#group.dispose();
    this.#closeButton?.destroy();
    this.element.remove();
  }

  #modalElsewhere(): boolean {
    const modal = this.#doc.querySelector(':modal');
    return modal !== null && !this.element.contains(modal);
  }

  #config(): Readonly<BottomSheetConfig> {
    const o = this.#options;
    return bottomSheetConfig.resolve({
      ...(o.closeOnEscape === undefined ? {} : { closeOnEscape: o.closeOnEscape }),
      ...(o.closeOnBackdrop === undefined ? {} : { closeOnBackdrop: o.closeOnBackdrop }),
      ...(o.showCloseButton === undefined ? {} : { showCloseButton: o.showCloseButton }),
      ...(o.closeOnDragDown === undefined ? {} : { closeOnDragDown: o.closeOnDragDown }),
    });
  }

  #fail(property: string, expected: string): never {
    throw configurationError('BOTTOM_SHEET_OPTIONS', 'Invalid bottom sheet options.', { component: 'bottom-sheet', property: `bottomSheet.${property}`, expected });
  }

  #assertOptions(options: BottomSheetOptions): void {
    if (typeof options.title !== 'string' || options.title.trim() === '') {
      throw configurationError('BOTTOM_SHEET_TITLE', 'Bottom sheet requires a non-empty title (accessible name).', {
        component: 'bottom-sheet',
        property: 'bottomSheet.title',
        expected: 'non-empty string',
      });
    }
    const content: unknown = options.content;
    if (content !== undefined && typeof content !== 'string' && !(content instanceof Node)) this.#fail('content', 'Node | string');
    const points: unknown = options.snapPoints;
    if (points !== undefined) {
      if (!Array.isArray(points)) this.#fail('snapPoints', 'ascending array of numbers in (0, 1]');
      let previous = 0;
      for (const p of points as unknown[]) {
        if (typeof p !== 'number' || !Number.isFinite(p) || p <= previous || p > 1) this.#fail('snapPoints', 'ascending array of numbers in (0, 1]');
        previous = p;
      }
    }
    const snap: unknown = options.snap;
    const count = options.snapPoints?.length ?? 0;
    if (snap !== undefined && (typeof snap !== 'number' || !Number.isInteger(snap) || snap < 0 || snap >= Math.max(count, 1))) this.#fail('snap', 'index into snapPoints');
  }

  #snapPoints(): readonly number[] {
    return this.#options.snapPoints ?? [];
  }

  /** User-initiated close: emits cancelable `aui-cancel` first. */
  #requestClose(reason: BottomSheetCloseReason): void {
    const proceed = emit(this.element, 'aui-cancel', { reason } satisfies BottomSheetCloseDetail, { cancelable: true, bubbles: false });
    if (proceed) this.#finishClose(reason);
    else this.#clearDrag();
  }

  #finishClose(reason: BottomSheetCloseReason): void {
    const el = this.element;
    const active = this.#doc.activeElement;
    // Non-modal: only return focus when it was inside the sheet.
    const restoreFocus = this.#modal || active === null || active === this.#doc.body || el.contains(active);
    this.#opened = false;
    this.#drag?.cancel();
    this.#clearDrag();
    this.#unregisterLayer?.();
    this.#unregisterLayer = null;
    if (el.open) el.close();
    this.#unlockScroll?.();
    this.#unlockScroll = null;
    if (restoreFocus) this.#restore?.restore();
    this.#restore = null;
    emit(el, 'aui-close', { reason } satisfies BottomSheetCloseDetail, { bubbles: false });
  }

  #setSnap(index: number, user: boolean): void {
    const points = this.#snapPoints();
    const value = points[index];
    if (value === undefined || index === this.#snap) {
      this.#renderSnap();
      return;
    }
    this.#snap = index;
    this.#renderSnap();
    if (user) emit(this.element, 'aui-snap-change', { index, value } satisfies BottomSheetSnapChangeDetail, { bubbles: false });
  }

  #onHandleKey(event: KeyboardEvent): void {
    const count = this.#snapPoints().length;
    if (count < 2 || event.altKey || event.ctrlKey || event.metaKey) return;
    let next: number;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
      case 'PageUp':
        next = Math.min(count - 1, this.#snap + 1);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'PageDown':
        next = Math.max(0, this.#snap - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.#setSnap(next, true);
  }

  #viewportHeight(): number {
    return this.#doc.documentElement.clientHeight || (this.#doc.defaultView?.innerHeight ?? 0);
  }

  /** Follow the pointer: grow or shrink between snap heights; below the lowest, slide down. */
  #applyDrag(move: DragMove): void {
    const el = this.element;
    const points = this.#snapPoints();
    const vh = this.#viewportHeight();
    const wanted = this.#dragStartHeight - move.dy;
    const min = points.length > 0 ? (points[0] ?? 0) * vh : this.#dragStartHeight;
    const max = points.length > 0 ? (points[points.length - 1] ?? 1) * vh : this.#dragStartHeight;
    const height = Math.min(max, Math.max(min, wanted));
    const slide = Math.max(0, min - wanted);
    if (points.length > 0) el.style.setProperty('--aui-bottom-sheet-live-height', `${Math.round(height)}px`);
    el.style.setProperty('--aui-bottom-sheet-offset', `${Math.round(slide)}px`);
  }

  #endDrag(move: DragMove): void {
    const points = this.#snapPoints();
    const vh = this.#viewportHeight();
    const wanted = this.#dragStartHeight - move.dy;
    const min = points.length > 0 ? (points[0] ?? 0) * vh : this.#dragStartHeight;
    const slide = min - wanted;
    const threshold = Math.min(DISMISS_DISTANCE, min * 0.25);
    if (slide > threshold && this.#config().closeOnDragDown) {
      this.#requestClose('drag');
      return;
    }
    this.#clearDrag();
    if (points.length < 2) return;
    // Nearest snap point by height.
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p * vh - wanted) < Math.abs((points[best] ?? 0) * vh - wanted)) best = i;
    });
    this.#setSnap(best, true);
  }

  #clearDrag(): void {
    const el = this.element;
    el.classList.remove('aui-bottom-sheet--dragging');
    el.style.removeProperty('--aui-bottom-sheet-live-height');
    el.style.removeProperty('--aui-bottom-sheet-offset');
  }

  #renderSnap(): void {
    const el = this.element;
    const handle = this.handle;
    const points = this.#snapPoints();
    const value = points[this.#snap];
    el.classList.toggle('aui-bottom-sheet--snapped', value !== undefined);
    if (value === undefined) el.style.removeProperty('--aui-bottom-sheet-snap');
    else el.style.setProperty('--aui-bottom-sheet-snap', String(value));
    if (points.length >= 2 && value !== undefined) {
      const percent = (p: number): number => Math.round(p * 100);
      handle.setAttribute('role', 'slider');
      handle.tabIndex = 0;
      handle.removeAttribute('aria-hidden');
      handle.setAttribute('aria-label', getMessage('bottomSheet', 'handle'));
      handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('aria-valuemin', String(percent(points[0] ?? value)));
      handle.setAttribute('aria-valuemax', String(percent(points[points.length - 1] ?? value)));
      handle.setAttribute('aria-valuenow', String(percent(value)));
      handle.setAttribute('aria-valuetext', getMessage('bottomSheet', 'height', { percent: percent(value) }));
    } else {
      // Decorative: dragging it only dismisses, which Escape and the close button also do.
      for (const a of ['role', 'tabindex', 'aria-label', 'aria-orientation', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) handle.removeAttribute(a);
      handle.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * `withContent`: (re)insert the content option. Only at construction and when
   * `update()` passes `content`, so consumer or framework changes to the body survive.
   */
  #render(withContent = false): void {
    const o = this.#options;
    const config = this.#config();
    this.#title.textContent = o.title;
    if (o.description) {
      this.#description.textContent = o.description;
      this.#description.hidden = false;
      this.element.setAttribute('aria-describedby', this.#description.id);
    } else {
      this.#description.textContent = '';
      this.#description.hidden = true;
      this.element.removeAttribute('aria-describedby');
    }
    if (withContent && o.content !== undefined) {
      this.body.replaceChildren(typeof o.content === 'string' ? this.#doc.createTextNode(o.content) : o.content);
    }
    const label = getMessage('bottomSheet', 'close');
    const icon = o.icons?.close ?? 'close';
    if (config.showCloseButton) {
      if (this.#closeButton) {
        this.#closeButton.update({ label, icon });
      } else {
        this.#closeButton = Button.create({ variant: 'ghost', size: 'sm', icon, label }, this.#doc);
        this.#closeButton.element.classList.add('aui-bottom-sheet__close');
        this.#closeButton.element.addEventListener('click', () => {
          this.#requestClose('close-button');
        });
        this.#header.append(this.#closeButton.element);
      }
    } else if (this.#closeButton) {
      const hadFocus = this.#doc.activeElement === this.#closeButton.element;
      this.#closeButton.destroy();
      this.#closeButton.element.remove();
      this.#closeButton = null;
      if (hadFocus) {
        this.element.tabIndex = -1;
        focusElement(this.element);
      }
    }
    this.#renderSnap();
  }
}
