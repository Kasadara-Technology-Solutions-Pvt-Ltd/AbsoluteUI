# Diagram

> Package: `@absoluteui/components/diagram` | Styles: `@absoluteui/components/diagram/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Shows and edits flowcharts and other node-and-connector diagrams. `Diagram` renders a JSON model in SVG: nodes (rectangle, rounded, ellipse, diamond, parallelogram, cylinder, document, or a custom SVG shape) with labels, positions, sizes, and ports; edges with straight, orthogonal, or curved routing, arrowheads, dashes, and labels; optional groups.

Auto-layout is layered (Sugiyama style, for flowcharts) or tree, in four directions (`TB`, `BT`, `LR`, `RL`), and can keep pinned or hand-moved nodes. In edit mode people add shapes from a palette, drag nodes (grid snap, alignment guides), drag from a port to connect, drag edge ends to reconnect, edit labels inline, select several items (Shift-click, marquee), copy, paste, delete, and undo. Every edit also has a keyboard path (`M` move mode, `C` connect, Enter label, Delete) and a single-pointer path (toolbar Connect and Move selection). Nodes are a listbox with spatial arrow navigation; a text alternative table lists every node and its connections. `diagramToSvg`, `diagramToPng`, and `downloadDiagram` export the drawing; `layoutDiagram` is the pure layout function.

## 2. Anatomy

```text
<div class="aui-diagram [--editing] [--hand] [--placing] [--connecting]">                (consumer host)
  <div class="aui-diagram__toolbar" role="group" aria-label="{label} controls">
    <button class="aui-diagram__tool" data-aui-action="zoomOut|zoomIn|fit|pan|connect|place|undo|redo|delete" aria-label="…" [aria-disabled] [aria-pressed]>
  <div class="aui-diagram__palette" role="group" aria-label="Add shapes">               (edit mode)
    <button class="aui-diagram__palette-item"><svg class="__palette-shape" aria-hidden="true"/><span>Decision</span>
  <div class="aui-diagram__viewport" role="group" aria-roledescription="canvas" aria-label="{label}" tabindex="0">
    <svg class="aui-diagram__svg">
      <g class="aui-diagram__scene" transform="translate(…) scale(…)">
        <rect class="aui-diagram__grid" aria-hidden="true"/>                               (edit mode)
        <g class="aui-diagram__groups" aria-hidden="true">…</g>
        <g class="aui-diagram__edges" aria-hidden="true"><g class="aui-diagram__edge"><path class="__line"/><path class="__arrow"/>…
        <g class="aui-diagram__nodes" role="listbox" aria-multiselectable="true" aria-label="{label}: nodes">
          <g class="aui-diagram__node" role="option" aria-roledescription="node" aria-selected="false" tabindex="0"
             aria-label="Manager approval, decision, leads to HR check (Yes), comes from Request" transform="translate(x y)">
            <rect class="aui-diagram__focus"/><g class="__body"><path class="aui-diagram__shape"/></g>
            <text class="aui-diagram__label" aria-hidden="true"><tspan>…</tspan></text>
            <g class="aui-diagram__ports"><g class="__port" data-aui-port="right">…</g></g>          (edit mode)
        <g class="aui-diagram__links" role="listbox" aria-label="{label}: connections">
          <g class="aui-diagram__link" role="option" aria-roledescription="connection" aria-label="Request to Manager approval">
            <path class="__link-ring"/><path class="__link-core"/><path class="__link-hit"/>
            <g class="__edge-label" aria-hidden="true"><rect/><text/></g><g class="__handles">…</g>
        <g class="aui-diagram__overlay" aria-hidden="true"/>                                (guides, marquee, preview)
    <input class="aui-diagram__editor" type="text" hidden>                                  (inline label editor)
  <div class="aui-diagram__text">
    <button class="aui-diagram__text-toggle" aria-expanded="false" aria-controls="…">Show text description</button>
    <div class="aui-diagram__table-scroll" role="region" hidden><table class="aui-diagram__table">…
