---
title: Charts
description: Accessible SVG charts with keyboard navigation, data table fallbacks, zoom, time zones, and export.
---

AbsoluteUI draws charts as SVG with one shared model for axes, legends, tooltips, keyboard navigation, zoom, and export. There are line and area, bar, pie and donut, scatter and bubble, combo (dual axis), waterfall, histogram, heatmap, gauge, radar, treemap, funnel, box plot, bullet, and sparkline charts.

<figure class="aui-live" data-min-height="420"><iframe data-src="/docs/examples/line-chart/zoom-crosshair.html" title="Live example: Zoom along x with a crosshair" loading="lazy"></iframe></figure>

## Accessible by default

- **A text alternative is generated** from the data (range, extremes, trends) and linked with `aria-describedby`. Replace it with `summary` when you can say something better.
- **Every point is reachable by keyboard**: Tab into the chart, arrow keys move between points and series, and the tooltip follows focus.
- **The exact data is one click away**: `dataTable: 'toggle'` (default) adds a Show data table button; `'visible'` always shows it, `'hidden'` keeps it for screen readers only.
- **Series are not told apart by color alone** where it matters: lines always keep distinct marker shapes, and forced-colors mode always adds dash patterns and textures.

:::caution[Plain colors by default]
Bars, stacked series, and pie slices use plain colors unless you set `patterns: true`. When such series are distinguished only by color and no labels carry the distinction, turn patterns on to meet WCAG 1.4.1 (Use of Color). You can enable them for every chart through global configuration.
:::

## Time axes and time zones

Time series take `Instant` values on the x axis and format them in the configured time zone and locale, so a chart for an office in Kolkata and one in London label the same data correctly for each. See [Dates and time zones](/docs/guides/dates-and-time-zones/).

## Interaction

| Option | Effect |
|---|---|
| `tooltip` | Tooltip on hover and keyboard focus (default on). |
| `crosshair` | A crosshair that follows the pointer or focused point. |
| `zoom` | Zoom and pan along x with a toolbar, keys (`+`, `-`, `0`), Ctrl/Cmd + wheel, drag to pan, and Shift + drag to select a range; emits `aui-zoom`. Line, Scatter (also both axes), Combo, and Bar (columns) charts. |
| `syncGroup` | Charts in one group follow each other's crosshair and tooltip. |
| `hiddenSeries` | Series hidden through the legend; the legend toggles them. |
| `markers` | `'auto'`, `'always'`, or `'focus'`. |

## Look and feel

Every chart shares one styling layer. Restyle charts in CSS through `--aui-chart-*` custom properties (on `:root`, a theme, a container, or one chart), or per chart with the typed `theme` option, which writes the same properties on the chart host through the CSSOM (no inline `style` attributes, so strict CSP and Trusted Types are safe).

```ts
import { LineChart } from '@absoluteui/components/line-chart';

const host = document.querySelector<HTMLElement>('#revenue');
if (host) {
  LineChart.create(host, {
    label: 'Revenue',
    x: ['Jan', 'Feb', 'Mar', 'Apr'],
    area: true,
    series: [
      { id: 'actual', label: 'Actual', values: [12, 18, 15, 22] },
      { id: 'plan', label: 'Plan', values: [14, 15, 16, 17], style: { dash: 'dashed', marker: 'none', color: '#64748b' } },
    ],
    theme: { palette: ['#7c3aed'], gridDash: '4 2', lineWidth: 3, gradient: true, legendPosition: 'bottom', animation: { duration: 300 } },
    annotations: [{ type: 'line', axis: 'y', value: 20, label: 'Target', tone: 'success' }],
  });
}
```

| `theme` property | Effect |
|---|---|
| `palette` | 1 to 8 CSS colors for palette slots 1-8. |
| `fontFamily`, `fontSize`, `textColor` | Plot text. |
| `gridLines`, `gridColor`, `gridDash`, `axisColor` | Grid and axes. |
| `lineWidth`, `markerSize`, `areaOpacity`, `gradient`, `lineJoin` | Marks (`lineJoin`: `'round'` (default), `'miter'`, or `'bevel'`). |
| `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius` | Corner rounding in px (see below). |
| `valueLabelColor`, `tooltip: { background, color, borderColor }` | Labels and tooltip. |
| `legendPosition` | `'top'` (default), `'bottom'`, `'start'`, or `'end'`. |
| `animation` | `true` or `{ duration }`: opt-in entry animation, off with `prefers-reduced-motion: reduce` and `[data-aui-animation='none']`. |

Every value is validated (colors with `CSS.supports('color', value)`, numbers within ranges, dashes as numbers and spaces); an invalid `theme` throws and leaves the chart unchanged.

### CSS custom properties

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
| `--aui-chart-marker-size` | per chart (3.5 to 4) | Marker radius in px (read when the chart renders). |
| `--aui-chart-animation-duration` | `400ms` | Entry animation length (with `theme.animation`). |
| `--aui-chart-band-opacity` | `0.1` | Annotation band fill. |
| `--aui-chart-series-color` / `-series-line-width` / `-series-fill-opacity` | unset | Per-series values written by `series[].style`. |

The properties down to `--aui-chart-tooltip-shadow` (25 in all) are component tokens: a theme sets them in the Theme Designer's Charts section, and the compliance report checks their contrast. The others are plain hooks with the defaults shown.

### Corner rounding

