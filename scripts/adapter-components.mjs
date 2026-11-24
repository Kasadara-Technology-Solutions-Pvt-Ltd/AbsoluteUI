// Components bound by the generated framework adapters (SPEC section 22). Shared by
// generate-angular.mjs and generate-adapters.mjs (React, Vue), so every adapter
// binds the same components with the same value contracts.

/**
 * Form controls: two-way value binding plus validity.
 * `value`: model type; `read`/`write`: controller accessors (`c` = controller, `v` = value);
 * `event`: user-change event; `option`: initial-value option (default `value`);
 * `core`/`types`: type imports from @absoluteui/core / the component subpath.
 */
export const CONTROLS = {
  'text-input': { value: 'string', read: 'c.value', write: "c.setValue(v ?? '')", event: 'aui-input' },
  textarea: { value: 'string', read: 'c.value', write: "c.setValue(v ?? '')", event: 'aui-input' },
  'number-input': { value: 'number | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-input' },
  select: { value: 'string | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change' },
  combobox: { value: 'string | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change' },
  checkbox: { value: 'boolean', read: 'c.checked', write: 'c.setChecked(v ?? false)', event: 'aui-change', option: 'checked' },
  switch: { value: 'boolean', read: 'c.checked', write: 'c.setChecked(v ?? false)', event: 'aui-change', option: 'checked' },
  'checkbox-group': { value: 'string[]', read: '[...c.value]', write: 'c.setValue(v ?? [])', event: 'aui-change' },
  'multi-select': { value: 'string[]', read: '[...c.value]', write: 'c.setValue(v ?? [])', event: 'aui-change' },
  'toggle-group': { value: 'string[]', read: '[...c.value]', write: 'c.setValue(v ?? [])', event: 'aui-change', noValidity: true },
  'tag-group': { value: 'string[]', read: '[...c.value]', write: 'c.setValue(v ?? [])', event: 'aui-change', noValidity: true },
  slider: { value: 'SliderValue', read: 'c.value', write: 'c.setValue(v ?? c.value)', event: 'aui-change', types: ['SliderValue'] },
  'radio-group': { value: 'string | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change' },
  'date-input': { value: 'DateInputValue | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change', types: ['DateInputValue'] },
  'date-picker': { value: 'PlainDate | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change', core: ['PlainDate'] },
  'date-time-picker': { value: 'Instant | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change', core: ['Instant'] },
  'time-picker': { value: 'PlainTime | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change', core: ['PlainTime'] },
  calendar: { value: 'PlainDate | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change', core: ['PlainDate'], noValidity: true },
  'date-range-picker': { value: 'Range<PlainDate> | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change', core: ['PlainDate', 'Range'] },
  'month-picker': { value: 'PlainYearMonth | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change', core: ['PlainYearMonth'] },
  'year-picker': { value: 'number | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change' },
  'quarter-picker': { value: 'PlainYearQuarter | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change', core: ['PlainYearQuarter'] },
  'duration-picker': { value: 'Duration | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change', core: ['Duration'] },
  'file-upload': { value: 'File[]', read: '[...c.value]', write: 'c.setValue(v ?? [])', event: 'aui-change' },
  'password-input': { value: 'string', read: 'c.value', write: "c.setValue(v ?? '')", event: 'aui-input' },
  'otp-input': { value: 'string', read: 'c.value', write: "c.setValue(v ?? '')", event: 'aui-input' },
  'rich-text-editor': { value: 'string', read: 'c.value', write: "c.setValue(v ?? '')", event: 'aui-input' },
  'prompt-input': { value: 'string', read: 'c.value', write: "c.setValue(v ?? '')", event: 'aui-input' },
  'recurrence-picker': { value: 'RecurrenceRule | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change', core: ['RecurrenceRule'] },
  'schedule-picker': { value: 'ScheduleValue | null', read: 'c.value', write: 'c.setValue(v)', event: 'aui-change', types: ['ScheduleValue'] },
  'color-picker': { value: 'ColorPickerValue', read: 'c.value', write: 'c.setValue(v ?? null)', event: 'aui-change', types: ['ColorPickerValue'] },
  rating: { value: 'RatingValue', read: 'c.value', write: 'c.setValue(v ?? null)', event: 'aui-change', types: ['RatingValue'] },
  'transfer-list': { value: 'string[]', read: '[...c.value]', write: 'c.setValue(v ?? [])', event: 'aui-change' },
  cascader: { value: 'CascaderValue', read: 'c.value', write: 'c.setValue(v ?? null)', event: 'aui-change', types: ['CascaderValue'] },
  'mention-input': { value: 'MentionInputValue', read: 'c.value', write: "c.setValue(v ?? '')", event: 'aui-change', types: ['MentionInputValue'] },
  'signature-pad': { value: 'SignaturePadValue', read: 'c.value', write: 'c.setValue(v ?? null)', event: 'aui-change', types: ['SignaturePadValue'] },
  'masked-input': { value: 'string', read: 'c.value', write: "c.setValue(v ?? '')", event: 'aui-input' },
  'tree-select': { value: 'string[]', read: '[...c.value]', write: 'c.setValue(v ?? [])', event: 'aui-change' },
};

