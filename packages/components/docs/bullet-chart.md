# Bullet Chart

> Package: `@absoluteui/components/bullet-chart` | Styles: `@absoluteui/components/bullet-chart/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

An accessible SVG bullet chart: compact horizontal measures against a target and qualitative ranges (for example poor / satisfactory / good). It provides:
- one row per measure on a shared value axis: up to three shaded range bands, a measure bar growing from zero, and a target tick;
- ranges in three neutral shades (not palette colors), named in each row's accessible label, tooltip, and table (`rangeLabels`), so meaning never depends on shading;
- keyboard-reachable measure bars (one tab stop, Up/Down between rows) whose names read value, target, and range, with a tooltip on focus and hover;
- a generated summary (every measure, and how many are at or above target) and a data table fallback (Measure, Value, Target, Range).

No animation.

## 2. Anatomy

```text
<div class="aui-chart aui-bullet-chart [aui-chart--patterns]">
  <div class="aui-chart__header">title, description</div>
  <ul class="aui-chart__legend" hidden/>
  <div class="aui-chart__body">
    <svg class="aui-chart__svg" role="group" aria-roledescription="bullet chart" aria-labelledby="T" aria-describedby="S">
      <g class="aui-chart__grid" aria-hidden="true"/> <g class="aui-chart__axis aui-chart__axis--value" aria-hidden="true"/>
      <g class="aui-bullet-chart__rows aui-chart__series--c1">
        <g class="aui-bullet-chart__row">
          <g class="aui-bullet-chart__ranges" aria-hidden="true">
            <rect class="aui-bullet-chart__range aui-bullet-chart__range--1"/> ... --2, --3
          </g>
          <rect class="aui-chart__bar aui-bullet-chart__measure aui-chart__mark" role="img" aria-label="Revenue: 270, target 250, Good"/>
          <line class="aui-bullet-chart__target" aria-hidden="true"/>
        </g>
      </g>
      <g class="aui-chart__axis aui-chart__axis--category" aria-hidden="true"><text class="aui-bullet-chart__label">Revenue</text></g>
    </svg>
    <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" hidden/>  <div class="aui-chart__data">Show data table, table</div>
</div>
```

## 3. When to use

- KPIs against targets on a qualitative scale, in dashboards.
- A compact, comparable replacement for rows of gauges or meters.

## 4. When not to use

- Measures on different scales or units (rows share one axis): one chart per scale, or Stat Card.
- Trends over time: use Line Chart or Sparkline.
- One value against a maximum without target or ranges: use Progress Bar or Gauge.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Always empty (no toggleable series). |

Options (`BulletChartOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot. |
| `measures` | `BulletMeasure[]` | - (required) | No | `{ id, label, value: number \| null, target?, ranges? }`; unique ids; `ranges`: up to 3 strictly ascending upper ends, the first range starting at the axis minimum. |
| `rangeLabels` | `string[]` | "Range 1".."Range 3" | No | Names of the ranges, in `ranges` order (up to 3). |
| `color` | `ChartColor` (1-8) | `1` | No | Palette slot of the measure bars. |
| `valueAxis` | `BulletChartValueAxis` | - | No | `{ min?; max?; tickCount? }`: fixed domain (marks clamp) and ticks (2-20). `label` and `includeZero` are validated but unused; the automatic domain always includes zero. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the title. |
| `description` | `string` | - | No | Visible description, also in `aria-describedby`. |
| `summary` | `string` | generated | No | Replaces the generated summary. |
| `valueFormat` | `Intl.NumberFormatOptions` | - | No | Value and target format (names, tooltip, table, summary, ticks). |
| `formatValue` | `(value: number) => string` | - | No | Custom value text; overrides `valueFormat` except on ticks. |
| `hiddenSeries` | `string[]` | - | No | Shared option; no effect. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | Shared option; a bullet chart never shows a legend. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Shared option; no textures are drawn. |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000), split evenly between rows. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Mirrors the axis, labels, and Left/Right keys. |

