# Waterfall Chart

> Package: `@absoluteui/components/waterfall-chart` | Styles: `@absoluteui/components/waterfall-chart/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

An accessible SVG waterfall chart that shows how a starting value changes through a sequence of increases and decreases. It provides:
- delta steps that float from the running total, total steps that drop to the baseline (an opening balance, a subtotal, or the closing total);
- dashed connectors between consecutive steps and signed value labels;
- keyboard-reachable steps (one tab stop), including steps without a value, with a tooltip on focus and hover;
- a legend of the step kinds present (Increase, Decrease, Total);
- a generated accessible summary (start, end, largest increase and decrease) and a data table fallback (change, running total, type);
- kinds that differ by color, texture, signed labels, and accessible names, never by color alone (WCAG 1.4.1).

## 2. Anatomy

```text
<div class="aui-chart aui-waterfall-chart [aui-chart--patterns]">
  <div class="aui-chart__header">
    <div class="aui-chart__title" id="T">title</div>
    <p class="aui-chart__description" id="D">description</p>
    <div class="aui-chart__toolbar" hidden/>
  </div>
  <ul class="aui-chart__legend" aria-label="Legend">
    <li class="aui-chart__legend-entry"><span class="aui-chart__legend-item"><svg class="aui-chart__swatch" aria-hidden="true"/>Increase</span></li>
  </ul>
  <div class="aui-chart__body">                                   (height: --aui-chart-height)
    <svg class="aui-chart__svg" role="group" aria-roledescription="waterfall chart" aria-labelledby="T" aria-describedby="D S">
      <g class="aui-chart__grid" aria-hidden="true"/> <g class="aui-chart__axis …" aria-hidden="true"/>
      <g class="aui-waterfall-chart__connectors" aria-hidden="true"><line class="aui-chart__connector"/>...</g>
      <g class="aui-waterfall-chart__bars">
        <g class="aui-waterfall-chart__step aui-waterfall-chart__step--increase aui-chart__series--c3"><rect class="aui-chart__mark aui-chart__bar" role="img" aria-label="Sales: +40 (Increase), running total 140" tabindex="0"/><rect class="aui-chart__pattern" aria-hidden="true"/></g>
        <rect class="aui-chart__mark aui-waterfall-chart__gap" role="img" aria-label="Other: no value, running total 140"/>
      </g>
      <g class="aui-waterfall-chart__labels" aria-hidden="true"><text class="aui-chart__value-label">+40</text>...</g>
    </svg>
    <div class="aui-chart__empty" hidden/>  <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" id="S" hidden>generated summary</p>
  <div class="aui-chart__data">...Show data table...</div>
</div>
```

## 3. When to use

- Bridges from an opening to a closing value (profit and loss, cash flow, headcount).
- Explaining which steps contributed most to a change.

## 4. When not to use

- Independent values per category: use Bar Chart.
- Trends over time: use Line Chart.
- Part-to-whole without an order: use Pie Chart.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Always empty (no series). |

Options (`WaterfallChartOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot. |
| `steps` | `WaterfallStep[]` | - (required) | No | `{ id, label, value?, kind?: 'delta' \| 'total' }`. Delta (default): the change (`null`: a gap). Total with a value: the running total becomes it; without: shows the current running total. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the title. |
| `description` | `string` | - | No | Visible description, also in `aria-describedby`. |
| `summary` | `string` | generated | No | Replaces the generated summary. |
| `colors` | `{ increase?; decrease?; total? }` (1-8) | `{ increase: 3, decrease: 2, total: 1 }` | No | Palette slots per kind. |
| `categoryAxis` | `{ label? }` | - | No | Category axis title (and first table column header). |
| `valueAxis` | `{ label?; min?; max?; tickCount?; includeZero? }` | - | No | Value axis title, fixed domain, tick count (2-20); the domain always includes zero. |
| `valueFormat` | `Intl.NumberFormatOptions` | - | No | Value format; changes are signed (`signDisplay: 'exceptZero'`). |
| `formatValue` | `(value) => string` | - | No | Custom value text (positive changes get a `+` prefix; not used for ticks). |
| `hiddenSeries` | `string[]` | - | No | Accepted for the shared chart contract; no effect. |
| `annotations` | `ChartAnnotation[]` | - | No | Reference lines `{ type: 'line', axis: 'x' \| 'y', value, label?, tone? }` and bands `{ type: 'band', axis, from, to, label?, tone? }` (x: step label or index; y: number); drawn under the marks, aria-hidden, listed in the summary. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | `auto` and `show` display the kind legend; `hide` removes it. Not toggleable. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Textures per kind (always on in forced colors). |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000). |
| `valueLabels` | `boolean` | `true` | Yes | Signed change or total on each bar (omitted when wider than the step). |
| `connectors` | `boolean` | `true` | Yes | Dashed connectors at the running total (none into a total step). |
| `locale` | `string` | common `locale` | Yes (inherited) | Number and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Mirrors the category axis and arrow keys. |

