# Pivot Grid

> Package: `@absoluteui/components/pivot-grid` | Styles: `@absoluteui/components/pivot-grid/style.css` | Since 0.5.0 | Status: R3

## 1. Purpose

A pivot table for exploring records. `PivotGrid` groups records by row fields and column fields and aggregates value fields (sum, count, average, minimum, maximum, distinct count). The result is a real `<table>` with nested column headers, indented row groups that carry their subtotal (compact form), column group subtotals, and grand totals. Users expand and collapse groups, sort members by label or by a value column, and filter any field by its members.

Data comes from a `PivotDataSource`. `data` aggregates records in the browser with the local engine; `dataSource` delegates aggregation to a server through the same query contract, and groups load lazily when they are expanded. Requests are cancellable and time out. The layout (fields per area, aggregates, member filters, sort, expansion) is serializable and reported with `aui-layout-change`.

The same subpath exports `PivotFieldList` (users move fields between Rows, Columns, Values, and Filters by pointer, keyboard, or single pointer, choose aggregates, and filter members), `createLocalPivotSource` (the engine on its own), and `downloadCsv`. `toMatrix()` hands the visible pivot to charts; `toCsv()` exports it.

## 2. Anatomy

```text
<div class="aui-pivot aui-pivot--comfortable aui-pivot--sticky [--virtual]">                (consumer host)
  <div class="aui-pivot__region" role="region" tabindex="0" aria-labelledby="{caption id}">
    <table class="aui-pivot__table" [aria-busy="true"] [aria-rowcount]>
      <caption class="aui-pivot__caption [--hidden]">Sales</caption>
      <thead class="aui-pivot__head">
        <tr>  <th class="aui-pivot__corner" scope="col" rowspan="..." aria-sort="ascending"><button class="aui-pivot__sort">Region / City</button>
              <th class="aui-pivot__col-header" scope="colgroup" colspan="..."><button class="aui-pivot__toggle" aria-expanded="true">Q1</button>
              <th class="aui-pivot__col-header aui-pivot__col-header--total" rowspan="...">Q1 total
              <th class="aui-pivot__col-header aui-pivot__col-header--total">Grand total
        <tr>  <th class="aui-pivot__value-header" scope="col"><button class="aui-pivot__sort">Sum of Amount</button> ...
      <tbody class="aui-pivot__body">
        <tr class="aui-pivot__row aui-pivot__row--group">
          <th class="aui-pivot__row-header" scope="row" style="--aui-pivot-level: 0"><button class="aui-pivot__toggle" aria-expanded="true">North</button>
          <td class="aui-pivot__cell" headers="{column header ids} {row header id}">€180.00 ...
        <tr class="aui-pivot__row">
          <th class="aui-pivot__row-header" scope="row"><span class="aui-pivot__path">North, </span><span>Oslo</span>
        <tr class="aui-pivot__row aui-pivot__row--total"> <th>Grand total ...

<div class="aui-pivot-fields" role="group" aria-label="{label}">                             (field list host)
  <div class="aui-pivot-fields__area aui-pivot-fields__area--available"> <div class="…__title">Fields</div> <ul class="…__list">
  <div class="aui-pivot-fields__areas"> (Filters, Columns, Rows, Values areas, each a titled <ul>)
    <li class="aui-pivot-fields__entry [--grabbed]">
      <button class="aui-pivot-fields__handle" aria-pressed="false" aria-label="Move Region" aria-describedby="{instructions}">
      <span class="aui-pivot-fields__label">Region</span>
      <button class="aui-pivot-fields__filter" aria-expanded="false"> | <select class="aui-pivot-fields__aggregate" aria-label="Aggregate of Amount">
      <button class="aui-pivot-fields__remove" aria-label="Remove Region">
      [<div class="aui-pivot-fields__panel"> search, member checkboxes, Show more, Select all, Clear, Apply, Cancel]
  <p class="aui-pivot-fields__instructions">To move a field, press Space or Enter on its handle...</p>
```

## 3. When to use

