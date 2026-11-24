/**
 * Tour (R20 P10). Product tour and onboarding: a sequence of steps, each anchored to an
 * element of the page (or centered), with a spotlight that dims the page around the target,
 * Next, Back, Skip, and Finish, and progress ("2 of 5"). Every step is a dialog (non-modal by
 * default; `modal: true` traps focus and blocks the page). Focus moves into the step and
 * returns to where it was when the tour ends. A step whose target is missing is skipped with
 * an `aui-step-missing` event. The panel and the dimmed overlay are Popover API elements in
 * the top layer; positions are set through the CSSOM (no inline style attributes).
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators, type Disposer } from '@absoluteui/core';
import { addAriaReference, autoPosition, createFocusRestore, createFocusTrap, registerOverlayLayer, removeAriaReference, shouldAnimate, type FocusRestore, type FocusTrap, type Placement } from '@absoluteui/utilities';
import { Button } from '../button/button.js';

export interface TourConfig {
  /** Each step is a modal dialog: focus is trapped and the page is blocked. Default false. */
  modal: boolean;
  /** Escape skips the tour. Default true. */
  closeOnEscape: boolean;
  /** Show the "2 of 5" progress text. Default true. */
  showProgress: boolean;
  /** Dim the page around the target. Default true. */
  spotlight: boolean;
  /** Space between the target and the spotlight edge, px (0 to 64). Default 8. */
  spotlightPadding: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    tour: TourConfig & { locale: string };
  }
}

export const tourConfig = defineComponentConfig<TourConfig, 'locale'>(
  'tour',
  {
    modal: { default: false, expected: 'boolean', validate: validators.isBoolean },
    closeOnEscape: { default: true, expected: 'boolean', validate: validators.isBoolean },
    showProgress: { default: true, expected: 'boolean', validate: validators.isBoolean },
    spotlight: { default: true, expected: 'boolean', validate: validators.isBoolean },
    spotlightPadding: { default: 8, expected: 'number from 0 to 64', validate: validators.numberInRange(0, 64) },
  },
  ['locale'],
);

registerMessages('tour', 'en', {
  next: 'Next',
  back: 'Back',
  skip: 'Skip tour',
  finish: 'Finish',
  progress: '{current} of {total}',
});

/** Where a step points: an element, a CSS selector, a function resolving the element, or null for a centered step. */
export type TourTarget = Element | string | (() => Element | null) | null;

export interface TourStep {
  /** Unique, stable id (reported in events). */
  id: string;
  /** Step heading; names the step dialog. */
  title: string;
  /** Step text, or a Node the application owns (inserted as given). */
  content?: string | Node;
  /** The element the step points at; null or omitted centers the step without a cut-out. */
  target?: TourTarget;
  /** Panel side relative to the target. Default 'bottom'. */
  placement?: Placement;
  /** Overrides the configured spotlight padding for this step. */
  spotlightPadding?: number;
  /** Runs before the step is shown, for example to open the menu that contains the target. A rejection skips the step. */
  onBeforeShow?: (step: TourStep, index: number) => void | Promise<void>;
}

export interface TourOptions extends Partial<TourConfig> {
  steps: readonly TourStep[];
  /** Show progress dots under the content (decorative; the text carries the progress). Default false. */
  dots?: boolean;
  /** Show the Skip button. Default true. */
  skippable?: boolean;
  /** Arrow keys move between steps while focus is on the panel or its buttons. Default true. */
  keyboardNavigation?: boolean;
  locale?: string;
}

export type TourDirection = 'forward' | 'backward' | 'jump';

/** `aui-start` detail. */
export interface TourStartDetail {
  index: number;
}

/** `aui-step-change` detail. */
export interface TourStepChangeDetail {
  index: number;
  stepId: string;
  previousIndex: number | null;
  direction: TourDirection;
}

/** `aui-step-missing` detail: a step was skipped because its target is not available. */
export interface TourStepMissingDetail {
  index: number;
  stepId: string;
  reason: 'not-found' | 'hidden' | 'error';
}

/** `aui-finish` detail: `completed` is false when the tour ended because no later step could be shown. */
export interface TourFinishDetail {
  index: number;
  completed: boolean;
}

/** `aui-skip` detail. */
export interface TourSkipDetail {
  index: number;
  stepId: string;
  reason: 'skip-button' | 'escape' | 'programmatic';
}

