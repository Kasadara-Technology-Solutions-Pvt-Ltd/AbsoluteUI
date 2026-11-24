/**
 * Angular templates for AbsoluteUI render slots (docs/PLAN-R9-ANGULAR.md M3, D8).
 * Put an `<ng-template>` with one of these directives inside the component:
 *
 * ```html
 * <aui-data-table caption="People" [columns]="columns" [rows]="people" [rowId]="byId">
 *   <ng-template auiCell="name" [auiCellOf]="people" let-person>
 *     <app-avatar [user]="person" /> {{ person.name }}
 *   </ng-template>
 *   <ng-template auiRowDetail [auiRowDetailOf]="people" let-person>...</ng-template>
 * </aui-data-table>
 * ```
 *
 * Each rendered template is a live embedded view (bindings, components, DI, change
 * detection); it is destroyed when the component drops the node (row re-rendered,
 * collapsed, removed, or the component destroyed). The optional `...Of` inputs only
 * type the template context (`let-person` gets the element type of the bound array).
 */
import { Directive, inject, input, TemplateRef, type InputSignal } from '@angular/core';
import type { DataTableGroup } from '@absoluteui/components/data-table';

/** Context of a cell template: the row, and the column id. */
export interface AuiCellContext<Row> {
  readonly $implicit: Row;
  readonly row: Row;
  readonly column: string;
}

/** Context of a row detail template. */
export interface AuiRowDetailContext<Row> {
  readonly $implicit: Row;
  readonly row: Row;
}

/** Context of an item template (Kanban card, Org Chart node, Scheduler event): the item and the component's render context. */
export interface AuiItemContext<Item, Extra = unknown> {
  readonly $implicit: Item;
  readonly item: Item;
  readonly context: Extra;
}

/** Cell template for one column of `<aui-data-table>`: `<ng-template auiCell="name" let-row>`, or `<ng-template auiCell let-row>` inside `<aui-column>`. */
@Directive({ selector: 'ng-template[auiCell]' })
export class AuiCell<Row = unknown> {
  /** Column id; leave it empty inside `<aui-column>`, which owns the template. */
  readonly column: InputSignal<string> = input<string>('', { alias: 'auiCell' });
  /** Types the context only: the rows bound to the table. */
  readonly of: InputSignal<readonly Row[] | null | undefined> = input<readonly Row[] | null>(undefined, { alias: 'auiCellOf' });
  /** @internal Read by the component that renders the template. */
  readonly template: TemplateRef<AuiCellContext<Row>> = inject<TemplateRef<AuiCellContext<Row>>>(TemplateRef);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Angular template guard: the parameter exists for the type predicate
  static ngTemplateContextGuard<Row>(_dir: AuiCell<Row>, _ctx: unknown): _ctx is AuiCellContext<Row> {
    return true;
  }
}

/** Row detail template of `<aui-data-table>` (expandable rows): `<ng-template auiRowDetail let-row>`. */
@Directive({ selector: 'ng-template[auiRowDetail]' })
export class AuiRowDetail<Row = unknown> {
  /** Types the context only: the rows bound to the table. */
  readonly of: InputSignal<readonly Row[] | null | undefined> = input<readonly Row[] | null>(undefined, { alias: 'auiRowDetailOf' });
  /** @internal Read by the component that renders the template. */
  readonly template: TemplateRef<AuiRowDetailContext<Row>> = inject<TemplateRef<AuiRowDetailContext<Row>>>(TemplateRef);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Angular template guard: the parameter exists for the type predicate
  static ngTemplateContextGuard<Row>(_dir: AuiRowDetail<Row>, _ctx: unknown): _ctx is AuiRowDetailContext<Row> {
    return true;
  }
}

/**
 * Item template: menu items (`button[auiMenu]`, `[auiContextMenu]`, `<aui-menu-bar>`), Kanban cards (`<aui-kanban>`), Org Chart nodes (`<aui-org-chart>`), Scheduler
 * events (`<aui-scheduler>`): `<ng-template auiItem [auiItemOf]="cards" let-card let-ctx="context">`.
 */
@Directive({ selector: 'ng-template[auiItem]' })
export class AuiItem<Item = unknown> {
  /** Types the context only: the items bound to the component. */
  readonly of: InputSignal<readonly Item[] | null | undefined> = input<readonly Item[] | null>(undefined, { alias: 'auiItemOf' });
  /** @internal Read by the component that renders the template. */
  readonly template: TemplateRef<AuiItemContext<Item>> = inject<TemplateRef<AuiItemContext<Item>>>(TemplateRef);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Angular template guard: the parameter exists for the type predicate
  static ngTemplateContextGuard<Item>(_dir: AuiItem<Item>, _ctx: unknown): _ctx is AuiItemContext<Item> {
    return true;
  }
}

/** Context of a selected item template: the selected option. */
export interface AuiSelectedItemContext<Item> {
  readonly $implicit: Item;
  readonly item: Item;
}

