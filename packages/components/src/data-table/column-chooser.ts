/**
 * Column chooser for Data Table (since 0.3.0): a Menu button whose
 * `menuitemcheckbox` items show and hide columns. It is a separate class, so a
 * plain table does not bundle Menu. Toggles are user changes: the table emits
 * `aui-columns-change` (reason `visibility`). Columns with `hideable: false`, and
 * the last visible column, are disabled items.
 */
import { configurationError, DisposableGroup, type Direction } from '@absoluteui/core';
import { Menu, type MenuCheckboxItem, type MenuPlacement, type MenuSelectDetail } from '../menu/menu.js';
import { DataTable, dataTableInternals } from './data-table.js';

export interface DataTableColumnChooserOptions {
  /** Accessible name of the menu. Default: labelled by the trigger button. */
  label?: string;
  placement?: MenuPlacement;
  direction?: Direction;
}

export class DataTableColumnChooser<Row> {
  readonly trigger: HTMLButtonElement;
  readonly table: DataTable<Row>;
  /** The composed Menu. */
  readonly menu: Menu;
  readonly #group = new DisposableGroup();

  /** Attach a column chooser menu to a consumer-rendered `<button>` for `table`. */
  static create<Row>(trigger: HTMLButtonElement, table: DataTable<Row>, options: DataTableColumnChooserOptions = {}): DataTableColumnChooser<Row> {
    return new DataTableColumnChooser(trigger, table, options);
  }

  private constructor(trigger: HTMLButtonElement, table: DataTable<Row>, options: DataTableColumnChooserOptions) {
    if (!(table instanceof DataTable)) {
      throw configurationError('DATA_TABLE_OPTIONS', 'The column chooser needs a DataTable instance.', { component: 'dataTable', property: 'dataTable.columnChooser.table', expected: 'DataTable' });
    }
    this.trigger = trigger;
    this.table = table;
    // Menu validates the trigger (a <button> attached to a parent node).
    this.menu = Menu.create(trigger, {
      items: this.#items(),
      closeOnSelect: false,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      ...(options.direction === undefined ? {} : { direction: options.direction }),
    });
    const onSelect = (event: Event): void => {
      const detail = (event as CustomEvent<MenuSelectDetail>).detail;
      if (detail.checked === undefined) return;
      dataTableInternals(this.table).setColumnVisible(detail.id, detail.checked);
      this.refresh();
    };
    const refresh = (): void => {
      this.refresh();
    };
    trigger.addEventListener('aui-select', onSelect);
    // Programmatic changes (update, setState) emit nothing: re-read the state on open.
    this.menu.element.addEventListener('aui-open', refresh);
    table.host.addEventListener('aui-columns-change', refresh);
    this.#group.add(() => {
      trigger.removeEventListener('aui-select', onSelect);
      this.menu.element.removeEventListener('aui-open', refresh);
      table.host.removeEventListener('aui-columns-change', refresh);
    });
  }

  /** Rebuild the items from the table's current columns and visibility. */
  refresh(): void {
    if (this.#group.disposed) return;
    this.menu.update({ items: this.#items() });
  }

  destroy(): void {
    this.#group.dispose();
    this.menu.destroy();
  }

  #items(): MenuCheckboxItem[] {
    const state = this.table.getState().columns;
    const hidden = new Set(state.hidden);
    const byId = new Map(this.table.options.columns.map((c) => [c.id, c]));
    const visibleCount = state.order.length - hidden.size;
    return state.order.flatMap((id): MenuCheckboxItem[] => {
      const column = byId.get(id);
      if (!column) return [];
      const checked = !hidden.has(id);
      return [{ type: 'checkbox', id, label: column.header, checked, disabled: checked && (column.hideable === false || visibleCount <= 1) }];
    });
  }
}