## 6. Methods

| Method | Description |
|---|---|
| `BulletChart.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render; invalid options throw and keep the previous state. |
| `setSeriesVisible(id, visible)` | Shared method; no visible effect. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, and configuration subscription. |

## 7. Events

None. (There is no legend, so `aui-series-toggle` is never emitted.)

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-point-click` | `BulletChartPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

The shared chart chrome (see Line Chart section 9) plus `aui-bullet-chart__rows`, `__row`, `__ranges`, `__range`, `__range--1..3`, `__measure`, `__target`, `__label`. Measure bars use the shared `aui-chart__bar` paint. All rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/bullet-chart/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-text` and `color-surface` (range shades via `color-mix`, target tick, labels), `color-chart-1..8` (measure bar), `color-chart-grid`, `color-chart-axis`, `font-weight-medium`, `color-focus-ring`.

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

- `boxRadius` (`--aui-chart-box-radius`, default 0): the qualitative ranges round only at the two outer ends of the scale; the measure rounds at its value end (mirrored in RTL). The target is a line.
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default, empty ("No data": no measures), measure missing, measure focused (tooltip), row hovered, table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| plot not focused | Tab | active measure focused, tooltip shown |
| measure focused | arrow keys, Home, End, PageUp, PageDown | another measure focused |
| tooltip visible | Escape | tooltip hidden |
| table closed | Show data table | table shown |
| any | `update({ measures })` | re-rendered; focus stays on the same measure id |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | The plot (one tab stop), the table button, the table region. |
| ArrowDown / ArrowUp | Measure focused | Next / previous row. |
| ArrowRight / ArrowLeft | Measure focused | Also next / previous row (swapped in RTL). |
| Home / End | Measure focused | First / last row. |
| PageUp / PageDown | Measure focused | Ten rows back / forward. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

## 14. ARIA contract

- SVG: `role="group"`, `aria-roledescription` "bullet chart", `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each measure bar: `role="img"`, `aria-label` "{label}: {value}" + ", target {target}" (when set) + ", {range}" (when ranges are set), for example "Revenue: 270, target 250, Good"; exactly one bar has `tabindex="0"`.
- Table toggle: `aria-expanded`, `aria-controls`.
- Range bands, target ticks, labels, the axis, and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- Ranges are neutral shades (22%, 13%, 6% of `color-text` over `color-surface`, darkest first) and are always named in text; pass `rangeLabels` so rows read "Good" rather than "Range 3".
- The value falls in the first range whose upper end is at or above it; values above the last range read as the last range.
- Summary example ends with "1 of 2 at or above target." (measures with a target and a value).
- Forced colors: ranges `Canvas` with `GrayText` outlines; targets and labels `CanvasText`; focus and hover `Highlight`.
- No animation. Manual screen-reader verification is pending.

## 16. Responsive behavior

Width follows the container; labels take up to 35% of the width and are truncated with an ellipsis. Bands are at most 40 px tall; the measure bar is a third of the band. Reflows at 320 CSS px.

## 17. RTL behavior

The value axis is mirrored (bars grow leftward from zero), labels move to the right, ArrowLeft/ArrowRight swap.

## 18. Theme behavior

Range shades derive from `color-text` and `color-surface`, so they follow every theme. The measure bar uses one palette slot (`color`, default `color-chart-1`).

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { bulletChart: { height: 200, dataTable: 'visible' } } });
```

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None.

## 23. Security behavior

All text uses `textContent`; SVG uses `createElementNS`; colors are classes; the height and tooltip position use the CSSOM. No `innerHTML` or style attributes.

## 24. Data handling behavior

No persistence, network access, or telemetry. Values are not logged; validation errors name the option, never its value.

## 25. Performance characteristics

Budget: create with 30 measures < 30 ms in headless Chromium (e2e performance test), including the first render.

## 26. Supported data scale

