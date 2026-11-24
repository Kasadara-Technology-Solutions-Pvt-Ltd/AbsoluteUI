# Radar Chart

> Package: `@absoluteui/components/radar-chart` | Styles: `@absoluteui/components/radar-chart/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

An accessible SVG radar (polar) chart that compares series across several quantitative axes arranged clockwise around a circle, starting at the top. It provides:
- one closed polygon per series (translucent fill with `fill`), with a focusable vertex per axis;
- a shared radial scale with rings, spokes, and ring tick labels (all `aria-hidden`);
- keyboard navigation around the axes (Left/Right) and between series (Up/Down), with a tooltip on focus and hover;
- a legend of toggle buttons, a generated summary, and a data table (one row per axis);
- marker shapes and dash patterns (with `patterns`) as non-color cues (WCAG 1.4.1).

Axes keep clockwise order in RTL, like pie charts. Nothing animates.

## 2. Anatomy

```text
<div class="aui-chart aui-radar-chart [aui-chart--patterns]">
  <div class="aui-chart__header">title, description</div>
  <ul class="aui-chart__legend" aria-label="Legend"><li><button aria-pressed="true">swatch, Alpha</button></li>...</ul>
  <div class="aui-chart__body">
    <svg class="aui-chart__svg" role="group" aria-roledescription="radar chart" aria-labelledby="T" aria-describedby="S">
      <g class="aui-chart__grid" aria-hidden="true">rings (aui-radar-chart__ring), spokes</g>
      <g class="aui-chart__axis" aria-hidden="true">ring ticks, axis names (aui-radar-chart__axis-label)</g>
      <g class="aui-radar-chart__series-layer">
        <g class="aui-radar-chart__series aui-chart__series--c1" aria-hidden="true"><path class="aui-chart__area"/><path class="aui-chart__line aui-chart__dash--1"/></g>
      </g>
      <g class="aui-radar-chart__points">
        <g class="aui-radar-chart__series aui-chart__series--c1">
          <path class="aui-chart__point aui-chart__mark" role="img" aria-label="Speed, Alpha: 3" tabindex="0"/>...
        </g>
      </g>
    </svg>
    <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" hidden/>  <div class="aui-chart__data">Show data table, table</div>
</div>
```

## 3. When to use

- Comparing the profile of 1-5 items across 3-12 comparable measures on one scale (skills, product attributes, scores).

## 4. When not to use

- Precise comparison of values: use a grouped Bar Chart.
- Measures with different units or ranges (the scale is shared).
- Many series, or ordered data such as time: use Line Chart.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Ids of hidden series. |

Options (`RadarChartOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot; table caption. |
| `axes` | `string[]` | - (required) | No | Axis names, clockwise from the top; at least 3. |
| `series` | `ChartSeries[]` | - (required) | No | `{ id, label, values, color? }`; exactly one value per axis. Each series also takes `style?: { color?; lineWidth?; dash?: 'solid' \| 'dashed' \| 'dotted'; marker?: 'auto' \| 'none' \| 'circle' \| 'square' \| 'diamond' \| 'triangle'; fillOpacity? }`; legend and tooltip keys match it. |
| `valueAxis` | `RadarChartValueAxis` | 0 (or data min) to data max, 4 rings | No | `{ min?, max?, tickCount? }`; `label` and `includeZero` are not used. |
| `hideLabel`, `description`, `summary`, `valueFormat`, `formatValue`, `hiddenSeries` | | | No | As in Line Chart. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | `auto`: when there is more than one series. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Dash patterns on outlines (always on in forced colors). |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000). |
| `fill` | `boolean` | `true` | Yes | Translucent polygon fill. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Swaps ArrowLeft/ArrowRight; axes stay clockwise. |

## 6. Methods

| Method | Description |
|---|---|
| `RadarChart.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render; invalid options throw and keep the previous state. |
| `setSeriesVisible(id, visible)` | Show or hide a series; no event. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, and configuration subscription. |

Export: `@absoluteui/components/chart-export` (`chartToSvg`, `chartToPng`, `downloadChart`) serializes a rendered radar chart to SVG or PNG.

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-series-toggle` | `{ id: string; visible: boolean; hidden: string[] }` (`RadarChartSeriesToggleDetail`) | Yes | The user toggled a legend entry. Not emitted for `update()` or `setSeriesVisible()`. |
| `aui-point-click` | `RadarChartPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

The shared chart chrome (see Line Chart section 9) and series marks (`aui-chart__area`, `__line`, `__point`, `__dash--1..4`) plus `aui-radar-chart`, `__ring`, `__axis-label`, `__series-layer`, `__series`, `__points`. All rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/radar-chart/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1..8` (series), `color-chart-grid` (rings, spokes), `color-text-muted` (ring ticks), `color-text` and `font-weight-medium` (axis names), `color-surface` (vertex outlines, tooltip), `color-focus-ring`.

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

- Outlines and areas: `lineJoin` (`--aui-chart-line-join`: `round` (default), `miter`, `bevel`).
- Rings and spokes are gridlines; point markers are shapes.
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default, unfilled (`fill: false`), empty ("No data": no series or no finite values), all series hidden ("All series are hidden"), series hidden, vertex focused (tooltip), vertex hovered, table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | legend button | series hidden or shown; scale recomputed over visible series; `aui-series-toggle` |
| plot not focused | Tab | active vertex focused, tooltip shown |
| vertex focused | arrow keys, Home, End, PageUp, PageDown | another vertex focused |
| tooltip visible | Escape | tooltip hidden |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Legend buttons, the plot (one tab stop), the table button, the table region. |
| ArrowRight / ArrowLeft | Vertex focused | Next (clockwise) / previous axis of the series; swapped in RTL. |
| ArrowDown / ArrowUp | Vertex focused | Same axis in the next / previous visible series (single series: next / previous axis). |
| Home / End | Vertex focused | First (top) / last axis. |
| PageUp / PageDown | Vertex focused | Ten axes back / forward. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Legend button | Toggle the series. |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

