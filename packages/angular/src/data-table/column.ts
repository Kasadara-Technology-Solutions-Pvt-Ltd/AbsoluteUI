/**
 * Declarative Data Table columns (docs/PLAN-R9-ANGULAR.md M5):
 *
 * ```html
 * <aui-data-table caption="Employees" [rows]="employees()" [rowId]="byId" [(selected)]="picked">
 *   <aui-column field="name" header="Employee" rowHeader>
 *     <ng-template auiCell let-row><app-avatar [user]="row" /> {{ row.name }}</ng-template>
 *   </aui-column>
 *   <aui-column field="salary" header="Salary" type="currency" currency="EUR" aggregate="sum" />
 * </aui-data-table>
 * ```
 *
 * Inputs mirror `DataTableColumn` (except `render`/`renderHeader`, which come from the
 * column's `auiCell`/`auiHeader` templates). `field` reads a property of the row; bind
 * `[accessor]` for computed values. Use either `[columns]` or `<aui-column>` children.
 */
import { booleanAttribute, contentChild, Directive, input, type InputSignal, type InputSignalWithTransform, type Signal } from '@angular/core';
import type { DataTableAggregate, DataTableAlign, DataTableColumn, DataTableColumnType, DataTableEditorKind, DataTableFilterKind, DataTableFilterOption } from '@absoluteui/components/data-table';
import { AuiCell, AuiEditor, AuiHeader } from '../templates/index.js';

const optionalBoolean = (value: unknown): boolean | undefined => (value === undefined ? undefined : booleanAttribute(value));

