# Data Table

> Package: `@absoluteui/components/data-table` | Styles: `@absoluteui/components/pagination/style.css` and `@absoluteui/components/data-table/style.css` (plus `@absoluteui/components/menu/style.css` for the column chooser) | Since 0.2.0 (advanced grid features since 0.3.0) | Status: R2

## 1. Purpose

Show records that users scan, compare, sort, filter, select, and page through: an enterprise CRUD table with grid features. `DataTable` renders a real `<table>` with a `<caption>`, column headers (`th scope="col"`), and a row header per row (`th scope="row"`). Cells can be typed (number, currency, date, datetime in the configured timezone, boolean) and are formatted for the locale. Sorting is stable, by one column or (since 0.3.0) several. Selection uses native radios (single) or checkboxes (multiple, with a per-page "Select all rows" and Shift+click ranges). Paging composes [Pagination](pagination.md) with a result summary. In client mode the table filters, sorts, and pages `rows` itself. In server mode `rows` is the current page, and sorting, filtering, and paging only emit events.

Since 0.3.0, every one of these is opt-in and off by default, so a table without them renders exactly as before:

| Feature | Enable with |
|---|---|
| Multi-column sorting (Shift+click, Shift+Enter) | `multiSort: true`, or a `sort` array |
| Column filters (text, number, date, enum) and a server filtering contract | column `filter` (+ `filterOptions`), `filters`, `aui-filter-change` |
| Global search | `searchable: true`, `search` |
| Column visibility and column chooser | `hiddenColumns`, `DataTableColumnChooser.create(button, table)` |
| Column resize (pointer and keyboard) | `resizable: true`, `columnWidths`, column `minWidth`/`maxWidth` |
| Column pinning (sticky start/end) | `pinnedColumns: { start, end }` |
| Column order | `columnOrder` |
| Row expansion (detail rows) | `renderDetail`, `isRowExpandable`, `expanded` |
| Virtual scrolling | `virtual: true` |
| CSV export | `toCsv()`, `toCsvBlob()`, `downloadCsv()` |
| State serialization | `getState()`, `setState()` |

It is deliberately **not** an ARIA grid. Users Tab through the search field, sort buttons, resize handles, filter fields, selection inputs, disclosure buttons, and interactive cell content. Arrow-key cell navigation, editing, and cell selection are not provided.

**Design decision (0.3.0):** the grid features extend Data Table instead of adding a separate Data Grid subpath. The options, events, and markup of 0.2.0 are unchanged (the sort event gained a `sorts` field), there is one component to learn, and server/client modes work the same for every feature. The column chooser is a separate class, so a table without it does not bundle Menu.

## 2. Anatomy

```text
<div class="aui-data-table aui-data-table--comfortable aui-data-table--sticky [--virtual] [--fixed] [--pinned]">  (consumer host)
  <div class="aui-data-table__toolbar" role="search" aria-label="Orders">                        (searchable only)
    <label class="aui-data-table__search"><span class="aui-data-table__search-label">Search</span><input type="search" class="aui-data-table__search-input aui-data-table__control"></label>
  <div class="aui-data-table__body">
    <div class="aui-data-table__region" role="region" tabindex="0" aria-labelledby="{caption id}" [aria-busy="true"]>
      <table class="aui-data-table__table" [aria-rowcount]>                                         (aria-rowcount in virtual mode)
        <caption class="aui-data-table__caption" id>Orders</caption>
        <thead class="aui-data-table__head">                                                          (sticky as a whole)
          <tr class="aui-data-table__header-row">
            <th scope="col" class="aui-data-table__header-cell aui-data-table__select-cell">       (selection)
              <span class="aui-data-table__box"><input type="checkbox" class="aui-data-table__check aui-data-table__select-all" aria-label="Select all rows">...marks</span>
            <th scope="col" class="aui-data-table__header-cell aui-data-table__expand-cell"><span class="…visually-hidden">Details</span>   (renderDetail)
            <th scope="col" class="aui-data-table__header-cell [aui-data-table__cell--pinned-start]" data-column="customer" aria-sort="ascending" [aria-label="Customer"]>
              <button type="button" class="aui-data-table__sort" [aria-describedby="{hint}"]>
                <span class="aui-data-table__sort-label">Customer</span><span class="…visually-hidden">sort priority 1, ascending</span>
                <span class="aui-data-table__sort-priority" aria-hidden="true">1</span><svg class="aui-data-table__sort-icon" aria-hidden="true">
              <span class="aui-data-table__resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize Customer" aria-valuenow>   (resizable)
            <th scope="col" class="aui-data-table__header-cell">Paid</th>                            (sortable: false)
          <tr class="aui-data-table__filter-row">                                                     (columns with a filter)
            <td class="aui-data-table__filter-cell"><input type="search" class="aui-data-table__filter-input aui-data-table__control" aria-label="Filter Customer">
            <td class="aui-data-table__filter-cell"><span class="aui-data-table__filter-range"><input type="number" aria-label="Minimum Amount"><input type="number" aria-label="Maximum Amount">
            <td class="aui-data-table__filter-cell"><select class="aui-data-table__filter-select" aria-label="Filter Paid">
        <tbody class="aui-data-table__rows">
          <tr class="aui-data-table__spacer" aria-hidden="true"><td colspan>                        (virtual mode)
          <tr class="aui-data-table__row [aui-data-table__row--selected]" [aria-rowindex]>
            <td class="aui-data-table__cell aui-data-table__select-cell"><span class="aui-data-table__box"><input type="checkbox" aria-label="Select row Acme Corp">...</span></td>
            <td class="aui-data-table__cell aui-data-table__expand-cell"><button class="aui-data-table__expander" aria-expanded="true" aria-controls="{detail id}" aria-label="Details for Acme Corp"><svg aria-hidden="true">
            <th scope="row" class="aui-data-table__cell">Acme Corp</th>
            <td class="aui-data-table__cell aui-data-table__cell--end">$1,250.50</td>
          <tr class="aui-data-table__detail-row" id="{detail id}"><td class="aui-data-table__detail" colspan>{renderDetail content}
          <tr class="aui-data-table__empty-row"><td class="aui-data-table__empty" colspan>No results     (no rows)
          <tr class="aui-data-table__row aui-data-table__skeleton-row" aria-hidden="true">...             (loading, no rows)
    <div class="aui-data-table__status [aui-data-table__status--overlay]" role="status">                (spinner + "Loading")
    <span id="{hint}" hidden>Hold Shift while activating to sort by more than one column.</span>
  <div class="aui-data-table__pagination">                                                              (Pagination host; hidden when pageSize is null)
```

The column chooser attaches to a `<button>` you render (for example next to your own export button): Menu adds `aria-haspopup="menu"`, `aria-expanded`, and a `role="menu"` popup with `menuitemcheckbox` items after the button.

## 3. When to use

