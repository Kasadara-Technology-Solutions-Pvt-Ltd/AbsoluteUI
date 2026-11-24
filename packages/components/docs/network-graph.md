# Network Graph

> Package: `@absoluteui/components/network-graph` | Styles: `@absoluteui/components/network-graph/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Accessible SVG network graph: nodes and edges laid out by a deterministic force-directed simulation (seeded; it settles, then stops). The settling animates only when animation is allowed and the user has not asked for reduced motion. Node groups get palette colors and marker shapes; nodes can be pinned by dragging or with Shift+Arrow; zoom and pan use the shared chart zoom. Arrow keys move between connected nodes, neighbors are highlighted on focus, and the data table is an adjacency list.

## 2. Anatomy

```text
<div class="aui-chart aui-network-graph [aui-network-graph--lit aui-chart--zoomable]">
  <div class="aui-chart__header">title, description, <div class="aui-chart__toolbar">zoom buttons</div></div>
  <ul class="aui-chart__legend">group toggle buttons</ul>
  <div class="aui-chart__body">
    <svg class="aui-chart__svg" role="group" aria-roledescription="network graph" aria-labelledby="T" aria-describedby="S">
      <g class="aui-network-graph__edges" aria-hidden="true"><line class="aui-network-graph__edge"/>...</g>
      <g class="aui-network-graph__nodes"><g class="aui-network-graph__node-group aui-chart__series--c1"><path class="aui-network-graph__node aui-chart__mark" role="img" aria-label="Ana, Design, 2 connections: Ben and Dev" tabindex="0"/></g>...</g>
      <g class="aui-network-graph__labels" aria-hidden="true">...</g>
    </svg>
    <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" hidden/>  <div class="aui-chart__data">Show data table, adjacency table</div>
