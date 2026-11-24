# Line Chart

> Package: `@absoluteui/components/line-chart` | Styles: `@absoluteui/components/line-chart/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

An accessible SVG line chart (and area chart) for trends over a shared x axis. It provides:
- one or more series over categories, numbers, or instants (time axis in the configured timezone);
- gaps for missing values (`null`, `NaN`, infinities) and isolated points drawn as markers;
- a legend of toggle buttons that show and hide series;
- keyboard-reachable data points (one tab stop, arrow keys) with a tooltip on focus and hover;
- a generated accessible summary (series, ranges, extremes, trend, gaps) and a data table fallback with the exact values;
- series that differ by color, marker shape, and dash pattern, never by color alone (WCAG 1.4.1);
- optional zoom and pan along x (`zoom`) with a Zoom toolbar, keys, Ctrl/Cmd + wheel, drag, and Shift + drag selection, and an optional crosshair (`crosshair`).

## 2. Anatomy

```text
<div class="aui-chart aui-line-chart [aui-chart--patterns] [aui-chart--zoomable] [aui-chart--zoomed] [aui-line-chart--markers] [aui-line-chart--area]">
  <div class="aui-chart__header">
    <div class="aui-chart__title" id="T">title</div>
    <p class="aui-chart__description" id="D">description</p>
    <div class="aui-chart__toolbar">                                (zoom: true; hidden otherwise)
      <div class="aui-chart__zoom" role="group" aria-label="Zoom">
        <button class="aui-chart__tool" aria-label="Zoom in"/> <button class="aui-chart__tool" aria-label="Zoom out" aria-disabled="true"/> <button class="aui-chart__tool" aria-label="Reset zoom" aria-disabled="true"/>
      </div>
    </div>
  </div>
  <ul class="aui-chart__legend" aria-label="Legend">
    <li class="aui-chart__legend-entry"><button class="aui-chart__legend-item" aria-pressed="true"><svg class="aui-chart__swatch" aria-hidden="true"/>Web</button></li>
  </ul>
  <div class="aui-chart__body">                                   (height: --aui-chart-height)
    <svg class="aui-chart__svg" role="group" aria-roledescription="line chart" aria-labelledby="T" aria-describedby="D S">
      <g class="aui-chart__crosshair" aria-hidden="true"><line class="aui-chart__crosshair-line"/>...</g>   (crosshair: true)
      <g class="aui-chart__grid" aria-hidden="true"/> <g class="aui-chart__axis …" aria-hidden="true"/>
      <g class="aui-line-chart__series aui-chart__series--c1" aria-hidden="true"><path class="aui-line-chart__area"/><path class="aui-line-chart__line aui-chart__dash--1"/></g>
      <g class="aui-line-chart__points"><path class="aui-chart__mark aui-line-chart__point" role="img" aria-label="Jan 2026, Web: 42" tabindex="0"/>...</g>
    </svg>
    <div class="aui-chart__empty" hidden/>  <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" id="S" hidden>generated summary</p>
  <div class="aui-chart__data"><button class="aui-chart__table-toggle" aria-expanded="false" aria-controls="R">Show data table</button><div class="aui-chart__table-scroll" id="R" role="region"><table class="aui-chart__table">...</table></div></div>
