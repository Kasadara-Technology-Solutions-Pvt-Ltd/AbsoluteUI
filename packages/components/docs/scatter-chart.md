# Scatter Chart

> Package: `@absoluteui/components/scatter-chart` | Styles: `@absoluteui/components/scatter-chart/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

An accessible SVG scatter plot of one or more series of (x, y) points on linear axes; a `size` on points makes it a bubble chart (bubble area proportional to size). It provides:
- keyboard-reachable points (one tab stop) ordered by x within each series, Up/Down between series, with a tooltip on focus and hover;
- a legend of toggle buttons that show and hide series;
- an optional crosshair (vertical and horizontal lines) through the hovered or focused point;
- optional zoom and pan along x (`zoom: 'x'`) or both axes (`zoom: 'xy'`);
- a generated accessible summary (per-series point counts and x/y ranges) and a data table fallback with the exact values;
- series that differ by color and marker shape, never by color alone (WCAG 1.4.1).

## 2. Anatomy

```text
<div class="aui-chart aui-scatter-chart [aui-scatter-chart--bubble] [aui-chart--patterns] [aui-chart--zoomable] [aui-chart--zoomed]">
  <div class="aui-chart__header">
    <div class="aui-chart__title" id="T">title</div>
    <p class="aui-chart__description" id="D">description</p>
    <div class="aui-chart__toolbar">                                (zoom enabled; hidden otherwise)
      <div class="aui-chart__zoom" role="group" aria-label="Zoom">
        <button class="aui-chart__tool" aria-label="Zoom in"/> <button class="aui-chart__tool" aria-label="Zoom out" aria-disabled="true"/> <button class="aui-chart__tool" aria-label="Reset zoom" aria-disabled="true"/>
      </div>
    </div>
  </div>
  <ul class="aui-chart__legend" aria-label="Legend">
    <li class="aui-chart__legend-entry"><button class="aui-chart__legend-item" aria-pressed="true"><svg class="aui-chart__swatch" aria-hidden="true"/>Group A</button></li>
  </ul>
  <div class="aui-chart__body">                                   (height: --aui-chart-height)
    <svg class="aui-chart__svg" role="group" aria-roledescription="scatter chart" aria-labelledby="T" aria-describedby="D S">
      <g class="aui-chart__crosshair" aria-hidden="true"><line class="aui-chart__crosshair-line"/><line class="aui-chart__crosshair-line"/></g>   (crosshair: true)
      <g class="aui-chart__grid" aria-hidden="true"/> <g class="aui-chart__axis …" aria-hidden="true"/>
      <g class="aui-scatter-chart__points">                         (clipped to the plot while zoomed)
        <g class="aui-scatter-chart__series aui-chart__series--c1">
          <path class="aui-chart__mark aui-scatter-chart__point [aui-scatter-chart__bubble]" role="img" aria-label="Group A: Height (cm) 160, Weight (kg) 55" tabindex="0"/>...
        </g>
      </g>
    </svg>
    <div class="aui-chart__empty" hidden/>  <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" id="S" hidden>generated summary</p>
  <div class="aui-chart__data"><button class="aui-chart__table-toggle" aria-expanded="false" aria-controls="R">Show data table</button><div class="aui-chart__table-scroll" id="R" role="region"><table class="aui-chart__table">...</table></div></div>