- Lists of records users scan, compare, sort, select, and page through (orders, users, invoices).
- Server-paged data where the backend sorts, filters, and pages, and the table renders the current page.
- Operational grids that need filters, several sort columns, column choice and widths, pinned identifier columns, detail rows, or CSV export, with the view state saved and restored.
- Large client-side row sets (tested with 100,000 rows) in a fixed-height region with `virtual: true`.

Grouping and aggregation (since 0.9.0):

- `groupBy: ['department', 'team']` groups rows by the displayed text of those columns, nested in that order. Groups sort first (in the column's sort direction when sorted, else ascending); rows keep the other sorts inside their group. Each group gets a header row with a disclosure button ("Department: Sales (12)", `aria-expanded`) and its aggregates; `collapsedGroups` and `aui-group-toggle` (`{ key, collapsed, collapsedGroups }`) control which are collapsed. Page sizes count header rows and rows alike. Client mode only, and not with `virtual`.
- `aggregate` on a column (`'sum'`, `'avg'`, `'min'`, `'max'` over finite numbers, `'count'`, or a function of the values and rows) adds the value to group headers and a totals row (`<tfoot>`, "Total") over all filtered rows. Values are formatted by the column `type`. In server mode, pass `totals` (by column id) from the server. `showTotals: false` hides the totals row.
- Custom content (since 0.9.0): a column `renderHeader(column, doc)` replaces the header text (decorative; `header` stays the accessible name), and `renderEmpty(doc)` replaces the empty message. Nodes are released with `releaseNode()` when dropped.
- Inline editing (since 0.9.0): a column with `editable: true` (or a function of the row) shows its cells as buttons ("Ada, edit Name"); activating one opens an editor in the cell. Built-in editors follow `type` (`text`, `number`, `date`, `checkbox`) or `editor` (`select` with `editOptions`). Enter or leaving the cell commits, Escape cancels; `validate(value, row)` returning a message keeps the editor open with the message (`aria-invalid`). Checkbox columns toggle in one step (`aria-pressed`). `renderEditor(context, doc)` provides a custom editor (`context.commit(value)`, `context.cancel()`), released with `releaseNode()` when it closes. The table never changes `rows`: it emits `aui-cell-edit` (`{ rowId, row, column, value, previous }`) and you update `rows`; keyboard focus returns to the cell when its row is rebuilt. Editable cells are tab stops (the table has no arrow-key grid navigation).
- `renderGroupHeader(group, doc)` returns custom, decorative header content (the toggle keeps the default text as its name); nodes are released with `releaseNode()` when dropped.

## 4. When not to use

- Spreadsheet-like work with arrow-key cell navigation or cell selection: not provided (inline editing is, one cell at a time).
- Layout of non-tabular content: use Layout.
- Rows of different heights (wrapping text, detail rows) with virtual scrolling: virtual rows are single-line and uniform; page instead.
- Data sets that do not fit in memory: use server mode.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `table` | `HTMLTableElement` | The `<table>` element. |
| `sort` | `DataTableSort \| null` | The primary sort (a copy). |
| `sorts` | `DataTableSort[]` | All sorts by priority (copies). Since 0.3.0. |
| `filters` | `Record<string, DataTableFilter>` | Active filters (a copy). Since 0.3.0. |
| `search` | `string` | Global search text. Since 0.3.0. |
| `expanded` | `string[]` | Expanded row ids. Since 0.3.0. |
| `collapsedGroups` | `string[]` | Keys of collapsed groups (`groupBy`). Since 0.9.0. |
| `rowCount` | `number` | Rows matching filters and search across all pages (client), or `total` (server). Since 0.3.0. |
| `page` | `number` | Current page (1-based). |
| `pageSize` | `number \| null` | Rows per page, or `null` when paging is off. |
| `selected` | `string[]` | Selected row ids in selection order (a copy). |
| `options` | `Readonly<DataTableOptions<Row>>` | Current options. |

Instance options: `caption` (required), `hideCaption`, `columns` (required), `rows` (required), `rowId` (required), `sort`, `selected`, `isRowSelectable`, `pageSizes`, `page`, `mode` (`'client'` default or `'server'`), `total`, `loading`, `emptyMessage` (default localized "No results"), and `icons`. Since 0.3.0: `filters`, `search`, `searchable`, `filterRow` (default `true`), `hiddenColumns`, `columnOrder`, `columnWidths`, `pinnedColumns`, `resizable`, `renderDetail`, `isRowExpandable`, `expanded`, `virtual`, and `rowHeight` (default 40, an estimate replaced by the measured height). Full table: `metadata/data-table/api.json`.

Column options (`DataTableColumn<Row>`):

| Option | Type | Description |
|---|---|---|
| `id` | `string` | Unique column id, used by `sort.column`, filters, and column state. |
| `header` | `string` | Header text (also the sort button text). |
| `accessor` | `(row) => unknown` | Raw value used for sorting, filtering, and default rendering. |
| `type` | `'text' \| 'number' \| 'currency' \| 'date' \| 'datetime' \| 'boolean'` | Typed formatting and sorting. Default `text`. |
| `currency` | `string` | ISO 4217 code; required for `currency`. |
| `format` | `(value, row) => string` | Cell text; overrides typed formatting. Rendered as text. |
| `render` | `(row, doc) => Node \| string` | Custom cell content. Strings are text; Nodes are consumer-owned. Since 0.9.0 the table calls `releaseNode()` (`@absoluteui/core`) on returned nodes and `renderDetail` nodes when it drops them, so a node registered with `onNodeRelease()` can dispose of framework views. |
| `sortable` | `boolean` | Default `true`. |
| `compare` | `(a, b) => number` | Custom ascending comparator. |
| `align` | `'start' \| 'end' \| 'center'` | Default `end` for number and currency, otherwise `start`. |
| `width` | `string` | CSS length (`12rem`, `120px`, `20%`, `10ch`); a resized width replaces it. |
| `rowHeader` | `boolean` | Render cells as `th scope="row"`. Default: the first displayed column, unless it sets `false`. At most one column. |
| `filter` | `'text' \| 'number' \| 'date' \| 'enum'` | Since 0.3.0. Filter kind: `number` on number/currency columns, `date` on date/datetime columns, `enum` with `filterOptions` or on boolean columns. |
| `filterOptions` | `{ value, label }[]` | Since 0.3.0. Enum values (matched against the text of the raw value). Default for boolean columns: Yes (`"true"`) / No (`"false"`). |
| `searchable` | `boolean` | Since 0.3.0. Include in the global search. Default `true`. |
| `hideable` | `boolean` | Since 0.3.0. The column chooser may hide it. Default `true`. |
| `resizable` | `boolean` | Since 0.3.0. Overrides the table's `resizable`. |
| `minWidth` / `maxWidth` | `number` | Since 0.3.0. Resize bounds in CSS pixels. Defaults 64 / 960. |
| `exportable` | `boolean` | Since 0.3.0. Include in CSV exports of `visible` or `all` columns. Default `true`. |
| `exportValue` | `(row) => string \| number \| boolean \| null` | Since 0.3.0. CSV value; overrides formatted and raw values. |

Filter values (`DataTableFilter`, JSON-safe):

| Type | Shape | Matches |
|---|---|---|
| `text` | `{ type: 'text', value: string, operator?: 'contains' \| 'equals' \| 'startsWith' }` | Displayed cell text, case-insensitive for the locale. Default `contains`. |
| `number` | `{ type: 'number', min?: number \| null, max?: number \| null }` | Inclusive range; empty cells never match a range. |
| `date` | `{ type: 'date', from?: 'YYYY-MM-DD' \| null, to?: 'YYYY-MM-DD' \| null }` | Inclusive calendar days; datetime columns use the configured timezone. |
| `enum` | `{ type: 'enum', values: string[] }` | The raw value's text is one of `values` (`"true"`/`"false"` for booleans). |

Empty filters (blank text, open range, no values) are removed.

| Global option | Type | Default |
|---|---|---|
| `selection` | `'none' \| 'single' \| 'multiple'` | `'none'` |
| `pageSize` | integer 1-1,000,000 or `null` | `25` |
| `stickyHeader` | `boolean` | `true` |
| `sortCycle` | `'tri-state' \| 'bi-state'` | `'tri-state'` |
| `multiSort` | `boolean` (since 0.3.0) | `false` |
| `filterDelay` | integer 0-5000 ms (since 0.3.0) | `250` |
| `locale` (inherited) | BCP 47 | `'en-US'` |
| `timezone` (inherited) | IANA zone | `'UTC'` |
| `density` (inherited) | `'compact' \| 'comfortable' \| 'spacious'` | `'comfortable'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

When `pageSizes` is set and the configured `pageSize` is not one of them, the first entry of `pageSizes` is used. An explicit instance `pageSize` must be one of `pageSizes`.

`DataTableColumnChooser` (since 0.3.0) has `trigger`, `table`, and `menu` (the composed [Menu](menu.md)). Options: `label` (menu name; default: labelled by the trigger), `placement`, `direction`.

## 6. Methods

| Method | Description |
|---|---|
| `DataTable.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `update(options)` | Merge and apply options. Unchanged rows keep their elements. Emits nothing. |
| `setRows(rows, total?)` | Replace rows (and the server-mode total). Selected ids that are still present stay selected. |
| `getSelected()` | Selected row ids. |
| `setSelected(ids)` | Replace the selection without events. In client mode unknown ids are dropped; unselectable rows are always dropped. |
| `clearSelection()` | Clear the selection without events. |
| `getState()` | Since 0.3.0. JSON-safe `DataTableState`: `{ version: 1, sort, filters, search, columns: { order, hidden, widths, pinned: { start, end } }, page, pageSize, collapsedGroups }` (`collapsedGroups` since 0.9.0). |
| `setState(state)` | Since 0.3.0. Restore a snapshot or any subset (`version` plus the parts to change). Validates untrusted input; drops unknown column ids, unsortable sorts, filters a column cannot take, and page sizes not in `pageSizes`. Emits nothing. |
| `toCsv(options?)` | Since 0.3.0. CSV text; see Security behavior. No side effects. |
| `toCsvBlob(options?)` | Since 0.3.0. `toCsv()` as a `text/csv;charset=utf-8` Blob. |
| `destroy()` | Remove rendering, listeners, timers, observers, the composed Pagination, and subscriptions. |
| `DataTableColumnChooser.create(trigger, table, options?)` | Since 0.3.0. Attach a column chooser Menu to your `<button>`. |
| `chooser.refresh()` / `chooser.destroy()` | Rebuild items from the table (also done on open and after changes) / remove the Menu and listeners. |
| `downloadCsv(csv, filename, doc?)` | Since 0.3.0. Save a CSV string or Blob through a temporary object URL. The only download side effect. |

`toCsv` options (`DataTableCsvOptions`):

| Option | Default | Values |
|---|---|---|
| `columns` | `'visible'` | `'visible'` (displayed columns in display order), `'all'` (column order, hidden too), or column ids. `exportable: false` columns are left out of `visible` and `all`. |
| `rows` | `'filtered'` | `'filtered'` (all pages, sort order), `'page'`, `'selected'` (sort order, ignoring filters), `'all'` (sort order, ignoring filters). Server mode: the loaded rows only. |
| `values` | `'formatted'` | `'formatted'` (displayed text) or `'raw'` (numbers, `true`/`false`, `YYYY-MM-DD`, ISO 8601 UTC instants, strings). |
| `header` | `true` | Header row with the column headers. |
| `delimiter` | `','` | `','`, `';'`, `'\t'`. |
| `lineEnding` | `'\r\n'` | `'\r\n'` (RFC 4180) or `'\n'`. |
| `bom` | `false` | Prefix a UTF-8 byte order mark (helps some spreadsheet applications). |
| `escapeFormulas` | `true` | Formula-injection protection. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-sort-change` | `{ sort: DataTableSort \| null, sorts: DataTableSort[] }` | Yes | The user activated a sort button (`sorts` since 0.3.0). |
| `aui-selection-change` | `{ selected: string[] }` | Yes | The user changed the selection (row input, select all, Shift+click range). |
| `aui-page-change` | `{ page, pageSize }` | Yes | The user changed the page or the page size. |
| `aui-filter-change` | `{ filters, search }` | Yes | Since 0.3.0. The user changed a column filter or the search. |
| `aui-columns-change` | `{ column, reason: 'visibility' \| 'resize', columns: DataTableColumnsState }` | Yes | Since 0.3.0. The user showed or hid a column (chooser) or resized one (on pointer release, or per key). |
| `aui-expand-change` | `{ id, expanded, expandedIds }` | Yes | Since 0.3.0. The user expanded or collapsed a row. |

In client mode these events are informative: the table has already re-rendered. In server mode the consumer must load and pass new `rows` (and `total`) with `update` or `setRows`; `table.getState()` returns the whole query (sort, filters, search, page, pageSize). A new sort, filter, or search always returns to page 1. Programmatic changes (`update`, `setState`, `setSelected`, `clearSelection`) emit nothing. The composed Pagination's own `aui-change` is stopped at the table and re-emitted as `aui-page-change`. To persist the view state, save `getState()` after `aui-sort-change`, `aui-filter-change`, `aui-columns-change`, `aui-page-change`, and `aui-group-toggle`.

## 8. Slots/content areas

- Per-column `render(row, doc)`: a string (rendered as text) or a Node that you own (links, buttons, badges). Interactive content in cells is reached with Tab.
- `renderDetail(row, doc)` (since 0.3.0): the content of an expanded row's detail row, a Node you own or a string (text). It is called when a row is first expanded and the result is kept while the row stays expanded and its object is unchanged; column changes move the same node into the rebuilt detail cell. Collapsing removes the node from the document; the next expansion calls `renderDetail` again.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-data-table` | Host. |
| `aui-data-table--compact`, `--comfortable`, `--spacious` | Density (cell padding). |
| `aui-data-table--sticky` | Sticky header enabled (the whole `thead` sticks, filter row included). |
| `aui-data-table--loading` | Loading state. |
| `aui-data-table--virtual`, `--fixed`, `--pinned`, `--resizing` | Since 0.3.0: virtual mode, fixed layout (pixel widths), pinned columns, pointer resize in progress. |
| `aui-data-table__toolbar`, `__search`, `__search-label`, `__search-input`, `__control` | Since 0.3.0: search toolbar and native fields. |
| `aui-data-table__body` | Positioning wrapper for the region and the loading overlay. |
| `aui-data-table__region` | Focusable scroll region. Set `max-block-size` on it to make the sticky header stick on long tables (virtual mode defaults to `70vh`). |
| `aui-data-table__table`, `__caption`, `__head`, `__header-row` | Table, caption, head. |
| `aui-data-table__header-cell`, `__header-cell--sorted` | Column headers (every sort column is `--sorted`). |
| `aui-data-table__sort`, `__sort-label`, `__sort-icon`, `__sort-priority` | Sort button (priority number since 0.3.0). |
| `aui-data-table__resizer` | Since 0.3.0: resize handle. |
| `aui-data-table__filter-row`, `__filter-cell`, `__filter-input`, `__filter-range`, `__filter-select` | Since 0.3.0: filter row. |
| `aui-data-table__cell--pinned`, `--pinned-start`, `--pinned-end`, `--pinned-edge` | Since 0.3.0: sticky pinned cells; `--pinned-edge` draws the boundary. |
| `aui-data-table__expand-cell`, `__expander`, `__expander-icon`, `__detail-row`, `__detail` | Since 0.3.0: row expansion. |
| `aui-data-table__spacer` | Since 0.3.0: virtual spacer rows. |
| `aui-data-table__row`, `__row--selected` | Body rows. |
| `aui-data-table__cell`, `__cell--end`, `__cell--center` | Cells and alignment. |
| `aui-data-table__select-cell`, `__box`, `__check`, `__check--checkbox`, `__check--radio`, `__mark`, `__select-all` | Selection inputs. |
| `aui-data-table__empty-row`, `__empty` | Empty state. |
| `aui-data-table__skeleton-row`, `__skeleton` | Loading placeholders. |
| `aui-data-table__status`, `__status--overlay`, `__spinner` | Loading status. |
| `aui-data-table__pagination` | Pagination host. |

All rules live in the `aui.components` cascade layer. Pinned offsets are private custom properties (`--_aui-data-table-start-{n}`, `--_aui-data-table-end-{n}`) set on the table through the CSSOM; do not set them yourself.

## 10. Design tokens

See `metadata/data-table/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-surface-sunken`, `color-border`, `color-border-strong`, `color-hover`, `color-selected`, `color-selected-text`, `color-primary`, `color-on-primary`, `color-text-muted`, `color-focus-ring`, `control-height-sm` (filter fields), `font-size-xs` (sort priority), `space-1` to `space-4`, `radius-sm`, `radius-md`. No new color pairs were needed: every new foreground/background combination (fields on sunken and page backgrounds, focus rings on sunken surfaces, text in detail rows) is already covered by the contrast gate.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-data-table-radius` (table region corner radius; falls back to `radius-md`), `--aui-data-table-bg` (table background; falls back to `color-surface`), `--aui-data-table-border-color` (table region boundary (decorative); falls back to `color-border`), `--aui-data-table-header-bg` (header row background; falls back to `color-surface-sunken`), `--aui-data-table-row-border-color` (row separators (decorative); falls back to `color-border`).

## 11. States

default, row hover, row selected, row not selectable (disabled input), sorted ascending/descending, unsorted, sorted by several columns (priority numbers), filtered, focus-visible, loading with skeleton rows, loading with an overlay over existing rows, empty (no rows or no matches), density (compact/comfortable/spacious), sticky header, column hidden, column resized (fixed layout), resizing, columns pinned, row expanded, virtual.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| unsorted | sort button | ascending; page 1; announcement; `aui-sort-change` |
| ascending | sort button | descending |
| descending | sort button | unsorted (`tri-state`) or ascending (`bi-state`) |
| sorted by A | Shift + sort button B (`multiSort`) | sorted by A, then B ascending; priorities shown |
| sorted by A, B | Shift + sort button B | B cycles in place; after descending (tri-state) B is removed |
| sorted by several | sort button without Shift | only that column, continuing its own cycle |
| any | filter field input (after `filterDelay`), Enter, select or date change | filtered; page 1; "Results: n" announced (client); `aui-filter-change` |
| any | search field input | searched; page 1; `aui-filter-change` |
| column visible | chooser item | hidden; `aui-columns-change` (`visibility`); the last visible column cannot be hidden |
| auto layout | first resize (pointer or key) | fixed layout: every header gets its measured pixel width |
| width w | ArrowRight / ArrowLeft / Home / End on a handle, or drag | new width within min/max; `aui-columns-change` (`resize`) per key or on release |
| collapsed row | disclosure button | expanded: detail row after the row; `aui-expand-change` |
| expanded row | disclosure button | collapsed: detail row removed |
| any page | Pagination control | new page (and size); `aui-page-change` |
| unselected row | row checkbox / radio | selected; `aui-selection-change` |
| anchor row set | Shift+click another row checkbox | every selectable row between them takes the clicked row's new state |
| some or none selected on page | select all | every selectable row on the page selected |
| all selected on page | select all | every row on the page deselected |
| rows present | `update({ loading: true })` | overlay spinner; rows kept |
| no rows | `update({ loading: true })` | skeleton rows |
| any | `setRows(rows)` | re-render; rows whose object is unchanged keep their element; selection pruned to present ids (client mode) |
| any | `setState(state)` | the given parts restored; no events |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Search field, scroll region, sort buttons, resize handles, filter fields, select all, row inputs, disclosure buttons, interactive cell and detail content, pagination (native order). |
| Enter / Space | Sort button | Sorts by this column only. |
| Shift+Enter / Shift+Space / Shift+click | Sort button (`multiSort`) | Adds the column to the sort, or cycles it in place. |
| ArrowRight / ArrowLeft | Resize handle | Widens / narrows by 10 px (Shift: 50 px); mirrored in rtl. |
| Home / End | Resize handle | Minimum / maximum width. |
| Typing / Enter | Text or number filter, search | Filters after `filterDelay` / immediately. |
| Enter / Space | Disclosure button | Expands or collapses the row. |
| Space | Checkbox | Toggles the row, or all selectable rows on the page (native). |
| Arrow keys | Row radio (single) | Selects the previous/next row (native radio group). |
| Arrow keys | Scroll region | Scrolls the table (native). |
| Shift+click | Row checkbox | Range selection within the current page. |
| Enter / Space / ArrowDown, Space, Escape | Column chooser button, items | Opens the menu, toggles a column (the menu stays open), closes and returns focus (APG Menu Button). |

## 14. ARIA contract

- Native `<table>` semantics; no `role="grid"`. The `<caption>` names the table.
- The scroll region has `role="region"`, `tabindex="0"`, and `aria-labelledby` pointing at the caption.
- `aria-sort="ascending" | "descending"` is set only on the primary sorted column header; other headers, including secondary sort columns, have no `aria-sort`. While sorting by several columns, each sort button's text ends with a visually hidden "sort priority n, ascending | descending" (name: "Salary sort priority 2, descending"); the visible priority number is `aria-hidden`.
- With `multiSort`, sort buttons have `aria-describedby` pointing at a hidden hint: "Hold Shift while activating to sort by more than one column."
- Sortable headers contain a native `<button>` whose text is the header. Icons are `aria-hidden`.
- Filter fields are native controls in a second header row, each with an `aria-label` naming its column ("Filter Name", "Minimum Salary", "Start from").
- The search toolbar is a `role="search"` landmark named by the caption; its field is labelled "Search" by a visible `<label>`.
- With `resizable`, each column header has `aria-label` set to the header text, so the handle's name is not read as part of the column header for every cell.
- Resize handles are focusable `role="separator"` elements (`aria-orientation="vertical"`, `aria-label="Resize {column}"`, `aria-valuenow`/`min`/`max` in CSS pixels, `aria-valuetext="{width} pixels"`), following the APG Window Splitter pattern.
- Disclosure buttons have `aria-expanded`, `aria-controls` (the detail row, while shown), and `aria-label="Details for {row header text}"`. The disclosure column header is visually hidden "Details".
- Virtual mode: the table has `aria-rowcount` (header rows plus all rows of the filtered set), header rows and rendered rows have `aria-rowindex` (1-based, including header rows and the page offset), and spacer rows are `aria-hidden`.
- Select all is a native checkbox named "Select all rows"; its `indeterminate` property exposes the mixed state natively.
- Row inputs are named "Select row {row header text}" (the row id when there is no row header).
- Selected rows are shown by the checked input and the `aui-data-table__row--selected` class. `aria-selected` is not used, because it is not valid on rows of a plain table.
- While loading, the region has `aria-busy="true"` and a `role="status"` element outside it announces "Loading". Skeleton rows are `aria-hidden`.
- The column chooser is an APG Menu Button: `aria-haspopup="menu"`, `aria-expanded`, `role="menu"` with `menuitemcheckbox` items (`aria-checked`, `aria-disabled` for columns that cannot be hidden).

## 15. Accessibility notes

- User sort changes are announced politely: "Sorted by Customer, ascending", "Sorted by Dept, ascending, then by Salary, descending", or "Sorting cleared".
- Client-side filter and search changes are announced politely: "Results: 12".
- Sort buttons persist across sorts, so focus stays put. Unchanged rows are neither rebuilt nor moved, so focus inside them survives selection changes, expansion, and refreshes. Filter fields are not overwritten while they have focus.
- Virtual mode keeps the row that holds focus rendered while it scrolls out of the window, so focus never falls back to the document.
- Select all applies to the current page (every row of it in virtual mode). Its state reflects only that page; selections on other pages are kept. Filters do not clear the selection.
- Selected rows are shown by fill and the checked mark, not color alone. Radios show a filled dot.
- Pagination announces the new range ("Showing 11-20 of 57") after a page change.
- Resizing by pointer needs a drag. Its alternatives are keyboard resizing on the focused handle and `columnWidths`/`setState` (WCAG 2.5.7; see Known limitations).
- Each resize handle is a tab stop, so `resizable: true` doubles the header's tab stops.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The table sits in a scroll region (`overflow: auto`) that keyboard users can focus and scroll, so wide tables never force page-level horizontal scrolling (WCAG 1.4.10). With `stickyHeader` (default), the whole head (header and filter rows) is `position: sticky` inside the region; give the region a `max-block-size` (for example `.orders .aui-data-table__region { max-block-size: 60vh; }`) for it to stick on long tables. Pinned columns stay in view while the region scrolls horizontally, which keeps the row identity visible on narrow screens; pin few columns there, because they do not scroll. The search toolbar wraps; filter fields keep a minimum width and scroll with the table. Virtual mode gives the region `max-block-size: 70vh`. The composed Pagination switches to "Page 3 of 10" in narrow containers.

## 17. RTL behavior

Layout uses logical properties and follows the document direction; end-aligned numeric columns align to the left edge in rtl. Pinned columns use `inset-inline-start`/`inset-inline-end`, so start pins sit on the right in rtl and the edge boundary follows. Resize handles sit on each column's inline-end edge; in rtl ArrowLeft widens a column and a drag to the left widens it (the direction is read from the computed style, so `dir` on any ancestor works). The collapsed disclosure chevron is mirrored. The `direction` option is passed to Pagination, which mirrors its chevrons. Sort arrows point up and down and are not mirrored.

## 18. Theme behavior

Colors come from role tokens only. Headers and the filter row use `color-surface-sunken`, hovered rows `color-hover`, and selected rows `color-selected` with `color-selected-text`. Pinned cells get an opaque background that follows the row state (surface, hover, selected) and a `color-border-strong` boundary on the innermost pinned column. Filter and search fields use `color-surface` with a `color-border-strong` boundary; native date and number fields follow the theme's `color-scheme`. Detail rows use `color-surface-sunken`. Selection inputs match Checkbox. In forced-colors mode selected rows get a `Highlight` outline, inputs use `Canvas`, `CanvasText`, and `Highlight`, and resize handles and pinned boundaries use `CanvasText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { dataTable: { selection: 'multiple', pageSize: 50, sortCycle: 'bi-state', multiSort: true, filterDelay: 300 } } });
```

Changes apply to existing instances immediately (rows are rebuilt).

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic. A page size chosen by the user in the rows-per-page select overrides configuration until `update({ pageSize })` is called. View state (sort, filters, search, column order/visibility/widths/pinning, page, page size) can be set with individual options, with `update()`, or all at once with `setState()`.

## 21. Timezone behavior

`datetime` columns expect an `Instant` (or `ZonedDateTime`) and format it with `formatInstant` in the resolved `timezone` (instance, then component, then common configuration; `UTC` by default). The host machine's zone is never used, and a `ZonedDateTime` is also shown in the configured zone so a column never mixes zones. For example, `instant(Date.UTC(2024, 0, 15, 15, 30))` shows "Jan 15, 2024, 3:30 PM" in UTC and "Jan 15, 2024, 10:30 AM" in America/New_York. `date` columns expect a `PlainDate` and never shift. Sorting uses epoch milliseconds (datetime) and calendar fields (date).

Date filters (since 0.3.0) on `datetime` columns compare the calendar date in the configured timezone: `from` and `to` days are converted to the start instants of those days in the zone (`compatible` disambiguation, so a day that starts in a DST gap starts at the first valid time), and a value matches when it falls in `[start of from, start of the day after to)`. So `2024-01-15T03:00Z` matches the day `2024-01-14` in America/New_York but `2024-01-15` in UTC. On `date` columns the filter compares calendar fields only. Raw CSV exports write `YYYY-MM-DD` for dates and ISO 8601 UTC (`Z`) for instants; formatted exports use the configured zone.

## 22. Icon customization points

`icons.sortAscending` (default `arrow-up`), `icons.sortDescending` (`arrow-down`), `icons.sortNone` (`arrow-up-down`), `icons.checked` (`check`), `icons.indeterminate` (`minus`), `icons.loading` (`spinner`), and since 0.3.0 `icons.expand` (`chevron-right`, mirrored in rtl) and `icons.collapse` (`chevron-down`).

## 23. Security behavior

All cell text uses `textContent`. `format()` results and `render()`/`renderDetail()` strings are text, never HTML. Nodes returned by `render()` and `renderDetail()` are consumer-owned and appended as-is, so their safety is the consumer's responsibility. Column widths must match `^\d+(\.\d+)?(px|rem|em|%|ch)$` (the `width` option) or be finite pixel numbers (`columnWidths`); widths, the fixed layout, and pinned offsets (CSS custom properties) are written with `style.setProperty`. CSP-safe, including Trusted Types (no HTML sinks).

CSV export (since 0.3.0) follows RFC 4180: fields that contain the delimiter, a double quote, CR, or LF are quoted and quotes are doubled. Formula injection (OWASP "CSV Injection"): a cell whose text starts with `=`, `+`, `-`, `@`, a tab, or a carriage return is prefixed with a single quote and quoted, so spreadsheet applications show it as text. This applies to headers, `format()` output, text values, and strings from `exportValue`. Numbers the table formats itself (number and currency columns without `format`), raw numbers and booleans, and numbers or booleans returned by `exportValue` are trusted: they cannot carry a formula, so `-5` stays a number. `escapeFormulas: false` disables the protection; use it only for consumers that are not spreadsheets. `toCsv()` and `toCsvBlob()` have no side effects; `downloadCsv()` is the only function that starts a download, through a temporary object URL (revoked after one second) and an `<a download>` element that is removed immediately.

`setState()` treats its input as untrusted (for example parsed from storage or a URL): malformed structure throws `DATA_TABLE_STATE` and leaves the table unchanged.

## 24. Data handling behavior

No persistence, network access, or telemetry. Rows are held by reference and never mutated. In server mode the component only emits events; you fetch data. `getState()` returns a JSON-safe snapshot; storing it (for example in `localStorage`) is your choice, and it contains filter and search text the user typed. CSV exports contain whatever the chosen columns show; exclude sensitive columns with `exportable: false`.

## 25. Performance characteristics

- Rows are built into a `DocumentFragment` on first render. Afterwards row elements are reused by row id while the row object and rendering inputs (columns, column layout, locale, timezone, selection mode, configuration) are unchanged; unchanged rows are not moved.
- Only the current page (or, in virtual mode, the rows in view plus 6 rows of overscan on each side, at most 300) is in the DOM.
- Sorted order is cached until rows, sorts, columns, or locale change, so paging and filtering do not re-sort. Filtered rows are cached until the sorted rows, filters, or search change.
- Sort keys are computed once per row and sort column. Text keys are ranked once with one `Intl.Collator` (`numeric: true`) per locale, so multi-column comparisons are numeric.
- Text filters and search use a per-column cache of the lower-cased displayed text (built on first use, invalidated when rows, columns, locale, timezone, or configuration change).
- Delegated listeners on the head, the body, the toolbar, and the region; one Pagination listener; one configuration subscription; one shared ResizeObserver entry for the region and one per pinned header cell. Filter typing is debounced (`filterDelay`).
- Resizing and pinning read layout (header cell widths) only when those features are in use.
- Budgets (headless Chromium, e2e performance test; sort, filter, and CSV figures are the median of 5): rendering 1,000 rows x 8 columns with `pageSize: null` under 150 ms; sorting 10,000 rows with `pageSize: 25` under 100 ms for text columns and under 50 ms for numeric columns; multi-column sort (text then number) of 10,000 rows under 120 ms; filtering 10,000 rows under 50 ms; creating a virtual table of 100,000 rows under 200 ms and re-rendering its window after a scroll under 16 ms (median of 10 jumps); `toCsv()` of 10,000 rows x 8 columns under 150 ms. For larger client-side data sets, sort and filter on the server (`mode: 'server'`).

## 26. Supported data scale

Client mode is tested with 10,000 rows paged (filtering, multi-sort, CSV), 1,000 rows x 8 columns rendered at once, and 100,000 rows with `virtual: true`. Virtual scrolling is bounded by the browser's maximum element height (about 33,000,000 px in Chromium, roughly 800,000 rows of 40 px). For larger sets, use server mode. Page counts follow Pagination (any integer).

## 27. Usage examples

```ts
import { DataTable } from '@absoluteui/components/data-table';