- Summarizing many records by two dimensions (region by quarter) with totals and drill-down.
- Letting users explore a data set by choosing row, column, and value fields themselves (with `PivotFieldList`).
- Server-side aggregation over data too large for the browser (`dataSource`, `expandDepth: 0`).

## 4. When not to use

- Listing individual records with sorting and paging: use Data Table.
- A fixed summary that never changes shape: a Data Table over pre-aggregated rows is simpler.
- Editing cells or formulas like a spreadsheet.

## 5. Public properties

`PivotGridOptions<Row>`:

| Option | Type | Default | Notes |
|---|---|---|---|
| `caption` | `string` | required | Visible caption; names the table and the scroll region. |
| `hideCaption` | `boolean` | `false` | Caption for assistive technology only. |
| `fields` | `readonly PivotField<Row>[]` | required | `{ id, label, value?, formatMember?, numberFormat?, areas?, aggregate? }`. `value(row)` returns the grouping or aggregation value (default `row[id]`). |
| `data` | `readonly Row[]` | - | Records for the local engine. Exactly one of `data` or `dataSource`. |
| `dataSource` | `PivotDataSource` | - | `{ query(query, signal), members(request, signal) }` (see section 32). |
| `layout` | `PivotLayoutInput` | required | `{ rows, columns, values, filters?, include?, sort?, expanded? }`. |
| `virtual` | `boolean` | `false` | Render only the rows in view. |
| `rowHeight` | `number` | `40` | Virtual row height estimate (16..200); measured after rendering. |
| `emptyMessage` | `string` | "No data" | Body text when nothing matches. |
| `grandTotals` | `'both' \| 'rows' \| 'columns' \| 'none'` | `'both'` | Global. |
| `columnSubtotals` | `boolean` | `true` | Global. Total column after each expanded column group. |
| `expandDepth` | `number` | `16` | Global. Levels expanded when the layout has no `expanded` (0 = top level only). |
| `requestTimeoutMs` | `number` | `30000` | Global. Timeout of each data source request. |
| `stickyHeader` | `boolean` | `true` | Global. |
| `locale`, `density`, `direction` | | common | Inherited common options. |

Controller properties: `host`, `table`, `layout` (serializable copy with explicit `expanded`), `fields`, `loading`, `ready` (a promise for the loads started by the last change). `PivotFieldList` has `host`.

## 6. Methods

| Method | Description |
|---|---|
| `PivotGrid.create(host, options)` | Validate, render, and start loading. |
| `update(options)` | Merge options. `data`, `dataSource`, `fields`, `layout`, or `expandDepth` reload; no event. |
| `setLayout(layout)` | Replace the layout and reload; emits `aui-layout-change` (`layout`, or `filter` when only `include` changed). A changed field list resets the expansion to `expandDepth`. |
| `setFilter(field, include \| null)` | Included members of a field; reloads; emits `filter`. |
| `sort(axis, sort \| null)` | Sort members within each group by label or value; emits `sort`. |
| `setExpanded(axis, path, expanded)` | Expand (loading children on first expansion) or collapse a group; emits `expand` / `collapse`. |
| `expandAll(axis, expanded)` | Expand every group level by level, or collapse all. |
| `members(field, { search, offset, limit })` | A page of members with labels (for filter lists). |
| `memberLabel(field, key)` / `valueLabel(index)` | Display texts. |
| `reload()` | Discard loaded cells and reload (the Retry button calls it). |
| `toMatrix()` | Visible rows, columns (split by value), and values for charts. |
| `toCsv(options)` | CSV of the visible pivot (formula injection escaped). |
| `destroy()` | Abort requests; remove everything the grid added. |
| `PivotFieldList.create(host, { grid, label, memberPageSize?, locale?, direction? })` | Field list bound to a grid. `update()`, `destroy()`. |
| `createLocalPivotSource(rows, fields, { locale })` | The local engine: `query`, `members`, synchronous `compute`, `setRows`. |
| `downloadCsv(csv, filename)` | Save CSV text through a temporary object URL. |

## 7. Events

