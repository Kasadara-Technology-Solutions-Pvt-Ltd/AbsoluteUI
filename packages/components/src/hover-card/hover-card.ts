/**
 * Hover Card (SPEC section 18.13). A rich, non-modal preview shown while a trigger (usually
 * a link) is hovered or has keyboard focus. It meets WCAG 1.4.13 (Content on Hover or
 * Focus): dismissible with Escape, hoverable (the pointer can move onto the card), and
 * persistent until the pointer or focus leaves both trigger and card. The card is
 * inserted right after the trigger, so Tab moves from the trigger into interactive
 * card content and then on to the page; focus inside the card keeps it open. It never
 * opens on touch (a tap follows the link), and only one hover card is visible at a
 * time. Hover cards are supplementary: never put essential information or actions only
 * in a hover card.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, validators, type Disposer } from '@absoluteui/core';
import { addAriaReference, autoPosition, focusElement, openPopover, removeAriaReference, shouldAnimate, type Placement, type PopoverHandle } from '@absoluteui/utilities';

const PLACEMENTS = [
  'top', 'top-start', 'top-end',
  'bottom', 'bottom-start', 'bottom-end',
  'left', 'left-start', 'left-end',
  'right', 'right-start', 'right-end',
] as const satisfies readonly Placement[];

export interface HoverCardConfig {
  placement: Placement;
  showDelay: number;
  hideDelay: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    hoverCard: HoverCardConfig & { direction: 'ltr' | 'rtl' };
  }
}

export const hoverCardConfig = defineComponentConfig<HoverCardConfig, 'direction'>(
  'hoverCard',
  {
    placement: { default: 'bottom', expected: 'Placement', validate: validators.oneOf(PLACEMENTS) },
    showDelay: { default: 600, expected: 'integer 0..5000 (ms)', validate: validators.integerInRange(0, 5000) },
    hideDelay: { default: 300, expected: 'integer 0..5000 (ms)', validate: validators.integerInRange(0, 5000) },
  },
  ['direction'],
);

export type HoverCardCloseReason = 'escape' | 'pointer-leave' | 'focus-out' | 'outside-pointer' | 'programmatic';

export interface HoverCardCloseDetail {
  reason: HoverCardCloseReason;
}

export interface HoverCardOptions extends Partial<HoverCardConfig> {
  /** Card content. Strings are rendered as text, never parsed as HTML (section 14.5). */
  content: Node | string;
  /**
   * The trigger references the card with aria-describedby, so screen-reader users hear
   * the preview text on focus. Default true; set false for long or highly interactive cards.
   */
  describe?: boolean;
  direction?: 'ltr' | 'rtl';
}

/** Gap between trigger and card, px. */
const OFFSET = 8;

/** Only one hover card is visible at a time (per module instance). */
const shared: { visible: HoverCard | null } = { visible: null };

export class HoverCard {
  /** The card (`div.aui-hover-card`). */
  readonly element: HTMLDivElement;
  readonly trigger: HTMLElement;
  #options: HoverCardOptions;
  readonly #doc: Document;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  #stopOutsidePointer: Disposer | null = null;
  #showTimer: ReturnType<typeof setTimeout> | undefined;
  #hideTimer: ReturnType<typeof setTimeout> | undefined;
  #pointerInside = false;
  /** Dismissed with Escape: stays hidden until the pointer or focus leaves and returns. */
  #dismissed = false;
  /** Focus is being returned to the trigger by this card. */
  #restoring = false;
  readonly #group = new DisposableGroup();

  static create(trigger: HTMLElement, options: HoverCardOptions): HoverCard {
    return new HoverCard(trigger, options);
  }

