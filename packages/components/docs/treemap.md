# Treemap

> Package: `@absoluteui/components/treemap` | Styles: `@absoluteui/components/treemap/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

An accessible SVG treemap for hierarchical part-to-whole data: rectangles laid out with the squarified algorithm (area proportional to value). It provides:
- one level at a time, tiles sorted by value (largest first); groups default to the sum of their children;
- drill-down: a group tile opens with a click or Enter/Space; Backspace and a breadcrumb (`nav` "Treemap path") in the chart toolbar go back up; each change emits `aui-drill` and is announced ("Showing All / Engineering");
- keyboard-reachable tiles in size order (one tab stop, arrow keys) with a tooltip on focus and hover;
- printed label and value in tiles large enough to hold them (`tileLabels`);
- textures (with `patterns`) and labels as non-color cues (WCAG 1.4.1);
- a generated summary and a data table of the whole hierarchy.

The layout function is exported too: `squarify(values, box)`. Nothing animates.

## 2. Anatomy

```text
<div class="aui-chart aui-treemap [aui-chart--patterns]">
  <div class="aui-chart__header">
    title, description
    <div class="aui-chart__toolbar">                                  (below the top level)
      <nav class="aui-treemap__path" aria-label="Treemap path">
        <ol class="aui-treemap__path-list">
          <li class="aui-treemap__path-item"><button class="aui-treemap__path-button">All</button></li>
          <li class="aui-treemap__path-item"><span aria-current="location">Engineering</span></li>
        </ol>
      </nav>
    </div>
  </div>
  <div class="aui-chart__body">
    <svg class="aui-chart__svg" role="group" aria-roledescription="treemap" aria-labelledby="T" aria-describedby="S">
      <g class="aui-treemap__tiles">
        <g class="aui-treemap__tile-group aui-chart__series--c1">
          <rect class="aui-treemap__tile [aui-treemap__tile--group] aui-chart__mark" role="img" aria-label="Engineering: 50 (50%), 2 items" tabindex="0"/>
          <rect class="aui-chart__pattern" aria-hidden="true"/>
        </g>
      </g>
      <g class="aui-treemap__labels" aria-hidden="true">Engineering >, 50</g>
    </svg>
    <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" hidden/>  <div class="aui-chart__data">Show data table, table</div>
