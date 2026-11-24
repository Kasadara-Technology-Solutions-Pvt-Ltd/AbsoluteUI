# @absoluteui/angular

AbsoluteUI for Angular 22: every component as a standalone Angular component or directive, with configuration through providers, form integration, signal inputs and two-way models, outputs, templates, router integration, and server rendering. The behavior comes from `@absoluteui/components`; this package adds everything Angular-specific.

## What's in the package

### Forms

- **Form** (`form[auiForm]`)
- **Form Field** (`aui-form-field`)
- **Fieldset** (`fieldset[auiFieldset]`)
- **Validation Message** (`aui-validation-message`)
- **Error Summary** (`aui-error-summary`)
- **Text Input** (`aui-text-input`)
- **Textarea** (`aui-textarea`)
- **Number Input** (`aui-number-input`)
- **Slider** (`aui-slider`)
- **Select** (`aui-select`)
- **Combobox** (`aui-combobox`)
- **Multi Select** (`aui-multi-select`)
- **Checkbox** (`aui-checkbox`)
- **Checkbox Group** (`aui-checkbox-group`)
- **Radio Group** (`aui-radio-group`)
- **Switch** (`aui-switch`)
- **Rich Text Editor** (`aui-rich-text-editor`)
- **Schema Form** (`aui-schema-form`)
- **Form Builder** (`aui-form-builder`)
- **Masked Input** (`aui-masked-input`)
- **Mention Input** (`aui-mention-input`)
- **Rating** (`aui-rating`)
- **Color Picker** (`aui-color-picker`)
- **Cascader** (`aui-cascader`)
- **Transfer List** (`aui-transfer-list`)
- **Signature Pad** (`aui-signature-pad`)
- **Tree Select** (`aui-tree-select`)

### Buttons

- **Button** (`button[auiButton]`)
- **Button Group** (`aui-button-group`)
- **Toggle Group** (`aui-toggle-group`)

### Date and time

- **Date Input** (`aui-date-input`)
- **Date Picker** (`aui-date-picker`)
- **DateTime Picker** (`aui-date-time-picker`)
- **Time Picker** (`aui-time-picker`)
- **Calendar** (`aui-calendar`)
- **Date Range Picker** (`aui-date-range-picker`)
- **Month Picker** (`aui-month-picker`)
- **Year Picker** (`aui-year-picker`)
- **Quarter Picker** (`aui-quarter-picker`)
- **Duration Picker** (`aui-duration-picker`)
- **Recurrence Picker** (`aui-recurrence-picker`)
- **Schedule Picker** (`aui-schedule-picker`)
- **Business Calendar** (`aui-business-calendar`)

### Authentication

- **Password Input** (`aui-password-input`)
- **Password Strength Meter** (`aui-password-strength-meter`)
- **OTP Input** (`aui-otp-input`)
- **Session Warning Dialog** (`aui-session-warning-dialog`)

### Upload

- **File Upload** (`aui-file-upload`)
- **Upload Queue** (`aui-upload-queue`)

### Layout and content

- **Layout (Container, Stack, Flex, Grid, Divider)** (`[auiStack]`)
- **Card and Surface** (`aui-card`)
- **Accordion** (`aui-accordion`)
- **Collapsible** (`aui-collapsible`)
- **Scroll Area** (`[auiScrollArea]`)
- **Typography (Heading, Text, Link, Code, Prose)** (`h1[auiHeading], h2[auiHeading], h3[auiHeading], h4[auiHeading], h5[auiHeading], h6[auiHeading]`)
- **Badge** (`aui-badge`)
- **Kbd** (`aui-kbd`)
- **Avatar** (`aui-avatar`)
- **Avatar Group** (`aui-avatar-group`)
- **Tag Group** (`aui-tag-group`)
- **Carousel** (`aui-carousel`)
- **Splitter** (`aui-splitter`)
- **Timeline** (`aui-timeline`)
- **Image Viewer** (`aui-image-viewer`)
- **Code Viewer** (`aui-code-viewer`)

### Navigation

- **Sidebar** (`aui-sidebar`)
- **Menu Bar** (`aui-menu-bar`)
- **Menu** (`button[auiMenu]`)
- **Context Menu** (`[auiContextMenu]`)
- **Tabs** (`aui-tabs`)
- **Breadcrumb** (`aui-breadcrumb`)
- **Pagination** (`aui-pagination`)
- **Stepper** (`aui-stepper`)
- **Tree View** (`aui-tree-view`)
- **Command Palette** (`aui-command-palette`)

### Overlays

- **Dialog** (`aui-dialog`)
- **Drawer** (`aui-drawer`)
- **Bottom Sheet** (`aui-bottom-sheet`)
- **Popover** (`[auiPopover]`)
- **Tooltip** (`[auiTooltip]`)
- **Hover Card** (`[auiHoverCard]`)
- **Tour** (`aui-tour`)

### Feedback

- **Alert** (`aui-alert`)
- **Inline Message** (`aui-inline-message`)
- **Progress Bar** (`aui-progress-bar`)
- **Spinner** (`aui-spinner`)
- **Skeleton** (`aui-skeleton`)
- **Empty State** (`aui-empty-state`)