</div>
```

## 3. When to use

- Relationships or correlation between two numeric variables.
- Clusters and outliers across a few groups (up to about 8 series).
- A third numeric dimension as bubble size.

## 4. When not to use

- Trends over an ordered x shared by all series: use Line Chart.
- Comparing categories: use Bar Chart or Combo Chart.
- The distribution of one variable: use Histogram (or Box Plot for groups).
- Tens of thousands of points: not a target of this component.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Ids of hidden series, in data order. |
| `zoomRange` | `ChartZoomRange \| null` | Current visible x window, or `null`. |
| `zoomRangeY` | `ChartZoomRange \| null` | Current visible y window (`zoom: 'xy'`), or `null`. |

Options (`ScatterChartOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot. |
| `series` | `ScatterChartSeries[]` | - (required) | No | `{ id, label, points: { x, y, size?, label? }[], color? }`. Points with a non-finite x or y are skipped. Each series also takes `style?: { color?; lineWidth?; dash?: 'solid' \| 'dashed' \| 'dotted'; marker?: 'auto' \| 'none' \| 'circle' \| 'square' \| 'diamond' \| 'triangle'; fillOpacity? }`; legend and tooltip keys match it. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the title. |
| `description` | `string` | - | No | Visible description, also in `aria-describedby`. |
| `summary` | `string` | generated | No | Replaces the generated summary. |
| `xAxis` | `{ label?; min?; max?; tickCount?; includeZero? }` | - | No | X axis title (also names x in labels, default "X axis"), fixed domain, ticks (2-20), zero inclusion (default `false`). |
| `yAxis` | `{ label?; min?; max?; tickCount?; includeZero? }` | - | No | Same for y (default name "Y axis"). |
| `sizeLabel` | `string` | `'Size'` | No | Name of the size dimension. |
| `sizeRange` | `[number, number]` | `[4, 24]` | No | Bubble radius in px for the smallest and largest size (1-100, min <= max). |
| `xFormat` | `Intl.NumberFormatOptions` | `valueFormat` | No | Format of x values. |
| `valueFormat` | `Intl.NumberFormatOptions` | - | No | Format of y (and size) values; ticks use fixed fraction digits. |
| `formatValue` | `(value) => string` | - | No | Custom value text (not used for ticks). |
| `hiddenSeries` | `string[]` | `[]` | No | Hidden series ids. |
| `zoom` | `'none' \| 'x' \| 'xy'` | `'none'` | No | Zoom and pan along x or both axes. Turning it off resets the window. |
| `zoomRange` | `{ from; to } \| null` | `null` | No | Visible x window (data units); clamped to the data (minimum span 1/50 of the extent); no event. |
| `zoomRangeY` | `{ from; to } \| null` | `null` | No | Visible y window with `zoom: 'xy'` (ignored otherwise). |
| `annotations` | `ChartAnnotation[]` | - | No | Reference lines `{ type: 'line', axis: 'x' \| 'y', value, label?, tone? }` and bands `{ type: 'band', axis, from, to, label?, tone? }` (x and y: numbers); drawn under the marks, aria-hidden, listed in the summary. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | `auto`: shown with more than one series. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Shared texture setting (series differ by marker shape regardless). |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000). |
| `crosshair` | `boolean` | `false` | Yes | Crosshair lines through the hovered or focused point. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Mirrors the x axis and arrow keys. |

## 6. Methods

