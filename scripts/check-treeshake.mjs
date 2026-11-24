// SPEC section 5.1-5.2: consumers ship only what they import. Bundles single-component
// entries against the BUILT packages and asserts unrelated code is absent.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, fail, packageNames } from './lib.mjs';

const dir = join(root, '.cache', 'treeshake');
mkdirSync(dir, { recursive: true });
// No tsconfig paths: resolve through package "exports" to dist, like a consumer.
writeFileSync(join(dir, 'tsconfig.json'), '{}');

/** Marker strings that only appear in a given module's code. */
const MARKERS = {
  button: 'aui-button--icon-only',
  combobox: 'aui-combobox__listbox',
  multiSelect: 'aui-multi-select__listbox',
  dialog: 'aui-dialog__footer',
  dateInput: 'aui-date-input__segment',
  sanitizer: 'SAN_INPUT_TOO_LARGE',
  contrast: 'WCAG 2.2 1.4.11',
  focusTrap: 'createFocusTrap',
  textInput: 'aui-text-input__reveal',
  select: 'aui-select__listbox',
  form: 'FORM_RULE_TARGET',
  errorSummary: 'aui-error-summary__link',
  numberInput: 'aui-number-input__stepper',
  dataTable: 'aui-data-table__select-all',
  dataGrid: 'aui-data-grid__drop-indicator',
  calendar: 'aui-calendar__grid',
  periodPicker: 'aui-period-picker__grid',
  durationPicker: 'aui-duration-picker__segment',
  fileUpload: 'aui-file-upload__zone',
  uploadQueue: 'aui-upload-queue__actions',
  passwordInput: 'aui-password-input__reveal',
  menu: 'MENU_TRIGGER',
  contextMenu: 'aui-menu--context',
  lineChart: 'aui-line-chart__cursor',
  barChart: 'aui-bar-chart__bars',
  pieChart: 'aui-pie-chart__slice-group',
  sparkline: 'aui-sparkline__baseline',
  chartFrame: 'aui-chart__table-toggle',
  chartZoom: 'aui-chart__zoom',
  scatterChart: 'aui-scatter-chart__cursor',
  gauge: 'aui-gauge__reading',
  treemap: 'aui-treemap__chip',
  // The opening quote keeps ORG_CHART_EXPORT_OPTIONS from matching.
  chartExport: '"CHART_EXPORT_OPTIONS"',
  // R16 icon set: definitions carry their ids; the vector renderer and animation controller have their own strings.
  setHome: 'id:"home"',
  setChartBar: 'id:"chart-bar"',
  setWifi: 'id:"wifi"',
  vectorRenderer: 'aui-icon-secondary-opacity',
  iconAnimation: 'data-aui-motion-wrapper',
  dashboardGrid: 'aui-dashboard__placeholder',
  dashboardCatalog: 'aui-dashboard-catalog__list',
  dashboardWidget: 'aui-widget__maximize',
  statCard: 'aui-stat-card__delta',
  dashboardCheck: 'JSON Pointer (RFC 6901) such as',
  dashboard: 'aui-dashboard-widget__retry',
  dashboardToolbar: 'aui-dashboard-toolbar__variables',
  dashboardWidgets: 'aui-dashboard-list__label',
  dashboardBuilder: 'aui-dashboard-builder__type-fields',
  dashboardSchema: 'AbsoluteUI dashboard definition',
  richText: 'aui-rte__link-panel',
  pivotGrid: 'aui-pivot__corner',
  pivotFieldList: 'aui-pivot-fields__handle',
  orgChart: 'aui-org-chart__toggle',
  orgChartExport: 'ORG_CHART_EXPORT_OPTIONS',
  recurrenceCore: 'RECURRENCE_EXPAND',
  businessEngine: 'BUSINESS_CALENDAR_NO_WORKING_DAYS',
  businessCalendar: 'aui-business-calendar__legend',
  recurrencePicker: 'aui-recurrence-picker__weekday',
  schedulePicker: 'aui-schedule-picker__duration',
  scheduler: 'aui-scheduler__resize',
  kanban: 'aui-kanban__grip',
  ganttEngine: 'GANTT_OPTIONS',
  gantt: 'aui-gantt__link-handle',
  designerCompliance: 'token-level WCAG 2.2 AA baseline',
  designerDerive: '.4122214708',
  designerExport: 'com.absoluteui',
  designerZip: 'Invalid or duplicate zip path',
  designerImport: 'unsupported schema version',
  // R5 helpers and services (docs/PLAN-HELPERS.md §7).
  hlpLinq: 'HLP_LINQ_NO_ELEMENTS',
  hlpBizcal: 'HLP_BIZCAL_INVALID_HOURS',
  hlpJson: 'HLP_JSON_TOO_LONG',
  hlpCsv: 'HLP_CSV_UNEXPECTED_QUOTE',
  hlpValidate: 'HLP_VALIDATE_FAILED',
  hlpTimezone: 'HLP_TZ_INVALID_OFFSET',
  hlpDs: 'HLP_DS_INVALID_CAPACITY',
  hlpZip: 'HLP_ZIP_INVALID_NAME',
  svcUpload: 'SVC_UPLOAD_CANCELLED',
  svcHttp: 'SVC_HTTP_NETWORK',
  svcHttpPaginate: 'SVC_HTTP_CROSS_ORIGIN_PAGE',
  svcHttpUpload: 'SVC_HTTP_NO_XHR',
  svcHttpMock: 'SVC_HTTP_MOCK_STATUS',
  svcStorage: 'SVC_STORAGE_WRITE_FAILED',
};

