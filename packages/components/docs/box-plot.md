# Box Plot

> Package: `@absoluteui/components/box-plot` | Styles: `@absoluteui/components/box-plot/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

An accessible SVG box plot for comparing distributions across categories. It provides:
- one box per category and series, from the lower to the upper quartile, with a median line, capped whiskers, and outlier dots;
- data as precomputed statistics (`{ min, q1, median, q3, max, outliers? }`) or raw values; raw values use type-7 quantiles (linear interpolation, as in spreadsheets) and Tukey whiskers at 1.5 IQR (`whiskers: 'tukey'`) or min/max whiskers without outliers (`'minmax'`);
- several series grouped side by side, with a legend of toggle buttons and textures (with `patterns`) so series never differ by color alone;
- keyboard-reachable boxes (one tab stop, arrow keys) whose names read the five-number summary and outlier count, with a tooltip on focus and hover;
- a generated summary and a data table fallback with every statistic and the outlier values;
- the module functions `boxStats` and `quantile`, to precompute statistics with the same rules.

## 2. Anatomy

```text
<div class="aui-chart aui-box-plot [aui-chart--patterns]">
  <div class="aui-chart__header">title, description</div>
  <ul class="aui-chart__legend" aria-label="Legend">toggle buttons with texture swatches (more than one series)</ul>
  <div class="aui-chart__body">
    <svg class="aui-chart__svg" role="group" aria-roledescription="box plot" aria-labelledby="T" aria-describedby="S">
      <g class="aui-chart__grid" aria-hidden="true"/> <g class="aui-chart__axis …" aria-hidden="true"/>
      <g class="aui-box-plot__boxes">
        <g class="aui-box-plot__series aui-chart__series--c1">
          <g class="aui-box-plot__whiskers" aria-hidden="true">
            <path class="aui-box-plot__whisker"/> <circle class="aui-box-plot__outlier"/>
          </g>
          <rect class="aui-box-plot__box aui-chart__mark" role="img" aria-label="EU, Prod: median 14, quartiles 12 to 16, whiskers 10 to 16, 1 outlier"/>
          <rect class="aui-chart__pattern" aria-hidden="true"/>   (second and later series)
          <line class="aui-box-plot__median" aria-hidden="true"/>
        </g>
      </g>
    </svg>
    <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" hidden/>  <div class="aui-chart__data">Show data table, table</div>
</div>
```

## 3. When to use

- Comparing spread, skew, and outliers of a measure across categories (for example latency per region).
- Summarizing many raw values per category.

## 4. When not to use

- Few values per category: show the values (Scatter Chart).
- Audiences unfamiliar with quartiles: a Bar Chart of medians may read faster.
- The detailed shape of one distribution: use Histogram.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Ids of hidden series. |

Options (`BoxPlotOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot. |
| `categories` | `string[]` | - (required) | No | Category labels. |
| `series` | `BoxPlotSeries[]` | - (required) | No | `{ id, label, data, color?: 1-8 }`, one datum per category: `BoxPlotStats`, `number[]`, or `null`. |
| `categoryAxis` | `{ label? }` | - | No | Category axis title (also the first table column header). |
| `valueAxis` | `BoxPlotValueAxis` | - | No | `{ label?; min?; max?; tickCount?; includeZero? }`: title, fixed domain (marks clamp), ticks (2-20). `includeZero` is validated but has no effect here. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the title. |
| `description` | `string` | - | No | Visible description, also in `aria-describedby`. |
| `summary` | `string` | generated | No | Replaces the generated summary. |
| `valueFormat` | `Intl.NumberFormatOptions` | - | No | Statistic format (names, tooltip, table, summary, ticks). |
| `formatValue` | `(value: number) => string` | - | No | Custom value text; overrides `valueFormat` except on ticks. |
| `hiddenSeries` | `string[]` | - | No | Series hidden initially. |
| `annotations` | `ChartAnnotation[]` | - | No | Reference lines `{ type: 'line', axis: 'x' \| 'y', value, label?, tone? }` and bands `{ type: 'band', axis, from, to, label?, tone? }` (x: category label or index; y: number); drawn under the marks, aria-hidden, listed in the summary. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | `auto`: shown with more than one series. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Textures on the second and later series (always on in forced colors). |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000). |
| `whiskers` | `'tukey' \| 'minmax'` | `'tukey'` | Yes | Whisker rule for raw values; precomputed statistics are drawn as given. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number, list, and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Mirrors the chart and arrow keys. |

## 6. Methods