</div>
```

## 3. When to use

- Part-to-whole breakdowns with many items or a hierarchy (budgets, disk usage, portfolio composition).
- Showing which items dominate a total when a pie would need too many slices.

## 4. When not to use

- Precise comparison of values: use Bar Chart (areas compare poorly).
- A few parts of one total: use Pie Chart or Bar Chart.
- Negative values (not plotted).

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The plot (`role="group"`). |
| `summary` | `string` | Generated (or custom) accessible summary. |
| `root` | `string \| null` | Id of the shown group (`null`: top level). |
| `path` | `string[]` | Ids from the top level to the shown group. |
| `hiddenSeries` | `string[]` | Shared chart property; always empty. |

Options (`TreemapOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title; accessible name of the plot; table caption. |
| `data` | `TreemapNode[]` | - (required) | No | `{ id, label, value?, children?, color? }`; ids unique across the tree; at most 32 levels. |
| `root` | `string \| null` | `null` | No | Shown group; unknown ids and leaves fall back to the top level. |
| `drillDown` | `boolean` | `true` | No | Allow opening groups; `false` hides the breadcrumb. |
| `rootLabel` | `string` | "All" | No | Top level's name in the breadcrumb. |
| `hideLabel`, `description`, `summary`, `valueFormat`, `formatValue` | | | No | As in Line Chart. |
| `hiddenSeries` | `string[]` | - | No | Shared chart option; no effect. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. See section 10. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` | - | No | Custom tooltip content as DOM nodes (never HTML strings); `null` keeps the default. `context`: `{ title, rows: { label, value, seriesId }[], column, row, source }`. |
| `syncGroup` | `string` | - | No | Charts with the same group show the crosshair, highlight, and tooltip at the same column when one is hovered or focused (focus stays). |
| `legend` | `'auto' \| 'show' \| 'hide'` | `'auto'` | Yes | Shared chart option; a treemap never shows a legend. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Yes | Data table fallback mode. |
| `tooltip` | `boolean` | `true` | Yes | Tooltip on hover and focus. |
| `patterns` | `boolean` | `false` | Yes | Tile textures (always on in forced colors). |
| `height` | `number` | `300` | Yes | Plot height in px (120-2000). |
| `tileLabels` | `boolean` | `true` | Yes | Print label and value in tiles that fit them. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Mirrors the layout; swaps ArrowLeft/ArrowRight. |

## 6. Methods

| Method | Description |
|---|---|
| `Treemap.create(host, options)` | Render into `host` (children are replaced). |
| `drillTo(id)` | Show group `id` (`null`: top level); ignored for leaves, unknown ids, and the current group. Emits `aui-drill`, announces the path, and moves focus into the tiles when focus was in the chart. |
| `update(options)` | Merge, validate, re-render; invalid options throw and keep the previous state. `root` replaces the shown group without an event. |
| `setSeriesVisible(id, visible)` | Shared chart method; no effect beyond a re-render. |
| `destroy()` | Remove rendering, classes, listeners, resize observer, and configuration subscription. |
| `squarify(values, box)` | Exported layout function: `values` positive and sorted descending; returns one `{ x, y, w, h }` per value. |

Export: `@absoluteui/components/chart-export` (`chartToSvg`, `chartToPng`, `downloadChart`) serializes the shown level to SVG or PNG.

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-drill` | `{ id: string \| null; path: string[] }` (`TreemapDrillDetail`) | Yes | The shown group changed (tile click, Enter/Space, Backspace, breadcrumb, or `drillTo()`). Not cancelable; not emitted for `update({ root })`. |
| `aui-point-click` | `TreemapPointClickDetail` (= `ChartPointClickDetail`): `{ seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A data mark was activated: pointer click or tap, or Enter / Space on the focused mark. Not cancelable. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

The shared chart chrome (see Line Chart section 9) and toolbar (`aui-chart__toolbar`) plus `aui-treemap`, `__tiles`, `__tile-group`, `__tile`, `__tile--group`, `__labels`, `__label`, `__value`, `__path`, `__path-list`, `__path-item`, `__path-button`. All rules are in the `aui.components` layer. Look and feel: `aui-chart--legend-bottom|start|end`, `aui-chart--no-grid`, `aui-chart--gradient`, `aui-chart--animate` and `aui-chart--entering`, `__gradient`, `__tooltip--custom`. Per-series styles set `--aui-chart-series-color`, `--aui-chart-series-line-width`, and `--aui-chart-series-fill-opacity` on the series group.

## 10. Design tokens

See `metadata/treemap/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1..8` (tiles), `color-surface` (tile gaps, textures, label halo), `color-text` (hover and focus outline), `color-link` and `touch-target-min` (breadcrumb buttons), `color-focus-ring`.

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

- Tiles: `cellRadius` (`--aui-chart-cell-radius`, default 0). Label chips keep their 3 px rounding.
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

top level, drilled into a group (breadcrumb shown), drill-down off, empty ("No data": no positive values), tile focused (tooltip), tile hovered, table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any level | click or Enter/Space on a group tile | that group; focus on its largest tile; `aui-drill`; "Showing ..." announced |
| below the top level | Backspace on a tile | parent level; focus on the group you came from; `aui-drill` |
| below the top level | breadcrumb button | that level; `aui-drill` |
| any | `drillTo(id)` | that level; `aui-drill` |
| any | `update({ root })` | that level; no event |
| tooltip visible | Escape | tooltip hidden |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Breadcrumb buttons (below the top level), the plot (one tab stop), the table button, the table region. |
| ArrowRight / ArrowDown | Tile focused | Next tile in size order; ArrowLeft/ArrowRight swap in RTL. |
| ArrowLeft / ArrowUp | Tile focused | Previous tile. |
| Home / End | Tile focused | Largest / smallest tile. |
| PageUp / PageDown | Tile focused | Ten tiles back / forward. |
| Enter / Space | Group tile focused | Open the group (with `drillDown`). |
| Backspace | Tile focused below the top level | Go up one level (with `drillDown`). |
| Enter / Space | Breadcrumb button | Show that level. |
| Escape | Tooltip visible | Hide the tooltip. |
| Enter / Space | Mark focused | Fires `aui-point-click` (keyboard source); focus and navigation are unchanged. |

## 14. ARIA contract

- SVG: `role="group"`, `aria-roledescription` "treemap", `aria-labelledby` -> title, `aria-describedby` -> description and summary.
- Each tile: `role="img"`, `aria-label` "{label}: {value} ({percent})", groups "{label}: {value} ({percent}), {count} items" (percent of the shown level); exactly one tile has `tabindex="0"`.
- Breadcrumb: `nav` named "Treemap path" with an `ol`; ancestors are `button`s; the current level has `aria-current="location"`.
- After each drill, "Showing {path}" is announced through a polite live region.
- Printed labels, textures, and the tooltip are `aria-hidden`.

## 15. Accessibility notes

- Tiles are reachable in size order (largest first). Drilling down focuses the largest tile of the group; going up focuses the group you came from, so users never lose their place.
- The summary names the shown path, item count, total, and the three largest items: "Showing All / Engineering. treemap, 2 items, total 50. Largest: Web (60%) and API (40%)."
- The data table lists the whole hierarchy with name paths ("Engineering / Web"), so every value is reachable without drilling.
- Tiles are separated by a `color-surface` gap; textures and printed labels are the non-color cues.
- Openable tiles are identified by their item count in the accessible name and ">" in the printed label; Backspace is not discoverable on its own, so the breadcrumb is the visible way back.
- Forced colors: tiles use `CanvasText` with `Canvas` gaps and textures; focus uses `Highlight`; breadcrumb buttons `LinkText`.
- No animation. Manual screen-reader verification is pending.

## 16. Responsive behavior

The width follows the container (ResizeObserver); the height is `height`; the layout is recomputed on resize. Labels appear in tiles at least 3em wide and 1.6em tall (values from 3em tall) and are truncated to fit. The breadcrumb wraps; its buttons meet the minimum touch target height. Reflows at 320 CSS px.

## 17. RTL behavior

`direction: 'rtl'` mirrors the layout horizontally (largest tile at the top right), anchors tile labels at the right, and swaps ArrowLeft/ArrowRight. The breadcrumb, tooltip, and table follow the document direction.

## 18. Theme behavior

Tiles use `color-chart-1..8` by palette slot (position in the shown level, or `color`); each meets 3:1 against surfaces in all shipped themes. Printed labels use `color-text` with a `color-surface` halo.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { treemap: { tileLabels: false, dataTable: 'visible' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None. The group marker ">" is text in the printed label.

## 23. Security behavior

All text uses `textContent`; SVG uses `createElementNS`; colors are classes. No `innerHTML` or style attributes.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Budget: `Treemap.create` with 500 leaves < 60 ms in headless Chromium (e2e performance test), including the first render. Only the shown level is drawn; the data table is built lazily.

## 26. Supported data scale

Hundreds of leaves in total; keep each level to a few dozen items so tiles stay large enough to label and target.

## 27. Usage examples

```ts
import { Treemap } from '@absoluteui/components/treemap';

