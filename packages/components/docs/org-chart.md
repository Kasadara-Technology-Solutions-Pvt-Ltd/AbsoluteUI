# Organization Chart

> Package: `@absoluteui/components/org-chart` | Styles: `@absoluteui/components/org-chart/style.css` | Export: `@absoluteui/components/org-chart-export` ([org-chart-export.md](org-chart-export.md)) | Since 0.5.0 | Status: R3

## 1. Purpose

Shows who reports to whom. `OrgChart` renders flat nodes (`id`, `parentId`) as a tidy tree, top-down or left-to-right, with elbow connectors and cards (initials, name, title, description, or custom content). The nodes form an ARIA tree with one tab stop and tree keyboard navigation; moving focus pans the view so the node stays visible.

Users pan by dragging the background and zoom with the toolbar, `+`/`-`/`0`, or Ctrl/Cmd + wheel; `fit()` and `centerOn()` frame the chart. Reports load on demand (`loadChildren`) with cancellation and a timeout. `search()`, `pathTo()`, and `reveal()` find a person, expand their managers, and highlight the path. In edit mode people are moved to a new manager by pointer drag, by Ctrl/Cmd+X then Ctrl/Cmd+V, or with the toolbar Move / Move here buttons; `canMove` vetoes moves, locked nodes stay, and moves are undoable. `layoutOrgChart` (the layout) is a pure function.

## 2. Anatomy

```text
<div class="aui-org-chart [--editing] [--horizontal]">                                  (consumer host)
  <div class="aui-org-chart__toolbar" role="group" aria-label="{label} controls">
    <button class="aui-org-chart__tool" data-aui-action="zoomOut|zoomIn|fit|cut|paste|undo|redo" aria-label="..." [aria-disabled] [aria-pressed]>
  <div class="aui-org-chart__viewport">                                                  (clips; background drags pan)
    <div class="aui-org-chart__canvas" style="transform: translate(…) scale(…)">        (CSSOM)
      <svg class="aui-org-chart__links" aria-hidden="true"><path class="aui-org-chart__link [--path]">
      <div class="aui-org-chart__tree" role="tree" aria-label="{label}">
        <div class="aui-org-chart__node [--path] [--cut] [--locked]" role="treeitem" data-aui-node="{id}"
             aria-level="1" aria-setsize="1" aria-posinset="1" aria-expanded="true" aria-selected="false" tabindex="0">
          <div class="aui-org-chart__card">
            <span class="aui-org-chart__avatar" aria-hidden="true">AL</span>
            <span class="aui-org-chart__text"><span class="…__name">Ada Lovelace</span><span class="…__title"><span class="…__sep">, </span>CEO</span>
          <span class="aui-org-chart__toggle" aria-hidden="true">3 ⌄</span>                    (pointer expand chip)
```

## 3. When to use

- Showing reporting lines, from a few people to a few thousand visible nodes.
- Letting HR or managers restructure teams (edit mode with undo).
- Browsing a large organization by loading teams on demand and finding people.

## 4. When not to use

- Hierarchies that users scan as a list (folders, categories): use a tree view.
- People with several managers (matrix organizations) or other graphs.
- Hierarchical part-to-whole values: use Treemap.

## 5. Public properties

`OrgChartOptions`:

| Option | Type | Default | Notes |
|---|---|---|---|
| `label` | `string` | required | Name of the tree; the toolbar is "{label} controls". |
| `nodes` | `readonly OrgChartNode[]` | required | `{ id, parentId, label, title?, description?, hasChildren?, locked? }`; unique ids, known parents, no cycles. Sibling order follows the array. |
| `expanded` | `readonly string[]` | - | Explicit expansion (overrides `expandDepth`). |
| `selected` | `string \| null` | `null` | Selected node. |
| `renderNode` | `(node, { depth, expanded, childCount, doc }) => Node` | default card | Non-interactive card content. Released with `releaseNode()` when replaced or removed (since 0.9.0). |
| `loadChildren` | `(node, signal) => Promise<OrgChartNode[]>` | - | Reports of nodes with `hasChildren`. |
| `editable` | `boolean` | `false` | Edit mode. |
| `canMove` | `(node, parent) => boolean` | - | Veto moves. |
| `historyLimit` | `number` | `50` | Undo depth (0..500). |
| `nodeRadius` | `number` | - | Card corner radius in CSS px (0..50). Unset: `--aui-chart-node-radius`, else `--aui-chart-corner-radius`, else the theme's `radius-md`. The SVG export keeps it. |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | Global. |
| `nodeWidth` / `nodeHeight` | `number` | `200` / `72` | Global. Card size in CSS px. |
| `siblingGap` / `levelGap` | `number` | `24` / `48` | Global. Spacing in CSS px. |
| `expandDepth` | `number` | `2` | Global. Levels expanded initially. |
| `minZoom` / `maxZoom` | `number` | `0.2` / `2` | Global. |
| `requestTimeoutMs` | `number` | `30000` | Global. `loadChildren` timeout. |
| `locale`, `direction` | | common | Inherited. |