| Method | Description |
|---|---|
| `BoxPlot.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render; invalid options throw and keep the previous state. |
| `setSeriesVisible(id, visible)` | Show or hide a series; no event. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, and configuration subscription. |

Module functions (exported from `@absoluteui/components/box-plot`, usable without a chart):

| Function | Description |
|---|---|
| `boxStats(values, whiskers = 'tukey')` | `BoxPlotStats \| null`: five-number summary and outliers of raw values, with exactly the chart's rules (non-finite values ignored). `null` when no finite value remains. |
| `quantile(sorted, p)` | Quantile `p` (0-1) of ascending values, linear interpolation (Hyndman-Fan type 7). `NaN` for an empty array; the input must be sorted. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-series-toggle` | `{ id: string; visible: boolean; hidden: string[] }` | Yes | The user toggled a legend entry. Not emitted for `update()` or `setSeriesVisible()`. |
| `aui-point-click` | `BoxPlotPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

The shared chart chrome (see Line Chart section 9) plus `aui-box-plot__boxes`, `__series`, `__box`, `__median`, `__whiskers`, `__whisker`, `__outlier`. All rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`, `__annotations`, `__annotation-line`, `__annotation-band`, `__annotation-label`, `__annotation--neutral|info|success|warning|danger`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/box-plot/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1..8` (box fill and outline, whiskers, outlier outline), `color-text` (median, hover and focus outline), `color-surface` (outlier fill, textures), `color-chart-grid`, `color-chart-axis`, `color-focus-ring`.

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

- Boxes: `boxRadius` (`--aui-chart-box-radius`, default 0). Whiskers are lines; outliers are circles.
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default, empty, all series hidden, series hidden, box missing, box focused (tooltip), box hovered, table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | legend button | series hidden or shown; `aui-series-toggle`; domain rescales |
| plot not focused | Tab | active box focused, tooltip shown |
| box focused | arrow keys, Home, End, PageUp, PageDown | another box focused |
| tooltip visible | Escape | tooltip hidden |
| table closed | Show data table | table shown |
| any | `update({ whiskers })` | raw-value boxes recomputed |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Legend buttons, the plot (one tab stop), the table button, the table region. |
| ArrowLeft / ArrowRight | Box focused | Previous / next category in the series (mirrored in RTL). |
| ArrowUp / ArrowDown | Box focused, several visible series | Same category in the previous / next series (nearest box). |
| ArrowUp / ArrowDown | Box focused, one visible series | Previous / next category. |
| Home / End, PageUp / PageDown | Box focused | First / last box; ten boxes back / forward. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Legend button | Toggle the series. |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

## 14. ARIA contract

- SVG: `role="group"`, `aria-roledescription` "box plot", `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each box: `role="img"`, `aria-label` "{category}, {series}: median {median}, quartiles {q1} to {q3}, whiskers {min} to {max}", plus ", {n} outlier(s)" when there are outliers; exactly one box has `tabindex="0"`.
- Legend buttons: `aria-pressed`. Table toggle: `aria-expanded`, `aria-controls`.
- Axes, whiskers, medians, outlier dots, textures, and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- The box name carries the full five-number summary and the outlier count; outliers themselves are decorative dots, and their values are in the table's Outliers column.
- Textures are the non-color cue for series; keep `patterns` on with several series.
- Box outlines use the series color (3:1 against surfaces); the translucent fill is decorative.
- Forced colors: medians `CanvasText`, outliers `Canvas`-filled; focus and hover use `Highlight`.
- No animation. Manual screen-reader verification is pending.

## 16. Responsive behavior

Width follows the container; each category gets a band shared by its series' boxes. Category labels are truncated or thinned. Reflows at 320 CSS px.

## 17. RTL behavior

The category axis runs right to left, series order within a category is mirrored, the value axis moves to the right, and ArrowLeft/ArrowRight swap.

## 18. Theme behavior

Series use `color-chart-1..8` (3:1 against surface, background, and sunken surfaces in all themes). Gridlines `color-chart-grid`, axes `color-chart-axis`, labels `color-text-muted`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { boxPlot: { whiskers: 'minmax', legend: 'show' } } });
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

Raw values are summarized in memory on each render; nothing is persisted, sent, or logged.

## 25. Performance characteristics

Budget: 4 series x 50 categories from raw values (100 values each) < 80 ms in headless Chromium (e2e performance test), including the first render. Raw values are sorted per box on every render; pass `boxStats` results for large samples.

## 26. Supported data scale

