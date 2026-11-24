# Combo Chart

> Package: `@absoluteui/components/combo-chart` | Styles: `@absoluteui/components/combo-chart/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

An accessible SVG chart that combines bars, lines, and areas over shared categories. It provides:
- per-series type (`bar`, `line`, `area`) and value axis (primary at the start side, secondary at the end side, each with its own number format);
- grouped or stacked bars inside each category band; lines and areas through the band centers, with gaps for missing values;
- a legend of toggle buttons that show and hide series;
- keyboard-reachable marks (one tab stop) with a tooltip on focus, and a category tooltip listing every series on hover;
- an optional vertical crosshair and optional zoom and pan over categories;
- a generated accessible summary and a data table fallback with the exact values;
- series that differ by texture (bars), dash pattern and marker shape (lines), never by color alone (WCAG 1.4.1).

## 2. Anatomy

```text
<div class="aui-chart aui-combo-chart [aui-chart--patterns] [aui-chart--zoomable] [aui-chart--zoomed]">
  <div class="aui-chart__header">
    <div class="aui-chart__title" id="T">title</div>
    <p class="aui-chart__description" id="D">description</p>
    <div class="aui-chart__toolbar">                                (zoom: true; hidden otherwise)
      <div class="aui-chart__zoom" role="group" aria-label="Zoom"><button class="aui-chart__tool" aria-label="Zoom in"/>...</div>
    </div>
  </div>
  <ul class="aui-chart__legend" aria-label="Legend">
    <li class="aui-chart__legend-entry"><button class="aui-chart__legend-item" aria-pressed="true"><svg class="aui-chart__swatch" aria-hidden="true"/>Revenue</button></li>
  </ul>
  <div class="aui-chart__body">                                   (height: --aui-chart-height)
    <svg class="aui-chart__svg" role="group" aria-roledescription="combo chart" aria-labelledby="T" aria-describedby="D S">
      <g class="aui-chart__crosshair" aria-hidden="true">...</g>   (crosshair: true)
      <g class="aui-chart__grid" aria-hidden="true"/> <g class="aui-chart__axis …" aria-hidden="true"/> <g class="aui-chart__axis aui-chart__axis--value aui-chart__axis--secondary" aria-hidden="true"/>
      <g class="aui-combo-chart__bars"><g class="aui-combo-chart__series aui-chart__series--c1"><rect class="aui-chart__mark aui-chart__bar" role="img" aria-label="Q1, Revenue: 120" tabindex="0"/><rect class="aui-chart__pattern" aria-hidden="true"/>...</g></g>
      <g class="aui-combo-chart__lines"><g class="aui-combo-chart__series aui-chart__series--c2" aria-hidden="true"><path class="aui-chart__area"/><path class="aui-chart__line aui-chart__dash--2"/></g></g>
      <g class="aui-combo-chart__points"><g class="aui-combo-chart__series aui-chart__series--c2"><path class="aui-chart__mark aui-chart__point" role="img" aria-label="Q1, Margin: 32%"/>...</g></g>
    </svg>
    <div class="aui-chart__empty" hidden/>  <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" id="S" hidden>generated summary</p>
  <div class="aui-chart__data"><button class="aui-chart__table-toggle" aria-expanded="false" aria-controls="R">Show data table</button><div class="aui-chart__table-scroll" id="R" role="region"><table class="aui-chart__table">...</table></div></div>