Controller properties: `host`, `element` (the tree), `nodes` (current managers, tree order), `expanded`, `selected`, `editable`, `scale`, `canUndo`, `canRedo`, `geometry` (for export).

## 6. Methods

| Method | Description |
|---|---|
| `OrgChart.create(host, options)` | Validate and render. |
| `update(options)` | Merge options; `nodes` replaces the data and clears undo; no event. |
| `setExpanded(id, expanded)` | Expand (loading reports first) or collapse; emits `aui-expand-change`. |
| `expandAll()` / `collapseAll()` | Expand every node with loaded reports / collapse all. |
| `search(query)` | Matching ids in tree order (label, title, description). |
| `pathTo(id)` | Ids from the top down to the node. |
| `reveal(id, { focus, select, highlight })` | Expand managers, center, highlight the path, focus; announces the path. |
| `clearHighlight()` | Remove the path highlight. |
| `select(id \| null)` | Select without an event. |
| `centerOn(id)` / `fit()` / `zoomTo(scale)` | View control. |
| `moveNode(id, parentId, index?)` | Re-parent; false when refused. Undoable; emits `aui-node-move`. |
| `undo()` / `redo()` | Move history. |
| `destroy()` | Abort loads; remove the toolbar and viewport. |
| `layoutOrgChart(roots, options)` | Pure tidy-tree layout: boxes, connector paths, size. |

## 7. Events

| Event | Detail | Notes |
|---|---|---|
| `aui-node-select` | `OrgChartNodeSelectDetail { id; node }` | Click, Enter, Space. |
| `aui-expand-change` | `OrgChartExpandChangeDetail { id; expanded }` | After lazy reports loaded. |
| `aui-node-move` | `OrgChartNodeMoveDetail { reason: 'move' \| 'undo' \| 'redo'; id; parentId; previousParentId; index; nodes }` | Save `detail.nodes` or send the change. |
| `aui-zoom` | `OrgChartZoomDetail { scale }` | Toolbar, keys, Ctrl/Cmd + wheel, `zoomTo` (not `fit`). |
| `aui-load-error` | `OrgChartLoadErrorDetail { id; error }` | `loadChildren` failed or timed out. |

All events bubble and are not cancelable.

## 8. Slots/content areas

