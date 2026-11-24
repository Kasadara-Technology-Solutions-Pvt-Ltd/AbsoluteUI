# Dashboard Grid

> Package: `@absoluteui/components/dashboard-grid` | Styles: `@absoluteui/components/dashboard-grid/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

A responsive, user-arrangeable dashboard layout. `DashboardGrid` enhances a host whose children carry `data-aui-item="<id>"` into a labelled region laid out as a CSS grid in column/row units. In edit mode every item gets a move handle: drag it (mouse, pen, touch), or press it and use the arrow keys (Shift+arrows resize); a corner grip resizes by pointer. Other items are pushed down and float back up (vertical compaction); locked items never move. Layouts are stored per breakpoint, derived for narrower breakpoints when not saved, serializable, and undoable. The DOM order follows the visual reading order after every change, so focus order matches what users see.

The same subpath exports `DashboardCatalog` (a list of widget templates that adds widgets to a grid) and the pure layout functions the grid uses (`collides`, `clampItem`, `sortLayout`, `compactLayout`, `resolveLayout`, `findFreeSpot`, `adaptLayout`).

## 2. Anatomy

```text
<div class="aui-dashboard [aui-dashboard--editing]" role="region" aria-label="{label}">   (consumer host)
  <section data-aui-item="sales" class="aui-dashboard__item [--locked] [--dragging]">      (consumer child; grid-column / grid-row via CSSOM)
    <button class="aui-dashboard__handle" aria-pressed="false" aria-label="Move Sales">   (edit mode; prepended)
    ...consumer content...
    <div class="aui-dashboard__resize" aria-hidden="true">                                (edit mode; appended; pointer only)
  </section>
  <div class="aui-dashboard__placeholder" aria-hidden="true">                             (while moving / previewing)
</div>

<div class="aui-dashboard-catalog">                                                        (catalog host; children replaced)
  <ul class="aui-dashboard-catalog__list" aria-label="{label}">
    <li class="aui-dashboard-catalog__entry">
      <button class="aui-dashboard-catalog__template" data-template="{id}" aria-label="Add {label}">
        [icon.aui-dashboard-catalog__icon]
        <span class="aui-dashboard-catalog__text"><span class="…__label"> <span class="…__description"></span>
