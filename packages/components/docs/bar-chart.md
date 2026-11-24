# Bar Chart

> Package: `@absoluteui/components/bar-chart` | Styles: `@absoluteui/components/bar-chart/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

An accessible SVG bar chart for comparing values across categories. It provides:
- vertical bars (columns) or horizontal bars;
- grouped (side by side) or stacked series; negative values grow down (or leftward) from zero, and stacked positives and negatives diverge from the zero baseline;
- gaps for missing values and optional printed value labels;
- a legend of toggle buttons; keyboard-reachable bars (one tab stop, arrow keys) with a tooltip on focus and hover (hover shows every series of the category and, when stacked, the total);
- a generated summary and a data table fallback (with a Total column when stacked);
- per-series textures (with `patterns`) so series never differ by color alone (WCAG 1.4.1).

## 2. Anatomy

```text
<div class="aui-chart aui-bar-chart [aui-bar-chart--horizontal] [aui-bar-chart--stacked] [aui-chart--patterns]">
  <div class="aui-chart__header">title, description</div>
  <ul class="aui-chart__legend" aria-label="Legend">toggle buttons with texture swatches</ul>
  <div class="aui-chart__body">
    <svg class="aui-chart__svg" role="group" aria-roledescription="column chart" aria-labelledby="T" aria-describedby="S">
      <defs><pattern .../></defs>
      <g class="aui-chart__grid" aria-hidden="true"/> <g class="aui-chart__axis …" aria-hidden="true"/>
      <g class="aui-bar-chart__bars">
        <g class="aui-bar-chart__series aui-chart__series--c2">
          <rect class="aui-chart__mark aui-bar-chart__bar" role="img" aria-label="Europe, Closed: 96"/>
          <rect class="aui-chart__pattern" fill="url(#pattern)" aria-hidden="true"/>
        </g>
      </g>
      <g class="aui-bar-chart__labels" aria-hidden="true">value labels</g>
    </svg>
    <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" hidden/>  <div class="aui-chart__data">Show data table, table</div>
</div>
```

## 3. When to use

- Comparing values across discrete categories.
- Stacked: totals and their composition.
- Horizontal: long category labels or many categories.

## 4. When not to use

- Trends over continuous time: use Line Chart.
- A single part-to-whole breakdown with few parts: Pie Chart may read faster.
- Exact lookup of many values: use Data Table.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `zoomRange` | `ChartZoomRange \| null` | Current visible category window, or `null`. |
| `hiddenSeries` | `string[]` | Ids of hidden series. |

Options (`BarChartOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot. |
| `categories` | `string[]` | - (required) | No | Category labels. |
| `series` | `ChartSeries[]` | - (required) | No | One value per category; `null`/`NaN` leave a gap. Each series also takes `style?: { color?; lineWidth?; dash?: 'solid' \| 'dashed' \| 'dotted'; marker?: 'auto' \| 'none' \| 'circle' \| 'square' \| 'diamond' \| 'triangle'; fillOpacity? }`; legend and tooltip keys match it. |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | No | Columns or bars. |
| `layout` | `'grouped' \| 'stacked'` | `'grouped'` | No | Side by side or summed. |
| `categoryAxis` | `{ label? }` | - | No | Category axis title. |
| `valueAxis` | `{ label?; min?; max?; tickCount? }` | - | No | Value axis title, fixed domain (bars clip), ticks (2-20). The automatic domain includes zero. |
| `hideLabel`, `description`, `summary`, `valueFormat`, `formatValue`, `hiddenSeries` | | | No | As in Line Chart. |
| `zoom` | `boolean` | `false` | No | Zoom and pan over categories (vertical columns only; horizontal bars ignore it): toolbar, `+`/`-`/`0` keys, Ctrl/Cmd + wheel, drag, Shift + drag. Turning it off resets the window. |
| `zoomRange` | `{ from: number; to: number } \| null` | `null` | No | Visible category index window; clamped to the data; no event. Use with `zoom: true`. |
| `annotations` | `ChartAnnotation[]` | - | No | Reference lines `{ type: 'line', axis: 'x' \| 'y', value, label?, tone? }` and bands `{ type: 'band', axis, from, to, label?, tone? }` (category axis: label or index; value axis: number; x and y follow the orientation); drawn under the marks, aria-hidden, listed in the summary. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | `auto`: shown with more than one series. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Textures (always on in forced colors). |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000). |
| `valueLabels` | `boolean` | `false` | Yes | Print values on bars. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Mirrors the chart and arrow keys. |