| Event | Detail | Notes |
|---|---|---|
| `aui-layout-change` | `PivotGridLayoutChangeDetail { reason: 'layout' \| 'sort' \| 'filter' \| 'expand' \| 'collapse'; layout }` | Save `detail.layout`. Not emitted by `update()`. |
| `aui-load-error` | `PivotGridLoadErrorDetail { error; request: 'query' \| 'members' }` | Failed, timed-out, or invalid data source answers. Superseded requests do not report. |
| `aui-field-move` (field list host) | `PivotFieldMoveDetail { field; from; to; index }` | After a move or removal was applied to the grid. |

All events bubble and are not cancelable.

## 8. Slots/content areas

None. The grid renders every cell itself; labels come from `label`, `formatMember`, and the value field names.

## 9. CSS parts/hooks

| Class | Part |
|---|---|
| `aui-pivot`, `--compact`, `--comfortable`, `--spacious`, `--sticky`, `--virtual` | Host and modifiers |
| `aui-pivot__region` | Scroll region; set `max-block-size` to keep headers in view |
| `aui-pivot__corner`, `__col-header[--total]`, `__value-header[--total]` | Header cells |
| `aui-pivot__row[--group\|--total]`, `__row-header`, `__cell[--total]` | Body |
| `aui-pivot__toggle`, `__sort`, `__status[--error]`, `__retry` | Controls and states |
| `aui-pivot-fields__*` | Field list parts (see `metadata/pivot-grid/api.json`) |

Custom property: `--aui-pivot-level` (row header indentation, set per row through the CSSOM).

## 10. Design tokens

See `metadata/pivot-grid/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-surface-sunken` (headers, grand total row), `color-border`, `border-width-strong` (total rule), `font-weight-semibold` (totals), `color-selected`, `color-selected-text` (grabbed field, active filter), `color-focus-ring` (drop marker), `space-5` (indentation step), `touch-target-min`.

## 11. States

Loading (`aria-busy`, "Loading"), loaded, group loading (toggle `aria-busy`), expanded or collapsed groups, sorted by label or value, filtered, empty ("No data"), no values ("Add a field to Values to see results."), load error with Retry, virtual. Field list: field grabbed, dragging, filter panel open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| created | first query resolves | loaded (expanded to `expandDepth`, level by level) |
| created | first query fails or times out | error with Retry (`aui-load-error`) |
| error | Retry / `reload()` | loading, then loaded |
| collapsed group | toggle / `setExpanded(..., true)` | loading (first time), then expanded (`expand`) |
| expanded group | toggle / `setExpanded(..., false)` | collapsed (`collapse`); cells stay cached |
| loaded | `setLayout` / `setFilter` / field list drop | loading, then loaded (`layout` / `filter`) |
| loaded | sort button / `sort()` | re-ordered, no reload (`sort`) |
| field idle | handle Enter/Space or click | grabbed (arrows move it) |
| grabbed | Enter/Space, Tab, click on a list | dropped, layout applied |
| grabbed | Escape | cancelled |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Grid | Scroll region, then corner sort, column toggles, value sort buttons, row toggles in reading order. |
| Enter / Space | Expand button | Toggle the group (focus stays on the button). |
| Enter / Space | Corner sort | Ascending / descending member labels. |
| Enter / Space | Value sort | Descending, ascending, off. |
| Arrow keys, Page Up/Down, Home/End | Scroll region | Scroll. |
| Enter / Space | Field handle | Grab or drop the field. |
| ArrowUp / ArrowDown | Field grabbed | Reorder within its list. |
| ArrowLeft / ArrowRight | Field grabbed | Previous / next list (Fields, Filters, Columns, Rows, Values; mirrored in RTL), skipping lists the field is not allowed in. |
| Home / End | Field grabbed | Start / end of the list. |
| Escape | Field grabbed / filter panel | Cancel the move / close the panel without applying. |
| Tab | Field grabbed | Drop and move on. |

## 14. ARIA contract

