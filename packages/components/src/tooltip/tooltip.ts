/**
 * Tooltip (SPEC section 18.15). A short text hint for a trigger, meeting WCAG 1.4.13
 * (Content on Hover or Focus): dismissible with Escape without moving focus,
 * hoverable (the pointer can move onto the tooltip), and persistent while the
 * trigger is hovered or focused. It shows after a delay on pointer hover and
 * immediately on keyboard focus, never on touch, and only one tooltip is visible
 * at a time. The tooltip is never focusable; the trigger references it through
 * aria-describedby (or aria-labelledby for icon-only controls).
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, validators, type Disposer } from '@absoluteui/core';
import { addAriaReference, autoPosition, openPopover, removeAriaReference, shouldAnimate, type Placement, type PopoverHandle } from '@absoluteui/utilities';

export type TooltipRelation = 'description' | 'label';

const PLACEMENTS = [
  'top', 'top-start', 'top-end',
  'bottom', 'bottom-start', 'bottom-end',
  'left', 'left-start', 'left-end',
  'right', 'right-start', 'right-end',
] as const satisfies readonly Placement[];

/** Gap between trigger and tooltip, px. */
const OFFSET = 6;

export interface TooltipConfig {
  placement: Placement;
  showDelay: number;
  hideDelay: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    tooltip: TooltipConfig & { direction: 'ltr' | 'rtl' };
  }
}

export const tooltipConfig = defineComponentConfig<TooltipConfig, 'direction'>(
  'tooltip',
  {
    placement: { default: 'top', expected: 'Placement', validate: validators.oneOf(PLACEMENTS) },
    showDelay: { default: 500, expected: 'integer 0..5000 (ms)', validate: validators.integerInRange(0, 5000) },
    hideDelay: { default: 100, expected: 'integer 0..5000 (ms)', validate: validators.integerInRange(0, 5000) },
  },
  ['direction'],
);

export interface TooltipOptions extends Partial<TooltipConfig> {
  /** Tooltip text (text only, never parsed as HTML). */
  content: string;
  /**
   * `description` (default): the trigger gets aria-describedby.
   * `label`: the trigger gets aria-labelledby; use for icon-only controls.
   */
  relation?: TooltipRelation;
  direction?: 'ltr' | 'rtl';
}

const RELATION_ATTRIBUTE = { description: 'aria-describedby', label: 'aria-labelledby' } as const;

/** Only one tooltip is visible at a time (per module instance). */
const shared: { visible: Tooltip | null } = { visible: null };

export class Tooltip {
  /** The tooltip (`div.aui-tooltip[role=tooltip]`). */
  readonly element: HTMLDivElement;
  readonly trigger: HTMLElement;
  #options: TooltipOptions;
  readonly #doc: Document;
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  #stopOutsidePointer: Disposer | null = null;
  #showTimer: ReturnType<typeof setTimeout> | undefined;
  #hideTimer: ReturnType<typeof setTimeout> | undefined;
  /** Shown because the trigger has keyboard focus: pointer leave does not hide it. */
  #focused = false;
  readonly #group = new DisposableGroup();

  static create(trigger: HTMLElement, options: TooltipOptions): Tooltip {
    return new Tooltip(trigger, options);
  }

