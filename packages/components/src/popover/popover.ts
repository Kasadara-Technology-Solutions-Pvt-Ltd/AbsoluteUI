/**
 * Popover (SPEC section 18.14). A non-modal dialog anchored to a trigger: WAI-ARIA APG
 * Disclosure (the trigger) plus a non-modal dialog (the popup). The popup is
 * inserted immediately after the trigger so sequential focus continues from the
 * trigger into the popup and on to the rest of the page, and renders in the top
 * layer through the Popover API. Escape and outside-pointer dismissal go through
 * the shared overlay stack, so only the topmost overlay responds (a popover inside
 * a Dialog closes before the dialog does).
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
import { autoPosition, focusElement, focusFirst, openPopover, shouldAnimate, type Placement, type PopoverHandle } from '@absoluteui/utilities';
import { Button } from '../button/button.js';

export type PopoverInitialFocus = 'first' | 'container' | 'none';

const PLACEMENTS = [
  'top', 'top-start', 'top-end',
  'bottom', 'bottom-start', 'bottom-end',
  'left', 'left-start', 'left-end',
  'right', 'right-start', 'right-end',
] as const satisfies readonly Placement[];

export interface PopoverConfig {
  placement: Placement;
  offset: number;
  closeOnEscape: boolean;
  closeOnOutsidePointer: boolean;
  initialFocus: PopoverInitialFocus;
  showCloseButton: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    popover: PopoverConfig & { direction: 'ltr' | 'rtl' };
  }
}

export const popoverConfig = defineComponentConfig<PopoverConfig, 'direction'>(
  'popover',
  {
    placement: { default: 'bottom-start', expected: 'Placement', validate: validators.oneOf(PLACEMENTS) },
    offset: { default: 8, expected: 'number 0..64', validate: validators.numberInRange(0, 64) },
    closeOnEscape: { default: true, expected: 'boolean', validate: validators.isBoolean },
    closeOnOutsidePointer: { default: true, expected: 'boolean', validate: validators.isBoolean },
    initialFocus: { default: 'first', expected: '"first" | "container" | "none"', validate: validators.oneOf(['first', 'container', 'none'] as const) },
    showCloseButton: { default: false, expected: 'boolean', validate: validators.isBoolean },
  },
  ['direction'],
);

registerMessages('popover', 'en', { close: 'Close' });

export type PopoverCloseReason = 'escape' | 'outside-pointer' | 'focus-out' | 'trigger' | 'close-button' | 'programmatic';

export interface PopoverCloseDetail {
  reason: PopoverCloseReason;
}

export interface PopoverIcons {
  close: IconRef;
}

export interface PopoverOptions extends Partial<PopoverConfig> {
  /** Popup content. Strings are rendered as text, never parsed as HTML (section 14.5). */
  content: Node | string;
  /** Visible heading; names the popup through aria-labelledby. */
  title?: string;
  /** Accessible name (aria-label) when there is no title. */
  label?: string;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<PopoverIcons>;
}

export class Popover {
  /** The popup (`div.aui-popover[role=dialog]`). */
  readonly element: HTMLDivElement;
  /** Consumer content container. */
  readonly body: HTMLDivElement;
  readonly trigger: HTMLElement;
  #options: PopoverOptions;
  readonly #doc: Document;
  readonly #header: HTMLDivElement;
  readonly #title: HTMLHeadingElement;
  #closeButton: Button | null = null;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  readonly #group = new DisposableGroup();

  static create(trigger: HTMLElement, options: PopoverOptions): Popover {
    return new Popover(trigger, options);
  }