- The region is `role="region"` with `tabindex="0"`, named by the caption.
- Column headers are `th scope="col"` (`scope="colgroup"` for expanded groups); row headers are `th scope="row"`; every `td` lists all its header ids in `headers` (group, member or total, value, row).
- Toggles carry `aria-expanded` (and `aria-busy` while loading); the table carries `aria-busy` while any request runs.
- The sorted header carries `aria-sort`; the corner is `ascending` by default.
- Virtual mode sets `aria-rowcount` on the table and `aria-rowindex` on rendered rows.
- Field list: `role="group"`; lists named by their titles; handles are toggle buttons (`aria-pressed`) described by the instructions; filter toggles are disclosures (`aria-expanded`, `aria-controls`); member checkboxes sit in a fieldset with a hidden legend.

## 15. Accessibility notes

- Nested row headers include their group path as visually hidden text ("North, Oslo"), so a row is identified even when its group row is scrolled away.
- Totals differ by weight and a stronger rule, not by color alone.
- Moving fields never requires dragging: keyboard grab plus arrow keys, or click the handle and then click the target list (WCAG 2.5.7).
- Announcements: grabbed, moved, dropped, cancelled, not allowed, load failed (assertive); sort changes (polite).
- Manual screen-reader verification (NVDA, JAWS, VoiceOver) is pending.

## 16. Responsive behavior

The table scrolls inside its region in both directions; column headers stick to the top and row headers to the inline start, so wide pivots reflow at 320 px (WCAG 1.4.10). The field list's four areas use an auto-fit grid (minimum 12rem) and stack on narrow screens. All controls are at least `touch-target-min`.

## 17. RTL behavior

The table follows the document direction; row headers sit and stick at the inline start. With `direction: 'rtl'` the collapsed chevron points left. In the field list ArrowLeft/ArrowRight are mirrored.

## 18. Theme behavior

