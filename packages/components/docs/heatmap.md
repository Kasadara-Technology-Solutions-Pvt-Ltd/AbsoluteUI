# Heatmap

> Package: `@absoluteui/components/heatmap` | Styles: `@absoluteui/components/heatmap/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

An accessible SVG heatmap: a matrix of values over two categorical axes (columns along x, rows along y). Each cell's fill encodes its value on a scale of discrete steps:
- sequential (default): one palette slot, light to dark;
- diverging: two palette slots on either side of a `midpoint`.

Fill lightness alone is a weak cue, so it is never the only one:
- cells print their values when the formatted value fits (`cellLabels`);
- the legend lists every step's value range;
- every cell is keyboard-reachable in two dimensions (one tab stop, arrow keys) with a tooltip, and its accessible name carries the exact value;
- the data table holds the exact matrix, and a generated summary names the size and the extremes.

Nothing animates.

## 2. Anatomy

```text
<div class="aui-chart aui-heatmap [aui-chart--patterns]">
  <div class="aui-chart__header">title, description</div>
  <ul class="aui-chart__legend" aria-label="Legend"><li><span class="aui-chart__legend-item">swatch, 0 to 2</span></li>...</ul>
  <div class="aui-chart__body">
    <svg class="aui-chart__svg" role="group" aria-roledescription="heatmap" aria-labelledby="T" aria-describedby="S">
      <g class="aui-chart__axis" aria-hidden="true">column and row labels</g>
      <g class="aui-heatmap__cells">
        <rect class="aui-heatmap__cell aui-chart__series--c1 aui-heatmap__level--60 aui-chart__mark" role="img" aria-label="12, Tue: 4" tabindex="0"/>
        <rect class="aui-heatmap__cell aui-heatmap__cell--empty aui-chart__mark" role="img" aria-label="9, Tue: No value"/>
      </g>
      <g class="aui-heatmap__labels" aria-hidden="true"><text class="aui-chart__value-label">4</text>...</g>
    </svg>
    <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" hidden/>  <div class="aui-chart__data">Show data table, table</div>
</div>
```

## 3. When to use

- Patterns across two categorical dimensions: weekday by hour, region by month, feature by segment.
- Deviations around a meaningful midpoint (change from baseline): `colorScale: { type: 'diverging' }`.

## 4. When not to use

- Exact comparison of a few values: use Bar Chart (lengths compare better than lightness).
- Continuous x and y values: use Scatter Chart.
- Thousands of cells: aggregate first; every cell is a focusable DOM element.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Shared chart property; always empty. |

Options (`HeatmapOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot; table caption. |
| `columns` | `string[]` | - (required) | No | Column labels (x axis). |
| `rows` | `string[]` | - (required) | No | Row labels, top to bottom. |
| `values` | `(number \| null)[][]` | - (required) | No | `values[row][column]`; one array per row, one value per column; `null`/`NaN` = empty cell. |
| `colorScale` | `HeatmapColorScale` | sequential, slot 1, 5 steps | No | See section 32. |
| `xAxis` / `yAxis` | `{ label?: string }` | - | No | Axis titles; `yAxis.label` also heads the table's first column (default "Row"). |
| `hideLabel`, `description`, `summary`, `valueFormat`, `formatValue` | | | No | As in Line Chart. |
| `hiddenSeries` | `string[]` | - | No | Shared chart option; no effect (no series). |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | `auto` and `show` show the step legend; `hide` removes it. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Shared chart option; cells are not textured, so no visible effect. |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000). |
| `cellLabels` | `'auto' \| 'always' \| 'none'` | `'auto'` | Yes | Values inside cells where they fit (`always` skips cells that are too small); `none`: no values. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Mirrors columns and row labels; swaps ArrowLeft/ArrowRight. |

## 6. Methods

| Method | Description |
|---|---|
| `Heatmap.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render; invalid options throw and keep the previous state. Focus stays on the same cell. |
| `setSeriesVisible(id, visible)` | Shared chart method; no effect beyond a re-render. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, and configuration subscription. |

Export: `@absoluteui/components/chart-export` (`chartToSvg`, `chartToPng`, `downloadChart`) serializes a rendered heatmap to SVG or PNG.

## 7. Events

None.

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-point-click` | `HeatmapPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

The shared chart chrome (see Line Chart section 9) plus `aui-heatmap`, `__cells`, `__cell`, `__cell--empty`, `__labels`, and the fill-strength classes `aui-heatmap__level--15` ... `--100` (steps of 5), which set `--aui-heatmap-fill` (the palette color mixed into `color-surface`). All rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/heatmap/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1..8` (step hues), `color-surface` (mix base and cell separators), `color-surface-sunken` (empty cells), `color-text` (hover and focus outline), `color-focus-ring`.

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