## 14. ARIA contract

- SVG: `role="group"`, `aria-roledescription` "radar chart", `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each vertex: `role="img"`, `aria-label` "{axis}, {series}: {value}" (for example "Power, Beta: 2"); exactly one vertex has `tabindex="0"`.
- Legend: `ul` named "Legend"; entries are `button`s with `aria-pressed` (true = visible).
- Rings, spokes, tick labels, axis names, polygons, and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- The summary lists the type, counts, the axis names in order, the scale, each series' highest and lowest axis, and hidden series: "radar chart, 2 series, 4 axes: Speed, Power, Range, and Armor. Scale ... Alpha: highest 5 on Power, lowest 2 on Range. ..."
- Series differ by color, marker shape, and (with `patterns`) dash pattern; legend keys repeat them.
- Missing values are drawn at the center and read "No value".
- Forced colors: series use `CanvasText` and keep shapes and dashes; focus uses `Highlight`.
- No animation. Manual screen-reader verification is pending.

## 16. Responsive behavior

The width follows the container (ResizeObserver); the height is `height`. The radius fits the smaller dimension after reserving room for the axis names, which are truncated when space is short. Reflows at 320 CSS px.

## 17. RTL behavior

Axes keep clockwise order from the top in RTL (a radar has no reading axis, like pie charts; decision C5). ArrowLeft/ArrowRight are swapped so "forward" follows the reading direction. The legend, tooltip, and table follow the document direction.

## 18. Theme behavior

Series colors come from `color-chart-1..8` by palette slot (series position, or `color`); each meets 3:1 against surfaces in all shipped themes. The 12% fill is decorative; outlines and vertices carry the data.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { radarChart: { fill: false, height: 360 } } });
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

Budget: `RadarChart.create` with 5 series x 12 axes < 30 ms in headless Chromium (e2e performance test), including the first render.

## 26. Supported data scale

Up to about 5 series and 12 axes; more work but polygons overlap and labels crowd.

## 27. Usage examples

```ts
import { RadarChart } from '@absoluteui/components/radar-chart';

const host = document.createElement('div');
document.body.append(host);
RadarChart.create(host, {
  label: 'Skills',
  axes: ['Speed', 'Power', 'Range', 'Armor'],
  series: [
    { id: 'a', label: 'Alpha', values: [3, 5, 2, 4] },
    { id: 'b', label: 'Beta', values: [4, 2, 5, 1] },
  ],
});
```

More examples, type-checked in CI: `metadata/radar-chart/examples.json`.

## 28. Edge cases

- Missing values (`null`, `NaN`, infinities): the vertex is at the center and reads "No value".
- Values outside a fixed `valueAxis.min`/`max` are clamped to the center or the outer ring; labels and table keep the real value.
- Negative data: the scale starts at the data minimum.
- Hiding series recomputes the scale over the visible series; all hidden: "All series are hidden".

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `RADAR_CHART_OPTIONS` | configuration | Missing label; fewer than 3 axes or non-string axes; series ids not unique or empty; values not one per axis or non-numeric; invalid color, `valueAxis` (non-finite, `max <= min`, tickCount outside 2-20), or formatters. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched.

## 30. Known limitations

- One shared radial scale; no per-axis scales.
- Missing values collapse to the center instead of leaving a gap.
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.
- No annotations (no cartesian value axes).
- No zoom or pan: radial axes have no linear window.

## 31. Unsupported scenarios

- Per-axis scales or units; polar area (rose) and radial bar charts.
- Selection and brushing.

## 32. TypeScript definitions

```ts
interface RadarChartConfig extends ChartBaseConfig { fill: boolean }
interface RadarChartValueAxis { label?: string; min?: number; max?: number; tickCount?: number; includeZero?: boolean }
interface RadarChartOptions extends ChartCommonOptions, Partial<RadarChartConfig> {
  axes: readonly string[];
  series: readonly ChartSeries[];
  valueAxis?: RadarChartValueAxis;
}
type RadarChartSeriesToggleDetail = { id: string; visible: boolean; hidden: string[] };
```

## 33. Vanilla JS example

```ts
import { RadarChart } from '@absoluteui/components/radar-chart';
import '@absoluteui/components/radar-chart/style.css';

const host = document.querySelector<HTMLElement>('#products');
if (host) {
  RadarChart.create(host, {
    label: 'Product comparison',
    axes: ['Price', 'Quality', 'Support', 'Features', 'Speed'],
    series: [
      { id: 'ours', label: 'Ours', values: [7, 8, 9, 6, 8] },
      { id: 'rival', label: 'Rival', values: [8, 6, 5, 8, 7] },
    ],
    valueAxis: { min: 0, max: 10 },
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiRadarChart } from '@absoluteui/angular/radar-chart';
import type { ChartSeries } from '@absoluteui/components/radar-chart';

@Component({
  selector: 'app-skills',
  imports: [AuiRadarChart],
  template: `<aui-radar-chart label="Skills" [axes]="axes" [series]="series"></aui-radar-chart>`,
})
export class SkillsComponent {
  readonly axes = ['Speed', 'Power', 'Range', 'Armor'];
  readonly series: ChartSeries[] = [{ id: 'a', label: 'Alpha', values: [3, 5, 2, 4] }, { id: 'b', label: 'Beta', values: [4, 2, 5, 1] }];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
