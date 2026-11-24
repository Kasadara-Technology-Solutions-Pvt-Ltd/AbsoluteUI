import { ChangeDetectionStrategy, Component, input, model, output, ViewEncapsulation, type InputSignal, type InputSignalWithTransform, type ModelSignal, type OutputEmitterRef } from '@angular/core';
import {
  checkDefinition,
  migrateDefinition,
  type Dashboard,
  type DashboardChangeDetail,
  type DashboardMode,
  type DashboardModeChangeDetail,
  type DashboardOptions,
  type DashboardVariablesChangeDetail,
  type DashboardWidgetErrorDetail,
  type DashboardWidgetSelectDetail,
  type DefinitionIssue,
} from '@absoluteui/components/dashboard';
import { booleanInput, ComponentBridge, defined, emitTo } from '../internal/bridge.js';
import { DashboardController } from './controller.js';

/** Detail of `pageChange`: the page now shown. */
export interface DashboardPageChangeDetail {
  readonly page: string;
}

/**
 * AbsoluteUI Dashboard: renders a JSON dashboard definition:
 * `<aui-dashboard [(definition)]="definition" [editable]="true" (dashboardChange)="save()"></aui-dashboard>`.
 * `[(definition)]` follows every change (layout, widgets, undo, import) and `[(mode)]` the
 * view/edit switch. A new `definition` value is applied when it differs from the current one;
 * changing any other input re-creates the dashboard (undo history and kiosk mode start fresh).
 */