</div>
```

## 3. When to use

- Relationships between entities: team collaboration, service dependencies, referral networks.
- Spotting clusters, hubs, and isolated nodes.

## 4. When not to use

- Hierarchies: use Org Chart or Treemap.
- Flows with quantities between stages: use Funnel Chart or Bar Chart.
- Thousands of nodes: a force layout becomes a hairball; aggregate first.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | The host element. |
| `element` | `SVGSVGElement` | The plot (svg role="group"), named by the title and described by the summary. |
| `summary` | `string` | The generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Ids of hidden items (legend toggles). |
| `positions` | `Record<string, { x: number; y: number }>` | Current node positions in layout units, by node id. |
| `pins` | `NetworkPin[]` | Pinned nodes. |

Options (`NetworkGraphOptions`):

| Option | Type | Default | Global | Description |
|---|---|---|---|---|
| `label` | `string` | required |  | Chart title: visible text and the accessible name of the plot (aria-labelledby); also the data table caption. |
| `hideLabel` | `boolean` | `false` |  | Visually hide the title; it stays the accessible name. |
| `description` | `string` |  |  | Visible description below the title, also referenced by aria-describedby (text only). |
| `summary` | `string` |  |  | Replaces the generated accessible summary (node, edge, and group counts, the most connected node, nodes without connections, hidden groups). |
| `valueFormat` | `Intl.NumberFormatOptions` |  |  | Number format for values in the tooltip and table. |
| `formatValue` | `(value: number) => string` |  |  | Custom value text; overrides valueFormat everywhere. |
| `hiddenSeries` | `readonly string[]` |  |  | Ids of hidden groups (legend toggles): their nodes and edges are not drawn and not reachable. |
| `theme` | `ChartTheme` |  |  | Look and feel: { palette?: string[] (1-8 CSS colors for slots 1-8); fontFamily?; fontSize? (8-32 px); textColor?; gridLines?: boolean; gridColor?; gridDash?; axisColor?; lineWidth?; markerSize?; cornerRadius?; barRadius?; cellRadius?; sliceRadius?; boxRadius?; swatchRadius?; tooltipRadius?; controlRadius?; lineJoin?; areaOpacity?; gradient?; valueLabelColor?; tooltip?: { background?, color?, borderColor? }; legendPosition?: 'top' \| 'bottom' \| 'start' \| 'end'; animation?: boolean \| { duration?: number } }. Applied as --aui-chart-* custom properties and classes on the host through the CSSOM (CSP-safe); colors are validated with CSS.supports('color'). Animation is opt-in and never runs with prefers-reduced-motion: reduce or [data-aui-animation='none']. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` |  |  | Custom tooltip content as DOM nodes (never HTML strings). context: { title, rows: { label, value, seriesId }[], column, row, source: "pointer" \| "focus" \| "sync" }. Return null for the default tooltip. The tooltip stays aria-hidden; the focused mark keeps its accessible label. |
| `syncGroup` | `string` |  |  | Shared chart option; a network graph has no column concept, so it has no effect. |
| `nodes` | `readonly NetworkNode[]` | required |  | Nodes: { id: string (unique, non-empty); label: string; group?: string (color, shape, legend); value?: number >= 0 (radius grows with its square root) }. At most 1,000. |
| `edges` | `readonly NetworkEdge[]` | required |  | Edges: { source: node id; target: node id (not the source); weight?: positive number (line thickness, table) }. At most 5,000. |
| `groups` | `readonly NetworkGroup[]` |  |  | Group labels, colors, and legend order: { id; label; color?: 1-8; colorValue?: CSS color }. Default: groups in order of first appearance, labelled by id; nodes without a group share one labelled "Other". |
| `directed` | `boolean` | `false` |  | Draw arrowheads at edge targets. |
| `seed` | `number` | `1` |  | Layout seed (integer 0-4294967295): the same data and seed always give the same layout. |
| `linkDistance` | `number` | `60` |  | Preferred edge length in layout units (10-400). |
| `charge` | `number` | `120` |  | Node repulsion (1-2000). |
| `pinned` | `readonly NetworkPin[]` |  |  | Nodes fixed at a position in layout units: { id; x; y } (the coordinate space of positions). Dragging and Shift+Arrow add pins. |
| `zoom` | `boolean` | `true` |  | Zoom and pan: toolbar buttons, + / - / 0 keys, Ctrl/Cmd + wheel, drag on the background to pan, Shift + drag to select. |
| `legend` | `'auto' \| 'show' \| 'hide'` | `"auto"` | yes | Legend of node groups (toggle buttons): auto shows it with more than one group, show always, hide never. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `"toggle"` | yes | Data table fallback (an adjacency list: node, group, connection count, connected nodes with weights): behind a Show data table button (built on first open), always visible, visually hidden (screen readers only), or none. |
| `tooltip` | `boolean` | `true` | yes | Tooltip on pointer hover and keyboard focus. |
| `patterns` | `boolean` | `false` | yes | Shared chart option; groups already differ by marker shape, so it has no extra effect. |
| `height` | `number` | `400` | yes | Plot height in CSS px (integer 120-2000); the width follows the container. |
| `nodeLabels` | `'auto' \| 'always' \| 'none'` | `"auto"` | yes | Node labels: auto (graphs up to 50 visible nodes), always, or none. |
| `animate` | `boolean` | `true` | yes | Animate the layout settling; never with prefers-reduced-motion: reduce or animation: 'none' (the final layout is then computed before the first paint). |
| `locale` | `string` | `"en-US"` | yes | Number, date, and message locale. |
| `direction` | `'ltr' \| 'rtl'` | `"ltr"` | yes | rtl puts node labels on the left; the layout is not mirrored. |

## 6. Methods

| Method | Description |
|---|---|
| `NetworkGraph.create(host, options)` | Render into `host` (children are replaced). |
| `update(options: Partial<NetworkGraphOptions>): void` | Merge, validate, and re-render. Invalid options throw and keep the previous state. Keyboard focus stays on the same mark. |
| `setSeriesVisible(id: string, visible: boolean): void` | Show or hide an item programmatically (no event). |
| `relayout(): void` | Run the layout again from the current positions; pinned nodes stay. |
| `unpinAll(): void` | Remove every pin (no event); call relayout() to let the nodes move. |
| `destroy(): void` | Remove rendering, host classes, listeners, the resize observer, timers, and the configuration subscription. |

