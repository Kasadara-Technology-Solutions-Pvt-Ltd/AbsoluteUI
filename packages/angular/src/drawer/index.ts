import { ChangeDetectionStrategy, Component, input, model, output, viewChild, ViewEncapsulation, type InputSignal, type ModelSignal, type OutputEmitterRef, type Signal, type TemplateRef } from '@angular/core';
import { Drawer, type DrawerCloseDetail, type DrawerOptions } from '@absoluteui/components/drawer';
import { defined, emitTo } from '../internal/bridge.js';
import { bindModal } from '../internal/modal.js';

type Options = Omit<DrawerOptions, 'content'>;

/**
 * AbsoluteUI Drawer; the projected content is the body:
 * `<aui-drawer title="Filters" [(open)]="filtersOpen">...</aui-drawer>`.
 * `modal` is read once at creation (init-only).
 */
@Component({
  selector: 'aui-drawer',
  exportAs: 'auiDrawer',
  template: '<ng-template #body><ng-content /></ng-template>',
  styleUrls: ['../../../components/dist/drawer/style.css', '../../../components/dist/button/style.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuiDrawer {
  /** Whether the drawer is shown: `[(open)]`. Closing by Escape, the close button, or an action sets it to false. */
  readonly open: ModelSignal<boolean> = model(false);
  readonly title: InputSignal<Options['title']> = input.required<Options['title']>();
  readonly description: InputSignal<Options['description'] | undefined> = input<Options['description']>();
  readonly actions: InputSignal<Options['actions'] | undefined> = input<Options['actions']>();
  readonly modal: InputSignal<Options['modal'] | undefined> = input<Options['modal']>();
  readonly placement: InputSignal<Options['placement'] | undefined> = input<Options['placement']>();
  readonly size: InputSignal<Options['size'] | undefined> = input<Options['size']>();
  readonly closeOnEscape: InputSignal<Options['closeOnEscape'] | undefined> = input<Options['closeOnEscape']>();
  readonly closeOnBackdrop: InputSignal<Options['closeOnBackdrop'] | undefined> = input<Options['closeOnBackdrop']>();
  readonly showCloseButton: InputSignal<Options['showCloseButton'] | undefined> = input<Options['showCloseButton']>();
  readonly direction: InputSignal<Options['direction'] | undefined> = input<Options['direction']>();
  readonly icons: InputSignal<Options['icons'] | undefined> = input<Options['icons']>();
  readonly opened: OutputEmitterRef<null> = output<null>();
  readonly cancelled: OutputEmitterRef<DrawerCloseDetail> = output<DrawerCloseDetail>();
  readonly closed: OutputEmitterRef<DrawerCloseDetail> = output<DrawerCloseDetail>();
  protected readonly body: Signal<TemplateRef<unknown>> = viewChild.required<TemplateRef<unknown>>('body');

  constructor() {
    bindModal<Drawer, Options>({
      create: (options, doc) => Drawer.create(options, doc),
      configKey: 'drawer',
      options: () =>
        defined<Options>({
          title: this.title(),
          description: this.description(),
          actions: this.actions(),
          modal: this.modal(),
          placement: this.placement(),
          size: this.size(),
          closeOnEscape: this.closeOnEscape(),
          closeOnBackdrop: this.closeOnBackdrop(),
          showCloseButton: this.showCloseButton(),
          direction: this.direction(),
          icons: this.icons(),
        }),
      body: this.body,
      open: this.open,
      events: { 'aui-open': emitTo(this.opened), 'aui-cancel': emitTo(this.cancelled), 'aui-close': emitTo(this.closed) },
    });
  }
}
