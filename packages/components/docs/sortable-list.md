# Sortable List

> Package: `@absoluteui/components/sortable-list` | Styles: `@absoluteui/components/sortable-list/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

A labelled, vertical list that users reorder. Two equivalent input paths:
- Pointer drag through pointer events (mouse, pen, touch), from the handle or, with `dragFrom: 'item'`, from anywhere on the item. HTML5 drag and drop is never used.
- Keyboard on each item's handle button: Space or Enter grabs, arrow keys, Home, and End move, Space or Enter drops, Escape or leaving the handle cancels.

Every step is announced through the assertive live region. The moved item never leaves the DOM (its siblings move around it), so focus and pointer capture survive the reorder. The new order is reported with `aui-change`; persisting it is the consumer's job.

## 2. Anatomy

```text
<div class="aui-sortable-list [aui-sortable-list--disabled] [aui-sortable-list--drag-item]">   (consumer host)
  <ul class="aui-sortable-list__list" aria-label="{label}">
    <li class="aui-sortable-list__item [--grabbed] [--dragging] [--disabled]" data-id="{id}"
        style="--aui-sortable-list-offset (CSSOM, pointer drag only)">
      <button type="button" class="aui-sortable-list__handle" aria-label="Reorder {label}"
              aria-pressed="false|true" aria-describedby="{instructions id}" disabled?>
        <svg class="aui-icon" aria-hidden="true">                    (icon 'menu')
      </button>
      <div class="aui-sortable-list__content">content or label text</div>
    </li>
    ...
  </ul>
  <p class="aui-sortable-list__instructions" id>visually hidden instructions</p>
</div>
```

## 3. When to use

- Letting users set the order of a short list, such as priorities, playlist tracks, or dashboard widgets.
- Ordering that must work with keyboard, pointer, and touch alike.

## 4. When not to use

- Sorting data by a column value: use Data Table sorting.
- Moving items between two lists: drag between lists is not supported; use a transfer-list pattern.
- Grids or horizontal layouts: vertical lists only.
- Very long lists that need scrolling while dragging: there is no auto-scroll; add move-to-position controls with `move()`.
- Choosing one item: use a radio group or listbox.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `list` | `HTMLUListElement` | The `<ul>`. |
| `order` | `string[]` | Item ids in the current DOM order. |
| `isDragging` | `boolean` | An item is grabbed (keyboard) or dragged (pointer). |
| `options` | `Readonly<SortableListOptions>` | Current options. `items` keeps the order last passed in, not the DOM order. |

Options (`SortableListOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | List accessible name. Non-empty after trimming. |
| `items` | `readonly SortableListItem[]` | - (required) | No | `{ id, label, content?, disabled? }` in order. Unique, non-empty, stable ids; non-empty labels. |
| `disabled` | `boolean` | `false` | No | Disable reordering for the whole list. |
| `icons` | `Partial<{ handle: IconRef }>` | - | No | Icon slot overrides. |
| `dragFrom` | `'handle' \| 'item'` | `'handle'` | Yes | Where a pointer drag can start. |

`SortableListItem.label` is the item text (unless `content` is given) and the name used in the handle label and announcements. A `disabled` item cannot be moved, but other items can move past it.

## 6. Methods

| Method | Description |
|---|---|
| `SortableList.create(host, options)` | Validate, then render into `host` (its children are replaced). |
| `move(id, index)` | Move an item to a zero-based index. Cancels an active grab or drag first (silently). No event, no announcement. |
| `update(options)` | Merge, validate, and apply options. Cancels an active grab or drag (silently). Rows and content nodes are kept by id. |
| `destroy()` | Cancel any grab or drag, remove rendering, listeners, drag tracking, and subscriptions, and clear the host's children and component classes. |

## 7. Events

| Event | Detail | Bubbles | Cancelable | When |
|---|---|---|---|---|
| `aui-change` | `{ order, id, from, to }` | Yes | No | Dispatched on `host` after a keyboard or pointer drop that changed the item's position. `order` is the new id order; `from`/`to` are zero-based. |

Not emitted for cancels, drops at the original position, `move()`, or `update()`.

## 8. Slots/content areas

Each item's `content` (a `Node` or text) or, without it, its `label` text, inside `.aui-sortable-list__content`. Content is inserted once per item and re-inserted only when the item's `content` (or its label, without content) changes by identity, so consumer changes to a content node survive re-renders.

## 9. CSS parts/hooks