</div>
```

## 3. When to use

- Two related measures on different scales (revenue as bars, margin as a line on the secondary axis).
- Actuals as bars with a target or average as a line.
- A few series (up to about 8) over the same categories.

## 4. When not to use

- One kind of mark only: use Bar Chart or Line Chart.
- Numeric or time x values: use Line Chart or Scatter Chart.
- Part-to-whole: use Pie Chart or a stacked Bar Chart.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Ids of hidden series, in data order. |
| `zoomRange` | `ChartZoomRange \| null` | Current visible category index window, or `null`. |

Options (`ComboChartOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot. |
| `categories` | `string[]` | - (required) | No | Shared categories, in order. |
| `series` | `ComboChartSeries[]` | - (required) | No | `{ id, label, values, type: 'bar' \| 'line' \| 'area', axis?: 'primary' \| 'secondary', color? }`; one value per category; `null` is a gap. Each series also takes `style?: { color?; lineWidth?; dash?: 'solid' \| 'dashed' \| 'dotted'; marker?: 'auto' \| 'none' \| 'circle' \| 'square' \| 'diamond' \| 'triangle'; fillOpacity? }`; legend and tooltip keys match it. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the title. |
| `description` | `string` | - | No | Visible description, also in `aria-describedby`. |
| `summary` | `string` | generated | No | Replaces the generated summary. |
| `stacked` | `boolean` | `false` | No | Stack bar series per axis (positive and negative separately); lines and areas never stack. |
| `categoryAxis` | `{ label? }` | - | No | Category axis title (and first table column header). |
| `primaryAxis` | `{ label?; min?; max?; tickCount?; includeZero?; format? }` | - | No | Start-side value axis; `format` formats its values (default `valueFormat`). |
| `secondaryAxis` | `{ label?; min?; max?; tickCount?; includeZero?; format? }` | - | No | End-side value axis, drawn when a visible series uses it (tick labels only; tick count follows the primary axis unless set). |
| `valueFormat` | `Intl.NumberFormatOptions` | - | No | Default value format for both axes. |
| `formatValue` | `(value) => string` | - | No | Custom value text for both axes (not used for ticks). |
| `hiddenSeries` | `string[]` | `[]` | No | Hidden series ids. |
| `zoom` | `boolean` | `false` | No | Zoom and pan over categories. Turning it off resets the window. |
| `zoomRange` | `{ from; to } \| null` | `null` | No | Visible category index window; clamped to at least two categories; no event. Use with `zoom: true`. |
| `annotations` | `ChartAnnotation[]` | - | No | Reference lines `{ type: 'line', axis: 'x' \| 'y', value, label?, tone? }` and bands `{ type: 'band', axis, from, to, label?, tone? }` (x: category label or index; y: primary-axis number); drawn under the marks, aria-hidden, listed in the summary. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | `auto` and `show` display the legend (also for one series); `hide` removes it. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Bar textures (always on in forced colors). |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000). |
| `crosshair` | `boolean` | `false` | Yes | Vertical crosshair on the hovered or focused category. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Mirrors the category axis, axis sides, and arrow keys. |

## 6. Methods

| Method | Description |
|---|---|
| `ComboChart.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render. Invalid options throw and keep the previous state; focus stays on the same mark. |
| `setSeriesVisible(id, visible)` | Show or hide a series; no event. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, zoom handlers, and configuration subscription. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-series-toggle` | `ComboChartSeriesToggleDetail`: `{ id: string; visible: boolean; hidden: string[] }` | Yes | The user toggled a legend entry. Not emitted for `update()` or `setSeriesVisible()`. |
| `aui-zoom` | `ComboChartZoomDetail` (= `ChartZoomDetail`): `{ x: ChartZoomRange \| null; y: null; reason: 'button' \| 'keyboard' \| 'wheel' \| 'pan' \| 'select' \| 'reset' }` | Yes | The user changed the visible category window (`x` in category indices; `null` = everything). Not emitted for the `zoomRange` option. Not cancelable. |
| `aui-point-click` | `ComboChartPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |

## 8. Slots/content areas

None. Title, description, labels, and values are text.

## 9. CSS parts/hooks

Shared chart chrome (see Line Chart) plus interaction hooks `aui-chart--zoomable`, `aui-chart--zoomed`, `__toolbar`, `__zoom`, `__tool`, `__crosshair`, `__crosshair-line`, `__brush`, shared marks `aui-chart__bar`, `__line`, `__area`, `__point`, `__pattern`, `__dash--1..4`, and the secondary axis `aui-chart__axis--secondary`. Combo: `aui-combo-chart__bars`, `__lines`, `__points`, `__series`. Colors are `--aui-chart-color`; all rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`, `__annotations`, `__annotation-line`, `__annotation-band`, `__annotation-label`, `__annotation--neutral|info|success|warning|danger`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/combo-chart/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1` ... `color-chart-8`, `color-chart-grid`, `color-chart-axis` (axes, crosshair), `color-surface` (bar separators, marker outlines, tooltip), `color-text` (active bar outline), `color-focus-ring`.

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

- Bars: `barRadius` (`--aui-chart-bar-radius`, default 0) at the value end; stacked bars round only the outermost segment of each direction.
- Line joins: `lineJoin` (`--aui-chart-line-join`: `round` (default), `miter`, `bevel`).
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default, empty ("No data"), all series hidden ("All series are hidden"), series hidden, mark focused (tooltip), hovered (category tooltip), crosshair shown, zoomed, panning or selecting (pointer drag), table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | legend button (click, Enter, Space) | series hidden or shown; `aui-series-toggle` emitted; axes rescale |
| plot not focused | Tab | active mark focused, tooltip shown |
| mark focused | arrow keys, Home, End, PageUp, PageDown | another mark focused |
| tooltip visible | Escape | tooltip hidden, focus unchanged |
| not zoomed | Zoom in, `+`/`=`, Ctrl/Cmd + wheel up, Shift + drag | zoomed; "Showing {first} to {last}." announced with category names; `aui-zoom` emitted |
| zoomed | Zoom out, `-`, drag, arrow key past the window edge | window widened or moved; announced; `aui-zoom` emitted |
| zoomed | Reset zoom, `0` | all categories shown ("Showing all data."); `aui-zoom` with `x: null` |
| table closed | Show data table | table built and shown |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Zoom buttons (with `zoom`), legend buttons, the plot (one tab stop), the table button, the table region. |
| ArrowLeft / ArrowRight | Mark focused | Previous / next category of the series (gaps skipped; mirrored in RTL). Zoomed: past the window edge the window pans to the next value. |
| ArrowUp / ArrowDown | Mark focused | Same (or nearest) category in the previous / next visible series. |
| Home / End | Mark focused | First / last mark of the series. |
| PageUp / PageDown | Mark focused | Ten marks back / forward. |
| `+` / `=` | Mark focused, `zoom: true` | Zoom in around the focused category. |
| `-` | Mark focused, `zoom: true` | Zoom out. |
| `0` | Mark focused, `zoom: true` | Reset zoom. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Legend button / zoom button | Toggle the series / run the zoom action (ignored while `aria-disabled`). |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

Pointer: Ctrl/Cmd + wheel zooms around the pointer (a plain wheel scrolls the page); dragging pans a zoomed chart; Shift + drag selects a category range.

## 14. ARIA contract

- The SVG is `role="group"`, `aria-roledescription` = localized "combo chart", `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each bar and line/area point is `role="img"` with `aria-label` "{category}, {series}: {value}" formatted with its axis format (for example "Q2, Margin: 40%"); exactly one mark has `tabindex="0"`.
- Legend: `ul` named "Legend"; entries are `button`s with `aria-pressed`.
- Zoom toolbar: `role="group"` named "Zoom" with "Zoom in", "Zoom out", "Reset zoom"; unavailable actions carry `aria-disabled="true"`.
- Axes, lines, areas, textures, the crosshair, the selection brush, and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- The summary names the type, series and category counts, the category range, the primary (and secondary) axis range, each series' minimum, maximum, and trend, missing values, and hidden series.
- Bars carry textures; lines carry dash patterns and marker shapes; legend keys repeat them. Forced colors use `CanvasText` and keep shapes and textures; focus uses `Highlight`.
- Zoom changes are announced politely; every pointer gesture has a keyboard and toolbar equivalent. The crosshair follows hover and keyboard focus and is `aria-hidden`.
- Name the secondary axis with `secondaryAxis.label`; otherwise the summary calls it "Secondary axis".
- Manual screen-reader verification is pending.