```

## 3. When to use

- User-arrangeable dashboards of widgets (KPI cards, charts, tables) whose layout is saved per user.
- Responsive dashboard layouts in column/row units that must adapt to narrower screens.
- Letting users add widgets from a catalog of templates (`DashboardCatalog`).

## 4. When not to use

- Page layout without user rearrangement: use CSS grid or Layout.
- Reordering a single vertical list: use Sortable List.
- Free-form canvases with pixel positions, overlapping items, or rotation.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | The enhanced host (`role="region"`). |
| `breakpoint` | `DashboardBreakpoint` | Active breakpoint (a copy). |
| `items` | `DashboardItem[]` | Items of the active breakpoint (copies; derived when no layout is stored for it). |
| `layouts` | `Record<string, DashboardItem[]>` | Every stored layout by breakpoint name (copies); the widest breakpoint is always included. JSON-serializable. |
| `editable` | `boolean` | Edit mode. |
| `canUndo`, `canRedo` | `boolean` | History is available. |
| `previewCell` | `{ x, y } \| null` | Last drop-preview cell of an external (catalog) drag. |

Options (`DashboardGridOptions`):

| Option | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | required | Accessible name of the region. |
| `items` | `readonly DashboardItem[]` | required | Layout for the widest breakpoint. |
| `layouts` | `Readonly<Record<string, readonly DashboardItem[]>>` | - | Saved layouts by breakpoint name; unknown names are ignored. |
| `breakpoints` | `readonly DashboardBreakpoint[]` | lg 1024/12, md 640/6, sm 0/1 | `{ name, minWidth, columns }`; one must have `minWidth: 0`; columns 1..48. |
| `editable` | `boolean` | `false` | Edit mode. |
| `historyLimit` | `number` | `50` | Undo depth, 0..500. |
| `reorderDom` | `boolean` | `true` | Keep the DOM in reading order. |
| `rowHeight` | `number` | `80` | CSS px, 24..600 (global). |
| `gap` | `number` | `16` | CSS px, 0..64 (global). |
| `compaction` | `'vertical' \| 'none'` | `'vertical'` | Items float up, or stay where they are put (global). |
| `locale`, `direction` | - | inherited | Announcements; RTL arrow-key mirroring (global, inherited). |

`DashboardItem`: `{ id, x, y, w, h, minW?, minH?, maxW?, maxH?, locked?, label? }`. `x`/`y` are 0-based column/row (column 0 at the inline start), `w`/`h` sizes in columns/rows. `label` names the move handle and announcements (default: the item's first heading, else the id). Items are clamped to their limits and the column count.

`DashboardCatalogOptions`: `grid` (the `DashboardGrid`), `label` (accessible name of the list), `templates` (`readonly DashboardTemplate[]`: `{ id, label, description?, w, h, minW?, minH?, icon? }`, unique ids), `create?` (`(template, item) => HTMLElement | null`, renders the widget element for vanilla use), `locale?`.

## 6. Methods

| Method | Description |
|---|---|
| `DashboardGrid.create(host, options)` | Enhance `host`. Throws `DASHBOARD_GRID_OPTIONS` before touching the host on invalid options. |
| `update(options)` | Merge and apply; cancels a grab. `items`, `layouts`, or `breakpoints` replace all stored layouts. No event. |
| `setEditable(editable)` | Enter or leave edit mode. |
| `addItem(item, element?)` | Add at `x`/`y` (colliding items pushed down) or at the first free spot; other stored layouts get their first free spot. `element` is given `data-aui-item` and appended; otherwise the child with that `data-aui-item` is used when it appears. Returns the placed item; emits `aui-layout-change` (`add`). Duplicate ids throw. |
| `removeItem(id, removeElement = true)` | Remove from every layout (and its element unless `removeElement` is false); emits `remove`. |
| `setLayout(items)` | Replace the active breakpoint's layout (validated, clamped, compacted). Undoable; emits `set`. |
| `undo()`, `redo()` | Restore layout geometry; return `false` when there is nothing to restore; emit `undo` / `redo`. |
| `previewAt(clientX, clientY, w, h)`, `clearPreview()` | Drop preview for external drags (used by the catalog). |
| `handleFor(id)` | The item's move handle (edit mode) or `null`. |
| `destroy()` | Remove handles, grips, classes, placement styles, role, label, observers, and listeners. Children stay. |
| `DashboardCatalog.create(host, options)` | Render the catalog into `host` (children replaced). Throws `DASHBOARD_CATALOG_OPTIONS` on invalid options. |
| `catalog.add(templateId, at?)` | Add a widget from a template (see Events); returns the item or `null` when vetoed. |
| `catalog.update(options)`, `catalog.destroy()` | Re-render / remove the catalog. |

Layout functions (pure, no DOM): `collides(a, b)`, `clampItem(item, columns)`, `sortLayout(items)` (reading order), `compactLayout(items, anchored?)` (float up; locked and anchored ids stay), `resolveLayout(items, moved, columns, compaction?)` (place `moved`, push overlapped items down, cascading; locked items push the moved item below them), `findFreeSpot(items, w, h, columns)`, `adaptLayout(items, fromColumns, columns)` (proportional scaling; one column stacks in reading order).

## 7. Events

| Event | Detail | Bubbles | Cancelable | Description |
|---|---|---|---|---|
| `aui-layout-change` | `DashboardGridLayoutChangeDetail` | Yes | No | Layout committed: `reason` `'move' \| 'resize' \| 'add' \| 'remove' \| 'undo' \| 'redo' \| 'set'`, `breakpoint`, `items`, `layouts` (save this), `id` (the item or `null`). Emitted on drop only when something changed, not on every live step. |
| `aui-breakpoint-change` | `DashboardGridBreakpointChangeDetail` `{ breakpoint, columns }` | Yes | No | The host width crossed into another breakpoint. |
| `aui-catalog-add` | `DashboardCatalogAddDetail` `{ template, item }` | Yes | Yes | On the catalog host, before a widget is added. `preventDefault()` vetoes. Frameworks render the widget element with `data-aui-item={detail.item.id}` here. |

`update()` and breakpoint changes do not emit `aui-layout-change`.

## 8. Slots/content areas

Host children with `data-aui-item` are the items (first child per id). They stay owned by the page or framework: the grid only positions them, sets `hidden` on elements whose id is not in the active layout, reorders them within the host, and in edit mode prepends a move handle and appends a resize grip. Removing an element from the host removes its item from every layout (announced, `aui-layout-change` with `remove`). Children without `data-aui-item` are left alone.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-dashboard` | Host grid. Custom properties (CSSOM): `--aui-dashboard-columns`, `--aui-dashboard-row-height`, `--aui-dashboard-gap`, `--aui-dashboard-rows`. |
| `aui-dashboard--editing` | Edit mode (Dashboard Widget headers leave room for the handle). |
| `aui-dashboard__item`, `--locked`, `--dragging` | Item element; locked (no grip); grabbed or dragged. |
| `aui-dashboard__handle` | Move handle. |
| `aui-dashboard__resize` | Resize grip. |
| `aui-dashboard__placeholder` | Drop target preview. |
| `aui-dashboard-catalog`, `__list`, `__entry`, `__template`, `__template--dragging`, `__icon`, `__text`, `__label`, `__description` | Catalog. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/dashboard-grid/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-selected`, `color-selected-text`, `color-focus-ring`, `shadow-lg`, `touch-target-min`, `color-chart-axis` (grip lines), `duration-fast`.

## 11. States

view, edit mode, item grabbed (keyboard), item dragging or resizing (pointer), item locked, drop preview (catalog drag), per-breakpoint layout (stored or derived).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| view | `setEditable(true)` / `update({ editable: true })` | edit mode: handles and grips added |
| edit mode | Enter/Space or click on a handle | grabbed (announced); placeholder shown |
| grabbed | arrow keys / Shift+arrows | item moved / resized live; others pushed down and floated up |
| grabbed | Enter/Space/click, Tab, or blur | dropped: layout compacted; `aui-layout-change` if changed; undo step |
| grabbed | Escape, breakpoint change, `update()` | cancelled: layout restored |
| edit mode | pointer drag of the handle or grip | dragging/resizing; release drops, pointer cancel cancels |
| any | host width crosses a breakpoint | new breakpoint layout (stored or derived); `aui-breakpoint-change` |
| any | item element removed from the host | item removed from every layout; `aui-layout-change` (`remove`) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Edit mode | Moves through handles and item content in DOM (= reading) order. |
| Enter / Space | Handle, nothing grabbed | Grabs the item; announces position, size, and instructions. Locked items announce "{label} is locked." |
| Arrow keys | Item grabbed | Move one cell (Left/Right mirrored in RTL); announces "Column {c}, row {r}." |
| Shift+ArrowRight / ArrowLeft | Item grabbed | Widen / narrow by one column (both directions). |
| Shift+ArrowDown / ArrowUp | Item grabbed | Taller / shorter by one row. |
| Enter / Space | Item grabbed | Drops; announces "{label} dropped at column {c}, row {r}." |
| Escape | Item grabbed | Cancels; the layout returns; announced. |
| Tab | Item grabbed | Drops, then focus moves on. |
| Ctrl/Cmd+Z | Edit mode, nothing grabbed | Undo. |
| Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y | Edit mode, nothing grabbed | Redo. |
| Enter / Space | Catalog template | Adds the widget at the first free spot; focus moves to its handle in edit mode. |

## 14. ARIA contract

- Host: `role="region"` with `aria-label` = `label`.
- Move handle: native `<button>` with `aria-label`/`title` "Move {label}" and `aria-pressed` (`true` while grabbed or dragged).
- Resize grip and placeholder: `aria-hidden="true"`.
- Announcements through the shared live regions: grabbed, moved, resized, dropped, cancelled are assertive; added, removed, undone, redone, locked are polite.
- Catalog: `<ul aria-label="{label}">` of `<button aria-label="Add {label}">`.

## 15. Accessibility notes

- Dragging is never required (WCAG 2.5.7): the handle works by keyboard and by single clicks (click to grab, click to drop); Shift+arrows resize, so the pointer-only grip has a keyboard equivalent.
- The DOM follows reading order after every change (keep `reorderDom` on), so focus and screen-reader order match the layout; focus is restored after reordering.
- The grabbed state is conveyed by `aria-pressed`, background, and border, not color alone.
- Manual screen-reader verification (NVDA, JAWS, VoiceOver) is pending; pointer moves are not announced.

## 16. Responsive behavior

A `ResizeObserver` picks the breakpoint with the largest `minWidth` not above the host's content width. Defaults: `lg` from 1024 px (12 columns), `md` from 640 px (6), `sm` from 0 (1). A breakpoint without a stored layout derives one from the widest layout: `x` and `w` scale proportionally (then overlaps are resolved and compacted), and a single column stacks items in reading order. The first edit at a derived breakpoint stores that layout; `layouts` then contains it. Row height and gap are fixed CSS px.

## 17. RTL behavior

Column 0 is at the inline start. With `direction: 'rtl'`, ArrowLeft/ArrowRight moves are mirrored and pointer positions are measured from the right edge; the grip is mirrored. Shift+ArrowRight always widens and Shift+ArrowLeft narrows.

## 18. Theme behavior

Role tokens only. Handles: `color-surface`, `color-border-strong`; grabbed: `color-selected` + `color-selected-text` + border. Placeholder: `color-selected` with a dashed `color-focus-ring` border. Forced colors: `Highlight` for the grabbed handle and placeholder border, `CanvasText` grip lines. Item transitions are removed under `prefers-reduced-motion` and `data-aui-animation="none"`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { dashboardGrid: { rowHeight: 96, gap: 24, compaction: 'none' } } });
```

