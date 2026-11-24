# Histogram

> Package: `@absoluteui/components/histogram` | Styles: `@absoluteui/components/histogram/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

An accessible SVG histogram of the distribution of raw numeric values in adjacent bins on a linear x axis. It provides:
- automatic bins (Sturges' rule on nice boundaries), a bin count, or explicit thresholds; bins are lower-inclusive and the last bin is also upper-inclusive;
- the binning as a reusable module function, `computeBins`, which also reports missing and out-of-range values;
- keyboard-reachable bins (one tab stop), including empty bins, with a tooltip on focus and hover ("10 to 20: 14 values");
- a count axis that prints integer ticks only;
- a generated accessible summary (value count, bin count, binned range, most frequent bin, values outside the bins) and a data table fallback (bin, count).

## 2. Anatomy

```text
<div class="aui-chart aui-histogram [aui-chart--patterns]">
  <div class="aui-chart__header">
    <div class="aui-chart__title" id="T">title</div>
    <p class="aui-chart__description" id="D">description</p>
    <div class="aui-chart__toolbar" hidden/>
  </div>
  <ul class="aui-chart__legend" aria-label="Legend" hidden/>           (always empty)
  <div class="aui-chart__body">                                   (height: --aui-chart-height)
    <svg class="aui-chart__svg" role="group" aria-roledescription="histogram" aria-labelledby="T" aria-describedby="D S">
      <g class="aui-chart__grid" aria-hidden="true"/> <g class="aui-chart__axis …" aria-hidden="true"/>
      <g class="aui-histogram__bars aui-chart__series--c1">
        <rect class="aui-chart__mark aui-chart__bar" role="img" aria-label="0 to 10: 14 values" tabindex="0"/>
        <rect class="aui-chart__mark aui-chart__bar" role="img" aria-label="10 to 20: 0 values"/>
      </g>
    </svg>
    <div class="aui-chart__empty" hidden/>  <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" id="S" hidden>generated summary</p>
  <div class="aui-chart__data">...Show data table...</div>
</div>
```

## 3. When to use

- The shape of a distribution of one numeric variable (response times, amounts, scores).
- Checking skew, spread, and outliers before choosing a summary statistic.

## 4. When not to use

- Comparing categories: use Bar Chart.
- Comparing distributions of several groups: use Box Plot.
- Relationships between two variables: use Scatter Chart.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `bins` | `readonly HistogramBin[]` | Bins of the current data: `{ from, to, count }`. |
| `hiddenSeries` | `string[]` | Always empty (one data set). |

Options (`HistogramOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot. |
| `values` | `readonly (number \| null)[]` | - (required) | No | Raw values; `null`, `NaN`, and infinities are ignored (counted as missing). |
| `bins` | `'auto' \| number \| readonly number[]` | `'auto'` | No | `auto`: Sturges' rule (`ceil(log2(n) + 1)` bins) on nice boundaries; a number (integer 1-500): about that many bins on nice boundaries; an array: 2-501 ascending thresholds (bin edges). |
| `min` | `number` | nice boundary at or below the data minimum | No | Exact first edge for `auto` or count bins. Ignored for binning with explicit thresholds. |
| `max` | `number` | nice boundary at or above the data maximum | No | Exact last edge (greater than `min`). Ignored for binning with explicit thresholds. |
| `color` | `ChartColor` (1-8) | `1` | No | Palette slot of the bars. |
| `binFormat` | `Intl.NumberFormatOptions` | `formatValue`, else `valueFormat` | No | Format of bin boundaries (x axis, bar labels, tooltips, table, summary). |
| `xAxis` | `{ label? }` | - | No | X axis title (and first table column header; default "Bin"). |
| `yAxis` | `{ label?; min?; max?; tickCount?; includeZero? }` | - | No | Count axis title (default "Count", always drawn), fixed domain, tick count (2-20). Integer ticks only; `includeZero` has no effect. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the title. |
| `description` | `string` | - | No | Visible description, also in `aria-describedby`. |
| `summary` | `string` | generated | No | Replaces the generated summary. |
| `valueFormat` | `Intl.NumberFormatOptions` | - | No | Bin boundary format when `binFormat` is not set. Counts always use the plain locale format. |
| `formatValue` | `(value) => string` | - | No | Custom bin boundary text (x axis ticks included) when `binFormat` is not set. |
| `hiddenSeries` | `string[]` | - | No | Accepted for the shared chart contract; no effect. |
| `annotations` | `ChartAnnotation[]` | - | No | Reference lines `{ type: 'line', axis: 'x' \| 'y', value, label?, tone? }` and bands `{ type: 'band', axis, from, to, label?, tone? }` (x: data value; y: count); drawn under the marks, aria-hidden, listed in the summary. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | Accepted for the shared configuration; a histogram never shows a legend. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Toggles `aui-chart--patterns`; the single bar series draws no texture. |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000). |
| `locale` | `string` | common `locale` | Yes (inherited) | Number and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Mirrors the x axis and arrow keys. |