const PLACEMENTS: readonly Placement[] = ['top', 'bottom', 'left', 'right', 'top-start', 'top-end', 'bottom-start', 'bottom-end', 'left-start', 'left-end', 'right-start', 'right-end'];

type Resolved = { ok: true; target: Element | null } | { ok: false; reason: TourStepMissingDetail['reason'] };

export class Tour {
  readonly host: HTMLElement;
  /** The step panel (role=dialog, a manual popover). */
  readonly panel: HTMLDivElement;
  #options: TourOptions;
  readonly #doc: Document;
  readonly #id = createId('aui-tour');
  readonly #overlay: HTMLDivElement;
  readonly #spotlight: HTMLDivElement;
  readonly #title: HTMLHeadingElement;
  readonly #content: HTMLDivElement;
  readonly #progress: HTMLParagraphElement;
  readonly #dots: HTMLDivElement;
  readonly #skip: Button;
  readonly #back: Button;
  readonly #next: Button;
  readonly #group = new DisposableGroup();
  #index = -1;
  #active = false;
  #target: Element | null = null;
  /** Incremented to cancel a pending step transition (hooks are async). */
  #token = 0;
  #stopPosition: Disposer | null = null;
  #unregister: Disposer | null = null;
  #trap: FocusTrap | null = null;
  #restore: FocusRestore | null = null;
  #shownContent: Node | null = null;

  /** Render into `host` (its children are replaced by the closed overlay and panel). */
  static create(host: HTMLElement, options: TourOptions): Tour {
    return new Tour(host, options);
  }