Headers and the grand total row use `color-surface-sunken`; totals are semibold with a `border-width-strong` rule. Sort icons are muted until active. Grabbed fields and active filters use `color-selected` with `color-selected-text` and a border. Forced colors: Highlight/HighlightText for grabbed and filtered states.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { pivotGrid: { grandTotals: 'rows', columnSubtotals: false, expandDepth: 1, requestTimeoutMs: 20_000, stickyHeader: true }, pivotFieldList: { memberPageSize: 100 } } });
```

Global options: `grandTotals`, `columnSubtotals`, `expandDepth`, `requestTimeoutMs`, `stickyHeader`, plus inherited `locale`, `density`, `direction`. Field list: `memberPageSize` (5..1000, default 50), `locale`, `direction`. Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults. All options are dynamic through `update()`; `data`, `dataSource`, `fields`, `layout`, and `expandDepth` reload.

## 21. Timezone behavior

Not applicable. Dates group by the keys the field's `value` accessor returns: derive `'2026-09'`, years, or quarters there in the time zone the application chooses. `Date` values without an accessor group by their ISO instant.

## 22. Icon customization points

Expand toggle: `chevron-right` (`chevron-left` in RTL) / `chevron-down`. Sort: `arrow-up-down`, `arrow-up`, `arrow-down`. Field list: `grip`, `filter`, `close`. Replace them through the icon provider (SPEC section 7).

## 23. Security behavior

Every label, member, and value renders through `textContent`; there is no HTML input. Layouts and data source answers are validated before use (`PIVOT_GRID_OPTIONS`, `PIVOT_DATA_SOURCE`), so saved layouts and server responses cannot inject structure or break rendering. Styles are written through the CSSOM only (CSP-safe). CSV export escapes formula injection (`=`, `+`, `-`, `@`, tab, carriage return) unless `escapeFormulas: false`. Requests carry an `AbortSignal` and time out.

## 24. Data handling behavior

No persistence, network access, or telemetry of its own. The local engine aggregates in memory; with a `dataSource`, the application's functions make every request. Values never appear in error messages. Superseded and destroyed requests are aborted and their answers ignored.

## 25. Performance characteristics

The local engine aggregates in one pass over the filtered records per query and reads only the field levels a query needs (a top-level query ignores deeper fields). Expansions are delta queries (one level under the new parent). Cells are cached per layout; collapsing never queries. Virtual mode renders the visible rows plus an overscan of 6 (at most 300). Budgets (e2e): 100,000 records to ready < 600 ms; expanding a group < 250 ms; a virtual scroll step with 5,000 rows < 50 ms.

## 26. Supported data scale

Tested with 100,000 records locally and 5,000 visible rows in virtual mode. Keep visible value columns to about 100 (columns are not virtualized). Without `virtual`, more than about 1,000 visible rows slows rendering. For larger data use a server `dataSource` with `expandDepth: 0`.

## 27. Usage examples

See section 33 and `metadata/pivot-grid/examples.json`: local engine, server data source with lazy groups, field list with a saved layout, CSV and chart data, global configuration.

## 28. Edge cases

- Records whose grouping value is `null`, `undefined`, or `''` group under "(blank)", which stays last in both sort directions.
- Values that are not finite numbers are ignored by sum, average, min, and max; count and distinct count count every non-empty value.
- An empty layout (no values) shows "Add a field to Values to see results."; no row fields shows a single "Grand total" row; no column fields shows one column per value.
- Filters that remove every member of an expanded group drop that group from the expansion.
- Sorting by value compares the chosen column (default the grand total column); blank cells sort last.
- `update({ data })` with the same array instance does not reload; call `reload()` after mutating records in place.
- A value sort button cycles descending, ascending, off.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `PIVOT_GRID_OPTIONS` | configuration | Empty caption; invalid or duplicate fields; both or neither of `data` and `dataSource`; invalid layout (unknown field, a field used twice, unknown aggregate, invalid sort or expanded paths); invalid `rowHeight`, `members()` limits. |
| `PIVOT_DATA_SOURCE` | configuration | A data source answer with the wrong shape or non-finite values (reported through `aui-load-error`). |
| `PIVOT_FIELD_LIST_OPTIONS` | configuration | Field list without a Pivot Grid, empty label, invalid `memberPageSize`. |
| `DATA_TABLE_CSV` | configuration | Invalid `toCsv()` options or an empty `downloadCsv()` file name (shared CSV writer). |

A failed construction leaves the host untouched. Rejected or timed-out requests show the error state (initial load) or keep the group collapsed (expansion) and emit `aui-load-error`.

## 30. Known limitations

- Compact form only (subtotals on group rows); no tabular or outline forms.
- Columns are not virtualized.
- A query returns every child of a requested group (no paging of group children).
- Six built-in aggregates; no calculated fields or percentage-of-total displays.
- Member filters are include lists (no label or value conditions such as "top 10").
- Cells are not individually focusable (not an ARIA grid).
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Editing values or write-back.
- Built-in pivot charts (use `toMatrix()` with Bar Chart or Line Chart).
- MDX/XMLA or other OLAP protocols (implement a `PivotDataSource` over them).
- Drill-through to underlying records.

## 32. TypeScript definitions

```ts
type PivotKey = string | number | boolean | null;
type PivotPath = readonly PivotKey[];
type PivotAggregate = 'sum' | 'count' | 'average' | 'min' | 'max' | 'distinctCount';
type PivotArea = 'rows' | 'columns' | 'values' | 'filters';
interface PivotField<Row> { id: string; label: string; value?: (row: Row) => unknown; formatMember?: (key: PivotKey) => string; numberFormat?: Intl.NumberFormatOptions; areas?: readonly PivotArea[]; aggregate?: PivotAggregate }
interface PivotValue { field: string; aggregate: PivotAggregate }
type PivotSort = { by: 'label'; direction: 'ascending' | 'descending' } | { by: 'value'; value: number; column?: PivotPath; direction: 'ascending' | 'descending' };
interface PivotLayout { rows: string[]; columns: string[]; values: PivotValue[]; filters: string[]; include: Record<string, PivotKey[]>; sort: { rows: PivotSort | null; columns: PivotSort | null }; expanded: { rows: PivotKey[][]; columns: PivotKey[][] } | null }
interface PivotQuery { rows: readonly string[]; columns: readonly string[]; values: readonly PivotValue[]; include: Readonly<Record<string, readonly PivotKey[]>>; rowParents: readonly PivotPath[]; columnParents: readonly PivotPath[] }
interface PivotCell { row: PivotPath; column: PivotPath; values: readonly (number | null)[] }
interface PivotDataSource {
  query(query: PivotQuery, signal: AbortSignal): Promise<{ cells: readonly PivotCell[] }>;
  members(request: { field: string; include: Readonly<Record<string, readonly PivotKey[]>>; search: string; offset: number; limit: number }, signal: AbortSignal): Promise<{ members: readonly { key: PivotKey; label?: string }[]; total: number }>;
}
interface PivotMatrix { rows: PivotMatrixHeader[]; columns: PivotMatrixColumn[]; values: (number | null)[][] }
```

The query contract: answer one cell for every combination of a requested row path and a requested column path that has records. Requested row paths are every path in `rowParents` plus its children one level deeper (`[]` is the grand total and the top level); columns likewise. Every cell holds the values in `layout.values` order.

## 33. Vanilla JS example

```ts
import { PivotFieldList, PivotGrid, type PivotGridLayoutChangeDetail } from '@absoluteui/components/pivot-grid';
import '@absoluteui/components/pivot-grid/style.css';