## 6. Methods

| Method | Description |
|---|---|
| `WaterfallChart.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render. Invalid options throw and keep the previous state; focus stays on the same step (by id). |
| `setSeriesVisible(id, visible)` | Inherited from the shared chart controller; no visible effect. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, and configuration subscription. |

## 7. Events

None. The legend is not interactive, so `aui-series-toggle` is never emitted.

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-point-click` | `WaterfallChartPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |

## 8. Slots/content areas

None. Title, description, labels, and values are text.

## 9. CSS parts/hooks

Shared chart chrome (see Line Chart) and shared marks `aui-chart__bar`, `__pattern`, `__connector`, `__value-label`. Waterfall: `aui-waterfall-chart__bars`, `__step`, `__step--increase`, `__step--decrease`, `__step--total`, `__gap`, `__connectors`, `__labels`. Colors are `--aui-chart-color`; all rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`, `__annotations`, `__annotation-line`, `__annotation-band`, `__annotation-label`, `__annotation--neutral|info|success|warning|danger`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/waterfall-chart/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1` ... `color-chart-8` (kinds), `color-chart-axis` (axes, connectors), `color-chart-grid`, `color-surface` (bar separators, tooltip), `color-text` (active bar outline, value labels), `color-focus-ring`.

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

- Steps: `barRadius` (`--aui-chart-bar-radius`, default 0). Floating increase and decrease steps round all four corners; totals, anchored at zero, round at the value end. Connectors are lines.
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default, empty ("No data"), step focused (tooltip), hovered, table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| plot not focused | Tab | active step focused, tooltip shown |
| step focused | arrow keys, Home, End, PageUp, PageDown | another step focused |
| tooltip visible | Escape | tooltip hidden, focus unchanged |
| table closed | Show data table | table built and shown |
| any | container resize | re-render at the new width; focus kept on the same step |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | The plot (one tab stop), the table button, the table region. |
| ArrowLeft / ArrowRight | Step focused | Previous / next step (mirrored in RTL); steps without a value are reachable. |
| ArrowUp / ArrowDown | Step focused | Previous / next step. |
| Home / End | Step focused | First / last step. |
| PageUp / PageDown | Step focused | Ten steps back / forward. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

## 14. ARIA contract

- The SVG is `role="group"`, `aria-roledescription` = localized "waterfall chart", `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each step is `role="img"` with `aria-label` "{label}: {change} ({kind}), running total {total}"; totals "{label}: total {total}" (for example "Closing: total 125"); gaps "{label}: no value, running total {total}". Exactly one step has `tabindex="0"`.
- Legend: `ul` named "Legend" with text entries (no buttons).
- Table toggle: `aria-expanded` and `aria-controls`; the table has a caption, column headers (Category, Change, Running total, Type), and row headers.
- Axes, connectors, value labels, textures, and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- The summary names the type, step count, start and end values, and the largest increase and decrease, for example "waterfall chart, 5 steps. Starts at 100, ends at 125. Largest increase: Sales (+40). Largest decrease: Refunds (-15)."
- Increases, decreases, and totals differ by color, texture, signed labels, accessible names, and the table's Type column.
- Forced colors use `CanvasText` and keep textures; focus uses `Highlight`. Nothing animates.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

The width follows the container (ResizeObserver); the height is `height`. Category labels thin and truncate with the band width; value labels wider than about one step are omitted. Reflows at 320 CSS px.

## 17. RTL behavior

`direction: 'rtl'` mirrors the category axis (first step at the right), puts the value axis on the right, mirrors connectors, and swaps ArrowLeft/ArrowRight.

## 18. Theme behavior

