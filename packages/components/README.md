# @absoluteui/components

125 accessible, framework-neutral UI components. Each one renders into an element you own, works with any framework or none, follows WAI-ARIA patterns, is tested against WCAG 2.2 AA in three themes, and runs under a strict Content Security Policy with Trusted Types. Every component is its own subpath import with its own stylesheet.

## What's in the package

### Forms

- **Form**: State manager and validation orchestrator for a native &lt;form>.
- **Form Field**: Gives a consumer-owned native &lt;input>, &lt;textarea>.
- **Fieldset**: Enhances a native fieldset that groups related controls.
- **Validation Message**: A standalone field message (error, warning, success, or info) for controls that AbsoluteUI does not render itself.
- **Error Summary**: Lists every error after a failed submission as links that move focus to the offending field (GOV.UK error summary pattern).
- **Text Input**: Single-line text entry built on a native &lt;input>.
- **Textarea**: Multi-line text entry built on a native &lt;textarea>.
- **Number Input**: Locale-aware numeric entry on a text input with the spinbutton role.
- **Slider**: Picks a number, or a range with two thumbs, from a bounded scale such as volume, a price range, or working hours.
- **Select**: Single choice from a known, flat list of options, following the WAI-ARIA APG select-only combobox pattern.
- **Combobox**: Editable single-select combobox with list autocomplete (WAI-ARIA 1.2).
- **Multi Select**: Editable combobox with a multi-selectable listbox.
- **Checkbox**: A single on/off choice built on a native &lt;input type="checkbox">, restyled with appearance.
- **Checkbox Group**: Several related, independent choices in a &lt;fieldset> + &lt;legend>.
- **Radio Group**: Exactly one choice from a short, visible set of mutually exclusive options.
- **Switch**: An on/off setting that takes effect immediately, built on a native &lt;input type="checkbox" role="switch"> with a track and thumb.
- **Rich Text Editor**: Formatted multi-line text entry on a contenteditable surface whose content is owned by an internal document model.
- **Schema Form**: Renders a complete form from a JSON Schema subset.
- **Form Builder**: A form designer that produces the schema and UI schema Schema Form renders.
- **Masked Input**: A text field that formats input against a pattern mask (phone numbers, IBANs, postal codes, fixed-shape codes).
- **Mention Input**: A plain-text field that suggests people, tags, or other entities when the user types a trigger character such as @ or #.
- **Rating**: Picks a score on a short scale of stars or a custom symbol.
- **Color Picker**: Picks a color through a saturation and brightness area, a hue slider, and an optional opacity slider.
- **Cascader**: Selects a node in a hierarchy through cascading columns, such as country > state > city or category > subcategory.
- **Transfer List**: Moves items between two lists, Available and Selected, such as team members, permissions, or report columns.
- **Signature Pad**: Captures a handwritten signature with mouse, pen.
- **Tree Select**: Form control for choosing one or several nodes of a hierarchy: a combobox-style field (aria-haspopup=tree) whose popup is a Tree View.

### Buttons

- **Button**: Triggers an action.
- **Button Group**: A labelled role=group of related native buttons, visually attached (shared borders) or spaced, horizontal or vertical.
- **Toggle Group**: Named group of toggle buttons (aria-pressed) for one setting with a few choices, such as text alignment, a list or grid view.

### Date and time

- **Date Input**: Keyboard-first date or date-time entry using locale-ordered numeric segments.
- **Date Picker**: Date field that combines a segmented Date Input.
- **DateTime Picker**: Exact-moment field that combines a segmented Date Input.
- **Time Picker**: Enter a wall-clock time of day.
- **Calendar**: Month grid for browsing and choosing a PlainDate.
- **Date Range Picker**: Inclusive date range field: two segmented Date Inputs.
- **Month Picker**: Enter a calendar month without a day.
- **Year Picker**: Enter a calendar year (an integer 1-9999) in one four-digit segment inside a labelled group.
- **Quarter Picker**: Enter a calendar quarter (PlainYearQuarter; Q1 is January to March) in quarter and year segments ordered by a localizable pattern message.
- **Duration Picker**: Enter a fixed-length, non-negative Duration.
- **Recurrence Picker**: Edit how something repeats: a RecurrenceRule.
- **Schedule Picker**: Choose when something happens in one form control.
- **Business Calendar**: Show and edit a working-time calendar.

### Authentication

- **Password Input**: Password field built on a native password &lt;input>.
- **Password Strength Meter**: Advisory password feedback: a requirements checklist.
- **OTP Input**: Entry for one-time passcodes, PINs, MFA codes, and recovery codes.
- **Session Warning Dialog**: Alert dialog (built on Dialog) that counts down to a session deadline.