## 6. Methods

| Method | Description |
|---|---|
| `BarChart.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render; invalid options throw and keep the previous state. |
| `setSeriesVisible(id, visible)` | Show or hide a series; no event. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, and configuration subscription. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-series-toggle` | `{ id: string; visible: boolean; hidden: string[] }` | Yes | The user toggled a legend entry. |
| `aui-point-click` | `BarChartPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |
| `aui-zoom` | `BarChartZoomDetail` (= `ChartZoomDetail`): `{ x: ChartZoomRange \| null; y: null; reason }` | Yes | The user changed the visible category window. Not emitted for the `zoomRange` option. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

The shared chart chrome (see Line Chart section 9) plus `aui-bar-chart--horizontal`, `--stacked`, `__bars`, `__series`, `__bar`, `__labels`. All rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`, `__annotations`, `__annotation-line`, `__annotation-band`, `__annotation-label`, `__annotation--neutral|info|success|warning|danger`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/bar-chart/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1..8`, `color-chart-grid`, `color-chart-axis`, `color-surface` (bar separators, textures, label halo), `color-text` (hover outline, value labels), `color-focus-ring`.

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

- Bars: `barRadius` (`--aui-chart-bar-radius`, default 0), rounded at the value end: the top of positive columns, the bottom of negative ones, the inline end of horizontal bars (mirrored in RTL). Stacked bars round only the outermost segment of each direction (positive and negative), so the stack reads as one bar.
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default, empty, all series hidden, series hidden, bar focused (tooltip), category hovered, table open; orientation `vertical | horizontal`; layout `grouped | stacked`.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | legend button | series hidden or shown; `aui-series-toggle`; domain rescales |
| plot not focused | Tab | active bar focused, tooltip shown |
| bar focused | arrow keys, Home, End, PageUp, PageDown | another bar focused |
| tooltip visible | Escape | tooltip hidden |
| table closed | Show data table | table shown |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Legend buttons, the plot (one tab stop), the table button, the table region. |
| ArrowLeft / ArrowRight | Bar focused, vertical | Previous / next category (mirrored in RTL). |
| ArrowUp / ArrowDown | Bar focused, vertical | Previous / next series in the category. |
| ArrowUp / ArrowDown | Bar focused, horizontal | Previous / next category. |
| ArrowLeft / ArrowRight | Bar focused, horizontal | Previous / next series (mirrored in RTL). |
| Home / End, PageUp / PageDown | Bar focused | First / last category; ten categories back / forward. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Legend button | Toggle the series. |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

## 14. ARIA contract

- SVG: `role="group"`, `aria-roledescription` "column chart" (vertical) or "bar chart" (horizontal), `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each bar: `role="img"`, `aria-label` "{category}, {series}: {value}"; exactly one bar has `tabindex="0"`.
- Legend buttons: `aria-pressed`. Table toggle: `aria-expanded`, `aria-controls`.
- Axes, textures, value labels, and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- Bars are separated by a `color-surface` stroke, so stacked segments never depend on contrast between two series colors.
- Textures are the non-color cue for series; keep `patterns` on for grouped or stacked series.
- Forced colors: bars use `CanvasText` with `Canvas` textures; focus and hover use `Highlight`.
- No animation. Manual screen-reader verification is pending.

## 16. Responsive behavior

Width follows the container; category labels are truncated or thinned; horizontal charts reserve at most 40% of the width for labels. Reflows at 320 CSS px.

## 17. RTL behavior