</div>
```

## 3. When to use

- Trends over time or another ordered dimension.
- Comparing a few series (up to about 8) over the same x values.
- `area: true` to emphasize magnitude relative to zero for one or two series.

## 4. When not to use

- Comparing discrete categories: use Bar Chart.
- Part-to-whole breakdowns: use Pie Chart or a stacked Bar Chart.
- A word-sized trend without axes: use Sparkline.
- Unordered x values or scatter data: not supported.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Ids of hidden series. |
| `zoomRange` | `ChartZoomRange \| null` | Current visible x window (data units), or `null`. |

Options (`LineChartOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot. |
| `x` | `(string \| number \| Instant \| ZonedDateTime)[]` | - (required) | No | Shared x values; numbers and instants ascending. |
| `series` | `ChartSeries[]` | - (required) | No | `{ id, label, values, color? }`; one value per x value. Each series also takes `style?: { color?; lineWidth?; dash?: 'solid' \| 'dashed' \| 'dotted'; marker?: 'auto' \| 'none' \| 'circle' \| 'square' \| 'diamond' \| 'triangle'; fillOpacity? }`; legend and tooltip keys match it. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the title. |
| `description` | `string` | - | No | Visible description, also in `aria-describedby`. |
| `summary` | `string` | generated | No | Replaces the generated summary. |
| `area` | `boolean` | `false` | No | Fill to the zero baseline. |
| `xType` | `'category' \| 'linear' \| 'time'` | inferred | No | Axis type. |
| `xAxis` | `{ label?; tickCount? }` | - | No | X axis title and approximate tick count (2-20). |
| `yAxis` | `{ label?; tickCount?; min?; max?; includeZero? }` | - | No | Y axis title, ticks, fixed domain, zero inclusion (default true with `area`). |
| `formatX` | `(value, index) => string` | - | No | Custom x text (tooltips, labels, table, summary). |
| `timeFormat` | `Intl.DateTimeFormatOptions` (no `timeZone`) | from data resolution | No | Format of time x values. |
| `zoom` | `boolean` | `false` | No | Zoom and pan along x (toolbar, keys, Ctrl/Cmd + wheel, drag, Shift + drag). Turning it off resets the window. |
| `zoomRange` | `{ from: number; to: number } \| null` | `null` | No | Visible x window: category index, number, or epoch ms (time axis). Clamped to the data and to at least two points; no event. Use with `zoom: true`. |
| `valueFormat` | `Intl.NumberFormatOptions` | - | No | Value format (ticks use fixed fraction digits). |
| `formatValue` | `(value) => string` | - | No | Custom value text (not used for ticks). |
| `hiddenSeries` | `string[]` | `[]` | No | Hidden series ids. |
| `annotations` | `ChartAnnotation[]` | - | No | Reference lines `{ type: 'line', axis: 'x' \| 'y', value, label?, tone? }` and bands `{ type: 'band', axis, from, to, label?, tone? }` (x: category label or index, number, or epoch ms; y: number); drawn under the marks, aria-hidden, listed in the summary. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | `auto`: shown with more than one series. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Dash patterns (always on in forced colors). |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000). |
| `markers` | `'auto' \| 'always' \| 'focus'` | `'auto'` | Yes | Marker visibility. |
| `crosshair` | `boolean` | `false` | Yes | Vertical crosshair line at the hovered or focused x value (aria-hidden). |
| `locale` | `string` | common `locale` | Yes (inherited) | Number, date, and message locale. |
| `timezone` | `string` | common `timezone` (UTC) | Yes (inherited) | Timezone of time axes. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Mirrors the x axis and arrow keys. |

## 6. Methods