Up to about 30 measures per chart; raise `height` with the row count (bands shrink with the row height).

## 27. Usage examples

```ts
import { BulletChart } from '@absoluteui/components/bullet-chart';

const host = document.createElement('div');
document.body.append(host);
BulletChart.create(host, {
  label: 'Quarterly goals',
  measures: [
    { id: 'rev', label: 'Revenue', value: 270, target: 250, ranges: [150, 225, 300] },
    { id: 'profit', label: 'Profit', value: 22, target: 26, ranges: [20, 25, 30] },
  ],
  rangeLabels: ['Poor', 'Satisfactory', 'Good'],
});
```

More examples, type-checked in CI: `metadata/bullet-chart/examples.json`.

## 28. Edge cases

- No measures: "No data".
- Missing value (`null`, `NaN`, infinity): no bar (a zero-width focusable mark), "No value" in its name and table; excluded from the at-or-above-target count.
- No target: no tick, "-" in the table. No ranges: no bands, "-" in the Range column.
- Negative values: bars grow from zero toward the negative side; the domain includes zero.
- A fixed `valueAxis` domain clamps bars, targets, and bands to its edges.
- Fewer `rangeLabels` than ranges: the rest read "Range {n}".

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `BULLET_CHART_OPTIONS` | configuration | Blank label; `measures` not an array; measure not an object; empty or duplicate id; label not a string; value not a number or null; target not finite; more than 3 ranges or not strictly ascending finite numbers; more than 3 `rangeLabels` or not strings; `color` not 1-8; invalid `valueAxis` (`max <= min`, `tickCount` outside 2-20). |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched.

## 30. Known limitations

- Horizontal rows on one shared axis; one measure color; at most three ranges.
- `legend`, `patterns`, `hiddenSeries`, `valueAxis.label`, and `valueAxis.includeZero` have no effect.
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.
- No annotations (no cartesian value axes).
- No zoom or pan: each measure has its own fixed range.

## 31. Unsupported scenarios

- Vertical bullets, per-row axes, comparative (second) measures.
- More than three ranges.
- HTML in labels.

## 32. TypeScript definitions

```ts
type BulletChartConfig = ChartBaseConfig;
interface BulletMeasure { id: string; label: string; value: number | null; target?: number; ranges?: readonly number[] }
interface BulletChartOptions extends ChartCommonOptions, Partial<BulletChartConfig> {
  measures: readonly BulletMeasure[];
  rangeLabels?: readonly string[];
  color?: ChartColor;
  valueAxis?: BulletChartValueAxis; // { label?; min?; max?; tickCount?; includeZero? }
}
```

## 33. Vanilla JS example

```ts
import { BulletChart } from '@absoluteui/components/bullet-chart';
import '@absoluteui/components/bullet-chart/style.css';

const host = document.querySelector<HTMLElement>('#kpis');
if (host) {
  BulletChart.create(host, {
    label: 'Customer satisfaction',
    measures: [
      { id: 'csat', label: 'CSAT', value: 4.3, target: 4.5, ranges: [3, 4, 5] },
      { id: 'nps', label: 'NPS / 20', value: 2.4, target: 2.5, ranges: [1, 2, 5] },
    ],
    rangeLabels: ['Poor', 'Fair', 'Good'],
    valueAxis: { min: 0, max: 5 },
    height: 160,
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiBulletChart } from '@absoluteui/angular/bullet-chart';
import type { BulletMeasure } from '@absoluteui/components/bullet-chart';

@Component({
  selector: 'app-goals',
  imports: [AuiBulletChart],
  template: `<aui-bullet-chart label="Quarterly goals" [measures]="measures" [rangeLabels]="ranges"></aui-bullet-chart>`,
})
export class GoalsComponent {
  readonly ranges = ['Poor', 'Satisfactory', 'Good'];
  readonly measures: BulletMeasure[] = [{ id: 'rev', label: 'Revenue', value: 270, target: 250, ranges: [150, 225, 300] }];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
