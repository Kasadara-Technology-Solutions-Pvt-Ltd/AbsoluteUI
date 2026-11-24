import { ChangeDetectionStrategy, Component, input, model, output, viewChild, ViewEncapsulation, type InputSignal, type ModelSignal, type OutputEmitterRef, type Signal, type TemplateRef } from '@angular/core';
import { BottomSheet, type BottomSheetCloseDetail, type BottomSheetOptions, type BottomSheetSnapChangeDetail } from '@absoluteui/components/bottom-sheet';
import { defined, emitTo } from '../internal/bridge.js';
import { bindModal } from '../internal/modal.js';

type Options = Omit<BottomSheetOptions, 'content'>;

/**
 * AbsoluteUI Bottom Sheet; the projected content is the body:
 * `<aui-bottom-sheet title="Share" [(open)]="sharing">...</aui-bottom-sheet>`.
 * `modal` is read once at creation (init-only).
 */
@Component({
  selector: 'aui-bottom-sheet',
  exportAs: 'auiBottomSheet',
  template: '<ng-template #body><ng-content /></ng-template>',
  styleUrls: ['../../../components/dist/bottom-sheet/style.css', '../../../components/dist/button/style.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuiBottomSheet {
  /** Whether the bottom sheet is shown: `[(open)]`. Closing by Escape, the close button, or an action sets it to false. */
  readonly open: ModelSignal<boolean> = model(false);
  readonly title: InputSignal<Options['title']> = input.required<Options['title']>();
  readonly description: InputSignal<Options['description'] | undefined> = input<Options['description']>();
  readonly snapPoints: InputSignal<Options['snapPoints'] | undefined> = input<Options['snapPoints']>();
  readonly snap: InputSignal<Options['snap'] | undefined> = input<Options['snap']>();
  readonly modal: InputSignal<Options['modal'] | undefined> = input<Options['modal']>();
  readonly closeOnEscape: InputSignal<Options['closeOnEscape'] | undefined> = input<Options['closeOnEscape']>();
  readonly closeOnBackdrop: InputSignal<Options['closeOnBackdrop'] | undefined> = input<Options['closeOnBackdrop']>();
  readonly showCloseButton: InputSignal<Options['showCloseButton'] | undefined> = input<Options['showCloseButton']>();
  readonly closeOnDragDown: InputSignal<Options['closeOnDragDown'] | undefined> = input<Options['closeOnDragDown']>();
  readonly icons: InputSignal<Options['icons'] | undefined> = input<Options['icons']>();
  readonly opened: OutputEmitterRef<null> = output<null>();
  readonly cancelled: OutputEmitterRef<BottomSheetCloseDetail> = output<BottomSheetCloseDetail>();
  readonly closed: OutputEmitterRef<BottomSheetCloseDetail> = output<BottomSheetCloseDetail>();
  /** The user picked a height (snap point index). */
  readonly snapChange: OutputEmitterRef<BottomSheetSnapChangeDetail> = output<BottomSheetSnapChangeDetail>();
  protected readonly body: Signal<TemplateRef<unknown>> = viewChild.required<TemplateRef<unknown>>('body');
  readonly #modal = bindModal<BottomSheet, Options>({
    create: (options, doc) => BottomSheet.create(options, doc),
    configKey: 'bottomSheet',
    options: () =>
      defined<Options>({
        title: this.title(),
        description: this.description(),
        snapPoints: this.snapPoints(),
        snap: this.snap(),
        modal: this.modal(),
        closeOnEscape: this.closeOnEscape(),
        closeOnBackdrop: this.closeOnBackdrop(),
        showCloseButton: this.showCloseButton(),
        closeOnDragDown: this.closeOnDragDown(),
        icons: this.icons(),
      }),
    body: this.body,
    open: this.open,
    events: {
      'aui-open': emitTo(this.opened),
      'aui-cancel': emitTo(this.cancelled),
      'aui-close': emitTo(this.closed),
      'aui-snap-change': emitTo(this.snapChange),
    },
  });

  /** Move to a snap point (index into `snapPoints`). */
  snapTo(index: number): void {
    this.#modal.controller()?.snapTo(index);
  }
}
