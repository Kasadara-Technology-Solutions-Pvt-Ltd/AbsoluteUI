# Funnel Chart

> Package: `@absoluteui/components/funnel-chart` | Styles: `@absoluteui/components/funnel-chart/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

An accessible SVG funnel chart for sequential stages (for example visits, sign-ups, purchases). It provides:
- one centered bar per stage, its width proportional to the stage value (at least 2 px), joined to the next stage by a decorative trapezoid connector;
- the stage name and value beside the funnel, plus the conversion from the previous stage (`showConversion`);
- keyboard-reachable stages (one tab stop, arrow keys) whose accessible names read the value and the conversion from the first and the previous stage, with a tooltip on focus and hover;
- a generated summary (overall conversion and the largest drop) and a data table fallback (Stage, Value, Of first stage, Of previous stage).

No animation.

## 2. Anatomy

```text
<div class="aui-chart aui-funnel-chart [aui-chart--patterns]">
  <div class="aui-chart__header">title, description</div>
  <ul class="aui-chart__legend" hidden/>
  <div class="aui-chart__body">
    <svg class="aui-chart__svg" role="group" aria-roledescription="funnel chart" aria-labelledby="T" aria-describedby="S">
      <g class="aui-funnel-chart__joins" aria-hidden="true"><path class="aui-funnel-chart__join aui-chart__series--c1"/></g>
      <g class="aui-funnel-chart__stages">
        <g class="aui-funnel-chart__stage aui-chart__series--c1">
          <rect class="aui-chart__bar aui-chart__mark" role="img" aria-label="Cart: 400, 40% of Visits, 40% of previous stage"/>
        </g>
      </g>
      <g class="aui-funnel-chart__labels" aria-hidden="true">
        <text class="aui-funnel-chart__name">Cart</text> <text class="aui-chart__tick-label">400 | 40%</text>
      </g>
    </svg>
    <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" hidden/>  <div class="aui-chart__data">Show data table, table</div>
</div>
```

## 3. When to use

- A fixed sequence of stages where each stage is a subset of the previous one (conversion or pipeline funnels).
- Showing where the largest drop-off happens.

## 4. When not to use

- Unordered categories or categories without a subset relationship: use Bar Chart.
- Several funnels side by side: use a grouped Bar Chart.
- Negative values (rejected by validation).

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Always empty (no toggleable series). |

Options (`FunnelChartOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot. |
| `stages` | `FunnelStage[]` | - (required) | No | `{ id, label, value: number \| null, color?: 1-8 }` in order; unique ids; values >= 0; `null`/`NaN`/infinities are a missing stage. |
| `color` | `ChartColor` (1-8) | `1` | No | Palette slot for stages without their own `color`. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the title. |
| `description` | `string` | - | No | Visible description, also in `aria-describedby`. |
| `summary` | `string` | generated | No | Replaces the generated summary. |
| `valueFormat` | `Intl.NumberFormatOptions` | - | No | Value format (labels, names, tooltip, table, summary). |
| `formatValue` | `(value: number) => string` | - | No | Custom value text; overrides `valueFormat`. |
| `hiddenSeries` | `string[]` | - | No | Shared option; no effect on a funnel. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | Shared option; a funnel never shows a legend. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Shared option; a funnel draws no textures. |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000), split evenly between stages. |
| `showConversion` | `boolean` | `true` | Yes | Print "value | conversion from previous stage" beside each stage. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number, percent, and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Labels on the right in RTL; arrow keys mirrored. |

## 6. Methods

| Method | Description |
|---|---|
| `FunnelChart.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render; invalid options throw and keep the previous state. |
| `setSeriesVisible(id, visible)` | Shared method; no visible effect on a funnel. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, and configuration subscription. |

## 7. Events

None. (A funnel has no legend, so `aui-series-toggle` is never emitted.)

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-point-click` | `FunnelChartPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

The shared chart chrome (see Line Chart section 9) plus `aui-funnel-chart__stages`, `__stage`, `__missing`, `__joins`, `__join`, `__labels`, `__name`. Stage bars use the shared `aui-chart__bar` paint; values beside the funnel use `aui-chart__tick-label`. All rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/funnel-chart/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1..8`, `color-surface` (bar separator), `color-text` (stage names, hover and focus outline), `color-text-muted` (values), `color-chart-axis` (missing stage outline), `font-weight-medium`, `color-focus-ring`.

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

- Stages: `sliceRadius` (`--aui-chart-slice-radius`, default 0). The joins between stages stay sharp so they meet the stages without gaps. Earlier versions gave the stages a 2 px `rx` attribute that the stylesheet's `rx: 0` overrode in Chromium and Firefox; the default keeps that square look.
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default, empty ("No data": no stages, or no stage above zero), stage missing, stage focused (tooltip), stage hovered, table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| plot not focused | Tab | active stage focused, tooltip shown |
| stage focused | arrow keys, Home, End, PageUp, PageDown | another stage focused |
| tooltip visible | Escape | tooltip hidden |
| table closed | Show data table | table shown |
| any | `update({ stages })` | re-rendered; focus stays on the same stage id |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | The plot (one tab stop), the table button, the table region. |
| ArrowDown / ArrowRight | Stage focused | Next stage (ArrowLeft in RTL). |
| ArrowUp / ArrowLeft | Stage focused | Previous stage (ArrowRight in RTL). |
| Home / End | Stage focused | First / last stage. |
| PageUp / PageDown | Stage focused | Ten stages back / forward. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

## 14. ARIA contract