`renderNode` returns the card content for each node (inserted once, re-rendered when the node's texts or `renderNode` change). Keep it non-interactive: the treeitem is the control, and its text is its accessible name.

## 9. CSS parts/hooks

| Class | Part |
|---|---|
| `aui-org-chart`, `--editing`, `--horizontal` | Host |
| `aui-org-chart__toolbar`, `__tool` | Toolbar |
| `aui-org-chart__viewport[--panning]` | Viewport: set `block-size` (default 30rem) |
| `aui-org-chart__canvas` | Transformed canvas; `--aui-org-chart-node-width`, `--aui-org-chart-node-height` |
| `aui-org-chart__links`, `__link[--path]` | Connectors |
| `aui-org-chart__node[--path\|--cut\|--locked\|--dragging\|--drop\|--no-drop]`, `__card` | Nodes and cards |
| `aui-org-chart__avatar`, `__name`, `__title`, `__description`, `__sep`, `__toggle` | Default card and expand chip |

## 10. Design tokens

See `metadata/org-chart/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong` (cards, connectors), `color-surface-sunken` (viewport), `color-selected`, `color-selected-text`, `border-width-strong` (selection), `color-focus-ring` (path), `color-primary` (avatars), `shadow-sm`, `radius-md`.

## 11. States

Collapsed or expanded nodes, loading reports (`aria-busy`), selected, focused, highlighted path, zoomed or panned, edit mode, node marked for moving, dragging over a valid or invalid target, locked.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| collapsed | ArrowRight, chip click, `setExpanded(id, true)` | loading (lazy, first time), then expanded |
| loading | `loadChildren` rejects or times out | collapsed; announced; `aui-load-error` |
| expanded | ArrowLeft, chip click, `setExpanded(id, false)` | collapsed; focus moves up if it was inside |
| any node | click, Enter, Space | selected (`aui-node-select`) |
| edit mode | Ctrl/Cmd+X or Move | node marked (dashed card; Move pressed) |
| marked | Ctrl/Cmd+V or Move here on another node | moved (`aui-node-move`), or refused and announced |
| marked | Escape or Move again | cancelled |
| moved | Ctrl/Cmd+Z / Undo | previous manager and position (`reason: 'undo'`) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Chart | Toolbar buttons, then the tree (one tab stop). |
| ArrowDown / ArrowUp | Node | Next / previous visible node in tree order. |
| ArrowRight (Left in RTL) | Node | Expand; if expanded, first report. |
| ArrowLeft (Right in RTL) | Node | Collapse; if collapsed, manager. |
| Home / End | Node | First / last visible node. |
| Enter / Space | Node | Select. |
| `*` | Node | Expand all siblings. |
| Letters | Node | Typeahead by name. |
| `+` / `=` / `-` / `0` | Node | Zoom in / out / fit. |
| Ctrl/Cmd+X, Ctrl/Cmd+V, Escape | Edit mode | Mark for moving, move under the focused node, cancel. |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Edit mode | Undo, redo. |

## 14. ARIA contract

- The tree is `role="tree"` named by `label`; nodes are flat `role="treeitem"` elements in DOM reading order with `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` (only with reports), `aria-selected`, and `aria-busy` while loading.
- One node has `tabindex="0"` (roving); the others `-1`.
- Connectors, avatars, and expand chips are `aria-hidden`.
- The toolbar is a named group; unavailable buttons use `aria-disabled="true"` (they stay focusable); Move is a toggle (`aria-pressed`).
- Announcements: zoom level, path, moved, undone, redone, cancelled (polite); ready to move, not allowed, locked, load failed (assertive).

## 15. Accessibility notes

- The accessible name of a node is its card text; the default card inserts visually hidden commas ("Ada Lovelace, CEO").
- Moving people never requires dragging (WCAG 2.5.7): Ctrl/Cmd+X and Ctrl/Cmd+V, or with a single pointer select a node, press Move, select the new manager, press Move here.
- Focus movement pans automatically, so keyboard users never need to pan; zoom is available from keys and the toolbar.
- Selection and the highlighted path differ by border weight and fill, not color alone.
- Manual screen-reader verification (NVDA, JAWS, VoiceOver) is pending.

## 16. Responsive behavior

The viewport has a fixed block size (30rem; set it with CSS) and clips the chart; the chart pans and zooms instead of scrolling, so the page reflows at 320 px. `fit()` scales the visible chart into any viewport (at most 100 %). Touch drags on the background pan. Toolbar buttons are `touch-target-min` squares.

## 17. RTL behavior

`direction: 'rtl'` mirrors the layout: the first report is on the right in vertical charts, and horizontal charts grow from right to left. ArrowLeft and ArrowRight swap roles; expand chips point the mirrored way.

## 18. Theme behavior

Cards use `color-surface`, `color-border-strong`, `radius-md`, and `shadow-sm`; the selected card uses `color-selected` with `color-selected-text` and a strong border. The highlighted path uses `color-focus-ring` on card borders and thicker connectors. Forced colors: CanvasText connectors, Highlight for the path and selection. Position transitions are removed under reduced motion.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { orgChart: { orientation: 'horizontal', nodeWidth: 180, nodeHeight: 56, expandDepth: 1, maxZoom: 3 } } });
```

Global options: `orientation`, `nodeWidth`, `nodeHeight`, `siblingGap`, `levelGap`, `expandDepth`, `minZoom`, `maxZoom`, `requestTimeoutMs`, plus inherited `locale` and `direction`. Changes apply to existing charts immediately (the expansion is kept).

## 20. Component configuration support

Instance options override global and theme defaults. All options are dynamic through `update()`; `nodes` replaces the data and clears the undo history; `expanded` or `expandDepth` resets the expansion.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

Toolbar: `zoom-out`, `zoom-in`, `maximize` (fit), `grip` (Move), `check` (Move here), `undo`, `redo`. Expand chip: `chevron-down` / `chevron-up` (vertical), `chevron-right` / `chevron-left` (horizontal, mirrored in RTL).

## 23. Security behavior

Names, titles, and descriptions render through `textContent`; custom content comes from `renderNode` as DOM nodes owned by the application. Nodes and loaded reports are validated (unique ids, known parents, no cycles) before use. Positions and transforms are written through the CSSOM only (CSP-safe). `loadChildren` receives an `AbortSignal` and times out.

## 24. Data handling behavior

No persistence, network access, or telemetry of its own. Edits are reported through `aui-node-move` (`detail.nodes`) and the `nodes` getter; the application saves them. Export creates files locally through temporary object URLs.

## 25. Performance characteristics

The layout is a contour-based tidy tree (per-depth extents, linear in nodes times depth). Nodes are rendered once and reused by id; only visible (expanded) nodes exist in the DOM. Pan and zoom change one CSS transform. Budgets (e2e): create with 1,000 visible nodes < 80 ms; expand or collapse with 1,000 visible nodes < 80 ms; `layoutOrgChart` for 5,000 nodes < 60 ms.

## 26. Supported data scale

Tested with 1,000 visible nodes (5,000 for the layout) and any number of collapsed nodes. There is no virtualization: collapse levels (`expandDepth`) and load teams lazily for larger organizations.

## 27. Usage examples

See section 33 and `metadata/org-chart/examples.json`: basic chart, lazy teams with search, editing with undo, custom cards with export, the pure layout, global configuration.

## 28. Edge cases

- Several top-level nodes (`parentId: null`) are laid out side by side.
- A node with `hasChildren` but no loaded reports is expandable; after a load with no reports it becomes a leaf.
- Collapsing a manager moves focus to the manager when focus was inside the collapsed team.
- Moving a node under one of its own reports, or moving a locked node, is refused and announced; `canMove` can refuse more.
- Moves append the node last among its new siblings; undo restores the exact position.
- `update({ nodes })` keeps the expansion of ids that still exist and clears the undo history.
- Long names are truncated visually; the full text stays in the accessible name.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `ORG_CHART_OPTIONS` | configuration | Empty label; invalid nodes (duplicate ids, unknown parents, cycles, empty labels, wrong types); invalid `expanded`, `selected`, callbacks, `historyLimit`, `nodeRadius`; `reveal`, `select`, or `moveNode` with unknown ids; `zoomTo` with a non-positive scale; invalid nodes from `loadChildren` (reported through `aui-load-error`). |
| `ORG_CHART_EXPORT_OPTIONS` | configuration | Invalid export options (see org-chart-export.md). |

A failed construction leaves the host untouched.

## 30. Known limitations

- No virtualization; keep visible nodes to a few thousand.
- Fixed card size; long text is truncated.
- No keyboard command for reordering siblings (use `moveNode` with an index).
- A plain wheel scrolls the page; no pinch zoom.
- Pointer drags are not announced.
- Export redraws label and title only.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Several managers per person, or graphs with cycles.
- Assistant positions beside a manager; compact stacking of leaf reports.
- Adding, deleting, or renaming people inside the chart (update `nodes`).
- Multi-page printing.

## 32. TypeScript definitions

```ts
interface OrgChartNode { id: string; parentId: string | null; label: string; title?: string; description?: string; hasChildren?: boolean; locked?: boolean }
interface OrgChartRenderContext { depth: number; expanded: boolean; childCount: number; doc: Document }
type OrgChartOrientation = 'vertical' | 'horizontal';
interface OrgChartNodeSelectDetail { id: string; node: OrgChartNode }
interface OrgChartExpandChangeDetail { id: string; expanded: boolean }
interface OrgChartNodeMoveDetail { reason: 'move' | 'undo' | 'redo'; id: string; parentId: string | null; previousParentId: string | null; index: number; nodes: OrgChartNode[] }
interface OrgChartZoomDetail { scale: number }
interface OrgChartLoadErrorDetail { id: string; error: unknown }
interface OrgChartLayoutInput { id: string; children: readonly OrgChartLayoutInput[] }
interface OrgChartBox { id: string; x: number; y: number; width: number; height: number; depth: number }
interface OrgChartLayout { boxes: ReadonlyMap<string, OrgChartBox>; edges: readonly { from: string; to: string; path: string }[]; width: number; height: number }
```

## 33. Vanilla JS example

```ts
import { OrgChart, type OrgChartNode, type OrgChartNodeMoveDetail } from '@absoluteui/components/org-chart';
import '@absoluteui/components/org-chart/style.css';