  private constructor(host: HTMLElement, options: TourOptions) {
    Tour.#assert(options, host.ownerDocument);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;

    this.#overlay = doc.createElement('div');
    this.#overlay.className = 'aui-tour__overlay';
    this.#overlay.popover = 'manual';
    this.#overlay.setAttribute('aria-hidden', 'true');
    this.#spotlight = doc.createElement('div');
    this.#spotlight.className = 'aui-tour__spotlight';
    this.#overlay.append(this.#spotlight);

    this.panel = doc.createElement('div');
    this.panel.className = 'aui-tour__panel';
    this.panel.popover = 'manual';
    this.panel.id = this.#id;
    this.panel.setAttribute('role', 'dialog');
    this.panel.tabIndex = -1;
    this.#title = doc.createElement('h2');
    this.#title.className = 'aui-tour__title';
    this.#title.id = `${this.#id}-title`;
    this.#content = doc.createElement('div');
    this.#content.className = 'aui-tour__content';
    this.#content.id = `${this.#id}-content`;
    this.#progress = doc.createElement('p');
    this.#progress.className = 'aui-tour__progress';
    this.#progress.id = `${this.#id}-progress`;
    this.#dots = doc.createElement('div');
    this.#dots.className = 'aui-tour__dots';
    this.#dots.setAttribute('aria-hidden', 'true');
    const footer = doc.createElement('div');
    footer.className = 'aui-tour__footer';
    this.#skip = Button.create({ variant: 'ghost', size: 'sm' }, doc);
    this.#skip.element.classList.add('aui-tour__skip');
    this.#back = Button.create({ variant: 'secondary', size: 'sm' }, doc);
    this.#back.element.classList.add('aui-tour__back');
    this.#next = Button.create({ variant: 'primary', size: 'sm' }, doc);
    this.#next.element.classList.add('aui-tour__next');
    const nav = doc.createElement('div');
    nav.className = 'aui-tour__nav';
    nav.append(this.#back.element, this.#next.element);
    footer.append(this.#skip.element, nav);
    this.panel.setAttribute('aria-labelledby', this.#title.id);
    this.panel.append(this.#title, this.#content, this.#progress, this.#dots, footer);

    this.#renderChrome();
    host.classList.add('aui-tour');
    host.replaceChildren(this.#overlay, this.panel);
    this.#bind();
    this.#group.add(tourConfig.subscribe(() => {
      if (this.#active) this.#renderStep();
      else this.#renderChrome();
    }));
  }

  get options(): Readonly<TourOptions> {
    return this.#options;
  }

  get steps(): readonly TourStep[] {
    return this.#options.steps;
  }

  /** True while a step is shown. */
  get active(): boolean {
    return this.#active;
  }

  /** Index of the shown step, or -1 when inactive. */
  get index(): number {
    return this.#active ? this.#index : -1;
  }

  /** The element the current step points at (null for a centered step or when inactive). */
  get target(): Element | null {
    return this.#active ? this.#target : null;
  }

  /** Start (or restart) at `index`. Resolves when the first available step is shown. */
  async start(index = 0): Promise<void> {
    this.#assertIndex(index);
    const wasActive = this.#active;
    if (!wasActive) this.#restore = createFocusRestore(this.#doc);
    const shown = await this.#show(index, 'forward', wasActive ? this.#index : null, !wasActive);
    if (!shown && !wasActive) this.#restore = null;
  }

  async next(): Promise<void> {
    if (!this.#active) return;
    if (this.#index >= this.steps.length - 1) {
      this.finish();
      return;
    }
    await this.#show(this.#index + 1, 'forward', this.#index, false);
  }

  async back(): Promise<void> {
    if (!this.#active || this.#index <= 0) return;
    await this.#show(this.#index - 1, 'backward', this.#index, false);
  }

  /** Show the step at `index` (missing targets are skipped forward). */
  async goTo(index: number): Promise<void> {
    this.#assertIndex(index);
    if (!this.#active) {
      await this.start(index);
      return;
    }
    await this.#show(index, 'jump', this.#index, false);
  }

  /** End the tour early (`aui-skip`). */
  skip(reason: TourSkipDetail['reason'] = 'programmatic'): void {
    if (!this.#active) return;
    const index = this.#index;
    const stepId = this.steps[index]?.id ?? '';
    this.#end();
    emit(this.host, 'aui-skip', { index, stepId, reason } satisfies TourSkipDetail);
  }

  /** End the tour as completed (`aui-finish`). */
  finish(): void {
    if (!this.#active) return;
    const index = this.#index;
    this.#end();
    emit(this.host, 'aui-finish', { index, completed: true } satisfies TourFinishDetail);
  }

  update(options: Partial<TourOptions>): void {
    const next = { ...this.#options, ...options };
    Tour.#assert(next, this.#doc);
    const previous = this.#options;
    this.#options = next;
    try {
      if (this.#active) {
        if (this.#index >= next.steps.length) {
          this.finish();
          return;
        }
        this.#renderStep();
      } else this.#renderChrome();
    } catch (error) {
      this.#options = previous;
      throw error;
    }
  }

  destroy(): void {
    this.#token++;
    if (this.#active) this.#end();
    this.#group.dispose();
    this.#skip.destroy();
    this.#back.destroy();
    this.#next.destroy();
    this.host.replaceChildren();
    this.host.classList.remove('aui-tour');
  }

  static #assert(o: TourOptions, doc: Document): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('TOUR_OPTIONS', 'Invalid tour options.', { component: 'tour', property: `tour.${property}`, expected });
    };
    const steps: unknown = o.steps;
    if (!Array.isArray(steps) || steps.length === 0) fail('steps', 'non-empty TourStep[]');
    const ids = new Set<string>();
    o.steps.forEach((step: unknown, i) => {
      const p = `steps[${String(i)}]`;
      if (!validators.isRecord(step)) return fail(p, 'TourStep object');
      const { id, title, content, target, placement, spotlightPadding, onBeforeShow } = step;
      if (typeof id !== 'string' || id.trim() === '') fail(`${p}.id`, 'non-empty string');
      if (typeof id === 'string' && ids.has(id)) fail(`${p}.id`, 'unique id');
      if (typeof id === 'string') ids.add(id);
      if (typeof title !== 'string' || title.trim() === '') fail(`${p}.title`, 'non-empty string');
      if (content !== undefined && typeof content !== 'string' && !(content instanceof Node)) fail(`${p}.content`, 'string or Node');
      if (target !== undefined && target !== null && typeof target !== 'function' && !(target instanceof Element)) {
        if (typeof target !== 'string' || target.trim() === '') fail(`${p}.target`, 'Element, CSS selector, () => Element | null, or null');
        else {
          try {
            doc.createDocumentFragment().querySelector(target);
          } catch {
            fail(`${p}.target`, 'a valid CSS selector');
          }
        }
      }
      if (placement !== undefined && !(typeof placement === 'string' && (PLACEMENTS as readonly string[]).includes(placement))) fail(`${p}.placement`, PLACEMENTS.join(' | '));
      if (spotlightPadding !== undefined && !(typeof spotlightPadding === 'number' && Number.isFinite(spotlightPadding) && spotlightPadding >= 0 && spotlightPadding <= 64)) fail(`${p}.spotlightPadding`, 'number from 0 to 64');
      if (onBeforeShow !== undefined && typeof onBeforeShow !== 'function') fail(`${p}.onBeforeShow`, '(step, index) => void | Promise<void>');
    });
    for (const name of ['dots', 'skippable', 'keyboardNavigation'] as const) {
      const v: unknown = o[name];
      if (v !== undefined && typeof v !== 'boolean') fail(name, 'boolean');
    }
  }

  #assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.steps.length) {
      throw configurationError('TOUR_OPTIONS', 'Invalid tour step index.', { component: 'tour', property: 'tour.index', expected: `integer from 0 to ${String(this.steps.length - 1)}` });
    }
  }

  #config(): Readonly<TourConfig & { locale: string }> {
    const o = this.#options;
    return tourConfig.resolve({
      ...(o.modal === undefined ? {} : { modal: o.modal }),
      ...(o.closeOnEscape === undefined ? {} : { closeOnEscape: o.closeOnEscape }),
      ...(o.showProgress === undefined ? {} : { showProgress: o.showProgress }),
      ...(o.spotlight === undefined ? {} : { spotlight: o.spotlight }),
      ...(o.spotlightPadding === undefined ? {} : { spotlightPadding: o.spotlightPadding }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #m(key: string, params: Readonly<Record<string, string | number>> = {}): string {
    return getMessage('tour', key, params, this.#config().locale);
  }

  /** Button labels (also before the first start, so the closed panel is complete). */
  #renderChrome(): void {
    this.#config();
    this.#skip.element.textContent = this.#m('skip');
    this.#back.element.textContent = this.#m('back');
    this.#next.element.textContent = this.#m('next');
  }

  /** Resolve a step target (after its hook). */
  async #resolve(step: TourStep, index: number): Promise<Resolved> {
    if (step.onBeforeShow) {
      try {
        await step.onBeforeShow(step, index);
      } catch {
        return { ok: false, reason: 'error' };
      }
    }
    const t = step.target;
    if (t === undefined || t === null) return { ok: true, target: null };
    let el: Element | null;
    try {
      el = typeof t === 'string' ? this.#doc.querySelector(t) : typeof t === 'function' ? t() : t;
    } catch {
      return { ok: false, reason: 'error' };
    }
    if (!(el instanceof Element) || !el.isConnected) return { ok: false, reason: 'not-found' };
    if (el.getClientRects().length === 0) return { ok: false, reason: 'hidden' };
    return { ok: true, target: el };
  }

  /**
   * Show the first available step from `index` in `direction` (backward searches down; forward
   * and jump search up). Returns whether a step is shown.
   */
  async #show(index: number, direction: TourDirection, previousIndex: number | null, starting: boolean): Promise<boolean> {
    const token = ++this.#token;
    const step = direction === 'backward' ? -1 : 1;
    for (let i = index; i >= 0 && i < this.steps.length; i += step) {
      const s = this.steps[i];
      if (!s) break;
      const resolved = await this.#resolve(s, i);
      if (token !== this.#token) return false;
      if (!resolved.ok) {
        emit(this.host, 'aui-step-missing', { index: i, stepId: s.id, reason: resolved.reason } satisfies TourStepMissingDetail);
        continue;
      }
      this.#index = i;
      this.#target = resolved.target;
      this.#open();
      this.#renderStep();
      this.#focusPanel();
      if (starting) emit(this.host, 'aui-start', { index: i } satisfies TourStartDetail);
      emit(this.host, 'aui-step-change', { index: i, stepId: s.id, previousIndex, direction } satisfies TourStepChangeDetail);
      return true;
    }
    // Nothing further can be shown: going forward ends the tour; going back keeps the current step.
    if (this.#active && direction !== 'backward') {
      const last = this.#index;
      this.#end();
      emit(this.host, 'aui-finish', { index: last, completed: false } satisfies TourFinishDetail);
    }
    return false;
  }

  /** Enter the active state: show the popovers and join the overlay stack. */
  #open(): void {
    if (this.#active) return;
    this.#active = true;
    const config = this.#config();
    this.host.classList.toggle('aui-tour--static', !shouldAnimate());
    if (config.spotlight || config.modal) this.#overlay.showPopover();
    this.panel.showPopover();
    this.#unregister = registerOverlayLayer(this.panel, {
      dismissOnOutsidePointer: false,
      // Escape always stops at the tour (topmost layer); closeOnEscape is read per press, so it is dynamic.
      onDismiss: (reason) => {
        if (reason === 'escape' && this.#config().closeOnEscape) this.skip('escape');
      },
    });
  }

  /** Modal steps trap focus; follows `modal` while active. */
  #syncTrap(modal: boolean): void {
    if (modal && this.#active && !this.#trap) {
      this.#trap = createFocusTrap(this.panel, { initialFocus: this.panel, restoreFocus: false });
      this.#trap.activate();
    } else if ((!modal || !this.#active) && this.#trap) {
      this.#trap.deactivate();
      this.#trap = null;
    }
  }

  /** Leave the active state and restore focus. */
  #end(): void {
    this.#token++;
    this.#active = false;
    this.#stopPosition?.();
    this.#stopPosition = null;
    this.#unregister?.();
    this.#unregister = null;
    this.#trap?.deactivate();
    this.#trap = null;
    this.#detachTarget();
    if (this.panel.matches(':popover-open')) this.panel.hidePopover();
    if (this.#overlay.matches(':popover-open')) this.#overlay.hidePopover();
    this.#index = -1;
    this.#target = null;
    const restore = this.#restore;
    this.#restore = null;
    restore?.restore();
  }

  #detachTarget(): void {
    const t = this.#target;
    if (t) removeAriaReference(t, 'aria-describedby', this.#content.id);
    this.host.classList.remove('aui-tour--centered');
  }

  #focusPanel(): void {
    this.panel.focus({ preventScroll: true });
  }

  #renderStep(): void {
    const config = this.#config();
    const step = this.steps[this.#index];
    if (!step) return;
    const total = this.steps.length;
    this.#renderChrome();

    this.#title.textContent = step.title;
    const content = step.content;
    if (content instanceof Node) {
      if (this.#shownContent !== content) this.#content.replaceChildren(content);
    } else this.#content.textContent = content ?? '';
    this.#shownContent = content instanceof Node ? content : null;
    this.#content.hidden = content === undefined || content === '';
    const describedBy = [this.#content.hidden ? null : this.#content.id, config.showProgress ? this.#progress.id : null].filter((v): v is string => v !== null);
    if (describedBy.length > 0) this.panel.setAttribute('aria-describedby', describedBy.join(' '));
    else this.panel.removeAttribute('aria-describedby');

    this.#progress.textContent = this.#m('progress', { current: this.#index + 1, total });
    this.#progress.hidden = !config.showProgress;
    this.#renderDots(total);

    const last = this.#index === total - 1;
    this.#back.element.hidden = this.#index === 0;
    this.#next.element.textContent = this.#m(last ? 'finish' : 'next');
    this.#next.element.classList.toggle('aui-tour__finish', last);
    this.#skip.element.hidden = this.#options.skippable === false || last;

    if (config.modal) this.panel.setAttribute('aria-modal', 'true');
    else this.panel.removeAttribute('aria-modal');
    this.host.classList.toggle('aui-tour--modal', config.modal);
    this.host.classList.toggle('aui-tour--no-spotlight', !config.spotlight);
    if (this.#active) {
      this.#syncTrap(config.modal);
      // A disconnected host (removed without destroy) cannot show popovers; only the content is updated.
      if ((config.spotlight || config.modal) && this.#overlay.isConnected && !this.#overlay.matches(':popover-open')) {
        // The overlay must stay under the panel in the top layer: re-show the panel after it.
        const hadFocus = this.panel.contains(this.#doc.activeElement);
        this.#overlay.showPopover();
        this.panel.hidePopover();
        this.panel.showPopover();
        if (hadFocus) this.#focusPanel();
      }
      if (!config.spotlight && !config.modal && this.#overlay.matches(':popover-open')) this.#overlay.hidePopover();
    }
    this.#place(step, config);
  }

  #renderDots(total: number): void {
    const show = this.#options.dots === true;
    this.#dots.hidden = !show;
    if (!show) return;
    if (this.#dots.childElementCount !== total) {
      this.#dots.replaceChildren(...Array.from({ length: total }, () => {
        const d = this.#doc.createElement('span');
        d.className = 'aui-tour__dot';
        return d;
      }));
    }
    for (const [i, d] of [...this.#dots.children].entries()) d.classList.toggle('aui-tour__dot--active', i === this.#index);
  }

  /** Position the panel next to the target (or center it) and keep the spotlight on the target. */
  #place(step: TourStep, config: Readonly<TourConfig>): void {
    this.#stopPosition?.();
    this.#stopPosition = null;
    // Re-attach the description reference to the current target only.
    for (const el of this.#doc.querySelectorAll(`[aria-describedby~="${this.#content.id}"]`)) {
      if (el !== this.#target) removeAriaReference(el, 'aria-describedby', this.#content.id);
    }
    const target = this.#target;
    const panelStyle = this.panel.style;
    const spot = this.#spotlight.style;
    if (target === null) {
      this.host.classList.add('aui-tour--centered');
      for (const p of ['position', 'margin', 'inset', 'left', 'top', '--aui-available-height']) panelStyle.removeProperty(p);
      delete this.panel.dataset.placement;
      spot.setProperty('--_aui-tour-x', '50vw');
      spot.setProperty('--_aui-tour-y', '50vh');
      spot.setProperty('--_aui-tour-w', '0px');
      spot.setProperty('--_aui-tour-h', '0px');
      return;
    }
    this.host.classList.remove('aui-tour--centered');
    if (!this.#content.hidden) addAriaReference(target, 'aria-describedby', this.#content.id);
    const pad = step.spotlightPadding ?? config.spotlightPadding;
    const updateSpotlight = (): void => {
      const r = target.getBoundingClientRect();
      spot.setProperty('--_aui-tour-x', `${String(r.left - pad)}px`);
      spot.setProperty('--_aui-tour-y', `${String(r.top - pad)}px`);
      spot.setProperty('--_aui-tour-w', `${String(r.width + 2 * pad)}px`);
      spot.setProperty('--_aui-tour-h', `${String(r.height + 2 * pad)}px`);
    };
    if (!this.#inView(target)) {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: shouldAnimate() ? 'smooth' : 'auto' });
    }
    const direction = getComputedStyle(this.host).direction === 'rtl' ? 'rtl' : 'ltr';
    this.#stopPosition = autoPosition(target, this.panel, {
      placement: this.#fitPlacement(target, step.placement ?? 'bottom', pad + 8),
      offset: pad + 8,
      direction,
      onPosition: updateSpotlight,
    });
  }

  /**
   * A left or right placement needs room beside the target; when neither side has it (a
   * full-width target), the panel goes below the target (autoPosition flips it above when
   * there is no room below) instead of off-screen.
   */
  #fitPlacement(target: Element, preferred: Placement, offset: number): Placement {
    const side = preferred.split('-')[0];
    const win = this.#doc.defaultView;
    if ((side !== 'left' && side !== 'right') || !win) return preferred;
    const r = target.getBoundingClientRect();
    // 8: autoPosition's default distance from the viewport edge.
    const need = this.panel.getBoundingClientRect().width + offset + 8;
    if (r.left >= need || win.innerWidth - r.right >= need) return preferred;
    return 'bottom';
  }

  #inView(el: Element): boolean {
    const r = el.getBoundingClientRect();
    const win = this.#doc.defaultView;
    if (!win) return true;
    return r.top >= 0 && r.left >= 0 && r.bottom <= win.innerHeight && r.right <= win.innerWidth;
  }

  #bind(): void {
    const g = this.#group;
    g.listen(this.#skip.element, 'click', () => {
      this.skip('skip-button');
    });
    g.listen(this.#back.element, 'click', () => {
      void this.back();
    });
    g.listen(this.#next.element, 'click', () => {
      void this.next();
    });
    g.listen(this.panel, 'keydown', (event) => {
      if (!this.#active || this.#options.keyboardNavigation === false) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      // Only on the panel itself or its buttons, never inside application content (inputs).
      const t = event.target;
      if (!(t === this.panel || (t instanceof HTMLButtonElement && !this.#content.contains(t)))) return;
      const rtl = getComputedStyle(this.panel).direction === 'rtl';
      const forward = (event.key === 'ArrowRight') !== rtl;
      event.preventDefault();
      if (forward) void this.next();
      else void this.back();
    });
  }
}
