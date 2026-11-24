/**
 * Form (SPEC section 18.8): form state manager and validation orchestrator for a
 * native <form>. It discovers AbsoluteUI controls (and Form Field-wrapped
 * native controls), validates them on submit, runs cross-field rules and an
 * optional async validator (cancellable, with a timeout), shows an Error
 * Summary with links to each invalid field, tracks dirty/touched state, and
 * resets everything consistently.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators } from '@absoluteui/core';
import { announce } from '@absoluteui/utilities';
import { ErrorSummary } from '../error-summary/error-summary.js';
import { findFormControls, getFormControl, type FormControl } from '../internal/field.js';

export type FocusOnInvalid = 'summary' | 'first-field';
export type SubmitMode = 'event' | 'native';

export interface FormConfig {
  /** Where focus moves after a failed submission. */
  focusOnInvalid: FocusOnInvalid;
  /** Render an error summary at the top of the form on failed submission. */
  errorSummary: boolean;
  /** `event`: emit `aui-submit` only. `native`: then submit the form natively unless prevented. */
  submitMode: SubmitMode;
  /** Async validation timeout in milliseconds. */
  asyncTimeoutMs: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    form: FormConfig & { locale: string };
  }
}

export const formConfig = defineComponentConfig<FormConfig, 'locale'>(
  'form',
  {
    focusOnInvalid: { default: 'summary', expected: '"summary" | "first-field"', validate: validators.oneOf(['summary', 'first-field'] as const) },
    errorSummary: { default: true, expected: 'boolean', validate: validators.isBoolean },
    submitMode: { default: 'event', expected: '"event" | "native"', validate: validators.oneOf(['event', 'native'] as const) },
    asyncTimeoutMs: { default: 10_000, expected: 'integer 100..120000 (ms)', validate: validators.integerInRange(100, 120_000) },
  },
  ['locale'],
);

registerMessages('form', 'en', {
  validationUnavailable: 'Your answers could not be checked. Try again.',
  // Summary links name the field: generic messages ("This field is required.") are
  // meaningless in a list (regression found in the R1 preview).
  summaryItem: '{label}: {message}',
});

export type FormValues = Readonly<Record<string, unknown>>;
/** Field name -> message. Unknown names are shown in the summary without a link. */
export type FormErrors = Readonly<Record<string, string>>;

export interface CrossFieldRule {
  /** Field names the rule reads; the rule re-runs when any of them changes after the first submit. */
  readonly fields: readonly string[];
  /** Return a message when the combination is invalid. */
  readonly validate: (values: FormValues) => string | null;
  /** Field that shows the message. Default: the last entry of `fields`. */
  readonly target?: string;
}

/** Async validation interface: return errors by field name. Honour `signal` to support cancellation. */
export type AsyncFormValidator = (values: FormValues, signal: AbortSignal) => Promise<FormErrors>;

export interface FormOptions extends Partial<FormConfig> {
  rules?: readonly CrossFieldRule[];
  validate?: AsyncFormValidator;
  /** Heading for the error summary. Default: localized "There is a problem". */
  summaryTitle?: string;
  /** Host for the error summary. Default: an element inserted as the form's first child. */
  summaryHost?: HTMLElement;
  locale?: string;
}

export interface FormState {
  readonly dirty: boolean;
  readonly touched: boolean;
  readonly submitting: boolean;
  readonly submitCount: number;
  readonly valid: boolean;
}

export interface FormErrorEntry {
  readonly name: string | null;
  readonly label: string;
  readonly message: string;
}

export interface FormSubmitDetail {
  values: FormValues;
}

export interface FormInvalidDetail {
  errors: readonly FormErrorEntry[];
  reason: 'constraints' | 'async' | 'async-failed';
}

type ErrorSource = 'rule' | 'external';

export class Form {
  readonly element: HTMLFormElement;
  #options: FormOptions;
  #summary: ErrorSummary | null = null;
  #summaryHost: HTMLElement | null = null;
  #ownsSummaryHost = false;
  #submitting = false;
  #submitCount = 0;
  #lastState: FormState | null = null;
  #abort: AbortController | null = null;
  readonly #originalNoValidate: boolean;
  /** Custom errors this form set on controls, so it can clear exactly those. */
  readonly #errors = new Map<FormControl, ErrorSource>();
  readonly #group = new DisposableGroup();

  static create(element: HTMLFormElement, options: FormOptions = {}): Form {
    return new Form(element, options);
  }