const nodes: OrgChartNode[] = [
  { id: 'ceo', parentId: null, label: 'Ada Lovelace', title: 'CEO' },
  { id: 'cto', parentId: 'ceo', label: 'Grace Hopper', title: 'CTO' },
  { id: 'dev', parentId: 'cto', label: 'Margaret Hamilton', title: 'Engineer' },
];

const host = document.querySelector<HTMLElement>('#org');
if (host) {
  const chart = OrgChart.create(host, { label: 'Company', nodes, editable: true });
  host.addEventListener('aui-node-move', (event) => {
    const { nodes: updated } = (event as CustomEvent<OrgChartNodeMoveDetail>).detail;
    sessionStorage.setItem('org', JSON.stringify(updated));
  });
  chart.reveal('dev', { focus: false });
}
```

## 34. Angular example

`<aui-org-chart>` is generated: inputs mirror `OrgChartOptions`; `[(nodes)]` is two-way; outputs `nodeSelected`, `expandChange`, `nodeMoved`, `zoomed`, `loadError`; methods such as `search()`, `reveal()`, `fit()`, `zoomTo()` (`#chart="auiOrgChart"`).

```ts
import { Component } from '@angular/core';
import type { OrgChartNode, OrgChartNodeSelectDetail } from '@absoluteui/components/org-chart';
import { AuiOrgChart } from '@absoluteui/angular/org-chart';

@Component({
  selector: 'app-org',
  imports: [AuiOrgChart],
  template: `<aui-org-chart label="Company" [nodes]="nodes" orientation="horizontal" (nodeSelected)="open($event)"></aui-org-chart>`,
})
export class OrgComponent {
  readonly nodes: OrgChartNode[] = [
    { id: 'ceo', parentId: null, label: 'Ada Lovelace', title: 'CEO' },
    { id: 'cto', parentId: 'ceo', label: 'Grace Hopper', title: 'CTO' },
  ];

  open(detail: OrgChartNodeSelectDetail): void {
    // show detail.node in a side panel
  }
}
```

