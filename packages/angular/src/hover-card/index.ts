import { DestroyRef, Directive, inject, input, output, ViewContainerRef, type InputSignal, type OutputEmitterRef, type TemplateRef } from '@angular/core';
import { HoverCard, type HoverCardCloseDetail, type HoverCardOptions } from '@absoluteui/components/hover-card';
import { ComponentBridge, defined, emitTo } from '../internal/bridge.js';
import { HoverCardStyles } from '../internal/style-sheets.js';
import { loadStyles } from '../internal/styles.js';
import { renderTemplate, type RenderedTemplate } from '../internal/overlay.js';

type Options = Omit<HoverCardOptions, 'content'>;

/**
 * AbsoluteUI Hover Card on its trigger:
 * `<a href="/u/ada" [auiHoverCard]="card">Ada</a><ng-template #card>...</ng-template>`.
 * The template is rendered as an embedded view, so its bindings stay live.
 */
@Directive({ selector: '[auiHoverCard]', exportAs: 'auiHoverCard' })
export class AuiHoverCard extends ComponentBridge<HoverCard, Options> {
  /** The card content: an `<ng-template>` reference. */
  readonly template: InputSignal<TemplateRef<unknown>> = input.required<TemplateRef<unknown>>({ alias: 'auiHoverCard' });
  readonly placement: InputSignal<Options['placement'] | undefined> = input<Options['placement']>(undefined, { alias: 'hoverCardPlacement' });
  readonly showDelay: InputSignal<Options['showDelay'] | undefined> = input<Options['showDelay']>(undefined, { alias: 'hoverCardShowDelay' });
  readonly hideDelay: InputSignal<Options['hideDelay'] | undefined> = input<Options['hideDelay']>(undefined, { alias: 'hoverCardHideDelay' });
  readonly describe: InputSignal<Options['describe'] | undefined> = input<Options['describe']>(undefined, { alias: 'hoverCardDescribe' });
  readonly direction: InputSignal<Options['direction'] | undefined> = input<Options['direction']>(undefined, { alias: 'hoverCardDirection' });
  readonly opened: OutputEmitterRef<null> = output<null>();
  readonly closed: OutputEmitterRef<HoverCardCloseDetail> = output<HoverCardCloseDetail>();
  readonly #vcr = inject(ViewContainerRef);
  #rendered: RenderedTemplate | null = null;

  constructor() {
    super();
    loadStyles(HoverCardStyles);
    this.init({
      create: (host, options) => {
        this.#rendered = renderTemplate(this.#vcr, this.template(), host.ownerDocument);
        return HoverCard.create(host, { ...options, content: this.#rendered.fragment });
      },
      configKey: 'hoverCard',
      options: () =>
        defined<Options>({
          placement: this.placement(),
          showDelay: this.showDelay(),
          hideDelay: this.hideDelay(),
          describe: this.describe(),
          direction: this.direction(),
        }),
      events: { 'aui-open': emitTo(this.opened), 'aui-close': emitTo(this.closed) },
      eventTarget: (card) => card.element,
    });
    inject(DestroyRef).onDestroy(() => {
      this.#rendered?.view.destroy();
    });
  }

  /** Show the card now (without the hover delay). */
  show(): void {
    this.controller?.show();
  }

  /** Hide the card. */
  hide(): void {
    this.controller?.hide();
  }
}