  private constructor(trigger: HTMLElement, options: TooltipOptions) {
    if (!(trigger instanceof HTMLElement) || !trigger.isConnected) {
      throw configurationError('TOOLTIP_TRIGGER', 'Tooltip requires a connected trigger element.', {
        component: 'tooltip',
        property: 'tooltip.trigger',
        expected: 'connected HTMLElement',
      });
    }
    this.trigger = trigger;
    this.#doc = trigger.ownerDocument;
    this.#options = { ...options };
    this.#assertOptions(this.#options);
    this.#config();

    const el = this.#doc.createElement('div');
    el.className = 'aui-tooltip';
    el.id = createId('aui-tooltip');
    el.popover = 'manual';
    el.setAttribute('role', 'tooltip');
    this.element = el;
    this.#render();

    addAriaReference(trigger, RELATION_ATTRIBUTE[this.#relation()], el.id);
    // Inside a modal <dialog> everything outside it is inert (not hoverable), so the
    // tooltip joins the dialog; otherwise it lives at the end of the body.
    (trigger.closest('dialog') ?? this.#doc.body).append(el);

    const g = this.#group;
    g.listen(trigger, 'pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      this.#cancelHide();
      if (this.#popover || this.#showTimer !== undefined) return;
      const delay = this.#config().showDelay;
      if (delay === 0) this.#show();
      else this.#showTimer = setTimeout(() => {
        this.#showTimer = undefined;
        this.#show();
      }, delay);
    });
    g.listen(trigger, 'pointerleave', () => {
      this.#cancelShow();
      if (!this.#focused) this.#scheduleHide();
    });
    // Hoverable: moving onto the tooltip keeps it open.
    g.listen(el, 'pointerenter', () => {
      this.#cancelHide();
    });
    g.listen(el, 'pointerleave', () => {
      if (!this.#focused) this.#scheduleHide();
    });
    g.listen(trigger, 'focusin', () => {
      if (!trigger.matches(':focus-visible')) return;
      this.#cancelShow();
      this.#cancelHide();
      this.#focused = true;
      this.#show();
    });
    g.listen(trigger, 'focusout', () => {
      this.#focused = false;
      this.#cancelShow();
      this.hide();
    });
    g.add(tooltipConfig.subscribe(() => {
      if (this.#popover) this.#position();
    }));
  }

  get isVisible(): boolean {
    return this.#popover !== null;
  }

  get options(): Readonly<TooltipOptions> {
    return this.#options;
  }

  /** Show immediately (hides any other visible tooltip). */
  show(): void {
    this.#cancelShow();
    this.#cancelHide();
    this.#show();
  }

  /** Hide immediately. */
  hide(): void {
    this.#cancelShow();
    this.#cancelHide();
    if (!this.#popover) return;
    this.#stopOutsidePointer?.();
    this.#stopOutsidePointer = null;
    this.#stopPosition?.();
    this.#stopPosition = null;
    this.#popover.close();
    this.#popover = null;
    if (shared.visible === this) shared.visible = null;
    emit(this.element, 'aui-close', null, { bubbles: false });
  }

  update(options: Partial<TooltipOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    const previous = this.#options;
    const previousRelation = this.#relation();
    this.#options = next;
    try {
      this.#config();
    } catch (error) {
      this.#options = previous;
      throw error;
    }
    const relation = this.#relation();
    if (relation !== previousRelation) {
      removeAriaReference(this.trigger, RELATION_ATTRIBUTE[previousRelation], this.element.id);
      addAriaReference(this.trigger, RELATION_ATTRIBUTE[relation], this.element.id);
    }
    this.#render();
    if (this.#popover) this.#position();
  }

  destroy(): void {
    this.hide();
    this.#group.dispose();
    removeAriaReference(this.trigger, RELATION_ATTRIBUTE[this.#relation()], this.element.id);
    this.element.remove();
  }

  #relation(): TooltipRelation {
    return this.#options.relation ?? 'description';
  }

  #config(): Readonly<TooltipConfig & { direction: 'ltr' | 'rtl' }> {
    const o = this.#options;
    return tooltipConfig.resolve({
      ...(o.placement === undefined ? {} : { placement: o.placement }),
      ...(o.showDelay === undefined ? {} : { showDelay: o.showDelay }),
      ...(o.hideDelay === undefined ? {} : { hideDelay: o.hideDelay }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #assertOptions(options: TooltipOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('TOOLTIP_OPTIONS', 'Invalid tooltip options.', { component: 'tooltip', property: `tooltip.${property}`, expected });
    };
    const content: unknown = options.content;
    if (typeof content !== 'string' || content.trim() === '') fail('content', 'non-empty string');
    const relation: unknown = options.relation;
    if (relation !== undefined && relation !== 'description' && relation !== 'label') fail('relation', '"description" | "label"');
  }

  #show(): void {
    if (this.#popover) return;
    if (shared.visible && shared.visible !== this) shared.visible.hide();
    shared.visible = this;
    const el = this.element;
    el.classList.toggle('aui-tooltip--static', !shouldAnimate());
    this.#popover = openPopover(el, {
      // Escape is consumed only while a tooltip is visible (it is then the top layer).
      dismissOnOutsidePointer: false,
      onDismiss: (reason) => {
        if (reason === 'escape') this.hide();
      },
    });
    // The tooltip does not take part in outside-pointer dismissal, but while it is the
    // top layer it would shadow the overlay below (for example an enclosing Popover).
    // Hide it in the window capture phase, before the overlay stack's document listener.
    const win = this.#doc.defaultView ?? window;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && (el.contains(target) || this.trigger.contains(target))) return;
      this.hide();
    };
    win.addEventListener('pointerdown', onPointerDown, true);
    this.#stopOutsidePointer = () => {
      win.removeEventListener('pointerdown', onPointerDown, true);
    };
    this.#position();
    emit(el, 'aui-open', null, { bubbles: false });
  }

  #scheduleHide(): void {
    if (!this.#popover || this.#hideTimer !== undefined) return;
    // Always asynchronous so a direct move from the trigger onto the tooltip keeps it open.
    this.#hideTimer = setTimeout(() => {
      this.#hideTimer = undefined;
      this.hide();
    }, this.#config().hideDelay);
  }

  #cancelShow(): void {
    clearTimeout(this.#showTimer);
    this.#showTimer = undefined;
  }

  #cancelHide(): void {
    clearTimeout(this.#hideTimer);
    this.#hideTimer = undefined;
  }

  #position(): void {
    this.#stopPosition?.();
    const config = this.#config();
    this.#stopPosition = autoPosition(this.trigger, this.element, { placement: config.placement, offset: OFFSET, direction: config.direction, constrainHeight: false });
  }

  #render(): void {
    this.element.textContent = this.#options.content;
  }
}