Global options: `rowHeight`, `gap`, `compaction`, plus inherited `locale` and `direction`. Changes apply to existing grids immediately.

## 20. Component configuration support

Instance options override global and theme defaults. All options are dynamic through `update()`; note that `items`, `layouts`, and `breakpoints` replace all stored layouts.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

The move handle uses the `grip` icon. Catalog templates take an optional `icon` (`IconRef`).

## 23. Security behavior

Placement is written with `style.setProperty` (never style attributes or HTML); CSP-safe. Labels and announcements are text. Items, layouts, and breakpoints are validated before use (`DASHBOARD_GRID_OPTIONS`), so layouts restored from storage can be passed back; malformed input throws rather than rendering.

## 24. Data handling behavior

No persistence, network access, or telemetry. Save `aui-layout-change` `detail.layouts` (or `grid.layouts`) and pass it back as `layouts`. Item content stays owned by the page.

## 25. Performance characteristics

Layout work is pure array computation over the items; rendering sets two placement properties per item and reorders only when the reading order changed. One `ResizeObserver`, one `MutationObserver` (child list), one host keydown listener, and per-item pointer trackers in edit mode. Budgets: `DashboardGrid.create` with 50 items < 40 ms in headless Chromium (e2e performance test); a keyboard move step with 50 items < 16 ms in headless Chromium (e2e performance test).

