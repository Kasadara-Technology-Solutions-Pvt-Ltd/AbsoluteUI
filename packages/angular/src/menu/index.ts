import { contentChild, Directive, input, output, type InputSignal, type OutputEmitterRef, type Signal } from '@angular/core';
import { Menu, type MenuOptions, type MenuSelectDetail } from '@absoluteui/components/menu';
import { ComponentBridge, defined, emitTo } from '../internal/bridge.js';
import { AuiItem } from '../templates/index.js';
import { MenuStyles } from '../internal/style-sheets.js';
import { loadStyles } from '../internal/styles.js';

/**
 * AbsoluteUI Menu on its trigger: `<button [auiMenu]="items" (selected)="run($event.id)">Actions</button>`.
 */
@Directive({ selector: 'button[auiMenu]', exportAs: 'auiMenu' })
export class AuiMenu extends ComponentBridge<Menu, MenuOptions> {
  readonly items: InputSignal<MenuOptions['items']> = input.required<MenuOptions['items']>({ alias: 'auiMenu' });
  readonly label: InputSignal<MenuOptions['label']> = input<MenuOptions['label']>(undefined, { alias: 'menuLabel' });
  readonly placement: InputSignal<MenuOptions['placement'] | undefined> = input<MenuOptions['placement']>();
  readonly closeOnSelect: InputSignal<MenuOptions['closeOnSelect'] | undefined> = input<MenuOptions['closeOnSelect']>();
  readonly typeahead: InputSignal<MenuOptions['typeahead'] | undefined> = input<MenuOptions['typeahead']>();
  readonly direction: InputSignal<MenuOptions['direction'] | undefined> = input<MenuOptions['direction']>();
  readonly icons: InputSignal<MenuOptions['icons'] | undefined> = input<MenuOptions['icons']>();
  /** Custom item content as a function; or put `<ng-template auiItem let-item>` inside the host (since 0.9.0). */
  readonly renderItem: InputSignal<MenuOptions['renderItem'] | undefined> = input<MenuOptions['renderItem']>();
  protected readonly itemTemplate: Signal<AuiItem | undefined> = contentChild(AuiItem);
  readonly selected: OutputEmitterRef<MenuSelectDetail> = output<MenuSelectDetail>();
  readonly opened: OutputEmitterRef<null> = output<null>();
  readonly closed: OutputEmitterRef<null> = output<null>();

  constructor() {
    super();
    loadStyles(MenuStyles);
    this.init({
      create: (host, options) => {
        if (!(host instanceof HTMLButtonElement)) throw new TypeError('auiMenu requires a <button> host.');
        const menu = Menu.create(host, options);
        // Lifecycle events are dispatched (non-bubbling) on the menu element.
        menu.element.addEventListener('aui-open', () => {
          this.opened.emit(null);
        });
        menu.element.addEventListener('aui-close', () => {
          this.closed.emit(null);
        });
        return menu;
      },
      configKey: 'menu',
      options: () =>
        defined<MenuOptions>({
          items: this.items(),
          label: this.label(),
          placement: this.placement(),
          closeOnSelect: this.closeOnSelect(),
          typeahead: this.typeahead(),
          direction: this.direction(),
          icons: this.icons(),
          renderItem: this.renderItem() ?? this.templateHook(this.itemTemplate()?.template, (item: Parameters<NonNullable<MenuOptions['renderItem']>>[0], context: Parameters<NonNullable<MenuOptions['renderItem']>>[1]) => ({ $implicit: item, item, context })),
        }),
      events: { 'aui-select': emitTo(this.selected) },
    });
  }

  /** Open the menu and focus its first (or last) item. */
  open(focus?: 'first' | 'last'): void {
    this.controller?.open(focus);
  }

  /** Close the menu (and its submenus). */
  close(): void {
    this.controller?.close();
  }
}