| Method | Description |
|---|---|
| `ScatterChart.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render. Invalid options throw and keep the previous state; focus stays on the same point when it is still in view. |
| `setSeriesVisible(id, visible)` | Show or hide a series; no event. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, zoom handlers, and configuration subscription. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-series-toggle` | `ScatterChartSeriesToggleDetail`: `{ id: string; visible: boolean; hidden: string[] }` | Yes | The user toggled a legend entry. Not emitted for `update()` or `setSeriesVisible()`. |
| `aui-zoom` | `ScatterChartZoomDetail` (= `ChartZoomDetail`): `{ x: ChartZoomRange \| null; y: ChartZoomRange \| null; reason: 'button' \| 'keyboard' \| 'wheel' \| 'pan' \| 'select' \| 'reset' }` | Yes | The user changed the visible window. `null` means that axis shows everything (`y` is always `null` with `zoom: 'x'`). Not emitted for the range options. Not cancelable. |
| `aui-point-click` | `ScatterChartPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |

## 8. Slots/content areas

None. Title, description, labels, and values are text.

## 9. CSS parts/hooks

Shared chart chrome: `aui-chart`, `aui-chart--patterns`, `__header`, `__title`, `__description`, `__legend`, `__legend-item(--hidden)`, `__swatch`, `__body`, `__svg`, `__grid`, `__gridline`, `__zero-line`, `__axis`, `__axis-line`, `__tick-label`, `__axis-title`, `__series--c1..8`, `__mark(--active|--hover)`, `__tooltip*`, `__empty`, `__summary`, `__data(--hidden)`, `__table-toggle`, `__table-scroll`, `__table`. Interaction: `aui-chart--zoomable`, `aui-chart--zoomed`, `__toolbar`, `__zoom`, `__tool`, `__crosshair`, `__crosshair-line`, `__brush`. Scatter: `aui-scatter-chart--bubble`, `__points`, `__series`, `__point`, `__bubble`, `__cursor`. Colors are `--aui-chart-color`; the plot height reads `--aui-chart-height`. All rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`, `__annotations`, `__annotation-line`, `__annotation-band`, `__annotation-label`, `__annotation--neutral|info|success|warning|danger`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/scatter-chart/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1` ... `color-chart-8` (series), `color-chart-grid`, `color-chart-axis` (axes, crosshair), `color-surface` (point outlines, tooltip), `color-text` (active bubble outline), `color-focus-ring` (focus, selection brush).

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

- Points and bubbles are marker shapes, not rounded.
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default, bubble (any point has a size), empty ("No data"), all series hidden ("All series are hidden"), series hidden, point focused (tooltip), hovered (nearest point within 12 px), crosshair shown, zoomed, panning or selecting (pointer drag), table open, dense (virtual points above 600 visible points).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | legend button (click, Enter, Space) | series hidden or shown; `aui-series-toggle` emitted; domains rescale to visible series |
| plot not focused | Tab | active point focused, tooltip (and crosshair) shown |
| point focused | arrow keys, Home, End, PageUp, PageDown | another point focused |
| tooltip visible | Escape | tooltip hidden, focus unchanged |
| not zoomed | Zoom in, `+`/`=`, Ctrl/Cmd + wheel up, Shift + drag | zoomed; "Showing {from} to {to}." announced; `aui-zoom` emitted |
| zoomed | Zoom out, `-`, drag | window widened or moved; announced; `aui-zoom` emitted |
| zoomed | Reset zoom, `0` | all data shown ("Showing all data."); `aui-zoom` with `x: null, y: null` |
| table closed | Show data table | table built and shown |
| any | container resize | re-render at the new width; focus kept on the same point |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Zoom buttons (zoom enabled), legend buttons, the plot (one tab stop), the table button, the table region. |
| ArrowLeft / ArrowRight | Point focused | Previous / next point of the series in x order (mirrored in RTL). |
| ArrowUp / ArrowDown | Point focused | Point at the nearest x-order position in the previous / next visible series (single series: previous / next point). |
| Home / End | Point focused | First / last point of the series. |
| PageUp / PageDown | Point focused | Ten points back / forward. |
| `+` / `=` | Point focused, zoom enabled | Zoom in around the focused point. |
| `-` | Point focused, zoom enabled | Zoom out. |
| `0` | Point focused, zoom enabled | Reset zoom. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Legend button | Toggle the series. |
| Enter / Space | Zoom button | Zoom in, zoom out, or reset (ignored while `aria-disabled`). |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

Arrow keys do not pan a zoomed scatter chart; points outside the window are not in the navigation order. Pointer: Ctrl/Cmd + wheel zooms around the pointer (a plain wheel scrolls the page); dragging pans a zoomed chart; Shift + drag selects a range (x, or a rectangle with `zoom: 'xy'`).

## 14. ARIA contract

- The SVG is `role="group"`, `aria-roledescription` = localized "scatter chart" / "bubble chart", `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each point is `role="img"` with `aria-label` "{name}: {xAxis} {x}, {yAxis} {y}" (bubbles add ", {sizeAxis} {size}"); `name` is "{label}, {series}" for labelled points, else the series label. Exactly one point has `tabindex="0"`.
- Legend: `ul` named "Legend"; entries are `button`s with `aria-pressed` (true = visible).
- Zoom toolbar: `role="group"` named "Zoom" with native buttons "Zoom in", "Zoom out", "Reset zoom"; unavailable actions carry `aria-disabled="true"` and stay focusable.
- Table toggle: `aria-expanded` and `aria-controls`; the table has a caption, column headers (Point, Series, x name, y name, and size name for bubbles), and row headers.
- Axes, dense decorative paths, the crosshair, the selection brush, and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- The summary names the type, series and point counts, and per series its point count and x and y ranges, plus hidden series.
- With more than 600 visible points, points are virtual: two proxy marks alternate focus so each move is announced; browse-mode users read values from the data table.
- Series differ by marker shape (repeated in the legend key); forced colors keep shapes and use `CanvasText`/`Canvas`, focus uses `Highlight`.
- Zoom changes are announced politely; every pointer gesture has a keyboard and toolbar equivalent (WCAG 2.1.1, 2.5.1). The crosshair follows hover and keyboard focus and is `aria-hidden`.
- The tooltip meets WCAG 1.4.13: shown on focus and hover, dismissible with Escape, hoverable, persistent. Nothing animates.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