`aui-sortable-list`, `aui-sortable-list--disabled`, `aui-sortable-list--drag-item`, `aui-sortable-list__list`, `__item`, `__item--grabbed`, `__item--dragging`, `__item--disabled`, `__handle`, `__content`, `__instructions`, and `li[data-id]`. The custom property `--aui-sortable-list-offset` (vertical px offset of the dragged item) is set through the CSSOM. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/sortable-list/tokens.json` (23 tokens, verified in CI). Key tokens: `color-surface`, `color-border`, `radius-md`, `color-selected`, `color-selected-text` (grabbed), `shadow-lg` (dragging), `color-hover`, `control-height-sm` (handle size), `icon-size-md`, `space-*`.

## 11. States

idle, handle hover, handle focus-visible, grabbed (keyboard), dragging (pointer), item disabled, list disabled.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| idle | Space / Enter on a movable item's handle | grabbed (announced "Grabbed ...") |
| grabbed | Arrow / Home / End | grabbed at the new position (announced "... moved to position ...") |
| grabbed | Space / Enter | idle (announced "Dropped ..."; `aui-change` when the position changed) |
| grabbed | Escape, or focus leaves the handle | idle at the original position (announced "Reorder canceled ...") |
| idle | pointerdown on the handle (or item with `dragFrom: 'item'`), then a move of more than 4 px | dragging (announced "Grabbed ...") |
| dragging | the item's middle crosses a sibling's middle | dragging at the new position (announced) |
| dragging | pointer release | idle (announced "Dropped ..."; `aui-change` when the position changed) |
| dragging | Escape, `pointercancel`, lost pointer capture | idle at the original position (announced "Reorder canceled ...") |
| grabbed / dragging | `move()`, `update()`, `destroy()` | idle; the item returns to its original position first (no announcement) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Not grabbed | Moves through handles (disabled ones are skipped) and interactive item content. |
| Space / Enter | Handle of a movable item, nothing grabbed | Grab. |
| Space / Enter | Grabbed item's handle | Drop. |
| ArrowUp / ArrowLeft | Grabbed | One position toward the start; stops at the first. |
| ArrowDown / ArrowRight | Grabbed | One position toward the end; stops at the last. |
| Home / End | Grabbed | First / last position. |
| Escape | Grabbed or pointer drag | Cancel and restore. Consumed before the overlay stack, so an enclosing dialog stays open. |
| Tab / Shift+Tab | Grabbed | Focus leaves the handle; the reorder is canceled. |
| Other keys | Grabbed | Swallowed so they do not scroll or type. |

Keys with Alt, Ctrl, or Meta are ignored. Arrow keys are not mirrored in RTL.

## 14. ARIA contract

- `<ul aria-label="{label}">` with native `listitem` children.
- Handle: native `<button type="button">`, `aria-label` "Reorder {label}", `aria-pressed` `true` while grabbed or dragged, `aria-describedby` -> visually hidden instructions, native `disabled` for disabled items or a disabled list.
- Instructions (English default): "To reorder, press Space or Enter on an item handle, move it with the arrow keys, then press Space or Enter to drop it. Press Escape to cancel."
- Announcements through the shared assertive live region:
  - "Grabbed {label}. Current position {position} of {count}."
  - "{label} moved to position {position} of {count}."
  - "Dropped {label} at position {position} of {count}."
  - "Reorder canceled. {label} returned to position {position} of {count}."
- No `aria-grabbed` / `aria-dropeffect` (deprecated in ARIA 1.1).

## 15. Accessibility notes

- Focus stays on the grabbed handle during a keyboard move because the item element never leaves the DOM.
- Dragging is not required (WCAG 2.5.7): a single-pointer user can activate the handle and use the keys, or the consumer can offer `move()`-based controls.
- The grabbed state is conveyed by `aria-pressed`, a selected background, and a border, not color alone. Forced-colors mode uses `Highlight` / `HighlightText`.
- The live region follows an open modal dialog, so announcements inside dialogs are not lost.
- Messages are registered under `sortableList` (`instructions`, `handle`, `grabbed`, `moved`, `dropped`, `canceled`) and can be localized.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Items fill the list width; content wraps with `overflow-wrap: anywhere`. The handle is a `control-height-sm` square with `touch-action: none`, so touch drags from the handle never scroll the page, while touching item content still scrolls. With `dragFrom: 'item'`, movable items also get `touch-action: none`: the page cannot be scrolled by touching them. During a pointer drag the item is clamped to the list's visible bounds; there is no auto-scroll.

## 17. RTL behavior

Logical properties throughout; the handle sits at the inline start. The list is vertical, so direction does not change reordering: ArrowUp and ArrowLeft always move toward the start of the list in both LTR and RTL.

## 18. Theme behavior

Token-driven item surface, border, and radius; `color-selected`/`color-selected-text` for the grabbed item; `shadow-lg` while following the pointer; `color-hover` on the handle; `color-text-disabled` for disabled handles and `color-text-muted` for disabled item content. Forced-colors mode uses `CanvasText` borders, `Highlight` for the grabbed item, and `GrayText` for disabled handles.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { sortableList: { dragFrom: 'item' } } });
```

Globally configurable: `dragFrom`. Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.handle` (default `menu`), resolved through the global icon provider/registry. The icon is decorative; the handle's name comes from `aria-label`.

## 23. Security behavior

The list label, item labels, announcements, and string content use `textContent`. No HTML parsing. The drag offset is written as a CSS custom property through the CSSOM, so the component is CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. `aui-change` reports the new order; the consumer stores it.

## 25. Performance characteristics

Two listeners on the list (keydown, focusout), one pointer-drag tracker, and one configuration subscription per instance. A keyboard move moves the item by moving its siblings (one DOM move per step). During a pointer drag each move reads the bounding boxes of the list, the item, and the siblings it crosses. Re-renders reuse rows by id and replace the list's children only when the order differs. Budgets in headless Chromium: `SortableList.create` with 500 items under 100 ms; one keyboard move with 500 items under 16 ms.

## 26. Supported data scale

Budgeted with 500 items. Because there is no auto-scroll, pointer reordering is practical only within the visible part of the list; for long lists rely on the keyboard path or `move()` controls. No virtualization.

## 27. Usage examples

```ts
import { SortableList } from '@absoluteui/components/sortable-list';