  private constructor(element: HTMLFormElement, options: FormOptions) {
    if (!(element instanceof HTMLFormElement)) {
      throw configurationError('FORM_HOST', 'Form requires a native <form> element.', { component: 'form', property: 'element', expected: 'HTMLFormElement' });
    }
    Form.#assert(options);
    this.element = element;
    this.#options = { ...options };
    this.#config();
    this.#originalNoValidate = element.noValidate;
    // AbsoluteUI owns validation UI: suppress native bubbles consistently.
    element.noValidate = true;
    element.classList.add('aui-form');

    const g = this.#group;
    g.listen(element, 'submit', (event) => {
      event.preventDefault();
      void this.#handleSubmit(event.submitter);
    });
    g.listen(element, 'reset', (event) => {
      // Controls hold their own initial values; a native reset would desynchronize them.
      event.preventDefault();
      this.reset();
    });
    const onEdit = (event: Event): void => {
      // The control cleared its own external error when the user edited it.
      const edited = event.target instanceof Element ? getFormControl(event.target) : undefined;
      if (edited && this.#errors.get(edited) === 'external') this.#errors.delete(edited);
      // Live re-checks skip rules whose target is not (yet) rendered instead of throwing from a listener.
      if (this.#submitCount > 0) this.#applyRules(false);
      this.#emitState();
    };
    element.addEventListener('aui-input', onEdit);
    element.addEventListener('aui-change', onEdit);
    g.add(() => {
      element.removeEventListener('aui-input', onEdit);
      element.removeEventListener('aui-change', onEdit);
    });
    g.listen(element, 'focusout', () => {
      queueMicrotask(() => {
        this.#emitState();
      });
    });
    g.add(formConfig.subscribe(() => {
      this.#summary?.update({ ...(this.#options.summaryTitle === undefined ? {} : { title: this.#options.summaryTitle }), ...this.#summaryLocale() });
    }));
  }

  /** Registered controls inside the form, in document order. */
  get controls(): FormControl[] {
    return findFormControls(this.element);
  }

  get state(): FormState {
    const controls = this.controls;
    return Object.freeze({
      dirty: controls.some((c) => c.dirty),
      touched: controls.some((c) => c.touched),
      submitting: this.#submitting,
      submitCount: this.#submitCount,
      valid: controls.every((c) => c.disabled || c.validity.valid),
    });
  }

  get errorSummary(): ErrorSummary | null {
    return this.#summary;
  }

  /**
   * Current values by field name: AbsoluteUI controls first, then plain named
   * native elements that are not part of a control. Repeated names collect into arrays.
   */
  getValues(): FormValues {
    const out: Record<string, unknown> = {};
    const add = (name: string, value: unknown): void => {
      if (!Object.hasOwn(out, name)) out[name] = value;
      else {
        const existing = out[name];
        out[name] = Array.isArray(existing) ? [...(existing as unknown[]), value] : [existing, value];
      }
    };
    for (const c of this.controls) if (c.name !== null && !c.disabled) add(c.name, c.getFormValue());
    for (const el of Array.from(this.element.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
      // :disabled also covers controls inside a disabled <fieldset> (FormData semantics).
      if (!el.name || el.matches(':disabled') || el.closest('[data-aui-control]')) continue;
      if (el instanceof HTMLInputElement) {
        if (['submit', 'button', 'reset', 'image', 'file'].includes(el.type)) continue;
        if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) continue;
      }
      if (el instanceof HTMLSelectElement && el.multiple) {
        for (const o of Array.from(el.selectedOptions)) add(el.name, o.value);
        continue;
      }
      add(el.name, el.value);
    }
    return Object.freeze(out);
  }

  /**
   * Validate every enabled control, apply cross-field rules, and show messages
   * and the summary. Does not run the async validator. Returns validity.
   */
  validate(): boolean {
    this.#applyRules();
    const invalid = this.#reportAll();
    this.#showErrors(invalid);
    return invalid.length === 0;
  }

  /** Submit programmatically through the native pipeline (fires `submit`). */
  submit(): void {
    this.element.requestSubmit();
  }

  /**
   * Apply server-side or other external errors by field name, show them, and
   * move focus. Errors clear when the user edits the field or on the next submit.
   */
  setErrors(errors: FormErrors): void {
    this.#clearErrors('external');
    const byName = new Map(this.controls.filter((c) => c.name !== null).map((c) => [c.name, c] as const));
    const unmatched: string[] = [];
    for (const [name, message] of Object.entries(errors)) {
      const control = byName.get(name);
      // Disabled controls cannot be corrected or focused: list their errors as plain text.
      if (!control || control.disabled) {
        unmatched.push(message);
        continue;
      }
      control.setCustomError(message);
      this.#errors.set(control, 'external');
    }
    const invalid = this.#reportAll();
    this.#showErrors(invalid, unmatched);
    this.#emitState();
  }

  clearErrors(): void {
    this.#clearErrors();
    this.#summary?.clear();
    this.#emitState();
  }

  /** Restore every control and plain native element to its initial value and clear all state. */
  reset(): void {
    this.#abort?.abort();
    this.#abort = null;
    this.#submitting = false;
    this.#submitCount = 0;
    this.#errors.clear();
    for (const c of this.controls) c.reset();
    for (const el of Array.from(this.element.elements)) {
      if (el.closest('[data-aui-control]')) continue;
      if (el instanceof HTMLInputElement) {
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = el.defaultChecked;
        else if (el.type === 'file') el.value = '';
        else if (!['submit', 'button', 'reset', 'image'].includes(el.type)) el.value = el.defaultValue;
      } else if (el instanceof HTMLTextAreaElement) {
        el.value = el.defaultValue;
      } else if (el instanceof HTMLSelectElement) {
        for (const o of Array.from(el.options)) o.selected = o.defaultSelected;
      }
    }
    this.#summary?.clear();
    emit(this.element, 'aui-reset', null, { bubbles: false });
    this.#emitState();
  }

  update(options: Partial<FormOptions>): void {
    const next = { ...this.#options, ...options };
    Form.#assert(next);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#config();
    } catch (e) {
      this.#options = previous;
      throw e;
    }
    this.#summary?.update({ ...(next.summaryTitle === undefined ? {} : { title: next.summaryTitle }), ...this.#summaryLocale() });
    if (this.#submitCount > 0) this.#applyRules(false);
  }

  destroy(): void {
    this.#abort?.abort();
    this.#abort = null;
    this.#group.dispose();
    this.#summary?.destroy();
    if (this.#ownsSummaryHost) this.#summaryHost?.remove();
    this.#summary = null;
    this.element.noValidate = this.#originalNoValidate;
    this.element.classList.remove('aui-form');
  }

  static #assert(options: FormOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('FORM_OPTIONS', 'Invalid form options.', { component: 'form', property: `form.${property}`, expected });
    };
    for (const [i, rule] of (options.rules ?? []).entries()) {
      if (!Array.isArray(rule.fields) || rule.fields.length === 0 || rule.fields.some((f) => typeof f !== 'string')) fail(`rules[${i}].fields`, 'non-empty array of field names');
      if (typeof rule.validate !== 'function') fail(`rules[${i}].validate`, 'function');
    }
    if (options.validate !== undefined && typeof options.validate !== 'function') fail('validate', 'async function (values, signal) => Promise<FormErrors>');
    if (options.summaryHost !== undefined && !(options.summaryHost instanceof HTMLElement)) fail('summaryHost', 'HTMLElement');
  }

  #config(): Readonly<FormConfig & { locale: string }> {
    const o = this.#options;
    return formConfig.resolve({
      ...(o.focusOnInvalid === undefined ? {} : { focusOnInvalid: o.focusOnInvalid }),
      ...(o.errorSummary === undefined ? {} : { errorSummary: o.errorSummary }),
      ...(o.submitMode === undefined ? {} : { submitMode: o.submitMode }),
      ...(o.asyncTimeoutMs === undefined ? {} : { asyncTimeoutMs: o.asyncTimeoutMs }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #summaryLocale(): { locale: string } {
    return { locale: this.#config().locale };
  }

  async #handleSubmit(submitter: HTMLElement | null): Promise<void> {
    // Prevent double submission while async validation is pending.
    if (this.#submitting) return;
    this.#submitCount += 1;
    this.#clearErrors('external');
    if (!this.validate()) {
      this.#emitInvalid('constraints');
      this.#emitState();
      return;
    }
    const validator = this.#options.validate;
    if (validator) {
      const ok = await this.#runAsync(validator);
      if (!ok) return;
    }
    this.#summary?.clear();
    const values = this.getValues();
    const proceed = emit(this.element, 'aui-submit', { values } satisfies FormSubmitDetail, { cancelable: true, bubbles: false });
    this.#emitState();
    if (proceed && this.#config().submitMode === 'native') {
      // HTMLFormElement.submit() skips the submit event, so this does not re-enter.
      if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
        const hidden = this.element.ownerDocument.createElement('input');
        hidden.type = 'hidden';
        if (submitter.name) {
          hidden.name = submitter.name;
          hidden.value = submitter.value;
          this.element.append(hidden);
        }
        this.element.submit();
        hidden.remove();
      } else {
        this.element.submit();
      }
    }
  }

  async #runAsync(validator: AsyncFormValidator): Promise<boolean> {
    const controller = new AbortController();
    this.#abort = controller;
    this.#submitting = true;
    this.element.setAttribute('aria-busy', 'true');
    this.#emitState();
    const timeout = setTimeout(() => {
      controller.abort(new DOMException('Validation timed out.', 'TimeoutError'));
    }, this.#config().asyncTimeoutMs);
    let errors: FormErrors | null = null;
    let failed = false;
    try {
      errors = await Promise.race([
        validator(this.getValues(), controller.signal),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(controller.signal.reason instanceof Error ? controller.signal.reason : new Error('aborted'));
          }, { once: true });
        }),
      ]);
    } catch {
      failed = true;
    } finally {
      clearTimeout(timeout);
      this.element.removeAttribute('aria-busy');
    }
    // A reset (or destroy) during validation discards the result silently.
    if (this.#abort !== controller) return false;
    this.#abort = null;
    this.#submitting = false;
    if (failed || errors === null) {
      this.#showErrors([], [getMessage('form', 'validationUnavailable', {}, this.#config().locale)]);
      this.#emitInvalid('async-failed');
      this.#emitState();
      return false;
    }
    if (Object.keys(errors).length > 0) {
      this.setErrors(errors);
      this.#emitInvalid('async');
      return false;
    }
    return true;
  }

  #clearErrors(source?: ErrorSource): void {
    for (const [control, s] of [...this.#errors]) {
      if (source !== undefined && s !== source) continue;
      control.setCustomError(null);
      this.#errors.delete(control);
    }
  }

  /** `strict`: an unknown rule target is a developer error (throws). Live re-checks pass false. */
  #applyRules(strict = true): void {
    const rules = this.#options.rules ?? [];
    this.#clearErrors('rule');
    if (rules.length === 0) return;
    const values = this.getValues();
    const byName = new Map(this.controls.filter((c) => c.name !== null).map((c) => [c.name, c] as const));
    for (const rule of rules) {
      const message = rule.validate(values);
      if (message === null || message === '') continue;
      const targetName = rule.target ?? rule.fields[rule.fields.length - 1] ?? '';
      const control = byName.get(targetName);
      if (!control) {
        if (!strict) continue;
        throw configurationError('FORM_RULE_TARGET', 'Cross-field rule target not found.', { component: 'form', property: 'form.rules.target', expected: 'name of a control inside the form' });
      }
      // One message per control: the first failing rule wins.
      if (this.#errors.has(control)) continue;
      control.setCustomError(message);
      this.#errors.set(control, 'rule');
    }
  }

  #reportAll(): FormControl[] {
    const invalid: FormControl[] = [];
    for (const c of this.controls) {
      if (c.disabled) continue;
      if (!c.reportValidity()) invalid.push(c);
    }
    return invalid;
  }