const host = document.createElement('div');
document.body.append(host);
DataTable.create(host, {
  caption: 'Users',
  rows: [{ id: 'u1', name: 'Ada', logins: 42 }],
  rowId: (u) => u.id,
  multiSort: true,
  searchable: true,
  columns: [
    { id: 'name', header: 'Name', accessor: (u) => u.name, filter: 'text' },
    { id: 'logins', header: 'Logins', accessor: (u) => u.logins, type: 'number', filter: 'number' },
  ],
});
```

More examples, type-checked in CI: `metadata/data-table/examples.json` (client mode with typed columns, server mode, custom cells, and since 0.3.0 the full grid with column chooser, CSV export, and saved state; server mode with filters as one query; virtual scrolling of 100,000 rows).

## 28. Edge cases

- `null`, `undefined`, `NaN`, and values that do not match the column type render as empty cells, sort last in both directions, and never match number or date ranges.
- Equal sort keys keep their original order (stable sort), also across several sort columns.
- Text sorting is locale-aware with numeric collation: "Item 2" sorts before "Item 10".
- A custom `compare` receives rows and is negated for descending; nulls-last handling is then up to the comparator.
- A sort on a column that is removed or made unsortable by `update({ columns })` is dropped; so are filters the new columns cannot take, and hidden, width, order, and pin entries of removed columns.
- A plain (non-Shift) sort activation while sorting by several columns sorts by that column only, continuing its own cycle (a descending secondary column becomes unsorted in tri-state).
- Filters on hidden columns stay active; the search only covers visible, searchable columns.
- A programmatic enum filter with several values shows "n selected" in the filter row; choosing an option there replaces it.
- Shrinking `rows` or filtering clamps the page. `total: 0` or no matching rows shows the empty message and hides the pagination.
- `update({ selection: 'none' })` clears the selection; switching to `'single'` keeps the most recent id.
- Server mode keeps selected and expanded ids from other pages; call `clearSelection()` when the data set changes.
- Shift+click with no anchor on the current page (for example after paging) selects just that row and sets the anchor.
- The first resize switches the table to a fixed layout with every header's measured width; after a column is shown or hidden the layout is measured again (resized widths are kept). Widths are border-box pixels.
- `pinnedColumns` entries for hidden columns are ignored while hidden. Start pins also pin the selection and disclosure columns, which sit at the start edge.
- `hiddenColumns` must leave one column visible; a `setState` snapshot that would hide every column keeps all columns visible.
- A detail row renders its content once per row object; `setRows` with new row objects renders it again for expanded rows.
- Virtual mode with a region that has no bounded height renders at most 300 rows; bound the region.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `DATA_TABLE_OPTIONS` | configuration | Empty `caption`; empty `columns`; duplicate or empty column `id`; empty `header`; missing `accessor`; unknown `type` or `align`; `currency` column without an ISO 4217 code; invalid `width`; more than one `rowHeader: true`; `sort` on an unknown or unsortable column, or a column twice; invalid `selected`, `pageSizes`, `page`, `mode`, `total`, `loading`, or `emptyMessage`; a `pageSize` not in `pageSizes`; more than one `selected` id with single selection; server mode without `total` while paged. Since 0.3.0: a `filter` kind the column type cannot take, `filterOptions` without an enum filter, invalid `minWidth`/`maxWidth`/booleans on a column; `filters` for unknown columns or of the wrong type; invalid `search`, `hiddenColumns` (unknown ids, or all columns), `columnOrder`, `columnWidths`, `pinnedColumns` (unknown ids, or a column on both edges), `renderDetail`, `isRowExpandable`, `expanded`, `rowHeight`; `virtual` together with `renderDetail`; a column chooser without a DataTable. |
| `DATA_TABLE_ROW_ID` | configuration | `rowId` returned an empty or non-string value, or two rows share an id. |
| `DATA_TABLE_STATE` | configuration | Since 0.3.0. `setState` input that is not a `version: 1` state object, or whose parts have the wrong structure. The table is unchanged. |
| `DATA_TABLE_CSV` | configuration | Since 0.3.0. Invalid `toCsv` options (unknown column id, delimiter, rows, values, line ending) or an empty `downloadCsv` file name. |
| `MENU_TRIGGER` | configuration | The column chooser trigger is not a `<button>` attached to the document. |
| `CFG_INVALID_VALUE` | configuration | Invalid `selection`, `pageSize`, `stickyHeader`, `sortCycle`, `multiSort`, `filterDelay`, `locale`, `timezone`, `density`, or `direction`. |

A failed construction (including an exception thrown by a consumer `render`/`format`) leaves no rendering, listeners, or subscriptions behind. A failed `update` or `setState` leaves the previous state in place.

## 30. Known limitations

- Plain table semantics: no cell-by-cell arrow-key navigation or cell selection. Inline editing opens one editor at a time, and editable cells are tab stops.
- No column reorder by drag, nested grids, or infinite scrolling. Column order is programmatic (`columnOrder`, `setState`). Grouping and aggregation run in client mode only and not with `virtual`.
- Pointer resizing needs a drag; the alternatives are the keyboard handle and `columnWidths`/`setState` (WCAG 2.5.7 is met through those alternatives; flagged for accessibility review).
- Enum filters in the filter row choose one value; several values are programmatic.
- Text filters and search are case-insensitive substring matches on displayed text; accents and punctuation are significant.
- Filters and search are not applied in server mode; the consumer applies them.
- Virtual rows are single-line (`white-space: nowrap`) and must share one height; virtual mode cannot be combined with row expansion.
- Select all covers the current page only; there is no "select all N results". Filters do not change the selection.
- Range selection works within the current page.
- The sticky header needs a `max-block-size` on the region to stick on long tables.
- The scroll region is always a tab stop; each resize handle and each editable cell is a tab stop.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- ARIA grid semantics and arrow-key cell navigation.
- Infinite scrolling and lazily loaded virtual windows.
- HTML strings in cells or detail rows.
- `virtual: true` with `renderDetail`.

## 32. TypeScript definitions

```ts
type DataTableColumnType = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean';
interface DataTableSort { column: string; direction: 'ascending' | 'descending' }
type DataTableFilter =
  | { type: 'text'; value: string; operator?: 'contains' | 'equals' | 'startsWith' }
  | { type: 'number'; min?: number | null; max?: number | null }
  | { type: 'date'; from?: string | null; to?: string | null }
  | { type: 'enum'; values: readonly string[] };
