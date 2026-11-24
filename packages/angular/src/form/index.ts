import { Directive, input, output, type InputSignal, type OutputEmitterRef } from '@angular/core';
import { Form, type FormErrors, type FormInvalidDetail, type FormOptions, type FormState, type FormSubmitDetail, type FormValues } from '@absoluteui/components/form';
import { ComponentBridge, defined, emitTo } from '../internal/bridge.js';
import { FormStyles } from '../internal/style-sheets.js';
import { loadStyles } from '../internal/styles.js';

/**
 * AbsoluteUI Form: `<form auiForm (submitted)="save($event.values)">`.
 * Complements Angular forms: AbsoluteUI controls also report validity to Angular
 * through their Validator, so `formGroup.valid` and the AbsoluteUI state agree.
 * Bind `(submitted)` rather than `(ngSubmit)`: ngSubmit fires before AbsoluteUI validation.
 */
@Directive({ selector: 'form[auiForm]', exportAs: 'auiForm' })
export class AuiForm extends ComponentBridge<Form, FormOptions> {
  readonly rules: InputSignal<FormOptions['rules'] | undefined> = input<FormOptions['rules']>();
  /** Async validator (values, AbortSignal) => Promise<FormErrors>. */
  readonly validate: InputSignal<FormOptions['validate'] | undefined> = input<FormOptions['validate']>();
  readonly summaryTitle: InputSignal<FormOptions['summaryTitle'] | undefined> = input<FormOptions['summaryTitle']>();
  readonly summaryHost: InputSignal<FormOptions['summaryHost'] | undefined> = input<FormOptions['summaryHost']>();
  readonly focusOnInvalid: InputSignal<FormOptions['focusOnInvalid'] | undefined> = input<FormOptions['focusOnInvalid']>();
  readonly errorSummary: InputSignal<FormOptions['errorSummary'] | undefined> = input<FormOptions['errorSummary']>();
  readonly submitMode: InputSignal<FormOptions['submitMode'] | undefined> = input<FormOptions['submitMode']>();
  readonly asyncTimeoutMs: InputSignal<FormOptions['asyncTimeoutMs'] | undefined> = input<FormOptions['asyncTimeoutMs']>();
  readonly locale: InputSignal<FormOptions['locale'] | undefined> = input<FormOptions['locale']>();
  /** Valid submission: values and the abort signal of the submit. */
  readonly submitted: OutputEmitterRef<FormSubmitDetail> = output<FormSubmitDetail>();
  /** Submission blocked by errors (the summary and focus are already handled). */
  readonly invalidSubmit: OutputEmitterRef<FormInvalidDetail> = output<FormInvalidDetail>();
  readonly stateChange: OutputEmitterRef<FormState> = output<FormState>();
  readonly formReset: OutputEmitterRef<null> = output<null>();

  constructor() {
    super();
    loadStyles(FormStyles);
    this.init({
      create: (host, options) => {
        if (!(host instanceof HTMLFormElement)) throw new TypeError('auiForm requires a <form> host.');
        return Form.create(host, options);
      },
      configKey: 'form',
      options: () =>
        defined<FormOptions>({
          rules: this.rules(),
          validate: this.validate(),
          summaryTitle: this.summaryTitle(),
          summaryHost: this.summaryHost(),
          focusOnInvalid: this.focusOnInvalid(),
          errorSummary: this.errorSummary(),
          submitMode: this.submitMode(),
          asyncTimeoutMs: this.asyncTimeoutMs(),
          locale: this.locale(),
        }),
      events: {
        'aui-submit': emitTo(this.submitted),
        'aui-invalid': emitTo(this.invalidSubmit),
        'aui-state-change': emitTo(this.stateChange),
        'aui-reset': emitTo(this.formReset),
      },
    });
  }

  /** Current values of the registered controls. */
  getValues(): FormValues | undefined {
    return this.controller?.getValues();
  }

  /** Run synchronous validation now and show the messages; true when valid. */
  checkValidity(): boolean {
    return this.controller?.validate() ?? false;
  }

  /** Run the submit pipeline (validation, then `submitted` or `invalidSubmit`). */
  submit(): void {
    this.controller?.submit();
  }

  /** Show server or cross-field errors by field name. */
  setErrors(errors: FormErrors): void {
    this.controller?.setErrors(errors);
  }

  /** Remove server or custom errors set with `setErrors`. */
  clearErrors(): void {
    this.controller?.clearErrors();
  }

  /** Reset the form and every control to its initial values and clear messages. */
  reset(): void {
    this.controller?.reset();
  }
}