  #entries(invalid: readonly FormControl[]): FormErrorEntry[] {
    return invalid.map((c) => ({ name: c.name, label: c.label, message: c.validity.message }));
  }

  #emitInvalid(reason: FormInvalidDetail['reason']): void {
    const invalid = this.controls.filter((c) => !c.disabled && !c.validity.valid);
    emit(this.element, 'aui-invalid', { errors: this.#entries(invalid), reason } satisfies FormInvalidDetail, { bubbles: false });
  }

  #ensureSummary(): ErrorSummary {
    if (this.#summary) return this.#summary;
    let host = this.#options.summaryHost ?? null;
    if (!host) {
      host = this.element.ownerDocument.createElement('div');
      this.element.prepend(host);
      this.#ownsSummaryHost = true;
    }
    this.#summaryHost = host;
    this.#summary = ErrorSummary.create(host, { ...(this.#options.summaryTitle === undefined ? {} : { title: this.#options.summaryTitle }), ...this.#summaryLocale() });
    return this.#summary;
  }

  #showErrors(invalid: readonly FormControl[], extraMessages: readonly string[] = []): void {
    const config = this.#config();
    if (invalid.length === 0 && extraMessages.length === 0) {
      this.#summary?.clear();
      return;
    }
    const useSummary = config.errorSummary;
    if (useSummary) {
      const items = [
        ...invalid.map((c) => ({
          message: getMessage('form', 'summaryItem', { label: c.label, message: c.validity.message }, config.locale),
          target: c.host,
          focus: () => {
            c.focus();
          },
        })),
        ...extraMessages.map((message) => ({ message })),
      ];
      this.#ensureSummary().show(items, { focus: config.focusOnInvalid === 'summary' });
    }
    // Without a summary, messages that belong to no field still reach assistive technology.
    else if (extraMessages.length > 0) announce(extraMessages.join(' '), 'assertive', this.element.ownerDocument);
    if (!useSummary || config.focusOnInvalid === 'first-field') invalid[0]?.focus();
  }

  #emitState(): void {
    const state = this.state;
    const last = this.#lastState;
    const keys = ['dirty', 'touched', 'submitting', 'submitCount', 'valid'] as const;
    if (last && keys.every((k) => last[k] === state[k])) return;
    this.#lastState = state;
    emit(this.element, 'aui-state-change', state, { bubbles: false });
  }
}
