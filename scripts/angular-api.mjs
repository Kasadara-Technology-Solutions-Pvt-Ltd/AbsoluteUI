// Angular public API conventions (docs/PLAN-R9-ANGULAR.md D2, D5, D6), shared by
// generate-angular.mjs and the hand-written components. React and Vue keep their own names.

/**
 * Output name per component event (D5): action names without the `aui` prefix, never a
 * native DOM event name (`change`, `input`, `submit`, `reset`, `toggle`, `cancel`, `select`,
 * `close`, `invalid`), so `(name)` never also catches a bubbling native event.
 * The generator fails on an event missing here.
 */
export const OUTPUTS = {
  'aui-action': 'action',
  'aui-breakpoint-change': 'breakpointChange',
  'aui-cancel': 'cancelled',
  'aui-caps-lock': 'capsLockChange',
  'aui-card-activate': 'cardActivated',
  'aui-card-move': 'cardMoved',
  'aui-catalog-add': 'catalogAdded',
  'aui-change': 'changed',
  'aui-close': 'closed',
  'aui-collapse-change': 'collapseChange',
  'aui-collapsed-change': 'collapsedChange',
  'aui-column-move': 'columnMoved',
  'aui-columns-change': 'columnsChange',
  'aui-complete': 'completed',
  'aui-day-select': 'daySelected',
  'aui-dismiss': 'dismissed',
  'aui-drill': 'drilled',
  'aui-event-activate': 'eventActivated',
  'aui-event-change': 'eventChange',
  'aui-event-delete': 'eventDeleted',
  'aui-expand-change': 'expandChange',
  'aui-expanded-change': 'expandedChange',
  'aui-group-change': 'groupChange',
  'aui-detail-toggle': 'detailToggle',
  'aui-pivot-change': 'pivotChanged',
  'aui-node-pin': 'nodePinned',
  'aui-point-click': 'pointClicked',
  'aui-row-drag-start': 'rowDragStart',
  'aui-row-drop': 'rowDrop',
  'aui-row-resize': 'rowResize',
  'aui-row-pin': 'rowPin',
  'aui-group-toggle': 'groupToggled',
  'aui-cell-edit': 'cellEdit',
  'aui-cell-activate': 'cellActivated',
  'aui-cell-focus': 'cellFocus',
  'aui-cells-change': 'cellsChange',
  'aui-expire': 'expired',
  'aui-extend': 'extended',
  'aui-filter-change': 'filterChange',
  'aui-input': 'valueInput',
  'aui-invalid': 'invalidSubmit',
  'aui-layout-change': 'layoutChange',
  'aui-load-error': 'loadError',
  'aui-hover': 'hovered',
  'aui-maximize': 'maximized',
  'aui-mention': 'mentioned',
  'aui-mode-change': 'modeChange',
  'aui-move-error': 'moveError',
  'aui-navigate': 'navigate',
  'aui-node-move': 'nodeMoved',
  'aui-node-activate': 'nodeActivated',
  'aui-node-select': 'nodeSelected',
  'aui-open': 'opened',
  'aui-page-change': 'pageChange',
  'aui-range-change': 'rangeChange',
  'aui-reject': 'rejected',
  'aui-row-group-toggle': 'rowGroupToggled',
  'aui-rows-change': 'rowsChange',
  'aui-remove': 'removed',
  'aui-reset': 'formReset',
  'aui-scale-change': 'scaleChange',
  'aui-select': 'selected',
  'aui-selection-change': 'selectionChange',
  'aui-series-toggle': 'seriesToggled',
  'aui-sign-out': 'signedOut',
  'aui-slot-activate': 'slotActivated',
  'aui-snap-change': 'snapChange',
  'aui-sort-change': 'sortChange',
  'aui-state-change': 'stateChange',
  'aui-submit': 'submitted',
  'aui-task-activate': 'taskActivated',
  'aui-task-change': 'taskChange',
  'aui-toggle': 'toggled',
  'aui-zoom': 'zoomed',
  // R20 P5: Chat and Prompt Input. `feedbackGiven` because `feedback` is a Chat input.
  'aui-send': 'sent',
  'aui-stop': 'stopped',
  'aui-retry': 'retried',
  'aui-feedback': 'feedbackGiven',
  'aui-suggestion': 'suggestionChosen',
  'aui-suggestion-select': 'suggestionSelected',
  'aui-attachment-open': 'attachmentOpened',
  'aui-attachment-change': 'attachmentsChange',
  // R20 P4: Tree View and Command Palette.
  'aui-expand': 'expandToggled',
  'aui-move': 'moved',
  'aui-rename': 'renamed',
  'aui-activate': 'activated',
  // R20 P10: Timeline, Tour, Image Viewer, Code Viewer, File Manager.
  'aui-load-more': 'loadedMore',
  'aui-start': 'started',
  'aui-step-change': 'stepChange',
  'aui-step-missing': 'stepMissing',
  'aui-finish': 'finished',
  'aui-skip': 'skipped',
  'aui-rotate': 'rotated',
  'aui-crop': 'cropped',
  'aui-error': 'failed',
  'aui-copy': 'copied',
  'aui-delete': 'deleted',
  'aui-upload': 'uploaded',
  'aui-create-folder': 'folderCreated',
  // R20-25: Discussion.
  'aui-post': 'posted',
  'aui-reply': 'replied',
  'aui-edit': 'edited',
  'aui-sort': 'sortChanged',
};

