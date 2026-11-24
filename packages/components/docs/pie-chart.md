# Pie Chart

> Package: `@absoluteui/components/pie-chart` | Styles: `@absoluteui/components/pie-chart/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

An accessible SVG pie or donut chart for one part-to-whole breakdown. It provides:
- slices in data order, starting at 12 o'clock and running clockwise; an optional donut hole with a center label (the total by default);
- printed percentage (or value) labels on slices large enough to hold them;
- a legend listing every slice with its share, as toggle buttons;
- keyboard-reachable slices (one tab stop, arrow keys) with a tooltip on focus and hover;
- a generated summary and a data table (category, value, percent);
- textures (with `patterns`), legend order, and labels as non-color cues (WCAG 1.4.1).

Negative and missing values cannot be drawn as slices: they are excluded from the pie and listed as "not plotted" in the summary and the table.

## 2. Anatomy

```text
<div class="aui-chart aui-pie-chart [aui-pie-chart--donut] [aui-chart--patterns]">
  <div class="aui-chart__header">title, description</div>
  <ul class="aui-chart__legend" aria-label="Legend"><li><button aria-pressed="true">swatch, Search, 46%</button></li>...</ul>
  <div class="aui-chart__body">
    <svg class="aui-chart__svg" role="group" aria-roledescription="pie chart" aria-labelledby="T" aria-describedby="S">
      <g class="aui-pie-chart__slices">
        <g class="aui-pie-chart__slice-group aui-chart__series--c1">
          <path class="aui-chart__mark aui-pie-chart__slice" role="img" aria-label="Search: 46 (46%)" tabindex="0"/>
          <path class="aui-chart__pattern" aria-hidden="true"/>
        </g>
      </g>
      <g class="aui-pie-chart__labels" aria-hidden="true">46%</g>
      <text class="aui-pie-chart__center" aria-hidden="true">total</text>   (donut)
    </svg>
    <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" hidden/>  <div class="aui-chart__data">Show data table, table</div>
</div>
```

## 3. When to use

- One breakdown of a total into a few (2-6) parts.
- Donut: when the total (center label) matters as much as the parts.

## 4. When not to use

- Many parts or parts of similar size: use Bar Chart (lengths compare more accurately than angles).
- Values that can be negative.
- Comparing several breakdowns: use a stacked Bar Chart.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Ids of hidden slices. |

Options (`PieChartOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot. |
| `slices` | `PieChartSlice[]` | - (required) | No | `{ id, label, value: number \| null, color? }`. |
| `donut` | `boolean` | `false` | No | Ring with a 60% inner radius. |
| `centerLabel` | `string` | formatted total | No | Donut center text; `''` for none. |
| `valueLabel` | `string` | "Value" | No | Table header of the value column. |
| `hideLabel`, `description`, `summary`, `valueFormat`, `formatValue`, `hiddenSeries` | | | No | As in Line Chart (`hiddenSeries` holds slice ids). |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | `auto` and `show`: always shown for pies. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Textures (always on in forced colors). |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000). |
| `sliceLabels` | `'percent' \| 'value' \| 'none'` | `'percent'` | Yes | Printed slice text. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Swaps ArrowLeft/ArrowRight. |

## 6. Methods

| Method | Description |
|---|---|
| `PieChart.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render; invalid options throw and keep the previous state. |
| `setSeriesVisible(id, visible)` | Show or hide a slice; no event. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, and configuration subscription. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-series-toggle` | `{ id: string; visible: boolean; hidden: string[] }` | Yes | The user toggled a legend entry (slice). |
| `aui-point-click` | `PieChartPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

The shared chart chrome (see Line Chart section 9) plus `aui-pie-chart--donut`, `__slices`, `__slice-group`, `__slice`, `__labels`, `__center`. All rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/pie-chart/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1..8`, `color-surface` (slice separators, textures, label halo), `color-text`, `font-size-xl` (center label), `color-focus-ring`.

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

- Slices: `sliceRadius` (`--aui-chart-slice-radius`, default 0) rounds the four corners of donut slices and the two outer corners of pie slices (the center stays sharp); clamped to half the ring thickness and to what a thin slice can hold. A single full-circle slice has no corners.
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default, donut, empty ("No data": no slices, all values zero or not plotted), all slices hidden, slice hidden, slice focused (tooltip), slice hovered, table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | legend button | slice hidden or shown; shares recomputed over visible slices; `aui-series-toggle` |
| plot not focused | Tab | active slice focused, tooltip shown |
| slice focused | arrow keys, Home, End | another slice focused |
| tooltip visible | Escape | tooltip hidden |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Legend buttons, the plot (one tab stop), the table button, the table region. |
| ArrowRight / ArrowDown | Slice focused | Next slice (clockwise); ArrowLeft/ArrowRight swap in RTL. |
| ArrowLeft / ArrowUp | Slice focused | Previous slice. |
| Home / End, PageUp / PageDown | Slice focused | First / last slice; ten slices back / forward. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Legend button | Toggle the slice. |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