## 35. React example

```tsx
import { useState } from 'react';
import type { OrgChart, OrgChartNode } from '@absoluteui/components/org-chart';
import { AuiOrgChart } from '@absoluteui/react/org-chart';

const nodes: OrgChartNode[] = [
  { id: 'ceo', parentId: null, label: 'Ada Lovelace', title: 'CEO' },
  { id: 'cto', parentId: 'ceo', label: 'Grace Hopper', title: 'CTO' },
];

export function Org({ onSave }: { onSave: (nodes: OrgChartNode[]) => void }) {
  const [chart, setChart] = useState<OrgChart | null>(null);
  const [query, setQuery] = useState('');
  return (
    <>
      <input type="search" aria-label="Find a person" value={query} onChange={(e) => { setQuery(e.target.value); }}
        onKeyDown={(e) => { const id = chart?.search(query)[0]; if (e.key === 'Enter' && id) chart?.reveal(id, { select: true }); }} />
      <AuiOrgChart ref={setChart} label="Company" nodes={nodes} editable onNodeMove={(d) => { onSave(d.nodes); }} />
    </>
  );
}
```

Keep `nodes` stable (a new array clears the undo history). See [docs/REACT.md](../../../docs/REACT.md) for events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import type { OrgChartNode, OrgChartNodeSelectDetail } from '@absoluteui/components/org-chart';
import { AuiOrgChart } from '@absoluteui/vue/org-chart';

const nodes: OrgChartNode[] = [
  { id: 'ceo', parentId: null, label: 'Ada Lovelace', title: 'CEO' },
  { id: 'cto', parentId: 'ceo', label: 'Grace Hopper', title: 'CTO' },
];
const open = (detail: OrgChartNodeSelectDetail) => console.info(detail.node.label);
</script>

<template>
  <AuiOrgChart label="Company" :nodes="nodes" :expand-depth="1" @node-select="open" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that enhance or render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
