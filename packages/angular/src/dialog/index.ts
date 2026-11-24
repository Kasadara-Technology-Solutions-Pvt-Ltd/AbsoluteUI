import { ChangeDetectionStrategy, Component, input, model, output, viewChild, ViewEncapsulation, type InputSignal, type ModelSignal, type OutputEmitterRef, type Signal, type TemplateRef } from '@angular/core';
import { Dialog, type DialogCloseDetail, type DialogOptions } from '@absoluteui/components/dialog';
import { defined, emitTo } from '../internal/bridge.js';
import { bindModal } from '../internal/modal.js';

type Options = Omit<DialogOptions, 'content'>;

/**
 * AbsoluteUI Dialog; the projected content is the body:
 * `<aui-dialog title="Delete file?" [(open)]="confirming"><p>This cannot be undone.</p></aui-dialog>`.
 * `open` follows user dismissals (Escape, backdrop, close button, actions).
 */
@Component({
  selector: 'aui-dialog',
  exportAs: 'auiDialog',
  template: '<ng-template #body><ng-content /></ng-template>',
  styleUrls: ['../../../components/dist/dialog/style.css', '../../../components/dist/button/style.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuiDialog {
  /** Whether the dialog is shown: `[(open)]`. Closing by Escape, the close button, or an action sets it to false. */
  readonly open: ModelSignal<boolean> = model(false);
  readonly title: InputSignal<Options['title']> = input.required<Options['title']>();
  readonly description: InputSignal<Options['description'] | undefined> = input<Options['description']>();
  readonly actions: InputSignal<Options['actions'] | undefined> = input<Options['actions']>();
  readonly role: InputSignal<Options['role'] | undefined> = input<Options['role']>();
  readonly size: InputSignal<Options['size'] | undefined> = input<Options['size']>();
  readonly closeOnEscape: InputSignal<Options['closeOnEscape'] | undefined> = input<Options['closeOnEscape']>();
  readonly closeOnBackdrop: InputSignal<Options['closeOnBackdrop'] | undefined> = input<Options['closeOnBackdrop']>();
  readonly showCloseButton: InputSignal<Options['showCloseButton'] | undefined> = input<Options['showCloseButton']>();
  readonly icons: InputSignal<Options['icons'] | undefined> = input<Options['icons']>();
  readonly opened: OutputEmitterRef<null> = output<null>();
  /** Dismissal by Escape or backdrop, before `closed`. */
  readonly cancelled: OutputEmitterRef<DialogCloseDetail> = output<DialogCloseDetail>();
  readonly closed: OutputEmitterRef<DialogCloseDetail> = output<DialogCloseDetail>();
  protected readonly body: Signal<TemplateRef<unknown>> = viewChild.required<TemplateRef<unknown>>('body');

  constructor() {
    bindModal<Dialog, Options>({
      create: (options, doc) => Dialog.create(options, doc),
      configKey: 'dialog',
      options: () =>
        defined<Options>({
          title: this.title(),
          description: this.description(),
          actions: this.actions(),
          role: this.role(),
          size: this.size(),
          closeOnEscape: this.closeOnEscape(),
          closeOnBackdrop: this.closeOnBackdrop(),
          showCloseButton: this.showCloseButton(),
          icons: this.icons(),
        }),
      body: this.body,
      open: this.open,
      events: { 'aui-open': emitTo(this.opened), 'aui-cancel': emitTo(this.cancelled), 'aui-close': emitTo(this.closed) },
    });
  }
}
