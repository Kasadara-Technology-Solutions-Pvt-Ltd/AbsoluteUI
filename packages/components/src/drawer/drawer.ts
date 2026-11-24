/**
 * Drawer (SPEC section 18, R1 overlay).
 * A panel that slides in from a screen edge, built on native <dialog>.
 * Modal drawers use showModal() (top layer, inert background, backdrop, scroll
 * lock); non-modal drawers use show() and leave the page interactive. Close
 * reasons and cancel semantics mirror Dialog. Escape is arbitrated through the
 * shared overlay stack so only the topmost overlay responds.
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
  type FocusRestore,
  type OverlayOptions,
} from '@absoluteui/utilities';
import { Button, type ButtonVariant } from '../button/button.js';

export type DrawerPlacement = 'start' | 'end' | 'top' | 'bottom';
export type DrawerSize = 'sm' | 'md' | 'lg';
/** Physical edge the drawer is attached to after resolving direction. */
export type DrawerSide = 'left' | 'right' | 'top' | 'bottom';

export interface DrawerConfig {
  placement: DrawerPlacement;
  size: DrawerSize;
  closeOnEscape: boolean;
  closeOnBackdrop: boolean;
  showCloseButton: boolean;
}

type ResolvedDrawerConfig = DrawerConfig & { direction: 'ltr' | 'rtl' };

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    drawer: DrawerConfig & { direction: 'ltr' | 'rtl' };
  }
}