interface DataTableColumn<Row> {
  id: string; header: string; accessor: (row: Row) => unknown;
  type?: DataTableColumnType; currency?: string;
  format?: (value: unknown, row: Row) => string;
  render?: (row: Row, doc: Document) => Node | string;
  sortable?: boolean; compare?: (a: Row, b: Row) => number;
  align?: 'start' | 'end' | 'center'; width?: string; rowHeader?: boolean;
  filter?: 'text' | 'number' | 'date' | 'enum'; filterOptions?: readonly { value: string; label: string }[];
  searchable?: boolean; hideable?: boolean; resizable?: boolean; minWidth?: number; maxWidth?: number;
  exportable?: boolean; exportValue?: (row: Row) => string | number | boolean | null;
}
interface DataTableState {
  version: 1;
  sort: DataTableSort[];
  filters: Record<string, DataTableFilter>;
  search: string;
  columns: { order: string[]; hidden: string[]; widths: Record<string, number>; pinned: { start: string[]; end: string[] } };
  page: number;
  pageSize: number | null;
}
interface DataTableSortChangeDetail { sort: DataTableSort | null; sorts: DataTableSort[] }
interface DataTableSelectionChangeDetail { selected: string[] }
interface DataTablePageChangeDetail { page: number; pageSize: number }
interface DataTableFilterChangeDetail { filters: Record<string, DataTableFilter>; search: string }
interface DataTableColumnsChangeDetail { column: string; reason: 'visibility' | 'resize'; columns: DataTableState['columns'] }
interface DataTableExpandChangeDetail { id: string; expanded: boolean; expandedIds: string[] }
class DataTable<Row> {
  static create<Row>(host: HTMLElement, options: DataTableOptions<Row>): DataTable<Row>;
  getState(): DataTableState;
  setState(state: DataTableStateInput): void;
  toCsv(options?: DataTableCsvOptions): string;
  toCsvBlob(options?: DataTableCsvOptions): Blob;
}
class DataTableColumnChooser<Row> {
  static create<Row>(trigger: HTMLButtonElement, table: DataTable<Row>, options?: DataTableColumnChooserOptions): DataTableColumnChooser<Row>;
}
function downloadCsv(csv: string | Blob, filename: string, doc?: Document): void;
```

## 33. Vanilla JS example

```ts
import { DataTable, DataTableColumnChooser, downloadCsv, type DataTableSelectionChangeDetail } from '@absoluteui/components/data-table';
import '@absoluteui/components/pagination/style.css';
import '@absoluteui/components/menu/style.css';
import '@absoluteui/components/data-table/style.css';