| Method | Description |
|---|---|
| `LineChart.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render. Invalid options throw and keep the previous state; focus stays on the same data point. |
| `setSeriesVisible(id, visible)` | Show or hide a series; no event. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, and configuration subscription. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-series-toggle` | `{ id: string; visible: boolean; hidden: string[] }` | Yes | The user toggled a legend entry. Not emitted for `update()` or `setSeriesVisible()`. |
| `aui-zoom` | `LineChartZoomDetail` (= `ChartZoomDetail`): `{ x: ChartZoomRange \| null; y: null; reason: 'button' \| 'keyboard' \| 'wheel' \| 'pan' \| 'select' \| 'reset' }` | Yes | The user changed the visible window. `x` is `null` when showing everything. Not emitted for the `zoomRange` option. Not cancelable. |
| `aui-point-click` | `LineChartPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |

## 8. Slots/content areas

None. Title, description, labels, and values are text.

## 9. CSS parts/hooks

Shared chart chrome: `aui-chart`, `aui-chart--patterns`, `__header`, `__title`, `__description`, `__legend`, `__legend-item(--hidden)`, `__swatch`, `__body`, `__svg`, `__grid`, `__gridline`, `__zero-line`, `__axis`, `__axis-line`, `__tick-label`, `__axis-title`, `__series--c1..8`, `__dash--1..4`, `__pattern`, `__mark(--active|--hover)`, `__tooltip*`, `__empty`, `__summary`, `__data(--hidden)`, `__table-toggle`, `__table-scroll`, `__table`. Interaction: `aui-chart--zoomable`, `aui-chart--zoomed`, `__toolbar`, `__zoom`, `__tool`, `__crosshair`, `__crosshair-line`, `__brush`. Line chart: `aui-line-chart--markers`, `--area`, `__series`, `__line`, `__area`, `__points`, `__point(--isolated)`, `__markers`, `__cursor`. The plot height reads `--aui-chart-height`; series colors are `--aui-chart-color`. All rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`, `__annotations`, `__annotation-line`, `__annotation-band`, `__annotation-label`, `__annotation--neutral|info|success|warning|danger`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/line-chart/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1` ... `color-chart-8` (series), `color-chart-grid`, `color-chart-axis`, `color-text-muted` (ticks), `color-surface` (marker outlines, tooltip), `color-focus-ring`.

Chart look and feel: these `--aui-chart-*` custom properties restyle every chart; set them in a theme (Theme Designer, Charts section), on any ancestor, or per chart with the `theme` option.

| Custom property | Default (theme token) | Styles |
|---|---|---|
| `--aui-chart-1` ... `--aui-chart-8` | `color-chart-1` ... `color-chart-8` | Series colors of palette slots 1-8 (lines, bars, slices, markers, legend and tooltip keys). |
| `--aui-chart-grid-color` | `color-chart-grid` | Gridlines. |
| `--aui-chart-axis-color` | `color-chart-axis` | Axis lines, zero lines, the crosshair. |
| `--aui-chart-text-color` | `color-text-muted` | Tick labels and axis titles. |
| `--aui-chart-label-color` | `color-text` | Value labels. |
| `--aui-chart-label-halo-color` | `color-surface` | Halo behind value and annotation labels. |
| `--aui-chart-font-family` | `font-family-sans` | Chart text. |
| `--aui-chart-font-size` | `font-size-xs` | Plot text (ticks, axis titles, value labels). |
| `--aui-chart-title-font-size` | `font-size-md` | Chart title. |
| `--aui-chart-legend-font-size` | `font-size-sm` | Legend text. |
| `--aui-chart-legend-gap` | `space-3` | Gap between legend entries. |
| `--aui-chart-line-width` | `border-width-strong` | Series lines (Sparkline: `--aui-sparkline-line-width`, default 1.5px). |
| `--aui-chart-tooltip-bg` | `color-surface` | Tooltip background. |
| `--aui-chart-tooltip-fg` | `color-text` | Tooltip text. |
| `--aui-chart-tooltip-border-color` | `color-border-strong` | Tooltip boundary. |
| `--aui-chart-tooltip-radius` | `radius-md` | Tooltip corners (falls back to `--aui-chart-corner-radius` first). |
| `--aui-chart-control-radius` | `radius-sm` | Data-table toggle and container, zoom buttons, legend buttons (falls back to `--aui-chart-corner-radius` first). |
| `--aui-chart-tooltip-shadow` | `shadow-md` | Tooltip elevation. |
| `--aui-chart-grid-dash` | `none` | Gridline dash pattern, for example `4 2`. |
| `--aui-chart-area-opacity` | `0.12` | Area fills. |
| `--aui-chart-corner-radius` | unset | Every cornered element; the element radii win over it. |
| `--aui-chart-bar-radius` | unset (0) | Bars, bins, steps, volume bars (value end). |
| `--aui-chart-cell-radius` | unset (per chart) | Heatmap and calendar cells, treemap tiles. |
| `--aui-chart-slice-radius` | unset (0) | Pie and donut slices, gauge arcs, funnel stages. |
| `--aui-chart-box-radius` | unset (0) | Box plot boxes, candle bodies, bullet ranges and measures. |
| `--aui-chart-swatch-radius` | unset (2px) | Legend swatches (0-8). |
| `--aui-chart-line-join` | unset (`round`) | Joins of lines, areas, radar outlines. |
| `--aui-chart-marker-size` | per chart (3.5 to 4) | Marker radius in px (read when the chart renders). |
| `--aui-chart-animation-duration` | `400ms` | Entry animation length (with `theme.animation`). |
| `--aui-chart-band-opacity` | `0.1` | Annotation band fill. |
| `--aui-chart-series-color` / `-series-line-width` / `-series-fill-opacity` | unset | Per-series values written by `series[].style`. |

The properties down to `--aui-chart-tooltip-shadow` (25 in all) are component tokens (SPEC section 10.2): a theme sets them in the Theme Designer's Charts section, and the compliance report checks their contrast. The others are plain hooks with the defaults shown.

Corner rounding: `theme.cornerRadius` (`--aui-chart-corner-radius`, px 0-50) sets every cornered element; the element radii below win over it; unset keeps the look shown. Values are clamped to half the element's width or height and written as SVG geometry, so SVG and PNG exports keep them; stylesheet values apply when the chart next renders.

- Lines and areas: `lineJoin` (`--aui-chart-line-join`: `round` (default), `miter`, `bevel`).
- Point markers are shapes, not rounded.
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default, empty ("No data"), all series hidden ("All series are hidden"), series hidden, point focused (tooltip), hovered (shared tooltip), table open, dense (virtual points above 600 visible points), zoomed (window applied), panning or selecting (pointer drag), crosshair shown.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | legend button (click, Enter, Space) | series hidden or shown; `aui-series-toggle` emitted; domain rescales to visible series |
| plot not focused | Tab | active point focused, tooltip shown |
| point focused | arrow keys, Home, End, PageUp, PageDown | another point focused (tooltip follows) |
| tooltip visible | Escape | tooltip hidden, focus unchanged |
| table closed | Show data table | table built and shown; button reads "Hide data table" |
| any | container resize | re-render at the new width; focus kept on the same point |
| not zoomed | Zoom in, `+`/`=`, Ctrl/Cmd + wheel up, Shift + drag | zoomed; change announced; `aui-zoom` emitted |
| zoomed | Zoom out, `-`, drag, arrow key past the window edge | window widened or moved; announced; `aui-zoom` emitted |
| zoomed | Reset zoom, `0`, or zooming out to the full extent | all data shown ("Showing all data."); `aui-zoom` with `x: null` |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Zoom buttons (with `zoom`), legend buttons, the plot (one tab stop), the table button, the table region. |
| ArrowLeft / ArrowRight | Point focused | Previous / next point of the series (mirrored in RTL); gaps are skipped. Zoomed: past the window edge the window pans to the next point. |
| ArrowUp / ArrowDown | Point focused | Same x in the previous / next visible series (single series: previous / next point). |
| Home / End | Point focused | First / last point. |
| PageUp / PageDown | Point focused | Ten points back / forward. |
| `+` / `=` | Point focused, `zoom: true` | Zoom in around the focused x value. |
| `-` | Point focused, `zoom: true` | Zoom out. |
| `0` | Point focused, `zoom: true` | Reset zoom. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Legend button | Toggle the series. |
| Enter / Space | Zoom button | Zoom in, zoom out, or reset (ignored while `aria-disabled`). |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

Pointer: Ctrl/Cmd + wheel zooms around the pointer (a plain wheel scrolls the page); dragging pans a zoomed chart; Shift + drag selects an x range to zoom into.

## 14. ARIA contract

- The SVG is `role="group"`, `aria-roledescription` = localized "line chart" / "area chart", `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each point is `role="img"` with `aria-label` "{x}, {series}: {value}"; exactly one point has `tabindex="0"`.
- Legend: `ul` named "Legend"; entries are `button`s with `aria-pressed` (true = visible).
- Table toggle: `aria-expanded` and `aria-controls`; the table has a caption, `th scope="col"` headers, and `th scope="row"` row headers.
- Zoom toolbar: `role="group"` named "Zoom" with native buttons "Zoom in", "Zoom out", "Reset zoom"; unavailable actions carry `aria-disabled="true"` and stay focusable.
- Axes, lines, areas, textures, the crosshair, the selection brush, and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- The summary names the type, counts, x and y ranges, each series' minimum and maximum with their x, the overall trend (first to last value), missing values, and hidden series.
- With more than 600 visible points, points are virtual: two proxy marks alternate focus so each move is announced; browse-mode users read values from the data table.
- Forced colors: series use `CanvasText` and are told apart by marker shape and dash pattern; focus uses `Highlight`.
- Nothing animates; hover and focus emphasis transitions are removed under reduced motion.
- The tooltip meets WCAG 1.4.13: shown on focus and hover, dismissible with Escape, hoverable, persistent.
- Zoom changes are announced politely ("Showing {from} to {to}.", "Showing all data."). Every pointer gesture has a keyboard and toolbar equivalent (WCAG 2.1.1, 2.5.1).
- The crosshair follows hover and keyboard focus and is `aria-hidden`.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