- Cells: `cellRadius` (`--aui-chart-cell-radius`, default 2 px).
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default (sequential), diverging, empty ("No data": no rows, no columns, or no finite values), empty cell, cell focused (tooltip), cell hovered, table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| plot not focused | Tab | active cell focused, tooltip shown |
| cell focused | arrow keys, Home, End, PageUp, PageDown | another cell focused |
| tooltip visible | Escape | tooltip hidden |
| any | `update()` / configuration change | re-rendered; focus kept on the same cell |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | The plot (one tab stop), the table button, the table region. Legend entries are not focusable. |
| ArrowLeft / ArrowRight | Cell focused | Previous / next column in the row (swapped in RTL). |
| ArrowUp / ArrowDown | Cell focused | Same column in the previous / next row. |
| Home / End | Cell focused | First / last cell of the row. |
| PageUp / PageDown | Cell focused | Ten columns back / forward. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

## 14. ARIA contract

- SVG: `role="group"`, `aria-roledescription` "heatmap", `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each cell: `role="img"`, `aria-label` "{column}, {row}: {value}" (for example "12, Tue: 4"; empty cells "9, Tue: No value"); exactly one cell has `tabindex="0"`.
- Legend: `ul` named "Legend" with static entries "{from} to {to}"; with a fixed `min`/`max` and data beyond it, the end steps read "Below {value}" / "Above {value}".
- Axis labels, printed values, and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- Trade-off: lightness steps of one hue are hard to tell apart, and color alone would fail WCAG 1.4.1. The heatmap therefore prints values in cells that fit them, lists each step's range in the legend, exposes every value through the cell names and tooltips, and offers the exact matrix in the data table. Keep at least `cellLabels` or `dataTable` on.
- Every cell (including empty ones) is keyboard-reachable in two dimensions.
- The summary names the size and extremes: "heatmap, 2 rows by 3 columns. Lowest 1 at 9, Mon; highest 9 at 15, Mon."
- Cells are separated by a `color-surface` stroke, so neighboring fills need no mutual contrast.
- Forced colors: fills are not reliable, so cells become outlined boxes (`Canvas` / `CanvasText`, `Highlight` on hover and focus); values stay available through the printed labels, accessible names, and the data table.
- No animation. Manual screen-reader verification is pending.

## 16. Responsive behavior

The width follows the container (ResizeObserver); the height is `height`. Cells share the plot evenly. Row labels take at most 30% of the width and are truncated; column labels are truncated or thinned when crowded; cell values are printed only where they fit. Reflows at 320 CSS px.

## 17. RTL behavior

`direction: 'rtl'` puts the first column at the right and the row labels on the right, and swaps ArrowLeft/ArrowRight. The legend, tooltip, and table follow the document direction.

## 18. Theme behavior

Step fills mix `color-chart-<slot>` into `color-surface` at 15-100% (`color-mix`), so they adapt to every theme; empty cells use `color-surface-sunken`. Lighter steps are intentionally low-contrast: meaning is carried by the printed values, legend, and table, not by the fill.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { heatmap: { cellLabels: 'none', dataTable: 'visible' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None.

## 23. Security behavior

All text uses `textContent`; SVG uses `createElementNS`; colors are classes. No `innerHTML` or style attributes.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Budget: `Heatmap.create` with 24 x 30 cells < 60 ms in headless Chromium (e2e performance test), including the first render. One number formatter per render; the data table is built lazily.

## 26. Supported data scale

Up to about 1,000 cells; every cell is a focusable `rect`.

## 27. Usage examples

```ts
import { Heatmap } from '@absoluteui/components/heatmap';