interface Invoice { id: string; customer: string; amount: number; overdue: boolean }

const host = document.querySelector<HTMLElement>('#invoices');
const deleteButton = document.querySelector<HTMLButtonElement>('#delete-selected');
const columnsButton = document.querySelector<HTMLButtonElement>('#columns');
const exportButton = document.querySelector<HTMLButtonElement>('#export');
if (host && deleteButton && columnsButton && exportButton) {
  let invoices: Invoice[] = [
    { id: 'i-1', customer: 'Acme Corp', amount: 1250.5, overdue: false },
    { id: 'i-2', customer: 'Globex', amount: 310, overdue: true },
  ];
  const table = DataTable.create<Invoice>(host, {
    caption: 'Invoices',
    selection: 'multiple',
    searchable: true,
    rows: invoices,
    rowId: (i) => i.id,
    columns: [
      { id: 'customer', header: 'Customer', accessor: (i) => i.customer, filter: 'text' },
      { id: 'amount', header: 'Amount', accessor: (i) => i.amount, type: 'currency', currency: 'USD', filter: 'number' },
      { id: 'overdue', header: 'Overdue', accessor: (i) => i.overdue, type: 'boolean', filter: 'enum' },
    ],
  });
  DataTableColumnChooser.create(columnsButton, table);
  exportButton.addEventListener('click', () => {
    downloadCsv(table.toCsv({ rows: 'filtered' }), 'invoices.csv');
  });
  host.addEventListener('aui-selection-change', (event) => {
    deleteButton.disabled = (event as CustomEvent<DataTableSelectionChangeDetail>).detail.selected.length === 0;
  });
  deleteButton.addEventListener('click', () => {
    const doomed = new Set(table.getSelected());
    invoices = invoices.filter((i) => !doomed.has(i.id));
    table.setRows(invoices);
    deleteButton.disabled = true;
  });
}
```

## 34. Angular example

```ts
import { Component, signal } from '@angular/core';
import { AuiDataTable, AuiDataTableColumnChooser } from '@absoluteui/angular/data-table';
import { AuiButton } from '@absoluteui/angular/button';
import type { DataTableColumn, DataTableFilter, DataTableFilterChangeDetail, DataTableSort } from '@absoluteui/components/data-table';