/** Host-rendered display components: `X.create(host, options)`. */
export const HOSTS = ['accordion', 'alert', 'avatar', 'avatar-group', 'badge', 'carousel', 'collapsible', 'kbd', 'breadcrumb', 'button-group', 'card', 'data-table', 'data-grid', 'error-summary', 'inline-message', 'pagination', 'progress-bar', 'skeleton', 'spinner', 'tabs', 'validation-message', 'upload-queue', 'password-strength-meter', 'stepper', 'menu-bar', 'sidebar', 'sortable-list', 'bar-chart', 'line-chart', 'pie-chart', 'sparkline', 'scatter-chart', 'combo-chart', 'waterfall-chart', 'histogram', 'heatmap', 'gauge', 'radar-chart', 'treemap', 'funnel-chart', 'box-plot', 'bullet-chart', 'stat-card', 'pivot-grid', 'org-chart', 'business-calendar', 'scheduler', 'kanban', 'gantt', 'virtual-list', 'splitter', 'empty-state', 'chat', 'schema-form', 'form-builder', 'diagram', 'tree-view', 'command-palette', 'candlestick-chart', 'network-graph', 'calendar-heatmap', 'timeline', 'tour', 'image-viewer', 'code-viewer', 'file-manager', 'discussion'];

/** Components whose options are generic: the binding is generic too, so the framework infers Row from bindings. */
export const GENERIC = { 'data-table': 'Row', 'data-grid': 'Row', 'pivot-grid': 'Row', 'virtual-list': 'Item' };

/** api.json options that belong to a sibling helper in the same module (not to the factory). */
export const EXCLUDE = {
  card: ['padded'],
  // Composition hooks for other components; `formControl` would also collide with Angular's [formControl].
  'date-input': ['formControl', 'trailing'],
  'date-picker': ['formControl'],
  'date-time-picker': ['formControl'],
  'recurrence-picker': ['formControl'],
};

/** Host attributes that would leak native semantics (tooltip, role) when bound statically. */
export const STRIP = ['title', 'role'];

export const pascal = (s) => s.replace(/(^|-)([a-z])/g, (_m, _d, c) => c.toUpperCase());
export const camel = (s) => s.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());

/** The exported `<Class><Event>Detail` type for an event, if the component subpath exports one. */
export function detailType(cls, event, exported) {
  const suffix = pascal(event.replace(/^aui-/, ''));
  const candidates = [`${cls}${suffix}Detail`, ...(event === 'aui-change' || event === 'aui-input' ? [`${cls}ValueDetail`] : [])];
  return candidates.find((c) => exported.has(c)) ?? null;
}
