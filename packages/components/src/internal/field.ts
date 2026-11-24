/**
 * Shared field infrastructure (SPEC section 18.8): form-control registry, field chrome
 * (label, required indicator, help text, validation message, character counter),
 * and message-timing state. Internal: not a public subpath export.
 */
import { createId, formatNumber, getMessage, registerMessages, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
/** Minimal validity shape `Form` relies on; `FieldValidity` and `DateInputValidity` extend it. */
export interface ControlValidity {
  readonly valid: boolean;
  /** Localized message; empty when valid. */
  readonly message: string;
}

export type ValidationTiming = 'blur' | 'input' | 'submit';

export const validationTimingSpec = {
  default: 'blur' as ValidationTiming,
  expected: '"blur" | "input" | "submit"',
  validate: validators.oneOf(['blur', 'input', 'submit'] as const),
};

/**
 * Contract every AbsoluteUI form control implements so `Form` can validate,
 * serialize, reset, and navigate to it (SPEC section 18.8).
 */
export interface FormControl {
  readonly host: HTMLElement;
  /** Form field name; controls without a name are validated but not serialized. */
  readonly name: string | null;
  /** Accessible label, used by the error summary. */
  readonly label: string;
  readonly disabled: boolean;
  readonly validity: ControlValidity;
  readonly dirty: boolean;
  readonly touched: boolean;
  /** Serializable value (string, number, boolean, string[], ISO date string, or null). */
  getFormValue(): unknown;
  /** Show messages now (marks the control as submitted) and return validity. */
  reportValidity(): boolean;
  /** External error, e.g. from the server or a cross-field rule. `null` clears it. */
  setCustomError(message: string | null): void;
  /** Move focus to the control's primary focusable element. */
  focus(): void;
  /** Restore the initial value and clear dirty/touched/submitted state. */
  reset(): void;
}

const controls = new WeakMap<HTMLElement, FormControl>();

/** @internal Register a control host so `Form` can discover it. */
export function registerControl(control: FormControl): () => void {
  controls.set(control.host, control);
  control.host.dataset.auiControl = '';
  return () => {
    if (controls.get(control.host) === control) controls.delete(control.host);
    delete control.host.dataset.auiControl;
  };
}

/** The AbsoluteUI form control rendered into `host`, if any. */
export function getFormControl(host: Element): FormControl | undefined {
  return host instanceof HTMLElement ? controls.get(host) : undefined;
}

/** All registered controls inside `root`, in document order. Nested hosts are skipped. */
export function findFormControls(root: ParentNode): FormControl[] {
  const out: FormControl[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-aui-control]'))) {
    const c = controls.get(el);
    if (c) out.push(c);
  }
  return out;
}

const trackedDocs = new WeakSet<Document>();
const pressed = new WeakMap<Document, boolean>();

function trackPointer(doc: Document): void {
  if (trackedDocs.has(doc)) return;
  trackedDocs.add(doc);
  const up = (): void => {
    pressed.set(doc, false);
  };
  doc.addEventListener('pointerdown', () => {
    pressed.set(doc, true);
  }, { capture: true, passive: true });
  doc.addEventListener('pointerup', up, { capture: true, passive: true });
  doc.addEventListener('pointercancel', up, { capture: true, passive: true });
}

/** @internal Start pointer tracking early (at control construction). */
export function observePointer(doc: Document): void {
  trackPointer(doc);
}

/**
 * Mark a field touched and re-render. When focus left because the user pressed
 * a pointer elsewhere (for example on the submit button), the message is shown
 * after the pointer is released: a message appearing on mousedown shifts the
 * layout and makes the pending click miss its target (regression found in R1).
 */
export function markTouched(state: FieldState, doc: Document, render: () => void): void {
  state.touched = true;
  if (!pressed.get(doc)) {
    render();
    return;
  }
  const done = (): void => {
    doc.removeEventListener('pointerup', done, true);
    doc.removeEventListener('pointercancel', done, true);
    // pointerup, mouseup, and click are dispatched in one task; render after the click.
    setTimeout(render, 0);
  };
  doc.addEventListener('pointerup', done, true);
  doc.addEventListener('pointercancel', done, true);
}

/**
 * Tracks when validation messages may be shown (SPEC section 16.1: do not scold users
 * before they had a chance to finish typing).
 */
export class FieldState {
  touched = false;
  dirty = false;
  submitted = false;
  customError: string | null = null;

  shouldShow(timing: ValidationTiming): boolean {
    if (this.submitted) return true;
    if (timing === 'input') return this.dirty || this.touched;
    if (timing === 'blur') return this.touched;
    return false;
  }

  reset(): void {
    this.touched = false;
    this.dirty = false;
    this.submitted = false;
    this.customError = null;
  }
}

export interface ChromeParts {
  label: string;
  hideLabel?: boolean | undefined;
  required?: boolean | undefined;
  description?: string | undefined;
}

/**
 * Label, help text, validation message, and counter for one field. The label
 * is a <label for> for single controls, or a <legend> inside a <fieldset> for groups.
 */
export class FieldChrome {
  readonly label: HTMLLabelElement | HTMLLegendElement;
  readonly description: HTMLDivElement;
  readonly counter: HTMLDivElement;
  readonly error: HTMLDivElement;
  readonly #labelText: HTMLSpanElement;
  readonly #required: HTMLSpanElement;
  readonly #errorText: HTMLSpanElement;
  #errorIcon: Element | null = null;
  #errorIconRef: IconRef | null = null;