## 6. Methods

| Method | Description |
|---|---|
| `Histogram.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render (bins are recomputed). Invalid options throw and keep the previous state; focus stays on the same bin index when it still exists. |
| `setSeriesVisible(id, visible)` | Inherited from the shared chart controller; no visible effect. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, and configuration subscription. |

Module function:

| Function | Description |
|---|---|
| `computeBins(values, binning?)` | Returns `{ bins, outside, missing }` with the same rules as the chart: `binning` is `{ bins?, min?, max? }`. `missing` counts non-finite values; `outside` counts finite values outside the first and last edge. No validation: pass valid thresholds. |

## 7. Events

None. There is no legend, so `aui-series-toggle` is never emitted.

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-point-click` | `HistogramPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |

## 8. Slots/content areas

None. Title, description, and labels are text.

## 9. CSS parts/hooks

Shared chart chrome (see Line Chart) and the shared mark `aui-chart__bar`. Histogram: host modifier `aui-histogram` and the bars group `aui-histogram__bars` (carries `aui-chart__series--c<n>`). Colors are `--aui-chart-color`; all rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`, `__annotations`, `__annotation-line`, `__annotation-band`, `__annotation-label`, `__annotation--neutral|info|success|warning|danger`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/histogram/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1` ... `color-chart-8` (bars), `color-chart-axis`, `color-chart-grid`, `color-surface` (bar separators, tooltip), `color-text` (active bar outline), `color-focus-ring`.

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

- Bins: `barRadius` (`--aui-chart-bar-radius`, default 0), rounded at the top.
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default, empty ("No data"), bin focused (tooltip), hovered, table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| plot not focused | Tab | active bin focused, tooltip shown |
| bin focused | arrow keys, Home, End, PageUp, PageDown | another bin focused |
| tooltip visible | Escape | tooltip hidden, focus unchanged |
| table closed | Show data table | table built and shown |
| any | `update({ values })` | bins recomputed and re-rendered; focus kept on the same bin index |
| any | container resize | re-render at the new width; focus kept on the same bin |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | The plot (one tab stop), the table button, the table region. |
| ArrowLeft / ArrowRight | Bin focused | Previous / next bin (mirrored in RTL); empty bins are reachable. |
| ArrowUp / ArrowDown | Bin focused | Previous / next bin. |
| Home / End | Bin focused | First / last bin. |
| PageUp / PageDown | Bin focused | Ten bins back / forward. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

## 14. ARIA contract

- The SVG is `role="group"`, `aria-roledescription` = localized "histogram", `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each bin is `role="img"` with `aria-label` "{from} to {to}: {count} values" (pluralized; for example "2 sec to 4 sec: 5 values"). Exactly one bin has `tabindex="0"`.
- Table toggle: `aria-expanded` and `aria-controls`; the table has a caption, column headers (Bin, Count, or the axis titles), and row headers.
- Axes and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- The summary names the type, value count, bin count, the binned range, the most frequent bin, and values outside the bins, for example "histogram, 8 values in 4 bins, from 0 sec to 8 sec. Most values: 2 sec to 4 sec (5 values)." Values outside the bins add "3 values outside the bins."
- One data set, so no color coding is needed; adjacent bars are separated by a surface-colored outline.
- Forced colors: bars use `CanvasText` with a `Canvas` outline; the hovered and active bar and focus use `Highlight`. Nothing animates.
- Manual screen-reader verification (NVDA, JAWS, VoiceOver, TalkBack) is pending.

## 16. Responsive behavior

The width follows the container (ResizeObserver); the height is `height`. Bin edge labels are thinned (every k-th edge) so they never crowd. Reflows at 320 CSS px.

## 17. RTL behavior

`direction: 'rtl'` mirrors the x axis (lowest bin at the right), puts the count axis on the right, and swaps ArrowLeft/ArrowRight.

## 18. Theme behavior