```

## 3. When to use

- Showing or designing a process, workflow, or decision flow: approval routes, onboarding steps, state machines.
- Letting users build a small graph visually, with a keyboard path for every edit.
- Laying out a graph automatically from data (`layoutDiagram`, `layout()`) and letting people adjust it.

## 4. When not to use

- Reporting hierarchies with one manager per person: use Organization Chart.
- Schedules and dependencies over time: use Gantt.
- Thousands of nodes or force-directed networks: the diagram renders every node and is sized for hundreds.

## 5. Public properties

Options (`DiagramOptions`):

| Option | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | (required) | Accessible name; names the canvas, `'{label}: nodes'`, `'{label}: connections'`, `'{label} controls'`. |
| `model` | `DiagramModel` | (required) | `{ nodes, edges, groups? }` (section 32). Validated. Nodes without `x`/`y` are placed by auto-layout. Replacing it with `update()` clears the undo history. |
| `editable` | `boolean` | `false` | Edit mode: palette, ports, moving, connecting, reconnecting, labels, copy and paste, delete, marquee, undo. |
| `layout` | `DiagramAutoLayout \| null` | — | `{ algorithm?: 'layered' \| 'tree', direction?: 'TB' \| 'BT' \| 'LR' \| 'RL', nodeGap?, rankGap?, sweeps?, keepPositions? }`. Given on create, it runs once; also the defaults of `layout()`. |
| `palette` | `readonly DiagramPaletteItem[]` | seven shapes | `{ shape, label, width?, height? }` buttons in edit mode. |
| `renderShape` | `(node, context) => SVGElement` | — | Draws `custom` nodes (`{ width, height, selected, doc }`). |
| `canConnect` | `(from, to) => boolean` | — | Veto connections. Self connections and exact duplicates are always refused. |
| `historyLimit` | `number` | `100` | Undo depth 0..500. |
| `showGrid` | `boolean` | `true` | Dotted grid in edit mode. |
| `nodeWidth` / `nodeHeight` | `number` | `160` / `64` | Default node size (40..800 / 24..600). |
| `gridSize` | `number` | `16` | Snap and keyboard step, 4..200. |
| `snapToGrid` | `boolean` | `true` | Snap moved and added nodes. |
| `routing` | `'straight' \| 'orthogonal' \| 'curved'` | `'orthogonal'` | Default edge routing. |
| `nodeGap` / `rankGap` | `number` | `40` / `64` | Auto-layout spacing. |
| `minZoom` / `maxZoom` | `number` | `0.2` / `3` | Zoom limits. |
| `textAlternative` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `'toggle'` | Nodes and connections table. |
| `locale`, `direction` | common | `'en-US'`, `'ltr'` | Messages and numbers; RTL mirrors auto-layout and reading order. |

Read-only properties: `host`, `element` (the nodes listbox), `model` (copies, for saving), `selection` (`{ nodes, edges }`), `editable`, `scale`, `canUndo`, `canRedo`, `geometry` (drawn geometry for export).

## 6. Methods

| Method | Description |
|---|---|
| `update(options)` | Merge and apply options (validated first). `model` replaces the data and clears history. No event. |
| `select(ids)` | Replace the selection with node and edge ids (no event). |
| `focusNode(id)` | Focus a node and pan it into view. |
| `addNode(node)` | Add a node (id, size, and a free position at the view center are filled in); returns the id. |
| `addEdge(edge)` | Connect two nodes; returns the id or `null` when refused. |
| `updateNode(id, patch)` / `updateEdge(id, patch)` | Change one item (validated). |
| `moveNode(id, x, y)` | Move a node (snapped). |
| `remove(ids)` | Remove nodes (with their edges) and edges. |
| `layout(options?)` | Auto-layout, then fit. `keepPositions` keeps pinned and hand-moved nodes. |
| `undo()` / `redo()` | Whole-model history; return `false` when empty. |
| `copy()` / `paste()` | Instance clipboard: selected nodes and the edges between them; paste offsets and selects. |
| `editLabel(id)` | Open the inline editor for a node or edge (edit mode). |
| `fit()` / `zoomTo(scale)` / `centerOn(id)` | View control. |
| `describe()` | Plain-text description, one line per node. |
| `destroy()` | Remove everything the component added. |

Every editing method is undoable and emits `aui-change`.

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `DiagramChangeDetail { reason, model, ids }` | Any model change (UI or API). `reason`: `add`, `move`, `connect`, `reconnect`, `label`, `delete`, `paste`, `layout`, `update`, `undo`, `redo`. |
| `aui-select` | `DiagramSelectDetail { nodes, edges }` | The selection changed through the UI. |
| `aui-node-activate` | `DiagramNodeActivateDetail { id, node }` | Enter or double-click on a node in view mode (or on a locked node in edit mode). |
| `aui-zoom` | `DiagramZoomDetail { scale }` | Zoom changed by toolbar, keys, Ctrl/Cmd + wheel, or `zoomTo` (not `fit`). |

All bubble and are not cancelable.

## 8. Slots/content areas

`renderShape` draws the SVG of `custom` nodes in local coordinates (0,0)..(width,height). Return non-interactive SVG: the node itself is the control and the label is drawn on top. It is called again when the node's label, size, ports, or selection changes.

## 9. CSS parts/hooks

| Class | Description |
|---|---|
| `aui-diagram` | Host; `--editing`, `--hand`, `--placing`, `--connecting`. |
| `aui-diagram__toolbar`, `__tool` | Toolbar and its buttons. |
| `aui-diagram__palette`, `__palette-item`, `__palette-shape` | Edit-mode palette. |
| `aui-diagram__viewport`, `--panning` | Focusable canvas; set `block-size` to size the diagram (30rem by default). |
| `aui-diagram__svg`, `__scene`, `__grid`, `__grid-dot` | SVG, transformed scene, grid. |
| `aui-diagram__groups`, `__group`, `__group-box`, `__group-label` | Group boxes. |
| `aui-diagram__edges`, `__edge` (`--dashed`, `--selected`), `__line`, `__arrow` (`--open`) | Connector drawing. |
| `aui-diagram__nodes`, `__node` (`--locked`, `--source`, `--moving`, `--target`) | Node listbox and options. |
| `aui-diagram__body`, `__shape` (`--custom`), `__shape-detail`, `__label`, `__focus` | Node parts. |
| `aui-diagram__ports`, `__port`, `__port-hit`, `__port-dot` | Ports. |
| `aui-diagram__links`, `__link`, `__link-hit`, `__link-ring`, `__link-core`, `__edge-label`, `__edge-label-bg`, `__edge-label-text`, `__handles`, `__handle` | Connection options. |
| `aui-diagram__overlay`, `__guide`, `__marquee`, `__preview`, `__ghost` | Drag feedback. |
| `aui-diagram__editor` | Inline label input. |
| `aui-diagram__text` (`--hidden`), `__text-toggle`, `__table-scroll`, `__table` | Text alternative. |

## 10. Design tokens

Component tokens (fall back to the global tokens shown):

| Token | Fallback | Use |
|---|---|---|
| `--aui-diagram-canvas-bg` | `color-surface-sunken` | Canvas background. |
| `--aui-diagram-node-bg` | `color-surface` | Node fill, edge label background. |
| `--aui-diagram-node-border` | `color-border-strong` | Node outline. |
| `--aui-diagram-edge-color` | `color-border-strong` | Connector lines and arrowheads. |
| `--aui-diagram-grid-color` | `color-border` | Grid dots (decorative). |

Global tokens: `color-text`, `color-text-muted`, `color-text-disabled`, `color-hover`, `color-selected`, `color-selected-text`, `color-focus-ring`, `color-border`, `color-border-strong`, `color-surface`, `color-surface-sunken`, `border-width`, `border-width-strong`, `focus-ring-width`, `focus-ring-offset`, `radius-sm`, `radius-md`, `shadow-sm`, `space-1`, `space-2`, `font-family-sans`, `font-size-sm`, `font-size-xs`, `font-weight-semibold`, `line-height-tight`, `icon-size-sm`, `touch-target-min`. Contrast pairs (checked by `check:contrast`): label text on node fill, node outline, connectors, and focus ring on the canvas, selected text on the selected fill.

## 11. States

View mode and edit mode; selected nodes and edges; focused node and connection; move mode; connecting (keyboard, toolbar, or port drag); placing (Move selection); Pan tool on; dragging (move, connect, reconnect, marquee, pan); editing a label; locked node; zoomed and panned; text alternative shown or hidden.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| Idle | Node `M` (edit) | Move mode; arrows move; Enter/`M` commits one undo step; Escape restores. |
| Idle | Node `C` (edit) or toolbar Connect | Connecting from the node; `C`/Enter on another node or a click connects; Escape or `C` on the source cancels. |
| Idle | Port drag (edit) | Connection preview; release on a node connects (on a port: to that port). |
| Selected edge | Handle drag (edit) | Reconnect preview; release on a node changes that end. |
| Idle | Toolbar Move selection | Placing; a click on the canvas centers the selection there; Escape cancels. |
| Idle | Enter/F2 or double-click (edit) | Label editor; Enter or blur commits, Escape cancels; focus returns to the item. |
| Any edit | Undo / Redo | Previous / next snapshot. |
| Any | `update({ model })` | New data; history and modes cleared. |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Diagram | Toolbar, palette (edit), canvas, focused node, focused connection, text alternative. |
| Arrow keys | Canvas | Pan (Shift: four times farther). |
| Arrow keys | Node | Focus the nearest node in that direction (spatial); Shift adds it to the selection. |
| Home / End | Node | First / last node in reading order. |
| Space / Shift+Space, Ctrl/Cmd+Space | Node or connection | Select only / toggle. |
| Enter | Node, view mode | Activate (`aui-node-activate`). |
| Enter / F2 | Node or connection, edit mode | Edit the label. |
| C | Node, edit mode | Start connecting; on the target, C or Enter connects. |
| M | Node, edit mode | Move mode (arrows: grid step, Shift: five steps; Enter or M finishes; Escape cancels). |
| Delete / Backspace | Node or connection, edit mode | Delete the selection or the focused item. |
| Ctrl/Cmd+C / X / V | Edit mode | Copy / cut / paste nodes. |
| Ctrl/Cmd+A | Diagram | Select every node. |
| Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Edit mode | Undo / redo. |
| + or = / - / 0 | Diagram | Zoom in / out / fit. |
| Escape | Diagram | Cancel connecting or placing, else clear the selection. |
| Arrows, Home / End | Connection | Next / previous / first / last connection. |

## 14. ARIA contract

- Canvas: `role="group"`, `aria-roledescription="canvas"`, `aria-label` = `label`, `tabindex="0"`.
- Nodes: `role="listbox"` with `aria-multiselectable="true"`, named `'{label}: nodes'`; each node `role="option"`, `aria-roledescription="node"`, `aria-selected`, roving `tabindex`, and an `aria-label` with label, shape, connections ("leads to …", "comes from …"), group, and locked state.
- Connections: `role="listbox"` named `'{label}: connections'` (hidden when empty); each `role="option"`, `aria-roledescription="connection"`, named `'{from} to {to}[, {label}]'`.
- Drawing layers, label text, ports, and overlays are `aria-hidden`.
- Toolbar: `role="group"`; buttons use `aria-disabled` when unavailable and `aria-pressed` for Pan tool, Connect, and Move selection.
- Label editor: `<input type="text">` named `'Label of {name}'`.
- Text alternative: toggle with `aria-expanded` / `aria-controls`; table with caption and row headers in a focusable region.
- Live regions announce edits (polite) and modes, refusals, and locked nodes (assertive).

## 15. Accessibility notes

- Every drag has an alternative (WCAG 2.5.7): move with `M` and arrows or toolbar Move selection then one click; connect with `C` on source and target or Connect then one click; add shapes by clicking palette buttons; pan with arrow keys; reconnect by deleting and connecting again.
- Node names carry their connections and the text alternative lists the whole graph, so the structure does not depend on seeing the drawing (1.1.1, 1.3.1).
- Selection is shown by fill plus a three px outline (nodes) or width (edges), not color alone (1.4.1).
- Ports are small pointer targets; keyboard and toolbar connect are the equivalent controls (2.5.8).
- Manual screen-reader verification (NVDA, JAWS, VoiceOver) is pending.

## 16. Responsive behavior

The viewport has a fixed block size (30rem by default; set `block-size` on `.aui-diagram__viewport`) and clips the drawing. The view pans and zooms instead of scrolling, so the page reflows at 320 px. Toolbar and palette wrap and use touch-target-min buttons. `fit()` scales the drawing into any viewport; before the user pans or zooms, a resize refits.

## 17. RTL behavior

`direction: 'rtl'` mirrors auto-layout (`LR` runs right to left; top-down layouts are mirrored horizontally) and the reading order of nodes. Arrow keys are spatial and not swapped: ArrowLeft always goes to the node on the left. Toolbar and palette follow the inline direction.

## 18. Theme behavior

Nodes use `--aui-diagram-node-bg` and `--aui-diagram-node-border`, connectors `--aui-diagram-edge-color`, the canvas `--aui-diagram-canvas-bg` with `--aui-diagram-grid-color` dots. Selected nodes use `color-selected` with a `color-selected-text` outline; focus uses `color-focus-ring`. Works in the light, dark, and high-contrast themes and with density (toolbar sizes follow `touch-target-min`). Forced-colors mode uses CanvasText lines and outlines, Canvas fills, and Highlight for selection and focus. Nothing animates, so reduced motion needs no change.

## 19. Global configuration support

```ts
import { configureAbsoluteUI } from '@absoluteui/core';