### Upload

- **File Upload**: File picker built on a native &lt;input type="file"> opened by a real button.
- **Upload Queue**: List of files being uploaded, with a Progress Bar per item, status.

### Layout and content

- **Layout (Container, Stack, Flex, Grid, Divider)**: Layout primitives as CSS classes that work without JavaScript.
- **Card and Surface**: Surface: a bordered, token-colored panel (flat, raised, sunken, optionally padded).
- **Accordion**: Vertically stacked headings that each show or hide a section of content.
- **Collapsible**: Single disclosure: a native button.
- **Scroll Area**: Enhances an element whose content can overflow.
- **Typography (Heading, Text, Link, Code, Prose)**: Token-based typography as CSS classes that work without JavaScript.
- **Badge**: Short static label such as 'Active', 'Beta', or '3 new' that classifies the content next to it.
- **Kbd**: Keyboard shortcut shown as keycaps, from the same hotkey syntax as matchesHotkey ('Mod+Shift+K').
- **Avatar**: Picture of a person or entity with fallbacks: the image, then initials from the name, then an optional icon.
- **Avatar Group**: Row of overlapping avatars for the people on a record, with the overflow collapsed into '+N'.
- **Tag Group**: Interactive tags such as applied filters, recipients, or labels on a record: removable, selectable (single or multiple), or both.
- **Carousel**: Shows one slide at a time from a set.
- **Splitter**: Two or more resizable panes, side by side or stacked, following the WAI-ARIA APG window splitter.
- **Timeline**: Shows an activity or event history.
- **Image Viewer**: Shows photos, scans, and screenshots inline or in a gallery lightbox.
- **Code Viewer**: Read-only code display with line numbers, syntax highlighting for TypeScript, JavaScript, JSON, HTML, CSS, SQL, Bash, and Markdown.

### Navigation

