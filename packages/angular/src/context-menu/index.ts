import { contentChild, Directive, input, output, type InputSignal, type OutputEmitterRef, type Signal } from '@angular/core';
import { ContextMenu, type ContextMenuOptions, type ContextMenuSelectDetail } from '@absoluteui/components/context-menu';
import { ComponentBridge, defined, emitTo } from '../internal/bridge.js';
import { AuiItem } from '../templates/index.js';
import { ContextMenuStyles } from '../internal/style-sheets.js';
import { loadStyles } from '../internal/styles.js';

/**
 * AbsoluteUI Context Menu, on the target element:
 * `<div [auiContextMenu]="items" contextMenuLabel="File actions" (selected)="run($event)">...</div>`.
 * The target keeps its Angular-managed children; the menu popup is appended to the
 * enclosing modal dialog or <body>.
 */
@Directive({ selector: '[auiContextMenu]', exportAs: 'auiContextMenu' })
export class AuiContextMenu extends ComponentBridge<ContextMenu, ContextMenuOptions> {
  readonly items: InputSignal<ContextMenuOptions['items']> = input.required<ContextMenuOptions['items']>({ alias: 'auiContextMenu' });
  readonly label: InputSignal<ContextMenuOptions['label']> = input<ContextMenuOptions['label']>(undefined, { alias: 'contextMenuLabel' });
  readonly disabled: InputSignal<ContextMenuOptions['disabled']> = input<ContextMenuOptions['disabled']>(undefined, { alias: 'contextMenuDisabled' });
  readonly closeOnSelect: InputSignal<ContextMenuOptions['closeOnSelect'] | undefined> = input<ContextMenuOptions['closeOnSelect']>();
  readonly typeahead: InputSignal<ContextMenuOptions['typeahead'] | undefined> = input<ContextMenuOptions['typeahead']>();
  readonly nativeModifier: InputSignal<ContextMenuOptions['nativeModifier'] | undefined> = input<ContextMenuOptions['nativeModifier']>();
  readonly direction: InputSignal<ContextMenuOptions['direction'] | undefined> = input<ContextMenuOptions['direction']>();
  readonly icons: InputSignal<ContextMenuOptions['icons'] | undefined> = input<ContextMenuOptions['icons']>();
  /** Custom item content as a function; or put `<ng-template auiItem let-item>` inside the host (since 0.9.0). */
  readonly renderItem: InputSignal<ContextMenuOptions['renderItem'] | undefined> = input<ContextMenuOptions['renderItem']>();
  protected readonly itemTemplate: Signal<AuiItem | undefined> = contentChild(AuiItem);
  readonly selected: OutputEmitterRef<ContextMenuSelectDetail> = output<ContextMenuSelectDetail>();
  readonly opened: OutputEmitterRef<null> = output<null>();
  readonly closed: OutputEmitterRef<null> = output<null>();

  constructor() {
    super();
    loadStyles(ContextMenuStyles);
    this.init({
      create: (host, options) => {
        const menu = ContextMenu.create(host, options);
        // Lifecycle events are dispatched (non-bubbling) on the menu element.
        menu.element.addEventListener('aui-open', () => {
          this.opened.emit(null);
        });
        menu.element.addEventListener('aui-close', () => {
          this.closed.emit(null);
        });
        return menu;
      },
      configKey: 'contextMenu',
      options: () =>
        defined<ContextMenuOptions>({
          items: this.items(),
          label: this.label(),
          disabled: this.disabled(),
          closeOnSelect: this.closeOnSelect(),
          typeahead: this.typeahead(),
          nativeModifier: this.nativeModifier(),
          direction: this.direction(),
          icons: this.icons(),
          renderItem: this.renderItem() ?? this.templateHook(this.itemTemplate()?.template, (item: Parameters<NonNullable<ContextMenuOptions['renderItem']>>[0], context: Parameters<NonNullable<ContextMenuOptions['renderItem']>>[1]) => ({ $implicit: item, item, context })),
        }),
      events: { 'aui-select': emitTo(this.selected) },
    });
  }

  /** Open at client coordinates, or below the target. */
  open(point?: { x: number; y: number }): void {
    this.controller?.open(point);
  }

  /** Close the menu (and its submenus). */
  close(): void {
    this.controller?.close();
  }
}