The width follows the container (ResizeObserver); the height is `height`. Tick counts follow the plot size; the scales are inset by the largest mark radius so marks never cover the axes. Reflows at 320 CSS px; wide data tables scroll in a focusable region.

## 17. RTL behavior

`direction: 'rtl'` mirrors the x axis (smallest x at the right), puts the y axis on the right, and swaps ArrowLeft/ArrowRight; drag panning follows the mirrored axis. The legend, tooltip, and table follow the document direction.

## 18. Theme behavior

Series colors come from `color-chart-1..8` by palette slot (series position, or `color`). Bubbles are translucent with a solid outline in the series color so overlapping bubbles stay visible. Gridlines use `color-chart-grid`, axes and the crosshair `color-chart-axis`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { scatterChart: { crosshair: true, dataTable: 'hidden', height: 360 } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic. `zoom`, `zoomRange`, and `zoomRangeY` are instance-only.

## 21. Timezone behavior

Not applicable: numeric axes only; no dates are formatted.

## 22. Icon customization points

No `icons` option. Markers are drawn shapes. The zoom buttons render the icons `plus`, `minus`, and `refresh` through `@absoluteui/icons`; a global icon provider or registry entry for those names replaces them in every component that uses them.

## 23. Security behavior

All text uses `textContent`; SVG is built with `createElementNS`. Colors are classes; the plot height and tooltip position are written through the CSSOM. No `innerHTML`, style attributes, or inline handlers: compatible with `style-src 'self'` and `require-trusted-types-for 'script'`.

## 24. Data handling behavior

Renders the given data only; no persistence, network access, or telemetry. Validation errors name the option, never its value.

## 25. Performance characteristics

Budget: `ScatterChart.create` with 2,000 points under 60 ms in headless Chromium, including the first render (e2e performance test, `tests/e2e/perf-r3.spec.ts`). Above 600 visible points, points are virtual (two proxy marks plus one decorative path per series); hover uses a spatial hash; the data table is built only when opened in toggle mode.

## 26. Supported data scale

Tested with 2,000 points. DOM size is independent of the point count above 600 visible points.

## 27. Usage examples

```ts
import { ScatterChart } from '@absoluteui/components/scatter-chart';

const host = document.createElement('div');
document.body.append(host);
ScatterChart.create(host, {
  label: 'Height and weight',
  series: [{ id: 'a', label: 'Group A', points: [{ x: 160, y: 55 }, { x: 175, y: 72 }] }],
  xAxis: { label: 'Height (cm)' },
  yAxis: { label: 'Weight (kg)' },
});
```

More examples, type-checked in CI: `metadata/scatter-chart/examples.json`.

Export: `@absoluteui/components/chart-export` (`chartToSvg`, `chartToPng`, `downloadChart`) exports any chart instance to SVG or PNG.

## 28. Edge cases

- No series, or no points at all: "No data". Visible series without any finite point: "No data".
- Every series hidden: "All series are hidden".
- All sizes equal: every bubble uses the middle of `sizeRange`.
- Points without `size` in a bubble chart are drawn as regular markers.
- The data table lists every series (including hidden ones); unlabelled points are named "Point {n}".

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SCATTER_CHART_OPTIONS` | configuration | Missing label; series ids not unique or empty; points without numeric `x`/`y`; negative `size`; invalid axis options; `sizeRange` outside 1-100 or reversed; invalid `zoom` or zoom ranges. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration (for example `height` outside 120-2000). |

A failed construction leaves the host untouched; a failed `update()` keeps the previous state.

## 30. Known limitations

- Linear axes only.
- Keyboard order within a series is by x (then y), not data order.
- Axis label widths are estimated (about 0.6 em per character).
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.
- `style.marker: 'none'` keeps the default shape (points are the data); synchronized crosshairs follow the point's position in its series, which rarely lines up across charts.

## 31. Unsupported scenarios

- Logarithmic or time axes.
- Trend lines, regression, density contours.
- Lasso selection; linked brushing across charts.
- HTML in labels or tooltips.

## 32. TypeScript definitions

```ts
interface ScatterChartPoint { x: number; y: number; size?: number; label?: string }
interface ScatterChartSeries { id: string; label: string; points: readonly ScatterChartPoint[]; color?: ChartColor }
interface ScatterChartAxis { readonly label?: string; readonly min?: number; readonly max?: number; readonly tickCount?: number; readonly includeZero?: boolean }
interface ScatterChartConfig { legend: ChartLegendMode; dataTable: ChartTableMode; tooltip: boolean; patterns: boolean; height: number; crosshair: boolean }
type ChartZoomMode = 'none' | 'x' | 'xy';
interface ChartZoomRange { readonly from: number; readonly to: number }
interface ScatterChartOptions extends ChartCommonOptions, Partial<ScatterChartConfig> {
  series: readonly ScatterChartSeries[];
  xAxis?: ScatterChartAxis;
  yAxis?: ScatterChartAxis;
  sizeLabel?: string;
  sizeRange?: readonly [number, number];
  xFormat?: Intl.NumberFormatOptions;
  zoom?: ChartZoomMode;
  zoomRange?: ChartZoomRange | null;
  zoomRangeY?: ChartZoomRange | null;
}
type ScatterChartSeriesToggleDetail = { id: string; visible: boolean; hidden: string[] };
type ScatterChartZoomDetail = { x: ChartZoomRange | null; y: ChartZoomRange | null; reason: 'button' | 'keyboard' | 'wheel' | 'pan' | 'select' | 'reset' };
```

## 33. Vanilla JS example

```ts
import { ScatterChart } from '@absoluteui/components/scatter-chart';
import '@absoluteui/components/scatter-chart/style.css';

const host = document.querySelector<HTMLElement>('#markets');
if (host) {
  ScatterChart.create(host, {
    label: 'Markets',
    series: [{ id: 'm', label: 'Markets', points: [{ x: 2.1, y: 18, size: 120, label: 'North' }, { x: 3.4, y: 11, size: 60, label: 'South' }] }],
    xAxis: { label: 'Growth (%)' },
    yAxis: { label: 'Margin (%)' },
    sizeLabel: 'Revenue (M)',
    zoom: 'xy',
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiScatterChart } from '@absoluteui/angular/scatter-chart';
import type { ScatterChartSeries, ScatterChartZoomDetail } from '@absoluteui/components/scatter-chart';

@Component({
  selector: 'app-correlation',
  imports: [AuiScatterChart],
  template: `<aui-scatter-chart label="Height and weight" [series]="series" [zoom]="'xy'" [crosshair]="true" (zoomed)="onZoom($event)"></aui-scatter-chart>`,
})
export class CorrelationComponent {
  readonly series: ScatterChartSeries[] = [{ id: 'a', label: 'Group A', points: [{ x: 160, y: 55 }, { x: 175, y: 72 }] }];
  zoomed = false;
  onZoom(detail: ScatterChartZoomDetail): void {
    this.zoomed = detail.x !== null || detail.y !== null;
  }
}
```

## 35. React example

```tsx
import { AuiScatterChart } from '@absoluteui/react/scatter-chart';
import type { ScatterChartSeries } from '@absoluteui/components/scatter-chart';

const series: ScatterChartSeries[] = [
  { id: 'a', label: 'Group A', color: 1, points: [{ x: 160, y: 55 }, { x: 175, y: 72 }] },
  { id: 'b', label: 'Group B', color: 3, points: [{ x: 150, y: 48 }, { x: 170, y: 65 }] },
];

export function Example() {
  return (
    <AuiScatterChart
      label="Height and weight"
      series={series}
      xAxis={{ label: 'Height (cm)' }}
      yAxis={{ label: 'Weight (kg)' }}
      zoom="x"
      onZoom={(detail) => console.info(detail.reason)}
    />
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiScatterChart } from '@absoluteui/vue/scatter-chart';
const series = [{ id: 'a', label: 'Group A', points: [{ x: 160, y: 55 }, { x: 175, y: 72 }] }];
</script>

<template>
  <AuiScatterChart label="Height and weight" :series="series" :crosshair="true" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
