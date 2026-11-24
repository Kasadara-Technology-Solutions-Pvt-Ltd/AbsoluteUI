/**
 * Dialog (SPEC section 18.13, R0 reference component).
 * Built on native <dialog>.showModal(): top layer, inert background, native
 * focus containment. AbsoluteUI adds deterministic Escape/backdrop policy,
 * focus restoration, scroll lock, localization, and cancelable close events.
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
import { createFocusRestore, focusElement, lockScroll, registerOverlayLayer, trackPointerFocus, type FocusRestore } from '@absoluteui/utilities';
import { Button, type ButtonVariant } from '../button/button.js';

export type DialogSize = 'sm' | 'md' | 'lg';

export interface DialogConfig {
  closeOnEscape: boolean;
  closeOnBackdrop: boolean;
  showCloseButton: boolean;
  size: DialogSize;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    dialog: DialogConfig;
  }
}

export const dialogConfig = defineComponentConfig<DialogConfig>('dialog', {
  closeOnEscape: { default: true, expected: 'boolean', validate: validators.isBoolean },
  closeOnBackdrop: { default: false, expected: 'boolean', validate: validators.isBoolean },
  showCloseButton: { default: true, expected: 'boolean', validate: validators.isBoolean },
  size: { default: 'md', expected: '"sm" | "md" | "lg"', validate: validators.oneOf(['sm', 'md', 'lg'] as const) },
});

registerMessages('dialog', 'en', { close: 'Close' });

export type DialogCloseReason = 'escape' | 'backdrop' | 'close-button' | 'action' | 'programmatic';

export interface DialogAction {
  label: string;
  /** Becomes the dialog return value. */
  value: string;
  variant?: ButtonVariant;
  /** Receives initial focus (use for the least destructive action in alert dialogs). */
  autofocus?: boolean;
}

export interface DialogIcons {
  close: IconRef;
}

export interface DialogOptions extends Partial<DialogConfig> {
  /** Required accessible name, rendered as the heading (text only). */
  title: string;
  /** Optional description, referenced by aria-describedby (text only). */
  description?: string;
  /** Body content. Strings are rendered as text, never parsed as HTML (section 14.5). */
  content?: Node | string;
  actions?: readonly DialogAction[];
  /** `alertdialog` for urgent confirmations (section 13.4). */
  role?: 'dialog' | 'alertdialog';
  icons?: Partial<DialogIcons>;
}

export interface DialogCloseDetail {
  returnValue: string;
  reason: DialogCloseReason;
}

export class Dialog {
  readonly element: HTMLDialogElement;
  /** Consumer content area. */
  readonly body: HTMLDivElement;
  #options: DialogOptions;
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
  readonly #group = new DisposableGroup();

  static create(options: DialogOptions, doc: Document = document): Dialog {
    return new Dialog(options, doc);
  }

