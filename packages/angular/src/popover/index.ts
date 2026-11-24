import { DestroyRef, Directive, inject, input, output, ViewContainerRef, type InputSignal, type OutputEmitterRef, type TemplateRef } from '@angular/core';
import { Popover, type PopoverCloseDetail, type PopoverOptions } from '@absoluteui/components/popover';
import { ComponentBridge, defined, emitTo } from '../internal/bridge.js';
import { PopoverStyles } from '../internal/style-sheets.js';
import { loadStyles } from '../internal/styles.js';
import { renderTemplate, type RenderedTemplate } from '../internal/overlay.js';

type Options = Omit<PopoverOptions, 'content'>;

/**
 * AbsoluteUI Popover on its trigger:
 * `<button [auiPopover]="filters" popoverTitle="Filters">Filters</button><ng-template #filters>...</ng-template>`.
 * The template is rendered as an embedded view, so its bindings stay live.
 */
@Directive({ selector: '[auiPopover]', exportAs: 'auiPopover' })
export class AuiPopover extends ComponentBridge<Popover, Options> {
  /** The popover content: an `<ng-template>` reference. */
  readonly template: InputSignal<TemplateRef<unknown>> = input.required<TemplateRef<unknown>>({ alias: 'auiPopover' });
  readonly title: InputSignal<Options['title']> = input<Options['title']>(undefined, { alias: 'popoverTitle' });
  readonly label: InputSignal<Options['label']> = input<Options['label']>(undefined, { alias: 'popoverLabel' });
  readonly placement: InputSignal<Options['placement'] | undefined> = input<Options['placement']>(undefined, { alias: 'popoverPlacement' });
  readonly offset: InputSignal<Options['offset'] | undefined> = input<Options['offset']>(undefined, { alias: 'popoverOffset' });
  readonly closeOnEscape: InputSignal<Options['closeOnEscape'] | undefined> = input<Options['closeOnEscape']>();
  readonly closeOnOutsidePointer: InputSignal<Options['closeOnOutsidePointer'] | undefined> = input<Options['closeOnOutsidePointer']>();
  readonly initialFocus: InputSignal<Options['initialFocus'] | undefined> = input<Options['initialFocus']>();
  readonly showCloseButton: InputSignal<Options['showCloseButton'] | undefined> = input<Options['showCloseButton']>();
  readonly direction: InputSignal<Options['direction'] | undefined> = input<Options['direction']>();
  readonly icons: InputSignal<Options['icons'] | undefined> = input<Options['icons']>();
  readonly opened: OutputEmitterRef<null> = output<null>();
  readonly cancelled: OutputEmitterRef<PopoverCloseDetail> = output<PopoverCloseDetail>();
  readonly closed: OutputEmitterRef<PopoverCloseDetail> = output<PopoverCloseDetail>();
  readonly #vcr = inject(ViewContainerRef);
  #rendered: RenderedTemplate | null = null;

  constructor() {
    super();
    loadStyles(PopoverStyles);
    this.init({
      create: (host, options) => {
        this.#rendered = renderTemplate(this.#vcr, this.template(), host.ownerDocument);
        return Popover.create(host, { ...options, content: this.#rendered.fragment });
      },
      configKey: 'popover',
      options: () =>
        defined<Options>({
          title: this.title(),
          label: this.label(),
          placement: this.placement(),
          offset: this.offset(),
          closeOnEscape: this.closeOnEscape(),
          closeOnOutsidePointer: this.closeOnOutsidePointer(),
          initialFocus: this.initialFocus(),
          showCloseButton: this.showCloseButton(),
          direction: this.direction(),
          icons: this.icons(),
        }),
      events: { 'aui-open': emitTo(this.opened), 'aui-cancel': emitTo(this.cancelled), 'aui-close': emitTo(this.closed) },
      eventTarget: (popover) => popover.element,
    });
    inject(DestroyRef).onDestroy(() => {
      this.#rendered?.view.destroy();
    });
  }

  /** Show the popover. */
  open(): void {
    this.controller?.open();
  }

  /** Hide the popover; focus returns to the trigger. */
  close(): void {
    this.controller?.close();
  }

  /** Show the popover when hidden, hide it when shown. */
  toggle(): void {
    this.controller?.toggle();
  }
}
