import { Directive, input, output, type InputSignal, type OutputEmitterRef } from '@angular/core';
import { Tooltip, type TooltipOptions } from '@absoluteui/components/tooltip';
import { ComponentBridge, defined, emitTo } from '../internal/bridge.js';
import { TooltipStyles } from '../internal/style-sheets.js';
import { loadStyles } from '../internal/styles.js';

/** AbsoluteUI Tooltip on its trigger: `<button auiTooltip="Opens the help center">`. */
@Directive({ selector: '[auiTooltip]', exportAs: 'auiTooltip' })
export class AuiTooltip extends ComponentBridge<Tooltip, TooltipOptions> {
  readonly content: InputSignal<TooltipOptions['content']> = input.required<TooltipOptions['content']>({ alias: 'auiTooltip' });
  readonly relation: InputSignal<TooltipOptions['relation'] | undefined> = input<TooltipOptions['relation']>(undefined, { alias: 'tooltipRelation' });
  readonly placement: InputSignal<TooltipOptions['placement'] | undefined> = input<TooltipOptions['placement']>(undefined, { alias: 'tooltipPlacement' });
  readonly showDelay: InputSignal<TooltipOptions['showDelay'] | undefined> = input<TooltipOptions['showDelay']>(undefined, { alias: 'tooltipShowDelay' });
  readonly hideDelay: InputSignal<TooltipOptions['hideDelay'] | undefined> = input<TooltipOptions['hideDelay']>(undefined, { alias: 'tooltipHideDelay' });
  readonly direction: InputSignal<TooltipOptions['direction'] | undefined> = input<TooltipOptions['direction']>(undefined, { alias: 'tooltipDirection' });
  readonly opened: OutputEmitterRef<null> = output<null>();
  readonly closed: OutputEmitterRef<null> = output<null>();

  constructor() {
    super();
    loadStyles(TooltipStyles);
    this.init({
      create: (host, options) => Tooltip.create(host, options),
      configKey: 'tooltip',
      options: () =>
        defined<TooltipOptions>({
          content: this.content(),
          relation: this.relation(),
          placement: this.placement(),
          showDelay: this.showDelay(),
          hideDelay: this.hideDelay(),
          direction: this.direction(),
        }),
      events: { 'aui-open': emitTo(this.opened), 'aui-close': emitTo(this.closed) },
      eventTarget: (tooltip) => tooltip.element,
    });
  }

  /** Show the tooltip now (without the hover delay). */
  show(): void {
    this.controller?.show();
  }

  /** Hide the tooltip. */
  hide(): void {
    this.controller?.hide();
  }
}
