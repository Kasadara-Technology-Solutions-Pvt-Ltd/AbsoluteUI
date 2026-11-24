import { Directive, input, type InputSignal, type InputSignalWithTransform } from '@angular/core';
import { Fieldset, type FieldsetOptions } from '@absoluteui/components/fieldset';
import { booleanInput, ComponentBridge, defined } from '../internal/bridge.js';
import { FieldsetStyles } from '../internal/style-sheets.js';
import { loadStyles } from '../internal/styles.js';

/**
 * AbsoluteUI Fieldset: `<fieldset auiFieldset legend="Address">...controls...</fieldset>`.
 * Enhances the native fieldset in place with the legend, help text, required marker, and a
 * group error; the projected controls stay Angular-managed. Disabled is the native attribute.
 */
@Directive({ selector: 'fieldset[auiFieldset]', exportAs: 'auiFieldset' })
export class AuiFieldset extends ComponentBridge<Fieldset, FieldsetOptions> {
  readonly legend: InputSignal<FieldsetOptions['legend']> = input.required<FieldsetOptions['legend']>();
  readonly hideLegend: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });
  readonly description: InputSignal<FieldsetOptions['description'] | undefined> = input<FieldsetOptions['description']>();
  readonly required: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });
  readonly error: InputSignal<FieldsetOptions['error'] | undefined> = input<FieldsetOptions['error']>();
  readonly locale: InputSignal<FieldsetOptions['locale'] | undefined> = input<FieldsetOptions['locale']>();
  readonly icons: InputSignal<FieldsetOptions['icons'] | undefined> = input<FieldsetOptions['icons']>();

  constructor() {
    super();
    loadStyles(FieldsetStyles);
    this.init({
      create: (host, options) => {
        if (!(host instanceof HTMLFieldSetElement)) throw new TypeError('auiFieldset requires a <fieldset> host.');
        return Fieldset.enhance(host, options);
      },
      configKey: 'fieldset',
      options: () =>
        defined<FieldsetOptions>({
          legend: this.legend(),
          hideLegend: this.hideLegend(),
          description: this.description(),
          required: this.required(),
          // The native disabled attribute (an input here would capture [disabled]).
          disabled: undefined,
          error: this.error(),
          locale: this.locale(),
          icons: this.icons(),
        }),
    });
  }
}