@Directive({ selector: 'aui-column' })
export class AuiColumn<Row = unknown> {
  /** Column id; defaults to `field`. */
  readonly id: InputSignal<string | undefined> = input<string>();
  /** Row property shown in the column (when no `accessor` is bound). */
  readonly field: InputSignal<string | undefined> = input<string>();
  /** Header text and the column's accessible name. */
  readonly header: InputSignal<string> = input.required<string>();
  /** Raw value used for sorting and default rendering (instead of `field`). */
  readonly accessor: InputSignal<((row: Row) => unknown) | undefined> = input<(row: Row) => unknown>();
  /** Typed formatting and sorting: text (default), number, currency (needs `currency`), date (PlainDate), datetime (Instant, shown in the configured time zone), or boolean. */
  readonly type: InputSignal<DataTableColumnType | undefined> = input<DataTableColumnType>();
  /** ISO 4217 code for `type="currency"`, for example EUR. */
  readonly currency: InputSignal<string | undefined> = input<string>();
  /** Cell text (rendered as text, never HTML); overrides typed formatting. */
  readonly format: InputSignal<((value: unknown, row: Row) => string) | undefined> = input<(value: unknown, row: Row) => string>();
  /** Whether users can sort by this column (default true). */
  readonly sortable: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: optionalBoolean });
  /** Custom comparator (ascending). */
  readonly compare: InputSignal<((a: Row, b: Row) => number) | undefined> = input<(a: Row, b: Row) => number>();
  /** Cell alignment; default end for number and currency columns, otherwise start. */
  readonly align: InputSignal<DataTableAlign | undefined> = input<DataTableAlign>();
  /** CSS length: a number followed by px, rem, em, %, or ch. */
  readonly width: InputSignal<string | undefined> = input<string>();
  /** Render cells as row headers (`th scope="row"`); default: the first column. */
  readonly rowHeader: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: optionalBoolean });
  /** Filter kind: text, number, date, or enum (number needs a number or currency column, date a date or datetime column, enum `filterOptions` or a boolean column). */
  readonly filter: InputSignal<DataTableFilterKind | undefined> = input<DataTableFilterKind>();
  /** Options of an enum filter (default for boolean columns: Yes / No). */
  readonly filterOptions: InputSignal<readonly DataTableFilterOption[] | undefined> = input<readonly DataTableFilterOption[]>();
  readonly searchable: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: optionalBoolean });
  /** Whether the column chooser may hide the column (default true). */
  readonly hideable: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: optionalBoolean });
  readonly resizable: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: optionalBoolean });
  /** Minimum resize width in pixels (default 64). */
  readonly minWidth: InputSignal<number | undefined> = input<number>();
  /** Maximum resize width in pixels (default 960). */
  readonly maxWidth: InputSignal<number | undefined> = input<number>();
  /** Include the column in CSV exports (default true). */
  readonly exportable: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: optionalBoolean });
  /** CSV cell value; overrides the formatted or raw value. */
  readonly exportValue: InputSignal<((row: Row) => string | number | boolean | null) | undefined> = input<(row: Row) => string | number | boolean | null>();
  /** Aggregate shown in group headers and the totals row: sum, avg, min, max, count, or a function of the values and rows. */
  readonly aggregate: InputSignal<DataTableAggregate<Row> | undefined> = input<DataTableAggregate<Row>>();
  /** Inline editing: `editable` (bare attribute) or a function of the row. */
  readonly editable: InputSignalWithTransform<boolean | ((row: Row) => boolean) | undefined, unknown> = input<boolean | ((row: Row) => boolean) | undefined, unknown>(undefined, {
    // Safe: a bound function is the documented `(row) => boolean`; anything else is a boolean attribute.
    transform: (value: unknown) => (typeof value === 'function' ? (value as (row: Row) => boolean) : optionalBoolean(value)),
  });
  /** Built-in inline editor: text, number, date, select, or checkbox (default from `type`). */
  readonly editor: InputSignal<DataTableEditorKind | undefined> = input<DataTableEditorKind>();
  /** Choices of the select editor. */
  readonly editOptions: InputSignal<readonly DataTableFilterOption[] | undefined> = input<readonly DataTableFilterOption[]>();
  /** Validate an edited value; return a message to keep the editor open with an error. */
  readonly validate: InputSignal<((value: unknown, row: Row) => string | null) | undefined> = input<(value: unknown, row: Row) => string | null>();
  /** @internal The column's own editor template. */
  readonly editorTemplate: Signal<AuiEditor | undefined> = contentChild(AuiEditor);
  /** @internal The column's own cell template. */
  readonly cellTemplate: Signal<AuiCell | undefined> = contentChild(AuiCell);
  /** @internal The column's own header template. */
  readonly headerTemplate: Signal<AuiHeader | undefined> = contentChild(AuiHeader);

  /** @internal The column definition (without templates). */
  definition(): DataTableColumn<Row> {
    const field = this.field();
    const id = this.id() ?? field;
    if (id === undefined) throw new TypeError(`aui-column "${this.header()}" needs an id or a field.`);
    const accessor =
      this.accessor() ??
      ((row: Row): unknown => (field !== undefined && typeof row === 'object' && row !== null ? (row as Record<string, unknown>)[field] : undefined));
    const out: DataTableColumn<Row> = { id, header: this.header(), accessor };
    const set = <K extends keyof DataTableColumn<Row>>(key: K, value: DataTableColumn<Row>[K] | undefined): void => {
      if (value !== undefined) out[key] = value;
    };
    set('type', this.type());
    set('currency', this.currency());
    set('format', this.format());
    set('sortable', this.sortable());
    set('compare', this.compare());
    set('align', this.align());
    set('width', this.width());
    set('rowHeader', this.rowHeader());
    set('filter', this.filter());
    set('filterOptions', this.filterOptions());
    set('searchable', this.searchable());
    set('hideable', this.hideable());
    set('resizable', this.resizable());
    set('minWidth', this.minWidth());
    set('maxWidth', this.maxWidth());
    set('exportable', this.exportable());
    set('exportValue', this.exportValue());
    set('aggregate', this.aggregate());
    set('editable', this.editable());
    set('editor', this.editor());
    set('editOptions', this.editOptions());
    set('validate', this.validate());
    return out;
  }
}