  private constructor(options: DialogOptions, doc: Document) {
    this.#doc = doc;
    // Safari does not focus a clicked button; remember it so closing returns focus there.
    trackPointerFocus(doc);
    this.#options = { ...options };
    this.#assertOptions(this.#options);

    const el = doc.createElement('dialog');
    el.className = 'aui-dialog';
    this.element = el;
    const titleId = createId('aui-dialog-title');
    const descriptionId = createId('aui-dialog-desc');

    this.#header = doc.createElement('header');
    this.#header.className = 'aui-dialog__header';
    this.#title = doc.createElement('h2');
    this.#title.className = 'aui-dialog__title';
    this.#title.id = titleId;
    this.#header.append(this.#title);

    this.#description = doc.createElement('p');
    this.#description.className = 'aui-dialog__description';
    this.#description.id = descriptionId;

    this.body = doc.createElement('div');
    this.body.className = 'aui-dialog__body';

    this.#footer = doc.createElement('footer');
    this.#footer.className = 'aui-dialog__footer';

    el.append(this.#header, this.#description, this.body, this.#footer);
    el.setAttribute('aria-labelledby', titleId);
    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render(true);

    this.#group.listen(el, 'keydown', (event) => {
      // Prevent the native close request entirely when Escape is disabled (Chrome
      // ignores cancel-event prevention without intervening user activation).
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        if (this.#config().closeOnEscape) this.#requestClose('', 'escape');
      }
    });
    this.#group.listen(el, 'cancel', (event) => {
      event.preventDefault();
    });
    this.#group.listen(el, 'click', (event) => {
      if (event.target !== el || !this.#config().closeOnBackdrop) return;
      const r = el.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) this.#requestClose('', 'backdrop');
    });
    // Native closes (e.g. <form method="dialog"> in consumer content) keep state in sync.
    this.#group.listen(el, 'close', () => {
      // The native close event is queued as a task: when the dialog was reopened in the
      // meantime it is open again, and this event belongs to the previous close (regression).
      if (this.#unlockScroll && !el.open) this.#finishClose(el.returnValue, 'action');
    });
    this.#group.add(dialogConfig.subscribe(() => {
      this.#render();
    }));
    doc.body.append(el);
  }

  get isOpen(): boolean {
    return this.element.open;
  }

  update(options: Partial<DialogOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    this.#render('content' in options);
  }

  /** Open as a modal dialog. Focus moves inside; background becomes inert. */
  open(): void {
    if (this.element.open) return;
    this.#restore = createFocusRestore(this.#doc);
    this.#unlockScroll = lockScroll(this.#doc);
    this.element.showModal();
    // Join the shared overlay stack so Escape reaches only the topmost overlay
    // (a popover or listbox opened inside the dialog closes first, R1).
    this.#unregisterLayer = registerOverlayLayer(this.element, {
      dismissOnOutsidePointer: false,
      onDismiss: (reason) => {
        if (reason === 'escape' && this.#config().closeOnEscape) this.#requestClose('', 'escape');
      },
    });
    emit(this.element, 'aui-open', null, { bubbles: false });
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

  #config(): Readonly<DialogConfig> {
    const o = this.#options;
    return dialogConfig.resolve({
      ...(o.closeOnEscape === undefined ? {} : { closeOnEscape: o.closeOnEscape }),
      ...(o.closeOnBackdrop === undefined ? {} : { closeOnBackdrop: o.closeOnBackdrop }),
      ...(o.showCloseButton === undefined ? {} : { showCloseButton: o.showCloseButton }),
      ...(o.size === undefined ? {} : { size: o.size }),
    });
  }

  #assertOptions(options: DialogOptions): void {
    if (typeof options.title !== 'string' || options.title.trim() === '') {
      throw configurationError('DIALOG_TITLE', 'Dialog requires a non-empty title (accessible name).', {
        component: 'dialog',
        property: 'dialog.title',
        expected: 'non-empty string',
      });
    }
  }

  /** User-initiated close: emits cancelable `aui-cancel` first. */
  #requestClose(returnValue: string, reason: DialogCloseReason): void {
    const proceed = emit(this.element, 'aui-cancel', { returnValue, reason } satisfies DialogCloseDetail, { cancelable: true, bubbles: false });
    if (proceed) this.#finishClose(returnValue, reason);
  }

  #finishClose(returnValue: string, reason: DialogCloseReason): void {
    this.#unregisterLayer?.();
    this.#unregisterLayer = null;
    if (this.element.open) this.element.close(returnValue);
    this.#unlockScroll?.();
    this.#unlockScroll = null;
    this.#restore?.restore();
    this.#restore = null;
    emit(this.element, 'aui-close', { returnValue, reason } satisfies DialogCloseDetail, { bubbles: false });
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
    el.classList.remove('aui-dialog--sm', 'aui-dialog--md', 'aui-dialog--lg');
    el.classList.add(`aui-dialog--${config.size}`);
    if (o.role === 'alertdialog') el.setAttribute('role', 'alertdialog');
    else el.removeAttribute('role');

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
      this.#closeButton = Button.create({ variant: 'ghost', size: 'sm', icon: o.icons?.close ?? 'close', label: getMessage('dialog', 'close') }, this.#doc);
      this.#closeButton.element.classList.add('aui-dialog__close');
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
    if (el.open && !el.contains(this.#doc.activeElement)) {
      focusElement(this.#actionButtons.find((b) => b.element.autofocus)?.element ?? this.#closeButton?.element ?? null);
    }
  }
}