Kind colors come from `color-chart-<n>` via `colors` (increase 3, decrease 2, total 1 by default). Connectors use `color-chart-axis`; value labels `color-text` with a surface halo.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { waterfallChart: { connectors: false, valueLabels: true, height: 280 } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable: steps are text categories; no dates are formatted.

## 22. Icon customization points

None. Legend keys are drawn shapes; no toolbar is shown.

## 23. Security behavior

All text uses `textContent`; SVG is built with `createElementNS`. Colors are classes; sizes and the tooltip position are written through the CSSOM. No `innerHTML`, style attributes, or inline handlers.

## 24. Data handling behavior

Renders the given data only; no persistence, network access, or telemetry. Validation errors name the option, never its value.

## 25. Performance characteristics

Budget: `WaterfallChart.create` with 200 steps under 40 ms in headless Chromium, including the first render (e2e performance test, `tests/e2e/perf-r3.spec.ts`). One DOM node per step; the data table is built only when opened in toggle mode.

## 26. Supported data scale

Tested with 200 steps; labels thin out on narrow plots.

## 27. Usage examples

```ts
import { WaterfallChart, type WaterfallStep } from '@absoluteui/components/waterfall-chart';

const steps: WaterfallStep[] = [
  { id: 'open', label: 'Opening', kind: 'total', value: 100 },
  { id: 'sales', label: 'Sales', value: 40 },
  { id: 'refunds', label: 'Refunds', value: -15 },
  { id: 'close', label: 'Closing', kind: 'total' },
];
const host = document.createElement('div');
document.body.append(host);
WaterfallChart.create(host, { label: 'Profit bridge', steps });
```

More examples, type-checked in CI: `metadata/waterfall-chart/examples.json`.

Export: `@absoluteui/components/chart-export` (`chartToSvg`, `chartToPng`, `downloadChart`) exports any chart instance to SVG or PNG.

## 28. Edge cases

- No steps, or only steps without a value: "No data".
- A delta of `null` is a gap: no bar, an invisible focus target at the running total, the total carries over.
- A zero change is drawn as a 1 px bar and labelled "Increase".
- Negative running totals: the domain crosses zero; decreases and negative totals put their labels below the bar.
- The first delta starts from zero; a leading total with a value sets the opening balance.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `WATERFALL_CHART_OPTIONS` | configuration | Missing label; steps not an array; step ids not unique or empty; non-string labels; non-numeric values; invalid `kind`; `colors` outside 1-8; invalid axis options. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched; a failed `update()` keeps the previous state.

## 30. Known limitations

- One sequence per chart; no series or legend toggling.
- Totals always start at zero.
- Value labels are omitted when wider than the step.
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.
- No zoom or pan: the running total depends on every step, so a partial window would misread it.

## 31. Unsupported scenarios

- Horizontal orientation; grouped or stacked waterfalls.
- Zoom, pan, and crosshair.
- HTML in labels or tooltips.

## 32. TypeScript definitions

```ts
type WaterfallStepKind = 'delta' | 'total';
interface WaterfallStep { id: string; label: string; value?: number | null; kind?: WaterfallStepKind }
interface WaterfallChartColors { increase?: ChartColor; decrease?: ChartColor; total?: ChartColor }
interface WaterfallChartConfig { legend: ChartLegendMode; dataTable: ChartTableMode; tooltip: boolean; patterns: boolean; height: number; valueLabels: boolean; connectors: boolean }
interface WaterfallChartOptions extends ChartCommonOptions, Partial<WaterfallChartConfig> {
  steps: readonly WaterfallStep[];
  colors?: WaterfallChartColors;
  categoryAxis?: { label?: string };
  valueAxis?: WaterfallChartValueAxis; // { label?; min?; max?; tickCount?; includeZero? }
}
```

## 33. Vanilla JS example

```ts
import { WaterfallChart } from '@absoluteui/components/waterfall-chart';
import '@absoluteui/components/waterfall-chart/style.css';

const host = document.querySelector<HTMLElement>('#cash');
if (host) {
  WaterfallChart.create(host, {
    label: 'Cash flow',
    steps: [
      { id: 'start', label: 'Start', kind: 'total', value: 500 },
      { id: 'in', label: 'Receipts', value: 320 },
      { id: 'out', label: 'Payments', value: -410 },
      { id: 'end', label: 'End', kind: 'total' },
    ],
    valueFormat: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiWaterfallChart } from '@absoluteui/angular/waterfall-chart';
import type { WaterfallStep } from '@absoluteui/components/waterfall-chart';

@Component({
  selector: 'app-bridge',
  imports: [AuiWaterfallChart],
  template: `<aui-waterfall-chart label="Profit bridge" [steps]="steps" [connectors]="true"></aui-waterfall-chart>`,
})
export class BridgeComponent {
  readonly steps: WaterfallStep[] = [
    { id: 'open', label: 'Opening', kind: 'total', value: 100 },
    { id: 'sales', label: 'Sales', value: 40 },
    { id: 'close', label: 'Closing', kind: 'total' },
  ];
}
```

## 35. React example

```tsx
import { AuiWaterfallChart } from '@absoluteui/react/waterfall-chart';
import type { WaterfallStep } from '@absoluteui/components/waterfall-chart';

const steps: WaterfallStep[] = [
  { id: 'open', label: 'Opening', kind: 'total', value: 100 },
  { id: 'sales', label: 'Sales', value: 40 },
  { id: 'refunds', label: 'Refunds', value: -15 },
  { id: 'close', label: 'Closing', kind: 'total' },
];

export function Example() {
  return <AuiWaterfallChart label="Profit bridge" steps={steps} colors={{ increase: 3, decrease: 2, total: 1 }} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiWaterfallChart } from '@absoluteui/vue/waterfall-chart';
import type { WaterfallStep } from '@absoluteui/components/waterfall-chart';
const steps: WaterfallStep[] = [
  { id: 'open', label: 'Opening', kind: 'total', value: 100 },
  { id: 'sales', label: 'Sales', value: 40 },
  { id: 'close', label: 'Closing', kind: 'total' },
];
</script>

<template>
  <AuiWaterfallChart label="Profit bridge" :steps="steps" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