## 14. ARIA contract

- SVG: `role="group"`, `aria-roledescription` "pie chart" or "donut chart", `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each slice: `role="img"`, `aria-label` "{label}: {value} ({percent})"; exactly one slice has `tabindex="0"`.
- Legend buttons: `aria-pressed`; the legend text includes each visible slice's percentage.
- Printed labels, center label, textures, and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- The summary lists the type, slice count, total, every plotted slice with value and percentage, not-plotted slices, and hidden slices.
- Slices are separated by a `color-surface` stroke, so adjacent colors need no mutual contrast.
- Forced colors: slices use `CanvasText` with `Canvas` textures; focus uses `Highlight`.
- No animation. Manual screen-reader verification is pending.

## 16. Responsive behavior

The pie fits the smaller of the container width and `height`, centered; slice labels are printed only where they fit. Reflows at 320 CSS px.

## 17. RTL behavior

Slices keep clockwise order (a pie has no reading axis); ArrowLeft/ArrowRight are swapped so "forward" follows the reading direction. Legend, tooltip, and table follow the document direction.

## 18. Theme behavior

Slices use `color-chart-1..8` by palette slot (3:1 against surface, background, and sunken surfaces in all themes).

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { pieChart: { sliceLabels: 'value', dataTable: 'visible' } } });
```

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

Budget: create with 12 slices under 15 ms including the first render (e2e performance test, median of 5).

## 26. Supported data scale

Designed for up to about 12 slices; palette colors repeat after 8 (textures continue to differ).

## 27. Usage examples

```ts
import { PieChart } from '@absoluteui/components/pie-chart';

const host = document.createElement('div');
document.body.append(host);
PieChart.create(host, {
  label: 'Plan mix',
  slices: [
    { id: 'free', label: 'Free', value: 62 },
    { id: 'pro', label: 'Pro', value: 30 },
    { id: 'team', label: 'Team', value: 8 },
  ],
  donut: true,
});
```

More examples, type-checked in CI: `metadata/pie-chart/examples.json`.

## 28. Edge cases

- A single plotted slice draws a full circle (100%).
- Zero-value slices are listed but draw nothing; all zeros: "No data".
- Negative or missing values: excluded, listed as not plotted ("-5 (not plotted)", "No value").
- Tiny slices (under about 17 degrees) get no printed label; the legend and tooltip still show their share.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `PIE_CHART_OPTIONS` | configuration | Missing label; slice ids not unique or empty; non-numeric values; invalid color, donut, centerLabel, or valueLabel. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched.

## 30. Known limitations

- Negative values are not drawable.
- Slices are in data order; sort before passing them if needed.
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.
- No annotations (no cartesian value axes).
- No zoom or pan: slices have no axis to zoom.

## 31. Unsupported scenarios

- Exploded slices, sunburst or multi-ring donuts, outside labels with leader lines.
- Selection and export.

## 32. TypeScript definitions

```ts
interface PieChartSlice { id: string; label: string; value: number | null; color?: ChartColor }
interface PieChartConfig extends ChartBaseConfig { sliceLabels: 'percent' | 'value' | 'none' }
interface PieChartOptions extends ChartCommonOptions, Partial<PieChartConfig> {
  slices: readonly PieChartSlice[];
  donut?: boolean;
  centerLabel?: string;
  valueLabel?: string;
}
```

## 33. Vanilla JS example

```ts
import { PieChart } from '@absoluteui/components/pie-chart';
import '@absoluteui/components/pie-chart/style.css';

const host = document.querySelector<HTMLElement>('#sources');
if (host) {
  PieChart.create(host, {
    label: 'Traffic sources',
    slices: [
      { id: 'search', label: 'Search', value: 46 },
      { id: 'direct', label: 'Direct', value: 25 },
    ],
    valueFormat: { maximumFractionDigits: 0 },
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiPieChart } from '@absoluteui/angular/pie-chart';
import type { PieChartSlice } from '@absoluteui/components/pie-chart';

@Component({
  selector: 'app-plans',
  imports: [AuiPieChart],
  template: `<aui-pie-chart label="Plan mix" [slices]="slices" [donut]="true"></aui-pie-chart>`,
})
export class PlansComponent {
  readonly slices: PieChartSlice[] = [{ id: 'free', label: 'Free', value: 62 }, { id: 'pro', label: 'Pro', value: 38 }];
}
```

## 35. React example

```tsx
import { AuiPieChart } from '@absoluteui/react/pie-chart';

const slices = [{ id: 'search', label: 'Search', value: 52 }, { id: 'direct', label: 'Direct', value: 31 }];

export function Example() {
  return <AuiPieChart label="Traffic sources" slices={slices} donut />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiPieChart } from '@absoluteui/vue/pie-chart';
const slices = [{ id: 'search', label: 'Search', value: 52 }, { id: 'direct', label: 'Direct', value: 31 }];
</script>

<template>
  <AuiPieChart label="Traffic sources" :slices="slices" donut />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