/** Per-component output overrides; `null` drops an event that a model already reports as `<model>Change`. */
export const OUTPUT_OVERRIDES = {
  sidebar: { 'aui-expanded-change': 'groupToggled', 'aui-collapsed-change': null },
  'data-table': { 'aui-sort-change': null, 'aui-page-change': null },
  'data-grid': { 'aui-sort-change': null, 'aui-page-change': null },
  gantt: { 'aui-scale-change': null },
  // The detail also carries the reason (layout, sort, filter, expand, collapse).
  'pivot-grid': { 'aui-layout-change': 'layoutChanged' },
  // `selected` is the Tree View selection model.
  'tree-view': { 'aui-select': 'selectionChanged' },
  // The sort order is a model (sortChange).
  discussion: { 'aui-sort': null },
};

/**
 * Models (D5): options the user changes through the component. `read` is a TypeScript
 * expression over the event detail `d` (typed as the event's detail type).
 */
/** Charts: legend toggles and zoom are user-changeable state (D5, completed in M8b). */
const SERIES = { option: 'hiddenSeries', event: 'aui-series-toggle', read: 'd.hidden' };
const ZOOM_X = { option: 'zoomRange', event: 'aui-zoom', read: 'd.x' };
const ZOOM_Y = { option: 'zoomRangeY', event: 'aui-zoom', read: 'd.y' };
const SERIES_CHARTS = ['pie-chart', 'waterfall-chart', 'histogram', 'heatmap', 'radar-chart', 'treemap', 'funnel-chart', 'box-plot', 'bullet-chart', 'network-graph', 'calendar-heatmap'];