  private constructor(trigger: HTMLElement, options: PopoverOptions) {
    if (!(trigger instanceof HTMLElement) || !trigger.isConnected) {
      throw configurationError('POPOVER_TRIGGER', 'Popover requires a connected trigger element.', {
        component: 'popover',
        property: 'popover.trigger',
        expected: 'connected HTMLElement (a <button>)',
      });
    }
    this.trigger = trigger;
    this.#doc = trigger.ownerDocument;
    this.#options = { ...options };
    this.#assertOptions(this.#options);
    // Validates instance config values before anything is rendered.
    this.#config();

    const doc = this.#doc;
    const el = doc.createElement('div');
    el.className = 'aui-popover';
    el.id = createId('aui-popover');
    // Manual popover from the start, otherwise it renders inline before the first open.
    el.popover = 'manual';
    el.setAttribute('role', 'dialog');
    // Focusable container for initialFocus: 'container' and for clicks on non-interactive content.
    el.tabIndex = -1;
    this.element = el;

    this.#header = doc.createElement('div');
    this.#header.className = 'aui-popover__header';
    this.#title = doc.createElement('h2');
    this.#title.className = 'aui-popover__title';
    this.#title.id = createId('aui-popover-title');
    this.#header.append(this.#title);

    this.body = doc.createElement('div');
    this.body.className = 'aui-popover__body';
    el.append(this.#header, this.body);

    this.#render(true);

    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', el.id);
    // Immediately after the trigger: Tab moves from the trigger into the popup, then onward.
    trigger.after(el);

    this.#group.listen(trigger, 'click', () => {
      if (this.#popover) this.#requestClose('trigger');
      else this.open();
    });
    // Light dismiss: focus moving to an element outside both the popup and the trigger.
    const onFocusOut = (event: FocusEvent): void => {
      const next = event.relatedTarget;
      if (!this.#popover || !(next instanceof Node)) return;
      if (el.contains(next) || trigger.contains(next)) return;
      this.#requestClose('focus-out');
    };
    this.#group.listen(el, 'focusout', onFocusOut);
    this.#group.listen(trigger, 'focusout', onFocusOut);
    this.#group.add(popoverConfig.subscribe(() => {
      this.#render();
    }));
  }

  get isOpen(): boolean {
    return this.#popover !== null;
  }

  get options(): Readonly<PopoverOptions> {
    return this.#options;
  }

  update(options: Partial<PopoverOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#config();
    } catch (error) {
      this.#options = previous;
      throw error;
    }
    this.#render('content' in options);
  }

  open(): void {
    if (this.#popover) return;
    const el = this.element;
    el.classList.toggle('aui-popover--static', !shouldAnimate());
    this.#popover = openPopover(el, {
      inside: [this.trigger],
      onDismiss: (reason) => {
        // Always consume Escape while topmost (so an enclosing Dialog does not close);
        // the configuration decides whether the popover actually closes.
        if (reason === 'escape' && this.#config().closeOnEscape) this.#requestClose('escape');
        else if (reason === 'outside-pointer' && this.#config().closeOnOutsidePointer) this.#requestClose('outside-pointer');
      },
    });
    this.#position();
    this.trigger.setAttribute('aria-expanded', 'true');
    const focus = this.#config().initialFocus;
    if (focus === 'first') {
      if (!focusFirst(el, { preventScroll: true })) focusElement(el, { preventScroll: true });
    } else if (focus === 'container') {
      focusElement(el, { preventScroll: true });
    }
    emit(el, 'aui-open', null, { bubbles: false });
  }

  /** Close programmatically. Programmatic closes are not cancelable. */
  close(): void {
    if (!this.#popover) return;
    this.#finishClose('programmatic');
  }

  toggle(): void {
    if (this.#popover) this.close();
    else this.open();
  }

  destroy(): void {
    if (this.#popover) this.#finishClose('programmatic');
    this.#group.dispose();
    this.#closeButton?.destroy();
    this.element.remove();
    this.trigger.removeAttribute('aria-haspopup');
    this.trigger.removeAttribute('aria-expanded');
    this.trigger.removeAttribute('aria-controls');
  }

  #config(): Readonly<PopoverConfig & { direction: 'ltr' | 'rtl' }> {
    const o = this.#options;
    return popoverConfig.resolve({
      ...(o.placement === undefined ? {} : { placement: o.placement }),
      ...(o.offset === undefined ? {} : { offset: o.offset }),
      ...(o.closeOnEscape === undefined ? {} : { closeOnEscape: o.closeOnEscape }),
      ...(o.closeOnOutsidePointer === undefined ? {} : { closeOnOutsidePointer: o.closeOnOutsidePointer }),
      ...(o.initialFocus === undefined ? {} : { initialFocus: o.initialFocus }),
      ...(o.showCloseButton === undefined ? {} : { showCloseButton: o.showCloseButton }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #assertOptions(options: PopoverOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('POPOVER_OPTIONS', 'Invalid popover options.', { component: 'popover', property: `popover.${property}`, expected });
    };
    const content: unknown = options.content;
    if (typeof content !== 'string' && !(content instanceof Node)) fail('content', 'Node | string');
    if (options.title !== undefined && typeof options.title !== 'string') fail('title', 'string');
    if (options.label !== undefined && typeof options.label !== 'string') fail('label', 'string');
    const hasTitle = (options.title ?? '').trim() !== '';
    const hasLabel = (options.label ?? '').trim() !== '';
    if (!hasTitle && !hasLabel) fail('title', 'non-empty title or label (accessible name)');
  }

  #position(): void {
    this.#stopPosition?.();
    const config = this.#config();
    this.#stopPosition = autoPosition(this.trigger, this.element, { placement: config.placement, offset: config.offset, direction: config.direction });
  }

  /** User-initiated close: emits cancelable `aui-cancel` first. */
  #requestClose(reason: PopoverCloseReason): void {
    const proceed = emit(this.element, 'aui-cancel', { reason } satisfies PopoverCloseDetail, { cancelable: true, bubbles: false });
    if (proceed) this.#finishClose(reason);
  }

  #finishClose(reason: PopoverCloseReason): void {
    const el = this.element;
    const hadFocus = el.contains(this.#doc.activeElement);
    this.#stopPosition?.();
    this.#stopPosition = null;
    this.#popover?.close();
    this.#popover = null;
    this.trigger.setAttribute('aria-expanded', 'false');
    // Escape and the close button always return focus; other closes only rescue focus
    // that would otherwise be lost with the hidden popup. Outside pointer and focus-out
    // leave focus where the user put it.
    if (reason === 'escape' || reason === 'close-button' || (hadFocus && (reason === 'programmatic' || reason === 'trigger'))) {
      focusElement(this.trigger);
    }
    emit(el, 'aui-close', { reason } satisfies PopoverCloseDetail, { bubbles: false });
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
    const title = (o.title ?? '').trim();

    this.#title.textContent = title;
    this.#title.hidden = title === '';
    if (title) {
      el.setAttribute('aria-labelledby', this.#title.id);
      el.removeAttribute('aria-label');
    } else {
      el.removeAttribute('aria-labelledby');
      el.setAttribute('aria-label', o.label ?? '');
    }

    if (withContent) this.body.replaceChildren(typeof o.content === 'string' ? this.#doc.createTextNode(o.content) : o.content);

    const label = getMessage('popover', 'close');
    const icon = o.icons?.close ?? 'close';
    if (config.showCloseButton) {
      if (this.#closeButton) {
        this.#closeButton.update({ label, icon });
      } else {
        this.#closeButton = Button.create({ variant: 'ghost', size: 'sm', icon, label }, this.#doc);
        this.#closeButton.element.classList.add('aui-popover__close');
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
      if (hadFocus) focusElement(el);
    }
    this.#header.hidden = title === '' && !this.#closeButton;

    if (this.#popover) this.#position();
  }
}
