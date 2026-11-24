import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input, type InputSignal } from '@angular/core';
import type { Direction } from '@absoluteui/core';
import { DataTableColumnChooser, type DataTableColumnChooserOptions } from '@absoluteui/components/data-table';
import type { MenuPlacement } from '@absoluteui/components/menu';
import { controllerOf, defined } from '../internal/bridge.js';
import { MenuStyles } from '../internal/style-sheets.js';
import { loadStyles } from '../internal/styles.js';
import type { AuiDataTable } from './index.js';

/** Attempts to find the table controller when the table renders after the button (same render pass). */
const ATTEMPTS = 3;

/**
 * Angular binding for DataTableColumnChooser (since 0.3.0):
 * `<button type="button" [auiDataTableColumnChooser]="table">Columns</button>` where `table` is an
 * `<aui-data-table #table="auiDataTable">` reference. Options are read once at creation.
 */
@Directive({ selector: 'button[auiDataTableColumnChooser]', exportAs: 'auiDataTableColumnChooser' })
export class AuiDataTableColumnChooser<Row> {
  /** The table whose columns the menu shows and hides: a `#table="auiDataTable"` reference. */
  readonly table: InputSignal<AuiDataTable<Row>> = input.required<AuiDataTable<Row>>({ alias: 'auiDataTableColumnChooser' });
  /** Accessible name of the menu (default "Columns"). */
  readonly menuLabel: InputSignal<string | undefined> = input<string>();
  /** Menu position relative to the button. */
  readonly placement: InputSignal<MenuPlacement | undefined> = input<MenuPlacement>();
  readonly direction: InputSignal<Direction | undefined> = input<Direction>();
  #chooser: DataTableColumnChooser<Row> | null = null;
  #destroyed = false;

  constructor() {
    loadStyles(MenuStyles);
    const host = inject<ElementRef<HTMLButtonElement>>(ElementRef).nativeElement;
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#chooser?.destroy();
      this.#chooser = null;
    });
    const create = (attempt: number): void => {
      if (this.#destroyed || this.#chooser) return;
      const table = controllerOf(this.table())();
      if (!table) {
        // The table directive creates its controller in its own afterNextRender callback.
        if (attempt < ATTEMPTS) {
          queueMicrotask(() => {
            create(attempt + 1);
          });
          return;
        }
        throw new TypeError('auiDataTableColumnChooser: the bound aui-data-table is not rendered (render it in the same template).');
      }
      this.#chooser = DataTableColumnChooser.create(host, table, defined<DataTableColumnChooserOptions>({
        label: this.menuLabel(),
        placement: this.placement(),
        direction: this.direction(),
      }));
    };
    afterNextRender(() => {
      create(0);
    });
  }
}