configureAbsoluteUI({ components: { diagram: { routing: 'curved', gridSize: 20, textAlternative: 'visible' } } });
```

Globally configurable: `nodeWidth`, `nodeHeight`, `gridSize`, `snapToGrid`, `routing`, `nodeGap`, `rankGap`, `minZoom`, `maxZoom`, `textAlternative`, plus the common `locale` and `direction`.

## 20. Component configuration support

Every globally configurable option can also be set per instance in `Diagram.create()` and changed with `update()`; instance values win. `label`, `model`, `editable`, `layout`, `palette`, `renderShape`, `canConnect`, `historyLimit`, and `showGrid` are per instance only.

## 21. Timezone behavior

Not applicable: the diagram shows no dates or times.

## 22. Icon customization points

Toolbar icons are built-in names resolved through the icon registry: `zoom-out`, `zoom-in`, `maximize` (fit), `grip` (Pan tool), `link` (Connect), `locate` (Move selection), `undo`, `redo`, `trash` (delete). Register replacements for these names to change them everywhere. Palette buttons draw their shape outline.

## 23. Security behavior

Labels render through `textContent` in SVG `<text>`; the label editor is a plain text input (no HTML anywhere). `renderShape` returns SVG elements the application builds (strings are not accepted; the result is checked to be an `SVGElement`). The model is validated before use: unique ids, known nodes, ports, and groups, finite numbers in range, and JSON-primitive `data`. Positions are SVG attributes and the editor position goes through the CSSOM, so the component works under a strict CSP with Trusted Types. Export writes presentation attributes only; PNG export needs `img-src blob:`.

## 24. Data handling behavior

No persistence, network access, or telemetry. Every change emits `aui-change` with the whole model (copies); the `model` getter returns copies for saving. Copy and paste use an instance clipboard (the system clipboard is not read or written). Export creates files through temporary object URLs; nothing is uploaded.

## 25. Performance characteristics

- `Diagram.create` with 300 nodes and 400 edges, layout and first paint included: budget < 250 ms in headless Chromium (184 ms measured).
- `layoutDiagram` (layered): a 500-node flowchart < 50 ms (12 ms measured); 500 nodes with 200 long cross edges < 250 ms (110 to 160 ms measured).
- Drags update only the moved nodes and their edges (budget < 8 ms per frame at 300 nodes); a full re-render runs once at the end.
- Label wrapping is measured with a canvas 2D context and cached per label.

## 26. Supported data scale

Sized for a few hundred nodes and edges (tested at 300 nodes and 400 edges; layout at 500 nodes). Every node and edge is an SVG element (no virtualization). For thousands of nodes use a data view (Data Grid, Organization Chart with lazy loading) instead.

## 27. Usage examples

See section 33 (vanilla), the metadata examples (`basic`, `editing`, `ports-routing`, `custom-shape`, `layout-function`, `global-config`), and the Process designer showcase on the docs site.

## 28. Edge cases

- Nodes without positions are placed by layout; with `keepPositions`, new nodes go next to a placed neighbor and never overlap.
- Cycles are allowed (back edges are reversed for layering only); self connections are refused.
- Exact duplicate connections are refused; parallel edges between different ports are allowed.
- An empty model shows an empty canvas; the connection list is hidden while there are none.
- Long labels wrap to the node's label area and end with an ellipsis; the full label stays in the accessible name and the text alternative.
- Locked nodes cannot be moved, relabelled, or deleted through the UI (the API can still change them).
- An empty node label is not accepted from the editor (the old label stays); an empty edge label removes it.
- `update({ model })` during a drag or move mode cancels the interaction first.

## 29. Error behavior

Invalid options or models throw `AbsoluteUIError` (`DIAGRAM_OPTIONS`) with the property path (for example `diagram.model.edges[2].toPort`) and the expected value, before anything renders or changes. API methods with unknown ids throw the same error. `canConnect` refusals are announced, not thrown. Export throws `DIAGRAM_EXPORT_OPTIONS` for bad options and `DIAGRAM_EXPORT_FAILED` / `DIAGRAM_EXPORT_UNAVAILABLE` when rasterizing is not possible.

## 30. Known limitations

- Edges are routed between their end points only and do not avoid other nodes.
- Every node and edge is rendered (no virtualization).
- Groups are boxes around their members; swimlanes and nested groups are not provided.
- Nodes are resized through the model, not by dragging handles.
- A plain mouse wheel scrolls the page; zoom needs Ctrl/Cmd + wheel, the toolbar, or keys. No pinch zoom.
- Keyboard reconnect means delete and connect again.
- Export draws custom shapes as rounded rectangles.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Freehand drawing, user-placed edge waypoints.
- Rich text or HTML labels.
- Collaborative editing (merging is the application's job).
- Printing across pages.

## 32. TypeScript definitions

```ts
type DiagramShape = 'rectangle' | 'rounded' | 'ellipse' | 'diamond' | 'parallelogram' | 'cylinder' | 'document' | 'custom';
type DiagramRouting = 'straight' | 'orthogonal' | 'curved';
type DiagramArrow = 'none' | 'arrow' | 'triangle' | 'diamond' | 'circle';
interface DiagramPort { id: string; side: 'top' | 'right' | 'bottom' | 'left'; offset?: number }
interface DiagramNode { id: string; label: string; shape?: DiagramShape; x?: number; y?: number; width?: number; height?: number; ports?: DiagramPort[]; group?: string; pinned?: boolean; locked?: boolean; data?: DiagramData }
interface DiagramEdge { id: string; from: string; to: string; fromPort?: string; toPort?: string; label?: string; routing?: DiagramRouting; arrowStart?: DiagramArrow; arrowEnd?: DiagramArrow; dashed?: boolean; data?: DiagramData }
interface DiagramGroup { id: string; label: string }
interface DiagramModel { nodes: DiagramNode[]; edges: DiagramEdge[]; groups?: DiagramGroup[] }
interface DiagramAutoLayout { algorithm?: 'layered' | 'tree'; direction?: 'TB' | 'BT' | 'LR' | 'RL'; nodeGap?: number; rankGap?: number; sweeps?: number; keepPositions?: boolean }
interface DiagramChangeDetail { reason: DiagramChangeReason; model: DiagramModel; ids: string[] }
interface DiagramSelectDetail { nodes: string[]; edges: string[] }
interface DiagramNodeActivateDetail { id: string; node: DiagramNode }
interface DiagramZoomDetail { scale: number }
```

## 33. Vanilla JS example

```ts
import { Diagram, downloadDiagram, type DiagramChangeDetail, type DiagramModel } from '@absoluteui/components/diagram';
import '@absoluteui/components/diagram/style.css';