Up to about 200 boxes (each is one focusable node plus whiskers, a median, an optional texture overlay, and one dot per outlier). Aggregate or precompute larger data.

## 27. Usage examples

```ts
import { BoxPlot, boxStats } from '@absoluteui/components/box-plot';

const host = document.createElement('div');
document.body.append(host);
BoxPlot.create(host, {
  label: 'Latency',
  categories: ['EU', 'US'],
  series: [{ id: 'prod', label: 'Prod', data: [[10, 12, 14, 16, 90], boxStats([8, 10, 11, 13, 15])] }],
});
```

More examples, type-checked in CI: `metadata/box-plot/examples.json`.

## 28. Edge cases

- No categories or series, or every datum empty: "No data"; every series hidden: "All series are hidden".
- `null` datum, or raw values with no finite number: no box; "No value" in every table cell of that row.
- A single raw value: a flat box (quartiles, median, and whiskers equal).
- Precomputed statistics are drawn as given (`whiskers` does not apply); `outliers` defaults to none.
- A fixed `valueAxis` domain clamps boxes, whiskers, and outliers to its edges.
- Long category labels are truncated; the full text stays in box names, tooltip, and table.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `BOX_PLOT_OPTIONS` | configuration | Blank label; categories not strings; series not an array; empty or duplicate id; label not a string; `color` not 1-8; data length differs from categories; raw values not numbers; statistics not finite or not ordered `min <= q1 <= median <= q3 <= max`; `outliers` not finite numbers; invalid `categoryAxis` or `valueAxis` (`max <= min`, `tickCount` outside 2-20). |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration (for example `whiskers: 'iqr'`). |

A failed construction leaves the host untouched.

## 30. Known limitations

- Vertical boxes only; one datum per category per series.
- Outliers are not individually focusable.
- `valueAxis.includeZero` has no effect.
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.
- No zoom or pan: categories are few by design; use fewer categories instead.

## 31. Unsupported scenarios

- Horizontal, notched, or violin plots; mean markers.
- Logarithmic or broken axes.
- HTML in labels.

## 32. TypeScript definitions

```ts
type BoxPlotWhiskers = 'tukey' | 'minmax';
interface BoxPlotConfig extends ChartBaseConfig { whiskers: BoxPlotWhiskers }
interface BoxPlotStats { min: number; q1: number; median: number; q3: number; max: number; outliers?: readonly number[] }
type BoxPlotDatum = BoxPlotStats | readonly number[] | null;
interface BoxPlotSeries { id: string; label: string; data: readonly BoxPlotDatum[]; color?: ChartColor }
interface BoxPlotOptions extends ChartCommonOptions, Partial<BoxPlotConfig> {
  categories: readonly string[];
  series: readonly BoxPlotSeries[];
  categoryAxis?: { label?: string };
  valueAxis?: BoxPlotValueAxis; // { label?; min?; max?; tickCount?; includeZero? }
}
type BoxPlotSeriesToggleDetail = { id: string; visible: boolean; hidden: string[] };
function boxStats(values: readonly number[], whiskers?: BoxPlotWhiskers): BoxPlotStats | null;
function quantile(sorted: readonly number[], p: number): number;
```

## 33. Vanilla JS example

```ts
import { BoxPlot } from '@absoluteui/components/box-plot';
import '@absoluteui/components/box-plot/style.css';

const host = document.querySelector<HTMLElement>('#scores');
if (host) {
  const chart = BoxPlot.create(host, {
    label: 'Test scores by class',
    categories: ['Class A', 'Class B'],
    series: [
      { id: 'math', label: 'Math', data: [[62, 70, 71, 78, 85, 99], [55, 60, 68, 72, 74]] },
      { id: 'reading', label: 'Reading', data: [[66, 72, 75, 80, 88], [58, 64, 70, 76, 82]] },
    ],
    valueAxis: { label: 'Score', min: 0, max: 100 },
  });
  chart.host.addEventListener('aui-series-toggle', (e) => {
    console.log(e);
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiBoxPlot } from '@absoluteui/angular/box-plot';
import type { BoxPlotSeries } from '@absoluteui/components/box-plot';

@Component({
  selector: 'app-latency',
  imports: [AuiBoxPlot],
  template: `<aui-box-plot label="Latency by region" [categories]="regions" [series]="series"></aui-box-plot>`,
})
export class LatencyComponent {
  readonly regions = ['EU', 'US'];
  readonly series: BoxPlotSeries[] = [{ id: 'prod', label: 'Prod', data: [[10, 12, 14, 16, 90], [8, 10, 11, 13, 15]] }];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