## 16. Responsive behavior

The width follows the container (ResizeObserver); the height is `height`. Category labels thin and truncate with the band width; each value axis reserves the width of its labels. Reflows at 320 CSS px.

## 17. RTL behavior

`direction: 'rtl'` mirrors the category axis (first category at the right), puts the primary axis on the right and the secondary on the left, reverses bar order within a group, and swaps ArrowLeft/ArrowRight.

## 18. Theme behavior

Series colors come from `color-chart-1..8` by palette slot (series position, or `color`). Bars are separated by a `color-surface` stroke; areas are a 12% fill of the series color under the line.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { comboChart: { crosshair: true, legend: 'show', height: 320 } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic. `zoom` and `zoomRange` are instance-only.

## 21. Timezone behavior

Not applicable: categories are text; no dates are formatted.

## 22. Icon customization points

No `icons` option. The zoom buttons render the icons `plus`, `minus`, and `refresh` through `@absoluteui/icons`; a global icon provider or registry entry for those names replaces them in every component that uses them.

## 23. Security behavior

All text uses `textContent`; SVG is built with `createElementNS`. Colors are classes; sizes and the tooltip position are written through the CSSOM. No `innerHTML`, style attributes, or inline handlers.

## 24. Data handling behavior

Renders the given data only; no persistence, network access, or telemetry. Validation errors name the option, never its value.

## 25. Performance characteristics

Budget: `ComboChart.create` with 3 series x 200 categories under 60 ms in headless Chromium, including the first render (e2e performance test, `tests/e2e/perf-r3.spec.ts`). One DOM node per bar and per line point (no virtual marks); the data table is built only when opened in toggle mode.

## 26. Supported data scale

Tested with 3 series x 200 categories. For longer category lists, enable `zoom` to show a window.

## 27. Usage examples

```ts
import { ComboChart, type ComboChartSeries } from '@absoluteui/components/combo-chart';

const series: ComboChartSeries[] = [
  { id: 'rev', label: 'Revenue', type: 'bar', values: [120, 150, 170] },
  { id: 'margin', label: 'Margin', type: 'line', axis: 'secondary', values: [0.32, 0.4, 0.38] },
];
const host = document.createElement('div');
document.body.append(host);
ComboChart.create(host, { label: 'Revenue and margin', categories: ['Q1', 'Q2', 'Q3'], series, secondaryAxis: { label: 'Margin', format: { style: 'percent' } } });
```

More examples, type-checked in CI: `metadata/combo-chart/examples.json`.

Export: `@absoluteui/components/chart-export` (`chartToSvg`, `chartToPng`, `downloadChart`) exports any chart instance to SVG or PNG.

## 28. Edge cases

- No categories or no series, or only missing values: "No data".
- Every series hidden: "All series are hidden".
- An axis with bars or areas always includes zero; a line-only axis includes zero only with `includeZero`.
- Values outside a fixed `min`/`max` are clamped to the plot edge.
- `formatValue` overrides both axis formats.
- The secondary axis appears only while a visible series uses it.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `COMBO_CHART_OPTIONS` | configuration | Missing label; categories not strings; series ids not unique; invalid `type` or `axis`; values length differs from categories; invalid axis options or `format`; invalid `zoom` or `zoomRange`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched; a failed `update()` keeps the previous state.

## 30. Known limitations

- Each series needs one value per category.
- Only bars stack; the secondary axis has no gridlines.
- Axis label widths are estimated (about 0.6 em per character).
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.

## 31. Unsupported scenarios

- More than two value axes; logarithmic axes.
- Numeric or time category axes.
- Zoom on the value axes; linked zoom across charts.
- HTML in labels or tooltips.

## 32. TypeScript definitions

```ts
type ComboChartSeriesType = 'bar' | 'line' | 'area';
type ComboChartAxisSide = 'primary' | 'secondary';
interface ComboChartSeries extends ChartSeries { type: ComboChartSeriesType; axis?: ComboChartAxisSide }
interface ComboChartValueAxis { readonly label?: string; readonly min?: number; readonly max?: number; readonly tickCount?: number; readonly includeZero?: boolean; format?: Intl.NumberFormatOptions }
interface ComboChartConfig { legend: ChartLegendMode; dataTable: ChartTableMode; tooltip: boolean; patterns: boolean; height: number; crosshair: boolean }
interface ComboChartOptions extends ChartCommonOptions, Partial<ComboChartConfig> {
  categories: readonly string[];
  series: readonly ComboChartSeries[];
  stacked?: boolean;
  categoryAxis?: { label?: string };
  primaryAxis?: ComboChartValueAxis;
  secondaryAxis?: ComboChartValueAxis;
  zoom?: boolean;
  zoomRange?: ChartZoomRange | null;
}
type ComboChartSeriesToggleDetail = { id: string; visible: boolean; hidden: string[] };
type ComboChartZoomDetail = { x: ChartZoomRange | null; y: ChartZoomRange | null; reason: 'button' | 'keyboard' | 'wheel' | 'pan' | 'select' | 'reset' };
```

## 33. Vanilla JS example

```ts
import { ComboChart } from '@absoluteui/components/combo-chart';
import '@absoluteui/components/combo-chart/style.css';

const host = document.querySelector<HTMLElement>('#sales');
if (host) {
  ComboChart.create(host, {
    label: 'Sales and target',
    categories: ['Jan', 'Feb', 'Mar', 'Apr'],
    series: [
      { id: 'sales', label: 'Sales', type: 'bar', values: [80, 95, null, 110] },
      { id: 'target', label: 'Target', type: 'line', values: [90, 90, 100, 100] },
    ],
    zoom: true,
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiComboChart } from '@absoluteui/angular/combo-chart';
import type { ComboChartSeries } from '@absoluteui/components/combo-chart';

@Component({
  selector: 'app-revenue-margin',
  imports: [AuiComboChart],
  template: `<aui-combo-chart label="Revenue and margin" [categories]="quarters" [series]="series" [zoom]="true" (seriesToggled)="hidden = $event.hidden"></aui-combo-chart>`,
})
export class RevenueMarginComponent {
  readonly quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  readonly series: ComboChartSeries[] = [
    { id: 'rev', label: 'Revenue', type: 'bar', values: [120, 150, 170, 160] },
    { id: 'margin', label: 'Margin', type: 'line', axis: 'secondary', values: [0.32, 0.4, 0.38, 0.41] },
  ];
  hidden: string[] = [];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