/** Content shown for the selected option of `<aui-select>`: `<ng-template auiSelectedItem let-option>`. */
@Directive({ selector: 'ng-template[auiSelectedItem]' })
export class AuiSelectedItem<Item = unknown> {
  /** Types the context only: the options bound to the select. */
  readonly of: InputSignal<readonly Item[] | null | undefined> = input<readonly Item[] | null>(undefined, { alias: 'auiSelectedItemOf' });
  /** @internal Read by the component that renders the template. */
  readonly template: TemplateRef<AuiSelectedItemContext<Item>> = inject<TemplateRef<AuiSelectedItemContext<Item>>>(TemplateRef);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Angular template guard: the parameter exists for the type predicate
  static ngTemplateContextGuard<Item>(_dir: AuiSelectedItem<Item>, _ctx: unknown): _ctx is AuiSelectedItemContext<Item> {
    return true;
  }
}

/** Context of a header template: the column. */
export interface AuiHeaderContext {
  readonly $implicit: string;
  /** Column id. */
  readonly column: string;
  /** The column's header text (its accessible name). */
  readonly header: string;
}

/**
 * Header content of a `<aui-data-table>` column (decorative: the header text stays the
 * accessible name): `<ng-template auiHeader="salary" let-header="header">`, or without an id inside `<aui-column>`.
 */
@Directive({ selector: 'ng-template[auiHeader]' })
export class AuiHeader {
  /** Column id; leave it empty inside `<aui-column>`. */
  readonly column: InputSignal<string> = input<string>('', { alias: 'auiHeader' });
  /** @internal Read by the component that renders the template. */
  readonly template: TemplateRef<AuiHeaderContext> = inject<TemplateRef<AuiHeaderContext>>(TemplateRef);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Angular template guard: the parameter exists for the type predicate
  static ngTemplateContextGuard(_dir: AuiHeader, _ctx: unknown): _ctx is AuiHeaderContext {
    return true;
  }
}

/** Empty state of `<aui-data-table>` (replaces `emptyMessage`): `<ng-template auiEmpty>`. */
@Directive({ selector: 'ng-template[auiEmpty]' })
export class AuiEmpty {
  /** @internal Read by the component that renders the template. */
  readonly template: TemplateRef<unknown> = inject<TemplateRef<unknown>>(TemplateRef);
}

/** Context of a group header template. */
export interface AuiGroupHeaderContext<Row> {
  readonly $implicit: DataTableGroup<Row>;
  readonly group: DataTableGroup<Row>;
}

/**
 * Group header content of `<aui-data-table [groupBy]>` (decorative: the toggle keeps the
 * default text as its name): `<ng-template auiGroupHeader [auiGroupHeaderOf]="rows" let-group>`.
 */
@Directive({ selector: 'ng-template[auiGroupHeader]' })
export class AuiGroupHeader<Row = unknown> {
  /** Types the context only: the rows bound to the table. */
  readonly of: InputSignal<readonly Row[] | null | undefined> = input<readonly Row[] | null>(undefined, { alias: 'auiGroupHeaderOf' });
  /** @internal Read by the component that renders the template. */
  readonly template: TemplateRef<AuiGroupHeaderContext<Row>> = inject<TemplateRef<AuiGroupHeaderContext<Row>>>(TemplateRef);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Angular template guard: the parameter exists for the type predicate
  static ngTemplateContextGuard<Row>(_dir: AuiGroupHeader<Row>, _ctx: unknown): _ctx is AuiGroupHeaderContext<Row> {
    return true;
  }
}

/** Context of an editor template: the value being edited and how to finish. */
export interface AuiEditorContext<Row> {
  readonly $implicit: unknown;
  readonly value: unknown;
  readonly row: Row;
  readonly column: string;
  /** Validation message of the last commit, or null. */
  readonly error: string | null;
  commit(value: unknown): void;
  cancel(): void;
}

/**
 * Custom inline editor of an editable `<aui-data-table>` column: `<ng-template auiEditor let-value let-commit="commit" let-cancel="cancel">`
 * inside `<aui-column editable>` (or `auiEditor="columnId"` at table level). Call `commit(value)` or `cancel()`.
 */
@Directive({ selector: 'ng-template[auiEditor]' })
export class AuiEditor<Row = unknown> {
  /** Column id; leave it empty inside `<aui-column>`. */
  readonly column: InputSignal<string> = input<string>('', { alias: 'auiEditor' });
  /** Types the context only: the rows bound to the table. */
  readonly of: InputSignal<readonly Row[] | null | undefined> = input<readonly Row[] | null>(undefined, { alias: 'auiEditorOf' });
  /** @internal Read by the component that renders the template. */
  readonly template: TemplateRef<AuiEditorContext<Row>> = inject<TemplateRef<AuiEditorContext<Row>>>(TemplateRef);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Angular template guard: the parameter exists for the type predicate
  static ngTemplateContextGuard<Row>(_dir: AuiEditor<Row>, _ctx: unknown): _ctx is AuiEditorContext<Row> {
    return true;
  }
}