const host = document.createElement('div');
document.body.append(host);
Treemap.create(host, {
  label: 'Budget',
  data: [
    { id: 'eng', label: 'Engineering', children: [{ id: 'web', label: 'Web', value: 30 }, { id: 'api', label: 'API', value: 20 }] },
    { id: 'ops', label: 'Operations', value: 25 },
    { id: 'hr', label: 'People', value: 25 },
  ],
});
```

More examples, type-checked in CI: `metadata/treemap/examples.json`.

## 28. Edge cases

- Zero, negative, and missing values are not plotted (and not listed in the table); groups whose children are all unplotted become leaves (or disappear).
- A group's own positive `value` replaces the sum of its children.
- No positive values at all: "No data".
- `root` that no longer exists (or became a leaf) after `update()`: the top level is shown.
- Tiny tiles get no printed label; the tooltip, accessible name, and table still show their values.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TREEMAP_OPTIONS` | configuration | Missing label; `data` not an array; node ids not unique or empty; non-string labels; non-numeric values; invalid color or children; more than 32 levels; invalid `root`, `drillDown`, `rootLabel`, or formatters. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched.

## 30. Known limitations

- One level is drawn at a time; grandchildren are not shown nested.
- Tiles are always sorted by value.
- Manual screen-reader verification is pending.
- Animation is opt-in (`theme.animation`) and replays after each data or option change; it never runs with `prefers-reduced-motion: reduce` or `[data-aui-animation='none']`.
- `syncGroup` matches charts by column index (category or x index); use it for charts that share their categories or x values.
- No annotations (no cartesian value axes).
- No zoom or pan: use drill-down to focus a branch.

