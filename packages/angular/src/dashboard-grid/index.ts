import { ChangeDetectionStrategy, Component, input, model, output, ViewEncapsulation, type InputSignal, type ModelSignal, type OutputEmitterRef } from '@angular/core';
import {
  DashboardGrid,
  type DashboardGridBreakpointChangeDetail,
  type DashboardGridLayoutChangeDetail,
  type DashboardGridOptions,
  type DashboardItem,
} from '@absoluteui/components/dashboard-grid';
import { ComponentBridge, defined, emitTo } from '../internal/bridge.js';

/**
 * AbsoluteUI Dashboard Grid with projected item elements (`data-aui-item` on each child):
 * `<aui-dashboard-grid label="Overview" [(items)]="items" [editable]="editing">
 *    <aui-dashboard-widget data-aui-item="sales" title="Sales">...</aui-dashboard-widget>
 *  </aui-dashboard-grid>`.
 * The children stay Angular-managed; the grid positions them and, in edit mode, adds move
 * handles. `[(items)]` and `[(layouts)]` follow user moves and resizes.
 */
@Component({
  selector: 'aui-dashboard-grid',
  exportAs: 'auiDashboardGrid',
  template: '<ng-content />',
  styleUrls: ['../../../components/dist/dashboard-grid/style.css'],
  styles: ['@layer aui.base{:where(aui-dashboard-grid){display:block}}'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuiDashboardGrid extends ComponentBridge<DashboardGrid, DashboardGridOptions> {
  readonly label: InputSignal<DashboardGridOptions['label']> = input.required<DashboardGridOptions['label']>();
  readonly items: ModelSignal<DashboardGridOptions['items']> = model.required<DashboardGridOptions['items']>();
  readonly layouts: ModelSignal<DashboardGridOptions['layouts'] | undefined> = model<DashboardGridOptions['layouts']>();
  readonly breakpoints: InputSignal<DashboardGridOptions['breakpoints'] | undefined> = input<DashboardGridOptions['breakpoints']>();
  readonly editable: InputSignal<DashboardGridOptions['editable'] | undefined> = input<DashboardGridOptions['editable']>();
  readonly historyLimit: InputSignal<DashboardGridOptions['historyLimit'] | undefined> = input<DashboardGridOptions['historyLimit']>();
  readonly reorderDom: InputSignal<DashboardGridOptions['reorderDom'] | undefined> = input<DashboardGridOptions['reorderDom']>();
  readonly rowHeight: InputSignal<DashboardGridOptions['rowHeight'] | undefined> = input<DashboardGridOptions['rowHeight']>();
  readonly gap: InputSignal<DashboardGridOptions['gap'] | undefined> = input<DashboardGridOptions['gap']>();
  readonly compaction: InputSignal<DashboardGridOptions['compaction'] | undefined> = input<DashboardGridOptions['compaction']>();
  readonly locale: InputSignal<DashboardGridOptions['locale'] | undefined> = input<DashboardGridOptions['locale']>();
  readonly direction: InputSignal<DashboardGridOptions['direction'] | undefined> = input<DashboardGridOptions['direction']>();
  /** Every layout change with its reason (move, resize, add, remove, undo, redo, set). */
  readonly layoutChanged: OutputEmitterRef<DashboardGridLayoutChangeDetail> = output<DashboardGridLayoutChangeDetail>();
  readonly breakpointChange: OutputEmitterRef<DashboardGridBreakpointChangeDetail> = output<DashboardGridBreakpointChangeDetail>();

  constructor() {
    super();
    this.init({
      create: (host, options) => DashboardGrid.create(host, options),
      configKey: 'dashboardGrid',
      options: () =>
        defined<DashboardGridOptions>({
          label: this.label(),
          items: this.items(),
          layouts: this.layouts(),
          breakpoints: this.breakpoints(),
          editable: this.editable(),
          historyLimit: this.historyLimit(),
          reorderDom: this.reorderDom(),
          rowHeight: this.rowHeight(),
          gap: this.gap(),
          compaction: this.compaction(),
          locale: this.locale(),
          direction: this.direction(),
        }),
      events: {
        'aui-layout-change': (detail) => {
          const d = detail as DashboardGridLayoutChangeDetail;
          this.syncModel(this.items, 'items', d.items);
          this.syncModel(this.layouts, 'layouts', d.layouts);
          this.layoutChanged.emit(d);
        },
        'aui-breakpoint-change': emitTo(this.breakpointChange),
      },
    });
  }

  /** Add an item; `element` is the already rendered child (render it first, then add). */
  addItem(...args: Parameters<DashboardGrid['addItem']>): DashboardItem | undefined {
    return this.controller?.addItem(...args);
  }

  /** Remove an item from every layout; its element is removed too unless `removeElement` is false. */
  removeItem(id: string, removeElement?: boolean): void {
    this.controller?.removeItem(id, removeElement);
  }

  /** Undo the last layout change; false when there is nothing to undo. */
  undo(): boolean {
    return this.controller?.undo() ?? false;
  }

  /** Redo the last undone layout change; false when there is nothing to redo. */
  redo(): boolean {
    return this.controller?.redo() ?? false;
  }
}

export { AuiDashboardCatalog } from './catalog.js';