const host = document.createElement('div');
document.body.append(host);
SortableList.create(host, {
  label: 'Priorities',
  items: [
    { id: 'security', label: 'Security review' },
    { id: 'performance', label: 'Performance' },
    { id: 'docs', label: 'Documentation', disabled: true },
  ],
});
```

More examples, type-checked in CI: `metadata/sortable-list/examples.json`.

## 28. Edge cases

- Dropping at the original position announces "Dropped ..." but emits no `aui-change`.
- A disabled item cannot be grabbed or dragged; other items move past it.
- With `dragFrom: 'item'`, a press on interactive content in the item (`a`, `button`, `input`, `select`, `textarea`, `label`, `[contenteditable]`) does not start a drag.
- A press without movement (under 4 px) is a click, not a drag; the click after a completed drag is suppressed.
- A pointer drag cannot start while a keyboard grab is active.
- Only the primary pointer and, for mouse, the main button start a drag.
- A drop or `move()` also reorders the `items` option (`options.items`), so later re-renders keep the new order. `update({ items })` with an older order restores that order: pass the order from `aui-change` back (frameworks with bound inputs must).
- A re-render that changes the order keeps focus on the focused handle.
- A global configuration change cancels an active grab or drag.
- An empty `items` array renders an empty, labelled list.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SORTABLE_LIST_OPTIONS` | configuration | Blank `label`; `items` not an array; an item that is not an object; empty or duplicate id; blank item label; `content` that is not a `Node` or string; non-boolean `disabled`; `move()` with an unknown id or an out-of-range index. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration value, such as `dragFrom: 'anywhere'`. |

A failed construction leaves nothing behind: the host's children and classes are untouched and no listeners or subscriptions remain. A failed `update()` keeps the previous options and rendering.

## 30. Known limitations

- Vertical lists only.
- No auto-scroll during a pointer drag.
- No drag between lists, no nesting, no multi-select.
- `update({ items })` with a stale order undoes the user's reorder; feed the order from `aui-change` back.
- Pointer drags announce every position change, which can be verbose.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML5 drag and drop (`draggable`, `dataTransfer`), including dropping files or external data.
- Horizontal or grid layouts.
- Dragging between lists or into nested lists.
- HTML strings as labels or content: pass a `Node` instead.

## 32. TypeScript definitions

```ts
type SortableListDragFrom = 'handle' | 'item';
interface SortableListConfig { dragFrom: SortableListDragFrom }
interface SortableListItem { id: string; label: string; content?: Node | string; disabled?: boolean }
interface SortableListIcons { handle: IconRef }
interface SortableListOptions extends Partial<SortableListConfig> {
  label: string;
  items: readonly SortableListItem[];
  disabled?: boolean;
  icons?: Partial<SortableListIcons>;
}
interface SortableListChangeDetail { order: string[]; id: string; from: number; to: number }
```

## 33. Vanilla JS example

```ts
import { SortableList, type SortableListChangeDetail } from '@absoluteui/components/sortable-list';
import '@absoluteui/components/sortable-list/style.css';

const host = document.querySelector<HTMLElement>('#priorities');
if (host) {
  SortableList.create(host, {
    label: 'Priorities',
    items: [
      { id: 'security', label: 'Security review' },
      { id: 'performance', label: 'Performance' },
    ],
  });
  host.addEventListener('aui-change', (event) => {
    const { order } = (event as CustomEvent<SortableListChangeDetail>).detail;
    // persist `order`
  });
}
```

## 34. Angular example

`<aui-sortable-list>` is generated; inputs mirror the options; `(changed)` emits the `SortableListChangeDetail`. Assign the new order back to `items` so re-renders keep it.

```ts
import { Component } from '@angular/core';
import type { SortableListChangeDetail, SortableListItem } from '@absoluteui/components/sortable-list';
import { AuiSortableList } from '@absoluteui/angular/sortable-list';

@Component({
  selector: 'app-priorities',
  imports: [AuiSortableList],
  template: `<aui-sortable-list label="Priorities" [items]="items" (changed)="save($event.order)"></aui-sortable-list>`,
})
export class PrioritiesComponent {
  items: SortableListItem[] = [
    { id: 'security', label: 'Security review' },
    { id: 'performance', label: 'Performance' },
    { id: 'docs', label: 'Documentation' },
  ];

  save(order: SortableListChangeDetail['order']): void {
    const byId = new Map(this.items.map((item) => [item.id, item] as const));
    this.items = order.flatMap((id) => byId.get(id) ?? []);
    // persist `order`
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