- SVG: `role="group"`, `aria-roledescription` "funnel chart", `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each stage bar: `role="img"`, `aria-label` "{label}: {value}" for the first stage, "{label}: {value}, {ofFirst} of {first}, {ofPrevious} of previous stage" for later stages (for example "Cart: 400, 40% of Visits, 40% of previous stage"); exactly one bar has `tabindex="0"`.
- Table toggle: `aria-expanded`, `aria-controls`.
- Connectors, stage names and values beside the funnel, and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- Stage names read the value and the conversion from the first and previous stage, so the funnel's meaning is available without seeing bar widths.
- Summary example: "funnel chart, 3 stages, from Visits (1,000) to Paid (100), 10% overall. Largest drop: Cart to Paid (25% kept)."
- Meaning never depends on color: widths, order, and printed text carry the data.
- Forced colors: connectors `GrayText`, names `CanvasText`, bars keep a `Canvas` separator; focus and hover use `Highlight`.
- No animation. Manual screen-reader verification is pending.

## 16. Responsive behavior

Width follows the container. Stage names and values take up to 40% of the width and are truncated with an ellipsis; full text stays in names, tooltip, and table. Reflows at 320 CSS px.

## 17. RTL behavior

Stage names and values move to the right of the funnel and are right-aligned; ArrowLeft/ArrowRight swap. The funnel shape is symmetric.

## 18. Theme behavior

Stages use `color-chart-1..8` (3:1 against surfaces in all themes); connectors use the stage color at low opacity (decorative). Missing stages are a dashed `color-chart-axis` outline.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { funnelChart: { showConversion: false, dataTable: 'visible' } } });
```

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable (stages are text).

## 22. Icon customization points

None.

## 23. Security behavior

All text uses `textContent`; SVG uses `createElementNS`; colors are classes; the height and tooltip position use the CSSOM. No `innerHTML` or style attributes.

## 24. Data handling behavior

No persistence, network access, or telemetry. Values are not logged; validation errors name the option, never its value.

## 25. Performance characteristics

Budget: create with 20 stages < 20 ms in headless Chromium (e2e performance test), including the first render.

## 26. Supported data scale

Up to about 20 stages (each is one focusable node, one connector, two labels). Aggregate longer sequences first.

## 27. Usage examples

```ts
import { FunnelChart } from '@absoluteui/components/funnel-chart';

const host = document.createElement('div');
document.body.append(host);
FunnelChart.create(host, {
  label: 'Checkout',
  stages: [
    { id: 'visits', label: 'Visits', value: 1000 },
    { id: 'cart', label: 'Cart', value: 400 },
    { id: 'paid', label: 'Paid', value: 100 },
  ],
});
```

More examples, type-checked in CI: `metadata/funnel-chart/examples.json`.

## 28. Edge cases

- No stages, or every stage zero or missing: "No data".
- Missing stage (`null`, `NaN`, infinity): an empty, zero-width dashed placeholder (still focusable), "No value" in its name and the table, no connectors to it; the next stage's conversion uses the previous stage that has a value.
- First (or previous) stage zero or missing: conversions are not computed; the stage reads only its value and the table shows "-".
- A zero stage is drawn 2 px wide so it stays focusable and visible.
- A later stage larger than an earlier one reads conversions above 100%.
- Long stage names are truncated with an ellipsis beside the funnel.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `FUNNEL_CHART_OPTIONS` | configuration | Blank label; `stages` not an array; stage not an object; empty or duplicate id; label not a string; negative value; `color` not 1-8. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration (for example `height` outside 120-2000). |

A failed construction leaves the host untouched; a failed `update()` keeps the previous state.

## 30. Known limitations

- One funnel per chart, no legend.
- `legend`, `patterns`, and `hiddenSeries` are shared chart options without effect here.
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.
- No annotations (no cartesian value axes).
- No zoom or pan: stages have no axis to zoom.

## 31. Unsupported scenarios

- Negative values; several funnels or stage segments in one chart.
- Curved, pyramid, or proportional-area shapes.
- HTML in labels.

## 32. TypeScript definitions

```ts
interface FunnelChartConfig extends ChartBaseConfig { showConversion: boolean }
interface FunnelStage { id: string; label: string; value: number | null; color?: ChartColor }
interface FunnelChartOptions extends ChartCommonOptions, Partial<FunnelChartConfig> {
  stages: readonly FunnelStage[];
  color?: ChartColor;
}
```

## 33. Vanilla JS example

```ts
import { FunnelChart } from '@absoluteui/components/funnel-chart';
import '@absoluteui/components/funnel-chart/style.css';

const host = document.querySelector<HTMLElement>('#signup');
if (host) {
  FunnelChart.create(host, {
    label: 'Sign-up funnel',
    stages: [
      { id: 'landing', label: 'Landing page', value: 8200 },
      { id: 'form', label: 'Form started', value: 3100 },
      { id: 'done', label: 'Account created', value: 2400 },
    ],
    valueFormat: { notation: 'compact' },
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiFunnelChart } from '@absoluteui/angular/funnel-chart';
import type { FunnelStage } from '@absoluteui/components/funnel-chart';

@Component({
  selector: 'app-checkout',
  imports: [AuiFunnelChart],
  template: `<aui-funnel-chart label="Checkout" [stages]="stages"></aui-funnel-chart>`,
})
export class CheckoutComponent {
  readonly stages: FunnelStage[] = [
    { id: 'visits', label: 'Visits', value: 1000 },
    { id: 'paid', label: 'Paid', value: 100 },
  ];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
