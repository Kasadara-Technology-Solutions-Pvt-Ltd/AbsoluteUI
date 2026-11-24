import { ChangeDetectionStrategy, Component, input, model, output, viewChild, ViewEncapsulation, type InputSignal, type ModelSignal, type OutputEmitterRef, type Signal, type TemplateRef } from '@angular/core';
import type { DialogCloseDetail } from '@absoluteui/components/dialog';
import {
  SessionWarningDialog,
  type SessionWarningDialogOptions,
  type SessionWarningExtendDetail,
  type SessionWarningSignOutDetail,
} from '@absoluteui/components/session-warning-dialog';
import { defined, emitTo } from '../internal/bridge.js';
import { bindModal } from '../internal/modal.js';

type Options = Omit<SessionWarningDialogOptions, 'content'>;

/**
 * AbsoluteUI Session Warning Dialog; projected content is added below the countdown:
 * `<aui-session-warning-dialog [expiresAt]="deadline()" [(open)]="warn" (extended)="extend()">...</aui-session-warning-dialog>`.
 * With `warnBefore` it opens itself; `open` follows it either way.
 */
@Component({
  selector: 'aui-session-warning-dialog',
  exportAs: 'auiSessionWarningDialog',
  template: '<ng-template #body><ng-content /></ng-template>',
  styleUrls: ['../../../components/dist/dialog/style.css', '../../../components/dist/button/style.css', '../../../components/dist/session-warning-dialog/style.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuiSessionWarningDialog {
  /** Whether the warning dialog is shown: `[(open)]`. Closing by Escape, the close button, or an action sets it to false. */
  readonly open: ModelSignal<boolean> = model(false);
  readonly expiresAt: InputSignal<Options['expiresAt']> = input.required<Options['expiresAt']>();
  readonly warnBefore: InputSignal<Options['warnBefore'] | undefined> = input<Options['warnBefore']>();
  readonly title: InputSignal<Options['title'] | undefined> = input<Options['title']>();
  readonly message: InputSignal<Options['message'] | undefined> = input<Options['message']>();
  readonly extendLabel: InputSignal<Options['extendLabel'] | undefined> = input<Options['extendLabel']>();
  readonly signOutLabel: InputSignal<Options['signOutLabel'] | undefined> = input<Options['signOutLabel']>();
  readonly expiredTitle: InputSignal<Options['expiredTitle'] | undefined> = input<Options['expiredTitle']>();
  readonly expiredMessage: InputSignal<Options['expiredMessage'] | undefined> = input<Options['expiredMessage']>();
  readonly signInLabel: InputSignal<Options['signInLabel'] | undefined> = input<Options['signInLabel']>();
  readonly announceInterval: InputSignal<Options['announceInterval'] | undefined> = input<Options['announceInterval']>();
  readonly escapeExtends: InputSignal<Options['escapeExtends'] | undefined> = input<Options['escapeExtends']>();
  readonly locale: InputSignal<Options['locale'] | undefined> = input<Options['locale']>();
  readonly opened: OutputEmitterRef<null> = output<null>();
  readonly closed: OutputEmitterRef<DialogCloseDetail> = output<DialogCloseDetail>();
  readonly extended: OutputEmitterRef<SessionWarningExtendDetail> = output<SessionWarningExtendDetail>();
  readonly signedOut: OutputEmitterRef<SessionWarningSignOutDetail> = output<SessionWarningSignOutDetail>();
  readonly expired: OutputEmitterRef<null> = output<null>();
  protected readonly body: Signal<TemplateRef<unknown>> = viewChild.required<TemplateRef<unknown>>('body');

  constructor() {
    bindModal<SessionWarningDialog, Options>({
      create: (options, doc) => SessionWarningDialog.create(options, doc),
      configKey: 'sessionWarningDialog',
      options: () =>
        defined<Options>({
          expiresAt: this.expiresAt(),
          warnBefore: this.warnBefore(),
          title: this.title(),
          message: this.message(),
          extendLabel: this.extendLabel(),
          signOutLabel: this.signOutLabel(),
          expiredTitle: this.expiredTitle(),
          expiredMessage: this.expiredMessage(),
          signInLabel: this.signInLabel(),
          announceInterval: this.announceInterval(),
          escapeExtends: this.escapeExtends(),
          locale: this.locale(),
        }),
      body: this.body,
      open: this.open,
      events: {
        'aui-open': emitTo(this.opened),
        'aui-close': emitTo(this.closed),
        'aui-extend': emitTo(this.extended),
        'aui-sign-out': emitTo(this.signedOut),
        'aui-expire': emitTo(this.expired),
      },
    });
  }
}
