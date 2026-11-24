import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, output, untracked, ViewEncapsulation, type InputSignal, type OutputEmitterRef } from '@angular/core';
import { PivotFieldList, type PivotFieldMoveDetail, type PivotGrid } from '@absoluteui/components/pivot-grid';
import { controllerOf } from '../internal/bridge.js';
import type { AuiPivotGrid } from '../pivot-grid/index.js';

/**
 * AbsoluteUI Pivot Field List for a Pivot Grid in the same template:
 * `<aui-pivot-grid #pivot="auiPivotGrid" ...></aui-pivot-grid>
 *  <aui-pivot-field-list label="Pivot fields" [grid]="pivot"></aui-pivot-field-list>`.
 * The field list applies layout changes to the grid itself; the grid reports them through
 * `[(layout)]` and `(layoutChanged)`. Created when the grid exists and re-created when it changes.
 */
@Component({
  selector: 'aui-pivot-field-list',
  exportAs: 'auiPivotFieldList',
  template: '',
  styleUrls: ['../../../components/dist/pivot-grid/style.css'],
  styles: ['@layer aui.base{:where(aui-pivot-field-list){display:block}}'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuiPivotFieldList<Row extends object> {
  /** The pivot grid it edits: a `#pivot="auiPivotGrid"` reference. */
  readonly grid: InputSignal<AuiPivotGrid<Row> | null | undefined> = input<AuiPivotGrid<Row> | null>();
  /** Accessible name of the field list. */
  readonly label: InputSignal<string> = input.required<string>();
  /** Members shown per page in a field filter. */
  readonly memberPageSize: InputSignal<number | undefined> = input<number>();
  /** Messages locale (defaults to the configured locale). */
  readonly locale: InputSignal<string | undefined> = input<string>();
  /** The user moved a field between areas (rows, columns, values, filters, or unused). */
  readonly fieldMoved: OutputEmitterRef<PivotFieldMoveDetail> = output<PivotFieldMoveDetail>();
  readonly #host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  #list: PivotFieldList | null = null;
  #grid: PivotGrid<Row> | null = null;
  #ready = false;

  constructor() {
    const onMove = (event: Event): void => {
      if (event.target === this.#host && event instanceof CustomEvent) {
        // Safe: the field list dispatches PivotFieldMoveDetail (documented contract).
        this.fieldMoved.emit(event.detail as PivotFieldMoveDetail);
      }
    };
    const resolve = (source: AuiPivotGrid<Row> | null | undefined): PivotGrid<Row> | null => (source ? controllerOf(source)() : null);
    effect(() => {
      const grid = resolve(this.grid());
      untracked(() => {
        if (this.#ready) this.#recreate(grid);
      });
    });
    effect(() => {
      const label = this.label();
      const memberPageSize = this.memberPageSize();
      untracked(() => {
        this.#list?.update({ label, ...(memberPageSize === undefined ? {} : { memberPageSize }) });
      });
    });
    afterNextRender(() => {
      this.#ready = true;
      this.#host.addEventListener('aui-field-move', onMove);
      this.#recreate(untracked(() => resolve(this.grid())));
    });
    inject(DestroyRef).onDestroy(() => {
      this.#host.removeEventListener('aui-field-move', onMove);
      this.#list?.destroy();
      this.#list = null;
    });
  }

  #recreate(grid: PivotGrid<Row> | null): void {
    if (this.#list && this.#grid === grid) return;
    this.#list?.destroy();
    this.#list = null;
    this.#grid = grid;
    if (!grid) return;
    const memberPageSize = untracked(this.memberPageSize);
    const locale = untracked(this.locale);
    this.#list = PivotFieldList.create(this.#host, {
      grid,
      label: untracked(this.label),
      ...(memberPageSize === undefined ? {} : { memberPageSize }),
      ...(locale === undefined ? {} : { locale }),
    });
  }
}