The bar color comes from `color-chart-<n>` via `color` (slot 1 by default). Gridlines use `color-chart-grid`, axes `color-chart-axis`, the hovered or active bar outline `color-text`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { histogram: { dataTable: 'visible', height: 260 } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable: numeric axes only; no dates are formatted.

## 22. Icon customization points

None. No legend or toolbar is shown.

## 23. Security behavior

All text uses `textContent`; SVG is built with `createElementNS`. Colors are classes; sizes and the tooltip position are written through the CSSOM. No `innerHTML`, style attributes, or inline handlers.

## 24. Data handling behavior

Renders the given data only; no persistence, network access, or telemetry. Values are not logged; validation errors name the option, never its value.

## 25. Performance characteristics

Budget: Histogram 10,000 values create < 40 ms in headless Chromium (e2e performance test), including binning and the first render (`tests/e2e/perf-r3.spec.ts`). Binning is one pass for the extent plus a binary search per value; the DOM has one node per bin; the data table is built only when opened in toggle mode.

## 26. Supported data scale

Tested with 10,000 values. Up to 500 bins (count) or 501 thresholds; the value count is not capped, and DOM size depends on the bin count only.

## 27. Usage examples

```ts
import { Histogram, computeBins } from '@absoluteui/components/histogram';

const values = [120, 135, 160, 180, 210, 240, 250, 310, null];
const host = document.createElement('div');
document.body.append(host);
const chart = Histogram.create(host, { label: 'Response times', values, binFormat: { style: 'unit', unit: 'millisecond' } });

// The same binning for a custom table or export.
const { bins, outside, missing } = computeBins(values, { bins: [100, 200, 300] });
host.dataset.info = `${String(chart.bins.length)} bins; ${String(bins.length)} custom; ${String(outside)} outside; ${String(missing)} missing`;
```

More examples, type-checked in CI: `metadata/histogram/examples.json`.

Export: `@absoluteui/components/chart-export` (`chartToSvg`, `chartToPng`, `downloadChart`) exports any chart instance to SVG or PNG.

## 28. Edge cases

- No values, or only missing values: "No data".
- A value equal to an inner edge falls in the upper bin; a value equal to the last edge falls in the last bin (for example thresholds `[0, 10, 20]`: 10 counts in 10-20, 20 counts in 10-20).
- Values outside `min`/`max` or the thresholds are counted in `outside`, named in the summary, and included in the summary's value count; they are in no bin.
- Missing values (`null`, `NaN`, infinities) are excluded from all counts except `missing`.
- All values equal: the domain is padded around the value (10% each side, or 0-1 for zero).
- Empty bins are zero-height bars that stay focusable.
- Counts above a fixed `yAxis.max` are clipped at the top of the plot.
- `formatValue` applies to bin boundaries unless `binFormat` is set; counts are never custom-formatted.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `HISTOGRAM_OPTIONS` | configuration | Missing label; `values` not an array of numbers or `null`; `bins` not `'auto'`, an integer 1-500, or 2-501 strictly ascending finite thresholds; non-finite `min`/`max`; `max` not greater than `min`; `color` outside 1-8; invalid `binFormat`, `xAxis`, or `yAxis`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched; a failed `update()` keeps the previous state. `computeBins` does not validate.

## 30. Known limitations

- One data set per chart (no overlaid distributions).
- Bins are lower-inclusive; the last bin is also upper-inclusive.
- A bin count is approximate (nice boundaries), unless `min` and `max` fix the outer edges.
- Only integer count ticks are printed.
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.
- No zoom or pan: change the bin range (`min`, `max`, `bins`) instead.

## 31. Unsupported scenarios

- Density curves, cumulative histograms, and logarithmic axes.
- Weighted values.
- Zoom, pan, and crosshair.
- HTML in labels or tooltips.

## 32. TypeScript definitions

```ts
interface HistogramBin { readonly from: number; readonly to: number; readonly count: number }
interface HistogramBinning { bins?: 'auto' | number | readonly number[]; min?: number; max?: number }
type HistogramConfig = ChartBaseConfig; // { legend; dataTable; tooltip; patterns; height }
interface HistogramOptions extends ChartCommonOptions, Partial<HistogramConfig>, HistogramBinning {
  values: readonly (number | null)[];
  color?: ChartColor;
  binFormat?: Intl.NumberFormatOptions;
  xAxis?: { label?: string };
  yAxis?: HistogramValueAxis; // { label?; min?; max?; tickCount?; includeZero? }
}
function computeBins(values: readonly (number | null)[], binning?: HistogramBinning): { bins: HistogramBin[]; outside: number; missing: number };
```

## 33. Vanilla JS example

```ts
import { Histogram } from '@absoluteui/components/histogram';
import '@absoluteui/components/histogram/style.css';

const host = document.querySelector<HTMLElement>('#amounts');
if (host) {
  const chart = Histogram.create(host, {
    label: 'Order amounts',
    values: [12, 18, 25, 31, 40, 44, 52, 67, 89, 120],
    bins: 5,
    min: 0,
    max: 150,
    binFormat: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
    xAxis: { label: 'Amount' },
  });
  chart.update({ values: [15, 22, 30, 48, 75] });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiHistogram } from '@absoluteui/angular/histogram';

@Component({
  selector: 'app-latency',
  imports: [AuiHistogram],
  template: `<aui-histogram label="Response times" [values]="values" [bins]="thresholds"></aui-histogram>`,
})
export class LatencyComponent {
  readonly values: (number | null)[] = [120, 135, 160, 180, 210, 240, 250, 310];
  readonly thresholds: number[] = [100, 150, 200, 250, 300, 350];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