const cases = [
  { name: 'button-only', code: "import { Button } from '@absoluteui/components/button'; Button.create({ text: 'x' });", mustInclude: ['button'], mustExclude: ['combobox', 'dialog', 'dateInput', 'sanitizer', 'contrast'] },
  { name: 'multi-select-only', code: "import { MultiSelect } from '@absoluteui/components/multi-select'; MultiSelect.create(document.body, { label: 'x', options: [] });", mustInclude: ['multiSelect'], mustExclude: ['combobox', 'select', 'button', 'dialog', 'dateInput', 'sanitizer', 'contrast'] },
  { name: 'combobox-only', code: "import { Combobox } from '@absoluteui/components/combobox'; Combobox.create(document.body, { label: 'x', options: [] });", mustInclude: ['combobox'], mustExclude: ['button', 'dialog', 'dateInput', 'sanitizer', 'contrast'] },
  { name: 'date-input-only', code: "import { DateInput } from '@absoluteui/components/date-input'; DateInput.create(document.body, { label: 'x' });", mustInclude: ['dateInput'], mustExclude: ['button', 'combobox', 'dialog', 'sanitizer', 'contrast'] },
  { name: 'text-input-only', code: "import { TextInput } from '@absoluteui/components/text-input'; TextInput.create(document.body, { label: 'x' });", mustInclude: ['textInput'], mustExclude: ['button', 'combobox', 'select', 'form', 'errorSummary', 'dialog', 'sanitizer', 'contrast'] },
  { name: 'select-only', code: "import { Select } from '@absoluteui/components/select'; Select.create(document.body, { label: 'x', options: [] });", mustInclude: ['select'], mustExclude: ['combobox', 'textInput', 'form', 'dialog', 'sanitizer'] },
  { name: 'form-only', code: "import { Form } from '@absoluteui/components/form'; Form.create(document.createElement('form'));", mustInclude: ['form', 'errorSummary'], mustExclude: ['textInput', 'select', 'combobox', 'dialog', 'numberInput', 'sanitizer'] },
  { name: 'data-grid-only', code: "import { DataGrid } from '@absoluteui/components/data-grid'; DataGrid.create(document.body, { label: 'x', columns: [{ id: 'a', header: 'A' }], rows: [], rowId: () => 'x' });", mustInclude: ['dataGrid'], mustExclude: ['dataTable', 'select', 'combobox', 'multiSelect', 'form', 'calendar', 'menu', 'contextMenu', 'sanitizer'] },
  // The list editors are a separate entry point (R11-14): they bring Combobox and Multi Select, the grid core does not.
  { name: 'data-grid-accessories', code: "import { columnMenu, contextMenu, columnChooser } from '@absoluteui/components/data-grid/accessories'; console.log(columnMenu, contextMenu, columnChooser);", mustInclude: ['contextMenu', 'dialog'], mustExclude: ['dataGrid', 'dataTable', 'sanitizer'] },
  { name: 'data-grid-export', code: "import { toXlsx } from '@absoluteui/components/data-grid/export'; console.log(toXlsx);", mustInclude: ['hlpZip'], mustExclude: ['dataGrid', 'dataTable', 'contextMenu', 'dialog', 'sanitizer'] },
  { name: 'data-grid-formulas', code: "import { FormulaBook, BUILTIN_FUNCTIONS } from '@absoluteui/components/data-grid/formulas'; console.log(FormulaBook, BUILTIN_FUNCTIONS);", mustInclude: [], mustExclude: ['dataGrid', 'dataTable', 'contextMenu', 'dialog', 'sanitizer', 'hlpZip'] },
  { name: 'data-grid-charts', code: "import { sparklineColumn } from '@absoluteui/components/data-grid/charts'; console.log(sparklineColumn);", mustInclude: ['sparkline'], mustExclude: ['dataGrid', 'dataTable', 'contextMenu', 'dialog', 'sanitizer', 'hlpZip'] },
  { name: 'data-grid-pdf', code: "import { toPdf } from '@absoluteui/components/data-grid/pdf'; console.log(toPdf);", mustInclude: [], mustExclude: ['dataGrid', 'dataTable', 'contextMenu', 'dialog', 'sanitizer', 'hlpZip', 'sparkline'] },
  { name: 'data-grid-schema', code: "import { dataGridStateSchema } from '@absoluteui/components/data-grid/schema'; console.log(dataGridStateSchema);", mustInclude: [], mustExclude: ['dataGrid', 'dataTable', 'contextMenu', 'dialog', 'sanitizer', 'hlpZip', 'sparkline'] },
  { name: 'data-grid-editors', code: "import { comboboxEditor, multiSelectEditor } from '@absoluteui/components/data-grid/editors'; console.log(comboboxEditor, multiSelectEditor);", mustInclude: ['combobox', 'multiSelect'], mustExclude: ['dataGrid', 'dataTable', 'sanitizer'] },
  { name: 'data-table-only', code: "import { DataTable } from '@absoluteui/components/data-table'; DataTable.create(document.body, { caption: 'x', columns: [], rows: [], rowId: () => 'x' });", mustInclude: ['dataTable'], mustExclude: ['select', 'combobox', 'form', 'dialog', 'calendar', 'textInput', 'sanitizer', 'menu'] },
  // The column chooser is a separate class: only consumers that use it bundle Menu.
  { name: 'data-table-chooser', code: "import { DataTable, DataTableColumnChooser } from '@absoluteui/components/data-table'; DataTableColumnChooser.create(document.createElement('button'), DataTable.create(document.body, { caption: 'x', columns: [], rows: [], rowId: () => 'x' }));", mustInclude: ['dataTable', 'menu'], mustExclude: ['select', 'combobox', 'form', 'dialog', 'calendar', 'textInput', 'sanitizer'] },
  { name: 'date-range-picker-only', code: "import { DateRangePicker } from '@absoluteui/components/date-range-picker'; DateRangePicker.create(document.body, { label: 'x' });", mustInclude: ['calendar', 'dateInput'], mustExclude: ['periodPicker', 'durationPicker', 'select', 'combobox', 'dialog', 'sanitizer'] },
  { name: 'month-picker-only', code: "import { MonthPicker } from '@absoluteui/components/month-picker'; MonthPicker.create(document.body, { label: 'x' });", mustInclude: ['periodPicker'], mustExclude: ['calendar', 'dateInput', 'durationPicker', 'select', 'dialog', 'sanitizer'] },
  { name: 'duration-picker-only', code: "import { DurationPicker } from '@absoluteui/components/duration-picker'; DurationPicker.create(document.body, { label: 'x' });", mustInclude: ['durationPicker'], mustExclude: ['periodPicker', 'calendar', 'dateInput', 'numberInput', 'sanitizer'] },
  // File Upload and Upload Queue work independently: neither pulls in the other.
  { name: 'file-upload-only', code: "import { FileUpload } from '@absoluteui/components/file-upload'; FileUpload.create(document.body, { label: 'x' });", mustInclude: ['fileUpload'], mustExclude: ['uploadQueue', 'form', 'dialog', 'button', 'textInput', 'sanitizer'] },
  { name: 'upload-queue-only', code: "import { UploadQueue } from '@absoluteui/components/upload-queue'; UploadQueue.create(document.body, { label: 'x', upload: () => Promise.resolve(null) });", mustInclude: ['uploadQueue'], mustExclude: ['fileUpload', 'form', 'dialog', 'button', 'sanitizer'] },
  { name: 'password-input-only', code: "import { PasswordInput } from '@absoluteui/components/password-input'; PasswordInput.create(document.body, { label: 'x' });", mustInclude: ['passwordInput'], mustExclude: ['textInput', 'form', 'dialog', 'button', 'sanitizer'] },
  { name: 'sparkline-only', code: "import { Sparkline } from '@absoluteui/components/sparkline'; Sparkline.create(document.body, { label: 'x', values: [1, 2] });", mustInclude: ['sparkline'], mustExclude: ['pieChart', 'lineChart', 'barChart', 'chartFrame', 'dataTable', 'sanitizer'] },
  { name: 'line-chart-only', code: "import { LineChart } from '@absoluteui/components/line-chart'; LineChart.create(document.body, { label: 'x', x: [], series: [] });", mustInclude: ['lineChart', 'chartFrame'], mustExclude: ['pieChart', 'barChart', 'sparkline', 'dataTable', 'sanitizer'] },
  { name: 'pie-chart-only', code: "import { PieChart } from '@absoluteui/components/pie-chart'; PieChart.create(document.body, { label: 'x', slices: [] });", mustInclude: ['pieChart', 'chartFrame'], mustExclude: ['lineChart', 'barChart', 'sparkline', 'dataTable', 'sanitizer'] },
  // R3: each chart ships alone; zoom only with charts that zoom; export and the catalog only when imported.
  { name: 'scatter-chart-only', code: "import { ScatterChart } from '@absoluteui/components/scatter-chart'; ScatterChart.create(document.body, { label: 'x', series: [] });", mustInclude: ['scatterChart', 'chartFrame', 'chartZoom'], mustExclude: ['lineChart', 'barChart', 'pieChart', 'treemap', 'chartExport', 'dataTable', 'sanitizer'] },
  { name: 'treemap-only', code: "import { Treemap } from '@absoluteui/components/treemap'; Treemap.create(document.body, { label: 'x', data: [] });", mustInclude: ['treemap', 'chartFrame'], mustExclude: ['chartZoom', 'scatterChart', 'lineChart', 'chartExport', 'sanitizer'] },
  { name: 'gauge-only', code: "import { Gauge } from '@absoluteui/components/gauge'; Gauge.create(document.body, { label: 'x', value: 1 });", mustInclude: ['gauge'], mustExclude: ['chartFrame', 'chartZoom', 'sparkline', 'chartExport', 'sanitizer'] },
  { name: 'chart-export-only', code: "import { chartToSvg } from '@absoluteui/components/chart-export'; console.log(chartToSvg);", mustInclude: ['chartExport'], mustExclude: ['chartFrame', 'lineChart', 'sanitizer'] },
  { name: 'dashboard-grid-only', code: "import { DashboardGrid } from '@absoluteui/components/dashboard-grid'; DashboardGrid.create(document.body, { label: 'x', items: [] });", mustInclude: ['dashboardGrid'], mustExclude: ['dashboardCatalog', 'dashboardWidget', 'statCard', 'dialog', 'sanitizer'] },
  // R18: definition checks without the runtime; the runtime without built-in widgets, builder, or schema.
  { name: 'dashboard-check-only', code: "import { checkDefinition } from '@absoluteui/components/dashboard'; console.log(checkDefinition({}));", mustInclude: ['dashboardCheck'], mustExclude: ['dashboard', 'dashboardToolbar', 'dashboardWidgets', 'dashboardBuilder', 'dashboardSchema', 'dashboardGrid'], maxKiB: 25 },
  { name: 'dashboard-core', code: "import { Dashboard } from '@absoluteui/components/dashboard'; Dashboard.create(document.body, { definition: {} });", mustInclude: ['dashboard', 'dashboardToolbar', 'dashboardGrid', 'dashboardWidget'], mustExclude: ['dashboardWidgets', 'dashboardBuilder', 'dashboardSchema', 'lineChart', 'dataTable', 'dataGrid'], maxKiB: 260 },
  // R20-15: every built-in chart widget carries the shared chart look-and-feel layer (theme, annotations,
  // synchronized crosshair, point events, bar zoom): about +12 KiB over the R18 budget of 230.
  { name: 'dashboard-widgets', code: "import { registerBuiltInWidgets } from '@absoluteui/components/dashboard/widgets'; registerBuiltInWidgets();", mustInclude: ['dashboardWidgets', 'lineChart', 'dataTable'], mustExclude: ['dashboardBuilder', 'dashboardSchema', 'dataGrid', 'dashboardToolbar'], maxKiB: 250 },
  { name: 'stat-card-only', code: "import { StatCard } from '@absoluteui/components/stat-card'; StatCard.create(document.body, { label: 'x', value: 1 });", mustInclude: ['statCard', 'sparkline'], mustExclude: ['chartFrame', 'dashboardGrid', 'sanitizer'] },
  { name: 'rich-text-editor-only', code: "import { RichTextEditor } from '@absoluteui/components/rich-text-editor'; RichTextEditor.create(document.body, { label: 'x' });", mustInclude: ['richText', 'sanitizer'], mustExclude: ['textInput', 'form', 'dialog', 'menu', 'dataTable', 'chartFrame'] },
  // R3 phase 2: the field list and the org chart export ship only when imported.
  { name: 'pivot-grid-only', code: "import { PivotGrid } from '@absoluteui/components/pivot-grid'; PivotGrid.create(document.body, { caption: 'x', fields: [{ id: 'a', label: 'A' }], data: [], layout: { rows: [], columns: [], values: [] } });", mustInclude: ['pivotGrid'], mustExclude: ['pivotFieldList', 'dataTable', 'menu', 'select', 'dialog', 'chartFrame', 'sanitizer'] },
  { name: 'pivot-field-list', code: "import { PivotFieldList, PivotGrid } from '@absoluteui/components/pivot-grid'; PivotFieldList.create(document.body, { label: 'x', grid: PivotGrid.create(document.body, { caption: 'x', fields: [{ id: 'a', label: 'A' }], data: [], layout: { rows: [], columns: [], values: [] } }) });", mustInclude: ['pivotGrid', 'pivotFieldList'], mustExclude: ['dataTable', 'menu', 'select', 'dialog', 'sanitizer'] },
  { name: 'org-chart-only', code: "import { OrgChart } from '@absoluteui/components/org-chart'; OrgChart.create(document.body, { label: 'x', nodes: [] });", mustInclude: ['orgChart'], mustExclude: ['orgChartExport', 'chartExport', 'chartFrame', 'treemap', 'dataTable', 'sanitizer'] },
  { name: 'org-chart-export-only', code: "import { orgChartToSvg } from '@absoluteui/components/org-chart-export'; console.log(orgChartToSvg);", mustInclude: ['orgChartExport'], mustExclude: ['orgChart', 'chartExport', 'chartFrame', 'sanitizer'] },
  { name: 'recurrence-core-only', code: "import { expandRecurrence, parseRecurrenceRule, plainDate } from '@absoluteui/core'; const r = parseRecurrenceRule('FREQ=DAILY'); if (r) console.log(expandRecurrence(r, plainDate(2026, 1, 1)));", mustInclude: ['recurrenceCore'], mustExclude: ['calendar', 'dateInput', 'scheduler', 'businessEngine', 'sanitizer'] },
  { name: 'date-picker-without-recurrence', code: "import { DatePicker } from '@absoluteui/components/date-picker'; DatePicker.create(document.body, { label: 'x' });", mustInclude: ['calendar', 'dateInput'], mustExclude: ['recurrenceCore', 'recurrencePicker', 'scheduler'] },
  { name: 'business-engine-only', code: "import { createBusinessCalendar } from '@absoluteui/components/business-calendar'; console.log(createBusinessCalendar());", mustInclude: ['businessEngine'], mustExclude: ['businessCalendar', 'scheduler', 'calendar', 'recurrenceCore'] },
  { name: 'business-calendar-only', code: "import { BusinessCalendar } from '@absoluteui/components/business-calendar'; BusinessCalendar.create(document.body, { label: 'x' });", mustInclude: ['businessCalendar', 'businessEngine'], mustExclude: ['scheduler', 'calendar', 'recurrenceCore', 'dialog'] },
  { name: 'recurrence-picker-only', code: "import { RecurrencePicker } from '@absoluteui/components/recurrence-picker'; RecurrencePicker.create(document.body, { label: 'x' });", mustInclude: ['recurrencePicker', 'recurrenceCore', 'calendar'], mustExclude: ['scheduler', 'schedulePicker', 'businessCalendar', 'dataTable'] },
  { name: 'schedule-picker-only', code: "import { SchedulePicker } from '@absoluteui/components/schedule-picker'; SchedulePicker.create(document.body, { label: 'x' });", mustInclude: ['schedulePicker', 'recurrencePicker'], mustExclude: ['scheduler', 'businessCalendar', 'dataTable'] },
  { name: 'scheduler-only', code: "import { Scheduler } from '@absoluteui/components/scheduler'; Scheduler.create(document.body, { label: 'x' });", mustInclude: ['scheduler', 'businessEngine', 'recurrenceCore', 'dialog'], mustExclude: ['businessCalendar', 'recurrencePicker', 'schedulePicker', 'calendar', 'dataTable', 'sanitizer'] },
  { name: 'kanban-only', code: "import { Kanban } from '@absoluteui/components/kanban'; Kanban.create(document.body, { label: 'x', columns: [{ id: 'a', label: 'A' }], cards: [] });", mustInclude: ['kanban'], mustExclude: ['gantt', 'ganttEngine', 'scheduler', 'dialog', 'dataTable', 'businessEngine', 'sanitizer'] },
  { name: 'gantt-engine-only', code: "import { createBusinessCalendar } from '@absoluteui/components/business-calendar'; import { scheduleGantt } from '@absoluteui/components/gantt'; console.log(scheduleGantt([], [], createBusinessCalendar()));", mustInclude: ['ganttEngine', 'businessEngine'], mustExclude: ['gantt', 'kanban', 'scheduler', 'businessCalendar'] },
  { name: 'theme-runtime-only', code: "import { applyTheme } from '@absoluteui/theme'; applyTheme('absolute-dark');", mustInclude: [], mustExclude: ['designerCompliance', 'designerDerive', 'designerExport', 'designerZip', 'designerImport', 'button'] },
  { name: 'designer-compliance-only', code: "import { assessCompliance, builtInFamily } from '@absoluteui/theme/designer'; console.log(assessCompliance(builtInFamily()));", mustInclude: ['designerCompliance', 'contrast'], mustExclude: ['designerExport', 'designerZip', 'designerImport', 'designerDerive', 'button'] },
  { name: 'designer-package', code: "import { toPackageZip, builtInFamily } from '@absoluteui/theme/designer'; console.log(toPackageZip(builtInFamily()));", mustInclude: ['designerCompliance', 'designerExport', 'designerZip'], mustExclude: ['button', 'dialog'] },
  { name: 'gantt-only', code: "import { Gantt } from '@absoluteui/components/gantt'; Gantt.create(document.body, { label: 'x', tasks: [] });", mustInclude: ['gantt', 'ganttEngine', 'businessEngine'], mustExclude: ['kanban', 'scheduler', 'businessCalendar', 'dialog', 'dataTable', 'recurrenceCore', 'calendar', 'sanitizer'] },
  // Framework adapters (SPEC section 22): one binding pulls in only its component; the framework stays external.
  { name: 'react-text-input-only', code: "import { AuiTextInput } from '@absoluteui/react/text-input'; console.log(AuiTextInput);", mustInclude: ['textInput'], mustExclude: ['button', 'combobox', 'select', 'dialog', 'dataTable', 'calendar', 'sanitizer'] },
  { name: 'vue-text-input-only', code: "import { AuiTextInput } from '@absoluteui/vue/text-input'; console.log(AuiTextInput);", mustInclude: ['textInput'], mustExclude: ['button', 'combobox', 'select', 'dialog', 'dataTable', 'calendar', 'sanitizer'] },
  // R5: one helper module never drags in unrelated modules.
  { name: 'helpers-array-only', code: "import { chunk } from '@absoluteui/helpers/array'; console.log(chunk([1, 2, 3], 2));", mustInclude: [], mustExclude: ['hlpLinq', 'hlpBizcal', 'hlpJson', 'hlpCsv', 'hlpValidate', 'hlpTimezone', 'hlpDs'] },
  { name: 'helpers-linq-only', code: "import { from } from '@absoluteui/helpers/linq'; console.log(from([1]).first());", mustInclude: ['hlpLinq'], mustExclude: ['hlpBizcal', 'hlpJson', 'hlpCsv', 'hlpValidate', 'hlpTimezone'] },
  { name: 'helpers-date-only', code: "import { addMonths } from '@absoluteui/helpers/date'; console.log(addMonths('2026-01-31', 1));", mustInclude: [], mustExclude: ['hlpBizcal', 'hlpLinq', 'hlpJson', 'hlpCsv', 'hlpValidate', 'hlpDs'] },
  { name: 'helpers-business-calendar', code: "import { createBusinessCalendar, isBusinessDay } from '@absoluteui/helpers/business-calendar'; console.log(isBusinessDay('2026-10-05', createBusinessCalendar()));", mustInclude: ['hlpBizcal'], mustExclude: ['hlpLinq', 'hlpJson', 'hlpCsv', 'hlpValidate', 'businessEngine', 'recurrenceCore'] },
  { name: 'helpers-json-only', code: "import { safeJsonParse } from '@absoluteui/helpers/json'; console.log(safeJsonParse('{}'));", mustInclude: ['hlpJson'], mustExclude: ['hlpLinq', 'hlpBizcal', 'hlpCsv', 'hlpValidate', 'hlpDs'] },
  { name: 'services-download-only', code: "import { downloadText } from '@absoluteui/services/download'; void downloadText('x', 'a.txt');", mustInclude: [], mustExclude: ['hlpZip', 'svcUpload', 'svcHttp', 'svcStorage', 'hlpLinq', 'hlpBizcal'] },
  { name: 'helpers-zip-only', code: "import { zipFiles } from '@absoluteui/helpers/zip'; void zipFiles([]);", mustInclude: ['hlpZip'], mustExclude: ['hlpLinq', 'hlpBizcal', 'hlpCsv'] },
  { name: 'services-zip-only', code: "import { zipFiles } from '@absoluteui/services/zip'; void zipFiles([]);", mustInclude: ['hlpZip'], mustExclude: ['svcUpload', 'svcHttp', 'svcStorage', 'hlpLinq', 'hlpBizcal'] },
  { name: 'services-http-only', code: "import { createHttpClient } from '@absoluteui/services/http'; console.log(createHttpClient({}));", mustInclude: ['svcHttp'], mustExclude: ['svcHttpPaginate', 'svcHttpUpload', 'svcHttpMock', 'hlpZip', 'svcUpload', 'svcStorage', 'hlpLinq', 'hlpBizcal'], maxKiB: 44 },
  // R16-13 (release): the built-in icons are the set's layered outline geometry (+1.3 KiB over the pilot-time budgets of 24 and 25).
  { name: 'icons-core-only', code: "import { renderIcon } from '@absoluteui/icons'; console.log(renderIcon('check'));", mustInclude: ['vectorRenderer'], mustExclude: ['setHome', 'setChartBar', 'setWifi', 'iconAnimation', 'button'], maxKiB: 26 },
  { name: 'icons-one-from-set', code: "import { renderIcon } from '@absoluteui/icons'; import { homeIcon } from '@absoluteui/icons/set'; console.log(renderIcon(homeIcon));", mustInclude: ['setHome'], mustExclude: ['setChartBar', 'setWifi', 'iconAnimation'], maxKiB: 27 },
  { name: 'icons-one-module', code: "import { homeIcon } from '@absoluteui/icons/set/home'; console.log(homeIcon);", mustInclude: ['setHome'], mustExclude: ['setChartBar', 'setWifi', 'vectorRenderer', 'iconAnimation'], maxKiB: 1 },
  { name: 'core-config-only', code: "import { configureAbsoluteUI } from '@absoluteui/core'; configureAbsoluteUI({ locale: 'en-US' });", mustInclude: [], mustExclude: ['sanitizer', 'button', 'combobox'] },
];

