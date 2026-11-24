# Data Grid

> Package: `@absoluteui/components/data-grid` | Styles: `@absoluteui/components/data-grid/style.css` and `@absoluteui/components/pagination/style.css` (with `advancedFilter`, also the dialog and button styles for the builder; with the list editors from `@absoluteui/components/data-grid/editors`, the combobox and multi-select styles) | Since 0.9.0

## 1. Purpose

A spreadsheet-like ARIA grid for large and wide data.
- Users move cell by cell with the keyboard; the grid is one Tab stop.
- Rows and columns are virtualized in one native scroll container, so a million rows and hundreds of columns stay fast.
- Column groups, pinning to either edge, resizing, moving, multi-sort, paging, and a saved view state are built in.
- Column filters (text, number, BigInt, date with relative and business-day ranges, boolean, set) through a filter panel, an optional floating filter row, a quick filter with an optional search box, and an application filter.
- An advanced filter: an expression bar with type-ahead suggestions (`[Name] contains "ann" and ([Age] >= 30 or [City] is any of ("Oslo", "Lima"))`) and a builder dialog that edit the same tree of groups and conditions.

- Row selection: single or multiple, a checkbox column with a tri-state Select all (filtered rows, every row, or the page), click to select with Ctrl and Shift, and selectable rules; kept by row id.
- Cell ranges: drag, Shift+arrows, Ctrl+A, several ranges with Ctrl, whole columns from the header; Ctrl+C copies ranges, selected rows, or the focused cell as Excel-compatible text and an HTML table.
- Writes without mutating rows: paste (tiled over a range), cut, Delete, fill down and right (Ctrl+D, Ctrl+R), and a fill handle that continues number and date series (business days with a business calendar); `readOnlyEdits` turns writes into requests the application applies.
- Cell editing: text, large text, number, date, date-time (in the grid's time zone), select, checkbox, and custom editors; validation that blocks (or reverts) with an announced message; bulk edit of a range with Ctrl+Enter; undo and redo of every write; full-row editing with cross-field validation; batch editing with pending values; searchable list editors (one value or several, values loaded per query) in a separate entry point.
- Row grouping: several levels, a generated group column with counts, aggregates (sum, min, max, count, avg, first, last, or custom) in group rows, group and grand totals, keyboard expansion as a treegrid; a group panel; date hierarchies (year, quarter, month, week, day); aggregates shown as percentages; group checkboxes that select a group's rows; one group column or one per level.

Tree data, master/detail, pivot mode, and server row models are added in the next steps and phases of the Data Grid plan.

## 2. Anatomy

```text
<div class="aui-data-grid">                                 (consumer host, needs a height)
  <div class="aui-data-grid__toolbar">                     toolbar row (created when used)
    group panel / pivot panel (role group)                  (groupPanel, pivotPanel)
    <div role="search"> Search <input type="search">        (searchBox)
    advanced filter bar (combobox, listbox)                 (advancedFilter)
    accessory slots: toolbar(), find(), formulaBar()        (accessories)
  <div class="aui-data-grid__main">
    <div class="aui-data-grid__side aui-data-grid__side--start">  side bar (sideBar({ position: 'start' }))
    <div class="aui-data-grid__viewport">                 one scroll container
      <div role="grid" | role="treegrid" aria-rowcount aria-colcount>
        <div role="rowgroup" class="aui-data-grid__head">     sticky header rows, floating filter row
        <div role="rowgroup" class="aui-data-grid__pinned--top">  rows pinned to the top
        <div class="aui-data-grid__sticky">                 sticky group rows (copies, hidden from assistive technology)
        <div role="rowgroup" class="aui-data-grid__body">     virtualized rows (group, total, detail, full-width, loading rows)
        <div role="rowgroup" class="aui-data-grid__pinned--bottom">  rows pinned to the bottom
    <div class="aui-data-grid__side aui-data-grid__side--end">    side bar (default position)
  <div class="aui-data-grid__status-bar" role="group">       status bar (statusBar())
  <div class="aui-data-grid__pager">                        Pagination (pageSize)
  <div class="aui-data-grid__overlay">                      loading; file drop overlay while files are dragged over
</div>
<section class="aui-data-grid-chart" role="region">        chart panel after the host (chartRange, chartPivot)
top layer and body: filter panel, menus, tooltips, the note, chooser, and builder dialogs, formula suggestions, the print table
```

## 3. When to use

- Large or wide data sets that users explore cell by cell with the keyboard.
- Many columns that need pinning, groups, resizing, and reordering.
- Hundreds of thousands to millions of rows in the browser.

## 4. When not to use

- Read-mostly tables where every control is reached with Tab: use [Data Table](data-table.md) (plain table semantics, filtering, selection, editing, grouping today).
- Page layout of non-tabular content: use Layout.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the grid. |
| `element` | `HTMLDivElement` | The element with `role="grid"`. |
| `rowCount` | `number` | Rows displayed (the current page when paging). |
| `sort` | `DataGridSort[]` | Current sort by priority (a copy). |
| `focusedCell` | `DataGridCellPosition \| null` | The cell or header holding the tab stop. |
| `filteredRowCount` | `number` | Rows that pass the filters (before paging). |
| `editingCell` | `{ rowId, column } \| null` | The cell being edited. |
| `canUndo` / `canRedo` | `boolean` | Undo and redo steps are available. |
| `isBatchEditing` | `boolean` | A batch is collecting pending values. |

Options: `label` (required), `columns` (required), `rows` (required), `rowId` (required), `description`, `rowHeight`, `autoRowHeight`, `layout`, `sort`, `pageSize`, `pageSizes`, `page`, `flashChanges`, `flashDuration`, `rowClassRules`, `filters`, `quickFilter`, `externalFilter`, `floatingFilters`, `searchBox`, `advancedFilter`, `advancedFilterModel`, `rowSelection` (`{ mode: 'single' | 'multiple', checkboxes, headerCheckbox, selectAll: 'filtered' | 'all' | 'page', clickToSelect, selectable }`), `selected`, `cellSelection` (`true` or `{ multiple, columnSelection, fillHandle }`), `copyHeaders`, `readOnlyEdits`, `clickToEdit`, `enterMovesDown`, `invalidEdit` (`'block'` default, `'revert'`), `undoLimit` (default 20), `editMode` (`'cell'` default, `'row'`), `validateRow(values, row)`, `groupBy`, `groupDefaultExpanded` (0 default; -1 all), `groupTotals` (`'bottom'`), `grandTotal` (`'top'` / `'bottom'` / `'pinnedTop'` / `'pinnedBottom'`), `groupDisplay` (`'column'` default, `'columns'`: one per level, `'rows'`: full-width group rows), `stickyGroupRows` (default true), `fullWidthRow` (`{ isFullWidth(row), render(row, { doc, rowId }) }`), `groupColumn` (`{ header, width }`), `hideGroupedColumns` (default true), `expanded`, `groupPanel`, `aggregateFilteredOnly` (default true), `treeData` (`{ getPath }`, `{ parentIdField }`, or `{ childrenField }`, with `label`), `treeFilter` (`'ancestors'` default, `'subtree'`), `accessories` (from `@absoluteui/components/data-grid/accessories`), `headerNames`, `formulas` (`formulaEngine()` from `data-grid/formulas`), `fileDrop` (`{ onFiles, accept, label }`), `rowDragging` (`true` or `{ managed, multiRow, canDrag, nativeData }`), `rowNumbers` (`true` or `{ width, resizable }`), `pinnedTopRows`, `pinnedBottomRows`, `pinned` (row ids to `'top'` / `'bottom'`), `datasource` (`{ getRows(request, signal) }`), `blockSize` (default 100), `maxBlocks`, `blockLoadDelay` (default 50 ms), `maxConcurrentLoads` (default 2), `initialRowCount`, `getChildCount(row)`, `purgeClosedGroups`, `pivot` (`{ rows, columns, values: [{ column, aggregate }] }`), `pivotPanel`, `pivotMaxColumns` (default 1000), `detail` (`{ render(row, { doc, rowId }), height (300 default, or 'auto'), isMaster(row), keep (10 default), expandedByDefault, destroy(node, row) }`), `loading`, `emptyMessage`, `icons`, and the globally configurable options below. Full table: `metadata/data-grid/api.json`.

Columns: `id`, `header`, `accessor` (or `field`), `type` (`text`, `number`, `currency`, `date`, `datetime`, `boolean`), `currency`, `format`, `render`, `align`, `width`, `minWidth` (default 48), `maxWidth`, `flex`, `resizable`, `movable`, `pinned` (`'start'` / `'end'`), `lockPinned`, `lockPosition`, `hidden`, `sortable`, `compare`, `headerTooltip`, `wrapHeader`, `wrapText`, `rowDrag` (the column holding the row drag handle; default the first data column), `tooltip` (`true`, a text, or `(value, row) => text`), `spanRows` (`true` or `(a, b) => boolean`), `colSpan(row)`, `cellClass`, `cellClassRules`, `flashOnChange`, `copyValue`, `exportable`, `formula` (a calculated column), `formulas` (cell formulas), `excel` (`style`, `cellStyle(row)`, `numberFormat`, `formula(row, ref)`, `link(row)`, `image(row)`, `width`), `aggregate` (`'sum' | 'min' | 'max' | 'count' | 'avg' | 'first' | 'last'` or a function of the group's values), `showAs` (`'percentOfGrandTotal'` / `'percentOfParent'`), `groupable`, `groupHierarchy` (`['year' | 'quarter' | 'month' | 'week' | 'day', ...]` for date and date-time columns), `editable` (boolean or a function of the row), `setValue(row, value) => Row`, `parseValue(text, row)`, `editor` (`{ kind: 'text' | 'largeText' | 'number' | 'date' | 'datetime' | 'select' | 'checkbox', maxLength, rows, min, max, step, options }` or `{ create(context) }`), `required`, `validate(value, row)`, `filter` (`'text'`, `'number'`, `'bigint'`, `'date'`, `'boolean'`, `'set'`), `filterValue`, `filterCaseSensitive`, `filterAccentSensitive`, `filterValues`, `businessCalendar`, `searchable`, and `visibleWhen` (`'expanded'` / `'collapsed'`, inside a collapsible group). Column groups: `id`, `header`, `children`, `collapsible`, `collapsed`, `headerTooltip`. Ids are unique among columns and groups.

| Global option | Type | Default |
|---|---|---|
| `multiSort` | `boolean` | `true` |
| `sortCycle` | `'tri-state' \| 'bi-state'` | `'tri-state'` |
| `overscan` | integer 0-200 | `8` |
| `transactionDelay` | integer 0-10000 (ms) | `50` |
| `animateRows` | `boolean` | `true` |
| `filterDelay` | integer 0-10000 (ms) | `250` |
| `maxFilterConditions` | integer 1-10 | `2` |
| `locale` (inherited) | BCP 47 | `'en-US'` |
| `timezone` (inherited) | IANA | `'UTC'` |
| `density` (inherited) | `'compact' \| 'comfortable' \| 'spacious'` | `'comfortable'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `DataGrid.create(host, options)` | Render into an empty host. Validates options before touching the DOM. |
| `update(options)` | Merge and apply options. |
| `setRows(rows)` | Replace the rows; sort, focus, and scroll position are kept, and only rows whose object changed re-render. |
| `applyTransaction(tx)` | Add, update (by id), and remove (by id) rows; returns `{ added, updated, removed, missing }`. |
| `applyTransactionAsync(tx)` / `flushTransactions()` | Queue transactions applied together every `transactionDelay` ms (high-frequency feeds); apply the queue now. |
| `getState()` / `setState(state)` | Serializable view state (sort, columns, page, page size, filters, quick filter). `setState` validates untrusted input and emits nothing. |
| `getFilters()` / `setFilter(column, filter)` | Active column filters (copies); set or clear (`null`) one column's filter (validated, emits nothing). |
| `getAdvancedFilter()` / `setAdvancedFilter(filter)` | The advanced filter model (a copy); set or clear it (validated; conditions on unknown columns are dropped; emits nothing). |
| `getSelected()` / `getSelectedRows()` | Selected row ids / rows, in source order. |
| `setSelected(ids)` / `selectAll(scope?)` / `clearSelection()` | Change the selection (validated; unknown and unselectable ids are dropped; emits nothing). |
| `getCellRanges()` / `addCellRange(range)` / `clearCellRanges()` | Read, add (ids of displayed rows and visible columns; validated), or clear cell ranges; emits nothing. |
| `startEditing(rowId, column)` / `stopEditing(cancel?)` | Open an editor on a displayed, editable cell; commit (an invalid value is discarded) or cancel it. |
| `startBatch()` / `commitBatch()` / `cancelBatch()` | Collect writes as pending values; apply them as one transaction and one undo step; or discard them. |
| `expandAll()` / `collapseAll()` / `setExpanded(groupId, expanded)` | Expand or collapse group rows (emits nothing). |
| `getGroups()` | The current groups: id, column, key, count, aggregates, and children. |
| `toCsv(options)` / `toCsvBlob(options)` | RFC 4180 CSV with formula-injection protection: `columns` (`visible`, `all`, ids), `rows` (`filtered` across pages with group rows and totals, every group expanded; `page`; `selected` and `all`, ignoring filters; `range`), `groups` (`rows`, `none`), `header`, `columnGroups`, `pinned`, `values` (`formatted`, `raw`), `indent`, `delimiter`, `lineEnding`, `bom`, `escapeFormulas`, `value(cell)`. Save with `downloadCsv` from the Data Table entry. |
| `cellAddress(rowId, column)` / `cellFormula(rowId, column)` | A cell's stable A1 address for formulas, and its formula (null for plain values). |
| `getExportData(options)` | Rows and columns of an export (the `toCsv` choices plus `text: 'needed'`): raw values, display text, group levels, column group header runs, expansion state. Used by `toXlsx`. |
| `print(options)` | Print the rows as a static table (only in print media): the `toCsv` row and column choices and a `title` (the caption, default the grid label); headers repeat on every page; removed after printing. More than 20,000 rows throws `DATA_GRID_PRINT`. |
| `alignWith(other)` | Keep another grid's columns (order, widths, pinning, visibility, collapsed groups) and horizontal scroll in step, both ways (a totals grid under the main grid). Returns a function ending it. |
| `addRowDropZone(zone)` | Let dragged rows drop on an element outside the grid: `{ element, label, onDrop, onDragEnter?, onDragMove?, onDragLeave? }`, called with `{ rowIds, rows, x, y, grid }`; the cell menu's Send to lists zones (the keyboard path; `x` and `y` null). Returns a remover. |
| `rowDropZone({ label?, move? })` | A zone for another grid: dropped rows are added here (at the drop line when rows are in source order, else at the end; ids already present are skipped); `move` removes them from the source. |
| `moveRow(id, parentId, index)` | Tree data with `parentIdField`: move a row under another parent (null: a root) at a position among its new siblings; a shallow copy, never a mutation; false for moves into its own subtree. |
| `setColumnHeader(id, header)` / `resetColumns()` | Rename a column or column group (null restores it); undo the user's column changes (order, widths, pinning, visibility, collapsed groups, names). |
| `pinRow(rowId, side)` / `getPinnedRows()` | Pin a row to the top or bottom (null unpins; false for unknown ids); the rows pinned by id. |
| `setRowHeight(rowId, height)` | Set a row's height in px (16 to 2000), or null for its default height. |
| `applyServerTransaction(tx)` | Server rows: apply changes the server already holds to the loaded rows (add at `addIndex`, update, remove; later rows shift; `rowCount` corrects the total). |
| `getServerSelection()` / `setServerSelection(state)` | Server rows: the selection as `{ selectAll, toggled }` (with `selectAll`, `toggled` lists the rows not selected). |
| `refresh({ purge, route })` / `retryLoads()` | Server rows: reload the loaded blocks (purge drops them first; `route`: one group's rows, by its keys); load failed blocks again. |
| `setRowCount(count, known)` / `isRowCountKnown()` | Server rows: set the row count; whether the total is known. |
| `getPivot()` / `setPivot(pivot)` | Pivot mode: the pivot, or set it (null leaves pivot mode; emits nothing). |
| `getPivotTruncation()` | Pivot mode: `{ shown, total }` result columns when `pivotMaxColumns` left some out, else null. |
| `setDetailExpanded(rowId, expanded)` / `isDetailExpanded(rowId)` | Master/detail: expand or collapse a master row's details (emits nothing); false for rows without details. |
| `getTreeOrphans()` | Tree data: rows whose parent is missing or would form a cycle (shown as roots). |
| `undo()` / `redo()` | Undo or redo the last applied write (edit, bulk edit, paste, cut, Delete, fill). |
| `copySelection()` | Copy the ranges, else the selected rows, else the focused cell with the asynchronous Clipboard API; resolves to the tab-separated text. |
| `setQuickFilter(text)` / `refreshFilters()` | Set the quick filter (emits nothing); re-run the filters after the external filter's inputs changed. |
| `getColumnsState()` | Column order, widths, pinning, hidden columns, collapsed groups. |
| `moveColumn(id, target, position?)` | Move a column or group next to a sibling with the same parent group. |
| `setColumnPinned(id, pinned)` / `setColumnHidden(id, hidden)` | Pin or unpin; hide or show (one column always stays visible). |
| `autoSizeColumns(ids?)` / `fitColumns()` | Size to content; scale to the viewport width. |
| `focusCell(rowId, column)` / `scrollToRow(rowId)` / `scrollToColumn(column)` | Move focus or scroll, rendering the target first. |
| `destroy()` | Remove the grid, listeners, and released nodes. |

## 7. Events

| Event | Detail | Bubbles | When |
|---|---|---|---|
| `aui-sort-change` | `{ sort }` | Yes | The user changed the sort. |
| `aui-columns-change` | `{ reason, columns }` | Yes | Resize, move, pin, visibility, group toggle, auto-size, or fit. |
| `aui-rows-change` | `{ added, updated, removed, missing }` | Yes | A transaction changed the rows. |
| `aui-page-change` | `{ page, pageSize }` | Yes | The user changed the page or page size. |
| `aui-cells-change` | `{ changes, source, applied, rejected }` | Yes | Paste, cut, Delete, or fill wrote cells (one transaction; `applied: false` with `readOnlyEdits`); `rejected` lists pasted text a column could not convert. |
| `aui-row-group-toggle` | `{ groupId, expanded }` | Yes | The user expanded or collapsed a group row. |
| `aui-group-change` | `{ groupBy }` | Yes | The user changed the row groups in the group panel. |
| `aui-row-pin` | `{ rowId, pinned }` | Yes | The user pinned or unpinned a row. |
| `aui-row-drag-start` | `{ rowIds }` | Yes | The user started dragging rows with a drag handle. |
| `aui-row-drop` | `{ rowIds, targetId, position, source }` | Yes | Rows dropped `before`, `after`, or (tree data) `inside` a row, by `pointer` or `keyboard`; cancelable. Managed grids then move the rows. |
| `aui-row-resize` | `{ rowId, height }` | Yes | The user resized a row with its row number handle. |
| `aui-pivot-change` | `{ pivot }` | Yes | The user changed the pivot in the pivot panel. |
| `aui-detail-toggle` | `{ rowId, expanded }` | Yes | The user expanded or collapsed a master row's details. |
| `aui-range-change` | `{ ranges, finished }` | Yes | The user changed the cell ranges (`finished: false` while a drag extends one). |
| `aui-selection-change` | `{ selected, added, removed, reason }` | Yes | The user changed the selection (`user`, `select-all`), or selected rows were removed (`rows`). |
| `aui-filter-change` | `{ filters, quickFilter, advancedFilter }` | Yes | The user changed a filter (panel, floating filter, expression bar, builder) or the search box; the row count is announced. |
| `aui-cell-focus` | `{ rowId, column }` | Yes | Focus moved to another cell or header (`rowId: null`). |
| `aui-cell-activate` | `{ rowId, column, row }` | Yes | Enter on a cell without widgets, or a double click. |

## 8. Slots/content areas

None. Cell content comes from `render(row, { doc, column, rowId })`: text, or a Node the grid releases with `releaseNode()` when the cell leaves the rendered window.

## 9. CSS parts/hooks

See the anatomy. Modifiers: `aui-data-grid--compact`, `--spacious`, `--auto`, `--animating` (rows gliding after a sort or update); `aui-data-grid__cell--changed` (a highlighted change); cells `aui-data-grid__cell--end`, `--center`, `--wrap`, `--pinned-start`, `--pinned-end`. Header drag: `aui-data-grid__header-cell--dragging` and `aui-data-grid__drop-indicator`. Filtering: `aui-data-grid__header-cell--filtered`, `aui-data-grid__filter-button` (`--active`), `aui-data-grid__filter-panel` (`__filter-title`, `__filter-condition`, `__filter-join`, `__filter-set`, `__filter-values`, `__filter-clear`), `aui-data-grid__floating-row`, `__floating-cell`, `__floating-control`, `aui-data-grid__toolbar`, `__search-input`. Menus: `aui-data-grid__header-button`, `__column-menu-button`, `__header-input` (the popup is a Context Menu: load the Menu and Context Menu styles). Find: `aui-data-grid__find`, `__find-input`, `__find-count`, `__find-button`, `__cell--find`, `__cell--find-active`. Notes: `aui-data-grid__cell--note` (the corner mark), `__note-text`, `__note-meta`. Tooltips: `aui-data-grid__tooltip` (load the Tooltip styles). Side bar: `aui-data-grid__main` (the rows and the side slots), `__side` (`--start`, `--end`), `__side-tabs`, `__side-tab`, `__side-panel` (width `--aui-data-grid-side-width`), `__side-heading`, `__filter-section`, `__filter-section-toggle`, `__filter-section-body`, `__filter-panel--inline`, `__chooser-group`. Status bar: `aui-data-grid__status-bar`, `__status-panel` (`data-panel`). Toolbar: `aui-data-grid__toolbar-slot`, `__toolbar-items`, `__toolbar-button`, `__toolbar-separator`. Column chooser (a Dialog: load the Dialog and Button styles): `aui-data-grid__chooser`, `__chooser-search`, `__chooser-all`, `__chooser-list`, `__chooser-item`, `__chooser-move`. Formulas: `aui-data-grid__cell--formula-error`, `__formula-editor`, `__formula-input`, `__formula-hint` (`--problem`), `__formula-list` (on `body`), `__formula-option`, `__formula-bar`, `__formula-address`, `__formula-text`. File drop: `aui-data-grid__file-drop` (the overlay). Print: `aui-data-grid-print` (a child of `body` while printing), `__table`, `__row--group`, `__row--total`, `__cell--end`. Row dragging: `aui-data-grid__drag-handle` (`--disabled` when `canDrag` refuses), `__drag-ghost`, `__drop-line`, `__row--drop-inside`, `aui-data-grid--dragging`; on a drop zone's element while rows are over it: `aui-data-grid-drop-zone--active` (styled by the app). Row numbers: `aui-data-grid__row-number`, `__row-resizer`. Pinned rows: `aui-data-grid__pinned` (`--top`, `--bottom`), `__row--pinned`. Full-width rows: `aui-data-grid__row--full`, `__full-cell`. Sticky group rows: `aui-data-grid__sticky`, `__row--sticky`. Server rows: `aui-data-grid__row--loading`, `__skeleton`, `__cell--failed`, `__retry`. Pivot panel: `aui-data-grid__pivot-panel` (with the group panel classes), `__pivot-zone`, `__pivot-aggregate`. Master/detail: `aui-data-grid__detail-toggle`, `__row--detail`, `__detail-cell`, `__detail-content`. Group panel: `aui-data-grid__group-panel` (`--drop` while a header or pill is over it), `__group-pill` (`--dragging`, `--drop-before`, `--drop-after`; `__pivot-zone--drop` on an empty pivot zone; `__drag-ghost--remove` when a drop would remove the pill), `__group-pill-button`, `__group-add`. Grouping: `aui-data-grid__row--group`, `aui-data-grid__row--total`, `aui-data-grid__group-cell` (indented by `--aui-data-grid-group-level`), `aui-data-grid__group-toggle`. Editing: `aui-data-grid__row--editing` (row mode), `aui-data-grid__cell--pending` (batch), `aui-data-grid__cell--editing`, `aui-data-grid__editor` (`--popup` for large text), `aui-data-grid__editor-control`, `aui-data-grid__edit-error`. Fill: `aui-data-grid__fill-handle`, `aui-data-grid__cell--fill` (cells a fill drag would cover). Cell ranges: `aui-data-grid__cell--range` with `--range-top`, `--range-bottom`, `--range-start`, `--range-end` on the edges. Row selection: `aui-data-grid__row--selected`, `__select-input`, `__select-all`, `__select-header`. Advanced filter: `aui-data-grid__advanced`, `__advanced-input`, `__advanced-list`, `__advanced-option`, `__advanced-error`; builder: `aui-data-grid__builder-dialog`, `__builder-group`, `__builder-condition`, `__builder-tools`, `__builder-button`.

## 10. Design tokens

See `metadata/data-grid/tokens.json` (verified in CI).

Component tokens (unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-data-grid-radius` (corner radius; falls back to `radius-md`), `--aui-data-grid-bg` (background; falls back to `color-surface`), `--aui-data-grid-border-color` (boundary; falls back to `color-border`), `--aui-data-grid-header-bg` (header background; falls back to `color-surface-sunken`), `--aui-data-grid-row-border-color` (row separators; falls back to `color-border`), `--aui-data-grid-panel-shadow` (filter panel elevation; falls back to `shadow-md`).

## 11. States

default, empty, no matching rows, loading, cell focused, header focused, sorted, multi-sorted, filtered, filter panel open, advanced filter error, builder open, rows selected, cell ranges, editing, edit invalid, row editing, batch pending, grouped, group expanded, column resizing, column dragging, group collapsed, paged, tree expanded, details expanded, pivoting, rows loading (server), block failed, rows pinned, row dragging, drop target, menu open, side bar open, find matches, note dialog open, formula error, formula editing, chart panel open, printing.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| unsorted | header click or Enter | ascending, then descending, then unsorted (tri-state) |
| sorted | Shift+click or Shift+Enter on another header | multi-sorted (added with the next priority) |
| expanded group | Enter or click on a collapsible group header | collapsed (children with `visibleWhen` switch) |
| any page | Pagination | another page (`aui-page-change`), scrolled to the top |
| unfiltered | a value typed in the panel, a floating filter, or the search box (after `filterDelay`; Enter at once), or a choice made | filtered (`aui-filter-change`, row count announced), first page, scrolled to the top |
| filtered | Clear filter, an emptied value, or all set values selected | unfiltered |
| panel closed | filter button, Alt+ArrowDown on a header or floating cell, Enter on a read-only floating summary | panel open (focus on its first control) |
| panel open | Escape | closed, focus back on the header (or the floating control that opened it) |
| panel open | focus or pointer outside the panel | closed, pending typed value applied |
| row not selected | checkbox, Space, or (clickToSelect) click | selected (`aui-selection-change`, count announced); single mode deselects the previous row |
| rows selected | Shift+checkbox, Shift+Space, or Shift+click | the range from the last toggled row is added |
| any | header checkbox, Space on the selection header, or Ctrl+A | every selectable row in the Select all scope selected (or cleared) |
| no range | press and drag over cells, Shift+arrows, or Ctrl+A (cell selection) | a cell range (`aui-range-change`; size announced) |
| ranges | Ctrl+drag / Shift+click / a plain arrow key | another range added / the active range extended / ranges cleared |
| any | Ctrl+C on a cell | ranges (stacked), else selected rows, else the focused cell copied; announced |
| editable cell | Enter, F2, a printable key (replaces the value), Backspace (empty), double-click, or (clickToEdit) a click | editing |
| editing | Enter / Tab, Shift+Tab / Escape / focus leaving | committed (focus back on the cell; `enterMovesDown` moves down) / committed and the next or previous editable cell edited / cancelled / committed |
| editing | an invalid value committed | blocked: message under the cell, `aria-invalid`, announced (`invalidEdit: 'revert'` discards instead; focus leaving discards) |
| group collapsed | ArrowRight, Enter, a double-click, or a click on its toggle | expanded (`aui-row-group-toggle`; "Eng expanded, 3 rows") |
| group expanded | ArrowLeft, Enter, a double-click, or a click on its toggle | collapsed |
| details collapsed | Enter or ArrowRight in the Details column, or a click on the toggle | expanded (`aui-detail-toggle`; "Details of Acme expanded") |
| details expanded | Enter or ArrowLeft in the Details column, or a click on the toggle | collapsed |
| row groups | the group panel's picker, its pill buttons, or dropping a groupable header on it | regrouped (`aui-group-change`; "Grouped by Department, City") |
| editing with ranges | Ctrl+Enter | the value written to every editable cell of the ranges (bulk edit) |
| row mode | any start key on a row's cell | editors in every editable cell of the row; Tab and Shift+Tab move between them (past the last or first, the row commits and the next or previous row edits); Enter commits the row (one write) after `validateRow` |
| batch | `startBatch()`, then writes | pending values shown (marked and spoken "edited"); `commitBatch()` applies them (one write, one undo step); `cancelBatch()` discards them |
| any | Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z | the last write undone / redone (cells focused and selected) |
| cells | Ctrl+V / Ctrl+X / Delete / Ctrl+D / Ctrl+R / fill handle | editable cells written as new row objects in one transaction (`aui-cells-change`; count announced); with `readOnlyEdits` only requested |
| expression edited | Enter or Apply with a valid expression | advanced filter applied (`aui-filter-change`) |
| expression edited | Enter or Apply with a syntax error | error shown with its position, the offending text selected, announced; nothing applied |
| builder closed | Builder | builder open (modal), focus on the root group's combine choice |
| builder open | Apply / Cancel or Escape | applied / discarded; focus back on Builder |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Arrow keys | Cell or header | Move one cell; Up from the first row enters the headers (the floating filter row first); Down from the headers enters the rows. |
| Home / End | Cell | First / last cell of the row. |
| Ctrl+Home / Ctrl+End | Cell | First cell of the grid / last cell of the grid. |
| PageUp / PageDown | Cell | Move a page of rows. |
| Enter / F2 | Cell with widgets | Move into the first widget; Escape or F2 returns to the cell. |
| Enter | Cell without widgets | `aui-cell-activate`. |
| Space / Shift+Space | Cell (row selection) | Toggle the row / select the range from the last toggled row. |
| Ctrl+A | Cell | Select every cell (cell selection), else all rows in scope (multiple row selection). |
| Shift+arrows, Shift+Home/End, Shift+PageUp/PageDown | Cell (cell selection) | Extend the range from the focused cell; Ctrl+Shift+arrows to the edge. |
| Enter / Ctrl+Enter / Shift+Enter | Leaf header (column selection) | Select the column / add it / extend to it; Alt+Enter sorts. |
| Ctrl+C / Ctrl+X / Ctrl+V | Cell | Copy / cut / paste (the active range, or the focused cell). |
| Delete | Cell | Clear the ranges (or the focused cell). |
| Enter, F2, a printable key, Backspace | Editable cell | Start editing (a key replaces the value; Backspace starts empty; F2 and Enter select the value). |
| Enter / Tab / Shift+Tab / Escape | Editor | Commit / commit and edit the next / previous editable cell / cancel. Arrow keys stay in the editor. |
| Ctrl+Enter | Editor (with ranges) | Write the value to every editable cell of the ranges. Large text: Enter adds a line; Tab or Ctrl+Enter commits. |
| ArrowUp / ArrowDown | Number editor | Step by `step` (within `min` and `max`). |
| Ctrl+Z / Ctrl+Y, Ctrl+Shift+Z | Cell | Undo / redo. |
| Ctrl+Shift+ArrowUp / ArrowDown | Drag handle cell (`rowDragging`) | Move the row (the selected rows with `multiRow`) above or below its neighbour; in other cells the keys extend the range. |
| Ctrl+Shift+ArrowRight / ArrowLeft | Drag handle cell, parent-id tree data | Indent (last child of the row above) / outdent (after its parent); mirrored in RTL. |
| ArrowRight / ArrowLeft / Enter | Group row | Expand / collapse / toggle. |
| ArrowLeft | Row inside a group, in the group column (or before it) | Move to its group row. |
| Ctrl+D / Ctrl+R | Cell (cell selection) | Fill each range down from its first row / right from its first column (the keyboard alternative to the fill handle). |
| Space or Enter | Selection column header | Select or clear all rows in scope. |
| Enter / Space (Shift adds) | Sortable header | Sort (Shift: multi-sort). |
| F2 | Header | Move to the header's filter button; Escape or F2 returns to the header. |
| Alt+ArrowDown | Filterable header or floating filter cell | Open the filter panel. |
| Escape | Filter panel | Close it; focus returns to the header. |
| Enter / F2 | Floating filter cell | Move into its control; Escape returns to the cell. |
| Enter | Floating filter input | Apply now (a read-only summary opens the panel). |
| ArrowDown / ArrowUp | Expression field | Open the suggestions; move the active suggestion. |
| Enter | Expression field | Insert the active suggestion, else apply the expression. |
| Escape | Expression field | Close the suggestions. |
| Enter / Space | Collapsible group header | Expand or collapse. |
| Shift+ArrowLeft / Right | Header | Move the column or group. |
| Alt+ArrowLeft / Right | Header | Resize by 10 px (Shift+Alt: 50 px). |
| Enter, ArrowRight / ArrowLeft | Details cell of a master row | Toggle / expand / collapse its details; arrow keys enter a detail row as one cell, Enter or F2 moves into its content. |
| Alt+ArrowUp / Alt+ArrowDown | Row number (`rowNumbers: { resizable: true }`) | Make the row 4 px shorter / taller (announced). |
| Shift+F10 / ContextMenu | Header / cell (`columnMenu()`, `contextMenu()`) | Open the column menu / the cell menu; arrow keys, Enter, and Escape inside it (Menu pattern). |
| F3 / Shift+F3 | Grid (`find()`) | Next / previous match; `findShortcut: true` makes Ctrl+F move to the find field. |
| Shift+F2 | Cell (`notes()`) | Open the cell's note dialog. |
| ArrowLeft / ArrowRight, Home / End | Toolbar (`toolbar()`) | Move between its buttons (one tab stop). |
| ArrowDown / ArrowUp, Enter or Tab, Escape | Formula editor with suggestions open | Move the active suggestion, accept it, close the list (a second Escape cancels the edit). |
| Escape | Chart panel (`chartRange`, `chartPivot`) | Close the panel; focus returns to the grid. |
| Tab / Shift+Tab | Any | Leave the grid. |

## 14. ARIA contract

- `role="grid"` named by `label`, described by `description`; `aria-rowcount` and `aria-colcount` give the full size and every rendered row and cell has `aria-rowindex` / `aria-colindex`.
- Header cells are `columnheader`s: groups have `aria-colspan` (and `aria-expanded` when collapsible); leaves that span header rows have `aria-rowspan`; the primary sorted column has `aria-sort`.
- `aria-busy` while loading. Spacers, fillers, and handles are `aria-hidden`.
- A filterable header holds a filter button (`aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` while open, named "Filter Name"). The header is named through `aria-labelledby` by its text, sort priority, and ", filtered" when filtered, so the button's name is not part of it.
- The filter panel is a non-modal `dialog` named "Name filter", with native labelled controls: operator `select`s (date operators in groups), value inputs ("Condition 1 value"), AND/OR radios in a `fieldset`, a set filter's search box, native tri-state Select all (`indeterminate`), and a `group` of value checkboxes.
- The floating filter row is a `row` of `gridcell`s counted in `aria-rowcount` and the row indexes; its controls are named "Name filter"; invalid number syntax sets `aria-invalid`.
- The search box sits in a `search` landmark named "Search {label}" with a visible label.
- Menus (`columnMenu()`, `contextMenu()` from `@absoluteui/components/data-grid/accessories`) follow the menu pattern: a header's menu button (named "Column menu, Dept"; F2 or Enter reaches it inside the header), a right-click, Shift+F10, or the ContextMenu key on a header opens its column menu; on a cell they open the cell menu; focus moves to the first item and returns when the menu closes. The header keeps one composed name, never the button's. Renaming edits the header in place in a field named "Column name" (Enter renames and announces it, Escape cancels). The column chooser is a modal dialog named "Choose columns": a search field, a "Show all columns" checkbox (mixed when some are hidden), and per column a checkbox named by its header and buttons named "Move Name up" / "Move Name down" (24 by 24 px at least); focus stays on the control used, and Done returns focus to the grid.
- Tooltips (`tooltips()`) meet WCAG 1.4.13: shown after a delay on hover and at once on keyboard focus of a cell, they stay while the cell or the tooltip is hovered, and Escape dismisses them without moving focus; the cell is described by the tooltip while it shows; never on touch. Find (`find()`) is a `search` landmark with a field named "Find in grid" and buttons "Previous match" and "Next match"; Enter and Shift+Enter in the field, and F3 and Shift+F3 in the grid, move between matches; the current match is announced ("Match 2 of 15") and described as "current match", and focus stays where it is. Ctrl+F stays the browser's unless `find({ shortcut: true })`. Notes (`notes()`): a cell with a note has a corner mark and says "has a note"; Shift+F2 on a cell, the cell menu's Add note / Edit note, or a click on the mark opens a dialog named "Note" (described by the column and row) with a field named "Note" and Save, Delete note, and Cancel (read-only notes: Close); results are announced.
- The side bar's buttons are disclosures (`aria-expanded`, `aria-controls`) for `region`s named "Columns" and "Filters"; one panel is open at a time and opening one moves focus into it. In Columns, Group toggles are buttons named "Group by Department" with `aria-pressed`; in Filters, each filterable column is a disclosure (marked "Filtered" while it has a filter) whose filter editor is a `group` inline. Panels refresh after changes made elsewhere, never while focus is inside them.
- The status bar is a `group` named "Grid status" (not a live region: the grid announces counts where they change). The toolbar is a `toolbar` named "Grid actions" with one tab stop; ArrowLeft and ArrowRight (mirrored in right-to-left layouts), Home, and End move between its buttons, and a button with entries opens a menu.
- Spanning cells carry `aria-rowspan` / `aria-colspan`, and rows and columns they cover have no cell there; arrow keys moving within a span step past it, and moving into a span lands on its cell.
- Full-width rows and full-width group rows are rows with one `gridcell` spanning every column (`aria-colspan`); arrows enter that cell and leaving returns to the column focus came from; sideways keys stay on it. On a full-width group row ArrowRight, ArrowLeft, and Enter expand and collapse; ArrowLeft on a row of the group (first column) moves to it. Sticky group rows are copies hidden from assistive technology (the real rows stay in the grid); rows under them count as off screen when focus moves.
- Pinned rows are in `rowgroup`s named "Pinned to top" and "Pinned to bottom"; row indexes count them (top section first, bottom section last), and keyboard navigation moves from the header into the top section, through the body, and into the bottom section (Ctrl+Home and Ctrl+End reach the first and last pinned rows). Pinned copies of rows (`pinned`, `pinRow`) mirror the row's selection.
- File drop: the overlay is decorative (`aria-hidden`); dropping is pointer only, so offer a file input (for example Upload) with the same handler. Rejected files are announced ("The dropped files are not accepted here").
- Pill dragging (group and pivot panels): pointer only; the pill buttons (move earlier, move later, remove) and the pickers are the keyboard path, and every change is announced as before.
- Row dragging: the handle is decorative (`aria-hidden`); the keyboard path is Ctrl+Shift+arrows on the handle cell, and the cell menu offers Move row (Move up, Move down) and Send to (the drop zones by label, announced "Row sent to Archive"). Moves are announced ("Row moved to position 3", "Row moved under Ada", "2 rows moved"); while sorted, filtered, grouped, or pivoted a managed grid announces that rows cannot be moved. The ghost and drop line are hidden from assistive technology.
- Row numbers: a generated leading column (header named "Row number", hidden visually) shows each row's display position; with `resizable`, Alt+ArrowUp and Alt+ArrowDown on a number change the row's height by 4 px (announced "Row height 38 pixels"), the keyboard path for dragging its handle.
- Server rows: rows that are not loaded are rows with `aria-busy="true"` and a hidden "Loading" text in their first data cell (skeleton bars are decorative); the grid has `aria-busy` while blocks load and `aria-rowcount="-1"` while the total is unknown; the count is announced once known. A failed block shows "Rows could not load: <message>" with a Retry button (Enter on the cell reaches it), and the failure is announced once.
- The pivot panel is a `group` named "Pivot" with a `group` per zone ("Rows", "Columns", "Values"); pills have buttons named "Move City earlier in Rows", "Move City later in Rows", and "Remove City from Rows", a value pill has a select named "Aggregate of Salary", and each zone has a picker named "Add to Rows" (and so on). Changes are announced ("Pivot: rows Department; columns City; values Salary"). Pivot grids are a `treegrid`; rows of the last row field have no `aria-expanded`.
- Master/detail grids are a `treegrid`: rows carry `aria-level` and master rows `aria-expanded`; the generated Details column has a hidden header name and a decorative toggle. A detail row is a `row` with one `gridcell` spanning every column (`aria-colspan`). Arrow keys enter it as one cell (leaving returns to the column it was entered from); Enter or F2 moves into its content, Tab from a master row's last cell enters the content of its open details, Shift+Tab on the detail cell returns to that last cell, and Escape inside the content returns to the detail cell (unless the content handled it). A nested Data Grid in the content keeps its own keyboard, tab stop, clicks, clipboard, and ranges; its events bubble through the host (check `event.target`).
- The group panel is a `group` named "Row groups"; each pill has buttons named "Move Department earlier", "Move Department later", and "Remove Department from the row groups" (24 by 24 px at least), and the picker is named "Add a row group": every drag has a keyboard path. Focus stays on the moved pill's button.
- With multiple row selection, a group row has a tri-state checkbox named "Select Eng" that selects or clears the group's selectable rows (the rows that pass the filters); Space on a group row does the same. Group and total rows themselves are never selected and have no `aria-selected`.
- Grouped grids are a `treegrid`: rows carry `aria-level`, and group rows `aria-expanded`, `aria-setsize`, and `aria-posinset`; the group cell reads "Eng (3)"; the expansion toggle is decorative (the row's state is spoken), and expansion is announced with the row count.
- Row selection: `aria-multiselectable="true"` on the grid in multiple mode and `aria-selected` on every rendered row; row checkboxes are named "Select {first column text}" and the header checkbox "Select all rows" (native tri-state: `indeterminate` is exposed as mixed); the selection column header is named "Row selection". The count is announced politely after user changes ("3 rows selected").
- Cell ranges: `aria-multiselectable="true"` on the grid and `aria-selected` on every rendered cell; focus stays on the anchor cell while Shift+arrows move the opposite corner; the size is announced ("2 by 3 cells selected", debounced) and so is a copy ("Copied 2 by 3 cells"). Ranges are tinted and outlined (outline in `Highlight` in forced colors). Dragging has keyboard equivalents (WCAG 2.5.7).
- Editors are native controls named "{column}, {row}" (the row's first column text) and described by the validation message, which shows under the cell, sets `aria-invalid`, and is announced assertively. Discarded edits are announced ("Edit discarded: Enter a number"). Undo and redo announce the cells they changed.
- Writes announce their result ("6 cells pasted. 1 value could not be used"); the fill handle is pointer-only (`aria-hidden`), with Ctrl+D and Ctrl+R as keyboard alternatives (WCAG 2.5.7). Focus stays on the focused cell when its row is replaced by a write or a transaction.
- The expression bar is a `group` ("Advanced filter") holding an editable `combobox` with a visible label ("Filter"), `aria-autocomplete="list"`, `aria-expanded`, `aria-controls` to a `listbox` of `option`s, and `aria-activedescendant` for the active suggestion (focus stays in the field). It is described by a syntax hint and, after a failed apply, by the error message (`aria-invalid="true"`).
- Formulas: a calculated or formula cell shows its result; an error cell shows the code and reads its meaning ("#DIV/0!, division by zero"). The formula editor is an editable `combobox` (`aria-autocomplete="list"`, `aria-expanded`, `aria-controls` to a `listbox` named "Suggestions", `aria-activedescendant`), described by the cell's validation message and by the function signature or syntax problem shown under it. The formula bar (`formulaBar()`) is a `group` named "Formula bar" with the cell address and formula.
- Sparkline cells hold an `img` named "{label}: {count} values, from {first} to {last}, minimum, maximum". The chart panel (`chartRange`, `chartPivot`) is a `region` named "Chart of {title}" with labelled selects (Chart type, Series) and a Close button; each chart offers its own data table.
- Print (`print()`) builds a `table` with a caption and `th` cells with `scope`, so printed output and Save as PDF keep the structure. Exported PDFs are not tagged; Excel and CSV keep the data in rows and columns.
- The builder is a modal `dialog` ("Filter builder"): groups are `fieldset`s with legends ("All rows", "Group 2"), each condition's controls are named after it ("Condition 2.1 column"), and every structural change has a button ("Move Condition 2 up", "Remove Group 3", "Add condition to All rows"); focus follows the moved, added, or next item.

## 15. Accessibility notes

- One tab stop with roving focus (WAI-ARIA APG Grid). Home/End follow the APG (row), and Tab leaves the grid.
- The focused row and column stay rendered while scrolled away, so virtualization never loses focus.
- Sort changes ("Sorted by Age, descending; City, ascending"), column moves ("Name moved to position 2 of 5"), resizes, group toggles, and loading are announced through the shared polite live region.
- Pinned columns are sticky cells in DOM order, so the reading order matches the visual order in both directions.
- Syntax errors are announced assertively with their position ("Unknown column \"Town\" at character 16") and the offending text is selected so it can be retyped at once.
- Filter results are announced politely ("2 rows"); typed values apply after `filterDelay` so each keystroke is not announced. Filter state is spoken with the header and shown by a dot on the filter button as well as its color (not color alone).
- Pointer resizing needs a drag; Alt+arrows and the state API are the alternatives (WCAG 2.5.7).
- Manual screen-reader verification is pending.

## 16. Responsive behavior

`layout: 'fill'` fills the host (give the host a height); `layout: 'auto'` grows with its rows up to the host's `max-block-size`. Flex columns share the viewport width and re-flow when it changes. The header stays on top and pinned columns stay at their edges while the grid scrolls in both axes.

## 17. RTL behavior

Logical properties: pinned start columns sit on the right in right-to-left layouts, arrow keys and resizing mirror, and the drop indicator follows the visual edge.

## 18. Theme behavior

Token-driven. In forced-colors mode, focus outlines and resize lines use `Highlight` and borders use `CanvasText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { dataGrid: { multiSort: false, overscan: 12 } } });
```

## 20. Component configuration support

Instance options override global and theme defaults. All configurable options are dynamic.

## 21. Timezone behavior

`datetime` columns are formatted in the configured IANA time zone (`timezone`), never the machine's zone.

## 22. Icon customization points

`icons.sortAscending` (`arrow-up`), `icons.sortDescending` (`arrow-down`), `icons.sortNone` (`arrow-up-down`), `icons.expand` (`chevron-right`, mirrored in RTL), `icons.collapse` (`chevron-down`), `icons.loading` (`spinner`), `icons.filter` (`filter`), `icons.drag` (`grip`, the row drag handle).

## 23. Security behavior

Cell text uses `textContent`; `render` returns text or consumer-owned Nodes; `cellClass` tokens are validated class names. Filter models from state, URLs, or the UI are validated (`DATA_GRID_FILTER`) and matched as data; filter values are never parsed as code or HTML. Expressions are read by a hand-written tokenizer and recursive-descent parser (no `eval`, no `Function`), with limits on nesting (8 levels) and size (500 conditions). Sizes and offsets are written through the CSSOM, so a strict Content Security Policy with Trusted Types works. No string expressions are evaluated. Formulas run in the library's own evaluator (no eval or Function) with limits on length, nesting, range size, and evaluation steps. CSV export escapes formula-like text; Excel export writes text as text (formulas only from application code), keeps http, https, and mailto links only, and hashes a protection password with SHA-512 and a random salt (never stored). PDF fonts are parsed defensively and refused when their license forbids embedding.

## 24. Data handling behavior

No persistence, network access, or telemetry. `getState()` returns JSON the application may store; `setState()` treats it as untrusted. Notes go through the application's store; exports and print run in the browser; dropped files go to the application's handler; the server row model calls only the application's datasource.

## 25. Performance characteristics

Row offsets come from a Fenwick tree (O(log n) per lookup or height change; uniform heights need no per-row storage); only the visible rows plus `overscan` and the visible center columns are rendered; rows and cells are reused by id across renders; scroll updates run once per animation frame. Text sorting ranks each column once with the locale collator and then compares numbers, so direction changes and multi-sorts on the same rows are fast. Filters compile once per change; text conditions share one normalized text per row, and the quick filter formats a row's columns only until one matches, caching the texts per row. Set filter values are extracted once and cached until the rows change. Above about 10 million pixels of content, the scroll space is scaled so very large row counts still scroll smoothly. Budgets: `metadata/data-grid/component.json`, measured in `tests/e2e/perf-data-grid.spec.ts`.

## 26. Supported data scale

Tested with 1,000,000 rows and 300 columns.

## 27. Usage examples

```ts
import { DataGrid } from '@absoluteui/components/data-grid';

const host = document.createElement('div');
host.style.setProperty('block-size', '400px');
document.body.append(host);
DataGrid.create(host, {
  label: 'People',
  rows: [{ id: '1', name: 'Ada', city: 'London' }],
  rowId: (r) => r.id,
  columns: [
    { id: 'name', header: 'Name', field: 'name', pinned: 'start' },
    { id: 'city', header: 'City', field: 'city', flex: 1 },
  ],
});
```

Filtering: a filter kind per column, the floating filter row, and the search box. Restore filters from a URL with `setState` (validated).

```ts
import { DataGrid } from '@absoluteui/components/data-grid';

const host = document.createElement('div');
host.style.setProperty('block-size', '400px');
document.body.append(host);
DataGrid.create(host, {
  label: 'People',
  rows: [{ id: '1', name: 'Ada', age: 36, city: 'London' }],
  rowId: (r) => r.id,
  floatingFilters: true,
  searchBox: true,
  filters: { age: { kind: 'number', conditions: [{ operator: 'greaterThanOrEqual', value: 30 }] } },
  columns: [
    { id: 'name', header: 'Name', field: 'name', filter: 'text' },
    { id: 'age', header: 'Age', field: 'age', type: 'number', filter: 'number' },
    { id: 'city', header: 'City', field: 'city', filter: 'set' },
  ],
});
```

List editors (a separate entry point): a searchable list for one value and chips for several.

```ts
import { DataGrid } from '@absoluteui/components/data-grid';
import { comboboxEditor, multiSelectEditor } from '@absoluteui/components/data-grid/editors';

interface Task {
  id: string;
  owner: string;
  tags: string[];
}

const host = document.createElement('div');
host.style.setProperty('block-size', '400px');
document.body.append(host);
DataGrid.create<Task>(host, {
  label: 'Tasks',
  rows: [{ id: '1', owner: 'Ada', tags: ['ui'] }],
  rowId: (r) => r.id,
  columns: [
    { id: 'owner', header: 'Owner', field: 'owner', editable: true, editor: comboboxEditor({ values: [{ value: 'Ada', label: 'Ada' }, { value: 'Grace', label: 'Grace' }] }) },
    { id: 'tags', header: 'Tags', field: 'tags', editable: true, editor: multiSelectEditor({ values: [{ value: 'ui', label: 'UI' }, { value: 'api', label: 'API' }] }), format: (v) => (Array.isArray(v) ? v.join(', ') : '') },
  ],
});
```

Advanced filter: an expression bar and builder over the same model, here set from code.

```ts
import { DataGrid } from '@absoluteui/components/data-grid';

const host = document.createElement('div');
host.style.setProperty('block-size', '400px');
document.body.append(host);
DataGrid.create(host, {
  label: 'People',
  rows: [{ id: '1', name: 'Ada', age: 36, city: 'London' }],
  rowId: (r) => r.id,
  advancedFilter: true,
  advancedFilterModel: {
    join: 'or',
    items: [
      { column: 'age', filter: { kind: 'number', conditions: [{ operator: 'greaterThanOrEqual', value: 30 }] } },
      { column: 'city', filter: { kind: 'set', values: ['Oslo', 'Lima'] } },
    ],
  },
  columns: [
    { id: 'name', header: 'Name', field: 'name', filter: 'text' },
    { id: 'age', header: 'Age', field: 'age', type: 'number', filter: 'number' },
    { id: 'city', header: 'City', field: 'city', filter: 'set' },
  ],
});
```

The live examples above cover every feature area; the notes below give the details per feature. The [Data Grid guide](/docs/guides/data-grid/) walks through the entry points.

#### Menus, column chooser, tooltips, find, and notes

Accessories come from `@absoluteui/components/data-grid/accessories` and are passed in the `accessories` option; they attach when the grid is created (the grid must be in the document).

- Menus: the column menu (`columnMenu()`) offers sorting (Clear sort while sorted), the filter, pinning, grouping, hiding, and two submenus: Groups (expand and collapse all, while grouped) and Columns (autosize this or all columns, rename, the column chooser, reset columns). The cell menu (`contextMenu()`) offers copying (with or without headers), cutting, pasting (where the Clipboard API is available), notes, pinning the row, Move row, Send to (drop zones), Groups, Columns, and Export. Entries that do not apply are left out, which keeps the menus short enough to show without scrolling. `columnMenu({ items(column, defaults) })` and `contextMenu({ items(target, defaults) })` change the entries: built-in names, `'separator'`, or your own `{ id, label, action, disabled, shortcut, icon, items }`. Actions taken from a menu behave like their keyboard and pointer counterparts. Outside headers and cells the browser's menu stays.
- Column chooser (`columnChooser()`, opened from Columns > Choose columns or with its `open()`): shows, hides, and reorders columns at once (`aui-columns-change`); search filters its list.
- Tooltips: a column's `tooltip` (`true` shows the displayed text, a string, or a function of value and row) for data rows; `tooltips({ showDelay, mode: 'truncated', trigger: 'hover' })` shows them only for text that does not fit, or only on hover.
- Find (`find()`): a search field in the toolbar; matches are cells of the displayed rows (all pages; rows of collapsed groups are not searched) whose displayed text contains the text (`caseSensitive`); the current match is scrolled into view and its page shown; F3 and Shift+F3 move; `findShortcut: true` opts into Ctrl+F; the API is `find(text)`, `next()`, `previous()` on the accessory.
- Notes are stored by your application (`notes({ store: { get, set, index }, author })`; the grid stores nothing): `index()` marks the cells that have notes, saves write `{ text, author, updated }`, an empty note deletes. Shift+F2 or the cell menu opens the note dialog.

#### Side bar, status bar, and toolbar

- Side bar (`sideBar({ panels, position, open, width })`): Columns shows the column list (search, Show all, visibility, Group toggles for groupable columns, Move up / Move down); Filters shows each filterable column's filter editor in place. The side bar sits beside the rows (`position` `start` or `end`). Pivot fields are edited in the pivot panel.
- Status bar (`statusBar({ panels, format })`): row counts ("Rows: 120 of 500" while filtered; the server count with a datasource), the selected row count, and while the cell ranges cover two cells or more their count of filled cells and the sum, average, minimum, and maximum of their numbers; panels of your own (`{ id, render(context) }`) refresh after every change.
- Toolbar (`toolbar({ items, label })`): built-ins (`'chooser'`, `'resetColumns'`, `'autoSizeAll'`, `'expandAll'`, `'collapseAll'`, `'separator'`) and buttons of your own (`{ id, label, icon, action }`, or `items` for a menu) next to the search box and the group and pivot panels.

#### Rows: numbers, pinning, spanning, full-width rows

- Row numbers (`rowNumbers: true | { width, resizable }`) count displayed rows (sorting, filtering, grouping, and paging renumber them); with cell ranges a click on a number selects the row's cells; numbers are never copied, pasted into, or filled. Row heights set by the user (Alt+ArrowUp / Alt+ArrowDown on a number, or its handle) or by `setRowHeight` stay with the row id (not with `autoRowHeight`, where the resizer is off).
- Pinned rows: static rows (`pinnedTopRows`, `pinnedBottomRows`) are never sorted, filtered, grouped, selected, or edited; rows pinned by id (`pinned`, `pinRow`, the cell menu) stay in the body too, follow its filters, and are read-only in their section. `grandTotal` works on flat grids too, and `pinnedTop` / `pinnedBottom` keep it in a pinned section. Pinned sections stay under the header and at the bottom edge while the body scrolls.
- Row spanning (`spanRows`) merges adjacent data rows whose displayed values are equal and not blank (or that the function calls equal), at most 500 rows per span; group, total, and full-width rows break spans, and sorting and filtering recompute them. Column spanning (`colSpan(row)`) covers the next columns of the same pinned section. Spans are visual: copies, ranges, and writes still address every cell by its column.
- Full-width rows (`fullWidthRow`) draw `render(row)` across the row; their content stays in view while the rows scroll sideways and is released when the row leaves; they are never edited, filled, or part of ranges. `groupDisplay: 'rows'` draws group rows that way. Sticky group rows follow the topmost row while grouped (`stickyGroupRows: false` turns them off).

#### Pivot mode

Rows group by the row fields (sorted by key like groups; the last level has no data rows), and the Pivot Grid engine aggregates the rows that pass the filters for every (row, column) key pair: a column group per column key (nested per column field) holds a result column per value ("Sum of Salary"), then "Total" columns. Sums, averages, minimums, and maximums read numbers (currency columns keep their currency); counts count non-blank values and distinct counts compare values (dates by day). The data columns hide while pivoting. Without row fields one row shows the grand totals; `grandTotal` adds a total row otherwise. More than `pivotMaxColumns` result columns are left out (announced; `getPivotTruncation()`). `pivotPanel: true` shows a panel to edit the pivot (pills move between zones by button or by dragging). `treeData` takes precedence over `pivot`, and `pivot` over `groupBy`.

#### Master/detail

Detail rows follow their master rows (paging counts master rows only), are not selectable, editable, or part of copies, and do not scroll sideways. Content renders once and is kept while expanded, and for up to `keep` collapsed details (oldest released first, through `destroy`); a replaced row object renders it again. Heights are fixed (default 300) or measured (`auto`).

#### Server row model

`datasource.getRows({ start, end, sort, filters, quickFilter, advancedFilter }, signal)` returns `{ rows, rowCount? }`; blocks of `blockSize` rows load as they scroll into view (the topmost first, `maxConcurrentLoads` at a time, debounced by `blockLoadDelay`; stale requests are aborted). Without `rowCount` the total grows a block at a time until a block comes back short. A sort or filter change purges the cache and reloads from the top. Failed blocks are never retried automatically (`retryLoads()`, or Retry). `maxBlocks` releases the least recently used blocks. `applyTransaction` updates loaded rows; `applyServerTransaction` also adds and removes loaded rows. Edits, paste, fill, and undo write loaded rows. Selection keeps the ids of rows that are not loaded; the header checkbox selects every row (`getServerSelection()` returns `{ selectAll: true, toggled }`). Server groups: with `groupBy` the request carries `groupBy` and `groupKeys`; the top level returns group rows (the count from `getChildCount(row)`), and each expanded group loads its own rows with `groupKeys` set to its path; collapsed groups keep their rows unless `purgeClosedGroups`. Server tree data: `treeData: { serverGroup(row), serverKey(row), label }`.

#### Row dragging and drop zones

`rowDragging: true | { managed, multiRow, canDrag, nativeData }` adds a drag handle to the `rowDrag` column (default the first data column). Managed grids move the rows (one undo step; tree data with `parentIdField` reparents when a row is dropped inside another); without `managed` the grid only emits the cancelable `aui-row-drop`. Ctrl+Shift+arrows on the handle cell and the cell menu's Move row are the keyboard path. `addRowDropZone({ element, label, onDrop })` lets rows drop on another element (the cell menu's Send to is its keyboard path); `rowDropZone({ move })` of another grid adds the rows there. With `nativeData` the handle uses native drag and drop and carries your data to other applications.

#### Aligned grids, auto-generated columns, file drop, and state

- `alignWith(other)` keeps two grids' columns (order, widths, pinning, visibility, collapsed groups) and horizontal scroll in step, by column id (a totals grid under the main grid).
- `inferColumns(rows, { sample, exclude })` returns columns for the rows' own keys (number, boolean, date for PlainDate, datetime for Instant or ZonedDateTime, else text). `fileDrop: { accept, onFiles }` shows an overlay while files are dragged over the grid; for a CSV file use `parseCsv(text, { header: true })` from `@absoluteui/helpers/csv`, then `coerceCsvValues(rows)` and `inferColumns`. Dropping is pointer only: offer a file input too.
- `getState()` includes sort, columns (with header names), paging, filters, the quick and advanced filters, selection, grouping and expansion, master/detail expansion, pinned rows, and the pivot; `setState` validates and restores them (malformed input throws `DATA_GRID_STATE` and changes nothing).

#### Exports and print

- CSV (`toCsv`, `toCsvBlob`): the column and row choices, group rows and totals, column group header rows, raw or formatted values; formula-like text (=, +, -, @, tab, carriage return) is escaped with a leading quote; numbers the grid formats itself are not.
- Excel (`toXlsx`, `xlsxSheet`, `writeXlsx` from `@absoluteui/components/data-grid/export`): typed values (dates as Excel dates in the grid time zone), text always as text (formula-like values cannot run; formulas only from `excel.formula` code), named styles (`styles`, `excel.style`, `excel.cellStyle`), number formats, merged column group headers, frozen header rows and start-pinned columns, outlines collapsed like the grid, AutoFilter, links (http, https, mailto), PNG and JPEG images, sheet protection (SHA-512 password hash, never stored), several sheets.
- PDF (`toPdf` from `@absoluteui/components/data-grid/pdf`): pages with the title, column group and header rows repeated on every page, bold group and total rows, end-aligned numbers, "Page n of N"; A4 or Letter, portrait or landscape; Latin text with the standard fonts, other scripts with `fonts: { regular, bold }` (TrueType or OpenType, embedded with a ToUnicode map; fonts whose license forbids embedding are refused); right-to-left grids mirror the columns.
- Print (`print()`): a real table (caption, header rows repeated per page) shown alone in print media in print colors, removed after printing.
- The cell menu's Export submenu offers CSV, and Excel and PDF when `contextMenu({ export: { excel, pdf } })` gets their functions; files are named after the grid's label.

#### Formulas

Formulas live in `@absoluteui/components/data-grid/formulas` (our own parser and evaluator; never `eval`). Pass `formulas: formulaEngine({ functions, calendar })`:

- Calculated columns: `formula: '[Price] * [Quantity]'`. `[Column]` (column id or header, without case) is the same row's value, or the whole column inside functions (`SUM([Total])`); `[@Column]` is always the same row; A1 references use stable addresses (letters by column definition order, numbers by source row order). Results are read-only, sort, filter, group, aggregate, and export as values.
- Cell formulas: columns with `formulas: true` evaluate values that are text starting with `=` (stored in your row data). The editor shows the formula with function and column suggestions (a combobox), the signature of the function around the caret, and syntax problems; a click on another cell inserts its address. Invalid formulas are refused with the position of the problem. Fill, Ctrl+D / Ctrl+R, and pasting cells copied in the grid move relative A1 references (`$` parts stay).
- Functions: math and aggregates (SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTBLANK, PRODUCT, ROUND, ROUNDUP, ROUNDDOWN, ABS, INT, MOD, POWER, SQRT, SIGN), conditional (SUMIF, SUMIFS, COUNTIF, COUNTIFS, AVERAGEIF; wildcards * and ?), logic (IF, IFS, IFERROR, IFNA, AND, OR, XOR, NOT, SWITCH, CHOOSE, ISBLANK, ISNUMBER, ISTEXT, ISERROR), text (CONCAT, TEXTJOIN, LEFT, RIGHT, MID, LEN, UPPER, LOWER, PROPER, TRIM, FIND, SEARCH, SUBSTITUTE, REPT, VALUE, TEXT), dates (TODAY in the grid time zone, DATE, YEAR, MONTH, DAY, WEEKDAY, DAYS, EDATE, EOMONTH, NETWORKDAYS and WORKDAY on the engine's business calendar), lookups (XLOOKUP, INDEX, MATCH, VLOOKUP); add your own with `functions`.
- Errors show their code and read their meaning ("#DIV/0!, division by zero"); cycles give `#CIRCULAR!`; limits (8192 characters, 64 nesting levels, 1,000,000 cells per range, 1,000,000 evaluation steps) give errors, never hangs. `formulaBar()` shows the focused cell's address and formula; `cellAddress()` and `cellFormula()` read them.

#### Charts

Charts live in `@absoluteui/components/data-grid/charts` (AbsoluteUI chart components; load the Sparkline, Bar Chart, Line Chart, and Pie Chart styles).

- Sparklines: spread `sparklineColumn({ values, label, variant, color, min, max, valueFormat, sortBy, locale })` into a column; each cell draws a named Sparkline; copy and exports get the numbers as text; sorting compares the last value (or `sum`, `min`, `max`).
- Range charts: `chartRange(grid, { type, seriesBy, title, range })` opens a panel docked below the grid (a region named "Chart of {title}"; Escape or Close closes it and focus returns to the grid) with a bar, stacked bar, line, area, or pie chart of the selected cells; it follows edits, sorting, and filtering, and each chart has its own data table. `chartPivot(grid, options)` charts pivot results. To offer it in the cell menu, add an item: `contextMenu({ items: (target, defaults) => [...defaults, { id: 'chart', label: 'Chart range', action: () => chartRange(grid) }] })`.

#### State schema for tools

`@absoluteui/components/data-grid/schema` has `dataGridStateSchema(grid)` (a JSON Schema, draft 2020-12, of the view state `setState` accepts, with the grid's column ids, filter kinds, groups, and pivot aggregates), `describeState(grid)` (a short English summary of the view), and `applyState(grid, state)` (`{ ok: true }` or `{ ok: false, error }`, so a tool can correct its proposal). Only view state: no row data, no edits, no row ids.

## 28. Edge cases

- Hosts without a height in `layout: 'fill'` collapse to the header; give the host a height or use `layout: 'auto'`.
- `rows` are never mutated; `setRows` keeps the sort, focus, and scroll position. Transactions never mutate the given rows either; the grid keeps its own row list (read it back with `getState` or keep your own copy).
- Change highlighting compares the displayed text, so a value that changes but formats the same (for example a rounding difference) is not highlighted. Highlights are not announced per cell; `aui-rows-change` carries the changed ids for applications that announce.
- A column group split by pinning shows one group header per section.
- Hiding the focused column moves the tab stop to the first header.
- Selection is kept by row id across sorting, filtering, paging, and updates; removing selected rows reports them in `aui-selection-change` (`reason: 'rows'`). Select all covers the rows that pass the filters by default (`selectAll: 'all'` includes filtered-out rows; `'page'` only the current page). The checkbox column (`aui-row-select`, a reserved id) is pinned first and is not part of the column state.
- Ranges are kept by row and column ids, so they follow sorting and column moves as rectangles of display positions; a range whose corner is filtered out, paged away, or hidden is not shown until it is displayed again. Ranges never include the checkbox column and are not part of the saved state. Ranges always contain the focused cell: moving focus outside them (Tab, a plain arrow key, `focusCell`) clears them.
- Writes never mutate rows: a writable cell (`editable`, plus `setValue`, or a `field` on a plain-object row) gets a new row object (`setValue`, or a shallow copy with the field replaced) and the changed rows are applied as one transaction (sort, filters, flash, focus, and scroll position stay consistent). `setValue` must keep the row id. Read-only cells, the checkbox column, and unchanged values are skipped.
- Pasted text is converted with the column's `parseValue`, else by type in the grid's locale: numbers with the locale's separators (currency symbols ignored, parentheses negative), dates as ISO or in the locale (numeric or with month names), booleans as the grid's Yes/No words or true/false, date-times only as ISO instants; empty text writes a blank. Text that does not convert leaves the cell unchanged and is reported. A block that divides the active range evenly is tiled over it; otherwise it is pasted at the range's top-left cell and rows or columns beyond the grid are dropped.
- Editing: a cell is editable when its column is writable (`editable` plus `setValue`, or a `field` on plain-object rows). Edits go through the same write path as paste (new row objects, one transaction, `aui-cells-change` with `source: 'edit'`; with `readOnlyEdits` only requested). The number editor reads the grid's locale and rejects letters; the date-time editor shows and reads wall-clock time in the grid's IANA time zone (a time inside a daylight-saving gap is rejected); the select editor's `options` can be a function of the row. Built-in validation: `required`, number `min`/`max`, `maxLength`, date `min`/`max` (ISO), and values an editor cannot convert; then the column's `validate`. An editor whose row is filtered out or removed is discarded.
- Date hierarchies: a date or date-time column with `groupHierarchy` groups by each part as its own level (in the grid's time zone; ISO weeks), labeled "2026", "Q1 2026", "January 2026", "Week 3, 2026", or the formatted day. `showAs` shows a numeric aggregate as a percentage of the grand total or of the parent group (top-level groups use the grand total); `aggregateFilteredOnly: false` aggregates every row of a group, including rows the filters hide.
- Tree data: rows form a tree from paths (`getPath`; missing levels become filler rows named by their path element), parent ids (`parentIdField`; missing parents and cycles make a row a root, reported by `getTreeOrphans()`, never looped over), or nested rows (`childrenField`, read when rows are set; rows added by transactions are roots). The group column shows the tree (`label` names the column that labels rows; paths use their last element); `groupBy` is ignored. A parent with its own row stays a data row: editable, selectable, and copied as usual, with aggregated columns showing the aggregate of the rows below it. Siblings follow the sort; filtering keeps the ancestors of matching rows, and `treeFilter: 'subtree'` also keeps the rows below a matching row. On a parent row, ArrowRight, ArrowLeft, Enter, and a double-click expand and collapse in the group column; elsewhere in the row they act as on a data row.
- Grouping: groups form over the filtered, sorted rows; groups are ordered by key (by the grouped column's sort direction when it is sorted; blanks last as "(Blanks)"); rows keep their sort within a group. Aggregates are computed from each group's rows (an average is never an average of averages; BigInt sums stay BigInt); counts show as plain numbers, other aggregates in the column's format. Group and total rows are not editable, filled, pasted into, or selected; copy reads their labels and aggregates. Group ids are stable for the same keys, so expansion (in the state) survives updates. Paging pages over the displayed rows (group rows included).
- Row mode (`editMode: 'row'`): every editable visible cell of the row gets an editor (large text renders in the cell); the row is outlined; per-cell validation runs first, then `validateRow(values, row)`, whose message (or messages by column) blocks the commit and focuses that cell's editor. A committed row is one transaction, one `aui-cells-change`, and one undo step.
- List editors live in a separate entry point so the grid itself does not include Combobox and Multi Select: `comboboxEditor({ values | loadValues, loadDelay, placeholder })` edits one value with typeahead filtering or values loaded per query (aborted by newer queries, loading and errors announced); `multiSelectEditor({ ..., maxSelected, selectAll })` edits an array of values with chips. Choice values are strings, numbers, or booleans; `values` can be a function of the row (dependent lists). The component's label is the editor's name ("{column}, {row}"), visually hidden in the cell. Inside the list, Enter chooses an option and Escape closes the list; with the list closed, Enter commits and Escape cancels.
- Batch editing: between `startBatch()` and `commitBatch()`, writes from editing, paste, cut, Delete, and fill become pending values: cells show them in italics with a corner mark and the cell's name ends with ", edited"; copy reads them; sorting and filtering keep the committed data; events and undo come with the commit (`source: 'batch'`). Undo during a batch is not available (`cancelBatch()` discards it). Rows the application replaces or removes during a batch drop their pending values.
- Undo: each applied write is one step (`undoLimit`, default 20); replacing or updating rows from the application (`rows`, `setRows`, `applyTransaction`) clears the history because old values may be stale; nothing is recorded with `readOnlyEdits`.
- Fill: two or more numbers or dates continue their linear series (dates by calendar days, or by working days when every source date is a working day of the column's business calendar); a single value, text, and mixed values repeat; Alt repeats a series or counts up from a single value. Dragging back into the range clears the cells it leaves; double-clicking the handle fills down to the last displayed row. Ctrl+D and Ctrl+R copy (no series).
- Copy uses the displayed text (formatted in the grid's locale and time zone) or the column's `copyValue`; values with tabs, line breaks, or quotes are quoted. Keyboard copy uses the native copy event (no permission prompt); text the user selected inside a cell copies natively.
- Text filters match the displayed text, case- and accent-insensitively by default; incomplete conditions (an operator without a value) filter nothing.
- A set filter lists the distinct displayed values of all rows (not only the filtered ones), blanks first as "(Blanks)", numbers and dates in value order; the panel renders at most 1,000 matching values and asks for a narrower search. Selecting every value removes the filter.
- The quick filter matches the displayed text of visible searchable columns (or `filterValue` when given); set `searchable: false` on columns that should not be searched.
- Floating filters edit simple filters in place (one condition the compact control can express); other filters show a read-only summary, and Enter on it opens the panel.
- The advanced filter replaces the column filter UI (header buttons and floating row) and the column filters stop applying while it is on; they are kept and apply again when it is turned off. The quick filter and the external filter still apply.
- Advanced expressions: columns by header in brackets (`]]` for a `]` in a header; a column id also works), text and dates in double quotes (`\"` and `\\` escape), numbers bare (`.` decimal separator), `and` binds tighter than `or`, parentheses group. Keywords are English and case-insensitive. Operators: text `contains`, `does not contain`, `=`, `!=`, `starts with`, `ends with`; numbers `=`, `!=`, `<`, `<=`, `>`, `>=`, `between 1 and 5`; dates the same symbols (or `on`, `before`, `after`, `on or before`, `on or after`), `is today`, `is this week` (and the other relative ranges), `is year to date`, `is in last 7 days`, `is in next 7 business days`, `is working day`, `is holiday`; every kind `is blank`, `is not blank`; booleans `is true`, `is false`; set columns `is any of ("Oslo", blank)` (or `in (...)`). An empty expression clears the filter.
- The builder lists at most 1,000 values of a set column (values already chosen stay listed); the expression bar accepts any value.
- The floating number syntax uses `.` as the decimal separator: `5`, `>5`, `>=5`, `<5`, `<=5`, `!=5`, `5..10`.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `DATA_GRID_OPTIONS` | configuration | Missing label, columns, rows, or rowId; malformed column or group; duplicate ids; invalid sizes or option values. Messages name the property, never the value. |
| `DATA_GRID_ROW_ID` | configuration | Empty or duplicate row id. |
| `DATA_GRID_STATE` | configuration | Malformed `setState` input (the grid is left unchanged). |
| `DATA_GRID_FILTER` | configuration | Malformed filter model in `filters`, `setFilter`, `advancedFilterModel`, `setAdvancedFilter`, or `setState` (unknown operator, wrong value type, too many conditions, nesting deeper than 8); the message gives the property path, never the value. |

Syntax errors in the expression bar are not thrown: they are shown, announced, and leave the applied filter unchanged.

## 30. Known limitations

- Pivot mode: no sorting of pivot rows by a result column, and no pivot mode over a datasource.
- Server row model: not combinable with `pivot`, `detail`, or client tree modes; set filters list `filterValues`, else the values of loaded rows; group rows have no group checkbox.
- Column filter changes apply live; there is no Apply button mode yet. Advanced filter keywords (`and`, `contains`, `is any of`, ...) are English; column headers and messages are localized.
- Children stay within their column group when moved.
- Managed row dragging moves client rows in source order only (flat rows that are not sorted, filtered, grouped, or pivoted, or tree data with `parentIdField`); otherwise the grid only emits `aui-row-drop`. `moveRow` and rows dropped from another grid clear the undo history.
- Formulas: no NOW() (formulas have calendar dates, not date-times); any row change recalculates the whole book (lazily, for the cells shown); paste moves references only for cells copied in the grid; formulas use `.` for decimals and `,` between arguments whatever the locale.
- Charts: bar, stacked bar, line, area, and pie (no scatter or combo chart from a range).
- Excel: Excel's limits apply (1,048,576 rows, 16,384 columns, 32,767 characters per cell; longer text is cut); a protection password with the default 100,000 rounds takes a few seconds to hash.
- PDF: application fonts are embedded whole (no subsetting: CJK fonts make large files); Arabic letters are not shaped and bidirectional ordering is simplified (use the browser's Save as PDF through `print()` for complex scripts); the PDF is not tagged (no PDF/UA structure). At most 100,000 rows.
- Print: at most 20,000 rows.
- Pointer resizing, row dragging, pill dragging, and file drop need a pointer; keyboard, menu, and API alternatives exist (WCAG 2.5.7), except file drop, which needs a file input in the page.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML strings in cells.
- String expressions in options (only functions); formulas are text but run in the library's own evaluator, never eval.

## 32. TypeScript definitions

```ts
interface DataGridSort { column: string; direction: 'ascending' | 'descending' }
interface DataGridState { version: 1; sort: readonly DataGridSort[]; columns: DataGridColumnsState; page: number; pageSize: number | null; filters?: DataGridFilters; quickFilter?: string; advancedFilter?: DataGridAdvancedFilter | null; selected?: readonly string[]; groupBy?: readonly string[]; expanded?: Readonly<Record<string, boolean>> }
interface DataGridCellRange { startRow: string; endRow: string; startColumn: string; endColumn: string }
interface DataGridGroup { id: string; column: string; key: unknown; count: number; aggregates: Record<string, unknown>; children: DataGridGroup[] }
interface DataGridCellChange { rowId: string; column: string; oldValue: unknown; newValue: unknown }
interface DataGridCellEditor { element: HTMLElement; getValue(): unknown; focus(): void; control?: HTMLElement; popup?: boolean; destroy?(): void }
interface DataGridRowSelection<Row> { mode: 'single' | 'multiple'; checkboxes?: boolean; headerCheckbox?: boolean; selectAll?: 'filtered' | 'all' | 'page'; clickToSelect?: boolean; selectable?: (row: Row) => boolean }
interface DataGridAdvancedFilter { join: 'and' | 'or'; items: readonly (DataGridAdvancedCondition | DataGridAdvancedFilter)[] }
interface DataGridAdvancedCondition { column: string; filter: DataGridFilter }
type DataGridFilter = DataGridTextFilter | DataGridNumberFilter | DataGridBigIntFilter | DataGridDateFilter | DataGridBooleanFilter | DataGridSetFilter;
interface DataGridTextFilter { kind: 'text'; join?: 'and' | 'or'; conditions: readonly { operator: DataGridTextOperator; value?: string }[] }
type DataGridColumnDef<Row> = DataGridColumn<Row> | DataGridColumnGroup<Row>;
interface DataGridTreeData<Row> { getPath?(row): readonly string[]; parentIdField?: string; childrenField?: string; label?: string; serverGroup?(row): boolean; serverKey?(row): string }
interface DataGridDetail<Row> { render(row, context): Node; height?: number | 'auto'; isMaster?(row): boolean; keep?: number; expandedByDefault?: boolean; destroy?(node, row): void }
interface DataGridPivot { rows: readonly string[]; columns: readonly string[]; values: readonly { column: string; aggregate: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinctCount' }[] }
interface DataGridDatasource<Row> { getRows(request: DataGridRowsRequest, signal: AbortSignal): Promise<{ rows: readonly Row[]; rowCount?: number }> }
interface DataGridRowDragging<Row> { managed?: boolean; multiRow?: boolean; canDrag?(row: Row): boolean; nativeData?(rows: readonly Row[]): Record<string, string> }
interface DataGridRowDropZone<Row> { element: HTMLElement; label: string; onDrop(detail: DataGridRowZoneDetail<Row>): void; onDragEnter?(detail): void; onDragMove?(detail): void; onDragLeave?(detail): void }
interface DataGridCsvOptions<Row> { columns?: 'visible' | 'all' | readonly string[]; rows?: 'filtered' | 'page' | 'selected' | 'all' | 'range'; groups?: 'rows' | 'none'; header?: boolean; columnGroups?: boolean; pinned?: boolean; values?: 'formatted' | 'raw'; indent?: string; delimiter?: ',' | ';' | '\t'; lineEnding?: '\r\n' | '\n'; bom?: boolean; escapeFormulas?: boolean; value?(cell: DataGridCsvCell<Row>): string | number | boolean | null | undefined }
interface DataGridExcelColumn<Row> { style?: string; cellStyle?(row): string | undefined; numberFormat?: string; formula?(row, ref): string; link?(row): string | null; image?(row): DataGridExcelImage | null; width?: number }
interface DataGridFormulaEngine { create(source, environment): DataGridFormulaBook; check(text: string): string | null; shift(text: string, rows: number, columns: number): string; editor?(context, columns): DataGridCellEditor }
interface DataGridAccessory<Row> { attach(context: DataGridAccessoryContext<Row>): () => void }
```

## 33. Vanilla JS example

```ts
import { DataGrid, type DataGridCellActivateDetail } from '@absoluteui/components/data-grid';
import '@absoluteui/components/data-grid/style.css';

interface Order {
  id: string;
  total: number;
}

const host = document.querySelector<HTMLElement>('#orders');
if (host) {
  DataGrid.create<Order>(host, { label: 'Orders', rows: [], rowId: (r) => r.id, columns: [{ id: 'total', header: 'Total', field: 'total', type: 'currency', currency: 'EUR' }] });
  host.addEventListener('aui-cell-activate', (e) => {
    console.log((e as CustomEvent<DataGridCellActivateDetail<Order>>).detail.rowId);
  });
}
```

## 34. Angular example

```ts
import { Component, signal } from '@angular/core';
import type { DataGridColumnDef, DataGridSort } from '@absoluteui/components/data-grid';
import { AuiDataGrid } from '@absoluteui/angular/data-grid';

interface Person {
  id: string;
  name: string;
  city: string;
}

@Component({
  selector: 'app-people-grid',
  imports: [AuiDataGrid],
  template: `<aui-data-grid label="People" [columns]="columns" [rows]="people" [rowId]="byId" [(sort)]="sort" [style.block-size.px]="400" />`,
})
export class PeopleGridComponent {
  readonly people: Person[] = [{ id: '1', name: 'Ada', city: 'London' }];
  readonly columns: DataGridColumnDef<Person>[] = [
    { id: 'name', header: 'Name', field: 'name', pinned: 'start' },
    { id: 'city', header: 'City', field: 'city', flex: 1 },
  ];
  readonly byId = (p: Person): string => p.id;
  readonly sort = signal<readonly DataGridSort[] | undefined>(undefined);
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