## 31. Unsupported scenarios

- Nested multi-level rendering, sunburst and icicle layouts.
- Selection and zoom animation.

## 32. TypeScript definitions

```ts
interface TreemapConfig extends ChartBaseConfig { tileLabels: boolean }
interface TreemapNode {
  id: string;
  label: string;
  value?: number | null;
  children?: readonly TreemapNode[];
  color?: ChartColor;
}
interface TreemapOptions extends ChartCommonOptions, Partial<TreemapConfig> {
  data: readonly TreemapNode[];
  root?: string | null;
  drillDown?: boolean;
  rootLabel?: string;
}
interface TreemapDrillDetail { id: string | null; path: string[] }
function squarify(values: readonly number[], box: Readonly<{ x: number; y: number; w: number; h: number }>): { x: number; y: number; w: number; h: number }[];
```

## 33. Vanilla JS example

```ts
import { Treemap, type TreemapDrillDetail } from '@absoluteui/components/treemap';
import '@absoluteui/components/treemap/style.css';

const host = document.querySelector<HTMLElement>('#portfolio');
if (host) {
  Treemap.create(host, {
    label: 'Portfolio',
    rootLabel: 'All assets',
    data: [
      { id: 'equity', label: 'Equity', children: [{ id: 'us', label: 'US', value: 40 }, { id: 'intl', label: 'International', value: 20 }] },
      { id: 'bonds', label: 'Bonds', value: 30 },
      { id: 'cash', label: 'Cash', value: 10 },
    ],
    formatValue: (v) => `${String(v)}%`,
  });
  host.addEventListener('aui-drill', (event) => {
    host.dataset.level = (event as CustomEvent<TreemapDrillDetail>).detail.id ?? 'top';
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiTreemap } from '@absoluteui/angular/treemap';
import type { TreemapNode } from '@absoluteui/components/treemap';

@Component({
  selector: 'app-budget',
  imports: [AuiTreemap],
  template: `<aui-treemap label="Budget" [data]="data"></aui-treemap>`,
})
export class BudgetComponent {
  readonly data: TreemapNode[] = [
    { id: 'eng', label: 'Engineering', children: [{ id: 'web', label: 'Web', value: 30 }, { id: 'api', label: 'API', value: 20 }] },
    { id: 'ops', label: 'Operations', value: 25 },
  ];
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiTreemap } from '@absoluteui/react/treemap';
import type { TreemapNode } from '@absoluteui/components/treemap';

const data: TreemapNode[] = [
  { id: 'eng', label: 'Engineering', children: [{ id: 'web', label: 'Web', value: 30 }, { id: 'api', label: 'API', value: 20 }] },
  { id: 'ops', label: 'Operations', value: 25 },
  { id: 'people', label: 'People', value: 25 },
];

export function Example() {
  const [path, setPath] = useState<string[]>([]);
  return (
    <>
      <AuiTreemap label="Budget" data={data} onDrill={(detail) => { setPath(detail.path); }} />
      <p>Level: {path.length === 0 ? 'All' : path.join(' / ')}</p>
    </>
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiTreemap } from '@absoluteui/vue/treemap';
import type { TreemapDrillDetail, TreemapNode } from '@absoluteui/components/treemap';
const data: TreemapNode[] = [
  { id: 'eng', label: 'Engineering', children: [{ id: 'web', label: 'Web', value: 30 }, { id: 'api', label: 'API', value: 20 }] },
  { id: 'ops', label: 'Operations', value: 25 },
];
function onDrill(detail: TreemapDrillDetail): void {
  document.title = detail.path.join(' / ');
}
</script>

<template>
  <AuiTreemap label="Budget" :data="data" @drill="onDrill" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