### Data

- **Data Table** (`aui-data-table`)
- **Data Grid** (`aui-data-grid`)
- **Pivot Grid** (`aui-pivot-grid`)
- **Virtual List** (`aui-virtual-list`)
- **File Manager** (`aui-file-manager`)
- **Sortable List** (`aui-sortable-list`)
- **Organization Chart** (`aui-org-chart`)
- **Diagram** (`aui-diagram`)

### Charts

- **Line Chart** (`aui-line-chart`)
- **Bar Chart** (`aui-bar-chart`)
- **Pie Chart** (`aui-pie-chart`)
- **Sparkline** (`aui-sparkline`)
- **Scatter Chart** (`aui-scatter-chart`)
- **Combo Chart** (`aui-combo-chart`)
- **Waterfall Chart** (`aui-waterfall-chart`)
- **Histogram** (`aui-histogram`)
- **Heatmap** (`aui-heatmap`)
- **Gauge** (`aui-gauge`)
- **Radar Chart** (`aui-radar-chart`)
- **Treemap** (`aui-treemap`)
- **Funnel Chart** (`aui-funnel-chart`)
- **Box Plot** (`aui-box-plot`)
- **Bullet Chart** (`aui-bullet-chart`)
- **Candlestick Chart** (`aui-candlestick-chart`)
- **Network Graph** (`aui-network-graph`)
- **Calendar Heatmap** (`aui-calendar-heatmap`)

### Dashboard

- **Dashboard** (`aui-dashboard`)
- **Dashboard Grid** (`aui-dashboard-grid`)
- **Dashboard Widget** (`aui-dashboard-widget`)
- **Stat Card** (`aui-stat-card`)

### Planning and boards

- **Scheduler** (`aui-scheduler`)
- **Kanban Board** (`aui-kanban`)
- **Gantt Chart** (`aui-gantt`)

### Conversation

- **Chat** (`aui-chat`)
- **Prompt Input** (`aui-prompt-input`)
- **Discussion** (`aui-discussion`)

### Angular integration

- **`@absoluteui/angular`**: `AuiConfig`, `AuiDirectionality`, `AuiIcons`, `AuiIds`, `AuiLocale`, `AuiPlatform`, `AuiTheme`, `provideAbsoluteUI`, `provideAbsoluteUIConfig`
- **`@absoluteui/angular/a11y`**: `AuiLiveAnnouncer`, `AuiFocusTrap`, `AuiFocusRestore`, `AuiRovingTabindex`, `AuiHotkey`, `Politeness`
- **`@absoluteui/angular/chart-export`**: `chartToSvg`, `chartToPng`, `downloadChart`, `ChartDownloadOptions`, `ChartExportFormat`, `ChartExportOptions`
- **`@absoluteui/angular/forms`**: `AUI_FORM_ERRORS`, `AuiControlState`, `AuiFormErrorMessages`, `provideAuiFormErrors`
- **`@absoluteui/angular/icon`**: `AuiIcon`
- **`@absoluteui/angular/overlay`**: `AuiDialogRef`, `AuiDialogService`, `AuiDrawerService`
- **`@absoluteui/angular/pivot-field-list`**: `AuiPivotFieldList`
- **`@absoluteui/angular/router`**: `AuiRouterNav`
- **`@absoluteui/angular/templates`**: `AuiCell`, `AuiRowDetail`, `AuiItem`, `AuiSelectedItem`, `AuiHeader`, `AuiEmpty`, `AuiGroupHeader`, `AuiEditor`
- **`@absoluteui/angular/testing`**: `AuiButtonHarness`, `AuiFieldHarness`, `AuiTextInputHarness`, `AuiSelectHarness`, `AuiDatePickerHarness`, `AuiTabsHarness`, `AuiDialogHarness`, `AuiDataTableHeaderHarness`, `AuiDataTableRowHarness`, `AuiDataTableHarness`, `AuiCheckboxHarness`, `AuiSwitchHarness`, `AuiRadioGroupHarness`, `AuiTextareaHarness`, `AuiNumberInputHarness`, `AuiComboboxHarness`, `AuiMultiSelectHarness`, `AuiSidebarHarness`, `AuiPaginationHarness`, `AuiMenuHarness`
- **`@absoluteui/angular/toast`**: `AuiToaster`, `provideAuiToaster`

## Browser support

Chrome 116, Edge 116, Firefox 125, Safari (macOS) 17, Safari (iOS and iPadOS) 18.3, or later. Details: [Browser support](https://aui.kasadara.com/docs/quality/browser-support/).

## Documentation

Full documentation: [aui.kasadara.com/docs/angular/](https://aui.kasadara.com/docs/angular/)

## License

Licensed under the [Apache License 2.0](https://aui.kasadara.com/license/). Copyright (c) 2026 Kasadara Technology Solutions Pvt Ltd; see the LICENSE and NOTICE files in this package. AbsoluteUI is open source, Kasadara's contribution to the open-source community; the source is at https://github.com/Kasadara-Technology-Solutions-Pvt-Ltd/AbsoluteUI. Report vulnerabilities as described in the [Security Policy](https://aui.kasadara.com/security/).