const model: DiagramModel = {
  nodes: [
    { id: 'request', label: 'Leave request', shape: 'ellipse' },
    { id: 'manager', label: 'Manager approval', shape: 'diamond', height: 96 },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
  ],
  edges: [
    { id: 'e1', from: 'request', to: 'manager' },
    { id: 'e2', from: 'manager', to: 'approved', label: 'Yes' },
    { id: 'e3', from: 'manager', to: 'rejected', label: 'No' },
  ],
};

const host = document.querySelector<HTMLElement>('#workflow');
if (host) {
  const diagram = Diagram.create(host, { label: 'Leave approval', model, editable: true, layout: { direction: 'LR' } });
  host.addEventListener('aui-change', (event) => {
    sessionStorage.setItem('workflow', JSON.stringify((event as CustomEvent<DiagramChangeDetail>).detail.model));
  });
  document.querySelector('#export')?.addEventListener('click', () => {
    void downloadDiagram(diagram, { format: 'png', fileName: 'leave-approval' });
  });
}
```

## 34. Angular example

`<aui-diagram>` is generated: inputs mirror `DiagramOptions`; `[(model)]` is two-way (updated from `aui-change`); outputs `changed`, `selected`, `nodeActivated`, `zoomed`; methods such as `layout()`, `undo()`, `fit()` through the controller.

```ts
import { Component } from '@angular/core';
import type { DiagramModel, DiagramNodeActivateDetail } from '@absoluteui/components/diagram';
import { AuiDiagram } from '@absoluteui/angular/diagram';

