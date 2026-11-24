import { ChangeDetectionStrategy, Component, input, output, ViewEncapsulation, type InputSignal, type OutputEmitterRef } from '@angular/core';
import { FormField, type FormFieldChangeDetail, type FormFieldControl, type FormFieldOptions } from '@absoluteui/components/form-field';
import { ComponentBridge, defined, emitTo } from '../internal/bridge.js';

type Options = Omit<FormFieldOptions, 'control'>;

/**
 * AbsoluteUI Form Field around a projected native control:
 * `<aui-form-field label="ZIP"><input formControlName="zip" required></aui-form-field>`.
 * The native control keeps Angular's own value accessor; AbsoluteUI adds the label,
 * help text, and localized validation messages.
 */
@Component({
  selector: 'aui-form-field',
  exportAs: 'auiFormField',
  template: '<ng-content />',
  styleUrls: ['../../../components/dist/form-field/style.css'],
  styles: ['@layer aui.base{:where(aui-form-field){display:block}}'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuiFormField extends ComponentBridge<FormField, Options> {
  readonly label: InputSignal<Options['label']> = input.required<Options['label']>();
  readonly hideLabel: InputSignal<Options['hideLabel'] | undefined> = input<Options['hideLabel']>();
  readonly description: InputSignal<Options['description'] | undefined> = input<Options['description']>();
  readonly required: InputSignal<Options['required'] | undefined> = input<Options['required']>();
  readonly validate: InputSignal<Options['validate'] | undefined> = input<Options['validate']>();
  readonly validationTiming: InputSignal<Options['validationTiming'] | undefined> = input<Options['validationTiming']>();
  readonly locale: InputSignal<Options['locale'] | undefined> = input<Options['locale']>();
  readonly icons: InputSignal<Options['icons'] | undefined> = input<Options['icons']>();
  readonly valueInput: OutputEmitterRef<FormFieldChangeDetail> = output<FormFieldChangeDetail>();
  readonly changed: OutputEmitterRef<FormFieldChangeDetail> = output<FormFieldChangeDetail>();

  constructor() {
    super();
    this.init({
      create: (host, options) => {
        const control = host.querySelector<FormFieldControl>('input, textarea, select');
        if (!control) throw new TypeError('aui-form-field requires a projected <input>, <textarea>, or <select>.');
        return FormField.create(host, { ...options, control });
      },
      configKey: 'formField',
      options: () =>
        defined<Options>({
          label: this.label(),
          hideLabel: this.hideLabel(),
          description: this.description(),
          required: this.required(),
          validate: this.validate(),
          validationTiming: this.validationTiming(),
          locale: this.locale(),
          icons: this.icons(),
        }),
      events: { 'aui-input': emitTo(this.valueInput), 'aui-change': emitTo(this.changed) },
    });
  }

  /** Show messages now; true when valid. */
  reportValidity(): boolean {
    return this.controller?.reportValidity() ?? true;
  }

  /** External error (server, cross-field rule); cleared when the user edits. */
  setCustomError(message: string | null): void {
    this.controller?.setCustomError(message);
  }

  /** Re-read the control's constraints after changing them outside AbsoluteUI. */
  refresh(): void {
    this.controller?.refresh();
  }

  /** Focus the wrapped control. */
  focus(): void {
    this.controller?.focus();
  }

  /** Clear touched state and messages. */
  reset(): void {
    this.controller?.reset();
  }
}