The width follows the container (ResizeObserver); the height is `height`. Tick counts, label thinning and truncation, and marker visibility adapt to the width. Reflows at 320 CSS px; wide data tables scroll in a focusable region.

## 17. RTL behavior

`direction: 'rtl'` mirrors the x axis (first value at the right), puts the y axis on the right, and swaps ArrowLeft/ArrowRight. The legend, tooltip, and table follow the document direction.

## 18. Theme behavior

Series colors come from `color-chart-1..8` by palette slot (series position, or `color`). Each palette color meets 3:1 against surface, background, and sunken surfaces in all shipped themes (contrast gate). Gridlines use `color-chart-grid` (decorative), axes `color-chart-axis` (3:1).

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { lineChart: { dataTable: 'hidden', markers: 'always', height: 240, crosshair: true } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic. `zoom` and `zoomRange` are instance-only (not globally configurable).

## 21. Timezone behavior

Time axes (Instant or ZonedDateTime x values) place ticks at wall-clock boundaries (midnight, first of month, January) in the configured timezone (instance, component, or common; UTC by default) and format all labels there. Across DST changes ticks follow local time, so their spacing is uneven. The host machine's zone is never used.

## 22. Icon customization points

No `icons` option. Legend keys and markers are drawn shapes. The zoom buttons render the icons `plus`, `minus`, and `refresh` through `@absoluteui/icons`; a global icon provider or registry entry for those names replaces them in every component that uses them.

## 23. Security behavior

All text uses `textContent`; SVG is built with `createElementNS`. Colors are classes; the plot height and tooltip position are written through the CSSOM. No `innerHTML`, style attributes, or inline handlers: compatible with `style-src 'self'` and `require-trusted-types-for 'script'`.

## 24. Data handling behavior

Renders the given data only; no persistence, network access, or telemetry. Validation errors name the option, never its value.

## 25. Performance characteristics

Budget: create with 5 series x 1,000 points (time axis) under 50 ms including the first render, re-render under 50 ms (e2e performance test, median of 5). Dense series use virtual points; the data table is built only when opened in toggle mode.

## 26. Supported data scale

Tested with 5 series x 1,000 points. DOM size is independent of the point count above 600 visible points (except the line paths).

## 27. Usage examples

```ts
import { LineChart } from '@absoluteui/components/line-chart';

const host = document.createElement('div');
document.body.append(host);
LineChart.create(host, {
  label: 'Revenue',
  x: ['Jan', 'Feb', 'Mar'],
  series: [{ id: 'rev', label: 'Revenue', values: [120, 135, 150] }],
});
```

More examples, type-checked in CI: `metadata/line-chart/examples.json`.

Export: `@absoluteui/components/chart-export` (`chartToSvg`, `chartToPng`, `downloadChart`) exports any chart instance to SVG or PNG.

## 28. Edge cases

- Empty `x` or `series`, or only missing values: "No data".
- Every series hidden: "All series are hidden".
- A single point is centered and drawn as a marker; the summary reads "{series}: {value} at {x}."
- A zero-width domain (all values equal) is widened so the line sits mid-plot.
- Negative values: the domain crosses zero and a zero line is drawn.
- Very long category labels are truncated (with an ellipsis) or thinned on the axis; the full text stays in the point labels, tooltip, and table.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `LINE_CHART_OPTIONS` | configuration | Missing label; x not an array of one kind; unsorted numeric/time x; series ids not unique; values length differs from x; invalid axis options. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration (for example `height` outside 120-2000). |

A failed construction leaves the host untouched; a failed `update()` keeps the previous state.

## 30. Known limitations

- x values are shared; each series needs one value per x value.
- Straight segments only.
- Axis label widths are estimated (about 0.6 em per character).
- The zoom window keeps at least two points visible; zoom is along x only.
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.

## 31. Unsupported scenarios

- Zoom on the y axis; linked zoom across charts.
- Secondary or logarithmic axes (use Combo Chart for a secondary axis); stacked areas.
- Scatter data (per-series or unordered x): use Scatter Chart.
- HTML in labels or tooltips.

## 32. TypeScript definitions

```ts
type LineChartXValue = string | number | Instant | ZonedDateTime;
interface ChartSeries { id: string; label: string; values: readonly (number | null)[]; color?: ChartColor }
interface LineChartConfig { legend: ChartLegendMode; dataTable: ChartTableMode; tooltip: boolean; patterns: boolean; height: number; markers: 'auto' | 'always' | 'focus'; crosshair: boolean }
interface LineChartOptions extends ChartCommonOptions, Partial<LineChartConfig> {
  x: readonly LineChartXValue[];
  series: readonly ChartSeries[];
  area?: boolean;
  xType?: 'category' | 'linear' | 'time';
  xAxis?: { label?: string; tickCount?: number };
  yAxis?: { label?: string; tickCount?: number; min?: number; max?: number; includeZero?: boolean };
  formatX?: (value: LineChartXValue, index: number) => string;
  timeFormat?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>;
  timezone?: string;
  zoom?: boolean;
  zoomRange?: ChartZoomRange | null;
}
interface ChartZoomRange { readonly from: number; readonly to: number }
interface LineChartSeriesToggleDetail { id: string; visible: boolean; hidden: string[] }
// LineChartZoomDetail = ChartZoomDetail
interface ChartZoomDetail { x: ChartZoomRange | null; y: ChartZoomRange | null; reason: 'button' | 'keyboard' | 'wheel' | 'pan' | 'select' | 'reset' }
```

## 33. Vanilla JS example

```ts
import { LineChart } from '@absoluteui/components/line-chart';
import '@absoluteui/components/line-chart/style.css';
import { instant } from '@absoluteui/core';

const host = document.querySelector<HTMLElement>('#latency');
if (host) {
  const x = [0, 1, 2, 3].map((h) => instant(Date.UTC(2026, 2, 1, h)));
  LineChart.create(host, {
    label: 'API latency',
    x,
    series: [{ id: 'p95', label: 'p95', values: [120, 180, null, 140] }],
    valueFormat: { style: 'unit', unit: 'millisecond' },
    timezone: 'Asia/Kolkata',
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiLineChart } from '@absoluteui/angular/line-chart';
import type { ChartSeries } from '@absoluteui/components/line-chart';

@Component({
  selector: 'app-revenue',
  imports: [AuiLineChart],
  template: `<aui-line-chart label="Revenue" [x]="months" [series]="series" (seriesToggled)="hidden = $event.hidden"></aui-line-chart>`,
})
export class RevenueComponent {
  readonly months = ['Jan', 'Feb', 'Mar'];
  readonly series: ChartSeries[] = [{ id: 'rev', label: 'Revenue', values: [120, 135, 150] }];
  hidden: string[] = [];
}
```

## 35. React example

```tsx
import { AuiLineChart } from '@absoluteui/react/line-chart';

const months = ['Jan', 'Feb', 'Mar'];
const series = [{ id: 'rev', label: 'Revenue', values: [12, 18, 15] }];

export function Example() {
  return <AuiLineChart label="Monthly revenue" x={months} series={series} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiLineChart } from '@absoluteui/vue/line-chart';
const months = ['Jan', 'Feb', 'Mar'];
const series = [{ id: 'rev', label: 'Revenue', values: [12, 18, 15] }];
</script>

<template>
  <AuiLineChart label="Monthly revenue" :x="months" :series="series" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
