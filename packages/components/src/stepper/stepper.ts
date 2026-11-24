/**
 * Stepper (SPEC section 18.12). A progress indicator for multi-step flows, rendered as
 * navigation: a labelled <nav> with an ordered list of steps. Reachable steps are
 * links (when they have an href) or buttons, reached with Tab; the current step
 * carries `aria-current="step"`; unreachable steps are plain text. In linear mode a
 * step after the current one is reachable only when every step before it is complete.
 * Activation emits a cancelable `aui-navigate`, so a consumer can guard the move and
 * drive its own panels from `aui-change`. Step status (complete, error) is data owned
 * by the consumer; the stepper never infers completion.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { isPlainClick, isSafeHref } from '../internal/href.js';

export type StepperOrientation = 'horizontal' | 'vertical';

export interface StepperConfig {
  orientation: StepperOrientation;
  /** Steps after the current one are reachable only when all steps before them are complete. */
  linear: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    stepper: StepperConfig & { direction: Direction };
  }
}

export const stepperConfig = defineComponentConfig<StepperConfig, 'direction'>(
  'stepper',
  {
    orientation: { default: 'horizontal', expected: '"horizontal" | "vertical"', validate: validators.oneOf(['horizontal', 'vertical'] as const) },
    linear: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['direction'],
);

registerMessages('stepper', 'en', {
  complete: 'Completed',
  error: 'Error',
  optional: 'Optional',
});

export type StepperStepStatus = 'complete' | 'error';
/** Resolved state of a step. */
export type StepperStepState = 'complete' | 'error' | 'current' | 'upcoming';

export interface StepperStep {
  /** Unique, stable id; used in `value` and events. */
  id: string;
  label: string;
  /** Secondary text under the label. */
  description?: string;
  /** http(s), relative, path-absolute, or fragment URL: the step renders as a link. */
  href?: string;
  /** Consumer-owned status. The current step is always shown as current. */
  status?: StepperStepStatus;
  /** Shows a visible "Optional" hint. Does not change reachability. */
  optional?: boolean;
  /** Never reachable (rendered as text). */
  disabled?: boolean;
}

export interface StepperIcons {
  complete: IconRef;
  error: IconRef;
}

export interface StepperOptions extends Partial<StepperConfig> {
  /** Accessible name of the <nav> (required), e.g. "Checkout progress". */
  label: string;
  steps: readonly StepperStep[];
  /** Current step id. Default: the first step. */
  value?: string;
  direction?: Direction;
  icons?: Partial<StepperIcons>;
}

export interface StepperNavigateDetail {
  id: string;
  index: number;
  step: StepperStep;
  /** Current step id before the move. */
  previous: string;
}

export interface StepperChangeDetail {
  value: string;
  previous: string;
}

/** Not a type guard on purpose: narrowing a typed readonly array through Array.isArray yields any[]. */
function isNonEmptyList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export class Stepper {
  readonly host: HTMLElement;
  readonly nav: HTMLElement;
  #options: StepperOptions;
  #value: string;
  readonly #doc: Document;
  readonly #list: HTMLOListElement;
  /** Step ids in rendered order (maps a focused control back to its step). */
  #renderedIds: string[] = [];
  readonly #group = new DisposableGroup();

  /** Render a stepper into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: StepperOptions): Stepper {
    return new Stepper(host, options);
  }

  private constructor(host: HTMLElement, options: StepperOptions) {
    this.#doc = host.ownerDocument;
    this.#assertOptions(options);
    this.host = host;
    this.#options = { ...options };
    this.#value = options.value ?? options.steps[0]?.id ?? '';

    this.nav = this.#doc.createElement('nav');
    this.nav.className = 'aui-stepper__nav';
    this.#list = this.#doc.createElement('ol');
    this.#list.className = 'aui-stepper__list';
    this.nav.append(this.#list);
    host.classList.add('aui-stepper');
    host.replaceChildren(this.nav);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#group.listen(this.#list, 'click', (event) => {
      this.#onClick(event);
    });
    this.#group.add(stepperConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** Current step id. */
  get value(): string {
    return this.#value;
  }

  get options(): Readonly<StepperOptions> {
    return this.#options;
  }

  /** Resolved state of a step, or null for an unknown id. */
  state(id: string): StepperStepState | null {
    const index = this.#options.steps.findIndex((s) => s.id === id);
    return index < 0 ? null : this.#stateAt(index);
  }

  /** Whether the user can activate the step in the current state. */
  isReachable(id: string): boolean {
    const index = this.#options.steps.findIndex((s) => s.id === id);
    return index >= 0 && this.#reachable(index);
  }

  /** Make a step current programmatically (no events, no reachability check). */
  select(id: string): void {
    if (!this.#options.steps.some((s) => s.id === id)) this.#fail('value', 'id of an existing step');
    this.#value = id;
    this.#render();
  }

  update(options: Partial<StepperOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    if (options.value !== undefined) this.#value = options.value;
    else if (!next.steps.some((s) => s.id === this.#value)) this.#value = next.steps[0]?.id ?? '';
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-stepper', 'aui-stepper--horizontal', 'aui-stepper--vertical');
  }

  #config(options: StepperOptions = this.#options): Readonly<StepperConfig & { direction: Direction }> {
    return stepperConfig.resolve({
      ...(options.orientation === undefined ? {} : { orientation: options.orientation }),
      ...(options.linear === undefined ? {} : { linear: options.linear }),
      ...(options.direction === undefined ? {} : { direction: options.direction }),
    });
  }

  #fail(property: string, expected: string): never {
    throw configurationError('STEPPER_OPTIONS', 'Invalid stepper options.', { component: 'stepper', property: `stepper.${property}`, expected });
  }

  #assertOptions(options: StepperOptions): void {
    if (typeof options.label !== 'string' || options.label.trim() === '') this.#fail('label', 'non-empty string (accessible name)');
    if (!isNonEmptyList(options.steps)) this.#fail('steps', 'non-empty array of steps');
    const ids = new Set<string>();
    for (const step of options.steps) {
      if (typeof step.id !== 'string' || step.id === '') this.#fail('steps.id', 'non-empty string');
      if (ids.has(step.id)) this.#fail('steps.id', 'unique ids');
      ids.add(step.id);
      if (typeof step.label !== 'string' || step.label.trim() === '') this.#fail('steps.label', 'non-empty string');
      const status: unknown = step.status;
      if (status !== undefined && status !== 'complete' && status !== 'error') this.#fail('steps.status', '"complete" | "error"');
      // The href value itself is never echoed into the error (it may carry user data).
      if (step.href !== undefined && (typeof step.href !== 'string' || !isSafeHref(step.href, this.#doc.baseURI))) this.#fail('steps.href', 'http(s), relative, path-absolute, or fragment URL');
    }
    if (options.value !== undefined && !ids.has(options.value)) this.#fail('value', 'id of an existing step');
    // Resolving validates orientation, linear, and direction.
    this.#config(options);
  }

  #currentIndex(): number {
    return this.#options.steps.findIndex((s) => s.id === this.#value);
  }

  #stateAt(index: number): StepperStepState {
    if (index === this.#currentIndex()) return 'current';
    return this.#options.steps[index]?.status ?? 'upcoming';
  }

  #reachable(index: number): boolean {
    const steps = this.#options.steps;
    const current = this.#currentIndex();
    if (index === current || steps[index]?.disabled === true) return false;
    if (!this.#config().linear || index < current) return true;
    return steps.slice(0, index).every((s) => s.status === 'complete');
  }

  #onClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>('.aui-stepper__control');
    if (!control || !(control instanceof HTMLAnchorElement || control instanceof HTMLButtonElement)) return;
    // Modified clicks on links (new tab/window, download) stay native and are not reported.
    if (control instanceof HTMLAnchorElement && !isPlainClick(event)) return;
    const index = Number(control.dataset.index);
    const step = this.#options.steps[index];
    if (!step || !this.#reachable(index)) return;
    const previous = this.#value;
    const proceed = emit(this.host, 'aui-navigate', { id: step.id, index, step, previous } satisfies StepperNavigateDetail, { cancelable: true });
    if (!proceed) {
      event.preventDefault();
      return;
    }
    this.#value = step.id;
    this.#render();
    emit(this.host, 'aui-change', { value: step.id, previous } satisfies StepperChangeDetail);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const doc = this.#doc;
    const vertical = config.orientation === 'vertical';
    const active = doc.activeElement;
    const focused = active instanceof HTMLElement && this.#list.contains(active) ? active.closest<HTMLElement>('.aui-stepper__control')?.dataset.index : undefined;
    const focusedId = focused === undefined ? undefined : this.#renderedIds[Number(focused)];
    this.host.classList.toggle('aui-stepper--horizontal', !vertical);
    this.host.classList.toggle('aui-stepper--vertical', vertical);
    this.nav.setAttribute('aria-label', o.label);
    // Explicit RTL only; otherwise the document direction is inherited (logical CSS).
    if (config.direction === 'rtl') this.nav.dir = 'rtl';
    else this.nav.removeAttribute('dir');

    const rows = o.steps.map((step, index) => {
      const state = this.#stateAt(index);
      const reachable = this.#reachable(index);
      const li = doc.createElement('li');
      li.className = 'aui-stepper__step';
      li.dataset.state = state;
      if (step.disabled) li.dataset.disabled = 'true';
      if (reachable) li.dataset.reachable = 'true';

      const tag = reachable ? (step.href === undefined ? 'button' : 'a') : 'span';
      const control = doc.createElement(tag);
      control.className = 'aui-stepper__control';
      control.dataset.index = String(index);
      if (control instanceof HTMLButtonElement) control.type = 'button';
      if (control instanceof HTMLAnchorElement && step.href !== undefined) control.href = step.href;
      if (state === 'current') control.setAttribute('aria-current', 'step');

      const indicator = doc.createElement('span');
      indicator.className = 'aui-stepper__indicator';
      indicator.setAttribute('aria-hidden', 'true');
      if (state === 'complete') indicator.append(renderIcon(o.icons?.complete ?? 'check', { doc }));
      else if (state === 'error') indicator.append(renderIcon(o.icons?.error ?? 'alert-circle', { doc }));
      else indicator.textContent = String(index + 1);

      const text = doc.createElement('span');
      text.className = 'aui-stepper__text';
      const label = doc.createElement('span');
      label.className = 'aui-stepper__label';
      label.textContent = step.label;
      text.append(label);
      if (step.optional) {
        const optional = doc.createElement('span');
        optional.className = 'aui-stepper__optional';
        optional.textContent = getMessage('stepper', 'optional');
        text.append(optional);
      }
      if (step.description) {
        const description = doc.createElement('span');
        description.className = 'aui-stepper__description';
        description.textContent = step.description;
        text.append(description);
      }
      control.append(indicator, text);
      // Complete and error states are conveyed as text, not by color or icon alone (WCAG 1.4.1).
      if (state === 'complete' || state === 'error') {
        const status = doc.createElement('span');
        status.className = 'aui-stepper__status';
        status.textContent = getMessage('stepper', state);
        control.append(status);
      }
      li.append(control);
      return li;
    });
    this.#list.replaceChildren(...rows);
    this.#renderedIds = o.steps.map((st) => st.id);
    // Re-rendering replaces the controls: keep focus on the same step so it never falls to <body>.
    const index = focusedId === undefined ? -1 : o.steps.findIndex((st) => st.id === focusedId);
    const target = index < 0 ? null : this.#list.querySelector<HTMLElement>(`.aui-stepper__control[data-index="${index}"]`);
    if (target) {
      // The step may have become the (non-interactive) current step.
      if (target.localName === 'span') target.tabIndex = -1;
      target.focus();
    }
  }
}