interface Sale { region: string; city: string; quarter: string; amount: number }
const sales: Sale[] = [
  { region: 'North', city: 'Oslo', quarter: 'Q1', amount: 1200 },
  { region: 'South', city: 'Rome', quarter: 'Q2', amount: 900 },
];

const gridHost = document.querySelector<HTMLElement>('#pivot');
const fieldsHost = document.querySelector<HTMLElement>('#pivot-fields');
if (gridHost && fieldsHost) {
  const grid = PivotGrid.create(gridHost, {
    caption: 'Sales',
    fields: [{ id: 'region', label: 'Region' }, { id: 'city', label: 'City' }, { id: 'quarter', label: 'Quarter' }, { id: 'amount', label: 'Amount' }],
    data: sales,
    layout: { rows: ['region', 'city'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] },
  });
  PivotFieldList.create(fieldsHost, { grid, label: 'Pivot fields' });
  gridHost.addEventListener('aui-layout-change', (event) => {
    const { layout } = (event as CustomEvent<PivotGridLayoutChangeDetail>).detail;
    sessionStorage.setItem('pivot', JSON.stringify(layout));
  });
}
```

## 34. Angular example

`<aui-pivot-grid>` is generated (inputs mirror `PivotGridOptions`; `[(layout)]` is two-way; outputs `layoutChanged` (with the reason) and `loadError`). `<aui-pivot-field-list>` from `@absoluteui/angular/pivot-field-list` takes the grid component: `[grid]="pivot"` with `#pivot="auiPivotGrid"`.

```ts
import { Component } from '@angular/core';
import type { PivotField, PivotGridLayoutChangeDetail, PivotLayoutInput } from '@absoluteui/components/pivot-grid';
import { AuiPivotFieldList } from '@absoluteui/angular/pivot-field-list';
import { AuiPivotGrid } from '@absoluteui/angular/pivot-grid';

interface Sale { region: string; quarter: string; amount: number }

@Component({
  selector: 'app-sales-pivot',
  imports: [AuiPivotGrid, AuiPivotFieldList],
  template: `
    <aui-pivot-field-list label="Pivot fields" [grid]="pivot"></aui-pivot-field-list>
    <aui-pivot-grid #pivot="auiPivotGrid" caption="Sales" [fields]="fields" [data]="sales" [layout]="layout" (layoutChanged)="save($event)"></aui-pivot-grid>`,
})
export class SalesPivotComponent {
  readonly fields: PivotField<Sale>[] = [{ id: 'region', label: 'Region' }, { id: 'quarter', label: 'Quarter' }, { id: 'amount', label: 'Amount' }];
  readonly sales: Sale[] = [{ region: 'North', quarter: 'Q1', amount: 10 }];
  readonly layout: PivotLayoutInput = { rows: ['region'], columns: ['quarter'], values: [{ field: 'amount', aggregate: 'sum' }] };

  save(detail: PivotGridLayoutChangeDetail): void {
    // persist detail.layout
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that enhance or render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