export const drawerConfig = defineComponentConfig<DrawerConfig, 'direction'>(
  'drawer',
  {
    placement: { default: 'end', expected: '"start" | "end" | "top" | "bottom"', validate: validators.oneOf(['start', 'end', 'top', 'bottom'] as const) },
    size: { default: 'md', expected: '"sm" | "md" | "lg"', validate: validators.oneOf(['sm', 'md', 'lg'] as const) },
    closeOnEscape: { default: true, expected: 'boolean', validate: validators.isBoolean },
    closeOnBackdrop: { default: true, expected: 'boolean', validate: validators.isBoolean },
    showCloseButton: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['direction'],
);

registerMessages('drawer', 'en', { close: 'Close' });

export type DrawerCloseReason = 'escape' | 'backdrop' | 'close-button' | 'action' | 'programmatic';

export interface DrawerAction {
  label: string;
  /** Becomes the drawer return value. */
  value: string;
  variant?: ButtonVariant;
  /** Receives initial focus. */
  autofocus?: boolean;
}

export interface DrawerIcons {
  close: IconRef;
}

export interface DrawerOptions extends Partial<DrawerConfig> {
  /** Required accessible name, rendered as the heading (text only). */
  title: string;
  /** Optional description, referenced by aria-describedby (text only). */
  description?: string;
  /** Body content. Strings are rendered as text, never parsed as HTML (section 14.5). */
  content?: Node | string;
  actions?: readonly DrawerAction[];
  /**
   * Init-only. `true` (default): showModal(), inert background, backdrop, scroll lock.
   * `false`: show(), background stays interactive. Use only for supplementary panels.
   */
  modal?: boolean;
  /** Writing direction used to map start/end to a physical edge. Inherited from common config. */
  direction?: 'ltr' | 'rtl';
  icons?: Partial<DrawerIcons>;
}

/** Options accepted by `update()`; `modal` is fixed at construction. */
export type DrawerUpdateOptions = Partial<Omit<DrawerOptions, 'modal'>>;

export interface DrawerCloseDetail {
  returnValue: string;
  reason: DrawerCloseReason;
}

const PLACEMENTS: readonly DrawerPlacement[] = ['start', 'end', 'top', 'bottom'];

function resolveSide(placement: DrawerPlacement, direction: 'ltr' | 'rtl'): DrawerSide {
  if (placement === 'top' || placement === 'bottom') return placement;
  const startIsLeft = direction === 'ltr';
  return (placement === 'start') === startIsLeft ? 'left' : 'right';
}

export class Drawer {
  readonly element: HTMLDialogElement;
  /** Consumer content area. */
  readonly body: HTMLDivElement;
  #options: DrawerOptions;
  readonly #modal: boolean;
  readonly #doc: Document;
  readonly #title: HTMLHeadingElement;
  readonly #description: HTMLParagraphElement;
  readonly #header: HTMLElement;
  readonly #footer: HTMLElement;
  #closeButton: Button | null = null;
  #actionButtons: Button[] = [];
  #restore: FocusRestore | null = null;
  #unlockScroll: Disposer | null = null;
  #unregisterLayer: Disposer | null = null;
  #opened = false;
  readonly #group = new DisposableGroup();

  static create(options: DrawerOptions, doc: Document = document): Drawer {
    return new Drawer(options, doc);
  }

  private constructor(options: DrawerOptions, doc: Document) {
    this.#doc = doc;
    // Safari does not focus a clicked button; remember it so closing returns focus there.
    trackPointerFocus(doc);
    this.#options = { ...options };
    this.#assertOptions(this.#options);
    if (options.modal !== undefined && typeof options.modal !== 'boolean') {
      throw configurationError('DRAWER_OPTIONS', 'Invalid drawer options.', { component: 'drawer', property: 'drawer.modal', expected: 'boolean' });
    }
    this.#modal = options.modal ?? true;

    const el = doc.createElement('dialog');
    el.className = 'aui-drawer';
    el.classList.add(this.#modal ? 'aui-drawer--modal' : 'aui-drawer--non-modal');
    this.element = el;
    const titleId = createId('aui-drawer-title');
    const descriptionId = createId('aui-drawer-desc');

    this.#header = doc.createElement('header');
    this.#header.className = 'aui-drawer__header';
    this.#title = doc.createElement('h2');
    this.#title.className = 'aui-drawer__title';
    this.#title.id = titleId;
    this.#header.append(this.#title);

    this.#description = doc.createElement('p');
    this.#description.className = 'aui-drawer__description';
    this.#description.id = descriptionId;

    this.body = doc.createElement('div');
    this.body.className = 'aui-drawer__body';

    this.#footer = doc.createElement('footer');
    this.#footer.className = 'aui-drawer__footer';

    el.append(this.#header, this.#description, this.body, this.#footer);
    el.setAttribute('aria-labelledby', titleId);
    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render(true);

    this.#group.listen(el, 'keydown', (event) => {
      // The overlay stack handles Escape when this drawer is topmost. Always block the
      // native close request (Chrome ignores cancel-event prevention on repeated presses).
      if (event.key === 'Escape' && !event.defaultPrevented) event.preventDefault();
    });
    this.#group.listen(el, 'cancel', (event) => {
      event.preventDefault();
    });
    this.#group.listen(el, 'click', (event) => {
      if (!this.#modal || event.target !== el || !this.#config().closeOnBackdrop) return;
      const r = el.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) this.#requestClose('', 'backdrop');
    });
    // Native closes (e.g. <form method="dialog"> in consumer content) keep state in sync.
    this.#group.listen(el, 'close', () => {
      if (this.#opened) this.#finishClose(el.returnValue, 'action');
    });
    this.#group.add(drawerConfig.subscribe(() => {
      this.#render();
    }));
    doc.body.append(el);
  }

  get isOpen(): boolean {
    return this.element.open;
  }

  /** Whether the drawer was created modal (init-only). */
  get modal(): boolean {
    return this.#modal;
  }

  update(options: DrawerUpdateOptions): void {
    const next: DrawerOptions = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#config(next);
    this.#options = next;
    this.#render('content' in options);
  }

  /** Open the drawer. Focus moves inside; a modal drawer also makes the background inert. */
  open(): void {
    if (this.element.open) return;
    const el = this.element;
    this.#restore = createFocusRestore(this.#doc);
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
    // closeOnEscape is dynamic, so the stack reads it through a getter. A non-modal drawer
    // yields to a modal dialog opened elsewhere (it is inert behind it), so that dialog
    // handles its own Escape.
    const escapeEnabled = (): boolean => this.#config().closeOnEscape && (this.#modal || !this.#modalElsewhere());
    const layer: OverlayOptions = {
      dismissOnOutsidePointer: false,
      get dismissOnEscape() {
        return escapeEnabled();
      },
      onDismiss: (reason) => {
        if (reason === 'escape') this.#requestClose('', 'escape');
      },
    };
    this.#unregisterLayer = registerOverlayLayer(el, layer);
    emit(el, 'aui-open', null, { bubbles: false });
  }

  /** Close programmatically. Programmatic closes are not cancelable. */
  close(returnValue = ''): void {
    if (!this.element.open) return;
    this.#finishClose(returnValue, 'programmatic');
  }

  destroy(): void {
    if (this.element.open) this.#finishClose('', 'programmatic');
    this.#group.dispose();
    this.#closeButton?.destroy();
    for (const b of this.#actionButtons) b.destroy();
    this.element.remove();
  }

  #modalElsewhere(): boolean {
    const modal = this.#doc.querySelector(':modal');
    return modal !== null && !this.element.contains(modal);
  }

  #config(o: DrawerOptions = this.#options): Readonly<ResolvedDrawerConfig> {
    return drawerConfig.resolve({
      ...(o.placement === undefined ? {} : { placement: o.placement }),
      ...(o.size === undefined ? {} : { size: o.size }),
      ...(o.closeOnEscape === undefined ? {} : { closeOnEscape: o.closeOnEscape }),
      ...(o.closeOnBackdrop === undefined ? {} : { closeOnBackdrop: o.closeOnBackdrop }),
      ...(o.showCloseButton === undefined ? {} : { showCloseButton: o.showCloseButton }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #assertOptions(options: DrawerOptions): void {
    if (typeof options.title !== 'string' || options.title.trim() === '') {
      throw configurationError('DRAWER_TITLE', 'Drawer requires a non-empty title (accessible name).', {
        component: 'drawer',
        property: 'drawer.title',
        expected: 'non-empty string',
      });
    }
    const fail = (property: string, expected: string): never => {
      throw configurationError('DRAWER_OPTIONS', 'Invalid drawer options.', { component: 'drawer', property: `drawer.${property}`, expected });
    };
    const actions: unknown = options.actions;
    if (actions !== undefined && !Array.isArray(actions)) fail('actions', 'array of { label, value }');
    for (const a of options.actions ?? []) {
      if (typeof a.label !== 'string' || a.label.trim() === '' || typeof a.value !== 'string') fail('actions', 'array of { label, value }');
    }
  }

  /** User-initiated close: emits cancelable `aui-cancel` first. */
  #requestClose(returnValue: string, reason: DrawerCloseReason): void {
    const proceed = emit(this.element, 'aui-cancel', { returnValue, reason } satisfies DrawerCloseDetail, { cancelable: true, bubbles: false });
    if (proceed) this.#finishClose(returnValue, reason);
  }

  #finishClose(returnValue: string, reason: DrawerCloseReason): void {
    const el = this.element;
    const active = this.#doc.activeElement;
    // Non-modal: only return focus when it was inside the drawer, so a user working
    // in the page is not pulled back to the trigger.
    const restoreFocus = this.#modal || active === null || active === this.#doc.body || el.contains(active);
    this.#opened = false;
    this.#unregisterLayer?.();
    this.#unregisterLayer = null;
    if (el.open) el.close(returnValue);
    this.#unlockScroll?.();
    this.#unlockScroll = null;
    if (restoreFocus) this.#restore?.restore();
    this.#restore = null;
    emit(el, 'aui-close', { returnValue, reason } satisfies DrawerCloseDetail, { bubbles: false });
  }

  /**
   * `withContent`: (re)insert the content option. Only at construction and when
   * `update()` passes `content`, so consumer or framework changes to the body, and
   * DocumentFragment content, survive re-renders (regression found by the Angular adapter).
   */
  #render(withContent = false): void {
    const o = this.#options;
    const config = this.#config();
    const el = this.element;
    el.classList.remove(...PLACEMENTS.map((p) => `aui-drawer--${p}`), 'aui-drawer--sm', 'aui-drawer--md', 'aui-drawer--lg');
    el.classList.add(`aui-drawer--${config.placement}`, `aui-drawer--${config.size}`);
    el.dataset.auiSide = resolveSide(config.placement, config.direction);
    el.dir = config.direction;

    this.#title.textContent = o.title;

    if (o.description) {
      this.#description.textContent = o.description;
      this.#description.hidden = false;
      el.setAttribute('aria-describedby', this.#description.id);
    } else {
      this.#description.textContent = '';
      this.#description.hidden = true;
      el.removeAttribute('aria-describedby');
    }

    if (withContent && o.content !== undefined) {
      this.body.replaceChildren(typeof o.content === 'string' ? this.#doc.createTextNode(o.content) : o.content);
    }

    this.#closeButton?.destroy();
    this.#closeButton?.element.remove();
    this.#closeButton = null;
    if (config.showCloseButton) {
      this.#closeButton = Button.create({ variant: 'ghost', size: 'sm', icon: o.icons?.close ?? 'close', label: getMessage('drawer', 'close') }, this.#doc);
      this.#closeButton.element.classList.add('aui-drawer__close');
      this.#closeButton.element.addEventListener('click', () => {
        this.#requestClose('', 'close-button');
      });
      this.#header.append(this.#closeButton.element);
    }

    for (const b of this.#actionButtons) {
      b.destroy();
      b.element.remove();
    }
    this.#actionButtons = (o.actions ?? []).map((action) => {
      const b = Button.create({ text: action.label, variant: action.variant ?? 'secondary' }, this.#doc);
      if (action.autofocus) b.element.autofocus = true;
      b.element.addEventListener('click', () => {
        this.#requestClose(action.value, 'action');
      });
      return b;
    });
    this.#footer.replaceChildren(...this.#actionButtons.map((b) => b.element));
    this.#footer.hidden = this.#actionButtons.length === 0;

    // Keep focus inside if the focused control was removed during re-render.
    if (el.open && (this.#doc.activeElement === null || this.#doc.activeElement === this.#doc.body)) {
      focusElement(this.#actionButtons.find((b) => b.element.autofocus)?.element ?? this.#closeButton?.element ?? null);
    }
  }
}