@Component({
  selector: 'app-workflow',
  imports: [AuiDiagram],
  template: `<aui-diagram label="Leave approval" [(model)]="model" [editable]="true" (nodeActivated)="open($event)"></aui-diagram>`,
})
export class WorkflowComponent {
  model: DiagramModel = {
    nodes: [
      { id: 'a', label: 'Request', x: 0, y: 0 },
      { id: 'b', label: 'Manager approval', shape: 'diamond', x: 240, y: 0 },
    ],
    edges: [{ id: 'ab', from: 'a', to: 'b' }],
  };

  open(detail: DiagramNodeActivateDetail): void {
    // show detail.node in a side panel
  }
}
```

## 35. React example

```tsx
import { useState } from 'react';
import type { Diagram, DiagramModel } from '@absoluteui/components/diagram';
import { AuiDiagram } from '@absoluteui/react/diagram';

const initial: DiagramModel = {
  nodes: [
    { id: 'a', label: 'Request', x: 0, y: 0 },
    { id: 'b', label: 'Approval', shape: 'diamond', x: 240, y: 0 },
  ],
  edges: [{ id: 'ab', from: 'a', to: 'b' }],
};

export function Workflow({ onSave }: { onSave: (model: DiagramModel) => void }) {
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  return (
    <>
      <button type="button" onClick={() => { diagram?.layout({ direction: 'LR' }); }}>Left to right</button>
      <AuiDiagram ref={setDiagram} label="Approval route" model={initial} editable onChange={(d) => { onSave(d.model); }} />
    </>
  );
}
```

Keep `model` stable (a new object clears the undo history). See [docs/REACT.md](../../../docs/REACT.md) for events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import type { DiagramChangeDetail, DiagramModel } from '@absoluteui/components/diagram';
import { AuiDiagram } from '@absoluteui/vue/diagram';

const model: DiagramModel = {
  nodes: [
    { id: 'a', label: 'Request', x: 0, y: 0 },
    { id: 'b', label: 'Approval', shape: 'diamond', x: 240, y: 0 },
  ],
  edges: [{ id: 'ab', from: 'a', to: 'b' }],
};
const save = (detail: DiagramChangeDetail) => console.info(detail.reason, detail.model.nodes.length);
</script>

<template>
  <AuiDiagram label="Approval route" :model="model" editable routing="curved" @change="save" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that enhance or render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