@Component({
  selector: 'aui-dashboard',
  exportAs: 'auiDashboard',
  template: '',
  styleUrls: [
    '../../../components/dist/button/style.css',
    '../../../components/dist/switch/style.css',
    '../../../components/dist/select/style.css',
    '../../../components/dist/multi-select/style.css',
    '../../../components/dist/text-input/style.css',
    '../../../components/dist/number-input/style.css',
    '../../../components/dist/date-input/style.css',
    '../../../components/dist/calendar/style.css',
    '../../../components/dist/date-range-picker/style.css',
    '../../../components/dist/tabs/style.css',
    '../../../components/dist/dashboard-grid/style.css',
    '../../../components/dist/dashboard-widget/style.css',
    '../../../components/dist/dashboard/style.css',
  ],
  styles: ['@layer aui.base{:where(aui-dashboard){display:block}}'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuiDashboard extends ComponentBridge<DashboardController, DashboardOptions> {
  readonly definition: ModelSignal<unknown> = model.required<unknown>();
  readonly mode: ModelSignal<DashboardMode | undefined> = model<DashboardMode>();
  readonly registry: InputSignal<DashboardOptions['registry'] | undefined> = input<DashboardOptions['registry']>();
  readonly transforms: InputSignal<DashboardOptions['transforms'] | undefined> = input<DashboardOptions['transforms']>();
  readonly fetcher: InputSignal<DashboardOptions['fetcher'] | undefined> = input<DashboardOptions['fetcher']>();
  readonly allowedOrigins: InputSignal<DashboardOptions['allowedOrigins'] | undefined> = input<DashboardOptions['allowedOrigins']>();
  readonly baseUrl: InputSignal<DashboardOptions['baseUrl'] | undefined> = input<DashboardOptions['baseUrl']>();
  readonly editable: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });
  readonly toolbar: InputSignal<DashboardOptions['toolbar'] | undefined> = input<DashboardOptions['toolbar']>();
  readonly timeZone: InputSignal<DashboardOptions['timeZone'] | undefined> = input<DashboardOptions['timeZone']>();
  readonly businessCalendars: InputSignal<DashboardOptions['businessCalendars'] | undefined> = input<DashboardOptions['businessCalendars']>();
  readonly headingLevel: InputSignal<DashboardOptions['headingLevel'] | undefined> = input<DashboardOptions['headingLevel']>();
  readonly label: InputSignal<DashboardOptions['label'] | undefined> = input<DashboardOptions['label']>();
  readonly lazy: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });
  readonly historyLimit: InputSignal<DashboardOptions['historyLimit'] | undefined> = input<DashboardOptions['historyLimit']>();
  readonly retries: InputSignal<DashboardOptions['retries'] | undefined> = input<DashboardOptions['retries']>();
  readonly locale: InputSignal<DashboardOptions['locale'] | undefined> = input<DashboardOptions['locale']>();
  readonly direction: InputSignal<DashboardOptions['direction'] | undefined> = input<DashboardOptions['direction']>();
  readonly dashboardChange: OutputEmitterRef<DashboardChangeDetail> = output<DashboardChangeDetail>();
  readonly variablesChange: OutputEmitterRef<DashboardVariablesChangeDetail> = output<DashboardVariablesChangeDetail>();
  readonly widgetError: OutputEmitterRef<DashboardWidgetErrorDetail> = output<DashboardWidgetErrorDetail>();
  readonly widgetSelect: OutputEmitterRef<DashboardWidgetSelectDetail> = output<DashboardWidgetSelectDetail>();
  readonly pageChange: OutputEmitterRef<DashboardPageChangeDetail> = output<DashboardPageChangeDetail>();

  constructor() {
    super();
    this.init({
      create: (host, options) => new DashboardController(host, options),
      configKey: 'dashboard',
      options: () =>
        defined<DashboardOptions>({
          definition: this.definition(),
          mode: this.mode(),
          registry: this.registry(),
          transforms: this.transforms(),
          fetcher: this.fetcher(),
          allowedOrigins: this.allowedOrigins(),
          baseUrl: this.baseUrl(),
          editable: this.editable(),
          toolbar: this.toolbar(),
          timeZone: this.timeZone(),
          businessCalendars: this.businessCalendars(),
          headingLevel: this.headingLevel(),
          label: this.label(),
          lazy: this.lazy(),
          historyLimit: this.historyLimit(),
          retries: this.retries(),
          locale: this.locale(),
          direction: this.direction(),
        }),
      events: {
        'aui-dashboard-change': (detail) => {
          const d = detail as DashboardChangeDetail;
          this.syncModel(this.definition, 'definition', d.definition);
          this.dashboardChange.emit(d);
        },
        'aui-mode-change': (detail) => {
          this.syncModel(this.mode, 'mode', (detail as DashboardModeChangeDetail).mode);
        },
        'aui-variables-change': emitTo(this.variablesChange),
        'aui-widget-error': emitTo(this.widgetError),
        'aui-widget-select': emitTo(this.widgetSelect),
        'aui-page-change': emitTo(this.pageChange),
      },
    });
    // A re-created dashboard (an input other than definition/mode changed) may fall back to view mode.
    this.trackModel(this.mode, 'mode', (c) => c.dashboard.mode);
  }

  protected override optionsApplied(): void {
    this.afterChange(true);
  }

  #dashboard(): Dashboard | undefined {
    return this.controller?.dashboard;
  }

  /** Validate and set a variable; dependent data sources reload. False for an unknown id or invalid value. */
  setVariable(...args: Parameters<Dashboard['setVariable']>): boolean {
    return this.#dashboard()?.setVariable(...args) ?? false;
  }

  /** Reload one data source, or every source of the current page, bypassing the cache. */
  refresh(...args: Parameters<Dashboard['refresh']>): void {
    this.#dashboard()?.refresh(...args);
  }

  /** Show a page (emits `pageChange`). */
  setPage(...args: Parameters<Dashboard['setPage']>): void {
    this.#dashboard()?.setPage(...args);
  }

  /** Step back in the definition history (emits `dashboardChange`). */
  undo(): boolean {
    return this.#dashboard()?.undo() ?? false;
  }

  /** Step forward in the definition history (emits `dashboardChange`). */
  redo(): boolean {
    return this.#dashboard()?.redo() ?? false;
  }

  /** Return to the saved definition (undoable; emits `dashboardChange`). */
  reset(): void {
    this.#dashboard()?.reset();
  }

  /** Make the current definition the one `reset()` returns to (call after storing it). */
  markSaved(): void {
    this.#dashboard()?.markSaved();
  }

  /** Add a widget; returns issues (empty when added). */
  addWidget(...args: Parameters<Dashboard['addWidget']>): readonly DefinitionIssue[] {
    return this.#dashboard()?.addWidget(...args) ?? [];
  }

  /** Replace a widget's definition; returns issues (empty when applied). */
  updateWidget(...args: Parameters<Dashboard['updateWidget']>): readonly DefinitionIssue[] {
    return this.#dashboard()?.updateWidget(...args) ?? [];
  }

  /** Remove a widget and its layout entries. */
  removeWidget(...args: Parameters<Dashboard['removeWidget']>): boolean {
    return this.#dashboard()?.removeWidget(...args) ?? false;
  }

  /** Read-only display without toolbar and tabs; optional page rotation and full screen. */
  startKiosk(...args: Parameters<Dashboard['startKiosk']>): void {
    this.#dashboard()?.startKiosk(...args);
  }

  /** Leave kiosk mode. */
  stopKiosk(): void {
    this.#dashboard()?.stopKiosk();
  }

  /** Migrate and validate a candidate definition without applying it (works before the first render). */
  check(definition: unknown): readonly DefinitionIssue[] {
    const dashboard = this.#dashboard();
    if (dashboard) return dashboard.check(definition);
    let migrated: unknown;
    try {
      migrated = migrateDefinition(definition);
    } catch (error) {
      return [{ path: '/schemaVersion', code: 'version', expected: error instanceof Error ? error.message : 'a supported version' }];
    }
    const result = checkDefinition(migrated);
    return result.ok ? [] : result.issues;
  }
}