export const MODELS = {
  ...Object.fromEntries(SERIES_CHARTS.map((n) => [n, [SERIES]])),
  'bar-chart': [SERIES, ZOOM_X],
  'line-chart': [SERIES, ZOOM_X],
  'combo-chart': [SERIES, ZOOM_X],
  'candlestick-chart': [SERIES, ZOOM_X],
  'scatter-chart': [SERIES, ZOOM_X, ZOOM_Y],
  accordion: [{ option: 'value', event: 'aui-change', read: 'd.value' }],
  tabs: [{ option: 'value', event: 'aui-change', read: 'd.value' }],
  stepper: [{ option: 'value', event: 'aui-change', read: 'd.value' }],
  sidebar: [
    { option: 'value', event: 'aui-change', read: 'd.value' },
    { option: 'expanded', event: 'aui-expanded-change', read: 'd.value' },
    { option: 'collapsed', event: 'aui-collapsed-change', read: 'd.collapsed' },
  ],
  pagination: [
    { option: 'page', event: 'aui-change', read: 'd.page' },
    { option: 'pageSize', event: 'aui-change', read: 'd.pageSize ?? this.pageSize()' },
  ],
  'data-grid': [
    { option: 'sort', event: 'aui-sort-change', read: 'd.sort' },
    { option: 'filters', event: 'aui-filter-change', read: 'd.filters' },
    { option: 'quickFilter', event: 'aui-filter-change', read: 'd.quickFilter' },
    { option: 'advancedFilterModel', event: 'aui-filter-change', read: 'd.advancedFilter' },
    { option: 'selected', event: 'aui-selection-change', read: 'd.selected' },
    { option: 'groupBy', event: 'aui-group-change', read: 'd.groupBy' },
    { option: 'pivot', event: 'aui-pivot-change', read: 'd.pivot' },
    { option: 'page', event: 'aui-page-change', read: 'd.page' },
    { option: 'pageSize', event: 'aui-page-change', read: 'd.pageSize' },
  ],
  'data-table': [
    { option: 'sort', event: 'aui-sort-change', read: 'd.sorts' },
    { option: 'selected', event: 'aui-selection-change', read: 'd.selected' },
    { option: 'page', event: 'aui-page-change', read: 'd.page' },
    { option: 'pageSize', event: 'aui-page-change', read: 'd.pageSize' },
    { option: 'filters', event: 'aui-filter-change', read: 'd.filters' },
    { option: 'search', event: 'aui-filter-change', read: 'd.search' },
    { option: 'expanded', event: 'aui-expand-change', read: 'd.expandedIds' },
    { option: 'hiddenColumns', event: 'aui-columns-change', read: 'd.columns.hidden' },
    { option: 'columnOrder', event: 'aui-columns-change', read: 'd.columns.order' },
    { option: 'columnWidths', event: 'aui-columns-change', read: 'd.columns.widths' },
    { option: 'pinnedColumns', event: 'aui-columns-change', read: 'd.columns.pinned' },
    { option: 'collapsedGroups', event: 'aui-group-toggle', read: 'd.collapsedGroups' },
  ],
  gantt: [
    { option: 'scale', event: 'aui-scale-change', read: 'd.scale' },
    { option: 'tasks', event: 'aui-task-change', read: 'd.tasks' },
    { option: 'dependencies', event: 'aui-task-change', read: 'd.dependencies' },
  ],
  scheduler: [
    { option: 'view', event: 'aui-navigate', read: 'd.view' },
    { option: 'date', event: 'aui-navigate', read: 'd.date' },
    { option: 'events', event: 'aui-event-change', read: 'd.events' },
  ],
  'business-calendar': [{ option: 'month', event: 'aui-navigate', read: 'd.month' }],
  kanban: [{ option: 'cards', event: 'aui-card-move', read: 'd.cards' }],
  'org-chart': [{ option: 'nodes', event: 'aui-node-move', read: 'd.nodes' }],
  'pivot-grid': [{ option: 'layout', event: 'aui-layout-change', read: 'd.layout' }],
  'virtual-list': [{ option: 'value', event: 'aui-change', read: 'd.value' }],
  splitter: [{ option: 'sizes', event: 'aui-change', read: 'd.sizes' }],
  diagram: [{ option: 'model', event: 'aui-change', read: 'd.model' }],
  discussion: [{ option: 'sort', event: 'aui-sort', read: 'd.sort' }],
  'tree-view': [
    { option: 'selected', event: 'aui-select', read: 'd.selected' },
    { option: 'checked', event: 'aui-change', read: 'd.checked' },
    { option: 'expanded', event: 'aui-expand', read: 'd.expanded' },
  ],
};

/**
 * Angular templates for render slots (D8, M3). `queries`: content queries; `options`: option
 * expressions replacing `this.<option>()` (a bound input still wins).
 */