## 26. Supported data scale

50 items is the performance target. Columns 1..48 per breakpoint; rows are unbounded.

## 27. Usage examples

```ts
import { DashboardGrid, type DashboardItem } from '@absoluteui/components/dashboard-grid';

const host = document.querySelector<HTMLElement>('#dashboard');
const items: DashboardItem[] = [
  { id: 'sales', x: 0, y: 0, w: 6, h: 2 },
  { id: 'users', x: 6, y: 0, w: 6, h: 2 },
];
if (host) DashboardGrid.create(host, { label: 'Overview', items, editable: true });
```

More examples (catalog, saving layouts, layout functions), type-checked in CI: `metadata/dashboard-grid/examples.json`.

## 28. Edge cases

- Vertical compaction: an item cannot rest below empty space, and a full-width item cannot pass a half-width neighbor (it floats back on drop). Use `compaction: 'none'` for free placement.
- Collisions push items down, never sideways; a locked item under the target pushes the moved item below it.
- Undo covers moves, resizes, and `setLayout`; it restores geometry only and does not add back removed items or remove added ones.
- A child whose id is not in the active layout is hidden; an item without an element occupies space but renders nothing.
- A host that is not laid out at create time (`clientWidth` 0) starts at the narrowest breakpoint until the observer reports its width.
- In edit mode the undo/redo shortcuts are handled on the whole host, including text fields inside widgets.
- The catalog adds even when the grid is not editable; focus moves to the new handle only in edit mode.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `DASHBOARD_GRID_OPTIONS` | configuration | Empty label; invalid or duplicate item ids, positions, sizes, limits; invalid breakpoints (none with `minWidth: 0`, columns outside 1..48); invalid `layouts`, `editable`, `reorderDom`, `historyLimit`; `addItem` with a duplicate id. |
| `DASHBOARD_CATALOG_OPTIONS` | configuration | Empty label, missing grid, invalid or duplicate templates, `add()` with an unknown template id. |