Export: `@absoluteui/components/chart-export` (`chartToSvg`, `chartToPng`, `downloadChart`) serializes a rendered chart to SVG or PNG.

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-point-click` | `NetworkGraphPointClickDetail = ChartPointClickDetail: { seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A node was activated: pointer click or tap, or Enter / Space on the focused node. seriesId is the node id, series its group, value its connection count. Not cancelable. |
| `aui-node-pin` | `NetworkGraphNodePinDetail: { id: string; pinned: boolean; x: number; y: number; pins: NetworkPin[]; source: 'pointer' \| 'keyboard' \| 'api' }` | Yes | A node was pinned (drag end or Shift+Arrow) or unpinned (U); also announced politely. Not cancelable. |
| `aui-series-toggle` | `NetworkGraphSeriesToggleDetail: { id: string; visible: boolean; hidden: string[] }` | Yes | A group was shown or hidden from the legend. Not cancelable. |
| `aui-zoom` | `NetworkGraphZoomDetail: { x: ChartZoomRange \| null; y: ChartZoomRange \| null; reason }` | Yes | The visible window changed (fractions 0-1 of the layout bounds). Not cancelable. |

## 8. Slots/content areas

None. Tooltip content can be replaced with `renderTooltip` (DOM nodes).

## 9. CSS parts/hooks

The shared chart chrome (see Line Chart section 9) plus: `aui-network-graph`, `aui-network-graph--lit`, `aui-network-graph__edges / __edge / __arrow`, `aui-network-graph__nodes / __node-group / __node / __node--pinned`, `aui-network-graph__lit`, `aui-network-graph__labels / __label`, `aui-chart--zoomable / --zoomed / aui-chart__zoom / __tool / __brush`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/network-graph/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1..8` (group colors), `color-chart-axis` (edges, arrowheads), `color-surface` (node outlines, label halo), `color-text` (labels, pinned outline, highlighted edges, focus outline).

Chart look and feel: these `--aui-chart-*` custom properties restyle every chart; set them in a theme (Theme Designer, Charts section), on any ancestor, or per chart with the `theme` option.

| Custom property | Default (theme token) | Styles |
|---|---|---|
| `--aui-chart-1` ... `--aui-chart-8` | `color-chart-1` ... `color-chart-8` | Palette slots 1-8 (marks, legend and tooltip keys). |
| `--aui-chart-grid-color` | `color-chart-grid` | Gridlines. |
| `--aui-chart-axis-color` | `color-chart-axis` | Axis lines and the crosshair. |
| `--aui-chart-text-color` | `color-text-muted` | Tick labels and axis titles. |
| `--aui-chart-label-color` / `--aui-chart-label-halo-color` | `color-text` / `color-surface` | Value labels and their halo. |
| `--aui-chart-font-family` / `--aui-chart-font-size` | `font-family-sans` / `font-size-xs` | Plot text. |
| `--aui-chart-title-font-size` / `--aui-chart-legend-font-size` / `--aui-chart-legend-gap` | `font-size-md` / `font-size-sm` / `space-3` | Title and legend. |
| `--aui-chart-tooltip-bg` / `-fg` / `-border-color` / `-radius` / `-shadow` | `color-surface` / `color-text` / `color-border-strong` / `radius-md` / `shadow-md` | Tooltip. |

Corner rounding: `theme.cornerRadius` (`--aui-chart-corner-radius`, px 0-50) sets every cornered element; the element radii below win over it; unset keeps the look shown. Values are clamped to half the element's width or height and written as SVG geometry, so SVG and PNG exports keep them; stylesheet values apply when the chart next renders.

- Nodes are marker shapes and edges are lines, so they are not rounded.
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

laying out (animated settle); settled; node focused or hovered (neighbors highlighted); node pinned; zoomed; group hidden (legend); empty (no nodes: No data); table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| created | layout (animated or synchronous) | settled |
| plot not focused | Tab | active node focused, neighborhood highlighted, tooltip shown |
| node focused | arrow keys / PageUp / PageDown / Home / End | another node focused |
| node | drag or Shift+Arrow | pinned (aui-node-pin) |
| pinned node | U | unpinned (aui-node-pin) |
| any | legend button | group hidden or shown (aui-series-toggle) |
| any | new nodes, edges, seed, linkDistance, charge, or pinned | layout runs again from the current positions |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| ArrowLeft / ArrowRight / ArrowUp / ArrowDown | Node focused | The connected node closest to that direction (within 60 degrees); nothing happens when there is none. |
| PageDown / PageUp | Node focused | Next / previous node in data order (reaches nodes without connections). |
| Home / End | Node focused | First / last node in data order. |
| Shift + Arrow keys | Node focused | Move the node 10px and pin it (the keyboard alternative to dragging, aui-node-pin). |
| U | Node focused, pinned | Unpin the node (aui-node-pin). |
| + / = and - / _ | Mark focused, zoom on | Zoom in / out around the focused mark (announced politely, aui-zoom). |
| 0 | Mark focused, zoom on | Reset the zoom. |
| Enter / Space | Mark focused | Fires aui-point-click with source "keyboard". |
| Escape | Tooltip visible | Hides the tooltip without moving focus (WCAG 1.4.13); it returns on the next move. |
| Tab / Shift+Tab | Any | One tab stop for the plot (the active mark), the zoom buttons, the legend buttons, then the Show data table button and the table region. |

## 14. ARIA contract

| Element | Role |
|---|---|
| svg.aui-chart__svg | group with aria-roledescription "network graph" (localized), named by the title |
| nodes (path.aui-network-graph__node) | img with an aria-label: label, group, connection count, and up to five neighbors |
| legend | list of toggle buttons (aria-pressed) for groups |
| data table | table (native): node, group, connections, connected to |
| edges, arrowheads, labels, tooltip | aria-hidden (the adjacency is in names and the table) |

SVG node-link diagram as a named, described group (role="group" with aria-roledescription "network graph") of role="img" nodes with roving focus and neighbor navigation; legend of group toggle buttons; zoom toolbar; adjacency-list data table.

## 15. Accessibility notes

- Groups differ by color and marker shape; each node name carries its group and neighbors; the adjacency table lists every connection.
- The layout animation stops by itself (about five seconds at most) and never runs with reduced motion (WCAG 2.2.2, 2.3.3).
- Dragging has single-pointer and keyboard alternatives: Shift+Arrow moves and pins, U unpins (WCAG 2.5.7).
- Manual screen-reader verification (NVDA, JAWS, VoiceOver, TalkBack) is pending.
- Directional navigation depends on the layout; PageUp / PageDown always reach every node.

## 16. Responsive behavior

The width follows the container (ResizeObserver); the layout is fitted to the plot keeping its aspect ratio, so it never overflows. Labels (auto) are shown for up to 50 visible nodes. Wide data tables scroll in a focusable region.

## 17. RTL behavior

direction rtl puts node labels on the left of the nodes. The layout itself is not mirrored (positions have no reading direction); arrow keys are spatial.

## 18. Theme behavior

Nodes use their group palette slot (--aui-chart-<n>) and marker shape with a color-surface outline; edges use color-chart-axis; pinned nodes get a dashed color-text outline; the focused or hovered neighborhood stays opaque while the rest fades. Forced colors: CanvasText nodes and edges, Highlight for the neighborhood and focus.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { networkGraph: { nodeLabels: 'auto', animate: true, dataTable: 'visible' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

The zoom toolbar uses the built-in `plus`, `minus`, and `refresh` icons (register replacements through the icon registry).

## 23. Security behavior

All text uses `textContent`; SVG uses `createElementNS`; colors are classes or CSSOM custom properties. No `innerHTML` or style attributes.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Budget: NetworkGraph.create with 150 nodes and 300 edges, synchronous layout (reduced motion) and the first render < 250 ms in headless Chromium. One number formatter per render; the data table is built lazily.

## 26. Supported data scale

Designed for up to about 300 nodes and 1,000 edges; at most 1,000 nodes and 5,000 edges are accepted (the layout cools faster above 300 nodes, since repulsion is O(n^2) per step).

## 27. Usage examples

Team collaboration:

```ts
import { NetworkGraph } from '@absoluteui/components/network-graph';

const host = document.createElement('div');
document.body.append(host);
NetworkGraph.create(host, {
  label: 'Team collaboration',
  nodes: [
    { id: 'ana', label: 'Ana', group: 'design' },
    { id: 'ben', label: 'Ben', group: 'eng' },
    { id: 'chi', label: 'Chi', group: 'eng' },
    { id: 'dev', label: 'Dev', group: 'product' },
  ],
  edges: [
    { source: 'ana', target: 'ben', weight: 3 },
    { source: 'ben', target: 'chi', weight: 5 },
    { source: 'chi', target: 'dev' },
    { source: 'dev', target: 'ana' },
  ],
  groups: [
    { id: 'design', label: 'Design' },
    { id: 'eng', label: 'Engineering' },
    { id: 'product', label: 'Product' },
  ],
});
```

Directed edges, pins, and the pin event:

```ts
import { NetworkGraph, type NetworkGraphNodePinDetail } from '@absoluteui/components/network-graph';

const host = document.querySelector<HTMLElement>('#deps');
if (host) {
  const graph = NetworkGraph.create(host, {
    label: 'Service dependencies',
    nodes: [{ id: 'web', label: 'Web' }, { id: 'api', label: 'API' }, { id: 'db', label: 'Database' }],
    edges: [{ source: 'web', target: 'api' }, { source: 'api', target: 'db' }],
    directed: true,
    seed: 7,
    pinned: [{ id: 'db', x: 0, y: 0 }],
  });
  host.addEventListener('aui-node-pin', (e) => {
    const detail = (e as CustomEvent<NetworkGraphNodePinDetail>).detail;
    if (!detail.pinned) graph.relayout();
  });
}
```

## 28. Edge cases

- Nodes without edges are reachable with PageUp / PageDown and listed in the summary.
- Duplicate edges between the same nodes are drawn on top of each other; their weights add up in the table.
- Changing data keeps known nodes where they are and settles from there.
- Pinned positions outside the layout extend the fitted bounds.

## 29. Error behavior

Invalid options throw a configuration error (code `NETWORK_GRAPH_OPTIONS`) naming the option and the expected value, before anything renders; `update()` with invalid options throws and keeps the previous state. Errors never include option values.

## 30. Known limitations

- Pairwise repulsion is O(n^2) per step; very large graphs lay out slowly.
- Dragging pins a node where it is dropped; other nodes keep their positions until the layout runs again (relayout() or new data).
- Straight edges only; parallel edges overlap.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Hierarchical, circular, or custom layouts.
- Edge labels.
- Editing nodes and edges by pointer.

## 32. TypeScript definitions

```ts
type NetworkGraphNodeLabels = 'auto' | 'always' | 'none';
interface NetworkGraphConfig extends ChartBaseConfig { nodeLabels: NetworkGraphNodeLabels; animate: boolean }
interface NetworkNode { id: string; label: string; group?: string; value?: number }
interface NetworkEdge { source: string; target: string; weight?: number }
interface NetworkGroup { id: string; label: string; color?: ChartColor; colorValue?: string }
interface NetworkPin { id: string; x: number; y: number }
interface NetworkGraphOptions extends ChartCommonOptions, Partial<NetworkGraphConfig> {
  nodes: readonly NetworkNode[];
  edges: readonly NetworkEdge[];
  groups?: readonly NetworkGroup[];
  directed?: boolean;
  seed?: number;
  linkDistance?: number;
  charge?: number;
  pinned?: readonly NetworkPin[];
  zoom?: boolean;
}
```

## 33. Vanilla JS example

```ts
import { NetworkGraph } from '@absoluteui/components/network-graph';
import '@absoluteui/components/network-graph/style.css';

const host = document.querySelector<HTMLElement>('#network');
if (host) {
  NetworkGraph.create(host, {
    label: 'Referrals',
    nodes: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }],
    edges: [{ source: 'a', target: 'b' }, { source: 'a', target: 'c' }],
    animate: false,
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiNetworkGraph } from '@absoluteui/angular/network-graph';
import type { NetworkEdge, NetworkNode } from '@absoluteui/components/network-graph';

@Component({
  selector: 'app-team',
  imports: [AuiNetworkGraph],
  template: `<aui-network-graph label="Team collaboration" [nodes]="nodes" [edges]="edges"></aui-network-graph>`,
})
export class TeamComponent {
  readonly nodes: NetworkNode[] = [{ id: 'a', label: 'Ana' }, { id: 'b', label: 'Ben' }];
  readonly edges: NetworkEdge[] = [{ source: 'a', target: 'b' }];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