  constructor(doc: Document, kind: 'label' | 'legend', prefix: string) {
    this.label = doc.createElement(kind);
    this.label.className = 'aui-field__label';
    this.label.id = createId(`${prefix}-label`);
    this.#labelText = doc.createElement('span');
    this.#required = doc.createElement('span');
    this.#required.className = 'aui-field__required';
    // Required state is exposed through `required`/`aria-required`; the asterisk is visual only.
    this.#required.setAttribute('aria-hidden', 'true');
    this.#required.textContent = '*';
    this.label.append(this.#labelText, this.#required);

    this.description = doc.createElement('div');
    this.description.className = 'aui-field__description';
    this.description.id = createId(`${prefix}-desc`);

    this.counter = doc.createElement('div');
    this.counter.className = 'aui-field__counter';
    this.counter.id = createId(`${prefix}-counter`);
    this.counter.hidden = true;

    this.error = doc.createElement('div');
    this.error.className = 'aui-field__error aui-validation-message';
    this.error.id = createId(`${prefix}-error`);
    this.#errorText = doc.createElement('span');
    this.error.append(this.#errorText);
  }

  render(parts: ChromeParts): void {
    // Unchanged writes are skipped: re-renders run on every keystroke and on form-wide validation.
    setText(this.#labelText, parts.label);
    this.#required.hidden = !(parts.required ?? false);
    this.label.classList.toggle('aui-visually-hidden', parts.hideLabel ?? false);
    setText(this.description, parts.description ?? '');
    this.description.hidden = !parts.description;
  }

  setCounter(text: string | null, over: boolean): void {
    setText(this.counter, text ?? '');
    this.counter.hidden = text === null;
    this.counter.classList.toggle('aui-field__counter--over', over);
  }

  setError(message: string, icon: IconRef): void {
    setText(this.#errorText, message);
    this.error.hidden = message === '';
    if (message !== '' && this.#errorIconRef !== icon) {
      this.#errorIcon?.remove();
      this.#errorIcon = renderIcon(icon, { className: 'aui-validation-message__icon', doc: this.error.ownerDocument });
      this.#errorIconRef = icon;
      this.error.prepend(this.#errorIcon);
    }
  }

  /** Ids for aria-describedby, in reading order. */
  describedBy(): string[] {
    const ids: string[] = [];
    if (!this.description.hidden) ids.push(this.description.id);
    if (!this.counter.hidden) ids.push(this.counter.id);
    if (!this.error.hidden) ids.push(this.error.id);
    return ids;
  }
}

/**
 * Label text plus the visual-only required asterisk, for components that render
 * their own label element (R0 Combobox and Date Input) so all fields look alike.
 */
export function renderLabel(label: HTMLElement, text: string, required: boolean): void {
  const doc = label.ownerDocument;
  const span = doc.createElement('span');
  span.textContent = text;
  const nodes: Node[] = [span];
  if (required) {
    const star = doc.createElement('span');
    star.className = 'aui-field__required';
    star.setAttribute('aria-hidden', 'true');
    star.textContent = '*';
    nodes.push(star);
  }
  label.replaceChildren(...nodes);
}

/** Error text with the shared validation icon (empty message clears it). */
export function renderError(el: HTMLElement, message: string, icon: IconRef): void {
  if (message === '') {
    el.replaceChildren();
    return;
  }
  const text = el.ownerDocument.createElement('span');
  text.textContent = message;
  el.replaceChildren(renderIcon(icon, { className: 'aui-validation-message__icon', doc: el.ownerDocument }), text);
}

/** Set text content only when it changed (avoids needless DOM mutations and style invalidation). */
export function setText(el: Node, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Replace aria-describedby with exactly the given ids (removed when empty). */
export function setDescribedBy(el: Element, ids: readonly string[], extra: readonly string[] = []): void {
  const value = [...ids, ...extra].join(' ');
  if (value === '') el.removeAttribute('aria-describedby');
  else if (el.getAttribute('aria-describedby') !== value) el.setAttribute('aria-describedby', value);
}

export function setInvalid(el: Element, invalid: boolean): void {
  if (invalid) {
    if (el.getAttribute('aria-invalid') !== 'true') el.setAttribute('aria-invalid', 'true');
  } else el.removeAttribute('aria-invalid');
}

registerMessages('field', 'en', {
  charactersRemaining: '{count} characters remaining',
  charactersRemainingOne: '1 character remaining',
  charactersOver: '{count} characters too many',
  charactersOverOne: '1 character too many',
});

/** Character counter text (GOV.UK character-count pattern): remaining or over. */
export function counterText(length: number, max: number, locale: string): { text: string; over: boolean } {
  const diff = max - length;
  if (diff >= 0) return { text: diff === 1 ? getMessage('field', 'charactersRemainingOne', {}, locale) : getMessage('field', 'charactersRemaining', { count: formatNumber(diff, {}, locale) }, locale), over: false };
  const over = -diff;
  return { text: over === 1 ? getMessage('field', 'charactersOverOne', {}, locale) : getMessage('field', 'charactersOver', { count: formatNumber(over, {}, locale) }, locale), over: true };
}
