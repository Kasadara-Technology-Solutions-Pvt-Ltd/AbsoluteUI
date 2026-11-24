/**
 * Fieldset (R13-8). Enhances a native <fieldset> that groups related controls (an
 * address, a date of birth, contact preferences) with the AbsoluteUI legend, help
 * text, required marker, and a group-level error message. The fieldset keeps its
 * own controls; the native element provides the group semantics and `disabled`.
 */
import { configurationError, defineComponentConfig, getMessage, registerMessages, DisposableGroup } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { applyVisuallyHidden } from '@absoluteui/utilities';
import { FieldChrome, setDescribedBy } from '../internal/field.js';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- only the inherited locale is configurable
export interface FieldsetConfig {}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    fieldset: FieldsetConfig & { locale: string };
  }
}

export const fieldsetConfig = defineComponentConfig<FieldsetConfig, 'locale'>('fieldset', {}, ['locale']);

registerMessages('fieldset', 'en', {
  // The group role cannot carry aria-required, so required state is spoken with the legend.
  required: '(required)',
});

export interface FieldsetIcons {
  error: IconRef;
}

export interface FieldsetOptions {
  /** Visible legend: the group's accessible name. */
  legend: string;
  /** Visually hide the legend (it stays the accessible name). */
  hideLegend?: boolean;
  /** Help text for the whole group, referenced by aria-describedby. */
  description?: string;
  /** Shows the required marker and adds "(required)" to the spoken legend. */
  required?: boolean;
  /** Sets the native `disabled` attribute (disables every control inside); unset leaves it alone. */
  disabled?: boolean;
  /** Group-level error message (empty or null hides it). */
  error?: string | null;
  locale?: string;
  icons?: Partial<FieldsetIcons>;
}

const FOCUSABLE = 'input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export class Fieldset {
  readonly element: HTMLFieldSetElement;
  #options: FieldsetOptions;
  readonly #chrome: FieldChrome;
  readonly #requiredText: HTMLSpanElement;
  readonly #ownDescribedBy: string[];
  /** A legend the page provided, removed while enhanced and restored on destroy. */
  readonly #ownLegend: HTMLLegendElement | null;
  readonly #group = new DisposableGroup();

  /** Enhance an existing <fieldset>; its controls stay in place. */
  static enhance(element: HTMLFieldSetElement, options: FieldsetOptions): Fieldset {
    return new Fieldset(element, options);
  }

  private constructor(element: HTMLFieldSetElement, options: FieldsetOptions) {
    if (!(element instanceof HTMLFieldSetElement)) {
      throw configurationError('FIELDSET_HOST', 'Fieldset requires a native <fieldset> element.', { component: 'fieldset', property: 'element', expected: 'HTMLFieldSetElement' });
    }
    Fieldset.#assert(options);
    this.element = element;
    this.#options = { ...options };
    const doc = element.ownerDocument;
    this.#chrome = new FieldChrome(doc, 'legend', 'aui-fieldset');
    this.#requiredText = doc.createElement('span');
    applyVisuallyHidden(this.#requiredText);
    this.#chrome.label.append(this.#requiredText);
    this.#ownDescribedBy = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    this.#ownLegend = element.querySelector(':scope > legend');
    // Render first: invalid options (including config and icons) throw before the fieldset is touched.
    this.#render();
    this.#ownLegend?.remove();
    element.classList.add('aui-fieldset');
    element.prepend(this.#chrome.label, this.#chrome.description, this.#chrome.error);
    this.#group.add(fieldsetConfig.subscribe(() => {
      this.#render();
    }));
  }

  get options(): Readonly<FieldsetOptions> {
    return this.#options;
  }

  /** The rendered legend element. */
  get legend(): HTMLLegendElement {
    return this.#chrome.label as HTMLLegendElement;
  }

  /** Move focus to the first enabled control in the group (for Error Summary `focus`). */
  focus(): void {
    for (const el of this.element.querySelectorAll<HTMLElement>(FOCUSABLE)) {
      if (el.matches(':disabled') || el.getClientRects().length === 0) continue;
      el.focus();
      return;
    }
  }

  update(options: Partial<FieldsetOptions>): void {
    const next = { ...this.#options, ...options };
    Fieldset.#assert(next);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#render();
    } catch (error) {
      this.#options = previous;
      this.#render();
      throw error;
    }
  }

  destroy(): void {
    this.#group.dispose();
    this.#chrome.label.remove();
    this.#chrome.description.remove();
    this.#chrome.error.remove();
    if (this.#ownLegend) this.element.prepend(this.#ownLegend);
    setDescribedBy(this.element, this.#ownDescribedBy);
    this.element.classList.remove('aui-fieldset', 'aui-fieldset--invalid');
  }

  static #assert(options: FieldsetOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('FIELDSET_OPTIONS', 'Invalid fieldset options.', { component: 'fieldset', property: `fieldset.${property}`, expected });
    };
    const legend: unknown = options.legend;
    if (typeof legend !== 'string' || legend.trim() === '') fail('legend', 'non-empty string');
    if (options.description !== undefined && typeof options.description !== 'string') fail('description', 'string');
    if (options.error != null && typeof options.error !== 'string') fail('error', 'string | null');
    for (const flag of ['hideLegend', 'required', 'disabled'] as const) {
      if (options[flag] !== undefined && typeof options[flag] !== 'boolean') fail(flag, 'boolean');
    }
  }

  #render(): void {
    const o = this.#options;
    // Everything that can throw (config, messages, icons) runs before the fieldset is touched.
    const { locale } = fieldsetConfig.resolve(o.locale === undefined ? {} : { locale: o.locale });
    const required = o.required ?? false;
    const requiredText = required ? ` ${getMessage('fieldset', 'required', {}, locale)}` : '';
    const message = o.error ?? '';
    // An icon override is checked even while no error shows, so a typo fails at once.
    if (o.icons?.error !== undefined && message === '') renderIcon(o.icons.error, { doc: this.element.ownerDocument });
    this.#chrome.render({ label: o.legend, hideLabel: o.hideLegend, required, description: o.description });
    this.#chrome.setError(message, o.icons?.error ?? 'alert-circle');
    if (this.#requiredText.textContent !== requiredText) this.#requiredText.textContent = requiredText;
    this.#requiredText.hidden = !required;
    if (o.disabled !== undefined) this.element.disabled = o.disabled;
    this.element.classList.toggle('aui-fieldset--invalid', message !== '');
    setDescribedBy(this.element, this.#chrome.describedBy(), this.#ownDescribedBy);
  }
}