export const TEMPLATES = {
  'data-table': {
    directives: ['AuiCell', 'AuiRowDetail', 'AuiHeader', 'AuiEmpty', 'AuiGroupHeader', 'AuiEditor'],
    extraImports: ["import { AuiColumn } from './column.js';"],
    /** Options that become optional because children can provide them. */
    optional: ['columns'],
    queries: [
      'protected readonly cellTemplates: Signal<readonly AuiCell[]> = contentChildren(AuiCell);',
      'protected readonly rowDetailTemplate: Signal<AuiRowDetail | undefined> = contentChild(AuiRowDetail);',
      'protected readonly headerTemplates: Signal<readonly AuiHeader[]> = contentChildren(AuiHeader);',
      'protected readonly emptyTemplate: Signal<AuiEmpty | undefined> = contentChild(AuiEmpty);',
      'protected readonly groupHeaderTemplate: Signal<AuiGroupHeader | undefined> = contentChild(AuiGroupHeader);',
      'protected readonly columnDefs: Signal<readonly AuiColumn[]> = contentChildren(AuiColumn);',
      'protected readonly editorTemplates: Signal<readonly AuiEditor[]> = contentChildren(AuiEditor);',
    ],
    options: {
      columns: 'this.tableColumns(this.columns(), this.columnDefs(), this.cellTemplates(), this.headerTemplates(), this.editorTemplates(), () => this.rows())',
      renderEmpty: 'this.renderEmpty() ?? this.templateHook(this.emptyTemplate()?.template, () => undefined)',
      renderGroupHeader: 'this.renderGroupHeader() ?? this.templateHook(this.groupHeaderTemplate()?.template, (group: P[0]) => ({ $implicit: group, group }))',
      renderDetail: 'this.renderDetail() ?? this.templateHook(this.rowDetailTemplate()?.template, (row: Row) => ({ $implicit: row, row }))',
    },
  },
  kanban: itemTemplate('renderCard'),
  'org-chart': itemTemplate('renderNode'),
  scheduler: itemTemplate('renderEvent'),
  combobox: itemTemplate('renderOption'),
  'multi-select': itemTemplate('renderOption'),
  'menu-bar': itemTemplate('renderItem'),
  select: {
    directives: ['AuiItem', 'AuiSelectedItem'],
    queries: [
      'protected readonly itemTemplate: Signal<AuiItem | undefined> = contentChild(AuiItem);',
      'protected readonly selectedTemplate: Signal<AuiSelectedItem | undefined> = contentChild(AuiSelectedItem);',
    ],
    options: {
      renderOption: itemTemplate('renderOption').options.renderOption,
      renderValue: 'this.renderValue() ?? this.templateHook(this.selectedTemplate()?.template, (item: P[0]) => ({ $implicit: item, item }))',
    },
  },
};

function itemTemplate(option) {
  return {
    directives: ['AuiItem'],
    queries: ['protected readonly itemTemplate: Signal<AuiItem | undefined> = contentChild(AuiItem);'],
    options: {
      [option]: `this.${option}() ?? this.templateHook(this.itemTemplate()?.template, (item: P[0], context: P[1]) => ({ $implicit: item, item, context }))`,
    },
  };
}

/**
 * Content projection (M3). `parts`: option -> marker directive of a projected element
 * (`<aui-card-content>`); `defaultSlot`: option filled from the default projected content.
 * A bound input still wins.
 */
export const PROJECTION = {
  card: { parts: { content: 'AuiCardContent', footer: 'AuiCardFooter', media: 'AuiCardMedia' }, from: './parts.js' },
  alert: { defaultSlot: 'message' },
};

/**
 * Read-only state signals (D25): controller getters the components keep current and report
 * through events. Signal name -> initial value (TypeScript expression) before the component
 * exists. The type is the controller getter's type; the signal re-reads after events, option
 * updates, and typed methods (no polling).
 */
const PICKERS = ['select', 'combobox', 'multi-select', 'date-picker', 'date-time-picker', 'time-picker', 'date-range-picker', 'month-picker', 'year-picker', 'quarter-picker'];
export const STATE = {
  treemap: { path: '[]' },
  ...Object.fromEntries(PICKERS.map((n) => [n, { isOpen: 'false' }])),
  'password-input': { revealed: 'false' },
  'otp-input': { complete: 'false' },
  'file-upload': { rejections: '[]' },
  'data-table': { rowCount: '0' },
  'data-grid': { rowCount: '0' },
  sidebar: { mode: "'inline'", isOpen: 'false' },
  alert: { isDismissed: 'false' },
  breadcrumb: { expanded: 'false' },
  'error-summary': { isVisible: 'false' },
  'upload-queue': { busy: 'false' },
  'sortable-list': { isDragging: 'false' },
  'org-chart': { canUndo: 'false', canRedo: 'false', scale: '1' },
  kanban: { canUndo: 'false', canRedo: 'false', pending: '[]' },
  gantt: { canUndo: 'false', canRedo: 'false' },
  scheduler: { canUndo: 'false', canRedo: 'false' },
};

/** Models whose controller getter has a wider type than the option (not re-read after typed methods). */
export const UNTRACKED_MODELS = { pagination: ['pageSize'] };

/** Event detail types that take the component's row type parameter. */
export const GENERIC_DETAILS = new Set(['DataTableCellEditDetail', 'DataGridCellActivateDetail']);

/** Controller methods never exposed (D6): lifecycle, and value writes that go through the model or the form. */
export const HIDDEN_METHODS = new Set(['update', 'destroy', 'setValue', 'setChecked', 'enhance', 'create']);

/** Element selector for a component directory name (D2). */
export const elementSelector = (name) => `aui-${name}`;