Vertical charts mirror the category axis; horizontal bars grow leftward from a right-hand zero line; axis labels move to the right; ArrowLeft/ArrowRight swap.

## 18. Theme behavior

Series use `color-chart-1..8` (3:1 against surface, background, and sunken surfaces in all themes). Gridlines `color-chart-grid`, axes `color-chart-axis`, labels `color-text-muted`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { barChart: { valueLabels: true, legend: 'show' } } });
```

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable (categories are text).

## 22. Icon customization points

None.

## 23. Security behavior

All text uses `textContent`; SVG uses `createElementNS`; colors are classes; texture fills reference per-instance pattern ids through the `fill` attribute. No `innerHTML` or style attributes.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Budget: create with 50 categories x 4 series under 30 ms including the first render (e2e performance test, median of 5).

## 26. Supported data scale

Up to about 200 bars (each is one focusable node plus one texture overlay). Aggregate larger data first or use a Data Table.

## 27. Usage examples

```ts
import { BarChart } from '@absoluteui/components/bar-chart';

const host = document.createElement('div');
document.body.append(host);
BarChart.create(host, {
  label: 'Orders by channel',
  categories: ['Web', 'Store', 'Phone'],
  series: [{ id: 'orders', label: 'Orders', values: [420, 310, 95] }],
  valueLabels: true,
});
```

More examples, type-checked in CI: `metadata/bar-chart/examples.json`.

## 28. Edge cases

- Empty categories or series: "No data"; every series hidden: "All series are hidden".
- Missing values: no bar, "No value" in the table; stacked totals treat them as 0.
- Negative values: grouped bars grow below zero; stacked positives and negatives stack separately.
- A fixed `valueAxis` domain clips bars at its edges.
- Long category labels are truncated with an ellipsis; the full text stays in bar labels, tooltip, and table.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `BAR_CHART_OPTIONS` | configuration | Missing label; categories not strings; duplicate series ids; values length differs from categories; invalid orientation, layout, or axis options. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched.

## 30. Known limitations

- One value per category per series.
- Stacked value labels are printed only inside segments that fit them.
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.
- Zoom applies to vertical (column) charts only; horizontal bar charts ignore `zoom`.

## 31. Unsupported scenarios

- 100% stacked, waterfall, bullet, and combo charts.
- Logarithmic or broken axes; zoom, selection, export.
- HTML in labels.

## 32. TypeScript definitions

```ts
interface BarChartConfig extends ChartBaseConfig { valueLabels: boolean }
interface BarChartOptions extends ChartCommonOptions, Partial<BarChartConfig> {
  categories: readonly string[];
  series: readonly ChartSeries[];
  orientation?: 'vertical' | 'horizontal';
  layout?: 'grouped' | 'stacked';
  categoryAxis?: { label?: string };
  valueAxis?: { label?: string; min?: number; max?: number; tickCount?: number };
}
interface BarChartSeriesToggleDetail { id: string; visible: boolean; hidden: string[] }
```

## 33. Vanilla JS example

```ts
import { BarChart } from '@absoluteui/components/bar-chart';
import '@absoluteui/components/bar-chart/style.css';

const host = document.querySelector<HTMLElement>('#budget');
if (host) {
  BarChart.create(host, {
    label: 'Budget variance',
    categories: ['Engineering', 'Marketing'],
    series: [
      { id: 'capex', label: 'Capital', values: [40, -12] },
      { id: 'opex', label: 'Operating', values: [25, 18] },
    ],
    orientation: 'horizontal',
    layout: 'stacked',
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiBarChart } from '@absoluteui/angular/bar-chart';
import type { ChartSeries } from '@absoluteui/components/bar-chart';

@Component({
  selector: 'app-orders',
  imports: [AuiBarChart],
  template: `<aui-bar-chart label="Orders by channel" [categories]="channels" [series]="series" layout="stacked"></aui-bar-chart>`,
})
export class OrdersComponent {
  readonly channels = ['Web', 'Store'];
  readonly series: ChartSeries[] = [{ id: 'orders', label: 'Orders', values: [420, 310] }];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