  private constructor(trigger: HTMLElement, options: HoverCardOptions) {
    if (!(trigger instanceof HTMLElement) || !trigger.isConnected || !trigger.parentNode) {
      throw configurationError('HOVER_CARD_TRIGGER', 'Hover card requires a connected trigger element.', {
        component: 'hover-card',
        property: 'hoverCard.trigger',
        expected: 'connected HTMLElement (a link or button)',
      });
    }
    this.trigger = trigger;
    this.#doc = trigger.ownerDocument;
    this.#options = { ...options };
    this.#assertOptions(this.#options);
    this.#config();

    const el = this.#doc.createElement('div');
    el.className = 'aui-hover-card';
    el.id = createId('aui-hover-card');
    el.popover = 'manual';
    this.element = el;
    this.#renderContent();

    if (this.#describes()) addAriaReference(trigger, 'aria-describedby', el.id);
    // Right after the trigger: sequential focus continues from the trigger into the card.
    trigger.after(el);

    const g = this.#group;
    g.listen(trigger, 'pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      this.#pointerInside = true;
      this.#scheduleShow();
    });
    g.listen(trigger, 'pointerleave', () => {
      this.#pointerInside = false;
      if (!this.#popover) this.#dismissed = false;
      this.#cancelShow();
      this.#scheduleHide();
    });
    g.listen(el, 'pointerenter', () => {
      this.#pointerInside = true;
      this.#cancelHide();
    });
    g.listen(el, 'pointerleave', () => {
      this.#pointerInside = false;
      this.#scheduleHide();
    });
    g.listen(trigger, 'focusin', () => {
      if (this.#restoring || !trigger.matches(':focus-visible')) return;
      this.#cancelHide();
      this.#scheduleShow();
    });
    const onFocusOut = (event: FocusEvent): void => {
      const next = event.relatedTarget;
      if (next instanceof Node && (el.contains(next) || trigger.contains(next))) return;
      this.#dismissed = false;
      this.#cancelShow();
      if (!this.#pointerInside) this.#hide('focus-out');
    };
    g.listen(trigger, 'focusout', onFocusOut);
    g.listen(el, 'focusout', onFocusOut);
    g.add(hoverCardConfig.subscribe(() => {
      if (this.#popover) this.#position();
    }));
  }

  get isOpen(): boolean {
    return this.#popover !== null;
  }

  get options(): Readonly<HoverCardOptions> {
    return this.#options;
  }

  /** Show immediately (hides any other visible hover card). */
  show(): void {
    this.#dismissed = false;
    this.#cancelShow();
    this.#cancelHide();
    this.#show();
  }

  /** Hide immediately. */
  hide(): void {
    this.#hide('programmatic');
  }

  update(options: Partial<HoverCardOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    const previous = this.#options;
    const described = this.#describes();
    this.#options = next;
    try {
      this.#config();
    } catch (error) {
      this.#options = previous;
      throw error;
    }
    if (described !== this.#describes()) {
      if (described) removeAriaReference(this.trigger, 'aria-describedby', this.element.id);
      else addAriaReference(this.trigger, 'aria-describedby', this.element.id);
    }
    if ('content' in options) this.#renderContent();
    if (this.#popover) this.#position();
  }

  destroy(): void {
    this.#hide('programmatic');
    this.#group.dispose();
    if (this.#describes()) removeAriaReference(this.trigger, 'aria-describedby', this.element.id);
    this.element.remove();
  }

  #describes(): boolean {
    return this.#options.describe ?? true;
  }

  #config(): Readonly<HoverCardConfig & { direction: 'ltr' | 'rtl' }> {
    const o = this.#options;
    return hoverCardConfig.resolve({
      ...(o.placement === undefined ? {} : { placement: o.placement }),
      ...(o.showDelay === undefined ? {} : { showDelay: o.showDelay }),
      ...(o.hideDelay === undefined ? {} : { hideDelay: o.hideDelay }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #assertOptions(options: HoverCardOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('HOVER_CARD_OPTIONS', 'Invalid hover card options.', { component: 'hover-card', property: `hoverCard.${property}`, expected });
    };
    const content: unknown = options.content;
    if (typeof content !== 'string' && !(content instanceof Node)) fail('content', 'Node | string');
    if (typeof content === 'string' && content.trim() === '') fail('content', 'non-empty string or a Node');
    const describe: unknown = options.describe;
    if (describe !== undefined && typeof describe !== 'boolean') fail('describe', 'boolean');
  }

  /** Content is inserted only at construction and when `update()` passes `content`. */
  #renderContent(): void {
    const c = this.#options.content;
    this.element.replaceChildren(typeof c === 'string' ? this.#doc.createTextNode(c) : c);
  }

  #scheduleShow(): void {
    this.#cancelHide();
    if (this.#dismissed || this.#popover || this.#showTimer !== undefined) return;
    const delay = this.#config().showDelay;
    if (delay === 0) {
      this.#show();
      return;
    }
    this.#showTimer = setTimeout(() => {
      this.#showTimer = undefined;
      this.#show();
    }, delay);
  }

  #scheduleHide(): void {
    if (!this.#popover || this.#hideTimer !== undefined) return;
    // Focus inside the card or on the trigger keeps it open (keyboard users).
    if (this.#focusWithin()) return;
    // Always asynchronous so a direct move from the trigger onto the card keeps it open.
    this.#hideTimer = setTimeout(() => {
      this.#hideTimer = undefined;
      if (!this.#pointerInside && !this.#focusWithin()) this.#hide('pointer-leave');
    }, this.#config().hideDelay);
  }

  #focusWithin(): boolean {
    const active = this.#doc.activeElement;
    if (!active) return false;
    if (this.element.contains(active)) return true;
    return this.trigger.contains(active) && this.trigger.matches(':focus-visible');
  }

  #cancelShow(): void {
    clearTimeout(this.#showTimer);
    this.#showTimer = undefined;
  }

  #cancelHide(): void {
    clearTimeout(this.#hideTimer);
    this.#hideTimer = undefined;
  }

  #show(): void {
    if (this.#popover) return;
    // Replaced by another card: focus inside the old card moves to its trigger (never lost).
    if (shared.visible && shared.visible !== this) shared.visible.#hide('programmatic');
    shared.visible = this;
    const el = this.element;
    el.classList.toggle('aui-hover-card--static', !shouldAnimate());
    this.#popover = openPopover(el, {
      // Outside presses are handled below so the card never shadows the overlay beneath it.
      dismissOnOutsidePointer: false,
      onDismiss: (reason) => {
        if (reason === 'escape') this.#hide('escape');
      },
    });
    const win = this.#doc.defaultView ?? window;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && (el.contains(target) || this.trigger.contains(target))) return;
      this.#hide('outside-pointer');
    };
    // Window capture runs before the overlay stack's document listener.
    win.addEventListener('pointerdown', onPointerDown, true);
    this.#stopOutsidePointer = () => {
      win.removeEventListener('pointerdown', onPointerDown, true);
    };
    this.#position();
    emit(el, 'aui-open', null, { bubbles: false });
  }

  #hide(reason: HoverCardCloseReason): void {
    this.#cancelShow();
    this.#cancelHide();
    if (!this.#popover) return;
    const el = this.element;
    // Escape from inside the card returns focus to the trigger so it is not lost.
    const hadFocus = el.contains(this.#doc.activeElement);
    this.#stopOutsidePointer?.();
    this.#stopOutsidePointer = null;
    this.#stopPosition?.();
    this.#stopPosition = null;
    this.#popover.close();
    this.#popover = null;
    this.#pointerInside = false;
    if (shared.visible === this) shared.visible = null;
    if (reason === 'escape') this.#dismissed = true;
    if (hadFocus && (reason === 'escape' || reason === 'programmatic')) {
      // Returning focus must not show the card again (focusin on the trigger).
      this.#restoring = true;
      focusElement(this.trigger);
      this.#restoring = false;
    }
    emit(el, 'aui-close', { reason } satisfies HoverCardCloseDetail, { bubbles: false });
  }

  #position(): void {
    this.#stopPosition?.();
    const config = this.#config();
    this.#stopPosition = autoPosition(this.trigger, this.element, { placement: config.placement, offset: OFFSET, direction: config.direction });
  }
}