A failed construction leaves the host untouched.

## 30. Known limitations

- Vertical compaction rules above; no horizontal compaction.
- Pointer drags and resizes are not announced.
- No auto-scroll while dragging near the viewport edge.
- `update()` with `items`, `layouts`, or `breakpoints` replaces all stored layouts.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Overlapping items or pixel positioning.
- Dragging items between grids.
- HTML5 drag and drop; dropping files.

## 32. TypeScript definitions

```ts
interface DashboardItem { id: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number; maxW?: number; maxH?: number; locked?: boolean; label?: string }
type DashboardCompaction = 'vertical' | 'none';
interface DashboardBreakpoint { name: string; minWidth: number; columns: number }
type DashboardLayoutReason = 'move' | 'resize' | 'add' | 'remove' | 'undo' | 'redo' | 'set';
interface DashboardGridLayoutChangeDetail { reason: DashboardLayoutReason; breakpoint: string; items: DashboardItem[]; layouts: Record<string, DashboardItem[]>; id: string | null }
interface DashboardGridBreakpointChangeDetail { breakpoint: string; columns: number }
interface DashboardTemplate { id: string; label: string; description?: string; w: number; h: number; minW?: number; minH?: number; icon?: IconRef }
interface DashboardCatalogAddDetail { template: DashboardTemplate; item: DashboardItem }
```

## 33. Vanilla JS example

```ts
import { DashboardCatalog, DashboardGrid, type DashboardGridLayoutChangeDetail, type DashboardItem } from '@absoluteui/components/dashboard-grid';
import '@absoluteui/components/dashboard-grid/style.css';

const gridHost = document.querySelector<HTMLElement>('#dashboard');
const catalogHost = document.querySelector<HTMLElement>('#widgets');
const items: DashboardItem[] = [{ id: 'sales', x: 0, y: 0, w: 6, h: 2 }];
if (gridHost && catalogHost) {
  const grid = DashboardGrid.create(gridHost, { label: 'Overview', items, editable: true });
  gridHost.addEventListener('aui-layout-change', (event) => {
    const { layouts } = (event as CustomEvent<DashboardGridLayoutChangeDetail>).detail;
    sessionStorage.setItem('dashboard', JSON.stringify(layouts));
  });
  DashboardCatalog.create(catalogHost, {
    grid,
    label: 'Widgets',
    templates: [{ id: 'note', label: 'Note', w: 3, h: 2 }],
    create: (template) => {
      const el = document.createElement('section');
      el.textContent = template.label;
      return el;
    },
  });
}
```

## 34. Angular example

