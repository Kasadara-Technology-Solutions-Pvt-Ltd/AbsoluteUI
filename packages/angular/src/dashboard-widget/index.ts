import { ChangeDetectionStrategy, Component, input, model, output, ViewEncapsulation, type InputSignal, type ModelSignal, type OutputEmitterRef } from '@angular/core';
import {
  DashboardWidget,
  type DashboardWidgetActionDetail,
  type DashboardWidgetMaximizeDetail,
  type DashboardWidgetOptions,
  type DashboardWidgetRemoveDetail,
  type DashboardWidgetToggleDetail,
} from '@absoluteui/components/dashboard-widget';
import { ComponentBridge, defined, emitTo } from '../internal/bridge.js';

/**
 * AbsoluteUI Dashboard Widget; the projected content is the body:
 * `<aui-dashboard-widget title="Revenue" [removable]="true" (removed)="remove(id)">...</aui-dashboard-widget>`.
 * The header is inserted before the Angular-managed body. `[(collapsed)]` is two-way.
 */
@Component({
  selector: 'aui-dashboard-widget',
  exportAs: 'auiDashboardWidget',
  template: '<ng-content />',
  styleUrls: ['../../../components/dist/dashboard-widget/style.css'],
  styles: ['@layer aui.base{:where(aui-dashboard-widget){display:block}}'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuiDashboardWidget extends ComponentBridge<DashboardWidget, DashboardWidgetOptions> {
  readonly title: InputSignal<DashboardWidgetOptions['title']> = input.required<DashboardWidgetOptions['title']>();
  readonly headingLevel: InputSignal<DashboardWidgetOptions['headingLevel'] | undefined> = input<DashboardWidgetOptions['headingLevel']>();
  readonly subtitle: InputSignal<DashboardWidgetOptions['subtitle'] | undefined> = input<DashboardWidgetOptions['subtitle']>();
  readonly actions: InputSignal<DashboardWidgetOptions['actions'] | undefined> = input<DashboardWidgetOptions['actions']>();
  readonly removable: InputSignal<DashboardWidgetOptions['removable'] | undefined> = input<DashboardWidgetOptions['removable']>();
  readonly collapsed: ModelSignal<DashboardWidgetOptions['collapsed'] | undefined> = model<DashboardWidgetOptions['collapsed']>();
  readonly busy: InputSignal<DashboardWidgetOptions['busy'] | undefined> = input<DashboardWidgetOptions['busy']>();
  readonly collapsible: InputSignal<DashboardWidgetOptions['collapsible'] | undefined> = input<DashboardWidgetOptions['collapsible']>();
  readonly maximizable: InputSignal<DashboardWidgetOptions['maximizable'] | undefined> = input<DashboardWidgetOptions['maximizable']>();
  readonly locale: InputSignal<DashboardWidgetOptions['locale'] | undefined> = input<DashboardWidgetOptions['locale']>();
  readonly direction: InputSignal<DashboardWidgetOptions['direction'] | undefined> = input<DashboardWidgetOptions['direction']>();
  readonly toggled: OutputEmitterRef<DashboardWidgetToggleDetail> = output<DashboardWidgetToggleDetail>();
  readonly maximized: OutputEmitterRef<DashboardWidgetMaximizeDetail> = output<DashboardWidgetMaximizeDetail>();
  readonly action: OutputEmitterRef<DashboardWidgetActionDetail> = output<DashboardWidgetActionDetail>();
  readonly removed: OutputEmitterRef<DashboardWidgetRemoveDetail> = output<DashboardWidgetRemoveDetail>();

  constructor() {
    super();
    this.init({
      create: (host, options) => DashboardWidget.create(host, options),
      configKey: 'dashboardWidget',
      options: () =>
        defined<DashboardWidgetOptions>({
          title: this.title(),
          headingLevel: this.headingLevel(),
          subtitle: this.subtitle(),
          actions: this.actions(),
          removable: this.removable(),
          collapsed: this.collapsed(),
          busy: this.busy(),
          collapsible: this.collapsible(),
          maximizable: this.maximizable(),
          locale: this.locale(),
          direction: this.direction(),
        }),
      events: {
        'aui-toggle': (detail) => {
          const d = detail as DashboardWidgetToggleDetail;
          this.syncModel(this.collapsed, 'collapsed', d.collapsed);
          this.toggled.emit(d);
        },
        'aui-maximize': emitTo(this.maximized),
        'aui-action': emitTo(this.action),
        'aui-remove': emitTo(this.removed),
      },
      strip: ['title'],
    });
  }

  /** Maximize the widget into a modal view, or restore it (emits `maximized`). */
  setMaximized(maximized: boolean): void {
    this.controller?.setMaximized(maximized);
  }
}