const errors = [];
const report = [];
// Cases for a package that is not in this checkout (the public snapshot has no React or Vue adapter) are skipped.
for (const c of cases.filter((k) => packageNames.includes(/@absoluteui\/([a-z]+)/.exec(k.code)?.[1] ?? ''))) {
  const entry = join(dir, `${c.name}.ts`);
  writeFileSync(entry, c.code);
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    minify: true,
    target: 'es2022',
    tsconfig: join(dir, 'tsconfig.json'),
    external: ['react', 'react-dom', 'react-dom/*', 'vue'],
    logLevel: 'silent',
  });
  const out = result.outputFiles[0]?.text ?? '';
  for (const m of c.mustInclude) if (!out.includes(MARKERS[m])) errors.push(`${c.name}: expected ${m} code to be present`);
  for (const m of c.mustExclude) if (out.includes(MARKERS[m])) errors.push(`${c.name}: ${m} code leaked into the bundle`);
  const kib = out.length / 1024;
  if (c.maxKiB !== undefined && kib > c.maxKiB) errors.push(`${c.name}: ${kib.toFixed(1)} KiB minified exceeds the ${String(c.maxKiB)} KiB budget`);
  report.push(`${c.name}: ${kib.toFixed(1)} KiB minified`);
}
if (errors.length) fail(errors);
console.log(`check:treeshake: ok\n  ${report.join('\n  ')}`);