`<aui-dashboard-grid>` positions its projected children (each with `data-aui-item`); they stay Angular-managed. `[(items)]` and `[(layouts)]` follow user moves and resizes; outputs `layoutChanged` (with the reason) and `breakpointChange`; methods `addItem()`, `removeItem()`, `undo()`, `redo()`. `<aui-dashboard-catalog [grid]="board">` (with `#board="auiDashboardGrid"`) is exported from the same entry point; `(catalogAdded)` receives the cancelable DOM event.

```ts
import { Component } from '@angular/core';
import type { DashboardGridLayoutChangeDetail, DashboardItem } from '@absoluteui/components/dashboard-grid';
import { AuiDashboardGrid } from '@absoluteui/angular/dashboard-grid';

@Component({
  selector: 'app-overview',
  imports: [AuiDashboardGrid],
  template: `
    <aui-dashboard-grid label="Overview" [items]="items" [editable]="true" (layoutChanged)="save($event)">
      <section data-aui-item="sales"><h2>Sales</h2></section>
      <section data-aui-item="users"><h2>Active users</h2></section>
    </aui-dashboard-grid>`,
})
export class OverviewComponent {
  readonly items: DashboardItem[] = [
    { id: 'sales', x: 0, y: 0, w: 6, h: 2 },
    { id: 'users', x: 6, y: 0, w: 6, h: 2 },
  ];

  save(detail: DashboardGridLayoutChangeDetail): void {
    // persist detail.layouts
  }
}
```

## 35. React example

```tsx
import { useState } from 'react';
import type { DashboardGrid, DashboardItem } from '@absoluteui/components/dashboard-grid';
import { AuiDashboardGrid } from '@absoluteui/react/dashboard-grid';

const items: DashboardItem[] = [
  { id: 'sales', x: 0, y: 0, w: 6, h: 2 },
  { id: 'users', x: 6, y: 0, w: 6, h: 2 },
];

export function Example({ save }: { save: (layouts: Record<string, DashboardItem[]>) => void }) {
  const [grid, setGrid] = useState<DashboardGrid | null>(null);
  return (
    <>
      <button type="button" disabled={grid === null} onClick={() => { grid?.undo(); }}>Undo</button>
      <AuiDashboardGrid ref={setGrid} label="Overview" items={items} editable onLayoutChange={(d) => { save(d.layouts); }}>
        <section data-aui-item="sales"><h2>Sales</h2></section>
        <section data-aui-item="users"><h2>Active users</h2></section>
      </AuiDashboardGrid>
    </>
  );
}
```

Keep `items` stable (a new array replaces the stored layouts). For a catalog, pass the controller: `<AuiDashboardCatalog grid={grid} label="Widgets" templates={templates} onCatalogAdd={(d) => ...} />` from `@absoluteui/react/dashboard-catalog`, and render a child with `data-aui-item={d.item.id}` in `onCatalogAdd`. See [docs/REACT.md](../../../docs/REACT.md) for events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { DashboardGridLayoutChangeDetail, DashboardItem } from '@absoluteui/components/dashboard-grid';
import { AuiDashboardGrid } from '@absoluteui/vue/dashboard-grid';
import { AuiDashboardCatalog } from '@absoluteui/vue/dashboard-catalog';

const items: DashboardItem[] = [{ id: 'sales', x: 0, y: 0, w: 6, h: 2 }];
const templates = [{ id: 'note', label: 'Note', w: 3, h: 2 }];
const grid = ref<InstanceType<typeof AuiDashboardGrid> | null>(null);
const save = (detail: DashboardGridLayoutChangeDetail) => localStorage.setItem('dashboard', JSON.stringify(detail.layouts));
</script>

<template>
  <AuiDashboardCatalog :grid="grid?.controller ?? null" label="Widgets" :templates="templates" />
  <AuiDashboardGrid ref="grid" label="Overview" :items="items" editable @layout-change="save">
    <section data-aui-item="sales"><h2>Sales</h2></section>
  </AuiDashboardGrid>
</template>
```

`@catalog-add` receives the DOM event (`event.detail` has the template and item; `event.preventDefault()` vetoes); render the new child there. See [docs/VUE.md](../../../docs/VUE.md) for events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that enhance or render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