const host = document.createElement('div');
document.body.append(host);
Heatmap.create(host, {
  label: 'Tickets by weekday and hour',
  columns: ['9', '12', '15'],
  rows: ['Mon', 'Tue'],
  values: [[1, 5, 9], [null, 4, 2]],
});
```

More examples, type-checked in CI: `metadata/heatmap/examples.json`.

## 28. Edge cases

- `null`, `NaN`, and infinities are empty cells (`color-surface-sunken`, "No value"); they are still focusable.
- All cells empty, or no rows or columns: "No data".
- All values equal: every cell uses the same step.
- Values outside a fixed `colorScale.min`/`max` use the first or last step; the legend then reads "Below ..." / "Above ..." at the ends.
- Diverging scales are symmetric around `midpoint` (the larger distance sets both sides); the legend has `2 x steps` entries.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `HEATMAP_OPTIONS` | configuration | Missing label; non-string columns or rows; `values` not one array per row with one number-or-null per column; invalid `colorScale` (type, slots, non-finite numbers, `max <= min`, steps outside 3-9); invalid axis titles or formatters. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched.

## 30. Known limitations

- Discrete steps only; one slot (sequential) or two (diverging).
- `cellLabels: 'always'` prints values only where they fit, like `'auto'`.
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.
- No annotations (no cartesian value axes).
- No zoom or pan: the grid already shows every cell; filter rows or columns instead.

## 31. Unsupported scenarios

- Numeric or time axes, uneven cells, calendar layouts.
- Clustering, sorting, selection.

## 32. TypeScript definitions

```ts
type HeatmapCellLabels = 'auto' | 'always' | 'none';
interface HeatmapConfig extends ChartBaseConfig { cellLabels: HeatmapCellLabels }
interface HeatmapColorScale {
  type?: 'sequential' | 'diverging'; // default 'sequential'
  color?: ChartColor;    // sequential slot, default 1
  negative?: ChartColor; // diverging, below midpoint, default 2
  positive?: ChartColor; // diverging, above midpoint, default 1
  midpoint?: number;     // default 0
  min?: number;          // default: data extent (nice-rounded)
  max?: number;
  steps?: number;        // 3-9 (per side for diverging), default 5
}
interface HeatmapOptions extends ChartCommonOptions, Partial<HeatmapConfig> {
  columns: readonly string[];
  rows: readonly string[];
  values: readonly (readonly (number | null)[])[];
  colorScale?: HeatmapColorScale;
  xAxis?: { label?: string };
  yAxis?: { label?: string };
}
```

## 33. Vanilla JS example

```ts
import { Heatmap } from '@absoluteui/components/heatmap';
import '@absoluteui/components/heatmap/style.css';

const host = document.querySelector<HTMLElement>('#load');
if (host) {
  Heatmap.create(host, {
    label: 'Server load by day and hour',
    columns: ['00', '06', '12', '18'],
    rows: ['Sat', 'Sun'],
    values: [[0.2, 0.35, 0.8, 0.6], [0.15, 0.3, 0.7, 0.55]],
    valueFormat: { style: 'percent' },
    colorScale: { min: 0, max: 1 },
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiHeatmap } from '@absoluteui/angular/heatmap';

@Component({
  selector: 'app-tickets',
  imports: [AuiHeatmap],
  template: `<aui-heatmap label="Tickets by weekday and hour" [columns]="columns" [rows]="rows" [values]="values"></aui-heatmap>`,
})
export class TicketsComponent {
  readonly columns = ['9', '12', '15'];
  readonly rows = ['Mon', 'Tue'];
  readonly values = [[1, 5, 9], [null, 4, 2]];
}
```

## 35. React example

```tsx
import { AuiHeatmap } from '@absoluteui/react/heatmap';

const columns = ['9:00', '12:00', '15:00', '18:00'];
const rows = ['Mon', 'Tue', 'Wed'];
const values = [[4, 12, 9, 3], [6, 15, null, 2], [5, 11, 8, 4]];

export function Example() {
  return <AuiHeatmap label="Support tickets by hour" columns={columns} rows={rows} values={values} colorScale={{ color: 3, steps: 4 }} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiHeatmap } from '@absoluteui/vue/heatmap';
const columns = ['9', '12', '15'];
const rows = ['Mon', 'Tue'];
const values = [[1, 5, 9], [null, 4, 2]];
</script>

<template>
  <AuiHeatmap label="Tickets by weekday and hour" :columns="columns" :rows="rows" :values="values" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