- **Sidebar**: Application side navigation: a labelled &lt;nav> with a list of links.
- **Menu Bar**: Horizontal application menubar (WAI-ARIA APG Menubar): a role=menubar of role=menuitem buttons with one tab stop (roving tabindex).
- **Menu**: Actions menu opened from a trigger button.
- **Context Menu**: A Menu (WAI-ARIA APG Menu, same engine as Menu.
- **Tabs**: A labelled tablist of native buttons with a roving tabindex and one tabpanel per tab.
- **Breadcrumb**: A labelled &lt;nav> with an ordered list of links to the current page's ancestors.
- **Pagination**: Page navigation for paged data.
- **Stepper**: Progress indicator for multi-step flows rendered as navigation: a labelled &lt;nav> with an ordered list of steps.
- **Tree View**: Hierarchical list following the WAI-ARIA APG tree pattern.
- **Command Palette**: Keyboard-first command search in a modal dialog, opened with Ctrl+K.

### Overlays

- **Dialog**: Modal dialog built on native &lt;dialog>.showModal().
- **Drawer**: Panel that slides in from a screen edge, built on native &lt;dialog>.
- **Bottom Sheet**: Panel attached to the bottom edge of the viewport, built on native &lt;dialog>.
- **Popover**: Non-modal dialog anchored to a trigger button (APG disclosure plus non-modal dialog).
- **Tooltip**: Short text hint for a trigger that meets WCAG 1.4.13.
- **Hover Card**: A rich, non-modal preview shown while a trigger.
- **Tour**: Product tour and onboarding: a sequence of steps, each anchored to an element of the page.

### Feedback

- **Alert**: Prominent message block for page- or section-level status.
- **Inline Message**: Compact one-line status shown next to the content it describes.
- **Toast**: Transient notifications stacked in a labelled region (section aria-label 'Notifications') rendered in the top layer with popover=manual.
- **Progress Bar**: Determinate or indeterminate progress indicator.
- **Spinner**: Indeterminate loading indicator.
- **Skeleton**: Decorative loading placeholders.
- **Empty State**: Explains why a table, list, search.

### Data

- **Data Table**: Enterprise CRUD table and grid.
- **Data Grid**: Spreadsheet-like ARIA grid for large data.
- **Data Grid Editors**: Combobox and Multi Select cell editors for Data Grid columns.
- **Data Grid Accessories**: Column and cell menus, column chooser, side bar, status bar, toolbar, tooltips, find, and notes for the Data Grid.
- **Data Grid Export**: Excel workbooks from a Data Grid, with typed values, styles, outlines, and protection, written in the browser.
- **Data Grid PDF**: PDF documents from a Data Grid, with repeated headers, page numbers, and embedded fonts for any script.
- **Data Grid Formulas**: Calculated columns, cell formulas, and a formula bar for the Data Grid, with a safe parser and evaluator.
- **Data Grid Charts**: Sparkline columns and charts of selected cells or pivot results for the Data Grid.
- **Data Grid Schema**: A JSON Schema, a summary, and validated changes of a Data Grid view, for tools such as AI assistants.
- **Pivot Grid**: Cross-tabulates records by row fields and column fields and aggregates value fields.
- **Virtual List**: Renders only the visible items (plus an overscan) of very large lists, 100,000 items and more, with fixed or measured variable heights.
- **File Manager**: Browses and organizes files held by a host-supplied async provider.
- **Sortable List**: A labelled, vertical, reorderable list with two equivalent input paths.
- **Organization Chart**: Renders a reporting hierarchy from flat nodes.
- **Org Chart Export**: Saves the visible part of an Organization Chart as a standalone SVG document or PNG image.
- **Diagram**: A flowchart and diagram editor and viewer rendered in SVG from a JSON model.

### Charts

- **Line Chart**: Accessible SVG line and area chart for trends over a shared x axis.
- **Bar Chart**: Accessible SVG bar and column chart for comparing values across categories.
- **Pie Chart**: Accessible SVG pie and donut chart for a single part-to-whole breakdown.
- **Sparkline**: Word-sized inline trend graphic.
- **Scatter Chart**: Accessible SVG scatter plot (and bubble chart when points have a size) of one or more series of.
- **Combo Chart**: Accessible SVG chart combining bars, lines, and areas over shared categories, each series on the primary.
- **Waterfall Chart**: Accessible SVG waterfall chart showing how a starting value changes through a sequence of increases and decreases.
- **Histogram**: Accessible SVG histogram of the distribution of raw numeric values in adjacent bins on a linear axis.
- **Heatmap**: Accessible SVG heatmap: a matrix of values over two categorical axes.
- **Gauge**: Radial gauge for one value within a known range on a 240 degree arc.
- **Radar Chart**: Accessible SVG radar (polar) chart comparing a few series across several quantitative axes arranged clockwise around a circle.
- **Treemap**: Accessible SVG treemap for hierarchical part-to-whole data.
- **Funnel Chart**: Accessible SVG funnel chart for sequential stages.
- **Box Plot**: Accessible SVG box plot for comparing distributions per category.
- **Bullet Chart**: Accessible SVG bullet chart: compact horizontal measures against a target and up to three qualitative ranges.
- **Chart Export**: Exports any rendered chart as a standalone SVG document or PNG image, with theme colors and patterns, and nothing uploaded.
- **Candlestick Chart**: Accessible SVG candlestick chart.
- **Network Graph**: Accessible SVG network graph: nodes and edges laid out by a deterministic force-directed simulation (seeded; it settles, then stops).
- **Calendar Heatmap**: Accessible SVG calendar heatmap.

### Dashboard

- **Dashboard**: Renders a configurable, API-driven dashboard from one versioned JSON definition.
- **Dashboard Grid**: Enhances a host whose children carry data-aui-item="&lt;id>" into a responsive column grid (a labelled region).
- **Dashboard Widget**: Enhances a host element in place into a titled dashboard panel.
- **Stat Card**: A KPI / metric card: a headline value.

### Planning and boards

- **Scheduler**: Show and edit events in day, week, work-week, month, agenda, and resource timeline views.
- **Kanban Board**: A board of columns (workflow states) and optional swimlanes (rows) holding cards.
- **Gantt Chart**: A project schedule: a task tree grid.

### Conversation

- **Chat**: A conversation view for an AI assistant or for people.
- **Prompt Input**: The composer of a chat or assistant.
- **Discussion**: A threaded comments and forum control.

## Browser support

Chrome 116, Edge 116, Firefox 125, Safari (macOS) 17, Safari (iOS and iPadOS) 18.3, or later. Details: [Browser support](https://aui.kasadara.com/docs/quality/browser-support/).

## Documentation

Full documentation: [aui.kasadara.com/docs/components/](https://aui.kasadara.com/docs/components/)

## License

Licensed under the [Apache License 2.0](https://aui.kasadara.com/license/). Copyright (c) 2026 Kasadara Technology Solutions Pvt Ltd; see the LICENSE and NOTICE files in this package. AbsoluteUI is open source, Kasadara's contribution to the open-source community; the source is at https://github.com/Kasadara-Technology-Solutions-Pvt-Ltd/AbsoluteUI. Report vulnerabilities as described in the [Security Policy](https://aui.kasadara.com/security/).