Every chart element with corners can be rounded. One overall radius applies to all of them, and per-element radii win over it. Unset, every element keeps its built-in look, so nothing changes until you opt in.

| `theme` property | Custom property | Rounds | Unset |
|---|---|---|---|
| `cornerRadius` | `--aui-chart-corner-radius` | Everything below that has no radius of its own. | Each element's own default |
| `barRadius` | `--aui-chart-bar-radius` | Bars and columns (Bar, Combo), histogram bins, waterfall steps, candlestick volume bars, sparkline bars. | Square |
| `cellRadius` | `--aui-chart-cell-radius` | Heatmap and calendar heatmap cells, treemap tiles. | 2 px heatmap cells, a quarter of a calendar cell (at most 3 px), square tiles |
| `sliceRadius` | `--aui-chart-slice-radius` | Pie and donut slices, gauge arcs, funnel stages. | Square |
| `boxRadius` | `--aui-chart-box-radius` | Box plot boxes, candlestick bodies, bullet ranges and measures. | Square |
| `swatchRadius` (0-8) | `--aui-chart-swatch-radius` | Filled legend swatches. | 2 px |
| `tooltipRadius` | `--aui-chart-tooltip-radius` | The tooltip. | `radius-md` |
| `controlRadius` | `--aui-chart-control-radius` | Data-table toggle and container, zoom toolbar buttons, legend buttons. | `radius-sm` |
| `lineJoin` | `--aui-chart-line-join` | Joins of lines, areas, radar outlines, moving averages. | `round` |

Rules:

- **Cascade**: element radius (option or custom property, wherever it is set) > `cornerRadius` / `--aui-chart-corner-radius` > the element's default. The `theme` option writes the same custom properties on the chart host, so a theme, a stylesheet rule, and the option behave alike. Values are px from 0 to 50 (`4px` or `4`); other values count as unset in CSS and throw in the option.
- **Clamping**: a radius never exceeds half the element's width or height, so tiny bars and thin cells stay valid shapes. Slice and arc corners are also clamped to half the ring thickness and to what a thin slice can hold.
- **Bars round at the value end**: the top of positive columns, the bottom of negative ones, the inline end of horizontal bars (mirrored in RTL); the baseline end stays square. **Stacked bars** round only the outermost segment of each direction, so a stack reads as one bar. Floating waterfall steps round all four corners; waterfall totals round at the value end. Bullet ranges round only at the two outer ends of the scale.
- **Slices and arcs**: donut slices round all four corners, pie slices their two outer corners (the center stays sharp). Gauges draw their arcs as filled ring sectors when rounded.
- **Not rounded**: point markers, bubbles, network graph nodes, and outliers are shapes or circles by nature; gridlines, whiskers, wicks, connectors, funnel joins (they meet the stages), and annotation bands (they span the plot) stay square.
- **Rendering**: radii are written as SVG geometry (`rx`/`ry` attributes or path data), never the CSS `rx` property, so they render the same in every supported browser and SVG and PNG exports keep them. Charts read the custom properties when they render: after changing a stylesheet value at run time, call `update({})`.
- **Org Chart** cards follow `nodeRadius` (option) or `--aui-chart-node-radius`, then `--aui-chart-corner-radius`, then `radius-md`.
- **Themes**: `chart-corner-radius`, `chart-bar-radius`, `chart-cell-radius`, `chart-slice-radius`, `chart-box-radius`, `chart-node-radius`, `chart-swatch-radius`, and `chart-line-join` are optional theme tokens (unset by default); `chart-tooltip-radius` and `chart-control-radius` are component tokens. The Theme Designer's Charts section edits all of them.

### Series, annotations, tooltips, and events

- **Per-series style** (Line, Bar, Combo, Scatter, Radar): `series[].style = { color, lineWidth, dash: 'solid' | 'dashed' | 'dotted', marker: 'auto' | 'none' | 'circle' | 'square' | 'diamond' | 'triangle', fillOpacity }`. The legend and tooltip keys show the same color, dash, and marker.
- **Annotations** (Line, Bar, Combo, Scatter, Waterfall, Histogram, Box Plot): reference lines `{ type: 'line', axis, value, label?, tone? }` and bands `{ type: 'band', axis, from, to, label?, tone? }`, drawn under the marks. They are decorative for assistive technology and listed in the generated summary instead.
- **Custom tooltips**: `renderTooltip(context)` returns DOM nodes (never HTML strings) or `null` for the default; `context` has the title, the rows (`label`, `value`, `seriesId`), the column, and what opened it.
- **Point events**: `aui-point-click` fires for a pointer click or Enter / Space on the focused mark, with `{ seriesId, column, row, label, series, value, source }`.
- **Synchronized crosshairs**: charts with the same `syncGroup` show the crosshair and tooltip at the same column when one is hovered or focused; focus never moves between charts.

## Export

`@absoluteui/components/chart-export` turns any rendered chart into a standalone SVG string or a PNG `Blob`, with theme colors, fonts, and patterns copied onto the file, and `downloadChart()` saves it. Nothing is uploaded. See [Chart Export](/docs/components/chart-export/).

## In dashboards

[Dashboard Grid](/docs/components/dashboard-grid/) lays out [Dashboard Widgets](/docs/components/dashboard-widget/) that host charts and [Stat Cards](/docs/components/stat-card/), with drag and resize by pointer and keyboard, breakpoints, and serializable layouts. Charts resize with their widget.