interface User { id: string; name: string; email: string }

/** Server mode: the table reports sort, paging, and filters; the component loads the page. */
@Component({
  selector: 'app-users-table',
  imports: [AuiDataTable, AuiDataTableColumnChooser, AuiButton],
  template: `<button type="button" auiButton [auiDataTableColumnChooser]="users">Columns</button>
    <aui-data-table #users="auiDataTable" caption="Users" mode="server" selection="multiple" [multiSort]="true" [searchable]="true"
      [columns]="columns" [rows]="rows()" [rowId]="rowId" [total]="total()" [loading]="loading()" [pageSizes]="[25, 50, 100]"
      [(sort)]="sort" [(page)]="page" [(pageSize)]="pageSize" [(selected)]="selected"
      (sortChange)="load()" (pageChange)="load()" (pageSizeChange)="load()" (filterChange)="onFilter($event)" />`,
})
export class UsersTableComponent {
  readonly columns: DataTableColumn<User>[] = [
    { id: 'name', header: 'Name', accessor: (u) => u.name, filter: 'text' },
    { id: 'email', header: 'Email', accessor: (u) => u.email, filter: 'text' },
  ];
  readonly rows = signal<User[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly sort = signal<DataTableSort | readonly DataTableSort[] | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal<number | null>(25);
  readonly selected = signal<readonly string[]>([]);
  filters: Readonly<Record<string, DataTableFilter>> = {};
  search = '';
  readonly rowId = (u: User): string => u.id;

  onFilter(change: DataTableFilterChangeDetail): void {
    this.filters = change.filters;
    this.search = change.search;
    this.page.set(1);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    // Request the page for this.sort(), this.page(), this.pageSize(), this.filters, and this.search,
    // then set rows, total, and loading.
  }
}
```

The column chooser directive takes the table directive (`#users="auiDataTable"`); declare the table before or after the button in the same template.

## 35. React example

```tsx
import { type DataTableColumn } from '@absoluteui/components/data-table';
import { AuiDataTable } from '@absoluteui/react/data-table';

interface Person { id: string; name: string; age: number }
const columns: DataTableColumn<Person>[] = [{ id: 'name', header: 'Name', accessor: (p) => p.name }, { id: 'age', header: 'Age', accessor: (p) => p.age, type: 'number' }];
const rows: Person[] = [{ id: '1', name: 'Ada', age: 36 }];

export function Example() {
  return <AuiDataTable<Person> caption="People" columns={columns} rows={rows} rowId={(r) => r.id} multiSort searchable />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

Column chooser (since 0.3.0): keep the table controller in state and pass it to `AuiDataTableColumnChooser` from `@absoluteui/react/data-table-column-chooser`: `const [table, setTable] = useState<DataTable<Person> | null>(null);` then `<AuiDataTable ref={setTable} ... />` and `<AuiDataTableColumnChooser table={table}>Columns</AuiDataTableColumnChooser>`.

## 36. Vue example

```vue
<script setup lang="ts">
import { type DataTableColumn } from '@absoluteui/components/data-table';
import { AuiDataTable } from '@absoluteui/vue/data-table';
interface Person { id: string; name: string; age: number }
const columns: DataTableColumn<Person>[] = [{ id: 'name', header: 'Name', accessor: (p) => p.name }, { id: 'age', header: 'Age', accessor: (p) => p.age, type: 'number' }];
const rows: Person[] = [{ id: '1', name: 'Ada', age: 36 }];
</script>

<template>
  <AuiDataTable caption="People" :columns="columns" :rows="rows" :row-id="(r) => r.id" multi-sort searchable />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

Column chooser (since 0.3.0): `<AuiDataTable ref="grid" ... />` and `<AuiDataTableColumnChooser :table="grid?.controller ?? null">Columns</AuiDataTableColumnChooser>` from `@absoluteui/vue/data-table-column-chooser`.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
